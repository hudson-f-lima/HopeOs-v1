-- Gate SQL da migration 011 (metas e ranking, D-019). Transação desfeita no final.
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
  ('e1100000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e1100000-0000-4000-8000-00000000000b', 'Empresa B');
insert into profissionais (id, empresa_id, nome) values
  ('a1100000-0000-4000-8000-00000000000a', 'e1100000-0000-4000-8000-00000000000a', 'Prof A'),
  ('a1100000-0000-4000-8000-00000000000b', 'e1100000-0000-4000-8000-00000000000b', 'Prof B');

-- 1. Meta válida grava; ranking nasce desligado.
do $$ begin
  insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('e1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000a', '2026-11', 'faturamento', 500000);
  if (select ranking_visivel_equipe from empresas where id = 'e1100000-0000-4000-8000-00000000000a') is not false then raise exception 'gate_011 bloco 1: ranking deveria nascer desligado'; end if;
end $$;

-- 2. Uma meta por profissional, mês e tipo; outro tipo convive.
do $$ declare e text; begin
  e := pg_temp.erro_de($q$insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('e1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000a', '2026-11', 'faturamento', 1)$q$);
  if e is null then raise exception 'gate_011 bloco 2: meta duplicada aceita'; end if;
  insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('e1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000a', '2026-11', 'atendimentos', 40);
end $$;

-- 3. Mês, tipo e alvo inválidos são recusados.
do $$ declare e text; begin
  e := pg_temp.erro_de($q$insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('e1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000a', '2026-13', 'faturamento', 1)$q$);
  if e is null then raise exception 'gate_011 bloco 3: mês inválido aceito'; end if;
  e := pg_temp.erro_de($q$insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('e1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000a', '2026-12', 'gorjeta', 1)$q$);
  if e is null then raise exception 'gate_011 bloco 3: tipo inválido aceito'; end if;
  e := pg_temp.erro_de($q$insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('e1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000a', '2026-12', 'faturamento', 0)$q$);
  if e is null then raise exception 'gate_011 bloco 3: alvo zero aceito'; end if;
end $$;

-- 4. Profissional de outra empresa é recusado no insert e no update.
do $$ declare e text; begin
  e := pg_temp.erro_de($q$insert into metas (empresa_id, profissional_id, mes, tipo, valor_alvo) values ('e1100000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-00000000000b', '2026-11', 'faturamento', 1)$q$);
  if e is null or e not like '%não pertence à empresa%' then raise exception 'gate_011 bloco 4: insert cruzando empresa aceito (%)', e; end if;
  e := pg_temp.erro_de($q$update metas set profissional_id = 'a1100000-0000-4000-8000-00000000000b' where empresa_id = 'e1100000-0000-4000-8000-00000000000a'$q$);
  if e is null then raise exception 'gate_011 bloco 4: update cruzando empresa aceito'; end if;
end $$;

-- 5. Meta é configuração: update e delete funcionam.
do $$ begin
  update metas set valor_alvo = 600000 where tipo = 'faturamento';
  delete from metas where tipo = 'atendimentos';
  if (select count(*) from metas) <> 1 or (select valor_alvo from metas) <> 600000 then raise exception 'gate_011 bloco 5: update/delete não aplicados'; end if;
end $$;

-- 6. Permissões: RLS ligado; anon/authenticated sem acesso; service_role opera.
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.metas'::regclass) then raise exception 'gate_011 bloco 6: RLS desligado'; end if;
  if has_table_privilege('anon', 'public.metas', 'select') or has_table_privilege('authenticated', 'public.metas', 'select, insert, update, delete') then raise exception 'gate_011 bloco 6: anon/authenticated com acesso'; end if;
  if not has_table_privilege('service_role', 'public.metas', 'select, insert, update, delete') then raise exception 'gate_011 bloco 6: service_role sem acesso'; end if;
end $$;

rollback;
\echo gate_011 OK (6 blocos)
