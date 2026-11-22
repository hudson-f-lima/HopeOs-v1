// E2E (Playwright/Chromium) da agenda redesenhada (D-053), sob a CSP de produção.
//   1) Leitura data → profissionais → grade: a grade começa cedo na tela, sem rolagem lateral,
//      sem barra de conta/versão competindo (conta e versão ficam em Conta).
//   2) Controles honestos: setas dizem "semana", ícones são botões com rótulo, alvos ≥ 44px.
//   3) Mesmo escopo: total do dia, pontos da semana, total da semana, contagem por coluna e
//      blocos na grade batem, com e sem filtro; cancelado não conta.
//   4) Profissionais: seleção múltipla com resumo; todos marcados = "Todos".
//   5) Painéis um por vez; busca só na semana (e diz isso) e abre o card certo.
//   6) Data abre o calendário do mês; "Hoje" volta para hoje.
//   7) Tocar no horário livre leva data e profissional para o fluxo de agendar.
//   8) Profissional com escopo próprio: só a própria coluna (a do colega pareceria livre).
//   9) Desktop: sem rolagem lateral, grade visível.
const { chromium } = require('playwright');
const { irParaConta } = require('./navegacao');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRUNO = 'aaaaaaaa-0000-4000-8000-000000000002';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const BARBA = 'bbbbbbbb-0000-4000-8000-000000000002';
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const hoje = fuso(new Date());
const amanha = fuso(new Date(Date.now() + 864e5));

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
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#navAgenda'); await p.waitForTimeout(500);
  return p;
}
async function irPara(p, dia) {
  for (let i = 0; i < 2; i++) {
    const d = p.locator(`[data-day="${dia}"]`);
    if (await d.count()) { await d.first().click(); await p.waitForTimeout(600); return; }
    await p.click('#btnNextWeekMobile'); await p.waitForTimeout(900);
  }
}
const txt = (p, sel) => p.textContent(sel).then(t => String(t || '').replace(/\s+/g, ' ').trim());
// Tudo que a agenda mostra sobre o dia, para comparar o escopo.
const leitura = p => p.evaluate(dia => ({
  totalDia: Number((document.getElementById('dayCountLabel').textContent.match(/\d+/) || [NaN])[0]),
  pilula: Number(((document.querySelector(`.day-pill[data-day="${dia}"]`) || {}).getAttribute?.('aria-label') || '').match(/: (\d+)/)?.[1]),
  somaColunas: [...document.querySelectorAll('.timeline-prof-count')].reduce((t, e) => t + Number((e.textContent.match(/\d+/) || [0])[0]), 0),
  blocos: document.querySelectorAll('#agendaGrid .ag-block').length,
  colunas: [...document.querySelectorAll('.agenda-grid-col')].map(c => c.dataset.profId),
  semana: document.getElementById('weekCountLabel').textContent
}), amanha);
const pequenos = p => p.evaluate(() => [...document.querySelectorAll('#btnAgBuscar,#btnAgMes,#btnAgendaLembretes,#btnAgInfo,#btnPrevWeekMobile,#btnNextWeekMobile,#btnAgData,#btnAgendaToday,#btnAgProfs,.day-pill,#agFiltroProfs .chip')]
  .filter(e => e.offsetParent).map(e => [e.id || e.className.split(' ')[0], Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)])
  .filter(([, w, h]) => w < 44 || h < 44));

(async () => {
  const adm = await login('admin@dev.local');
  const cat = (await (await fetch(`${API}/api/catalog`, { headers: adm })).json()).data;
  const cli = cat.clientes[0];
  const mk = async body => (await (await fetch(`${API}/api/agenda`, { method: 'POST', headers: adm, body: JSON.stringify({ clienteId: cli.id, aceitarAvisos: true, foraDaDisponibilidade: true, permitirConflito: true, data: amanha, ...body }) })).json()).data;
  const a1 = await mk({ servicoId: BARBA, profissionalId: ANA, horario: '09:00' });
  const a2 = await mk({ servicoId: CORTE, profissionalId: BRUNO, horario: '10:00' });
  const a3 = await mk({ servicoId: CORTE, profissionalId: ANA, horario: '13:00' });
  await fetch(`${API}/api/agenda/${a3.id}/status`, { method: 'PATCH', headers: adm, body: JSON.stringify({ novoStatus: 'cancelado' }) });
  console.log('HORÁRIOS DE AMANHÃ (2 ativos + 1 cancelado):', Boolean(a1 && a2 && a3));

  const b = await chromium.launch();
  const r = await entrar(b, 'recepcao@dev.local');

  // 1) Layout.
  const lay = await r.evaluate(() => ({ topo: Math.round(document.getElementById('timelineContainer').getBoundingClientRect().top), larg: document.documentElement.scrollWidth, conta: Boolean(document.getElementById('btnLogout').offsetParent) }));
  confere('grade começa cedo (≤ 300px) e sem rolagem lateral', lay.topo <= 300 && lay.larg <= 390, JSON.stringify(lay));
  confere('conta e versão fora da agenda', !lay.conta);
  await irParaConta(r);
  confere('conta, versão e Sair em Conta', await r.isVisible('#btnLogout') && /Recepção/.test(await txt(r, '#sessionLabel')));
  await r.click('#btnFecharConta'); await r.waitForSelector('#sheetConta', { state: 'hidden' }); await r.waitForTimeout(300);

  // 2) Controles honestos.
  confere('setas dizem que mudam a semana', await r.getAttribute('#btnPrevWeekMobile', 'aria-label') === 'Semana anterior' && await r.getAttribute('#btnNextWeekMobile', 'aria-label') === 'Próxima semana');
  confere('nenhum ícone decorativo fingindo ser botão', await r.locator('.agenda-surface [aria-hidden="true"].agenda-actions, .agenda-surface .agenda-icon').count() === 0);
  const peq = await pequenos(r);
  confere('alvos de toque ≥ 44px no cabeçalho', !peq.length, JSON.stringify(peq));

  // 3) Mesmo escopo (todos).
  await irPara(r, amanha);
  let l = await leitura(r);
  confere('todos: dia, ponto do dia, colunas e blocos batem (cancelado fora)', l.totalDia === 2 && l.pilula === 2 && l.somaColunas === 2 && l.blocos === 2, JSON.stringify(l));
  confere('total da semana diz o escopo', /de todos os profissionais/.test(l.semana), l.semana);

  // 4) Só o Bruno.
  await r.click('#btnAgProfs'); await r.waitForSelector('#agFiltroProfs:not(.hidden)');
  await r.click(`#agFiltroProfs [data-agf="${BRUNO}"]`); await r.waitForTimeout(400);
  l = await leitura(r);
  confere('filtro Bruno: grade, dia, ponto e semana no mesmo escopo', JSON.stringify(l.colunas) === JSON.stringify([BRUNO]) && l.totalDia === 1 && l.pilula === 1 && l.blocos === 1 && /de 1 profissional/.test(l.semana), JSON.stringify(l));
  confere('resumo diz quantos estão selecionados', await txt(r, '#agProfsResumo') === '1 selecionado');
  await r.click(`#agFiltroProfs [data-agf="${ANA}"]`); await r.waitForTimeout(400);
  confere('todos marcados um a um = "Todos"', /^Todos \(\d+\)$/.test(await txt(r, '#agProfsResumo')) && (await leitura(r)).totalDia === 2);

  // 5) Painéis um por vez; busca.
  await r.click('#btnAgInfo');
  confere('informações: legenda, total e lista de espera num painel', await r.isVisible('#agInfo') && await r.isVisible('#agLegenda') && await r.isVisible('#btnAbrirListaEspera') && await r.isHidden('#agFiltroProfs'));
  await r.click('#btnAgBuscar');
  confere('abrir a busca fecha as informações', await r.isVisible('#agBusca') && await r.isHidden('#agInfo'));
  await r.fill('#agBuscaTermo', cli.nome.slice(0, 5));
  await r.waitForTimeout(300);
  confere('busca diz o escopo (semana)', /Busca nos agendamentos da semana/.test(await txt(r, '#agBuscaEscopo')));
  const achados = await r.locator('#agBuscaResultado [data-agb-id]').count();
  confere('busca acha os 2 ativos de amanhã (não o cancelado)', achados >= 2 && await r.locator(`#agBuscaResultado [data-agb-id="${a3.id}"]`).count() === 0, String(achados));
  await r.click(`#agBuscaResultado [data-agb-id="${a2.id}"]`);
  await r.waitForSelector('#actionSheet:not(.hidden) .agc-campos');
  confere('resultado abre o card certo e fecha a busca', /10:00/.test(await txt(r, '#actionSheetContent')) && await r.isHidden('#agBusca'));
  await r.keyboard.press('Escape'); await r.waitForTimeout(300);

  // 6) Data abre o mês; Hoje volta.
  await r.click('#btnAgData');
  await r.waitForSelector('#agMes:not(.hidden) [data-agm-dia]', { timeout: 8000 }).catch(() => {});
  confere('tocar na data abre o calendário do mês', await r.isVisible('#agMes [data-agm-dia]') && await r.getAttribute('#btnAgData', 'aria-expanded') === 'true');
  await r.click('#btnAgData');
  await r.click('#btnAgendaToday'); await r.waitForTimeout(900);
  confere('"Hoje" volta para hoje e fica marcado', await r.locator(`.day-pill.selected[data-day="${hoje}"]`).count() === 1 && /agx-hoje-ativo/.test(await r.getAttribute('#btnAgendaToday', 'class')));

  // 7) Horário livre leva data e profissional.
  await irPara(r, amanha);
  const hora = await r.evaluate(ana => ([...document.querySelectorAll(`.slot-vazio:not(.fora)[data-prof="${ana}"]`)].map(e => e.dataset.time).find(t => t >= '11:00') || null), ANA);
  if (hora) {
    await r.locator(`.slot-vazio[data-prof="${ANA}"][data-time="${hora}"]`).click(); await r.waitForTimeout(400);
    if (await r.isVisible('#btnSlotAgendar')) await r.click('#btnSlotAgendar');
    await r.waitForSelector('#modalNovoAgendamento:not(.hidden)');
    confere('horário livre abre o agendar com a data e a hora tocadas', await r.inputValue('#agData') === amanha && await r.inputValue('#agHorario') === hora, hora);
    await r.click('#btnCancelarNovoAgendamento');
  } else { console.log('HORÁRIO LIVRE: nenhum horário livre da Ana depois das 11:00'); falhas.push('sem horário livre para testar'); }
  console.log('RECEPÇÃO erros:', JSON.stringify(r.erros)); falhas.push(...r.erros);

  // 8) Profissional: só a própria coluna.
  const p = await entrar(b, 'profissional@dev.local');
  await irPara(p, amanha);
  const lp = await leitura(p);
  confere('profissional vê só a própria coluna e o total só dele', JSON.stringify(lp.colunas) === JSON.stringify([ANA]) && lp.totalDia === 1 && lp.blocos === 1, JSON.stringify(lp));
  confere('seletor de profissionais travado em "só você"', await txt(p, '#agProfsResumo') === 'só você' && await p.isDisabled('#btnAgProfs'));
  console.log('PROFISSIONAL erros:', JSON.stringify(p.erros)); falhas.push(...p.erros);

  // 9) Desktop.
  const d = await entrar(b, 'admin@dev.local', { width: 1366, height: 900 });
  const ld = await d.evaluate(() => ({ larg: document.documentElement.scrollWidth, grade: Math.round(document.getElementById('timelineContainer').getBoundingClientRect().height) }));
  confere('desktop: sem rolagem lateral e grade com altura útil', ld.larg <= 1366 && ld.grade >= 400, JSON.stringify(ld));
  falhas.push(...d.erros);

  const viol = [...await r.evaluate(() => window.__csp), ...await p.evaluate(() => window.__csp), ...await d.evaluate(() => window.__csp)];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(viol)); falhas.push(...viol);
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
