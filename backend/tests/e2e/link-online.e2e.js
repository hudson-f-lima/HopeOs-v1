// E2E (Playwright/Chromium): o admin liga o link de agendamento do salão em Conta → Link online
// (migration 016, D-037) e o cliente agenda por ele com "sem preferência". Depois o admin
// desliga e o link volta a ser indisponível. Sem PUBLIC_BOOKING_LINKS: tudo vem do banco.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/link-online.e2e.js (API :3399, PWA :5599)
const { chromium } = require('playwright');
const { irParaGestao } = require('./navegacao');
const API = 'http://127.0.0.1:3399';
const SLUG = 'salao-online-e2e';
const PUBLICO = `http://127.0.0.1:5599/agendar.html?apiBase=${API}/api&s=${SLUG}`;
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();

(async () => {
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
  });
  const p = await ctx.newPage();
  const errs = []; const csp = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text());
  });

  // 0) Antes de ligar: o link é indisponível.
  await p.goto(PUBLICO);
  await p.waitForSelector('#indisponivel:not([hidden])', { timeout: 10000 });
  console.log('ANTES DE LIGAR: indisponível');

  // 1) Admin: Conta → Link online. Tentar ligar sem contato de privacidade mostra o que falta.
  await p.goto(APP);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'admin@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await irParaGestao(p);
  await p.click('#subtabBtnOnline'); await p.waitForSelector('#formOnline');
  console.log('PENDÊNCIAS:', (await p.textContent('#onlinePendencias')).trim());
  await p.fill('#onlineSlug', SLUG);
  await p.check('#onlineAtivo');
  await p.click('#btnOnlineSalvar'); await p.waitForTimeout(700);
  const recusa = (await p.textContent('#onlineMsg')).trim();
  console.log('LIGAR SEM REQUISITOS:', recusa);
  if (!/razão social|contato de privacidade/i.test(recusa)) errs.push('ligou sem requisitos ou sem mensagem clara');
  await p.fill('#onlineRazao', 'Salão Dev Serviços Ltda');
  await p.fill('#onlineContato', 'privacidade@salao-dev.test');
  await p.selectOption('#onlineAntecedencia', '0');
  await p.selectOption('#onlineCancelamento', '240');
  await p.check('#onlineAtivo');
  await p.click('#btnOnlineSalvar');
  await p.waitForFunction(() => /LIGADO/.test(document.getElementById('onlineEstado')?.textContent || ''), null, { timeout: 8000 });
  console.log('ESTADO:', (await p.textContent('#onlineEstado')).trim());
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-link-online-config.png'), fullPage: true });
  const emp = (await db('empresas'))[0];
  if (emp.online_slug !== SLUG || emp.online_ativo !== true || emp.online_cancelamento_prazo_min !== 240) errs.push('configuração não gravada');

  // 2) Cliente: aviso com o controlador, faixa de duração por profissional, "sem preferência".
  await p.goto(PUBLICO);
  await p.waitForSelector('#fluxo:not([hidden])', { timeout: 10000 });
  const controlador = `${(await p.textContent('#avisoSalao')).trim()}${(await p.textContent('#avisoCnpj')).trim()} | ${(await p.textContent('#avisoContato')).trim()}`;
  console.log('AVISO:', controlador);
  if (!/Salão Dev Serviços Ltda/.test(controlador) || !/privacidade@salao-dev\.test/.test(controlador)) errs.push('aviso sem o controlador do salão');
  const corte = p.locator('#listaServicos .opcao', { hasText: 'Corte' });
  console.log('SERVIÇO:', (await corte.innerText()).replace(/\s+/g, ' ').trim());
  if (!/45–60 min/.test(await corte.innerText())) errs.push('faixa de duração por profissional ausente');
  await corte.click();
  const profs = await p.locator('#listaProfissionais .opcao').allInnerTexts();
  console.log('PROFISSIONAIS:', JSON.stringify(profs.map(t => t.replace(/\s+/g, ' ').trim())));
  if (!/Sem preferência/.test(profs[0] || '')) errs.push('sem a opção "sem preferência"');
  await p.locator('#listaProfissionais .opcao', { hasText: 'Sem preferência' }).click();
  await p.click(`#listaDias [data-dia="${amanha}"]`);
  await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
  const horarios = await p.locator('#listaHorarios .horario').allInnerTexts();
  console.log('HORÁRIOS (qualquer profissional):', horarios.join(' '));
  const escolhido = horarios[0];
  await p.click(`#listaHorarios [data-horario="${escolhido}"]`);
  console.log('RESUMO:', (await p.textContent('#resumoEscolha')).trim());
  await p.fill('#nome', 'Rita Sem Preferencia');
  await p.fill('#whatsapp', '(11) 96666-4321');
  await p.check('#consentimento');
  await p.click('#btnAgendar');
  await p.waitForSelector('#secConfirmacao:not([hidden])', { timeout: 10000 });
  const conf = `${(await p.textContent('#confirmacaoTexto')).trim()} | ${(await p.textContent('#confirmacaoPrazo')).trim()}`;
  console.log('CONFIRMAÇÃO:', conf);
  if (!/até 4 h antes/.test(conf)) errs.push('prazo de cancelamento do salão não aparece');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-link-online-cliente.png'), fullPage: true });
  const cli = (await db('clientes')).find(c => c.nome === 'Rita Sem Preferencia');
  const ag = (await db('agendamentos')).find(a => cli && a.cliente_id === cli.id);
  const ev = (await db('agendamento_eventos')).find(e => ag && e.agendamento_id === ag.id);
  console.log('BANCO:', JSON.stringify({ profissional: ag && ag.profissional_id, horario: ag && ag.horario, escolhidoPor: ev && ev.payload.profissional_escolhido_por, fonte: ev && ev.payload.fonte_link }));
  if (!ag || ag.data !== amanha || !ag.profissional_id) errs.push('agendamento sem preferência não gravado');
  if (!ev || ev.payload.profissional_escolhido_por !== 'sistema' || ev.payload.fonte_link !== 'banco') errs.push('evento de origem incompleto');
  const violacoesPublico = await p.evaluate(() => window.__csp);

  // 3) Admin desliga: o link volta a ser indisponível na hora.
  await p.goto(APP);
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await irParaGestao(p);
  await p.click('#subtabBtnOnline'); await p.waitForSelector('#formOnline');
  await p.uncheck('#onlineAtivo');
  await p.click('#btnOnlineSalvar');
  await p.waitForFunction(() => /desligado/.test(document.getElementById('onlineEstado')?.textContent || ''), null, { timeout: 8000 });
  await p.goto(PUBLICO);
  await p.waitForSelector('#indisponivel:not([hidden])', { timeout: 10000 });
  console.log('DEPOIS DE DESLIGAR: indisponível');

  const violacoes = [...violacoesPublico, ...await p.evaluate(() => window.__csp), ...csp];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
