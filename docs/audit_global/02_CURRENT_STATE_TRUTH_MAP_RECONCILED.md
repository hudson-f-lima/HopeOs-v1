# 02 — CURRENT STATE TRUTH MAP RECONCILIADO — HOPE OS V1.4 / KortexOS

**Data:** 2026-07-10
**Objetivo:** Mapa único e reconciliado de "quem é fonte da verdade de quê", após auditoria global (frontend, backend, SQL, docs, segurança, escala). Classificações: REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO / BLOQUEADO — mais status documental CANÔNICO / REFERÊNCIA / LEGADO / OBSOLETO.
**Regra:** este mapa descreve o ESTADO REAL ATUAL. Visão futura aparece apenas na seção 6, explicitamente separada.

---

## 1. CANÔNICO (fontes da verdade vigentes)

| Arquivo | Tipo | Função | Status | Fonte da verdade? | Atualizado? | Conflito? | Ação |
|---|---|---|---|---|---|---|---|
| `CLAUDE.md` | contrato operacional | estado V1.x + regras invioláveis | REAL (claim "21 testes waitlist" é PARCIAL — sem lastro; realidade 73/73 no gate) | SIM (operacional) | SIM (2026-07-10) | Contradiz README/AGENTS sobre validação do hotfix — **ele é o correto** (commit `95eddb3`) | Manter canônico; corrigir claim dos 21 testes |
| `AGENTS.md` | manifesto agentes | regras de operação p/ IA | PARCIAL | SIM | **NÃO** — status "EM VALIDAÇÃO" stale (D1); path do backend errado: diz `server/`, real é `backend/src/` (D6) | D1, D6 | Corrigir status e path no mesmo commit |
| `docs/INDEX.md` | mapa de autoridade | hierarquia documental | REAL (meta) | SIM (meta) | Parcial (datado 2026-07-09, não reflete hotfix — D9) | Lista API/DATA_CONTRACT como ativos (D4/D5) — falso | Atualizar §2 (rebaixar contratos V1.0.3) e data |
| `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md` | visão estratégica 5.1 | fonte única do produto KortexOS | REAL (documental — **VISÃO FUTURA**, não estado do código) | SIM (estratégico) | SIM | Não | Manter |
| `docs/canon/KORTEXOS_5_1_{BENCHMARK,COMPARATIVE,TRUTH_MAP}.md` | pesquisa/seleção | apoio à visão 5.1 | REAL (status honesto "GERADO / AGUARDA RED TEAM") | Apoio | SIM | Não | Manter (corretamente auto-declarados não-aprovados) |
| `docs/redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md` | auditoria | achados A01–A14 | REAL | SIM (para correções) | SIM | Não | Canônico de auditoria |
| `supabase/migrations/001–006_*.sql` | schema/RPCs | fundação física | REAL (ressalvas: 002 sem REVOKE — fechado pela 003; 003 duplica corpo da 002 = PARCIAL; DELETE no ledger = CRÍTICO estrutural; `checkout_close` sem revalidação financeira interna = CRÍTICO) | SIM (banco) | SIM (únicas migrations existentes) | Cópia divergente 001–005 em `_ai_index/` | Manter; matar a cópia paralela |
| `MANIFEST_SHA256.txt` | integridade deploy | hashes do shell | REAL — 14/14 hashes conferidos, regenerado no hotfix P0 | SIM (deploy) | SIM (2026-07-10) | Não | Manter |
| `docs/audit_global/01_AUDITORIA_GLOBAL_ESCALA_KORTEXOS.md` | auditoria consolidada | estado real 2026-07-10 | REAL | SIM (auditoria global) | SIM | Não | Novo — canônico de auditoria global |

## 2. REFERÊNCIA (úteis, não mandam)

| Arquivo | Tipo | Função | Status | Fonte da verdade? | Atualizado? | Conflito? | Ação |
|---|---|---|---|---|---|---|---|
| `README.md` | entrada do repo | onboarding | PARCIAL | Não (aponta p/ canon) | **NÃO** — status "EM VALIDAÇÃO" stale (D1); contradição interna 76/134 vs 73 testes (D2) | D1, D2 | Corrigir status e unificar em 73/73 |
| `docs/KORTEXOS_NOW_SCOPE_V1_4_{MASTER_BRIEFING,SPEC,DEV_HANDOFF}.md` | ciclo V1.4 | escopo/spec/execução | REAL | Sim durante o ciclo (encerrado) | SIM (2026-07-08) | Não | Candidatos a legacy no fechamento formal |
| `docs/KORTEXOS_V1_4_SESSION_HANDOFF_COMPLETE.md` | handoff | registro do ciclo | PARCIAL | Não | **NÃO** — status stale (D1); "76/76" (D2); cita `walkthrough.md` inexistente (D8) | D1, D2, D8 | Corrigir status e referências |
| `docs/QA_V1_4_CHECKLIST.md` | QA manual | validação F5 | PARCIAL — checkboxes todos vazios apesar de F5 "concluída" (D7) | Não | NÃO | D7 | Preencher com o smoke test real ou arquivar com registro |
| `docs/architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md` | arquitetura 5.1 | suporte à visão (**FUTURO**) | REAL (documental) | Não (não autoriza SQL) | SIM | Não | Manter |
| `docs/HOPE_OS_V1_2_BACKEND_CADASTROS_REAIS_BLUEPRINT.md` | blueprint V1.2 | histórico de ciclo entregue | REAL/entregue | Não | SIM | Duplicata **divergente** em `_ai_index/` | Manter; marcar a duplicata como LEGADO |
| `docs/HOPE_OS_V1_3_*` e `docs/{PLAN,SPEC,FRONTEND}_V1_3_*` | ciclo V1.3 | histórico entregue | REAL | Não | SIM | Não | Manter |
| `docs/QA/backends tests (test:gate)` — `backend/tests/*` (6 suítes) | testes | gates automatizados | REAL — 73/73 verdes | SIM (qualidade backend) | SIM | Contradiz "76/134" e "21 testes waitlist" dos docs | Fonte da verdade numérica de testes |
| `_ai_inbox/*.xlsx` | dados de import | seed AppBarber | REFERÊNCIA sem índice | Não | n/a | Não listado no INDEX | Documentar no INDEX ou arquivar |
| `config.json` (raiz) | config PWA | `apiBase` prod | REAL/HARDCODED por design | Sim (endpoint do frontend) | SIM | Não | Manter |

## 3. LEGADO (histórico; não usar como verdade)

| Arquivo | Tipo | Função | Status | Fonte da verdade? | Atualizado? | Conflito? | Ação |
|---|---|---|---|---|---|---|---|
| `docs/legacy/*` (SMART_FLOW 4.0, V1.0.3 hotfix, V1.1 audit, prompt V1.2) | histórico | design reference | LEGADO **corretamente marcado** | Não | n/a | Não | OK — manter |
| `_ai_index/*` (AGENTS alternativo, `Claude_V1_2.md`, blueprint V1.2 divergente, snapshot repo V1.1 inteiro, migrations 001–005 desatualizadas) | contextos IA antigos | superados por CLAUDE.md/AGENTS.md | **LEGADO NÃO MARCADO** — viola INDEX §7 (proibição de docs paralelos) | Não | NÃO | Duplicação divergente ativa (blueprint V1.2 difere byte a byte; migrations poluem buscas de agentes) | Mover para `docs/archive/` com registro no Correction Plan |
| `frontend/` exceto `frontend/service-worker.js` (`api-client.js`, `index.local-prototype.html`, `hope_os_salao_V10_evolution_lab.html`, `manifest.json` duplicado) | protótipos | nenhum (app publicado serve da raiz) | LEGADO/MORTO | Não | NÃO | Não | Arquivar ou deletar; decidir se elimina o espelho do SW (manter um só) |
| `docs/DATA_CONTRACT.md` | contrato `/data` V1.0.3 | seed antigo | LEGADO de fato, **não marcado** (D5) | Não | NÃO | INDEX o lista como ativo | Marcar LEGADO |

## 4. OBSOLETO (mortos; remover/arquivar)

| Arquivo | Tipo | Função | Status | Fonte da verdade? | Atualizado? | Conflito? | Ação |
|---|---|---|---|---|---|---|---|
| `docs/API_CONTRACT.md` | contrato API V1.0.3 | 55 linhas, só checkout (~10% da superfície atual: zero `/insights/*`, `/lista-espera`, `/clientes`, `/produtos`, split) | **OBSOLETO NÃO MARCADO — CRÍTICO para agentes** (D4) | Não pode ser | NÃO | INDEX §2 o vende como ativo | Reescrever cobrindo a API real ou marcar LEGADO já |
| `index.pre-merge-v1.1.backup.html` (raiz) | backup HTML | nenhuma | OBSOLETO — exposto publicamente na raiz do GitHub Pages; viola regra anti-copy (INDEX §7) | Não | NÃO | Sim (regra) | Remover da raiz / arquivar |
| `docs/archive/*` | histórico morto | backups | OBSOLETO **corretamente marcado** | Não | n/a | Não | OK |
| Referência a `walkthrough.md` (no Handoff) | referência | — | OBSOLETO/quebrada (arquivo não existe — D8) | — | — | D8 | Remover a referência |

## 5. BLOQUEADO (planejado; proibido implementar sem decisão explícita)

| Item | Tipo | Status | Conflito? | Ação |
|---|---|---|---|---|
| `docs/planning/*` (KORTEXOS_5_1_MIGRATION_MAP, SQL Planning, SQL Draft 007–023, CADASTROS_DEEPENING_PLAN_V1_5) | planejamento faixa 007+ | BLOQUEADO — corretamente marcado DRAFT ONLY; **nenhum `.sql` 007+ existe fisicamente** (verificado) | Não | Manter bloqueado até decisão do usuário |
| Faixa SQL 046–060 | numeração antiga | OBSOLETA — sem arquivos físicos, menções só em docs históricos | Não (sem conflito real no diretório) | Nada a fazer |
| Multiunidade/franquia (`unidade_id`, hierarquia) | modelagem | BLOQUEADO/inexistente no schema | Não | Só a *decisão de modelagem* deve nascer agora (visão futura) |
| Gates proibidos do CLAUDE.md (IA, marketplace, app do cliente, multiunidade, assinatura, CRM avançado, gamificação, marketing automático) | escopo | BLOQUEADO | Não | Manter |

---

## 6. Reconciliação código × docs (verdades e mentiras verificadas)

### 6.1 Afirmações VERDADEIRAS (sem drift)
- Migrations 001–006 existem e são as únicas; nenhum `.sql` fora de `supabase/migrations/`. REAL.
- SWs raiz e `frontend/` idênticos, ambos `hope-os-shell-v1-4-3`. REAL.
- 4 renderers do Dashboard existem e exibem só dados do backend; hotfix P0 validado (commit `95eddb3`). REAL.
- Rotas `/lista-espera` e `/insights/retention` existem. REAL.
- Split payment: **REAL e completo** (débito CRÍTICO do V1.3 quitado — docs que ainda o citam como pendente estão superados pelo código).
- `service_role` não exposto ao frontend. REAL.
- V1.4 "ZERO migration" cumprido; insights read-only confirmado. REAL.
- `frontendCalculates: false` cumprido — nenhuma violação da regra-mãe no frontend. REAL.

### 6.2 Afirmações FALSAS/ENGANOSAS (o código é a verdade)
| Afirmação em doc | Realidade | Veredito |
|---|---|---|
| "HOTFIX P0 EM VALIDAÇÃO" (README/AGENTS/Handoff) | Validado em produção 2026-07-10 | DESATUALIZADO |
| "76 testes / 134 checks" e "76/76" | 73/73 no `test:gate` | HARDCODED sem lastro |
| "Waitlist: 21 testes" | Sem suíte dedicada; cobertura dentro do cadastros-gate | PARCIAL |
| API_CONTRACT/DATA_CONTRACT "ativos" (INDEX) | V1.0.3, ~10% da API real | OBSOLETO não marcado |
| Backend em `server/` (AGENTS) | `backend/src/` | HARDCODED errado |
| "RLS e permissões travadas: REAL" lida como postura de segurança | Verdadeira no SQL, mas API sem auth anula a barreira | ENGANOSA (CRÍTICO) |

### 6.3 Estado real × visão futura (fronteira explícita)
- **ESTADO REAL:** monolito E0 — 1 tenant hardcoded, sem auth, insights em Node, ledger REAL, schema multi-tenant pronto, PWA REAL em produção.
- **VISÃO FUTURA (docs canon/architecture/planning):** KortexOS 5.1, migrations 007+, multiunidade, outbox/eventos, estágios E1–E3, matriz pool/silo — **nada disso existe em código**; qualquer doc que descreva esses itens descreve intenção, não sistema.

---

## 7. Ações de reconciliação prioritárias (documentais)

1. Corrigir status do hotfix em README.md, AGENTS.md e Session Handoff (mesmo commit — regra INDEX §9.4).
2. Unificar contagem de testes em **73/73** em todos os docs; remover "21 testes waitlist" ou criar a suíte.
3. Marcar `API_CONTRACT.md` e `DATA_CONTRACT.md` como LEGADO no INDEX (ou reescrever o primeiro cobrindo a API real).
4. Corrigir path do backend no AGENTS.md (`backend/src/`).
5. Arquivar `_ai_index/` inteiro em `docs/archive/` com registro; remover `index.pre-merge-v1.1.backup.html` da raiz publicável; limpar `frontend/` legado.
6. Preencher `QA_V1_4_CHECKLIST.md` com o smoke test executado ou arquivá-lo com nota.
7. Atualizar `docs/INDEX.md` (data, §2, mapeamento de `_ai_index/`/`_ai_inbox/`).
