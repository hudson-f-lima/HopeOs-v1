-- Migration 027 — Agendamento público e remarcação atômicos (D-063). Autorizada pelo Platform
-- Owner em 2026-11-22 ("Iniciar a próxima onda", Onda 2 de docs/planning/BLUEPRINT_MASTER_V2_ANALISE.md).
-- Aplica em produção só no merge.
--
-- 1. chave_numero_br(text): mesma normalização do backend (ReminderEngine.normalizarWhatsapp +
--    publicBooking.chaveNumero): só dígitos, tira o 55 de quem tem 12/13 dígitos, exige DDD + 8/9
--    dígitos, devolve 55DDNNNNNNNNN e põe o 9 no celular antigo de 8 dígitos. Índice (não único)
--    por empresa + chave: achar cliente pelo número deixa de varrer a tabela.
--    SEM índice único, por decisão: a recepção cadastra de propósito mais de um cliente no mesmo
--    número (mãe e filho). Só a corrida do link público gerava duplicata por acidente.
-- 2. agendamento_publico_criar: trava por salão + número (pg_advisory_xact_lock), acha o cliente
--    ativo daquele número OU cria, chama agendamento_criar e grava o evento de origem, tudo na mesma
--    transação. Falha em qualquer passo desfaz tudo: não sobra cliente sem horário nem horário sem
--    evento. A trava vale entre instâncias do backend (a de antes era só em memória).
-- 3. agendamento_remarcar: trava a linha do original, confere o status (HS410 AGENDAMENTO_MUDOU),
--    cria o novo por agendamento_criar ignorando o original e marca o original "reagendado", na
--    mesma transação. Antes eram duas chamadas: uma falha entre elas deixava dois horários ativos.
-- Nada muda em agendamento_criar. Só service_role executa.
begin;

create or replace function public.chave_numero_br(p_numero text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  d text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  s text;
begin
  if d like '55%' and length(d) in (12, 13) then d := substr(d, 3); end if;
  if length(d) not in (10, 11) then return null; end if;
  s := '55' || d;
  if s ~ '^55[0-9]{2}[6-9][0-9]{7}$' then s := substr(s, 1, 4) || '9' || substr(s, 5); end if;
  return s;
end;
$$;

create index if not exists idx_clientes_empresa_chave_numero
  on public.clientes (empresa_id, public.chave_numero_br(whatsapp));

create or replace function public.agendamento_publico_criar(
  p_empresa_id uuid,
  p_numero text,
  p_cliente_id uuid,
  p_cliente_novo jsonb,
  p_agendamento jsonb,
  p_evento jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli uuid := p_cliente_id;
  v_criado boolean := false;
  v_concorrente boolean := false;
  v_nome text := btrim(coalesce(p_cliente_novo->>'nome', ''));
  v_ag jsonb;
  v_payload jsonb := coalesce(p_evento->'payload', '{}'::jsonb);
begin
  if p_empresa_id is null then raise exception 'empresa_id obrigatorio' using errcode = 'P0001'; end if;
  if p_numero is null or p_numero !~ '^55[0-9]{11}$' then raise exception 'numero invalido' using errcode = 'P0001'; end if;
  if coalesce(p_evento->>'tipo', '') = '' then raise exception 'tipo do evento obrigatorio' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('cliente_numero:' || p_empresa_id::text || ':' || p_numero, 0));

  if v_cli is not null then
    if not exists (select 1 from clientes where id = v_cli and empresa_id = p_empresa_id and ativo) then
      raise exception 'cliente nao encontrado: %', v_cli using errcode = 'P0001';
    end if;
  else
    -- Outro pedido do mesmo número pode ter criado o cliente entre a leitura do backend e esta
    -- trava: usa o mais antigo ativo em vez de criar outro.
    select id into v_cli from clientes
      where empresa_id = p_empresa_id and ativo and chave_numero_br(whatsapp) = p_numero
      order by created_at, id limit 1;
    if v_cli is not null then
      v_concorrente := true;
    else
      if length(v_nome) < 2 then raise exception 'nome obrigatorio' using errcode = 'P0001'; end if;
      insert into clientes (empresa_id, nome, whatsapp, ativo, observacoes, created_by)
        values (p_empresa_id, v_nome, p_numero, true, nullif(p_cliente_novo->>'observacoes', ''), null)
        returning id into v_cli;
      v_criado := true;
    end if;
  end if;

  v_ag := agendamento_criar(p_empresa_id, p_agendamento || jsonb_build_object('cliente_id', v_cli), false, null, null);

  if v_concorrente then v_payload := v_payload || jsonb_build_object('dedup', 'existente_concorrente'); end if;
  insert into agendamento_eventos (empresa_id, agendamento_id, tipo, payload, created_at)
    values (p_empresa_id, (v_ag->>'id')::uuid, p_evento->>'tipo', v_payload,
            coalesce(nullif(p_evento->>'created_at', '')::timestamptz, now()));

  return jsonb_build_object('agendamento', v_ag, 'cliente_id', v_cli, 'cliente_criado', v_criado, 'cliente_concorrente', v_concorrente);
end;
$$;

create or replace function public.agendamento_remarcar(
  p_empresa_id uuid,
  p_original_id uuid,
  p_de_status text[],
  p_agendamento jsonb,
  p_permitir_conflito boolean default false,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig agendamentos%rowtype;
  v_novo jsonb;
begin
  if p_empresa_id is null or p_original_id is null then raise exception 'empresa e agendamento obrigatorios' using errcode = 'P0001'; end if;
  if p_de_status is null or cardinality(p_de_status) = 0 then raise exception 'status de origem obrigatorio' using errcode = 'P0001'; end if;

  select * into v_orig from agendamentos where id = p_original_id and empresa_id = p_empresa_id for update;
  if not found then raise exception 'agendamento nao encontrado: %', p_original_id using errcode = 'P0001'; end if;
  if not (v_orig.status = any (p_de_status)) then
    raise exception 'AGENDAMENTO_MUDOU' using errcode = 'HS410', detail = jsonb_build_object('status', v_orig.status)::text;
  end if;

  -- O original ainda está ativo aqui: é ignorado na conferência de conflito.
  v_novo := agendamento_criar(p_empresa_id, p_agendamento, coalesce(p_permitir_conflito, false), p_original_id, p_created_by);

  update agendamentos set status = 'reagendado', updated_at = now(), updated_by = p_created_by
    where id = p_original_id and empresa_id = p_empresa_id
    returning * into v_orig;

  return jsonb_build_object('novo', v_novo, 'original', to_jsonb(v_orig));
end;
$$;

revoke all on function public.chave_numero_br(text) from public, anon, authenticated;
grant execute on function public.chave_numero_br(text) to service_role;
revoke all on function public.agendamento_publico_criar(uuid, text, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.agendamento_publico_criar(uuid, text, uuid, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.agendamento_remarcar(uuid, uuid, text[], jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.agendamento_remarcar(uuid, uuid, text[], jsonb, boolean, uuid) to service_role;

commit;
