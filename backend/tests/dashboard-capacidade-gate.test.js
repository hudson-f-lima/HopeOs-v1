const assert = require('node:assert/strict');
const test = require('node:test');
const { computeCockpit } = require('../src/engines/insights/cockpit');

const horario = { ativo: true, inicio: '09:00', fim: '10:00' };
const profissional = { id: 'p', nome: 'Ana' };
const empresa = { slot_padrao: 30, horario_por_dia: { seg: horario, ter: horario, qui: horario } };
const agendamento = (id, data, horario, duracao_min, status = 'concluido') =>
  ({ id, data, horario, duracao_min, status, profissional_id: profissional.id });

test('Cockpit entrega ocupação realizada, preenchimento realizado e compromissos em campos distintos', () => {
  const quintas = ['2026-10-29', '2026-11-05', '2026-11-12', '2026-11-19'];
  const agendamentos = quintas.flatMap(data => [
    agendamento(data + 'a', data, '09:00', 30),
    agendamento(data + 'b', data, '09:00', 30),
    agendamento(data + 'c', data, '18:00', 30),
    agendamento(data + 'd', data, '09:30', 15, 'confirmado')
  ]);
  agendamentos.push(agendamento('futuro', '2026-11-26', '09:00', 60, 'confirmado'));
  const { ocupacao } = computeCockpit({ hoje: '2026-11-20', profissionais: [profissional], empresa, agendamentos });
  assert.deepEqual(ocupacao.janela, { de: '2026-10-23', ate: '2026-11-19' });

  const quinta = ocupacao.porDia[4];
  assert.equal(quinta.minutosRealizados, 360);
  assert.equal(quinta.minutosDisponiveis, 240);
  assert.equal(quinta.ocupacaoRealizadaPct, 150);
  assert.equal(quinta.preenchimentoGradePct, 50);
  assert.equal(quinta.ocupacaoPct, 75, 'campo legado inclui as reservas');
  assert.equal(quinta.minutosForaDaEscala, 120);
  assert.equal(quinta.minutosSobrepostos, 120);
  assert.equal(quinta.coberturaParcial, false);
  assert.equal(quinta.proximaDataLivre, null, 'a reserva futura ocupa toda a escala');

  const segunda = ocupacao.porDia[1];
  assert.equal(segunda.ocupacaoRealizadaPct, 0);
  assert.equal(segunda.preenchimentoGradePct, 0);
  assert.equal(segunda.proximaDataLivre, '2026-11-23');
});

test('Cobertura parcial e produção em dia sem escala preservam a distinção entre falta de base e zero', () => {
  const { ocupacao } = computeCockpit({
    hoje: '2026-11-20', profissionais: [profissional], empresa,
    agendamentos: [
      agendamento('terca-sem-hora', '2026-11-17', null, 30),
      agendamento('quarta-fora-da-escala', '2026-11-18', '09:00', 30)
    ]
  });
  const terca = ocupacao.porDia[2];
  assert.equal(terca.coberturaParcial, true);
  assert.equal(terca.minutosSemHorario, 30);
  assert.equal(terca.minutosRealizados, 30);
  assert.equal(terca.ocupacaoRealizadaPct, 12.5);
  const quarta = ocupacao.porDia[3];
  assert.equal(quarta.minutosRealizados, 30);
  assert.equal(quarta.minutosDisponiveis, 0);
  assert.equal(quarta.ocupacaoRealizadaPct, null);
  assert.equal(quarta.preenchimentoGradePct, null);
  assert.equal(quarta.minutosForaDaEscala, 30);
  assert.equal(quarta.proximaDataLivre, null);
});
