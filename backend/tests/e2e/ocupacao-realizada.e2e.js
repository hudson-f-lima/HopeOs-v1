const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { sairDaConta } = require('./navegacao');

const base = process.env.E2E_BASE || 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const api = new URL(base).searchParams.get('apiBase');
const origem = new URL(api).origin;
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const diaUTC = new Date(hoje + 'T00:00:00Z');
const dia = deslocamento => new Date(+diaUTC + deslocamento * 86400000).toISOString().slice(0, 10);
const segunda = dia(-((diaUTC.getUTCDay() + 6) % 7));
const inicio = [segunda, hoje.slice(0, 7) + '-01'].sort()[0];

const lerBanco = async tabela => (await fetch(origem + '/__db/' + tabela)).json();
async function semear(tabela, linhas) {
  const resp = await fetch(origem + '/__db/' + tabela, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(linhas)
  });
  assert.equal((await resp.json()).ok, true, tabela);
}

const excecao = (p, tipo, de, ate, inicio = null, fim = null) => ({
  id: randomUUID(), empresa_id: p.empresa_id, profissional_id: p.id, tipo, data_inicio: de, data_fim: ate, inicio, fim
});

async function preparar() {
  const [profissionais, servicos, [cliente]] = await Promise.all(['profissionais', 'servicos', 'clientes'].map(lerBanco));
  const ana = profissionais.find(p => p.nome === 'Ana');
  const bruno = profissionais.find(p => p.nome === 'Bruno');
  const corte = servicos.find(s => s.nome === 'Corte');
  const amanha = dia(1);
  const excecoes = [
    excecao(bruno, 'ausencia', inicio, amanha),
    excecao(ana, 'horario', hoje, hoje, '09:00', '10:00'),
    excecao(ana, 'horario', amanha, amanha, '09:00', '10:00')
  ];
  if (inicio < hoje) excecoes.push(excecao(ana, 'ausencia', inicio, dia(-1)));
  await semear('disponibilidade_excecoes', excecoes);
  const agenda = (data, horario, status) => ({
    id: randomUUID(), empresa_id: ana.empresa_id, profissional_id: ana.id, servico_id: corte.id,
    cliente_id: cliente.id, data, horario, duracao_min: 45, status, valor_centavos: 6000
  });
  await semear('agendamentos', [
    agenda(hoje, '09:00:00', 'concluido'), agenda(hoje, '09:30:00', 'concluido'),
    agenda(amanha, '09:00:00', 'confirmado')
  ]);
  return { ana, cliente };
}

async function entrar(page, email) {
  await page.fill('#loginEmail', email);
  await page.fill('#loginSenha', 'dev12345');
  await page.click('#btnLogin');
  await page.waitForSelector('#appRoot:not(.hidden)');
}

const dadoDaResposta = async resposta => (await (await resposta).json()).data;
const respostaPara = (page, path) => page.waitForResponse(r => new URL(r.url()).pathname === '/api' + path && r.ok());
const cartao = page => page.locator('#ckCards .ck-card').filter({ hasText: 'Ocupação realizada' });
const esperarTexto = (locator, texto) => locator.and(locator.page().getByText(texto, { exact: true })).waitFor();
const valorDoCartao = (page, texto) => esperarTexto(cartao(page).locator('.ck-card-valor'), texto);
const ticketMargem = page => page.locator('#dbMarginWidget .row').filter({ hasText: 'Ticket médio' }).locator('b');
const detalheLinha = (detalhe, rotulo) => detalhe.locator('dl > div').filter({
  has: detalhe.page().getByText(rotulo, { exact: true })
}).locator('dd');

async function legado(route, reduzir) {
  const response = await route.fetch();
  const json = await response.json();
  reduzir(json.data);
  await route.fulfill({ response, json });
}

(async () => {
  const { ana, cliente } = await preparar();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.goto(base);
    await entrar(page, 'admin@dev.local');
    const respostaCockpit = respostaPara(page, '/cockpit');
    const respostaAgenda = respostaPara(page, '/insights/occupancy');
    const recursoRepasses = /\/api\/dashboard\?visao=painel$/;
    let liberarRepasses;
    const esperaRepasses = new Promise(resolve => { liberarRepasses = resolve; });
    let leiturasRepasses = 0;
    await page.route(recursoRepasses, async route => {
      leiturasRepasses++;
      await esperaRepasses;
      await route.continue();
    });
    const respostaRepasses = respostaPara(page, '/dashboard');
    try {
      await page.click('#navDashboard');
      assert.equal((await dadoDaResposta(respostaAgenda)).realizada.minutosRealizados, 90,
        'A consulta da agenda não depende dos pagamentos e repasses.');
    } finally {
      liberarRepasses();
    }
    await respostaRepasses;
    await page.unroute(recursoRepasses);
    assert.equal(leiturasRepasses, 1);
    await valorDoCartao(page, '150%');
    assert.match(await cartao(page).innerText(), /90 min em serviços para 60 min disponíveis/);
    const cockpit = await dadoDaResposta(respostaCockpit);
    assert.equal(cockpit.ocupacaoMes.ocupacaoPct, 100, 'a PWA anterior ainda lê o preenchimento pela chave legada');
    assert.equal(cockpit.ocupacaoMes.minutosOcupados, 60);
    assert.ok(!cockpit.alertas.some(a => /conflit/i.test(a.titulo)), 'produção acima de 100% não cria alerta de conflito');

    const detalhe = cartao(page).locator('details');
    const resumo = detalhe.locator('summary');
    await resumo.focus();
    await page.keyboard.press('Enter');
    assert.equal(await detalhe.evaluate(n => n.open), true);
    assert.equal(await resumo.evaluate(n => n === document.activeElement), true);
    assert.ok((await resumo.boundingBox()).height >= 44);
    assert.equal(await detalheLinha(detalhe, 'Preenchimento realizado da grade').innerText(), '100%');
    assert.equal(await detalheLinha(detalhe, 'Após o expediente').innerText(), '15 min');
    assert.equal(await detalheLinha(detalhe, 'Sobreposição de serviços').innerText(), '15 min');
    assert.match(await detalhe.innerText(), /escala atual foi aplicada/i);
    await page.keyboard.press('Enter');
    assert.equal(await detalhe.evaluate(n => n.open), false);

    const analises = page.locator('#dobraIndicadores > summary');
    await analises.click();
    await esperarTexto(ticketMargem(page), 'Sem comandas válidas');
    await page.locator('#dbOccupancyWidget').getByText('150%', { exact: true }).waitFor();
    if (diaUTC.getUTCDay() !== 0) {
      await page.locator('#dbOccupancyWidget').getByText('Ocupação prevista', { exact: true }).waitFor();
    }
    const abrir = page.locator('#btnAbrirDesempenho');
    await abrir.focus();
    await page.keyboard.press('Enter');
    await esperarTexto(page.locator('#desempenhoOcupacao'), '150%');
    assert.equal(await page.locator('#desempenhoTicket').innerText(), 'Sem comandas válidas');
    await page.locator('#desempenhoOcupacaoDetalhe summary').click();
    assert.equal(await detalheLinha(page.locator('#desempenhoOcupacaoDetalhe details'), 'Tempo preenchido na grade').innerText(), '60 min');
    await page.locator('#btnVoltarAnalises').focus();
    await page.keyboard.press('Enter');
    assert.equal(await abrir.evaluate(n => n === document.activeElement), true);

    // Mesma dupla de serviços, com tempo ocioso na escala e simultaneidade visível abaixo de 100%.
    await semear('disponibilidade_excecoes', [excecao(ana, 'horario', hoje, hoje, '10:00', '12:00')]);
    await semear('comandos', [{
      id: randomUUID(), empresa_id: ana.empresa_id, cliente_id: cliente.id, data: hoje,
      status: 'fechado', itens_liquidos_centavos: 0, total_recebido_centavos: 0, receita_empresa_centavos: 0
    }]);
    await page.click('#navAgenda');
    await page.click('#navDashboard');
    await valorDoCartao(page, '50%');
    await cartao(page).locator('summary').click();
    assert.equal(await detalheLinha(detalhe, 'Sobreposição de serviços').innerText(), '15 min');
    assert.equal(await detalheLinha(detalhe, 'Preenchimento realizado da grade').innerText(), '41,7%');
    assert.equal(await detalheLinha(detalhe, 'Fora da escala').innerText(), '0 min');
    await esperarTexto(ticketMargem(page), /R\$\s*0,00/);
    await abrir.click();
    await esperarTexto(page.locator('#desempenhoTicket'), /R\$\s*0,00/);
    await page.click('#btnVoltarAnalises');

    // Sem expediente, os 90 minutos de produção continuam presentes.
    await semear('disponibilidade_excecoes', [excecao(ana, 'ausencia', hoje, hoje)]);
    await page.click('#navAgenda');
    await page.click('#navDashboard');
    await valorDoCartao(page, 'Sem escala para calcular');
    assert.match(await cartao(page).innerText(), /90 min em serviços para 0 min disponíveis/);
    await cartao(page).locator('summary').click();
    assert.equal(await detalheLinha(detalhe, 'Em dia sem expediente').innerText(), '75 min');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem horizontal');

    // Mesma sessão de navegador, agora na recepção, sem consultas nem payloads financeiros.
    await sairDaConta(page);
    await page.waitForSelector('#loginScreen:not(.hidden)');
    const requisicoes = [];
    page.on('request', req => requisicoes.push(new URL(req.url()).pathname));
    await entrar(page, 'recepcao@dev.local');
    const respostaOperacional = respostaPara(page, '/insights/occupancy');
    await page.click('#navDashboard');
    const operacional = await respostaOperacional;
    assert.equal((await dadoDaResposta(operacional)).realizada.minutosRealizados, 90);
    await page.click('#dobraIndicadores > summary');
    // A linha da ocupação realizada (D-087): numa sexta, a "Ocupação prevista" (resto da semana, sábado sem
    // escala no seed) também mostra "Sem escala para calcular", e procurar em qualquer <b> achava dois.
    await page.locator('#dbOccupancyWidget .row', { has: page.locator('strong', { hasText: 'Ocupação realizada' }) })
      .locator('b').filter({ hasText: /^Sem escala para calcular$/ }).waitFor();
    assert.ok(!requisicoes.includes('/api/dashboard'), 'A recepção já recebe a ocupação pela consulta operacional.');
    const headers = { authorization: await operacional.request().headerValue('authorization') };
    const empresa = await operacional.request().headerValue('x-empresa-id');
    if (empresa) headers['x-empresa-id'] = empresa;
    const painelAnterior = await fetch(api + '/dashboard?visao=painel', { headers });
    assert.equal(painelAnterior.status, 200);
    assert.deepEqual(Object.keys(await dadoDaResposta(painelAnterior)), ['kpis']);
    for (const recurso of ['/cockpit', '/cockpit/desempenho', '/insights/margin']) {
      assert.equal((await fetch(api + recurso, { headers })).status, 403);
      assert.ok(!requisicoes.includes('/api' + recurso));
    }
    assert.equal(await cartao(page).isVisible(), false);
    assert.equal(await abrir.isVisible(), false);
    assert.equal(await page.locator('#dobraRepasses').isVisible(), false);
    assert.deepEqual(erros, []);

    // Respostas com apenas as chaves anteriores durante a atualização da API.
    const antiga = await browser.newPage({ serviceWorkers: 'block' });
    await antiga.route('**/api/cockpit', route => legado(route, d => {
      delete d.ocupacao.ocupacaoRealizadaPct;
      delete d.ocupacaoMes.ocupacaoRealizadaPct;
      d.ocupacaoMes.ocupacaoPct = 100;
      for (const p of d.equipe) delete p.ocupacaoRealizadaPct;
    }));
    await antiga.route(/\/api\/cockpit\/desempenho(?:\?|$)/, route => legado(route, d => {
      delete d.ocupacaoRealizadaPct;
      delete d.periodoPredefinido;
      d.ocupacaoPct = 100;
    }));
    await antiga.route('**/api/insights/occupancy?*', route => legado(route, d => { delete d.realizada; }));
    await antiga.goto(base);
    await entrar(antiga, 'admin@dev.local');
    await antiga.click('#navDashboard');
    await valorDoCartao(antiga, 'Em atualização');
    assert.equal(await cartao(antiga).locator('details').count(), 0);
    await antiga.click('#dobraIndicadores > summary');
    await antiga.locator('#dbOccupancyWidget').getByText('Dados de ocupação em atualização.').waitFor();
    await antiga.click('#btnAbrirDesempenho');
    await esperarTexto(antiga.locator('#desempenhoOcupacao'), 'Em atualização');
    assert.equal(await antiga.locator('#desempenhoFiltro').isVisible(), false);
    console.log('OK ocupação realizada · 150%, simultaneidade em dia ocioso, sem escala, foco, ticket zero, recepção e troca de versão da API');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
