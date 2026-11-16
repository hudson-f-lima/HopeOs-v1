-- Rollback da migration 018 (D-039): tira a recorrência. Os agendamentos das séries ficam como
-- agendamentos comuns (perdem só a marcação de série).
begin;
drop trigger if exists trg_agendamentos_serie_mesma_empresa on public.agendamentos;
drop index if exists public.idx_agendamentos_serie;
alter table public.agendamentos drop constraint if exists agendamentos_serie_seq_faixa;
alter table public.agendamentos drop column if exists serie_seq, drop column if exists serie_id;
drop table if exists public.agendamento_series;
drop function if exists public.agendamento_series_mesma_empresa();
commit;
