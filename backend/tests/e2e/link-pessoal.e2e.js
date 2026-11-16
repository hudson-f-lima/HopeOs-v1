// E2E (Playwright/Chromium): link pessoal do agendamento (C2, D-038). O cliente agenda pelo link
// público, recebe o link pessoal na confirmação, baixa o .ics, abre o link, confirma, remarca e
// cancela; link adulterado mostra a tela neutra. Depois a recepção manda o lembrete pelo WhatsApp
// e a mensagem leva um link pessoal novo.
// Requer: DEV_PUBLIC_SLUG=salao-dev node backend/scripts/dev-memory-api.js + PWA em :5599.
const fs = require('fs');
const { chromium } = require('playwright');
const SLUG = process.env.DEV_PUBLIC_SLUG || 'salao-dev';
const API = 'http://127.0.0.1:3399';
const PUBLICO = `http://127.0.0.1:5599/agendar.html?apiBase=${API}/api&s=${SLUG}`;
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();

(async () => {
  const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const amanha = fuso(new Date(Date.now() + 864e5));
  const depois = fuso(new Date(Date.now() + 2 * 864e5));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
  });
  const p = await ctx.newPage();
  const errs = []; const csp = [];
  const terceiros = [];
  p.on('request', r => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('blob')) terceiros.push(u.hostname); });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text());
  });

  // 1) Cliente agenda e recebe o link pessoal.
  await p.goto(PUBLICO);
  await p.waitForSelector('#fluxo:not([hidden])', { timeout: 10000 });
  await p.locator('#listaServicos .opcao', { hasText: 'Barba' }).click();
  await p.locator('#listaProfissionais .opcao', { hasText: 'Ana' }).click();
  await p.click(`#listaDias [data-dia="${amanha}"]`);
  await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
  const horarios = await p.locator('#listaHorarios .horario').allInnerTexts();
  const escolhido = horarios[0];
  await p.click(`#listaHorarios [data-horario="${escolhido}"]`);
  await p.fill('#nome', 'Lia Link Pessoal');
  await p.fill('#whatsapp', '(11) 95555-2222');
  await p.check('#consentimento');
  await p.click('#btnAgendar');
  await p.waitForSelector('#confirmacaoLink:not([hidden])', { timeout: 10000 });
  const href = await p.getAttribute('#linkPessoal', 'href');
  const google = await p.getAttribute('#linkGoogle', 'href');
  console.log('LINK PESSOAL:', href.replace(/#t=.*/, '#t=<código>'));
  console.log('GOOGLE:', google.slice(0, 80));
  if (!/meu-horario\.html.*#t=[A-Za-z0-9_-]{43}$/.test(href)) errs.push('link pessoal fora do formato');
  if (!/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/.test(google)) errs.push('link do Google Agenda ausente');
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('#btnIcs')]);
  const ics = fs.readFileSync(await download.path(), 'utf8');
  console.log('ICS:', download.suggestedFilename(), '|', ics.split('\r\n').filter(l => /^(DTSTART|SUMMARY|TRIGGER)/.test(l)).join(' | '));
  if (!/BEGIN:VEVENT/.test(ics) || !/TRIGGER:-P1D/.test(ics) || !/TRIGGER:-PT2H/.test(ics) || !/meu-horario\.html/.test(ics.replace(/\r\n /g, ''))) errs.push('.ics incompleto');
  const token = href.split('#t=')[1];
  if ((JSON.stringify(await db('agendamento_acessos'))).includes(token)) errs.push('código em claro no banco');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-c2-confirmacao.png'), fullPage: true });

  // 2) Abre o link: vê o horário, confirma presença.
  await p.goto(href);
  await p.waitForSelector('#secHorario:not([hidden])', { timeout: 10000 });
  console.log('MEU HORÁRIO:', (await p.textContent('#status')).trim(), '|', (await p.textContent('#quando')).trim(), '|', (await p.textContent('#oque')).trim());
  await p.click('#btnConfirmar');
  await p.waitForFunction(() => document.getElementById('status').textContent === 'Confirmado', null, { timeout: 8000 });
  console.log('CONFIRMOU:', (await p.textContent('#status')).trim());

  // 3) Remarca para outro dia.
  await p.click('#btnRemarcar');
  await p.waitForSelector('#secRemarcar:not([hidden])');
  await p.click(`#listaDias [data-dia="${depois}"]`);
  await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
  const novoHorario = (await p.locator('#listaHorarios .horario').allInnerTexts())[0];
  await p.click(`#listaHorarios [data-horario="${novoHorario}"]`);
  await p.click('#btnConfirmarRemarcacao');
  await p.waitForFunction(h => document.getElementById('quando').textContent.includes(h) && !document.getElementById('secHorario').hidden, novoHorario, { timeout: 8000 });
  console.log('REMARCOU PARA:', (await p.textContent('#quando')).trim(), '|', (await p.textContent('#aviso')).trim());
  const ags = await db('agendamentos');
  const cliente = (await db('clientes')).find(c => c.nome === 'Lia Link Pessoal');
  const doCliente = ags.filter(a => a.cliente_id === cliente.id);
  console.log('BANCO:', JSON.stringify(doCliente.map(a => `${a.data} ${String(a.horario).slice(0, 5)} ${a.status}`)));
  if (!doCliente.some(a => a.status === 'reagendado') || !doCliente.some(a => a.data === depois && a.status === 'agendado')) errs.push('remarcação não gravada');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-c2-meu-horario.png'), fullPage: true });

  // 4) Cancela (com confirmação do navegador).
  p.once('dialog', d => d.accept());
  await p.click('#btnCancelar');
  await p.waitForFunction(() => document.getElementById('status').textContent === 'Cancelado', null, { timeout: 8000 });
  console.log('CANCELOU:', (await p.textContent('#status')).trim(), '| botões visíveis:', await p.locator('#secHorario .acoes button:not([hidden])').count());
  if (await p.locator('#secHorario .acoes button:not([hidden])').count() !== 0) errs.push('cancelado ainda mostra ações');

  // 5) Link adulterado: tela neutra.
  await p.goto(href.replace(/#t=.*/, `#t=${'A'.repeat(43)}`));
  await p.waitForSelector('#invalido:not([hidden])', { timeout: 10000 });
  console.log('LINK ADULTERADO:', (await p.textContent('#invalido h2')).trim());
  const violacoesPublico = await p.evaluate(() => window.__csp);
  const terceirosPublico = [...terceiros];

  // 6) Recepção: lembrete por WhatsApp leva um link pessoal novo.
  // Outro cliente com WhatsApp agenda para amanhã pela API pública (vai aparecer nos lembretes).
  const pub = `${API}/api/public/agendar/${SLUG}`;
  const cat = (await (await fetch(pub)).json()).data;
  const barba = cat.servicos.find(x => x.nome === 'Barba');
  const ana = barba.profissionais.find(x => x.nome === 'Ana');
  const livres = (await (await fetch(`${pub}/slots?servicoId=${barba.id}&profissionalId=${ana.id}&data=${amanha}`)).json()).data.slots;
  const criado = await fetch(pub, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ servicoId: barba.id, profissionalId: ana.id, data: amanha, horario: livres[livres.length - 1], nome: 'Caio Lembrete', whatsapp: '(11) 94444-3333', consentimento: true, website: '' }) });
  if (criado.status !== 201) errs.push(`agendamento para o lembrete não criado: ${criado.status}`);
  await p.goto(APP);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#btnAgendaLembretes'); await p.waitForTimeout(900);
  const zap = p.locator('#lembretesConteudo [data-zap]').first();
  if (await zap.count()) {
    const [popup] = await Promise.all([ctx.waitForEvent('page'), zap.click()]);
    await popup.waitForURL(/wa\.me/, { timeout: 10000 }).catch(() => {});
    const texto = decodeURIComponent(new URL(popup.url()).searchParams.get('text') || '');
    console.log('WHATSAPP COM LINK:', /meu-horario\.html.*#t=[A-Za-z0-9_-]{43}/.test(texto), '|', texto.replace(/#t=\S+/, '#t=<código>').slice(-90));
    if (!/meu-horario\.html.*#t=[A-Za-z0-9_-]{43}/.test(texto)) errs.push('lembrete sem link pessoal');
    await popup.close();
  } else {
    errs.push('nenhum lembrete com WhatsApp amanhã');
  }
  const acessosRecepcao = (await db('agendamento_acessos')).filter(a => a.origem === 'recepcao').length;
  console.log('LINKS GERADOS PELA RECEPÇÃO:', acessosRecepcao);
  if (acessosRecepcao < 1) errs.push('recepção não gerou link');

  const violacoes = [...violacoesPublico, ...await p.evaluate(() => window.__csp), ...csp];
  console.log('TERCEIROS requisitados pelas páginas do cliente:', JSON.stringify([...new Set(terceirosPublico)]));
  if (terceirosPublico.length) errs.push('página do cliente chamou terceiros');
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
