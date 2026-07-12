-- DRAFT ONLY
-- DO NOT EXECUTE
-- NOT APPROVED FOR PRODUCTION
--
-- Companion SQL for docs/migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md.
-- This file is a technical draft translating ADR-005 into schema. It is not
-- part of supabase/migrations/, is not numbered as an applied migration, and
-- must not be run against any database (local, staging, or production)
-- without explicit Platform Owner authorization, security review, and the
-- execution order defined in the companion Markdown document.
--
-- Nothing in 001_init.sql .. 006_produto_estoque_ajuste_rpc.sql is touched here.
--
-- Revision note (round 2): a second Red Team pass found that round 1's own
-- idempotency fix was itself incomplete — DROP CONSTRAINT IF EXISTS on the
-- four UNIQUE constraints below fails on a second run once round-1's own
-- composite FKs (STEP 7) start depending on them (Postgres refuses to drop a
-- unique/PK constraint that a foreign key references, without CASCADE).
-- Fixed here by never dropping those four constraints — they are created
-- through a guarded DO block that checks pg_constraint first and is a no-op
-- if already present, since their definition never changes between runs.
-- The "max 2 active credentials" trigger was also moved from AFTER to
-- BEFORE INSERT OR UPDATE, per Red Team recommendation, to avoid any
-- ambiguity in lock ordering against the FK-implied lock on the parent
-- integrations row. This remains a DESIGN-LEVEL fix — it has not been
-- exercised against two real concurrent connections yet (see TESTE 2b in
-- the companion tests file); do not upgrade its status beyond "corrigido no
-- desenho, não validado empiricamente" until that test actually runs.
--
-- Revision note (round 1): fixed a race condition in the original "max 2
-- active credentials" check (counted rows in an AFTER trigger with no lock
-- at all); added a trigger making integration_audit_events genuinely
-- append-only at the DB level (round 0 only claimed this in a comment,
-- while 004_service_role_table_grants.sql already grants UPDATE/DELETE to
-- service_role by default); added composite FKs that make cross-tenant
-- authorship structurally impossible, closing a gap round 0 only
-- documented but did not fix.

-- =====================================================================
-- STEP 2 — new tables (app_users -> empresa_memberships -> ... -> integration_audit_events)
-- =====================================================================

-- =====================================================================
-- Nota: a tabela app_users e o trigger auth.users -> app_users foram
-- extraidos para a Fase 1 (fase1_identidade_minima_DRAFT_ONLY.sql).
-- =====================================================================

-- CREATE TYPE has no native IF NOT EXISTS in Postgres — guard manually so
-- this file can be re-run after a partial failure without erroring out.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_role') then
    create type membership_role as enum ('admin', 'gestor', 'recepcao', 'profissional');
  end if;
end
$$;

create table if not exists empresa_memberships (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role membership_role not null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- STEP 3 — constraints obrigatorias.
--
-- ATENCAO (corrigido na revisao 2): as 4 constraints UNIQUE abaixo sao alvo
-- de FKs compostas criadas no STEP 7 (autoria cross-tenant) e no STEP 4
-- (membership_units). Um padrao DROP CONSTRAINT IF EXISTS + ADD (usado para
-- CHECK/FK mais abaixo, sem risco) FALHA aqui numa segunda execucao: o
-- Postgres recusa DROP de um UNIQUE/PK referenciado por FK de outra tabela
-- sem CASCADE. Como a definicao dessas 4 constraints nunca muda entre
-- execucoes, a forma segura e criar cada uma condicionalmente (via
-- pg_constraint) e nunca dropa-la.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'empresa_memberships_empresa_id_user_id_key'
      and conrelid = 'empresa_memberships'::regclass
  ) then
    alter table empresa_memberships add constraint empresa_memberships_empresa_id_user_id_key
      unique (empresa_id, user_id); -- membership unica por usuario + empresa
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'empresa_memberships_id_empresa_id_key'
      and conrelid = 'empresa_memberships'::regclass
  ) then
    alter table empresa_memberships add constraint empresa_memberships_id_empresa_id_key
      unique (id, empresa_id); -- alvo da FK composta de membership_units (tenant boundary)
  end if;
end
$$;

create table if not exists unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'unidades_id_empresa_id_key'
      and conrelid = 'unidades'::regclass
  ) then
    alter table unidades add constraint unidades_id_empresa_id_key
      unique (id, empresa_id); -- alvo da FK composta de membership_units (tenant boundary)
  end if;
end
$$;

-- Recomendada, nao obrigatoria (decisao do Platform Owner):
-- alter table unidades add constraint unidades_empresa_id_nome_key unique (empresa_id, nome);

create table if not exists membership_units (
  membership_id uuid not null,
  unit_id uuid not null,
  empresa_id uuid not null, -- denormalizado deliberadamente: ver FK composta abaixo
  created_at timestamptz not null default now(),
  primary key (membership_id, unit_id)
);

-- STEP 4 — tenant boundary: impossivel vincular membership e unidade de empresas diferentes
alter table membership_units drop constraint if exists membership_units_membership_empresa_fkey;
alter table membership_units add constraint membership_units_membership_empresa_fkey
  foreign key (membership_id, empresa_id) references empresa_memberships (id, empresa_id) on delete cascade;

alter table membership_units drop constraint if exists membership_units_unit_empresa_fkey;
alter table membership_units add constraint membership_units_unit_empresa_fkey
  foreign key (unit_id, empresa_id) references unidades (id, empresa_id) on delete cascade;

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade, -- fixado na criacao, imutavel (ver trigger)
  nome text not null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Alvo da FK composta usada para fechar autoria cross-tenant (ver STEP 7).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'integrations_empresa_id_id_key'
      and conrelid = 'integrations'::regclass
  ) then
    alter table integrations add constraint integrations_empresa_id_id_key
      unique (empresa_id, id);
  end if;
end
$$;

create table if not exists integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  secret_hash text not null, -- nunca texto plano; hash (argon2/bcrypt) gerado pelo backend
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists integration_scopes (
  integration_id uuid not null references integrations(id) on delete cascade,
  scope text not null,
  created_at timestamptz not null default now(),
  -- PK composta ja garante "scope sem duplicidade"
  primary key (integration_id, scope)
);

create table if not exists integration_audit_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete restrict, -- restrict: excluir integracao nao apaga auditoria
  rota text not null,
  status_code int not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- STEP 4 — tenant boundary / integrity triggers
-- =====================================================================

-- (a) integrations.empresa_id e imutavel apos a criacao — mesmo contra
-- service_role, que ignora RLS mas NAO ignora triggers.
create or replace function integrations_prevent_empresa_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.empresa_id <> old.empresa_id then
    raise exception 'integrations.empresa_id e imutavel apos a criacao' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_integrations_empresa_id_immutable on integrations;
create trigger trg_integrations_empresa_id_immutable
  before update on integrations
  for each row
  execute function integrations_prevent_empresa_id_change();

-- (b) Limite de 2 credenciais ativas por integracao.
--
-- Revisao 1 corrigiu a corrida original (contagem sem lock, TOCTOU) travando
-- a linha-pai em integrations ANTES de contar. Revisao 2 (Red Team) apontou
-- que o trigger era AFTER, rodando depois do INSERT ja ter disparado o
-- enforcement interno da FK integration_id -> integrations (que toma um
-- lock proprio em modo FOR KEY SHARE antes do trigger de usuario rodar) —
-- levantando duvida razoavel sobre ordem de locks. Corrigido trocando para
-- BEFORE INSERT OR UPDATE: o lock explicito abaixo agora e adquirido ANTES
-- de qualquer enforcement de FK ou escrita da linha, eliminando essa
-- ambiguidade. IMPORTANTE: esta continua sendo uma correcao de DESENHO —
-- nao foi validada contra duas conexoes reais (ver TESTE 2b no arquivo de
-- testes); nao tratar como comprovada ate esse teste rodar de fato.
create or replace function integration_credentials_enforce_max_active()
returns trigger
language plpgsql
as $$
declare
  v_will_be_active boolean;
  v_other_active_count int;
begin
  -- Serializa concorrencia por integration_id: qualquer segunda transacao
  -- tentando inserir/atualizar credencial para a MESMA integracao bloqueia
  -- aqui ate a primeira terminar, fechando a corrida de "ambas veem <2".
  perform 1 from integrations where id = new.integration_id for update;

  v_will_be_active := (new.revoked_at is null and (new.expires_at is null or new.expires_at > now()));

  if not v_will_be_active then
    -- Credencial que nasce/fica revogada ou expirada nunca contribui para o limite.
    return new;
  end if;

  select count(*) into v_other_active_count
  from integration_credentials
  where integration_id = new.integration_id
    and id <> new.id -- exclui a propria linha (relevante em UPDATE; inofensivo em INSERT)
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_other_active_count >= 2 then
    raise exception 'integracao % ja possui o maximo de 2 credenciais ativas', new.integration_id using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_integration_credentials_max_active on integration_credentials;
create trigger trg_integration_credentials_max_active
  before insert or update on integration_credentials
  for each row
  execute function integration_credentials_enforce_max_active();

-- (c) integration_audit_events append-only — CORRIGIDO nesta revisao: a
-- versao anterior so afirmava isso em comentario/Markdown, mas
-- 004_service_role_table_grants.sql ja concede UPDATE/DELETE a service_role
-- via `alter default privileges`, que se aplica automaticamente a esta
-- tabela nova. Sem um trigger, "append-only" era so uma convencao de
-- aplicacao, nao uma garantia de banco. Este trigger rejeita QUALQUER
-- UPDATE/DELETE, inclusive vindo de service_role (triggers rodam
-- independente de role; so RLS e ignorada por service_role).
create or replace function integration_audit_events_prevent_write()
returns trigger
language plpgsql
as $$
begin
  raise exception 'integration_audit_events e append-only; UPDATE/DELETE nao sao permitidos' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_integration_audit_events_no_update on integration_audit_events;
create trigger trg_integration_audit_events_no_update
  before update on integration_audit_events
  for each row
  execute function integration_audit_events_prevent_write();

drop trigger if exists trg_integration_audit_events_no_delete on integration_audit_events;
create trigger trg_integration_audit_events_no_delete
  before delete on integration_audit_events
  for each row
  execute function integration_audit_events_prevent_write();

-- =====================================================================
-- STEP 5 — indexes
-- =====================================================================

create index if not exists idx_empresa_memberships_user on empresa_memberships(user_id);
create index if not exists idx_empresa_memberships_empresa_status on empresa_memberships(empresa_id, status);
create index if not exists idx_unidades_empresa on unidades(empresa_id);
create index if not exists idx_membership_units_unit on membership_units(unit_id);
create index if not exists idx_integrations_empresa on integrations(empresa_id, status);
create index if not exists idx_integration_credentials_integration on integration_credentials(integration_id);
create index if not exists idx_integration_audit_events_integration_created on integration_audit_events(integration_id, created_at);

-- =====================================================================
-- STEP 7 — authorship columns on existing tables (all nullable — see
-- "Backfill" in the companion Markdown; nothing here is NOT NULL)
--
-- CORRIGIDO nesta revisao: adicionadas FKs compostas que fecham a lacuna de
-- "autoria cross-tenant" apontada na revisao — antes, actor_id/created_by
-- so referenciava app_users(id), sem checagem de que esse usuario tem
-- membership na MESMA empresa da linha. Reaproveitando as unique
-- constraints compostas ja criadas acima (empresa_memberships(empresa_id,
-- user_id), integrations(empresa_id, id)), uma FK composta
-- (empresa_id, actor_id) -> empresa_memberships(empresa_id, user_id) torna
-- isso estruturalmente impossivel: o INSERT/UPDATE falha se o actor_id nao
-- tiver (tido) uma membership nessa empresa exata. Como actor_id/created_by
-- sao nullable e Postgres usa MATCH SIMPLE por padrao, a checagem e
-- automaticamente pulada quando a coluna de autoria estiver NULL (evento
-- sem autor humano, ou historico pre-migracao) — so e' aplicada quando o
-- valor esta preenchido.
-- =====================================================================

-- Evento imutavel: actor_id (humano) e integration_id (maquina) sao
-- mutuamente exclusivos — nunca os dois preenchidos na mesma linha.
alter table comandos
  add column if not exists actor_id uuid null references app_users(id),
  add column if not exists integration_id uuid null references integrations(id);

alter table comandos drop constraint if exists check_comandos_autoria_exclusiva;
alter table comandos add constraint check_comandos_autoria_exclusiva
  check (actor_id is null or integration_id is null);

alter table comandos drop constraint if exists fk_comandos_actor_empresa;
alter table comandos add constraint fk_comandos_actor_empresa
  foreign key (empresa_id, actor_id) references empresa_memberships (empresa_id, user_id);

alter table comandos drop constraint if exists fk_comandos_integration_empresa;
alter table comandos add constraint fk_comandos_integration_empresa
  foreign key (empresa_id, integration_id) references integrations (empresa_id, id);

alter table produto_estoque_movimentos
  add column if not exists actor_id uuid null references app_users(id),
  add column if not exists integration_id uuid null references integrations(id);

alter table produto_estoque_movimentos drop constraint if exists check_estoque_movimentos_autoria_exclusiva;
alter table produto_estoque_movimentos add constraint check_estoque_movimentos_autoria_exclusiva
  check (actor_id is null or integration_id is null);

alter table produto_estoque_movimentos drop constraint if exists fk_estoque_movimentos_actor_empresa;
alter table produto_estoque_movimentos add constraint fk_estoque_movimentos_actor_empresa
  foreign key (empresa_id, actor_id) references empresa_memberships (empresa_id, user_id);

alter table produto_estoque_movimentos drop constraint if exists fk_estoque_movimentos_integration_empresa;
alter table produto_estoque_movimentos add constraint fk_estoque_movimentos_integration_empresa
  foreign key (empresa_id, integration_id) references integrations (empresa_id, id);

-- Estado mutavel: created_by / updated_by (agendamentos tambem cancelled_by).
-- Somente humano nesta migration — nenhum caso de uso de integracao criando
-- agendamentos/cadastros foi decidido pela ADR-005.
alter table agendamentos
  add column if not exists created_by uuid null references app_users(id),
  add column if not exists updated_by uuid null references app_users(id),
  add column if not exists cancelled_by uuid null references app_users(id);

alter table agendamentos drop constraint if exists fk_agendamentos_created_by_empresa;
alter table agendamentos add constraint fk_agendamentos_created_by_empresa
  foreign key (empresa_id, created_by) references empresa_memberships (empresa_id, user_id);

alter table agendamentos drop constraint if exists fk_agendamentos_updated_by_empresa;
alter table agendamentos add constraint fk_agendamentos_updated_by_empresa
  foreign key (empresa_id, updated_by) references empresa_memberships (empresa_id, user_id);

alter table agendamentos drop constraint if exists fk_agendamentos_cancelled_by_empresa;
alter table agendamentos add constraint fk_agendamentos_cancelled_by_empresa
  foreign key (empresa_id, cancelled_by) references empresa_memberships (empresa_id, user_id);

alter table clientes
  add column if not exists created_by uuid null references app_users(id),
  add column if not exists updated_by uuid null references app_users(id);

alter table clientes drop constraint if exists fk_clientes_created_by_empresa;
alter table clientes add constraint fk_clientes_created_by_empresa
  foreign key (empresa_id, created_by) references empresa_memberships (empresa_id, user_id);

alter table clientes drop constraint if exists fk_clientes_updated_by_empresa;
alter table clientes add constraint fk_clientes_updated_by_empresa
  foreign key (empresa_id, updated_by) references empresa_memberships (empresa_id, user_id);

alter table produtos
  add column if not exists created_by uuid null references app_users(id),
  add column if not exists updated_by uuid null references app_users(id);

alter table produtos drop constraint if exists fk_produtos_created_by_empresa;
alter table produtos add constraint fk_produtos_created_by_empresa
  foreign key (empresa_id, created_by) references empresa_memberships (empresa_id, user_id);

alter table produtos drop constraint if exists fk_produtos_updated_by_empresa;
alter table produtos add constraint fk_produtos_updated_by_empresa
  foreign key (empresa_id, updated_by) references empresa_memberships (empresa_id, user_id);

alter table servicos
  add column if not exists created_by uuid null references app_users(id),
  add column if not exists updated_by uuid null references app_users(id);

alter table servicos drop constraint if exists fk_servicos_created_by_empresa;
alter table servicos add constraint fk_servicos_created_by_empresa
  foreign key (empresa_id, created_by) references empresa_memberships (empresa_id, user_id);

alter table servicos drop constraint if exists fk_servicos_updated_by_empresa;
alter table servicos add constraint fk_servicos_updated_by_empresa
  foreign key (empresa_id, updated_by) references empresa_memberships (empresa_id, user_id);

alter table profissionais
  add column if not exists created_by uuid null references app_users(id),
  add column if not exists updated_by uuid null references app_users(id);

alter table profissionais drop constraint if exists fk_profissionais_created_by_empresa;
alter table profissionais add constraint fk_profissionais_created_by_empresa
  foreign key (empresa_id, created_by) references empresa_memberships (empresa_id, user_id);

alter table profissionais drop constraint if exists fk_profissionais_updated_by_empresa;
alter table profissionais add constraint fk_profissionais_updated_by_empresa
  foreign key (empresa_id, updated_by) references empresa_memberships (empresa_id, user_id);

alter table formas_pagamento
  add column if not exists created_by uuid null references app_users(id),
  add column if not exists updated_by uuid null references app_users(id);

alter table formas_pagamento drop constraint if exists fk_formas_pagamento_created_by_empresa;
alter table formas_pagamento add constraint fk_formas_pagamento_created_by_empresa
  foreign key (empresa_id, created_by) references empresa_memberships (empresa_id, user_id);

alter table formas_pagamento drop constraint if exists fk_formas_pagamento_updated_by_empresa;
alter table formas_pagamento add constraint fk_formas_pagamento_updated_by_empresa
  foreign key (empresa_id, updated_by) references empresa_memberships (empresa_id, user_id);

-- comando_itens, comando_pagamentos, comando_gorjetas: NAO ALTERADAS
-- (derivada — herdam autoria via comando_id, ver Markdown "Autoria").
-- caixa_movimentos: NAO ALTERADA (herda de comando_id ate existir feature
-- propria de abertura/fechamento de caixa, fora de escopo).
-- profissional_servicos, lista_espera, agendamento_eventos: DESCONHECIDA —
-- decisao explicita do Platform Owner pendente antes de alterar (ver Markdown).

-- =====================================================================
-- RLS minima (replica o padrao ja usado em 001_init.sql: habilitada, sem
-- policies — apenas service_role acessa; anon/authenticated ficam bloqueados
-- por ausencia de policy, nao por uma regra nova desta migration). Isto NAO
-- e isolamento multi-tenant: nao protege contra uso indevido do proprio
-- service_role nem substitui os filtros de empresa_id no backend.
-- =====================================================================

alter table app_users enable row level security;
alter table empresa_memberships enable row level security;
alter table unidades enable row level security;
alter table membership_units enable row level security;
alter table integrations enable row level security;
alter table integration_credentials enable row level security;
alter table integration_scopes enable row level security;
alter table integration_audit_events enable row level security;

-- =====================================================================
-- Grants: nenhum GRANT explicito foi escrito aqui para service_role nas
-- tabelas novas, porque 004_service_role_table_grants.sql configurou
-- `alter default privileges in schema public grant select, insert, update,
-- delete on tables to service_role`, que o Postgres aplica automaticamente
-- a qualquer tabela criada depois. Isso foi confirmado por LEITURA do
-- arquivo 004 — NAO foi validado contra o catalogo (pg_default_acl) de
-- nenhum banco real. Antes de aplicar esta migration em qualquer ambiente,
-- confirmar com uma consulta direta (ver arquivo de testes de schema) que o
-- default privilege realmente está em vigor nesse banco especifico — grants
-- podem ter sido alterados manualmente fora de migration desde entao (o
-- proprio 004 existe para corrigir um GRANT que tinha sido feito ad-hoc).
-- =====================================================================
