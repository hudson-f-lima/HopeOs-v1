const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { env } = require('../src/config/env');
const { app } = require('../src/app');
const { resetRateLimit } = require('../src/routes/auth');
const { criarLimitador } = require('../src/security/rateLimit');

const user = { id: '50000000-0000-4000-8000-000000000001', email: 'equipe@example.test' };
const trusted = new Set();
const providerCalls = [];
let providerOrigin;
let apiOrigin;

function criarToken(method, age = 0, overrides = {}) {
  const claims = {
    sub: user.id,
    session_id: '50000000-0000-4000-8000-000000000002',
    amr: [{ method, timestamp: Math.floor(Date.now() / 1000) - age }],
    ...overrides
  };
  return `jwt.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fake`;
}

const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' });
  res.end(JSON.stringify(data));
};

const provider = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, providerOrigin);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  const body = raw ? JSON.parse(raw) : {};
  providerCalls.push({ pathname, body });
  if (pathname === '/auth/v1/user') {
    const token = req.headers.authorization?.slice('Bearer '.length);
    return trusted.has(token)
      ? send(res, 200, user)
      : send(res, 403, { code: 'bad_jwt', msg: 'Erro interno do provedor' });
  }
  if (pathname === `/auth/v1/admin/users/${user.id}`) return send(res, 200, user);
  if (pathname === '/auth/v1/recover') {
    const results = {
      ausente: [404, 'user_not_found'],
      quota: [429, 'over_email_send_rate_limit'],
      smtp: [500, 'unexpected_failure'],
      limite: [429, 'over_request_rate_limit'],
      outage: [503, 'unexpected_failure']
    };
    const result = results[body.email.split('@')[0]];
    return result ? send(res, result[0], { code: result[1] }) : send(res, 200, {});
  }
  if (body.email === 'rede@example.test') {
    req.socket.destroy();
    return;
  }
  const status = Number(body.email?.split('@')[0]) || 401;
  return send(res, status, { code: 'teste_provedor', msg: 'Erro interno do provedor' });
});
let apiServer;

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  providerOrigin = await listen(provider);
  env.SUPABASE_URL = providerOrigin;
  env.SUPABASE_SECRET_KEY = 'sb_secret_test_fixture';
  env.AUTH_TIMEOUT_MS = 1000;
  apiServer = createServer(app);
  apiOrigin = await listen(apiServer);
});
after(async () => {
  await Promise.all([provider, apiServer].map(server => new Promise(resolveClose => server.close(resolveClose))));
});
beforeEach(() => {
  resetRateLimit();
  trusted.clear();
  providerCalls.length = 0;
});

async function request(route, { token, body, ip, raw } = {}) {
  const response = await fetch(`${apiOrigin}/api${route}`, {
    method: body || raw ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body || raw ? { 'Content-Type': 'application/json' } : {}),
      ...(ip ? { 'X-Forwarded-For': ip } : {})
    },
    body: raw ?? (body && JSON.stringify(body))
  });
  return { status: response.status, cache: response.headers.get('cache-control'), json: await response.json() };
}

test('senha requer método de prova recente do JWT validado pelo Supabase', async () => {
  const alterar = token => request('/auth/password', { token, body: { password: 'nova-senha-revisada', type: 'recovery' } });
  for (const token of [
    criarToken('password'), criarToken('oauth'), criarToken('recovery', 301), criarToken('otp', -60),
    criarToken('otp', 0, { sub: 'outra-conta' }), criarToken('otp', 0, { session_id: null })
  ]) {
    trusted.add(token);
    const result = await alterar(token);
    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, 'PASSWORD_PROOF_REQUIRED');
  }
  const forged = await alterar(criarToken('recovery', 0, { session_id: 'da-url' }));
  assert.equal(forged.status, 403);
  assert.equal(forged.json.error.code, 'AUTH_SESSION_INVALID');
  assert.equal(providerCalls.filter(x => x.pathname.includes('/admin/')).length, 0);

  // GoTrue emite otp para links tradicionais e pode emitir métodos próprios via PKCE.
  for (const method of ['otp', 'invite', 'recovery', 'magiclink']) {
    const token = criarToken(method);
    trusted.add(token);
    assert.equal((await alterar(token)).status, 200);
  }
  const updates = providerCalls.filter(x => x.pathname.includes('/admin/'));
  assert.equal(updates.length, 4);
  for (const update of updates) assert.deepEqual(update.body, { password: 'nova-senha-revisada' });
});

test('limite por chave fica cheio com tentativas admitidas e se libera no prazo', () => {
  const limitador = criarLimitador({ maxChaves: 2 });
  assert.equal(limitador.excedeu('alvo', 2, 100, 0), false);
  assert.equal(limitador.excedeu('alvo', 2, 100, 1), false);
  assert.equal(limitador.excedeu('segunda-chave', 1, 100, 2), false);
  for (let i = 0; i < 10000; i++) assert.equal(limitador.excedeu('alvo', 2, 100, 99), true);
  assert.equal(limitador.excedeu('nova-chave', 1, 100, 99), true);
  assert.equal(limitador.tamanho, 2);
  assert.equal(limitador.excedeu('alvo', 2, 100, 100), false);
});

test('refresh limita IP e token, e senha tem limite independente', async () => {
  const original = { max: env.LOGIN_RATE_LIMIT_MAX, ip: env.AUTH_REFRESH_RATE_LIMIT_IP_MAX };
  env.LOGIN_RATE_LIMIT_MAX = 2;
  env.AUTH_REFRESH_RATE_LIMIT_IP_MAX = 2;
  try {
    const renovar = (refresh_token, ip) => request('/auth/refresh', { body: { refresh_token }, ip });
    assert.equal((await renovar('token-a', '198.51.100.1')).status, 401);
    assert.equal((await renovar('token-b', '198.51.100.1')).status, 401);
    assert.equal((await renovar('token-c', '198.51.100.1')).status, 429);
    assert.equal((await renovar('token-a', '198.51.100.2')).status, 401);
    assert.equal((await renovar('token-a', '198.51.100.3')).status, 429);
    assert.equal(providerCalls.length, 3);

    const token = criarToken('password');
    trusted.add(token);
    const alterar = () => request('/auth/password', { token, body: { password: 'nova-senha-revisada' }, ip: '198.51.100.1' });
    assert.equal((await alterar()).status, 403);
    assert.equal((await alterar()).status, 403);
    assert.equal((await alterar()).status, 429);
    assert.equal(providerCalls.filter(x => x.pathname === '/auth/v1/user').length, 2);
  } finally {
    env.LOGIN_RATE_LIMIT_MAX = original.max;
    env.AUTH_REFRESH_RATE_LIMIT_IP_MAX = original.ip;
  }
});

test('login preserva 401, 403, 429 e 503 do provedor com mensagens normalizadas', async () => {
  const expected = [[401, 'UNAUTHENTICATED'], [403, 'AUTH_FORBIDDEN'], [429, 'TOO_MANY_ATTEMPTS'], [503, 'AUTH_PROVIDER_UNAVAILABLE']];
  for (const [status, code] of expected) {
    const result = await request('/auth/login', { body: { email: `${status}@example.test`, password: 'senha-teste' } });
    assert.equal(result.status, status);
    assert.equal(result.json.error.code, code);
    assert.equal(result.cache, 'no-store');
    assert.doesNotMatch(JSON.stringify(result.json), /Erro interno do provedor/);
  }
  const network = await request('/auth/login', { body: { email: 'rede@example.test', password: 'senha-teste' } });
  assert.equal(network.status, 503);
  assert.equal(network.json.error.code, 'AUTH_PROVIDER_UNAVAILABLE');
});

test('recuperação conserva resposta uniforme inclusive para quota por e-mail, e sinaliza falha de serviço', async () => {
  const recuperar = local => request('/auth/recover', { body: { email: `${local}@example.test` } });
  const existing = await recuperar('existente');
  assert.equal(existing.status, 200);
  for (const email of ['ausente', 'quota', 'smtp']) assert.deepEqual(await recuperar(email), existing);
  assert.equal((await recuperar('limite')).status, 429);
  assert.equal((await recuperar('outage')).status, 503);
});

test('Auth e /me retornam no-store e parse inválido mantém credenciais fora da resposta', async () => {
  const invalid = await request('/auth/login', { raw: '{"password":marcador-teste}' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.cache, 'no-store');
  assert.equal(invalid.json.error.code, 'INVALID_JSON');
  assert.doesNotMatch(JSON.stringify(invalid.json), /marcador-teste/);
  const me = await request('/me');
  assert.equal(me.status, 401);
  assert.equal(me.cache, 'no-store');
});

test('configuração do SDK devolve somente URL e chave publicável, mantendo flags desligadas por padrão', async () => {
  const fields = [
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'AUTH_GOOGLE_ENABLED', 'AUTH_APPLE_ENABLED',
    'AUTH_MAGIC_LINK_ENABLED', 'AUTH_OTP_ENABLED', 'AUTH_LINK_IDENTITY_ENABLED'
  ];
  const original = Object.fromEntries(fields.map(key => [key, env[key]]));
  try {
    env.SUPABASE_URL = 'https://supabase.example.test';
    env.SUPABASE_PUBLISHABLE_KEY = env.SUPABASE_SECRET_KEY;
    for (const key of fields.slice(2)) env[key] = false;
    env.AUTH_GOOGLE_ENABLED = true;
    env.AUTH_LINK_IDENTITY_ENABLED = true;
    const disabled = await request('/auth/config');
    assert.equal(disabled.status, 200);
    assert.equal(disabled.cache, 'no-store');
    assert.deepEqual(disabled.json.data, {
      supabaseUrl: null, publishableKey: null, providers: { google: false, apple: false, magicLink: false, otp: false, linkIdentity: false }
    });
    env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_fixture';
    const enabled = await request('/auth/config');
    assert.deepEqual(enabled.json.data, {
      supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      providers: { google: true, apple: false, magicLink: false, otp: false, linkIdentity: true }
    });
  } finally {
    Object.assign(env, original);
  }
});

test('legado é desativado por padrão em produção', () => {
  const childEnv = { ...process.env, NODE_ENV: 'production' };
  delete childEnv.LEGACY_TOKEN_AUTH_ENABLED;
  const config = resolve(__dirname, '../src/config/env.js');
  const result = spawnSync(process.execPath, ['-e', `process.stdout.write(String(require(${JSON.stringify(config)}).env.LEGACY_TOKEN_AUTH_ENABLED))`], {
    cwd: require('node:os').tmpdir(), env: childEnv, encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'false');
});
