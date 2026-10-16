// E2E manual (Playwright/Chromium) contra backend/scripts/dev-memory-api.js recém-iniciado.
// Ver .claude/skills/steward/SKILL.md §4. Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/equipe.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
async function pagina(b) { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/40[13]|Failed to load/.test(m.text())) p.errs.push(m.text()); }); return p; }
async function entrar(p, email) { await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)'); await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin'); }
(async () => {
  const b = await chromium.launch();
  let p = await pagina(b);
  await entrar(p, 'novo@dev.local'); await p.waitForTimeout(1500);
  console.log('SEM VÍNCULO:', await p.textContent('#loginErro'));
  p = await pagina(b);
  await entrar(p, 'admin@dev.local'); await p.waitForSelector('#appRoot:not(.hidden)'); await p.waitForTimeout(1200);
  await p.click('#navAvatar'); await p.waitForTimeout(300);
  console.log('ABA EQUIPE visível p/ admin:', await p.isVisible('#subtabBtnEquipe'));
  await p.click('#subtabBtnEquipe'); await p.waitForTimeout(800);
  console.log('LISTA antes:', (await p.locator('.eq-quem b').allTextContents()).join(', '));
  await p.fill('#eqEmail', 'novo@dev.local'); await p.selectOption('#eqRole', 'profissional');
  await p.click('#formEquipe button[type=submit]'); await p.waitForTimeout(400);
  console.log('SEM CADASTRO DE PROF:', await p.textContent('#eqErro'));
  await p.selectOption('#eqProfissional', { label: 'Bruno' });
  await p.click('#formEquipe button[type=submit]'); await p.waitForTimeout(1000);
  console.log('LISTA depois:', (await p.locator('.eq-quem b').allTextContents()).join(', '));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-equipe.png') });
  // muda papel da recepção para gestão pela lista
  const recep = p.locator('.eq-row', { hasText: 'recepcao@dev.local' });
  await recep.locator('select[data-campo=role]').selectOption('gestor'); await p.waitForTimeout(800);
  const ms = await (await fetch('http://127.0.0.1:3399/__db/empresa_memberships')).json();
  const us = await (await fetch('http://127.0.0.1:3399/__db/app_users')).json();
  const papel = e => (ms.find(m => m.user_id === (us.find(u => u.email === e) || {}).id) || {}).role;
  console.log('PAPÉIS:', 'recepcao→', papel('recepcao@dev.local'), '| novo→', papel('novo@dev.local'));
  console.log('ADMIN erros:', JSON.stringify(p.errs));
  // recepção (agora gestor) não deve ver aba Equipe; novo entra e vê só Bruno
  p = await pagina(b);
  await entrar(p, 'novo@dev.local'); await p.waitForSelector('#appRoot:not(.hidden)'); await p.waitForTimeout(1500);
  console.log('NOVO chip:', await p.textContent('#sessionLabel'));
  console.log('NOVO agenda:', JSON.stringify((await p.locator('.ag-line1').allTextContents()).map(t => t.trim())));
  await p.click('#navAvatar'); await p.waitForTimeout(300);
  console.log('ABA EQUIPE p/ profissional:', await p.isVisible('#subtabBtnEquipe'));
  console.log('NOVO erros:', JSON.stringify(p.errs));
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
