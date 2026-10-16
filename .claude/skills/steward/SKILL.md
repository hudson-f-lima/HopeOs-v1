---
name: steward
description: Como trabalhar no HOPE OS / KortexOS sem violar as regras do projeto — ordem de leitura, bloqueios, gates (offline, integrado, E2E da PWA), classificação de achados e formato de entrega. Use antes de qualquer mudança de código, ao conduzir PRs e ao validar a PWA.
---

# Steward — HOPE OS / KortexOS

## 1. Antes de mexer
1. Ler `AGENTS.md` → `CLAUDE.md` → `docs/INDEX.md` → `docs/PROJECT_STATE.md`. Estado e handoff vivem **só** no `PROJECT_STATE.md`.
2. Conferir em `docs/DECISIONS.md` se a mudança já tem decisão (D-00x). Feature nova sem decisão registrada = parar e registrar a autorização do Platform Owner primeiro (ver D-006).

## 2. Bloqueios que nenhuma autonomia genérica libera
Exigem autorização **explícita e específica** do Platform Owner:
- Criar migration 008+ ou tocar 001–007 (007 autorizada em D-007); executar SQL em qualquer banco. SQL de rascunho só em Markdown marcado `DRAFT ONLY`.
- Aplicar a 007 em produção fora do `docs/RUNBOOK_MIGRATION_007.md` (backup → migration → deploy, nessa ordem).
- Declarar multi-tenant seguro ou tratar `API_ACCESS_TOKEN` como auth final.
- Avançar V1.5.

Sempre: backend é a fonte de verdade (preço, comissão, estoque, agenda, financeiro); `empresa_id` só de `req.auth`; `service_role` nunca no frontend.
Rota nova de negócio: `authorize('<ação>')` de `src/auth/rbac.js` (o identity-gate C05 falha sem isso); escrita humana usa `autoriaDe(req.auth)`; serviço/repositório sempre recebe `req.auth.empresa_id` explícito.

## 3. Gates
| Gate | Comando | Precisa |
|---|---|---|
| Offline (CI) | em `backend/`: `API_ACCESS_TOKEN=x SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=x npm run test:offline` | nada |
| Migrations + SQL (CI) | `PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh` (shim Supabase, 001–007, `gate_*.sql`, concorrência, rollback) | Postgres 16 limpo |
| Integrado | em `backend/`: `npm run test:gate` | `.env` com Supabase real (com 007) + `data/*.json` (PII, não versionado) |
| Uma suíte | `node tests/<nome>.test.js` | ver acima |

- O CI (`.github/workflows/ci.yml`) roda offline + migrations. Nunca declarar "gate verde" citando o integrado sem tê-lo rodado; registrar como DESCONHECIDO.
- Teste novo puro → entra em `test:offline` **e** em `test:gate`. Teste de banco → `supabase/tests/gate_*.sql` (transação com rollback no fim).
- Datas em teste: nunca depender de `new Date()` contra fixture com data fixa (o insights-gate quebrou assim). Injetar "agora".
- Postgres local na sessão: `initdb`/`pg_ctl` de `/usr/lib/postgresql/16/bin` como usuário `postgres` em `/var/tmp/...` (o scratchpad não é acessível a esse usuário).
- Prove que o teste pega a regressão: mutação (remover a regra) ou controle negativo (ex.: concorrência sem o lock grava 2).

## 4. E2E da PWA sem Supabase
```bash
node backend/scripts/dev-memory-api.js &               # API real + banco e Supabase Auth em memória
python3 -m http.server 5599 --bind 127.0.0.1 &          # na raiz do repo
# abrir: http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api
# logins (senha dev12345): admin@dev.local, recepcao@dev.local, profissional@dev.local, novo@dev.local (sem vínculo)
# modo legado: acrescentar &apiToken=dev
```
- Scripts prontos: `NODE_PATH=$(npm root -g) node backend/tests/e2e/<login|equipe|convite|slots>.e2e.js` (cada um com a API recém-iniciada).
- Links de convite/recuperação do dev aparecem no console da API e em `GET /__links`; estado em `GET /__db/<tabela>`.
- Playwright: Chromium em `/opt/pw-browsers`; não rodar `playwright install`.
- Autocomplete (`FuzzyField`): `page.locator('#<input> ~ div [data-value]').first().click()` — teclado não seleciona. Avisos de sucesso são toast (ler `body`, não `#banner`).
- Mudou JS/CSS da PWA → subir `CACHE_NAME` em `service-worker.js` (e listar arquivo novo em `SHELL_ASSETS`).
- Parar servidores pelo PID lendo `/proc/*/cmdline` num script; `pkill -f`/`pgrep -f` com padrão presente na própria linha de comando mata o shell.

## 5. Classificação e entrega
- Todo achado: `REAL`, `PARCIAL`, `MOCKADO`, `HARDCODED`, `CRÍTICO`, `BLOQUEADO`, `DESCONHECIDO`, `OBSOLETO` ou `CONTRADITÓRIO`.
- Ao alterar arquivos, fechar com:
```text
FILES_CHANGED:
BLOCKERS_REMAINING:
VEREDITO:
```
- Atualizar `PROJECT_STATE.md` (tabela + handoff), `CHANGELOG.md` e, se for contrato, `docs/API_CONTRACT.md`. Correções documentais in-place; nada de `*_REVISED`/`final`.

## 6. PRs
- Commits pequenos por intenção (fix / feat / ci / docs), mensagem em português.
- CI vermelho num PR próprio é trabalho imediato; nunca pular/desabilitar teste para ficar verde.
- Achado que só se resolve com migration → registrar como P1/BLOQUEADO no `PROJECT_STATE`, não contornar na aplicação fingindo garantia.
