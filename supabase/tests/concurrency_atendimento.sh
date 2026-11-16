#!/usr/bin/env bash
# Corrida na reserva de várias etapas (019, D-040): duas sessões pedem atendimentos de duas
# etapas que disputam o MESMO horário de um profissional na 2ª etapa. A sessão A segura a
# transação; B espera a trava e recebe SCHEDULE_CONFLICT. Resultado: as 2 etapas de A gravadas e
# NENHUMA de B (nem a 1ª, que estava livre): sem reserva parcial.
set -euo pipefail
DB=${TEST_DB:-hopeos_migrations_test}
q() { psql -v ON_ERROR_STOP=1 -qXtA -d "$DB" "$@"; }
E=e1900000-0000-4000-8000-0000000000c1 P1=a1900000-0000-4000-8000-0000000000c1 P2=a1900000-0000-4000-8000-0000000000c2 P3=a1900000-0000-4000-8000-0000000000c3 S=b1900000-0000-4000-8000-0000000000c1
cleanup() { q -c "delete from agendamentos where empresa_id='$E'; delete from servicos where empresa_id='$E'; delete from profissionais where empresa_id='$E'; delete from unidades where empresa_id='$E'; delete from empresas where id='$E';" >/dev/null; }
cleanup
q -c "insert into empresas(id,nome) values('$E','ConcAt'); insert into profissionais(id,empresa_id,nome) values('$P1','$E','P1'),('$P2','$E','P2'),('$P3','$E','P3'); insert into servicos(id,empresa_id,nome) values('$S','$E','S');" >/dev/null
et() { echo "{\"profissional_id\":\"$1\",\"servico_id\":\"$S\",\"data\":\"2026-12-01\",\"horario\":\"$2\",\"duracao_min\":30}"; }
PAY_A="[$(et $P1 10:00),$(et $P2 10:30)]"
PAY_B="[$(et $P3 10:00),$(et $P2 10:30)]"

OUT_A=$(mktemp) OUT_B=$(mktemp)
( q -c "begin" -c "select atendimento_criar('$E','$PAY_A')->>'grupo_id'" -c "select pg_sleep(2)" -c "commit" >"$OUT_A" 2>&1 ) &
A=$!
sleep 0.5
set +e
q -c "select atendimento_criar('$E','$PAY_B')->>'grupo_id'" >"$OUT_B" 2>&1
B_RC=$?
set -e
wait $A
TOTAL=$(q -c "select count(*) from agendamentos where empresa_id='$E'")
DE_B=$(q -c "select count(*) from agendamentos where empresa_id='$E' and profissional_id='$P3'")
cleanup
if [ "$B_RC" -eq 0 ] || ! grep -q SCHEDULE_CONFLICT "$OUT_B" || [ "$TOTAL" != 2 ] || [ "$DE_B" != 0 ]; then
  echo "FALHA concorrência do atendimento: B_rc=$B_RC total=$TOTAL etapasDeB=$DE_B"; cat "$OUT_A" "$OUT_B"; exit 1
fi
echo "OK concorrência do atendimento: 2 reservas simultâneas → 1 inteira gravada, a outra sem nenhuma etapa"
