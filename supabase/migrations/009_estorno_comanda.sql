-- KortexOS — Migration 009: estorno de comanda e imutabilidade do ledger.
-- Autorizada pelo Platform Owner em 2026-11-09 (D-013). Escopo: só estorno.
-- Desenho: docs/planning/ESTORNO_COMANDA_DRAFT.md (lançamentos inversos).
--
-- Princípios:
-- * Nada do ledger é alterado ou apagado: o estorno é um evento novo, com linhas
--   positivas que significam "valor revertido". Efeito líquido = original − Σ estornos.
-- * Caixa: linha tipo 'estorno_pagamento' com valor NEGATIVO na data do estorno.
-- * Estoque: tipo novo 'devolucao' em produto_estoque_movimentos.
-- * Só admin/gestor estornam (papel conferido aqui, além do RBAC da API); prazo de
--   30 dias da data da comanda; agenda não muda; taxa da maquininha não volta.
-- * Triggers de imutabilidade (update/delete/truncate) nas tabelas do ledger.
-- Não altera 001–008: troca o check de produto_estoque_movimentos.tipo por um novo.
-- Rollback: supabase/rollback/009_down.sql (recusa se houver estorno gravado).

begin;
set local client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. Tabelas do estorno
-- ---------------------------------------------------------------------------
create table if not exists comanda_estornos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  comando_id uuid not null references comandos(id) on delete restrict,
  tipo text not null check (tipo in ('total', 'parcial')),
  motivo_codigo text not null check (motivo_codigo in ('erro_lancamento', 'desistencia_cliente', 'insatisfacao', 'duplicidade', 'outro')),
  motivo text not null check (char_length(btrim(motivo)) between 10 and 500),
  data date not null,                                   -- dia do estorno (fuso da empresa, definido pelo servidor)
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  payload_hash text not null,
  itens_centavos int not null default 0 check (itens_centavos >= 0),          -- Σ valor líquido revertido
  custo_centavos int not null default 0 check (custo_centavos >= 0),
  comissao_centavos int not null default 0 check (comissao_centavos >= 0),
  receita_empresa_centavos int not null default 0,                            -- perda de receita do salão
  gorjeta_bruta_centavos int not null default 0 check (gorjeta_bruta_centavos >= 0),
  gorjeta_liquida_centavos int not null default 0 check (gorjeta_liquida_centavos >= 0),
  reembolso_centavos int not null default 0 check (reembolso_centavos >= 0),
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  constraint comanda_estornos_idempotency unique (empresa_id, idempotency_key)
);
create index if not exists ix_comanda_estornos_comando on comanda_estornos (empresa_id, comando_id);
create index if not exists ix_comanda_estornos_data on comanda_estornos (empresa_id, data);

create table if not exists comanda_estorno_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  estorno_id uuid not null references comanda_estornos(id) on delete restrict,
  comando_id uuid not null references comandos(id) on delete restrict,
  comando_item_id uuid not null references comando_itens(id) on delete restrict,
  quantidade int not null check (quantidade > 0),
  valor_liquido_centavos int not null check (valor_liquido_centavos >= 0),
  comissao_centavos int not null check (comissao_centavos >= 0),
  receita_empresa_centavos int not null,                -- = valor − comissão (a taxa original não volta)
  custo_centavos int not null default 0 check (custo_centavos >= 0),
  devolve_estoque boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ix_comanda_estorno_itens_estorno on comanda_estorno_itens (estorno_id);
create index if not exists ix_comanda_estorno_itens_item on comanda_estorno_itens (empresa_id, comando_item_id);

create table if not exists comanda_estorno_pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  estorno_id uuid not null references comanda_estornos(id) on delete restrict,
  comando_id uuid not null references comandos(id) on delete restrict,
  forma_code text not null,
  valor_centavos int not null check (valor_centavos > 0),
  created_at timestamptz not null default now()
);
create index if not exists ix_comanda_estorno_pagamentos_estorno on comanda_estorno_pagamentos (estorno_id);
create index if not exists ix_comanda_estorno_pagamentos_comando on comanda_estorno_pagamentos (empresa_id, comando_id);

create table if not exists comanda_estorno_gorjetas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  estorno_id uuid not null references comanda_estornos(id) on delete restrict,
  comando_id uuid not null references comandos(id) on delete restrict,
  comando_gorjeta_id uuid null references comando_gorjetas(id) on delete restrict,
  profissional_id uuid null references profissionais(id),
  valor_bruto_centavos int not null check (valor_bruto_centavos >= 0),
  valor_liquido_centavos int not null check (valor_liquido_centavos >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ix_comanda_estorno_gorjetas_estorno on comanda_estorno_gorjetas (estorno_id);

-- ---------------------------------------------------------------------------
-- 2. Estoque: tipo 'devolucao' (troca o check inline de 001 sem editar a 001)
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.produto_estoque_movimentos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%tipo%' and pg_get_constraintdef(oid) like '%entrada%'
  loop
    execute format('alter table public.produto_estoque_movimentos drop constraint %I', c.conname);
  end loop;
end $$;
alter table produto_estoque_movimentos add constraint produto_estoque_movimentos_tipo_check
  check (tipo in ('entrada', 'venda', 'ajuste', 'perda', 'devolucao'));

-- Caixa: a saída do estorno é sempre negativa.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'caixa_movimentos_estorno_negativo') then
    alter table caixa_movimentos add constraint caixa_movimentos_estorno_negativo
      check (tipo <> 'estorno_pagamento' or valor_centavos < 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Imutabilidade do ledger
-- ---------------------------------------------------------------------------
-- Nenhum fluxo da aplicação faz update/delete nestas tabelas (só inserts via RPC).
-- Efeito colateral aceito (D-013): apagar empresa, produto ou comanda com histórico
-- falha (o cascade dispara o trigger). Limpeza administrativa exige desligar o
-- trigger com SQL autorizado pelo Platform Owner (docs/RUNBOOK_MIGRATION_007.md).
create or replace function public.ledger_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'ledger imutável: % em %', tg_op, tg_table_name using errcode = 'P0001';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'comandos', 'comando_itens', 'comando_pagamentos', 'comando_gorjetas', 'caixa_movimentos',
    'produto_estoque_movimentos', 'comanda_estornos', 'comanda_estorno_itens',
    'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas'
  ] loop
    -- "trg_ledger_*" ordena depois de "trg_<tabela>_autoria_*" (007): a mensagem de
    -- autoria imutável continua sendo a primeira a disparar quando o autor muda.
    execute format('drop trigger if exists trg_ledger_imutavel on public.%I', t);
    execute format('create trigger trg_ledger_imutavel before update or delete on public.%I for each row execute function public.ledger_imutavel()', t);
    execute format('drop trigger if exists trg_ledger_imutavel_truncate on public.%I', t);
    execute format('create trigger trg_ledger_imutavel_truncate before truncate on public.%I for each statement execute function public.ledger_imutavel()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RPC de estorno
-- ---------------------------------------------------------------------------
-- Resumo de um estorno gravado (mesmo formato na primeira chamada e nas idempotentes).
create or replace function public.comanda_estorno_resumo(p_estorno_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'estornoId', e.id,
    'comandoId', e.comando_id,
    'tipo', e.tipo,
    'motivoCodigo', e.motivo_codigo,
    'data', e.data,
    'itensCentavos', e.itens_centavos,
    'custoCentavos', e.custo_centavos,
    'comissaoCentavos', e.comissao_centavos,
    'receitaEmpresaCentavos', e.receita_empresa_centavos,
    'gorjetaBrutaCentavos', e.gorjeta_bruta_centavos,
    'gorjetaLiquidaCentavos', e.gorjeta_liquida_centavos,
    'reembolsoCentavos', e.reembolso_centavos,
    'actorId', e.actor_id,
    'itens', coalesce((select jsonb_agg(jsonb_build_object('comandoItemId', i.comando_item_id, 'quantidade', i.quantidade,
                 'valorLiquidoCentavos', i.valor_liquido_centavos, 'comissaoCentavos', i.comissao_centavos,
                 'devolveEstoque', i.devolve_estoque) order by i.comando_item_id)
               from comanda_estorno_itens i where i.estorno_id = e.id), '[]'::jsonb),
    'reembolsos', coalesce((select jsonb_agg(jsonb_build_object('formaCode', p.forma_code, 'valorCentavos', p.valor_centavos) order by p.forma_code)
               from comanda_estorno_pagamentos p where p.estorno_id = e.id), '[]'::jsonb),
    'statusComanda', case
      when exists (select 1 from comanda_estornos t where t.comando_id = e.comando_id and t.empresa_id = e.empresa_id and t.tipo = 'total') then 'estornado'
      else 'estornado_parcial' end
  )
  from comanda_estornos e where e.id = p_estorno_id
$$;

-- p_payload (normalizado pelo backend): { idempotencyKey, data, tipo, motivoCodigo, motivo,
--   devolverEstoque?, itens?: [{comandoItemId, quantidade, devolveEstoque}],
--   reembolsos?: [{formaCode, valorCentavos}] | reembolsoForma?: text }
-- Erros: SQLSTATE HS403/HS404/HS409/HS422, mensagem = código da API, detail = explicação.
-- Ordem: valida e calcula tudo; só então grava (o ledger é imutável: nada de update).
create or replace function public.comanda_estornar(
  p_empresa_id uuid,
  p_comando_id uuid,
  p_payload jsonb,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotencyKey', '')), '');
  v_tipo text := p_payload->>'tipo';
  v_motivo_codigo text := p_payload->>'motivoCodigo';
  v_motivo text := btrim(coalesce(p_payload->>'motivo', ''));
  v_devolver_estoque boolean := true;
  v_data date;
  v_hash text;
  v_cmd comandos%rowtype;
  v_existing comanda_estornos%rowtype;
  v_estorno_id uuid := gen_random_uuid();
  v_req jsonb;
  v_item record;
  v_q int;
  v_restante int;
  v_valor int; v_comissao int; v_custo int;
  v_devolve boolean;
  v_calc jsonb := '[]'::jsonb;
  v_c jsonb;
  v_saldo_anterior int;
  v_controla boolean;
  v_itens int := 0; v_custo_total int := 0; v_comissao_total int := 0; v_receita int := 0;
  v_gorjeta_bruta int := 0; v_gorjeta_liquida int := 0; v_reembolso int := 0;
  v_reembolsos jsonb := '[]'::jsonb;
  v_r jsonb;
  v_disp int;
  v_formas int;
  v_forma text;
begin
  if p_empresa_id is null or p_comando_id is null or p_actor_id is null or v_key is null then
    raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'empresa, comanda, ator e idempotencyKey obrigatorios';
  end if;
  if v_tipo is null or v_tipo not in ('total', 'parcial') then
    raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'tipo deve ser total ou parcial';
  end if;
  begin
    v_data := (p_payload->>'data')::date;
    v_devolver_estoque := coalesce((p_payload->>'devolverEstoque')::boolean, true);
  exception when others then
    raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'data ou devolverEstoque inválidos';
  end;
  if v_data is null then
    raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'data obrigatoria';
  end if;
  -- A data é "hoje" no fuso da empresa (definida pelo servidor). Defesa: nunca lançar
  -- estorno em outro dia (ex.: num mês já fechado). ±1 dia cobre UTC × fuso.
  if abs(v_data - current_date) > 1 then
    raise exception 'ESTORNO_DATA_INVALIDA' using errcode = 'HS422', detail = format('data %s não é hoje', v_data);
  end if;

  -- Autoria: membership ativa (007) e, além do RBAC da API, papel de gestão no banco.
  perform public.app_set_autoria(p_actor_id, null, p_empresa_id);
  if not exists (
    select 1 from empresa_memberships m
    where m.user_id = p_actor_id and m.empresa_id = p_empresa_id and m.status = 'ativo' and m.role in ('admin', 'gestor')
  ) then
    raise exception 'ESTORNO_FORBIDDEN' using errcode = 'HS403', detail = 'só admin ou gestor estornam';
  end if;

  -- Serializa estornos da mesma comanda: idempotência e saldo são lidos sob o lock.
  perform pg_advisory_xact_lock(hashtextextended('estorno:' || p_empresa_id || ':' || p_comando_id, 0)); -- [guard:lock]

  v_hash := md5(jsonb_build_object('comandoId', p_comando_id::text, 'payload', p_payload - 'idempotencyKey' - 'data')::text);
  select * into v_existing from comanda_estornos where empresa_id = p_empresa_id and idempotency_key = v_key;
  if found then
    if v_existing.payload_hash <> v_hash then
      raise exception 'IDEMPOTENCY_MISMATCH' using errcode = 'HS409', detail = 'idempotencyKey já usada com outro pedido';
    end if;
    return public.comanda_estorno_resumo(v_existing.id) || jsonb_build_object('idempotent', true);
  end if;

  select * into v_cmd from comandos where id = p_comando_id
    and empresa_id = p_empresa_id -- [guard:tenant]
    ;
  if not found then
    raise exception 'COMANDA_NOT_FOUND' using errcode = 'HS404', detail = p_comando_id::text;
  end if;
  if v_data < v_cmd.data or v_data - v_cmd.data > 30 then
    raise exception 'ESTORNO_PRAZO_EXPIRADO' using errcode = 'HS422', detail = format('comanda de %s; prazo de 30 dias', v_cmd.data);
  end if;
  if exists (select 1 from comanda_estornos where empresa_id = p_empresa_id and comando_id = p_comando_id and tipo = 'total') then
    raise exception 'ESTORNO_JA_TOTAL' using errcode = 'HS409', detail = 'comanda já estornada por completo';
  end if;
  if v_motivo_codigo is null or v_motivo_codigo not in ('erro_lancamento', 'desistencia_cliente', 'insatisfacao', 'duplicidade', 'outro')
     or char_length(v_motivo) not between 10 and 500 then
    raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'motivo inválido';
  end if;

  -- Parcial: itens desta comanda, sem repetição, quantidade inteira > 0.
  if v_tipo = 'parcial' then
    if jsonb_typeof(p_payload->'itens') is distinct from 'array' or jsonb_array_length(p_payload->'itens') = 0 then
      raise exception 'ESTORNO_ITENS_OBRIGATORIOS' using errcode = 'HS422', detail = 'estorno parcial exige itens';
    end if;
    if (select count(*) <> count(distinct x->>'comandoItemId') from jsonb_array_elements(p_payload->'itens') x) then
      raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'item repetido';
    end if;
    for v_req in select * from jsonb_array_elements(p_payload->'itens') loop
      if not exists (select 1 from comando_itens ci where ci.id::text = v_req->>'comandoItemId'
                     and ci.comando_id = p_comando_id and ci.empresa_id = p_empresa_id) then
        raise exception 'ESTORNO_ITEM_INVALIDO' using errcode = 'HS422', detail = coalesce(v_req->>'comandoItemId', 'null');
      end if;
      if coalesce(v_req->>'quantidade', '') !~ '^[0-9]{1,6}$' or (v_req->>'quantidade')::int <= 0 then
        raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'quantidade deve ser inteiro > 0';
      end if;
      if v_req ? 'devolveEstoque' and jsonb_typeof(v_req->'devolveEstoque') <> 'boolean' then
        raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'devolveEstoque deve ser booleano';
      end if;
    end loop;
  end if;

  -- 1. Itens: proporcional ao original; o último estorno do item leva o resto exato.
  for v_item in
    select ci.*,
           coalesce((select sum(ei.quantidade) from comanda_estorno_itens ei where ei.comando_item_id = ci.id), 0)::int as q_prev,
           coalesce((select sum(ei.valor_liquido_centavos) from comanda_estorno_itens ei where ei.comando_item_id = ci.id), 0)::int as v_prev,
           coalesce((select sum(ei.comissao_centavos) from comanda_estorno_itens ei where ei.comando_item_id = ci.id), 0)::int as c_prev,
           coalesce((select sum(ei.custo_centavos) from comanda_estorno_itens ei where ei.comando_item_id = ci.id), 0)::int as k_prev
    from comando_itens ci
    where ci.comando_id = p_comando_id and ci.empresa_id = p_empresa_id
    order by ci.id
  loop
    v_restante := v_item.quantidade - v_item.q_prev;
    if v_tipo = 'total' then
      v_q := v_restante;
      v_devolve := v_devolver_estoque;
    else
      v_req := (select x from jsonb_array_elements(p_payload->'itens') x where x->>'comandoItemId' = v_item.id::text limit 1);
      if v_req is null then continue; end if;
      v_q := (v_req->>'quantidade')::int;
      v_devolve := coalesce((v_req->>'devolveEstoque')::boolean, true);
      if v_q > v_restante then raise exception 'ESTORNO_EXCEDE' using errcode = 'HS409', detail = format('item %s: pedido %s, saldo %s', v_item.id, v_q, v_restante); end if; -- [guard:excede]
    end if;
    if v_q <= 0 then continue; end if;

    if v_item.q_prev + v_q >= v_item.quantidade then
      v_valor := greatest(v_item.valor_liquido_centavos - v_item.v_prev, 0);
      v_comissao := greatest(v_item.comissao_centavos - v_item.c_prev, 0);
      v_custo := greatest(v_item.total_custo_centavos - v_item.k_prev, 0);
    else
      v_valor := greatest((v_item.valor_liquido_centavos::bigint * v_q / v_item.quantidade)::int, 0);
      v_comissao := greatest((v_item.comissao_centavos::bigint * v_q / v_item.quantidade)::int, 0);
      v_custo := greatest((v_item.total_custo_centavos::bigint * v_q / v_item.quantidade)::int, 0);
    end if;
    v_calc := v_calc || jsonb_build_array(jsonb_build_object(
      'id', v_item.id, 'tipo', v_item.tipo, 'produtoId', v_item.produto_id, 'q', v_q,
      'valor', v_valor, 'comissao', v_comissao, 'custo', v_custo, 'devolve', v_devolve,
      'custoUnit', v_item.custo_unitario_centavos));
    v_itens := v_itens + v_valor;
    v_comissao_total := v_comissao_total + v_comissao;
    v_custo_total := v_custo_total + v_custo;
    v_receita := v_receita + (v_valor - v_comissao);
  end loop;

  if jsonb_array_length(v_calc) = 0 and v_tipo = 'parcial' then
    raise exception 'ESTORNO_ITENS_OBRIGATORIOS' using errcode = 'HS422', detail = 'nenhum item a estornar';
  end if;

  -- 2. Gorjeta: só no total (no parcial ela fica). A taxa da gorjeta não volta.
  if v_tipo = 'total' then
    select coalesce(sum(greatest(valor_bruto_centavos, 0)), 0), coalesce(sum(greatest(valor_liquido_centavos, 0)), 0)
      into v_gorjeta_bruta, v_gorjeta_liquida
    from comando_gorjetas where comando_id = p_comando_id and empresa_id = p_empresa_id;
  end if;

  -- 3. Reembolso por forma: nunca acima do pago na forma menos o já devolvido.
  if v_tipo = 'total' then
    select coalesce(jsonb_agg(jsonb_build_object('formaCode', forma_code, 'valorCentavos', disp) order by forma_code), '[]'::jsonb)
      into v_reembolsos
    from (
      select p.forma_code,
             sum(p.valor_centavos) - coalesce((select sum(ep.valor_centavos) from comanda_estorno_pagamentos ep
               where ep.comando_id = p_comando_id and ep.empresa_id = p_empresa_id and ep.forma_code = p.forma_code), 0) as disp
      from comando_pagamentos p
      where p.comando_id = p_comando_id and p.empresa_id = p_empresa_id
      group by p.forma_code
    ) s where disp > 0;
  elsif v_itens > 0 then
    if jsonb_typeof(p_payload->'reembolsos') = 'array' and jsonb_array_length(p_payload->'reembolsos') > 0 then
      v_reembolsos := p_payload->'reembolsos';
      if (select count(*) <> count(distinct x->>'formaCode') from jsonb_array_elements(v_reembolsos) x) then
        raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'forma de reembolso repetida';
      end if;
    elsif coalesce(p_payload->>'reembolsoForma', '') <> '' then
      -- Forma escolhida; o valor é sempre o dos itens, calculado aqui (nunca pelo cliente).
      v_reembolsos := jsonb_build_array(jsonb_build_object('formaCode', p_payload->>'reembolsoForma', 'valorCentavos', v_itens));
    else
      -- Sem forma informada: só quando há uma única forma com saldo.
      select count(*), min(forma_code) into v_formas, v_forma from (
        select p.forma_code,
               sum(p.valor_centavos) - coalesce((select sum(ep.valor_centavos) from comanda_estorno_pagamentos ep
                 where ep.comando_id = p_comando_id and ep.empresa_id = p_empresa_id and ep.forma_code = p.forma_code), 0) as disp
        from comando_pagamentos p where p.comando_id = p_comando_id and p.empresa_id = p_empresa_id
        group by p.forma_code
      ) s where disp > 0;
      if v_formas <> 1 then
        raise exception 'ESTORNO_FORMA_OBRIGATORIA' using errcode = 'HS422', detail = 'informe a forma do reembolso';
      end if;
      v_reembolsos := jsonb_build_array(jsonb_build_object('formaCode', v_forma, 'valorCentavos', v_itens));
    end if;
  end if;

  for v_r in select * from jsonb_array_elements(v_reembolsos) loop
    if coalesce(v_r->>'valorCentavos', '') !~ '^[0-9]{1,9}$' or (v_r->>'valorCentavos')::int <= 0 or coalesce(v_r->>'formaCode', '') = '' then
      raise exception 'ESTORNO_PAYLOAD_INVALIDO' using errcode = 'HS422', detail = 'reembolso exige formaCode e valorCentavos inteiro > 0';
    end if;
    select coalesce(sum(p.valor_centavos), 0) - coalesce((select sum(ep.valor_centavos) from comanda_estorno_pagamentos ep
             where ep.comando_id = p_comando_id and ep.empresa_id = p_empresa_id and ep.forma_code = v_r->>'formaCode'), 0)
      into v_disp
    from comando_pagamentos p where p.comando_id = p_comando_id and p.empresa_id = p_empresa_id and p.forma_code = v_r->>'formaCode';
    if (v_r->>'valorCentavos')::int > v_disp then
      raise exception 'ESTORNO_EXCEDE' using errcode = 'HS409', detail = format('reembolso em %s acima do pago (saldo %s)', v_r->>'formaCode', v_disp);
    end if;
    v_reembolso := v_reembolso + (v_r->>'valorCentavos')::int;
  end loop;

  -- Parcial: o cliente recebe exatamente o valor dos itens devolvidos.
  if v_tipo = 'parcial' and v_reembolso <> v_itens then
    raise exception 'ESTORNO_REEMBOLSO_DIVERGENTE' using errcode = 'HS422', detail = format('reembolso %s diferente dos itens %s', v_reembolso, v_itens);
  end if;

  -- 4. Grava: evento com os totais, itens (+ devolução de estoque), gorjetas, reembolsos e caixa.
  insert into comanda_estornos (
    id, empresa_id, comando_id, tipo, motivo_codigo, motivo, data, idempotency_key, payload_hash,
    itens_centavos, custo_centavos, comissao_centavos, receita_empresa_centavos,
    gorjeta_bruta_centavos, gorjeta_liquida_centavos, reembolso_centavos, actor_id
  ) values (
    v_estorno_id, p_empresa_id, p_comando_id, v_tipo, v_motivo_codigo, v_motivo, v_data, v_key, v_hash,
    v_itens, v_custo_total, v_comissao_total, v_receita + (v_gorjeta_bruta - v_gorjeta_liquida),
    v_gorjeta_bruta, v_gorjeta_liquida, v_reembolso, p_actor_id
  );

  for v_c in select * from jsonb_array_elements(v_calc) loop
    v_controla := false;
    if v_c->>'tipo' = 'produto' and (v_c->>'devolve')::boolean then
      select estoque_atual, coalesce(controla_estoque, true) into v_saldo_anterior, v_controla
      from produtos where id = (v_c->>'produtoId')::uuid and empresa_id = p_empresa_id
      for update;
      v_controla := coalesce(v_controla, false);
      if v_controla then
        update produtos set estoque_atual = v_saldo_anterior + (v_c->>'q')::int, updated_at = now()
        where id = (v_c->>'produtoId')::uuid and empresa_id = p_empresa_id;
        insert into produto_estoque_movimentos (
          empresa_id, produto_id, comando_id, comando_item_id, tipo, quantidade,
          saldo_anterior, saldo_posterior, custo_unitario_centavos, motivo
        ) values (
          p_empresa_id, (v_c->>'produtoId')::uuid, p_comando_id, (v_c->>'id')::uuid, 'devolucao', (v_c->>'q')::int,
          v_saldo_anterior, v_saldo_anterior + (v_c->>'q')::int, coalesce((v_c->>'custoUnit')::int, 0), 'Devolução por estorno de comanda'
        );
      end if;
    end if;
    insert into comanda_estorno_itens (
      empresa_id, estorno_id, comando_id, comando_item_id, quantidade,
      valor_liquido_centavos, comissao_centavos, receita_empresa_centavos, custo_centavos, devolve_estoque
    ) values (
      p_empresa_id, v_estorno_id, p_comando_id, (v_c->>'id')::uuid, (v_c->>'q')::int,
      (v_c->>'valor')::int, (v_c->>'comissao')::int, (v_c->>'valor')::int - (v_c->>'comissao')::int,
      (v_c->>'custo')::int, v_controla
    );
  end loop;

  if v_tipo = 'total' then
    insert into comanda_estorno_gorjetas (empresa_id, estorno_id, comando_id, comando_gorjeta_id, profissional_id, valor_bruto_centavos, valor_liquido_centavos)
    select p_empresa_id, v_estorno_id, p_comando_id, g.id, g.profissional_id, greatest(g.valor_bruto_centavos, 0), greatest(g.valor_liquido_centavos, 0)
    from comando_gorjetas g where g.comando_id = p_comando_id and g.empresa_id = p_empresa_id;
  end if;

  for v_r in select * from jsonb_array_elements(v_reembolsos) loop
    insert into comanda_estorno_pagamentos (empresa_id, estorno_id, comando_id, forma_code, valor_centavos)
    values (p_empresa_id, v_estorno_id, p_comando_id, v_r->>'formaCode', (v_r->>'valorCentavos')::int);
    insert into caixa_movimentos (empresa_id, comando_id, data, tipo, forma_code, valor_centavos, descricao)
    values (p_empresa_id, p_comando_id, v_data, 'estorno_pagamento', v_r->>'formaCode', -((v_r->>'valorCentavos')::int), 'Estorno de comanda');
  end loop;

  return public.comanda_estorno_resumo(v_estorno_id) || jsonb_build_object('idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissões (padrão da 007: só service_role; anon/authenticated fora)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    -- Ledger: o backend só lê e insere (pela RPC). Sem update/delete/truncate.
    execute format('revoke update, delete, truncate on table public.%I from service_role', t);
    execute format('grant select, insert on table public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.ledger_imutavel() from public, anon, authenticated;
revoke all on function public.comanda_estorno_resumo(uuid) from public, anon, authenticated;
revoke all on function public.comanda_estornar(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.comanda_estornar(uuid, uuid, jsonb, uuid) to service_role;

commit;
