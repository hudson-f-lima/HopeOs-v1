// Saúde do banco (D-059): GET /api/health/banco. Banco em memória não serve aqui: a consulta é
// trocada por uma falsa para provar cada caso.
//   H01 banco responde → 200 { ok: true, banco: 'ok' }, sem login;
//   H02 banco falha → 503 { banco: 'indisponivel' }, sem o detalhe do erro;
//   H03 banco lento (> 5 s) → 503;
//   H04 resultado guardado 30 s: 10 chamadas seguidas = 1 consulta; depois de 30 s, consulta de novo;
//   H05 /api/health continua igual (não consulta o banco).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-saude-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const saude = require('../src/services/SaudeBanco');
const { app } = require('../src/app');

let base;
const get = path => new Promise((resolve, reject) => {
  http.get(base + path, res => { let t = ''; res.on('data', c => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(t || 'null'), raw: t })); }).on('error', reject);
});
const tests = [];
const test = (n, f) => tests.push({ n, f });
let agora = 1000;
const relogio = () => agora;

test('H01 banco responde → 200 ok, sem login', async () => {
  let n = 0;
  saude.paraTestes({ consulta: async () => { n++; }, agora: relogio });
  const r = await get('/api/health/banco');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.data.ok, true); assert.strictEqual(r.data.banco, 'ok'); assert.strictEqual(n, 1);
});

test('H02 banco falha → 503 sem o detalhe do erro', async () => {
  saude.paraTestes({ consulta: async () => { throw new Error('password authentication failed for user postgres'); }, agora: relogio });
  const r = await get('/api/health/banco');
  assert.strictEqual(r.status, 503); assert.strictEqual(r.data.banco, 'indisponivel');
  assert.ok(!/password|postgres|authentication/i.test(r.raw), 'não vaza o erro do driver');
});

test('H03 banco lento (passa de 5 s) → 503', async () => {
  saude.paraTestes({ consulta: () => new Promise(() => {}) }); // nunca responde
  const ini = Date.now();
  const r = await get('/api/health/banco');
  assert.strictEqual(r.status, 503);
  assert.ok(Date.now() - ini >= saude.LIMITE_MS - 100 && Date.now() - ini < saude.LIMITE_MS + 2000, 'para no limite');
});

test('H04 resultado guardado 30 s: 10 chamadas = 1 consulta; depois, consulta de novo', async () => {
  let n = 0;
  agora = 1000;
  saude.paraTestes({ consulta: async () => { n++; }, agora: relogio });
  for (let i = 0; i < 10; i++) assert.strictEqual((await get('/api/health/banco')).status, 200);
  assert.strictEqual(n, 1);
  agora += saude.TTL_MS + 1;
  await get('/api/health/banco');
  assert.strictEqual(n, 2);
});

test('H05 /api/health continua igual e não consulta o banco', async () => {
  let n = 0;
  saude.paraTestes({ consulta: async () => { n++; }, agora: relogio });
  const r = await get('/api/health');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.data.ok, true); assert.strictEqual(n, 0);
});

(async () => {
  const origErr = console.error; console.error = () => {};
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close(); console.error = origErr; saude.paraTestes();
  console.log(`\nSaúde do Banco Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();
