-- Gate SQL da migration 020 (lembretes por push, D-041). Transação desfeita no final.
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

insert into empresas (id, nome) values ('e2000000-0000-4000-8000-00000000000a', 'A'), ('e2000000-0000-4000-8000-00000000000b', 'B');
insert into agendamentos (id, empresa_id, data, horario) values
  ('a2000000-0000-4000-8000-0000000000a1', 'e2000000-0000-4000-8000-00000000000a', '2026-12-01', '10:00'),
  ('a2000000-0000-4000-8000-0000000000b1', 'e2000000-0000-4000-8000-00000000000b', '2026-12-01', '10:00');
insert into agendamento_acessos (id, empresa_id, agendamento_id, token_hash, expira_em) values
  ('c2000000-0000-4000-8000-0000000000a1', 'e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-0000000000a1', repeat('a', 64), '2026-12-02T13:00:00Z');

-- 1. Padrão: lembretes ligados; assinatura válida grava com 0 falhas.
do $$ begin
  if not (select lembretes_push_ativo from empresas where id = 'e2000000-0000-4000-8000-00000000000a') then
    raise exception 'gate_020 bloco 1: padrão errado';
  end if;
  insert into agendamento_push (empresa_id, acesso_id, endpoint_hash, assinatura)
  values ('e2000000-0000-4000-8000-00000000000a', 'c2000000-0000-4000-8000-0000000000a1', repeat('1', 64), '{"endpoint": "https://push.example/x", "keys": {"p256dh": "a", "auth": "b"}}');
  if (select falhas from agendamento_push where endpoint_hash = repeat('1', 64)) <> 0 then raise exception 'gate_020 bloco 1: falhas'; end if;
end $$;

-- 2. Endpoint repetido, hash fora do formato, assinatura que não é objeto ou grande demais: recusados.
do $$ begin
  if pg_temp.erro_de($q$insert into agendamento_push (empresa_id, acesso_id, endpoint_hash, assinatura) values ('e2000000-0000-4000-8000-00000000000a', 'c2000000-0000-4000-8000-0000000000a1', repeat('1', 64), '{}')$q$) is null
     or pg_temp.erro_de($q$insert into agendamento_push (empresa_id, acesso_id, endpoint_hash, assinatura) values ('e2000000-0000-4000-8000-00000000000a', 'c2000000-0000-4000-8000-0000000000a1', 'curto', '{}')$q$) is null
     or pg_temp.erro_de($q$insert into agendamento_push (empresa_id, acesso_id, endpoint_hash, assinatura) values ('e2000000-0000-4000-8000-00000000000a', 'c2000000-0000-4000-8000-0000000000a1', repeat('2', 64), '[]')$q$) is null
     or pg_temp.erro_de(format($q$insert into agendamento_push (empresa_id, acesso_id, endpoint_hash, assinatura) values ('e2000000-0000-4000-8000-00000000000a', 'c2000000-0000-4000-8000-0000000000a1', repeat('3', 64), %L::jsonb)$q$, jsonb_build_object('x', repeat('y', 5000)))) is null then
    raise exception 'gate_020 bloco 2: assinatura inválida aceita';
  end if;
end $$;

-- 3. Nada cruza empresa: push de B para acesso de A; lembrete de B para agendamento de A.
do $$ begin
  if pg_temp.erro_de($q$insert into agendamento_push (empresa_id, acesso_id, endpoint_hash, assinatura) values ('e2000000-0000-4000-8000-00000000000b', 'c2000000-0000-4000-8000-0000000000a1', repeat('4', 64), '{}')$q$) is null
     or pg_temp.erro_de($q$insert into agendamento_lembretes (empresa_id, agendamento_id, tipo, canal) values ('e2000000-0000-4000-8000-00000000000b', 'a2000000-0000-4000-8000-0000000000a1', 'd1', 'push')$q$) is null then
    raise exception 'gate_020 bloco 3: cruzou empresa';
  end if;
end $$;

-- 4. Trava contra envio duplicado: o mesmo (agendamento, tipo, canal) só entra uma vez; tipos e
--    canais fora da lista são recusados; outro canal ou tipo do mesmo agendamento entra.
do $$ begin
  insert into agendamento_lembretes (empresa_id, agendamento_id, tipo, canal) values ('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-0000000000a1', 'd1', 'push');
  if pg_temp.erro_de($q$insert into agendamento_lembretes (empresa_id, agendamento_id, tipo, canal) values ('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-0000000000a1', 'd1', 'push')$q$) is null then
    raise exception 'gate_020 bloco 4: lembrete duplicado aceito';
  end if;
  if pg_temp.erro_de($q$insert into agendamento_lembretes (empresa_id, agendamento_id, tipo, canal) values ('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-0000000000a1', 'x9', 'push')$q$) is null
     or pg_temp.erro_de($q$insert into agendamento_lembretes (empresa_id, agendamento_id, tipo, canal) values ('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-0000000000a1', 'h2', 'pombo')$q$) is null
     or pg_temp.erro_de($q$update agendamento_lembretes set situacao = 'sumiu' where tipo = 'd1'$q$) is null then
    raise exception 'gate_020 bloco 4: valor fora da lista aceito';
  end if;
  insert into agendamento_lembretes (empresa_id, agendamento_id, tipo, canal) values ('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-0000000000a1', 'h2', 'push');
  insert into agendamento_lembretes (empresa_id, agendamento_id, tipo, canal) values ('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-0000000000a1', 'd1', 'whatsapp');
end $$;

-- 5. Acesso: só service_role; ninguém apaga; RLS ligada; função com search_path fixo.
do $$ declare t text; begin
  foreach t in array array['agendamento_push', 'agendamento_lembretes'] loop
    if has_table_privilege('anon', t, 'select') or has_table_privilege('authenticated', t, 'select')
       or has_table_privilege('service_role', t, 'delete') or not has_table_privilege('service_role', t, 'update')
       or not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception 'gate_020 bloco 5: acesso/RLS errado em %', t;
    end if;
  end loop;
  if not exists (select 1 from pg_proc where proname = 'lembretes_mesma_empresa' and array_to_string(proconfig, ',') like '%search_path=%') then
    raise exception 'gate_020 bloco 5: função sem search_path fixo';
  end if;
end $$;

rollback;
\echo gate_020 OK (5 blocos)
