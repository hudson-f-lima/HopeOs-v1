-- KortexOS — Migration 008: dados fiscais, buffer de higienização, cargos,
-- categorias com herança de comissão e régua de faltas (Onda B).
-- Autorizada pelo Platform Owner em 2026-11-08 (D-009). Não altera 001–007:
-- agendamento_criar é redefinida aqui (create or replace) para respeitar o buffer.
-- Aditiva: colunas novas têm default ou são nullable; dados existentes seguem válidos.
-- Rollback: supabase/rollback/008_down.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Empresa: identificação fiscal, buffer e régua de faltas
-- ---------------------------------------------------------------------------
alter table empresas add column if not exists cnpj text null;
alter table empresas add column if not exists razao_social text null;
alter table empresas add column if not exists salao_parceiro boolean not null default false;
alter table empresas add column if not exists buffer_min int not null default 0;
alter table empresas add column if not exists regua_alerta_faltas int not null default 2;
alter table empresas add column if not exists regua_sinal_faltas int not null default 3;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_cnpj_formato') then
    alter table empresas add constraint empresas_cnpj_formato check (cnpj is null or cnpj ~ '^[0-9]{14}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_buffer_min_valores') then
    alter table empresas add constraint empresas_buffer_min_valores check (buffer_min in (0, 5, 10, 15));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_regua_faltas_ordem') then
    alter table empresas add constraint empresas_regua_faltas_ordem
      check (regua_alerta_faltas >= 1 and regua_sinal_faltas > regua_alerta_faltas and regua_sinal_faltas <= 20);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Cargos: comissão e modelo de taxa padrão por função
-- ---------------------------------------------------------------------------
create table if not exists cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  comissao_pct numeric(5,2) not null check (comissao_pct >= 0 and comissao_pct <= 100),
  modelo_comissao text not null default 'dividido' check (modelo_comissao in ('bruto_salao', 'dividido', 'bruto_staff')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_cargos_empresa_nome on cargos (empresa_id, lower(nome));

alter table profissionais add column if not exists cargo_id uuid null references cargos(id) on delete set null;
create index if not exists ix_profissionais_cargo on profissionais (cargo_id);

-- ---------------------------------------------------------------------------
-- 3. Categorias de serviço e modelo de herança da comissão
-- ---------------------------------------------------------------------------
create table if not exists servico_categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  comissao_pct numeric(5,2) null check (comissao_pct is null or (comissao_pct >= 0 and comissao_pct <= 100)),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_servico_categorias_empresa_nome on servico_categorias (empresa_id, lower(nome));

alter table servicos add column if not exists categoria_id uuid null references servico_categorias(id) on delete set null;
-- FIXED_SERVICE preserva o comportamento atual (comissão do próprio serviço).
alter table servicos add column if not exists modelo_heranca text not null default 'FIXED_SERVICE';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'servicos_modelo_heranca_valores') then
    alter table servicos add constraint servicos_modelo_heranca_valores
      check (modelo_heranca in ('FIXED_SERVICE', 'BY_CATEGORY', 'BY_ROLE'));
  end if;
end $$;
create index if not exists ix_servicos_categoria on servicos (categoria_id);

-- Cargo e categoria precisam ser da mesma empresa do profissional/serviço.
-- Uma função por tabela: o PL/pgSQL não garante curto-circuito ao resolver
-- campos de NEW, então uma função compartilhada falha em uma das tabelas.
create or replace function public.profissional_cargo_mesma_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cargo_id is not null
     and not exists (select 1 from cargos c where c.id = new.cargo_id and c.empresa_id = new.empresa_id) then
    raise exception 'cargo de outra empresa' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create or replace function public.servico_categoria_mesma_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.categoria_id is not null
     and not exists (select 1 from servico_categorias c where c.id = new.categoria_id and c.empresa_id = new.empresa_id) then
    raise exception 'categoria de outra empresa' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profissionais_cargo_mesma_empresa on profissionais;
create trigger trg_profissionais_cargo_mesma_empresa before insert or update of cargo_id, empresa_id on profissionais
  for each row execute function public.profissional_cargo_mesma_empresa();
drop trigger if exists trg_servicos_categoria_mesma_empresa on servicos;
create trigger trg_servicos_categoria_mesma_empresa before insert or update of categoria_id, empresa_id on servicos
  for each row execute function public.servico_categoria_mesma_empresa();

-- ---------------------------------------------------------------------------
-- 4. Agenda atômica com buffer de higienização
-- ---------------------------------------------------------------------------
-- Cada atendimento ocupa [início, fim + buffer). Mesmo lock da 007; o encaixe
-- forçado (p_permitir_conflito) continua ignorando conflito e buffer.
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
  v_buffer int;
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

  select coalesce(buffer_min, 0) into v_buffer from empresas where id = p_empresa_id;
  v_ini := extract(hour from v_hora)::int * 60 + extract(minute from v_hora)::int;
  v_fim := v_ini + v_dur;

  if not p_permitir_conflito then
    select jsonb_agg(jsonb_build_object('id', a.id, 'horario', a.horario, 'duracaoMin', a.duracao_min, 'status', a.status, 'bufferMin', v_buffer))
      into v_conflitos
    from agendamentos a
    where a.empresa_id = p_empresa_id
      and a.profissional_id = v_prof
      and a.data = v_data
      and a.status not in ('cancelado', 'no_show', 'reagendado')
      and (p_ignorar_id is null or a.id <> p_ignorar_id)
      and (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int) < v_fim + v_buffer
      and v_ini < (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int + a.duracao_min + v_buffer);
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
-- 5. Permissões (mesmo padrão da 007: só service_role; anon/authenticated fora)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['cargos', 'servico_categorias'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on function public.profissional_cargo_mesma_empresa() from public, anon, authenticated;
revoke all on function public.servico_categoria_mesma_empresa() from public, anon, authenticated;
revoke all on function public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid) from public, anon, authenticated;
grant execute on function public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid) to service_role;

commit;
