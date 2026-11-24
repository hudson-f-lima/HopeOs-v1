// Grade da agenda, previsão e oportunidades. Sem relógio do processo nem I/O externo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCockpit } = require('../src/engines/insights/cockpit');
const { analisarGrade, totaisGrade, previsaoDaGrade, janelasDaGrade } = require('../src/engines/insights/occupancy');

const quinta = '2026-11-19';
const profissional = { id: 'p', nome: 'Ana' };
const janela = (inicio, fim) => ({ ativo: true, inicio, fim });
const empresa = { slot_padrao: 15, horario_por_dia: { qui: janela('09:00', '10:00') } };
const ag = (id, data, horario, duracao_min, status) => ({ id, data, horario, duracao_min, status, profissional_id: 'p' });

test('Quatro semanas e equipe mostram produção acima de 100%, mas a vaga vem das lacunas da grade', () => {
  const datas = ['2026-10-29', '2026-11-05', '2026-11-12', quinta];
  const agendamentos = datas.flatMap(d => [
    ag(d + 'a', d, '09:00', 30, 'concluido'), ag(d + 'b', d, '09:00', 30, 'fechado'),
    ag(d + 'c', d, '18:00', 30, 'concluido'), ag(d + 'd', d, '09:30', 15, 'confirmado'),
    ag(d + 'e', d, '09:00', 45, 'no_show')
  ]);
  const r = computeCockpit({ hoje: '2026-11-20', profissionais: [profissional], agendamentos, empresa,
    listaEspera: [{ profissional_id: 'p', status: 'aguardando' }] });
  const qui = r.ocupacao.porDia[4];
  assert.deepEqual([r.ocupacao.ocupacaoRealizadaPct, qui.ocupacaoRealizadaPct, r.equipe[0].ocupacaoRealizadaPct], [150, 150, 150]);
  assert.deepEqual([qui.ocupacaoPct, qui.minutosOciosos, r.simulador.minutosOciosos28d, r.simulador.minutosFalta30d], [75, 60, 60, 0]);
  assert.equal(r.alertas.some(a => a.id.startsWith('profissional_saturado')), false);
});

test('A ação de horário livre exige uma janela reservável futura no mesmo dia e na mesma faixa', () => {
  const entrada = { hoje: '2026-11-20', profissionais: [profissional],
    empresa: { slot_padrao: 30, horario_por_dia: { qui: janela('12:00', '14:00') } }, agendamentos: [] };
  const alerta = e => computeCockpit(e).alertas.find(a => a.id === 'gargalo_ocupacao');
  const a = alerta(entrada);
  assert.equal(a.acao.data, '2026-11-26');
  assert.match(a.porque, /1 h livres por semana/); // Só 13–14h, não as duas horas do dia.
  entrada.agendamentos.push(ag('fut', '2026-11-26', '13:10', 40, 'agendado'));
  assert.equal(alerta(entrada), undefined); // Restam dois trechos de 10 min à tarde.
});

test('Hoje a previsão recorta pelo relógio; a higienização e o slot mínimo delimitam janelas reserváveis', () => {
  const dados = {
    profissionais: [profissional], empresa: { ...empresa, buffer_min: 5, horario_por_dia: { qui: janela('09:00', '12:00') } },
    agendamentos: [
      ag('ontem', '2026-11-18', '23:45', 600, 'confirmado'), // Termina 09:45 de hoje.
      ag('ja', quinta, '09:40', 15, 'em_atendimento'), ag('fut', quinta, '10:40:00', 30, 'agendado'),
      ag('feito', quinta, '11:30', 15, 'fechado'), ag('cancelado', quinta, '11:45', 15, 'cancelado')
    ]
  };
  const linhas = analisarGrade(dados, quinta, quinta, { hoje: quinta, minutoAtual: 10 * 60 + 1 });
  assert.deepEqual(previsaoDaGrade(linhas, quinta, 601), {
    minutosPrevistos: 30, minutosDisponiveisPrevistos: 119, ocupacaoPrevistaPct: 25.2
  });
  assert.equal(totaisGrade(linhas).minutosGradeOcupada, 100); // 55 + 30 + 15.
  assert.deepEqual(janelasDaGrade(linhas).map(j => [j.inicio, j.fim]), [['10:15', '10:35']]);
});

test('As exceções coincidentes e a pausa retiram minutos uma vez; dado incompleto não gera vaga', () => {
  const p = { ...profissional, escala_publicada_em: '2026-11-01' };
  const semanal = [null, 'p'].flatMap(profissional_id => [['09:00', '11:00'], ['11:30', '13:00']]
    .map(([inicio, fim]) => ({ profissional_id, dia_semana: 4, inicio, fim })));
  const excecoes = [['p', 'bloqueio', '09:30', '10:00'], [null, 'fechamento', '09:45', '10:15']]
    .map(([profissional_id, tipo, inicio, fim]) => ({ profissional_id, tipo, inicio, fim, data_inicio: quinta, data_fim: quinta }));
  const dados = { profissionais: [p], empresa: { slot_padrao: 15, disponibilidade: { semanal, excecoes } },
    agendamentos: [ag('a', quinta, '09:00', 120, 'confirmado')] };
  const linhas = analisarGrade(dados, quinta, quinta);
  assert.deepEqual(totaisGrade(linhas), { minutosDisponiveis: 165, minutosGradeOcupada: 75, preenchimentoGradePct: 45.5, minutosLivres: 90 });
  assert.deepEqual(janelasDaGrade(linhas).map(j => [j.inicio, j.fim]), [['11:30', '13:00']]);
  dados.agendamentos.push(ag('incerto', quinta, null, 20, 'confirmado'));
  assert.deepEqual(janelasDaGrade(analisarGrade(dados, quinta, quinta)), []);
});

test('Semana futura só lê agenda e escala, inclusive uma reserva longa iniciada antes da véspera', async () => {
  const { InsightsService } = require('../src/services/InsightsService');
  const service = Object.create(InsightsService.prototype);
  const consultadas = [];
  service.repo = {
    empresaId: 'empresa',
    empresaComDisponibilidade: async () => empresa,
    list: async (tabela, filtro, opcoes) => {
      consultadas.push(tabela);
      if (tabela === 'profissionais') return [profissional];
      assert.equal(tabela, 'agendamentos');
      return opcoes.duracaoMaiorQue ? [ag('longo', '2026-11-17', '23:00', 2130, 'confirmado')] : [];
    }
  };
  // A reserva atravessa duas meias-noites. Quinta-feira termina às 10:30.
  const resumo = await service.loadOccupancyInsights(quinta, quinta, '2026-11-16', 600);
  assert.equal(resumo.realizada, null);
  assert.deepEqual([resumo.minutosPrevistos, resumo.minutosDisponiveisPrevistos, resumo.ocupacaoPrevistaPct], [60, 60, 100]);
  assert.deepEqual(resumo.buracos, []);
  assert.deepEqual(new Set(consultadas), new Set(['agendamentos', 'profissionais']));
});
