#!/usr/bin/env bash
# Prova de ponta a ponta do backup (D-021), sem tocar em produção:
# banco A com migrations + dados → arquivo no formato do backup.js → banco B limpo →
# restore-check.js confere. Depois os controles negativos: arquivo com linha a menos e
# arquivo com valor adulterado TÊM de ser reprovados.
# Uso: PGHOST=... PGUSER=postgres supabase/tests/backup_restore.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
A=${TEST_DB:-hopeos_migrations_test}_bkp_a
B=${TEST_DB:-hopeos_migrations_test}_bkp_b
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"; for d in $A $B; do psql -qX -d postgres -c "drop database if exists $d" >/dev/null 2>&1 || true; done' EXIT
novo() { psql -v ON_ERROR_STOP=1 -qX -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null
  psql -v ON_ERROR_STOP=1 -qX -d "$1" -f supabase/tests/supabase_shim.sql >/dev/null
  for f in supabase/migrations/[0-9][0-9][0-9]_*.sql; do psql -v ON_ERROR_STOP=1 -qX -d "$1" -f "$f" >/dev/null 2>&1; done; }
novo "$A"

# Dados no banco A: cadastros, uma comanda com item e pagamento, caixa, meta e fechamento.
psql -v ON_ERROR_STOP=1 -qX -d "$A" >/dev/null <<'SQL'
insert into empresas (id, nome) values ('eb000000-0000-4000-8000-00000000000a', 'Salão Backup');
insert into app_users (id, email, nome) values ('cb000000-0000-4000-8000-000000000001', 'dono@bkp.test', 'Dono');
insert into empresa_memberships (empresa_id, user_id, role) values ('eb000000-0000-4000-8000-00000000000a', 'cb000000-0000-4000-8000-000000000001', 'admin');
insert into profissionais (id, empresa_id, nome) values ('ab000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000a', 'Ana');
insert into servicos (id, empresa_id, nome, valor_centavos) values ('bb000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000a', 'Corte', 6000);
insert into clientes (id, empresa_id, nome) values ('db000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000a', 'Cliente "com aspas" e ç');
insert into formas_pagamento (empresa_id, code, label) values ('eb000000-0000-4000-8000-00000000000a', 'pix', 'Pix');
set session_replication_role = replica; -- o ledger só aceita insert pela RPC; aqui é fixture
insert into comandos (id, empresa_id, cliente_id, total_recebido_centavos, snapshot) values ('fb000000-0000-4000-8000-00000000000a', 'eb000000-0000-4000-8000-00000000000a', 'db000000-0000-4000-8000-00000000000a', 6000, '{"origem": "fixture", "itens": [1, 2]}');
insert into comando_itens (empresa_id, comando_id, tipo, servico_id, profissional_id, descricao, valor_liquido_centavos, comissao_centavos, receita_empresa_centavos) values ('eb000000-0000-4000-8000-00000000000a', 'fb000000-0000-4000-8000-00000000000a', 'servico', 'bb000000-0000-4000-8000-00000000000a', 'ab000000-0000-4000-8000-00000000000a', 'Corte', 6000, 2400, 3600);
insert into comando_pagamentos (empresa_id, comando_id, forma_code, valor_centavos) values ('eb000000-0000-4000-8000-00000000000a', 'fb000000-0000-4000-8000-00000000000a', 'pix', 6000);
insert into caixa_movimentos (empresa_id, comando_id, tipo, forma_code, valor_centavos) values ('eb000000-0000-4000-8000-00000000000a', 'fb000000-0000-4000-8000-00000000000a', 'entrada_pagamento', 'pix', 6000);
insert into comissao_pagamentos (empresa_id, profissional_id, tipo, valor_centavos, data, idempotency_key, actor_id) values ('eb000000-0000-4000-8000-00000000000a', 'ab000000-0000-4000-8000-00000000000a', 'vale', 1000, current_date, 'k1', 'cb000000-0000-4000-8000-000000000001');
insert into caixa_fechamentos (empresa_id, data, esperado_dinheiro_centavos, contado_dinheiro_centavos, diferenca_centavos, idempotency_key, actor_id) values ('eb000000-0000-4000-8000-00000000000a', current_date, 0, 0, 0, 'f1', 'cb000000-0000-4000-8000-000000000001');
set session_replication_role = origin;
insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('eb000000-0000-4000-8000-00000000000a', 'ab000000-0000-4000-8000-00000000000a', '2026-11', 'produtos', 30000);
SQL

# Arquivo no formato do backup.js: linhas como JSON (o mesmo que o PostgREST devolve) + resumo.
node - "$A" "$TMP/backup.json" <<'JS'
const { execFileSync } = require('child_process');
const fs = require('fs');
const { resumir } = require('./backend/scripts/ops/backup');
const [db, out] = process.argv.slice(2);
const q = sql => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-qXAt', '-d', db, '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const tabelas = q("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1").split('\n');
const dados = {}; const resumo = {};
for (const t of tabelas) { dados[t] = JSON.parse(q(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.${t} x`)); resumo[t] = resumir(dados[t]); }
fs.writeFileSync(out, JSON.stringify({ meta: { formato: 1, criadoEm: new Date().toISOString(), projeto: 'teste-local', tabelas: resumo }, dados }));
console.log(`arquivo de teste: ${tabelas.length} tabelas, ${Object.values(resumo).reduce((s, r) => s + r.linhas, 0)} linhas`);
JS

novo "$B"
node backend/scripts/ops/restore-check.js --in "$TMP/backup.json" --db "$B"
# Conteúdo que só a restauração real preserva: texto com aspas/acentos e JSON aninhado.
test "$(psql -qXAt -d "$B" -c "select nome from clientes")" = 'Cliente "com aspas" e ç' || { echo "FALHA: texto do cliente não voltou igual"; exit 1; }
test "$(psql -qXAt -d "$B" -c "select snapshot->'itens'->>1 from comandos")" = '2' || { echo "FALHA: JSON da comanda não voltou igual"; exit 1; }
# O banco restaurado continua imutável (os triggers só ficaram desligados durante a carga).
if psql -qX -d "$B" -c "update comandos set total_recebido_centavos = 1" >/dev/null 2>&1; then echo "FALHA: ledger restaurado aceitou update"; exit 1; fi

# Controle negativo 1: uma linha some do arquivo → o próprio arquivo é reprovado.
node -e "const fs=require('fs');const b=JSON.parse(fs.readFileSync('$TMP/backup.json'));b.dados.comando_itens.pop();fs.writeFileSync('$TMP/sem_linha.json',JSON.stringify(b))"
novo "$B"
if node backend/scripts/ops/restore-check.js --in "$TMP/sem_linha.json" --db "$B" >/dev/null 2>&1; then echo "FALHA: backup com linha a menos foi aprovado"; exit 1; fi
echo "OK controle negativo: backup com linha a menos é reprovado"

# Controle negativo 2: valor adulterado (mesmos ids, mesma contagem) → a soma em centavos reprova.
node -e "const fs=require('fs');const b=JSON.parse(fs.readFileSync('$TMP/backup.json'));b.dados.comando_pagamentos[0].valor_centavos=1;fs.writeFileSync('$TMP/adulterado.json',JSON.stringify(b))"
novo "$B"
if node backend/scripts/ops/restore-check.js --in "$TMP/adulterado.json" --db "$B" >/dev/null 2>&1; then echo "FALHA: backup com valor adulterado foi aprovado"; exit 1; fi
echo "OK controle negativo: backup com valor adulterado é reprovado"
echo "OK backup + restauração"
