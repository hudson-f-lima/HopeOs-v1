// E2E (Playwright/Chromium) sob a CSP de produção: card do agendamento compacto e editável, e a
// pilha de camadas (o que abre por último fica por cima).
//   1) Card confirmado: trocar o serviço pelo card mantém "Confirmado" (mesmo dia e hora); o
//      original fica "reagendado" e o novo tem o serviço novo.
//   2) Mudar o dia pelo card: novo horário amanhã, volta para "Agendado" (o cliente reconfirma).
//   3) Duração +15 pelo card.
//   4) Recepção sem permissão de trocar profissional de outro? (recepção pode); profissional não
//      vê "Profissional" editável.
//   5) Camadas: Gestão → Clientes → "+ Novo" abre o modal por cima do painel; Esc fecha só o de cima.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const BARBA = 'bbbbbbbb-0000-4000-8000-000000000002';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();
const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const amanha = fuso(new Date(Date.now() + 864e5));
const depois = fuso(new Date(Date.now() + 2 * 864e5));

async function login(email) {
  const s = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'dev12345' }) })).json();
  return { 'content-type': 'application/json', authorization: `Bearer ${s.data.access_token || s.data.session.access_token}` };
}
async function entrar(b, email) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
  const p = await ctx.newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { if (r.status() >= 500) p.erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
async function irPara(p, dia) {
  await p.click('#navAgenda'); await p.waitForTimeout(400);
  for (let i = 0; i < 2; i++) {
    const d = p.locator(`[data-day="${dia}"]`);
    if (await d.count()) { await d.first().click(); await p.waitForTimeout(700); return; }
    await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800);
  }
}
async function abrirCard(p, id) {
  await p.locator(`[data-id="${id}"]`).first().click();
  await p.waitForSelector('#actionSheet:not(.hidden) .agc-campos');
}
const topoEm = (p, sel) => p.evaluate(s => {
  const box = document.querySelector(s); const r = box.getBoundingClientRect();
  return box.contains(document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2)));
}, sel);

(async () => {
  const adm = await login('admin@dev.local');
  const cat = (await (await fetch(`${API}/api/catalog`, { headers: adm })).json()).data;
  const novo = await (await fetch(`${API}/api/agenda`, { method: 'POST', headers: adm, body: JSON.stringify({ clienteId: cat.clientes[0].id, servicoId: BARBA, profissionalId: ANA, data: amanha, horario: '09:00' }) })).json();
  await fetch(`${API}/api/agenda/${novo.data.id}/status`, { method: 'PATCH', headers: adm, body: JSON.stringify({ novoStatus: 'confirmado' }) });
  console.log('AGENDAMENTO CONFIRMADO:', novo.ok);

  const b = await chromium.launch();
  const r = await entrar(b, 'recepcao@dev.local');
  await irPara(r, amanha);

  // 1) Trocar o serviço pelo card.
  await abrirCard(r, novo.data.id);
  const card = limpo(await r.textContent('#actionSheetContent'));
  confere('card compacto: cliente, status, faixa de horário e os 4 campos', /Confirmado/.test(card) && /09:00–09:30/.test(card) && await r.locator('.agc-campo[data-editar]').count() === 4, card.slice(0, 160));
  const altura = await r.evaluate(() => document.querySelector('#actionSheet .sheet-box').getBoundingClientRect().height);
  confere('card cabe na tela (≤ 85% de 844px)', altura <= 0.85 * 844, String(Math.round(altura)));
  await r.click('[data-editar="servico"]');
  await r.waitForSelector('#agcServico');
  await r.selectOption('#agcServico', CORTE);
  await r.click('#agcSalvar');
  await r.waitForSelector('#actionSheet', { state: 'hidden', timeout: 8000 });
  await r.waitForTimeout(600);
  let ags = await db('agendamentos');
  const orig = ags.find(a => a.id === novo.data.id);
  const troca = ags.find(a => a.cliente_id === cat.clientes[0].id && a.data === amanha && String(a.horario).startsWith('09:00') && a.servico_id === CORTE && ['confirmado', 'agendado'].includes(a.status));
  confere('serviço trocado pelo card, mesmo dia e hora: continua Confirmado; original reagendado', orig.status === 'reagendado' && troca && troca.status === 'confirmado', JSON.stringify(troca && { s: troca.status, d: troca.duracao_min }));

  // 2) Mudar o dia pelo card: volta para Agendado.
  await abrirCard(r, troca.id);
  await r.click('[data-editar="quando"]');
  await r.waitForSelector('#agcData');
  confere('editor de quando avisa que o cliente reconfirma', /confirmar de novo/.test(limpo(await r.textContent('#agcEditor'))));
  await r.fill('#agcData', depois);
  await r.waitForTimeout(800);
  const chips = await r.locator('#agcLivres [data-agc-hora]').count();
  confere('horários livres do novo dia sugeridos', chips > 0, String(chips));
  await r.fill('#agcHora', '10:00');
  await r.click('#agcSalvar');
  await r.waitForSelector('#actionSheet', { state: 'hidden', timeout: 8000 });
  await r.waitForTimeout(600);
  ags = await db('agendamentos');
  const movido = ags.find(a => a.data === depois && String(a.horario).startsWith('10:00') && a.servico_id === CORTE && a.status === 'agendado');
  confere('dia mudado pelo card: novo horário agendado, o anterior reagendado', movido && ags.find(a => a.id === troca.id).status === 'reagendado');

  // 3) Duração +15.
  await irPara(r, depois);
  await abrirCard(r, movido.id);
  await r.click('[data-editar="duracao"]');
  const antes = Number(await r.inputValue('#agcDuracao'));
  await r.click('[data-agc-dur="15"]');
  await r.click('#agcSalvar');
  await r.waitForSelector('#actionSheet', { state: 'hidden', timeout: 8000 });
  await r.waitForTimeout(600);
  const dur = (await db('agendamentos')).find(a => a.id === movido.id).duracao_min;
  confere('duração +15 pelo card', dur === antes + 15, `${antes} → ${dur}`);

  // 6) Troca de cliente (D-051): passar a vaga pela busca; o original fica cancelado com vaga repassada.
  const outro = (await (await fetch(`${API}/api/clientes`, { method: 'POST', headers: adm, body: JSON.stringify({ nome: 'Joana Vaga', whatsapp: '11 95555-1234' }) })).json()).data;
  await r.goto(APP); await r.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await r.waitForTimeout(800);
  await irPara(r, depois);
  await abrirCard(r, movido.id);
  await r.click('[data-editar="cliente"]'); await r.waitForSelector('#agcClienteBusca');
  await r.check('input[name="agcMotivo"][value="vaga_repassada"]');
  const dica = limpo(await r.textContent('#agcMotivoDica'));
  confere('passar a vaga explica que não conta contra quem desistiu', /não conta como falta nem como cancelamento tardio/.test(dica) && (await r.textContent('#agcSalvar')).trim() === 'Passar a vaga', dica);
  await r.fill('#agcClienteBusca', 'Joana');
  await r.click(`[data-agc-cliente="${outro.id}"]`);
  await r.click('#agcSalvar');
  await r.waitForSelector('#actionSheet', { state: 'hidden', timeout: 8000 }); await r.waitForTimeout(600);
  const agsT = await db('agendamentos');
  const novoT = agsT.find(a => a.cliente_id === outro.id && a.data === depois);
  const evT = (await db('agendamento_eventos')).find(e => e.agendamento_id === movido.id && e.tipo === 'vaga_repassada');
  confere('vaga passada: novo cliente no mesmo horário "agendado"; anterior cancelado com vaga_repassada', novoT && novoT.status === 'agendado' && String(novoT.horario).startsWith('10:00')
    && agsT.find(a => a.id === movido.id).status === 'cancelado' && Boolean(evT));

  // 5) Camadas: Gestão → Clientes → + Novo por cima; Esc fecha só o de cima.
  await r.click('#navGestao'); await r.waitForSelector('#tab-gestao:not(.hidden)');
  await r.click('[data-subtab="clientes"]'); await r.waitForTimeout(400);
  await r.click('#btnNovoCliente');
  await r.waitForSelector('#modalCliente:not(.hidden)');
  confere('Gestão → Novo cliente: o modal abre por cima do painel', await topoEm(r, '#modalCliente .modal-box'));
  confere('modal com cabeçalho fixo e ✕', await r.locator('#modalCliente .modal-topo .modal-fechar').count() === 1);
  await r.keyboard.press('Escape'); await r.waitForTimeout(200);
  confere('Esc fecha só o de cima (o detalhe Clientes continua aberto)', await r.isHidden('#modalCliente') && await r.isVisible('#sheetGestao'));
  await r.click('#btnNovoCliente'); await r.waitForSelector('#modalCliente:not(.hidden)');
  await r.click('#modalCliente .modal-fechar');
  confere('✕ fecha o modal', await r.isHidden('#modalCliente'));
  console.log('RECEPÇÃO erros:', JSON.stringify(r.erros)); falhas.push(...r.erros);

  // 4) Profissional: não troca de profissional pelo card.
  const p = await entrar(b, 'profissional@dev.local');
  const hoje = fuso(new Date());
  const doDia = (await db('agendamentos')).find(a => a.profissional_id === ANA && a.data === hoje && a.status === 'agendado');
  if (doDia) {
    await irPara(p, hoje);
    await abrirCard(p, doDia.id);
    confere('profissional: Profissional e Cliente não editáveis, Serviço e Quando editáveis', await p.locator('[data-editar="profissional"]').count() === 0 && await p.locator('[data-editar="cliente"]').count() === 0 && await p.locator('[data-editar="servico"]').count() === 1);
  }
  const viol = [...await r.evaluate(() => window.__csp), ...await p.evaluate(() => window.__csp)];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(viol)); falhas.push(...viol);
  console.log('PROFISSIONAL erros:', JSON.stringify(p.erros)); falhas.push(...p.erros);

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
