// Auth Gate (V1.4.1): nenhuma rota /api/* serve dados sem credencial.

const assert = require('assert');
const { env } = require('../src/config/env');

const TOKEN = 'token-de-teste-longo-o-suficiente-1234567890';
env.API_ACCESS_TOKEN = TOKEN;

const { app } = require('../src/app');
const { safeEquals, extractBearer } = require('../src/middleware/auth');

console.log('Auth Gate - perimetro da API\n');

function request(base, path, headers = {}) {
  return fetch(base + path, { headers }).then(async res => ({
    status: res.status,
    body: await res.json().catch(() => ({}))
  }));
}

(async () => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    console.log('OK health responde 200 sem token');
    const health = await request(base, '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.ok, true);

    console.log('OK GET /api/clientes sem token retorna 401');
    const semToken = await request(base, '/api/clientes');
    assert.strictEqual(semToken.status, 401);
    assert.strictEqual(semToken.body.error.code, 'UNAUTHENTICATED');

    console.log('OK POST /api/checkout/close sem token retorna 401');
    const checkout = await fetch(base + '/api/checkout/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.strictEqual(checkout.status, 401);

    console.log('OK token errado retorna 401');
    const tokenErrado = await request(base, '/api/clientes', { Authorization: 'Bearer nao-e-o-token' });
    assert.strictEqual(tokenErrado.status, 401);

    console.log('OK esquema nao-Bearer retorna 401');
    const basic = await request(base, '/api/clientes', { Authorization: 'Basic ' + TOKEN });
    assert.strictEqual(basic.status, 401);

    console.log('OK token valido atravessa o middleware (nao retorna 401)');
    const comToken = await request(base, '/api/clientes', { Authorization: 'Bearer ' + TOKEN });
    assert.notStrictEqual(comToken.status, 401);

    console.log('OK sem API_ACCESS_TOKEN configurado o backend falha fechado (503)');
    env.API_ACCESS_TOKEN = '';
    const semConfig = await request(base, '/api/clientes', { Authorization: 'Bearer ' + TOKEN });
    assert.strictEqual(semConfig.status, 503);
    assert.strictEqual(semConfig.body.error.code, 'AUTH_NOT_CONFIGURED');
    env.API_ACCESS_TOKEN = TOKEN;

    console.log('OK safeEquals compara valor, nao referencia, e rejeita tamanhos diferentes');
    assert.strictEqual(safeEquals('abc', 'abc'), true);
    assert.strictEqual(safeEquals('abc', 'abd'), false);
    assert.strictEqual(safeEquals('abc', 'abcd'), false);

    console.log('OK extractBearer ignora header ausente ou malformado');
    assert.strictEqual(extractBearer({ headers: {} }), null);
    assert.strictEqual(extractBearer({ headers: { authorization: 'Bearer' } }), null);
    assert.strictEqual(extractBearer({ headers: { authorization: 'bearer xyz' } }), 'xyz');

    console.log('\nOK Auth Gate - 9/9 verdes\n');
  } finally {
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
