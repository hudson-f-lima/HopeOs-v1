// E2E (Playwright/Chromium): série recorrente pela recepção (C4, D-039). Novo agendamento com
// "Repetir: toda semana, 4 vezes": a prévia aparece (confirmação do navegador) e a série é
// gravada. No card de um horário da série: "Alterar na série" (este e os próximos) e depois
// "Cancelar na série" (todos). O profissional não vê a opção de repetir.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();

(async () => {
  const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const amanha = fuso(new Date(Date.now() + 864e5));
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
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text());
  });
  p.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
  const login = async (pg, email) => {
    await pg.goto(APP);
    await pg.waitForSelector('#loginScreen:not(.hidden)');
    await pg.fill('#loginEmail', email); await pg.fill('#loginSenha', 'dev12345'); await pg.click('#btnLogin');
    await pg.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await pg.waitForTimeout(800);
  };

  // 1) Recepção cria a série pela tela.
  await login(p, 'recepcao@dev.local');
  await p.click('#fab'); await p.waitForSelector('#modalNovoAgendamento:not(.hidden)');
  console.log('REPETIR VISÍVEL (recepção):', await p.isVisible('#agRepetirBox'));
  if (!await p.isVisible('#agRepetirBox')) errs.push('recepção não vê "Repetir"');
  await p.click('#agCliente'); await p.fill('#agCliente', 'Cliente'); await p.waitForTimeout(300);
  await p.locator('#agCliente ~ div [data-value]').first().click();
  await p.click('#agServico'); await p.fill('#agServico', 'Barba'); await p.waitForTimeout(300);
  await p.locator('#agServico ~ div [data-value]').first().click();
  await p.click('#agProfissional'); await p.fill('#agProfissional', 'Ana'); await p.waitForTimeout(300);
  await p.locator('#agProfissional ~ div [data-value]').first().click();
  await p.fill('#agData', amanha);
  await p.fill('#agHorario', '09:30');
  await p.selectOption('#agRepetir', 'semanal');
  await p.fill('#agOcorrencias', '4');
  await p.click('#btnConfirmarNovoAgendamento');
  await p.waitForTimeout(1500);
  console.log('PRÉVIA:', (dialogos[0] || '(sem prévia)').replace(/\s+/g, ' '));
  if (!/4 horários toda semana/.test(dialogos[0] || '')) errs.push('prévia não apareceu');
  const series = await db('agendamento_series');
  const serie = series[series.length - 1];
  const ocorr = (await db('agendamentos')).filter(a => serie && a.serie_id === serie.id).sort((x, y) => x.serie_seq - y.serie_seq);
  console.log('SÉRIE:', serie && serie.frequencia, '|', JSON.stringify(ocorr.map(a => `${a.serie_seq}:${a.data} ${String(a.horario).slice(0, 5)}`)));
  if (!serie || ocorr.length !== 4) errs.push('série não gravada com 4 horários');

  // 2) Card do 1º horário: "Alterar na série" → este e os próximos → 11:00.
  const primeiro = ocorr[0];
  const abrirCard = async id => {
    for (let i = 0; i < 2; i++) {
      const dia = p.locator(`[data-day="${primeiro.data}"]`);
      if (await dia.count()) { await dia.first().click(); await p.waitForTimeout(600); break; }
      await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800);
    }
    await p.locator(`[data-agenda-id="${id}"], [data-id="${id}"]`).first().click(); await p.waitForTimeout(600);
  };
  await abrirCard(primeiro.id);
  const acoes = (await p.locator('#actionSheetContent [data-sheet-action]').allTextContents()).map(t => t.trim());
  console.log('CARD:', JSON.stringify(acoes));
  if (!acoes.includes('Alterar na série…') || !acoes.includes('Cancelar na série…')) errs.push('ações da série ausentes no card');
  if (!acoes.some(t => /Série recorrente \(1ª\)/.test(t))) errs.push('card não mostra o aviso da série (1ª)');
  // "Ver datas": lista as 4 datas previstas com a situação de cada uma.
  await p.click('[data-sheet-action="serie-ver"]');
  await p.waitForSelector('#serieVerDialog[open]');
  await p.waitForFunction(() => document.querySelectorAll('#serieVerConteudo li').length === 4, null, { timeout: 8000 });
  const datasVistas = await p.locator('#serieVerConteudo li').allTextContents();
  console.log('VER SÉRIE:', JSON.stringify(datasVistas.map(t => t.replace(/\s+/g, ' ').trim())));
  if (!datasVistas.some(t => /← este/.test(t))) errs.push('"Ver datas" não marca o horário aberto');
  if (datasVistas.filter(t => /agendada/.test(t)).length !== 4) errs.push('"Ver datas" não mostra as 4 agendadas');
  await p.click('#btnSerieVerFechar');
  await abrirCard(primeiro.id);
  await p.click('[data-sheet-action="serie-alterar"]');
  await p.waitForSelector('#serieDialog[open]');
  await p.check('input[name="serieEscopo"][value="proximos"]');
  await p.fill('#serieHorario', '11:00');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-c4-serie.png') });
  await p.click('#btnSerieConfirmar');
  await p.waitForFunction(() => !document.getElementById('serieDialog').open, null, { timeout: 8000 });
  const depois = (await db('agendamentos')).filter(a => a.serie_id === serie.id && a.status === 'agendado').sort((x, y) => x.serie_seq - y.serie_seq);
  console.log('ALTERADA:', JSON.stringify(depois.map(a => `${a.serie_seq}:${String(a.horario).slice(0, 5)}`)));
  if (depois.length !== 4 || depois.some(a => !String(a.horario).startsWith('11:00'))) errs.push('alteração "este e os próximos" não aplicada');

  // 3) Cancelar todos.
  const novoPrimeiro = depois[0];
  await abrirCard(novoPrimeiro.id);
  await p.click('[data-sheet-action="serie-cancelar"]');
  await p.waitForSelector('#serieDialog[open]');
  await p.check('input[name="serieEscopo"][value="todos"]');
  await p.click('#btnSerieConfirmar');
  await p.waitForFunction(() => !document.getElementById('serieDialog').open, null, { timeout: 8000 });
  const fim = (await db('agendamentos')).filter(a => a.serie_id === serie.id);
  const serieFim = (await db('agendamento_series')).find(s => s.id === serie.id);
  console.log('CANCELADA:', JSON.stringify(fim.map(a => a.status).sort()), '| série:', serieFim.status);
  if (fim.some(a => ['agendado', 'confirmado'].includes(a.status)) || serieFim.status !== 'encerrada') errs.push('cancelar "todos" não encerrou a série');

  // 4) Profissional não vê "Repetir".
  const prof = await ctx.browser().newContext({ viewport: { width: 390, height: 844 } });
  const pp = await prof.newPage();
  await login(pp, 'profissional@dev.local');
  await pp.click('#fab'); await pp.waitForTimeout(500);
  const vePro = await pp.isVisible('#agRepetirBox');
  console.log('REPETIR VISÍVEL (profissional):', vePro);
  if (vePro) errs.push('profissional vê "Repetir"');

  const violacoes = [...await p.evaluate(() => window.__csp), ...csp];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
