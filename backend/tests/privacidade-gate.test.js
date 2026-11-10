// Privacidade Gate (D-018): o aviso de privacidade é aceito ao criar a conta e entrar.
// O servidor guarda versão e data do aceite e só registra a versão vigente.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-priv-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const tests = [];
const test = (n, f) => tests.push({ n, f });
const E = env.DEFAULT_EMPRESA_ID;
const U = { ana: 'c0000000-0000-4000-8000-0000000000e1', bia: 'c0000000-0000-4000-8000-0000000000e2', inativo: 'c0000000-0000-4000-8000-0000000000e3' };
// Tokens em formato de JWT (três partes): a rota só aceita principal de usuário.
const tokens = { 'h.ana.s': U.ana, 'h.bia.s': U.bia, 'h.inativo.s': U.inativo };
const aceites = new Map();
const comAceite = {
  async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t], privacy: aceites.get(tokens[t]) || null }; },
  async acceptPrivacy(t, versao) { const a = { versao, aceito_em: new Date().toISOString() }; aceites.set(tokens[t], a); return a; }
};
const semAceite = { getUser: comAceite.getUser };

setIdentityStore(createMemoryIdentityStore({
  app_users: [{ id: U.ana, email: 'ana@t', nome: 'Ana', ativo: true }, { id: U.bia, email: 'bia@t', nome: 'Bia', ativo: true }, { id: U.inativo, email: 'x@t', nome: 'X', ativo: false }],
  unidades: [],
  empresa_memberships: [{ id: 'm1', empresa_id: E, user_id: U.ana, role: 'admin', status: 'ativo' }, { id: 'm2', empresa_id: E, user_id: U.bia, role: 'gestor', status: 'ativo' }],
  membership_units: []
}));
installMemoryBackend({ empresas: [{ id: E, nome: 'A' }] });
setAuthProvider(comAceite);

let base;
function request(method, path_, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + path_, { method, headers }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const me = async token => (await request('GET', '/api/me', { token })).data.data.privacidade;
const aceitar = (token, versao) => request('POST', '/api/auth/privacidade/aceite', { token, body: versao === undefined ? {} : { versao } });
const V = env.PRIVACY_NOTICE_VERSION;

test('V01 conta que nunca aceitou: /me informa a versão vigente e "pendente"', async () => {
  assert.deepStrictEqual(await me('h.ana.s'), { versaoAtual: V, versaoAceita: null, aceitoEm: null, pendente: true });
});

test('V02 versão errada, ausente ou inventada → 422 e nada é gravado', async () => {
  for (const v of [undefined, '', '1999-01-01', `${V} `, 'qualquer']) {
    const r = await aceitar('h.ana.s', v);
    assert.deepStrictEqual([r.status, code(r), r.data.error.details.versaoAtual], [422, 'PRIVACY_VERSION_MISMATCH', V], String(v));
  }
  assert.strictEqual(aceites.size, 0);
});

test('V03 sem token, token legado e conta desativada não registram aceite', async () => {
  assert.strictEqual((await aceitar(undefined, V)).status, 401);
  assert.strictEqual((await aceitar(process.env.API_ACCESS_TOKEN, V)).status, 401);
  assert.strictEqual((await aceitar('h.falso.s', V)).status, 401);
  const inativo = await aceitar('h.inativo.s', V);
  assert.deepStrictEqual([inativo.status, code(inativo)], [403, 'USER_INACTIVE']);
  assert.strictEqual(aceites.size, 0);
});

test('V04 aceite da versão vigente grava versão e data; vale só para quem aceitou', async () => {
  const r = await aceitar('h.ana.s', V);
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.deepStrictEqual([r.data.data.versaoAceita, r.data.data.pendente], [V, false]);
  assert.match(r.data.data.aceitoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  const ana = await me('h.ana.s');
  assert.deepStrictEqual([ana.versaoAceita, ana.pendente, ana.aceitoEm], [V, false, r.data.data.aceitoEm]);
  assert.strictEqual((await me('h.bia.s')).pendente, true, 'o aceite da Ana não vale para a Bia');
});

test('V05 aviso muda de versão → quem tinha aceitado volta a ficar pendente', async () => {
  const original = env.PRIVACY_NOTICE_VERSION;
  env.PRIVACY_NOTICE_VERSION = '2099-01-01';
  try {
    const ana = await me('h.ana.s');
    assert.deepStrictEqual([ana.versaoAtual, ana.versaoAceita, ana.pendente], ['2099-01-01', original, true]);
    assert.strictEqual((await aceitar('h.ana.s', original)).status, 422, 'versão antiga não é mais aceita');
  } finally { env.PRIVACY_NOTICE_VERSION = original; }
});

test('V06 provedor sem registro de aceite: nunca "pendente" (não trava ambiente antigo) e a rota responde 503', async () => {
  setAuthProvider(semAceite);
  try {
    assert.strictEqual((await me('h.bia.s')).pendente, false);
    const r = await aceitar('h.bia.s', V);
    assert.deepStrictEqual([r.status, code(r)], [503, 'PRIVACY_NOT_SUPPORTED']);
  } finally { setAuthProvider(comAceite); }
});

test('V07 o provedor real guarda o aceite em app_metadata (só o servidor altera), nunca em user_metadata', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/auth/provider.js'), 'utf8');
  assert.match(src, /app_metadata: \{ hopeos_privacy: aceite \}/);
  assert.ok(!/user_metadata/.test(src), 'user_metadata pode ser alterado pelo próprio usuário');
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const oe = console.error; const ow = console.warn; console.error = () => {}; console.warn = () => {};
  let passed = 0; let failed = 0;
  for (const t of tests) {
    try { await t.f(); passed++; process.stdout.write(`✓ ${t.n}\n`); }
    catch (err) { failed++; process.stdout.write(`✗ ${t.n}\n  ${err.message}\n`); }
  }
  console.error = oe; console.warn = ow;
  server.close();
  console.log(`\nPrivacidade Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();
