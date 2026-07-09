# HOPE OS — Contexto do projeto (V1.3 em produção; V1.4 em andamento)

KortexOS™ é o nome canônico do produto (HOPE OS vira legado interno) — fonte única: `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`. Mapa de autoridade documental: `docs/INDEX.md`. Manifesto para agentes de IA: `AGENTS.md` (raiz). Fundação física: migrations 001–006 reais; SQL futuro 007+ planejado e BLOQUEADO; faixa 046–060 obsoleta.

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
- Testes: `npm run test:gate` — 73/73 verdes (58 antigos + 15 checks de Insights V1.4).

### Frontend

- PWA publicada no GitHub Pages consumindo o backend real via `/api/*`. Desde o V1.3 é modular: `index.html` + `css/app.css` + módulos ES6 em `js/` (state, api, utils, ui/*).
- Estrutura de abas: Agenda, Checkout, Dashboard, Mais.
- Aba **Mais**: UI de Cadastros Reais implementada — CRUD de clientes, serviços, profissionais (+ vínculo com serviços + overrides por serviço), produtos (+ ajuste de estoque), formas de pagamento. Desativação sempre via `ativo=false`, nunca delete físico.
- Checkout: preview reorganizado em blocos Bruto → Deduções → Resultado (mesmos campos que a API já retornava; nenhum cálculo novo no frontend).
- Service worker: cache do shell HTML corrigido para network-first (antes usava stale-while-revalidate e podia servir HTML desatualizado por um reload inteiro). `/api/*` e métodos não-GET nunca são cacheados. Versão de cache atual: `hope-os-shell-v1-4-1`.
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

Autorizado em 2026-07-08. Desenvolvido na branch `codex/v1.4-f4-acao` (F4) e `codex/v1.4-dashboard-premium` (F0-F3); F0–F3 mergeados em `main` via PR [#11](https://github.com/hudson-f-lima/HopeOs-v1/pull/11) em 2026-07-09 (merge commit `324bc5c`). Status:

| Fase | Nome | Status | Commits |
|------|------|--------|---------|
| F0 | Saneamento (esconder split) | ✅ CONCLUÍDA — em main | bae1923 |
| F1 | Insights backend (occupancy, cashflow, margin) | ✅ CONCLUÍDA — em main | fb2478b |
| F2 | Retenção backend (RFM, churn-risk, Reliability Score) | ✅ CONCLUÍDA — em main | 2df93b3 |
| F3 | Dashboard bento (frontend) | ✅ CONCLUÍDA — em main | 57b4a2c |
| F4 | Ação (rebooking, split, waitlist, WhatsApp one-tap) | ✅ CONCLUÍDA — em main | ae95cf5 |
| F5 | QA + auditoria + deploy | ✅ CONCLUÍDA — em main | c07a834 |

**Regra-mãe do V1.4: ZERO migration.** Nenhuma tabela/coluna/RPC nova. Toda inteligência derivada read-only do ledger; agregação em Node; frontend só exibe.

**Estado V1.4 (Ciclo Concluído & Publicado):**
- ✅ Split Payment completo (frontend + backend): 2 novos testes no finance-gate, reescrita de UI no `checkout.js`, cálculo automático e validação client-side.
- ✅ Rebooking pós-checkout: card sugestão de rebooking de 1 clique, integração com agenda.
- ✅ Lista de Espera (Waitlist): backend completo (rotas + validadores + 21 testes) e UI frontend (subaba "Espera" em gestão, modal de cadastro e prompt ao cancelar agendamento).
- ✅ Badge de Reliability na agenda: fetch lazy do score do cliente e tooltip explicativo.
- ✅ Attach de produto no checkout: sugestão inteligente baseada nos dados do backend.
- ✅ Dashboard Progressive Rendering: widgets de insight agora carregam de forma assíncrona independente, sem travar por Promise.all.
- ✅ Todos os testes verdes: `npm run test:gate` passa localmente.
- ✅ Deploys em produção (Render + GitHub Pages) ativados e validados ativamente via testes de rede.

**Docs do ciclo:** `docs/KORTEXOS_NOW_SCOPE_V1_4_MASTER_BRIEFING.md`, `docs/KORTEXOS_NOW_SCOPE_V1_4_SPEC.md` (fórmulas + contratos), `docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md` (tarefas F0–F5 com DoD), `docs/QA_V1_4_CHECKLIST.md`.

## Seleção de Modelo de IA por Fase (V1.4 e além)

**Por quê:** Cada fase tem requisitos distintos de custo, iteração e confiança. Usar o modelo certo economiza ~50% de budget sem comprometer qualidade.

| Fase | Modelo recomendado | Justificativa | Custo estimado |
|------|-------------------|---------------|-----------------|
| **F0** (hotfix/saneamento) | Haiku 4.5 | Fixes pontuais, testes simples, sem ambiguidade | R$ 5–10 |
| **F1** (insights: ocupação/caixa) | Haiku 4.5 | Funções puras + agregação em Node; matemática clara | R$ 15–20 |
| **F2** (retenção: RFM/churn) | Haiku 4.5 | Engines determinísticas + fórmulas já na spec | R$ 15–20 |
| **F3** (dashboard frontend) | Haiku 4.5 | Iteração UI/UX rápida; muitas rodadas de ajuste | R$ 15–20 |
| **F4** (ação: rebooking/split) | Haiku 4.5→Sonnet 5 | Integração múltiplos sistemas; uma revisão final com Sonnet | R$ 25–35 |
| **F5** (QA + auditoria final) | Sonnet 5 | Revisão multi-dimensional, confiança crítica antes de produção | R$ 20–30 |

**Total V1.4 estimado:** ~R$ 100–150 em créditos de API.

**Como trocar em Claude Code (interativo):**
```bash
/model haiku       # Haiku 4.5 (default econômico)
/model sonnet      # Sonnet 5 (max capacidade)
```

**Automação:** Não há. A troca é manual (consciente) porque a decisão varia conforme contexto — urgência, complexidade, budget disponível. Documentar a recomendação por fase (tabela acima) permite decisão informada em cada sessão, sem overhead de automação.

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
