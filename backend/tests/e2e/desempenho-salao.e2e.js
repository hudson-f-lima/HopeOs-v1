// Percurso móvel do gestor, com API real sobre o banco em memória do runner.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.E2E_BASE || 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const api = new URL(base).searchParams.get('apiBase');
const caminho = '/api/cockpit/desempenho';
const requisicao = req => req.method() === 'GET' && new URL(req.url()).pathname === caminho;

async function painel(browser, email) {
  const page = await browser.newPage({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const consultas = [];
  page.on('request', req => { if (requisicao(req)) consultas.push(req); });
  await page.goto(base);
  await page.fill('#loginEmail', email);
  await page.fill('#loginSenha', 'dev12345');
  await page.click('#btnLogin');
  await page.click('#navDashboard');
  await page.waitForTimeout(600);
  // D-071: o acesso fica fora da dobra "Análises", que continua fechada.
  page.atalhoForaDaDobra = await page.evaluate(() => !document.getElementById('dobraIndicadores').open
    && !document.getElementById('dobraIndicadores').contains(document.getElementById('btnAbrirDesempenho'))
    && !document.getElementById('btnAbrirDesempenho').classList.contains('hidden'));
  await page.locator('#dobraIndicadores > summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(consultas.length, 0, 'abrir o Painel e o índice não consulta desempenho');
  return { page, consultas };
}

async function preparar() {
  const origem = new URL(api).origin;
  const [servicos, profissionais, clientes] = await Promise.all(['servicos', 'profissionais', 'clientes']
    .map(async tabela => (await fetch(origem + '/__db/' + tabela)).json()));
  const post = async (path, body) => {
    const res = await fetch(api + path, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await res.json()).ok, true, path);
  };
  await post('/formas-pagamento', { code: 'dinheiro', label: 'Dinheiro' });
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  for (const id of ['primeira', 'segunda']) {
    await post('/checkout/close', { data, clienteId: clientes[0].id, idempotencyKey: 'desempenho-' + id,
      itens: [{ tipo: 'servico', servicoId: servicos.find(s => s.nome === 'Barba').id, profissionalId: profissionais.find(p => p.nome === 'Ana').id }],
      payments: [{ formaCode: 'dinheiro', valorCentavos: 4000 }] });
  }
}

(async () => {
  await preparar();
  const browser = await chromium.launch();
  try {
    const { page, consultas } = await painel(browser, 'admin@dev.local');
    assert.equal(page.atalhoForaDaDobra, true, 'Desempenho do salão visível sem abrir Análises');
    const abrir = page.getByRole('button', { name: 'Desempenho do salão', exact: true });
    await abrir.focus();
    // Queda de rede antes da leitura, seguida de uma nova consulta autorizada.
    await page.route(/\/api\/cockpit\/desempenho(?:\?|$)/, route => route.abort('failed'), { times: 1 });
    await page.keyboard.press('Enter');
    const tentar = page.locator('#btnRecarregarDesempenho');
    await tentar.waitFor({ state: 'visible' });
    const resposta = page.waitForResponse(r => requisicao(r.request()) && r.status() === 200);
    await tentar.click();
    const dados = (await (await resposta).json()).data;
    assert.equal(dados.faturamentoCentavos, 8000);
    assert.equal(dados.comandas, 2);
    assert.equal(dados.ticketMedioCentavos, 4000);
    assert.equal(dados.visitasIdentificadas, 1);
    assert.equal(dados.clientesFieis, 0);
    await page.locator('#desempenhoParteHora').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /80,00/.test(document.getElementById('desempenhoIndicadores').innerText));
    assert.match(await page.locator('#desempenhoIndicadores').innerText(), /40,00/);
    assert.ok(await page.locator('#desempenhoPeriodo').innerText());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.equal(consultas.length, 2, 'uma falha e uma leitura após tentar novamente');
    assert.equal(await page.locator('#desempenhoIndicadores [data-indicador]').count(), 6);
    await page.click('#btnVerResultadoFinanceiro');
    assert.equal(await page.locator('#dobraResultadoFinanceiro').evaluate(n => n.open), true);
    assert.match(await page.locator('#desempenhoComposicao').innerText(), /Parte do salão/);
    assert.equal(consultas.length, 2, 'a composição reutiliza a leitura do período');
    await page.click('#btnVoltarAnalises');
    assert.equal(await abrir.evaluate(n => n === document.activeElement), true);
    assert.equal(await page.locator('#dobraIndicadores').evaluate(n => n.open), true);
    const recepcao = await painel(browser, 'recepcao@dev.local');
    assert.equal(await recepcao.page.getByRole('button', { name: 'Desempenho do salão', exact: true }).isVisible(), false);
    assert.equal(recepcao.consultas.length, 0);
    console.log('OK desempenho · abertura sob demanda, falha e recuperação, totais por comanda/visita, teclado, largura móvel e recepção');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
