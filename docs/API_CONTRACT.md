# HOPE OS V1.0.3 — API Contract

## Checkout preview/close

Payload permitido:

```json
{
  "idempotencyKey": "checkout-001",
  "clienteId": "uuid",
  "data": "2026-07-01",
  "hora": "14:30",
  "itens": [
    { "tipo": "servico", "servicoId": "uuid", "profissionalId": "uuid" },
    { "tipo": "produto", "produtoId": "uuid", "quantidade": 1, "profissionalId": "uuid-opcional" }
  ],
  "payments": [
    { "formaCode": "dinheiro", "valorCentavos": 9500 }
  ],
  "descontoCentavos": 0,
  "gorjetaCentavos": 0
}
```

## Payload proibido

```txt
formasPagamento[]
valorCentavos/precoUnitarioCentavos no item
custoUnitarioCentavos no item
lucro/margem no item
comissaoPct no item
modeloComissao no item
taxaPct/taxaFixa no payment
receita/comissão/gorjeta calculada
```

## Totais de retorno

```txt
servicosLiquidosCentavos = somente serviços
produtosLiquidosCentavos = somente produtos
itensLiquidosCentavos = serviços + produtos
```

## Erros relevantes

```txt
MISSING_ITEM_TYPE
INVALID_ITEM_TYPE
FRONTEND_FINANCIAL_INPUT_FORBIDDEN
PRODUCT_OUT_OF_STOCK
PRODUCT_BELOW_COST
PAYMENT_TOTAL_MISMATCH
```
