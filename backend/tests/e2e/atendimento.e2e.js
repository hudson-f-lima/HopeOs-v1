// E2E (Playwright/Chromium): atendimento com vários serviços (D-040). A recepção escolhe Corte com
// o Bruno, adiciona Barba ("qualquer profissional"), vê as combinações calculadas pelo servidor,
// escolhe a sequência sem espera (Bruno → Ana) e grava as duas etapas de uma vez. No card: vê as
// etapas, cancela só uma (com o impacto mostrado antes) e depois todas.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();

(async () => {
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
  });
  const p = await ctx.newPage();
  const errs = []; const csp = []; const dialogos = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.text().includes('Content Security Policy')) csp.push(m.text());
    else if (m.type() === 'error' && !m.text().includes('Failed to load') && !['400', '401', '403', '404', '409'].some(c => m.text().includes(c))) errs.push(m.text());
  });
  p.on('dialog', d => { dialogos.push(d.message()); d.accept(); });

  await p.goto(APP);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);

  // 1) Novo agendamento com dois serviços.
  await p.click('#fab'); await p.waitForSelector('#modalNovoAgendamento:not(.hidden)');
  await p.click('#agCliente'); await p.fill('#agCliente', 'Cliente'); await p.waitForTimeout(300);
  await p.locator('#agCliente ~ div [data-value]').first().click();
  await p.click('#agServico'); await p.fill('#agServico', 'Corte'); await p.waitForTimeout(300);
  await p.locator('#agServico ~ div [data-value]').first().click();
  await p.click('#agProfissional'); await p.fill('#agProfissional', 'Bruno'); await p.waitForTimeout(300);
  await p.locator('#agProfissional ~ div [data-value]').first().click();
  await p.fill('#agData', amanha);
  await p.fill('#agHorario', '09:00');
  await p.click('#btnAgAddServico');
  const barba = (await db('servicos')).find(s => s.nome === 'Barba');
  await p.selectOption('[data-extra-servico="0"]', barba.id);
  await p.click('#btnConfirmarNovoAgendamento');
  await p.waitForSelector('#atendimentoOpcoes .at-opcao', { timeout: 10000 });
  const lista = (await p.locator('#atendimentoOpcoes .at-opcao').allInnerTexts()).map(limpo);
  console.log('RESUMO:', limpo(await p.textContent('#atendimentoResumo')));
  console.log('OPÇÕES:', lista.length, '| 1ª:', lista[0]);
  const primeira = lista[0] || '';
  if (!primeira.includes('09:00–10:30') || !primeira.includes('Corte com Bruno') || !primeira.includes('Barba com Ana') || !primeira.includes('sem espera')) errs.push('1ª opção não é a sequência sem espera Bruno → Ana');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-atendimento-opcoes.png') });
  await p.locator('#atendimentoOpcoes .at-opcao').first().click();
  await p.waitForFunction(() => !document.getElementById('atendimentoDialog').open, null, { timeout: 8000 });
  console.log('CONFIRMAÇÃO:', limpo(dialogos[0]));
  const ags = (await db('agendamentos')).filter(a => a.grupo_id && a.data === amanha).sort((x, y) => x.grupo_seq - y.grupo_seq);
  console.log('BANCO:', JSON.stringify(ags.map(a => `${a.grupo_seq}:${String(a.horario).slice(0, 5)} ${a.duracao_min}min R$${a.valor_centavos / 100}`)));
  if (ags.length !== 2 || ags[0].grupo_id !== ags[1].grupo_id) errs.push('as duas etapas não foram gravadas no mesmo atendimento');
  if (await p.isVisible('#modalNovoAgendamento:not(.hidden)')) errs.push('modal não fechou depois de gravar');

  // 2) Card da 2ª etapa: ver etapas, cancelar só esta (impacto antes), depois todas.
  for (let i = 0; i < 2; i++) {
    const dia = p.locator(`[data-day="${amanha}"]`);
    if (await dia.count()) { await dia.first().click(); await p.waitForTimeout(600); break; }
    await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800);
  }
  await p.locator(`[data-agenda-id="${ags[1].id}"], [data-id="${ags[1].id}"]`).first().click(); await p.waitForTimeout(600);
  await p.click('[data-sheet-action="atendimento-etapas"]');
  await p.waitForSelector('#etapasConteudo .at-etapas li');
  console.log('ETAPAS:', JSON.stringify((await p.locator('#etapasConteudo .at-etapas li').allInnerTexts()).map(limpo)));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-atendimento-etapas.png') });
  await p.click('#btnEtapaCancelarEsta'); await p.waitForTimeout(1200);
  const impacto = limpo(dialogos[dialogos.length - 1]);
  console.log('IMPACTO:', impacto);
  const iCanc = impacto.indexOf('Serão canceladas:'); const iMant = impacto.indexOf('Continuam marcadas:');
  if (iCanc < 0 || iMant < 0 || !impacto.slice(iCanc, iMant).includes('Barba') || !impacto.slice(iMant).includes('Corte')) errs.push('impacto do cancelamento não informado');
  let st = (await db('agendamentos')).filter(a => a.grupo_id === ags[0].grupo_id).sort((x, y) => x.grupo_seq - y.grupo_seq).map(a => a.status);
  console.log('APÓS CANCELAR A ETAPA:', JSON.stringify(st));
  if (st.join() !== 'agendado,cancelado') errs.push('cancelar só a etapa não funcionou');
  await p.click('#btnEtapaCancelarTodas'); await p.waitForTimeout(1200);
  st = (await db('agendamentos')).filter(a => a.grupo_id === ags[0].grupo_id).map(a => a.status);
  console.log('APÓS CANCELAR TODAS:', JSON.stringify(st));
  if (st.some(s => s !== 'cancelado')) errs.push('cancelar todas não funcionou');

  const violacoes = [...await p.evaluate(() => window.__csp), ...csp];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
