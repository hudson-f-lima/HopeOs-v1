-- Gate SQL da migration 021 (planos de assinatura, D-042). Transação desfeita no final.
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

insert into empresas (id, nome) values ('e2100000-0000-4000-8000-00000000000a', 'A'), ('e2100000-0000-4000-8000-00000000000b', 'B');
insert into servicos (id, empresa_id, nome) values
  ('b2100000-0000-4000-8000-0000000000a1', 'e2100000-0000-4000-8000-00000000000a', 'Corte'),
  ('b2100000-0000-4000-8000-0000000000a2', 'e2100000-0000-4000-8000-00000000000a', 'Barba'),
  ('b2100000-0000-4000-8000-0000000000b1', 'e2100000-0000-4000-8000-00000000000b', 'Corte B');
insert into profissionais (id, empresa_id, nome) values
  ('a2100000-0000-4000-8000-0000000000a1', 'e2100000-0000-4000-8000-00000000000a', 'Ana'),
  ('a2100000-0000-4000-8000-0000000000b1', 'e2100000-0000-4000-8000-00000000000b', 'Bia');

-- 1. Salvar cria plano + itens + profissionais; salvar de novo troca itens e profissionais.
do $$ declare v uuid; begin
  v := assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null,
    '{"nome":"Smart Corte 3a-5a","preco_centavos":9490,"comissao_regra":"rateio","comissao_percentual":50,"fora_regra_acao":"cobrar_percentual_consumir","fora_regra_percentual":50,"fora_regra_teto_ciclo":2}',
    '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1","limite_por_ciclo":4,"dias_semana":[2,3,4],"horario_inicio":"09:00","horario_fim":"17:00","intervalo_min_dias":7}]',
    array['a2100000-0000-4000-8000-0000000000a1']::uuid[]);
  perform 1 from assinatura_planos where id = v and periodicidade = 'mensal' and tipo_vencimento = 'base_contratacao' and tolerancia_dias = 7 and cobranca = 'manual';
  if not found then raise exception 'gate_021 bloco 1: padrões errados'; end if;
  if (select dias_semana from assinatura_plano_itens where plano_id = v) <> array[2,3,4]::smallint[] then raise exception 'gate_021 bloco 1: dias da semana'; end if;
  perform assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', v,
    '{"nome":"Smart Corte 3a-5a","preco_centavos":9990,"comissao_regra":"tabela"}',
    '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1"},{"servico_id":"b2100000-0000-4000-8000-0000000000a2","desconto_percentual":50}]', null);
  if (select count(*) from assinatura_plano_itens where plano_id = v) <> 2 or exists (select 1 from assinatura_plano_profissionais where plano_id = v)
     or (select preco_centavos from assinatura_planos where id = v) <> 9990 or (select fora_regra_acao from assinatura_planos where id = v) <> 'bloquear' then
    raise exception 'gate_021 bloco 1: alteração não trocou itens/profissionais/padrões';
  end if;
end $$;

-- 2. Coerência: cada escolha traz o número dela; faixas.
do $$ begin
  if pg_temp.erro_de($q$insert into assinatura_planos (empresa_id, nome, preco_centavos, comissao_regra) values ('e2100000-0000-4000-8000-00000000000a', 'X1', 100, 'rateio')$q$) is null
     or pg_temp.erro_de($q$insert into assinatura_planos (empresa_id, nome, preco_centavos, comissao_regra, comissao_percentual, comissao_fixa_centavos) values ('e2100000-0000-4000-8000-00000000000a', 'X2', 100, 'tabela', 10, null)$q$) is null
     or pg_temp.erro_de($q$insert into assinatura_planos (empresa_id, nome, preco_centavos, comissao_regra, fora_regra_acao) values ('e2100000-0000-4000-8000-00000000000a', 'X3', 100, 'tabela', 'cobrar_percentual_consumir')$q$) is null
     or pg_temp.erro_de($q$insert into assinatura_planos (empresa_id, nome, preco_centavos, comissao_regra, tipo_vencimento) values ('e2100000-0000-4000-8000-00000000000a', 'X4', 100, 'tabela', 'data_fixa')$q$) is null
     or pg_temp.erro_de($q$insert into assinatura_planos (empresa_id, nome, preco_centavos, comissao_regra, comissao_percentual) values ('e2100000-0000-4000-8000-00000000000a', 'X5', 100, 'rateio', 101)$q$) is null
     or pg_temp.erro_de($q$insert into assinatura_planos (empresa_id, nome, preco_centavos, comissao_regra) values ('e2100000-0000-4000-8000-00000000000a', 'X6', -1, 'tabela')$q$) is null
     or pg_temp.erro_de($q$insert into assinatura_planos (empresa_id, nome, preco_centavos, comissao_regra, periodicidade) values ('e2100000-0000-4000-8000-00000000000a', 'X7', 100, 'tabela', 'semanal')$q$) is null then
    raise exception 'gate_021 bloco 2: combinação incoerente aceita';
  end if;
end $$;

-- 3. Itens: desconto, limite, dias, horário; nome repetido entre planos ativos.
do $$ begin
  if pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"I1","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1","desconto_percentual":0}]', null)$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"I2","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1","limite_por_ciclo":0}]', null)$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"I3","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1","dias_semana":[7]}]', null)$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"I4","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1","horario_inicio":"18:00","horario_fim":"09:00"}]', null)$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"I5","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1","horario_inicio":"09:00"}]', null)$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"I6","preco_centavos":1,"comissao_regra":"tabela"}', '[]', null)$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":" smart corte 3A-5A ","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1"}]', null)$q$) is null then
    raise exception 'gate_021 bloco 3: item inválido ou nome repetido aceito';
  end if;
end $$;

-- 4. Tudo ou nada: item ruim no meio não deixa plano nem itens para trás; nada cruza empresa.
do $$ declare antes int; begin
  antes := (select count(*) from assinatura_planos);
  if pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"T1","preco_centavos":1,"comissao_regra":"tabela"}',
       '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1"},{"servico_id":"b2100000-0000-4000-8000-0000000000a2","desconto_percentual":500}]', null)$q$) is null then
    raise exception 'gate_021 bloco 4: item inválido aceito';
  end if;
  if (select count(*) from assinatura_planos) <> antes then raise exception 'gate_021 bloco 4: plano ficou pela metade'; end if;
  if pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"T2","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000b1"}]', null)$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"T3","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1"}]', array['a2100000-0000-4000-8000-0000000000b1']::uuid[])$q$) is null
     or pg_temp.erro_de($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000b', (select id from assinatura_planos where empresa_id = 'e2100000-0000-4000-8000-00000000000a' limit 1), '{"nome":"T4","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000b1"}]', null)$q$) is null then
    raise exception 'gate_021 bloco 4: cruzou empresa';
  end if;
end $$;

-- 5. Arquivado não se altera pela função; nome volta a ficar livre.
do $$ declare v uuid; begin
  v := (select id from assinatura_planos where empresa_id = 'e2100000-0000-4000-8000-00000000000a' and nome = 'Smart Corte 3a-5a');
  update assinatura_planos set arquivado_em = now() where id = v;
  if pg_temp.erro_de(format($q$select assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', %L, '{"nome":"Z","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1"}]', null)$q$, v)) is null then
    raise exception 'gate_021 bloco 5: plano arquivado alterado';
  end if;
  perform assinatura_plano_salvar('e2100000-0000-4000-8000-00000000000a', null, '{"nome":"Smart Corte 3a-5a","preco_centavos":1,"comissao_regra":"tabela"}', '[{"servico_id":"b2100000-0000-4000-8000-0000000000a1"}]', null);
end $$;

-- 6. Acesso: anon/authenticated nada; service_role escreve itens só pela função; ninguém apaga plano.
do $$ begin
  if has_table_privilege('anon', 'assinatura_planos', 'select') or has_table_privilege('authenticated', 'assinatura_plano_itens', 'select')
     or has_table_privilege('service_role', 'assinatura_planos', 'delete') or has_table_privilege('service_role', 'assinatura_planos', 'insert')
     or has_table_privilege('service_role', 'assinatura_plano_itens', 'insert') or has_table_privilege('service_role', 'assinatura_plano_profissionais', 'delete')
     or not has_table_privilege('service_role', 'assinatura_planos', 'update')
     or has_function_privilege('anon', 'assinatura_plano_salvar(uuid, uuid, jsonb, jsonb, uuid[], uuid)', 'execute')
     or has_function_privilege('authenticated', 'assinatura_plano_salvar(uuid, uuid, jsonb, jsonb, uuid[], uuid)', 'execute')
     or not has_function_privilege('service_role', 'assinatura_plano_salvar(uuid, uuid, jsonb, jsonb, uuid[], uuid)', 'execute') then
    raise exception 'gate_021 bloco 6: grants errados';
  end if;
  if exists (select 1 from pg_proc where proname in ('assinatura_plano_salvar', 'assinatura_planos_mesma_empresa') and coalesce(array_to_string(proconfig, ','), '') not like '%search_path=%') then
    raise exception 'gate_021 bloco 6: função sem search_path fixo';
  end if;
end $$;

rollback;
\echo gate_021 OK (6 blocos)
