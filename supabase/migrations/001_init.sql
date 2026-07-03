-- HOPE OS V1.0.3 — Supabase/Postgres schema inicial
-- Fundação polimórfica: comando_itens aceita serviço e produto desde o primeiro schema.
-- Execute no SQL Editor do Supabase em banco limpo.

create extension if not exists pgcrypto;

create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  whatsapp text,
  endereco text,
  cidade text,
  horario_por_dia jsonb not null default '{}'::jsonb,
  slot_padrao int not null default 30,
  intervalo_almoco boolean not null default false,
  almoco_inicio text,
  almoco_fim text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  whatsapp text,
  observacoes text,
  faltas int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists servicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  categoria text not null default 'Sem categoria',
  valor_centavos int not null default 0 check (valor_centavos >= 0),
  duracao_min int not null default 30 check (duracao_min >= 0),
  slot_min int not null default 30 check (slot_min >= 0),
  comissao_pct numeric(5,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  sku text,
  codigo_barras text,
  categoria text not null default 'Sem categoria',
  custo_centavos int not null default 0 check (custo_centavos >= 0),
  preco_venda_centavos int not null default 0 check (preco_venda_centavos >= 0),
  estoque_atual int not null default 0 check (estoque_atual >= 0),
  estoque_minimo int not null default 0 check (estoque_minimo >= 0),
  comissao_pct numeric(5,2) not null default 0,
  modelo_comissao text not null default 'bruto_salao' check (modelo_comissao in ('bruto_salao','dividido','bruto_staff')),
  controla_estoque boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, sku)
);

create table if not exists profissionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  whatsapp text,
  modelo_comissao text not null default 'bruto_salao' check (modelo_comissao in ('bruto_salao','dividido','bruto_staff')),
  horario jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profissional_servicos (
  empresa_id uuid not null references empresas(id) on delete cascade,
  profissional_id uuid not null references profissionais(id) on delete cascade,
  servico_id uuid not null references servicos(id) on delete cascade,
  primary key (profissional_id, servico_id)
);

create table if not exists formas_pagamento (
  empresa_id uuid not null references empresas(id) on delete cascade,
  code text not null,
  label text not null,
  icon text,
  taxa_pct numeric(8,4) not null default 0,
  taxa_fixa_centavos int not null default 0,
  dias_recebimento int not null default 0,
  ativo boolean not null default true,
  primary key (empresa_id, code)
);

create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid references clientes(id),
  profissional_id uuid references profissionais(id),
  servico_id uuid references servicos(id),
  data date not null,
  horario time not null,
  duracao_min int not null default 30,
  valor_centavos int not null default 0,
  status text not null default 'agendado' check (status in ('agendado','confirmado','aguardando','em_atendimento','concluido','cancelado','no_show','fechado')),
  grupo_id uuid,
  grupo_seq int not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comandos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid references clientes(id),
  data date not null default current_date,
  hora time not null default current_time,
  subtotal_servicos_centavos int not null default 0,
  subtotal_produtos_centavos int not null default 0,
  total_itens_centavos int not null default 0,
  total_custo_produtos_centavos int not null default 0,
  lucro_bruto_produtos_centavos int not null default 0,
  desconto_centavos int not null default 0,
  servicos_liquidos_centavos int not null default 0,
  produtos_liquidos_centavos int not null default 0,
  itens_liquidos_centavos int not null default 0,
  gorjeta_bruta_centavos int not null default 0,
  total_recebido_centavos int not null default 0,
  taxa_total_centavos int not null default 0,
  taxa_servico_centavos int not null default 0,
  taxa_gorjeta_centavos int not null default 0,
  total_comissao_centavos int not null default 0,
  total_gorjeta_liquida_centavos int not null default 0,
  receita_empresa_centavos int not null default 0,
  status text not null default 'fechado',
  idempotency_key text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_comandos_empresa_idempotency
  on comandos(empresa_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists comando_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  comando_id uuid not null references comandos(id) on delete cascade,
  tipo text not null check (tipo in ('servico','produto')),
  servico_id uuid null references servicos(id),
  produto_id uuid null references produtos(id),
  profissional_id uuid null references profissionais(id),
  quantidade int not null default 1 check (quantidade > 0),
  descricao text not null,
  preco_unitario_centavos int not null default 0 check (preco_unitario_centavos >= 0),
  custo_unitario_centavos int not null default 0 check (custo_unitario_centavos >= 0),
  valor_bruto_centavos int not null default 0,
  desconto_centavos int not null default 0,
  valor_liquido_centavos int not null default 0,
  total_venda_centavos int not null default 0,
  total_custo_centavos int not null default 0,
  lucro_bruto_centavos int not null default 0,
  duracao_min int not null default 0,
  taxa_item_centavos int not null default 0,
  modelo_comissao text null check (modelo_comissao is null or modelo_comissao in ('bruto_salao','dividido','bruto_staff')),
  comissao_pct numeric(5,2) not null default 0,
  comissao_centavos int not null default 0 check (comissao_centavos >= 0),
  receita_empresa_centavos int not null default 0,
  created_at timestamptz not null default now(),
  constraint check_item_type check (
    (tipo = 'servico' and servico_id is not null and produto_id is null and profissional_id is not null) or
    (tipo = 'produto' and produto_id is not null and servico_id is null)
  )
);

create table if not exists produto_estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  comando_id uuid null references comandos(id) on delete set null,
  comando_item_id uuid null references comando_itens(id) on delete set null,
  tipo text not null check (tipo in ('entrada','venda','ajuste','perda')),
  quantidade int not null check (quantidade > 0),
  saldo_anterior int not null check (saldo_anterior >= 0),
  saldo_posterior int not null check (saldo_posterior >= 0),
  custo_unitario_centavos int not null default 0,
  motivo text,
  created_at timestamptz not null default now()
);

create table if not exists comando_pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  comando_id uuid not null references comandos(id) on delete cascade,
  forma_code text not null,
  valor_centavos int not null default 0,
  taxa_pct numeric(8,4) not null default 0,
  taxa_fixa_centavos int not null default 0,
  taxa_total_centavos int not null default 0,
  taxa_servico_centavos int not null default 0,
  taxa_gorjeta_centavos int not null default 0
);

create table if not exists comando_gorjetas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  comando_id uuid not null references comandos(id) on delete cascade,
  profissional_id uuid references profissionais(id),
  valor_bruto_centavos int not null default 0,
  taxa_centavos int not null default 0,
  valor_liquido_centavos int not null default 0,
  peso_valor numeric(12,8),
  peso_tempo numeric(12,8),
  peso_final numeric(12,8),
  regra text not null
);

create table if not exists caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  comando_id uuid references comandos(id),
  data date not null default current_date,
  tipo text not null,
  forma_code text,
  valor_centavos int not null default 0,
  descricao text,
  created_at timestamptz not null default now()
);

create table if not exists lista_espera (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid references clientes(id),
  servico_id uuid references servicos(id),
  profissional_id uuid references profissionais(id),
  data_preferencia date,
  status text not null default 'aguardando',
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists agendamento_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  agendamento_id uuid references agendamentos(id) on delete cascade,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agendamentos_empresa_data on agendamentos(empresa_id, data);
create index if not exists idx_comandos_empresa_data on comandos(empresa_id, data);
create index if not exists idx_comando_pagamentos_empresa_forma on comando_pagamentos(empresa_id, forma_code);
create index if not exists idx_comando_itens_profissional on comando_itens(empresa_id, profissional_id);
create index if not exists idx_comando_itens_tipo on comando_itens(empresa_id, tipo);
create index if not exists idx_comando_itens_produto on comando_itens(empresa_id, produto_id);
create index if not exists idx_comando_gorjetas_profissional on comando_gorjetas(empresa_id, profissional_id);
create index if not exists idx_produtos_empresa_ativo on produtos(empresa_id, ativo);
create index if not exists idx_produto_estoque_movimentos_produto on produto_estoque_movimentos(empresa_id, produto_id, created_at);

-- RLS preparado, mas o V1 usa backend service role. Não expor Supabase direto ao frontend.
alter table empresas enable row level security;
alter table clientes enable row level security;
alter table servicos enable row level security;
alter table produtos enable row level security;
alter table profissionais enable row level security;
alter table profissional_servicos enable row level security;
alter table formas_pagamento enable row level security;
alter table agendamentos enable row level security;
alter table comandos enable row level security;
alter table comando_itens enable row level security;
alter table produto_estoque_movimentos enable row level security;
alter table comando_pagamentos enable row level security;
alter table comando_gorjetas enable row level security;
alter table caixa_movimentos enable row level security;
alter table lista_espera enable row level security;
alter table agendamento_eventos enable row level security;
