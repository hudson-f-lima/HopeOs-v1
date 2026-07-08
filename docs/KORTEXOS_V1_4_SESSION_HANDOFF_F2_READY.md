# KortexOS V1.4 Session Handoff — F2 Ready

**Última atualização:** 2026-07-08 (sessão Haiku 4.5)
**Branch:** `codex/v1.4-dashboard-premium`
**Status:** F1 concluída, pronta para F2

---

## Estado Atual

### ✅ Completo (não tocar)

- **F0 (saneamento):** Split desligado por flag, checkout restaurado, service worker v1-4-0, merged em produção
- **F1 (insights backend):**
  - Engines puras: `backend/src/engines/insights/{occupancy,cashflow,margin}.js`
  - Service: `backend/src/services/InsightsService.js` (orquestra repo + engines)
  - Rotas: GET `/insights/{occupancy,margin,cashflow}` em `backend/src/routes/index.js`
  - Testes: `backend/tests/insights-gate.test.js` (5 novos testes, 63/63 verdes)
  - **TODO futuro:** `occupancy.computeLoadFactor` e `computeGaps` refinadas com dados reais em iteração pós-V1.4

### ⏳ Próximo: F2 (Retenção Backend)

**O que fazer em F2:** Tarefas 2.1–2.4 do `docs/KORTEXOS_NOW_SCOPE_V1_4_DEV_HANDOFF.md`

| Tarefa | Descrição | Arquivo |
|--------|-----------|---------|
| 2.1 | `backend/src/engines/insights/retention.js` — puras: `computeRfm`, `computeChurnRisk`, `computeReliability` | novo |
| 2.2 | `computeRebooking` e `computeAttach` (lift, suporte mín. 5) | mesmo arquivo |
| 2.3 | `backend/src/services/RetentionService.js` + rotas GET `/insights/retention`, `/insights/clients/:id/reliability`, `/insights/attach`, `/insights/rebooking/:clienteId` | novo |
| 2.4 | Somar ao gate (`insights-gate.test.js`) | existente |

**Especificação completa:** `docs/KORTEXOS_NOW_SCOPE_V1_4_SPEC.md` §2.5–2.9

**RFM (fórmula):**
```
R = dias desde última comanda (menor = melhor)
F = nº de comandas na janela 180d
M = Σ total_recebido_centavos na janela
Score 1–5 por quintil (dinâmico sobre a distribuição real)

Segmentos determinísticos (janela 180d):
- Campeões: R≥4 e F≥4
- Promissores: R≥4 e F∈{2,3}
- Em risco: R≤2 e F≥3
- Perdidos: R=1 e F=1
- Regulares: demais
```

**Reliability Score v0 (shadow, read-only):**
```
score = clamp(100 - 20×min(no_shows_365d,4) - 8×min(cancel_tardios_365d,5) + 4×min(streak_concluidos,5), 0, 100)
Faixas: ≥85 confiável | 60–84 normal | 40–59 atenção | <40 risco
NUNCA bloqueia/cobra nesta iteração — só informativo
```

**Churn-risk (intervalo próprio do cliente):**
```
gaps = diferenças em dias entre comandas consecutivas
intervalo_mediano = mediana(gaps) [fallback: mediana global do serviço ou 45d]
overdue_ratio = dias_desde_última / intervalo_mediano
risco: <1.2 ok | 1.2–1.8 atenção | 1.8–2.5 alto | >2.5crítico
prioridade_contato = M (valor 180d) × fator_risco
Lista "quem chamar hoje" = top N por prioridade com telefone/whatsapp
```

---

## Como Continuar em Próxima Sessão

### 1. Setup
```bash
git checkout codex/v1.4-dashboard-premium
git pull origin codex/v1.4-dashboard-premium
npm run test:gate  # Verifica que F1 está verde (deve ter 63/63)
```

### 2. F2 Tarefas (sequencial, com DoD per-tarefa)
- Tarefa 2.1: Criar `retention.js` com 3 funções puras + testes
- Tarefa 2.2: Add `computeRebooking` + `computeAttach` + testes
- Tarefa 2.3: Criar `RetentionService.js` + rotas + validação query
- Tarefa 2.4: Somar testes ao gate (`npm run test:insights`)

### 3. QA F2
```bash
npm run test:gate  # Deve ter 63 + N_novos verdes
curl -s http://localhost:3000/api/insights/retention?from=2026-07-01&to=2026-07-08 | jq .
```

### 4. Commit Baseline
```bash
git add backend/src/engines/insights/retention.js backend/src/services/RetentionService.js backend/src/routes/index.js backend/tests/insights-gate.test.js backend/package.json
git commit -m "feat(f2): retention backend — RFM, churn-risk, Reliability Score..."
git push origin codex/v1.4-dashboard-premium
```

---

## Dados Reais para Teste (Produção)

| Tabela | Registros | Uso em F2 |
|--------|-----------|----------|
| `clientes` | 1.481 | RFM segmentação |
| `comandos` | ~3.000 | intervalos, M, F |
| `agendamentos` | ~10.000 | status, histórico |
| `comando_gorjetas` | ~1.000 | gorjeta líquida por prof |

**Nota:** Usar `SupabaseRepository.list()` que já pagina >1000 linhas.

---

## Recomendação de Modelo para F2 e F3

| Fase | Modelo | Justificativa |
|------|--------|---------------|
| **F2** | **Haiku 4.5** (econômico) | Funções puras + rotas simples; spec já detalha fórmulas. 2–3 dias. |
| **F3** (dashboard) | **Haiku 4.5** | Iterar UI/UX no preview é barato; iterações rápidas >análise profunda. 3 dias. |
| **F4** (ação final) | **Sonnet 5** (1 review final) | Um passe de auditoria antes do merge em main. |
| **F5** (QA completa) | Manual + Sonnet 5 (revisão) | QA não é automática; 2–3 dias de teste manual real + 1 passe de revisão. |

**Custo estimado:** ~R$ 50–100 em créditos de API (4 fases × Haiku cheap).

---

## Checklist Antes de F2

- [ ] Branch está sincronizado: `git pull origin codex/v1.4-dashboard-premium`
- [ ] F1 testes passam: `npm run test:gate` → 63/63 verdes
- [ ] Não há mudanças não-commitadas: `git status` limpo
- [ ] Backend dev rodando: `npm run dev` em `backend/` (ou use `/model` para trocar antes de começar)

Quando tudo verde, comande: **"vai F2"** e o modelo Haiku começará as 4 tarefas.
