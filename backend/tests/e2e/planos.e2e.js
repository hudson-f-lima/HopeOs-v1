// E2E (Playwright/Chromium): Gestão → Planos (assinatura, Onda A fase 1; D-042). O proprietário cria
// o plano do exemplo do dono (corte de terça a quinta; fora da regra cobra 50% e gasta 1 uso, até 2
// por ciclo), simula sábado e quarta, edita o preço e arquiva outro plano. A recepção vê e simula,
// sem criar nem editar. O profissional não vê a aba.
const { chromium } = require('playwright');
const { irParaGestao } = require('./navegacao');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();

// Próximo dia da semana (0 = domingo) a partir de amanhã, no fuso do salão.
function proximo(diaSemana) {
  const d = new Date(Date.now() + 864e5);
  for (let i = 0; i < 8; i++) {
    const s = new Date(d.getTime() + i * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    if (new Date(`${s}T12:00:00Z`).getUTCDay() === diaSemana) return s;
  }
  return null;
}

(async () => {
  const b = await chromium.launch();
  const errs = []; const csp = [];
  const nova = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => {
      if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
      else if (m.type() === 'error' && !/40[0-9]|Failed to load/.test(m.text())) errs.push(m.text());
    });
    p.on('dialog', d => d.accept());
    return p;
  };
  const login = async (p, email) => {
    await p.goto(APP);
    await p.waitForSelector('#loginScreen:not(.hidden)');
    await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
    await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  };
  const abrirPlanos = async p => {
    await irParaGestao(p);
    const aba = p.locator('#subtabBtnPlanos');
    if (!(await aba.isVisible())) return false;
    await aba.click();
    // Espera a lista de verdade: o "Carregando…" inicial também é um <p> e enganava a espera.
    await p.waitForFunction(() => { const c = document.getElementById('planosConteudo'); return c && c.textContent.trim() !== '' && !/Carregando/.test(c.textContent); }, null, { timeout: 8000 });
    return true;
  };

  // 1) Proprietário cria o plano.
  const p = await nova();
  await login(p, 'admin@dev.local');
  if (!(await abrirPlanos(p))) errs.push('proprietário não vê a aba Planos');
  await p.click('#btnPlanoNovo');
  await p.fill('#planoNome', 'Smart Corte 3ª a 5ª');
  await p.fill('#planoPreco', '94,90');
  const item = p.locator('#planoItens .plano-item').first();
  await item.locator('[data-c="servicoId"]').selectOption({ label: 'Corte' });
  await item.locator('[data-c="limitePorCiclo"]').fill('4');
  for (const d of [2, 3, 4]) await item.locator(`[data-dia="${d}"]`).check();
  await p.locator('#formPlano [data-prof]').nth(1).check(); // Bruno
  await p.selectOption('#planoForaAcao', 'cobrar_percentual_consumir');
  await p.fill('#planoForaPct', '50');
  await p.fill('#planoForaTeto', '2');
  await p.click('#btnPlanoSalvar');
  await p.waitForSelector('.plano-card', { timeout: 8000 });
  const salvo = (await db('assinatura_planos')).find(x => x.nome === 'Smart Corte 3ª a 5ª');
  const itens = (await db('assinatura_plano_itens')).filter(i => salvo && i.plano_id === salvo.id);
  const profs = (await db('assinatura_plano_profissionais')).filter(i => salvo && i.plano_id === salvo.id);
  console.log('PLANO SALVO:', JSON.stringify(salvo && { preco: salvo.preco_centavos, fora: salvo.fora_regra_acao, pct: salvo.fora_regra_percentual, teto: salvo.fora_regra_teto_ciclo, comissao: [salvo.comissao_regra, salvo.comissao_percentual] }),
    '| itens:', JSON.stringify(itens.map(i => [i.limite_por_ciclo, i.dias_semana])), '| profissionais:', profs.length);
  if (!salvo || salvo.preco_centavos !== 9490 || salvo.fora_regra_acao !== 'cobrar_percentual_consumir' || Number(salvo.fora_regra_percentual) !== 50 || salvo.fora_regra_teto_ciclo !== 2) errs.push('plano gravado errado');
  if (itens.length !== 1 || itens[0].limite_por_ciclo !== 4 || JSON.stringify(itens[0].dias_semana) !== '[2,3,4]' || profs.length !== 1) errs.push('itens/profissionais gravados errado');
  console.log('CARD:', (await p.locator('.plano-card').first().innerText()).replace(/\s+/g, ' ').slice(0, 220));

  // 2) Simular sábado (fora da regra) e quarta (coberto), com o Bruno.
  const simular = async data => {
    const card = p.locator('.plano-card').first();
    if (!(await card.locator('.plano-sim').count())) await card.locator('[data-plano-acao="simular"]').click();
    await card.locator('[data-s="profissionalId"]').selectOption({ label: 'Bruno' });
    await card.locator('[data-s="data"]').fill(data);
    await card.locator('[data-s="usosNoCiclo"]').fill('1');
    await card.locator('.plano-sim button[type="submit"]').click();
    await p.waitForFunction(() => (document.querySelector('.plano-sim-resultado') || {}).textContent, null, { timeout: 8000 });
    const t = (await card.locator('.plano-sim-resultado').innerText()).trim();
    await p.evaluate(() => { document.querySelector('.plano-sim-resultado').textContent = ''; });
    return t;
  };
  const sab = await simular(proximo(6));
  console.log('SIMULAÇÃO SÁBADO:', sab);
  if (!/Fora da regra/.test(sab) || !/R\$\s*30,00/.test(sab) || !/gasta 1 uso/.test(sab)) errs.push('simulação de sábado errada');
  const qua = await simular(proximo(3));
  console.log('SIMULAÇÃO QUARTA:', qua);
  if (!/Coberto/.test(qua) || !/R\$\s*0,00/.test(qua)) errs.push('simulação de quarta errada');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-planos.png'), fullPage: true });

  // 3) Editar o preço e criar/arquivar outro plano.
  await p.locator('.plano-card').first().locator('[data-plano-acao="editar"]').click();
  await p.fill('#planoPreco', '99,90');
  await p.click('#btnPlanoSalvar'); await p.waitForTimeout(800);
  const editado = (await db('assinatura_planos')).find(x => x.nome === 'Smart Corte 3ª a 5ª');
  console.log('EDITADO:', editado && editado.preco_centavos);
  if (!editado || editado.preco_centavos !== 9990) errs.push('edição não gravou');
  await p.click('#btnPlanoNovo');
  await p.fill('#planoNome', 'Plano temporário'); await p.fill('#planoPreco', '10,00');
  await p.locator('#planoItens .plano-item [data-c="servicoId"]').first().selectOption({ label: 'Barba' });
  await p.click('#btnPlanoSalvar'); await p.waitForTimeout(800);
  const cardTemp = p.locator('.plano-card', { hasText: 'Plano temporário' });
  await cardTemp.locator('[data-plano-acao="arquivar"]').click(); await p.waitForTimeout(800);
  const temp = (await db('assinatura_planos')).find(x => x.nome === 'Plano temporário');
  console.log('ARQUIVADO:', Boolean(temp && temp.arquivado_em), '| some da lista:', !(await p.locator('.plano-card', { hasText: 'Plano temporário' }).count()));
  if (!temp || !temp.arquivado_em || await p.locator('.plano-card', { hasText: 'Plano temporário' }).count()) errs.push('arquivar falhou');
  // Erro do servidor aparece no formulário (nome repetido).
  await p.click('#btnPlanoNovo');
  await p.fill('#planoNome', 'smart corte 3ª a 5ª'); await p.fill('#planoPreco', '1,00');
  await p.locator('#planoItens .plano-item [data-c="servicoId"]').first().selectOption({ label: 'Corte' });
  await p.click('#btnPlanoSalvar'); await p.waitForTimeout(800);
  const msg = (await p.textContent('#planoMsg')).trim();
  console.log('NOME REPETIDO:', msg);
  if (!/Já existe um plano/.test(msg)) errs.push('erro de nome repetido não apareceu');
  const viol1 = await p.evaluate(() => window.__csp);

  // 4) Recepção: vê e simula, sem criar nem editar.
  const r = await nova();
  await login(r, 'recepcao@dev.local');
  const veRecep = await abrirPlanos(r);
  const novoRecep = await r.locator('#btnPlanoNovo').count();
  const editarRecep = await r.locator('[data-plano-acao="editar"]').count();
  const simularRecep = await r.locator('[data-plano-acao="simular"]').count();
  console.log('RECEPÇÃO vê:', veRecep, '| novo:', novoRecep, '| editar:', editarRecep, '| simular:', simularRecep);
  if (!veRecep || novoRecep || editarRecep || !simularRecep) errs.push('recepção com acesso errado');

  // 5) Profissional: sem a aba.
  const pr = await nova();
  await login(pr, 'profissional@dev.local');
  await irParaGestao(pr);
  const vePro = await pr.locator('#subtabBtnPlanos').isVisible().catch(() => false);
  console.log('PROFISSIONAL vê Planos:', vePro);
  if (vePro) errs.push('profissional vê Planos');

  const violacoes = [...viol1, ...await r.evaluate(() => window.__csp), ...csp];
  console.log('VIOLAÇÕES CSP:', JSON.stringify(violacoes)); if (violacoes.length) process.exitCode = 1;
  console.log('ERROS:', JSON.stringify(errs)); if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
