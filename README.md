# HOPE OS → KortexOS™

Sistema operacional para beauty tech: agenda, comandas e caixa, assinaturas, comissões, cockpit do gestor e cadastros, com backend Node/Express, banco Supabase (Postgres) e PWA em JavaScript puro.

**Estado operacional atual:** [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) (única fonte de estado).
**Regras permanentes para agentes:** [`AGENTS.md`](AGENTS.md) e [`CLAUDE.md`](CLAUDE.md).
**Mapa documental:** [`docs/INDEX.md`](docs/INDEX.md). Guia para agentes de código: [`CODEX.md`](CODEX.md). Decisões: [`docs/DECISIONS.md`](docs/DECISIONS.md) (D-001 a D-067).

## Estrutura do repositório

```text
backend/        API Express (src/), testes offline e E2E (tests/), scripts de ops
js/, css/       PWA: interface, módulos por tela (js/ui/) e service worker na raiz
supabase/       migrations (001–027), rollbacks, gates SQL e testes de concorrência
docs/           documentação (ver docs/README.md); docs/ROTAS.md lista todas as rotas da API (gerado)
frontend/       protótipos antigos e plano de patch histórico (não é o app atual)
```

## Como rodar localmente

Requisitos: Node 22 (`backend/package.json` fixa `engines.node = 22.x`).

```bash
cd backend
npm ci
API_ACCESS_TOKEN=dev SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=dev npm run test:offline   # suíte sem Supabase
npm start   # sobe a API com as variáveis de backend/src/config/env.js (valores reais só fora de produção)
```

As variáveis que a API lê estão em `backend/src/config/env.js`. Não há exemplo de `.env` versionado; não copie valores de produção para um ambiente local.

- `npm run test:offline`: testes de regra, RBAC, isolamento e contratos, sem banco real. É o que o CI roda em "Gates offline".
- `npm run test:gate`: gates que exigem o Supabase real (`SUPABASE_URL` e `SUPABASE_SECRET_KEY` reais). Não rodar contra produção.
- Testes ponta a ponta da PWA (Playwright): `NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js`. Cada roteiro sobe uma API de memória própria; ver `backend/tests/e2e/run-all.js`.
- Testes SQL das migrations: `supabase/tests/run.sh` num Postgres 16 limpo (ver [`supabase/README.md`](supabase/README.md)).

Os números de testes mudam a cada entrega. O estado atual vem do CI do último commit, não deste README.

## Segurança

- Autenticação por JWT do Supabase Auth. O token legado `API_ACCESS_TOKEN` existe só para transição e deve estar desligado em produção (`LEGACY_TOKEN_AUTH_ENABLED=false`). O Platform Owner informou que está desligado em 2026-11-22; não foi verificado por requisição.
- Tenant vem só do token (`req.auth.empresa_id`). `empresa_id` em query ou corpo é ignorado.
- `service_role` nunca vai para o frontend.
- Agendamento pelo link público vem **desligado** (`PUBLIC_BOOKING_LINKS` ausente no `render.yaml`). Ligar exige o aviso de privacidade aprovado e Red Team em produção (D-014).
- Não colocar URLs de produção com credenciais, tokens ou segredos em documentos ou PRs.

## Banco e migrations

- Produção: projeto Supabase **`hopeos-v1`** (ID `gsttjozcmdvgstcpadiq`).
- Migrations físicas: **001–027**. Todas aplicadas em produção (conferido por `list_migrations` em 2026-11-23); a 027 (agendamento público e remarcação atômicos, D-063) entrou no merge do PR #58.
- **Merge na `main` aplica `supabase/migrations` em produção** (D-010). Toda migration precisa de autorização do Platform Owner e de linha em `supabase/migrations.lock`.
- **Não criar migrations 028+** sem autorização registrada em `docs/DECISIONS.md`.
- Não avançar para V1.5 nem novas features com P0 aberto em [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).
