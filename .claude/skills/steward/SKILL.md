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
- Criar migration 007+ ou tocar 001–006; executar SQL em qualquer banco. SQL de rascunho só em Markdown marcado `DRAFT ONLY`.
- Declarar multi-tenant seguro ou tratar `API_ACCESS_TOKEN` como auth final.
- Avançar V1.5.

Sempre: backend é a fonte de verdade (preço, comissão, estoque, agenda, financeiro); `empresa_id` só de `req.auth`; `service_role` nunca no frontend.

## 3. Gates
| Gate | Comando (em `backend/`) | Precisa |
|---|---|---|
| Offline (CI) | `API_ACCESS_TOKEN=x SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=x npm run test:offline` | nada |
| Integrado | `npm run test:gate` | `.env` com Supabase real + `data/*.json` (PII, não versionado) |
| Uma suíte | `node tests/<nome>.test.js` | ver acima |

- O CI (`.github/workflows/ci.yml`) roda só o offline. Nunca declarar "gate verde" citando o integrado sem tê-lo rodado; registrar como DESCONHECIDO.
- Teste novo puro → entra em `test:offline` **e** em `test:gate`.
- Datas em teste: nunca depender de `new Date()` contra fixture com data fixa (o insights-gate quebrou assim). Injetar "agora".

## 4. E2E da PWA sem Supabase
```bash
node backend/scripts/dev-memory-api.js &               # API real + repositório em memória
python3 -m http.server 5599 --bind 127.0.0.1 &          # na raiz do repo
# abrir: http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api&apiToken=dev
```
- Playwright: Chromium em `/opt/pw-browsers` (`NODE_PATH=$(npm root -g)`); não rodar `playwright install`.
- Autocomplete (`FuzzyField`): selecionar com `page.locator('#<input> ~ div [data-value]').first().click()` — teclado não seleciona.
- Conferir o estado gravado em `GET http://127.0.0.1:3399/__db/<tabela>`.
- Mudou JS/CSS da PWA → subir `CACHE_NAME` em `service-worker.js`.
- Não usar `pkill -f` com padrão que case com o próprio shell (mata o comando inteiro).

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
