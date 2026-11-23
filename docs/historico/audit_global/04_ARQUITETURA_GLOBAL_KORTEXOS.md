# 04 — Arquitetura Global KortexOS (Alvo)

**Data:** 2026-07-10
**Status:** ROADMAP / VISÃO FUTURA — **este documento NÃO autoriza execução.** Nenhuma tarefa, migration ou refactor deve ser iniciado com base neste arquivo sem decisão explícita do usuário. SQL futuro (007+) permanece **BLOQUEADO**.
**Fonte:** Auditoria Global 2026-07-10 (frontend, backend, SQL, docs, segurança, escalabilidade). Autoridade documental: `docs/INDEX.md`. Canônico estratégico: `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`.

---

## 1. Separação obrigatória: estado real × visão futura

### 1.1 Estado real hoje (E0) — verificado em código

| Componente | Realidade | Classificação |
|---|---|---|
| Backend | Monolito Express single-process no Render (`backend/src/app.js`, `server.js`), 1 event loop, sem cluster/worker | REAL |
| Banco | 1 projeto Supabase (`qosioymzswhkqkziocas`), acesso via PostgREST com `service_role`; migrations 001–006 | REAL |
| Frontend | PWA estática no GitHub Pages (`index.html` + `js/` + `css/`), SW `hope-os-shell-v1-4-3` unificado | REAL |
| Regra-mãe | Backend é a verdade única; `frontendCalculates: false` — cumprida (auditoria frontend: zero violação real) | REAL |
| Multi-tenant no schema | `empresa_id` NOT NULL + FK + índices compostos em 16/16 tabelas desde a 001 | REAL |
| Multi-tenant no runtime | Tenant fixado por `DEFAULT_EMPRESA_ID` em env (`env.js:19`) | HARDCODED |
| Autenticação | Inexistente — toda a API `/api/*` é pública na internet | **CRÍTICO** |
| Rate limit / Helmet / CSP | Inexistentes | **CRÍTICO / MOCKADO** |
| Escopo de tenant nas rotas | 5 furos confirmados (`GET /clientes`, `GET /agenda`, `PATCH /agenda/:id/duracao`, update de agendamento no `checkout/close`, `insert()` aceitando `empresa_id` do body) | **CRÍTICO (latente)** |
| Insights/Retention | Agregação full-table O(n×m) em Node por request; quebra com 1 tenant grande | **CRÍTICO** |
| Idempotência de checkout | `idempotency_key` + unique index + race handling na RPC | REAL |
| `agendamento_eventos` | Tabela existe, nada escreve nela | MOCKADO |
| `actor_id`/autoria de escrita | Ausente em 100% das tabelas e rotas | AUSENTE |
| Multiunidade/franquia | Não modelado (`unidade_id` inexistente) | BLOQUEADO |
| Observabilidade | `morgan('dev')` + `console.error` — sem logs estruturados, métricas ou tracing | PARCIAL |
| Testes | `npm run test:gate` 73/73 — backend only; sem testes de carga, concorrência ou isolamento de tenant | REAL (com lacunas) |

**Ativos que já nascem corretos (não refazer):** schema tenant-first com índices `(empresa_id, data)`; ledger distribuído append-only em centavos inteiros; RPC `checkout_close` transacional/idempotente com lock de linha; separação `engines/` (puras) → `services/` → `routes/` → `repositories/` (a costura de extração futura já existe); RLS habilitado em todas as tabelas.

### 1.2 Visão futura (tudo abaixo da seção 2 é ROADMAP)

Tudo o que segue descreve o **alvo** KortexOS. Nada disso existe hoje, salvo onde indicado.

---

## 2. Estágios de evolução (E0 → E3)

```
E0 (hoje)     Express único + Supabase único + tenant por env          [1 tenant]
E1 (V1.5–2)   Mesmo monolito + auth/JWT + tenant derivado do token
              + RLS por tenant + insights em SQL + event outbox        [1–100 tenants]
E2            Monolito modular em N réplicas atrás de gateway/BFF;
              workers consumindo outbox (analytics, notificações,
              WhatsApp); PgBouncer/Supavisor; réplica de leitura;
              partição por (empresa_id, data)                          [10²–10⁴ tenants]
E3            Extração por costura existente: checkout-service,
              agenda-service, insights-service; CDC do outbox →
              warehouse; deployment cell-based por região              [10⁴–10⁵ tenants]
```

Regra da casa preservada: **uma prioridade por vez; básico antes do sofisticado.** E1 é pré-condição para o **segundo cliente pagante**, não para 50k salões.

---

## 3. Frontend (alvo) — ROADMAP

| Camada | Hoje (REAL) | Alvo | Estágio |
|---|---|---|---|
| PWA | HTML único modular no GitHub Pages, SW network-first | Mantida como cliente primário; CDN escala "de graça" | E0–E3 |
| `config.json` com 1 `apiBase` | HARDCODED | Descoberta de endpoint via BFF/tenant directory (multi-região) | E2/E3 |
| Desktop | Inexistente | Shell (Tauri/Electron) reutilizando o mesmo bundle PWA — só quando houver demanda real | E3 |
| Nativo (iOS/Android) | Inexistente | Capacitor/nativo consumindo o mesmo BFF; **gate proibido até decisão explícita** (app do cliente está na lista de gates) | E3+ |
| Regra-mãe | `frontendCalculates: false` | **Imutável em todos os clientes** — todo cliente é "burro": coleta intenção, chama API, exibe resposta | Sempre |

## 4. Backend (alvo): modular monolith → serviços — ROADMAP

| Peça | Descrição | Estágio |
|---|---|---|
| Modular monolith | Manter o Express como monolito, reforçando fronteiras internas já existentes (`engines/` puras, `services/`, `repositories/`) | E1 |
| Auth middleware | JWT curto (5–15 min) via Supabase Auth; claims `sub`, `empresa_id`, `unidade_id?`, `role`; tenant injetado no repository por request (fim do `DEFAULT_EMPRESA_ID`) | **E1 — prioridade nº 1** |
| Fechamento dos 5 furos de escopo | Mecânico + gate de isolamento de tenant no `test:gate` | E1 |
| Commands | O padrão command **já existe de fato** no checkout (`idempotency_key` + snapshot jsonb do request). Alvo: generalizar — toda escrita mutante vira command idempotente com `command_id`, `actor_id`, payload versionado (estoque, agenda, waitlist primeiro, pois hoje não têm idempotência) | E1/E2 |
| Event outbox | Tabela `eventos(empresa_id, aggregate, aggregate_id, tipo, payload, created_at, processed_at)` escrita **dentro** das RPCs transacionais (`checkout_close`, `produto_estoque_ajuste`). Generaliza a `agendamento_eventos` morta. +1 insert por tx; destrava analytics/notificações sem reler o ledger. Requer migration 007 — **BLOQUEADA até autorização** | E1 (decisão) / migration 007 |
| Workers | Consumidores do outbox: read-models de insights, notificações, WhatsApp. Podem começar como `setInterval` no próprio processo por anos; processos separados só em E2 | E2 |
| Gateway | Reverse proxy + rate limit + auth na borda. Até ordens de 10³ RPS, um proxy no Render resolve; API Gateway dedicado é E2/E3 | E2 |
| BFF | Um BFF por família de cliente (PWA, desktop, nativo, futuro app do cliente) roteando para o mesmo core; também o ponto de roteamento por região/célula | E2/E3 |
| Extração de serviços | checkout-service (engines + RPC), agenda-service, insights-service — cada um leva seu subconjunto de `engines/` sem reescrita, pela costura existente | E3 |

## 5. Observabilidade (alvo) — ROADMAP

| Item | Hoje | Alvo | Estágio |
|---|---|---|---|
| Logs | `morgan('dev')`, `console.error(err)` sem redaction | Logs estruturados JSON com `request_id`, `empresa_id`, `actor_id`; redaction de PII | E1 |
| Métricas | Nenhuma | RED (rate/errors/duration) por rota; latência de RPC; profundidade do outbox | E1/E2 |
| Tracing | Nenhum | OpenTelemetry gateway→service→Postgres | E2 |
| Auditoria de acesso | Nenhuma | `access_log(actor, empresa_id, rota, ip, ts)` append-only — barato e quita o débito de actor | E1 |
| Alertas | Nenhum | SLO por tenant tier; alerta de event-loop block (o incêndio nº 1 hoje é agregação em Node) | E2 |

## 6. Sofisticação prematura — NÃO fazer agora

| Item | Motivo |
|---|---|
| Microserviços / Kafka / event bus | O outbox é o único compromisso necessário hoje |
| API Gateway / BFF multi-região | 1 frontend, 1 backend, 1 tenant |
| Sharding, bancos regionais/dedicados | Ver doc 05; pool + RLS cobre 10³–10⁴ tenants |
| Multiunidade completa, IdP corporativo, ABAC fino | Gate proibido do CLAUDE.md; só a **decisão de modelagem** de unidade precisa nascer (1 coluna nullable na futura 007) |
| CQRS/read-models materializados | Só depois de insights virarem SQL agregado e serem medidos |

## 7. Sequência recomendada (do real ao alvo)

1. **Auth + tenant-do-token + fechar os 5 furos de escopo** (E1, bloqueia o 2º tenant).
2. **Insights em SQL agregado** (`WHERE empresa_id = $1 AND data BETWEEN ...`) — único item de performance que já dói no tenant atual (1.481 clientes).
3. **Outbox nas RPCs + decisão de modelagem de unidade** na migration 007 (quando desbloqueada).
4. Só então: réplicas, partição, workers separados, gateway/BFF e o restante de E2+.

---

**Reforço final:** este documento é mapa, não ordem de serviço. O estado REAL do sistema é o da seção 1.1; tudo mais é hipótese de evolução condicionada a decisão explícita do usuário e às regras invioláveis do `CLAUDE.md`.
