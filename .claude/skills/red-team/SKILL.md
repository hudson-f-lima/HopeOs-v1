---
name: red-team
description: Red Team do HOPE OS / KortexOS — tentar PROVAR com testes executáveis que uma superfície falha (agendamento público, estorno, auth/RBAC, rate limit, CORS, logs, XSS na PWA), corrigir sem migration e registrar o resto. Use quando o usuário pedir "Red Team", "pentest", "tentar quebrar", "auditar segurança" de uma rota/feature, ou antes de ligar uma superfície nova em produção.
---

# Red Team — HOPE OS / KortexOS

Modelo pronto: `docs/audit/RED_TEAM_2026-11.md` (achados, provas, correções, veredito). Uma rodada nova é um arquivo novo com data; não reescreva o anterior. Siga também a skill `steward` (bloqueios, gates, formato de entrega).

## 1. Regras
- Ataque é **teste executável** em `backend/tests/redteam-gate.test.js` (`npm run test:redteam`, já em `test:offline` e `test:gate`). Opinião sem teste não é achado.
- Ordem: escrever o teste → rodar na base e **ver falhar** (guardar a saída) → corrigir → ver passar → controle negativo (`NR-*`: `moduloMutante()` recompila o módulo sem a proteção e o ataque passa).
- Nada de migration, `migrations.lock`, SQL remoto, dependência nova ou fornecedor. Achado que só fecha com banco → registrar como BLOQUEADO com proposta.
- Não editar docs compartilhados (PROJECT_STATE, DECISIONS, CHANGELOG, API_CONTRACT, CLAUDE.md, AGENTS.md) quando trabalhando como agente de um time: texto sugerido no relatório.
- Classificar: `REAL`, `PARCIAL`, `CRÍTICO`, `DESCONHECIDO`, `BLOQUEADO`… "CRÍTICO" = rouba sessão/credencial, escala papel, cruza tenant ou corrompe o ledger.
- Sem banco/infra real, o que depende deles é `DESCONHECIDO` (latência, `trust proxy` no Render, concorrência na RPC fora do CI).

## 2. Superfícies e técnicas
| Superfície | Onde | O que tentar |
|---|---|---|
| Agendamento público | `routes/publicBooking.js`, `agendar.html`, `js/agendar.js` | slug (maiúsculas, `%2F`, `__proto__`, uuid), enumeração de cliente (status/corpo/headers/tempo número novo × conhecido), rate limit (IPv6 no mesmo /64, `::ffff:`, `X-Forwarded-For`, formatos do WhatsApp incl. celular sem o 9), teto de memória do limitador, mass assignment, `__proto__`, `text/plain`, corpo grande/aninhado, datas (30/02, ISO com hora, dígitos não ASCII, fuso/DST), corrida de dedup e do limite de futuros, buffer/encaixe, `Cache-Control`, CORS, CSP da página, `?apiBase=` |
| Estorno | `routes/index.js` (`/comandas`), `EstornoEngine.js`, `dev/memoryBackend.js`, `supabase/migrations/009_estorno_comanda.sql` | IDOR entre empresas (com/sem `X-Empresa-Id`), papel (recepção, profissional, legado, integração com scope, multi-empresa, rebaixado), idempotência (mesma chave: outro payload, outra comanda, outra empresa), corrida de parciais (pelo **repositório**, o HTTP quase nunca intercala), centavos (propriedade com PRNG fixo), prazo na virada do fuso, relatórios do mês fechado e caixa no dia do estorno |
| Auth/RBAC | `middleware/auth.js`, `auth/rbac.js`, `app.js` | inventário de **todas** as rotas pelo `app._router.stack` (RT-20: `authorize()` marca `rbacAction`; exceções só na lista `ROTAS_SEM_RBAC`), rotas montadas antes do `requireAuth`, spray de e-mails no login, CORS com origens parecidas |
| PWA | `js/**`, `index.html`, `service-worker.js`, `render.yaml` | todo `innerHTML`/template com nome/rótulo/ícone/código/motivo sem `escapeHtml` (RT-13 varre; exceção só com justificativa), componentes compartilhados (FuzzyField), `?apiBase=`/`?apiToken=` na URL, CSP do header × hospedagem sem header |
| Logs | `morgan('dev')`, `console.error` | capturar stdout/console (`capturarSaida`) e procurar token, WhatsApp, nome, `Key (…)=(…)` do Postgres |

Para importar módulo da PWA no Node: `importarPwa('js/...')` (stubs de `window`/`document`/`localStorage`; o Node 22 detecta ESM).

## 3. Formato do achado
`| ID | Superfície | Achado (como explorar, impacto) | Classe | Prova (teste e saída na base) | Estado |` — e no fim: correções (arquivo → mudança), veredito por superfície, condições para ligar, o que exige migration/decisão.

## 4. Validação
- `cd backend && API_ACCESS_TOKEN=ci-dummy-token SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=ci-dummy-key npm run test:offline`
- Mexeu na PWA: subir `CACHE_NAME`, listar arquivo novo em `SHELL_ASSETS` e rodar `NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js` (inclui `csp` e `agendar`).
- Portas 3399/5599 ocupadas por outro processo: nunca matar. Rodar num namespace de rede: `unshare -rn sh script.sh`, com o script subindo `lo` (sem `ip`: ioctl `SIOCSIFFLAGS` via `python3 -I`) e chamando o `run-all.js`.
- Worktree sem `node_modules`: symlink para o `backend/node_modules` do checkout principal (mesmo `package-lock.json`) e não versionar o link.
