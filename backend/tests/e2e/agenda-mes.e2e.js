// E2E (Playwright/Chromium) do calendário do mês e da gestão de escalas pela agenda (D-050), sob a
// CSP de produção.
//   1) Mês: dia fechado (✕), horário especial (★) e conflito (⚠, agendamento fora da escala)
//      com rótulo para leitor de tela, não só cor;
//   2) tocar no dia leva a agenda para ele; o agendamento em conflito aparece marcado na grade;
//   3) filtro de vários profissionais: só as colunas escolhidas;
//   4) "Escolher datas": duas datas não consecutivas → lote com prévia → ausência só nelas.
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
const amanha = fuso(new Date(Date.now() + 864e5));
const proxMes = (() => { const [a, m] = amanha.split('-').map(Number); return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7); })();
const dia = n => `${proxMes}-${String(n).padStart(2, '0')}`;

async function login(email) {
  const s = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'dev12345' }) })).json();
  return { 'content-type': 'application/json', authorization: `Bearer ${s.data.access_token || s.data.session.access_token}` };
}
// raiz: '#agMes' (agenda, navegação) ou '#escCal' (Escalas, gestão).
const celula = (p, d, raiz = '#agMes') => p.locator(`${raiz} [data-agm-dia="${d}"]`);
async function mostrarMes(p, mes, raiz = '#agMes') {
  for (let i = 0; i < 4; i++) {
    if (await p.locator(`${raiz} [data-agm-dia^="${mes}-"]`).count()) return;
    await p.click(`${raiz} [data-cal="${mes > (await p.locator(`${raiz} [data-agm-dia]`).first().getAttribute('data-agm-dia')).slice(0, 7) ? 'prox' : 'ant'}"]`); await p.waitForTimeout(500);
  }
}

(async () => {
  const adm = await login('admin@dev.local');
  const post = (url, body) => fetch(`${API}/api${url}`, { method: 'POST', headers: adm, body: JSON.stringify(body) }).then(r => r.json());
  const cat = (await (await fetch(`${API}/api/catalog`, { headers: adm })).json()).data;
  // Unidade fechada no dia 5 e com horário especial no dia 6 do mês que vem; conflito amanhã.
  console.log('FECHAMENTO:', (await post('/disponibilidade/excecoes', { tipo: 'fechamento', dataInicio: dia(5), dataFim: dia(5), motivo: 'Feriado' })).ok);
  console.log('ESPECIAL:', (await post('/disponibilidade/excecoes', { tipo: 'horario', dataInicio: dia(6), dataFim: dia(6), periodos: [{ inicio: '10:00', fim: '14:00' }], motivo: 'Inventário' })).ok);
  const fora = await post('/agenda', { clienteId: cat.clientes[0].id, servicoId: CORTE, profissionalId: ANA, data: amanha, horario: '19:00', foraDaDisponibilidade: true, permitirConflito: true, aceitarAvisos: true });
  console.log('AGENDAMENTO FORA DA ESCALA:', fora.ok);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'admin@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#navAgenda'); await p.waitForTimeout(400);

  // 1) Mês com estados acessíveis.
  await p.click('#btnAgMes'); await p.waitForSelector('#agMes:not(.hidden) [data-agm-dia]');
  confere('botão do mês expande o painel', await p.getAttribute('#btnAgMes', 'aria-expanded') === 'true');
  await mostrarMes(p, amanha.slice(0, 7));
  const rotAmanha = await celula(p, amanha).getAttribute('aria-label');
  confere('conflito do dia com ⚠ e rótulo "conflito"', /1 conflito/.test(rotAmanha) && (await celula(p, amanha).innerText()).includes('⚠1'), rotAmanha);
  await mostrarMes(p, proxMes);
  const r5 = await celula(p, dia(5)).getAttribute('aria-label'); const r6 = await celula(p, dia(6)).getAttribute('aria-label');
  confere('dia fechado: ✕ e "fechado, Feriado"', (await celula(p, dia(5)).innerText()).includes('✕') && /fechado, .*Feriado/.test(r5), r5);
  confere('dia especial: ★ e "horário especial, Inventário"', (await celula(p, dia(6)).innerText()).includes('★') && /horário especial.*Inventário/.test(r6), r6);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-agenda-mes.png') });

  // 2) Tocar no dia leva a agenda; conflito marcado na grade.
  await mostrarMes(p, amanha.slice(0, 7));
  await celula(p, amanha).click(); await p.waitForTimeout(1200);
  const bloco = p.locator(`[data-id="${fora.data.id}"]`);
  confere('dia escolhido no mês abre na agenda', await p.locator(`.day-pill.selected[data-day="${amanha}"]`).count() === 1);
  await bloco.first().waitFor({ timeout: 8000 }).catch(() => {});
  confere('agendamento em conflito marcado na grade (⚠ fora da escala)', await bloco.count() === 1 && /⚠ fora da escala/.test(await bloco.first().innerText()) && /ag-conflito/.test(await bloco.first().getAttribute('class')));
  confere('na agenda o calendário só navega (sem escolher datas)', await p.locator('#agMes [data-cal="escolher"]').count() === 0);

  // 3) Filtro de vários profissionais.
  await p.click(`#agFiltroProfs [data-agf="${BRUNO}"]`); await p.waitForTimeout(400);
  const cols = await p.$$eval('.agenda-grid-col', cs => cs.map(c => c.dataset.profId));
  confere('filtro: só a coluna do Bruno', JSON.stringify(cols) === JSON.stringify([BRUNO]), JSON.stringify(cols));
  await p.click(`#agFiltroProfs [data-agf="${ANA}"]`); await p.waitForTimeout(400);
  confere('filtro com dois: Ana e Bruno', (await p.$$eval('.agenda-grid-col', cs => cs.length)) === 2);
  await p.click('#agFiltroProfs [data-agf=""]'); await p.waitForTimeout(300);

  // 4) Escalas (bento): tocar no dia abre a data especial já na data; datas avulsas → lote.
  await p.click('#navAvatar'); await p.waitForSelector('#sheetGestao:not(.hidden)');
  await p.click('#subtabBtnEscalas'); await p.waitForSelector('#escCal [data-agm-dia]', { timeout: 8000 });
  confere('Escalas em blocos com calendário, semana em pontos e pendências', await p.locator('#escConteudo .bento .bento-tile').count() >= 5 && await p.locator('#escConteudo .esc-semana .esc-d.on').count() > 0);
  await mostrarMes(p, proxMes, '#escCal');
  await celula(p, dia(15), '#escCal').click();
  await p.waitForSelector('#modalEscExcecao:not(.hidden)');
  confere('tocar no dia abre "Nova data especial" já na data', await p.inputValue('#escExcDe') === dia(15) && await p.inputValue('#escExcAte') === dia(15));
  await p.click('#btnEscExcCancelar');
  await p.click('#escCal [data-cal="escolher"]');
  await celula(p, dia(10), '#escCal').click(); await celula(p, dia(12), '#escCal').click();
  confere('duas datas marcadas (aria-pressed)', await celula(p, dia(10), '#escCal').getAttribute('aria-pressed') === 'true' && /2 data/.test(await p.textContent('#escCal .agm-escolha-txt')));
  await p.click('#escCal [data-cal="aplicar"]');
  await p.waitForSelector('#modalEscLote:not(.hidden)');
  const datasTxt = await p.textContent('#escLoteDatasAvulsas');
  confere('lote mostra as datas escolhidas e esconde De/Até', /10\/.*12\//.test(datasTxt) && await p.isHidden('#escLoteDatasBox'), datasTxt);
  await p.check(`#escLoteAlvos input[data-lote-alvo="${ANA}"]`);
  await p.selectOption('#escLoteAcao', 'ausencia');
  await p.fill('#escLoteMotivo', 'Congresso');
  await p.click('#btnEscLotePrevia'); await p.waitForSelector('#btnEscLoteAplicar:not([disabled])', { timeout: 8000 });
  const previa = (await p.textContent('#escLotePrevia')).replace(/\s+/g, ' ');
  confere('prévia diz "em 2 data(s)" antes de aplicar', /em 2 data\(s\)/.test(previa), previa.slice(0, 160));
  await p.click('#btnEscLoteAplicar'); await p.waitForSelector('#modalEscLote', { state: 'hidden', timeout: 8000 });
  await p.waitForTimeout(600);
  const aus = (await db('disponibilidade_excecoes')).filter(e => e.profissional_id === ANA && e.motivo === 'Congresso').map(e => e.data_inicio).sort();
  confere('ausência criada só no dia 10 e no 12 (o 11 intacto)', JSON.stringify(aus) === JSON.stringify([dia(10), dia(12)]), JSON.stringify(aus));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-escalas-bento.png'), fullPage: true });

  const viol = await p.evaluate(() => window.__csp);
  console.log('VIOLAÇÕES CSP:', JSON.stringify(viol)); falhas.push(...viol);
  console.log('ERROS DA PÁGINA:', JSON.stringify(erros)); falhas.push(...erros);
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
