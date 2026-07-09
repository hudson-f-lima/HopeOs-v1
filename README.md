# HOPE OS → KortexOS™

Sistema operacional para beauty tech: agenda, comanda (checkout financeiro real), dashboard e cadastros conectados a backend real. **KortexOS™ é o nome canônico do produto** (HOPE OS é o legado interno); a promoção está governada por `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`. Mapa completo da documentação: [`docs/INDEX.md`](docs/INDEX.md). Agentes de IA: ler [`AGENTS.md`](AGENTS.md) antes de qualquer tarefa.

## Estado atual (2026-07-08)

```txt
Backend:  V1.2 cadastros reais + hardening — em produção no Render
Frontend: V1.3 UI/UX premium (tema claro, agenda premium, checkout premium) — em produção no GitHub Pages
Banco:    Supabase (migrations 001–006 aplicadas; projeto qosioymzswhkqkziocas)
Ciclo em andamento: V1.4 "KortexOS Now-Scope: Decision Intelligence" — F0/F1 concluídas; próximo passo: F2 Retenção Backend
Branch de trabalho: codex/v1.4-dashboard-premium
PWA cache atual: hope-os-shell-v1-4-0
Testes: cd backend && npm run test:gate → 63/63 verdes
```

URLs:

```txt
Frontend:       https://hudson-f-lima.github.io/HopeOs-v1/
Backend health: https://hopeos-v1.onrender.com/api/health
```

## Como continuar este projeto (qualquer plataforma de IA ou humano)

Leia NESTA ORDEM antes de escrever qualquer código:

```txt
1. AGENTS.md                                                  → manifesto para agentes de IA (leia primeiro)
2. CLAUDE.md                                                  → regras invioláveis, estado confirmado, gates proibidos
   (vale para qualquer IA, não só Claude — é o contrato do projeto)
3. docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md → visão canônica, domínios, bloqueios, ordem de construção
4. docs/KORTEXOS_NOW_SCOPE_V1_4_MASTER_BRIEFING.md            → escopo do ciclo atual (V1.4), KPIs, governança
5. docs/KORTEXOS_NOW_SCOPE_V1_4_SPEC.md                       → fórmulas determinísticas + contratos de API do V1.4
6. docs/KORTEXOS_V1_4_SESSION_HANDOFF_F2_READY.md             → handoff operacional: F1 verde, retomar pela F2
7. docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md                → tarefas F0–F5 com DoD — RETOME DAQUI (próxima tarefa: F2.1)
```

Mapa completo de documentação (incl. Truth Map, Migration Map, Blueprint 5.1, SQL Planning/Draft, Red Team): [`docs/INDEX.md`](docs/INDEX.md).

Base canônica de pesquisa (passos 3–4 da ordem de construção, concluídos):

```txt
docs/canon/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md   → benchmark global (beauty tech, aviação, hotelaria, Uber, fintech)
docs/canon/KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md   → HERDAR/REFORÇAR/BLOQUEAR/ADIAR por módulo + escopo zero-migration
```

Regras-mãe que NENHUMA plataforma pode violar:

```txt
Backend é a verdade única — frontend não calcula financeiro/margem/taxa/comissão/estoque
V1.4 é ZERO MIGRATION — nenhuma tabela, coluna ou RPC nova no Supabase
Auditoria brutal sempre — classificar REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO
Uma prioridade por vez; básico antes do sofisticado
Gates proibidos sem decisão explícita do dono: IA, marketplace, app do cliente,
multiunidade, assinatura vendida, CRM avançado, gamificação, marketing automático
```

## Débito conhecido (CRÍTICO)

```txt
Split de pagamento foi mergeado INCOMPLETO no V1.3: a UI renderiza toggle/linhas,
mas buildPayload() envia pagamento único e a validação usa só a gorjeta.
Plano registrado: F0 esconde a UI (flag), F4 completa a integração
(a RPC checkout_close já grava N pagamentos — o banco está pronto).
```

## Arquitetura

```txt
Frontend: PWA modular — index.html + css/app.css + js/ (state, api, utils, ui/agenda|checkout|dashboard|cadastros)
Backend:  Node + Express — backend/src (routes, validators, services, engines, repositories)
Banco:    Supabase/Postgres — supabase/migrations/001–006; ledger financeiro DISTRIBUÍDO por design
          (comandos, comando_itens, comando_pagamentos, comando_gorjetas, caixa_movimentos,
           produto_estoque_movimentos) — NUNCA criar tabela única financial_ledger
```

## Regras de segurança

```txt
Não commitar .env
Não expor tokens nem service_role ao frontend
Não rodar migration sem autorização
Não alterar Supabase sem autorização explícita
Não mudar regra financeira pelo frontend
```

## Comandos úteis

Backend:

```bash
cd backend
npm install
npm run test:gate   # 63 testes — obrigatório verde antes de qualquer merge
npm start
```

Frontend local (preview):

```bash
npx --yes serve . -l 5500
```

## Seleção de modelo de IA (Claude Code)

Cada fase de desenvolvimento recomenda um modelo específico baseado em custo-benefício:

| Fase | Modelo | Por quê | Quando |
|------|--------|---------|--------|
| **F0** (saneamento) | Haiku 4.5 | Fixes pontuais, testes rápidos | Correção de bugs/hotfix |
| **F1** (insights) | Haiku 4.5 | Funções puras + rotas simples | Specs já detalhadas, sem ambiguidade |
| **F2** (retenção) | Haiku 4.5 | Engines puras, RFM/churn determinístico | Backend-only, matemática clara |
| **F3** (dashboard) | Haiku 4.5 | Iteração UI/UX rápida no preview | Muitas rodadas de ajuste, custo importa |
| **F4** (ação final) | Haiku 4.5→Sonnet 5 | Integração múltiplos sistemas, edge cases | Split payment + rebooking + waitlist |
| **F5** (QA + auditoria) | Sonnet 5 | Revisão multi-dimensional antes de produção | QA final, confiança crítica |

### Como trocar de modelo

**Em sessão interativa Claude Code:**
```bash
/model haiku        # Claude Haiku 4.5 (mais econômico)
/model sonnet       # Claude Sonnet 5 (mais capaz)
```

**Nota:** Não há automação de troca de modelo. Você muda manualmente via `/model` conforme a fase. Isso é por design — cada fase tem requisitos distintos, e a decisão deve ser consciente.

**Custo estimado V1.4 completo:** ~R$ 100–150 em créditos de API (F0–F5), usando Haiku para F2–F4 e Sonnet para F5.

## Deploy e cache

Depois de alterar frontend:

```txt
1. Atualizar CACHE_NAME em service-worker.js (e frontend/service-worker.js se existir)
2. Push para main → GitHub Pages publica
3. Validar HTTP 200 e, se o navegador mostrar tela antiga, Ctrl+F5 ou ?refresh=1
```

Backend: push para main → Render redeploy. Validar `GET /api/health` = 200.

## Documentos principais

```txt
AGENTS.md                                            → manifesto para agentes de IA
CLAUDE.md                                            → contrato do projeto (qualquer IA)
docs/INDEX.md                                        → mapa completo da documentação (autoridade, ordem de leitura)
docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md → fonte canônica do produto
docs/canon/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md      → benchmark global (passo 3 ✓)
docs/canon/KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md      → proposta comparativa (passo 4 ✓)
docs/canon/KORTEXOS_5_1_TRUTH_MAP.md                 → maturidade real (status documental × implementado)
docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md          → fundação real 001–006 + faixa futura 007–023
docs/KORTEXOS_NOW_SCOPE_V1_4_MASTER_BRIEFING.md      → ciclo atual V1.4
docs/KORTEXOS_NOW_SCOPE_V1_4_SPEC.md                 → spec técnica V1.4
docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md          → execução F0–F5
docs/KORTEXOS_V1_4_SESSION_HANDOFF_F2_READY.md        → retomada operacional da F2
docs/SPEC_V1_3_AGENDA_CHECKOUT_PREMIUM.md            → spec do V1.3 (entregue)
docs/HOPE_OS_V1_3_FRONTEND_UI_UX_PREMIUM_BLUEPRINT.md
docs/HOPE_OS_V1_2_BACKEND_CADASTROS_REAIS_BLUEPRINT.md
docs/API_CONTRACT.md / docs/DATA_CONTRACT.md
docs/archive/legacy-v1/
```

## Última validação conhecida

```txt
GitHub Pages: HTTP 200 (V1.3 + F0 cache V1.4)
service-worker.js: hope-os-shell-v1-4-0
Backend /api/health: HTTP 200
test:gate: 63/63 verdes
```
