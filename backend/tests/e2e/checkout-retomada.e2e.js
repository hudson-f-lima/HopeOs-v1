// A API grava o fechamento, mas a resposta se perde entre logout e novo login.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:3399';
const BASE = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const CLOSE = `${API}/api/checkout/close`;
const ADMIN = 'admin@dev.local';
const APP = '#appRoot:not(.hidden)';
const LOGIN = '#loginScreen:not(.hidden) #loginForm:not(.hidden)';
const PRODUTO = 'Pomada teste de retomada';

async function fixtures(tabela) {
  const r = await fetch(`${API}/__db/${tabela}`);
  assert.equal(r.status, 200);
  return r.json();
}

async function login(p, email) {
  await p.waitForSelector(LOGIN);
  await p.fill('#loginEmail', email);
  await p.fill('#loginSenha', 'dev12345');
  const resposta = p.waitForResponse(r => r.url() === `${API}/api/auth/login` && r.request().method() === 'POST');
  await p.click('#btnLogin');
  const r = await resposta;
  assert.equal(r.status(), 200);
  await p.waitForSelector(APP);
  return (await r.json()).data;
}

async function sair(p) {
  await p.click('#navAvatar');
  await p.click('#btnLogout');
  await p.waitForSelector(LOGIN);
}

async function escolher(p, campo, texto) {
  await p.fill(campo, texto);
  await p.locator(`${campo} ~ div [data-value]`).filter({ hasText: texto }).click();
}

async function simularProduto(p) {
  await p.click('#navCheckout');
  await escolher(p, '#coProduto', PRODUTO);
  await escolher(p, '#coProfissional', 'Ana');
  await escolher(p, '#coForma', 'Pix');
  await p.click('#btnSimular');
  await p.waitForSelector('#cardPreview:not(.hidden)');
}

async function adicionarProduto() {
  // Fixture exclusiva da API em memória, preparada antes de abrir a PWA.
  const r = await fetch(`${API}/api/produtos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev' },
    body: JSON.stringify({ nome: PRODUTO, custoCentavos: 1000, precoVendaCentavos: 3000, estoqueInicial: 10 })
  });
  assert.equal(r.status, 201);
  return (await r.json()).data;
}

async function conferirBanco(venda, produto, autor) {
  const [comandas, pagamentos, movimentos, estoque, produtos] = await Promise.all([
    fixtures('comandos'), fixtures('comando_pagamentos'), fixtures('caixa_movimentos'),
    fixtures('produto_estoque_movimentos'), fixtures('produtos')
  ]);
  assert.equal(comandas.length, 1);
  assert.deepEqual([comandas[0].id, comandas[0].actor_id, comandas[0].total_recebido_centavos], [venda, autor, 3000]);
  assert.deepEqual(pagamentos.map(x => [x.comando_id, x.forma_code, x.valor_centavos]), [[venda, 'pix', 3000]]);
  assert.deepEqual(movimentos.map(x => [x.comando_id, x.tipo, x.valor_centavos]), [[venda, 'entrada_pagamento', 3000]]);
  assert.deepEqual(estoque.filter(m => m.tipo === 'venda').map(x => [x.comando_id, x.produto_id, x.quantidade]), [[venda, produto, 1]]);
  assert.equal(produtos.find(p => p.id === produto)?.estoque_atual, 9);
}

(async () => {
  const produto = await adicionarProduto();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(15000);
  const p = await context.newPage();
  const aba = await context.newPage();
  const erros = [];
  const envios = [];
  for (const page of [p, aba]) page.on('pageerror', err => erros.push(err.message));
  p.on('request', r => { if (r.url() === CLOSE && r.method() === 'POST') envios.push(r); });
  const fechamento = Promise.withResolvers();
  const liberar = Promise.withResolvers();
  let primeiroPayload;
  try {
    await p.goto(BASE);
    const sessao = await login(p, ADMIN);
    await aba.goto(BASE);
    await aba.waitForSelector(APP);

    await simularProduto(p);

    const acompanhar = setTimeout(() => fechamento.reject(new Error('o fechamento não chegou à API')), 15000);
    try {
      await p.route(CLOSE, async route => {
        if (route.request().method() !== 'POST' || primeiroPayload) return route.continue();
        try {
          primeiroPayload = route.request().postDataJSON();
          const r = await route.fetch();
          fechamento.resolve({ status: r.status(), corpo: await r.json() });
          await liberar.promise;
          await route.fulfill({ response: r }).catch(() => {}); // aba pode ter cancelado na saída
        } catch (err) { fechamento.reject(err); }
      });
      await p.click('#btnFechar');
      const { status, corpo } = await fechamento.promise;
      assert.equal(status, 201);
      const { comandoId, idempotent } = corpo.data.saved;
      assert.equal(idempotent, false);
      assert.ok(primeiroPayload.idempotencyKey);
      assert.equal(await p.isVisible('#cardResultado'), false);
      await conferirBanco(comandoId, produto.id, sessao.user.id);

      await sair(aba);
      await p.waitForSelector(LOGIN);
      liberar.resolve();
      assert.equal(await p.isVisible('#cardResultado'), false);

      await login(p, 'recepcao@dev.local');
      await simularProduto(p);
      assert.equal(await p.isVisible('#checkoutPendente'), false, 'outra identidade pode simular, sem ver a pendência');
      await conferirBanco(comandoId, produto.id, sessao.user.id);
      await sair(p);

      await login(p, ADMIN);
      await p.click('#navCheckout');
      await p.click('#btnSimular');
      await p.waitForSelector('#checkoutPendente:not(.hidden)');
      const retomar = p.locator('#btnRetomarFechamento');
      await retomar.waitFor({ state: 'visible' });
      assert.equal(envios.length, 1, 'a retomada depende do clique e não envia automaticamente');
      await conferirBanco(comandoId, produto.id, sessao.user.id);
      const resposta = p.waitForResponse(r => r.url() === CLOSE && r.request().method() === 'POST');
      await retomar.click();
      const r = await resposta;
      assert.equal(r.status(), 201);
      assert.deepEqual(r.request().postDataJSON(), primeiroPayload, 'a nova tentativa usa a mesma chave e o mesmo corpo');
      const { data } = await r.json();
      assert.equal(data.saved.idempotent, true);
      assert.equal(data.saved.comandoId, comandoId);
      assert.equal(envios.length, 2);
      await p.waitForSelector('#cardResultado:not(.hidden)');
      assert.equal((await p.textContent('#resComandaId')).trim(), comandoId);
      assert.equal(await p.isVisible('#checkoutPendente'), false);
      await conferirBanco(comandoId, produto.id, sessao.user.id);
    } finally {
      clearTimeout(acompanhar);
      liberar.resolve();
    }
    assert.deepEqual(erros, []);
    console.log('OK retomada manual da mesma comanda após logout, com autoria, caixa e estoque gravados uma vez');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FALHOU', e); process.exitCode = 1; });
