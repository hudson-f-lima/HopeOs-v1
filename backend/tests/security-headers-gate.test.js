// Security Headers Gate: headers de segurança da API (middleware próprio, sem
// helmet), ausência de X-Powered-By, HSTS só em produção e limite do corpo JSON.
// HTTP real contra o app (listen(0)); não toca banco.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-sec-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { app, JSON_BODY_LIMIT } = require('../src/app');
const { HSTS } = require('../src/middleware/securityHeaders');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
let base;

function request(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const ESPERADOS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-site'
};
function confereHeaders(res, rotulo) {
  for (const [k, v] of Object.entries(ESPERADOS)) assert.strictEqual(res.headers[k], v, `${rotulo}: ${k}`);
  assert.strictEqual(res.headers['x-powered-by'], undefined, `${rotulo}: X-Powered-By presente`);
}

test('01 /api/health (200) tem os headers e não tem X-Powered-By', async () => {
  const res = await request('GET', '/api/health');
  assert.strictEqual(res.status, 200);
  confereHeaders(res, 'health');
});

test('02 rota protegida sem token (401) também tem os headers', async () => {
  const res = await request('GET', '/api/clientes');
  assert.strictEqual(res.status, 401);
  confereHeaders(res, '401');
});

test('03 rota inexistente (404) e redirect de / têm os headers', async () => {
  confereHeaders(await request('GET', '/nao-existe'), '404');
  const r = await request('GET', '/');
  assert.strictEqual(r.status, 302);
  confereHeaders(r, 'redirect');
});

test('04 preflight CORS da PWA continua passando e leva os headers', async () => {
  const res = await request('OPTIONS', '/api/clientes', { headers: { origin: 'http://localhost:5599', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5599');
  confereHeaders(res, 'preflight');
});

test('05 HSTS ausente fora de produção', async () => {
  const anterior = env.NODE_ENV;
  env.NODE_ENV = 'development';
  try {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.headers['strict-transport-security'], undefined);
  } finally { env.NODE_ENV = anterior; }
});

test('06 HSTS presente em produção', async () => {
  const anterior = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.headers['strict-transport-security'], HSTS);
    assert.match(HSTS, /max-age=31536000/);
  } finally { env.NODE_ENV = anterior; }
});

test('07 corpo JSON acima do limite = 413 com headers; abaixo passa do parser', async () => {
  const limiteBytes = Number(String(JSON_BODY_LIMIT).replace(/kb$/i, '')) * 1024;
  assert.ok(limiteBytes > 0 && limiteBytes < 5 * 1024 * 1024, 'limite deve ter sido reduzido de 5mb');
  const corpo = n => JSON.stringify({ nome: 'x'.repeat(n) });
  const grande = await request('POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: corpo(limiteBytes + 10) });
  assert.strictEqual(grande.status, 413);
  confereHeaders(grande, '413');
  const ok = await request('POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: corpo(limiteBytes - 1024) });
  assert.notStrictEqual(ok.status, 413);
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed += 1; console.log(`✓ ${t.name}`); } catch (err) { console.error(`✕ ${t.name}`); console.error(err); }
  }
  await new Promise(r => server.close(r));
  console.log(`\nSecurity Headers Gate: ${passed}/${tests.length} testes verdes.`);
  if (passed !== tests.length) process.exit(1);
})();
