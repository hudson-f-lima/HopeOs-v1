-- Gate SQL da migration 009 (estorno de comanda, D-013). Transação desfeita no
-- final: não deixa resíduo. Cada bloco falha com mensagem explícita (número do bloco).
-- Controle negativo: supabase/tests/controle_negativo_009.sh roda este arquivo contra
-- versões da RPC sem a checagem de saldo e sem o filtro de tenant e exige falha.
\set ON_ERROR_STOP 1
begin;
set local client_min_messages = warning;

-- erro_de(sql): executa e devolve a mensagem do erro (null se não houve erro).
create function pg_temp.erro_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;
create function pg_temp.estornar(p_empresa uuid, p_comanda uuid, p_payload jsonb, p_actor uuid) returns text
language sql as $$
  select format('select comanda_estornar(%L, %L, %L::jsonb, %L)', p_empresa, p_comanda, p_payload::text, p_actor)
$$;
create function pg_temp.payload(p_key text, p_tipo text, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('idempotencyKey', p_key, 'data', current_date, 'tipo', p_tipo,
    'motivoCodigo', 'erro_lancamento', 'motivo', 'Cliente pagou duas vezes no balcão') || p_extra
$$;

-- Fixtures: duas empresas, papéis distintos, uma comanda com serviço, produto (3 un),
-- gorjeta e dois pagamentos (crédito com taxa + Pix).
insert into empresas (id, nome) values
  ('e9000000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e9000000-0000-4000-8000-00000000000b', 'Empresa B');
insert into app_users (id, email, nome) values
  ('c9000000-0000-4000-8000-000000000001', 'admin@a9.test', 'Admin A'),
  ('c9000000-0000-4000-8000-000000000002', 'gestor@a9.test', 'Gestor A'),
  ('c9000000-0000-4000-8000-000000000003', 'recepcao@a9.test', 'Recepção A'),
  ('c9000000-0000-4000-8000-000000000004', 'admin@b9.test', 'Admin B');
insert into empresa_memberships (empresa_id, user_id, role) values
  ('e9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-000000000001', 'admin'),
  ('e9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-000000000002', 'gestor'),
  ('e9000000-0000-4000-8000-00000000000a', 'c9000000-0000-4000-8000-000000000003', 'recepcao'),
  ('e9000000-0000-4000-8000-00000000000b', 'c9000000-0000-4000-8000-000000000004', 'admin');
insert into profissionais (id, empresa_id, nome) values
  ('a9000000-0000-4000-8000-00000000000a', 'e9000000-0000-4000-8000-00000000000a', 'Prof A'),
  ('a9000000-0000-4000-8000-00000000000b', 'e9000000-0000-4000-8000-00000000000b', 'Prof B');
insert into servicos (id, empresa_id, nome) values
  ('b9000000-0000-4000-8000-00000000000a', 'e9000000-0000-4000-8000-00000000000a', 'Corte'),
  ('b9000000-0000-4000-8000-00000000000b', 'e9000000-0000-4000-8000-00000000000b', 'Corte B');
-- Estoque já baixado pela venda: 10 − 3 = 7.
insert into produtos (id, empresa_id, nome, estoque_atual, custo_centavos, preco_venda_centavos) values
  ('d9000000-0000-4000-8000-00000000000a', 'e9000000-0000-4000-8000-00000000000a', 'Pomada', 7, 166, 333);

insert into comandos (id, empresa_id, data, itens_liquidos_centavos, gorjeta_bruta_centavos, total_recebido_centavos, taxa_total_centavos, total_comissao_centavos, total_gorjeta_liquida_centavos, receita_empresa_centavos) values
  ('19000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-00000000000a', current_date, 11000, 1000, 12000, 330, 4000, 970, 6700),
  ('19000000-0000-4000-8000-000000000002', 'e9000000-0000-4000-8000-00000000000a', current_date - 31, 500, 0, 500, 0, 0, 0, 500),
  ('19000000-0000-4000-8000-000000000003', 'e9000000-0000-4000-8000-00000000000a', current_date - 30, 500, 0, 500, 0, 0, 0, 500),
  ('19000000-0000-4000-8000-0000000000b1', 'e9000000-0000-4000-8000-00000000000b', current_date, 500, 0, 500, 0, 0, 0, 500);
insert into comando_itens (id, empresa_id, comando_id, tipo, servico_id, produto_id, profissional_id, quantidade, descricao,
  preco_unitario_centavos, custo_unitario_centavos, valor_bruto_centavos, valor_liquido_centavos, total_venda_centavos, total_custo_centavos,
  taxa_item_centavos, comissao_pct, comissao_centavos, receita_empresa_centavos) values
  ('29000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', 'servico',
   'b9000000-0000-4000-8000-00000000000a', null, 'a9000000-0000-4000-8000-00000000000a', 1, 'Corte', 10000, 0, 10000, 10000, 10000, 0, 300, 40, 4000, 5700),
  ('29000000-0000-4000-8000-000000000002', 'e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', 'produto',
   null, 'd9000000-0000-4000-8000-00000000000a', null, 3, 'Pomada', 333, 166, 1000, 1000, 1000, 500, 0, 0, 0, 1000),
  ('29000000-0000-4000-8000-000000000003', 'e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000002', 'servico',
   'b9000000-0000-4000-8000-00000000000a', null, 'a9000000-0000-4000-8000-00000000000a', 1, 'Corte', 500, 0, 500, 500, 500, 0, 0, 0, 0, 500),
  ('29000000-0000-4000-8000-000000000004', 'e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003', 'servico',
   'b9000000-0000-4000-8000-00000000000a', null, 'a9000000-0000-4000-8000-00000000000a', 1, 'Corte', 500, 0, 500, 500, 500, 0, 0, 0, 0, 500),
  ('29000000-0000-4000-8000-0000000000b1', 'e9000000-0000-4000-8000-00000000000b', '19000000-0000-4000-8000-0000000000b1', 'servico',
   'b9000000-0000-4000-8000-00000000000b', null, 'a9000000-0000-4000-8000-00000000000b', 1, 'Corte B', 500, 0, 500, 500, 500, 0, 0, 0, 0, 500);
insert into comando_pagamentos (empresa_id, comando_id, forma_code, valor_centavos, taxa_total_centavos) values
  ('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', 'credito', 10000, 330),
  ('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', 'pix', 2000, 0),
  ('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000002', 'pix', 500, 0),
  ('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003', 'pix', 500, 0),
  ('e9000000-0000-4000-8000-00000000000b', '19000000-0000-4000-8000-0000000000b1', 'pix', 500, 0);
insert into caixa_movimentos (empresa_id, comando_id, data, tipo, forma_code, valor_centavos) values
  ('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', current_date, 'entrada_pagamento', 'credito', 10000),
  ('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', current_date, 'entrada_pagamento', 'pix', 2000);
insert into comando_gorjetas (empresa_id, comando_id, profissional_id, valor_bruto_centavos, taxa_centavos, valor_liquido_centavos, regra) values
  ('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-00000000000a', 1000, 30, 970, 'automatic');

-- 01 parcial: 1 de 3 unidades; sem forma informada com 2 formas com saldo → recusa;
--    com Pix → 333 (1/3 de 1000, truncado), caixa −333 hoje, estoque 7→8 com autoria.
do $$
declare r jsonb; e text;
begin
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k01', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":1}]}'), 'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_FORMA_OBRIGATORIA', '01 sem forma com 2 formas deveria recusar: ' || coalesce(e, 'passou');
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k01', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":1}],"reembolsos":[{"formaCode":"pix","valorCentavos":300}]}'), 'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_REEMBOLSO_DIVERGENTE', '01 reembolso diferente dos itens deveria recusar: ' || coalesce(e, 'passou');
  r := comanda_estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k01', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":1}],"reembolsos":[{"formaCode":"pix","valorCentavos":333}]}'),
    'c9000000-0000-4000-8000-000000000001');
  assert (r->>'idempotent')::boolean = false, '01 primeira chamada marcada como idempotente';
  assert (r->>'itensCentavos')::int = 333 and (r->>'reembolsoCentavos')::int = 333 and (r->>'custoCentavos')::int = 166, '01 valores do parcial: ' || r::text;
  assert (r->>'gorjetaBrutaCentavos')::int = 0, '01 parcial reverteu gorjeta';
  assert r->>'statusComanda' = 'estornado_parcial', '01 status';
  assert (select sum(valor_centavos) from caixa_movimentos where comando_id = '19000000-0000-4000-8000-000000000001' and tipo = 'estorno_pagamento' and data = current_date and forma_code = 'pix') = -333, '01 caixa negativo do dia';
  assert (select estoque_atual from produtos where id = 'd9000000-0000-4000-8000-00000000000a') = 8, '01 estoque não devolvido';
  assert exists (select 1 from produto_estoque_movimentos where tipo = 'devolucao' and quantidade = 1 and saldo_anterior = 7 and saldo_posterior = 8
                 and actor_id = 'c9000000-0000-4000-8000-000000000001'), '01 movimento de devolução com autoria';
  assert (select actor_id from comanda_estornos where id = (r->>'estornoId')::uuid) = 'c9000000-0000-4000-8000-000000000001', '01 actor_id do estorno';
end $$;

-- 02 idempotência: mesma chave + mesmo pedido (outra ordem de chaves) = mesmo estorno;
--    mesma chave + pedido diferente = IDEMPOTENCY_MISMATCH.
do $$
declare r1 uuid; r jsonb; e text;
begin
  select id into r1 from comanda_estornos where idempotency_key = 'k01';
  r := comanda_estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    '{"reembolsos":[{"valorCentavos":333,"formaCode":"pix"}],"motivo":"Cliente pagou duas vezes no balcão","motivoCodigo":"erro_lancamento","tipo":"parcial","itens":[{"quantidade":1,"comandoItemId":"29000000-0000-4000-8000-000000000002"}],"idempotencyKey":"k01"}'::jsonb
      || jsonb_build_object('data', current_date),
    'c9000000-0000-4000-8000-000000000001');
  assert (r->>'idempotent')::boolean and (r->>'estornoId')::uuid = r1, '02 mesma chave não devolveu o mesmo estorno';
  assert (select count(*) from comanda_estornos where comando_id = '19000000-0000-4000-8000-000000000001') = 1, '02 idempotência gravou de novo';
  assert (select estoque_atual from produtos where id = 'd9000000-0000-4000-8000-00000000000a') = 8, '02 idempotência devolveu estoque de novo';
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k01', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":2}],"reembolsos":[{"formaCode":"pix","valorCentavos":666}]}'),
    'c9000000-0000-4000-8000-000000000001'));
  assert e = 'IDEMPOTENCY_MISMATCH', '02 mesma chave com outro pedido: ' || coalesce(e, 'passou');
end $$;

-- 03 Σ estornos parciais ≤ vendido: 2ª unidade (gestor) = 333; pedir 2 com 1 de saldo
--    → ESTORNO_EXCEDE; a última unidade leva o resto (334, custo 168). Σ = original.
do $$
declare r jsonb; e text;
begin
  r := comanda_estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k03a', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":1}],"reembolsoForma":"pix"}'),
    'c9000000-0000-4000-8000-000000000002');
  assert (r->>'itensCentavos')::int = 333, '03 segunda unidade';
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k03b', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":2}],"reembolsos":[{"formaCode":"pix","valorCentavos":334}]}'),
    'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_EXCEDE', '03 aceitou estorno acima do vendido (soma dos parciais): ' || coalesce(e, 'passou');
  r := comanda_estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k03c', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":1,"devolveEstoque":true}],"reembolsos":[{"formaCode":"pix","valorCentavos":334}]}'),
    'c9000000-0000-4000-8000-000000000001');
  assert (r->>'itensCentavos')::int = 334 and (r->>'custoCentavos')::int = 168, '03 resto exato no último estorno: ' || r::text;
  assert (select sum(quantidade) from comanda_estorno_itens where comando_item_id = '29000000-0000-4000-8000-000000000002') = 3, '03 quantidade estornada';
  assert (select sum(valor_liquido_centavos) from comanda_estorno_itens where comando_item_id = '29000000-0000-4000-8000-000000000002') = 1000, '03 Σ valor ≠ original';
  assert (select sum(custo_centavos) from comanda_estorno_itens where comando_item_id = '29000000-0000-4000-8000-000000000002') = 500, '03 Σ custo ≠ original';
  assert (select estoque_atual from produtos where id = 'd9000000-0000-4000-8000-00000000000a') = 10, '03 estoque final';
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k03d', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000002","quantidade":1}],"reembolsos":[{"formaCode":"pix","valorCentavos":1}]}'),
    'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_EXCEDE', '03 aceitou estorno de item já todo estornado: ' || coalesce(e, 'passou');
end $$;

-- 04 papel conferido no banco: recepção, ator de outra empresa e ator nulo recusados.
do $$
declare e text;
begin
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003',
    pg_temp.payload('k04a', 'total'), 'c9000000-0000-4000-8000-000000000003'));
  assert e = 'ESTORNO_FORBIDDEN', '04 recepção estornou: ' || coalesce(e, 'passou');
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003',
    pg_temp.payload('k04b', 'total'), 'c9000000-0000-4000-8000-000000000004'));
  assert e = 'ator sem membership ativa na empresa', '04 admin de outra empresa estornou: ' || coalesce(e, 'passou');
  e := pg_temp.erro_de(format('select comanda_estornar(%L, %L, %L::jsonb, null)', 'e9000000-0000-4000-8000-00000000000a',
    '19000000-0000-4000-8000-000000000003', pg_temp.payload('k04c', 'total')::text));
  assert e = 'ESTORNO_PAYLOAD_INVALIDO', '04 ator nulo estornou: ' || coalesce(e, 'passou');
end $$;

-- 05 tenant: admin da B, com a empresa B, pede a comanda da A → COMANDA_NOT_FOUND;
--    item de comanda de outra empresa num parcial → ESTORNO_ITEM_INVALIDO.
do $$
declare e text;
begin
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000b', '19000000-0000-4000-8000-000000000003',
    pg_temp.payload('k05a', 'total'), 'c9000000-0000-4000-8000-000000000004'));
  assert e = 'COMANDA_NOT_FOUND', '05 estornou comanda de outra empresa: ' || coalesce(e, 'passou');
  assert not exists (select 1 from comanda_estornos where comando_id = '19000000-0000-4000-8000-000000000003'), '05 gravou estorno cruzado';
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003',
    pg_temp.payload('k05b', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-0000000000b1","quantidade":1}]}'), 'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_ITEM_INVALIDO', '05 aceitou item de outra empresa: ' || coalesce(e, 'passou');
end $$;

-- 06 prazo: comanda de 31 dias → recusa; de 30 dias → passa. Data do estorno ≠ hoje → recusa.
do $$
declare e text; r jsonb;
begin
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000002',
    pg_temp.payload('k06a', 'total'), 'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_PRAZO_EXPIRADO', '06 estornou comanda com 31 dias: ' || coalesce(e, 'passou');
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003',
    pg_temp.payload('k06b', 'total', jsonb_build_object('data', current_date - 5)), 'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_DATA_INVALIDA', '06 aceitou estorno lançado em outro dia: ' || coalesce(e, 'passou');
  r := comanda_estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003',
    pg_temp.payload('k06c', 'total'), 'c9000000-0000-4000-8000-000000000001');
  assert (r->>'reembolsoCentavos')::int = 500 and r->>'data' = current_date::text, '06 comanda de 30 dias, lançada hoje: ' || r::text;
  assert (select data from caixa_movimentos where comando_id = '19000000-0000-4000-8000-000000000003' and tipo = 'estorno_pagamento') = current_date,
    '06 caixa do estorno no dia do estorno, não no da comanda';
end $$;

-- 07 total depois dos parciais: reverte o serviço, a gorjeta (bruta 1000 / líquida 970) e
--    devolve o saldo por forma (crédito 10000 + Pix 1000). Receita perdida = 6000 + taxa da gorjeta 30.
do $$
declare r jsonb;
begin
  r := comanda_estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k07', 'total'), 'c9000000-0000-4000-8000-000000000002');
  assert (r->>'itensCentavos')::int = 10000 and (r->>'comissaoCentavos')::int = 4000, '07 itens/comissão: ' || r::text;
  assert (r->>'gorjetaBrutaCentavos')::int = 1000 and (r->>'gorjetaLiquidaCentavos')::int = 970, '07 gorjeta revertida no total';
  assert (r->>'receitaEmpresaCentavos')::int = 6030, '07 receita perdida (taxa não volta): ' || (r->>'receitaEmpresaCentavos');
  assert (r->>'reembolsoCentavos')::int = 11000, '07 reembolso';
  assert r->'reembolsos' = '[{"formaCode":"credito","valorCentavos":10000},{"formaCode":"pix","valorCentavos":1000}]'::jsonb, '07 reembolso por forma: ' || (r->'reembolsos')::text;
  assert r->>'statusComanda' = 'estornado', '07 status';
  assert (select sum(valor_centavos) from caixa_movimentos where comando_id = '19000000-0000-4000-8000-000000000001') = 0, '07 caixa líquido da comanda ≠ 0';
  assert (select sum(valor_liquido_centavos) from comanda_estorno_itens where comando_id = '19000000-0000-4000-8000-000000000001')
       = (select sum(valor_liquido_centavos) from comando_itens where comando_id = '19000000-0000-4000-8000-000000000001'), '07 Σ itens estornados ≠ vendido';
  assert (select sum(valor_centavos) from comanda_estorno_pagamentos where comando_id = '19000000-0000-4000-8000-000000000001') = 12000, '07 Σ reembolsos ≠ recebido';
  assert (select estoque_atual from produtos where id = 'd9000000-0000-4000-8000-00000000000a') = 10, '07 estoque devolvido duas vezes';
  -- Original intocado.
  assert (select total_recebido_centavos from comandos where id = '19000000-0000-4000-8000-000000000001') = 12000, '07 comanda original alterada';
end $$;

-- 08 depois do total: novo total ou parcial → ESTORNO_JA_TOTAL.
do $$
declare e text;
begin
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k08a', 'total'), 'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_JA_TOTAL', '08 total repetido: ' || coalesce(e, 'passou');
  e := pg_temp.erro_de(pg_temp.estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001',
    pg_temp.payload('k08b', 'parcial', '{"itens":[{"comandoItemId":"29000000-0000-4000-8000-000000000001","quantidade":1}]}'), 'c9000000-0000-4000-8000-000000000001'));
  assert e = 'ESTORNO_JA_TOTAL', '08 parcial após total: ' || coalesce(e, 'passou');
end $$;

-- 09 imutabilidade: update/delete recusados em todo o ledger; truncate e exclusão de
--    empresa com histórico também. A autoria da 007 continua com a própria mensagem.
do $$
declare t text; e text;
begin
  foreach t in array array['comandos', 'comando_itens', 'comando_pagamentos', 'comando_gorjetas', 'caixa_movimentos',
    'produto_estoque_movimentos', 'comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas'] loop
    e := pg_temp.erro_de(format('update public.%I set empresa_id = empresa_id where empresa_id = %L', t, 'e9000000-0000-4000-8000-00000000000a'));
    assert e like 'ledger imutável: UPDATE em %', format('09 update em %s: %s', t, coalesce(e, 'passou'));
    e := pg_temp.erro_de(format('delete from public.%I where empresa_id = %L', t, 'e9000000-0000-4000-8000-00000000000a'));
    assert e like 'ledger imutável: DELETE em %', format('09 delete em %s: %s', t, coalesce(e, 'passou'));
    e := pg_temp.erro_de(format('truncate public.%I cascade', t));
    assert e like 'ledger imutável: TRUNCATE em %', format('09 truncate em %s: %s', t, coalesce(e, 'passou'));
  end loop;
  e := pg_temp.erro_de($q$delete from empresas where id = 'e9000000-0000-4000-8000-00000000000a'$q$);
  assert e is not null, '09 empresa com histórico foi apagada';
  e := pg_temp.erro_de($q$update comandos set actor_id = 'c9000000-0000-4000-8000-000000000001' where id = '19000000-0000-4000-8000-000000000001'$q$);
  assert e = 'autoria de evento é imutável', '09 trigger de autoria da 007 deixou de ser o primeiro: ' || coalesce(e, 'passou');
end $$;

-- 10 restrições: estorno no caixa só negativo; estoque aceita 'devolucao' e recusa tipo desconhecido.
do $$
declare e text;
begin
  e := pg_temp.erro_de($q$insert into caixa_movimentos (empresa_id, data, tipo, forma_code, valor_centavos)
                          values ('e9000000-0000-4000-8000-00000000000a', current_date, 'estorno_pagamento', 'pix', 100)$q$);
  assert e like '%caixa_movimentos_estorno_negativo%', '10 estorno positivo no caixa: ' || coalesce(e, 'passou');
  e := pg_temp.erro_de($q$insert into produto_estoque_movimentos (empresa_id, produto_id, tipo, quantidade, saldo_anterior, saldo_posterior)
                          values ('e9000000-0000-4000-8000-00000000000a', 'd9000000-0000-4000-8000-00000000000a', 'xyz', 1, 0, 1)$q$);
  assert e like '%produto_estoque_movimentos_tipo_check%', '10 tipo de estoque desconhecido: ' || coalesce(e, 'passou');
end $$;

-- 11 permissões: anon/authenticated sem tabela nem RPC; service_role lê/insere, sem update/delete; RLS ligada.
do $$
declare t text; r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas'] loop
      assert not has_table_privilege(r, 'public.' || t, 'select'), format('11 %s lê %s', r, t);
      assert not has_table_privilege(r, 'public.' || t, 'insert'), format('11 %s escreve %s', r, t);
    end loop;
    assert not has_function_privilege(r, 'public.comanda_estornar(uuid, uuid, jsonb, uuid)', 'execute'), format('11 %s executa comanda_estornar', r);
    assert not has_function_privilege(r, 'public.comanda_estorno_resumo(uuid)', 'execute'), format('11 %s executa comanda_estorno_resumo', r);
  end loop;
  assert has_function_privilege('service_role', 'public.comanda_estornar(uuid, uuid, jsonb, uuid)', 'execute'), '11 service_role sem RPC';
  foreach t in array array['comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas'] loop
    assert has_table_privilege('service_role', 'public.' || t, 'select') and has_table_privilege('service_role', 'public.' || t, 'insert'), '11 service_role sem select/insert em ' || t;
    assert not has_table_privilege('service_role', 'public.' || t, 'update') and not has_table_privilege('service_role', 'public.' || t, 'delete'), '11 service_role com update/delete em ' || t;
  end loop;
  assert (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'), '11 tabela de public sem RLS';
end $$;
-- anon chamando a RPC de verdade (não só o catálogo).
set local role anon;
do $$ begin
  perform comanda_estornar('e9000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003', '{}'::jsonb, 'c9000000-0000-4000-8000-000000000001');
  raise exception '11 anon executou comanda_estornar';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
\echo 'OK gate_009 (11 blocos)'
