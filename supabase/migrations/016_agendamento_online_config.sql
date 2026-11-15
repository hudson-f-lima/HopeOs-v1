-- Migration 016 — configuração do agendamento online por salão (D-037, C1 da auditoria de
-- agendamento, docs/planning/AGENDAMENTO_PONTA_A_PONTA_AUDITORIA.md).
-- Autorizada pelo Platform Owner em 2026-11-15 ("1. Autorizado"). Aplica em produção só no merge.
--
-- Antes daqui o link público dependia de variáveis de ambiente do servidor (um mapa slug → empresa
-- e limites iguais para todos). Agora cada salão guarda na própria linha de `empresas`:
-- - o endereço do link (online_slug, único) e se ele está ligado (online_ativo, nasce DESLIGADO);
-- - antecedência mínima, janela de dias, prazo de cancelamento/remarcação e máximo de horários
--   futuros por número de WhatsApp;
-- - se a página mostra preço;
-- - o contato de privacidade (LGPD) que aparece no aviso, junto com razão social e CNPJ (008).
-- Ligar exige slug, razão social e contato de privacidade (o aviso precisa identificar quem trata
-- os dados). Nada aqui é lido pelo cliente direto: só o backend, com service_role.
begin;

alter table public.empresas add column if not exists online_slug text null;
alter table public.empresas add column if not exists online_ativo boolean not null default false;
alter table public.empresas add column if not exists online_antecedencia_min int not null default 120;
alter table public.empresas add column if not exists online_janela_dias int not null default 30;
alter table public.empresas add column if not exists online_cancelamento_prazo_min int not null default 120;
alter table public.empresas add column if not exists online_max_futuros int not null default 2;
alter table public.empresas add column if not exists online_mostrar_preco boolean not null default true;
alter table public.empresas add column if not exists privacidade_contato text null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_online_slug_formato') then
    alter table public.empresas add constraint empresas_online_slug_formato
      check (online_slug is null or online_slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_online_limites') then
    alter table public.empresas add constraint empresas_online_limites check (
      online_antecedencia_min between 0 and 10080
      and online_janela_dias between 1 and 180
      and online_cancelamento_prazo_min between 0 and 10080
      and online_max_futuros between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_privacidade_contato_tamanho') then
    alter table public.empresas add constraint empresas_privacidade_contato_tamanho
      check (privacidade_contato is null or char_length(btrim(privacidade_contato)) between 3 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_online_ativo_requisitos') then
    alter table public.empresas add constraint empresas_online_ativo_requisitos check (
      not online_ativo or (
        online_slug is not null
        and coalesce(char_length(btrim(razao_social)), 0) > 0
        and privacidade_contato is not null));
  end if;
end $$;

create unique index if not exists ux_empresas_online_slug on public.empresas (online_slug) where online_slug is not null;

commit;
