#!/usr/bin/env node
// Backup lógico do banco do HOPE OS (D-021): exporta TODAS as tabelas do schema public
// pelo PostgREST, só leitura, para um arquivo JSON com contagem e hash por tabela.
// Não substitui o backup do provedor: é a cópia fora do Supabase que o plano gratuito
// não dá. Restauração conferida por restore-check.js.
//
// Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node backend/scripts/ops/backup.js --out arquivo.json
// Não exporta o schema auth (logins e senhas): fora do alcance do PostgREST.
// A chave nunca é impressa. Recusa o projeto kortex-os-v2-staging.
const fs = require('fs');
const crypto = require('crypto');
const { parseArgs, pickKey, supabaseRef, containsStaging, UsageError, EXIT, PROD_REF } = require('./lib');

const PAGINA = 500;
const canonico = v => (v === null || typeof v !== 'object' ? JSON.stringify(v)
  : Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`);

// Resumo que não depende da ordem das linhas: contagem, hash dos ids e soma de cada coluna *_centavos.
function resumir(linhas) {
  const ids = linhas.map(l => (l.id === undefined ? canonico(l) : String(l.id))).sort();
  const somas = {};
  for (const l of linhas) {
    for (const [k, v] of Object.entries(l)) {
      if (k.endsWith('_centavos') && typeof v === 'number') somas[k] = (somas[k] || 0) + v;
    }
  }
  return { linhas: linhas.length, idsSha256: crypto.createHash('sha256').update(ids.join('\n')).digest('hex'), temId: linhas.length ? linhas[0].id !== undefined : null, somasCentavos: somas };
}

async function exportar({ url, key, fetchImpl = fetch, log = () => {} }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  const raiz = await fetchImpl(`${base}/`, { headers });
  if (!raiz.ok) throw new Error(`PostgREST respondeu ${raiz.status} ao listar as tabelas`);
  const spec = await raiz.json();
  const tabelas = Object.keys(spec.definitions || {}).sort();
  if (!tabelas.length) throw new Error('nenhuma tabela listada pelo PostgREST');
  const dados = {};
  const resumo = {};
  for (const t of tabelas) {
    const linhas = [];
    for (let de = 0; ; de += PAGINA) {
      const r = await fetchImpl(`${base}/${t}?select=*`, { headers: { ...headers, range: `${de}-${de + PAGINA - 1}`, 'range-unit': 'items' } });
      if (!r.ok) throw new Error(`falha ao ler ${t}: HTTP ${r.status}`);
      const pagina = await r.json();
      if (!Array.isArray(pagina)) throw new Error(`resposta inesperada ao ler ${t}`);
      linhas.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    dados[t] = linhas;
    resumo[t] = resumir(linhas);
    log(`${t}: ${linhas.length} linha(s)`);
  }
  return { meta: { formato: 1, criadoEm: new Date().toISOString(), projeto: supabaseRef(url).ref || supabaseRef(url).host || null, tabelas: resumo }, dados };
}

async function main(argv, env) {
  const opts = parseArgs(argv, { string: ['out'], boolean: ['help'] });
  if (opts.help || !opts.out) throw new UsageError('uso: backup.js --out <arquivo.json>');
  const url = env.SUPABASE_URL;
  const key = pickKey(env);
  if (!url || !key) { console.error('SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.'); return EXIT.USAGE; }
  if (containsStaging(url)) { console.error('RECUSADO: projeto kortex-os-v2-staging não é do HOPE OS.'); return EXIT.REFUSED; }
  const backup = await exportar({ url, key, log: m => console.log(m) });
  fs.writeFileSync(opts.out, JSON.stringify(backup));
  const total = Object.values(backup.meta.tabelas).reduce((s, t) => s + t.linhas, 0);
  console.log(`OK backup: ${Object.keys(backup.dados).length} tabelas, ${total} linhas, projeto ${backup.meta.projeto}${backup.meta.projeto === PROD_REF ? ' (produção)' : ''}`);
  return EXIT.OK;
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then(code => process.exit(code)).catch(err => {
    console.error(err instanceof UsageError ? err.message : `FALHA no backup: ${err.message}`);
    process.exit(err instanceof UsageError ? EXIT.USAGE : EXIT.FAIL);
  });
}

module.exports = { exportar, resumir, canonico, main };
