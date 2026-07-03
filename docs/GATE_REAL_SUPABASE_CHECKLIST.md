# Gate Real Supabase — HOPE OS V1.0.3

## Antes de qualquer frontend patch

```txt
[ ] Criar projeto Supabase real
[ ] Aplicar 001_init.sql
[ ] Aplicar 002_checkout_close_rpc.sql
[ ] Aplicar 003_lock_rpc_permissions.sql
[ ] Configurar backend/.env
[ ] Rodar seed
[ ] Rodar npm run test:gate
[ ] Testar RPC checkout_close com anon key e confirmar bloqueio
[ ] Testar checkout_close pelo backend com service_role
[ ] Fechar comanda só serviço
[ ] Fechar comanda serviço + produto
[ ] Conferir comando_itens com tipo servico/produto
[ ] Conferir produtos_liquidos_centavos e itens_liquidos_centavos
[ ] Conferir baixa de estoque
[ ] Conferir produto_estoque_movimentos
[ ] Conferir comando_pagamentos
[ ] Conferir caixa_movimentos
```

## Resultado aceito para anon key

```txt
401, 403 ou permission denied
```

## Resultado aceito pelo backend

```txt
checkout_close executa e retorna comandoId
```

## Após passar

```txt
Frontend patch em modo leitura primeiro.
Checkout por último.
```
