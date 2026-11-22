-- Gate SQL da migration 027 (agendamento público e remarcação atômicos, D-063). Transação desfeita no final.
\set ON_ERROR_STOP 1
begin;
set local client_min_messages = warning;

insert into empresas (id, nome) values
  ('e2700000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e2700000-0000-4000-8000-00000000000b', 'Empresa B');
insert into profissionais (id, empresa_id, nome) values
  ('a2700000-0000-4000-8000-0000000000a1', 'e2700000-0000-4000-8000-00000000000a', 'Ana');
insert into servicos (id, empresa_id, nome, valor_centavos, duracao_min) values
  ('b2700000-0000-4000-8000-0000000000a1', 'e2700000-0000-4000-8000-00000000000a', 'Corte', 5000, 30);
insert into clientes (id, empresa_id, nome, whatsapp, ativo) values
  ('c2700000-0000-4000-8000-0000000000b1', 'e2700000-0000-4000-8000-00000000000b', 'Cliente de B', '21988880000', true),
  ('c2700000-0000-4000-8000-0000000000a9', 'e2700000-0000-4000-8000-00000000000a', 'Inativo', '(21) 97777-0000', false);

-- Chamada do link público: devolve o jsonb ou 'ERRO <sqlstate> <mensagem>'.
create function pg_temp.publico(p_numero text, p_cliente uuid, p_hora text, p_extra jsonb default '{}') returns jsonb language plpgsql as $$
begin
  return agendamento_publico_criar('e2700000-0000-4000-8000-00000000000a', p_numero, p_cliente,
    jsonb_build_object('nome', 'Maria Nova', 'observacoes', 'Cadastro pelo link de agendamento online'),
    jsonb_build_object('profissional_id', 'a2700000-0000-4000-8000-0000000000a1', 'servico_id', 'b2700000-0000-4000-8000-0000000000a1',
      'data', '2030-02-10', 'horario', p_hora, 'duracao_min', 30, 'valor_centavos', 5000, 'status', 'agendado') || p_extra,
    jsonb_build_object('tipo', 'origem_link_publico', 'payload', jsonb_build_object('origem', 'link_publico', 'dedup', 'novo')));
exception when others then
  return to_jsonb('ERRO ' || sqlstate || ' ' || sqlerrm);
end $$;
create function pg_temp.n_clientes(p_numero text) returns int language sql as $$
  select count(*)::int from clientes where empresa_id = 'e2700000-0000-4000-8000-00000000000a' and chave_numero_br(whatsapp) = p_numero $$;
create function pg_temp.n_ag() returns int language sql as $$
  select count(*)::int from agendamentos where empresa_id = 'e2700000-0000-4000-8000-00000000000a' $$;

-- 1. Normalização igual à do backend (mesma tabela em backend/tests/agendamento-atomico-gate.test.js).
do $$ declare r record; begin
  for r in select * from (values
    ('(21) 99999-0001', '5521999990001'), ('+55 21 99999-0001', '5521999990001'), ('5521999990001', '5521999990001'),
    ('21 9999-0001', '5521999990001'), ('21 3333-4444', '552133334444'), ('123', null), (null, null), ('55 21 3333-4444', '552133334444')
  ) as t(entrada, esperado) loop
    if chave_numero_br(r.entrada) is distinct from r.esperado then
      raise exception 'gate_027 bloco 1: chave_numero_br(%) = %, esperado %', r.entrada, chave_numero_br(r.entrada), r.esperado;
    end if;
  end loop;
end $$;

-- 2. Número novo: cria cliente, horário e evento juntos. O inativo do mesmo número não é usado.
do $$ declare r jsonb; v_cli uuid; begin
  r := pg_temp.publico('5521977770000', null, '09:00');
  if jsonb_typeof(r) <> 'object' or (r->>'cliente_criado')::boolean is not true then raise exception 'gate_027 bloco 2: %', r; end if;
  v_cli := (r->>'cliente_id')::uuid;
  if v_cli = 'c2700000-0000-4000-8000-0000000000a9' then raise exception 'gate_027 bloco 2: usou o cliente inativo'; end if;
  if not exists (select 1 from agendamentos where id = (r->'agendamento'->>'id')::uuid and cliente_id = v_cli) then raise exception 'gate_027 bloco 2: horário sem o cliente'; end if;
  if not exists (select 1 from agendamento_eventos where agendamento_id = (r->'agendamento'->>'id')::uuid and tipo = 'origem_link_publico' and payload->>'dedup' = 'novo') then
    raise exception 'gate_027 bloco 2: evento de origem não gravado';
  end if;
end $$;

-- 3. Mesmo número de novo, sem cliente escolhido (corrida: o backend leu antes do primeiro gravar):
--    reaproveita o mesmo cliente e marca no evento.
do $$ declare r jsonb; begin
  r := pg_temp.publico('5521977770000', null, '10:00');
  if (r->>'cliente_concorrente')::boolean is not true or (r->>'cliente_criado')::boolean then raise exception 'gate_027 bloco 3: %', r; end if;
  if pg_temp.n_clientes('5521977770000') <> 2 then raise exception 'gate_027 bloco 3: criou outro cliente (ativos+inativo = %)', pg_temp.n_clientes('5521977770000'); end if;
  if not exists (select 1 from agendamento_eventos where agendamento_id = (r->'agendamento'->>'id')::uuid and payload->>'dedup' = 'existente_concorrente') then
    raise exception 'gate_027 bloco 3: evento sem a marca da corrida';
  end if;
end $$;

-- 4. Horário ocupado: HS409 e nada fica — nem o cliente novo (o defeito antigo: cliente órfão).
do $$ declare r jsonb; ag0 int := pg_temp.n_ag(); begin
  r := pg_temp.publico('5521966660000', null, '09:00');
  if r::text not like '%HS409%' then raise exception 'gate_027 bloco 4: conflito não detectado (%)', r; end if;
  if pg_temp.n_clientes('5521966660000') <> 0 then raise exception 'gate_027 bloco 4: sobrou cliente órfão'; end if;
  if pg_temp.n_ag() <> ag0 then raise exception 'gate_027 bloco 4: gravou horário'; end if;
end $$;

-- 5. Escala mudou (026): HS412 e nada fica.
insert into app_users (id, email, nome) values ('c2700000-0000-4000-8000-0000000000f1', 'gate027@t', 'Gate');
insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id)
  values ('e2700000-0000-4000-8000-00000000000a', 'c2700000-0000-4000-8000-0000000000f1', 'excecao_criar', 'a2700000-0000-4000-8000-0000000000a1');
do $$ declare r jsonb; v_seq bigint; begin
  select coalesce(max(seq), 0) into v_seq from disponibilidade_eventos where empresa_id = 'e2700000-0000-4000-8000-00000000000a';
  r := pg_temp.publico('5521955550000', null, '11:00', jsonb_build_object('disp_versao', v_seq + 1));
  if r::text not like '%HS412%' then raise exception 'gate_027 bloco 5: versão velha aceita (%)', r; end if;
  if pg_temp.n_clientes('5521955550000') <> 0 then raise exception 'gate_027 bloco 5: sobrou cliente'; end if;
end $$;

-- 6. Cliente de outra empresa ou inativo informado pelo backend: recusa sem gravar.
do $$ declare r jsonb; ag0 int := pg_temp.n_ag(); begin
  r := pg_temp.publico('5521988880000', 'c2700000-0000-4000-8000-0000000000b1', '12:00');
  if r::text not like '%P0001%cliente nao encontrado%' then raise exception 'gate_027 bloco 6: cliente de B aceito (%)', r; end if;
  r := pg_temp.publico('5521977770000', 'c2700000-0000-4000-8000-0000000000a9', '12:00');
  if r::text not like '%P0001%cliente nao encontrado%' then raise exception 'gate_027 bloco 6: cliente inativo aceito (%)', r; end if;
  if pg_temp.n_ag() <> ag0 then raise exception 'gate_027 bloco 6: gravou horário'; end if;
  r := pg_temp.publico('2199990001', null, '12:00');
  if r::text not like '%P0001%numero invalido%' then raise exception 'gate_027 bloco 6: número fora do formato aceito (%)', r; end if;
end $$;

-- 7. Remarcar: novo criado e original "reagendado" na mesma chamada.
create function pg_temp.remarcar(p_id uuid, p_de text[], p_hora text) returns jsonb language plpgsql as $$
begin
  return agendamento_remarcar('e2700000-0000-4000-8000-00000000000a', p_id, p_de,
    jsonb_build_object('profissional_id', 'a2700000-0000-4000-8000-0000000000a1', 'servico_id', 'b2700000-0000-4000-8000-0000000000a1',
      'data', '2030-02-10', 'horario', p_hora, 'duracao_min', 30, 'status', 'agendado'), false, null);
exception when others then
  return to_jsonb('ERRO ' || sqlstate || ' ' || sqlerrm);
end $$;
do $$ declare v_id uuid; r jsonb; begin
  select id into v_id from agendamentos where empresa_id = 'e2700000-0000-4000-8000-00000000000a' and horario = '09:00';
  -- Mesmo horário (9:00 → 9:15 sobrepõe o próprio original): o original é ignorado no conflito.
  r := pg_temp.remarcar(v_id, array['agendado', 'confirmado'], '09:15');
  if jsonb_typeof(r) <> 'object' or r->'original'->>'status' <> 'reagendado' then raise exception 'gate_027 bloco 7: %', r; end if;
  if (select status from agendamentos where id = v_id) <> 'reagendado' then raise exception 'gate_027 bloco 7: original continua ativo'; end if;

  -- 8. Original já mudou (está "reagendado"): HS410 e nada novo.
  r := pg_temp.remarcar(v_id, array['agendado', 'confirmado'], '13:00');
  if r::text not like '%HS410%AGENDAMENTO_MUDOU%' then raise exception 'gate_027 bloco 8: status velho aceito (%)', r; end if;
  if exists (select 1 from agendamentos where empresa_id = 'e2700000-0000-4000-8000-00000000000a' and horario = '13:00') then raise exception 'gate_027 bloco 8: gravou o novo'; end if;
end $$;

-- 9. Remarcar para horário ocupado: HS409 e o original continua como estava (antes: dependia do backend).
do $$ declare v_id uuid; r jsonb; begin
  select id into v_id from agendamentos where empresa_id = 'e2700000-0000-4000-8000-00000000000a' and horario = '10:00';
  r := pg_temp.remarcar(v_id, array['agendado'], '09:15');
  if r::text not like '%HS409%' then raise exception 'gate_027 bloco 9: conflito não detectado (%)', r; end if;
  if (select status from agendamentos where id = v_id) <> 'agendado' then raise exception 'gate_027 bloco 9: original mudou'; end if;
  -- Outra empresa não remarca o horário de A.
  r := null;
  begin
    perform agendamento_remarcar('e2700000-0000-4000-8000-00000000000b', v_id, array['agendado'], '{}'::jsonb, false, null);
  exception when others then r := to_jsonb(sqlstate || ' ' || sqlerrm);
  end;
  if r is null or r::text not like '%P0001%agendamento nao encontrado%' then raise exception 'gate_027 bloco 9: empresa B remarcou o horário de A (%)', r; end if;
end $$;

-- 10. Acesso: só service_role executa.
do $$ declare f text; begin
  foreach f in array array['public.chave_numero_br(text)', 'public.agendamento_publico_criar(uuid, text, uuid, jsonb, jsonb, jsonb)',
                           'public.agendamento_remarcar(uuid, uuid, text[], jsonb, boolean, uuid)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'gate_027 bloco 10: % exposta', f;
    end if;
  end loop;
end $$;

rollback;
\echo 'gate_027 OK'
