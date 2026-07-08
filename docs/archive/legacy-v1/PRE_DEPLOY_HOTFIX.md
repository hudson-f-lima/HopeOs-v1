# HOPE OS V1.0.3 — PRE DEPLOY HOTFIX

## Objetivo

Aplicar 3 correções obrigatórias antes do primeiro deploy real em Supabase.

## Fix 1 — separação contábil

Antes:

```txt
servicosLiquidosCentavos = serviços + produtos
```

Depois:

```txt
servicosLiquidosCentavos = somente serviços
produtosLiquidosCentavos = somente produtos
itensLiquidosCentavos = serviços + produtos
```

Invariante:

```txt
servicosLiquidosCentavos + produtosLiquidosCentavos = itensLiquidosCentavos
```

## Fix 2 — produto abaixo do custo

Regra V1:

```txt
Produto vendido abaixo do custo é bloqueado.
```

Erro:

```txt
PRODUCT_BELOW_COST
```

Casos bloqueados:

```txt
preço de venda cadastrado abaixo do custo
desconto aplicado que joga o produto abaixo do custo
```

## Fix 3 — produto sem vendedor

Regra:

```txt
produto sem profissionalId = comissão zero
produto com profissionalId = comissão do produto
```

Invariante:

```txt
Sem vendedor, sem comissão.
```

## Regra documentada

```txt
Modelo e percentual de comissão de produto vêm do produto, não do profissional.
```

## Arquivos alterados

```txt
FinanceEngine.js
ProductEngine.js
FinanceReadModel.js
DashboardService.js
product-foundation-gate.test.js
schema-polymorphic-gate.test.js
001_init.sql
002_checkout_close_rpc.sql
003_lock_rpc_permissions.sql
```

## Gate local

```bash
npm run test:gate
```

Resultado esperado:

```txt
Finance Gate V1: 10/10
Product Foundation Gate: 8/8
Schema Polymorphic Gate: 12/12
RPC Permission Gate: 8/8
```

Total:

```txt
38/38 verdes
```
