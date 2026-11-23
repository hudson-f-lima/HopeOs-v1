# 06 — Auditoria de Segurança / Auth / RLS / LGPD (Global)

**Data:** 2026-07-10
**Escopo:** backend Node/Express (`backend/src/`), banco Supabase (migrations 001–006), PWA (GitHub Pages), segredos e conformidade LGPD.
**Método:** leitura direta de código e migrations; classificações REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO / BLOQUEADO.
**Regra deste documento:** o **estado real atual** e a **visão futura (alvo)** estão em seções separadas. Nada da visão futura existe hoje.

---

## PARTE A — ESTADO REAL ATUAL (verificado em 2026-07-10)

### A.1 Autenticação e Autorização — CRÍTICO

| Superfície | Evidência | Classificação |
|---|---|---|
| Autenticação de API | `backend/src/app.js` (52 linhas): apenas `cors`, `express.json`, `morgan` — **nenhum middleware de auth**. Zero ocorrências de token/JWT/apikey em `backend/src` (grep confirmado) | **CRÍTICO — inexistente** |
| Autorização por rota | `backend/src/routes/index.js` — ~41 rotas (GET/POST/PATCH/PUT em /clientes, /checkout/close, /produtos/:id/estoque/ajuste, /agenda, /lista-espera, /insights/*) todas sem guard | **CRÍTICO — inexistente** |
| Multi-tenant | Tenant fixo por env: `DEFAULT_EMPRESA_ID` (`backend/src/config/env.js:19`), injetado no construtor do repositório | HARDCODED |
| "Qualquer pessoa pode chamar a API?" | **SIM.** Backend público em `https://hopeos-v1.onrender.com/api` (URL em `config.json` servido pelo GitHub Pages). Qualquer cliente HTTP pode: ler todos os clientes (nome+whatsapp+observações), criar/alterar cadastros, **fechar checkouts financeiros reais** (`POST /checkout/close`), ajustar estoque, mudar status de agenda | **CRÍTICO (P0)** |

**Furos de escopo de tenant (latentes — viram vazamento no 2º tenant):**

| Rota | Defeito | Evidência |
|---|---|---|
| `GET /clientes` | `list('clientes')` sem filtro `empresa_id` | `routes/index.js:86` |
| `GET /agenda` | filtro só por `data` | `routes/index.js:288-292` |
| `PATCH /agenda/:id/duracao` | `repo.update()` sem escopo de empresa nem `validateUUID` | `routes/index.js:392-396` |
| `POST /checkout/close` (vínculo agenda) | update de agendamento sem escopo/UUID | `routes/index.js:437-440` |
| `insert()` genérico | aceita `payload.empresa_id` do body como override do tenant | `SupabaseRepository.js:50` |

Classificação do conjunto: **CRÍTICO (latente)** — hoje mascarado pelo single-tenant.

### A.2 RLS e permissões no banco

| Item | Evidência | Classificação |
|---|---|---|
| RLS habilitado nas 16 tabelas | `supabase/migrations/001_init.sql:269-284` | REAL |
| Policies RLS | **ZERO `create policy`** em 001–006. Modelo default-deny para `anon`/`authenticated`; só `service_role` (bypassa RLS) acessa | REAL/PARCIAL por design — coerente com "backend é a verdade", mas transfere 100% da segurança para uma API sem auth |
| RPCs travadas | `003_lock_rpc_permissions.sql:287-290` e `006:86-89,160-163,276-279,383-386` — REVOKE public/anon/authenticated, GRANT só service_role. Testes `rpc-permission-lock` verdes (73/73) | REAL |
| `service_role` no frontend | Grep em `index.html`, `js/`, `config.json`: nenhuma key. `config.json` só tem `apiBase` | REAL (não exposto) |
| DELETE concedido ao service_role em TODAS as tabelas, incluindo ledger | `004_service_role_table_grants.sql:20` + cascades (`comando_itens`, `comando_pagamentos`, `comando_gorjetas`) | **CRÍTICO estrutural** — append-only é convenção de aplicação, não regra física (sem trigger, sem REVOKE seletivo) |
| Janela histórica 002→003 | 002 criou `checkout_close` SECURITY DEFINER sem REVOKE (default EXECUTE a PUBLIC); fechado pela 003 | CRÍTICO histórico, fechado |
| `checkout_close` não revalida totais | RPC persiste `p_preview->totals` sem recalcular somas; `forma_code` sem FK | CRÍTICO como defesa em profundidade (mitigado: só service_role executa) |

**Veredicto:** a afirmação "RLS e permissões travadas: REAL" é verdadeira no nível SQL, porém **enganosa como postura de segurança** — a única credencial que importa (service_role) roda atrás de uma API sem porteiro.

### A.3 Segredos

| Item | Evidência | Severidade |
|---|---|---|
| `backend/.env` presente no zip distribuído com `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `GH_TOKEN`, `SUPABASE_ACCESS_TOKEN` e URL de deploy hook do Render com key embutida | Arquivo existe (13 linhas), git-ignored — mas o zip circula com todos os segredos | **P0 se o zip for compartilhado** — rotacionar tudo |
| `.mcp.json` raiz | `SUPABASE_ACCESS_TOKEN: sb_publishable_...` (publishable, baixo risco; não trackeado) | P2 |
| `backend/db_push.log` | Limpo (0 hits de password/key/token) | REAL |
| Typo de env: `env.js:18` lê `SUPABASE_SERVICE_ROLE_KEY`, `.env` local define `SUPABASE_SECRET_KEY` | Boot local falharia; produção (Render) define a var correta | PARCIAL / P2 |

### A.4 CORS / Headers / Rate limit

| Item | Evidência | Classificação |
|---|---|---|
| CORS | `app.js:12-30`: aceita origin `null`/undefined; qualquer `localhost`/`127.0.0.1`; qualquer IP RFC1918; match por **substring** (`origin.includes('hudson-f-lima.github.io')` casa também `hudson-f-lima.github.io.evil.com`) | PARCIAL/HARDCODED — bypass trivial (P1; irrelevante enquanto não há auth por cookie) |
| Helmet / CSP / HSTS | Ausentes (sem helmet no package.json, nenhum header de segurança) | **MOCKADO/ausente** (P1) |
| Rate limit / anti-brute-force | Nenhum (`express-rate-limit` ausente). API pública sem throttle | **CRÍTICO (P1)** |
| WAF | Inexistente (Render sem WAF configurado) | AUSENTE (P1) |
| Body limit | `express.json({limit:'5mb'})` — presente, mas generoso | REAL/PARCIAL |
| CSP no PWA | Nenhum `<meta http-equiv="Content-Security-Policy">`; GitHub Pages não permite headers customizados | P2 |

### A.5 LGPD

Dados pessoais em `clientes`: `nome`, `whatsapp`, `observacoes` (texto livre — risco de dado sensível), `faltas`, `ativo`. Volume real: **1481+ clientes**.

| Requisito | Estado atual | Severidade |
|---|---|---|
| Acesso não autorizado | Sem auth, `GET /clientes` expõe a base inteira (nome+whatsapp) a qualquer requisitante → **incidente LGPD reportável** | **P0** |
| PII versionada no git | `data/clientes.json` e `data/backups/export-*.json` com nomes reais **trackeados no repositório** (15 arquivos em `data/`) | **P0/P1** |
| Base legal / consentimento | Inexistente no código | P1 |
| Direitos do titular (art. 18) | Sem rota de eliminação/anonimização por titular; desativação `ativo=false` (soft-delete por design) **conflita com direito de eliminação**; export só admin-wide (`/snapshot`, sem auth) | P1 |
| Minimização | `observacoes` texto livre sem controle | P2 |

### A.6 Logs

`morgan('dev')` (`app.js:34`): formato de dev em produção, sem estrutura, sem redaction; handler global faz `console.error(err)` podendo logar payloads com dados de cliente. Sem logs imutáveis, sem trilha de autoria (`actor_id` AUSENTE em 100% das tabelas). Classificação: PARCIAL (P2), autoria **INEXISTENTE**.

### A.7 Ranking consolidado de riscos

| # | Risco | Sev | Onde |
|---|---|---|---|
| 1 | API pública **sem autenticação** — leitura/escrita de dados reais e fechamento de checkouts por qualquer pessoa | **P0** | `app.js`, `routes/index.js`, `config.json` |
| 2 | Exposição da base de clientes (PII) a qualquer requisitante — incidente LGPD | **P0** | `routes/index.js:85` |
| 3 | PII real trackeada no git (`data/*.json`) | **P0/P1** | `data/` |
| 4 | Segredos vivos no `.env` dentro do zip distribuído | **P0 se compartilhado** | `backend/.env` |
| 5 | Zero rate limit → scraping/DoS/abuso de escrita | **P1** | `app.js` |
| 6 | Sem Helmet/CSP/HSTS/WAF | **P1** | `app.js` |
| 7 | Sem eliminação por titular (art. 18) | **P1** | `routes/index.js` |
| 8 | CORS permissivo (origin null, substring match, RFC1918) | **P1** | `app.js:12-30` |
| 9 | Sem base legal/consentimento LGPD | **P1** | — |
| 10 | DELETE do service_role no ledger + cascades (append-only não físico) | **P1** | `004:20`, `001` |
| 11 | Typo de env service role key | **P2** | `env.js:18` |
| 12 | `morgan('dev')` sem redaction; sem actor_id | **P2** | `app.js:34` |

**Veredicto do estado atual:** o banco (RLS deny-all + RPC locks + grants) é REAL e bem-feito; a aplicação em volta é **CRÍTICA — sem porteiro**. LGPD: não conforme (P0 por exposição + PII no git).

---

## PARTE B — VISÃO FUTURA (ALVO) — NADA DISTO EXISTE HOJE

Roadmap de segurança. Itens marcados E1 são pré-condição para o segundo cliente pagante; E2/E3 são evolução. Qualquer tabela/coluna nova depende de migration 007+ (**BLOQUEADO** até decisão explícita do usuário).

| Camada | Alvo | Passo mínimo (E1) | Estágio |
|---|---|---|---|
| IdP | Supabase Auth (já no stack); Auth0/Keycloak se enterprise exigir SSO/SAML | Supabase Auth | E1 |
| Token de acesso | JWT curto **5–15 min**, claims: `sub`, `empresa_id`, `unidade_id?`, `role` | Middleware Express verificando JWT (`SUPABASE_JWKS_URL` já existe no `.env`); `empresa_id` do claim → `SupabaseRepository` (elimina `DEFAULT_EMPRESA_ID`) | E1 |
| Refresh token | Rotação com detecção de reuso; revogação server-side | Supabase Auth já entrega | E1 |
| MFA | TOTP obrigatório para roles `owner`/`gerente` | — | E2 |
| RBAC | `owner` > `gerente_unidade` > `recepcao` > `profissional`; mapa rota×role em middleware/gateway | 2 roles (owner/staff) | E1→E2 |
| ABAC / permissão por unidade | Claims `unidade_id`, `franquia_id` para escopo fino (profissional vê só a própria agenda) — depende da decisão de modelagem de unidade (migration 007) | Só a decisão de modelagem | E2/E3 |
| Rate limit | `express-rate-limit` por IP+token; limites agressivos em rotas de escrita financeira | Instalar em E1 (custo ~horas) | E1 |
| WAF | WAF/edge (Cloudflare ou equivalente) na frente do Render | — | E2 |
| Headers | Helmet (CSP, HSTS, nosniff, frame-ancestors) no Express | E1 | E1 |
| CORS | Whitelist exata de origens (comparação por igualdade, não substring); rejeitar `origin: null` em produção | E1 | E1 |
| Logs imutáveis / auditoria | Tabela `access_log(actor, empresa_id, rota, ip, ts)` append-only + `actor_id` em toda escrita (destrava débito do ajuste de estoque); logging estruturado com redaction de PII | E1 (barato) | E1 |
| Append-only físico do ledger | Trigger `BEFORE UPDATE/DELETE` + REVOKE seletivo de DELETE nas tabelas de ledger; tipos de estorno por lançamento compensatório | Migration 007+ (BLOQUEADO) | E2 |
| LGPD | Base legal registrada, rota de exportação/eliminação-anonimização por titular, remoção de `data/*.json` do git (com reescrita de histórico) e rotação de segredos | Remoção de PII do git + rotação: **imediato, antes de qualquer deploy** | E1 |

### Sequência recomendada (uma prioridade por vez)

1. **Imediato (pré-deploy adicional):** rotacionar segredos do `.env` distribuído; remover `data/*.json` com PII do versionamento.
2. **E1:** auth JWT + tenant derivado do token + fechar os 5 furos de escopo (§A.1) + rate limit + Helmet + CORS estrito + `access_log`/actor.
3. **E2:** MFA, WAF, RBAC completo, append-only físico do ledger, permissão por unidade (pós-decisão migration 007).

---

*Documento gerado pela auditoria global de 2026-07-10. Fontes: código em `backend/src/`, `supabase/migrations/001–006`, PWA raiz; corpus das auditorias de segurança, backend, SQL e escalabilidade.*
