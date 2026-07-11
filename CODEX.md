# CODEX.md — Guia para agente de código

Específico para agentes que escrevem código (Claude Code, Codex, Cursor, Copilot). Ler após `AGENTS.md` e `CLAUDE.md`.

## Como rodar

```bash
# Backend
cd backend
npm install
npm start          # porta 3000 por padrão

# Testes — obrigatório verde antes de qualquer commit
cd backend && npm run test:gate
# Esperado: 82/82 verdes

# Frontend local
npx --yes serve . -l 5500
# Abrir http://localhost:5500
```

## Como testar

```bash
# Gate principal (82/82)
cd backend && npm run test:gate

# Validação manual de auth (com backend rodando)
curl http://localhost:3000/api/health          # → 200
curl http://localhost:3000/api/clientes        # → 401
curl -H "Authorization: Bearer WRONG" http://localhost:3000/api/clientes  # → 401
curl -H "Authorization: Bearer $API_ACCESS_TOKEN" http://localhost:3000/api/clientes  # → 200
```

## Onde mexer

| Área | Localização |
|------|-------------|
| Rotas backend | `backend/src/routes/index.js` |
| Validators | `backend/src/validators/` |
| Engines (financeiro, comissão, estoque) | `backend/src/engines/` |
| Repository (Supabase) | `backend/src/repositories/SupabaseRepository.js` |
| Auth middleware | `backend/src/middleware/auth.js` |
| Config/env | `backend/src/config/env.js` |
| Frontend — state | `js/state.js` |
| Frontend — API calls | `js/api.js` |
| Frontend — UI tabs | `js/ui/agenda.js`, `js/ui/checkout.js`, `js/ui/dashboard.js`, `js/ui/cadastros.js` |
| Service worker | `service-worker.js` (raiz) |
| Testes | `backend/tests/` |

## Onde NÃO mexer

| Área | Motivo |
|------|--------|
| `supabase/migrations/` | Banco real; qualquer SQL exige autorização explícita |
| Cálculo financeiro no frontend | Regra-mãe: backend é a verdade |
| `backend/src/db/supabaseClient.js` com `service_role` | Nunca expor ao frontend |
| `empresa_id` via body/query | Deve vir do config backend, não do cliente |
| Documentos em `docs/canon/` | Só reescrever in-place com autorização |

## Padrões de commit

```text
fix(scope): descrição curta em inglês
feat(scope): descrição
chore(scope): descrição
docs(scope): descrição
refactor(scope): descrição
```

Exemplos reais do projeto:
- `fix(auth): add API access token auth middleware`
- `docs(audit): add production deployment checklists for Tarefa A & B`
- `fix(security): remove PII from git index and prevent future commits`

## Gates obrigatórios antes de commit

1. `cd backend && npm run test:gate` → 82/82 verdes.
2. Nenhum arquivo `.env` staged (`git status` para confirmar).
3. Nenhum dado em `data/*.json` staged (`.gitignore` deve barrar).
4. Nenhuma migration nova em `supabase/migrations/` sem autorização explícita.
5. Service worker: se alterou frontend, bumpar `CACHE_NAME` em `service-worker.js`.

## Checklist antes de commit

```text
[ ] npm run test:gate → 82/82 verdes
[ ] git status — sem .env, data/*.json, backups/
[ ] Nenhuma migration SQL nova não autorizada
[ ] Se mudou frontend → CACHE_NAME bumped em service-worker.js
[ ] Mensagem de commit segue padrão fix/feat/chore/docs/refactor(scope)
[ ] Não avançou escopo bloqueado (V1.5, 007+, IA, marketplace)
```

## Variáveis de ambiente (backend)

```bash
# backend/.env (nunca commitar)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # ou SUPABASE_SECRET_KEY (compatibilidade)
DEFAULT_EMPRESA_ID=...
API_ACCESS_TOKEN=...            # Bearer token para auth de perímetro
PORT=3000
```

**PENDENTE (Tarefa A):** `API_ACCESS_TOKEN` deve ser definido no Render com valor gerado por:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Arquitetura de auth atual (V1.4.1)

```text
Frontend → Authorization: Bearer <API_ACCESS_TOKEN> → backend/src/middleware/auth.js → requireAuth()
                                                                        ↓
                                                      token válido → next()
                                                      token inválido → 401
                                                      /api/health → bypass (200 sempre)
```

**NÃO é autenticação final.** É perímetro mínimo. Multi-tenant e JWT Supabase são decisão futura bloqueada.

## Tarefas autorizadas agora

1. **Tarefa A** — Configurar `API_ACCESS_TOKEN` no Render + redeploy + validação. Ver `docs/audit_global/11_PRODUCTION_DEPLOYMENT_TAREFA_A.md`.
2. **Tarefa B** — Rotação de segredos + remoção de PII do histórico. Ver `docs/audit_global/12_PRODUCTION_DEPLOYMENT_TAREFA_B.md`.
3. **Débitos técnicos V1.4** que não exijam migration (ex: campo `actor` via payload, busca paginada de clientes).

## Tarefas bloqueadas

```text
V1.5 — BLOQUEADO
Migrations 007+ — BLOQUEADO
Escala global / multi-tenant — BLOQUEADO
IA operacional — BLOQUEADA
Marketplace — BLOQUEADO
App nativo do cliente — BLOQUEADO
```
