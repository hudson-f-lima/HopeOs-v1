const assert = require('node:assert/strict');
const { test } = require('node:test');

const LEGACY = 'hopeos.session';
const APP_URL = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const API_URL = 'http://127.0.0.1:3399/api';
let moduleId = 0;

function detailEvent(type, fields) {
  return Object.assign(new Event(type), fields);
}

function storage({ unreadable = false } = {}) {
  const values = new Map();
  const allowed = () => { if (unreadable) throw new Error('Storage indisponível'); };
  return {
    getItem(key) { allowed(); return values.get(key) ?? null; },
    setItem(key, value) { allowed(); values.set(key, String(value)); },
    removeItem(key) { allowed(); values.delete(key); }
  };
}

function fixture({ url = APP_URL, blocked = false } = {}) {
  let location = new URL(url);
  const local = storage({ unreadable: blocked });
  globalThis.window = Object.assign(new EventTarget(), {
    get location() { return location; },
    localStorage: local,
    sessionStorage: storage({ unreadable: blocked }),
    crypto: globalThis.crypto,
    history: {
      replaceState(_state, _title, target) {
        location = new URL(target, location);
        window.location = location;
      }
    }
  });
  globalThis.document = new EventTarget();
  const calls = [];
  const handlers = new Map([
    ['/auth/config', () => ok({ supabaseUrl: null, publishableKey: null, providers: {} })],
    ['/auth/login', () => ok(credentials('first', 3600))],
    ['/auth/logout', () => ok(null)]
  ]);
  globalThis.fetch = (target, request) => {
    const path = target.replace(API_URL, '');
    calls.push({ path, request });
    const handle = handlers.get(path);
    assert.ok(handle, 'Pedido inesperado ' + path);
    return Promise.resolve(handle(request));
  };
  const boot = async () => {
    const api = await import('../../js/api.js?gate=' + ++moduleId);
    await api.loadConfig();
    return api;
  };
  return { boot, calls, handlers, local, location: () => location };
}

function credentials(id, expiresIn) {
  return { access_token: 'access-' + id, refresh_token: 'refresh-' + id, expires_in: expiresIn };
}

function ok(data) {
  return Response.json({ ok: true, data });
}

function failure(status, code) {
  return Response.json({ ok: false, error: { message: code, code } }, { status });
}

function pending() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { resolve, promise };
}

test('logout durante a renovação descarta sucesso atrasado e bloqueia a próxima ação', async () => {
  const { boot, calls, handlers } = fixture();
  handlers.set('/auth/login', () => ok(credentials('old', 1)));
  const refresh = pending();
  const started = pending();
  handlers.set('/auth/refresh', () => { started.resolve(); return refresh.promise; });
  const api = await boot();
  await api.login('owner@example.test', 'senha');
  const protectedRequest = api.api('/catalog');
  await started.promise;

  await api.logout();
  refresh.resolve(ok(credentials('late-refresh', 3600)));
  await assert.rejects(protectedRequest, { name: 'StaleContextError' });
  assert.equal(api.getSession(), null);
  await assert.rejects(api.api('/catalog'), { name: 'AuthError' });
  assert.deepEqual(calls.map(c => c.path), ['/auth/config', '/auth/login', '/auth/refresh', '/auth/logout']);
});

test('storage disponível com chave removida invalida memória e pedidos, inclusive sem evento da outra aba', async () => {
  const { boot, calls, handlers, local } = fixture();
  const reply = pending();
  const started = pending();
  handlers.set('/catalog', () => { started.resolve(); return reply.promise; });
  const api = await boot();
  const reasons = [];
  api.onAuthContextChanged(reason => reasons.push(reason));
  await api.login('owner@example.test', 'senha');
  const protectedRequest = api.api('/catalog');
  await started.promise;

  local.removeItem(LEGACY);
  assert.equal(api.getSession(), null);
  reply.resolve(ok({ clientes: ['empresa antiga'] }));
  await assert.rejects(protectedRequest, { name: 'StaleContextError' });
  assert.deepEqual(reasons, ['signed-out']);
  await assert.rejects(api.api('/catalog'), { name: 'AuthError' });
  assert.equal(calls.filter(c => c.path === '/catalog').length, 1);
});

test('storage indisponível permite sessão temporária e logout limpa a memória', async () => {
  const { boot, handlers } = fixture({ blocked: true });
  handlers.set('/catalog', () => ok({ clientes: [] }));
  const api = await boot();
  await api.login('owner@example.test', 'senha');
  assert.equal(api.getSession().access_token, 'access-first');
  assert.deepEqual(await api.api('/catalog'), { clientes: [] });

  await api.logout();
  assert.equal(api.getSession(), null);
  await assert.rejects(api.api('/catalog'), { name: 'AuthError' });
});

test('troca de empresa aborta pedido anterior e a seleção fica restrita à aba', async () => {
  const { boot, handlers, local } = fixture();
  const delayed = pending();
  const started = pending();
  handlers.set('/catalog', request => {
    if (request.headers['X-Empresa-Id'] === 'empresa-a') { started.resolve(request); return delayed.promise; }
    assert.equal(request.headers['X-Empresa-Id'], 'empresa-b');
    return ok({ clientes: ['empresa B'] });
  });
  const api = await boot();
  await api.login('owner@example.test', 'senha');
  const persistedCredentials = local.getItem(LEGACY);
  api.selectEmpresa('empresa-a');
  const catalogA = api.api('/catalog');
  const requestA = await started.promise;
  const reasons = [];
  api.onAuthContextChanged(reason => reasons.push(reason));

  api.selectEmpresa('empresa-b');
  assert.equal(requestA.signal.aborted, true);
  assert.equal(local.getItem(LEGACY), persistedCredentials);
  assert.deepEqual(await api.api('/catalog'), { clientes: ['empresa B'] });
  delayed.resolve(ok({ clientes: ['empresa A'] }));
  await assert.rejects(catalogA, { name: 'StaleContextError' });
  assert.deepEqual(reasons, ['enterprise']);
});

test('renovação mantém seleção por aba e 403 de negócio preserva sessão', async () => {
  const { boot, handlers } = fixture();
  handlers.set('/auth/login', () => ok(credentials('old', 1)));
  handlers.set('/auth/refresh', () => ok(credentials('new', 3600)));
  handlers.set('/catalog', request => {
    assert.equal(request.headers['X-Empresa-Id'], 'empresa-a');
    assert.equal(request.headers.Authorization, 'Bearer access-new');
    return failure(403, 'FORBIDDEN');
  });
  const api = await boot();
  await api.login('owner@example.test', 'senha');
  api.selectEmpresa('empresa-a');
  await assert.rejects(api.api('/catalog'), { status: 403, code: 'FORBIDDEN' });
  assert.equal(api.getSession().empresa_id, 'empresa-a');
});

test('429 e 503 na renovação são distinguíveis e não removem credenciais recuperáveis', async () => {
  const { boot, handlers, calls } = fixture();
  handlers.set('/auth/login', () => ok(credentials('old', 1)));
  handlers.set('/auth/refresh', () => failure(429, 'TOO_MANY_ATTEMPTS'));
  const api = await boot();
  await api.login('owner@example.test', 'senha');
  await assert.rejects(api.api('/catalog'), { status: 429, code: 'TOO_MANY_ATTEMPTS' });
  handlers.set('/auth/refresh', () => failure(503, 'AUTH_PROVIDER_UNAVAILABLE'));
  await assert.rejects(api.api('/catalog'), { status: 503, code: 'AUTH_PROVIDER_UNAVAILABLE' });
  assert.equal(api.getSession().access_token, 'access-old');
  assert.equal(calls.filter(c => c.path === '/catalog').length, 0);
});

test('link de entrada limpa credenciais da URL e não exige definir senha', async () => {
  const url = APP_URL + '&apiToken=descartar#access_token=opaque&refresh_token=refresh&expires_in=3600&type=magiclink';
  const env = fixture({ url });
  const api = await env.boot();
  assert.equal(env.location().hash, '');
  assert.equal(env.location().searchParams.has('apiToken'), false);

  assert.equal(await api.consumeAuthLink(), 'magiclink');
  assert.equal(api.pendingPassword(), null);
  assert.equal(api.getSession().access_token, 'opaque');

  await api.logout();
  window.location = new URL(url);
  const reloaded = await env.boot();
  await assert.rejects(reloaded.consumeAuthLink(), /já foi usado/i);
  assert.equal(reloaded.getSession(), null);
});

test('link de recuperação fica vinculado à sessão que o recebeu', async () => {
  const env = fixture({ url: APP_URL + '#access_token=recover&refresh_token=refresh&expires_in=3600&type=recovery' });
  const api = await env.boot();
  assert.equal(await api.consumeAuthLink(), 'recovery');
  assert.equal(api.pendingPassword(), 'recovery');
  await api.logout();
  await env.boot();
  assert.equal(api.pendingPassword(), null);
});

test('configuração de navegador rejeita projetos e chaves fora do contrato', async () => {
  fixture();
  const { parseAuthConfig } = await import('../../js/auth-sdk.js');
  const key = 'sb_publishable_test';
  assert.equal(parseAuthConfig({ supabaseUrl: 'https://outside.example.test', publishableKey: key }), null);
  assert.equal(parseAuthConfig({ supabaseUrl: 'https://gsttjozcmdvgstcpadiq.supabase.co', publishableKey: 'sb_secret_test' }), null);
  const candidate = parseAuthConfig({ supabaseUrl: 'https://gsttjozcmdvgstcpadiq.supabase.co', publishableKey: key, providers: { google: true, apple: 'true' } });
  assert.deepEqual(candidate.providers, { google: true, apple: false, magicLink: false, otp: false, linkIdentity: false });
});

test('configuração ausente na API anterior mantém o login por senha sem mascarar outras falhas', async () => {
  for (const response of [failure(404, 'NOT_FOUND'), failure(401, 'UNAUTHENTICATED')]) {
    const { boot, handlers } = fixture();
    handlers.set('/auth/config', () => response);
    const api = await boot();
    assert.deepEqual(api.authFeatures, {});
    await api.login('owner@example.test', 'senha');
    assert.equal(api.getSession().access_token, 'access-first');
  }
  const { boot, handlers } = fixture();
  handlers.set('/auth/config', () => failure(401, 'AUTH_CONFIG_REJECTED'));
  await assert.rejects(boot(), { status: 401, code: 'AUTH_CONFIG_REJECTED' });
});

test('recuperação solicita link do servidor mesmo com o SDK habilitado', async () => {
  const { boot, handlers, calls } = fixture();
  handlers.set('/auth/config', () => ok({
    supabaseUrl: 'https://gsttjozcmdvgstcpadiq.supabase.co',
    publishableKey: 'sb_publishable_test',
    providers: { google: true }
  }));
  handlers.set('/auth/recover', request => {
    assert.deepEqual(JSON.parse(request.body), { email: 'owner@example.test' });
    return ok({ message: 'Se houver conta, o link será enviado.' });
  });
  const api = await boot();
  assert.equal(api.authFeatures.google, true);
  assert.deepEqual(await api.recuperarSenha('owner@example.test'), { message: 'Se houver conta, o link será enviado.' });
  assert.deepEqual(calls.map(call => call.path), ['/auth/config', '/auth/recover']);
});

test('aba que aguarda login observa o acesso concluído em outra aba', async () => {
  const { boot, local } = fixture();
  const api = await boot();
  const changes = [];
  api.onAuthContextChanged(reason => changes.push(reason));
  const value = JSON.stringify({ ...credentials('another-tab', 3600), instance: 'another-tab', epoch: 'initial' });
  local.setItem(LEGACY, value);
  window.dispatchEvent(detailEvent('storage', { key: LEGACY, newValue: value }));
  assert.deepEqual(changes, ['account']);
  assert.equal(api.getSession().access_token, 'access-another-tab');
});

test('tentativas de ler configuração conservam o callback capturado após saneamento', async () => {
  const env = fixture({ url: APP_URL + '#access_token=retry&refresh_token=refresh&type=magiclink' });
  let attempts = 0;
  env.handlers.set('/auth/config', () => {
    attempts++;
    return attempts <= 2 ? failure(503, 'TEMPORARY_OUTAGE') : ok({ providers: {} });
  });
  const api = await import('../../js/api.js?gate=' + ++moduleId);
  await assert.rejects(api.loadConfig(), { status: 503 });
  assert.equal(attempts, 2);
  assert.equal(env.location().hash, '');
  await api.loadConfig();
  assert.equal(await api.consumeAuthLink(), 'magiclink');
  assert.equal(api.getSession().access_token, 'retry');
});

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SDK_KEY = 'hopeos.auth.sdk';
const INTENT_KEY = 'hopeos.auth.intent';
const SDK_ORIGIN = 'http://127.0.0.1:3399';

function installSdk(t) {
  const bundled = fs.readFileSync(path.join(__dirname, '../../js/vendor/supabase-2.109.0.js'), 'utf8');
  const sdk = vm.runInThisContext(bundled + '\nsupabase');
  window.supabase = {
    ...sdk,
    createClient(...args) {
      const client = sdk.createClient(...args);
      t.after(async () => {
        client.auth.broadcastChannel?.close();
        await client.auth.stopAutoRefresh();
      });
      return client;
    }
  };
}

function sdkCredentials(token, expiry = Math.floor(Date.now() / 1000) + 3600) {
  const payload = Buffer.from(JSON.stringify({ sub: 'stable-user', session_id: 'stable-session' })).toString('base64url');
  return {
    access_token: token + '.' + payload + '.signature',
    refresh_token: 'refresh-' + token,
    expires_in: 3600,
    expires_at: expiry,
    token_type: 'bearer',
    user: { id: 'stable-user', email: 'owner@example.test' }
  };
}

async function sdkFixture(t, saved, handler) {
  const { local } = fixture();
  local.setItem(SDK_KEY, JSON.stringify({ epoch: 'initial', value: saved }));
  installSdk(t);
  globalThis.fetch = handler;
  const sdk = await import('../../js/auth-sdk.js?gate=' + ++moduleId);
  await sdk.configureSdk({ url: SDK_ORIGIN, key: 'sb_publishable_test', providers: { google: true, linkIdentity: true } }, () => {});
  return { sdk, local };
}

test('SDK real preserva refresh na inicialização expirada sob 429 e recupera após a espera', async t => {
  const first = sdkCredentials('old', Math.floor(Date.now() / 1000) - 1);
  let clock = Date.now();
  const originalNow = Date.now;
  const renewed = sdkCredentials('renewed');
  const sent = [];
  Date.now = () => clock;
  try {
    const { sdk, local } = await sdkFixture(t, first, (url, options) => {
      assert.equal(url, SDK_ORIGIN + '/auth/v1/token?grant_type=refresh_token');
      assert.equal(options.cache, 'no-store');
      sent.push(JSON.parse(options.body).refresh_token);
      return sent.length === 1
        ? Promise.resolve(Response.json({ code: 'over_request_rate_limit' }, { status: 429, headers: { 'Retry-After': '1' } }))
        : Promise.resolve(Response.json(renewed));
    });
    await assert.rejects(sdk.sdkAuthSession(), { status: 429, code: 'AUTH_REFRESH_RATE_LIMIT' });
    await assert.rejects(sdk.sdkAuthSession(), { status: 429 });
    assert.equal(sent.length, 1);
    assert.equal(JSON.parse(local.getItem(SDK_KEY)).value.refresh_token, first.refresh_token);

    clock += 2000;
    assert.equal((await sdk.sdkAuthSession()).access_token, renewed.access_token);
    assert.equal(JSON.parse(local.getItem(SDK_KEY)).value.refresh_token, renewed.refresh_token);
    assert.deepEqual(sent, [first.refresh_token, first.refresh_token]);
  } finally {
    Date.now = originalNow;
  }
});

test('SDK real mantém verificador de vinculação depois de refresh e troca uma única vez', async t => {
  const first = sdkCredentials('old-link');
  const renewed = sdkCredentials('renewed-link');
  const linked = sdkCredentials('linked');
  let exchanges = 0;
  let callback;
  const { sdk, local } = await sdkFixture(t, first, (input, options) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user/identities/authorize') {
      callback = new URL(url.searchParams.get('redirect_to'));
      assert.match(url.searchParams.get('code_challenge'), /^.{43,128}$/);
      return Promise.resolve(Response.json({ url: SDK_ORIGIN + '/auth/v1/authorize?provider=google' }));
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') return Promise.resolve(Response.json(renewed));
    assert.equal(url.searchParams.get('grant_type'), 'pkce');
    const data = JSON.parse(options.body);
    assert.equal(data.auth_code, 'link-code');
    assert.match(data.code_verifier, /^.{43,128}$/);
    exchanges++;
    return Promise.resolve(Response.json(linked));
  });
  window.location.assign = () => {};
  await sdk.openOAuth('google', 'stable-user');
  const verifierKey = SDK_KEY + '-code-verifier';
  const value = local.getItem(verifierKey);
  assert.ok(value);
  await sdk.sdkAuthSession(true);
  assert.equal(local.getItem(verifierKey), value);

  const link = { code: 'link-code', tx: callback.searchParams.get('auth_tx'), type: callback.searchParams.get('auth_callback') };
  const result = await sdk.completeSdkCallback(link);
  assert.equal(result.type, 'link');
  assert.equal(result.session.user.id, 'stable-user');
  assert.equal(local.getItem(verifierKey), null);
  assert.equal(local.getItem(INTENT_KEY), null);
  await assert.rejects(sdk.completeSdkCallback(link), { status: 400 });
  assert.equal(exchanges, 1);
});

test('SDK real não regrava credencial depois de logout publicado por outra aba', async t => {
  const first = sdkCredentials('before-logout');
  const late = sdkCredentials('after-logout');
  const request = pending();
  const entered = pending();
  const { sdk, local } = await sdkFixture(t, first, (input, options) => {
    assert.equal(new URL(input).searchParams.get('grant_type'), 'refresh_token');
    assert.equal(JSON.parse(options.body).refresh_token, first.refresh_token);
    entered.resolve();
    return request.promise;
  });
  const refresh = sdk.sdkAuthSession(true);
  await entered.promise;
  local.setItem('hopeos.auth.epoch', 'another-tab-logout');
  local.removeItem(SDK_KEY);
  request.resolve(Response.json(late));
  await assert.rejects(refresh, { status: 401, code: 'AUTH_SESSION_INVALID' });
  assert.equal(local.getItem(SDK_KEY), null);
  assert.equal(sdk.sdkSession(), null);
});

test('SDK real preserva sessão expirada sob 408, 425 e 508 na renovação', async t => {
  for (const status of [408, 425, 508]) {
    await t.test('HTTP ' + status, async subtest => {
      const expired = sdkCredentials('expired', Math.floor(Date.now() / 1000) - 1);
      const renewed = sdkCredentials('recovered');
      const originalNow = Date.now;
      let clock = Date.now();
      let renewals = 0;
      Date.now = () => clock;
      try {
        const { sdk, local } = await sdkFixture(subtest, expired, (url, options) => {
          const flow = new URL(url).searchParams.get('grant_type');
          if (flow === 'password') return Promise.resolve(Response.json({}, { status }));
          assert.equal(flow, 'refresh_token');
          assert.equal(JSON.parse(options.body).refresh_token, expired.refresh_token);
          if (++renewals === 1) {
            clock += 31000; // Ultrapassa o orçamento desta sequência interna de retentativas.
            return Promise.resolve(Response.json({}, { status }));
          }
          return Promise.resolve(Response.json(renewed));
        });
        await assert.rejects(sdk.sdkAuthSession(), { status: 503 });
        await assert.rejects(sdk.sdkAuthSession(), { status: 503 });
        assert.equal(renewals, 1);
        assert.equal(JSON.parse(local.getItem(SDK_KEY)).value.refresh_token, expired.refresh_token);

        clock += 61000; // Após o intervalo entre tentativas malsucedidas do SDK.
        assert.equal((await sdk.sdkAuthSession()).access_token, renewed.access_token);
        assert.equal(renewals, 2);
        await assert.rejects(sdk.sdkLogin('owner@example.test', 'senha'), { status: status >= 500 ? 503 : status });
      } finally {
        Date.now = originalNow;
      }
    });
  }
});
