// E2E (Playwright/Chromium, 390×844) do D-081 sob a CSP de produção: alças de cima e de baixo, etiqueta de
// horário e passo do arraste por aparelho (cards 4b). Amanhã, Ana (escala 09:00–13:00), clientes novos:
//   q1 09:00 30 min — vizinho de cima (termina 09:30)
//   q2 10:00 60 min — o card que muda (fim 11:00)
//   q3 11:30 20 min — card curto: só a alça de baixo
// Roteiro (passo padrão 10 min = 30 px):
//   1) alça de cima 2 passos para cima: etiqueta "09:40–11:00 (80 min)"; solta → Ana 09:40 com 80 min,
//      numa remarcação só; "Desfazer" volta a 10:00 com 60 min;
//   2) alça de cima 6 passos: para no fim do vizinho, "09:30–11:00 (90 min)"; Esc cancela, nada muda;
//   3) alça de baixo 1 passo: "10:00–11:10 (70 min)" → duração 70;
//   4) card de 20 min não tem alça de cima;
//   5) arrastar mostra a etiqueta presa ao card ("início–fim (duração) · Ana"); Esc cancela;
//   6) passo 30 no aparelho: ↑ move 30 min; a escolha continua depois de recarregar.
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
const PX = 3;

(async () => {
  const empresa = (await db('empresas'))[0];
  const ana = (await db('profissionais')).find(x => x.nome === 'Ana');
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const cli = ['Alça Um', 'Alça Dois', 'Alça Três'].map(nome => ({ id: randomUUID(), empresa_id: empresa.id, nome, ativo: true }));
  await plantar('clientes', cli);
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const ag = (i, h, d) => ({ id: ids[i], empresa_id: empresa.id, profissional_id: ana.id, servico_id: corte.id, cliente_id: cli[i].id, data: amanha, horario: h, duracao_min: d, status: 'agendado', valor_centavos: 6000 });
  await plantar('agendamentos', [ag(0, '09:00:00', 30), ag(1, '10:00:00', 60), ag(2, '11:30:00', 20)]);
  const ativo = async c => (await db('agendamentos')).filter(a => a.cliente_id === c.id && ['agendado', 'confirmado'].includes(a.status)).map(a => `${String(a.horario).slice(0, 5)}/${a.duracao_min}`);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const abrirDia = async () => {
    await p.click('#navAgenda'); await p.waitForTimeout(500);
    for (let i = 0; i < 2 && !(await p.locator(`[data-day="${amanha}"]`).count()); i++) { await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800); }
    await p.locator(`[data-day="${amanha}"]`).first().click(); await p.waitForTimeout(900);
  };
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await abrirDia();

  const idDe = async c => {
    const lista = (await db('agendamentos')).filter(a => a.cliente_id === c.id && ['agendado', 'confirmado'].includes(a.status));
    await p.waitForSelector(`.ag-card[data-ag-id="${lista[0].id}"]`, { timeout: 10000 });
    return lista[0].id;
  };
  const alca = (id, modo) => p.evaluate(([id, modo]) => {
    const card = document.querySelector(`.ag-card[data-ag-id="${id}"]`); card.scrollIntoView({ block: 'center' });
    const h = card.querySelector(`.resize-handle[data-modo="${modo}"]`); if (!h) return null;
    const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [id, modo]);
  const dica = () => p.evaluate(() => { const t = document.querySelector('.resize-tooltip'); return t ? t.textContent.trim() : null; });
  async function puxar(id, modo, passos, { soltar = true, esc = false } = {}) {
    const o = await alca(id, modo);
    await p.mouse.move(o.x, o.y); await p.mouse.down();
    await p.mouse.move(o.x, o.y + passos * 10 * PX, { steps: 6 }); await p.waitForTimeout(150);
    const txt = await dica();
    if (esc) await p.keyboard.press('Escape');
    if (soltar) { await p.mouse.up(); await p.waitForTimeout(1300); }
    return txt;
  }

  // 1) Alça de cima: início muda, fim parado; desfazer.
  let id2 = await idDe(cli[1]);
  const t1 = await puxar(id2, 'inicio', -2);
  console.log('ALÇA DE CIMA:', t1, '→', JSON.stringify(await ativo(cli[1])));
  confere('etiqueta da alça de cima: "09:40–11:00 (80 min)"', t1 === '09:40–11:00 (80 min)', String(t1));
  confere('soltar remarca para 09:40 com 80 min (fim parado)', JSON.stringify(await ativo(cli[1])) === JSON.stringify(['09:40/80']), JSON.stringify(await ativo(cli[1])));
  const desfazer = p.locator('.toast .toast-action-btn', { hasText: 'Desfazer' });
  confere('aviso com "Desfazer"', await desfazer.count() === 1);
  await desfazer.click(); await p.waitForTimeout(1300);
  confere('desfazer volta para 10:00 com 60 min', JSON.stringify(await ativo(cli[1])) === JSON.stringify(['10:00/60']), JSON.stringify(await ativo(cli[1])));

  // 2) Alça de cima para no fim do vizinho; Esc cancela.
  id2 = await idDe(cli[1]);
  const t2 = await puxar(id2, 'inicio', -6, { esc: true });
  confere('alça de cima para no fim do vizinho: "09:30–11:00 (90 min)"', t2 === '09:30–11:00 (90 min)', String(t2));
  confere('Esc cancela: nada muda', JSON.stringify(await ativo(cli[1])) === JSON.stringify(['10:00/60']), JSON.stringify(await ativo(cli[1])));

  // 3) Alça de baixo: fim muda, início parado.
  id2 = await idDe(cli[1]);
  const t3 = await puxar(id2, 'fim', 1);
  confere('etiqueta da alça de baixo: "10:00–11:10 (70 min)"', t3 === '10:00–11:10 (70 min)', String(t3));
  confere('soltar grava 70 min', JSON.stringify(await ativo(cli[1])) === JSON.stringify(['10:00/70']), JSON.stringify(await ativo(cli[1])));

  // 4) Card de 20 min: só a alça de baixo.
  const id3 = await idDe(cli[2]);
  confere('card de 20 min não tem alça de cima', (await alca(id3, 'inicio')) === null && (await alca(id3, 'fim')) !== null);

  // 5) Arraste: etiqueta presa ao card; Esc cancela.
  id2 = await idDe(cli[1]);
  const c = await p.evaluate(id => { const el = document.querySelector(`.ag-card[data-ag-id="${id}"]`); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id2);
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x, c.y + 30, { steps: 6 }); await p.waitForTimeout(150);
  const rot = await p.evaluate(() => { const r = document.querySelector('.ag-arraste-rot'); return r ? r.textContent.trim() : null; });
  confere('arraste mostra a etiqueta presa ao card', rot === '10:10–11:20 (70 min) · Ana', String(rot));
  await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(900);
  const sobrou = await p.evaluate(() => !!document.querySelector('.ag-arraste-rot, .ag-clone, .drag-highlight'));
  confere('Esc cancela o arraste: nada muda e a etiqueta some', !sobrou && JSON.stringify(await ativo(cli[1])) === JSON.stringify(['10:00/70']), JSON.stringify(await ativo(cli[1])));

  // 6) Passo do aparelho: 30 min; continua depois de recarregar.
  // D-083: o passo mora na Gestão ("Como a agenda aparece"); o (i) da agenda leva até lá.
  await p.click('#btnAgInfo').catch(() => {}); await p.waitForTimeout(300);
  await p.click('#btnAgAparencia'); await p.waitForSelector('#subtab-aparencia:not(.hidden)');
  await p.selectOption('#agPasso', '30'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await abrirDia();
  const lembrado = await p.inputValue('#agPasso');
  confere('a escolha do passo continua depois de recarregar', lembrado === '30', lembrado);
  id2 = await idDe(cli[1]);
  // ↓ levaria a 10:30–11:40, sobre o card das 11:30 (nada muda); ↑ leva a 09:30–10:40, livre.
  await p.focus(`.ag-card[data-ag-id="${id2}"]`); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(1500);
  confere('com passo 30, ↑ move 30 min (09:30)', JSON.stringify(await ativo(cli[1])) === JSON.stringify(['09:30/70']), JSON.stringify(await ativo(cli[1])));

  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
