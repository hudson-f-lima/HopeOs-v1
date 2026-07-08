# KORTEXOS™ NOW-SCOPE V1.4 — DEV HANDOFF

**Arquivo:** `docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md`
**Base:** Master Briefing NOW V1.4 (escopo) + Spec V1.4 (contratos/fórmulas) — este documento só sequencia execução
**Branch:** `codex/v1.4-dashboard-premium`
**Data:** 2026-07-08
**Regra de execução:** uma fase por vez; fase seguinte só abre com a anterior auditada (REAL/PARCIAL/MOCKADO) e commitada

---

## F0 — Saneamento de produção (0,5 dia)

Contexto: split payment do V1.3 foi mergeado incompleto (UI renderiza, `buildPayload()` ignora splits, `validateSplitPayment()` valida contra `state.tip` em vez do total). Está em produção no GitHub Pages.

| # | Tarefa | Arquivos | DoD |
|---:|---|---|---|
| 0.1 | Esconder UI de split atrás de flag `SPLIT_ENABLED = false` (const no topo de checkout.js); toggle, container e rows não renderizam; `validateSplitPayment()` retorna `true` quando flag off | `js/ui/checkout.js`, `index.html` (nada a remover — só classe hidden garantida) | Checkout single-payment 100% funcional; botão Fechar nunca travado por split |
| 0.2 | Bump `CACHE_NAME` do service worker | `service-worker.js` | Reload em produção serve shell novo |
| 0.3 | Commit + push + deploy Pages; smoke manual: simular + fechar comanda real de teste | — | Comanda fecha; ledger confere no dashboard atual |

## F1 — Insights núcleo backend (2–3 dias)

| # | Tarefa | Arquivos | DoD |
|---:|---|---|---|
| 1.1 | Criar `backend/src/engines/insights/occupancy.js` — funções PURAS: `computeSur(agendamentos, janelas)`, `computeHeatmap(...)`, `computeGaps(...)`, `parseJanela(horarioJsonb, horarioEmpresa, slotPadrao)` com fallback 8×slot | novo | Unit test com fixtures cobre: jsonb vazio, cancelado/no_show, cap 100%, buraco ≥ slot |
| 1.2 | Criar `backend/src/engines/insights/cashflow.js` — `projectCashflow(pagamentos, formas, hoje)` pura | novo | Test: D+0 dinheiro/pix, D+30 crédito, taxa subtraída, agrupamento por data |
| 1.3 | Criar `backend/src/engines/insights/margin.js` — agregadores puros por serviço/prof/produto/forma | novo | Test: comanda mista serviço+produto; gorjeta não entra em margem (tip isolation) |
| 1.4 | Criar `backend/src/services/InsightsService.js` — orquestra repository (list paginado) + engines; datas em America/Sao_Paulo | novo | Sem cálculo no service além de composição; erros padrão |
| 1.5 | Rotas `GET /insights/occupancy`, `/insights/margin`, `/insights/cashflow` | `backend/src/routes/index.js` | Contratos idênticos à Spec §3; validação de query (datas) |
| 1.6 | Teste gate novo `backend/tests/insights-gate.test.js` (fixtures sintéticas nas funções puras — SEM depender do banco) + incluir no `test:gate` | `backend/package.json` | `npm run test:gate` verde com os novos testes somados |

**Auditoria F1:** rodar endpoints contra produção read-only e conferir 3 números manualmente contra o dashboard existente (receita do período deve bater com `FinanceReadModel`).

## F2 — Retenção backend (2 dias)

| # | Tarefa | Arquivos | DoD |
|---:|---|---|---|
| 2.1 | `backend/src/engines/insights/retention.js` — puras: `computeRfm(comandos, hoje)` (quintis dinâmicos), `computeChurnRisk(...)` (mediana de gaps + fallbacks), `computeReliability(agendamentosCliente, hoje)` | novo | Tests: cliente 1 visita (fallback), base pequena (quintis degenerados), score clamp 0–100, fatores sempre presentes |
| 2.2 | `computeRebooking(historico, servicoId)` e `computeAttach(itens)` (lift, suporte mín. 5) | mesmo arquivo ou `attach.js` | Tests: fallback cadeia cliente→serviço→45d; lift filtrado |
| 2.3 | `backend/src/services/RetentionService.js` + rotas `GET /insights/retention`, `/insights/clients/:id/reliability`, `/insights/attach`, `/insights/rebooking/:clienteId` | novos + routes | Contratos da Spec; `quemChamar` cap 20; sem `observacoes` no payload |
| 2.4 | Somar ao gate (`insights-gate.test.js`) | — | test:gate verde |

**Auditoria F2:** conferir 3 clientes reais conhecidos: score explicável bate com histórico; divergência `clientes.faltas` × status reportada, não corrigida.

## F3 — Dashboard V1.4 frontend (2–3 dias)

| # | Tarefa | Arquivos | DoD |
|---:|---|---|---|
| 3.1 | `js/api.js`: helpers insights (reuso do `api()` existente); `js/state.js`: `state.insights = {occupancy, margin, cashflow, retention, attach, loading}` | existentes | Sem cálculo novo no front |
| 3.2 | Reestruturar aba Dashboard em bento (mantém 4 stat-cards atuais no topo): seção Ação do dia + Ocupação + Dinheiro + Margem + Pessoas | `index.html`, `css/app.css` | Layout responsivo 375px; tema claro V1.3; skeleton/vazio/erro |
| 3.3 | Heatmap dia×hora (grid CSS, célula colorida pelas `faixas` do backend) + ranking SUR por prof + donut load factor (SVG padrão V1.3) | `js/ui/dashboard.js` | Cores SÓ das faixas recebidas; sem threshold local |
| 3.4 | Widget Dinheiro: curva D+30 (barras SVG simples), acumulados D+7/D+30, custo de taxa por forma | dashboard.js | `centsToBRL` em tudo; nada calculado local |
| 3.5 | Widget Pessoas: donut RFM + lista "quem chamar hoje" com botão WhatsApp one-tap (`waLink` em utils) | dashboard.js, `js/utils.js` | Link abre wa.me com texto correto; disparo manual |
| 3.6 | Ação do dia: montar cards a partir das respostas (buracos hoje, risco, attach, espera) com CTA navegando de aba | dashboard.js | Zero card quando não há dado (sem inventar) |
| 3.7 | Botão atualizar + listener `checkout:closed` refetch | dashboard.js | Fechou comanda → dashboard atualiza |

**Auditoria F3:** QA visual mobile+desktop; conferir que TODA cor/faixa/threshold veio do payload.

## F4 — Camada de ação (2–3 dias)

| # | Tarefa | Arquivos | DoD |
|---:|---|---|---|
| 4.1 | **Split completo (backend):** validador aceita `payments[]` N itens com soma exata = total do preview (422 se divergente); conferir `PaymentEngine`/`allocation.js` ratearem taxa por pagamento (já preparado? auditar antes de codar) | `backend/src/validators/checkout.validator.js`, engines | test:gate + caso novo: 2 pagamentos fecham, taxas por forma corretas, ledger soma |
| 4.2 | **Split completo (frontend):** reescrever fluxo — split UI só habilita APÓS preview; divide `totalRecebidoCentavos` do preview; `buildPayload` monta `payments[]` dos splits; última linha = restante calculado como exibição do valor vindo do preview (nunca digitável); remover flag F0 | `js/ui/checkout.js`, `js/state.js` | Fechar comanda real com 2 formas; RPC grava 2 `comando_pagamentos` + 2 `caixa_movimentos` |
| 4.3 | **Rebooking pós-checkout:** card com sugestão (`/insights/rebooking`) → 1 toque cria agendamento via fluxo/endpoint de agenda existente | checkout.js | Agendamento aparece na agenda; dismissível; nada automático |
| 4.4 | **Waitlist:** rotas GET/POST/PATCH `/lista-espera` + `/candidatos` (backend); UI: botão "+ Lista de espera" na agenda, lista na aba Mais, prompt de candidatos ao cancelar agendamento | routes + validators + `js/ui/agenda.js`, `js/ui/cadastros.js` | Tabela `lista_espera` populada de verdade; candidato recebe wa.me one-tap; status atualiza |
| 4.5 | **Badge reliability na agenda** (fetch lazy no detalhe do agendamento) | agenda.js | Score + fatores visíveis; nenhuma ação bloqueada por score |
| 4.6 | **Attach no checkout:** ao selecionar serviço, sugerir top produto afim (dados de `/insights/attach` cacheados em state) — sugestão, nunca auto-add | checkout.js | Adicionar produto sugerido usa fluxo existente |

**Auditoria F4:** fechar 2 comandas reais controladas (1 split, 1 com rebooking) e conferir ledger linha a linha (padrão da casa).

## F5 — Gate final e deploy (1 dia)

| # | Tarefa | DoD |
|---:|---|---|
| 5.1 | QA manual estruturado (4 suítes: Ocupação/Dashboard, Retenção/one-tap, Checkout split+rebooking, Waitlist) em mobile 375px e desktop | Checklist por fluxo salvo em `docs/QA_V1_4_CHECKLIST.md` |
| 5.2 | Auditoria brutal final: classificar cada entrega REAL/PARCIAL/MOCKADO/HARDCODED/CRÍTICO | Tabela no PR; zero MOCKADO em fluxo crítico |
| 5.3 | `npm run test:gate` completo (58 + novos) | 100% verde |
| 5.4 | Bump service worker; atualizar `CLAUDE.md` (estado V1.4); merge main; push (Pages) + deploy Render se houver mudança backend (há: rotas insights) | Health: GET /health 200, /insights/occupancy 200 em produção; PWA carrega |

## Riscos e armadilhas

| Risco | Mitigação |
|---|---|
| `profissionais.horario` jsonb vazio/formatos mistos na base real | `parseJanela` com fallback 8×slot testado; logar % de profs em fallback na resposta (`meta.fallbackProfs`) |
| Fuso horário (UTC vs America/Sao_Paulo) em "hoje/dias desde" | Centralizar util de data no backend; testes fixam fuso |
| Base pequena distorce quintis RFM | Quintis degenerados testados; mínimo 30 clientes com compra na janela, senão segmentos por regra fixa documentada |
| `allocation.js` pode não ratear taxa por pagamento | Task 4.1 começa por AUDITORIA do engine; se faltar, implementar rateio proporcional com teste antes do frontend |
| Volumetria futura (>50k comandas) | Limite documentado na Spec §1; promover a RPC read-only em fase com migration |
| Score ofender operação (cliente "risco" na tela) | Linguagem neutra na UI ("atenção"), fatores sempre visíveis, doc explícito: shadow mode |
| Cancelamento tardio é aproximação via `updated_at` | Documentado na Spec §2.7; peso baixo (−8) e cap 5 |

## Definition of Done do V1.4 (geral)

```text
✓ test:gate 100% verde (incl. insights)
✓ Nenhum cálculo financeiro/threshold no frontend
✓ Zero migration criada (git diff em supabase/migrations vazio)
✓ Ledger de comanda split conferido linha a linha em produção controlada
✓ Dashboard responde <2s e sobrevive a período sem dados
✓ QA manual 4 suítes assinado
✓ CLAUDE.md atualizado com estado V1.4
```
