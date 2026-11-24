const test = require('node:test');
const assert = require('node:assert/strict');
const { ocupacaoDoPeriodo, ocupacaoPorProfissionalDia, somarOcupacao } = require('../src/engines/insights/metricasPeriodo');

const SEG = '2026-11-23';
const TER = '2026-11-24';
const profissional = id => ({ id, ativo: true, escala_publicada_em: '2026-01-01T00:00:00Z' });
const periodo = (profissional_id, inicio, fim, dia_semana = 1) => ({ profissional_id, inicio, fim, dia_semana });
const grade = { disponibilidade: { semanal: [periodo(null, '09:00', '10:00'), periodo('p', '09:00', '10:00')] } };

function agenda(horario, duracao_min, outros = {}) {
  return { data: SEG, profissional_id: 'p', servico_id: 's', horario, duracao_min, status: 'concluido', ...outros };
}

function dados(agenda, extras = {}) {
  return {
    profissionais: [profissional('p')], empresa: grade, comandos: [], comandoItens: [],
    agendamentos: agenda.map((a, i) => ({ id: 'a' + i, ...a })), ...extras
  };
}

for (const [cenario, horarios, esperado] of [
  ['cruza abertura', [['08:45', 30]], [50, 25, 15, 0, 15, 0]],
  ['cruza fechamento', [['09:45', 30]], [50, 25, 15, 0, 0, 15]],
  ['inteiro depois', [['10:15', 30]], [50, 0, 30, 0, 0, 30]],
  ['dois encaixes produzem 150%', [['09:00', 45], ['09:30', 45]], [150, 100, 15, 15, 0, 15]],
  ['simultaneidade com cadeira ociosa', [['09:00', 15], ['09:05', 15]], [50, 33.3, 0, 10, 0, 0]],
  ['simultaneidade fora do expediente', [['09:45', 30], ['10:00', 30]], [100, 25, 30, 15, 0, 30]],
  ['serviços consecutivos', [['09:00', 30], ['09:30', 30]], [100, 100, 0, 0, 0, 0]],
  ['três simultâneos contam a mesma faixa uma vez', [['09:00', 15], ['09:00', 15], ['09:00', 15]], [75, 25, 0, 15, 0, 0]],
  ['capacidade sem atendimento', [], [0, 0, 0, 0, 0, 0]]
]) {
  test(cenario, () => {
    const r = ocupacaoDoPeriodo(dados(horarios.map(([h, d]) => agenda(h, d))), SEG, SEG);
    assert.deepEqual([r.ocupacaoRealizadaPct, r.preenchimentoGradePct, r.minutosForaDaEscala, r.minutosSobrepostos,
      r.minutosAntesExpediente, r.minutosAposExpediente], esperado);
    assert.equal(r.ocupacaoPct, r.preenchimentoGradePct);
    assert.equal(r.minutosOcupados, r.minutosPreenchidos);
    assert.equal(r.coberturaParcial, false);
  });
}

test('interseção da unidade com o profissional inclui pausas entre turnos', () => {
  const empresa = { disponibilidade: { semanal: [
    periodo(null, '10:00', '14:00'), periodo('p', '11:00', '12:00'), periodo('p', '12:30', '13:00')
  ] } };
  const r = ocupacaoDoPeriodo(dados([agenda('11:45', 30)], { empresa }), SEG, SEG);
  assert.deepEqual([r.minutosDisponiveis, r.ocupacaoRealizadaPct, r.preenchimentoGradePct, r.minutosForaDaEscala,
    r.minutosEmPausasBloqueios, r.minutosSobrepostos], [90, 33.3, 16.7, 15, 15, 0]);
});

test('grade excepcional, blocos da unidade e do profissional sobrepostos nas bordas do turno', () => {
  const excecao = (profissional_id, tipo, inicio, fim) => ({ profissional_id, tipo, inicio, fim, data_inicio: SEG, data_fim: SEG });
  const empresa = { disponibilidade: { semanal: grade.disponibilidade.semanal, excecoes: [
    excecao(null, 'horario', '11:00', '14:00'), excecao('p', 'horario', '11:30', '13:00'),
    excecao('p', 'horario', '12:45', '13:30'), excecao('p', 'bloqueio', '11:30', '11:50'),
    excecao(null, 'fechamento', '11:40', '12:00'), excecao('p', 'bloqueio', '13:15', '13:30')
  ] } };
  const r = ocupacaoDoPeriodo(dados([agenda('11:20', 140)], { empresa }), SEG, SEG);
  assert.deepEqual([r.minutosDisponiveis, r.minutosRealizados, r.minutosPreenchidos,
    r.minutosAntesExpediente, r.minutosAposExpediente, r.minutosEmPausasBloqueios], [75, 140, 75, 10, 10, 45]);
  empresa.disponibilidade.excecoes.push(excecao('p', 'bloqueio', '11:30', '13:30'));
  const bloqueado = ocupacaoDoPeriodo(dados([agenda('12:00', 30)], { empresa }), SEG, SEG);
  assert.deepEqual([bloqueado.ocupacaoRealizadaPct, bloqueado.minutosEmPausasBloqueios, bloqueado.minutosSemExpediente], [null, 30, 0]);
});

test('domingo fechado e ausência integral separam falta de escala de zero atendimento', () => {
  const empresa = { disponibilidade: { semanal: grade.disponibilidade.semanal, excecoes: [
    { profissional_id: 'p', tipo: 'ausencia', data_inicio: SEG, data_fim: SEG }
  ] } };
  const r = ocupacaoDoPeriodo(dados([agenda('09:00', 30)], { empresa }), SEG, SEG);
  assert.deepEqual([r.minutosRealizados, r.ocupacaoRealizadaPct, r.preenchimentoGradePct, r.minutosSemExpediente,
    r.minutosForaDaEscala, r.minutosEmPausasBloqueios], [30, null, null, 30, 30, 0]);
});

test('dois profissionais e um ocioso pesam pela capacidade e não geram simultaneidade', () => {
  const profissionais = ['p', 'q', 'r'].map(profissional);
  const empresa = { disponibilidade: { semanal: [...grade.disponibilidade.semanal,
    periodo('q', '09:00', '10:00'), periodo('r', '09:00', '09:30')] } };
  const base = dados([agenda('09:00', 30), agenda('09:00', 30, { profissional_id: 'q' })], { profissionais, empresa });
  const linhas = ocupacaoPorProfissionalDia(base, SEG, SEG);
  const dupla = somarOcupacao(linhas.filter(l => l.profissionalId !== 'r'));
  const equipe = somarOcupacao(linhas);
  assert.deepEqual([dupla.ocupacaoRealizadaPct, dupla.preenchimentoGradePct, dupla.minutosSobrepostos], [50, 50, 0]);
  assert.deepEqual([equipe.minutosDisponiveis, equipe.ocupacaoRealizadaPct, equipe.preenchimentoGradePct], [150, 40, 40]);
});

test('virada no relógio local recorta ambos os extremos e preserva simultaneidade após meia-noite', () => {
  const empresa = { disponibilidade: { semanal: [periodo(null, '00:00', '01:00', 2), periodo('p', '00:00', '01:00', 2)] } };
  const entrada = dados([agenda('23:45', 45), agenda('00:15', 30, { data: TER }), agenda('23:50', 45, { data: TER })], { empresa });
  const r = ocupacaoDoPeriodo(entrada, TER, TER);
  assert.deepEqual([r.minutosRealizados, r.minutosPreenchidos, r.minutosSobrepostos, r.minutosAposExpediente], [70, 45, 15, 10]);
  const anterior = ocupacaoDoPeriodo(entrada, SEG, SEG);
  assert.deepEqual([anterior.minutosRealizados, anterior.minutosSemExpediente], [15, 15]);
});

test('legado desconta almoço, e dados incompletos nunca criam horário ou duração', () => {
  const empresa = { horario_por_dia: { seg: { ativo: true, inicio: '11:00', fim: '13:00' } },
    intervalo_almoco: true, almoco_inicio: '12:00', almoco_fim: '12:30' };
  const base = dados([agenda('11:45', 30), agenda(null, 45), agenda('12:00', null),
    agenda('09:15', null, { data: TER })], { empresa });
  const r = ocupacaoDoPeriodo(base, SEG, SEG);
  assert.deepEqual([r.minutosDisponiveis, r.minutosRealizados, r.minutosPreenchidos, r.minutosEmPausasBloqueios,
    r.minutosSemHorario, r.servicosSemDuracao, r.coberturaParcial], [90, 75, 15, 15, 45, 1, true]);
});

test('inativação preserva a execução e a escala estimada só nas datas comprovadas', () => {
  const profissionais = [{ ...profissional('p'), ativo: false }];
  const empresa = { disponibilidade: { semanal: [...grade.disponibilidade.semanal,
    periodo(null, '09:00', '10:00', 2), periodo('p', '09:00', '10:00', 2)] } };
  const r = ocupacaoDoPeriodo(dados([agenda('09:00', 30)], { profissionais, empresa }), SEG, TER);
  assert.deepEqual([r.minutosRealizados, r.minutosDisponiveis, r.minutosPreenchidos, r.capacidadeHistoricaEstimada], [30, 60, 30, true]);
});

test('reservas, faltas e cancelamentos não contam como executados', () => {
  const estados = ['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'no_show', 'cancelado', 'reagendado'];
  const r = ocupacaoDoPeriodo(dados(estados.map(status => agenda('09:00', 30, { status }))), SEG, SEG);
  assert.deepEqual([r.minutosRealizados, r.minutosPreenchidos, r.minutosSobrepostos, r.minutosSemHorario], [0, 0, 0, 0]);
});

test('checkout reenviado com serviço grátis conserva uma execução e a duração gravada do item', () => {
  const entrada = dados([agenda('09:10', 20, { id: 'a' })]);
  const comando = { id: 'c', data: SEG, status: 'fechado', agendamento_checkout: 'a', itens_liquidos_centavos: 0 };
  const item = { id: 'i', comando_id: 'c', tipo: 'servico', servico_id: 's', profissional_id: 'p', duracao_min: 25, quantidade: 1 };
  entrada.comandos = [comando, comando];
  entrada.comandoItens = [item, item];
  entrada.estornos = [{ data: TER, comando_id: 'c', tipo: 'total' }];
  const r = ocupacaoDoPeriodo(entrada, SEG, SEG);
  assert.deepEqual([r.minutosRealizados, r.minutosPreenchidos, r.minutosSobrepostos, r.minutosDuracaoPrevista, r.pendenciasVinculo], [25, 25, 0, 0, 0]);
});

test('avulso sem início comprovado conserva produção, e produtos não alteram minutos', () => {
  const entrada = dados([]);
  entrada.comandos = [{ id: 'c', status: 'fechado', data: SEG, hora: '09:00' }];
  entrada.comandoItens = [
    { id: 'i', comando_id: 'c', tipo: 'servico', servico_id: 's', profissional_id: 'p', duracao_min: 25, quantidade: 1 },
    { id: 'x', comando_id: 'c', tipo: 'produto', profissional_id: 'p', duracao_min: 50, quantidade: 2 }
  ];
  const r = ocupacaoDoPeriodo(entrada, SEG, SEG);
  assert.deepEqual([r.minutosRealizados, r.minutosPreenchidos, r.minutosSobrepostos, r.minutosSemHorario, r.coberturaParcial], [25, 0, 0, 25, true]);
});
