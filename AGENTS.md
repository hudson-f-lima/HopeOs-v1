# AGENTS.md

Manifesto para agentes de IA (Fable, Claude, Codex, Cursor, ChatGPT e similares). Leia isto ANTES de qualquer tarefa neste repositório.

## Project State

- Produto em produção: HOPE OS V1.3 (PWA + backend Node/Express + Supabase). V1.4 em andamento (branch `codex/v1.4-dashboard-premium`), regra-mãe: **zero migration**.
- Promoção estratégica em curso: HOPE OS → **KortexOS™ 5.1** (fase documental; implementação bloqueada).
- Contexto operacional detalhado do V1.x: `CLAUDE.md` (raiz).

## Documentation Authority

Mapa completo: `docs/INDEX.md`. Hierarquia: Master Briefing 5.1 (`docs/canon/`) > Benchmark > Comparative Proposal > Truth Map > Migration Map > Blueprint > SQL Planning > SQL Draft. Em conflito: reportar o conflito, nunca resolver por suposição silenciosa.

## Forbidden Actions

- Criar SQL executável ou arquivo `.sql` sem autorização explícita do Platform Owner.
- Tocar em `supabase/` (migrations 001–006 são intocáveis; banco real bloqueado).
- Assumir a sequência 001–045 do SMART_FLOW 4.0 como física (é design reference em `docs/legacy/`).
- Usar a faixa 046–060 (obsoleta).
- Criar documentos paralelos: `*_REVISED`, `*-1`, `*(1)`, `*copy`, `*final`, patch/delta/adendo.
- Declarar documento "aprovado" sem Red Team real registrado.
- Calcular regra crítica (preço, comissão, saldo, estoque) no frontend.
- IA executando ação soberana sobre dinheiro, agenda, score ou ledger.
- Deletar documento sem registro no Correction Plan vigente.
- Comprimir, resumir ou sobrescrever documentos de auditoria, prompts históricos de Red Team,
  evidência de decisão do Owner ou legado sem preservar o conteúdo original — mesmo sob
  justificativa de economia de tokens ("nanotoken" ou similar). Esses documentos podem ser
  movidos para `legacy/`/`archive/`, nunca reduzidos, salvo autorização explícita e registrada
  do Platform Owner. Compressão é permitida apenas em documentação operacional ativa
  (README, INDEX, specs correntes) desde que preserve o estado real e nenhum guardrail crítico.

## Allowed Actions

- Ler tudo; auditar; classificar (REAL/PARCIAL/MOCKADO/HARDCODED/CRÍTICO/BLOQUEADO).
- Reescrever documentos **in-place** quando autorizado, com status `GERADO / AGUARDA RED TEAM`.
- Mover/renomear docs para paths canônicos (preferir `git mv`), atualizando `docs/INDEX.md` no mesmo commit.
- Desenhar SQL apenas como rascunho `DRAFT ONLY` dentro de `.md` em `docs/planning/`.
- Trabalhar no V1.4 now-scope (código Node/frontend) desde que zero migration.

## Current Migration Reality

```text
FÍSICO (produção): supabase/migrations/001–006 — única fundação. Single-tenant, tabelas em português, ledger distribuído.
FUTURO (planejado, NÃO autorizado): 007–023 — ver docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md.
  Pré-requisito da faixa: 007_kortex_ledger_core antes de wallet/staff account/assinatura.
DESIGN (nunca físico): 001–045 do 4.0 em docs/legacy/.
OBSOLETO: 046–060.
```

## KortexOS 5.1 Rules

- Backend é a única fonte de verdade; frontend só coleta intenção e exibe resposta.
- Ledger append-only, double-entry (futuro 007+); dinheiro novo em `_cents bigint`; mutação financeira exige `idempotency_key`.
- Toda migration futura cumpre o contrato mínimo do SQL Planning §4 (REVOKE/GRANT, append-only, idempotência, rollback, fixture/gate).
- Polymorphic financeiro só via catálogo canônico com FKs dedicadas por tipo (nunca `source_table+source_id` solto).
- Receita antecipada sempre com obrigação rastreável; benefício sempre com origem.
- Gorjeta isolada 100% do profissional; staff não vê financeiro alheio; empresa/parceiro só vê agregado (k≥5).
- Multi-tenant NÃO é premissa — é decisão formal futura.

## How to Read This Repo

1. `AGENTS.md` (este arquivo) → 2. `CLAUDE.md` → 3. `docs/README.md` → 4. `docs/INDEX.md` → 5. docs da tarefa, na ordem de autoridade. Código: backend em `server/`/raiz Node, frontend `index.html` + `js/` + `css/`, testes via `npm run test:gate`.

## Required Output Format for Agents

Toda tarefa que altera arquivos termina reportando:

```text
FILES_CHANGED:
- <paths com natureza da mudança>
BLOCKERS_REMAINING:
- <o que segue bloqueado/pendente>
VEREDITO:
- <status geral + próximo passo>
```

Trabalho de auditoria usa severidade P0–P3 e classificação REAL/PARCIAL/MOCKADO/HARDCODED/CRÍTICO/BLOQUEADO.
