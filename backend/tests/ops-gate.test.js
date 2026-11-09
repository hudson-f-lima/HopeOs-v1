// Ops Gate: ferramentas de operação (backend/scripts/ops: doctor, bootstrap-admin, smoke).
// Tudo offline: app real em memória (listen 0), PostgREST/Auth falsos em 127.0.0.1 e
// store em memória para o bootstrap. Nenhuma chamada sai da máquina.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'ops-gate-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'ops-gate';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync, execFile } = require('child_process');
const { env } = require('../src/config/env');
const { app } = require('../src/app');
const { createMemoryIdentityStore } = require('../src/auth/identityStore');
const lib = require('../scripts/ops/lib');
const doctor = require('../scripts/ops/doctor');
const bootstrap = require('../scripts/ops/bootstrap-admin');
const smoke = require('../scripts/ops/smoke');

const OPS = path.join(__dirname, '../scripts/ops');
const PROD_URL = `https://${lib.PROD_REF}.supabase.co`;
const STAGING_URL = `https://${lib.STAGING_REF}.supabase.co`;
const KEY = 'sb_secret_OpsGateChaveSuperSecreta0123456789';
const TOKEN = 'ops-gate-api-token-0123456789-abcdefghijklmnop';
const EMPRESA = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const EMAIL = 'dono@salao.test';
const PWA_ORIGIN = 'https://hopeos-v1-frontend.onrender.com';

const jwt = payload => ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'assinatura'].join('.');

function prodEnv(extra = {}) {
  return {
    NODE_ENV: 'production', SUPABASE_URL: PROD_URL, SUPABASE_SECRET_KEY: KEY, API_ACCESS_TOKEN: TOKEN,
    LEGACY_TOKEN_AUTH_ENABLED: 'true', APP_PUBLIC_URL: `${PWA_ORIGIN}/`, CORS_ORIGIN: PWA_ORIGIN,
    APP_TIMEZONE: 'America/Sao_Paulo', DEFAULT_EMPRESA_ID: EMPRESA, ...extra
  };
}

// CLI de verdade (processo filho) com ambiente controlado; sem backend/.env.
function cli(script, args, extraEnv) {
  const flags = script === 'smoke.js' ? [] : ['--no-dotenv']; // smoke não lê ambiente
  const r = spawnSync(process.execPath, [path.join(OPS, script), ...flags, ...args], {
    env: { PATH: process.env.PATH, ...extraEnv }, encoding: 'utf8', timeout: 30000
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// A saída não pode conter o segredo nem trecho dele (8+ caracteres após o prefixo público).
function assertNoSecret(text, secret, prefix = '') {
  assert.ok(!text.includes(secret), 'segredo inteiro na saída');
  const body = secret.slice(prefix.length);
  for (let i = 0; i + 8 <= body.length; i += 1) assert.ok(!text.includes(body.slice(i, i + 8)), `trecho do segredo na saída: ${body.slice(i, i + 8)}`);
}

function listen(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// PostgREST + Auth falsos. Registra método de toda requisição (prova de read-only).
function fakeSupabase({ key = KEY, missing = [] } = {}) {
  const methods = [];
  const tables = Object.values(doctor.TABLES).flat().filter(t => !missing.includes(t));
  return listen((req, res) => {
    methods.push(req.method);
    const u = new URL(req.url, 'http://x');
    if (req.headers.apikey !== key) { res.writeHead(401); return res.end('{"message":"Invalid API key"}'); }
    if (u.pathname === '/auth/v1/settings') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"disable_signup":true,"mailer_autoconfirm":false}'); }
    if (u.pathname === '/rest/v1/') {
      res.writeHead(200, { 'content-type': 'application/openapi+json' });
      return res.end(JSON.stringify({ paths: Object.fromEntries(['checkout_close', 'agendamento_criar', 'checkout_close_autoria', 'comanda_estornar'].map(r => [`/rpc/${r}`, {}])) }));
    }
    const t = u.pathname.replace('/rest/v1/', '');
    if (!tables.includes(t)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-range': `*/${t === 'empresas' ? 1 : 0}` });
    res.end(req.method === 'HEAD' ? undefined : '[]');
  }).then(s => ({ ...s, methods }));
}

// Site estático falso com os headers do render.yaml (connect-src → API local).
function fakePwa(apiBase, { csp = true, apiBaseNoConfig = apiBase } = {}) {
  const apiOrigin = new URL(apiBase).origin;
  const sec = {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  };
  if (csp) sec['Content-Security-Policy'] = `default-src 'self'; script-src 'self'; connect-src 'self' ${apiOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
  return listen((req, res) => {
    if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { ...sec, 'content-type': 'text/html' }); return res.end('<!doctype html><title>HOPE</title>'); }
    if (req.url === '/config.json') { res.writeHead(200, { ...sec, 'content-type': 'application/json' }); return res.end(JSON.stringify({ apiBase: apiBaseNoConfig })); }
    if (req.url === '/service-worker.js') { res.writeHead(200, { ...sec, 'cache-control': 'no-cache', 'content-type': 'text/javascript' }); return res.end('//'); }
    res.writeHead(200, { ...sec, 'content-type': 'text/html' }); res.end('<!doctype html><title>HOPE</title>'); // rewrite /* → index
  });
}

// Store em memória com a interface do bootstrap; conta escritas.
function memoryStore({ users = [], empresas = [], unidades = [], memberships = [] } = {}) {
  const id = createMemoryIdentityStore({ app_users: users, unidades, empresa_memberships: memberships });
  const db = { empresas, ...id.db };
  const writes = [];
  const w = (nome, fn) => async (...a) => { writes.push(nome); return fn(...a); };
  return {
    db, writes,
    async getEmpresa(eid) { return db.empresas.find(e => e.id === eid) || null; },
    insertEmpresa: w('empresa', async row => { db.empresas.push({ ...row }); return row; }),
    findAppUserByEmail: e => id.findAppUserByEmail(e),
    listUnidades: e => id.listUnidades(e),
    insertUnidade: w('unidade', r => id.insertUnidade(r)),
    listMembershipsByEmpresa: e => id.listMembershipsByEmpresa(e),
    insertMembership: w('membership.insert', r => id.insertMembership(r)),
    updateMembership: w('membership.update', (mid, p) => id.updateMembership(mid, p))
  };
}
const ARGS = ['--empresa-id', EMPRESA, '--empresa-nome', 'Salão Teste', '--admin-email', EMAIL];
const dono = () => ({ id: USER_ID, email: EMAIL, nome: 'Dono', ativo: true });
// Store que explode se for tocado: prova que a recusa acontece antes de qualquer conexão.
const storeProibido = new Proxy({}, { get() { throw new Error('store tocado apesar da recusa'); } });

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
let apiBase;

test('01 --help das três ferramentas (código 0) e opção desconhecida = 2', () => {
  for (const s of ['doctor.js', 'bootstrap-admin.js', 'smoke.js']) {
    const r = cli(s, ['--help'], {});
    assert.strictEqual(r.code, 0, s);
    assert.match(r.out, /Uso:/, s);
    assert.strictEqual(cli(s, ['--nao-existe'], {}).code, 2, `${s} opção desconhecida`);
  }
  assert.strictEqual(cli('smoke.js', [], {}).code, 2, 'smoke sem --api');
  assert.strictEqual(cli('bootstrap-admin.js', ['--empresa-id', 'x', '--empresa-nome', 'a', '--admin-email', EMAIL], {}).code, 2, 'uuid inválido');
});

test('02 doctor offline: ambiente de produção coerente = 0', async () => {
  const r = await doctor.main(['--no-dotenv', '--offline', '--json'], prodEnv());
  const j = JSON.parse(r.stdout);
  assert.strictEqual(r.code, 0, r.stdout);
  assert.strictEqual(j.summary.fail, 0);
  assert.ok(j.checks.some(c => c.id === 'env.PUBLIC_BOOKING_LINKS' && /DESLIGADO/.test(c.message)));
});

test('03 doctor recusa o kortex-os-v2-staging (URL ou chave) com código 3 e não conecta', async () => {
  const r1 = cli('doctor.js', [], prodEnv({ SUPABASE_URL: STAGING_URL }));
  assert.strictEqual(r1.code, 3, r1.out);
  assert.match(r1.out, /PROIBIDO/);
  assert.match(r1.out, /recusado: nenhuma conexão/);
  const keyStaging = jwt({ iss: 'supabase', ref: lib.STAGING_REF, role: 'service_role' });
  const r2 = cli('doctor.js', ['--offline'], prodEnv({ SUPABASE_SECRET_KEY: keyStaging }));
  assert.strictEqual(r2.code, 3, r2.out);
  // Controle negativo: o mesmo ambiente com o projeto certo passa.
  assert.strictEqual(cli('doctor.js', ['--offline'], prodEnv()).code, 0);
});

test('04 doctor/bootstrap nunca imprimem a chave nem o API_ACCESS_TOKEN (humano e --json)', async () => {
  for (const args of [['--offline'], ['--offline', '--json']]) {
    const r = cli('doctor.js', args, prodEnv());
    assertNoSecret(r.out, KEY, 'sb_secret_');
    assertNoSecret(r.out, TOKEN);
    assert.match(r.out, /sb_secret_\*\*\*/);
  }
  const legacyJwt = jwt({ iss: 'supabase', ref: lib.PROD_REF, role: 'service_role', pad: 'x'.repeat(40) });
  const r = cli('doctor.js', ['--offline'], prodEnv({ SUPABASE_SECRET_KEY: legacyJwt }));
  assert.strictEqual(r.code, 0, r.out);
  assertNoSecret(r.out, legacyJwt.split('.')[1]);
  const b = cli('bootstrap-admin.js', ARGS, prodEnv({ SUPABASE_URL: STAGING_URL }));
  assertNoSecret(b.out, KEY, 'sb_secret_');
  // redact() é a última barreira: troca o segredo mesmo se alguém o colocar numa mensagem.
  assert.strictEqual(lib.redact(`erro com ${KEY} dentro`, [KEY]), 'erro com *** dentro');
});

test('05 doctor reprova incoerências (controles negativos, código 1)', async () => {
  const casos = {
    'CORS *': { CORS_ORIGIN: '*' },
    'PWA fora do CORS': { CORS_ORIGIN: 'https://outra.example' },
    'PUBLIC_BOOKING_LINKS inválido': { PUBLIC_BOOKING_LINKS: '{"slug": 1' },
    'PUBLIC_BOOKING_LINKS com uuid ruim': { PUBLIC_BOOKING_LINKS: '{"salao-x":"nao-uuid"}' },
    'fuso inválido': { APP_TIMEZONE: 'Marte/Olympus' },
    'chaves divergentes': { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_outra-chave-qualquer-000000' },
    'chave anon': { SUPABASE_SECRET_KEY: jwt({ ref: lib.PROD_REF, role: 'anon' }) },
    'chave publishable': { SUPABASE_SECRET_KEY: 'sb_publishable_abcdefghijklmnop' },
    'sem APP_PUBLIC_URL': { APP_PUBLIC_URL: '' },
    'sem token com legado ligado': { API_ACCESS_TOKEN: '' },
    'projeto desconhecido': { SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' },
    'URL fora do supabase.co': { SUPABASE_URL: 'https://example.invalid' }
  };
  for (const [nome, extra] of Object.entries(casos)) {
    const r = await doctor.main(['--no-dotenv', '--offline'], prodEnv(extra));
    assert.strictEqual(r.code, 1, `${nome}: esperado 1\n${r.stdout}`);
  }
  // PUBLIC_BOOKING_LINKS válido = ligado: só WARN (exige D-014), não reprova; com --strict reprova.
  const ligado = prodEnv({ PUBLIC_BOOKING_LINKS: JSON.stringify({ 'salao-x': EMPRESA }) });
  assert.strictEqual((await doctor.main(['--no-dotenv', '--offline'], ligado)).code, 0);
  assert.strictEqual((await doctor.main(['--no-dotenv', '--offline', '--strict'], ligado)).code, 1);
});

test('06 doctor online contra API local + PostgREST falso: 0; só GET/HEAD', async () => {
  const sb = await fakeSupabase();
  try {
    const r = await doctor.main(['--no-dotenv', '--json', '--api', apiBase, '--supabase-endpoint', sb.base], prodEnv());
    const j = JSON.parse(r.stdout);
    assert.strictEqual(r.code, 0, r.stdout);
    for (const id of ['api.health', 'db.schema.001–006', 'db.schema.007', 'db.schema.008', 'db.schema.009', 'db.rpcs', 'auth.signup']) {
      assert.ok(j.checks.some(c => c.id === id && c.level === 'OK'), `${id} OK`);
    }
    assert.ok(j.checks.some(c => c.id === 'db.contagens' && /empresas=1/.test(c.message)));
    assert.ok(sb.methods.length > 10 && sb.methods.every(m => m === 'GET' || m === 'HEAD'), `métodos: ${[...new Set(sb.methods)]}`);
  } finally { sb.server.close(); }
});

test('07 doctor online: tabelas da 009 ausentes, chave recusada e API fora do ar = 1 (controles negativos)', async () => {
  const sem009 = await fakeSupabase({ missing: ['comanda_estornos', 'comanda_estorno_itens'] });
  const outraChave = await fakeSupabase({ key: 'sb_secret_de-outro-projeto' });
  try {
    const r1 = await doctor.main(['--no-dotenv', '--supabase-endpoint', sem009.base], prodEnv());
    assert.strictEqual(r1.code, 1);
    assert.match(r1.stdout, /db\.schema\.009\s+tabelas ausentes: comanda_estornos, comanda_estorno_itens/);
    const r2 = await doctor.main(['--no-dotenv', '--supabase-endpoint', outraChave.base], prodEnv());
    assert.strictEqual(r2.code, 1);
    assert.match(r2.stdout, /recusou a chave/);
    const r3 = await doctor.main(['--no-dotenv', '--offline', '--api', 'http://127.0.0.1:1/api'], prodEnv());
    assert.strictEqual(r3.code, 0, 'offline não conecta');
    const r4 = await doctor.main(['--no-dotenv', '--api', 'http://127.0.0.1:1/api', '--supabase-endpoint', sem009.base, '--timeout', '2000'], prodEnv({ }));
    assert.match(r4.stdout, /api\.health\s+sem conexão/);
  } finally { sem009.server.close(); outraChave.server.close(); }
});

test('08 bootstrap: --dry-run é o padrão e não grava nada', async () => {
  const store = memoryStore({ users: [dono()] });
  const r = await bootstrap.main(['--no-dotenv', '--json', ...ARGS], prodEnv(), { store });
  const j = JSON.parse(r.stdout);
  assert.strictEqual(r.code, 0, r.stdout);
  assert.strictEqual(j.modo, 'dry-run');
  assert.deepStrictEqual(j.passos.map(p => `${p.alvo}:${p.acao}`), ['empresa:criar', 'unidade:criar', 'membership:criar']);
  assert.deepStrictEqual(store.writes, []);
  assert.strictEqual(store.db.empresas.length + store.db.unidades.length + store.db.empresa_memberships.length, 0);
  // --dry-run explícito: idem.
  await bootstrap.main(['--no-dotenv', '--dry-run', ...ARGS], prodEnv(), { store });
  assert.deepStrictEqual(store.writes, []);
});

test('09 bootstrap --apply grava empresa, unidade e admin; repetir é idempotente', async () => {
  const store = memoryStore({ users: [dono()] });
  const r1 = await bootstrap.main(['--no-dotenv', '--json', '--apply', ...ARGS], prodEnv(), { store });
  assert.strictEqual(r1.code, 0, r1.stdout);
  assert.deepStrictEqual(JSON.parse(r1.stdout).gravados, ['empresa', 'unidade', 'membership']);
  assert.deepStrictEqual(store.db.empresas, [{ id: EMPRESA, nome: 'Salão Teste' }]);
  assert.deepStrictEqual(store.db.unidades.map(u => [u.empresa_id, u.nome]), [[EMPRESA, 'Unidade principal']]);
  assert.deepStrictEqual(store.db.empresa_memberships.map(m => [m.empresa_id, m.user_id, m.role, m.status]), [[EMPRESA, USER_ID, 'admin', 'ativo']]);
  const antes = store.writes.length;
  const r2 = await bootstrap.main(['--no-dotenv', '--json', '--apply', ...ARGS], prodEnv(), { store });
  assert.strictEqual(r2.code, 0);
  assert.deepStrictEqual(JSON.parse(r2.stdout).gravados, []);
  assert.strictEqual(store.writes.length, antes, 'segunda execução não grava');
  assert.strictEqual(store.db.unidades.length, 1);
  assert.strictEqual(store.db.empresa_memberships.length, 1);
  const r3 = await bootstrap.main(['--no-dotenv', ...ARGS], prodEnv(), { store });
  assert.match(r3.stdout, /nada a fazer, já está configurado/);
});

test('10 bootstrap: vínculo existente é promovido/reativado; empresa existente não é renomeada', async () => {
  const store = memoryStore({
    users: [dono()],
    empresas: [{ id: EMPRESA, nome: 'Nome Original' }],
    unidades: [{ id: 'u1', empresa_id: EMPRESA, nome: 'Matriz', ativo: true }],
    memberships: [{ id: 'm1', empresa_id: EMPRESA, user_id: USER_ID, role: 'recepcao', status: 'inativo' }]
  });
  const r = await bootstrap.main(['--no-dotenv', '--apply', ...ARGS], prodEnv(), { store });
  assert.strictEqual(r.code, 0, r.stdout);
  assert.deepStrictEqual(store.writes, ['membership.update']);
  assert.strictEqual(store.db.empresas[0].nome, 'Nome Original');
  assert.match(r.stdout, /não renomeio/);
  assert.deepStrictEqual([store.db.empresa_memberships[0].role, store.db.empresa_memberships[0].status], ['admin', 'ativo']);
});

test('11 bootstrap: usuário não convidado = 1 e nada gravado mesmo com --apply (controle negativo)', async () => {
  const store = memoryStore({ users: [{ id: USER_ID, email: 'outro@salao.test', nome: 'X' }] });
  const r = await bootstrap.main(['--no-dotenv', '--apply', ...ARGS], prodEnv(), { store });
  assert.strictEqual(r.code, 1, r.stdout);
  assert.match(r.stdout, /Invite user/);
  assert.deepStrictEqual(store.writes, []);
});

test('12 bootstrap recusa staging, projeto divergente e chave de staging (código 3, sem tocar o banco)', async () => {
  const casos = [
    prodEnv({ SUPABASE_URL: STAGING_URL }),
    prodEnv({ SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' }),
    prodEnv({ SUPABASE_SECRET_KEY: jwt({ ref: lib.STAGING_REF, role: 'service_role' }) }),
    prodEnv({ SUPABASE_SECRET_KEY: jwt({ ref: 'aaaaaaaaaaaaaaaaaaaa', role: 'service_role' }) })
  ];
  for (const e of casos) {
    const r = await bootstrap.main(['--no-dotenv', '--apply', ...ARGS], e, { store: storeProibido });
    assert.strictEqual(r.code, 3, r.stdout);
  }
  // --expected-ref não libera o staging.
  const r = await bootstrap.main(['--no-dotenv', '--apply', '--expected-ref', lib.STAGING_REF, ...ARGS], prodEnv({ SUPABASE_URL: STAGING_URL }), { store: storeProibido });
  assert.strictEqual(r.code, 3);
  // Pela CLI real (sem injeção): recusa antes de criar o cliente Supabase.
  const c = cli('bootstrap-admin.js', ['--apply', ...ARGS], prodEnv({ SUPABASE_URL: STAGING_URL }));
  assert.strictEqual(c.code, 3, c.out);
  assert.match(c.out, /PROIBIDO/);
});

test('13 smoke contra o app local + PWA falsa = 0', async () => {
  const pwa = await fakePwa(apiBase);
  try {
    const r = await smoke.main(['--json', '--api', apiBase, '--pwa', `${pwa.base}/`]);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(r.code, 0, r.stdout);
    for (const id of ['api.health', 'api.auth.sem-token', 'api.auth.token-invalido', 'api.headers', 'api.cors.pwa', 'api.cors.estranha', 'api.cors.sufixo', 'api.public', 'pwa.index', 'pwa.csp', 'pwa.headers', 'pwa.config', 'pwa.service-worker']) {
      assert.ok(j.checks.some(c => c.id === id && c.level === 'OK'), `${id} OK\n${r.stdout}`);
    }
    // Achado conhecido (app.js libera localhost/LAN em qualquer ambiente): WARN, não FAIL.
    assert.ok(j.checks.some(c => c.id === 'api.cors.localhost' && c.level === 'WARN'));
    // Pela CLI real também (assíncrono: o app roda neste mesmo processo).
    const c = await new Promise(resolve => execFile(process.execPath, [path.join(OPS, 'smoke.js'), '--api', apiBase, '--pwa', pwa.base],
      { encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr })));
    assert.strictEqual(c.code, 0, c.out);
    assert.match(c.out, /APTO/);
  } finally { pwa.server.close(); }
});

test('14 smoke reprova (controles negativos): sem CSP, CORS aberto, agendamento ligado, apiBase errado', async () => {
  const semCsp = await fakePwa(apiBase, { csp: false });
  const apiErrada = await fakePwa(apiBase, { apiBaseNoConfig: 'https://outra-api.example/api' });
  const corsAntes = env.CORS_ORIGIN;
  const linksAntes = env.PUBLIC_BOOKING_LINKS;
  const falha = (r, id) => JSON.parse(r.stdout).checks.some(c => c.id === id && c.level === 'FAIL');
  try {
    const r1 = await smoke.main(['--json', '--api', apiBase, '--pwa', semCsp.base]);
    assert.strictEqual(r1.code, 1);
    assert.ok(falha(r1, 'pwa.csp'));

    const r2 = await smoke.main(['--json', '--api', apiBase, '--pwa', apiErrada.base]);
    assert.strictEqual(r2.code, 1);
    assert.ok(falha(r2, 'pwa.config'));

    env.CORS_ORIGIN = ['*'];
    const r3 = await smoke.main(['--json', '--api', apiBase]);
    assert.strictEqual(r3.code, 1);
    assert.ok(falha(r3, 'api.cors.estranha') && falha(r3, 'api.cors.sufixo'));
    env.CORS_ORIGIN = corsAntes;

    env.PUBLIC_BOOKING_LINKS = JSON.stringify({ 'salao-x': EMPRESA });
    const r4 = await smoke.main(['--json', '--api', apiBase]);
    assert.strictEqual(r4.code, 1);
    assert.ok(falha(r4, 'api.public'));
    const r5 = await smoke.main(['--json', '--api', apiBase, '--public-booking', 'on']);
    assert.ok(!falha(r5, 'api.public'), 'ligado e esperado ligado passa');
    env.PUBLIC_BOOKING_LINKS = linksAntes;

    const r6 = await smoke.main(['--api', 'http://127.0.0.1:1/api', '--timeout', '2000']);
    assert.strictEqual(r6.code, 1);
    assert.match(r6.stdout, /sem conexão/);
  } finally {
    env.CORS_ORIGIN = corsAntes;
    env.PUBLIC_BOOKING_LINKS = linksAntes;
    semCsp.server.close(); apiErrada.server.close();
  }
});

test('15 constantes em sincronia com o app e com o render.yaml', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  assert.ok(appJs.includes(`'${lib.GITHUB_PAGES_ORIGIN}'`), 'GITHUB_PAGES_ORIGIN divergente de app.js');
  const yaml = fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8');
  assert.ok(/key: SUPABASE_(SECRET|SERVICE_ROLE)_KEY\b/.test(yaml), 'render.yaml sem a chave secreta');
  for (const v of ['SUPABASE_URL', 'API_ACCESS_TOKEN', 'DEFAULT_EMPRESA_ID', 'CORS_ORIGIN', 'APP_PUBLIC_URL', 'LEGACY_TOKEN_AUTH_ENABLED', 'APP_TIMEZONE']) {
    assert.ok(new RegExp(`key: ${v}\\b`).test(yaml), `render.yaml sem ${v}`);
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8'));
  assert.ok(yaml.includes(`connect-src 'self' ${new URL(cfg.apiBase).origin}`), 'CSP do render.yaml não libera a API do config.json');
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  apiBase = `http://127.0.0.1:${server.address().port}/api`;
  const log = console.error;
  let passed = 0;
  for (const t of tests) {
    console.error = () => {}; // o app loga erros esperados (401/404) via mapErrorForResponse
    try { await t.fn(); passed += 1; console.log(`✓ ${t.name}`); } catch (err) { console.error = log; console.error(`✕ ${t.name}`); console.error(err); }
    console.error = log;
  }
  await new Promise(r => server.close(r));
  console.log(`\nOps Gate: ${passed}/${tests.length} testes verdes.`);
  if (passed !== tests.length) process.exit(1);
})();
