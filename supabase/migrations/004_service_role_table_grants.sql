-- HOPE OS V1.0.3 — Service role table grants + limpeza de financial_ledger
-- Execute depois da 001_init.sql, 002_checkout_close_rpc.sql e 003_lock_rpc_permissions.sql.
--
-- GAP fechado por esta migration:
-- A migration 003 travou a execução da RPC checkout_close para service_role,
-- mas nunca formalizou o GRANT de tabela (SELECT/INSERT/UPDATE/DELETE) para
-- service_role. Isso foi corrigido ad-hoc direto no SQL Editor do Supabase;
-- esta migration versiona esse GRANT para que um banco novo, recriado a partir
-- só dos arquivos em supabase/migrations/, fique no mesmo estado.
--
-- Também remove a tabela financial_ledger: por design este projeto usa ledger
-- financeiro distribuído (comandos, comando_itens, comando_pagamentos,
-- comando_gorjetas, caixa_movimentos, produto_estoque_movimentos) e não deve
-- existir uma tabela única "financial_ledger" (ver Claude.md.txt, regras invioláveis).

drop table if exists public.financial_ledger cascade;

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
