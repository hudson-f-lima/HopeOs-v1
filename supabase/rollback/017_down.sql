-- Rollback da migration 017 (D-038): apaga os links pessoais. Os agendamentos ficam; os clientes
-- perdem o link (a recepção pode gerar outro depois de reaplicar a migration).
begin;
drop table if exists public.agendamento_acessos;
drop function if exists public.agendamento_acessos_mesma_empresa();
commit;
