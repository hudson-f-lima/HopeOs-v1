-- HOPE OS V1.0.3 — Checkout close RPC polimórfica
-- Execute depois da 001_init.sql.
-- A 003_lock_rpc_permissions.sql deve ser executada em seguida para travar a função.

create or replace function public.checkout_close(
  p_empresa_id uuid,
  p_payload jsonb,
  p_preview jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comando_id uuid;
  v_existing comandos%rowtype;
  v_now timestamptz := now();
  v_date date := coalesce(nullif(p_payload->>'data','')::date, current_date);
  v_time time := coalesce(nullif(p_payload->>'hora','')::time, current_time);
  v_idempotency_key text := nullif(p_payload->>'idempotencyKey','');
  v_cliente_id uuid := nullif(p_payload->>'clienteId','')::uuid;
  v_item jsonb;
  v_payment jsonb;
  v_tip jsonb;
  v_item_id uuid;
  v_tipo text;
  v_produto_id uuid;
  v_quantidade int;
  v_saldo_anterior int;
  v_saldo_posterior int;
  v_controla_estoque boolean;
  v_produto_ativo boolean;
  v_item_count int := 0;
  v_payment_count int := 0;
  v_tip_count int := 0;
  v_caixa_count int := 0;
  v_estoque_count int := 0;
begin
  if p_empresa_id is null then
    raise exception 'empresa_id obrigatório' using errcode = 'P0001';
  end if;

  if v_idempotency_key is not null then
    select * into v_existing
    from comandos
    where empresa_id = p_empresa_id and idempotency_key = v_idempotency_key
    limit 1;

    if found then
      return jsonb_build_object('idempotent', true, 'comandoId', v_existing.id, 'status', v_existing.status, 'message', 'Checkout já fechado para esta idempotencyKey.');
    end if;
  end if;

  v_comando_id := coalesce(nullif(p_payload->>'id','')::uuid, gen_random_uuid());

  select * into v_existing
  from comandos
  where id = v_comando_id and empresa_id = p_empresa_id
  limit 1;

  if found then
    return jsonb_build_object('idempotent', true, 'comandoId', v_existing.id, 'status', v_existing.status, 'message', 'Checkout já fechado para este id.');
  end if;

  begin
    insert into comandos (
      id, empresa_id, cliente_id, data, hora,
      subtotal_servicos_centavos,
      subtotal_produtos_centavos,
      total_itens_centavos,
      total_custo_produtos_centavos,
      lucro_bruto_produtos_centavos,
      desconto_centavos,
      servicos_liquidos_centavos,
      produtos_liquidos_centavos,
      itens_liquidos_centavos,
      gorjeta_bruta_centavos,
      total_recebido_centavos,
      taxa_total_centavos,
      taxa_servico_centavos,
      taxa_gorjeta_centavos,
      total_comissao_centavos,
      total_gorjeta_liquida_centavos,
      receita_empresa_centavos,
      status,
      idempotency_key,
      snapshot,
      created_at
    ) values (
      v_comando_id, p_empresa_id, v_cliente_id, v_date, v_time,
      coalesce((p_preview->'totals'->>'subtotalServicosCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'subtotalProdutosCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'totalItensCentavos')::int, coalesce((p_preview->'totals'->>'subtotalServicosCentavos')::int, 0)),
      coalesce((p_preview->'totals'->>'totalCustoProdutosCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'lucroBrutoProdutosCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'descontoCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'servicosLiquidosCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'produtosLiquidosCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'itensLiquidosCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'gorjetaBrutaCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'totalRecebidoCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'taxaTotalCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'taxaServicoCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'taxaGorjetaCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'totalComissaoCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'totalGorjetaLiquidaCentavos')::int, 0),
      coalesce((p_preview->'totals'->>'receitaEmpresaCentavos')::int, 0),
      'fechado',
      v_idempotency_key,
      jsonb_build_object('request', p_payload, 'preview', p_preview),
      v_now
    );
  exception when unique_violation then
    if v_idempotency_key is not null then
      select * into v_existing
      from comandos
      where empresa_id = p_empresa_id and idempotency_key = v_idempotency_key
      limit 1;

      if found then
        return jsonb_build_object('idempotent', true, 'comandoId', v_existing.id, 'status', v_existing.status, 'message', 'Checkout já fechado para esta idempotencyKey.');
      end if;
    end if;

    select * into v_existing
    from comandos
    where id = v_comando_id and empresa_id = p_empresa_id
    limit 1;

    if found then
      return jsonb_build_object('idempotent', true, 'comandoId', v_existing.id, 'status', v_existing.status, 'message', 'Checkout já fechado para este id.');
    end if;

    raise;
  end;

  for v_item in select * from jsonb_array_elements(coalesce(p_preview->'itens','[]'::jsonb)) loop
    v_item_id := gen_random_uuid();
    v_tipo := coalesce(v_item->>'tipo','servico');
    v_produto_id := nullif(v_item->>'produtoId','')::uuid;
    v_quantidade := coalesce((v_item->>'quantidade')::int, 1);

    insert into comando_itens (
      id, empresa_id, comando_id, tipo, servico_id, produto_id, profissional_id, quantidade, descricao,
      preco_unitario_centavos, custo_unitario_centavos,
      valor_bruto_centavos, desconto_centavos, valor_liquido_centavos,
      total_venda_centavos, total_custo_centavos, lucro_bruto_centavos,
      duracao_min, taxa_item_centavos, modelo_comissao, comissao_pct,
      comissao_centavos, receita_empresa_centavos
    ) values (
      v_item_id,
      p_empresa_id,
      v_comando_id,
      v_tipo,
      nullif(v_item->>'servicoId','')::uuid,
      v_produto_id,
      nullif(v_item->>'profissionalId','')::uuid,
      v_quantidade,
      coalesce(v_item->>'descricao', case when v_tipo='produto' then 'Produto' else 'Serviço' end),
      coalesce((v_item->>'precoUnitarioCentavos')::int, coalesce((v_item->>'valorBrutoCentavos')::int, 0)),
      coalesce((v_item->>'custoUnitarioCentavos')::int, 0),
      coalesce((v_item->>'valorBrutoCentavos')::int, 0),
      coalesce((v_item->>'descontoCentavos')::int, 0),
      coalesce((v_item->>'valorLiquidoCentavos')::int, 0),
      coalesce((v_item->>'totalVendaCentavos')::int, coalesce((v_item->>'valorBrutoCentavos')::int, 0)),
      coalesce((v_item->>'totalCustoCentavos')::int, 0),
      coalesce((v_item->>'lucroBrutoCentavos')::int, 0),
      coalesce((v_item->>'duracaoMin')::int, 0),
      coalesce((v_item->>'taxaItemCentavos')::int, 0),
      coalesce(v_item->>'modeloComissao','bruto_salao'),
      coalesce((v_item->>'comissaoPct')::numeric, 0),
      coalesce((v_item->>'comissaoCentavos')::int, 0),
      coalesce((v_item->>'receitaEmpresaCentavos')::int, 0)
    );
    v_item_count := v_item_count + 1;

    if v_tipo = 'produto' then
      select estoque_atual, controla_estoque, ativo
        into v_saldo_anterior, v_controla_estoque, v_produto_ativo
      from produtos
      where id = v_produto_id and empresa_id = p_empresa_id
      for update;

      if not found then
        raise exception 'produto não encontrado para baixa de estoque: %', v_produto_id using errcode = 'P0001';
      end if;
      if v_produto_ativo = false then
        raise exception 'produto inativo para baixa de estoque: %', v_produto_id using errcode = 'P0001';
      end if;

      if coalesce(v_controla_estoque, true) then
        if v_saldo_anterior < v_quantidade then
          raise exception 'estoque insuficiente para produto %', v_produto_id using errcode = 'P0001';
        end if;
        v_saldo_posterior := v_saldo_anterior - v_quantidade;
        update produtos
        set estoque_atual = v_saldo_posterior,
            updated_at = v_now
        where id = v_produto_id and empresa_id = p_empresa_id;

        insert into produto_estoque_movimentos (
          empresa_id, produto_id, comando_id, comando_item_id, tipo, quantidade,
          saldo_anterior, saldo_posterior, custo_unitario_centavos, motivo, created_at
        ) values (
          p_empresa_id, v_produto_id, v_comando_id, v_item_id, 'venda', v_quantidade,
          v_saldo_anterior, v_saldo_posterior,
          coalesce((v_item->>'custoUnitarioCentavos')::int, 0),
          'Baixa automática no checkout_close',
          v_now
        );
        v_estoque_count := v_estoque_count + 1;
      end if;
    end if;
  end loop;

  for v_payment in select * from jsonb_array_elements(coalesce(p_preview->'payments','[]'::jsonb)) loop
    insert into comando_pagamentos (
      empresa_id, comando_id, forma_code, valor_centavos,
      taxa_pct, taxa_fixa_centavos, taxa_total_centavos,
      taxa_servico_centavos, taxa_gorjeta_centavos
    ) values (
      p_empresa_id,
      v_comando_id,
      coalesce(v_payment->>'formaCode', v_payment->>'formaId', v_payment->>'code'),
      coalesce((v_payment->>'valorCentavos')::int, 0),
      coalesce((v_payment->>'taxaPct')::numeric, 0),
      coalesce((v_payment->>'taxaFixaCentavos')::int, 0),
      coalesce((v_payment->>'taxaTotalCentavos')::int, 0),
      coalesce((v_payment->>'taxaServicoCentavos')::int, 0),
      coalesce((v_payment->>'taxaGorjetaCentavos')::int, 0)
    );
    v_payment_count := v_payment_count + 1;

    insert into caixa_movimentos (
      empresa_id, comando_id, data, tipo, forma_code, valor_centavos, descricao, created_at
    ) values (
      p_empresa_id,
      v_comando_id,
      v_date,
      'entrada_pagamento',
      coalesce(v_payment->>'formaCode', v_payment->>'formaId', v_payment->>'code'),
      coalesce((v_payment->>'valorCentavos')::int, 0),
      'Entrada de checkout fechado',
      v_now
    );
    v_caixa_count := v_caixa_count + 1;
  end loop;

  for v_tip in select * from jsonb_array_elements(coalesce(p_preview->'gorjetas','[]'::jsonb)) loop
    insert into comando_gorjetas (
      empresa_id, comando_id, profissional_id,
      valor_bruto_centavos, taxa_centavos, valor_liquido_centavos,
      peso_valor, peso_tempo, peso_final, regra
    ) values (
      p_empresa_id,
      v_comando_id,
      nullif(v_tip->>'profissionalId','')::uuid,
      coalesce((v_tip->>'gorjetaBrutaCentavos')::int, 0),
      coalesce((v_tip->>'taxaGorjetaCentavos')::int, 0),
      coalesce((v_tip->>'gorjetaLiquidaCentavos')::int, 0),
      coalesce((v_tip->>'pesoValor')::numeric, 0),
      coalesce((v_tip->>'pesoTempo')::numeric, 0),
      coalesce((v_tip->>'pesoFinal')::numeric, 0),
      coalesce(v_tip->>'regra','automatic')
    );
    v_tip_count := v_tip_count + 1;
  end loop;

  return jsonb_build_object(
    'idempotent', false,
    'comandoId', v_comando_id,
    'status', 'fechado',
    'itens', v_item_count,
    'pagamentos', v_payment_count,
    'gorjetas', v_tip_count,
    'caixaMovimentos', v_caixa_count,
    'estoqueMovimentos', v_estoque_count
  );
end;
$$;
