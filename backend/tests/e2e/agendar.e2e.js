// E2E (Playwright/Chromium): cliente agenda pelo link público (agendar.html, sem
// login) e a recepção vê o horário na agenda (Lembretes de amanhã) e confirma.
// Requer: DEV_PUBLIC_SLUG=salao-dev node backend/scripts/dev-memory-api.js + PWA em :5599
// servida por backend/tests/e2e/static-server.py (headers/CSP do render.yaml).
// Uso: DEV_PUBLIC_SLUG=salao-dev NODE_PATH=$(npm root -g) node backend/tests/e2e/agendar.e2e.js
const { chromium } = require('playwright');
const SLUG = process.env.DEV_PUBLIC_SLUG || 'salao-dev';
const API = 'http://127.0.0.1:3399';
const PUBLICO = `http://127.0.0.1:5599/agendar.html?apiBase=${API}/api&s=`;
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
  const terceiros = []; let fasePublica = true;
  p.on('request', r => { const u = new URL(r.url()); if (fasePublica && u.hostname !== '127.0.0.1') terceiros.push(u.hostname); });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text());
  });

  // 1) Link de salão inexistente: tela neutra de indisponível.
  await p.goto(PUBLICO + 'salao-que-nao-existe');
  await p.waitForSelector('#indisponivel:not([hidden])', { timeout: 10000 });
  console.log('SLUG DESCONHECIDO:', (await p.textContent('#indisponivel h2')).trim());

  // 2) Fluxo do cliente: serviço → profissional → dia → horário → dados.
  await p.goto(PUBLICO + SLUG);
  await p.waitForSelector('#fluxo:not([hidden])', { timeout: 10000 });
  console.log('SALÃO:', await p.textContent('#nomeSalao'), '| serviços:', JSON.stringify(await p.locator('#listaServicos .opcao').allInnerTexts()));
  await p.locator('#listaServicos .opcao', { hasText: 'Barba' }).click();
  await p.locator('#listaProfissionais .opcao', { hasText: 'Ana' }).click();
  await p.click(`#listaDias [data-dia="${amanha}"]`);
  await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
  const horarios = await p.locator('#listaHorarios .horario').allInnerTexts();
  console.log('HORÁRIOS amanhã:', horarios.join(' '));
  const escolhido = horarios[0];
  await p.click(`#listaHorarios [data-horario="${escolhido}"]`);
  await p.fill('#nome', 'Paula Online');
  await p.fill('#whatsapp', '(11) 97777-1234');
  await p.click('#btnAgendar'); // sem marcar o aviso de privacidade
  const semConsentimento = (await p.textContent('#aviso')).trim();
  console.log('SEM CONSENTIMENTO:', semConsentimento);
  if (!/aviso de privacidade/i.test(semConsentimento)) errs.push('consentimento não foi exigido');
  await p.check('#consentimento');
  await p.click('#btnAgendar');
  await p.waitForSelector('#secConfirmacao:not([hidden])', { timeout: 10000 });
  console.log('CONFIRMAÇÃO:', (await p.textContent('#confirmacaoTexto')).trim());
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-agendar.png'), fullPage: true });

  const cliente = (await db('clientes')).find(c => c.nome === 'Paula Online');
  const ag = (await db('agendamentos')).find(a => cliente && a.cliente_id === cliente.id);
  const ev = (await db('agendamento_eventos')).find(e => ag && e.agendamento_id === ag.id);
  console.log('BANCO:', JSON.stringify({ whatsapp: cliente && cliente.whatsapp, data: ag && ag.data, horario: ag && ag.horario, status: ag && ag.status, created_by: ag && ag.created_by, evento: ev && ev.tipo, ip: ev && ev.payload.ip_truncado }));
  if (!ag || ag.status !== 'agendado' || ag.data !== amanha || ag.horario !== escolhido || ag.created_by !== null) errs.push('agendamento não gravado como esperado');
  if (!ev || ev.tipo !== 'origem_link_publico') errs.push('evento de origem ausente');

  // 3) O mesmo horário some da lista para o próximo cliente.
  await p.click('#btnNovo');
  await p.locator('#listaServicos .opcao', { hasText: 'Barba' }).click();
  await p.locator('#listaProfissionais .opcao', { hasText: 'Ana' }).click();
  await p.click(`#listaDias [data-dia="${amanha}"]`);
  await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
  const depois = await p.locator('#listaHorarios .horario').allInnerTexts();
  console.log('HORÁRIO OCUPADO SAIU DA LISTA:', !depois.includes(escolhido));
  if (depois.includes(escolhido)) errs.push('horário ocupado ainda oferecido');
  const violacoesPublico = await p.evaluate(() => window.__csp);
  fasePublica = false;

  // 4) Recepção: login no app interno, Agenda → Lembretes (amanhã) mostra a cliente; confirma.
  await p.goto(APP);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#btnAgendaLembretes'); await p.waitForTimeout(900);
  const linha = p.locator('#lembretesConteudo .eq-row', { hasText: 'Paula' });
  const naLista = await linha.count();
  console.log('RECEPÇÃO VÊ NOS LEMBRETES:', naLista, '|', naLista ? (await linha.first().innerText()).replace(/\s+/g, ' ').trim().slice(0, 90) : '-');
  if (!naLista) errs.push('recepção não vê o agendamento online');
  else {
    await linha.locator('[data-confirmar]').click(); await p.waitForTimeout(900);
    const st = (await db('agendamentos')).find(a => a.id === ag.id).status;
    console.log('RECEPÇÃO CONFIRMOU:', st);
    if (st !== 'confirmado') errs.push('confirmação da recepção não gravou');
  }

  const violacoes = [...violacoesPublico, ...await p.evaluate(() => window.__csp), ...csp];
  console.log('TERCEIROS requisitados pela página pública:', JSON.stringify([...new Set(terceiros)]));
  if (terceiros.length) errs.push('página pública chamou terceiros');
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
