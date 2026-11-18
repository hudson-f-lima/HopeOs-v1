// Playwright/Chromium contra a PWA e a API em memória. Rode run-all.js login.
const assert = require('node:assert/strict');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:3399';
const BASE = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const ADMIN = 'admin@dev.local';
const SENHA = 'dev12345';
const LOGGED_IN = '#appRoot:not(.hidden)';
const LOGGED_OUT = '#loginScreen:not(.hidden) #loginForm:not(.hidden)';
const erroPagina = [];

async function novaPagina(ctx) {
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  p.on('pageerror', e => erroPagina.push(e.message));
  p.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (401|403)\b/.test(m.text())) {
      erroPagina.push(m.text());
    }
  });
  return p;
}

function novoContexto(browser) {
  return browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
}

function esperarTexto(p, selecao, texto) {
  return p.locator(selecao).filter({ hasText: texto }).waitFor({ state: 'visible' });
}

function esperarResposta(p, endpoint, method) {
  return p.waitForResponse(r => new URL(r.url()).pathname === `/api${endpoint}` && r.request().method() === method);
}

async function abrirLogin(p, url = BASE) {
  await p.goto(url);
  await p.waitForSelector(LOGGED_OUT);
}

async function tentarLogin(p, email, senha = SENHA) {
  await p.fill('#loginEmail', email);
  await p.fill('#loginSenha', senha);
  const resposta = esperarResposta(p, '/auth/login', 'POST');
  await p.click('#btnLogin');
  return resposta;
}

async function entrar(browser, email) {
  const p = await novaPagina(await novoContexto(browser));
  await abrirLogin(p);
  assert.equal((await tentarLogin(p, email)).status(), 200);
  await p.waitForSelector(LOGGED_IN);
  return p;
}

async function sair(p) {
  if (!(await p.isVisible('#btnLogout'))) await p.click('#navAvatar');
  await p.click('#btnLogout');
  await p.waitForSelector(LOGGED_OUT);
  assert.equal(await p.isVisible('#appRoot'), false);
}

async function conferirPapel(p, texto) {
  await p.click('#navAvatar');
  await esperarTexto(p, '#sessionLabel', texto);
  await p.click('#btnFecharConta'); await p.waitForSelector('#sheetConta', { state: 'hidden' });
}

async function db(tabela) {
  const r = await fetch(`${API}/__db/${tabela}`);
  assert.equal(r.status, 200, `fixture ${tabela}`);
  return r.json();
}

async function validarAgendamento(p) {
  await p.click('#fab');
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  await p.fill('#agData', amanha);
  const [usuarios, saloes, profissionais, servicos, antes] = await Promise.all([
    db('app_users'), db('empresas'), db('profissionais'), db('servicos'), db('agendamentos')
  ]);
  const admin = usuarios.find(u => u.email === ADMIN);
  const corte = servicos.find(s => s.nome === 'Corte');
  const ana = profissionais.find(prof => prof.nome === 'Ana');
  assert.ok(admin && saloes.length === 1 && corte && ana, 'fixtures de autoria, tenant e agenda');
  await p.fill('#agServico', 'Corte');
  await p.locator(`#agServico ~ div [data-value="${corte.id}"]`).click();
  await p.fill('#agProfissional', 'Ana');
  await p.locator(`#agProfissional ~ div [data-value="${ana.id}"]`).click();
  await p.locator('.ag-slot.recomendado').first().click();
  const horario = await p.inputValue('#agHorario');
  assert.match(horario, /^\d{2}:\d{2}$/);
  const gravacao = esperarResposta(p, '/agenda', 'POST');
  await p.click('#btnConfirmarNovoAgendamento');
  assert.equal((await gravacao).status(), 201, 'POST /agenda deve criar o agendamento');
  await p.locator('#modalNovoAgendamento').waitFor({ state: 'hidden' });
  const anteriores = new Set(antes.map(a => a.id));
  const novos = (await db('agendamentos')).filter(a => !anteriores.has(a.id));
  assert.equal(novos.length, 1, 'uma reserva nova na fixture');
  const [novo] = novos;
  assert.deepEqual(
    [novo.created_by, novo.empresa_id, novo.profissional_id, novo.servico_id, novo.data, novo.horario.slice(0, 5), novo.duracao_min],
    [admin.id, saloes[0].id, ana.id, corte.id, amanha, horario, 45],
    'reserva com UUID do admin autenticado e duração do profissional'
  );
}

async function validarSaidaComRefreshPendente(p, outraAba) {
  // O browser adianta a expiração local. A API em memória mantém o relógio real
  // e responde com sucesso antes que a resposta seja liberada para a primeira aba.
  await p.clock.setSystemTime(Date.now() + 3600e3);
  const refresh = Promise.withResolvers();
  const liberar = Promise.withResolvers();
  const limite = setTimeout(() => refresh.reject(new Error('a aba não iniciou o refresh esperado')), 15000);
  await p.route(`${API}/api/auth/refresh`, async route => {
    try {
      const resposta = await route.fetch();
      refresh.resolve(resposta.status());
      await liberar.promise;
      await route.fulfill({ response: resposta }).catch(() => {}); // cancelamento local também é válido
    } catch (err) { refresh.reject(err); }
  });
  try {
    await p.evaluate(async () => {
      const { api } = await import('/js/api.js');
      window.testeRefresh = api('/clientes').then(() => 'liberou', () => 'bloqueou');
    });
    assert.equal(await refresh.promise, 200, 'provedor entregou um refresh válido antes do logout');
    await sair(outraAba);
    await p.waitForSelector(LOGGED_OUT);
    assert.equal(await p.isVisible('#appRoot'), false, 'logout chegou à outra aba');
  } finally {
    clearTimeout(limite);
    liberar.resolve();
  }
  assert.notEqual(await p.evaluate(() => window.testeRefresh), 'liberou', 'requisição antiga retomou depois do logout');
  const autenticada = await p.evaluate(async () => Boolean((await import('/js/api.js')).getSession()));
  assert.equal(autenticada, false, 'refresh tardio não restaura a sessão');
  await p.reload();
  await p.waitForSelector(LOGGED_OUT);
}

async function validarStorageIndisponivel(browser) {
  const ctx = await novoContexto(browser);
  try {
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('Armazenamento indisponível no teste', 'SecurityError'); }
      });
    });
    const p = await novaPagina(ctx);
    await abrirLogin(p);
    assert.ok(await p.evaluate(() => {
      try { window.localStorage.getItem('fixture'); return false; }
      catch (err) { return err.name === 'SecurityError'; }
    }));
    assert.equal((await tentarLogin(p, ADMIN)).status(), 200);
    await p.waitForSelector(LOGGED_IN);
    await conferirPapel(p, 'Admin Dev · Admin');
    await sair(p);
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const adminCtx = await novoContexto(browser);
    const admin = await novaPagina(adminCtx);
    await abrirLogin(admin);
    assert.equal((await tentarLogin(admin, ADMIN, 'errada')).status(), 401);
    await esperarTexto(admin, '#loginErro', /e-mail ou senha incorretos/i);
    assert.equal(await admin.isVisible('#appRoot'), false);

    assert.equal((await tentarLogin(admin, ADMIN)).status(), 200);
    await admin.waitForSelector(LOGGED_IN);
    await conferirPapel(admin, 'Admin Dev · Admin');
    assert.equal(await admin.isVisible('#navDashboard'), true);
    await admin.screenshot({ path: path.join(tmpdir(), 'hopeos-admin.png') });
    await validarAgendamento(admin);

    const outraAba = await novaPagina(adminCtx);
    await outraAba.goto(BASE);
    await outraAba.waitForSelector(LOGGED_IN);
    await validarSaidaComRefreshPendente(admin, outraAba);
    await adminCtx.close();
    await validarStorageIndisponivel(browser);

    const prof = await entrar(browser, 'profissional@dev.local');
    await conferirPapel(prof, 'Ana (profissional) · Profissional');
    assert.equal(await prof.isVisible('#navDashboard'), false);
    await esperarTexto(prof, '.ag-line1', /10:00 Cliente Teste/);
    assert.equal(await prof.locator('.ag-line1').filter({ hasText: /11:00 Cliente Teste/ }).count(), 0, 'agenda do Bruno ausente');
    await prof.screenshot({ path: path.join(tmpdir(), 'hopeos-prof.png') });
    await prof.context().close();

    const recepcao = await entrar(browser, 'recepcao@dev.local');
    await conferirPapel(recepcao, 'Recepção Dev · Recepção');
    await recepcao.click('#navDashboard');
    const resumo = recepcao.locator('#dobraIndicadores:not([open]) > summary');
    if (await resumo.count()) await resumo.click();
    for (const id of ['dbMarginWidget', 'dbMoneyWidget']) {
      await esperarTexto(recepcao, `#${id} .widget-restrito`, 'Disponível para administração e gestão.');
    }
    await recepcao.screenshot({ path: path.join(tmpdir(), 'hopeos-recep.png') });
    await recepcao.context().close();

    const legado = await novaPagina(await novoContexto(browser));
    await abrirLogin(legado, `${BASE}&apiToken=dev`);
    assert.equal(await legado.isVisible('#appRoot'), false, 'a query de token não autentica');
    assert.equal(await legado.locator('#btnTokenLegado').count(), 0);
    assert.equal(new URL(legado.url()).searchParams.has('apiToken'), false, 'token removido da URL');
    const r = await fetch(`${API}/api/clientes`, { headers: { Authorization: 'Bearer dev' } });
    assert.equal(r.status, 401, 'a API deste cenário desabilitou o legado');
    assert.deepEqual(erroPagina, [], 'erros inesperados de página/console');
    console.log('OK login, autoria, papéis, logout com refresh pendente, armazenamento indisponível e legado desligado');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FALHOU', e); process.exitCode = 1; });
