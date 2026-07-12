# PROJECT STATE — KortexOS

**Atualizado:** 2026-07-12  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: V1.4.2 Identity/Tenant Boundary — fundação parcial concluída e mesclada; ADR-005 (modelo canônico de identidade/RBAC/autoria): PROPOSTA CONCLUÍDA — aguardando revisão e aprovação do Platform Owner; V1.4.1 Security Perimeter concluído; V1.4 entregue no código/documentação
- Branch: `docs/adr-identity-auth-model` (documental, sem código) — `main` em `c5a2914`
- Último commit de código validado: `c5a2914` (`fix(security): enforce server-owned tenant context (#13)`, PR #13 squash-merged em `main`)
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
| ADR-005 (Supabase Auth/JWT, membership, RBAC, actor_id) | PROPOSTA CONCLUÍDA — aguardando revisão e aprovação do Platform Owner | `docs/adr/ADR-005-identity-tenant-rbac-actor.md`; nenhum código/migration alterado |
| CI remoto | AUSENTE — débito P1 | sem `.github/workflows`; sem proteção automática antes de merge |
| Rotação de segredos | REAL | confirmação prévia |
| Histórico Git limpo | REAL | purga efetuada |

## Trabalho atual
- Ciclo: V1.4.2 parcial concluída e mesclada (PR #13); ciclo atual é a ADR-005 (arquitetura de identidade/tenant/RBAC/autoria), somente documental
- Objetivo: obter decisão e autorização arquitetural antes de qualquer migration ou código de identidade real
- Estado: PROPOSTA (ADR redigida, não implementada); V1.4.2 (rotas + repositório) segue REAL e mesclada

## Bloqueadores
- P0: NENHUM
- P1: PENDENTE/BLOQUEADO — auth por usuário, RBAC, tenant por identidade real e `actor_id` (arquitetura definida na ADR-005, implementação exige migration 007+ autorizada)
- P1 separado: ausência de CI remoto (`.github/workflows`) — não implementar no branch da ADR
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
- Platform Owner revisar e autorizar (ou pedir revisão de) a ADR-005 (`docs/adr/ADR-005-identity-tenant-rbac-actor.md`); só então iniciar a migration 007 desenhada nela.

## Handoff
- Concluído: V1.4.2 parcial mesclada em `main` via PR #13 (squash, commit `c5a2914`) — `req.auth` estrutural, 4 correções cross-tenant nas rotas, invariante de tenant no `SupabaseRepository.insert`, `unit_id`/`unitId` bloqueados, gate `tenant-boundary-gate.test.js` (12/12). ADR-005 redigida em `docs/adr/ADR-005-identity-tenant-rbac-actor.md` (branch `docs/adr-identity-auth-model`, sem código/migration): decide Supabase Auth/JWT, membership, RBAC por role fixa, origem de `actor_id`, compatibilidade com `API_ACCESS_TOKEN`, desenho da migration 007, rollout/rollback e gates futuros.
- Pendente: Autorização do Platform Owner para a ADR-005 e para a migration 007 nela desenhada; implementação de Supabase Auth, `app_users`/`empresa_memberships`/`membership_units`, RBAC e `actor_id` real — todos BLOQUEADOS até essa autorização.
- Arquivos alterados neste ciclo (documental, branch `docs/adr-identity-auth-model`): `docs/adr/ADR-005-identity-tenant-rbac-actor.md` (novo), `docs/DECISIONS.md` (D-005, índice/resumo), `docs/PROJECT_STATE.md`. Nenhum código, migration ou dado alterado.
- Testes: nenhum gate novo nesta entrega (documental); gates de código seguem em 94/94 desde o merge do PR #13.
- Riscos: `DEFAULT_EMPRESA_ID` continua sendo a única fonte de tenant até a ADR-005 ser implementada; ausência de CI remoto é débito P1 separado, não resolvido aqui; Render ainda sem validação remota.
- Próxima ação: obter autorização do Platform Owner para a ADR-005 e, então, a migration 007.
- Não fazer: V1.5, migrations 007+, implementação de código de identidade/RBAC/actor_id neste branch; não tocar migrations 001–006. Nada foi commitado nem enviado (push) nesta tarefa.
