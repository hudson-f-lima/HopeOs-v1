// E2E (Playwright/Chromium): a PWA funciona sob a CSP do render.yaml sem nenhuma
// violação. Requer: node backend/scripts/dev-memory-api.js + PWA servida por
// backend/tests/e2e/static-server.py (que injeta os headers do render.yaml).
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/csp.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  // Registra violações antes de qualquer script da página rodar.
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
  });
  // Google Fonts simulado (determinístico, sem rede): CSS em fonts.googleapis.com
  // apontando para fonte em fonts.gstatic.com — exercita style-src-elem e font-src.
  // A checagem de CSP acontece antes da requisição, então o stub não a contorna.
  let fonteBaixada = false;
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: "@font-face{font-family:'Plus Jakarta Sans';src:url(https://fonts.gstatic.com/s/pjs/teste.woff2) format('woff2')}" }));
  await ctx.route('https://fonts.gstatic.com/**', r => { fonteBaixada = true; r.fulfill({ contentType: 'font/woff2', body: '' }); });
  const p = await ctx.newPage();
  const errs = []; const cspConsole = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (/Content Security Policy/i.test(m.text())) cspConsole.push(m.text());
    else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text());
  });

  const resp = await p.goto(BASE);
  const csp = resp.headers()['content-security-policy'] || '';
  console.log('CSP no documento:', Boolean(csp), '| frame-ancestors none:', csp.includes("frame-ancestors 'none'"));
  if (!csp) process.exitCode = 1;

  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'admin@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(1200);
  await p.click('#fab'); await p.waitForTimeout(500); await p.click('#btnCancelarNovoAgendamento'); await p.waitForTimeout(300);
  await p.click('#navCheckout'); await p.waitForTimeout(800);
  await p.click('#navDashboard'); await p.waitForTimeout(1200);
  await p.click('#navAvatar'); await p.waitForTimeout(400);
  for (const aba of await p.locator('#subtabRow .subtab-btn:visible').all()) { await aba.click(); await p.waitForTimeout(400); }
  await p.click('#btnFecharGestao'); await p.waitForTimeout(300);
  await p.click('#navAgenda'); await p.waitForTimeout(600);
  if (await p.isVisible('#btnAgendaLembretes')) { await p.click('#btnAgendaLembretes'); await p.waitForTimeout(800); }
  const sw = await p.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : -1);
  console.log('SERVICE WORKER registrado:', sw, '| fonte de fonts.gstatic.com requisitada:', fonteBaixada);
  if (!fonteBaixada) process.exitCode = 1;
  const antesDoLogout = await p.evaluate(() => window.__csp);
  await p.click('#btnLogout').catch(() => {}); await p.waitForTimeout(800);
  // O logout pode recarregar a página (zera window.__csp): soma as duas leituras.
  const violacoes = [...antesDoLogout, ...await p.evaluate(() => window.__csp), ...cspConsole];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;

  // Controle negativo: o detector enxerga violação real (script inline bloqueado).
  await p.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.body.appendChild(s); });
  await p.waitForTimeout(300);
  const controle = await p.evaluate(() => ({ bloqueado: window.__inline !== 1, vistas: window.__csp.length }));
  console.log('CONTROLE NEGATIVO (inline bloqueado e detectado):', controle.bloqueado && controle.vistas > 0);
  if (!(controle.bloqueado && controle.vistas > 0)) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
