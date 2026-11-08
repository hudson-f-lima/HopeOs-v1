-- Gate SQL da migration 008. Transação desfeita no final: não deixa resíduo.
\set ON_ERROR_STOP 1
begin;

insert into empresas (id, nome, buffer_min) values
  ('e8000000-0000-4000-8000-00000000000a', 'Com buffer', 10),
  ('e8000000-0000-4000-8000-00000000000b', 'Sem buffer', 0);
insert into profissionais (id, empresa_id, nome) values
  ('a8000000-0000-4000-8000-00000000000a', 'e8000000-0000-4000-8000-00000000000a', 'P A'),
  ('a8000000-0000-4000-8000-00000000000b', 'e8000000-0000-4000-8000-00000000000b', 'P B');
insert into servicos (id, empresa_id, nome) values
  ('b8000000-0000-4000-8000-00000000000a', 'e8000000-0000-4000-8000-00000000000a', 'S A'),
  ('b8000000-0000-4000-8000-00000000000b', 'e8000000-0000-4000-8000-00000000000b', 'S B');

-- 01 buffer: 10:00–10:30 ocupa até 10:40; 10:30 conflita, 10:40 passa; encaixe forçado ignora
do $$
declare ok boolean := false;
begin
  perform agendamento_criar('e8000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a8000000-0000-4000-8000-00000000000a","servico_id":"b8000000-0000-4000-8000-00000000000a","data":"2026-12-01","horario":"10:00","duracao_min":30}');
  begin
    perform agendamento_criar('e8000000-0000-4000-8000-00000000000a',
      '{"profissional_id":"a8000000-0000-4000-8000-00000000000a","servico_id":"b8000000-0000-4000-8000-00000000000a","data":"2026-12-01","horario":"10:30","duracao_min":30}');
  exception when sqlstate 'HS409' then ok := true;
  end;
  assert ok, '01 buffer não gerou conflito em 10:30';
  ok := false;
  -- antes: novo 09:30–09:55 + buffer 10 invade 10:00
  begin
    perform agendamento_criar('e8000000-0000-4000-8000-00000000000a',
      '{"profissional_id":"a8000000-0000-4000-8000-00000000000a","servico_id":"b8000000-0000-4000-8000-00000000000a","data":"2026-12-01","horario":"09:30","duracao_min":25}');
  exception when sqlstate 'HS409' then ok := true;
  end;
  assert ok, '01 buffer do novo atendimento não foi considerado';
  perform agendamento_criar('e8000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a8000000-0000-4000-8000-00000000000a","servico_id":"b8000000-0000-4000-8000-00000000000a","data":"2026-12-01","horario":"10:40","duracao_min":30}');
  perform agendamento_criar('e8000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a8000000-0000-4000-8000-00000000000a","servico_id":"b8000000-0000-4000-8000-00000000000a","data":"2026-12-01","horario":"10:30","duracao_min":10}', true);
end $$;

-- 02 sem buffer o comportamento da 007 se mantém (encostado não conflita)
do $$ begin
  perform agendamento_criar('e8000000-0000-4000-8000-00000000000b',
    '{"profissional_id":"a8000000-0000-4000-8000-00000000000b","servico_id":"b8000000-0000-4000-8000-00000000000b","data":"2026-12-01","horario":"10:00","duracao_min":30}');
  perform agendamento_criar('e8000000-0000-4000-8000-00000000000b',
    '{"profissional_id":"a8000000-0000-4000-8000-00000000000b","servico_id":"b8000000-0000-4000-8000-00000000000b","data":"2026-12-01","horario":"10:30","duracao_min":30}');
end $$;

-- 03 restrições da empresa: CNPJ com 14 dígitos, buffer só 0/5/10/15, régua alerta < sinal
do $$ begin
  begin update empresas set cnpj = '123' where id = 'e8000000-0000-4000-8000-00000000000a'; raise exception '03 aceitou CNPJ inválido';
  exception when check_violation then null; end;
  update empresas set cnpj = '12345678000190', razao_social = 'Teste LTDA', salao_parceiro = true where id = 'e8000000-0000-4000-8000-00000000000a';
  begin update empresas set buffer_min = 7 where id = 'e8000000-0000-4000-8000-00000000000a'; raise exception '03 aceitou buffer 7';
  exception when check_violation then null; end;
  begin update empresas set regua_alerta_faltas = 3, regua_sinal_faltas = 3 where id = 'e8000000-0000-4000-8000-00000000000a'; raise exception '03 aceitou régua invertida';
  exception when check_violation then null; end;
end $$;

-- 04 cargo e categoria: nome único por empresa; não podem vir de outra empresa
insert into cargos (id, empresa_id, nome, comissao_pct, modelo_comissao) values
  ('c8000000-0000-4000-8000-00000000000a', 'e8000000-0000-4000-8000-00000000000a', 'Barbeiro', 50, 'dividido'),
  ('c8000000-0000-4000-8000-00000000000b', 'e8000000-0000-4000-8000-00000000000b', 'Barbeiro', 45, 'bruto_salao');
insert into servico_categorias (id, empresa_id, nome, comissao_pct) values
  ('d8000000-0000-4000-8000-00000000000b', 'e8000000-0000-4000-8000-00000000000b', 'Barba', 55);
do $$ begin
  begin insert into cargos (empresa_id, nome, comissao_pct) values ('e8000000-0000-4000-8000-00000000000a', 'BARBEIRO', 40);
    raise exception '04 aceitou cargo duplicado';
  exception when unique_violation then null; end;
  update profissionais set cargo_id = 'c8000000-0000-4000-8000-00000000000a' where id = 'a8000000-0000-4000-8000-00000000000a';
  begin update profissionais set cargo_id = 'c8000000-0000-4000-8000-00000000000b' where id = 'a8000000-0000-4000-8000-00000000000a';
    raise exception '04 aceitou cargo de outra empresa';
  exception when sqlstate 'P0001' then if sqlerrm <> 'cargo de outra empresa' then raise; end if; end;
  begin update servicos set categoria_id = 'd8000000-0000-4000-8000-00000000000b' where id = 'b8000000-0000-4000-8000-00000000000a';
    raise exception '04 aceitou categoria de outra empresa';
  exception when sqlstate 'P0001' then if sqlerrm <> 'categoria de outra empresa' then raise; end if; end;
  begin update servicos set modelo_heranca = 'BY_MOOD' where id = 'b8000000-0000-4000-8000-00000000000a';
    raise exception '04 aceitou modelo_heranca inválido';
  exception when check_violation then null; end;
  assert (select modelo_heranca from servicos where id = 'b8000000-0000-4000-8000-00000000000b') = 'FIXED_SERVICE', '04 default não preserva o comportamento atual';
end $$;

-- 05 apagar cargo/categoria não apaga profissional/serviço (set null)
do $$ begin
  update servicos set categoria_id = 'd8000000-0000-4000-8000-00000000000b' where id = 'b8000000-0000-4000-8000-00000000000b';
  delete from servico_categorias where id = 'd8000000-0000-4000-8000-00000000000b';
  assert (select categoria_id from servicos where id = 'b8000000-0000-4000-8000-00000000000b') is null, '05 categoria órfã';
  delete from cargos where id = 'c8000000-0000-4000-8000-00000000000a';
  assert (select cargo_id from profissionais where id = 'a8000000-0000-4000-8000-00000000000a') is null, '05 cargo órfão';
end $$;

-- 06 permissões: anon/authenticated fora das tabelas novas; RLS ligado em tudo
do $$
declare r text; t text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['cargos', 'servico_categorias'] loop
      assert not has_table_privilege(r, 'public.' || t, 'select'), format('06 %s lê %s', r, t);
    end loop;
    assert not has_function_privilege(r, 'public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid)', 'execute'), format('06 %s executa agendamento_criar', r);
  end loop;
  assert has_table_privilege('service_role', 'public.cargos', 'insert'), '06 service_role sem acesso a cargos';
  assert (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'), '06 tabela sem RLS';
end $$;

rollback;
\echo 'OK gate_008 (6 blocos)'
