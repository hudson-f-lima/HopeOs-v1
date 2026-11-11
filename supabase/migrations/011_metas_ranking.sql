-- KortexOS — Migration 011: metas mensais por profissional e ranking da equipe.
-- Autorizada pelo Platform Owner em 2026-11-10 (D-019: "gamificação e metas aprovado",
-- escopo "todos": metas individuais, ranking da gestão e ranking visível à equipe).
--
-- Princípios:
-- * Meta é configuração, não ledger: pode ser alterada e removida pela gestão. O
--   progresso NÃO é gravado; é sempre calculado do que o checkout e os estornos gravaram.
-- * Sem prêmio em dinheiro e sem efeito sobre comissão, agenda ou distribuição de clientes.
-- * Ranking visível à equipe é opção do salão, desligada por padrão.
-- Não altera 001–010 além de acrescentar uma coluna em empresas.
-- Rollback: supabase/rollback/011_down.sql.

begin;
set local client_min_messages = warning;

create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  profissional_id uuid not null references profissionais(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  tipo text not null check (tipo in ('faturamento', 'atendimentos', 'produtos')),
  -- faturamento (serviços) e produtos (vendidos pelo profissional): centavos; atendimentos: quantidade.
  valor_alvo int not null check (valor_alvo > 0),
  created_by uuid null references app_users(id),
  updated_by uuid null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_metas_prof_mes_tipo on metas (empresa_id, profissional_id, mes, tipo);

-- Profissional precisa ser da mesma empresa (o check não alcança outra tabela).
create or replace function public.metas_mesma_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.profissionais p where p.id = new.profissional_id and p.empresa_id = new.empresa_id) then
    raise exception 'profissional não pertence à empresa' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_metas_mesma_empresa on metas;
create trigger trg_metas_mesma_empresa before insert or update on metas
  for each row execute function public.metas_mesma_empresa();

alter table empresas add column if not exists ranking_visivel_equipe boolean not null default false;

revoke all on table public.metas from public, anon, authenticated;
alter table public.metas enable row level security;
grant select, insert, update, delete on table public.metas to service_role;
revoke all on function public.metas_mesma_empresa() from public, anon, authenticated;

commit;
