#!/usr/bin/env bash
# Prova a corrida de double-booking fechada pela 007: duas sessões simultâneas
# pedem o mesmo horário. Sessão A segura a transação; B precisa esperar o lock
# e então receber SCHEDULE_CONFLICT (HS409). Sem o lock, as duas gravariam.
set -euo pipefail
DB=${TEST_DB:-hopeos_migrations_test}
q() { psql -v ON_ERROR_STOP=1 -qXtA -d "$DB" "$@"; }
E=e1000000-0000-4000-8000-000000000001 P=a1000000-0000-4000-8000-000000000001 S=b1000000-0000-4000-8000-000000000001
cleanup() { q -c "delete from agendamentos where empresa_id='$E'; delete from servicos where empresa_id='$E'; delete from profissionais where empresa_id='$E'; delete from unidades where empresa_id='$E'; delete from empresas where id='$E';" >/dev/null; }
cleanup
q -c "insert into empresas(id,nome) values('$E','Conc'); insert into profissionais(id,empresa_id,nome) values('$P','$E','P'); insert into servicos(id,empresa_id,nome) values('$S','$E','S');" >/dev/null
PAY="{\"profissional_id\":\"$P\",\"servico_id\":\"$S\",\"data\":\"2026-12-01\",\"horario\":\"10:00\",\"duracao_min\":60}"

OUT_A=$(mktemp) OUT_B=$(mktemp)
( q -c "begin" -c "select agendamento_criar('$E','$PAY')->>'id'" -c "select pg_sleep(2)" -c "commit" >"$OUT_A" 2>&1 ) &
A=$!
sleep 0.5
set +e
q -c "select agendamento_criar('$E','$PAY')->>'id'" >"$OUT_B" 2>&1
B_RC=$?
set -e
wait $A
TOTAL=$(q -c "select count(*) from agendamentos where empresa_id='$E'")
cleanup
if [ "$B_RC" -eq 0 ] || ! grep -q SCHEDULE_CONFLICT "$OUT_B" || [ "$TOTAL" != 1 ]; then
  echo "FALHA concorrência: B_rc=$B_RC total=$TOTAL"; cat "$OUT_A" "$OUT_B"; exit 1
fi
echo "OK concorrência: 2 pedidos simultâneos → 1 gravado, 1 SCHEDULE_CONFLICT"
