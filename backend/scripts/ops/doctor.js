#!/usr/bin/env node
// Diagnóstico READ-ONLY de um ambiente do HOPE OS (variáveis, backend, banco).
// Não escreve nada em lugar nenhum: só GET/HEAD no backend e no PostgREST/Auth.
// Rode `node backend/scripts/ops/doctor.js --help`.
const fs = require('fs');
const path = require('path');
const {
  PROD_REF, GITHUB_PAGES_ORIGIN, EXIT, UUID_RE, UsageError,
  parseArgs, checkSupabaseTarget, request, parseJson, originOf, createReport, runCli, envSecrets
} = require('./lib');

const HELP = `doctor — diagnóstico read-only de um ambiente do HOPE OS

Uso:
  node backend/scripts/ops/doctor.js [--api URL] [--offline] [--json] [opções]

Lê as MESMAS variáveis do backend (process.env + backend/.env via dotenv, como o
app) e confere:
  - variáveis: SUPABASE_URL (projeto ${PROD_REF}; FALHA se for o
    kortex-os-v2-staging), chave secreta (nunca impressa, só o tipo/tamanho),
    API_ACCESS_TOKEN, LEGACY_TOKEN_AUTH_ENABLED, APP_PUBLIC_URL, CORS_ORIGIN,
    APP_TIMEZONE, DEFAULT_EMPRESA_ID, PUBLIC_BOOKING_LINKS (válido ou ausente);
  - backend: GET <api>/health (com --api);
  - banco (com a chave): HEAD /rest/v1/<tabela>?limit=0 nas tabelas-chave de
    001–009, contagem de empresas/usuários/vínculos, /auth/v1/settings e a lista
    de RPCs do OpenAPI. Nada de SQL, nada de escrita.

Opções:
  --api URL                 base da API, ex.: https://hopeos-v1.onrender.com/api
  --expected-ref REF        projeto Supabase esperado (padrão ${PROD_REF})
  --offline                 só variáveis; não abre conexão nenhuma
  --no-dotenv               não carregar backend/.env (usa só o ambiente)
  --timeout MS              timeout por requisição (padrão 10000)
  --supabase-endpoint URL   (teste/local) envia as chamadas do banco para esta URL
                            em vez de SUPABASE_URL; a validação continua sobre SUPABASE_URL
  --json                    saída JSON
  --strict                  WARN também reprova
  --help

Saída: 0 = apto; 1 = algo crítico falhou; 2 = uso incorreto; 3 = recusado por
segurança (projeto proibido / chave de outro projeto).
`;

// Tabelas que provam cada etapa do schema. HEAD com limit=0: não lê linhas.
const TABLES = {
  '001–006': ['empresas', 'clientes', 'servicos', 'profissionais', 'agendamentos', 'comandos', 'comando_itens', 'comando_pagamentos', 'caixa_movimentos', 'produto_estoque_movimentos'],
  '007': ['app_users', 'empresa_memberships', 'unidades', 'membership_units', 'integrations', 'integration_credentials', 'integration_scopes', 'integration_audit_events'],
  '008': ['cargos', 'servico_categorias'],
  '009': ['comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas']
};
const COUNT_TABLES = ['empresas', 'unidades', 'app_users', 'empresa_memberships'];
const RPCS = ['checkout_close', 'agendamento_criar', 'checkout_close_autoria', 'comanda_estornar'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const REPO_ROOT = path.resolve(__dirname, '../../..');

function checkEnv(env, report) {
  if (env.NODE_ENV === 'production') report.ok('env.NODE_ENV', 'production');
  else report.warn('env.NODE_ENV', `${env.NODE_ENV || '(ausente)'} — em produção use "production" (liga HSTS)`);

  // API_ACCESS_TOKEN / legado
  const legacyRaw = env.LEGACY_TOKEN_AUTH_ENABLED;
  const legacyOn = String(legacyRaw ?? 'true').toLowerCase() !== 'false';
  if (legacyRaw === undefined || legacyRaw === '') report.info('env.LEGACY_TOKEN_AUTH_ENABLED', 'ausente → true (token legado ligado)');
  else if (['true', 'false'].includes(String(legacyRaw).toLowerCase())) report.ok('env.LEGACY_TOKEN_AUTH_ENABLED', `${String(legacyRaw).toLowerCase()}${legacyOn ? ' (token legado ligado — transição, ADR-005)' : ''}`);
  else report.warn('env.LEGACY_TOKEN_AUTH_ENABLED', `valor "${String(legacyRaw).slice(0, 20)}" é tratado como true; use true ou false`);
  const tok = env.API_ACCESS_TOKEN || '';
  if (!tok) {
    if (legacyOn) report.fail('env.API_ACCESS_TOKEN', 'ausente com o legado ligado: tokens não-JWT recebem 503');
    else report.info('env.API_ACCESS_TOKEN', 'ausente (legado desligado)');
  } else if (tok.length < 32) report.warn('env.API_ACCESS_TOKEN', `presente, mas curto (${tok.length} caracteres; use ≥ 32 aleatórios)`);
  else report.ok('env.API_ACCESS_TOKEN', `presente (${tok.length} caracteres)`);

  // APP_PUBLIC_URL
  const appUrl = env.APP_PUBLIC_URL || '';
  const appOrigin = originOf(appUrl);
  if (!appUrl) report.fail('env.APP_PUBLIC_URL', 'ausente: links de convite e de recuperação de senha ficam sem destino');
  else if (!appOrigin) report.fail('env.APP_PUBLIC_URL', 'não é uma URL válida');
  else if (!appUrl.startsWith('https://')) report.warn('env.APP_PUBLIC_URL', `${appUrl} não é https`);
  else report.ok('env.APP_PUBLIC_URL', appUrl);

  // CORS_ORIGIN
  const cors = String(env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!cors.length) report.warn('env.CORS_ORIGIN', 'ausente → padrão de dev (null, localhost); só o GitHub Pages passa por exceção do código');
  else if (cors.includes('*')) report.fail('env.CORS_ORIGIN', 'contém "*": qualquer site chama a API');
  else {
    const bad = cors.filter(o => o !== 'null' && originOf(o) !== o);
    if (bad.length) report.warn('env.CORS_ORIGIN', `entradas que não são origem pura (sem barra/caminho): ${bad.join(', ')}`);
    else report.ok('env.CORS_ORIGIN', cors.join(', '));
  }
  if (appOrigin) {
    if (appOrigin === GITHUB_PAGES_ORIGIN || cors.includes(appOrigin)) report.ok('cors.pwa', `origem da PWA (${appOrigin}) liberada`);
    else report.fail('cors.pwa', `origem da PWA (${appOrigin}) NÃO está em CORS_ORIGIN: o navegador bloqueia a API`);
  }

  // APP_TIMEZONE
  if (!env.APP_TIMEZONE) report.info('env.APP_TIMEZONE', 'ausente → America/Sao_Paulo');
  else {
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: env.APP_TIMEZONE }); report.ok('env.APP_TIMEZONE', env.APP_TIMEZONE); }
    catch (_) { report.fail('env.APP_TIMEZONE', `fuso inválido: ${env.APP_TIMEZONE}`); }
  }

  // DEFAULT_EMPRESA_ID
  if (!env.DEFAULT_EMPRESA_ID) report.warn('env.DEFAULT_EMPRESA_ID', 'ausente → 00000000-0000-0000-0000-000000000001 (empresa do token legado)');
  else if (!UUID_RE.test(env.DEFAULT_EMPRESA_ID)) report.fail('env.DEFAULT_EMPRESA_ID', 'não é UUID');
  else report.ok('env.DEFAULT_EMPRESA_ID', env.DEFAULT_EMPRESA_ID);

  // PUBLIC_BOOKING_LINKS
  const links = env.PUBLIC_BOOKING_LINKS;
  if (!links) report.ok('env.PUBLIC_BOOKING_LINKS', 'ausente → agendamento online DESLIGADO');
  else {
    const parsed = parseJson(links);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) report.fail('env.PUBLIC_BOOKING_LINKS', 'não é um objeto JSON {"slug":"<uuid>"}');
    else {
      const invalid = Object.entries(parsed).filter(([s, id]) => !SLUG_RE.test(String(s)) || !UUID_RE.test(String(id)));
      if (invalid.length) report.fail('env.PUBLIC_BOOKING_LINKS', `entradas inválidas (slug ou uuid): ${invalid.map(([s]) => String(s).slice(0, 40)).join(', ')}`);
      else if (!Object.keys(parsed).length) report.ok('env.PUBLIC_BOOKING_LINKS', 'objeto vazio → DESLIGADO');
      else report.warn('env.PUBLIC_BOOKING_LINKS', `LIGADO (${Object.keys(parsed).join(', ')}): exige aviso de privacidade aprovado + Red Team (D-014)`);
    }
  }
}

// Coerência do repositório com a URL da API (config.json da PWA e CSP do render.yaml).
function checkRepoCoherence(api, report) {
  const apiOrigin = originOf(api);
  try {
    const cfg = parseJson(fs.readFileSync(path.join(REPO_ROOT, 'config.json'), 'utf8')) || {};
    if (String(cfg.apiBase || '').replace(/\/+$/, '') === api.replace(/\/+$/, '')) report.ok('repo.config.json', `apiBase = ${cfg.apiBase}`);
    else report.warn('repo.config.json', `apiBase da PWA (${cfg.apiBase}) ≠ --api (${api})`);
  } catch (_) { report.skip('repo.config.json', 'config.json não encontrado'); }
  try {
    const yaml = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8');
    const csp = (/connect-src ([^;"]+)/.exec(yaml) || [])[1] || '';
    if (apiOrigin && csp.split(/\s+/).includes(apiOrigin)) report.ok('repo.render.yaml.csp', `connect-src libera ${apiOrigin}`);
    else report.warn('repo.render.yaml.csp', `connect-src da CSP (${csp.trim()}) não libera ${apiOrigin}`);
  } catch (_) { report.skip('repo.render.yaml.csp', 'render.yaml não encontrado'); }
}

async function checkApi(api, report, timeoutMs) {
  const base = api.replace(/\/+$/, '');
  const res = await request(`${base}/health`, { timeoutMs });
  const body = parseJson(res.text);
  if (res.error) report.fail('api.health', `sem conexão: ${res.error}`);
  else if (res.status === 200 && body && body.ok === true) report.ok('api.health', `200 (${body.app || 'API'})`);
  else if (/suspended/i.test(res.text)) report.fail('api.health', `${res.status} — serviço SUSPENSO no Render (reative no painel)`);
  else report.fail('api.health', `HTTP ${res.status} (esperado 200 {ok:true})`);
}

async function checkSupabase(endpoint, key, report, timeoutMs) {
  const base = endpoint.replace(/\/+$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const counts = {};
  let missing = 0;
  for (const [etapa, tables] of Object.entries(TABLES)) {
    const absent = [];
    for (const t of tables) {
      const want = COUNT_TABLES.includes(t);
      const res = await request(`${base}/rest/v1/${t}?select=*&limit=0`, { method: 'HEAD', headers: want ? { ...headers, Prefer: 'count=exact' } : headers, timeoutMs });
      if (res.error) { report.fail('db.conexao', `sem conexão com o PostgREST: ${res.error}`); return { counts, aborted: true }; }
      if (res.status === 401 || res.status === 403) { report.fail('db.chave', `PostgREST recusou a chave (HTTP ${res.status}): chave errada ou de outro projeto`); return { counts, aborted: true }; }
      if (res.status === 404) { absent.push(t); continue; }
      if (res.status >= 400) { report.fail(`db.${t}`, `HTTP ${res.status}`); continue; }
      if (want) { const m = /\/(\d+)$/.exec(res.headers['content-range'] || ''); counts[t] = m ? Number(m[1]) : null; }
    }
    missing += absent.length;
    if (absent.length) report.fail(`db.schema.${etapa}`, `tabelas ausentes: ${absent.join(', ')}`);
    else report.ok(`db.schema.${etapa}`, `${tables.length} tabelas presentes`);
  }
  if (Object.keys(counts).length) {
    report.info('db.contagens', COUNT_TABLES.filter(t => t in counts).map(t => `${t}=${counts[t] ?? '?'}`).join(', '));
    if (counts.empresas === 0) report.warn('db.bootstrap', 'nenhuma empresa: rode bootstrap-admin (passo 7 do runbook)');
    else if (counts.empresa_memberships === 0) report.warn('db.bootstrap', 'há empresa, mas nenhum vínculo: rode bootstrap-admin (passo 7 do runbook)');
  }

  // Auth: cadastro aberto / confirmação de e-mail. Leitura de configuração pública.
  const s = await request(`${base}/auth/v1/settings`, { headers: { apikey: key }, timeoutMs });
  const settings = parseJson(s.text);
  if (s.status === 200 && settings) {
    if (settings.disable_signup === false) report.warn('auth.signup', 'cadastro aberto ("Allow new users to sign up"): o fluxo do app é por convite');
    else report.ok('auth.signup', 'cadastro público desligado');
    if (settings.mailer_autoconfirm === true) report.warn('auth.confirm_email', '"Confirm email" desligado');
    else report.ok('auth.confirm_email', 'confirmação de e-mail ligada');
  } else report.warn('auth.settings', `não foi possível ler /auth/v1/settings (HTTP ${s.status || s.error})`);

  // RPCs: pela lista de caminhos do OpenAPI (GET /rest/v1/). Sem chamar RPC nenhuma.
  const o = await request(`${base}/rest/v1/`, { headers: { ...headers, Accept: 'application/openapi+json' }, timeoutMs });
  const spec = parseJson(o.text);
  if (o.status === 200 && spec && spec.paths) {
    const absent = RPCS.filter(r => !(`/rpc/${r}` in spec.paths));
    if (absent.length) report.warn('db.rpcs', `RPCs não listadas no OpenAPI: ${absent.join(', ')}`);
    else report.ok('db.rpcs', `${RPCS.join(', ')} presentes`);
  } else report.skip('db.rpcs', `OpenAPI indisponível (HTTP ${o.status || o.error}); confira as RPCs pela verificação SQL do runbook`);
  return { counts, missing };
}

async function runDoctor({ env, api = '', expectedRef = PROD_REF, offline = false, timeoutMs = 10000, supabaseEndpoint = '' }) {
  const report = createReport('doctor');
  const target = checkSupabaseTarget(env, report, { expectedRef });
  checkEnv(env, report);
  if (api) checkRepoCoherence(api, report);

  if (offline) {
    report.skip('api.health', '--offline');
    report.skip('db', '--offline');
    return report;
  }
  if (api) await checkApi(api, report, timeoutMs);
  else report.skip('api.health', 'sem --api');
  if (report.refused) report.skip('db', 'recusado: nenhuma conexão com projeto proibido/divergente');
  else if (!target.usable) report.skip('db', 'SUPABASE_URL/chave inválidos');
  else await checkSupabase(supabaseEndpoint || target.url, target.key, report, timeoutMs);
  return report;
}

async function main(argv, processEnv) {
  let opts;
  try {
    opts = parseArgs(argv, { boolean: ['help', 'json', 'offline', 'no-dotenv', 'strict'], string: ['api', 'expected-ref', 'timeout', 'supabase-endpoint'] });
  } catch (err) {
    if (err instanceof UsageError) return { code: EXIT.USAGE, stderr: `${err.message}\n\n${HELP}` };
    throw err;
  }
  if (opts.help) return { code: EXIT.OK, stdout: HELP };
  if (opts.api && !/^https?:\/\//.test(opts.api)) return { code: EXIT.USAGE, stderr: '--api precisa ser uma URL http(s)' };
  const timeoutMs = Number(opts.timeout || 10000);
  if (!(timeoutMs > 0)) return { code: EXIT.USAGE, stderr: '--timeout inválido' };
  if (!opts['no-dotenv']) require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  const report = await runDoctor({ env: processEnv, api: opts.api || '', expectedRef: opts['expected-ref'] || PROD_REF, offline: opts.offline, timeoutMs, supabaseEndpoint: opts['supabase-endpoint'] || '' });
  const code = report.exitCode({ strict: opts.strict });
  if (opts.json) return { code, stdout: JSON.stringify(report.toJSON({ strict: opts.strict }), null, 2) };
  return { code, stdout: `HOPE OS doctor (read-only)\n\n${report.render({ strict: opts.strict })}` };
}

module.exports = { main, runDoctor, TABLES };
if (require.main === module) runCli(main, envSecrets);
