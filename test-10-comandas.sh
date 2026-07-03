#!/bin/bash

BACKEND="http://localhost:3333"
EMPRESA="00000000-0000-0000-0000-000000000001"

echo "🚀 Testando 10 comandas contra HOPE OS V1.0.3"
echo "Backend: $BACKEND"
echo ""

# Função pra rodar 1 comanda
run_cmd() {
  local num=$1
  local service_id=$2
  local prof_id=$3
  local valor=$4
  local descricao=$5
  
  local key="cmd-$num-$(date +%s%N)"
  
  curl -s -X POST "$BACKEND/checkout/close" \
    -H "Content-Type: application/json" \
    -d "{
      \"empresaId\":\"$EMPRESA\",
      \"payload\":{\"clienteId\":\"11111111-1111-1111-1111-111111111111\",\"idempotencyKey\":\"$key\"},
      \"preview\":{
        \"totals\":{\"subtotalServicosCentavos\":$valor,\"totalItensCentavos\":$valor,\"servicosLiquidosCentavos\":$valor,\"itensLiquidosCentavos\":$valor,\"gorjetaBrutaCentavos\":500,\"taxaTotalCentavos\":0,\"totalRecebidoCentavos\":$((valor+500)),\"totalComissaoCentavos\":$((valor/10)),\"totalGorjetaLiquidaCentavos\":450,\"receitaEmpresaCentavos\":$((valor-valor/10))},
        \"itens\":[{\"tipo\":\"servico\",\"servicoId\":\"$service_id\",\"profissionalId\":\"$prof_id\",\"quantidade\":1,\"descricao\":\"$descricao\",\"precoUnitarioCentavos\":$valor,\"valorBrutoCentavos\":$valor,\"valorLiquidoCentavos\":$valor,\"totalVendaCentavos\":$valor,\"comissaoPct\":15,\"comissaoCentavos\":$((valor/10))}],
        \"payments\":[{\"formaCode\":\"dinheiro\",\"valorCentavos\":$((valor+500))}],
        \"gorjetas\":[{\"profissionalId\":\"$prof_id\",\"gorjetaBrutaCentavos\":500,\"gorjetaLiquidaCentavos\":450}]
      }
    }" | jq -r '.comandoId // "ERRO"'
}

echo "Rodando 10 comandas..."
echo ""

# 10 comandas com valores diferentes
run_cmd 1 "22222222-2222-2222-2222-222222222222" "33333333-3333-3333-3333-333333333333" 5000 "Corte de cabelo"
echo "✅ #1 fechada"

run_cmd 2 "44444444-4444-4444-4444-444444444444" "33333333-3333-3333-3333-333333333333" 3000 "Barba"
echo "✅ #2 fechada"

run_cmd 3 "22222222-2222-2222-2222-222222222222" "33333333-3333-3333-3333-333333333333" 5000 "Corte"
echo "✅ #3 fechada"

run_cmd 4 "44444444-4444-4444-4444-444444444444" "33333333-3333-3333-3333-333333333333" 3000 "Barba"
echo "✅ #4 fechada"

run_cmd 5 "22222222-2222-2222-2222-222222222222" "33333333-3333-3333-3333-333333333333" 5000 "Corte"
echo "✅ #5 fechada"

run_cmd 6 "44444444-4444-4444-4444-444444444444" "33333333-3333-3333-3333-333333333333" 3000 "Barba"
echo "✅ #6 fechada"

run_cmd 7 "22222222-2222-2222-2222-222222222222" "33333333-3333-3333-3333-333333333333" 5000 "Corte"
echo "✅ #7 fechada"

run_cmd 8 "44444444-4444-4444-4444-444444444444" "33333333-3333-3333-3333-333333333333" 3000 "Barba"
echo "✅ #8 fechada"

run_cmd 9 "22222222-2222-2222-2222-222222222222" "33333333-3333-3333-3333-333333333333" 5000 "Corte"
echo "✅ #9 fechada"

run_cmd 10 "44444444-4444-4444-4444-444444444444" "33333333-3333-3333-3333-333333333333" 3000 "Barba"
echo "✅ #10 fechada"

echo ""
echo "🎯 Validando no banco..."
sleep 2

curl -s "$BACKEND/api/dashboard" | jq '{comandos: .totals.comandos, receita_total: .totals.receita_total_centavos, comissoes: .totals.comissoes_centavos}'

echo ""
echo "✅ Teste concluído."