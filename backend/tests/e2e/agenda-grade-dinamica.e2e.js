// E2E (Playwright/Chromium) do D-074 sob a CSP de produção: a grade do dia cresce até os
// atendimentos fora de 8h–20h. Um encaixe às 07:00 (Ana) e outro às 20:30 (Bruno) aparecem e podem
// ser tocados; a régua vai de 07:00 a 21:00; o selo "2 fora da escala" leva ao primeiro. Num dia sem
// nada fora, a grade continua 08:00–20:00 e o selo não aparece (nada encolhe, nada muda).
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const dia = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const amanha = dia(1);
const depois = dia(2);

async function irPara(p, data) {
  await p.click('#navAgenda'); await p.waitForTimeout(500);
  for (let i = 0; i < 2; i++) {
    const d = p.locator(`[data-day="${data}"]`);
    if (await d.count()) { await d.first().click(); await p.waitForTimeout(900); return; }
    await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800);
  }
}
const regua = p => p.locator('.agenda-grid-ruler .ruler-mark').allInnerTexts();

(async () => {
  const empresa = (await db('empresas'))[0];
  const profs = await db('profissionais');
  const ana = profs.find(x => x.nome === 'Ana'); const bruno = profs.find(x => x.nome === 'Bruno');
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const cliente = (await db('clientes'))[0];
  const cedo = randomUUID(); const tarde = randomUUID();
  // Encaixes já gravados (fora da escala do seed, 09:00–13:00): o que a grade precisa mostrar.
  await fetch(`${API}/__db/agendamentos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([
    { id: cedo, empresa_id: empresa.id, profissional_id: ana.id, servico_id: corte.id, cliente_id: cliente.id, data: amanha, horario: '07:00:00', duracao_min: 30, status: 'agendado', valor_centavos: 6000 },
    { id: tarde, empresa_id: empresa.id, profissional_id: bruno.id, servico_id: corte.id, cliente_id: cliente.id, data: amanha, horario: '20:30:00', duracao_min: 30, status: 'confirmado', valor_centavos: 6000 }
  ]) });

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

  // 1) Dia com encaixes fora de 8h–20h.
  await irPara(p, amanha);
  await p.waitForSelector(`.ag-block[data-ag-id="${cedo}"]`, { timeout: 10000 });
  const marcas = await regua(p);
  console.log('RÉGUA (amanhã):', marcas[0], '…', marcas[marcas.length - 1]);
  confere('régua começa às 07:00', marcas[0] === '07:00');
  confere('régua termina às 21:00', marcas[marcas.length - 1] === '21:00');
  for (const [id, rotulo] of [[cedo, '07:00 (Ana)'], [tarde, '20:30 (Bruno)']]) {
    const bloco = p.locator(`.ag-block[data-ag-id="${id}"]`);
    // Como alguém rolaria até ele: centralizado (a barra de navegação fica fixa no rodapé).
    await bloco.evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
    const info = await bloco.evaluate(el => {
      const r = el.getBoundingClientRect(); const col = el.closest('.agenda-grid-col').getBoundingClientRect();
      const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { dentro: r.top >= col.top - 1 && r.bottom <= col.bottom + 1, topoEhOBloco: !!(topo && topo.closest('.ag-block') === el), cobertoPor: topo && !topo.closest('.ag-block') ? (topo.id || topo.className || topo.tagName) : null, base: Math.round(r.bottom), janela: innerHeight };
    });
    confere(`atendimento das ${rotulo} dentro da grade e tocável`, info.dentro && info.topoEhOBloco, JSON.stringify(info));
  }

  // 2) Selo: conta os dois e leva ao primeiro (07:00).
  await p.waitForSelector('#agSeloFora:not(.hidden)', { timeout: 10000 });
  const selo = (await p.textContent('#agSeloFora')).trim();
  confere('selo conta 2 fora', selo === '2 fora', selo);
  await p.evaluate(() => { document.getElementById('timelineContainer').scrollTop = 99999; });
  await p.click('#agSeloFora'); await p.waitForTimeout(900);
  const foco = await p.evaluate(id => {
    const el = document.querySelector(`.ag-block[data-ag-id="${id}"]`); const c = document.getElementById('timelineContainer');
    const r = el.getBoundingClientRect(); const cr = c.getBoundingClientRect();
    return { visivel: r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1, destaque: el.classList.contains('ag-flash') };
  }, cedo);
  confere('tocar no selo mostra o encaixe das 07:00 em destaque', foco.visivel && foco.destaque, JSON.stringify(foco));

  // 3) Dia sem nada fora: a grade fica 08:00–20:00 e o selo some.
  await irPara(p, depois);
  await p.waitForTimeout(600);
  const marcas2 = await regua(p);
  console.log('RÉGUA (depois de amanhã):', marcas2[0], '…', marcas2[marcas2.length - 1]);
  confere('dia sem encaixe mantém 08:00–20:00', marcas2[0] === '08:00' && marcas2[marcas2.length - 1] === '20:00');
  confere('selo some no dia sem nada fora', await p.locator('#agSeloFora').evaluate(el => el.classList.contains('hidden')));

  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
