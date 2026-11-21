// E2E (Playwright/Chromium) das permissões individuais (D-032) e da recepção em celular,
// tablet e computador, sob a CSP de produção.
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const escolher = async (p, campo, texto) => { await p.fill(campo, texto); await p.locator(`${campo} ~ div [data-value]`).filter({ hasText: texto }).first().click(); };

async function entrar(b, email, viewport = { width: 390, height: 844 }, esperados = []) {
  const p = await (await b.newContext({ viewport })).newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { const rota = `${r.status()} ${new URL(r.url()).pathname}`; if (r.status() >= 400 && !esperados.includes(rota)) p.erros.push(rota); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
const extrasDaAna = async () => ((await db('empresa_memberships')).find(m => m.role === 'profissional') || {}).permissoes_extras || [];

async function abrirPermissoesDaAna(a) {
  await a.click('#navGestao'); await a.waitForSelector('#tab-gestao:not(.hidden)');
  await a.click('#subtabBtnEquipe'); await a.waitForSelector('#cardPermissoes:not(.hidden) [data-perm-abrir]');
  const linha = a.locator('.perm-pessoa').filter({ hasText: 'Ana' });
  await linha.locator('[data-perm-abrir]').click(); await a.waitForSelector('#modalPermissoes:not(.hidden)');
}

(async () => {
  const b = await chromium.launch();

  // ---- Profissional antes: só o próprio ----
  const antes = await entrar(b, 'profissional@dev.local');
  confere('profissional sem permissão individual: sem Painel, agenda como "Hoje"', !(await antes.isVisible('#navDashboard')) && await antes.textContent('#navAgendaLabel') === 'Hoje');
  await antes.close();

  // ---- Proprietário concede "agenda de todos" e "comanda de qualquer profissional" ----
  const a = await entrar(b, 'admin@dev.local');
  await abrirPermissoesDaAna(a);
  confere('editor: o que vem do papel aparece marcado e travado', await a.locator('#permGrupos .perm-do-papel').count() >= 2);
  const concediveis = await a.$$eval('#permGrupos input[data-perm]', ns => ns.map(n => n.dataset.perm).sort());
  confere('ao profissional só se oferece agenda de todos e comanda (nada de dinheiro)', JSON.stringify(concediveis) === '["agenda:ver","comanda:fechar"]', JSON.stringify(concediveis));
  await a.check('#permGrupos input[data-perm="agenda:ver"]');
  await a.check('#permGrupos input[data-perm="comanda:fechar"]');
  const alvos = await a.$$eval('#modalPermissoes button, #permGrupos .perm-item', ns => ns.filter(n => n.offsetParent).map(n => Math.round(n.getBoundingClientRect().height)));
  confere('editor: alvos de toque ≥ 44px', alvos.every(h => h >= 44), JSON.stringify(alvos));
  await a.click('#btnPermSalvar'); await a.waitForSelector('#modalPermissoes', { state: 'hidden' });
  const concedidas = await extrasDaAna();
  confere('servidor gravou as duas permissões para a Ana', JSON.stringify([...concedidas].sort()) === '["agenda:ver","comanda:fechar"]', JSON.stringify(concedidas));
  const eventos = (await db('membership_permissao_eventos')) || [];
  confere('trilha registrada: quem, o quê, para quem', eventos.length === 2 && eventos.every(e => e.acao === 'conceder' && e.actor_id && e.alvo_user_id), String(eventos.length));

  // ---- Profissional com a agenda de todos ----
  const com = await entrar(b, 'profissional@dev.local');
  confere('com agenda de todos: a aba volta a ser "Agenda" e continua sem Painel', await com.textContent('#navAgendaLabel') === 'Agenda' && !(await com.isVisible('#navDashboard')));
  await com.click('#btnAgendaLembretes'); await com.waitForSelector('#lembretesResumo');
  confere('lembretes do profissional: sem WhatsApp', await com.locator('.lembrete-zap').count() === 0 && /a recepção avisa/.test(await com.textContent('#lembretesResumo')));
  await com.click('#btnFecharLembretes');
  await com.click('#fab'); await com.waitForSelector('#modalNovoAgendamento:not(.hidden)');
  await com.fill('#agCliente', 'Cliente Rápido Ana');
  await com.click('#btnAgNovoCliente');
  confere('cadastro rápido: o nome digitado vem preenchido', await com.inputValue('#agNovoClienteNome') === 'Cliente Rápido Ana');
  await com.fill('#agNovoClienteZap', '11977776666');
  await com.click('#btnAgNovoClienteSalvar'); await com.waitForSelector('#agNovoCliente.hidden', { state: 'attached' });
  const clientes = await db('clientes');
  confere('cadastro rápido: cliente gravado e escolhido no agendamento', clientes.some(c => c.nome === 'Cliente Rápido Ana' && c.whatsapp === '11977776666') && await com.inputValue('#agCliente') === 'Cliente Rápido Ana');
  confere('profissional não recebe contato de clientes', await com.evaluate(async () => { const { api } = await import('/js/api.js'); return (await api('/clientes')).every(c => !('whatsapp' in c) && !('observacoes' in c)); }));
  await com.keyboard.press('Escape').catch(() => {});
  await com.goto(BASE); await com.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await com.waitForTimeout(600);
  await com.click('#navCheckout'); await com.click('#btnNovaComanda');
  await escolher(com, '#coProfissional', 'Bruno'); await escolher(com, '#coServico', 'Corte'); await escolher(com, '#coForma', 'Pix');
  await com.click('#btnSimular'); await com.waitForSelector('#cardPreview:not(.hidden)'); await com.click('#btnFechar'); await com.waitForSelector('#cardResultado:not(.hidden)');
  confere('com permissão: fecha comanda de outro profissional', (await db('comandos')).length === 1 && com.erros.length === 0, JSON.stringify(com.erros));
  const caixa = await com.evaluate(async () => { const { api } = await import('/js/api.js'); try { await api('/lista-espera'); return 200; } catch (e) { return e.status || 0; } });
  confere('continua sem lista de espera e caixa', caixa === 403, String(caixa));

  // ---- Proprietário revoga ----
  await a.keyboard.press('Escape').catch(() => {});
  await a.goto(BASE); await a.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await a.waitForTimeout(600);
  await abrirPermissoesDaAna(a);
  await a.uncheck('#permGrupos input[data-perm="agenda:ver"]');
  await a.uncheck('#permGrupos input[data-perm="comanda:fechar"]');
  await a.click('#btnPermSalvar'); await a.waitForSelector('#modalPermissoes', { state: 'hidden' });
  confere('revogado no servidor', (await extrasDaAna()).length === 0);
  await a.locator('.perm-pessoa').filter({ hasText: 'Ana' }).locator('[data-perm-abrir]').click();
  await a.waitForSelector('#modalPermissoes:not(.hidden)');
  await a.click('.perm-historico summary'); await a.waitForSelector('.perm-evento');
  confere('histórico mostra concessões e revogações', await a.locator('.perm-evento[data-acao="revogar"]').count() > 0 && await a.locator('.perm-evento[data-acao="conceder"]').count() > 0);
  console.log('ADMIN erros:', JSON.stringify(a.erros));

  // A sessão aberta da Ana: a próxima ação no servidor já é recusada.
  const status = await com.evaluate(async () => { const { api } = await import('/js/api.js'); try { await api('/agenda?data=2000-01-01'); return 200; } catch (e) { return e.status || 0; } });
  const agenda = await com.evaluate(async () => { const { api } = await import('/js/api.js'); const s = await import('/js/state.js'); const outro = s.state.catalog.profissionais.find(p => p.nome === 'Bruno'); try { await api('/agenda/slots?data=2030-01-07&profissionalId=' + outro.id + '&servicoId=' + s.state.catalog.servicos[0].id); return 200; } catch (e) { return e.status || 0; } });
  confere('revogação vale na próxima ação da sessão já aberta (agenda do colega recusada)', status === 200 && agenda === 403, `${status}/${agenda}`);
  const depois = await entrar(b, 'profissional@dev.local');
  confere('depois de revogar: "Hoje" de novo', await depois.textContent('#navAgendaLabel') === 'Hoje');
  console.log('PROFISSIONAL erros:', JSON.stringify(depois.erros));

  // ---- Recepção em celular, tablet e computador ----
  for (const [nome, viewport] of [['celular', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }], ['computador', { width: 1280, height: 800 }]]) {
    const r = await entrar(b, 'recepcao@dev.local', viewport);
    const larguraOk = await r.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const nav = await r.locator('.bottom-nav').boundingBox();
    const navOk = nome === 'computador' ? nav.x === 0 && nav.width <= 120 && nav.height > 600 : nav.y + nav.height >= viewport.height - 1 && nav.width === viewport.width;
    confere(`recepção (${nome}): sem rolagem lateral e navegação no lugar certo`, larguraOk && navOk, JSON.stringify(nav));
    await r.click('#navCheckout'); await r.click('#btnNovaComanda');
    await escolher(r, '#coProfissional', 'Bruno'); await escolher(r, '#coServico', 'Corte'); await escolher(r, '#coForma', 'Pix');
    await r.click('#btnSimular'); await r.waitForSelector('#cardPreview:not(.hidden)'); await r.click('#btnFechar'); await r.waitForSelector('#cardResultado:not(.hidden)');
    await r.click('#navDashboard'); await r.waitForTimeout(800);
    await r.click('#navAgenda'); await r.waitForTimeout(500);
    confere(`recepção (${nome}): fecha comanda, abre Painel e Agenda sem erro`, r.erros.length === 0, JSON.stringify(r.erros));
    await r.screenshot({ path: require('path').join(require('os').tmpdir(), `hopeos-recepcao-${nome}.png`) });
    await r.close();
  }
  confere('comandas gravadas: 1 da Ana e 3 da recepção', (await db('comandos')).length === 4, String((await db('comandos')).length));

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
