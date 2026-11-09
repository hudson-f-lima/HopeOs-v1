#!/usr/bin/env node
// Teste de fumaça pós-deploy, READ-ONLY: API + PWA estática.
// Rode `node backend/scripts/ops/smoke.js --help`.
const { EXIT, GITHUB_PAGES_ORIGIN, UsageError, parseArgs, request, parseJson, originOf, createReport, runCli } = require('./lib');

const HELP = `smoke — fumaça pós-deploy (read-only) da API e da PWA

Uso:
  node backend/scripts/ops/smoke.js --api https://hopeos-v1-rvo9.onrender.com/api \\
       --pwa https://hopeos-v1-frontend.onrender.com/ [--json]

API:
  - GET /health = 200 {ok:true}
  - GET /clientes sem token = 401; com token inválido = 401 (503 = API_ACCESS_TOKEN ausente)
  - headers de segurança (nosniff, X-Frame-Options DENY, Referrer-Policy,
    Cross-Origin-Resource-Policy, sem X-Powered-By; HSTS quando https)
  - CORS: preflight libera a origem da PWA e NÃO libera origem estranha nem sufixo
    (https://hudson-f-lima.github.io.<outro>); localhost liberado = WARN
  - /api/public/*: 404 quando desligado (padrão --public-booking off). A sonda usa um
    POST com JSON malformado: desligado → 404; ligado → 400 do parser. Nada é gravado.
PWA (com --pwa):
  - GET / = 200 HTML; CSP com connect-src liberando a API, frame-ancestors 'none',
    object-src 'none', script-src sem 'unsafe-inline'/'unsafe-eval'; nosniff,
    X-Frame-Options, Referrer-Policy, Permissions-Policy
  - config.json com apiBase = --api; service-worker.js com Cache-Control no-cache
  - WARN se arquivos do repositório (backend/package.json) estiverem publicados

Opções:
  --api URL                base da API (termina em /api)
  --pwa URL                URL pública da PWA
  --public-booking off|on  estado esperado do agendamento online (padrão off)
  --timeout MS             timeout por requisição (padrão 15000; o Render free acorda devagar)
  --json  --strict  --help

Saída: 0 = aprovado; 1 = alguma checagem falhou; 2 = uso incorreto.
`;

const API_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-site'
};
const EVIL_ORIGIN = 'https://smoke-evil.invalid';
const SUFFIX_ORIGIN = `${GITHUB_PAGES_ORIGIN}.smoke-evil.invalid`;

function headerProblems(res, expected) {
  const out = [];
  for (const [k, v] of Object.entries(expected)) if (String(res.headers[k] || '').toLowerCase() !== v.toLowerCase()) out.push(`${k}=${res.headers[k] || '(ausente)'}`);
  return out;
}

async function checkApi(api, pwaOrigin, report, { timeoutMs, publicBooking }) {
  const base = api.replace(/\/+$/, '');
  const get = (p, o = {}) => request(`${base}${p}`, { timeoutMs, ...o });

  const health = await get('/health');
  if (health.error) { report.fail('api.health', `sem conexão: ${health.error}`); return; }
  const hb = parseJson(health.text);
  if (health.status === 200 && hb && hb.ok === true) report.ok('api.health', '200 {ok:true}');
  else { report.fail('api.health', `HTTP ${health.status}${/suspended/i.test(health.text) ? ' (serviço suspenso no Render)' : ''}`); return; }

  const semToken = await get('/clientes');
  if (semToken.status === 401) report.ok('api.auth.sem-token', '401 em rota de negócio sem token');
  else report.fail('api.auth.sem-token', `HTTP ${semToken.status} (esperado 401)`);
  const tokenRuim = await get('/clientes', { headers: { Authorization: 'Bearer smoke-token-invalido' } });
  if (tokenRuim.status === 401) report.ok('api.auth.token-invalido', '401 com token inválido');
  else report.fail('api.auth.token-invalido', `HTTP ${tokenRuim.status} (esperado 401${tokenRuim.status === 503 ? '; 503 = API_ACCESS_TOKEN ausente no servidor' : ''})`);

  const notFound = await get('/smoke-rota-inexistente');
  const problems = [];
  for (const [rotulo, res] of [['health', health], ['401', semToken], ['404', notFound]]) {
    const p = headerProblems(res, API_HEADERS);
    if (res.headers['x-powered-by']) p.push(`x-powered-by=${res.headers['x-powered-by']}`);
    if (p.length) problems.push(`${rotulo}: ${p.join(', ')}`);
  }
  if (problems.length) report.fail('api.headers', problems.join(' | '));
  else report.ok('api.headers', 'nosniff, DENY, no-referrer, same-site; sem X-Powered-By');
  if (base.startsWith('https://')) {
    if (/max-age=\d{7,}/.test(health.headers['strict-transport-security'] || '')) report.ok('api.hsts', health.headers['strict-transport-security']);
    else report.fail('api.hsts', 'HSTS ausente em https (NODE_ENV=production?)');
  } else report.skip('api.hsts', 'API em http (local)');

  // CORS por preflight: só a origem da PWA.
  const preflight = origin => get('/clientes', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  if (pwaOrigin) {
    const r = await preflight(pwaOrigin);
    if (r.headers['access-control-allow-origin'] === pwaOrigin) report.ok('api.cors.pwa', `libera ${pwaOrigin}`);
    else report.fail('api.cors.pwa', `não libera a PWA ${pwaOrigin} (allow-origin=${r.headers['access-control-allow-origin'] || 'ausente'}): confira CORS_ORIGIN`);
  } else report.skip('api.cors.pwa', 'sem --pwa');
  for (const [id, origin] of [['api.cors.estranha', EVIL_ORIGIN], ['api.cors.sufixo', SUFFIX_ORIGIN]]) {
    const r = await preflight(origin);
    const acao = r.headers['access-control-allow-origin'];
    if (acao) report.fail(id, `libera ${origin} (allow-origin=${acao})`);
    else report.ok(id, `não libera ${origin}`);
  }
  const local = await preflight('http://localhost:5173');
  if (local.headers['access-control-allow-origin']) report.warn('api.cors.localhost', 'localhost/LAN liberados por código (app.js) mesmo em produção');
  else report.ok('api.cors.localhost', 'localhost não liberado');

  // Agendamento online: GET de slug inexistente = 404 sempre; POST com JSON
  // malformado distingue desligado (404 antes do parser) de ligado (400 do parser).
  const g = await get('/public/agendar/smoke-sonda');
  const p = await get('/public/agendar/smoke-sonda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  const estado = p.status === 404 ? 'off' : p.status === 400 ? 'on' : `HTTP ${p.status}`;
  if (g.status !== 404) report.fail('api.public', `GET /public/agendar/<slug inexistente> = ${g.status} (esperado 404)`);
  else if (estado === publicBooking) report.ok('api.public', publicBooking === 'off' ? '/api/public/* = 404 (desligado)' : 'agendamento online LIGADO, como esperado');
  else report.fail('api.public', `agendamento online ${estado === 'on' ? 'LIGADO' : estado}; esperado ${publicBooking === 'off' ? 'desligado' : 'ligado'}`);
  if (!/no-store/.test(g.headers['cache-control'] || '')) report.warn('api.public.cache', 'Cache-Control sem no-store em /api/public');
}

async function checkPwa(pwa, api, report, { timeoutMs }) {
  const root = pwa.endsWith('/') ? pwa : `${pwa}/`;
  const at = p => new URL(p, root).toString();
  const idx = await request(root, { timeoutMs });
  if (idx.error) { report.fail('pwa.index', `sem conexão: ${idx.error}`); return; }
  if (idx.status === 200 && /text\/html/.test(idx.headers['content-type'] || '')) report.ok('pwa.index', '200 text/html');
  else report.fail('pwa.index', `HTTP ${idx.status} ${idx.headers['content-type'] || ''}`);

  const csp = idx.headers['content-security-policy'] || '';
  if (!csp) report.fail('pwa.csp', 'sem Content-Security-Policy (GitHub Pages não envia headers; use o static do Render)');
  else {
    const dir = name => ((new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`).exec(csp) || [])[1] || '').trim().split(/\s+/).filter(Boolean);
    const apiOrigin = originOf(api);
    const problems = [];
    if (!dir('connect-src').includes(apiOrigin)) problems.push(`connect-src não libera ${apiOrigin}`);
    if (!dir('frame-ancestors').includes("'none'")) problems.push("frame-ancestors ≠ 'none'");
    if (!dir('object-src').includes("'none'")) problems.push("object-src ≠ 'none'");
    const scripts = dir('script-src').length ? dir('script-src') : dir('default-src');
    if (scripts.some(s => s === "'unsafe-inline'" || s === "'unsafe-eval'" || s === '*')) problems.push(`script-src frouxo: ${scripts.join(' ')}`);
    if (problems.length) report.fail('pwa.csp', problems.join('; '));
    else report.ok('pwa.csp', `presente; connect-src libera ${apiOrigin}`);
  }
  const p = headerProblems(idx, { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' });
  if (!idx.headers['permissions-policy']) p.push('permissions-policy=(ausente)');
  if (p.length) report.fail('pwa.headers', p.join(', '));
  else report.ok('pwa.headers', 'nosniff, DENY, no-referrer, Permissions-Policy');

  const cfg = await request(at('config.json'), { timeoutMs });
  const c = parseJson(cfg.text);
  if (cfg.status !== 200 || !c) report.fail('pwa.config', `config.json HTTP ${cfg.status}`);
  else if (String(c.apiBase || '').replace(/\/+$/, '') === api.replace(/\/+$/, '')) report.ok('pwa.config', `apiBase = ${c.apiBase}`);
  else report.fail('pwa.config', `apiBase (${c.apiBase}) ≠ --api (${api})`);

  const sw = await request(at('service-worker.js'), { timeoutMs });
  if (sw.status === 200 && /no-cache/.test(sw.headers['cache-control'] || '')) report.ok('pwa.service-worker', 'Cache-Control no-cache');
  else report.warn('pwa.service-worker', `HTTP ${sw.status}, Cache-Control=${sw.headers['cache-control'] || '(ausente)'}: atualização da PWA pode demorar`);

  const leak = await request(at('backend/package.json'), { timeoutMs });
  if (leak.status === 200 && /"dependencies"/.test(leak.text)) report.warn('pwa.publicacao', 'backend/package.json servido: o site publica o repositório inteiro (staticPublishPath ".")');
  else report.ok('pwa.publicacao', 'backend/ não servido');
}

async function runSmoke({ api, pwa = '', publicBooking = 'off', timeoutMs = 15000 }) {
  const report = createReport('smoke');
  const pwaOrigin = pwa ? originOf(pwa) : null;
  await checkApi(api, pwaOrigin, report, { timeoutMs, publicBooking });
  if (pwa) await checkPwa(pwa, api, report, { timeoutMs });
  else report.warn('pwa', 'sem --pwa: CSP/headers do site e CORS da PWA não conferidos');
  return report;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv, { boolean: ['help', 'json', 'strict'], string: ['api', 'pwa', 'public-booking', 'timeout'] });
    if (opts.help) return { code: EXIT.OK, stdout: HELP };
    if (!opts.api || !/^https?:\/\//.test(opts.api)) throw new UsageError('--api é obrigatório (URL http(s) terminando em /api)');
    if (opts.pwa && !/^https?:\/\//.test(opts.pwa)) throw new UsageError('--pwa precisa ser URL http(s)');
    if (opts['public-booking'] && !['on', 'off'].includes(opts['public-booking'])) throw new UsageError('--public-booking aceita on|off');
    if (opts.timeout && !(Number(opts.timeout) > 0)) throw new UsageError('--timeout inválido');
  } catch (err) {
    if (err instanceof UsageError) return { code: EXIT.USAGE, stderr: `${err.message}\n\nVeja --help.` };
    throw err;
  }
  const report = await runSmoke({ api: opts.api, pwa: opts.pwa || '', publicBooking: opts['public-booking'] || 'off', timeoutMs: Number(opts.timeout || 15000) });
  const code = report.exitCode({ strict: opts.strict });
  if (opts.json) return { code, stdout: JSON.stringify(report.toJSON({ strict: opts.strict }), null, 2) };
  return { code, stdout: `HOPE OS smoke (read-only)\n\n${report.render({ strict: opts.strict })}` };
}

module.exports = { main, runSmoke };
if (require.main === module) runCli(main);
