# KortexOS — Índice documental

Este arquivo é apenas índice. O estado operacional atual está em [`PROJECT_STATE.md`](PROJECT_STATE.md).

## Autoridade e decisões
- [`PROJECT_STATE.md`](PROJECT_STATE.md) — estado atual, gates, bloqueadores e handoff
- [`DECISIONS.md`](DECISIONS.md) — decisões arquiteturais
- [`../CHANGELOG.md`](../CHANGELOG.md) — entregas concluídas
- [`../README.md`](../README.md) — apresentação e instalação
- [`../AGENTS.md`](../AGENTS.md) — regras permanentes para agentes
- [`../CLAUDE.md`](../CLAUDE.md) — contexto permanente e limites operacionais

## Auditoria
- [`audit_global/00_STATUS_EXECUCAO.md`](audit_global/00_STATUS_EXECUCAO.md) — auditoria histórica; validar contra `PROJECT_STATE.md`
- [`audit_global/11_PRODUCTION_DEPLOYMENT_TAREFA_A.md`](audit_global/11_PRODUCTION_DEPLOYMENT_TAREFA_A.md) — checklist histórico de produção
- [`audit_global/12_PRODUCTION_DEPLOYMENT_TAREFA_B.md`](audit_global/12_PRODUCTION_DEPLOYMENT_TAREFA_B.md) — checklist histórico de segredos e PII
- [`audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md`](audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md) — auditoria de identidade/tenant que originou a ADR-005

## Arquitetura
- [`adr/ADR-005-identity-tenant-rbac-actor.md`](adr/ADR-005-identity-tenant-rbac-actor.md) — aprovada e mesclada (`main`, PR #14, `31b128d`); modelo canônico de identidade, tenant, RBAC e autoria (principals `user`/`integration` separados)

## Migrations
- [`migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md`](migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md) — DRAFT TÉCNICO do bloco único; BLOQUEADO como implantação única desde 2026-07-12 e substituído por plano faseado (ver `PROJECT_STATE.md`); desenho preservado para a Fase 4
- [`migrations/sql/007_identity_model_DRAFT_ONLY.sql`](migrations/sql/007_identity_model_DRAFT_ONLY.sql) — SQL `DRAFT ONLY` da Fase 4 (tabelas e triggers de negócio), não executar; não contém a Fase 1 (extraída para arquivo próprio)
- [`migrations/sql/007_identity_model_TESTS_DRAFT_ONLY.sql`](migrations/sql/007_identity_model_TESTS_DRAFT_ONLY.sql) — roteiro de testes de schema, `DRAFT ONLY`, só contra banco de teste descartável
- [`migrations/sql/run_idempotency_test_DRAFT_ONLY.sh`](migrations/sql/run_idempotency_test_DRAFT_ONLY.sh) — automatiza a prova de reexecução segura (TESTE 4), `DRAFT ONLY`
- [`migrations/sql/fase1_identidade_minima_DRAFT_ONLY.sql`](migrations/sql/fase1_identidade_minima_DRAFT_ONLY.sql) — Especificação da Fase 1 (identidade mínima: `app_users` e trigger de sincronização); SQL `DRAFT ONLY`, bloqueado aguardando ambiente de teste e validação empírica

## Canon, planejamento e legado
- [`canon/`](canon/) — documentos canônicos de produto e arquitetura
- [`planning/`](planning/) — planejamento e drafts; SQL é DRAFT ONLY
- [`redteam/`](redteam/) — correções e achados de Red Team
- [`legacy/`](legacy/) — referências históricas; não representam a fundação física
- [`archive/`](archive/) — arquivos arquivados
