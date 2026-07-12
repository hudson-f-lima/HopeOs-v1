# PROJECT STATE — KortexOS

**Atualizado:** 2026-07-12  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: V1.4.2 Identity/Tenant Boundary — fundação parcial; V1.4.1 Security Perimeter concluído; V1.4 entregue no código/documentação
- Branch: `main`
- Último commit de código validado: `2e3bc01` (`chore: adiciona render.yaml com backend e frontend PWA`) — alterações do V1.4.2 ainda não commitadas (ver Handoff)
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
| Rotação de segredos | REAL | confirmação prévia |
| Histórico Git limpo | REAL | purga efetuada |

## Trabalho atual
- Ciclo: V1.4.2 — fundação de identidade/tenant/actor auditada e parcialmente implementada
- Objetivo: fechar os 4 riscos cross-tenant CRÍTICOS nas rotas e o invariante de tenant na camada de repositório, sem abrir migration nova
- Estado: REAL (correções aplicadas e testadas nas rotas e no `SupabaseRepository`); autoria (`actor_id`) e RBAC seguem BLOQUEADOS por dependerem de migration 007+

## Bloqueadores
- P0: NENHUM
- P1: PENDENTE/BLOQUEADO — auth por usuário, RBAC, tenant por identidade real e `actor_id` (todos exigem migration 007+ ou integração de identidade, fora de escopo autorizado)
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
- Obter autorização do Platform Owner para migration 007 (colunas `actor_id`) e decidir o mecanismo de identidade real (JWT/Supabase Auth) antes de destravar RBAC e tenant por identidade.

## Handoff
- Concluído: auditoria V1.4.2 (`docs/audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md`); `req.auth` introduzido no middleware; `SupabaseRepository` passa a receber `empresaId` explícito; 4 rotas com risco cross-tenant corrigidas (`GET /clientes`, `GET /agenda`, `PATCH /agenda/:id/duracao`, vínculo agenda em `checkout/close`); `unit_id`/`unitId` bloqueados nos validators de cadastro; `SupabaseRepository.insert` corrigido para nunca aceitar `empresa_id`/`empresaId` do payload e falhar fechado sem tenant válido; gate `tenant-boundary-gate.test.js` (12/12) integrado ao `test:gate`.
- Pendente: Auth final por usuário, RBAC, `actor_id`, tenant por identidade real, multi-tenant seguro — todos BLOQUEADOS por exigirem migration 007+ ou integração de identidade fora do escopo autorizado.
- Arquivos alterados: `backend/src/middleware/auth.js`, `backend/src/repositories/SupabaseRepository.js`, `backend/src/routes/index.js`, `backend/src/validators/cadastros.validator.js`, `backend/package.json`, `backend/tests/tenant-boundary-gate.test.js` (novo), `docs/audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md` (novo), `docs/PROJECT_STATE.md`.
- Testes: 94/94 verdes (`npm run test:gate`, execução local em 2026-07-12); `git diff --check` limpo; `npm audit --omit=dev` com 1 HIGH pré-existente sem fix (`xlsx`).
- Riscos: Render ainda sem validação remota; `DEFAULT_EMPRESA_ID` continua sendo a única fonte de tenant (agora centralizada, não corrigida na origem); `actor_id`/RBAC/`unit_id` seguem sem implementação por falta de migration autorizada.
- Próxima ação: decidir migration 007 (actor_id) e mecanismo de identidade real com o Platform Owner.
- Não fazer: V1.5, migrations 007+; não tocar migrations 001–006. Nada foi commitado nem enviado (push) nesta tarefa.
