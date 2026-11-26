// E2E (Playwright/Chromium, 390×844) do D-083 sob a CSP de produção: Gestão agrupada por intenção e
// "Como a agenda aparece" (zoom e passo do arraste por aparelho).
// Roteiro:
//   1) admin: os 8 grupos na ordem nova; a busca acha pelos nomes antigos ("financeiro" → Formas de
//      pagamento; "buffer" → Regras da agenda);
//   2) recepção: card de 30 min mede 90 px no zoom normal; Gestão → Zoom compacto → 60 px; continua
//      compacto depois de recarregar; o (i) da agenda leva à mesma tela;
//   3) profissional também vê "Como a agenda aparece" (é escolha do aparelho, não do salão).
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
const GRUPOS = ['Como o salão funciona', 'Como a agenda aparece', 'Clientes que agendam sozinhos', 'Equipe', 'O que o salão vende', 'Clientes', 'Dinheiro', 'Primeiros passos'];

(async () => {
  const empresa = (await db('empresas'))[0];
  const ana = (await db('profissionais')).find(x => x.nome === 'Ana');
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const cli = { id: randomUUID(), empresa_id: empresa.id, nome: 'Zoom Teste', ativo: true };
  await plantar('clientes', [cli]);
  const agId = randomUUID();
  await plantar('agendamentos', [{ id: agId, empresa_id: empresa.id, profissional_id: ana.id, servico_id: corte.id, cliente_id: cli.id, data: amanha, horario: '10:00:00', duracao_min: 30, status: 'agendado', valor_centavos: 6000 }]);

  const b = await chromium.launch();
  const erros = [];
  const entrar = async email => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message));
    p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
    await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
    await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
    return p;
  };
  const visiveis = p => p.evaluate(() => [...document.querySelectorAll('#subtabRow .gestao-grupo')].filter(g => !g.hidden && g.getClientRects().length).map(g => g.querySelector('h3').textContent.trim()));
  const atalhosVisiveis = p => p.evaluate(() => [...document.querySelectorAll('#subtabRow .gestao-atalho')].filter(x => x.getClientRects().length).map(x => x.textContent.trim()));

  // 1) Admin: grupos e busca pelos nomes antigos.
  const a = await entrar('admin@dev.local');
  await a.click('#navGestao'); await a.waitForTimeout(400);
  const grupos = await visiveis(a);
  confere('admin vê os 8 grupos por intenção, na ordem', JSON.stringify(grupos) === JSON.stringify(GRUPOS), JSON.stringify(grupos));
  await a.fill('#buscaGestao', 'financeiro'); await a.waitForTimeout(200);
  const fin = await atalhosVisiveis(a);
  confere('"financeiro" (nome antigo) acha Formas de pagamento e Regras de comissão', fin.includes('Formas de pagamento') && fin.includes('Regras de comissão'), JSON.stringify(fin));
  await a.fill('#buscaGestao', 'buffer'); await a.waitForTimeout(200);
  const buf = await atalhosVisiveis(a);
  confere('"buffer" acha Regras da agenda', JSON.stringify(buf) === JSON.stringify(['Regras da agenda']), JSON.stringify(buf));
  await a.fill('#buscaGestao', 'zoom'); await a.waitForTimeout(200);
  confere('"zoom" acha o atalho novo', JSON.stringify(await atalhosVisiveis(a)) === JSON.stringify(['Zoom e passo do arraste']));
  const cspA = await a.evaluate(() => window.__csp);

  // 2) Recepção: zoom muda a altura do card e fica no aparelho.
  const p = await entrar('recepcao@dev.local');
  const abrirDia = async () => {
    await p.click('#navAgenda'); await p.waitForTimeout(500);
    for (let i = 0; i < 2 && !(await p.locator(`[data-day="${amanha}"]`).count()); i++) { await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800); }
    await p.locator(`[data-day="${amanha}"]`).first().click(); await p.waitForTimeout(900);
    await p.waitForSelector(`.ag-card[data-ag-id="${agId}"]`, { timeout: 10000 });
  };
  const altura = () => p.evaluate(id => Math.round(document.querySelector(`.ag-card[data-ag-id="${id}"]`).getBoundingClientRect().height), agId);
  await abrirDia();
  const h0 = await altura();
  confere('zoom normal: card de 30 min com 90 px (±2)', Math.abs(h0 - 90) <= 2, String(h0));
  await p.click('#navGestao'); await p.waitForTimeout(300);
  await p.click('#subtabBtnAparencia'); await p.waitForSelector('#subtab-aparencia:not(.hidden)');
  confere('a tela diz que vale só neste aparelho', /Só neste aparelho/.test(await p.textContent('#subtab-aparencia')));
  confere('o passo padrão continua 10 min', (await p.inputValue('#agPasso')) === '10');
  await p.selectOption('#agZoom', 'compacto'); await p.waitForTimeout(300);
  await p.click('#btnFecharGestao'); await p.waitForTimeout(300);
  await abrirDia();
  const h1 = await altura();
  confere('zoom compacto: o mesmo card com 60 px (±2)', Math.abs(h1 - 60) <= 2, String(h1));
  await p.reload(); await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await abrirDia();
  const h2 = await altura();
  confere('depois de recarregar continua compacto', Math.abs(h2 - 60) <= 2, String(h2));
  await p.click('#btnAgInfo'); await p.waitForTimeout(300);
  await p.click('#btnAgAparencia'); await p.waitForSelector('#subtab-aparencia:not(.hidden)');
  confere('o (i) da agenda leva a "Zoom e passo do arraste" com a escolha atual', (await p.inputValue('#agZoom')) === 'compacto');
  await p.screenshot({ path: '/tmp/hopeos-gestao-aparencia.png' });
  const cspP = await p.evaluate(() => window.__csp);

  // 3) Profissional também escolhe no aparelho dele.
  const pr = await entrar('profissional@dev.local');
  await pr.click('#navGestao'); await pr.waitForTimeout(400);
  confere('profissional vê "Como a agenda aparece"', (await visiveis(pr)).includes('Como a agenda aparece'));
  const cspPr = await pr.evaluate(() => window.__csp);

  const csp = [...cspA, ...cspP, ...cspPr];
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
