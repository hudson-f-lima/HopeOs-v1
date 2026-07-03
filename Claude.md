# HOPE OS V1.0.3 — Contexto do projeto

## Stack
Backend Node.js + Express + Supabase (Postgres). Frontend é protótipo HTML isolado, não mexer ainda.

## Regras invioláveis
- Auditoria brutal sempre: classificar REAL / PARCIAL / MOCKADO / CRÍTICO
- 1 prioridade por vez, sem sofisticação prematura
- Nenhuma tabela nova sem migration versionada em supabase/migrations/
- service_role nunca exposto ao frontend
- Ledger financeiro é distribuído por design: comandos, comando_itens, 
  comando_pagamentos, comando_gorjetas, caixa_movimentos, produto_estoque_movimentos.
  NÃO existe (e não deve existir) uma tabela única "financial_ledger".

## Estado atual
- Migrations 001-004 rodadas no Supabase real
- migration 004 (supabase/migrations/004_service_role_table_grants.sql) formaliza
  o GRANT de tabela/sequence/function pro service_role e faz DROP TABLE financial_ledger
  (tabela confirmada removida do banco real em 2026-07-03)
- Seed OK (7 tabelas operacionais populadas)
- 38/38 testes locais passam (npm run test:gate)
- Checkout real validado fim-a-fim em 2026-07-03 contra o Supabase real
  (qosioymzswhkqkziocas): comanda só serviço e comanda serviço+produto fecharam
  via POST /checkout/close, com baixa de estoque, comando_pagamentos,
  caixa_movimentos e idempotencyKey todos confirmados via dashboard/finance
  read model. anon/publishable key confirmada bloqueada (401) na RPC checkout_close.

## Tarefa pendente
Nenhuma das 4 tarefas do último hotfix está pendente. Próximo gate: decidir
o que entra depois do V1.0.3 (frontend patch, pacotes, etc.) conforme a
regra de processo do blueprint (001/002/003 congeladas, mudanças novas = 005+).

## Gate de expansão
Nada de tabela nova, feature nova, ou Blueprint V4 antes desse checkout real fechar.
Esse checkout real já fechou (ver Estado atual) — próxima expansão pode ser discutida.