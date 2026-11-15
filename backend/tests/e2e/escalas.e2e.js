// E2E (Playwright/Chromium) de horários e escalas (D-033) sob a CSP de produção.
// Data especial pela tela, efeito nos horários oferecidos, origem da regra, permissões por papel
// e conflito com agendamento existente (nada é gravado sem decisão).
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const PROF_ANA = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF_BRUNO = 'aaaaaaaa-0000-4000-8000-000000000002';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const add = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const D = add(hoje, 3);

async function entrar(b, email, esperados = []) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { const rota = `${r.status()} ${new URL(r.url()).pathname}`; if (r.status() >= 400 && !esperados.some(x => rota.startsWith(x))) p.erros.push(rota); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
async function abrirEscalas(p) {
  await p.click('#navAvatar'); await p.waitForSelector('#sheetGestao:not(.hidden)');
  await p.click('#subtabBtnEscalas'); await p.waitForSelector('#escConteudo .esc-linha');
}
const slots = (p, prof, data) => p.evaluate(async ([prof, data, serv]) => {
  const { api } = await import('/js/api.js');
  return api(`/agenda/slots?data=${data}&profissionalId=${prof}&servicoId=${serv}`);
}, [prof, data, CORTE]);

(async () => {
  const b = await chromium.launch();

  // ---- Proprietário: unidade abre mais cedo e mais tarde em D; Ana só à tarde em D ----
  const a = await entrar(b, 'admin@dev.local', ['409 /api/agenda', '409 /api/disponibilidade/excecoes']);
  await abrirEscalas(a);
  confere('escalas: unidade e profissionais com a semana padrão', await a.locator('#escConteudo .esc-linha').count() >= 3);
  await a.click('#btnEscNovaExcecao'); await a.waitForSelector('#modalEscExcecao:not(.hidden)');
  await a.selectOption('#escExcAlvo', ''); await a.selectOption('#escExcTipo', 'horario');
  await a.fill('#escExcDe', D); await a.fill('#escExcAte', D);
  await a.fill('#escExcPeriodos .esc-ini', '08:00'); await a.fill('#escExcPeriodos .esc-fim', '18:00');
  await a.fill('#escExcMotivo', 'Mutirão');
  await a.click('#btnEscExcSalvar'); await a.waitForSelector('#modalEscExcecao', { state: 'hidden' });
  await a.click('#btnEscNovaExcecao'); await a.waitForSelector('#modalEscExcecao:not(.hidden)');
  await a.selectOption('#escExcAlvo', PROF_ANA); await a.selectOption('#escExcTipo', 'horario');
  await a.fill('#escExcDe', D); await a.fill('#escExcAte', D);
  await a.fill('#escExcPeriodos .esc-ini', '14:00'); await a.fill('#escExcPeriodos .esc-fim', '18:00');
  await a.click('#btnEscExcSalvar'); await a.waitForSelector('#modalEscExcecao', { state: 'hidden' });
  await a.waitForSelector('.esc-excecao');
  confere('datas especiais listadas na tela', await a.locator('.esc-excecao').count() === 2, String(await a.locator('.esc-excecao').count()));
  const ana = (await slots(a, PROF_ANA, D)).slots.map(s => s.horario);
  const bruno = (await slots(a, PROF_BRUNO, D)).slots.map(s => s.horario);
  confere('Ana só no horário excepcional (14–18)', ana.includes('14:00') && !ana.includes('09:00') && !ana.some(h => h > '17:15'), ana.join(','));
  confere('Bruno segue a escala dele (09–13) dentro da unidade', bruno.includes('09:00') && !bruno.includes('14:00'), bruno.join(','));
  const outro = (await slots(a, PROF_ANA, add(D, 7))).slots.map(s => s.horario);
  confere('na semana seguinte a regra recorrente volta', outro.includes('09:00') && !outro.includes('14:00'), outro.join(','));

  // ---- Conflito: agendamento da Ana às 15:00 em D; tirar o horário excepcional exige decisão ----
  const ag = await a.evaluate(async ([prof, data, serv]) => { const { api } = await import('/js/api.js'); return api('/agenda', { method: 'POST', body: { servicoId: serv, profissionalId: prof, data, horario: '15:00' } }); }, [PROF_ANA, D, CORTE]);
  confere('agendamento dentro da disponibilidade aceito', Boolean(ag && ag.id));
  const fora = await a.evaluate(async ([prof, data, serv]) => { const { api } = await import('/js/api.js'); try { await api('/agenda', { method: 'POST', body: { servicoId: serv, profissionalId: prof, data, horario: '10:00' } }); return 'gravou'; } catch (e) { return e.code; } }, [PROF_ANA, D, CORTE]);
  confere('servidor recusa fora da disponibilidade', fora === 'FORA_DA_DISPONIBILIDADE', fora);
  await a.click('#btnEscNovaExcecao'); await a.waitForSelector('#modalEscExcecao:not(.hidden)');
  await a.selectOption('#escExcAlvo', PROF_ANA); await a.selectOption('#escExcTipo', 'ausencia');
  await a.fill('#escExcDe', D); await a.fill('#escExcAte', D);
  await a.click('#btnEscExcSalvar'); await a.waitForSelector('#escExcErro:not(.hidden) .esc-conflitos');
  confere('conflito mostrado com o agendamento afetado', /15:00/.test(await a.textContent('#escExcErro')));
  confere('nada gravado sem decisão', !(await db('disponibilidade_excecoes')).some(e => e.tipo === 'ausencia'));
  await a.click('#btnEscManter'); await a.waitForSelector('#modalEscExcecao', { state: 'hidden' });
  confere('mantido e registrado; o agendamento continua', (await db('disponibilidade_excecoes')).some(e => e.tipo === 'ausencia') && (await db('agendamentos')).find(x => x.id === ag.id).status === 'agendado'
    && (await db('disponibilidade_eventos')).some(e => (e.decisoes || []).some(d => d.decisao === 'manter')));
  const origem = await slots(a, PROF_ANA, D);
  confere('origem da regra explicada na agenda', origem.slots.length === 0 && /ausente/i.test(origem.disponibilidade.origem), origem.disponibilidade.origem);
  const alvos = await a.$$eval('#escConteudo button, .esc-excecao button', ns => ns.filter(n => n.offsetParent).map(n => Math.round(n.getBoundingClientRect().height)));
  confere('alvos de toque ≥ 44px', alvos.every(h => h >= 44), JSON.stringify(alvos));
  // ---- Onda 2 (D-035): modelo pela tela e alteração em lote com prévia ----
  await a.click('#btnEscNovoModelo'); await a.waitForSelector('#modalEscSemanal:not(.hidden)');
  await a.fill('#escSemanalNome', 'Equipe de sábado');
  await a.click('#escSemana [data-esc-mais="6"]');
  await a.fill('#escSemana .esc-dia[data-dia="6"] .esc-ini', '08:00'); await a.fill('#escSemana .esc-dia[data-dia="6"] .esc-fim', '12:00');
  await a.click('#btnEscSemanalSalvar'); await a.waitForSelector('#modalEscSemanal', { state: 'hidden' });
  await a.waitForSelector('[data-esc-modelo-editar]');
  confere('modelo criado pela tela', (await db('escala_modelos')).some(m => m.nome === 'Equipe de sábado' && m.conteudo.length === 1));
  const L = add(D, 9);
  await a.click('#btnEscLote'); await a.waitForSelector('#modalEscLote:not(.hidden)');
  await a.check(`#escLoteAlvos input[data-lote-alvo="${PROF_ANA}"]`); await a.check(`#escLoteAlvos input[data-lote-alvo="${PROF_BRUNO}"]`);
  await a.selectOption('#escLoteAcao', 'ausencia');
  await a.fill('#escLoteDe', L); await a.fill('#escLoteAte', L); await a.fill('#escLoteMotivo', 'Treinamento');
  confere('aplicar só depois da prévia', await a.isDisabled('#btnEscLoteAplicar'));
  await a.click('#btnEscLotePrevia'); await a.waitForSelector('#escLotePrevia p');
  const previa = await a.textContent('#escLotePrevia');
  confere('prévia mostra quem e o quê, sem gravar', /Ana/.test(previa) && /Bruno/.test(previa) && /Ausência/.test(previa) && !(await db('disponibilidade_excecoes')).some(e => e.data_inicio === L), previa.replace(/\s+/g, ' ').slice(0, 160));
  await a.click('#btnEscLoteAplicar'); await a.waitForSelector('#modalEscLote', { state: 'hidden' });
  const aus = (await db('disponibilidade_excecoes')).filter(e => e.data_inicio === L && e.tipo === 'ausencia').map(e => e.profissional_id).sort();
  confere('lote aplicado aos dois', JSON.stringify(aus) === JSON.stringify([PROF_ANA, PROF_BRUNO].sort()), JSON.stringify(aus));
  console.log('ADMIN erros:', JSON.stringify(a.erros));
  await a.close();

  // ---- Recepção: vê, bloqueia, não muda horário da unidade nem escala ----
  const r = await entrar(b, 'recepcao@dev.local');
  await abrirEscalas(r);
  confere('recepção sem botões de horário da unidade, escala, lote e modelos', await r.locator('[data-esc-semanal], #btnEscLote, #btnEscNovoModelo').count() === 0);
  await r.click('#btnEscNovaExcecao'); await r.waitForSelector('#modalEscExcecao:not(.hidden)');
  const alvosRecep = await r.$$eval('#escExcAlvo option', os => os.map(o => o.value));
  confere('recepção não fecha a unidade', !alvosRecep.includes(''), JSON.stringify(alvosRecep));
  await r.keyboard.press('Escape').catch(() => {});
  console.log('RECEPÇÃO erros:', JSON.stringify(r.erros));
  await r.close();

  // ---- Profissional: vê só a própria escala e bloqueia o próprio horário ----
  const p = await entrar(b, 'profissional@dev.local');
  await abrirEscalas(p);
  const nomes = await p.$$eval('#escConteudo .esc-linha b', ns => ns.map(n => n.textContent));
  confere('profissional vê a unidade e só a própria escala', JSON.stringify(nomes) === '["Unidade","Ana"]', JSON.stringify(nomes));
  await p.click('#btnEscNovaExcecao'); await p.waitForSelector('#modalEscExcecao:not(.hidden)');
  const alvosProf = await p.$$eval('#escExcAlvo option', os => os.map(o => o.value));
  const tiposProf = await p.$$eval('#escExcTipo option', os => os.map(o => o.value));
  confere('profissional: só para si, só bloqueio e ausência', JSON.stringify(alvosProf) === JSON.stringify([PROF_ANA]) && !tiposProf.includes('horario'), `${alvosProf} ${tiposProf}`);
  const amanha2 = add(D, 1);
  await p.fill('#escExcDe', amanha2); await p.fill('#escExcAte', amanha2);
  await p.selectOption('#escExcTipo', 'bloqueio');
  await p.fill('#escExcPeriodos .esc-ini', '09:00'); await p.fill('#escExcPeriodos .esc-fim', '10:00');
  await p.fill('#escExcMotivo', 'Médico');
  await p.click('#btnEscExcSalvar'); await p.waitForSelector('#modalEscExcecao', { state: 'hidden' });
  const bloq = (await slots(p, PROF_ANA, amanha2)).slots.map(s => s.horario);
  confere('bloqueio do próprio horário vale nos horários oferecidos', !bloq.includes('09:00') && bloq.includes('10:00'), bloq.join(','));
  console.log('PROFISSIONAL erros:', JSON.stringify(p.erros));
  await p.close();

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
