# HOPE OS V1.0.3 — Validation Test Plan

## Comando

```bash
cd backend
npm run test:gate
```

## Resultado esperado

```txt
Finance Gate V1: 10/10 testes verdes
Product Foundation Gate: 8/8 testes verdes
Schema Polymorphic Gate: 12/12 checks verdes
RPC Permission Gate: 8/8 checks verdes
```

Total:

```txt
38/38 checks verdes
```

## Novos asserts do PRE DEPLOY HOTFIX

```txt
- serviços líquidos não incluem produtos
- produtos líquidos não entram como serviços
- itens líquidos = serviços + produtos
- produto cadastrado abaixo do custo bloqueia PRODUCT_BELOW_COST
- desconto que joga produto abaixo do custo bloqueia PRODUCT_BELOW_COST
- produto sem vendedor tem comissão zero
- RPC mapeia produtos_liquidos_centavos
- RPC mapeia itens_liquidos_centavos
```
