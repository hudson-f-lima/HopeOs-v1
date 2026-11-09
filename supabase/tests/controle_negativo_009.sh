#!/usr/bin/env bash
# Controles negativos da 009: num banco DESCARTÁVEL (<TEST_DB>_neg), troca a RPC
# comanda_estornar por versões sem uma proteção (linhas marcadas "-- [guard:...]")
# e exige que o gate/concorrência FALHEM pelo motivo certo. Prova que os testes
# pegam a regressão. Uso: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/controle_negativo_009.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
NEG=${TEST_DB:-hopeos_migrations_test}_neg
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"; psql -qX -d postgres -c "drop database if exists $NEG" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -qX -d postgres -c "drop database if exists $NEG" -c "create database $NEG" >/dev/null
qn() { psql -v ON_ERROR_STOP=1 -qX -d "$NEG" "$@"; }
qn -f supabase/tests/supabase_shim.sql >/dev/null
for f in supabase/migrations/[0-9][0-9][0-9]_*.sql; do qn -f "$f" >/dev/null 2>&1; done

mutar() { # remove a(s) linha(s) "-- [guard:$1]" da função em produção neste banco
  qn -tA -c "select pg_get_functiondef('public.comanda_estornar(uuid,uuid,jsonb,uuid)'::regprocedure)" >"$TMP/orig.sql"
  grep -c "\[guard:$1\]" "$TMP/orig.sql" >/dev/null || { echo "FALHA: marcador guard:$1 não encontrado"; exit 1; }
  grep -v "\[guard:$1\]" "$TMP/orig.sql" >"$TMP/mut.sql"; echo ';' >>"$TMP/mut.sql"
  qn -f "$TMP/mut.sql" >/dev/null
}
restaurar() { qn -f supabase/migrations/009_estorno_comanda.sql >/dev/null; }
gate_deve_falhar() { # $1 guard, $2 mensagem esperada na falha
  set +e; local out; out=$(qn -f supabase/tests/gate_009.sql 2>&1); local rc=$?; set -e
  if [ "$rc" -eq 0 ]; then echo "FALHA controle negativo guard:$1 — gate_009 passou sem a proteção"; exit 1; fi
  if ! grep -q "$2" <<<"$out"; then echo "FALHA controle negativo guard:$1 — gate falhou por outro motivo:"; echo "$out" | grep -m3 ERROR; exit 1; fi
  echo "OK controle negativo guard:$1 → gate_009 reprova: $(grep -o "$2[^\"]*" <<<"$out" | head -1)"
}

# Sanidade: com a função original o gate passa neste banco.
qn -f supabase/tests/gate_009.sql >/dev/null

mutar excede;  gate_deve_falhar excede '03 aceitou estorno acima do vendido (soma dos parciais): passou'; restaurar
mutar tenant;  gate_deve_falhar tenant '05 estornou comanda de outra empresa: passou'; restaurar
mutar lock;    ESPERADO=2 TEST_DB=$NEG supabase/tests/concurrency_estorno.sh; restaurar
# Imutabilidade: sem o trigger numa tabela do ledger, o bloco 09 do gate reprova.
qn -c "drop trigger trg_ledger_imutavel on public.comando_itens" >/dev/null
gate_deve_falhar trigger '09 update em comando_itens: passou'; restaurar
echo "OK controles negativos 009"
