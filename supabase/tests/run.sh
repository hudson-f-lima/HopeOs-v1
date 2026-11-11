#!/usr/bin/env bash
# Aplica shim + migrations em ordem num Postgres limpo e roda os gates SQL,
# os testes de concorrência, os controles negativos e o ciclo de rollback.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-hopeos_migrations_test}
psql -v ON_ERROR_STOP=1 -qX -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { echo "→ $1"; psql -v ON_ERROR_STOP=1 -qX -d "$DB" -f "$1"; }
run supabase/tests/supabase_shim.sql
for f in supabase/migrations/[0-9][0-9][0-9]_*.sql; do run "$f"; done
for f in supabase/tests/gate_*.sql; do [ -e "$f" ] && run "$f"; done
TEST_DB=$DB supabase/tests/concurrency_agenda.sh
TEST_DB=$DB supabase/tests/concurrency_estorno.sh
TEST_DB=$DB supabase/tests/controle_negativo_009.sh
TEST_DB=$DB supabase/tests/backup_restore.sh
if [ "${WITH_ROLLBACK:-1}" = 1 ] && ls supabase/rollback/*.sql >/dev/null 2>&1; then
  for f in $(ls -r supabase/rollback/*_down.sql); do run "$f"; done
  echo "→ reaplicando migrations após rollback"
  for f in supabase/migrations/[0-9][0-9][0-9]_*.sql; do
    n=$(basename "$f" | cut -c1-3)
    if [ "$((10#$n))" -ge 7 ]; then run "$f"; fi
  done
  # Depois do ciclo 010→009→008→007→reaplicação, os gates continuam verdes.
  for f in supabase/tests/gate_*.sql; do [ -e "$f" ] && run "$f"; done
fi
echo "OK migrations + gates SQL"
