// E2E (Playwright/Chromium, 390×844) do D-088 sob a CSP de produção: "Comandas e estorno" do Painel com o
// mesmo seletor de período das Comandas.
// Comandas plantadas (dias relativos a hoje, no fuso do salão): hoje−2 e hoje−1 (uma cada) e hoje−10.
// Roteiro (admin):
//   1) atalhos Hoje, Ontem, Esta semana, Este mês, Mês anterior, Personalizado; o campo de data sumiu;
//      abrir a dobra consulta só hoje (?data=);
//   2) "Ontem" consulta ?data=hoje−1 e mostra a comanda daquele dia;
//   3) Personalizado: o primeiro toque (hoje−2) não consulta; o segundo (hoje−1) consulta ?inicio=&fim=;
//      2 comandas, cada uma com a data na frente; o resumo diz "· 2 dias";
//   4) dia futuro fica desligado no calendário.
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
const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const hoje = dia(0);

(async () => {
  const empresa = (await db('empresas'))[0];
  const cli = { id: randomUUID(), empresa_id: empresa.id, nome: 'Estorno Período', ativo: true };
  await plantar('clientes', [cli]);
  const com = (d, hora, v) => ({ id: randomUUID(), empresa_id: empresa.id, cliente_id: cli.id, data: d, hora, status: 'fechado', total_recebido_centavos: v, itens_liquidos_centavos: v });
  await plantar('comandos', [com(dia(-2), '10:00:00', 4000), com(dia(-1), '11:00:00', 3000), com(dia(-10), '09:00:00', 9000)]);

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
  await p.click('#navDashboard'); await p.waitForTimeout(600);
  await p.click('#dobraComandas > summary'); await p.waitForTimeout(1000);

  // 1) Atalhos e Hoje.
  const vis = await p.evaluate(() => ({ campo: !!document.getElementById('estornoData'), atalhos: [...document.querySelectorAll('#estornoPeriodo [data-atalho]')].map(b => b.textContent.trim()) }));
  confere('atalhos de período e sem o campo de data antigo', !vis.campo && vis.atalhos.join('|') === 'Hoje|Ontem|Esta semana|Este mês|Mês anterior|Personalizado', JSON.stringify(vis));
  confere('abrir consulta só hoje (?data=)', consultas[consultas.length - 1] === `?data=${hoje}`, JSON.stringify(consultas));

  // 2) Ontem.
  await p.click('#estornoPeriodo [data-atalho="ontem"]'); await p.waitForTimeout(900);
  confere('"Ontem" consulta o dia de ontem', consultas[consultas.length - 1] === `?data=${dia(-1)}`, JSON.stringify(consultas.slice(-1)));
  const ontem = await p.evaluate(() => [...document.querySelectorAll('#estornoLista .estorno-row')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  confere('mostra a comanda de ontem (sem a data na frente: é um dia só)', ontem.length === 1 && /Estorno Período/.test(ontem[0]) && !ontem[0].startsWith(ddmm(dia(-1))), JSON.stringify(ontem));

  // 3) Personalizado com dois toques.
  await p.click('#estornoPeriodo [data-atalho="pers"]'); await p.waitForTimeout(300);
  if (!(await p.locator(`#estornoPeriodo [data-dia="${dia(-2)}"]`).count())) { await p.click('#estornoPeriodo [data-cal-nav="-1"]'); await p.waitForTimeout(200); }
  const antes = consultas.length;
  await p.click(`#estornoPeriodo [data-dia="${dia(-2)}"]`); await p.waitForTimeout(500);
  confere('o primeiro toque não consulta (espera o último dia)', consultas.length === antes && /último dia/.test(await p.textContent('#estornoPeriodo .per-cal-dica')));
  if (!(await p.locator(`#estornoPeriodo [data-dia="${dia(-1)}"]`).count())) { await p.click('#estornoPeriodo [data-cal-nav="1"]'); await p.waitForTimeout(200); }
  await p.click(`#estornoPeriodo [data-dia="${dia(-1)}"]`); await p.waitForTimeout(1200);
  confere('o segundo toque consulta o intervalo (?inicio=&fim=)', consultas[consultas.length - 1] === `?inicio=${dia(-2)}&fim=${dia(-1)}`, JSON.stringify(consultas.slice(-1)));
  const linhas = await p.evaluate(() => [...document.querySelectorAll('#estornoLista .estorno-row')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  confere('2 comandas, cada uma com a data na frente', linhas.length === 2 && linhas.some(l => l.startsWith(ddmm(dia(-2)))) && linhas.some(l => l.startsWith(ddmm(dia(-1)))), JSON.stringify(linhas));
  const resumo = await p.textContent('#estornoPeriodo .per-resumo');
  confere('resumo do período com o número de dias', resumo.trim() === `${ddmm(dia(-2))} a ${ddmm(dia(-1))} · 2 dias`, resumo);

  // 4) Futuro desligado.
  const amanha = dia(1);
  if (amanha.slice(0, 7) === hoje.slice(0, 7)) {
    const off = await p.evaluate(d => { const x = document.querySelector(`#estornoPeriodo [data-dia="${d}"]`); return x ? x.disabled : null; }, amanha);
    confere('amanhã fica desligado no calendário', off === true, String(off));
  } else console.log('AMANHÃ: em outro mês, conferência pulada');

  await p.screenshot({ path: '/tmp/hopeos-estorno-periodo.png' });
  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
