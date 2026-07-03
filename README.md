# HOPE OS V1.0.3 — PRE DEPLOY HOTFIX

Hotfix pré-deploy do patch **Polymorphic Command Items**.

## Parecer direto

```txt
Escopo: cirúrgico
Versão conceitual: V1.0.3 mantida
Objetivo: corrigir 3 pontos antes do Supabase real
Backend pós-hotfix: congelado para deploy real
```

## Correções aplicadas

```txt
1. servicosLiquidosCentavos agora contém somente serviços.
2. produtosLiquidosCentavos foi criado para produtos.
3. itensLiquidosCentavos soma serviços + produtos.
4. Produto abaixo do custo bloqueia com PRODUCT_BELOW_COST.
5. Desconto que joga produto abaixo do custo também bloqueia.
6. Produto sem profissionalId gera comissão zero.
7. Modelo de comissão de produto vem do produto, não do profissional.
8. RPC checkout_close mapeia as colunas corretas.
```

## Arquivos alterados

```txt
backend/src/engines/FinanceEngine.js
backend/src/engines/ProductEngine.js
backend/src/services/FinanceReadModel.js
backend/src/services/DashboardService.js
backend/tests/product-foundation-gate.test.js
backend/tests/schema-polymorphic-gate.test.js
supabase/migrations/001_init.sql
supabase/migrations/002_checkout_close_rpc.sql
supabase/migrations/003_lock_rpc_permissions.sql
docs/PRE_DEPLOY_HOTFIX.md
```

## Teste local

```bash
cd backend
npm run test:gate
```

Resultado esperado:

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

## Ordem real agora

```txt
1. Aplicar 001 → 002 → 003 em Supabase real limpo
2. Rodar seed
3. Rodar npm run test:gate
4. Testar anon key bloqueada na RPC checkout_close
5. Fechar comanda simples
6. Fechar comanda serviço + produto
7. Conferir baixa de estoque
8. Conferir produto_estoque_movimentos
9. Conferir comando_pagamentos
10. Conferir caixa_movimentos
```

## Regra de processo

```txt
Este é o último rewrite in-place permitido.
Após aplicar no Supabase real, 001/002/003 ficam congeladas.
Toda mudança futura vira migration 004+.
```

## Congelamento

```txt
Não criar V1.0.4.
Não criar pacotes.
Não criar assinaturas.
Não criar gift card.
Não criar relatório novo.
Não mexer no frontend checkout antes do gate real.
```
