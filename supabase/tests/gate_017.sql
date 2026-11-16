-- Gate SQL da migration 017 (link pessoal do agendamento, D-038). Transação desfeita no final.
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
  ('e1700000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e1700000-0000-4000-8000-00000000000b', 'Empresa B');
insert into agendamentos (id, empresa_id, data, horario) values
  ('a1700000-0000-4000-8000-0000000000a1', 'e1700000-0000-4000-8000-00000000000a', '2026-12-01', '10:00'),
  ('a1700000-0000-4000-8000-0000000000a2', 'e1700000-0000-4000-8000-00000000000a', '2026-12-02', '10:00'),
  ('a1700000-0000-4000-8000-0000000000b1', 'e1700000-0000-4000-8000-00000000000b', '2026-12-01', '10:00');

-- 1. Acesso válido grava com os padrões (origem link_publico, 0 remarcações, não revogado).
do $$ declare r record; begin
  insert into agendamento_acessos (id, empresa_id, agendamento_id, token_hash, expira_em)
  values ('c1700000-0000-4000-8000-0000000000a1', 'e1700000-0000-4000-8000-00000000000a', 'a1700000-0000-4000-8000-0000000000a1', repeat('a', 64), '2026-12-02T13:00:00Z');
  select * into r from agendamento_acessos where id = 'c1700000-0000-4000-8000-0000000000a1';
  if r.origem <> 'link_publico' or r.remarcacoes <> 0 or r.revogado_em is not null then
    raise exception 'gate_017 bloco 1: padrões errados';
  end if;
end $$;

-- 2. O banco não aceita o código em claro nem hash fora do formato, nem hash repetido.
do $$ begin
  if pg_temp.erro_de($q$insert into agendamento_acessos (empresa_id, agendamento_id, token_hash, expira_em) values ('e1700000-0000-4000-8000-00000000000a', 'a1700000-0000-4000-8000-0000000000a1', 'codigo-em-claro', now())$q$) is null
     or pg_temp.erro_de(format($q$insert into agendamento_acessos (empresa_id, agendamento_id, token_hash, expira_em) values ('e1700000-0000-4000-8000-00000000000a', 'a1700000-0000-4000-8000-0000000000a1', %L, now())$q$, repeat('A', 64))) is null
     or pg_temp.erro_de(format($q$insert into agendamento_acessos (empresa_id, agendamento_id, token_hash, expira_em) values ('e1700000-0000-4000-8000-00000000000a', 'a1700000-0000-4000-8000-0000000000a2', %L, now())$q$, repeat('a', 64))) is null then
    raise exception 'gate_017 bloco 2: hash inválido ou repetido aceito';
  end if;
end $$;

-- 3. Nenhum acesso cruza empresa: nem ao criar, nem ao mover para o agendamento de outra.
do $$ begin
  if pg_temp.erro_de(format($q$insert into agendamento_acessos (empresa_id, agendamento_id, token_hash, expira_em) values ('e1700000-0000-4000-8000-00000000000b', 'a1700000-0000-4000-8000-0000000000a1', %L, now())$q$, repeat('b', 64))) is null then
    raise exception 'gate_017 bloco 3: acesso de B para agendamento de A aceito';
  end if;
  if pg_temp.erro_de($q$update agendamento_acessos set agendamento_id = 'a1700000-0000-4000-8000-0000000000b1' where id = 'c1700000-0000-4000-8000-0000000000a1'$q$) is null then
    raise exception 'gate_017 bloco 3: acesso movido para agendamento de outra empresa';
  end if;
  -- Controle: mover para outro agendamento da MESMA empresa (remarcação) é permitido.
  update agendamento_acessos set agendamento_id = 'a1700000-0000-4000-8000-0000000000a2' where id = 'c1700000-0000-4000-8000-0000000000a1';
end $$;

-- 4. Limites: remarcações 0–20 e origem só das duas conhecidas.
do $$ begin
  if pg_temp.erro_de($q$update agendamento_acessos set remarcacoes = 21 where id = 'c1700000-0000-4000-8000-0000000000a1'$q$) is null
     or pg_temp.erro_de($q$update agendamento_acessos set remarcacoes = -1 where id = 'c1700000-0000-4000-8000-0000000000a1'$q$) is null
     or pg_temp.erro_de($q$update agendamento_acessos set origem = 'cliente' where id = 'c1700000-0000-4000-8000-0000000000a1'$q$) is null then
    raise exception 'gate_017 bloco 4: limite aceito fora da faixa';
  end if;
end $$;

-- 5. Acesso: só o backend (service_role) lê e grava; ninguém apaga; anon e authenticated nada.
do $$ begin
  if has_table_privilege('anon', 'agendamento_acessos', 'select') or has_table_privilege('authenticated', 'agendamento_acessos', 'select') then
    raise exception 'gate_017 bloco 5: acessos expostos';
  end if;
  if has_table_privilege('service_role', 'agendamento_acessos', 'delete') or not has_table_privilege('service_role', 'agendamento_acessos', 'update') then
    raise exception 'gate_017 bloco 5: grants errados';
  end if;
  if not exists (select 1 from pg_class where relname = 'agendamento_acessos' and relrowsecurity) then
    raise exception 'gate_017 bloco 5: RLS desligada';
  end if;
  if not exists (select 1 from pg_proc where proname = 'agendamento_acessos_mesma_empresa' and array_to_string(proconfig, ',') like '%search_path=%') then
    raise exception 'gate_017 bloco 5: função sem search_path fixo';
  end if;
end $$;

rollback;
\echo gate_017 OK (5 blocos)
