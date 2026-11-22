// E2E (Playwright/Chromium) da política de sugestão e da lista de espera compatível (D-054,
// migration 025), sob a CSP de produção.
//   1) Gestão → Regras da agenda: escolher "Compacta" explica a regra e grava.
//   2) Lista de espera pela tela com faixa de horário (início e fim; só um lado é recusado).
//   3) Novo agendamento: sugestões dizem a política; "Ver todos" continua lá.
//   4) Recepção toca num horário livre: aparece quem da lista de espera combina (faixa certa) e
//      não aparece quem está fora da faixa; escolher preenche o agendar; gravar marca "agendado".
const { chromium } = require('playwright');
const { irParaGestao } = require('./navegacao');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();
const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const amanha = fuso(new Date(Date.now() + 864e5));
const mais = (h, m) => { const t = Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) + m; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

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
    await p.click('#btnNextWeekMobile'); await p.waitForTimeout(900);
  }
}

(async () => {
  const adm = await login('admin@dev.local');
  // Três clientes próprios deste roteiro (o seed tem poucos).
  const novoCliente = async (nome, tel) => (await (await fetch(`${API}/api/clientes`, { method: 'POST', headers: adm, body: JSON.stringify({ nome, whatsapp: tel }) })).json()).data;
  const cli = [await novoCliente('Paula Espera', '11 95555-0001'), await novoCliente('Rita Vaga', '11 95555-0002'), await novoCliente('Sonia Noite', '11 95555-0003')];
  const b = await chromium.launch();

  // 1) Política pela tela.
  const g = await entrar(b, 'admin@dev.local');
  await irParaGestao(g);
  await g.click('#subtabBtnRegras'); await g.waitForSelector('#rgPolitica');
  await g.selectOption('#rgPolitica', 'compacta');
  confere('a dica explica a regra escolhida', /Só os encaixes ideais/.test(await g.textContent('#rgPoliticaDica')));
  await g.click('#btnRegrasSalvar'); await g.waitForTimeout(800);
  confere('política gravada', (await db('empresas'))[0].agenda_politica === 'compacta', String((await db('empresas'))[0].agenda_politica));

  // 2) Lista de espera com faixa pela tela.
  await g.click('#btnFecharGestao');
  await g.click('[data-subtab="espera"]'); await g.waitForTimeout(400);
  await g.click('#btnNovaListaEspera'); await g.waitForSelector('#modalListaEspera:not(.hidden)');
  await g.click('#leCliente'); await g.fill('#leCliente', 'Paula'); await g.waitForTimeout(300);
  await g.locator('#leCliente ~ div [data-value]').first().click();
  await g.click('#leServico'); await g.fill('#leServico', 'Corte'); await g.waitForTimeout(300);
  await g.locator('#leServico ~ div [data-value]').first().click();
  await g.fill('#leFaixaInicio', '14:00');
  await g.click('#btnSalvarListaEspera'); await g.waitForTimeout(400);
  confere('só o início da faixa: a tela recusa', /preencha o início e o fim/.test(await g.textContent('#leError')));
  await g.fill('#leFaixaFim', '18:00');
  await g.click('#btnSalvarListaEspera'); await g.waitForTimeout(800);
  const pelaTela = (await db('lista_espera')).find(x => String(x.faixa_inicio || '').startsWith('14:00'));
  confere('espera com faixa 14:00–18:00 gravada pela tela', Boolean(pelaTela && String(pelaTela.faixa_fim).startsWith('18:00')), JSON.stringify(pelaTela && [pelaTela.faixa_inicio, pelaTela.faixa_fim]));
  confere('a linha mostra a faixa', /14:00–18:00/.test(await g.textContent('#listListaEspera')));
  console.log('GESTÃO erros:', JSON.stringify(g.erros)); falhas.push(...g.erros);

  // 3) e 4) Recepção.
  const r = await entrar(b, 'recepcao@dev.local');
  await irPara(r, amanha);
  const hora = await r.evaluate(ana => ([...document.querySelectorAll(`.slot-vazio:not(.fora)[data-prof="${ana}"]`)].map(e => e.dataset.time).find(t => t >= '11:00' && t <= '16:00') || null), ANA);
  if (!hora) { falhas.push('sem horário livre da Ana entre 11:00 e 16:00 amanhã'); }
  else {
    // Na faixa (combina) e fora da faixa (não combina), clientes diferentes.
    const mk = async (cli, fi, ff) => (await (await fetch(`${API}/api/lista-espera`, { method: 'POST', headers: adm, body: JSON.stringify({ clienteId: cli, servicoId: CORTE, profissionalId: ANA, faixaInicio: fi, faixaFim: ff }) })).json()).data;
    const dentro = await mk(cli[1].id, mais(hora, -60), mais(hora, 60));
    const fora = await mk(cli[2].id, '06:00', '07:00');
    await r.locator(`.slot-vazio[data-prof="${ANA}"][data-time="${hora}"]`).click();
    await r.waitForSelector('#slotEspera:not(.hidden) [data-espera-id]', { timeout: 8000 }).catch(() => {});
    const lista = limpo(await r.textContent('#slotEspera'));
    confere('horário livre mostra quem da espera combina (na faixa)', await r.locator(`#slotEspera [data-espera-id="${dentro.id}"]`).count() === 1, lista.slice(0, 160));
    confere('quem está fora da faixa não aparece', await r.locator(`#slotEspera [data-espera-id="${fora.id}"]`).count() === 0);
    confere('diz que nada é reservado nem enviado', /Nada é reservado nem enviado/.test(lista));
    await r.click(`#slotEspera [data-espera-id="${dentro.id}"]`);
    await r.waitForSelector('#modalNovoAgendamento:not(.hidden)');
    confere('agendar já vem com data e hora da vaga', await r.inputValue('#agData') === amanha && await r.inputValue('#agHorario') === hora);
    await r.waitForSelector('#agSlots .ag-slots-politica', { timeout: 8000 }).catch(() => {});
    confere('sugestões dizem a política (Compacta)', /Compacta/.test(await r.textContent('#agSlots')), limpo(await r.textContent('#agSlots')).slice(0, 160));
    await r.click('#btnConfirmarNovoAgendamento');
    await r.waitForSelector('#modalNovoAgendamento', { state: 'hidden', timeout: 8000 }).catch(() => {});
    if (await r.isVisible('#conflict-dialog[open]')) await r.click('#confirm-action-ok');
    await r.waitForTimeout(800);
    const ag = (await db('agendamentos')).find(a => a.cliente_id === cli[1].id && a.data === amanha && String(a.horario).startsWith(hora));
    const item = (await db('lista_espera')).find(x => x.id === dentro.id);
    confere('gravou o agendamento do cliente da espera e o item virou "agendado"', Boolean(ag) && item.status === 'agendado', JSON.stringify({ ag: Boolean(ag), status: item.status }));
    confere('o outro item da espera continua aguardando', (await db('lista_espera')).find(x => x.id === fora.id).status === 'aguardando');
  }
  console.log('RECEPÇÃO erros:', JSON.stringify(r.erros)); falhas.push(...r.erros);

  const viol = [...await g.evaluate(() => window.__csp), ...await r.evaluate(() => window.__csp)];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(viol)); falhas.push(...viol);
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
