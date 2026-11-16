// E2E (Playwright/Chromium): plano de assinatura na agenda e na comanda (Onda A, fase 2; D-043).
// Pela API: plano "Clube Corte" (corte ilimitado... limite 4, todos os dias, todos os profissionais)
// e assinatura paga para o cliente do seed. Na tela, a recepção:
//   1) abre o card do horário de corte de hoje e vê o selo "Assinante · Plano Clube Corte: coberto (1 de 4)";
//   2) monta a comanda com o cliente e o corte: o item mostra o plano, o resumo cobra R$ 0,00 e fecha sem
//      forma de pagamento; o banco registra o uso preso ao item a R$ 0;
//   3) "Não usar o plano" volta ao valor cheio (precisa de forma de pagamento).
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();

async function escolher(p, campo, texto) {
  await p.click(campo); await p.fill(campo, texto); await p.waitForTimeout(250);
  await p.locator(`${campo} ~ div [data-value]`).first().click();
}

(async () => {
  const sessao = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@dev.local', password: 'dev12345' }) })).json();
  const token = sessao.data.access_token || sessao.data.session.access_token;
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const cat = (await (await fetch(`${API}/api/catalog`, { headers: auth })).json()).data;
  const corte = cat.servicos.find(s => s.nome === 'Corte');
  const cliente = cat.clientes[0];
  const plano = (await (await fetch(`${API}/api/assinaturas/planos`, { method: 'POST', headers: auth, body: JSON.stringify({ nome: 'Clube Corte', precoCentavos: 11500, comissao: { regra: 'rateio', percentual: 50 }, itens: [{ servicoId: corte.id, limitePorCiclo: 4 }] }) })).json()).data;
  const ass = await (await fetch(`${API}/api/assinaturas`, { method: 'POST', headers: auth, body: JSON.stringify({ clienteId: cliente.id, planoId: plano.id, pagamento: { forma: 'pix' } }) })).json();
  console.log('ASSINATURA PELA API:', ass.ok, ass.data && ass.data.situacao.estado);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const errs = []; const csp = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(1000);

  // 1) Selo no card do horário de corte do cliente (seed: hoje 11:00 com o Bruno).
  const ag = (await db('agendamentos')).find(a => a.servico_id === corte.id && a.cliente_id === cliente.id && a.status === 'agendado');
  await p.locator(`[data-id="${ag.id}"]`).first().click();
  await p.waitForSelector('#sheetPlano:not(.hidden)', { timeout: 8000 });
  const selo = (await p.textContent('#sheetPlano')).trim();
  console.log('SELO NA AGENDA:', selo);
  if (!/Assinante · Plano Clube Corte: coberto \(1 de 4\)/.test(selo)) errs.push('selo do plano errado');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.goto(APP); await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);

  // 2) Comanda: cliente + corte com o Bruno → plano cobre, R$ 0,00, fecha sem forma de pagamento.
  await p.click('#navCheckout'); await p.waitForTimeout(500);
  const bruno = cat.profissionais.find(x => x.nome === 'Bruno');
  await escolher(p, '#coCliente', cliente.nome);
  await escolher(p, '#coServico', 'Corte'); await escolher(p, '#coProfissional', bruno.nome); await p.click('#btnAddItem');
  await p.click('#btnSimular');
  await p.waitForSelector('#cardPreview:not(.hidden)', { timeout: 8000 });
  const linha = (await p.locator('#coItensLista .row').first().innerText()).replace(/\s+/g, ' ');
  const aviso = (await p.textContent('#coPlanoAviso')).trim();
  const recebido = (await p.textContent('#pvRecebido')).trim();
  console.log('ITEM:', linha, '| RESUMO:', aviso, '| RECEBIDO:', recebido);
  if (!/Plano Clube Corte: coberto \(1 de 4\)/.test(linha) || !/R\$\s*0,00/.test(recebido) || !/cobra R\$\s*0,00 de R\$\s*60,00/.test(aviso)) errs.push('comanda sem a cobertura do plano');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-comanda-plano.png'), fullPage: true });
  await p.click('#btnFechar'); await p.waitForSelector('#cardResultado:not(.hidden)', { timeout: 8000 });
  const usos = await db('assinatura_usos');
  const itens = await db('comando_itens');
  const item = usos[0] && itens.find(i => i.id === usos[0].comando_item_id);
  console.log('BANCO: usos', usos.length, '| tipo', usos[0] && usos[0].tipo, '| item a', item && item.preco_unitario_centavos, '| pagamentos da comanda', (await db('comando_pagamentos')).filter(x => item && x.comando_id === item.comando_id).length);
  if (usos.length !== 1 || usos[0].tipo !== 'coberto' || !item || item.preco_unitario_centavos !== 0) errs.push('uso não gravado preso ao item a R$ 0');

  // 2b) Caso do dono (16/11): serviço deixado nos campos, sem "Adicionar à comanda", e Simular.
  //     Antes ia para o fechamento sem passar pelo plano (valor cheio, sem aviso).
  await escolher(p, '#coCliente', cliente.nome);
  await escolher(p, '#coServico', 'Corte'); await escolher(p, '#coProfissional', bruno.nome);
  await p.click('#btnSimular'); await p.waitForSelector('#cardPreview:not(.hidden)', { timeout: 8000 });
  const linhaCampos = (await p.locator('#coItensLista .row').first().innerText()).replace(/\s+/g, ' ');
  const recebidoCampos = (await p.textContent('#pvRecebido')).trim();
  console.log('SEM "ADICIONAR":', linhaCampos, '| RECEBIDO:', recebidoCampos);
  if (!/Plano Clube Corte: coberto \(2 de 4\)/.test(linhaCampos) || !/R\$\s*0,00/.test(recebidoCampos)) errs.push('serviço deixado nos campos não passou pelo plano');
  await p.click('[data-remover-item="0"]'); await p.waitForTimeout(300);

  // 3) "Não usar o plano": valor cheio e pede forma de pagamento.
  await escolher(p, '#coCliente', cliente.nome);
  await escolher(p, '#coServico', 'Corte'); await escolher(p, '#coProfissional', bruno.nome); await p.click('#btnAddItem');
  await p.click('#btnSimular'); await p.waitForSelector('#cardPreview:not(.hidden)', { timeout: 8000 });
  await p.click('[data-sem-plano="0"]'); await p.waitForTimeout(300);
  const linha2 = (await p.locator('#coItensLista .row').first().innerText()).replace(/\s+/g, ' ');
  console.log('SEM O PLANO:', linha2);
  if (!/sem o plano/.test(linha2) || !/60,00/.test(linha2)) errs.push('"Não usar o plano" não voltou ao valor cheio');

  const violacoes = [...await p.evaluate(() => window.__csp), ...csp];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
