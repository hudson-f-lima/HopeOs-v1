# PROJECT STATE — KortexOS

**Atualizado:** 2026-11-10  
**Fonte canônica do estado operacional atual.**

## Identificação
- Versão: identidade/RBAC/autoria (007), Ondas A/B (008), estorno + ledger imutável (009) **em `main` e aplicadas em produção**; backend e PWA **publicados** (2026-11-09/10); V1.5 BLOQUEADA
- Branch de trabalho: `ccr-9854814d-ialzxj` (reiniciada a partir de `main` após o merge do #16)
- Fundação física: migrations 001–011 (007 em D-007, 008 em D-009, 009 em D-013, 010 em D-017, 011 em D-019); 012+ não autorizada. 001–010 em produção; 001–011 em produção (011 conferida em 2026-11-11).
- Não misturar: o projeto Supabase `kortex-os-v2-staging` (`hyzoocmmtmjlgdyifwhu`) é de OUTRO projeto — nunca aplicar migrations, SQL ou configurar o HOPE OS nele (Platform Owner, 2026-10-16).
- Banco do HOPE OS: projeto Supabase **`hopeos-v1` (`gsttjozcmdvgstcpadiq`, sa-east-1)**, criado em 2026-10-16. **001–008 aplicadas** (001–005 via conector em 2026-10-16; 006–008 pela integração GitHub no merge do #16, 2026-11-08 — D-010). Verificação do runbook 12/12 `true`; advisor de segurança só INFO "RLS sem policy" (deny-all intencional). A 004 foi aplicada sem o `drop table if exists financial_ledger` (no-op em banco novo). 
- Deploy de migrations: **merge na `main` executa SQL em produção** (integração GitHub do Supabase, "Deploy to production"). Trava: `supabase/migrations.lock` + `check_migrations.sh` no CI (D-010).
- Estado de produção: **NO AR** — API `https://hopeos-v1.onrender.com` (Render, serviço criado à mão), PWA `https://hudson-f-lima.github.io/HopeOs-v1/`, banco `hopeos-v1` com 001–009. Empresa "Meu Salão" + 1 unidade + 1 admin (Platform Owner). Validado em 2026-11-10 por `smoke.js`, leituras reais da API e Playwright contra o site real (login, assistente, dashboard; zero erro de console). Ainda NÃO validado: Red Team em produção, HSTS (NODE_ENV precisa ser exatamente `production`), cadastro aberto no Supabase Auth.

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
| Relatórios "leitura própria" do profissional | REAL para ganhos do mês (`/relatorios/meus-ganhos`, D-016); demais relatórios negados | ganhos-gate 12/12; E2E ganhos |
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
- D-027 (2026-11-13): meta do salão como reconhecimento sem valor (admin, gestão e profissional; sem comissão nem pagamento): REAL. Sem prêmio em dinheiro: D-012 e D-019 seguem valendo.
- D-026 (2026-11-13): pagamento dividido na comanda corrigido (ligava só depois de simular com forma única; relato do dono em produção). E2E `split` novo. PENDENTE: o dono repetir o teste em produção depois do merge.
- D-025 (2026-11-13): cartão parcelado em lote (2x a 12x) e atalhos "Mais vendidos" na comanda: REAL. Gaveta de itens: não existe; decisão do dono pendente. PR #26 mesclado.
- D-024 (2026-11-13): taxa da forma de pagamento visível na comanda antes de fechar, com a alternativa mais barata e botão de troca: REAL. PR #25 mesclado.
- D-023 (2026-11-13): proposta externa de desempenho e margem adaptada — sugestão de meta pela média de 3 meses, calculadora de taxa do parcelado e margem por forma no painel: REAL. Painel de desempenho individual: BLOQUEADO até decisão do dono (risco trabalhista).
- D-022 (2026-11-11, PR #24): redesign fase 1 — tokens de cor, modo escuro, Inter, alvos de toque e cartão "Agora" do profissional. Fase 2 (2026-11-13): Dashboard curto — "Precisa de você" no topo e o resto recolhido. Próximas fases: gaveta de itens da comanda, desktop da recepção e do gestor.
- D-021 (2026-11-11): caminho do produto = evoluir o HOPE OS (especificação com outra stack não iniciada). Ferramentas de backup e teste de restauração: REAL. **Backup automático em produção: AUSENTE**; a rotina diária depende de decisão do dono sobre onde rodar (`docs/RUNBOOK_BACKUP.md`). Migrations 010 e 011 conferidas em produção. PR #23 mesclado.
- D-020 (2026-11-11, PR #23): **primeiro achado de uso real** — a tela do checkout só aceitava um serviço, um produto e um profissional. Corrigido: comanda com vários itens e profissionais. Metas e ranking passam a incluir venda de produtos. Em aberto: marcar "quem vendeu" quando difere de quem executou (exige migration).
- D-019 (2026-11-10): PR #22 mesclado e **migration 010 aplicada em produção** (conferida por SQL). Em PR aberto, **aguardando merge**: migration 011 — metas mensais por profissional e ranking (gestão sempre; equipe só se o salão ligar, sem valores dos colegas). Risco trabalhista aceito pelo dono, sem parecer.
- D-018 (2026-11-10, PR #22): aviso de privacidade aceito no primeiro acesso da equipe, gravado com data e versão (sem migration). Gamificação e metas aprovadas pelo dono, **escopo ainda não definido** e não implementadas.
- D-017 (2026-11-10, PR #22, mesclado; 010 em produção): migration 010 — pagamento de comissão (pagamento, vale, estorno, saldo) e caixa (fundo de troco, sangria, suprimento, fechamento salvo); monitor de produção agendado no GitHub Actions. Gateway de pagamento, NFS-e e WhatsApp automático continuam encaminhados (exigem fornecedor).
- D-016 (2026-11-10): 2ª auditoria + benchmark (`docs/audit/AUDITORIA_E_BENCHMARK_2026-11-10.md`); ganhos do profissional, CSV para o contador, `X-Request-Id`, correção da lista de espera para o profissional. Integrações futuras encaminhadas em `docs/planning/INTEGRACOES_FUTURAS.md`.
- D-013/D-014 (PR #18): estorno de comanda (migration 009, ledger imutável por trigger) — aplicada no merge; histórico de status da agenda; agendamento online pelo link (desligado; ligar exige aviso de privacidade aprovado + Red Team).
- Corrigido (D-012): `isLateCancel`/`scheduledDateTime` liam `horario` só como HH:MM (o Postgres devolve HH:MM:SS → tudo virava meia-noite e cancelamento no mesmo dia nunca era tardio) e em UTC (~3h de erro em Brasília). Afeta confiabilidade do cliente, régua e KPI de falta.
- D-012 (blueprint Beauty & Wellness): presença na agenda, fechamento de caixa (só leitura), KPIs do piloto, validação de desconto/gorjeta e data da comanda no fuso da empresa. Análise: `docs/planning/BLUEPRINT_BEAUTY_WELLNESS_ANALISE.md`.
- Auditoria de estado + benchmark (D-011): `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md`. Corrigidos: dependências vulneráveis, CORS por substring, transição de status de atendimento pago. Novo: lembretes de confirmação via wa.me.
- PR #16 mesclado; banco de produção com 001–008. Trava de migrations no CI (D-010).
- Material promocional (rascunho, fora do repo): kit em artefato privado do Claude (landing, post 4:5, story 9:16, motion 9:16 de 22 s). Placeholders `[SEU WHATSAPP]` abertos; claims de venda sem revisão jurídica/marca. Ver `docs/promo/README.md`.
- Falta (dono): checklist de configuração do Render/Supabase em "Próxima ação única".

## Riscos aceitos (Platform Owner, 2026-11-10)
- PWA no GitHub Pages: sem CSP e sem cabeçalhos de segurança (`smoke.js`: `pwa.csp`/`pwa.headers` FAIL); o Pages também publica o repositório inteiro. Aceito durante o piloto fechado. Migrar o PWA para o serviço estático do Render (que aplica o CSP do `render.yaml`) **antes de clientes pagantes** — muda URL do app, CORS e Redirect URL do Supabase.
- Node: `backend/package.json` fixa `engines.node = 22.x` (igual ao CI); o Render usava 24.14.1 por padrão. Confirmar no próximo deploy que o log mostra Node 22.
- Log: respostas 4xx saem em uma linha (`[401] CODE: msg`); só 5xx grava pilha (correções gate J17).

## Bloqueadores
- P0: NENHUM conhecido no código.
- P1: revalidar `test:gate` integrado contra o `hopeos-v1` (precisa da chave secreta do projeto)
- P1: tornar o check de CI obrigatório na proteção da `main` — sem isso a trava de migrations só avisa (D-010)
- P1: CI PARCIAL — gates integrados (Supabase real) não rodam no Actions
- P1 (antes do 1º cliente pagante): infra gratuita para sistema de caixa — Supabase Free pausa após ~7 dias sem atividade e não tem backup baixável; Render Free dorme quando ocioso
- Resolvido (D-013): ledger imutável por trigger e sem update/delete para `service_role`; estorno de comanda REAL. Efeito: `clear-test-data` e exclusão de empresa com histórico exigem SQL autorizado (RUNBOOK §4.1)
- P2: 41 FKs sem índice (advisor de performance, INFO; banco vazio, sem impacto hoje — exigiria migration 010+); unidades sem particionar dados; autoria de integração em estado mutável
- V1.5: BLOQUEADA

## Gates
| Gate | Resultado | Evidência |
|---|---|---|
| `npm run test:offline` | REAL — 23 suítes verdes (correções 17, ganhos 13, financeiro-ops 14, privacidade 7, gamificação 14) (exige `API_ACCESS_TOKEN`/`SUPABASE_*` fictícios como no CI; sem eles o auth-gate 06 dá 503 local)  (… onda-b 10, lembretes 8, caixa 7, piloto 10, histórico 12, estorno 14, security 7, agendamento público 19) | local + CI 2026-11-09 |
| E2E PWA (Playwright) | REAL — 17 roteiros (novos: ganhos, finops, metas, comanda, agora) (csp, login, equipe, convite, onboarding, onda-b, slots, lembretes, presença, caixa) via `backend/tests/e2e/run-all.js`, sob a CSP de produção, zero erro de console e zero violação de CSP; job `e2e-pwa` no CI | local 2026-11-08; Actions: DESCONHECIDO até a 1ª execução |
| Cabeçalhos de segurança API + CSP do site | REAL — security-headers-gate 7/7; CSP com controle negativo. Limite: atributos `style=` exigem `style-src-attr 'unsafe-inline'` (PARCIAL); `?apiBase=` bloqueado em produção de propósito | 2026-11-08 |
| `supabase/tests/check_migrations.sh` | REAL — lock confere 001–008; negativos testados (editada, não autorizada, fora do padrão) | CI + local 2026-11-08 |
| `supabase/tests/run.sh` (001–011) | REAL — gate_007 12, gate_008 6, gate_009 11, gate_011 6, gate_010 10 (controle negativo: sem o trigger de validação e sem o de imutabilidade o gate falha), ciclo de rollback 010→007 e reaplicação, concorrência agenda e estorno, controles negativos da 009, rollback 009→007 e reaplicação; push da 009 simulado com Supabase CLI sobre banco 001–008 | local 2026-11-09 |
| `supabase/tests/run.sh` (histórico) | REAL — 001–008 + gate_007 (12 blocos) + gate_008 (6 blocos) + concorrência + rollback 008→007/reaplicação | CI (Postgres 16) + local |
| E2E PWA (Playwright) | REAL — login por papel, Equipe, convite → senha → login → recuperação, slots | `backend/tests/e2e`, execução local 2026-10-16 |
| `npm run test:gate` | DESCONHECIDO — último 94/94 em 2026-07-12, antes da bomba-relógio do insights | precisa Supabase real com 007 |
| Banco de produção (verificação do runbook) | REAL — 12/12 `true`, migrations 001–008 | `hopeos-v1`, 2026-11-08 |
| Produção (API + PWA) | REAL — login 200/401, `/me`, catálogo, agenda, caixa, piloto, comandas/estorno, lembretes, logout; PWA sem erro de console | 2026-11-10 |
| `npm audit --omit=dev` | REAL — 0 vulnerabilidades (D-011: `express` 4.22.3, `morgan` 1.12.1; `xlsx` movido para dev, só scripts locais) | 2026-11-08 |

## Riscos residuais
- Aplicar a 007 sem backup ou fora da ordem (backend novo antes da migration quebra agenda/checkout/estoque): o runbook fixa a ordem e o backup.
- A 007 revoga `anon`/`authenticated` em todo `public`: qualquer consumidor externo que hoje use a anon key direto no PostgREST para de funcionar (nenhum conhecido no repositório).
- Enquanto `LEGACY_TOKEN_AUTH_ENABLED=true`, quem tiver o `API_ACCESS_TOKEN` age sem autoria e fora do RBAC.
- Supabase Auth precisa de Site URL/Redirect URLs corretos para os links de convite/recuperação.
- `xlsx` com HIGH sem fix upstream; auditorias antigas são históricas, não autoridade de estado.

## Próxima ação única
- Platform Owner, no Render/Supabase (nada disso é feito pelo código): `NODE_ENV=production` em minúsculas (HSTS); `APP_PUBLIC_URL`; `LEGACY_TOKEN_AUTH_ENABLED=false`; remover `SERVICE_ROLE_KEY` duplicada; avaliar `GH_TOKEN` e secret file `.env`; Build Command `npm ci --omit=dev`; desligar cadastro aberto e ajustar Site URL/Redirect URLs no Supabase Auth; trocar a senha de teste do admin. Depois: `node backend/scripts/ops/smoke.js --api https://hopeos-v1.onrender.com/api --pwa https://hudson-f-lima.github.io/HopeOs-v1/`.
- Marcar os checks de CI como obrigatórios na proteção da `main` (hoje a trava de migrations só avisa).
- Backup diário: **adiado pelo dono para outra etapa** (2026-11-11). Risco aceito: sem cópia do banco fora do Supabase. Opções em `docs/RUNBOOK_BACKUP.md`.
- Melhores práticas globais (`docs/audit/MELHORES_PRATICAS_GLOBAIS_2026-11-10.md`): prioridade 1 = backup com restauração testada (ferramentas em D-021; rotina automática pendente); 3 = contagem cega no caixa (a tela mostra o esperado antes da contagem).
- **Antes de qualquer feature nova:** teste de ponta a ponta com dado real em produção (cliente → agendamento → comanda → caixa → ganhos → estorno → CSV). Escrita em produção nunca foi exercitada.
- NFS-e é obrigatória para ME/EPP do Simples desde 2026-11-01: o salão piloto precisa do contador emitindo (o CSV do Dashboard é o apoio).
- Supabase Auth: ligar a proteção contra senha vazada (advisor WARN).
- Decisões abertas: infra paga antes do 1º cliente; para ligar o agendamento online: dados do salão no aviso do cliente + Red Team em produção + `PUBLIC_BOOKING_LINKS`; prêmio, ligas e demais formas de gamificação além de metas e ranking (D-019) continuam fora.

## Handoff
- Ciclo 2026-11-10: PRs #17–#20 mesclados; 006–009 aplicadas via integração GitHub; produção publicada e validada (ver Estado de produção); correção de URLs (D-015 revisado: backend oficial `hopeos-v1.onrender.com`); kit promocional (rascunho). Não fazer: 010+, V1.5, declarar produção aprovada sem Red Team em produção.
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
