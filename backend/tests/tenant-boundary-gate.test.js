const assert = require('assert');
const http = require('http');
const { app } = require('../src/app');
const { env } = require('../src/config/env');
const { requireAuth } = require('../src/middleware/auth');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('01 requireAuth popula req.auth com empresa_id do servidor, ignorando claims do cliente', async () => {
  const originalToken = env.API_ACCESS_TOKEN;
  env.API_ACCESS_TOKEN = 'gate-token';
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer gate-token' },
    body: { empresa_id: 'attacker-empresa', unit_id: 'attacker-unit', role: 'admin' },
    query: { empresa_id: 'attacker-empresa', unit_id: 'attacker-unit' }
  };
  let nextCalled = false;
  requireAuth(req, {}, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.ok(req.auth, 'req.auth deve existir apos requireAuth');
  assert.strictEqual(req.auth.empresa_id, env.DEFAULT_EMPRESA_ID);
  assert.notStrictEqual(req.auth.empresa_id, 'attacker-empresa');
  assert.strictEqual(req.auth.user_id, null);
  assert.strictEqual(req.auth.actor_id, null);
  assert.strictEqual(req.auth.role, null);
  assert.deepStrictEqual(req.auth.unit_ids, []);
  env.API_ACCESS_TOKEN = originalToken;
});

test('02 req.auth.empresa_id acompanha DEFAULT_EMPRESA_ID do servidor (nao e valor fixo no codigo)', async () => {
  const originalToken = env.API_ACCESS_TOKEN;
  const originalEmpresa = env.DEFAULT_EMPRESA_ID;
  env.API_ACCESS_TOKEN = 'gate-token';
  env.DEFAULT_EMPRESA_ID = '11111111-1111-1111-1111-111111111111';
  const req = { method: 'GET', headers: { authorization: 'Bearer gate-token' }, body: {}, query: {} };
  requireAuth(req, {}, () => {});
  assert.strictEqual(req.auth.empresa_id, '11111111-1111-1111-1111-111111111111');
  env.API_ACCESS_TOKEN = originalToken;
  env.DEFAULT_EMPRESA_ID = originalEmpresa;
});

let server;
let port;
let baseUrl;

async function setupServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function teardownServer() {
  return new Promise((resolve) => { server.close(resolve); });
}

async function request(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = Buffer.byteLength(payload);
    }
    const req = http.request(baseUrl + path, { method, headers: reqHeaders }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
        resolve({ statusCode: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function authHeaders() {
  return { authorization: `Bearer ${env.API_ACCESS_TOKEN}` };
}

test('03 GET /api/clientes so retorna linhas do empresa_id do servidor', async () => {
  const res = await request('GET', '/api/clientes', { headers: authHeaders() });
  assert.strictEqual(res.statusCode, 200);
  for (const row of res.data.data) {
    assert.strictEqual(row.empresa_id, env.DEFAULT_EMPRESA_ID);
  }
});

test('04 GET /api/clientes ignora empresa_id enviado via query string', async () => {
  const baseline = await request('GET', '/api/clientes', { headers: authHeaders() });
  const withFakeQuery = await request('GET', '/api/clientes?empresa_id=00000000-0000-0000-0000-000000000099', { headers: authHeaders() });
  assert.strictEqual(withFakeQuery.statusCode, 200);
  assert.strictEqual(withFakeQuery.data.data.length, baseline.data.data.length);
});

test('05 GET /api/agenda so retorna linhas do empresa_id do servidor', async () => {
  const res = await request('GET', '/api/agenda', { headers: authHeaders() });
  assert.strictEqual(res.statusCode, 200);
  for (const row of res.data.data) {
    assert.strictEqual(row.empresa_id, env.DEFAULT_EMPRESA_ID);
  }
});

test('06 POST /api/clientes com empresa_id no payload = 422 FORBIDDEN_FIELD', async () => {
  const res = await request('POST', '/api/clientes', {
    headers: authHeaders(),
    body: { nome: 'Gate Tenant', empresa_id: '00000000-0000-0000-0000-000000000099' }
  });
  assert.strictEqual(res.statusCode, 422);
  assert.strictEqual(res.data.error.code, 'FORBIDDEN_FIELD');
});

test('07 POST /api/clientes com unit_id no payload = 422 FORBIDDEN_FIELD', async () => {
  const res = await request('POST', '/api/clientes', {
    headers: authHeaders(),
    body: { nome: 'Gate Tenant', unit_id: 'unidade-fantasma' }
  });
  assert.strictEqual(res.statusCode, 422);
  assert.strictEqual(res.data.error.code, 'FORBIDDEN_FIELD');
});

test('08 PATCH /api/agenda/:id/duracao com id inexistente = 404, nao aplica escrita silenciosa', async () => {
  const res = await request('PATCH', '/api/agenda/00000000-0000-0000-0000-000000000000/duracao', {
    headers: authHeaders(),
    body: { duracaoMin: 30 }
  });
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.data.error.code, 'AGENDAMENTO_NOT_FOUND');
});

test('09 vinculo agendamento do checkout/close usa validateUUID + updateScoped (mecanismo real, nao so a validacao de itens/payments)', async () => {
  // Prova direta do que foi alterado no bloco de vinculo agenda<-checkout/close:
  // (a) agendamentoId nao-UUID e rejeitado por validateUUID antes de tocar o banco;
  // (b) updateScoped rejeita id que nao existe/nao pertence ao tenant, em vez de
  // aplicar update silencioso -- e essa a mesma chamada usada na rota.
  const { validateUUID } = require('../src/validators/cadastros.validator');
  const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');

  assert.throws(() => validateUUID('nao-e-um-uuid', 'agendamentoId'));

  const repo = new SupabaseRepository(env.DEFAULT_EMPRESA_ID);
  await assert.rejects(() => repo.updateScoped('agendamentos', '00000000-0000-0000-0000-000000000000', {
    status: 'concluido',
    updated_at: new Date().toISOString()
  }));
});

test('10 SupabaseRepository.insert ignora payload.empresa_id malicioso e grava this.empresaId', async () => {
  const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
  const { getSupabase } = require('../src/db/supabaseClient');
  const repo = new SupabaseRepository(env.DEFAULT_EMPRESA_ID);
  let created = null;
  try {
    created = await repo.insert('agendamentos', {
      empresa_id: '11111111-1111-1111-1111-111111111111',
      data: '2026-01-01',
      horario: '10:00:00'
    });
    assert.strictEqual(created.empresa_id, repo.empresaId);
    assert.notStrictEqual(created.empresa_id, '11111111-1111-1111-1111-111111111111');
  } finally {
    if (created) await getSupabase().from('agendamentos').delete().eq('id', created.id);
  }
});

test('11 SupabaseRepository.insert ignora payload.empresaId (camelCase) malicioso e grava this.empresaId', async () => {
  const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
  const { getSupabase } = require('../src/db/supabaseClient');
  const repo = new SupabaseRepository(env.DEFAULT_EMPRESA_ID);
  let created = null;
  try {
    created = await repo.insert('agendamentos', {
      empresaId: '22222222-2222-2222-2222-222222222222',
      data: '2026-01-02',
      horario: '11:00:00'
    });
    assert.strictEqual(created.empresa_id, repo.empresaId);
    assert.notStrictEqual(created.empresa_id, '22222222-2222-2222-2222-222222222222');
  } finally {
    if (created) await getSupabase().from('agendamentos').delete().eq('id', created.id);
  }
});

test('12 SupabaseRepository.insert falha fechado sem contexto de tenant valido, antes de tocar o banco', async () => {
  const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
  const semTenant = new SupabaseRepository(null);
  await assert.rejects(
    () => semTenant.insert('agendamentos', { data: '2026-01-03', horario: '12:00:00' }),
    (err) => err.code === 'TENANT_CONTEXT_MISSING'
  );

  const tenantVazio = new SupabaseRepository('');
  await assert.rejects(
    () => tenantVazio.insert('agendamentos', { data: '2026-01-03', horario: '12:00:00' }),
    (err) => err.code === 'TENANT_CONTEXT_MISSING'
  );
});

async function runAll() {
  await setupServer();
  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`✓ ${t.name}`);
    } catch (err) {
      console.error(`✕ ${t.name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }
  await teardownServer();
  console.log(`\nTenant Boundary Gate: ${passed}/${tests.length} testes verdes.`);
  if (passed !== tests.length) process.exit(1);
}

runAll();
