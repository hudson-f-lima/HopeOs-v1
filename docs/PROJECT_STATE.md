# PROJECT STATE — KortexOS

**Atualizado:** 2026-11-08  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: identidade/RBAC/autoria (ADR-005, 007), Ondas A e B (008) e slots-âncora (D-006) **mescladas em `main`** (PR #16, `5cff579`) e **com banco aplicado em produção**; backend ainda não publicado; V1.5 BLOQUEADA
- Branch de trabalho: `ccr-9854814d-ialzxj` (reiniciada a partir de `main` após o merge do #16)
- Fundação física: migrations 001–008 (007 em D-007, 008 em D-009); 009+ não autorizada
- Não misturar: o projeto Supabase `kortex-os-v2-staging` (`hyzoocmmtmjlgdyifwhu`) é de OUTRO projeto — nunca aplicar migrations, SQL ou configurar o HOPE OS nele (Platform Owner, 2026-10-16).
- Banco do HOPE OS: projeto Supabase **`hopeos-v1` (`gsttjozcmdvgstcpadiq`, sa-east-1)**, criado em 2026-10-16. **001–008 aplicadas** (001–005 via conector em 2026-10-16; 006–008 pela integração GitHub no merge do #16, 2026-11-08 — D-010). Verificação do runbook 12/12 `true`; advisor de segurança só INFO "RLS sem policy" (deny-all intencional). A 004 foi aplicada sem o `drop table if exists financial_ledger` (no-op em banco novo). Banco vazio: 0 empresas, 0 usuários.
- Deploy de migrations: **merge na `main` executa SQL em produção** (integração GitHub do Supabase, "Deploy to production"). Trava: `supabase/migrations.lock` + `check_migrations.sh` no CI (D-010).
- Estado de produção: banco PRONTO; backend BLOQUEADO por decisão do dono — Render `hopeos-v1` suspenso (HTTP 503, rechecado em 2026-11-08; o dono optou por não reativar por enquanto). Procedimento restante: `docs/RUNBOOK_MIGRATION_007.md` passos 5–7.

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
| Onda B (D-009): fiscal, buffer, cargos/categorias com herança de comissão, régua de faltas (alerta), cota-parte | REAL no código — migration 008 + gate_008 (6 blocos, controle negativo), onda-b-gate 9/9, E2E; PENDENTE em produção | `supabase/migrations/008_*.sql`, `backend/src/engines/CommissionResolver.js`, `js/ui/comissoes.js` |
| Assistente de configuração em 6 fases (Onda A, D-008) | REAL no código — onboarding-gate 9/9 + E2E do salão vazio até o app; PENDENTE em produção | `js/ui/onboarding.js`, `backend/src/routes/onboarding.js` |
| PWA: login, convite/definir senha, recuperar senha, Equipe, UI por papel | REAL — E2E Chromium contra API em memória | `backend/tests/e2e/*.e2e.js` |
| `DEFAULT_EMPRESA_ID` | HARDCODED — usado só pelo principal legado | `backend/src/middleware/auth.js` |
| Multi-tenant seguro | BLOQUEADO até a 007 rodar em produção, o legado ser desligado e haver Red Team em produção | AGENTS.md |
| Gate integrado (`test:gate`) | DESCONHECIDO — requer Supabase real com 007 + `data/*.json` | — |
| CI remoto | REAL — PARCIAL: gates offline + migrations/gates SQL em Postgres 16; integrados só locais | `.github/workflows/ci.yml` |
| Insights cashflow acumulado | REAL — corrigido (bomba-relógio de data) | insights-gate 73/73 |
| Rotação de segredos / histórico Git limpo | REAL | ciclos anteriores |

## Trabalho atual
- D-013/D-014 (PR #18): estorno de comanda (migration 009, ledger imutável por trigger) — aplicada no merge; histórico de status da agenda; agendamento online pelo link (desligado; ligar exige aviso de privacidade aprovado + Red Team).
- Corrigido (D-012): `isLateCancel`/`scheduledDateTime` liam `horario` só como HH:MM (o Postgres devolve HH:MM:SS → tudo virava meia-noite e cancelamento no mesmo dia nunca era tardio) e em UTC (~3h de erro em Brasília). Afeta confiabilidade do cliente, régua e KPI de falta.
- D-012 (blueprint Beauty & Wellness): presença na agenda, fechamento de caixa (só leitura), KPIs do piloto, validação de desconto/gorjeta e data da comanda no fuso da empresa. Análise: `docs/planning/BLUEPRINT_BEAUTY_WELLNESS_ANALISE.md`.
- Auditoria de estado + benchmark (D-011): `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md`. Corrigidos: dependências vulneráveis, CORS por substring, transição de status de atendimento pago. Novo: lembretes de confirmação via wa.me.
- PR #16 mesclado; banco de produção com 001–008. Trava de migrations no CI (D-010).
- Falta (dono): Auth URLs, reativar o Render com as variáveis, convidar o primeiro admin (runbook 5–7).

## Bloqueadores
- P0: NENHUM conhecido no código. Produção indisponível (Render suspenso) — decisão do dono, não defeito.
- P1: publicar o backend (Render suspenso por decisão do dono); revalidar `test:gate` integrado contra o `hopeos-v1` (precisa da chave secreta do projeto)
- P1: tornar o check de CI obrigatório na proteção da `main` — sem isso a trava de migrations só avisa (D-010)
- P1: CI PARCIAL — gates integrados (Supabase real) não rodam no Actions
- P1 (antes do 1º cliente pagante): infra gratuita para sistema de caixa — Supabase Free pausa após ~7 dias sem atividade e não tem backup baixável; Render Free dorme quando ocioso
- Resolvido (D-013): ledger imutável por trigger e sem update/delete para `service_role`; estorno de comanda REAL. Efeito: `clear-test-data` e exclusão de empresa com histórico exigem SQL autorizado (RUNBOOK §4.1)
- P2: 41 FKs sem índice (advisor de performance, INFO; banco vazio, sem impacto hoje — exigiria migration 009); unidades sem particionar dados; relatórios próprios do profissional; autoria de integração em estado mutável
- V1.5: BLOQUEADA

## Gates
| Gate | Resultado | Evidência |
|---|---|---|
| `npm run test:offline` | REAL — 16 suítes verdes (… onda-b 10, lembretes 8, caixa 7, piloto 10, histórico 12, estorno 14, security 7, agendamento público 19) | local + CI 2026-11-09 |
| E2E PWA (Playwright) | REAL — 10 roteiros (csp, login, equipe, convite, onboarding, onda-b, slots, lembretes, presença, caixa) via `backend/tests/e2e/run-all.js`, sob a CSP de produção, zero erro de console e zero violação de CSP; job `e2e-pwa` no CI | local 2026-11-08; Actions: DESCONHECIDO até a 1ª execução |
| Cabeçalhos de segurança API + CSP do site | REAL — security-headers-gate 7/7; CSP com controle negativo. Limite: atributos `style=` exigem `style-src-attr 'unsafe-inline'` (PARCIAL); `?apiBase=` bloqueado em produção de propósito | 2026-11-08 |
| `supabase/tests/check_migrations.sh` | REAL — lock confere 001–008; negativos testados (editada, não autorizada, fora do padrão) | CI + local 2026-11-08 |
| `supabase/tests/run.sh` (001–009) | REAL — gate_007 12, gate_008 6, gate_009 11, concorrência agenda e estorno, controles negativos da 009, rollback 009→007 e reaplicação; push da 009 simulado com Supabase CLI sobre banco 001–008 | local 2026-11-09 |
| `supabase/tests/run.sh` (histórico) | REAL — 001–008 + gate_007 (12 blocos) + gate_008 (6 blocos) + concorrência + rollback 008→007/reaplicação | CI (Postgres 16) + local |
| E2E PWA (Playwright) | REAL — login por papel, Equipe, convite → senha → login → recuperação, slots | `backend/tests/e2e`, execução local 2026-10-16 |
| `npm run test:gate` | DESCONHECIDO — último 94/94 em 2026-07-12, antes da bomba-relógio do insights | precisa Supabase real com 007 |
| Banco de produção (verificação do runbook) | REAL — 12/12 `true`, migrations 001–008 | `hopeos-v1`, 2026-11-08 |
| Produção (curl) | BLOQUEADO — `/api/health` 503 "Service suspended" | 2026-11-08 |
| `npm audit --omit=dev` | REAL — 0 vulnerabilidades (D-011: `express` 4.22.3, `morgan` 1.12.1; `xlsx` movido para dev, só scripts locais) | 2026-11-08 |

## Riscos residuais
- Aplicar a 007 sem backup ou fora da ordem (backend novo antes da migration quebra agenda/checkout/estoque): o runbook fixa a ordem e o backup.
- A 007 revoga `anon`/`authenticated` em todo `public`: qualquer consumidor externo que hoje use a anon key direto no PostgREST para de funcionar (nenhum conhecido no repositório).
- Enquanto `LEGACY_TOKEN_AUTH_ENABLED=true`, quem tiver o `API_ACCESS_TOKEN` age sem autoria e fora do RBAC.
- Supabase Auth precisa de Site URL/Redirect URLs corretos para os links de convite/recuperação.
- `xlsx` com HIGH sem fix upstream; auditorias antigas são históricas, não autoridade de estado.

## Próxima ação única
- Platform Owner, quando decidir publicar: `docs/RUNBOOK_MIGRATION_007.md` passos 5–7 (Auth URLs → reativar Render + env vars + deploy manual da `main` → convite do primeiro admin; o SQL do vínculo pode ser rodado pela sessão).
- Antes disso, sem custo: marcar o check "Migrations + gates SQL (Postgres 16)" como obrigatório na proteção da `main`.
- Risco: o plano gratuito pausa o `hopeos-v1` após ~7 dias sem atividade; reativar no painel antes de publicar.

## Handoff
- Ciclo 2026-11-08 (PR #16 mesclado, `5cff579`): Ondas A/B, migration 008, aplicação de 006–008 em produção via integração GitHub (D-010), trava de migrations no CI. Pendente: publicação do backend (decisão do dono). Não fazer: 009+, editar 001–008 (o CI reprova), Onda C.
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
