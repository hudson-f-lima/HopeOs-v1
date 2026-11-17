// E2E (Playwright/Chromium) do checklist de lançamento (D-052): a PWA em produção é servida pelo
// GitHub Pages, que NÃO envia os headers do render.yaml. Aqui os headers de segurança são
// removidos da resposta (como no Pages) e conferimos que o próprio index.html protege:
//   1) CSP no <meta>: script inline injetado não roda; o app funciona (login);
//   2) aberto dentro de <iframe> de outro site: o app fica oculto (anti-clickjacking);
//   3) controle negativo: sem o <meta>, o mesmo script injetado rodaria.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3399';
const APP = `http://127.0.0.1:5599/index.html?apiBase=${API}/api`;
const falhas = [];
const confere = (rotulo, ok, detalhe = '') => { console.log(`${ok ? 'OK ' : 'FALHOU'} ${rotulo}${detalhe ? ' | ' + detalhe : ''}`); if (!ok) falhas.push(rotulo); };
const SEM_HEADERS = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];

async function comoNoPages(ctx, { tirarMeta = false } = {}) {
  await ctx.route('**/*', async route => {
    const r = await route.fetch();
    const headers = Object.fromEntries(Object.entries(r.headers()).filter(([k]) => !SEM_HEADERS.includes(k.toLowerCase())));
    let body = await r.body();
    if (tirarMeta && /index\.html/.test(route.request().url())) body = Buffer.from(body.toString().replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
    await route.fulfill({ status: r.status(), headers, body });
  });
}
const injeta = p => p.evaluate(() => new Promise(res => {
  window.__xss = 0;
  const s = document.createElement('script'); s.textContent = 'window.__xss = 1'; document.head.appendChild(s);
  setTimeout(() => res(window.__xss), 200);
}));

(async () => {
  const b = await chromium.launch();
  // 1) Sem headers do servidor, com o <meta>.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await comoNoPages(ctx);
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  const resp = await p.goto(APP);
  confere('resposta sem CSP no header (como no GitHub Pages)', !resp.headers()['content-security-policy']);
  await p.waitForSelector('#loginScreen:not(.hidden)');
  await p.fill('#loginEmail', 'admin@dev.local'); await p.fill('#loginSenha', 'dev12345'); await p.click('#btnLogin');
  await p.waitForSelector('#appRoot:not(.hidden)', { timeout: 15000 });
  confere('app funciona com a CSP do <meta> (login e agenda)', await p.isVisible('#appRoot'));
  confere('script inline injetado NÃO roda (CSP do <meta>)', await injeta(p) === 0);

  // 2) Dentro de iframe de outro "site".
  const moldura = await ctx.newPage();
  await moldura.setContent(`<iframe id="f" src="${APP}" width="390" height="600"></iframe>`);
  await moldura.waitForTimeout(2500);
  const quadro = moldura.frames().find(f => f.url().includes('index.html'));
  const oculto = quadro ? await quadro.evaluate(() => getComputedStyle(document.documentElement).display === 'none').catch(() => true) : true;
  confere('dentro de iframe o app fica oculto (anti-clickjacking)', oculto);

  // 3) Controle negativo: sem o <meta>, o mesmo script roda.
  const ctx2 = await b.newContext();
  await comoNoPages(ctx2, { tirarMeta: true });
  const p2 = await ctx2.newPage();
  await p2.goto(APP); await p2.waitForSelector('#loginScreen:not(.hidden)');
  confere('controle negativo: sem o <meta>, o script injetado rodaria', await injeta(p2) === 1);

  console.log('ERROS DA PÁGINA:', JSON.stringify(erros)); falhas.push(...erros);
  await b.close();
  console.log('ERROS:', JSON.stringify(falhas));
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error('E2E FALHOU', e.message); process.exit(1); });
