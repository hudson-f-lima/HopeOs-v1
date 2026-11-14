-- Gate SQL da migration 012 (permissões individuais, D-032). Transação desfeita no final.
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
  ('e1200000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e1200000-0000-4000-8000-00000000000b', 'Empresa B');
insert into app_users (id, email, nome) values
  ('c1200000-0000-4000-8000-0000000000a1', 'adm-a@t', 'Admin A'),
  ('c1200000-0000-4000-8000-0000000000a2', 'prof-a@t', 'Prof A'),
  ('c1200000-0000-4000-8000-0000000000b1', 'adm-b@t', 'Admin B');
insert into empresa_memberships (id, empresa_id, user_id, role) values
  ('d1200000-0000-4000-8000-0000000000a1', 'e1200000-0000-4000-8000-00000000000a', 'c1200000-0000-4000-8000-0000000000a1', 'admin'),
  ('d1200000-0000-4000-8000-0000000000a2', 'e1200000-0000-4000-8000-00000000000a', 'c1200000-0000-4000-8000-0000000000a2', 'profissional'),
  ('d1200000-0000-4000-8000-0000000000b1', 'e1200000-0000-4000-8000-00000000000b', 'c1200000-0000-4000-8000-0000000000b1', 'admin');

-- 1. Vínculo nasce sem permissão extra.
do $$ begin
  if (select permissoes_extras from empresa_memberships where id = 'd1200000-0000-4000-8000-0000000000a2') <> '{}'::text[] then
    raise exception 'gate_012 bloco 1: permissoes_extras deveria nascer vazio';
  end if;
end $$;

-- 2. Formato: só 'grupo:acao' minúsculo; controle negativo: código válido passa.
do $$ declare e text; begin
  foreach e in array array['Agenda:ver', 'agenda', 'agenda:ver:todos', 'agenda ver', ''] loop
    if pg_temp.erro_de(format($q$update empresa_memberships set permissoes_extras = array[%L] where id = 'd1200000-0000-4000-8000-0000000000a2'$q$, e)) is null then
      raise exception 'gate_012 bloco 2: código inválido aceito: %', e;
    end if;
  end loop;
  if pg_temp.erro_de($q$update empresa_memberships set permissoes_extras = array['agenda:ver'] where id = 'd1200000-0000-4000-8000-0000000000a2'$q$) is not null then
    raise exception 'gate_012 bloco 2: controle negativo falhou (código válido recusado)';
  end if;
  update empresa_memberships set permissoes_extras = '{}' where id = 'd1200000-0000-4000-8000-0000000000a2';
end $$;

-- 3. Conceder e revogar pela função: lista gravada e um evento por diferença.
do $$ declare r jsonb; begin
  r := membership_permissoes_definir('e1200000-0000-4000-8000-00000000000a', 'd1200000-0000-4000-8000-0000000000a2',
                                     'c1200000-0000-4000-8000-0000000000a1', array['agenda:ver', 'caixa:fechar', 'agenda:ver']);
  if r->'concedidas' <> '["agenda:ver", "caixa:fechar"]'::jsonb or r->'revogadas' <> '[]'::jsonb then
    raise exception 'gate_012 bloco 3: concessão errada: %', r;
  end if;
  r := membership_permissoes_definir('e1200000-0000-4000-8000-00000000000a', 'd1200000-0000-4000-8000-0000000000a2',
                                     'c1200000-0000-4000-8000-0000000000a1', array['agenda:ver']);
  if r->'revogadas' <> '["caixa:fechar"]'::jsonb or r->'concedidas' <> '[]'::jsonb then
    raise exception 'gate_012 bloco 3: revogação errada: %', r;
  end if;
  if (select permissoes_extras from empresa_memberships where id = 'd1200000-0000-4000-8000-0000000000a2') <> array['agenda:ver'] then
    raise exception 'gate_012 bloco 3: lista gravada errada';
  end if;
  if (select count(*) from membership_permissao_eventos where membership_id = 'd1200000-0000-4000-8000-0000000000a2') <> 3
     or (select count(*) from membership_permissao_eventos where acao = 'revogar' and permissao = 'caixa:fechar'
           and actor_id = 'c1200000-0000-4000-8000-0000000000a1' and alvo_user_id = 'c1200000-0000-4000-8000-0000000000a2') <> 1 then
    raise exception 'gate_012 bloco 3: trilha de eventos errada';
  end if;
end $$;

-- 4. Trilha imutável; controle negativo: sem a trava, o UPDATE passaria.
do $$ begin
  if pg_temp.erro_de($q$update membership_permissao_eventos set permissao = 'agenda:editar'$q$) is null then
    raise exception 'gate_012 bloco 4: evento alterado';
  end if;
  if pg_temp.erro_de($q$delete from membership_permissao_eventos$q$) is null then
    raise exception 'gate_012 bloco 4: evento apagado';
  end if;
  alter table membership_permissao_eventos disable trigger trg_ledger_imutavel;
  if pg_temp.erro_de($q$update membership_permissao_eventos set permissao = permissao$q$) is not null then
    raise exception 'gate_012 bloco 4: controle negativo falhou (sem trava o UPDATE deveria passar)';
  end if;
  alter table membership_permissao_eventos enable trigger trg_ledger_imutavel;
end $$;

-- 5. Empresa e ator: vínculo de outra empresa, ator de fora e ator nulo são recusados.
do $$ begin
  if pg_temp.erro_de($q$select membership_permissoes_definir('e1200000-0000-4000-8000-00000000000a', 'd1200000-0000-4000-8000-0000000000b1', 'c1200000-0000-4000-8000-0000000000a1', array['agenda:ver'])$q$) is null then
    raise exception 'gate_012 bloco 5: vínculo de outra empresa aceito';
  end if;
  if pg_temp.erro_de($q$select membership_permissoes_definir('e1200000-0000-4000-8000-00000000000a', 'd1200000-0000-4000-8000-0000000000a2', 'c1200000-0000-4000-8000-0000000000b1', array['agenda:ver'])$q$) is null then
    raise exception 'gate_012 bloco 5: ator de outra empresa aceito';
  end if;
  if pg_temp.erro_de($q$select membership_permissoes_definir('e1200000-0000-4000-8000-00000000000a', 'd1200000-0000-4000-8000-0000000000a2', null, array['agenda:ver'])$q$) is null then
    raise exception 'gate_012 bloco 5: ator nulo aceito';
  end if;
  if pg_temp.erro_de($q$select membership_permissoes_definir('e1200000-0000-4000-8000-00000000000a', 'd1200000-0000-4000-8000-0000000000a2', 'c1200000-0000-4000-8000-0000000000a1', array['Errado'])$q$) is null then
    raise exception 'gate_012 bloco 5: código inválido aceito pela função';
  end if;
end $$;

-- 6. Acesso: anon e authenticated não leem a trilha nem chamam a função; service_role chama.
do $$ begin
  if has_table_privilege('anon', 'membership_permissao_eventos', 'select') or has_table_privilege('authenticated', 'membership_permissao_eventos', 'select') then
    raise exception 'gate_012 bloco 6: trilha exposta';
  end if;
  if has_function_privilege('anon', 'membership_permissoes_definir(uuid, uuid, uuid, text[])', 'execute')
     or has_function_privilege('authenticated', 'membership_permissoes_definir(uuid, uuid, uuid, text[])', 'execute') then
    raise exception 'gate_012 bloco 6: função exposta';
  end if;
  if not has_function_privilege('service_role', 'membership_permissoes_definir(uuid, uuid, uuid, text[])', 'execute') then
    raise exception 'gate_012 bloco 6: service_role sem acesso à função';
  end if;
  if has_table_privilege('service_role', 'membership_permissao_eventos', 'update') then
    raise exception 'gate_012 bloco 6: service_role pode alterar a trilha';
  end if;
end $$;

rollback;
\echo gate_012 OK (6 blocos)
