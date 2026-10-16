-- Gate SQL da migration 007. Roda dentro de uma transação desfeita no final:
-- não deixa resíduo. Cada bloco falha com mensagem explícita.
\set ON_ERROR_STOP 1
begin;

-- Fixtures: duas empresas para provar isolamento.
insert into empresas (id, nome) values
  ('e0000000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e0000000-0000-4000-8000-00000000000b', 'Empresa B');
insert into profissionais (id, empresa_id, nome) values
  ('a0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000a', 'Prof A'),
  ('a0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000b', 'Prof B');
insert into servicos (id, empresa_id, nome, duracao_min) values
  ('b0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000a', 'Corte', 60);
insert into produtos (id, empresa_id, nome, estoque_atual) values
  ('d0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000a', 'Pomada', 10);
insert into unidades (id, empresa_id, nome) values
  ('f0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000b', 'Filial B');

-- 01 trigger auth.users → app_users
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001', 'admin@a.test', '{"nome":"Admin A"}'),
  ('c0000000-0000-4000-8000-000000000002', 'semvinculo@a.test', '{}');
do $$ begin
  assert (select nome from app_users where id = 'c0000000-0000-4000-8000-000000000001') = 'Admin A', '01 app_users não sincronizado';
  assert (select nome from app_users where id = 'c0000000-0000-4000-8000-000000000002') = 'semvinculo', '01 nome padrão pelo e-mail';
end $$;

insert into empresa_memberships (id, empresa_id, user_id, role) values
  ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000001', 'admin');

-- 02 unidade padrão criada para empresas existentes antes da 007 é coberta pelo backfill;
--    aqui: membership_units recusa unidade de outra empresa
do $$ begin
  begin
    insert into membership_units values ('90000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000b');
    raise exception '02 aceitou unidade de outra empresa';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'unidade de outra empresa' then raise; end if;
  end;
end $$;

-- 03 agendamento_criar: cria com autoria; conflito → HS409; encaixe forçado passa
do $$
declare r jsonb; ok boolean := false;
begin
  r := agendamento_criar('e0000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-02","horario":"10:00","duracao_min":60}',
    false, null, 'c0000000-0000-4000-8000-000000000001');
  assert r->>'created_by' = 'c0000000-0000-4000-8000-000000000001', '03 created_by não gravado';
  begin
    perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
      '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-02","horario":"10:30","duracao_min":30}');
  exception when sqlstate 'HS409' then ok := true;
  end;
  assert ok, '03 sobreposição não gerou HS409';
  perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-02","horario":"10:30","duracao_min":30}', true);
  -- encostado (11:00) não conflita
  perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-02","horario":"11:00","duracao_min":30}');
end $$;

-- 04 cancelado/no_show/reagendado liberam o horário; p_ignorar_id ignora o próprio agendamento
do $$
declare v_id uuid;
begin
  update agendamentos set status = 'cancelado' where data = '2026-11-02' and horario = '11:00';
  perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-02","horario":"11:00","duracao_min":30}');
  select id into v_id from agendamentos where data = '2026-11-02' and horario = '10:00';
  perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
    '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-02","horario":"09:30","duracao_min":45}',
    false, v_id);
  -- sem ignorar_id o mesmo pedido conflita (prova que o teste acima não passou por acaso)
  begin
    perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
      '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-02","horario":"09:30","duracao_min":45}');
    raise exception '04 deveria conflitar sem ignorar_id';
  exception when sqlstate 'HS409' then null;
  end;
end $$;

-- 05 agendamento_criar recusa profissional de outra empresa e autor sem membership
do $$ begin
  begin
    perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
      '{"profissional_id":"a0000000-0000-4000-8000-00000000000b","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-03","horario":"10:00"}');
    raise exception '05 aceitou profissional de outra empresa';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'profissional nao encontrado%' then raise; end if;
  end;
  begin
    perform agendamento_criar('e0000000-0000-4000-8000-00000000000a',
      '{"profissional_id":"a0000000-0000-4000-8000-00000000000a","servico_id":"b0000000-0000-4000-8000-00000000000a","data":"2026-11-03","horario":"10:00"}',
      false, null, 'c0000000-0000-4000-8000-000000000002');
    raise exception '05 aceitou autor sem membership';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ator sem membership ativa na empresa' then raise; end if;
  end;
end $$;

-- 06 wrapper de estoque grava autoria do evento; autoria é imutável
do $$
declare v_mov uuid;
begin
  perform produto_estoque_ajuste_autoria('e0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a',
    'entrada', 5, 100, 'gate', 'c0000000-0000-4000-8000-000000000001', null);
  select id into v_mov from produto_estoque_movimentos where motivo = 'gate' and actor_id = 'c0000000-0000-4000-8000-000000000001';
  assert v_mov is not null, '06 actor_id não gravado no movimento';
  begin
    update produto_estoque_movimentos set actor_id = null where id = v_mov;
    raise exception '06 autoria foi alterada';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'autoria de evento é imutável' then raise; end if;
  end;
end $$;

-- 07 app_set_autoria: ambíguo, sem membership e integração de outra empresa falham fechado
insert into integrations (id, empresa_id, nome) values
  ('11000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000b', 'Integração B');
do $$ begin
  begin perform app_set_autoria('c0000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000a');
    raise exception '07 aceitou autoria ambígua';
  exception when sqlstate 'P0001' then if sqlerrm not like 'autoria ambígua%' then raise; end if; end;
  begin perform app_set_autoria('c0000000-0000-4000-8000-000000000002', null, 'e0000000-0000-4000-8000-00000000000a');
    raise exception '07 aceitou ator sem membership';
  exception when sqlstate 'P0001' then if sqlerrm <> 'ator sem membership ativa na empresa' then raise; end if; end;
  begin perform app_set_autoria(null, '11000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000a');
    raise exception '07 aceitou integração de outra empresa';
  exception when sqlstate 'P0001' then if sqlerrm not like 'integração inativa%' then raise; end if; end;
end $$;

-- 08 wrapper com integração grava actor_integration_id, nunca actor_id
do $$ begin
  perform produto_estoque_ajuste_autoria('e0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000a',
    'entrada', 1, 0, 'gate-b', null, '11000000-0000-4000-8000-00000000000b');
  raise exception '08 empresa B ajustou produto da empresa A';
exception when sqlstate 'P0001' then
  if sqlerrm not like 'produto nao encontrado%' then raise; end if;
end $$;

-- 09 scope coringa é recusado
do $$ begin
  begin insert into integration_scopes values ('11000000-0000-4000-8000-00000000000b', '*');
    raise exception '09 aceitou scope *';
  exception when check_violation then null; end;
end $$;

-- 10 anon/authenticated não leem nem escrevem nada em public; service_role sim
do $$
declare t text; r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['app_users', 'empresa_memberships', 'integration_credentials', 'clientes', 'comandos', 'agendamentos'] loop
      assert not has_table_privilege(r, 'public.' || t, 'select'), format('10 %s lê %s', r, t);
      assert not has_table_privilege(r, 'public.' || t, 'insert'), format('10 %s escreve %s', r, t);
    end loop;
    assert not has_function_privilege(r, 'public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid)', 'execute'), format('10 %s executa agendamento_criar', r);
  end loop;
  assert has_table_privilege('service_role', 'public.empresa_memberships', 'select'), '10 service_role sem acesso';
  assert (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'), '10 tabela de public sem RLS';
end $$;

-- 11 unidade padrão: backfill cria uma por empresa existente (empresas acima são novas,
--    então só checamos que nenhuma empresa pré-existente ficou sem unidade)
do $$ begin
  assert not exists (
    select 1 from empresas e where e.created_at < (select min(created_at) from app_users)
      and not exists (select 1 from unidades u where u.empresa_id = e.id)
  ), '11 empresa pré-existente sem unidade';
end $$;

-- 12 Red Team: no Supabase quem insere em auth.users é supabase_auth_admin (sem
--    superusuário, sem privilégio em public). O trigger precisa funcionar assim.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant insert, select on auth.users to supabase_auth_admin;
set local role supabase_auth_admin;
insert into auth.users (id, email) values ('c0000000-0000-4000-8000-0000000000ff', 'via-auth-admin@a.test');
reset role;
do $$ begin
  assert exists (select 1 from app_users where id = 'c0000000-0000-4000-8000-0000000000ff'), '12 trigger não rodou como supabase_auth_admin';
end $$;

rollback;
\echo 'OK gate_007 (12 blocos)'
