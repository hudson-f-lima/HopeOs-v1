# KortexOS V1.4 Session Handoff — F3 Ready

**Última atualização:** 2026-07-08
**Branch:** `codex/v1.4-dashboard-premium`
**Status:** F2 concluída, pronta para F3

---

## Estado Atual

### ✅ Completo (não tocar)

- **F0 (saneamento):** Split desligado por flag, checkout restaurado, service worker v1-4-0, merged em produção.
- **F1 (insights backend):** Engines puras, rotas e testes (63/63). Ocupação, Caixa e Margem.
- **F2 (retenção backend):** Engines de retenção (`retention.js`), `RetentionService.js` com rotas de RFM, Churn Risk e Reliability. Testes atualizados (73/73 verdes).

### ⏳ Próximo: F3 (Dashboard Bento Frontend)

**O que fazer em F3:** Tarefas 3.1–3.7 do `docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md`

| Tarefa | Descrição | Arquivo |
|--------|-----------|---------|
| 3.1 | Atualizar `js/api.js` (helpers insights) e `js/state.js` (`state.insights`) | `js/api.js`, `js/state.js` |
| 3.2 | Reestruturar UI base para layout *bento* mantendo 4 stat-cards atuais | `index.html`, `css/app.css` |
| 3.3 | Widget Ocupação (Heatmap dia×hora, Ranking SUR, Donut load factor) | `js/ui/dashboard.js` |
| 3.4 | Widget Dinheiro (Curva D+30, Acumulados D+7/D+30, custo de taxa) | `js/ui/dashboard.js` |
| 3.5 | Widget Pessoas (Donut RFM, lista "quem chamar hoje" com waLink) | `js/ui/dashboard.js` |
| 3.6 | Ação do dia (Cards para buracos, risco, attach, espera com CTA) | `js/ui/dashboard.js` |
| 3.7 | Botão atualizar manual + listener `checkout:closed` para refetch | `js/ui/dashboard.js` |

**Nota Importante:** Nenhum cálculo novo de negócio ou financeiro deve ser feito no frontend. O frontend deve simplesmente exibir os dados pré-processados que vêm do backend. Use CSS simples, seguindo a estética premium e clean.

---

## Como Continuar em Próxima Sessão

### 1. Setup
```bash
git checkout codex/v1.4-dashboard-premium
git pull origin codex/v1.4-dashboard-premium
```

### 2. F3 Tarefas (iterativo no Front)
Execute as tarefas 3.1 a 3.7 em pequenos incrementos, verificando o visual em `http://localhost:5500/`. Lembre-se de validar a responsividade e tratamento de erros ou estado vazio.

### 3. QA F3
Valide a nova UI contra os casos listados na auditoria visual (QA mobile+desktop). Garanta que os dados batam.

### 4. Commit Baseline F3
```bash
git add js/api.js js/state.js index.html css/app.css js/ui/dashboard.js
git commit -m "feat(f3): dashboard bento frontend com widgets de insights"
git push origin codex/v1.4-dashboard-premium
```

---

## Checklist Antes de F3

- [x] Branch sincronizado e sem mudanças não comitadas
- [x] F2 implementado localmente e gate `73/73 verdes`
- [ ] Backend dev rodando: `npm run dev` em `backend/`
- [ ] Frontend servido localmente via `npx serve . -l 5500`

Quando estiver tudo pronto, comande: **"vai F3"** e o modelo prosseguirá.
