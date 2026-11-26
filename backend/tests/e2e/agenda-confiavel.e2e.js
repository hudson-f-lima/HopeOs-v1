// E2E (Playwright/Chromium) da agenda confiável (D-055), sob a CSP de produção.
//   1) Respostas fora de ordem: a semana +1 responde DEPOIS da +2; a tela fica na +2 (datas, grade
//      e agendamento da +2 visíveis) e não é sobrescrita pela resposta antiga.
//   2) Arraste com a grade rolada: soltar com o topo do bloco na linha das HH:MM grava HH:MM; a
//      prévia mostra o mesmo horário.
//   3) Disponibilidade desconhecida: escala do dia sem resposta → horários vazios marcados "não
//      confirmado" e aviso com "Tentar de novo"; ao tentar de novo, a grade volta ao normal.
//   4) Dia sem resposta: aviso de que os agendamentos do dia não carregaram.
//   5) Filtro com profissional que foi desativado: a grade volta a mostrar quem está ativo.
//   6) Três profissionais cabem no celular sem rolar de lado.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRUNO = 'aaaaaaaa-0000-4000-8000-000000000002';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const hoje = fuso(new Date());
const somaDias = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const inicioSemana = d => somaDias(d, -new Date(d + 'T12:00:00Z').getUTCDay());
const semana1 = inicioSemana(somaDias(hoje, 7));
const semana2 = inicioSemana(somaDias(hoje, 14));
const diasDa = ini => Array.from({ length: 7 }, (_, i) => somaDias(ini, i));
const alvo2 = somaDias(semana2, new Date(hoje + 'T12:00:00Z').getUTCDay()); // mesmo dia da semana de hoje, duas semanas à frente

async function login(email) {
  const s = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'dev12345' }) })).json();
  return { 'content-type': 'application/json', authorization: `Bearer ${s.data.access_token || s.data.session.access_token}` };
}
async function entrar(b, email, viewport = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) p.erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(900);
  await p.click('#navAgenda'); await p.waitForTimeout(500);
  return p;
}

(async () => {
  const adm = await login('admin@dev.local');
  const cat = (await (await fetch(`${API}/api/catalog`, { headers: adm })).json()).data;
  const cli = cat.clientes[0].id;
  const mk = async body => (await (await fetch(`${API}/api/agenda`, { method: 'POST', headers: adm, body: JSON.stringify({ clienteId: cli, servicoId: CORTE, aceitarAvisos: true, foraDaDisponibilidade: true, permitirConflito: true, ...body }) })).json()).data;
  const naSemana2 = await mk({ profissionalId: ANA, data: alvo2, horario: '10:00' });
  console.log('AGENDAMENTO NA SEMANA +2:', Boolean(naSemana2), alvo2);
  const b = await chromium.launch();

  // 1) Respostas fora de ordem.
  const r = await entrar(b, 'recepcao@dev.local');
  const atrasar = new Set(diasDa(semana1));
  await r.route('**/api/agenda?data=*', async route => {
    const d = new URL(route.request().url()).searchParams.get('data');
    if (atrasar.has(d)) await new Promise(res => setTimeout(res, 1800));
    await route.continue();
  });
  await r.click('#btnNextWeekMobile');
  await r.waitForTimeout(80);
  await r.click('#btnNextWeekMobile');
  await r.waitForTimeout(500);
  confere('enquanto a semana pedida não chega, a grade diz "carregando" (sem dados de outra semana)', await r.locator('#agendaGrid .ag-carregando').count() === 1 || await r.locator(`#agendaGrid [data-id="${naSemana2.id}"]`).count() === 1);
  await r.waitForTimeout(2600); // a resposta antiga (semana +1) chega por último
  await r.unroute('**/api/agenda?data=*');
  const estado = await r.evaluate(() => ({ dias: [...document.querySelectorAll('.day-pill')].map(e => e.dataset.day) }));
  confere('depois da resposta antiga, os dias mostrados são da semana +2', JSON.stringify(estado.dias) === JSON.stringify(diasDa(semana2)), JSON.stringify(estado.dias));
  await r.locator(`.day-pill[data-day="${alvo2}"]`).click(); await r.waitForTimeout(500);
  confere('o agendamento da semana +2 aparece na grade (não foi apagado pela resposta antiga)', await r.locator(`#agendaGrid [data-id="${naSemana2.id}"]`).count() === 1);
  confere('total do dia bate com a grade', /^1 agend\. no dia$/.test((await r.textContent('#dayCountLabel')).trim()), (await r.textContent('#dayCountLabel')).trim());

  // 2) Arraste com a grade rolada.
  const box = r.locator('#timelineContainer');
  await box.evaluate(e => { e.scrollTop = 3 * 60 * 3; }); // ~11:00 no topo
  await r.waitForTimeout(300);
  const destino = await r.evaluate(bruno => {
    const s = [...document.querySelectorAll(`.slot-vazio:not(.fora):not(.incerto)[data-prof="${bruno}"]`)].find(x => x.dataset.time >= '12:00' && x.dataset.time <= '14:00');
    if (!s) return null;
    const rr = s.getBoundingClientRect();
    return { hora: s.dataset.time, top: rr.top, x: rr.left + rr.width / 2 };
  }, BRUNO);
  const alca = await r.evaluate(id => {
    const bl = document.querySelector(`[data-ag-id="${id}"].ag-block`); const h = bl && bl.querySelector('.drag-handle');
    if (!h) return null;
    bl.scrollIntoView({ block: 'center' });
    const hb = h.getBoundingClientRect(); const bb = bl.getBoundingClientRect();
    return { x: hb.left + hb.width / 2, y: hb.top + hb.height / 2, pega: hb.top + hb.height / 2 - bb.top };
  }, naSemana2.id);
  if (!destino || !alca) { falhas.push('arraste: sem destino livre ou sem alça'); console.log('ARRASTE: sem destino/alça', JSON.stringify({ destino, alca })); }
  else {
    // A alça pode ter mudado de lugar com o scrollIntoView: mede de novo o destino.
    const d2 = await r.evaluate(([bruno, hora]) => { const s = document.querySelector(`.slot-vazio[data-prof="${bruno}"][data-time="${hora}"]`); const rr = s.getBoundingClientRect(); return { top: rr.top, x: rr.left + rr.width / 2 }; }, [BRUNO, destino.hora]);
    const a2 = await r.evaluate(id => { const bl = document.querySelector(`[data-ag-id="${id}"].ag-block`); const h = bl.querySelector('.drag-handle'); const hb = h.getBoundingClientRect(); const bb = bl.getBoundingClientRect(); return { x: hb.left + hb.width / 2, y: hb.top + hb.height / 2, pega: hb.top + hb.height / 2 - bb.top }; }, naSemana2.id);
    await r.mouse.move(a2.x, a2.y); await r.mouse.down();
    const yFinal = d2.top + a2.pega + 2; // topo do bloco 2 px abaixo da linha do horário
    for (let i = 1; i <= 8; i++) { await r.mouse.move(a2.x + (d2.x - a2.x) * i / 8, a2.y + (yFinal - a2.y) * i / 8); await r.waitForTimeout(30); }
    const previa = await r.evaluate(() => { const h = document.querySelector('.drag-highlight .dh-ini'); return h ? h.textContent.trim() : null; });
    confere('prévia do arraste mostra o horário da linha (' + destino.hora + ')', previa === destino.hora, String(previa));
    await r.mouse.up();
    await r.waitForTimeout(1200);
    if (await r.isVisible('#conflict-dialog[open]')) await r.click('#confirm-action-ok');
    await r.waitForTimeout(600);
    const novo = (await db('agendamentos')).find(a => a.data === alvo2 && a.profissional_id === BRUNO && a.cliente_id === cli && ['agendado', 'confirmado'].includes(a.status));
    confere('arraste com a grade rolada grava o horário da prévia', Boolean(novo) && String(novo.horario).slice(0, 5) === destino.hora, JSON.stringify(novo && novo.horario) + ' esperado ' + destino.hora);
  }

  // 3) Escala do dia sem resposta.
  await r.goto(APP); await r.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 });
  await r.route('**/api/disponibilidade/grade*', route => route.abort());
  await r.click('#navAgenda'); await r.waitForTimeout(400);
  // Um dia que não seja hoje (a escala de hoje já carregou ao abrir o app).
  await r.locator(`.day-pill:not([data-day="${hoje}"])`).first().click(); await r.waitForTimeout(1200);
  const incertos = await r.locator('#agendaGrid .slot-vazio.incerto').count();
  const livresSemMarca = await r.locator('#agendaGrid .slot-vazio:not(.incerto)').count();
  confere('escala sem resposta: horários vazios marcados "não confirmado" (nenhum parece livre)', incertos > 0 && livresSemMarca === 0, `${incertos} incertos, ${livresSemMarca} sem marca`);
  confere('aviso explica e oferece "Tentar de novo"', /escala do dia não carregou/i.test(await r.textContent('#agStatus')) && await r.isVisible('#btnAgTentar'));
  await r.unroute('**/api/disponibilidade/grade*');
  await r.click('#btnAgTentar'); await r.waitForTimeout(1500);
  confere('ao tentar de novo, a grade volta a afirmar livre/fora', await r.locator('#agendaGrid .slot-vazio.incerto').count() === 0 && await r.locator('#agendaGrid .slot-vazio').count() > 0);

  // 4) Dia sem resposta.
  const diaFalho = await r.evaluate(() => document.querySelector('.day-pill.selected').dataset.day);
  await r.route(`**/api/agenda?data=${diaFalho}*`, route => route.abort());
  await r.click('#btnAgTentar').catch(() => {});
  await r.evaluate(() => document.getElementById('btnNextWeekMobile').click()); await r.waitForTimeout(800);
  await r.evaluate(() => document.getElementById('btnPrevWeekMobile').click()); await r.waitForTimeout(1500);
  await r.locator(`.day-pill[data-day="${diaFalho}"]`).click(); await r.waitForTimeout(800);
  confere('dia sem resposta: aviso de que os agendamentos não carregaram e nada parece livre', /agendamentos deste dia não carregaram/i.test(await r.textContent('#agStatus')) && await r.locator('#agendaGrid .slot-vazio:not(.incerto)').count() === 0);
  await r.unroute(`**/api/agenda?data=${diaFalho}*`);
  console.log('RECEPÇÃO erros:', JSON.stringify(r.erros.filter(e => !/ERR_FAILED|net::/.test(e)))); falhas.push(...r.erros.filter(e => !/ERR_FAILED|net::/.test(e)));

  // 5) e 6) Três profissionais; filtro com quem foi desativado.
  const caio = (await (await fetch(`${API}/api/profissionais`, { method: 'POST', headers: adm, body: JSON.stringify({ nome: 'Caio Terceiro' }) })).json()).data;
  const g = await entrar(b, 'admin@dev.local');
  // D-080 (substitui a regra da D-055 de 3 colunas no celular): 2 por vez, o resto ao lado, com indicador.
  const lado = await g.evaluate(() => { const c = document.getElementById('timelineContainer'); const h = document.querySelector('.agenda-grid-header').getBoundingClientRect().width;
    return { cols: document.querySelectorAll('.agenda-grid-col').length, visiveis: Math.round((c.clientWidth - 44) / h), indicador: document.getElementById('agPagTxt').textContent }; });
  confere('três profissionais: 2 por vez no celular, com indicador', lado.cols === 3 && lado.visiveis === 2 && /1–2 de 3$/.test(lado.indicador), JSON.stringify(lado));
  await g.click('#btnAgProfs'); await g.click(`#agFiltroProfs [data-agf="${caio.id}"]`); await g.waitForTimeout(300);
  confere('filtro só com o Caio', JSON.stringify(await g.$$eval('.agenda-grid-col', cs => cs.map(c => c.dataset.profId))) === JSON.stringify([caio.id]));
  await fetch(`${API}/api/profissionais/${caio.id}`, { method: 'PATCH', headers: adm, body: JSON.stringify({ ativo: false }) });
  await g.evaluate(async () => { const m = await import('./js/state.js'); await m.loadCatalog(); });
  await g.waitForTimeout(600);
  const depois = await g.$$eval('.agenda-grid-col', cs => cs.map(c => c.dataset.profId));
  confere('Caio desativado: a seleção é normalizada e a grade mostra os ativos', depois.length === 2 && !depois.includes(caio.id), JSON.stringify(depois));
  console.log('ADMIN erros:', JSON.stringify(g.erros)); falhas.push(...g.erros);

  const viol = [...await r.evaluate(() => window.__csp), ...await g.evaluate(() => window.__csp)];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(viol)); falhas.push(...viol);
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
