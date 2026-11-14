// E2E (Playwright/Chromium): metas do mês e ranking (D-019, migration 011), sob a CSP
// de produção. Admin define metas e liga o ranking; profissional vê só as próprias
// metas e o ranking sem o valor em reais do colega; recepção não vê nada disso.
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };

async function entrar(b, email, esperados = []) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { const rota = `${r.status()} ${new URL(r.url()).pathname}`; if (r.status() >= 400 && !esperados.includes(rota)) p.erros.push(rota); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
const abrirGanhos = async p => { await p.click('#navAvatar'); await p.waitForSelector('#sheetGestao:not(.hidden)'); await p.click('#subtabBtnGanhos'); };

(async () => {
  const servicos = await db('servicos'); const profs = await db('profissionais');
  const corte = servicos.find(s => s.nome === 'Corte'); const barba = servicos.find(s => s.nome === 'Barba');
  const ana = profs.find(p => p.nome === 'Ana'); const outro = profs.find(p => p.id !== ana.id);
  // Ana: Barba 40,00 (1 atendimento). Colega: Corte 60,00 → colega em 1º, Ana em 2º com 66% do líder.
  const pomada = await legado('/produtos', { nome: 'Pomada', custoCentavos: 1000, precoVendaCentavos: 3000, estoqueInicial: 10 });
  const c1 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-mt-1', itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }, { tipo: 'produto', produtoId: pomada.data.id, quantidade: 1, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 7000 }] });
  const c2 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-mt-2', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: outro.id }], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] });
  confere('checkouts do seed', c1.ok && c2.ok, JSON.stringify([c1.error, c2.error]));

  // Histórico da Ana nos 3 meses anteriores (Barba 40,00 por mês) para a sugestão de meta.
  const mesAnterior = k => { const [y, m] = hojeSP.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 - k, 10)); return d.toISOString().slice(0, 10); };
  const semear = (t, linhas) => fetch(`${API}/__db/${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(linhas) }).then(r => r.json());
  const empresaId = ana.empresa_id;
  const h1 = await semear('comandos', [1, 2, 3].map(k => ({ id: `hist-${k}`, empresa_id: empresaId, data: mesAnterior(k) })));
  const h2 = await semear('comando_itens', [1, 2, 3].map(k => ({ id: `hist-i${k}`, empresa_id: empresaId, comando_id: `hist-${k}`, tipo: 'servico', profissional_id: ana.id, quantidade: 1, valor_liquido_centavos: 4000 })));
  confere('histórico de 3 meses semeado', h1.ok && h2.ok);

  const b = await chromium.launch();

  // ---- Profissional antes: sem meta e sem ranking ----
  const antes = await entrar(b, 'profissional@dev.local');
  await abrirGanhos(antes); await antes.waitForSelector('#metasBloco:not(.hidden)');
  confere('profissional (antes): aviso de que não há meta', /não definiu meta/.test(await antes.textContent('#metasLista')));
  confere('profissional (antes): ranking escondido e sem formulário de meta', !(await antes.isVisible('#rankingBloco')) && !(await antes.isVisible('#metasForm')));
  console.log('PROFISSIONAL ANTES erros:', JSON.stringify(antes.erros));

  // ---- Admin: define metas e liga o ranking ----
  const a = await entrar(b, 'admin@dev.local');
  await abrirGanhos(a); await a.waitForSelector('#rankingBloco:not(.hidden)');
  confere('admin: ranking com valores em reais', (await a.textContent('#rankingLista')).includes('R$') && await a.getAttribute('#rankingLista [data-posicao="1"]', 'data-voce') === '0');
  await a.selectOption('#ganhosProfissional', ana.id); await a.waitForSelector('#metasForm:not(.hidden)');
  await a.fill('#metaFaturamento', '80,00'); await a.fill('#metaProdutos', '60,00'); await a.fill('#metaAtendimentos', '1'); await a.click('#btnSalvarMetas');
  await a.waitForSelector('[data-meta="faturamento"]');
  confere('admin: meta de faturamento 40,00 de 80,00 = 50%', await a.getAttribute('[data-meta="faturamento"]', 'data-percentual') === '50' && await a.getAttribute('[data-meta="faturamento"]', 'data-atingida') === '0');
  confere('admin: meta de atendimentos 1 de 1 atingida', await a.getAttribute('[data-meta="atendimentos"]', 'data-atingida') === '1');
  const metas = await db('metas');
  confere('admin: meta de produtos 30,00 de 60,00 = 50%', await a.getAttribute('[data-meta="produtos"]', 'data-percentual') === '50');
  confere('admin: 3 metas gravadas com autor', metas.length === 3 && metas.every(m => m.profissional_id === ana.id && Boolean(m.created_by)) && metas.find(m => m.tipo === 'faturamento').valor_alvo === 8000);
  await a.fill('#metaAtendimentos', ''); await a.click('#btnSalvarMetas');
  await a.waitForFunction(() => document.querySelectorAll('#metasLista [data-meta]').length === 2);
  confere('admin: campo vazio remove a meta', (await db('metas')).length === 2);
  // Sugestão de meta: média de 3 meses (40,00) + 5% = 42,00. Só preenche; não grava.
  await a.click('#btnSugerirMetas');
  await a.waitForFunction(() => /Média de/.test(document.getElementById('metasSugestaoMsg').textContent));
  confere('admin: sugestão preenche 42,00 e 1 atendimento', await a.inputValue('#metaFaturamento') === '42,00' && await a.inputValue('#metaAtendimentos') === '1', `${await a.inputValue('#metaFaturamento')} / ${await a.inputValue('#metaAtendimentos')}`);
  confere('admin: sugestão não grava sozinha', (await db('metas')).length === 2 && (await db('metas')).find(m => m.tipo === 'faturamento').valor_alvo === 8000);
  await a.selectOption('#ganhosProfissional', outro.id); await a.waitForTimeout(600);
  await a.click('#btnSugerirMetas');
  await a.waitForFunction(() => /Sem histórico/.test(document.getElementById('metasSugestaoMsg').textContent));
  confere('admin: colega sem 3 meses de histórico não recebe sugestão', await a.inputValue('#metaFaturamento') === '');
  await a.selectOption('#ganhosProfissional', ana.id); await a.waitForTimeout(600);
  confere('admin: voltar para a Ana mostra a meta gravada (80,00)', await a.inputValue('#metaFaturamento') === '80,00');
  await a.selectOption('#rankingCriterio', 'produtos');
  await a.waitForFunction(nome => (document.querySelector('#rankingLista [data-posicao="1"]') || {}).textContent?.includes(nome), ana.nome);
  confere('admin: ranking por produtos põe a Ana em 1º com 30,00', (await a.textContent('#rankingLista [data-posicao="1"]')).includes('R$ 30,00'));
  await a.selectOption('#rankingCriterio', 'servicos');
  await a.waitForFunction(nome => !(document.querySelector('#rankingLista [data-posicao="1"]') || {}).textContent?.includes(nome), ana.nome);
  await a.check('#rankingVisivel'); await a.waitForFunction(() => /passa a ver/.test(document.getElementById('rankingMsg').textContent));
  confere('admin: visibilidade do ranking gravada na empresa', (await db('empresas'))[0].ranking_visivel_equipe === true);
  await a.locator('#subtab-ganhos').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-metas-admin.png') });

  // Calculadora da taxa do parcelado: 6x, MDR 3,5%, antecipação 1,8% a.m. → 9,5795%.
  await a.click('.subtab-btn[data-subtab="formas"]'); await a.click('#btnNovaForma'); await a.waitForSelector('#fmCode');
  await a.click('#fmCalc > summary');
  await a.fill('#fmCalcMdr', '3,5'); await a.fill('#fmCalcAnt', '1,8'); await a.selectOption('#fmCalcParcelas', '6'); await a.click('#btnFmCalc');
  await a.waitForFunction(() => /taxa efetiva/.test(document.getElementById('fmCalcMsg').textContent));
  confere('admin: calculadora preenche a taxa de 6x', await a.inputValue('#fmTaxaPct') === '9.5795', await a.inputValue('#fmTaxaPct'));
  await a.fill('#fmCode', 'credito_6x'); await a.fill('#fmLabel', 'Crédito 6x'); await a.click('#btnSalvarForma'); await a.waitForTimeout(800);
  const forma6x = (await db('formas_pagamento')).find(f => f.code === 'credito_6x');
  confere('admin: forma "Crédito 6x" gravada com a taxa calculada', Boolean(forma6x) && Number(forma6x.taxa_pct) === 9.5795, JSON.stringify(forma6x && forma6x.taxa_pct));
  // Parcelados em lote: 2x a 12x de uma vez; o 6x que já existe só tem a taxa conferida.
  await a.click('#btnParcelados'); await a.waitForSelector('#modalParcelados:not(.hidden)');
  confere('parcelados: "Criar formas" desligado antes da prévia', await a.isDisabled('#btnPcGravar'));
  await a.fill('#pcMdr6', '3,5'); await a.fill('#pcMdr12', '4,2'); await a.fill('#pcAnt', '1,8'); await a.click('#btnPcPrevia');
  await a.waitForSelector('#pcPrevia [data-parcelas="12"]');
  confere('parcelados: prévia com 11 linhas, 6x marcado como existente, 7x a 11,0976%', await a.locator('#pcPrevia [data-parcelas]').count() === 11 && /já existe/.test(await a.textContent('#pcPrevia [data-parcelas="6"]')) && await a.getAttribute('#pcPrevia [data-parcelas="7"]', 'data-taxa') === '11.0976');
  confere('parcelados: prévia não grava', (await db('formas_pagamento')).filter(f => /^credito_\d+x$/.test(f.code)).length === 1);
  await a.fill('#pcAnt', '1,8'); confere('parcelados: mexer em um campo desliga o botão de gravar', await a.isDisabled('#btnPcGravar'));
  await a.click('#btnPcPrevia'); await a.waitForFunction(() => !document.getElementById('btnPcGravar').disabled);
  await a.click('#btnPcGravar'); await a.waitForSelector('#modalParcelados', { state: 'hidden' });
  const parcelados = (await db('formas_pagamento')).filter(f => /^credito_\d+x$/.test(f.code));
  confere('parcelados: 11 formas, 6x mantém 9,5795% e 12x fica acima', parcelados.length === 11 && Number(parcelados.find(f => f.code === 'credito_6x').taxa_pct) === 9.5795 && Number(parcelados.find(f => f.code === 'credito_12x').taxa_pct) > 11.0976 && parcelados.every(f => f.dias_recebimento === 1));
  confere('parcelados: aparecem na lista de formas', /Crédito 12x/.test(await a.textContent('#listFormas')));
  // Um Corte de 60,00 em 6x: a comanda grava 5,75 de taxa e o painel mostra o líquido por forma.
  const c6 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-mt-6x', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: outro.id }], payments: [{ formaCode: 'credito_6x', valorCentavos: 6000 }] });
  const pag6 = (await db('comando_pagamentos')).find(x => x.forma_code === 'credito_6x');
  confere('checkout em 6x grava a taxa da forma', c6.ok && Boolean(pag6) && pag6.taxa_total_centavos === Math.round(pag6.valor_centavos * 9.5795 / 100), JSON.stringify([c6.error, pag6 && [pag6.valor_centavos, pag6.taxa_total_centavos]]));
  await a.click('#btnFecharGestao'); await a.click('#navDashboard'); await a.click('#dobraIndicadores > summary');
  await a.waitForSelector('[data-forma-taxa="credito_6x"]', { timeout: 10000 });
  confere('painel: líquido por forma mostra a taxa do 6x e a do Pix', /taxa 9,5\d%/.test(await a.textContent('[data-forma-taxa="credito_6x"]')) && await a.isVisible('[data-forma-taxa="pix"]'), await a.textContent('[data-forma-taxa="credito_6x"]'));
  console.log('ADMIN erros:', JSON.stringify(a.erros));

  // ---- Profissional depois: própria meta e ranking sem o valor do colega ----
  const p = await entrar(b, 'profissional@dev.local');
  await abrirGanhos(p); await p.waitForSelector('#rankingBloco:not(.hidden)');
  confere('profissional: vê a própria meta em 50%', await p.getAttribute('[data-meta="faturamento"]', 'data-percentual') === '50');
  const linhas = await p.$$eval('#rankingLista [data-posicao]', ns => ns.map(n => [n.dataset.posicao, n.dataset.voce, n.textContent.replace(/\s+/g, ' ').trim()]));
  confere('profissional: está em 2º e marcado como "você"', linhas.length === 2 && linhas[1][0] === '2' && linhas[1][1] === '1' && linhas[1][2].includes('(você)'), JSON.stringify(linhas));
  confere('profissional: não vê o valor em reais do colega', !linhas[0][2].includes('R$') && linhas[0][2].includes('100% do 1º') && linhas[1][2].includes('R$'));
  confere('profissional: sem formulário de meta nem chave do ranking', !(await p.isVisible('#metasForm')) && !(await p.isVisible('#rankingVisivelWrap')));
  await p.locator('#subtab-ganhos').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-metas-prof.png') });
  console.log('PROFISSIONAL erros:', JSON.stringify(p.erros));

  // ---- Meta do salão (D-027): reconhecimento sem valor ----
  const mesAtual = hojeSP.slice(0, 7);
  const aberto = async pg => { await pg.dispatchEvent('#ganhosMes', 'change'); await pg.waitForTimeout(700); };
  await aberto(a);
  confere('gestão: bloco "Meta do salão" aparece com percentual', /Meta do salão:/.test(await a.textContent('#metaSalaoBloco')) && !(await a.isVisible('#metaSalaoBloco .meta-salao-selo')), (await a.textContent('#metaSalaoBloco')).replace(/\s+/g, ' ').trim());
  // Baixa a meta da Ana para o que ela já fez no mês: o salão passa a ter a meta batida.
  const meta = await a.evaluate(async ({ id, mes }) => { const { api } = await import('/js/api.js'); try { await api('/metas', { method: 'PUT', body: { profissionalId: id, mes, tipo: 'faturamento', valorAlvo: 4000 } }); return { ok: true }; } catch (e) { return { ok: false, erro: e.message }; } }, { id: ana.id, mes: mesAtual });
  confere('meta de teste baixada para o realizado da Ana', meta.ok === true, JSON.stringify(meta.erro));
  await abrirGanhos(a); await a.waitForSelector('#metaSalaoBloco .meta-salao-selo', { timeout: 8000 }).catch(() => {});
  confere('gestão: meta do salão atingida aparece como reconhecimento', await a.isVisible('#metaSalaoBloco .meta-salao-selo'));
  await aberto(p);
  await p.waitForSelector('#metaSalaoBloco .meta-salao-selo', { timeout: 8000 }).catch(() => {});
  const textoProf = (await p.textContent('#metaSalaoBloco')).replace(/\s+/g, ' ').trim();
  confere('profissional: vê o reconhecimento sem nomes nem valores de colegas', await p.isVisible('#metaSalaoBloco .meta-salao-selo') && !/Ana|Bruno|Caio/.test(textoProf), textoProf);
  // ---- Desempenho por colaborador (D-029) ----
  await a.waitForSelector('#desempenhoBloco:not(.hidden) .desempenho-linha', { timeout: 8000 }).catch(() => {});
  const linhasAdm = await a.$$eval('#desempenhoTabela .desempenho-linha', ns => ns.map(n => [n.querySelector('.desempenho-rotulo').textContent, n.querySelector('[data-col="atual"]').textContent.replace('Este mês', '').trim()]));
  confere('gestão: desempenho da Ana com 8 indicadores e 1 atendimento no mês', linhasAdm.length === 8 && linhasAdm[0][0] === 'Atendimentos' && linhasAdm[0][1] === '1', JSON.stringify(linhasAdm.slice(0, 2)));
  const textoDesempenho = await a.textContent('#desempenhoBloco');
  confere('gestão: sem ranking, rótulo ou nota no desempenho', !/risco|posição|ranking|nota \d|elegível/i.test(textoDesempenho) && /Média do salão/.test(textoDesempenho));
  await p.waitForSelector('#desempenhoBloco:not(.hidden) .desempenho-linha', { timeout: 8000 }).catch(() => {});
  confere('profissional: vê o próprio desempenho, sem escolher pessoa', await p.locator('#desempenhoTabela .desempenho-linha').count() === 8 && !(await p.isVisible('#ganhosProfissional')));
  await p.locator('#metaSalaoBloco').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-meta-salao.png') }).catch(() => {});
  console.log('PROFISSIONAL erros:', JSON.stringify(p.erros));
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})();
