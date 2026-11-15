-- Migration 013 — disponibilidade da unidade e escalas dos profissionais (D-033).
-- Autorizada pelo Platform Owner em 2026-11-15 ("Todas as recomendações aprovadas", sobre
-- docs/planning/DISPONIBILIDADE_ESCALAS.md). Aplica em produção só no merge.
--
-- Fonte única de horários depois desta migration:
-- 1. disponibilidade_semanal: períodos recorrentes da unidade (profissional_id nulo) e de
--    cada profissional. Vários períodos no dia = várias linhas; intervalo = espaço entre eles.
-- 2. disponibilidade_excecoes: horário excepcional (abertura ou alteração), fechamento
--    (integral ou parcial) da unidade; horário excepcional, ausência e bloqueio do profissional.
-- 3. profissionais.escala_publicada_em: sem escala publicada, o profissional não é oferecido.
-- 4. disponibilidade_eventos: trilha imutável (quem, quando, antes e depois, decisão sobre
--    agendamentos afetados).
-- A precedência e o cálculo ficam no backend (backend/src/engines/DisponibilidadeEngine.js).
-- Os jsonb antigos (empresas.horario_por_dia, almoço, profissionais.horario) são convertidos
-- aqui e deixam de ser lidos pelo cálculo.
begin;

create table if not exists public.disponibilidade_semanal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  unidade_id uuid null references public.unidades(id),
  profissional_id uuid null references public.profissionais(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  inicio time not null,
  fim time not null,
  a_cada_semanas smallint not null default 1 check (a_cada_semanas between 1 and 4),
  semana_ancora date null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  constraint ck_disp_semanal_periodo check (fim > inicio),
  constraint ck_disp_semanal_ancora check (a_cada_semanas = 1 or semana_ancora is not null)
);
create index if not exists ix_disp_semanal_alvo on public.disponibilidade_semanal (empresa_id, profissional_id, dia_semana);

create table if not exists public.disponibilidade_excecoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  unidade_id uuid null references public.unidades(id),
  profissional_id uuid null references public.profissionais(id) on delete cascade,
  tipo text not null check (tipo in ('horario', 'fechamento', 'ausencia', 'bloqueio')),
  data_inicio date not null,
  data_fim date not null,
  inicio time null,
  fim time null,
  motivo text null check (motivo is null or char_length(motivo) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  constraint ck_disp_exc_datas check (data_fim >= data_inicio and data_fim - data_inicio <= 366),
  constraint ck_disp_exc_horas check ((inicio is null and fim is null) or (inicio is not null and fim is not null and fim > inicio)),
  -- Unidade: horário excepcional ou fechamento. Profissional: horário excepcional, ausência, bloqueio.
  constraint ck_disp_exc_alvo check (
    (profissional_id is null and tipo in ('horario', 'fechamento'))
    or (profissional_id is not null and tipo in ('horario', 'ausencia', 'bloqueio'))
  ),
  -- Horário excepcional e bloqueio têm hora; ausência é o dia inteiro; fechamento, os dois.
  constraint ck_disp_exc_tipo_horas check (
    (tipo in ('horario', 'bloqueio') and inicio is not null)
    or (tipo = 'ausencia' and inicio is null)
    or tipo = 'fechamento'
  )
);
create index if not exists ix_disp_exc_periodo on public.disponibilidade_excecoes (empresa_id, data_inicio, data_fim);

alter table public.profissionais add column if not exists escala_publicada_em timestamptz null;
alter table public.profissionais add column if not exists escala_publicada_por uuid null references public.app_users(id);

create table if not exists public.disponibilidade_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  actor_id uuid not null references public.app_users(id),
  acao text not null check (acao in ('semanal_definir', 'excecao_criar', 'excecao_remover')),
  profissional_id uuid null references public.profissionais(id),
  antes jsonb not null default '[]'::jsonb,
  depois jsonb not null default '[]'::jsonb,
  decisoes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_disp_eventos on public.disponibilidade_eventos (empresa_id, created_at);
drop trigger if exists trg_ledger_imutavel on public.disponibilidade_eventos;
create trigger trg_ledger_imutavel before update or delete on public.disponibilidade_eventos
  for each row execute function public.ledger_imutavel();

-- ---------- Conversão dos horários antigos (comportamento preservado) ----------
-- Janela de um dia no jsonb antigo: { seg: { ativo, inicio, fim } } ou { 1: { start, end } }.
create or replace function public.disponibilidade_janela_legada(j jsonb, out ini int, out fim int)
language plpgsql immutable as $$
declare a text; b text;
begin
  ini := null; fim := null;
  if j is null or jsonb_typeof(j) <> 'object' or (j->>'ativo') = 'false' then return; end if;
  a := coalesce(j->>'inicio', j->>'start'); b := coalesce(j->>'fim', j->>'end');
  if a !~ '^\d{1,2}:\d{2}' or b !~ '^\d{1,2}:\d{2}' then return; end if;
  ini := split_part(a, ':', 1)::int * 60 + split_part(a, ':', 2)::int;
  fim := split_part(b, ':', 1)::int * 60 + split_part(b, ':', 2)::int;
  if fim <= ini or fim > 1440 then ini := null; fim := null; end if;
end $$;

create or replace function public.disponibilidade_hora(m int) returns time language sql immutable as
  $$ select make_time(least(m, 1439) / 60, least(m, 1439) % 60, 0) $$;

-- Converte as empresas que ainda não têm regra semanal. Chamada uma vez aqui; o gate a usa
-- para conferir a conversão com dados antigos.
create or replace function public.disponibilidade_converter_legado()
returns void language plpgsql set search_path = public as $$
declare
  e record; p record; d int;
  k text[] := array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  ej jsonb; pj jsonb; ew record; pw record; ai int; af int; pconf boolean; ini int; fim int;
begin
  for e in select * from public.empresas loop
    if exists (select 1 from public.disponibilidade_semanal where empresa_id = e.id) then continue; end if;
    ai := null; af := null;
    if e.intervalo_almoco and coalesce(e.almoco_inicio, '') ~ '^\d{1,2}:\d{2}' and coalesce(e.almoco_fim, '') ~ '^\d{1,2}:\d{2}' then
      ai := split_part(e.almoco_inicio, ':', 1)::int * 60 + split_part(e.almoco_inicio, ':', 2)::int;
      af := split_part(e.almoco_fim, ':', 1)::int * 60 + split_part(e.almoco_fim, ':', 2)::int;
      if af <= ai then ai := null; af := null; end if;
    end if;
    for d in 0..6 loop
      ej := coalesce(e.horario_por_dia -> k[d + 1], e.horario_por_dia -> d::text);
      select * into ew from public.disponibilidade_janela_legada(ej);
      if ew.ini is not null then
        -- Unidade: o almoço global vira intervalo (dois períodos).
        if ai is not null and ai < ew.fim and af > ew.ini then
          if ai > ew.ini then
            insert into public.disponibilidade_semanal (empresa_id, dia_semana, inicio, fim) values (e.id, d, public.disponibilidade_hora(ew.ini), public.disponibilidade_hora(ai));
          end if;
          if af < ew.fim then
            insert into public.disponibilidade_semanal (empresa_id, dia_semana, inicio, fim) values (e.id, d, public.disponibilidade_hora(af), public.disponibilidade_hora(ew.fim));
          end if;
        else
          insert into public.disponibilidade_semanal (empresa_id, dia_semana, inicio, fim) values (e.id, d, public.disponibilidade_hora(ew.ini), public.disponibilidade_hora(ew.fim));
        end if;
      end if;
      -- Profissionais: o horário que vale hoje para cada um (próprio ∩ empresa, ou o da empresa).
      for p in select * from public.profissionais where empresa_id = e.id loop
        pconf := p.horario is not null and jsonb_typeof(p.horario) = 'object' and p.horario <> '{}'::jsonb;
        pj := case when pconf then coalesce(p.horario -> k[d + 1], p.horario -> d::text) else null end;
        select * into pw from public.disponibilidade_janela_legada(pj);
        ini := null; fim := null;
        if pconf and pw.ini is null then
          null;
        elsif pw.ini is not null and ew.ini is not null then
          ini := greatest(pw.ini, ew.ini); fim := least(pw.fim, ew.fim);
        elsif pw.ini is not null then
          ini := pw.ini; fim := pw.fim;
        elsif ew.ini is not null then
          ini := ew.ini; fim := ew.fim;
        end if;
        if ini is not null and fim > ini then
          insert into public.disponibilidade_semanal (empresa_id, profissional_id, dia_semana, inicio, fim)
          values (e.id, p.id, d, public.disponibilidade_hora(ini), public.disponibilidade_hora(fim));
        end if;
      end loop;
    end loop;
    -- Dia em que a empresa não abria, mas um profissional tinha horário próprio: antes valia o
    -- horário dele (prof || empresa). A unidade passa a abrir nesse trecho, e só quem tem escala
    -- nesse dia atende (Red Team D-033).
    insert into public.disponibilidade_semanal (empresa_id, dia_semana, inicio, fim)
    select distinct e.id, s.dia_semana, s.inicio, s.fim
      from public.disponibilidade_semanal s
     where s.empresa_id = e.id and s.profissional_id is not null
       and not exists (select 1 from public.disponibilidade_semanal u
                        where u.empresa_id = e.id and u.profissional_id is null and u.dia_semana = s.dia_semana);
  end loop;
  -- Quem já existia continua disponível como hoje: escala publicada na conversão.
  update public.profissionais set escala_publicada_em = now() where escala_publicada_em is null;
end $$;

select public.disponibilidade_converter_legado();

-- ---------- Gravação: semanal (substitui) ----------
create or replace function public.disponibilidade_semanal_definir(
  p_empresa_id uuid, p_profissional_id uuid, p_periodos jsonb, p_publicar boolean, p_actor_id uuid, p_decisoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_depois jsonb;
begin
  if p_actor_id is null or not exists (select 1 from empresa_memberships where empresa_id = p_empresa_id and user_id = p_actor_id and status = 'ativo') then
    raise exception 'disponibilidade: ator sem vínculo ativo na empresa' using errcode = 'P0001';
  end if;
  if p_periodos is null or jsonb_typeof(p_periodos) <> 'array' or jsonb_array_length(p_periodos) > 100 then
    raise exception 'disponibilidade: períodos inválidos' using errcode = '22023';
  end if;
  -- Serializa alterações da mesma empresa.
  perform 1 from empresas where id = p_empresa_id for update;
  if p_profissional_id is not null then
    perform 1 from profissionais where id = p_profissional_id and empresa_id = p_empresa_id for update;
    if not found then raise exception 'disponibilidade: profissional não encontrado na empresa' using errcode = 'P0002'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('diaSemana', dia_semana, 'inicio', to_char(inicio, 'HH24:MI'), 'fim', to_char(fim, 'HH24:MI'), 'aCadaSemanas', a_cada_semanas, 'semanaAncora', semana_ancora) order by dia_semana, inicio), '[]'::jsonb)
    into v_antes from disponibilidade_semanal
   where empresa_id = p_empresa_id and profissional_id is not distinct from p_profissional_id;
  delete from disponibilidade_semanal where empresa_id = p_empresa_id and profissional_id is not distinct from p_profissional_id;
  insert into disponibilidade_semanal (empresa_id, profissional_id, dia_semana, inicio, fim, a_cada_semanas, semana_ancora, created_by)
  select p_empresa_id, p_profissional_id, (x->>'diaSemana')::smallint, (x->>'inicio')::time, (x->>'fim')::time,
         coalesce((x->>'aCadaSemanas')::smallint, 1), nullif(x->>'semanaAncora', '')::date, p_actor_id
    from jsonb_array_elements(p_periodos) as x;
  select coalesce(jsonb_agg(jsonb_build_object('diaSemana', dia_semana, 'inicio', to_char(inicio, 'HH24:MI'), 'fim', to_char(fim, 'HH24:MI'), 'aCadaSemanas', a_cada_semanas, 'semanaAncora', semana_ancora) order by dia_semana, inicio), '[]'::jsonb)
    into v_depois from disponibilidade_semanal
   where empresa_id = p_empresa_id and profissional_id is not distinct from p_profissional_id;
  if p_publicar and p_profissional_id is not null then
    update profissionais set escala_publicada_em = now(), escala_publicada_por = p_actor_id where id = p_profissional_id;
  end if;
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, antes, depois, decisoes)
  values (p_empresa_id, p_actor_id, 'semanal_definir', p_profissional_id, v_antes, v_depois, coalesce(p_decisoes, '[]'::jsonb));
  return jsonb_build_object('antes', v_antes, 'depois', v_depois);
end $$;

-- ---------- Gravação: exceções (cria várias de uma vez; remove uma) ----------
create or replace function public.disponibilidade_excecoes_criar(
  p_empresa_id uuid, p_excecoes jsonb, p_actor_id uuid, p_decisoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_depois jsonb; v_prof uuid;
begin
  if p_actor_id is null or not exists (select 1 from empresa_memberships where empresa_id = p_empresa_id and user_id = p_actor_id and status = 'ativo') then
    raise exception 'disponibilidade: ator sem vínculo ativo na empresa' using errcode = 'P0001';
  end if;
  if p_excecoes is null or jsonb_typeof(p_excecoes) <> 'array' or jsonb_array_length(p_excecoes) not between 1 and 50 then
    raise exception 'disponibilidade: exceções inválidas' using errcode = '22023';
  end if;
  perform 1 from empresas where id = p_empresa_id for update;
  if exists (select 1 from jsonb_array_elements(p_excecoes) x
              where nullif(x->>'profissionalId', '') is not null
                and not exists (select 1 from profissionais p where p.id = (x->>'profissionalId')::uuid and p.empresa_id = p_empresa_id)) then
    raise exception 'disponibilidade: profissional não encontrado na empresa' using errcode = 'P0002';
  end if;
  with ins as (
    insert into disponibilidade_excecoes (empresa_id, profissional_id, tipo, data_inicio, data_fim, inicio, fim, motivo, created_by)
    select p_empresa_id, nullif(x->>'profissionalId', '')::uuid, x->>'tipo', (x->>'dataInicio')::date, (x->>'dataFim')::date,
           nullif(x->>'inicio', '')::time, nullif(x->>'fim', '')::time, nullif(x->>'motivo', ''), p_actor_id
      from jsonb_array_elements(p_excecoes) as x
    returning *
  )
  select array_agg(id), jsonb_agg(to_jsonb(ins) - 'empresa_id'), min(profissional_id::text)::uuid into v_ids, v_depois, v_prof from ins;
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, antes, depois, decisoes)
  values (p_empresa_id, p_actor_id, 'excecao_criar', v_prof, '[]'::jsonb, v_depois, coalesce(p_decisoes, '[]'::jsonb));
  return jsonb_build_object('ids', to_jsonb(v_ids), 'depois', v_depois);
end $$;

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
  delete from disponibilidade_excecoes where id = p_id and empresa_id = p_empresa_id returning * into v_row;
  if not found then raise exception 'disponibilidade: exceção não encontrada na empresa' using errcode = 'P0002'; end if;
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, antes, depois, decisoes)
  values (p_empresa_id, p_actor_id, 'excecao_remover', v_row.profissional_id, jsonb_build_array(to_jsonb(v_row) - 'empresa_id'), '[]'::jsonb, coalesce(p_decisoes, '[]'::jsonb));
  return jsonb_build_object('removida', to_jsonb(v_row) - 'empresa_id');
end $$;

-- ---------- Acesso (padrão 007/010/012): nada para anon/authenticated ----------
revoke all on table public.disponibilidade_semanal, public.disponibilidade_excecoes, public.disponibilidade_eventos from public, anon, authenticated;
alter table public.disponibilidade_semanal enable row level security;
alter table public.disponibilidade_excecoes enable row level security;
alter table public.disponibilidade_eventos enable row level security;
grant select on table public.disponibilidade_semanal, public.disponibilidade_excecoes to service_role;
revoke insert, update, delete, truncate on table public.disponibilidade_semanal, public.disponibilidade_excecoes from service_role;
revoke update, delete, truncate on table public.disponibilidade_eventos from service_role;
grant select on table public.disponibilidade_eventos to service_role;

revoke all on function public.disponibilidade_semanal_definir(uuid, uuid, jsonb, boolean, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.disponibilidade_excecoes_criar(uuid, jsonb, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.disponibilidade_semanal_definir(uuid, uuid, jsonb, boolean, uuid, jsonb) to service_role;
grant execute on function public.disponibilidade_excecoes_criar(uuid, jsonb, uuid, jsonb) to service_role;
grant execute on function public.disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb) to service_role;
revoke all on function public.disponibilidade_converter_legado() from public, anon, authenticated, service_role;
revoke all on function public.disponibilidade_janela_legada(jsonb) from public, anon, authenticated;
revoke all on function public.disponibilidade_hora(int) from public, anon, authenticated;

commit;
