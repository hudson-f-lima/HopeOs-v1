// E2E (Playwright/Chromium): Gestão → Assinantes (assinatura, Onda A fase 2; D-043). O plano é criado
// pela API (a tela de planos tem o próprio E2E). A recepção assina o plano para um cliente com o 1º
// ciclo pago e vê "Em dia"; assina outro cliente com início há 40 dias, sem pagar, vê "Suspensa",
// registra os pagamentos e vê "Em dia". O proprietário pausa, retoma e agenda o cancelamento. A
// recepção não vê pausar nem cancelar. O profissional não vê a aba.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const fuso = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

(async () => {
  // Plano pela API, como o proprietário.
  const sessao = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@dev.local', password: 'dev12345' }) })).json();
  const token = sessao.data.access_token || sessao.data.session.access_token;
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const servicos = (await (await fetch(`${API}/api/catalog`, { headers: auth })).json()).data.servicos;
  const corte = servicos.find(s => s.nome === 'Corte');
  const plano = await (await fetch(`${API}/api/assinaturas/planos`, { method: 'POST', headers: auth, body: JSON.stringify({ nome: 'Clube Corte', precoCentavos: 11500, comissao: { regra: 'rateio', percentual: 50 }, itens: [{ servicoId: corte.id, limitePorCiclo: 4 }] }) })).json();
  console.log('PLANO PELA API:', plano.ok, plano.data && plano.data.nome);
  const novo = await (await fetch(`${API}/api/clientes`, { method: 'POST', headers: auth, body: JSON.stringify({ nome: 'Cliente Atrasado', whatsapp: '11 98888-7777' }) })).json();
  if (!novo.ok) console.log('CLIENTE NOVO falhou:', JSON.stringify(novo));
  const clientes = (await (await fetch(`${API}/api/catalog`, { headers: auth })).json()).data.clientes;
  console.log('CLIENTES NO SEED:', clientes.length);

  const b = await chromium.launch();
  const errs = []; const csp = [];
  const nova = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text()); });
    return p;
  };
  const login = async (p, email) => {
    await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
    await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
    await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  };
  const abrir = async p => {
    await p.click('#navGestao'); await p.waitForSelector('#tab-gestao:not(.hidden)');
    if (!(await p.locator('#subtabBtnAssinantes').isVisible())) return false;
    await p.click('#subtabBtnAssinantes');
    await p.waitForFunction(() => { const c = document.getElementById('assinantesConteudo'); return c && !/Carregando/.test(c.textContent); }, null, { timeout: 8000 });
    return true;
  };
  const cardDe = (p, nome) => p.locator('.assinante-card', { hasText: nome });

  // 1) Recepção vende com o 1º ciclo pago.
  const r = await nova();
  r.on('dialog', d => d.accept(d.type() === 'prompt' ? 'pix' : undefined));
  await login(r, 'recepcao@dev.local');
  if (!(await abrir(r))) errs.push('recepção não vê Assinantes');
  const [c1, c2] = clientes;
  await r.click('#btnAssNova');
  await r.selectOption('#assCliente', c1.id); await r.selectOption('#assPlano', plano.data.id);
  await r.click('#btnAssSalvar');
  await r.waitForSelector('.assinante-card', { timeout: 8000 });
  const t1 = (await cardDe(r, c1.nome).innerText()).replace(/\s+/g, ' ');
  console.log('VENDA PAGA:', t1.slice(0, 160));
  if (!/Em dia/.test(t1) || !/Corte: 0 de 4/.test(t1)) errs.push('venda paga não ficou em dia');

  // 2) Outro cliente com início há 40 dias, sem pagar → suspensa; pagar os ciclos → em dia.
  await r.click('#btnAssNova');
  await r.selectOption('#assCliente', c2.id); await r.selectOption('#assPlano', plano.data.id);
  await r.fill('#assInicio', fuso(new Date(Date.now() - 40 * 864e5)));
  await r.uncheck('#assPagoAgora');
  await r.click('#btnAssSalvar');
  await r.waitForSelector(`.assinante-card:has-text("${c2.nome}")`, { timeout: 8000 });
  const t2 = (await cardDe(r, c2.nome).innerText()).replace(/\s+/g, ' ');
  console.log('SEM PAGAR:', t2.slice(0, 200));
  if (!/Suspensa/.test(t2)) errs.push('sem pagar não ficou suspensa');
  for (let i = 0; i < 3 && (await cardDe(r, c2.nome).locator('[data-ass-pagar]').count()); i++) {
    await cardDe(r, c2.nome).locator('[data-ass-pagar]').first().click(); await r.waitForTimeout(700);
  }
  const t3 = (await cardDe(r, c2.nome).innerText()).replace(/\s+/g, ' ');
  const pagas = (await db('assinatura_cobrancas')).filter(c => c.estado === 'paga');
  console.log('DEPOIS DE PAGAR:', t3.slice(0, 120), '| cobranças pagas no banco:', pagas.length, '| valores:', JSON.stringify([...new Set(pagas.map(p => p.valor_centavos))]));
  if (!/Em dia/.test(t3)) errs.push('pagar não deixou em dia');
  if (pagas.some(p => p.valor_centavos !== 11500)) errs.push('valor da cobrança diferente do plano');
  const resumoRecep = await r.locator('#assResumoMes').count();
  console.log('RECEPÇÃO vê o resumo do mês:', resumoRecep);
  if (resumoRecep) errs.push('recepção vê o resumo financeiro do mês');
  const botoesRecep = await r.locator('[data-ass-acao]').count();
  console.log('RECEPÇÃO vê pausar/cancelar:', botoesRecep);
  if (botoesRecep) errs.push('recepção vê pausar/cancelar');
  await r.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-assinantes.png'), fullPage: true });
  const violR = await r.evaluate(() => window.__csp);

  // 3) Proprietário: pausar, retomar, cancelar no fim do ciclo.
  const a = await nova();
  a.on('dialog', d => d.accept());
  await login(a, 'admin@dev.local');
  await abrir(a);
  await a.waitForSelector('#assResumoTotais', { timeout: 8000 });
  const totais = (await a.textContent('#assResumoTotais')).trim();
  console.log('RESUMO DO MÊS (gestão):', totais);
  const aberto = (await a.locator('#assResumoAberto').count()) ? (await a.textContent('#assResumoAberto')).trim() : '';
  console.log('EM ABERTO (gestão):', aberto);
  // D-045: pagos hoje, os ciclos ainda não venceram → a comissão fica prevista, não liberada.
  if (!/^Liberado no mês: bruto R\$/.test(totais) || !/comissão prevista/.test(aberto)) errs.push('resumo do mês sem liberado/previsto');
  await cardDe(a, c1.nome).locator('[data-ass-acao="pausar"]').click(); await a.waitForTimeout(700);
  const pausada = (await cardDe(a, c1.nome).innerText()).replace(/\s+/g, ' ');
  await cardDe(a, c1.nome).locator('[data-ass-acao="retomar"]').click(); await a.waitForTimeout(700);
  const retomada = (await cardDe(a, c1.nome).innerText()).replace(/\s+/g, ' ');
  await cardDe(a, c1.nome).locator('[data-ass-acao="cancelar"]').click(); await a.waitForTimeout(800);
  const cancelada = (await cardDe(a, c1.nome).innerText()).replace(/\s+/g, ' ');
  const linha = (await db('assinaturas')).find(x => x.cliente_id === c1.id);
  console.log('PAUSADA:', /Pausada/.test(pausada), '| RETOMADA em dia:', /Em dia/.test(retomada), '| CANCELAMENTO:', cancelada.match(/Cancelamento agendado[^.]*\./)?.[0], '| banco:', linha.status, linha.cancelar_no_fim_do_ciclo);
  if (!/Pausada/.test(pausada) || !/Em dia/.test(retomada) || !/Cancelamento agendado/.test(cancelada) || linha.status !== 'cancelada' || !linha.cancelar_no_fim_do_ciclo) errs.push('pausar/retomar/cancelar falhou');

  // 4) Profissional sem a aba.
  const pr = await nova();
  await login(pr, 'profissional@dev.local');
  await pr.click('#navGestao'); await pr.waitForSelector('#tab-gestao:not(.hidden)');
  const vePro = await pr.locator('#subtabBtnAssinantes').isVisible().catch(() => false);
  console.log('PROFISSIONAL vê Assinantes:', vePro);
  if (vePro) errs.push('profissional vê Assinantes');

  const violacoes = [...violR, ...await a.evaluate(() => window.__csp), ...csp];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
