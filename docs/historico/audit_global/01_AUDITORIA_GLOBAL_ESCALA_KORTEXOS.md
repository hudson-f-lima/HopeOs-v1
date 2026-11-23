# 01 — AUDITORIA GLOBAL CONSOLIDADA & ESCALA — HOPE OS V1.4 → KortexOS

**Data:** 2026-07-10
**Escopo:** Frontend/PWA, Backend Node/Express, Banco/SQL (migrations 001–006), Documentação, Segurança/LGPD, Escalabilidade global.
**Método:** Auditoria brutal com classificação REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO / BLOQUEADO, baseada em evidência direta de código (não em documentação).
**Regra do documento:** ESTADO REAL ATUAL sempre separado de VISÃO FUTURA. A seção "Roadmap/Visão" NÃO descreve nada que exista hoje.

---

## 0. Veredito executivo

O HOPE OS V1.4 é um **monolito Express single-process (Render) + 1 projeto Supabase + PWA estática (GitHub Pages)**, com núcleo financeiro **REAL e bem defendido contra o frontend** (checkout preview/close, ledger distribuído, comissão, estoque via RPC atômica e idempotente, insights read-only), porém com **perímetro externo CRÍTICO/inexistente**: a API não tem autenticação nem rate limit e opera com `service_role`.

- O que já nasceu correto: schema multi-tenant (`empresa_id` em 16/16 tabelas), checkout idempotente e transacional, ledger em centavos inteiros, engines puras separadas de I/O, `frontendCalculates: false` cumprido.
- O que quebra primeiro **não é multi-tenant**: é o padrão "carregar tabela inteira em Node por request" (insights/snapshot) — quebra com UM tenant grande.
- Risco máximo hoje: **API pública sem porteiro** + **PII de 1481+ clientes exposta e trackeada no git** (incidente LGPD em potencial).

| Camada | Veredito global |
|---|---|
| Frontend/PWA | REAL — nenhum achado CRÍTICO; split payment REAL e completo |
| Backend rotas/engines | REAL no núcleo; CRÍTICO no perímetro (auth/rate limit) |
| Banco/SQL 001–006 | REAL; CRÍTICO em append-only não físico e validação interna do `checkout_close` |
| Documentação | Núcleo de governança REAL; drift concentrado em 4 famílias de achados |
| Segurança/LGPD | CRÍTICO — não conforme |
| Escala | Fundação física correta; runtime a ~3 ordens de grandeza da hipótese de escala |

---

## 1. ESTADO REAL ATUAL — Inventário global por camada

### 1.1 Frontend / PWA (GitHub Pages)

Fatos verificados por evidência direta: service workers raiz e `frontend/` **idênticos byte a byte** (SHA256 `6504e541...2788f3`), `CACHE_NAME = 'hope-os-shell-v1-4-3'`; `MANIFEST_SHA256.txt` íntegro (14/14 hashes conferidos); 0 imports quebrados nos 10 módulos ES6; os 4 renderers do Dashboard e seus 4 alvos DOM existem.

| Módulo | Classificação | Evidência resumida |
|---|---|---|
| `index.html` (664 l.) | REAL | Abas, dashboard bento, split UI, rebooking, waitlist, toast |
| `js/api.js` | REAL | Tudo via `API_BASE` (`config.json`), timeout 30s, endpoints 1:1 com backend |
| `js/app.js` | REAL | Boot ordenado, fatal error screen, SW raiz registrado (o correto/unificado) |
| `js/state.js` / `js/utils.js` | REAL | Estado puro + formatação; zero regra financeira |
| `js/ui/checkout.js` — split payment | **REAL — COMPLETO** | `buildSplitPayments()` envia N payments reais; última linha = restante derivado do total do backend; edição pós-preview invalida payload. Débito CRÍTICO do V1.3 ("split fake") **quitado** |
| `js/ui/checkout.js` — pagamento único | PARCIAL (nota) | Única aritmética monetária client-side: soma para preencher intenção; backend revalida no preview |
| `js/ui/dashboard.js` | REAL | 4 renderers exibem exclusivamente `state.insights.*`; progressive rendering via `Promise.allSettled`; zero cálculo |
| `js/ui/dashboard.js` — `renderActionStrip` | **MOCKADO/STUB** | Casca vazia com TODO; section `dashboardActionStrip` permanentemente vazia |
| `js/ui/agenda.js` | REAL | Timeline, conflitos, reliability badge, waitlist — tudo via API; ocupação falsa REMOVIDA (mostra `—`) |
| `js/ui/agenda.js` — donut `dayOccRing` | PARCIAL (UI morta) | Fixado em 0; honesto, mas decorativo morto |
| `js/ui/cadastros.js` | REAL | CRUD via API, `ativo=false` sempre; busca de clientes real com corte 20/50 (não é paginação verdadeira, aceitável) |
| `js/ui/toast.js` | REAL | Sem `alert()`, fila limite 3, no SW cache |
| `css/app.css` | REAL | Hex hardcoded em day pills — cosmético (HARDCODED leve) |
| `service-worker.js` | REAL | Network-first p/ documentos; `/api/*` e não-GET nunca cacheados |
| `config.json` | REAL/HARDCODED (por design) | `apiBase` prod Render; override `?apiBase=` |
| `frontend/` (exceto SW) + `index.pre-merge-v1.1.backup.html` | LEGADO/MORTO | Arquivos não referenciados; backup exposto na raiz publicável do Pages |

**Violação da regra-mãe (frontend calculando financeiro): NENHUMA.** Comissão, margem, taxa, repasse, ocupação e ticket médio são 100% exibição de payload do backend.

### 1.2 Backend Node/Express (Render)

| Rota / eixo | Classificação | Observação-chave |
|---|---|---|
| `GET /health`, `/data-contract`, `/catalog`, `/insights/*` (7 rotas) | REAL | Insights read-only confirmado por grep (zero writes nos services V1.4) |
| `/snapshot`, `/dashboard`, `/financeiro/resumo` | REAL | Full-table load de 16 tabelas por request — O(n), sem cache; degradará com volume |
| CRUD clientes/serviços/profissionais/produtos/formas-pagamento | REAL | Validadores robustos; `overrides` bloqueado no genérico; PATCH escopados |
| `GET /clientes` | PARCIAL | **Sem filtro `empresa_id`** — inconsistente com as demais GETs |
| `POST /produtos/:id/estoque/ajuste` | REAL/PARCIAL | RPC atômica (`FOR UPDATE`), mas **sem idempotência e sem actor** — retry duplica |
| `GET /agenda` | PARCIAL | Filtro só por `data`; sem `empresa_id`; sem `data` retorna tabela inteira |
| `POST /agenda` | REAL/PARCIAL | Conflito via read-then-insert (**TOCTOU**); sem idempotência |
| `PATCH /agenda/:id/status` (reagendar) | PARCIAL | Insert novo + update antigo **sem transação** — falha no meio deixa duplicado ativo |
| `PATCH /agenda/:id/duracao` | PARCIAL | Sem `validateUUID`, update não escopado por empresa |
| `POST /checkout/preview` e `/close` | REAL | Resolver server-side; validator bloqueia 30+ campos financeiros; RPC transacional; vínculo agenda pós-RPC best-effort sem escopo/UUID |
| `GET/POST/PATCH /lista-espera` | REAL/PARCIAL | Validadores reais; **sem dedup/idempotência** |
| **Autenticação** | **CRÍTICO — INEXISTENTE** | Nenhum middleware; toda a `/api/*` é pública, com `service_role` atrás |
| **Rate limiting** | **CRÍTICO — INEXISTENTE** | Nenhum throttle |
| CORS | PARCIAL/frouxo | `origin.includes(...)` (match por substring — bypass trivial); aceita `origin: null` |
| `service_role` | REAL — não exposto | Backend-only; nada vaza pelas rotas |
| Idempotência checkout | REAL | Chave + índice único parcial + race handling `23505` — sólido |
| Idempotência estoque/waitlist/agenda | MOCKADO (inexistente) | Nenhuma chave aceita |
| `actor_id` / `command_id` | INEXISTENTE | Zero ocorrências em `src` e migrations — nenhuma escrita registra autoria |
| P0001 → 422 | REAL | Mapeamento consistente |
| CommissionEngine | REAL | 0–100% forçado; comissão negativa bloqueada |
| `SupabaseRepository.list()` paginação | REAL | Ressalva: sem `order()` — PARCIAL sob escrita concorrente |
| Error handler / logs | REAL/PARCIAL | `console.error` pode logar PII; `morgan('dev')` em produção |

**Testes:** `npm run test:gate` = **73/73 verdes** (6 suítes). Lacunas: zero testes de auth/CORS/rate-limit (features não existem), concorrência (TOCTOU) e idempotência de estoque.

### 1.3 Banco / SQL (supabase/migrations 001–006)

| Item | Classificação |
|---|---|
| 16 tabelas + índices + RLS habilitado em todas (001) | REAL |
| Policies RLS: **ZERO** (deny-all p/ anon; service_role bypassa) | REAL/PARCIAL por design — aceitável no modelo "backend é a verdade", mas 100% da segurança depende de uma API sem auth |
| `checkout_close` (002/003): atômica + idempotente em duas camadas | REAL — sólido |
| `checkout_close`: validação financeira interna | **CRÍTICO** — persiste `p_preview->totals` sem recalcular somas, sem FK de `forma_code`, sem checagem preço≥custo no checkout; a verdade matemática mora só no Node |
| Janela histórica 002→003 (EXECUTE público em SECURITY DEFINER) | CRÍTICO histórico — fechado pela 003 |
| 003 duplica o corpo inteiro da 002 | PARCIAL — duas fontes de verdade da mesma função |
| **DELETE concedido ao service_role em TODAS as tabelas, inclusive ledger** + `on delete cascade` em itens/pagamentos/gorjetas | **CRÍTICO estrutural** — append-only é convenção, não regra física (sem trigger, sem REVOKE seletivo) |
| Estorno por lançamento compensatório | **AUSENTE** em todas as camadas (sem tipo 'estorno' em caixa/estoque; `comandos.status` text livre) |
| RPCs 006 (estoque, vínculos, override, criar produto) | REAL — atômicas e travadas; ajuste de estoque **sem idempotência/actor** (PARCIAL) |
| `empresa_id` em 16/16 tabelas com FK e índices tenant-first | REAL — melhor ativo de escala do projeto |
| `unit_id`/`tenant_id` distinto/`actor_id`/`command_id` | **AUSENTES** — gap estrutural para multiunidade e auditoria de autoria |
| Audit trail | PARCIAL — só `agendamento_eventos` (tabela **MOCKADA**: nada escreve nela) + `comandos.snapshot` |
| SQL 007+ | **BLOQUEADO** — planejado só em docs, nenhum `.sql` físico (coerente com governança); faixa 046–060 obsoleta sem conflito real |
| Cópia desatualizada de 001–005 em `_ai_index/` | PARCIAL — risco documental (agente pode ler a cópia errada) |

### 1.4 Documentação (drift doc × código)

| # | Achado | Classificação |
|---|---|---|
| D1 | README, AGENTS.md e Session Handoff ainda dizem "HOTFIX P0 EM VALIDAÇÃO"; CLAUDE.md e commit `95eddb3` confirmam VALIDADO | DESATUALIZADO (P0 de drift) |
| D2 | Contagens de teste contraditórias (76/134 vs 73) — realidade: 73/73 | HARDCODED/DESATUALIZADO |
| D3 | "21 testes de waitlist" (CLAUDE.md) sem arquivo dedicado — cobertura só dentro do cadastros-gate | PARCIAL — rotas REAIS, número não comprovado |
| D4 | `docs/API_CONTRACT.md` é V1.0.3 (só checkout, ~10% da API atual) e o INDEX o lista como ATIVO | **OBSOLETO não marcado — a mentira mais perigosa do repo para agentes novos** |
| D5 | `docs/DATA_CONTRACT.md` idem | DESATUALIZADO/LEGADO não marcado |
| D6 | AGENTS.md aponta backend em `server/` — real é `backend/src/` | HARDCODED errado |
| D7 | `QA_V1_4_CHECKLIST.md` com todos os checkboxes vazios apesar de F5 "concluída" | PARCIAL |
| D8 | Handoff cita `walkthrough.md` inexistente | Referência quebrada |
| D9 | INDEX datado 2026-07-09, não reflete hotfix | DESATUALIZADO leve |
| — | `_ai_index/` = bolsão de documentos paralelos divergentes (viola INDEX §7), incl. blueprint V1.2 divergente e snapshot de repo inteiro | LEGADO NÃO MARCADO |

### 1.5 Segurança / LGPD

| # | Risco | Severidade |
|---|---|---|
| 1 | API pública **sem autenticação** — qualquer um lê/escreve dados reais e fecha checkouts | **P0 / CRÍTICO** |
| 2 | `GET /clientes` expõe base inteira (nome+whatsapp+observações, 1481+) — incidente LGPD reportável | **P0 / CRÍTICO** |
| 3 | PII real trackeada no git (`data/clientes.json`, `data/backups/export-*.json`) | **P0/P1** |
| 4 | Segredos vivos em `backend/.env` dentro do zip distribuído (Supabase secret, DB password, GH_TOKEN, Render deploy hook) — rotacionar | **P0 se compartilhado** |
| 5 | Zero rate limit | P1 |
| 6 | Sem Helmet/CSP/HSTS | P1 (MOCKADO/ausente) |
| 7 | Sem exportação/eliminação por titular (art. 18); soft-delete não satisfaz eliminação | P1 |
| 8 | CORS permissivo (substring, `origin: null`, RFC1918 liberado) | P1 |
| 9 | Sem base legal/consentimento LGPD | P1 |
| 10 | Typo env `SUPABASE_SERVICE_ROLE_KEY` vs `SUPABASE_SECRET_KEY` | P2 |
| 11 | `morgan('dev')` sem redaction | P2 |

RLS + grants + RPC locks no banco: REAL e bem-feitos — mas inúteis como barreira, pois a única credencial que importa roda atrás de uma API sem porteiro. A afirmação "RLS travada: REAL" é verdadeira no nível SQL, **enganosa como postura de segurança**.

### 1.6 Escalabilidade — o que quebra primeiro (estado real)

| Gargalo | Evidência | Classificação |
|---|---|---|
| Agregação de insights O(n×m) em Node, tabelas inteiras sem filtro de data + paginação sequencial 1000/1000 via HTTP | `InsightsService`/`RetentionService`; 1 salão com 2–3 anos de história já bloqueia o event loop (checkout para durante o cálculo) | **CRÍTICO — primeiro incêndio, com UM tenant** |
| `loadCheckoutContext` recarrega 5 tabelas de catálogo por preview/close, sem cache | `SupabaseRepository.js:201-210` | PARCIAL |
| Tenant fixado por env (`DEFAULT_EMPRESA_ID`) | `env.js:19` | HARDCODED |
| 5 furos de escopo cross-tenant latentes (`GET /clientes`, `GET /agenda`, `PATCH duracao`, vínculo agenda no close, `insert()` aceita `empresa_id` do body) | `routes/index.js` / `SupabaseRepository.js:50` | **CRÍTICO latente** — vira vazamento no 2º tenant; service_role anula RLS |
| Node single-process, sem cluster/worker | `server.js` | PARCIAL |
| Funil de conexões: PostgREST pool (~10) → ~10–15 tx simultâneas efetivas | `supabaseClient.js` (HTTP, sem conexão direta) | PARCIAL |
| `agendamento_eventos` sem nenhum write | tabela morta | MOCKADO |
| Multiunidade/franquia (`unidade_id`, hierarquia) | não modelado | BLOQUEADO (inexistente) |

O que já nasce correto (não refazer): `empresa_id` universal com índices tenant-first, idempotência de comando (o "command_id" de fato já existe), checkout transacional com lock no banco, ledger append-only em centavos, engines puras → services → repository (extração futura é refactor, não rewrite), PWA em CDN.

---

## 2. Achados consolidados por severidade

### P0 — agir agora (taxonomia alinhada com os docs 07 §A.4 e 10; correção Red Team 2026-07-10)
1. API sem autenticação (e sem rate limit), operando com `service_role` — toda escrita financeira aberta à internet.
2. Exposição de PII (base de 1481+ clientes) via `GET /clientes` público — incidente LGPD reportável.
3. PII real versionada no git (`data/clientes.json`, `data/backups/export-*.json`).
4. Segredos vivos no `.env` dentro do zip distribuído — rotacionar.

### CRÍTICO estrutural (severidade CRÍTICO, prioridade P1 — coerente com docs 03 §1.4 e 06 §A.7; não é o gate imediato)
5. `checkout_close` confia cegamente no `p_preview` — chamador direto com service_role grava qualquer número (mitigado hoje: só o backend detém service_role).
6. DELETE do service_role no ledger + cascades — edição destrutiva fisicamente possível; estorno inexistente.
7. Insights em Node O(história)×O(história) — degradação já iminente com o tenant atual.
8. Furos de escopo de tenant (

### PARCIAL (P1)
- Ajuste de estoque/waitlist/agenda sem idempotência; POST /agenda com TOCTOU; reagendamento não transacional.
- Ausência total de `actor_id` — auditoria de autoria impossível.
- CORS por substring; sem Helmet/CSP; sem direitos do titular LGPD.
- Drift documental D1–D3, D6–D7 (status stale, números de teste sem lastro, path errado).
- `list()` sem `order()`; `parseInt(days)` NaN; 003 duplicando corpo da 002.

### MOCKADO
- `renderActionStrip` (dashboard) — stub vazio com TODO.
- `agendamento_eventos` — tabela morta, zero writes.
- Idempotência fora do checkout — inexistente.

### HARDCODED
- `DEFAULT_EMPRESA_ID` por env; CORS `hudson-f-lima.github.io` por substring; `apiBase` no `config.json` (por design); hex nos day pills e `SEGMENT_COLORS` não usado (código morto, cosmético).

### LEGADO/OBSOLETO (higiene)
- `_ai_index/` inteiro (não marcado), `frontend/` exceto SW, `index.pre-merge-v1.1.backup.html` na raiz publicável, `_ai_inbox/` sem índice.

### BLOQUEADO (correto por governança)
- SQL 007+ (planejado, sem arquivo físico); multiunidade; faixa 046–060 obsoleta.

---

## 3. VISÃO FUTURA (roadmap — NADA disto existe hoje)

### 3.1 Prioridades imediatas (pré-condição para o 2º cliente pagante, custo baixo)
1. **Auth mínima + tenant derivado do token** (Supabase Auth/JWT, middleware Express, `empresa_id` do claim injetado no repository) — ~1 dia; destrava tudo.
2. **Fechar os 5 furos de escopo** + remover override de `empresa_id` via payload; adicionar gate de isolamento de tenant ao `test:gate`.
3. **Insights em SQL agregado** (`WHERE empresa_id AND data BETWEEN`, views/RPCs read-only) — único item de performance que já dói no tenant atual.
4. Outbox: tabela `eventos` genérica escrita DENTRO das RPCs transacionais (migration 007).
5. Decisão de modelagem de unidade (empresa=unidade + `grupo_franquia_id` vs `unidade_id`) — decidir agora, implementar depois.
6. Cache de catálogo no checkout; actor + idempotência no ajuste de estoque.
7. Segurança complementar: rate limit, Helmet, CORS por igualdade exata, remover PII do git + rotacionar segredos, rotas LGPD art. 18.

### 3.2 Estágios de evolução
```
E0 (hoje)   Express único + Supabase único + tenant por env            [1 tenant]
E1 (V1.5–2) + auth/JWT + tenant por token + RLS + insights SQL + outbox [1–100 tenants]
E2          N réplicas + workers do outbox + PgBouncer + réplica de
            leitura + partição (empresa_id, data)                       [10²–10⁴]
E3          Extração por costura existente (checkout/agenda/insights
            services) + CDC → warehouse + células regionais             [10⁴–10⁵]
```

### 3.3 Sofisticação prematura (NÃO fazer agora)
Sharding/bancos regionais/silo (existe 1 tenant), microserviços/Kafka (outbox basta), API Gateway/BFF multi-região, multiunidade completa/IdP corporativo/ABAC fino (gate proibido do CLAUDE.md), CQRS/read-models materializados antes de medir.

---

## 4. Sequência recomendada (uma prioridade por vez)

1. Auth + tenant-do-token + fechar furos de escopo (inclui rotação de segredos e saneamento de PII no git).
2. Insights em SQL agregado.
3. Outbox nas RPCs + decisão de modelagem de unidade na migration 007 (quando desbloqueada por decisão explícita).
4. Só então: réplicas, partição e roadmap E2+.
