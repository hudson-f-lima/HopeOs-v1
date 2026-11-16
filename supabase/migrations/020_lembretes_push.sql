-- Migration 020 — lembretes por push e canais automáticos (D-041, C5 da auditoria de agendamento).
-- Autorizada pelo Platform Owner em 2026-11-16 ("C5: autorizado"; D-038 já previa a migration da C5).
-- Aplica em produção só no merge.
--
-- 1. agendamento_push: assinatura de push do aparelho do cliente, presa ao link pessoal (017). O
--    cliente liga no próprio aparelho; o link guarda o vínculo, então a remarcação (que move o
--    acesso para o novo horário) leva o lembrete junto. Revogar o link revoga o push.
-- 2. agendamento_lembretes: um registro por (agendamento, tipo, canal). A UNIQUE é a trava contra
--    envio duplicado: quem inserir primeiro envia (com mais de uma instância do servidor, só uma
--    envia). Prefere-se perder um lembrete a mandar duas vezes.
-- 3. empresas.lembretes_push_ativo: o salão pode desligar os lembretes por push.
begin;

alter table public.empresas add column if not exists lembretes_push_ativo boolean not null default true;

create table if not exists public.agendamento_push (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  acesso_id uuid not null references public.agendamento_acessos(id) on delete cascade,
  endpoint_hash text not null unique check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  assinatura jsonb not null check (jsonb_typeof(assinatura) = 'object' and char_length(assinatura::text) <= 4096),
  falhas int not null default 0 check (falhas between 0 and 100),
  revogado_em timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_agendamento_push_acesso on public.agendamento_push (acesso_id) where revogado_em is null;

create table if not exists public.agendamento_lembretes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  tipo text not null check (tipo in ('d1', 'h2')),
  canal text not null check (canal in ('push', 'whatsapp', 'sms')),
  situacao text not null default 'reservado' check (situacao in ('reservado', 'enviado', 'falhou', 'sem_destino')),
  detalhe text null check (detalhe is null or char_length(detalhe) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ux_agendamento_lembretes unique (agendamento_id, tipo, canal)
);
create index if not exists idx_agendamento_lembretes_empresa on public.agendamento_lembretes (empresa_id, created_at);

-- Empresa do push/lembrete = empresa do acesso/agendamento (nada cruza tenant).
create or replace function public.lembretes_mesma_empresa() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'agendamento_push' then
    if not exists (select 1 from public.agendamento_acessos a where a.id = new.acesso_id and a.empresa_id = new.empresa_id) then
      raise exception 'agendamento_push: acesso de outra empresa' using errcode = '23514';
    end if;
  elsif not exists (select 1 from public.agendamentos a where a.id = new.agendamento_id and a.empresa_id = new.empresa_id) then
    raise exception 'agendamento_lembretes: agendamento de outra empresa' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_agendamento_push_mesma_empresa on public.agendamento_push;
create trigger trg_agendamento_push_mesma_empresa before insert or update of acesso_id, empresa_id on public.agendamento_push
  for each row execute function public.lembretes_mesma_empresa();
drop trigger if exists trg_agendamento_lembretes_mesma_empresa on public.agendamento_lembretes;
create trigger trg_agendamento_lembretes_mesma_empresa before insert or update of agendamento_id, empresa_id on public.agendamento_lembretes
  for each row execute function public.lembretes_mesma_empresa();

revoke all on table public.agendamento_push, public.agendamento_lembretes from public, anon, authenticated;
alter table public.agendamento_push enable row level security;
alter table public.agendamento_lembretes enable row level security;
grant select, insert, update on table public.agendamento_push, public.agendamento_lembretes to service_role;
revoke delete, truncate on table public.agendamento_push, public.agendamento_lembretes from service_role;
revoke all on function public.lembretes_mesma_empresa() from public, anon, authenticated;

commit;
