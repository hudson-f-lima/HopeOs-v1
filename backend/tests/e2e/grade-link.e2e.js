// E2E (Playwright/Chromium): grade de horários do link público (D-069).
// Ana faz Corte em 45 min (override do seed) e o salão abre 09:00–13:00 com grade de 30.
// Com a Ana ocupada das 09:00 às 09:35 amanhã, o link oferece 09:35 → 10:20 → 11:05 → 11:50:
// a grade parte do início da janela livre e anda pela duração efetiva; 12:15 (borda final) fica de fora.
// A recepção usa a mesma grade (D-079): 09:35, 10:20, 11:05, 11:50; 10:00 e a borda 12:15 não aparecem.
// Nas três políticas, o link só oferece pontos dessa grade. Depois de reservar 10:20, a lista recomeça
// em cada janela livre: 09:35, 11:05, 11:50. Conta as reservas no banco de teste.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js grade-link
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const SLUG = process.env.DEV_PUBLIC_SLUG || 'salao-dev';
const API = 'http://127.0.0.1:3399';
const PUBLICO = `http://127.0.0.1:5599/agendar.html?apiBase=${API}/api&s=`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
async function login(email) {
  const s = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'dev12345' }) })).json();
  return { 'content-type': 'application/json', authorization: `Bearer ${s.data.access_token || s.data.session.access_token}` };
}

(async () => {
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const empresa = (await db('empresas'))[0];
  const ana = (await db('profissionais')).find(p => p.nome === 'Ana');
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const cliente = (await db('clientes'))[0];
  // Ocupa a Ana das 09:00 às 09:35 amanhã (35 min, fora da grade de 30 do salão).
  await fetch(`${API}/__db/agendamentos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([
    { id: randomUUID(), empresa_id: empresa.id, profissional_id: ana.id, servico_id: corte.id, cliente_id: cliente.id, data: amanha, horario: '09:00:00', duracao_min: 35, status: 'agendado', valor_centavos: 6000 }
  ]) });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));

  async function horariosNoLink() {
    await p.locator('#listaServicos .opcao', { hasText: 'Corte' }).click();
    await p.locator('#listaProfissionais .opcao', { hasText: 'Ana' }).click();
    await p.click(`#listaDias [data-dia="${amanha}"]`);
    await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
    return p.locator('#listaHorarios .horario').allInnerTexts();
  }

  await p.goto(PUBLICO + SLUG);
  await p.waitForSelector('#fluxo:not([hidden])', { timeout: 10000 });
  const lista = await horariosNoLink();
  console.log('LINK (navegador):', lista.join(' → '));
  confere('exemplo do dono: 09:35 → 10:20 → 11:05', lista.slice(0, 3).join(',') === '09:35,10:20,11:05');
  confere('grade inteira pela duração; borda 12:15 fora', lista.join(',') === '09:35,10:20,11:05,11:50');

  const recep = await login('recepcao@dev.local');
  const rRecep = await (await fetch(`${API}/api/agenda/slots?data=${amanha}&profissionalId=${ana.id}&servicoId=${corte.id}`, { headers: recep })).json();
  const recepH = rRecep.data.slots.map(s => s.horario);
  console.log('RECEPÇÃO:', recepH.join(' '));
  confere('recepção usa a mesma grade do link (D-079)', recepH.join(',') === '09:35,10:20,11:05,11:50', recepH.join(','));

  const admin = await login('admin@dev.local');
  for (const pol of ['flexivel', 'equilibrada', 'compacta']) {
    await fetch(`${API}/api/empresa`, { method: 'PATCH', headers: admin, body: JSON.stringify({ agendaPolitica: pol }) });
    const s = (await (await fetch(`${API}/api/public/agendar/${SLUG}/slots?servicoId=${corte.id}&profissionalId=${ana.id}&data=${amanha}`)).json()).data.slots;
    console.log(`POLÍTICA ${pol}:`, s.join(' '));
    confere(`${pol}: só pontos da grade do link`, s.length > 0 && s.every(h => ['09:35', '10:20', '11:05', '11:50'].includes(h)));
  }
  await fetch(`${API}/api/empresa`, { method: 'PATCH', headers: admin, body: JSON.stringify({ agendaPolitica: null }) });

  // Reserva 10:20 pelo navegador; a lista recomeça em cada janela livre.
  await p.goto(PUBLICO + SLUG);
  await p.waitForSelector('#fluxo:not([hidden])', { timeout: 10000 });
  await horariosNoLink();
  await p.click('#listaHorarios [data-horario="10:20"]');
  await p.fill('#nome', 'Grade Link');
  await p.fill('#whatsapp', '(11) 97777-0505');
  await p.check('#consentimento');
  await p.click('#btnAgendar');
  await p.waitForSelector('#secConfirmacao:not([hidden])', { timeout: 10000 });
  const ids = (await db('clientes')).filter(c => c.nome === 'Grade Link').map(c => c.id);
  const reservas = (await db('agendamentos')).filter(a => ids.includes(a.cliente_id));
  console.log('RESERVAS:', reservas.length, reservas.map(a => `${a.horario} ${a.duracao_min}min`).join(','));
  confere('1 reserva às 10:20 com 45 min', reservas.length === 1 && reservas[0].horario.startsWith('10:20') && Number(reservas[0].duracao_min) === 45);
  await p.click('#btnNovo');
  const depois = await horariosNoLink();
  console.log('LINK depois de reservar 10:20:', depois.join(' → '));
  confere('grade recomeça em cada janela livre', depois.join(',') === '09:35,11:05,11:50');

  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página', erros.length === 0, JSON.stringify(erros));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-grade-link.png'), fullPage: true });
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
