// E2E (Playwright/Chromium, 390×844) do D-084 sob a CSP de produção: "Cliente chegou" como opção do salão
// (migration 028). Horários de hoje, 30 min atrás (alerta de atraso padrão: 15 min).
// Roteiro:
//   1) admin desliga em Gestão › Regras da agenda → empresa.agenda_usa_chegada = false;
//   2) profissional (Ana): a tela Agora oferece "Iniciar atendimento" para o horário dela;
//   3) recepção: o card oferece "Iniciar atendimento", sem "Cliente chegou" e sem "atrasado";
//      tocar inicia o atendimento (agendado → em_atendimento);
//   4) admin liga de novo → o card de outro horário atrasado volta a ter "Cliente chegou" e "atrasado".
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const plantar = async (t, linhas) => {
  const r = await fetch(`${API}/__db/${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(linhas) });
  if (!r.ok) throw new Error(`não plantou ${t}: ${r.status}`);
};
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const [hh, mm] = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
const hora = Math.max(0, hh * 60 + mm - 30);
const HORA = `${String(Math.floor(hora / 60)).padStart(2, '0')}:${String(hora % 60).padStart(2, '0')}:00`;
const ATRASO_POSSIVEL = hh * 60 + mm - hora >= 15;

(async () => {
  const empresa = (await db('empresas'))[0];
  const profs = await db('profissionais');
  const ana = profs.find(x => x.nome === 'Ana'); const bruno = profs.find(x => x.nome === 'Bruno');
  const corte = (await db('servicos')).find(s => s.nome === 'Corte');
  const cli = ['Chegada Um', 'Chegada Dois'].map(nome => ({ id: randomUUID(), empresa_id: empresa.id, nome, ativo: true }));
  await plantar('clientes', cli);
  const ag = (cliente, prof) => ({ id: randomUUID(), empresa_id: empresa.id, profissional_id: prof.id, servico_id: corte.id, cliente_id: cliente.id, data: hoje, horario: HORA, duracao_min: 30, status: 'agendado', valor_centavos: 6000 });
  const a1 = ag(cli[0], ana);
  await plantar('agendamentos', [a1]);

  const b = await chromium.launch();
  const erros = []; const csps = [];
  const entrar = async email => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)); });
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message));
    p.on('response', r => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await p.goto(APP); await p.waitForSelector('#loginScreen:not(.hidden)');
    await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
    await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
    return p;
  };
  const regra = async (p, valor) => {
    await p.click('#navGestao'); await p.waitForTimeout(300);
    // Abrir Regras busca GET /empresa e redesenha o formulário: escolher antes da resposta
    // perderia a escolha (o redesenho volta o valor salvo). Espera a resposta e o redesenho.
    const lido = p.waitForResponse(r => new URL(r.url()).pathname === '/api/empresa' && r.request().method() === 'GET');
    await p.click('#subtabBtnRegras'); await lido; await p.waitForSelector('#formRegras'); await p.waitForTimeout(200);
    await p.selectOption('#rgChegada', valor);
    await p.click('#btnRegrasSalvar'); await p.waitForTimeout(800);
    await p.click('#btnFecharGestao'); await p.waitForTimeout(300);
  };
  const abrirCard = async (p, id) => {
    await p.click('#navAgenda'); await p.waitForTimeout(500);
    await p.locator(`[data-day="${hoje}"]`).first().click(); await p.waitForTimeout(900);
    const card = p.locator(`.ag-card[data-ag-id="${id}"]`);
    await card.waitFor({ timeout: 10000 }); await card.scrollIntoViewIfNeeded(); await card.click();
    await p.waitForSelector('#actionSheetContent [data-sheet-action]');
    return (await p.textContent('#actionSheetContent')).replace(/\s+/g, ' ');
  };

  // 1) Admin desliga.
  const a = await entrar('admin@dev.local');
  await regra(a, 'nao');
  confere('admin desliga "Cliente chegou" para o salão', (await db('empresas'))[0].agenda_usa_chegada === false, String((await db('empresas'))[0].agenda_usa_chegada));

  // 2) Profissional: Agora.
  const pr = await entrar('profissional@dev.local');
  // As regras do salão chegam depois da agenda: a tela Agora troca o botão quando elas chegam.
  await pr.waitForFunction(() => document.getElementById('btnAgoraAcao')?.textContent.trim() === 'Iniciar atendimento', null, { timeout: 8000 }).catch(() => {});
  const acao = await pr.evaluate(() => { const x = document.getElementById('btnAgoraAcao'); return x ? x.textContent.trim() : null; });
  confere('tela Agora do profissional oferece "Iniciar atendimento"', acao === 'Iniciar atendimento', String(acao));

  // 3) Recepção: card.
  const r = await entrar('recepcao@dev.local');
  const t1 = await abrirCard(r, a1.id);
  const botoes = await r.evaluate(() => [...document.querySelectorAll('#actionSheetContent [data-sheet-action]')].map(x => x.dataset.sheetAction));
  confere('card oferece "Iniciar atendimento" e não "Cliente chegou"', botoes.includes('cadeira') && !botoes.includes('chegou'), JSON.stringify(botoes));
  confere('card não avisa atraso', !/atrasado \d+ min/.test(t1), t1.slice(0, 120));
  await r.click('#actionSheetContent [data-sheet-action="cadeira"]'); await r.waitForTimeout(1200);
  const st = (await db('agendamentos')).find(x => x.id === a1.id).status;
  confere('tocar inicia o atendimento direto (em_atendimento)', st === 'em_atendimento', st);

  // 4) Liga de novo: volta como antes.
  await regra(a, 'sim');
  confere('admin liga de novo', (await db('empresas'))[0].agenda_usa_chegada === true);
  const a2 = ag(cli[1], bruno);
  await plantar('agendamentos', [a2]);
  await r.reload(); await r.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await r.waitForTimeout(800);
  const t2 = await abrirCard(r, a2.id);
  const botoes2 = await r.evaluate(() => [...document.querySelectorAll('#actionSheetContent [data-sheet-action]')].map(x => x.dataset.sheetAction));
  confere('ligado: card volta a ter "Cliente chegou"', botoes2.includes('chegou') && !botoes2.includes('cadeira'), JSON.stringify(botoes2));
  if (ATRASO_POSSIVEL) confere('ligado: card volta a avisar atraso', /atrasado \d+ min/.test(t2), t2.slice(0, 120));
  else console.log('ATRASO: perto da meia-noite, conferência pulada');
  await r.screenshot({ path: '/tmp/hopeos-chegada-salao.png' });

  for (const p of [a, pr, r]) csps.push(...await p.evaluate(() => window.__csp));
  confere('sem violação de CSP', csps.length === 0, JSON.stringify(csps));
  confere('sem erro de página ou 5xx', erros.length === 0, JSON.stringify(erros));
  await b.close();
  console.log(falhas.length ? `FALHAS: ${falhas.join('; ')}` : 'TUDO OK');
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
