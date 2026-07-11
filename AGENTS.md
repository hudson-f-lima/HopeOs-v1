# AGENTS.md

Manifesto para agentes de IA (Fable, Claude, Codex, Cursor, ChatGPT e similares). Leia isto ANTES de qualquer tarefa neste repositório.

## Ordem obrigatória de leitura

```text
1. AGENTS.md          (este arquivo)
2. CLAUDE.md          (estado atual, bloqueios, regras invioláveis)
3. docs/INDEX.md      (mapa documental completo)
4. docs/audit_global/00_STATUS_EXECUCAO.md  (bloqueios ativos e tarefas pendentes)
5. docs canônicos em docs/canon/, conforme a tarefa
```

Nunca assumir que um documento é verdade sem verificar o código/teste correspondente.

## Project State

- Produto em produção: HOPE OS V1 / KortexOS™.
- V1.4 CONCLUÍDO (2026-07-10): Dashboard Insights, split payment, rebooking, waitlist — validados em produção.
- V1.4.1 Security Perimeter IMPLEMENTADO (código); **produção PENDENTE** (Tarefa A e B em aberto).
- `npm run test:gate` = 73/73 verdes.
- Commits de referência: auth gate `af02521`, checklists `fa746ac`.
- Promoção estratégica em curso: HOPE OS → **KortexOS™ 5.1** (fase documental; implementação bloqueada).

## Bloqueios ativos (P0)

```text
Tarefa A: API_ACCESS_TOKEN não configurado no Render → PWA em fail-closed.
Tarefa B: Segredos não rotacionados; histórico git com PII não reescrito (✅ CONCLUÍDA).

NÃO AVANÇAR PARA V1.5.
NÃO CRIAR MIGRATIONS 007+.
NÃO IMPLEMENTAR ESCALA GLOBAL.
NÃO EXPANDIR FEATURE.
```

## Classificação obrigatória

Todo achado deve ser classificado:

- `REAL` — existe no código/teste e funciona em produção.
- `PARCIAL` — existe, mas incompleto ou não validado em produção.
- `MOCKADO` — simulado, não pode ser tratado como real.
- `HARDCODED` — fixo/manual, não dinâmico.
- `CRÍTICO` — quebra segurança, financeiro, runtime ou verdade operacional.
- `BLOQUEADO` — não pode avançar sem correção anterior.

## Forbidden Actions

- Criar SQL executável ou arquivo `.sql` sem autorização explícita do Platform Owner.
- Tocar em `supabase/migrations/` (001–006 são intocáveis; banco real bloqueado para novos SQL).
- Assumir a sequência 001–045 do SMART_FLOW 4.0 como física (é design reference em `docs/legacy/`).
- Usar a faixa 046–060 (obsoleta).
- Criar documentos paralelos: `*_REVISED`, `*-1`, `*(1)`, `*copy`, `*final`, patch/delta/adendo.
- Declarar documento "aprovado" sem Red Team real registrado.
- Calcular regra crítica (preço, comissão, saldo, estoque, financeiro) no frontend.
- IA executando ação soberana sobre dinheiro, agenda, score ou ledger.
- Deletar documento sem registro no Correction Plan vigente.
- Comprimir, resumir ou sobrescrever documentos de auditoria, prompts históricos de Red Team, evidência de decisão do Owner ou legado — mesmo sob justificativa de economia de tokens. Esses documentos podem ser movidos para `legacy/`/`archive/`, nunca reduzidos.
- Avançar para V1.5 ou criar migrations 007+ com P0 aberto.
- Tratar `API_ACCESS_TOKEN` como autenticação final ou declarar multi-tenant seguro.
- Usar `empresa_id` vindo de body/query como verdade (deve vir do token/config backend).

## Allowed Actions

- Ler tudo; auditar; classificar (REAL/PARCIAL/MOCKADO/HARDCODED/CRÍTICO/BLOQUEADO).
- Reescrever documentos **in-place** quando autorizado, com status `GERADO / AGUARDA RED TEAM`.
- Mover/renomear docs para paths canônicos (preferir `git mv`), atualizando `docs/INDEX.md` no mesmo commit.
- Desenhar SQL apenas como rascunho `DRAFT ONLY` dentro de `.md` em `docs/planning/`.
- Trabalhar em Tarefa A (deploy auth) e Tarefa B (segredos + PII) — são as únicas tarefas autorizadas agora.
- Trabalhar em débitos técnicos do V1.4 que não exijam migration.

## Documentation Authority

Hierarquia: Master Briefing 5.1 (`docs/canon/`) > Benchmark > Comparative Proposal > Truth Map > Migration Map > Blueprint > SQL Planning > SQL Draft. Em conflito: reportar o conflito, nunca resolver por suposição silenciosa.

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
- Ledger append-only, double-entry (futuro 007+); dinheiro em `_cents bigint`; mutação financeira exige `idempotency_key`.
- Toda migration futura cumpre o contrato mínimo do SQL Planning §4 (REVOKE/GRANT, append-only, idempotência, rollback, fixture/gate).
- Polymorphic financeiro só via catálogo canônico com FKs dedicadas por tipo.
- Receita antecipada sempre com obrigação rastreável; benefício sempre com origem.
- Gorjeta isolada 100% do profissional; staff não vê financeiro alheio; empresa/parceiro só vê agregado (k≥5).
- Multi-tenant NÃO é premissa — é decisão formal futura.

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
