// Marcadores Gate (D-077, cards etapa 2): ícones do card calculados no servidor a partir do que está
// gravado. HTTP real contra o app; banco e identidade em memória. Hoje = 2026-11-22; dia da agenda D = 2026-11-24.
//
// Fixture (esperado à mão, na ordem do card):
//   a1 C1 09:00 Ana   — nenhum histórico; evento origem_link_publico             → [primeira_visita, link]
//   a2 C2 10:00 Rob   — concluído em 10/11; serie_id; evento criado com espera   → [recorrente, espera]
//   a3 C3 11:00 Rob   — 03/11 concluído, 10/11 falta, 17/11 falta (2 seguidas ≥ alerta 2) → [faltas]
//   a4 C4 12:00 Ana   — comanda fechada 01/11 (visita sem agendamento); assinatura mensal desde
//                        01/11 com novembro pago → em dia                         → [assinatura]
//   a5 C5 13:00 Rob   — só uma falta em 25/11 (DEPOIS do horário): não conta     → [primeira_visita]
//   a6 C6 14:00 Rob   — assinatura desde 01/10 sem pagamento: outubro vencido há 52 dias > 7 → suspensa
//                                                                                → [assinatura_atraso, primeira_visita]
//   a7 (sem cliente) 15:00 Rob                                                   → []
//   a8 concluído pelo caixa (evento status→concluido, origem checkout)          → pago
//   a9 concluído à mão (origem agenda, sem comanda)                              → não pago
// Empresa B tem um evento 'criado' com espera_baixada apontando para a1: não pode virar ícone em A.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-marcadores-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { marcadoresDoDia } = require('../src/engines/MarcadoresAgendaEngine');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000ee';
const ADMIN = 'c0000000-0000-4000-8000-0000000000e1';
const RECEP = 'c0000000-0000-4000-8000-0000000000e2';
const PROFU = 'c0000000-0000-4000-8000-0000000000e3';
const UNIT = 'f0000000-0000-4000-8000-0000000000e1';
const ROB = 'a0000000-0000-4000-8000-0000000000e1';
const ANA = 'a0000000-0000-4000-8000-0000000000e2';
const SERV = 'b0000000-0000-4000-8000-0000000000e1';
const C = n => `d0000000-0000-4000-8000-00000000000${n}`;
const A = n => `90000000-0000-4000-8000-00000000000${n}`;
const D = '2026-11-24';
const SERIE = '80000000-0000-4000-8000-0000000000e1';

setIdentityStore(createMemoryIdentityStore({
  app_users: [
    { id: ADMIN, email: 'admin@m.test', nome: 'Admin', ativo: true },
    { id: RECEP, email: 'recep@m.test', nome: 'Recep', ativo: true },
    { id: PROFU, email: 'ana@m.test', nome: 'Ana', ativo: true }
  ],
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: PROFU, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'm.admin.s': ADMIN, 'm.recep.s': RECEP, 'm.prof.s': PROFU };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const ag = (id, cliente, prof, data, horario, status = 'agendado', extra = {}) => ({ id, empresa_id: E, cliente_id: cliente, profissional_id: prof, servico_id: SERV, data, horario, duracao_min: 30, status, ...extra });
const HIST = [
  ag('h2', C(2), ROB, '2026-11-10', '10:00:00', 'concluido'),
  ag('h3a', C(3), ROB, '2026-11-03', '11:00:00', 'concluido'),
  ag('h3b', C(3), ROB, '2026-11-10', '11:00:00', 'no_show'),
  ag('h3c', C(3), ROB, '2026-11-17', '11:00:00', 'no_show'),
  ag('h5', C(5), ROB, '2026-11-25', '13:00:00', 'no_show')
];
const DIA = [
  ag(A(1), C(1), ANA, D, '09:00:00'),
  ag(A(2), C(2), ROB, D, '10:00:00', 'agendado', { serie_id: SERIE, serie_seq: 3 }),
  ag(A(3), C(3), ROB, D, '11:00:00'),
  ag(A(4), C(4), ANA, D, '12:00:00'),
  ag(A(5), C(5), ROB, D, '13:00:00'),
  ag(A(6), C(6), ROB, D, '14:00:00'),
  ag(A(7), null, ROB, D, '15:00:00'),
  ag(A(8), null, ROB, D, '16:00:00', 'concluido'),
  ag(A(9), null, ROB, D, '17:00:00', 'concluido')
];
const PLANO = { id: 'pl1', empresa_id: E, nome: 'Mensal', preco_centavos: 9900, periodicidade: 'mensal', tipo_vencimento: 'base_contratacao', dia_vencimento: null, tolerancia_dias: 7 };

const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'A', horario_por_dia: {}, regua_alerta_faltas: 2, regua_sinal_faltas: 3 }, { id: EB, nome: 'B', horario_por_dia: {} }],
  servicos: [{ id: SERV, empresa_id: E, nome: 'Corte', valor_centavos: 3000, duracao_min: 30, ativo: true }],
  profissionais: [{ id: ROB, empresa_id: E, nome: 'Robson', ativo: true }, { id: ANA, empresa_id: E, nome: 'Ana', ativo: true }],
  clientes: [1, 2, 3, 4, 5, 6].map(n => ({ id: C(n), empresa_id: E, nome: 'Cliente ' + n, ativo: true })),
  agendamentos: [...HIST, ...DIA],
  comandos: [{ id: 'k4', empresa_id: E, cliente_id: C(4), data: '2026-11-01', status: 'fechado' }],
  agendamento_eventos: [
    { id: 'e1', empresa_id: E, agendamento_id: A(1), tipo: 'origem_link_publico', payload: {}, created_at: '2026-11-20T10:00:00Z' },
    { id: 'e2', empresa_id: E, agendamento_id: A(2), tipo: 'criado', payload: { espera_baixada: { id: 'w1' } }, created_at: '2026-11-20T10:00:00Z' },
    { id: 'e8', empresa_id: E, agendamento_id: A(8), tipo: 'status', payload: { de: 'em_atendimento', para: 'concluido', origem: 'checkout' }, created_at: '2026-11-24T16:40:00Z' },
    { id: 'e9', empresa_id: E, agendamento_id: A(9), tipo: 'status', payload: { de: 'em_atendimento', para: 'concluido', origem: 'agenda' }, created_at: '2026-11-24T17:40:00Z' },
    { id: 'eB', empresa_id: EB, agendamento_id: A(1), tipo: 'criado', payload: { espera_baixada: { id: 'wB' } }, created_at: '2026-11-20T10:00:00Z' }
  ],
  assinatura_planos: [PLANO],
  assinaturas: [
    { id: 's4', empresa_id: E, cliente_id: C(4), plano_id: 'pl1', inicio: '2026-11-01', status: 'ativa' },
    { id: 's6', empresa_id: E, cliente_id: C(6), plano_id: 'pl1', inicio: '2026-10-01', status: 'ativa' }
  ],
  assinatura_cobrancas: [{ id: 'cb4', empresa_id: E, assinatura_id: 's4', ciclo_inicio: '2026-11-01', vencimento: '2026-11-01', estado: 'paga', valor_centavos: 9900, pago_em: '2026-11-01' }]
});

const ESPERADO = {
  [A(1)]: ['primeira_visita', 'link'],
  [A(2)]: ['recorrente', 'espera'],
  [A(3)]: ['faltas'],
  [A(4)]: ['assinatura'],
  [A(5)]: ['primeira_visita'],
  [A(6)]: ['assinatura_atraso', 'primeira_visita'],
  [A(7)]: [],
  [A(8)]: [],
  [A(9)]: []
};

let base;
function request(p, token = 'm.recep.s') {
  return new Promise((resolve, reject) => {
    const req = http.request(base + p, { headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject); req.end();
  });
}
const porId = r => Object.fromEntries(r.data.data.map(a => [a.id, a.marcadores]));

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('M01 recepção: cada agendamento do dia traz os ícones esperados, na ordem do card', async () => {
  const r = await request(`/api/agenda?data=${D}&marcadores=1`);
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.deepStrictEqual(porId(r), ESPERADO);
});

test('M02 sem marcadores=1 a resposta não muda (nenhum campo novo, nenhuma leitura extra)', async () => {
  const r = await request(`/api/agenda?data=${D}`);
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.data.every(a => !Object.hasOwn(a, 'marcadores')));
});

test('M03 profissional: só os próprios horários e nenhum ícone de assinatura (sem assinatura:ver)', async () => {
  const r = await request(`/api/agenda?data=${D}&marcadores=1`, 'm.prof.s');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(porId(r), { [A(1)]: ['primeira_visita', 'link'], [A(4)]: [] });
});

test('M04 isolamento: evento da empresa B apontando para a1 não vira ícone de espera em A', async () => {
  const r = await request(`/api/agenda?data=${D}&marcadores=1`, 'm.admin.s');
  assert.ok(!porId(r)[A(1)].includes('espera'));
});

test('M08 pago: só o concluído pelo caixa; o concluído à mão e o agendado não', async () => {
  const r = await request(`/api/agenda?data=${D}&marcadores=1`);
  const pago = Object.fromEntries(r.data.data.map(a => [a.id, a.pago]));
  assert.deepStrictEqual([pago[A(8)], pago[A(9)], pago[A(1)]], [true, false, false]);
});

test('M05 sem token = 401', async () => {
  assert.strictEqual((await request(`/api/agenda?data=${D}&marcadores=1`, null)).status, 401);
});

test('M06 motor puro: falta no mesmo dia, antes do horário, conta; depois, não', () => {
  const base = { cliente_id: C(9), data: D };
  const hist = [
    { id: 'x1', ...base, data: '2026-11-17', horario: '09:00', status: 'no_show' },
    { id: 'x2', ...base, horario: '08:00', status: 'no_show' },
    { id: 'x3', ...base, horario: '18:00', status: 'no_show' }
  ];
  const r = marcadoresDoDia({ agendamentos: [{ id: 'y', ...base, horario: '10:00' }], historico: hist, hoje: '2026-11-22' });
  assert.ok(r.y.includes('faltas'), 'duas faltas antes das 10:00 (17/11 e 08:00 de hoje)');
  const r2 = marcadoresDoDia({ agendamentos: [{ id: 'y', ...base, horario: '07:00' }], historico: hist, hoje: '2026-11-22' });
  assert.ok(!r2.y.includes('faltas'), 'às 07:00 só a de 17/11 veio antes');
});

test('M07 motor puro: cliente com uma assinatura em dia e outra suspensa é assinante', () => {
  const r = marcadoresDoDia({
    agendamentos: [{ id: 'y', cliente_id: C(4), data: D, horario: '09:00' }],
    assinaturas: [{ id: 's4', cliente_id: C(4), plano_id: 'pl1', inicio: '2026-11-01', status: 'ativa' }, { id: 'sX', cliente_id: C(4), plano_id: 'pl1', inicio: '2026-09-01', status: 'ativa' }],
    planos: [PLANO], cobrancas: db.assinatura_cobrancas, hoje: '2026-11-22', verAssinatura: true
  });
  assert.ok(r.y.includes('assinatura') && !r.y.includes('assinatura_atraso'), JSON.stringify(r.y));
});

(async () => {
  clock.definirRelogio(() => new Date('2026-11-22T15:00:00Z'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const origErr = console.error; console.error = () => {};
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; console.log(`✓ ${n}`); } catch (err) { console.log(`✗ ${n}\n   ${err.message}`); }
  }
  console.error = origErr;
  server.close();
  console.log(`\nMarcadores Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();
