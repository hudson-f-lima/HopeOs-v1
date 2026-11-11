// E2E (Playwright/Chromium): cartão "Agora" do profissional (D-022, redesign fase 1),
// nos modos claro e escuro, sob a CSP de produção. Um botão por estado leva o
// atendimento de "agendado" até a comanda; a recepção não vê o cartão.
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };

async function entrar(b, email, colorScheme) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme })).newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { if (r.status() >= 400) p.erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
const fundo = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const statusDe = async id => (await db('agendamentos')).find(a => a.id === id).status;

(async () => {
  const b = await chromium.launch();

  const p = await entrar(b, 'profissional@dev.local', 'dark');
  confere('modo escuro: fundo escuro e cartão visível', await fundo(p) === 'rgb(11, 13, 18)' && await p.isVisible('#agoraCard'), await fundo(p));
  const id = await p.getAttribute('#btnAgoraAcao', 'data-agora-id');
  confere('agendado: mostra o cliente e pede "Cliente chegou"', (await p.textContent('#agoraCliente')).trim() === 'Cliente Teste' && (await p.textContent('#btnAgoraAcao')).trim() === 'Cliente chegou' && await p.getAttribute('#agoraEstado', 'data-status') === 'agendado');
  const altura = await p.locator('#btnAgoraAcao').evaluate(n => n.getBoundingClientRect().height);
  confere('botão principal com pelo menos 52 px de altura', altura >= 52, String(altura));
  await p.click('#btnAgoraAcao'); await p.waitForSelector('#agoraEstado[data-status="aguardando"]');
  confere('chegou: gravado e o botão vira "Iniciar atendimento"', await statusDe(id) === 'aguardando' && (await p.textContent('#btnAgoraAcao')).trim() === 'Iniciar atendimento');
  await p.click('#btnAgoraAcao'); await p.waitForSelector('#agoraEstado[data-status="em_atendimento"]');
  confere('na cadeira: gravado, rótulo e botão da comanda', await statusDe(id) === 'em_atendimento' && (await p.textContent('#agoraEstado')).trim() === 'Na cadeira agora' && (await p.textContent('#btnAgoraAcao')).trim() === 'Concluir e abrir comanda');
  await p.click('#btnAgoraAcao'); await p.waitForSelector('#tab-checkout:not(.hidden)');
  confere('abre a comanda já com o serviço do atendimento', (await p.inputValue('#coServico')).startsWith('Barba'), await p.inputValue('#coServico'));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-agora-escuro.png') });
  console.log('PROFISSIONAL erros:', JSON.stringify(p.erros));

  const r = await entrar(b, 'recepcao@dev.local', 'light');
  confere('modo claro: fundo claro; recepção não vê o cartão', await fundo(r) === 'rgb(247, 247, 249)' && !(await r.isVisible('#agoraCard')), await fundo(r));
  const nav = await r.locator('#navCheckout').evaluate(n => { const c = getComputedStyle(n).color.match(/\d+/g).map(Number); return c; });
  confere('menu inferior legível no claro (texto escuro, não branco)', nav[0] < 130 && nav[1] < 130 && nav[2] < 140, JSON.stringify(nav));
  console.log('RECEPCAO erros:', JSON.stringify(r.erros));

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})();
