const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { eventosDeProducao, CAMPOS_AGENDA_PRODUCAO, CAMPOS_COMANDA_PRODUCAO } = require('../src/engines/insights/eventosProducao');
const { ocupacaoDoPeriodo } = require('../src/engines/insights/metricasPeriodo');
const { carregarVinculosDeProducao } = require('../src/repositories/producaoPeriodo');
const { resolveCheckoutInput } = require('../src/engines/CheckoutInputResolver');
const { previewCheckout } = require('../src/engines/FinanceEngine');
const { comandoIdDoAgendamento } = require('../src/services/CheckoutReplay');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { installMemoryBackend } = require('../src/dev/memoryBackend');

const E = randomUUID(), A = randomUUID(), P = randomUUID(), S = randomUUID(), C = randomUUID();
const dia = '2026-11-03';
const agenda = (extra = {}) => ({ id: A, empresa_id: E, data: dia, horario: '09:00:00', duracao_min: 20,
  cliente_id: C, servico_id: S, profissional_id: P, status: 'concluido', ...extra });
const comanda = (agendamentoId, extra = {}) => ({ id: 'v', empresa_id: E, data: dia, hora: '11:45', status: 'fechado',
  cliente_id: C, snapshot: { request: { raw: { agendamentoId } } }, ...extra });
const item = (id = 'i', extra = {}) => ({ id, comando_id: 'v', tipo: 'servico', profissional_id: P, servico_id: S, duracao_min: 35, ...extra });
const eventos = (agendamentos, comandos, comandoItens, extra = {}) => eventosDeProducao({ agendamentos, comandos, comandoItens, ...extra });

test('checkout, replay, preço zero e duração específica do profissional, sem multiplicação por quantidade', async () => {
  const ag = agenda();
  const db = installMemoryBackend({ agendamentos: [ag] });
  const repo = Object.assign(Object.create(SupabaseRepository.prototype), { empresaId: E });
  const payload = { data: dia, clienteId: C, agendamentoId: A, id: comandoIdDoAgendamento(E, A), idempotencyKey: 'mesma-intencao',
    itens: [{ tipo: 'servico', servicoId: S, profissionalId: P, quantidade: 4 }], payments: [] };
  const resolved = resolveCheckoutInput({ payload, servicos: [{ id: S, valor_centavos: 0, duracao_min: 20 }],
    profissionais: [{ id: P, overrides: { [S]: { duracao_min: 35 } } }], formasPagamento: [] });
  const preview = previewCheckout(resolved);
  await repo.saveCheckoutClose({ payload, resolved, preview });
  assert.equal((await repo.saveCheckoutClose({ payload, resolved, preview })).idempotent, true);
  assert.deepEqual(db.comando_itens.map(i => [i.quantidade, i.duracao_min]), [[1, 35]]);
  const r = eventos([ag, ag], db.comandos.concat(db.comandos), db.comando_itens.concat(db.comando_itens),
    { estornos: [{ comando_id: payload.id, tipo: 'total' }] });
  assert.deepEqual(r.eventos, [{ data: dia, profissionalId: P, horario: '09:00:00', duracaoMin: 35, duracaoPrevista: false }]);
  assert.equal(r.pendenciasVinculo.length, 0);
  const legado = eventos([], [comanda(null)], [item('historico', { quantidade: 4 })]);
  assert.equal(legado.eventos[0].duracaoMin, 35);
});

test('etapas, extras, cortesia avulsa, UUID estável e registros de produto não alteram a identidade', () => {
  const id = comandoIdDoAgendamento(E, A), outro = randomUUID(), servicoExtra = randomUUID();
  const r = eventos([agenda(), agenda({ id: outro, horario: '09:40:00', profissional_id: 'p2' })], [
    comanda(undefined, { id, snapshot: {} }), comanda(' ' + outro.toUpperCase() + ' ', { id: 'v2' }), comanda(null)
  ], [item('base', { comando_id: id }), item('extra', { comando_id: id, servico_id: servicoExtra, duracao_min: 12 }),
    item('etapa', { comando_id: 'v2', profissional_id: 'p2', duracao_min: 30 }), item('avulsa', { duracao_min: 8 }),
    item('produto', { tipo: 'produto', duracao_min: 90 })]);
  assert.deepEqual(r.eventos.map(e => [e.duracaoMin, e.horario]).sort((a,b) => a[0]-b[0]),
    [[8, null], [12, null], [30, '09:40:00'], [35, '09:00:00']]);
  assert.equal(r.pendenciasVinculo.length, 0);
});

test('estados pendentes, falta e cancelamento não viram produção; duração e executor ausentes ficam explícitos', () => {
  const excluidos = ['agendado', 'aguardando', 'confirmado', 'em_atendimento', 'no_show', 'cancelado', 'reagendado'];
  const r = eventos([agenda({ duracao_min: 0 }), ...excluidos.map(status => agenda({ id: status, status }))],
    [comanda(null), comanda(null, { id: 'aberta', status: 'aberto' }), comanda(null, { id: 'ignorada', status: null })],
    [item('sem-executor', { profissional_id: null }), item('sem-duracao', { duracao_min: null }), item('indefinida', { comando_id: 'ignorada' }),
      item('reservada', { comando_id: 'aberta' })]);
  assert.deepEqual(r.eventos, []);
  assert.equal(r.semDuracao.length, 2);
  assert.equal(r.pendenciasVinculo.length, 1);
});

test('vínculos ambíguos preservam execuções comprovadas sem emprestar uma hora arbitrária', () => {
  const recibo = comanda(A);
  const duplicada = eventos([agenda()], [recibo], [item(), item('segunda', { duracao_min: 22 })]);
  assert.deepEqual(duplicada.eventos.map(e => [e.duracaoMin, e.horario]), [[35, null], [22, null]]);
  assert.equal(duplicada.pendenciasVinculo.length, 1);
  for (const r of [
    eventos([agenda()], [recibo, comanda(A, { id: 'outro' })], [item(), item('segunda', { comando_id: 'outro' })]),
    eventos([agenda()], [recibo], [item('sem-servico', { servico_id: null })]),
    eventos([agenda()], [recibo], [item('sem-executor', { profissional_id: null })]),
    eventos([agenda()], [comanda(undefined)], [item()])
  ]) {
    assert.deepEqual(r.eventos.map(e => [e.duracaoMin, e.horario]), [[20, '09:00:00']]);
    assert.equal(r.pendenciasVinculo.length, 1);
  }
  // Mesmo dia e cliente, serviço diferente: duas fontes válidas e independentes.
  const distintas = eventos([agenda()], [comanda(undefined)], [item('diferente', { servico_id: 'outro' })]);
  assert.equal(distintas.eventos.length, 2);
  assert.equal(distintas.pendenciasVinculo.length, 0);
});

test('bordas da janela, fechamento tardio, linha avulsa explícita, dados antigos e isolamento de empresa', async () => {
  const anterior = randomUUID(), remoto = randomUUID(), longo = randomUUID(), externa = randomUUID();
  const db = installMemoryBackend({ agendamentos: [
    agenda({ id: anterior, data: '2026-11-02', horario: '23:50', duracao_min: 15 }),
    agenda({ id: remoto, data: '2025-01-01' }),
    agenda({ id: longo, data: '2026-11-01', horario: '23:59', duracao_min: 1451 }),
    agenda({ id: externa, empresa_id: randomUUID() })
  ], comandos: [
    comanda(' ' + anterior.toUpperCase() + ' ', { data: '2026-11-05' }), comanda(remoto, { id: 'antiga' }),
    comanda(null, { id: 'avulsa' }), comanda(undefined, { id: 'legada' })
  ], comando_itens: [
    item('tardio'), item('antigo', { comando_id: 'antiga' }), item('avulso', { comando_id: 'avulsa', duracao_min: 15 })
  ] });
  const repo = Object.assign(Object.create(SupabaseRepository.prototype), { empresaId: E }), filtro = { empresa_id: E }, janela = { inicio: '2026-11-02', fim: dia };
  const as = await repo.list('agendamentos', filtro, { ...janela, campos: CAMPOS_AGENDA_PRODUCAO });
  const cs = await repo.list('comandos', filtro, { ...janela, campos: CAMPOS_COMANDA_PRODUCAO });
  assert.equal(cs.find(c => c.id === 'avulsa').agendamento_checkout, 'null');
  assert.equal(cs.find(c => c.id === 'legada').agendamento_checkout, null);
  const fontes = await carregarVinculosDeProducao(repo, as, cs, janela.inicio, dia);
  assert.deepEqual(new Set(fontes.agendamentos.map(a => a.id)), new Set([anterior, remoto, longo]));
  const r = ocupacaoDoPeriodo({ ...fontes, comandoItens: db.comando_itens }, dia, dia);
  assert.deepEqual([r.minutosRealizados, r.minutosForaDaEscala, r.minutosSemHorario], [50, 25, 15]);
  // 25 min do atendimento da véspera, 10 do prolongado, 15 avulsos; os dois primeiros se sobrepõem.
  assert.equal(r.minutosSobrepostos, 10);
});
