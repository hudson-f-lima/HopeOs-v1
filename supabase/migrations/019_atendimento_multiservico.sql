-- Migration 019 — atendimento com vários serviços (D-040, Onda 2 do agendamento inteligente).
-- Autorizada pelo Platform Owner em 2026-11-16 ("1. Autorizado" sobre
-- docs/planning/AGENDAMENTO_INTELIGENTE_ANALISE.md). Aplica em produção só no merge.
--
-- 1. empresas.atendimento_espera_max_min: espera máxima entre etapas de um atendimento
--    fracionado (padrão 30 minutos, decisão do dono).
-- 2. atendimento_criar: reserva TODAS as etapas de um atendimento ou nenhuma. Cada etapa é um
--    agendamento comum (um serviço, um profissional), ligado aos outros por grupo_id e
--    grupo_seq (colunas que existem desde a 001). A função trava a agenda de cada profissional
--    do dia (em ordem fixa, para duas reservas simultâneas não se travarem uma à outra), confere
--    conflito de cada etapa com a mesma regra do agendamento_criar (ocupação + tempo de
--    higienização) e grava. Qualquer falha desfaz tudo. Entre etapas do MESMO atendimento com o
--    mesmo profissional não há higienização: basta não se sobreporem.
--    Atendimento de várias etapas nunca encaixa à força.
begin;

alter table public.empresas add column if not exists atendimento_espera_max_min int not null default 30;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_atendimento_espera_faixa') then
    alter table public.empresas add constraint empresas_atendimento_espera_faixa check (atendimento_espera_max_min between 0 and 240);
  end if;
end $$;

create index if not exists idx_agendamentos_grupo on public.agendamentos (grupo_id, grupo_seq) where grupo_id is not null;

create or replace function public.atendimento_criar(
  p_empresa_id uuid,
  p_etapas jsonb,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_n int;
  v_data date;
  v_cli uuid;
  v_buffer int;
  v_grupo uuid := gen_random_uuid();
  v_e jsonb;
  v_i int := 0;
  v_prof uuid; v_serv uuid; v_hora time; v_dur int; v_ini int; v_fim int;
  v_conflitos jsonb;
  v_row public.agendamentos%rowtype;
  v_out jsonb := '[]'::jsonb;
  v_chave text;
begin
  if p_empresa_id is null then raise exception 'empresa_id obrigatorio' using errcode = 'P0001'; end if;
  if p_etapas is null or jsonb_typeof(p_etapas) <> 'array' then raise exception 'etapas invalidas' using errcode = 'P0001'; end if;
  v_n := jsonb_array_length(p_etapas);
  if v_n < 1 or v_n > 6 then raise exception 'atendimento deve ter de 1 a 6 etapas' using errcode = 'P0001'; end if;
  if p_created_by is not null and not exists (
    select 1 from public.empresa_memberships where user_id = p_created_by and empresa_id = p_empresa_id and status = 'ativo'
  ) then
    raise exception 'ator sem membership ativa na empresa' using errcode = 'P0001';
  end if;

  v_data := (p_etapas->0->>'data')::date;
  v_cli := nullif(p_etapas->0->>'cliente_id', '')::uuid;
  if v_data is null then raise exception 'data obrigatoria' using errcode = 'P0001'; end if;
  if v_cli is not null and not exists (select 1 from public.clientes where id = v_cli and empresa_id = p_empresa_id) then
    raise exception 'cliente nao encontrado: %', v_cli using errcode = 'P0001';
  end if;

  -- Validação de cada etapa antes de travar: mesmo dia, mesmo cliente, cadastro da empresa.
  for v_e in select e from jsonb_array_elements(p_etapas) as e loop
    v_prof := nullif(v_e->>'profissional_id', '')::uuid;
    v_serv := nullif(v_e->>'servico_id', '')::uuid;
    v_dur := coalesce(nullif(v_e->>'duracao_min', '')::int, 0);
    if v_prof is null or v_serv is null or (v_e->>'horario') is null then
      raise exception 'profissional, servico e horario obrigatorios em cada etapa' using errcode = 'P0001';
    end if;
    if (v_e->>'data')::date is distinct from v_data then raise exception 'etapas em dias diferentes' using errcode = 'P0001'; end if;
    if nullif(v_e->>'cliente_id', '')::uuid is distinct from v_cli then raise exception 'etapas de clientes diferentes' using errcode = 'P0001'; end if;
    if v_dur <= 0 or v_dur > 600 then raise exception 'duracao invalida' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.profissionais where id = v_prof and empresa_id = p_empresa_id) then
      raise exception 'profissional nao encontrado: %', v_prof using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.servicos where id = v_serv and empresa_id = p_empresa_id) then
      raise exception 'servico nao encontrado: %', v_serv using errcode = 'P0001';
    end if;
  end loop;

  -- Travas em ordem fixa (mesma chave do agendamento_criar): sem deadlock entre duas reservas.
  for v_chave in
    select distinct 'agenda:' || p_empresa_id || ':' || (e->>'profissional_id') || ':' || v_data
      from jsonb_array_elements(p_etapas) as e order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_chave, 0));
  end loop;

  select coalesce(buffer_min, 0) into v_buffer from public.empresas where id = p_empresa_id;

  for v_e in select e from jsonb_array_elements(p_etapas) as e loop
    v_i := v_i + 1;
    v_prof := (v_e->>'profissional_id')::uuid;
    v_serv := (v_e->>'servico_id')::uuid;
    v_hora := (v_e->>'horario')::time;
    v_dur := (v_e->>'duracao_min')::int;
    v_ini := extract(hour from v_hora)::int * 60 + extract(minute from v_hora)::int;
    v_fim := v_ini + v_dur;

    select jsonb_agg(jsonb_build_object('etapa', v_i, 'id', a.id, 'horario', a.horario, 'duracaoMin', a.duracao_min, 'status', a.status))
      into v_conflitos
    from public.agendamentos a
    where a.empresa_id = p_empresa_id
      and a.profissional_id = v_prof
      and a.data = v_data
      and a.status not in ('cancelado', 'no_show', 'reagendado')
      and (
        -- outros atendimentos: ocupação + higienização dos dois lados;
        (a.grupo_id is distinct from v_grupo
          and (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int) < v_fim + v_buffer
          and v_ini < (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int + a.duracao_min + v_buffer))
        -- etapas deste atendimento: só não podem se sobrepor.
        or (a.grupo_id = v_grupo
          and (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int) < v_fim
          and v_ini < (extract(hour from a.horario)::int * 60 + extract(minute from a.horario)::int + a.duracao_min))
      );
    if v_conflitos is not null then
      raise exception 'SCHEDULE_CONFLICT' using errcode = 'HS409', detail = v_conflitos::text;
    end if;

    insert into public.agendamentos (empresa_id, cliente_id, profissional_id, servico_id, data, horario, duracao_min, valor_centavos, status, grupo_id, grupo_seq, created_by)
    values (p_empresa_id, v_cli, v_prof, v_serv, v_data, v_hora, v_dur,
            coalesce(nullif(v_e->>'valor_centavos', '')::int, 0), 'agendado', v_grupo, v_i, p_created_by)
    returning * into v_row;
    v_out := v_out || to_jsonb(v_row);
  end loop;

  return jsonb_build_object('grupo_id', v_grupo, 'agendamentos', v_out);
end $$;

revoke all on function public.atendimento_criar(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.atendimento_criar(uuid, jsonb, uuid) to service_role;

commit;
