// E2E do Dashboard curto: "Precisa de você" no topo e o resto recolhido.
// Uso: node backend/tests/e2e/run-all.js dashboard
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(`${ok ? 'ok ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`); if (!ok) falhas++; };

async function entrar(b, email) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('response', r => { if (r.status() >= 400) p.errs.push(`${r.status()} ${r.url()}`); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}

const API = BASE.split('apiBase=')[1].replace(/\/api$/, '');
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

(async () => {
  // Uma comanda em dinheiro hoje: o caixa do dia passa a ter o que fechar.
  await legado('/formas-pagamento', { code: 'dinheiro', label: 'Dinheiro' });
  const barba = (await db('servicos')).find(x => x.nome === 'Barba'); const ana = (await db('profissionais')).find(x => x.nome === 'Ana');
  const c = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-dash-1', itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'dinheiro', valorCentavos: 4000 }] });
  confere('comanda de preparo fechada', c.ok === true);
  const b = await chromium.launch();
  const p = await entrar(b, 'recepcao@dev.local');
  await p.click('#navDashboard'); await p.waitForTimeout(1500);

  confere('título "Precisa de você" visível', await p.isVisible('#dashPrecisaTitulo'));
  for (const id of ['dobraIndicadores', 'dobraRepasses', 'dobraCaixa', 'dobraComandas']) {
    confere(`${id} começa recolhida`, await p.locator('#' + id).evaluate(n => n.open === false));
  }
  confere('formulário do caixa escondido enquanto recolhido', !(await p.isVisible('#caixaContado')));
  const altura = await p.locator('#tab-dashboard').evaluate(n => n.scrollHeight);
  confere('painel recolhido cabe em até 2 telas de celular', altura <= 844 * 2, `${altura}px`);
  for (const s of await p.locator('#tab-dashboard summary:visible').all()) {
    const h = (await s.boundingBox()).height;
    if (h < 44) confere('alvo de toque do resumo ≥ 44px', false, `${h}px`);
  }

  // O seed tem comanda fechada hoje e o caixa não foi fechado: vira pendência.
  const cartaoCaixa = p.locator('[data-pendencia="caixa"]');
  confere('caixa aberto com comanda vira pendência', (await cartaoCaixa.count()) === 1, (await p.textContent('#dashboardActionStrip')).replace(/\s+/g, ' ').trim());
  confere('botão da pendência ≥ 44px', (await cartaoCaixa.locator('button').boundingBox()).height >= 44);
  await cartaoCaixa.locator('button').click(); await p.waitForTimeout(600);
  confere('"Fechar caixa" abre a seção do caixa', await p.locator('#dobraCaixa').evaluate(n => n.open) && await p.isVisible('#caixaContado'));
  await p.fill('#caixaContado', '40,00'); await p.click('#btnFecharCaixa');
  await p.click('#confirm-action-ok');
  await p.waitForSelector('#caixaStatusFechamento[data-fechado="1"]', { timeout: 8000 });
  await p.waitForTimeout(400);
  confere('pendência do caixa some depois de fechar', (await p.locator('[data-pendencia="caixa"]').count()) === 0);
  confere('sem pendência: mostra "Nada pendente agora."', await p.isVisible('#dashNadaPendente') || (await p.locator('[data-pendencia]').count()) > 0);

  // Controle negativo: o profissional não recebe pendência de caixa nem vê o painel.
  const prof = await entrar(b, 'profissional@dev.local');
  confere('profissional não vê o Dashboard', !(await prof.isVisible('#navDashboard')));

  // Teclado: a seção abre com Enter no resumo.
  await p.locator('#dobraIndicadores > summary').focus(); await p.keyboard.press('Enter');
  confere('Enter abre Indicadores', await p.locator('#dobraIndicadores').evaluate(n => n.open));

  // Indicadores de agenda e clientes (D-028): só admin e gestão; a recepção não vê o painel.
  confere('recepção não vê o painel "Agenda e clientes"', !(await p.isVisible('#dbPilotoPanel')) && await p.locator('#dbPilotoPanel').evaluate(n => n.classList.contains('hidden')));
  const adm = await entrar(b, 'admin@dev.local');
  await adm.click('#navDashboard'); await adm.waitForTimeout(1500);
  await adm.click('#dobraIndicadores > summary'); await adm.waitForSelector('#dbPilotoPanel:not(.hidden)', { timeout: 8000 });
  const painel = (await adm.textContent('#dbPilotoWidget')).replace(/\s+/g, ' ');
  confere('admin vê taxa de cancelamento e fidelização no painel', /Taxa de cancelamento/.test(painel) && /Fidelização/.test(painel) && /Retorno do cliente novo/.test(painel), painel.slice(0, 160));
  console.log('ADMIN erros:', JSON.stringify(adm.errs)); if (adm.errs.length) falhas++;
  console.log('ERROS:', JSON.stringify(p.errs)); if (p.errs.length) falhas++;
  await b.close();
  if (falhas) process.exit(1);
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
