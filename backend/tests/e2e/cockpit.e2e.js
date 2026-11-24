// E2E do Cockpit do gestor (D-064): admin vê os 4 indicadores, "Decidir agora", ocupação por dia,
// equipe e simulador, sem erro de console nem resposta >= 400; recepção não vê nem chama /cockpit.
// Uso: node backend/tests/e2e/run-all.js cockpit
const { chromium } = require('playwright');
const { randomUUID } = require('node:crypto');
const { DIAS_SEMANA } = require('../../src/engines/insights/cockpit');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(`${ok ? 'ok ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`); if (!ok) falhas++; };

async function entrar(b, email) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  p.errs = []; p.cockpit = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  p.on('response', r => {
    if (new URL(r.url()).pathname.endsWith('/api/cockpit')) p.cockpit.push(r.status());
    if (r.status() >= 400) p.errs.push(`${r.status()} ${r.url()}`);
  });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}

const API = BASE.split('apiBase=')[1].replace(/\/api$/, '');
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dia = deslocamento => new Date(Date.parse(hojeSP + 'T00:00:00Z') + deslocamento * 86400000).toISOString().slice(0, 10);
const nomeDia = deslocamento => DIAS_SEMANA[new Date(dia(deslocamento) + 'T00:00:00Z').getUTCDay()];
const semear = async (tabela, linhas) => {
  const r = await fetch(API + '/__db/' + tabela, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(linhas)
  });
  confere('preparo: ' + tabela, (await r.json()).ok === true);
};

async function semearCapacidade(ana, bruno, servico, cliente) {
  const diasRealizados = [-1, -8, -15, -22].map(dia);
  const excecao = (profissional_id, tipo, data_inicio, data_fim, inicio = null, fim = null) => ({
    id: randomUUID(), empresa_id: ana.empresa_id, profissional_id, tipo, data_inicio, data_fim, inicio, fim
  });
  await semear('disponibilidade_excecoes', [
    excecao(bruno.id, 'ausencia', dia(-28), dia(6)),
    ...diasRealizados.map(data => excecao(ana.id, 'horario', data, data, '09:00', '10:00')),
    ...[-4, -11, -18, -25, 3, 6].map(n => excecao(ana.id, 'ausencia', dia(n), dia(n)))
  ]);
  const agendamento = (data, horario, duracao_min, status = 'concluido') => ({
    id: randomUUID(), empresa_id: ana.empresa_id, profissional_id: ana.id, servico_id: servico.id,
    cliente_id: cliente.id, data, horario, duracao_min, status, valor_centavos: 4000
  });
  await semear('agendamentos', diasRealizados.flatMap(data => [
    agendamento(data, '09:00', 30), agendamento(data, '09:00', 30),
    agendamento(data, '18:00', 30), agendamento(data, '09:30', 15, 'confirmado')
  ]));
  const comanda_id = randomUUID();
  await semear('comandos', [{
    id: comanda_id, empresa_id: ana.empresa_id, data: dia(-3), status: 'fechado',
    itens_liquidos_centavos: 0, total_recebido_centavos: 0, receita_empresa_centavos: 0
  }]);
  await semear('comando_itens', [{
    id: randomUUID(), empresa_id: ana.empresa_id, comando_id: comanda_id, tipo: 'servico', servico_id: servico.id,
    profissional_id: ana.id, duracao_min: 30, quantidade: 1
  }]);
}

async function conferirCapacidade(pagina) {
  const grafico = pagina.locator('#ckDias');
  const linha = n => grafico.locator('details').filter({ has: pagina.locator('summary[aria-label^="' + nomeDia(n) + '."]') });
  const alto = linha(-1);
  const zero = linha(-2);
  const parcial = linha(-3);
  const semBase = linha(-4);
  const requisicoes = [];
  const registrar = req => {
    if (new URL(req.url()).pathname.startsWith('/api/')) requisicoes.push(req.url());
  };
  await pagina.waitForLoadState('networkidle');
  pagina.on('request', registrar);
  confere('os medidores compartilham escala de 0% a 150%', await grafico.locator('meter').evaluateAll(
    medidas => medidas.length > 0 && medidas.every(m => m.min === 0 && m.max === 150)));
  confere('as duas séries exibem 150% realizado e 50% preenchido', await alto.locator('meter').evaluateAll(
    medidas => medidas.map(m => m.value).join(',') === '150,50'));
  confere('sem escala aparece como Sem base, com escala sem serviços aparece como 0%', (await semBase.locator('summary').innerText()).includes('Sem base')
    && (await zero.locator('summary').innerText()).includes('0%'));
  await alto.locator('summary').press('Enter');
  const detalhe = alto.locator('.ck-dia-detalhe');
  confere('Enter abre o detalhe e mantém o foco', await detalhe.isVisible() && await alto.locator('summary').evaluate(s => s === document.activeElement));
  confere('alvo de toque dos dias tem pelo menos 44 px', (await alto.locator('summary').boundingBox()).height >= 44);
  confere('detalhe mostra minutos de serviço, escala e diagnósticos', /360 min em serviços para 240 min disponíveis/.test(await detalhe.innerText())
    && /Fora da escala\s+120 min/.test(await detalhe.innerText()) && /Sobreposição de serviços\s+120 min/.test(await detalhe.innerText()));
  confere('dia cuja próxima escala está fechada fica sem atalho', (await alto.locator('.ck-dia-agenda').count()) === 0);
  await parcial.locator('summary').tap();
  const detalheParcial = parcial.locator('.ck-dia-detalhe');
  const textoParcial = await detalheParcial.innerText();
  confere('toque abre cobertura parcial e explica o preenchimento sem base', await detalheParcial.isVisible()
    && /Cobertura parcial/.test(textoParcial) && /Preenchimento realizado da grade\s+Sem base/.test(textoParcial)
    && !/Fora da escala\s+0 min|Sobreposição de serviços\s+0 min/.test(textoParcial));
  confere('abrir os detalhes usa só dados locais', requisicoes.length === 0, JSON.stringify(requisicoes));
  pagina.off('request', registrar);
  await zero.locator('summary').tap();
  await zero.locator('.ck-dia-agenda').tap();
  await pagina.waitForSelector('#tab-agenda:not(.hidden)');
  await pagina.waitForSelector('#dayPills [data-day="' + dia(5) + '"][aria-pressed="true"]');
  confere('atalho abre a data confirmada pelo servidor', true);
  await pagina.click('#navDashboard');
  await pagina.waitForSelector('#ckDias .ck-dia');
}

(async () => {
  // Preparo: um plano à venda e um cliente sem assinatura com 2 comandas hoje → alerta "avulsos frequentes".
  await legado('/formas-pagamento', { code: 'dinheiro', label: 'Dinheiro' });
  const barba = (await db('servicos')).find(x => x.nome === 'Barba');
  const profissionais = await db('profissionais');
  const ana = profissionais.find(x => x.nome === 'Ana');
  const bruno = profissionais.find(x => x.nome === 'Bruno');
  const plano = await legado('/assinaturas/planos', { nome: 'Plano Cockpit', precoCentavos: 9490, comissao: { regra: 'tabela' }, itens: [{ servicoId: barba.id }] });
  confere('preparo: plano criado', plano.ok === true, JSON.stringify(plano.error || ''));
  const cliente = (await db('clientes'))[0];
  for (const k of ['e2e-ck-1', 'e2e-ck-2']) {
    const c = await legado('/checkout/close', { data: hojeSP, clienteId: cliente.id, idempotencyKey: k, itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'dinheiro', valorCentavos: 4000 }] });
    confere('preparo: comanda ' + k, c.ok === true, JSON.stringify(c.error || ''));
  }
  await semearCapacidade(ana, bruno, barba, cliente);
  const b = await chromium.launch();
  const a = await entrar(b, 'admin@dev.local');
  await a.click('#navDashboard');
  await a.waitForSelector('#cockpit:not(.hidden) .ck-card', { timeout: 10000 });
  await a.waitForFunction(() => !/Calculando/.test(document.getElementById('ckStatus').textContent));
  confere('admin: cockpit visível com 4 indicadores', (await a.locator('#ckCards .ck-card').count()) === 4);
  confere('status de saúde preenchido', /Operação|Decisões/.test(await a.textContent('#ckStatus')), await a.textContent('#ckStatus'));
  const alertas = await a.locator('#ckAlertas .ck-alerta').count();
  const vazio = await a.locator('#ckAlertas .empty-state').count();
  confere('"Decidir agora": alertas ou o aviso de nada pendente (nunca enchimento)', alertas > 0 || vazio === 1, `${alertas} alerta(s)`);
  confere('ocupação: 7 dias da semana', (await a.locator('#ckDias .ck-dia').count()) === 7);
  confere('equipe: tabela ou estado vazio', (await a.locator('#ckEquipe table, #ckEquipe .empty-state').count()) === 1);
  confere('simulador mostra a receita recorrente bruta do cenário e evita total agregado',
    /Receita recorrente bruta estimada de R\$/.test(await a.textContent('#ckSimConverterRes'))
    && await a.getByText('Cenários independentes. Capacidade e receita podem se sobrepor.').isVisible()
    && !(await a.locator('#ckSimTotal').isVisible()));
  const faltas = a.locator('#ckSimFaltas');
  if (!(await faltas.isDisabled())) {
    await faltas.fill('100');
    confere('simulador reage ao controle', (await a.textContent('#ckSimFaltasVal')) === '100%');
  } else {
    confere('sem base de faltas: controle desligado e motivo escrito', /sem faltas/.test(await a.textContent('#ckSimFaltasRes')));
  }
  const alturas = await a.locator('#ckAlertas button:visible').evaluateAll(botoes => botoes.map(b => b.getBoundingClientRect().height));
  confere('alvo de toque das ações ≥ 44px', alturas.every(h => h >= 44), alturas.join(', '));
  await conferirCapacidade(a);
  await a.waitForLoadState('networkidle');
  const avulso = a.locator('#ckAlertas .ck-alerta').filter({ hasText: 'avulso' });
  confere('alerta de avulsos frequentes com o cliente e o valor', (await avulso.count()) === 1 && (await avulso.textContent()).includes(cliente.nome) && /94,90/.test(await avulso.textContent()), (await a.textContent('#ckAlertas')).replace(/\s+/g, ' ').slice(0, 300));
  if (await avulso.count()) {
    await avulso.locator('button').click();
    await a.waitForSelector('#tab-gestao:not(.hidden)', { timeout: 5000 }).catch(() => {});
    await a.waitForTimeout(600);
    confere('ação "Ver planos e assinantes" abre Gestão → Assinantes', await a.isVisible('#subtab-assinantes'));
  }
  const larg = await a.evaluate(() => document.documentElement.scrollWidth);
  confere('sem rolagem horizontal no celular', larg <= 390, `${larg}px`);
  confere('admin: /cockpit 200 e nenhum erro', a.cockpit.includes(200) && a.errs.length === 0, JSON.stringify(a.errs));

  const r = await entrar(b, 'recepcao@dev.local');
  await r.click('#navDashboard'); await r.waitForTimeout(1500);
  confere('recepção: cockpit escondido', !(await r.isVisible('#cockpit')));
  confere('recepção: nem chama /cockpit (sem 403 na tela)', r.cockpit.length === 0 && r.errs.length === 0, JSON.stringify([r.cockpit, r.errs]));
  // Captura opcional para revisão humana (E2E_SHOT=caminho): computador, densidade 2.
  if (process.env.E2E_SHOT) {
    const d = await (await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })).newPage();
    await d.goto(BASE); await d.waitForSelector('#loginScreen:not(.hidden)');
    await d.fill('#loginEmail', 'admin@dev.local'); await d.fill('#loginSenha', 'dev12345'); await d.click('#btnLogin');
    await d.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 });
    await d.click('#navDashboard'); await d.waitForSelector('#cockpit:not(.hidden) .ck-card');
    await d.waitForFunction(() => !/Calculando/.test(document.getElementById('ckStatus').textContent));
    await d.locator('#cockpit').screenshot({ path: process.env.E2E_SHOT });
  }
  await b.close();
  if (falhas) { console.log(`E2E FALHOU (${falhas})`); process.exit(1); }
  console.log('E2E cockpit OK');
})().catch(err => { console.log('E2E FALHOU ' + err.message); process.exit(1); });
