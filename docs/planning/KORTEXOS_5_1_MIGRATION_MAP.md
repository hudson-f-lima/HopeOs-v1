# KORTEXOS™ 5.1 — MIGRATION MAP

**Arquivo:** `docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md`
**Produto:** KortexOS™ 5.1
**Tipo:** Mapa de promoção, nomenclatura, impacto técnico e controle de migrations
**Status:** GERADO / AGUARDA RED TEAM — não autoriza SQL executável
**Data:** 2026-07-08 (reescrita integral in-place pós-Red Team, conforme `docs/redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md` §4.2 — corrige A01, A07, A09)
**Regra de ouro:** sem patch, delta ou remendo
**Base:** Master Briefing 5.1 + Benchmark Map + Comparative Proposal + Truth Map (reancorado) + base real `supabase/migrations/001–006` + `docs/legacy/SMART_FLOW_4_0_*` (referência de design)

---

## 0. Regra de autoridade

```text
Migration Map mede impacto.
Blueprint organiza arquitetura.
SQL materializa depois.
```

Este documento não executa migration e não cria SQL.

---

## 1. Regra de fundação (substitui a premissa 001–045)

```text
001–006 = BASE REAL. Única sequência física. Aplicada em produção (qosioymzswhkqkziocas). Intocável.
007+    = FAIXA FUTURA KortexOS 5.1. Planejada; bloqueada até Planning/Draft corrigidos + novo Red Team.
001–045 (Blueprint 4.0) = REFERÊNCIA DE DESIGN em docs/legacy/. Nunca sequência física.
                          Os números 001–006 do 4.0 colidem com a base real (conteúdos diferentes).
046–060 = OBSOLETO/BLOQUEADO. Numeração superada pelo reancoramento.
```

Base real inventariada:

| Nº | Migration real | Conteúdo |
|---:|---|---|
| 001 | `001_init.sql` | Schema HOPE OS (clientes, profissionais, serviços, produtos, comandos, ledger distribuído) |
| 002 | `002_checkout_close_rpc.sql` | RPC atômica de fechamento de checkout |
| 003 | `003_lock_rpc_permissions.sql` | Lock de permissões da RPC |
| 004 | `004_service_role_table_grants.sql` | Grants service_role |
| 005 | `005_agenda_status_reagendado.sql` | Status reagendado na agenda |
| 006 | `006_produto_estoque_ajuste_rpc.sql` | RPC atômica de ajuste de estoque |

```text
Não renumerar 001–006.
Não aplicar nada do 4.0 por número.
Número de migration ≠ número de domínio.
```

---

## 2. Política de nomes

| Antes | Depois | Decisão |
|---|---|---|
| SMART Flow™ / HOPE OS | KortexOS™ | Renomear em docs; schema físico intocado |
| SMART Scheduling Engine | Capacity Scheduling Engine | Renomear no Blueprint |
| Financial Ledger | KortexFlow Ledger | Renomear no Blueprint |
| Messaging & Conversations | KortexLink Messaging & Activation | Renomear no Blueprint |
| AI Receptionist Engine | Kortex.ai Receptionist | Renomear no Blueprint |
| Retention & CRM Engine | Trust & Retention Engine | Renomear no Blueprint |
| RevPAH (3 nomes divergentes) | **`rev_pah_snapshots`** — nome único canônico (corrige A09) | Propagar em Blueprint e Draft |

### 2.1 Regras de banco

```text
Renomear produto em documento não obriga renomear schema/tabela existente.
Rebranding físico prematuro é risco de retrabalho — tabelas em português da base real permanecem.
Objetos novos da faixa 007+ usam prefixo `kortex_` em inglês, no schema `public`,
coexistindo com a base real (decisão de tenancy: ver §3).
```

---

## 3. Decisão de tenancy (deixou de ser premissa — A01)

```text
O V1 real é single-tenant. `tenant_core` NÃO existe e NÃO é premissa.
Faixa 007+ nasce single-tenant, compatível com a base real.
Colunas `tenant_id` podem nascer nullable-com-default para preparar multiunidade,
mas multi-tenant/RLS por tenant é DECISÃO FORMAL FUTURA do Platform Owner (D28),
com migration própria e gate próprio. Não embutir multi-tenant silenciosamente.
```

---

## 4. Faixa planejada 007+ (substitui 046–060)

Ordem regida pelas dependências dos achados A03 (ledger antes de wallet/staff) e A06 (obrigação antes de assinatura).

| Seq | Migration planejada | Objetivo | Domínios | Gates | Substitui (obsoleta) |
|---:|---|---|---|---|---|
| 007 | `007_kortex_ledger_core.sql` | Ledger double-entry append-only: accounts, transactions, entries, balances reconstruíveis | D15 | 11 | — (era lacuna; A03) |
| 008 | `008_kortex_sellable_catalog.sql` | Catálogo canônico vendável com referência de origem FORTE (A04) | D06/D12/D18 | 10/15 | 046 |
| 009 | `009_kortex_benefit_obligations.sql` | Obrigações de receita antecipada: recebido/obrigação/consumo/reconhecimento (A06) | D15/D16/D18 | 11/15 | — (era lacuna) |
| 010 | `010_kortex_client_wallet.sql` | Wallet do cliente como projeção do ledger | D13/D15/D16 | 11/12/13 | 056 |
| 011 | `011_kortex_staff_current_account.sql` | Conta corrente do profissional + payout batch | D15/D16/D17 | 11/13/14 | 055 |
| 012 | `012_kortex_trust_layer.sql` | Reliability Score, Trust Pass, Healing (promove o v0 shadow do V1.4) | D02/D24 | 08/12/16 | 049 |
| 013 | `013_kortex_negative_guard.sql` | Guardas de fiado, margem, benefício e exceção | D12/D15/D16/D18/D24 | 10/11/13/15 | 050 |
| 014 | `014_kortex_capacity_inventory.sql` | Inventário de capacidade por profissional/recurso/janela | D07/D08/D11 | 03/04 | 047 |
| 015 | `015_kortex_rev_pah_analytics.sql` | `rev_pah_snapshots` + margem/hora + rebuild runs | D25 | 19 | 048 |
| 016 | `016_kortex_subscription_engine.sql` | Assinaturas B2C (planos, ciclos, consumo, dunning) | D18 | 10/11/13/15/19 | 051 |
| 017 | `017_kortex_corporate_benefits.sql` | Contratos B2B2C, elegibilidade, consent LGPD, agregado com k-anonimato (A14) | D18/D26 | 15/19/21 | 052 |
| 018 | `018_kortex_partner_network.sql` | Parceiros, links/QR com origem/validade/limite | D18/D21/D27 | 09/15/23 | 053 |
| 019 | `019_kortex_yield_occupancy.sql` | Políticas de yield, premium window, off-peak | D07/D12/D18/D23 | 03/08/16/19 | 054 |
| 020 | `020_kortexlink_activation.sql` | Links, QR, campanhas, consentimentos | D21/D30 | 16/17/20/21 | 057 |
| 021 | `021_kortex_ai_governance.sql` | Matriz de soberania, Action Requests, dispatcher fechado | D22/D23/D31 | 16/17/20 | 058 |
| 022 | `022_kortex_marketplace_locks.sql` | Travas contra marketplace prematuro | D27/D30/D31 | 20/23/25 | 059 |
| 023 | `023_kortex_gate_extensions.sql` | Fixtures/assertions das engines 5.1 | D31 | 00–25 | 060 |

### 4.1 Dependências obrigatórias

```text
007 ← nada (primeiro da faixa; pré-requisito de 009,010,011,016,017,018)
008 ← catálogo real (serviços/produtos) estável — JÁ REAL na base 001–006
009 ← 007
010 ← 007 + 009
011 ← 007
012 ← histórico agenda real (JÁ REAL) 
013 ← 007 + 010
014 ← agenda/profissionais reais (JÁ REAL na base 001–006)
015 ← 014 + ledger distribuído real
016 ← 008 + 009 + 013
017 ← 008 + 016 + LGPD mínima (consent em 017 ou 020)
018 ← 008 + 020
019 ← 012 + 013 + 014
020 ← D21/D30 design aprovado
021 ← D22/D23 design aprovado
022 ← — (pode nascer cedo como trava)
023 ← 007–022
```

Tabela completa de dependências: `docs/planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md` §6 (autoridade para a faixa 007+; esta seção resume).

---

## 5. Contrato mínimo por migration (A05 — obrigatório na faixa 007+)

Toda migration nova deve declarar:

```text
1. REVOKE default + GRANT explícito só a service_role/roles técnicos (padrão já real nas migrations 003/004).
2. Append-only enforcement (REVOKE UPDATE/DELETE ou trigger) em toda tabela de evento/lançamento.
3. idempotency_key UNIQUE em toda mutação financeira.
4. Dinheiro em _cents bigint; percentuais numeric com CHECK de range.
5. Estratégia de rollback documentada (o que pode e o que não pode reverter).
6. Fixture/gate correspondente — migration sem gate é BLOQUEADA.
```

---

## 6. Polymorphic migration policy (endurecida — A04)

### 6.1 Proibições

```text
BLOQUEADO: item_type + item_id solto em fluxo financeiro.
BLOQUEADO: source_table text + source_id uuid soltos DENTRO do catálogo (apenas mudar de camada não resolve).
```

### 6.2 Forma aprovada

```text
services / products / packages / memberships / corporate_benefits / partner_benefits
        ↓  (colunas FK dedicadas por tipo + CHECK de exclusividade, OU trigger por kind)
kortex_sellable_catalog_items
        ↓  (FK real)
checkout_items → snapshot imutável → payment → ledger
```

| Regra | Status |
|---|---|
| FK dedicada por tipo com CHECK "exatamente uma origem preenchida coerente com kind" | CRÍTICO |
| Snapshot de preço/benefício no checkout | CRÍTICO (já REAL no checkout atual) |
| Origem obrigatória para benefício | CRÍTICO |
| Publicação de item vendável só via Command que valida existência da origem | CRÍTICO |

---

## 7. Gates impactados

Grade 00–25 preservada como design; nenhum gate novo. Cenários 5.1 por gate: ver Blueprint §7. O precursor real é o `test:gate` (63/63) do backend V1.

---

## 8. Mapa de bloqueios

```text
BLOQUEADO: SQL executável neste documento e em qualquer doc 5.1.
BLOQUEADO: faixa 046–060 (obsoleta).
BLOQUEADO: renumerar ou alterar 001–006.
BLOQUEADO: aplicar Blueprint 4.0 como sequência física.
BLOQUEADO: multi-tenant embutido sem decisão formal (§3).
BLOQUEADO: wallet/staff account antes de 007 (ledger core).
BLOQUEADO: assinatura antes de 009 (obrigações).
BLOQUEADO: domínio novo; gate novo; marketplace aberto; IA soberana.
BLOQUEADO: polymorphic solto (inclusive dentro do catálogo).
BLOQUEADO: saldo paralelo; benefício sem origem.
```

---

## 9. DoD para avançar ao Blueprint corrigido

| Critério | Status |
|---|---|
| Fundação real 001–006 declarada única | OK |
| Faixa 007+ planejada com dependências A03/A06 | OK |
| 046–060 obsoleto | OK |
| Nome único RevPAH (`rev_pah_snapshots`) | OK |
| Tenancy como decisão explícita | OK |
| Contrato mínimo por migration definido | OK |
| Polymorphic endurecido | OK |

---

## 10. Veredito

```text
Status: GERADO / AGUARDA RED TEAM (regra A07 — sem autoaprovação).
Próximo artefato a corrigir: docs/architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md (Correction Plan §4.3).
SQL permanece bloqueado.
```
