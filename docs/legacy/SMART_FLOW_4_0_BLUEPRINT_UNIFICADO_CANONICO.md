# SMART_FLOW_4_0_BLUEPRINT_UNIFICADO_CANONICO.md
**Produto:** SMART Flow™ / HOPE OS 4.0  
**Entrega:** Blueprint Unificado Canônico — D00–D31  
**Status:** RASCUNHO — AGUARDA RED TEAM  
**Versão:** 1.0  
**Data:** 2026-06-29  
**Autoridade:** SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md [MB4.0 §0]  
**Base de promoção:** Blueprint v3.0 v1.1 + MB 4.0 + Red Team Gap Analysis  
**Método:** reescrita cirúrgica; seções v3.0 preservadas onde compatíveis; 6 GAPs absorvidos nas seções originais

---

## 0. Controle canônico

| Regra | Decisão | Fonte |
|---|---|---|
| Autoridade | Master Brief 4.0 decide visão, domínios, limites, invariantes, gates e ordem de construção; Blueprint organiza arquitetura técnica sem ampliar escopo | [MB4.0 §0] |
| Estado | Blueprint 4.0 cobre D00–D31, preserva v3.0 compatível e absorve os 6 gaps v4.0 | [MB4.0 §6.0][BP3.0 §0] |
| SQL Master | Bloqueado até Red Team deste Blueprint; SQL Master materializa sequência 001–045, não cria arquitetura nova | [MB4.0 §0][BP3.0 §6] |
| Proibição | Nenhum domínio novo, gate novo, saldo paralelo, PAN, cálculo financeiro frontend ou SQL executável entra neste Blueprint | [MB4.0 §5.1][MB4.0 §7][MB4.0 §16/DEC-PO-01] |
| Mutação | Escrita operacional passa por Command/RPC dono; automação sensível passa por Action Request | [MB4.0 §7][MB4.0 §8][MB4.0 §10/Gate16] |
| Fusão | Todo conteúdo v3.0 compatível permanece como `[BP3.0]`; nova entrada usa `[MB4.0]`, `[DEC-PO-01]` ou `[DEC-CB-*]` | [MB4.0 §0][BP3.0 §0] |

## 1. Fontes aprovadas anexadas

| Fonte | Papel | Precedência | Uso nesta entrega |
|---|---:|---:|---|
| `SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md` | Fonte primária | 1 | Decide contratos v4.0, limites, gates e invariantes [MB4.0 §0] |
| `SMART_FLOW_3_0_BLUEPRINT_UNIFICADO_CANONICO_v1_1.md` | Base técnica preservável | 2 | Fornece blocos A–I, DEC-CB-01–12 e migrations 001–039 [BP3.0 §0][BP3.0 §6] |
| `PROMPT_BLUETEAM_BLUEPRINT_4_0.md` | Contrato de produção | 3 | Define 6 gaps, formato, DoD e proibições [MB4.0 §0] |
| `SKILL.md` | Boas práticas Supabase/Postgres | 4 | Reforça RLS, performance, índices e segurança para desenho técnico [MB4.0 §7] |

## 2. Índice canônico de domínios

| Domínio | Nome | Bloco | Responsabilidade canônica | Fonte |
|---|---|---|---|---|
| D00 | Platform Owner | A | Platform ownership, bootstrap e isolamento fundacional | [MB4.0 §6][BP3.0 §2] |
| D01 | Identity & Tenant | A | Identidade, tenants, membership e contexto RLS | [MB4.0 §6][BP3.0 §2] |
| D02 | Business Setup | A | Setup, policies, no-show, deposit policy e COF eligibility | [MB4.0 §6.0][MB4.0 §16/DEC-PO-01][BP3.0 §2] |
| D03 | Onboarding SaaS | A | Onboarding, ativação e trilha SaaS | [MB4.0 §6][BP3.0 §2] |
| D04 | Billing & SaaS Finance | A | Billing SaaS platform sem misturar ledger tenant | [MB4.0 §6][BP3.0 §2] |
| D05 | People Hub | B | Clientes, profissionais, perfis e notas imutáveis | [MB4.0 §5.1][BP3.0 §2] |
| D06 | Catalog & Offer Hub | B | Serviços, produtos, pacotes base e ofertas operacionais | [MB4.0 §6][BP3.0 §2] |
| D07 | Scheduling Engine | C | Cálculo de disponibilidade, Booking Candidate, Smart Gap Law e ranking | [MB4.0 §6.0][MB4.0 §6/D07][BP3.0 §2] |
| D08 | Agenda Core | C | Holds, candidates confirmados, appointments, manual validation e waitlist | [MB4.0 §6.0][MB4.0 §6/D08][BP3.0 §2] |
| D09 | Recorrente | C | Séries recorrentes, pausas, exceções, preview e waitlist recovery hook | [MB4.0 §6.0][MB4.0 §6/D09][BP3.0 §2] |
| D10 | Grupo | C | Agendamento em grupo e integração com Booking Intent | [MB4.0 §6.0][BP3.0 §2] |
| D11 | Resource Orchestration | B | Recursos físicos/digitais, disponibilidade e locks | [MB4.0 §6.0][BP3.0 §2] |
| D12 | Checkout Core | D | Sessão checkout, totais, split e integridade de preço | [MB4.0 §5.1][BP3.0 §2] |
| D13 | Payment Core | D | Pagamentos, COF tokenizado, consentimentos, alocação e status | [MB4.0 §6.0][MB4.0 §6/D13][MB4.0 §16/DEC-PO-01][BP3.0 §2] |
| D14 | Cash Register | D | Caixa, movimentos e fechamento atômicos com ledger | [MB4.0 §6][BP3.0 §2] |
| D15 | Financial Ledger | D | Double-entry append-only, saldo reconstruível | [MB4.0 §7][BP3.0 §2] |
| D16 | Wallet & Current Accounts | D | Carteiras e contas correntes como projeção ledger | [MB4.0 §16/DEC-PO-01][BP3.0 §2] |
| D17 | Compensation Engine | D | Comissão, payout, privacidade de staff e ledger | [MB4.0 §5.1][BP3.0 §2] |
| D18 | Benefits, Packages & Memberships | E | Origem, validade, saldo reconstruível e consumo com lock | [MB4.0 §6][BP3.0 §2] |
| D19 | Client Experience Hub | E | Portal, booking intent, candidates e manual validation boundary | [MB4.0 §6.0][MB4.0 §5.1][BP3.0 §2] |
| D20 | Página Web do Salão | E | Página pública tenant e ofertas ativas sem pagamento direto | [MB4.0 §5.1][BP3.0 §2] |
| D21 | Messaging & Conversations | F | Mensageria, consentimento, status e templates aprovados | [MB4.0 §6.0][MB4.0 §8][BP3.0 §2] |
| D22 | AI Receptionist Engine | F | IA propõe Action Request; não executa verdade soberana | [MB4.0 §8][BP3.0 §2] |
| D23 | CoPilot Revenue Engine | G | Recomendações econômicas sem execução financeira direta | [MB4.0 §8][BP3.0 §2] |
| D24 | Retention & CRM Engine | G | Segmentos, campanhas, consent drift e no-show policy input | [MB4.0 §6.0][MB4.0 §16/DEC-PO-01][BP3.0 §2] |
| D25 | Analytics & Decision Intelligence | H | Read models reconstruíveis e dashboards sem SQL livre | [MB4.0 §7][BP3.0 §2] |
| D26 | Fiscal & LGPD Brasil | H | NFS-e, LGPD, retenção legal e logs sensíveis | [MB4.0 §7][BP3.0 §2] |
| D27 | Marketplace | I | Índice público sanitizado, opt-out transacional e comissão ledger | [MB4.0 §7][BP3.0 §2] |
| D28 | Multiunidade Enterprise | I | Consolidação sem ledger de grupo e lock cross-unit | [MB4.0 §7][BP3.0 §2] |
| D29 | App White-Label | I | Apresentação white-label sem core paralelo | [MB4.0 §7][BP3.0 §2] |
| D30 | Integration Platform | I | API registry fechado, scopes e webhooks por outbox | [MB4.0 §7][BP3.0 §2] |
| D31 | Gate, QA & Governance | I | Promotion, rollback, QA, security findings e execução governada | [MB4.0 §6.0][MB4.0 §10/Gate03][BP3.0 §2] |

## 3. Decisões cross-bloco vinculantes

| ID | Decisão | Blocos afetados | Efeito no SQL Master | Fonte |
|---|---|---|---|---|
| DEC-CB-01 | Banco é fonte única da verdade; frontend/API/IA não calculam ou mutam verdade soberana | A–I | Commands/RPCs donos, projections reconstruíveis e Action Request para automação | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-02 | RLS real por domínio e isolamento platform↔tenant desde a fundação | A/I | `platform`, `tenant_core`, `shared`; policies explícitas, inclusive enterprise/platform findings | [MB4.0 §0][BP3.0 §3] |
| DEC-CB-03 | Ledger double-entry append-only; saldo sempre reconstruível | D/I | Financeiro real passa por D15; marketplace/caixa/comissão usam ledger atômico | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-04 | Campos monetários em `_cents bigint`; taxas/percentuais em `numeric` com CHECK de range | D/H | Sem float para dinheiro; taxas e regras fiscais com range explícito | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-05 | Read models/projeções só existem com fonte, hash e rebuild/auditoria | E/F/G/H/I | Benefit balances, outbound status, analytics, marketplace index e enterprise snapshots | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-06 | Append-only para ledger, eventos, logs, consentimentos, aprovações, status, rebuild runs e auditoria | A–I | UPDATE/DELETE bloqueado por trigger onde houver trilha histórica | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-07 | Mutação financeira exige idempotency key e atomicidade transacional | A/D/E/I | Caixa, checkout, pagamento, ledger, benefícios e marketplace commission fechados em Command | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-08 | IA e CoPilot só propõem; execução passa por whitelist, aprovação e dispatcher fechado | F/G/I | `action_request_allowed_command`, whitelist e execution routes sem SQL/RPC textual livre | [MB4.0 §8][BP3.0 §3] |
| DEC-CB-09 | SQL livre em payloads é proibido; filtros usam contratos tipados/enums | G/H/I | Segmentos, dashboards e API registry usam tipos/enum fechados | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-10 | Opt-out/privacidade pública é transacional, não eventual | I | Marketplace despublicação e `allow_external_discovery=false` invalidam índice na mesma transação | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-11 | Multiunidade não cria ledger de grupo | I | Consolidação enterprise é snapshot/rebuild; ledger fica por tenant/unidade | [MB4.0 §7][BP3.0 §3] |
| DEC-CB-12 | SQL Master permanece bloqueado até este Unificado ser revisado | A–I | Blueprint aprovado é pré-condição; SQL Master materializa, não decide arquitetura | [MB4.0 §0][BP3.0 §3] |
| DEC-CB-13 | Booking Candidate Contract é o caminho canônico de agendamento cliente/PWA | C/E/F/I | D07 gera candidatos; D08 confirma candidato; D19/PWA não cria appointment direto | [MB4.0 §6.0][MB4.0 §6/D07][MB4.0 §6/D08] |
| DEC-CB-14 | Card-on-File usa token PSP/gateway; PAN nunca armazenado; consentimento explícito obrigatório | A/D/G/I | D13 armazena token PSP e consentimento; D02 define policy; D15 registra ledger; D24 usa risco/retenção sem cobrar direto | [MB4.0 §16/DEC-PO-01][DEC-PO-01] |

## 4. Registry canônico de Gates 00–25

| Gate | Nome | Bloco(s) que provam | Critério consolidado | Cenário v4.0 absorvido | Fonte |
|---|---|---|---|---|---|
| Gate 00 | Foundation | A | Roles, schemas, REVOKE, bootstrap e idempotência fundacional | Sem domínio novo fora D00–D31 | [MB4.0 §0][BP3.0 §4] |
| Gate 01 | Tenant Isolation | A/I | RLS tenant real; platform/tenant isolados; RLS enterprise explícito | Booking Candidate, COF e waitlist tenant-scoped | [MB4.0 §7][BP3.0 §4] |
| Gate 02 | Staff Privacy | B/H | Dados de staff filtrados por ator/permissão; cockpit agrega/anonimiza | Multi-staff booking não expõe financeiro de staff | [MB4.0 §5.1][BP3.0 §4] |
| Gate 03 | Smart Availability | C/E | Disponibilidade por D07/D08; D19/D20 não calculam slots | Combo 40min + 30min com slots 30/15 retorna `largest_slot_min=30`; `recommended` nunca cria buraco de 15min entre appointments | [MB4.0 §10/Gate03][MB4.0 §6/D07] |
| Gate 04 | Appointment Conflict | C/I | EXCLUDE gist/tstzrange para agenda e lock cross-unit | `command_confirm_booking_candidate` revalida todos os locks na mesma transação | [MB4.0 §10/Gate04][MB4.0 §6/D08] |
| Gate 05 | Chain Booking | C | Sequência/chain sem conflito e sem engine paralela | Booking Intent multi-serviço usa service_sequence auditável | [MB4.0 §6.0][BP3.0 §4] |
| Gate 06 | Recurring Appointment | C | Séries, pausas, exceções e preview auditáveis | Ocorrências recorrentes usam Candidate/Availability ao materializar | [MB4.0 §6/D09][BP3.0 §4] |
| Gate 07 | Group Booking | C/D | Grupo, capacidade, split por membro e checkout auditável | Grupo não bypassa candidate/locks quando usa booking online | [MB4.0 §6.0][BP3.0 §4] |
| Gate 08 | Premium Window Protection | C/D | Janelas premium protegidas por backend | Deposit/Card-on-File policy aplicada antes de confirmar slot elegível | [MB4.0 §10/Gate08][MB4.0 §16/DEC-PO-01] |
| Gate 09 | Waitlist Economic Matching | C/F/G | Waitlist com posição/evento e matching controlado | Incentivo econômico exige Action Request aprovado; automação só com consentimento específico | [MB4.0 §10/Gate09][MB4.0 §6.0] |
| Gate 10 | Checkout Integrity | D | Total backend-only, CHECKs sem floor silencioso | COF não calcula valor no frontend | [MB4.0 §5.1][BP3.0 §4] |
| Gate 11 | Ledger Balance | D | Double-entry append-only; trigger prova débito=crédito antes de posted | COF, depósito e reembolso geram ledger/reversão | [MB4.0 §7][MB4.0 §16/DEC-PO-01] |
| Gate 12 | Payment Allocation | D | Pagamento alocado sem saldo paralelo | COF charge cria payment_intent e allocation sem PAN | [MB4.0 §10/Gate12][MB4.0 §16/DEC-PO-01] |
| Gate 13 | Wallet Drift | D | Wallet/current accounts reconstruíveis por ledger | Reembolso COF usa reversão ledger, não ajuste manual | [MB4.0 §16/DEC-PO-01][BP3.0 §4] |
| Gate 14 | Commission Privacy & Accuracy | D/H | Comissão por regra determinística, ledger e privacidade de staff | Multi-staff booking não calcula comissão no candidato | [MB4.0 §5.1][BP3.0 §4] |
| Gate 15 | Benefit Origin & Consumption | E | Origem formal, lock de grant, consumo append-only e saldo reconstruível | Incentivos waitlist não viram benefício sem Action Request/Command | [MB4.0 §10/Gate16][BP3.0 §4] |
| Gate 16 | Action Request Safety | F/I | Action Request whitelist + approvals + dispatcher fechado | COF sensível, incentivo econômico waitlist e overrides usam aprovação quando aplicável | [MB4.0 §10/Gate16][MB4.0 §8] |
| Gate 17 | WhatsApp & AI Safety | F/G | Mensageria consentida; IA não executa RPC livre | WhatsApp gera Intent/Action Request; não confirma appointment | [MB4.0 §5.1][BP3.0 §4] |
| Gate 18 | Cash Register Integrity | D | Movimento de caixa atômico com ledger; rollback se ledger falhar | Depósito manual e COF não entram no caixa sem referência ledger | [MB4.0 §7][BP3.0 §4] |
| Gate 19 | Analytics Rebuild | H | Snapshots com source_hash/rebuild_job, sem SQL livre | Booking Candidate e COF expõem snapshots reconstruíveis | [MB4.0 §7][BP3.0 §4] |
| Gate 20 | Integration Safety | I | Route registry fechado, scopes e idempotência | Integração de PSP/webhook não recebe PAN bruto | [MB4.0 §16/DEC-PO-01][BP3.0 §4] |
| Gate 21 | Fiscal & LGPD Compliance | H/I | Export LGPD com ator e escopo tipado; fiscal não muta saldo | Consentimento COF e waitlist automation são auditáveis | [MB4.0 §16/DEC-PO-01][BP3.0 §4] |
| Gate 22 | Platform Owner Isolation | A/I | Platform findings e enterprise RLS separados de tenant | COF, Candidate e Intent permanecem tenant-core | [MB4.0 §7][BP3.0 §4] |
| Gate 23 | Marketplace Safety | I | Índice público sanitizado, opt-out imediato, sem bypass core | Marketplace não confirma booking sem Candidate | [MB4.0 §6.0][BP3.0 §4] |
| Gate 24 | Multi-Unit Integrity | I | Unidades isoladas; consolidação é snapshot/rebuild | Candidate/Intent sempre carregam business_unit_id | [MB4.0 §6.0][BP3.0 §4] |
| Gate 25 | Production Readiness | I | QA, security findings, promotion, rollback e readiness | Release bloqueado sem provar os 6 gaps v4.0 | [MB4.0 §10][BP3.0 §4] |

## 5. Checklist DoD do Blueprint 4.0

| Item | Verificação | Status |
|---|---|---|
| Cabeçalho v4.0 | Versão, data, autoridade MB 4.0 e base de promoção declaradas | OK |
| D00–D31 cobertos | Índice contém 32 entradas, sem domínio novo | OK |
| GAP 1 absorvido | `booking_candidates`, `command_generate_booking_candidates`, `command_confirm_booking_candidate` em D07/D08 | OK |
| GAP 2 absorvido | `booking_intents`, `booking_intent_items`, `command_create_booking_intent` em D07/D08/D10 | OK |
| GAP 3 absorvido | `largest_slot_min` em `booking_candidates` e `slot_score_audit_logs`; Smart Gap Law em D07; cenário Gate 03 | OK |
| GAP 4 absorvido | `payment_method_tokens`, `card_consent_records`, Commands COF, COF-01–06 em D13; `deposit_policy_kind` em D02 | OK |
| GAP 5 absorvido | Incentivo, Action Request e consentimento de automação em waitlist D08/D09/D21 | OK |
| GAP 6 absorvido | `manual_pending_validation`, `command_validate_manual_booking` e boundary D08/D19 | OK |
| Migrations 040–045 | Tabela mestre estendida sem renumerar 001–039 | OK |
| DEC-CB-13/14 | Registradas na tabela de decisões cross-bloco | OK |
| Sem nova gate | Cenários v4.0 entram em Gates 03/04/08/09/12/16 existentes | OK |
| Sem PAN | `payment_method_tokens.provider_token` tem guard contra sequência 13–19 dígitos | OK |
| Sem float monetário | Campos monetários usam `_cents bigint`; percentuais usam `numeric` | OK |
| REVOKE explícito | Todo Command novo especifica REVOKE PUBLIC, anon, authenticated e GRANT técnico | OK |
| Rastreabilidade | Toda nova tabela, enum, Command, invariante e evento referencia `[MB4.0]`, `[DEC-PO-01]` ou `[DEC-CB-*]` | OK |

## 6. Sequência Mestre de Migrations — SQL Master

### 6.1 Regra canônica de numeração

| Regra | Decisão | Fonte |
|---|---|---|
| Sequência física | A sequência abaixo é a única ordem autorizada para o SQL Master 4.0 | [MB4.0 §0][BP3.0 §6] |
| Contiguidade | A sequência consolidada vai de `001` a `045` | [BP3.0 §6][MB4.0 §6.0] |
| Número ≠ domínio | Número de migration reflete ordem física de dependência, não número de domínio | [BP3.0 §6.1] |
| Preservação | Migrations `001`–`039` preservadas com dependências inalteradas | [BP3.0 §6][MB4.0 §0] |
| Extensão | Migrations `040`–`045` absorvem os 6 gaps v4.0 sem renumerar existentes | [MB4.0 §6.0] |

### 6.2 Tabela mestre contígua

| Seq mestre | Migration SQL Master | Domínio(s) | Bloco | Origem local | Depende de |
|---:|---|---|---|---|---|
| 001 | `001_shared_foundation.sql` | Foundation | A | 001 | Bootstrap, schemas, roles |
| 002 | `002_platform_owner_layer.sql` | D00 | A | 002 | 001 |
| 003 | `003_identity_tenant.sql` | D01 | A | 003 | 001,002 |
| 004 | `004_billing_saas_finance.sql` | D04 | A | 004 | 001,002,003 |
| 005 | `005_business_setup_hub.sql` | D02 | A | 005 | 001,003 |
| 006 | `006_onboarding_saas.sql` | D03 | A | 006 | 001,003,005 |
| 007 | `007_people_hub_core.sql` | D05 | B | 007 | A |
| 008 | `008_catalog_offer_hub.sql` | D06 | B | 008 | A |
| 009 | `009_people_catalog_bindings.sql` | D05/D06 | B | 009 | 007,008 |
| 010 | `010_resource_orchestration.sql` | D11 | B | 010 | 007,008,009 |
| 011 | `011_shared_agenda_contracts_and_foundation_addenda.sql` | D07–D10-fdn | C | 011 | A,B |
| 012 | `012_smart_scheduling_engine.sql` | D07 | C | 012 | 011 |
| 013 | `013_agenda_core.sql` | D08 | C | 013 | 011,012 |
| 014 | `014_recurring_appointments.sql` | D09 | C | 014 | 013 |
| 015 | `015_group_bookings.sql` | D10 | C | 015 | 013 |
| 016 | `016_financial_ledger.sql` | D15 | D | 016 | A–C |
| 017 | `017_checkout_core.sql` | D12 | D | 017 | 013,015,016 |
| 018 | `018_payment_core.sql` | D13 | D | 018 | 016,017 |
| 019 | `019_cash_register.sql` | D14 | D | 019 | 016,018 |
| 020 | `020_wallet_current_accounts.sql` | D16 | D | 020 | 016,018 |
| 021 | `021_compensation_engine.sql` | D17 | D | 021 | 016,017,018 |
| 022 | `022_benefits_packages_memberships.sql` | D18 | E | 022 | 016,017,018,021 |
| 023 | `023_client_experience_hub.sql` | D19 | E | 023 | 007,013,017,022 |
| 024 | `024_salon_public_page.sql` | D20 | E | 024 | 005,008,022,023 |
| 025 | `025_action_request_safety_foundation.sql` | D31-fdn | F | 025 | A–E |
| 026 | `026_messaging_conversations.sql` | D21 | F | 026 | 025 |
| 027 | `027_ai_receptionist_engine.sql` | D22 | F | 027 | 025,026 |
| 028 | `028_intelligence_action_request_whitelist.sql` | D23/D24-fdn | G | 031 → 028 | 025 |
| 029 | `029_copilot_revenue_engine.sql` | D23 | G | 032 → 029 | 028 |
| 030 | `030_retention_crm_engine.sql` | D24 | G | 033 → 030 | 026,028,029 |
| 031 | `031_analytics_fiscal_compliance_shared_contracts.sql` | D25/D26-fdn | H | 034 → 031 | A–G |
| 032 | `032_analytics_decision_intelligence.sql` | D25 | H | 035 → 032 | 031 + D07/D08/D12–D24 |
| 033 | `033_fiscal_lgpd_brasil.sql` | D26 | H | 036 → 033 | 031 + D12/D15/D17/D21 |
| 034 | `034_intelligence_scale_shared_contracts.sql` | D27–D31-fdn | I | 037 → 034 | A–H |
| 035 | `035_marketplace.sql` | D27 | I | 038 → 035 | D07/D12/D15/D19/D20/D25 |
| 036 | `036_multiunit_enterprise.sql` | D28 | I | 039 → 036 | D01/D07/D15/D17/D25 |
| 037 | `037_white_label_app.sql` | D29 | I | 040 → 037 | D02/D20/D31-fdn |
| 038 | `038_integration_platform.sql` | D30 | I | 041 → 038 | Outbox, Commands, D31-fdn |
| 039 | `039_gate_qa_governance.sql` | D31 | I | 042 → 039 | 025,034–038 |
| 040 | `040_booking_candidates.sql` | D07/D08 | C-ext | v4.0 GAP 1/3 | 012,013 |
| 041 | `041_booking_intents.sql` | D07/D08/D10 | C-ext | v4.0 GAP 2 | 040 |
| 042 | `042_payment_method_tokens.sql` | D13 | D-ext | v4.0 GAP 4 | 018 |
| 043 | `043_card_consent_records.sql` | D13 | D-ext | v4.0 GAP 4 | 042 |
| 044 | `044_waitlist_recovery_extensions.sql` | D08/D09 | C/F-ext | v4.0 GAP 5 | 013,026 |
| 045 | `045_manual_booking_validation.sql` | D08 | C/E-ext | v4.0 GAP 6 | 013 |

### 6.3 Absorção v4.0 dos gaps Red Team

| Gap | Migration(s) | Seção dona | Status |
|---|---|---|---|
| GAP 1 — Booking Candidate Contract | 040 | D07/D08 | Absorvido |
| GAP 2 — Multi-Service Booking Intent | 041 | D07/D08/D10 | Absorvido |
| GAP 3 — Smart Gap Law | 040 | D07/D31 | Absorvido |
| GAP 4 — Card-on-File / Deposit Policy | 042/043 | D02/D13 | Absorvido |
| GAP 5 — Waitlist Recovery Engine | 044 | D08/D09/D21 | Absorvido |
| GAP 6 — Manual Booking Validation Boundary | 045 | D08/D19 | Absorvido |

### 6.4 Checklist DoD da sequência mestre

| Item | Verificação | Status |
|---|---|---|
| Contiguidade | `001` até `045`, sem buraco | OK |
| 001–039 preservadas | Sem renumeração e dependências inalteradas | OK |
| 040–045 adicionadas | Extensões no final da sequência | OK |
| SQL executável | Não incluído neste Blueprint; SQL Master materializa depois | OK |
| Drift | Qualquer migration fora desta tabela exige decisão formal do Platform Owner | OK |

---

# ANEXOS — Blocos aprovados sem reescrita
**Nota v4.0:** os blocos A–I preservam o Blueprint v3.0 v1.1 quando compatíveis. As extensões v4.0 foram absorvidas nas seções originais D02, D07, D08, D09, D10, D13 e D19, sem criar domínio ou gate novo. [MB4.0 §0][MB4.0 §6.0][BP3.0 §0]



---

## ANEXO A — SMART_FLOW_3_0_BLUEPRINT_BLOCO_A_v2_1.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco A v2.1

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco A — Domínios 00, 01, 02, 03, 04  
**Status:** APROVADO COM RESSALVAS PELO RED TEAM — BLOCO A v2.1  
**Data:** 2026-06-10  
**Motivo da versão:** incorporação das ressalvas Red Team v2: colunas de idempotência, ator explícito nas RPCs seguras D04, privilégio mínimo para workers, janela operacional 002→003 e bootstrap idempotente de roles técnicos.  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §0–§8]

---

## 0. Regra de autoridade e versão

1. O Master Brief 3.0 decide visão, domínios e limites; documentos anteriores estão aposentados. [MB §0]
2. O Blueprint organiza arquitetura; SQL Master só materializa a verdade depois do Blueprint aprovado. [MB §0]
3. O SQL legado é insumo de reaproveitamento, não fonte de verdade. [RM §1]
4. Esta entrega cobre somente o Bloco A, porque a ordem canônica de criação exige avançar por blocos. [SKILL §6]
5. Nenhuma camada superior está autorizada antes da Camada 0 e do Gate 00. [MB §3]
6. Backend é a única fonte da verdade; frontend apenas exibe, solicita Command e apresenta recomendação já calculada pelo backend. [MB §7]
7. RLS é real e obrigatório; Platform Owner nunca compartilha RLS com tenant. [MB §6/D00][MB §7]
8. Escrita crítica segue UI/Agent → API → Command → DB Transaction → Ledger/History/Outbox → Projection → UI. [MB §7]

---

## 1. Escopo do Bloco A

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| A | 00 | Platform Owner Layer | Especificado | [MB §6/D00][RM §5/D00] |
| A | 01 | Identity & Tenant | Especificado | [MB §6/D01][RM §4 #1–#6][RM §5/D01] |
| A | 02 | Business Setup Hub | Especificado | [MB §6/D02][RM §4 #7–#13][RM §5/D02] |
| A | 03 | Onboarding SaaS | Especificado | [MB §6/D03][RM §5/D03] |
| A | 04 | Billing & SaaS Finance | Especificado | [MB §6/D04][RM §5/D04] |

---

## 2. Decisões resolvidas no Bloco A v2.1

### DECISÃO PENDENTE F0-02 — nomenclatura final de schemas separados

**Origem:** o Reuse Map deixou pendente a nomenclatura final de schemas separados para Platform Owner e tenant antes da migration 001. [RM §7]  
**Regra vinculante:** Platform Owner usa contexto separado e nunca compartilha RLS tenant. [RM §2][MB §6/D00]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | `platform` para Platform Owner, `tenant_core` para dados tenant, `shared` para tipos/helpers/infra técnica sem saldo soberano | Alta: não mistura ledger operacional nem billing tenant com tenant runtime | Alta: schemas e session keys separados | Baixo | Média |
| B | `platform` + `public` para tenant | Média: `public` acumula objetos de naturezas diferentes | Média | Médio | Alta |
| C | Um schema por domínio desde o início | Alta | Alta | Médio | Baixa |

**Escolha:** Alternativa A.  
Justificativa: separa Platform Owner e tenant desde a fundação, como exige o Master Brief. [MB §6/D00]  
Mantém `shared` apenas para tipos, helpers, grants técnicos e outbox fundacional, sem saldo, benefício ou regra de negócio soberana. [MB §7][SKILL §4]  
Evita usar `public` como depósito misto e reduz risco de bypass por objeto legado. [RM §1][RM §2]

**Descartes:**  
- Alternativa B descartada porque `public` preserva acoplamento legado e enfraquece o isolamento. [RM §2]  
- Alternativa C descartada no Bloco A porque aumenta complexidade antes do Gate 00 sem ganho imediato superior. [MB §10/Gate00]

**Decisão final:**
- Schema `platform`: Domínios 00 e 04; acesso por `hope.platform_owner_id` ou Command backend. [MB §6/D00][MB §6/D04]
- Schema `tenant_core`: Domínios 01, 02 e 03; `tenant_id` obrigatório nas tabelas tenant-scoped. [MB §6/D01][RM §2]
- Schema `shared`: extensões, enums globais, helpers, role grants técnicos e `outbox_events` fundacional. [MB §7][SKILL §4]
- Session key tenant: `hope.tenant_id`, via `set_config`, validada por request. [RM §2]
- Session key platform: `hope.platform_owner_id`, via contexto separado validado por operador ativo. [RM §2][MB §6/D00]

---

### DECISÃO PENDENTE A-01 — role PostgreSQL concreto para Commands e leituras seguras

**Origem:** Red Team C-02 apontou que `API backend trusted` não é role PostgreSQL concreto.  
**Regra vinculante:** Commands críticos não podem ser chamáveis por `PUBLIC`, `anon` ou `authenticated`; backend é a fonte da verdade; frontend só solicita ação. [MB §7][SKILL §4]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Criar roles dedicados `app_backend_command_executor`, `app_backend_read_executor`, `app_worker_executor` | Alta: grants mínimos por tipo de função | Alta: frontend não recebe EXECUTE direto | Baixo: contrato claro de grants | Média |
| B | Usar `service_role` como executor único | Média: funciona, mas concentra privilégio amplo | Média: depende de validação interna perfeita | Baixo | Alta |
| C | Permitir `authenticated` executar RPCs com validação interna | Baixa: amplia superfície de ataque | Baixa: erro de validação vira bypass direto | Médio | Média |

**Escolha:** Alternativa A.  
Justificativa: materializa o REVOKE com GRANT mínimo e verificável, sem depender de abstração verbal. [SKILL §4]  
Mantém frontend fora de Commands críticos, obedecendo backend-only e Command-first. [MB §7]  
Permite auditar Gate 00, Gate 01 e Gate 22 por lista objetiva de EXECUTE grants. [MB §10/Gate00][MB §10/Gate01][MB §10/Gate22]

**Descartes:**  
- Alternativa B descartada porque `service_role` único concentra privilégio e dificulta provar escopo por função.  
- Alternativa C descartada porque expõe funções críticas ao papel `authenticated`, contrariando o bloqueio explícito de chamadas diretas. [SKILL §4]

**Decisão final:**
- `app_backend_command_executor`: único role com EXECUTE em Commands de mutação do Bloco A.
- `app_backend_read_executor`: único role com EXECUTE em RPCs seguras de leitura de dados sensíveis.
- `app_worker_executor`: único role com EXECUTE em workers de outbox, billing, dunning, seed e readiness.
- `PUBLIC`, `anon`, `authenticated`: sempre sem EXECUTE direto nos Commands e sem acesso bruto às tabelas críticas. [SKILL §4]

---

### DECISÃO PENDENTE A-02 — criação fundacional de `outbox_events` antes do Domínio 30

**Origem:** Red Team D-02 apontou que todos os domínios do Bloco A emitem eventos, mas `outbox_events` pertence ao D30 no Reuse Map e não estava materializada antes das migrations do Bloco A. [RM §4 #97][RM §5/D30]  
**Regra vinculante:** toda escrita crítica passa por History/Outbox e efeitos assíncronos usam outbox. [MB §7][SKILL §4]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Criar `shared.outbox_events` mínimo na migration 001, com ownership canônico do D30 quando o Bloco J expandir integrações | Alta: evento não vira saldo nem fonte financeira | Alta: `tenant_id` nullable + `platform_owner_id` e RLS própria | Baixo: D30 expande sem recriar | Média |
| B | Adiar qualquer outbox até o Bloco J/D30 | Baixa: Commands do Bloco A falham ou perdem eventos | Média | Alto | Alta |
| C | Criar uma outbox por schema/domínio | Média: risco de filas paralelas | Alta | Alto | Baixa |

**Escolha:** Alternativa A.  
Justificativa: cumpre a regra absoluta de outbox desde o primeiro Command crítico. [MB §7]  
Evita engine paralela de eventos e mantém D30 como dono da evolução futura da plataforma de integração. [RM §5/D30]  
Mantém `outbox_events` como infraestrutura técnica, não como fonte soberana de saldo, benefício ou agenda. [RM §6]

**Descartes:**  
- Alternativa B descartada porque deixa Commands do Bloco A sem efeito assíncrono auditável. [MB §7]  
- Alternativa C descartada porque cria filas paralelas e aumenta risco de inconsistência operacional. [RM §6]

**Decisão final:** `shared.outbox_events` é criada na migration 001 como dependência técnica obrigatória do Bloco A; o Domínio 30 herda e expande a mesma tabela, sem recriação. [RM §4 #97][RM §5/D30]

---

## 3. Convenções canônicas do Bloco A v2.1

| Item | Regra | Fonte |
|---|---|---|
| IDs | `uuid` com `gen_random_uuid()` | [SKILL §4] |
| Timestamps | `timestamptz`; `timestamp` proibido | [SKILL §4] |
| Soft delete | `deleted_at timestamptz` em dado operacional arquivável; dado financeiro não sofre delete físico | [SKILL §4][MB §7] |
| Tenant context | `hope.tenant_id` via `set_config`; RLS usa `current_setting('hope.tenant_id', true)` | [RM §2] |
| Platform context | `hope.platform_owner_id`; nunca usa `hope.tenant_id` | [MB §6/D00][RM §2] |
| RLS efetiva | Toda tabela sensível do Bloco A tem `RLS_ENABLED = SIM` antes de qualquer grant de leitura ou escrita; política sem RLS efetiva é inválida | [MB §7][MB §10/Gate00] |
| REVOKE | `REVOKE ALL ... FROM PUBLIC, anon, authenticated` em objetos sensíveis; EXECUTE concedido apenas a roles técnicos nomeados | [RM §2][SKILL §4] |
| Roles técnicos | `app_backend_command_executor`, `app_backend_read_executor`, `app_worker_executor`; bootstrap idempotente obrigatório na migration 001 via verificação de existência do role antes da criação | [MB §7][SKILL §4] |
| Escrita crítica | Somente via API backend → Command → transação de banco → History/Outbox | [MB §7] |
| Outbox | `shared.outbox_events.event_type` obrigatório; tabela criada na migration 001 como infraestrutura técnica do Bloco A | [MB §7][SKILL §4][RM §4 #97] |
| Ledger | Não especificado no Bloco A; nenhuma tabela cria saldo soberano | [MB §7][RM §6] |
| Monetary fields | Campos SaaS usam sufixo `_cents bigint` provisoriamente sob DECISÃO PENDENTE F0-01, ratificação final no Bloco D | [RM §7] |
| Idempotência | Todo Command de mutação do Bloco A exige `p_idempotency_key text`, inclusive suporte, onboarding e billing | [SKILL §4] |
| FK cross-migration | FK que referencia tabela criada em migration posterior não é criada antes da tabela-alvo existir; constraints cross-schema são materializadas na primeira migration em que ambos os lados existem | [SKILL §7][MB §11] |
| Read models monetários | Campo monetário reconstruível deve declarar fonte, job/função de reconstrução e modo append-only/substituição auditada | [MB §7][MB §9/MOCKADO] |
| RPC segura de leitura | RPC de leitura sensível que recebe `p_tenant_id` também recebe `p_actor_user_id` e valida membership ativa antes de retornar dado tenant/platform | [MB §7][MB §6/D01][MB §6/D04] |
| Janela 002→003 | Migration 002 não pode ser executada isoladamente em ambiente com escrita habilitada; `command_create_tenant_registry_entry` permanece bloqueado operacionalmente até a FK física ser materializada na migration 003 | [MB §7][SKILL §7] |

### 3.1 Infraestrutura fundacional obrigatória do Bloco A

| Objeto | Schema | Migration | Propósito | RLS / acesso |
|---|---|---:|---|---|
| `shared.outbox_events` | `shared` | 001 | Fila canônica de efeitos assíncronos com `event_type`, `payload`, `tenant_id` nullable, `platform_owner_id` nullable, `idempotency_key`, `status`, `available_at`, `attempt_count`, `locked_at`, `processed_at`, `created_at` | `RLS_ENABLED = SIM`; INSERT por `app_backend_command_executor`; leitura/processamento por `app_worker_executor`; sem acesso a `PUBLIC`, `anon`, `authenticated` |
| `shared.command_idempotency_keys` | `shared` | 001 | Registro genérico de idempotência para Commands não-financeiros do Bloco A; colunas mínimas: `command_key text` PK, `command_name text not null`, `idempotency_key text not null`, `tenant_id uuid nullable`, `platform_owner_id uuid nullable`, `request_id text nullable`, `status command_idempotency_status`, `result_id uuid nullable`, `result_payload jsonb nullable`, `error_code text nullable`, `created_at timestamptz`, `executed_at timestamptz nullable`, `expires_at timestamptz nullable`; unique composto lógico por `command_key`; mutações financeiras futuras usam registro financeiro próprio no Bloco D | `RLS_ENABLED = SIM`; acesso apenas por `app_backend_command_executor` e `app_worker_executor`; sem acesso a `PUBLIC`, `anon`, `authenticated` |
| `command_idempotency_status` | `shared` | 001 | Enum técnico para idempotência não-financeira: `started`, `succeeded`, `failed`, `expired` | Tipo global sem linha de negócio; usado por `shared.command_idempotency_keys` |
| Roles técnicos | Banco | 001 | Roles concretos de execução backend/worker criados por bootstrap idempotente: verifica role existente em catálogo antes de criar; em Supabase, o bootstrap roda com privilégio de migration/superuser e não depende do painel Auth | Grants explícitos por função; sem grant direto ao frontend |

---

## 4. Mapa Bloco A — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 001 | `shared` + criação dos schemas | Fundação | Extensões, enums globais, helpers, bootstrap idempotente de roles técnicos, default revokes, `shared.outbox_events`, `shared.command_idempotency_keys` com colunas completas | Gate 00 [MB §10] |
| 002 | `platform` | 00 | Platform Owner Layer; `platform_tenant_registry.tenant_id` criado sem FK física até a migration 003; Commands D00 permanecem operacionalmente bloqueados para escrita real até execução completa da 003 | Gate 22 [MB §10] |
| 003 | `tenant_core` + constraint cross-schema | 01 | Identity, Tenant, RLS, memberships, contexto tenant; materializa FK `platform_tenant_registry.tenant_id` → `tenant_core.tenants.id` | Gate 01 [MB §10] |
| 004 | `platform` | 04 | Planos SaaS, billing accounts, subscriptions, dunning, RPCs seguras de leitura | Gate 22 [MB §10] |
| 005 | `tenant_core` | 02 | Setup operacional, horários, políticas, métodos aceitos | Gate 00 [MB §10] |
| 006 | `tenant_core` + `platform` | 03 | Trial, onboarding, seed, readiness, feature activation | Gate 00 / Gate 25 [MB §10] |

---

## 5. Especificação por domínio

## Domínio 00 — Platform Owner Layer

### 00.1 Responsabilidade

O Domínio 00 é dono da identidade operacional do Platform Owner, operadores da plataforma, registro administrativo de tenants, saúde operacional por tenant, suporte interno, parceiros, promoção de release e auditoria de plataforma. Não é dono dos dados operacionais internos do salão, nem compartilha RLS tenant. [MB §6/D00][RM §5/D00]

### 00.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `platform.platform_owners` | Raiz de identidade do Platform Owner | PK `id uuid`; `auth_user_id uuid unique not null`; `status platform_operator_status`; `created_at timestamptz`; `updated_at timestamptz`; `deleted_at timestamptz`; unique ativo por `auth_user_id` | RLS platform-only por `hope.platform_owner_id`; sem `tenant_id` |
| `platform.platform_operator_profiles` | Perfis e papéis de operadores da plataforma | PK `id`; FK `platform_owner_id`; `auth_user_id uuid unique`; `role platform_operator_role`; `status`; `display_name text`; `email citext`; `last_seen_at timestamptz`; unique `auth_user_id` | SELECT/UPDATE restrito a Platform Owner ativo; INSERT/REVOKE via Command |
| `platform.platform_tenant_registry` | Registro administrativo de tenants criados pela plataforma | PK `id`; `tenant_id uuid not null unique`; FK física para `tenant_core.tenants(id)` materializada na migration 003; FK `created_by_platform_owner_id`; `source platform_tenant_source`; `created_at`; `suspended_at`; `cancelled_at`; `reactivated_at`; check apenas uma transição ativa por comando | Platform-only; tenants não leem tabela bruta |
| `platform.platform_health_snapshots` | Snapshot reconstruível de saúde operacional por tenant | PK `id`; FK `tenant_id`; `snapshot_at timestamptz`; `health_status platform_health_status`; `mrr_cents bigint`; `churn_risk_score numeric(5,2)`; `metrics jsonb`; `source_subscription_period_start`; `source_subscription_period_end`; `rebuild_run_id`; index `(tenant_id, snapshot_at desc)` | Platform-only; read model reconstruível a partir de `tenant_subscriptions`, `tenant_invoice_documents` e `tenant_payment_attempts`; snapshot é append-only por `snapshot_at` |
| `platform.platform_support_tickets` | Tickets internos de suporte | PK `id`; FK `tenant_id` nullable; FK `opened_by_platform_owner_id`; `status support_ticket_status`; `priority support_ticket_priority`; `subject text`; `body text`; `closed_at`; `created_at`; check `closed_at` exige status fechado | Platform-only; tenant acessa apenas por Command/portal futuro |
| `platform.platform_partner_accounts` | Parceiros e revendedores da plataforma | PK `id`; `partner_name text`; `partner_document_number text`; `status partner_account_status`; `commission_terms jsonb`; `created_at`; `updated_at`; `deleted_at`; unique documento quando presente | Platform-only |
| `platform.platform_release_promotions` | Solicitações e decisões de promoção de release | PK `id`; `release_version text`; `requested_by_platform_owner_id`; `approved_by_platform_owner_id`; `status release_promotion_status`; `gate_evidence jsonb`; `requested_at`; `approved_at`; check aprovação exige evidence | Platform-only; exige Gate antes de promoção [MB §7][MB §10/Gate25] |
| `platform.platform_audit_logs` | Trilha append-only de ações da plataforma | PK `id`; `actor_platform_owner_id uuid`; `action text not null`; `entity_table text`; `entity_id uuid`; `before_data jsonb`; `after_data jsonb`; `request_id text`; `created_at`; trigger bloqueia UPDATE/DELETE | Platform-only; append-only |

### 00.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `platform_operator_role` | `owner`, `admin`, `support`, `billing_ops`, `release_manager`, `partner_manager`, `auditor` |
| `platform_operator_status` | `active`, `suspended`, `revoked` |
| `platform_tenant_source` | `direct_signup`, `sales_assisted`, `partner_referral`, `manual_platform_creation` |
| `platform_health_status` | `healthy`, `attention`, `risk`, `suspended`, `cancelled` |
| `support_ticket_status` | `open`, `waiting_internal`, `waiting_tenant`, `resolved`, `closed` |
| `support_ticket_priority` | `low`, `normal`, `high`, `critical` |
| `partner_account_status` | `prospect`, `active`, `suspended`, `ended` |
| `release_promotion_status` | `requested`, `approved`, `rejected`, `promoted`, `rolled_back` |

### 00.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `platform.command_set_platform_context` | `(p_platform_owner_id uuid, p_actor_auth_user_id uuid, p_request_id text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | API backend; valida operador ativo antes de setar contexto |
| `platform.command_create_tenant_registry_entry` | `(p_tenant_id uuid, p_source platform_tenant_source, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Command Platform Owner |
| `platform.command_suspend_tenant` | `(p_tenant_id uuid, p_reason text, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Command Platform Owner |
| `platform.command_reactivate_tenant` | `(p_tenant_id uuid, p_reason text, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Command Platform Owner |
| `platform.command_open_support_ticket` | `(p_tenant_id uuid, p_subject text, p_body text, p_priority support_ticket_priority, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Command Platform Owner |
| `platform.command_request_release_promotion` | `(p_release_version text, p_gate_evidence jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Release manager |

**Pré-condições obrigatórias dos Commands D00:** `command_set_platform_context` só aceita `p_platform_owner_id` existente em `platform.platform_owners` com `status = active` e `auth_user_id = p_actor_auth_user_id`; `command_create_tenant_registry_entry` só fica liberado para uso real após a migration 003 materializar a FK para `tenant_core.tenants`; todo Command de mutação grava `platform.platform_audit_logs` e `shared.outbox_events` na mesma transação. [MB §6/D00][MB §7][SKILL §7]

### 00.5 Políticas RLS

**Inventário RLS efetiva D00:** `platform.platform_owners`, `platform.platform_operator_profiles`, `platform.platform_tenant_registry`, `platform.platform_health_snapshots`, `platform.platform_support_tickets`, `platform.platform_partner_accounts`, `platform.platform_release_promotions`, `platform.platform_audit_logs` têm `RLS_ENABLED = SIM` na migration 002 antes de qualquer grant. `platform.platform_audit_logs` também tem bloqueio append-only. [MB §7][MB §10/Gate22]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `platform.*` | SELECT | Platform Owner ativo | `current_setting('hope.platform_owner_id', true)` corresponde a operador ativo |
| `platform.*` | INSERT | Command trusted | Sem INSERT direto por anon/authenticated; somente SECURITY DEFINER validado |
| `platform.*` | UPDATE | Command trusted | UPDATE direto negado; comandos registram `platform_audit_logs` |
| `platform.platform_audit_logs` | UPDATE/DELETE | Todos | Bloqueado por trigger append-only |
| `platform.*` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |

### 00.6 Invariantes

1. Platform Owner nunca compartilha RLS com tenant. [MB §6/D00]
2. Platform Owner usa schema e contexto próprios desde a migration 001. [RM §2][RM §7]
3. Nenhuma tabela `platform.*` carrega saldo operacional do salão. [MB §7]
4. Promoção de release exige evidência de gate. [MB §7][MB §10/Gate25]
5. Auditoria de plataforma é append-only. [MB §6/D00]
6. `platform.platform_tenant_registry` só recebe FK física para `tenant_core.tenants` na migration 003, quando a tabela-alvo já existe. [SKILL §7][MB §11]
7. Evento outbox é obrigatório e gravado em `shared.outbox_events` na mesma transação do Command. [MB §7]

### 00.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `platform.tenant_registry_created` | `tenant_id`, `source`, `created_by`, `request_id` |
| `platform.tenant_suspended` | `tenant_id`, `reason`, `actor_id`, `request_id` |
| `platform.tenant_reactivated` | `tenant_id`, `reason`, `actor_id`, `request_id` |
| `platform.support_ticket_opened` | `ticket_id`, `tenant_id`, `priority` |
| `platform.release_promotion_requested` | `promotion_id`, `release_version`, `gate_evidence_hash` |

### 00.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | `shared` foundation |
| É dependência de | 01, 03, 04, 31 |

### 00.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 22 — Platform Owner Isolation | Platform Owner não lê/escreve por RLS tenant; tenant não lê `platform.*`; billing e dunning acessíveis apenas por plataforma [MB §10/Gate22] |
| Gate 00 — Foundation | SQL base, seed, RLS inicial, funções críticas e integridade inicial passam antes de camada superior [MB §10/Gate00] |

### 00.10 RAGOV do domínio

**CRÍTICO / REAL / MVP obrigatório antes de qualquer tenant.** [MB §6/D00]

---

## Domínio 01 — Identity & Tenant

### 01.1 Responsabilidade

O Domínio 01 é dono de empresas, unidades, usuários, memberships, papéis, permissões por escopo, RLS multiempresa, timezone, moeda por unidade, sessão e contexto de tenant. Não é dono de billing SaaS, suporte Platform Owner, agenda, checkout ou ledger. [MB §6/D01][RM §4 #1–#6]

### 01.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.tenants` | Tenant canônico | PK `id`; `name`; `legal_name`; `document_number`; `status tenant_status`; `currency_code text default 'BRL'`; `timezone text`; `metadata jsonb`; `created_at`; `updated_at`; `archived_at`; check status válido | SELECT somente membership ativa no tenant do contexto; mutação via Command |
| `tenant_core.business_units` | Unidade operacional do tenant | PK `id`; FK `tenant_id`; `name`; `display_name`; `document_number`; `phone`; `email citext`; `address jsonb`; `timezone`; `status tenant_status`; `created_at`; `updated_at`; `archived_at`; unique `(tenant_id, name)` | `tenant_id = current_setting('hope.tenant_id', true)::uuid` + membership ativa |
| `tenant_core.user_profiles` | Perfil de usuário vinculado ao auth | PK `id uuid`; `full_name`; `email citext`; `phone`; `avatar_url`; `metadata jsonb`; timestamps | Usuário lê próprio perfil; gestores leem perfis vinculados ao tenant via membership |
| `tenant_core.memberships` | Vínculo usuário ↔ tenant/unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `user_id uuid`; `role account_role`; `status membership_status`; `invited_by`; timestamps; unique `(tenant_id, user_id, role)` | SELECT por membership ativa; INSERT/UPDATE por owner/admin Command |
| `tenant_core.permission_overrides` | Exceções auditáveis de permissão | PK `id`; FK `tenant_id`; FK `membership_id`; `permission_key`; `allowed boolean`; `reason`; `before_value`; `after_value`; `created_by`; `revoked_at`; `revoked_by`; unique `(tenant_id, membership_id, permission_key)` ativo | Leitura por owner/admin; escrita somente Command com motivo |
| `tenant_core.audit_logs` | Auditoria tenant append-only | PK `id`; FK `tenant_id`; `actor_user_id`; `action`; `entity_table`; `entity_id`; `before_data`; `after_data`; `reason`; `request_id`; `created_at`; trigger bloqueia UPDATE/DELETE | SELECT por owner/admin; staff limitado a eventos próprios quando permitido |
| `tenant_core.tenant_context_audit_logs` | Prova de set/clear de contexto tenant | PK `id`; FK `tenant_id`; `actor_user_id`; `request_id`; `source`; `set_at`; `cleared_at`; `ip_hash`; `user_agent_hash`; append-only | Owner/admin lê; Command escreve |
| `tenant_core.role_permission_catalog` | Catálogo canônico de permissões por papel | PK `id`; `role account_role`; `permission_key text`; `scope_kind membership_scope_kind`; `default_allowed boolean`; unique `(role, permission_key, scope_kind)` | SELECT por membros ativos; escrita somente migration/Command admin |
| `tenant_core.membership_scope_bindings` | Escopos explícitos de membership | PK `id`; FK `tenant_id`; FK `membership_id`; `scope_kind membership_scope_kind`; `scope_id uuid`; `created_at`; `revoked_at`; unique ativo `(membership_id, scope_kind, scope_id)` | SELECT por tenant; escrita owner/admin Command |

### 01.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `tenant_status` | `setup`, `active`, `suspended`, `cancelled` |
| `account_role` | `owner`, `admin`, `manager`, `staff`, `reception`, `client`, `viewer` |
| `membership_status` | `invited`, `active`, `suspended`, `revoked` |
| `membership_scope_kind` | `tenant`, `business_unit`, `enterprise_group` |
| `tenant_context_source` | `api_request`, `command`, `system_job`, `gate_fixture` |

### 01.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_set_tenant_context` | `(p_tenant_id uuid, p_actor_user_id uuid, p_request_id text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | API backend; valida membership ativa do ator |
| `tenant_core.command_clear_tenant_context` | `(p_request_id text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | API backend trusted |
| `tenant_core.command_create_tenant` | `(p_name text, p_legal_name text, p_document_number text, p_timezone text, p_currency_code text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Platform Owner Command |
| `tenant_core.command_create_business_unit` | `(p_tenant_id uuid, p_name text, p_timezone text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_invite_member` | `(p_tenant_id uuid, p_business_unit_id uuid, p_email citext, p_role account_role, p_scope jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_revoke_membership` | `(p_membership_id uuid, p_reason text, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_grant_permission_override` | `(p_membership_id uuid, p_permission_key text, p_allowed boolean, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin Command |

### 01.5 Políticas RLS

**Inventário RLS efetiva D01:** `tenant_core.tenants`, `tenant_core.business_units`, `tenant_core.user_profiles`, `tenant_core.memberships`, `tenant_core.permission_overrides`, `tenant_core.audit_logs`, `tenant_core.tenant_context_audit_logs`, `tenant_core.role_permission_catalog`, `tenant_core.membership_scope_bindings` têm `RLS_ENABLED = SIM` na migration 003 antes de grants. [MB §6/D01][MB §10/Gate01]

**Permissão LGPD mínima:** leitura gerencial de `tenant_core.user_profiles` exige `identity.user_profile.read_sensitive`; leitura própria exige `auth.uid()` vinculado ao perfil. [MB §26][MB §7]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.tenants` | SELECT | membro ativo | `id = current_setting('hope.tenant_id', true)::uuid` e membership ativa |
| `tenant_core.business_units` | SELECT | membro ativo | `tenant_id = current_setting('hope.tenant_id', true)::uuid` |
| `tenant_core.user_profiles` | SELECT | próprio usuário ou gestor autorizado | próprio `auth.uid()` ou membership ativa no tenant com `identity.user_profile.read_sensitive` |
| `tenant_core.memberships` | SELECT | membro ativo | tenant atual; campos sensíveis filtrados por função de leitura |
| `tenant_core.permission_overrides` | SELECT | owner/admin | tenant atual + permissão `identity.permission_override.read` |
| `tenant_core.audit_logs` | INSERT | Command trusted | Sem INSERT direto por authenticated |
| `tenant_core.audit_logs` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito; grants somente para rotas seguras |

### 01.6 Invariantes

1. Sem tenant isolation provado por gate, produto bloqueado. [MB §6/D01]
2. RLS usa `hope.tenant_id`, não filtro visual. [RM §2][MB §7]
3. Platform Owner não acessa tenant usando RLS tenant. [MB §6/D00]
4. Membership suspensa, revogada ou fora de escopo não autoriza leitura. [MB §6/D01]
5. Overrides exigem motivo, ator e trilha de auditoria. [RM §4 #5]

### 01.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `identity.tenant_created` | `tenant_id`, `request_id`, `created_by` |
| `identity.business_unit_created` | `tenant_id`, `business_unit_id`, `request_id` |
| `identity.member_invited` | `tenant_id`, `membership_id`, `email`, `role` |
| `identity.membership_revoked` | `tenant_id`, `membership_id`, `reason` |
| `identity.permission_override_granted` | `tenant_id`, `membership_id`, `permission_key`, `allowed` |
| `identity.tenant_context_set` | `tenant_id`, `actor_user_id`, `request_id` |

### 01.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 00 para criação administrativa de tenant; `shared` foundation |
| É dependência de | Todos os domínios tenant-scoped |

### 01.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 01 — Tenant Isolation | Tenant A não acessa dados de tenant B em SELECT/INSERT/UPDATE/DELETE [MB §10/Gate01] |
| Gate 00 — Foundation | RLS, seed e funções críticas funcionam antes de camada superior [MB §10/Gate00] |

### 01.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D01]

---

## Domínio 02 — Business Setup Hub

### 02.1 Responsabilidade

O Domínio 02 é dono do setup operacional da empresa e unidade: perfil operacional privado, horários de funcionamento, feriados, políticas de agenda, cancelamento, no-show, métodos de pagamento aceitos, canais oficiais e configuração inicial da SMART Scheduling Engine. Não é dono da execução de agenda, pagamento real, ledger, fiscal ou página pública. [MB §6/D02][RM §4 #7–#13]

### 02.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.business_profiles` | Perfil operacional privado do salão | PK `id`; FK `tenant_id`; FK `business_unit_id`; `market_name`; `description`; `website`; `instagram`; `onboarding_completed_at`; `settings jsonb`; timestamps; unique `(tenant_id, business_unit_id)` | Tenant atual; escrita owner/admin/manager Command |
| `tenant_core.business_hours` | Horários de funcionamento por unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `weekday int check 0..6`; `opens_at time`; `closes_at time`; `is_closed boolean`; check `opens_at < closes_at` quando aberto; unique por janela | Tenant atual; escrita gerencial Command |
| `tenant_core.holiday_rules` | Feriados e exceções de funcionamento | PK `id`; FK `tenant_id`; FK `business_unit_id`; `holiday_date date`; `name`; `is_closed`; `opens_at`; `closes_at`; check horário válido quando aberto | Tenant atual |
| `tenant_core.agenda_policies` | Políticas base da agenda | PK `id`; FK `tenant_id`; FK `business_unit_id`; `slot_minutes`; `min_notice_minutes`; `max_future_days`; `allow_staff_global_view`; `allow_staff_create_for_others`; `require_deposit_for_premium_window`; `settings`; unique `(tenant_id,business_unit_id)` | Tenant atual; escrita gerencial Command |
| `tenant_core.cancellation_policies` | Política de cancelamento | PK `id`; FK `tenant_id`; FK `business_unit_id`; `free_cancel_until_minutes`; `penalty_cents bigint`; `settings`; unique `(tenant_id,business_unit_id)` | Tenant atual; escrita gerencial Command |
| `tenant_core.no_show_policies` | Política de no-show, fricção progressiva, depósito e Card-on-File eligibility | PK `id`; FK `tenant_id`; FK `business_unit_id`; `penalty_cents bigint`; `require_deposit_after_count int`; `require_card_on_file_after_count int CHECK >= 0 DEFAULT 0`; `card_on_file_charge_pct numeric(5,2) CHECK 0..100`; `deposit_policy_kind deposit_policy_kind`; `settings`; unique `(tenant_id,business_unit_id)` | Tenant atual; D13 executa token/charge; frontend apenas exibe política [MB4.0 §16/DEC-PO-01][MB4.0 §5.1] |
| `tenant_core.payment_methods` | Métodos aceitos pelo tenant/unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `method_kind payment_method_kind`; `display_name`; `is_active`; `provider`; `config jsonb`; unique `(tenant_id,business_unit_id,method_kind,display_name)` | Tenant atual; runtime financeiro usa Command próprio no Domínio 13 |
| `tenant_core.setup_checklists` | Checklist de setup por tenant/unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `status setup_checklist_status`; `created_at`; `completed_at`; unique ativo por unidade | Tenant atual |
| `tenant_core.setup_checklist_items` | Itens obrigatórios do setup | PK `id`; FK `checklist_id`; `item_key`; `status setup_item_status`; `required boolean`; `completed_at`; unique `(checklist_id,item_key)` | Tenant atual por join com checklist |
| `tenant_core.setup_validation_runs` | Provas de prontidão do setup | PK `id`; FK `tenant_id`; FK `business_unit_id`; `run_status setup_validation_status`; `assertions jsonb`; `failed_items jsonb`; `started_at`; `finished_at`; append-only | Tenant lê; Command escreve |

### 02.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `payment_method_kind` | `cash`, `pix`, `credit_card`, `debit_card`, `client_credit`, `cashback`, `package`, `subscription`, `voucher`, `other` |
| `setup_checklist_status` | `draft`, `in_progress`, `ready_for_validation`, `validated`, `blocked` |
| `setup_item_status` | `pending`, `completed`, `failed`, `skipped_by_rule` |
| `setup_validation_status` | `running`, `passed`, `failed` |


| `deposit_policy_kind` | `none`, `manual_pix`, `card_on_file`, `prepayment_full` |

### 02.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_update_business_profile` | `(p_business_unit_id uuid, p_patch jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_configure_business_hours` | `(p_business_unit_id uuid, p_hours jsonb, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_configure_agenda_policy` | `(p_business_unit_id uuid, p_policy jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_configure_cancellation_policy` | `(p_business_unit_id uuid, p_policy jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_configure_no_show_policy` | `(p_business_unit_id uuid, p_policy jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_configure_payment_method` | `(p_business_unit_id uuid, p_method_kind payment_method_kind, p_display_name text, p_config jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_run_setup_validation` | `(p_business_unit_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Onboarding Command |

### 02.5 Políticas RLS

**Inventário RLS efetiva D02:** `tenant_core.business_profiles`, `tenant_core.business_hours`, `tenant_core.holiday_rules`, `tenant_core.agenda_policies`, `tenant_core.cancellation_policies`, `tenant_core.no_show_policies`, `tenant_core.payment_methods`, `tenant_core.setup_checklists`, `tenant_core.setup_checklist_items`, `tenant_core.setup_validation_runs` têm `RLS_ENABLED = SIM` na migration 005 antes de grants. [MB §6/D02][MB §10/Gate00]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.business_profiles` | SELECT | membro ativo | tenant atual |
| `tenant_core.business_hours` | SELECT | membro ativo | tenant atual |
| `tenant_core.holiday_rules` | SELECT | membro ativo | tenant atual |
| `tenant_core.agenda_policies` | SELECT | membro ativo | tenant atual |
| `tenant_core.cancellation_policies` | SELECT | membro ativo autorizado | tenant atual |
| `tenant_core.no_show_policies` | SELECT | membro ativo autorizado | tenant atual |
| `tenant_core.payment_methods` | SELECT | membro ativo autorizado | tenant atual; segredos em `config` não expostos ao cliente direto |
| `tenant_core.setup_*` | INSERT/UPDATE | owner/admin/manager via Command | Sem escrita direta por frontend |
| `tenant_core.*` | DELETE | Todos | DELETE físico negado; arquivamento por status quando aplicável |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |

### 02.6 Invariantes

1. Setup é REAL/MVP obrigatório. [MB §6/D02]
2. Políticas configuram regra; não executam pagamento, agenda ou ledger diretamente. [MB §7]
3. `payment_method_configs` legado é fundido em `payment_methods`; não existe dupla configuração de método aceito. [RM §4 #13][RM §6]
4. Dados privados de setup ficam separados da página pública. [RM §4 #7]
5. Validação de setup é registrada em `setup_validation_runs` antes de operação. [RM §5/D02]


6. D02 define política de depósito e Card-on-File, mas não armazena token, não captura pagamento e não lança ledger. [MB4.0 §16/DEC-PO-01]
7. `require_card_on_file_after_count` e `card_on_file_charge_pct` são parâmetros de política; cobrança real exige consentimento D13 e Command transacional. [MB4.0 §16/DEC-PO-01][MB4.0 §10/Gate12]
8. `deposit_policy_kind` controla fricção permitida por unidade: `none`, `manual_pix`, `card_on_file` ou `prepayment_full`. [MB4.0 §16/DEC-PO-01]

### 02.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `setup.business_profile_updated` | `tenant_id`, `business_unit_id`, `request_id` |
| `setup.business_hours_configured` | `tenant_id`, `business_unit_id`, `request_id` |
| `setup.agenda_policy_configured` | `tenant_id`, `business_unit_id`, `request_id` |
| `setup.payment_method_configured` | `tenant_id`, `business_unit_id`, `payment_method_id` |
| `setup.validation_passed` | `tenant_id`, `business_unit_id`, `run_id` |
| `setup.validation_failed` | `tenant_id`, `business_unit_id`, `run_id`, `failed_items` |

### 02.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01 Identity & Tenant |
| É dependência de | 03 Onboarding, 07 Scheduling Engine, 08 Agenda Core, 13 Payment Core |

### 02.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 00 — Foundation | Setup mínimo, RLS, seed e integridade inicial existem antes de camada superior [MB §10/Gate00] |


| Gate 08 — Premium Window Protection | Política de depósito/pré-pagamento protege janela premium sem cálculo no frontend [MB4.0 §10/Gate08] |
| Gate 12 — Payment Allocation | D02 só configura; D13/D15 executam cobrança e ledger [MB4.0 §10/Gate12] |
| Gate 16 — Action Request Safety | Override de política sensível exige Action Request quando configurado [MB4.0 §10/Gate16] |

### 02.10 RAGOV do domínio

**REAL / MVP obrigatório.** [MB §6/D02]

---

## Domínio 03 — Onboarding SaaS

### 03.1 Responsabilidade

O Domínio 03 é dono do trial do salão, ativação de plano, primeiro acesso guiado, seed de dados iniciais, checklist de prontidão operacional e ativação de funcionalidades por plano. Não é dono da cobrança financeira do tenant, nem da operação diária após prontidão validada. [MB §6/D03][RM §5/D03]

### 03.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `platform.saas_trials` | Trial antes ou durante criação do tenant | PK `id`; FK `tenant_id` nullable até provisionamento; `lead_email citext`; `status saas_trial_status`; `starts_at`; `ends_at`; `converted_at`; `source platform_tenant_source`; unique ativo por `lead_email` | Platform-only; tenant não acessa tabela bruta |
| `tenant_core.onboarding_flows` | Fluxo de onboarding por tenant/unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `status onboarding_flow_status`; `started_at`; `completed_at`; `blocked_reason`; unique ativo por unidade | Tenant atual; escrita por Command |
| `tenant_core.onboarding_steps` | Etapas do onboarding | PK `id`; FK `flow_id`; `step_key`; `status onboarding_step_status`; `required boolean`; `payload jsonb`; `completed_at`; unique `(flow_id, step_key)` | Tenant atual por join com flow |
| `tenant_core.initial_data_seed_runs` | Execução idempotente de seed inicial | PK `id`; FK `tenant_id`; FK `business_unit_id`; `seed_version text`; `status seed_run_status`; `idempotency_key text unique`; `started_at`; `finished_at`; `result jsonb`; append-only | Tenant lê; Command escreve |
| `tenant_core.feature_activation_flags` | Funcionalidades ativas por plano e tenant | PK `id`; FK `tenant_id`; `feature_key`; `status feature_activation_status`; `source tenant_feature_source`; `activated_at`; `deactivated_at`; unique ativo `(tenant_id, feature_key)` | Tenant lê; Platform/Billing Command escreve |
| `tenant_core.operational_readiness_checks` | Prova de que salão está apto a operar | PK `id`; FK `tenant_id`; FK `business_unit_id`; `status readiness_check_status`; `assertions jsonb`; `checked_at`; `checked_by`; `failure_reasons jsonb`; append-only | Tenant lê; Command escreve |

### 03.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `saas_trial_status` | `created`, `active`, `converted`, `expired`, `cancelled` |
| `onboarding_flow_status` | `not_started`, `in_progress`, `blocked`, `completed`, `validated` |
| `onboarding_step_status` | `pending`, `completed`, `failed`, `skipped_by_rule` |
| `seed_run_status` | `queued`, `running`, `succeeded`, `failed`, `rolled_back` |
| `feature_activation_status` | `active`, `inactive`, `suspended_by_plan`, `suspended_by_billing` |
| `tenant_feature_source` | `plan`, `trial`, `manual_platform_grant`, `gate_fixture` |
| `readiness_check_status` | `passed`, `failed` |

### 03.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `platform.command_start_saas_trial` | `(p_lead_email citext, p_source platform_tenant_source, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Public signup API via backend trusted |
| `tenant_core.command_start_onboarding_flow` | `(p_tenant_id uuid, p_business_unit_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Onboarding API |
| `tenant_core.command_complete_onboarding_step` | `(p_flow_id uuid, p_step_key text, p_payload jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Onboarding API |
| `tenant_core.command_run_initial_seed` | `(p_tenant_id uuid, p_business_unit_id uuid, p_seed_version text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_worker_executor` | Onboarding worker |
| `tenant_core.command_run_operational_readiness_check` | `(p_tenant_id uuid, p_business_unit_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_worker_executor` | Onboarding worker; API solicita execução via Command, worker executa |
| `tenant_core.command_activate_feature_by_plan` | `(p_tenant_id uuid, p_feature_key text, p_source tenant_feature_source, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Billing SaaS Command |

### 03.5 Políticas RLS

**Inventário RLS efetiva D03:** `platform.saas_trials`, `tenant_core.onboarding_flows`, `tenant_core.onboarding_steps`, `tenant_core.initial_data_seed_runs`, `tenant_core.feature_activation_flags`, `tenant_core.operational_readiness_checks` têm `RLS_ENABLED = SIM` na migration 006 antes de grants. [MB §6/D03][MB §10/Gate00]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `platform.saas_trials` | ALL | Platform context | Platform-only; sem RLS tenant |
| `tenant_core.onboarding_flows` | SELECT | tenant owner/admin/manager | tenant atual |
| `tenant_core.onboarding_steps` | SELECT | tenant owner/admin/manager | tenant atual por flow |
| `tenant_core.initial_data_seed_runs` | SELECT | tenant owner/admin | tenant atual |
| `tenant_core.feature_activation_flags` | SELECT | membro ativo | tenant atual; escrita bloqueada para tenant |
| `tenant_core.operational_readiness_checks` | SELECT | tenant owner/admin/manager | tenant atual |
| `tenant_core.*` | INSERT/UPDATE | Command trusted | Sem escrita direta por frontend |
| `platform.*`, `tenant_core.*` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito em objetos sensíveis |

### 03.6 Invariantes

1. Salão só opera após onboarding completo validado por gate interno. [MB §6/D03]
2. Seed inicial é idempotente por `idempotency_key`. [SKILL §4]
3. Feature activation deriva de plano/trial/concessão de plataforma; frontend não ativa feature. [MB §7]
4. Trial não substitui billing SaaS; conversão exige Domínio 04. [MB §6/D04]
5. Readiness não é número fake: toda checagem registra assertions. [MB §9/MOCKADO]

### 03.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `onboarding.trial_started` | `trial_id`, `lead_email`, `source` |
| `onboarding.flow_started` | `tenant_id`, `business_unit_id`, `flow_id` |
| `onboarding.step_completed` | `tenant_id`, `flow_id`, `step_key` |
| `onboarding.initial_seed_succeeded` | `tenant_id`, `business_unit_id`, `seed_run_id` |
| `onboarding.readiness_passed` | `tenant_id`, `business_unit_id`, `check_id` |
| `onboarding.readiness_failed` | `tenant_id`, `business_unit_id`, `check_id`, `failure_reasons` |
| `onboarding.feature_activated` | `tenant_id`, `feature_key`, `source` |

### 03.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 00 Platform Owner, 01 Identity & Tenant, 02 Business Setup Hub, 04 Billing & SaaS Finance |
| É dependência de | 05 People Hub, 06 Catalog, 07 Scheduling Engine, 08 Agenda Core |

### 03.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 00 — Foundation | Onboarding não libera operação sem setup mínimo, RLS e seed válido [MB §10/Gate00] |
| Gate 25 — Production Readiness | Observabilidade, rollback, segurança e dados controlados antes de operação real [MB §10/Gate25] |

### 03.10 RAGOV do domínio

**REAL / MVP obrigatório.** [MB §6/D03]

---

## Domínio 04 — Billing & SaaS Finance

### 04.1 Responsabilidade

O Domínio 04 é dono de planos e tiers SaaS, limites por plano, cobrança recorrente mensal/anual, upgrade, downgrade, dunning, inadimplência, notas fiscais para tenants e histórico financeiro do tenant no painel Platform Owner. Não é dono de checkout do salão, pagamentos de clientes finais, wallet de cliente, comissão de staff ou ledger operacional do tenant. [MB §6/D04][RM §5/D04]

### 04.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `platform.saas_plans` | Catálogo de planos SaaS | PK `id`; `plan_code text unique`; `tier saas_plan_tier`; `name`; `status saas_plan_status`; `billing_cycle billing_cycle`; `base_price_cents bigint`; `created_at`; `updated_at`; check preço >= 0 sob F0-01 | Platform writes; tenants leem via view/RPC segura |
| `platform.saas_plan_limits` | Limites por plano | PK `id`; FK `plan_id`; `limit_key`; `limit_value int`; `enforcement_mode plan_limit_enforcement`; unique `(plan_id, limit_key)` | Platform-only write; tenant read via feature flags |
| `platform.tenant_billing_accounts` | Conta de cobrança SaaS do tenant | PK `id`; FK `tenant_id` unique; `billing_email citext`; `document_number`; `status tenant_billing_account_status`; `created_at`; `updated_at` | Platform-only; tenant owner lê resumo via RPC |
| `platform.tenant_subscriptions` | Assinatura SaaS do tenant | PK `id`; FK `tenant_id`; FK `plan_id`; FK `billing_account_id`; `status tenant_subscription_status`; `billing_cycle`; `current_period_start`; `current_period_end`; `trial_ends_at`; `cancelled_at`; unique assinatura ativa por tenant | Platform-only write; tenant owner read-only via RPC |
| `platform.tenant_invoice_documents` | Documento fiscal/cobrança para tenant | PK `id`; FK `tenant_id`; FK `subscription_id`; `invoice_number`; `status tenant_invoice_status`; `amount_cents bigint`; `due_at`; `issued_at`; `paid_at`; `external_reference`; unique `(tenant_id, invoice_number)` | Platform-only; tenant owner read-only resumo |
| `platform.tenant_payment_attempts` | Tentativas de pagamento SaaS | PK `id`; FK `tenant_id`; FK `invoice_document_id`; `status tenant_payment_attempt_status`; `provider`; `provider_reference`; `attempted_amount_cents bigint`; `attempted_at`; `failure_code`; `failure_message`; indexes `(tenant_id, attempted_at desc)`, `(invoice_document_id, attempted_at desc)` | Platform-only; append-only |
| `platform.tenant_dunning_events` | Dunning e recuperação de inadimplência | PK `id`; FK `tenant_id`; FK `subscription_id`; FK `invoice_document_id`; `status tenant_dunning_status`; `step_key`; `scheduled_at`; `executed_at`; `result jsonb`; indexes `(tenant_id, scheduled_at)`, `(tenant_id, executed_at desc)`; append-only | Platform-only |
| `platform.tenant_plan_change_history` | Histórico de upgrade/downgrade | PK `id`; FK `tenant_id`; FK `from_plan_id`; FK `to_plan_id`; `reason tenant_plan_change_reason`; `effective_at`; `actor_platform_owner_id`; `request_id`; append-only | Platform-only; tenant owner lê resumo |

### 04.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `saas_plan_tier` | `free`, `starter`, `pro`, `enterprise` |
| `saas_plan_status` | `draft`, `active`, `retired` |
| `billing_cycle` | `monthly`, `annual` |
| `plan_limit_enforcement` | `soft_warning`, `hard_block`, `manual_review` |
| `tenant_billing_account_status` | `active`, `past_due`, `suspended`, `cancelled` |
| `tenant_subscription_status` | `trialing`, `active`, `past_due`, `suspended`, `cancelled`, `ended` |
| `tenant_invoice_status` | `draft`, `issued`, `paid`, `overdue`, `voided`, `refunded` |
| `tenant_payment_attempt_status` | `pending`, `authorized`, `captured`, `failed`, `cancelled`, `refunded` |
| `tenant_dunning_status` | `scheduled`, `sent`, `succeeded`, `failed`, `cancelled` |
| `tenant_plan_change_reason` | `trial_conversion`, `upgrade`, `downgrade`, `manual_platform_adjustment`, `dunning_recovery`, `cancellation` |

### 04.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `platform.command_create_saas_plan` | `(p_plan_code text, p_tier saas_plan_tier, p_name text, p_billing_cycle billing_cycle, p_base_price_cents bigint, p_limits jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Platform billing ops |
| `platform.command_create_tenant_billing_account` | `(p_tenant_id uuid, p_billing_email citext, p_document_number text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Platform billing ops / onboarding |
| `platform.command_activate_tenant_subscription` | `(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle billing_cycle, p_trial_ends_at timestamptz, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Platform billing ops / onboarding |
| `platform.command_change_tenant_plan` | `(p_tenant_id uuid, p_to_plan_id uuid, p_reason tenant_plan_change_reason, p_effective_at timestamptz, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Platform billing ops |
| `platform.command_issue_tenant_invoice` | `(p_tenant_id uuid, p_subscription_id uuid, p_amount_cents bigint, p_due_at timestamptz, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Billing worker |
| `platform.command_record_tenant_payment_attempt` | `(p_invoice_document_id uuid, p_status tenant_payment_attempt_status, p_provider text, p_provider_reference text, p_amount_cents bigint, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Billing worker |
| `platform.command_run_tenant_dunning_step` | `(p_tenant_id uuid, p_invoice_document_id uuid, p_step_key text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_worker_executor` | Billing worker |
| `platform.read_active_saas_plans_for_tenant` | `(p_tenant_id uuid, p_actor_user_id uuid) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_read_executor` | API backend para tenant owner/admin |
| `platform.read_tenant_billing_summary` | `(p_tenant_id uuid, p_actor_user_id uuid) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_read_executor` | API backend para tenant owner/admin |

**Pré-condições obrigatórias dos reads D04:** as RPCs de leitura recebem `p_actor_user_id` explicitamente, validam membership ativa desse usuário no `p_tenant_id` com papel `owner` ou `admin`, e recusam retorno se a membership estiver suspensa, revogada ou fora de escopo; retornam resumo e plano ativo, nunca tabela bruta de dunning, tentativa de pagamento ou dados sensíveis do provedor. [MB §6/D01][MB §6/D04][MB §7]

### 04.5 Políticas RLS

**Inventário RLS efetiva D04:** `platform.saas_plans`, `platform.saas_plan_limits`, `platform.tenant_billing_accounts`, `platform.tenant_subscriptions`, `platform.tenant_invoice_documents`, `platform.tenant_payment_attempts`, `platform.tenant_dunning_events`, `platform.tenant_plan_change_history` têm `RLS_ENABLED = SIM` na migration 004 antes de grants. [MB §6/D04][MB §10/Gate22]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `platform.saas_plans` | SELECT | Platform Owner; tenant owner via safe RPC | Tabela bruta platform-only; leitura tenant somente por `platform.read_active_saas_plans_for_tenant` |
| `platform.saas_plan_limits` | SELECT | Platform Owner; tenant owner via safe RPC | Tabela bruta platform-only; leitura tenant somente por `platform.read_active_saas_plans_for_tenant` |
| `platform.tenant_billing_accounts` | SELECT | Platform billing ops | Platform context obrigatório |
| `platform.tenant_subscriptions` | SELECT | Platform billing ops | Platform context obrigatório |
| `platform.tenant_invoice_documents` | SELECT | Platform billing ops | Platform context obrigatório |
| `platform.tenant_payment_attempts` | INSERT | Billing Command trusted | Sem INSERT direto |
| `platform.tenant_dunning_events` | INSERT | Billing worker trusted | Sem INSERT direto |
| `platform.tenant_*` | UPDATE | Command trusted | UPDATE direto negado; comandos registram audit/outbox |
| `platform.*` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |

### 04.6 Invariantes

1. Billing SaaS é CRÍTICO/REAL/MVP antes de aceitar tenant pago. [MB §6/D04]
2. Billing SaaS não se mistura com checkout, pagamentos, wallet ou comissão do tenant. [MB §6/D04][RM §5/D04]
3. Dunning altera acesso do tenant apenas por Command auditável. [MB §6/D04][MB §7]
4. Tenant não escreve diretamente plano, assinatura, invoice ou dunning. [MB §7]
5. Campos monetários usam `_cents bigint` sob DECISÃO PENDENTE F0-01, com ratificação final no Bloco D. [RM §7]

### 04.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `billing.plan_created` | `plan_id`, `plan_code`, `tier` |
| `billing.subscription_activated` | `tenant_id`, `subscription_id`, `plan_id` |
| `billing.plan_changed` | `tenant_id`, `from_plan_id`, `to_plan_id`, `reason` |
| `billing.invoice_issued` | `tenant_id`, `invoice_document_id`, `amount_cents`, `due_at` |
| `billing.payment_attempt_recorded` | `tenant_id`, `invoice_document_id`, `status` |
| `billing.dunning_step_executed` | `tenant_id`, `invoice_document_id`, `step_key`, `status` |
| `billing.tenant_suspended_for_dunning` | `tenant_id`, `invoice_document_id`, `reason` |

### 04.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 00 Platform Owner, 01 Identity & Tenant |
| É dependência de | 03 Onboarding SaaS, 23 CoPilot Revenue Engine, 25 Analytics, 31 Governance |

### 04.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 22 — Platform Owner Isolation | Platform Owner não compartilha RLS com tenant; billing e dunning funcionais [MB §10/Gate22] |
| Gate 00 — Foundation | Funções críticas, RLS e integridade inicial prontos [MB §10/Gate00] |

### 04.10 RAGOV do domínio

**CRÍTICO / REAL / MVP obrigatório antes de aceitar tenant pago.** [MB §6/D04]

---

## 6. Mapa de relações inter-domínios do Bloco A

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| 00 | 01 | `platform.platform_tenant_registry.tenant_id` → `tenant_core.tenants.id` | Platform registra tenant sem usar RLS tenant [MB §6/D00] |
| 01 | 02 | `tenant_core.*.tenant_id` → `tenant_core.tenants.id` | Setup sempre tenant-scoped [MB §6/D02] |
| 01 | 03 | onboarding usa `tenant_id` e `business_unit_id` | Onboarding só valida tenant/unidade existente [MB §6/D03] |
| 01 | 04 | billing usa `tenant_id` em schema platform | Billing SaaS é Platform Owner, não tenant runtime [MB §6/D04] |
| 02 | 03 | setup validation alimenta readiness | Salão só opera após readiness validado [MB §6/D03] |
| 04 | 03 | plano ativa features | Feature activation deriva de plano/trial [MB §6/D03][MB §6/D04] |

---

## 7. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gate secundário | Critério bloqueante |
|---:|---:|---|---|---|
| 00 | 002 | Gate 22 | Gate 00 | Platform Owner isolado de tenant |
| 01 | 003 | Gate 01 | Gate 00 | Tenant A não acessa Tenant B |
| 02 | 005 | Gate 00 | Gate 01 | Setup respeita RLS e não executa regra crítica fora de Command |
| 03 | 006 | Gate 00 | Gate 25 | Onboarding não libera operação sem readiness |
| 04 | 004 | Gate 22 | Gate 00 | Billing/dunning funcionam sem RLS tenant |

---

## 8. Ordem única de execução de migrations do Bloco A v2.1

1. `001_shared_foundation.sql` — cria schemas `shared`, `platform`, `tenant_core`; extensões `pgcrypto`, `btree_gist`, `citext`; enums globais; helpers; bootstrap idempotente dos roles técnicos por verificação prévia em catálogo de roles; default revokes; `shared.outbox_events`; `shared.command_idempotency_keys` com colunas completas. [SKILL §4][MB §7]
2. `002_platform_owner_layer.sql` — cria tabelas e Commands do Domínio 00; `platform.platform_tenant_registry.tenant_id` é coluna obrigatória sem FK física nesta migration; esta migration não pode ser usada como ponto de parada operacional com escrita real habilitada. [MB §6/D00][SKILL §7]
3. `003_identity_tenant.sql` — cria tenant, unidade, membership, contexto e RLS do Domínio 01; nesta migration é materializada a FK física `platform_tenant_registry.tenant_id` → `tenant_core.tenants.id`, porque os dois lados já existem. [MB §6/D01][SKILL §7]
4. `004_billing_saas_finance.sql` — planos, assinaturas, invoices, attempts, dunning, índices críticos e RPCs seguras de leitura. [MB §6/D04]
5. `005_business_setup_hub.sql` — perfil operacional, horários, políticas, métodos aceitos, checklist e validações. [MB §6/D02]
6. `006_onboarding_saas.sql` — trial, flows, steps, seed, flags e readiness. [MB §6/D03]

**Invariante de execução:** nenhuma migration cria FK para relação inexistente; nenhuma política RLS é considerada válida sem `RLS_ENABLED = SIM`; nenhum Command do Bloco A é liberado sem grant explícito a role técnico nomeado; migrations 002 e 003 são pacote operacional indivisível para ambientes com escrita real, e `command_create_tenant_registry_entry` permanece bloqueado para uso real até a FK física existir. [MB §7][SKILL §7]

## 9. Estratégia de rollback do Bloco A

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 001 | Reverter grants/revokes, roles técnicos e helpers em sandbox antes de dados reais; pausar outbox sem apagar eventos | Remover `shared.outbox_events`, tipos ou idempotency keys usados por migrations posteriores com dados reais |
| 002 | Desativar operadores por status; reverter objetos platform sem tenants reais | Apagar `platform_audit_logs` |
| 003 | Suspender tenant/membership por status; reverter em sandbox antes de tenants reais | DELETE físico de tenants, memberships ou audit logs |
| 004 | Cancelar assinatura por status; emitir evento de reversão administrativa | Apagar invoices, attempts ou dunning events |
| 005 | Marcar checklist/política como substituída por nova versão | Apagar histórico de validação |
| 006 | Marcar flow como `blocked` ou `rolled_back`; criar novo seed_run idempotente | Apagar seed_run/readiness histórico |

---

## 10. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| Schema `platform` separado | REAL | Exigido por isolamento Platform Owner | [MB §6/D00][RM §2] |
| Schema `tenant_core` separado | REAL | Base de RLS tenant e contexto `hope.tenant_id` | [MB §6/D01][RM §2] |
| `shared` sem linhas de negócio | REAL | Reduz duplicidade e preserva Single Source of Truth | [SKILL §4][RM §1] |
| `payment_method_configs` removido como fonte ativa | REAL | Funde em `payment_methods` para evitar dupla verdade | [RM §4 #13][RM §6] |
| Billing SaaS em `platform` | REAL | Billing de tenants pertence ao Platform Owner | [MB §6/D04] |
| Valores `_cents bigint` em Billing SaaS | DECISÃO PENDENTE F0-01 | Proposta aplicada no desenho, ratificação final no Bloco D | [RM §7] |
| DELETE físico em dados críticos | BLOQUEADO | História e auditoria precisam permanecer reconstruíveis | [MB §7][SKILL §4] |
| Role executor concreto | REAL | Commands têm GRANT apenas para `app_backend_command_executor`; reads sensíveis para `app_backend_read_executor`; workers para `app_worker_executor` | [MB §7][SKILL §4] |
| `shared.outbox_events` na migration 001 | REAL | Bloco A emite eventos desde o primeiro Command e D30 expande a mesma tabela futuramente | [MB §7][RM §4 #97][RM §5/D30] |
| FK `platform_tenant_registry` materializada na migration 003 | REAL | Evita FK cross-schema antes da existência da tabela-alvo | [SKILL §7][MB §11] |
| `RLS_ENABLED = SIM` por tabela | REAL | Políticas sem RLS efetiva são inválidas para Gate 00/01/22 | [MB §7][MB §10] |

---

## 11. Reflexion contra Definition of Done do Bloco A v2.1

| Item verificado | Resultado | Correção aplicada na v2.1 |
|---|---|---|
| Domínios 00–04 têm os 10 blocos obrigatórios | SIM | Template preservado para D00–D04 |
| Toda tabela tem RLS especificada | SIM | Inventário `RLS_ENABLED = SIM` adicionado em 00.5–04.5 e para `shared.outbox_events` |
| RLS real, não apenas política declarada | SIM | Convenção nova exige RLS efetiva antes de grants e gates |
| Funções críticas têm SECURITY, REVOKE e GRANT concreto | SIM | Roles `app_backend_command_executor`, `app_backend_read_executor`, `app_worker_executor` definidos, com bootstrap idempotente e grants por função |
| Todo Command de mutação tem idempotência | SIM | `command_open_support_ticket` recebeu `p_idempotency_key`; `shared.command_idempotency_keys` ganhou colunas completas e status técnico |
| Workers usam role correto | SIM | `command_run_initial_seed` e `command_run_operational_readiness_check` usam `app_worker_executor` |
| Contexto Platform Owner é validado | SIM | `command_set_platform_context` valida operador ativo e `auth_user_id` |
| Ordem de migrations evita dependência circular | SIM | FK `platform_tenant_registry` é materializada na migration 003; 002→003 é pacote operacional indivisível para escrita real |
| Outbox existe antes dos Commands que emitem eventos | SIM | `shared.outbox_events` criada na migration 001; D30 expande a mesma tabela futuramente |
| Safe RPCs referenciadas em Billing existem | SIM | `read_active_saas_plans_for_tenant` e `read_tenant_billing_summary` recebem `p_actor_user_id` e validam membership ativa owner/admin |
| Read model monetário tem fonte reconstruível | SIM | `platform_health_snapshots.mrr_cents` declara fontes e modo append-only |
| LGPD mínima em `user_profiles` | SIM | Permission key `identity.user_profile.read_sensitive` explicitada |
| Índices de billing append-only | SIM | Índices críticos adicionados em attempts e dunning |
| Todo domínio CRÍTICO está mapeado a gate | SIM | Domínios 00,01,02,03,04 mapeados a Gate 00, 01, 22 e 25 |
| Rollback documentado por migration | SIM | Rollback 001 reforçado para roles/outbox |
| Zero termos proibidos sem decisão pendente numerada | SIM | F0-01 mantida; F0-02, A-01 e A-02 resolvidas formalmente |
| Platform Owner isolado desde a fundação | SIM | `platform` + `hope.platform_owner_id`; `tenant_core` + `hope.tenant_id` |
| Recorrente e Grupo | FORA DO BLOCO A | Será tratado no Bloco C por ordem canônica [SKILL §6] |
| Fiscal e LGPD completo | FORA DO BLOCO A | D26 será tratado no Bloco I; Bloco A só fixa permission key mínima para dado pessoal [SKILL §6] |

**Falhas Red Team absorvidas:** v1: C-01, C-02, C-03, C-04, D-01, D-02, D-03, D-04, F-01 e G-01; v2: C-05, D-05, C-04, N-01 e N-02. Todas foram tratadas em documento completo e autônomo.  
**Limite explícito:** este arquivo não declara o Blueprint 31/31 pronto; declara somente o Bloco A v2.1 pronto para continuidade, respeitando a criação sequencial. [SKILL §6]

Bloco A v2.1 aprovado com ressalvas absorvidas, pronto para servir de fundação do Bloco B.

Pronto para auditoria Red Team.

---

## ANEXO B — SMART_FLOW_3_0_BLUEPRINT_BLOCO_B_v2_1.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco B v2.1

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco B — Domínios 05, 06, 11  
**Status:** APROVADO COM RESSALVA RED TEAM DO BLOCO B v2 — N-01 ABSORVIDA  
**Data:** 2026-06-10  
**Fundação aprovada:** `SMART_FLOW_3_0_BLUEPRINT_BLOCO_A_v2_1.md`  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §0–§8]

---

## 0. Regra de autoridade e versão

1. O Master Brief 3.0 decide visão, domínios, limites e gates; documentos anteriores são insumo, não autoridade. [MB §0]
2. O Bloco A v2.1 foi aprovado pelo Red Team e é a fundação para o Bloco B. [SKILL §6]
3. O Bloco B cobre os domínios 05, 06 e 11 porque a skill define Bloco B como People, Catalog e Resources. [SKILL §6]
4. Backend é a única fonte da verdade; frontend não calcula duração, preço, capacidade, permissão, disponibilidade ou regra de conflito. [MB §7]
5. RLS é real, efetiva e obrigatória em toda tabela tenant-scoped. [MB §7][MB §10/Gate01]
6. Escrita crítica segue API → Command → DB Transaction → Audit/Outbox → Projection. [MB §7]
7. Nenhuma tabela deste bloco cria saldo, comissão calculada, wallet, benefício, pagamento, checkout ou ledger paralelo. [MB §7][RM §6]
8. Nenhum módulo de estoque é autorizado; produtos existem como itens comerciais para venda/cross-sell, não como inventário. [RM §4 #31]
9. Resource Orchestration cria o catálogo e regras de recursos físicos; locks vinculados a atendimento entram nos blocos de agenda, quando `appointments` existir. [MB §6/D11][RM §4 #40]

---

## 1. Escopo do Bloco B

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| B | 05 | People Hub | Especificado | [MB §6/D05][RM §4 #15–#19][RM §4 #100][RM §5/D05] |
| B | 06 | Catalog & Offer Hub | Especificado | [MB §6/D06][RM §4 #22–#34][RM §5/D06] |
| B | 11 | Resource Orchestration | Especificado | [MB §6/D11][RM §4 #35][RM §4 #40][RM §5/D11] |

---

## 2. Decisões herdadas e decisões do Bloco B

### 2.1 Decisões herdadas do Bloco A v2.1

| Decisão | Uso no Bloco B | Fonte |
|---|---|---|
| Schemas `platform`, `tenant_core`, `shared` | D05, D06 e D11 usam `tenant_core`; `shared.outbox_events` e `shared.command_idempotency_keys` são reutilizadas | [MB §6/D01][RM §2][SKILL §4] |
| Roles técnicos concretos | Commands usam `app_backend_command_executor`; leituras sensíveis usam `app_backend_read_executor`; workers usam `app_worker_executor` | [MB §7][SKILL §4] |
| RLS efetiva | Toda tabela deste bloco declara `RLS_ENABLED = SIM` antes de grants | [MB §7][MB §10/Gate01] |
| Outbox fundacional | Eventos deste bloco são emitidos em `shared.outbox_events`, sem criar fila paralela | [MB §7][RM §4 #97] |
| Idempotência fundacional | Todo Command de mutação usa `p_idempotency_key` e registra `shared.command_idempotency_keys` | [SKILL §4] |

### 2.2 DECISÃO PENDENTE F0-01 — valores monetários em centavos

**Origem:** o Reuse Map manteve pendente a ratificação final de `BIGINT` em centavos para valores monetários no Bloco D. [RM §7]  
**Aplicação provisória no Bloco B:** campos de preço, custo, yield e penalidade comercial usam sufixo `_cents bigint`; taxas e percentuais usam `numeric`. A ratificação final permanece no Bloco D. [RM §7]

### 2.3 Decisão B-01 — produtos sem controle de estoque

**Regra canônica:** o Master Brief 3.0 autoriza produtos e add-ons no catálogo, mas o Reuse Map remove `product_stock_snapshots` porque controle de estoque não está autorizado. [MB §6/D06][RM §4 #31]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Produtos como itens comerciais sem estoque, com preço/custo e status comercial | Alta: não cria saldo físico nem financeiro | Alta: tenant-scoped | Baixo: inventário futuro pode ser domínio novo se autorizado | Alta |
| B | Manter `stock_tracking_enabled` legado sem snapshots | Média: campo sugere fluxo inexistente | Alta | Médio: gera dívida sem módulo dono | Média |
| C | Criar inventário mínimo agora | Baixa: feature ausente do Master Brief | Média | Alto: cria domínio não autorizado | Baixa |

**Escolha:** Alternativa A.  
Justificativa: preserva produto como oferta comercial autorizada sem inventar inventário. [MB §6/D06]  
Elimina dupla verdade de estoque e respeita o REMOVE do Reuse Map. [RM §4 #31][RM §6]  
Mantém checkout futuro livre para vender item comercial sem depender de saldo físico inexistente. [MB §7]

**Descartes:**  
- Alternativa B descartada porque um campo de estoque sem domínio executor vira promessa falsa. [MB §9/MOCKADO]  
- Alternativa C descartada porque inventário não está no Master Brief 3.0. [MB §0][RM §4 #31]

### 2.4 Decisão B-02 — preservar `component_work_type` legado por KEEP do Reuse Map

**Origem da correção:** a auditoria Red Team do Bloco B v1 classificou como F-ESTRUTURAL o redesenho do enum `component_work_type` sem decisão formal.  
**Regra vinculante:** `service_chain_components` foi classificada como KEEP no Reuse Map por ser compatível com Chain Booking e pausas operacionais. [RM §4 #28]

**Decisão final:** o Bloco B v2 preserva os valores legados de `component_work_type`: `prep_before`, `active_execution`, `chemical_pause`, `wash_and_treatment`, `finishing`, `cleanup_after`, `assistant_execution`, `simultaneous_service`. [RM §4 #28]

**Justificativa:**  
1. `chemical_pause` e `simultaneous_service` são semânticas operacionais necessárias para Chain Booking futuro; removê-las quebraria o Gate 05. [MB §10/Gate05][RM §4 #28]  
2. Preservar o enum evita migração de dados com mapeamento artificial ou perda de semântica. [RM §1][RM §4 #28]  
3. Novos valores só poderão ser adicionados em bloco futuro mediante decisão formal, sem remover compatibilidade legada. [SKILL §7]

---

## 3. Convenções canônicas do Bloco B

| Item | Regra | Fonte |
|---|---|---|
| Schema | Todas as tabelas D05, D06 e D11 ficam em `tenant_core` | [MB §6/D01][RM §2] |
| Tenant context | Toda tabela tenant-scoped tem `tenant_id uuid not null` e RLS por `hope.tenant_id` | [RM §2][MB §10/Gate01] |
| Business unit | Dados operacionais configuráveis por unidade têm `business_unit_id uuid` quando a granularidade for de unidade | [MB §6/D02][MB §6/D06] |
| RLS efetiva | `RLS_ENABLED = SIM` obrigatório antes de grants | [MB §7] |
| REVOKE | Tabelas e funções sensíveis recebem `REVOKE ALL ... FROM PUBLIC, anon, authenticated` | [SKILL §4] |
| Commands | Toda mutação usa `SECURITY DEFINER`, valida tenant/membership/permissão e exige `p_idempotency_key` | [MB §7][SKILL §4] |
| Leitura sensível | Dados pessoais, notas sensíveis, consentimentos e billing-adjacent reads usam `app_backend_read_executor` | [MB §7][MB §10/Gate02] |
| Preço e duração | Preço base, preço por unidade/profissional e duração nunca são hardcoded | [MB §6/D06] |
| Produtos | Produto é item comercial; não há estoque, snapshot de estoque, reserva de estoque ou baixa de inventário | [RM §4 #31] |
| Staff financeiro | D05 armazena configuração operacional de perfil/visibilidade; cálculo de comissão, conta corrente, wallet e ledger ficam fora do Bloco B | [MB §6/D05][MB §7] |
| Recursos físicos | D11 cadastra recursos, capacidades, manutenção e requisitos; bloqueio por atendimento é dependência futura da agenda | [MB §6/D11][RM §4 #40] |
| Monetary fields | Sufixo `_cents bigint` sob F0-01; percentuais em `numeric(7,4)` | [RM §7] |
| Audit | Overrides, notas sensíveis, consentimentos e permissões geram audit log/outbox | [MB §7][MB §26] |
| Nota sensível | `client_notes.note`, `visibility` e `sensitivity` são conteúdo imutável; correção cria nova nota com `supersedes_note_id` | [MB §26][MB §7] |
| Constraints de conflito | Janelas de trabalho, disponibilidade de recurso e manutenção de recurso têm constraints de não-sobreposição no banco | [MB §7][MB §10/Gate04] |

---

## 4. Mapa Bloco B — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 007 | `tenant_core` | 05 | Staff, clientes, consentimentos, notas imutáveis, versões/supersessão, preferências, vínculos e auditoria sensível | Gate 02 / Gate 01 [MB §10] |
| 008 | `tenant_core` | 06 | Categorias, serviços, preços, produtos comerciais, add-ons, combos e ofertas | Gate 00 / Gate 10 futuro [MB §10] |
| 009 | `tenant_core` | 05/06 | Vínculo staff-serviço e regras comerciais que dependem de staff + catálogo | Gate 02 / Gate 00 [MB §10] |
| 010 | `tenant_core` | 11 | Recursos físicos, capacidades, disponibilidade, manutenção e requisitos por serviço | Gate 04 / Gate 05 futuro [MB §10] |

---

## 5. Especificação por domínio

## Domínio 05 — People Hub

### 05.1 Responsabilidade

O Domínio 05 é dono de staff, clientes, consentimentos operacionais, preferências operacionais, notas, vínculos cliente-profissional, permissões sensíveis de pessoas, horários de staff e configuração operacional de comissão sem cálculo financeiro. Não é dono de ledger, wallet, saldo de conta corrente, pagamento, checkout, comissão calculada, agenda executada, CRM de segmentação ou portal do cliente. [MB §6/D05][MB §7][RM §4 #15–#19][RM §4 #100]

### 05.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.staff_profiles` | Cadastro operacional de profissional | PK `id uuid`; FK `tenant_id`; FK `business_unit_id`; FK `user_profile_id` nullable; FK `membership_id` nullable; `display_name text`; `legal_name text`; `email citext`; `phone text`; `document_number text`; `status staff_status`; `contract_kind staff_contract_kind`; `can_receive_appointments boolean`; `can_receive_online_booking boolean`; `financial_visibility_scope staff_financial_visibility_scope`; `color_token text`; `metadata jsonb`; `created_at`; `updated_at`; `archived_at`; unique ativo `(tenant_id, business_unit_id, display_name)`; index `(tenant_id,status)` | Tenant atual; leitura por `people.staff.read`; escrita por Command com `people.staff.write` |
| `tenant_core.staff_working_hours` | Janelas de trabalho do profissional | PK `id`; FK `tenant_id`; FK `staff_id`; FK `business_unit_id`; `weekday int check 0..6`; `starts_at time`; `ends_at time`; `is_available boolean`; `valid_from date`; `valid_until date`; check `starts_at < ends_at`; check validade; constraint de não-sobreposição por `(tenant_id, staff_id, weekday)` usando intervalo de datas de vigência + minutos do dia; index `(tenant_id, staff_id, weekday)` | Tenant atual; escrita por Command com `people.staff.schedule.write` |
| `tenant_core.staff_compensation_settings` | Configuração operacional de regra de comissão atribuída ao staff, sem cálculo e sem saldo | PK `id`; FK `tenant_id`; FK `staff_id`; `compensation_mode staff_compensation_mode`; `default_commission_rate numeric(7,4)`; `effective_from date`; `effective_until date`; `reason text`; `created_by uuid`; `created_at`; check período válido; unique ativo `(tenant_id, staff_id, effective_from)` | SELECT direto somente owner/admin/auditor; staff lê resumo próprio exclusivamente via `read_staff_private_summary` |
| `tenant_core.clients` | Cadastro operacional de cliente | PK `id`; FK `tenant_id`; FK `business_unit_id`; `display_name text`; `legal_name text`; `email citext`; `phone text`; `birth_date date`; `document_number text`; `status client_status`; `preferred_staff_id uuid`; `metadata jsonb`; `created_at`; `updated_at`; `archived_at`; unique parcial por `(tenant_id, phone)` quando presente; index `(tenant_id,status)` | Tenant atual; leitura por `people.client.read`; dados sensíveis por `people.client.read_sensitive` |
| `tenant_core.client_consents` | Consentimentos operacionais e LGPD do cliente | PK `id`; FK `tenant_id`; FK `client_id`; `consent_kind client_consent_kind`; `status consent_status`; `channel consent_channel`; `granted_at`; `revoked_at`; `evidence_hash text`; `source text`; `created_at`; unique ativo `(tenant_id, client_id, consent_kind)` | Leitura por `people.client.read_sensitive`; escrita por Command; append-only lógico por nova linha/revogação |
| `tenant_core.client_notes` | Notas operacionais sobre cliente com conteúdo imutável | PK `id`; FK `tenant_id`; FK `client_id`; FK `supersedes_note_id` nullable → `client_notes.id`; `note text`; `visibility client_note_visibility`; `sensitivity client_note_sensitivity`; `created_by uuid`; `created_at`; `archived_at`; trigger bloqueia UPDATE de `note`, `visibility` e `sensitivity`; correção cria nova linha com `supersedes_note_id`; index `(tenant_id,client_id,created_at desc)` | Leitura por visibilidade + permissão; notas sensíveis exigem `people.client.note_sensitive.read`; escrita por Command append-only |
| `tenant_core.client_preferences` | Preferências operacionais usadas por atendimento e agenda futura | PK `id`; FK `tenant_id`; FK `client_id`; `preferred_staff_id uuid`; `preferred_weekday int check 0..6`; `preferred_shift client_preferred_shift`; `preferred_service_ids uuid[]`; `notes text`; `preference_source client_preference_source`; `created_at`; `updated_at`; unique `(tenant_id,client_id)` | Tenant atual; escrita por Command; CRM não escreve segmentação aqui |
| `tenant_core.client_professional_links` | Vínculo explícito cliente ↔ profissional preferido | PK `id`; FK `tenant_id`; FK `client_id`; FK `staff_id`; `link_kind client_professional_link_kind`; `status client_professional_link_status`; `reason text`; `created_by`; `created_at`; `ended_at`; unique ativo `(tenant_id,client_id,staff_id,link_kind)` | Tenant atual; leitura por staff envolvido e gestores autorizados |
| `tenant_core.staff_permission_audit_events` | Auditoria de permissões sensíveis de staff | PK `id`; FK `tenant_id`; FK `staff_id`; FK `membership_id`; `permission_key text`; `before_allowed boolean`; `after_allowed boolean`; `reason text`; `actor_user_id uuid`; `request_id text`; `created_at`; trigger bloqueia UPDATE/DELETE | Owner/admin/auditor; append-only |
| `tenant_core.sensitive_client_access_logs` | Log de acesso a dados sensíveis de cliente | PK `id`; FK `tenant_id`; FK `client_id`; `actor_user_id uuid`; `access_reason sensitive_access_reason`; `fields_accessed text[]`; `request_id text`; `created_at`; trigger bloqueia UPDATE/DELETE; index `(tenant_id,client_id,created_at desc)` | Owner/admin/auditor; append-only; staff não apaga nem altera |

### 05.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `staff_status` | `active`, `inactive`, `on_leave`, `suspended`, `archived` |
| `staff_contract_kind` | `employee`, `partner_professional`, `freelancer`, `company_owner`, `external_provider` |
| `staff_financial_visibility_scope` | `own_only`, `unit_summary_no_private_values`, `manager_operational`, `owner_full` |
| `staff_compensation_mode` | `none`, `fixed_rate`, `service_rate`, `rule_profile`, `external_contract` |
| `client_status` | `active`, `inactive`, `blocked`, `archived` |
| `client_consent_kind` | `lgpd_processing`, `marketing_whatsapp`, `appointment_reminder`, `crm_retention`, `public_portal_access` |
| `consent_status` | `granted`, `revoked`, `expired` |
| `consent_channel` | `in_person`, `whatsapp`, `web`, `admin_import`, `system_migration` |
| `client_note_visibility` | `owner_only`, `manager`, `assigned_staff`, `all_staff` |
| `client_note_sensitivity` | `normal`, `sensitive`, `restricted` |
| `client_preferred_shift` | `morning`, `afternoon`, `evening`, `any` |
| `client_preference_source` | `staff_recorded`, `client_declared`, `imported`, `system_inferred_pending_approval` |
| `client_professional_link_kind` | `preferred`, `restricted`, `requires_approval`, `do_not_assign` |
| `client_professional_link_status` | `active`, `paused`, `ended` |
| `sensitive_access_reason` | `service_execution`, `client_support`, `manager_review`, `lgpd_request`, `audit` |

### 05.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_staff_profile` | `(p_tenant_id uuid, p_business_unit_id uuid, p_display_name text, p_email citext, p_phone text, p_contract_kind staff_contract_kind, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_update_staff_profile` | `(p_staff_id uuid, p_patch jsonb, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_configure_staff_working_hours` | `(p_staff_id uuid, p_business_unit_id uuid, p_hours jsonb, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_set_staff_compensation_settings` | `(p_staff_id uuid, p_compensation_mode staff_compensation_mode, p_default_commission_rate numeric, p_effective_from date, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_create_client` | `(p_tenant_id uuid, p_business_unit_id uuid, p_display_name text, p_phone text, p_email citext, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Reception/manager Command |
| `tenant_core.command_update_client` | `(p_client_id uuid, p_patch jsonb, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Authorized staff Command |
| `tenant_core.command_record_client_consent` | `(p_client_id uuid, p_consent_kind client_consent_kind, p_status consent_status, p_channel consent_channel, p_evidence_hash text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Authorized staff/API Command |
| `tenant_core.command_add_client_note` | `(p_client_id uuid, p_note text, p_visibility client_note_visibility, p_sensitivity client_note_sensitivity, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Authorized staff Command |
| `tenant_core.command_replace_client_note` | `(p_note_id uuid, p_new_note text, p_new_visibility client_note_visibility, p_new_sensitivity client_note_sensitivity, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Authorized staff Command; cria nova nota e preserva a anterior |
| `tenant_core.command_link_client_professional` | `(p_client_id uuid, p_staff_id uuid, p_link_kind client_professional_link_kind, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/reception Command |
| `tenant_core.read_sensitive_client_profile` | `(p_actor_user_id uuid, p_client_id uuid, p_access_reason sensitive_access_reason, p_fields text[]) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_read_executor` | Backend read API |
| `tenant_core.read_staff_private_summary` | `(p_actor_user_id uuid, p_staff_id uuid) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_read_executor` | Backend read API |

**Pré-condições obrigatórias das leituras sensíveis D05:**

| Função | Pré-condições transacionais |
|---|---|
| `tenant_core.read_sensitive_client_profile` | Valida `p_actor_user_id` como membership ativa no tenant atual; exige permissão compatível com `p_fields` e `p_access_reason`; registra `tenant_core.sensitive_client_access_logs` na mesma transação antes de retornar qualquer campo sensível; retorna apenas campos autorizados. [MB §26][MB §7] |
| `tenant_core.read_staff_private_summary` | Valida membership ativa de `p_actor_user_id`; permite owner/admin/auditor com permissão `people.staff.financial_private.read`; permite staff próprio somente quando `staff_profiles.user_profile_id = p_actor_user_id` no tenant atual; staff sem `user_profile_id` não tem leitura própria até vínculo de identidade existir; nunca retorna dados de outro staff para papel staff. [MB §10/Gate02][MB §7] |

### 05.5 Políticas RLS

**Inventário RLS efetiva D05:** `tenant_core.staff_profiles`, `tenant_core.staff_working_hours`, `tenant_core.staff_compensation_settings`, `tenant_core.clients`, `tenant_core.client_consents`, `tenant_core.client_notes`, `tenant_core.client_preferences`, `tenant_core.client_professional_links`, `tenant_core.staff_permission_audit_events`, `tenant_core.sensitive_client_access_logs` têm `RLS_ENABLED = SIM` na migration 007 antes de grants. [MB §7][MB §10/Gate01]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.staff_profiles` | SELECT | membro ativo com `people.staff.read` | `tenant_id = current_setting('hope.tenant_id', true)::uuid` e membership ativa |
| `tenant_core.staff_profiles` | INSERT/UPDATE | Command trusted | Sem escrita direta; Command valida `people.staff.write` |
| `tenant_core.staff_working_hours` | SELECT | membro ativo | Tenant atual; staff lê próprio horário; gestores leem unidade |
| `tenant_core.staff_working_hours` | INSERT/UPDATE | Command trusted | Valida `people.staff.schedule.write` |
| `tenant_core.staff_compensation_settings` | SELECT | owner/admin/auditor direto; staff via RPC | Predicado direto: tenant atual + membership ativa com `people.staff.financial_private.read`; staff sem permissão não lê tabela bruta; leitura própria de staff ocorre só por `read_staff_private_summary`, que valida `staff_profiles.user_profile_id = p_actor_user_id` |
| `tenant_core.clients` | SELECT | membro com `people.client.read` | Tenant atual; campos sensíveis só via RPC segura |
| `tenant_core.clients` | INSERT/UPDATE | Command trusted | Valida `people.client.write` e registra audit/outbox |
| `tenant_core.client_consents` | SELECT | membro com `people.client.read_sensitive` | Tenant atual; leitura sensível registra contexto quando exposta via RPC |
| `tenant_core.client_notes` | SELECT | papel autorizado por visibilidade | `restricted` exige `people.client.note_sensitive.read` |
| `tenant_core.client_notes` | INSERT/arquivamento | Command trusted | Valida `people.client.note.write`; `note`, `visibility` e `sensitivity` são imutáveis; substituição usa `command_replace_client_note` e cria nova linha com `supersedes_note_id` |
| `tenant_core.client_professional_links` | SELECT | gestor ou staff envolvido | Tenant atual + envolvimento no vínculo ou permissão gerencial |
| `tenant_core.staff_permission_audit_events` | SELECT | owner/admin/auditor | Tenant atual; append-only |
| `tenant_core.sensitive_client_access_logs` | SELECT | owner/admin/auditor | Tenant atual; append-only |
| `tenant_core.* D05` | DELETE | Todos | DELETE físico negado; usar status/archived_at |
| `tenant_core.* D05` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |

### 05.6 Invariantes

1. Staff vê apenas o próprio financeiro privado por `read_staff_private_summary`; tabela bruta de configuração financeira não é leitura direta de staff. [MB §10/Gate02]
2. D05 não calcula comissão, não lança conta corrente e não cria saldo. [MB §7]
3. Configuração de comissão em D05 é insumo operacional; cálculo e lançamento pertencem ao Domínio 17. [MB §6/D05][MB §7]
4. Consentimento de cliente é governado, auditável e revogável. [MB §26]
5. Acesso a dados sensíveis de cliente gera log transacional em `sensitive_client_access_logs` antes de retornar dados. [MB §26][MB §7]
6. Conteúdo de `client_notes` é imutável; correção ou substituição preserva a nota anterior por `supersedes_note_id`. [MB §26][MB §7]
7. Preferência operacional de cliente não substitui CRM nem portal do cliente. [RM §4 #100]
8. Vínculo cliente-profissional não cria disponibilidade, agenda ou bloqueio. [MB §6/D07][MB §6/D08]

### 05.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `people.staff_created` | `tenant_id`, `staff_id`, `business_unit_id`, `request_id` |
| `people.staff_updated` | `tenant_id`, `staff_id`, `reason`, `request_id` |
| `people.staff_working_hours_configured` | `tenant_id`, `staff_id`, `business_unit_id`, `request_id` |
| `people.staff_compensation_settings_changed` | `tenant_id`, `staff_id`, `effective_from`, `reason` |
| `people.client_created` | `tenant_id`, `client_id`, `business_unit_id`, `request_id` |
| `people.client_updated` | `tenant_id`, `client_id`, `reason`, `request_id` |
| `people.client_consent_recorded` | `tenant_id`, `client_id`, `consent_kind`, `status` |
| `people.client_note_added` | `tenant_id`, `client_id`, `note_id`, `sensitivity` |
| `people.client_note_replaced` | `tenant_id`, `client_id`, `old_note_id`, `new_note_id`, `reason` |
| `people.client_professional_linked` | `tenant_id`, `client_id`, `staff_id`, `link_kind` |
| `people.sensitive_client_accessed` | `tenant_id`, `client_id`, `actor_user_id`, `access_reason` |

### 05.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01 Identity & Tenant; 02 Business Setup Hub |
| É dependência de | 06 Catalog & Offer Hub, 07 SMART Scheduling Engine, 08 Agenda Core, 12 Checkout Core, 17 Compensation Engine, 19 Client Experience Hub, 24 Retention & CRM Engine |

### 05.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 02 — Staff Privacy | Staff só vê próprio financeiro privado; gestores só veem o que o papel autoriza [MB §10/Gate02] |
| Gate 01 — Tenant Isolation | Staff, clientes, consentimentos e notas de Tenant A não vazam para Tenant B [MB §10/Gate01] |
| Gate 21 — Fiscal & LGPD Compliance futuro | Consentimentos, revogação e logs sensíveis serão revalidados no Domínio 26 [MB §10/Gate21] |

### 05.10 RAGOV do domínio

**REAL / MVP.** [MB §6/D05]

---

## Domínio 06 — Catalog & Offer Hub

### 06.1 Responsabilidade

O Domínio 06 é dono de serviços, categorias, duração, preço base, preço por profissional/unidade/período, produtos comerciais sem estoque, add-ons, combos, componentes de serviços compostos, yield profile e regras de oferta por unidade. Não é dono de checkout, pagamento, ledger, estoque, agenda executada, disponibilidade calculada, benefício ou dynamic pricing autônomo. [MB §6/D06][RM §4 #22–#34]

### 06.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.service_categories` | Categorias de serviços | PK `id`; FK `tenant_id`; `name text`; `description text`; `sort_order int`; `is_active boolean`; `created_at`; `updated_at`; unique `(tenant_id,name)` | Tenant atual; leitura por `catalog.service.read`; escrita por Command |
| `tenant_core.services` | Serviço canônico configurável | PK `id`; FK `tenant_id`; FK `category_id`; `name text`; `description text`; `duration_minutes int check > 0`; `base_price_cents bigint check >= 0`; `cost_basis_cents bigint check >= 0`; `requires_deposit boolean`; `is_active boolean`; `metadata jsonb`; timestamps; unique `(tenant_id,name)`; index `(tenant_id,is_active)` | Tenant atual; escrita por `catalog.service.write` |
| `tenant_core.service_unit_overrides` | Override de duração/preço/status por unidade | PK `id`; FK `tenant_id`; FK `service_id`; FK `business_unit_id`; `duration_minutes int`; `base_price_cents bigint`; `is_available boolean`; `effective_from`; `effective_until`; check período válido; unique ativo `(tenant_id,service_id,business_unit_id)` | Tenant atual; escrita por `catalog.unit_override.write` |
| `tenant_core.service_price_rules` | Preço por profissional/unidade/período | PK `id`; FK `tenant_id`; FK `service_id`; FK `staff_id` nullable; FK `business_unit_id` nullable; `price_cents bigint`; `valid_from timestamptz`; `valid_until timestamptz`; `is_active boolean`; `priority int`; check período válido; constraint determinística impede duas regras ativas com mesmo escopo normalizado, mesma prioridade e período sobreposto; index `(tenant_id,service_id,is_active)` | Tenant atual; escrita por `catalog.price.write` |
| `tenant_core.service_yield_profiles` | Perfil de rendimento para agenda e revenue engine futuros | PK `id`; FK `tenant_id`; FK `service_id`; `revenue_per_minute_cents bigint`; `margin_tier service_margin_tier`; `is_premium_anchor boolean`; `minimum_preserved_window_minutes int`; `demand_score numeric(5,2)`; `settings jsonb`; unique `(tenant_id,service_id)` | Tenant atual; escrita gerencial; usado por D07/D23 sem virar saldo |
| `tenant_core.service_chain_components` | Componentes operacionais de serviços compostos | PK `id`; FK `tenant_id`; FK `service_id`; `step_order int`; `work_type component_work_type`; `duration_minutes int`; `blocks_primary_staff boolean`; `blocks_client boolean`; `blocks_resource boolean`; `can_delegate_to_assistant boolean`; `can_overlap_other_services boolean`; `buffer_group_key text`; `settings jsonb`; unique `(tenant_id,service_id,step_order)` | Tenant atual; escrita por `catalog.chain.write` |
| `tenant_core.product_categories` | Categorias de produtos comerciais | PK `id`; FK `tenant_id`; `name text`; `is_active boolean`; timestamps; unique `(tenant_id,name)` | Tenant atual |
| `tenant_core.products` | Produto como item comercial sem estoque | PK `id`; FK `tenant_id`; FK `category_id`; `sku text`; `name text`; `description text`; `price_cents bigint`; `cost_cents bigint`; `is_active boolean`; `metadata jsonb`; timestamps; unique `(tenant_id,sku)` quando sku presente; sem campo de estoque | Tenant atual; escrita por `catalog.product.write` |
| `tenant_core.addons` | Add-ons vinculáveis a serviço ou produto | PK `id`; FK `tenant_id`; FK `linked_service_id`; FK `linked_product_id`; `name text`; `price_cents bigint`; `estimated_duration_minutes int`; `is_active boolean`; check serviço ou produto presente quando houver vínculo; index `(tenant_id,is_active)` | Tenant atual |
| `tenant_core.bundles` | Combos/composições comerciais | PK `id`; FK `tenant_id`; `name text`; `description text`; `price_cents bigint`; `is_active boolean`; `bundle_kind bundle_kind`; timestamps; unique `(tenant_id,name)` | Tenant atual |
| `tenant_core.bundle_items` | Itens de combo | PK `id`; FK `tenant_id`; FK `bundle_id`; FK `service_id`; FK `product_id`; FK `addon_id`; `quantity numeric(12,3)`; check `quantity > 0`; check exatamente um item entre service/product/addon; check serviço e add-on exigem quantidade inteira; produto pode usar fração somente se futura unidade comercial autorizar; index `(tenant_id,bundle_id)` | Tenant atual |
| `tenant_core.commercial_offer_rules` | Regras comerciais explícitas de oferta | PK `id`; FK `tenant_id`; FK `business_unit_id` nullable; `offer_key text`; `offer_kind commercial_offer_kind`; `status offer_rule_status`; `starts_at`; `ends_at`; `rule_config jsonb`; `created_by`; timestamps; check período válido; unique ativo `(tenant_id,business_unit_id,offer_key)` | Tenant atual; escrita por `catalog.offer.write` |
| `tenant_core.offer_visibility_rules` | Visibilidade por canal/unidade/plano | PK `id`; FK `tenant_id`; FK `offer_rule_id`; `channel offer_channel`; `visibility_status offer_visibility_status`; `business_unit_id uuid`; `audience_rule jsonb`; timestamps; unique `(tenant_id,offer_rule_id,channel,business_unit_id)` | Tenant atual; leitura pública só via RPC segura futura |

### 06.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `service_margin_tier` | `high`, `medium`, `low` |
| `component_work_type` | `prep_before`, `active_execution`, `chemical_pause`, `wash_and_treatment`, `finishing`, `cleanup_after`, `assistant_execution`, `simultaneous_service` |
| `bundle_kind` | `service_combo`, `product_combo`, `mixed_combo`, `event_package` |
| `commercial_offer_kind` | `standard`, `seasonal`, `unit_specific`, `staff_specific`, `bundle`, `addon_offer` |
| `offer_rule_status` | `draft`, `active`, `paused`, `ended`, `archived` |
| `offer_channel` | `internal_pos`, `online_booking`, `client_portal`, `whatsapp_assisted`, `marketplace_future` |
| `offer_visibility_status` | `visible`, `hidden`, `requires_staff_approval`, `owner_only` |

### 06.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_service_category` | `(p_tenant_id uuid, p_name text, p_description text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_create_service` | `(p_tenant_id uuid, p_category_id uuid, p_name text, p_duration_minutes int, p_base_price_cents bigint, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_update_service` | `(p_service_id uuid, p_patch jsonb, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_configure_service_unit_override` | `(p_service_id uuid, p_business_unit_id uuid, p_duration_minutes int, p_base_price_cents bigint, p_is_available boolean, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_set_service_price_rule` | `(p_service_id uuid, p_staff_id uuid, p_business_unit_id uuid, p_price_cents bigint, p_valid_from timestamptz, p_valid_until timestamptz, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_set_service_yield_profile` | `(p_service_id uuid, p_revenue_per_minute_cents bigint, p_margin_tier service_margin_tier, p_is_premium_anchor boolean, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_configure_service_chain_components` | `(p_service_id uuid, p_components jsonb, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_create_product` | `(p_tenant_id uuid, p_category_id uuid, p_sku text, p_name text, p_price_cents bigint, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_create_addon` | `(p_tenant_id uuid, p_name text, p_linked_service_id uuid, p_linked_product_id uuid, p_price_cents bigint, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_create_bundle` | `(p_tenant_id uuid, p_name text, p_bundle_kind bundle_kind, p_price_cents bigint, p_items jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_configure_commercial_offer_rule` | `(p_tenant_id uuid, p_business_unit_id uuid, p_offer_key text, p_offer_kind commercial_offer_kind, p_rule_config jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.read_catalog_for_booking` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_channel offer_channel) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_read_executor` | Backend read API |

### 06.5 Políticas RLS

**Inventário RLS efetiva D06:** `tenant_core.service_categories`, `tenant_core.services`, `tenant_core.service_unit_overrides`, `tenant_core.service_price_rules`, `tenant_core.service_yield_profiles`, `tenant_core.service_chain_components`, `tenant_core.product_categories`, `tenant_core.products`, `tenant_core.addons`, `tenant_core.bundles`, `tenant_core.bundle_items`, `tenant_core.commercial_offer_rules`, `tenant_core.offer_visibility_rules` têm `RLS_ENABLED = SIM` na migration 008 antes de grants. [MB §7][MB §10/Gate01]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.service_categories` | SELECT | membro ativo | Tenant atual + `catalog.service.read` |
| `tenant_core.services` | SELECT | membro ativo | Tenant atual; canais públicos usam RPC segura, não tabela bruta |
| `tenant_core.services` | INSERT/UPDATE | Command trusted | Valida `catalog.service.write` |
| `tenant_core.service_unit_overrides` | SELECT | membro ativo | Tenant atual + unidade permitida |
| `tenant_core.service_price_rules` | SELECT | gestor autorizado | Tenant atual; staff não altera preço |
| `tenant_core.service_yield_profiles` | SELECT | gestor autorizado | Tenant atual; não expõe margem para staff sem permissão |
| `tenant_core.service_chain_components` | SELECT | gestor/agendamento backend | Tenant atual; usado por engine futura via backend |
| `tenant_core.products` | SELECT | membro ativo | Tenant atual; sem estoque |
| `tenant_core.addons`, `tenant_core.bundles`, `tenant_core.bundle_items` | SELECT | membro ativo | Tenant atual |
| `tenant_core.commercial_offer_rules` | SELECT | gestor autorizado | Tenant atual; público só via RPC segura |
| `tenant_core.offer_visibility_rules` | SELECT | gestor autorizado ou RPC segura | Tenant atual; canal público filtrado no backend |
| `tenant_core.* D06` | INSERT/UPDATE | Command trusted | Sem escrita direta por frontend |
| `tenant_core.* D06` | DELETE | Todos | DELETE físico negado; status/inativação |
| `tenant_core.* D06` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |

### 06.6 Invariantes

1. Preço base e duração nunca são hardcoded; sempre vêm de `services`, `service_unit_overrides` ou `service_price_rules`. [MB §6/D06]
2. `service_price_rules` é determinística: não podem existir duas regras ativas do mesmo escopo, prioridade e período que retornem preços concorrentes. [MB §7][MB §10/Gate10]
3. Produto não tem estoque, snapshot de estoque, reserva de estoque ou baixa de inventário. [RM §4 #31]
4. `bundle_items.quantity` não permite fração de serviço nem de add-on; fração de produto depende de unidade comercial autorizada em evolução futura. [MB §7]
5. `service_yield_profiles` orienta agenda/revenue futuros, mas não é saldo, faturamento real nem ledger. [MB §7]
6. `service_chain_components` preserva o enum legado por KEEP e descreve composição; execução, conflito e pausa operacional são do D07/D08. [MB §6/D07][RM §4 #28]
7. Oferta pública sempre passa por RPC segura ou read model autorizada, nunca por tabela bruta. [MB §7]
8. Preço final de checkout futuro será recalculado no backend; D06 fornece insumos configuráveis. [MB §10/Gate10]

### 06.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `catalog.service_category_created` | `tenant_id`, `category_id`, `request_id` |
| `catalog.service_created` | `tenant_id`, `service_id`, `base_price_cents`, `duration_minutes` |
| `catalog.service_updated` | `tenant_id`, `service_id`, `reason`, `request_id` |
| `catalog.service_unit_override_configured` | `tenant_id`, `service_id`, `business_unit_id` |
| `catalog.service_price_rule_set` | `tenant_id`, `service_id`, `staff_id`, `business_unit_id` |
| `catalog.service_yield_profile_set` | `tenant_id`, `service_id`, `margin_tier`, `is_premium_anchor` |
| `catalog.service_chain_components_configured` | `tenant_id`, `service_id`, `component_count` |
| `catalog.product_created` | `tenant_id`, `product_id`, `sku` |
| `catalog.addon_created` | `tenant_id`, `addon_id` |
| `catalog.bundle_created` | `tenant_id`, `bundle_id`, `item_count` |
| `catalog.offer_rule_configured` | `tenant_id`, `offer_rule_id`, `offer_kind` |

### 06.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01 Identity & Tenant; 02 Business Setup Hub; 05 People Hub para preço por profissional e vínculo staff-serviço |
| É dependência de | 07 SMART Scheduling Engine, 08 Agenda Core, 11 Resource Orchestration, 12 Checkout Core, 18 Benefits Engine, 20 Página Web, 23 CoPilot Revenue Engine |

### 06.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 00 — Foundation | Catálogo tem RLS, constraints e seed mínimo sem hardcoded [MB §10/Gate00] |
| Gate 10 — Checkout Integrity futuro | Checkout recalcula total no backend usando preço configurável de D06 [MB §10/Gate10] |
| Gate 05 — Chain Booking futuro | Componentes de cadeia são dados explícitos e não inferência de frontend [MB §10/Gate05] |

### 06.10 RAGOV do domínio

**REAL / MVP.** [MB §6/D06]

---

## Domínio 11 — Resource Orchestration

### 11.1 Responsabilidade

O Domínio 11 é dono do cadastro de recursos físicos, capacidades, regras de disponibilidade, bloqueios de manutenção e vínculo obrigatório entre serviço e recurso. Não é dono de appointment, slot score, agenda executada, waitlist, checkout ou lock de atendimento; o bloqueio de sobreposição por atendimento será materializado nos blocos de agenda/engine quando existir `appointments`. [MB §6/D11][RM §5/D11]

### 11.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.resources` | Cadastro de recurso físico | PK `id`; FK `tenant_id`; FK `business_unit_id`; `resource_kind resource_kind`; `name text`; `description text`; `status resource_status`; `is_critical boolean`; `capacity_count int check > 0`; `metadata jsonb`; timestamps; `archived_at`; unique ativo `(tenant_id,business_unit_id,name)`; index `(tenant_id,business_unit_id,status)` | Tenant atual; leitura por `resource.read`; escrita por Command |
| `tenant_core.resource_capabilities` | Capacidades que um recurso oferece | PK `id`; FK `tenant_id`; FK `resource_id`; `capability_key text`; `capability_value jsonb`; `is_active boolean`; timestamps; unique ativo `(tenant_id,resource_id,capability_key)` | Tenant atual |
| `tenant_core.service_required_resources` | Requisitos de recurso por serviço/componente | PK `id`; FK `tenant_id`; FK `service_id`; FK `service_chain_component_id` nullable; `resource_kind resource_kind`; `capability_key text`; `quantity int check > 0`; `is_mandatory boolean`; `selection_mode resource_selection_mode`; timestamps; unique `(tenant_id,service_id,service_chain_component_id,resource_kind,capability_key)` | Tenant atual; usado por D07/D08 future backend |
| `tenant_core.resource_availability_rules` | Disponibilidade base de recurso físico | PK `id`; FK `tenant_id`; FK `resource_id`; `weekday int check 0..6`; `starts_at time`; `ends_at time`; `is_available boolean`; `valid_from date`; `valid_until date`; check horário/período; constraint de não-sobreposição por `(tenant_id, resource_id, weekday)` usando intervalo de vigência + minutos do dia para regras ativas; index `(tenant_id,resource_id,weekday)` | Tenant atual |
| `tenant_core.resource_maintenance_blocks` | Bloqueios de manutenção/indisponibilidade de recurso | PK `id`; FK `tenant_id`; FK `resource_id`; `business_unit_id uuid`; `starts_at timestamptz`; `ends_at timestamptz`; `reason text`; `status resource_maintenance_status`; `created_by uuid`; timestamps; check `starts_at < ends_at`; constraint de não-sobreposição por `(tenant_id, resource_id, intervalo starts_at/ends_at)` para status ativo; index `(tenant_id,resource_id,starts_at,ends_at)` | Tenant atual; escrita por `resource.maintenance.write` |
| `tenant_core.resource_capacity_rules` | Regras de capacidade e compatibilidade | PK `id`; FK `tenant_id`; FK `resource_id`; `capacity_mode resource_capacity_mode`; `max_parallel_uses int check > 0`; `incompatible_resource_kinds resource_kind[]`; `rule_config jsonb`; `is_active boolean`; timestamps; unique ativo `(tenant_id,resource_id,capacity_mode)` | Tenant atual |

### 11.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `resource_kind` | `chair`, `room`, `sink`, `equipment`, `station`, `assistant_staff_slot`, `other_physical` |
| `resource_status` | `active`, `inactive`, `maintenance`, `retired` |
| `resource_selection_mode` | `specific_resource`, `any_matching_capability`, `staff_assigned_default`, `manual_selection_required` |
| `resource_maintenance_status` | `scheduled`, `active`, `completed`, `cancelled` |
| `resource_capacity_mode` | `exclusive`, `capacity_count`, `shared_if_compatible`, `manual_review` |

### 11.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_resource` | `(p_tenant_id uuid, p_business_unit_id uuid, p_resource_kind resource_kind, p_name text, p_capacity_count int, p_is_critical boolean, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_update_resource` | `(p_resource_id uuid, p_patch jsonb, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_set_resource_capability` | `(p_resource_id uuid, p_capability_key text, p_capability_value jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_set_service_required_resources` | `(p_service_id uuid, p_requirements jsonb, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_configure_resource_availability` | `(p_resource_id uuid, p_rules jsonb, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_create_resource_maintenance_block` | `(p_resource_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_set_resource_capacity_rule` | `(p_resource_id uuid, p_capacity_mode resource_capacity_mode, p_max_parallel_uses int, p_rule_config jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.read_resource_requirements_for_service` | `(p_actor_user_id uuid, p_service_id uuid) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_read_executor` | Backend read API / scheduling future |

### 11.5 Políticas RLS

**Inventário RLS efetiva D11:** `tenant_core.resources`, `tenant_core.resource_capabilities`, `tenant_core.service_required_resources`, `tenant_core.resource_availability_rules`, `tenant_core.resource_maintenance_blocks`, `tenant_core.resource_capacity_rules` têm `RLS_ENABLED = SIM` na migration 010 antes de grants. [MB §7][MB §10/Gate01]

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.resources` | SELECT | membro ativo com `resource.read` | Tenant atual + unidade permitida |
| `tenant_core.resources` | INSERT/UPDATE | Command trusted | Valida `resource.write` |
| `tenant_core.resource_capabilities` | SELECT | membro ativo | Tenant atual por recurso |
| `tenant_core.service_required_resources` | SELECT | backend/agendamento/gestor | Tenant atual; agendamento futuro lê por RPC segura |
| `tenant_core.resource_availability_rules` | SELECT | membro ativo | Tenant atual por recurso |
| `tenant_core.resource_maintenance_blocks` | SELECT | membro ativo | Tenant atual por recurso; staff vê impacto operacional permitido |
| `tenant_core.resource_capacity_rules` | SELECT | backend/gestor | Tenant atual; regra bruta não exposta em canal público |
| `tenant_core.* D11` | INSERT/UPDATE | Command trusted | Sem escrita direta por frontend |
| `tenant_core.* D11` | DELETE | Todos | DELETE físico negado; usar status/archived_at/cancelled |
| `tenant_core.* D11` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |

### 11.6 Invariantes

1. Recurso crítico não pode ter dois atendimentos simultâneos incompatíveis; a prova operacional ocorrerá no Gate 04 quando agenda/locks existirem. [MB §6/D11][MB §10/Gate04]
2. D11 não cria `appointment_resource_blocks` antes de existir appointment canônico. [RM §4 #40]
3. Bloqueio de manutenção não é appointment e não substitui agenda, mas tem constraint de não-sobreposição por recurso para evitar indisponibilidade ambígua. [MB §6/D08][MB §6/D11]
4. Serviço que exige recurso deve declarar requisito em `service_required_resources`; frontend não infere recurso obrigatório. [MB §7][MB §6/D11]
5. Recursos são tenant-scoped e unit-scoped quando pertencem a uma unidade. [MB §6/D01][MB §6/D11]
6. Regras de disponibilidade de recurso são não-sobrepostas por banco por `(tenant_id, resource_id, weekday)` e vigência; disponibilidade ambígua é bloqueada antes do D07 consumir o dado. [MB §7][MB §10/Gate04]

### 11.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `resource.resource_created` | `tenant_id`, `resource_id`, `business_unit_id`, `resource_kind` |
| `resource.resource_updated` | `tenant_id`, `resource_id`, `reason`, `request_id` |
| `resource.capability_set` | `tenant_id`, `resource_id`, `capability_key` |
| `resource.service_requirements_configured` | `tenant_id`, `service_id`, `requirement_count` |
| `resource.availability_configured` | `tenant_id`, `resource_id`, `rule_count` |
| `resource.maintenance_block_created` | `tenant_id`, `resource_id`, `starts_at`, `ends_at` |
| `resource.capacity_rule_set` | `tenant_id`, `resource_id`, `capacity_mode` |

### 11.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01 Identity & Tenant; 02 Business Setup Hub; 06 Catalog & Offer Hub |
| É dependência de | 07 SMART Scheduling Engine, 08 Agenda Core, 10 Group Booking, 12 Checkout Core, 25 Analytics |

### 11.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 04 — Appointment Conflict futuro | Agenda não permite conflito de recurso crítico ou profissional [MB §10/Gate04] |
| Gate 05 — Chain Booking futuro | Componentes, pausa química e recurso ocupado usam requisitos explícitos [MB §10/Gate05] |
| Gate 01 — Tenant Isolation | Recursos e requisitos de Tenant A não vazam para Tenant B [MB §10/Gate01] |

### 11.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D11]

---

## 6. Mapa de relações inter-domínios do Bloco B

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| 05 | 01 | `staff_profiles.membership_id` → `memberships.id`; `clients.tenant_id` → `tenants.id` | Pessoas sempre tenant-scoped [MB §6/D01][MB §6/D05] |
| 05 | 02 | `staff_profiles.business_unit_id`, `clients.business_unit_id`, `staff_working_hours.business_unit_id` → `business_units.id` | Pessoas operam por unidade quando aplicável [MB §6/D02] |
| 06 | 05 | `service_price_rules.staff_id` e `staff_services.staff_id` dependem de staff | Preço por profissional depende de staff real [MB §6/D06] |
| 06 | 02 | `service_unit_overrides.business_unit_id` → `business_units.id` | Oferta configurável por unidade [MB §6/D06] |
| 11 | 06 | `service_required_resources.service_id` → `services.id`; componente opcional → `service_chain_components.id` | Recurso obrigatório por serviço/componente [MB §6/D11] |
| 11 | 02 | `resources.business_unit_id` → `business_units.id` | Recurso físico pertence a unidade quando aplicável [MB §6/D11] |

---

## 7. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gate secundário | Critério bloqueante |
|---:|---:|---|---|---|
| 05 | 007 | Gate 02 | Gate 01 / Gate 21 futuro | Staff privacy e dados sensíveis sem vazamento cross-tenant |
| 06 | 008–009 | Gate 00 | Gate 10 futuro / Gate 05 futuro | Preço/duração configuráveis, sem hardcoded e sem estoque falso |
| 11 | 010 | Gate 04 futuro | Gate 05 futuro / Gate 01 | Recurso crítico modelado sem conflito implícito e sem lock paralelo prematuro |

---

## 8. Ordem única de execução de migrations do Bloco B

1. `007_people_hub_core.sql` — cria enums, tabelas e Commands de staff, clientes, consentimentos, notas imutáveis, preferências, vínculos e logs sensíveis; aplica constraint de não-sobreposição em `staff_working_hours`. [MB §6/D05][RM §5/D05]
2. `008_catalog_offer_hub.sql` — cria categorias, serviços, overrides, preço determinístico, yield, componentes com enum legado, produtos comerciais sem estoque, add-ons, bundles e regras de oferta. [MB §6/D06][RM §5/D06]
3. `009_people_catalog_bindings.sql` — cria `tenant_core.staff_services` com FK para `staff_profiles` e `services`; aplica grants/RLS do vínculo. [RM §4 #25]
4. `010_resource_orchestration.sql` — cria recursos, capacidades, requisitos por serviço, disponibilidade, manutenção com não-sobreposição e regras de capacidade. [MB §6/D11][RM §5/D11]

**Invariante de execução:** nenhuma migration do Bloco B cria FK para relação inexistente; `staff_services` só nasce após `staff_profiles` e `services`; `service_required_resources` só nasce após `services`, `service_chain_components` e `resources`; nenhuma tabela do Bloco B é liberada sem `RLS_ENABLED = SIM`; constraints de preço determinístico e não-sobreposição entram na mesma migration da tabela dona. [SKILL §7][MB §7]

### 8.1 Tabela de vínculo D05/D06 criada na migration 009

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.staff_services` | Serviços executáveis por profissional | PK composta `(staff_id, service_id)`; FK `tenant_id`; FK `staff_id`; FK `service_id`; `is_enabled boolean`; `custom_duration_minutes int check > 0 when not null`; `custom_price_cents bigint check >= 0 when not null`; `created_at`; `updated_at`; index `(tenant_id,service_id,is_enabled)` | Tenant atual; escrita por Command com `people.staff.write` + `catalog.service.write` |

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_set_staff_services` | `(p_staff_id uuid, p_services jsonb, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; EXECUTE `app_backend_command_executor` | Manager/admin Command |

**RLS efetiva:** `tenant_core.staff_services` tem `RLS_ENABLED = SIM` na migration 009 antes de grants. [MB §7]

---

## 9. Estratégia de rollback do Bloco B

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 007 | Em sandbox antes de dados reais: remover grants/RLS e recriar tabelas; em dados reais: arquivar staff/cliente por status e bloquear Commands | DELETE físico de clientes, consentimentos, notas, logs sensíveis ou auditoria |
| 008 | Em sandbox: recriar catálogo; em dados reais: inativar serviços, produtos, combos e ofertas por status | Remover histórico de preço/yield usado por checkout/agenda futura |
| 009 | Inativar vínculo staff-serviço ou customização; reprocessar read models futuros | Apagar vínculo usado por appointments futuros após Bloco C |
| 010 | Arquivar recurso ou cancelar manutenção; criar nova regra de capacidade vigente | Apagar recurso crítico com histórico de agenda futura ou bloquear manutenção retroativamente |

---

## 10. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| D05 em `tenant_core` | REAL | Pessoas são tenant-scoped e dependem de membership/RLS | [MB §6/D05][RM §2] |
| D06 em `tenant_core` | REAL | Catálogo é configurável por tenant/unidade | [MB §6/D06] |
| D11 em `tenant_core` | REAL | Recursos físicos pertencem ao tenant/unidade e não ao Platform Owner | [MB §6/D11] |
| Produtos sem estoque | REAL | Produto é item comercial; inventário não autorizado | [MB §6/D06][RM §4 #31] |
| Staff financeiro sem saldo | REAL | People guarda configuração/visibilidade; ledger/wallet/comissão calculada ficam em blocos financeiros | [MB §7][MB §6/D05] |
| `staff_services` separado em migration 009 | REAL | Remove dependência circular entre People e Catalog | [RM §4 #25][SKILL §7] |
| `appointment_resource_blocks` fora do Bloco B | REAL | Appointment não existe neste bloco; lock de atendimento pertence à agenda/engine | [RM §4 #40][MB §6/D08] |
| `component_work_type` legado preservado | REAL | `service_chain_components` é KEEP; valores legados preservam Chain Booking e pausas operacionais | [RM §4 #28][MB §10/Gate05] |
| `client_notes` imutável com supersessão | REAL | Dado sensível não pode ser sobrescrito sem rastro do conteúdo anterior | [MB §26][MB §7] |
| Preço por regra determinístico | REAL | Checkout futuro não pode depender de ordem arbitrária de query | [MB §7][MB §10/Gate10] |
| Constraints de não-sobreposição | REAL | Disponibilidade futura não pode nascer de janelas de staff, disponibilidade de recurso ou manutenção contraditórias | [MB §7][MB §10/Gate04] |
| `_cents bigint` em preços | DECISÃO PENDENTE F0-01 | Aplicação provisória até ratificação final no Bloco D | [RM §7] |

---

## 11. Reflexion contra Definition of Done do Bloco B

| Item verificado | Resultado | Correção aplicada |
|---|---|---|
| Domínios 05, 06 e 11 têm os 10 blocos obrigatórios | SIM | Sem correção |
| Toda tabela tem RLS especificada | SIM | Inventário `RLS_ENABLED = SIM` em D05, D06, D11 e `staff_services` |
| Funções críticas têm SECURITY, REVOKE e GRANT concreto | SIM | Todas as funções usam roles técnicos herdados do Bloco A v2.1 |
| Todo Command de mutação tem idempotência | SIM | Todos os Commands têm `p_idempotency_key` |
| Todo domínio CRÍTICO está mapeado a gate | SIM | D11 mapeado a Gate 04/Gate 05/Gate 01 |
| Ordem de migrations evita dependência circular | SIM | `staff_services` isolado na migration 009; D11 após D06 |
| Rollback documentado por bloco/migration | SIM | Rollback 007–010 documentado |
| Zero feature ausente do Master Brief criada | SIM | Estoque removido; appointment locks fora do bloco |
| Frontend calcula preço/duração/disponibilidade | NÃO | Backend-only preservado; frontend só lê via API/RPC |
| Ledger/wallet/comissão calculada criados no Bloco B | NÃO | Bloqueado explicitamente |

**Falhas encontradas antes da declaração:**  
1. Escopo inicial poderia omitir D11 por seguir apenas a frase da ordem do Master Brief; corrigido porque a skill define Bloco B como 05, 06 e 11. [SKILL §6]  
2. `staff_services` gerava dependência cruzada entre D05 e D06; corrigido com migration 009 dedicada. [SKILL §7]  
3. Produtos poderiam herdar `stock_tracking_enabled` do legado; corrigido com decisão B-01 e remoção total de estoque. [RM §4 #31]  
4. Auditoria Red Team v1 encontrou enum `component_work_type` incompatível com KEEP; corrigido com preservação integral dos valores legados. [RM §4 #28]  
5. Auditoria Red Team v1 encontrou RLS financeiro de staff sem predicado verificável; corrigido com bloqueio de leitura direta para staff e leitura própria via RPC com `p_actor_user_id`. [MB §10/Gate02]  
6. Auditoria Red Team v1 encontrou `client_notes` mutável sem versionamento; corrigido com conteúdo imutável e supersessão append-only. [MB §26]  
7. Ressalvas operacionais de preço, quantidade fracionária, não-sobreposição e logs sensíveis foram absorvidas nas tabelas, invariantes e pré-condições. [MB §7]
8. Auditoria Red Team v2 aprovou o bloco com ressalva N-01 sobre `resource_availability_rules`; corrigido com constraint de não-sobreposição por recurso, weekday e vigência, além de invariante D11 explícita. [MB §7][MB §10/Gate04]

**Limite explícito:** este arquivo não declara o Blueprint 31/31 pronto; declara somente o Bloco B v2.1 pronto como fundação aprovada para o Bloco C, com Bloco A v2.1 como fundação anterior aprovada. [SKILL §6]

Bloco B v2.1 pronto para avanço ao Bloco C.

Pronto para auditoria Red Team.

---

## ANEXO C — SMART_FLOW_3_0_BLUEPRINT_BLOCO_C_v1_2.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco C v1.2

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco C — Domínios 07, 08, 09, 10  
**Status:** APROVADO COM RESSALVAS NO BLOCO C v1.1; RESSALVAS N-01/N-02 ABSORVIDAS; ENTREGUE PARA AUDITORIA FINAL  
**Data:** 2026-06-11  
**Fundação aprovada:** Bloco A v2.1 + Bloco B v2.1  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §0–§8]

---

## 0. Regra de autoridade e versão

1. O Master Brief 3.0 decide visão, domínios, limites e gates. O Blueprint organiza a arquitetura; SQL Master apenas materializa após aprovação. [MB §0]
2. O Bloco C cobre somente os domínios 07, 08, 09 e 10, porque a skill define Bloco C como Agenda: Engine, Core, Recorrente e Grupo. [SKILL §6]
3. Bloco A v2.1 e Bloco B v2.1 são fundações aprovadas por ID: schemas `platform`, `tenant_core`, `shared`; roles técnicos; outbox; idempotência; D05, D06 e D11. [SKILL §6]
4. Frontend não calcula disponibilidade, score, duração real, conflito, preço final, recorrência, grupo, waitlist ou alternativa de slot. Backend calcula e retorna contrato pronto para exibição. [MB §7]
5. SMART Scheduling Engine calcula, explica e ranqueia; nunca altera agenda sozinha. Mutação de agenda pertence a Commands do Domínio 08, 09 ou 10. [MB §6/D07][MB §7]
6. Agenda Core é a verdade operacional de appointments, holds, bloqueios, waitlist, status e locks. [MB §6/D08][RM §4 #35–#42]
7. Recorrente e Grupo têm modelos distintos no banco. Cancelar ocorrência não cancela série; grupo vinculado e grupo independente não compartilham semântica híbrida. [MB §6/D09][MB §6/D10][SKILL §7]
8. Conflito de profissional, cliente, recurso físico e hold é bloqueado por constraint de banco, não por validação solta de aplicação. [MB §10/Gate04][RM §4 #40]
9. Este bloco não cria checkout, pagamento, ledger, wallet, comissão calculada, benefício ou cobrança. Campos monetários são snapshots operacionais para D12/D15/D17 futuros e permanecem reconstruíveis. [MB §7][MB §10/Gate10–Gate15]

---

## 1. Escopo do Bloco C

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| C | 07 | SMART Scheduling Engine | Especificado | [MB §6/D07][RM §4 #10][RM §4 #27–#28][RM §4 #36][RM §5/D07] |
| C | 08 | Agenda Core | Especificado | [MB §6/D08][RM §4 #35–#42][RM §5/D08] |
| C | 09 | Agendamento Recorrente | Especificado | [MB §6/D09][RM §5/D09] |
| C | 10 | Agendamento em Grupo | Especificado | [MB §6/D10][RM §5/D10] |

---

## 2. Decisões herdadas e decisões pendentes resolvidas no Bloco C

### 2.1 Decisões herdadas dos blocos aprovados

| Decisão | Uso no Bloco C | Fonte |
|---|---|---|
| Schemas `platform`, `tenant_core`, `shared` | D07–D10 usam `tenant_core`; contratos transversais usam `shared`; nenhum schema novo | [MB §6/D01][RM §2][SKILL §4] |
| Roles técnicos concretos | Commands usam `app_backend_command_executor`; leituras usam `app_backend_read_executor`; jobs usam `app_worker_executor` | [MB §7][SKILL §4] |
| RLS efetiva | Toda tabela tenant-scoped declara `RLS_ENABLED = SIM` antes de grants | [MB §7][MB §10/Gate01] |
| Outbox fundacional | Eventos são emitidos em `shared.outbox_events`, sem fila paralela | [MB §7][RM §4 #97] |
| Idempotência fundacional | Todo Command de mutação usa `p_idempotency_key` e registra/reusa `shared.command_idempotency_keys` | [SKILL §4] |
| People, Catalog, Resources | D07–D10 consomem staff, clientes, serviços, chains, yield profiles e recursos aprovados no Bloco B v2.1 | [MB §6/D05–D06][MB §6/D11] |

### 2.2 Correções obrigatórias absorvidas das auditorias Red Team do Bloco C v1 e v1.1

| Achado | Correção no v1.1 | Status |
|---|---|---|
| C-01 | `shared.structured_command_result` materializado como tipo composto obrigatório em `shared`, não payload livre | Corrigido |
| C-02 | Conversão de hold para appointment define ordem transacional: criar appointment locks antes de marcar hold convertido, tudo na mesma transação | Corrigido |
| C-03 | `booking_group_payment_modes.responsible_client_id` recebe FK/predicado tenant explícito | Corrigido |
| C-04 | `availability_query_audit_logs` exige `actor_membership_id` ou `worker_run_id`, com check exclusivo | Corrigido |
| C-05 | `estimated_total_cents` recebe `check >= 0` e proibição explícita de consumo como total final pelo D12 | Corrigido |
| C-06 | `command_run_calendar_resolution` recebe campos de trigger auditável do worker/manual run | Corrigido |
| C-07 | `shared.error_code_catalog` recebe REVOKE explícito de PUBLIC, anon, authenticated | Corrigido |
| C-08/C-09 | Holds e appointments especificam constraints `EXCLUDE USING gist` com `tstzrange` por staff, cliente e recurso/capacity | Corrigido |
| C-10 | `recurring_series_pauses` especifica `EXCLUDE USING gist` com `daterange` | Corrigido |
| C-11 | Agendamento manual valida D07 e grava locks na mesma transação | Corrigido |
| C-12 | Gate 07 completo com checkout dividido fica postergado para D12; Bloco C valida só estrutura/cancelamento sem contágio | Corrigido |
| N-01 | `recurring_occurrence_financial_snapshots.estimated_total_cents` e `deposit_required_cents` recebem constraints `CHECK >= 0`; continuam proibidos como total final de checkout | Corrigido no v1.2 |
| N-02 | `schedule_blocks` recebe constraint obrigatória `EXCLUDE USING gist` com `tstzrange(starts_at, ends_at, '[)')` por `(tenant_id, staff_id)` para bloqueios de staff ativos | Corrigido no v1.2 |

### 2.3 DECISÃO PENDENTE DF-01 — contrato de erro estruturado

**Origem:** os RPCs de agenda precisam retornar erro verificável, auditável e legível por UI/IA, sem texto solto como contrato. [MB §7][MB §10/Gate03–Gate09]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Catálogo canônico `shared.error_code_catalog` + envelope de erro padronizado em todos os RPCs de agenda | Alta: evita mutação financeira por exceção opaca | Alta: payload não vaza dados cross-tenant | Baixo: códigos estáveis por domínio | Média |
| B | Cada RPC define seus próprios códigos em documentação local | Média: inconsistência entre Commands | Média: risco de payload sensível divergente | Médio: consolidação futura | Alta |
| C | Usar apenas exceção textual do banco/API | Baixa: UI/IA interpreta texto livre | Baixa: risco de vazamento em mensagem bruta | Alto: troca posterior quebra clientes | Alta |

**Escolha:** Alternativa A.  
Justificativa: agenda exige slots explicáveis, erro `slot_taken` com alternativas e waitlist auditável; isso precisa de códigos estáveis. [MB §10/Gate03][MB §10/Gate09]  
O catálogo fica em `shared` porque atravessa D07–D10, D12 e D21 futuros sem criar verdade duplicada por domínio. [MB §7][RM §4 #97]  
O envelope evita frontend calculando ou inferindo regra crítica. [MB §7]

**Descartes:**  
- Alternativa B descartada porque cria dialetos de erro entre Engine, Agenda, Recorrente e Grupo. [SKILL §5]  
- Alternativa C descartada porque exceção textual não é contrato auditável. [MB §7]

**Decisão final:** migration 011 adiciona `shared.error_code_catalog` e materializa obrigatoriamente o tipo composto `shared.structured_command_result`. O contrato não pode ser implementado como `jsonb` livre nem como convenção de payload; o SQL Master deve materializar o tipo no schema `shared` antes de qualquer RPC D07–D10. [MB §7][SKILL §4]

| Contrato | Campos obrigatórios | Regra |
|---|---|---|
| `shared.error_code_catalog` | `error_code text PK`; `domain_code text`; `severity error_severity`; `http_status int`; `retryable boolean`; `user_message_key text`; `redaction_level error_redaction_level`; `created_at timestamptz`; `retired_at timestamptz` | Catálogo append-only lógico; código retirado recebe `retired_at`, não é reutilizado |
| `shared.structured_command_result` | Tipo composto materializado obrigatoriamente na migration 011; campos: `success boolean`; `result_payload jsonb`; `error_code text`; `error_context jsonb`; `alternatives jsonb`; `idempotency_replay boolean`; `request_id text` | Todo RPC externo do Bloco C retorna sucesso ou erro estruturado; não é JSON livre nem convenção verbal |

**Catálogo mínimo do Bloco C:**

| Código | Domínio | Uso |
|---|---:|---|
| `SLOT_TAKEN` | 08 | Hold ou appointment perdeu corrida de concorrência; retorna alternativas [C-G3] |
| `SLOT_HOLD_EXPIRED` | 08 | Hold expirou antes da conversão |
| `SLOT_HOLD_CONFLICT` | 08 | Hold conflita com staff, cliente ou recurso |
| `INVALID_SLOT_TOKEN` | 07/08 | Token de slot não corresponde à query auditada |
| `PREMIUM_WINDOW_PROTECTED` | 07/08 | Janela premium bloqueada sem regra explícita |
| `HOLIDAY_CLOSED` | 07 | Slot bloqueado por feriado/exceção canônica |
| `RESOURCE_UNAVAILABLE` | 07/08 | Recurso crítico indisponível ou sem capacidade |
| `STAFF_UNAVAILABLE` | 07/08 | Profissional indisponível por agenda, horário, bloqueio ou chain |
| `WAITLIST_ENTRY_NOT_ELIGIBLE` | 08 | Entrada sem consentimento, janela ou serviço elegível |
| `WAITLIST_OFFER_EXPIRED` | 08 | Oferta expirada antes da conversão |
| `RECURRING_PREVIEW_REQUIRED` | 09 | Série não pode ser criada sem preview válido recente |
| `RECURRING_OCCURRENCE_CONFLICT` | 09 | Uma ou mais ocorrências conflitam |
| `GROUP_MODEL_VIOLATION` | 10 | Tentativa de misturar grupo vinculado e independente |
| `GROUP_MEMBER_CONFLICT` | 10 | Membro não pode ser alocado no slot solicitado |
| `IDEMPOTENCY_REPLAY` | shared | Resultado retornado de replay idempotente |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | shared | Mesma key com payload diferente |
| `COMMAND_IN_PROGRESS` | shared | Mesma key em execução |
| `PERMISSION_DENIED` | shared | Ator sem permissão no tenant |
| `VALIDATION_FAILED` | shared | Payload inválido antes de mutação |

### 2.4 DECISÃO PENDENTE DF-02 — semântica de replay de idempotência

**Origem:** Agenda tem alto risco de retry em hold, create appointment, recorrente e grupo. Repetir Command não pode duplicar hold, appointment, ocorrência ou membro de grupo. [MB §7][MB §10/Gate04]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Replay determinístico por `p_idempotency_key + command_name + tenant_id + payload_hash`; retorna resultado gravado se payload idêntico | Alta: impede duplicidade futura em checkout/ledger | Alta: key escopada por tenant | Baixo | Média |
| B | Idempotência por chave única local em cada tabela final | Média: cobre algumas duplicidades, não o fluxo todo | Alta | Médio: cada Command cria padrão próprio | Média |
| C | Idempotência apenas no client/API gateway | Baixa: retry backend/worker duplica mutações | Baixa | Alto | Alta |

**Escolha:** Alternativa A.  
Justificativa: hold, appointment, série recorrente e grupo são transações compostas com locks/outbox; a idempotência precisa cobrir a transação inteira. [MB §7]  
Replay retorna o mesmo `shared.structured_command_result`, com `idempotency_replay = true`, sem recalcular regra de agenda. [MB §7]  
Payload divergente para a mesma key é erro estruturado, não atualização silenciosa. [MB §10/Gate04]

**Descartes:**  
- Alternativa B descartada porque não cobre criação composta de lock + appointment + status history + outbox. [MB §7]  
- Alternativa C descartada porque frontend/API não são fonte da verdade. [MB §7]

**Decisão final:** Bloco C herda `shared.command_idempotency_keys` e exige estes campos/semânticas para qualquer Command D07–D10:

| Situação | Resultado obrigatório |
|---|---|
| Primeira execução | grava `payload_hash`, `command_name`, `tenant_id`, `status = executing`; conclui com `succeeded` ou `failed_retryable`/`failed_final` |
| Replay com mesmo hash e sucesso anterior | retorna `shared.structured_command_result` gravado; `idempotency_replay = true`; não emite novo outbox |
| Replay com mesmo hash e falha final | retorna mesma falha estruturada; não executa novamente |
| Replay com mesmo hash e falha retryable | permite reexecução controlada pelo backend trusted; registra replay event |
| Replay com hash diferente | retorna `IDEMPOTENCY_PAYLOAD_MISMATCH`; não executa |
| Key em execução | retorna `COMMAND_IN_PROGRESS`; não executa em paralelo |
| TTL de hold expirado | idempotência preserva o resultado original; expiração de hold é estado de agenda, não nova execução |

### 2.5 DECISÃO PENDENTE DF-05 — saga de signup: sequência e compensação

**Origem:** signup cria tenant, billing, onboarding, setup seed, políticas iniciais e pode ativar agenda. A agenda não pode operar se a saga falhar parcialmente. [MB §6/D03][MB §10/Gate00]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Saga explícita em `tenant_core.signup_saga_runs` e `signup_saga_steps`, com compensação por status e outbox | Alta: não cria cobrança/agenda órfã | Alta: tenant isolado desde o primeiro passo | Baixo | Média |
| B | Cada Command de onboarding compensa localmente sem saga central | Média: difícil provar sequência completa | Média | Médio | Média |
| C | Signup transacional único com rollback total | Média: não cobre chamadas externas/outbox/worker | Alta | Alto | Baixa |

**Escolha:** Alternativa A.  
Justificativa: signup atravessa D01, D03, D04, D02 e agora D07/D08; sequência e compensação precisam ser auditáveis por gate. [MB §6/D03][MB §10/Gate00]  
Status-compensation evita tenant ativo com agenda sem setup, plano ou readiness. [MB §6/D03]  
Outbox mantém efeitos assíncronos rastreáveis sem engine paralela. [MB §7]

**Descartes:**  
- Alternativa B descartada porque dispersa a verdade da sequência. [MB §7]  
- Alternativa C descartada porque signup real inclui worker, seed, billing e eventos assíncronos. [MB §7]

**Sequência canônica da saga de signup:**

| Ordem | Passo | Dono | Compensação se falhar depois |
|---:|---|---|---|
| 1 | Criar tenant em `tenant_core.tenants` com status `setup` | D01 | marcar tenant `cancelled_setup_failed` lógico via status permitido do SQL Master ou `setup` bloqueado por readiness |
| 2 | Criar registry platform tenant | D00 | marcar registry `cancelled_at` com motivo |
| 3 | Criar billing account/subscription trial ou plano | D04 | cancelar subscription/billing account por status |
| 4 | Rodar onboarding flow e seed inicial | D03 | marcar seed_run `rolled_back`; não apagar histórico |
| 5 | Criar setup mínimo: business_hours, holiday_rules, agenda_policies | D02 | marcar checklist `blocked`; não liberar operação |
| 6 | Criar scheduling defaults: geometry settings e holiday bridge cache vazio | D07 | marcar run de availability como `invalidated` |
| 7 | Rodar readiness final | D03/D31 futuro | tenant permanece `setup` até passar |
| 8 | Ativar operação de agenda | D08 | permitido somente após Gate 00 e Gate 01 passarem |

**Tabelas fundacionais adicionadas no Bloco C:**

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.signup_saga_runs` | Execução auditável da saga de signup | PK `id`; FK `tenant_id`; `saga_version text`; `status signup_saga_status`; `started_at`; `finished_at`; `failed_step_key`; `failure_error_code`; `compensation_status signup_compensation_status`; `idempotency_key text unique`; `result jsonb`; append-only lógico | RLS_ENABLED = SIM; Platform/onboarding Command escreve; tenant owner lê resumo após ativação |
| `tenant_core.signup_saga_steps` | Passos da saga e compensação | PK `id`; FK `saga_run_id`; `step_order int`; `step_key text`; `status signup_saga_step_status`; `started_at`; `finished_at`; `compensation_action text`; `compensated_at`; `error_code`; `metadata jsonb`; unique `(saga_run_id, step_order)` | RLS_ENABLED = SIM; escrita somente Command/worker; leitura owner/admin quando tenant ativo |

### 2.6 DECISÃO PENDENTE DF-07 — fonte canônica de feriados e política de ponte

**Origem:** D02 já possui `holiday_rules` como tabela compatível de feriados/exceções por unidade. D07 precisa consumir isso na malha de slots sem criar fonte duplicada. [RM §4 #9][MB §6/D02][MB §6/D07]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | `tenant_core.holiday_rules` é fonte canônica; `holiday_bridge_policies` é adendo D02; D07 cria cache reconstruível de resolução | Alta: não cria agenda falsa nem pagamento | Alta: tenant/unit-scoped | Baixo | Média |
| B | D07 cria calendário próprio de feriados e ignora D02 | Média: duplica fonte operacional | Média | Alto: reconciliar calendários | Média |
| C | Usar provedor externo como fonte soberana | Baixa: não cobre regras locais do salão | Baixa: dependência externa | Alto | Média |

**Escolha:** Alternativa A.  
Justificativa: o Reuse Map classifica `holiday_rules` como KEEP e D02 é dono de setup/feriados; D07 apenas resolve disponibilidade. [RM §4 #9][MB §6/D02][MB §6/D07]  
Política de ponte é configuração operacional por unidade, não calendário externo soberano. [MB §6/D02]  
Cache de resolução é read model reconstruível e não dupla verdade. [MB §7]

**Descartes:**  
- Alternativa B descartada porque cria duas fontes de feriados. [RM §6]  
- Alternativa C descartada porque feriado real do salão inclui exceção local e decisão de ponte, não só calendário civil. [MB §6/D02]

**Decisão final:**

| Item | Dono | Regra |
|---|---:|---|
| `tenant_core.holiday_rules` | D02 | Fonte canônica de feriados, fechamento e abertura excepcional por unidade |
| `tenant_core.holiday_bridge_policies` | D02 adendo materializado na migration 011 | Fonte canônica de política de ponte por unidade |
| `tenant_core.scheduling_calendar_resolution_runs` | D07 | Run reconstruível da malha de calendário consumida pelos slots |
| `tenant_core.scheduling_calendar_exceptions` | D07 | Read model reconstruível por data/unidade com motivo: feriado, ponte, fechamento especial, abertura especial |

---

## 3. Contratos transversais obrigatórios dos RPCs de agenda

### 3.1 C-G1–C-G8 — requisitos de contrato

| Código | Requisito | Contrato obrigatório | Domínios |
|---|---|---|---|
| C-G1 | Slots mastigados com score e motivo | RPC de leitura retorna slots ordenados, score numérico, decomposição α/β/γ/δ/ε, motivos de aceitação/bloqueio e resource plan | 07 |
| C-G2 | Hold com TTL | Command de hold cria `slot_holds` + `slot_hold_resource_blocks` transacionalmente; retorna `expires_at`, `ttl_seconds`, `hold_token` | 08 |
| C-G3 | Erro `slot_taken` com alternativas | Conflito retorna `SLOT_TAKEN` com `alternatives` calculadas por D07, nunca texto livre | 07/08 |
| C-G4 | Preview de série | Criação de recorrente exige preview recente em `recurring_series_previews`; preview lista ocorrências, conflitos, feriados e alternativas | 09 |
| C-G5 | Grupos vinculado/independente distintos | Banco possui subtabelas separadas `linked_booking_group_contracts` e `independent_booking_group_settings`; sem modelo híbrido | 10 |
| C-G6 | Waitlist com posição + evento | Command retorna posição atual e emite outbox; ofertas têm consentimento, expiração e conversão auditável | 08/07 |
| C-G7 | Feriados | D07 consome `holiday_rules` + `holiday_bridge_policies`; slot fechado por feriado retorna `HOLIDAY_CLOSED` com motivo seguro | 07 |
| C-G8 | Leitura paginada | Leituras de agenda, slots, waitlist, séries e grupos usam cursor estável e `page_size` máximo por RPC | 07–10 |

### 3.2 Convenções canônicas do Bloco C

| Item | Regra | Fonte |
|---|---|---|
| Schema tenant | Todas as tabelas D07–D10 ficam em `tenant_core` | [MB §6/D01][SKILL §4] |
| Contratos shared | Erros estruturados e idempotência ficam em `shared`; saga e feriados são tenant-scoped | [MB §7] |
| Timezone | Todo armazenamento é `timestamptz`; geração respeita timezone da unidade herdado de D01/D02 | [SKILL §4][MB §6/D02] |
| Slots | Slot é resposta calculada, não tabela soberana; persistência ocorre só em audit/previews/holds/appointments | [MB §6/D07][MB §7] |
| Locks | Conflito real é bloqueado no banco por constraints `EXCLUDE USING gist` com range temporal em `schedule_blocks`, `slot_hold_resource_blocks`, `appointment_resource_blocks` e pausas recorrentes; validação de aplicação é secundária | [MB §10/Gate04][RM §4 #40] |
| Chain Booking | Usa `service_chain_components` preservado do Bloco B; D07 calcula segmentos e D08 materializa locks | [RM §4 #28][MB §10/Gate05] |
| Premium Window | Proteção é regra explícita em `premium_window_rules`; override exige motivo e actor | [MB §6/D07][MB §10/Gate08] |
| Recorrente | Série, ocorrência, pausa e cancelamento têm tabelas separadas | [MB §6/D09][MB §10/Gate06] |
| Grupo | Grupo vinculado e independente têm subtabelas distintas; sem semântica híbrida | [MB §6/D10][MB §10/Gate07] |
| Paginação | Leituras retornam `items`, `next_cursor`, `has_more`, `total_estimated` quando permitido | [C-G8] |
| Erro | Todo RPC externo retorna `shared.structured_command_result` ou tabela com `error_code` e `error_context` seguros | [DF-01] |
| Idempotência | Todo Command D08–D10 e worker D07/D09 registra replay conforme DF-02 | [DF-02][SKILL §4] |
| Exclusion constraints | Toda janela concorrente de agenda usa constraint de banco `EXCLUDE USING gist` com `tstzrange` para `timestamptz` e `daterange` para datas; B-tree/unique simples não prova Gate 04 | [MB §10/Gate04][SKILL §4] |

### 3.3 Mapa Bloco C — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 011 | `shared` + `tenant_core` | Fundação C / D02 adendo / D03 adendo | Catálogo de erro, tipo composto `shared.structured_command_result`, contrato de idempotência, saga signup, holiday bridge policy | Gate 00 [MB §10] |
| 012 | `tenant_core` | 07 | Scheduling Engine, settings, score logs, premium rules, calendar resolution, gap recovery, utilization | Gate 03 / Gate 05 / Gate 08 [MB §10] |
| 013 | `tenant_core` | 08 | Schedule blocks, holds, appointment truth, resource locks, waitlist, snapshots, cancellations | Gate 04 / Gate 09 [MB §10] |
| 014 | `tenant_core` | 09 | Recurring series, previews, occurrences, pauses, cancellation requests, financial snapshots | Gate 06 [MB §10] |
| 015 | `tenant_core` | 10 | Booking groups, linked/independent submodels, members, payment modes, links, notifications | Gate 07 estrutural parcial; Gate 07 completo após D12 [MB §10] |

### 3.4 Contratos fundacionais materializados na migration 011

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `shared.error_code_catalog` | Catálogo canônico de erros estruturados | PK `error_code`; `domain_code`; `severity`; `http_status`; `retryable`; `user_message_key`; `redaction_level`; `created_at`; `retired_at`; unique ativo por `error_code` | RLS_ENABLED = SIM; REVOKE ALL explícito de PUBLIC, anon, authenticated; leitura somente `app_backend_read_executor`, `app_backend_command_executor` e `app_worker_executor`; escrita somente migration/governance |
| `shared.structured_command_result` | Tipo composto canônico de retorno de RPCs externos do Bloco C | Campos obrigatórios: `success boolean`; `result_payload jsonb`; `error_code text`; `error_context jsonb`; `alternatives jsonb`; `idempotency_replay boolean`; `request_id text`; FK lógica `error_code` → `shared.error_code_catalog.error_code` quando `success=false` | Tipo composto em `shared`; sem RLS por não ser tabela; uso obrigatório nas assinaturas D07–D10 |
| `tenant_core.holiday_bridge_policies` | Política de ponte por unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `policy_name`; `trigger_kind holiday_bridge_trigger_kind`; `action holiday_bridge_action`; `starts_offset_days int`; `ends_offset_days int`; `opens_at time`; `closes_at time`; `requires_manual_confirmation boolean`; `is_active`; unique ativo `(tenant_id,business_unit_id,policy_name)`; check horário quando ação abre/reduz | RLS_ENABLED = SIM; owner/admin/manager lê; escrita via D02 setup Command |
| `tenant_core.signup_saga_runs` | Execução da saga de signup | PK `id`; FK `tenant_id`; `saga_version`; `status`; `started_at`; `finished_at`; `failed_step_key`; `failure_error_code`; `compensation_status`; `idempotency_key unique`; `result`; append-only lógico | RLS_ENABLED = SIM; platform/onboarding Command escreve; tenant owner lê resumo |
| `tenant_core.signup_saga_steps` | Passos e compensações da saga | PK `id`; FK `saga_run_id`; `step_order`; `step_key`; `status`; `started_at`; `finished_at`; `compensation_action`; `compensated_at`; `error_code`; `metadata`; unique `(saga_run_id,step_order)` | RLS_ENABLED = SIM; escrita worker; leitura owner/admin quando ativo |

### 3.5 Enums fundacionais do Bloco C

| Tipo | Valores |
|---|---|
| `error_severity` | `info`, `warning`, `blocking`, `critical` |
| `error_redaction_level` | `public_safe`, `tenant_safe`, `internal_only` |
| `signup_saga_status` | `created`, `running`, `succeeded`, `failed`, `compensating`, `compensated`, `blocked_manual_review` |
| `signup_saga_step_status` | `pending`, `running`, `succeeded`, `failed`, `skipped`, `compensated` |
| `signup_compensation_status` | `not_needed`, `pending`, `running`, `succeeded`, `failed_manual_review` |
| `holiday_bridge_trigger_kind` | `day_before_holiday`, `day_after_holiday`, `between_holiday_and_weekend`, `custom_offset_window` |
| `holiday_bridge_action` | `close_full_day`, `open_special_hours`, `reduce_hours`, `manual_review_required` |

### 3.6 Políticas RLS fundacionais da migration 011

| Objeto | Operação | Papel | Política |
|---|---|---|---|
| `shared.error_code_catalog` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; nenhum acesso direto |
| `shared.error_code_catalog` | SELECT | `app_backend_read_executor`, `app_backend_command_executor`, `app_worker_executor` | Leitura de códigos ativos; `redaction_level` controla o que pode sair no envelope |
| `shared.error_code_catalog` | INSERT/UPDATE | migration/governance trusted | Escrita fora de runtime tenant; código retirado usa `retired_at`; sem DELETE físico |
| `tenant_core.holiday_bridge_policies` | SELECT | owner/admin/manager; engine read | tenant atual; D07 consome somente via contexto tenant |
| `tenant_core.signup_saga_runs` | SELECT | platform/onboarding; tenant owner após ativação | tenant atual; resumo sem payload sensível |
| `tenant_core.signup_saga_steps` | SELECT | platform/onboarding; tenant owner após ativação | tenant atual; steps redigidos quando necessário |

---

## 4. Especificação por domínio

## Domínio 07 — SMART Scheduling Engine

### 07.1 Responsabilidade

O Domínio 07 é dono do cálculo backend-only de disponibilidade, slot score, gap prevention, gap recovery, chain booking, resource locking plan, premium window protection, multi-service aggregation, processing pause optimization, Booking Candidate Contract, Smart Gap Law e ranking de utilização. Não é dono da mutação final de agenda, checkout, pagamento, ledger, comissão ou comunicação externa; ele calcula, explica e gera candidatos, enquanto D08/D09/D10 executam Commands. [MB4.0 §6.0][MB4.0 §6/D07][MB4.0 §7][BP3.0 §C]

### 07.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.agenda_geometry_settings` | Configuração dos pesos e modo da engine por unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `engine_version int`; `slot_generation_mode slot_generation_mode`; pesos `alpha_gap_weight`, `beta_adjacency_weight`, `gamma_revenue_preservation_weight`, `delta_utilization_weight`, `epsilon_preference_weight numeric(6,3)`; `slot_minimum_threshold_minutes`; `max_recommended_slots`; `protect_premium_anchor_windows`; `allow_chain_booking`; `allow_concurrent_non_competing_services`; `simplify_adjacent_buffers`; `settings`; unique `(tenant_id,business_unit_id)`; check soma dos pesos > 0 | RLS_ENABLED = SIM; tenant atual; escrita owner/admin/manager via Command |
| `tenant_core.availability_query_audit_logs` | Auditoria de consultas de disponibilidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `actor_membership_id uuid`; `worker_run_id uuid`; `client_id`; `requested_service_ids uuid[]`; `window_start`; `window_end`; `query_payload_hash`; `result_count`; `blocked_count`; `engine_version`; `created_at`; append-only; check exclusivo: exatamente um entre `actor_membership_id` e `worker_run_id` deve estar presente; FK composta `(tenant_id, actor_membership_id)` → `tenant_core.memberships(tenant_id,id)` quando chamada humana; `worker_run_id` referencia run técnico D07 quando chamada de worker | RLS_ENABLED = SIM; leitura owner/admin/manager; staff conforme permissão de agenda; escrita engine read Command |
| `tenant_core.slot_score_audit_logs` | Prova do score de cada slot retornado, reservado ou promovido a Booking Candidate | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK opcional `availability_query_audit_id`; `slot_token text`; `starts_at`; `ends_at`; `staff_id`; `resource_plan jsonb`; `largest_slot_min int CHECK > 0`; `gap_score`; `adjacency_score`; `revenue_preservation_score`; `utilization_score`; `preference_score`; `final_score numeric(8,3)`; `score_reasons jsonb`; `block_reasons jsonb`; `engine_version`; `created_at`; unique `(tenant_id,slot_token)` | RLS_ENABLED = SIM; leitura gerencial e auditoria; escrita engine; `largest_slot_min` materializa Smart Gap Law [MB4.0 §6/D07] |
| `tenant_core.booking_candidates` | Candidato soberano de booking gerado pelo backend antes de hold/confirm | PK `id uuid`; FK `tenant_id`; FK `business_unit_id`; FK `client_id` nullable; `request_session_id uuid`; `status booking_candidate_status`; `largest_slot_min int CHECK > 0`; `slot_token text`; `service_sequence jsonb`; `gap_score numeric(8,3)`; `adjacency_score numeric(8,3)`; `final_score numeric(8,3)`; `score_reasons jsonb`; `engine_version text`; `expires_at timestamptz`; `converted_appointment_id uuid` nullable FK; `created_at timestamptz`; constraint lógica: `largest_slot_min = MAX(slot_minutes)` dos itens em `service_sequence`; índices `(tenant_id, request_session_id, final_score DESC)` e `(tenant_id, status, expires_at)` | RLS_ENABLED = SIM; escrita por `command_generate_booking_candidates`; confirmação por D08; cliente/PWA lê próprios candidatos via RPC segura [MB4.0 §6.0][MB4.0 §6/D07] |

| `tenant_core.premium_window_rules` | Regras explícitas de proteção de janelas premium | PK `id`; FK `tenant_id`; FK `business_unit_id`; `rule_name`; `weekday int`; `starts_at time`; `ends_at time`; `min_revenue_per_minute_cents bigint`; `allowed_service_category_ids uuid[]`; `override_permission_key`; `is_active`; `valid_from`; `valid_until`; constraints horário/período; não-sobreposição por `(tenant_id,business_unit_id,weekday)` quando ativa | RLS_ENABLED = SIM; owner/admin lê/escreve via Command |
| `tenant_core.gap_recovery_runs` | Execuções assíncronas de recuperação de gaps | PK `id`; FK `tenant_id`; FK `business_unit_id`; `run_status gap_recovery_status`; `window_start`; `window_end`; `candidate_count`; `action_request_count`; `converted_count`; `started_at`; `finished_at`; `result jsonb`; append-only | RLS_ENABLED = SIM; leitura owner/admin/manager; escrita worker |
| `tenant_core.staff_utilization_snapshots` | Snapshot reconstruível de utilização por profissional | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `staff_id`; `snapshot_date date`; `booked_minutes`; `available_minutes`; `utilization_score numeric(6,2)`; `revenue_preservation_score numeric(6,2)`; `source_run_id`; `created_at`; unique `(tenant_id,staff_id,snapshot_date,source_run_id)` | RLS_ENABLED = SIM; owner/admin/manager lê; staff lê próprio resumo permitido; escrita worker |
| `tenant_core.scheduling_calendar_resolution_runs` | Run reconstruível que resolve feriados, pontes e exceções para a malha de slots | PK `id`; FK `tenant_id`; FK `business_unit_id`; `window_start date`; `window_end date`; `source_hash`; `status calendar_resolution_status`; `triggered_by_kind calendar_resolution_trigger_kind`; `triggered_by_worker_role text`; `triggered_by_user_id uuid`; `source_outbox_event_id uuid`; `started_at`; `finished_at`; `result jsonb`; append-only; check: worker run exige `triggered_by_worker_role`; execução manual exige `triggered_by_user_id` | RLS_ENABLED = SIM; leitura gerencial; escrita engine worker |
| `tenant_core.scheduling_calendar_exceptions` | Read model reconstruível de fechamento/abertura por data | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `resolution_run_id`; `exception_date date`; `exception_kind calendar_exception_kind`; `is_closed`; `opens_at time`; `closes_at time`; `source_table`; `source_id`; `reason`; unique `(tenant_id,business_unit_id,exception_date,source_table,source_id)` | RLS_ENABLED = SIM; engine lê; owner/admin lê; escrita worker |

**Inventário RLS efetiva D07:** todas as tabelas acima têm `RLS_ENABLED = SIM` na migration 012 antes de grants. [MB §7][MB §10/Gate01]

### 07.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `slot_generation_mode` | `base_grid`, `service_duration`, `hybrid` |
| `booking_candidate_status` | `generated`, `held`, `confirmed`, `expired`, `rejected` |
| `booking_intent_status` | `draft`, `candidates_generated`, `confirmed`, `cancelled`, `expired` |
| `booking_intent_mode` | `single_staff`, `team_optimized` |
| `booking_intent_item_status` | `pending`, `assigned`, `cancelled` |

| `gap_recovery_status` | `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| `calendar_resolution_status` | `queued`, `running`, `succeeded`, `failed`, `invalidated` |
| `calendar_exception_kind` | `holiday_closed`, `holiday_special_open`, `bridge_closed`, `bridge_special_hours`, `business_closed`, `manual_exception` |
| `slot_block_reason` | `staff_unavailable`, `client_unavailable`, `resource_unavailable`, `holiday_closed`, `premium_window_protected`, `outside_business_hours`, `chain_component_conflict`, `hold_conflict`, `appointment_conflict` |
| `slot_explanation_reason` | `gap_fit`, `adjacent_to_existing`, `high_revenue_preserved`, `staff_utilization_balanced`, `client_preference_matched`, `resource_fit`, `chain_booking_fit`, `premium_window_ok` |

### 07.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.read_smart_slots` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_service_ids uuid[], p_preferred_staff_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_constraints jsonb, p_page_size int, p_page_cursor text) returns table(items jsonb, next_cursor text, has_more boolean, error_code text, error_context jsonb)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | API backend read; recepção/PWA via backend |
| `tenant_core.command_generate_booking_candidates` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_service_sequence jsonb, p_date date, p_idempotency_key text, p_booking_intent_id uuid DEFAULT NULL) returns table(candidate_id uuid, slot_token text, starts_at timestamptz, final_score numeric, gap_class text, largest_slot_min int)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Assinatura única v4.0; quando `p_booking_intent_id` presente, lê D08 intent/items; quando nulo, usa `p_service_sequence` recebido pela Reception/PWA API [MB4.0 §6.0][MB4.0 §6/D07] |

| `tenant_core.read_slot_alternatives` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_failed_slot_token text, p_reason_code text, p_page_size int, p_page_cursor text) returns table(items jsonb, next_cursor text, has_more boolean, error_code text)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | API backend read após `SLOT_TAKEN` |
| `tenant_core.command_update_agenda_geometry_settings` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_patch jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin/manager Command |
| `tenant_core.command_upsert_premium_window_rule` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_rule_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_run_calendar_resolution` | `(p_business_unit_id uuid, p_window_start date, p_window_end date, p_triggered_by_kind calendar_resolution_trigger_kind, p_triggered_by_worker_role text, p_triggered_by_user_id uuid, p_source_outbox_event_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Scheduling worker |
| `tenant_core.command_run_gap_recovery` | `(p_business_unit_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Scheduling worker |
| `tenant_core.command_rebuild_staff_utilization_snapshot` | `(p_business_unit_id uuid, p_snapshot_date date, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Analytics/scheduling worker |

**Pré-condições obrigatórias D07:**

| RPC | Pré-condições |
|---|---|
| `read_smart_slots` | valida membership ativa de `p_actor_user_id`; lê D02 business_hours/holiday_rules/holiday_bridge_policies; lê D05 staff_working_hours; lê D06 service duration/yield/chain; lê D11 resource availability/capacity; grava `availability_query_audit_logs.actor_membership_id` e `slot_score_audit_logs` para slots retornados ou bloqueados relevantes |
| `command_generate_booking_candidates` | valida membership ativa; valida serviços e profissionais no tenant; quando `p_booking_intent_id` existe, lê `booking_intents`/`booking_intent_items`; calcula `largest_slot_min = MAX(slot_minutes)`; aplica Smart Gap Law; grava `booking_candidates` com `status='generated'`; grava/relaciona `slot_score_audit_logs`; retorna candidatos por `final_score DESC` com `gap_class` `recommended`, `neutral` ou `hole`; nunca retorna slot em conflito; se violar Smart Gap Law retorna `SMART_GAP_VIOLATION` com alternativas [MB4.0 §6.0][MB4.0 §10/Gate03] |

| `read_slot_alternatives` | exige `p_failed_slot_token` existente em `slot_score_audit_logs` do tenant; recalcula alternativas com mesma janela expandida por política; retorna `SLOT_TAKEN` se nenhuma alternativa segura existir |
| Commands de setting/rules | exigem owner/admin/manager com permission key `scheduling.settings.write`; registram idempotência, audit e outbox |
| Workers | só rodam com `app_worker_executor`; não criam appointment, hold, checkout ou ledger |

### 07.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.agenda_geometry_settings` | SELECT | membro ativo autorizado | `tenant_id = current_setting('hope.tenant_id', true)::uuid`; owner/admin/manager leem; staff lê apenas parâmetros não sensíveis via RPC segura |
| `tenant_core.agenda_geometry_settings` | INSERT/UPDATE | Command trusted | Sem escrita direta; valida permission `scheduling.settings.write` |
| `tenant_core.availability_query_audit_logs` | SELECT | owner/admin/manager/reception | tenant atual; campos de payload sensível filtrados por RPC |
| `tenant_core.slot_score_audit_logs` | SELECT | owner/admin/manager/reception | tenant atual; PWA recebe apenas score/motivos seguros, não dados internos de outro staff |
| `tenant_core.premium_window_rules` | SELECT | owner/admin/manager | tenant atual |
| `tenant_core.premium_window_rules` | INSERT/UPDATE | Command trusted | Sem escrita direta; override exige motivo |
| `tenant_core.gap_recovery_runs` | SELECT | owner/admin/manager | tenant atual |
| `tenant_core.staff_utilization_snapshots` | SELECT | owner/admin/manager; staff próprio | gestores veem equipe; staff só próprio resumo quando `staff_id` pertence ao `p_actor_user_id` |
| `tenant_core.scheduling_calendar_*` | SELECT | membro ativo autorizado | tenant atual; leitura segura por unidade |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente a roles técnicos |

### 07.6 Invariantes

1. D07 calcula e ranqueia; D07 não altera agenda sozinho. [MB §6/D07]
2. Slot score é calculado no backend com pesos configuráveis por unidade: α Gap + β Adjacency + γ Revenue Preservation + δ Utilization + ε Preference. [MB §6/D07]
3. Slot retornado precisa ser explicável por `score_reasons` e `block_reasons`; slot sem motivo não passa Gate 03. [MB §10/Gate03]
4. Premium window só pode ser destruída por regra explícita ou override auditado. [MB §10/Gate08]
5. Feriado e ponte vêm de D02; D07 só cria cache reconstruível. [RM §4 #9][DF-07]
6. Chain Booking consome `service_chain_components` preservado; pausa química libera profissional quando permitido e mantém cliente/recurso bloqueados conforme componente. [MB §10/Gate05][RM §4 #28]
7. Gap recovery gera Action Request ou recomendação; não move appointment sem Command autorizado. [MB §7]


8. Smart Gap Law: o backend nunca sugere slot que crie buraco maior que 0 e menor que `largest_slot_min` entre appointments do mesmo profissional, exceto primeiro ou último slot do dia; `largest_slot_min` é o `MAX(slot_minutes)` da sequência do Booking Candidate ou Intent. [MB4.0 §6/D07][MB4.0 §10/Gate03]
9. Booking Candidate é o único caminho canônico para criar appointment via cliente/PWA; D07 gera e ranqueia, D08 confirma em transação única. [MB4.0 §6.0][DEC-CB-13]
10. Violação da Smart Gap Law retorna `SMART_GAP_VIOLATION` com candidatos alternativos; candidato com buraco crítico não pode sair como `recommended`. [MB4.0 §10/Gate03]
11. `largest_slot_min` é obrigatório em `booking_candidates` e `slot_score_audit_logs`; ausência bloqueia Gate 03. [MB4.0 §6.0][MB4.0 §10/Gate03]

### 07.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `scheduling.smart_slots_queried` | `tenant_id`, `business_unit_id`, `query_audit_id`, `result_count`, `request_id` |
| `scheduling.slot_score_audited` | `tenant_id`, `slot_token`, `final_score`, `engine_version` |
| `scheduling.premium_window_rule_changed` | `tenant_id`, `business_unit_id`, `rule_id`, `actor_user_id` |
| `scheduling.calendar_resolution_succeeded` | `tenant_id`, `business_unit_id`, `resolution_run_id`, `window_start`, `window_end` |
| `scheduling.gap_recovery_run_completed` | `tenant_id`, `business_unit_id`, `run_id`, `candidate_count`, `action_request_count` |
| `scheduling.staff_utilization_snapshot_rebuilt` | `tenant_id`, `business_unit_id`, `snapshot_date`, `source_run_id` |

| `agenda.booking_candidates_generated` | `tenant_id`, `request_session_id`, `candidate_count`, `largest_slot_min` |
| `agenda.booking_candidate_expired` | `tenant_id`, `candidate_id`, `expired_at` |

### 07.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01 Identity & Tenant; 02 Business Setup; 05 People; 06 Catalog; 11 Resources; shared foundation |
| É dependência de | 08 Agenda Core; 09 Recorrente; 10 Grupo; 12 Checkout futuro; 23 CoPilot futuro; 25 Analytics futuro |

### 07.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 03 — Smart Availability | Slots válidos, ordenados por score, explicáveis e sem conflito [MB §10/Gate03] |
| Gate 05 — Chain Booking | Componentes, pausa química, recurso ocupado e profissional liberado quando permitido [MB §10/Gate05] |
| Gate 08 — Premium Window Protection | Janela premium não destruída sem regra explícita [MB §10/Gate08] |
| Gate 00 — Foundation | RLS, seed, funções críticas e integridade inicial antes de operação [MB §10/Gate00] |

| Gate 03 — Smart Availability v4.0 | Fixture combo 40min + 30min com slots 30min e 15min: `command_generate_booking_candidates` retorna `largest_slot_min=30`; candidatos `recommended` têm buraco ≥30min ou zero; candidato com buraco 15min como `recommended` reprova [MB4.0 §10/Gate03] |
| Gate 04 — Appointment Conflict v4.0 | Candidato só é confirmável se D08 revalidar EXCLUDE constraints em transação única [MB4.0 §10/Gate04] |

### 07.10 RAGOV do domínio

**CRÍTICO / CORE / MVP.** [MB §6/D07]

---

## Domínio 08 — Agenda Core

### 08.1 Responsabilidade

O Domínio 08 é dono da verdade operacional de agenda: appointments, holds, Booking Intent, confirmação de Booking Candidate, bloqueios, cancelamentos, remarcações, no-show, waitlist, manual booking validation, origem do agendamento, snapshot de auditoria de geometry score e histórico completo de status. Não calcula soberanamente Slot Score, não cria checkout, pagamento, ledger, comissão ou benefício; consome D07 para cálculo e executa mutações via Command. [MB4.0 §6.0][MB4.0 §6/D08][MB4.0 §7]

### 08.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.schedule_blocks` | Bloqueios operacionais de unidade/staff | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK opcional `staff_id`; `starts_at timestamptz`; `ends_at timestamptz`; `block_kind schedule_block_kind`; `reason`; `created_by`; `created_at`; `updated_at`; check `starts_at < ends_at`; constraint obrigatória de não-sobreposição por staff com `EXCLUDE USING gist` em `(tenant_id, staff_id, tstzrange(starts_at, ends_at, '[)'))` quando `staff_id IS NOT NULL` e `block_kind != 'unit_closed'` | RLS_ENABLED = SIM; tenant atual; escrita via Command |
| `tenant_core.availability_rules` | Regras operacionais adicionais consultadas por D07 e executadas por D08 | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK opcional `staff_id`; `rule_kind availability_rule_kind`; `rule_payload`; `valid_from`; `valid_until`; `is_active`; check vigência; unique ativo por hash de payload | RLS_ENABLED = SIM; tenant atual; escrita gerencial via Command |
| `tenant_core.slot_holds` | Reserva temporária de slot com TTL | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `client_id`; FK `availability_query_audit_id`; `hold_token text unique`; `slot_token`; `starts_at`; `ends_at`; `expires_at`; `status slot_hold_status`; `origin appointment_origin`; `created_by`; `converted_appointment_id`; `metadata`; checks `starts_at < ends_at` e `expires_at > created_at`; índice `(tenant_id,status,expires_at)` | RLS_ENABLED = SIM; cliente vê próprio hold; staff/reception vê tenant conforme permissão |
| `tenant_core.slot_hold_resource_blocks` | Locks provisórios de staff, cliente e recurso durante hold | PK `id`; FK `tenant_id`; FK `slot_hold_id`; FK opcional `staff_id`; FK opcional `client_id`; FK opcional `resource_id`; `resource_kind agenda_resource_lock_kind`; `capacity_unit_index int`; `starts_at timestamptz`; `ends_at timestamptz`; `status resource_block_status`; check alvo presente; três constraints obrigatórias `EXCLUDE USING gist` com `tstzrange(starts_at, ends_at, '[)')`: por `(tenant_id, staff_id)` quando `status='active'`; por `(tenant_id, client_id)` quando `status='active'`; por `(tenant_id, resource_id, capacity_unit_index)` quando `status='active'`; `capacity_unit_index` obrigatório quando `resource_id` presente | RLS_ENABLED = SIM; escrita somente hold Command |
| `tenant_core.appointments` | Appointment como verdade operacional | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `staff_id`; FK opcional `client_id`; FK opcional `slot_hold_id`; FK opcional `recurring_occurrence_id`; FK opcional `booking_group_id`; FK opcional `booking_candidate_id`; `status appointment_status`; `origin appointment_origin`; `starts_at`; `ends_at`; `title`; `notes`; `cancellation_reason`; `no_show_reason`; `booked_with_slot_score`; `slot_score_version`; `slot_recommendation_rank`; `booking_geometry_type`; `slot_score_snapshot`; `created_by`; `updated_by`; `metadata`; checks `starts_at < ends_at`; índices tenant/dia, staff/time, client/time | RLS_ENABLED = SIM; agenda tenant-scoped; cliente só próprio appointment via portal; booking cliente/PWA nasce por Candidate ou entra em `manual_pending_validation` [MB4.0 §6/D08] |
| `tenant_core.appointment_services` | Serviços dentro do appointment | PK `id`; FK `tenant_id`; FK `appointment_id`; FK `service_id`; FK `staff_id`; `status appointment_service_status`; `quantity numeric(12,3)` com serviço inteiro; `price_cents bigint`; `estimated_duration_minutes`; `started_at`; `performed_at`; snapshot de nome/preço/duração; não calcula checkout final | RLS_ENABLED = SIM; tenant atual; escrita Command |
| `tenant_core.appointment_resource_blocks` | Locks efetivos de staff, cliente e recurso do appointment | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `appointment_id`; FK opcional `appointment_service_id`; FK opcional `staff_id`; FK opcional `client_id`; FK opcional `resource_id`; `resource_kind agenda_resource_lock_kind`; `capacity_unit_index int`; `starts_at timestamptz`; `ends_at timestamptz`; `status resource_block_status`; `source`; `metadata`; check alvo presente; três constraints obrigatórias `EXCLUDE USING gist` com `tstzrange(starts_at, ends_at, '[)')`: por `(tenant_id, staff_id)` quando `status='active'`; por `(tenant_id, client_id)` quando `status='active'`; por `(tenant_id, resource_id, capacity_unit_index)` quando `status='active'`; `capacity_unit_index` obrigatório quando `resource_id` presente | RLS_ENABLED = SIM; escrita somente Command; base do Gate 04 |
| `tenant_core.booking_intents` | Intenção multi-serviço antes de reservar slot | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `client_id` nullable; `status booking_intent_status`; `mode booking_intent_mode`; FK `preferred_staff_id` nullable; `requested_date date`; FK `created_by` membership; `created_at timestamptz`; `expires_at timestamptz`; `metadata jsonb`; índice `(tenant_id,business_unit_id,status,requested_date)` | RLS_ENABLED = SIM; PWA/recepção cria via Command; não cria appointment diretamente [MB4.0 §6.0][MB4.0 §6/D08] |
| `tenant_core.booking_intent_items` | Itens sequenciais da intenção multi-serviço | PK `id`; FK `tenant_id`; FK `booking_intent_id`; `seq int CHECK > 0`; FK `service_id`; FK `preferred_staff_id` nullable; `duration_minutes int CHECK > 0`; `slot_minutes int CHECK > 0`; `status booking_intent_item_status`; FK `assigned_staff_id` nullable; unique `(booking_intent_id, seq)` | RLS_ENABLED = SIM; D07 lê para montar `service_sequence` e aplicar `single_staff` ou `team_optimized` [MB4.0 §6.0] |

| `tenant_core.appointment_status_history` | Histórico append-only de status | PK `id`; FK `tenant_id`; FK `appointment_id`; `from_status`; `to_status`; `reason`; `actor_user_id`; `created_at`; append-only | RLS_ENABLED = SIM; leitura tenant autorizada; escrita Command |
| `tenant_core.appointment_audit_snapshots` | Snapshot auditável da geometria, score e locks no booking | PK `id`; FK `tenant_id`; FK `appointment_id`; FK `availability_query_audit_id`; `slot_score_audit_id`; `resource_plan`; `geometry_snapshot`; `price_snapshot`; `created_at`; append-only | RLS_ENABLED = SIM; owner/admin/manager; cliente recebe resumo seguro |
| `tenant_core.appointment_cancellation_requests` | Solicitação auditável de cancelamento/remarcação | PK `id`; FK `tenant_id`; FK `appointment_id`; `request_kind cancellation_request_kind`; `requested_by`; `reason`; `status cancellation_request_status`; `policy_snapshot`; `requested_at`; `resolved_at`; `resolution`; append-only lógico | RLS_ENABLED = SIM; cliente/staff/recepção conforme ownership |
| `tenant_core.waitlist_entries` | Entrada de lista de espera | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `client_id`; FK opcional `preferred_staff_id`; FK opcional `service_id`; `desired_start_date`; `desired_end_date`; `desired_time_windows jsonb`; `min_slot_score`; `status waitlist_status`; `consent_status waitlist_consent_status`; `automation_consent_status waitlist_automation_consent`; `max_acceptable_wait_minutes int CHECK > 0` nullable; `priority_score numeric(8,3)`; `current_position int`; `notes`; `created_by`; `created_at`; `updated_at`; índice `(tenant_id,business_unit_id,status,current_position)` | RLS_ENABLED = SIM; cliente vê própria entrada; automação de buraco só quando consentida [MB4.0 §6.0][MB4.0 §10/Gate09] |
| `tenant_core.waitlist_offers` | Oferta auditável gerada para uma entrada | PK `id`; FK `tenant_id`; FK `waitlist_entry_id`; FK opcional `slot_hold_id`; `offer_status waitlist_offer_status`; `offered_starts_at`; `offered_ends_at`; `staff_id`; `resource_plan`; `expires_at`; `position_at_offer`; `score_snapshot`; `sent_event_id`; `converted_appointment_id`; `offer_incentive_kind waitlist_incentive_kind` nullable; `offer_incentive_value numeric(10,2) CHECK >= 0` nullable; `incentive_action_request_id uuid` nullable FK; `recovery_trigger_kind waitlist_recovery_trigger`; checks expiração; unidade interpretada por `offer_incentive_kind`: `discount_pct` usa percentual, `discount_cents` usa valor em centavos dentro deste campo tipado pelo kind, `priority_upgrade`/`none` usam zero ou nulo; SQL Master não deve materializar dinheiro financeiro fora de `_cents bigint` em tabelas financeiras | RLS_ENABLED = SIM; cliente próprio; incentivo econômico exige Action Request aprovado [MB4.0 §6.0][MB4.0 §10/Gate09][MB4.0 §10/Gate16][DEC-CB-04] |

**Inventário RLS efetiva D08:** todas as tabelas acima têm `RLS_ENABLED = SIM` na migration 013 antes de grants. [MB §7][MB §10/Gate01]

### 08.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `appointment_status` | `draft`, `manual_pending_validation`, `held`, `scheduled`, `confirmed`, `checked_in`, `in_service`, `completed`, `checkout_opened`, `cancelled`, `no_show`, `expired` |
| `appointment_service_status` | `planned`, `started`, `performed`, `skipped`, `cancelled` |
| `slot_hold_status` | `active`, `converted`, `released`, `expired` |
| `appointment_origin` | `owner`, `manager`, `staff`, `reception`, `client`, `whatsapp`, `campaign`, `copilot_booster`, `api`, `smart_slot_recommended`, `smart_gap_reallocated`, `recurring`, `group_linked`, `group_independent` |
| `booking_geometry_type` | `organic`, `smart_slot_recommended`, `smart_gap_reallocated`, `chain_booking_optimized`, `manual_override`, `recurring_materialized`, `group_member_booking` |
| `agenda_resource_lock_kind` | `primary_staff`, `assistant_staff`, `client_presence`, `chair`, `room`, `equipment`, `resource_capacity_unit` |
| `resource_block_status` | `active`, `released`, `cancelled`, `expired` |
| `manual_validation_decision` | `approved`, `rejected`, `request_reschedule` |
| `waitlist_incentive_kind` | `discount_pct`, `discount_cents`, `priority_upgrade`, `none` |
| `waitlist_recovery_trigger` | `manual`, `cancellation_freed_slot`, `no_show_freed_slot`, `gap_optimization` |
| `waitlist_automation_consent` | `granted`, `revoked`, `not_granted` |

| `schedule_block_kind` | `staff_unavailable`, `unit_closed`, `training`, `maintenance`, `manual_hold`, `external_commitment` |
| `availability_rule_kind` | `working_hours`, `break`, `special_open`, `special_closed`, `capacity_override`, `manual_exception` |
| `cancellation_request_kind` | `cancel`, `reschedule`, `no_show_review` |
| `cancellation_request_status` | `requested`, `approved`, `rejected`, `executed`, `cancelled` |
| `waitlist_status` | `waiting`, `offered`, `converted`, `cancelled`, `expired` |
| `waitlist_consent_status` | `granted`, `revoked`, `not_required_internal` |
| `waitlist_offer_status` | `created`, `sent`, `accepted`, `declined`, `expired`, `converted`, `cancelled` |

### 08.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_hold_slot` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_slot_token text, p_ttl_seconds int, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/client booking API |
| `tenant_core.command_release_slot_hold` | `(p_actor_user_id uuid, p_slot_hold_id uuid, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | API backend |
| `tenant_core.command_expire_slot_holds` | `(p_business_unit_id uuid, p_now timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Scheduling worker |
| `tenant_core.command_create_appointment_from_hold` | `(p_actor_user_id uuid, p_slot_hold_id uuid, p_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/PWA API |
| `tenant_core.command_create_manual_appointment` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_service_items jsonb, p_starts_at timestamptz, p_staff_id uuid, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/manager Command; still validates D07 locks |
| `tenant_core.command_create_booking_intent` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_mode booking_intent_mode, p_preferred_staff_id uuid, p_items jsonb, p_requested_date date, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/PWA API; cria intent e itens, sem reservar slot [MB4.0 §6.0] |
| `tenant_core.command_confirm_booking_candidate` | `(p_actor_user_id uuid, p_candidate_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/PWA API após seleção do usuário [MB4.0 §6/D08][DEC-CB-13] |
| `tenant_core.command_validate_manual_booking` | `(p_actor_user_id uuid, p_appointment_id uuid, p_validation_decision manual_validation_decision, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Recepção/manager; promove ou rejeita horário manual [MB4.0 §6/D08] |

| `tenant_core.command_cancel_appointment` | `(p_actor_user_id uuid, p_appointment_id uuid, p_reason text, p_scope cancellation_scope, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Cliente/recepção/manager |
| `tenant_core.command_reschedule_appointment` | `(p_actor_user_id uuid, p_appointment_id uuid, p_new_slot_token text, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/PWA API |
| `tenant_core.command_mark_no_show` | `(p_actor_user_id uuid, p_appointment_id uuid, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/manager Command |
| `tenant_core.command_join_waitlist` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_service_id uuid, p_preferences jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/PWA API |
| `tenant_core.command_generate_waitlist_offer` | `(p_waitlist_entry_id uuid, p_slot_token text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Scheduling/waitlist worker |
| `tenant_core.command_accept_waitlist_offer` | `(p_actor_user_id uuid, p_waitlist_offer_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Client/reception API |
| `tenant_core.read_agenda_page` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_filters jsonb, p_page_size int, p_page_cursor text) returns table(items jsonb, next_cursor text, has_more boolean, error_code text)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | App/PWA/API read |
| `tenant_core.read_waitlist_page` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_filters jsonb, p_page_size int, p_page_cursor text) returns table(items jsonb, next_cursor text, has_more boolean, error_code text)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Reception/manager/client own read |

**Pré-condições obrigatórias D08:**

| RPC | Pré-condições |
|---|---|
| `command_hold_slot` | valida slot_token em `slot_score_audit_logs`; revalida conflitos em transação; cria `slot_holds` + `slot_hold_resource_blocks`; se conflito retorna `SLOT_TAKEN` com alternativas D07; TTL respeita política D02/D08 |
| `command_create_appointment_from_hold` | exige hold ativo, não expirado e pertencente ao tenant atual; em uma única transação: bloqueia a linha do hold e seus blocks, revalida conflito contra holds/appointments ativos, cria appointment/services, cria `appointment_resource_blocks`, registra status/audit/outbox, e só então marca `slot_holds.status='converted'` e `slot_hold_resource_blocks.status='converted'`; não existe etapa posterior para liberar hold |
| `command_create_manual_appointment` | não pula engine: executa validação D07/resource plan dentro da mesma DB transaction do insert de appointment/resource blocks; se outra transação ocupar o intervalo, as constraints `EXCLUDE USING gist` retornam `SLOT_TAKEN` com alternativas; override premium exige permission key e motivo; quando `origin` for `client` ou `whatsapp`, força `status='manual_pending_validation'`; recepção com `origin='reception'` só cria direto `scheduled` se slot validado por D07 [MB4.0 §6/D08] |
| `command_create_booking_intent` | valida serviços/profissionais no tenant; aplica `single_staff` quando `preferred_staff_id` é informado; cria `booking_intents` + `booking_intent_items`; não reserva slot, não cria hold, não cria appointment; emite `agenda.booking_intent_created` [MB4.0 §6.0] |
| `command_confirm_booking_candidate` | exige candidato `status='held'`; candidato expirado retorna `CANDIDATE_EXPIRED`; em uma única transação revalida EXCLUDE constraints de staff/cliente/recurso, cria `appointments`, `appointment_resource_blocks` e `appointment_services`, marca `booking_candidates.status='confirmed'`, preenche `converted_appointment_id` e emite `agenda.booking_candidate_confirmed`; conflito retorna `SLOT_TAKEN`/alternativas [MB4.0 §6/D08][MB4.0 §10/Gate04] |
| `command_validate_manual_booking` | exige appointment `status='manual_pending_validation'`; `approved` muda para `scheduled`; `rejected` muda para `cancelled`; `request_reschedule` mantém `manual_pending_validation` e emite evento para D21; toda decisão grava histórico e outbox [MB4.0 §6/D08][MB4.0 §10/Gate16] |

| `command_cancel_appointment` | aplica política de cancelamento D02; não cria cobrança/pagamento; efeitos financeiros futuros vão para D12/D13 por Action Request quando aplicável |
| `command_join_waitlist` | valida consentimento, serviço, janela e tenant; calcula posição; retorna `current_position`; emite `agenda.waitlist_entry_created` |
| `command_generate_waitlist_offer` | só gera oferta com consentimento ativo; cria hold temporário opcional; retorna posição + evento; expiração auditável |
| `read_agenda_page` | cursor estável por `(starts_at,id)`; `page_size` máximo definido por política backend; staff não vê financeiro alheio |

### 08.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.schedule_blocks` | SELECT | membro ativo autorizado | tenant atual; staff vê bloqueios que afetam sua agenda; gestores veem unidade |
| `tenant_core.schedule_blocks` | INSERT/UPDATE | Command trusted | Sem escrita direta; exige motivo |
| `tenant_core.availability_rules` | SELECT | owner/admin/manager/reception | tenant atual |
| `tenant_core.slot_holds` | SELECT | cliente próprio ou equipe autorizada | cliente vê holds próprios; staff/reception vê por unidade e permissão |
| `tenant_core.slot_holds` | INSERT/UPDATE | Command trusted | Sem escrita direta; TTL e conflito transacionais |
| `tenant_core.slot_hold_resource_blocks` | SELECT | equipe autorizada | tenant atual; cliente não recebe detalhes internos de outro staff/recurso |
| `tenant_core.appointments` | SELECT | cliente próprio, staff envolvido, equipe autorizada | tenant atual; staff agenda global só se policy D02 permitir; cliente próprio no PWA |
| `tenant_core.appointments` | INSERT/UPDATE | Command trusted | Sem escrita direta; status via Command |
| `tenant_core.appointment_services` | SELECT | staff/cliente/equipe autorizada | tenant atual; cliente vê próprios serviços; staff vê serviços próprios/global permitido |
| `tenant_core.appointment_resource_blocks` | SELECT | equipe autorizada | tenant atual; PWA não expõe IDs internos de recurso quando desnecessário |
| `tenant_core.appointment_status_history` | SELECT | equipe autorizada; cliente próprio resumido | tenant atual; append-only |
| `tenant_core.appointment_audit_snapshots` | SELECT | owner/admin/manager/auditor | tenant atual; cliente recebe resumo seguro via RPC |
| `tenant_core.waitlist_entries` | SELECT | cliente próprio ou equipe autorizada | tenant atual; cliente vê posição própria |
| `tenant_core.waitlist_offers` | SELECT | cliente próprio ou equipe autorizada | tenant atual; oferta própria por cliente |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente a roles técnicos |

### 08.6 Invariantes

1. Appointment é verdade operacional; locks são verdade de concorrência. [MB §6/D08][RM §4 #40]
2. Conflito de profissional, cliente e recurso é bloqueado por exclusion constraints em hold e appointment resource blocks. [MB §10/Gate04]
3. Hold ativo tem TTL, expira por worker e não vira appointment depois de expirado. [C-G2]
4. `SLOT_TAKEN` sempre retorna alternativas seguras ou lista vazia explícita. [C-G3]
5. Waitlist sempre retorna posição e emite evento; oferta exige consentimento e expiração. [MB §10/Gate09][C-G6]
6. Appointment orgânico não recebe snapshot falso de score; snapshot existe apenas quando D07 gerou score. [MB §9/MOCKADO]
7. No-show é registrado na agenda; cobrança ou depósito pertence ao Payment Core futuro. [MB §6/D08][MB §6/D13]


8. Booking Candidate confirmado é o caminho canônico do fluxo cliente/PWA multi-serviço; `command_create_appointment_from_hold` permanece válido para fluxo interno de recepção. [MB4.0 §6.0][DEC-CB-13]
9. Multi-Service Booking Intent não cria appointment diretamente; gera candidatos via D07 e só vira agenda por `command_confirm_booking_candidate`. [MB4.0 §6.0]
10. Horário manual inserido por `command_create_manual_appointment` ou via cliente sem `slot_token` validado por D07 recebe `status='manual_pending_validation'`; nunca recebe `scheduled` ou `confirmed` diretamente. [MB4.0 §6/D08]
11. Promoção de `manual_pending_validation` exige `command_validate_manual_booking` com ator autorizado e motivo. [MB4.0 §6/D08][MB4.0 §10/Gate16]
12. Waitlist Recovery com incentivo econômico exige `incentive_action_request_id` aprovado antes de emitir oferta; sem aprovação, oferta sai sem incentivo ou `none`. [MB4.0 §10/Gate09][MB4.0 §10/Gate16]
13. Automação de buraco só ocorre com `automation_consent_status='granted'`; sem consentimento específico, oferta manual apenas. [MB4.0 §6.0][MB4.0 §10/Gate09]
14. `recovery_trigger_kind` é obrigatório e auditável em toda oferta gerada. [MB4.0 §6.0]

### 08.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `agenda.slot_hold_created` | `tenant_id`, `slot_hold_id`, `hold_token`, `expires_at`, `request_id` |
| `agenda.slot_hold_expired` | `tenant_id`, `slot_hold_id`, `expired_at` |
| `agenda.appointment_created` | `tenant_id`, `appointment_id`, `client_id`, `staff_id`, `starts_at`, `origin` |
| `agenda.appointment_rescheduled` | `tenant_id`, `appointment_id`, `old_starts_at`, `new_starts_at`, `reason` |
| `agenda.appointment_cancelled` | `tenant_id`, `appointment_id`, `reason`, `actor_user_id` |
| `agenda.appointment_no_show_marked` | `tenant_id`, `appointment_id`, `client_id`, `reason` |
| `agenda.waitlist_entry_created` | `tenant_id`, `waitlist_entry_id`, `client_id`, `current_position` |
| `agenda.waitlist_offer_created` | `tenant_id`, `waitlist_offer_id`, `waitlist_entry_id`, `position_at_offer`, `expires_at` |
| `agenda.waitlist_offer_converted` | `tenant_id`, `waitlist_offer_id`, `appointment_id` |

| `agenda.booking_candidate_held` | `tenant_id`, `candidate_id`, `slot_token` |
| `agenda.booking_candidate_confirmed` | `tenant_id`, `candidate_id`, `appointment_id` |
| `agenda.booking_intent_created` | `tenant_id`, `booking_intent_id`, `mode`, `item_count` |
| `agenda.booking_intent_confirmed` | `tenant_id`, `booking_intent_id`, `appointment_ids` |
| `agenda.manual_booking_validation_requested` | `tenant_id`, `appointment_id`, `client_id`, `requested_at` |
| `agenda.manual_booking_validated` | `tenant_id`, `appointment_id`, `decision`, `actor_user_id` |
| `agenda.waitlist_recovery_triggered` | `tenant_id`, `waitlist_offer_id`, `recovery_trigger_kind`, `incentive_kind`, `action_request_id` |

### 08.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 02, 05, 06, 07, 11, shared foundation |
| É dependência de | 09 Recorrente; 10 Grupo; 12 Checkout; 13 Payment; 17 Compensation; 21 Messaging; 23 CoPilot; 25 Analytics |

### 08.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 04 — Appointment Conflict | Agenda não permite conflito de recurso crítico ou profissional [MB §10/Gate04] |
| Gate 09 — Waitlist Economic Matching | Matching, consentimento, oferta e conversão auditáveis [MB §10/Gate09] |
| Gate 03 — Smart Availability | Holds e appointments só nascem de slot válido ou override auditado [MB §10/Gate03] |
| Gate 02 — Staff Privacy | Staff vê agenda global permitida e não financeiro alheio [MB §10/Gate02] |

| Gate 03 — Manual Booking Boundary | Booking cliente sem Candidate confirmado entra em `manual_pending_validation`; PWA não confirma agenda direto [MB4.0 §10/Gate03][MB4.0 §6/D19] |
| Gate 04 — Candidate Confirmation | `command_confirm_booking_candidate` revalida locks via EXCLUDE constraints na mesma transação antes de criar appointment [MB4.0 §10/Gate04] |
| Gate 16 — Action Request Safety | Incentivo waitlist e validação manual sensível exigem ator autorizado e trilha auditável [MB4.0 §10/Gate16] |

### 08.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D08]

---

## Domínio 09 — Agendamento Recorrente

### 09.1 Responsabilidade

O Domínio 09 é dono da criação, preview, pausa, materialização, cancelamento de ocorrência e cancelamento de série recorrente. Ele não é dono de appointment individual final, checkout, pagamento, notificação externa ou ledger; ocorrências materializadas viram appointments em D08 e snapshots financeiros permanecem operacionais até D12/D15. [MB §6/D09][MB §7]

### 09.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.recurring_appointment_series` | Série recorrente canônica | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `client_id`; FK opcional `preferred_staff_id`; `series_status recurring_series_status`; `frequency recurring_frequency`; `interval_count int`; `weekday_mask int[]`; `month_day int`; `custom_rule jsonb`; `starts_on date`; `ends_on date`; `default_service_items jsonb`; `default_time time`; `timezone text`; `created_by`; `confirmed_at`; `cancelled_at`; checks frequência/regra; unique ativo por `tenant_id,client_id,series_key_hash` | RLS_ENABLED = SIM; cliente próprio e equipe autorizada |
| `tenant_core.recurring_series_previews` | Preview obrigatório antes de criar/alterar série | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK opcional `series_id`; FK `client_id`; `preview_token text unique`; `requested_rule jsonb`; `window_start date`; `window_end date`; `occurrence_count`; `conflict_count`; `holiday_count`; `status recurring_preview_status`; `expires_at`; `created_by`; `created_at`; append-only | RLS_ENABLED = SIM; cliente próprio/equipe autorizada |
| `tenant_core.recurring_series_preview_items` | Itens do preview por ocorrência proposta | PK `id`; FK `preview_id`; `occurrence_index int`; `proposed_starts_at`; `proposed_ends_at`; `staff_id`; `slot_token`; `status recurring_preview_item_status`; `conflict_error_code`; `alternatives jsonb`; `holiday_reason`; unique `(preview_id,occurrence_index)` | RLS_ENABLED = SIM; leitura pelo preview |
| `tenant_core.recurring_appointment_occurrences` | Ocorrências planejadas/materializadas | PK `id`; FK `tenant_id`; FK `series_id`; FK opcional `appointment_id`; `occurrence_index int`; `scheduled_starts_at`; `scheduled_ends_at`; `status recurring_occurrence_status`; `materialized_at`; `cancelled_at`; `cancellation_reason`; `rescheduled_from_occurrence_id`; unique `(series_id,occurrence_index)` | RLS_ENABLED = SIM; cliente próprio/equipe autorizada |
| `tenant_core.recurring_series_pauses` | Pausas de série sem cancelar | PK `id`; FK `tenant_id`; FK `series_id`; `pause_start date`; `pause_end date`; `reason`; `created_by`; `created_at`; `revoked_at`; constraint obrigatória `EXCLUDE USING gist` por `series_id` com `daterange(pause_start, pause_end, '[]')` enquanto `revoked_at IS NULL` | RLS_ENABLED = SIM; escrita Command |
| `tenant_core.recurring_series_cancellation_requests` | Solicitações de cancelamento de ocorrência ou série | PK `id`; FK `tenant_id`; FK `series_id`; FK opcional `occurrence_id`; `request_scope recurring_cancellation_scope`; `requested_by`; `reason`; `status cancellation_request_status`; `requires_explicit_series_confirmation boolean`; `requested_at`; `resolved_at`; append-only lógico | RLS_ENABLED = SIM; cliente/equipe conforme ownership |
| `tenant_core.recurring_occurrence_financial_snapshots` | Snapshot financeiro operacional por ocorrência | PK `id`; FK `tenant_id`; FK `occurrence_id`; `service_items_snapshot jsonb`; `estimated_total_cents bigint CHECK >= 0`; `deposit_required_cents bigint CHECK >= 0`; `policy_snapshot jsonb`; `source_price_rule_ids uuid[]`; `created_at`; append-only; não cria ledger; proibido como total final de checkout | RLS_ENABLED = SIM; owner/admin/manager; cliente próprio resumo seguro |

**Inventário RLS efetiva D09:** todas as tabelas acima têm `RLS_ENABLED = SIM` na migration 014 antes de grants. [MB §7][MB §10/Gate01]

### 09.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `recurring_series_status` | `draft`, `active`, `paused`, `completed`, `cancelled`, `blocked` |
| `recurring_frequency` | `weekly`, `biweekly`, `monthly`, `custom` |
| `recurring_preview_status` | `created`, `valid`, `has_conflicts`, `expired`, `converted`, `cancelled` |
| `recurring_preview_item_status` | `available`, `conflict`, `holiday_blocked`, `premium_blocked`, `requires_manual_review` |
| `recurring_occurrence_status` | `planned`, `materialized`, `skipped_by_pause`, `cancelled`, `rescheduled`, `failed_conflict` |
| `recurring_cancellation_scope` | `single_occurrence`, `this_and_future`, `entire_series` |

### 09.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.read_recurring_series_preview` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_rule_payload jsonb, p_window_start date, p_window_end date, p_page_size int, p_page_cursor text) returns table(items jsonb, preview_token text, next_cursor text, has_more boolean, error_code text, error_context jsonb)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Reception/PWA preview |
| `tenant_core.command_create_recurring_series` | `(p_actor_user_id uuid, p_preview_token text, p_confirmation_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/PWA Command |
| `tenant_core.command_pause_recurring_series` | `(p_actor_user_id uuid, p_series_id uuid, p_pause_start date, p_pause_end date, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/client/manager |
| `tenant_core.command_cancel_recurring_occurrence` | `(p_actor_user_id uuid, p_occurrence_id uuid, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/client/manager |
| `tenant_core.command_cancel_recurring_series` | `(p_actor_user_id uuid, p_series_id uuid, p_reason text, p_explicit_confirmation boolean, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/client/manager |
| `tenant_core.command_materialize_recurring_occurrence` | `(p_occurrence_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Recurring worker |
| `tenant_core.read_recurring_series_page` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_filters jsonb, p_page_size int, p_page_cursor text) returns table(items jsonb, next_cursor text, has_more boolean, error_code text)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | App/PWA read |

**Pré-condições obrigatórias D09:**

| RPC | Pré-condições |
|---|---|
| `read_recurring_series_preview` | usa D07 para cada ocorrência proposta; grava preview e items; lista conflitos, feriados e alternativas; expira por TTL; retorna C-G4 |
| `command_create_recurring_series` | exige preview válido, não expirado, mesmo payload hash e sem conflitos bloqueantes; cria série + ocorrências planejadas + snapshots financeiros operacionais |
| `command_pause_recurring_series` | pausa não cancela série; ocorrências dentro da pausa viram `skipped_by_pause` se ainda não materializadas |
| `command_cancel_recurring_occurrence` | cancela apenas a ocorrência; não altera série; se appointment já existe chama D08 cancel Command com escopo de ocorrência |
| `command_cancel_recurring_series` | exige `p_explicit_confirmation = true`; registra request; cancela futuras ocorrências sem apagar histórico |
| `command_materialize_recurring_occurrence` | cria appointment via D08 Command a partir de slot validado; se conflito retorna `RECURRING_OCCURRENCE_CONFLICT` e oferece waitlist/reagendamento prioritário |

### 09.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.recurring_appointment_series` | SELECT | cliente próprio/equipe autorizada | tenant atual; cliente somente próprias séries |
| `tenant_core.recurring_appointment_series` | INSERT/UPDATE | Command trusted | Sem escrita direta |
| `tenant_core.recurring_series_previews` | SELECT | cliente próprio/equipe autorizada | tenant atual; preview expira e é append-only |
| `tenant_core.recurring_series_preview_items` | SELECT | via preview autorizado | tenant atual por join com preview |
| `tenant_core.recurring_appointment_occurrences` | SELECT | cliente próprio/equipe autorizada | tenant atual; filtro por series ownership |
| `tenant_core.recurring_series_pauses` | SELECT | cliente próprio/equipe autorizada | tenant atual |
| `tenant_core.recurring_series_cancellation_requests` | SELECT | cliente próprio/equipe autorizada | tenant atual; append-only lógico |
| `tenant_core.recurring_occurrence_financial_snapshots` | SELECT | owner/admin/manager; cliente próprio resumo | sem financeiro de staff; não expõe comissão |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente a roles técnicos |

### 09.6 Invariantes

1. Cancelar uma ocorrência nunca cancela a série sem confirmação explícita. [MB §6/D09]
2. Criação de série exige preview recente e válido. [C-G4]
3. Pausa de série não apaga ocorrências; altera status planejado e mantém histórico. [MB §6/D09]
4. No-show é aplicado por ocorrência, não pela série inteira. [MB §6/D09]
5. Snapshot financeiro por ocorrência é operacional, reconstruível e não ledger. [MB §6/D09][MB §7]
6. Recorrente não cria appointment em conflito; materialização usa D08 e D07. [MB §10/Gate06]


6. Ocorrência recorrente materializada após criação da série usa Availability/Booking Candidate quando houver booking online ou alteração de slot; D09 não cria appointment sem passar pelos locks de D08. [MB4.0 §6/D09][MB4.0 §6.0]
7. Waitlist Recovery acionada por cancelamento, no-show ou gap optimization mantém oferta em D08 e mensageria em D21; D09 apenas fornece contexto de recorrência quando a vaga liberada veio de série. [MB4.0 §6.0][MB4.0 §10/Gate09]

### 09.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `recurring.preview_created` | `tenant_id`, `preview_token`, `client_id`, `occurrence_count`, `conflict_count` |
| `recurring.series_created` | `tenant_id`, `series_id`, `client_id`, `frequency`, `occurrence_count` |
| `recurring.series_paused` | `tenant_id`, `series_id`, `pause_start`, `pause_end`, `reason` |
| `recurring.occurrence_materialized` | `tenant_id`, `series_id`, `occurrence_id`, `appointment_id` |
| `recurring.occurrence_cancelled` | `tenant_id`, `series_id`, `occurrence_id`, `reason` |
| `recurring.series_cancelled` | `tenant_id`, `series_id`, `reason`, `actor_user_id` |
| `recurring.occurrence_conflict_detected` | `tenant_id`, `series_id`, `occurrence_id`, `error_code`, `alternatives` |

### 09.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 02, 05, 06, 07, 08, 11 |
| É dependência de | 12 Checkout futuro; 13 Payment futuro; 21 Messaging futuro; 23 CoPilot futuro; 25 Analytics futuro |

### 09.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 06 — Recurring Appointment | Série criada, pausada, ocorrência cancelada e série cancelada sem efeito colateral [MB §10/Gate06] |
| Gate 04 — Appointment Conflict | Ocorrência materializada não cria conflito [MB §10/Gate04] |
| Gate 09 — Waitlist Economic Matching | Conflito de ocorrência pode gerar oferta prioritária auditável [MB §10/Gate09] |

| Gate 09 — Waitlist Recovery v4.0 | Buraco liberado por ocorrência recorrente pode acionar waitlist somente com consentimento específico e oferta auditável D08/D21 [MB4.0 §10/Gate09] |

### 09.10 RAGOV do domínio

**REAL / MVP.** [MB §6/D09]

---

## Domínio 10 — Agendamento em Grupo

### 10.1 Responsabilidade

O Domínio 10 é dono dos modelos de agendamento em grupo vinculado e independente, seus membros, convites, política de cancelamento de grupo e notificações por membro. Não é dono de appointment individual final, checkout, pagamento, ledger ou mensageria externa; appointments são criados no D08, checkout futuro é D12 e comunicação externa futura é D21. [MB §6/D10][MB §7]

### 10.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.booking_groups` | Registro base do grupo | PK `id`; FK `tenant_id`; FK `business_unit_id`; `group_model booking_group_model`; `group_status booking_group_status`; `title`; `event_date date`; `starts_at`; `ends_at`; `created_by`; `created_at`; `updated_at`; `cancelled_at`; check `starts_at < ends_at` quando preenchido | RLS_ENABLED = SIM; membros/equipe autorizada |
| `tenant_core.linked_booking_group_contracts` | Submodelo de grupo vinculado | PK `id`; FK unique `booking_group_id`; FK `responsible_client_id`; `checkout_policy linked_group_checkout_policy`; `cancellation_policy linked_group_cancellation_policy`; `responsible_confirmation_required boolean`; `financial_responsibility_snapshot jsonb`; constraint: grupo precisa ser `linked` via Command e gate assertion | RLS_ENABLED = SIM; responsável/equipe autorizada |
| `tenant_core.independent_booking_group_settings` | Submodelo de grupo independente | PK `id`; FK unique `booking_group_id`; `share_code text unique`; `proximity_window_minutes int`; `no_financial_link boolean default true`; `individual_cancellation_only boolean default true`; constraint: grupo precisa ser `independent` via Command e gate assertion | RLS_ENABLED = SIM; membros/equipe autorizada |
| `tenant_core.booking_group_members` | Membros/beneficiários do grupo | PK `id`; FK `tenant_id`; FK `booking_group_id`; FK opcional `client_id`; FK opcional `appointment_id`; `member_name_snapshot`; `member_contact_hash`; `member_status booking_group_member_status`; `member_role booking_group_member_role`; `preferred_service_ids uuid[]`; `notification_consent_status`; `created_at`; `updated_at`; unique ativo `(booking_group_id,client_id)` quando `client_id` existe | RLS_ENABLED = SIM; membro próprio/responsável/equipe |
| `tenant_core.booking_group_payment_modes` | Modo de pagamento planejado para grupo vinculado | PK `id`; FK `tenant_id`; FK `booking_group_id`; FK composta `(tenant_id, responsible_client_id)` → `tenant_core.clients(tenant_id,id)`; `payment_mode group_payment_mode`; `split_strategy group_split_strategy`; `responsible_client_id`; `member_rules jsonb`; `created_at`; `updated_at`; check permitido somente para grupo vinculado via Command; `responsible_client_id` obrigatório para `unified` ou `responsible_pays_all`; não cria cobrança | RLS_ENABLED = SIM; responsável/equipe; cliente vê próprio resumo; predicado tenant explícito |
| `tenant_core.group_invitation_links` | Link/código de convite para grupo | PK `id`; FK `tenant_id`; FK `booking_group_id`; `invite_code_hash unique`; `status invitation_link_status`; `expires_at`; `max_uses`; `used_count`; `created_by`; `created_at`; check `used_count <= max_uses` quando max_uses não nulo | RLS_ENABLED = SIM; equipe/responsável; leitura pública nunca direta à tabela |
| `tenant_core.group_member_notifications` | Registro de notificação por membro | PK `id`; FK `tenant_id`; FK `booking_group_id`; FK `booking_group_member_id`; `notification_kind group_notification_kind`; `channel_kind text`; `status group_notification_status`; `scheduled_at`; `sent_at`; `outbox_event_id`; `payload_redacted jsonb`; append-only | RLS_ENABLED = SIM; equipe autorizada; membro próprio resumo |

**Inventário RLS efetiva D10:** todas as tabelas acima têm `RLS_ENABLED = SIM` na migration 015 antes de grants. [MB §7][MB §10/Gate01]

### 10.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `booking_group_model` | `linked`, `independent` |
| `booking_group_status` | `draft`, `inviting`, `partially_scheduled`, `scheduled`, `completed`, `cancelled`, `expired` |
| `booking_group_member_status` | `invited`, `accepted`, `scheduled`, `cancelled`, `declined`, `no_show`, `completed` |
| `booking_group_member_role` | `responsible`, `beneficiary`, `independent_member`, `guest` |
| `linked_group_checkout_policy` | `unified_responsible`, `split_by_member`, `decide_at_checkout` |
| `linked_group_cancellation_policy` | `cancel_all_with_confirmation`, `cancel_member_only`, `manual_review_required` |
| `group_payment_mode` | `unified`, `split`, `individual` |
| `group_split_strategy` | `equal_split`, `per_member_items`, `responsible_pays_all`, `manual_at_checkout` |
| `invitation_link_status` | `active`, `expired`, `revoked`, `max_used` |
| `group_notification_kind` | `invitation`, `confirmation`, `reschedule`, `cancellation`, `reminder`, `member_update` |
| `group_notification_status` | `queued`, `sent`, `failed`, `cancelled`, `skipped_no_consent` |

### 10.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_linked_booking_group` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_responsible_client_id uuid, p_group_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/manager/PWA responsible |
| `tenant_core.command_create_independent_booking_group` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_group_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/manager/PWA |
| `tenant_core.command_add_linked_group_member` | `(p_actor_user_id uuid, p_booking_group_id uuid, p_client_id uuid, p_member_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Responsible/reception |
| `tenant_core.command_join_independent_group` | `(p_actor_user_id uuid, p_invite_code text, p_client_id uuid, p_member_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | PWA/reception |
| `tenant_core.command_schedule_group_member` | `(p_actor_user_id uuid, p_booking_group_member_id uuid, p_slot_token text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Reception/PWA |
| `tenant_core.command_cancel_group_member` | `(p_actor_user_id uuid, p_booking_group_member_id uuid, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Member/responsible/reception |
| `tenant_core.command_cancel_linked_booking_group` | `(p_actor_user_id uuid, p_booking_group_id uuid, p_reason text, p_cancel_all_confirmation boolean, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Responsible/reception/manager |
| `tenant_core.command_create_group_invitation_link` | `(p_actor_user_id uuid, p_booking_group_id uuid, p_expires_at timestamptz, p_max_uses int, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Responsible/reception |
| `tenant_core.command_enqueue_group_member_notification` | `(p_booking_group_member_id uuid, p_notification_kind group_notification_kind, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Group/messaging worker |
| `tenant_core.read_booking_group_page` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_filters jsonb, p_page_size int, p_page_cursor text) returns table(items jsonb, next_cursor text, has_more boolean, error_code text)` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | App/PWA/API read |

**Pré-condições obrigatórias D10:**

| RPC | Pré-condições |
|---|---|
| `command_create_linked_booking_group` | cria `booking_groups(group_model='linked')` + `linked_booking_group_contracts`; exige responsável; valida por FK/predicado que `p_responsible_client_id` pertence ao mesmo `tenant_id` e `business_unit_id` permitido; não cria `independent_booking_group_settings` |
| `command_create_independent_booking_group` | cria `booking_groups(group_model='independent')` + `independent_booking_group_settings`; proíbe responsável financeiro compartilhado |
| `command_add_linked_group_member` | só aceita grupo vinculado; responsável ou equipe autorizada; notificação por membro gera outbox |
| `command_join_independent_group` | só aceita grupo independente; valida link ativo, max_uses e expiração; sem vínculo financeiro entre membros |
| `command_schedule_group_member` | usa D07/D08; cada membro recebe appointment próprio; conflito retorna `GROUP_MEMBER_CONFLICT` com alternativas |
| `command_cancel_group_member` | grupo independente: cancela só membro; grupo vinculado: segue policy e confirmação |
| `command_cancel_linked_booking_group` | se policy cancela todos, exige `p_cancel_all_confirmation = true`; não afeta grupos independentes |

### 10.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.booking_groups` | SELECT | membro do grupo, responsável, equipe autorizada | tenant atual; membership ou vínculo de cliente |
| `tenant_core.booking_groups` | INSERT/UPDATE | Command trusted | Sem escrita direta |
| `tenant_core.linked_booking_group_contracts` | SELECT | responsável/equipe autorizada | tenant atual; membros recebem apenas resumo permitido |
| `tenant_core.independent_booking_group_settings` | SELECT | membros/equipe autorizada | tenant atual; sem dados financeiros compartilhados |
| `tenant_core.booking_group_members` | SELECT | membro próprio, responsável de grupo vinculado, equipe | tenant atual |
| `tenant_core.booking_group_payment_modes` | SELECT | responsável/equipe; membro próprio resumo | `tenant_id = current_setting('hope.tenant_id', true)::uuid` e `responsible_client_id IN (SELECT id FROM tenant_core.clients WHERE tenant_id = current_setting('hope.tenant_id', true)::uuid)`; permitido apenas para grupo vinculado; membro vê somente resumo próprio redigido |
| `tenant_core.group_invitation_links` | SELECT | responsável/equipe | tabela bruta não é pública; invite público passa por RPC segura |
| `tenant_core.group_member_notifications` | SELECT | membro próprio/equipe | tenant atual; payload redigido |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente a roles técnicos |

### 10.6 Invariantes

1. Grupo vinculado e grupo independente são distintos no banco: base comum + uma subtabela obrigatória e exclusiva por modelo. [MB §6/D10]
2. Não existe modelo híbrido implícito; tentativa de misturar regras retorna `GROUP_MODEL_VIOLATION`. [MB §6/D10][C-G5]
3. Grupo vinculado exige responsável e pode ter checkout unificado ou dividido no futuro; não cria cobrança neste bloco. [MB §6/D10][MB §10/Gate07]
4. Grupo independente não possui vínculo financeiro entre membros; cancelamento individual não afeta os demais. [MB §6/D10]
5. Cada membro agendado materializa appointment próprio em D08; grupo não substitui appointment. [MB §6/D08][MB §6/D10]
6. Notificação individual por membro gera outbox; envio externo pertence ao D21 futuro. [MB §6/D10][MB §7]


6. Agendamento em grupo não substitui Booking Intent; quando o fluxo cliente/PWA envolve múltiplos serviços ou múltiplos profissionais, D10 consome `booking_intents`/candidates em vez de criar appointment direto. [MB4.0 §6.0][DEC-CB-13]

### 10.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `group.linked_group_created` | `tenant_id`, `booking_group_id`, `responsible_client_id` |
| `group.independent_group_created` | `tenant_id`, `booking_group_id`, `share_code_hash` |
| `group.member_added` | `tenant_id`, `booking_group_id`, `member_id`, `member_role` |
| `group.member_scheduled` | `tenant_id`, `booking_group_id`, `member_id`, `appointment_id` |
| `group.member_cancelled` | `tenant_id`, `booking_group_id`, `member_id`, `reason` |
| `group.linked_group_cancelled` | `tenant_id`, `booking_group_id`, `reason`, `cancelled_member_count` |
| `group.invitation_link_created` | `tenant_id`, `booking_group_id`, `invitation_link_id`, `expires_at` |
| `group.member_notification_enqueued` | `tenant_id`, `booking_group_id`, `member_id`, `notification_kind` |

### 10.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 05, 06, 07, 08, 11 |
| É dependência de | 12 Checkout futuro; 21 Messaging futuro; 23 CoPilot futuro; 25 Analytics futuro |

### 10.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 07 — Group Booking | **POSTERGADO para validação completa com D12 Checkout**; neste bloco prova apenas modelo distinto no banco e cancelamento sem contágio; checkout dividido não é declarado como aprovado no Bloco C [MB §10/Gate07] |
| Gate 04 — Appointment Conflict | Agendamento de membro não gera conflito de staff/recurso [MB §10/Gate04] |
| Gate 02 — Staff Privacy | Staff não vê financeiro alheio do grupo [MB §10/Gate02] |

### 10.10 RAGOV do domínio

**REAL / MVP.** [MB §6/D10]

---

## 5. Mapa de relações inter-domínios do Bloco C

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| 02 | 07 | `holiday_rules` + `holiday_bridge_policies` → `scheduling_calendar_exceptions` | D02 é fonte; D07 cacheia reconstruível [DF-07] |
| 05 | 07/08 | `staff_profiles`, `staff_working_hours` → slots/locks | Staff availability vem de People; agenda não duplica staff [RM §4 #16] |
| 06 | 07/08/09/10 | `services`, `service_chain_components`, `service_yield_profiles` → slot score, appointment services | Catálogo é fonte de duração/preço base/yield; frontend não calcula [MB §6/D06][MB §7] |
| 11 | 07/08 | `resources`, `resource_availability_rules`, `resource_capacity_rules` → resource plan/locks | Recursos físicos vêm de D11; locks de atendimento ficam em D08 [MB §6/D11][RM §4 #40] |
| 07 | 08 | `slot_token`, `slot_score_audit_logs`, `resource_plan` → hold/appointment | Engine calcula; Agenda executa [MB §6/D07][MB §6/D08] |
| 08 | 09 | `appointments` ↔ `recurring_appointment_occurrences` | Ocorrência materializada vira appointment; cancelamento de ocorrência não cancela série [MB §6/D09] |
| 08 | 10 | `appointments` ↔ `booking_group_members` | Cada membro agendado tem appointment próprio [MB §6/D10] |
| shared | 07–10 | `error_code_catalog`, `command_idempotency_keys`, `outbox_events` | Contrato comum sem duplicação por domínio [MB §7] |

---

## 6. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gate secundário | Critério bloqueante |
|---:|---:|---|---|---|
| Fundação C / adendos | 011 | Gate 00 | Gate 01 | Erro estruturado, replay idempotente, saga e feriados sem dupla verdade |
| 07 | 012 | Gate 03 | Gate 05 / Gate 08 | Slots válidos, explicáveis, ordenados e sem conflito |
| 08 | 013 | Gate 04 | Gate 09 / Gate 02 | Holds/appointments/locks sem conflito; waitlist auditável |
| 09 | 014 | Gate 06 | Gate 04 / Gate 09 | Série, pausa e cancelamento sem efeito colateral |
| 10 | 015 | Gate 07 estrutural parcial | Gate 04 / Gate 02 | Grupo vinculado e independente distintos no banco; checkout dividido fica para D12 |

---

## 7. Ordem única de execução de migrations do Bloco C

1. `011_shared_agenda_contracts_and_foundation_addenda.sql` — catálogo de erro, contrato de idempotência, signup saga, holiday bridge policies. [DF-01][DF-02][DF-05][DF-07]
2. `012_smart_scheduling_engine.sql` — settings, logs de disponibilidade/score, premium windows, gap recovery, utilization, calendar resolution. [MB §6/D07]
3. `013_agenda_core.sql` — schedule blocks, availability rules, slot holds, hold resource blocks, appointments, appointment services, appointment resource blocks, status history, audit snapshots, cancellation requests, waitlist. [MB §6/D08]
4. `014_recurring_appointments.sql` — preview, série, ocorrências, pausas, cancelamentos, snapshots financeiros operacionais. [MB §6/D09]
5. `015_group_bookings.sql` — grupos base, submodelos vinculado/independente, membros, payment modes planejados, links e notificações. [MB §6/D10]

**Restrições de ordem:**

| Restrição | Motivo |
|---|---|
| 011 antes de 012–015 | RPCs dependem de erro estruturado, idempotência, feriados e saga |
| 012 antes de 013 | D08 consome slot_token, score audit e resource plan calculado por D07 |
| 013 antes de 014/015 | D09 e D10 materializam appointments em D08 |
| 014 e 015 antes de checkout futuro | D12 consumirá appointment/occurrence/group snapshots; não cria preço final neste bloco |

---

## 8. Estratégia de rollback do Bloco C

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 011 | Em sandbox: remover contratos e recriar; em dados reais: retirar códigos com `retired_at`, invalidar bridge policies por status | Reutilizar `error_code`; apagar saga steps ou saga runs |
| 012 | Inativar premium rule; invalidar calendar resolution; reprocessar snapshots de utilization | Apagar score audit usado por appointment já criado |
| 013 | Expirar holds ativos; cancelar appointment por Command; liberar locks por status | DELETE físico de appointment, status history, audit snapshot, resource blocks ou waitlist |
| 014 | Pausar série; cancelar ocorrências futuras por Command; gerar novo preview | Apagar ocorrência materializada ou snapshot financeiro operacional |
| 015 | Cancelar grupo por status; revogar invitation link; cancelar notificações pendentes | Converter grupo vinculado em independente no mesmo registro; apagar membros com appointments |

---

## 9. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| Erro estruturado em `shared.error_code_catalog` | REAL | RPCs de agenda precisam retornar erro estável, auditável e consumível por UI/IA | [DF-01][MB §7] |
| Replay idempotente por payload hash | REAL | Impede duplicar hold, appointment, série e grupo em retry | [DF-02][MB §7] |
| Saga de signup com runs/steps | REAL | Evita tenant com agenda ativa sem setup/onboarding completo | [DF-05][MB §6/D03] |
| `holiday_rules` como fonte canônica | REAL | Reuse Map classifica feriados D02 como KEEP; D07 só consome/cacheia | [DF-07][RM §4 #9] |
| Slot como resposta calculada, não tabela soberana | REAL | Engine calcula; agenda executa por Command | [MB §6/D07][MB §7] |
| `slot_hold_resource_blocks` | REAL | Hold precisa bloquear staff/cliente/recurso com TTL antes do appointment | [MB §10/Gate04][C-G2] |
| `appointment_resource_blocks` como verdade de concorrência | REAL | Permite Chain Booking e bloqueia recurso/profissional por componente | [RM §4 #40][MB §10/Gate05] |
| Recorrente com série/preview/ocorrência/pausa separados | REAL | Cancela ocorrência sem cancelar série; prova Gate 06 | [MB §6/D09][MB §10/Gate06] |
| Grupo com subtabelas vinculado/independente | REAL | Garante modelos distintos no banco e elimina híbrido implícito; Gate 07 financeiro completo fica bloqueado até D12 | [MB §6/D10][MB §10/Gate07] |
| Snapshots financeiros operacionais sem ledger | PARCIAL CONTROLADO | Necessários para ocorrência/grupo; D12/D15 ratificam financeiro final | [MB §7][MB §10/Gate10–Gate15] |

---

## 10. Reflexion contra Definition of Done do Bloco C

| Item verificado | Resultado | Correção aplicada |
|---|---|---|
| Domínios 07–10 têm os 10 blocos obrigatórios | SIM | Sem correção |
| Toda tabela tem RLS especificada | SIM | Inventário RLS por D07, D08, D09 e D10 |
| Funções críticas têm SECURITY, REVOKE e GRANT concreto | SIM | Todas usam roles herdados do Bloco A v2.1 |
| Todo domínio CRÍTICO tem gate nomeado | SIM | D07 Gate 03/05/08; D08 Gate 04/09; D09 Gate 06; D10 Gate 07 estrutural parcial, completo só após D12 |
| Ordem de migrations evita dependência circular | SIM | 011 fundação; 012 engine; 013 agenda; 014 recorrente; 015 grupo |
| Rollback documentado por migration | SIM | Rollback 011–015 documentado |
| Zero termos proibidos sem decisão pendente numerada | SIM | DF-01, DF-02, DF-05, DF-07 resolvidas via ToT |
| Platform Owner isolado do contexto tenant | SIM | Bloco C usa tenant_core e roles técnicos; sem RLS platform |
| Recorrente e Grupo têm modelos distintos e explícitos | SIM | D09 série/ocorrência/pausa; D10 base + subtabelas exclusivas |
| Exclusion constraints por profissional e recurso | SIM | Schedule blocks, holds, appointments e pausas recorrentes especificam `EXCLUDE USING gist` com `tstzrange`/`daterange` |
| C-G1–C-G8 cobertos como contrato RPC | SIM | Tabela 3.1 e RPCs D07–D10 |
| Frontend calcula regra crítica | NÃO | Leitura recebe resultado mastigado; mutação via Command |
| Tabelas proibidas recriadas | NÃO | Sem `financial_idempotency_registry`, `business_units` duplicada ou `ledger_accounts` duplicada |

**Falhas encontradas antes da declaração:** nenhuma falha bloqueante no escopo do Bloco C.  
**Limite explícito:** este arquivo não declara checkout, payment, ledger, comissão, benefícios, mensageria externa ou analytics completos; esses blocos seguem ordem canônica posterior. [SKILL §6]

Bloco C pronto para auditoria Red Team.

Pronto para auditoria Red Team.

---

## ANEXO D — SMART_FLOW_3_0_BLUEPRINT_BLOCO_D_v1_2.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco D v1.2

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco D — Domínios 12, 13, 14, 15, 16, 17  
**Status:** RESSALVA N-01 ABSORVIDA — BLOCO D v1.2 PRONTO PARA AUDITORIA/REGISTRO RED TEAM  
**Data:** 2026-06-11  
**Fundação aprovada:** Bloco A v2.1 + Bloco B v2.1 + Bloco C v1.2  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §0–§8]

---

## 0. Regra de autoridade e versão

1. O Master Brief 3.0 decide visão, domínios, limites e gates. O Blueprint organiza a arquitetura; SQL Master materializa somente depois do Blueprint aprovado. [MB §0]
2. O Bloco D cobre integralmente o bloco de dinheiro definido pela skill: D12 Checkout, D13 Payment, D14 Caixa, D15 Ledger, D16 Wallet e D17 Comissão. [SKILL §6]
3. Bloco A v2.1, Bloco B v2.1 e Bloco C v1.2 são fundações aprovadas por ID: schemas `platform`, `tenant_core`, `shared`; roles técnicos; RLS efetiva; outbox; idempotência; agenda; catálogo; pessoas; recursos. [SKILL §6]
4. Frontend não calcula total, desconto, pagamento, alocação, saldo, comissão, cashback, troco, fechamento de caixa ou lançamento contábil. Backend retorna resultado pronto para exibição. [MB §7][MB §10/Gate10]
5. Nenhum pagamento, caixa, wallet, comissão, ajuste ou reembolso cria saldo direto. Todo efeito financeiro real passa por `tenant_core.financial_transactions` e `tenant_core.ledger_entries`. [MB §6/D15][MB §10/Gate11]
6. Ledger é append-only, double-entry e reconstruível. Reversão é nova transação, nunca UPDATE/DELETE. [MB §6/D15][SKILL §4]
7. Wallet e contas correntes são projeções reconstruíveis a partir de entries append-only vinculadas ao ledger. `wallet_entries` legado permanece removido como fonte paralela. [MB §6/D16][RM §4 #64]
8. Staff nunca acessa financeiro de outro staff. Comissão é calculada no backend e exposta por RPC segura com predicado de staff próprio. [MB §6/D17][MB §10/Gate14]
9. D18 Benefits, Packages & Memberships não é criado neste bloco. D12 prepara aplicação no checkout; origem, saldo e consumo canônico de benefícios são fechados no Bloco E/D18. [MB §6/D18][MB §10/Gate15]

---

## 1. Escopo do Bloco D

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| D | 12 | Checkout Core | Especificado | [MB §6/D12][RM §4 #39][RM §4 #44–#48][RM §5/D12] |
| D | 13 | Payment Core | Especificado | [MB §6/D13][RM §4 #49–#53][RM §5/D13] |
| D | 14 | Cash & Register Management | Especificado | [MB §6/D14][RM §4 #56–#57][RM §5/D14] |
| D | 15 | Financial Ledger | Especificado | [MB §6/D15][RM §4 #55][RM §4 #58–#59][RM §5/D15] |
| D | 16 | Wallet & Current Accounts | Especificado | [MB §6/D16][RM §4 #61][RM §4 #64][RM §5/D16] |
| D | 17 | Compensation Engine | Especificado | [MB §6/D17][RM §4 #66–#70][RM §5/D17] |

---

## 2. Decisões herdadas e decisões pendentes resolvidas no Bloco D

### 2.1 Decisões herdadas dos blocos aprovados

| Decisão | Uso no Bloco D | Fonte |
|---|---|---|
| Schemas `platform`, `tenant_core`, `shared` | D12–D17 usam `tenant_core`; contratos transversais usam `shared`; nenhum schema financeiro paralelo | [MB §6/D01][RM §2][SKILL §4] |
| Roles técnicos concretos | Commands financeiros usam `app_backend_command_executor`; leituras usam `app_backend_read_executor`; jobs/reconciliações usam `app_worker_executor` | [MB §7][SKILL §4] |
| RLS efetiva | Toda tabela financeira declara `RLS_ENABLED = SIM` e `REVOKE ALL` antes de grants | [MB §7][MB §10/Gate01] |
| Outbox fundacional | Eventos financeiros são emitidos em `shared.outbox_events`, sem fila paralela | [MB §7][RM §4 #97] |
| Idempotência fundacional | Todo Command financeiro usa `p_idempotency_key` e registra/reusa `shared.command_idempotency_keys` | [SKILL §4] |
| Erro estruturado | RPCs financeiros retornam `shared.structured_command_result`; erro crítico usa `shared.error_code_catalog` | [MB §7][Bloco C v1.2] |
| Agenda aprovada | D12 consome `appointments`, `appointment_services`, grupos e recorrências aprovados; não recalcula disponibilidade | [MB §6/D08–D10] |

### 2.2 DECISÃO PENDENTE F0-01 — campos monetários `_cents bigint` e taxas `numeric`

**Origem:** o Reuse Map deixou F0-01 para ratificação final no bloco financeiro. [RM §7]  
**Regra vinculante:** valores monetários críticos precisam ser inteiros, auditáveis e livres de arredondamento binário. Taxas percentuais não são dinheiro e usam precisão decimal controlada. [MB §6/D15][SKILL §4]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Dinheiro em `_cents bigint`; taxas em `numeric(9,6)`; quantidades em `numeric(12,3)` quando material físico exigir fração | Alta: soma exata em ledger | Alta: não interfere em RLS | Baixo: padrão único | Alta |
| B | Dinheiro em `numeric(12,2)` | Média: exige disciplina de escala em toda soma | Alta | Médio: converter para cents depois | Média |
| C | Dinheiro em `decimal` variável por domínio | Baixa: múltiplas escalas criam divergência | Alta | Alto | Baixa |

**Escolha:** Alternativa A.  
Justificativa: ledger double-entry precisa fechar centavo a centavo, sem arredondamento implícito. [MB §10/Gate11]  
Checkout, pagamento, caixa, wallet e comissão compartilham o mesmo padrão de `_cents bigint`. [MB §6/D12–D17]  
Taxas de comissão/desconto percentual usam `numeric(9,6)` com check de intervalo, porque taxa não é dinheiro. [MB §6/D17]

**Descartes:**  
- Alternativa B descartada porque preserva risco de escala e arredondamento em somas financeiras. [MB §10/Gate11]  
- Alternativa C descartada porque múltiplas escalas quebram a reconstrução uniforme de saldo. [MB §6/D15]

**Decisão final:** F0-01 fica **RATIFICADA**: todo valor financeiro monetário usa sufixo `_cents bigint`; toda taxa percentual usa `numeric(9,6)`; quantidade física fracionável usa `numeric(12,3)` com check por tipo de item. [RM §7][SKILL §4]

### 2.3 DECISÃO D-01 — ledger sem tabela `ledger_accounts` duplicada

**Origem:** o ledger precisa de contas de débito/crédito, mas a skill proíbe criar `ledger_accounts` duplicada. [SKILL §4][RM §6]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | Não criar `ledger_accounts`; cada entry carrega `account_code`, `account_type`, `account_ref_kind`, `account_ref_id`; saldo é group-by reconstruível | Alta: sem fonte paralela de saldo | Alta: tenant_id em cada entry | Baixo | Média |
| B | Criar `tenant_core.ledger_accounts` canônica | Média: viola tabela proibida e duplica legado conceitual | Alta | Alto | Média |
| C | Guardar contas em JSON dentro de `financial_transactions` | Baixa: impossível indexar/provar double-entry por conta | Média | Alto | Alta |

**Escolha:** Alternativa A.  
Justificativa: preserva double-entry e reconstrução sem criar tabela proibida. [SKILL §4][MB §6/D15]  
Cada entry é soberana e append-only; saldos são projeções reconstruíveis, não linhas editáveis. [MB §6/D15][MB §6/D16]  
`account_code` é catálogo lógico versionado em enum/tipo, não tabela de saldo. [RM §6]

**Descartes:**  
- Alternativa B descartada porque cria a tabela proibida `ledger_accounts` duplicada. [SKILL §4]  
- Alternativa C descartada porque JSON impede prova de Gate 11. [MB §10/Gate11]

**Decisão final:** Bloco D não cria `ledger_accounts`. O SQL Master materializa ledger com `financial_transactions`, `ledger_entries`, `ledger_integrity_assertions` e account identity embutida em cada entry. [MB §6/D15][RM §5/D15]

### 2.4 DECISÃO D-02 — checkout dividido de grupo sem criar pagamento antes do D13

**Origem:** Gate 07 foi postergado no Bloco C porque checkout dividido exige D12/D13. [MB §10/Gate07]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | D12 cria cobranças por membro em `checkout_group_member_charges`; D13 liquida pagamentos/alocações por charge | Alta: split separado de captura real | Alta: FK composta por tenant | Baixo | Média |
| B | Um checkout único com JSON de divisão | Baixa: split não auditável por membro | Média | Alto | Alta |
| C | Um checkout por membro sem vínculo comum | Média: perde visão do grupo e responsável | Alta | Médio | Média |

**Escolha:** Alternativa A.  
Justificativa: grupo vinculado precisa checkout dividido sem misturar membros; grupo independente não sofre contágio de cancelamento. [MB §10/Gate07]  
Cobrança por membro é obrigação de checkout; captura e alocação são do Payment Core. [MB §6/D12][MB §6/D13]  
FK composta por tenant impede `client_id` de outro tenant no split. [MB §10/Gate01]

**Descartes:**  
- Alternativa B descartada porque JSON vira fonte opaca de split financeiro. [MB §7]  
- Alternativa C descartada porque perde a unidade auditável do grupo. [MB §6/D10]

**Decisão final:** D12 materializa `checkout_group_member_charges`; D13 materializa pagamento/alocação por item/charge. Gate 07 passa somente quando D12+D13 provam split por membro e cancelamento sem contágio. [MB §10/Gate07]

### 2.5 DECISÃO D-03 — fronteira D12/D18 para benefícios

**Origem:** D12 precisa registrar benefício aplicado no checkout; D18 ainda não existe e será dono de origem, saldo, validade e consumo de benefícios. [MB §6/D12][MB §6/D18]

| Alternativa | Desenho | Integridade do ledger | Isolamento de tenant | Custo de migração futura | Simplicidade |
|---|---|---|---|---|---|
| A | D12 registra aplicação financeira no checkout; D18 cria origem/consumo canônico e conecta por FK posterior; status D12 não vira saldo | Alta: evita benefício sem origem | Alta | Baixo | Média |
| B | D12 cria saldo/consumo completo de benefício agora | Baixa: invade D18 e duplica benefício | Média | Alto | Média |
| C | Ignorar benefícios no checkout até D18 | Média: checkout incompleto para gate futuro | Alta | Médio | Alta |

**Escolha:** Alternativa A.  
Justificativa: checkout precisa calcular total backend-only, incluindo benefício aplicado; mas origem/validade/consumo são do D18. [MB §6/D12][MB §6/D18]  
A aplicação em D12 é parte do cálculo do total, não fonte de saldo de benefício. [MB §10/Gate10][MB §10/Gate15]  
D18 adicionará o vínculo final sem reescrever checkout. [SKILL §6]

**Descartes:**  
- Alternativa B descartada porque criaria benefício sem o domínio dono. [MB §6/D18]  
- Alternativa C descartada porque impediria checkout correto com benefícios já vendidos no legado. [RM §4 #47]

**Decisão final:** `checkout_benefit_applications` existe em D12 com status e valores; não cria saldo, não consome origem sozinho e não satisfaz Gate 15. Gate 15 fica no Bloco E/D18. [MB §10/Gate15]

---

## 3. Convenções canônicas do Bloco D

| Item | Regra | Fonte |
|---|---|---|
| Dinheiro | `_cents bigint` com `CHECK >= 0`; valores que representam movimento real usam `CHECK > 0` | [RM §7][MB §10/Gate11] |
| Taxas | `numeric(9,6)` com check `0 <= rate <= 1` quando percentual | [MB §6/D17] |
| Quantidade | `numeric(12,3)`; item de serviço/add-on exige quantidade inteira | [MB §7] |
| Ledger entry type | `ledger_entry_type` com valores `debit`, `credit`; substitui `ledger_side` legado | [RM §2][RM §4 #55] |
| Append-only | Ledger entries, payment allocations, account entries, commission items e cash movements não sofrem UPDATE/DELETE | [MB §6/D15][SKILL §4] |
| Reversal | Reversão é nova financial transaction ligada por `reversed_transaction_id`/`ledger_reversal_links` | [MB §6/D15][RM §5/D15] |
| Idempotência financeira | Todo Command D12–D17 exige `p_idempotency_key`; postagem ledger usa também `ledger_transaction_idempotency_keys` | [SKILL §4][RM §5/D15] |
| Double-entry | Transação só pode ir para `posted` quando soma debit = soma credit por `financial_transaction_id` e moeda | [MB §10/Gate11] |
| RLS | `tenant_id = current_setting('hope.tenant_id', true)::uuid`; staff próprio por `staff_profiles.user_profile_id = p_actor_user_id` via RPC segura | [MB §10/Gate01][MB §10/Gate14] |
| REVOKE | `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; EXECUTE apenas para roles técnicos aprovados | [RM §2][SKILL §4] |
| Outbox | Todo fechamento, captura, reembolso, ajuste, posting ledger, wallet entry, comissão, payout e caixa emite evento em `shared.outbox_events` | [MB §7] |
| Frontend | Exibe preview/backend result; nunca recalcula regra financeira | [MB §7][MB §10/Gate10] |

---

## 4. Mapa Bloco D — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 016 | `tenant_core` | 15 | Financial foundation, transactions, ledger entries, idempotency ledger, reversals, assertions | Gate 11 [MB §10] |
| 017 | `tenant_core` | 12 | Checkout sessions, items, discounts, benefits applications, tips, group charges, authorizations | Gate 10 / Gate 07 [MB §10] |
| 018 | `tenant_core` | 13 | Payment intents, payments, allocations, refunds, gateway events, deposits, reconciliation items | Gate 12 [MB §10] |
| 019 | `tenant_core` | 14 | Cash registers, cash sessions, cash movements, authorizations, closing evidence | Gate 18 [MB §10] |
| 020 | `tenant_core` | 16 | Client/staff current accounts, account entries, balance projections, drift assertions | Gate 13 [MB §10] |
| 021 | `tenant_core` | 17 | Compensation rules, calculations, items, adjustments, payouts, advances, staff privacy views | Gate 14 [MB §10] |

---

## 5. Especificação por domínio

## Domínio 12 — Checkout Core

### 12.1 Responsabilidade

O Domínio 12 transforma atendimento, grupo, recorrência, produto, add-on, pacote ou assinatura em venda rastreável; calcula subtotal, descontos, benefício aplicado, gorjeta e total final exclusivamente no backend; mantém sessão de checkout com estado auditável; prepara split de grupo; não captura pagamento, não reconcilia gateway, não posta ledger diretamente e não cria saldo de benefício. [MB §6/D12][MB §10/Gate10]

### 12.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.checkout_sessions` | Sessão soberana de checkout | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `appointment_id` nullable; FK `booking_group_id` nullable; FK `client_id` nullable; `status checkout_status`; `subtotal_cents bigint check >=0`; `discount_cents bigint check >=0`; `benefit_cents bigint check >=0`; `tip_cents bigint check >=0`; `total_cents bigint check >=0`; `paid_cents bigint check >=0`; `balance_due_cents bigint check >=0`; `opened_by_membership_id`; `closed_by_membership_id`; `closed_at`; `price_snapshot_hash text`; `calculation_version text`; `idempotency_key text`; check explícito `subtotal_cents + tip_cents - discount_cents - benefit_cents >= 0`; check derivado `total_cents = subtotal_cents + tip_cents - discount_cents - benefit_cents`; check `paid_cents <= total_cents`; unique `(tenant_id,idempotency_key)` when present; indexes `(tenant_id,status)`, `(tenant_id,appointment_id)` | RLS_ENABLED = SIM; tenant finance/reception/manager lê; mutação somente Command |
| `tenant_core.checkout_items` | Itens calculados pelo backend | PK `id`; FK `tenant_id`; FK `checkout_session_id`; FK `appointment_service_id` nullable; FK `service_id` nullable; FK `product_id` nullable; FK `addon_id` nullable; `item_type checkout_item_type`; FK `staff_id` nullable; `description`; `quantity numeric(12,3) check >0`; `unit_price_cents bigint check >=0`; `discount_cents bigint check >=0`; `total_cents bigint check >=0`; `price_rule_id` nullable; `source_kind checkout_item_source_kind`; `source_id uuid`; check exatamente uma origem principal quando aplicável; check serviço/add-on com quantidade inteira; index `(tenant_id,checkout_session_id)` | RLS_ENABLED = SIM; leitura por tenant autorizado; INSERT/UPDATE direto bloqueado |
| `tenant_core.checkout_discounts` | Descontos autorizados | PK `id`; FK `tenant_id`; FK `checkout_session_id`; `discount_kind checkout_discount_kind`; `amount_cents bigint check >0`; `reason`; `authorized_by_membership_id`; `action_request_id uuid`; `limit_snapshot jsonb`; `created_at`; check desconto sensível exige `action_request_id` | RLS_ENABLED = SIM; leitura financeira; escrita Command |
| `tenant_core.checkout_benefit_applications` | Aplicação de benefício no cálculo do total | PK `id`; FK `tenant_id`; FK `checkout_session_id`; `benefit_source_kind benefit_source_kind`; `benefit_source_id uuid`; `amount_cents bigint check >=0`; `quantity numeric(12,3) check >=0`; `status checkout_benefit_application_status`; `reserved_at`; `applied_at`; `released_at`; `created_by_membership_id`; check valor ou quantidade > 0; não cria saldo | RLS_ENABLED = SIM; escrita Command; D18 conecta origem/consumo final |
| `tenant_core.checkout_tip_items` | Gorjeta separada do preço do serviço | PK `id`; FK `tenant_id`; FK `checkout_session_id`; FK `staff_id`; `amount_cents bigint check >0`; `tip_kind checkout_tip_kind`; `created_by_membership_id`; `created_at`; index `(tenant_id,staff_id,created_at desc)` | RLS_ENABLED = SIM; staff lê própria gorjeta via RPC; financeiro lê tudo |
| `tenant_core.checkout_group_member_charges` | Split de grupo por membro | PK `id`; FK composta `(tenant_id,checkout_session_id)`; FK composta `(tenant_id,booking_group_id)`; FK composta `(tenant_id,group_member_id)`; FK composta `(tenant_id,client_id)`; `charge_status group_charge_status`; `responsible_client_id` FK composta `(tenant_id,responsible_client_id)`; `gross_cents bigint check >=0`; `discount_cents bigint check >=0`; `benefit_cents bigint check >=0`; `total_cents bigint check >=0`; check explícito `gross_cents - discount_cents - benefit_cents >= 0`; check derivado `total_cents = gross_cents - discount_cents - benefit_cents`; unique `(tenant_id,checkout_session_id,group_member_id)` | RLS_ENABLED = SIM; cliente vê própria charge; financeiro/recepção vê grupo autorizado |
| `tenant_core.checkout_status_history` | Histórico append-only de status do checkout | PK `id`; FK `tenant_id`; FK `checkout_session_id`; `from_status`; `to_status`; `actor_membership_id`; `reason`; `created_at`; trigger bloqueia UPDATE/DELETE | RLS_ENABLED = SIM; leitura por tenant autorizado |
| `tenant_core.checkout_authorizations` | Autorizações sensíveis do checkout | PK `id`; FK `tenant_id`; FK `checkout_session_id`; `authorization_kind checkout_authorization_kind`; `requested_by_membership_id`; `approved_by_membership_id`; `status authorization_status`; `amount_cents bigint check >=0`; `reason`; `action_request_id`; timestamps; check aprovação exige `approved_by_membership_id` | RLS_ENABLED = SIM; leitura gerencial; escrita Command |
| `tenant_core.checkout_command_idempotency_keys` | Idempotência específica de checkout composta | PK `id`; FK `tenant_id`; `command_name`; `idempotency_key`; `payload_hash`; FK `checkout_session_id` nullable; `result_id uuid`; `status command_idempotency_status`; timestamps; unique `(tenant_id,command_name,idempotency_key)` | RLS_ENABLED = SIM; somente Command |

### 12.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `checkout_status` | `draft`, `open`, `priced`, `pending_payment`, `partially_paid`, `paid`, `closed`, `cancelled`, `reopened_for_correction` |
| `checkout_item_type` | `service`, `product`, `addon`, `package`, `subscription`, `tip`, `manual_adjustment` |
| `checkout_item_source_kind` | `appointment_service`, `catalog_service`, `catalog_product`, `catalog_addon`, `group_member_charge`, `manual_authorized` |
| `checkout_discount_kind` | `manual`, `campaign`, `membership`, `package`, `correction`, `manager_authorized` |
| `benefit_source_kind` | `package`, `subscription`, `cashback`, `voucher`, `manual_credit`, `future_d18` |
| `checkout_benefit_application_status` | `reserved`, `applied`, `released`, `reversed`, `pending_d18_origin` |
| `checkout_tip_kind` | `cash`, `card`, `pix`, `wallet`, `included_in_payment` |
| `group_charge_status` | `draft`, `ready`, `partially_paid`, `paid`, `cancelled`, `transferred_to_responsible` |
| `checkout_authorization_kind` | `discount_override`, `price_override`, `benefit_override`, `manual_item`, `reopen_checkout`, `cancel_paid_checkout` |
| `authorization_status` | `requested`, `approved`, `rejected`, `expired`, `revoked` |

### 12.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_open_checkout_from_appointment` | `(p_appointment_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Recepção/financeiro via API |
| `tenant_core.command_open_checkout_for_group` | `(p_booking_group_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Recepção/financeiro via API |
| `tenant_core.command_reprice_checkout` | `(p_checkout_session_id uuid, p_actor_user_id uuid, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend trusted |
| `tenant_core.command_apply_checkout_discount` | `(p_checkout_session_id uuid, p_discount_kind checkout_discount_kind, p_amount_cents bigint, p_reason text, p_action_request_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Manager/financeiro autorizado |
| `tenant_core.command_apply_checkout_benefit` | `(p_checkout_session_id uuid, p_benefit_source_kind benefit_source_kind, p_benefit_source_id uuid, p_amount_cents bigint, p_quantity numeric, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Recepção/financeiro; D18 valida origem depois |
| `tenant_core.command_add_checkout_tip` | `(p_checkout_session_id uuid, p_staff_id uuid, p_amount_cents bigint, p_tip_kind checkout_tip_kind, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Recepção/financeiro |
| `tenant_core.command_finalize_checkout_totals` | `(p_checkout_session_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend trusted antes do pagamento |
| `tenant_core.command_close_paid_checkout` | `(p_checkout_session_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend trusted após D13 confirmar alocação |
| `tenant_core.read_checkout_summary` | `(p_checkout_session_id uuid, p_actor_user_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | UI autorizada |

### 12.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.checkout_sessions` | SELECT | membro com `checkout.read` | `tenant_id = current_setting('hope.tenant_id', true)::uuid` e membership ativa |
| `tenant_core.checkout_sessions` | INSERT/UPDATE | Command trusted | Sem escrita direta por `authenticated`; Command valida papel e status |
| `tenant_core.checkout_items` | SELECT | `checkout.read` | tenant atual; cliente final lê apenas próprio resumo via RPC segura |
| `tenant_core.checkout_discounts` | SELECT | gerente/financeiro | tenant atual + `checkout.discount.read` |
| `tenant_core.checkout_benefit_applications` | SELECT | checkout/financeiro | tenant atual; D18 terá leitura de origem |
| `tenant_core.checkout_tip_items` | SELECT | financeiro ou staff próprio via RPC | financeiro vê todos; staff só própria gorjeta por `staff_id` ligado a `p_actor_user_id` |
| `tenant_core.checkout_group_member_charges` | SELECT | financeiro/recepção/cliente próprio | tenant atual; cliente vê apenas `client_id` próprio por RPC segura |
| `tenant_core.checkout_status_history` | INSERT | Command trusted | append-only; sem UPDATE/DELETE |
| `tenant_core.checkout_authorizations` | SELECT/INSERT/UPDATE | gerente/Command | aprovação sensível exige permissão e Action Request quando aplicável |
| `tenant_core.checkout_*` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito; grants somente roles técnicos |

### 12.6 Invariantes

1. Frontend nunca calcula total final. [MB §6/D12][MB §10/Gate10]
2. `total_cents` é derivado por backend e constraint de banco; UI só exibe. [MB §7]
3. Desconto sensível exige origem, limite e autorização rastreável. [MB §6/D12]
4. Aplicação de benefício em D12 não cria saldo nem consome origem canônica sem D18. [MB §10/Gate15]
5. Checkout de grupo preserva split por membro e tenant; não usa JSON como fonte financeira. [MB §10/Gate07]
6. `checkout_group_member_charges` nunca usa floor silencioso: se `discount_cents + benefit_cents > gross_cents`, o Command retorna erro estruturado `GROUP_CHARGE_DISCOUNT_EXCEEDS_GROSS` com status `VALIDATION_FAILED` antes de gravar a charge. [MB §7][MB §10/Gate10][MB §10/Gate07]
7. Fechar checkout pago exige D13 confirmar `payment_allocations` cobrindo `total_cents`. [MB §10/Gate12]

### 12.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `checkout.opened` | `tenant_id`, `checkout_session_id`, `appointment_id`, `booking_group_id` |
| `checkout.repriced` | `tenant_id`, `checkout_session_id`, `calculation_version`, `price_snapshot_hash` |
| `checkout.discount_applied` | `tenant_id`, `checkout_session_id`, `discount_id`, `amount_cents` |
| `checkout.benefit_applied` | `tenant_id`, `checkout_session_id`, `benefit_application_id`, `amount_cents`, `status` |
| `checkout.group_charges_created` | `tenant_id`, `checkout_session_id`, `booking_group_id`, `charge_count` |
| `checkout.finalized` | `tenant_id`, `checkout_session_id`, `total_cents` |
| `checkout.closed` | `tenant_id`, `checkout_session_id`, `paid_cents`, `closed_at` |

### 12.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 05, 06, 08, 10, 11, 15 |
| É dependência de | 13, 16, 17, 18, 25, 31 |

### 12.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 10 — Checkout Integrity | Total, desconto, benefício, item e pagamento calculados no backend; frontend só exibe [MB §10/Gate10] |
| Gate 07 — Group Booking | Grupo vinculado com checkout dividido; grupo independente sem contágio de cancelamento, completado por D12+D13 [MB §10/Gate07] |

### 12.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D12][MB §9]

---

## Domínio 13 — Payment Core

### 13.1 Responsabilidade

O Domínio 13 é dono de intent de pagamento, captura simples ou mista, depósito, pré-pagamento, Card-on-File tokenizado, consentimento de cobrança futura, alocação por item/charge, gateway events, estorno, reembolso e reconciliação granular. Não calcula total de checkout, não armazena PAN, não cria saldo sem ledger, não decide comissão e não edita caixa físico sem D14. [MB4.0 §6/D13][MB4.0 §16/DEC-PO-01][MB4.0 §10/Gate12]

### 13.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.payment_intents` | Intenção idempotente antes da captura | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `checkout_session_id` nullable; `intent_kind payment_intent_kind`; `status payment_intent_status`; `amount_cents bigint check >0`; `currency_code`; FK `payment_method_id`; `provider`; `provider_intent_id`; `expires_at`; `idempotency_key`; `metadata`; unique `(tenant_id,provider,provider_intent_id)` where provider present; unique `(tenant_id,intent_kind,idempotency_key)` | RLS_ENABLED = SIM; Command escreve; tenant autorizado lê |
| `tenant_core.payments` | Pagamento capturado ou registrado | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `checkout_session_id` nullable; FK `payment_intent_id` nullable; FK `payment_method_id`; `method_kind payment_method_kind`; `status payment_status`; `amount_cents bigint check >0`; `authorized_cents bigint check >=0`; `captured_cents bigint check >=0`; `refunded_cents bigint check >=0`; `external_reference`; `paid_at`; `recorded_by_membership_id`; FK `financial_transaction_id` nullable; checks `captured_cents <= amount_cents`, `refunded_cents <= captured_cents`; indexes `(tenant_id,status)`, `(tenant_id,checkout_session_id)` | RLS_ENABLED = SIM; INSERT/UPDATE via Command |
| `tenant_core.payment_method_tokens` | Token PSP/gateway por cliente, nunca PAN | PK `id`; FK `tenant_id`; FK `client_id`; `provider text NOT NULL`; `provider_token text NOT NULL`; `token_kind payment_token_kind`; `last_four text CHECK length = 4`; `card_brand text` nullable; `expires_month int CHECK 1..12` nullable; `expires_year int` nullable; `status payment_token_status`; `created_at timestamptz`; `revoked_at timestamptz` nullable; índice `(tenant_id, client_id, status)`; constraint crítica `provider_token !~ '^\d{13,19}$'` para bloquear PAN acidental | RLS_ENABLED = SIM; cliente próprio via RPC segura; Command guarda token do PSP [MB4.0 §16/DEC-PO-01] |
| `tenant_core.card_consent_records` | Consentimento explícito para cobrança futura | PK `id`; FK `tenant_id`; FK `client_id`; FK `payment_method_token_id`; `consent_kind card_consent_kind`; `policy_snapshot jsonb`; `consented_at timestamptz NOT NULL`; `revoked_at timestamptz` nullable; FK `actor_user_id`; FK `appointment_id` nullable; `status card_consent_status`; append-only por `consented_at`; revogação cria novo registro `status='revoked'` | RLS_ENABLED = SIM; escrita Command; cobrança futura exige consentimento ativo [MB4.0 §16/DEC-PO-01] |

| `tenant_core.payment_allocations` | Alocação append-only do pagamento | PK `id`; FK `tenant_id`; FK `payment_id`; FK `checkout_session_id`; FK `checkout_item_id` nullable; FK `checkout_group_member_charge_id` nullable; `allocation_target payment_allocation_target`; `target_id uuid`; `amount_cents bigint check >0`; FK `financial_transaction_id` nullable; `created_at`; check exatamente um destino direto ou target genérico; trigger bloqueia UPDATE/DELETE; index `(tenant_id,payment_id)` | RLS_ENABLED = SIM; append-only; escrita Command |
| `tenant_core.payment_status_history` | Histórico append-only de status | PK `id`; FK `tenant_id`; FK `payment_id`; `from_status`; `to_status`; `actor_membership_id`; `reason`; `created_at`; trigger bloqueia UPDATE/DELETE | RLS_ENABLED = SIM |
| `tenant_core.payment_refunds` | Reembolso/estorno materializado | PK `id`; FK `tenant_id`; FK `payment_id`; FK `refund_request_id` nullable; `status refund_status`; `amount_cents bigint check >0`; `reason`; `provider_refund_id`; FK `financial_transaction_id`; `requested_by_membership_id`; `approved_by_membership_id`; `processed_at`; unique `(tenant_id,provider_refund_id)` when present | RLS_ENABLED = SIM; Command/worker escreve |
| `tenant_core.refund_requests` | Solicitação e aprovação de reembolso | PK `id`; FK `tenant_id`; FK `payment_id`; FK `checkout_session_id`; `amount_cents bigint check >0`; `status refund_request_status`; `reason`; `requested_by_membership_id`; `approved_by_membership_id`; `action_request_id`; timestamps; check aprovação exige approver | RLS_ENABLED = SIM; leitura financeira; mutação Command |
| `tenant_core.payment_gateway_events` | Eventos brutos de gateway | PK `id`; FK `tenant_id`; `provider`; `provider_event_id`; `event_type`; `received_at`; `payload_hash`; `redacted_payload jsonb`; `processing_status gateway_event_status`; FK `payment_intent_id` nullable; FK `payment_id` nullable; unique `(provider,provider_event_id)`; append-only | RLS_ENABLED = SIM; escrita worker; payload redigido |
| `tenant_core.no_show_deposits` | Depósitos de proteção contra no-show | PK `id`; FK `tenant_id`; FK `appointment_id`; FK `client_id`; FK `payment_id` nullable; `status no_show_deposit_status`; `required_cents bigint check >=0`; `captured_cents bigint check >=0`; `applied_to_checkout_session_id` nullable; `released_at`; `forfeited_at`; check captured <= required | RLS_ENABLED = SIM; Command escreve; cliente lê próprio resumo |
| `tenant_core.payment_reconciliation_items` | Reconciliação granular por pagamento | PK `id`; FK `tenant_id`; FK `payment_id`; FK `reconciliation_run_id` nullable; `provider`; `provider_reference`; `expected_cents bigint check >=0`; `observed_cents bigint check >=0`; `difference_cents bigint`; `status reconciliation_item_status`; `metadata`; timestamps | RLS_ENABLED = SIM; worker escreve; financeiro lê |
| `tenant_core.payment_command_idempotency_keys` | Idempotência específica de payment/gateway | PK `id`; FK `tenant_id`; `command_name`; `idempotency_key`; `payload_hash`; FK `payment_id` nullable; FK `payment_intent_id` nullable; `status command_idempotency_status`; `result jsonb`; unique `(tenant_id,command_name,idempotency_key)` | RLS_ENABLED = SIM; somente Command |

### 13.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `payment_token_kind` | `card`, `pix_key`, `bank_account` |
| `payment_token_status` | `active`, `expired`, `revoked`, `failed` |
| `card_consent_kind` | `no_show_protection`, `deposit_authorization`, `recurring_charge` |
| `card_consent_status` | `active`, `revoked`, `consumed`, `expired` |

| `payment_intent_kind` | `checkout_payment`, `deposit`, `prepayment`, `wallet_topup`, `refund`, `payout`, `advance_repayment` |
| `payment_intent_status` | `created`, `requires_action`, `authorized`, `captured`, `expired`, `cancelled`, `failed` |
| `payment_status` | `pending`, `authorized`, `captured`, `partially_captured`, `failed`, `cancelled`, `partially_refunded`, `refunded`, `reconciled` |
| `payment_allocation_target` | `checkout_session`, `checkout_item`, `group_member_charge`, `client_account`, `staff_account`, `deposit`, `refund`, `adjustment` |
| `refund_request_status` | `requested`, `approved`, `rejected`, `processing`, `processed`, `failed`, `cancelled` |
| `refund_status` | `pending`, `submitted`, `succeeded`, `failed`, `cancelled` |
| `gateway_event_status` | `received`, `linked`, `processed`, `ignored_duplicate`, `failed`, `redacted` |
| `no_show_deposit_status` | `required`, `intent_created`, `captured`, `applied`, `released`, `forfeited`, `refunded` |
| `reconciliation_item_status` | `matched`, `missing_provider`, `missing_internal`, `amount_mismatch`, `duplicate_provider`, `resolved` |

### 13.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_register_payment_method_token` | `(p_actor_user_id uuid, p_client_id uuid, p_provider text, p_provider_token text, p_token_kind payment_token_kind, p_last_four text, p_card_brand text, p_expires_month int, p_expires_year int, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Backend/PWA/recepção após tokenização PSP [MB4.0 §16/DEC-PO-01] |
| `tenant_core.command_record_card_consent` | `(p_actor_user_id uuid, p_client_id uuid, p_payment_method_token_id uuid, p_consent_kind card_consent_kind, p_appointment_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Backend/PWA/recepção; registra policy snapshot [MB4.0 §16/DEC-PO-01] |
| `tenant_core.command_capture_card_on_file_charge` | `(p_actor_user_id uuid, p_client_id uuid, p_payment_method_token_id uuid, p_consent_id uuid, p_amount_cents bigint, p_reason text, p_appointment_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | No-show worker ou recepção após Action Request aprovado [MB4.0 §16/DEC-PO-01][MB4.0 §10/Gate16] |

| `tenant_core.command_create_payment_intent` | `(p_checkout_session_id uuid, p_amount_cents bigint, p_method_kind payment_method_kind, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | API backend |
| `tenant_core.command_record_payment_capture` | `(p_payment_intent_id uuid, p_captured_cents bigint, p_provider_reference text, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend/gateway worker |
| `tenant_core.command_record_manual_payment` | `(p_checkout_session_id uuid, p_method_kind payment_method_kind, p_amount_cents bigint, p_cash_session_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Caixa/recepção autorizada |
| `tenant_core.command_allocate_payment` | `(p_payment_id uuid, p_allocations jsonb, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend trusted |
| `tenant_core.command_request_refund` | `(p_payment_id uuid, p_amount_cents bigint, p_reason text, p_actor_user_id uuid, p_action_request_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Manager/financeiro |
| `tenant_core.command_process_refund` | `(p_refund_request_id uuid, p_provider_reference text, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend/gateway worker |
| `tenant_core.command_capture_no_show_deposit` | `(p_appointment_id uuid, p_amount_cents bigint, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | No-show Command |
| `tenant_core.command_ingest_payment_gateway_event` | `(p_provider text, p_provider_event_id text, p_payload_hash text, p_redacted_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker gateway |
| `tenant_core.command_run_payment_reconciliation` | `(p_business_unit_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker financeiro |


**Pré-condições obrigatórias Card-on-File v4.0:**

| Command | Pré-condições transacionais |
|---|---|
| `command_register_payment_method_token` | Valida cliente no tenant; rejeita `provider_token` que contenha sequência 13–19 dígitos; grava token PSP sem PAN; emite `payment.token_registered`. [MB4.0 §16/DEC-PO-01] |
| `command_record_card_consent` | Exige token ativo; cria `policy_snapshot` da política vigente D02; registra consentimento explícito; emite `payment.card_consent_recorded`. [MB4.0 §16/DEC-PO-01] |
| `command_capture_card_on_file_charge` | Exige consentimento ativo e compatível com `reason`; exige token ativo; em transação única cria `payment_intents` com `kind='deposit'`, grava ledger D15, emite `payment.card_on_file_charged`; falha de gateway não altera `appointment.status` sem Command explícito. [MB4.0 §16/DEC-PO-01][MB4.0 §10/Gate12] |

### 13.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.payment_intents` | SELECT | financeiro/checkout | tenant atual + `payment.read` |
| `tenant_core.payments` | SELECT | financeiro/checkout | tenant atual; cliente lê próprio pagamento via RPC segura |
| `tenant_core.payment_allocations` | SELECT | financeiro | tenant atual; append-only |
| `tenant_core.payment_status_history` | SELECT | financeiro | tenant atual |
| `tenant_core.payment_refunds` | SELECT | financeiro/manager | tenant atual + `refund.read` |
| `tenant_core.refund_requests` | INSERT/UPDATE | Command trusted | aprovação exige papel e Action Request quando sensível |
| `tenant_core.payment_gateway_events` | SELECT | financeiro restrito | payload redigido; sem leitura direta por staff/cliente |
| `tenant_core.no_show_deposits` | SELECT | financeiro/cliente próprio | tenant atual + cliente próprio via RPC segura |
| `tenant_core.payment_reconciliation_items` | SELECT | financeiro | tenant atual + `payment.reconciliation.read` |
| `tenant_core.payment_*`, `tenant_core.no_show_deposits` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito; grants somente roles técnicos |

### 13.6 Invariantes

1. Pagamento capturado deve ter allocation append-only cobrindo o destino correto. [MB §10/Gate12]
2. Soma de allocations por payment nunca excede `captured_cents - refunded_cents`. [MB §6/D13]
3. Captura real gera ou referencia financial transaction no ledger. [MB §6/D15]
4. Reembolso é transação reversa nova; nunca edita payment original. [MB §6/D13][MB §6/D15]
5. Depósito de no-show só pode ser aplicado, liberado, confiscado ou reembolsado por Command auditável. [MB §6/D13]
6. Gateway payload é redigido; dado sensível não vira log bruto. [MB §26]


7. COF-01: Sistema armazena `provider_token`; nunca PAN; constraint regex ativa em `payment_method_tokens`. [MB4.0 §16/DEC-PO-01]
8. COF-02: Consentimento explícito em `card_consent_records` é obrigatório antes de qualquer cobrança futura. [MB4.0 §16/DEC-PO-01]
9. COF-03: Cobrança de no-show exige policy ativa, evento real, Command e ledger na mesma transação. [MB4.0 §16/DEC-PO-01][MB4.0 §10/Gate12]
10. COF-04: Cliente visualiza regra de depósito/pré-pagamento antes de registrar token; frontend exibe e backend valida por `policy_snapshot`. [MB4.0 §5.1][MB4.0 §16/DEC-PO-01]
11. COF-05: Reembolso de COF gera lançamento reverso no ledger via `reverse_ledger_transaction`; não edita pagamento original. [MB4.0 §16/DEC-PO-01][MB4.0 §7]
12. COF-06: Falha de cobrança gateway não altera `appointment.status` sem Command de status explícito. [MB4.0 §16/DEC-PO-01]

### 13.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `payment.intent_created` | `tenant_id`, `payment_intent_id`, `checkout_session_id`, `amount_cents` |
| `payment.captured` | `tenant_id`, `payment_id`, `captured_cents`, `financial_transaction_id` |
| `payment.allocated` | `tenant_id`, `payment_id`, `allocation_count`, `allocated_cents` |
| `payment.refund_requested` | `tenant_id`, `refund_request_id`, `payment_id`, `amount_cents` |
| `payment.refunded` | `tenant_id`, `payment_refund_id`, `financial_transaction_id` |
| `payment.gateway_event_ingested` | `provider`, `provider_event_id`, `processing_status` |
| `payment.no_show_deposit_captured` | `tenant_id`, `appointment_id`, `payment_id`, `captured_cents` |
| `payment.reconciliation_completed` | `tenant_id`, `run_id`, `status`, `mismatch_count` |

| `payment.token_registered` | `tenant_id`, `client_id`, `payment_method_token_id`, `token_kind` |
| `payment.card_consent_recorded` | `tenant_id`, `client_id`, `consent_id`, `consent_kind` |
| `payment.card_on_file_charged` | `tenant_id`, `client_id`, `appointment_id`, `amount_cents` |
| `payment.card_on_file_charge_failed` | `tenant_id`, `client_id`, `appointment_id`, `failure_code` |

### 13.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 02, 08, 12, 14, 15, 16 |
| É dependência de | 12, 14, 16, 17, 18, 25, 31 |

### 13.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 12 — Payment Allocation | Pagamento misto com alocações corretas por item, charge, wallet e depósito [MB §10/Gate12] |
| Gate 10 — Checkout Integrity | Fechamento de checkout só após pagamento/alocação backend-only [MB §10/Gate10] |

| Gate 08 — Reliability/Deposit | Policy D02 exige depósito/COF quando aplicável; D13 executa token e consentimento [MB4.0 §10/Gate08] |
| Gate 12 — Payment Allocation v4.0 | COF charge cria payment intent, allocation e ledger sem saldo paralelo [MB4.0 §10/Gate12] |
| Gate 16 — Action Request Safety | Cobrança sensível por recepção/no-show worker exige fluxo autorizado conforme policy [MB4.0 §10/Gate16] |

### 13.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D13][MB §9]

---

## Domínio 14 — Cash & Register Management

### 14.1 Responsabilidade

O Domínio 14 é dono de caixa físico por unidade: cadastro de registradores, abertura, suprimento, sangria, pagamentos em dinheiro, fechamento, evidência e divergência. Não calcula checkout, não captura gateway, não altera ledger sem Command e não mistura caixa entre unidades. [MB §6/D14][MB §10/Gate18]

### 14.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.cash_registers` | Cadastro de caixas físicos por unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `name`; `status cash_register_status`; `location_label`; `created_at`; `updated_at`; `deleted_at`; unique ativo `(tenant_id,business_unit_id,name)` | RLS_ENABLED = SIM; gerente/financeiro lê; Command escreve |
| `tenant_core.cash_sessions` | Sessão de caixa | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `cash_register_id`; `status cash_session_status`; `opened_by_membership_id`; `closed_by_membership_id`; `opened_at`; `closed_at`; `opening_amount_cents bigint check >=0`; `expected_amount_cents bigint check >=0`; `counted_amount_cents bigint check >=0 nullable`; `difference_cents bigint`; `closing_notes`; FK `opening_financial_transaction_id`; FK `closing_financial_transaction_id`; unique parcial uma sessão `open`/`closing` por register | RLS_ENABLED = SIM; leitura financeiro/manager; mutação Command |
| `tenant_core.cash_movements` | Movimentos append-only do caixa | PK `id`; FK `tenant_id`; FK `cash_session_id`; FK `payment_id` nullable; FK `financial_transaction_id`; `movement_kind cash_movement_kind`; `entry_type ledger_entry_type`; `amount_cents bigint check >0`; `reason`; `authorized_by_membership_id`; `created_by_membership_id`; `created_at`; trigger bloqueia UPDATE/DELETE; index `(tenant_id,cash_session_id,created_at)` | RLS_ENABLED = SIM; append-only |
| `tenant_core.cash_session_authorizations` | Autorizações de sangria, suprimento, divergência | PK `id`; FK `tenant_id`; FK `cash_session_id`; `authorization_kind cash_authorization_kind`; `amount_cents bigint check >=0`; `reason`; `requested_by_membership_id`; `approved_by_membership_id`; `status authorization_status`; `action_request_id`; timestamps | RLS_ENABLED = SIM; gerente/financeiro |
| `tenant_core.cash_closing_evidence` | Evidência de fechamento | PK `id`; FK `tenant_id`; FK `cash_session_id`; `evidence_kind cash_evidence_kind`; `redacted_payload jsonb`; `file_reference text`; `hash text`; `captured_by_membership_id`; `created_at`; append-only | RLS_ENABLED = SIM; leitura financeira restrita |

### 14.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `cash_register_status` | `active`, `inactive`, `maintenance`, `retired` |
| `cash_session_status` | `open`, `closing`, `closed`, `closed_with_difference`, `cancelled` |
| `cash_movement_kind` | `opening`, `sale_cash`, `inflow`, `outflow`, `sangria`, `suprimento`, `closing_adjustment`, `payout`, `advance`, `refund_cash` |
| `cash_authorization_kind` | `open_register`, `sangria`, `suprimento`, `closing_difference`, `cancel_session`, `manual_adjustment` |
| `cash_evidence_kind` | `cash_count`, `receipt_image`, `manager_note`, `drawer_report`, `signed_statement` |

### 14.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_open_cash_session` | `(p_cash_register_id uuid, p_opening_amount_cents bigint, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Recepção/financeiro |
| `tenant_core.command_record_cash_movement` | `(p_cash_session_id uuid, p_movement_kind cash_movement_kind, p_amount_cents bigint, p_reason text, p_authorization_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Caixa autorizado |
| `tenant_core.command_record_cash_payment` | `(p_cash_session_id uuid, p_checkout_session_id uuid, p_amount_cents bigint, p_actor_user_id uuid, p_ledger_idempotency_key text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Caixa/checkout |
| `tenant_core.command_close_cash_session` | `(p_cash_session_id uuid, p_counted_amount_cents bigint, p_closing_evidence jsonb, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Caixa/manager |
| `tenant_core.read_cash_session_summary` | `(p_cash_session_id uuid, p_actor_user_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | UI autorizada |

**Pré-condições obrigatórias de caixa + ledger**

| Command | Contrato transacional obrigatório |
|---|---|
| `command_record_cash_payment` | Em uma única DB transaction: valida sessão de caixa aberta, valida checkout e papel do ator, cria ou referencia `payment_id`, cria `cash_movement`, chama `command_post_financial_transaction` ou posta ledger inline com `p_ledger_idempotency_key`, grava `financial_transaction_id` no movimento, emite outbox; se o ledger falhar, toda a transação reverte. |
| `command_record_cash_movement` | Para sangria, suprimento, entrada, saída, payout, advance e refund cash: cria `cash_movement` somente junto com `financial_transaction_id` postado ou falha integralmente. |
| `command_close_cash_session` | Diferença de caixa exige transação financeira de ajuste antes de marcar sessão como `closed_with_difference`; fechamento sem diferença registra assertion de caixa. |

### 14.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.cash_registers` | SELECT | gerente/financeiro/recepção autorizada | tenant atual + unidade permitida |
| `tenant_core.cash_sessions` | SELECT | caixa/gerente/financeiro | tenant atual; sessão da unidade permitida |
| `tenant_core.cash_sessions` | INSERT/UPDATE | Command trusted | Sem escrita direta; status só por Command |
| `tenant_core.cash_movements` | SELECT | financeiro/caixa da sessão | tenant atual + unidade permitida; append-only |
| `tenant_core.cash_session_authorizations` | SELECT/INSERT/UPDATE | gerente/financeiro via Command | aprovação exige papel autorizado |
| `tenant_core.cash_closing_evidence` | SELECT | financeiro/manager | payload redigido; sem leitura por cliente/staff |
| `tenant_core.cash_*` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito; grants somente roles técnicos |

### 14.6 Invariantes

1. Uma unidade/register não possui duas sessões abertas simultaneamente. [MB §6/D14]
2. Toda movimentação de caixa gera ou referencia financial transaction e ledger na mesma DB transaction; caixa físico nunca é mutado antes da postagem ledger correspondente. [MB §6/D14][MB §10/Gate18]
3. Sangria, suprimento e divergência exigem motivo e autorização. [MB §6/D14]
4. Fechamento com diferença não apaga movimento; registra diferença e ledger de ajuste. [MB §6/D15]
5. Caixa físico não mistura unidades nem tenants. [MB §10/Gate01]

### 14.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `cash.session_opened` | `tenant_id`, `cash_session_id`, `cash_register_id`, `opening_amount_cents` |
| `cash.movement_recorded` | `tenant_id`, `cash_session_id`, `movement_id`, `movement_kind`, `amount_cents` |
| `cash.payment_recorded` | `tenant_id`, `cash_session_id`, `payment_id`, `amount_cents` |
| `cash.session_closed` | `tenant_id`, `cash_session_id`, `expected_amount_cents`, `counted_amount_cents`, `difference_cents` |
| `cash.difference_recorded` | `tenant_id`, `cash_session_id`, `difference_cents`, `financial_transaction_id` |

### 14.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 02, 12, 13, 15 |
| É dependência de | 13, 16, 17, 25, 31 |

### 14.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 18 — Cash Register Integrity | Abertura, movimentações, fechamento e divergência registradas no ledger [MB §10/Gate18] |
| Gate 11 — Ledger Balance | Movimentos de caixa fecham em double-entry [MB §10/Gate11] |

### 14.10 RAGOV do domínio

**REAL / MVP; crítico por impacto financeiro.** [MB §6/D14][MB §9]

---

## Domínio 15 — Financial Ledger

### 15.1 Responsabilidade

O Domínio 15 é dono do livro-razão financeiro: financial transactions, entries double-entry, reversões, ajustes, idempotência de postagem, reconciliação e assertions de integridade. Não é dono de checkout, captura de pagamento, caixa, wallet ou comissão, mas é a fonte soberana de todo saldo financeiro real. [MB §6/D15][MB §10/Gate11]

### 15.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.financial_transactions` | Cabeçalho de transação financeira | PK `id`; FK `tenant_id`; FK `business_unit_id` nullable; `source_domain financial_source_domain`; `source_table text`; `source_id uuid`; `transaction_kind financial_transaction_kind`; `status ledger_transaction_status`; `currency_code text default 'BRL'`; `description`; `posted_at`; `posted_by_membership_id`; FK `reversed_transaction_id` self nullable; `idempotency_key text`; `metadata`; timestamps; unique `(tenant_id,source_domain,source_id,transaction_kind)` when source_id present; trigger obrigatório `trg_validate_double_entry_before_post` bloqueia transição para `posted` quando soma de debit difere da soma de credit por `financial_transaction_id` e `currency_code`; index `(tenant_id,status,created_at)` | RLS_ENABLED = SIM; leitura financeira; mutação somente ledger Command |
| `tenant_core.ledger_entries` | Entry append-only debit/credit | PK `id`; FK `tenant_id`; FK `financial_transaction_id`; `ledger_entry_type ledger_entry_type`; `account_code text`; `account_type ledger_account_type`; `account_ref_kind ledger_account_ref_kind`; `account_ref_id uuid`; `amount_cents bigint check >0`; `currency_code`; `entry_date date`; `description`; `metadata`; `created_at`; trigger bloqueia UPDATE/DELETE; indexes `(tenant_id,financial_transaction_id)`, `(tenant_id,account_type,account_ref_id,created_at desc)` | RLS_ENABLED = SIM; append-only; leitura financeira |
| `tenant_core.ledger_transaction_idempotency_keys` | Idempotência forte de posting ledger | PK `id`; FK `tenant_id`; `command_name`; `idempotency_key`; `payload_hash`; FK `financial_transaction_id` nullable; `status command_idempotency_status`; `result jsonb`; timestamps; unique `(tenant_id,command_name,idempotency_key)` | RLS_ENABLED = SIM; somente Command |
| `tenant_core.ledger_reversal_links` | Vínculos de reversão | PK `id`; FK `tenant_id`; FK `original_transaction_id`; FK `reversal_transaction_id`; `reversal_reason`; `created_by_membership_id`; `created_at`; unique `(tenant_id,original_transaction_id,reversal_transaction_id)`; check original != reversal | RLS_ENABLED = SIM; append-only |
| `tenant_core.financial_adjustments` | Ajustes financeiros aprovados | PK `id`; FK `tenant_id`; FK `financial_transaction_id`; `source_domain`; `source_id`; `amount_cents bigint check >0`; `adjustment_entry_type ledger_entry_type`; `reason`; `approved_by_membership_id`; `action_request_id`; `created_at`; check approval required | RLS_ENABLED = SIM; financeiro/manager |
| `tenant_core.reconciliation_runs` | Execução de reconciliação | PK `id`; FK `tenant_id`; `run_kind reconciliation_run_kind`; `status reconciliation_run_status`; `window_start`; `window_end`; `started_at`; `finished_at`; `result jsonb`; `created_by_membership_id` nullable; `worker_role text` nullable; check ator humano ou worker | RLS_ENABLED = SIM; worker/financeiro |
| `tenant_core.ledger_integrity_assertions` | Provas de integridade do ledger | PK `id`; FK `tenant_id`; FK `financial_transaction_id` nullable; FK `reconciliation_run_id` nullable; `assertion_kind ledger_assertion_kind`; `status ledger_assertion_status`; `expected_cents bigint`; `observed_cents bigint`; `difference_cents bigint`; `details jsonb`; `checked_at`; append-only | RLS_ENABLED = SIM; worker escreve; financeiro lê |

### 15.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `ledger_entry_type` | `debit`, `credit` |
| `ledger_transaction_status` | `draft`, `posting`, `posted`, `reversed`, `failed`, `voided_before_posting` |
| `financial_source_domain` | `checkout`, `payment`, `cash`, `wallet`, `commission`, `benefit`, `adjustment`, `refund`, `payout`, `advance`, `system_reconciliation` |
| `financial_transaction_kind` | `checkout_sale`, `payment_capture`, `payment_allocation`, `refund`, `cash_opening`, `cash_movement`, `cash_closing_difference`, `wallet_credit`, `wallet_debit`, `commission_accrual`, `commission_adjustment`, `staff_payout`, `staff_advance`, `benefit_liability`, `manual_adjustment`, `reversal` |
| `ledger_account_type` | `cash`, `bank`, `receivable`, `revenue`, `discount`, `liability`, `client_wallet`, `staff_payable`, `commission_expense`, `cashback_liability`, `benefit_liability`, `tax`, `adjustment`, `refund`, `clearing` |
| `ledger_account_ref_kind` | `none`, `business_unit`, `cash_register`, `cash_session`, `payment_method`, `client`, `staff`, `checkout`, `benefit`, `provider`, `manual` |
| `reconciliation_run_kind` | `ledger_balance`, `payment_transaction`, `wallet_drift`, `staff_account`, `client_account`, `commission_origin`, `cash_register`, `benefit_balance` |
| `reconciliation_run_status` | `pending`, `running`, `passed`, `failed`, `warning`, `cancelled` |
| `ledger_assertion_kind` | `double_entry_balance`, `transaction_posted_once`, `wallet_projection_match`, `payment_allocation_match`, `cash_session_match`, `commission_origin_match`, `reversal_link_valid` |
| `ledger_assertion_status` | `passed`, `failed`, `warning` |
| `shared.ledger_entry_input` | Tipo composto fundacional para entrada de ledger: `ledger_entry_type ledger_entry_type`; `account_code text`; `account_type ledger_account_type`; `account_ref_kind ledger_account_ref_kind`; `account_ref_id uuid nullable`; `amount_cents bigint check >0`; `currency_code text`. Não aceita JSON livre como contrato de postagem. |

### 15.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_post_financial_transaction` | `(p_source_domain financial_source_domain, p_source_id uuid, p_transaction_kind financial_transaction_kind, p_entries shared.ledger_entry_input[], p_description text, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Commands D12–D17 via backend |
| `tenant_core.command_reverse_financial_transaction` | `(p_original_transaction_id uuid, p_reversal_reason text, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Financeiro autorizado |
| `tenant_core.command_create_financial_adjustment` | `(p_source_domain financial_source_domain, p_source_id uuid, p_amount_cents bigint, p_adjustment_entry_type ledger_entry_type, p_reason text, p_action_request_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Manager/financeiro |
| `tenant_core.command_run_ledger_integrity_check` | `(p_tenant_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_run_kind reconciliation_run_kind, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker/gate |
| `tenant_core.read_financial_transaction` | `(p_financial_transaction_id uuid, p_actor_user_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Financeiro/manager |
| `tenant_core.read_ledger_balance_projection` | `(p_account_type ledger_account_type, p_account_ref_id uuid, p_as_of timestamptz, p_actor_user_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Financeiro/manager |

**Pré-condições obrigatórias de postagem ledger**

| Item | Contrato |
|---|---|
| Tipo de entrada | `command_post_financial_transaction` recebe somente `shared.ledger_entry_input[]`; JSON livre é proibido para entries de ledger. |
| Double-entry | Antes de transicionar para `posted`, o banco valida que, para cada `currency_code`, `SUM(debit.amount_cents) = SUM(credit.amount_cents)`. |
| Trigger obrigatório | `trg_validate_double_entry_before_post` bloqueia UPDATE/Command que tente `posted` com diferença, sem entry, moeda divergente ou amount inválido. |
| Atomicidade | O Command insere `financial_transactions`, `ledger_entries`, assertions e outbox na mesma DB transaction; falha de qualquer etapa reverte tudo. |
| Replay | Idempotência usa `ledger_transaction_idempotency_keys` + hash de `shared.ledger_entry_input[]`; replay incompatível retorna erro estruturado `IDEMPOTENCY_PAYLOAD_MISMATCH`. |

### 15.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.financial_transactions` | SELECT | financeiro/owner/admin | tenant atual + `finance.ledger.read` |
| `tenant_core.financial_transactions` | INSERT/UPDATE | Command trusted | `posted` somente por `command_post_financial_transaction`; trigger `trg_validate_double_entry_before_post` prova debit=credit antes de posting; `UPDATE` limitado a status antes de posting |
| `tenant_core.ledger_entries` | SELECT | financeiro/owner/admin | tenant atual + `finance.ledger.read` |
| `tenant_core.ledger_entries` | INSERT | Ledger Command | sem INSERT direto; trigger bloqueia UPDATE/DELETE |
| `tenant_core.ledger_transaction_idempotency_keys` | ALL | Command trusted | sem acesso direto por UI |
| `tenant_core.ledger_reversal_links` | SELECT | financeiro | tenant atual; append-only |
| `tenant_core.financial_adjustments` | SELECT | financeiro/manager | tenant atual + `finance.adjustment.read` |
| `tenant_core.reconciliation_runs` | SELECT | financeiro/gate auditor | tenant atual |
| `tenant_core.ledger_integrity_assertions` | SELECT | financeiro/gate auditor | tenant atual |
| `tenant_core.financial_*`, `tenant_core.ledger_*`, `tenant_core.reconciliation_runs` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito; grants somente roles técnicos |

### 15.6 Invariantes

1. Transação financeira só muda para `posted` se trigger de banco `trg_validate_double_entry_before_post` comprovar soma de `debit` = soma de `credit` por `financial_transaction_id` e `currency_code`. [MB §10/Gate11]
2. `ledger_entries` são append-only; UPDATE/DELETE bloqueados por trigger. [MB §6/D15]
3. Reversão nunca altera a transação original; cria nova transação e `ledger_reversal_links`. [MB §6/D15]
4. Nenhuma tabela de saldo soberano existe fora do ledger. [MB §6/D16][RM §6]
5. Não existe `ledger_accounts` no Bloco D. Account identity mora nas entries. [SKILL §4]
6. Assertion de integridade falha bloqueia Gate 11 e Gate 13. [MB §10/Gate11][MB §10/Gate13]

### 15.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `ledger.transaction_posted` | `tenant_id`, `financial_transaction_id`, `transaction_kind`, `amount_cents` |
| `ledger.transaction_reversed` | `tenant_id`, `original_transaction_id`, `reversal_transaction_id`, `reason` |
| `ledger.adjustment_created` | `tenant_id`, `financial_adjustment_id`, `financial_transaction_id`, `amount_cents` |
| `ledger.integrity_check_completed` | `tenant_id`, `reconciliation_run_id`, `status`, `failed_assertions` |
| `ledger.assertion_failed` | `tenant_id`, `assertion_id`, `assertion_kind`, `difference_cents` |

### 15.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 02, shared foundation |
| É dependência de | 12, 13, 14, 16, 17, 18, 25, 31 |

### 15.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 11 — Ledger Balance | Débitos e créditos fecham; double-entry provado [MB §10/Gate11] |
| Gate 13 — Wallet Drift | Ledger serve de base para comparar wallet reconstruída [MB §10/Gate13] |
| Gate 18 — Cash Register Integrity | Caixa gera ledger consistente [MB §10/Gate18] |

### 15.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D15][MB §9]

---

## Domínio 16 — Wallet & Current Accounts

### 16.1 Responsabilidade

O Domínio 16 é dono das contas correntes de cliente e staff, entries append-only, projeções reconstruíveis e drift checks. Não cria ledger, não calcula comissão, não captura pagamento e não mantém `wallet_entries` como fonte paralela. [MB §6/D16][RM §4 #64]

### 16.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.client_current_accounts` | Conta corrente do cliente | PK `id`; FK `tenant_id`; FK `client_id`; `status current_account_status`; `opened_at`; `closed_at`; unique `(tenant_id,client_id)` | RLS_ENABLED = SIM; cliente próprio via RPC; financeiro lê |
| `tenant_core.client_account_entries` | Movimentos append-only do cliente | PK `id`; FK `tenant_id`; FK `client_account_id`; FK `client_id`; FK `financial_transaction_id`; FK `ledger_entry_id`; `status account_entry_status`; `entry_kind client_account_entry_kind`; `ledger_entry_type`; `amount_cents bigint check >=0`; `quantity numeric(12,3) check >=0`; `expires_at`; `source_domain financial_source_domain`; `source_id uuid`; `description`; `created_by_membership_id`; `created_at`; trigger bloqueia UPDATE/DELETE; index `(tenant_id,client_id,created_at desc)` | RLS_ENABLED = SIM; append-only |
| `tenant_core.staff_current_accounts` | Conta corrente do staff | PK `id`; FK `tenant_id`; FK `staff_id`; `status current_account_status`; `opened_at`; `closed_at`; unique `(tenant_id,staff_id)` | RLS_ENABLED = SIM; staff próprio via RPC; financeiro lê |
| `tenant_core.staff_account_entries` | Movimentos append-only do staff | PK `id`; FK `tenant_id`; FK `staff_account_id`; FK `staff_id`; FK `financial_transaction_id`; FK `ledger_entry_id`; FK `commission_calculation_id` nullable; `status account_entry_status`; `entry_kind staff_account_entry_kind`; `ledger_entry_type`; `amount_cents bigint check >=0`; `description`; `created_by_membership_id`; `created_at`; trigger bloqueia UPDATE/DELETE; index `(tenant_id,staff_id,created_at desc)` | RLS_ENABLED = SIM; staff só próprio resumo via RPC |
| `tenant_core.current_account_balance_projections` | Projeção reconstruível de saldo | PK `id`; FK `tenant_id`; `account_kind current_account_kind`; `account_id uuid`; `owner_ref_id uuid`; `as_of timestamptz`; `available_cents bigint check >=0`; `pending_cents bigint check >=0`; `held_cents bigint check >=0`; `source_entry_count int check >=0`; `rebuild_run_id uuid`; unique `(tenant_id,account_kind,account_id,as_of)` | RLS_ENABLED = SIM; read model reconstruível |
| `tenant_core.wallet_drift_assertions` | Prova de drift entre entries/projection/ledger | PK `id`; FK `tenant_id`; `account_kind`; `account_id`; `ledger_rebuilt_cents bigint`; `entries_rebuilt_cents bigint`; `projection_cents bigint`; `difference_cents bigint`; `status ledger_assertion_status`; FK `reconciliation_run_id`; `checked_at`; append-only | RLS_ENABLED = SIM; worker escreve; financeiro/gate lê |

### 16.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `current_account_status` | `active`, `blocked`, `closed` |
| `current_account_kind` | `client`, `staff` |
| `account_entry_status` | `pending`, `posted`, `available`, `held`, `used`, `settled`, `expired`, `reversed` |
| `client_account_entry_kind` | `credit`, `debit`, `cashback_grant`, `cashback_use`, `wallet_credit`, `wallet_use`, `package_use`, `subscription_use`, `adjustment`, `expiration`, `refund`, `reversal` |
| `staff_account_entry_kind` | `commission_estimated`, `commission_confirmed`, `payout`, `advance`, `adjustment`, `reversal`, `hold`, `release`, `settlement` |

### 16.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_open_client_current_account` | `(p_client_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Backend/checkout |
| `tenant_core.command_open_staff_current_account` | `(p_staff_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend/commission |
| `tenant_core.command_post_client_account_entry` | `(p_client_account_id uuid, p_entry_kind client_account_entry_kind, p_amount_cents bigint, p_quantity numeric, p_source_domain financial_source_domain, p_source_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Checkout/benefits/payment |
| `tenant_core.command_post_staff_account_entry` | `(p_staff_account_id uuid, p_entry_kind staff_account_entry_kind, p_amount_cents bigint, p_source_domain financial_source_domain, p_source_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Commission/payout |
| `tenant_core.command_rebuild_current_account_projection` | `(p_account_kind current_account_kind, p_account_id uuid, p_as_of timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker/gate |
| `tenant_core.command_run_wallet_drift_check` | `(p_tenant_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker/gate |
| `tenant_core.read_client_wallet_summary` | `(p_client_id uuid, p_actor_user_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Cliente próprio/recepção |
| `tenant_core.read_staff_account_summary` | `(p_staff_id uuid, p_actor_user_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Staff próprio/financeiro |

### 16.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.client_current_accounts` | SELECT | financeiro/cliente próprio via RPC | tenant atual; cliente direto só via RPC segura |
| `tenant_core.client_account_entries` | SELECT | financeiro/cliente próprio via RPC | tenant atual; cliente vê próprio extrato redigido |
| `tenant_core.staff_current_accounts` | SELECT | financeiro/staff próprio via RPC | staff próprio por `staff_profiles.user_profile_id = p_actor_user_id` |
| `tenant_core.staff_account_entries` | SELECT | financeiro/staff próprio via RPC | staff nunca lê outro staff; predicado por staff próprio |
| `tenant_core.current_account_balance_projections` | SELECT | financeiro/dono da conta via RPC | read model; não é fonte soberana |
| `tenant_core.wallet_drift_assertions` | SELECT | financeiro/gate auditor | tenant atual |
| `tenant_core.*account*` | INSERT | Command trusted | sem INSERT direto por authenticated |
| `tenant_core.client_account_entries`, `tenant_core.staff_account_entries` | UPDATE/DELETE | Todos | bloqueado por trigger append-only |
| `tenant_core.*account*`, `tenant_core.wallet_drift_assertions` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito; grants somente roles técnicos |

### 16.6 Invariantes

1. Saldo de wallet é reconstruível a partir de entries e ledger. [MB §6/D16]
2. `wallet_entries` legado não é recriado. [RM §4 #64]
3. Projection não é fonte soberana; drift check compara projection, entries e ledger. [MB §10/Gate13]
4. Staff só vê própria conta corrente. [MB §10/Gate14]
5. Account entry financeira deve referenciar ledger transaction/entry quando altera dinheiro real. [MB §6/D15][MB §6/D16]

### 16.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `wallet.client_account_opened` | `tenant_id`, `client_id`, `client_account_id` |
| `wallet.staff_account_opened` | `tenant_id`, `staff_id`, `staff_account_id` |
| `wallet.client_entry_posted` | `tenant_id`, `client_account_id`, `entry_id`, `amount_cents`, `entry_kind` |
| `wallet.staff_entry_posted` | `tenant_id`, `staff_account_id`, `entry_id`, `amount_cents`, `entry_kind` |
| `wallet.projection_rebuilt` | `tenant_id`, `account_kind`, `account_id`, `available_cents` |
| `wallet.drift_detected` | `tenant_id`, `account_kind`, `account_id`, `difference_cents` |

### 16.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 05, 12, 13, 15, 17 |
| É dependência de | 12, 13, 17, 18, 25, 31 |

### 16.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 13 — Wallet Drift | Saldo projetado versus histórico reconstruído devem bater [MB §10/Gate13] |
| Gate 14 — Commission Privacy & Accuracy | Staff account privado por staff [MB §10/Gate14] |

### 16.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D16][MB §9]

---

## Domínio 17 — Compensation Engine

### 17.1 Responsabilidade

O Domínio 17 é dono das regras de comissão/remuneração, cálculo backend-only, itens de comissão, ajustes aprovados, adiantamentos, repasses e painel financeiro privado do profissional. Não calcula checkout, não captura pagamento, não cria saldo sem ledger e não permite staff visualizar financeiro de outro staff. [MB §6/D17][MB §10/Gate14]

### 17.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.compensation_rules` | Regras versionadas de comissão | PK `id`; FK `tenant_id`; FK `staff_id` nullable; FK `service_id` nullable; FK `product_id` nullable; FK `category_id` nullable; `rule_kind compensation_rule_kind`; `base compensation_base`; `percent_rate numeric(9,6) check 0..1 nullable`; `fixed_cents bigint check >=0 nullable`; `tier_config jsonb`; `priority int`; `is_active`; `valid_from`; `valid_until`; `created_by_membership_id`; check percent or fixed/tier present; unique parcial obrigatório `(tenant_id, staff_id, service_id, product_id, category_id, rule_kind, priority) WHERE is_active = true`, com normalização de escopo nulo via sentinel/expressão canônica no SQL Master; index `(tenant_id,staff_id,is_active)` | RLS_ENABLED = SIM; gerente/financeiro lê/escreve via Command |
| `tenant_core.commission_calculations` | Cálculo backend-only por staff/checkout | PK `id`; FK `tenant_id`; FK `checkout_session_id`; FK `appointment_id` nullable; FK `staff_id`; `status commission_status`; `gross_base_cents bigint check >=0`; `net_base_cents bigint check >=0`; `commission_cents bigint check >=0`; FK `financial_transaction_id` nullable; `calculation_version`; `calculated_at`; `confirmed_at`; `confirmed_by_membership_id`; `metadata`; unique `(tenant_id,checkout_session_id,staff_id,calculation_version)` | RLS_ENABLED = SIM; staff próprio via RPC; financeiro lê |
| `tenant_core.commission_items` | Itens de cálculo por checkout item | PK `id`; FK `tenant_id`; FK `commission_calculation_id`; FK `checkout_item_id`; FK `compensation_rule_id`; FK `staff_id`; `base_cents bigint check >=0`; `rate numeric(9,6) check 0..1 nullable`; `fixed_cents bigint check >=0 nullable`; `commission_cents bigint check >=0`; `created_at`; trigger bloqueia UPDATE/DELETE após cálculo confirmado | RLS_ENABLED = SIM; staff próprio via RPC |
| `tenant_core.commission_adjustments` | Ajustes aprovados de comissão | PK `id`; FK `tenant_id`; FK `commission_calculation_id`; `amount_cents bigint check >0`; `ledger_entry_type`; `reason`; `approved_by_membership_id`; `action_request_id`; FK `financial_transaction_id`; `created_at`; check approval required | RLS_ENABLED = SIM; financeiro/manager |
| `tenant_core.staff_payouts` | Repasses a profissionais | PK `id`; FK `tenant_id`; FK `staff_id`; `amount_cents bigint check >0`; `status staff_payout_status`; `payout_method payout_method_kind`; FK `payment_intent_id` nullable; FK `payment_id` nullable; FK `financial_transaction_id` nullable; `requested_by_membership_id`; `approved_by_membership_id`; `paid_at`; timestamps; check pagamento exige approval | RLS_ENABLED = SIM; staff próprio resumo; financeiro completo |
| `tenant_core.staff_advances` | Adiantamentos controlados | PK `id`; FK `tenant_id`; FK `staff_id`; `amount_cents bigint check >0`; `status staff_advance_status`; `reason`; FK `financial_transaction_id`; `requested_by_membership_id`; `approved_by_membership_id`; `repaid_at`; timestamps | RLS_ENABLED = SIM; staff próprio resumo; financeiro completo |
| `tenant_core.compensation_privacy_access_logs` | Auditoria de acesso a financeiro do staff | PK `id`; FK `tenant_id`; FK `staff_id`; `actor_user_id`; `access_reason compensation_access_reason`; `fields text[]`; `created_at`; `request_id`; append-only | RLS_ENABLED = SIM; auditor/financeiro lê |

### 17.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `compensation_rule_kind` | `percent_service`, `fixed_service`, `percent_product`, `fixed_product`, `by_category`, `by_staff`, `tiered`, `salary_plus_commission_prepared`, `chair_rent_prepared`, `bonus_prepared` |
| `compensation_base` | `gross`, `net`, `after_discount`, `before_discount`, `service_only`, `product_only` |
| `commission_status` | `estimated`, `calculated`, `confirmed`, `posted_to_staff_account`, `adjusted`, `reversed`, `cancelled` |
| `staff_payout_status` | `requested`, `approved`, `scheduled`, `paid`, `failed`, `cancelled`, `reversed` |
| `payout_method_kind` | `pix`, `bank_transfer`, `cash`, `manual_receipt`, `digital_account` |
| `staff_advance_status` | `requested`, `approved`, `posted`, `partially_repaid`, `repaid`, `cancelled`, `reversed` |
| `compensation_access_reason` | `staff_self_view`, `manager_review`, `payout_processing`, `audit`, `correction`, `gate_test` |

### 17.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_compensation_rule` | `(p_rule jsonb, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Manager/financeiro |
| `tenant_core.command_calculate_checkout_commissions` | `(p_checkout_session_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Checkout close workflow |
| `tenant_core.command_confirm_commission_calculation` | `(p_commission_calculation_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Financeiro/manager |
| `tenant_core.command_adjust_commission` | `(p_commission_calculation_id uuid, p_amount_cents bigint, p_ledger_entry_type ledger_entry_type, p_reason text, p_action_request_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Financeiro autorizado |
| `tenant_core.command_request_staff_payout` | `(p_staff_id uuid, p_amount_cents bigint, p_payout_method payout_method_kind, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Staff próprio/financeiro conforme policy |
| `tenant_core.command_approve_staff_payout` | `(p_staff_payout_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Manager/financeiro |
| `tenant_core.command_post_staff_advance` | `(p_staff_id uuid, p_amount_cents bigint, p_reason text, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Manager/financeiro |
| `tenant_core.read_staff_compensation_summary` | `(p_staff_id uuid, p_actor_user_id uuid, p_window_start timestamptz, p_window_end timestamptz) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Staff próprio/financeiro |
| `tenant_core.read_compensation_dashboard` | `(p_business_unit_id uuid, p_actor_user_id uuid, p_window_start timestamptz, p_window_end timestamptz) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Manager/financeiro |

### 17.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.compensation_rules` | SELECT | manager/financeiro | tenant atual + `compensation.rule.read`; staff não lê regra global bruta |
| `tenant_core.compensation_rules` | INSERT/UPDATE | Command trusted | alteração exige papel gerencial e audit log |
| `tenant_core.commission_calculations` | SELECT | financeiro ou staff próprio via RPC | staff próprio validado por `staff_profiles.user_profile_id = p_actor_user_id`; sem SELECT direto amplo |
| `tenant_core.commission_items` | SELECT | financeiro ou staff próprio via RPC | staff próprio somente itens próprios |
| `tenant_core.commission_adjustments` | SELECT | financeiro/manager; staff próprio resumo | staff vê valor final próprio, não ajuste de outro staff |
| `tenant_core.staff_payouts` | SELECT | financeiro ou staff próprio | staff vê próprios payouts; financeiro vê todos no tenant |
| `tenant_core.staff_advances` | SELECT | financeiro ou staff próprio | staff vê próprios adiantamentos |
| `tenant_core.compensation_privacy_access_logs` | SELECT | auditor/financeiro | tenant atual + `compensation.audit.read` |
| `tenant_core.commission_items`, `tenant_core.compensation_privacy_access_logs` | UPDATE/DELETE | Todos | bloqueado append-only quando confirmado/logado |
| `tenant_core.compensation_*`, `tenant_core.commission_*`, `tenant_core.staff_payouts`, `tenant_core.staff_advances` | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito; grants somente roles técnicos |

### 17.6 Invariantes

1. Comissão é calculada no backend, nunca no frontend. [MB §6/D17][MB §10/Gate14]
2. Staff nunca acessa comissão de outro staff. [MB §10/Gate14]
3. Cálculo de comissão referencia checkout item e regra versionada. [RM §4 #66–#67]
4. Ajuste de comissão exige motivo, aprovação e ledger reversível. [RM §4 #68]
5. Payout e advance alteram staff account e ledger; não criam saldo direto. [RM §4 #69–#70][MB §6/D16]
6. Leitura financeira do staff gera `compensation_privacy_access_logs` quando feita por gerente/financeiro. [MB §26]

### 17.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `compensation.rule_created` | `tenant_id`, `compensation_rule_id`, `rule_kind` |
| `compensation.calculated` | `tenant_id`, `checkout_session_id`, `commission_calculation_count` |
| `compensation.confirmed` | `tenant_id`, `commission_calculation_id`, `commission_cents` |
| `compensation.adjusted` | `tenant_id`, `commission_adjustment_id`, `amount_cents`, `ledger_entry_type` |
| `compensation.payout_requested` | `tenant_id`, `staff_payout_id`, `staff_id`, `amount_cents` |
| `compensation.payout_paid` | `tenant_id`, `staff_payout_id`, `financial_transaction_id` |
| `compensation.advance_posted` | `tenant_id`, `staff_advance_id`, `financial_transaction_id` |
| `compensation.private_summary_read` | `tenant_id`, `staff_id`, `actor_user_id`, `access_reason` |

### 17.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 05, 06, 08, 12, 13, 15, 16 |
| É dependência de | 18, 23, 25, 26, 31 |

### 17.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 14 — Commission Privacy & Accuracy | Comissão correta, calculada no backend, visível apenas ao staff correto [MB §10/Gate14] |
| Gate 11 — Ledger Balance | Comissão confirmada/payout/advance fecham no ledger [MB §10/Gate11] |

### 17.10 RAGOV do domínio

**CRÍTICO / REAL / MVP.** [MB §6/D17][MB §9]

---

## 6. Mapa de relações inter-domínios do Bloco D

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| 12 | 08 | `checkout_sessions.appointment_id` → appointment aprovado | Checkout não recalcula agenda; usa appointment como origem [MB §6/D12] |
| 12 | 10 | `checkout_group_member_charges` → grupo/membro | Split financeiro por membro; sem JSON como fonte [MB §10/Gate07] |
| 13 | 12 | `payments.checkout_session_id` e `payment_allocations.checkout_item_id` | Pagamento liquida checkout e itens [MB §10/Gate12] |
| 13 | 15 | `payments.financial_transaction_id` | Captura/reembolso gera ledger [MB §6/D15] |
| 14 | 13 | pagamento em dinheiro vincula `cash_session_id` | Caixa físico registra pagamento manual [MB §6/D14] |
| 14 | 15 | `cash_movements.financial_transaction_id` | Todo movimento de caixa gera ledger [MB §10/Gate18] |
| 16 | 15 | account entries referenciam financial transaction/ledger entry | Wallet reconstruível [MB §10/Gate13] |
| 17 | 12 | commission calculation referencia checkout/session/item | Comissão deriva de venda real [MB §6/D17] |
| 17 | 16 | commission/payout/advance postam staff account entries | Staff account reconstruível [MB §6/D16] |
| 17 | 15 | comissão, ajuste, payout e advance geram ledger | Sem saldo direto [MB §10/Gate11] |
| 12 | 18 | `checkout_benefit_applications` será reconciliada por D18 | D12 aplica no total; D18 prova origem/consumo [MB §10/Gate15] |

---

## 7. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gate secundário | Critério bloqueante |
|---:|---:|---|---|---|
| 12 | 017 | Gate 10 | Gate 07 / Gate 12 | Total backend-only e split de grupo auditável |
| 13 | 018 | Gate 12 | Gate 10 / Gate 11 | Payment allocations fecham pagamento e item |
| 14 | 019 | Gate 18 | Gate 11 | Caixa sem ledger bloqueia aprovação |
| 15 | 016 | Gate 11 | Gate 13 / Gate 18 | Debit/credit não fecham = reprovação |
| 16 | 020 | Gate 13 | Gate 14 | Projection diverge de entries/ledger = reprovação |
| 17 | 021 | Gate 14 | Gate 11 | Staff vê outro staff ou comissão errada = reprovação |
| 18 | Bloco E | Gate 15 | Gate 10 | Benefício completo não é declarado pronto no Bloco D |

---

## 8. Ordem única de execução de migrations do Bloco D

1. `016_financial_ledger.sql` — enums financeiros, `financial_transactions`, `ledger_entries`, idempotência de ledger, reversões, ajustes e assertions. [MB §6/D15][RM §5/D15]
2. `017_checkout_core.sql` — sessões, itens, descontos, aplicações de benefício, gorjetas, split de grupo, autorizações e histórico. [MB §6/D12][RM §5/D12]
3. `018_payment_core.sql` — intents, payments, allocations, refunds, gateway events, depósitos e reconciliação. [MB §6/D13][RM §5/D13]
4. `019_cash_register.sql` — cash registers, sessions, movements, authorizations e closing evidence. [MB §6/D14][RM §5/D14]
5. `020_wallet_current_accounts.sql` — client/staff accounts, entries, projections e drift assertions. [MB §6/D16][RM §5/D16]
6. `021_compensation_engine.sql` — compensation rules, calculations, items, adjustments, payouts, advances e privacy logs. [MB §6/D17][RM §5/D17]

**Regra operacional:** migrations 016–021 rodam como pacote indivisível em ambiente de integração antes de qualquer dado financeiro real. Nenhum tenant pode operar checkout real com parte do Bloco D aplicado. [MB §10/Gate00]

---

## 9. Estratégia de rollback do Bloco D

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 016 | Em sandbox sem dados reais, remover objetos de ledger; com dados reais, criar reversão/void lógico | Apagar ledger entries ou financial transactions postadas |
| 017 | Cancelar checkout `draft/open` por status; reabrir via Command auditado | DELETE físico de checkout fechado ou itens |
| 018 | Cancelar intent não capturada; reembolsar por transação reversa | Editar payment capturado, allocation ou refund histórico |
| 019 | Cancelar sessão sem movimento real; fechar com diferença e ledger | Apagar cash movements ou evidência de fechamento |
| 020 | Rebuild projection; bloquear conta por status | Apagar account entries ou projection usada em auditoria sem rebuild |
| 021 | Desativar regra por status/versionamento; criar ajuste reverso | Editar cálculo confirmado, payout pago ou advance postado |

---

## 10. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| F0-01 `_cents bigint` | RATIFICADA | Ledger precisa fechar centavo a centavo; taxas ficam em `numeric` | [RM §7][MB §10/Gate11] |
| Ledger antes de checkout/payment na migration | REAL | Dinheiro não pode nascer antes da estrutura soberana de ledger | [MB §6/D15][SKILL §6] |
| Não criar `ledger_accounts` | REAL | Tabela proibida; account identity fica nas entries | [SKILL §4][RM §6] |
| `wallet_entries` removida | REAL | Fonte paralela de saldo bloqueada; entries canônicas são client/staff account entries | [RM §4 #64] |
| Benefit application sem consumo final | PARCIAL CONTROLADO | D12 calcula total; D18 prova origem/consumo no Bloco E | [MB §10/Gate15] |
| Grupo dividido em charges por membro | REAL | Completa Gate 07 sem JSON financeiro | [MB §10/Gate07] |
| Commission privacy via RPC + RLS | CRÍTICO | Staff nunca lê financeiro alheio | [MB §10/Gate14] |
| Reversão por nova transação | CRÍTICO | Preserva append-only e antifraude | [MB §6/D15] |
| Caixa + ledger atômicos | CRÍTICO | `command_record_cash_payment` só cria movimento de caixa junto com postagem ledger na mesma DB transaction | [MB §10/Gate18][MB §10/Gate11] |
| Tipo `shared.ledger_entry_input[]` | CRÍTICO | Entries de ledger não entram como JSON livre; contrato tipado permite validação de banco | [MB §10/Gate11][SKILL §4] |
| Trigger double-entry antes de `posted` | CRÍTICO | Invariante debit=credit é provada no banco, não por promessa verbal | [MB §10/Gate11] |
| Checkout sem floor silencioso | REAL | Desconto/benefício excessivo retorna `VALIDATION_FAILED`; `greatest` proibido para mascarar erro em sessão e em charge de grupo | [MB §7][MB §10/Gate10][MB §10/Gate07] |

---

## 11. Reflexion contra Definition of Done do Bloco D

| Item verificado | Resultado | Correção aplicada |
|---|---|---|
| Domínios 12–17 têm os 10 blocos obrigatórios | SIM | Sem correção |
| Toda tabela financeira tem RLS especificada | SIM | RLS por tenant, staff próprio e roles financeiros |
| Toda função financeira tem SECURITY e REVOKE explícitos | SIM | Todas as funções D12–D17 usam DEFINER + REVOKE + GRANT técnico |
| Todo domínio CRÍTICO está mapeado a gate | SIM | D12 Gate10, D13 Gate12, D15 Gate11, D16 Gate13, D17 Gate14; D14 Gate18 |
| Ordem de migrations evita dependência circular | SIM | Ledger vem antes; D18 fora do bloco sem FK obrigatória |
| Rollback documentado por migration | SIM | Rollback lógico, reversão e status |
| Zero termo pendente sem decisão numerada | SIM | F0-01, D-01, D-02 e D-03 resolvidas por ToT |
| Platform Owner isolado do contexto tenant | SIM | Bloco D é tenant-scoped; sem schema platform |
| Recorrente e Grupo preservados | SIM | D12 consome grupo/agenda; não reabre modelo C |
| Fiscal e LGPD | PARCIAL CONTROLADO | Logs financeiros e payload redigido; fiscal/LGPD completo fica no Bloco I/D26 por ordem canônica [SKILL §6] |
| Proibição de saldo fake | SIM | Wallet projections são reconstruíveis; ledger soberano |
| Benefício completo | FORA DO BLOCO D | D18 Bloco E será dono de origem, saldo, validade e consumo final |

**Falhas encontradas antes da declaração:** falhas D-01 a D-05 da auditoria v1 foram absorvidas integralmente na v1.1: caixa+ledger atômicos, trigger double-entry, tipo `shared.ledger_entry_input[]`, constraint determinística de comissão e checkout sem floor silencioso em `checkout_sessions`. A ressalva N-01 da auditoria v1.1 foi absorvida nesta v1.2: `checkout_group_member_charges` removeu `greatest(...,0)` e passou a exigir erro estruturado `GROUP_CHARGE_DISCOUNT_EXCEEDS_GROSS` quando desconto+benefício excede bruto.  
**Limite explícito:** este arquivo não declara o Blueprint 31/31 pronto; declara o Bloco D pronto para auditoria, respeitando a criação sequencial. [SKILL §6]

Bloco D v1.2 pronto para auditoria/registro Red Team.

Pronto para auditoria Red Team.

---

## ANEXO E — SMART_FLOW_3_0_BLUEPRINT_BLOCO_E_v1_1.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco E

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco E — Domínios 18, 19, 20  
**Status:** ENTREGUE PARA AUDITORIA RED TEAM DO BLOCO E v1.1  
**Data:** 2026-06-11  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0][MB §6/D18][MB §6/D19][MB §6/D20][MB §10/Gate15][MB §11]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §4 #71–#83][RM §4 #100][RM §5/D18][RM §5/D19][RM §5/D20]

---

## 0. Regra de autoridade e versão

| Regra | Aplicação no Bloco E | Fonte |
|---|---|---|
| Backend é fonte única da verdade | Benefício, portal e página pública não calculam verdade no frontend | [MB §7] |
| D18 fecha origem, validade, saldo reconstruível e consumo de benefício | Nenhum benefício nasce sem `benefit_origin_links` e evento append-only | [MB §6/D18][MB §10/Gate15] |
| D19 é portal/experiência, não motor paralelo de agenda, checkout ou benefício | Portal dispara Commands aprovados em D07/D08/D12/D18 | [MB §6/D19][MB §7] |
| D20 é superfície pública de leitura e conversão | Página pública não processa pagamento diretamente | [MB §6/D20] |
| Benefício sem origem financeira/operacional é bloqueado | Toda concessão aponta origem formal | [MB §6/D18][RM §4 #71–#83] |
| `benefit_balances` não é fonte soberana | Convertido para projeção reconstruível | [RM §4 #73] |
| `wallet_entries` removido permanece proibido | Cashback/crédito não recria wallet paralela | [RM §4 #64][RM §6] |
| Escritas críticas exigem Command, idempotência e outbox | D18–D20 seguem roles e padrões aprovados nos Blocos A–D | [MB §7][SKILL §4] |

---

## 1. Escopo do Bloco E

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| E | 18 | Benefits, Packages & Memberships | Especificado | [MB §6/D18][RM §4 #71–#83][RM §5/D18] |
| E | 19 | Client Experience Hub | Especificado | [MB §6/D19][RM §4 #100][RM §5/D19] |
| E | 20 | Página Web do Salão | Especificado | [MB §6/D20][RM §4 #7][RM §5/D20] |

**Fora do Bloco E:** Messaging D21, AI Receptionist D22, CoPilot D23, CRM D24, Analytics D25, Fiscal/LGPD D26, Marketplace/Integrações/Multiunidade/Governança D27–D31. [SKILL §6][MB §11]

---

## 2. Divergência formal de recorte

### DIVERGÊNCIA FORMAL E-00 — composição do Bloco E

| Item | Conflito | Registro |
|---|---|---|
| SKILL §6 | Define Bloco E como D18 e Bloco F como D19–D20 | [SKILL §6] |
| MB §11 | Lista Benefits Engine antes de Client Experience Hub + Página Web | [MB §11] |
| RM §5 | D18, D19 e D20 têm criação própria e dependências próximas de D12/D18/D02/D06 | [RM §5/D18][RM §5/D19][RM §5/D20] |
| Decisão desta rodada | Platform Owner autorizou recorte operacional Bloco E = D18–D20 | Registro da conversa do projeto |

**Veredito aplicado:** Bloco E cobre D18–D20 nesta entrega.  
**Justificativa:** D19 expõe benefícios ao cliente e D20 converte tráfego para booking/pacote/assinatura; ambos dependem de D18 para leitura segura de benefícios e não podem criar verdade paralela. [MB §6/D18][MB §6/D19][MB §6/D20]  
**Limite:** D19 e D20 não assumem Messaging, AI, CRM, Analytics, Fiscal ou Marketplace. [MB §11]

---

## 3. Convenções herdadas e específicas do Bloco E

| Convenção | Regra | Fonte |
|---|---|---|
| Schemas | `tenant_core` para D18–D20; `shared` apenas tipos/catálogos sem linha de negócio | Bloco A v2.1 [MB §6/D01] |
| Roles técnicos | `app_backend_command_executor`, `app_backend_read_executor`, `app_worker_executor` | Bloco A v2.1 [MB §7] |
| RLS | `RLS_ENABLED = SIM` em todas as tabelas; raw tables não expostas a `anon` | [MB §7][RM §2] |
| REVOKE | `REVOKE ALL` explícito de `PUBLIC`, `anon`, `authenticated`; grants só a roles técnicos | [RM §2][SKILL §4] |
| Idempotência | Todo Command mutável recebe `p_idempotency_key text`; dinheiro usa também chave de ledger quando aplicável | [MB §7][SKILL §4] |
| Dinheiro | Campos monetários em `_cents bigint`; taxas em `numeric`; sem `float` | Bloco D v1.2 [RM §7] |
| Benefício | Saldo é projeção reconstruível; verdade vem de origem + grants + consumos + eventos append-only | [MB §6/D18][RM §4 #72–#74] |
| Concorrência de benefício | `command_authorize_benefit_application` adquire lock transacional em `benefit_grants` antes de verificar saldo e inserir hold | [MB §10/Gate15][SKILL §4] |
| Cupom | Contagem de resgate é projeção reconstruível por `benefit_event_entries`; sem UPDATE direto de contador por Command | [MB §6/D18][RM §4 #73] |
| Portal | Portal não escreve agenda, checkout, pagamento ou benefício diretamente | [MB §6/D19][MB §7] |
| Página pública | Página pública lê e converte; não processa pagamento e não ignora gates de agenda/checkout | [MB §6/D20][MB §7] |
| Eventos | Todo efeito assíncrono emite `shared.outbox_events.event_type` | Bloco A v2.1 [MB §7] |

---

## 4. Mapa Bloco E — domínios → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 022 | `tenant_core` + `shared` | 18 | Tipos de benefício, programas, origem, grants, consumos, projeções, pacotes, assinaturas de cliente, cashback, cupons, fidelidade | Gate 15 [MB §10/Gate15] |
| 023 | `tenant_core` | 19 | Identidade de portal, booking links, reviews verificadas, referrals, eventos de experiência | Gate 01 / Gate 10 / Gate 15; Gate 03 herdado via D07/D08 sem duplicar engine [MB §10] |
| 024 | `tenant_core` | 20 | Página pública, assets, seções, visibilidade de serviços/equipe/reviews, SEO, publicação | Gate 00 / Gate 03 por conversão segura [MB §10] |

**Ordem obrigatória:** 022 antes de 023 e 024, porque D19 e D20 leem benefícios disponíveis e ofertas públicas sem criar fonte paralela. [MB §6/D18][MB §6/D19][MB §6/D20]

---

# 5. Especificação por domínio

---

## Domínio 18 — Benefits, Packages & Memberships

### 18.1 Responsabilidade

O Domínio 18 é dono de programas de benefício, concessões, origem formal, validade, consumo append-only, projeção de saldo, cashback, cupons, pacotes, assinaturas de cliente, ciclos, dunning de membership, fidelidade e vínculo entre compra/checkout/ledger e benefício. Não é dono de checkout, pagamento, ledger, wallet, CRM, portal ou página pública. [MB §6/D18][RM §4 #71–#83]

### 18.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.benefit_programs` | Catálogo de programas de benefício | PK `id`; FK `tenant_id`; `name`; `benefit_type`; `status benefit_program_status`; `origin_policy benefit_origin_policy`; `rules jsonb`; timestamps; unique `(tenant_id, name)` ativo | Tenant atual; escrita owner/admin via Command |
| `tenant_core.benefit_origin_links` | Origem formal de todo benefício | PK `id`; FK `tenant_id`; `origin_kind benefit_origin_kind`; `origin_table`; `origin_id`; `financial_transaction_id` nullable; `checkout_session_id` nullable; `package_purchase_id` nullable; `subscription_cycle_id` nullable; `manual_reason`; `approved_by_membership_id`; `created_at`; check origem exatamente uma classe válida | Tenant atual; escrita Command; leitura gerencial |
| `tenant_core.benefit_event_entries` | Event log append-only do ciclo de vida de benefício | PK `id`; FK `tenant_id`; FK `benefit_grant_id`; `event_type benefit_event_type`; `amount_delta_cents bigint`; `quantity_delta numeric(12,3)`; `event_at`; `source_command`; `request_id`; `metadata`; check pelo menos um delta ou evento não quantitativo; trigger bloqueia UPDATE/DELETE | Tenant atual; append-only |
| `tenant_core.benefit_grants` | Concessão de benefício ao cliente | PK `id`; FK composta `(tenant_id, client_id)`; FK `program_id`; FK `origin_link_id not null`; `benefit_type`; `status benefit_grant_status`; `original_amount_cents check >=0`; `original_quantity check >=0`; `expires_at`; `granted_at`; `revoked_at`; `metadata`; check origem obrigatória; sem `remaining_*` soberano | Tenant atual; mutação só Command |
| `tenant_core.benefit_consumption_holds` | Reserva temporária de benefício durante checkout | PK `id`; FK `tenant_id`; FK `benefit_grant_id`; FK `checkout_session_id`; `amount_cents check >=0`; `quantity numeric check >=0`; `status benefit_hold_status`; `expires_at`; `created_at`; unique idempotente por checkout/grant; check valor ou quantidade >0; Command obrigatório adquire `SELECT FOR UPDATE` em `benefit_grants(tenant_id,id)` antes de verificar saldo e inserir hold | Tenant atual; Command D12/D18 |
| `tenant_core.benefit_consumptions` | Consumo final append-only | PK `id`; FK `tenant_id`; FK `benefit_grant_id`; FK `benefit_hold_id` nullable; FK `checkout_session_id`; FK `checkout_item_id` nullable; `financial_transaction_id` nullable; `amount_cents check >=0`; `quantity numeric check >=0`; `status benefit_consumption_status`; `consumed_at`; `reversal_of_consumption_id` nullable; check valor ou quantidade >0; trigger bloqueia UPDATE/DELETE | Tenant atual; append-only |
| `tenant_core.benefit_balance_projections` | Projeção reconstruível de saldo de benefício | PK `id`; FK `tenant_id`; FK `benefit_grant_id`; FK `client_id`; `available_amount_cents check >=0`; `available_quantity check >=0`; `expires_at`; `status`; `last_rebuilt_at`; `rebuild_run_id`; unique `(tenant_id, benefit_grant_id)`; nunca fonte de verdade | Tenant atual; worker escreve; leitura D19/D20 via safe RPC |
| `tenant_core.cashback_rules` | Regra de cashback | PK `id`; FK `tenant_id`; `name`; `percent_rate numeric check 0..1`; `fixed_cents check >=0`; `min_purchase_cents check >=0`; `expires_after_days`; `status`; `rules`; unique `(tenant_id, name)` ativo; check percent ou fixed | Owner/admin Command |
| `tenant_core.coupon_codes` | Cupons e cortesias auditáveis | PK `id`; FK `tenant_id`; `code_hash unique`; `display_label`; `discount_kind`; `discount_cents`; `discount_rate numeric`; `max_redemptions`; `redeemed_count_projection bigint check >=0`; `redeemed_count_rebuild_run_id uuid nullable`; `starts_at`; `expires_at`; `status`; check desconto não negativo; `code_hash` obrigatório; contador é projeção reconstruível por `benefit_event_entries(event_type='coupon_redeemed')`; UPDATE direto do contador por Command é proibido | Escrita gerencial; leitura pública só validação segura |
| `tenant_core.package_plans` | Planos de pacote | PK `id`; FK `tenant_id`; `name`; `description`; `price_cents check >=0`; `validity_days`; `status`; `rules`; unique `(tenant_id, name)` ativo | Tenant atual; publicação via D20 visibility |
| `tenant_core.package_plan_services` | Serviços incluídos no pacote | PK `id`; FK `tenant_id`; FK `package_plan_id`; FK `service_id`; `included_quantity numeric check >0`; unique `(tenant_id, package_plan_id, service_id)` | Tenant atual |
| `tenant_core.package_purchases` | Compra de pacote pelo cliente | PK `id`; FK `tenant_id`; FK `package_plan_id`; FK `client_id`; FK `checkout_session_id`; FK `financial_transaction_id`; FK `origin_link_id`; `status package_purchase_status`; `purchased_at`; `expires_at`; check checkout e origem obrigatórios para status `active` | Tenant atual; Command D12/D18 |
| `tenant_core.subscription_plans` | Planos de assinatura do cliente | PK `id`; FK `tenant_id`; `name`; `billing_interval membership_billing_interval`; `price_cents check >=0`; `status`; `rules`; unique `(tenant_id, name)` ativo | Tenant atual |
| `tenant_core.subscription_plan_benefits` | Benefícios previstos por plano | PK `id`; FK `tenant_id`; FK `subscription_plan_id`; `benefit_type`; FK `service_id` nullable; `amount_cents check >=0`; `quantity check >=0`; check valor ou quantidade >0 | Tenant atual |
| `tenant_core.client_subscriptions` | Assinatura de cliente, separada do billing SaaS | PK `id`; FK `tenant_id`; FK `subscription_plan_id`; FK `client_id`; `status client_subscription_status`; `started_at`; `current_period_start`; `current_period_end`; `cancelled_at`; unique assinatura ativa por cliente/plano | Tenant atual; cliente lê própria via D19 |
| `tenant_core.subscription_cycles` | Ciclos de cobrança e benefício da assinatura | PK `id`; FK `tenant_id`; FK `client_subscription_id`; `cycle_start`; `cycle_end`; `status subscription_cycle_status`; FK `checkout_session_id` nullable; FK `payment_id` nullable; `benefits_granted_at`; check `cycle_end > cycle_start`; unique `(tenant_id, client_subscription_id, cycle_start)` | Tenant atual |
| `tenant_core.membership_dunning_events` | Dunning da assinatura de cliente | PK `id`; FK `tenant_id`; FK `client_subscription_id`; FK `subscription_cycle_id`; `step_key`; `status dunning_event_status`; `scheduled_at`; `executed_at`; `result`; append-only | Worker escreve; tenant lê gerencial |
| `tenant_core.loyalty_rules` | Regras de fidelidade que originam benefícios | PK `id`; FK `tenant_id`; `name`; `status`; `rules`; `benefit_program_id`; unique `(tenant_id, name)` ativo | Owner/admin Command; CRM D24 apenas consome depois |
| `tenant_core.benefit_rebuild_runs` | Reconstrução/auditoria de projeções | PK `id`; FK `tenant_id`; `client_id` nullable; `status`; `started_at`; `finished_at`; `drift_count`; `assertions`; append-only | Worker escreve; gerencial lê |

### 18.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `benefit_type` | `cashback_credit`, `package_service_quantity`, `subscription_entitlement`, `coupon_discount`, `loyalty_reward`, `vip_benefit`, `manual_courtesy`, `promotional_credit` |
| `benefit_program_status` | `draft`, `active`, `paused`, `retired` |
| `benefit_origin_policy` | `checkout_paid`, `ledger_posted`, `manual_approval`, `subscription_cycle_paid`, `loyalty_rule`, `campaign_grant` |
| `benefit_origin_kind` | `checkout`, `payment`, `ledger_transaction`, `package_purchase`, `subscription_cycle`, `manual_adjustment`, `loyalty_rule`, `coupon_campaign` |
| `benefit_event_type` | `granted`, `reserved`, `reservation_released`, `consumed`, `reversed`, `expired`, `revoked`, `coupon_redeemed`, `projection_rebuilt` |
| `benefit_grant_status` | `granted`, `available`, `reserved`, `consumed`, `expired`, `revoked`, `reversed` |
| `benefit_hold_status` | `active`, `consumed`, `released`, `expired` |
| `benefit_consumption_status` | `posted`, `reversed` |
| `package_purchase_status` | `pending_payment`, `active`, `expired`, `cancelled`, `refunded` |
| `membership_billing_interval` | `weekly`, `monthly`, `quarterly`, `yearly` |
| `client_subscription_status` | `draft`, `active`, `past_due`, `paused`, `cancelled`, `ended` |
| `subscription_cycle_status` | `open`, `pending_payment`, `paid`, `past_due`, `closed`, `cancelled` |
| `dunning_event_status` | `scheduled`, `sent`, `succeeded`, `failed`, `cancelled` |
| `discount_kind` | `fixed_cents`, `percentage`, `free_service`, `manual_courtesy` |

### 18.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_benefit_program` | `(p_tenant_id uuid, p_name text, p_benefit_type benefit_type, p_origin_policy benefit_origin_policy, p_rules jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Owner/admin |
| `tenant_core.command_issue_benefit_grant` | `(p_client_id uuid, p_program_id uuid, p_origin_kind benefit_origin_kind, p_origin_id uuid, p_amount_cents bigint, p_quantity numeric, p_expires_at timestamptz, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Command autorizado |
| `tenant_core.command_authorize_benefit_application` | `(p_checkout_session_id uuid, p_client_id uuid, p_benefit_grant_id uuid, p_amount_cents bigint, p_quantity numeric, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Checkout D12; executa lock transacional no grant antes do hold |
| `tenant_core.command_consume_benefit_application` | `(p_benefit_hold_id uuid, p_checkout_session_id uuid, p_checkout_item_id uuid, p_financial_transaction_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Checkout D12 após total e ledger |
| `tenant_core.command_release_benefit_hold` | `(p_benefit_hold_id uuid, p_reason text, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor`, `app_worker_executor` | Checkout cancelado/worker TTL |
| `tenant_core.command_purchase_package_from_checkout` | `(p_checkout_session_id uuid, p_package_plan_id uuid, p_client_id uuid, p_financial_transaction_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Checkout D12 |
| `tenant_core.command_activate_client_subscription` | `(p_subscription_plan_id uuid, p_client_id uuid, p_checkout_session_id uuid, p_financial_transaction_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Checkout D12 |
| `tenant_core.command_run_subscription_cycle_renewal` | `(p_client_subscription_id uuid, p_cycle_start timestamptz, p_cycle_end timestamptz, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker |
| `tenant_core.command_record_membership_dunning_event` | `(p_client_subscription_id uuid, p_subscription_cycle_id uuid, p_step_key text, p_status dunning_event_status, p_result jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker |
| `tenant_core.command_issue_cashback_from_checkout` | `(p_checkout_session_id uuid, p_client_id uuid, p_financial_transaction_id uuid, p_rule_id uuid, p_amount_cents bigint, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Checkout/Payment pós-ledger |
| `tenant_core.command_rebuild_benefit_balance_projection` | `(p_tenant_id uuid, p_client_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker |
| `tenant_core.read_client_available_benefits` | `(p_client_id uuid, p_actor_user_id uuid, p_include_expiring boolean) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | D19 portal/API |
| `tenant_core.read_public_offer_benefits` | `(p_business_unit_id uuid, p_context jsonb) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | D20 safe public read |

**Pré-condições obrigatórias de concorrência D18:**

| Command | Pré-condição transacional | Erro estruturado |
|---|---|---|
| `command_authorize_benefit_application` | Em uma única DB transaction: valida tenant/client/checkout; adquire `SELECT FOR UPDATE` no registro `benefit_grants` do `p_benefit_grant_id`; recalcula disponibilidade a partir de eventos/consumos/holds ativos e não apenas da projeção; insere `benefit_consumption_holds`; emite outbox. Sem lock, o Command é inválido. | `BENEFIT_INSUFFICIENT_BALANCE`, `BENEFIT_GRANT_LOCK_TIMEOUT`, `BENEFIT_HOLD_EXPIRED` |
| `command_consume_benefit_application` | Consome somente hold `active` do mesmo tenant/checkout, dentro da transação do checkout/ledger quando houver impacto financeiro; muda hold para `consumed` e cria `benefit_consumptions` append-only. | `BENEFIT_HOLD_NOT_ACTIVE`, `BENEFIT_TENANT_MISMATCH` |
| `command_release_benefit_hold` | Libera hold por cancelamento/TTL sem editar consumo final; cria evento `reservation_released`. | `BENEFIT_HOLD_ALREADY_FINALIZED` |

### 18.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| Todas `tenant_core.benefit_*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; sem acesso direto |
| `benefit_programs`, `cashback_rules`, `coupon_codes`, `package_plans`, `subscription_plans`, `loyalty_rules` | SELECT | membro ativo autorizado | `tenant_id = current_setting('hope.tenant_id', true)::uuid` |
| `benefit_grants`, `benefit_consumptions`, `benefit_balance_projections` | SELECT | equipe autorizada | Tenant atual + permissão `benefit.read`; cliente lê via RPC D19, não tabela bruta |
| `benefit_event_entries`, `membership_dunning_events`, `benefit_rebuild_runs` | UPDATE/DELETE | Todos | Bloqueado; append-only |
| Tabelas de plano/visibilidade | SELECT público | anon | Sem SELECT direto; somente RPC segura do backend read executor |
| Todas D18 | INSERT/UPDATE | Command trusted | Sem escrita direta por frontend; Command valida origem, validade, saldo reconstruído, lock concorrente e idempotência |

### 18.6 Invariantes

1. Nenhum benefício existe sem origem formal em `benefit_origin_links`. [MB §6/D18]
2. `benefit_balances` legado vira `benefit_balance_projections`; não é fonte de verdade. [RM §4 #73]
3. Autorização de consumo de benefício exige lock transacional em `benefit_grants`; projeção lida sem lock não autoriza hold. [MB §10/Gate15][SKILL §4]
4. Consumo de benefício é append-only; reversão cria novo evento/consumo reverso, nunca edita consumo lançado. [MB §10/Gate15]
5. Benefício monetário só é concedido ou consumido com referência a checkout/payment/ledger quando houver impacto financeiro. [MB §7][MB §10/Gate11]
6. Pacote comprado só vira benefício ativo após checkout/ledger aprovados. [RM §4 #78]
7. Assinatura de cliente não se mistura com `platform.tenant_subscriptions` de Billing SaaS. [MB §6/D04][RM §4 #81]
8. Cashback não recria wallet paralela; saldo disponível vem da projeção reconstruível e do ledger quando aplicável. [RM §4 #64][RM §4 #75]
9. Cupom não mascara desconto excessivo; D12 recalcula e retorna erro estruturado quando desconto inválido. [MB §10/Gate10]
10. `coupon_codes.redeemed_count_projection` é projeção reconstruível por evento `coupon_redeemed`; Command não incrementa contador por UPDATE direto. [MB §6/D18][RM §4 #73]
11. Leitura de benefício no portal passa por RPC segura e escopo do cliente. [MB §6/D19]
12. Gate 15 só passa se origem, validade, saldo reconstruído, lock de consumo e consumo append-only forem auditáveis. [MB §10/Gate15]

### 18.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `benefit.program_created` | `tenant_id`, `program_id`, `benefit_type` |
| `benefit.grant_issued` | `tenant_id`, `client_id`, `benefit_grant_id`, `origin_link_id` |
| `benefit.application_authorized` | `tenant_id`, `checkout_session_id`, `benefit_hold_id`, `expires_at` |
| `benefit.application_consumed` | `tenant_id`, `checkout_session_id`, `benefit_consumption_id` |
| `benefit.hold_released` | `tenant_id`, `benefit_hold_id`, `reason` |
| `benefit.package_purchased` | `tenant_id`, `client_id`, `package_purchase_id` |
| `benefit.client_subscription_activated` | `tenant_id`, `client_id`, `client_subscription_id` |
| `benefit.subscription_cycle_due` | `tenant_id`, `client_subscription_id`, `subscription_cycle_id` |
| `benefit.membership_dunning_recorded` | `tenant_id`, `client_subscription_id`, `step_key`, `status` |
| `benefit.coupon_redeemed` | `tenant_id`, `coupon_code_id`, `checkout_session_id`, `benefit_event_entry_id` |
| `benefit.balance_projection_rebuilt` | `tenant_id`, `client_id`, `run_id`, `drift_count` |

### 18.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | D01 Identity, D05 People/Clients, D06 Catalog, D12 Checkout, D13 Payment, D15 Ledger, D16 Wallet quando monetário, D17 quando benefício impacta comissão |
| É dependência de | D19 Client Experience, D20 Página Web, D24 Retention & CRM, D25 Analytics, D31 Governance |

### 18.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 15 — Benefit Origin & Consumption | Todo benefício tem origem, validade, saldo reconstruível, consumo append-only e reversão auditável [MB §10/Gate15] |
| Gate 10 — Checkout Integrity | Benefício aplicado no checkout é calculado no backend e não mascara total inválido [MB §10/Gate10] |
| Gate 11 — Ledger Balance | Benefício monetário referencia ledger/financial transaction quando cria ou consome valor financeiro [MB §10/Gate11] |
| Gate 13 — Wallet Drift | Cashback/crédito monetário não cria saldo paralelo e deve ser reconstruível [MB §10/Gate13] |

### 18.10 RAGOV do domínio

**REAL / MVP obrigatório.** [MB §6/D18]

---

## Domínio 19 — Client Experience Hub

### 19.1 Responsabilidade

O Domínio 19 é dono do portal do cliente, identidade de acesso do cliente, Booking Intent no PWA, booking links personalizados, histórico seguro de atendimentos, preferências expostas ao cliente, benefícios disponíveis, remarcação via Commands existentes, reviews verificados e programa de indicação. Não é dono de agenda, checkout, pagamento, benefício, messaging, CRM ou página pública; solicita candidatos e Commands dos domínios donos. [MB4.0 §6.0][MB4.0 §5.1][BP3.0 §E]

### 19.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.client_portal_identities` | Identidade de portal vinculada ao cliente | PK `id`; FK `tenant_id`; FK `client_id`; `auth_user_id uuid`; `status client_portal_status`; `verified_at`; `last_seen_at`; unique `(tenant_id, client_id)`; unique ativo `(tenant_id, auth_user_id)` | Cliente lê próprio via RPC; staff gerencial não lê segredos |
| `tenant_core.client_portal_access_events` | Auditoria de acesso ao portal | PK `id`; FK `tenant_id`; FK `portal_identity_id`; `event_type portal_access_event_type`; `occurred_at`; `ip_hash`; `user_agent_hash`; append-only | Cliente lê resumo próprio; gerencial lê auditoria limitada |
| `tenant_core.client_booking_request_sessions` | Sessão PWA que agrupa Booking Intent, candidatos e resposta do cliente | PK `id`; FK `tenant_id`; FK `client_id` nullable; FK `business_unit_id`; FK opcional `booking_intent_id`; `request_session_id uuid`; `status client_booking_request_status`; `started_at`; `expires_at`; `metadata jsonb`; unique `(tenant_id, request_session_id)` | RLS_ENABLED = SIM; cliente próprio via portal; não cria appointment [MB4.0 §6.0][MB4.0 §5.1] |

| `tenant_core.booking_links` | Links de agendamento por cliente/campanha/canal | PK `id`; FK `tenant_id`; FK `client_id` nullable; FK `business_unit_id`; `slug_hash unique`; `status booking_link_status`; `source_kind booking_link_source_kind`; `expires_at`; `rules`; `created_at`; unique slug ativo | Public read via RPC; raw bloqueado |
| `tenant_core.booking_link_events` | Eventos de clique/conversão | PK `id`; FK `tenant_id`; FK `booking_link_id`; `event_type booking_link_event_type`; `appointment_id` nullable; `checkout_session_id` nullable; `occurred_at`; append-only | Worker/Command escreve; analytics depois consome |
| `tenant_core.client_portal_preferences` | Preferências controladas pelo cliente no portal | PK `id`; FK `tenant_id`; FK `client_id`; `preferred_staff_id`; `preferred_service_ids`; `communication_preferences jsonb`; `visibility_settings`; timestamps; unique `(tenant_id, client_id)` | Cliente atual via RPC; staff lê preferências operacionais permitidas |
| `tenant_core.verified_reviews` | Avaliações verificadas vinculadas a checkout fechado | PK `id`; FK `tenant_id`; FK `client_id`; FK `appointment_id`; FK `checkout_session_id`; `rating int CHECK (rating BETWEEN 1 AND 5)`; `comment`; `status review_status`; `published_at`; `moderation_reason`; unique `(tenant_id, checkout_session_id)` | Cliente escreve própria via Command; publicação D20 lê safe view |
| `tenant_core.referrals` | Indicação de cliente | PK `id`; FK `tenant_id`; FK `referrer_client_id`; FK `referred_client_id` nullable; `status referral_status`; `referral_code_hash`; `qualified_checkout_session_id`; `benefit_grant_id` nullable; timestamps; unique código ativo | Cliente lê próprias; benefício só via D18 Command |
| `tenant_core.client_experience_events` | Timeline de experiência sem substituir domínios donos | PK `id`; FK `tenant_id`; FK `client_id`; `event_type client_experience_event_type`; `source_domain`; `source_id`; `occurred_at`; `metadata`; append-only | Cliente lê via portal; staff autorizado lê histórico permitido |

### 19.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `client_booking_request_status` | `draft`, `submitted`, `candidates_generated`, `manual_pending_validation`, `confirmed`, `expired`, `cancelled` |

| `client_portal_status` | `invited`, `active`, `suspended`, `revoked` |
| `portal_access_event_type` | `invited`, `verified`, `login`, `logout`, `profile_viewed`, `benefits_viewed`, `booking_started`, `booking_completed` |
| `booking_link_status` | `active`, `paused`, `expired`, `revoked` |
| `booking_link_source_kind` | `client_portal`, `public_page`, `campaign`, `staff_share`, `referral`, `manual` |
| `booking_link_event_type` | `viewed`, `slot_searched`, `appointment_created`, `checkout_opened`, `converted`, `expired` |
| `review_status` | `draft`, `submitted`, `approved`, `rejected`, `published`, `hidden` |
| `referral_status` | `created`, `invited`, `qualified`, `rewarded`, `cancelled`, `expired` |
| `client_experience_event_type` | `appointment_booked`, `appointment_completed`, `checkout_paid`, `benefit_granted`, `benefit_consumed`, `review_submitted`, `referral_created`, `portal_profile_updated` |

### 19.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_submit_booking_intent` | `(p_actor_user_id uuid, p_business_unit_id uuid, p_client_id uuid, p_mode booking_intent_mode, p_items jsonb, p_requested_date date, p_metadata jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | PWA cliente; chama D08 `command_create_booking_intent` [MB4.0 §6.0][DEC-CB-13] |
| `tenant_core.command_accept_booking_candidate` | `(p_actor_user_id uuid, p_candidate_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | PWA cliente; encaminha para D08 `command_confirm_booking_candidate` [MB4.0 §6.0][DEC-CB-13] |

| `tenant_core.command_link_client_portal_identity` | `(p_client_id uuid, p_actor_auth_user_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend trusted |
| `tenant_core.command_suspend_client_portal_identity` | `(p_portal_identity_id uuid, p_reason text, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin |
| `tenant_core.command_create_booking_link` | `(p_client_id uuid, p_business_unit_id uuid, p_source_kind booking_link_source_kind, p_rules jsonb, p_expires_at timestamptz, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Portal/staff/public page backend |
| `tenant_core.command_rotate_booking_link` | `(p_booking_link_id uuid, p_reason text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Backend trusted |
| `tenant_core.command_record_booking_link_event` | `(p_booking_link_id uuid, p_event_type booking_link_event_type, p_source_id uuid, p_metadata jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor`, `app_worker_executor` | Public/API backend |
| `tenant_core.command_update_client_portal_preferences` | `(p_client_id uuid, p_actor_user_id uuid, p_patch jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Cliente via portal |
| `tenant_core.command_submit_verified_review` | `(p_checkout_session_id uuid, p_actor_user_id uuid, p_rating int, p_comment text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Cliente via portal |
| `tenant_core.command_moderate_verified_review` | `(p_review_id uuid, p_status review_status, p_reason text, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin |
| `tenant_core.command_create_referral` | `(p_referrer_client_id uuid, p_referred_contact_hash text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Cliente via portal |
| `tenant_core.command_qualify_referral` | `(p_referral_id uuid, p_qualified_checkout_session_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor`, `app_worker_executor` | Checkout D12 / D18 |
| `tenant_core.read_client_portal_home` | `(p_client_id uuid, p_actor_user_id uuid) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Cliente via portal |
| `tenant_core.read_booking_link_public_context` | `(p_slug text, p_request_context jsonb) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Public API backend; retorna contexto seguro e ponte para D07/D08, sem calcular slots |
| `tenant_core.read_client_service_history` | `(p_client_id uuid, p_actor_user_id uuid, p_limit int, p_cursor text) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Cliente via portal |

### 19.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| Todas D19 | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; sem raw table access |
| `client_portal_identities` | SELECT | cliente próprio via RPC | `auth_user_id` validado na função; tabela bruta não exposta |
| `booking_links` | SELECT público | anon | Sem SELECT direto; somente `read_booking_link_public_context` com slug seguro |
| `verified_reviews` | SELECT público | D20 safe view | Apenas `status='published'` por RPC/view pública segura |
| `referrals` | SELECT | cliente próprio | `referrer_client_id` ou `referred_client_id` validado por portal identity |
| `client_experience_events` | INSERT | Command trusted | Append-only; fonte real permanece domínio de origem |
| Todas D19 | UPDATE/DELETE | Frontend/cliente | Bloqueado; mutação somente Commands específicos |

### 19.6 Invariantes

1. Portal não cria appointment, checkout, pagamento ou benefício diretamente; chama Commands dos domínios donos. [MB §6/D19][MB §7]
2. Booking link não bypassa D07/D08; `read_booking_link_public_context` só entrega contexto seguro e o fluxo verificável segue para D07 slot/hold e D08 appointment, sem cálculo próprio. [MB §10/Gate03]
3. Review verificado exige checkout fechado e vínculo com cliente. [MB §6/D19]
4. Referral não concede benefício por si só; recompensa é `benefit_grant` emitido por D18. [MB §6/D18][MB §6/D19]
5. Cliente só lê o próprio histórico/benefícios por RPC com ator validado. [MB §7]
6. Preferências do portal não substituem `client_preferences` operacional do D05; sincronização é via Command. [RM §4 #100]
7. PWA/portal não armazena saldo soberano; saldos vêm de D18 projection. [MB §6/D18][RM §4 #73]
8. Eventos de experiência são timeline, não fonte de verdade dos domínios de origem. [MB §7]
9. Página pública D20 pode consumir booking link, mas não herda permissão de portal. [MB §6/D20]
10. Dados sensíveis de cliente permanecem sob RLS e RPCs seguras. [MB §7]


11. PWA cliente solicita Booking Request/Intent; não recebe `status='confirmed'` direto. [MB4.0 §5.1][MB4.0 §6.0]
12. Todo booking do cliente que não vem de `command_confirm_booking_candidate` vai para `manual_pending_validation`. [MB4.0 §6/D08][MB4.0 §6.0]
13. D19 exibe ao cliente: `Solicitação enviada — aguardando confirmação da equipe.` para fluxo manual ou sem slot_token validado por D07. [MB4.0 §6.0]
14. Portal/cliente não calcula disponibilidade, preço final, comissão, taxa, depósito ou checkout total; apenas exibe retornos backend e dispara Commands. [MB4.0 §5.1]

### 19.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `client_experience.portal_identity_linked` | `tenant_id`, `client_id`, `portal_identity_id` |
| `client_experience.booking_link_created` | `tenant_id`, `booking_link_id`, `source_kind` |
| `client_experience.booking_link_converted` | `tenant_id`, `booking_link_id`, `appointment_id`, `checkout_session_id` |
| `client_experience.review_submitted` | `tenant_id`, `review_id`, `checkout_session_id` |
| `client_experience.review_published` | `tenant_id`, `review_id` |
| `client_experience.referral_created` | `tenant_id`, `referral_id`, `referrer_client_id` |
| `client_experience.referral_qualified` | `tenant_id`, `referral_id`, `checkout_session_id` |

| `client_experience.booking_intent_submitted` | `tenant_id`, `client_id`, `booking_intent_id`, `request_session_id` |
| `client_experience.booking_candidate_accepted` | `tenant_id`, `client_id`, `candidate_id`, `request_session_id` |
| `client_experience.manual_booking_request_submitted` | `tenant_id`, `client_id`, `business_unit_id`, `request_session_id` |

### 19.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | D01 Identity, D05 Clients, D07 Scheduling, D08 Agenda, D12 Checkout, D18 Benefits |
| É dependência de | D20 Página Web, D21 Messaging, D22 AI Receptionist, D24 CRM, D25 Analytics |

### 19.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 03 — Smart Availability | PROVADO em D07/D08 no Bloco C; D19 prova que booking link/PWA não bypassa D07/D08 e que o caminho verificável é `command_submit_booking_intent` → `command_generate_booking_candidates` → `command_confirm_booking_candidate`; fluxo manual fica `manual_pending_validation` [MB4.0 §10/Gate03][DEC-CB-13] |
| Gate 10 — Checkout Integrity | Portal não calcula total; checkout permanece D12 [MB §10/Gate10] |
| Gate 15 — Benefit Origin & Consumption | Portal só exibe benefício reconstruído e auditável do D18 [MB §10/Gate15] |
| Gate 01 — Tenant Isolation | Cliente não acessa outro tenant/client por portal identity [MB §10/Gate01] |

### 19.10 RAGOV do domínio

**REAL / MVP para booking e histórico. PARCIAL para indicação e reviews avançados.** [MB §6/D19]

---

## Domínio 20 — Página Web do Salão

### 20.1 Responsabilidade

O Domínio 20 é dono da página pública por tenant, identidade visual, fotos, endereço, horários, serviços e preços publicados, equipe visível, avaliações públicas verificadas, botão de agendamento, pacotes/planos públicos, WhatsApp direto como link, SEO e publicação. Não é dono de pagamento, checkout, agenda, messaging runtime, marketplace externo ou white-label completo. [MB §6/D20][RM §5/D20]

### 20.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.salon_public_pages` | Página pública canônica do tenant/unidade | PK `id`; FK `tenant_id`; FK `business_unit_id`; `slug_hash unique`; `status public_page_status`; `market_name`; `headline`; `description`; `published_at`; `unpublished_at`; unique página ativa por unidade | Tenant gerencial; leitura pública por safe RPC |
| `tenant_core.public_page_theme_settings` | Identidade visual da página | PK `id`; FK `tenant_id`; FK `public_page_id`; `logo_asset_id`; `cover_asset_id`; `primary_color`; `font_key`; `layout_key`; timestamps; unique `(tenant_id, public_page_id)` | Owner/admin Command |
| `tenant_core.public_page_assets` | Fotos, logo e imagens públicas | PK `id`; FK `tenant_id`; FK `public_page_id`; `asset_kind`; `storage_key`; `alt_text`; `sort_order`; `status asset_status`; `metadata`; no raw public storage path sem safe URL | Owner/admin Command; public read via signed/safe URL |
| `tenant_core.public_page_sections` | Seções configuráveis da página | PK `id`; FK `tenant_id`; FK `public_page_id`; `section_kind`; `title`; `content jsonb`; `sort_order`; `is_visible`; unique `(tenant_id, public_page_id, section_kind, sort_order)` | Owner/admin Command |
| `tenant_core.public_page_service_visibility` | Serviços/preços publicados | PK `id`; FK `tenant_id`; FK `public_page_id`; FK `service_id`; `is_visible`; `display_price_cents`; `price_label`; `sort_order`; check preço >=0; unique `(tenant_id, public_page_id, service_id)` | Owner/admin; public read safe RPC |
| `tenant_core.public_page_staff_visibility` | Equipe publicada | PK `id`; FK `tenant_id`; FK `public_page_id`; FK `staff_id`; `is_visible`; `display_name`; `bio`; `sort_order`; unique `(tenant_id, public_page_id, staff_id)` | Owner/admin; public read safe RPC |
| `tenant_core.public_page_review_visibility` | Reviews publicados na página | PK `id`; FK `tenant_id`; FK `public_page_id`; FK `review_id`; `is_visible`; `sort_order`; unique `(tenant_id, public_page_id, review_id)` | Owner/admin; somente reviews publicados D19 |
| `tenant_core.public_page_offer_visibility` | Pacotes/assinaturas/cupons públicos | PK `id`; FK `tenant_id`; FK `public_page_id`; `offer_kind public_offer_kind`; `offer_id uuid`; `benefit_program_id uuid nullable`; `package_plan_id uuid nullable`; `subscription_plan_id uuid nullable`; `coupon_code_id uuid nullable`; `is_visible`; `sort_order`; check exatamente uma FK específica conforme `offer_kind`; FKs compostas `(tenant_id, benefit_program_id)` → `benefit_programs`, `(tenant_id, package_plan_id)` → `package_plans`, `(tenant_id, subscription_plan_id)` → `subscription_plans`, `(tenant_id, coupon_code_id)` → `coupon_codes`; `offer_id` é espelho de leitura, não FK polimórfica soberana | Owner/admin; public read safe RPC |
| `tenant_core.public_page_seo_settings` | SEO indexável por página | PK `id`; FK `tenant_id`; FK `public_page_id`; `seo_title`; `seo_description`; `canonical_slug`; `robots_policy`; `structured_data jsonb`; unique `(tenant_id, public_page_id)` | Owner/admin Command; public safe read |
| `tenant_core.public_page_publish_revisions` | Histórico de publicação append-only | PK `id`; FK `tenant_id`; FK `public_page_id`; `revision_number`; `published_snapshot jsonb`; `published_by_membership_id`; `published_at`; unique `(tenant_id, public_page_id, revision_number)`; append-only | Gerencial lê; trigger bloqueia UPDATE/DELETE |
| `tenant_core.public_page_cache_snapshots` | Snapshot reconstruível para leitura pública | PK `id`; FK `tenant_id`; FK `public_page_id`; `snapshot_hash`; `payload jsonb`; `generated_at`; `expires_at`; `status`; unique ativo por página/hash; reconstruível | Worker escreve; public API lê via RPC |

### 20.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `public_page_status` | `draft`, `published`, `unpublished`, `suspended` |
| `asset_status` | `draft`, `active`, `hidden`, `removed` |
| `public_page_section_kind` | `hero`, `about`, `services`, `team`, `reviews`, `packages`, `location`, `faq`, `cta` |
| `public_offer_kind` | `package_plan`, `subscription_plan`, `coupon_code`, `benefit_program` |
| `robots_policy` | `index_follow`, `noindex_follow`, `noindex_nofollow` |
| `public_page_cache_status` | `fresh`, `stale`, `rebuilding`, `invalidated` |

### 20.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_public_page` | `(p_business_unit_id uuid, p_slug text, p_market_name text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin |
| `tenant_core.command_update_public_page_content` | `(p_public_page_id uuid, p_patch jsonb, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin/manager |
| `tenant_core.command_update_public_page_asset` | `(p_public_page_id uuid, p_asset_kind text, p_storage_key text, p_alt_text text, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin/manager |
| `tenant_core.command_set_public_service_visibility` | `(p_public_page_id uuid, p_service_id uuid, p_is_visible boolean, p_display_price_cents bigint, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin/manager |
| `tenant_core.command_set_public_offer_visibility` | `(p_public_page_id uuid, p_offer_kind public_offer_kind, p_offer_id uuid, p_is_visible boolean, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin/manager; resolve `p_offer_id` para FK composta do tenant antes de gravar |
| `tenant_core.command_publish_public_page` | `(p_public_page_id uuid, p_actor_membership_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin |
| `tenant_core.command_unpublish_public_page` | `(p_public_page_id uuid, p_reason text, p_idempotency_key text) returns void` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin |
| `tenant_core.command_rebuild_public_page_cache` | `(p_public_page_id uuid, p_idempotency_key text) returns uuid` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker |
| `tenant_core.read_public_page_by_slug` | `(p_slug text, p_request_context jsonb) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Public API backend |
| `tenant_core.read_public_page_booking_context` | `(p_slug text, p_service_id uuid, p_request_context jsonb) returns jsonb` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Public API backend |

### 20.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| Todas D20 | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; sem raw table access |
| `salon_public_pages`, `public_page_*` | SELECT | membro ativo autorizado | Tenant atual + permissão `public_page.read` |
| `public_page_publish_revisions` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `public_page_cache_snapshots` | SELECT público | anon | Sem SELECT direto; apenas `read_public_page_by_slug` retorna payload publicado e saneado |
| `public_page_service_visibility` | INSERT/UPDATE | Command trusted | Valida serviço ativo D06 e preço não negativo; não calcula checkout |
| `public_page_offer_visibility` | INSERT/UPDATE | Command trusted | Valida oferta D18 ativa por FK composta do mesmo tenant; não concede benefício |

### 20.6 Invariantes

1. Página pública não processa pagamento diretamente. [MB §6/D20]
2. Botão de agendamento passa por D19 booking link e D07/D08; não cria appointment direto. [MB §6/D20][MB §10/Gate03]
3. Serviço/preço público é vitrine; checkout D12 recalcula total. [MB §10/Gate10]
4. Pacotes, assinaturas, cupons e programas exibidos vêm de D18 por FK composta com `tenant_id`; oferta cross-tenant é impossível no banco. [MB §6/D18][MB §6/D20][MB §10/Gate01]
5. Reviews públicos exigem review verificado D19. [MB §6/D19][MB §6/D20]
6. Snapshot/cache público é reconstruível e não substitui tabelas canônicas. [MB §7]
7. Asset público usa URL saneada; raw storage key não é vazado diretamente. [MB §7]
8. SEO não cria marketplace externo nem white-label completo neste bloco. [MB §6/D20][MB §11]
9. Página suspensa/unpublished não retorna conteúdo público. [MB §6/D20]
10. Publicação gera revisão append-only. [MB §7]

### 20.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `public_page.created` | `tenant_id`, `business_unit_id`, `public_page_id` |
| `public_page.content_updated` | `tenant_id`, `public_page_id`, `section_keys` |
| `public_page.asset_updated` | `tenant_id`, `public_page_id`, `asset_id` |
| `public_page.service_visibility_changed` | `tenant_id`, `public_page_id`, `service_id`, `is_visible` |
| `public_page.offer_visibility_changed` | `tenant_id`, `public_page_id`, `offer_kind`, `offer_id`, `is_visible` |
| `public_page.published` | `tenant_id`, `public_page_id`, `revision_number` |
| `public_page.unpublished` | `tenant_id`, `public_page_id`, `reason` |
| `public_page.cache_rebuilt` | `tenant_id`, `public_page_id`, `snapshot_hash` |

### 20.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | D02 Business Setup, D05 People, D06 Catalog, D18 Benefits, D19 Client Experience |
| É dependência de | D21 Messaging, D23 Marketplace safety, D25 Analytics, D27 Marketplace Fase 1 |

### 20.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 00 — Foundation | Página usa RLS, Commands, publicação e cache reconstruível [MB §10/Gate00] |
| Gate 03 — Smart Availability | CTA de agendamento usa slots válidos do D07/D19 [MB §10/Gate03] |
| Gate 10 — Checkout Integrity | Página não calcula total nem processa pagamento [MB §10/Gate10] |
| Gate 15 — Benefit Origin & Consumption | Ofertas de benefício públicas vêm do D18 e preservam origem/validade [MB §10/Gate15] |

### 20.10 RAGOV do domínio

**REAL / MVP.** [MB §6/D20]

---

## 6. Mapa de relações inter-domínios do Bloco E

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| D18 | D12 | Checkout autoriza e consome benefício via hold/consume | D12 calcula total; D18 prova origem e saldo [MB §10/Gate10][MB §10/Gate15] |
| D12/D13/D15 | D18 | Compra/pagamento/ledger originam pacote, cashback e assinatura | Benefício monetário exige origem financeira [MB §6/D18] |
| D18 | D19 | Portal exibe benefícios disponíveis | Projeção reconstruível, não saldo soberano [RM §4 #73] |
| D18 | D20 | Página exibe ofertas públicas por FKs compostas do mesmo tenant | Vitrine não concede benefício e não permite oferta cross-tenant [MB §6/D20][MB §10/Gate01] |
| D19 | D08 | Portal inicia/remarca agendamento por Command do domínio dono | Sem engine paralela [MB §7] |
| D19 | D20 | Booking link conecta página pública à experiência do cliente | Página não escreve agenda diretamente [MB §6/D19][MB §6/D20] |
| D20 | D06 | Serviços públicos leem catálogo | Preço público não substitui checkout [MB §10/Gate10] |

---

## 7. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gates secundários | Critério bloqueante |
|---:|---:|---|---|---|
| 18 | 022 | Gate 15 | Gate 10, 11, 13 | Benefício sem origem, validade, saldo reconstruível ou consumo append-only bloqueia aprovação |
| 19 | 023 | Gate 03 | Gate 01, 10, 15 | Portal não pode bypassar agenda, checkout ou benefício |
| 20 | 024 | Gate 00 | Gate 03, 10, 15 | Página pública não pode expor raw tables, processar pagamento ou criar booking direto |

---

## 8. Ordem única de execução de migrations do Bloco E

1. `022_benefits_packages_memberships.sql` — D18 completo: tipos, programas, origem, event log, grants, holds, consumos, projeções, cashback, cupons, pacotes, assinaturas, ciclos, dunning e rebuilds. [MB §6/D18][RM §4 #71–#83]
2. `023_client_experience_hub.sql` — D19: portal identity, booking links, reviews, referrals e timeline de experiência. [MB §6/D19][RM §5/D19]
3. `024_salon_public_page.sql` — D20: página, assets, seções, visibilidades, SEO, publicação e cache reconstruível. [MB §6/D20][RM §5/D20]

**Motivo da ordem:** D19 e D20 leem D18; D20 consome D19 booking links; nenhuma migration cria dependência circular. [MB §11]

---

## 9. Estratégia de rollback do Bloco E

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 022 | Desativar programa, cupom, pacote, assinatura ou regra por status; rebuild de projeção; reversão por evento novo | Apagar `benefit_event_entries`, `benefit_consumptions`, origem ou histórico de ciclo |
| 023 | Suspender portal identity, revogar booking link, ocultar review, cancelar referral | Apagar eventos de portal, review verificada ou timeline append-only |
| 024 | Unpublish da página, invalidar cache, publicar nova revisão | Apagar revisão publicada, reescrever snapshot histórico ou expor raw storage key |

---

## 10. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| Bloco E ampliado para D18–D20 | DIVERGÊNCIA FORMAL RESOLVIDA | Platform Owner autorizou agrupar Benefits + Experience + Página Web nesta rodada, preservando limites de D21+ | [MB §11][RM §5/D18][RM §5/D19][RM §5/D20] |
| `benefit_event_entries` como trilha append-only | REAL | Permite reconstruir saldo e provar Gate 15 sem `benefit_balances` soberano | [MB §10/Gate15][RM §4 #73] |
| `benefit_balance_projections` substitui `benefit_balances` | REAL | Projeção reconstruível, nunca fonte de verdade | [RM §4 #73] |
| `benefit_consumption_holds` | REAL | Evita consumo concorrente com lock transacional em `benefit_grants` antes de inserir hold | [MB §10/Gate10][MB §10/Gate15] |
| `client_subscriptions` separado de `platform.tenant_subscriptions` | REAL | Assinatura de cliente não se confunde com billing SaaS | [MB §6/D04][MB §6/D18][RM §4 #81] |
| Portal D19 via Commands | REAL | Cliente não escreve verdade direta | [MB §6/D19][MB §7] |
| `coupon_codes.redeemed_count_projection` reconstruível | REAL | Contador de cupom deriva de `benefit_event_entries`, não de UPDATE direto | [MB §6/D18][RM §4 #73] |
| Página D20 por safe RPC/cache reconstruível | REAL | Superfície pública sem raw table exposure e sem pagamento direto | [MB §6/D20][MB §7] |
| Reviews públicas vinculadas a checkout fechado | REAL | Review não verificado não vira prova social pública | [MB §6/D19][MB §6/D20] |

---

## 11. Reflexion contra Definition of Done do Bloco E

| Item verificado | Resultado | Correção aplicada |
|---|---|---|
| Domínios D18–D20 têm 10 blocos obrigatórios | SIM | Sem correção |
| D18 fecha origem, validade, consumo e saldo reconstruível | SIM | `benefit_origin_links`, event log, holds com lock, consumptions e projections |
| Nenhum benefício cria saldo soberano paralelo | SIM | `benefit_balance_projections` é read model reconstruível |
| `benefit_balances` legado não permanece como fonte da verdade | SIM | Convertido em projeção reconstruível |
| Cashback não recria `wallet_entries` | SIM | Vínculo com D15/D16 quando monetário |
| Portal não escreve agenda/checkout/benefício diretamente | SIM | D19 dispara Commands dos domínios donos |
| Página pública não processa pagamento diretamente | SIM | D20 apenas leitura/conversão |
| RLS e REVOKE especificados para todas as tabelas | SIM | Raw tables bloqueadas para anon/authenticated |
| Outbox definido para efeitos assíncronos | SIM | Eventos D18–D20 listados |
| Gate 15 coberto explicitamente | SIM | D18.9 e matriz de gates |
| D21+ não foi antecipado | SIM | Messaging, AI, CRM, Analytics, Fiscal e Marketplace fora do escopo |

**Falhas encontradas antes da declaração:** divergência de recorte registrada como E-00; sem falha bloqueante interna no escopo autorizado.  
**Limite explícito:** este arquivo não declara o Blueprint 31/31 pronto; declara o Bloco E pronto para auditoria, respeitando a criação sequencial aprovada para esta rodada. [SKILL §6]

Pronto para auditoria Red Team.


## 12. Correções absorvidas no Bloco E v1.1

| Falha Red Team | Correção aplicada |
|---|---|
| E-01 | Lock transacional em `benefit_grants` antes do hold. |
| E-02 | FKs compostas em `public_page_offer_visibility`. |
| E-03 | `CHECK (rating BETWEEN 1 AND 5)`. |
| E-04 | Gate 03 tratado como dependência D07/D08, sem gate decorativo. |
| E-05 | Cupom como projeção reconstruível por eventos append-only. |

Pronto para auditoria Red Team.

---

## ANEXO F — SMART_FLOW_3_0_BLUEPRINT_BLOCO_F_v1_1.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco F v1.1

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco F — Mensageria e AI Receptionist  
**Domínios:** 21, 22  
**Status:** ENTREGUE PARA AUDITORIA RED TEAM DO BLOCO F v1.1  
**Data:** 2026-06-11  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0][MB §6/D21][MB §6/D22][MB §10/Gate16][MB §10/Gate17][MB §11]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §4 #84–#89][RM §4 #93–#95][RM §5/D21][RM §5/D22]

---

## 0. Regra de autoridade e fundação aprovada

| Item | Regra | Fonte |
|---|---|---|
| Autoridade | Master Brief decide escopo, domínios, invariantes e gates | [MB §0] |
| Reuse Map | SQL legado é insumo de reaproveitamento; classificação KEEP/MERGE/REMOVE é vinculante | [RM §1][RM §4 #84–#89] |
| Blueprint | Este arquivo especifica arquitetura; não contém SQL executável | [SKILL §8] |
| Fundação herdada | Blocos A v2.1, B v2.1, C v1.2, D v1.2 e E v1.1 estão aprovados como fundação | [SKILL §6] |
| Schemas | `tenant_core` para dados tenant-scoped; `shared` para tipos/catálogos sem linha de negócio; `platform` isolado | [Bloco A v2.1][MB §6/D01] |
| Escrita crítica | UI/Agent → API → Command → DB Transaction → Ledger/History/Outbox → Projection → UI | [MB §7] |
| IA | AI Receptionist gera Action Request; nunca agenda, cancela ou cobra diretamente | [MB §6/D22][MB §10/Gate17] |
| Mensagem | Mensagem não altera verdade diretamente; gera intent ou Action Request | [MB §6/D21] |

---

## 1. Escopo do Bloco F

| Domínio | Nome | Status nesta entrega | Fonte |
|---:|---|---|---|
| 21 | Messaging & Conversations | Especificado | [MB §6/D21][RM §4 #84–#89][RM §5/D21] |
| 22 | AI Receptionist Engine | Especificado | [MB §6/D22][RM §4 #86][RM §4 #88][RM §4 #93–#95][RM §5/D22] |

### 1.1 Fora do escopo do Bloco F

| Item | Motivo | Domínio dono |
|---|---|---:|
| CRM e campanhas econômicas | Mensageria transporta; CRM decide segmentação/campanha | 24 |
| CoPilot Revenue Engine | Oportunidade econômica não pertence ao AI Receptionist | 23 |
| Analytics rebuild completo | Métricas são consumidas depois como read models reconstruíveis | 25 |
| LGPD completa, DSR, retenção legal | Consentimento operacional de mensagem existe aqui; governança LGPD completa vem depois | 26 |
| API/webhooks externos | Outbox é herdada; plataforma de integração vem depois | 30 |
| Gate registry completo | Action Request foundation é antecipada; governança completa vem depois | 31 |

---

## 2. Divergência formal e dependência transversal

### DIVERGÊNCIA FORMAL F-00 — rótulo do bloco

| Item | Declaração |
|---|---|
| Divergência | `SKILL_BLUEPRINT_CREATOR.md` chama o agrupamento D21–D22 de Bloco G; o fluxo aprovado do projeto chama D21–D22 de Bloco F porque D18–D20 foram agrupados no Bloco E por autorização do Platform Owner. [SKILL §6][MB §11] |
| Impacto | Divergência apenas nominal. Não altera domínios, ordem lógica, gates, tabelas nem migrações. |
| Decisão | Manter o rótulo operacional **Bloco F** nesta rodada, com domínios D21–D22. |
| Escalada | DIVERGÊNCIA FORMAL registrada e resolvida pelo Platform Owner nesta rodada. |

### Dependência transversal F-01 — Action Request foundation mínima

| Item | Declaração |
|---|---|
| Problema | D22 não pode operar sem Action Request, pois IA não executa ação crítica soberana. [MB §6/D22][MB §10/Gate16][MB §10/Gate17] |
| Fonte | O legado possui `action_requests`, `action_request_approvals` e `action_request_execution_logs` classificados como MERGE para D31 / D22 / D23. [RM §4 #93–#95] |
| Decisão | Este bloco antecipa o **envelope mínimo de Action Request** como fundação transversal, propriedade canônica de D31, sem declarar D31 entregue. |
| Limite | O Bloco F pode criar Action Requests e links de origem; aprovação, execução governada e gate registry completo continuam pertencendo ao Bloco K/D31. [RM §4 #93–#95][MB §10/Gate16] |
| Proibição | D22 não executa `proposed_command`, não agenda, não cancela, não cobra e não aplica benefício. [MB §6/D22][MB §10/Gate17] |

---

## 3. Convenções canônicas do Bloco F

| Item | Regra | Fonte |
|---|---|---|
| IDs | `uuid` com `gen_random_uuid()` | [SKILL §4] |
| Tempo | `timestamptz`; `timestamp` proibido | [SKILL §4] |
| Tenant | Toda tabela tenant-scoped contém `tenant_id` e RLS por `hope.tenant_id` | [MB §7][RM §2] |
| RLS | `RLS_ENABLED = SIM` em todas as tabelas do bloco | [MB §7][SKILL §4] |
| REVOKE | `REVOKE ALL FROM PUBLIC, anon, authenticated`; grants somente a roles técnicos herdados | [RM §2][Bloco A v2.1] |
| Roles | `app_backend_command_executor`, `app_backend_read_executor`, `app_worker_executor` herdados | [Bloco A v2.1] |
| Idempotência | Todo Command de escrita recebe `p_idempotency_key` e usa `shared.command_idempotency_keys` | [Bloco A v2.1] |
| Outbox | Efeitos assíncronos usam `shared.outbox_events` | [Bloco A v2.1][MB §7] |
| Erro estruturado | RPCs retornam `shared.structured_command_result`; erros catalogados em `shared.error_code_catalog` | [Bloco C v1.2] |
| Mensagem | Mensagem nunca altera agenda, checkout, benefício, carteira, ledger, comissão ou fiscal diretamente | [MB §6/D21] |
| IA | AI Receptionist só lê contexto autorizado, classifica intenção e cria Action Request | [MB §6/D22][MB §10/Gate17] |
| Consentimento | Outbound exige canal ativo, template aprovado e consentimento operacional por canal/finalidade | [MB §6/D21][RM §4 #18][RM §4 #84–#87] |
| PII | Logs de IA e mensagem com conteúdo sensível têm acesso restrito; leitura bruta direta é bloqueada | [MB §6/D22][MB §10/Gate17] |

### 3.1 Infraestrutura transversal criada neste bloco

| Tabela/tipo | Schema | Dono canônico | Migration | Finalidade | RLS |
|---|---|---:|---:|---|---|
| `tenant_core.action_requests` | `tenant_core` | 31 | 025 | Envelope mínimo de pedido governado gerado por IA/CoPilot/mensageria | SIM |
| `tenant_core.action_request_approvals` | `tenant_core` | 31 | 025 | Decisão humana/governada sobre Action Request | SIM |
| `tenant_core.action_request_execution_logs` | `tenant_core` | 31 | 025 | Log append-only de execução futura por Command autorizado | SIM |
| `shared.action_request_payload_contract` | `shared` | 31 | 025 | Tipo composto de contrato de payload proposto/aprovado | N/A |
| `shared.action_request_allowed_command` | `shared` | 31 | 025 | Enum fechado de Commands que podem ser propostos por IA/Action Request | N/A |
| `shared.action_request_command_whitelist` | `shared` | 31 | 025 | Whitelist canônica por `request_type` + `allowed_command` + risco mínimo | N/A |


### 3.1.1 Whitelist canônica inicial de Action Request

| request_type | allowed_command | target_domain | min_risk_level | Regra |
|---|---|---:|---|---|
| `send_message` | `tenant_core.command_enqueue_outbound_message` | 21 | `low` | IA pode propor envio apenas por template aprovado e consentimento D21. |
| `create_booking_link` | `tenant_core.command_create_booking_link` | 19 | `low` | IA propõe link; D19 é dono da criação. |
| `hold_slot` | `tenant_core.command_create_slot_hold` | 07 | `medium` | Hold só via engine D07/D08 com TTL e constraints aprovadas. |
| `create_appointment` | `tenant_core.command_create_appointment_from_hold` | 08 | `high` | Agendamento exige hold válido e aprovação conforme Gate 16. |
| `reschedule_appointment` | `tenant_core.command_reschedule_appointment` | 08 | `high` | Reagendamento exige Command dono e política de agenda. |
| `cancel_appointment` | `tenant_core.command_cancel_appointment` | 08 | `high` | Cancelamento exige Command dono, política e trilha. |
| `request_deposit` | `tenant_core.command_request_deposit` | 13 | `critical` | Apenas solicitação governada; nunca `command_post_financial_transaction`, cash ou ledger. |
| `open_handoff` | `tenant_core.command_open_human_handoff_case` | 21 | `low` | Handoff preserva contexto e bloqueia resposta automática. |

**Proibição explícita:** `command_post_financial_transaction`, `command_record_cash_payment`, `command_record_cash_movement`, `command_close_register_session`, `command_calculate_commission`, `command_post_commission`, qualquer RPC de ledger, caixa, wallet ou fiscal não pode aparecer em `shared.action_request_command_whitelist`. [MB §10/Gate16][MB §10/Gate17]

### 3.2 Catálogo de erros do Bloco F

| Código | Domínio | Uso |
|---|---:|---|
| `MESSAGE_CHANNEL_INACTIVE` | 21 | Canal inexistente, inativo, suspenso ou em erro |
| `MESSAGE_CONSENT_REQUIRED` | 21 | Cliente não possui consentimento ativo para canal/finalidade |
| `MESSAGE_TEMPLATE_NOT_APPROVED` | 21 | Template não aprovado ou versão arquivada |
| `MESSAGE_RATE_LIMITED` | 21 | Limite operacional por cliente/canal atingido |
| `MESSAGE_PROVIDER_REJECTED` | 21 | Provider rejeitou envio ou payload |
| `CONVERSATION_THREAD_CLOSED` | 21 | Tentativa de anexar mensagem em thread encerrada |
| `AI_SESSION_NOT_ACTIVE` | 22 | Sessão inexistente, expirada, encerrada ou em handoff |
| `AI_CONFIDENCE_TOO_LOW` | 22 | Confiança abaixo do limiar do domínio |
| `AI_GUARDRAIL_TRIGGERED` | 22 | Guardrail bloqueia resposta ou ação proposta |
| `AI_ACTION_REQUIRES_APPROVAL` | 22 | Ação sensível só pode seguir como Action Request |
| `ACTION_REQUEST_REQUIRED` | 22 | Tentativa de execução direta detectada e bloqueada |
| `ACTION_NOT_IN_WHITELIST` | 22/31 | `target_command` não pertence à whitelist canônica de Action Request |
| `HUMAN_HANDOFF_REQUIRED` | 21/22 | Fluxo precisa de atendimento humano |

---

## 4. Mapa Bloco F — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 025 | `shared` + `tenant_core` | 31 foundation | Envelope mínimo Action Request, whitelist de commands permitidos, approvals e execution logs | Gate 16 [MB §10/Gate16] |
| 026 | `tenant_core` | 21 | Messaging channels, templates, threads, messages, consents, delivery, handoff | Gate 17 [MB §10/Gate17] |
| 027 | `tenant_core` | 22 | AI sessions, interaction logs, intents, guardrails, previsit forms, AI→Action Request links | Gate 16 / Gate 17 [MB §10/Gate16][MB §10/Gate17] |

---

## 5. Especificação por domínio

## Domínio 21 — Messaging & Conversations

### 21.1 Responsabilidade

O Domínio 21 é dono de canais de mensageria, templates aprovados, consentimento operacional por canal/finalidade, inbound/outbound, threads de conversa, logs de entrega, push devices e handoff humano. Não é dono de agenda, checkout, benefício, cobrança, CoPilot, CRM, LGPD completa ou execução de Action Request. Mensagem não altera verdade diretamente; gera intent, evento, handoff ou Action Request. [MB §6/D21][RM §4 #84–#89]

### 21.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.messaging_channels` | Canal runtime canônico | PK `id`; FK `tenant_id`; FK `business_unit_id`; `channel_kind messaging_channel_kind`; `provider messaging_provider_kind`; `sender_identifier text`; `status messaging_channel_status`; `settings jsonb`; timestamps; unique `(tenant_id,business_unit_id,channel_kind,sender_identifier)` ativo; substitui `messaging_channel_configs` removido | Tenant atual; escrita admin/manager via Command; worker lê canal ativo |
| `tenant_core.message_templates` | Template aprovado/versionado por canal | PK `id`; FK `tenant_id`; `channel_kind`; `template_key`; `language text default 'pt_BR'`; `version int`; `purpose message_purpose_kind`; `content_body text`; `variables_schema jsonb`; `status message_template_status`; `requires_action_request boolean`; `approved_by_membership_id`; `approved_at`; unique `(tenant_id,channel_kind,template_key,language,version)`; unique parcial para versão ativa aprovada | Leitura staff autorizado; escrita e aprovação por Command |
| `tenant_core.inbound_messages` | Mensagem recebida bruta do provider | PK `id`; FK composta `(tenant_id,channel_id)`; FK `(tenant_id,client_id)` nullable; FK `conversation_thread_id`; `sender_identifier`; `body_text text`; `raw_payload jsonb`; `status message_status default received`; `provider_message_id`; `received_at`; `created_at`; unique `(tenant_id,provider_message_id)` quando presente; append-only | INSERT worker trusted; staff lê thread autorizada; cliente lê própria conversa via portal |
| `tenant_core.outbound_messages` | Mensagem enfileirada para envio | PK `id`; FK `tenant_id`; FK `channel_id`; FK `client_id`; FK `template_id`; FK `conversation_thread_id`; FK `action_request_id` nullable; `recipient_identifier`; `body_text`; `current_status message_status`; `current_status_rebuild_run_id uuid nullable`; `scheduled_at`; `sent_at`; `provider_message_id`; `idempotency_key unique`; `created_by_membership_id`; timestamps; `current_status` é projeção reconstruível de `message_delivery_logs`; trigger `trg_block_direct_status_update` bloqueia UPDATE direto em `current_status` fora de worker Command | INSERT via Command; worker atualiza/reconstrói projeção de status; leitura por thread autorizada |
| `tenant_core.message_delivery_logs` | Log append-only de entrega/provider | PK `id`; FK `tenant_id`; FK `outbound_message_id`; `status message_status`; `provider_status`; `provider_event_id`; `raw_payload jsonb`; `created_at`; unique `(tenant_id,provider_event_id)` quando presente; trigger bloqueia UPDATE/DELETE | INSERT worker; leitura staff autorizado; cliente vê status resumido |
| `tenant_core.outbound_message_status_rebuild_runs` | Prova append-only de rebuild de status de outbound | PK `id`; FK `tenant_id`; FK `outbound_message_id`; `previous_status message_status`; `rebuilt_status message_status`; `rebuild_reason text`; `source_delivery_log_id uuid nullable`; `started_at`; `finished_at`; `worker_role text`; trigger bloqueia UPDATE/DELETE; usado por `current_status_rebuild_run_id` | Worker escreve; staff/governança lê |
| `tenant_core.conversation_threads` | Thread canônica de conversa | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `client_id`; `thread_kind conversation_thread_kind`; `status conversation_thread_status`; `primary_channel_kind`; `last_message_at`; `assigned_membership_id`; `opened_at`; `closed_at`; `closure_reason`; check `closed_at` exige status fechado; index `(tenant_id,client_id,last_message_at desc)` | Staff autorizado lê threads do tenant; cliente lê própria thread |
| `tenant_core.conversation_messages` | Timeline unificada sem duplicar verdade bruta | PK `id`; FK `tenant_id`; FK `conversation_thread_id`; `direction message_direction`; FK `inbound_message_id` nullable; FK `outbound_message_id` nullable; `message_preview text`; `redaction_level message_redaction_level`; `created_at`; check exatamente um de inbound/outbound; unique por inbound/outbound | Leitura por thread autorizada; escrita somente Command/worker |
| `tenant_core.message_consent_events` | Evento append-only de consentimento operacional por canal/finalidade | PK `id`; FK `tenant_id`; FK `(tenant_id,client_id)`; `channel_kind`; `purpose message_purpose_kind`; `consent_status message_consent_status`; `source consent_source_kind`; `lawful_basis_key text`; `reason`; `actor_membership_id`; `occurred_at`; `consent_event_seq bigint` monotônico gerado pelo banco; trigger bloqueia UPDATE/DELETE; índice crítico `(tenant_id,client_id,channel_kind,purpose,occurred_at desc,consent_event_seq desc)`; estado efetivo usa `occurred_at desc, consent_event_seq desc` | Cliente pode criar grant/revoke via portal Command; staff autorizado lê resumo; raw protegido |
| `tenant_core.push_devices` | Dispositivo push do cliente/staff | PK `id`; FK `tenant_id`; FK `user_profile_id`; FK `client_id` nullable; `device_token_hash text`; `platform push_platform_kind`; `status push_device_status`; `last_seen_at`; `revoked_at`; unique ativo `(tenant_id,device_token_hash)` | Usuário gerencia próprio device; staff não lê token bruto |
| `tenant_core.human_handoff_cases` | Caso de atendimento humano | PK `id`; FK `tenant_id`; FK `conversation_thread_id`; FK `client_id`; FK `ai_session_id` nullable; `status handoff_status`; `priority handoff_priority`; `reason handoff_reason_kind`; `assigned_membership_id`; `opened_at`; `accepted_at`; `closed_at`; check status fechado exige `closed_at`; unique ativo por thread | Staff autorizado; cliente vê estado resumido |

### 21.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `messaging_channel_kind` | `whatsapp`, `sms`, `email`, `push`, `internal` |
| `messaging_provider_kind` | `whatsapp_business`, `twilio`, `sendgrid`, `smtp`, `firebase`, `internal`, `manual` |
| `messaging_channel_status` | `inactive`, `active`, `suspended`, `error`, `archived` |
| `message_direction` | `inbound`, `outbound` |
| `message_status` | `queued`, `sent`, `delivered`, `read`, `failed`, `received`, `ignored`, `cancelled` |
| `message_template_status` | `draft`, `pending_approval`, `approved`, `rejected`, `archived` |
| `message_purpose_kind` | `transactional`, `appointment_reminder`, `confirmation`, `cancellation`, `billing`, `benefit`, `marketing`, `review_request`, `support`, `ai_receptionist` |
| `message_consent_status` | `granted`, `revoked`, `expired`, `blocked_by_policy` |
| `consent_source_kind` | `client_portal`, `booking_link`, `staff_recorded`, `imported_legacy`, `system_policy`, `lgpd_request` |
| `conversation_thread_kind` | `client_support`, `appointment`, `billing`, `benefit`, `ai_receptionist`, `campaign`, `internal` |
| `conversation_thread_status` | `open`, `waiting_client`, `waiting_staff`, `ai_active`, `handoff_requested`, `closed`, `archived` |
| `message_redaction_level` | `none`, `preview_only`, `sensitive`, `restricted` |
| `push_platform_kind` | `ios`, `android`, `web` |
| `push_device_status` | `active`, `revoked`, `expired`, `invalid` |
| `handoff_status` | `open`, `assigned`, `accepted`, `resolved`, `closed`, `cancelled` |
| `handoff_priority` | `low`, `normal`, `high`, `urgent` |
| `handoff_reason_kind` | `low_confidence`, `client_requested`, `sensitive_topic`, `payment_issue`, `complaint`, `guardrail_violation`, `staff_required` |

### 21.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_register_messaging_channel` | `(p_business_unit_id uuid, p_channel_kind messaging_channel_kind, p_provider messaging_provider_kind, p_sender_identifier text, p_settings jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_set_messaging_channel_status` | `(p_channel_id uuid, p_status messaging_channel_status, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Owner/admin Command |
| `tenant_core.command_upsert_message_template` | `(p_channel_kind messaging_channel_kind, p_template_key text, p_language text, p_purpose message_purpose_kind, p_content_body text, p_variables_schema jsonb, p_requires_action_request boolean, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Manager/admin Command |
| `tenant_core.command_approve_message_template` | `(p_template_id uuid, p_actor_membership_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Admin/manager com permissão |
| `tenant_core.command_record_message_consent` | `(p_client_id uuid, p_channel_kind messaging_channel_kind, p_purpose message_purpose_kind, p_consent_status message_consent_status, p_source consent_source_kind, p_lawful_basis_key text, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Client portal/staff Command |
| `tenant_core.command_receive_inbound_message` | `(p_channel_id uuid, p_sender_identifier text, p_provider_message_id text, p_body_text text, p_raw_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Provider webhook worker |
| `tenant_core.command_enqueue_outbound_message` | `(p_channel_id uuid, p_client_id uuid, p_template_id uuid, p_conversation_thread_id uuid, p_action_request_id uuid, p_variables jsonb, p_scheduled_at timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Domain Command / worker |
| `tenant_core.command_record_message_delivery_status` | `(p_outbound_message_id uuid, p_status message_status, p_provider_status text, p_provider_event_id text, p_raw_payload jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Provider webhook worker |
| `tenant_core.command_rebuild_outbound_message_status` | `(p_outbound_message_id uuid, p_rebuild_reason text, p_source_delivery_log_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Messaging worker |
| `tenant_core.command_open_human_handoff_case` | `(p_conversation_thread_id uuid, p_client_id uuid, p_ai_session_id uuid, p_reason handoff_reason_kind, p_priority handoff_priority, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor`, `app_worker_executor` | AI or staff Command |
| `tenant_core.command_assign_handoff_case` | `(p_handoff_case_id uuid, p_assigned_membership_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Staff Command |
| `tenant_core.command_close_handoff_case` | `(p_handoff_case_id uuid, p_resolution_note text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Staff Command |
| `tenant_core.read_conversation_thread_page` | `(p_actor_user_id uuid, p_thread_id uuid, p_cursor timestamptz, p_limit int) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Staff/client read API |

### 21.4.1 Pré-condições obrigatórias dos Commands D21

| Command | Pré-condições transacionais |
|---|---|
| `command_enqueue_outbound_message` | Verifica `messaging_channels.status = active`; verifica template `approved`; verifica última entrada de `message_consent_events` como `granted` para `(client, channel_kind, purpose)`; bloqueia marketing sem consentimento explícito; se `template.requires_action_request = true`, exige `action_request_id` aprovado ou retorna `AI_ACTION_REQUIRES_APPROVAL`; cria `outbound_messages`, `conversation_messages` e `shared.outbox_events` na mesma transação. |
| `command_receive_inbound_message` | Deduplica por `(tenant_id, provider_message_id)`; resolve ou cria `conversation_threads`; cria `inbound_messages`, `conversation_messages`, evento `messaging.inbound_received` e, quando aplicável, solicita classificação D22 por outbox. |
| `command_record_message_delivery_status` | Insere `message_delivery_logs` append-only; atualiza somente projeção `outbound_messages.current_status` por worker Command; grava/atualiza `current_status_rebuild_run_id` quando houver rebuild; UPDATE direto fora de worker é bloqueado por `trg_block_direct_status_update`; se provider indica falha permanente, emite `messaging.delivery_failed`. |
| `command_rebuild_outbound_message_status` | Recalcula `outbound_messages.current_status` exclusivamente a partir de `message_delivery_logs`; cria `outbound_message_status_rebuild_runs` append-only; atualiza `current_status` e `current_status_rebuild_run_id` na mesma transação; retorna erro estruturado se delivery log inexistente ou cross-tenant. |
| `command_record_message_consent` | Insere evento append-only; nunca sobrescreve consentimento anterior; `consent_event_seq` fornece desempate determinístico; estado efetivo é sempre o último por `(tenant_id,client_id,channel_kind,purpose,occurred_at desc,consent_event_seq desc)`; revogação passa a bloquear novos outbound do canal/finalidade. |

### 21.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.messaging_channels` | SELECT | staff autorizado | `tenant_id = current_setting('hope.tenant_id', true)::uuid` + permissão `messaging.channel.read` |
| `tenant_core.messaging_channels` | INSERT/UPDATE | Command trusted | Sem escrita direta; Command valida owner/admin |
| `tenant_core.message_templates` | SELECT | staff autorizado | tenant atual + permissão `messaging.template.read` |
| `tenant_core.message_templates` | INSERT/UPDATE | Command trusted | Sem escrita direta; aprovação exige permissão `messaging.template.approve` |
| `tenant_core.inbound_messages` | SELECT | staff/client autorizado | staff por tenant/thread; cliente apenas `client_id` próprio via portal |
| `tenant_core.inbound_messages` | INSERT | worker trusted | Webhook Command; sem insert direto |
| `tenant_core.outbound_messages` | SELECT | staff/client autorizado | staff por tenant/thread; cliente apenas própria conversa |
| `tenant_core.outbound_messages` | INSERT/UPDATE | Command/worker trusted | Sem escrita direta; status por delivery log |
| `tenant_core.message_delivery_logs` | SELECT | staff autorizado | tenant atual; cliente recebe status resumido por RPC |
| `tenant_core.message_delivery_logs` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `tenant_core.outbound_message_status_rebuild_runs` | INSERT | worker trusted | Somente `app_worker_executor`; append-only |
| `tenant_core.outbound_message_status_rebuild_runs` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `tenant_core.conversation_threads` | SELECT | staff/client autorizado | staff por tenant; cliente apenas próprias threads |
| `tenant_core.conversation_messages` | SELECT | staff/client autorizado | thread autorizada; conteúdo `restricted` só via RPC com permission específica |
| `tenant_core.message_consent_events` | SELECT | staff/client autorizado | staff com permissão; cliente própria linha resumida |
| `tenant_core.message_consent_events` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `tenant_core.push_devices` | SELECT/UPDATE | próprio usuário | usuário só vê/revoga próprio device; token hash não exposto |
| `tenant_core.human_handoff_cases` | SELECT/UPDATE | staff autorizado | tenant atual + permissão `messaging.handoff.manage`; cliente vê status resumido |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente roles técnicos |

### 21.6 Invariantes

1. Mensagem não altera agenda, checkout, benefício, ledger, wallet, comissão, fiscal ou CRM diretamente. [MB §6/D21]
2. Outbound exige canal ativo, template aprovado e consentimento operacional vigente calculado por `occurred_at desc, consent_event_seq desc`. [MB §6/D21][RM §4 #84–#87]
3. Template sensível ou com proposta de ação exige Action Request aprovado. [MB §10/Gate16]
4. Empate de consentimento por `occurred_at` é resolvido por `consent_event_seq desc`; eventos do mesmo escopo com delta inferior a 1ms geram alerta operacional sem liberar outbound automaticamente. [MB §6/D21]
5. `message_delivery_logs`, `outbound_message_status_rebuild_runs` e `message_consent_events` são append-only. [MB §7]
6. `outbound_messages.current_status` é projeção reconstruível por `message_delivery_logs`, não fonte soberana de entrega; UPDATE direto é bloqueado e todo rebuild registra `outbound_message_status_rebuild_runs`. [MB §7]
7. `messaging_channel_configs` legado permanece removido; `messaging_channels` é a única fonte ativa de canal. [RM §4 #14][RM §6]
8. Cliente só lê mensagens e threads próprias. [MB §10/Gate01]
9. Conteúdo restrito exige RPC de leitura com permissão; SELECT bruto direto é bloqueado. [MB §6/D21]
10. Handoff humano preserva contexto, mas não concede permissão para executar ação crítica fora de Command. [MB §6/D21][MB §10/Gate16]
11. Mensageria de campanha pertence ao D24; D21 apenas transporta mensagem autorizada. [MB §11]

### 21.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `messaging.channel_registered` | `tenant_id`, `channel_id`, `channel_kind`, `provider` |
| `messaging.template_approved` | `tenant_id`, `template_id`, `template_key`, `version` |
| `messaging.consent_recorded` | `tenant_id`, `client_id`, `channel_kind`, `purpose`, `consent_status` |
| `messaging.inbound_received` | `tenant_id`, `inbound_message_id`, `conversation_thread_id`, `client_id` |
| `messaging.outbound_queued` | `tenant_id`, `outbound_message_id`, `channel_id`, `scheduled_at` |
| `messaging.delivery_recorded` | `tenant_id`, `outbound_message_id`, `status`, `provider_event_id` |
| `messaging.outbound_status_rebuilt` | `tenant_id`, `outbound_message_id`, `rebuild_run_id`, `rebuilt_status` |
| `messaging.delivery_failed` | `tenant_id`, `outbound_message_id`, `provider_status` |
| `messaging.handoff_opened` | `tenant_id`, `handoff_case_id`, `conversation_thread_id`, `reason`, `priority` |
| `messaging.handoff_closed` | `tenant_id`, `handoff_case_id`, `conversation_thread_id` |

### 21.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01 Identity & Tenant; 05 People Hub; 19 Client Experience Hub para portal; 26 LGPD futura para governança completa de consentimento |
| É dependência de | 22 AI Receptionist; 23 CoPilot; 24 CRM; 26 LGPD; 30 Integrations |

### 21.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 16 — Action Request Safety | Mensagens sensíveis ou propostas de ação exigem Action Request aprovado; nenhum bypass por outbound direto. [MB §10/Gate16] |
| Gate 17 — WhatsApp & AI Safety | WhatsApp gera intent/action request; mensagem não executa ação crítica soberana. [MB §10/Gate17] |
| Gate 01 — Tenant Isolation | Tenant A não lê conversa, consentimento, canal ou mensagem de Tenant B. [MB §10/Gate01] |

### 21.10 RAGOV do domínio

**REAL / MVP para outbound, lembretes, templates, consentimento operacional, logs, threads e handoff. PARCIAL para inbound automático completo, que depende de D22 e Gate 17.** [MB §6/D21]

---

## Domínio 22 — AI Receptionist Engine

### 22.1 Responsabilidade

O Domínio 22 é dono da sessão do AI Receptionist, triagem assistida, classificação de intenção, logs de interação, guardrails, handoff com contexto, formulário pré-visita assistido e criação de Action Requests. Não agenda, não cancela, não cobra, não aplica desconto, não consome benefício, não altera ledger e não executa Command soberano diretamente. [MB §6/D22][MB §10/Gate16][MB §10/Gate17]

### 22.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.ai_receptionist_sessions` | Sessão governada de IA por conversa/cliente | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `client_id`; FK `conversation_thread_id`; `session_status ai_session_status`; `entry_channel_kind messaging_channel_kind`; `started_at`; `last_interaction_at`; `ended_at`; `handoff_case_id`; `model_policy_version text`; check status encerrado exige `ended_at`; unique ativo por thread | Staff autorizado lê resumo; cliente vê estado resumido; raw bloqueado |
| `tenant_core.ai_interaction_logs` | Log append-only de interação IA | PK `id`; FK `tenant_id`; FK `ai_session_id`; FK `inbound_message_id` nullable; FK `outbound_message_id` nullable; `interaction_kind ai_interaction_kind`; `input_redacted text`; `output_redacted text`; `provider_trace_hash text`; `confidence numeric(5,4) check 0..1`; `contains_sensitive_data boolean`; `guardrail_result ai_guardrail_result`; `created_at`; trigger bloqueia UPDATE/DELETE | Leitura raw só backend/governança; staff recebe resumo redigido |
| `tenant_core.message_intents` | Intenção extraída de inbound/conversa | PK `id`; FK `tenant_id`; FK `inbound_message_id`; FK `ai_session_id`; FK `client_id`; `status messaging_intent_status`; `intent_type message_intent_type`; `confidence numeric(5,4) check 0..1`; `parsed_payload jsonb`; FK `action_request_id` nullable; `requires_human_review boolean`; timestamps; check Action Request quando status `action_requested` | Staff autorizado; cliente não lê payload bruto |
| `tenant_core.ai_action_request_links` | Vínculo entre IA/intenção e Action Request | PK `id`; FK `tenant_id`; FK `ai_session_id`; FK `message_intent_id`; FK `action_request_id`; `link_reason ai_action_link_reason`; `created_at`; unique `(tenant_id,message_intent_id,action_request_id)` | Leitura staff/governança; escrita D22 Command |
| `tenant_core.ai_handoff_contexts` | Contexto redigido para atendimento humano | PK `id`; FK `tenant_id`; FK `ai_session_id`; FK `handoff_case_id`; `summary_text`; `last_safe_intent`; `risk_flags jsonb`; `redaction_level message_redaction_level`; `created_at`; append-only por novo contexto | Staff do handoff lê; cliente não lê raw |
| `tenant_core.ai_guardrail_violations` | Violação de guardrail | PK `id`; FK `tenant_id`; FK `ai_session_id`; FK `interaction_log_id`; `violation_kind ai_guardrail_violation_kind`; `severity guardrail_severity`; `blocked_response boolean`; `blocked_action boolean`; `evidence_hash text`; `created_at`; append-only | Governança/staff autorizado; raw evidence não exposto |
| `tenant_core.ai_previsit_forms` | Formulário pré-visita assistido | PK `id`; FK `tenant_id`; FK `client_id`; FK `appointment_id` nullable; FK `ai_session_id`; `form_status ai_previsit_form_status`; `form_schema_key`; `answers_redacted jsonb`; `sensitivity_level message_redaction_level`; `submitted_at`; `reviewed_by_membership_id`; `reviewed_at`; check revisão quando status `reviewed` | Cliente vê próprio; staff autorizado conforme permissão sensível |

### 22.2.1 Tabelas transversais Action Request foundation

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.action_requests` | Envelope mínimo governado | PK `id`; FK `tenant_id`; FK `business_unit_id`; FK `client_id` nullable; `source_kind action_request_source_kind`; `source_domain smallint`; `source_entity_id uuid`; `status action_request_status`; `request_type action_request_type`; `title`; `description`; `proposed_command shared.action_request_allowed_command`; `proposed_payload shared.action_request_payload_contract`; `approved_payload shared.action_request_payload_contract`; `risk_level action_request_risk_level`; `required_permission text`; `expires_at`; timestamps; check status executado exige aprovação prévia; check/trigger exige par `(request_type, proposed_command)` existente em `shared.action_request_command_whitelist` | Staff autorizado; cliente apenas resumo quando próprio |
| `tenant_core.action_request_approvals` | Aprovação/rejeição append-only | PK `id`; FK `tenant_id`; FK `action_request_id`; `decision action_request_decision`; `actor_membership_id`; `reason`; `payload_snapshot shared.action_request_payload_contract`; `created_at`; trigger bloqueia UPDATE/DELETE | Staff com permissão de aprovação |
| `tenant_core.action_request_execution_logs` | Log de execução governada futura | PK `id`; FK `tenant_id`; FK `action_request_id`; `execution_status action_execution_status`; `command_name shared.action_request_allowed_command`; `idempotency_key`; `structured_result shared.structured_command_result`; `created_at`; trigger bloqueia UPDATE/DELETE | Governança/staff autorizado |
| `shared.action_request_command_whitelist` | Whitelist canônica dos Commands que podem ser propostos por Action Request | `request_type action_request_type`; `allowed_command shared.action_request_allowed_command`; `target_domain smallint`; `min_risk_level action_request_risk_level`; `required_permission text`; `is_active boolean`; unique `(request_type,allowed_command)`; sem linha tenant; escrita somente migration/governance | RLS não aplicável; REVOKE ALL de PUBLIC, anon, authenticated; leitura apenas backend/governance |

### 22.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `ai_session_status` | `active`, `waiting_client`, `handoff_requested`, `handoff_active`, `closed`, `expired`, `blocked` |
| `ai_interaction_kind` | `inbound_analysis`, `draft_response`, `safe_reply`, `intent_classification`, `action_request_proposal`, `handoff_summary`, `previsit_form_step` |
| `ai_guardrail_result` | `passed`, `blocked_response`, `blocked_action`, `requires_handoff`, `requires_review` |
| `message_intent_type` | `book_appointment`, `reschedule`, `cancel`, `ask_price`, `ask_hours`, `ask_location`, `confirm`, `benefit`, `billing_question`, `previsit_form`, `human_help`, `complaint`, `unknown` |
| `messaging_intent_status` | `received`, `classified`, `requires_review`, `action_requested`, `resolved`, `ignored`, `failed` |
| `ai_action_link_reason` | `booking_requested`, `reschedule_requested`, `cancellation_requested`, `deposit_requested`, `benefit_question`, `human_review`, `sensitive_topic` |
| `ai_guardrail_violation_kind` | `unsafe_medical_claim`, `payment_execution_attempt`, `direct_booking_attempt`, `direct_cancellation_attempt`, `pii_exposure`, `policy_bypass`, `prompt_injection`, `unknown` |
| `guardrail_severity` | `low`, `medium`, `high`, `critical` |
| `ai_previsit_form_status` | `draft`, `in_progress`, `submitted`, `reviewed`, `archived` |
| `action_request_source_kind` | `ai_receptionist`, `copilot`, `messaging`, `staff`, `system` |
| `action_request_status` | `draft`, `ready_for_review`, `approved`, `rejected`, `executing`, `executed`, `failed`, `expired`, `cancelled` |
| `action_request_type` | `send_message`, `create_booking_link`, `hold_slot`, `create_appointment`, `reschedule_appointment`, `cancel_appointment`, `request_deposit`, `open_handoff`, `manual_task` |
| `action_request_risk_level` | `low`, `medium`, `high`, `critical` |
| `action_request_decision` | `approved`, `rejected`, `cancelled` |
| `action_execution_status` | `started`, `succeeded`, `failed`, `blocked` |
| `shared.action_request_allowed_command` | `tenant_core.command_enqueue_outbound_message`, `tenant_core.command_create_booking_link`, `tenant_core.command_create_slot_hold`, `tenant_core.command_create_appointment_from_hold`, `tenant_core.command_reschedule_appointment`, `tenant_core.command_cancel_appointment`, `tenant_core.command_request_deposit`, `tenant_core.command_open_human_handoff_case` |
| `shared.action_request_payload_contract` | `target_domain smallint`, `target_command shared.action_request_allowed_command`, `target_entity_id uuid`, `payload jsonb`, `payload_hash text`, `requires_approval boolean` |

### 22.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_start_ai_receptionist_session` | `(p_conversation_thread_id uuid, p_client_id uuid, p_entry_channel_kind messaging_channel_kind, p_model_policy_version text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT `app_backend_command_executor`, `app_worker_executor` | Messaging worker / backend |
| `tenant_core.command_log_ai_interaction` | `(p_ai_session_id uuid, p_interaction_kind ai_interaction_kind, p_inbound_message_id uuid, p_input_redacted text, p_output_redacted text, p_provider_trace_hash text, p_confidence numeric, p_contains_sensitive_data boolean, p_guardrail_result ai_guardrail_result, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | AI worker |
| `tenant_core.command_classify_message_intent` | `(p_ai_session_id uuid, p_inbound_message_id uuid, p_intent_type message_intent_type, p_confidence numeric, p_parsed_payload jsonb, p_requires_human_review boolean, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | AI worker |
| `tenant_core.command_create_ai_action_request` | `(p_ai_session_id uuid, p_message_intent_id uuid, p_request_type action_request_type, p_title text, p_description text, p_proposed_command shared.action_request_allowed_command, p_proposed_payload shared.action_request_payload_contract, p_risk_level action_request_risk_level, p_required_permission text, p_expires_at timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor`, `app_backend_command_executor` | AI worker |
| `tenant_core.command_record_ai_guardrail_violation` | `(p_ai_session_id uuid, p_interaction_log_id uuid, p_violation_kind ai_guardrail_violation_kind, p_severity guardrail_severity, p_blocked_response boolean, p_blocked_action boolean, p_evidence_hash text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | AI worker |
| `tenant_core.command_request_human_handoff_from_ai` | `(p_ai_session_id uuid, p_reason handoff_reason_kind, p_priority handoff_priority, p_summary_text text, p_risk_flags jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor`, `app_backend_command_executor` | AI worker |
| `tenant_core.command_submit_ai_previsit_form` | `(p_ai_session_id uuid, p_client_id uuid, p_appointment_id uuid, p_form_schema_key text, p_answers_redacted jsonb, p_sensitivity_level message_redaction_level, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Client portal / AI worker |
| `tenant_core.command_close_ai_receptionist_session` | `(p_ai_session_id uuid, p_close_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor`, `app_backend_command_executor` | AI worker / staff |
| `tenant_core.read_ai_session_summary` | `(p_actor_user_id uuid, p_ai_session_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Staff/client read API |
| `tenant_core.read_action_request_review_queue` | `(p_actor_user_id uuid, p_cursor timestamptz, p_limit int) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Staff review API |

### 22.4.1 Pré-condições obrigatórias dos Commands D22

| Command | Pré-condições transacionais |
|---|---|
| `command_classify_message_intent` | Verifica sessão ativa, inbound pertence ao mesmo tenant/thread, `confidence` entre 0 e 1, grava `message_intents`; se `confidence` abaixo do limiar do tenant, status `requires_review` e emite handoff ou Action Request de revisão. |
| `command_create_ai_action_request` | Verifica sessão ativa, intent do mesmo tenant, `p_proposed_command` tipado como `shared.action_request_allowed_command`; valida par `(p_request_type,p_proposed_command)` em `shared.action_request_command_whitelist` ativo; valida `risk_level >= min_risk_level`; valida `required_permission` igual ou mais restritivo que a whitelist; payload contém `target_domain` e `target_command` idêntico a `p_proposed_command`; se não houver whitelist retorna `AI_ACTION_REQUIRES_APPROVAL` com erro `ACTION_NOT_IN_WHITELIST`; cria `action_requests` com status `ready_for_review`; cria `ai_action_request_links`; emite `ai.action_request_created`; não executa command alvo. |
| `command_record_ai_guardrail_violation` | Insere violação append-only; se `blocked_action = true`, bloqueia criação de Action Request de risco crítico e abre handoff; se `blocked_response = true`, não enfileira outbound. |
| `command_request_human_handoff_from_ai` | Cria/atualiza `human_handoff_cases`, cria `ai_handoff_contexts` redigido, muda sessão para `handoff_requested`, emite outbox; tudo na mesma transação. |
| `command_submit_ai_previsit_form` | Verifica client/appointment do mesmo tenant; grava respostas redigidas; se sensibilidade `restricted`, bloqueia leitura direta e exige permissão de saúde/consulta no D05/D26 futuro. |

### 22.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.ai_receptionist_sessions` | SELECT | staff/client autorizado | staff por tenant com permissão `ai.session.read`; cliente só própria sessão resumida |
| `tenant_core.ai_receptionist_sessions` | INSERT/UPDATE | Command/worker trusted | Sem escrita direta |
| `tenant_core.ai_interaction_logs` | SELECT | backend/governança | SELECT bruto negado a staff comum; staff recebe resumo via RPC |
| `tenant_core.ai_interaction_logs` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `tenant_core.message_intents` | SELECT | staff autorizado | tenant atual + permissão `ai.intent.read`; cliente não lê payload bruto |
| `tenant_core.message_intents` | INSERT/UPDATE | worker trusted | Sem escrita direta |
| `tenant_core.ai_action_request_links` | SELECT | staff autorizado | tenant atual + permissão `action_request.read` |
| `tenant_core.ai_handoff_contexts` | SELECT | staff do handoff | tenant atual + caso atribuído ou permissão `messaging.handoff.manage` |
| `tenant_core.ai_guardrail_violations` | SELECT | governança/staff autorizado | tenant atual + permissão `ai.guardrail.read`; evidência bruta não exposta |
| `tenant_core.ai_guardrail_violations` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `tenant_core.ai_previsit_forms` | SELECT | cliente/staff autorizado | cliente próprio; staff com permissão sensível conforme `sensitivity_level` |
| `tenant_core.action_requests` | SELECT | staff autorizado | tenant atual + permissão `action_request.read`; cliente só resumo se próprio |
| `tenant_core.action_requests` | INSERT | D22/D23/D21 Commands | Sem insert direto; fonte deve ser `ai_receptionist`, `copilot`, `messaging`, `staff` ou `system` |
| `tenant_core.action_request_approvals` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `tenant_core.action_request_execution_logs` | UPDATE/DELETE | Todos | Bloqueado append-only |
| `shared.action_request_command_whitelist` | SELECT | backend/governance | Leitura por `app_backend_command_executor`, `app_backend_read_executor`, `app_worker_executor`; sem leitura pública direta |
| `shared.action_request_command_whitelist` | INSERT/UPDATE/DELETE | migration/governance | Escrita somente migration/governance; REVOKE ALL de PUBLIC, anon, authenticated |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente roles técnicos |

### 22.6 Invariantes

1. AI Receptionist nunca agenda, cancela, reagenda, cobra, aplica benefício ou cria ledger diretamente. [MB §6/D22][MB §10/Gate17]
2. Toda ação crítica proposta pela IA vira `action_requests.status = ready_for_review` e só pode apontar para `shared.action_request_allowed_command` presente na whitelist ativa por `request_type`. [MB §10/Gate16]
3. `action_request_approvals` e `action_request_execution_logs` são append-only. [RM §4 #94–#95]
4. Guardrail com `blocked_action = true` impede proposta de ação e exige handoff ou revisão. [MB §10/Gate17]
5. `ai_interaction_logs` são append-only e redigidos; prompt/payload bruto não é exposto por SELECT direto. [MB §6/D22]
6. `message_intents` não altera verdade; só classifica e vincula Action Request. [RM §4 #88][MB §6/D21]
7. Booking link criado por IA só pode ser proposta governada para D19; D22 não cria booking link diretamente. [MB §6/D22][Bloco E v1.1]
8. Cancelamento, reagendamento e depósito antecipado propostos pela IA exigem Action Request, whitelist ativa e Command dono do domínio; Commands financeiros de ledger/caixa/postagem são proibidos na whitelist. [MB §6/D22][MB §10/Gate16]
9. Sessão em handoff bloqueia resposta automática até o caso humano ser resolvido. [MB §6/D21][MB §6/D22]
10. D22 é PARCIAL/MVP consultivo até Gate 16 e Gate 17 passarem. [MB §6/D22]

### 22.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `ai.session_started` | `tenant_id`, `ai_session_id`, `conversation_thread_id`, `client_id` |
| `ai.interaction_logged` | `tenant_id`, `ai_session_id`, `interaction_log_id`, `guardrail_result` |
| `ai.intent_classified` | `tenant_id`, `message_intent_id`, `intent_type`, `confidence`, `status` |
| `ai.action_request_created` | `tenant_id`, `action_request_id`, `message_intent_id`, `risk_level` |
| `ai.guardrail_violation_recorded` | `tenant_id`, `violation_id`, `violation_kind`, `severity`, `blocked_action` |
| `ai.handoff_requested` | `tenant_id`, `ai_session_id`, `handoff_case_id`, `reason` |
| `ai.previsit_form_submitted` | `tenant_id`, `client_id`, `appointment_id`, `form_id`, `sensitivity_level` |
| `action_request.ready_for_review` | `tenant_id`, `action_request_id`, `request_type`, `risk_level` |

### 22.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01 Identity & Tenant; 05 People Hub; 08 Agenda Core para contexto; 19 Client Experience Hub para portal/booking link; 21 Messaging; D31 foundation mínima de Action Request |
| É dependência de | 23 CoPilot; 24 CRM; 26 LGPD; 31 Governance |

### 22.9 Gate correspondente

| Gate | Asserções |
|---|---|
| Gate 16 — Action Request Safety | Ações sensíveis exigem aprovação; D22 cria Action Request, não executa Command alvo. [MB §10/Gate16] |
| Gate 17 — WhatsApp & AI Safety | WhatsApp gera intent/action request; IA não executa ação crítica soberana. [MB §10/Gate17] |
| Gate 01 — Tenant Isolation | Tenant A não lê sessão, intenção, handoff ou logs de Tenant B. [MB §10/Gate01] |

### 22.10 RAGOV do domínio

**PARCIAL / MVP consultivo. REAL somente após Gate 16 e Gate 17.** [MB §6/D22][MB §10/Gate16][MB §10/Gate17]

---

## 6. Mapa de relações inter-domínios do Bloco F

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| 21 | 22 | `inbound_messages` → `message_intents` / `ai_receptionist_sessions` | Inbound pode ser classificado; classificação não executa ação. [MB §6/D21][MB §6/D22] |
| 22 | 31 foundation | `ai_action_request_links.action_request_id` → `action_requests.id`; whitelist `request_type + proposed_command` | IA propõe Action Request apenas para command permitido; execução fica governada. [RM §4 #93–#95] |
| 21 | 05 | `client_id`, `user_profile_id`, `membership_id` | Mensagens e devices vinculam pessoas sem duplicar cadastro. [MB §6/D05] |
| 21 | 19 | Cliente lê conversa e consentimento via portal | Portal não escreve mensagem bruta diretamente. [Bloco E v1.1] |
| 22 | 08/09/10/12/13/18 | Propostas de agendar/cancelar/cobrar/benefício | D22 cria Action Request; domínio dono executa após aprovação. [MB §10/Gate16] |
| 21/22 | 26 | Consentimento e logs sensíveis | D26 consolida LGPD completa; D21/D22 registram eventos operacionais mínimos. [RM §4 #18] |

---

## 7. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gate secundário | Critério bloqueante |
|---:|---:|---|---|---|
| 31 foundation | 025 | Gate 16 | Gate 01 | Action Request sem bypass e tenant-scoped |
| 21 | 026 | Gate 17 | Gate 16 | Mensagem não executa ação crítica; outbound exige consentimento/template |
| 22 | 027 | Gate 17 | Gate 16 | IA gera intent/action request; não executa ação soberana |

---

## 8. Ordem única de execução de migrations do Bloco F

| Ordem | Migration | Conteúdo | Dependência |
|---:|---|---|---|
| 1 | `025_action_request_safety_foundation.sql` | Tipos compartilhados, `shared.action_request_allowed_command`, `shared.action_request_command_whitelist`, `action_requests`, `action_request_approvals`, `action_request_execution_logs`, RLS e REVOKE/GRANT | Blocos A–E aprovados |
| 2 | `026_messaging_conversations.sql` | Canais, templates, inbound/outbound, status rebuild runs, delivery logs, threads, messages, consent events, push devices, handoff | 025 |
| 3 | `027_ai_receptionist_engine.sql` | Sessões IA, interaction logs, intents, guardrails, previsit forms, AI→Action Request links | 025, 026 |

---

## 9. Estratégia de rollback do Bloco F

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 025 | Desativar criação de novos Action Requests por status/config em ambiente sem produção | Apagar approvals ou execution logs append-only |
| 026 | Suspender canal por status; arquivar template; revogar device; fechar handoff | Apagar mensagens, delivery logs ou consent events |
| 027 | Encerrar sessão de IA por status; bloquear policy version; abrir handoff manual | Apagar interaction logs, guardrail violations ou action request links |

---

## 10. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| D21 usa `messaging_channels` como fonte canônica | REAL | `messaging_channel_configs` legado é REMOVE; manter ambos cria duplicidade | [RM §4 #14][RM §4 #84][RM §6] |
| `outbound_messages.current_status` é projeção | REAL | Delivery soberano é append-only em `message_delivery_logs`; rebuild tem run auditável e UPDATE direto bloqueado | [RM §4 #89][MB §7] |
| Consentimento operacional é evento append-only | REAL | Estado efetivo é determinístico por `occurred_at desc, consent_event_seq desc` antes do D26 completo | [MB §6/D21][RM §4 #18] |
| D22 antecipa envelope mínimo de Action Request | REAL | Sem Action Request, IA violaria a invariante de não executar ação crítica | [MB §6/D22][RM §4 #93–#95] |
| Whitelist de `target_command` no banco | REAL | Gate 17 não é provável se IA puder propor qualquer RPC por texto livre | [MB §10/Gate16][MB §10/Gate17] |
| Action Request completo continua D31 | REAL | Este bloco não entrega gate registry, QA, releases ou governança completa | [RM §5/D31][SKILL §6] |
| IA gera booking link apenas via Action Request | REAL | D22 não escreve D19 diretamente; D19 é dono do portal/link | [MB §6/D22][Bloco E v1.1] |
| Guardrail bloqueia resposta/ação | REAL | Gate 17 exige WhatsApp & AI Safety | [MB §10/Gate17] |

---

## 11. Reflexion contra Definition of Done do Bloco F

| Item verificado | Resultado | Correção aplicada |
|---|---|---|
| Domínios 21 e 22 têm os 10 blocos obrigatórios | SIM | Estrutura 21.1–21.10 e 22.1–22.10 |
| RLS especificada por tabela | SIM | Seções 21.5 e 22.5 |
| REVOKE/GRANT explícitos | SIM | Todas as funções e tabelas declaram REVOKE de PUBLIC, anon, authenticated |
| Nenhum SQL executável dentro do Blueprint | SIM | Constraints e triggers são descritas como contrato, sem scripts executáveis |
| IA não executa ação soberana | SIM | D22 cria Action Request e links; execução fica fora do domínio |
| Mensagem não altera verdade diretamente | SIM | D21 só registra/transmite/classifica; alterações passam por Commands donos |
| Action Request foundation não declara D31 completo | SIM | Propriedade D31 registrada como fundação mínima |
| Consentimento de mensagem é append-only | SIM | `message_consent_events` sem UPDATE/DELETE e estado efetivo determinístico |
| Logs de IA são append-only e protegidos | SIM | `ai_interaction_logs` e `ai_guardrail_violations` protegidos |
| Gate 16 e Gate 17 são verificáveis | SIM | Action Request obrigatório, whitelist de command alvo e guardrails formalizados |
| Divergência de rótulo do bloco registrada | SIM | DIVERGÊNCIA FORMAL F-00 |

**Falhas encontradas antes da declaração:** F-01, F-02 e F-03 da auditoria Red Team foram absorvidas nesta versão v1.1.  
**Limite explícito:** este arquivo não declara D23–D31 entregues; Action Request foundation é mínima e será completada no Bloco K/D31.

Pronto para auditoria Red Team.

---

## ANEXO G — SMART_FLOW_3_0_BLUEPRINT_BLOCO_G_v1_1.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco G

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco G — Domínios 23 e 24  
**Status:** v1.1 — ENTREGUE PARA AUDITORIA RED TEAM DO BLOCO G  
**Data:** 2026-06-11  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0][MB §6/D23][MB §6/D24][MB §10][MB §11]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §4 #20–#21][RM §4 #83][RM §4 #90–#96][RM §5/D23][RM §5/D24]  
**Fundação aprovada herdada:** Bloco A v2.1, Bloco B v2.1, Bloco C v1.2, Bloco D v1.2, Bloco E v1.1, Bloco F v1.1.

---

## 0. Regra de autoridade e escopo

1. O Master Brief 3.0 é a fonte única de visão, domínios, gates e ordem de construção. [MB §0][MB §11]
2. O Blueprint decide arquitetura; SQL Master só materializa após Blueprint completo aprovado. [MB §0][SKILL §6]
3. O SQL legado é insumo de reaproveitamento, não fonte de verdade. [RM §1]
4. Esta entrega cobre somente D23 e D24, por autorização operacional da rodada. [MB §6/D23][MB §6/D24]
5. D25 Analytics & Decision Intelligence fica fora deste bloco; D23/D24 produzem fatos medíveis e eventos reconstruíveis para D25 consumir depois, sem criar analytics paralelo. [MB §6/D25][RM §5/D25]
6. CoPilot recomenda e gera Action Request; nunca cria pagamento, ledger, comissão, wallet, benefício ou mensagem diretamente. [MB §6/D23][MB §10/Gate16]
7. CRM segmenta e mede relacionamento com consentimento; campanha não bypassa Messaging, Action Request, checkout, ledger ou LGPD. [MB §6/D24][MB §10/Gate17]
8. Toda decisão econômica usa backend como fonte da verdade; frontend apenas exibe oportunidades, aprovações e resultados já calculados. [MB §7]
9. Read models e snapshots de D23/D24 são reconstruíveis; nenhum snapshot deste bloco é saldo, cobrança, receita final ou verdade fiscal. [MB §7][MB §10/Gate19]
10. Todos os objetos tenant-scoped usam `tenant_id`, RLS efetiva, `REVOKE ALL` explícito de `PUBLIC, anon, authenticated`, e grants somente a roles técnicos herdados do Bloco A. [MB §7][RM §2]

---

## 1. Escopo do Bloco G

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| G | 23 | CoPilot Revenue Engine | Especificado | [MB §6/D23][RM §4 #90–#92][RM §4 #96][RM §5/D23] |
| G | 24 | Retention & CRM Engine | Especificado | [MB §6/D24][RM §4 #20–#21][RM §4 #83][RM §4 #100][RM §5/D24] |

---

## 2. Divergência formal de agrupamento

### DIVERGÊNCIA FORMAL G-00 — Bloco G operacional vs agrupamento da skill

| Item | Regra / fato | Decisão desta rodada |
|---|---|---|
| Skill original | Agrupa D23, D24 e D25 como bloco de inteligência. [SKILL §6] | Não será seguido literalmente nesta rodada. |
| Ordem do Master Brief | CoPilot vem antes de Retention/CRM e Analytics vem depois. [MB §11] | D23 e D24 serão entregues agora; D25 fica para o bloco seguinte. |
| Autorização operacional | Blocos anteriores já foram reagrupados por autorização do Platform Owner e auditados. | Mantém-se o fluxo aprovado: Bloco G = D23–D24. |
| Risco controlado | D23/D24 produzem fatos de ROI e campanha, mas não criam cockpit analítico completo. | D25 consumirá os eventos e snapshots sem reescrever verdade. |

**Veredito da divergência:** aceita nesta rodada por autorização do Platform Owner.  
**Limite:** nenhuma tabela de D25, nenhum dashboard, nenhum analytics read model soberano e nenhum Gate 19 completo será declarado como aprovado neste bloco. [MB §10/Gate19]

---

## 3. Contratos herdados e extensão controlada

| Contrato herdado | Uso no Bloco G | Regra |
|---|---|---|
| `shared.structured_command_result` | Todas as funções retornam erro/sucesso estruturado | Sem payload livre fora do contrato aprovado no Bloco C |
| `shared.action_request_allowed_command` | CoPilot só propõe command permitido | Não aceita texto livre [MB §10/Gate16] |
| `shared.action_request_command_whitelist` | D23 adiciona pares permitidos para oportunidades econômicas | Proibido incluir ledger, caixa, wallet, fiscal, comissão e pagamento direto [MB §6/D23] |
| `tenant_core.action_requests` | Saída governada do CoPilot e de campanhas sensíveis | Action Request é envelope; execução é governança futura/D31 |
| `tenant_core.outbound_messages` / D21 | Campanhas e recomendações outbound passam por Messaging | CRM não insere mensagem direta [MB §6/D21][MB §6/D24] |
| `tenant_core.message_consent_events` | Segmentação e campanhas respeitam consentimento efetivo | Consentimento por canal/finalidade [MB §6/D24] |
| D12–D17 financeiro | ROI é medido contra checkout/ledger/appointment, nunca inventado | Resultado mensurável no ledger [MB §6/D24] |

### 3.1 Extensão da whitelist de Action Request para D23/D24

| request_type | allowed_command | target_domain | min_risk_level | required_permission | Uso permitido |
|---|---|---:|---|---|---|
| `revenue_opportunity_followup` | `tenant_core.command_enqueue_outbound_message` | 21 | `medium` | `messaging.outbound.create` | Enviar campanha/oferta com consentimento via D21 |
| `revenue_opportunity_booking_link` | `tenant_core.command_create_booking_link` | 19 | `low` | `client_experience.booking_link.create` | Gerar link para cliente/segmento |
| `revenue_opportunity_slot_hold` | `tenant_core.command_create_slot_hold` | 07 | `medium` | `agenda.hold.create` | Propor hold para janela econômica, sem confirmar agenda |
| `revenue_opportunity_deposit_request` | `tenant_core.command_request_deposit` | 13 | `high` | `payment.deposit.request` | Solicitar depósito, sem capturar pagamento |
| `crm_campaign_outbound` | `tenant_core.command_enqueue_outbound_message` | 21 | `medium` | `crm.campaign.send` | Enfileirar mensagem de campanha via D21 |
| `crm_campaign_booking_link` | `tenant_core.command_create_booking_link` | 19 | `low` | `crm.booking_link.create` | Link rastreável de campanha |
| `crm_retention_handoff` | `tenant_core.command_open_human_handoff_case` | 21 | `medium` | `crm.handoff.create` | Encaminhar cliente em risco para humano |

**Proibição explícita:** a whitelist deste bloco não pode conter `command_post_financial_transaction`, `command_record_cash_payment`, `command_record_cash_movement`, `command_calculate_commission`, `command_post_commission`, `command_apply_benefit_consumption`, qualquer command de ledger, caixa, wallet, comissão, fiscal ou captura de pagamento. [MB §6/D23][MB §10/Gate16]

### 3.2 Contrato tipado de definição de segmento CRM

| Objeto shared | Tipo | Contrato |
|---|---|---|
| `shared.segment_filter_operator` | enum | `eq`, `in`, `gt`, `lt`, `between`, `has_tag`, `not_has_tag`, `days_since`, `score_above`, `score_below`, `exists_active`, `not_exists_active` |
| `shared.segment_filter_field` | enum | `last_visit_at`, `visit_count`, `gross_revenue_cents`, `margin_cents`, `churn_score`, `tag_id`, `subscription_status`, `package_usage_status`, `benefit_balance_status`, `birthday_month`, `preferred_service_id`, `last_message_at`, `no_show_count` |
| `shared.segment_definition_contract` | composite type | `operator_kind shared.segment_filter_operator`; `field_kind shared.segment_filter_field`; `value_1 text`; `value_2 text nullable`; `join_kind segment_clause_join_kind default 'and'`; `negated boolean default false` |
| `segment_clause_join_kind` | enum | `and`, `or` |

**Regra:** `crm_segments.definition` usa `shared.segment_definition_contract[]`, nunca `jsonb` livre. O worker de rebuild só traduz operadores e campos destes enums; não aceita fragmento SQL, nome de tabela livre, nome de coluna livre, subquery, função arbitrária ou expressão textual executável. [MB §7][MB §10/Gate01]

---

## 4. Convenções canônicas do Bloco G

| Item | Regra | Fonte |
|---|---|---|
| Schema | Objetos tenant-scoped em `tenant_core`; extensões de whitelist em `shared` | [MB §6/D23][MB §6/D24] |
| RLS | `RLS_ENABLED = SIM` em todas as tabelas tenant-scoped | [MB §7][RM §2] |
| Grants | `REVOKE ALL` de `PUBLIC, anon, authenticated`; grants somente roles técnicos | [RM §2] |
| Idempotência | Todo Command de escrita recebe `p_idempotency_key text` | [SKILL §4] |
| CoPilot | Recomenda, mede, cria Action Request; não executa verdade econômica | [MB §6/D23] |
| CRM | Segmenta e campanha com consentimento; não envia direto sem D21 | [MB §6/D24] |
| ROI | Estimado separado de realizado; realizado só por fontes D08/D12/D15/D18/D21 | [MB §6/D23][MB §6/D24] |
| Snapshots | Rebuild auditável com `run_id`, `source_window_start/end`, `source_hash` | [MB §10/Gate19] |
| Segmentos CRM | Definição tipada por `shared.segment_definition_contract[]`; SQL livre proibido | [MB §7][SKILL §4] |
| Consentimento em segmento | Freeze grava `consent_events_up_to_seq` e drift é revalidado no enqueue | [MB §6/D21][MB §6/D24] |
| Tags | Tags legadas são insumo, não fonte única de CRM comportamental | [RM §4 #20–#21] |
| Loyalty | `loyalty_rules` só gera elegibilidade/segmento; benefício real fica em D18 | [RM §4 #83][MB §6/D18] |

---

## 5. Mapa Bloco G — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 031 | `shared` | 23/24 | Extensão controlada da whitelist de Action Request + enums/tipo `segment_definition_contract` | Gate 16 / Gate 17 [MB §10] |
| 032 | `tenant_core` | 23 | CoPilot Revenue Engine, oportunidades, boosters, runs, outcomes e ROI | Gate 16 / Gate 19 parcial [MB §10] |
| 033 | `tenant_core` | 24 | Retention & CRM, segmentos, snapshots, campanhas e outcomes | Gate 17 / Gate 19 parcial [MB §10] |

---

## 6. DECISÕES PENDENTES resolvidas no Bloco G

### DECISÃO PENDENTE G-01 — ROI realizado do CoPilot sem criar analytics paralelo

**Origem:** D23 exige oportunidade com impacto, probabilidade, margem, urgência, confiança, risco, ação recomendada e Action Request; D24 exige resultado mensurável no ledger. [MB §6/D23][MB §6/D24]  
**Risco:** se o CoPilot gravar ROI final livre, cria métrica soberana paralela ao ledger/appointments e quebra Gate 19. [MB §10/Gate19]

| Alternativa | Desenho | Ledger | Tenant isolation | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | CoPilot grava ROI estimado e outcome realizado somente com links para D08/D12/D15/D21 e `source_hash` | Alto: realizado é reconstruível | Alto | Baixo | Média |
| B | CoPilot grava `realized_revenue_cents` manual como verdade final | Baixo: cria métrica soberana | Médio | Alto | Alta |
| C | Postergar toda mensuração para D25 sem tabelas em D23 | Médio: perde rastreabilidade de oportunidade | Alto | Médio | Alta |

**Escolha:** Alternativa A.  
**Justificativa:** mantém oportunidade e outcome em D23 sem criar Analytics completo; o realizado é reconstruível a partir de ledger/checkout/appointments e campanha. [MB §6/D23][MB §10/Gate19]  
**Descartes:** B descartada por criar verdade paralela; C descartada porque D23 precisa ROI mensurável e outcomes conforme Reuse Map. [RM §4 #96]

### DECISÃO PENDENTE G-02 — Segmentos CRM: materialização governada vs consulta dinâmica

**Origem:** D24 exige segmentação por comportamento, frequência, valor, churn, VIP, pacote, assinatura e campanhas mensuráveis. [MB §6/D24]  
**Risco:** segmento dinâmico sem snapshot impede auditoria de quem recebeu campanha e por quê.

| Alternativa | Desenho | Ledger | Tenant isolation | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | `crm_segment_build_runs` materializa membership append-only por run; campanha referencia run congelado | Alto: resultado mensurável por cohort | Alto | Médio | Média |
| B | Campanha consulta filtro dinâmico em tempo real | Médio: menos auditável | Alto | Baixo | Alta |
| C | Só tags manuais legadas | Baixo: não cobre comportamento real | Alto | Baixo | Alta |

**Escolha:** Alternativa A.  
**Justificativa:** campanha precisa saber quem entrou, por qual regra e com qual consentimento efetivo; snapshot por run é auditável. [MB §6/D24][RM §4 #20–#21]  
**Descartes:** B descartada por não provar cohort; C descartada porque tags são insumo, não CRM comportamental completo. [RM §4 #20–#21]

---

# Domínio 23 — CoPilot Revenue Engine

## 23.1 Responsabilidade

O Domínio 23 é dono de oportunidades econômicas governadas: identificar alavancas de receita/margem/ocupação/recorrência, calcular score e explicabilidade dos boosters canônicos, registrar fontes de oportunidade, sugerir Action Request, acompanhar desfecho e medir ROI reconstruível. Não é dono de checkout, payment, ledger, wallet, comissão, benefício, mensagem outbound ou execução de ação. [MB §6/D23][RM §4 #90–#92][RM §4 #96]

## 23.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.economic_opportunities` | Oportunidade econômica canônica | PK `id`; FK `tenant_id`; FK `business_unit_id`; `opportunity_code text`; `booster_kind copilot_booster_kind`; `status economic_opportunity_status`; `priority opportunity_priority`; `client_id` nullable FK composta `(tenant_id, client_id)`; `staff_id` nullable FK composta; `service_id` nullable FK composta; `appointment_id` nullable FK composta; `estimated_impact_cents bigint CHECK >= 0`; `estimated_margin_cents bigint CHECK >= 0`; `probability numeric(5,4) CHECK 0..1`; `confidence numeric(5,4) CHECK 0..1`; `urgency_score numeric(5,2)`; `risk_score numeric(5,2)`; `recommended_action_kind recommended_action_kind`; `recommended_action_summary text`; `created_from_run_id`; `expires_at`; timestamps; unique `(tenant_id, opportunity_code)`; CHECK oportunidade ativa exige `expires_at` futuro | Tenant atual; leitura gerencial; escrita por worker/Command |
| `tenant_core.opportunity_sources` | Fontes rastreáveis da oportunidade | PK `id`; FK `tenant_id`; FK `opportunity_id`; `source_domain smallint`; `source_table text`; `source_entity_id uuid`; `source_window_start`; `source_window_end`; `source_hash text`; `source_weight numeric(8,4)`; timestamps; unique `(tenant_id, opportunity_id, source_domain, source_table, source_entity_id)` | Tenant atual; append-only |
| `tenant_core.booster_scores` | Explicabilidade de score por booster | PK `id`; FK `tenant_id`; FK `opportunity_id`; `booster_kind`; `score_key text`; `score_value numeric(12,4)`; `weight numeric(8,4)`; `explanation text`; `source_hash text`; timestamps; unique `(tenant_id, opportunity_id, score_key)` | Tenant atual; append-only por oportunidade |
| `tenant_core.copilot_booster_runs` | Execução de cálculo de boosters | PK `id`; FK `tenant_id`; FK `business_unit_id`; `run_kind copilot_run_kind`; `status copilot_run_status`; `source_window_start`; `source_window_end`; `triggered_by_kind copilot_run_trigger_kind`; `triggered_by_membership_id` nullable; `triggered_by_worker_role` nullable; `input_hash text`; `result_hash text`; `opportunities_created_count int CHECK >=0`; `started_at`; `finished_at`; check ator humano ou worker exclusivo | Tenant atual; worker escreve |
| `tenant_core.opportunity_action_links` | Vínculo entre oportunidade e Action Request | PK `id`; FK `tenant_id`; FK `opportunity_id`; FK `action_request_id`; `link_status opportunity_action_link_status`; `created_at`; `revoked_at`; unique ativo `(tenant_id, opportunity_id, action_request_id)`; FK composta garante mesmo tenant | Tenant atual; escrita por Command D23 |
| `tenant_core.opportunity_roi_measurements` | Mensuração reconstruível de ROI realizado | PK `id`; FK `tenant_id`; FK `opportunity_id`; FK `action_request_id` nullable; `measurement_status roi_measurement_status`; `measurement_window_start`; `measurement_window_end`; `estimated_impact_cents bigint CHECK >=0`; `realized_revenue_cents bigint CHECK >=0`; `realized_margin_cents bigint CHECK >=0`; `ledger_source_hash text`; `appointment_source_hash text`; `checkout_source_hash text`; `message_source_hash text`; `measured_at`; `rebuild_run_id uuid`; unique `(tenant_id, opportunity_id, measurement_window_start, measurement_window_end)`; não é saldo | Tenant atual; worker escreve; append-only por janela |
| `tenant_core.copilot_recommendation_feedback` | Feedback humano sobre recomendação | PK `id`; FK `tenant_id`; FK `opportunity_id`; FK `membership_id`; `feedback copilot_feedback_kind`; `reason text`; `created_at`; trigger bloqueia UPDATE/DELETE | Tenant atual; staff autorizado |
| `tenant_core.copilot_guardrail_events` | Bloqueios e violações de governança do CoPilot | PK `id`; FK `tenant_id`; FK `opportunity_id` nullable; `guardrail_kind copilot_guardrail_kind`; `blocked_action boolean`; `reason text`; `payload_snapshot jsonb`; `created_at`; trigger bloqueia UPDATE/DELETE | Tenant atual; worker/governança |

## 23.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `copilot_booster_kind` | `capacity_yield`, `premium_window`, `predictive_rebooking`, `vip_recovery`, `pre_service_addon`, `smart_gap`, `package_renewal`, `cashback_activation`, `no_show_risk`, `staff_productivity` |
| `economic_opportunity_status` | `detected`, `ready_for_review`, `action_requested`, `accepted`, `dismissed`, `expired`, `converted`, `failed`, `measured` |
| `opportunity_priority` | `low`, `normal`, `high`, `critical` |
| `recommended_action_kind` | `send_message`, `create_booking_link`, `create_slot_hold`, `request_deposit`, `open_handoff`, `suggest_offer`, `no_action` |
| `copilot_run_kind` | `scheduled_batch`, `manual_rebuild`, `event_triggered`, `gate_fixture` |
| `copilot_run_status` | `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| `copilot_run_trigger_kind` | `membership`, `worker`, `gate_fixture` |
| `opportunity_action_link_status` | `created`, `approved`, `executed`, `revoked`, `expired`, `failed` |
| `roi_measurement_status` | `pending`, `measured`, `insufficient_data`, `rebuild_required`, `failed` |
| `copilot_feedback_kind` | `useful`, `not_useful`, `wrong_timing`, `wrong_client`, `wrong_margin`, `already_handled`, `unsafe` |
| `copilot_guardrail_kind` | `financial_command_blocked`, `missing_consent`, `low_confidence`, `high_risk`, `cross_tenant_payload`, `expired_source`, `not_in_whitelist`, `manual_review_required` |

## 23.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_run_copilot_boosters` | `(p_business_unit_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_booster_kinds copilot_booster_kind[], p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker CoPilot |
| `tenant_core.command_create_economic_opportunity` | `(p_business_unit_id uuid, p_booster_kind copilot_booster_kind, p_recommended_action_kind recommended_action_kind, p_estimated_impact_cents bigint, p_estimated_margin_cents bigint, p_probability numeric, p_confidence numeric, p_urgency_score numeric, p_risk_score numeric, p_sources jsonb, p_scores jsonb, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker CoPilot |
| `tenant_core.command_create_copilot_action_request` | `(p_opportunity_id uuid, p_request_type action_request_type, p_title text, p_description text, p_proposed_command shared.action_request_allowed_command, p_proposed_payload shared.action_request_payload_contract, p_risk_level action_request_risk_level, p_required_permission text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor`, `app_worker_executor` | Staff autorizado / worker |
| `tenant_core.command_dismiss_economic_opportunity` | `(p_opportunity_id uuid, p_actor_membership_id uuid, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Staff autorizado |
| `tenant_core.command_record_copilot_feedback` | `(p_opportunity_id uuid, p_actor_membership_id uuid, p_feedback copilot_feedback_kind, p_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Staff autorizado |
| `tenant_core.command_measure_opportunity_roi` | `(p_opportunity_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker ROI |
| `tenant_core.read_copilot_opportunity_board` | `(p_business_unit_id uuid, p_status economic_opportunity_status[], p_limit int, p_cursor text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Gestor |

### 23.4.1 Pré-condições obrigatórias

| Função | Pré-condições |
|---|---|
| `command_run_copilot_boosters` | Valida tenant atual, unidade ativa, janela finita, boosters permitidos, fontes D08/D12/D15/D18/D21 acessíveis no mesmo tenant; cria `copilot_booster_runs`; não cria Action Request automaticamente sem oportunidade explícita. |
| `command_create_economic_opportunity` | Valida `estimated_impact_cents >= 0`, `estimated_margin_cents >= 0`, `probability/confidence` entre 0 e 1; persiste fontes e scores na mesma transação; se fonte cross-tenant retorna `VALIDATION_FAILED`. |
| `command_create_copilot_action_request` | Verifica oportunidade ativa do mesmo tenant; `p_proposed_command` é enum permitido; valida par ativo em `shared.action_request_command_whitelist`; bloqueia commands financeiros/ledger/wallet/caixa/comissão/fiscal; cria `action_requests` em `ready_for_review`; vincula em `opportunity_action_links`; não executa command alvo. |
| `command_measure_opportunity_roi` | Reconstrói realizado a partir de D08 appointments, D12 checkout, D15 ledger, D21 messages e D18 benefit events; grava hashes de fonte; nunca atualiza ledger nem appointment. |
| `read_copilot_opportunity_board` | Paginação por cursor estável; filtra tenant/unidade; não retorna campos de staff financeiro privado nem payloads sensíveis. |

## 23.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.economic_opportunities` | SELECT | owner/admin/manager | `tenant_id = current_setting('hope.tenant_id', true)::uuid` + permissão `copilot.opportunity.read` |
| `tenant_core.economic_opportunities` | INSERT/UPDATE | Command trusted | Sem escrita direta; status muda por Command |
| `tenant_core.opportunity_sources` | SELECT | gestor autorizado | Mesmo tenant; payload de fonte sensível redigido por RPC |
| `tenant_core.opportunity_sources` | INSERT | Worker trusted | Apenas na mesma transação de criação/rebuild |
| `tenant_core.booster_scores` | SELECT | gestor autorizado | Mesmo tenant; explicabilidade visível sem dados sensíveis |
| `tenant_core.copilot_booster_runs` | SELECT | gestor autorizado | Mesmo tenant |
| `tenant_core.opportunity_action_links` | SELECT | gestor autorizado | Mesmo tenant; join com `action_requests` do mesmo tenant |
| `tenant_core.opportunity_roi_measurements` | SELECT | gestor autorizado | Mesmo tenant; valores reconstruíveis, não saldo |
| `tenant_core.copilot_recommendation_feedback` | INSERT | staff autorizado | Mesmo tenant + membership ativa |
| `tenant_core.copilot_guardrail_events` | SELECT | governance/gestor autorizado | Mesmo tenant; payload sensível por RPC |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente roles técnicos |

## 23.6 Invariantes

1. CoPilot recomenda; nunca executa pagamento, ledger, wallet, comissão, caixa, fiscal ou benefício diretamente. [MB §6/D23]
2. Toda ação proposta vira Action Request governado e validado pela whitelist ativa. [MB §10/Gate16]
3. `estimated_impact_cents` e `realized_revenue_cents` não são saldo nem receita soberana; são métricas reconstruíveis com fonte/hashes. [MB §10/Gate19]
4. Oportunidade sem fonte rastreável é inválida. [RM §4 #91]
5. Booster score deve explicar peso, valor e fonte; score invisível é bloqueado. [RM §4 #92]
6. Outcome de oportunidade só é medido por fontes D08/D12/D15/D18/D21, nunca por input manual livre. [RM §4 #96]
7. Oportunidade expirada não pode gerar Action Request novo. [MB §7]
8. Oportunidade que envolve outbound precisa consentimento efetivo via D21 antes do envio, não apenas antes da recomendação. [MB §6/D24]
9. D23 não cria analytics_read_models nem dashboard; D25 fará cockpit depois. [MB §6/D25]
10. Payload de Action Request precisa conter `target_command` idêntico ao enum permitido. [MB §10/Gate16]

## 23.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `copilot.booster_run_started` | `tenant_id`, `business_unit_id`, `run_id`, `booster_kinds`, `window` |
| `copilot.booster_run_finished` | `tenant_id`, `run_id`, `status`, `opportunities_created_count` |
| `copilot.opportunity_created` | `tenant_id`, `opportunity_id`, `booster_kind`, `estimated_impact_cents`, `confidence` |
| `copilot.action_request_created` | `tenant_id`, `opportunity_id`, `action_request_id`, `proposed_command` |
| `copilot.opportunity_dismissed` | `tenant_id`, `opportunity_id`, `reason` |
| `copilot.roi_measured` | `tenant_id`, `opportunity_id`, `measurement_id`, `realized_revenue_cents` |
| `copilot.guardrail_blocked` | `tenant_id`, `opportunity_id`, `guardrail_kind`, `blocked_action` |

## 23.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 01, 05, 06, 07, 08, 12, 15, 18, 21, 22 |
| É dependência de | 24, 25, 31 |
| Consome, sem possuir | Appointments, checkout totals, ledger entries, benefit events, outbound messages, Action Requests |

## 23.9 Gate correspondente

| Gate | Asserções do Bloco G |
|---|---|
| Gate 16 — Action Request Safety | CoPilot só gera Action Request com command permitido por whitelist; nenhuma execução direta. [MB §10/Gate16] |
| Gate 19 — Analytics Rebuild parcial | ROI e outcomes são reconstruíveis por fonte/hashes; Gate 19 completo fica para D25. [MB §10/Gate19] |

## 23.10 RAGOV do domínio

**PARCIAL / MVP consultivo. REAL com execução após Gate 17.** [MB §6/D23]

---

# Domínio 24 — Retention & CRM Engine

## 24.1 Responsabilidade

O Domínio 24 é dono da segmentação comportamental, churn risk, frequency drift, VIP monitoring, package usage tracking, subscription health, régua de relacionamento, campanhas baseadas em dados reais, consentimento por canal/finalidade e mensuração de resultado por campanha. Não é dono de mensageria runtime, IA Receptionist, benefício, checkout, ledger, página pública ou analytics cockpit. [MB §6/D24][RM §4 #20–#21][RM §4 #83][RM §4 #100]

## 24.2 Tabelas

| Tabela | Propósito | Chaves, colunas e constraints | RLS |
|---|---|---|---|
| `tenant_core.client_tags` | Tags legadas como insumo de segmentação | PK `id`; FK `tenant_id`; `tag_name text`; `tag_kind crm_tag_kind`; `color_key`; `created_at`; `archived_at`; unique ativo `(tenant_id, lower(tag_name))`; não é fonte única de CRM | Tenant atual; staff autorizado |
| `tenant_core.client_tag_assignments` | Atribuições de tag | PK `id`; FK `tenant_id`; FK composta `(tenant_id, client_id)`; FK composta `(tenant_id, tag_id)`; `assigned_by_membership_id`; `assigned_at`; `revoked_at`; unique ativo `(tenant_id, client_id, tag_id)` | Tenant atual; staff autorizado |
| `tenant_core.crm_segments` | Segmento CRM canônico | PK `id`; FK `tenant_id`; FK `business_unit_id` nullable; `segment_code text`; `name`; `segment_kind crm_segment_kind`; `status crm_segment_status`; `definition shared.segment_definition_contract[] not null`; `definition_hash text`; `requires_consent_purpose messaging_purpose` nullable; check `array_length(definition,1) > 0`; SQL livre proibido por tipo/enums; timestamps; unique `(tenant_id, segment_code)` | Tenant atual; gestão |
| `tenant_core.crm_segment_build_runs` | Run de materialização de segmento | PK `id`; FK `tenant_id`; FK `segment_id`; `status crm_build_status`; `source_window_start`; `source_window_end`; `definition_hash`; `source_hash`; `members_count int CHECK >=0`; `started_at`; `finished_at`; `rebuild_reason text`; append-only | Tenant atual; worker |
| `tenant_core.crm_segment_members` | Membros congelados por run | PK `id`; FK `tenant_id`; FK `segment_build_run_id`; FK composta `(tenant_id, client_id)`; `membership_reason jsonb`; `score numeric(8,4)`; `consent_snapshot_schema_version text default 'v1'`; `consent_channel_kind messaging_channel_kind nullable`; `consent_purpose messaging_purpose nullable`; `consent_state campaign_consent_state not null`; `consent_events_up_to_seq bigint not null default 0`; `consent_checked_at timestamptz not null`; `included_at`; unique `(tenant_id, segment_build_run_id, client_id)`; append-only | Tenant atual; leitura gerencial |
| `tenant_core.client_behavior_snapshots` | Snapshot reconstruível de comportamento por cliente | PK `id`; FK `tenant_id`; FK composta `(tenant_id, client_id)`; `snapshot_at`; `source_window_start`; `source_window_end`; `appointments_count int CHECK >=0`; `no_show_count int CHECK >=0`; `cancelled_count int CHECK >=0`; `gross_revenue_cents bigint CHECK >=0`; `margin_cents bigint CHECK >=0`; `last_visit_at`; `avg_days_between_visits numeric(10,2)`; `preferred_services jsonb`; `rebuild_run_id uuid`; unique `(tenant_id, client_id, snapshot_at)` | Tenant atual; read model reconstruível |
| `tenant_core.churn_risk_scores` | Score de churn | PK `id`; FK `tenant_id`; FK composta `(tenant_id, client_id)`; `score numeric(5,4) CHECK 0..1`; `risk_level churn_risk_level`; `reason_codes text[]`; `source_snapshot_id`; `scored_at`; `expires_at`; unique ativo `(tenant_id, client_id)` por período; sem decisão automática | Tenant atual; gestão |
| `tenant_core.frequency_drift_alerts` | Alerta de queda de frequência | PK `id`; FK `tenant_id`; FK `client_id`; `baseline_days numeric(10,2)`; `current_days_since_visit int CHECK >=0`; `drift_ratio numeric(8,4)`; `status crm_alert_status`; `created_at`; `resolved_at`; `resolution_reason`; unique ativo `(tenant_id, client_id, status)` quando status aberto | Tenant atual; gestão |
| `tenant_core.subscription_health_snapshots` | Saúde de assinatura de cliente | PK `id`; FK `tenant_id`; FK `client_id`; FK `subscription_id` do D18; `snapshot_at`; `health_status subscription_health_status`; `remaining_benefits_summary jsonb`; `payment_risk_level`; `usage_risk_level`; `source_hash`; `rebuild_run_id`; append-only por snapshot | Tenant atual; gestão |
| `tenant_core.retention_campaigns` | Campanha CRM | PK `id`; FK `tenant_id`; FK `business_unit_id` nullable; FK `segment_id` nullable; `campaign_code`; `name`; `campaign_kind retention_campaign_kind`; `status retention_campaign_status`; `channel_kind messaging_channel_kind`; `purpose messaging_purpose`; `template_id` FK composta D21; `starts_at`; `ends_at`; `requires_action_request boolean`; `created_by_membership_id`; timestamps; unique `(tenant_id, campaign_code)` | Tenant atual; gestão |
| `tenant_core.campaign_members` | Público congelado da campanha | PK `id`; FK `tenant_id`; FK `campaign_id`; FK `segment_build_run_id`; FK composta `(tenant_id, client_id)`; `consent_state campaign_consent_state`; `delivery_status campaign_delivery_status`; `action_request_id` nullable; `outbound_message_id` nullable; `booking_link_id` nullable; `created_at`; unique `(tenant_id, campaign_id, client_id)` | Tenant atual; gestão; cliente próprio resumo quando aplicável |
| `tenant_core.campaign_outcomes` | Resultado reconstruível por campanha/membro | PK `id`; FK `tenant_id`; FK `campaign_id`; FK `campaign_member_id`; `outcome_kind campaign_outcome_kind`; `attributed_revenue_cents bigint CHECK >=0`; `attributed_margin_cents bigint CHECK >=0`; `appointment_id` nullable; `checkout_session_id` nullable; `financial_transaction_id` nullable; `attribution_window_start`; `attribution_window_end`; `source_hash`; `measured_at`; trigger bloqueia UPDATE/DELETE | Tenant atual; append-only |
| `tenant_core.loyalty_rule_crm_links` | Ligação de loyalty rules com CRM sem gerar benefício direto | PK `id`; FK `tenant_id`; FK `loyalty_rule_id` D18; FK `segment_id` nullable; `link_kind loyalty_crm_link_kind`; `status`; `created_at`; `revoked_at`; unique ativo `(tenant_id, loyalty_rule_id, segment_id, link_kind)` | Tenant atual; gestão |

## 24.3 Enums e tipos

| Tipo | Valores |
|---|---|
| `crm_tag_kind` | `manual`, `behavioral_hint`, `vip_hint`, `risk_hint`, `campaign_hint` |
| `crm_segment_kind` | `manual_tags`, `behavioral`, `churn_risk`, `vip`, `package_usage`, `subscription_health`, `campaign_static`, `hybrid` |
| `crm_segment_status` | `draft`, `active`, `paused`, `archived` |
| `crm_build_status` | `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| `churn_risk_level` | `low`, `medium`, `high`, `critical` |
| `crm_alert_status` | `open`, `acknowledged`, `resolved`, `dismissed`, `expired` |
| `subscription_health_status` | `healthy`, `attention`, `at_risk`, `past_due`, `inactive` |
| `retention_campaign_kind` | `rebooking`, `winback`, `vip_recovery`, `package_usage`, `subscription_health`, `birthday`, `post_visit`, `no_show_recovery`, `cashback_activation`, `manual` |
| `retention_campaign_status` | `draft`, `ready_for_review`, `approved`, `scheduled`, `running`, `paused`, `completed`, `cancelled`, `failed` |
| `campaign_consent_state` | `granted`, `revoked`, `missing`, `unknown`, `not_required_internal` |
| `campaign_delivery_status` | `pending`, `blocked_no_consent`, `action_requested`, `queued`, `sent`, `delivered`, `failed`, `converted`, `expired` |
| `campaign_outcome_kind` | `message_sent`, `message_delivered`, `booking_link_opened`, `appointment_created`, `checkout_completed`, `benefit_consumed`, `subscription_renewed`, `no_conversion` |
| `loyalty_crm_link_kind` | `segment_eligibility`, `campaign_trigger`, `retention_hint`, `manual_review` |
| `segment_clause_join_kind` | `and`, `or` |
| `shared.segment_filter_operator` | `eq`, `in`, `gt`, `lt`, `between`, `has_tag`, `not_has_tag`, `days_since`, `score_above`, `score_below`, `exists_active`, `not_exists_active` |
| `shared.segment_filter_field` | `last_visit_at`, `visit_count`, `gross_revenue_cents`, `margin_cents`, `churn_score`, `tag_id`, `subscription_status`, `package_usage_status`, `benefit_balance_status`, `birthday_month`, `preferred_service_id`, `last_message_at`, `no_show_count` |
| `shared.segment_definition_contract` | composite: `operator_kind`, `field_kind`, `value_1`, `value_2`, `join_kind`, `negated` |

## 24.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_create_crm_segment` | `(p_business_unit_id uuid, p_segment_code text, p_name text, p_segment_kind crm_segment_kind, p_definition shared.segment_definition_contract[], p_requires_consent_purpose messaging_purpose, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Gestor |
| `tenant_core.command_rebuild_crm_segment` | `(p_segment_id uuid, p_source_window_start timestamptz, p_source_window_end timestamptz, p_rebuild_reason text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker CRM |
| `tenant_core.command_rebuild_client_behavior_snapshot` | `(p_business_unit_id uuid, p_source_window_start timestamptz, p_source_window_end timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker CRM |
| `tenant_core.command_score_churn_risk` | `(p_business_unit_id uuid, p_source_window_start timestamptz, p_source_window_end timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker CRM |
| `tenant_core.command_create_retention_campaign` | `(p_business_unit_id uuid, p_campaign_code text, p_name text, p_campaign_kind retention_campaign_kind, p_segment_id uuid, p_channel_kind messaging_channel_kind, p_purpose messaging_purpose, p_template_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_requires_action_request boolean, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Gestor |
| `tenant_core.command_freeze_campaign_members` | `(p_campaign_id uuid, p_segment_build_run_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor`, `app_backend_command_executor` | Worker/gestor |
| `tenant_core.command_submit_campaign_for_review` | `(p_campaign_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_command_executor` | Gestor |
| `tenant_core.command_enqueue_campaign_member_outbound` | `(p_campaign_id uuid, p_campaign_member_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker CRM |
| `tenant_core.command_measure_campaign_outcomes` | `(p_campaign_id uuid, p_window_start timestamptz, p_window_end timestamptz, p_idempotency_key text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_worker_executor` | Worker CRM |
| `tenant_core.read_crm_campaign_dashboard` | `(p_business_unit_id uuid, p_status retention_campaign_status[], p_limit int, p_cursor text) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Gestor |
| `tenant_core.read_client_retention_profile` | `(p_client_id uuid, p_actor_membership_id uuid) returns shared.structured_command_result` | DEFINER; REVOKE PUBLIC, anon, authenticated; GRANT EXECUTE `app_backend_read_executor` | Staff autorizado |

### 24.4.1 Pré-condições obrigatórias

| Função | Pré-condições |
|---|---|
| `command_create_crm_segment` | Aceita somente `p_definition shared.segment_definition_contract[]`; rejeita array vazio; cada cláusula precisa usar `operator_kind` e `field_kind` dos enums shared; não aceita SQL livre, nome de tabela livre, nome de coluna livre, subquery, função arbitrária ou expressão textual executável; tags são apenas insumo; grava `definition_hash`. |
| `command_rebuild_crm_segment` | Materializa membros por run; grava consentimento em campos tipados (`consent_snapshot_schema_version`, `consent_channel_kind`, `consent_purpose`, `consent_state`, `consent_events_up_to_seq`, `consent_checked_at`); usa fontes do mesmo tenant; não executa SQL dinâmico livre; não edita runs anteriores. |
| `command_create_retention_campaign` | Valida template aprovado no D21, canal/finalidade, janela válida, segmento ativo e mesmo tenant; se outbound sensível exige `requires_action_request = true`. |
| `command_freeze_campaign_members` | Usa `crm_segment_members` do run informado; recalcula consentimento efetivo por D21 com desempate `occurred_at desc, consent_event_seq desc`; grava `consent_events_up_to_seq` máximo considerado; membros sem consentimento ficam `blocked_no_consent`, não são removidos silenciosamente. |
| `command_enqueue_campaign_member_outbound` | Não insere `outbound_messages` diretamente; compara último `consent_event_seq` atual por `(client, channel_kind, purpose)` com `consent_events_up_to_seq`; se houver drift, revalida estado efetivo antes de enfileirar; se consentimento revogado após freeze bloqueia e registra outcome `no_conversion`/blocked. |
| `command_measure_campaign_outcomes` | Atribui resultado por links D19, appointments D08, checkout D12, ledger D15, benefício D18 e mensagens D21; grava `source_hash`; não calcula lucro final fora do ledger. |
| `read_client_retention_profile` | Redige dados sensíveis; respeita permissões de People Hub e LGPD; não retorna payload de nota sensível sem log de acesso D05/D26. |

## 24.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| `tenant_core.client_tags` | SELECT | membro ativo autorizado | Mesmo tenant + permissão `crm.tag.read` |
| `tenant_core.client_tags` | INSERT/UPDATE | Command trusted | Gestão via Command; sem DELETE físico |
| `tenant_core.client_tag_assignments` | SELECT | membro ativo autorizado | Mesmo tenant |
| `tenant_core.crm_segments` | SELECT | gestor autorizado | Mesmo tenant + `crm.segment.read` |
| `tenant_core.crm_segments` | INSERT/UPDATE | Command trusted | Sem escrita direta por frontend |
| `tenant_core.crm_segment_build_runs` | SELECT | gestor autorizado | Mesmo tenant |
| `tenant_core.crm_segment_members` | SELECT | gestor autorizado | Mesmo tenant; cliente não vê segmentação interna |
| `tenant_core.client_behavior_snapshots` | SELECT | gestor autorizado | Mesmo tenant; redigido por RPC quando necessário |
| `tenant_core.churn_risk_scores` | SELECT | gestor autorizado | Mesmo tenant; cliente não vê score interno |
| `tenant_core.frequency_drift_alerts` | SELECT | gestor autorizado | Mesmo tenant |
| `tenant_core.subscription_health_snapshots` | SELECT | gestor autorizado | Mesmo tenant; não substitui D18 |
| `tenant_core.retention_campaigns` | SELECT | gestor autorizado | Mesmo tenant |
| `tenant_core.campaign_members` | SELECT | gestor autorizado | Mesmo tenant; cliente pode ver apenas comunicações próprias via D19/D21 |
| `tenant_core.campaign_outcomes` | SELECT | gestor autorizado | Mesmo tenant; append-only |
| `tenant_core.loyalty_rule_crm_links` | SELECT | gestor autorizado | Mesmo tenant |
| `tenant_core.*` | ALL | PUBLIC, anon, authenticated | REVOKE ALL explícito; grants somente roles técnicos |

## 24.6 Invariantes

1. Segmento dinâmico só vira público de campanha após build run congelado. [MB §6/D24]
2. Tags legadas são insumo, não fonte única de CRM comportamental. [RM §4 #20–#21]
3. Campanha outbound respeita consentimento efetivo no momento do freeze e novamente no momento do enqueue. [MB §6/D24][MB §6/D21]
4. Campanha não insere mensagem direta; sempre chama D21. [MB §6/D21]
5. Resultado de campanha é mensurável por fontes reais: mensagem, booking link, appointment, checkout, ledger e benefício. [MB §6/D24]
6. `campaign_outcomes.attributed_revenue_cents` não é ledger nem saldo; é atribuição reconstruível com `source_hash`. [MB §10/Gate19]
7. Segmento CRM não aceita SQL livre: somente `shared.segment_definition_contract[]` com enums fechados pode ser persistido. [MB §7][SKILL §4]
8. Consentimento congelado em membro de segmento sempre carrega `consent_events_up_to_seq`; enqueue detecta drift e revalida no D21. [MB §6/D21][MB §6/D24]
7. Churn risk e VIP monitoring não executam ação automática; geram campanha, alerta ou Action Request. [MB §6/D24]
8. Subscription health de cliente não se mistura com billing SaaS do tenant. [MB §6/D04][MB §6/D18]
9. Loyalty rule ligada a CRM não cria benefício sem D18. [RM §4 #83]
10. D24 não cria Analytics & Decision Intelligence; D25 reconstrói cockpit depois. [MB §6/D25]

## 24.7 Eventos outbox

| event_type | Payload mínimo |
|---|---|
| `crm.segment_created` | `tenant_id`, `segment_id`, `segment_kind` |
| `crm.segment_rebuild_started` | `tenant_id`, `segment_id`, `run_id`, `window` |
| `crm.segment_rebuild_finished` | `tenant_id`, `segment_id`, `run_id`, `members_count`, `status` |
| `crm.client_behavior_snapshot_rebuilt` | `tenant_id`, `business_unit_id`, `window`, `run_id` |
| `crm.churn_risk_scored` | `tenant_id`, `business_unit_id`, `scored_count` |
| `crm.campaign_created` | `tenant_id`, `campaign_id`, `campaign_kind` |
| `crm.campaign_members_frozen` | `tenant_id`, `campaign_id`, `segment_build_run_id`, `members_count` |
| `crm.campaign_member_blocked_no_consent` | `tenant_id`, `campaign_id`, `campaign_member_id`, `client_id` |
| `crm.campaign_outbound_requested` | `tenant_id`, `campaign_id`, `campaign_member_id`, `action_request_id` |
| `crm.campaign_outcome_measured` | `tenant_id`, `campaign_id`, `outcome_count`, `source_hash` |

## 24.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | 05, 08, 12, 15, 18, 19, 21, 23 |
| É dependência de | 25, 26, 31 |
| Consome, sem possuir | Clients, appointments, checkout, ledger, benefits, booking links, message consent, outbound status |

## 24.9 Gate correspondente

| Gate | Asserções do Bloco G |
|---|---|
| Gate 17 — WhatsApp & AI Safety | CRM outbound passa por D21, consentimento e, se sensível, Action Request. [MB §10/Gate17] |
| Gate 19 — Analytics Rebuild parcial | Segmentos, snapshots e outcomes são reconstruíveis; Gate 19 completo fica para D25. [MB §10/Gate19] |

## 24.10 RAGOV do domínio

**REAL após Camada 1 estável.** [MB §6/D24]

---

## 7. Mapa de relações inter-domínios do Bloco G

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| 23 | 31/22 foundation | Action Request | CoPilot só propõe via whitelist; não executa command |
| 23 | 21 | Outbound recomendado | Mensagem real passa por Messaging e consentimento |
| 23 | 15 | ROI realizado | Ledger é fonte de medição; CoPilot não grava saldo |
| 24 | 21 | Campanha outbound | CRM não insere mensagens diretamente |
| 24 | 18 | Package/subscription health | CRM observa, D18 mantém benefício/assinatura |
| 24 | 19 | Booking link attribution | CRM mede conversão, D19 mantém link/portal |
| 24 | 25 | Analytics futuro | D25 consome outcomes; D24 não cria cockpit |

---

## 8. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gate secundário | Critério bloqueante |
|---:|---:|---|---|---|
| 23 | 031/032 | Gate 16 | Gate 19 parcial | Oportunidade não pode gerar command fora da whitelist; ROI precisa ser reconstruível |
| 24 | 031/033 | Gate 17 | Gate 19 parcial | Campanha não pode enviar sem consentimento; outcome precisa ser mensurável |

---

## 9. Ordem única de execução de migrations do Bloco G

1. `031_intelligence_action_request_whitelist.sql` — extensão controlada da whitelist de Action Request para D23/D24; enums `segment_filter_operator`, `segment_filter_field`, `segment_clause_join_kind` e tipo `shared.segment_definition_contract`; sem commands financeiros/ledger/wallet/caixa/comissão/fiscal. [MB §10/Gate16]
2. `032_copilot_revenue_engine.sql` — oportunidades, fontes, scores, runs, action links, ROI measurements e guardrails do CoPilot. [MB §6/D23]
3. `033_retention_crm_engine.sql` — tags CRM, segmentos, build runs, snapshots comportamentais, churn, campanhas, membros e outcomes. [MB §6/D24]

---

## 10. Estratégia de rollback do Bloco G

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 031 | Desativar linhas de whitelist por status/flag em sandbox; remover apenas antes de dados reais | Apagar aprovações ou Action Requests já criados |
| 032 | Marcar oportunidades como `expired` ou `dismissed`; reexecutar run com novo idempotency key | Apagar `opportunity_sources`, `booster_scores`, `roi_measurements` ou guardrail events |
| 033 | Pausar campanha/segmento; criar novo build run; cancelar campanha futura | Apagar `campaign_members`, `campaign_outcomes`, `crm_segment_build_runs` ou snapshots históricos |

---

## 11. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| D23/D24 sem D25 | REAL | Mantém escopo aprovado e evita Analytics prematuro | [MB §11][MB §6/D25] |
| CoPilot via Action Request | REAL | CoPilot recomenda; não executa verdade econômica | [MB §6/D23][MB §10/Gate16] |
| ROI realizado reconstruível | REAL | Resultado medido por ledger/appointments/checkout/messages | [MB §6/D24][MB §10/Gate19] |
| Segment build run congelado | REAL | Campanha precisa público auditável | [MB §6/D24] |
| Segment definition tipado | REAL | Remove SQL livre e reduz risco cross-tenant no rebuild | [MB §7][SKILL §4] |
| Consent snapshot com seq | REAL | Mantém determinismo herdado do D21 e detecta drift antes do envio | [MB §6/D21][MB §6/D24] |
| Tags como insumo | REAL | Legado de tags não substitui CRM comportamental | [RM §4 #20–#21] |
| Loyalty rule sem benefício direto | REAL | D18 é dono de benefício real | [RM §4 #83][MB §6/D18] |
| Outbound via D21 | REAL | Campanha não bypassa mensageria/consentimento | [MB §6/D21][MB §6/D24] |
| Nenhum SQL Master | BLOQUEADO | Blueprint ainda incompleto; SQL só depois do Blueprint aprovado | [SKILL §6] |

---

## 12. Reflexion contra Definition of Done do Bloco G

| Item verificado | Resultado | Correção aplicada |
|---|---|---|
| Domínios 23 e 24 têm os 10 blocos obrigatórios | SIM | Sem correção |
| Toda tabela tenant-scoped tem RLS especificada | SIM | `REVOKE ALL` e roles técnicos herdados |
| CoPilot não executa Command soberano | SIM | Whitelist e Action Request obrigatório |
| Nenhum command financeiro, ledger, caixa, wallet, comissão ou fiscal na whitelist | SIM | Proibição explícita em §3.1 |
| ROI não é saldo | SIM | Fontes/hashes e rebuild run exigidos |
| CRM não envia mensagem direto | SIM | Enqueue por D21/Action Request |
| Consentimento por canal/finalidade respeitado | SIM | Freeze e enqueue validam D21 |
| Segmentação é auditável | SIM | `crm_segment_build_runs` + `crm_segment_members` |
| Definição de segmento não usa JSON livre | SIM | `shared.segment_definition_contract[]` + enums fechados |
| Consentimento de membros de segmento é determinístico | SIM | `consent_events_up_to_seq` + revalidação no enqueue |
| D25 não foi declarado entregue | SIM | Gate 19 apenas parcial |
| SQL Master não foi autorizado | SIM | Mantida fase Blueprint |

**Falhas encontradas antes da declaração:** G-01 e G-02 da auditoria v1 absorvidas; nenhuma falha bloqueante residual no escopo do Bloco G.  
**Limite explícito:** este arquivo não declara Analytics & Decision Intelligence, Fiscal/LGPD, Marketplace, Integrações, Multiunidade ou Governança final prontos.

Bloco G pronto para auditoria Red Team.

Pronto para auditoria Red Team.

---

## ANEXO H — SMART_FLOW_3_0_BLUEPRINT_BLOCO_H_v1_1.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco H

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco H — Domínios 25 e 26  
**Status:** v1.1 — ENTREGUE PARA AUDITORIA RED TEAM DO BLOCO H  
**Data:** 2026-06-11  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §0][MB §6/D25][MB §6/D26][MB §10][MB §11]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §4 #18][RM §4 #73][RM §4 #96][RM §4 #98–#99][RM §5/D25][RM §5/D26]  
**Fundação aprovada herdada:** Bloco A v2.1, Bloco B v2.1, Bloco C v1.2, Bloco D v1.2, Bloco E v1.1, Bloco F v1.1, Bloco G v1.1.
**Correção v1.1:** absorve H-01, H-02 e H-03 da auditoria Red Team do Bloco H v1.

---

## 0. Regra de autoridade e escopo

| Regra | Decisão do Bloco H | Fonte |
|---|---|---|
| Fonte de verdade | Dashboard, fiscal projection e LGPD workflow não criam verdade operacional paralela | [MB §7][MB §6/D25][MB §6/D26] |
| Analytics | Read models são reconstruíveis a partir de ledger, appointments, checkout, messaging, benefits e CRM aprovados | [MB §6/D25][MB §10/Gate19] |
| Fiscal | NFS-e, ISS, retenções e recibo de parceiro usam checkout/ledger/compensation como origem; não mutam saldo financeiro | [MB §6/D26][MB §10/Gate21] |
| LGPD | Consentimento legal, acesso, portabilidade e exclusão funcional têm trilha append-only | [MB §6/D26][MB §10/Gate21] |
| Tenant isolation | Todo objeto tenant-scoped usa `tenant_id`, FK composta quando cruza domínio e RLS por `hope.tenant_id` | [MB §7][RM §2] |
| REVOKE | `REVOKE ALL` explícito de `PUBLIC`, `anon`, `authenticated` em todos os objetos do bloco | [SKILL §4][RM §2] |
| SQL Master | Não autorizado nesta entrega; este arquivo é Blueprint, não migration executável | [SKILL §8] |

---

## 1. Escopo do Bloco H

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| H | 25 | Analytics & Decision Intelligence | Especificado | [MB §6/D25][RM §5/D25] |
| H | 26 | Fiscal & Compliance Brasil | Especificado | [MB §6/D26][RM §5/D26] |

**Fora do escopo:** D27 Marketplace, D28 Multiunidade Enterprise, D29 App White-Label, D30 Integration Platform e D31 Gate, QA & Governance. [MB §11]

---

## 2. Divergência formal de agrupamento

### DIVERGÊNCIA FORMAL H-00 — Bloco H operacional vs agrupamento original da skill

| Item | Regra / fato | Decisão desta rodada |
|---|---|---|
| Skill original | Agrupa D23, D24 e D25 como Inteligência; D26 aparece no bloco seguinte de Compliance. [SKILL §6] | Não será seguido literalmente nesta rodada. |
| Fluxo aprovado do projeto | D23–D24 já foram aprovados como Bloco G; usuário autorizou Bloco H como D25–D26. | Bloco H cobre D25 Analytics e D26 Fiscal/LGPD. |
| Ordem do Master Brief | Analytics vem antes de Fiscal & LGPD. [MB §11] | Ordem interna mantida: D25 depois D26. |
| Limite | D25 não declara D28 benchmarking enterprise completo; D26 não declara D30 Integration Platform completo. | Dependências futuras ficam expressas como dependências, não como entrega. |

**Veredito da divergência:** aceita nesta rodada por autorização do Platform Owner.  
**Limite:** nenhuma feature de D27–D31 é declarada entregue neste arquivo.

---

## 3. Contratos herdados do Bloco H

| Contrato herdado | Uso no Bloco H | Regra |
|---|---|---|
| `shared.structured_command_result` | Retorno padrão de Commands de rebuild, emissão fiscal e LGPD | Erro estruturado obrigatório [MB §7] |
| `shared.command_idempotency_keys` | Idempotência de mutações fiscais, LGPD e rebuilds manuais | Reexecução não duplica NFS-e, exportação ou request [SKILL §4] |
| `tenant_core.financial_transactions` / `ledger_entries` | Origem de receita, caixa, comissão, repasse e fiscal | Ledger é fonte, Analytics/Fiscal não alteram saldo [MB §6/D15][MB §6/D25] |
| `tenant_core.appointments` / checkout | Origem de ocupação, RevPAH, atendimento e NFS-e por atendimento | Sem cálculo no frontend [MB §6/D25][MB §6/D26] |
| `tenant_core.message_consent_events` | Estado operacional de consentimento por canal/finalidade | D26 complementa base legal e finalidade LGPD [MB §6/D21][MB §6/D26] |
| `tenant_core.compensation_rules` / payouts | Origem de recibos Lei do Salão Parceiro | D26 emite recibo, não calcula comissão paralela [MB §6/D17][MB §6/D26] |
| `tenant_core.outbox_events` | Emissão fiscal, exportação LGPD e rebuild concluído | Integração externa fica auditável [MB §10/Gate20] |
| `projection_checkpoints` / `read_model_refresh_log` | Reaproveitados como base de checkpoints/rebuilds | KEEP/MERGE sem duplicar engine [RM §4 #98–#99] |

---

## 4. Convenções canônicas do Bloco H

| Item | Regra | Fonte |
|---|---|---|
| Dinheiro | Valores monetários sempre `_cents bigint`; alíquotas, percentuais e probabilidades em `numeric` | [SKILL §4][MB §7] |
| Métrica | Métrica publicada vem de `analytics_metric_snapshots` append-only com `rebuild_run_id` e `source_hash` | [MB §10/Gate19] |
| Dashboard | Card referencia `metric_code`; não armazena SQL livre nem query dinâmica | [MB §6/D25][SKILL §4] |
| Rebuild | Todo rebuild tem janela de origem, dependências, status, hash e logs append-only | [RM §4 #98–#99][MB §10/Gate19] |
| Fiscal | NFS-e possui documento, status events e payload hash; status atual é projeção bloqueada contra UPDATE direto | [MB §6/D26][MB §10/Gate21] |
| LGPD | Exclusão é funcional: anonimiza/pseudonimiza dados apagáveis e preserva ledger/fiscal legalmente retido | [MB §6/D26][MB §10/Gate21] |
| Acesso sensível | Leitura de dado sensível gera `lgpd_access_logs` append-only | [MB §6/D26] |
| Export LGPD | Preview/exportação usam escopo tipado e ator validado; sem `p_actor_user_id`, sem leitura | [MB §6/D26][MB §10/Gate21][SKILL §4] |
| Lei do Salão Parceiro | Recibo referencia payout/ledger/compensation; não cria novo movimento financeiro | [MB §6/D26][MB §6/D17] |
| Provider fiscal | Tabelas são provider-agnostic; nenhum município/provedor específico é hardcoded no Blueprint | [MB §6/D26] |
| Multiunidade | Benchmark cross-unit completo depende de D28; D25 prepara escopo sem furar tenant | [MB §6/D25][MB §6/D28] |

---

## 5. Mapa Bloco H — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 034 | `shared` | 25/26 | Enums e tipos comuns de analytics, fiscal, LGPD e retenção | Gate 19 / Gate 21 |
| 035 | `tenant_core` | 25 | Catálogo de métricas, rebuild jobs, snapshots, cards e checkpoints | Gate 19 |
| 036 | `tenant_core` | 26 | Fiscal profiles, NFS-e, retenções, LGPD, retenção de dados e recibos de parceiro | Gate 21 |

---

## 6. DECISÕES PENDENTES resolvidas no Bloco H

### DECISÃO PENDENTE H-01 — Métricas como catálogo tipado, não SQL livre

| Alternativa | Desenho | Ledger | Isolamento tenant | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | `dashboard_cards` referencia `metric_code` fechado e snapshots reconstruíveis | Alto | Alto | Baixo | Média |
| B | `dashboard_cards` armazena SQL/JSON query customizável | Baixo | Baixo | Médio | Alta |
| C | Cada dashboard calcula em RPC própria sem catálogo | Médio | Médio | Alto | Baixa |

**Escolha:** Alternativa A.  
**Justificativa:** elimina SQL injection, mantém read model reconstruível e evita dashboard como fonte soberana. [MB §6/D25][MB §10/Gate19]  
**Descartes:** B descartada por SQL livre; C descartada por multiplicar engines e dificultar rebuild.

### DECISÃO PENDENTE H-02 — Exclusão LGPD sem corromper ledger/fiscal

| Alternativa | Desenho | Ledger | Isolamento tenant | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | Exclusão funcional com `lgpd_erasure_effects`, retenção legal e pseudonimização de campos apagáveis | Alto | Alto | Médio | Média |
| B | DELETE físico amplo de cliente e dependências | Baixo | Médio | Alto | Alta |
| C | Só marcar request como concluída sem alterar dados | Médio | Alto | Baixo | Alta |

**Escolha:** Alternativa A.  
**Justificativa:** atende exclusão/portabilidade sem quebrar ledger, NFS-e, recibos e auditoria legal. [MB §6/D26][MB §10/Gate21]  
**Descartes:** B destrói rastreabilidade financeira/fiscal; C é compliance decorativo.

### DECISÃO PENDENTE H-03 — Emissão fiscal provider-agnostic

| Alternativa | Desenho | Ledger | Isolamento tenant | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | `nfse_provider_profiles` e `nfse_provider_requests` provider-agnostic com payload hash e outbox | Alto | Alto | Médio | Média |
| B | Hardcode de provedores municipais no Blueprint | Médio | Médio | Alto | Baixa |
| C | Postergar fiscal para D30 Integration Platform | Baixo | Alto | Baixo | Alta |

**Escolha:** Alternativa A.  
**Justificativa:** MB exige NFS-e configurável antes de produção comercial; provider específico não está no MB e não será inventado. [MB §6/D26][MB §10/Gate21]  
**Descartes:** B inventa escopo não documentado; C viola criticidade fiscal antes de produção.

---

# Domínio 25 — Analytics & Decision Intelligence

## 25.1 Responsabilidade

D25 é dono do catálogo de métricas, rebuilds governados, snapshots analíticos, dashboards e sinais de decisão. Não é dono de ledger, agenda, checkout, caixa, comissão, benefício, campanha, fiscal, LGPD ou multiunidade enterprise. Dashboard não decide verdade; apenas expõe read models reconstruíveis a partir dos domínios aprovados. [MB §6/D25][MB §10/Gate19]

## 25.2 Tabelas

| Tabela | Propósito | Chaves / colunas canônicas | RLS |
|---|---|---|---|
| `tenant_core.analytics_metric_catalog` | Catálogo fechado de métricas permitidas | `id uuid PK`; `tenant_id uuid FK`; `metric_code shared.analytics_metric_code not null`; `metric_name text`; `metric_domain shared.analytics_metric_domain`; `value_kind shared.analytics_value_kind`; `source_domain_mask text[]`; `is_active boolean`; `created_at timestamptz`; `unique(tenant_id, metric_code)` | `tenant_admin/operator_manager/analytics_reader` SELECT; INSERT/UPDATE só `app_admin_executor`; DELETE proibido |
| `tenant_core.analytics_rebuild_jobs` | Execução governada de rebuild de read models | `id uuid PK`; `tenant_id uuid`; `job_kind shared.analytics_rebuild_job_kind`; `status shared.rebuild_status`; `source_window_start timestamptz`; `source_window_end timestamptz`; `requested_by_user_id uuid`; `started_at`; `finished_at`; `source_hash text`; `error_code text`; `idempotency_key text`; `unique(tenant_id, job_kind, idempotency_key)` | SELECT gestores/analytics; INSERT/UPDATE status só `app_worker_executor`; DELETE proibido |
| `tenant_core.analytics_rebuild_job_events` | Log append-only de etapas do rebuild | `id uuid PK`; `tenant_id uuid`; `rebuild_job_id uuid FK (tenant_id,id)`; `event_kind shared.rebuild_event_kind`; `event_payload_hash text`; `occurred_at timestamptz`; trigger bloqueia UPDATE/DELETE | SELECT gestores; INSERT worker; UPDATE/DELETE proibido |
| `tenant_core.analytics_read_models` | Definição de read model publicado | `id uuid PK`; `tenant_id uuid`; `read_model_code shared.analytics_read_model_code`; `metric_code shared.analytics_metric_code`; `grain shared.analytics_grain`; `owner_domain int`; `is_reconstructible boolean CHECK true`; `created_at`; `unique(tenant_id, read_model_code)` | SELECT analytics/admin; mutação só executor; DELETE lógico por `is_active=false` |
| `tenant_core.analytics_metric_snapshots` | Valores append-only por métrica/grão/janela | `id uuid PK`; `tenant_id uuid`; `metric_code shared.analytics_metric_code`; `grain shared.analytics_grain`; `subject_kind shared.analytics_subject_kind`; `subject_id uuid nullable`; `period_start timestamptz`; `period_end timestamptz`; `value_numeric numeric nullable`; `value_cents bigint nullable`; `value_count bigint nullable`; `rebuild_job_id uuid FK`; `source_hash text not null`; `created_at`; `CHECK period_end > period_start`; `CHECK exactly one value field not null`; unique `(tenant_id, metric_code, grain, subject_kind, subject_id, period_start, period_end, rebuild_job_id)` | SELECT analytics roles; INSERT worker; UPDATE/DELETE proibido |
| `tenant_core.dashboard_cards` | Configuração de cards permitidos | `id uuid PK`; `tenant_id uuid`; `card_code text`; `metric_code shared.analytics_metric_code`; `display_scope shared.dashboard_scope`; `visibility_role shared.dashboard_visibility_role`; `sort_order int`; `is_active boolean`; `created_at`; `CHECK card_code snake_case`; `unique(tenant_id, card_code)`; sem SQL/query livre | SELECT conforme role; INSERT/UPDATE admin; DELETE proibido, usar inactive |
| `tenant_core.dashboard_card_filters` | Filtros tipados de cards | `id uuid PK`; `tenant_id uuid`; `dashboard_card_id uuid FK (tenant_id,id)`; `filter_field shared.dashboard_filter_field`; `operator_kind shared.dashboard_filter_operator`; `value_1 text`; `value_2 text nullable`; sem SQL livre | SELECT conforme card; mutação admin; DELETE proibido, usar inactive |
| `tenant_core.scheduling_roi_snapshots` | ROI da agenda SMART Scheduling | `id uuid PK`; `tenant_id uuid`; `period_start`; `period_end`; `appointments_impacted_count bigint CHECK >=0`; `incremental_revenue_cents bigint CHECK >=0`; `idle_time_reduced_minutes bigint CHECK >=0`; `rebuild_job_id uuid FK`; `source_hash text`; append-only | SELECT managers; INSERT worker; UPDATE/DELETE proibido |
| `tenant_core.revpah_snapshots` | Receita por hora disponível | `id uuid PK`; `tenant_id uuid`; `resource_scope shared.analytics_subject_kind`; `subject_id uuid nullable`; `period_start`; `period_end`; `revenue_cents bigint CHECK >=0`; `available_minutes bigint CHECK >=0`; `occupied_minutes bigint CHECK >=0`; `revpah_cents bigint CHECK >=0`; `rebuild_job_id uuid`; `source_hash text`; append-only | SELECT managers/staff próprio quando subject staff; INSERT worker; UPDATE/DELETE proibido |
| `tenant_core.analytics_projection_checkpoints` | Reaproveita `projection_checkpoints` como checkpoints por domínio | `id uuid PK`; `tenant_id uuid`; `checkpoint_kind shared.analytics_checkpoint_kind`; `source_domain int`; `last_source_id uuid`; `last_source_occurred_at timestamptz`; `rebuild_job_id uuid`; `created_at`; `unique(tenant_id, checkpoint_kind, source_domain)` | SELECT worker/admin; UPSERT só worker com auditoria; DELETE proibido |
| `tenant_core.analytics_drift_findings` | Drift entre snapshot publicado e reconstrução | `id uuid PK`; `tenant_id uuid`; `metric_code`; `snapshot_id uuid`; `expected_hash text`; `actual_hash text`; `severity shared.drift_severity`; `detected_at`; `resolved_at nullable` | SELECT admins; INSERT worker; UPDATE resolution worker; DELETE proibido |
| `tenant_core.decision_insight_events` | Insights/recomendações analíticas sem execução | `id uuid PK`; `tenant_id uuid`; `insight_kind shared.decision_insight_kind`; `source_metric_snapshot_id uuid FK`; `target_domain int`; `risk_level shared.action_request_risk_level`; `summary text`; `created_at`; append-only | SELECT managers; INSERT worker; UPDATE/DELETE proibido |

**Constraints críticas de D25:**

| Constraint | Regra |
|---|---|
| Sem SQL livre | `dashboard_cards` e `dashboard_card_filters` não têm campo query/sql/json de expressão executável |
| Snapshot append-only | `analytics_metric_snapshots`, `scheduling_roi_snapshots`, `revpah_snapshots`, `decision_insight_events` bloqueiam UPDATE/DELETE por trigger |
| Rebuild obrigatório | Todo snapshot publicado referencia `analytics_rebuild_jobs.id` do mesmo `tenant_id` |
| Valor único | Cada snapshot usa exatamente um campo de valor: `value_numeric`, `value_cents` ou `value_count` |
| Staff privacy | Snapshot por `subject_kind='staff'` só é visível ao próprio staff ou gestor com permissão explícita; cockpit de owner usa função DEFINER com agregação/anonimização |
| Multiunidade futura | Qualquer subject cross-unit exige D28; antes de D28, subject fica restrito ao tenant atual |

## 25.3 Enums e tipos

| Enum / tipo | Valores |
|---|---|
| `shared.analytics_metric_code` | `occupancy_rate`, `revpah`, `gross_revenue`, `net_revenue`, `margin`, `average_ticket`, `recurrence_rate`, `churn_rate`, `no_show_rate`, `schedule_roi`, `cash_difference`, `commission_total`, `benefit_consumption`, `campaign_roi`, `staff_production`, `staff_occupancy`, `wallet_liability`, `tax_issued_total`, `nfse_pending_count` |
| `shared.analytics_metric_domain` | `agenda`, `financial`, `cash`, `staff`, `benefit`, `crm`, `messaging`, `fiscal`, `tenant_health` |
| `shared.analytics_value_kind` | `numeric_ratio`, `amount_cents`, `count`, `minutes`, `score` |
| `shared.analytics_grain` | `hour`, `day`, `week`, `month`, `quarter`, `year`, `custom_window` |
| `shared.analytics_subject_kind` | `tenant`, `staff`, `service`, `resource`, `client_segment`, `campaign`, `cash_register`, `unit_pending_d28` |
| `shared.analytics_read_model_code` | `owner_cockpit`, `staff_dashboard`, `financial_dashboard`, `scheduling_roi`, `retention_dashboard`, `fiscal_dashboard` |
| `shared.analytics_rebuild_job_kind` | `full_rebuild`, `incremental_rebuild`, `metric_backfill`, `drift_check`, `checkpoint_repair` |
| `shared.rebuild_status` | `queued`, `running`, `completed`, `failed`, `cancelled`, `superseded` |
| `shared.rebuild_event_kind` | `queued`, `started`, `source_scanned`, `snapshot_written`, `checkpoint_written`, `drift_detected`, `completed`, `failed` |
| `shared.dashboard_scope` | `owner`, `manager`, `staff`, `finance`, `compliance` |
| `shared.dashboard_visibility_role` | `tenant_owner`, `tenant_admin`, `manager`, `finance_manager`, `staff_self`, `compliance_officer` |
| `shared.dashboard_filter_field` | `staff_id`, `service_id`, `resource_id`, `campaign_id`, `period`, `metric_domain`, `subject_kind` |
| `shared.dashboard_filter_operator` | `eq`, `in`, `between`, `is_null`, `is_not_null` |
| `shared.analytics_checkpoint_kind` | `ledger`, `appointment`, `checkout`, `payment`, `cash`, `benefit`, `message`, `crm`, `fiscal` |
| `shared.drift_severity` | `low`, `medium`, `high`, `critical` |
| `shared.decision_insight_kind` | `occupancy_drop`, `revpah_drop`, `margin_drop`, `cash_anomaly`, `churn_spike`, `campaign_underperforming`, `nfse_backlog`, `benefit_liability_growth` |

## 25.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_queue_analytics_rebuild` | `(p_job_kind shared.analytics_rebuild_job_kind, p_source_window_start timestamptz, p_source_window_end timestamptz, p_metric_codes shared.analytics_metric_code[], p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | tenant_admin, manager autorizado, app_worker |
| `tenant_core.command_run_analytics_rebuild_job` | `(p_rebuild_job_id uuid, p_worker_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |
| `tenant_core.command_publish_metric_snapshot` | `(p_rebuild_job_id uuid, p_metric_code shared.analytics_metric_code, p_grain shared.analytics_grain, p_subject_kind shared.analytics_subject_kind, p_subject_id uuid, p_period_start timestamptz, p_period_end timestamptz, p_value_numeric numeric, p_value_cents bigint, p_value_count bigint, p_source_hash text, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |
| `tenant_core.read_owner_cockpit` | `(p_actor_user_id uuid, p_period_start timestamptz, p_period_end timestamptz) returns shared.structured_command_result` | DEFINER | tenant_owner/admin/manager autorizado |
| `tenant_core.read_staff_dashboard` | `(p_actor_user_id uuid, p_staff_id uuid, p_period_start timestamptz, p_period_end timestamptz) returns shared.structured_command_result` | DEFINER | staff_self ou manager autorizado |
| `tenant_core.command_detect_analytics_drift` | `(p_metric_code shared.analytics_metric_code, p_period_start timestamptz, p_period_end timestamptz, p_worker_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |
| `tenant_core.command_record_decision_insight` | `(p_insight_kind shared.decision_insight_kind, p_source_metric_snapshot_id uuid, p_target_domain int, p_risk_level shared.action_request_risk_level, p_summary text, p_worker_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |

### 25.4.1 Pré-condições obrigatórias dos Commands D25

| Command | Pré-condições |
|---|---|
| `command_queue_analytics_rebuild` | Janela temporal válida; actor possui permissão analytics; `p_metric_codes` pertence ao catálogo; idempotência por tenant/job/window |
| `command_run_analytics_rebuild_job` | Job do mesmo tenant; status `queued`; worker assume lock transacional no job antes de ler fontes; grava eventos append-only |
| `command_publish_metric_snapshot` | Rebuild job `running`; hash de origem preenchido; exatamente um valor informado; período válido; subject pertence ao tenant; staff subject respeita privacidade |
| `read_owner_cockpit` | Actor validado por `p_actor_user_id`; SECURITY DEFINER; não retorna raw table; snapshots `subject_kind=staff` são agregados/anonimizados, exceto quando o ator possui permissão explícita `analytics.staff_individual.read`; sem permissão retorna `VALIDATION_FAILED` com `ANALYTICS_STAFF_PRIVACY_DENIED` |
| `read_staff_dashboard` | Actor validado por `p_actor_user_id`; se actor é staff, `p_staff_id` precisa mapear para o próprio staff; gestor autorizado pode ler equipe apenas quando possui permissão de produção individual; financeiros privados seguem regra D17; não retorna raw table |
| `command_detect_analytics_drift` | Recalcula fonte aprovada; não corrige snapshot por UPDATE; cria drift finding e agenda rebuild se necessário |
| `command_record_decision_insight` | Insight não executa Command; se ação for necessária, deve passar por D23/D31 Action Request permitido |

## 25.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| Todas D25 | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |
| Todas D25 | SELECT | tenant_owner, tenant_admin, manager, analytics_reader | `tenant_id = current_setting('hope.tenant_id')::uuid` |
| `analytics_metric_snapshots` staff | SELECT | staff_self e gestor com permissão explícita | `tenant_id = hope.tenant_id AND subject_kind='staff' AND (subject_id = staff_id_do_actor OR actor_has_permission('analytics.staff_individual.read'))`; owner sem essa permissão recebe apenas agregado via `read_owner_cockpit` DEFINER |
| `analytics_rebuild_jobs` | INSERT/UPDATE | app_worker_executor, app_admin_executor | valida tenant context e permissão interna |
| Snapshots append-only | INSERT | app_worker_executor | Somente por Command; trigger bloqueia UPDATE/DELETE |
| `dashboard_cards` | INSERT/UPDATE | tenant_admin/app_admin_executor | Sem SQL livre; card apenas referencia métrica tipada |
| `analytics_drift_findings` | UPDATE | app_worker_executor | Só campos de resolução; sem apagar histórico |

## 25.6 Invariantes

| # | Invariante | Fonte |
|---:|---|---|
| 1 | Dashboard não decide verdade; apenas lê snapshots reconstruíveis | [MB §6/D25] |
| 2 | Todo snapshot publicado referencia rebuild job do mesmo tenant e source hash | [MB §10/Gate19] |
| 3 | Nenhum card contém SQL, nome de tabela, nome de coluna livre ou expressão executável | [SKILL §4] |
| 4 | Métrica financeira realizada vem de D12–D17; D25 não calcula saldo independente | [MB §6/D15][MB §6/D25] |
| 5 | ROI da agenda é reconstruível a partir de appointments, holds, checkout e ledger | [MB §6/D25][MB §10/Gate19] |
| 6 | Staff vê apenas métricas próprias quando a métrica é individual; owner recebe agregado/anonimizado salvo permissão explícita `analytics.staff_individual.read` | [MB §6/D17][MB §7] |
| 7 | Drift nunca é corrigido por UPDATE direto em snapshot; gera finding + novo rebuild | [RM §4 #99] |
| 8 | Benchmark cross-unit não cruza tenant antes de D28 | [MB §6/D28] |

## 25.7 Eventos outbox

| event_type | Quando emite | Payload mínimo |
|---|---|---|
| `analytics_rebuild_queued` | Job criado | `tenant_id`, `rebuild_job_id`, `job_kind`, `window` |
| `analytics_rebuild_completed` | Job concluído | `tenant_id`, `rebuild_job_id`, `source_hash`, `snapshot_count` |
| `analytics_rebuild_failed` | Job falha | `tenant_id`, `rebuild_job_id`, `error_code` |
| `analytics_drift_detected` | Drift encontrado | `tenant_id`, `metric_code`, `snapshot_id`, `severity` |
| `decision_insight_recorded` | Insight criado | `tenant_id`, `insight_id`, `insight_kind`, `target_domain` |

## 25.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | D01, D02, D05, D07, D08, D12–D18, D21, D23, D24 |
| Consumido por | D27 marketplace, D28 multiunidade, D31 gates, UI cockpit |
| Não substitui | Ledger, agenda, checkout, CRM, fiscal ou LGPD |

## 25.9 Gate correspondente

| Gate | Asserções do Bloco H |
|---|---|
| Gate 19 — Analytics Rebuild | Rebuild job reconstrói snapshots a partir de ledger e appointments; snapshots têm source hash; drift gera finding; cards não possuem query livre |
| Gate 18 — Cash Register Integrity | Apenas consumo de métricas de caixa já aprovadas; não reabre caixa nem altera ledger |
| Gate 21 — Fiscal & LGPD Compliance | Fiscal dashboard lê D26; não emite documento nem altera estado fiscal |

## 25.10 RAGOV do domínio

| Item | Classificação | Justificativa |
|---|---|---|
| Métricas core de cockpit | PARCIAL MVP | MB declara PARCIAL MVP para métricas core [MB §6/D25] |
| Rebuild governado | REAL | Necessário para Gate 19 [MB §10/Gate19] |
| Projeção estatística de demanda | PARCIAL | Só após dados históricos suficientes [MB §6/D25] |
| Benchmark multiunidade | PENDENTE DE D28 | Preparado sem cross-tenant; entrega completa no domínio Multiunidade [MB §6/D28] |

---

# Domínio 26 — Fiscal & Compliance Brasil

## 26.1 Responsabilidade

D26 é dono de configuração fiscal brasileira, emissão e rastreio de NFS-e, regras de ISS/retenção, LGPD, retenção de dados, logs de acesso sensível, portabilidade, exclusão funcional, relatório de impacto e recibos da Lei do Salão Parceiro. Não é dono de ledger, pagamento, checkout, comissão, payout, mensageria operacional ou Integration Platform genérica. [MB §6/D26][MB §10/Gate21]

## 26.2 Tabelas

| Tabela | Propósito | Chaves / colunas canônicas | RLS |
|---|---|---|---|
| `tenant_core.fiscal_profiles` | Perfil fiscal vigente do tenant | `id uuid PK`; `tenant_id uuid`; `legal_name text`; `tax_document text encrypted`; `tax_regime shared.tax_regime_kind`; `municipality_code text`; `state_code text`; `service_tax_code text`; `effective_period daterange`; `is_active boolean`; `created_at`; EXCLUDE gist `(tenant_id WITH =, effective_period WITH &&) WHERE is_active=true` | SELECT compliance/finance; mutação compliance_admin; DELETE proibido |
| `tenant_core.fiscal_profile_versions` | Histórico append-only de mudanças fiscais | `id uuid PK`; `tenant_id`; `fiscal_profile_id uuid FK`; `version_seq bigint`; `change_reason text`; `payload_hash text`; `created_by_user_id`; `created_at`; trigger bloqueia UPDATE/DELETE | SELECT compliance; INSERT Command; UPDATE/DELETE proibido |
| `tenant_core.municipal_tax_rules` | Regras de ISS por município/serviço | `id uuid PK`; `tenant_id`; `municipality_code text`; `service_tax_code text`; `iss_rate numeric CHECK between 0 and 1`; `effective_period daterange`; `source_kind shared.tax_rule_source_kind`; `payload_hash`; EXCLUDE gist por município/serviço/período | SELECT finance/compliance; mutação compliance_admin |
| `tenant_core.tax_retention_rules` | Regras de retenção aplicáveis | `id uuid PK`; `tenant_id`; `tax_kind shared.tax_kind`; `applies_to_regime shared.tax_regime_kind`; `rate numeric CHECK between 0 and 1`; `minimum_base_cents bigint CHECK >=0`; `effective_period daterange`; `is_active`; EXCLUDE gist por tax/regime/período ativo | SELECT finance; mutação compliance_admin |
| `tenant_core.nfse_batches` | Lotes de emissão NFS-e | `id uuid PK`; `tenant_id`; `batch_number text`; `fiscal_profile_id uuid FK`; `status shared.nfse_batch_status`; `current_status_rebuild_run_id uuid nullable`; `created_by_user_id`; `created_at`; `unique(tenant_id,batch_number)` | SELECT finance/compliance; INSERT Command; UPDATE status só worker controlado; DELETE proibido |
| `tenant_core.nfse_documents` | Documento NFS-e por atendimento/lote | `id uuid PK`; `tenant_id`; `nfse_batch_id uuid FK nullable`; `source_kind shared.nfse_source_kind`; `checkout_session_id uuid FK (tenant_id,id) nullable`; `financial_transaction_id uuid FK (tenant_id,id)`; `client_id uuid FK (tenant_id,id) nullable`; `gross_amount_cents bigint CHECK >=0`; `deduction_cents bigint CHECK >=0`; `tax_base_cents bigint CHECK >=0`; `iss_rate numeric CHECK (iss_rate >= 0 AND iss_rate <= 1)`; `iss_amount_cents bigint CHECK >=0`; `provider_document_number text nullable`; `current_status shared.nfse_document_status`; `current_status_rebuild_run_id uuid nullable`; `payload_hash text`; unique `(tenant_id, source_kind, checkout_session_id) WHERE checkout_session_id IS NOT NULL` | SELECT finance/compliance; INSERT Command; direct UPDATE current_status bloqueado; DELETE proibido |
| `tenant_core.nfse_document_status_events` | Status append-only do documento | `id uuid PK`; `tenant_id`; `nfse_document_id uuid FK (tenant_id,id)`; `status shared.nfse_document_status`; `provider_protocol text nullable`; `event_payload_hash text`; `occurred_at timestamptz`; trigger bloqueia UPDATE/DELETE | SELECT finance/compliance; INSERT worker/Command; UPDATE/DELETE proibido |
| `tenant_core.nfse_status_rebuild_runs` | Rebuild auditável de status NFS-e | `id uuid PK`; `tenant_id`; `started_at`; `finished_at`; `status shared.rebuild_status`; `source_hash`; `documents_checked_count bigint`; append-only | SELECT compliance; INSERT worker; UPDATE/DELETE proibido |
| `tenant_core.nfse_provider_profiles` | Configuração provider-agnostic de NFS-e | `id uuid PK`; `tenant_id`; `fiscal_profile_id uuid FK`; `provider_kind text`; `environment shared.fiscal_provider_environment`; `credential_ref text encrypted`; `is_active`; `effective_period daterange`; sem provider hardcoded | SELECT compliance; mutação compliance_admin; DELETE proibido |
| `tenant_core.nfse_provider_requests` | Requisições fiscais externas auditáveis | `id uuid PK`; `tenant_id`; `nfse_document_id uuid FK`; `request_kind shared.nfse_provider_request_kind`; `request_payload_hash text`; `response_payload_hash text nullable`; `status shared.provider_request_status`; `idempotency_key text`; `created_at`; `unique(tenant_id, request_kind, idempotency_key)` | SELECT compliance; INSERT/UPDATE worker; DELETE proibido |
| `tenant_core.lgpd_consent_purposes` | Catálogo de finalidades e bases legais | `id uuid PK`; `tenant_id`; `purpose_code shared.lgpd_purpose_code`; `legal_basis shared.lgpd_legal_basis`; `description text`; `is_active`; `effective_period daterange`; `unique(tenant_id,purpose_code,effective_period)` | SELECT tenant; mutação compliance_admin |
| `tenant_core.lgpd_data_subject_requests` | Requests de titular: acesso, portabilidade, exclusão | `id uuid PK`; `tenant_id`; `request_kind shared.lgpd_request_kind`; `data_subject_kind shared.data_subject_kind`; `data_subject_id uuid`; `requester_identity_hash text`; `status shared.lgpd_request_status`; `current_status_rebuild_run_id uuid nullable`; `due_at timestamptz`; `created_at`; `idempotency_key text`; `unique(tenant_id,request_kind,requester_identity_hash,idempotency_key)` | SELECT compliance; INSERT portal/Command; UPDATE status bloqueado fora worker; DELETE proibido |
| `tenant_core.lgpd_request_status_events` | Status append-only de request LGPD | `id uuid PK`; `tenant_id`; `request_id uuid FK (tenant_id,id)`; `status shared.lgpd_request_status`; `reason_code text`; `actor_user_id uuid nullable`; `occurred_at`; trigger bloqueia UPDATE/DELETE | SELECT compliance; INSERT Command/worker; UPDATE/DELETE proibido |
| `tenant_core.lgpd_export_bundles` | Pacotes de portabilidade | `id uuid PK`; `tenant_id`; `request_id uuid FK`; `bundle_uri_ref text encrypted`; `bundle_hash text`; `expires_at timestamptz`; `created_at`; `downloaded_at nullable`; append-only | SELECT compliance e titular via token; INSERT worker; UPDATE limitado downloaded_at; DELETE proibido |
| `tenant_core.lgpd_erasure_effects` | Efeitos de exclusão funcional por domínio | `id uuid PK`; `tenant_id`; `request_id uuid FK`; `domain_number int`; `entity_kind text`; `entity_id uuid`; `effect_kind shared.erasure_effect_kind`; `legal_hold_reason text nullable`; `payload_hash_before text`; `payload_hash_after text`; `applied_at`; append-only | SELECT compliance; INSERT worker; UPDATE/DELETE proibido |
| `tenant_core.lgpd_access_logs` | Log de acesso a dados sensíveis | `id uuid PK`; `tenant_id`; `actor_user_id uuid`; `accessed_subject_kind shared.data_subject_kind`; `accessed_subject_id uuid`; `purpose_code shared.lgpd_purpose_code`; `access_kind shared.lgpd_access_kind`; `source_domain int`; `occurred_at`; `request_id uuid nullable`; append-only | SELECT compliance_auditor; INSERT trigger/RPC; UPDATE/DELETE proibido |
| `tenant_core.data_retention_policies` | Políticas de retenção por domínio/tipo | `id uuid PK`; `tenant_id`; `domain_number int`; `entity_kind text`; `retention_basis shared.retention_basis_kind`; `retain_for_interval interval`; `action_after_retention shared.retention_action_kind`; `is_active`; `effective_period daterange` | SELECT compliance; mutação compliance_admin |
| `tenant_core.data_retention_runs` | Execução de retenção/pseudonimização | `id uuid PK`; `tenant_id`; `policy_id uuid FK`; `status shared.rebuild_status`; `entities_scanned_count bigint`; `entities_affected_count bigint`; `source_hash`; `started_at`; `finished_at`; append-only | SELECT compliance; INSERT worker; UPDATE/DELETE proibido |
| `tenant_core.privacy_impact_assessments` | Relatório de impacto por domínio/finalidade | `id uuid PK`; `tenant_id`; `domain_number int`; `purpose_code shared.lgpd_purpose_code`; `risk_level shared.privacy_risk_level`; `mitigation_summary text`; `approved_by_user_id uuid nullable`; `approved_at nullable`; `version_seq bigint`; append-only por versão | SELECT compliance; INSERT/approve compliance_admin; DELETE proibido |
| `tenant_core.partner_law_receipts` | Recibos Lei do Salão Parceiro | `id uuid PK`; `tenant_id`; `staff_id uuid FK (tenant_id,id)`; `payout_batch_id uuid FK (tenant_id,id) nullable`; `financial_transaction_id uuid FK (tenant_id,id)`; `gross_service_revenue_cents bigint CHECK >=0`; `partner_share_cents bigint CHECK >=0`; `salon_share_cents bigint CHECK >=0`; `receipt_status shared.partner_receipt_status`; `payload_hash text`; `issued_at nullable`; unique `(tenant_id,payout_batch_id,staff_id) WHERE payout_batch_id IS NOT NULL` | SELECT staff próprio/compliance/finance; INSERT Command; direct status UPDATE bloqueado; DELETE proibido |
| `tenant_core.partner_receipt_status_events` | Status append-only do recibo parceiro | `id uuid PK`; `tenant_id`; `partner_law_receipt_id uuid FK (tenant_id,id)`; `status shared.partner_receipt_status`; `occurred_at`; `payload_hash`; trigger bloqueia UPDATE/DELETE | SELECT staff próprio/finance; INSERT worker/Command; UPDATE/DELETE proibido |

**Constraints críticas de D26:**

| Constraint | Regra |
|---|---|
| Fiscal profile efetivo | `fiscal_profiles` ativos não podem ter períodos sobrepostos por tenant |
| NFS-e sem origem duplicada | Um checkout fechado gera no máximo uma NFS-e ativa por tenant/source |
| NFS-e não altera ledger | Documento referencia `financial_transaction_id` já postado; não cria lançamento financeiro |
| Status projetado | `nfse_documents.current_status`, `nfse_batches.status` e `lgpd_data_subject_requests.status` são projeções de eventos; direct UPDATE bloqueado |
| LGPD append-only | Requests, status events, access logs, erasure effects e export bundles não são apagados fisicamente |
| Exclusão funcional | Dados com obrigação fiscal/ledger/legal hold recebem `effect_kind='retained_legal_hold'`; dados apagáveis recebem pseudonimização registrada |
| Recibo parceiro | `partner_law_receipts` referencia payout/financial transaction; não recalcula comissão independente |
| Taxas | `iss_rate` e retenções usam `numeric`; valores monetários derivados em `_cents bigint`; todo snapshot de alíquota em documento repete CHECK 0..1 |

## 26.3 Enums e tipos

| Enum / tipo | Valores |
|---|---|
| `shared.tax_regime_kind` | `mei`, `simples_nacional`, `lucro_presumido` |
| `shared.tax_kind` | `iss`, `irrf`, `pis`, `cofins`, `csll`, `inss`, `other_retention` |
| `shared.tax_rule_source_kind` | `tenant_config`, `municipal_table`, `manual_compliance_review` |
| `shared.nfse_source_kind` | `checkout_session`, `manual_legal_adjustment`, `batch_service_period` |
| `shared.nfse_batch_status` | `draft`, `queued`, `sent`, `partially_authorized`, `authorized`, `rejected`, `cancelled`, `failed` |
| `shared.nfse_document_status` | `draft`, `queued`, `sent`, `authorized`, `rejected`, `cancel_requested`, `cancelled`, `failed`, `superseded` |
| `shared.fiscal_provider_environment` | `sandbox`, `production` |
| `shared.nfse_provider_request_kind` | `issue_nfse`, `cancel_nfse`, `query_status`, `download_xml`, `download_pdf` |
| `shared.provider_request_status` | `queued`, `sent`, `acknowledged`, `completed`, `failed`, `retry_scheduled` |
| `shared.lgpd_purpose_code` | `service_delivery`, `billing`, `fiscal_compliance`, `marketing`, `messaging_operational`, `analytics_internal`, `ai_assistance`, `legal_defense`, `partner_law_compliance` |
| `shared.lgpd_legal_basis` | `consent`, `contract_execution`, `legal_obligation`, `legitimate_interest`, `credit_protection`, `judicial_regular_exercise` |
| `shared.lgpd_request_kind` | `access`, `portability`, `correction`, `erasure`, `consent_revocation`, `processing_opposition`, `confirmation_of_processing` |
| `shared.data_subject_kind` | `client`, `staff`, `tenant_user`, `partner_professional`, `platform_contact` |
| `shared.lgpd_request_status` | `received`, `identity_verification_required`, `verified`, `in_progress`, `waiting_legal_review`, `fulfilled`, `partially_fulfilled`, `rejected`, `expired`, `cancelled` |
| `shared.erasure_effect_kind` | `pseudonymized`, `deleted_non_financial`, `retained_legal_hold`, `retained_fiscal_obligation`, `not_found`, `skipped_not_allowed` |
| `shared.lgpd_access_kind` | `read_profile`, `read_financial`, `read_health_sensitive_note`, `export`, `erasure_review`, `support_access`, `audit_review` |
| `shared.lgpd_export_domain_scope` | `identity_profile`, `appointments`, `checkout_history`, `benefits`, `messaging_metadata`, `consent_history`, `fiscal_documents`, `partner_law_receipts`, `support_requests` |
| `shared.lgpd_export_field_kind` | `subject_identity`, `contact_data`, `appointment_summary`, `financial_summary`, `benefit_history`, `consent_event`, `fiscal_document_ref`, `receipt_ref`, `support_ticket_summary` |
| `shared.lgpd_export_scope` | Tipo composto: `domain_scope shared.lgpd_export_domain_scope`; `field_kind shared.lgpd_export_field_kind`; `include_payload boolean`; `requires_legal_hold_check boolean`; `redaction_policy text`; SQL livre, nome de tabela livre, coluna livre, segredo interno e credential ref são proibidos |
| `shared.retention_basis_kind` | `legal_obligation`, `contract`, `consent`, `legitimate_interest`, `audit`, `fiscal` |
| `shared.retention_action_kind` | `pseudonymize`, `delete_non_financial`, `archive_restricted`, `retain_legal_hold` |
| `shared.privacy_risk_level` | `low`, `medium`, `high`, `critical` |
| `shared.partner_receipt_status` | `draft`, `issued`, `delivered`, `acknowledged`, `cancelled`, `superseded` |

## 26.4 RPCs / Funções

| Função | Assinatura completa | SECURITY | Quem chama |
|---|---|---|---|
| `tenant_core.command_upsert_fiscal_profile` | `(p_tax_regime shared.tax_regime_kind, p_legal_name text, p_tax_document text, p_municipality_code text, p_state_code text, p_service_tax_code text, p_effective_period daterange, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | compliance_admin |
| `tenant_core.command_configure_municipal_tax_rule` | `(p_municipality_code text, p_service_tax_code text, p_iss_rate numeric, p_effective_period daterange, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | compliance_admin |
| `tenant_core.command_prepare_nfse_document` | `(p_checkout_session_id uuid, p_financial_transaction_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | finance_manager/compliance_admin/app_worker |
| `tenant_core.command_enqueue_nfse_issue` | `(p_nfse_document_id uuid, p_provider_profile_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | finance_manager/compliance_admin/app_worker |
| `tenant_core.command_record_nfse_provider_status` | `(p_nfse_document_id uuid, p_status shared.nfse_document_status, p_provider_protocol text, p_event_payload_hash text, p_worker_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |
| `tenant_core.command_rebuild_nfse_status` | `(p_nfse_document_id uuid, p_worker_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |
| `tenant_core.command_create_lgpd_request` | `(p_request_kind shared.lgpd_request_kind, p_data_subject_kind shared.data_subject_kind, p_data_subject_id uuid, p_requester_identity_hash text, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | portal/backend/compliance_admin |
| `tenant_core.command_record_lgpd_request_status` | `(p_request_id uuid, p_status shared.lgpd_request_status, p_reason_code text, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | compliance_admin/app_worker |
| `tenant_core.command_build_lgpd_export_bundle` | `(p_request_id uuid, p_export_scope shared.lgpd_export_scope[], p_worker_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |
| `tenant_core.command_apply_lgpd_erasure` | `(p_request_id uuid, p_worker_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | app_worker_executor |
| `tenant_core.command_log_sensitive_access` | `(p_actor_user_id uuid, p_accessed_subject_kind shared.data_subject_kind, p_accessed_subject_id uuid, p_purpose_code shared.lgpd_purpose_code, p_access_kind shared.lgpd_access_kind, p_source_domain int, p_request_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | backend triggers/RPCs |
| `tenant_core.command_issue_partner_law_receipt` | `(p_staff_id uuid, p_payout_batch_id uuid, p_financial_transaction_id uuid, p_actor_user_id uuid, p_idempotency_key text) returns shared.structured_command_result` | DEFINER | finance_manager/compliance_admin |
| `tenant_core.read_lgpd_subject_export_preview` | `(p_request_id uuid, p_actor_user_id uuid) returns shared.structured_command_result` | DEFINER | compliance_admin/titular autenticado |

### 26.4.1 Pré-condições obrigatórias dos Commands D26

| Command | Pré-condições |
|---|---|
| `command_upsert_fiscal_profile` | Actor compliance; período sem overlap ativo; tax document criptografado; version event append-only |
| `command_configure_municipal_tax_rule` | Alíquota entre 0 e 1; período sem overlap para município/serviço; não altera documentos já autorizados |
| `command_prepare_nfse_document` | Checkout pertence ao tenant; checkout fechado; `financial_transaction_id` postado e balanceado; fiscal profile ativo; sem NFS-e duplicada para origem |
| `command_enqueue_nfse_issue` | Documento `draft/queued`; provider profile ativo no mesmo tenant; outbox fiscal emitido; idempotência por documento/request |
| `command_record_nfse_provider_status` | Status recebido por worker autorizado; evento append-only; status atual reconstruído por `command_rebuild_nfse_status`; direct UPDATE proibido |
| `command_create_lgpd_request` | Titular pertence ao tenant; request kind permitido; prazo `due_at` calculado no backend; status inicial por evento append-only |
| `command_build_lgpd_export_bundle` | Request verificado; `p_export_scope` contém apenas `shared.lgpd_export_scope[]` allowlisted; bundle inclui somente domínios/campos exportáveis; exclui segredos internos, credential refs, hashes operacionais internos e prompts; hash e expiração obrigatórios |
| `read_lgpd_subject_export_preview` | Exige `p_actor_user_id`; valida que o ator é `compliance_admin` do tenant OU o próprio titular autenticado com `requester_identity_hash` compatível; sem autorização retorna `VALIDATION_FAILED` com `LGPD_ACTOR_NOT_AUTHORIZED`; preview usa `shared.lgpd_export_scope[]` e grava `lgpd_access_logs` antes de expor PII |
| `command_apply_lgpd_erasure` | Request verificado; avalia retention policies; não apaga ledger, NFS-e, recibo, payout ou auditoria legal; grava `lgpd_erasure_effects` |
| `command_log_sensitive_access` | Toda leitura sensível por RPC chama este Command ou trigger equivalente; falha de log bloqueia leitura sensível |
| `command_issue_partner_law_receipt` | Payout/financial transaction do mesmo tenant; valores reconstruídos de D17/D15; recibo não cria movimento financeiro |

## 26.5 Políticas RLS

| Tabela | Operação | Papel | Política |
|---|---|---|---|
| Todas D26 | ALL | PUBLIC, anon, authenticated | `REVOKE ALL` explícito |
| Tabelas fiscais | SELECT | finance_manager, compliance_admin, tenant_owner | `tenant_id = hope.tenant_id` e permissão fiscal |
| Tabelas fiscais | INSERT/UPDATE | compliance_admin, app_worker_executor | Somente via Command; DELETE proibido |
| `nfse_documents` | SELECT | client portal limitado | Apenas documento próprio quando exposto por token seguro; sem dados de outro cliente |
| LGPD requests | SELECT | compliance_admin, titular autenticado | Compliance vê tenant; titular vê somente próprio request validado por ator/identity hash; preview/export não aceita request sem `p_actor_user_id` |
| `lgpd_access_logs` | SELECT | compliance_auditor | Logs sensíveis; staff comum não lê |
| `lgpd_access_logs` | INSERT | backend/app_worker | Append-only; UPDATE/DELETE proibido |
| `partner_law_receipts` | SELECT | staff_self, finance_manager, compliance_admin | Staff só recibos próprios; gestor autorizado vê tenant |
| Status events | INSERT | app_worker_executor/Command | Append-only com tenant context validado |

## 26.6 Invariantes

| # | Invariante | Fonte |
|---:|---|---|
| 1 | Produto não entra em produção comercial no Brasil sem NFS-e configurável e LGPD funcional | [MB §6/D26][MB §10/Gate21] |
| 2 | NFS-e referencia checkout/financial transaction postados; D26 não cria ledger | [MB §6/D26][MB §6/D15] |
| 3 | Status fiscal é reconstruível por eventos; documento não aceita UPDATE direto de status | [MB §7][SKILL §4] |
| 4 | LGPD request possui status append-only e prazo rastreável | [MB §6/D26] |
| 5 | Exclusão funcional não destrói obrigação fiscal, ledger, recibo parceiro ou auditoria | [MB §6/D26][MB §13] |
| 6 | Toda leitura sensível é logada em `lgpd_access_logs`; sem log, sem leitura | [MB §6/D26] |
| 6.1 | Preview/export LGPD exige ator autorizado por `p_actor_user_id` e escopo tipado `shared.lgpd_export_scope[]`; sem allowlist não há export | [MB §6/D26][MB §10/Gate21] |
| 7 | Consentimento LGPD legal complementa, mas não substitui, consentimento operacional D21 por canal/finalidade | [MB §6/D21][MB §6/D26] |
| 8 | Recibo de parceiro é rastreável por payout/ledger e não recalcula comissão paralela | [MB §6/D26][MB §6/D17] |
| 9 | Alíquotas e retenções são versionadas por período; documento autorizado não é reescrito retroativamente; `nfse_documents.iss_rate` repete `CHECK (0 <= iss_rate <= 1)` no snapshot | [MB §6/D26] |
| 10 | Provider fiscal é configurável por tenant; nenhum provider específico é hardcoded no Blueprint | [MB §6/D26] |

## 26.7 Eventos outbox

| event_type | Quando emite | Payload mínimo |
|---|---|---|
| `fiscal_profile_updated` | Perfil fiscal versionado | `tenant_id`, `fiscal_profile_id`, `version_seq` |
| `nfse_document_prepared` | Documento fiscal preparado | `tenant_id`, `nfse_document_id`, `checkout_session_id`, `financial_transaction_id` |
| `nfse_issue_requested` | Emissão enfileirada | `tenant_id`, `nfse_document_id`, `provider_request_id` |
| `nfse_status_changed` | Status event gravado | `tenant_id`, `nfse_document_id`, `status`, `provider_protocol` |
| `lgpd_request_created` | Request LGPD recebido | `tenant_id`, `request_id`, `request_kind`, `due_at` |
| `lgpd_export_bundle_ready` | Portabilidade pronta | `tenant_id`, `request_id`, `bundle_hash`, `expires_at` |
| `lgpd_erasure_applied` | Exclusão funcional aplicada | `tenant_id`, `request_id`, `effects_count` |
| `sensitive_access_logged` | Acesso sensível registrado | `tenant_id`, `actor_user_id`, `source_domain`, `purpose_code` |
| `partner_law_receipt_issued` | Recibo parceiro emitido | `tenant_id`, `receipt_id`, `staff_id`, `financial_transaction_id` |

## 26.8 Dependências

| Tipo | Domínios |
|---|---|
| Depende de | D01, D02, D05, D08, D12, D15, D17, D21, D25 |
| Consumido por | D25 fiscal dashboard, D27 marketplace fiscal, D30 integration platform, D31 gates |
| Não substitui | Payment, ledger, commission, messaging, integration platform genérica |

## 26.9 Gate correspondente

| Gate | Asserções do Bloco H |
|---|---|
| Gate 21 — Fiscal & LGPD Compliance | NFS-e configurável; documento emitível por checkout/ledger; consentimento legal catalogado; portabilidade e exclusão funcional executáveis; acesso sensível logado |
| Gate 19 — Analytics Rebuild | Fiscal dashboard lê snapshots/rebuilds; D26 fornece eventos para D25 |
| Gate 20 — Integration Safety | Outbox/provider requests são auditáveis; D26 não abre API/webhook genérico fora de D30 |

## 26.10 RAGOV do domínio

| Item | Classificação | Justificativa |
|---|---|---|
| NFS-e configurável | CRÍTICO / REAL | MB exige antes de produção comercial [MB §6/D26] |
| LGPD requests, exclusão e portabilidade | CRÍTICO / REAL | DoD exige exclusão e portabilidade funcionais [MB §12] |
| Lei do Salão Parceiro | CRÍTICO / REAL | Repasse parceiro precisa rastreabilidade [MB §6/D26] |
| Provider municipal específico | NÃO DECLARADO | MB exige configurável, não lista providers; implementação concreta fica no SQL/integração sem hardcode no Blueprint |

---

## 7. Mapa de relações inter-domínios do Bloco H

| Origem | Destino | Relação | Regra |
|---|---|---|---|
| 25 | 07/08 | Métricas de ocupação e ROI agenda | Lê appointments/holds; não altera agenda |
| 25 | 12/15 | Métricas financeiras | Lê checkout/ledger; não cria saldo |
| 25 | 17 | Métricas staff/comissão | Staff privacy herdada; sem expor financeiro de outro staff |
| 25 | 21/24 | Campanha e mensageria | Mede outcomes; não envia mensagem |
| 26 | 12/15 | NFS-e por atendimento | Requer checkout fechado e financial_transaction posted |
| 26 | 17 | Recibo parceiro | Referencia payout/ledger; não recalcula comissão |
| 26 | 21 | Consentimento | D26 base legal/finalidade; D21 consentimento operacional por canal |
| 26 | 25 | Fiscal dashboard | D25 lê eventos fiscais reconstruíveis |
| 26 | 30 futuro | Provider/API externa | D26 usa outbox/provider requests; D30 governará integrações gerais |

---

## 8. Matriz domínio → gate → migration

| Domínio | Migration | Gate primário | Gate secundário | Critério bloqueante |
|---:|---:|---|---|---|
| 25 | 034/035 | Gate 19 | Gate 18 / 21 leitura | Read models precisam ser reconstruíveis; nenhum dashboard com SQL livre |
| 26 | 034/036 | Gate 21 | Gate 20 | NFS-e configurável; LGPD funcional; recibo parceiro rastreável; status/eventos append-only |

---

## 9. Ordem única de execução de migrations do Bloco H

| Ordem | Migration | Conteúdo | Dependência |
|---:|---|---|---|
| 1 | `034_analytics_fiscal_compliance_shared_contracts.sql` | Enums/tipos shared de analytics, rebuild, fiscal, LGPD e retenção | Blocos A–G aprovados |
| 2 | `035_analytics_decision_intelligence.sql` | Catálogo de métricas, rebuild jobs, snapshots, dashboards, drift e insights | 034 + D07/D08/D12–D24 |
| 3 | `036_fiscal_lgpd_brasil.sql` | Fiscal profiles, NFS-e, provider requests, LGPD, retenção, DPIA, recibos parceiro | 034 + D12/D15/D17/D21 |

---

## 10. Estratégia de rollback do Bloco H

| Migration | Rollback permitido | Rollback proibido |
|---:|---|---|
| 034 | Remover tipos apenas antes de dados reais; senão versionar tipos novos | Dropar enum/tipo usado por snapshots, NFS-e ou LGPD |
| 035 | Desativar cards; marcar rebuild job como superseded; publicar novo rebuild corretivo | Apagar snapshots, drift findings, checkpoints ou rebuild events |
| 036 | Suspender provider profile; cancelar documento fiscal ainda não autorizado; criar status event de correção; reemitir bundle LGPD | Apagar NFS-e autorizada, logs LGPD, erasure effects, access logs ou recibos parceiro |

---

## 11. Apêndice — decisões arquiteturais com justificativa

| Decisão | Veredito | Justificativa | Fonte |
|---|---|---|---|
| Analytics sem SQL livre | REAL | Evita injeção e dashboard soberano | [MB §6/D25][SKILL §4] |
| Snapshots append-only | REAL | Prova reconstrução por source hash | [MB §10/Gate19] |
| Drift por finding + rebuild | REAL | Não corrige métrica por UPDATE direto | [RM §4 #99] |
| NFS-e provider-agnostic | REAL | MB exige configurável, sem provider hardcoded | [MB §6/D26] |
| Status fiscal por eventos | REAL | Documento fiscal precisa trilha auditável | [MB §10/Gate21] |
| Exclusão funcional | REAL | Compatibiliza LGPD com ledger/fiscal | [MB §6/D26][MB §13] |
| Acesso sensível logado | REAL | LGPD exige logs de acesso a dados sensíveis | [MB §6/D26] |
| Recibo parceiro vinculado a ledger/payout | REAL | Lei do Salão Parceiro sem financeiro paralelo | [MB §6/D26][MB §6/D17] |
| Benchmark D28 não entregue | REAL | D25 prepara métricas; multiunidade fica em D28 | [MB §6/D28] |
| SQL Master não autorizado | BLOQUEADO | Blueprint ainda incompleto; faltam D27–D31 | [SKILL §6] |
| Cockpit DEFINER com staff privacy | REAL | Corrige H-01; função não retorna raw table e aplica agregação/anonimização para métricas individuais de staff | [MB §6/D17][MB §6/D25][MB §10/Gate14] |
| Export LGPD com ator e escopo tipado | REAL | Corrige H-02; preview/export não expõe PII sem `p_actor_user_id` autorizado e allowlist de campos | [MB §6/D26][MB §10/Gate21] |
| `iss_rate` com CHECK no documento | REAL | Corrige H-03; snapshot fiscal preserva range da regra de origem | [MB §6/D26][SKILL §4] |

---

## 12. Reflexion contra Definition of Done do Bloco H

| Item verificado | Resultado | Correção aplicada |
|---|---|---|
| Domínios 25 e 26 têm os 10 blocos obrigatórios | SIM | Sem correção |
| Toda tabela tenant-scoped tem RLS especificada | SIM | `REVOKE ALL` e papéis técnicos definidos |
| Dashboard não calcula verdade | SIM | Cards referenciam `metric_code`, sem SQL livre |
| Read models são reconstruíveis | SIM | Rebuild jobs, source hash, checkpoints e drift findings |
| Métricas financeiras não viram saldo | SIM | Origem D12–D17; D25 apenas snapshot |
| Staff privacy no cockpit | SIM | `read_owner_cockpit` é DEFINER, recebe `p_actor_user_id`, não retorna raw table e filtra/agrega `subject_kind=staff` |
| Fiscal não cria ledger | SIM | NFS-e referencia `financial_transaction_id` postado |
| NFS-e tem status auditável | SIM | Status events + rebuild run + bloqueio de direct UPDATE; `iss_rate` possui CHECK de range no documento |
| LGPD tem exclusão e portabilidade funcionais | SIM | Requests, bundles, erasure effects, retention policies, preview com ator validado e `shared.lgpd_export_scope[]` |
| Acesso sensível é logado | SIM | `lgpd_access_logs` append-only |
| Lei do Salão Parceiro rastreável | SIM | Recibo referencia payout/ledger |
| D27–D31 não foram declarados entregues | SIM | Fora do escopo explicitado |
| SQL Master não foi autorizado | SIM | Mantida fase Blueprint |

**Falhas encontradas antes da declaração:** H-01, H-02 e H-03 da auditoria v1 foram absorvidas integralmente nesta v1.1.  
**Limite explícito:** este arquivo não declara Marketplace, Multiunidade, White-Label, Integration Platform ou Gate/QA/Governance prontos.

Bloco H v1.1 pronto para auditoria Red Team.

Pronto para auditoria Red Team.

---

## ANEXO I — SMART_FLOW_3_0_BLUEPRINT_BLOCO_I_v1_1.md

# SMART_FLOW_3_0_BLUEPRINT.md — Fase 1 · Bloco I v1.1

**Produto:** SMART Flow™ 3.0  
**Entrega:** Bloco I — Domínios 27, 28, 29, 30 e 31  
**Status:** v1.1 — ENTREGUE PARA AUDITORIA RED TEAM DO BLOCO I  
**Data:** 2026-06-11  
**Fonte de autoridade:** `SMART_FLOW_3_0_MASTER_BRIEF.md` [MB §6/D27][MB §6/D28][MB §6/D29][MB §6/D30][MB §6/D31][MB §10][MB §11]  
**Contrato de criação:** `SKILL_BLUEPRINT_CREATOR.md` [SKILL §1–§7]  
**Mapa de reaproveitamento:** `SMART_FLOW_3_0_SQL_REUSE_MAP.md` [RM §4 #2][RM §4 #6][RM §4 #59][RM §4 #93–#95][RM §4 #97][RM §4 #99][RM §4 #101][RM §5/D27][RM §5/D28][RM §5/D29][RM §5/D30][RM §5/D31]  
**Fundação aprovada herdada:** Bloco A v2.1, Bloco B v2.1, Bloco C v1.2, Bloco D v1.2, Bloco E v1.1, Bloco F v1.1, Bloco G v1.1, Bloco H v1.1.

---

## 0. Regra de autoridade e escopo

| Regra | Decisão do Bloco I | Fonte |
|---|---|---|
| Marketplace | Marketplace nunca bypassa agenda, checkout, ledger, consentimento ou tenant owner | [MB §6/D27][MB §10/Gate23] |
| Multiunidade | Unidade mantém ledger, comissão, benefício e caixa próprios; consolidação é view/rebuild, não mistura contábil | [MB §6/D28][MB §10/Gate24] |
| White-label | White-label é apresentação; não cria core, ledger, gate ou regra paralela | [MB §6/D29] |
| Integração | API e webhooks passam por Command e outbox; integração não acessa DB direto | [MB §6/D30][MB §10/Gate20] |
| Governança | Feature sem gate não promove release; feature crítica sem gate é bloqueada | [MB §6/D31][MB §10/Gate25] |
| Tenant isolation | Todo objeto tenant-scoped usa `tenant_id`; objetos cross-tenant são `platform`/`shared` sanitizados, com escopo e auditoria explícitos | [MB §7][MB §10/Gate01][MB §10/Gate22] |
| REVOKE | `REVOKE ALL` explícito de `PUBLIC`, `anon`, `authenticated` em todos os objetos do bloco | [SKILL §4][RM §2] |
| SQL Master | Não autorizado nesta entrega; este arquivo é Blueprint, não migration executável | [SKILL §8] |

---

## 1. Escopo do Bloco I

| Bloco | Domínio | Nome | Status nesta entrega | Fonte |
|---|---:|---|---|---|
| I | 27 | Marketplace | Especificado | [MB §6/D27][RM §5/D27] |
| I | 28 | Multiunidade Enterprise | Especificado | [MB §6/D28][RM §5/D28] |
| I | 29 | App White-Label | Especificado | [MB §6/D29][RM §5/D29] |
| I | 30 | Integration Platform | Especificado | [MB §6/D30][RM §5/D30] |
| I | 31 | Gate, QA & Governance | Especificado | [MB §6/D31][RM §5/D31] |

**Resultado esperado após aprovação:** Blueprint cobre D00–D31. SQL Master continua bloqueado até o Bloco I v1.1 ser aprovado pelo Red Team. [SKILL §8]

---

## 2. Divergência formal de agrupamento

### DIVERGÊNCIA FORMAL I-00 — Bloco I operacional final vs agrupamento original da skill

| Item | Regra / fato | Decisão desta rodada |
|---|---|---|
| Skill original | Separa Escala em D27–D30 e Governança em D31. [SKILL §6] | Não será seguido literalmente nesta rodada. |
| Fluxo aprovado do projeto | Platform Owner autorizou Bloco I final com D27–D31. | Bloco I cobre D27, D28, D29, D30 e D31. |
| Ordem do Master Brief | Marketplace Fase 1, Integration Platform, Multiunidade, Marketplace Fase 2, White-Label e Governança antes de produção. [MB §11] | Ordem interna preserva dependências: D30 antes de integrações externas reais; D31 fecha promoção. |
| Limite | Programa de Parceiros fora do escopo explícito do MB detalhado nesta fase. [MB §11] | Não será modelado como domínio novo. |

**Veredito da divergência:** aceita nesta rodada por autorização do Platform Owner.  
**Limite:** nenhum domínio D32 ou feature fora do Master Brief será criado.

---

## 3. Contratos herdados do Bloco I

| Contrato herdado | Uso no Bloco I | Regra |
|---|---|---|
| `shared.structured_command_result` | Retorno padrão dos Commands de marketplace, enterprise, white-label, integração e governança | Erro estruturado obrigatório [MB §7] |
| `shared.command_idempotency_keys` | Idempotência de publish, attribution, commission, integration call, gate run e promotion | Reexecução não duplica efeito [SKILL §4] |
| `tenant_core.appointments`, holds e checkout | Marketplace e multiunidade delegam criação de agenda/checkout aos domínios donos | Sem engine paralela [MB §6/D07][MB §6/D12][MB §6/D27] |
| `tenant_core.financial_transactions` / `ledger_entries` | Comissão de marketplace e consolidação enterprise referenciam ledger postado | Sem saldo paralelo [MB §6/D15][MB §6/D27][MB §6/D28] |
| `tenant_core.analytics_metric_snapshots` | Marketplace, enterprise e governance consomem métricas reconstruíveis | Analytics segue D25 [MB §6/D25][MB §10/Gate19] |
| `tenant_core.outbox_events` | Webhooks, fiscal, marketplace, white-label build e gate notifications usam outbox | Integração assíncrona auditável [MB §6/D30][RM §4 #97] |
| `tenant_core.action_requests`, approvals e execution logs | D31 executa somente action request aprovado, whitelisted e roteado | IA/CoPilot não executam direto [MB §10/Gate16][MB §10/Gate17] |
| `read_model_refresh_log` | Rebuilds finais, public index e consolidação enterprise reaproveitam log canônico | KEEP/MERGE [RM §4 #99] |
| `gate_results` legado | Migrado para registry canônico de gates | MERGE [RM §4 #101] |
| `audit_logs` legado | Alimenta auditoria tenant; platform audit fica separado | MERGE sem misturar contextos [RM §4 #6] |

---

## 4. Convenções canônicas do Bloco I

| Item | Regra | Fonte |
|---|---|---|
| Dinheiro | Valores monetários sempre `_cents bigint`; percentuais e taxas em `numeric CHECK >= 0 AND <= 1` | [SKILL §4][MB §7] |
| Cross-tenant público | Apenas projeções sanitizadas em `shared`/`platform`; tabelas tenant raw continuam protegidas por RLS | [MB §10/Gate01][MB §6/D27] |
| Marketplace availability | Busca e listing nunca calculam slot; delegam D07/D08 por RPC/read model aprovado | [MB §6/D27][MB §10/Gate03] |
| Marketplace commission | Comissão de marketplace é evento auditável com `financial_transaction_id` postado; não é saldo paralelo | [MB §6/D27][MB §10/Gate23] |
| Multiunidade | `enterprise_group_id` nunca aparece em `ledger_entries` como substituto de tenant; consolidação usa snapshot reconstruível | [MB §6/D28][MB §10/Gate24] |
| Cross-unit staff | Agenda unificada exige lock/claim cross-unit antes de confirmar appointment para profissional compartilhado | [MB §6/D28][MB §10/Gate04] |
| White-label | Assets, domínio e release não alteram core; release depende de gate/promotion | [MB §6/D29][MB §10/Gate25] |
| Public API | API key só existe como hash; escopo é enum fechado; chamada vira Command idempotente ou leitura allowlisted | [MB §6/D30][MB §10/Gate20] |
| Webhook | Webhook é tentativa append-only derivada de outbox; status atual é projeção reconstruível bloqueada contra UPDATE direto | [MB §6/D30][RM §4 #97] |
| Action execution | D31 executa Action Request por dispatcher fechado; não executa nome de função livre | [MB §10/Gate16][MB §6/D31] |
| Gates | Gate pass exige assertions materializadas, run fechado, source hash e aprovação; resultado é append-only | [MB §6/D31][MB §10] |
| QA fixtures | Fixtures são tenant-scoped, versionadas e nunca rodam contra produção real sem gate explícito | [MB §6/D31][MB §10/Gate25] |

---

## 5. Mapa Bloco I — domínios → schemas → migrations

| Migration | Schema | Domínio | Conteúdo | Gate |
|---:|---|---:|---|---|
| 037 | `shared` | 27–31 | Enums, scopes, contracts de marketplace, enterprise, white-label, integração e gates | Gate 20 / 23 / 24 / 25 |
| 038 | `tenant_core` + `shared` | 27 | Marketplace profiles, listings, public index, attribution, commission e discovery | Gate 23 |
| 039 | `platform` + `tenant_core` | 28 | Enterprise groups, unit links, cross-unit staff, cockpit, consolidation snapshots | Gate 24 |
| 040 | `tenant_core` | 29 | White-label apps, branding, domains, release requests e build audit | Gate 25 |
| 041 | `shared` + `tenant_core` | 30 | API clients, key hashes, webhooks, connectors, command logs e audit logs | Gate 20 |
| 042 | `shared` + `platform` + `tenant_core` | 31 | Gate registry, assertions, runs, release promotion, rollback, QA e security findings | Gate 25 |

---

## 6. DECISÕES PENDENTES resolvidas no Bloco I

### DECISÃO PENDENTE I-01 — Marketplace público sem romper tenant isolation

| Alternativa | Desenho | Ledger | Isolamento tenant | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | Tabelas tenant raw + índice público sanitizado em `shared.marketplace_public_listing_index` | Alto | Alto | Médio | Média |
| B | Busca pública lê diretamente `tenant_core.marketplace_listings` cross-tenant | Médio | Baixo | Baixo | Alta |
| C | Duplicar página pública D20 como marketplace inteiro | Médio | Médio | Alto | Média |

**Escolha:** Alternativa A.  
**Justificativa:** expõe apenas dados aprovados e sanitizados, mantendo tenant raw com RLS e booking/checkout no tenant dono. [MB §6/D27][MB §10/Gate01][MB §10/Gate23]  
**Descartes:** B viola isolamento tenant; C duplica D20 e cria segunda fonte de publicação.

### DECISÃO PENDENTE I-02 — Consolidação multiunidade sem misturar ledgers

| Alternativa | Desenho | Ledger | Isolamento tenant | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | Cada unidade mantém ledger tenant; grupo possui snapshots consolidados reconstruíveis por lista de unidades e `source_hash` | Alto | Alto | Médio | Média |
| B | Criar ledger do grupo com lançamentos consolidados | Baixo | Médio | Alto | Média |
| C | Dashboard soma no frontend unidades selecionadas | Baixo | Baixo | Baixo | Alta |

**Escolha:** Alternativa A.  
**Justificativa:** cumpre invariante de D28: consolidação é view/rebuild, não mistura contábil. [MB §6/D28][MB §10/Gate24]  
**Descartes:** B cria ledger paralelo; C coloca cálculo financeiro no frontend e rompe fonte única.

### DECISÃO PENDENTE I-03 — Integração externa: endpoints livres vs Command allowlisted

| Alternativa | Desenho | Ledger | Isolamento tenant | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | API pública usa scopes e rotas allowlisted que chamam Commands idempotentes; webhooks saem do outbox | Alto | Alto | Médio | Média |
| B | API aceita nome de função/RPC em payload | Baixo | Baixo | Baixo | Alta |
| C | API escreve em staging genérico e worker decide depois por código | Médio | Médio | Médio | Média |

**Escolha:** Alternativa A.  
**Justificativa:** integração não acessa DB direto e não bypassa Command; rota fechada impede execução arbitrária. [MB §6/D30][MB §10/Gate20]  
**Descartes:** B repete vetor de `target_command text`; C cria engine paralela e staging opaco.

### DECISÃO PENDENTE I-04 — Execução de Action Request no fechamento de governança

| Alternativa | Desenho | Ledger | Isolamento tenant | Custo de migração | Simplicidade |
|---|---|---|---|---|---|
| A | D31 executa Action Request aprovado por dispatcher fechado `target_command enum → route`, sem SQL dinâmico | Alto | Alto | Médio | Média |
| B | Executor chama função por nome textual aprovado | Baixo | Baixo | Baixo | Alta |
| C | Execução manual fora do banco após aprovação | Médio | Médio | Baixo | Alta |

**Escolha:** Alternativa A.  
**Justificativa:** preserva whitelist do Bloco F, mantém log idempotente e bloqueia execução arbitrária por nome de RPC. [MB §10/Gate16][MB §6/D31]  
**Descartes:** B reabre F-01; C perde trilha auditável e idempotência.

---

# Domínio 27 — Marketplace

## 27.1 Responsabilidade

D27 é dono do perfil marketplace, listings, descoberta pública/interna, atribuição de booking e comissão de marketplace. D27 não é dono de agenda, checkout, payment, ledger, benefício, review, página pública D20 ou campanhas D24. Marketplace cria intenção/atribuição; agendamento e dinheiro continuam nos domínios aprovados. [MB §6/D27]

## 27.2 Tabelas

| Tabela | Propósito | Chaves / colunas canônicas | RLS / exposição |
|---|---|---|---|
| `tenant_core.marketplace_profiles` | Perfil do salão na rede SMART Flow™ | `id uuid PK`; `tenant_id uuid FK`; `public_slug text`; `profile_status shared.marketplace_profile_status`; `phase shared.marketplace_exposure_phase`; `display_name text`; `short_description text`; `primary_category_id uuid`; `verified_review_policy text`; `published_at timestamptz`; `unique(tenant_id)`; `unique(public_slug)` | Tenant owner/admin gerencia; leitura pública proibida na raw table |
| `tenant_core.marketplace_listings` | Serviços/pacotes publicados no marketplace | `id uuid PK`; `tenant_id uuid`; `profile_id uuid`; `listing_kind shared.marketplace_listing_kind`; `service_id uuid nullable`; `package_plan_id uuid nullable`; `subscription_plan_id uuid nullable`; `listing_status shared.marketplace_listing_status`; `price_display_mode`; `sort_rank int`; `published_at`; FK composta `(tenant_id, service_id)` / `(tenant_id, package_plan_id)` / `(tenant_id, subscription_plan_id)` conforme tipo | Raw table tenant-only; CHECK exige exatamente uma origem por `listing_kind` |
| `shared.marketplace_public_listing_index` | Índice sanitizado para descoberta cross-tenant | `public_listing_id uuid PK`; `source_tenant_id uuid`; `source_listing_id uuid`; `public_slug text`; `display_name`; `city_region_code`; `category_code`; `public_rating_avg numeric CHECK >=0 AND <=5`; `public_review_count int CHECK >=0`; `published_phase`; `is_active boolean default true`; `unpublished_at timestamptz nullable`; `source_hash`; `rebuild_run_id`; `indexed_at`; `unique(source_tenant_id, source_listing_id)` | Leitura pública allowlisted; `read_marketplace_discovery_index` filtra somente `is_active=true`; não contém staff individual, ledger, client_id, checkout_id ou dados sensíveis |
| `tenant_core.public_discovery_settings` | Opt-in, região, SEO e limites de exposição | `id uuid PK`; `tenant_id uuid unique`; `marketplace_phase`; `allow_internal_discovery boolean`; `allow_external_discovery boolean`; `seo_enabled boolean`; `deep_link_enabled boolean`; `requires_gate20 boolean default true`; `updated_by_actor_user_id`; `updated_at` | Tenant owner/admin; external discovery bloqueado sem Gate 20 |
| `tenant_core.marketplace_booking_attributions` | Atribuição marketplace → booking/checkout | `id uuid PK`; `tenant_id uuid`; `public_listing_id uuid`; `source_listing_id uuid`; `client_id uuid nullable`; `hold_id uuid nullable`; `appointment_id uuid nullable`; `checkout_session_id uuid nullable`; `attribution_status`; `attributed_at`; `source_hash`; `unique(tenant_id, appointment_id)` quando appointment não nulo | Tenant owner/admin; marketplace worker por Command |
| `tenant_core.marketplace_commission_rules` | Regra de comissão do marketplace separada do plano base | `id uuid PK`; `tenant_id uuid`; `rule_kind`; `rate numeric CHECK >=0 AND <=1`; `fixed_fee_cents bigint CHECK >=0`; `effective_daterange daterange`; `is_active`; `EXCLUDE gist (tenant_id WITH =, effective_daterange WITH &&) WHERE is_active = true` por `rule_kind` | App billing/finance executor; tenant lê a própria regra ativa |
| `tenant_core.marketplace_commission_events` | Evento append-only de comissão marketplace | `id uuid PK`; `tenant_id uuid`; `booking_attribution_id uuid`; `checkout_session_id uuid`; `financial_transaction_id uuid not null`; `commission_amount_cents bigint CHECK >=0`; `commission_rate numeric CHECK >=0 AND <=1`; `event_status`; `posted_at`; `idempotency_key`; `source_hash`; `unique(tenant_id, idempotency_key)` | Append-only; sem UPDATE/DELETE; ledger postado obrigatório |
| `tenant_core.marketplace_public_index_rebuild_runs` | Rebuild auditável do índice público | `id uuid PK`; `tenant_id uuid nullable`; `run_scope`; `status`; `source_window_start/end`; `source_hash_before/after`; `started_at`; `finished_at`; `error_code` | Append-only; executor técnico |

## 27.3 Commands e leituras

| Operação | Tipo | Contrato |
|---|---|---|
| `command_publish_marketplace_profile(p_tenant_id, p_actor_user_id, p_phase, p_idempotency_key)` | Command | Valida tenant ativo, perfil D20/D19 mínimo, reviews verificadas, Gate 19 para Fase 1 e Gate 20 para Fase 2; quando despublica, marca `shared.marketplace_public_listing_index.is_active=false` e `unpublished_at=now()` na mesma transação. |
| `command_create_marketplace_listing(p_profile_id, p_listing_kind, p_source_id, p_actor_user_id, p_idempotency_key)` | Command | Exige FK composta `(tenant_id, source_id)` por tipo; rejeita origem de outro tenant com `MARKETPLACE_SOURCE_TENANT_MISMATCH`. |
| `read_marketplace_discovery_index(p_region, p_category, p_phase, p_cursor)` | Read | Lê somente `shared.marketplace_public_listing_index` com `is_active=true`; não toca tabelas tenant raw. |
| `read_marketplace_listing_public_context(p_public_listing_id)` | Read | Retorna dados públicos sanitizados e ponte para D07/D19; disponibilidade vem de D07, sem cálculo local. |
| `command_create_marketplace_booking_intent(p_public_listing_id, p_client_context, p_idempotency_key)` | Command | Resolve tenant alvo por índice público, cria attribution pending, chama fluxo D07/D19; não cria appointment final sem hold/Command aprovado. |
| `command_finalize_marketplace_booking_attribution(p_appointment_id, p_checkout_session_id, p_actor_user_id, p_idempotency_key)` | Command | Valida appointment/checkout no mesmo tenant, checkout fechado, source_hash; grava attribution final. |
| `command_post_marketplace_commission(p_booking_attribution_id, p_ledger_idempotency_key, p_actor_user_id, p_idempotency_key)` | Command | Em uma transação: calcula comissão por regra ativa, chama D15 para ledger postado, grava `marketplace_commission_events`; rollback total se ledger falhar. |
| `command_rebuild_marketplace_public_index(p_scope, p_actor_user_id, p_idempotency_key)` | Command | Reconstrói índice sanitizado a partir de listings publicados e settings; grava `marketplace_public_index_rebuild_runs`; não reativa linha cujo tenant esteja com `allow_external_discovery=false`. |
| `command_update_discovery_settings(p_tenant_id, p_allow_internal_discovery, p_allow_external_discovery, p_actor_user_id, p_idempotency_key)` | Command | Atualiza opt-in/opt-out; se `allow_external_discovery=false`, marca todas as linhas públicas do tenant como `is_active=false` e `unpublished_at=now()` na mesma transação, antes de emitir outbox. |

## 27.4 Pré-condições obrigatórias

| Pré-condição | Falha estruturada |
|---|---|
| Marketplace Fase 1 só publica se Gate 19 aprovado para o tenant | `MARKETPLACE_GATE19_REQUIRED` |
| Marketplace Fase 2 só publica se Gate 20 aprovado para o tenant | `MARKETPLACE_GATE20_REQUIRED` |
| Listing usa FK composta `(tenant_id, source_id)` para serviço/pacote/plano | `MARKETPLACE_SOURCE_TENANT_MISMATCH` |
| Busca pública lê índice sanitizado, nunca raw `tenant_core.marketplace_*` | `MARKETPLACE_RAW_TABLE_ACCESS_DENIED` |
| Booking via marketplace passa por D07/D08/D12; sem appointment/checkout externos ao tenant | `MARKETPLACE_BOOKING_OWNER_MISMATCH` |
| Comissão marketplace exige `financial_transaction_id` postado no ledger | `MARKETPLACE_COMMISSION_LEDGER_REQUIRED` |
| Opt-out de discovery externo invalida imediatamente o índice público na mesma transação | `MARKETPLACE_PUBLIC_INDEX_INVALIDATION_REQUIRED` |

## 27.5 RLS, REVOKE e grants

| Objeto | Política |
|---|---|
| `tenant_core.marketplace_*` | `ENABLE RLS`; `tenant_id = current_setting('app.tenant_id')::uuid`; leitura/escrita por roles tenant específicas; service executor apenas via Command |
| `shared.marketplace_public_listing_index` | Leitura pública limitada a colunas sanitizadas por view/RPC e `is_active=true`; escrita só `app_worker_executor`; Commands de despublicação/opt-out podem apenas inativar a linha do próprio `source_tenant_id`; sem dados financeiros/sensíveis |
| Grants | `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`; grants nomeados para `app_command_executor`, `app_worker_executor`, `app_read_executor`, `platform_audit_reader` |

## 27.6 Invariantes

| # | Invariante |
|---:|---|
| 1 | Marketplace nunca cria appointment confirmado fora de D07/D08. |
| 2 | Marketplace nunca cria checkout, payment ou ledger fora de D12–D15. |
| 3 | Comissão marketplace é evento append-only com ledger postado; sem ledger, sem comissão publicada. |
| 4 | Public discovery é índice sanitizado; tenant raw não é lido cross-tenant. |
| 5 | Reviews públicas vêm de D19 verified reviews; avaliação anônima não entra no índice. |
| 6 | Fase 2 externa é bloqueada antes de Gate 20. |
| 7 | Opt-out de discovery externo invalida o índice público na mesma transação; não aguarda rebuild futuro. |

## 27.7 Outbox e rebuilds

| Evento | Origem | Consumidor |
|---|---|---|
| `marketplace.profile_published` | `command_publish_marketplace_profile` | Rebuild do índice público |
| `marketplace.listing_published` | `command_create_marketplace_listing` | Rebuild do índice público |
| `marketplace.discovery_opted_out` | `command_update_discovery_settings` | Auditoria pública / D31; índice já inativado na transação do Command |
| `marketplace.booking_attributed` | `command_finalize_marketplace_booking_attribution` | D25 Analytics / D31 gates |
| `marketplace.commission_posted` | `command_post_marketplace_commission` | D04 billing / D15 ledger audit / D31 gates |

## 27.8 Gate correspondente

| Gate | Prova |
|---|---|
| Gate 23 — Marketplace Safety | Booking via marketplace passa por agenda, checkout e ledger do tenant; comissão auditável; busca pública só usa índice sanitizado. |

---

# Domínio 28 — Multiunidade Enterprise

## 28.1 Responsabilidade

D28 é dono de grupos enterprise, vínculo de unidades, permissões de cockpit, staff cross-unidade, consolidação reconstruível e configuração global com override por unidade. D28 não cria ledger de grupo, não calcula comissão paralela e não substitui RLS tenant. [MB §6/D28]

## 28.2 Tabelas

| Tabela | Propósito | Chaves / colunas canônicas | RLS / isolamento |
|---|---|---|---|
| `platform.enterprise_groups` | Grupo enterprise acima dos tenants | `id uuid PK`; `platform_owner_id uuid`; `group_name`; `group_status`; `created_at`; `created_by_actor_user_id` | Platform scoped; não usa `hope.tenant_id`; acesso por role enterprise/platform |
| `platform.enterprise_group_units` | Vínculo grupo → tenant unidade | `id uuid PK`; `enterprise_group_id uuid`; `unit_tenant_id uuid`; `unit_role`; `unit_status`; `joined_at`; `left_at`; `unique(enterprise_group_id, unit_tenant_id)`; FK para tenant registry | Platform scoped com policy por permissão enterprise; não mistura dados tenant raw |
| `platform.enterprise_group_actor_permissions` | Permissões de cockpit por ator | `id uuid PK`; `enterprise_group_id`; `actor_user_id`; `permission_code`; `unit_scope_kind`; `unit_tenant_id nullable`; `granted_by_actor_user_id`; `revoked_at`; unique parcial ativo | Platform scoped; permission check obrigatório em reads enterprise |
| `tenant_core.cross_unit_staff_assignments` | Mapeia profissional a unidades do grupo | `id uuid PK`; `tenant_id uuid` da unidade; `enterprise_group_id uuid`; `global_staff_subject_id uuid`; `staff_id uuid`; `assignment_status`; `effective_daterange daterange`; FK composta `(tenant_id, staff_id)`; unique ativo por `(enterprise_group_id, global_staff_subject_id, tenant_id, staff_id)` | Tenant RLS da unidade + validação de grupo |
| `tenant_core.cross_unit_staff_time_locks` | Lock anti-conflito para staff compartilhado | `id uuid PK`; `tenant_id uuid`; `enterprise_group_id`; `global_staff_subject_id`; `staff_id`; `appointment_id nullable`; `hold_id nullable`; `service_tstzrange tstzrange`; `lock_status`; `idempotency_key`; EXCLUDE gist `(enterprise_group_id WITH =, global_staff_subject_id WITH =, service_tstzrange WITH &&) WHERE lock_status in ('held','confirmed')` | Tenant RLS + command D28 chamado antes de confirmar appointment cross-unit |
| `platform.group_cockpit_permissions` | Alias compatível do Reuse Map para permissões de cockpit | `id uuid PK`; `enterprise_group_id`; `permission_code`; `actor_user_id`; `scope_hash`; `is_active` | Mantido como MERGE/compatibilidade; fonte efetiva é permission table canônica |
| `platform.unit_consolidation_snapshots` | Snapshot consolidado reconstruível | `id uuid PK`; `enterprise_group_id`; `snapshot_kind`; `metric_code`; `period_start/end`; `unit_tenant_ids uuid[]`; `amount_cents bigint nullable`; `metric_value numeric nullable`; `source_hash`; `rebuild_run_id`; `created_at`; `CHECK exatamente um value_kind conforme metric_code` | Platform scoped; sem dados pessoais individualizados salvo permissão explícita |
| `platform.unit_consolidation_rebuild_runs` | Rebuild auditável de consolidação | `id uuid PK`; `enterprise_group_id`; `status`; `source_window_start/end`; `source_unit_hash`; `started_at`; `finished_at`; `error_code` | Append-only |
| `tenant_core.unit_setting_overrides` | Override por unidade de configuração global | `id uuid PK`; `tenant_id`; `enterprise_group_id`; `setting_key shared.enterprise_setting_key`; `setting_value_contract jsonb`; `effective_daterange`; `is_active`; EXCLUDE gist por `(tenant_id, setting_key, effective_daterange)` ativo | Unidade lê/escreve conforme permissão; grupo só via permission explícita |

## 28.3 Commands e leituras

| Operação | Tipo | Contrato |
|---|---|---|
| `command_create_enterprise_group(p_group_name, p_actor_user_id, p_idempotency_key)` | Command platform | Cria grupo sem criar tenant; valida Platform Owner/Enterprise admin. |
| `command_attach_unit_to_enterprise_group(p_group_id, p_unit_tenant_id, p_actor_user_id, p_idempotency_key)` | Command platform | Valida tenant existente, plano elegível, Gate 20/Gate 24 preconditions; não copia ledger. |
| `command_grant_enterprise_group_permission(p_group_id, p_target_actor_user_id, p_permission_code, p_unit_scope, p_actor_user_id, p_idempotency_key)` | Command | Permissão append-only por revogação lógica; valida delegação. |
| `command_create_cross_unit_staff_assignment(p_group_id, p_unit_tenant_id, p_staff_id, p_global_staff_subject_id, p_actor_user_id, p_idempotency_key)` | Command | Valida identidade global e FK composta do staff na unidade; não agenda. |
| `command_reserve_cross_unit_staff_time_lock(p_group_id, p_unit_tenant_id, p_staff_id, p_time_range, p_hold_or_appointment_ref, p_actor_user_id, p_idempotency_key)` | Command | Deve ser chamado pelo fluxo D07 antes de confirmar appointment para staff cross-unit; EXCLUDE bloqueia overlap global. |
| `read_enterprise_group_cockpit(p_group_id, p_actor_user_id, p_period)` | Read | DEFINER; valida permissão; retorna consolidação por snapshot, sem ledger raw de outra unidade. |
| `read_enterprise_unit_drilldown(p_group_id, p_unit_tenant_id, p_actor_user_id, p_period)` | Read | DEFINER; exige permissão para unidade; delega reads ao tenant alvo sem abrir RLS global. |
| `command_rebuild_unit_consolidation_snapshots(p_group_id, p_period, p_actor_user_id, p_idempotency_key)` | Command worker | Recalcula snapshots de ledgers/read models das unidades autorizadas; grava source hash e run. |

## 28.4 Pré-condições obrigatórias

| Pré-condição | Falha estruturada |
|---|---|
| Unidade pertence a um tenant ativo e aprovado | `ENTERPRISE_UNIT_NOT_ELIGIBLE` |
| Grupo não possui ledger próprio; consolidação usa snapshots | `ENTERPRISE_GROUP_LEDGER_FORBIDDEN` |
| Drilldown exige permissão explícita por unidade ou escopo group-wide | `ENTERPRISE_PERMISSION_DENIED` |
| Staff cross-unit exige `global_staff_subject_id` único no grupo | `CROSS_UNIT_STAFF_IDENTITY_REQUIRED` |
| Appointment de staff cross-unit exige lock anti-overlap antes da confirmação | `CROSS_UNIT_STAFF_TIME_LOCK_REQUIRED` |
| Rebuild de consolidação grava `source_hash` e lista de unidades | `ENTERPRISE_CONSOLIDATION_SOURCE_HASH_REQUIRED` |
| Leitura/rebuild platform-scoped exige permissão enterprise ativa por `enterprise_group_id` no banco | `ENTERPRISE_GROUP_RLS_PERMISSION_REQUIRED` |

## 28.5 RLS, REVOKE e grants

| Objeto | Política |
|---|---|
| `platform.enterprise_*` | `ENABLE RLS`; predicado explícito por `enterprise_group_id` existente em `platform.enterprise_group_actor_permissions` para `actor_user_id = current_setting('hope.platform_actor_id', true)::uuid`, `revoked_at IS NULL` e permissão compatível; Platform Owner isolado de tenant; sem `hope.tenant_id` compartilhado |
| `tenant_core.cross_unit_*` | RLS por unidade `tenant_id`; acesso enterprise por DEFINER que valida permissão e não expõe raw indiscriminado |
| `platform.unit_consolidation_*` | `ENABLE RLS`; leitura/escrita de rebuild permitida somente quando `enterprise_group_id` pertence ao conjunto autorizado em `platform.enterprise_group_actor_permissions` do `hope.platform_actor_id`; snapshots sem PII individual por padrão; ator do grupo A nunca lê snapshot do grupo B |
| Grants | `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`; grants para `app_command_executor`, `app_read_executor`, `app_worker_executor`, `platform_owner_executor` |

## 28.6 Invariantes

| # | Invariante |
|---:|---|
| 1 | Ledger, caixa, wallet, comissão e benefício permanecem por tenant unidade. |
| 2 | Consolidação enterprise é snapshot/rebuild; não existe lançamento contábil de grupo substituindo ledger da unidade. |
| 3 | Drilldown nunca bypassa RLS/permission por unidade. |
| 4 | Profissional cross-unidade não pode ter overlap de tempo confirmado no mesmo grupo. |
| 5 | Comissão é calculada pela unidade onde o serviço foi prestado. |
| 6 | Benchmark entre unidades usa D25 snapshots e anonimização quando envolve staff individual. |

## 28.7 Outbox e rebuilds

| Evento | Origem | Consumidor |
|---|---|---|
| `enterprise.unit_attached` | `command_attach_unit_to_enterprise_group` | D31 Gate 24 / audit |
| `enterprise.cross_unit_staff_assigned` | `command_create_cross_unit_staff_assignment` | D07/D28 conflict audit |
| `enterprise.consolidation_rebuilt` | `command_rebuild_unit_consolidation_snapshots` | Cockpit enterprise / D31 |
| `enterprise.permission_changed` | Permission commands | Security audit |

## 28.8 Gate correspondente

| Gate | Prova |
|---|---|
| Gate 24 — Multi-Unit Integrity | Ledgers separados por unidade, consolidação reconstruível, drilldown permissionado e staff cross-unidade sem conflito. |

---

# Domínio 29 — App White-Label

## 29.1 Responsabilidade

D29 é dono de identidade visual, domínio próprio, build/release white-label e remoção de marca SMART Flow™ da experiência final quando contratado. D29 não cria regras de negócio, ledger, agenda, checkout, fiscal, CRM ou marketplace. [MB §6/D29]

## 29.2 Tabelas

| Tabela | Propósito | Chaves / colunas canônicas | RLS |
|---|---|---|---|
| `tenant_core.white_label_apps` | App white-label do tenant | `id uuid PK`; `tenant_id uuid unique`; `app_name`; `app_status shared.white_label_app_status`; `enterprise_tier_confirmed boolean`; `current_branding_profile_id`; `current_release_id`; `created_at`; `updated_at` | Tenant owner/admin; writes por command |
| `tenant_core.white_label_branding_profiles` | Branding versionado | `id uuid PK`; `tenant_id`; `app_id`; `profile_version int`; `brand_name`; `primary_color`; `secondary_color`; `icon_asset_id`; `splash_asset_id`; `font_policy`; `status`; `source_hash`; `unique(tenant_id, app_id, profile_version)` | Tenant admin; asset validation obrigatória |
| `tenant_core.white_label_domains` | Domínio próprio e verificação | `id uuid PK`; `tenant_id`; `app_id`; `domain_name`; `verification_status`; `verification_token_hash`; `verified_at`; `dns_last_checked_at`; `unique(domain_name)` | Tenant admin; token hash, não token puro |
| `tenant_core.white_label_release_requests` | Pedido de release white-label | `id uuid PK`; `tenant_id`; `app_id`; `branding_profile_id`; `release_status`; `requested_by_actor_user_id`; `gate_run_id`; `release_promotion_request_id`; `requested_at`; `approved_at`; `rejected_reason_code`; `idempotency_key`; `unique(tenant_id, idempotency_key)` | Append-only status por eventos; update direto de status bloqueado |
| `tenant_core.white_label_release_status_events` | Status append-only de release | `id uuid PK`; `tenant_id`; `release_request_id`; `status`; `reason_code`; `actor_user_id`; `occurred_at`; `event_seq bigint` | Append-only |
| `tenant_core.white_label_build_artifacts` | Artefatos/builds auditáveis | `id uuid PK`; `tenant_id`; `release_request_id`; `artifact_kind`; `artifact_uri_hash`; `build_status`; `build_source_hash`; `created_at` | Worker only; sem segredo em texto puro |

## 29.3 Commands e leituras

| Operação | Tipo | Contrato |
|---|---|---|
| `command_create_white_label_app(p_tenant_id, p_actor_user_id, p_idempotency_key)` | Command | Exige tier Enterprise ativo; não muda core. |
| `command_upsert_white_label_branding_profile(p_app_id, p_branding_contract, p_actor_user_id, p_idempotency_key)` | Command | Valida assets, cores, domínios e policy de marca; versiona profile. |
| `command_verify_white_label_domain(p_domain_id, p_actor_user_id, p_idempotency_key)` | Command | Verifica domínio por token hash; não armazena token puro. |
| `command_request_white_label_release(p_app_id, p_branding_profile_id, p_actor_user_id, p_idempotency_key)` | Command | Cria release request e aciona D31 gate/promotion; sem gate aprovado, release não promove. |
| `read_white_label_runtime_config(p_tenant_id, p_client_context)` | Read | Retorna configuração pública aprovada; sem dados financeiros, staff privacy ou segredo. |

## 29.4 Pré-condições obrigatórias

| Pré-condição | Falha estruturada |
|---|---|
| Tenant precisa tier Enterprise elegível | `WHITE_LABEL_ENTERPRISE_TIER_REQUIRED` |
| Branding profile precisa assets validados e armazenados por hash | `WHITE_LABEL_ASSET_VALIDATION_FAILED` |
| Domínio próprio exige verificação por token hash | `WHITE_LABEL_DOMAIN_NOT_VERIFIED` |
| Release exige Gate 25 e promotion request aprovado em D31 | `WHITE_LABEL_RELEASE_GATE_REQUIRED` |
| White-label não altera regra de agenda, checkout, ledger ou fiscal | `WHITE_LABEL_CORE_MUTATION_FORBIDDEN` |

## 29.5 RLS, REVOKE e grants

| Objeto | Política |
|---|---|
| `tenant_core.white_label_*` | `ENABLE RLS`; `tenant_id = current_setting('app.tenant_id')::uuid`; writes só por Commands |
| Runtime config | Leitura pública só de configuração aprovada, por RPC/view sanitizada |
| Grants | `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`; grants para executores técnicos e leitura runtime allowlisted |

## 29.6 Invariantes

| # | Invariante |
|---:|---|
| 1 | White-label é camada de apresentação; core e gates são idênticos ao produto base. |
| 2 | Release white-label não promove sem D31 Gate 25 aprovado. |
| 3 | Token de verificação, segredo de build e artifact URI sensível nunca ficam em texto puro. |
| 4 | Runtime config pública não expõe dados sensíveis nem muda regra operacional. |

## 29.7 Gate correspondente

| Gate | Prova |
|---|---|
| Gate 25 — Production Readiness | White-label só libera build/release após promoção aprovada, rollback documentado e checks de segurança. |

---

# Domínio 30 — Integration Platform

## 30.1 Responsabilidade

D30 é dono de API pública versionada, API clients, key hashes, scopes, webhooks, connectors, logs de comando e auditoria pública. D30 não acessa banco direto, não executa RPC por nome livre e não cria engine paralela de integração. [MB §6/D30]

## 30.2 Tabelas

| Tabela | Propósito | Chaves / colunas canônicas | RLS / segurança |
|---|---|---|---|
| `tenant_core.api_clients` | Cliente de API por tenant | `id uuid PK`; `tenant_id`; `client_name`; `client_status`; `allowed_scopes shared.api_client_scope[]`; `rate_limit_policy_id`; `created_by_actor_user_id`; `created_at`; `revoked_at` | Tenant admin; platform audit |
| `tenant_core.api_key_hashes` | Hashes de chaves de API | `id uuid PK`; `tenant_id`; `api_client_id`; `key_hash text`; `key_prefix text`; `hash_algorithm`; `expires_at`; `last_used_at`; `revoked_at`; `unique(tenant_id, key_prefix)` | Secret never stored; read restrito; UPDATE direto bloqueado exceto last_used worker |
| `tenant_core.public_api_audit_logs` | Log append-only de chamadas API | `id uuid PK`; `tenant_id`; `api_client_id`; `endpoint_code`; `scope_used`; `request_hash`; `response_status`; `actor_kind`; `occurred_at`; `idempotency_key nullable` | Append-only; tenant admin/security read |
| `tenant_core.integration_command_logs` | Command executado por integração | `id uuid PK`; `tenant_id`; `api_client_id`; `command_route shared.integration_command_route`; `target_domain`; `request_hash`; `result_status`; `structured_error_code`; `idempotency_key`; `created_at`; `unique(tenant_id, api_client_id, idempotency_key)` | Append-only; sem payload sensível bruto |
| `tenant_core.webhook_subscriptions` | Assinatura de webhook | `id uuid PK`; `tenant_id`; `api_client_id`; `event_type shared.outbox_event_type`; `target_url_hash`; `target_url_display_masked`; `secret_hash`; `subscription_status`; `created_at`; `unique(tenant_id, api_client_id, event_type, target_url_hash)` | Tenant admin; segredo só hash |
| `tenant_core.webhook_delivery_attempts` | Tentativas append-only | `id uuid PK`; `tenant_id`; `subscription_id`; `outbox_event_id`; `attempt_no int CHECK >0`; `delivery_status`; `http_status int nullable`; `request_payload_hash`; `response_hash`; `next_retry_at`; `occurred_at`; `unique(tenant_id, subscription_id, outbox_event_id, attempt_no)` | Append-only; worker only |
| `tenant_core.webhook_delivery_status_rebuild_runs` | Rebuild de status agregado de delivery | `id uuid PK`; `tenant_id`; `status`; `source_window_start/end`; `source_hash`; `started_at`; `finished_at`; `error_code` | Append-only |
| `tenant_core.integration_connectors` | Connector externo configurável | `id uuid PK`; `tenant_id`; `connector_kind shared.integration_connector_kind`; `connector_status`; `credential_ref_hash`; `scope_contract shared.integration_connector_scope[]`; `created_at`; `revoked_at` | Credencial nunca em texto; connector não escreve DB direto |
| `tenant_core.integration_connector_events` | Eventos inbound de conectores | `id uuid PK`; `tenant_id`; `connector_id`; `external_event_id_hash`; `event_kind`; `received_payload_hash`; `event_status`; `mapped_command_route nullable`; `idempotency_key`; `received_at`; `unique(tenant_id, connector_id, external_event_id_hash)` | Append-only; worker mapeia para Command allowlisted |
| `shared.integration_route_registry` | Registry fechado de rotas API → Command/read | `route_code shared.integration_command_route PK`; `target_domain int`; `required_scope shared.api_client_scope`; `risk_level`; `is_write boolean`; `requires_idempotency_key boolean`; `is_active` | Shared; alteração só migration/governança D31 |

## 30.3 Commands e leituras

| Operação | Tipo | Contrato |
|---|---|---|
| `command_create_api_client(p_tenant_id, p_client_name, p_scopes, p_actor_user_id, p_idempotency_key)` | Command | Cria client com scopes enum; sem wildcard. |
| `command_rotate_api_key(p_api_client_id, p_actor_user_id, p_idempotency_key)` | Command | Retorna segredo uma única vez ao caller autorizado; persiste hash/prefixo apenas. |
| `command_revoke_api_client(p_api_client_id, p_actor_user_id, p_idempotency_key)` | Command | Revoga client e bloqueia novas chamadas. |
| `command_execute_public_api_route(p_route_code, p_request_contract, p_api_client_context, p_idempotency_key)` | Command wrapper | Valida scope, tenant, route registry, idempotência e chama Command/read allowlisted; sem função textual livre. |
| `command_create_webhook_subscription(p_api_client_id, p_event_type, p_target_url_contract, p_actor_user_id, p_idempotency_key)` | Command | Valida event_type allowlisted, URL policy, secret hash e escopo. |
| `command_dispatch_webhook_delivery(p_outbox_event_id, p_subscription_id, p_worker_id, p_idempotency_key)` | Worker command | Cria tentativa append-only, aplica retry/backoff, nunca marca outbox entregue sem tentativa registrada. |
| `command_ingest_integration_connector_event(p_connector_id, p_external_event_hash, p_payload_hash, p_idempotency_key)` | Command | Registra inbound append-only; mapeia para rota allowlisted ou retorna `INTEGRATION_ROUTE_NOT_ALLOWED`. |

## 30.4 Pré-condições obrigatórias

| Pré-condição | Falha estruturada |
|---|---|
| API client precisa key hash ativa, escopo explícito e tenant bound | `API_CLIENT_NOT_AUTHORIZED` |
| Escrita via API exige `p_idempotency_key` | `PUBLIC_API_IDEMPOTENCY_REQUIRED` |
| Route registry não aceita função/RPC textual livre | `INTEGRATION_ROUTE_NOT_REGISTERED` |
| Inbound connector não escreve DB direto; vira Command allowlisted | `CONNECTOR_DIRECT_WRITE_FORBIDDEN` |
| Webhook delivery deriva de `outbox_events` e grava tentativa append-only | `WEBHOOK_OUTBOX_REQUIRED` |
| Payload bruto sensível não é armazenado; apenas hash/referência segura | `INTEGRATION_PAYLOAD_STORAGE_FORBIDDEN` |
| Rate limit e audit log são gravados antes da execução da rota | `PUBLIC_API_AUDIT_REQUIRED` |

## 30.5 RLS, REVOKE e grants

| Objeto | Política |
|---|---|
| `tenant_core.api_*`, `integration_*`, `webhook_*` | `ENABLE RLS`; tenant-bound por key/client; admin tenant lê; workers escrevem por Command |
| `shared.integration_route_registry` | Leitura por executores; escrita só migration/governance; sem endpoint público |
| Grants | `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`; grants para executores técnicos; API externa nunca recebe grant direto em tabela |

## 30.6 Invariantes

| # | Invariante |
|---:|---|
| 1 | Integração não bypassa Command. |
| 2 | API key em texto puro nunca é persistida. |
| 3 | Scope é enum fechado; sem wildcard textual. |
| 4 | Route registry é fechado; sem chamada de RPC por string. |
| 5 | Webhook é consequência de outbox e tentativa append-only. |
| 6 | Connector inbound é evento append-only + Command allowlisted; sem escrita direta. |

## 30.7 Gate correspondente

| Gate | Prova |
|---|---|
| Gate 20 — Integration Safety | API, webhook e connector passam por route registry, Command, idempotência, audit log, rate limit e sem segredo em texto puro. |

---

# Domínio 31 — Gate, QA & Governance

## 31.1 Responsabilidade

D31 é dono do registry de gates, assertions, runs, resultados, promoção de release, rollback, fixtures, achados de segurança, auditoria contínua e execução governada de Action Requests aprovados. D31 não substitui os domínios; ele prova, bloqueia, promove ou executa rotas aprovadas. [MB §6/D31][MB §10]

## 31.2 Tabelas

| Tabela | Propósito | Chaves / colunas canônicas | RLS / governança |
|---|---|---|---|
| `shared.gate_definitions` | Definição canônica dos gates 00–25 | `gate_code shared.gate_code PK`; `gate_name`; `domain_numbers int[]`; `severity`; `is_release_blocking`; `definition_version`; `is_active` | Shared; alteração só migration/governance |
| `shared.gate_assertion_catalog` | Assertions exigidas por gate | `id uuid PK`; `gate_code`; `assertion_code`; `assertion_kind`; `required_evidence_kind`; `is_blocking`; `source_contract`; `unique(gate_code, assertion_code, definition_version)` | Shared; migration/governance |
| `tenant_core.gate_runs` | Execução de gate por tenant/release | `id uuid PK`; `tenant_id`; `gate_code`; `run_status`; `release_candidate_id nullable`; `source_hash`; `started_by_actor_user_id`; `started_at`; `finished_at`; `idempotency_key`; `unique(tenant_id, gate_code, idempotency_key)` | Tenant/admin/security; status por events |
| `tenant_core.gate_run_status_events` | Status append-only do gate run | `id uuid PK`; `tenant_id`; `gate_run_id`; `status`; `reason_code`; `actor_user_id`; `occurred_at`; `event_seq bigint` | Append-only |
| `tenant_core.gate_assertion_results` | Resultado materializado por assertion | `id uuid PK`; `tenant_id`; `gate_run_id`; `assertion_code`; `result_status`; `evidence_hash`; `measured_value`; `expected_contract_hash`; `created_at`; `unique(tenant_id, gate_run_id, assertion_code)` | Append-only após run fechado |
| `tenant_core.gate_results` | Resultado final append-only | `id uuid PK`; `tenant_id`; `gate_code`; `gate_run_id`; `result_status`; `blocking_failure_count`; `passed_at nullable`; `source_hash`; `created_at`; `unique(tenant_id, gate_code, gate_run_id)` | MERGE do legado; sem UPDATE direto |
| `tenant_core.release_promotion_requests` | Pedido de promoção de release | `id uuid PK`; `tenant_id`; `release_candidate_id`; `target_environment`; `promotion_status`; `required_gate_codes shared.gate_code[]`; `requested_by_actor_user_id`; `approved_by_actor_user_id nullable`; `rollback_plan_id`; `created_at`; `idempotency_key`; `unique(tenant_id, release_candidate_id, target_environment)` | Approval governance; status por events |
| `tenant_core.release_promotion_status_events` | Status append-only de promoção | `id uuid PK`; `tenant_id`; `promotion_request_id`; `status`; `reason_code`; `actor_user_id`; `occurred_at`; `event_seq bigint` | Append-only |
| `tenant_core.rollback_plans` | Plano de rollback por release/migration | `id uuid PK`; `tenant_id`; `release_candidate_id`; `migration_range`; `rollback_strategy`; `data_preservation_contract_hash`; `approved_by_actor_user_id`; `approved_at`; `is_active` | Security/admin; append de versões |
| `tenant_core.qa_fixtures` | Fixtures/seeds controlados | `id uuid PK`; `tenant_id`; `fixture_code`; `fixture_scope`; `fixture_status`; `data_contract_hash`; `allowed_environment`; `created_at`; `created_by_actor_user_id` | Não executa em produção sem gate explícito |
| `tenant_core.qa_fixture_runs` | Execução append-only de fixture | `id uuid PK`; `tenant_id`; `fixture_id`; `environment_code`; `run_status`; `source_hash`; `started_at`; `finished_at`; `idempotency_key` | Append-only |
| `tenant_core.security_review_findings` | Achados de segurança | `id uuid PK`; `scope_kind shared.security_finding_scope`; `tenant_id nullable`; `finding_code`; `severity`; `status`; `affected_domain`; `evidence_hash`; `opened_at`; `closed_at`; `owner_actor_user_id`; `release_blocking boolean`; `CHECK ((scope_kind='tenant' AND tenant_id IS NOT NULL) OR (scope_kind='platform' AND tenant_id IS NULL))` | Tenant/platform conforme scope; append status events; platform finding nunca visível a tenant |
| `tenant_core.security_review_status_events` | Status append-only de findings | `id uuid PK`; `scope_kind shared.security_finding_scope`; `tenant_id nullable`; `finding_id`; `status`; `actor_user_id`; `occurred_at`; `event_seq bigint`; `CHECK ((scope_kind='tenant' AND tenant_id IS NOT NULL) OR (scope_kind='platform' AND tenant_id IS NULL))` | Append-only; mesma separação RLS de `security_review_findings` |
| `tenant_core.action_request_execution_routes` | Roteamento fechado de Action Request aprovado | `target_command shared.action_request_allowed_command PK`; `route_code shared.governed_action_execution_route`; `target_domain int`; `requires_approval boolean`; `is_active`; `risk_level` | Escrita só migration/governance; sem nome textual livre |
| `tenant_core.release_health_snapshots` | Snapshot de saúde para produção | `id uuid PK`; `tenant_id`; `release_candidate_id`; `metric_code`; `metric_value numeric`; `status`; `source_hash`; `created_at`; `rebuild_run_id` | Append-only; Gate 25 |

## 31.3 Commands e leituras

| Operação | Tipo | Contrato |
|---|---|---|
| `command_register_gate_definition_version(p_gate_contract, p_actor_user_id, p_idempotency_key)` | Governance command | Só platform/governance; versiona definição; não altera resultado passado. |
| `command_start_gate_run(p_tenant_id, p_gate_code, p_release_candidate_id, p_actor_user_id, p_idempotency_key)` | Command | Valida gate ativo e cria run; coleta source_hash inicial. |
| `command_record_gate_assertion_result(p_gate_run_id, p_assertion_code, p_result_contract, p_actor_user_id, p_idempotency_key)` | Command | Assertion precisa existir no catálogo; evidence_hash obrigatório. |
| `command_finalize_gate_run(p_gate_run_id, p_actor_user_id, p_idempotency_key)` | Command | Bloqueia pass se assertion blocking falhou ou ausente; grava gate_result append-only. |
| `command_create_release_promotion_request(p_release_candidate_id, p_target_environment, p_actor_user_id, p_idempotency_key)` | Command | Calcula gates obrigatórios por domínio/release; exige rollback plan. |
| `command_approve_release_promotion(p_promotion_request_id, p_actor_user_id, p_idempotency_key)` | Command | Exige todos os gates blocking aprovados após o source_hash da release; findings críticos fechados. |
| `command_execute_release_promotion(p_promotion_request_id, p_worker_id, p_idempotency_key)` | Worker command | Executa promoção somente se approved; registra status events; rollback plan ativo. |
| `command_register_rollback_plan(p_release_candidate_id, p_plan_contract, p_actor_user_id, p_idempotency_key)` | Command | Plano versionado, revisável, obrigatório antes de promoção. |
| `command_execute_approved_action_request(p_action_request_id, p_actor_user_id, p_idempotency_key)` | Governance command | Valida approval, whitelist, route registry e risco; executa por dispatcher fechado; grava execution log; sem SQL dinâmico. |
| `command_open_security_review_finding(p_finding_contract, p_actor_user_id, p_idempotency_key)` | Command | Abre finding com severidade, domínio, evidência e release_blocking. |
| `read_release_readiness_report(p_tenant_id, p_release_candidate_id, p_actor_user_id)` | Read | DEFINER; retorna gates, findings, rollback, observabilidade e blockers. |

## 31.4 Pré-condições obrigatórias

| Pré-condição | Falha estruturada |
|---|---|
| Gate finalizado precisa assertion blocking presente e aprovada | `GATE_BLOCKING_ASSERTION_MISSING` |
| Gate pass exige source_hash compatível com release candidate | `GATE_SOURCE_HASH_STALE` |
| Release promotion exige rollback plan aprovado | `ROLLBACK_PLAN_REQUIRED` |
| Release promotion exige findings críticos/altos bloqueantes fechados ou waiver formal | `SECURITY_FINDING_BLOCKS_RELEASE` |
| Action Request executado exige approval válido, request não expirado e target whitelist ativo | `ACTION_REQUEST_NOT_EXECUTABLE` |
| Action Request usa dispatcher fechado, não função textual | `ACTION_ROUTE_NOT_REGISTERED` |
| Fixture com produção real exige gate específico e ator autorizado | `QA_FIXTURE_PRODUCTION_FORBIDDEN` |
| Gate 25 exige observabilidade, rollback, performance, segurança e SLA com evidência | `PRODUCTION_READINESS_EVIDENCE_REQUIRED` |
| Finding tenant exige `tenant_id` e RLS tenant; finding platform exige `tenant_id IS NULL` e role platform security | `SECURITY_FINDING_SCOPE_INVALID` |

## 31.5 RLS, REVOKE e grants

| Objeto | Política |
|---|---|
| `tenant_core.gate_*`, `release_*`, `qa_*` | `ENABLE RLS`; tenant-bound; `tenant_id = current_setting('hope.tenant_id', true)::uuid`; governance/platform role lê via DEFINER com escopo explícito; writes só Commands |
| `shared.gate_*` | Registry compartilhado; escrita só migration/governance; leitura por executores |
| `action_request_execution_routes` | Escrita só governance/migration; leitura por `command_execute_approved_action_request`; sem endpoint público |
| `tenant_core.security_review_findings` e `tenant_core.security_review_status_events` com `scope_kind='tenant'` | `ENABLE RLS`; `tenant_id IS NOT NULL`; `tenant_id = current_setting('hope.tenant_id', true)::uuid`; leitura/escrita só tenant governance/security autorizado ou DEFINER de D31 |
| `tenant_core.security_review_findings` e `tenant_core.security_review_status_events` com `scope_kind='platform'` | `ENABLE RLS`; `tenant_id IS NULL`; visível apenas a `platform_owner_executor` ou `security_audit_reader` platform-scoped com `hope.platform_actor_id`; nunca visível a tenant |
| Grants | `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`; grants para `app_command_executor`, `app_worker_executor`, `governance_executor`, `security_audit_reader`, `platform_owner_executor` |

## 31.6 Invariantes

| # | Invariante |
|---:|---|
| 1 | Feature sem gate não promove release. |
| 2 | Gate não passa com assertion blocking ausente, stale ou falha. |
| 3 | Gate result é append-only; correção exige novo run. |
| 4 | Release sem rollback aprovado não promove. |
| 5 | Finding crítico release-blocking impede promoção. |
| 6 | Action Request aprovado só executa command whitelisted e roteado por dispatcher fechado. |
| 7 | D31 não altera ledger, caixa, wallet, benefício ou fiscal diretamente; apenas invoca Commands donos quando autorizado. |
| 8 | QA fixture nunca toca produção real sem gate e ator autorizado. |
| 9 | Findings de segurança tenant e platform são separados por `scope_kind` + `tenant_id`; platform finding nunca atravessa para sessão tenant. |
| 9 | Platform Owner isolation continua separado de tenant RLS. |

## 31.7 Gate registry mínimo obrigatório

| Gate | Domínio primário | Resultado esperado |
|---|---:|---|
| Gate 00 | 00 | Foundation, schemas, extensions, roles e REVOKE base aprovados |
| Gate 01 | 01 | Tenant isolation comprovado |
| Gate 02 | 05/17/25 | Staff privacy comprovada |
| Gate 03 | 07 | Smart availability sem cálculo frontend |
| Gate 04 | 08 | Appointment conflict bloqueado por constraint |
| Gate 05 | 07/08 | Chain booking consistente |
| Gate 06 | 09 | Recorrência com pausa/cancelamento auditável |
| Gate 07 | 10 | Grupo/split auditável |
| Gate 08 | 07 | Premium window protection |
| Gate 09 | 08 | Waitlist economic matching |
| Gate 10 | 12 | Checkout integrity |
| Gate 11 | 15 | Ledger balance double-entry |
| Gate 12 | 13 | Payment allocation |
| Gate 13 | 16 | Wallet/current account drift |
| Gate 14 | 17/25 | Commission privacy & accuracy |
| Gate 15 | 18 | Benefit origin & consumption |
| Gate 16 | 22/23/31 | Action Request safety |
| Gate 17 | 21/22 | WhatsApp & AI safety |
| Gate 18 | 14 | Cash register integrity |
| Gate 19 | 25 | Analytics rebuild |
| Gate 20 | 30 | Integration safety |
| Gate 21 | 26 | Fiscal & LGPD compliance |
| Gate 22 | 00/01/04 | Platform Owner isolation |
| Gate 23 | 27 | Marketplace safety |
| Gate 24 | 28 | Multi-unit integrity |
| Gate 25 | 29/31 | Production readiness |

## 31.8 Outbox e auditoria

| Evento | Origem | Consumidor |
|---|---|---|
| `gate.run_finalized` | `command_finalize_gate_run` | Release promotion / audit |
| `release.promotion_requested` | `command_create_release_promotion_request` | Security/governance review |
| `release.promotion_approved` | `command_approve_release_promotion` | Worker promotion executor |
| `release.promotion_executed` | `command_execute_release_promotion` | Audit / monitoring |
| `security.finding_opened` | `command_open_security_review_finding` | Release blocker monitor |
| `action_request.executed` | `command_execute_approved_action_request` | D22/D23 audit / D31 |

## 31.9 Gate correspondente

| Gate | Prova |
|---|---|
| Gate 25 — Production Readiness | Observabilidade, rollback, performance, segurança, dados reais controlados, SLA definido, findings bloqueantes fechados e gates críticos passados. |

---

## 32. Sequência de implementação no SQL Master pós-aprovação

| Ordem | Migration | Domínio | Bloqueio |
|---:|---:|---:|---|
| 1 | 037 | shared D27–D31 | Só após Bloco I aprovado |
| 2 | 038 | D27 | Depende de D07/D12/D15/D19/D20/D25 |
| 3 | 039 | D28 | Depende de D01/D07/D15/D17/D25 |
| 4 | 040 | D29 | Depende de D02/D20/D31 |
| 5 | 041 | D30 | Depende de outbox, commands e D31 governance |
| 6 | 042 | D31 | Fecha gates, release promotion e execution governance |

---

## 33. Proibições explícitas do Bloco I

| Proibição | Motivo |
|---|---|
| Marketplace ler raw tenant tables cross-tenant | Violação de tenant isolation |
| Marketplace calcular slot próprio | Duplica D07/D08 |
| Marketplace postar comissão sem ledger D15 | C5 financeiro |
| Ledger de grupo enterprise | Mistura contábil proibida |
| Consolidação enterprise no frontend | Frontend não calcula verdade financeira |
| White-label alterar core ou gate | White-label é apresentação |
| API pública aceitar nome de RPC/text command | Execução arbitrária |
| Webhook inbound escrever direto em tabela | Bypass de Command |
| Gate pass manual sem assertions | Gate decorativo |
| Release sem rollback aprovado | Falha de production readiness |
| Action Request executor usar SQL dinâmico | Reabre bypass de IA/CoPilot |
| Enterprise platform-scoped sem predicado RLS por `enterprise_group_id` | Quebra Gate 22 / Gate 24 |
| Marketplace opt-out depender apenas de rebuild futuro | Mantém exposição pública após revogação |
| Security finding platform visível a tenant | Quebra isolamento Platform Owner |

---

## 34. Reflexion — DoD do Bloco I

| Item DoD | Verificação | Status |
|---|---|---|
| Documento completo e autônomo | Bloco I inclui escopo, divergência, contratos, decisões, domínios D27–D31, gates e SQL Master pós-aprovação | OK |
| Grounding em MB/RM/SKILL | Decisões citam [MB], [RM] e [SKILL] | OK |
| 1 rodada = 1 bloco | Apenas Bloco I foi criado | OK |
| SQL executável ausente | Blueprint descreve contratos e constraints; não entrega migration executável | OK |
| Banco como verdade única | Marketplace, multiunidade, white-label, integração e governança passam por Commands/read models/rebuilds | OK |
| Frontend sem cálculo soberano | Discovery, cockpit, white-label runtime e release reports são leitura de backend | OK |
| Tenant isolation | Raw tenant tables com RLS; projeção pública sanitizada e invalidação imediata; enterprise com predicado explícito por `enterprise_group_id`; findings separados por `scope_kind` | OK |
| Ledger | Marketplace commission referencia ledger; enterprise não cria ledger de grupo; D31 não muta saldo | OK |
| Append-only | Commission events, webhook attempts, gate results, status events, audit logs e findings com trilha append-only | OK |
| Idempotência | Commands de escrita possuem `p_idempotency_key` e unique por tenant/contexto | OK |
| Gate coverage | Gate 20, 23, 24 e 25 materializados; registry final lista Gates 00–25 | OK |
| Red Team readiness | Vetores críticos tratados: cross-tenant marketplace, opt-out público imediato, RLS platform-scoped, multi-ledger, API dynamic RPC, action execution e gate decorativo | OK |


## 35. Absorção da Auditoria Red Team do Bloco I v1

| Falha | Correção v1.1 | Status |
|---|---|---|
| I-01 — RLS platform-scoped e `tenant_id nullable` ambíguos | `platform.enterprise_*` e `platform.unit_consolidation_*` receberam predicado RLS explícito por `enterprise_group_id` contra `platform.enterprise_group_actor_permissions`; `security_review_findings` e eventos receberam `scope_kind` + CHECK de coerência e políticas separadas para tenant/platform | Absorvida |
| I-02 — opt-out marketplace dependente de rebuild futuro | `shared.marketplace_public_listing_index` recebeu `is_active` e `unpublished_at`; despublicação e `allow_external_discovery=false` inativam linhas públicas do tenant na mesma transação; leitura pública filtra `is_active=true` | Absorvida |

**Status final:** Bloco I v1.1 pronto para auditoria Red Team.

---

## Reflexion final

| DoD | Resultado |
|---|---|
| 31/31 domínios cobertos | Aprovado |
| Todos os blocos anexados nas versões Red Team aprovadas | Aprovado |
| Decisões cross-bloco citam MB/RM/SKILL | Aprovado |
| Registry Gates 00–25 incluído | Aprovado |
| SQL Master ainda não alterado | Aprovado |

Pronto para auditoria Red Team.


---

## Reflexion final — Blueprint 4.0 contra DoD

| Item verificado | Resultado | Evidência interna |
|---|---|---|
| Documento completo gerado | SIM | Seções 0–6 + Anexos A–I preservados |
| D00–D31 preservados | SIM | Índice canônico contém 32 entradas |
| Gates 00–25 preservados | SIM | Registry não cria gate novo; cenários v4.0 foram absorvidos |
| Migrations 001–039 preservadas | SIM | Sequência 001–039 mantida e 040–045 adicionadas ao final |
| GAP 1 Booking Candidate | SIM | D07/D08 + migration 040 |
| GAP 2 Booking Intent | SIM | D08/D10 + migration 041 |
| GAP 3 Smart Gap Law | SIM | D07 + Gate 03 |
| GAP 4 COF/Deposit | SIM | D02/D13 + migrations 042/043 |
| GAP 5 Waitlist Recovery | SIM | D08/D09 + migration 044 |
| GAP 6 Manual Validation | SIM | D08/D19 + migration 045 |
| PAN bloqueado | SIM | `payment_method_tokens.provider_token` com guard regex |
| REVOKE explícito nos Commands novos | SIM | Todos os Commands v4.0 declaram REVOKE PUBLIC, anon, authenticated e GRANT técnico |
| Frontend sem cálculo crítico | SIM | D19/D20/D12/D13 preservam backend-only |
| Ledger protegido | SIM | COF e reembolso passam por ledger/reversão D15 |

Pronto para auditoria Red Team.
