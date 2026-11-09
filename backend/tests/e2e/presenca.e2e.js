// E2E manual (Playwright/Chromium): presença na agenda (D-012) — cliente chegou,
// na cadeira, e a ação de falta some para quem já chegou.
// Requer: node backend/scripts/dev-memory-api.js (seed padrão) + PWA em :5599.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/presenca.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const API = 'http://127.0.0.1:3399';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(BASE);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(1200);
  await p.click('#btnAgendaToday'); await p.waitForTimeout(800);

  const alvo = (await db('agendamentos')).find(a => a.horario.startsWith('10:00') && a.status === 'agendado' && a.data === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
  const abrir = async () => { await p.locator(`[data-agenda-id="${alvo.id}"], [data-id="${alvo.id}"]`).first().click(); await p.waitForTimeout(600); };
  await abrir();
  const acoes = async () => (await p.locator('#actionSheetContent [data-sheet-action]').allTextContents()).map(t => t.trim());
  console.log('AGENDADO:', JSON.stringify(await acoes()));
  await p.click('[data-sheet-action="chegou"]'); await p.waitForTimeout(1000);
  console.log('BANCO após chegou:', (await db('agendamentos')).find(a => a.id === alvo.id).status);
  await abrir();
  console.log('CHEGOU:', JSON.stringify(await acoes()), '| badge:', (await p.textContent('#actionSheetContent .badge')).trim());
  await p.click('[data-sheet-action="cadeira"]'); await p.waitForTimeout(1000);
  console.log('BANCO após cadeira:', (await db('agendamentos')).find(a => a.id === alvo.id).status);
  await abrir();
  console.log('NA CADEIRA:', JSON.stringify(await acoes()));
  // Histórico (trilha agendamento_eventos): abre o recolhível e lê as linhas.
  await p.click('#historicoDetails summary');
  await p.waitForSelector('#historicoBody .sheet-historico-item', { timeout: 5000 });
  const paras = await p.locator('#historicoBody .sheet-historico-item').evaluateAll(els => els.map(e => e.dataset.historicoPara));
  const linhas = (await p.locator('#historicoBody .sheet-historico-item').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('HISTÓRICO:', JSON.stringify(linhas));
  if (paras.join(',') !== 'aguardando,em_atendimento') errs.push(`histórico inesperado: ${paras.join(',')}`);
  if (!linhas[0].includes('Agendado → Chegou') || !linhas[1].includes('Chegou → Na cadeira')) errs.push('texto do histórico sem de → para');
  if (!linhas.every(l => l.includes('Recepção Dev'))) errs.push('histórico sem o nome de quem fez');
  if (linhas.some(l => l.includes('@'))) errs.push('histórico expõe e-mail');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-presenca.png') });
  console.log('ERROS:', JSON.stringify(errs));
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
