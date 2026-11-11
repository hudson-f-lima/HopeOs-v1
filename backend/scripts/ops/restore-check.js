#!/usr/bin/env node
// Teste de restauração do backup (D-021): carrega o arquivo de backup.js num Postgres
// LIMPO, já com as migrations aplicadas, e confere tabela por tabela: contagem, ids e
// somas em centavos. Backup que não restaura não é backup.
//
// Uso: PGHOST=... PGUSER=... node backend/scripts/ops/restore-check.js --in arquivo.json --db banco_descartavel
// NUNCA aponte para produção: o banco de destino recebe inserts com triggers desligados.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseArgs, UsageError, EXIT } = require('./lib');
const { resumir } = require('./backup');

const psql = (db, args, input) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-qXAt', '-d', db, ...args], { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const ident = t => { if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`nome de tabela inesperado: ${t}`); return `public.${t}`; };

function conferir(backup, db) {
  const falhas = [];
  // 1. O arquivo é coerente com o próprio resumo (pega arquivo truncado ou adulterado).
  for (const [t, esperado] of Object.entries(backup.meta.tabelas)) {
    const real = resumir(backup.dados[t] || []);
    if (real.linhas !== esperado.linhas || real.idsSha256 !== esperado.idsSha256) falhas.push(`${t}: arquivo não confere com o resumo (${real.linhas} × ${esperado.linhas} linhas)`);
  }
  if (falhas.length) return falhas;

  // 2. Carga: uma transação, triggers e chaves estrangeiras desligados só nesta sessão.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hopeos-restore-'));
  try {
    let sql = 'begin;\nset local session_replication_role = replica;\n';
    for (const [t, linhas] of Object.entries(backup.dados)) {
      if (!linhas.length) continue;
      const arq = path.join(tmp, `${t}.json`);
      fs.writeFileSync(arq, JSON.stringify(linhas));
      sql += `\\set conteudo \`cat ${arq}\`\ninsert into ${ident(t)} select * from jsonb_populate_recordset(null::${ident(t)}, :'conteudo'::jsonb);\n`;
    }
    sql += 'commit;\n';
    psql(db, ['-f', '-'], sql);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // 3. Conferência no banco restaurado.
  for (const [t, esperado] of Object.entries(backup.meta.tabelas)) {
    const n = Number(psql(db, ['-c', `select count(*) from ${ident(t)}`]).trim());
    if (n !== esperado.linhas) { falhas.push(`${t}: ${n} linha(s) restauradas, esperado ${esperado.linhas}`); continue; }
    if (esperado.temId) {
      const ids = psql(db, ['-c', `select id::text from ${ident(t)} order by 1`]).split('\n').filter(Boolean).sort();
      const hash = require('crypto').createHash('sha256').update(ids.join('\n')).digest('hex');
      if (hash !== esperado.idsSha256) falhas.push(`${t}: ids restaurados não conferem`);
    }
    for (const [col, soma] of Object.entries(esperado.somasCentavos || {})) {
      if (!/^[a-z_][a-z0-9_]*$/.test(col)) { falhas.push(`${t}: coluna inesperada ${col}`); continue; }
      const real = Number(psql(db, ['-c', `select coalesce(sum(${col}), 0) from ${ident(t)}`]).trim());
      if (real !== soma) falhas.push(`${t}.${col}: soma ${real}, esperado ${soma}`);
    }
  }
  return falhas;
}

function main(argv) {
  const opts = parseArgs(argv, { string: ['in', 'db'], boolean: ['help'] });
  if (opts.help || !opts.in || !opts.db) throw new UsageError('uso: restore-check.js --in <arquivo.json> --db <banco descartável>');
  const backup = JSON.parse(fs.readFileSync(opts.in, 'utf8'));
  if (!backup.meta || backup.meta.formato !== 1 || !backup.dados) { console.error('arquivo não é um backup do HOPE OS (formato 1).'); return EXIT.FAIL; }
  const falhas = conferir(backup, opts.db);
  const total = Object.values(backup.meta.tabelas).reduce((s, t) => s + t.linhas, 0);
  if (falhas.length) { console.error(`RESTAURAÇÃO REPROVADA:\n- ${falhas.join('\n- ')}`); return EXIT.FAIL; }
  console.log(`OK restauração: ${Object.keys(backup.meta.tabelas).length} tabelas, ${total} linhas conferidas (contagem, ids e somas em centavos). Backup de ${backup.meta.criadoEm}.`);
  return EXIT.OK;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (err) { console.error(err instanceof UsageError ? err.message : `FALHA na restauração: ${err.message.split('\n').slice(0, 6).join('\n')}`); process.exit(err instanceof UsageError ? EXIT.USAGE : EXIT.FAIL); }
}

module.exports = { conferir, main };
