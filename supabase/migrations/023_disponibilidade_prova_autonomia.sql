-- Migration 023 — Prova de autonomia do profissional-parceiro (D-046, Onda 1). Autorizada pelo
-- Platform Owner em 2026-11-16 ("2. aprovado"). Aplica em produção só no merge.
--
--   Trilha encadeada   disponibilidade_eventos ganha seq, origem e corrente de hash (SHA-256): cada
--                      evento guarda o hash do anterior; mudar, apagar do meio ou inserir por fora
--                      quebra a conferência (disponibilidade_cadeia_conferir). Os eventos de antes
--                      da 023 não são alterados: o primeiro elo guarda o hash de todos eles.
--                      Hora e origem (o próprio profissional ou a equipe) são do servidor, nunca de
--                      quem chama. TRUNCATE passa a ser barrado como UPDATE e DELETE.
--   Encurtar           disponibilidade_excecao_encurtar: bloqueio ou ausência do profissional fica
--                      menor (mesmo id, antes e depois na trilha). Só dentro do original.
--   Aceite da escala   disponibilidade_escala_aceitar: o profissional aceita a última escala
--                      semanal definida para ele (comum acordo); o aceite guarda o que foi aceito.
--   Defesa no banco    o que o profissional marcou só ele remove ou encurta (D-046), também aqui,
--                      além do backend.
begin;

-- ---------- 1. Trilha encadeada ----------
alter table public.disponibilidade_eventos add column if not exists origem text null;
alter table public.disponibilidade_eventos add column if not exists seq bigint null;
alter table public.disponibilidade_eventos add column if not exists hash_anterior text null;
alter table public.disponibilidade_eventos add column if not exists hash text null;
alter table public.disponibilidade_eventos drop constraint if exists ck_disp_eventos_origem;
alter table public.disponibilidade_eventos add constraint ck_disp_eventos_origem check (origem is null or origem in ('profissional', 'equipe'));
alter table public.disponibilidade_eventos drop constraint if exists disponibilidade_eventos_acao_check;
alter table public.disponibilidade_eventos drop constraint if exists ck_disp_eventos_acao;
alter table public.disponibilidade_eventos add constraint ck_disp_eventos_acao
  check (acao in ('semanal_definir', 'excecao_criar', 'excecao_remover', 'excecao_encurtar', 'semanal_aceitar'));
create unique index if not exists ux_disp_eventos_seq on public.disponibilidade_eventos (empresa_id, seq) where seq is not null;
create index if not exists ix_disp_eventos_prof on public.disponibilidade_eventos (empresa_id, profissional_id, acao);

-- Texto canônico de um evento (o que entra no hash). Hora em UTC com microssegundos.
create or replace function public.disponibilidade_evento_texto(e public.disponibilidade_eventos)
returns text language sql stable set search_path = public as $$
  select concat_ws('|', e.id::text, e.empresa_id::text, e.actor_id::text, e.acao, coalesce(e.profissional_id::text, ''),
    e.antes::text, e.depois::text, e.decisoes::text,
    to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(e.origem, ''), coalesce(e.seq::text, ''), coalesce(e.hash_anterior, ''))
$$;

-- Hash de todos os eventos sem seq (os de antes da 023): é o "elo zero" da corrente.
create or replace function public.disponibilidade_cadeia_base(p_empresa_id uuid)
returns text language sql stable set search_path = public as $$
  select encode(sha256(convert_to('base|' || p_empresa_id::text || '|'
    || coalesce(string_agg(disponibilidade_evento_texto(e), E'\n' order by e.created_at, e.id), ''), 'UTF8')), 'hex')
    from disponibilidade_eventos e where e.empresa_id = p_empresa_id and e.seq is null
$$;

create or replace function public.disponibilidade_evento_encadear()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seq bigint; v_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('disponibilidade_eventos:' || new.empresa_id::text, 0));
  new.created_at := now();
  new.origem := case
    when new.profissional_id is not null and exists (
      select 1 from empresa_memberships m
       where m.empresa_id = new.empresa_id and m.user_id = new.actor_id and m.profissional_id = new.profissional_id)
    then 'profissional' else 'equipe' end;
  select e.seq, e.hash into v_seq, v_hash from disponibilidade_eventos e
   where e.empresa_id = new.empresa_id and e.seq is not null order by e.seq desc limit 1;
  if v_seq is null then
    new.seq := 1;
    new.hash_anterior := disponibilidade_cadeia_base(new.empresa_id);
  else
    new.seq := v_seq + 1;
    new.hash_anterior := v_hash;
  end if;
  new.hash := encode(sha256(convert_to(disponibilidade_evento_texto(new), 'UTF8')), 'hex');
  return new;
end $$;
drop trigger if exists trg_disp_eventos_encadear on public.disponibilidade_eventos;
create trigger trg_disp_eventos_encadear before insert on public.disponibilidade_eventos
  for each row execute function public.disponibilidade_evento_encadear();
drop trigger if exists trg_ledger_imutavel_truncate on public.disponibilidade_eventos;
create trigger trg_ledger_imutavel_truncate before truncate on public.disponibilidade_eventos
  for each statement execute function public.ledger_imutavel();

-- Confere a corrente inteira da empresa. Devolve o último elo (para guardar fora do sistema).
create or replace function public.disponibilidade_cadeia_conferir(p_empresa_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e disponibilidade_eventos%rowtype; v_prev text; v_n bigint := 0; v_legado bigint;
begin
  select count(*) into v_legado from disponibilidade_eventos where empresa_id = p_empresa_id and seq is null;
  v_prev := disponibilidade_cadeia_base(p_empresa_id);
  for e in select * from disponibilidade_eventos where empresa_id = p_empresa_id and seq is not null order by seq loop
    v_n := v_n + 1;
    if e.seq <> v_n then
      return jsonb_build_object('ok', false, 'total', v_n - 1, 'legado', v_legado, 'quebraEm', v_n, 'eventoId', e.id, 'motivo', 'falta um evento na sequência');
    end if;
    if e.hash_anterior is distinct from v_prev then
      return jsonb_build_object('ok', false, 'total', v_n - 1, 'legado', v_legado, 'quebraEm', e.seq, 'eventoId', e.id,
        'motivo', case when e.seq = 1 then 'eventos anteriores à corrente foram alterados' else 'o elo com o evento anterior não confere' end);
    end if;
    if e.hash is distinct from encode(sha256(convert_to(disponibilidade_evento_texto(e), 'UTF8')), 'hex') then
      return jsonb_build_object('ok', false, 'total', v_n - 1, 'legado', v_legado, 'quebraEm', e.seq, 'eventoId', e.id, 'motivo', 'o conteúdo do evento foi alterado');
    end if;
    v_prev := e.hash;
  end loop;
  return jsonb_build_object('ok', true, 'total', v_n, 'legado', v_legado, 'ultimoSeq', v_n, 'ultimoHash', case when v_n > 0 then v_prev end);
end $$;

-- ---------- 2. Quem marcou: o que o profissional marcou é dele ----------
create or replace function public.disponibilidade_excecao_do_profissional(p_empresa_id uuid, x public.disponibilidade_excecoes)
returns boolean language sql stable set search_path = public as $$
  select x.profissional_id is not null and x.tipo in ('bloqueio', 'ausencia') and x.created_by is not null
     and exists (select 1 from empresa_memberships m where m.empresa_id = p_empresa_id and m.user_id = x.created_by and m.profissional_id = x.profissional_id)
$$;
create or replace function public.disponibilidade_ator_e_o_profissional(p_empresa_id uuid, p_actor_id uuid, p_profissional_id uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from empresa_memberships m where m.empresa_id = p_empresa_id and m.user_id = p_actor_id and m.profissional_id = p_profissional_id and m.status = 'ativo')
$$;

-- Remover (013) com a defesa do D-046. Mesma assinatura e mesmo retorno.
create or replace function public.disponibilidade_excecao_remover(
  p_empresa_id uuid, p_id uuid, p_actor_id uuid, p_decisoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row disponibilidade_excecoes%rowtype;
begin
  if p_actor_id is null or not exists (select 1 from empresa_memberships where empresa_id = p_empresa_id and user_id = p_actor_id and status = 'ativo') then
    raise exception 'disponibilidade: ator sem vínculo ativo na empresa' using errcode = 'P0001';
  end if;
  perform 1 from empresas where id = p_empresa_id for update;
  select * into v_row from disponibilidade_excecoes where id = p_id and empresa_id = p_empresa_id for update;
  if not found then raise exception 'disponibilidade: exceção não encontrada na empresa' using errcode = 'P0002'; end if;
  if disponibilidade_excecao_do_profissional(p_empresa_id, v_row) and not disponibilidade_ator_e_o_profissional(p_empresa_id, p_actor_id, v_row.profissional_id) then
    raise exception 'Este bloqueio foi marcado pelo próprio profissional: só ele pode remover.' using errcode = 'P0001';
  end if;
  delete from disponibilidade_excecoes where id = p_id and empresa_id = p_empresa_id;
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, antes, depois, decisoes)
  values (p_empresa_id, p_actor_id, 'excecao_remover', v_row.profissional_id, jsonb_build_array(to_jsonb(v_row) - 'empresa_id'), '[]'::jsonb, coalesce(p_decisoes, '[]'::jsonb));
  return jsonb_build_object('removida', to_jsonb(v_row) - 'empresa_id');
end $$;

-- ---------- 3. Encurtar ----------
create or replace function public.disponibilidade_excecao_encurtar(
  p_empresa_id uuid, p_id uuid, p_data_inicio date, p_data_fim date, p_inicio time, p_fim time, p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_old disponibilidade_excecoes%rowtype; v_new disponibilidade_excecoes%rowtype;
begin
  if p_actor_id is null or not exists (select 1 from empresa_memberships where empresa_id = p_empresa_id and user_id = p_actor_id and status = 'ativo') then
    raise exception 'disponibilidade: ator sem vínculo ativo na empresa' using errcode = 'P0001';
  end if;
  perform 1 from empresas where id = p_empresa_id for update;
  select * into v_old from disponibilidade_excecoes where id = p_id and empresa_id = p_empresa_id for update;
  if not found then raise exception 'disponibilidade: exceção não encontrada na empresa' using errcode = 'P0002'; end if;
  if v_old.profissional_id is null or v_old.tipo not in ('bloqueio', 'ausencia') then
    raise exception 'Só bloqueio ou ausência de profissional pode ser encurtado.' using errcode = 'P0001';
  end if;
  if disponibilidade_excecao_do_profissional(p_empresa_id, v_old) and not disponibilidade_ator_e_o_profissional(p_empresa_id, p_actor_id, v_old.profissional_id) then
    raise exception 'Este bloqueio foi marcado pelo próprio profissional: só ele pode encurtar.' using errcode = 'P0001';
  end if;
  if p_data_inicio is null or p_data_fim is null or p_data_fim < p_data_inicio
     or p_data_inicio < v_old.data_inicio or p_data_fim > v_old.data_fim then
    raise exception 'Encurtar: as datas precisam ficar dentro das do bloqueio original.' using errcode = 'P0001';
  end if;
  if v_old.tipo = 'bloqueio' then
    if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_inicio < v_old.inicio or p_fim > v_old.fim then
      raise exception 'Encurtar: o horário precisa ficar dentro do bloqueio original.' using errcode = 'P0001';
    end if;
  elsif p_inicio is not null or p_fim is not null then
    raise exception 'Ausência é o dia inteiro: encurte pelas datas.' using errcode = 'P0001';
  end if;
  if p_data_inicio = v_old.data_inicio and p_data_fim = v_old.data_fim and p_inicio is not distinct from v_old.inicio and p_fim is not distinct from v_old.fim then
    raise exception 'Encurtar: nada mudou.' using errcode = 'P0001';
  end if;
  update disponibilidade_excecoes set data_inicio = p_data_inicio, data_fim = p_data_fim, inicio = p_inicio, fim = p_fim
   where id = p_id and empresa_id = p_empresa_id returning * into v_new;
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, antes, depois)
  values (p_empresa_id, p_actor_id, 'excecao_encurtar', v_old.profissional_id,
          jsonb_build_array(to_jsonb(v_old) - 'empresa_id'), jsonb_build_array(to_jsonb(v_new) - 'empresa_id'));
  return jsonb_build_object('antes', to_jsonb(v_old) - 'empresa_id', 'depois', to_jsonb(v_new) - 'empresa_id');
end $$;

-- ---------- 4. Aceite da escala semanal ----------
-- Só o próprio profissional aceita, e só a última escala definida para ele (p_evento_id): se a
-- gestão mudou a escala depois que ele abriu a tela, o aceite é recusado e ele revê.
create or replace function public.disponibilidade_escala_aceitar(
  p_empresa_id uuid, p_profissional_id uuid, p_actor_id uuid, p_evento_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ult disponibilidade_eventos%rowtype; v_ja uuid; v_depois jsonb;
begin
  if p_actor_id is null or not disponibilidade_ator_e_o_profissional(p_empresa_id, p_actor_id, p_profissional_id) then
    raise exception 'Só o próprio profissional aceita a escala dele.' using errcode = 'P0001';
  end if;
  perform 1 from empresas where id = p_empresa_id for update;
  select * into v_ult from disponibilidade_eventos
   where empresa_id = p_empresa_id and profissional_id = p_profissional_id and acao = 'semanal_definir'
   order by seq desc nulls last, created_at desc, id desc limit 1;
  if not found then raise exception 'Ainda não há escala definida para aceitar.' using errcode = 'P0001'; end if;
  if v_ult.id <> p_evento_id then
    raise exception 'A escala mudou depois que você abriu a tela. Confira a nova e aceite de novo.' using errcode = 'P0001';
  end if;
  select id into v_ja from disponibilidade_eventos
   where empresa_id = p_empresa_id and profissional_id = p_profissional_id and acao = 'semanal_aceitar'
     and depois->0->>'eventoId' = p_evento_id::text limit 1;
  if v_ja is not null then
    return jsonb_build_object('eventoAceite', v_ja, 'jaAceita', true);
  end if;
  v_depois := jsonb_build_array(jsonb_build_object('eventoId', v_ult.id, 'hashEscala', v_ult.hash, 'periodos', v_ult.depois));
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, antes, depois)
  values (p_empresa_id, p_actor_id, 'semanal_aceitar', p_profissional_id, '[]'::jsonb, v_depois)
  returning id into v_ja;
  return jsonb_build_object('eventoAceite', v_ja, 'jaAceita', false);
end $$;

-- ---------- Acesso (padrão 007/013): nada para anon/authenticated ----------
revoke all on function public.disponibilidade_evento_texto(public.disponibilidade_eventos) from public, anon, authenticated;
revoke all on function public.disponibilidade_cadeia_base(uuid) from public, anon, authenticated;
revoke all on function public.disponibilidade_evento_encadear() from public, anon, authenticated;
revoke all on function public.disponibilidade_cadeia_conferir(uuid) from public, anon, authenticated;
revoke all on function public.disponibilidade_excecao_do_profissional(uuid, public.disponibilidade_excecoes) from public, anon, authenticated;
revoke all on function public.disponibilidade_ator_e_o_profissional(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.disponibilidade_excecao_encurtar(uuid, uuid, date, date, time, time, uuid) from public, anon, authenticated;
revoke all on function public.disponibilidade_escala_aceitar(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.disponibilidade_cadeia_conferir(uuid) to service_role;
grant execute on function public.disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.disponibilidade_excecao_encurtar(uuid, uuid, date, date, time, time, uuid) to service_role;
grant execute on function public.disponibilidade_escala_aceitar(uuid, uuid, uuid, uuid) to service_role;

commit;
