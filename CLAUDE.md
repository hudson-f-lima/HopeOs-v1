# HOPE OS — Contexto do projeto (V1.4.1 Security Perimeter — implementado; produção pendente)

KortexOS™ é o nome canônico do produto (HOPE OS vira legado interno) — fonte única: `docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`. Mapa de autoridade documental: `docs/INDEX.md`. Manifesto para agentes de IA: `AGENTS.md` (raiz). Fundação física: migrations 001–006 reais; SQL futuro 007+ planejado e BLOQUEADO; faixa 046–060 obsoleta.

---

## ⛔ BLOQUEIO ATIVO — NÃO AVANÇAR

```text
NÃO AVANÇAR PARA V1.5.
NÃO CRIAR MIGRATIONS 007+.
NÃO IMPLEMENTAR ESCALA GLOBAL.
NÃO CRIAR APP NATIVO.
NÃO EXPANDIR IA.
NÃO CRIAR NOVA FEATURE.
NÃO MEXER NO LEDGER.
NÃO MOVER CÁLCULO FINANCEIRO PARA FRONTEND.
NÃO USAR empresa_id VINDO DE BODY/QUERY COMO VERDADE.
NÃO TRATAR API_ACCESS_TOKEN COMO AUTENTICAÇÃO FINAL.
NÃO DECLARAR MULTI-TENANT SEGURO AINDA.
```

**Liberação:** apenas após Tarefa A validada em produção E Tarefa B concluída.
**Status detalhado:** `docs/audit_global/00_STATUS_EXECUCAO.md`

---

## Stack

Backend Node.js + Express + Supabase/Postgres. Frontend é uma PWA em HTML único (`index.html` na raiz) publicada no GitHub Pages e conectada ao backend real via `/api/*`. Backend hospedado no Render e banco no Supabase.

## Regra-mãe

Backend é a verdade única.

O frontend não calcula: financeiro, comissão, margem, taxa, repasse, baixa de estoque, preço final, disponibilidade oficial, ocupação oficial, ledger, caixa.

O frontend apenas: coleta intenção, chama API, exibe resposta do backend, formata valores recebidos.

## Regras invioláveis

- Auditoria brutal sempre: classificar REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO / BLOQUEADO.
- Uma prioridade por vez.
- Básico antes do sofisticado.
- Nenhuma tabela nova sem migration versionada em `supabase/migrations/`.
- `service_role` nunca exposto ao frontend.
- Ledger financeiro é distribuído por design: `comandos`, `comando_itens`, `comando_pagamentos`, `comando_gorjetas`, `caixa_movimentos`, `produto_estoque_movimentos`.
- Não existe e não deve existir uma tabela única `financial_ledger`.
- Estoque não pode ser alterado diretamente pelo frontend.
- Produto vendido abaixo do custo deve ser bloqueado.
- Masters operacionais devem ser desativados com `ativo=false`, não deletados fisicamente.
- Nenhum mock pode ser tratado como real.
- Nenhum documento pode declarar release aprovado se houver P0 aberto.
- Não criar documentos `*_REVISED`, `*-1`, `*(1)`, `*copy`, `*final`. Correção = reescrita in-place.

---

## Estado atual confirmado

### V1.4.1 — Security Perimeter Hotfix

| Item | Status | Commit |
|------|--------|--------|
| Middleware `requireAuth` Bearer `API_ACCESS_TOKEN` em todas as rotas `/api/*` (exceto `/api/health`) | REAL | `b70de84` |
| Frontend envia `Authorization: Bearer <token>` em todas as chamadas | REAL | `e894179` |
| Bootstrap de token via `?token=` + `AuthError` handler com prompt | REAL | `ff1bb9e` |
| `npm run test:gate` = 82/82 verdes | REAL | `af02521` |
| Remoção de PII do git index + `.gitignore` atualizado | REAL | `eed9bd1` |
| `SECURITY_PII_POLICY.md` documentado | REAL | `512f1fc` |
| `docs/audit_global/` (auditoria global 01–12) | REAL | `af02521` / `fa746ac` |
| `API_ACCESS_TOKEN` definido no Render | ✅ REAL | `af02521` |
| PWA funcionando com Bearer token em produção | ✅ REAL | `ff1bb9e` |
| Rotação de segredos (Supabase, GH_TOKEN, Render hook) | ⛔ PENDENTE — **Tarefa B** | — |
| Histórico git reescrito sem PII | ⛔ PENDENTE — **Tarefa B** | — |

### Tarefa A — Critérios de aceite em produção

```text
/api/health sem token = 200
/api/clientes sem token = 401
/api/clientes token inválido = 401
/api/clientes token válido = 200 ou 422
/api/checkout/close sem token = 401
/api/agenda sem token = 401
PWA abre prompt de token.
Agenda e Dashboard carregam após inserir token.
```

### V1.4 — Decision Intelligence (CONCLUÍDO — 2026-07-10)

- 73/73 testes verdes no ciclo V1.4 (expandido para 82/82 no V1.4.1).
- Hotfix P0 validado: SW ativo, 4 cards Dashboard renderizam dados reais.
- Split payment completo, rebooking, waitlist, dashboard bento, badge de reliability, attach de produto.
- Zero migration no ciclo inteiro.

### Backend

- Node + Express + Supabase service role: REAL.
- Migrations 001–006 aplicadas e validadas no projeto `qosioymzswhkqkziocas`: REAL.
- Checkout preview/close, baixa de estoque via RPC, ledger distribuído: REAL.
- Cadastros reais (clientes, serviços, profissionais, produtos, formas de pagamento, vínculos, overrides): REAL.
- `SupabaseRepository.list()` pagina além de 1000 linhas: REAL.
- `npm run test:gate` = 82/82: REAL.

### Frontend

- PWA modular: `index.html` + `css/app.css` + `js/` (state, api, utils, ui/*).
- Service worker: versão atual `hope-os-shell-v1-4-7`.
- `frontendCalculates: false` — regra sem exceções.

---

## Próximas ações (ordem obrigatória)

### 24h — Tarefa A (P0)

```bash
# 1. Gerar token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 2. Definir no Render: Environment → API_ACCESS_TOKEN = <token>
# 3. Redeploy manual no Render
# 4. Validar curls (ver critérios acima)
# 5. Confirmar PWA carregando agenda e dashboard
```

Checklist completo: `docs/audit_global/11_PRODUCTION_DEPLOYMENT_TAREFA_A.md`

### 7 dias — Tarefa B (P0)

- Rotacionar `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `GH_TOKEN`, Render deploy hook.
- Reescrever histórico git com BFG ou `git filter-repo`.
- Validar clone limpo sem `data/clientes.json` e backups.

Checklist completo: `docs/audit_global/12_PRODUCTION_DEPLOYMENT_TAREFA_B.md`

---

## Segurança & Conformidade

- `API_ACCESS_TOKEN` via Bearer: autenticação mínima de perímetro (não é auth final).
- `service_role` nunca exposto ao frontend.
- PII removida do git index: commit `eed9bd1`.
- `data/*.json` e `data/backups/` no `.gitignore` permanentemente.
- Reescrita de histórico: pendente (Tarefa B).

---

## Comandos

```bash
# Testes (obrigatório verde antes de qualquer merge)
cd backend && npm run test:gate
# Esperado: 82/82 verdes

# Backend local
cd backend && npm start

# Frontend local
npx --yes serve . -l 5500
```

## URLs de produção

```text
Frontend:       https://hudson-f-lima.github.io/HopeOs-v1/
Backend health: https://hopeos-v1.onrender.com/api/health
```

---

## Documentação de auditoria

`docs/audit_global/` — ler nesta ordem:

| Arquivo | Conteúdo |
|---------|----------|
| `00_STATUS_EXECUCAO.md` | Estado atual, bloqueios, commits de referência |
| `01_AUDITORIA_GLOBAL_ESCALA_KORTEXOS.md` | Auditoria de escala global |
| `02_CURRENT_STATE_TRUTH_MAP_RECONCILED.md` | Truth map reconciliado |
| `03_GAP_ANALYSIS_HOPEOS_V1_TO_KORTEXOS.md` | Gap analysis V1 → KortexOS |
| `04_ARQUITETURA_GLOBAL_KORTEXOS.md` | Arquitetura target |
| `05_DATABASE_STRATEGY_POOL_SILO_BRIDGE.md` | Estratégia de banco |
| `06_SECURITY_AUTH_RLS_AUDIT.md` | Auditoria de segurança e auth |
| `07_HOTFIX_REQUIRED_OR_COMPLETED.md` | Hotfixes necessários/concluídos |
| `08_DEV_HANDOFF_NEXT_SCOPE.md` | Handoff V1.4.1 |
| `09_RED_TEAM_FINAL_REPORT.md` | Red Team final |
| `10_EXECUTIVE_SUMMARY.md` | Sumário executivo |
| `11_PRODUCTION_DEPLOYMENT_TAREFA_A.md` | Checklist de deploy — auth |
| `12_PRODUCTION_DEPLOYMENT_TAREFA_B.md` | Checklist de segredos e PII |

---

## KortexOS 5.1 — Roadmap estratégico (BLOQUEADO)

Sequência: Master Briefing ✅ → Benchmark ✅ → Comparative Proposal ✅ → Truth Map ✅ → Migration Map ✅ → **Blueprint** (bloqueado até Tarefa A+B) → SQL (bloqueado) → Dev Handoff (bloqueado).

Migrations 007+ planejadas, não autorizadas. Faixa 046–060 obsoleta.

## Próximo gate proibido (sem decisão explícita)

IA, marketplace, app do cliente, multiunidade, assinatura recorrente, CRM avançado, gamificação, marketing automático.
