// Playwright/Chromium contra a PWA e os links emitidos pela API em memória.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:3399';
const BASE = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const MARIA = 'maria@dev.local';
const SENHA_INICIAL = 'Maria12345';
const SENHA_NOVA = 'Outra12345';
const LOGGED_IN = '#appRoot:not(.hidden)';
const LOGGED_OUT = '#loginScreen:not(.hidden) #loginForm:not(.hidden)';

function resposta(p, endpoint) {
  return p.waitForResponse(r => new URL(r.url()).pathname === `/api${endpoint}` && r.request().method() === 'POST');
}

function textoVisivel(p, seletor, texto) {
  return p.locator(seletor).filter({ hasText: texto }).waitFor({ state: 'visible' });
}

async function fixture(path) {
  const r = await fetch(`${API}${path}`);
  assert.equal(r.status, 200, `fixture ${path}`);
  return r.json();
}

async function ultimoLink(email, type) {
  const link = (await fixture('/__links')).findLast(l => l.email === email && l.type === type)?.link;
  assert.ok(link, `${type}: a fixture registrou a mensagem para a destinatária`);
  assert.equal(new URL(link).origin, new URL(BASE).origin);
  return link;
}

async function contaMaria() {
  const conta = (await fixture('/__contas')).find(c => c.email === MARIA);
  assert.ok(conta, 'conta convidada existe no provedor em memória');
  return conta;
}

async function login(p, email, senha) {
  await p.waitForSelector(LOGGED_OUT);
  await p.fill('#loginEmail', email);
  await p.fill('#loginSenha', senha);
  const r = resposta(p, '/auth/login');
  await p.click('#btnLogin');
  return r;
}

async function sair(p) {
  if (!(await p.isVisible('#btnLogout'))) await p.click('#navAvatar');
  await p.click('#btnLogout');
  await p.waitForSelector(LOGGED_OUT);
  assert.equal(await p.isVisible('#appRoot'), false);
}

async function definirSenha(p, senha) {
  await p.fill('#novaSenha', senha);
  await p.fill('#novaSenha2', senha);
  const r = resposta(p, '/auth/password');
  await p.click('#btnSalvarSenha');
  assert.equal((await r).status(), 200);
  await p.waitForSelector(LOGGED_OUT);
  assert.equal(await p.isVisible('#appRoot'), false, 'a troca exige autenticação com a nova senha');
}

function verificarUrlLimpa(p) {
  const url = new URL(p.url());
  assert.equal(url.hash, '', 'fragmento da autenticação removido');
  for (const parametro of ['code', 'type', 'token_hash', 'access_token', 'refresh_token', 'auth_tx', 'auth_callback']) {
    assert.equal(url.searchParams.has(parametro), false, `URL sem ${parametro}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const erros = [];
  const novaPagina = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', err => erros.push(err.message));
    return p;
  };
  try {
    const admin = await novaPagina();
    await admin.goto(BASE);
    assert.equal((await login(admin, 'admin@dev.local', 'dev12345')).status(), 200);
    await admin.waitForSelector(LOGGED_IN);
    await admin.click('#navGestao');
    await admin.click('#subtabBtnEquipe');
    await admin.locator('#eqUnidades input:checked').waitFor({ state: 'visible' });
    await admin.fill('#eqEmail', MARIA);
    await admin.selectOption('#eqRole', 'recepcao');
    const enviado = resposta(admin, '/admin/invites');
    await admin.click('#formEquipe button[type=submit]');
    const convite = await enviado;
    assert.equal(convite.status(), 201);
    const { data: vinculo } = await convite.json();
    assert.equal(vinculo.convidado, true);
    assert.equal(vinculo.role, 'recepcao');
    assert.equal(vinculo.unit_ids.length, 1);
    const usuarios = await fixture('/__db/app_users');
    assert.equal(vinculo.user_id, usuarios.find(u => u.email === MARIA)?.id);
    assert.equal(vinculo.created_by, usuarios.find(u => u.email === 'admin@dev.local')?.id);

    const p = await novaPagina();
    const linkConvite = await ultimoLink(MARIA, 'invite');
    await p.goto(linkConvite);
    await p.waitForSelector('#senhaForm:not(.hidden)');
    verificarUrlLimpa(p);
    await p.fill('#novaSenha', 'curta');
    await p.fill('#novaSenha2', 'curta');
    await p.click('#btnSalvarSenha');
    await textoVisivel(p, '#senhaErro', /8 caracteres/i);
    await definirSenha(p, SENHA_INICIAL);

    assert.equal((await login(p, MARIA, SENHA_INICIAL)).status(), 200);
    await p.waitForSelector('#privacyCard:not(.hidden)');
    assert.equal(await p.isVisible('#appRoot'), false);
    assert.equal((await contaMaria()).privacy, null);
    await p.click('#btnRecusarPrivacidade');
    await p.waitForSelector(LOGGED_OUT);
    assert.equal((await contaMaria()).privacy, null);

    const entrada = await login(p, MARIA, SENHA_INICIAL);
    assert.equal(entrada.status(), 200);
    const { data: sessaoComum } = await entrada.json();
    const trocaSemProva = await fetch(`${API}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessaoComum.access_token}` },
      body: JSON.stringify({ password: 'SenhaSemProva123', type: 'recovery' })
    });
    assert.equal(trocaSemProva.status, 403, 'sessão comum e indicação de recuperação não autorizam trocar senha');
    assert.equal((await trocaSemProva.json()).error.code, 'PASSWORD_PROOF_REQUIRED');

    await p.waitForSelector('#privacyCard:not(.hidden)');
    const versao = (await p.textContent('#privacyVersao')).trim();
    await p.click('#btnAceitarPrivacidade');
    await p.waitForSelector(LOGGED_IN);
    await p.click('#navAvatar');
    await textoVisivel(p, '#sessionLabel', /maria · Recepção/i);
    const aceite = (await contaMaria()).privacy;
    assert.equal(aceite?.versao, versao);
    assert.match(aceite.aceito_em, /^\d{4}-\d{2}-\d{2}T/);
    await sair(p);

    await p.goto(linkConvite);
    await p.waitForSelector(LOGGED_OUT);
    verificarUrlLimpa(p);
    await textoVisivel(p, '#loginErro', /já foi usado/i);
    assert.equal(await p.isVisible('#senhaForm'), false, 'convite já usado não abre a definição de senha');

    await p.fill('#loginEmail', MARIA);
    const recuperacao = resposta(p, '/auth/recover');
    await p.click('#btnEsqueciSenha');
    assert.equal((await recuperacao).status(), 200);
    await textoVisivel(p, '#loginErro', /se houver conta com este e-mail/i);
    await p.goto(await ultimoLink(MARIA, 'recovery'));
    await p.waitForSelector('#senhaForm:not(.hidden)');
    verificarUrlLimpa(p);
    await definirSenha(p, SENHA_NOVA);
    assert.equal((await login(p, MARIA, SENHA_INICIAL)).status(), 401, 'senha anterior não funciona');
    assert.equal((await login(p, MARIA, SENHA_NOVA)).status(), 200);
    await p.waitForSelector(LOGGED_IN);
    await p.click('#navAvatar');
    await textoVisivel(p, '#sessionLabel', /maria · Recepção/i);
    assert.equal(await p.isVisible('#privacyCard'), false, 'o aceite anterior permaneceu gravado');
    assert.deepEqual(erros, [], 'erros inesperados de página');
    console.log('OK convite, autoria, aviso de privacidade, prova de senha e recuperação');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FALHOU', e); process.exitCode = 1; });
