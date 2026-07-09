# KORTEXOS™ 5.1 — SQL MASTER PLANNING

**Arquivo:** `docs/planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md`
**Produto:** KortexOS™ 5.1
**Status:** GERADO / AGUARDA RED TEAM — PLANEJAMENTO CANÔNICO, NÃO É SQL EXECUTÁVEL
**Data:** 2026-07-08 (reescrita integral in-place pós-Red Team, conforme `docs/redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md` §4.4 — corrige A01, A03, A05, A07)
**Autoridade:** `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`
**Depende de:** Benchmark Map + Comparative Proposal + Truth Map (reancorado) + Migration Map (reancorado) + Blueprint (corrigido)

---

## 0. Regra de autoridade

Este documento planeja a evolução futura do banco (faixa 007+). Não cria SQL executável, não autoriza migration imediata e não altera a base real 001-006 (bloqueio completo: §10). Cadeia de autoridade completa (Master Briefing > Benchmark > Comparative Proposal > Truth Map > Migration Map > Blueprint > SQL Planning > SQL Draft): `AGENTS.md` §Documentation Authority; mapa de arquivos: [INDEX.md](../INDEX.md).


---

## 1. Veredito executivo

```text
Fundação preservada: supabase/migrations/001–006 (base real em produção).
Próxima faixa: 007+ (NUNCA 046+ — faixa obsoleta).
Pré-requisito absoluto da faixa: 007_kortex_ledger_core.
Nada de wallet, staff current account, assinatura, corporativo ou parceiro antes do ledger core (A03).
Nada de assinatura antes de benefit_obligations (A06).
tenant_core NÃO é premissa. Multi-tenant é decisão formal futura (Migration Map §3).
```

---

## 2. Regras absolutas

| Regra | Status |
|---|---|
| Backend é fonte única da verdade | CRÍTICO |
| Frontend não calcula regra crítica | BLOQUEADO |
| IA não escreve verdade crítica | BLOQUEADO |
| Ledger double-entry nasce ANTES de qualquer saldo/projeção | CRÍTICO (A03) |
| Campos monetários novos usam `_cents bigint` | CRÍTICO |
| Mutações financeiras exigem `idempotency_key` | CRÍTICO (A05) |
| Toda migration nova cumpre o contrato mínimo (§4) | CRÍTICO (A05) |
| Wallet/current account é projeção reconstruível do ledger | CRÍTICO |
| Receita antecipada sem obrigação rastreável | BLOQUEADO (A06) |
| Benefício sem origem formal | BLOQUEADO |
| Polymorphic solto — inclusive `source_table+source_id` no catálogo | BLOQUEADO (A04) |
| Multi-tenant embutido sem decisão formal | BLOQUEADO |
| Cupom aberto; marketplace aberto antes do core | BLOQUEADO |
| SQL livre em payload; migration sem gate; migration sem rollback | BLOQUEADO |

---

## 3. Estado da sequência

| Faixa | Status | Decisão |
|---:|---|---|
| 001–006 | **REAL — aplicada em produção** | PRESERVAR; intocável |
| 007–023 | Evoluções KortexOS™ 5.1 | PLANEJAR (este documento) |
| 024+ | Futuro pós-core | BLOQUEADO |
| 001–045 (4.0) | Referência de design (`docs/legacy/`) | NUNCA aplicar por número |
| 046–060 | OBSOLETA | BLOQUEADA |

---

## 4. Contrato mínimo por migration (A05)

Nenhuma migration da faixa 007+ é válida sem declarar:

```text
1. REVOKE default + GRANT explícito apenas a service_role/roles técnicos
   (padrão já provado na base real: migrations 003/004).
2. Append-only enforcement em tabelas de evento/lançamento
   (REVOKE UPDATE/DELETE + trigger de proteção quando aplicável).
3. idempotency_key UNIQUE em toda mutação financeira.
4. _cents bigint para dinheiro; numeric + CHECK de range para percentuais.
5. Estratégia de rollback: o que reverte, o que nunca reverte com dados reais.
6. Fixture + gate correspondente antes de promover.
7. Single-tenant: sem RLS por tenant nesta fase; segurança via grants/RPC
   (RLS por tenant entra apenas com a decisão formal de multiunidade).
```

---

## 5. Faixa planejada 007–023

| Seq | Migration | Objetivo | Domínios | Gates | Status |
|---:|---|---|---|---|---|
| 007 | `007_kortex_ledger_core.sql` | Ledger double-entry append-only (accounts, transactions, entries, balances) — PRÉ-REQUISITO da faixa | D15 | 11 | PLANEJADA |
| 008 | `008_kortex_sellable_catalog.sql` | Catálogo canônico vendável com origem forte (FKs dedicadas por tipo + CHECK) | D06/D12/D18 | 10/15 | PLANEJADA |
| 009 | `009_kortex_benefit_obligations.sql` | Receita antecipada: recebido → obrigação → consumo → reconhecimento | D15/D16/D18 | 11/15 | PLANEJADA |
| 010 | `010_kortex_client_wallet.sql` | Wallet do cliente: projeção do ledger; negativo só com Negative Guard | D13/D15/D16 | 11/12/13 | PLANEJADA |
| 011 | `011_kortex_staff_current_account.sql` | Conta corrente do profissional + payout batch + tip isolation | D15/D16/D17 | 11/13/14 | PLANEJADA |
| 012 | `012_kortex_trust_layer.sql` | Reliability Score (promove v0 shadow do V1.4), Trust Pass, Healing | D02/D24 | 08/12/16 | PLANEJADA |
| 013 | `013_kortex_negative_guard.sql` | Decisões auditáveis de fiado/margem/benefício/exceção | D12/D15/D16/D18/D24 | 10/11/13/15 | PLANEJADA |
| 014 | `014_kortex_capacity_inventory.sql` | Inventário de capacidade (slots, elegibilidade, score snapshot) | D07/D08/D11 | 03/04 | PLANEJADA |
| 015 | `015_kortex_rev_pah_analytics.sql` | `rev_pah_snapshots`, margem/hora, rebuild runs com hash | D25 | 19 | PLANEJADA |
| 016 | `016_kortex_subscription_engine.sql` | Planos, assinaturas, grants por ciclo, consumo, dunning | D18 | 10/11/13/15/19 | PLANEJADA |
| 017 | `017_kortex_corporate_benefits.sql` | Contratos B2B2C, elegibilidade, consent LGPD, agregado k-anônimo (A14) | D18/D26 | 15/19/21 | PLANEJADA |
| 018 | `018_kortex_partner_network.sql` | Parceiros, campanhas, links/QR com origem/validade/limite | D18/D21/D27 | 09/15/23 | PLANEJADA |
| 019 | `019_kortex_yield_occupancy.sql` | Políticas de yield, premium window, off-peak explicáveis | D07/D12/D18/D23 | 03/08/16/19 | PLANEJADA |
| 020 | `020_kortexlink_activation.sql` | Links, QR, campanhas, consentimentos, dispatch governado | D21/D30 | 16/17/20/21 | PLANEJADA |
| 021 | `021_kortex_ai_governance.sql` | Matriz de soberania, Action Requests, dispatcher whitelist | D22/D23/D31 | 16/17/20 | PLANEJADA |
| 022 | `022_kortex_marketplace_locks.sql` | Travas contra marketplace aberto prematuro | D27/D30/D31 | 20/23/25 | BLOQUEIO |
| 023 | `023_kortex_gate_extensions.sql` | Fixtures e assertions das engines 5.1 | D31 | 00–25 | PLANEJADA |

---

## 6. Dependências obrigatórias

| Migration | Não pode iniciar antes de |
|---|---|
| 007 | — (primeira da faixa) |
| 008 | catálogo real estável (JÁ REAL na base 001–006) |
| 009 | 007 |
| 010 | 007 + 009 |
| 011 | 007 |
| 012 | histórico de agenda real (JÁ REAL) |
| 013 | 007 + 010 |
| 014 | agenda/profissionais reais (JÁ REAL) |
| 015 | 014 + ledger distribuído real |
| 016 | 008 + 009 + 013 |
| 017 | 008 + 016 + consent LGPD (017/020) |
| 018 | 008 + 020 |
| 019 | 012 + 013 + 014 |
| 020 | D21/D30 design aprovado |
| 021 | D22/D23 design aprovado |
| 022 | — (pode nascer cedo como trava) |
| 023 | 007–022 |

---

## 7. Polymorphic checkout — decisão técnica (A04)

### Formas proibidas

```text
checkout_items.item_type + item_id sem FK real            → BLOQUEADO
sellable_catalog_items.source_table + source_id soltos    → BLOQUEADO (mover de camada não resolve)
```

### Forma aprovada

```text
Colunas FK dedicadas por tipo no catálogo (service_id, product_id, package_id, membership_plan_id,
corporate_contract_id, partner_campaign_id) + CHECK garantindo exatamente UMA origem preenchida
e coerente com item_kind + Command de publicação que valida existência da origem.
checkout_items → FK real para o catálogo → snapshot imutável → payment → ledger.
```

---

## 8. Red Team checklist antes do SQL executável

| Pergunta | Se falhar |
|---|---|
| Existe saldo fora do ledger core? | BLOQUEAR |
| Existe wallet/staff account sem 007 aplicada antes? | BLOQUEAR |
| Existe receita antecipada sem obrigação (009)? | BLOQUEAR |
| Existe benefício sem origem formal? | BLOQUEAR |
| Existe checkout item sem catálogo canônico? | BLOQUEAR |
| Existe referência polimórfica solta (inclusive no catálogo)? | BLOQUEAR |
| Existe migration sem contrato mínimo (§4)? | BLOQUEAR |
| Existe multi-tenant embutido sem decisão formal? | BLOQUEAR |
| Existe preço final calculado no frontend? | BLOQUEAR |
| Existe IA executando RPC crítica livre? | BLOQUEAR |
| Existe migration fora da sequência 007+ autorizada? | BLOQUEAR |

---

## 9. Ordem de execução futura

```text
1. Red Team do conjunto corrigido (Truth Map, Migration Map, Blueprint, este Planning, Draft)
2. Corrigir o que o Red Team apontar
3. SQL Executable Package 007+ em sandbox (nunca direto no Supabase real)
4. Fixtures e seeds de gates
5. Rodar gates
6. Corrigir falhas
7. Congelar SQL Master 5.1
8. Só então avaliar aplicação no Supabase real, migration a migration
```

---

## 10. Bloqueio final

```text
Nenhuma migration 007+ está autorizada para execução real por este documento.
A faixa 046–060 está obsoleta e não deve ser referenciada como plano vigente.
Este arquivo é planejamento canônico, não implementação.
```

---

## 11. Próximo artefato

```text
docs/planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md (reescrita conforme Correction Plan §4.5)
```
