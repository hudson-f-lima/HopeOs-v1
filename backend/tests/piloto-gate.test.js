// Piloto Gate: os 4 números do piloto (auditoria 2026-11 §4) — definições
// exatas em src/engines/insights/piloto.js. Função pura com "hoje" injetado +
// HTTP real contra o app (banco e identidade em memória).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-piloto-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { computePiloto } = require('../src/engines/insights/piloto');
const { agoraNoFuso } = require('../src/engines/SlotEngine');
const { addDays } = require('../src/engines/insights/retention');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const tests = [];
const test = (n, f) => tests.push({ n, f });

// ---------- Fixture pura (números calculados à mão no comentário de cada teste) ----------
const P1 = 'p1'; const P2 = 'p2';
const ag = (id, cliente_id, profissional_id, data, status, extra = {}) => ({ id, cliente_id, profissional_id, data, horario: '10:00', status, ...extra });
const AGS = [
  ag('a1', 'C1', P1, '2026-06-05', 'concluido'),
  ag('a2', 'C1', P1, '2026-07-03', 'agendado', { created_at: '2026-06-05T20:00:00Z' }), // 17:00 local no dia do atendimento → remarcou
  ag('a3', 'C2', P1, '2026-06-10', 'concluido'),
  ag('a4', 'C2', P1, '2026-07-20', 'agendado', { created_at: '2026-06-12T15:00:00Z' }), // 2 dias depois → não conta
  ag('a5', 'C3', P2, '2026-06-15', 'concluido'),
  ag('a6', 'C3', P2, '2026-06-25', 'concluido', { created_at: '2026-06-17T02:30:00Z' }), // UTC 17/06 (D+2), local 16/06 23:30 (D+1) → conta
  ag('a7', 'C4', P2, '2026-06-20', 'concluido'),
  ag('a8', 'C5', P1, '2026-06-08', 'no_show'),
  ag('a9', 'C6', P1, '2026-06-09', 'no_show'),
  ag('a10', 'C7', P2, '2026-06-10', 'cancelado', { updated_at: '2026-06-10T08:00:00Z' }), // tardio
  ag('a11', 'C8', P2, '2026-06-11', 'cancelado', { updated_at: '2026-06-01T10:00:00Z' }), // antecipado
  ag('a12', 'C5', P1, '2026-05-20', 'no_show'), // fora do período
  ag('a13', 'C9', P1, '2026-06-30', 'concluido'), // hoje: rebook em maturação
  ag('a14a', 'C11', P1, '2026-06-30', 'confirmado'),
  ag('a14b', 'C12', P2, '2026-06-30', 'agendado'),
  ag('a14c', 'C13', P1, '2026-06-30', 'agendado'),
  ag('a14d', 'C14', P1, '2026-06-30', 'em_atendimento'),
  ag('a15', 'C2', P1, '2026-08-05', 'concluido'), // retorno de C2 no dia 56
  ag('a17', 'C4', P2, '2026-04-01', 'concluido'), // C4 não é cliente novo
  ag('a18', 'C1', P1, '2026-08-04', 'concluido') // retorno de C1 exatamente no dia 60
];
const COMANDOS = [
  { id: 'k1', cliente_id: 'C10', data: '2026-06-22', status: 'fechado' },
  { id: 'k2', cliente_id: 'C1', data: '2026-06-05', status: 'fechado' }, // mesmo atendimento de a1
  { id: 'k3', cliente_id: 'C10', data: '2026-08-22', status: 'fechado' } // dia 61 → não é retorno
];
const ITENS = [
  { comando_id: 'k1', tipo: 'servico', profissional_id: P1 },
  { comando_id: 'k1', tipo: 'servico', profissional_id: P2 },
  { comando_id: 'k1', tipo: 'produto', profissional_id: null },
  { comando_id: 'k2', tipo: 'servico', profissional_id: P1 }
];
const calc = hoje => computePiloto({ agendamentos: AGS, comandos: COMANDOS, comandoItens: ITENS, de: '2026-06-01', ate: '2026-06-30', hoje, timeZone: 'America/Sao_Paulo' });
const nd = k => [k.numerador, k.denominador, k.taxa];

test('P01 taxa de falta = no_show / (atendidos + no_show + cancelado tardio)', () => {
  const r = calc('2026-06-30');
  // atendidos a1,a3,a5,a6,a7,a13 = 6; no_show a8,a9 = 2 (a12 fora); tardio a10 = 1 (a11 antecipado não)
  assert.deepStrictEqual(nd(r.taxaFalta), [2, 9, 22.2]);
  assert.deepStrictEqual([r.taxaFalta.atendidos, r.taxaFalta.noShow, r.taxaFalta.cancelTardio], [6, 2, 1]);
  assert.deepStrictEqual(r.taxaFalta.referencia.media, { min: 10, max: 20 });
  assert.strictEqual(r.taxaFalta.referencia.melhorQuando, 'menor');
});

test('P02 reagendamento no checkout: próximo agendamento criado até D+1 (data local), com maturação', () => {
  const r = calc('2026-06-30');
  // atendimentos: C1 05/06 (a1+k2 = 1), C2 10/06, C3 15/06, C3 25/06, C4 20/06, C10 22/06, C9 30/06 (maturação)
  // remarcou: C1 (a2 no mesmo dia), C3 15/06 (a6 criado em D+1 23:30 local) → 2/6
  assert.deepStrictEqual(nd(r.reagendamentoCheckout), [2, 6, 33.3]);
  assert.strictEqual(r.reagendamentoCheckout.emMaturacao, 1);
  assert.strictEqual(r.reagendamentoCheckout.janelaDias, 1);
  assert.deepStrictEqual(r.reagendamentoCheckout.topo, undefined);
  assert.deepStrictEqual(r.reagendamentoCheckout.referencia.topo, { min: 70, max: 80 });
});

test('P03 retorno do cliente novo: só coorte madura (60 dias); dia 60 conta, dia 61 não', () => {
  // novos no período: C1, C2, C3, C10, C9 (C4 já veio em abril; C5 nunca foi atendido)
  let r = calc('2026-06-30');
  assert.deepStrictEqual(nd(r.retornoClienteNovo), [0, 0, null], 'ninguém maduro → null');
  assert.deepStrictEqual([r.retornoClienteNovo.clientesNovos, r.retornoClienteNovo.emMaturacao], [5, 5]);
  r = calc('2026-08-12'); // maduros: 1ª visita <= 13/06 → C1, C2
  assert.deepStrictEqual(nd(r.retornoClienteNovo), [2, 2, 100]);
  assert.strictEqual(r.retornoClienteNovo.emMaturacao, 3);
  r = calc('2026-09-15'); // todos maduros: C1 (dia 60) ✓, C2 ✓, C3 ✓, C10 (dia 61) ✗, C9 ✗
  assert.deepStrictEqual(nd(r.retornoClienteNovo), [3, 5, 60]);
});

test('P04 confirmação prévia = confirmados / (agendado + confirmado) de hoje', () => {
  const r = calc('2026-06-30');
  assert.deepStrictEqual(nd(r.confirmacaoPrevia), [1, 3, 33.3]);
  assert.strictEqual(r.confirmacaoPrevia.dia, '2026-06-30');
  assert.strictEqual(r.confirmacaoPrevia.escopo, 'foto_do_dia', 'sem trilha de eventos → foto do dia');
  assert.deepStrictEqual(nd(calc('2026-07-01').confirmacaoPrevia), [0, 0, null]);
});

test('P05 quebra por profissional (mesmas definições) para falta e reagendamento', () => {
  const r = calc('2026-06-30');
  const p1 = r.porProfissional.find(p => p.profissionalId === P1);
  const p2 = r.porProfissional.find(p => p.profissionalId === P2);
  // falta P1: a1,a3,a13 + no_show a8,a9 → 2/5 ; P2: a5,a6,a7 + tardio a10 → 0/4
  assert.deepStrictEqual(nd(p1.taxaFalta), [2, 5, 40]);
  assert.deepStrictEqual(nd(p2.taxaFalta), [0, 4, 0]);
  // rebook P1: C1 ✓, C2 ✗, C10 ✗ (+C9 em maturação) ; P2: C3 15/06 ✓, C3 25/06, C4, C10 ✗ (k1 tem 2 profissionais)
  assert.deepStrictEqual(nd(p1.reagendamentoCheckout), [1, 3, 33.3]);
  assert.strictEqual(p1.reagendamentoCheckout.emMaturacao, 1);
  assert.deepStrictEqual(nd(p2.reagendamentoCheckout), [1, 4, 25]);
  assert.strictEqual(r.porProfissional.length, 2);
});

test('P06 sem dados → todos os denominadores 0 e taxa null', () => {
  const r = computePiloto({ de: '2026-01-01', ate: '2026-01-31', hoje: '2026-03-01' });
  for (const k of ['taxaFalta', 'reagendamentoCheckout', 'retornoClienteNovo', 'confirmacaoPrevia']) {
    assert.deepStrictEqual(nd(r[k]), [0, 0, null], k);
  }
  assert.deepStrictEqual(r.porProfissional, []);
});

// ---------- Categorias de retorno, fidelização e cancelamento (D-028) ----------
const ev = (id, cliente, prof, data, status = 'concluido') => ({ id, cliente_id: cliente, profissional_id: prof, data, status, created_at: `${data}T10:00:00Z` });

test('C01 retorno do cliente novo em 3 categorias: mesmo profissional, outro, não voltou; sem info fica à parte', () => {
  const r = computePiloto({
    de: '2026-03-01', ate: '2026-03-31', hoje: '2026-09-01',
    agendamentos: [
      ev('a1', 'c1', 'pA', '2026-03-05'), ev('a2', 'c1', 'pA', '2026-04-10'),            // c1 voltou com o mesmo (pA)
      ev('b1', 'c2', 'pA', '2026-03-06'), ev('b2', 'c2', 'pB', '2026-04-12'),            // c2 voltou com outro (pB)
      ev('d1', 'c3', 'pA', '2026-03-07'), ev('d2', 'c3', 'pB', '2026-03-20'), ev('d3', 'c3', 'pA', '2026-04-20'), // c3 voltou com outro E com o mesmo: conta como mesmo
      ev('e1', 'c4', 'pA', '2026-03-08'),                                                 // c4 não voltou
      ev('f1', 'c5', 'pA', '2026-03-09'), ev('f2', 'c5', 'pA', '2026-07-20'),            // c5 voltou fora dos 60 dias: não voltou
      ev('g1', 'c6', null, '2026-03-10'), ev('g2', 'c6', 'pA', '2026-04-15')             // c6: 1ª visita sem profissional: sem info
    ]
  });
  const k = r.retornoClienteNovo;
  assert.deepStrictEqual(k.categorias, { voltouMesmoProfissional: 2, voltouOutroProfissional: 1, voltouSemInfoProfissional: 1, naoVoltou: 2 });
  const c = k.categorias;
  assert.strictEqual(c.voltouMesmoProfissional + c.voltouOutroProfissional + c.voltouSemInfoProfissional + c.naoVoltou, k.denominador, 'as quatro somam o denominador');
  assert.strictEqual(c.voltouMesmoProfissional + c.voltouOutroProfissional + c.voltouSemInfoProfissional, k.numerador, 'as três de retorno somam o numerador');
  assert.deepStrictEqual([k.numerador, k.denominador], [4, 6]);
});

test('C02 fidelização: clientes do período com 3 ou mais atendimentos nos 365 dias; média de visitas', () => {
  const dias = ['2026-01-10', '2026-02-10', '2026-03-10'];
  const r = computePiloto({
    de: '2026-03-01', ate: '2026-03-31', hoje: '2026-04-15',
    agendamentos: [
      ...dias.map((d, i) => ev(`f${i}`, 'c1', 'pA', d)),                                   // c1: 3 visitas → recorrente
      ev('g0', 'c2', 'pA', '2026-03-12'), ev('g1', 'c2', 'pA', '2025-01-05'),              // c2: 1 na janela (a outra tem mais de 365 dias) → não
      ev('h0', 'c3', 'pA', '2026-03-15'), ev('h1', 'c3', 'pB', '2026-03-16'),              // c3: 2 dias distintos → não
      ev('i0', 'c4', 'pA', '2026-02-20')                                                   // c4: sem atendimento no período → fora
    ]
  });
  assert.deepStrictEqual(nd(r.fidelizacao), [1, 3, 33.3]);
  assert.deepStrictEqual([r.fidelizacao.visitasMinimas, r.fidelizacao.janelaDias, r.fidelizacao.mediaVisitas], [3, 365, 2]);
  assert.strictEqual(r.fidelizacao.referencia.media, null, 'sem referência inventada');
  assert.deepStrictEqual(nd(computePiloto({ de: '2026-01-01', ate: '2026-01-31', hoje: '2026-03-01' }).fidelizacao), [0, 0, null]);
});

test('C03 taxa de cancelamento: cancelado / (atendidos + no_show + cancelado), em qualquer antecedência', () => {
  const r = computePiloto({
    de: '2026-03-01', ate: '2026-03-31', hoje: '2026-04-15',
    agendamentos: [ev('a', 'c1', 'pA', '2026-03-02'), ev('b', 'c2', 'pA', '2026-03-03'), ev('c', 'c3', 'pA', '2026-03-04', 'no_show'),
      ev('d', 'c4', 'pA', '2026-03-05', 'cancelado'), ev('e', 'c5', 'pA', '2026-03-06', 'reagendado'), ev('f', 'c6', 'pA', '2026-05-01', 'cancelado')]
  });
  // 2 atendidos + 1 no_show + 1 cancelado = 4; o reagendado e o futuro ficam fora.
  assert.deepStrictEqual([r.taxaCancelamento.numerador, r.taxaCancelamento.denominador, r.taxaCancelamento.taxa], [1, 4, 25]);
  assert.strictEqual(r.taxaCancelamento.referencia.melhorQuando, 'menor');
});

test('C04 janela de retorno variável: 60, 90 ou 120 dias; outro valor é recusado', () => {
  const ags = [ev('a1', 'c1', 'pA', '2026-03-05'), ev('a2', 'c1', 'pA', '2026-05-20'),   // voltou em 76 dias
    ev('b1', 'c2', 'pA', '2026-03-06'), ev('b2', 'c2', 'pB', '2026-06-25')];                  // voltou em 111 dias
  const r = d => computePiloto({ de: '2026-03-01', ate: '2026-03-31', hoje: '2026-09-01', agendamentos: ags, retornoDias: d }).retornoClienteNovo;
  assert.deepStrictEqual([r(60).numerador, r(90).numerador, r(120).numerador], [0, 1, 2]);
  assert.deepStrictEqual([r(60).janelaDias, r(90).janelaDias, r(120).janelaDias], [60, 90, 120]);
  assert.deepStrictEqual([r(90).categorias.voltouMesmoProfissional, r(120).categorias.voltouOutroProfissional], [1, 1]);
  // Maturação acompanha a janela: com 120 dias, quem chegou há menos de 120 dias fica de fora.
  const recente = computePiloto({ de: '2026-08-01', ate: '2026-08-31', hoje: '2026-09-01', agendamentos: [ev('x', 'c9', 'pA', '2026-08-10')], retornoDias: 120 }).retornoClienteNovo;
  assert.deepStrictEqual([recente.denominador, recente.emMaturacao], [0, 1]);
  for (const ruim of [30, 61, 0, '90']) assert.throws(() => computePiloto({ de: '2026-03-01', ate: '2026-03-31', hoje: '2026-09-01', retornoDias: ruim }), RangeError);
});

// ---------- HTTP ----------
const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000bb';
const ADMIN = 'c0000000-0000-4000-8000-0000000000b1';
const RECEP = 'c0000000-0000-4000-8000-0000000000b2';
const ADMIN_B = 'c0000000-0000-4000-8000-0000000000b3';
const UNIT = 'f0000000-0000-4000-8000-0000000000b1';
const PROF = 'a0000000-0000-4000-8000-0000000000b1';
const H = agoraNoFuso(env.APP_TIMEZONE).data;

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, ADMIN_B].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: EB, user_id: ADMIN_B, role: 'gestor', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.adminb.s': ADMIN_B };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const hag = (empresa_id, cliente_id, dias, status) => ({ id: `${empresa_id}-${cliente_id}-${dias}`, empresa_id, cliente_id, profissional_id: PROF, data: addDays(H, dias), horario: '10:00', status });
installMemoryBackend({
  empresas: [{ id: E, nome: 'A' }, { id: EB, nome: 'B' }],
  profissionais: [{ id: PROF, empresa_id: E, nome: 'Robson', ativo: true }],
  agendamentos: [
    hag(E, 'X1', -5, 'concluido'), hag(E, 'X2', -4, 'no_show'), hag(E, 'X3', -3, 'concluido'),
    hag(E, 'X4', -40, 'no_show'), // fora dos 30 dias padrão
    hag(EB, 'Y1', -2, 'no_show'), hag(EB, 'Y2', -2, 'no_show'), hag(EB, 'Y3', -1, 'no_show')
  ],
  comandos: [], comando_itens: []
});

let base;
function request(path, token = 'h.admin.s') {
  return new Promise((resolve, reject) => {
    http.get(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    }).on('error', reject);
  });
}
const code = r => r.data && r.data.error && r.data.error.code;

test('P07 rota: padrão = últimos 30 dias no fuso; números do tenant do req.auth', async () => {
  const r = await request('/api/relatorios/piloto');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.data.periodo, { de: addDays(H, -29), ate: H, hoje: H });
  assert.deepStrictEqual(nd(r.data.data.taxaFalta), [1, 3, 33.3]);
  assert.strictEqual(r.data.data.porProfissional[0].nome, 'Robson');
  const amplo = await request(`/api/relatorios/piloto?de=${addDays(H, -60)}&ate=${H}`);
  assert.deepStrictEqual(nd(amplo.data.data.taxaFalta), [2, 4, 50]);
});

test('P08 isolamento: empresa B só vê os seus; empresa_id na query é ignorado', async () => {
  const b = await request('/api/relatorios/piloto', 'h.adminb.s');
  assert.strictEqual(b.status, 200);
  assert.deepStrictEqual(nd(b.data.data.taxaFalta), [3, 3, 100]);
  assert.deepStrictEqual(b.data.data.porProfissional.map(p => p.nome), [null], 'nome de profissional de outra empresa não vaza');
  const a = await request(`/api/relatorios/piloto?empresa_id=${EB}`);
  assert.deepStrictEqual(nd(a.data.data.taxaFalta), [1, 3, 33.3]);
});

test('P09 RBAC: recepção 403; sem token 401', async () => {
  assert.strictEqual((await request('/api/relatorios/piloto', 'h.recep.s')).status, 403);
  assert.strictEqual((await request('/api/relatorios/piloto', null)).status, 401);
});

test('P10 datas inválidas e período > 366 dias → 422', async () => {
  for (const q of ['de=2026-02-30&ate=2026-03-10', 'de=abc', 'ate=2026-13-01', 'de=2026-03-10&ate=2026-03-01', 'de=2025-01-01&ate=2026-01-02']) {
    const r = await request(`/api/relatorios/piloto?${q}`);
    assert.strictEqual(r.status, 422, q);
    assert.ok(['INVALID_DATE', 'INVALID_PERIOD'].includes(code(r)), q);
  }
  assert.strictEqual((await request('/api/relatorios/piloto?de=2025-01-01&ate=2026-01-01')).status, 200, '366 dias é aceito');
});

test('C06 retorno por profissional da 1ª visita: cada um vê os seus clientes novos', () => {
  const r = computePiloto({
    de: '2026-03-01', ate: '2026-03-31', hoje: '2026-09-01',
    agendamentos: [
      ev('a1', 'c1', 'pA', '2026-03-05'), ev('a2', 'c1', 'pA', '2026-04-10'),   // pA: voltou com ele
      ev('b1', 'c2', 'pA', '2026-03-06'), ev('b2', 'c2', 'pB', '2026-04-12'),   // pA: voltou com outro
      ev('d1', 'c3', 'pB', '2026-03-07'),                                       // pB: não voltou
      ev('e1', 'c4', null, '2026-03-08'), ev('e2', 'c4', 'pA', '2026-04-01')    // 1ª visita sem profissional: fora da quebra
    ]
  });
  const por = Object.fromEntries(r.porProfissional.map(p => [p.profissionalId, p.retornoClienteNovo]));
  assert.deepStrictEqual(por.pA.categorias, { voltouMesmoProfissional: 1, voltouOutroProfissional: 1, voltouSemInfoProfissional: 0, naoVoltou: 0 });
  assert.deepStrictEqual([por.pA.numerador, por.pA.denominador, por.pA.taxa], [2, 2, 100]);
  assert.deepStrictEqual(por.pB.categorias, { voltouMesmoProfissional: 0, voltouOutroProfissional: 0, voltouSemInfoProfissional: 0, naoVoltou: 1 });
  assert.strictEqual(por.pA.referencia, undefined, 'a quebra não traz faixa de mercado');
});

test('C05 rota: retornoDias=90 e 120 aceitos e devolvidos; outro valor = 422', async () => {
  for (const d of [60, 90, 120]) {
    const r = await request(`/api/relatorios/piloto?retornoDias=${d}`);
    assert.deepStrictEqual([r.status, r.data.data.retornoClienteNovo.janelaDias], [200, d], String(d));
  }
  assert.strictEqual((await request('/api/relatorios/piloto')).data.data.retornoClienteNovo.janelaDias, 60, 'padrão 60');
  for (const q of ['30', '91', 'abc', '']) {
    const r = await request(`/api/relatorios/piloto?retornoDias=${q}`);
    assert.deepStrictEqual([r.status, code(r)], [422, 'INVALID_FIELD'], q);
  }
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const origErr = console.error; console.error = () => {};
  let passed = 0; let failed = 0;
  for (const t of tests) {
    try { await t.f(); passed++; process.stdout.write(`✓ ${t.n}\n`); }
    catch (err) { failed++; process.stdout.write(`✗ ${t.n}\n  ${err.message}\n`); }
  }
  console.error = origErr;
  server.close();
  console.log(`\nPiloto Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();
