-- Rollback da migration 008. Restaura agendamento_criar da 007 (sem buffer)
-- e remove cargos, categorias e colunas novas.
-- ATENÇÃO: apaga cargos, categorias e os dados fiscais/régua da empresa.
-- Faça backup antes de executar em produção.

begin;

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
revoke all on function public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid) from public, anon, authenticated;
grant execute on function public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid) to service_role;

drop trigger if exists trg_servicos_categoria_mesma_empresa on servicos;
drop trigger if exists trg_profissionais_cargo_mesma_empresa on profissionais;
drop function if exists public.servico_categoria_mesma_empresa();
drop function if exists public.profissional_cargo_mesma_empresa();

alter table servicos drop constraint if exists servicos_modelo_heranca_valores;
alter table servicos drop column if exists modelo_heranca;
alter table servicos drop column if exists categoria_id;
drop table if exists servico_categorias;

alter table profissionais drop column if exists cargo_id;
drop table if exists cargos;

alter table empresas drop constraint if exists empresas_regua_faltas_ordem;
alter table empresas drop constraint if exists empresas_buffer_min_valores;
alter table empresas drop constraint if exists empresas_cnpj_formato;
alter table empresas drop column if exists regua_sinal_faltas;
alter table empresas drop column if exists regua_alerta_faltas;
alter table empresas drop column if exists buffer_min;
alter table empresas drop column if exists salao_parceiro;
alter table empresas drop column if exists razao_social;
alter table empresas drop column if exists cnpj;

commit;
