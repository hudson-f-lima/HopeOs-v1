# PROJECT STATE — KortexOS

**Atualizado:** 2026-07-12  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: V1.4.2 Identity/Tenant Boundary — fundação parcial concluída e mesclada; ADR-005 (modelo canônico de identidade/RBAC/autoria, com principals `user`/`integration` separados) — aprovada e mesclada em `main` (PR #14, commit `31b128d`); Migration 007 (desenho técnico do schema da ADR-005): DRAFT TÉCNICO EM ELABORAÇÃO — não aprovada, não autorizada para execução; V1.4.1 Security Perimeter concluído; V1.4 entregue no código/documentação
- Branch: `docs/migration-007-identity-model` (documental, sem código/SQL executável) — `main` em `31b128d`
- Último commit de código validado: `c5a2914` (`fix(security): enforce server-owned tenant context (#13)`, PR #13 squash-merged em `main`) — `31b128d` é documental (ADR-005), não altera código
- Estado de produção: REAL (auth de perímetro validado manualmente por curl); multi-tenant seguro continua BLOQUEADO

## Estado confirmado
| Área | Estado | Evidência |
|---|---|---|
| API_ACCESS_TOKEN | REAL / TEMPORÁRIO | perímetro atual via middleware |
| Auth middleware | REAL | `backend/src/middleware/auth.js`, 9 testes |
| Fail-closed sem token | REAL | auth-gate 08 (503) e sem token (401) |
| `req.auth` (empresa_id/user_id/actor_id/role/unit_ids) | PARCIAL | populado pelo middleware; só `empresa_id` tem valor (do env), demais `null`/`[]` — `docs/audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md` |
| Tenant boundary em rotas críticas (clientes, agenda, checkout) | REAL — corrigidos 4 pontos sem filtro de tenant | tenant-boundary-gate 12/12 |
| Tenant boundary na camada de repositório (`SupabaseRepository.insert`) | REAL — `empresa_id`/`empresaId` do payload são descartados; grava sempre `this.empresaId`; falha fechado sem tenant válido | tenant-boundary-gate 12/12 (testes 10–12) |
| Gate integrado | REAL — 94/94 (revalidado em 2026-07-12) | `cd backend && npm run test:gate` |
| Auth por usuário | PENDENTE | requer JWT/Sessão |
| RBAC | BLOQUEADO | requer tabela de papéis (migration 007+, não autorizada) |
| Tenant por identidade | BLOQUEADO | requer extração de tenant de identidade real; hoje `empresa_id` vem só do env |
| actor_id | BLOQUEADO | requer coluna nova em 5 tabelas (migration 007+, não autorizada); não simulado com ator compartilhado |
| unit_id / unidades | BLOQUEADO | não existe no schema; migration 007+ necessária |
| Multi-tenant seguro | BLOQUEADO | regras em `AGENTS.md` |
| `DEFAULT_EMPRESA_ID` | HARDCODED | `backend/src/config/env.js`; única fonte de tenant hoje, agora centralizada em `req.auth.empresa_id` |
| ADR-005 (Supabase Auth/JWT, membership, RBAC, actor_id, principals user/integration) | APROVADA e MESCLADA em `main` (PR #14, `31b128d`) | `docs/adr/ADR-005-identity-tenant-rbac-actor.md`; decisão registrada, nenhuma implementação de código ainda |
| Migration 007 (schema da ADR-005: 8 tabelas novas + colunas de autoria) | DRAFT TÉCNICO EM ELABORAÇÃO — não aprovada, não executada | `docs/migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md` + `docs/migrations/sql/007_identity_model_DRAFT_ONLY.sql`; nenhum SQL aplicado, nenhuma migration física criada em `supabase/migrations/` |
| CI remoto | AUSENTE — débito P1 | sem `.github/workflows`; sem proteção automática antes de merge |
| Rotação de segredos | REAL | confirmação prévia |
| Histórico Git limpo | REAL | purga efetuada |

## Trabalho atual
- Ciclo: V1.4.2 parcial concluída e mesclada (PR #13); ADR-005 aprovada e mesclada (PR #14); ciclo atual é o desenho técnico executável da Migration 007, somente documental (schema em Markdown/SQL `DRAFT ONLY`, nenhum SQL aplicado)
- Objetivo: transformar a ADR-005 em plano de schema revisável antes de qualquer autorização de execução
- Estado: DRAFT TÉCNICO (migration desenhada, não implementada); ADR-005 e V1.4.2 seguem aprovadas/REAL e mescladas

## Bloqueadores
- P0: NENHUM
- P1: PENDENTE/BLOQUEADO — auth por usuário, RBAC, tenant por identidade real e `actor_id` (arquitetura definida na ADR-005, schema desenhado na Migration 007 DRAFT, execução exige autorização do Platform Owner)
- P1 separado: ausência de CI remoto (`.github/workflows`) — não implementar no branch da Migration 007
- Decisão pendente do Platform Owner sobre autoria em `agendamento_eventos` e `lista_espera` (classificadas `DESCONHECIDA` no draft da Migration 007) — bloqueia execução real, não bloqueia o draft
- V1.5: BLOQUEADA

## Gates
| Gate | Resultado | Evidência |
|---|---|---|
| `npm run test:gate` | REAL — 94/94 (82 anteriores + 12 de tenant-boundary) | execução local 2026-07-12 |
| Produção E2E (Curl) | REAL | validado (health=200, protegida=401) |
| `npm audit --omit=dev` | 1 vulnerabilidade HIGH pré-existente (`xlsx`, sem fix disponível) | não relacionada a este ciclo; risco residual |

## Riscos residuais
- Render: REAL (config local validada 2026-07-12) + BLOQUEADO (deploy remoto pendente). Ver `RENDER_DEPLOYMENT_VALIDATION.md` para checklist.
- `DEFAULT_EMPRESA_ID` é HARDCODED e não constitui isolamento multi-tenant — agora é a única fonte de `req.auth.empresa_id`, centralizada mas não derivada de identidade real.
- `actor_id`, `unit_id` e RBAC permanecem BLOQUEADOS; migration mínima documentada em `docs/audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md` (não executada).
- `xlsx` (dependência de scripts de import/export) tem vulnerabilidade HIGH sem fix upstream.
- Auditorias antigas têm vereditos não comprovados; são históricas, não autoridade de estado.

## Próxima ação única
- Platform Owner revisar o draft técnico da Migration 007 (`docs/migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md`), decidir sobre `agendamento_eventos`/`lista_espera` e RLS mínima, e só então autorizar a execução real do SQL.

## Handoff
- Concluído: V1.4.2 parcial mesclada em `main` via PR #13 (squash, commit `c5a2914`). ADR-005 aprovada e mesclada em `main` via PR #14 (squash, commit `31b128d`) após três rodadas de revisão Red Team (separação de principals `user`/`integration`; garantias explícitas de segredo/timing-safe/scopes/autoria; cache de identidade e rotação S2S). Nesta etapa (branch `docs/migration-007-identity-model`, ainda sem PR aberto): desenho técnico executável da Migration 007 em `docs/migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md` (8 tabelas novas, constraints de tenant boundary via FK composta em `membership_units`, triggers de imutabilidade de `integrations.empresa_id` e limite de credenciais ativas, classificação de autoria de toda tabela existente, backfill em fases, ordem de execução, rollback por etapa, Red Team de 12 cenários) + SQL `DRAFT ONLY` companheiro em `docs/migrations/sql/007_identity_model_DRAFT_ONLY.sql`.
- Pendente: Revisão do Platform Owner sobre o draft da Migration 007; decisão explícita sobre autoria em `agendamento_eventos`/`lista_espera` (hoje `DESCONHECIDA`); confirmação da recomendação de RLS mínima; autorização explícita para executar qualquer DDL; implementação de backend (middleware JWT, resolução de `req.auth`, RPCs de integração) — tudo BLOQUEADO até essa autorização.
- Arquivos alterados neste ciclo (documental, branch `docs/migration-007-identity-model`, após 3 rodadas de Red Team): `docs/migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md` (novo), `docs/migrations/sql/007_identity_model_DRAFT_ONLY.sql` (novo, `DRAFT ONLY`), `docs/migrations/sql/007_identity_model_TESTS_DRAFT_ONLY.sql` (novo, `DRAFT ONLY`, testes de schema com SQLSTATE/constraint específicos e fixtures determinísticos), `docs/migrations/sql/run_idempotency_test_DRAFT_ONLY.sh` (novo, `DRAFT ONLY`, sintaxe validada com `bash -n`, não executado contra banco), `docs/INDEX.md` (ADR-005 e os 4 arquivos de Migration 007 indexados), `docs/PROJECT_STATE.md`. Nenhum arquivo em `supabase/migrations/` alterado; nenhum código de backend alterado; nenhum SQL executado contra banco real.
- Testes: nenhum gate novo nesta entrega (documental); gates de código seguem em 94/94 desde o merge do PR #13.
- Riscos: `DEFAULT_EMPRESA_ID` continua sendo a única fonte de tenant até a Migration 007 e o backend da ADR-005 serem implementados; ausência de CI remoto é débito P1 separado, não resolvido aqui; Render ainda sem validação remota.
- Próxima ação: Platform Owner revisar o draft da Migration 007 e decidir sobre os itens pendentes antes de qualquer autorização de execução.
- Não fazer: V1.5, execução de SQL, alteração de `supabase/migrations/001` a `006`, implementação de backend de identidade/RBAC/actor_id/integração neste branch.
