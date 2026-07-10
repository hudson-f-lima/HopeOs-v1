# 07 — Hotfix P0: Registro de Conclusão e P0 Remanescentes

**Data:** 2026-07-10
**Escopo:** registrar o status do hotfix P0 do ciclo V1.4 (renderers do Dashboard + service worker unificado) e listar P0 remanescentes encontrados pela auditoria global.

---

## PARTE A — ESTADO REAL ATUAL

### A.1 Hotfix P0 do V1.4 — **CONCLUÍDO E VALIDADO EM PRODUÇÃO (2026-07-10)** — REAL

| Item | Detalhe |
|---|---|
| Commit do hotfix | `c60f6fd` — `hotfix(v1.4-p0): implementar renderers do Dashboard e unificar service worker` |
| Commit de registro | `95eddb3` — `docs(v1.4): mark hotfix P0 validated in production` |
| Problema original | Auditoria de 2026-07-10 encontrou o Dashboard Insights quebrado (4 renderers ausentes) e service workers divergentes (v1-4-1 vs v1-4-2) |
| Correção 1 | 4 renderers implementados: `renderOccupancy`, `renderMoney`, `renderMargin`, `renderPeople` |
| Correção 2 | Service worker unificado: `CACHE_NAME = 'hope-os-shell-v1-4-3'` em raiz e `frontend/` |

### A.2 Evidências verificadas (código e produção)

| Evidência | Verificação | Classificação |
|---|---|---|
| Renderers existem | `js/ui/dashboard.js:122-265` — os 4 renderers definidos; exibem exclusivamente `state.insights.*` dos endpoints `/insights/*`, zero cálculo client-side | REAL |
| Alvos DOM existem | `index.html:239, 249, 259, 269` — 4 containers dos cards do dashboard bento | REAL |
| Progressive rendering | `Promise.allSettled` em `dashboard.js:340-345` — cada card renderiza independente | REAL |
| SW unificado | `service-worker.js` (raiz) e `frontend/service-worker.js` **idênticos byte a byte** (SHA256 `6504e541...2788f3`), `CACHE_NAME = 'hope-os-shell-v1-4-3'` (linha 2) | REAL |
| SW registrado corretamente | `js/app.js:233-234` registra o SW da raiz (o servido pelo GitHub Pages) | REAL |
| MANIFEST_SHA256.txt | Regenerado no próprio hotfix; 14/14 hashes conferidos vs arquivos reais; working tree limpo | REAL |
| Backend gates | `npm run test:gate` — **73/73 verdes** | REAL |

### A.3 Critérios de aceite do smoke test em produção (GitHub Pages) — TODOS CONFERIDOS

| Critério | Resultado |
|---|---|
| SW v1-4-3 ativo no PWA publicado | ✅ Confirmado |
| Card Ocupação renderiza dado real | ✅ 755 min |
| Card Caixa renderiza dado real | ✅ R$ 667,77 |
| Card Ticket renderiza dado real | ✅ R$ 74,89 |
| Card Rebooking renderiza dado real | ✅ 14,3% |
| 3 reloads consecutivos sem erro no console | ✅ Confirmado |

**Veredicto: hotfix P0 CONCLUÍDO, validado em produção. Nenhuma ação pendente sobre este item.**

### A.4 P0 remanescentes encontrados pela auditoria global (NÃO cobertos por este hotfix)

O hotfix acima resolveu os P0 **funcionais** do ciclo V1.4. As auditorias de segurança/backend/SQL identificaram P0 de **perímetro** que permanecem abertos:

| # | P0 remanescente | Evidência | Classificação | Ação requerida |
|---|---|---|---|---|
| 1 | API pública **sem autenticação** — qualquer pessoa lê/escreve dados reais e fecha checkouts financeiros | `backend/src/app.js` sem nenhum middleware de auth; ~41 rotas sem guard | **CRÍTICO (P0)** | Auth JWT (Supabase Auth) + tenant do token, antes de qualquer deploy adicional — ver `06_SECURITY_AUTH_RLS_AUDIT.md` |
| 2 | Exposição da base de 1481+ clientes (PII: nome+whatsapp+observações) via `GET /clientes` sem auth — incidente LGPD reportável | `backend/src/routes/index.js:85` | **CRÍTICO (P0)** | Depende do item 1 |
| 3 | PII real trackeada no git (`data/clientes.json`, `data/backups/export-*.json`) | 15 arquivos em `data/` | **CRÍTICO (P0/P1)** | Remover do versionamento + reescrever histórico |
| 4 | Segredos vivos em `backend/.env` dentro do zip distribuído (`SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `GH_TOKEN`, deploy hook Render) | `backend/.env` (git-ignored, mas presente no zip) | **CRÍTICO (P0 se o zip for compartilhado)** | Rotacionar todos os segredos |

Achados de severidade menor (não-P0, registrados nos demais documentos da auditoria): rate limit ausente (P1), CORS por substring (P1), DELETE do service_role no ledger (P1), `renderActionStrip` stub (MOCKADO baixo impacto), idempotência de estoque/waitlist ausente (PARCIAL), drift documental README/AGENTS ainda com "EM VALIDAÇÃO" (DESATUALIZADO).

**Nenhum P0 funcional aberto no frontend/PWA** — split payment REAL e completo, dashboard REAL, SW correto, MANIFEST íntegro.

---

## PARTE B — VISÃO FUTURA

- Os P0 remanescentes (§A.4) formam o gate de entrada do próximo ciclo (E1): auth + tenant do token + saneamento de PII/segredos, **antes** de qualquer feature nova.
- Nenhum deles requer migration; itens estruturais do banco (append-only físico, estorno, actor_id) dependem da faixa 007+ — **BLOQUEADO** até decisão explícita do usuário.

---

*Documento gerado pela auditoria global de 2026-07-10. Fontes: commits `c60f6fd`/`95eddb3`, corpus das auditorias frontend, backend, SQL, docs e segurança.*
