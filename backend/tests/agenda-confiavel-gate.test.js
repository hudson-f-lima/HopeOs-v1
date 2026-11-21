// Agenda confiável (D-055). Motor puro e rotas (HTTP real; banco e identidade em memória).
// "Agora": 2026-11-10 09:00 em São Paulo; dia 2026-11-11, Ana 09:00–18:00, grade de 15 min.
//   C01 multisserviço: sequência sem espera que a grade antiga perdia (09:15) aparece; busca medida;
//   C02 busca limitada: no limite, para e diz que parou (truncada);
//   C03 preferência: o escolhido não cabe → alternativas marcadas, sem trocar sozinho;
//   C04 ordem configurável (tempo total, aproveitamento, mais cedo) e rota valida a ordem;
//   C05 espera: dois agendamentos AO MESMO TEMPO com o mesmo pedido → só um grava (o outro 409);
//   C06 espera: gravação falha (horário ocupado) → o pedido volta para a espera, nada reservado;
//   C07 espera: serviço trocado no formulário → vínculo recusado, pedido intacto;
//   C08 espera: profissional sem vínculo (o salão tem vínculos) não é compatível (regra única);
//   C09 escala muda durante a reserva (bloqueio entra entre a conferência e a gravação) → 409,
//       nada fica reservado e o histórico guarda o motivo.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-confiavel-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const publico = require('../src/routes/publicBooking');
const S = require('../src/engines/SlotEngine');
const E = require('../src/engines/ListaEsperaEngine');
const { app } = require('../src/app');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');

const AGORA = new Date('2026-11-10T12:00:00Z');
const DIA = '2026-11-11';
const A = env.DEFAULT_EMPRESA_ID;
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const QUIMICA = 'b0000000-0000-4000-8000-0000000000a2';
const MANICURE = 'b0000000-0000-4000-8000-0000000000a3';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BETO = 'a0000000-0000-4000-8000-0000000000a2';
const CAIO = 'a0000000-0000-4000-8000-0000000000a3'; // sem vínculos
const CLI = ['d0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-0000000000a3',
  'd0000000-0000-4000-8000-0000000000a4', 'd0000000-0000-4000-8000-0000000000a5', 'd0000000-0000-4000-8000-0000000000a6'];
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF = 'c0000000-0000-4000-8000-0000000000a3';
const W = n => `e0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };
setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROF].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: PROF, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.prof.s': PROF };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const espera = (n, extra) => ({ id: W(n), empresa_id: A, cliente_id: CLI[n - 1], servico_id: CORTE, profissional_id: null, data_preferencia: null, status: 'aguardando', created_at: `2026-11-0${n}T10:00:00Z`, ...extra });
const db = installMemoryBackend({
  empresas: [{ id: A, nome: 'Salão', horario_por_dia: semana, slot_padrao: 15, buffer_min: 0, online_slug: 'salao-p', online_ativo: true,
    online_antecedencia_min: 0, online_janela_dias: 30, online_cancelamento_prazo_min: 120, online_max_futuros: 5, razao_social: 'P Ltda', cnpj: '11222333000181', privacidade_contato: 'p@t' }],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true, online: true },
    { id: QUIMICA, empresa_id: A, nome: 'Química', valor_centavos: 20000, duracao_min: 60, ativo: true },
    { id: MANICURE, empresa_id: A, nome: 'Manicure', valor_centavos: 4000, duracao_min: 30, ativo: true }
  ],
  profissionais: [{ id: ANA, empresa_id: A, nome: 'Ana', ativo: true, horario: semana, overrides: {}, escala_publicada_em: '2026-11-01T00:00:00Z' }, { id: BETO, empresa_id: A, nome: 'Beto', ativo: true, horario: semana, overrides: {}, escala_publicada_em: '2026-11-01T00:00:00Z' }, { id: CAIO, empresa_id: A, nome: 'Caio', ativo: true, horario: semana, overrides: {}, escala_publicada_em: '2026-11-01T00:00:00Z' }],
  profissional_servicos: [{ empresa_id: A, profissional_id: ANA, servico_id: CORTE }, { empresa_id: A, profissional_id: ANA, servico_id: QUIMICA },
    { empresa_id: A, profissional_id: BETO, servico_id: CORTE }, { empresa_id: A, profissional_id: BETO, servico_id: MANICURE }],
  clientes: CLI.map((id, i) => ({ id, empresa_id: A, nome: `Cliente ${i + 1}`, ativo: true })),
  agendamentos: [
    { id: '90000000-0000-4000-8000-0000000000a1', empresa_id: A, cliente_id: CLI[5], servico_id: CORTE, profissional_id: ANA, data: DIA, horario: '09:00:00', duracao_min: 30, status: 'agendado' },
    { id: '90000000-0000-4000-8000-0000000000a2', empresa_id: A, cliente_id: CLI[5], servico_id: CORTE, profissional_id: ANA, data: DIA, horario: '10:00:00', duracao_min: 30, status: 'agendado' }
  ],
  agendamento_eventos: [],
  disponibilidade_semanal: [0, 1, 2, 3, 4, 5, 6].map(d => ({ id: `s000000${d}-0000-4000-8000-000000000000`, empresa_id: A, profissional_id: null, dia_semana: d, inicio: '09:00', fim: '18:00', a_cada_semanas: 1 })).concat([0, 1, 2, 3, 4, 5, 6].map(d => ({ id: `p000000${d}-0000-4000-8000-000000000000`, empresa_id: A, profissional_id: ANA, dia_semana: d, inicio: '09:00', fim: '18:00', a_cada_semanas: 1 }))).concat([0, 1, 2, 3, 4, 5, 6].map(d => ({ id: `b000000${d}-0000-4000-8000-000000000000`, empresa_id: A, profissional_id: BETO, dia_semana: d, inicio: '09:00', fim: '18:00', a_cada_semanas: 1 }))).concat([0, 1, 2, 3, 4, 5, 6].map(d => ({ id: `c000000${d}-0000-4000-8000-000000000000`, empresa_id: A, profissional_id: CAIO, dia_semana: d, inicio: '09:00', fim: '18:00', a_cada_semanas: 1 }))),
  disponibilidade_excecoes: [],
  lista_espera: [
    espera(1),                                                              // qualquer dia, qualquer profissional
    espera(2, { profissional_id: ANA, data_preferencia: DIA }),             // pediu Ana neste dia
    espera(3, { profissional_id: BETO }),                                   // pediu outro profissional
    espera(4, { faixa_inicio: '14:00:00', faixa_fim: '18:00:00' }),         // só à tarde
    espera(5, { servico_id: QUIMICA }),                                     // 60 min: não cabe 09:30–10:00
    espera(6, { servico_id: MANICURE, status: 'aguardando' })               // Ana não faz manicure
  ],
  comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});
clock.definirRelogio(() => AGORA);
publico.setRelogioParaTestes(() => AGORA);
Object.assign(env, { PUBLIC_BOOKING_LINKS: '', PUBLIC_BOOKING_RATE_GET_MAX: 1000, PUBLIC_BOOKING_RATE_POST_IP_MAX: 1000, PUBLIC_BOOKING_RATE_POST_NUMERO_MAX: 1000, PUBLIC_BOOKING_TETO_DIARIO: 1000 });

let base;
function request(method, urlPath, { body, token = 'h.recep.s' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + urlPath, { method, headers }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const tests = [];
const test = (n, f) => tests.push({ n, f });
const politica = p => { db.empresas[0].agenda_politica = p; };
const slotsRecep = async () => (await request('GET', `/api/agenda/slots?data=${DIA}&profissionalId=${ANA}&servicoId=${CORTE}`)).data.data;
const slotsLink = async () => (await request('GET', `/api/public/agendar/salao-p/slots?servicoId=${CORTE}&profissionalId=${ANA}&data=${DIA}`, { token: null })).data.data.slots;
const sugeridos = r => r.slots.filter(s => s.sugerido).map(s => s.horario);


const { combinar } = require('../src/engines/AtendimentoEngine');
const svc = (id, dur) => ({ id, nome: id, duracao_min: dur, valor_centavos: 1000 });
const corteS = svc('corte', 30), barbaS = svc('barba', 30);
const base2 = extra => ({
  itens: [{ servico: corteS }, { servico: barbaS }],
  profissionais: [{ id: 'A', overrides: {} }, { id: 'B', overrides: {} }],
  vinculos: [{ profissional_id: 'A', servico_id: 'corte' }, { profissional_id: 'B', servico_id: 'barba' }],
  livresPor: new Map([['A', [{ start: 540, end: 720 }]], ['B', [{ start: 585, end: 720 }]]]),
  esperaMaxMin: 0, ...extra
});

test('C01 multisserviço: 09:15 (corte A, barba B às 09:45, sem espera) aparece; busca medida', () => {
  const r = combinar(base2());
  const sem = r.opcoes.filter(o => o.esperaMin === 0).map(o => o.inicioMin);
  assert.strictEqual(Math.min(...sem), 555, 'primeiro início sem espera = 09:15 (a grade antiga dava 09:45)');
  assert.ok(r.busca && r.busca.avaliadas > 0 && r.busca.truncada === false, JSON.stringify(r.busca));
});

test('C02 busca limitada: no limite, para e avisa', () => {
  const r = combinar(base2({ limiteAvaliacoes: 2 }));
  assert.strictEqual(r.busca.avaliadas, 2);
  assert.strictEqual(r.busca.truncada, true);
});

test('C03 preferência: A fixado e ocupado o dia todo → alternativas com B, marcadas', () => {
  const r = combinar({
    itens: [{ servico: corteS, profissionalId: 'A' }],
    profissionais: [{ id: 'A', overrides: {} }, { id: 'B', overrides: {} }],
    vinculos: [{ profissional_id: 'A', servico_id: 'corte' }, { profissional_id: 'B', servico_id: 'corte' }],
    livresPor: new Map([['A', []], ['B', [{ start: 600, end: 660 }]]])
  });
  assert.strictEqual(r.semOpcaoComEscolhido, true);
  assert.strictEqual(r.alternativas, true);
  assert.ok(r.opcoes.length && r.opcoes.every(o => o.etapas[0].profissional.id === 'B' && o.mantemPreferencia === 0));
  const com = combinar({ itens: [{ servico: corteS, profissionalId: 'A' }], profissionais: [{ id: 'A', overrides: {} }], vinculos: [], livresPor: new Map([['A', [{ start: 600, end: 660 }]]]) });
  assert.strictEqual(com.alternativas, false, 'quando o escolhido cabe, nada de alternativa');
});

test('C04 ordem configurável e rota recusa ordem inválida', async () => {
  const r = combinar(base2({ esperaMaxMin: 60, ordem: 'tempo_total' }));
  for (let i = 1; i < r.opcoes.length; i++) assert.ok(r.opcoes[i - 1].tempoTotalMin <= r.opcoes[i].tempoTotalMin);
  const c = combinar(base2({ esperaMaxMin: 60, ordem: 'inicio' }));
  for (let i = 1; i < c.opcoes.length; i++) assert.ok(c.opcoes[i - 1].inicioMin <= c.opcoes[i].inicioMin);
  const a = combinar(base2({ esperaMaxMin: 60, ordem: 'aproveitamento' }));
  for (let i = 1; i < a.opcoes.length; i++) assert.ok(a.opcoes[i - 1].sobraMin <= a.opcoes[i].sobraMin);
  const bad = await request('POST', '/api/agenda/combinacoes', { body: { data: DIA, itens: [{ servicoId: CORTE }], ordem: 'aleatoria' } });
  assert.strictEqual(bad.status, 422);
  const ok = await request('POST', '/api/agenda/combinacoes', { body: { data: DIA, itens: [{ servicoId: CORTE }, { servicoId: QUIMICA }], ordem: 'tempo_total' } });
  assert.strictEqual(ok.status, 200, ok.raw.slice(0, 160));
  assert.strictEqual(ok.data.data.ordem, 'tempo_total');
  assert.ok(ok.data.data.busca && ok.data.data.busca.avaliadas > 0);
});

const agendarEspera = (horario, extra = {}) => request('POST', '/api/agenda', { body: { clienteId: CLI[0], servicoId: CORTE, profissionalId: ANA, data: DIA, horario, listaEsperaId: W(1), aceitarAvisos: true, ...extra } });

test('C05 espera: dois agendamentos ao mesmo tempo com o mesmo pedido → só um grava', async () => {
  // Os dois passam pela conferência antes de qualquer um gravar (a gravação demora um pouco).
  const P = SupabaseRepository.prototype; const original = P.criarAgendamento;
  P.criarAgendamento = async function (args) { await new Promise(r => setTimeout(r, 60)); return original.call(this, args); };
  let a, b;
  try { [a, b] = await Promise.all([agendarEspera('11:00'), agendarEspera('15:00')]); } finally { P.criarAgendamento = original; }
  const st = [a.status, b.status].sort();
  assert.deepStrictEqual(st, [201, 409], `${a.status} ${a.raw.slice(0, 80)} | ${b.status} ${b.raw.slice(0, 80)}`);
  const perdedor = a.status === 409 ? a : b;
  assert.strictEqual(code(perdedor), 'WAITLIST_ALREADY_USED');
  const gravados = db.agendamentos.filter(x => x.cliente_id === CLI[0] && x.data === DIA && ['11:00', '15:00'].includes(String(x.horario).slice(0, 5)) && x.status !== 'cancelado');
  assert.strictEqual(gravados.length, 1, 'um só agendamento para o pedido');
  assert.strictEqual(db.lista_espera.find(x => x.id === W(1)).status, 'agendado');
});

test('C06 espera: gravação falha (horário ocupado) → pedido volta para a espera', async () => {
  const r = await request('POST', '/api/agenda', { body: { clienteId: CLI[3], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '09:00', listaEsperaId: W(4), aceitarAvisos: true } });
  assert.strictEqual(r.status, 409, r.raw.slice(0, 160));
  assert.notStrictEqual(code(r), 'WAITLIST_ALREADY_USED');
  assert.strictEqual(db.lista_espera.find(x => x.id === W(4)).status, 'aguardando', 'devolvido à espera');
  assert.ok(!db.agendamentos.some(x => x.cliente_id === CLI[3]), 'nada reservado');
});

test('C07 espera: serviço trocado no formulário → vínculo recusado, pedido intacto', async () => {
  const r = await request('POST', '/api/agenda', { body: { clienteId: CLI[4], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '16:00', listaEsperaId: W(5), aceitarAvisos: true } });
  assert.strictEqual(r.status, 422); assert.strictEqual(code(r), 'WAITLIST_MISMATCH');
  assert.strictEqual(db.lista_espera.find(x => x.id === W(5)).status, 'aguardando');
  assert.ok(!db.agendamentos.some(x => x.cliente_id === CLI[4]));
});

test('C08 espera: profissional sem vínculo (o salão tem vínculos) não é compatível', async () => {
  const r = await request('GET', `/api/lista-espera/compativeis?data=${DIA}&profissionalId=${CAIO}&horario=15:00`);
  assert.strictEqual(r.status, 200, r.raw.slice(0, 120));
  assert.strictEqual(r.data.data.livreAte, '18:00', 'Caio está livre (o vazio não é falta de escala)');
  assert.deepStrictEqual(r.data.data.itens, [], 'Caio não tem vínculos: nada compatível');
});

test('C09 escala muda durante a reserva → 409, nada reservado, motivo no histórico', async () => {
  const P = SupabaseRepository.prototype;
  const original = P.criarAgendamento;
  P.criarAgendamento = async function (args) {
    // Um bloqueio da Ana entra exatamente entre a conferência e a gravação.
    db.disponibilidade_excecoes.push({ id: 'f9000000-0000-4000-8000-000000000001', empresa_id: A, profissional_id: ANA, tipo: 'bloqueio', data_inicio: DIA, data_fim: DIA, inicio: '12:00', fim: '13:00', motivo: 'médico' });
    return original.call(this, args);
  };
  try {
    const r = await request('POST', '/api/agenda', { body: { clienteId: CLI[2], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '12:00', aceitarAvisos: true } });
    assert.strictEqual(r.status, 409, r.raw.slice(0, 200));
    assert.strictEqual(code(r), 'ESCALA_MUDOU');
    const ag = db.agendamentos.find(x => x.cliente_id === CLI[2] && String(x.horario).startsWith('12:00'));
    assert.ok(!ag || ag.status === 'cancelado', 'nada fica reservado');
    assert.ok(db.agendamento_eventos.some(e => e.agendamento_id === (ag && ag.id) && (e.payload || {}).motivo === 'escala_mudou_durante_reserva'), 'histórico guarda o motivo');
  } finally { P.criarAgendamento = original; }
  // Controle negativo: sem a mudança, o mesmo pedido grava.
  const ok = await request('POST', '/api/agenda', { body: { clienteId: CLI[2], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '14:00', aceitarAvisos: true } });
  assert.strictEqual(ok.status, 201, ok.raw.slice(0, 160));
});

test('C10 escala muda (evento) entre a conferência e a gravação → banco recusa; nada gravado nem cancelado', async () => {
  const P = SupabaseRepository.prototype; const original = P.criarAgendamento;
  P.criarAgendamento = async function (args) {
    // Um bloqueio entra pela função de escala (gera evento: a versão sobe) antes da gravação.
    await new SupabaseRepository(A).criarExcecoesDisponibilidade({ excecoes: [{ profissionalId: ANA, tipo: 'bloqueio', dataInicio: DIA, dataFim: DIA, inicio: '15:00', fim: '16:00' }], actorId: ADMIN });
    return original.call(this, args);
  };
  const antes = db.agendamentos.length;
  let r;
  try { r = await request('POST', '/api/agenda', { body: { clienteId: CLI[5], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '15:00', aceitarAvisos: true } }); } finally { P.criarAgendamento = original; }
  assert.strictEqual(r.status, 409, r.raw.slice(0, 200));
  assert.strictEqual(code(r), 'ESCALA_MUDOU');
  assert.strictEqual(db.agendamentos.length, antes, 'nada gravado (nem criado e cancelado depois)');
});

test('C11 reserva entra durante a mudança de escala → resposta devolve afetadosDepois', async () => {
  const P = SupabaseRepository.prototype; const original = P.criarExcecoesDisponibilidade;
  const intruso = { id: '91000000-0000-4000-8000-0000000000c1', empresa_id: A, cliente_id: CLI[5], servico_id: CORTE, profissional_id: ANA, data: DIA, horario: '17:00:00', duracao_min: 30, status: 'agendado' };
  P.criarExcecoesDisponibilidade = async function (args) {
    db.agendamentos.push(intruso); // gravou entre a leitura dos afetados e a gravação da escala
    return original.call(this, args);
  };
  let r;
  try { r = await request('POST', '/api/disponibilidade/excecoes', { token: 'h.admin.s', body: { profissionalId: ANA, tipo: 'bloqueio', dataInicio: DIA, dataFim: DIA, periodos: [{ inicio: '17:00', fim: '17:30' }], motivo: 'teste' } }); } finally { P.criarExcecoesDisponibilidade = original; }
  assert.strictEqual(r.status, 201, r.raw.slice(0, 200));
  const lista = r.data.data.afetadosDepois || [];
  assert.deepStrictEqual(lista.map(a => a.agendamentoId), [intruso.id], 'o agendamento que entrou no meio aparece');
  assert.strictEqual(db.agendamentos.find(a => a.id === intruso.id).status, 'agendado', 'nada é mexido sozinho');
});

(async () => {
  const origErr = console.error; const origWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close();
  console.error = origErr; console.warn = origWarn;
  console.log(`\nAgenda Confiável Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();
