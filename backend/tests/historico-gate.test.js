// Histórico Gate: trilha de status da agenda em agendamento_eventos (tabela da
// 001), leitura GET /api/agenda/:id/historico e KPI de confirmação prévia por
// período. HTTP real contra o app; banco e identidade em memória.
//
// Controles negativos (provam que o teste pega a regressão):
// - H07: num processo filho, o serviço de eventos é trocado por uma versão SEM
//   o best-effort; a mesma falha simulada passa a derrubar o PATCH (500) mesmo
//   com o status já gravado — exatamente o que a proteção evita.
// - H08/H09: a leitura sem filtro de empresa (mutação no repositório) vaza o
//   evento/agendamento da outra empresa; com o filtro, não.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-historico-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

// Modo controle negativo (processo filho): remove o best-effort ANTES de o app
// carregar as rotas.
const MODO_SEM_BEST_EFFORT = process.env.HISTORICO_CONTROLE === 'sem_best_effort';
if (MODO_SEM_BEST_EFFORT) {
  const svcPath = require.resolve('../src/services/AgendaEventosService');
  const real = require(svcPath);
  require.cache[svcPath].exports = {
    ...real,
    registrarEventoAgenda: (repo, auth, o) => repo.registrarEventoAgenda({ agendamentoId: o.agendamentoId, tipo: o.tipo, payload: {} })
  };
}

const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { metricasEventos } = require('../src/services/AgendaEventosService');
const { computePiloto } = require('../src/engines/insights/piloto');
const { agoraNoFuso } = require('../src/engines/SlotEngine');
const { addDays } = require('../src/engines/insights/retention');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000dd';
const ADMIN = 'c0000000-0000-4000-8000-0000000000d1';
const RECEP = 'c0000000-0000-4000-8000-0000000000d2';
const PROFU = 'c0000000-0000-4000-8000-0000000000d3';
const ADMIN_B = 'c0000000-0000-4000-8000-0000000000d4';
const UNIT = 'f0000000-0000-4000-8000-0000000000d1';
const ROBSON = 'a0000000-0000-4000-8000-0000000000d1';
const ANA = 'a0000000-0000-4000-8000-0000000000d2';
const SERV = 'b0000000-0000-4000-8000-0000000000d1';
const CLI = 'd0000000-0000-4000-8000-0000000000d1';
const AG_B = '90000000-0000-4000-8000-0000000000db';
const FUT = '2030-01-10'; // datas futuras fixas: fora de qualquer período do KPI
const H = agoraNoFuso(env.APP_TIMEZONE).data;

setIdentityStore(createMemoryIdentityStore({
  app_users: [
    { id: ADMIN, email: 'admin@salao.test', nome: 'Hudson', ativo: true },
    { id: RECEP, email: 'recep@salao.test', nome: 'recep@salao.test', ativo: true }, // nome = e-mail → não exibido
    { id: PROFU, email: 'ana@salao.test', nome: 'Ana Prof', ativo: true },
    { id: ADMIN_B, email: 'b@outra.test', nome: 'Admin da B', ativo: true }
  ],
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: PROFU, role: 'profissional', status: 'ativo', profissional_id: ANA },
    { id: 'm4', empresa_id: EB, user_id: ADMIN_B, role: 'admin', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.prof.s': PROFU, 'h.adminb.s': ADMIN_B };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'A', horario_por_dia: {} }, { id: EB, nome: 'B', horario_por_dia: {} }],
  servicos: [{ id: SERV, empresa_id: E, nome: 'Corte', valor_centavos: 3000, duracao_min: 30, comissao_pct: 40, ativo: true }],
  profissionais: [
    { id: ROBSON, empresa_id: E, nome: 'Robson', ativo: true, modelo_comissao: 'bruto_salao', overrides: {} },
    { id: ANA, empresa_id: E, nome: 'Ana', ativo: true, modelo_comissao: 'bruto_salao', overrides: {} }
  ],
  profissional_servicos: [{ empresa_id: E, profissional_id: ROBSON, servico_id: SERV }, { empresa_id: E, profissional_id: ANA, servico_id: SERV }],
  clientes: [{ id: CLI, empresa_id: E, nome: 'João Silva', whatsapp: '11988887777', ativo: true }],
  formas_pagamento: [{ empresa_id: E, code: 'dinheiro', label: 'Dinheiro', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true }],
  produtos: [], cargos: [], servico_categorias: [], comandos: [], comando_itens: [],
  agendamentos: [
    { id: AG_B, empresa_id: EB, cliente_id: null, servico_id: SERV, profissional_id: ROBSON, data: FUT, horario: '08:00:00', duracao_min: 30, status: 'agendado' }
  ],
  agendamento_eventos: [
    { id: 'evb-1', empresa_id: EB, agendamento_id: AG_B, tipo: 'criado', payload: { de: null, para: 'agendado', actor_id: ADMIN_B, actor_type: 'user', origem: 'agenda' }, created_at: '2026-01-01T10:00:00Z' }
  ]
});

let base;
function request(method, p, { token = 'h.admin.s', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + p, { method, headers }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const eventosDe = id => db.agendamento_eventos.filter(e => e.agendamento_id === id);
const criar = (horario, { token = 'h.admin.s', profissionalId = ROBSON, data = FUT } = {}) =>
  request('POST', '/api/agenda', { token, body: { clienteId: CLI, servicoId: SERV, profissionalId, data, horario } });
const patchStatus = (id, novoStatus, extra = {}, token = 'h.admin.s') =>
  request('PATCH', `/api/agenda/${id}/status`, { token, body: { novoStatus, ...extra } });
const historico = (id, token = 'h.admin.s') => request('GET', `/api/agenda/${id}/historico`, { token });
const PII = ['João', '11988887777', '@salao.test', '@outra.test'];

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('H01 POST /agenda grava evento criado (de null → agendado) com autoria do req.auth, sem PII', async () => {
  const r = await criar('09:00');
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const evs = eventosDe(r.data.data.id);
  assert.strictEqual(evs.length, 1);
  assert.strictEqual(evs[0].empresa_id, E);
  assert.strictEqual(evs[0].tipo, 'criado');
  assert.deepStrictEqual(evs[0].payload, { de: null, para: 'agendado', actor_id: ADMIN, actor_type: 'user', origem: 'agenda' });
  assert.ok(evs[0].created_at);
  for (const s of PII) assert.ok(!JSON.stringify(evs[0]).includes(s), `payload sem PII (${s})`);
});

test('H02 PATCH status grava cada transição (confirmado → chegou → na cadeira) com de/para', async () => {
  const id = (await criar('10:00')).data.data.id;
  for (const s of ['confirmado', 'aguardando', 'em_atendimento']) assert.strictEqual((await patchStatus(id, s)).status, 200, s);
  const evs = eventosDe(id);
  assert.deepStrictEqual(evs.map(e => [e.tipo, e.payload.de, e.payload.para]), [
    ['criado', null, 'agendado'], ['status', 'agendado', 'confirmado'], ['status', 'confirmado', 'aguardando'], ['status', 'aguardando', 'em_atendimento']
  ]);
  const inval = await patchStatus(id, 'no_show');
  assert.strictEqual(code(inval), 'INVALID_STATUS_TRANSITION');
  assert.strictEqual(eventosDe(id).length, 4, 'transição recusada não grava evento');
});

test('H03 reagendamento grava no original (→ reagendado, aponta o novo) e no novo (aponta o original)', async () => {
  const id = (await criar('11:00')).data.data.id;
  const r = await patchStatus(id, 'reagendado', { novaData: FUT, novoHorario: '15:00' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const novoId = r.data.data.novo.id;
  const orig = eventosDe(id).at(-1);
  assert.strictEqual(orig.tipo, 'reagendado');
  assert.deepStrictEqual([orig.payload.de, orig.payload.para, orig.payload.reagendado_para, orig.payload.origem], ['agendado', 'reagendado', novoId, 'agenda']);
  const novo = eventosDe(novoId);
  assert.strictEqual(novo.length, 1);
  assert.deepStrictEqual([novo[0].tipo, novo[0].payload.de, novo[0].payload.para, novo[0].payload.reagendado_de, novo[0].payload.origem], ['reagendado', null, 'agendado', id, 'reagendamento']);
});

test('H04 PATCH duração grava evento duracao (de 30 → 45)', async () => {
  const id = (await criar('12:00')).data.data.id;
  const r = await request('PATCH', `/api/agenda/${id}/duracao`, { body: { duracaoMin: 45 } });
  assert.strictEqual(r.status, 200);
  const ev = eventosDe(id).at(-1);
  assert.deepStrictEqual([ev.tipo, ev.payload.de, ev.payload.para], ['duracao', 30, 45]);
});

test('H05 checkout com agendamentoId grava status → concluido com origem checkout', async () => {
  const id = (await criar('13:00')).data.data.id;
  await patchStatus(id, 'em_atendimento');
  const r = await request('POST', '/api/checkout/close', { token: 'h.recep.s', body: {
    idempotencyKey: 'h05', agendamentoId: id, itens: [{ tipo: 'servico', servicoId: SERV, profissionalId: ROBSON }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 3000 }]
  } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.strictEqual(r.data.data.agendamentoConcluido.status, 'concluido');
  const ev = eventosDe(id).at(-1);
  assert.deepStrictEqual([ev.tipo, ev.payload.de, ev.payload.para, ev.payload.origem, ev.payload.actor_id], ['status', 'em_atendimento', 'concluido', 'checkout', RECEP]);
});

test('H06 GET historico: ordem cronológica, nome só de membro da empresa e nunca e-mail', async () => {
  const id = (await criar('14:00')).data.data.id;
  await patchStatus(id, 'confirmado', {}, 'h.recep.s');
  await patchStatus(id, 'aguardando');
  const r = await historico(id);
  assert.strictEqual(r.status, 200);
  const d = r.data.data;
  assert.strictEqual(d.statusAtual, 'aguardando');
  assert.deepStrictEqual(d.eventos.map(e => [e.tipo, e.de, e.para, e.ator.tipo, e.ator.nome]), [
    ['criado', null, 'agendado', 'user', 'Hudson'],
    ['status', 'agendado', 'confirmado', 'user', null], // nome da recepção é um e-mail → omitido
    ['status', 'confirmado', 'aguardando', 'user', 'Hudson']
  ]);
  const quando = d.eventos.map(e => e.quando);
  assert.deepStrictEqual([...quando].sort(), quando);
  const raw = JSON.stringify(r.data);
  for (const s of PII) assert.ok(!raw.includes(s), `histórico sem PII (${s})`);
  assert.ok(!raw.includes(ADMIN), 'actor_id não é exposto');
  assert.strictEqual(code(await historico('nao-e-uuid')), 'INVALID_UUID');
  assert.strictEqual((await historico(id, null)).status, 401);
});

test('H07 falha na gravação do evento não derruba o PATCH (best-effort) + controle negativo sem a proteção', async () => {
  const id = (await criar('16:00')).data.data.id;
  const antes = eventosDe(id).length;
  const falhasAntes = metricasEventos.falhas;
  const P = SupabaseRepository.prototype;
  const original = P.registrarEventoAgenda;
  const origErr = console.error; const logs = [];
  P.registrarEventoAgenda = async () => { throw new Error('falha simulada no insert de agendamento_eventos'); };
  console.error = (...a) => logs.push(a.join(' '));
  let r;
  try { r = await patchStatus(id, 'confirmado'); } finally { P.registrarEventoAgenda = original; console.error = origErr; }
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.data.original.status, 'confirmado', 'resposta igual à de sempre');
  assert.strictEqual(db.agendamentos.find(a => a.id === id).status, 'confirmado');
  assert.strictEqual(eventosDe(id).length, antes, 'nenhum evento gravado');
  assert.strictEqual(metricasEventos.falhas, falhasAntes + 1, 'falha contada');
  assert.ok(logs.some(l => l.includes('[agenda-eventos]') && l.includes('falha simulada')), 'falha logada');

  // Controle negativo: mesmo cenário num processo com o serviço sem best-effort.
  const filho = spawnSync(process.execPath, [__filename], { env: { ...process.env, HISTORICO_CONTROLE: 'sem_best_effort' }, encoding: 'utf8' });
  const linha = (filho.stdout || '').split('\n').find(l => l.startsWith('CONTROLE '));
  assert.ok(linha, `filho não reportou: ${filho.stderr}`);
  const c = JSON.parse(linha.slice('CONTROLE '.length));
  assert.strictEqual(c.httpStatus, 500, 'sem a proteção a falha do evento derruba o PATCH');
  assert.strictEqual(c.statusNoBanco, 'confirmado', '...mesmo com o status já gravado (cliente veria erro de algo feito)');
});

test('H08 isolamento: empresa B não lê histórico de A (404); A não vê evento forjado com empresa B + controle', async () => {
  const id = (await criar('17:00')).data.data.id;
  // Evento "forjado" da empresa B apontando para o agendamento de A.
  db.agendamento_eventos.push({ id: 'evb-forjado', empresa_id: EB, agendamento_id: id, tipo: 'status', payload: { de: 'agendado', para: 'cancelado', actor_type: 'user', actor_id: ADMIN_B, origem: 'agenda' }, created_at: new Date().toISOString() });
  const b = await historico(id, 'h.adminb.s');
  assert.strictEqual(b.status, 404); assert.strictEqual(code(b), 'AGENDAMENTO_NOT_FOUND');
  const bProprio = await historico(AG_B, 'h.adminb.s');
  assert.strictEqual(bProprio.status, 200);
  assert.deepStrictEqual(bProprio.data.data.eventos.map(e => [e.tipo, e.ator.nome]), [['criado', 'Admin da B']]);
  assert.strictEqual((await historico(AG_B)).status, 404, 'A não lê o de B');
  const a = await historico(id);
  assert.deepStrictEqual(a.data.data.eventos.map(e => e.para), ['agendado'], 'evento com empresa_id de B não aparece');
  // Escrita: B não muda status de A e não grava evento.
  assert.strictEqual((await patchStatus(id, 'confirmado', {}, 'h.adminb.s')).status, 404);
  assert.strictEqual(eventosDe(id).filter(e => e.empresa_id === E).length, 1);

  // Controle negativo: listagem sem filtro de empresa vaza o evento forjado.
  const P = SupabaseRepository.prototype;
  const orig = P.listEventosAgenda;
  P.listEventosAgenda = async function (agId) { return this.list('agendamento_eventos', { agendamento_id: agId }); };
  try {
    const vazado = await historico(id);
    assert.ok(vazado.data.data.eventos.some(e => e.para === 'cancelado'), 'sem o filtro, o teste detecta o vazamento');
    assert.ok(vazado.data.data.eventos.every(e => e.ator.nome !== 'Admin da B'), 'nome de quem não é membro da empresa nunca é resolvido');
  } finally { P.listEventosAgenda = orig; }
  // Controle negativo: leitura do agendamento sem escopo deixa B ler o histórico de A.
  const origGet = P.getByIdScoped;
  P.getByIdScoped = async function (t, agId) { return (await this.list(t, { id: agId }))[0] || null; };
  try { assert.strictEqual((await historico(id, 'h.adminb.s')).status, 200, 'sem escopo, B leria A'); }
  finally { P.getByIdScoped = origGet; }
  assert.strictEqual((await historico(id, 'h.adminb.s')).status, 404);
});

test('H09 profissional: lê o histórico dos próprios; de outro profissional = 403 (+ controle: admin lê o mesmo)', async () => {
  const deAna = (await criar('09:00', { token: 'h.prof.s', profissionalId: ANA, data: '2030-01-11' }));
  assert.strictEqual(deAna.status, 201, JSON.stringify(deAna.data));
  const proprio = await historico(deAna.data.data.id, 'h.prof.s');
  assert.strictEqual(proprio.status, 200);
  assert.deepStrictEqual(proprio.data.data.eventos.map(e => [e.tipo, e.ator.nome]), [['criado', 'Ana Prof']]);
  const deRobson = (await criar('09:00', { data: '2030-01-11' })).data.data.id;
  const r = await historico(deRobson, 'h.prof.s');
  assert.strictEqual(r.status, 403); assert.strictEqual(code(r), 'NOT_OWN_RESOURCE');
  assert.strictEqual((await historico(deRobson)).status, 200, 'controle: o registro existe e o admin lê');
});

// ---------- KPI confirmação prévia por eventos (função pura) ----------
const TZ = 'America/Sao_Paulo';
const kag = (id, data, status, extra = {}) => ({ id, cliente_id: `C-${id}`, profissional_id: 'p1', data, horario: '10:00', status, ...extra });
const kev = (agendamento_id, para, created_at) => ({ agendamento_id, tipo: para === 'agendado' ? 'criado' : 'status', payload: { para }, created_at });
const KAGS = [
  kag('g1', '2026-06-10', 'concluido'),
  kag('g2', '2026-06-11', 'concluido'),
  kag('g3', '2026-06-12', 'no_show'),
  kag('g4', '2026-06-13', 'cancelado'),
  kag('g5', '2026-06-14', 'cancelado'),
  kag('g6', '2026-06-15', 'concluido'),
  kag('g7', '2026-06-16', 'concluido'), // sem trilha
  kag('g8', '2026-06-25', 'confirmado'), // ainda não chegou ao dia
  kag('g9', '2026-05-30', 'concluido'), // fora do período
  kag('g10', '2026-06-17', 'reagendado'),
  kag('g11', '2026-06-18', 'cancelado', { updated_at: '2026-06-01T12:00:00Z' }), // cancelamento sem evento → updated_at
  kag('g12', '2026-06-20', 'confirmado') // hoje
];
const KEVS = [
  kev('g1', 'agendado', '2026-06-01T12:00:00Z'), kev('g1', 'confirmado', '2026-06-09T15:00:00Z'), // ✓ véspera
  kev('g2', 'confirmado', '2026-06-11T11:00:00Z'), // ✗ no próprio dia
  kev('g3', 'agendado', '2026-06-02T12:00:00Z'), // ✗ nunca confirmou
  kev('g4', 'cancelado', '2026-06-05T12:00:00Z'), // fora: cancelado antes do dia
  kev('g5', 'cancelado', '2026-06-14T12:00:00Z'), // ✗ cancelado no dia (fica no denominador)
  kev('g6', 'confirmado', '2026-06-15T02:30:00Z'), // ✓ UTC 15/06, local 14/06 23:30
  kev('g8', 'confirmado', '2026-06-18T12:00:00Z'),
  kev('g9', 'confirmado', '2026-05-20T12:00:00Z'),
  kev('g10', 'reagendado', '2026-06-02T12:00:00Z'), // fora: reagendado antes do dia
  kev('g11', 'agendado', '2026-05-28T12:00:00Z'), // fora via updated_at
  kev('g12', 'confirmado', '2026-06-19T12:00:00Z') // ✓
];
const kpiConf = eventos => computePiloto({ agendamentos: KAGS, eventos, de: '2026-06-01', ate: '2026-06-30', hoje: '2026-06-20', timeZone: TZ }).confirmacaoPrevia;
const nd = k => [k.numerador, k.denominador, k.taxa];

test('H10 KPI com eventos: confirmados antes do dia / agendamentos que chegaram ao dia (sem cancelados antes)', () => {
  const k = kpiConf(KEVS);
  // universo: g1,g2,g3,g5,g6,g12 = 6 ; confirmados antes do dia: g1,g6,g12 = 3
  assert.strictEqual(k.escopo, 'periodo_eventos');
  assert.deepStrictEqual(nd(k), [3, 6, 50]);
  assert.strictEqual(k.semTrilha, 1, 'g7');
  assert.strictEqual(k.canceladosAntes, 3, 'g4, g10, g11');
  assert.strictEqual(k.dia, '2026-06-20');
  assert.deepStrictEqual(nd(k.fotoDoDia), [1, 1, 100], 'foto do dia continua disponível');
  assert.strictEqual(k.referencia.melhorQuando, 'maior');
});

test('H11 KPI sem eventos no período → fallback foto do dia (formato antigo preservado)', () => {
  for (const eventos of [[], KEVS.filter(e => e.agendamento_id === 'g9' || e.agendamento_id === 'g8')]) {
    const k = kpiConf(eventos);
    assert.strictEqual(k.escopo, 'foto_do_dia');
    assert.deepStrictEqual(nd(k), [1, 1, 100]);
    for (const campo of ['numerador', 'denominador', 'taxa', 'referencia', 'dia', 'escopo', 'limitacao']) assert.ok(campo in k, campo);
  }
});

test('H12 rota do piloto usa a trilha do tenant (HTTP)', async () => {
  const ontem = `${addDays(H, -1)}T15:00:00Z`;
  db.agendamentos.push(kag('90000000-0000-4000-8000-0000000000e1', H, 'concluido', { empresa_id: E }));
  db.agendamentos.push(kag('90000000-0000-4000-8000-0000000000e2', H, 'concluido', { empresa_id: EB }));
  db.agendamento_eventos.push({ id: 'k1', empresa_id: E, ...kev('90000000-0000-4000-8000-0000000000e1', 'confirmado', ontem) });
  db.agendamento_eventos.push({ id: 'k2', empresa_id: EB, ...kev('90000000-0000-4000-8000-0000000000e2', 'agendado', ontem) });
  const a = (await request('GET', '/api/relatorios/piloto')).data.data.confirmacaoPrevia;
  assert.strictEqual(a.escopo, 'periodo_eventos');
  assert.deepStrictEqual(nd(a), [1, 1, 100]);
  const b = (await request('GET', '/api/relatorios/piloto', { token: 'h.adminb.s' })).data.data.confirmacaoPrevia;
  assert.deepStrictEqual(nd(b), [0, 1, 0], 'B só enxerga a própria trilha');
});

async function controleSemBestEffort() {
  const id = (await criar('18:00')).data.data.id;
  SupabaseRepository.prototype.registrarEventoAgenda = async () => { throw new Error('falha simulada'); };
  const r = await patchStatus(id, 'confirmado');
  console.log(`CONTROLE ${JSON.stringify({ httpStatus: r.status, statusNoBanco: db.agendamentos.find(a => a.id === id).status })}`);
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const origLog = console.log;
  if (MODO_SEM_BEST_EFFORT) {
    console.error = () => {};
    try { await controleSemBestEffort(); } finally { server.close(); }
    return;
  }
  const origErr = console.error; console.error = () => {};
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; origLog(`✓ ${n}`); } catch (err) { origLog(`✗ ${n}\n   ${err.message}`); }
  }
  console.error = origErr;
  server.close();
  console.log(`\nHistórico Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();
