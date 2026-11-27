// E2E (Playwright/Chromium, 390×844) do D-085 sob a CSP de produção: atendimentos ao mesmo tempo lado a lado.
// Amanhã, clientes novos:
//   Ana:   J 09:20 40 · M 10:00 40 · E 10:00 60 · D 10:40 40 · S1 12:00 10 · S2 12:10 30
//   Bruno: A 09:00 60 · B 09:10 30 · C 09:20 30   (três ao mesmo tempo)
// Esperado:
//   1) J sozinho ocupa a coluna; M e E dividem ao meio, sem se cobrir; D fica na faixa de M (M já terminou);
//   2) S1 e S2 são seguidos (não ao mesmo tempo): largura inteira;
//   3) três ao mesmo tempo: um terço cada, sem se cobrir; o card mostra iniciais e o nome inteiro fica no rótulo;
//   4) arrastar o card de metade de M para 11:20 grava 11:20 (o alvo é pela coluna e pela altura); lá, sem
//      ninguém ao mesmo tempo, M fica com a largura inteira e E continua dividindo com D.
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
const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

(async () => {
  const empresa = (await db('empresas'))[0];
  const profs = await db('profissionais');
  const ana = profs.find(x => x.nome === 'Ana'); const bruno = profs.find(x => x.nome === 'Bruno');
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const nomes = { J: 'Jorge Lado', M: 'Marcos Lado', E: 'Eduardo Lado', D: 'Daniel Lado', S1: 'Seguido Um', S2: 'Seguido Dois', A: 'Ana Paula Três', B: 'Bia Três', C: 'Caio Três' };
  const cli = Object.fromEntries(Object.entries(nomes).map(([k, nome]) => [k, { id: randomUUID(), empresa_id: empresa.id, nome, ativo: true }]));
  await plantar('clientes', Object.values(cli));
  const id = {};
  const ag = (k, prof, h, d) => { id[k] = randomUUID(); return { id: id[k], empresa_id: empresa.id, profissional_id: prof.id, servico_id: corte.id, cliente_id: cli[k].id, data: amanha, horario: h + ':00', duracao_min: d, status: 'agendado', valor_centavos: 6000 }; };
  await plantar('agendamentos', [ag('J', ana, '09:20', 40), ag('M', ana, '10:00', 40), ag('E', ana, '10:00', 60), ag('D', ana, '10:40', 40), ag('S1', ana, '12:00', 10), ag('S2', ana, '12:10', 30),
    ag('A', bruno, '09:00', 60), ag('B', bruno, '09:10', 30), ag('C', bruno, '09:20', 30)]);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  const abrirDia = async () => {
    await p.click('#navAgenda'); await p.waitForTimeout(500);
    for (let i = 0; i < 2 && !(await p.locator(`[data-day="${amanha}"]`).count()); i++) { await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800); }
    await p.locator(`[data-day="${amanha}"]`).first().click(); await p.waitForTimeout(900);
    await p.waitForSelector(`.ag-card[data-ag-id="${id.J}"]`, { timeout: 10000 });
  };
  await abrirDia();
  const caixa = async k => p.evaluate(x => { const el = document.querySelector(`.ag-card[data-ag-id="${x}"]`); const r = el.getBoundingClientRect(); const c = el.closest('.agenda-grid-col').getBoundingClientRect(); return { l: r.left - c.left, w: r.width, cw: c.width, txt: el.querySelector('.ag-n').textContent, aria: el.getAttribute('aria-label') }; }, id[k]);
  const c = {}; for (const k of Object.keys(nomes)) c[k] = await caixa(k);
  const perto = (a, b, tol = 3) => Math.abs(a - b) <= tol;
  const naoCobre = (x, y) => x.l + x.w <= y.l + 0.5 || y.l + y.w <= x.l + 0.5;
  console.log('CAIXAS:', JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [Math.round(v.l), Math.round(v.w)]]))), 'coluna', Math.round(c.J.cw));

  // 1) Ana.
  confere('J sozinho: largura inteira da coluna', perto(c.J.w, c.J.cw - 8), `${c.J.w} de ${c.J.cw}`);
  confere('M e E ao mesmo tempo: metade cada, sem se cobrir', perto(c.M.w, (c.M.cw - 8) / 2 - 2) && perto(c.E.w, c.M.w) && naoCobre(c.M, c.E), JSON.stringify([c.M, c.E].map(x => [x.l, x.w])));
  confere('D (10:40) fica na faixa de M, que já terminou, e não cobre E', perto(c.D.l, c.M.l) && naoCobre(c.D, c.E));
  // 2) Seguidos.
  confere('S1 e S2 seguidos (12:00–12:10 e 12:10): largura inteira', perto(c.S1.w, c.S1.cw - 8) && perto(c.S2.w, c.S2.cw - 8), `${c.S1.w} / ${c.S2.w}`);
  // 3) Três ao mesmo tempo.
  const tres = [c.A, c.B, c.C];
  confere('três ao mesmo tempo: um terço cada, sem se cobrir', tres.every(x => perto(x.w, (x.cw - 8) / 3 - 2)) && naoCobre(c.A, c.B) && naoCobre(c.B, c.C) && naoCobre(c.A, c.C), JSON.stringify(tres.map(x => [x.l, x.w])));
  confere('card estreito mostra as iniciais; o rótulo tem o nome inteiro', c.A.txt === 'AP' && c.A.aria.includes('Ana Paula Três'), `${c.A.txt} | ${c.A.aria}`);
  confere('card de metade mostra o nome inteiro', c.M.txt === 'Marcos Lado', c.M.txt);

  // 4) Arrastar o card estreito de M para 11:20 (mesma coluna).
  const pos = await p.evaluate(x => {
    const el = document.querySelector(`.ag-card[data-ag-id="${x}"]`); el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const marca = [...document.querySelectorAll('.ruler-mark')].find(m => m.textContent.trim() === '11:20');
    return { x: r.left + r.width / 2, y: r.top + 20, topo: r.top, alvo: marca.getBoundingClientRect().top + window.scrollY };
  }, id.M);
  await p.mouse.move(pos.x, pos.y); await p.mouse.down();
  await p.mouse.move(pos.x, pos.y + 40, { steps: 5 });
  const alvoY = await p.evaluate(() => { const m = [...document.querySelectorAll('.ruler-mark')].find(x => x.textContent.trim() === '11:20'); return m.getBoundingClientRect().top; });
  await p.mouse.move(pos.x, alvoY + (pos.y - pos.topo) + 1, { steps: 12 }); await p.waitForTimeout(200);
  await p.mouse.up(); await p.waitForTimeout(1500);
  const mDepois = (await db('agendamentos')).filter(a => a.cliente_id === cli.M.id && ['agendado', 'confirmado'].includes(a.status)).map(a => String(a.horario).slice(0, 5));
  confere('arrastar o card de metade para 11:20 grava 11:20', JSON.stringify(mDepois) === '["11:20"]', JSON.stringify(mDepois));
  await p.waitForTimeout(500);
  // Remarcar cria um agendamento novo (o antigo fica "reagendado"): o card de M tem outro id.
  id.M = (await db('agendamentos')).find(a => a.cliente_id === cli.M.id && ['agendado', 'confirmado'].includes(a.status)).id;
  await p.waitForSelector(`.ag-card[data-ag-id="${id.M}"]`, { timeout: 8000 });
  const [eDepois, mNovo] = [await caixa('E'), await caixa('M')];
  confere('E continua dividindo com D (10:40–11:00 se cruzam)', perto(eDepois.w, (eDepois.cw - 8) / 2 - 2), `${eDepois.w} de ${eDepois.cw}`);
  confere('M em 11:20 (ninguém ao mesmo tempo): largura inteira', perto(mNovo.w, mNovo.cw - 8), `${mNovo.w} de ${mNovo.cw}`);

  await p.screenshot({ path: '/tmp/hopeos-agenda-lado-a-lado.png' });
  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
