# PROJECT STATE — KortexOS

**Atualizado:** 2026-10-16  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: identidade/RBAC/autoria (ADR-005 + migration 007) IMPLEMENTADA no código, **não aplicada em produção**; slots-âncora (D-006); V1.4.2 mesclada; V1.5 BLOQUEADA
- Branch de trabalho: `ccr-9854814d-ialzxj` → PR #16 (draft) — `main` em `c5a2914` + ADR-005 (#14)
- Fundação física: migrations 001–007 (007 autorizada em D-007); 008+ não autorizada
- Não misturar: o projeto Supabase `kortex-os-v2-staging` (`hyzoocmmtmjlgdyifwhu`) é de OUTRO projeto — nunca aplicar migrations, SQL ou configurar o HOPE OS nele (Platform Owner, 2026-10-16).
- Estado de produção: BLOQUEADO — backend Render `hopeos-v1` suspenso pelo dono (HTTP 503 "Service suspended", 2026-10-16); Supabase de produção (`qosioymzswhkqkziocas`) fora do alcance da sessão. Procedimento: `docs/RUNBOOK_MIGRATION_007.md`

## Estado confirmado
| Área | Estado | Evidência |
|---|---|---|
| Autenticação por usuário (JWT Supabase Auth, via `/api/auth/*`) | REAL no código / PENDENTE em produção | `backend/src/middleware/auth.js`, `routes/auth.js`; identity-gate 38/38 |
| Principal de integração (credencial dedicada, scopes, rotação, auditoria) | REAL no código / PENDENTE em produção | `backend/src/auth/credentials.js`, `routes/admin.js`; identity-gate I01–I10 |
| `API_ACCESS_TOKEN` (legado) | REAL / TEMPORÁRIO — coexistente, desligável por `LEGACY_TOKEN_AUTH_ENABLED` | identity-gate C01, C03 |
| RBAC (4 papéis, matriz da ADR) | REAL no código — `authorize()` em todas as rotas de negócio | `backend/src/auth/rbac.js`; identity-gate U10, C05 |
| Tenant por identidade (membership; `X-Empresa-Id` só seletor) | REAL no código / PENDENTE em produção | identity-gate U06–U08 |
| Unidades | PARCIAL — acesso por unidade resolvido e fail-closed; dados de negócio ainda sem `unit_id` | ADR-005 "Desvios e limites" |
| Autoria (`actor_id`, `created_by`/`updated_by`/`cancelled_by`) | REAL no código; integração em estado mutável = nula + auditoria (PARCIAL) | migration 007; gate SQL 06; identity-gate U11–U13 |
| Double-booking concorrente | REAL — fechado no banco (`agendamento_criar` com advisory lock) após aplicar a 007 | `supabase/tests/concurrency_agenda.sh` (controle negativo grava 2; com lock grava 1) |
| Exposição de tabelas a `anon`/`authenticated` | REAL — revogada + RLS deny-all na 007 (antes: DESCONHECIDO em produção; consultar no passo 3 do runbook) | gate SQL 10 |
| Relatórios por papel | REAL — CRÍTICO corrigido: snapshot/dashboard/financeiro/insights usavam `DEFAULT_EMPRESA_ID` | identity-gate U07 |
| Relatórios "leitura própria" do profissional | PARCIAL — profissional fica sem relatórios | ADR-005 "Desvios e limites" |
| Sugestão de slots-âncora | REAL no backend e na PWA; PENDENTE validação com dados reais | gate `schedule-slots-gate` 18/18; D-006 |
| PWA: login, convite/definir senha, recuperar senha, Equipe, UI por papel | REAL — E2E Chromium contra API em memória | `backend/tests/e2e/*.e2e.js` |
| `DEFAULT_EMPRESA_ID` | HARDCODED — usado só pelo principal legado | `backend/src/middleware/auth.js` |
| Multi-tenant seguro | BLOQUEADO até a 007 rodar em produção, o legado ser desligado e haver Red Team em produção | AGENTS.md |
| Gate integrado (`test:gate`) | DESCONHECIDO — requer Supabase real com 007 + `data/*.json` | — |
| CI remoto | REAL — PARCIAL: gates offline + migrations/gates SQL em Postgres 16; integrados só locais | `.github/workflows/ci.yml` |
| Insights cashflow acumulado | REAL — corrigido (bomba-relógio de data) | insights-gate 73/73 |
| Rotação de segredos / histórico Git limpo | REAL | ciclos anteriores |

## Trabalho atual
- Ciclo: implementação da ADR-005 (D-007) + slots (D-006) no PR #16. Código, testes e runbook prontos.
- Falta: executar `docs/RUNBOOK_MIGRATION_007.md` com acesso ao Supabase de produção e ao Render.

## Bloqueadores
- P0: NENHUM conhecido no código. Produção indisponível (Render suspenso) — decisão do dono, não defeito.
- P1: aplicar a 007 e fazer o deploy (acesso de produção); revalidar `test:gate` integrado contra Supabase com a 007
- P1: CI PARCIAL — gates integrados (Supabase real) não rodam no Actions
- P2: unidades sem particionar dados; relatórios próprios do profissional; autoria de integração em estado mutável
- V1.5: BLOQUEADA

## Gates
| Gate | Resultado | Evidência |
|---|---|---|
| `npm run test:offline` | REAL — 179/179 (schema 12, rpc-lock 8, cadastros 21, insights 73, auth 9, slots 18, identity 38) | CI + local 2026-10-16 |
| `supabase/tests/run.sh` | REAL — 001–007 + gate_007 (12 blocos) + concorrência + rollback/reaplicação | CI (Postgres 16) + local |
| E2E PWA (Playwright) | REAL — login por papel, Equipe, convite → senha → login → recuperação, slots | `backend/tests/e2e`, execução local 2026-10-16 |
| `npm run test:gate` | DESCONHECIDO — último 94/94 em 2026-07-12, antes da bomba-relógio do insights | precisa Supabase real com 007 |
| Produção (curl) | BLOQUEADO — `/api/health` 503 "Service suspended" | 2026-10-16 |
| `npm audit --omit=dev` | 1 HIGH pré-existente (`xlsx`, sem fix) | risco residual |

## Riscos residuais
- Aplicar a 007 sem backup ou fora da ordem (backend novo antes da migration quebra agenda/checkout/estoque): o runbook fixa a ordem e o backup.
- A 007 revoga `anon`/`authenticated` em todo `public`: qualquer consumidor externo que hoje use a anon key direto no PostgREST para de funcionar (nenhum conhecido no repositório).
- Enquanto `LEGACY_TOKEN_AUTH_ENABLED=true`, quem tiver o `API_ACCESS_TOKEN` age sem autoria e fora do RBAC.
- Supabase Auth precisa de Site URL/Redirect URLs corretos para os links de convite/recuperação.
- `xlsx` com HIGH sem fix upstream; auditorias antigas são históricas, não autoridade de estado.

## Próxima ação única
- Platform Owner (ou sessão com acesso de produção): executar `docs/RUNBOOK_MIGRATION_007.md` — backup → checagens → 007 → Auth URLs → reativar Render + env vars → merge do PR #16 → primeiro admin → smoke tests.

## Handoff
- Ciclo 2026-10-16 (branch `ccr-9854814d-ialzxj`, PR #16):
  - Concluído: slots-âncora (D-006); fix do cashflow; CI (gates offline + migrations em Postgres 16); migration 007 com gate SQL, teste de concorrência e rollback; backend com principals user/integration/legacy, RBAC, autoria, convite, recuperação de senha, admin de equipe/unidades/integrações; correção CRÍTICA de relatórios presos à empresa padrão; PWA com login, definir senha, Equipe e UI por papel; skill `.claude/skills/steward`; runbook de produção.
  - Pendente: aplicação em produção (sem acesso nesta sessão: Supabase de produção não conectado; Render suspenso).
  - Testes: offline 179/179; SQL 007 + concorrência + rollback; E2E Playwright; `test:gate` integrado DESCONHECIDO.
  - Não fazer: V1.5; migrations 008+; tocar 001–007; desligar o legado sem métrica de adoção e autorização.

### Histórico de ciclos anteriores
- Ciclo 2026-10-16 (branch `ccr-9854814d-ialzxj`, PR #16): slots-âncora backend + PWA (D-006), fix do cashflow acumulado, CI offline, skill `.claude/skills/steward`. Sem migration/SQL. Corrida de double-booking registrada como P1 PARCIAL.
- Concluído: V1.4.2 parcial mesclada em `main` via PR #13 (squash, commit `c5a2914`) — `req.auth` estrutural, 4 correções cross-tenant nas rotas, invariante de tenant no `SupabaseRepository.insert`, `unit_id`/`unitId` bloqueados, gate `tenant-boundary-gate.test.js` (12/12). ADR-005 redigida e revisada três vezes em `docs/adr/ADR-005-identity-tenant-rbac-actor.md` (branch `docs/adr-identity-auth-model`, PR #14, sem código/migration): decide Supabase Auth/JWT, membership, RBAC por role fixa, origem de `actor_id`, compatibilidade com `API_ACCESS_TOKEN`, desenho da migration 007, rollout/rollback e gates futuros. Revisão Red Team bloqueou a primeira versão por falta de separação entre principal `user` e principal `integration`; a segunda revisão corrigiu isso adicionando os dois formatos distintos de `req.auth` e o modelo de credencial de integração (`integrations`/`integration_credentials`/`integration_scopes`/`integration_audit_events`); a terceira revisão fechou as últimas garantias explícitas: segredo S2S exibido uma única vez e irrecuperável depois; comparação de credencial resistente a timing attack (mesmo padrão de `safeEquals`/`crypto.timingSafeEqual` já usado no `API_ACCESS_TOKEN`); scopes controlados exclusivamente pelo servidor, nunca autoconcedidos pela integração; autoria fail-closed estendida de "evento imutável" para também cobrir "estado mutável" (`created_by`/`updated_by`/`cancelled_by`); cache de validação de JWT declarado como exclusivo da etapa de identidade, nunca incluindo membership/role/unit access (que são sempre resolvidos frescos no banco a cada requisição); e política mínima de rotação de credenciais S2S (sobreposição curta configurável, máximo de duas credenciais ativas, revogação automática ao fim da janela, revogação emergencial sempre disponível).
- Pendente: Revisão final curta do Platform Owner sobre a ADR-005 corrigida; autorização para a migration 007 nela desenhada; implementação de Supabase Auth, `app_users`/`empresa_memberships`/`membership_units`, modelo de integração e RBAC — todos BLOQUEADOS até essa autorização.
- Arquivos alterados neste ciclo (documental, branch `docs/adr-identity-auth-model`): `docs/adr/ADR-005-identity-tenant-rbac-actor.md`, `docs/DECISIONS.md` (D-005), `docs/PROJECT_STATE.md`. Nenhum código, migration ou dado alterado.
- Testes: nenhum gate novo nesta entrega (documental); gates de código seguem em 94/94 desde o merge do PR #13.
- Riscos: `DEFAULT_EMPRESA_ID` continua sendo a única fonte de tenant até a ADR-005 ser implementada; ausência de CI remoto é débito P1 separado, não resolvido aqui; Render ainda sem validação remota.
- Próxima ação: revisão final curta do Platform Owner da ADR-005 corrigida antes de autorizar push adicional ou merge do PR #14.
- Não fazer: V1.5, migrations 007+, implementação de código de identidade/RBAC/actor_id/integração neste branch; não tocar migrations 001–006.
