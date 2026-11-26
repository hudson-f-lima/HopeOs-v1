// E2E (Playwright/Chromium, 390×844) do D-078 sob a CSP de produção: arraste da agenda (cards etapa 3).
// Plantados para amanhã (escala do seed: 09:00–13:00), com clientes novos:
//   m1 Ana   09:00 30 min — o card que se move
//   m2 Bruno 10:00 30 min — ocupa o horário (cliente "Ocupante Teste")
//   m3 Ana   11:00 30 min — concluído pelo caixa (pago): não se arrasta
// Roteiro:
//   1) tocar sem arrastar abre o card (o arraste não rouba o clique);
//   2) arrastar pelo meio do card (sem alça) até Bruno 09:00: prévia "09:00–09:30 · Bruno" (livre);
//      solta → grava; aviso com "Desfazer" → volta para Ana 09:00 (outra remarcação no servidor);
//   3) arrastar até Bruno 10:00 (ocupado): prévia vermelha com "Ocupado: Ocupante Teste"; solta → nada muda;
//   4) arrastar até 08:00 (fora da escala): prévia âmbar; volta ao lugar e solta → nada muda;
//   5) teclado: foco no card e ↓ → Ana 09:10 (passo padrão de 10 min, D-081), e o foco fica no card novo;
//   6) card pago: apertar e mover não arrasta;
//   7) segurar perto da borda de baixo rola a grade.
// Cada passo confere o banco de teste (/__db/agendamentos).
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
const espera = ms => new Promise(r => setTimeout(r, ms));

async function irPara(p, data) {
  await p.click('#navAgenda'); await p.waitForTimeout(500);
  for (let i = 0; i < 2; i++) {
    const d = p.locator(`[data-day="${data}"]`);
    if (await d.count()) { await d.first().click(); await p.waitForTimeout(900); return; }
    await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800);
  }
}

(async () => {
  const empresa = (await db('empresas'))[0];
  const profs = await db('profissionais');
  const ana = profs.find(x => x.nome === 'Ana'); const bruno = profs.find(x => x.nome === 'Bruno');
  const barba = (await db('servicos')).find(s => s.nome === 'Barba');
  const cli = ['Movida Teste', 'Ocupante Teste', 'Paga Teste'].map(nome => ({ id: randomUUID(), empresa_id: empresa.id, nome, ativo: true }));
  await plantar('clientes', cli);
  const [m1, m2, m3] = [randomUUID(), randomUUID(), randomUUID()];
  const ag = (id, c, prof, horario, status) => ({ id, empresa_id: empresa.id, profissional_id: prof.id, servico_id: barba.id, cliente_id: c.id, data: amanha, horario, duracao_min: 30, status, valor_centavos: 4000 });
  await plantar('agendamentos', [ag(m1, cli[0], ana, '09:00:00', 'agendado'), ag(m2, cli[1], bruno, '10:00:00', 'agendado'), ag(m3, cli[2], ana, '11:00:00', 'concluido')]);
  await plantar('agendamento_eventos', [{ id: randomUUID(), empresa_id: empresa.id, agendamento_id: m3, tipo: 'status', payload: { de: 'em_atendimento', para: 'concluido', origem: 'checkout' }, created_at: new Date().toISOString() }]);
  const ativosDe = async c => (await db('agendamentos')).filter(a => a.cliente_id === c.id && ['agendado', 'confirmado'].includes(a.status));
  const resumo = list => list.map(a => `${a.profissional_id === ana.id ? 'Ana' : 'Bruno'} ${String(a.horario).slice(0, 5)}`).sort();

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
  await irPara(p, amanha);

  const cardDe = async c => {
    const id = (await ativosDe(c))[0].id;
    await p.waitForSelector(`.ag-card[data-ag-id="${id}"]`, { timeout: 10000 });
    return id;
  };
  // Centro do card (sem usar a alça) e topo de um horário na coluna de um profissional.
  const centro = id => p.evaluate(id => { const el = document.querySelector(`.ag-card[data-ag-id="${id}"]`); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, pega: r.height / 2 }; }, id);
  const linha = (profId, hhmm) => p.evaluate(([profId, hhmm]) => {
    const col = document.querySelector(`.agenda-grid-col[data-prof-id="${profId}"]`); const c = col.getBoundingClientRect();
    const [ini] = document.querySelector('.agenda-grid-ruler .ruler-mark').textContent.split(':').map(Number);
    const [h, m] = hhmm.split(':').map(Number);
    return { x: c.left + c.width / 2, y: c.top + ((h - ini) * 60 + m) * 3 };
  }, [profId, hhmm]);
  async function arrastar(id, profId, hhmm, { soltar = true, voltar = false } = {}) {
    const o = await centro(id);
    await p.mouse.move(o.x, o.y); await p.mouse.down();
    const d = await linha(profId, hhmm);
    const alvoY = d.y + o.pega + 2;
    for (let i = 1; i <= 8; i++) { await p.mouse.move(o.x + (d.x - o.x) * i / 8, o.y + (alvoY - o.y) * i / 8); await p.waitForTimeout(25); }
    const previa = await p.evaluate(() => { const h = document.querySelector('.drag-highlight'); return h ? { cls: h.className, texto: h.innerText.replace(/\s+/g, ' ').trim() } : null; });
    if (voltar) { for (let i = 1; i <= 8; i++) { await p.mouse.move(d.x + (o.x - d.x) * i / 8, alvoY + (o.y - alvoY) * i / 8); await p.waitForTimeout(25); } }
    if (soltar) { await p.mouse.up(); await p.waitForTimeout(1300); }
    return previa;
  }

  // 1) Clique sem arrastar abre o card.
  let id1 = await cardDe(cli[0]);
  const c1 = await centro(id1);
  await p.mouse.click(c1.x, c1.y); await p.waitForTimeout(500);
  confere('tocar sem arrastar abre o card', await p.locator('#actionSheet:not(.hidden)').count() === 1);
  await p.evaluate(() => document.getElementById('actionSheet').classList.add('hidden'));

  // 2) Arrastar pelo meio do card até Bruno 09:00, depois desfazer.
  const pv2 = await arrastar(id1, bruno.id, '09:00');
  console.log('PRÉVIA livre:', JSON.stringify(pv2));
  confere('prévia livre mostra início–fim e profissional', pv2 && /livre/.test(pv2.cls) && pv2.texto.includes('09:00–09:30 · Bruno'), JSON.stringify(pv2));
  confere('soltar grava em Bruno 09:00', JSON.stringify(resumo(await ativosDe(cli[0]))) === JSON.stringify(['Bruno 09:00']), JSON.stringify(resumo(await ativosDe(cli[0]))));
  const desfazer = p.locator('.toast .toast-action-btn', { hasText: 'Desfazer' });
  confere('aviso com "Desfazer" aparece', await desfazer.count() === 1);
  await desfazer.click(); await p.waitForTimeout(1300);
  confere('desfazer volta para Ana 09:00 (no servidor)', JSON.stringify(resumo(await ativosDe(cli[0]))) === JSON.stringify(['Ana 09:00']), JSON.stringify(resumo(await ativosDe(cli[0]))));

  // 3) Destino ocupado: prévia vermelha com o nome; soltar não muda nada.
  id1 = await cardDe(cli[0]);
  const pv3 = await arrastar(id1, bruno.id, '10:00');
  console.log('PRÉVIA ocupado:', JSON.stringify(pv3));
  confere('prévia ocupada diz quem ocupa', pv3 && /conflito/.test(pv3.cls) && pv3.texto.includes('Ocupado: Ocupante Teste'), JSON.stringify(pv3));
  confere('soltar no ocupado não muda nada', JSON.stringify(resumo(await ativosDe(cli[0]))) === JSON.stringify(['Ana 09:00']));
  confere('aviso diz por quem está ocupado', /Horário ocupado por Ocupante Teste\. Nada mudou\./.test(await p.textContent('#toast-container')));

  // 4) Fora da escala: prévia âmbar; voltar ao lugar e soltar não muda nada.
  id1 = await cardDe(cli[0]);
  const pv4 = await arrastar(id1, ana.id, '08:00', { voltar: true });
  console.log('PRÉVIA fora:', JSON.stringify(pv4));
  confere('prévia fora da escala fica âmbar', pv4 && /fora/.test(pv4.cls) && pv4.texto.includes('Fora da escala'), JSON.stringify(pv4));
  confere('voltar ao lugar e soltar não muda nada', JSON.stringify(resumo(await ativosDe(cli[0]))) === JSON.stringify(['Ana 09:00']));

  // 5) Teclado: ↓ move um passo (20 min) e o foco fica no card novo.
  id1 = await cardDe(cli[0]);
  await p.focus(`.ag-card[data-ag-id="${id1}"]`);
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(1500);
  const depoisTeclado = await ativosDe(cli[0]);
  confere('↓ move um passo (10 min): Ana 09:10', JSON.stringify(resumo(depoisTeclado)) === JSON.stringify(['Ana 09:10']), JSON.stringify(resumo(depoisTeclado)));
  const focado = await p.evaluate(() => document.activeElement && document.activeElement.dataset.agId);
  confere('o foco fica no card movido', depoisTeclado[0] && focado === depoisTeclado[0].id, String(focado));

  // 6) Card pago: apertar e mover não arrasta.
  const c3 = await centro(m3);
  await p.mouse.move(c3.x, c3.y); await p.mouse.down(); await p.mouse.move(c3.x, c3.y + 60, { steps: 5 });
  const arrastouPago = await p.evaluate(() => !!document.querySelector('.ag-clone, .drag-highlight'));
  await p.mouse.up(); await p.waitForTimeout(300);
  confere('card pago não se arrasta', !arrastouPago);
  await p.evaluate(() => document.getElementById('actionSheet').classList.add('hidden'));

  // 7) Segurar perto da borda de baixo rola a grade.
  id1 = await cardDe(cli[0]);
  const c7 = await centro(id1);
  const cont = await p.evaluate(() => { const c = document.getElementById('timelineContainer'); c.scrollTop = 0; const r = c.getBoundingClientRect(); return { bottom: r.bottom }; });
  const c7b = await centro(id1);
  const antes = await p.evaluate(() => document.getElementById('timelineContainer').scrollTop);
  await p.mouse.move(c7b.x, c7b.y); await p.mouse.down();
  await p.mouse.move(c7b.x, cont.bottom - 10, { steps: 6 });
  await espera(1200);
  const depois = await p.evaluate(() => document.getElementById('timelineContainer').scrollTop);
  confere('segurar na borda de baixo rola a grade', depois > antes + 30, JSON.stringify({ antes, depois, c7 }));
  await p.keyboard.press('Escape');
  await p.mouse.up(); await p.waitForTimeout(1200);

  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
