# CODEX.md — Guia para agentes de código

Para quem escreve código neste repositório (Claude Code, Codex/GPT, Cursor, Copilot). Leia **antes**, nesta ordem: `AGENTS.md`, `CLAUDE.md`, `docs/INDEX.md`, `docs/PROJECT_STATE.md`. Este guia não guarda estado; o estado vive só no `PROJECT_STATE.md`. Atualizado em 2026-11-23.

## Stack e estrutura
- **Backend:** Node 22 + Express (`backend/src/`). **Banco:** Supabase Postgres (`supabase/migrations/001–027`). **App:** PWA em JavaScript puro (`index.html`, `js/`, `css/`, `service-worker.js` na raiz). Sem framework, sem build.
- **Regra-mãe:** o backend é a fonte de verdade para dinheiro, comissão, estoque, agenda e ledger. O frontend nunca calcula taxa, comissão, gorjeta ou líquido: pede prévia ao backend.
- **Produção:** API no Render, PWA no GitHub Pages, banco `hopeos-v1`. **Merge na `main` aplica `supabase/migrations` em produção** (D-010) e publica a API.

## Como rodar e testar
```bash
cd backend && npm ci

# 1. Suíte offline (sem Supabase). Os três valores fictícios são obrigatórios (CI faz igual):
API_ACCESS_TOKEN=x SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=x npm run test:offline
#    Uma suíte só: node tests/<nome>.test.js   (com as mesmas variáveis)

# 2. E2E da PWA (Playwright, sob a CSP de produção). Portas 5599 e 3399 precisam estar livres:
pkill -f static-server.py; pkill -f dev-memory-api.js
NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js [nomes...]   # sem nomes = todos

# 3. Migrations + gates SQL (Postgres 16 limpo; roda 001–027, gates, concorrência e rollback):
su postgres -c "cd <repo> && WITH_ROLLBACK=1 supabase/tests/run.sh"
bash supabase/tests/check_migrations.sh     # trava: lock confere, nada editado ou não autorizado
```
- Ver a PWA localmente com API e banco **em memória**: `node backend/scripts/dev-memory-api.js` (porta 3399) e um servidor estático na raiz; abrir `index.html?apiBase=http://127.0.0.1:3399/api`. Logins de dev (senha `dev12345`): `admin@dev.local`, `recepcao@dev.local`, `profissional@dev.local`.
- `npm run test:gate` exige Supabase real e `data/*.json` (não versionado). Não roda no CI. **Nunca declare "gate verde" sem ter rodado**; registre como DESCONHECIDO.
- Os números de testes mudam a cada entrega: confie no CI do último commit, não em contagens escritas em documentos.
- O CI (`.github/workflows/ci.yml`) roda 3 jobs: **Gates offline**, **E2E da PWA** e **Migrations + gates SQL**. `monitor.yml` é o monitor agendado de produção.

## Onde mexer
| Área | Local |
|---|---|
| Rotas (uma por área) | `backend/src/routes/<area>.js`; as mais antigas ficam em `routes/index.js`. Montagem em `backend/src/app.js` |
| Permissão de cada rota | `authorize('<ação>')` do `backend/src/auth/rbac.js`; catálogo fino em `auth/permissoes.js` |
| Regras de negócio puras | `backend/src/engines/` (sem I/O, dinheiro em **centavos inteiros**) |
| Validação de entrada | `backend/src/validators/` |
| Banco (acesso) | `backend/src/repositories/SupabaseRepository.js` e o espelho em memória `backend/src/dev/memoryBackend.js` |
| Migrations | `supabase/migrations/` (**exige autorização**); rollback em `supabase/rollback/`; gate em `supabase/tests/gate_NNN.sql` |
| App (telas) | `js/ui/<tela>.js`, estado em `js/state.js`, chamadas em `js/api.js`, utilitários em `js/utils.js` |
| Service worker | `service-worker.js`: arquivo novo entra em `SHELL_ASSETS` **e** `CACHE_NAME` muda, senão o aparelho fica com a versão antiga |
| Testes | `backend/tests/*.test.js` (gates), `backend/tests/e2e/*.e2e.js` (PWA), `supabase/tests/` (SQL) |

## Onde NÃO mexer
| Área | Motivo |
|---|---|
| `supabase/migrations/001–027` | Aplicadas em produção. O CI reprova arquivo editado ou apagado |
| Migration **028+** | Só com autorização do Platform Owner registrada em `docs/DECISIONS.md`, linha em `supabase/migrations.lock` e decisão própria |
| Cálculo financeiro no frontend | Regra-mãe: backend é a verdade |
| `service_role` / `SUPABASE_SECRET_KEY` no frontend | Nunca |
| `empresa_id` vindo de body ou query | O tenant vem só de `req.auth.empresa_id` |
| `docs/historico/`, `docs/audit/`, prompts históricos | Evidência do dono (`AGENTS.md`): não sobrescrever nem comprimir. `docs/historico/` **não representa o estado atual** |
| Banco de produção | Sem SQL, dado ou deploy sem autorização explícita |

## Como entregar uma funcionalidade (modelo: Cockpit, D-064)
1. **Motor puro** em `engines/` (testável sem banco). 2. **Rota** com `authorize(...)`; `empresa_id` só do token. 3. **Gate** em `backend/tests/<nome>-gate.test.js`, com números calculados à mão e **controle negativo** (quebre a regra, veja o teste cair, restaure); registre em `package.json` nos scripts `test:<nome>` e `test:offline`/`test:gate`. 4. **Tela** em `js/ui/`, `init...()` em `js/app.js`. 5. **Service worker** (`SHELL_ASSETS` + `CACHE_NAME`). 6. **E2E** em `backend/tests/e2e/` e entrada em `CASOS` de `run-all.js`. 7. **Docs:** `DECISIONS.md` (novo `D-0xx`), `PROJECT_STATE.md`, `CHANGELOG.md`, `API_CONTRACT.md` e `node backend/scripts/docs/gerar-indice-rotas.js > docs/ROTAS.md`.

## Armadilhas que o projeto já pagou
- **Toda rota precisa de `authorize`** (RT-20 reprova). Rota pública entra na lista `ROTAS_SEM_RBAC` do `redteam-gate`, com justificativa.
- **Nada de `${nome}` em HTML** sem `escapeHtml`, e nomes vindos do servidor em mensagens usam concatenação (RT-13 varre o `js/`).
- **Log de erro 4xx em uma linha, sem dado pessoal** (RT-10): mascare telefone e nome.
- **Data em teste:** nunca dependa de `new Date()` contra fixture fixa; injete o relógio (`config/clock.js`). Nos E2E o navegador roda em `America/Sao_Paulo`.
- **Segunda/domingo:** teste de agenda que assume dia útil quebra aos domingos; defina escala para os sete dias.
- **Navegação nos E2E:** use `backend/tests/e2e/navegacao.js` (`irParaGestao`, `irParaConta`, `sairDaConta`); mudança de menu ajusta um arquivo só (D-061).
- **Erro de RPC do banco:** traduza no repositório (`erroDaAgenda`). Antes de D-063, o HS412 saía como 500 no banco real porque só o espelho em memória traduzia: **teste sempre também contra o comportamento do banco real**, não só do espelho.
- **Evento de agenda, dinheiro e ledger são imutáveis.** Corrija com estorno ou evento novo, nunca com `UPDATE` em linha financeira.
- **Dois agentes em paralelo:** cada um no seu branch, e `main` é a fonte. O **número `D-0xx` colide** quando dois branches criam decisão ao mesmo tempo (aconteceu com D-056/D-057): antes de mesclar, confira o último `D-` da `main`, renomeie o seu e, se uma migration cita o número no cabeçalho, atualize o sha em `supabase/migrations.lock`. Conflito em `PROJECT_STATE.md`/`DECISIONS.md`: junte as duas entradas, não escolha uma. Em branch alheio, faça merge, nunca rebase nem force-push.

## Commits e PR
- Mensagem curta e descritiva, em português, citando a decisão: `Cockpit do gestor orientado a decisão (D-064, sem migration)`. Prefixos `docs:` e `fix(escopo):` são aceitos. Sem segredo, credencial, dado pessoal ou nome de cliente em commit, PR ou documento.
- PR como **rascunho**, com o que mudou, o que foi testado (e como) e o que **não** foi verificado. O merge é decisão do Platform Owner; nunca mescle por conta própria.
- Antes de pedir revisão: suíte offline verde, E2E verde, `check_migrations.sh` verde, nenhum `.env`, `data/*.json` ou arquivo de `supabase/migrations/` staged sem autorização.

## Variáveis de ambiente (nomes; valores só no Render ou em `.env` local, nunca no Git)
`PORT` (padrão 3333), `NODE_ENV`, `APP_TIMEZONE`, `APP_PUBLIC_URL`, `CORS_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`), `SUPABASE_PUBLISHABLE_KEY`, `DEFAULT_EMPRESA_ID`, `API_ACCESS_TOKEN` e `LEGACY_TOKEN_AUTH_ENABLED` (legado, **desligado em produção**), `AUTH_*_ENABLED` (login social, link e código: desligados até prova externa), `PUBLIC_BOOKING_*` (agendamento pelo link: ausente = desligado), `VAPID_*` (lembrete por push), `WHATSAPP_ENABLED`, `SMS_ENABLED`. A lista completa e os padrões estão em `backend/src/config/env.js`.

## O que está bloqueado hoje (ver `PROJECT_STATE.md` §1 e §6)
V1.5 e escala global; migration 028+ sem autorização; multi-tenant declarado seguro sem Red Team em produção; WhatsApp/SMS automáticos, Pix, cashback e NFS-e (dependem de fornecedor, contador e jurídico); comandas abertas persistentes (D-057); ligar o agendamento pelo link público sem aviso de privacidade aprovado e Red Team.
