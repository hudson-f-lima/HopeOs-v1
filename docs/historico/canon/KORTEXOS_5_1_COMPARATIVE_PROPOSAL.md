# KORTEXOS™ 5.1 — COMPARATIVE PROPOSAL

**Arquivo:** `docs/canon/KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md`
**Passo canônico:** 4 de 10 (ver Master Briefing §21.1)
**Base:** `docs/canon/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md` (passo 3, concluído)
**Data:** 2026-07-08
**Status:** CONCLUÍDO — desbloqueia Truth Map (passo 5) e Migration Map (passo 6)
**Critérios (§22.3):** HERDAR / RENOMEAR / REFORÇAR / ADICIONAR AO BACKLOG / BLOQUEAR / DESCARTAR

Coluna extra **NOW-SCOPE (zero migration)**: a fatia de cada módulo executável hoje sobre o schema HOPE OS atual (migrations 001–006), sem SQL novo, sem tabela nova, sem RPC nova.

---

## 1. Classificação por módulo

| # | Módulo | Veredito 5.1 | Justificativa (benchmark) | NOW-SCOPE (zero migration) |
|---:|---|---|---|---|
| 01 | Booking & Capacity Scheduling | **HERDAR + REFORÇAR** | Slot como inventário perecível é o padrão dos líderes; tese D07 confirmada | **SIM (leitura):** ocupação SUR por dia×hora×profissional, load factor, relatório de buracos — tudo agregação sobre `agendamentos` + `profissionais.horario` |
| 02 | Smart Gap / Waitlist / Resource Locks | **REFORÇAR (waitlist) / ADIAR (locks)** | Backfill de cancelamento é o "overbooking seguro" | **SIM (parcial):** tabela `lista_espera` EXISTE e está ociosa → CRUD + match manual em cancelamento. Resource locks: não (sem tabela de recursos) |
| 03 | Checkout & Payments | **HERDAR + consertar** | Split é higiene de mercado; monetização real é processamento (fase futura) | **SIM:** RPC `checkout_close` já grava N pagamentos (`jsonb_array_elements(payments)`); falta só o frontend/engine preview. Card-on-file/depósito: NÃO (exige PSP + token) |
| 04 | Ledger / Wallet / Current Accounts | **HERDAR tese / ADIAR implementação** | Padrão Modern Treasury = tese KortexFlow §7 | **NÃO para wallet.** Ledger distribuído atual segue como verdade; wallet sem tabela = saldo paralelo (BLOQUEADO §19.6) |
| 05 | Compensation / Tips / Payout | **REFORÇAR (visibilidade)** | Transparência de repasse retém staff (que leva 40–60% dos clientes ao sair) | **SIM (leitura):** produção/comissão/gorjeta por profissional por período — `comando_itens` + `comando_gorjetas` já têm tudo. Payout batch: NÃO (sem tabela) |
| 06 | No-show / Deposit / Card-on-file | **REFORÇAR (medir) / ADIAR (cobrar)** | Depósito corta 40–60%, mas exige score ANTES da régua | **SIM (shadow):** Reliability Score v0 read-only por cliente (`clientes.faltas` + `agendamentos.status`). Cobrança/depósito: NÃO |
| 07 | AI Receptionist / CoPilot | **BLOQUEAR (manter)** | Líderes de booking ainda sem IA confiável; sem pressa competitiva | **NÃO.** Nada de IA no now-scope |
| 08 | Messaging / Links / QR | **ADICIONAR AO BACKLOG + atalho manual** | Lembrete véspera e reativação de sumidos = maior ROI (Phorest Client Reconnect) | **SIM (manual):** deep link `wa.me` com texto pré-preenchido, disparo um-a-um pelo dono. NÃO é automação (gate "marketing automático" preservado) |
| 09 | Subscription & Occupancy Engine | **REFORÇAR tese / BLOQUEAR dinheiro** | Maior alavanca do setor (35% receita, 2,4× frequência), MAS plano sem ledger = saldo paralelo | **SIM (analytics):** lista de candidatos a assinante (frequência×ticket), simulação de preço de plano. Venda/cobrança: NÃO |
| 10 | Corporate Benefits | **ADIAR** | Modelo Wellhub validado; exige contrato+billing+LGPD | **NÃO** (benchmark documentado) |
| 11 | Partner Benefits | **ADIAR** | Mercado paga 20% por cliente novo → parceria local é CAC barato | **NÃO** (exige origem rastreável em tabela) |
| 12 | Analytics / Decision Intelligence | **REFORÇAR — PRIORIDADE Nº 1** | Todas as métricas de decisão dos setores de referência são agregações sobre dados já gravados | **SIM (núcleo do now-scope):** RevPAH, margem por prof/serviço/forma, fluxo de caixa D+n, RFM, churn-risk, attach rate, rebooking rate |
| 13 | Multiunit / Marketplace / White-label | **BLOQUEAR (manter)** | Todos os players escalaram isso só após core estável | **NÃO** |

---

## 2. Decisões derivadas

### 2.1 O que o now-scope É

```text
O now-scope é o D25 (Analytics & Decision Intelligence) nascendo primeiro,
mais a ativação de ativos ociosos do schema atual (lista_espera, faltas,
dias_recebimento, snapshot) e o conserto do checkout (split).
Nenhuma verdade nova é criada. Toda verdade nova é DERIVADA (read-only)
da verdade que o ledger distribuído já grava.
```

### 2.2 O que o now-scope NÃO É

| Tentação | Veredito | Motivo |
|---|---|---|
| Assinatura vendida de verdade | BLOQUEADO | Sem ledger/wallet = saldo paralelo (§19.6) |
| Depósito/sinal cobrado | BLOQUEADO | Sem PSP/card-on-file |
| Dynamic pricing automático | BLOQUEADO | §12.4 — exige política + gate |
| Mensagem automática | BLOQUEADO | Gate proibido (marketing automático) — só disparo manual um-a-um |
| Score que pune cliente | BLOQUEADO | Score v0 é shadow (exibe, não cobra) |
| IA em qualquer fluxo | BLOQUEADO | §6.4 |
| Tabela/RPC/coluna nova | BLOQUEADO | Restrição-mãe do now-scope: zero migration |

### 2.3 Ordem de valor (impacto × esforço, dado o benchmark)

| Rank | Solução | Impacto | Esforço | Racional |
|---:|---|---|---|---|
| 1 | Cockpit de Ocupação (SUR, heatmap dia×hora, buracos) | ALTO | MÉDIO | Inventário perecível: não se gerencia o que não se mede |
| 2 | Margem & Repasse por profissional/serviço | ALTO | BAIXO | `comando_itens` já tem comissão/custo/receita linha a linha |
| 3 | Fluxo de caixa projetado D+n | ALTO | BAIXO | `formas_pagamento.dias_recebimento` + taxas já gravadas por pagamento |
| 4 | Radar de Retenção (RFM + churn-risk + "quem chamar hoje") | ALTO | MÉDIO | Retenção 35% de cliente novo é a maior sangria do setor |
| 5 | Rebooking no pós-checkout (pré-agendamento) | ALTO | MÉDIO | Alavanca nº 1 comprovada; usa POST /agenda existente |
| 6 | Reliability Score v0 (shadow) | MÉDIO-ALTO | BAIXO | Pré-requisito para régua de no-show futura; `faltas` já existe |
| 7 | Split payment completo | MÉDIO | BAIXO-MÉDIO | Conserta feature quebrada; RPC já pronta |
| 8 | Waitlist (ativar `lista_espera`) | MÉDIO | MÉDIO | Backfill de cancelamento; tabela ociosa |
| 9 | Attach rate + afinidade serviço→produto | MÉDIO | BAIXO | Retail attach = margem incremental |
| 10 | WhatsApp one-tap (lembrete/reativação manual) | MÉDIO-ALTO | BAIXO | 80% do valor do lembrete com 0% da infra |

---

## 3. Impacto no Truth Map e Migration Map (passos 5–6)

- **Truth Map 5.1 (pendente):** o now-scope não o substitui, mas o Master Briefing NOW (documento irmão) inclui um Truth Map *do escopo atual* — classificação REAL/COMPUTÁVEL/BLOQUEADO por capacidade sobre o schema vigente.
- **Migration Map 5.1 (pendente):** intocado. O now-scope, por definição, não cria nome novo de tabela. A fase pós-now (wallet, assinatura, corporativo, parceiro) continua bloqueada até Migration Map + Blueprint.

---

## 4. Veredito

```text
Aprovado para execução imediata: NOW-SCOPE V1.4 (Decision Intelligence + ativos ociosos + conserto de checkout).
Bloqueado sem mudança: tudo que movimenta dinheiro novo, cria saldo, automatiza mensagem ou usa IA.
Blueprint 5.1 completo: continua bloqueado até Truth Map e Migration Map formais.
```
