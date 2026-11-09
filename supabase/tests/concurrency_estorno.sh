#!/usr/bin/env bash
# Prova a corrida de estorno fechada pela 009: duas sessões simultâneas pedem o
# estorno TOTAL da mesma comanda com chaves diferentes. A sessão A segura a
# transação; B precisa esperar o advisory lock e então receber ESTORNO_JA_TOTAL.
# Sem o lock, as duas gravariam e o estoque voltaria em dobro.
# Também: mesma chave em paralelo = 1 evento só; e o rollback 009 recusa rodar
# com estorno gravado.
#   ESPERADO=1 (padrão) exige 1 estorno; ESPERADO=2 é o controle negativo
#   (rodado por controle_negativo_009.sh contra a RPC sem o lock).
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-hopeos_migrations_test}
ESPERADO=${ESPERADO:-1}
q() { psql -v ON_ERROR_STOP=1 -qXtA -d "$DB" "$@"; }
E=e1900000-0000-4000-8000-000000000001 U=c1900000-0000-4000-8000-000000000001 PR=d1900000-0000-4000-8000-000000000001
C1=11900000-0000-4000-8000-000000000001 C2=11900000-0000-4000-8000-000000000002
# O ledger é imutável (009): a limpeza do teste desliga os triggers só nesta sessão
# de superusuário (session_replication_role), como faria uma limpeza autorizada.
cleanup() {
  q -c "set session_replication_role = replica" \
    -c "delete from caixa_movimentos where empresa_id='$E'; delete from produto_estoque_movimentos where empresa_id='$E';
        delete from comanda_estorno_gorjetas where empresa_id='$E'; delete from comanda_estorno_pagamentos where empresa_id='$E';
        delete from comanda_estorno_itens where empresa_id='$E'; delete from comanda_estornos where empresa_id='$E';
        delete from comando_gorjetas where empresa_id='$E'; delete from comando_pagamentos where empresa_id='$E';
        delete from comando_itens where empresa_id='$E'; delete from comandos where empresa_id='$E';
        delete from produtos where empresa_id='$E'; delete from empresa_memberships where empresa_id='$E';
        delete from unidades where empresa_id='$E'; delete from app_users where id='$U'; delete from empresas where id='$E';" >/dev/null
}
cleanup
q -c "insert into empresas(id,nome) values('$E','Conc estorno');
      insert into app_users(id,email,nome) values('$U','conc-estorno@t','Admin');
      insert into empresa_memberships(empresa_id,user_id,role) values('$E','$U','admin');
      insert into produtos(id,empresa_id,nome,estoque_atual,custo_centavos,preco_venda_centavos) values('$PR','$E','Pomada',3,500,1000);
      insert into comandos(id,empresa_id,data,total_recebido_centavos) values('$C1','$E',current_date,2000),('$C2','$E',current_date,2000);
      insert into comando_itens(empresa_id,comando_id,tipo,produto_id,quantidade,descricao,valor_liquido_centavos,total_custo_centavos,receita_empresa_centavos)
        values('$E','$C1','produto','$PR',2,'Pomada',2000,1000,2000),('$E','$C2','produto','$PR',2,'Pomada',2000,1000,2000);
      insert into comando_pagamentos(empresa_id,comando_id,forma_code,valor_centavos) values('$E','$C1','pix',2000),('$E','$C2','pix',2000);" >/dev/null
pay() { echo "select comanda_estornar('$E','$1',jsonb_build_object('idempotencyKey','$2','data',current_date,'tipo','total','motivoCodigo','duplicidade','motivo','Lançada duas vezes no balcão'),'$U')->>'estornoId'"; }

corrida() { # $1 comanda, $2 chave A, $3 chave B → saídas em OUT_A/OUT_B, rc de B em B_RC
  OUT_A=$(mktemp) OUT_B=$(mktemp)
  ( q -c "begin" -c "$(pay "$1" "$2")" -c "select pg_sleep(2)" -c "commit" >"$OUT_A" 2>&1 ) &
  local A=$!
  sleep 0.5
  set +e
  q -c "$(pay "$1" "$3")" >"$OUT_B" 2>&1
  B_RC=$?
  set -e
  wait $A
}

# 1. chaves diferentes, mesma comanda
corrida "$C1" conc-a conc-b
TOTAL=$(q -c "select count(*) from comanda_estornos where comando_id='$C1'")
ESTOQUE=$(q -c "select estoque_atual from produtos where id='$PR'")
CAIXA=$(q -c "select coalesce(sum(valor_centavos),0) from caixa_movimentos where comando_id='$C1' and tipo='estorno_pagamento'")
if [ "$ESPERADO" = 2 ]; then
  cleanup
  if [ "$TOTAL" = 2 ] && [ "$ESTOQUE" = 7 ]; then
    echo "OK controle negativo: sem o advisory lock → $TOTAL estornos totais, estoque devolvido em dobro ($ESTOQUE), caixa $CAIXA"; exit 0
  fi
  echo "FALHA controle negativo: esperava 2 estornos sem o lock, veio total=$TOTAL estoque=$ESTOQUE"; cat "$OUT_A" "$OUT_B"; exit 1
fi
if [ "$B_RC" -eq 0 ] || ! grep -q ESTORNO_JA_TOTAL "$OUT_B" || [ "$TOTAL" != 1 ] || [ "$ESTOQUE" != 5 ] || [ "$CAIXA" != -2000 ]; then
  cleanup; echo "FALHA concorrência estorno: B_rc=$B_RC total=$TOTAL estoque=$ESTOQUE caixa=$CAIXA"; cat "$OUT_A" "$OUT_B"; exit 1
fi

# 2. mesma chave em paralelo: B espera o lock e recebe o mesmo estorno (idempotente)
corrida "$C2" conc-mesma conc-mesma
TOTAL2=$(q -c "select count(*) from comanda_estornos where comando_id='$C2'")
ID_A=$(grep -E '^[0-9a-f-]{36}$' "$OUT_A" | head -1 || true)
ID_B=$(grep -E '^[0-9a-f-]{36}$' "$OUT_B" | head -1 || true)
if [ "$B_RC" -ne 0 ] || [ "$TOTAL2" != 1 ] || [ -z "$ID_A" ] || [ "$ID_A" != "$ID_B" ]; then
  cleanup; echo "FALHA concorrência mesma chave: B_rc=$B_RC total=$TOTAL2 A=$ID_A B=$ID_B"; cat "$OUT_A" "$OUT_B"; exit 1
fi

# 3. rollback 009 recusa rodar com estorno gravado (e não desfaz nada)
set +e
SAIDA_RB=$(psql -v ON_ERROR_STOP=1 -qX -d "$DB" -f supabase/rollback/009_down.sql 2>&1)
RB_RC=$?
set -e
AINDA=$(q -c "select to_regclass('public.comanda_estornos') is not null")
cleanup
if [ "$RB_RC" -eq 0 ] || ! grep -q 'rollback 009 recusado' <<<"$SAIDA_RB" || [ "$AINDA" != t ]; then
  echo "FALHA: rollback 009 rodou com estorno gravado (rc=$RB_RC)"; echo "$SAIDA_RB"; exit 1
fi
echo "OK concorrência estorno: 2 estornos totais simultâneos → 1 gravado, 1 ESTORNO_JA_TOTAL, estoque devolvido 1 vez; mesma chave → 1 evento; rollback 009 recusado com estorno gravado"
