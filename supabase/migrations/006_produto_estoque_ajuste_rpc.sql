-- HOPE OS V1.2 — operações atômicas de cadastros reais
-- Execute depois da 001..005. Nao altera ledger financeiro nem checkout_close.
-- Objetivo: permitir operações compostas somente via backend service_role,
-- com rollback total em falha e sem exposição para anon/authenticated.

create or replace function public.produto_estoque_ajuste(
  p_empresa_id uuid,
  p_produto_id uuid,
  p_tipo text,
  p_quantidade int,
  p_custo_unitario_centavos int default 0,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_saldo_anterior int;
  v_saldo_posterior int;
  v_movimento_id uuid := gen_random_uuid();
  v_delta int;
begin
  if p_empresa_id is null then
    raise exception 'empresa_id obrigatorio' using errcode = 'P0001';
  end if;
  if p_produto_id is null then
    raise exception 'produto_id obrigatorio' using errcode = 'P0001';
  end if;
  if p_tipo not in ('entrada','ajuste','perda') then
    raise exception 'tipo de ajuste invalido: %', p_tipo using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'quantidade deve ser maior que zero' using errcode = 'P0001';
  end if;
  if coalesce(p_custo_unitario_centavos, 0) < 0 then
    raise exception 'custo_unitario_centavos nao pode ser negativo' using errcode = 'P0001';
  end if;

  select * into v_produto
  from produtos
  where id = p_produto_id and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'produto nao encontrado: %', p_produto_id using errcode = 'P0001';
  end if;

  if coalesce(v_produto.controla_estoque, true) = false then
    raise exception 'produto nao controla estoque: %', p_produto_id using errcode = 'P0001';
  end if;

  v_saldo_anterior := coalesce(v_produto.estoque_atual, 0);
  v_delta := case when p_tipo = 'perda' then -p_quantidade else p_quantidade end;
  v_saldo_posterior := v_saldo_anterior + v_delta;

  if v_saldo_posterior < 0 then
    raise exception 'ajuste deixaria estoque negativo para produto %', p_produto_id using errcode = 'P0001';
  end if;

  update produtos
  set estoque_atual = v_saldo_posterior,
      updated_at = now()
  where id = p_produto_id and empresa_id = p_empresa_id;

  insert into produto_estoque_movimentos (
    id, empresa_id, produto_id, tipo, quantidade, saldo_anterior, saldo_posterior,
    custo_unitario_centavos, motivo, created_at
  ) values (
    v_movimento_id, p_empresa_id, p_produto_id, p_tipo, p_quantidade, v_saldo_anterior,
    v_saldo_posterior, coalesce(p_custo_unitario_centavos, 0), p_motivo, now()
  );

  return jsonb_build_object(
    'produtoId', p_produto_id,
    'movimentoId', v_movimento_id,
    'tipo', p_tipo,
    'quantidade', p_quantidade,
    'saldoAnterior', v_saldo_anterior,
    'saldoPosterior', v_saldo_posterior
  );
end;
$$;

revoke all on function public.produto_estoque_ajuste(uuid, uuid, text, int, int, text) from public;
revoke all on function public.produto_estoque_ajuste(uuid, uuid, text, int, int, text) from anon;
revoke all on function public.produto_estoque_ajuste(uuid, uuid, text, int, int, text) from authenticated;
grant execute on function public.produto_estoque_ajuste(uuid, uuid, text, int, int, text) to service_role;

create or replace function public.profissional_servicos_replace(
  p_empresa_id uuid,
  p_profissional_id uuid,
  p_servico_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profissional profissionais%rowtype;
  v_servico_id uuid;
  v_distinct_count int;
  v_total_count int;
begin
  if p_empresa_id is null then
    raise exception 'empresa_id obrigatorio' using errcode = 'P0001';
  end if;
  if p_profissional_id is null then
    raise exception 'profissional_id obrigatorio' using errcode = 'P0001';
  end if;
  if p_servico_ids is null then
    raise exception 'servico_ids obrigatorio' using errcode = 'P0001';
  end if;

  select * into v_profissional
  from profissionais
  where id = p_profissional_id and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'profissional nao encontrado: %', p_profissional_id using errcode = 'P0001';
  end if;
  if coalesce(v_profissional.ativo, true) = false then
    raise exception 'profissional inativo: %', p_profissional_id using errcode = 'P0001';
  end if;

  select count(*), count(distinct x)
    into v_total_count, v_distinct_count
  from unnest(p_servico_ids) as x;

  if v_total_count <> v_distinct_count then
    raise exception 'servico_ids nao pode conter duplicidade' using errcode = 'P0001';
  end if;

  foreach v_servico_id in array p_servico_ids loop
    if not exists (
      select 1 from servicos
      where id = v_servico_id and empresa_id = p_empresa_id and ativo is not false
    ) then
      raise exception 'servico nao encontrado ou inativo: %', v_servico_id using errcode = 'P0001';
    end if;
  end loop;

  delete from profissional_servicos
  where empresa_id = p_empresa_id and profissional_id = p_profissional_id;

  insert into profissional_servicos (empresa_id, profissional_id, servico_id)
  select p_empresa_id, p_profissional_id, x
  from unnest(p_servico_ids) as x;

  return jsonb_build_object(
    'profissionalId', p_profissional_id,
    'servicoIds', coalesce(to_jsonb(p_servico_ids), '[]'::jsonb),
    'total', coalesce(array_length(p_servico_ids, 1), 0)
  );
end;
$$;

revoke all on function public.profissional_servicos_replace(uuid, uuid, uuid[]) from public;
revoke all on function public.profissional_servicos_replace(uuid, uuid, uuid[]) from anon;
revoke all on function public.profissional_servicos_replace(uuid, uuid, uuid[]) from authenticated;
grant execute on function public.profissional_servicos_replace(uuid, uuid, uuid[]) to service_role;

create or replace function public.produto_criar_com_estoque(
  p_empresa_id uuid,
  p_produto jsonb,
  p_estoque_inicial int default 0,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_produto_id uuid := gen_random_uuid();
  v_movimento_id uuid := null;
  v_nome text := nullif(trim(coalesce(p_produto->>'nome','')), '');
  v_custo int := coalesce((p_produto->>'custo_centavos')::int, 0);
  v_preco int := coalesce((p_produto->>'preco_venda_centavos')::int, 0);
  v_ativo boolean := coalesce((p_produto->>'ativo')::boolean, true);
  v_controla_estoque boolean := coalesce((p_produto->>'controla_estoque')::boolean, true);
begin
  if p_empresa_id is null then
    raise exception 'empresa_id obrigatorio' using errcode = 'P0001';
  end if;
  if p_produto is null or jsonb_typeof(p_produto) <> 'object' then
    raise exception 'produto deve ser objeto json' using errcode = 'P0001';
  end if;
  if v_nome is null then
    raise exception 'nome obrigatorio' using errcode = 'P0001';
  end if;
  if v_custo < 0 or v_preco < 0 then
    raise exception 'custo/preco nao podem ser negativos' using errcode = 'P0001';
  end if;
  if v_ativo and v_preco < v_custo then
    raise exception 'produto ativo nao pode vender abaixo do custo' using errcode = 'P0001';
  end if;
  if coalesce(p_estoque_inicial, 0) < 0 then
    raise exception 'estoque inicial nao pode ser negativo' using errcode = 'P0001';
  end if;
  if coalesce((p_produto->>'estoque_minimo')::int, 0) < 0 then
    raise exception 'estoque minimo nao pode ser negativo' using errcode = 'P0001';
  end if;

  insert into produtos (
    id, empresa_id, nome, sku, codigo_barras, categoria, custo_centavos,
    preco_venda_centavos, estoque_atual, estoque_minimo, comissao_pct,
    modelo_comissao, controla_estoque, ativo, updated_at
  ) values (
    v_produto_id,
    p_empresa_id,
    v_nome,
    nullif(p_produto->>'sku',''),
    nullif(p_produto->>'codigo_barras',''),
    coalesce(nullif(p_produto->>'categoria',''), 'Sem categoria'),
    v_custo,
    v_preco,
    case when v_controla_estoque then coalesce(p_estoque_inicial, 0) else 0 end,
    coalesce((p_produto->>'estoque_minimo')::int, 0),
    coalesce((p_produto->>'comissao_pct')::numeric, 0),
    coalesce(nullif(p_produto->>'modelo_comissao',''), 'bruto_salao'),
    v_controla_estoque,
    v_ativo,
    now()
  )
  returning * into v_produto;

  if v_controla_estoque and coalesce(p_estoque_inicial, 0) > 0 then
    v_movimento_id := gen_random_uuid();
    insert into produto_estoque_movimentos (
      id, empresa_id, produto_id, tipo, quantidade, saldo_anterior, saldo_posterior,
      custo_unitario_centavos, motivo, created_at
    ) values (
      v_movimento_id,
      p_empresa_id,
      v_produto_id,
      'entrada',
      p_estoque_inicial,
      0,
      p_estoque_inicial,
      v_custo,
      coalesce(p_motivo, 'Estoque inicial do cadastro de produto'),
      now()
    );
  end if;

  return jsonb_build_object(
    'produto', to_jsonb(v_produto),
    'estoque', case
      when v_movimento_id is null then null
      else jsonb_build_object(
        'movimentoId', v_movimento_id,
        'tipo', 'entrada',
        'quantidade', p_estoque_inicial,
        'saldoAnterior', 0,
        'saldoPosterior', p_estoque_inicial
      )
    end
  );
end;
$$;

revoke all on function public.produto_criar_com_estoque(uuid, jsonb, int, text) from public;
revoke all on function public.produto_criar_com_estoque(uuid, jsonb, int, text) from anon;
revoke all on function public.produto_criar_com_estoque(uuid, jsonb, int, text) from authenticated;
grant execute on function public.produto_criar_com_estoque(uuid, jsonb, int, text) to service_role;
