// E2E (Playwright/Chromium, 390×844) do D-082 sob a CSP de produção: histórico de comandas por período.
// Comandas plantadas (dias relativos a hoje, no fuso do salão):
//   hoje−2: 4000 e 6000 · hoje−1: 3000 · hoje−10: 9000 (fora do personalizado)
// Roteiro (admin, que vê o histórico):
//   1) no histórico, os atalhos aparecem e o campo de data some; "Hoje" consulta só o dia (?data=);
//   2) "Personalizado" + dois toques (hoje−2 e hoje−1) → 3 comandas, "Recebido R$ 130,00", agrupadas em 2 dias,
//      consulta com ?inicio=&fim=;
//   3) abrir uma comanda e voltar mantém o período sem consultar de novo;
//   4) o primeiro toque sozinho não consulta nada (espera o segundo);
//   5) na fila da agenda, o campo de data volta e os atalhos somem.
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const plantar = async (t, linhas) => {
  const r = await fetch(`${API}/__db/${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(linhas) });
  if (!r.ok) throw new Error(`não plantou ${t}: ${r.status}`);
};
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const dia = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const hoje = dia(0);

(async () => {
  const empresa = (await db('empresas'))[0];
  const cli = { id: randomUUID(), empresa_id: empresa.id, nome: 'Período Teste', ativo: true };
  await plantar('clientes', [cli]);
  const com = (d, hora, v) => ({ id: randomUUID(), empresa_id: empresa.id, cliente_id: cli.id, data: d, hora, status: 'fechado', total_recebido_centavos: v, itens_liquidos_centavos: v });
  await plantar('comandos', [com(dia(-2), '10:00:00', 4000), com(dia(-2), '15:00:00', 6000), com(dia(-1), '11:00:00', 3000), com(dia(-10), '09:00:00', 9000)]);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const erros = []; const consultas = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  p.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/api/comandas' && r.method() === 'GET') consultas.push(u.search); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'admin@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await p.click('#navCheckout'); await p.waitForTimeout(600);
  await p.click('#btnComandasHistorico'); await p.waitForTimeout(900);

  // 1) Atalhos no histórico; "Hoje" = um dia.
  const vis = await p.evaluate(() => ({ periodo: !document.getElementById('comandasPeriodo').classList.contains('hidden'), dataCampo: !document.getElementById('comandasDataCampo').classList.contains('hidden'), atalhos: [...document.querySelectorAll('#comandasPeriodo [data-atalho]')].map(b => b.textContent.trim()) }));
  confere('histórico mostra os atalhos e esconde o campo de data', vis.periodo && !vis.dataCampo && vis.atalhos.join('|') === 'Hoje|Ontem|Esta semana|Este mês|Mês anterior|Personalizado', JSON.stringify(vis));
  confere('"Hoje" consulta só o dia (?data=)', consultas[consultas.length - 1] === `?data=${hoje}`, JSON.stringify(consultas));

  // 4) e 2) Personalizado com dois toques.
  await p.click('#comandasPeriodo [data-atalho="pers"]'); await p.waitForTimeout(300);
  const antes = consultas.length;
  await p.click(`#comandasPeriodo [data-dia="${dia(-2)}"]`); await p.waitForTimeout(400);
  confere('o primeiro toque sozinho não consulta (espera o último dia)', consultas.length === antes && /último dia/.test(await p.textContent('.per-cal-dica')));
  await p.click(`#comandasPeriodo [data-dia="${dia(-1)}"]`); await p.waitForTimeout(1200);
  confere('dois toques consultam o intervalo (?inicio=&fim=)', consultas[consultas.length - 1] === `?inicio=${dia(-2)}&fim=${dia(-1)}`, JSON.stringify(consultas.slice(-1)));
  const res = await p.evaluate(() => ({ resumo: document.getElementById('comandasResumo').textContent.trim(), dias: [...document.querySelectorAll('#comandasRegistros .comandas-dia')].map(x => x.textContent.trim()), linhas: document.querySelectorAll('#comandasRegistros .comandas-registro').length }));
  console.log('PERÍODO:', JSON.stringify(res));
  confere('resumo do período: 3 comandas, recebido R$ 130,00', /^3 comandas · .* · Recebido R\$\s?130,00$/.test(res.resumo), res.resumo);
  confere('lista agrupada em 2 dias, 3 linhas', res.dias.length === 2 && res.linhas === 3, JSON.stringify(res.dias));

  // 3) Detalhe e voltar mantém o período sem nova consulta.
  const n = consultas.length;
  await p.click('#comandasRegistros .comandas-registro'); await p.waitForTimeout(500);
  await p.click('#btnVoltarComandas'); await p.waitForTimeout(800);
  const depois = await p.evaluate(() => document.getElementById('comandasResumo').textContent.trim());
  confere('voltar do detalhe mantém o período sem consultar de novo', consultas.length === n && depois === res.resumo, `${consultas.length - n} consultas · ${depois}`);

  // 5) Fila da agenda: campo de data de volta.
  await p.click('#btnComandasAgenda'); await p.waitForTimeout(800);
  const ag = await p.evaluate(() => ({ periodo: !document.getElementById('comandasPeriodo').classList.contains('hidden'), dataCampo: !document.getElementById('comandasDataCampo').classList.contains('hidden'), resumo: !document.getElementById('comandasResumo').classList.contains('hidden') }));
  confere('na fila da agenda, o campo de data volta e os atalhos e o resumo somem', !ag.periodo && ag.dataCampo && !ag.resumo, JSON.stringify(ag));

  await p.screenshot({ path: '/tmp/hopeos-comandas-periodo.png' });
  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
