// Fila, checkout vinculado e histórico na mesma aba, sob a CSP de produção.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const db = async tabela => {
  const r = await fetch(`${API}/__db/${tabela}`);
  assert.equal(r.status, 200);
  return r.json();
};

async function entrar(b, papel, erros, chamadas = []) {
  const contexto = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Sao_Paulo' });
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
  p.on('request', req => {
    if (!req.url().startsWith(API)) return;
    const { pathname, search } = new URL(req.url());
    chamadas.push(`${req.method()} ${pathname}${search}`);
  });
  await p.click('#navCheckout');
  await p.locator('#comandasHome').waitFor();
  return p;
}

function linha(p, id) {
  return p.locator(`[data-comandas-agenda="${id}"]`);
}

async function abrirDaFila(p, id) {
  await linha(p, id).click();
  await p.locator('#comandasDetalhe').waitFor();
  assert.equal(await p.isVisible('#comandasCheckout'), false);
  await p.click('#btnComandaDoAtendimento');
}

async function escolherPix(p) {
  await p.fill('#coForma', 'Pix');
  await p.locator('#coForma ~ div [data-value]').filter({ hasText: 'Pix' }).click();
}

async function conferirSelecaoPorTeclado(p) {
  await p.click('#btnNovaComanda');
  const cliente = p.locator('#coCliente');
  await cliente.waitFor();
  await cliente.fill('Cliente Teste');
  await p.waitForFunction(() => document.getElementById('coCliente').getAttribute('aria-expanded') === 'true');
  await cliente.press('ArrowDown');
  await p.waitForFunction(() => Boolean(document.getElementById('coCliente').getAttribute('aria-activedescendant')));
  await cliente.press('Escape');
  assert.equal(await cliente.getAttribute('aria-expanded'), 'false');
  await cliente.fill('Cliente');
  await cliente.press('ArrowDown');
  await cliente.press('Enter');
  assert.equal(await cliente.inputValue(), 'Cliente Teste');
  assert.equal(await cliente.getAttribute('aria-expanded'), 'false');
  await p.click('#btnVoltarCheckoutComandas');
}

(async () => {
  const [agenda, profs] = await Promise.all([db('agendamentos'), db('profissionais')]);
  const ana = profs.find(p => p.nome === 'Ana');
  const bruno = profs.find(p => p.nome === 'Bruno');
  const agAna = agenda.find(a => a.data === HOJE && a.profissional_id === ana.id);
  const agBruno = agenda.find(a => a.data === HOJE && a.profissional_id === bruno.id);
  assert.ok(agAna && agBruno, 'dois atendimentos do seed do dia');
  const browser = await chromium.launch();
  const erros = [];
  try {
    const profissional = await entrar(browser, 'profissional', erros);
    await linha(profissional, agAna.id).waitFor();
    assert.equal(await linha(profissional, agBruno.id).isVisible(), false);
    assert.equal(await profissional.isVisible('#btnComandasHistorico'), false);
    await conferirSelecaoPorTeclado(profissional);

    const chamadas = [];
    const p = await entrar(browser, 'recepcao', erros, chamadas);
    const chamadasDaFila = () => chamadas.filter(x => /^GET \/api\/(agenda|comandas)\?/.test(x));
    await linha(p, agAna.id).waitFor();
    await linha(p, agBruno.id).waitFor();
    assert.equal(await p.isVisible('#btnComandasHistorico'), false);
    assert.deepEqual(chamadasDaFila(), [`GET /api/agenda?data=${HOJE}`]);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    await abrirDaFila(p, agAna.id);
    await p.locator('#comandasCheckout').waitFor();
    assert.match(await p.inputValue('#coServico'), /^Barba/);
    assert.deepEqual(chamadasDaFila(), [`GET /api/agenda?data=${HOJE}`], 'abrir o detalhe e o editor não repete a leitura');
    await escolherPix(p);
    await p.click('#btnSimular');
    await p.locator('#cardPreview').waitFor();
    assert.match(await p.locator('#pvRecebido').innerText(), /40,00/);
    assert.match(await p.locator('#pvCliente').innerText(), /Cliente Teste/);
    assert.match(await p.locator('#pvFormas').innerText(), /Pix/);
    await p.click('#tipPlusBtn');
    assert.equal(await p.isVisible('#cardPreview'), false, 'alterar o valor exige uma nova simulação');
    assert.equal(await p.isDisabled('#btnFechar'), true);
    assert.equal((await db('comandos')).length, 0);

    await p.click('#btnVoltarCheckoutComandas');
    await abrirDaFila(p, agAna.id);
    await p.locator('#comandasCheckout').waitFor();
    assert.equal(await p.inputValue('#coForma'), 'Pix', 'a mesma agenda reabre o rascunho');
    await p.click('#btnVoltarCheckoutComandas');

    const cancelou = p.waitForEvent('dialog');
    await linha(p, agBruno.id).click();
    const tentarOutro = p.click('#btnComandaDoAtendimento');
    await (await cancelou).dismiss();
    await tentarOutro;
    await p.locator('#comandasDetalhe').waitFor();
    assert.equal(await p.isVisible('#comandasCheckout'), false);
    await p.click('#btnVoltarComandas');
    await abrirDaFila(p, agAna.id);
    await p.locator('#comandasCheckout').waitFor();
    assert.equal(await p.inputValue('#coForma'), 'Pix');
    assert.match(await p.locator('#coItensLista').innerText(), /Barba/);
    await p.click('#btnVoltarCheckoutComandas');

    await linha(p, agBruno.id).click();
    p.once('dialog', dialog => dialog.accept());
    await p.click('#btnComandaDoAtendimento');
    await p.locator('#comandasCheckout').waitFor();
    assert.match(await p.inputValue('#coServico'), /^Corte/);
    assert.equal(await p.inputValue('#coForma'), '', 'a forma do rascunho anterior foi limpa');
    assert.equal(await p.isVisible('#cardPreview'), false);
    assert.match(await p.locator('#tipValue').innerText(), /0,00/);

    await escolherPix(p);
    await p.click('#btnSimular');
    await p.locator('#cardPreview').waitFor();
    assert.match(await p.locator('#pvRecebido').innerText(), /60,00/);
    await p.click('#btnFechar');
    await p.locator('#cardResultado').waitFor();
    const id = (await p.locator('#resComandaId').innerText()).trim();
    assert.ok(id);
    const [comandas, pagamentos, agendaDepois] = await Promise.all([db('comandos'), db('comando_pagamentos'), db('agendamentos')]);
    assert.deepEqual(comandas.map(c => [c.id, c.total_recebido_centavos]), [[id, 6000]]);
    assert.deepEqual(pagamentos.map(x => [x.comando_id, x.forma_code, x.valor_centavos]), [[id, 'pix', 6000]]);
    assert.equal(agendaDepois.find(a => a.id === agBruno.id).status, 'concluido');
    assert.equal(agendaDepois.find(a => a.id === agAna.id).status, agAna.status);
    assert.equal(chamadas.filter(x => x === 'POST /api/checkout/close').length, 1);

    await p.click('#btnVoltarCheckoutComandas');
    await linha(p, agAna.id).waitFor();
    assert.equal(await linha(p, agBruno.id).isVisible(), false, 'o atendimento pago sai da fila');

    const admin = await entrar(browser, 'admin', erros);
    await admin.click('#btnComandasHistorico');
    const data = admin.locator('#comandasData');
    await data.fill('2001-01-02');
    await admin.waitForFunction(() => /Nenhuma comanda fechada/.test(document.getElementById('comandasStatus').textContent));
    await data.fill(HOJE);
    await admin.locator(`[data-comandas-historico="${id}"]`).click();
    const detalhe = admin.locator('#comandasDetalhe');
    await detalhe.waitFor();
    assert.match(await detalhe.innerText(), /60,00/);
    assert.equal(await admin.isVisible('#btnComandaDoAtendimento'), false);
    assert.equal(await admin.isVisible('#comandasCheckout'), false);
    assert.deepEqual(erros, []);
    console.log('OK fila por papel, teclado, troca de rascunho, um pagamento vinculado e histórico sem edição');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FALHOU', e); process.exitCode = 1; });
