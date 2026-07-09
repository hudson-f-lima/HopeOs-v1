# KORTEXOS™ 5.1 — MASTER BRIEFING CANÔNICO REWRITE

**Arquivo:** `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`  
**Produto:** KortexOS™  
**Versão:** 5.1  
**Status:** FONTE ÚNICA CANÔNICA — REESCRITA INTEGRAL APÓS AUDITORIA DE LACUNAS  
**Data:** 2026-07-07  
**Autoridade:** Platform Owner  
**Natureza:** reescrita canônica completa; não é patch, delta, adendo, remendo, hotfix, rebranding superficial ou implementação técnica  
**Base de promoção:** `SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md` + `SMART_FLOW_4_0_BLUEPRINT_UNIFICADO_CANONICO.md` + decisões estratégicas KortexOS™ 5.0/5.1 + auditoria de lacunas da conversa  
**Escopo:** visão, tese, domínios, invariantes, motores, gates, RAGOV, bloqueios e ordem de construção  
**Fora do escopo:** SQL executável, migrations novas, endpoints, telas, fluxos implementáveis sem Blueprint, design visual e automações reais

---

## 0. Regra de autoridade

### 0.1 Hierarquia canônica

| Artefato | Autoridade | Limite |
|---|---|---|
| **Master Briefing KortexOS™ 5.1** | Decide identidade, tese, limites, motores, domínios, invariantes, gates, RAGOV e ordem de construção | Não materializa SQL |
| Benchmark Global | Compara KortexOS™ contra referências reais de mercado e boas práticas | Não decide arquitetura sozinho |
| Comparative Proposal | Classifica o que herdar, reforçar, bloquear, adiar ou descartar | Não cria migration |
| Truth Map | Classifica REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO / BLOQUEADO | Não implementa |
| Migration Map | Mapeia nomes, tabelas, domínios, prefixos e impacto de promoção | Não executa |
| Blueprint KortexOS™ 5.1 | Organiza arquitetura técnica, blocos, migrations, dependências e DoD | Não altera escopo canônico |
| SQL Master | Materializa a verdade no banco | Não inventa domínio, regra ou tabela fora do Blueprint aprovado |
| Dev Handoff | Orienta execução por domínio | Não cria regra soberana |
| UI/UX Spec | Define experiência por superfície | Não calcula verdade crítica |
| Gates | Provam funcionamento real | Não substituem regra canônica |
| Red Team / Skills | Auditam conformidade | Não autorizam expansão fora da ordem |

### 0.2 Regra contra dupla verdade

```text
KortexOS™ é o nome comercial e operacional canônico.
HOPE OS vira legado histórico interno.
SMART Flow™ vira legado conceitual/arquitetural da fase 4.0.
Nenhum documento futuro pode tratar HOPE OS, SMART Flow™ e KortexOS™ como produtos paralelos.
```

### 0.3 Regra de promoção sem implementação

```text
A promoção para KortexOS™ 5.1 não cria tabela, endpoint, tela, app, IA, automação, gateway, ledger, job ou migration.
Primeiro governa.
Depois compara.
Depois classifica.
Depois desenha Blueprint.
Depois materializa SQL.
```

### 0.4 Regra de atualização

Toda mudança canônica exige:

1. decisão explícita do Platform Owner;
2. registro de versão;
3. reescrita integral da seção afetada;
4. atualização de gates impactados;
5. atualização de RAGOV;
6. rastreabilidade interna;
7. veredito Red Team;
8. bloqueio de implementação até Blueprint aprovado.

Patch, delta solto, remendo, documento paralelo, cálculo frontend e engine duplicada são proibidos.

---

## 1. Identidade e tese Intelligent Capacity

### 1.1 Nome canônico

**KortexOS™**

### 1.2 Categoria canônica

**Intelligent Capacity, Fintech & Decision Operating System for Beauty & Wellness**

### 1.3 Definição operacional

KortexOS™ é um sistema operacional de capacidade, dinheiro, confiança, recorrência, atendimento, execução e decisão para negócios de beleza e bem-estar.

```text
Agenda é a superfície.
Capacidade é o produto.
Dinheiro é o núcleo de verdade.
Decisão é o diferencial.
Execução é o moat.
```

### 1.4 Tese central

KortexOS™ não compete como agenda online. Compete como infraestrutura operacional para transformar tempo disponível em receita protegida, previsível e auditável.

O problema real do salão não é apenas “ter horários disponíveis”. O problema é:

- ocupar horários fracos;
- preservar margem;
- reduzir no-show;
- vender recorrência;
- proteger comissão;
- controlar gorjeta;
- saber quem deve o quê;
- saber qual cliente é confiável;
- saber qual benefício tem origem;
- saber qual parceiro traz margem;
- reduzir dependência do dono.

### 1.5 Promessa principal

```text
Menos buraco na agenda.
Mais ocupação nos dias fracos.
Mais receita por hora disponível.
Mais recorrência.
Mais caixa previsível.
Mais margem protegida.
Mais confiança operacional.
Menos improviso.
Menos dependência do dono.
```

### 1.6 Tese de mercado

O mercado global de beauty/wellness já opera com booking, pagamentos, memberships, marketing e marketplace. O KortexOS™ não deve tentar vencer copiando feature por feature. O diferencial canônico é combinar:

| Eixo | Diferencial KortexOS™ |
|---|---|
| Capacidade | Booking Candidate, Smart Gap, Yield, Occupancy Engines |
| Recorrência | Subscription, Corporate Benefits, Partner Benefits |
| Finanças | KortexFlow, ledger double-entry, wallet, staff account |
| Confiança | Reliability Score, no-show progressivo, Trust Pass, Healing |
| IA | compreensão e triagem com Action Request, sem soberania |
| Execução | backend como única fonte de verdade, gates e auditoria |

---

## 2. Ecossistema das 5 soluções globais

KortexOS™ é o ecossistema. As soluções abaixo são superfícies/camadas do mesmo core. Nenhuma solução cria verdade paralela.

| Solução | Papel | Limite canônico |
|---|---|---|
| **kortex.io** | Portal SaaS, administração, onboarding, billing, cockpit web, página pública, aquisição e gestão de tenants | Não calcula regra crítica no frontend |
| **KortexApp** | Aplicação mobile/PWA para dono, gerente, staff, recepção, cliente, empresa e parceiro | Exibe dados, dispara Commands e consome projections |
| **Kortex.ai** | Camada de IA consultiva: intenção, triagem, explicação, copiloto e recomendação | Nunca escreve verdade crítica soberanamente |
| **KortexFlow** | Fintech core: checkout, pagamentos, ledger, wallet, staff account, corporate billing, partner settlement e payout | Toda mutação financeira exige backend, idempotência e ledger |
| **KortexLink** | Circuito de ativação: WhatsApp, SMS, e-mail, push, QR, links, webhooks, parceiros, campanhas e waitlist | Mensagem não altera verdade diretamente |

### 2.1 Regra de core único

```text
Cinco soluções, um único core.
Nenhuma superfície possui engine paralela de agenda, preço, saldo, benefício, comissão, pagamento ou confiança.
```

### 2.2 Persona por solução

| Persona | kortex.io | KortexApp | Kortex.ai | KortexFlow | KortexLink |
|---|---|---|---|---|---|
| Platform Owner | SaaS, billing, tenants, gates | Cockpit platform | Auditoria assistida | Billing SaaS | Comunicação platform |
| Dono | Cockpit, KPIs, regras | Agenda, caixa, margem | CoPilot | Caixa, ledger, payout | Campanhas e alertas |
| Gerente | Operação e equipe | Agenda e execução | Sugestões operacionais | Fechamento e conferência | Confirmações |
| Staff | Perfil e agenda | Agenda, produção, repasses | Apoio consultivo | Staff account | Lembretes |
| Cliente | Página e portal | Booking, planos, wallet | Atendimento assistido | Pagamento e créditos | WhatsApp/QR/link |
| Empresa corporativa | Contrato e analytics agregado | Portal agregado futuro | FAQ / triagem | Billing corporativo | Convites e links |
| Parceiro local | Portal/link/QR | Performance futuro | Recomendação de campanhas | Settlement se houver fee | QR, link, campanha |

---

## 3. Princípios econômicos e mitigação de custo de IA

### 3.1 Regra homem × máquina

KortexOS™ estabelece uma fronteira rígida entre linguagem natural e decisão crítica.

| Camada | Pode usar IA | Deve ser determinística |
|---|---:|---:|
| Entender intenção | Sim | Não obrigatório |
| Classificar pedido | Sim | Backend valida |
| Sugerir texto | Sim | Não crítico |
| Buscar disponibilidade | Não | Sim |
| Confirmar agenda | Não soberanamente | Sim |
| Calcular preço | Não | Sim |
| Calcular comissão | Não | Sim |
| Liberar benefício | Não | Sim |
| Liberar fiado | Não | Sim |
| Criar ledger | Nunca | Sim |
| Perdoar no-show | Não | Action Request + backend |

### 3.2 Regra econômica

```text
IA é cara quando decide.
IA é barata quando entende linguagem.
Decisão recorrente vira regra matemática backend.
Exceção sensível vira Action Request.
```

### 3.3 Invariante de custo

Kortex.ai deve reduzir custo operacional humano sem criar custo variável imprevisível de tokens para decisões repetitivas. O backend calcula disponibilidade, score, confiança, benefício, preço, comissão, wallet e ledger sem depender de modelo generativo.

### 3.4 Action Request como fronteira

A IA pode propor uma ação. O backend decide se ela é permitida. O humano aprova quando a ação altera dinheiro, reputação, política, confiança, agenda sensível, exceção ou relacionamento.

---

## 4. Arquitetura de camadas e superfícies

### 4.1 Camadas canônicas

| Camada | Nome | Responsabilidade | Gate mínimo |
|---:|---|---|---|
| 0 | Platform & Isolation | SaaS, tenants, RLS, roles, release, gates | 00/01/22 |
| 1 | Foundation Core | Pessoas, catálogo, setup, agenda base, recursos | 00–08 |
| 2 | Capacity Intelligence | Booking Candidate, Smart Gap, Slot Score, Resource Locks, Yield | 03–09 |
| 3 | KortexFlow | Checkout, payment, ledger, wallet, staff account, compensation | 10–15/18 |
| 4 | Revenue & Occupancy | Assinaturas, corporativo, parcerias, pacotes, benefícios, CRM | 15/19 |
| 5 | Kortex.ai & KortexLink | IA governada, mensagens, Action Requests, campanhas, integrações | 16/17/20 |
| 6 | Scale | Marketplace, multiunidade, white-label, API, enterprise | 20/23/24/25 |

### 4.2 Superfícies

| Superfície | Função | Proibição |
|---|---|---|
| App dono | Cockpit, agenda, caixa, margem, ocupação, decisões | Não editar ledger |
| App gerente | Operação diária, equipe, agenda, checkout | Não bypassar política |
| App profissional | Agenda, produção, comissão, repasse | Não ver financeiro alheio |
| PWA cliente | Booking, assinatura, benefício, carteira, histórico | Não confirmar agenda direta |
| Portal empresa | Contrato, elegíveis, uso agregado, faturamento | Não ver dados sensíveis individuais |
| Portal parceiro | Links, QR, campanhas, conversão, margem agregada | Não acessar histórico individual |
| WhatsApp/Link/QR | Ativação e intenção | Não escrever verdade diretamente |
| API/Webhooks | Integração governada | Não bypassar Command |

---

## 5. Domínios canônicos D00–D31

KortexOS™ 5.1 preserva a grade D00–D31. Não há renumeração. Não há domínio novo. Novos motores entram como evolução de domínios existentes.

| Domínio | Nome KortexOS™ 5.1 | Responsabilidade |
|---:|---|---|
| D00 | Platform Owner Layer | Operação platform, release, suporte, saúde de tenants |
| D01 | Identity & Tenant | Tenants, unidades, memberships, papéis, RLS |
| D02 | Business Setup & Policy Hub | Horários, políticas, no-show, depósito, canais, regras iniciais |
| D03 | Onboarding SaaS | Ativação, setup, readiness, trial, plano |
| D04 | SaaS Billing & Platform Finance | Cobrança SaaS sem misturar com checkout tenant |
| D05 | People Hub | Clientes, staff, preferências, consentimentos, horários de staff |
| D06 | Catalog & Offer Hub | Serviços, produtos, preços base, duração, add-ons, yield profiles |
| D07 | Capacity Scheduling Engine | Disponibilidade, Booking Candidate, Smart Gap, Slot Score, Yield |
| D08 | Agenda Core | Appointments, holds, cancelamento, no-show, histórico |
| D09 | Recurring Appointment Engine | Séries recorrentes, ocorrências, pausas, exceções |
| D10 | Group Booking Engine | Agendamento em grupo, participantes, pagador, beneficiários |
| D11 | Resource Orchestration | Recursos físicos, locks, manutenção, capacidade |
| D12 | Checkout Core | Sessão de checkout, totais, descontos, gorjeta, consumo de benefício |
| D13 | Payment Core | Pagamentos, depósitos, COF tokenizado, reembolso, PSP events |
| D14 | Cash & Register Management | Caixa, sangria, suprimento, fechamento, divergências |
| D15 | KortexFlow Ledger | Ledger double-entry append-only, reversões, reconstrução |
| D16 | Wallet & Current Accounts | Client wallet, staff current account, créditos e projeções |
| D17 | Compensation & Payout Engine | Comissão, gorjeta, repasses, privacidade financeira de staff |
| D18 | Subscription, Packages, Corporate Benefits & Partner Occupancy Engine | Assinaturas, pacotes, corporativo, parcerias, benefícios e ocupação |
| D19 | Client Experience Hub | Portal/PWA cliente, booking intent, benefícios visíveis |
| D20 | Public Web Presence / kortex.io | Página pública, SEO, links, ofertas publicadas |
| D21 | KortexLink Messaging & Conversations | WhatsApp, SMS, e-mail, push, templates, consentimento |
| D22 | Kortex.ai Receptionist Engine | IA consultiva, triagem, Action Request, handoff humano |
| D23 | Revenue CoPilot Engine | Oportunidades econômicas, boosters, recomendações |
| D24 | Trust & Retention Engine | Reliability Score, CRM, churn, no-show, Trust Pass, Healing |
| D25 | Analytics & Decision Intelligence | Ocupação, RevPAH, margem, cohorts, dashboards reconstruíveis |
| D26 | Fiscal & LGPD Brasil | NFS-e, LGPD, consentimentos, dados sensíveis e fiscal |
| D27 | Marketplace & Partner Network | Marketplace, rede local, parceiros, descoberta, aquisição |
| D28 | Multiunit Enterprise | Multiunidade, consolidação, ledgers separados |
| D29 | White-Label App | Marca, domínio, app white-label sem core paralelo |
| D30 | Integration Platform | API pública, webhooks, scopes, retry, outbox |
| D31 | Gate, QA & Governance | Gates, Red Team, rollback, release, QA, evidências |

### 5.1 Regra de evolução sem domínio novo

| Evolução | Domínios impactados |
|---|---|
| KortexFlow | D12/D13/D14/D15/D16/D17 |
| Kortex.ai | D22/D23/D24/D31 |
| KortexLink | D21/D30/D31 |
| Subscription Engine | D18/D12/D15/D16/D25 |
| Corporate Benefits | D18/D04/D12/D15/D16/D21/D25/D26 |
| Partner Benefits | D18/D21/D25/D27/D30 |
| Yield & Occupancy | D07/D18/D23/D24/D25 |
| Negative Guard | D02/D12/D13/D15/D16/D17/D18/D24 |

---

## 6. Kortex.ai — governança e soberania

### 6.1 Responsabilidade

Kortex.ai é a camada de compreensão, triagem, recomendação, copiloto e atendimento assistido. Ela não possui soberania sobre agenda, dinheiro, comissão, saldo, benefício, política, score ou ledger.

### 6.2 Matriz de soberania

| Ação | IA pode fazer? | Precisa humano? | Backend valida? | Status |
|---|---:|---:|---:|---|
| Entender mensagem | Sim | Não | Sim | REAL |
| Classificar intenção | Sim | Não | Sim | REAL |
| Explicar política | Sim | Não | Sim | REAL |
| Mostrar horários retornados pelo backend | Sim | Não | Sim | REAL |
| Gerar Booking Intent | Sim | Não/depende | Sim | REAL |
| Confirmar appointment | Não soberanamente | Depende | Sim | CRÍTICO |
| Cobrar depósito | Não soberanamente | Política/Command | Sim | CRÍTICO |
| Liberar desconto | Não soberanamente | Sim/política | Sim | CRÍTICO |
| Perdoar no-show | Não | Sim | Sim | CRÍTICO |
| Liberar fiado | Não | Sim/política | Sim | CRÍTICO |
| Alterar comissão | Não | Sim | Sim | BLOQUEADO sem AR |
| Criar ledger | Nunca | Não | Command financeiro | BLOQUEADO |
| Enviar campanha sensível | Não soberanamente | Política/consentimento | Sim | CRÍTICO |

### 6.3 Action Requests obrigatórios

Kortex.ai cria Action Request quando a sugestão impacta:

- dinheiro;
- desconto;
- fiado;
- comissão;
- payout;
- benefício;
- exceção de política;
- no-show;
- reputação;
- campanha;
- dados sensíveis;
- agenda premium.

### 6.4 Proibições

```text
IA não agenda direto.
IA não cobra direto.
IA não perdoa direto.
IA não altera comissão.
IA não cria ledger.
IA não muda política.
IA não inventa preço.
IA não valida benefício sozinha.
IA não decide yield soberanamente.
```

---

## 7. KortexFlow — financial core

### 7.1 Definição

KortexFlow é o núcleo financeiro do KortexOS™. Ele controla checkout, pagamento, carteira, ledger, conta corrente do profissional, gorjeta, comissão, repasse, saldo do cliente, crédito corporativo, benefício de parceiro, assinatura, estorno e reconciliação.

### 7.2 Invariantes financeiras

| Regra | Definição |
|---|---|
| Anti-CRUD | Ledger é append-only; UPDATE/DELETE proibidos em entradas críticas |
| Double-entry | Débitos e créditos sempre fecham em soma zero |
| `_cents bigint` | Todo dinheiro usa centavos inteiros |
| Idempotência | Mutação financeira exige `idempotency_key` |
| Reversão | Correção financeira é lançamento reverso, não edição |
| Reconstrução | Saldo verdadeiro é reconstruível pelo ledger |
| Tip isolation | Gorjeta não vira receita do salão nem base de comissão |
| Staff protection | Profissional não financia fiado autorizado do cliente |
| Backend-only | Frontend nunca calcula total, saldo, taxa, comissão ou benefício |

### 7.3 Fluxos financeiros obrigatórios

| Fluxo | Pipeline canônico |
|---|---|
| Venda normal | checkout → payment → ledger → commission → projection |
| Venda com gorjeta | checkout → tip allocation → ledger tip account → staff current account |
| Venda com assinatura | cobrança → obrigação/benefício → consumo no checkout → reconhecimento/reclassificação |
| Plano corporativo | contrato empresa → elegibilidade funcionário → consumo → billing/ledger → analytics agregado |
| Parceria local | origem parceiro → benefício → checkout → conversão → analytics/CAC/margem |
| Fiado autorizado | Negative Guard → client wallet negativo → staff liquidado → dívida do salão contra cliente |
| Estorno | refund → reversal ledger → wallet/commission adjustment via Command |
| Payout semanal | staff current account → payout batch → payment → ledger reversal/settlement |
| Cashback | grant com origem → wallet/benefit → consumo → ledger/projection |

### 7.4 Objetos conceituais mínimos

| Objeto | Função |
|---|---|
| `kortex_accounts` | Plano de contas financeiro |
| `kortex_ledger_transactions` | Cabeçalho da transação |
| `kortex_ledger_entries` | Lançamentos double-entry append-only |
| `kortex_account_balances` | Projeção reconstruível de saldo |
| `client_wallets` | Carteira do cliente |
| `staff_current_accounts` | Conta corrente do profissional |
| `benefit_obligations` | Obrigações de consumo de planos/pacotes/corporativo/parceiro |
| `payout_batches` | Lotes de repasse |

**Observação:** nomes finais exigem Migration Map. Esta seção define responsabilidade, não SQL.

---

## 8. Staff Current Account & Payout Protection

### 8.1 Tese

```text
Profissional não financia o cliente.
Profissional não depende de cálculo manual.
Profissional não perde gorjeta por mistura contábil.
```

### 8.2 Responsabilidade

A conta corrente do profissional controla produção, comissão, gorjeta, ajustes aprovados, adiantamentos, repasses, estornos e saldo projetado.

### 8.3 Regras

| Regra | Status |
|---|---|
| Comissão nasce de venda real | CRÍTICO |
| Comissão calcula no backend | CRÍTICO |
| Gorjeta é isolada 100% para o destinatário | CRÍTICO |
| Staff não vê financeiro alheio | CRÍTICO |
| Ajuste manual exige Action Request | CRÍTICO |
| Repasse semanal usa payout batch | REAL como tese |
| Estorno ajusta por lançamento reverso | CRÍTICO |
| Comissão negativa silenciosa é proibida | BLOQUEADO |

### 8.4 Modelos nativos de comissão

| Modelo | Regra |
|---|---|
| Bruto Salão | Salão absorve taxa; comissão sobre bruto líquido de desconto |
| Dividido / Parceiro | Taxa deduzida antes do comissionamento |
| Bruto Staff | Profissional absorve taxa sobre parte dele |

---

## 9. Client Wallet

### 9.1 Definição

Client Wallet é a carteira financeira e operacional do cliente. Ela pode representar crédito, saldo, benefício, reembolso, cashback, consumo de pacote, assinatura, crédito corporativo ou dívida autorizada.

### 9.2 Estados

| Estado | Significado | Regra |
|---|---|---|
| Saldo positivo | Cliente possui crédito real | Reconstruível pelo ledger |
| Saldo zero | Sem crédito ou dívida | Normal |
| Saldo negativo autorizado | Fiado governado | Exige Negative Guard |
| Crédito promocional | Benefício com origem e validade | Não vira dinheiro livre |
| Crédito corporativo | Benefício de contrato B2B | Regras do contrato |
| Crédito de parceiro | Benefício de origem rastreável | Regra de parceria |
| Cashback | Crédito futuro | Origem, validade e consumo |
| Reembolso | Devolução/reversão | Ledger reversal |

### 9.3 Proibições

```text
Saldo paralelo é proibido.
Benefício sem origem é proibido.
Crédito sem validade quando exigida é proibido.
Saldo editado manualmente é proibido.
Frontend calculando saldo é proibido.
```

---

## 10. Negative Guard

### 10.1 Definição

Negative Guard é o mecanismo que impede que fiado, benefício, assinatura, parceria, plano corporativo, desconto ou exceção destrua margem, caixa, comissão ou confiança operacional.

### 10.2 Escopo

| Caso | O que o Negative Guard protege |
|---|---|
| Fiado | Limite, confiança, dívida e liquidação do staff |
| Assinatura | Margem mínima, uso indevido, abuso de frequência |
| Plano corporativo | Contrato, limite, elegibilidade e margem por empresa |
| Parceria | Janela, limite, origem e CAC por parceiro |
| Desconto | Receita líquida e comissão |
| Premium window | Horário nobre sem benefício agressivo |
| Cliente de risco | Depósito, pré-pagamento ou bloqueio |

### 10.3 Regras obrigatórias

| Regra | Status |
|---|---|
| Fiado só com Trust Pass ou aprovação/política | CRÍTICO |
| Profissional liquidado no ato quando fiado é autorizado | CRÍTICO |
| Dívida fica sob risco do salão | CRÍTICO |
| Benefício não pode gerar margem negativa invisível | CRÍTICO |
| Plano agressivo deve ser limitado a baixa ocupação | REAL como tese |
| Desconto em horário nobre exige regra superior | CRÍTICO |

---

## 11. No-show, Client Reliability Score, Trust Pass e Healing

### 11.1 Tese

KortexOS™ não deve educar cliente por punição retroativa agressiva. Deve usar fricção progressiva, previsível e explicável.

### 11.2 Régua progressiva

| Evento | Ação |
|---|---|
| 1ª falta | Aviso elegante e educativo |
| 2ª falta | Sinal compulsório de 50% no próximo agendamento elegível |
| 3ª falta ou recorrência | Pré-pagamento de até 100% conforme política |
| 3 atendimentos seguidos concluídos | Healing parcial/total conforme regra |
| Histórico excelente | Trust Pass para reduzir fricção |

### 11.3 Client Reliability Score

O score deve considerar:

- faltas;
- atrasos;
- cancelamentos tardios;
- reagendamentos excessivos;
- atendimentos concluídos;
- pagamentos bem-sucedidos;
- uso correto de assinatura;
- uso correto de benefício corporativo;
- uso correto de benefício parceiro;
- exceções aprovadas;
- histórico de chargeback/estorno;
- tempo desde o último problema.

### 11.4 Proibições

```text
No-show não pode ser apagado do histórico.
IA não pode perdoar falta.
Recepção não pode remover fricção sem Action Request quando política exigir.
Score fake é proibido.
```

---

## 12. Yield & Occupancy Management

### 12.1 Tese

Yield no KortexOS™ não é apenas subir ou baixar preço. Yield é alocar demanda, preço, benefício e conveniência para maximizar ocupação, margem e previsibilidade.

```text
Yield direto = preço muda.
Yield indireto = assinatura, corporativo e parceria deslocam demanda para horários fracos.
```

### 12.2 Mecanismos

| Mecanismo | Função |
|---|---|
| Desconto off-peak | Preencher baixa ocupação |
| Acréscimo fora de horário | Monetizar conveniência |
| Premium window | Proteger horário nobre |
| Assinatura terça–quinta | Comprar recorrência em dias fracos |
| Plano corporativo off-peak | Ocupar agenda morta com contrato B2B |
| Parceria local | Aquisição qualificada em horários específicos |
| Waitlist econômica | Recuperar cancelamento |
| Slot Score | Ranqueia melhor horário para o negócio |

### 12.3 Regras de acréscimo de conveniência

| Caso | Regra base |
|---|---|
| Antes da abertura | +10% configurável |
| Após fechamento | +10% configurável |
| Domingo/feriado selecionado | +10% adicional configurável |
| Acúmulo | Permitido conforme política |

### 12.4 Bloqueios

```text
Dynamic pricing automático sem política é bloqueado.
Desconto que mascara prejuízo é bloqueado.
Benefício off-peak usado em horário nobre sem regra é bloqueado.
Frontend calculando yield é bloqueado.
```

---

## 13. Subscription & Occupancy Engine

### 13.1 Tese

Assinatura não é desconto. Assinatura compra previsibilidade, antecipa caixa, aumenta retenção e desloca demanda para horários de baixa ocupação.

### 13.2 Modelos B2C

| Modelo | Objetivo |
|---|---|
| Plano mensal corte | Recorrência individual |
| Plano corte + barba | Aumentar ticket e frequência |
| Plano terça–quinta | Ocupar dias fracos |
| Plano família | Recorrência por grupo |
| Plano crédito mensal | Flexibilidade com caixa antecipado |
| Plano premium | Valor percebido e retenção |
| Plano com add-ons | Cross-sell e margem |

### 13.3 Regras obrigatórias

| Regra | Status |
|---|---|
| Plano tem origem, preço, ciclo e validade | CRÍTICO |
| Consumo passa pelo checkout | CRÍTICO |
| Benefício é backend-only | CRÍTICO |
| Comissão calcula no uso real | CRÍTICO |
| Receita antecipada não vira receita livre sem regra | CRÍTICO |
| Uso pode ser limitado a dias fracos | REAL como tese |
| Dunning por falha de cobrança | CRÍTICO |
| Churn e renovação medidos | REAL |

### 13.4 KPIs

```text
MRR de assinaturas
assinantes ativos
churn mensal
renovação mensal
uso por ciclo
ocupação terça–quinta
margem por plano
no-show de assinantes
receita antecipada
conversão avulso → assinatura
```

---

## 14. Corporate Benefits Engine

### 14.1 Tese

Plano corporativo é B2B2C: uma empresa contrata, funcionários usam e o salão ganha recorrência, aquisição e ocupação direcionada.

### 14.2 Estrutura

| Ator | Função |
|---|---|
| Empresa contratante | Paga, subsidia ou compra créditos |
| Funcionário elegível | Usa benefício conforme contrato |
| Dependente | Opcional conforme contrato |
| Salão | Define serviços, horários, limites e margem |
| KortexFlow | Controla billing, crédito, consumo e ledger |
| KortexLink | Convites, links e comunicação |
| Analytics | Uso agregado e performance do contrato |

### 14.3 Modelos

| Modelo | Uso |
|---|---|
| Empresa paga 100% | Benefício premium |
| Empresa subsidia parte | Sustentabilidade financeira |
| Crédito mensal por funcionário | Flexível |
| Voucher por ciclo | Simples e controlado |
| Plano off-peak corporativo | Ocupação de agenda morta |
| Compra de créditos | Campanhas internas |
| Benefício por cargo | Empresas médias/grandes |
| Dia da empresa | Ação pontual |

### 14.4 Privacidade corporativa

| Empresa pode ver | Empresa não pode ver |
|---|---|
| funcionários elegíveis | observações internas individuais |
| taxa de uso agregada | histórico sensível de serviço por pessoa |
| créditos consumidos agregados | dados estéticos/saúde sensíveis |
| faturamento por contrato | notas pessoais do cliente |
| adesão por período | preferências íntimas sem base legal |

### 14.5 Bloqueios

```text
RH não vê histórico individual sensível.
Contrato corporativo sem ledger é bloqueado.
Funcionário sem elegibilidade não usa benefício.
Benefício corporativo sem origem é bloqueado.
Uso em horário nobre com margem ruim é bloqueado por política.
```

---

## 15. Partner Benefits & Local Network Engine

### 15.1 Tese

Parceria local não é cupom aberto. É canal rastreável de aquisição, ocupação e relacionamento com público qualificado.

### 15.2 Parceiros elegíveis

| Tipo | Uso |
|---|---|
| Academia | Pós-treino, estética, corte/barba/manicure |
| Hotel | Hóspede, evento, noivo, executivo |
| Coworking | Profissionais locais |
| Condomínio | Moradores do entorno |
| Clube | Público premium |
| Clínica estética | Cross-sell de beleza/bem-estar |
| Loja premium | Voucher após compra |
| Buffet/eventos | Noivas, noivos e convidados |
| Escola/faculdade | Público jovem e recorrente |

### 15.3 Tipos de benefício

| Tipo | Regra |
|---|---|
| Desconto off-peak | Válido em dias/horários fracos |
| Voucher fixo | Serviço ou valor específico |
| Upgrade | Add-on gratuito ou com condição |
| Primeira visita | Aquisição de cliente novo |
| Recorrência | Depois de X usos, oferta plano próprio |
| Grupo | Hóspedes/equipe/evento |
| Comissão de indicação | Se houver contrato e ledger |

### 15.4 Anti-cupom

| Regra | Status |
|---|---|
| Parceiro cadastrado e contrato definido | CRÍTICO |
| Link/QR com origem rastreável | CRÍTICO |
| Benefício com validade e limite | CRÍTICO |
| Elegibilidade validada no backend | CRÍTICO |
| Consumo no checkout | CRÍTICO |
| Analytics de CAC/margem/conversão | CRÍTICO |
| Parceiro sem acesso a dados sensíveis | CRÍTICO |
| QR aberto sem expiração | BLOQUEADO |
| Cupom genérico sem origem | BLOQUEADO |

### 15.5 KPIs

```text
parceiros ativos
clientes captados por parceiro
conversão parceiro → agendamento
conversão parceiro → recorrência
ocupação terça–quinta
ticket médio por parceiro
margem por parceiro
CAC por parceiro
uso indevido bloqueado
```

---

## 16. KortexLink — activation circuit

### 16.1 Definição

KortexLink é o circuito de distribuição, ativação e integração do KortexOS™. Ele conecta WhatsApp, QR code, links, campanhas, parceiros, empresas, waitlist, lembretes e webhooks ao core governado.

### 16.2 Responsabilidades

| Canal | Função |
|---|---|
| WhatsApp | Conversa, confirmação, lembrete, no-show, campanha |
| QR code | Entrada rápida para parceiro, corporativo, campanha ou assinatura |
| Link inteligente | Origem, elegibilidade, validade, rastreio |
| E-mail/SMS/push | Comunicação transacional e campanhas consentidas |
| Webhooks | Integrações governadas por outbox |
| Partner links | Captação local com origem |
| Corporate links | Funcionários elegíveis |
| Waitlist offers | Recuperação de buracos |

### 16.3 Proibições

```text
Mensagem não agenda direto.
Link não consome benefício direto.
QR não valida elegibilidade sozinho.
Webhook não muta verdade diretamente.
Campanha sem consentimento é bloqueada.
```

---

## 17. KortexApp — personas e limites

### 17.1 Persona matrix

| Persona | O que vê | O que não pode fazer |
|---|---|---|
| Dono | ocupação, margem, caixa, KPIs, equipe, decisões | editar ledger |
| Gerente | agenda, equipe, checkout, atendimento | bypassar política crítica |
| Profissional | agenda, produção, gorjeta, repasse próprio | ver financeiro alheio |
| Recepção | agendar, confirmar, remarcar, cobrar | confirmar conflito |
| Cliente | horários, assinatura, benefício, wallet, histórico | alterar regra ou saldo |
| Empresa | elegíveis, contrato, uso agregado, faturas | ver histórico individual sensível |
| Parceiro | links, QR, conversão, performance agregada | acessar dados individuais sensíveis |

### 17.2 Regra de UI

```text
Frontend exibe.
Frontend solicita.
Frontend filtra visualmente.
Frontend nunca calcula verdade crítica.
```

---

## 18. Action Requests

### 18.1 Estados

```text
draft → ready_for_review → approved → executing → executed → rejected → cancelled → failed
```

### 18.2 Ações que exigem Action Request

| Ação | Domínio |
|---|---|
| Remover depósito obrigatório | D02/D13/D24 |
| Perdoar no-show | D02/D24 |
| Liberar fiado fora de política | D16/D24 |
| Aplicar desconto fora de regra | D12/D18/D23 |
| Usar benefício em horário bloqueado | D18/D07 |
| Ajustar comissão | D17 |
| Ajustar payout | D17 |
| Criar crédito manual | D16/D18 |
| Consumir benefício sensível | D18 |
| Enviar campanha sem régua padrão | D21/D24 |
| Cobrar no-show por COF | D13/D24 |
| Aplicar parceria com fee | D18/D27 |
| Ajustar contrato corporativo ativo | D18/D04 |

### 18.3 Proibições

```text
Action Request não cria ledger direto.
Action Request não cria pagamento direto.
Action Request não cria comissão direta.
Action Request não cria benefício sem Command.
Action Request não substitui backend validation.
```

---

## 19. RAGOV KortexOS™ 5.1

### 19.1 REAL

| Categoria | Itens |
|---|---|
| Tese | KortexOS™ como Intelligent Capacity, Fintech & Decision OS |
| Arquitetura | Backend SSOT, frontend burro, Commands, RLS, outbox |
| Domínios | D00–D31 preservados |
| Gates | Gate 00–25 preservados |
| KortexFlow | Ledger append-only, double-entry, `_cents bigint`, idempotência |
| IA | Kortex.ai consultiva, sem soberania |
| Confiança | No-show progressivo, Trust Pass, Healing |
| Ocupação | Assinatura, corporativo e parcerias como tese estratégica |

### 19.2 PARCIAL

| Item | Condição para REAL |
|---|---|
| KortexFlow implementado | SQL, RPCs, gates financeiros verdes |
| Subscription Engine | Benchmark + Blueprint + Gates + SQL |
| Corporate Benefits | Contratos, elegibilidade, LGPD, billing e gates |
| Partner Benefits | Cadastro, origem, link/QR, analytics e anti-cupom |
| Yield dinâmico | Dados reais, política e gates |
| Kortex.ai operacional | Safety logs, Action Request, handoff e gates |
| KortexLink | Consentimento, templates, outbox, links e webhooks |
| KortexApp | Personas, limites e backend-only provados |

### 19.3 MOCKADO — proibido em fluxo crítico

| Proibido |
|---|
| saldo fake |
| comissão fake |
| disponibilidade fake |
| checkout fake |
| benefício fake |
| assinatura sem ledger |
| plano corporativo sem contrato |
| parceria sem origem |
| score de confiança fake |
| yield fake |
| dashboard inventado |
| IA fingindo execução |

### 19.4 HARDCODED — permitido apenas em fixture

| Permitido | Condição |
|---|---|
| IDs de seed | Gate/fixture |
| taxas demonstrativas | Sandbox |
| thresholds iniciais | Versionados |
| exemplos de UI | Sem mutação crítica |
| dados de benchmark | Referência, não verdade de produto |

### 19.5 CRÍTICO

| Item |
|---|
| RLS tenant/platform |
| Booking Candidate |
| Appointment conflict |
| Resource lock |
| Checkout total |
| Payment allocation |
| Ledger balance |
| Wallet rebuild |
| Staff privacy |
| Tip isolation |
| Negative Guard |
| Benefit origin |
| Subscription consumption |
| Corporate privacy |
| Partner anti-cupom |
| Reliability Score |
| Card-on-file consent |
| Action Request |
| AI governance |
| Outbox |
| LGPD/Fiscal |
| Gates |

### 19.6 BLOQUEADO

| Bloqueio |
|---|
| SQL novo antes do Blueprint |
| domínio novo sem decisão formal |
| gate novo sem aprovação formal |
| frontend calculando regra crítica |
| IA soberana |
| saldo paralelo |
| benefício sem origem |
| comissão negativa mascarada |
| receita antecipada sem obrigação rastreável |
| parceiro vendo dados sensíveis |
| RH vendo histórico sensível |
| marketplace antes do core |
| white-label antes da estabilidade |
| dynamic pricing sem política/gate |

---

## 20. Gates obrigatórios 00–25

A grade Gate 00–25 é preservada. O KortexOS™ 5.1 adiciona cenários aos gates existentes. Não cria gate novo neste Master Briefing.

| Gate | Nome | Atualização 5.1 |
|---:|---|---|
| 00 | Foundation | Roles, schemas, RLS, outbox, idempotência e Kortex naming guard |
| 01 | Tenant Isolation | Benefícios, assinaturas e parceiros tenant-scoped |
| 02 | Staff Privacy | Staff account e comissão/gorjeta própria sem vazamento |
| 03 | Smart Availability | Candidate considera assinatura/off-peak/premium window |
| 04 | Appointment Conflict | Corporate/partner booking não bypassa lock |
| 05 | Chain Booking | Multi-service de assinatura/corporativo preserva sequência |
| 06 | Recurring Appointment | Assinatura recorrente não cria ocorrência sem validação |
| 07 | Group Booking | Corporate/group benefits com pagador/beneficiário separados |
| 08 | Premium Window Protection | Benefício off-peak não entra em horário nobre sem regra |
| 09 | Waitlist Economic Matching | Oferta de buraco com benefício/consentimento |
| 10 | Checkout Integrity | Consumo de assinatura/corporativo/parceiro no backend |
| 11 | Ledger Balance | Receita, obrigação, consumo, comissão e gorjeta fecham |
| 12 | Payment Allocation | Pagamento recorrente, COF e corporate billing |
| 13 | Wallet Drift | Client wallet, créditos e benefícios reconstruíveis |
| 14 | Commission Privacy & Accuracy | Comissão por uso real de benefício/plano |
| 15 | Benefit Origin & Consumption | Assinatura, corporativo e parceiro com origem, validade e consumo |
| 16 | Action Request Safety | Exceções financeiras/reputacionais exigem aprovação |
| 17 | WhatsApp & AI Safety | KortexLink/Kortex.ai não escrevem verdade direta |
| 18 | Cash Register Integrity | Caixa referencia ledger de planos/benefícios quando aplicável |
| 19 | Analytics Rebuild | Ocupação, margem, CAC, MRR e cohorts reconstruíveis |
| 20 | Integration Safety | Webhooks/links/QR sem bypass de Command |
| 21 | Fiscal & LGPD Compliance | Privacidade corporativa e parceiro sem dados sensíveis |
| 22 | Platform Owner Isolation | Platform não acessa tenant bruto fora do contrato |
| 23 | Marketplace Safety | Partner network sem bypass core |
| 24 | Multi-Unit Integrity | Benefícios multiunidade sem mistura de ledger |
| 25 | Production Readiness | Release bloqueado se qualquer gate crítico falhar |

---

## 21. Ordem de construção

### 21.1 Sequência vinculante pós-auditoria

| Ordem | Artefato / fase | Objetivo | Status |
|---:|---|---|---|
| 1 | Auditoria de lacunas da conversa | Identificar decisões ausentes | CONCLUÍDO |
| 2 | Master Briefing KortexOS™ 5.1 Rewrite | Consolidar fonte única | ESTE DOCUMENTO |
| 3 | Global Benchmark Map | Comparar módulos e engines com mercado global | PENDENTE |
| 4 | Comparative Proposal | Classificar HERDAR/REFORÇAR/BLOQUEAR/ADIAR/DESCARTAR | PENDENTE |
| 5 | Truth Map 5.1 | Classificar realidade técnica | PENDENTE |
| 6 | Migration Map 5.1 | Mapear nomes, tabelas e prefixos | PENDENTE |
| 7 | Blueprint Unificado 5.1 | Organizar arquitetura técnica | BLOQUEADO até 3–6 |
| 8 | SQL Master | Materializar em banco | BLOQUEADO |
| 9 | Dev Handoff | Execução por domínio | BLOQUEADO |
| 10 | UI/UX Spec | Superfícies e fluxos | BLOQUEADO para regra crítica |

### 21.2 Bloqueios de sequência

| Tentativa | Veredito |
|---|---|
| Criar Blueprint antes do benchmark | BLOQUEADO |
| Criar SQL antes do Migration Map | BLOQUEADO |
| Criar app antes de limites de persona | BLOQUEADO |
| Criar IA operacional antes de Action Request | BLOQUEADO |
| Criar planos antes de ledger/wallet | BLOQUEADO |
| Criar corporativo antes de LGPD mínima | BLOQUEADO |
| Criar parcerias antes de anti-cupom | BLOQUEADO |

---

## 22. Benchmark global obrigatório

Antes do Blueprint KortexOS™ 5.1, deve existir benchmark por módulo.

### 22.1 Soluções a comparar

| Categoria | Referências mínimas |
|---|---|
| Beauty/wellness platforms | Zenoti, Fresha, Phorest, Mindbody, Boulevard, GlossGenius, Square Appointments, Booksy, Vagaro, Meevo, Mangomint |
| Fintech/ledger | Stripe Connect, Adyen Platforms, Modern Treasury, Stripe Treasury |
| Corporate wellness | Wellhub/Gympass, ClassPass Corporate, corporate benefits platforms |
| Scheduling/yield | boas práticas de appointment scheduling, revenue management, capacity optimization |
| Messaging/AI | soluções de AI receptionist, WhatsApp automation, contact center e consent management |

### 22.2 Módulos obrigatórios do benchmark

| # | Módulo |
|---:|---|
| 01 | Booking & Capacity Scheduling |
| 02 | Smart Gap / Waitlist / Resource Locks |
| 03 | Checkout & Payments |
| 04 | Ledger / Wallet / Current Accounts |
| 05 | Compensation / Tips / Payout |
| 06 | No-show / Deposit / Card-on-file |
| 07 | AI Receptionist / CoPilot |
| 08 | Messaging / Links / QR / Integrations |
| 09 | Subscription & Occupancy Engine |
| 10 | Corporate Benefits & Employee Wellness Engine |
| 11 | Partner Benefits & Local Network Engine |
| 12 | Analytics / Decision Intelligence |
| 13 | Multiunit / Marketplace / White-label |

### 22.3 Critérios de comparação

| Classificação | Uso |
|---|---|
| HERDAR | Já está correto no 4.0/5.1 |
| RENOMEAR | Só muda nomenclatura |
| REFORÇAR | Mercado confirma importância |
| ADICIONAR AO BACKLOG | Bom, mas não agora |
| BLOQUEAR | Sofisticação prematura ou risco |
| DESCARTAR | Não serve ao modelo Kortex |

---

## 23. Critérios de produto final aprovado

| Critério | Obrigatório |
|---|---:|
| Tenant isolation provado | Sim |
| Platform isolation provado | Sim |
| RLS real | Sim |
| Booking Candidate backend | Sim |
| Smart Gap Law | Sim |
| Resource lock | Sim |
| Checkout backend-only | Sim |
| Ledger double-entry append-only | Sim |
| Wallet reconstruível | Sim |
| Staff current account | Sim |
| Tip isolation | Sim |
| Negative Guard | Sim |
| Subscription consumption | Sim |
| Corporate privacy | Sim |
| Partner anti-cupom | Sim |
| Reliability Score | Sim |
| Action Request | Sim |
| IA sem soberania | Sim |
| KortexLink consentido | Sim |
| Analytics reconstruível | Sim |
| LGPD/Fiscal | Sim antes de produção comercial |

---

## 24. Veredito Red Team

### 24.1 Aprovado como tese canônica

| Item | Veredito |
|---|---|
| KortexOS™ como nome canônico | APROVADO |
| Intelligent Capacity thesis | APROVADO |
| Ecossistema das 5 soluções | APROVADO |
| KortexFlow | APROVADO como tese; implementação pendente |
| Kortex.ai sem soberania | APROVADO |
| KortexLink como circuito de ativação | APROVADO |
| Negative Guard expandido | APROVADO |
| No-show progressivo + Trust Pass + Healing | APROVADO |
| Yield & Occupancy | APROVADO |
| Subscription Engine | APROVADO como motor central |
| Corporate Benefits | APROVADO como motor obrigatório |
| Partner Benefits | APROVADO como motor obrigatório |

### 24.2 Bloqueado

| Item | Motivo |
|---|---|
| Blueprint imediato | Falta benchmark, comparative proposal, truth map e migration map |
| SQL novo | Falta Blueprint aprovado |
| IA executora | Viola soberania backend |
| Plano sem ledger/wallet | Cria saldo paralelo |
| Corporativo sem privacidade | Risco LGPD |
| Parceria como cupom aberto | Perde rastreabilidade e margem |
| Dynamic pricing automático | Precisa política, dados e gate |

### 24.3 Risco principal

```text
O maior risco do KortexOS™ 5.1 não é falta de visão.
É excesso de ambição antes da fundação provada.
```

### 24.4 Decisão final

```text
Master Briefing KortexOS™ 5.1 Rewrite aprovado como fonte canônica após aprovação do Platform Owner.
Blueprint KortexOS™ 5.1 continua bloqueado até benchmark, proposta comparativa, Truth Map e Migration Map.
SQL continua bloqueado.
```

---

## 25. Encerramento canônico

Este documento substitui versões parciais anteriores do Master Briefing KortexOS™ 5.1.

Ele consolida:

- a promoção HOPE OS / SMART Flow™ → KortexOS™;
- a tese Intelligent Capacity;
- as 5 soluções globais;
- a mitigação de custo de IA;
- a matriz de soberania do Kortex.ai;
- o KortexFlow financeiro;
- staff current account;
- client wallet;
- Negative Guard expandido;
- no-show, Reliability Score, Trust Pass e Healing;
- yield e ocupação;
- assinaturas;
- plano corporativo;
- parcerias locais;
- KortexLink;
- KortexApp por persona;
- Action Requests;
- RAGOV;
- Gates 00–25;
- benchmark obrigatório;
- bloqueios de sequência.

```text
Básico antes do sofisticado.
Backend antes de frontend.
Ledger antes de dashboard.
Gates antes de escala.
Benchmark antes de Blueprint.
Blueprint antes de SQL.
```
