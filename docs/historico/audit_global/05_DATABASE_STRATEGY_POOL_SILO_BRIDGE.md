# 05 — Estratégia de Banco: Pool / Bridge / Silo / Dedicado

**Data:** 2026-07-10
**Status:** ROADMAP / VISÃO FUTURA — **NADA aqui é executável.** Todo SQL neste documento é **PLANEJADO e BLOQUEADO** (faixa 007+ da governança; faixa 046–060 obsoleta). Nenhuma migration nova sem decisão explícita do usuário e arquivo versionado em `supabase/migrations/`.
**Fonte:** Auditoria Global 2026-07-10 (SQL/banco + escalabilidade). Migrations reais: 001–006 apenas.

---

## 1. Estado real hoje (E0) — verificado

| Item | Realidade | Classificação |
|---|---|---|
| Topologia | 1 projeto Supabase (`qosioymzswhkqkziocas`), acesso exclusivo via PostgREST com `service_role` | REAL |
| Multi-tenant no schema | `empresa_id` NOT NULL + FK + índices compostos `(empresa_id, data)` em 16/16 tabelas | REAL — melhor ativo de escala do projeto |
| Tenant no runtime | 1 único tenant hardcoded (`DEFAULT_EMPRESA_ID`, `env.js:19`) | HARDCODED |
| RLS | Habilitado nas 16 tabelas, **zero policies** (deny-all p/ anon; service_role bypassa) | REAL/PARCIAL por design |
| Idempotência de comando | `ux_comandos_empresa_idempotency` + dupla checagem na RPC com race handling | REAL |
| `checkout_close` | Atômica, idempotente, `FOR UPDATE` em produtos; **não revalida totais do `p_preview`** | REAL / CRÍTICO (validação) |
| Append-only do ledger | Convenção de aplicação — DELETE concedido ao service_role em todas as tabelas, cascades em `comando_itens`/`pagamentos`/`gorjetas`, sem trigger | **CRÍTICO estrutural** |
| Estorno por lançamento | Inexistente em qualquer camada (sem tipo/RPC de estorno; `caixa_movimentos` só grava `entrada_pagamento`) | AUSENTE |
| Partição / réplica / shard | Nenhum `PARTITION BY`; single-writer | REAL p/ 1 tenant; inexistente p/ escala |
| Conexões | Funil real: pool do PostgREST (~10) + limite do compute — teto efetivo ~10–15 tx simultâneas | PARCIAL |
| `unidade_id` / franquia | Não modelado | BLOQUEADO |
| `actor_id` / `command_id` de ledger | Ausentes em 100% das tabelas | AUSENTE |
| Analytics | Agregação full-table em Node por request (O(n×m)) | **CRÍTICO** — quebra com 1 tenant grande |
| Eventos | `agendamento_eventos` existe, nada escreve | MOCKADO |
| SQL 007+ | Só em docs de planejamento; nenhum `.sql` físico | BLOQUEADO (coerente com governança) |

**Leitura executiva:** a fundação física (tenant key universal, ledger em centavos, idempotência, locks) está mais correta que o runtime. O que quebra primeiro **não é multi-tenant — é o padrão "carregar tabela inteira em Node por request"**, que já ameaça o tenant único atual.

---

## 2. As 10 estratégias (matriz tenant tier × plano de dados) — ROADMAP

Nenhuma destas existe hoje. Hoje = pool de tenant único, tudo (OLTP + analytics + eventos) no mesmo Postgres.

| # | Estratégia | Tenant tier | OLTP (ledger) | Analytics | Eventos | Quando (estágio) | Critério de decisão |
|---|---|---|---|---|---|---|---|
| 1 | **Pool regional (RLS)** | Long tail (salão único) | Pool + RLS por `empresa_id` | Views/RPCs agregadas no pool | Outbox no pool | E1 (default) | Sempre o default; schema já suporta sem migração de dados |
| 2 | **Pool + read replica** | Long tail | Pool + RLS | Réplica de leitura compartilhada | Outbox no pool | E2 | Quando query de insight competir com latência de checkout (p95 de close degrada em janela de dashboard) |
| 3 | **Pool particionado** | Salão médio | `PARTITION BY HASH(empresa_id)` + subpartição mensal nas tabelas de ledger | Réplica | Outbox | E2 | Tabelas de ledger na casa de 10⁷–10⁸ linhas; VACUUM/index bloat mensurável |
| 4 | **Bridge (schema-por-franquia)** | Franquia pequena | Schema dedicado no cluster pool | Réplica | Outbox por schema | E2/E3 | Franquia exige isolamento lógico/backup próprio sem justificar cluster dedicado |
| 5 | **Bridge + warehouse (ledger separado do analítico)** | Franquia ~200 unidades | Bridge | Warehouse compartilhado via CDC do outbox | Stream compartilhado | E3 | Relatórios consolidados de franquia começam a puxar história longa; separa plano de leitura analítica do OLTP |
| 6 | **Silo — dedicado por franquia** | Franquia premium | DB dedicado por franquia | Warehouse compartilhado | Stream compartilhado | E3 | SLA/volume contratual; blast radius; noisy neighbor comprovado |
| 7 | **Silo total (analytics dedicado)** | Franquia premium + compliance | Silo | Silo analítico dedicado | Stream dedicado | E3 | Requisito contratual de isolamento de dados analíticos |
| 8 | **Dedicado por país/região** | Região regulada (ex.: UE) | Pool regional dedicado | Warehouse regional | Stream regional | E3 | Residência de dados / latência; implementado como **célula** (deploy completo por região), não como partição SQL |
| 9 | **Silo dentro do regional** | Região + franquia grande | Silo no cluster regional | Warehouse regional | Stream regional | E3 | Combinação de 6 + 8 |
| 10 | **Enterprise / white-label** | Contrato único | Silo total single-tenant (OLTP + analytics + eventos isolados) | — | — | Sob contrato | Exigência contratual; deployment próprio |

### Estratégias transversais (aplicáveis a vários tiers)

| Estratégia | Descrição | Estágio | Critério |
|---|---|---|---|
| **Ledger separado** | Ledger permanece OLTP quente; história fria (>13 meses) migra para armazenamento analítico via CDC. Viável porque o ledger é append-only por prática e em centavos int | E2/E3 | Retenção quente de 13 meses estourando storage/performance |
| **Analytics separado** | Insights saem do caminho OLTP: primeiro SQL agregado (E1), depois réplica (E2), depois warehouse via CDC (E3). **Materializar antes de medir é otimização às cegas** | E1→E3 | Item de performance que **já dói** hoje (agregação em Node) — mas a correção E1 é SQL agregado, não warehouse |
| **Event store** | Outbox transacional `eventos(...)` escrito dentro das RPCs (migration 007, bloqueada). É o único compromisso a assumir cedo — sem ele, separar ledger/analytics exigirá backfill doloroso | Decisão em E1 | +1 insert por tx existente; consumidor pode ser `setInterval` por anos |
| **Read replicas** | Réplicas de leitura para insights/dashboard/snapshot | E2 | Contenda leitura×escrita medida |
| **Particionamento tenant/data/região** | Tenant: hash de `empresa_id` nas tabelas de ledger. Data: range mensal em `comandos`, `comando_itens`, `caixa_movimentos`, `produto_estoque_movimentos`. Região: por célula, não por partição SQL. Índices atuais `(empresa_id, data)` já são partition-aligned | E2 | 10⁸ linhas ou VACUUM problemático |

---

## 3. Migração pool → dedicated sem downtime — ROADMAP

Viável porque o ledger é append-only (por prática) e o comando é idempotente:

1. **Dual-write via outbox replay** para o silo de destino.
2. **Backfill por `empresa_id`** — todas as 16 tabelas têm a chave desde a 001.
3. **Verificação de paridade** linha a linha do ledger (contagens + somas de centavos por tabela/período).
4. **Flip de roteamento** num *tenant directory*: tabela `tenants(empresa_id, shard_dsn, tier, region)` — a única peça nova de infraestrutura que E2 exige.

Pré-requisitos reais (hoje AUSENTES): outbox (migration 007), auth/tenant-do-token, fechamento dos 5 furos de escopo de rota, e formalização física do append-only (trigger `BEFORE UPDATE/DELETE` + revoke seletivo de DELETE no ledger — hoje o service_role pode deletar qualquer linha do ledger, CRÍTICO).

---

## 4. SQL futuro — PLANEJADO, NÃO EXECUTÁVEL

> ⚠️ **BLOQUEADO.** Rascunhos ilustrativos da faixa 007+. Não aplicar. Não copiar para `supabase/migrations/`. Autoridade: `docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md` (faixa 007–023).

```sql
-- [PLANEJADO / NÃO EXECUTAR] 007_kortex_ledger_core (esboço)
-- Outbox transacional + autoria + decisão de unidade
create table eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  aggregate text not null,
  aggregate_id uuid not null,
  tipo text not null,
  payload jsonb not null,
  actor_id uuid,           -- quita débito de autoria
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index idx_eventos_empresa_pendentes
  on eventos (empresa_id, created_at) where processed_at is null;

alter table empresas add column grupo_franquia_id uuid; -- OU criar unidades(...): decisão pendente

-- [PLANEJADO / NÃO EXECUTAR] Append-only físico no ledger
revoke delete on comandos, comando_itens, comando_pagamentos,
  comando_gorjetas, caixa_movimentos, produto_estoque_movimentos
  from service_role;
-- + trigger before update/delete raise exception nas 6 tabelas do ledger
-- + tipos de estorno: caixa_movimentos.tipo 'estorno'/'saida';
--   produto_estoque_movimentos.tipo 'devolucao'

-- [PLANEJADO / NÃO EXECUTAR] RLS por tenant (quando houver acesso não-service_role)
create policy tenant_isolation on comandos
  using (empresa_id = (auth.jwt() ->> 'empresa_id')::uuid);

-- [PLANEJADO / NÃO EXECUTAR] Particionamento (E2)
-- comandos, comando_itens, caixa_movimentos, produto_estoque_movimentos:
--   PARTITION BY HASH (empresa_id) → subpartição RANGE mensal (data)

-- [PLANEJADO / NÃO EXECUTAR] Tenant directory (E2)
create table tenants (
  empresa_id uuid primary key,
  shard_dsn text not null,
  tier text not null check (tier in ('pool','bridge','silo','dedicated')),
  region text not null
);
```

---

## 5. Critérios de decisão consolidados

| Sinal medido | Ação | Estratégia |
|---|---|---|
| Insight bloqueia event loop / p95 de checkout degrada em janela de dashboard | Insights em SQL agregado (E1); depois réplica (E2) | 2, analytics separado |
| Ledger > ~10⁷–10⁸ linhas, VACUUM/bloat | Partição hash+mensal | 3, particionamento |
| 2º tenant assinado | Auth + RLS por tenant + fechar furos de escopo **antes** de qualquer dado dele entrar | 1 |
| Franquia exige backup/isolamento próprio | Bridge (schema) | 4 |
| SLA contratual / noisy neighbor comprovado | Silo | 6/7 |
| Residência de dados por país | Célula regional | 8/9 |
| White-label enterprise | Silo total single-tenant | 10 |
| Antes de qualquer separação de planos de dados | Outbox transacional primeiro (senão: backfill doloroso) | Event store |

---

**Reforço final:** o único banco REAL é o pool single-tenant atual com migrations 001–006. Este documento registra a **visão** para evitar retrabalho (decisões baratas agora: outbox, autoria, modelagem de unidade, append-only físico) — não autoriza nenhuma execução.
