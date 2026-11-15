-- Gate SQL da migration 015 (escalas em lote e modelos, D-035). Transação desfeita no final.
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

insert into empresas (id, nome) values
  ('e1500000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e1500000-0000-4000-8000-00000000000b', 'Empresa B');
insert into profissionais (id, empresa_id, nome) values
  ('a1500000-0000-4000-8000-0000000000a1', 'e1500000-0000-4000-8000-00000000000a', 'Ana'),
  ('a1500000-0000-4000-8000-0000000000a2', 'e1500000-0000-4000-8000-00000000000a', 'Bia'),
  ('a1500000-0000-4000-8000-0000000000b1', 'e1500000-0000-4000-8000-00000000000b', 'Outra');
insert into app_users (id, email, nome) values ('c1500000-0000-4000-8000-0000000000a1', 'adm15@t', 'Admin');
insert into empresa_memberships (id, empresa_id, user_id, role) values
  ('d1500000-0000-4000-8000-0000000000a1', 'e1500000-0000-4000-8000-00000000000a', 'c1500000-0000-4000-8000-0000000000a1', 'admin');

-- 1. Lote: duas escalas e exceções numa transação; cada parte grava a trilha da 013.
do $$ declare r jsonb; begin
  r := disponibilidade_lote('e1500000-0000-4000-8000-00000000000a',
    '[{"profissionalId": "a1500000-0000-4000-8000-0000000000a1", "periodos": [{"diaSemana": 6, "inicio": "08:00", "fim": "14:00"}], "publicar": true},
      {"profissionalId": "a1500000-0000-4000-8000-0000000000a2", "periodos": [{"diaSemana": 6, "inicio": "08:00", "fim": "14:00"}], "publicar": true}]',
    '[{"tipo": "fechamento", "dataInicio": "2026-12-25", "dataFim": "2026-12-25", "motivo": "Natal"}]',
    'c1500000-0000-4000-8000-0000000000a1', '[]');
  if (r->>'semanais')::int <> 2 or (r->>'excecoes')::int <> 1 then raise exception 'gate_015 bloco 1: resultado errado: %', r; end if;
  if (select count(*) from disponibilidade_semanal where empresa_id = 'e1500000-0000-4000-8000-00000000000a' and dia_semana = 6) <> 2
     or (select count(*) from disponibilidade_eventos where empresa_id = 'e1500000-0000-4000-8000-00000000000a') <> 3 then
    raise exception 'gate_015 bloco 1: escalas ou trilha erradas';
  end if;
end $$;

-- 2. Tudo ou nada: um item de outra empresa desfaz o lote inteiro; controle: sem ele, grava.
do $$ declare antes int; begin
  antes := (select count(*) from disponibilidade_excecoes where empresa_id = 'e1500000-0000-4000-8000-00000000000a');
  if pg_temp.erro_de($q$select disponibilidade_lote('e1500000-0000-4000-8000-00000000000a', '[]',
       '[{"tipo": "fechamento", "dataInicio": "2026-12-31", "dataFim": "2026-12-31"},
         {"tipo": "ausencia", "profissionalId": "a1500000-0000-4000-8000-0000000000b1", "dataInicio": "2026-12-31", "dataFim": "2026-12-31"}]',
       'c1500000-0000-4000-8000-0000000000a1', '[]')$q$) is null then
    raise exception 'gate_015 bloco 2: profissional de outra empresa aceito no lote';
  end if;
  if (select count(*) from disponibilidade_excecoes where empresa_id = 'e1500000-0000-4000-8000-00000000000a') <> antes then
    raise exception 'gate_015 bloco 2: lote gravou pela metade';
  end if;
  if pg_temp.erro_de($q$select disponibilidade_lote('e1500000-0000-4000-8000-00000000000a', '[]', '[]', 'c1500000-0000-4000-8000-0000000000a1', '[]')$q$) is null then
    raise exception 'gate_015 bloco 2: lote vazio aceito';
  end if;
  if pg_temp.erro_de($q$select disponibilidade_lote('e1500000-0000-4000-8000-00000000000a', '[]', '[{"tipo": "fechamento", "dataInicio": "2026-12-31", "dataFim": "2026-12-31"}]', null, '[]')$q$) is null then
    raise exception 'gate_015 bloco 2: lote sem ator aceito';
  end if;
end $$;

-- 3. Mais de 50 exceções (o lote divide em partes de 50) numa transação só.
do $$ declare v jsonb; begin
  select jsonb_agg(jsonb_build_object('tipo', 'bloqueio', 'profissionalId', 'a1500000-0000-4000-8000-0000000000a1',
           'dataInicio', d::date, 'dataFim', d::date, 'inicio', '08:00', 'fim', '09:00'))
    into v from generate_series('2027-01-01'::date, '2027-02-28'::date, '1 day') as d;
  perform disponibilidade_lote('e1500000-0000-4000-8000-00000000000a', '[]', v, 'c1500000-0000-4000-8000-0000000000a1', '[]');
  if (select count(*) from disponibilidade_excecoes where tipo = 'bloqueio' and data_inicio >= '2027-01-01') <> 59 then
    raise exception 'gate_015 bloco 3: exceções em partes erradas';
  end if;
end $$;

-- 4. Modelos: nome único entre os ativos; arquivado libera o nome; conteúdo é lista.
do $$ begin
  insert into escala_modelos (empresa_id, nome, conteudo) values ('e1500000-0000-4000-8000-00000000000a', 'Equipe de sábado', '[{"diaSemana": 6, "inicio": "08:00", "fim": "14:00"}]');
  if pg_temp.erro_de($q$insert into escala_modelos (empresa_id, nome) values ('e1500000-0000-4000-8000-00000000000a', ' equipe de SÁBADO ')$q$) is not null
     and pg_temp.erro_de($q$insert into escala_modelos (empresa_id, nome) values ('e1500000-0000-4000-8000-00000000000a', 'equipe de sábado')$q$) is null then
    raise exception 'gate_015 bloco 4: nome repetido aceito';
  end if;
  update escala_modelos set arquivado_em = now() where nome = 'Equipe de sábado';
  if pg_temp.erro_de($q$insert into escala_modelos (empresa_id, nome) values ('e1500000-0000-4000-8000-00000000000a', 'Equipe de sábado')$q$) is not null then
    raise exception 'gate_015 bloco 4: controle negativo falhou (nome de modelo arquivado não liberado)';
  end if;
  if pg_temp.erro_de($q$insert into escala_modelos (empresa_id, nome, conteudo) values ('e1500000-0000-4000-8000-00000000000a', 'X', '{"a": 1}')$q$) is null
     or pg_temp.erro_de($q$insert into escala_modelos (empresa_id, nome) values ('e1500000-0000-4000-8000-00000000000a', '   ')$q$) is null then
    raise exception 'gate_015 bloco 4: modelo inválido aceito';
  end if;
end $$;

-- 5. Acesso: anon e authenticated fora; backend sem apagar modelos; só ele chama o lote.
do $$ begin
  if has_table_privilege('anon', 'escala_modelos', 'select') or has_table_privilege('authenticated', 'escala_modelos', 'select') then
    raise exception 'gate_015 bloco 5: modelos expostos';
  end if;
  if has_table_privilege('service_role', 'escala_modelos', 'delete') or not has_table_privilege('service_role', 'escala_modelos', 'update') then
    raise exception 'gate_015 bloco 5: grants de modelos errados';
  end if;
  if has_function_privilege('anon', 'disponibilidade_lote(uuid, jsonb, jsonb, uuid, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'disponibilidade_lote(uuid, jsonb, jsonb, uuid, jsonb)', 'execute') then
    raise exception 'gate_015 bloco 5: acesso ao lote errado';
  end if;
end $$;

rollback;
\echo gate_015 OK (5 blocos)
