// E2E (Playwright/Chromium, 390×844) do D-080 sob a CSP de produção: agenda com 2 profissionais por vez
// no celular. O seed tem Ana e Bruno; este caso planta Carla e Davi (4 no total).
//   1) cada coluna ocupa metade da largura útil (a régua de 44 px fica de fora);
//   2) não há barra extra acima da grade: desliza de lado, com encaixe por coluna, até o card da Davi;
//   3) com só 2 profissionais no filtro, as colunas ocupam a largura toda e a grade não rola de lado.
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const plantar = async (t, linhas) => {
  const r = await fetch(`${API}/__db/${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(linhas) });
  if (!r.ok) throw new Error(`não plantou ${t}: ${r.status}`);
};
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

(async () => {
  const empresa = (await db('empresas'))[0];
  const base = (await db('profissionais')).find(p => p.nome === 'Ana');
  const carla = { ...base, id: randomUUID(), nome: 'Carla' };
  const davi = { ...base, id: randomUUID(), nome: 'Davi' };
  await plantar('profissionais', [carla, davi]);
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const cliente = (await db('clientes'))[0];
  const agDavi = randomUUID();
  await plantar('agendamentos', [{ id: agDavi, empresa_id: empresa.id, profissional_id: davi.id, servico_id: corte.id, cliente_id: cliente.id, data: amanha, horario: '10:00:00', duracao_min: 30, status: 'agendado', valor_centavos: 6000 }]);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#navAgenda'); await p.waitForTimeout(500);
  for (let i = 0; i < 2 && !(await p.locator(`[data-day="${amanha}"]`).count()); i++) { await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800); }
  await p.locator(`[data-day="${amanha}"]`).first().click(); await p.waitForTimeout(900);

  const medida = () => p.evaluate(() => {
    const c = document.getElementById('timelineContainer');
    const heads = [...document.querySelectorAll('#agendaGrid .agenda-grid-header')];
    const cr = c.getBoundingClientRect();
    const naTela = heads.filter(h => { const r = h.getBoundingClientRect(); return r.left >= cr.left + 40 && r.right <= cr.right + 1; }).map(h => h.textContent.trim().split(/\s+/)[1] || h.textContent.trim());
    return { util: c.clientWidth - 44, col: Math.round(heads[0].getBoundingClientRect().width), n: heads.length, naTela,
      rolaDeLado: c.scrollWidth > c.clientWidth + 1, encaixe: getComputedStyle(c).scrollSnapType,
      barraExtra: !!document.getElementById('agPagina'), larguraPagina: document.documentElement.scrollWidth <= innerWidth };
  });
  const m1 = await medida();
  console.log('4 PROFISSIONAIS:', JSON.stringify(m1));
  confere('4 colunas na grade', m1.n === 4);
  confere('cada coluna ocupa metade da largura útil (2 na tela)', Math.abs(m1.col - m1.util / 2) <= 2 && m1.naTela.length === 2, `${m1.col} vs ${m1.util / 2} · ${m1.naTela}`);
  confere('sem barra extra acima da grade; desliza de lado com encaixe por coluna', !m1.barraExtra && m1.rolaDeLado && /x/.test(m1.encaixe), JSON.stringify({ barra: m1.barraExtra, encaixe: m1.encaixe }));
  confere('a página não rola de lado (só a grade)', m1.larguraPagina);

  // Deslizar até o fim mostra Carla e Davi, e o card da Davi.
  await p.evaluate(() => { const c = document.getElementById('timelineContainer'); c.scrollTo({ left: c.scrollWidth }); });
  await p.waitForTimeout(600);
  const m2 = await medida();
  const cardDavi = await p.evaluate(id => {
    const el = document.querySelector(`.ag-card[data-ag-id="${id}"]`); const c = document.getElementById('timelineContainer').getBoundingClientRect();
    const r = el.getBoundingClientRect(); return r.left >= c.left + 40 && r.right <= c.right + 1;
  }, agDavi);
  console.log('DEPOIS DE DESLIZAR:', JSON.stringify(m2));
  confere('deslizando, o card da Davi fica dentro da tela', cardDavi && m2.naTela.length === 2, JSON.stringify(m2.naTela));
  await p.evaluate(() => { document.getElementById('timelineContainer').scrollTo({ left: 0 }); }); await p.waitForTimeout(300);

  // Só 2 no filtro: largura toda, sem rolar de lado.
  await p.click('#btnAgProfs'); await p.waitForTimeout(300);
  for (const nome of ['Ana', 'Bruno']) { await p.locator('#agFiltroProfs .chip', { hasText: nome }).click(); await p.waitForTimeout(300); }
  await p.waitForTimeout(600);
  const m4 = await medida();
  console.log('FILTRO COM 2:', JSON.stringify(m4));
  confere('com 2 profissionais: cabem na largura, sem rolar de lado', m4.n === 2 && !m4.rolaDeLado && Math.abs(m4.col - m4.util / 2) <= 2, JSON.stringify(m4));

  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await p.screenshot({ path: '/tmp/hopeos-agenda-colunas.png' });
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
