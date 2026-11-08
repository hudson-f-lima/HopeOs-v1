// E2E manual (Playwright/Chromium) da Onda B: Gestão > Comissões, régua de
// faltas no novo agendamento e cota-parte no Dashboard.
// Requer: node backend/scripts/dev-memory-api.js (seed padrão) + PWA em :5599.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/onda-b.e2e.js
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
const API = 'http://127.0.0.1:3399';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text()); });

  await p.goto(BASE);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'admin@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);

  // Comissões: cria cargo, liga Ana a ele e muda o Corte para herdar do cargo
  await p.click('#navAvatar'); await p.waitForTimeout(300);
  await p.click('#subtabBtnComissoes'); await p.waitForTimeout(800);
  const formCargo = p.locator('form[data-novo="cargo"]');
  await formCargo.locator('[name=nome]').fill('Barbeiro'); await formCargo.locator('[name=comissaoPct]').fill('50');
  await formCargo.locator('button').click(); await p.waitForTimeout(600);
  const ana = p.locator('[data-tipo="profissional"]', { hasText: 'Ana' });
  await ana.locator('select[data-campo="cargoId"]').selectOption({ label: 'Barbeiro (50%)' }); await p.waitForTimeout(600);
  const corte = p.locator('[data-tipo="servico"]', { hasText: 'Corte' });
  await corte.locator('select[data-campo="modeloHeranca"]').selectOption('BY_ROLE'); await p.waitForTimeout(600);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-ondab-comissoes.png') });
  const profs = await db('profissionais');
  const servs = await db('servicos');
  const anaDb = profs.find(x => x.nome === 'Ana');
  const corteDb = servs.find(x => x.nome === 'Corte');
  console.log('BANCO:', JSON.stringify({ cargos: (await db('cargos')).map(c => `${c.nome}:${c.comissao_pct}`), anaTemCargo: Boolean(anaDb.cargo_id), corteHeranca: corteDb.modelo_heranca }));
  // A Ana tem ajuste de duração no Corte, não de comissão: vale o cargo (50%)
  const prev = await legado('/checkout/preview', { itens: [{ tipo: 'servico', servicoId: corteDb.id, profissionalId: anaDb.id }], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] });
  console.log('CHECKOUT:', prev.data.itens[0].comissaoPct, prev.data.itens[0].comissaoOrigem);
  await p.click('#btnFecharGestao'); await p.waitForTimeout(300);

  // Régua: cliente com 2 faltas seguidas gera alerta ao ser escolhido
  await p.click('#fab'); await p.waitForTimeout(400);
  await p.click('#agCliente'); await p.fill('#agCliente', 'Cliente'); await p.waitForTimeout(300);
  await p.locator('#agCliente ~ div [data-value]').first().click(); await p.waitForTimeout(900);
  console.log('RÉGUA:', await p.isVisible('#agReguaAviso'), '|', await p.textContent('#agReguaAviso'));
  await p.click('#btnCancelarNovoAgendamento'); await p.waitForTimeout(300);

  // Cota-parte no Dashboard (gestão)
  await p.click('#navDashboard'); await p.waitForTimeout(1500);
  console.log('COTA-PARTE:', await p.isVisible('#dbCotaPartePanel'), '|', (await p.textContent('#dbCotaParteWidget')).replace(/\s+/g, ' ').trim().slice(0, 140));
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1; // erro de console/página reprova o E2E (CI)

  // Recepção: não vê a aba Comissões nem a cota-parte
  const r = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await r.goto(BASE); await r.waitForSelector('#loginScreen:not(.hidden)');
  await r.fill('#loginEmail', 'recepcao@dev.local'); await r.fill('#loginSenha', 'dev12345'); await r.click('#btnLogin');
  await r.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await r.waitForTimeout(800);
  await r.click('#navDashboard'); await r.waitForTimeout(1200);
  console.log('RECEPÇÃO: aba Comissões', await r.locator('#subtabBtnComissoes').isVisible(), '| cota-parte', await r.isVisible('#dbCotaPartePanel'));
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
