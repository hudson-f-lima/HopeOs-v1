-- Migration 017 — link pessoal do agendamento (D-038, C2 da auditoria de agendamento).
-- Autorizada pelo Platform Owner em 2026-11-16 ("Autorizado ... C2, migrações").
-- Aplica em produção só no merge.
--
-- O cliente recebe um link com um código aleatório (32 bytes) para ver, confirmar, cancelar ou
-- remarcar o próprio horário, sem login. O banco guarda só o SHA-256 do código: quem lê a tabela
-- não consegue montar o link. Um acesso aponta para um agendamento; ao remarcar, o mesmo acesso
-- passa a apontar para o novo horário (o link do cliente não muda). Gerar um link novo pela
-- recepção revoga os anteriores do mesmo agendamento.
--
-- Nada aqui é lido pelo cliente direto: só o backend, com service_role.
begin;

create table if not exists public.agendamento_acessos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expira_em timestamptz not null,
  revogado_em timestamptz null,
  remarcacoes int not null default 0 check (remarcacoes between 0 and 20),
  origem text not null default 'link_publico' check (origem in ('link_publico', 'recepcao')),
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_agendamento_acessos_agendamento on public.agendamento_acessos (agendamento_id);

-- O acesso e o agendamento são sempre da mesma empresa (nenhum link cruza tenant).
create or replace function public.agendamento_acessos_mesma_empresa() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (select 1 from public.agendamentos a where a.id = new.agendamento_id and a.empresa_id = new.empresa_id) then
    raise exception 'agendamento_acessos: agendamento de outra empresa' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_agendamento_acessos_mesma_empresa on public.agendamento_acessos;
create trigger trg_agendamento_acessos_mesma_empresa
  before insert or update of agendamento_id, empresa_id on public.agendamento_acessos
  for each row execute function public.agendamento_acessos_mesma_empresa();

revoke all on table public.agendamento_acessos from public, anon, authenticated;
alter table public.agendamento_acessos enable row level security;
grant select, insert, update on table public.agendamento_acessos to service_role;
revoke delete, truncate on table public.agendamento_acessos from service_role;
revoke all on function public.agendamento_acessos_mesma_empresa() from public, anon, authenticated;

commit;
