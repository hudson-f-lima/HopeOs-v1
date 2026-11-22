// E2E (Playwright/Chromium) das regras da agenda (D-049, migration 024) sob a CSP de produção.
//   1) Gestão → Regras da agenda: o dono escolhe prazo único de cancelamento, máximo de futuros,
//      intervalo e alerta de atraso; o banco grava.
//   2) Cadastros → Serviço: prazo de cancelamento próprio do serviço.
//   3) Recepção remarca pelo card para outro dia e o cliente já tem outro horário: o servidor
//      devolve as regras, a tela pergunta; seguindo, grava e o histórico guarda a exceção.
//   4) Cancelar pelo card diz se é tardio (dentro do prazo) e que conta na confiabilidade.
//   5) Card de um horário que já passou do alerta: "atrasado N min" e no-show destacado.
const { chromium } = require('playwright');
const { irParaGestao } = require('./navegacao');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRUNO = 'aaaaaaaa-0000-4000-8000-000000000002';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const BARBA = 'bbbbbbbb-0000-4000-8000-000000000002';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();
const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const hoje = fuso(new Date());
const amanha = fuso(new Date(Date.now() + 864e5));
const depois = fuso(new Date(Date.now() + 3 * 864e5));

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

(async () => {
  const adm = await login('admin@dev.local');
  const cat = (await (await fetch(`${API}/api/catalog`, { headers: adm })).json()).data;
  const cli = cat.clientes[0].id;
  // Dois horários futuros do mesmo cliente (amanhã com a Ana e com o Bruno).
  const mk = async body => (await (await fetch(`${API}/api/agenda`, { method: 'POST', headers: adm, body: JSON.stringify({ clienteId: cli, aceitarAvisos: true, ...body }) })).json()).data;
  const a1 = await mk({ servicoId: BARBA, profissionalId: ANA, data: amanha, horario: '09:00' });
  const a2 = await mk({ servicoId: CORTE, profissionalId: BRUNO, data: amanha, horario: '10:00' });
  console.log('HORÁRIOS:', Boolean(a1 && a2));

  const b = await chromium.launch();
  // 1) Regras pela tela.
  const g = await entrar(b, 'admin@dev.local');
  await irParaGestao(g);
  await g.click('#subtabBtnRegras'); await g.waitForSelector('#formRegras');
  await g.selectOption('#rgPrazo', '720');
  await g.selectOption('#rgMaxFuturos', '1');
  await g.selectOption('#rgIntervalo', '7');
  await g.selectOption('#rgAtraso', '5');
  await g.click('#btnRegrasSalvar'); await g.waitForTimeout(800);
  const emp = (await db('empresas'))[0];
  confere('regras gravadas pela tela', emp.online_cancelamento_prazo_min === 720 && emp.agenda_max_futuros_recepcao === 1 && emp.agenda_intervalo_min_dias === 7 && emp.agenda_atraso_alerta_min === 5,
    JSON.stringify([emp.online_cancelamento_prazo_min, emp.agenda_max_futuros_recepcao, emp.agenda_intervalo_min_dias, emp.agenda_atraso_alerta_min]));

  // 2) Prazo próprio do serviço.
  await g.click('#btnFecharGestao');
  await g.click('[data-subtab="servicos"]'); await g.waitForTimeout(400);
  await g.locator('[data-action="editar-servico"]').first().click();
  await g.waitForSelector('#modalServico:not(.hidden)');
  await g.selectOption('#svPrazo', '2880');
  await g.click('#btnSalvarServico'); await g.waitForTimeout(800);
  const comPrazo = (await db('servicos')).filter(s => s.cancelamento_prazo_min === 2880);
  confere('serviço com prazo próprio de 48 h', comPrazo.length === 1, comPrazo.map(s => s.nome).join(','));
  console.log('GESTÃO erros:', JSON.stringify(g.erros)); falhas.push(...g.erros);

  // 3) Recepção remarca pelo card para outro dia: regras → confirmar → grava com exceção.
  const r = await entrar(b, 'recepcao@dev.local');
  const dialogos = [];
  await irPara(r, amanha);
  await abrirCard(r, a1.id);
  await r.click('[data-editar="quando"]'); await r.waitForSelector('#agcData');
  await r.fill('#agcData', depois); await r.fill('#agcHora', '09:00');
  await r.click('#agcSalvar');
  await r.waitForSelector('#conflict-dialog[open]', { timeout: 8000 });
  const msg = limpo(await r.textContent('#conflict-dialog'));
  dialogos.push(msg);
  confere('tela pergunta com as regras do servidor', /Regras da agenda/.test(msg) && /já tem \d+ horário/.test(msg) && /Seguir mesmo assim/.test(msg), msg.slice(0, 200));
  await r.click('#confirm-action-ok');
  await r.waitForSelector('#actionSheet', { state: 'hidden', timeout: 8000 }); await r.waitForTimeout(600);
  const novo = (await db('agendamentos')).find(a => a.data === depois && String(a.horario).startsWith('09:00') && a.cliente_id === cli && a.status === 'agendado');
  const ev = novo && (await db('agendamento_eventos')).find(e => e.agendamento_id === novo.id && (e.payload || {}).excecao_regras);
  confere('remarcado com a exceção no histórico', Boolean(novo && ev), JSON.stringify(ev && ev.payload.excecao_regras));

  // 4) Cancelar diz se é tardio (amanhã, prazo de 12 h do salão: em tempo; o serviço com 48 h: tardio).
  await abrirCard(r, a2.id);
  await r.click('[data-sheet-action="cancelar"]');
  await r.waitForSelector('#conflict-dialog[open]');
  const txt = limpo(await r.textContent('#conflict-dialog'));
  const sv = (await db('servicos')).find(s => s.id === CORTE);
  const esperado = sv.cancelamento_prazo_min === 2880 ? /Cancelamento tardio: faltam .* e o prazo é 48 h\. Conta na confiabilidade/ : /(Dentro do prazo \(12 h antes\)|Cancelamento tardio)/;
  confere('cancelar mostra o prazo (único ou do serviço) e se conta contra o cliente', esperado.test(txt), txt.slice(0, 220));
  await r.click('#confirm-action-cancel');

  // 5) Atraso: horário de hoje que já passou do alerta (5 min).
  const agora = new Date(); const sp = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
  const [hh, mm] = sp.split(':').map(Number); const m = hh * 60 + mm - 20;
  if (m >= 8 * 60 + 5 && m < 20 * 60 - 30) { // dentro da grade visível (08:00–20:00)
    const h = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const at = await (await fetch(`${API}/api/agenda`, { method: 'POST', headers: adm, body: JSON.stringify({ clienteId: cat.clientes[0].id, servicoId: BARBA, profissionalId: BRUNO, data: hoje, horario: h, foraDaDisponibilidade: true, permitirConflito: true, aceitarAvisos: true }) })).json();
    if (at.ok) {
      await r.goto(APP); await r.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await r.waitForTimeout(800);
      await irPara(r, hoje);
      const bloco = r.locator(`[data-id="${at.data.id}"]`);
      if (await bloco.count()) {
        await abrirCard(r, at.data.id);
        const card = limpo(await r.textContent('#actionSheetContent'));
        confere('card mostra o atraso e destaca o no-show', /atrasado \d+ min/.test(card) && await r.locator('[data-sheet-action="noshow"].agc-destaque').count() === 1, card.slice(0, 120));
      } else console.log('ATRASO: horário fora da grade visível, conferência pulada');
    } else console.log('ATRASO: não foi possível criar o horário de teste:', JSON.stringify(at.error));
  } else console.log('ATRASO: fora da grade visível (08:00–20:00) neste horário, conferência pulada');
  console.log('RECEPÇÃO erros:', JSON.stringify(r.erros)); falhas.push(...r.erros);

  const viol = [...await g.evaluate(() => window.__csp), ...await r.evaluate(() => window.__csp)];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(viol)); falhas.push(...viol);
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
