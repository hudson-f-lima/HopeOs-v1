// E2E manual (Playwright/Chromium) contra backend/scripts/dev-memory-api.js recém-iniciado.
// Ver .claude/skills/steward/SKILL.md §4. Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/login.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const out = (...a) => console.log(...a);
async function novaPagina(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/403|401|Failed to load resource/.test(m.text())) p.errs.push(m.text()); });
  return p;
}
async function entrar(p, email, senha = 'dev12345') {
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)', { timeout: 15000 });
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', senha); await p.click('#btnLogin');
}
(async () => {
  const b = await chromium.launch();
  // 1. senha errada
  let p = await novaPagina(b);
  await entrar(p, 'admin@dev.local', 'errada'); await p.waitForTimeout(800);
  out('ERRADA:', await p.textContent('#loginErro'));
  // 2. admin
  await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(1500);
  out('ADMIN chip:', await p.textContent('#sessionLabel'), '| dashboard visível:', await p.isVisible('#navDashboard'));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-admin.png') });
  await p.click('#fab'); await p.waitForTimeout(400);
  await p.click('#agServico'); await p.fill('#agServico', 'Corte'); await p.waitForTimeout(300);
  await p.locator('#agServico ~ div [data-value]').first().click(); await p.waitForTimeout(300);
  await p.click('#agProfissional'); await p.fill('#agProfissional', 'Ana'); await p.waitForTimeout(300);
  await p.locator('#agProfissional ~ div [data-value]').first().click(); await p.waitForTimeout(1200);
  out('ADMIN slots:', (await p.textContent('#agSlots')).replace(/\s+/g, ' ').trim());
  await p.click('.ag-slot.recomendado >> nth=0'); await p.click('#btnConfirmarNovoAgendamento'); await p.waitForTimeout(1200);
  const ags = await (await fetch('http://127.0.0.1:3399/__db/agendamentos')).json();
  const users = await (await fetch('http://127.0.0.1:3399/__db/app_users')).json();
  const novo = ags[ags.length - 1];
  out('ADMIN gravou:', novo.horario, novo.duracao_min, 'created_by=', (users.find(u => u.id === novo.created_by) || {}).email);
  out('ADMIN erros:', JSON.stringify(p.errs));
  // logout
  await p.click('#btnLogout'); await p.waitForSelector('#loginScreen:not(.hidden)', { timeout: 15000 });
  out('LOGOUT → tela de login:', await p.isVisible('#loginScreen'));
  // 3. profissional
  p = await novaPagina(b);
  await entrar(p, 'profissional@dev.local');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(1500);
  out('PROF chip:', await p.textContent('#sessionLabel'), '| dashboard visível:', await p.isVisible('#navDashboard'));
  const cards = await p.locator('.ag-line1').allTextContents();
  out('PROF agenda (cards):', JSON.stringify(cards.map(t => t.trim())));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-prof.png') });
  out('PROF erros:', JSON.stringify(p.errs));
  // 4. recepção: dashboard sem financeiro
  p = await novaPagina(b);
  await entrar(p, 'recepcao@dev.local');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(1500);
  await p.click('#navDashboard'); await p.waitForTimeout(1500);
  out('RECEP margem:', (await p.textContent('#dbMarginWidget')).trim(), '| caixa:', (await p.textContent('#dbMoneyWidget')).trim());
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-recep.png'), fullPage: false });
  out('RECEP erros:', JSON.stringify(p.errs));
  // 5. legado continua
  p = await novaPagina(b);
  await p.goto(BASE + '&apiToken=dev');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 });
  out('LEGADO: app abriu sem login:', await p.isVisible('#appRoot'), '| chip visível:', await p.isVisible('#sessionChip'));
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
