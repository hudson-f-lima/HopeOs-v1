// Utilitários comuns das ferramentas de operação (doctor, bootstrap-admin, smoke).
// Node puro: sem dependência nova. Segredos só por variável de ambiente e NUNCA
// impressos: tudo que vai para a saída passa por maskKey()/redact().
const http = require('http');
const https = require('https');

// Projeto Supabase do HOPE OS (produção) e o projeto PROIBIDO (outro produto).
const PROD_REF = 'gsttjozcmdvgstcpadiq'; // hopeos-v1
const STAGING_REF = 'hyzoocmmtmjlgdyifwhu'; // kortex-os-v2-staging — nunca usar para o HOPE OS
// Origem do GitHub Pages liberada à parte no CORS de backend/src/app.js
// (o ops-gate confere que as duas continuam iguais).
const GITHUB_PAGES_ORIGIN = 'https://hudson-f-lima.github.io';

const EXIT = { OK: 0, FAIL: 1, USAGE: 2, REFUSED: 3 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class UsageError extends Error {}

// --flag, --flag valor, --flag=valor. spec = { boolean: [...], string: [...] }.
function parseArgs(argv, spec) {
  const out = {};
  for (const b of spec.boolean || []) out[b] = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new UsageError(`argumento inesperado: ${arg}`);
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if ((spec.boolean || []).includes(name)) {
      if (eq !== -1) throw new UsageError(`--${name} não aceita valor`);
      out[name] = true;
    } else if ((spec.string || []).includes(name)) {
      const value = eq !== -1 ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined || value === '' || (eq === -1 && value.startsWith('--'))) throw new UsageError(`--${name} exige um valor`);
      out[name] = value;
    } else {
      throw new UsageError(`opção desconhecida: --${name}`);
    }
  }
  return out;
}

// Chave efetiva do backend: a mesma ordem de backend/src/db/supabaseClient.js.
function pickKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function supabaseRef(url) {
  let u;
  try { u = new URL(String(url || '')); } catch (_) { return { ok: false, error: 'URL inválida' }; }
  const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
  return {
    ok: Boolean(m) && u.protocol === 'https:',
    ref: m ? m[1] : null,
    host: u.hostname,
    protocol: u.protocol,
    error: !m ? 'host não é <ref>.supabase.co' : (u.protocol !== 'https:' ? 'precisa ser https' : null)
  };
}

function containsStaging(...values) {
  return values.some(v => String(v || '').toLowerCase().includes(STAGING_REF));
}

function decodeJwtPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (_) { return null; }
}

// Descreve a chave sem revelá-la: tipo, papel/projeto (se JWT) e tamanho.
function keyInfo(key) {
  const k = String(key || '');
  if (!k) return { present: false, kind: 'ausente', length: 0 };
  if (k.startsWith('sb_secret_')) return { present: true, kind: 'sb_secret', length: k.length };
  if (k.startsWith('sb_publishable_')) return { present: true, kind: 'sb_publishable', length: k.length };
  const payload = decodeJwtPayload(k);
  if (payload) return { present: true, kind: 'jwt', role: payload.role || null, ref: payload.ref || null, length: k.length };
  return { present: true, kind: 'desconhecido', length: k.length };
}

function maskKey(key) {
  const info = keyInfo(key);
  if (!info.present) return '(ausente)';
  if (info.kind === 'sb_secret') return `sb_secret_*** (${info.length} caracteres)`;
  if (info.kind === 'sb_publishable') return `sb_publishable_*** (${info.length} caracteres)`;
  if (info.kind === 'jwt') return `JWT role=${info.role || '?'} ref=${info.ref || '?'} (${info.length} caracteres)`;
  return `*** (${info.length} caracteres)`;
}

// Último filtro antes de imprimir: troca qualquer segredo conhecido por ***.
function redact(text, secrets) {
  let s = String(text);
  for (const secret of secrets || []) {
    if (secret && String(secret).length >= 4) s = s.split(String(secret)).join('***');
  }
  return s;
}

// HTTP(S) com timeout, sem seguir redirect, sem proxy implícito. Headers da resposta
// em minúsculas. Erro de rede vira { error }, nunca exceção.
function request(url, { method = 'GET', headers = {}, body, timeoutMs = 10000 } = {}) {
  return new Promise(resolve => {
    let u;
    try { u = new URL(url); } catch (_) { resolve({ status: 0, headers: {}, text: '', error: `URL inválida: ${url}` }); return; }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', c => { size += c.length; if (size <= 2 * 1024 * 1024) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout de ${timeoutMs} ms`)));
    req.on('error', err => resolve({ status: 0, headers: {}, text: '', error: err.message }));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function originOf(url) {
  try { return new URL(url).origin; } catch (_) { return null; }
}

// Relatório: níveis OK, WARN, FAIL, SKIP, INFO. FAIL → código 1.
function createReport(tool) {
  const checks = [];
  let refused = false;
  const add = (level, id, message) => { checks.push({ level, id, message }); };
  return {
    checks,
    ok: (id, m) => add('OK', id, m),
    warn: (id, m) => add('WARN', id, m),
    fail: (id, m) => add('FAIL', id, m),
    skip: (id, m) => add('SKIP', id, m),
    info: (id, m) => add('INFO', id, m),
    refuse(id, m) { refused = true; add('FAIL', id, m); },
    get refused() { return refused; },
    summary() {
      const count = l => checks.filter(c => c.level === l).length;
      return { ok: count('OK'), warn: count('WARN'), fail: count('FAIL'), skip: count('SKIP'), info: count('INFO') };
    },
    exitCode({ strict = false } = {}) {
      if (refused) return EXIT.REFUSED;
      const s = this.summary();
      return s.fail > 0 || (strict && s.warn > 0) ? EXIT.FAIL : EXIT.OK;
    },
    toJSON(extra = {}) {
      const code = this.exitCode(extra.strict ? { strict: true } : {});
      return { tool, ok: code === EXIT.OK, exitCode: code, summary: this.summary(), checks, ...extra.data };
    },
    render({ strict = false } = {}) {
      const lines = checks.map(c => `[${c.level.padEnd(4)}] ${c.id.padEnd(28)} ${c.message}`);
      const s = this.summary();
      const code = this.exitCode({ strict });
      const veredito = code === EXIT.OK ? 'APTO' : code === EXIT.REFUSED ? 'RECUSADO (segurança)' : 'REPROVADO';
      lines.push('', `Resumo: ${s.ok} OK, ${s.warn} WARN, ${s.fail} FAIL, ${s.skip} SKIP → ${veredito} (código ${code})`);
      return lines.join('\n');
    }
  };
}

// Executa main() de um script CLI: imprime (com segredos removidos) e sai com o código.
function runCli(main, secretsFromEnv = () => []) {
  main(process.argv.slice(2), process.env).then(({ code, stdout = '', stderr = '' }) => {
    const secrets = secretsFromEnv(process.env);
    if (stdout) process.stdout.write(redact(stdout, secrets) + '\n');
    if (stderr) process.stderr.write(redact(stderr, secrets) + '\n');
    process.exitCode = code;
  }, err => {
    process.stderr.write(redact(`erro inesperado: ${err && err.message}`, secretsFromEnv(process.env)) + '\n');
    process.exitCode = EXIT.FAIL;
  });
}

const envSecrets = env => [env.SUPABASE_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.API_ACCESS_TOKEN];

// Confere SUPABASE_URL + chave secreta contra o projeto esperado. Staging = recusa
// (código 3) sempre. Projeto diferente do esperado = recusa se mismatchIsRefusal
// (ferramenta que grava), senão FAIL. Devolve usable=true só se der para conectar.
function checkSupabaseTarget(env, report, { expectedRef = PROD_REF, mismatchIsRefusal = false } = {}) {
  const url = env.SUPABASE_URL || '';
  const key = pickKey(env);
  const info = keyInfo(key);
  let usable = true;
  const mismatch = (id, m) => { usable = false; if (mismatchIsRefusal) report.refuse(id, m); else report.fail(id, m); };

  if (!url) { report.fail('env.SUPABASE_URL', 'ausente'); usable = false; }
  else if (containsStaging(url)) { report.refuse('env.SUPABASE_URL', `PROIBIDO: aponta para kortex-os-v2-staging (${STAGING_REF}), que é OUTRO projeto. Use ${PROD_REF} (hopeos-v1).`); usable = false; }
  else {
    const r = supabaseRef(url);
    if (!r.ok) { report.fail('env.SUPABASE_URL', `formato inválido (${r.error}): esperado https://${expectedRef}.supabase.co`); usable = false; }
    else if (r.ref !== expectedRef) mismatch('env.SUPABASE_URL', `projeto ${r.ref} ≠ esperado ${expectedRef}${expectedRef === PROD_REF ? ' (hopeos-v1)' : ''}`);
    else report.ok('env.SUPABASE_URL', `projeto ${r.ref}${r.ref === PROD_REF ? ' (hopeos-v1)' : ''}`);
  }

  const both = env.SUPABASE_SECRET_KEY && env.SUPABASE_SERVICE_ROLE_KEY;
  if (!info.present) { report.fail('env.SUPABASE_SECRET_KEY', 'ausente (SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY)'); usable = false; }
  else if (both && env.SUPABASE_SECRET_KEY !== env.SUPABASE_SERVICE_ROLE_KEY) {
    report.fail('env.SUPABASE_SECRET_KEY', 'SUPABASE_SECRET_KEY e SUPABASE_SERVICE_ROLE_KEY definidas com valores DIFERENTES (o backend usa a primeira); deixe só uma');
    usable = false;
  } else if (info.kind === 'sb_publishable' || (info.kind === 'jwt' && info.role !== 'service_role')) {
    report.fail('env.SUPABASE_SECRET_KEY', `não é chave secreta: ${maskKey(key)}. Use a secret/service_role do projeto`);
    usable = false;
  } else if (info.kind === 'jwt' && info.ref === STAGING_REF) {
    report.refuse('env.SUPABASE_SECRET_KEY', `PROIBIDO: a chave é do kortex-os-v2-staging (${maskKey(key)})`);
    usable = false;
  } else if (info.kind === 'jwt' && info.ref && info.ref !== supabaseRef(url).ref) {
    mismatch('env.SUPABASE_SECRET_KEY', `a chave é de outro projeto (${maskKey(key)}) — não confere com SUPABASE_URL`);
  } else if (info.kind === 'desconhecido') {
    report.warn('env.SUPABASE_SECRET_KEY', `presente, formato não reconhecido: ${maskKey(key)}`);
  } else {
    report.ok('env.SUPABASE_SECRET_KEY', `presente: ${maskKey(key)}${both ? ' (as duas variáveis, mesmo valor)' : ''}`);
  }
  return { usable, key, url };
}


module.exports = {
  PROD_REF, STAGING_REF, GITHUB_PAGES_ORIGIN, EXIT, UUID_RE, EMAIL_RE, UsageError,
  parseArgs, pickKey, supabaseRef, containsStaging, keyInfo, maskKey, redact,
  request, parseJson, originOf, createReport, runCli, envSecrets, checkSupabaseTarget
};
