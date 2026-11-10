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
  const c1 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-mt-1', itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 4000 }] });
  const c2 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-mt-2', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: outro.id }], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] });
  confere('checkouts do seed', c1.ok && c2.ok, JSON.stringify([c1.error, c2.error]));

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
  await a.fill('#metaFaturamento', '80,00'); await a.fill('#metaAtendimentos', '1'); await a.click('#btnSalvarMetas');
  await a.waitForSelector('[data-meta="faturamento"]');
  confere('admin: meta de faturamento 40,00 de 80,00 = 50%', await a.getAttribute('[data-meta="faturamento"]', 'data-percentual') === '50' && await a.getAttribute('[data-meta="faturamento"]', 'data-atingida') === '0');
  confere('admin: meta de atendimentos 1 de 1 atingida', await a.getAttribute('[data-meta="atendimentos"]', 'data-atingida') === '1');
  const metas = await db('metas');
  confere('admin: 2 metas gravadas com autor', metas.length === 2 && metas.every(m => m.profissional_id === ana.id && Boolean(m.created_by)) && metas.find(m => m.tipo === 'faturamento').valor_alvo === 8000);
  await a.fill('#metaAtendimentos', ''); await a.click('#btnSalvarMetas');
  await a.waitForFunction(() => document.querySelectorAll('#metasLista [data-meta]').length === 1);
  confere('admin: campo vazio remove a meta', (await db('metas')).length === 1);
  await a.check('#rankingVisivel'); await a.waitForFunction(() => /passa a ver/.test(document.getElementById('rankingMsg').textContent));
  confere('admin: visibilidade do ranking gravada na empresa', (await db('empresas'))[0].ranking_visivel_equipe === true);
  await a.locator('#subtab-ganhos').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-metas-admin.png') });
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

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})();
