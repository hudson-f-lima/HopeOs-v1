// E2E (Playwright/Chromium, 390×844) do D-088 sob a CSP de produção: Painel › Fechamento de caixa por período.
// Duas comandas de hoje pelo checkout de verdade (duas de Pix 60,00 (o seed só tem Pix)). Recepção.
// Roteiro:
//   1) começa em "Hoje": conferir e "Fechar caixa do dia" aparecem (como antes), sem consultar /caixa/periodo;
//   2) Personalizado de ontem a hoje (2 dias): consulta /caixa/periodo; aviso "só consulta"; fundo, contado e
//      Fechar somem; totais 2 comandas e R$ 120,00; o dia de hoje aparece "sem fechar";
//   3) volta para "Hoje": formulário e Fechar voltam; fechar grava o dia de hoje (POST com data = hoje);
//   4) período de novo: hoje aparece "fechado".
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const dia = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const hoje = dia(0); const ontem = dia(-1);
const texto = s => s.replace(/\s+/g, ' ').trim();

(async () => {
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const ana = (await db('profissionais')).find(p => p.nome === 'Ana');
  const c1 = await legado('/checkout/close', { idempotencyKey: 'e2e-cxp-1', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] });
  const c2 = await legado('/checkout/close', { idempotencyKey: 'e2e-cxp-2', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] });
  if (!c1.ok || !c2.ok) throw new Error('checkouts: ' + JSON.stringify([c1.error, c2.error]));

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const erros = []; const consultas = []; const gravacoes = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  p.on('request', r => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/caixa/') && r.method() === 'GET') consultas.push(u.pathname + u.search);
    if (u.pathname === '/api/caixa/fechamentos' && r.method() === 'POST') gravacoes.push(JSON.parse(r.postData() || '{}'));
  });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#navDashboard'); await p.waitForTimeout(500);
  await p.click('#dobraCaixa > summary'); await p.waitForTimeout(1000);
  const vis = () => p.evaluate(() => ({ form: !document.getElementById('caixaForm').classList.contains('hidden'), fechar: !document.getElementById('btnFecharCaixa').classList.contains('hidden'), aviso: !!document.getElementById('caixaAvisoPeriodo') }));

  // 1) Hoje.
  const v1 = await vis();
  confere('"Hoje": conferir e fechar aparecem, sem aviso de período', v1.form && v1.fechar && !v1.aviso, JSON.stringify(v1));
  confere('"Hoje" usa a conferência do dia (?data=hoje), não o período', consultas.some(c => c === `/api/caixa/fechamento?data=${hoje}`) && !consultas.some(c => c.startsWith('/api/caixa/periodo')), JSON.stringify(consultas));

  // 2) Ontem a hoje.
  await p.click('#caixaPeriodo [data-atalho="pers"]'); await p.waitForTimeout(300);
  if (!(await p.locator(`#caixaPeriodo [data-dia="${ontem}"]`).count())) { await p.click('#caixaPeriodo [data-cal-nav="-1"]'); await p.waitForTimeout(200); }
  await p.click(`#caixaPeriodo [data-dia="${ontem}"]`); await p.waitForTimeout(300);
  if (!(await p.locator(`#caixaPeriodo [data-dia="${hoje}"]`).count())) { await p.click('#caixaPeriodo [data-cal-nav="1"]'); await p.waitForTimeout(200); }
  await p.click(`#caixaPeriodo [data-dia="${hoje}"]`); await p.waitForTimeout(1200);
  confere('dois dias consultam /caixa/periodo', consultas[consultas.length - 1] === `/api/caixa/periodo?inicio=${ontem}&fim=${hoje}`, JSON.stringify(consultas.slice(-1)));
  const v2 = await vis();
  confere('período: aviso "só consulta"; fundo, contado e Fechar somem', !v2.form && !v2.fechar && v2.aviso, JSON.stringify(v2));
  const aviso = texto(await p.textContent('#caixaAvisoPeriodo'));
  confere('aviso diz o número de dias e como fechar', /Período de 2 dias: só consulta\. Para conferir a gaveta e fechar o caixa, escolha um dia\./.test(aviso), aviso);
  const tot = { qtd: await p.textContent('#caixaQtd'), saldo: texto(await p.textContent('#caixaSaldoPeriodo')) };
  confere('totais: 2 comandas e saldo R$ 120,00', tot.qtd.trim() === '2' && /R\$\s?120,00/.test(tot.saldo), JSON.stringify(tot));
  const linhaHoje = texto(await p.textContent(`#caixaResultado [data-dia-caixa="${hoje}"]`));
  confere('o dia de hoje aparece "sem fechar"', linhaHoje.startsWith(ddmm(hoje)) && /2 comandas · sem fechar/.test(linhaHoje), linhaHoje);
  confere('pendência resumida', /1 dia com venda sem fechar/.test(await p.textContent('#caixaPendencias')));

  // 3) Hoje de novo e fechar.
  await p.click('#caixaPeriodo [data-atalho="hoje"]'); await p.waitForTimeout(900);
  const v3 = await vis();
  confere('"Hoje" de novo: formulário e Fechar voltam', v3.form && v3.fechar && !v3.aviso, JSON.stringify(v3));
  await p.fill('#caixaContado', '0,00'); // sem dinheiro: a gaveta esperada é 0
  await p.click('#btnFecharCaixa'); await p.waitForSelector('#confirm-action-ok', { timeout: 5000 });
  await p.click('#confirm-action-ok'); await p.waitForTimeout(1200);
  confere('fechar grava o dia de hoje', gravacoes.length === 1 && gravacoes[0].data === hoje && gravacoes[0].contadoDinheiroCentavos === 0, JSON.stringify(gravacoes));

  // 4) Período de novo: hoje fechado.
  await p.click('#caixaPeriodo [data-atalho="pers"]'); await p.waitForTimeout(300);
  if (!(await p.locator(`#caixaPeriodo [data-dia="${ontem}"]`).count())) { await p.click('#caixaPeriodo [data-cal-nav="-1"]'); await p.waitForTimeout(200); }
  await p.click(`#caixaPeriodo [data-dia="${ontem}"]`); await p.waitForTimeout(300);
  if (!(await p.locator(`#caixaPeriodo [data-dia="${hoje}"]`).count())) { await p.click('#caixaPeriodo [data-cal-nav="1"]'); await p.waitForTimeout(200); }
  await p.click(`#caixaPeriodo [data-dia="${hoje}"]`); await p.waitForTimeout(1200);
  const linhaDepois = texto(await p.textContent(`#caixaResultado [data-dia-caixa="${hoje}"]`));
  confere('depois de fechar, hoje aparece fechado', /fechado/.test(linhaDepois) && !/sem fechar/.test(linhaDepois), linhaDepois);

  await p.screenshot({ path: '/tmp/hopeos-caixa-periodo.png' });
  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
