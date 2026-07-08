# PATCH 1.0.3 — Polymorphic Command Items

## Objetivo

Evitar retrofit futuro ao tratar produto como item nativo do checkout desde a fundação.

## Correções aplicadas

```txt
- comando_itens polimórfico: tipo servico | produto
- produtos no schema inicial
- produto_estoque_movimentos no schema inicial
- ProductEngine
- InventoryEngine
- CheckoutInputResolver com tipo obrigatório
- FinanceEngine com subtotal de serviços, produtos, custo e margem
- RPC checkout_close com baixa de estoque transacional
- seed de produtos
- testes de produto e schema
```

## Regra principal

```txt
Produto é item de primeira classe.
Frontend envia produtoId + quantidade.
Backend busca preço, custo, estoque e comissão.
```

## Testes

```bash
npm run test:gate
```

Inclui:

```txt
Finance Gate V1: 10 casos
Product Foundation Gate: 5 casos
Schema Polymorphic Gate: 7 checks
RPC Permission Gate: 8 checks
```

## Status

```txt
Aprovado localmente.
Pendente de validação em Supabase real.
```
