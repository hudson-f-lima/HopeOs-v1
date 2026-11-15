// E2E (Playwright/Chromium): caixa com fundo, sangria/suprimento e fechamento salvo
// (recepção) + saldo de comissão com vale, estorno e pagamento acima do saldo (admin),
// e visão só de leitura do profissional. Migration 010 (D-017), sob a CSP de produção.
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };

async function entrar(b, email, esperados = []) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { const rota = `${r.status()} ${new URL(r.url()).pathname}`; if (r.status() >= 400 && !esperados.includes(rota)) p.erros.push(rota); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
const num = async (p, sel, attr) => Number(await p.getAttribute(sel, attr));

(async () => {
  await legado('/formas-pagamento', { code: 'dinheiro', label: 'Dinheiro' });
  const servicos = await db('servicos'); const profs = await db('profissionais');
  const barba = servicos.find(s => s.nome === 'Barba'); const ana = profs.find(p => p.nome === 'Ana');
  // Barba 40,00 + gorjeta 10,00, tudo em dinheiro → 50,00 na gaveta; ganho da Ana = gorjeta líquida.
  const c1 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-fo-1', itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'dinheiro', valorCentavos: 5000 }], gorjetaCentavos: 1000 });
  confere('checkout do seed', c1.ok, JSON.stringify(c1.error));
  const ganhoAna = (await db('comando_itens')).filter(i => i.profissional_id === ana.id).reduce((s, i) => s + i.comissao_centavos, 0) + (await db('comando_gorjetas')).filter(g => g.profissional_id === ana.id).reduce((s, g) => s + g.valor_liquido_centavos, 0);

  const b = await chromium.launch();

  // ---- Recepção: caixa ----
  const r = await entrar(b, 'recepcao@dev.local');
  await r.click('#navDashboard'); for (const d of await r.locator('#tab-dashboard summary:visible').all()) await d.click(); /* abre as seções recolhidas */ await r.waitForSelector('#caixaEsperado');
  confere('caixa: esperado inicial = vendas em dinheiro', await num(r, '#caixaEsperado', 'data-esperado') === 5000);
  confere('caixa: dia ainda não fechado', await r.getAttribute('#caixaStatusFechamento', 'data-fechado') === '0');
  await r.selectOption('#caixaAjusteTipo', 'suprimento'); await r.fill('#caixaAjusteValor', '20,00'); await r.fill('#caixaAjusteMotivo', 'Troco do banco');
  await r.click('#btnLancarAjuste'); await r.waitForSelector('[data-ajuste="suprimento"]');
  await r.fill('#caixaFundo', '100,00'); await r.fill('#caixaContado', '170,00'); await r.click('#btnConferirCaixa'); await r.waitForSelector('#caixaDiferenca');
  confere('caixa: fundo 100 + vendas 50 + suprimento 20 = 170', await num(r, '#caixaEsperado', 'data-esperado') === 17000);
  confere('caixa: conferência confere', await r.getAttribute('#caixaDiferenca', 'data-diferenca') === '0');
  await r.click('#btnFecharCaixa'); await r.click('#confirm-action-ok'); await r.waitForSelector('#caixaStatusFechamento[data-fechado="1"]');
  const fechamentos = await db('caixa_fechamentos');
  confere('caixa: fechamento gravado com esperado do servidor e autor', fechamentos.length === 1 && fechamentos[0].esperado_dinheiro_centavos === 17000 && fechamentos[0].diferenca_centavos === 0 && Boolean(fechamentos[0].actor_id), JSON.stringify(fechamentos.map(f => [f.esperado_dinheiro_centavos, f.diferenca_centavos])));
  confere('caixa: status "fechado" sem aviso', await r.getAttribute('#caixaStatusFechamento', 'data-desatualizado') === '0');
  await r.selectOption('#caixaAjusteTipo', 'sangria'); await r.fill('#caixaAjusteValor', '30,00'); await r.fill('#caixaAjusteMotivo', 'Depósito');
  await r.click('#btnLancarAjuste'); await r.waitForSelector('#caixaStatusFechamento[data-desatualizado="1"]');
  confere('caixa: sangria depois do fechamento avisa "feche de novo"', /feche de novo/.test(await r.textContent('#caixaStatusFechamento')));
  await r.fill('#caixaAjusteValor', ''); await r.click('#btnLancarAjuste');
  confere('caixa: ajuste sem valor é barrado na tela', /Informe o valor/.test(await r.textContent('#caixaAjusteMsg')) && (await db('caixa_ajustes')).length === 2);
  await r.locator('#cardCaixa').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-finops-caixa.png') });
  console.log('RECEPCAO erros:', JSON.stringify(r.erros));

  // ---- Admin: comissão ----
  const a = await entrar(b, 'admin@dev.local', ['422 /api/comissoes/pagamentos']);
  await a.click('#navMetas'); await a.waitForSelector('#tab-metas:not(.hidden)');
  await a.selectOption('#ganhosProfissional', ana.id); await a.waitForSelector('#ganhosSaldoValor');
  confere('comissão: saldo inicial = ganho', await num(a, '#ganhosSaldoValor', 'data-saldo') === ganhoAna && ganhoAna > 0, `tela × banco ${ganhoAna}`);
  await a.selectOption('#ganhosPagarTipo', 'vale'); await a.fill('#ganhosPagarValor', '5,00'); await a.fill('#ganhosPagarObs', 'Adiantamento');
  await a.click('#btnGanhosPagar'); await a.click('#confirm-action-ok'); await a.waitForSelector('[data-tipo="vale"]');
  confere('comissão: vale reduz o saldo', await num(a, '#ganhosSaldoValor', 'data-saldo') === ganhoAna - 500);
  await a.click('[data-estornar-pagamento]'); await a.click('#confirm-action-ok'); await a.waitForSelector('[data-tipo="estorno"]');
  confere('comissão: estorno devolve o saldo e some o botão do lançamento estornado', await num(a, '#ganhosSaldoValor', 'data-saldo') === ganhoAna && await a.locator('[data-estornar-pagamento]').count() === 0);
  await a.selectOption('#ganhosPagarTipo', 'pagamento'); await a.fill('#ganhosPagarValor', '999,00');
  await a.click('#btnGanhosPagar'); await a.click('#confirm-action-ok'); await a.waitForFunction(() => /maior que o saldo/.test(document.getElementById('ganhosPagarMsg').textContent));
  confere('comissão: pagamento acima do saldo é recusado com mensagem', (await db('comissao_pagamentos')).length === 2);
  await a.fill('#ganhosPagarValor', '10,00'); await a.click('#btnGanhosPagar'); await a.click('#confirm-action-ok');
  await a.waitForFunction(v => Number(document.getElementById('ganhosSaldoValor')?.dataset.saldo) === v, ganhoAna - 1000);
  const pagos = await db('comissao_pagamentos');
  confere('comissão: pagamento gravado com autor e mês de referência', pagos.length === 3 && pagos[2].tipo === 'pagamento' && pagos[2].valor_centavos === 1000 && Boolean(pagos[2].actor_id) && pagos[2].referencia_mes === hojeSP.slice(0, 7));
  await a.locator('#tab-metas').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-finops-comissao.png') });
  console.log('ADMIN erros:', JSON.stringify(a.erros));

  // ---- Profissional: só leitura ----
  const p = await entrar(b, 'profissional@dev.local');
  await p.click('#navMetas'); await p.waitForSelector('#ganhosSaldoValor');
  confere('profissional: vê o próprio saldo', await num(p, '#ganhosSaldoValor', 'data-saldo') === ganhoAna - 1000);
  confere('profissional: sem formulário de pagamento nem botão de estorno', !(await p.isVisible('#ganhosPagarForm')) && await p.locator('[data-estornar-pagamento]').count() === 0);
  console.log('PROFISSIONAL erros:', JSON.stringify(p.erros));

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})();
