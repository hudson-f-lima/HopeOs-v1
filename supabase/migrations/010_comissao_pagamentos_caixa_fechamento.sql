-- KortexOS — Migration 010: pagamento de comissão e fechamento de caixa salvo.
-- Autorizada pelo Platform Owner em 2026-11-10 (D-017). Sem fornecedor externo.
-- Desenho: docs/planning/INTEGRACOES_FUTURAS.md §4 e §5.
--
-- Princípios (os mesmos da 009):
-- * Tudo é evento novo e imutável. Corrigir = lançar o inverso, nunca editar.
-- * comissao_pagamentos: 'pagamento' e 'vale' reduzem o saldo a pagar do profissional;
--   'estorno' devolve exatamente um lançamento anterior, uma única vez.
-- * caixa_ajustes: sangria (retirada) e suprimento (reforço) da gaveta de dinheiro.
-- * caixa_fechamentos: foto do dia no momento do fechamento (esperado, contado,
--   diferença). Fechar de novo o mesmo dia grava outra linha; vale a mais recente.
-- * Autoria obrigatória (actor_id): só usuário humano grava (a API exige login).
-- Não altera 001–009. Rollback: supabase/rollback/010_down.sql (recusa com dados).

begin;
set local client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. Pagamento de comissão
-- ---------------------------------------------------------------------------
create table if not exists comissao_pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  profissional_id uuid not null references profissionais(id) on delete restrict,
  tipo text not null check (tipo in ('pagamento', 'vale', 'estorno')),
  valor_centavos int not null check (valor_centavos > 0),
  data date not null,                                   -- dia do lançamento (fuso da empresa, definido pelo servidor)
  referencia_mes text null check (referencia_mes is null or referencia_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  observacao text null check (observacao is null or char_length(observacao) <= 500),
  estorna_id uuid null references comissao_pagamentos(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  constraint ck_comissao_pagamentos_estorno check ((tipo = 'estorno') = (estorna_id is not null))
);
create unique index if not exists ux_comissao_pagamentos_idem on comissao_pagamentos (empresa_id, idempotency_key);
-- Um lançamento só pode ser estornado uma vez.
create unique index if not exists ux_comissao_pagamentos_estorna on comissao_pagamentos (estorna_id) where estorna_id is not null;
create index if not exists ix_comissao_pagamentos_prof on comissao_pagamentos (empresa_id, profissional_id, data);

-- Integridade que check não alcança: profissional da mesma empresa; estorno espelha
-- o original (mesma empresa, mesmo profissional, mesmo valor) e não estorna estorno.
create or replace function public.comissao_pagamentos_valida()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_original public.comissao_pagamentos%rowtype;
begin
  if not exists (select 1 from public.profissionais p where p.id = new.profissional_id and p.empresa_id = new.empresa_id) then
    raise exception 'profissional não pertence à empresa' using errcode = 'P0001';
  end if;
  if new.tipo = 'estorno' then
    select * into v_original from public.comissao_pagamentos where id = new.estorna_id;
    if not found or v_original.empresa_id <> new.empresa_id or v_original.profissional_id <> new.profissional_id then
      raise exception 'lançamento a estornar não encontrado nesta empresa' using errcode = 'P0001';
    end if;
    if v_original.tipo = 'estorno' then
      raise exception 'estorno não pode ser estornado' using errcode = 'P0001';
    end if;
    if v_original.valor_centavos <> new.valor_centavos then
      raise exception 'estorno deve ter o valor do lançamento original' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_comissao_pagamentos_valida on comissao_pagamentos;
create trigger trg_comissao_pagamentos_valida before insert on comissao_pagamentos
  for each row execute function public.comissao_pagamentos_valida();

-- ---------------------------------------------------------------------------
-- 2. Caixa: sangria/suprimento e fechamento do dia
-- ---------------------------------------------------------------------------
create table if not exists caixa_ajustes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  data date not null,
  tipo text not null check (tipo in ('sangria', 'suprimento')),
  valor_centavos int not null check (valor_centavos > 0),
  motivo text not null check (char_length(btrim(motivo)) between 3 and 300),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists ux_caixa_ajustes_idem on caixa_ajustes (empresa_id, idempotency_key);
create index if not exists ix_caixa_ajustes_dia on caixa_ajustes (empresa_id, data);

create table if not exists caixa_fechamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  data date not null,
  fundo_troco_centavos int not null default 0 check (fundo_troco_centavos >= 0),
  esperado_dinheiro_centavos int not null,              -- fundo + vendas − estornos + suprimentos − sangrias
  contado_dinheiro_centavos int not null check (contado_dinheiro_centavos >= 0),
  diferenca_centavos int not null,
  total_bruto_centavos int not null default 0,
  quantidade_comandas int not null default 0 check (quantidade_comandas >= 0),
  observacao text null check (observacao is null or char_length(observacao) <= 500),
  snapshot jsonb not null default '{}'::jsonb,          -- resumo do dia como foi visto no fechamento
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  constraint ck_caixa_fechamentos_diferenca check (diferenca_centavos = contado_dinheiro_centavos - esperado_dinheiro_centavos)
);
create unique index if not exists ux_caixa_fechamentos_idem on caixa_fechamentos (empresa_id, idempotency_key);
create index if not exists ix_caixa_fechamentos_dia on caixa_fechamentos (empresa_id, data, created_at);

-- ---------------------------------------------------------------------------
-- 3. Imutabilidade (reusa public.ledger_imutavel da 009) e permissões (padrão 007)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['comissao_pagamentos', 'caixa_ajustes', 'caixa_fechamentos'] loop
    execute format('drop trigger if exists trg_ledger_imutavel on public.%I', t);
    execute format('create trigger trg_ledger_imutavel before update or delete on public.%I for each row execute function public.ledger_imutavel()', t);
    execute format('drop trigger if exists trg_ledger_imutavel_truncate on public.%I', t);
    execute format('create trigger trg_ledger_imutavel_truncate before truncate on public.%I for each statement execute function public.ledger_imutavel()', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke update, delete, truncate on table public.%I from service_role', t);
    execute format('grant select, insert on table public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.comissao_pagamentos_valida() from public, anon, authenticated;

commit;
