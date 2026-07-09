# KortexOS V1.4 Session Handoff - F4 Ready

**Ultima atualizacao:** 2026-07-09
**Branch:** `codex/v1.4-dashboard-premium`
**Status:** F3 concluida localmente, pronta para F4

---

## Estado Atual

### Completo (nao tocar sem motivo)

- **F0 (saneamento):** split visual legado desligado por flag, checkout restaurado, service worker em linha V1.4.
- **F1 (insights backend):** engines puras, rotas e testes para ocupacao, caixa e margem.
- **F2 (retencao backend):** `retention.js`, `RetentionService.js`, RFM, churn-risk, reliability, rebooking e attach. Gate `73/73` verde.
- **F3 (dashboard bento frontend):** helpers `/insights/*`, `state.insights`, layout bento, widgets Ocupacao/Dinheiro/Margem/Pessoas, acao do dia, `waLink`, refresh manual e listener `checkout:closed`.

### Validacao F3

- `node --check` verde para `js/ui/dashboard.js`, `js/api.js`, `js/state.js`, `js/utils.js`, `service-worker.js` e `frontend/service-worker.js`.
- `cd backend && npm run test:gate` verde: `73/73`.
- Browser smoke desktop: dashboard abre, 4 paineis renderizam, fallback controlado quando `/api/insights/*` remoto responde 404, zero erro de console.
- Browser smoke mobile 375px: sem overflow horizontal (`scrollWidth == clientWidth`), 4 paineis, zero erro de console.

### Observacao operacional

O frontend local/Pages pode apontar para o backend Render. Enquanto o backend remoto nao estiver redeployado com as rotas `/api/insights/*`, o Dashboard Bento exibe erro controlado `Insights V1.4: Erro HTTP 404` e estados vazios. Isso e esperado, nao fatal.

---

## Proximo: F4 (Camada de Acao)

**Fonte:** tarefas 4.1-4.6 de `docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md`

| Tarefa | Descricao | Arquivos | DoD |
|--------|-----------|----------|-----|
| 4.1 | Auditar e completar split backend: `payments[]` N itens, soma exata ao total do preview, erro 422 se divergente, taxa rateada por pagamento | `backend/src/validators/checkout.validator.js`, engines de pagamento/allocation | Gate novo/atualizado: 2 pagamentos fecham, taxas corretas, ledger soma |
| 4.2 | Split frontend apos preview: UI habilita somente depois do preview, monta `payments[]`, remove flag F0 | `js/ui/checkout.js`, `js/state.js` | Comanda real com 2 formas grava 2 `comando_pagamentos` e 2 `caixa_movimentos` |
| 4.3 | Rebooking pos-checkout: card com sugestao via `/insights/rebooking`, confirmacao cria agendamento pelo fluxo existente | `js/ui/checkout.js`, rotas existentes de agenda | Agendamento aparece na agenda; dismissivel; nada automatico |
| 4.4 | Waitlist: rotas e UI para lista de espera/candidatos, sem migration | backend routes/validators, `js/ui/agenda.js`, `js/ui/cadastros.js` | Lista real, candidato com WhatsApp one-tap, status atualiza |
| 4.5 | Badge reliability na agenda, lazy no detalhe do agendamento | `js/ui/agenda.js` | Score/fatores visiveis; nenhuma acao bloqueada por score |
| 4.6 | Attach no checkout usando dados de `/insights/attach`, sugestao nunca auto-add | `js/ui/checkout.js` | Produto sugerido entra pelo fluxo existente |

---

## Regras Para F4

- **Zero migration:** nao tocar em `supabase/`, nao criar `.sql`.
- **Backend segue como fonte de verdade:** frontend nao calcula preco, taxa, comissao, margem, saldo, estoque ou repasse.
- **Split e financeiro sao criticos:** qualquer divergencia de soma deve falhar antes do fechamento.
- **IA/automacao soberana proibida:** rebooking, waitlist e WhatsApp sao sugestoes/atalhos manuais, nunca execucao automatica.
- **Reliability shadow mode:** exibe score e fatores; nao pune, bloqueia ou altera fluxo.

---

## Como Continuar

```bash
git checkout codex/v1.4-dashboard-premium
git pull origin codex/v1.4-dashboard-premium
cd backend
npm run test:gate
```

Antes de codar F4.1, auditar `PaymentEngine`/`allocation.js` e o contrato atual de `checkout.validator.js`. A primeira entrega deve ser backend + teste, so depois frontend.

Quando estiver pronto, comande: **"vai F4"**.
