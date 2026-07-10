# 08 — DEV HANDOFF: Próximo Escopo (pós-auditoria global)

**Data:** 2026-07-10
**Origem:** Auditoria global (frontend, backend, SQL/banco, docs, segurança, escala) — `docs/audit_global/`
**Regra da casa:** uma prioridade por vez; básico antes do sofisticado.

---

## 1. Contexto (estado real, não visão)

O V1.4 está CONCLUÍDO e validado em produção. O núcleo financeiro (checkout preview/close, ledger distribuído, RPCs atômicas, idempotência de comando) foi auditado como **REAL**. Porém a auditoria de segurança encontrou achados **CRÍTICOS/P0** que tornam qualquer novo escopo de feature irresponsável antes da correção:

| # | Achado P0 | Evidência | Classificação |
|---|---|---|---|
| 1 | API pública **sem nenhuma autenticação** — qualquer cliente HTTP lê/escreve dados reais e fecha checkouts | `backend/src/app.js` (nenhum middleware de auth), `backend/src/routes/index.js` (~41 rotas sem guard) | CRÍTICO |
| 2 | Base de clientes (PII: nome + WhatsApp + observações, 1481+ registros) exposta via `GET /clientes` a qualquer requisitante — incidente LGPD reportável | `routes/index.js:85` | CRÍTICO |
| 3 | PII real versionada no git (`data/clientes.json`, `data/backups/export-*.json`) | 15 arquivos em `data/` | CRÍTICO |
| 4 | Segredos vivos (`SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `GH_TOKEN`, deploy hook do Render) no `backend/.env` dentro do zip distribuído | `backend/.env` (13 linhas) | CRÍTICO se o zip circular |

**O que NÃO entra neste escopo** (é P1/P2 ou visão futura — registrado, não executado agora): rate limit, Helmet/CSP, correção do CORS por substring, actor_id/idempotência de estoque, insights em SQL agregado, outbox/eventos, multiunidade, migration 007+. Esses itens permanecem no backlog do documento de escala/segurança e são BLOQUEADOS até este escopo fechar.

---

## 2. Próximo escopo: **V1.4.1 — Porteiro Mínimo (auth de API) + Higiene de Segredos**

Um único escopo, pequeno, executável e mensurável. Duas frentes que se completam em ~1–2 dias de trabalho.

### Tarefa A — Autenticação mínima na API (fecha P0 #1 e #2)

**O quê:** middleware Express que exige um token em todas as rotas `/api/*` (exceto `GET /api/health`).

**Como (menor passo que resolve):**
1. Criar `backend/src/middleware/auth.js`: valida header `Authorization: Bearer <token>` contra `process.env.API_ACCESS_TOKEN` (string secreta longa gerada agora). Sem token/token errado → `401 UNAUTHENTICATED`.
   - *Alternativa preferível se couber no prazo:* validar JWT do Supabase Auth via `SUPABASE_JWKS_URL` (já presente no `.env`). Se atrasar, o token estático entra primeiro — o middleware é o mesmo ponto de troca depois.
2. Registrar o middleware em `backend/src/app.js` antes das rotas; whitelist explícita: `GET /api/health` e `GET /`.
3. Frontend: `js/api.js` passa a enviar o header em todas as chamadas; token entregue ao PWA via `config.json` **não** (é público) — usar prompt de login simples que grava o token em `localStorage` (tela mínima, sem UI premium). O frontend continua sem calcular nada.
4. Definir `API_ACCESS_TOKEN` no Render; deploy.
5. Adicionar checks ao `test:gate`: (a) request sem token → 401; (b) request com token → 200; (c) `GET /health` sem token → 200.

**Explicitamente fora:** RBAC, multi-tenant por token, refresh, MFA — visão futura (E1/E2 do roadmap de escala).

### Tarefa B — Higiene de PII e segredos (fecha P0 #3 e #4)

1. Remover `data/clientes.json` e `data/backups/export-*.json` do versionamento (`git rm --cached` + `.gitignore`); mover os dados para local não versionado. (Reescrita de histórico git é decisão separada do usuário — registrar como pendência.)
2. **Rotacionar** no mesmo dia: `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `GH_TOKEN`, URL do deploy hook do Render. Atualizar só no Render/local, nunca em arquivo trackeado.
3. Corrigir o typo de env: `env.js:18` lê `SUPABASE_SERVICE_ROLE_KEY`, `.env` local define `SUPABASE_SECRET_KEY` — unificar nome.

---

## 3. Definition of Done (mensurável)

- [ ] `curl https://hopeos-v1.onrender.com/api/clientes` **sem** token retorna **401** (hoje retorna a base inteira).
- [ ] `curl .../api/checkout/close` sem token retorna **401**.
- [ ] `GET /api/health` sem token retorna **200**.
- [ ] PWA publicado no GitHub Pages opera normalmente após informar o token (smoke test: agenda carrega, checkout preview funciona, dashboard renderiza os 4 cards).
- [ ] `npm run test:gate` verde com os novos checks de auth (73 + ≥3 novos).
- [ ] `data/*.json` com PII fora do índice do git (`git ls-files data/` não lista PII).
- [ ] 4 segredos rotacionados e confirmados funcionando (deploy Render OK, backend conecta ao Supabase).
- [ ] `CLAUDE.md`, `README.md` e `AGENTS.md` atualizados **no mesmo commit** (regra do INDEX §9.4).

## 4. KPI do escopo

**Nº de rotas `/api/*` acessíveis sem credencial: de ~41 para 1 (`/health`).**
