// E2E (Playwright/Chromium): revisão da oferta no link público (D-068).
// 1) O resumo antes de confirmar mostra fim, duração, preço e prazo de cancelamento vindos do servidor.
// 2) O preço muda entre a escolha e o envio: OFERTA_ALTERADA, a lista recarrega e nada é gravado;
//    ao escolher de novo, o resumo traz o preço novo e grava uma vez.
// 3) Toque duplo durante o envio (e toque em outro horário com o pedido no ar): um POST, uma reserva.
// 4) Dois POSTs simultâneos com o mesmo pedido, fora do navegador: uma reserva.
// Cada cenário confere no banco de teste (/__db/agendamentos) quantas reservas gerou.
// Requer: DEV_PUBLIC_SLUG=salao-dev node backend/scripts/dev-memory-api.js + PWA em :5599.
// Uso: NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js agendar-oferta
const { chromium } = require('playwright');
const SLUG = process.env.DEV_PUBLIC_SLUG || 'salao-dev';
const API = 'http://127.0.0.1:3399';
const PUBLICO = `http://127.0.0.1:5599/agendar.html?apiBase=${API}/api&s=`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();

async function reservasDe(nome) {
  const ids = (await db('clientes')).filter(c => c.nome === nome).map(c => c.id);
  return (await db('agendamentos')).filter(a => ids.includes(a.cliente_id));
}
async function login(email) {
  const s = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'dev12345' }) })).json();
  return { 'content-type': 'application/json', authorization: `Bearer ${s.data.access_token || s.data.session.access_token}` };
}

(async () => {
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const servicoBarba = (await db('servicos')).find(s => s.nome === 'Barba');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
  });
  const p = await ctx.newPage();
  const erros = [];
  let posts = 0;
  p.on('pageerror', e => erros.push(e.message));
  p.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === `/api/public/agendar/${SLUG}`) posts++; });

  async function escolher(horario) {
    await p.locator('#listaServicos .opcao', { hasText: 'Barba' }).click();
    await p.locator('#listaProfissionais .opcao', { hasText: 'Ana' }).click();
    await p.click(`#listaDias [data-dia="${amanha}"]`);
    await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
    const horarios = await p.locator('#listaHorarios .horario').allInnerTexts();
    const h = horario || horarios[0];
    await p.click(`#listaHorarios [data-horario="${h}"]`);
    return { h, horarios };
  }
  async function preencher(nome, whatsapp) {
    await p.fill('#nome', nome);
    await p.fill('#whatsapp', whatsapp);
    if (!(await p.isChecked('#consentimento'))) await p.check('#consentimento');
  }

  await p.goto(PUBLICO + SLUG);
  await p.waitForSelector('#fluxo:not([hidden])', { timeout: 10000 });

  // 1) Resumo revisado.
  const c1 = await escolher();
  const resumo1 = limpo(await p.textContent('#resumoEscolha'));
  const fim1 = (() => { const [hh, mm] = c1.h.split(':').map(Number); const t = hh * 60 + mm + 30; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
  console.log('RESUMO:', resumo1);
  confere('resumo mostra fim e duração', resumo1.includes(`às ${c1.h} até ${fim1} (30 min)`));
  confere('resumo mostra preço', /R\$\s?40,00/.test(resumo1));
  confere('resumo mostra prazo de cancelamento', resumo1.includes('Cancelamento até 2 h antes.'));
  await preencher('Oferta Resumo', '(11) 97777-0101');
  posts = 0;
  await p.click('#btnAgendar');
  await p.waitForSelector('#secConfirmacao:not([hidden])', { timeout: 10000 });
  const prazoConf = limpo(await p.textContent('#confirmacaoPrazo'));
  confere('confirmação usa o prazo devolvido pelo servidor', /até 2 h antes/.test(prazoConf), prazoConf);
  const r1 = await reservasDe('Oferta Resumo');
  console.log('RESERVAS cenário 1 (resumo):', r1.length, '| POSTs:', posts);
  confere('cenário 1 gera 1 reserva', r1.length === 1 && r1[0].horario.slice(0, 5) === c1.h);

  // 2) Oferta muda antes de confirmar.
  await p.click('#btnNovo');
  const c2 = await escolher();
  await preencher('Oferta Mudou', '(11) 97777-0202');
  const admin = await login('admin@dev.local');
  const patch = await fetch(`${API}/api/servicos/${servicoBarba.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ valorCentavos: 4500 }) });
  confere('preço do serviço alterado pela gestão', patch.status === 200, String(patch.status));
  posts = 0;
  await p.click('#btnAgendar');
  await p.waitForFunction(() => !document.getElementById('aviso').hidden && /condições mudaram/i.test(document.getElementById('aviso').textContent), null, { timeout: 10000 });
  await p.waitForSelector('#listaHorarios .horario', { timeout: 10000 });
  const aviso2 = limpo(await p.textContent('#aviso'));
  const dadosOcultos = await p.locator('#secDados').isHidden();
  const semReserva = await reservasDe('Oferta Mudou');
  console.log('OFERTA ALTERADA:', aviso2, '| dados ocultos:', dadosOcultos, '| RESERVAS cenário 2 após recusa:', semReserva.length, '| POSTs:', posts);
  confere('recusa avisa que as condições mudaram', /condições mudaram/i.test(aviso2));
  confere('lista recarregada e formulário recolhido', dadosOcultos && (await p.locator(`#listaHorarios [data-horario="${c2.h}"]`).count()) === 1);
  confere('recusa não grava reserva', semReserva.length === 0);
  await p.click(`#listaHorarios [data-horario="${c2.h}"]`);
  const resumo2 = limpo(await p.textContent('#resumoEscolha'));
  confere('resumo revisado traz o preço novo', /R\$\s?45,00/.test(resumo2), resumo2);
  await p.click('#btnAgendar');
  await p.waitForSelector('#secConfirmacao:not([hidden])', { timeout: 10000 });
  const r2 = await reservasDe('Oferta Mudou');
  console.log('RESERVAS cenário 2 após revisar:', r2.length, '| valor:', r2[0] && r2[0].valor_centavos, '| POSTs:', posts);
  confere('cenário 2 gera 1 reserva, com o preço revisado', r2.length === 1 && Number(r2[0].valor_centavos) === 4500);

  // 3) Toque duplo durante o envio (pedido segurado 1,5 s).
  await p.click('#btnNovo');
  const c3 = await escolher();
  await preencher('Toque Duplo', '(11) 97777-0303');
  const resumoAntes = limpo(await p.textContent('#resumoEscolha'));
  let liberar;
  const segurado = new Promise(r => { liberar = r; });
  await p.route(`**/api/public/agendar/${SLUG}`, async rota => {
    if (rota.request().method() !== 'POST') return rota.continue();
    await segurado; return rota.continue();
  });
  posts = 0;
  const botao = await p.locator('#btnAgendar').boundingBox();
  await p.mouse.dblclick(botao.x + botao.width / 2, botao.y + botao.height / 2);
  await p.waitForTimeout(150);
  const travado = await p.evaluate(() => ({ inert: document.getElementById('fluxo').inert, disabled: document.getElementById('btnAgendar').disabled }));
  await p.mouse.click(botao.x + botao.width / 2, botao.y + botao.height / 2);
  await p.evaluate(() => document.getElementById('formDados').requestSubmit());
  const outro = p.locator(`#listaHorarios .horario:not([data-horario="${c3.h}"])`).first();
  const caixa = await outro.boundingBox().catch(() => null);
  if (caixa) await p.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  const resumoDurante = limpo(await p.textContent('#resumoEscolha'));
  liberar();
  await p.waitForSelector('#secConfirmacao:not([hidden])', { timeout: 10000 });
  await p.unroute(`**/api/public/agendar/${SLUG}`);
  const r3 = await reservasDe('Toque Duplo');
  console.log('TOQUE DUPLO: travado', JSON.stringify(travado), '| POSTs:', posts, '| RESERVAS cenário 3:', r3.length);
  confere('fluxo travado durante o envio', travado.inert === true && travado.disabled === true);
  confere('escolha não muda com o pedido no ar', resumoDurante === resumoAntes);
  confere('toque duplo envia 1 POST', posts === 1, String(posts));
  confere('cenário 3 gera 1 reserva, no horário escolhido', r3.length === 1 && r3[0].horario.slice(0, 5) === c3.h);

  // 4) Dois POSTs simultâneos do mesmo pedido (fora do navegador): a trava por número e a 027 seguram.
  const slots = (await (await fetch(`${API}/api/public/agendar/${SLUG}/slots?servicoId=${servicoBarba.id}&profissionalId=${(await db('profissionais')).find(x => x.nome === 'Ana').id}&data=${amanha}`)).json()).data;
  const o4 = slots.ofertas[0];
  const corpo = { servicoId: servicoBarba.id, profissionalId: (await db('profissionais')).find(x => x.nome === 'Ana').id, data: amanha, horario: o4.horario, nome: 'Dois Envios', whatsapp: '(11) 97777-0404', consentimento: true, website: '', versaoOferta: o4.versaoOferta };
  const envio = () => fetch(`${API}/api/public/agendar/${SLUG}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }).then(async r => ({ status: r.status, code: ((await r.json()).error || {}).code }));
  const [e1, e2] = await Promise.all([envio(), envio()]);
  const r4 = await reservasDe('Dois Envios');
  console.log('DOIS ENVIOS:', JSON.stringify([e1, e2]), '| RESERVAS cenário 4:', r4.length);
  confere('dois envios simultâneos: exatamente um 201', [e1, e2].filter(e => e.status === 201).length === 1);
  confere('cenário 4 gera 1 reserva', r4.length === 1);

  // Restaura o preço do seed para não afetar outros casos neste processo (cada caso tem o seu, mas por via das dúvidas).
  await fetch(`${API}/api/servicos/${servicoBarba.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ valorCentavos: 4000 }) });

  const csp = await p.evaluate(() => window.__csp);
  confere('sem violação de CSP', csp.length === 0, JSON.stringify(csp));
  confere('sem erro de página', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
