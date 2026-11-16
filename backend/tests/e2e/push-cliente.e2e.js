// E2E (Playwright/Chromium): lembrete por notificação no celular do cliente (C5, D-041).
// Parte A: a página do link pessoal liga e desliga o push (assinatura simulada no navegador) e o
// toque na notificação abre o horário mesmo sem o #t= (código guardado no aparelho).
// Parte B: o service worker do cliente REAL recebe uma mensagem de push (entregue pelo protocolo
// de desenvolvimento do Chromium) e mostra a notificação.
// Requer: DEV_PUBLIC_SLUG=salao-dev e VAPID_* no servidor de dev (o run-all.js define).
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const BASE = 'http://127.0.0.1:5599';
const SLUG = process.env.DEV_PUBLIC_SLUG || 'salao-dev';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();

(async () => {
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const b = await chromium.launch();
  const errs = []; const csp = []; const terceiros = [];
  const vigia = p => {
    p.on('pageerror', e => errs.push(e.message));
    p.on('request', r => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname)) terceiros.push(u.hostname); });
    p.on('console', m => {
      if (m.text().includes('Content Security Policy')) csp.push(m.text());
      else if (m.type() === 'error' && !m.text().includes('Failed to load') && !['400', '401', '403', '404', '409'].some(c => m.text().includes(c))) errs.push(m.text());
    });
  };

  // Um agendamento pela API pública, para ter um link pessoal.
  const pub = `${API}/api/public/agendar/${SLUG}`;
  const cat = (await (await fetch(pub)).json()).data;
  const barba = cat.servicos.find(s => s.nome === 'Barba');
  const ana = barba.profissionais.find(p => p.nome === 'Ana');
  const livres = (await (await fetch(`${pub}/slots?servicoId=${barba.id}&profissionalId=${ana.id}&data=${amanha}`)).json()).data.slots;
  const criado = await (await fetch(pub, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ servicoId: barba.id, profissionalId: ana.id, data: amanha, horario: livres[0], nome: 'Paula Push', whatsapp: '(11) 93333-1111', consentimento: true, website: '' }) })).json();
  const token = criado.data.link;
  console.log('LINK CRIADO:', Boolean(token && token.length === 43));
  if (!token) { errs.push('sem link pessoal'); }

  // ---- Parte A: fluxo da página com assinatura simulada ---------------------------------------
  const ctxA = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctxA.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
    // Endereço estável entre cargas da página (o aparelho real mantém a assinatura).
    if (!sessionStorage.getItem('__ep')) sessionStorage.setItem('__ep', 'https://fcm.googleapis.com/fcm/send/e2e-' + Math.random().toString(36).slice(2));
    const fake = {
      endpoint: sessionStorage.getItem('__ep'),
      toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }; },
      async unsubscribe() { sessionStorage.removeItem('__sub'); return true; }
    };
    const get = async () => (sessionStorage.getItem('__sub') ? fake : null);
    Notification.requestPermission = async () => 'granted';
    navigator.serviceWorker.register = async () => ({ active: {}, pushManager: { getSubscription: get, subscribe: async () => { sessionStorage.setItem('__sub', '1'); return fake; } } });
    navigator.serviceWorker.getRegistration = async () => ({ pushManager: { getSubscription: get } });
  });
  const p = await ctxA.newPage(); vigia(p);
  await p.goto(`${BASE}/meu-horario.html?apiBase=${API}/api#t=${token}`);
  await p.waitForSelector('#secHorario:not([hidden])', { timeout: 10000 });
  await p.waitForSelector('#btnPush:not([hidden])', { timeout: 5000 });
  console.log('BOTÃO:', (await p.textContent('#btnPush')).trim());
  if (!(await p.textContent('#btnPush')).includes('Receber lembrete')) errs.push('botão de ativar ausente');
  await p.click('#btnPush');
  await p.waitForFunction(() => /Pronto!/.test(document.getElementById('aviso').textContent), null, { timeout: 8000 });
  console.log('AVISO:', (await p.textContent('#aviso')).trim());
  const subs = await db('agendamento_push');
  console.log('BANCO push:', subs.length, '| campos:', JSON.stringify(Object.keys(subs[0].assinatura).sort()), '| revogado:', subs[0].revogado_em || null);
  if (subs.length !== 1 || subs[0].revogado_em) errs.push('assinatura não gravada');
  const guardado = await p.evaluate(() => localStorage.getItem('hopeos.meuHorario.token'));
  if (guardado !== token) errs.push('código não guardado no aparelho');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-c5-push.png'), fullPage: true });

  // Toque na notificação: abre sem o #t= e ainda mostra o horário.
  await p.goto(`${BASE}/meu-horario.html?apiBase=${API}/api`);
  await p.waitForSelector('#secHorario:not([hidden])', { timeout: 10000 });
  await p.waitForSelector('#btnPush:not([hidden])');
  console.log('SEM #t= (toque na notificação):', (await p.textContent('#quando')).trim().slice(0, 40), '| botão:', (await p.textContent('#btnPush')).trim());
  if (!(await p.textContent('#btnPush')).includes('Desativar')) errs.push('botão não mostra "Desativar" com o push ligado');

  await p.click('#btnPush');
  await p.waitForFunction(() => /desativados/.test(document.getElementById('aviso').textContent), null, { timeout: 8000 });
  const depois = await db('agendamento_push');
  console.log('APÓS DESATIVAR:', depois.length, 'linha | revogada:', Boolean(depois[0] && depois[0].revogado_em), '| código guardado:', await p.evaluate(() => localStorage.getItem('hopeos.meuHorario.token')));
  if (!depois[0] || !depois[0].revogado_em) errs.push('desativar não revogou no servidor');
  if (await p.evaluate(() => localStorage.getItem('hopeos.meuHorario.token'))) errs.push('código continuou guardado');

  // Sem código nenhum: tela neutra.
  await p.evaluate(() => localStorage.clear());
  await p.goto(`${BASE}/meu-horario.html?apiBase=${API}/api`);
  await p.waitForSelector('#invalido:not([hidden])', { timeout: 10000 });
  console.log('SEM CÓDIGO: tela neutra');
  const violA = await p.evaluate(() => window.__csp);

  // ---- Parte B: service worker real recebe um push ------------------------------------------
  // O headless "novo" (Chromium completo) é o que concede a permissão de notificação; o headless
  // antigo responde "negada" a qualquer pedido.
  const bB = await chromium.launch({ channel: 'chromium' });
  const ctxB = await bB.newContext({ viewport: { width: 390, height: 844 } });
  await ctxB.grantPermissions(['notifications'], { origin: BASE });
  const q = await ctxB.newPage(); vigia(q);
  const cdp = await ctxB.newCDPSession(q);
  let regId = null;
  cdp.on('ServiceWorker.workerRegistrationUpdated', ev => { for (const r of ev.registrations) if (r.scopeURL.endsWith('/cliente-push/')) regId = r.registrationId; });
  await cdp.send('ServiceWorker.enable');
  await q.goto(`${BASE}/meu-horario.html?apiBase=${API}/api#t=${token}`);
  await q.waitForSelector('#secHorario:not([hidden])', { timeout: 10000 });
  const escopo = await q.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('./sw-cliente.js', { scope: './cliente-push/' });
    await new Promise(res => { const sw = reg.installing || reg.waiting || reg.active; if (sw.state === 'activated') return res(); sw.addEventListener('statechange', () => { if (sw.state === 'activated') res(); }); });
    return reg.scope;
  });
  console.log('SW DO CLIENTE:', escopo);
  if (!escopo.endsWith('/cliente-push/')) errs.push('escopo do service worker do cliente fora de ./cliente-push/');
  for (let i = 0; i < 40 && !regId; i++) await q.waitForTimeout(100);
  if (!regId) errs.push('registro do service worker não encontrado pelo protocolo');
  else {
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regId, data: JSON.stringify({ titulo: 'Lembrete do seu horário', corpo: 'Barba em Salão Dev, 17/11 às 09:00.', tag: 'lembrete-d1' }) });
    let notificacoes = [];
    for (let i = 0; i < 40 && !notificacoes.length; i++) {
      await q.waitForTimeout(150);
      notificacoes = await q.evaluate(async () => (await (await navigator.serviceWorker.getRegistration('./cliente-push/')).getNotifications()).map(n => ({ titulo: n.title, corpo: n.body, tag: n.tag })));
    }
    console.log('NOTIFICAÇÃO:', JSON.stringify(notificacoes));
    if (notificacoes.length !== 1 || notificacoes[0].titulo !== 'Lembrete do seu horário' || !notificacoes[0].corpo.includes('Barba') || notificacoes[0].tag !== 'lembrete-d1') errs.push('o service worker não mostrou a notificação esperada');
  }

  // Arquivos publicados.
  for (const f of ['sw-cliente.js', 'manifest-cliente.json']) {
    const r = await fetch(`${BASE}/${f}`); console.log('ARQUIVO', f, r.status); if (r.status !== 200) errs.push(`${f} não servido`);
  }
  const violB = 0;
  await bB.close();
  console.log('TERCEIROS requisitados:', JSON.stringify([...new Set(terceiros)]));
  if (terceiros.length) errs.push('a página chamou terceiros');
  const violacoes = [...violA, ...csp];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length || violB) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
