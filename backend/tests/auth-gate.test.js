const assert = require('assert');
const http = require('http');
const { app } = require('../src/app');
const { env } = require('../src/config/env');
const { extractBearer, safeEquals } = require('../src/middleware/auth');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('01 extractBearer retorna token de Authorization', async () => {
  assert.strictEqual(extractBearer({ headers: { authorization: 'Bearer token-123' } }), 'token-123');
});

test('02 esquema não-Bearer = 401 (extractBearer retorna null)', async () => {
  assert.strictEqual(extractBearer({ headers: { authorization: 'Basic dGVzdA==' } }), null);
});

test('03 safeEquals comparação segura não quebra com tamanhos diferentes', async () => {
  assert.strictEqual(safeEquals('abc', 'abc'), true);
  assert.strictEqual(safeEquals('abc', 'abcd'), false);
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
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

async function request(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(baseUrl + path, { method, headers }, (res) => {
      resolve(res);
    });
    req.on('error', reject);
    req.end();
  });
}

test('04 /api/health sem token = 200', async () => {
  const res = await request('GET', '/api/health');
  assert.strictEqual(res.statusCode, 200);
});

test('05 rota sensível sem token = 401', async () => {
  const res = await request('GET', '/api/clientes');
  assert.strictEqual(res.statusCode, 401);
});

test('06 token inválido = 401', async () => {
  const res = await request('GET', '/api/clientes', { authorization: 'Bearer fake' });
  assert.strictEqual(res.statusCode, 401);
});

test('07 token válido atravessa middleware', async () => {
  const originalToken = env.API_ACCESS_TOKEN;
  env.API_ACCESS_TOKEN = 'test-token';
  const res = await request('GET', '/api/clientes', { authorization: 'Bearer test-token' });
  // O middleware deve dar bypass e o erro seguinte será do controller ou db (ex: 200, 422, 500)
  assert.notStrictEqual(res.statusCode, 401);
  assert.notStrictEqual(res.statusCode, 503);
  env.API_ACCESS_TOKEN = originalToken;
});

test('08 sem API_ACCESS_TOKEN configurado = 503 fail-closed', async () => {
  const originalToken = env.API_ACCESS_TOKEN;
  env.API_ACCESS_TOKEN = '';
  const res = await request('GET', '/api/clientes', { authorization: 'Bearer whatever' });
  assert.strictEqual(res.statusCode, 503);
  env.API_ACCESS_TOKEN = originalToken;
});

test('09 rota sensível POST sem token = 401', async () => {
  const res = await request('POST', '/api/checkout/close');
  assert.strictEqual(res.statusCode, 401);
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
  console.log(`\nAuth Gate: ${passed}/${tests.length} testes verdes.`);
  if (passed !== tests.length) process.exit(1);
}

runAll();
