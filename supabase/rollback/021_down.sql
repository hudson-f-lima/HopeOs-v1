-- Rollback da migration 021 (D-042): tira os planos de assinatura. Só configuração; nenhum
-- cliente, cobrança ou uso depende destas tabelas nesta fase.
begin;
drop function if exists public.assinatura_plano_salvar(uuid, uuid, jsonb, jsonb, uuid[], uuid);
drop table if exists public.assinatura_plano_profissionais;
drop table if exists public.assinatura_plano_itens;
drop table if exists public.assinatura_planos;
drop function if exists public.assinatura_planos_mesma_empresa();
commit;
