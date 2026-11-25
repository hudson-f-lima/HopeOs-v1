// E2E (Playwright/Chromium, 390×844) do D-077 sob a CSP de produção: card novo da agenda.
// Clientes novos (sem histórico), plantados para amanhã:
//   k1 Ana   09:00 30 min — série + agendado pelo link            → ícones 1ª, recorrente, link; serviço visível
//   k2 Bruno 09:00 15 min — compacto                              → horário, cliente, ícone 1ª e situação na mesma linha
//   k3 Ana   10:00 60 min — concluído pelo caixa (evento checkout) → acinzentado + chanfro, PAGO, sem alça de arraste
//   k4 Bruno 10:00 45 min — falta, com observação                 → contorno de falta, nome riscado, aviso visível
//   k5 Ana   11:00 30 min — concluído à mão (sem evento do caixa)  → não é "pago"
//   k6 Bruno 11:00 30 min — com observação                        → aviso NÃO aparece (abaixo de 45 min)
// A semana é pedida com marcadores=1; nenhuma violação de CSP, erro de página ou 5xx.
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
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const nomes = ['Karina Um', 'Kleber Dois', 'Kátia Três', 'Kauã Quatro', 'Kelly Cinco', 'Kiko Seis'];
  const cli = nomes.map(nome => ({ id: randomUUID(), empresa_id: empresa.id, nome, ativo: true }));
  await plantar('clientes', cli);
  const k = cli.map(() => randomUUID());
  const ag = (i, prof, horario, duracao, status, extra = {}) => ({ id: k[i], empresa_id: empresa.id, profissional_id: prof.id, servico_id: corte.id, cliente_id: cli[i].id, data: amanha, horario, duracao_min: duracao, status, valor_centavos: 6000, ...extra });
  await plantar('agendamentos', [
    ag(0, ana, '09:00:00', 30, 'agendado', { serie_id: randomUUID(), serie_seq: 2 }),
    ag(1, bruno, '09:00:00', 15, 'confirmado'),
    ag(2, ana, '10:00:00', 60, 'concluido'),
    ag(3, bruno, '10:00:00', 45, 'no_show', { observacoes: 'Alergia a amônia' }),
    ag(4, ana, '11:00:00', 30, 'concluido'),
    ag(5, bruno, '11:00:00', 30, 'agendado', { observacoes: 'Prefere tesoura' })
  ]);
  const agora = new Date().toISOString();
  await plantar('agendamento_eventos', [
    { id: randomUUID(), empresa_id: empresa.id, agendamento_id: k[0], tipo: 'origem_link_publico', payload: {}, created_at: agora },
    { id: randomUUID(), empresa_id: empresa.id, agendamento_id: k[2], tipo: 'status', payload: { de: 'em_atendimento', para: 'concluido', origem: 'checkout' }, created_at: agora },
    { id: randomUUID(), empresa_id: empresa.id, agendamento_id: k[4], tipo: 'status', payload: { de: 'em_atendimento', para: 'concluido', origem: 'agenda' }, created_at: agora }
  ]);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  const erros = []; const pedidos = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  p.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/api/agenda' && r.method() === 'GET') pedidos.push(u.search); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'recepcao@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  await irPara(p, amanha);
  await p.waitForSelector(`.ag-card[data-ag-id="${k[0]}"]`, { timeout: 10000 });

  confere('a semana é pedida com marcadores=1', pedidos.length > 0 && pedidos.every(q => /marcadores=1/.test(q)), JSON.stringify(pedidos.slice(0, 2)));
  const card = id => p.locator(`.ag-card[data-ag-id="${id}"]`);
  const info = id => card(id).evaluate(el => ({
    cls: [...el.classList],
    icones: [...el.querySelectorAll('.ag-ic')].map(i => i.dataset.icone),
    situacao: el.querySelector('.ag-st')?.getAttribute('aria-label') || null,
    servico: !!el.querySelector('.ag-line2'),
    aviso: el.querySelector('.ag-aviso')?.textContent.trim() || null,
    alca: !!el.querySelector('.drag-handle'),
    texto: el.innerText.replace(/\s+/g, ' ').trim(),
    nomeLarg: Math.round(el.querySelector('.ag-n').getBoundingClientRect().width),
    horaVisivel: (() => { const r = el.querySelector('.ag-t').getBoundingClientRect(); const c = el.getBoundingClientRect(); return r.width > 0 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1; })(),
    fundo: getComputedStyle(el).backgroundColor
  }));

  const i1 = await info(k[0]);
  console.log('k1', JSON.stringify(i1));
  confere('k1 mostra 1ª visita, recorrente e link, nessa ordem', JSON.stringify(i1.icones) === JSON.stringify(['primeira_visita', 'recorrente', 'link']), JSON.stringify(i1.icones));
  confere('k1 (30 min) mostra o serviço e não mostra aviso', i1.servico && i1.aviso === null);
  confere('k1 situação no canto: Agendado', i1.situacao === 'Agendado');
  confere('k1 fundo suave (claro)', /rgb\((2[2-5]\d), (2[2-5]\d), (2[2-5]\d)\)/.test(i1.fundo), i1.fundo);

  const i2 = await info(k[1]);
  console.log('k2', JSON.stringify(i2));
  confere('k2 (15 min) é compacto, com horário, cliente, ícone e situação', i2.cls.includes('compact') && i2.horaVisivel && i2.nomeLarg >= 30 && i2.icones.includes('primeira_visita') && i2.situacao === 'Confirmado', JSON.stringify({ nomeLarg: i2.nomeLarg, hora: i2.horaVisivel }));
  confere('k2 não mostra serviço (abaixo de 30 min)', !i2.servico);

  const i3 = await info(k[2]);
  console.log('k3', JSON.stringify(i3));
  confere('k3 concluído pelo caixa: acinzentado + chanfro, PAGO, sem alça de arraste', i3.cls.includes('ag-pago') && /PAGO/.test(i3.texto) && !i3.alca && i3.situacao === 'Concluído e pago');
  const filtro = await card(k[2]).evaluate(el => ({ f: getComputedStyle(el).filter, c: getComputedStyle(el).clipPath }));
  confere('k3 filtro de saturação e recorte do canto aplicados', /saturate/.test(filtro.f) && /polygon/.test(filtro.c), JSON.stringify(filtro));

  const i4 = await info(k[3]);
  console.log('k4', JSON.stringify(i4));
  confere('k4 falta: contorno de falta e situação Faltou', i4.cls.includes('st-falta') && i4.situacao === 'Faltou');
  confere('k4 (45 min) mostra o aviso da observação', i4.aviso === '⚠ Alergia a amônia', String(i4.aviso));

  const i5 = await info(k[4]);
  confere('k5 concluído à mão não vira "pago"', !i5.cls.includes('ag-pago') && i5.situacao === 'Concluído' && !/PAGO/.test(i5.texto));
  const i6 = await info(k[5]);
  confere('k6 (30 min) não mostra a observação', i6.aviso === null);

  await p.screenshot({ path: '/tmp/hopeos-agenda-cards-claro.png', fullPage: false });
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(300);
  const fundoEscuro = await card(k[0]).evaluate(el => getComputedStyle(el).backgroundColor);
  const lum = c => { const v = c.match(/\d+/g).slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  confere('tema escuro: fundo do card escuro (luminância < 0,1)', lum(fundoEscuro) < 0.1, fundoEscuro);
  await p.screenshot({ path: '/tmp/hopeos-agenda-cards-escuro.png', fullPage: false });

  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
