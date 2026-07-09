# SMART FLOW™ / HOPE OS 4.0 — MASTER BRIEFING CANÔNICO

**Arquivo:** `SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md`  
**Produto:** SMART Flow™ / HOPE OS 4.0  
**Status:** FONTE ÚNICA CANÔNICA — substitui `SMART_FLOW_3_1_MASTER_BRIEF_CANONICO.md` após aprovação do Platform Owner  
**Data:** 2026-06-29  
**Autoridade:** Platform Owner  
**Natureza:** revisão canônica completa; não é patch, delta, adendo ou remendo  
**Base de promoção:** MB 3.1 + MVP salão v7 + MVP cliente v3.1 + Debug Report v7 + decisão aprovada do Platform Owner  
**Rastreabilidade-base:** [MB3.1 §0–§15][BP §0–§10][RM §0–§8][SKILL §1–§8][MVP-SALAO-v7][MVP-CLIENTE-v3.1][DEBUG-v7]

---

## 0. Regra de autoridade

### 0.1 Hierarquia canônica

| Artefato | Autoridade | Limite |
|---|---|---|
| Master Brief 4.0 | Decide visão, domínios, limites, invariantes, gates e ordem de construção | Não materializa SQL |
| Blueprint Unificado | Organiza arquitetura técnica e blocos de migração | Não altera escopo canônico |
| SQL Master | Materializa verdade no banco | Não inventa domínio ou regra fora do MB |
| Dev Handoff | Orienta execução por domínio | Não cria regra soberana |
| UI Spec | Define experiência por superfície | Não calcula verdade crítica |
| Gates | Provam funcionamento real | Não substituem regra canônica |
| Skills | Auditam conformidade contínua | Não autorizam feature fora do MB |

### 0.2 Regra de bloqueio

```text
Nenhuma ambição descrita neste documento autoriza implementação antes do Gate técnico correspondente.
Nenhum documento anterior tem autoridade sobre este após aprovação formal.
Master Brief 3.1, Blueprint anterior e MVPs locais viram insumo rastreável, não fonte paralela.
```

### 0.3 Regra de atualização

```text
Toda mudança canônica exige:
1. decisão explícita do Platform Owner;
2. registro de versão;
3. reescrita completa da seção afetada;
4. atualização de gates impactados;
5. rastreabilidade interna.

Patch, remendo, delta solto e dupla verdade são proibidos.
```

### 0.4 Regra de promoção MVP → Canon

| Origem | Pode virar canon quando | Nunca vira canon quando |
|---|---|---|
| MVP salão v7 | Promovido a invariante, domínio, gate, Command, constraint ou governança | Permanece apenas cálculo local/frontend |
| MVP cliente v3.1 | Promovido a contrato de intenção, UX ou Command | Escreve verdade direta |
| Debug Report | Valida comportamento testado e limite do MVP | Substitui teste backend |
| Benchmark externo | Inspira requisito competitivo | Impõe implementação sem gate |

**Invariante:** feature demonstrada no frontend não autoriza cálculo crítico fora do backend.  
**Rastreabilidade:** [MB3.1 §0][MB3.1 §7][MB3.1 §10][BP §0][RM §1][RM §4][SKILL §4][DEBUG-v7]

---

## 1. Identidade do produto

### 1.1 Nome de mercado

**SMART Flow™**

### 1.2 Nome operacional

**HOPE OS** é a implementação operacional do SMART Flow™ para o ecossistema do Salão Esperança e expansão SaaS.

### 1.3 Significado estratégico

```text
S — Scheduling Intelligence
M — Monetization Intelligence
A — Automation with Approval
R — Retention & Relationship
T — Trust, Traceability & Ledger
```

### 1.4 Definição operacional

SMART Flow™ é o sistema operacional inteligente de agenda, capacidade, dinheiro, equipe, relacionamento, execução e confiança para negócios de beleza e bem-estar.

### 1.5 Promessa principal

```text
Menos buraco na agenda.
Mais receita por hora.
Mais margem protegida.
Mais recorrência.
Mais controle financeiro.
Menos improviso.
Menos dependência do dono.
```

### 1.6 Categoria de mercado

**Intelligent Capacity, Revenue & Trust Operating System for Beauty & Wellness**

**Rastreabilidade:** [MB3.1 §1][MB3.1 §2][MVP-SALAO-v7][MVP-CLIENTE-v3.1]

---

## 2. Tese central

SMART Flow™ não compete como agenda online.

```text
Agenda é a superfície visível.
O problema real é capacidade, margem, recorrência, equipe, dinheiro, confiança e execução.
```

### 2.1 Perguntas canônicas que o produto responde

| # | Pergunta | Domínio primário |
|---:|---|---|
| 1 | Qual horário é possível? | D07/D08 |
| 2 | Qual horário é melhor para o negócio? | D07/D23/D25 |
| 3 | Qual horário preserva margem? | D07/D12/D17/D23 |
| 4 | Qual horário deve ter proteção premium? | D07/D08/D24 |
| 5 | Qual buraco pode ser recuperado por waitlist? | D07/D09/D21/D24 |
| 6 | Qual cliente exige fricção progressiva? | D02/D24 |
| 7 | Qual cliente merece baixa fricção? | D02/D24 |
| 8 | Qual serviço preserva receita por minuto? | D06/D07/D25 |
| 9 | Qual recurso físico está bloqueado? | D11 |
| 10 | Qual profissional está livre durante pausa química? | D07/D11 |
| 11 | Qual comissão pertence a quem? | D17 |
| 12 | Quem absorve a taxa de pagamento? | D12/D13/D17 |
| 13 | A gorjeta está isolada e protegida? | D12/D15/D16/D17 |
| 14 | Alguma transação gera comissão ou receita negativa? | D12/D17 |
| 15 | Qual saldo é reconstruível no ledger? | D15/D16 |
| 16 | Qual benefício tem origem e validade? | D18 |
| 17 | Qual ação exige aprovação? | D08/D12/D13/D17/D21/D22/D23 |
| 18 | Qual automação é segura? | D21/D22/D23/D31 |
| 19 | Qual tenant está saudável? | D00/D25/D31 |
| 20 | Qual gate prova realidade? | D31 |

### 2.2 Decisão estratégica v4.0

| Tema | Decisão canônica |
|---|---|
| Agenda | Backend calcula disponibilidade e candidatos; frontend não confirma verdade |
| Multi-serviços | Booking Intent vira contrato backend, não carrinho local |
| Smart Gap | Maior slot do grupo define passo de varredura dos candidatos |
| Horário manual | É pedido de validação; não é confirmação |
| No-show | Fricção progressiva, com depósito/pré-pagamento conforme política |
| Card-on-file | Token PSP/gateway; nunca armazenar PAN |
| Waitlist | Recuperação de buraco com consentimento, oferta e Command |
| Dinheiro | Payment, ledger, wallet e compensation são backend-only |

**Rastreabilidade:** [MB3.1 §2][MB3.1 §6/D07][MB3.1 §6/D12][MB3.1 §6/D13][MB3.1 §6/D15][MB3.1 §6/D17][MB3.1 §6/D24][DEBUG-v7]

---

## 3. Arquitetura de camadas

| Camada | Nome | Responsabilidade | Gate mínimo |
|---:|---|---|---|
| 0 | Platform Layer | SaaS, tenants, billing, suporte, parceiros, gates e release control | Gate 00/01/22 |
| 1 | Fundação confiável | Tenant, RLS, setup, pessoas, catálogo, agenda base, checkout, pagamentos, ledger, wallet, compensação e caixa | Gate 00–18 |
| 2 | Agenda inteligente | Smart Availability, Slot Score, Smart Gap, Chain Booking, recursos, waitlist, recorrente, grupo e premium windows | Gate 03–09 |
| 3 | Monetização e recorrência | Pacotes, assinaturas, cashback, benefícios, rebooking, boosters, CRM e retenção | Gate 15/19 |
| 4 | IA governada | AI Receptionist, CoPilot, Action Requests, auditoria e handoff humano | Gate 16/17 |
| 5 | Plataforma e ecossistema | Marketplace, multiunidade, white-label, API pública, webhooks e parceiros | Gate 20/23/24 |

### 3.1 Regras de camada

| Regra | Bloqueio |
|---|---|
| Sem Camada 0 aprovada, Camada 1 não inicia tenant pago | Produto comercial bloqueado |
| Sem Gate 00 e Gate 01, nenhum dado real entra em produção | Tenant bloqueado |
| Sem D12–D17 aprovados, monetização avançada bloqueada | Checkout avançado bloqueado |
| Sem Action Requests, IA e automações não executam mutação sensível | Automação bloqueada |
| Sem ledger reconstruível, dashboard financeiro não é verdade | Analytics financeiro bloqueado |
| Sem Booking Candidate Contract, cliente v4 e banco de agenda não avançam | SQL de agenda bloqueado |

**Rastreabilidade:** [MB3.1 §3][MB3.1 §7][MB3.1 §10][BP §0][BP §1][RM §2][RM §6]

---

## 4. Público-alvo

### 4.1 Cliente do SaaS

| Segmento | Elegibilidade inicial |
|---|---|
| Salões de beleza | Prioritário |
| Barbearias | Prioritário |
| Esmalterias | Prioritário |
| Clínicas de estética | Após Resource/Compliance básico |
| Studios de sobrancelha/cílios | Prioritário |
| Spas urbanos | Após Resource/Package básico |
| Profissionais independentes com equipe | Prioritário |
| Redes pequenas e médias | Após multiunidade estável |

### 4.2 Cliente ideal inicial

| Dor | Domínio que resolve |
|---|---|
| Agenda cheia e lucro confuso | D07/D12/D15/D25 |
| Comissão difícil | D17 |
| Taxa de maquininha corroendo margem | D12/D13/D17 |
| Horários vazios e buracos | D07/D09/D23/D24 |
| No-show recorrente | D02/D08/D13/D24 |
| Gorjeta sem rastreio | D12/D15/D16/D17 |
| Equipe sem processo | D05/D08/D31 |
| Dono apagando incêndio | D23/D25 |
| Cliente sem recorrência | D19/D21/D24 |
| Pacote vendido sem controle | D18/D16 |
| Cashback sem lastro | D18/D16/D15 |
| WhatsApp caótico | D21/D22 |

### 4.3 Perfis de usuário

| Perfil | Busca | Limite |
|---|---|---|
| Platform Owner | MRR, churn baixo, tenants saudáveis, gates aprovados | Não acessa RLS tenant diretamente |
| Dono do salão | lucro, ocupação, margem, recorrência, controle | Não edita ledger |
| Gerente | agenda, equipe, caixa, produtividade | Não bypassa policy |
| Profissional parceiro/staff | agenda clara, comissão correta, repasses | Não vê financeiro alheio |
| Recepcionista | agendar, confirmar, encaixar, cobrar e atender rápido | Não confirma conflito |
| Cliente final | conveniência, confiança, lembretes, benefícios | Não escreve verdade direta |
| IA/Agentes | recomendar, organizar, gerar Action Request | Nunca soberania |

**Rastreabilidade:** [MB3.1 §4][MB3.1 §6/D05][MB3.1 §6/D21][MB3.1 §6/D22]

---

## 5. Superfícies do produto

| Superfície | Usuário principal | Função | Limite canônico v4.0 |
|---|---|---|---|
| App mobile | Dono, gerente, staff, recepção | Operação diária | Exibe e dispara Commands; não calcula regra crítica |
| PWA cliente | Cliente final | Booking, histórico, benefícios, preferências | Solicita Booking Request; não confirma agenda |
| Página web do salão | Cliente novo | Descoberta, conversão e booking link | Não processa pagamento direto |
| Painel Platform Owner | Platform Owner | SaaS, tenants, billing, suporte | Isolado de RLS tenant |
| API pública | Integradores | Extensão governada | Não bypassa Command |
| White-label | Enterprise | Identidade própria | Core, ledger e gates idênticos |
| WhatsApp/IA | Cliente, recepção, IA | Conversa, confirmação assistida, handoff | Gera intent/Action Request; não escreve verdade direta |

### 5.1 Limite de simulação frontend

| Permitido no frontend | Proibido no frontend |
|---|---|
| Simular sugestões visuais | Confirmar disponibilidade canônica |
| Exibir score retornado pelo backend | Calcular Slot Score final |
| Montar intenção de multi-serviço | Gravar appointment direto |
| Mostrar valor estimado como prévia | Calcular preço final |
| Coletar preferência de profissional | Validar comissão/taxa/gorjeta |
| Abrir WhatsApp com resumo | Criar pagamento/ledger/wallet |

**Rastreabilidade:** [MB3.1 §5][MB3.1 §7][MB3.1 §9][MVP-CLIENTE-v3.1][DEBUG-v7]

---

## 6. Domínios canônicos

SMART Flow™ 4.0 preserva a grade canônica **D00–D31**, sem renumeração, sem fusão e sem expansão prematura.

### 6.0 Blocos contratuais v4.0

| Bloco | Natureza | Domínios impactados |
|---|---|---|
| Booking Candidate Contract | Novo contrato interno | D07/D08/D11/D19/D21/D31 |
| Multi-Service Booking Intent | Novo contrato interno | D07/D08/D10/D19 |
| Smart Gap Law | Invariante promovida do MVP | D07/D31 |
| Manual Booking Validation Boundary | Invariante de confirmação | D07/D08/D19/D21 |
| Card-on-File / Deposit Policy | Evolução de Payment Core | D02/D13/D15/D16/D24 |
| Waitlist Recovery Engine | Evolução de waitlist econômica | D07/D08/D09/D21/D24 |
| Client Wallet / Credits | Consolidação de saldo reconstruível | D13/D15/D16/D18 |
| Frontend Simulation Boundary | Governança de superfície | D05/D07/D12/D13/D17/D19/D21 |

---

### Domínio 00 — Platform Owner Layer 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Identidade do Platform Owner, tenants, planos SaaS, billing, dunning, saúde operacional, suporte, parceiros, gates de release e auditoria de plataforma |
| v4.0 | Aprovação formal de versão, release gate e bloqueio de tenant antes de Foundation/Isolation |
| Invariante | Platform Owner nunca compartilha RLS com tenant; contextos `platform` e `tenant` nascem isolados |
| Objetos mínimos | `platform_operators`, `platform_audit_events`, `tenant_release_status`, `gate_runs`, `tenant_health_snapshots` |
| Commands | `approve_release`, `block_tenant`, `unblock_tenant`, `record_gate_result` |
| Gates | 00, 01, 22, 25 |
| RAGOV | CRÍTICO / REAL / MVP obrigatório antes de qualquer tenant |
| Rastreabilidade | [MB3.1 §6/D00][BP §0][RM §2][RM §5/D00] |

---

### Domínio 01 — Identity & Tenant 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Empresas, unidades, usuários, memberships, papéis, permissões, RLS multiempresa, timezone, moeda e contexto de sessão |
| v4.0 | Todo Booking Request, Payment, Wallet, Ledger, Gate e Action Request carrega tenant/unidade/contexto |
| Invariante | Sem tenant isolation provado por gate, produto bloqueado |
| Objetos mínimos | `tenants`, `business_units`, `memberships`, `roles`, `permission_grants`, `session_context_audit` |
| Commands | `create_tenant`, `create_unit`, `grant_membership`, `set_session_context` |
| Gates | 00, 01, 02, 22 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D01][BP §A][RM §2][RM §4 #1–#6][RM §5/D01] |

---

### Domínio 02 — Business Setup Hub 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Onboarding operacional, horários, políticas de agenda, cancelamento, no-show, canais oficiais, métodos aceitos e configuração inicial da SMART Scheduling Engine |
| v4.0 | Configura Reliability Policy, Deposit Policy, Card-on-File eligibility, premium windows e regras de fallback manual |
| Invariante | Política de no-show é backend-only e executada por Command; frontend e IA exibem exigência ou geram Action Request |
| Objetos mínimos | `unit_schedule_policies`, `reliability_policies`, `deposit_policy_matrix`, `premium_window_policies`, `official_channels` |
| Commands | `configure_reliability_policy`, `configure_deposit_policy`, `configure_booking_policy`, `approve_policy_override` |
| Gates | 00, 03, 08, 12, 16 |
| RAGOV | CRÍTICO / REAL / MVP obrigatório |
| Rastreabilidade | [MB3.1 §6/D02][MB3.1 §8][RM §4 #7–#13][RM §5/D02] |

#### D02 — escala canônica de fricção

| Estado | Critério | Regra |
|---|---:|---|
| Conscientização | 1ª falta | Mensagem empática, sem penalidade financeira automática |
| Risco médio | 2ª falta | Exige 50% de depósito no próximo booking elegível |
| Risco alto | 3+ faltas | Exige 100% de pré-pagamento quando policy ativa |
| Healing | 6 meses sem falta | Score restaurado por Command auditado |
| Trust Pass | 100% show rate | Pode liberar sinal em premium windows conforme política superior |

---

### Domínio 03 — Onboarding SaaS 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Trial, plano, primeiro acesso, seed inicial, checklist de prontidão e ativação por plano |
| v4.0 | Tenant só recebe agenda real após setup mínimo de serviços, profissionais, policy, métodos aceitos e gates fundacionais |
| Invariante | Salão só opera após onboarding completo e setup validado |
| Objetos mínimos | `onboarding_checklists`, `seed_profiles`, `activation_steps`, `readiness_status` |
| Commands | `start_onboarding`, `complete_onboarding_step`, `activate_unit` |
| Gates | 00, 01, 03, 25 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D03][RM §5/D03] |

---

### Domínio 04 — Billing & SaaS Finance 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Planos, limites, cobrança recorrente, upgrade, downgrade, dunning, inadimplência, notas fiscais SaaS e histórico financeiro do tenant |
| v4.0 | Billing SaaS bloqueia ou limita tenant sem misturar com checkout operacional do salão |
| Invariante | Billing SaaS não se mistura com checkout, wallet, comissão, caixa ou ledger operacional do tenant |
| Objetos mínimos | `plans`, `subscriptions`, `tenant_invoices`, `dunning_events`, `billing_ledger_refs` |
| Commands | `create_subscription`, `change_plan`, `record_dunning_event`, `suspend_for_billing` |
| Gates | 00, 22, 25 |
| RAGOV | CRÍTICO / REAL / MVP antes de aceitar tenant pago |
| Rastreabilidade | [MB3.1 §6/D04][RM §5/D04] |

---

### Domínio 05 — People Hub

| Campo | Definição |
|---|---|
| Responsável por | Staff, clientes, consentimentos, preferências, horários, serviços executáveis, notas operacionais, vínculos cliente-profissional e configuração operacional de comissão |
| v4.0 | Pessoas armazenam elegibilidade e preferência usadas por Booking Intent; não calculam saldo, comissão ou score final |
| Invariante | Staff financeiro é privado; configuração operacional não vira saldo |
| Objetos mínimos | `clients`, `staff`, `staff_services`, `staff_schedules`, `client_preferences`, `consents`, `staff_compensation_profile` |
| Commands | `create_client`, `update_client_preference`, `configure_staff_services`, `record_consent` |
| Gates | 02, 03, 14, 17 |
| RAGOV | REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D05][MB3.1 §7][RM §4 #15–#21][RM §5/D05] |

---

### Domínio 06 — Catalog & Offer Hub

| Campo | Definição |
|---|---|
| Responsável por | Serviços, categorias, duração, preço base, preço por profissional, produtos comerciais, add-ons, combos, componentes, yield profile e ofertas |
| v4.0 | Serviço declara duração, slot, recurso crítico, pausa/processamento e elegibilidade de booster; não decide preço final sozinho |
| Invariante | Preço base, duração e yield profile são configuráveis por tenant; não há estoque canônico neste produto |
| Objetos mínimos | `services`, `service_categories`, `service_staff_overrides`, `service_components`, `offer_profiles`, `yield_profiles` |
| Commands | `create_service`, `configure_service_slot`, `configure_service_component`, `set_yield_profile` |
| Gates | 03, 05, 08, 10 |
| RAGOV | REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D06][RM §4 #22–#34][RM §5/D06][MVP-SALAO-v7] |

---

### Domínio 07 — SMART Scheduling Engine 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Cálculo backend-only de disponibilidade, qualidade de slot, Smart Gap, Chain Booking, recursos, premium window, multi-serviços, pausa química e ranking de utilização |
| v4.0 | Dono do Booking Candidate Contract, Smart Gap Law, Multi-Service Booking Intent e Manual Validation Boundary |
| Invariante | D07 calcula, ranqueia e explica; nunca altera agenda, pagamento, comissão, wallet ou ledger sozinho |
| Objetos mínimos | `booking_requests`, `booking_candidates`, `booking_candidate_components`, `slot_score_snapshots`, `availability_holds`, `scheduling_explanations` |
| Commands | `create_booking_request`, `generate_booking_candidates`, `reserve_candidate_hold`, `expire_candidate_hold` |
| Gates | 03, 04, 05, 07, 08, 09 |
| RAGOV | CRÍTICO / REAL / CORE MVP |
| Rastreabilidade | [MB3.1 §6/D07][MB3.1 §10/Gate03][MB3.1 §10/Gate05][RM §4 #28][RM §4 #40][RM §5/D07][DEBUG-v7] |

#### D07.1 Submotores canônicos

| # | Submotor | Função |
|---:|---|---|
| 1 | Smart Availability | Retorna slots possíveis sem conflito |
| 2 | Slot Score | Ranqueia qualidade do slot |
| 3 | Smart Gap Prevention | Evita criar buracos ruins |
| 4 | Smart Gap Recovery | Recupera buracos existentes por oferta/waitlist |
| 5 | Chain Booking Engine | Organiza componentes sequenciais/paralelos |
| 6 | Resource Locking Plan | Bloqueia recurso crítico |
| 7 | Premium Window Protection | Protege horários nobres |
| 8 | Multi-Service Aggregation | Consolida múltiplos serviços em intenção única |
| 9 | Processing Pause Optimization | Libera staff quando serviço permite pausa |
| 10 | Staff Utilization Ranking | Equilibra capacidade de equipe |
| 11 | Yield Management Engine | Recomenda booster/taxa premium governados |
| 12 | Reliability-Aware Booking Policy | Aplica modificador de risco/confiança |

#### D07.2 Slot Score canônico

```text
Slot Score =
α Gap Score
+ β Adjacency Score
+ γ Revenue Preservation Score
+ δ Utilization Score
+ ε Preference Score
+ ζ Reliability Score Modifier
+ η Yield Modifier
+ θ Resource Fit Score
+ ι Multi-Service Efficiency Score
```

| Regra | Definição |
|---|---|
| Pesos | Configuráveis por unidade |
| Cálculo | Backend-only |
| Explicação | Snapshot persistido para auditoria |
| Mutação | Score não agenda sozinho |

#### D07.3 Smart Gap Law v4.0

| Lei | Regra |
|---|---|
| SG-01 | Em multi-serviços, o maior slot do grupo define o passo de varredura dos candidatos |
| SG-02 | Duração sequencial é soma das durações dos componentes |
| SG-03 | Tempo real no salão pode ser menor quando múltiplos profissionais executam em paralelo |
| SG-04 | Candidato recomendado cola com atendimento existente ou reduz buraco econômico |
| SG-05 | Candidato neutro não cria buraco crítico |
| SG-06 | Candidato ruim pode ser exibido com alerta, mas não é bloqueado visualmente se policy permitir |
| SG-07 | Horário manual é `manual_validation`, não confirmação |
| SG-08 | Backend valida conflito, recurso, staff, horário, política de no-show, depósito e confirmação final |

#### D07.4 Booking Candidate Contract

| Campo | Obrigatório | Fonte |
|---|---:|---|
| `tenant_id` | Sim | D01 |
| `unit_id` | Sim | D01 |
| `booking_request_id` | Sim | D07 |
| `candidate_id` | Sim | D07 |
| `intent_mode` | Sim | D19/D07 |
| `start_at` | Sim | D07 |
| `end_at` | Sim | D07 |
| `sequential_duration_min` | Sim | D06/D07 |
| `estimated_presence_min` | Sim | D07 |
| `largest_slot_min` | Sim | D06/D07 |
| `gap_class` | Sim | D07 |
| `score_snapshot_id` | Sim | D07/D25 |
| `requires_deposit` | Sim | D02/D13/D24 |
| `hold_expires_at` | Sim | D08 |
| `explanation` | Sim | D07 |

#### D07.5 Booking Intent modes

| Modo | Regra | Resultado |
|---|---|---|
| `single_service` | Um serviço, um ou mais profissionais elegíveis | Candidatos simples |
| `multi_service` | Serviços múltiplos em mesma intenção | Candidatos por componentes |
| `preferred_professional` | Profissional precisa executar todos os serviços | Sequência com mesmo staff |
| `optimize_time` | Serviços podem dividir equipe | Menor tempo estimado no salão |
| `manual_validation` | Cliente/recepção escolhe horário fora das sugestões | Backend valida antes de confirmar |
| `group_booking` | Participantes múltiplos | Avaliação por pagador/beneficiário |

---

### Domínio 08 — Agenda Core 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Appointments, holds, bloqueios, cancelamentos, remarcações, no-show, waitlist, origem do agendamento, snapshot de score e histórico de status |
| v4.0 | Transforma Booking Candidate aceito em appointment/group/components por Command |
| Invariante | Agenda executa mutação via Command e preserva histórico; no-show nunca some do histórico por edição direta |
| Objetos mínimos | `appointments`, `appointment_groups`, `appointment_components`, `appointment_events`, `appointment_status_history`, `appointment_holds` |
| Commands | `confirm_booking_candidate`, `reschedule_appointment`, `cancel_appointment`, `mark_no_show`, `release_hold` |
| Gates | 03, 04, 05, 06, 07, 08, 09 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D08][MB3.1 §7][RM §5/D08][DEBUG-v7] |

---

### Domínio 09 — Agendamento Recorrente

| Campo | Definição |
|---|---|
| Responsável por | Séries recorrentes, pausa, cancelamento de ocorrência, cancelamento de série, notificação e snapshot financeiro por ocorrência |
| v4.0 | Cada ocorrência usa Booking Candidate/Availability quando criada ou reprocessada |
| Invariante | Cancelar uma ocorrência nunca cancela a série sem confirmação explícita |
| Objetos mínimos | `recurring_series`, `recurring_occurrences`, `recurring_events` |
| Commands | `create_recurring_series`, `pause_series`, `cancel_occurrence`, `cancel_series` |
| Gates | 06, 16, 17 |
| RAGOV | REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D09][MB3.1 §10/Gate06][RM §5/D09] |

---

### Domínio 10 — Agendamento em Grupo

| Campo | Definição |
|---|---|
| Responsável por | Grupo vinculado, grupo independente, checkout unificado/dividido, cancelamento individual/coletivo e notificações |
| v4.0 | Grupo usa `appointment_group` e componentes distintos; reliability avaliada por pagador e beneficiário |
| Invariante | Grupo vinculado e grupo independente são modelos distintos no banco |
| Objetos mínimos | `booking_groups`, `group_participants`, `group_payment_responsibility`, `group_appointment_links` |
| Commands | `create_group_booking_request`, `confirm_group_booking`, `cancel_group_participant` |
| Gates | 07, 10, 12, 16 |
| RAGOV | REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D10][MB3.1 §10/Gate07][RM §5/D10] |

---

### Domínio 11 — Resource Orchestration

| Campo | Definição |
|---|---|
| Responsável por | Recursos físicos, capacidade, disponibilidade, manutenção, bloqueios, requisitos de serviço e compatibilidade |
| v4.0 | Resource Lock é parte obrigatória do Booking Candidate quando serviço exige recurso crítico |
| Invariante | Recurso crítico não pode ter dois atendimentos incompatíveis simultâneos |
| Objetos mínimos | `resources`, `resource_types`, `service_resource_requirements`, `resource_locks`, `resource_maintenance_windows` |
| Commands | `reserve_resource_lock`, `release_resource_lock`, `schedule_resource_maintenance` |
| Gates | 04, 05, 08 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D11][RM §4 #35][RM §4 #40][RM §5/D11] |

---

### Domínio 12 — Checkout Core 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Transformar atendimento, grupo, produto, add-on, pacote ou assinatura em venda rastreável; calcular subtotal, desconto, benefício, gorjeta, total final e sessão auditável no backend |
| v4.0 | Recebe appointment/components confirmados e executa total backend-only com negative guard |
| Invariante | Frontend nunca calcula total, taxa, comissão, gorjeta, desconto final, split, benefício ou receita líquida |
| Objetos mínimos | `checkout_sessions`, `checkout_items`, `checkout_discounts`, `checkout_tip_allocations`, `checkout_total_snapshots` |
| Commands | `open_checkout_session`, `apply_authorized_discount`, `calculate_checkout_total`, `close_checkout_session` |
| Gates | 10, 11, 12, 14, 15 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D12][MB3.1 §10/Gate10][RM §5/D12][RM §6][MVP-SALAO-v7] |

#### D12.1 Pipeline canônico v4.0

| Etapa | Regra |
|---:|---|
| 1 | Carregar sessão e itens autorizados |
| 2 | Validar tenant, unidade, cliente, staff e appointment |
| 3 | Aplicar preço/base configurado |
| 4 | Aplicar desconto autorizado |
| 5 | Isolar gorjeta |
| 6 | Calcular taxas por forma de pagamento |
| 7 | Aplicar política de absorção de taxa |
| 8 | Calcular comissão elegível |
| 9 | Validar negative guard |
| 10 | Fechar total backend-only |
| 11 | Enviar para Payment Core |
| 12 | Publicar evento/outbox |

#### D12.2 Tip Isolation

| Regra | Definição |
|---|---|
| TI-01 | Gorjeta não entra na base de comissão |
| TI-02 | Gorjeta não sofre desconto global |
| TI-03 | Gorjeta não compõe receita do salão |
| TI-04 | Gorjeta gera ledger/account entry própria para o profissional |
| TI-05 | Gorjeta vai 100% para o profissional destinatário, salvo taxa absorvida por política explícita fora da comissão |
| TI-06 | Gorjeta sem destino contábil bloqueia checkout |

---

### Domínio 13 — Payment Core 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Pagamentos simples, mistos, depósito, pré-pagamento, card-on-file tokenizado, gateway events, estorno, reembolso e reconciliação |
| v4.0 | Executa depósitos exigidos por reliability/no-show policy e usa token PSP/gateway, sem armazenar PAN |
| Invariante | Pagamento não cria saldo sem ledger; depósito de no-show não bypassa checkout, wallet ou ledger |
| Objetos mínimos | `payment_intents`, `payment_method_tokens`, `payment_allocations`, `deposits`, `refunds`, `gateway_events`, `card_consent_records` |
| Commands | `create_payment_intent`, `capture_deposit`, `capture_card_on_file_charge`, `refund_payment`, `reconcile_gateway_event` |
| Gates | 10, 11, 12, 13, 16 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D13][MB3.1 §10/Gate12][RM §5/D13][DEC-PO-01] |

#### D13.1 Card-on-File Policy v4.0

| Regra | Definição |
|---|---|
| COF-01 | Sistema armazena token PSP/gateway, nunca PAN |
| COF-02 | Consentimento explícito é obrigatório para cobrança futura |
| COF-03 | Cobrança de no-show exige policy ativa, evento real, Command e ledger |
| COF-04 | Cliente deve visualizar regra de depósito/pré-pagamento antes de confirmar |
| COF-05 | Reembolso ou reversão gera lançamento reverso auditável |
| COF-06 | Falha de cobrança não altera agenda sem Command de status |

---

### Domínio 14 — Cash & Register Management

| Campo | Definição |
|---|---|
| Responsável por | Abertura, sangria, suprimento, fechamento, divergência, autorização e histórico de sessões |
| v4.0 | Caixa físico referencia ledger e separa gorjeta, depósito, receita e repasse |
| Invariante | Toda movimentação de caixa gera ledger ou referência reconciliável ao ledger |
| Objetos mínimos | `cash_sessions`, `cash_movements`, `cash_closing_reports`, `cash_discrepancies` |
| Commands | `open_cash_session`, `record_cash_movement`, `close_cash_session`, `approve_cash_discrepancy` |
| Gates | 11, 18 |
| RAGOV | REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D14][MB3.1 §10/Gate18][RM §5/D14] |

---

### Domínio 15 — Financial Ledger 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Livro-razão append-only, double-entry, transações financeiras reais, reconciliação, antifraude e reconstrução de saldo |
| v4.0 | Distingue receita, comissão, gorjeta, taxa, depósito, pré-pagamento, estorno, wallet, repasse, SaaS billing e cash |
| Invariante | Se saldo não é reconstruível pelo ledger, não é verdade |
| Objetos mínimos | `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `ledger_reversal_links`, `ledger_rebuild_runs` |
| Commands | `post_ledger_transaction`, `reverse_ledger_transaction`, `rebuild_ledger_projection` |
| Gates | 00, 10, 11, 12, 13, 14, 18, 19 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D15][MB3.1 §7][MB3.1 §10/Gate11][BP §0][RM §4][RM §6] |

---

### Domínio 16 — Wallet & Current Accounts 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Conta corrente de cliente, conta corrente de staff, créditos, cashback, produção, adiantamentos, repasses, saldo projetado e histórico |
| v4.0 | Client Wallet consolida créditos, depósitos reutilizáveis, reembolsos, cashback e benefícios monetários reconstruíveis |
| Invariante | Wallet/current account é projeção reconstruível; drift bloqueia aprovação |
| Objetos mínimos | `wallet_accounts`, `wallet_entries`, `client_credits`, `staff_current_account_entries`, `wallet_rebuild_runs` |
| Commands | `credit_client_wallet`, `consume_wallet_credit`, `post_staff_current_account_entry`, `rebuild_wallet_balance` |
| Gates | 11, 12, 13, 15, 19 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D16][MB3.1 §10/Gate13][RM §5/D16][DEC-PO-01] |

---

### Domínio 17 — Compensation Engine 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Regras de comissão, remuneração composta, overrides, cálculo, confirmação, ajustes, repasses, adiantamentos, privacidade financeira e painel do profissional |
| v4.0 | Calcula comissão apenas após checkout backend válido; gorjeta é conta própria e não comissão |
| Invariante | Compensation calcula no backend, deriva de venda real e preserva privacidade por staff |
| Objetos mínimos | `compensation_rules`, `commission_entries`, `tip_entries`, `payout_requests`, `payout_batches`, `commission_adjustment_requests` |
| Commands | `calculate_commission`, `confirm_commission`, `request_payout`, `approve_commission_adjustment` |
| Gates | 02, 10, 11, 14, 16 |
| RAGOV | CRÍTICO / REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D17][MB3.1 §10/Gate14][RM §5/D17][RM §6][MVP-SALAO-v7] |

#### D17.1 Modelos nativos

| Modelo | Uso | Regra |
|---|---|---|
| Bruto Salão | CLT/equipe interna | Salão absorve taxa financeira; comissão sobre bruto líquido de desconto |
| Dividido | parceiro/MEI | Taxa da maquininha deduzida antes da comissão |
| Bruto Staff | coworking/sublocação | Profissional absorve taxa sobre comissão/produção dele |

---

### Domínio 18 — Benefits, Packages & Memberships

| Campo | Definição |
|---|---|
| Responsável por | Pacotes, assinaturas, cashback, fidelidade, créditos promocionais, cupons, cortesias e benefícios VIP |
| v4.0 | Benefícios monetários passam por Wallet/Ledger; benefício não mascara margem negativa |
| Invariante | Todo benefício tem origem, validade, consumo e rastreabilidade |
| Objetos mínimos | `packages`, `memberships`, `benefits`, `benefit_grants`, `benefit_consumptions`, `cashback_rules` |
| Commands | `grant_benefit`, `consume_benefit`, `expire_benefit`, `rebuild_benefit_balance` |
| Gates | 10, 13, 15, 19 |
| RAGOV | REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D18][MB3.1 §10/Gate15][RM §5/D18] |

---

### Domínio 19 — Client Experience Hub

| Campo | Definição |
|---|---|
| Responsável por | Portal do cliente, booking link, histórico, preferências, benefícios, remarcação, reviews verificados e indicação |
| v4.0 | PWA cliente coleta Booking Intent, mostra candidatos retornados pelo backend e dispara Commands |
| Invariante | Portal do cliente dispara Commands; não escreve verdade direta |
| Objetos mínimos | `client_portal_sessions`, `booking_intents`, `client_booking_preferences`, `client_visible_snapshots` |
| Commands | `submit_booking_intent`, `accept_booking_candidate`, `request_reschedule`, `request_cancellation` |
| Gates | 03, 07, 09, 12, 16, 17 |
| RAGOV | REAL / MVP para booking/histórico; PARCIAL para indicação/reviews avançados |
| Rastreabilidade | [MB3.1 §6/D19][RM §5/D19][MVP-CLIENTE-v3.1][DEBUG-v7] |

---

### Domínio 20 — Página Web do Salão

| Campo | Definição |
|---|---|
| Responsável por | Página pública, identidade visual, endereço, horários, serviços, avaliações verificadas, botão de agendamento, planos, pacotes, WhatsApp e SEO |
| v4.0 | Página pública inicia Booking Intent e exibe condições publicadas; não calcula depósito nem preço final |
| Invariante | Página web converte; não processa pagamento direto |
| Objetos mínimos | `public_pages`, `public_service_snapshots`, `booking_links`, `published_policies` |
| Commands | `publish_booking_page`, `update_public_service_snapshot`, `create_booking_link` |
| Gates | 03, 17, 20 |
| RAGOV | REAL / MVP |
| Rastreabilidade | [MB3.1 §6/D20][RM §5/D20] |

---

### Domínio 21 — Messaging & Conversations

| Campo | Definição |
|---|---|
| Responsável por | WhatsApp, SMS, e-mail, push, templates, consentimento, logs, intent detection e human handoff |
| v4.0 | Mensagens transportam intent, oferta de waitlist, confirmação assistida e handoff; não alteram verdade diretamente |
| Invariante | Mensagem não altera verdade diretamente; gera intent, Command autorizado ou Action Request |
| Objetos mínimos | `conversation_threads`, `message_events`, `message_templates`, `delivery_status`, `communication_consents`, `waitlist_offer_messages` |
| Commands | `send_message`, `record_inbound_intent`, `send_waitlist_offer`, `handoff_to_human` |
| Gates | 09, 16, 17, 20 |
| RAGOV | REAL / MVP outbound/lembretes; PARCIAL inbound completo |
| Rastreabilidade | [MB3.1 §6/D21][MB3.1 §8][RM §5/D21][MVP-CLIENTE-v3.1] |

---

### Domínio 22 — AI Receptionist Engine

| Campo | Definição |
|---|---|
| Responsável por | Atendimento assistido, dúvidas frequentes, booking links, cancelamento/reagendamento assistido, solicitação de depósito, pré-visita, handoff humano e logs de IA |
| v4.0 | IA pode explicar depósito, apresentar candidatos backend e gerar Action Request; não agenda, cobra, perdoa ou altera preço soberanamente |
| Invariante | IA Receptionist gera Action Request; nunca executa ação crítica soberana |
| Objetos mínimos | `ai_sessions`, `ai_recommendations`, `ai_action_request_links`, `ai_safety_logs` |
| Commands | `record_ai_recommendation`, `create_ai_action_request`, `handoff_ai_conversation` |
| Gates | 16, 17, 20 |
| RAGOV | PARCIAL / MVP consultivo; REAL após Gate 16 e Gate 17 |
| Rastreabilidade | [MB3.1 §6/D22][MB3.1 §8][MB3.1 §10/Gate16][MB3.1 §10/Gate17][RM §5/D22] |

---

### Domínio 23 — CoPilot Revenue Engine

| Campo | Definição |
|---|---|
| Responsável por | Oportunidades econômicas governadas com impacto, probabilidade, margem, urgência, confiança, risco e ação recomendada |
| v4.0 | Recomendação econômica usa Booking Candidate, Smart Gap Recovery, waitlist, premium windows e margem real |
| Invariante | CoPilot recomenda; nunca cria pagamento, ledger, comissão, wallet ou benefício diretamente |
| Objetos mínimos | `revenue_opportunities`, `booster_recommendations`, `opportunity_action_requests`, `opportunity_outcomes` |
| Commands | `create_revenue_opportunity`, `request_booster_approval`, `record_opportunity_outcome` |
| Gates | 08, 09, 16, 19 |
| RAGOV | PARCIAL / MVP consultivo; REAL com execução governada após Gate 17 |
| Rastreabilidade | [MB3.1 §6/D23][MB3.1 §8][RM §5/D23] |

---

### Domínio 24 — Retention & CRM Engine

| Campo | Definição |
|---|---|
| Responsável por | Segmentação, churn risk, frequency drift, VIP monitoring, pacote sem uso, assinatura em risco, régua de relacionamento, campanhas por dado real, consentimento e medição de resultado |
| v4.0 | Client Reliability Engine governa fricção, trust pass, healing, premium eligibility e depósito |
| Invariante | CRM respeita consentimento e mede resultado com dado real; não inventa risco, ROI ou churn |
| Objetos mínimos | `client_reliability_scores`, `show_rate_snapshots`, `friction_requirements`, `healing_events`, `trust_passes`, `crm_segments` |
| Commands | `calculate_reliability_score`, `apply_friction_requirement`, `restore_score_by_healing`, `grant_trust_pass` |
| Gates | 08, 09, 12, 16, 19 |
| RAGOV | REAL após Camada 1 estável |
| Rastreabilidade | [MB3.1 §6/D24][RM §4 #20–#21][RM §4 #83][RM §4 #100][RM §5/D24] |

---

### Domínio 25 — Analytics & Decision Intelligence

| Campo | Definição |
|---|---|
| Responsável por | Cockpit do dono, ocupação, RevPAH, margem, recorrência, churn, dashboard profissional, financeiro, ROI da agenda, benchmarking e read models reconstruíveis |
| v4.0 | Analytics mede Smart Gap, tempo no salão, taxa de conversão de waitlist, impacto de depósito e commission by model |
| Invariante | Dashboard não decide verdade; read models são reconstruíveis |
| Objetos mínimos | `analytics_snapshots`, `occupancy_read_models`, `revenue_per_available_hour`, `waitlist_conversion_metrics`, `commission_model_metrics` |
| Commands | `rebuild_analytics_projection`, `publish_owner_snapshot`, `verify_read_model_hash` |
| Gates | 11, 13, 19 |
| RAGOV | PARCIAL MVP core; REAL completo após Gate 18 e Gate 19 |
| Rastreabilidade | [MB3.1 §6/D25][MB3.1 §10/Gate19][RM §5/D25] |

---

### Domínio 26 — Fiscal & Compliance Brasil

| Campo | Definição |
|---|---|
| Responsável por | NFS-e, regime tributário, ISS, retenções, LGPD e Lei do Salão Parceiro |
| v4.0 | Documentos distinguem receita do salão, comissão, taxa, gorjeta, repasse, depósito e wallet |
| Invariante | Produção comercial no Brasil exige NFS-e configurável e LGPD implementada |
| Objetos mínimos | `fiscal_profiles`, `tax_documents`, `lgpd_consents`, `data_subject_requests`, `partner_law_records` |
| Commands | `issue_tax_document`, `record_lgpd_consent`, `process_data_subject_request` |
| Gates | 21, 25 |
| RAGOV | CRÍTICO / REAL antes de produção comercial |
| Rastreabilidade | [MB3.1 §6/D26][MB3.1 §10/Gate21][RM §5/D26] |

---

### Domínio 27 — Marketplace

| Campo | Definição |
|---|---|
| Responsável por | Perfil público, descoberta, disponibilidade em tempo real, avaliações verificadas, comissão por agendamento e base para marketplace externo |
| v4.0 | Marketplace só consome candidatos e políticas publicadas; não bypassa booking/payment/ledger |
| Invariante | Marketplace nunca bypassa checkout, payment, ledger ou comissão do tenant |
| Objetos mínimos | `marketplace_profiles`, `marketplace_booking_links`, `marketplace_reviews`, `marketplace_commission_rules` |
| Commands | `publish_marketplace_profile`, `create_marketplace_booking_request`, `record_verified_review` |
| Gates | 20, 23, 25 |
| RAGOV | REAL Fase 1 após Gate 19; REAL Fase 2 após Gate 20 |
| Rastreabilidade | [MB3.1 §6/D27][MB3.1 §10/Gate23][RM §5/D27] |

---

### Domínio 28 — Multiunidade Enterprise

| Campo | Definição |
|---|---|
| Responsável por | Cockpit consolidado, drill-down por unidade, ledgers separados, profissional cross-unidade, benchmarking e overrides por unidade |
| v4.0 | Booking, reliability, comissão, taxa, gorjeta, yield e ledger são calculados por unidade de prestação |
| Invariante | Ledgers de unidades diferentes não se misturam; consolidação é view |
| Objetos mínimos | `enterprise_groups`, `unit_memberships`, `cross_unit_staff_links`, `enterprise_snapshots` |
| Commands | `link_enterprise_unit`, `assign_cross_unit_staff`, `rebuild_enterprise_snapshot` |
| Gates | 01, 02, 19, 24 |
| RAGOV | REAL após unidade única estável e Gate 20 |
| Rastreabilidade | [MB3.1 §6/D28][MB3.1 §10/Gate24][RM §5/D28] |

---

### Domínio 29 — App White-Label

| Campo | Definição |
|---|---|
| Responsável por | Nome, ícone, cores, splash, domínio próprio e experiência enterprise sobre o core |
| v4.0 | White-label apenas apresenta; não altera booking, ledger, RLS, Commands ou Gates |
| Invariante | White-label é apresentação; core, ledger, RLS, Commands e Gates são idênticos |
| Objetos mínimos | `white_label_configs`, `brand_assets`, `custom_domains` |
| Commands | `configure_white_label`, `verify_custom_domain`, `publish_brand_assets` |
| Gates | 20, 24, 25 |
| RAGOV | PARCIAL; liberado após estabilidade comprovada do core |
| Rastreabilidade | [MB3.1 §6/D29][RM §5/D29] |

---

### Domínio 30 — Integration Platform

| Campo | Definição |
|---|---|
| Responsável por | API pública versionada, webhooks, retry, logs, conectores, outbox e segurança de integração |
| v4.0 | Integrações recebem eventos de Booking Candidate, reliability, booster, premium window e compensation model sem mutar verdade direta |
| Invariante | Integração não bypassa Command; webhook não altera verdade diretamente |
| Objetos mínimos | `api_clients`, `webhook_subscriptions`, `webhook_events`, `integration_logs`, `outbox_events` |
| Commands | `register_api_client`, `emit_webhook_event`, `retry_webhook_delivery`, `revoke_api_client` |
| Gates | 00, 16, 17, 20 |
| RAGOV | PARCIAL MVP webhooks básicos; REAL após Gate 19 e Gate 20 |
| Rastreabilidade | [MB3.1 §6/D30][RM §4 #97][RM §5/D30] |

---

### Domínio 31 — Gate, QA & Governance 🔴 CRÍTICO

| Campo | Definição |
|---|---|
| Responsável por | Gates, fixtures, rollback, auditoria, promoção de release, segurança, RLS, observabilidade e política de qualidade |
| v4.0 | Gates cobrem Booking Candidate Contract, Smart Gap Law, manual validation, card-on-file, deposit, waitlist recovery e frontend boundary |
| Invariante | Feature sem gate é hipótese; feature crítica sem gate é bloqueada |
| Objetos mínimos | `gate_runs`, `gate_fixtures`, `gate_assertions`, `gate_failures`, `release_approvals`, `red_team_findings` |
| Commands | `run_gate`, `record_gate_assertion`, `approve_release`, `reject_release` |
| Gates | 00–25 |
| RAGOV | CRÍTICO / REAL / obrigatório desde o início |
| Rastreabilidade | [MB3.1 §6/D31][MB3.1 §10][RM §5/D31][DEBUG-v7] |

---

## 7. Regras absolutas de arquitetura

```text
1. Backend é a única fonte da verdade.
2. Frontend nunca calcula saldo, comissão, ledger, cashback, pacote, assinatura,
   preço final, disponibilidade canônica, benefício, repasse, taxa, gorjeta,
   total de checkout, score de confiabilidade ou yield final.
3. Frontend exibe, filtra visualmente, solicita ação e dispara Command.
4. Toda escrita crítica segue UI/Agent → API → Command → DB Transaction
   → Ledger/History/Outbox → Projection → UI.
5. Ledger é append-only e double-entry.
6. Saldo não reconstruível não é verdade.
7. IA nunca é soberana.
8. Automação sensível exige Action Request.
9. RLS é real, não filtro visual.
10. Platform Owner e tenant são isolados desde a foundation.
11. Outbox governa efeitos assíncronos.
12. Mutação financeira exige idempotency key.
13. Campos monetários usam `_cents bigint`; taxas e percentuais usam `numeric`.
14. Integridade crítica é constraint, FK, chave composta ou EXCLUDE; não código solto.
15. Read model é permitido somente se reconstruível.
16. Dupla verdade, engine paralela e tabela proibida são bloqueios.
17. Gate antes de promoção.
18. Booking Candidate é contrato backend, não lista local.
19. Horário manual é validação pendente, não confirmação.
20. Card-on-file é token PSP/gateway; PAN nunca é armazenado.
```

**Rastreabilidade:** [MB3.1 §7][MB3.1 §10][BP §0][BP §A][RM §2][RM §4][RM §6][RM §7][SKILL §4][DEC-PO-01]

---

## 8. Action Requests — contrato de governança

### 8.1 Estados

```text
draft → ready_for_review → approved → executing → executed → rejected → cancelled → failed
```

### 8.2 Ações que exigem Action Request

| Ação | Domínio |
|---|---|
| Perdoar no-show após risco médio/alto | D02/D24 |
| Reduzir ou remover depósito obrigatório | D02/D13/D24 |
| Aplicar desconto/booster fora de política aprovada | D12/D23 |
| Aplicar taxa premium manual | D07/D12/D23 |
| Alterar regra de comissão vigente | D17 |
| Ajustar comissão ou payout | D17 |
| Consumir benefício sensível | D18 |
| Cancelar série recorrente inteira | D09 |
| Enviar campanha sem régua aprovada | D21/D24 |
| Cobrar no-show por card-on-file | D13/D24 |
| Usar waitlist com incentivo econômico | D09/D21/D23 |
| Qualquer automação com impacto financeiro ou reputacional relevante | D21/D22/D23 |

### 8.3 Proibições

| Proibição | Motivo |
|---|---|
| Action Request criar ledger direto | Ledger só por Command financeiro |
| Action Request criar pagamento direto | Payment Core é dono |
| Action Request criar comissão direta | Compensation Engine é dono |
| Action Request criar benefício sem Command | D18 é dono |
| Action Request enviar WhatsApp sem consentimento | D21/D26 |
| IA executar ação crítica sem aprovação | D22/D31 |

**Rastreabilidade:** [MB3.1 §8][MB3.1 §10/Gate16][MB3.1 §10/Gate17][RM §6]

---

## 9. RAGOV completo

### 9.1 REAL

| Categoria | Itens |
|---|---|
| Fundação | Platform Owner Layer, Billing SaaS, Identity & Tenant, Business Setup, Onboarding |
| Operação | People Hub, Catalog Hub, Agenda Core, SMART Scheduling Engine, Resource Orchestration |
| Booking v4.0 | Booking Candidate Contract, Multi-Service Booking Intent, Smart Gap Law, Manual Validation Boundary |
| Agenda avançada | Slot Score, Yield Management governado, Chain Booking, waitlist econômica, recorrente, grupo, premium windows |
| Confiança | Progressive No-Show Protection, Client Reliability Score, Deposit Policy, Card-on-File tokenizado |
| Dinheiro | Checkout backend-only, pagamentos simples/mistos, depósitos, pré-pagamento, ledger, wallet, caixa |
| Equipe | Três modelos nativos de comissão, isolamento absoluto de gorjetas, negative guard, privacidade staff |
| Relacionamento | Portal do cliente, página pública, WhatsApp outbound governado, CRM com consentimento |
| Governança | Action Requests, Gates 00–25, outbox, analytics reconstruível, LGPD, Fiscal Brasil |

### 9.2 PARCIAL

| Item | Condição para REAL |
|---|---|
| AI Receptionist inbound completo | Gate 16/17 + logs + handoff |
| CoPilot com execução autônoma governada | Política pré-aprovada + Action Request + Gate |
| Analytics preditivo | Read models reconstruíveis + validação estatística |
| Marketplace externo | Core estável + Gate 20/23 |
| Multiunidade enterprise | Unidade única estável + Gate 24 |
| App white-label | Core estável + Gate 25 |
| Integrações avançadas | API registry + webhooks + Gate 20 |
| Dynamic pricing executável sem revisão humana | Política pré-aprovada + Gate específico existente |

### 9.3 MOCKADO — proibido em fluxo crítico

| Proibido | Bloqueio |
|---|---|
| Saldo fake | D15/D16 |
| Comissão fake | D17 |
| Disponibilidade fake | D07/D08 |
| Checkout fake | D12 |
| Pagamento fake | D13 |
| Benefício fake | D18 |
| Score de confiabilidade fake | D24 |
| Yield fake | D07/D23 |
| Gorjeta sem ledger | D12/D15/D16/D17 |
| Dashboard com número inventado | D25 |
| IA fingindo execução | D22 |
| Nota fiscal simulada em produção | D26 |

### 9.4 HARDCODED — permitido apenas em fixture/gate controlado

| Permitido | Condição |
|---|---|
| IDs de seed | Fixture/gate |
| Dados de sandbox | Ambiente isolado |
| Thresholds iniciais | Explicitados e versionados |
| Exemplos de UI | Sem mutação crítica |
| Taxas demonstrativas | Apenas fixture; produção usa configuração |

### 9.5 CRÍTICO

| Item |
|---|
| RLS e tenant isolation |
| Platform Owner isolation |
| Booking Candidate Contract |
| Smart Availability |
| Appointment Conflict |
| Resource Locks |
| Checkout totals |
| Payment allocation |
| Ledger double-entry |
| Wallet drift |
| Commission privacy |
| Tip isolation |
| Negative guard |
| Benefit consumption |
| Reliability score |
| Card-on-file consent |
| Deposit policy |
| Action Requests |
| AI governance |
| Outbox |
| Fiscal |
| LGPD |
| Gates |

### 9.6 BLOQUEADO

| Bloqueio |
|---|
| Frontend calculando regra crítica |
| IA soberana |
| WhatsApp agendando diretamente |
| Automação criando ledger |
| Automação criando pagamento |
| Automação alterando comissão |
| Dynamic pricing automático sem governança |
| Marketplace antes do core |
| Staff vendo financeiro alheio |
| Benefício sem origem |
| Saldo não reconstruível |
| Comissão negativa |
| Receita líquida negativa |
| Gorjeta entrando em receita do salão |
| PAN armazenado no produto |
| Mistura de ledgers entre unidades |
| Platform Owner com RLS de tenant |
| Expansão antes do Gate correspondente |

**Rastreabilidade:** [MB3.1 §9][MB3.1 §7][RM §4][RM §6][DEBUG-v7]

---

## 10. Gates obrigatórios

A grade Gate 00–25 é preservada. Novos cenários v4.0 entram nos gates existentes; não há gate novo.

| Gate | Nome | Cenário v4.0 obrigatório | Fixture mínima | Command testado | Banco esperado | Ledger esperado | Falha esperada | Critério de aprovação |
|---:|---|---|---|---|---|---|---|---|
| 00 | Foundation | Schemas, roles, RLS, ledger, outbox, idempotência e comandos críticos existem | Tenant A/B, platform operator, ledger seed | `bootstrap_foundation` | Objetos criados sem grants indevidos | Conta seed balanceada | EXECUTE por `anon/authenticated` falha | 100% objetos e grants corretos |
| 01 | Tenant Isolation | Tenant A não acessa Tenant B | Dois tenants com dados homônimos | `set_session_context` | Queries isoladas | Sem ledger cross-tenant | Bypass de tenant falha | Zero vazamento |
| 02 | Staff Privacy | Staff vê agenda permitida e próprio financeiro | Dois staff, dois atendimentos | `get_staff_snapshot` | Financeiro alheio invisível | Staff account própria | Staff A ver Staff B falha | Privacidade total |
| 03 | Smart Availability | Booking Candidate válido, score explicado, maior slot aplicado | Combo 40+30 com slots 30/15 | `generate_booking_candidates` | Candidate com `largest_slot_min=30` | Não aplicável | Conflito/recurso ocupado removido | Candidatos válidos e ordenados |
| 04 | Appointment Conflict | Agenda não permite conflito de profissional/recurso | Dois agendamentos sobrepostos | `confirm_booking_candidate` | Segundo conflito rejeitado | Não aplicável | EXCLUDE/constraint bloqueia | Zero dupla alocação |
| 05 | Chain Booking | Pausa libera staff e mantém recurso bloqueado | Serviço com pausa química + recurso | `generate_booking_candidates` | Componentes corretos | Não aplicável | Recurso duplo falha | Staff/recurso coerentes |
| 06 | Recurring Appointment | Série, ocorrência, pausa e cancelamento sem efeito colateral | Série semanal | `create_recurring_series` | Ocorrências versionadas | Snapshot por ocorrência | Cancelar ocorrência cancelar série falha | Histórico preservado |
| 07 | Group Booking | Grupo vinculado/independente sem contágio | Dois participantes, um pagador | `confirm_group_booking` | Grupo/componentes distintos | Checkout posterior consistente | Cancelamento indevido falha | Isolamento de participante |
| 08 | Premium Window Protection | Janela premium preservada por reliability/yield | Cliente confiável e cliente risco | `generate_booking_candidates` | Fricção por cliente | Depósito se exigido em D13 | Cliente risco sem fricção falha | Policy aplicada |
| 09 | Waitlist Economic Matching | Cancelamento cria oferta elegível com consentimento | Cancelamento + waitlist | `send_waitlist_offer` | Oferta registrada | Só após pagamento/checkout | Sem consentimento falha | Oferta/conversão auditável |
| 10 | Checkout Integrity | Total, desconto, gorjeta, taxa e negative guard backend-only | Atendimento multi-item | `calculate_checkout_total` | Snapshot fechado | Preparado para D15 | Comissão negativa rejeitada | Total correto |
| 11 | Ledger Balance | Débitos e créditos fecham | Venda com taxa/gorjeta/comissão | `post_ledger_transaction` | Entries append-only | Soma zero | Ledger desbalanceado falha | Reconstruível |
| 12 | Payment Allocation | Pagamento simples/misto, depósito e card-on-file | Pix + cartão tokenizado | `create_payment_intent` | Allocation por método/item | Taxa/depósito lançados | Total alocado divergente falha | Reconciliação correta |
| 13 | Wallet Drift | Wallet projetada bate histórico | Crédito, consumo, reembolso | `rebuild_wallet_balance` | Projection com hash | Ledger compatível | Drift falha release | Saldo reconstruído igual |
| 14 | Commission Privacy & Accuracy | Bruto Salão, Dividido e Bruto Staff corretos | 3 profissionais/modelos | `calculate_commission` | Commission entries privadas | Staff accounts corretas | Staff vê alheio falha | Comissão correta |
| 15 | Benefit Origin & Consumption | Benefício com origem/validade/consumo | Pacote + cashback | `consume_benefit` | Consumo rastreado | Wallet/ledger coerente | Benefício sem origem falha | Sem margem negativa |
| 16 | Action Request Safety | Exceções exigem aprovação | Remover depósito obrigatório | `approve_action_request` | Estado auditado | Só após Command | Execução sem aprovação falha | Trilha completa |
| 17 | WhatsApp & AI Safety | IA/mensagem não agenda direto | Conversa de cliente | `record_inbound_intent` | Intent/Action Request | Não aplicável | Mensagem escrever agenda falha | Handoff seguro |
| 18 | Cash Register Integrity | Caixa abre/fecha e reconcilia | Caixa com venda/gorjeta | `close_cash_session` | Divergência auditada | Ledger compatível | Sangria sem autorização falha | Caixa reconciliado |
| 19 | Analytics Rebuild | Read model reconstruível | Dia com vendas/agendas | `rebuild_analytics_projection` | Hash/snapshot | Sem ledger drift | Número inventado falha | Projection reproduzível |
| 20 | Integration Safety | API/webhook não bypassa Command | API client externo | `emit_webhook_event` | Outbox/logs corretos | Não aplicável | Webhook mutar verdade falha | Integração segura |
| 21 | Fiscal & LGPD Compliance | Fiscal/LGPD mínimos para produção | Cliente com consentimento | `issue_tax_document` | Documento/consentimento | Ledger referenciado | Sem consentimento falha | Compliance mínimo |
| 22 | Platform Owner Isolation | Platform separado do tenant | Operator + tenant user | `get_platform_tenant_health` | Snapshot sem RLS tenant bruto | Billing separado | Platform consultar dado bruto falha | Isolamento real |
| 23 | Marketplace Safety | Marketplace não bypassa core | Perfil público + booking | `create_marketplace_booking_request` | Booking Request gerado | Sem pagamento direto | Marketplace criar appointment falha | Core preservado |
| 24 | Multi-Unit Integrity | Unidade separada com consolidação view | Duas unidades | `rebuild_enterprise_snapshot` | Ledgers separados | Sem mistura | Cross-ledger falha | Consolidação é view |
| 25 | Production Readiness | Release completo sem bloqueios | Tenant piloto | `approve_release` | Gate suite verde | Sem drift | Qualquer gate crítico falha | Pronto para produção |

**Rastreabilidade:** [MB3.1 §10][BP §0][RM §4][SKILL §4][DEBUG-v7]

---

## 11. Ordem de construção

### 11.1 Sequência vinculante

| Ordem | Bloco | Entrega | Gates |
|---:|---|---|---|
| 1 | Foundation | Schemas, roles, RLS, idempotência, outbox, audit | 00, 01, 22 |
| 2 | Setup Core | Tenant, unidade, horários, policy, canais, onboarding | 00, 01, 25 |
| 3 | People/Catalog | Staff, clientes, serviços, slots, duração, recursos | 02, 03, 04 |
| 4 | Booking Candidate | Booking Request, candidatos, score, Smart Gap Law | 03, 04, 05 |
| 5 | Agenda Core | Appointments, groups, components, events, holds | 04, 05, 06, 07 |
| 6 | Reliability/Deposit | Score, fricção, depósito, card-on-file tokenizado | 08, 12, 16 |
| 7 | Waitlist Recovery | Matching, oferta, consentimento, conversão | 09, 17 |
| 8 | Checkout/Payment | Checkout, payment intent, allocation, refund | 10, 12 |
| 9 | Ledger/Wallet | Double-entry, wallet/current accounts, rebuild | 11, 13 |
| 10 | Compensation | Comissão, gorjeta, payout, privacidade | 14 |
| 11 | Benefits/CRM | Benefícios, pacotes, cashback, retenção | 15, 19 |
| 12 | Messaging/AI | WhatsApp, IA governada, Action Request | 16, 17 |
| 13 | Cash/Fiscal | Caixa, NFS-e, LGPD | 18, 21 |
| 14 | Analytics | Dashboards reconstruíveis | 19 |
| 15 | Integrations | API, webhooks, marketplace seguro | 20, 23 |
| 16 | Enterprise | Multiunidade, white-label | 24, 25 |

### 11.2 Bloqueios de sequência

| Tentativa | Bloqueio |
|---|---|
| Criar SQL de agenda antes de Booking Candidate Contract | BLOQUEADO |
| Criar checkout antes de D12/D13/D15/D17 | BLOQUEADO |
| Criar dashboard financeiro antes de ledger/wallet | BLOQUEADO |
| Criar IA que agenda/cobra/perdoa | BLOQUEADO |
| Criar marketplace antes do core | BLOQUEADO |
| Criar white-label antes de estabilidade | BLOQUEADO |

**Rastreabilidade:** [MB3.1 §11][MB3.1 §7][MB3.1 §10][BP §0][RM §4][SKILL §4]

---

## 12. Critérios de produto final aprovado

| Critério | Status exigido |
|---|---|
| Tenant isolation provado | Obrigatório |
| Platform Owner isolation provado | Obrigatório |
| RLS real | Obrigatório |
| Booking Candidate backend | Obrigatório |
| Smart Gap Law em gate | Obrigatório |
| Manual validation sem confirmação direta | Obrigatório |
| Appointment conflict protegido por constraint | Obrigatório |
| Resource lock protegido | Obrigatório |
| Checkout backend-only | Obrigatório |
| Payment allocation correto | Obrigatório |
| Ledger double-entry append-only | Obrigatório |
| Wallet/current account reconstruível | Obrigatório |
| Gorjeta isolada | Obrigatório |
| Comissão em 3 modelos | Obrigatório |
| Negative guard | Obrigatório |
| Card-on-file tokenizado e consentido | Obrigatório para no-show protection avançado |
| Waitlist recovery com consentimento | Obrigatório para automação de buraco |
| Action Request para exceção sensível | Obrigatório |
| IA sem soberania | Obrigatório |
| Read models reconstruíveis | Obrigatório |
| LGPD/Fiscal Brasil | Obrigatório antes de produção comercial |

**Rastreabilidade:** [MB3.1 §12][MB3.1 §7][MB3.1 §10][RM §6]

---

## 13. Moat estratégico

| Moat | Como o SMART Flow™ protege |
|---|---|
| Capacidade | Smart Gap Law, Slot Score, Chain Booking, Resource Locks |
| Margem | Checkout backend-only, fee allocation, negative guard, RevPAH |
| Confiança | Reliability Score, fricção progressiva, Trust Pass, Healing |
| Dinheiro | Ledger, wallet, compensation, tip isolation, payout rastreável |
| Operação | Commands, Action Requests, outbox, gates e audit trail |
| Cliente | PWA leve, WhatsApp governado, preferências, multi-serviços, waitlist |
| Escala | D00–D31, RLS, Platform isolation, gates, read models reconstruíveis |

**Rastreabilidade:** [MB3.1 §13][MB3.1 §2][MB3.1 §7][DEBUG-v7]

---

## 14. Veredito final

| Tema | Veredito |
|---|---|
| MB 4.0 | Aprovado como evolução canônica completa, não patch |
| Escopo | Consolidar contratos/gates antes de SQL |
| Banco | Bloqueado até Booking Candidate Contract e Gates impactados estarem materializados |
| Cliente v4 | Permitido somente como superfície que consome backend ou fixture explícita |
| Salão v8 | Permitido somente como operação visual; regra crítica backend-only |
| Card-on-file | Canônico via token PSP/gateway, sem PAN |
| Waitlist Recovery | Canônico com consentimento, oferta e conversão auditável |
| Smart Gap Law | Canônica e vinculante |
| Frontend local | Laboratório; não fonte da verdade |

**Rastreabilidade:** [MB3.1 §14][MB3.1 §0][MB3.1 §7][MB3.1 §10][DEBUG-v7][DEC-PO-01]

---

## 15. DoD de atualização canônica

| Item | Status |
|---|---|
| Documento completo gerado | OK |
| D00–D31 preservados | OK |
| Gates 00–25 preservados | OK |
| Backend como verdade única preservado | OK |
| Frontend sem cálculo crítico preservado | OK |
| Ledger append-only preservado | OK |
| Payment/Wallet/Compensation coerentes | OK |
| Smart Gap Law incorporada | OK |
| Multi-Service Booking Intent incorporado | OK |
| Booking Candidate Contract incorporado | OK |
| Manual Validation Boundary incorporado | OK |
| Card-on-File/Deposit Policy delimitado | OK |
| Waitlist Recovery delimitado | OK |
| Action Requests preservados | OK |
| Nenhuma seção em formato de patch | OK |
| Nenhuma decisão sem rastreabilidade interna | OK |
| Nenhum domínio novo criado | OK |
| Nenhum gate novo criado | OK |
| Nenhum cálculo crítico delegado ao frontend | OK |

---

## 16. Decisões incorporadas

### DEC-PO-01 — Card-on-File / Depósito / No-Show Protection

| Alternativa | Ledger | Isolamento tenant | Custo de migração | Simplicidade | Risco operacional | Veredito |
|---|---:|---:|---:|---:|---:|---|
| A. Só PIX/sinal manual | Médio | Alto | Baixo | Alto | Rejeitada |
| B. Token PSP/gateway, sem armazenar PAN | Alto | Alto | Médio | Médio | Médio | Aprovada |
| C. Vault próprio de cartão | Alto | Médio | Alto | Baixo | Alto | Rejeitada |

| Campo | Decisão |
|---|---|
| Escolha | Alternativa B |
| Justificativa | Cobre padrão de no-show/deposit, preserva segurança e evita construir cofre de cartão |
| Descarte A | Não entrega proteção world-class e mantém cobrança manual |
| Descarte C | Aumenta risco PCI, custo e complexidade antes do core estar maduro |
| Domínios | D02/D13/D15/D16/D24/D31 |
| Gates | 08/12/13/16/25 |
| Rastreabilidade | [MB3.1 §6/D02][MB3.1 §6/D13][MB3.1 §6/D15][MB3.1 §6/D16][MB3.1 §6/D24][MB3.1 §10/Gate12][RM §6] |

---

## 17. Decisões pendentes

| ID | Tema | Status | Bloqueio |
|---|---|---|---|
| Nenhuma | Todas as decisões necessárias ao MB 4.0 foram incorporadas a partir do veredito aprovado | OK | Sem bloqueio documental |

---

## 18. Declaração final

```text
SMART Flow™ / HOPE OS 4.0 fica definido como documento canônico completo.
A próxima etapa permitida é transformar este MB em Blueprint/SQL Master/Gates, nesta ordem.
Banco, frontend ou IA que contrariem este documento são drift.
```

**Pronto para auditoria Red Team.**
