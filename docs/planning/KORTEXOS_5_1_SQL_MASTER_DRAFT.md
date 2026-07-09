# KORTEXOS™ 5.1 — SQL MASTER DRAFT

**Arquivo:** `docs/planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md`
**Produto:** KortexOS™ 5.1
**Status:** GERADO / AGUARDA RED TEAM — RASCUNHO TÉCNICO, NÃO EXECUTAR
**Data:** 2026-07-08 (reescrita integral in-place pós-Red Team, conforme `docs/redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md` §4.5 — corrige A01, A03, A04, A05, A06, A09, A10, A11, A14)
**Autoridade:** `docs/planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md` (reancorado)
**Regra de ouro:** sem patch, delta ou remendo

---

## 0. Regra de autoridade

Este documento desenha as migrations da faixa **007+** sobre a base real **001–006**.

Ele **não é SQL executável**, **não deve ser aplicado no Supabase**, **não substitui Red Team** e **não altera 001–006**.

```text
A faixa 046–060 está OBSOLETA. Este draft a substitui integralmente.
Blueprint 4.0 (docs/legacy/) é referência de design, nunca sequência física.
Todo bloco SQL aqui é DRAFT ONLY. Nunca copiar para arquivo .sql.
```

---

## 1. Convenções obrigatórias

| Tema | Regra |
|---|---|
| Dinheiro | Sempre `_cents bigint` |
| Percentuais | `numeric` com `CHECK` de range |
| IDs | `uuid` |
| Tempo | `timestamptz` |
| Schema | `public`, prefixo `kortex_`, coexistindo com a base real em português |
| Tenancy | Single-tenant (estado real); multi-tenant só por decisão formal futura |
| Ledger | Double-entry append-only; nasce PRIMEIRO (007) |
| Wallet/staff account | Projeções do ledger; nunca antes de 007 |
| Receita antecipada | Sempre com obrigação rastreável (009) |
| Polymorphic | Só via catálogo com FKs dedicadas por tipo + CHECK (nunca `source_table+source_id` solto) |
| IA | Nunca executa verdade crítica soberana |
| Marketplace | Bloqueado até core estável |

## 1.1 Contrato mínimo POR migration (A05 — aplica-se a TODAS as migrations 007–023)

```text
a) REVOKE ALL de public/anon/authenticated + GRANT explícito apenas a service_role
   (mesmo padrão real das migrations 003/004).
b) Tabelas de evento/lançamento: REVOKE UPDATE/DELETE de todos os roles não-migration
   + trigger BEFORE UPDATE OR DELETE que aborta (append-only físico).
c) Toda RPC de mutação financeira recebe idempotency_key com UNIQUE por operação.
d) Rollback documentado: seção "reverte / não reverte" por migration.
e) Fixture + cenário de gate antes de promover a executável.
Estas cláusulas NÃO são repetidas em cada bloco abaixo — são vinculantes para todos.
```

---

## 2. Sequência draft 007–023

| Seq | Migration | Tipo | Substitui (obsoleta) |
|---:|---|---|---|
| 007 | `007_kortex_ledger_core.sql` | Core financeiro — PRÉ-REQUISITO | — |
| 008 | `008_kortex_sellable_catalog.sql` | Core catálogo | 046 |
| 009 | `009_kortex_benefit_obligations.sql` | Core obrigações | — |
| 010 | `010_kortex_client_wallet.sql` | Projeção cliente | 056 |
| 011 | `011_kortex_staff_current_account.sql` | Projeção profissional | 055 |
| 012 | `012_kortex_trust_layer.sql` | Trust | 049 |
| 013 | `013_kortex_negative_guard.sql` | Guard financeiro | 050 |
| 014 | `014_kortex_capacity_inventory.sql` | Capacidade | 047 |
| 015 | `015_kortex_rev_pah_analytics.sql` | Analytics | 048 |
| 016 | `016_kortex_subscription_engine.sql` | Recorrência | 051 |
| 017 | `017_kortex_corporate_benefits.sql` | B2B2C | 052 |
| 018 | `018_kortex_partner_network.sql` | Parcerias | 053 |
| 019 | `019_kortex_yield_occupancy.sql` | Yield | 054 |
| 020 | `020_kortexlink_activation.sql` | Ativação | 057 |
| 021 | `021_kortex_ai_governance.sql` | IA governada | 058 |
| 022 | `022_kortex_marketplace_locks.sql` | Bloqueio | 059 |
| 023 | `023_kortex_gate_extensions.sql` | Gates | 060 |

---

# 007 — Kortex Ledger Core (PRÉ-REQUISITO — A03)

## Objetivo

Criar o ledger double-entry append-only ANTES de qualquer wallet, conta corrente, obrigação ou assinatura. O ledger distribuído real (comandos/pagamentos/gorjetas/caixa) permanece como fonte operacional; o ledger core nasce como camada contábil formal alimentada por Command, com reconciliação entre os dois provada em gate antes de qualquer projeção depender dele.

## Domínios / Gates

D15 / Gate 11

## Objetos planejados

| Objeto | Função |
|---|---|
| `kortex_accounts` | Plano de contas (caixa, receita, gorjeta, comissão a pagar, obrigação, wallet cliente, conta staff) |
| `kortex_ledger_transactions` | Cabeçalho com `idempotency_key` UNIQUE |
| `kortex_ledger_entries` | Lançamentos double-entry append-only |
| `kortex_account_balance_snapshots` | Projeção reconstruível com hash de rebuild |

## Tabela draft

```sql
-- DRAFT ONLY — NÃO EXECUTAR
create table public.kortex_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  transaction_kind text not null,
  reference_comando_id uuid null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.kortex_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.kortex_ledger_transactions(id),
  account_id uuid not null references public.kortex_accounts(id),
  direction text not null check (direction in ('debit','credit')),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);
-- invariante de soma zero por transaction validada por trigger/constraint deferida
```

## Invariantes

1. Soma de débitos = soma de créditos por transação (zero-sum).
2. UPDATE/DELETE proibidos (contrato §1.1-b).
3. Correção só por lançamento reverso.
4. Saldo é sempre reconstruível; snapshot sem rebuild hash é MOCKADO.
5. Reconciliação ledger core × ledger distribuído real é cenário de gate obrigatório.

## Rollback

Reverte: criação das tabelas em sandbox sem dados. Não reverte: qualquer tabela com lançamento real.

---

# 008 — Sellable Catalog (A04 endurecido, A10)

## Objetivo

Catálogo canônico de itens vendáveis com origem FORTE — sem `source_table+source_id` solto.

## Domínios / Gates

D06 / D12 / D18 / Gate 10 / Gate 15

## Objetos planejados

| Objeto | Função |
|---|---|
| `kortex_sellable_item_kind` | Enum de tipos vendáveis |
| `kortex_sellable_catalog_items` | Catálogo com FKs dedicadas por tipo |
| `kortex_sellable_catalog_snapshots` | Snapshot imutável no momento da venda |

## Tabela draft

```sql
-- DRAFT ONLY — NÃO EXECUTAR
create type public.kortex_sellable_item_kind as enum (
  'service','product','package','membership','corporate_benefit','partner_benefit','credit','fee','adjustment'
);

create table public.kortex_sellable_catalog_items (
  id uuid primary key default gen_random_uuid(),
  item_kind public.kortex_sellable_item_kind not null,
  -- A04: FKs DEDICADAS por tipo, nunca source_table/source_id soltos
  servico_id uuid null references public.servicos(id),
  produto_id uuid null references public.produtos(id),
  package_id uuid null,             -- FK real quando pacotes existirem
  membership_plan_id uuid null,     -- FK real na 016
  corporate_contract_id uuid null,  -- FK real na 017
  partner_campaign_id uuid null,    -- FK real na 018
  display_name text not null,
  base_price_cents bigint not null check (base_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- exatamente UMA origem preenchida e coerente com o kind:
  check (
    (item_kind = 'service' and servico_id is not null
      and produto_id is null and package_id is null and membership_plan_id is null
      and corporate_contract_id is null and partner_campaign_id is null)
    or
    (item_kind = 'product' and produto_id is not null
      and servico_id is null and package_id is null and membership_plan_id is null
      and corporate_contract_id is null and partner_campaign_id is null)
    or
    (item_kind in ('credit','fee','adjustment') and servico_id is null and produto_id is null
      and package_id is null and membership_plan_id is null
      and corporate_contract_id is null and partner_campaign_id is null)
    -- padrões para package/membership/corporate/partner adicionados quando as FKs existirem
  ),
  unique (item_kind, servico_id, produto_id, package_id, membership_plan_id,
          corporate_contract_id, partner_campaign_id)  -- A10: unique cobre a origem completa
);
```

## Invariantes

1. Publicação de item só via Command que valida existência da origem.
2. `item_type + item_id` solto segue BLOQUEADO em qualquer fluxo financeiro.
3. Preço final vem do backend; snapshot obrigatório no checkout.
4. FKs de tipos futuros (membership/corporate/partner) são materializadas nas migrations que criam as tabelas-alvo — nunca antes (regra de FK cross-migration do design 4.0).

---

# 009 — Benefit Obligations (A06)

## Objetivo

Separar formalmente: dinheiro recebido → obrigação futura → consumo do benefício → reconhecimento econômico. Sem isso, assinatura/pacote/crédito vira caixa bonito e contabilidade ruim.

## Domínios / Gates

D15 / D16 / D18 / Gate 11 / Gate 15

## Objetos planejados

| Objeto | Função |
|---|---|
| `kortex_benefit_obligations` | Obrigação com origem, valor, validade e status |
| `kortex_benefit_obligation_events` | Consumo/reconhecimento/expiração append-only, sempre ligados ao ledger |

## Tabela draft

```sql
-- DRAFT ONLY — NÃO EXECUTAR
create table public.kortex_benefit_obligations (
  id uuid primary key default gen_random_uuid(),
  origin_kind text not null check (origin_kind in
    ('subscription','package','corporate_contract','partner_campaign','cashback','manual_grant')),
  origin_catalog_item_id uuid not null references public.kortex_sellable_catalog_items(id),
  cliente_id uuid not null references public.clientes(id),
  funding_transaction_id uuid not null references public.kortex_ledger_transactions(id),
  total_value_cents bigint not null check (total_value_cents >= 0),
  consumed_value_cents bigint not null default 0 check (consumed_value_cents >= 0),
  valid_from timestamptz not null,
  valid_until timestamptz null,
  status text not null check (status in ('active','consumed','expired','cancelled')),
  created_at timestamptz not null default now(),
  check (consumed_value_cents <= total_value_cents)
);
```

## Invariantes

1. Toda receita antecipada nasce com obrigação ligada a transação do ledger (`funding_transaction_id`).
2. Consumo só via checkout backend-only, com evento append-only e lançamento no ledger.
3. Benefício sem origem formal é BLOQUEADO.
4. Expiração gera reconhecimento explícito, nunca sumiço silencioso.

---

# 010 — Client Wallet

## Objetivo

Wallet do cliente como projeção reconstruível do ledger core (nunca fonte própria de verdade).

## Domínios / Gates

D13 / D15 / D16 / Gate 11 / Gate 12 / Gate 13

## Objetos planejados

| Objeto | Função |
|---|---|
| `kortex_client_wallet_entries` | Entradas derivadas do ledger (FK obrigatória para 007) |
| `kortex_client_wallet_balance_snapshots` | Projeção com rebuild hash |
| `kortex_client_wallet_negative_limits` | Limites autorizados (Negative Guard) |

## Invariantes

1. Toda entrada referencia `kortex_ledger_transactions(id)` — FK real, nunca órfã (A03 resolvido: 007 existe antes).
2. Saldo negativo exige limite autorizado + decisão do Negative Guard (013).
3. Drift entre snapshot e rebuild bloqueia release (Gate 13).
4. Saldo não é editável direto; frontend nunca calcula saldo.

---

# 011 — Staff Current Account

## Objetivo

Conta corrente do profissional: comissão, gorjeta isolada, ajustes aprovados, payout batch.

## Domínios / Gates

D15 / D16 / D17 / Gate 11 / Gate 13 / Gate 14

## Objetos planejados

| Objeto | Função |
|---|---|
| `kortex_staff_account_entries` | Entradas derivadas do ledger (FK real para 007) |
| `kortex_staff_payout_batches` / `kortex_staff_payout_items` | Lotes de repasse com `idempotency_key` |

## Invariantes

1. Profissional não financia fiado autorizado do cliente (liquidação no ato via ledger).
2. Gorjeta 100% isolada — nunca base de comissão (já REAL no ledger distribuído; preservar na camada nova).
3. Conta reconstruível via ledger; staff não vê financeiro alheio.
4. Ajuste manual exige Action Request (021).

---

# 012 — Trust Layer (A11 parcial)

## Objetivo

Formalizar Reliability Score (promovendo o v0 shadow do V1.4 F2), Trust Pass, Healing e fricção progressiva.

## Domínios / Gates

D02 / D24 / Gate 08 / Gate 12 / Gate 16

## Objetos planejados

| Objeto | Função |
|---|---|
| `kortex_reliability_score_events` | Eventos append-only com referência VALIDADA (trigger confere existência da entidade de origem por kind — A11, sem polymorphic cego) |
| `kortex_reliability_scores` | Projeção reconstruível |
| `kortex_trust_passes` / `kortex_healing_events` / `kortex_friction_requirements` | Baixa fricção, cura, depósito exigido |

## Invariantes

1. Score não é editado manualmente; fricção calculada por Command.
2. Healing exige eventos reais concluídos; no-show não é apagado do histórico.
3. Trust Pass não ignora Negative Guard.
4. Score v0 do V1.4 permanece shadow (exibe, não pune) até esta migration + política + gate.

---

# 013 — Negative Guard

## Objetivo

Decisões auditáveis para fiado, margem, benefício e exceção.

## Domínios / Gates

D12 / D15 / D16 / D18 / D24 / Gate 10 / Gate 11 / Gate 13 / Gate 15

## Objetos planejados

`kortex_negative_guard_policies`, `kortex_negative_guard_decisions` (decisão `allow|block|require_deposit|require_approval`, margem projetada, wallet projetada, `action_request_id`), `kortex_negative_guard_overrides` (só via Action Request).

## Invariantes

1. Fiado autorizado não reduz repasse do profissional.
2. Margem negativa exige bloqueio ou aprovação explícita.
3. Venda abaixo do custo continua bloqueada (CHECK já REAL na base 001–006 — preservar).
4. Exceção sensível exige Action Request.

---

# 014 — Capacity Inventory

## Objetivo

Transformar agenda em inventário econômico de capacidade (slots, elegibilidade, score snapshot).

## Domínios / Gates

D07 / D08 / D11 / Gate 03 / Gate 04

## Objetos planejados

`kortex_capacity_slots` (profissional/recurso/janela/status), `kortex_capacity_slot_eligibilities`, `kortex_capacity_score_snapshots`.

## Invariantes

1. Disponibilidade oficial continua backend-only.
2. Slot não confirma agendamento sozinho; agenda real (`agendamentos`) segue como verdade de reserva.
3. Score é snapshot auditável, não verdade mutável.
4. Recursos físicos (cadeira/sala) entram aqui como inventário — não existia tabela na base real.

---

# 015 — RevPAH Analytics (A09: nome único `rev_pah_snapshots`)

## Objetivo

Read models reconstruíveis: RevPAH, margem por hora disponível, receita off-peak.

## Domínios / Gates

D25 / Gate 19

## Objetos planejados

`kortex_rev_pah_snapshots` (por data×profissional: minutos disponíveis/vendidos, receita, margem, rev_pah_cents, `source_hash`, `rebuild_run_id`), `kortex_analytics_rebuild_runs`.

## Invariantes

1. Dashboard não cria verdade; métrica sem `source_hash` é MOCKADO.
2. Insights V1.4 (occupancy/cashflow/margin em Node) são o precursor; esta migration materializa snapshots quando escala exigir.
3. Nome canônico único: `rev_pah_snapshots` — os nomes `revenue_per_available_hour_snapshots` e `rev_pah_daily_snapshots` estão extintos.

---

# 016 — Subscription Engine

## Objetivo

Assinaturas B2C como motor de recorrência, caixa antecipado e ocupação off-peak.

## Domínios / Gates

D18 / Gate 10 / Gate 11 / Gate 13 / Gate 15 / Gate 19

## Objetos planejados

`kortex_membership_plans` (FK para catálogo 008; `billing_period`, `price_cents`, `off_peak_only`, `allowed_weekdays`, `max_uses_per_cycle`), `kortex_client_subscriptions`, `kortex_subscription_cycle_grants` (cada grant CRIA obrigação na 009), `kortex_subscription_usage_events` (append-only, `idempotency_key`), `kortex_subscription_dunning_events`.

## Invariantes

1. Assinatura não é cupom: cobrança gera transação no ledger (007) + obrigação (009).
2. Consumo ocorre no checkout backend-only e baixa a obrigação.
3. Comissão calculada no uso real conforme regra do plano.
4. Sem 007+009+013 aplicadas antes, esta migration é inválida.

---

# 017 — Corporate Benefits (A11, A14)

## Objetivo

Contratos B2B2C com elegibilidade individual, consent LGPD e analytics agregado k-anônimo.

## Domínios / Gates

D18 / D26 / Gate 15 / Gate 19 / Gate 21

## Objetos planejados

`kortex_corporate_accounts`, `kortex_corporate_contracts`, `kortex_corporate_eligibilities`, `kortex_corporate_consent_records` (A11: base legal e consentimento do funcionário registrados aqui, não adiados), `kortex_corporate_usage_events` (append-only), `kortex_corporate_aggregate_snapshots`.

## Invariantes

1. Empresa vê apenas agregado; **snapshot agregado só é gerado com n ≥ 5 funcionários no grupo** (A14 — k-anonimato mínimo; grupo menor retorna faixa suprimida).
2. Empresa nunca vê histórico sensível individual.
3. Elegibilidade validada no backend; benefício com origem formal (008) e obrigação (009).
4. Consent LGPD registrado antes do primeiro uso do benefício.

---

# 018 — Partner Network

## Objetivo

Parcerias locais como canal rastreável (anti-cupom).

## Domínios / Gates

D18 / D21 / D27 / Gate 09 / Gate 15 / Gate 23

## Objetos planejados

`kortex_partner_accounts`, `kortex_partner_agreements`, `kortex_partner_campaigns`, `kortex_partner_activation_links` (token_hash UNIQUE, `valid_from < valid_until`, `max_redemptions`), `kortex_partner_redemptions` (append-only), `kortex_partner_performance_snapshots`.

## Invariantes

1. QR/link sem expiração é BLOQUEADO.
2. Benefício de parceiro passa por checkout, catálogo (008) e obrigação (009).
3. Parceiro não acessa dados sensíveis individuais.
4. Marketplace aberto segue bloqueado (022).

---

# 019 — Yield & Occupancy

## Objetivo

Políticas de yield explicáveis: premium window, off-peak, convenience premium.

## Domínios / Gates

D07 / D12 / D18 / D23 / Gate 03 / Gate 08 / Gate 16 / Gate 19

## Objetos planejados

`kortex_yield_policies`, `kortex_yield_decision_snapshots` (decisão + explicação jsonb + `action_request_required`), `kortex_off_peak_windows`, `kortex_premium_window_rules`.

## Invariantes

1. Preço dinâmico opaco é BLOQUEADO; toda decisão tem explicação.
2. Horário nobre protegido; oferta off-peak respeita margem mínima.
3. Exceção exige Action Request.

---

# 020 — KortexLink Activation

## Objetivo

Links, QR, campanhas, consentimentos e dispatch governado.

## Domínios / Gates

D21 / D30 / Gate 16 / Gate 17 / Gate 20 / Gate 21

## Objetos planejados

`kortex_activation_links`, `kortex_activation_events`, `kortex_communication_consents`, `kortex_campaign_dispatch_batches`.

## Invariantes

1. Link sem origem é bloqueado; campanha sensível exige consentimento.
2. WhatsApp/mensagem não agenda nem muta verdade direta — gera intent ou Action Request.
3. O deep link `wa.me` manual do V1.4 continua permitido (não é automação).

---

# 021 — AI Governance

## Objetivo

Matriz de soberania, Action Requests e dispatcher whitelist.

## Domínios / Gates

D22 / D23 / D31 / Gate 16 / Gate 17 / Gate 20

## Objetos planejados

`kortex_action_requests` (estados: draft→ready_for_review→approved→executing→executed→rejected→cancelled→failed), `kortex_ai_sovereignty_matrix`, `kortex_ai_safety_events`, `kortex_ai_recommendation_snapshots`.

## Invariantes

1. IA entende e propõe; nunca confirma, cobra, perdoa, altera comissão ou cria ledger.
2. Action Request não executa SQL livre; dispatcher usa whitelist fechada de Commands.
3. Toda execução aprovada passa pelo mesmo Command backend que um humano usaria.

---

# 022 — Marketplace Preflight Locks

## Objetivo

Travas formais contra marketplace aberto antes do core estável.

## Domínios / Gates

D27 / D30 / D31 / Gate 20 / Gate 23 / Gate 25

## Objetos planejados

`kortex_marketplace_release_locks`, `kortex_marketplace_preflight_checks`, `kortex_marketplace_block_events`.

---

# 023 — Gate Extensions 5.1

## Objetivo

Fixtures, assertions e evidências das engines 5.1 nos cenários de gate.

## Cenários mínimos

| Gate | Cenário obrigatório |
|---:|---|
| 03 | Capacity Inventory não cria conflito com `agendamentos` real |
| 08 | Trust Layer aplica fricção correta |
| 10 | Checkout usa catálogo canônico; origem forte validada |
| 11 | Ledger core zero-sum; reconciliação com ledger distribuído real |
| 13 | Wallet rebuild sem drift |
| 14 | Staff account preserva comissão/gorjeta isolada |
| 15 | Benefício com origem/validade/consumo/obrigação |
| 16 | Exceção exige Action Request |
| 17 | IA/KortexLink não mutam verdade crítica |
| 19 | `rev_pah_snapshots` reconstruível com hash |
| 21 | Agregado corporativo k-anônimo (n≥5) |
| 23 | Marketplace bloqueado |
| 25 | Release bloqueado se qualquer crítico falhar |

---

## 3. Red Team obrigatório antes de SQL executável

| Teste | Resultado exigido |
|---|---|
| Wallet/staff entry sem transação do ledger core | Falha |
| Receita antecipada sem obrigação (009) | Falha |
| Item de catálogo com origem incoerente com kind | Falha |
| Checkout item sem catálogo canônico | Falha |
| QR de parceiro sem expiração | Falha |
| Agregado corporativo com n<5 exposto | Falha |
| IA tentando executar RPC fora da whitelist | Falha |
| Tabela de lançamento aceitando UPDATE/DELETE | Falha |
| Mutação financeira sem idempotency_key | Falha |
| Migration sem fixture/rollback/contrato §1.1 | Falha |
| Migration numerada fora de 007+ | Falha |

---

## 4. Ordem de promoção após este draft

```text
1. Red Team do conjunto corrigido (este draft incluído)
2. Corrigir o draft conforme achados
3. SQL Executable Package 007+ em sandbox
4. Fixtures e seeds de gates
5. Rodar gates (incl. reconciliação ledger core × distribuído)
6. Corrigir falhas
7. Congelar SQL Master 5.1
8. Só então avaliar Supabase real, migration a migration
```

---

## 5. Bloqueio final

```text
Este documento é rascunho técnico. Status: GERADO / AGUARDA RED TEAM.
Não executar. Não copiar para migration real. Não aplicar no Supabase.
Faixa 046–060: obsoleta. Base real 001–006: intocável.
```
