#!/usr/bin/env bash
# Prova a corrida do link público fechada pela 027 (D-063): duas sessões simultâneas do MESMO
# número, nenhuma com cliente escolhido (o backend leu a lista antes de qualquer uma gravar).
# A sessão A segura a transação; B espera a trava por salão + número e reaproveita o cliente de A.
# Sem a trava, as duas criariam um cliente cada (controle negativo registrado em D-063).
set -euo pipefail
DB=${TEST_DB:-hopeos_migrations_test}
q() { psql -v ON_ERROR_STOP=1 -qXtA -d "$DB" "$@"; }
E=e1270000-0000-4000-8000-000000000001 P=a1270000-0000-4000-8000-000000000001 S=b1270000-0000-4000-8000-000000000001
N=5521912340000
cleanup() { q -c "delete from agendamento_eventos where empresa_id='$E'; delete from agendamentos where empresa_id='$E'; delete from clientes where empresa_id='$E'; delete from servicos where empresa_id='$E'; delete from profissionais where empresa_id='$E'; delete from unidades where empresa_id='$E'; delete from empresas where id='$E';" >/dev/null; }
cleanup
q -c "insert into empresas(id,nome) values('$E','Conc027'); insert into profissionais(id,empresa_id,nome) values('$P','$E','P'); insert into servicos(id,empresa_id,nome) values('$S','$E','S');" >/dev/null
chamar() { echo "select agendamento_publico_criar('$E','$N',null,'{\"nome\":\"Corrida\"}','{\"profissional_id\":\"$P\",\"servico_id\":\"$S\",\"data\":\"2030-03-01\",\"horario\":\"$1\",\"duracao_min\":30}','{\"tipo\":\"origem_link_publico\",\"payload\":{}}')->>'cliente_concorrente'"; }

OUT_A=$(mktemp) OUT_B=$(mktemp)
( q -c "begin" -c "$(chamar 10:00)" -c "select pg_sleep(2)" -c "commit" >"$OUT_A" 2>&1 ) &
A=$!
sleep 0.5
q -c "$(chamar 11:00)" >"$OUT_B" 2>&1
wait $A
CLIENTES=$(q -c "select count(*) from clientes where empresa_id='$E'")
HORARIOS=$(q -c "select count(*) from agendamentos where empresa_id='$E'")
EVENTOS=$(q -c "select count(*) from agendamento_eventos where empresa_id='$E'")
cleanup
if [ "$CLIENTES" != 1 ] || [ "$HORARIOS" != 2 ] || [ "$EVENTOS" != 2 ] || ! grep -qx true "$OUT_B"; then
  echo "FALHA concorrência pública: clientes=$CLIENTES horarios=$HORARIOS eventos=$EVENTOS"; cat "$OUT_A" "$OUT_B"; exit 1
fi
echo "OK concorrência pública: 2 pedidos simultâneos do mesmo número → 1 cliente, 2 horários, 2 eventos"
