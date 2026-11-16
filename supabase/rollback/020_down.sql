-- Rollback da migration 020 (D-041): tira os lembretes por push. Os agendamentos e os links
-- pessoais ficam; os clientes que ligaram o push perdem os lembretes.
begin;
drop table if exists public.agendamento_lembretes;
drop table if exists public.agendamento_push;
drop function if exists public.lembretes_mesma_empresa();
alter table public.empresas drop column if exists lembretes_push_ativo;
commit;
