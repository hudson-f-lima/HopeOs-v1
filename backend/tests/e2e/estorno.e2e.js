// E2E (Playwright/Chromium): Dashboard > Comandas do dia > Estornar (D-013).
// Admin faz um estorno parcial (1 serviço de 2) e um total; o caixa do dia mostra
// a linha negativa. Recepção, profissional e token legado não veem o card nem o botão.
// Requer: node backend/scripts/dev-memory-api.js (seed padrão) + PWA em :5599.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/estorno.e2e.js  (portas: E2E_WEB / E2E_API)
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());

async function entrar(b, email, errs) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => errs.push(`${email}: ${e.message}`));
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}

(async () => {
  const errs = [];
  const falha = m => { errs.push(m); };
  // Duas comandas de hoje: (1) Corte, Pix 60,00; (2) Corte + Barba, Pix 100,00.
  const servicos = await db('servicos'); const profs = await db('profissionais');
  const corte = servicos.find(s => s.nome === 'Corte'); const barba = servicos.find(s => s.nome === 'Barba');
  const ana = profs.find(p => p.nome === 'Ana');
  const c1 = await legado('/checkout/close', { idempotencyKey: 'e2e-est-1', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] });
  const c2 = await legado('/checkout/close', { idempotencyKey: 'e2e-est-2', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: ana.id }, { tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 10000 }] });
  if (!c1.ok || !c2.ok) falha(`checkouts: ${JSON.stringify([c1.error, c2.error])}`);
  const id1 = c1.data.saved.comandoId; const id2 = c2.data.saved.comandoId;
  const itemBarba = (await db('comando_itens')).find(i => i.comando_id === id2 && i.servico_id === barba.id);

  const b = await chromium.launch();
  const p = await entrar(b, 'admin@dev.local', errs);
  await p.click('#navDashboard'); await p.waitForTimeout(800);
  const cardVisivel = await p.isVisible('#cardComandasEstorno');
  const botoes = await p.locator('#estornoLista [data-estornar]').count();
  console.log('ADMIN: card visível =', cardVisivel, '| botões Estornar =', botoes);
  if (!cardVisivel || botoes !== 2) falha(`admin deveria ver 2 botões, viu ${botoes}`);

  // Parcial: só a Barba (forma única → o backend escolhe o Pix e calcula o valor).
  await p.click(`[data-estornar="${id2}"]`); await p.waitForSelector('#modalEstorno:not(.hidden)');
  const desabilitado = await p.isDisabled('#btnConfirmarEstorno');
  await p.check('#estTipoParcial');
  await p.fill(`[data-item="${itemBarba.id}"]`, '1');
  await p.selectOption('#estMotivoCodigo', 'erro_lancamento');
  await p.fill('#estMotivo', 'Barba lançada por engano no balcão');
  await p.check('#estConfirmo');
  await p.click('#btnConfirmarEstorno'); await p.waitForTimeout(1200);
  const toast1 = (await p.textContent('body')).includes('Estorno registrado');
  let est = await db('comanda_estornos');
  console.log('PARCIAL: botão começa desabilitado =', desabilitado, '| toast =', toast1, '| estornos =', est.length, est[0] && est[0].tipo, est[0] && est[0].reembolso_centavos);
  if (!desabilitado || !toast1 || est.length !== 1 || est[0].tipo !== 'parcial' || est[0].reembolso_centavos !== 4000) falha('estorno parcial');

  // Total da comanda 1.
  await p.click(`[data-estornar="${id1}"]`); await p.waitForSelector('#modalEstorno:not(.hidden)');
  await p.selectOption('#estMotivoCodigo', 'desistencia_cliente');
  await p.fill('#estMotivo', 'Cliente desistiu e pediu o dinheiro de volta');
  await p.check('#estConfirmo');
  await p.click('#btnConfirmarEstorno'); await p.waitForTimeout(1200);
  est = await db('comanda_estornos');
  const mov = (await db('caixa_movimentos')).filter(m => m.tipo === 'estorno_pagamento');
  console.log('TOTAL: estornos =', est.length, '| caixa estorno =', mov.map(m => m.valor_centavos).join(','), '| status 1 =', await p.getAttribute(`[data-comanda="${id1}"] [data-status]`, 'data-status'));
  if (est.length !== 2 || mov.reduce((s, m) => s + m.valor_centavos, 0) !== -10000) falha('estorno total / caixa negativo');
  if (await p.locator(`[data-estornar="${id1}"]`).count()) falha('comanda 100% estornada ainda tem botão');

  // Caixa do dia: linha negativa e saldo.
  await p.waitForTimeout(500);
  const linha = await p.getAttribute('#caixaEstornos', 'data-estornos').catch(() => null);
  console.log('CAIXA: estornos do dia =', linha, '|', (await p.textContent('#caixaSaldoDia').catch(() => '?')).trim());
  if (linha !== '-10000') falha(`caixa sem a linha negativa: ${linha}`);
  // Sem confirmar, o botão não estorna.
  await p.click(`[data-estornar="${id2}"]`); await p.waitForSelector('#modalEstorno:not(.hidden)');
  if (!(await p.isDisabled('#btnConfirmarEstorno'))) falha('confirmação não é obrigatória');
  await p.click('#btnCancelarEstorno');
  await p.locator('#cardComandasEstorno').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-estorno.png') });

  // Quem não é gestão não vê.
  for (const email of ['recepcao@dev.local', 'profissional@dev.local']) {
    const q = await entrar(b, email, errs);
    const escondido = await q.locator('#cardComandasEstorno').evaluate(n => n.classList.contains('hidden'));
    const n = await q.locator('[data-estornar]').count();
    console.log(`${email}: card escondido =`, escondido, '| botões =', n);
    if (!escondido || n) falha(`${email} vê o estorno`);
  }
  const leg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  leg.on('pageerror', e => errs.push(`legado: ${e.message}`));
  await leg.goto(`${BASE}&apiToken=dev`); await leg.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await leg.waitForTimeout(800);
  const legEscondido = await leg.locator('#cardComandasEstorno').evaluate(n => n.classList.contains('hidden'));
  console.log('LEGADO: card escondido =', legEscondido);
  if (!legEscondido) falha('token legado vê o estorno');
  // E a API recusa o legado mesmo assim.
  const r = await fetch(`${API}/api/comandas/${id2}/estorno`, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'total', idempotencyKey: 'leg', motivoCodigo: 'outro', motivo: 'tentativa pelo token legado' }) });
  console.log('LEGADO API:', r.status);
  if (r.status !== 403) falha(`legado estornou pela API: ${r.status}`);

  await b.close();
  console.log('ERROS:', JSON.stringify(errs));
  if (errs.length) process.exitCode = 1;
})().catch(e => { console.error('ERROS:', JSON.stringify([e.message])); process.exit(1); });
