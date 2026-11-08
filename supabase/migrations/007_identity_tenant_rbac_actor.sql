-- KortexOS — Migration 007: identidade, tenant, RBAC, autoria e agenda atômica.
-- Autorizada pelo Platform Owner em 2026-10-16 (D-007). Implementa ADR-005.
--
-- Princípios:
-- * Aditiva: nenhuma coluna existente muda de tipo; colunas novas são nullable.
-- * Histórico pré-007 fica com autoria NULL (desconhecida, nunca fabricada).
-- * RPCs de 002/003/006 continuam intactas; autoria entra por wrappers + trigger.
-- * Tabelas de public deixam de ser acessíveis por anon/authenticated (a PWA passa
--   a ter a anon key para login). O backend usa service_role (ignora RLS).
-- Rollback: supabase/rollback/007_down.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Usuários da aplicação (espelho estável de auth.users)
-- ---------------------------------------------------------------------------
create table if not exists app_users (
  id uuid primary key,                          -- = auth.users.id, sem FK: sobrevive à remoção no provedor
  email text,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_app_users_email on app_users (lower(email)) where email is not null;

create or replace function public.app_users_sync_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, ''), '@', 1), 'Usuário')
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_users_sync_from_auth on auth.users;
create trigger trg_app_users_sync_from_auth
  after insert or update of email on auth.users
  for each row execute function public.app_users_sync_from_auth();

-- Backfill de usuários que já existam no provedor.
insert into app_users (id, email, nome)
select u.id, u.email,
       coalesce(nullif(u.raw_user_meta_data->>'nome', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(coalesce(u.email, ''), '@', 1), 'Usuário')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Membership, papéis e unidades
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'membership_role') then
    create type membership_role as enum ('admin', 'gestor', 'recepcao', 'profissional');
  end if;
end $$;

create table if not exists empresa_memberships (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null references app_users(id),
  role membership_role not null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  -- Vínculo opcional ao cadastro de profissional: escopo "Próprio" da matriz RBAC.
  profissional_id uuid null references profissionais(id),
  created_by uuid null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);
create index if not exists ix_memberships_user on empresa_memberships (user_id);
create index if not exists ix_memberships_empresa_status on empresa_memberships (empresa_id, status);

create table if not exists unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_unidades_empresa on unidades (empresa_id);

-- Uma unidade padrão por empresa existente (empresas single-unit não quebram).
insert into unidades (empresa_id, nome)
select e.id, 'Unidade principal'
from empresas e
where not exists (select 1 from unidades u where u.empresa_id = e.id);

create table if not exists membership_units (
  membership_id uuid not null references empresa_memberships(id) on delete cascade,
  unit_id uuid not null references unidades(id) on delete cascade,
  primary key (membership_id, unit_id)
);
create index if not exists ix_membership_units_unit on membership_units (unit_id);

-- A unidade precisa ser da mesma empresa da membership.
create or replace function public.membership_units_same_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from empresa_memberships m join unidades u on u.empresa_id = m.empresa_id
    where m.id = new.membership_id and u.id = new.unit_id
  ) then
    raise exception 'unidade de outra empresa' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_membership_units_same_empresa on membership_units;
create trigger trg_membership_units_same_empresa
  before insert or update on membership_units
  for each row execute function public.membership_units_same_empresa();

-- ---------------------------------------------------------------------------
-- 3. Principal de integração (servidor-a-servidor), separado de app_users
-- ---------------------------------------------------------------------------
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_by uuid null references app_users(id),
  created_at timestamptz not null default now()
);
create index if not exists ix_integrations_empresa on integrations (empresa_id);

create table if not exists integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  secret_hash text not null,                     -- scrypt; o segredo em texto plano nunca é persistido
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists ix_integration_credentials_integration on integration_credentials (integration_id);

create table if not exists integration_scopes (
  integration_id uuid not null references integrations(id) on delete cascade,
  scope text not null check (scope <> '*' and scope ~ '^[a-z_]+(:[a-z0-9_-]+)+$'),
  primary key (integration_id, scope)
);

create table if not exists integration_audit_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  credential_id uuid null references integration_credentials(id) on delete set null,
  evento text not null,                          -- request | credential_created | credential_revoked | scopes_changed | ...
  rota text,
  status_code int,
  actor_id uuid null references app_users(id),   -- admin humano que fez a ação administrativa, quando houver
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_integration_audit_integration_time on integration_audit_events (integration_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Autoria
-- ---------------------------------------------------------------------------
-- 4a. Eventos imutáveis: actor_id (humano) OU actor_integration_id (máquina).
alter table comandos add column if not exists actor_id uuid null references app_users(id);
alter table comandos add column if not exists actor_integration_id uuid null references integrations(id);
alter table produto_estoque_movimentos add column if not exists actor_id uuid null references app_users(id);
alter table produto_estoque_movimentos add column if not exists actor_integration_id uuid null references integrations(id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comandos_um_autor') then
    alter table comandos add constraint comandos_um_autor check (actor_id is null or actor_integration_id is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'estoque_mov_um_autor') then
    alter table produto_estoque_movimentos add constraint estoque_mov_um_autor check (actor_id is null or actor_integration_id is null);
  end if;
end $$;

-- 4b. Estado mutável.
alter table agendamentos add column if not exists created_by uuid null references app_users(id);
alter table agendamentos add column if not exists updated_by uuid null references app_users(id);
alter table agendamentos add column if not exists cancelled_by uuid null references app_users(id);
alter table clientes add column if not exists created_by uuid null references app_users(id);
alter table clientes add column if not exists updated_by uuid null references app_users(id);

-- 4c. Autor da transação corrente, definido pelos wrappers abaixo e lido pelos triggers.
create or replace function public.app_set_autoria(p_actor_id uuid, p_integration_id uuid, p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor_id is not null and p_integration_id is not null then
    raise exception 'autoria ambígua: usuário e integração' using errcode = 'P0001';
  end if;
  if p_actor_id is not null and not exists (
    select 1 from app_users u join empresa_memberships m on m.user_id = u.id
    where u.id = p_actor_id and u.ativo and m.empresa_id = p_empresa_id and m.status = 'ativo'
  ) then
    raise exception 'ator sem membership ativa na empresa' using errcode = 'P0001';
  end if;
  if p_integration_id is not null and not exists (
    select 1 from integrations i where i.id = p_integration_id and i.empresa_id = p_empresa_id and i.status = 'ativo'
  ) then
    raise exception 'integração inativa ou de outra empresa' using errcode = 'P0001';
  end if;
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.actor_integration_id', coalesce(p_integration_id::text, ''), true);
end;
$$;

create or replace function public.autoria_evento_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actor_id := coalesce(new.actor_id, nullif(current_setting('app.actor_id', true), '')::uuid);
  new.actor_integration_id := coalesce(new.actor_integration_id, nullif(current_setting('app.actor_integration_id', true), '')::uuid);
  return new;
end;
$$;

create or replace function public.autoria_evento_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.actor_id is distinct from old.actor_id or new.actor_integration_id is distinct from old.actor_integration_id then
    raise exception 'autoria de evento é imutável' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comandos_autoria_insert on comandos;
create trigger trg_comandos_autoria_insert before insert on comandos
  for each row execute function public.autoria_evento_insert();
drop trigger if exists trg_comandos_autoria_imutavel on comandos;
create trigger trg_comandos_autoria_imutavel before update on comandos
  for each row execute function public.autoria_evento_imutavel();
drop trigger if exists trg_estoque_mov_autoria_insert on produto_estoque_movimentos;
create trigger trg_estoque_mov_autoria_insert before insert on produto_estoque_movimentos
  for each row execute function public.autoria_evento_insert();
drop trigger if exists trg_estoque_mov_autoria_imutavel on produto_estoque_movimentos;
create trigger trg_estoque_mov_autoria_imutavel before update on produto_estoque_movimentos
  for each row execute function public.autoria_evento_imutavel();

-- 4d. Wrappers: mesma assinatura das RPCs originais + autor.
create or replace function public.checkout_close_autoria(
  p_empresa_id uuid, p_payload jsonb, p_preview jsonb, p_actor_id uuid default null, p_integration_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_set_autoria(p_actor_id, p_integration_id, p_empresa_id);
  return public.checkout_close(p_empresa_id, p_payload, p_preview);
end;
$$;

create or replace function public.produto_estoque_ajuste_autoria(
  p_empresa_id uuid, p_produto_id uuid, p_tipo text, p_quantidade int,
  p_custo_unitario_centavos int default 0, p_motivo text default null,
  p_actor_id uuid default null, p_integration_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_set_autoria(p_actor_id, p_integration_id, p_empresa_id);
  return public.produto_estoque_ajuste(p_empresa_id, p_produto_id, p_tipo, p_quantidade, p_custo_unitario_centavos, p_motivo);
end;
$$;

create or replace function public.produto_criar_com_estoque_autoria(
  p_empresa_id uuid, p_produto jsonb, p_estoque_inicial int default 0, p_motivo text default null,
  p_actor_id uuid default null, p_integration_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_set_autoria(p_actor_id, p_integration_id, p_empresa_id);
  return public.produto_criar_com_estoque(p_empresa_id, p_produto, p_estoque_inicial, p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Agenda: criação atômica (fecha a corrida de double-booking)
-- ---------------------------------------------------------------------------
-- Lock por (empresa, profissional, data) serializa checagem + insert. O encaixe
-- forçado (p_permitir_conflito) continua possível, por isso não é exclusion constraint.
create or replace function public.agendamento_criar(
  p_empresa_id uuid,
  p_agendamento jsonb,
  p_permitir_conflito boolean default false,
  p_ignorar_id uuid default null,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof uuid := nullif(p_agendamento->>'profissional_id', '')::uuid;
  v_serv uuid := nullif(p_agendamento->>'servico_id', '')::uuid;
  v_cli uuid := nullif(p_agendamento->>'cliente_id', '')::uuid;
  v_data date := (p_agendamento->>'data')::date;
  v_hora time := (p_agendamento->>'horario')::time;
  v_dur int := coalesce(nullif(p_agendamento->>'duracao_min', '')::int, 30);
  v_ini int;
  v_fim int;
  v_conflitos jsonb;
  v_row agendamentos%rowtype;
begin
  if p_empresa_id is null then raise exception 'empresa_id obrigatorio' using errcode = 'P0001'; end if;
  if v_prof is null or v_serv is null or v_data is null or v_hora is null then
    raise exception 'profissional, servico, data e horario obrigatorios' using errcode = 'P0001';
  end if;
  if v_dur <= 0 then raise exception 'duracao invalida' using errcode = 'P0001'; end if;
  if not exists (select 1 from profissionais where id = v_prof and empresa_id = p_empresa_id) then
    raise exception 'profissional nao encontrado: %', v_prof using errcode = 'P0001';
  end if;
  if not exists (select 1 from servicos where id = v_serv and empresa_id = p_empresa_id) then
    raise exception 'servico nao encontrado: %', v_serv using errcode = 'P0001';
  end if;
  if v_cli is not null and not exists (select 1 from clientes where id = v_cli and empresa_id = p_empresa_id) then
    raise exception 'cliente nao encontrado: %', v_cli using errcode = 'P0001';
  end if;
  if p_created_by is not null and not exists (
    select 1 from empresa_memberships where user_id = p_created_by and empresa_id = p_empresa_id and status = 'ativo'
  ) then
    raise exception 'ator sem membership ativa na empresa' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('agenda:' || p_empresa_id || ':' || v_prof || ':' || v_data, 0));

  v_ini := extract(hour from v_hora)::int * 60 + extract(minute from v_hora)::int;
  v_fim := v_ini + v_dur;

  if not p_permitir_conflito then
    select jsonb_agg(jsonb_build_object('id', a.id, 'horario', a.horario, 'duracaoMin', a.duracao_min, 'status', a.status))
      into v_conflitos
    from agendamentos a
    where a.empresa_id = p_empresa_id
      and a.profissional_id = v_prof
      and a.data = v_data
      and a.status not in ('cancelado', 'no_show', 'reagendado')
      and (p_ignorar_id is null or a.id <> p_ignorar_id)
      and (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int) < v_fim
      and v_ini < (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int + a.duracao_min);
    if v_conflitos is not null then
      raise exception 'SCHEDULE_CONFLICT' using errcode = 'HS409', detail = v_conflitos::text;
    end if;
  end if;

  insert into agendamentos (empresa_id, cliente_id, profissional_id, servico_id, data, horario, duracao_min, valor_centavos, status, created_by)
  values (
    p_empresa_id, v_cli, v_prof, v_serv, v_data, v_hora, v_dur,
    coalesce(nullif(p_agendamento->>'valor_centavos', '')::int, 0),
    coalesce(nullif(p_agendamento->>'status', ''), 'agendado'),
    p_created_by
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissões
-- ---------------------------------------------------------------------------
-- Funções: só o backend (service_role) executa.
do $$
declare f text;
begin
  foreach f in array array[
    'public.app_users_sync_from_auth()',
    'public.membership_units_same_empresa()',
    'public.app_set_autoria(uuid, uuid, uuid)',
    'public.autoria_evento_insert()',
    'public.autoria_evento_imutavel()',
    'public.checkout_close_autoria(uuid, jsonb, jsonb, uuid, uuid)',
    'public.produto_estoque_ajuste_autoria(uuid, uuid, text, int, int, text, uuid, uuid)',
    'public.produto_criar_com_estoque_autoria(uuid, jsonb, int, text, uuid, uuid)',
    'public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Tabelas: a anon key passa a ser pública (login da PWA). Nenhuma tabela de
-- negócio pode ser lida/escrita por anon/authenticated via PostgREST.
-- RLS sem policy = nega tudo para quem não é service_role (que tem BYPASSRLS).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t.tablename);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;
