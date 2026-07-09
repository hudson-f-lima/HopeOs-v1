# KORTEXOS™ 5.1 — GLOBAL BENCHMARK MAP

**Arquivo:** `docs/canon/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md`
**Passo canônico:** 3 de 10 (ver `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md` §21.1)
**Data:** 2026-07-08
**Status:** CONCLUÍDO — desbloqueia o passo 4 (Comparative Proposal)
**Método:** pesquisa web (jul/2026) + conhecimento de domínio. Todo número de mercado aqui é **referência, não verdade de produto** (RAGOV §19.4 — HARDCODED permitido apenas como dado de benchmark).
**Autoridade:** este documento compara; não decide arquitetura sozinho (§0.1).

---

## 1. Números-chave do mercado (síntese)

| Métrica | Valor de mercado | Fonte |
|---|---|---|
| No-show médio sem proteção | 15–30% das reservas | SpaSphere, DaySpark, Bookrhub 2026 |
| Perda média mensal por no-show (salão) | US$ 1.500–3.000/mês | DaySpark |
| Redução de no-show com depósito | 40–60% (até 60–80%) | SpaSphere 2026, Shortcuts |
| Depósito recomendado | 20–30% do serviço, janela 24h | SpaSphere |
| Receita recorrente onde há membership | ~35% da receita total | GetMonetizely |
| Retenção com membership vs sem | +60% | GetMonetizely |
| Frequência de membros vs avulsos | 2,4× visitas, +25% gasto/visita | GetMonetizely |
| Crescimento de vendas de membership (full-service, 2025) | +36% a.a. | Boulevard Industry Report |
| Churn mensal saudável de membership | < 20% | GetMonetizely |
| Retenção geral de clientes (salões) | 55–65% | Regulr 2025-26 |
| Retenção de cliente NOVO (1ª→2ª visita) | ~35% média (65% nunca voltam) | Nick Mirabella / Meevo |
| Rebooking médio | 52% (hair), 43% (beauty) | Favecard |
| Rebooking crítico de sobrevivência | 60% | Nick Mirabella |
| Rebooking top performers | 80%+ | Favecard |
| Pré-agendamento no checkout | alavanca nº 1 de retenção; meta 50–65% | Koalendar / Meevo |
| Utilização (SUR) exemplo saudável | ~70%+ (horas vendidas/disponíveis) | Xotels |
| Margem líquida salão | ~8% base → 10–12% com add-ons/membership/retail | BusinessPlanSuite |
| Profissional que sai leva | 40–60% dos clientes dele | EasyMarketingSchool |

---

## 2. Benchmark por módulo obrigatório (§22.2 do Master Briefing)

### M01 — Booking & Capacity Scheduling

| Referência | O que faz |
|---|---|
| Boulevard | "Precision Scheduling": ordena agendamentos para minimizar buracos entre atendimentos (compactação de agenda) |
| Zenoti | Smart booking com sugestão de horário ótimo para o negócio, não só para o cliente |
| Fresha/Booksy | Booking-first: marketplace + agenda online simples |
| Aviação | Load factor como KPI central; capacidade gerida por classe tarifária; breakeven típico 65–75% de ocupação |

**Lição KortexOS:** o mercado maduro trata o *slot* como inventário perecível (assento de avião). Quem só mostra "horários livres" perde para quem ranqueia "qual horário é melhor para o negócio" (Slot Score — já é tese D07). Ocupação medida por minutos vendidos/minutos disponíveis (SUR), não por contagem de agendamentos.

### M02 — Smart Gap / Waitlist / Resource Locks

| Referência | O que faz |
|---|---|
| Mangomint/Zenoti | Waitlist com oferta automática quando abre buraco (cancelamento → notifica lista) |
| Boulevard | Gap prevention na origem (ordenação inteligente) |
| Aviação | Overbooking calculado sobre probabilidade de no-show — o análogo seguro em serviços é *backfill via waitlist*, não overbooking físico |

**Lição:** cancelamento sem backfill é receita morta. A fila de espera é o "overbooking seguro" de serviços.

### M03 — Checkout & Payments

| Referência | O que faz |
|---|---|
| Fresha | Monetiza processamento: 2,19% + $0,20/transação; migrou de "grátis" para plano pago em 2025 (US$ 20/mês) |
| GlossGenius | Flat fee simples (US$ 28/mês) + processamento |
| Square Appointments | No-show fee via cartão em arquivo (card-on-file) |
| Boulevard | Premium (US$ 176/mês) com checkout de alto padrão |

**Lição:** split de pagamento é higiene (todos têm); monetização real dos players é **taxa de pagamento + plano SaaS**. Card-on-file é a infra que destrava proteção anti-no-show.

### M04 — Ledger / Wallet / Current Accounts

| Referência | O que faz |
|---|---|
| Modern Treasury | Ledger double-entry como API; saldo sempre reconstruível |
| Stripe Connect / Adyen Platforms | Contas conectadas por participante (salão, profissional), settlement automático |
| Stripe Treasury | Wallet embutida com contas FBO |

**Lição:** o padrão global é exatamente a tese KortexFlow (§7): append-only, double-entry, cents inteiros, idempotência. O ledger distribuído atual do HOPE OS (comandos/pagamentos/gorjetas/caixa) é um precursor válido, mas wallet e conta-corrente de staff exigem tabelas novas → fase com migration.

### M05 — Compensation / Tips / Payout

| Referência | O que faz |
|---|---|
| Zenoti/Meevo | Modelos múltiplos de comissão + relatório de repasse por período |
| GlossGenius/Square | Tip isolation nativa (gorjeta 100% do profissional, fora da base de comissão) |
| Uber | Painel de ganhos do motorista em tempo real = transparência que retém oferta (profissional) |

**Lição:** transparência de repasse retém profissional — e profissional que sai leva 40–60% dos clientes. Painel de produção/repasse por profissional é ferramenta de retenção de *staff*, não só contabilidade.

### M06 — No-show / Deposit / Card-on-file

| Referência | O que faz |
|---|---|
| Vagaro (relatório 2023) | Depósito em serviços >90min: −41% de no-show vs card-on-file puro |
| Shortcuts | Régua de proteção corta até 70% |
| Mercado geral | Depósito 20–30%, janela 24h, régua progressiva por histórico |

**Lição:** a régua progressiva do Master Briefing (§11.2) é exatamente o estado da arte. Pré-requisito técnico: score de confiabilidade **antes** da cobrança (medir → depois punir). Score em shadow mode primeiro é o caminho de menor risco.

### M07 — AI Receptionist / CoPilot

| Referência | O que faz |
|---|---|
| Zenoti/Mindbody | IA para triagem e resposta; decisão fica em regra |
| Mercado 2026 | Booking-first players ainda sem IA real (BookingPro AI comparison) |

**Lição:** confirma a tese §3 — IA entende linguagem, backend decide. Sem urgência competitiva imediata: os líderes de booking ainda não têm IA operacional confiável. BLOQUEADO no now-scope (correto).

### M08 — Messaging / Links / QR / Integrations

| Referência | O que faz |
|---|---|
| Phorest | "Client Reconnect": campanha para cliente sumido (lapsed) — uma das features de maior ROI do setor |
| Booksy/Fresha | Lembrete automático de véspera (redução de no-show barata) |
| WhatsApp (BR) | Canal dominante; deep link `wa.me` com texto pré-preenchido funciona sem infra/API |

**Lição:** no Brasil, o atalho de custo zero é link `wa.me` disparado manualmente (um toque) — não é automação (não fere o gate proibido "marketing automático"), mas captura ~80% do valor do lembrete/reativação.

### M09 — Subscription & Occupancy Engine

| Referência | O que faz |
|---|---|
| Zenoti/Mindbody | Memberships como motor central: 35% da receita, 2,4× frequência |
| Boulevard report | Membership = categoria que mais cresce no setor (+36% em 2025) |
| ClassPass | Créditos flexíveis deslocam demanda para horários fracos (yield indireto) |

**Lição:** assinatura é a maior alavanca comprovada de retenção + caixa antecipado do setor. Porém: **sem ledger/wallet é saldo paralelo** (BLOQUEADO por §19.6). O que dá para fazer antes: analytics de candidatos a assinante (frequência × ticket) e simulação de planos — decisão informada antes da infra.

### M10 — Corporate Benefits

| Referência | O que faz |
|---|---|
| Wellhub (Gympass) | B2B2C: empresa subsidia, funcionário usa, rede recebe por uso; privacidade agregada para o RH |
| ClassPass Corporate | Créditos corporativos com elegibilidade |

**Lição:** modelo validado globalmente; exige contrato, elegibilidade, billing e LGPD — tudo pós-migration. Benchmark documentado, implementação ADIADA.

### M11 — Partner Benefits & Local Network

| Referência | O que faz |
|---|---|
| Fresha marketplace | 20% de comissão sobre cliente NOVO trazido pelo canal (mín. US$ 6) — prova que aquisição rastreável tem preço de mercado alto |
| Hotéis/spas | Parcerias locais com voucher rastreado por origem |

**Lição:** o mercado paga 20% por cliente novo → parceria local rastreável (academia, coworking) é CAC barato. Anti-cupom (§15.4) é o diferencial correto. Exige origem rastreável → pós-migration.

### M12 — Analytics / Decision Intelligence

| Referência | O que faz |
|---|---|
| Hotelaria | RevPAR = ocupação × diária média; decisão diária baseada em pickup |
| Spas (Xotels) | SUR (utilização), ATR (ticket médio por tratamento), RevPATH (receita por hora disponível de tratamento) |
| Aviação | Load factor + yield por assento-km; dashboards de decisão diária |
| Phorest/Zenoti | Relatórios de retenção, rebooking rate, attach de retail |
| Uber | Utilização do motorista + heatmap de demanda por hora/região |

**Lição:** TODAS as métricas de decisão dos setores de referência são **agregações determinísticas sobre dados que o HOPE OS já grava**. Este módulo é o de maior valor implementável com zero migration — é o D25 (Analytics & Decision Intelligence) nascendo como primeira superfície KortexOS real.

### M13 — Multiunit / Marketplace / White-label

**Lição:** todos os players só escalaram isso após core estável. BLOQUEADO (correto, §19.6).

---

## 3. Lições transversais (Uber / aviação / hotelaria)

| Princípio | Origem | Tradução para salão |
|---|---|---|
| Inventário perecível | Aviação | Slot vazio às 14h de terça nunca mais será vendido — medir e atacar buracos é prioridade nº 1 |
| Load factor antes de preço | Aviação | Primeiro medir ocupação real por dia×hora×profissional; só depois falar de yield |
| RevPAR / RevPATH | Hotelaria/Spa | RevPAH: receita da empresa por hora disponível de profissional — a métrica única que une ocupação e margem |
| Surge/dynamic pricing | Uber | BLOQUEADO sem política (§12.4) — mas o *insight* de janela morta com sugestão de ação manual é permitido |
| Utilização da oferta | Uber | Painel do profissional (produção, repasse) retém a oferta como o painel do motorista retém o motorista |
| Overbooking probabilístico | Aviação | Versão segura: waitlist backfill sobre cancelamentos |
| Fidelidade por status | Aviação (milhas) | Reliability Score / Trust Pass (§11) — fricção inversa ao histórico |
| Caixa previsível | Todos | Projeção D+n de recebíveis por forma de pagamento (taxa + dias de liquidação já cadastrados no HOPE OS) |

---

## 4. Fontes

- The Salon Business — Best Salon Software Guide 2026 (https://thesalonbusiness.com/best-salon-software/)
- BookingPro AI — Best Salon Software 2026 (https://bookingpro.ai/blog/best-salon-software-2026/)
- Business Model Canvas — How Fresha Works (https://businessmodelcanvastemplate.com/blogs/how-it-works/fresha-how-it-works)
- SpaSphere — Spa Deposits Cut No-Shows by 60% (https://spasphere.ai/blog/spa-deposits-vs-no-deposits)
- DaySpark — Hair Salon No-Show Reduction Playbook (https://dayspark.com/blog/hair-salon-no-show-reduction-playbook)
- Shortcuts — Cut Salon No-Shows by Up to 70% (https://shortcutssoftware.com/the-1-way-to-cut-salon-no-shows-by-up-to-70/)
- Boulevard — Salon Industry Statistics & Benchmarks 2026 (https://www.joinblvd.com/blog/salon-trends-industry-statistics)
- GetMonetizely — Salon Membership Pricing Guide (https://www.getmonetizely.com/articles/optimizing-your-salon-membership-pricing-a-guide-to-spa-subscription-models)
- Zenoti — Salon Trends 2026 (https://zenoti.com/thecheckin/salon-trends-2026)
- Regulr — Retention Benchmarks by Industry 2025-2026 (https://regulr.ai/blog/retention-benchmarks-by-industry)
- Xotels — Spa Revenue Management KPI: SUR, ATR, REVPATH (https://www.xotels.com/en/revenue-management/spa-revenue-management-kpi)
- Favecard — Salon Loyalty: Boost Rebooking to 80%+ (https://www.favecard.co/en/blog/salon-loyalty-program/)
- Meevo — Calculating Client Retention Rate (https://www.meevo.com/blog/calculating-client-retention-rate/)
- Nick Mirabella — Client Retention and Rebooking System (https://nickmirabella.com/blogs/salon-coach/client-retention-and-rebooking-the-system-to-stop-leaking-revenue)
- EasyMarketingSchool — Salon CLV Model (https://easymarketingschool.org/salon-clv-model-retention-upsell-strategies/)
