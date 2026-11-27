// E2E (Playwright/Chromium, 390×844) do D-086 sob a CSP de produção: segurar e arrastar no espaço vazio
// para escolher o trecho. Amanhã, Ana: um cliente às 11:00 (30 min). Passo padrão do aparelho: 10 min.
// Roteiro (mouse; o toque usa o mesmo código com 0,4 s de espera):
//   1) apertar em 09:20 e arrastar até 10:00: etiqueta "09:20–10:00 (40 min) · Ana"; soltar abre a escolha
//      com o trecho no título; Agendar abre o formulário com 09:20, "Duração: 40 min, escolhida na agenda"
//      e o botão "Usar a do serviço (N min)"; gravar → 09:20 com 40 min;
//   2) apertar em 10:20 e arrastar até 12:00: para no cliente das 11:00 ("10:20–11:00 (40 min)"); Esc cancela
//      sem abrir nada;
//   3) para cima: apertar em 10:40 e subir até 09:40: para no fim do horário do passo 1
//      ("10:00–10:50 (50 min)"); soltar → Bloquear já marca o trecho → bloqueio 10:00–10:50;
//   4) o toque curto no vazio continua abrindo a escolha sem trecho.
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
  const ana = (await db('profissionais')).find(x => x.nome === 'Ana');
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const vizinho = { id: randomUUID(), empresa_id: empresa.id, nome: 'Vizinho Vazio', ativo: true };
  await plantar('clientes', [vizinho]);
  await plantar('agendamentos', [{ id: randomUUID(), empresa_id: empresa.id, profissional_id: ana.id, servico_id: corte.id, cliente_id: vizinho.id, data: amanha, horario: '11:00:00', duracao_min: 30, status: 'agendado', valor_centavos: 6000 }]);

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

  // Ponto da coluna da Ana num horário: topo da coluna + minutos desde o início da grade × px por minuto.
  const geo = () => p.evaluate(prof => {
    const marcas = [...document.querySelectorAll('.ruler-mark')];
    const [h, m] = marcas[0].textContent.trim().split(':').map(Number);
    const px = (marcas[1].offsetTop - marcas[0].offsetTop) / 20; // marcas a cada 20 min
    const col = document.querySelector(`.agenda-grid-col[data-prof-id="${prof}"]`).getBoundingClientRect();
    return { base: h * 60 + m, px, top: col.top, x: col.left + col.width / 2 };
  }, ana.id);
  const min = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const yDe = async hhmm => { const g = await geo(); return g.top + (min(hhmm) - g.base) * g.px; };
  const ponto = async hhmm => {
    await p.evaluate(h => [...document.querySelectorAll('.ruler-mark')].find(m => m.textContent.trim() === h).scrollIntoView({ block: 'center' }), hhmm);
    const g = await geo(); return { x: g.x, y: g.top + (min(hhmm) - g.base) * g.px };
  };
  const rotulo = () => p.evaluate(() => { const r = document.querySelector('.ag-arraste-rot'); return r ? r.textContent.trim() : null; });
  const arrastar = async (de, ate) => {
    const a = await ponto(de);
    await p.mouse.move(a.x, a.y + 4); await p.mouse.down();
    await p.mouse.move(a.x, a.y + 14, { steps: 3 });
    const y = await yDe(ate);
    await p.mouse.move(a.x, y + 1, { steps: 10 }); await p.waitForTimeout(150);
    return rotulo();
  };

  // 1) 09:20 → 10:00 e agendar com a duração escolhida.
  const r1 = await arrastar('09:20', '10:00');
  confere('etiqueta do trecho: "09:20–10:00 (40 min) · Ana"', r1 === '09:20–10:00 (40 min) · Ana', String(r1));
  await p.mouse.up(); await p.waitForSelector('#modalSlot:not(.hidden)', { timeout: 5000 });
  const titulo = await p.textContent('#slotTitulo');
  confere('a escolha mostra o trecho no título', /09:20–10:00 \(40 min\)/.test(titulo), titulo);
  await p.click('#btnSlotAgendar'); await p.waitForSelector('#modalNovoAgendamento:not(.hidden)');
  confere('o formulário vem com 09:20', (await p.inputValue('#agHorario')) === '09:20');
  await p.click('#agCliente'); await p.fill('#agCliente', 'Cliente'); await p.waitForTimeout(300);
  await p.locator('#agCliente ~ div [data-value]').first().click();
  await p.click('#agServico'); await p.fill('#agServico', 'Corte'); await p.waitForTimeout(300);
  await p.locator('#agServico ~ div [data-value]').first().click(); await p.waitForTimeout(900);
  const prev = (await p.textContent('#agDuracaoPreview')).replace(/\s+/g, ' ');
  confere('mostra a duração escolhida e o botão da duração do serviço', /Duração: 40 min, escolhida na agenda \(até 10:00\)/.test(prev) && /Usar a do serviço \(\d+ min\)/.test(prev), prev);
  await p.click('#btnConfirmarNovoAgendamento'); await p.waitForTimeout(1500);
  const novo = (await db('agendamentos')).find(a => a.profissional_id === ana.id && a.data === amanha && String(a.horario).startsWith('09:20') && a.status === 'agendado');
  confere('gravado 09:20 com 40 min', Boolean(novo && novo.duracao_min === 40), JSON.stringify(novo && [novo.horario, novo.duracao_min]));

  // 2) Para no cliente das 11:00; Esc cancela.
  const r2 = await arrastar('10:20', '12:00');
  confere('para no próximo cliente: "10:20–11:00 (40 min) · Ana"', r2 === '10:20–11:00 (40 min) · Ana', String(r2));
  await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(500);
  const sobrou = await p.evaluate(() => ({ sel: !!document.querySelector('.ag-selecao, .ag-arraste-rot'), modal: !document.getElementById('modalSlot').classList.contains('hidden') }));
  confere('Esc cancela: nada abre e a seleção some', !sobrou.sel && !sobrou.modal, JSON.stringify(sobrou));

  // 3) Para cima, para no fim do horário do passo 1; bloquear o trecho.
  const r3 = await arrastar('10:40', '09:40');
  confere('para cima, para no fim do anterior: "10:00–10:50 (50 min) · Ana"', r3 === '10:00–10:50 (50 min) · Ana', String(r3));
  await p.mouse.up(); await p.waitForSelector('#modalSlot:not(.hidden)', { timeout: 5000 });
  await p.click('#btnSlotBloquear'); await p.waitForSelector('#slotBloquear:not(.hidden)'); await p.waitForTimeout(600);
  confere('Bloquear já marca o fim do trecho (10:50)', (await p.inputValue('#slotFim')) === '10:50', await p.inputValue('#slotFim'));
  await p.click('#btnSlotSalvar'); await p.waitForTimeout(1500);
  const bloq = (await db('disponibilidade_excecoes')).find(e => e.profissional_id === ana.id && e.data_inicio === amanha);
  confere('bloqueio gravado 10:00–10:50', Boolean(bloq && String(bloq.inicio).startsWith('10:00') && String(bloq.fim).startsWith('10:50')), JSON.stringify(bloq && [bloq.inicio, bloq.fim]));

  // 4) Toque curto continua como antes.
  const c = await ponto('12:20');
  await p.mouse.click(c.x, c.y + 4); await p.waitForSelector('#modalSlot:not(.hidden)', { timeout: 5000 });
  const t4 = await p.textContent('#slotTitulo');
  confere('toque curto: a escolha abre sem trecho', /12:20 ·/.test(t4) && !/–/.test(t4), t4);

  await p.screenshot({ path: '/tmp/hopeos-agenda-arrastar-vazio.png' });
  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
