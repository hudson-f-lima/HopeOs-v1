// SDK real no Chromium, com o transporte do provedor interceptado localmente.
// Os UUIDs e as permissões são resolvidos pela API em memória.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const WEB = 'http://127.0.0.1:5599';
const API = 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const ADMIN = 'admin@dev.local';
const SEM_VINCULO = 'novo@dev.local';
const VALID_OTP = '123456';
const LOGIN = '#loginScreen:not(.hidden) #loginForm:not(.hidden)';
const APP = '#appRoot:not(.hidden)';
const CORS = {
  'access-control-allow-origin': WEB,
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version'
};

async function sessaoFixture(email) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'dev12345' })
  });
  assert.equal(r.status, 200, 'a API em memória emitiu uma sessão para a fixture');
  const { data } = await r.json();
  return {
    ...data,
    token_type: 'bearer',
    user: { ...data.user, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  };
}

function json(route, data, status = 200) {
  return route.fulfill({ status, json: data, headers: CORS });
}

async function prepararContexto(browser, { provider, contaOAuth, cancelar = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(15000);
  const requests = { oauth: [], sends: [], exchanges: [], verifies: [], unexpected: [] };
  const transacoes = new Map();

  await context.route(`${API}/auth/v1/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (url.pathname === '/auth/v1/authorize') {
      requests.oauth.push(url);
      const providerEnviado = url.searchParams.get('provider');
      const callback = new URL(url.searchParams.get('redirect_to'));
      const challenge = url.searchParams.get('code_challenge');
      if (providerEnviado !== provider || callback.origin !== WEB || !challenge) {
        return json(route, { code: 'fixture_oauth_invalid', msg: 'OAuth inválido na fixture.' }, 400);
      }
      if (cancelar) callback.searchParams.set('error', 'access_denied');
      else {
        const code = `codigo-${providerEnviado}`;
        transacoes.set(code, { challenge, email: contaOAuth });
        callback.searchParams.set('code', code);
      }
      return route.fulfill({ status: 302, headers: { location: callback.href } });
    }

    if (url.pathname === '/auth/v1/otp') {
      const body = request.postDataJSON();
      requests.sends.push({ url, body });
      transacoes.set('codigo-email', { challenge: body.code_challenge, email: body.email });
      return json(route, {});
    }

    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const body = request.postDataJSON();
      requests.exchanges.push(body);
      const tx = transacoes.get(body.auth_code);
      const challenge = body.code_verifier && createHash('sha256').update(body.code_verifier).digest('base64url');
      if (!tx?.challenge || tx.challenge !== challenge) return json(route, { code: 'bad_code_verifier', msg: 'Código inválido.' }, 400);
      transacoes.delete(body.auth_code);
      return json(route, await sessaoFixture(tx.email));
    }

    if (url.pathname === '/auth/v1/verify') {
      const body = request.postDataJSON();
      requests.verifies.push(body);
      if (body.email !== ADMIN || body.token !== VALID_OTP || body.type !== 'email') {
        return json(route, { code: 'otp_expired', msg: 'Código expirado.' }, 422);
      }
      return json(route, await sessaoFixture(body.email));
    }

    requests.unexpected.push(url.pathname);
    return json(route, { code: 'fixture_unexpected', msg: 'Rota do provedor não prevista na fixture.' }, 500);
  });
  return { context, requests };
}

async function abrir(context, url = BASE) {
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

function aguardarErro(page, text) {
  return page.locator('#loginErro').filter({ hasText: text }).waitFor({ state: 'visible' });
}

function conferirUrlLimpa(page) {
  const url = new URL(page.url());
  assert.equal(url.pathname, '/index.html');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams], [['apiBase', `${API}/api`]]);
}

function conferirRetorno(url, tipo) {
  assert.equal(url.origin, WEB);
  assert.equal(url.pathname, '/index.html');
  assert.equal(url.searchParams.get('apiBase'), `${API}/api`);
  assert.equal(url.searchParams.get('auth_callback'), tipo);
  assert.match(url.searchParams.get('auth_tx'), /^[a-f0-9]{32}$/);
  assert.equal(url.searchParams.has('code_verifier'), false);
}

async function conferirAdmin(page) {
  await page.waitForSelector(APP);
  await page.click('#navAvatar');
  await page.locator('#sessionLabel').filter({ hasText: 'Admin Dev · Admin' }).waitFor({ state: 'visible' });
  await page.click('#btnFecharGestao');
  assert.equal(await page.isVisible('#senhaForm'), false, 'acesso por login social/link/código não exige senha');
  conferirUrlLimpa(page);
}

async function testarOAuth(browser, provider, contaOAuth, cancelar) {
  const { context, requests } = await prepararContexto(browser, { provider, contaOAuth, cancelar });
  try {
    const page = await abrir(context);
    await page.waitForSelector(LOGIN);
    await page.click(provider === 'google' ? '#btnGoogle' : '#btnApple');
    if (!cancelar && contaOAuth === ADMIN) await conferirAdmin(page);
    else await aguardarErro(page, cancelar ? /cancelado/i : /ainda não tem acesso/i);
    if (cancelar || contaOAuth !== ADMIN) assert.equal(await page.isVisible('#appRoot'), false);
    conferirUrlLimpa(page);
    assert.equal(requests.oauth.length, 1);
    const [oauth] = requests.oauth;
    assert.equal(oauth.searchParams.get('provider'), provider);
    assert.equal(oauth.searchParams.get('code_challenge_method')?.toLowerCase(), 's256');
    conferirRetorno(new URL(oauth.searchParams.get('redirect_to')), 'oauth');
    assert.equal(requests.exchanges.length, cancelar ? 0 : 1, 'cancelamento ou uma troca PKCE única');
    assert.deepEqual(requests.unexpected, []);
  } finally {
    await context.close();
  }
}

async function pedirLink(page, requests) {
  await page.fill('#loginEmail', ADMIN);
  const resultado = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/v1/otp' && r.request().method() === 'POST');
  await page.click('#btnLinkAcesso');
  assert.equal((await resultado).status(), 200);
  await page.locator('#loginStatus').filter({ hasText: /se houver uma conta/i }).waitFor({ state: 'visible' });
  const envio = requests.sends.at(-1);
  assert.ok(envio, 'SDK pediu o envio pelo provedor');
  assert.deepEqual([envio.body.email, envio.body.create_user], [ADMIN, false]);
  assert.match(envio.body.code_challenge, /^[A-Za-z0-9_-]+$/);
  const retorno = new URL(envio.url.searchParams.get('redirect_to'));
  conferirRetorno(retorno, 'email');
  retorno.searchParams.set('code', 'codigo-email');
  return retorno.href;
}

async function testarMagicLink(browser) {
  const { context, requests } = await prepararContexto(browser);
  const outro = await prepararContexto(browser);
  try {
    const page = await abrir(context);
    await page.waitForSelector(LOGIN);
    const retorno = await pedirLink(page, requests);

    const externo = await abrir(outro.context, retorno);
    await aguardarErro(externo, /não corresponde a um acesso iniciado neste navegador/i);
    assert.equal(await externo.isVisible('#appRoot'), false);
    assert.deepEqual(outro.requests.exchanges, [], 'navegador sem transação não troca o código');
    conferirUrlLimpa(externo);

    await page.goto(retorno);
    await conferirAdmin(page);
    assert.equal(requests.exchanges.length, 1);
    await page.goto(retorno);
    await conferirAdmin(page);
    assert.equal(requests.exchanges.length, 1, 'callback repetido não troca o código novamente');
    assert.deepEqual(requests.unexpected, []);
  } finally {
    await outro.context.close();
    await context.close();
  }
}

async function testarCodigo(browser) {
  const { context, requests } = await prepararContexto(browser);
  try {
    const page = await abrir(context);
    await page.waitForSelector(LOGIN);
    await pedirLink(page, requests);
    await page.fill('#loginCodigo', '000000');
    await page.click('#btnValidarCodigo');
    await aguardarErro(page, /inválido, expirado ou já usado/i);
    assert.equal(await page.isVisible('#appRoot'), false);
    await page.fill('#loginCodigo', VALID_OTP);
    await page.click('#btnValidarCodigo');
    await conferirAdmin(page);
    assert.deepEqual(requests.verifies.map(r => [r.email, r.token, r.type]), [[ADMIN, '000000', 'email'], [ADMIN, VALID_OTP, 'email']]);
    assert.deepEqual(requests.exchanges, []);
    assert.deepEqual(requests.unexpected, []);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    await testarOAuth(browser, 'google', ADMIN, false);
    await testarOAuth(browser, 'google', null, true);
    await testarOAuth(browser, 'apple', SEM_VINCULO, false);
    await testarMagicLink(browser);
    await testarCodigo(browser);
    console.log('OK Google/Apple simulados com PKCE, cancelamento e vínculo, Magic Link e código de e-mail');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FALHOU', e); process.exitCode = 1; });
