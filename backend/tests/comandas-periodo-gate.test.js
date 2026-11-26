// Comandas por período Gate (D-082): GET /api/comandas com `data` (um dia, como antes) ou `inicio`/`fim`.
// HTTP real contra o app; banco e identidade em memória. Hoje = 2026-11-26.
//
// Fixture (centavos; esperado à mão):
//   k1 2026-11-03 10:00  recebido 5000
//   k2 2026-11-20 09:00  recebido 8000, estorno parcial reembolsando 2000
//   k3 2026-11-20 15:00  recebido 3000
//   k4 2026-10-31 18:00  recebido 9999  (fora de novembro)
//   kb empresa B, 2026-11-20, 7777 (nunca aparece)
// Novembro (01–26): 3 comandas, recebido 5000+8000+3000 = 16000, estornado 2000; ordem k3, k2, k1.
// Só 20/11 via `data`: 2 comandas (k3, k2), recebido 11000.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-periodo-token';
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
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000fb';
const ADMIN = 'c0000000-0000-4000-8000-0000000000f1';
const PROFU = 'c0000000-0000-4000-8000-0000000000f3';
const UNIT = 'f0000000-0000-4000-8000-0000000000f1';
const ANA = 'a0000000-0000-4000-8000-0000000000f2';

setIdentityStore(createMemoryIdentityStore({
  app_users: [{ id: ADMIN, email: 'admin@p.test', nome: 'Admin', ativo: true }, { id: PROFU, email: 'ana@p.test', nome: 'Ana', ativo: true }],
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: PROFU, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'p.admin.s': ADMIN, 'p.prof.s': PROFU };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const com = (id, data, hora, recebido, empresa_id = E) => ({ id, empresa_id, data, hora, status: 'fechado', cliente_id: null, total_recebido_centavos: recebido, itens_liquidos_centavos: recebido });
installMemoryBackend({
  empresas: [{ id: E, nome: 'A', horario_por_dia: {} }, { id: EB, nome: 'B', horario_por_dia: {} }],
  profissionais: [{ id: ANA, empresa_id: E, nome: 'Ana', ativo: true }],
  clientes: [],
  comandos: [com('k1', '2026-11-03', '10:00:00', 5000), com('k2', '2026-11-20', '09:00:00', 8000), com('k3', '2026-11-20', '15:00:00', 3000), com('k4', '2026-10-31', '18:00:00', 9999), com('kb', '2026-11-20', '12:00:00', 7777, EB)],
  comando_itens: [], comando_pagamentos: [],
  comanda_estornos: [{ id: 'e2', empresa_id: E, comando_id: 'k2', tipo: 'parcial', data: '2026-11-21', reembolso_centavos: 2000, itens_centavos: 2000 }],
  comanda_estorno_itens: [], comanda_estorno_pagamentos: []
});

let base;
function request(p, token = 'p.admin.s') {
  return new Promise((resolve, reject) => {
    const req = http.request(base + p, { headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject); req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('CP01 novembro: 3 comandas da empresa, mais recentes primeiro; resumo do servidor (recebido 16000, estornado 2000)', async () => {
  const r = await request('/api/comandas?inicio=2026-11-01&fim=2026-11-26');
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const d = r.data.data;
  assert.deepStrictEqual([d.inicio, d.fim], ['2026-11-01', '2026-11-26']);
  assert.deepStrictEqual(d.comandas.map(c => c.id), ['k3', 'k2', 'k1']);
  assert.deepStrictEqual(d.resumo, { comandas: 3, recebidoCentavos: 16000, estornadoCentavos: 2000 });
});

test('CP02 `data` continua valendo (um dia): 20/11 → k3, k2; resumo 11000', async () => {
  const d = (await request('/api/comandas?data=2026-11-20')).data.data;
  assert.deepStrictEqual([d.data, d.inicio, d.fim], ['2026-11-20', '2026-11-20', '2026-11-20']);
  assert.deepStrictEqual(d.comandas.map(c => c.id), ['k3', 'k2']);
  assert.strictEqual(d.resumo.recebidoCentavos, 11000);
});

test('CP03 intervalo inválido: invertido, mais de 92 dias, data inválida, só fim → 422', async () => {
  assert.strictEqual(code(await request('/api/comandas?inicio=2026-11-20&fim=2026-11-01')), 'INVALID_RANGE');
  assert.strictEqual(code(await request('/api/comandas?inicio=2026-08-01&fim=2026-11-01')), 'RANGE_TOO_LONG'); // 93 dias
  assert.strictEqual((await request('/api/comandas?inicio=2026-08-27&fim=2026-11-26')).status, 200); // 92 dias
  assert.strictEqual(code(await request('/api/comandas?inicio=2026-13-01&fim=2026-11-26')), 'INVALID_DATE');
  assert.strictEqual(code(await request('/api/comandas?fim=2026-11-26')), 'INVALID_DATE');
});

test('CP04 permissão: profissional sem comanda:historico → 403; sem token → 401', async () => {
  assert.strictEqual((await request('/api/comandas?inicio=2026-11-01&fim=2026-11-26', 'p.prof.s')).status, 403);
  assert.strictEqual((await request('/api/comandas?inicio=2026-11-01&fim=2026-11-26', null)).status, 401);
});

(async () => {
  clock.definirRelogio(() => new Date('2026-11-26T15:00:00Z'));
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
  console.log(`\nComandas por período Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();
