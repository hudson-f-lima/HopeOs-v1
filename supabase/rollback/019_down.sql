-- Rollback da migration 019 (D-040): tira a reserva de várias etapas e o limite de espera. Os
-- agendamentos já criados ficam (continuam ligados por grupo_id, coluna da 001).
begin;
drop function if exists public.atendimento_criar(uuid, jsonb, uuid);
drop index if exists public.idx_agendamentos_grupo;
alter table public.empresas drop constraint if exists empresas_atendimento_espera_faixa;
alter table public.empresas drop column if exists atendimento_espera_max_min;
commit;
