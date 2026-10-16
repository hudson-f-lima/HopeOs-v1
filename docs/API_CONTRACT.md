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

## Agenda — sugestão de horários

`GET /api/agenda/slots?data=YYYY-MM-DD&profissionalId=uuid&servicoId=uuid[&duracaoMin=5..480]` — somente leitura; tenant vem de `req.auth` (nunca da query).

```json
{
  "ok": true,
  "data": {
    "data": "2026-10-19",
    "duracaoMin": 45,
    "passoMin": 30,
    "minUtilMin": 30,
    "janela": { "inicio": "09:00", "fim": "13:00" },
    "profissionalId": "uuid",
    "servicoId": "uuid",
    "slots": [
      { "horario": "09:00", "fim": "09:45", "ancora": true, "recomendado": true,
        "buracoAntesMin": 0, "buracoDepoisMin": 15, "desperdicioMin": 15 }
    ]
  }
}
```

- `duracaoMin`: override do profissional (`overrides[servicoId].duracao_min`) > `servicos.duracao_min` > 30 — mesma regra do `POST /agenda`.
- `janela: null` + `slots: []`: sem expediente configurado no dia (falha fechado; não há expediente padrão inventado).
- `ancora`: encosta em abertura, fechamento, almoço ou outro atendimento ativo. `recomendado`: âncora com a menor sobra inutilizável (sobra menor que o menor serviço vendável) dentro da janela livre.
- Data passada → `slots: []`; hoje → só a partir do horário atual em `APP_TIMEZONE`.
- A sugestão não reserva: `POST /agenda` revalida conflito na gravação.
- Erros: 422 `DATE_REQUIRED`, `PROFESSIONAL_REQUIRED`, `SERVICE_ID_REQUIRED`, `INVALID_UUID`, `INVALID_DURATION`; 422 `*_NOT_FOUND`/`*_INACTIVE`; 401 sem token.
