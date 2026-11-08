// E2E manual (Playwright/Chromium) dos lembretes de confirmação (D-011).
// Requer: node backend/scripts/dev-memory-api.js (seed padrão) + PWA em :5599.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/lembretes.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const API = 'http://127.0.0.1:3399';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (method, path, body) => fetch(`${API}/api${path}`, { method, headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());

(async () => {
  // Prepara: cliente com WhatsApp e um horário amanhã
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const cliente = (await legado('POST', '/clientes', { nome: 'Joana Lembrete', whatsapp: '11 98888-7777' })).data;
  const profs = await db('profissionais'); const servs = await db('servicos');
  const novo = await legado('POST', '/agenda', { clienteId: cliente.id, servicoId: servs.find(s => s.nome === 'Barba').id, profissionalId: profs.find(p => p.nome === 'Bruno').id, data: amanha, horario: '16:00', permitirConflito: true });
  console.log('PREPARO:', novo.ok, amanha);

  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(BASE);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);

  await p.click('#btnAgendaLembretes'); await p.waitForTimeout(900);
  console.log('TÍTULO:', await p.textContent('#lembretesTitulo'), '|', (await p.textContent('#lembretesResumo')).trim());
  const linha = p.locator('#lembretesConteudo .eq-row', { hasText: 'Joana' });
  const href = await linha.locator('a.lembrete-zap').getAttribute('href');
  console.log('LINK:', href.slice(0, 60), '| texto:', decodeURIComponent(href.split('text=')[1]).slice(0, 70));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-lembretes.png') });
  await linha.locator('[data-confirmar]').click(); await p.waitForTimeout(900);
  const ag = (await db('agendamentos')).find(a => a.cliente_id === cliente.id);
  console.log('CONFIRMOU:', ag.status, '| ainda na lista:', await p.locator('#lembretesConteudo .eq-row', { hasText: 'Joana' }).count());

  // Hoje: Cliente Teste sem WhatsApp aparece sem link, com o motivo
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  await p.fill('#lembretesData', hoje); await p.dispatchEvent('#lembretesData', 'change'); await p.waitForTimeout(900);
  console.log('HOJE:', (await p.textContent('#lembretesConteudo')).replace(/\s+/g, ' ').trim().slice(0, 120));
  console.log('ERROS:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
