// E2E (Playwright/Chromium, 390×844) do D-087 sob a CSP de produção: o que antes era recusado sem
// perguntar agora pergunta (para quem tem a permissão "Encaixar").
// Amanhã, escala do seed 09:00–13:00. Recepção.
//   1) tela desatualizada: outro aparelho marca Bruno 11:00 depois que a tela carregou; arrastar um card da
//      Ana para Bruno 11:00 → o servidor recusa (SCHEDULE_CONFLICT) → a tela pergunta → Encaixar grava;
//   2) mesma coisa ao criar: formulário para Ana 11:30, ocupada por outro aparelho → pergunta → grava;
//   3) alça de baixo além da escala (12:30 com 30 → 60 min, termina 13:30) → o servidor recusa
//      (FORA_DA_DISPONIBILIDADE) → pergunta → grava 60 min;
//   4) responder "Cancelar" em 3 não muda nada (o card volta).
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
  const nomes = ['Move Encaixe', 'Outro Aparelho', 'Outro Aparelho Dois', 'Estica Card'];
  const cli = nomes.map(nome => ({ id: randomUUID(), empresa_id: empresa.id, nome, ativo: true }));
  await plantar('clientes', cli);
  const ag = (c, prof, h, d) => ({ id: randomUUID(), empresa_id: empresa.id, profissional_id: prof.id, servico_id: corte.id, cliente_id: c.id, data: amanha, horario: h + ':00', duracao_min: d, status: 'agendado', valor_centavos: 6000 });
  const mover = ag(cli[0], ana, '09:00', 30);
  const estica = ag(cli[3], ana, '12:30', 30);
  await plantar('agendamentos', [mover, estica]);
  const ativos = async c => (await db('agendamentos')).filter(a => a.cliente_id === c.id && ['agendado', 'confirmado'].includes(a.status)).map(a => `${profs.find(x => x.id === a.profissional_id).nome} ${String(a.horario).slice(0, 5)}/${a.duracao_min}`);

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
  await p.click('#navAgenda'); await p.waitForTimeout(500);
  for (let i = 0; i < 2 && !(await p.locator(`[data-day="${amanha}"]`).count()); i++) { await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800); }
  await p.locator(`[data-day="${amanha}"]`).first().click(); await p.waitForTimeout(900);
  await p.waitForSelector(`.ag-card[data-ag-id="${mover.id}"]`, { timeout: 10000 });

  // Outro aparelho marca Bruno 11:00 DEPOIS que esta tela carregou (ela não sabe).
  await plantar('agendamentos', [ag(cli[1], bruno, '11:00', 30)]);

  const geo = prof => p.evaluate(pid => {
    const marcas = [...document.querySelectorAll('.ruler-mark')];
    const [h, m] = marcas[0].textContent.trim().split(':').map(Number);
    const px = (marcas[1].offsetTop - marcas[0].offsetTop) / 20;
    const col = document.querySelector(`.agenda-grid-col[data-prof-id="${pid}"]`).getBoundingClientRect();
    return { base: h * 60 + m, px, top: col.top, x: col.left + col.width / 2 };
  }, prof);
  const pergunta = async () => {
    await p.waitForSelector('#confirm-action-ok', { timeout: 6000 }).catch(() => {});
    return p.evaluate(() => { const d = document.querySelector('#confirm-action-ok')?.closest('dialog, .modal, [role="dialog"]'); return d ? d.textContent.replace(/\s+/g, ' ') : null; });
  };

  // 1) Arrastar Ana 09:00 → Bruno 11:00 (a tela acha livre; o servidor não).
  const box = await p.evaluate(id => { const el = document.querySelector(`.ag-card[data-ag-id="${id}"]`); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 16, top: r.top }; }, mover.id);
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x, box.y + 20, { steps: 4 });
  await p.evaluate(() => [...document.querySelectorAll('.ruler-mark')].find(m => m.textContent.trim() === '11:00').scrollIntoView({ block: 'center' }));
  const gb = await geo(bruno.id);
  await p.mouse.move(gb.x, gb.top + (11 * 60 - gb.base) * gb.px + (box.y - box.top) + 1, { steps: 12 }); await p.waitForTimeout(200);
  await p.mouse.up();
  const q1 = await pergunta();
  confere('tela desatualizada: o servidor recusa e a tela pergunta se encaixa', Boolean(q1) && /Horário ocupado/.test(q1) && /Encaixar/.test(q1), String(q1).slice(0, 140));
  await p.click('#confirm-action-ok').catch(() => {}); await p.waitForTimeout(1500);
  confere('Encaixar grava Bruno 11:00', JSON.stringify(await ativos(cli[0])) === '["Bruno 11:00/30"]', JSON.stringify(await ativos(cli[0])));

  // 2) Criar Ana 12:00 (ocupada por outro aparelho) pelo formulário.
  await p.click('#fab'); await p.waitForSelector('#modalNovoAgendamento:not(.hidden)');
  await p.click('#agCliente'); await p.fill('#agCliente', 'Move Encaixe'); await p.waitForTimeout(300);
  await p.locator('#agCliente ~ div [data-value]').first().click();
  await p.click('#agServico'); await p.fill('#agServico', 'Corte'); await p.waitForTimeout(300);
  await p.locator('#agServico ~ div [data-value]').first().click();
  await p.click('#agProfissional').catch(() => {}); await p.fill('#agProfissional', 'Ana').catch(() => {}); await p.waitForTimeout(300);
  await p.locator('#agProfissional ~ div [data-value]').first().click().catch(() => {});
  await p.fill('#agData', amanha); await p.fill('#agHorario', '11:30'); await p.waitForTimeout(700);
  // Outro aparelho marca Ana 11:30 com o formulário já preenchido (esta tela não sabe).
  await plantar('agendamentos', [ag(cli[2], ana, '11:30', 30)]);
  await p.click('#btnConfirmarNovoAgendamento');
  const q2 = await pergunta();
  confere('criar em horário que outro aparelho ocupou: pergunta se encaixa', Boolean(q2) && /Horário ocupado/.test(q2) && /Encaixar/.test(q2), String(q2).slice(0, 140));
  await p.click('#confirm-action-ok').catch(() => {}); await p.waitForTimeout(1500);
  const criado = (await db('agendamentos')).filter(a => a.profissional_id === ana.id && a.data === amanha && String(a.horario).startsWith('11:30') && a.status === 'agendado');
  confere('Encaixar cria o segundo horário das 11:30 da Ana', criado.length === 2, String(criado.length));

  // 3) e 4) Alça de baixo além da escala.
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); });
  const esticar = async () => {
    const h = await p.evaluate(id => { const el = document.querySelector(`.resize-handle[data-ag-id="${id}"][data-modo="fim"]`); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, estica.id);
    const g = await geo(ana.id);
    await p.mouse.move(h.x, h.y); await p.mouse.down(); await p.mouse.move(h.x, h.y + 30 * g.px + 1, { steps: 8 }); await p.waitForTimeout(150); await p.mouse.up();
    return pergunta();
  };
  const q4 = await esticar();
  confere('esticar além da escala: pergunta (fora do horário)', Boolean(q4) && /Fora do horário/.test(q4), String(q4).slice(0, 140));
  await p.click('#confirm-action-cancel').catch(() => {}); await p.waitForTimeout(1000);
  confere('Cancelar: a duração continua 30 min', JSON.stringify(await ativos(cli[3])) === '["Ana 12:30/30"]', JSON.stringify(await ativos(cli[3])));
  const q3 = await esticar();
  confere('esticar de novo pergunta outra vez', Boolean(q3) && /Fora do horário/.test(q3));
  await p.click('#confirm-action-ok').catch(() => {}); await p.waitForTimeout(1500);
  confere('Alterar mesmo assim grava 60 min', JSON.stringify(await ativos(cli[3])) === '["Ana 12:30/60"]', JSON.stringify(await ativos(cli[3])));

  await p.screenshot({ path: '/tmp/hopeos-encaixe-perguntar.png' });
  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
