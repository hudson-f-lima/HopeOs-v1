// E2E (Playwright/Chromium): comanda com vários serviços, vários produtos e vários
// profissionais (D-020), sob a CSP de produção. Um cliente, uma comanda: corte com
// um profissional, barba com outro, um kit de 2 produtos vendido por um deles e um
// produto avulso; remoção de item; fechamento; conferência no banco.
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };

async function escolher(p, campo, texto) {
  await p.fill(campo, texto);
  await p.locator(`${campo} ~ div [data-value]`).filter({ hasText: texto }).first().click();
}

(async () => {
  // Dois produtos com estoque; pomada com comissão de 10% para quem vende.
  const pomada = await legado('/produtos', { nome: 'Pomada', custoCentavos: 1000, precoVendaCentavos: 3000, estoqueInicial: 10, comissaoPct: 10 });
  const shampoo = await legado('/produtos', { nome: 'Shampoo', custoCentavos: 1500, precoVendaCentavos: 4500, estoqueInicial: 5 });
  confere('produtos do seed', pomada.ok && shampoo.ok, JSON.stringify([pomada.error, shampoo.error]));
  const profs = await db('profissionais');
  const ana = profs.find(x => x.nome === 'Ana'); const bruno = profs.find(x => x.id !== ana.id);

  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 400) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#navCheckout');
  confere('abas falsas "Serviços/Produtos" removidas', await p.locator('#checkoutTabs').count() === 0);

  // 1) Corte com o Bruno
  await escolher(p, '#coServico', 'Corte'); await escolher(p, '#coProfissional', bruno.nome);
  await p.click('#btnAddItem'); await p.waitForSelector('#coItensLista [data-item="0"]');
  confere('campos limpos depois de adicionar', await p.inputValue('#coServico') === '' && await p.inputValue('#coProfissional') === '');
  // 2) Barba com a Ana + kit de 2 pomadas vendido por ela (serviço e produto de uma vez)
  await escolher(p, '#coServico', 'Barba'); await escolher(p, '#coProduto', 'Pomada'); await p.fill('#coProdutoQtd', '2'); await escolher(p, '#coProfissional', ana.nome);
  await p.click('#btnAddItem'); await p.waitForSelector('#coItensLista [data-item="2"]');
  // 3) Shampoo avulso vendido pelo Bruno; 4) item errado, removido em seguida
  await escolher(p, '#coProduto', 'Shampoo'); await escolher(p, '#coProfissional', bruno.nome); await p.click('#btnAddItem');
  await escolher(p, '#coServico', 'Corte'); await escolher(p, '#coProfissional', ana.nome); await p.click('#btnAddItem');
  await p.waitForSelector('#coItensLista [data-item="4"]');
  confere('5 itens na lista, subtotal 265,00', await p.locator('#coItensLista [data-item]').count() === 5 && await p.getAttribute('#coItensSubtotal', 'data-subtotal') === '26500');
  await p.click('[data-remover-item="4"]');
  confere('remover item: 4 itens, subtotal 205,00', await p.locator('#coItensLista [data-item]').count() === 4 && await p.getAttribute('#coItensSubtotal', 'data-subtotal') === '20500');
  const rotulos = await p.$$eval('#coItensLista [data-item] span', ns => ns.map(n => n.textContent.trim()));
  confere('cada item mostra o seu profissional', rotulos[0].includes(bruno.nome) && rotulos[1].includes(ana.nome) && rotulos[2].startsWith('2× Pomada') && rotulos[2].includes(ana.nome) && rotulos[3].includes(bruno.nome), JSON.stringify(rotulos));

  // Serviço sem profissional é barrado na tela, sem chamar a API.
  await escolher(p, '#coServico', 'Barba'); await p.click('#btnAddItem');
  confere('serviço sem profissional é barrado', await p.locator('#coItensLista [data-item]').count() === 4);
  // Apagar o campo à mão desfaz a escolha (antes ela ficava escondida e ia para a comanda).
  await p.fill('#coServico', '');
  // Focar um campo já escolhido não desfaz a escolha.
  await escolher(p, '#coForma', 'Pix'); await p.focus('#coCliente'); await p.focus('#coForma'); await p.focus('#coCliente');

  await p.click('#btnSimular'); await p.waitForSelector('#cardPreview:not(.hidden)');
  confere('resumo: serviços 100,00 e produtos 105,00', /100,00/.test(await p.textContent('#pvServicos')) && /105,00/.test(await p.textContent('#pvProdutos')), `${await p.textContent('#pvServicos')} | ${await p.textContent('#pvProdutos')}`);
  await p.click('#btnFechar'); await p.waitForSelector('#cardResultado:not(.hidden)');

  const itens = await db('comando_itens'); const comandos = await db('comandos'); const produtos = await db('produtos');
  confere('uma comanda com 4 itens', comandos.length === 1 && itens.length === 4 && itens.every(i => i.comando_id === comandos[0].id));
  const servicos = itens.filter(i => i.tipo === 'servico'); const prods = itens.filter(i => i.tipo === 'produto');
  confere('dois serviços com profissionais diferentes', servicos.length === 2 && new Set(servicos.map(i => i.profissional_id)).size === 2);
  const kit = prods.find(i => i.descricao === 'Pomada');
  confere('kit: 2 pomadas, vendedora Ana, comissão de 10% = 6,00', kit && kit.quantidade === 2 && kit.profissional_id === ana.id && kit.valor_liquido_centavos === 6000 && kit.comissao_centavos === 600, JSON.stringify(kit && [kit.quantidade, kit.valor_liquido_centavos, kit.comissao_centavos]));
  confere('shampoo com vendedor Bruno', prods.some(i => i.descricao === 'Shampoo' && i.profissional_id === bruno.id));
  confere('estoque baixado: pomada 8, shampoo 4', produtos.find(x => x.nome === 'Pomada').estoque_atual === 8 && produtos.find(x => x.nome === 'Shampoo').estoque_atual === 4);
  confere('total recebido 205,00', comandos[0].total_recebido_centavos === 20500);
  confere('lista zerada depois de fechar', await p.locator('#coItensLista [data-item]').count() === 0 && !(await p.isVisible('#coItens')));

  // Fluxo simples continua: escolher um serviço e simular, sem "Adicionar".
  await escolher(p, '#coServico', 'Barba'); await escolher(p, '#coProfissional', ana.nome); await escolher(p, '#coForma', 'Pix');
  await p.click('#btnSimular'); await p.waitForSelector('#cardPreview:not(.hidden)'); await p.click('#btnFechar'); await p.waitForSelector('#cardResultado:not(.hidden)');
  confere('fluxo simples de um serviço continua funcionando', (await db('comandos')).length === 2 && (await db('comando_itens')).length === 5);

  await p.locator('#tab-checkout').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-comanda.png') });
  console.log('RECEPCAO erros:', JSON.stringify(erros));
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})();
