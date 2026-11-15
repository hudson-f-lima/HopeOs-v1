-- Rollback da migration 016 (D-037): tira a configuração do agendamento online por salão.
-- O link público volta a depender só do mapa PUBLIC_BOOKING_LINKS do servidor.
begin;
drop index if exists public.ux_empresas_online_slug;
alter table public.empresas drop constraint if exists empresas_online_ativo_requisitos;
alter table public.empresas drop constraint if exists empresas_privacidade_contato_tamanho;
alter table public.empresas drop constraint if exists empresas_online_limites;
alter table public.empresas drop constraint if exists empresas_online_slug_formato;
alter table public.empresas
  drop column if exists privacidade_contato,
  drop column if exists online_mostrar_preco,
  drop column if exists online_max_futuros,
  drop column if exists online_cancelamento_prazo_min,
  drop column if exists online_janela_dias,
  drop column if exists online_antecedencia_min,
  drop column if exists online_ativo,
  drop column if exists online_slug;
commit;
