// E2E do Cockpit do gestor (D-064): admin vê os 4 indicadores, "Decidir agora", ocupação por dia,
// equipe e simulador, sem erro de console nem resposta >= 400; recepção não vê nem chama /cockpit.
// Uso: node backend/tests/e2e/run-all.js cockpit
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(`${ok ? 'ok ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`); if (!ok) falhas++; };

async function entrar(b, email) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
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

(async () => {
  // Preparo: um plano à venda e um cliente sem assinatura com 2 comandas hoje → alerta "avulsos frequentes".
  await legado('/formas-pagamento', { code: 'dinheiro', label: 'Dinheiro' });
  const barba = (await db('servicos')).find(x => x.nome === 'Barba'); const ana = (await db('profissionais')).find(x => x.nome === 'Ana');
  const plano = await legado('/assinaturas/planos', { nome: 'Plano Cockpit', precoCentavos: 9490, comissao: { regra: 'tabela' }, itens: [{ servicoId: barba.id }] });
  confere('preparo: plano criado', plano.ok === true, JSON.stringify(plano.error || ''));
  const cliente = (await db('clientes'))[0];
  for (const k of ['e2e-ck-1', 'e2e-ck-2']) {
    const c = await legado('/checkout/close', { data: hojeSP, clienteId: cliente.id, idempotencyKey: k, itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'dinheiro', valorCentavos: 4000 }] });
    confere('preparo: comanda ' + k, c.ok === true, JSON.stringify(c.error || ''));
  }
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
  const total = await a.textContent('#ckSimTotal');
  confere('simulador mostra o potencial em R$', /^\+R\$/.test(total.trim()), total);
  const faltas = a.locator('#ckSimFaltas');
  if (!(await faltas.isDisabled())) {
    await faltas.fill('100');
    confere('simulador reage ao controle', (await a.textContent('#ckSimFaltasVal')) === '100%');
  } else {
    confere('sem base de faltas: controle desligado e motivo escrito', /sem faltas/.test(await a.textContent('#ckSimFaltasRes')));
  }
  for (const btn of await a.locator('#ckAlertas button').all()) {
    const h = (await btn.boundingBox()).height;
    if (h < 44) confere('alvo de toque das ações ≥ 44px', false, `${h}px`);
  }
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
  await b.close();
  if (falhas) { console.log(`E2E FALHOU (${falhas})`); process.exit(1); }
  console.log('E2E cockpit OK');
})().catch(err => { console.log('E2E FALHOU ' + err.message); process.exit(1); });
