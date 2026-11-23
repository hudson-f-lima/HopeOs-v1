# KORTEXOS™ 5.1 — TRUTH MAP

**Arquivo:** `docs/canon/KORTEXOS_5_1_TRUTH_MAP.md`
**Produto:** KortexOS™ 5.1
**Tipo:** Mapa de verdade, maturidade e bloqueios
**Status:** GERADO / AGUARDA RED TEAM — não autoriza SQL, migration ou implementação
**Data:** 2026-07-08 (reescrita integral in-place pós-Red Team, conforme `docs/redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md` §4.1 — corrige A01, A02, A07)
**Regra de ouro:** sem patch, delta ou remendo
**Base:** `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md` + `docs/canon/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md` + `docs/canon/KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md` + base real `supabase/migrations/001–006` + `docs/legacy/SMART_FLOW_4_0_*` (referência de design, nunca sequência física)

---

## 0. Regra de autoridade

```text
Master Briefing decide visão e limites.
Benchmark informa decisão.
Comparative Proposal seleciona.
Truth Map classifica maturidade real.
Migration Map organiza impacto técnico.
Blueprint organiza arquitetura.
SQL só materializa depois.
```

Este documento não cria domínio, gate, migration, tabela, endpoint, automação, tela ou regra executável.

---

## 1. Fundação real (regra A01)

```text
Base física única: supabase/migrations/001–006, aplicadas no projeto real qosioymzswhkqkziocas, em produção.
  001_init · 002_checkout_close_rpc · 003_lock_rpc_permissions
  004_service_role_table_grants · 005_agenda_status_reagendado · 006_produto_estoque_ajuste_rpc

Sequência 001–045 do Blueprint 4.0: REFERÊNCIA DE DESIGN (docs/legacy/), nunca base física.
Os números 001–006 estão ocupados pela base real com conteúdo diferente do documental 4.0.

Faixa 046–060: OBSOLETA / BLOQUEADA.
SQL futuro: nasce como 007+ e permanece BLOQUEADO até Blueprint/Planning/Draft corrigidos + novo Red Team.
```

---

## 2. Método de classificação — duas verdades separadas (regra A02)

Cada item recebe **dois status independentes**:

| Eixo | Pergunta | Valores |
|---|---|---|
| **Status documental** | A decisão canônica está escrita, coerente e aprovada como tese? | REAL / PARCIAL / BLOQUEADO |
| **Status implementado** | Existe na base real (migrations 001–006 + backend Node em produção)? | REAL / PARCIAL / AUSENTE |

Marcadores complementares: **CRÍTICO** (se falhar, quebra dinheiro/confiança/agenda/privacidade → gate obrigatório), **MOCKADO** (proibido em fluxo crítico), **HARDCODED** (só fixture/seed), **BLOQUEADO** (não avança nesta fase).

```text
Regra anti-inflação: nada é "REAL implementado" sem evidência na base 001–006 ou no backend em produção.
Tese bem escrita = REAL documental + AUSENTE implementado. Nunca apenas "REAL".
```

---

## 3. Veredito executivo

KortexOS™ 5.1 avança como **Capacity + Trust + Money + Recurrence Operating System**, reancorado sobre o V1 real (HOPE OS 001–006).

| Bloco | Status documental | Status implementado | Decisão |
|---|---|---|---|
| Backend como verdade única | REAL / CRÍTICO | **REAL** (service_role backend-only, RPCs, frontend sem cálculo) | Herdar |
| Frontend sem cálculo crítico | REAL / CRÍTICO | **REAL** (`frontendCalculates: false` vigente) | Herdar |
| Ledger financeiro | REAL / CRÍTICO | **PARCIAL** — ledger DISTRIBUÍDO real (comandos, comando_itens, comando_pagamentos, comando_gorjetas, caixa_movimentos, produto_estoque_movimentos); double-entry append-only formal AUSENTE | Reforçar; double-entry é evolução 007+ |
| KortexFlow completo | PARCIAL / CRÍTICO | **AUSENTE** (sem wallet, staff account, payout, PSP) | Reforçar no Blueprint |
| Kortex.ai | PARCIAL / CRÍTICO | **AUSENTE** | Bloqueado no now-scope |
| KortexLink | PARCIAL | **AUSENTE** (só deep link wa.me manual planejado no V1.4 F4) | Reposicionar |
| KortexApp | PARCIAL | **PARCIAL** (PWA única dono/operação; sem personas) | Separar por persona |
| Capacity Inventory | ADICIONAR / CRÍTICO | **AUSENTE** (insights de ocupação read-only V1.4 F1 são precursor) | Entrar no Blueprint |
| RevPAH | ADICIONAR / CRÍTICO | **AUSENTE** (occupancy/margin engines F1 são precursor) | Entrar em analytics |
| Subscription Engine | REAL como tese | **AUSENTE** | Reforçar; dinheiro bloqueado sem ledger/wallet |
| Corporate Benefits | REAL como tese | **AUSENTE** | Reforçar; adiado |
| Partner Network | REAL como tese | **AUSENTE** | Reforçar; adiado |
| Marketplace aberto | BLOQUEADO | AUSENTE | Futuro, após core estável |
| IA soberana | BLOQUEADO | AUSENTE | Nunca em ação crítica |
| SQL novo | BLOQUEADO | — | Só 007+ após novo Red Team |

---

## 4. Truth Map por domínio D00–D31

D00–D31 permanecem grade arquitetural canônica (design). A coluna de implementação mede exclusivamente a base real 001–006 + backend em produção.

| Domínio | Nome 5.1 | Status documental | Status implementado | Decisão |
|---:|---|---|---|---|
| D00 | Platform Owner Layer | REAL / CRÍTICO | **AUSENTE** (sem schema platform, sem multi-tenant) | Design herdado do 4.0 (legacy) |
| D01 | Identity & Tenant | REAL / CRÍTICO | **AUSENTE** (V1 é single-tenant; RLS real limita-se a lock de RPC/grants — migrations 003/004) | Multi-tenant é decisão futura explícita |
| D02 | Business Setup & Policies | REAL / CRÍTICO | **PARCIAL** (horários de profissionais, formas de pagamento com taxas/dias_recebimento; sem policies de no-show/depósito/yield) | Reforçar |
| D03 | Onboarding SaaS | REAL | **AUSENTE** | Herdar como design |
| D04 | Billing & SaaS Finance | REAL / CRÍTICO | **AUSENTE** | Separar do ledger operacional |
| D05 | People Hub | REAL | **PARCIAL** (clientes 1481+, profissionais, vínculos serviço×profissional reais; sem consentimentos/preferências) | Reforçar privacidade |
| D06 | Catalog & Offer Hub | PARCIAL / CRÍTICO | **PARCIAL** (serviços, produtos, overrides reais; sem catálogo vendável canônico/pacotes) | Adicionar catálogo vendável (007+) |
| D07 | Capacity Scheduling Engine | REAL / CRÍTICO | **PARCIAL** (agendamentos reais + occupancy engine F1 read-only; sem candidate/slot score/locks) | Promover para Capacity Inventory |
| D08 | Agenda Core | REAL / CRÍTICO | **PARCIAL** (agendamentos com status incl. reagendado — migration 005; clientes.faltas; sem holds/históricos formais) | Herdar e reforçar |
| D09 | Recurring Appointment | REAL | **AUSENTE** | Conectar a assinatura futuramente |
| D10 | Group Booking | REAL | **AUSENTE** | Futuro |
| D11 | Resource Orchestration | REAL / CRÍTICO | **AUSENTE** (sem tabela de recursos/locks) | Design herdado |
| D12 | Checkout Core | REAL / CRÍTICO | **REAL** (checkout preview/close backend-only via RPC, validado em produção, ledger distribuído conferido) | Reforçar polymorphic seguro (007+) |
| D13 | Payment Core | REAL / CRÍTICO | **PARCIAL** (formas de pagamento com taxa/dias; RPC grava N pagamentos; sem PSP, sem COF, sem tokenização) | COF/PSP são futuro explícito |
| D14 | Cash Register | REAL | **PARCIAL** (caixa_movimentos real; sem sangria/fechamento formal) | Manter ligado ao ledger |
| D15 | KortexFlow Ledger | REAL / CRÍTICO | **PARCIAL** (ledger distribuído real e auditado; double-entry/append-only formal AUSENTE) | Ledger core é pré-requisito da faixa 007+ (A03) |
| D16 | Wallet & Current Accounts | PARCIAL / CRÍTICO | **AUSENTE** | Wallet sem tabela = saldo paralelo → BLOQUEADO |
| D17 | Compensation Engine | REAL / CRÍTICO | **PARCIAL** (CommissionEngine real, comissão/gorjeta por item no checkout; sem payout batch/conta corrente) | Reforçar |
| D18 | Subscription/Corporate/Partner Engine | PARCIAL / CRÍTICO | **AUSENTE** | Reescrever como motor central (design) |
| D19 | Client Experience Hub | REAL | **AUSENTE** (PWA atual é do operador, não do cliente) | Futuro |
| D20 | Public Web / kortex.io | PARCIAL | **AUSENTE** | Renomear semântica |
| D21 | KortexLink Messaging | PARCIAL / CRÍTICO | **AUSENTE** (wa.me manual one-tap planejado V1.4 F4 — não é automação) | Reposicionar |
| D22 | Kortex.ai Receptionist | PARCIAL / CRÍTICO | **AUSENTE** | IA bloqueada no now-scope |
| D23 | Revenue CoPilot | PARCIAL | **AUSENTE** (insights F1 são precursor read-only) | Conectar a yield/RevPAH |
| D24 | Trust & Retention | PARCIAL / CRÍTICO | **PARCIAL** (clientes.faltas existe; RFM/churn/Reliability Score v0 shadow = V1.4 F2 em curso) | Formalizar Trust Layer |
| D25 | Analytics & Decision Intelligence | PARCIAL / CRÍTICO | **PARCIAL** (F1 real: occupancy/cashflow/margin engines + rotas /insights, 63/63 testes) | Núcleo do now-scope; RevPAH no 007+ |
| D26 | Fiscal & LGPD Brasil | REAL / CRÍTICO | **AUSENTE** (sem NFS-e, sem consentimentos formais) | Reforçar antes de corporativo |
| D27 | Partner Network / Marketplace | PARCIAL / BLOQUEADO marketplace | **AUSENTE** | Parcerias controladas futuras; marketplace não |
| D28 | Multiunit Enterprise | PARCIAL / BLOQUEADO | **AUSENTE** | Futuro |
| D29 | White-Label App | PARCIAL / BLOQUEADO | **AUSENTE** | Futuro |
| D30 | Integration Platform | PARCIAL / CRÍTICO | **AUSENTE** (sem outbox/webhooks) | Design herdado |
| D31 | Gate, QA & Governance | REAL / CRÍTICO | **PARCIAL** (test:gate 63/63 backend real; Gates 00–25 formais AUSENTES) | Herdar grade de gates como design |

---

## 5. Truth Map financeiro

| Item | Status documental | Status implementado | Decisão |
|---|---|---|---|
| Dinheiro em `_cents bigint` | REAL / CRÍTICO | **PARCIAL** (base real usa numeric em reais; convenção _cents é padrão da faixa 007+) | Obrigatório em toda tabela nova |
| Ledger double-entry | REAL / CRÍTICO | **AUSENTE** | Pré-requisito 007+ antes de wallet/staff (A03) |
| Ledger append-only | REAL / CRÍTICO | **PARCIAL** (movimentos são insert-only por prática; sem REVOKE/trigger formal) | Formalizar no 007+ |
| Idempotency key financeira | REAL / CRÍTICO | **AUSENTE** | Obrigatória em toda mutação financeira nova (A05) |
| Staff current account | PARCIAL / CRÍTICO | **AUSENTE** | Só após ledger core |
| Client wallet (positivo/negativo) | PARCIAL / CRÍTICO | **AUSENTE** | Só após ledger core; negativo só com Negative Guard |
| Gorjeta isolada | REAL / CRÍTICO | **REAL** (comando_gorjetas separada, fora da receita) | Herdar |
| Comissão protegida backend-only | REAL / CRÍTICO | **REAL** (CommissionEngine, range 0–100 validado) | Herdar |
| Obrigação de receita antecipada | REAL / CRÍTICO | **AUSENTE** | Sem ela, assinatura = saldo paralelo → BLOQUEADO (A06) |
| Fiado sem Trust Pass/policy | BLOQUEADO | — | Não autorizar |
| Benefício sem origem | BLOQUEADO | — | Não autorizar |
| Dashboard sem fonte no ledger | BLOQUEADO | — | Não é verdade (insights F1 são derivados do ledger real — permitido) |

---

## 6. Polymorphic no KortexOS™

### 6.1 Decisão

Polymorphic é permitido apenas como modelagem governada, via catálogo canônico com snapshot auditável.

### 6.2 Classificação

| Modelo | Status documental | Status implementado | Decisão |
|---|---|---|---|
| `item_type + item_id` solto | BLOQUEADO em financeiro | comando_itens usa tipo item (servico/produto) com FKs dedicadas — aceitável no escopo atual | Não expandir |
| Catálogo vendável canônico com FK real | REAL / CRÍTICO | **AUSENTE** | Candidata 007+; a forma `source_table+source_id` solta dentro do catálogo também é proibida (A04) |
| Snapshot de preço no checkout | CRÍTICO | **REAL** (preço/comissão gravados por item no fechamento) | Herdar |
| Frontend escolhendo preço/tipo final | BLOQUEADO | não ocorre | Manter |

---

## 7. Truth Map de IA

| Ação | Status documental | Status implementado | Regra |
|---|---|---|---|
| Entender intenção / classificar | REAL | AUSENTE | Permitido quando existir |
| Sugerir horário do backend | REAL | AUSENTE | Permitido quando existir |
| Criar Action Request | REAL | AUSENTE | Permitido quando existir |
| Confirmar/descontar/fiado/perdoar sozinha | BLOQUEADO | — | Nunca |
| Alterar comissão / criar ledger / reescrever saldo | BLOQUEADO | — | Nunca |

IA integralmente **fora do now-scope** (Comparative Proposal M07).

---

## 8. Truth Map de ocupação e recorrência

| Item | Status documental | Status implementado | Decisão |
|---|---|---|---|
| Medição de ocupação (SUR/buracos) | CRÍTICO | **PARCIAL** (occupancy engine F1) | Núcleo do now-scope |
| Assinatura off-peak | CRÍTICO | AUSENTE | Só analytics de candidatos no now-scope |
| Plano corporativo | CRÍTICO | AUSENTE | Adiado (contrato+billing+LGPD) |
| Plano parceiro | CRÍTICO | AUSENTE | Adiado (exige origem rastreável) |
| Waitlist | PARCIAL | **PARCIAL** (tabela lista_espera existe, ociosa — ativação V1.4 F4) | Ativar sem migration |
| Reliability Score v0 shadow | PARCIAL | **PARCIAL** (V1.4 F2 — read-only, não pune) | Medir antes de cobrar |
| Dynamic discount / convenience premium | PARCIAL / GOVERNADO | AUSENTE | Só com política + gate |
| Cupom aberto | BLOQUEADO | — | Nunca |

---

## 9. Truth Map de privacidade

| Caso | Status documental | Status implementado | Regra |
|---|---|---|---|
| Staff vê próprio financeiro | REAL / CRÍTICO | PARCIAL (sem app por persona ainda) | Permitido |
| Staff vê financeiro alheio | BLOQUEADO | — | Proibido |
| Empresa vê agregado com contrato | REAL / CRÍTICO | AUSENTE | Permitido quando existir; k-anonimato mínimo (A14) |
| Empresa/parceiro vê histórico individual | BLOQUEADO | — | Proibido |
| IA acessa dados sensíveis sem escopo | BLOQUEADO | — | Proibido |

---

## 10. Gates impactados

Gates 00–25 permanecem grade canônica de design (implementação formal AUSENTE; o `test:gate` 63/63 real é precursor). Cenários 5.1 por gate: ver Blueprint §7. Nenhum gate novo.

---

## 11. Bloqueios finais

```text
BLOQUEADO: SQL executável (qualquer faixa).
BLOQUEADO: faixa 046–060 (obsoleta — substituída por 007+ planejado).
BLOQUEADO: migration nova antes de Planning/Draft corrigidos + novo Red Team.
BLOQUEADO: domínio novo fora D00–D31.
BLOQUEADO: gate novo sem decisão formal.
BLOQUEADO: tratar 001–045 do 4.0 como sequência física.
BLOQUEADO: IA soberana.
BLOQUEADO: frontend calculando regra crítica.
BLOQUEADO: benefício sem origem; receita antecipada sem obrigação.
BLOQUEADO: cupom aberto; marketplace aberto antes do core.
BLOQUEADO: ledger alterável; saldo paralelo; wallet sem ledger core.
BLOQUEADO: polymorphic financeiro solto (inclusive source_table+source_id no catálogo).
PERMITIDO: V1.4 now-scope (zero migration) — derivação read-only do ledger real.
```

---

## 12. DoD para avançar ao Migration Map (revisado)

| Critério | Status exigido |
|---|---|
| Base real 001–006 como única fundação física | Obrigatório |
| Dois eixos de status (documental × implementado) em todo item | Obrigatório |
| Nenhum REAL implementado sem evidência | Obrigatório |
| 046–060 declarado obsoleto | Obrigatório |
| D00–D31 e Gates 00–25 preservados como design | Obrigatório |
| Polymorphic governado (incl. A04) | Obrigatório |
| SQL bloqueado | Obrigatório |

---

## 13. Veredito

```text
Status: GERADO / AGUARDA RED TEAM.
Este Truth Map não se autoaprova (regra A07).
Próximo artefato a corrigir: docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md (Correction Plan §4.2).
SQL: bloqueado. Faixa futura: 007+ somente após novo Red Team do conjunto corrigido.
```
