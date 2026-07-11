# KortexOS 5.1 — Documentation Index

**Atualizado:** 2026-07-09 · **Regra:** este índice é o mapa único de autoridade documental. Em conflito, vence a hierarquia da seção 1.

## 1. Current Source of Truth

| Autoridade | Documento | Papel |
|---:|---|---|
| 1 | [canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md](canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md) | **MANDA.** Visão, tese, invariantes, domínios D00–D31, gates, bloqueios |
| 2 | [canon/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md](canon/KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md) | Informa (benchmark de mercado) |
| 3 | [canon/KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md](canon/KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md) | Seleciona (herdar/reforçar/bloquear + now-scope V1.4) |
| 4 | [canon/KORTEXOS_5_1_TRUTH_MAP.md](canon/KORTEXOS_5_1_TRUTH_MAP.md) | Classifica maturidade (status documental × implementado) |
| — | `CLAUDE.md` (raiz) + `AGENTS.md` (raiz) | Contexto operacional do produto V1.x e manifesto de agentes |

**Fundação física única: `supabase/migrations/001–006` (produção). Nenhum documento supera esse fato.**

## 2. Architecture

- [architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md](architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md) — organiza arquitetura técnica 5.1. Suporte; não autoriza SQL.
- Docs de produto V1.x ativos (em `docs/`): `API_CONTRACT.md`, `DATA_CONTRACT.md`, `HOPE_OS_V1_2_BACKEND_CADASTROS_REAIS_BLUEPRINT.md`, `HOPE_OS_V1_3_FRONTEND_UI_UX_PREMIUM_BLUEPRINT.md`, `SPEC_V1_3_AGENDA_CHECKOUT_PREMIUM.md`, `KORTEXOS_NOW_SCOPE_V1_4_{MASTER_BRIEFING,SPEC,DEV_HANDOFF}.md`, `KORTEXOS_V1_4_SESSION_HANDOFF_COMPLETE.md`, `GATE_REAL_SUPABASE_CHECKLIST.md`, `AI_MODEL_SELECTION_RATIONALE.md`, `PLAN_V1_3_TASKS.md`, `FRONTEND_V1_3_*.md`, `DILEMA_EXCLUIR_VS_DESATIVAR_SNAPSHOT.md`, `QA_V1_4_CHECKLIST.md`.
- [SECURITY_PII_POLICY.md](SECURITY_PII_POLICY.md) — Política de PII e segurança de dados. Nenhum dado de cliente em git. Implementado 2026-07-11.

## 3. Planning

- [planning/CADASTROS_DEEPENING_PLAN_V1_5.md](planning/CADASTROS_DEEPENING_PLAN_V1_5.md) — plano técnico estrutural para evolução profunda dos cadastros na V1.5.
- [planning/KORTEXOS_5_1_MIGRATION_MAP.md](planning/KORTEXOS_5_1_MIGRATION_MAP.md) — impacto e faixa futura 007–023.
- [planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md](planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md) — planejamento da faixa (não é SQL).
- [planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md](planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md) — rascunho técnico DRAFT ONLY (não executar).

## 4. Red Team

- [redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md](redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md) — achados A01–A14, decisão de fundação (Caminho B), progresso das correções.

## 5. Prompts

- [prompts/KORTEXOS_5_1_REDTEAM_AUDIT_PROMPT_FABLE5.md](prompts/KORTEXOS_5_1_REDTEAM_AUDIT_PROMPT_FABLE5.md) — prompt da auditoria Red Team (registro histórico; menções a 046–060 são pré-reancoramento).

## 6. Legacy Reference

**Referência de design — NUNCA sequência física:**

- [legacy/SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md](legacy/SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md)
- [legacy/SMART_FLOW_4_0_BLUEPRINT_UNIFICADO_CANONICO.md](legacy/SMART_FLOW_4_0_BLUEPRINT_UNIFICADO_CANONICO.md) — a sequência 001–045 daqui colide por número com a base real; usar só como design.
- [legacy/HOPE_OS_V1_0_3_PRE_DEPLOY_HOTFIX_BLUEPRINT.md](legacy/HOPE_OS_V1_0_3_PRE_DEPLOY_HOTFIX_BLUEPRINT.md), [legacy/FRONTEND_V1_1_AUDIT.md](legacy/FRONTEND_V1_1_AUDIT.md) — históricos V1.0/V1.1 superados.
- [legacy/PROMPT_CLAUDE_ANTIGRAVITY_V1_2_CADASTROS_REAIS.md](legacy/PROMPT_CLAUDE_ANTIGRAVITY_V1_2_CADASTROS_REAIS.md) — prompt histórico V1.2.
- `archive/legacy-v1/` — patches e relatórios V1.0.x arquivados. `archive/Claude.v1.1.backup.md` — backup antigo do CLAUDE.md.

## 7. Blocked / Obsolete

```text
BLOQUEADO: SQL executável (qualquer faixa) até novo Red Team aprovar.
BLOQUEADO: alterar supabase/migrations/001–006.
OBSOLETO:  faixa 046–060 (substituída por 007–023 no Migration Map).
OBSOLETO:  tratar 001–045 do SMART_FLOW 4.0 como sequência física.
PROIBIDO:  documentos paralelos *_REVISED/copy/final; patch/delta/adendo.
```

## 8. Reading Order

**Humanos e agentes de IA, nesta ordem:**

1. `AGENTS.md` (raiz) — regras de operação para agentes.
2. `CLAUDE.md` (raiz) — estado do produto V1.x em produção e V1.4 em curso.
3. `docs/README.md` — fatos de fundação.
4. Seção 1 acima (canon, na ordem de autoridade).
5. Architecture → Planning → Red Team, conforme a tarefa.
6. Legacy só quando precisar de contexto de design 4.0.

**Nota:** documentos escritos antes de 2026-07-08 podem citar paths antigos (raiz ou `docs/` plano). Este índice é a localização vigente.

## 9. Rules for Future Documentation

1. Todo doc novo declara: **status** (`GERADO / AGUARDA RED TEAM` ou `APROVADO PELO RED TEAM`), **data**, **autoridade** (qual doc o governa).
2. Correção = reescrita integral in-place. Nunca `*_REVISED`, `-1`, `(1)`, `copy`, `final`.
3. Nada se autodeclara "aprovado" — aprovação só por Red Team real registrado.
4. Doc novo entra na pasta da sua categoria e ganha linha neste INDEX no mesmo commit.
5. Doc superado vai para `legacy/` (referência) ou `archive/` (histórico morto) — nunca deletado sem registro no Correction Plan vigente.
6. SQL draft só em `.md` com marcador DRAFT ONLY; nunca arquivo `.sql` fora de `supabase/migrations/`.
