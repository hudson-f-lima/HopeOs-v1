// E2E (Playwright/Chromium): Gestão > Ganhos (profissional vê só os seus; admin escolhe)
// e Dashboard > "Exportar para o contador (CSV)" sob a CSP de produção.
// Requer: node backend/scripts/dev-memory-api.js (seed padrão) + PWA em :5599.
const fs = require('fs');
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB || 'http://127.0.0.1:5599';
const API = process.env.E2E_API || 'http://127.0.0.1:3399';
const BASE = `${WEB}/index.html?apiBase=${API}/api`;
const db = async t => (await fetch(`${API}/__db/${t}`)).json();
const legado = (path, body) => fetch(`${API}/api${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };

async function entrar(b, email) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('response', r => { if (r.status() >= 400) p.erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(BASE); await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', email); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}

(async () => {
  const servicos = await db('servicos'); const profs = await db('profissionais');
  const corte = servicos.find(s => s.nome === 'Corte'); const barba = servicos.find(s => s.nome === 'Barba');
  const ana = profs.find(p => p.nome === 'Ana'); const outro = profs.find(p => p.id !== ana.id);
  const c1 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-gn-1', itens: [{ tipo: 'servico', servicoId: barba.id, profissionalId: ana.id }], payments: [{ formaCode: 'pix', valorCentavos: 5000 }], gorjetaCentavos: 1000 });
  const c2 = await legado('/checkout/close', { data: hojeSP, idempotencyKey: 'e2e-gn-2', itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: outro.id }], payments: [{ formaCode: 'pix', valorCentavos: 6500 }], gorjetaCentavos: 500 });
  confere('checkouts do seed', c1.ok && c2.ok, JSON.stringify([c1.error, c2.error]));
  const itens = await db('comando_itens'); const gorjetas = await db('comando_gorjetas');
  const esperadoAna = itens.filter(i => i.profissional_id === ana.id).reduce((s, i) => s + i.comissao_centavos, 0) + gorjetas.filter(g => g.profissional_id === ana.id).reduce((s, g) => s + g.valor_liquido_centavos, 0);
  const esperadoOutro = itens.filter(i => i.profissional_id === outro.id).reduce((s, i) => s + i.comissao_centavos, 0) + gorjetas.filter(g => g.profissional_id === outro.id).reduce((s, g) => s + g.valor_liquido_centavos, 0);

  const b = await chromium.launch();

  // Profissional: vê a aba, não vê seletor de colega, total = só o dela.
  const prof = await entrar(b, 'profissional@dev.local');
  await prof.click('#navAvatar'); await prof.waitForSelector('#sheetGestao:not(.hidden)');
  confere('profissional: aba Ganhos visível', await prof.isVisible('#subtabBtnGanhos'));
  await prof.click('#subtabBtnGanhos'); await prof.waitForSelector('#ganhosTotal');
  confere('profissional: sem seletor de profissional', !(await prof.isVisible('#ganhosProfissional')));
  const totalProf = Number(await prof.getAttribute('#ganhosTotal', 'data-total'));
  confere('profissional: total = comissão + gorjeta dela', totalProf === esperadoAna && esperadoAna > 0, `tela ${totalProf} × banco ${esperadoAna}`);
  confere('profissional: não vê botão do contador', !(await prof.isVisible('#btnExportarContador')));
  await prof.locator('#subtab-ganhos').screenshot({ path: require('path').join(require('os').tmpdir(), 'hopeos-ganhos.png') });
  console.log('PROFISSIONAL erros:', JSON.stringify(prof.erros));

  // Recepção: sem a aba.
  const recep = await entrar(b, 'recepcao@dev.local');
  await recep.click('#navAvatar'); await recep.waitForSelector('#sheetGestao:not(.hidden)');
  confere('recepção: aba Ganhos escondida', !(await recep.isVisible('#subtabBtnGanhos')));
  console.log('RECEPCAO erros:', JSON.stringify(recep.erros));

  // Admin: escolhe o profissional; exporta o CSV.
  const admin = await entrar(b, 'admin@dev.local');
  await admin.click('#navAvatar'); await admin.waitForSelector('#sheetGestao:not(.hidden)');
  await admin.click('#subtabBtnGanhos'); await admin.waitForSelector('#ganhosProfissional');
  await admin.selectOption('#ganhosProfissional', outro.id); await admin.waitForSelector('#ganhosTotal');
  const totalOutro = Number(await admin.getAttribute('#ganhosTotal', 'data-total'));
  confere('admin: ganhos do profissional escolhido', totalOutro === esperadoOutro && esperadoOutro > 0 && esperadoOutro !== esperadoAna, `tela ${totalOutro} × banco ${esperadoOutro}`);
  await admin.click('#btnFecharGestao');
  await admin.click('#navDashboard'); await admin.waitForSelector('#dbCotaPartePanel:not(.hidden)', { timeout: 10000 });
  const [download] = await Promise.all([admin.waitForEvent('download', { timeout: 10000 }), admin.click('#btnExportarContador')]);
  const csv = fs.readFileSync(await download.path(), 'utf8');
  const linhas = csv.trim().split('\r\n');
  confere('CSV: nome do arquivo', download.suggestedFilename() === `servicos-prestados-${hojeSP.slice(0, 7)}.csv`, download.suggestedFilename());
  confere('CSV: BOM + cabeçalho + 2 linhas', csv.charCodeAt(0) === 0xFEFF && linhas.length === 3 && linhas[0].includes('Cota-parte salão (R$)'), `${linhas.length} linhas`);
  confere('CSV: valores em reais com vírgula', linhas.some(l => l.includes(';40,00;')) && linhas.some(l => l.includes(';60,00;')), linhas.slice(1).join(' | '));
  confere('CSV: mensagem de confirmação', /2 linha\(s\) exportada/.test(await admin.textContent('#exportarContadorMsg')));
  console.log('ADMIN erros:', JSON.stringify(admin.erros));

  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})();
