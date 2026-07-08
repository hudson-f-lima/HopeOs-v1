# PATCH 1.0.2 — RPC Permission Lock

## Problema

A RPC `checkout_close` era `SECURITY DEFINER` e não tinha `REVOKE/GRANT` explícito. Em Supabase, isso pode permitir chamada direta via `/rest/v1/rpc/checkout_close` por `anon` ou `authenticated`, atravessando o backend.

## Correção

```sql
revoke all on function public.checkout_close(uuid, jsonb, jsonb) from public;
revoke all on function public.checkout_close(uuid, jsonb, jsonb) from anon;
revoke all on function public.checkout_close(uuid, jsonb, jsonb) from authenticated;
grant execute on function public.checkout_close(uuid, jsonb, jsonb) to service_role;
```

## Regra permanente

```txt
Toda função SECURITY DEFINER nasce trancada.
Sem exceção.
```

## Ajuste adicional

A migration 003 redefine `checkout_close` para capturar `unique_violation` no insert de `comandos`. Se a duplicidade vier da `idempotencyKey` ou do `id`, a RPC retorna resposta idempotente em vez de erro cru.

## Testes

```bash
npm run test:gate
```

Inclui:

```txt
- 10 testes Finance Gate V1
- 8 checks locais da migration 003
```

## Teste manual real

No Supabase real, chamada direta com anon key deve falhar.

```txt
/rest/v1/rpc/checkout_close com anon key = bloqueado
backend com service_role = permitido
```
