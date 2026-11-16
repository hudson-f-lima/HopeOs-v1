-- Gate SQL da migration 022 (assinantes, cobranças e uso na comanda, D-043). Transação desfeita no final.
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

insert into empresas (id, nome) values ('e2200000-0000-4000-8000-00000000000a', 'A'), ('e2200000-0000-4000-8000-00000000000b', 'B');
insert into app_users (id, email, nome) values ('c2200000-0000-4000-8000-000000000001', 'admin@a22.test', 'Admin A');
insert into empresa_memberships (empresa_id, user_id, role) values ('e2200000-0000-4000-8000-00000000000a', 'c2200000-0000-4000-8000-000000000001', 'admin');
insert into clientes (id, empresa_id, nome) values
  ('d2200000-0000-4000-8000-0000000000a1', 'e2200000-0000-4000-8000-00000000000a', 'Cli A'),
  ('d2200000-0000-4000-8000-0000000000b1', 'e2200000-0000-4000-8000-00000000000b', 'Cli B');
insert into servicos (id, empresa_id, nome) values
  ('b2200000-0000-4000-8000-0000000000a1', 'e2200000-0000-4000-8000-00000000000a', 'Corte'),
  ('b2200000-0000-4000-8000-0000000000b1', 'e2200000-0000-4000-8000-00000000000b', 'Corte B');
insert into profissionais (id, empresa_id, nome) values
  ('a2200000-0000-4000-8000-0000000000a1', 'e2200000-0000-4000-8000-00000000000a', 'Ana'),
  ('a2200000-0000-4000-8000-0000000000b1', 'e2200000-0000-4000-8000-00000000000b', 'Bia');
insert into assinatura_planos (id, empresa_id, nome, preco_centavos, comissao_regra, comissao_percentual) values
  ('f2200000-0000-4000-8000-0000000000a1', 'e2200000-0000-4000-8000-00000000000a', 'Plano A', 9490, 'rateio', 50),
  ('f2200000-0000-4000-8000-0000000000b1', 'e2200000-0000-4000-8000-00000000000b', 'Plano B', 9490, 'rateio', 50);

create function pg_temp.fechar(p_comanda uuid, p_preco int, p_usos jsonb) returns jsonb language sql as $$
  select checkout_close_assinatura('e2200000-0000-4000-8000-00000000000a',
    jsonb_build_object('id', p_comanda, 'idempotencyKey', 'k-' || p_comanda, 'data', current_date, 'hora', '10:00'),
    jsonb_build_object('totals', '{}'::jsonb, 'payments', '[]'::jsonb, 'gorjetas', '[]'::jsonb, 'itens', jsonb_build_array(
      jsonb_build_object('tipo', 'servico', 'servicoId', 'b2200000-0000-4000-8000-0000000000a1', 'profissionalId', 'a2200000-0000-4000-8000-0000000000a1',
        'quantidade', 1, 'descricao', 'Corte', 'precoUnitarioCentavos', p_preco, 'valorBrutoCentavos', p_preco, 'valorLiquidoCentavos', p_preco))),
    p_usos, 'c2200000-0000-4000-8000-000000000001', null)
$$;
create function pg_temp.uso(p_assinatura uuid, p_preco int, p_cobrado int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('assinaturaId', p_assinatura, 'servicoId', 'b2200000-0000-4000-8000-0000000000a1',
    'profissionalId', 'a2200000-0000-4000-8000-0000000000a1', 'precoUnitarioCentavos', p_preco, 'cicloInicio', current_date, 'tipo', 'coberto',
    'consomeUso', true, 'valorTabelaCentavos', 5500, 'valorCobradoCentavos', p_cobrado, 'acao', null, 'motivos', '[]'::jsonb))
$$;

-- 1. Assinatura válida; o mesmo cliente não assina o mesmo plano duas vezes (cancelada libera).
do $$ begin
  insert into assinaturas (id, empresa_id, cliente_id, plano_id, inicio)
  values ('a1100000-0000-4000-8000-0000000000a1', 'e2200000-0000-4000-8000-00000000000a', 'd2200000-0000-4000-8000-0000000000a1', 'f2200000-0000-4000-8000-0000000000a1', current_date);
  if pg_temp.erro_de($q$insert into assinaturas (empresa_id, cliente_id, plano_id, inicio) values ('e2200000-0000-4000-8000-00000000000a', 'd2200000-0000-4000-8000-0000000000a1', 'f2200000-0000-4000-8000-0000000000a1', current_date)$q$) is null then
    raise exception 'gate_022 bloco 1: plano repetido aceito';
  end if;
  update assinaturas set status = 'cancelada', cancelada_em = current_date where id = 'a1100000-0000-4000-8000-0000000000a1';
  insert into assinaturas (id, empresa_id, cliente_id, plano_id, inicio)
  values ('a1100000-0000-4000-8000-0000000000a2', 'e2200000-0000-4000-8000-00000000000a', 'd2200000-0000-4000-8000-0000000000a1', 'f2200000-0000-4000-8000-0000000000a1', current_date);
end $$;

-- 2. Coerência de estado e nada cruza empresa.
do $$ begin
  if pg_temp.erro_de($q$update assinaturas set status = 'pausada' where id = 'a1100000-0000-4000-8000-0000000000a2'$q$) is null
     or pg_temp.erro_de($q$update assinaturas set pausada_em = current_date where id = 'a1100000-0000-4000-8000-0000000000a2'$q$) is null
     or pg_temp.erro_de($q$insert into assinaturas (empresa_id, cliente_id, plano_id, inicio) values ('e2200000-0000-4000-8000-00000000000a', 'd2200000-0000-4000-8000-0000000000b1', 'f2200000-0000-4000-8000-0000000000a1', current_date)$q$) is null
     or pg_temp.erro_de($q$insert into assinaturas (empresa_id, cliente_id, plano_id, inicio) values ('e2200000-0000-4000-8000-00000000000a', 'd2200000-0000-4000-8000-0000000000a1', 'f2200000-0000-4000-8000-0000000000b1', current_date)$q$) is null then
    raise exception 'gate_022 bloco 2: estado incoerente ou referência de outra empresa aceita';
  end if;
end $$;

-- 3. Cobrança: uma por ciclo; paga exige data; de outra empresa não entra.
do $$ begin
  insert into assinatura_cobrancas (empresa_id, assinatura_id, ciclo_inicio, vencimento, valor_centavos)
  values ('e2200000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-0000000000a2', current_date, current_date, 9490);
  if pg_temp.erro_de($q$insert into assinatura_cobrancas (empresa_id, assinatura_id, ciclo_inicio, vencimento, valor_centavos) values ('e2200000-0000-4000-8000-00000000000a', 'a1100000-0000-4000-8000-0000000000a2', current_date, current_date, 9490)$q$) is null
     or pg_temp.erro_de($q$update assinatura_cobrancas set estado = 'paga'$q$) is null
     or pg_temp.erro_de($q$insert into assinatura_cobrancas (empresa_id, assinatura_id, ciclo_inicio, vencimento, valor_centavos) values ('e2200000-0000-4000-8000-00000000000b', 'a1100000-0000-4000-8000-0000000000a2', current_date + 30, current_date, 9490)$q$) is null then
    raise exception 'gate_022 bloco 3: cobrança inválida aceita';
  end if;
  update assinatura_cobrancas set estado = 'paga', pago_em = current_date;
end $$;

-- 4. Fechamento com cobertura: grava a comanda e o uso preso ao item; repetir não duplica.
do $$ declare r jsonb; r2 jsonb; begin
  r := pg_temp.fechar('19200000-0000-4000-8000-000000000001', 0, pg_temp.uso('a1100000-0000-4000-8000-0000000000a2', 0, 0));
  if r->>'comandoId' is null or coalesce((r->>'idempotent')::boolean, false) then raise exception 'gate_022 bloco 4: fechamento não gravou'; end if;
  if (select count(*) from assinatura_usos u join comando_itens i on i.id = u.comando_item_id where u.comando_id = '19200000-0000-4000-8000-000000000001' and i.preco_unitario_centavos = 0) <> 1 then
    raise exception 'gate_022 bloco 4: uso não ficou preso ao item';
  end if;
  r2 := pg_temp.fechar('19200000-0000-4000-8000-000000000001', 0, pg_temp.uso('a1100000-0000-4000-8000-0000000000a2', 0, 0));
  if not coalesce((r2->>'idempotent')::boolean, false) or (select count(*) from assinatura_usos) <> 1 then
    raise exception 'gate_022 bloco 4: repetição duplicou o uso';
  end if;
end $$;

-- 5. Tudo ou nada: uso sem item correspondente desfaz a comanda inteira.
do $$ declare antes int; begin
  antes := (select count(*) from comandos);
  if pg_temp.erro_de($q$select pg_temp.fechar('19200000-0000-4000-8000-000000000002', 5500, pg_temp.uso('a1100000-0000-4000-8000-0000000000a2', 4000, 0))$q$) is null then
    raise exception 'gate_022 bloco 5: uso sem item aceito';
  end if;
  if (select count(*) from comandos) <> antes then raise exception 'gate_022 bloco 5: comanda ficou gravada sem o uso'; end if;
  if pg_temp.erro_de($q$select checkout_close_assinatura('e2200000-0000-4000-8000-00000000000a', '{}'::jsonb, '{}'::jsonb, '{"x":1}'::jsonb)$q$) is null then
    raise exception 'gate_022 bloco 5: p_usos fora do formato aceito';
  end if;
end $$;

-- 6. Livro-caixa: uso e estorno de uso não se alteram nem se apagam.
do $$ begin
  if pg_temp.erro_de($q$update assinatura_usos set valor_cobrado_centavos = 1$q$) is null
     or pg_temp.erro_de($q$delete from assinatura_usos$q$) is null
     or pg_temp.erro_de($q$truncate assinatura_usos$q$) is null
     or pg_temp.erro_de($q$truncate assinatura_usos_estornos$q$) is null then
    raise exception 'gate_022 bloco 6: livro-caixa alterável';
  end if;
end $$;

-- 7. Estornar o item devolve o uso (gatilho); só uma vez.
do $$ declare est uuid := '3a200000-0000-4000-8000-000000000001'; item uuid; begin
  select comando_item_id into item from assinatura_usos limit 1;
  insert into comanda_estornos (id, empresa_id, comando_id, tipo, motivo_codigo, motivo, data, idempotency_key, payload_hash, actor_id)
  values (est, 'e2200000-0000-4000-8000-00000000000a', '19200000-0000-4000-8000-000000000001', 'total', 'erro_lancamento', 'Lançado por engano no balcão', current_date, 'k-est', 'h', 'c2200000-0000-4000-8000-000000000001');
  insert into comanda_estorno_itens (empresa_id, estorno_id, comando_id, comando_item_id, quantidade, valor_liquido_centavos, comissao_centavos, receita_empresa_centavos)
  values ('e2200000-0000-4000-8000-00000000000a', est, '19200000-0000-4000-8000-000000000001', item, 1, 0, 0, 0);
  if (select count(*) from assinatura_usos_estornos where estorno_id = est) <> 1 then raise exception 'gate_022 bloco 7: uso não foi devolvido'; end if;
  if pg_temp.erro_de(format($q$insert into assinatura_usos_estornos (empresa_id, uso_id, estorno_id) select empresa_id, id, %L from assinatura_usos$q$, est)) is null then
    raise exception 'gate_022 bloco 7: mesmo uso devolvido duas vezes';
  end if;
end $$;

-- 8. Acesso: só service_role; sem delete; uso só pela função; funções com search_path fixo.
do $$ begin
  if has_table_privilege('anon', 'assinaturas', 'select') or has_table_privilege('authenticated', 'assinatura_usos', 'select')
     or has_table_privilege('service_role', 'assinaturas', 'delete') or has_table_privilege('service_role', 'assinatura_cobrancas', 'delete')
     or has_table_privilege('service_role', 'assinatura_usos', 'insert') or has_table_privilege('service_role', 'assinatura_usos_estornos', 'insert')
     or not has_table_privilege('service_role', 'assinaturas', 'update')
     or has_function_privilege('anon', 'checkout_close_assinatura(uuid, jsonb, jsonb, jsonb, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'checkout_close_assinatura(uuid, jsonb, jsonb, jsonb, uuid, uuid)', 'execute')
     or not has_function_privilege('service_role', 'checkout_close_assinatura(uuid, jsonb, jsonb, jsonb, uuid, uuid)', 'execute') then
    raise exception 'gate_022 bloco 8: grants errados';
  end if;
  if exists (select 1 from pg_proc where proname in ('checkout_close_assinatura', 'assinatura_mesma_empresa', 'assinatura_usos_devolver')
             and coalesce(array_to_string(proconfig, ','), '') not like '%search_path=%') then
    raise exception 'gate_022 bloco 8: função sem search_path fixo';
  end if;
end $$;

rollback;
\echo gate_022 OK (8 blocos)
