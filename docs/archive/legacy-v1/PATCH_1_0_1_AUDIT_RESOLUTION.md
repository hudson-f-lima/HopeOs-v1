# Patch 1.0.1 — Audit Resolution

## Correções aplicadas

```txt
- Insumos financeiros agora vêm do banco, não do frontend.
- Validador bloqueia payload com valores financeiros proibidos.
- CheckoutInputResolver criado.
- FinanceEngine só aceita itens com _trustedSource = server_catalog.
- Rotas removem fallback payload.formasPagamento.
- close usa RPC transacional checkout_close.
- caixa_movimentos passa a ser gravado no close.
- Erro padronizado em error: { code, message, details }.
- Blueprint corrigido.
- 10 testes financeiros criados e verdes.
```

## Gate

```txt
Finance Gate V1: 10/10 testes verdes.
```

## Ainda não feito

```txt
- Agenda backend completa.
- Auth/RLS por usuário.
- Frontend conectado ao checkout.
```
