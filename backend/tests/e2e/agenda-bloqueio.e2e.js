// E2E (Playwright/Chromium) do D-046 sob a CSP de produção: na agenda, tocar no horário livre
// oferece Agendar ou Bloquear. A profissional (Ana) bloqueia o próprio horário com o fim sugerido
// ("até o próximo cliente") e um motivo rápido; o bloqueio aparece na grade e o trecho deixa de ser
// oferecido; ela encurta o bloqueio pela grade. A recepção vê o bloqueio da Ana sem poder mexer e,
// num horário livre do Bruno, escolhe Agendar. Em Escalas, a Ana aceita a escala que a gestão
// definiu; a gestão vê "Aceita pelo profissional" e o histórico diz que a trilha está íntegra.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRUNO = 'aaaaaaaa-0000-4000-8000-000000000002';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();
const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

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
  p.on('console', m => { if (/Content Security Policy/i.test(m.text())) p.erros.push('CSP ' + m.text()); });
  p.on('response', r => { if (r.status() >= 500) p.erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
async function irParaAmanha(p) {
  await p.click('#navAgenda'); await p.waitForTimeout(500);
  for (let i = 0; i < 2; i++) {
    const dia = p.locator(`[data-day="${amanha}"]`);
    if (await dia.count()) { await dia.first().click(); await p.waitForTimeout(700); return; }
    await p.click('#btnNextWeekMobile'); await p.waitForTimeout(800);
  }
}
const slot = (p, prof, h) => p.locator(`.slot-vazio[data-prof="${prof}"][data-time="${h}"]`);

(async () => {
  // Cliente da Ana amanhã às 11:00 (para o "até o próximo cliente").
  const adm = await login('admin@dev.local');
  const cat = (await (await fetch(`${API}/api/catalog`, { headers: adm })).json()).data;
  const ag = await (await fetch(`${API}/api/agenda`, { method: 'POST', headers: adm, body: JSON.stringify({ clienteId: cat.clientes[0].id, servicoId: CORTE, profissionalId: ANA, data: amanha, horario: '11:00' }) })).json();
  console.log('AGENDAMENTO 11:00:', ag.ok);

  const b = await chromium.launch();

  // ---- Ana: horário livre → Bloquear ----
  const a = await entrar(b, 'profissional@dev.local');
  await irParaAmanha(a);
  await slot(a, ANA, '09:00').first().click();
  await a.waitForSelector('#modalSlot:not(.hidden)');
  confere('horário livre oferece Agendar e Bloquear', await a.isVisible('#btnSlotAgendar') && await a.isVisible('#btnSlotBloquear'), limpo(await a.textContent('#slotTitulo')));
  await a.click('#btnSlotBloquear');
  await a.waitForFunction(() => /fim do expediente/.test(document.getElementById('slotFimOpcoes').textContent), null, { timeout: 8000 }).catch(() => {});
  const opcoes = (await a.locator('#slotFimOpcoes .chip').allInnerTexts()).map(limpo);
  confere('fins sugeridos: 30 min, 1 hora, até o próximo cliente e até o fim do expediente',
    opcoes.includes('30 min') && opcoes.includes('1 hora') && opcoes.includes('Até o próximo cliente (11:00)') && opcoes.some(o => /^Até o fim do expediente/.test(o)), JSON.stringify(opcoes));
  confere('aviso: só ela encurta ou remove', /Só você pode encurtar ou remover/.test(await a.textContent('#slotAviso')));
  await a.locator('#slotFimOpcoes .chip', { hasText: 'Até o próximo cliente' }).click();
  await a.click('[data-slot-motivo="Médico"]');
  await a.click('#btnSlotSalvar');
  await a.waitForSelector('#modalSlot', { state: 'hidden' });
  await a.waitForSelector(`.agenda-grid-col[data-prof-id="${ANA}"] .ag-bloqueio`, { timeout: 8000 });
  const exc = (await db('disponibilidade_excecoes')).find(e => e.profissional_id === ANA && e.data_inicio === amanha && e.tipo === 'bloqueio');
  confere('bloqueio gravado 09:00–11:00, motivo Médico', exc && String(exc.inicio).slice(0, 5) === '09:00' && String(exc.fim).slice(0, 5) === '11:00' && exc.motivo === 'Médico', JSON.stringify(exc));
  confere('grade mostra "Bloqueado · Médico" e não oferece 09:00–10:40', limpo(await a.locator(`.agenda-grid-col[data-prof-id="${ANA}"] .ag-bloqueio`).first().innerText()) === 'Bloqueado · Médico'
    && await slot(a, ANA, '09:00').count() === 0 && await slot(a, ANA, '10:40').count() === 0);
  // Fora da escala (D-047): pontilhado onde a Ana não trabalha; slot dali não oferece Bloquear.
  await a.waitForSelector(`.agenda-grid-col[data-prof-id="${ANA}"] .ag-fora`, { timeout: 8000 }).catch(() => {});
  const grade = await (await fetch(`${API}/api/disponibilidade/grade?data=${amanha}`, { headers: adm })).json();
  const fimAna = grade.data.profissionais.find(x => x.profissionalId === ANA).periodos.slice(-1)[0].fim;
  confere('fora da escala pontilhado depois do expediente da Ana (' + fimAna + ')', await a.locator(`.agenda-grid-col[data-prof-id="${ANA}"] .ag-fora`).count() >= 1
    && await a.locator(`.slot-vazio.fora[data-prof="${ANA}"]`).count() >= 1 && await a.locator(`.slot-vazio.fora[data-prof="${ANA}"][data-time="09:00"]`).count() === 0);
  const ultimoFora = a.locator(`.slot-vazio.fora[data-prof="${ANA}"]`).last();
  await ultimoFora.click();
  await a.waitForTimeout(400);
  confere('horário fora da escala não oferece Bloquear', !(await a.isVisible('#btnSlotBloquear')));
  await a.keyboard.press('Escape').catch(() => {});
  if (await a.isVisible('#modalNovoAgendamento:not(.hidden)')) await a.evaluate(() => document.getElementById('modalNovoAgendamento').classList.add('hidden'));
  confere('legenda: livre, fora da escala, bloqueado', limpo(await a.textContent('#agLegenda')) === 'Livre Fora da escala Bloqueado' || /Livre.*Fora da escala.*Bloqueado/.test(limpo(await a.textContent('#agLegenda'))));
  await a.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-agenda-bloqueio.png') });

  // ---- Ana encurta pela grade ----
  await a.locator(`.agenda-grid-col[data-prof-id="${ANA}"] .ag-bloqueio`).first().click();
  await a.waitForSelector('#modalSlot:not(.hidden) #slotExistente:not(.hidden)');
  await a.fill('#slotNovoFim', '10:00');
  await a.click('#btnSlotEncurtar'); await a.waitForSelector('#modalSlot', { state: 'hidden' });
  await a.waitForTimeout(800);
  const enc = (await db('disponibilidade_excecoes')).find(e => e.id === exc.id);
  const evs = await db('disponibilidade_eventos');
  confere('encurtado para 09:00–10:00, mesmo bloqueio, com antes e depois na trilha', String(enc.fim).slice(0, 5) === '10:00'
    && evs.some(e => e.acao === 'excecao_encurtar' && e.antes[0].id === exc.id && String(e.antes[0].fim).slice(0, 5) === '11:00'));
  confere('10:00 volta a ser oferecido', await slot(a, ANA, '10:00').count() === 1);

  // ---- Gestão define a escala da Ana; ela aceita em Escalas ----
  // Todos os dias: "amanhã" pode ser domingo (tem o agendamento das 11:00, que não pode ficar fora).
  const def = await (await fetch(`${API}/api/disponibilidade/profissionais/${ANA}/semanal`, { method: 'PUT', headers: adm, body: JSON.stringify({ periodos: [0, 1, 2, 3, 4, 5, 6].map(d => ({ diaSemana: d, inicio: '08:00', fim: '20:00' })), decisoes: [] }) })).json();
  console.log('ESCALA DEFINIDA:', def.ok, def.ok ? '' : JSON.stringify(def.error && def.error.code));
  await a.click('#navAvatar'); await a.waitForSelector('#sheetGestao:not(.hidden)');
  await a.click('#subtabBtnEscalas'); await a.waitForSelector('[data-esc-aceitar]', { timeout: 8000 }).catch(() => {});
  confere('Ana vê "Aguardando aceite" e o botão', await a.locator('[data-esc-aceitar]').count() === 1 && /Aguardando aceite/.test(await a.textContent('#escConteudo')));
  await a.click('[data-esc-aceitar]');
  await a.waitForFunction(() => /Aceita pelo profissional em/.test(document.getElementById('escConteudo').textContent), null, { timeout: 8000 }).catch(() => {});
  confere('escala aceita pela tela', /Aceita pelo profissional em/.test(await a.textContent('#escConteudo')) && (await db('disponibilidade_eventos')).some(e => e.acao === 'semanal_aceitar'));
  await a.click('#btnEscHistorico'); await a.waitForSelector('#escTrilha');
  const hist = limpo(await a.textContent('#escHistorico'));
  confere('histórico: trilha íntegra, aceite, encurtou e marcou', /Trilha íntegra/.test(hist) && /aceitou a escala semanal/.test(hist) && /encurtou bloqueio/.test(hist) && /era .*09:00–11:00/.test(hist), hist.slice(0, 300));
  console.log('ANA erros:', JSON.stringify(a.erros)); falhas.push(...a.erros);

  // ---- Recepção: vê o bloqueio da Ana sem mexer; no Bruno, Agendar ----
  const r = await entrar(b, 'recepcao@dev.local');
  await irParaAmanha(r);
  await r.locator(`.agenda-grid-col[data-prof-id="${ANA}"] .ag-bloqueio`).first().click();
  await r.waitForSelector('#modalSlot:not(.hidden) #slotExistente:not(.hidden)');
  confere('recepção: bloqueio da Ana sem encurtar nem remover', !(await r.isVisible('#btnSlotEncurtar')) && !(await r.isVisible('#btnSlotRemover'))
    && /Só o próprio profissional/.test(await r.textContent('#slotSoLeitura')) && /marcado pelo profissional/.test(await r.textContent('#slotInfo')));
  await r.click('#btnSlotFechar');
  await slot(r, BRUNO, '09:00').first().click();
  await r.waitForSelector('#modalSlot:not(.hidden)');
  await r.click('#btnSlotAgendar');
  await r.waitForSelector('#modalNovoAgendamento:not(.hidden)');
  confere('Agendar abre o novo agendamento com o horário tocado', await r.inputValue('#agHorario') === '09:00' && await r.inputValue('#agData') === amanha);
  console.log('RECEPÇÃO erros:', JSON.stringify(r.erros)); falhas.push(...r.erros);

  // ---- Gestão vê o aceite ----
  const g = await entrar(b, 'admin@dev.local');
  await g.click('#navAvatar'); await g.waitForSelector('#sheetGestao:not(.hidden)');
  await g.click('#subtabBtnEscalas'); await g.waitForSelector('#escConteudo .esc-linha');
  const linhaAna = limpo(await g.locator(`.esc-linha[data-prof="${ANA}"]`).innerText());
  confere('gestão vê "Aceita pelo profissional" e não tem botão de aceitar', /Aceita pelo profissional em/.test(linhaAna) && await g.locator('[data-esc-aceitar]').count() === 0, linhaAna);
  const viol = [...await a.evaluate(() => window.__csp), ...await r.evaluate(() => window.__csp), ...await g.evaluate(() => window.__csp)];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(viol)); falhas.push(...viol);
  console.log('GESTÃO erros:', JSON.stringify(g.erros)); falhas.push(...g.erros);

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
