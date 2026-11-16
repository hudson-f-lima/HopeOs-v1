-- Migration 021 — Assinatura, Onda A, fase 1: planos e restrições (D-042). Autorizada pelo
-- Platform Owner em 2026-11-16 (D-038: "Onda a: autorizado"; fase 1 e rateio aprovados em
-- 2026-11-16). Aplica em produção só no merge.
--
-- Só configuração: nenhum cliente, cobrança ou uso ainda (isso é a fase 2). O plano guarda preço,
-- periodicidade, vencimento, regra de comissão (rateio por quantidade de serviços com percentual
-- configurável, tabela ou valor fixo por uso) e a política de uso fora da regra (bloquear, cobrar
-- X% e consumir um uso, cobrar X% sem consumir, cobertura total), com teto por ciclo e aprovação
-- opcional. Cada item cobre um serviço com desconto, limite por ciclo (nulo = ilimitado), dias da
-- semana, faixa de horário e intervalo mínimo entre usos. A lista de profissionais vazia quer
-- dizer "todos". Plano não se apaga: arquiva.
begin;

create table if not exists public.assinatura_planos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  descricao text null check (descricao is null or char_length(descricao) <= 2000),
  preco_centavos int not null check (preco_centavos between 0 and 10000000),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual')),
  tipo_vencimento text not null default 'base_contratacao' check (tipo_vencimento in ('data_fixa', 'base_contratacao', 'base_contratacao_fixa')),
  dia_vencimento int null check (dia_vencimento between 1 and 28),
  cobranca text not null default 'manual' check (cobranca in ('manual', 'recorrente')),
  disponivel_venda boolean not null default true,
  tolerancia_dias int not null default 7 check (tolerancia_dias between 0 and 60),
  comissao_regra text not null default 'rateio' check (comissao_regra in ('rateio', 'tabela', 'fixo_por_uso')),
  comissao_percentual numeric(5,2) null check (comissao_percentual between 0 and 100),
  comissao_fixa_centavos int null check (comissao_fixa_centavos between 0 and 1000000),
  fora_regra_acao text not null default 'bloquear'
    check (fora_regra_acao in ('bloquear', 'cobrar_percentual_consumir', 'cobrar_percentual_sem_consumir', 'cobertura_total')),
  fora_regra_percentual numeric(5,2) null check (fora_regra_percentual between 0 and 100),
  fora_regra_teto_ciclo int null check (fora_regra_teto_ciclo between 0 and 100),
  fora_regra_exige_aprovacao boolean not null default false,
  arquivado_em timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.app_users(id),
  -- Cada escolha traz o número que ela precisa (e só ele).
  constraint assinatura_planos_vencimento check ((tipo_vencimento = 'data_fixa') = (dia_vencimento is not null)),
  constraint assinatura_planos_comissao check (
    (comissao_regra = 'rateio' and comissao_percentual is not null and comissao_fixa_centavos is null)
    or (comissao_regra = 'fixo_por_uso' and comissao_fixa_centavos is not null and comissao_percentual is null)
    or (comissao_regra = 'tabela' and comissao_percentual is null and comissao_fixa_centavos is null)),
  constraint assinatura_planos_fora_regra check (
    (fora_regra_acao in ('cobrar_percentual_consumir', 'cobrar_percentual_sem_consumir')) = (fora_regra_percentual is not null))
);
create index if not exists idx_assinatura_planos_empresa on public.assinatura_planos (empresa_id) where arquivado_em is null;
create unique index if not exists uq_assinatura_planos_nome on public.assinatura_planos (empresa_id, lower(btrim(nome))) where arquivado_em is null;

create table if not exists public.assinatura_plano_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  plano_id uuid not null references public.assinatura_planos(id) on delete cascade,
  servico_id uuid not null references public.servicos(id),
  desconto_percentual numeric(5,2) not null default 100 check (desconto_percentual > 0 and desconto_percentual <= 100),
  limite_por_ciclo int null check (limite_por_ciclo between 1 and 999),
  dias_semana smallint[] null check (dias_semana is null or (cardinality(dias_semana) between 1 and 7 and dias_semana <@ array[0,1,2,3,4,5,6]::smallint[])),
  horario_inicio time null,
  horario_fim time null,
  intervalo_min_dias int null check (intervalo_min_dias between 1 and 90),
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  constraint assinatura_plano_itens_horario check ((horario_inicio is null) = (horario_fim is null) and (horario_inicio is null or horario_inicio < horario_fim)),
  constraint uq_assinatura_plano_itens unique (plano_id, servico_id)
);
create index if not exists idx_assinatura_plano_itens_plano on public.assinatura_plano_itens (plano_id);

create table if not exists public.assinatura_plano_profissionais (
  plano_id uuid not null references public.assinatura_planos(id) on delete cascade,
  profissional_id uuid not null references public.profissionais(id),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  primary key (plano_id, profissional_id)
);

-- Plano, item, serviço e profissional são sempre da mesma empresa.
create or replace function public.assinatura_planos_mesma_empresa() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (select 1 from public.assinatura_planos p where p.id = new.plano_id and p.empresa_id = new.empresa_id) then
    raise exception '%: plano de outra empresa', tg_table_name using errcode = '23514';
  end if;
  -- Blocos separados: o PL/pgSQL não deixa ler um campo que a tabela do gatilho não tem.
  if tg_table_name = 'assinatura_plano_itens' then
    if not exists (select 1 from public.servicos s where s.id = new.servico_id and s.empresa_id = new.empresa_id) then
      raise exception 'assinatura_plano_itens: serviço de outra empresa' using errcode = '23514';
    end if;
  else
    if not exists (select 1 from public.profissionais p where p.id = new.profissional_id and p.empresa_id = new.empresa_id) then
      raise exception 'assinatura_plano_profissionais: profissional de outra empresa' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_assinatura_plano_itens_mesma_empresa on public.assinatura_plano_itens;
create trigger trg_assinatura_plano_itens_mesma_empresa
  before insert or update on public.assinatura_plano_itens
  for each row execute function public.assinatura_planos_mesma_empresa();
drop trigger if exists trg_assinatura_plano_profissionais_mesma_empresa on public.assinatura_plano_profissionais;
create trigger trg_assinatura_plano_profissionais_mesma_empresa
  before insert or update on public.assinatura_plano_profissionais
  for each row execute function public.assinatura_planos_mesma_empresa();

-- Salva o plano com os itens e os profissionais de uma vez: ou grava tudo, ou nada.
-- p_plano_id nulo cria; preenchido altera (só plano da mesma empresa e não arquivado).
create or replace function public.assinatura_plano_salvar(
  p_empresa_id uuid, p_plano_id uuid, p_plano jsonb, p_itens jsonb, p_profissionais uuid[], p_actor_id uuid default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_id uuid;
  v_item jsonb;
begin
  perform public.app_set_autoria(p_actor_id, null, p_empresa_id);
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'assinatura_plano_salvar: o plano precisa de ao menos um serviço' using errcode = '23514';
  end if;
  if p_plano_id is null then
    insert into public.assinatura_planos (empresa_id, nome, descricao, preco_centavos, periodicidade, tipo_vencimento, dia_vencimento,
      cobranca, disponivel_venda, tolerancia_dias, comissao_regra, comissao_percentual, comissao_fixa_centavos,
      fora_regra_acao, fora_regra_percentual, fora_regra_teto_ciclo, fora_regra_exige_aprovacao, created_by, updated_by)
    values (p_empresa_id, p_plano->>'nome', p_plano->>'descricao', (p_plano->>'preco_centavos')::int,
      coalesce(p_plano->>'periodicidade', 'mensal'), coalesce(p_plano->>'tipo_vencimento', 'base_contratacao'), (p_plano->>'dia_vencimento')::int,
      coalesce(p_plano->>'cobranca', 'manual'), coalesce((p_plano->>'disponivel_venda')::boolean, true), coalesce((p_plano->>'tolerancia_dias')::int, 7),
      coalesce(p_plano->>'comissao_regra', 'rateio'), (p_plano->>'comissao_percentual')::numeric, (p_plano->>'comissao_fixa_centavos')::int,
      coalesce(p_plano->>'fora_regra_acao', 'bloquear'), (p_plano->>'fora_regra_percentual')::numeric, (p_plano->>'fora_regra_teto_ciclo')::int,
      coalesce((p_plano->>'fora_regra_exige_aprovacao')::boolean, false), p_actor_id, p_actor_id)
    returning id into v_id;
  else
    update public.assinatura_planos set
      nome = p_plano->>'nome', descricao = p_plano->>'descricao', preco_centavos = (p_plano->>'preco_centavos')::int,
      periodicidade = coalesce(p_plano->>'periodicidade', 'mensal'), tipo_vencimento = coalesce(p_plano->>'tipo_vencimento', 'base_contratacao'),
      dia_vencimento = (p_plano->>'dia_vencimento')::int, cobranca = coalesce(p_plano->>'cobranca', 'manual'),
      disponivel_venda = coalesce((p_plano->>'disponivel_venda')::boolean, true), tolerancia_dias = coalesce((p_plano->>'tolerancia_dias')::int, 7),
      comissao_regra = coalesce(p_plano->>'comissao_regra', 'rateio'), comissao_percentual = (p_plano->>'comissao_percentual')::numeric,
      comissao_fixa_centavos = (p_plano->>'comissao_fixa_centavos')::int, fora_regra_acao = coalesce(p_plano->>'fora_regra_acao', 'bloquear'),
      fora_regra_percentual = (p_plano->>'fora_regra_percentual')::numeric, fora_regra_teto_ciclo = (p_plano->>'fora_regra_teto_ciclo')::int,
      fora_regra_exige_aprovacao = coalesce((p_plano->>'fora_regra_exige_aprovacao')::boolean, false),
      updated_at = now(), updated_by = p_actor_id
    where id = p_plano_id and empresa_id = p_empresa_id and arquivado_em is null
    returning id into v_id;
    if v_id is null then
      raise exception 'assinatura_plano_salvar: plano não encontrado' using errcode = 'P0002';
    end if;
    delete from public.assinatura_plano_itens where plano_id = v_id;
    delete from public.assinatura_plano_profissionais where plano_id = v_id;
  end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    insert into public.assinatura_plano_itens (empresa_id, plano_id, servico_id, desconto_percentual, limite_por_ciclo, dias_semana,
      horario_inicio, horario_fim, intervalo_min_dias, created_by)
    values (p_empresa_id, v_id, (v_item->>'servico_id')::uuid, coalesce((v_item->>'desconto_percentual')::numeric, 100),
      (v_item->>'limite_por_ciclo')::int,
      case when jsonb_typeof(v_item->'dias_semana') = 'array' then array(select jsonb_array_elements_text(v_item->'dias_semana')::smallint) end,
      (v_item->>'horario_inicio')::time, (v_item->>'horario_fim')::time, (v_item->>'intervalo_min_dias')::int, p_actor_id);
  end loop;
  insert into public.assinatura_plano_profissionais (plano_id, profissional_id, empresa_id, created_by)
  select v_id, x, p_empresa_id, p_actor_id from unnest(coalesce(p_profissionais, '{}'::uuid[])) as x;
  return v_id;
end $$;

revoke all on table public.assinatura_planos, public.assinatura_plano_itens, public.assinatura_plano_profissionais from public, anon, authenticated;
alter table public.assinatura_planos enable row level security;
alter table public.assinatura_plano_itens enable row level security;
alter table public.assinatura_plano_profissionais enable row level security;
grant select, update on table public.assinatura_planos to service_role;
grant select on table public.assinatura_plano_itens, public.assinatura_plano_profissionais to service_role;
revoke insert, delete, truncate on table public.assinatura_planos from service_role;
revoke insert, update, delete, truncate on table public.assinatura_plano_itens, public.assinatura_plano_profissionais from service_role;
revoke all on function public.assinatura_planos_mesma_empresa() from public, anon, authenticated;
revoke all on function public.assinatura_plano_salvar(uuid, uuid, jsonb, jsonb, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.assinatura_plano_salvar(uuid, uuid, jsonb, jsonb, uuid[], uuid) to service_role;

commit;
