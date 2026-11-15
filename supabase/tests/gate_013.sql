-- Gate SQL da migration 013 (disponibilidade e escalas, D-033). Transação desfeita no final.
\set ON_ERROR_STOP 1
begin;
set local client_min_messages = warning;

create function pg_temp.erro_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

insert into empresas (id, nome, horario_por_dia, intervalo_almoco, almoco_inicio, almoco_fim) values
  ('e1300000-0000-4000-8000-00000000000a', 'Empresa A',
   '{"seg": {"ativo": true, "inicio": "09:00", "fim": "18:00"}, "dom": {"ativo": false, "inicio": "09:00", "fim": "12:00"}}', true, '12:00', '13:00'),
  ('e1300000-0000-4000-8000-00000000000b', 'Empresa B', '{"3": {"start": "08:00", "end": "12:00"}}', false, null, null);
insert into profissionais (id, empresa_id, nome, horario) values
  ('a1300000-0000-4000-8000-0000000000a1', 'e1300000-0000-4000-8000-00000000000a', 'Herda', '{}'),
  ('a1300000-0000-4000-8000-0000000000a2', 'e1300000-0000-4000-8000-00000000000a', 'Própria',
   '{"seg": {"ativo": true, "inicio": "10:00", "fim": "20:00"}, "ter": {"ativo": true, "inicio": "10:00", "fim": "14:00"}}'),
  ('a1300000-0000-4000-8000-0000000000b1', 'e1300000-0000-4000-8000-00000000000b', 'Outra empresa', '{}');
insert into app_users (id, email, nome) values
  ('c1300000-0000-4000-8000-0000000000a1', 'adm-a@t', 'Admin A'),
  ('c1300000-0000-4000-8000-0000000000b1', 'adm-b@t', 'Admin B');
insert into empresa_memberships (id, empresa_id, user_id, role) values
  ('d1300000-0000-4000-8000-0000000000a1', 'e1300000-0000-4000-8000-00000000000a', 'c1300000-0000-4000-8000-0000000000a1', 'admin'),
  ('d1300000-0000-4000-8000-0000000000b1', 'e1300000-0000-4000-8000-00000000000b', 'c1300000-0000-4000-8000-0000000000b1', 'admin');

create function pg_temp.periodos(p_emp uuid, p_prof uuid, p_dia int) returns text language sql as $$
  select coalesce(string_agg(to_char(inicio, 'HH24:MI') || '-' || to_char(fim, 'HH24:MI'), ',' order by inicio), '')
    from disponibilidade_semanal where empresa_id = p_emp and profissional_id is not distinct from p_prof and dia_semana = p_dia
$$;

-- 1. Conversão dos horários antigos preserva o comportamento atual.
do $$ begin
  perform disponibilidade_converter_legado();
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', null, 1) <> '09:00-12:00,13:00-18:00' then
    raise exception 'gate_013 bloco 1: almoço não virou intervalo da unidade: %', pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', null, 1);
  end if;
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', null, 0) <> '' then
    raise exception 'gate_013 bloco 1: domingo desligado virou horário';
  end if;
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a1', 1) <> '09:00-18:00' then
    raise exception 'gate_013 bloco 1: profissional sem horário próprio não herdou o da empresa';
  end if;
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a2', 1) <> '10:00-18:00'
     or pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a2', 2) <> '10:00-14:00'
     or pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a2', 3) <> '' then
    raise exception 'gate_013 bloco 1: horário próprio convertido errado';
  end if;
  -- Terça: a empresa não abria, mas a profissional tinha horário próprio (valia o dela).
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', null, 2) <> '10:00-14:00' then
    raise exception 'gate_013 bloco 1: dia só do profissional não abriu a unidade: %', pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', null, 2);
  end if;
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000b', null, 3) <> '08:00-12:00' then
    raise exception 'gate_013 bloco 1: formato numérico { 3: { start, end } } não convertido';
  end if;
  if exists (select 1 from profissionais where id::text like 'a13%' and escala_publicada_em is null) then
    raise exception 'gate_013 bloco 1: profissional existente ficou sem escala publicada';
  end if;
  -- Controle negativo: converter de novo não duplica.
  perform disponibilidade_converter_legado();
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', null, 1) <> '09:00-12:00,13:00-18:00' then
    raise exception 'gate_013 bloco 1: conversão duplicou regras';
  end if;
end $$;

-- 2. Regras de forma: combinações inválidas recusadas; válidas passam.
do $$ declare q text; begin
  foreach q in array array[
    $q$insert into disponibilidade_semanal (empresa_id, dia_semana, inicio, fim) values ('e1300000-0000-4000-8000-00000000000a', 1, '12:00', '11:00')$q$,
    $q$insert into disponibilidade_semanal (empresa_id, dia_semana, inicio, fim) values ('e1300000-0000-4000-8000-00000000000a', 7, '08:00', '09:00')$q$,
    $q$insert into disponibilidade_semanal (empresa_id, dia_semana, inicio, fim, a_cada_semanas) values ('e1300000-0000-4000-8000-00000000000a', 1, '08:00', '09:00', 2)$q$,
    $q$insert into disponibilidade_excecoes (empresa_id, tipo, data_inicio, data_fim) values ('e1300000-0000-4000-8000-00000000000a', 'ausencia', '2026-12-25', '2026-12-25')$q$,
    $q$insert into disponibilidade_excecoes (empresa_id, profissional_id, tipo, data_inicio, data_fim) values ('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a1', 'fechamento', '2026-12-25', '2026-12-25')$q$,
    $q$insert into disponibilidade_excecoes (empresa_id, profissional_id, tipo, data_inicio, data_fim, inicio, fim) values ('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a1', 'ausencia', '2026-12-25', '2026-12-25', '08:00', '09:00')$q$,
    $q$insert into disponibilidade_excecoes (empresa_id, profissional_id, tipo, data_inicio, data_fim) values ('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a1', 'bloqueio', '2026-12-25', '2026-12-25')$q$,
    $q$insert into disponibilidade_excecoes (empresa_id, tipo, data_inicio, data_fim) values ('e1300000-0000-4000-8000-00000000000a', 'fechamento', '2026-12-25', '2026-12-24')$q$
  ] loop
    if pg_temp.erro_de(q) is null then raise exception 'gate_013 bloco 2: regra inválida aceita: %', q; end if;
  end loop;
  if pg_temp.erro_de($q$insert into disponibilidade_excecoes (empresa_id, tipo, data_inicio, data_fim) values ('e1300000-0000-4000-8000-00000000000a', 'fechamento', '2026-12-25', '2026-12-25')$q$) is not null then
    raise exception 'gate_013 bloco 2: controle negativo falhou (fechamento integral válido recusado)';
  end if;
  delete from disponibilidade_excecoes where empresa_id = 'e1300000-0000-4000-8000-00000000000a';
end $$;

-- 3. Semanal pela função: substitui, publica e registra antes e depois.
do $$ declare r jsonb; begin
  update profissionais set escala_publicada_em = null where id = 'a1300000-0000-4000-8000-0000000000a1';
  r := disponibilidade_semanal_definir('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a1',
    '[{"diaSemana": 0, "inicio": "08:00", "fim": "12:00"}, {"diaSemana": 0, "inicio": "13:00", "fim": "16:00"}]', true,
    'c1300000-0000-4000-8000-0000000000a1', '[]');
  if pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a1', 0) <> '08:00-12:00,13:00-16:00'
     or pg_temp.periodos('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000a1', 1) <> '' then
    raise exception 'gate_013 bloco 3: substituição errada';
  end if;
  if (select escala_publicada_em from profissionais where id = 'a1300000-0000-4000-8000-0000000000a1') is null then
    raise exception 'gate_013 bloco 3: escala não publicada';
  end if;
  if (select count(*) from disponibilidade_eventos where acao = 'semanal_definir' and profissional_id = 'a1300000-0000-4000-8000-0000000000a1'
        and jsonb_array_length(antes) >= 1 and jsonb_array_length(depois) = 2) <> 1 then
    raise exception 'gate_013 bloco 3: trilha sem antes/depois';
  end if;
  if pg_temp.erro_de($q$select disponibilidade_semanal_definir('e1300000-0000-4000-8000-00000000000a', 'a1300000-0000-4000-8000-0000000000b1', '[]', false, 'c1300000-0000-4000-8000-0000000000a1', '[]')$q$) is null then
    raise exception 'gate_013 bloco 3: profissional de outra empresa aceito';
  end if;
  if pg_temp.erro_de($q$select disponibilidade_semanal_definir('e1300000-0000-4000-8000-00000000000a', null, '[]', false, 'c1300000-0000-4000-8000-0000000000b1', '[]')$q$) is null then
    raise exception 'gate_013 bloco 3: ator de outra empresa aceito';
  end if;
  if pg_temp.erro_de($q$select disponibilidade_semanal_definir('e1300000-0000-4000-8000-00000000000a', null, '[{"diaSemana": 1, "inicio": "10:00", "fim": "09:00"}]', false, 'c1300000-0000-4000-8000-0000000000a1', '[]')$q$) is null then
    raise exception 'gate_013 bloco 3: período inválido aceito pela função';
  end if;
end $$;

-- 4. Exceções: cria várias de uma vez, remove uma, com trilha; outra empresa recusada.
do $$ declare r jsonb; v_id uuid; begin
  r := disponibilidade_excecoes_criar('e1300000-0000-4000-8000-00000000000a',
    '[{"tipo": "horario", "dataInicio": "2026-11-22", "dataFim": "2026-11-22", "inicio": "08:00", "fim": "16:00", "motivo": "Domingo excepcional"},
      {"tipo": "horario", "profissionalId": "a1300000-0000-4000-8000-0000000000a2", "dataInicio": "2026-11-22", "dataFim": "2026-11-22", "inicio": "10:00", "fim": "12:00"}]',
    'c1300000-0000-4000-8000-0000000000a1', '[{"agendamentoId": "x", "decisao": "manter"}]');
  if jsonb_array_length(r->'ids') <> 2 then raise exception 'gate_013 bloco 4: criação errada: %', r; end if;
  v_id := (r->'ids'->>0)::uuid;
  perform disponibilidade_excecao_remover('e1300000-0000-4000-8000-00000000000a', v_id, 'c1300000-0000-4000-8000-0000000000a1', '[]');
  if exists (select 1 from disponibilidade_excecoes where id = v_id) then raise exception 'gate_013 bloco 4: exceção não removida'; end if;
  if (select count(*) from disponibilidade_eventos where acao in ('excecao_criar', 'excecao_remover')) <> 2
     or not exists (select 1 from disponibilidade_eventos where acao = 'excecao_criar' and decisoes->0->>'decisao' = 'manter') then
    raise exception 'gate_013 bloco 4: trilha das exceções errada';
  end if;
  if pg_temp.erro_de($q$select disponibilidade_excecoes_criar('e1300000-0000-4000-8000-00000000000a', '[{"tipo": "ausencia", "profissionalId": "a1300000-0000-4000-8000-0000000000b1", "dataInicio": "2026-11-22", "dataFim": "2026-11-22"}]', 'c1300000-0000-4000-8000-0000000000a1', '[]')$q$) is null then
    raise exception 'gate_013 bloco 4: profissional de outra empresa aceito';
  end if;
  if pg_temp.erro_de(format($q$select disponibilidade_excecao_remover('e1300000-0000-4000-8000-00000000000b', %L, 'c1300000-0000-4000-8000-0000000000b1', '[]')$q$, (r->'ids'->>1))) is null then
    raise exception 'gate_013 bloco 4: exceção removida por outra empresa';
  end if;
end $$;

-- 5. Trilha imutável; controle negativo: sem a trava, o UPDATE passaria.
do $$ begin
  if pg_temp.erro_de($q$update disponibilidade_eventos set acao = 'excecao_remover'$q$) is null then
    raise exception 'gate_013 bloco 5: evento alterado';
  end if;
  if pg_temp.erro_de($q$delete from disponibilidade_eventos$q$) is null then
    raise exception 'gate_013 bloco 5: evento apagado';
  end if;
  alter table disponibilidade_eventos disable trigger trg_ledger_imutavel;
  if pg_temp.erro_de($q$update disponibilidade_eventos set acao = acao$q$) is not null then
    raise exception 'gate_013 bloco 5: controle negativo falhou';
  end if;
  alter table disponibilidade_eventos enable trigger trg_ledger_imutavel;
end $$;

-- 6. Acesso: anon e authenticated não leem nem chamam; o backend só grava pelas funções.
do $$ begin
  if has_table_privilege('anon', 'disponibilidade_semanal', 'select') or has_table_privilege('authenticated', 'disponibilidade_excecoes', 'select')
     or has_table_privilege('authenticated', 'disponibilidade_eventos', 'select') then
    raise exception 'gate_013 bloco 6: tabela exposta';
  end if;
  if has_table_privilege('service_role', 'disponibilidade_semanal', 'insert') or has_table_privilege('service_role', 'disponibilidade_excecoes', 'delete')
     or has_table_privilege('service_role', 'disponibilidade_eventos', 'update') then
    raise exception 'gate_013 bloco 6: backend grava sem passar pela função';
  end if;
  if not has_table_privilege('service_role', 'disponibilidade_semanal', 'select')
     or not has_function_privilege('service_role', 'disponibilidade_excecoes_criar(uuid, jsonb, uuid, jsonb)', 'execute') then
    raise exception 'gate_013 bloco 6: backend sem leitura ou sem a função';
  end if;
  if has_function_privilege('anon', 'disponibilidade_semanal_definir(uuid, uuid, jsonb, boolean, uuid, jsonb)', 'execute')
     or has_function_privilege('service_role', 'disponibilidade_converter_legado()', 'execute') then
    raise exception 'gate_013 bloco 6: função exposta';
  end if;
end $$;

rollback;
\echo gate_013 OK (6 blocos)
