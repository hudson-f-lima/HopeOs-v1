// Playwright sob a CSP de produção e a API em memória.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;

async function entrar(b, papel, viewport, erros) {
  const contexto = await b.newContext({ viewport, timezoneId: 'America/Sao_Paulo' });
  const p = await contexto.newPage();
  p.setDefaultTimeout(12000);
  p.on('pageerror', e => erros.push(`${papel}: ${e.message}`));
  p.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith(API)) erros.push(`${papel}: ${r.status()} ${new URL(r.url()).pathname}`);
  });
  await p.goto(BASE);
  await p.fill('#loginEmail', `${papel}@dev.local`);
  await p.fill('#loginSenha', 'dev12345');
  await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)');
  return p;
}

async function esperarFoco(p, id) {
  await p.waitForFunction(alvo => document.activeElement?.id === alvo, id);
}

(async () => {
  const browser = await chromium.launch();
  const erros = [];
  try {
    const admin = await entrar(browser, 'admin', { width: 390, height: 844 }, erros);
    const gestao = admin.locator('#tab-gestao');
    const conta = admin.locator('#sheetConta');
    const equipes = admin.locator('#subtabBtnEquipe');
    await admin.locator('#navGestao').press('Enter');
    await gestao.waitFor();
    assert.equal(await admin.getAttribute('#navGestao', 'aria-current'), 'page');
    for (const grupo of ['Como o salão funciona', 'Como a agenda aparece', 'Clientes que agendam sozinhos', 'Equipe', 'O que o salão vende', 'Clientes', 'Dinheiro']) {
      await gestao.getByRole('heading', { name: grupo, exact: true }).waitFor();
    }
    assert.equal(await conta.isVisible(), false);
    const busca = admin.locator('#buscaGestao');
    await busca.fill('Equipe');
    await equipes.waitFor();
    assert.equal(await admin.isVisible('#subtabBtnPlanos'), false);
    await equipes.press('Enter');
    await admin.locator('#sheetGestao').waitFor();
    await admin.keyboard.press('Escape');
    await admin.locator('#sheetGestao').waitFor({ state: 'hidden' });
    await esperarFoco(admin, 'subtabBtnEquipe');
    assert.equal(await busca.inputValue(), 'Equipe');
    await busca.fill('');

    await admin.locator('#gestaoCaixa').click();
    await admin.locator('#dobraCaixa[open]').waitFor();
    await admin.locator('#btnVoltarGestao').click();
    await gestao.waitFor();

    await admin.locator('#navAvatar').press('Enter');
    await admin.locator('#sheetConta[open]').waitFor();
    assert.equal(await conta.locator('#btnLogout').isVisible(), true);
    assert.equal(await conta.locator('.subtab-btn:visible').count(), 0);
    for (let i = 0; i < 5; i++) {
      await admin.keyboard.press('Tab');
      assert.equal(await conta.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body), true);
    }
    await admin.keyboard.press('Escape');
    await conta.waitFor({ state: 'hidden' });
    await esperarFoco(admin, 'navAvatar');
    assert.equal(await gestao.isVisible(), true);
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    const recepcao = await entrar(browser, 'recepcao', { width: 820, height: 1180 }, erros);
    await recepcao.click('#navGestao');
    await recepcao.locator('#gestaoCaixa').waitFor();
    await recepcao.locator('.subtab-btn[data-subtab="formas"]').waitFor();
    assert.equal(await recepcao.isVisible('#subtabBtnComissoes'), false);
    assert.equal(await recepcao.isVisible('#navMetas'), false);

    const profissional = await entrar(browser, 'profissional', { width: 1280, height: 800 }, erros);
    await profissional.click('#navGestao');
    await profissional.locator('#subtabBtnEscalas').waitFor();
    assert.equal(await profissional.isVisible('#gestaoCaixa'), false);
    assert.equal(await profissional.isVisible('#subtabBtnEquipe'), false);
    await profissional.click('#navAvatar');
    const meuMes = profissional.locator('#sheetConta #navMetas');
    await meuMes.waitFor();
    assert.equal((await meuMes.innerText()).trim(), 'Meu mês');
    await meuMes.click();
    await profissional.locator('#tab-metas').waitFor();
    assert.equal(await profissional.isVisible('#ganhosProfissional'), false);
    assert.deepEqual(erros, []);
    console.log('OK Gestão, Caixa e Minha conta por papel, teclado e foco em celular, tablet e desktop');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FALHOU', e); process.exitCode = 1; });
