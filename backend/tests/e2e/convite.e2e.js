// E2E manual (Playwright/Chromium) contra backend/scripts/dev-memory-api.js recém-iniciado.
// Ver .claude/skills/steward/SKILL.md §4. Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/convite.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const API = 'http://127.0.0.1:3399';
async function pagina(b) { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/40[13]|Failed to load/.test(m.text())) p.errs.push(m.text()); }); return p; }
async function entrar(p, email, senha) { await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)'); await p.fill('#loginEmail', email); await p.fill('#loginSenha', senha); await p.click('#btnLogin'); }
async function ultimoLink(email, type) { const ls = await (await fetch(API + '/__links')).json(); return ls.filter(l => l.email === email && l.type === type).pop().link; }
(async () => {
  const b = await chromium.launch();
  let p = await pagina(b);
  await entrar(p, 'admin@dev.local', 'dev12345'); await p.waitForSelector('#appRoot:not(.hidden)'); await p.waitForTimeout(1000);
  await p.click('#navAvatar'); await p.click('#subtabBtnEquipe'); await p.waitForTimeout(600);
  await p.fill('#eqEmail', 'maria@dev.local'); await p.selectOption('#eqRole', 'recepcao');
  await p.click('#formEquipe button[type=submit]'); await p.waitForTimeout(1000);
  console.log('TOAST convite:', (await p.textContent('body')).includes('Convite enviado por e-mail.'));
  console.log('ADMIN erros:', JSON.stringify(p.errs));
  // Maria abre o link do convite
  p = await pagina(b);
  await p.goto(await ultimoLink('maria@dev.local', 'invite'));
  await p.waitForSelector('#senhaForm:not(.hidden)', { timeout: 15000 });
  await p.fill('#novaSenha', 'curta'); await p.fill('#novaSenha2', 'curta'); await p.click('#btnSalvarSenha');
  console.log('SENHA CURTA:', await p.textContent('#senhaErro'));
  await p.fill('#novaSenha', 'Maria12345'); await p.fill('#novaSenha2', 'Maria12345'); await p.click('#btnSalvarSenha');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  console.log('MARIA entrou:', await p.textContent('#sessionLabel'), '| URL sem token:', !p.url().includes('access_token'));
  await p.click('#btnLogout'); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'maria@dev.local'); await p.fill('#loginSenha', 'Maria12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 });
  console.log('MARIA login com senha nova: ok');
  await p.click('#btnLogout'); await p.waitForSelector('#loginScreen:not(.hidden)');
  // Esqueci minha senha
  await p.fill('#loginEmail', 'maria@dev.local'); await p.click('#btnEsqueciSenha'); await p.waitForTimeout(800);
  console.log('RECUPERAR:', await p.textContent('#loginErro'));
  await p.goto(await ultimoLink('maria@dev.local', 'recovery'));
  await p.waitForSelector('#senhaForm:not(.hidden)');
  await p.fill('#novaSenha', 'Outra12345'); await p.fill('#novaSenha2', 'Outra12345'); await p.click('#btnSalvarSenha');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 });
  console.log('RECUPERAÇÃO concluída, entrou:', await p.textContent('#sessionLabel'));
  console.log('MARIA erros:', JSON.stringify(p.errs));
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
