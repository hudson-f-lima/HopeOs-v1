# HOPE OS — Contexto do projeto (V1.3 em produção; V1.4 em andamento)

KortexOS™ é o nome canônico do produto (HOPE OS vira legado interno) — fonte única: `KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md` na raiz.

## Stack

Backend Node.js + Express + Supabase/Postgres. Frontend é uma PWA em HTML único (`index.html` na raiz) publicada no GitHub Pages e conectada ao backend real via `/api/*`. Backend hospedado no Render e banco no Supabase.

## Regra-mãe

Backend é a verdade única.

O frontend não calcula financeiro, comissão, margem, taxa, repasse, baixa de estoque ou preço final confiável. O frontend apenas coleta intenção, chama API e exibe resposta do backend.

## Regras invioláveis

- Auditoria brutal sempre: classificar REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO.
- Uma prioridade por vez.
- Básico antes do sofisticado.
- Nenhuma tabela nova sem migration versionada em `supabase/migrations/`.
- `service_role` nunca exposto ao frontend.
- Ledger financeiro é distribuído por design: `comandos`, `comando_itens`, `comando_pagamentos`, `comando_gorjetas`, `caixa_movimentos`, `produto_estoque_movimentos`.
- Não existe e não deve existir uma tabela única `financial_ledger`.
- Estoque não pode ser alterado diretamente pelo frontend.
- Produto vendido abaixo do custo deve ser bloqueado.
- Masters operacionais devem ser desativados com `ativo=false`, não deletados fisicamente.
- Não criar IA, marketplace, multiunidade, assinatura recorrente ou CRM avançado antes de cadastros reais estáveis. Dashboard sofisticado passou a ser exceção autorizada em 2026-07-07 (ver seção V1.3).

## Estado atual confirmado

### Backend

- Node + Express + Supabase service role no backend: REAL.
- Supabase/Postgres com migrations versionadas (001-006 aplicadas e validadas no projeto real `qosioymzswhkqkziocas`): REAL.
- RLS e permissões travadas para RPC `checkout_close`: REAL.
- Checkout preview/close no backend: REAL — validado com fechamento real controlado em produção (ledger distribuído conferido linha a linha).
- Baixa de estoque no checkout via RPC: REAL.
- Ledger financeiro distribuído: REAL.
- Cadastros reais (clientes, serviços, profissionais, produtos, formas de pagamento, vínculo serviço×profissional, overrides): REAL — endpoints, validações e RPCs atômicas implementados e em produção (ver seção Cadastros).
- Hardening pós-auditoria aplicado: `overrides` bloqueado no POST/PATCH genérico de profissionais (só endpoint dedicado), `POST /formas-pagamento` não faz upsert silencioso (409 em duplicado), `CommissionEngine` bloqueia comissão fora de 0-100%, CHECK no banco para produto ativo não vender abaixo do custo, override de profissional via RPC atômica (`jsonb_set`, sem read-modify-write em Node), validação de UUID em params/listas, RPC de produto revalida `comissao_pct`/`modelo_comissao` internamente, erros de negócio da RPC (`P0001`) mapeados para HTTP 422, `POST/PATCH /clientes` validados (antes era passthrough cru).
- `SupabaseRepository.list()` pagina além de 1000 linhas (limite padrão do PostgREST) — sem isso, tabelas grandes (`clientes` já passou de 1000 registros reais) perdiam linhas silenciosamente em toda leitura (snapshot, export, `GET /catalog`).
- Testes: `npm run test:gate` — 58/58 verdes (Finance 10 + Product Foundation 8 + Schema Polymorphic 12 + RPC Permission 8 + Cadastros Reais 20).

### Frontend

- PWA publicada no GitHub Pages consumindo o backend real via `/api/*`. Desde o V1.3 é modular: `index.html` + `css/app.css` + módulos ES6 em `js/` (state, api, utils, ui/*).
- Estrutura de abas: Agenda, Checkout, Dashboard, Mais.
- Aba **Mais**: UI de Cadastros Reais implementada — CRUD de clientes, serviços, profissionais (+ vínculo com serviços + overrides por serviço), produtos (+ ajuste de estoque), formas de pagamento. Desativação sempre via `ativo=false`, nunca delete físico.
- Checkout: preview reorganizado em blocos Bruto → Deduções → Resultado (mesmos campos que a API já retornava; nenhum cálculo novo no frontend).
- Service worker: cache do shell HTML corrigido para network-first (antes usava stale-while-revalidate e podia servir HTML desatualizado por um reload inteiro). `/api/*` e métodos não-GET nunca são cacheados. Versão de cache atual: `hope-os-shell-v1-3-11`.
- `frontendCalculates: false` continua sendo a regra vigente — frontend só coleta intenção, chama API e exibe a resposta.

### Cadastros

- Clientes: REAL — `GET/POST /clientes`, `PATCH /clientes/:id` (payload validado, campos perigosos bloqueados), UI de cadastro na aba Mais.
- Serviços: REAL — `GET/POST /servicos`, `PATCH /servicos/:id`, UI de cadastro na aba Mais.
- Profissionais: REAL — `GET/POST /profissionais`, `PATCH /profissionais/:id`, UI de cadastro na aba Mais. `overrides` só via endpoint dedicado (bloqueado no POST/PATCH genérico).
- Produtos: REAL — `GET/POST /produtos`, `PATCH /produtos/:id`, ajuste de estoque via `POST /produtos/:id/estoque/ajuste` (RPC atômica, bloqueia saldo negativo), UI de cadastro + ajuste de estoque na aba Mais.
- Formas de pagamento: REAL — `GET/POST /formas-pagamento`, `PATCH /formas-pagamento/:code` (POST duplicado retorna 409, não sobrescreve), UI de cadastro na aba Mais.
- Serviço x profissional: REAL — `GET/PUT /profissionais/:id/servicos` (RPC atômica), UI de vínculo (checklist) na aba Mais.
- Overrides por profissional: REAL — `PATCH /profissionais/:id/servicos/:servicoId/override` (RPC atômica com `jsonb_set`, sem read-modify-write), checkout já lê e aplica os overrides, UI de personalização por serviço na aba Mais.

## V1.3 — Frontend UI/UX Premium (CONCLUÍDO — merged em main, 2026-07-08)

Entregue: tema claro + design system CSS (variáveis + utilities), Agenda Premium (ocupação por day pill com cores, info bar com donut SVG, timeline com avatares), Checkout Premium (abas serviços/produtos, tip stepper), refactor modular (`css/`, `js/`). Docs: `docs/HOPE_OS_V1_3_FRONTEND_UI_UX_PREMIUM_BLUEPRINT.md`, `docs/FRONTEND_V1_3_UI_UX_AUDIT.md`, `docs/PLAN_V1_3_TASKS.md`, `docs/SPEC_V1_3_AGENDA_CHECKOUT_PREMIUM.md`.

**Débito conhecido (CRÍTICO):** split de pagamento foi mergeado INCOMPLETO — a UI renderiza toggle/linhas, mas `buildPayload()` continua enviando pagamento único e `validateSplitPayment()` valida só contra a gorjeta. Plano: esconder na F0 do V1.4 e completar na F4 (a RPC `checkout_close` já grava N pagamentos).

Pendências herdadas: frontend segue sem testes (`test:gate` é 100% backend — QA manual obrigatório); lista de Clientes (1481+) sem paginação/busca na UI.

## V1.4 — KortexOS Now-Scope: Decision Intelligence (em andamento)

Autorizado em 2026-07-08. Branch: `codex/v1.4-dashboard-premium`. Passos canônicos 3–4 do Master Briefing 5.1 concluídos (benchmark global + comparative proposal).

**Regra-mãe do V1.4: ZERO migration.** Nenhuma tabela/coluna/RPC nova. Toda inteligência nova é derivada read-only do ledger existente; agregação em Node (services); thresholds/faixas definidos no backend e enviados na resposta; frontend só exibe. Únicas escritas novas: CRUD de `lista_espera` (tabela existente e ociosa) e rebooking via POST /agenda existente.

Escopo (fases F0–F5, ~10 dias): F0 saneamento (esconder split quebrado) → F1 insights núcleo (`/insights/occupancy|margin|cashflow`) → F2 retenção (RFM, churn-risk, Reliability Score v0 shadow, attach) → F3 Dashboard bento ("Ação do dia", heatmap, caixa D+30, "quem chamar hoje") → F4 ação (rebooking pós-checkout, split completo, waitlist, WhatsApp one-tap manual via `wa.me`) → F5 QA + auditoria + deploy.

Docs do ciclo: `docs/KORTEXOS_NOW_SCOPE_V1_4_MASTER_BRIEFING.md` (escopo/KPIs), `docs/KORTEXOS_NOW_SCOPE_V1_4_SPEC.md` (fórmulas/contratos de API), `docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md` (tarefas/DoD/riscos), `docs/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md` e `docs/KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md` (base canônica).

Limites do V1.4: score NUNCA bloqueia/cobra (shadow); WhatsApp sempre manual um-a-um (não é marketing automático); assinatura só como analytics de candidatos (vender plano sem ledger/wallet = saldo paralelo = bloqueado).

## Próximo gate proibido

Não avançar para, sem decisão explícita do usuário:

- IA;
- marketplace;
- app do cliente;
- multiunidade;
- assinatura recorrente;
- CRM avançado;
- gamificação;
- marketing automático.

("dashboards sofisticados" foi removido desta lista — ver decisão do V1.3 acima.)
