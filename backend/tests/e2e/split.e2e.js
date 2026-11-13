// E2E (Playwright/Chromium): pagamento dividido em mais de uma forma, sob a CSP de produção.
// O caminho natural — ligar "Dividir pagamento" antes de simular — precisa funcionar.
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const escolher = async (p, campo, texto) => { await p.fill(campo, texto); await p.locator(`${campo} ~ div [data-value]`).filter({ hasText: texto }).first().click(); };

(async () => {
  const dinheiro = await legado('/formas-pagamento', { code: 'dinheiro', label: 'Dinheiro' });
  const debito = await legado('/formas-pagamento', { code: 'debito', label: 'Débito', taxaPct: 1.5 });
  confere('formas do preparo', dinheiro.ok && debito.ok);

  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 400) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#navCheckout');

  // Corte (60,00) + Barba (40,00) = 100,00
  await escolher(p, '#coProfissional', 'Bruno'); await escolher(p, '#coServico', 'Corte'); await p.click('#btnAddItem');
  await escolher(p, '#coProfissional', 'Ana'); await escolher(p, '#coServico', 'Barba'); await p.click('#btnAddItem');
  await p.waitForSelector('#coItensLista [data-item="1"]');

  // 1) Ligar "Dividir" SEM ter simulado e sem forma única escolhida.
  await p.click('#splitToggle');
  confere('dividir sem simular: abre com 2 linhas e esconde a forma única', await p.locator('.split-row').count() === 2 && !(await p.isVisible('#coForma')) && await p.getAttribute('#splitToggle', 'aria-checked') === 'true');
  confere('restante começa no total da comanda (100,00)', /100,00/.test(await p.textContent('.split-row-amount')));
  confere('"Fechar" desligado antes de simular', await p.isDisabled('#btnFechar'));

  // 2) Três formas: Pix 30,50 (com vírgula), Débito 20, Dinheiro o restante.
  await p.click('#addSplitRowBtn');
  confere('"+ Adicionar forma" cria a terceira linha', await p.locator('.split-row').count() === 3);
  await p.selectOption('.split-row-form[data-split-idx="0"]', 'pix'); await p.fill('.split-row-input[data-split-idx="0"]', '30,50');
  await p.selectOption('.split-row-form[data-split-idx="1"]', 'debito'); await p.fill('.split-row-input[data-split-idx="1"]', '20');
  await p.selectOption('.split-row-form[data-split-idx="2"]', 'dinheiro');
  confere('restante acompanha o que foi digitado: 49,50', /49,50/.test(await p.textContent('.split-row-amount')), await p.textContent('.split-row-amount'));
  const alvos = await p.$$eval('.split-row-remove, #addSplitRowBtn, .split-row-form, .split-row-input', ns => ns.map(n => Math.round(n.getBoundingClientRect().height)));
  confere('alvos de toque das linhas ≥ 44px', alvos.every(h => h >= 44), JSON.stringify(alvos));

  // 3) Valores que passam do total: aviso e nada de fechar.
  await p.fill('.split-row-input[data-split-idx="1"]', '90');
  confere('soma acima do total: avisa e não deixa simular', /já cobrem o total/.test(await p.textContent('#splitDica')));
  await p.click('#btnSimular'); await p.waitForTimeout(500);
  confere('simular com soma acima do total não abre o resumo nem grava', !(await p.isVisible('#cardPreview')) && (await db('comandos')).length === 0);
  await p.fill('.split-row-input[data-split-idx="1"]', '20');

  // 4) Simular e fechar.
  await p.click('#btnSimular'); await p.waitForSelector('#cardPreview:not(.hidden)');
  confere('resumo: total 100,00 e taxa só do débito (0,30)', /100,00/.test(await p.textContent('#pvRecebido')) && /0,30/.test(await p.textContent('#pvTaxa')), `${await p.textContent('#pvRecebido')} | ${await p.textContent('#pvTaxa')}`);
  confere('linhas e valores continuam na tela depois de simular', await p.locator('.split-row').count() === 3 && await p.inputValue('.split-row-input[data-split-idx="0"]') === '30,50');
  await p.click('#btnFechar'); await p.waitForSelector('#cardResultado:not(.hidden)');
  const pag = (await db('comando_pagamentos')).map(x => [x.forma_code, x.valor_centavos, x.taxa_total_centavos]);
  confere('três pagamentos gravados: Pix 30,50, Débito 20,00, Dinheiro 49,50', JSON.stringify(pag) === JSON.stringify([['pix', 3050, 0], ['debito', 2000, 30], ['dinheiro', 4950, 0]]), JSON.stringify(pag));
  confere('uma comanda de 100,00', (await db('comandos')).length === 1 && (await db('comandos'))[0].total_recebido_centavos === 10000);
  confere('depois de fechar: divisão desligada e forma única de volta', await p.getAttribute('#splitToggle', 'aria-checked') === 'false' && await p.isVisible('#coForma') && !(await p.isVisible('#splitRowsContainer')));

  // 5) Forma única já escolhida vira a primeira linha; mudar um item atualiza o restante.
  await escolher(p, '#coProfissional', 'Bruno'); await escolher(p, '#coServico', 'Corte'); await p.click('#btnAddItem');
  await escolher(p, '#coForma', 'Pix'); await p.click('#splitToggle');
  confere('forma única escolhida vira a primeira linha', await p.inputValue('.split-row-form[data-split-idx="0"]') === 'pix');
  await p.fill('.split-row-input[data-split-idx="0"]', '10'); await p.selectOption('.split-row-form[data-split-idx="1"]', 'dinheiro');
  confere('restante: 50,00', /50,00/.test(await p.textContent('.split-row-amount')));
  await escolher(p, '#coProfissional', 'Ana'); await escolher(p, '#coServico', 'Barba'); await p.click('#btnAddItem');
  confere('adicionar item atualiza o restante: 90,00', /90,00/.test(await p.textContent('.split-row-amount')), await p.textContent('.split-row-amount'));
  await p.click('#btnSimular'); await p.waitForSelector('#cardPreview:not(.hidden)'); await p.click('#btnFechar'); await p.waitForSelector('#cardResultado:not(.hidden)');
  const pag2 = (await db('comando_pagamentos')).slice(-2).map(x => [x.forma_code, x.valor_centavos]);
  confere('segunda comanda: Pix 10,00 + Dinheiro 90,00', JSON.stringify(pag2) === JSON.stringify([['pix', 1000], ['dinheiro', 9000]]), JSON.stringify(pag2));

  console.log('RECEPCAO erros:', JSON.stringify(erros));
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
