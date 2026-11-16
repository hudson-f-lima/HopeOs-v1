-- Migration 022 — Assinatura, Onda A, fase 2: assinantes, cobranças manuais e uso na comanda
-- (D-043). Autorizada pelo Platform Owner em 2026-11-16 ("Após merge iniciar a fase 2, migração
-- autorizada"). Aplica em produção só no merge.
--
--   assinaturas              cliente + plano + estado base (ativa, pausada, cancelada) + início.
--                            O ciclo e a situação de pagamento (em dia, atrasada, suspensa) são
--                            calculados pelo backend a partir do início, da periodicidade e das cobranças.
--   assinatura_cobrancas     uma por ciclo; a cobrança é manual na Onda A: a equipe marca "paga".
--   assinatura_usos          imutável. Cada atendimento coberto (ou fora da regra) numa comanda
--                            fechada, preso ao item da comanda.
--   assinatura_usos_estornos imutável. O uso de um item estornado volta ao limite do ciclo.
-- O fechamento com cobertura (checkout_close_assinatura) chama o checkout_close de sempre e grava
-- os usos na mesma transação; o fechamento existente (002/003/007) não é alterado. Estorno de
-- item devolve o uso por gatilho em comanda_estorno_itens (009 não é tocada).
begin;

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id),
  plano_id uuid not null references public.assinatura_planos(id),
  status text not null default 'ativa' check (status in ('ativa', 'pausada', 'cancelada')),
  inicio date not null,
  pausada_em date null,
  cancelar_no_fim_do_ciclo boolean not null default false,
  cancelada_em date null,
  fornecedor text null check (fornecedor is null or char_length(fornecedor) <= 40),
  ref_fornecedor text null check (ref_fornecedor is null or char_length(ref_fornecedor) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.app_users(id),
  constraint assinaturas_pausa check ((status = 'pausada') = (pausada_em is not null)),
  constraint assinaturas_cancelamento check ((status = 'cancelada') = (cancelada_em is not null))
);
create index if not exists idx_assinaturas_empresa on public.assinaturas (empresa_id, status);
create index if not exists idx_assinaturas_cliente on public.assinaturas (cliente_id);
-- O mesmo cliente não assina o mesmo plano duas vezes ao mesmo tempo.
create unique index if not exists uq_assinaturas_cliente_plano_viva on public.assinaturas (cliente_id, plano_id) where status <> 'cancelada';

create table if not exists public.assinatura_cobrancas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  assinatura_id uuid not null references public.assinaturas(id),
  ciclo_inicio date not null,
  vencimento date not null,
  valor_centavos int not null check (valor_centavos >= 0),
  estado text not null default 'pendente' check (estado in ('pendente', 'paga', 'cancelada')),
  pago_em date null,
  forma text null check (forma is null or char_length(forma) <= 40),
  observacao text null check (observacao is null or char_length(observacao) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.app_users(id),
  constraint assinatura_cobrancas_pago check ((estado = 'paga') = (pago_em is not null)),
  constraint uq_assinatura_cobrancas_ciclo unique (assinatura_id, ciclo_inicio)
);
create index if not exists idx_assinatura_cobrancas_empresa on public.assinatura_cobrancas (empresa_id, estado, vencimento);

create table if not exists public.assinatura_usos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  assinatura_id uuid not null references public.assinaturas(id) on delete restrict,
  ciclo_inicio date not null,
  comando_id uuid not null references public.comandos(id) on delete restrict,
  comando_item_id uuid not null references public.comando_itens(id) on delete restrict,
  servico_id uuid not null references public.servicos(id),
  profissional_id uuid not null references public.profissionais(id),
  data date not null,
  tipo text not null check (tipo in ('coberto', 'fora_da_regra')),
  consome_uso boolean not null,
  valor_tabela_centavos int not null check (valor_tabela_centavos >= 0),
  valor_cobrado_centavos int not null check (valor_cobrado_centavos >= 0),
  acao text null check (acao is null or acao in ('bloquear', 'cobrar_percentual_consumir', 'cobrar_percentual_sem_consumir', 'cobertura_total')),
  motivos jsonb not null default '[]'::jsonb,
  aprovado_por uuid null references public.app_users(id),
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  constraint uq_assinatura_usos_item unique (comando_item_id)
);
create index if not exists idx_assinatura_usos_ciclo on public.assinatura_usos (assinatura_id, ciclo_inicio);
create index if not exists idx_assinatura_usos_comando on public.assinatura_usos (comando_id);

create table if not exists public.assinatura_usos_estornos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  uso_id uuid not null references public.assinatura_usos(id) on delete restrict,
  estorno_id uuid not null references public.comanda_estornos(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint uq_assinatura_usos_estornos_uso unique (uso_id)
);

-- Tudo da mesma empresa: assinatura (cliente e plano), cobrança, uso (assinatura, comanda, item).
create or replace function public.assinatura_mesma_empresa() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'assinaturas' then
    if not exists (select 1 from public.clientes c where c.id = new.cliente_id and c.empresa_id = new.empresa_id)
       or not exists (select 1 from public.assinatura_planos p where p.id = new.plano_id and p.empresa_id = new.empresa_id) then
      raise exception 'assinaturas: referência de outra empresa' using errcode = '23514';
    end if;
  elsif tg_table_name = 'assinatura_cobrancas' then
    if not exists (select 1 from public.assinaturas a where a.id = new.assinatura_id and a.empresa_id = new.empresa_id) then
      raise exception 'assinatura_cobrancas: assinatura de outra empresa' using errcode = '23514';
    end if;
  else
    if not exists (select 1 from public.assinaturas a where a.id = new.assinatura_id and a.empresa_id = new.empresa_id)
       or not exists (select 1 from public.comandos c where c.id = new.comando_id and c.empresa_id = new.empresa_id)
       or not exists (select 1 from public.comando_itens i where i.id = new.comando_item_id and i.empresa_id = new.empresa_id and i.comando_id = new.comando_id)
       or not exists (select 1 from public.servicos s where s.id = new.servico_id and s.empresa_id = new.empresa_id)
       or not exists (select 1 from public.profissionais p where p.id = new.profissional_id and p.empresa_id = new.empresa_id) then
      raise exception 'assinatura_usos: referência de outra empresa' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_assinaturas_mesma_empresa on public.assinaturas;
create trigger trg_assinaturas_mesma_empresa before insert or update of empresa_id, cliente_id, plano_id on public.assinaturas
  for each row execute function public.assinatura_mesma_empresa();
drop trigger if exists trg_assinatura_cobrancas_mesma_empresa on public.assinatura_cobrancas;
create trigger trg_assinatura_cobrancas_mesma_empresa before insert or update of empresa_id, assinatura_id on public.assinatura_cobrancas
  for each row execute function public.assinatura_mesma_empresa();
drop trigger if exists trg_assinatura_usos_mesma_empresa on public.assinatura_usos;
create trigger trg_assinatura_usos_mesma_empresa before insert on public.assinatura_usos
  for each row execute function public.assinatura_mesma_empresa();

-- Usos e seus estornos são livro-caixa: sem update, sem delete, sem truncate (mesma trava da 009).
do $$
declare t text;
begin
  foreach t in array array['assinatura_usos', 'assinatura_usos_estornos'] loop
    execute format('drop trigger if exists trg_ledger_imutavel on public.%I', t);
    execute format('create trigger trg_ledger_imutavel before update or delete on public.%I for each row execute function public.ledger_imutavel()', t);
    execute format('drop trigger if exists trg_ledger_imutavel_truncate on public.%I', t);
    execute format('create trigger trg_ledger_imutavel_truncate before truncate on public.%I for each statement execute function public.ledger_imutavel()', t);
  end loop;
end $$;

-- Fecha a comanda como sempre e grava os usos do plano na mesma transação. p_usos: lista de
-- { assinaturaId, servicoId, profissionalId, precoUnitarioCentavos, cicloInicio, tipo, consomeUso,
--   valorTabelaCentavos, valorCobradoCentavos, acao, motivos, aprovadoPor }. O item da comanda é
-- achado por (serviço, profissional, preço cobrado); itens iguais são intercambiáveis. Fechamento
-- repetido (idempotente) devolve o resultado já gravado e não grava uso de novo.
create or replace function public.checkout_close_assinatura(
  p_empresa_id uuid, p_payload jsonb, p_preview jsonb, p_usos jsonb,
  p_actor_id uuid default null, p_integration_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_res jsonb;
  v_comando_id uuid;
  v_uso jsonb;
  v_item_id uuid;
  v_data date;
begin
  if jsonb_typeof(coalesce(p_usos, '[]'::jsonb)) <> 'array' then
    raise exception 'checkout_close_assinatura: p_usos deve ser uma lista' using errcode = '22023';
  end if;
  v_res := public.checkout_close_autoria(p_empresa_id, p_payload, p_preview, p_actor_id, p_integration_id);
  if coalesce((v_res->>'idempotent')::boolean, false) then
    return v_res;
  end if;
  v_comando_id := (v_res->>'comandoId')::uuid;
  select data into v_data from public.comandos where id = v_comando_id and empresa_id = p_empresa_id;
  for v_uso in select * from jsonb_array_elements(coalesce(p_usos, '[]'::jsonb)) loop
    select i.id into v_item_id
    from public.comando_itens i
    where i.comando_id = v_comando_id and i.empresa_id = p_empresa_id and i.tipo = 'servico'
      and i.servico_id = (v_uso->>'servicoId')::uuid and i.profissional_id = (v_uso->>'profissionalId')::uuid
      and i.preco_unitario_centavos = (v_uso->>'precoUnitarioCentavos')::int
      and not exists (select 1 from public.assinatura_usos u where u.comando_item_id = i.id)
    order by i.id
    limit 1;
    if v_item_id is null then
      raise exception 'checkout_close_assinatura: item da comanda não encontrado para o uso do plano' using errcode = 'P0002';
    end if;
    insert into public.assinatura_usos (empresa_id, assinatura_id, ciclo_inicio, comando_id, comando_item_id, servico_id, profissional_id, data,
      tipo, consome_uso, valor_tabela_centavos, valor_cobrado_centavos, acao, motivos, aprovado_por, created_by)
    values (p_empresa_id, (v_uso->>'assinaturaId')::uuid, (v_uso->>'cicloInicio')::date, v_comando_id, v_item_id,
      (v_uso->>'servicoId')::uuid, (v_uso->>'profissionalId')::uuid, v_data,
      v_uso->>'tipo', (v_uso->>'consomeUso')::boolean, (v_uso->>'valorTabelaCentavos')::int, (v_uso->>'valorCobradoCentavos')::int,
      nullif(v_uso->>'acao', ''), coalesce(v_uso->'motivos', '[]'::jsonb), nullif(v_uso->>'aprovadoPor', '')::uuid, p_actor_id);
  end loop;
  return v_res;
end $$;

-- Estorno de item devolve o uso do plano ao limite do ciclo (reverte tudo, decisão do dono).
create or replace function public.assinatura_usos_devolver() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.assinatura_usos_estornos (empresa_id, uso_id, estorno_id)
  select u.empresa_id, u.id, new.estorno_id
  from public.assinatura_usos u
  where u.comando_item_id = new.comando_item_id and u.empresa_id = new.empresa_id
  on conflict (uso_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_assinatura_usos_devolver on public.comanda_estorno_itens;
create trigger trg_assinatura_usos_devolver after insert on public.comanda_estorno_itens
  for each row execute function public.assinatura_usos_devolver();

revoke all on table public.assinaturas, public.assinatura_cobrancas, public.assinatura_usos, public.assinatura_usos_estornos from public, anon, authenticated;
alter table public.assinaturas enable row level security;
alter table public.assinatura_cobrancas enable row level security;
alter table public.assinatura_usos enable row level security;
alter table public.assinatura_usos_estornos enable row level security;
grant select, insert, update on table public.assinaturas, public.assinatura_cobrancas to service_role;
grant select on table public.assinatura_usos, public.assinatura_usos_estornos to service_role;
revoke delete, truncate on table public.assinaturas, public.assinatura_cobrancas from service_role;
revoke insert, update, delete, truncate on table public.assinatura_usos, public.assinatura_usos_estornos from service_role;
revoke all on function public.assinatura_mesma_empresa() from public, anon, authenticated;
revoke all on function public.assinatura_usos_devolver() from public, anon, authenticated;
revoke all on function public.checkout_close_assinatura(uuid, jsonb, jsonb, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.checkout_close_assinatura(uuid, jsonb, jsonb, jsonb, uuid, uuid) to service_role;

commit;
