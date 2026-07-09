# KORTEXOS™ 5.1 — BLUEPRINT UNIFICADO CANÔNICO

**Arquivo:** `docs/architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md`  
**Produto:** KortexOS™ 5.1  
**Tipo:** Blueprint técnico canônico de promoção  
**Status:** GERADO / AGUARDA RED TEAM — organiza arquitetura; não autoriza SQL executável  
**Data:** 2026-07-08 (editado cirurgicamente pós-Red Team conforme `docs/redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md` §4.3 — corrige A01, A07, A09)  
**Autoridade:** `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`  
**Base:** Blueprint 4.0 + Benchmark Map + Comparative Proposal + Truth Map + Migration Map  
**Regra de ouro:** sem patch, delta ou remendo

---

## 0. Controle canônico

### 0.1 Hierarquia

```text
Master Briefing decide.
Benchmark informa.
Comparative Proposal seleciona.
Truth Map classifica.
Migration Map mede impacto.
Blueprint organiza.
SQL materializa depois.
```

### 0.2 Limite

Este Blueprint não contém SQL executável. Não cria migration. Não libera implementação. Não altera a base real `supabase/migrations/001–006`. A sequência 001–045 do Blueprint 4.0 (`docs/legacy/`) é referência de design, nunca sequência física.

---

## 1. Tese técnica KortexOS™ 5.1

KortexOS™ é um sistema operacional de:

```text
Capacity + Trust + Money + Recurrence + Execution
```

Agenda é superfície. Capacidade é inventário. Ledger é verdade financeira. IA é camada consultiva. Backend é soberano.

---

## 2. Fontes aprovadas

| Fonte | Papel | Precedência |
|---|---|---:|
| Master Briefing KortexOS™ 5.1 | Visão, tese, limites e invariantes | 1 |
| Global Benchmark Map | Padrões globais e oportunidades | 2 |
| Comparative Proposal | Decisão de herdar/reforçar/adicionar/bloquear | 3 |
| Truth Map | Maturidade e bloqueios | 4 |
| Migration Map | Impacto técnico e nomenclatura | 5 |
| Blueprint 4.0 (`docs/legacy/`) | Referência de design: D00–D31 / Gates 00–25; sequência 001–045 NÃO é física (base real = 001–006) | 6 |

---

## 3. Decisões cross-bloco KortexOS™ 5.1

| ID | Decisão | Blocos afetados | Status |
|---|---|---|---|
| KTX-CB-01 | Backend é única fonte da verdade | Todos | CRÍTICO |
| KTX-CB-02 | Frontend não calcula regra crítica | Todos | CRÍTICO |
| KTX-CB-03 | Ledger é append-only, double-entry e reconstruível | D12–D18/D25 | CRÍTICO |
| KTX-CB-04 | Campos monetários usam `_cents bigint` | Financeiro | CRÍTICO |
| KTX-CB-05 | IA entende, propõe e gera Action Request; não executa soberanamente | D21–D23 | CRÍTICO |
| KTX-CB-06 | Capacity Inventory é a abstração central da agenda | D07/D08/D11/D25 | CRÍTICO |
| KTX-CB-07 | RevPAH mede eficiência econômica da capacidade | D25 | CRÍTICO |
| KTX-CB-08 | Benefício sem origem é bloqueado | D18/D21/D27 | CRÍTICO |
| KTX-CB-09 | Polymorphic financeiro só via catálogo canônico | D06/D12/D18 | CRÍTICO |
| KTX-CB-10 | Marketplace aberto fica bloqueado até core estável | D27 | BLOQUEADO |
| KTX-CB-11 | Parceria é canal rastreável, não cupom aberto | D18/D21/D27 | CRÍTICO |
| KTX-CB-12 | Empresa vê dados agregados; não histórico sensível individual | D18/D26 | CRÍTICO |
| KTX-CB-13 | Staff current account protege comissão e gorjeta | D16/D17 | CRÍTICO |
| KTX-CB-14 | Negative Guard governa fiado, margem e exceções | D12/D16/D18/D24 | CRÍTICO |

---

## 4. Índice canônico D00–D31

| Domínio | Nome KortexOS™ 5.1 | Bloco | Decisão |
|---:|---|---|---|
| D00 | Platform Owner Layer | A | Herdar |
| D01 | Identity & Tenant | A | Herdar |
| D02 | Business Setup, Policies & Friction | A | Reforçar |
| D03 | Onboarding SaaS | A | Reforçar |
| D04 | Billing & SaaS Finance | A | Herdar |
| D05 | People Hub | B | Reforçar |
| D06 | Catalog & Sellable Offer Hub | B | Reforçar |
| D07 | Capacity Scheduling Engine | C | Reforçar |
| D08 | Agenda Core | C | Herdar |
| D09 | Recurring Appointment | C | Reforçar |
| D10 | Group Booking | C | Reforçar |
| D11 | Resource Orchestration | B/C | Reforçar |
| D12 | Checkout Core | D | Reforçar crítico |
| D13 | Payment Core | D | Herdar |
| D14 | Cash Register | D | Herdar |
| D15 | KortexFlow Ledger | D | Reforçar |
| D16 | Wallet & Current Accounts | D | Reforçar crítico |
| D17 | Compensation & Payout Engine | D | Reforçar |
| D18 | Subscription, Packages, Corporate Benefits & Partner Occupancy Engine | E | Reescrever técnico |
| D19 | Client Experience Hub | E | Reforçar |
| D20 | Public Web / kortex.io Surface | E | Renomear semântica |
| D21 | KortexLink Messaging & Activation | F | Reforçar |
| D22 | Kortex.ai Receptionist | F | Reforçar crítico |
| D23 | Revenue CoPilot Engine | G | Reforçar |
| D24 | Trust & Retention Engine | G | Adicionar/Reforçar |
| D25 | Analytics & Decision Intelligence | H | Reforçar |
| D26 | Fiscal & LGPD Brasil | H | Reforçar |
| D27 | Partner Network & Marketplace Safety | I | Reforçar; marketplace bloqueado |
| D28 | Multiunit Enterprise | I | Bloquear até core estável |
| D29 | White-Label App | I | Bloquear até core estável |
| D30 | Integration Platform | I | Reforçar |
| D31 | Gate, QA & Governance | I | Herdar/Reforçar |

---

## 5. Engines KortexOS™ 5.1

## 5.1 Capacity Inventory

**Domínios:** D07/D08/D11/D25  
**Status:** CRÍTICO

### Responsabilidade

Transformar agenda em inventário econômico de capacidade.

### Contrato mínimo

| Elemento | Regra |
|---|---|
| Profissional | Obrigatório quando serviço exige staff |
| Recurso | Obrigatório quando serviço exige cadeira/sala/equipamento |
| Janela | Horário disponível, hold, reservado ou bloqueado |
| Serviço elegível | Validado por catálogo e profissional |
| Margem esperada | Calculada no backend |
| Canal preferido | Direto, assinatura, corporativo, parceiro, waitlist |
| Score | Snapshot auditável |

### Bloqueio

Frontend não calcula disponibilidade oficial.

---

## 5.2 Yield & Occupancy Engine

**Domínios:** D07/D12/D18/D23/D24/D25  
**Status:** CRÍTICO em fases

### Função

Escolher o melhor mecanismo para ocupar capacidade sem destruir margem.

| Situação | Mecanismo |
|---|---|
| Horário fraco recorrente | Assinatura off-peak |
| Cancelamento | Waitlist |
| Terça–quinta fraco | Parceiro/local/corporativo |
| Horário nobre | Premium protection |
| Cliente risco alto | Depósito/pré-pagamento |
| Cliente confiável | Menor fricção |
| Fora de horário | Convenience premium |

### Bloqueio

Preço dinâmico opaco ou sem margem mínima é bloqueado.

---

## 5.3 KortexFlow

**Domínios:** D12–D18/D25  
**Status:** CRÍTICO

### Fluxos obrigatórios

| Fluxo | Regra |
|---|---|
| Venda normal | checkout → payment → ledger → comissão |
| Venda com gorjeta | tip isolation → staff account |
| Assinatura | receita antecipada → obrigação → consumo |
| Corporativo | contrato → elegibilidade → consumo → faturamento |
| Parceiro | origem → benefício → checkout → analytics |
| Fiado autorizado | Negative Guard → client wallet negativo → staff protegido |
| Estorno | reversão ledger, nunca UPDATE |
| Payout | staff current account → payout batch |

---

## 5.4 Trust Layer

**Domínios:** D02/D13/D16/D18/D24/D26  
**Status:** CRÍTICO

### Componentes

| Componente | Função |
|---|---|
| Client Reliability Score | Mede confiança operacional |
| Trust Pass | Reduz fricção para confiável |
| Healing | Restaura score após bom comportamento |
| Negative Guard | Controla fiado, margem e risco |
| Card-on-file consentido | Protege reservas sensíveis |
| Corporate eligibility | Valida funcionário |
| Partner eligibility | Valida origem de benefício |
| Staff privacy | Protege dados financeiros do profissional |

---

## 5.5 Subscription Engine

**Domínio principal:** D18  
**Status:** CRÍTICO

### Regra

Assinatura compra previsibilidade, comportamento e ocupação; não apenas desconto.

| Plano | Função |
|---|---|
| Off-peak | Ocupa terça–quinta |
| Premium | Retém cliente de alto valor |
| Família/grupo | Aumenta frequência |
| Créditos mensais | Flexibilidade controlada |
| Voucher por ciclo | Consumo previsível |
| Recorrente por profissional | Ocupação previsível por staff |

---

## 5.6 Corporate Benefits Engine

**Domínios:** D18/D19/D21/D25/D26  
**Status:** CRÍTICO

### Regra

Empresa contrata/subsidia. Funcionário usa. Salão mede ocupação e margem. Empresa vê apenas dados agregados.

| Item | Regra |
|---|---|
| Contrato empresa | Obrigatório |
| Funcionário elegível | Obrigatório |
| Benefício com origem | Obrigatório |
| Consumo por checkout | Obrigatório |
| Faturamento/ledger | Obrigatório |
| Histórico individual para empresa | Bloqueado |

---

## 5.7 Partner Network Engine

**Domínios:** D18/D21/D25/D27/D30  
**Status:** CRÍTICO

### Regra

Parceria é canal rastreável de aquisição e ocupação. Não é cupom aberto.

| Item | Regra |
|---|---|
| Parceiro com contrato | Obrigatório |
| Link/QR rastreável | Obrigatório |
| Janela de uso | Obrigatória |
| Limite e validade | Obrigatórios |
| Margem mínima | Obrigatória |
| Analytics por parceiro | Obrigatório |
| Marketplace aberto | Bloqueado |

---

## 5.8 Kortex.ai

**Domínios:** D21/D22/D23/D31  
**Status:** CRÍTICO

| Ação | Permitido? | Regra |
|---|---:|---|
| Entender intenção | Sim | Sem mutação crítica |
| Explicar política | Sim | Fonte backend |
| Sugerir horário | Sim | Somente candidatos backend |
| Criar Action Request | Sim | Para exceção sensível |
| Confirmar agenda sozinha | Não | Bloqueado |
| Aplicar desconto sozinha | Não | Bloqueado |
| Liberar fiado sozinha | Não | Bloqueado |
| Criar ledger | Nunca | Bloqueado |

---

## 5.9 KortexLink

**Domínios:** D21/D30/D18/D27  
**Status:** PARCIAL → reforçar

### Função

Circuito de ativação para WhatsApp, links, QR, convites, waitlist, assinatura, corporativo, parceiros e integrações.

### Regra

Mensagem não altera verdade diretamente. Mensagem gera intent, Command autorizado ou Action Request.

---

## 5.10 KortexApp

**Domínios:** D19/D20/D21/D25  
**Status:** PARCIAL → reforçar

| Persona | Função | Limite |
|---|---|---|
| Dono | cockpit, ocupação, margem, caixa | Não edita ledger |
| Gerente | agenda, equipe, execução | Não bypassa policy |
| Profissional | agenda, comissão, repasse | Não vê financeiro alheio |
| Recepção | booking, checkout, confirmação | Não confirma conflito |
| Cliente | agendar, assinar, usar benefício | Não calcula preço final |
| Empresa | uso agregado | Não vê histórico sensível individual |
| Parceiro | performance agregada | Não vê dados sensíveis |

---

## 6. Polymorphic architecture

### 6.1 Regra

KortexOS™ aceita checkout com múltiplos tipos de item, mas não aceita referência polimórfica solta em fluxo financeiro crítico.

### 6.2 Modelo canônico

```text
services / products / packages / memberships / corporate_benefits / partner_benefits
        ↓
sellable_catalog_items
        ↓
checkout_items
        ↓
checkout_snapshot → payment → ledger
```

### 6.3 Invariantes

| Invariante | Status |
|---|---|
| `sellable_catalog_items.kind` por enum | CRÍTICO |
| FK real de checkout para catálogo | CRÍTICO |
| Snapshot financeiro no checkout | CRÍTICO |
| Origem para benefício | CRÍTICO |
| `item_type + item_id` solto | BLOQUEADO |

---

## 7. Gates 00–25 atualizados

Nenhum gate novo é criado.

| Gate | Cenário 5.1 adicional |
|---:|---|
| 00 | Foundation preserva grants, roles, idempotência e ledger base |
| 01 | Tenant isolation para assinatura/corporativo/parceiro |
| 02 | Staff privacy em payout/current account |
| 03 | Capacity Inventory retorna candidatos válidos |
| 04 | Conflict/locks continuam transacionais |
| 05 | Chain booking respeita capacidade e recurso |
| 06 | Recorrência usa candidate/availability |
| 07 | Grupo não bypassa checkout/ledger |
| 08 | Premium/yield/trust aplicam fricção correta |
| 09 | Waitlist e parceiros respeitam consentimento |
| 10 | Checkout polymorphic seguro via catálogo |
| 11 | Ledger balance para venda/assinatura/corporativo/parceiro |
| 12 | Payment allocation e COF sem PAN |
| 13 | Wallet drift inclui créditos/benefícios/obrigações |
| 14 | Comissão, payout e tip isolation corretos |
| 15 | Origem/validade/consumo de benefícios |
| 16 | Action Request para exceções sensíveis |
| 17 | Kortex.ai/KortexLink não escrevem verdade direta |
| 18 | Caixa reconciliado com ledger |
| 19 | RevPAH, margin/hour e analytics reconstruíveis |
| 20 | Integração não bypassa Command |
| 21 | LGPD: empresa/parceiro sem dados sensíveis individuais |
| 22 | Platform Owner isolado |
| 23 | Partner Network seguro; marketplace aberto bloqueado |
| 24 | Multiunit continua bloqueado até core estável |
| 25 | Readiness falha se qualquer crítico falhar |

---

## 8. Sequência técnica reancorada (A01)

### 8.1 Fundação real

```text
Base física única: supabase/migrations/001–006 (produção). Intocável, não renumerável.
Blueprint 4.0 (001–045, docs/legacy/): referência de design — os números 001–006 colidem
com a base real e nada do 4.0 é aplicável por número.
Faixa futura: 007+ (ver docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md §4). Faixa 046–060: obsoleta.
Pré-requisito da faixa: 007_kortex_ledger_core antes de wallet/staff account/assinatura (A03).
Tenancy: single-tenant é o estado real; multi-tenant é decisão formal futura (Migration Map §3).
```

### 8.2 Candidatos futuros (faixa 007+)

| Candidato | Migration planejada | Status |
|---|---|---|
| `kortex_ledger_core` (accounts/transactions/entries/balances) | 007 | PENDENTE — pré-requisito |
| `kortex_sellable_catalog_items` | 008 | PENDENTE |
| `kortex_benefit_obligations` | 009 | PENDENTE |
| `kortex_client_wallet` | 010 | PENDENTE |
| `kortex_staff_current_account` | 011 | PENDENTE |
| `kortex_trust_layer` | 012 | PENDENTE |
| `kortex_negative_guard` | 013 | PENDENTE |
| `kortex_capacity_inventory` | 014 | PENDENTE |
| `rev_pah_snapshots` (nome único canônico — A09) | 015 | PENDENTE |
| Engines de recorrência/ativação/governança | 016–023 | PENDENTE |

Esses candidatos não são SQL autorizado.

---

## 9. Ordem de construção KortexOS™ 5.1

| Ordem | Bloco | Entrega | Gates |
|---:|---|---|---|
| 1 | Foundation herdada | roles, RLS, idempotência, outbox, audit | 00/01/22 |
| 2 | Truth financeira | ledger, wallet, compensation, checkout | 10–15 |
| 3 | Capacity core | capacity inventory, booking candidates, locks | 03–05 |
| 4 | Trust layer | reliability, no-show, deposit, Negative Guard | 08/12/16 |
| 5 | Occupancy engines | subscription, corporate, partner | 09/15/19/21/23 |
| 6 | Activation | KortexLink, waitlist, links, QR, consent | 16/17/20 |
| 7 | AI governed | Kortex.ai, action requests, handoff | 16/17 |
| 8 | Analytics | RevPAH, margin/hour, occupancy, rebuild | 19 |
| 9 | Scale later | marketplace, multiunit, white-label | 23–25 |

---

## 10. RAGOV 5.1

### REAL

- Backend SSOT
- D00–D31
- Gates 00–25
- Ledger append-only double-entry
- Booking Candidate Contract
- Tip Isolation
- Action Requests
- SQL bloqueado até Blueprint/SQL Master

### PARCIAL

- KortexFlow operacional completo
- Capacity Inventory
- Trust Layer
- Subscription Engine
- Corporate Benefits
- Partner Network
- KortexLink
- Kortex.ai
- RevPAH

### MOCKADO

- Qualquer dashboard sem ledger
- Score sem fonte
- Benefício fake
- Disponibilidade fake
- Checkout fake
- Comissão fake

### HARDCODED

Permitido apenas em fixture, seed e gate controlado.

### CRÍTICO

- RLS
- Ledger
- Checkout
- Wallet
- Compensation
- Tip isolation
- Negative Guard
- Benefit origin
- Polymorphic catalog
- Trust layer
- Action Request
- Privacy B2B2C

### BLOQUEADO

- IA soberana
- Marketplace aberto cedo
- SQL novo agora
- Domínio novo
- Gate novo
- Frontend calculando regra crítica
- Polymorphic solto
- Benefício sem origem
- Cupom aberto

---

## 11. DoD do Blueprint 5.1

| Critério | Status |
|---|---|
| D00–D31 preservados | OK |
| Gates 00–25 preservados | OK |
| Migrations 001–045 não renumeradas | OK |
| SQL executável ausente | OK |
| Capacity Inventory incluído | OK |
| RevPAH incluído | OK |
| Trust Layer incluído | OK |
| Subscription/Corporate/Partner Engines incluídos | OK |
| Polymorphic governado | OK |
| IA soberana bloqueada | OK |
| Marketplace aberto bloqueado | OK |

---

## 12. Status

```text
GERADO / AGUARDA RED TEAM (regra A07 — sem autoaprovação).
Não autoriza SQL. Não autoriza implementação.
Próximo artefato a corrigir: docs/planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md (Correction Plan §4.4).
```
