-- Gate SQL da migration 010 (pagamento de comissão e fechamento de caixa, D-017).
-- Transação desfeita no final. Cada bloco falha com mensagem explícita.
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
  ('e1000000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e1000000-0000-4000-8000-00000000000b', 'Empresa B');
insert into app_users (id, email, nome) values ('c1000000-0000-4000-8000-000000000001', 'admin@a10.test', 'Admin A');
insert into profissionais (id, empresa_id, nome) values
  ('a1000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-00000000000a', 'Prof A'),
  ('a1000000-0000-4000-8000-0000000000a2', 'e1000000-0000-4000-8000-00000000000a', 'Prof A2'),
  ('a1000000-0000-4000-8000-00000000000b', 'e1000000-0000-4000-8000-00000000000b', 'Prof B');

create function pg_temp.pag(p_id text, p_empresa text, p_prof text, p_tipo text, p_valor int, p_key text, p_estorna text default null) returns text
language sql as $$
  select format('insert into comissao_pagamentos (id, empresa_id, profissional_id, tipo, valor_centavos, data, idempotency_key, actor_id, estorna_id) values (%L, %L, %L, %L, %s, current_date, %L, %L, %L)',
    p_id, p_empresa, p_prof, p_tipo, p_valor, p_key, 'c1000000-0000-4000-8000-000000000001', p_estorna)
$$;

-- 1. Pagamento e vale válidos gravam.
do $$ begin
  execute pg_temp.pag('91000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'pagamento', 5000, 'k1');
  execute pg_temp.pag('91000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'vale', 2000, 'k2');
  if (select count(*) from comissao_pagamentos) <> 2 then raise exception 'gate_010 bloco 1: esperava 2 lançamentos'; end if;
end $$;

-- 2. Profissional de outra empresa é recusado (tenant).
do $$ declare e text; begin
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000b', 'pagamento', 100, 'k3'));
  if e is null or e not like '%não pertence à empresa%' then raise exception 'gate_010 bloco 2: profissional de outra empresa aceito (%)', e; end if;
end $$;

-- 3. Valor zero/negativo, tipo inválido e mês inválido são recusados.
do $$ declare e text; begin
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'pagamento', 0, 'k4'));
  if e is null then raise exception 'gate_010 bloco 3: valor 0 aceito'; end if;
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'bonus', 100, 'k4'));
  if e is null then raise exception 'gate_010 bloco 3: tipo inválido aceito'; end if;
  e := pg_temp.erro_de($q$insert into comissao_pagamentos (empresa_id, profissional_id, tipo, valor_centavos, data, referencia_mes, idempotency_key, actor_id) values ('e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'pagamento', 100, current_date, '2026-13', 'k4', 'c1000000-0000-4000-8000-000000000001')$q$);
  if e is null then raise exception 'gate_010 bloco 3: referencia_mes inválida aceita'; end if;
end $$;

-- 4. Idempotência: mesma chave na mesma empresa é recusada; em outra empresa é aceita.
do $$ declare e text; begin
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'pagamento', 5000, 'k1'));
  if e is null then raise exception 'gate_010 bloco 4: chave repetida aceita'; end if;
  execute pg_temp.pag('91000000-0000-4000-8000-000000000006', 'e1000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-00000000000b', 'pagamento', 700, 'k1');
end $$;

-- 5. Estorno: precisa de original; mesmo valor, mesmo profissional, mesma empresa; uma vez só; não estorna estorno.
do $$ declare e text; begin
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'estorno', 5000, 'k7'));
  if e is null then raise exception 'gate_010 bloco 5: estorno sem original aceito'; end if;
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'pagamento', 5000, 'k7', '91000000-0000-4000-8000-000000000001'));
  if e is null then raise exception 'gate_010 bloco 5: pagamento com estorna_id aceito'; end if;
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'estorno', 4999, 'k7', '91000000-0000-4000-8000-000000000001'));
  if e is null or e not like '%valor do lançamento original%' then raise exception 'gate_010 bloco 5: estorno com valor diferente aceito (%)', e; end if;
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a2', 'estorno', 5000, 'k7', '91000000-0000-4000-8000-000000000001'));
  if e is null then raise exception 'gate_010 bloco 5: estorno em outro profissional aceito'; end if;
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-00000000000b', 'estorno', 5000, 'k7', '91000000-0000-4000-8000-000000000001'));
  if e is null then raise exception 'gate_010 bloco 5: estorno cruzando empresa aceito'; end if;
  execute pg_temp.pag('91000000-0000-4000-8000-000000000008', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'estorno', 5000, 'k8', '91000000-0000-4000-8000-000000000001');
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000009', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'estorno', 5000, 'k9', '91000000-0000-4000-8000-000000000001'));
  if e is null then raise exception 'gate_010 bloco 5: segundo estorno do mesmo lançamento aceito'; end if;
  e := pg_temp.erro_de(pg_temp.pag('91000000-0000-4000-8000-000000000009', 'e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a', 'estorno', 5000, 'k9', '91000000-0000-4000-8000-000000000008'));
  if e is null or e not like '%não pode ser estornado%' then raise exception 'gate_010 bloco 5: estorno de estorno aceito (%)', e; end if;
end $$;

-- 6. Caixa: ajuste válido grava; tipo, valor e motivo inválidos são recusados.
do $$ declare e text; begin
  insert into caixa_ajustes (empresa_id, data, tipo, valor_centavos, motivo, idempotency_key, actor_id)
    values ('e1000000-0000-4000-8000-00000000000a', current_date, 'sangria', 3000, 'Depósito no banco', 'a1', 'c1000000-0000-4000-8000-000000000001');
  e := pg_temp.erro_de($q$insert into caixa_ajustes (empresa_id, data, tipo, valor_centavos, motivo, idempotency_key, actor_id) values ('e1000000-0000-4000-8000-00000000000a', current_date, 'retirada', 100, 'Motivo válido', 'a2', 'c1000000-0000-4000-8000-000000000001')$q$);
  if e is null then raise exception 'gate_010 bloco 6: tipo inválido aceito'; end if;
  e := pg_temp.erro_de($q$insert into caixa_ajustes (empresa_id, data, tipo, valor_centavos, motivo, idempotency_key, actor_id) values ('e1000000-0000-4000-8000-00000000000a', current_date, 'sangria', -1, 'Motivo válido', 'a2', 'c1000000-0000-4000-8000-000000000001')$q$);
  if e is null then raise exception 'gate_010 bloco 6: valor negativo aceito'; end if;
  e := pg_temp.erro_de($q$insert into caixa_ajustes (empresa_id, data, tipo, valor_centavos, motivo, idempotency_key, actor_id) values ('e1000000-0000-4000-8000-00000000000a', current_date, 'sangria', 100, '  ', 'a2', 'c1000000-0000-4000-8000-000000000001')$q$);
  if e is null then raise exception 'gate_010 bloco 6: motivo vazio aceito'; end if;
  e := pg_temp.erro_de($q$insert into caixa_ajustes (empresa_id, data, tipo, valor_centavos, motivo, idempotency_key) values ('e1000000-0000-4000-8000-00000000000a', current_date, 'sangria', 100, 'Motivo válido', 'a2')$q$);
  if e is null then raise exception 'gate_010 bloco 6: ajuste sem autor aceito'; end if;
end $$;

-- 7. Fechamento: diferença tem de ser contado − esperado; dois fechamentos no dia convivem.
do $$ declare e text; begin
  insert into caixa_fechamentos (empresa_id, data, fundo_troco_centavos, esperado_dinheiro_centavos, contado_dinheiro_centavos, diferenca_centavos, idempotency_key, actor_id)
    values ('e1000000-0000-4000-8000-00000000000a', current_date, 10000, 15000, 14500, -500, 'f1', 'c1000000-0000-4000-8000-000000000001');
  insert into caixa_fechamentos (empresa_id, data, fundo_troco_centavos, esperado_dinheiro_centavos, contado_dinheiro_centavos, diferenca_centavos, idempotency_key, actor_id)
    values ('e1000000-0000-4000-8000-00000000000a', current_date, 10000, 15000, 15000, 0, 'f2', 'c1000000-0000-4000-8000-000000000001');
  e := pg_temp.erro_de($q$insert into caixa_fechamentos (empresa_id, data, esperado_dinheiro_centavos, contado_dinheiro_centavos, diferenca_centavos, idempotency_key, actor_id) values ('e1000000-0000-4000-8000-00000000000a', current_date, 15000, 14500, 0, 'f3', 'c1000000-0000-4000-8000-000000000001')$q$);
  if e is null then raise exception 'gate_010 bloco 7: diferença incoerente aceita'; end if;
  e := pg_temp.erro_de($q$insert into caixa_fechamentos (empresa_id, data, esperado_dinheiro_centavos, contado_dinheiro_centavos, diferenca_centavos, idempotency_key, actor_id) values ('e1000000-0000-4000-8000-00000000000a', current_date, 15000, 15000, 0, 'f1', 'c1000000-0000-4000-8000-000000000001')$q$);
  if e is null then raise exception 'gate_010 bloco 7: chave repetida aceita'; end if;
end $$;

-- 8. Imutabilidade: update, delete e truncate falham nas três tabelas.
do $$ declare t text; e text; begin
  foreach t in array array['comissao_pagamentos', 'caixa_ajustes', 'caixa_fechamentos'] loop
    e := pg_temp.erro_de(format('update %I set created_at = now()', t));
    if e is null or e not like '%ledger imutável%' then raise exception 'gate_010 bloco 8: update em % passou (%)', t, e; end if;
    e := pg_temp.erro_de(format('delete from %I', t));
    if e is null or e not like '%ledger imutável%' then raise exception 'gate_010 bloco 8: delete em % passou (%)', t, e; end if;
    e := pg_temp.erro_de(format('truncate %I cascade', t));
    if e is null then raise exception 'gate_010 bloco 8: truncate em % passou', t; end if;
  end loop;
end $$;

-- 9. Permissões: RLS ligado; anon/authenticated sem nada; service_role só select e insert.
do $$ declare t text; begin
  foreach t in array array['comissao_pagamentos', 'caixa_ajustes', 'caixa_fechamentos'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'gate_010 bloco 9: RLS desligado em %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select, insert') then raise exception 'gate_010 bloco 9: anon/authenticated com acesso a %', t; end if;
    if not has_table_privilege('service_role', 'public.' || t, 'select') or not has_table_privilege('service_role', 'public.' || t, 'insert') then raise exception 'gate_010 bloco 9: service_role sem select/insert em %', t; end if;
    if has_table_privilege('service_role', 'public.' || t, 'update') or has_table_privilege('service_role', 'public.' || t, 'delete') or has_table_privilege('service_role', 'public.' || t, 'truncate') then raise exception 'gate_010 bloco 9: service_role pode alterar %', t; end if;
  end loop;
end $$;

-- 10. Empresa com lançamento não pode ser apagada (on delete restrict + ledger).
do $$ declare e text; begin
  e := pg_temp.erro_de($q$delete from empresas where id = 'e1000000-0000-4000-8000-00000000000a'$q$);
  if e is null then raise exception 'gate_010 bloco 10: empresa com histórico foi apagada'; end if;
end $$;

rollback;
\echo gate_010 OK (10 blocos)
