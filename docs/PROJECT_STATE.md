# PROJECT STATE — KortexOS

**Atualizado:** 2026-07-12  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: V1.4.2 Identity/Tenant Boundary — fundação parcial concluída e mesclada; ADR-005 (modelo canônico de identidade/RBAC/autoria, com principals `user`/`integration` separados) — aprovada e mesclada em `main` (PR #14, commit `31b128d`); Migration 007 (bloco único, schema completo da ADR-005): BLOQUEADA — decisão de 2026-07-12 substitui a implantação em bloco único por plano faseado (Fase 1: identidade mínima; Fase 2: tenant/memberships; Fase 3: RBAC; Fase 4: integrações/autoria/tenant boundary); V1.4.1 Security Perimeter concluído; V1.4 entregue no código/documentação
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
| Migration 007 (bloco único: 8 tabelas novas + colunas de autoria) | BLOQUEADA — rejeitada como implantação única em 2026-07-12; substituída por plano faseado | `docs/migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md` + `docs/migrations/sql/007_identity_model_DRAFT_ONLY.sql`; nenhum SQL aplicado, nenhuma migration física criada em `supabase/migrations/` |
| Trigger `auth.users → app_users` | REAL no SQL (como rascunho escrito); DESCONHECIDO funcionando em banco (aguarda validação real e tratamento de erros do GoTrue) | `docs/migrations/sql/fase1_identidade_minima_DRAFT_ONLY.sql` |
| Fase 1 (identidade mínima: `app_users`, trigger `auth.users → app_users`) | Pronta para execução: BLOQUEADA (falta validação empírica); Documentação da Fase 1: REAL (consistente e isolada) | `docs/migrations/sql/fase1_identidade_minima_DRAFT_ONLY.sql` |
| CI remoto | AUSENTE — débito P1 | sem `.github/workflows`; sem proteção automática antes de merge |
| Rotação de segredos | REAL | confirmação prévia |
| Histórico Git limpo | REAL | purga efetuada |

## Trabalho atual
- Ciclo: V1.4.2 parcial concluída e mesclada (PR #13); ADR-005 aprovada e mesclada (PR #14); desenho técnico da Migration 007 em bloco único documentado e commitado (`5c82e04`, `a5cf73b`); em 2026-07-12 o Platform Owner decidiu rejeitar a implantação da 007 como bloco único e substituí-la por um plano faseado
- Objetivo: especificar e validar isoladamente a Fase 1 (identidade mínima) antes de qualquer fase seguinte — sem redesenhar o que já está pronto para a Fase 4 (tenant boundary, FKs compostas, triggers de integração)
- Estado: Migration 007 (bloco único) BLOQUEADA por decisão de faseamento; Fase 1 extraída para rascunho próprio (`fase1_identidade_minima_DRAFT_ONLY.sql`, bloqueada); nenhuma migration física `007+` (nem `007a`/`007b`/etc.) foi ou será criada — o faseamento existe só como etapas documentais até autorização explícita de conversão em migration pelo responsável do projeto; ADR-005 e V1.4.2 seguem aprovadas/REAL e mescladas

## Bloqueadores
- P0: NENHUM
- P1: PENDENTE/BLOQUEADO — auth por usuário, RBAC, tenant por identidade real e `actor_id` (arquitetura definida na ADR-005; execução de qualquer fase exige autorização explícita do Platform Owner e banco descartável, nunca produção)
- P1 separado: ausência de CI remoto (`.github/workflows`) — não implementar neste branch
- Trigger `auth.users → app_users` foi extraído para script isolado da Fase 1; classificado REAL como rascunho escrito e DESCONHECIDO no banco. Documentação classificada REAL (sem contradições residuais). 007 como bloco único está BLOQUEADA.
- Decisão pendente do Platform Owner sobre autoria em `agendamento_eventos` e `lista_espera` (classificadas `DESCONHECIDA` no draft da Migration 007) — escopo da Fase 4; não bloqueia Fase 1 nem Fase 2
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
- Aguardar autorização do Platform Owner para iniciar a execução da Fase 1 (identidade mínima) — escopo: `app_users`, trigger `auth.users → app_users`, validação JWT. Não executar SQL sem esta autorização.

## Handoff
- Concluído: V1.4.2 parcial mesclada em `main` via PR #13 (squash, commit `c5a2914`). ADR-005 aprovada e mesclada em `main` via PR #14 (squash, commit `31b128d`). Desenho técnico da Migration 007 em bloco único documentado e commitado neste branch (`5c82e04` docs, `a5cf73b` chmod do runner) — 8 tabelas novas, constraints de tenant boundary via FK composta, triggers de imutabilidade/limite/append-only, classificação de autoria, backfill em fases, Red Team de 12 cenários. Planejamento de ambiente de validação (Preview Branch vs. projeto descartável vs. Supabase local) documentado só em conversa, sem arquivo criado. Em 2026-07-12, por decisão do Platform Owner: (1) confirmada por inspeção direta a ausência do trigger `auth.users → app_users` no SQL DRAFT; (2) rejeitada a implantação da 007 como bloco único; (3) adotado plano faseado (Fase 1 identidade mínima, Fase 2 tenant/memberships, Fase 3 RBAC, Fase 4 integrações/autoria/tenant boundary), mantido documental — nenhuma migration física `007+` (nem `007a`/`007b`) será criada sem autorização explícita de conversão pelo responsável do projeto.
- Pendente: Autorização explícita para executar a Fase 1 e criação de ambiente descartável para os testes; decisão explícita sobre autoria em `agendamento_eventos`/`lista_espera` (hoje `DESCONHECIDA`, escopo da Fase 4); confirmação de RLS mínima; implementação de backend (middleware JWT, resolução de `req.auth`, RPCs de integração) — tudo BLOQUEADO até autorização específica de cada fase.
- Arquivos alterados neste ciclo (documental, branch `docs/migration-007-identity-model`): `docs/PROJECT_STATE.md` — atualização de status e extração da Fase 1. `docs/migrations/sql/fase1_identidade_minima_DRAFT_ONLY.sql` — arquivo criado isolando a Fase 1 com tratamento do nome vazio. `docs/migrations/sql/007_identity_model_DRAFT_ONLY.sql` — removida a Fase 1. `MIGRATION-007-IDENTITY-MODEL-DRAFT.md` — correção de classificações contraditórias. Nenhum arquivo em `supabase/migrations/` alterado; nenhum SQL executado contra banco real.
- Testes: nenhum gate novo nesta entrega (documental); gates de código seguem em 94/94 desde o merge do PR #13.
- Riscos: `DEFAULT_EMPRESA_ID` continua sendo a única fonte de tenant até a Fase 1+ e o backend da ADR-005 serem implementados; ausência de CI remoto é débito P1 separado, não resolvido aqui; Render ainda sem validação remota.
- Próxima ação: aguardar autorização do Platform Owner para execução isolada da Fase 1.
- Não fazer: V1.5, execução de SQL, alteração de `supabase/migrations/001` a `006`, criação de qualquer migration física `007+` (incluindo `007a`/`007b`/etc.), implementação de backend de identidade/RBAC/actor_id/integração neste branch, redesenho do que já está pronto para a Fase 4.
