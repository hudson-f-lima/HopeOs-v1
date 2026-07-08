# KORTEXOS™ NOW-SCOPE V1.4 — SPEC TÉCNICA (DECISION INTELLIGENCE)

**Arquivo:** `docs/KORTEXOS_NOW_SCOPE_V1_4_SPEC.md`
**Base:** Master Briefing NOW V1.4 (escopo/governança) — este documento só materializa
**Data:** 2026-07-08
**Regra:** zero migration; agregação em Node (services), não em SQL novo; frontend recebe séries prontas

---

## 1. Arquitetura

```text
Supabase (schema 001–006, intocado)
   ↓ SupabaseRepository.list() [já pagina >1000 ✓]
Backend Node
   ├── services/InsightsService.js   (novo: ocupação, margem, caixa, attach)
   ├── services/RetentionService.js  (novo: RFM, churn, reliability, rebooking)
   ├── services/DashboardService.js  (existente — mantém endpoints atuais)
   └── routes/index.js               (novos GETs /insights/*, /lista-espera)
Frontend PWA
   └── js/ui/dashboard.js + js/ui/checkout.js + js/ui/agenda.js (exibem)
```

Volumetria atual (~1,5k clientes, ~3k comandos, ~10k itens) cabe com folga em agregação Node por request. **Limite documentado:** quando `comandos` passar de ~50k linhas, promover agregações para RPCs read-only (exigirá migration leve — fase futura, fora deste ciclo).

Cache: respostas de `/insights/*` podem usar cache em memória com TTL 60s (mesmo padrão se já houver em DashboardService; senão, sem cache neste ciclo). `/api/*` continua nunca cacheado no service worker.

## 2. Fórmulas canônicas (backend-only)

### 2.1 Ocupação (SUR — Service Utilization Rate)

```text
minutos_vendidos(prof, dia)   = Σ duracao_min de agendamentos com status ∈
                                {agendado, confirmado, aguardando, em_atendimento, concluido, fechado}
minutos_no_show(prof, dia)    = Σ duracao_min com status = no_show   (ocupou slot, não gerou receita)
minutos_disponiveis(prof,dia) = janela de profissionais.horario[dow] ∩ empresas.horario_por_dia[dow]
                                fallback (jsonb vazio): 8 slots × empresas.slot_padrao (default 30) = 240 min

SUR(prof, dia)      = minutos_vendidos / minutos_disponiveis          (cap 100%)
SUR_realizado       = idem, excluindo cancelado E no_show
load_factor(semana) = Σ minutos_vendidos / Σ minutos_disponiveis      (todos os profs ativos)
heatmap[dow][hora]  = Σ minutos_vendidos no bucket / Σ minutos_disponiveis no bucket
buracos(dia)        = intervalos livres contíguos ≥ slot_padrao dentro da janela, por prof
```

Faixas de cor (mesma régua do V1.3, agora vinda do backend): 0–25 cinza, 26–50 amarelo, 51–75 laranja, 76–100 verde.

### 2.2 Yield (RevPAH) e ticket

```text
RevPAH(período)     = Σ comandos.receita_empresa_centavos / horas_disponiveis(período)
ticket_medio        = Σ total_recebido_centavos / n_comandos
receita_hora_vendida= Σ total_recebido_centavos / (Σ minutos_vendidos de comandas fechadas / 60)
```

### 2.3 Margem (decomposição do ledger distribuído)

```text
Por serviço  (comando_itens, tipo=servico, group by servico_id):
  margem_pct = Σ receita_empresa_centavos / Σ valor_liquido_centavos
Por profissional (group by profissional_id):
  producao   = Σ valor_liquido_centavos
  comissao   = Σ comissao_centavos
  gorjeta    = Σ comando_gorjetas.valor_liquido_centavos (join por comando/prof)
  margem_gerada = Σ receita_empresa_centavos
Por produto  (tipo=produto): lucro_bruto = Σ lucro_bruto_centavos; markup = venda/custo
Por forma    (comando_pagamentos, group by forma_code):
  custo_taxa = Σ taxa_total_centavos; peso = Σ valor_centavos / total geral
```

### 2.4 Fluxo de caixa projetado (D+n)

```text
Para cada comando_pagamento p (comandas dos últimos 60 dias + futuras se houver):
  data_liquidacao = comandos.data + formas_pagamento.dias_recebimento(p.forma_code)
  valor_liquido   = p.valor_centavos − p.taxa_total_centavos
Curva: group by data_liquidacao para os próximos 30 dias
Saída: [{data, brutoCentavos, taxaCentavos, liquidoCentavos, porForma: {...}}]
acumulado_7d / acumulado_30d incluídos.
```

### 2.5 RFM (janela 180 dias, quintis dinâmicos)

```text
R = dias desde a última comanda do cliente        (menor = melhor)
F = nº de comandas na janela
M = Σ total_recebido_centavos na janela
Score 1–5 por quintil calculado sobre a distribuição REAL da base (não thresholds fixos).

Segmentos (mapa determinístico):
  Campeões     R≥4 e F≥4          | Fiéis        F≥4 e R∈{2,3}
  Promissores  R≥4 e F∈{2,3}      | Novos        1ª comanda ≤ 30 dias
  Em risco     R≤2 e F≥3          | Hibernando   R≤2 e F≤2 e M≥3
  Perdidos     R=1 e F=1          | Regulares    demais
```

### 2.6 Churn-risk (intervalo próprio do cliente)

```text
gaps(cliente)          = diferenças em dias entre comandas consecutivas
intervalo_mediano      = mediana(gaps)            [exige ≥3 comandas; senão fallback:
                         mediana global do serviço dominante do cliente; senão 45 dias]
overdue_ratio          = dias_desde_ultima / intervalo_mediano
risco: <1.2 ok | 1.2–1.8 atencao | 1.8–2.5 alto | >2.5 critico
prioridade_contato     = M (valor 180d) × fator_risco (atencao=1, alto=2, critico=3)
Lista "quem chamar hoje" = top N por prioridade, com telefone/whatsapp do cadastro.
```

### 2.7 Reliability Score v0 (shadow)

```text
score = clamp( 100
  − 20 × min(no_shows_365d, 4)                      [agendamentos.status = no_show]
  − 8  × min(cancel_tardios_365d, 5)                [status = cancelado E updated_at
                                                     dentro de 24h antes de data+horario — APROXIMAÇÃO documentada]
  + 4  × min(sequencia_atual_concluidos, 5)
, 0, 100)

Faixas: ≥85 confiavel | 60–84 normal | 40–59 atencao | <40 risco
Saída SEMPRE inclui fatores: {noShows, cancelTardios, streak} — score explicável, nunca caixa-preta.
Consistência: se clientes.faltas divergir da contagem por status, reportar ambos (não "corrigir" silenciosamente).
USO NESTE CICLO: badge informativo. Proibido bloquear/cobrar com base no score.
```

### 2.8 Rebooking (sugestão pós-checkout)

```text
intervalo_sugerido = mediana(gaps do cliente para o MESMO serviço)
                     fallback1: mediana global de gaps do serviço
                     fallback2: 45 dias
data_sugerida      = data_da_comanda + intervalo_sugerido  (ajustada para dia com janela aberta)
hora_sugerida      = moda do horário histórico do cliente (fallback: mesmo horário da comanda)
rebooking_rate     = % de comandas fechadas com próximo agendamento criado em ≤24h (métrica de acompanhamento)
```

### 2.9 Attach & afinidade

```text
attach_rate           = comandas com ≥1 item produto / total de comandas
afinidade(X→Y)        = P(produto Y | serviço X) = co_ocorrencias / comandas_com_X
lift(X→Y)             = P(Y|X) / P(Y)            [reportar apenas suporte ≥5 e lift >1.2]
Saída: para cada serviço top, até 3 produtos com {pct, lift, amostra}.
```

## 3. Contratos de API (todos GET, read-only, mesmos middlewares vigentes)

### GET `/api/insights/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD`
```json
{
  "range": {"from": "...", "to": "..."},
  "loadFactorPct": 62.4,
  "revpahCentavos": 8930,
  "porProfissional": [{"profissionalId": "...", "nome": "...", "surPct": 71.2, "minutosVendidos": 1440, "minutosDisponiveis": 2020, "noShowMin": 60}],
  "heatmap": [{"dow": 2, "hora": 14, "ocupacaoPct": 18.0}],
  "buracos": [{"data": "...", "profissionalId": "...", "inicio": "14:00", "fim": "15:30", "minutos": 90}],
  "faixas": [{"max": 25, "cor": "#9490a3"}, {"max": 50, "cor": "#f59e0b"}, {"max": 75, "cor": "#f97316"}, {"max": 100, "cor": "#22c55e"}]
}
```

### GET `/api/insights/margin?from&to`
```json
{
  "porServico": [{"servicoId": "...", "nome": "...", "producaoCentavos": 0, "comissaoCentavos": 0, "receitaEmpresaCentavos": 0, "margemPct": 0, "n": 0}],
  "porProfissional": [{"profissionalId": "...", "nome": "...", "producaoCentavos": 0, "comissaoCentavos": 0, "gorjetaLiquidaCentavos": 0, "receitaEmpresaCentavos": 0}],
  "porProduto": [{"produtoId": "...", "nome": "...", "vendaCentavos": 0, "custoCentavos": 0, "lucroBrutoCentavos": 0, "n": 0}],
  "porForma": [{"formaCode": "pix", "valorCentavos": 0, "taxaCentavos": 0, "pesoPct": 0}],
  "ticketMedioCentavos": 0
}
```

### GET `/api/insights/cashflow?days=30`
```json
{
  "curva": [{"data": "...", "brutoCentavos": 0, "taxaCentavos": 0, "liquidoCentavos": 0}],
  "acumulado7dCentavos": 0,
  "acumulado30dCentavos": 0,
  "porForma": [{"formaCode": "credito", "liquidoCentavos": 0, "diasRecebimento": 30}]
}
```

### GET `/api/insights/retention`
```json
{
  "segmentos": [{"nome": "campeoes", "label": "Campeões", "n": 0, "valor180dCentavos": 0}],
  "quemChamar": [{"clienteId": "...", "nome": "...", "whatsapp": "...", "diasDesdeUltima": 0, "intervaloMedianoDias": 0, "risco": "alto", "valor180dCentavos": 0, "prioridade": 0}],
  "novosRetencao": {"total1aVisita90d": 0, "voltaram": 0, "pct": 0},
  "rebookingRatePct": 0,
  "assinaturaCandidatos": [{"clienteId": "...", "nome": "...", "visitas180d": 0, "gastoMensalMedioCentavos": 0}]
}
```
`quemChamar` limitado a 20; `assinaturaCandidatos` = F≥4 e M no quintil 4–5 (analytics only).

### GET `/api/insights/clients/:id/reliability`
```json
{"clienteId": "...", "score": 84, "faixa": "normal", "fatores": {"noShows365d": 1, "cancelTardios365d": 0, "streakConcluidos": 3}, "faltasCadastro": 1, "divergencia": false}
```

### GET `/api/insights/attach`
```json
{"attachRatePct": 12.5, "sugestoes": [{"servicoId": "...", "servicoNome": "...", "produtos": [{"produtoId": "...", "nome": "...", "pct": 32.0, "lift": 2.1, "amostra": 41}]}]}
```

### GET `/api/insights/rebooking/:clienteId?servicoId=...`
```json
{"dataSugerida": "2026-08-05", "horaSugerida": "14:00", "intervaloDias": 28, "base": "cliente|servico|default"}
```

### Waitlist (tabela existente `lista_espera`)
- `GET /api/lista-espera?status=aguardando` — lista com nomes resolvidos
- `POST /api/lista-espera` — {clienteId, servicoId?, profissionalId?, dataPreferencia?, observacoes?} (validação UUID padrão vigente)
- `PATCH /api/lista-espera/:id` — {status: aguardando|contatado|agendado|cancelado}
- `GET /api/lista-espera/candidatos?data&servicoId&profissionalId` — match para um horário vago (mesmo serviço OU serviço nulo; mesmo prof OU prof nulo; data_preferencia nula ou ±3 dias)

### Split payment (correção — sem endpoint novo)
- `POST /checkout/preview` e `/checkout/close` passam a aceitar `payments[]` com N entradas; validador exige `Σ valorCentavos = totalRecebidoCentavos` do preview (erro 422 com mensagem clara). PaymentEngine ratear taxas POR pagamento (verificar `allocation.js` — se já suporta, só destravar validador).

## 4. Superfícies frontend

### 4.1 Dashboard V1.4 (bento — reorganização da aba existente)

| Widget | Conteúdo | Fonte |
|---|---|---|
| **Ação do dia** (topo, full-width) | até 5 cards: "3 buracos hoje (14h–15h30 Ana)", "5 clientes valiosos sumidos → chamar", "attach 8% (meta 13%)", "2 na lista de espera p/ hoje" — cada card com CTA (aba/ação) | occupancy + retention + attach + waitlist |
| Ocupação | load factor da semana (donut, régua V1.3), heatmap dia×hora, ranking SUR por profissional | /insights/occupancy |
| Dinheiro | RevPAH, ticket médio, caixa D+7/D+30 (curva), custo de taxa por forma | /insights/cashflow + /margin |
| Margem | top/bottom serviços por margem, produção×comissão×margem por profissional | /insights/margin |
| Pessoas | donut RFM (segmentos), lista "quem chamar hoje" com botão WhatsApp one-tap | /insights/retention |

Estados: skeleton → dados; vazio ("sem dados no período") sem número inventado; erro = banner padrão com `err.message` integral.

### 4.2 Checkout (pós-fechamento)
Card "Pré-agendar próxima visita?" com data/hora sugeridas (via /insights/rebooking) → confirmar cria agendamento pelo fluxo existente. Dismissível. Meta visível: "clientes com retorno marcado voltam 2× mais".

### 4.3 Agenda
- Badge de score no item (bolinha de cor da faixa + score no detalhe do agendamento, com fatores).
- Ao cancelar agendamento: se `/lista-espera/candidatos` retornar ≥1, mostrar "N na espera para este horário" com botão WhatsApp one-tap por candidato.

### 4.4 WhatsApp one-tap (utilitário `js/utils.js`)
```text
waLink(numero, texto) → https://wa.me/55<numero-limpo>?text=<encodeURIComponent(texto)>
Templates estáticos no frontend (texto não-crítico): lembrete de véspera, "sentimos sua falta", oferta de vaga.
Valores dinâmicos (nome, data, hora) vêm dos dados já exibidos. Disparo SEMPRE manual, um a um.
```

## 5. Não-funcionais

| Item | Regra |
|---|---|
| Performance | /insights/* < 2s com volumetria atual; paginação interna do repository obrigatória |
| Fuso | Cálculos de "hoje/dias" em America/Sao_Paulo (mesma referência do restante do sistema) |
| Dinheiro | Sempre `*_centavos` int; formatação BRL só no frontend (`centsToBRL`) |
| Segurança | Endpoints sob os mesmos middlewares/erros vigentes; nenhum dado de `observacoes` em respostas agregadas |
| Service worker | Bump de versão de cache no release; /api/* nunca cacheado (regra vigente) |
| Testes | Funções puras de cálculo (SUR, RFM, score, cashflow, lift) extraídas e testadas com fixtures — ver Handoff |
