# KORTEXOS™ NOW-SCOPE — MASTER BRIEFING V1.4 (DECISION INTELLIGENCE)

**Arquivo:** `docs/KORTEXOS_NOW_SCOPE_V1_4_MASTER_BRIEFING.md`
**Produto:** KortexOS™ (nome canônico) — executado como release **HOPE OS V1.4** neste repositório
**Data:** 2026-07-08
**Base:** Master Briefing 5.1 (raiz) + Benchmark Map (passo 3 ✓) + Comparative Proposal (passo 4 ✓)
**Branch de execução:** `codex/v1.4-dashboard-premium`
**Documentos irmãos:** `KORTEXOS_NOW_SCOPE_V1_4_SPEC.md` (spec técnica) e `KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md` (execução)

---

## 0. Regra-mãe do now-scope

```text
ZERO MIGRATION. Zero tabela nova. Zero coluna nova. Zero RPC nova. Zero alteração no Supabase.
Toda inteligência nova é DERIVADA (read-only) da verdade que o ledger distribuído já grava.
Backend calcula. Frontend exibe. Nenhum threshold no frontend.
As únicas escritas novas usam estruturas existentes: lista_espera (CRUD) e POST /agenda (rebooking).
```

Isto respeita simultaneamente:
- a regra-mãe do HOPE OS (backend é a verdade única; `frontendCalculates: false`);
- o bloqueio canônico 5.1 ("SQL novo antes do Blueprint" — não há SQL);
- os gates proibidos do CLAUDE.md (nada de IA, assinatura vendida, CRM avançado, marketing automático).

## 1. Tese do V1.4

O V1.4 é o **primeiro incremento KortexOS real**: o domínio D25 (Analytics & Decision Intelligence) nascendo sobre o banco atual, transformando 5+ meses de dados reais de produção (1.481+ clientes, milhares de comandas fechadas com ledger conferido) em decisão diária para o dono.

```text
Agenda é a superfície.  → V1.3 entregou a superfície premium.
Capacidade é o produto. → V1.4 mede a capacidade (ocupação, buracos, RevPAH).
Dinheiro é o núcleo.    → V1.4 projeta o caixa (D+n) e decompõe a margem.
Decisão é o diferencial.→ V1.4 entrega "Ação do dia" (quem chamar, que buraco atacar).
```

## 2. Escopo aprovado (Top 10 do Comparative Proposal)

| # | Entrega | Fase | Categoria |
|---:|---|---|---|
| 1 | Cockpit de Ocupação: SUR por profissional, heatmap dia×hora, load factor semanal, relatório de buracos | F1+F3 | Ocupação |
| 2 | Margem & Repasse: ranking de margem por serviço/profissional/forma; painel de produção do profissional | F1+F3 | Margem |
| 3 | Fluxo de caixa projetado: curva D+30 de recebíveis líquidos por forma de pagamento | F1+F3 | Caixa |
| 4 | Radar de Retenção: segmentos RFM + lista priorizada de churn-risk ("quem chamar hoje") | F2+F3 | Retenção |
| 5 | Reliability Score v0 por cliente (shadow, read-only, badge informativo) | F2+F3 | Confiança |
| 6 | Rebooking pós-checkout: sugestão de próxima visita ao fechar comanda (1 toque → POST /agenda) | F4 | Retenção |
| 7 | Split payment completo (consertar): preview + close com N pagamentos | F0 (esconder) + F4 (completar) | Checkout |
| 8 | Waitlist: ativar `lista_espera` (CRUD + candidatos no cancelamento) | F4 | Ocupação |
| 9 | Attach rate + afinidade serviço→produto (insight de bundling) | F2+F4 | Margem |
| 10 | WhatsApp one-tap: links `wa.me` pré-preenchidos (lembrete véspera, reativação, oferta de vaga) | F4 | Retenção |

**Assinatura/monetização:** neste ciclo, SOMENTE analytics de candidatos a assinante + simulador de plano (leitura). Venda de plano = fase pós-migration.

## 3. Truth Map do now-scope (capacidade × dado existente)

| Capacidade | Fonte no schema atual | Status |
|---|---|---|
| Ocupação SUR / heatmap / buracos | `agendamentos` (data, horario, duracao_min, status) × `profissionais.horario` jsonb (fallback: 8 slots × `empresas.slot_padrao`) | COMPUTÁVEL |
| RevPAH | `comandos.receita_empresa_centavos` ÷ horas disponíveis | COMPUTÁVEL |
| Margem por serviço/prof/produto | `comando_itens` (valor_liquido, custo, comissao_centavos, receita_empresa_centavos, tipo) | COMPUTÁVEL (dado pronto linha a linha) |
| Taxa por forma de pagamento | `comando_pagamentos` (taxa_total, taxa_pct) | COMPUTÁVEL |
| Fluxo de caixa D+n | `comando_pagamentos.valor/taxa` + `formas_pagamento.dias_recebimento` + `comandos.data` | COMPUTÁVEL |
| Repasse por profissional | `comando_itens.comissao_centavos` + `comando_gorjetas.valor_liquido_centavos` | COMPUTÁVEL |
| RFM | `comandos` (cliente_id, data, total_recebido_centavos) | COMPUTÁVEL |
| Churn-risk por intervalo próprio | histórico de `comandos`/`agendamentos` por cliente | COMPUTÁVEL |
| Reliability Score v0 | `clientes.faltas` + `agendamentos.status` (no_show, cancelado, concluido) + `updated_at` | COMPUTÁVEL (aproximação de "cancelamento tardio" via updated_at documentada) |
| Rebooking rate + sugestão | intervalos entre `comandos` por cliente×serviço | COMPUTÁVEL |
| Attach / afinidade | co-ocorrência em `comando_itens` por comando_id | COMPUTÁVEL |
| Waitlist | tabela `lista_espera` (id, cliente, serviço, prof, data_preferencia, status) | REAL E OCIOSA → ativar |
| Split payment (N pagamentos) | RPC `checkout_close` já itera `payments[]` | REAL no banco; PARCIAL no engine/frontend |
| Wallet, plano, depósito, corporativo, parceiro | — | BLOQUEADO (exige migration) |

## 4. Habilidades a desenvolver (skills matrix)

| Habilidade | Origem | Onde vive no V1.4 |
|---|---|---|
| Revenue management (SUR, load factor, RevPAH) | Aviação/hotelaria/spa (Xotels) | `InsightsService` — ocupação e yield |
| Decomposição de margem via ledger distribuído | Contabilidade gerencial | `InsightsService` — margem |
| Projeção de recebíveis D+n | Fintech (settlement) | `InsightsService` — caixa |
| Segmentação RFM por quintis dinâmicos | CRM analytics clássico | `RetentionService` |
| Scoring determinístico explicável (0–100, fatores visíveis) | Credit scoring simplificado | `RetentionService` — reliability |
| Estatística de intervalos (mediana de gaps, ratio de atraso) | Séries temporais básicas | `RetentionService` — churn/rebooking |
| Regras de associação por lift (serviço→produto) | Market basket analysis | `InsightsService` — attach |
| UX de decisão (bento, heatmap, "Ação do dia") | Dashboards de operação (Uber/hotel) | `js/ui/dashboard.js` |

Princípio §3.2 do Master Briefing aplicado: **decisão recorrente vira regra matemática backend** — nenhuma dessas habilidades usa IA generativa.

## 5. KPIs e metas (calibradas pelo benchmark)

| KPI | Baseline | Meta 90 dias | Referência de mercado |
|---|---|---|---|
| Rebooking rate | medir (V1.4 passa a medir) | ≥ 60% | média 52%, crítico 60%, top 80%+ |
| Ocupação (SUR) semanal | medir | +10 p.p. sobre baseline | ~70% saudável |
| Retenção 1ª→2ª visita | medir | ≥ 50% | média do setor: 35% |
| No-show rate | medir | < 10% | 15–30% sem proteção |
| Attach rate (produto em comanda) | medir | +5 p.p. | retail discipline → margem 10–12% |
| Clientes em risco reativados/semana | 0 | ≥ 5 contatos/semana via one-tap | Phorest Client Reconnect |
| Margem líquida | medir | tendência 10–12% | base setor ~8% |

Regra: **primeiro medir (F1–F3), depois agir (F4), depois calibrar metas** — nenhuma meta vira régua automática neste ciclo.

## 6. Governança e bloqueios vigentes

| Item | Regra no V1.4 |
|---|---|
| Cálculo financeiro | 100% backend (`/api/insights/*` retorna séries prontas) |
| Thresholds (faixas RFM, faixas de score, cores de risco) | Definidos no backend, enviados na resposta; frontend só pinta |
| Escrita | Somente: `lista_espera` CRUD, rebooking via POST /agenda existente, split via RPC existente |
| Score de cliente | Shadow: exibe + explica fatores; NUNCA bloqueia/cobra neste ciclo |
| WhatsApp | Link manual um-a-um; proibido loop/disparo em massa |
| IA | Proibida |
| Dados sensíveis | Insights agregados não expõem observações/notas de cliente |
| Erros de negócio | Mesmo padrão vigente (P0001→422; mensagens do backend exibidas integrais) |

## 7. Ordem de construção (fases)

| Fase | Nome | Conteúdo | Duração alvo |
|---|---|---|---|
| F0 | Saneamento | Esconder UI de split quebrada (flag), bump service worker, deploy limpo | 0,5 dia |
| F1 | Insights núcleo (backend) | `/insights/occupancy`, `/insights/margin`, `/insights/cashflow` + testes | 2–3 dias |
| F2 | Retenção (backend) | `/insights/retention` (RFM+churn), `/insights/clients/:id/reliability`, `/insights/attach` | 2 dias |
| F3 | Dashboard V1.4 (frontend) | Bento: Ocupação (heatmap), Dinheiro (RevPAH/margem/caixa D+30), Pessoas (RFM/risco), Ação do dia | 2–3 dias |
| F4 | Camada de ação | Rebooking pós-checkout, split completo, waitlist, WhatsApp one-tap, sugestão de attach | 2–3 dias |
| F5 | Gate final | QA manual estruturado por fluxo, auditoria REAL/PARCIAL/MOCKADO, deploy GitHub Pages + Render | 1 dia |

Total: ~10 dias úteis. **Uma prioridade por vez** — fase só abre com a anterior auditada.

## 8. Fora de escopo (reafirmação)

IA; marketplace; app do cliente; multiunidade; **assinatura vendida**; CRM avançado; gamificação; **mensagens automáticas**; dynamic pricing; wallet/saldo; depósito/sinal; card-on-file; qualquer migration. Cada um destes exige decisão explícita do usuário + fase própria (Truth Map/Migration Map/Blueprint 5.1).

## 9. Critério de sucesso do V1.4

```text
O dono abre o dashboard de manhã e sabe, sem planilha e sem achismo:
1. onde estão os buracos de hoje e da semana (e quem está na espera para preenchê-los);
2. quanto dinheiro cai em D+7/D+30, líquido de taxas;
3. qual serviço/profissional sustenta a margem e qual destrói;
4. quais 5 clientes valiosos estão sumindo e um toque para chamá-los;
5. quem merece confiança na hora de agendar (score shadow).
Tudo derivado do ledger real. Nada mockado. Nada calculado no frontend.
```
