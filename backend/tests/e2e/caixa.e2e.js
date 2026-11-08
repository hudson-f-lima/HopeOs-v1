// E2E manual (Playwright/Chromium): Dashboard > Fechamento de caixa (recepção),
// conferência do dinheiro contado e ausência do card para o profissional.
// Requer: node backend/scripts/dev-memory-api.js (seed padrão) + PWA em :5599.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/caixa.e2e.js  (portas: E2E_WEB / E2E_API)
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function entrar(b, email) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}

(async () => {
  // Duas comandas no dia (data explícita no fuso da empresa): Pix 60,00 e dinheiro 40,00 + 10,00 de gorjeta.
  await legado('/formas-pagamento', { code: 'dinheiro', label: 'Dinheiro' });
  const servicos = await db('servicos'); const profs = await db('profissionais');
  const corte = servicos.find(s => s.nome === 'Corte'); const barba = servicos.find(s => s.nome === 'Barba');
  const ana = profs.find(p => p.nome === 'Ana');
  const c1 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-cx-1', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] });
  const c2 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-cx-2', itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'dinheiro', valorCentavos: 5000 }], gorjetaCentavos: 1000 });
  console.log('CHECKOUTS:', c1.ok, c2.ok, '| caixa_movimentos:', (await db('caixa_movimentos')).length);

  const b = await chromium.launch();
  const p = await entrar(b, 'recepcao@dev.local');
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.click('#navDashboard'); await p.waitForTimeout(800);
  if (await p.inputValue('#caixaData') !== hojeSP) { await p.fill('#caixaData', hojeSP); await p.dispatchEvent('#caixaData', 'change'); await p.waitForTimeout(600); }
  console.log('CARD VISÍVEL:', await p.isVisible('#cardCaixa'), '| dia:', await p.inputValue('#caixaData'));
  console.log('RESUMO:', await p.textContent('#caixaQtd'), '|', await p.textContent('#caixaBruto'), '| esperado:', await p.textContent('#caixaEsperado'));
  await p.fill('#caixaContado', '45,00'); await p.click('#btnConferirCaixa'); await p.waitForTimeout(600);
  console.log('CONFERÊNCIA:', (await p.textContent('#caixaDiferenca')).replace(/\s+/g, ' ').trim(), '| data-diferenca=', await p.getAttribute('#caixaDiferenca', 'data-diferenca'));
  await p.locator('#cardCaixa').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-caixa.png') });
  console.log('ERROS:', JSON.stringify(errs));

  const prof = await entrar(b, 'profissional@dev.local');
  console.log('PROFISSIONAL: navDashboard visível =', await prof.isVisible('#navDashboard'), '| cardCaixa hidden =', await prof.locator('#cardCaixa').evaluate(n => n.classList.contains('hidden')));
  await b.close();
})();
