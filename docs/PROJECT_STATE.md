# PROJECT STATE — KortexOS

**Atualizado:** 2026-07-12  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: V1.4.1 Security Perimeter; V1.4 entregue no código/documentação
- Branch: `main`
- Último commit de código validado: `b4897ca`
- Estado de produção: REAL (auth de perímetro validado manualmente por curl)

## Estado confirmado
| Área | Estado | Evidência |
|---|---|---|
| API_ACCESS_TOKEN | REAL / TEMPORÁRIO | perímetro atual via middleware |
| Auth middleware | REAL | `backend/src/middleware/auth.js`, 9 testes |
| Fail-closed sem token | REAL | auth-gate 08 (503) e sem token (401) |
| Gate integrado | REAL — 82/82 | `cd backend && npm run test:gate` |
| Auth por usuário | PENDENTE | requer JWT/Sessão |
| RBAC | PENDENTE | requer roles no banco |
| Tenant por identidade | PENDENTE | requer extração de tenant do token |
| actor_id | PENDENTE | ledger sem autoria vinculada |
| Multi-tenant seguro | BLOQUEADO | regras em `AGENTS.md` |
| `DEFAULT_EMPRESA_ID` | HARDCODED | `backend/src/config/env.js`; fallback fixo |
| Rotação de segredos | REAL | confirmação prévia |
| Histórico Git limpo | REAL | purga efetuada |

## Trabalho atual
- Ciclo: V1.4.1 concluído; próximo é V1.4.2
- Objetivo: transição segura para V1.4.2
- Estado: REAL

## Bloqueadores
- P0: NENHUM (perímetro V1.4.1 resolvido)
- P1: PENDENTE — auth por usuário, RBAC, tenant por identidade e `actor_id`
- V1.5: BLOQUEADA

## Gates
| Gate | Resultado | Evidência |
|---|---|---|
| `npm run test:gate` | REAL — 82/82 | execução local |
| Produção E2E (Curl) | REAL | validado (health=200, protegida=401) |

## Riscos residuais
- Produção pode permanecer inacessível até a configuração/validação do Render.
- `DEFAULT_EMPRESA_ID` é HARDCODED e não constitui isolamento multi-tenant.
- Auditorias antigas têm vereditos não comprovados; são históricas, não autoridade de estado.

- Definir roadmap e escopo exato do V1.4.2 (foco em auth final e multi-tenant).

## Handoff
- Concluído: V1.4.1 auth gate (82/82).
- Pendente: Auth final por usuário, RBAC, actor_id, multi-tenant.
- Arquivos alterados: docs/PROJECT_STATE.md (refatoração de governança).
- Testes: 82/82 verdes (`npm run test:gate`).
- Riscos: Uso do `DEFAULT_EMPRESA_ID` hardcoded sem validação final.
- Próxima ação: Planejar V1.4.2.
- Não fazer: Commit, Push, V1.5, migrations 007+.
