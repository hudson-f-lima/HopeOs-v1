-- Migration 026 — Escala e reserva sem corrida (D-056). Autorizada pelo Platform Owner em
-- 2026-11-17 ("Migração aprovada, se tudo ok merge"), a partir da proposta DRAFT do D-055.
-- Aplica em produção só no merge.
--
-- O backend confere a disponibilidade (escala, unidade, bloqueios) antes de gravar, fora da
-- transação. Uma mudança de escala que entrasse entre a conferência e a gravação deixava a reserva
-- em cima de um bloqueio. Agora o backend manda junto a versão da escala que leu (o maior `seq` de
-- disponibilidade_eventos da empresa, 023); agendamento_criar, sob a trava que o gatilho dos
-- eventos já usa, compara com a versão atual e recusa (HS412 ESCALA_MUDOU) se mudou. Toda mudança
-- de escala passa pelas funções que gravam evento (013/015/023), então a versão sobe sempre.
--
-- Só redefine agendamento_criar (mesma assinatura e mesmo corpo da 008) acrescentando a
-- conferência. Nada muda para quem não manda 'disp_versao'.
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
  v_buffer int;
  v_ini int;
  v_fim int;
  v_conflitos jsonb;
  v_row agendamentos%rowtype;
  v_versao bigint;
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

  -- 026 (D-056): a disponibilidade foi conferida no backend antes desta chamada. Se a escala mudou
  -- desde então (novo evento em disponibilidade_eventos), recusa sem gravar. A trava é a mesma que
  -- o gatilho de disponibilidade_eventos (023) usa: mudança de escala e reserva acontecem uma de
  -- cada vez. Sem 'disp_versao' (encaixe forçado ou chamadas antigas), segue como antes.
  if p_agendamento ? 'disp_versao' then
    perform pg_advisory_xact_lock(hashtextextended('disponibilidade_eventos:' || p_empresa_id::text, 0));
    select coalesce(max(seq), 0) into v_versao from disponibilidade_eventos where empresa_id = p_empresa_id;
    if v_versao <> coalesce(nullif(p_agendamento->>'disp_versao', '')::bigint, -1) then
      raise exception 'ESCALA_MUDOU' using errcode = 'HS412', detail = jsonb_build_object('versao', v_versao)::text;
    end if;
  end if;

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

revoke all on function public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid) from public, anon, authenticated;
grant execute on function public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid) to service_role;

commit;
