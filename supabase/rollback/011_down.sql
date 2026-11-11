-- Rollback da migration 011 (metas e ranking, D-019). Meta é configuração, não
-- histórico financeiro: o rollback apaga as metas gravadas.
begin;
drop table if exists metas;
drop function if exists public.metas_mesma_empresa();
alter table empresas drop column if exists ranking_visivel_equipe;
commit;
