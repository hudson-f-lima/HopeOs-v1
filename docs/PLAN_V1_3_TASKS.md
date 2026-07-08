# PLANO GRANULAR V1.3: 23 TASKS ATÔMICAS

**Estimativa**: 6-7h total (23 tasks × 15-20min média)  
**Branch**: `codex/v1.3-agenda-checkout-premium`  
**Status**: Pronto para iniciar

---

## FASE 1: FUNDAÇÃO VISUAL (1-2h, 6 tasks)

### Task 1.1: Criar CSS variables de tema claro
**Tempo**: 15min  
**Arquivo**: `css/app.css` (início do arquivo)  
**O quê**: Adicionar bloco `:root` com todas as cores/spacing da SPEC (seção 1)  
**Resultado**: Novo bloco CSS com 30+ variáveis  
**Validação**: `grep --color` mostra todas as --variables definidas

---

### Task 1.2: Remover fundo degradê/glass do body
**Tempo**: 10min  
**Arquivo**: `css/app.css` (body rule)  
**O quê**: Trocar `background: linear-gradient(...) + backdrop-filter: blur` por `background: #fff`  
**Resultado**: App com fundo branco simples  
**Validação**: Preview mostra fundo branco no móvel

---

### Task 1.3: Remover 30 inline styles de componentes principais
**Tempo**: 30min (3 arquivos × 10min cada)  
**Arquivos**:  
  - `index.html`: modais, sheets, cards
  - `js/ui/agenda.js`: renderAgBlock, renderProfCol
  - `js/ui/checkout.js`: items, buttons
**O quê**: Mover `style=""` inline → `.class-name` em CSS  
**Exemplo**: `style="padding:12px;border-radius:12px;background:#fff;"` → `.card` class  
**Resultado**: 30 `.css-class` novos em `app.css`, 0 inline styles em arquivo crítico  
**Validação**: Grep `style="` no arquivo retorna 0 (ou só inline dinâmicos tipo `color:${var}`)

---

### Task 1.4: Padronizar sombras (elevation)
**Tempo**: 15min  
**Arquivo**: `css/app.css` (seção de utilidades)  
**O quê**: Criar `.elevation-1/2/3/4` classes com box-shadow da SPEC  
**Resultado**: Cards/modals/FAB usam `.elevation-*` em vez de inline `box-shadow`  
**Validação**: Preview: sombras suaves, consistentes

---

### Task 1.5: Padronizar border-radius
**Tempo**: 10min  
**Arquivo**: `css/app.css`  
**O quê**: Classes `.rounded-sm/md/lg/pill` para 10px/12px/14px/999px  
**Resultado**: Todos os buttons/cards/inputs usam classes padronizadas  
**Validação**: Nenhum inline `border-radius`

---

### Task 1.6: Aplicar tipografia nova (font-size/weight padronizados)
**Tempo**: 20min  
**Arquivo**: `css/app.css`, `index.html` (headers)  
**O quê**: Classes `.h1/.h2/.label/.body/.small` com font-size/weight/color da SPEC  
**Resultado**: Tipografia consistente em toda a app  
**Validação**: Preview: fontes alinhadas à spec

---

## FASE 2: AGENDA PREMIUM (2-3h, 8 tasks)

### Task 2.1: Criar função `occupancyForDate(dateStr)`
**Tempo**: 15min  
**Arquivo**: `js/ui/agenda.js` (antes de `renderAgBlock`)  
**O quê**: Função que calcula `(agendamentos / (profs * 8)) * 100`  
**Código**:
```javascript
function occupancyForDate(dateStr) {
  const activeProfs = Math.max(1, activeProfissionais().length);
  const agendamentos = activeAgendaItemsForDate(dateStr).length;
  return Math.min(100, Math.round((agendamentos / (activeProfs * CAPACITY_SLOTS_PER_PROF)) * 100));
}
```
**Validação**: `occupancyForDate('2026-07-07')` retorna número 0-100

---

### Task 2.2: Criar função `occupancyColor(percent)`
**Tempo**: 10min  
**Arquivo**: `js/ui/agenda.js`  
**O quê**: Mapeia % para cor (0-25: gray, 26-50: yellow, 51-75: orange, 76-100: green)  
**Código**:
```javascript
function occupancyColor(percent) {
  if (percent <= 25) return '#9490a3'; // gray
  if (percent <= 50) return '#f59e0b'; // yellow
  if (percent <= 75) return '#f97316'; // orange
  return '#22c55e'; // green
}
```
**Validação**: `occupancyColor(80)` retorna `#22c55e`

---

### Task 2.3: Renderizar day pills com ocupação %
**Tempo**: 25min  
**Arquivo**: `js/ui/agenda.js` (função `renderDayPills`)  
**O quê**: Modificar HTML da aba de dias para incluir ocupação visual + cor  
**Mudança**: Cada `day-pill` agora exibe:
  - Dia da semana (DOM/SEG/TER/etc)
  - Número (7/8/9)
  - % ocupação com cor dinâmica
**Validação**: Preview mostra 7 dias com % e cores diferentes

---

### Task 2.4: Criar info bar com data/agendamentos/ocupação
**Tempo**: 20min  
**Arquivo**: `js/ui/agenda.js`, `css/app.css`  
**O quê**: Novo card (ou atualizar existente) mostrando 3 infos lado a lado  
**HTML**: 3 divs com grid, cada um com ícone + label + valor  
**Validação**: Preview mostra info bar com cores corretas

---

### Task 2.5: Adicionar donut visual de ocupação no info bar
**Tempo**: 20min  
**Arquivo**: `js/ui/agenda.js`  
**O quê**: SVG circle com `stroke-dasharray` baseado em % ocupação  
**Fórmula**: `dasharray = (pct / 100) * circumference` onde circumference ≈ 40.8  
**Validação**: Donut preenchido em verde proporcional ao %

---

### Task 2.6: Melhorar avatares de profissional na timeline
**Tempo**: 15min  
**Arquivo**: `js/ui/agenda.js`, `css/app.css`  
**O quê**: Renderizar inicial + cor + nome do profissional embaixo  
**Mudança**: Header da coluna mostra avatar 36×36 com background colorido + initials em branco  
**Validação**: Timeline headers mostram avatares bonitos com nomes

---

### Task 2.7: Adicionar `MONTH_LABELS` em português
**Tempo**: 5min  
**Arquivo**: `js/ui/agenda.js` (já adicionado no diff anterior, linhas 59)  
**O quê**: Array `['Jan', 'Fev', 'Mar', ...]` para formatação de data legível  
**Validação**: `formatAgendaDate('2026-07-07')` retorna "Terça-feira, 07 de Julho"

---

### Task 2.8: Atualizar `renderWeekStats()` para usar cores de ocupação
**Tempo**: 10min  
**Arquivo**: `js/ui/agenda.js` (função `renderWeekStats`)  
**O quê**: % ocupação da semana usa `occupancyColor()` para mostrar cor dinâmica  
**Validação**: Label de ocupação semanal tem cor correta

---

## FASE 3: CHECKOUT PREMIUM (2-3h, 7 tasks)

### Task 3.1: Adicionar `checkoutTab` e `splitEnabled` ao state
**Tempo**: 10min  
**Arquivo**: `js/state.js`  
**O quê**: Novo estado:
```javascript
export const state = {
  // ... existente
  checkoutTab: 'servicos', // ou 'produtos'
  tip: 0, // em centavos
  splitEnabled: false,
  splits: [{ id: 's1', method: 'PIX', amount: '' }],
};
```
**Validação**: `state.checkoutTab` existe e padrão é 'servicos'

---

### Task 3.2: Renderizar abas Serviços/Produtos no checkout
**Tempo**: 20min  
**Arquivo**: `js/ui/checkout.js`  
**O quê**: Novo `<div>` com dois botões aba que mudam `state.checkoutTab`  
**HTML**: Flex row com toggle style (um selecionado, outro not)  
**Validação**: Cliques nas abas alternam a cor

---

### Task 3.3: Filtrar `visibleCartItems` por aba selecionada
**Tempo**: 15min  
**Arquivo**: `js/ui/checkout.js`  
**O quê**: Modificar lógica que renderiza items para mostrar só da aba atual  
**Mudança**: `visibleCartItems = cart[checkoutTab]` em vez de combinar ambas  
**Validação**: Muda de aba = itens renderizados mudam

---

### Task 3.4: Adicionar botões +/- para stepper de gorjeta
**Tempo**: 20min  
**Arquivo**: `js/ui/checkout.js`, `css/app.css`  
**O quê**: Renderizar stepper: botão -  | valor grande | botão +  
**Comportamento**: Click + incrementa `state.tip`, click - decrementa (mín 0)  
**Validação**: Stepper funciona e recalcula total automaticamente

---

### Task 3.5: Implementar split payment toggle
**Tempo**: 25min  
**Arquivo**: `js/ui/checkout.js`, `css/app.css`  
**O quê**: Renderizar toggle switch com css animado, toggle `state.splitEnabled`  
**HTML**: Div com posição absolute de knob baseado em `splitEnabled`  
**Validação**: Toggle visual funciona e muda interface

---

### Task 3.6: Renderizar formas de pagamento (disabled split)
**Tempo**: 15min  
**Arquivo**: `js/ui/checkout.js`  
**O quê**: Quando `!splitEnabled`, mostrar `<select>` com opções: PIX, Dinheiro, Débito, Crédito, Online  
**Validação**: Select renderiza e permite escolher forma

---

### Task 3.7: Renderizar split rows (enabled split)
**Tempo**: 30min  
**Arquivo**: `js/ui/checkout.js`, `css/app.css`  
**O quê**: Quando `splitEnabled`, renderizar múltiplas linhas de split:
  - Cada linha: `<select>` forma + `<input>` ou display valor + botão ✕
  - Última linha: valor calculado (disabled input, apenas display)
  - Botão "Adicionar forma" adiciona nova linha
  - Botão ✕ remove linha (exceto última se única)
**Validação**: Split rows renderizam e calculam automaticamente

---

## FASE 4: INTEGRAÇÃO + EDGE CASES (1h, 2 tasks)

### Task 4.1: Validação de split payment (total >= 0)
**Tempo**: 15min  
**Arquivo**: `js/ui/checkout.js`  
**O quê**: Botão "Finalizar pagamento" só enabled se `splitTotal >= 0`  
**Lógica**: `const lastAmount = total - sumManualSplits; enabled = lastAmount >= 0;`  
**Validação**: Preview mostra botão disabled/enabled baseado em validação

---

### Task 4.2: Atualizar service-worker.js para precachear CSS/JS novos
**Tempo**: 10min  
**Arquivo**: `service-worker.js` (array SHELL_ASSETS)  
**O quê**: Garantir que `./css/app.css` e todos os `./js/*.js` estão na lista de precache  
**Validação**: Service worker lista contém todos os arquivos críticos

---

## QA + TESTES (30min, extras)

### Task 5.1: Teste manual — Agenda ocupação visual
- [ ] Day pills mostram % corretamente (0-100)
- [ ] Cores escalonam de gray → yellow → orange → green
- [ ] Info bar data/agendamentos/ocupação atualizam ao trocar dia
- [ ] Donut visual acompanha %

### Task 5.2: Teste manual — Checkout tabs + stepper
- [ ] Abas Serviços/Produtos alternam
- [ ] Items renderizam só na aba selecionada
- [ ] Stepper +/− incrementa/decrementa
- [ ] Total recalcula

### Task 5.3: Teste manual — Split payment
- [ ] Toggle ativa/desativa interface
- [ ] Adicionar forma cria linha nova
- [ ] Remover linha deleta (exceto última/única)
- [ ] Última linha calcula automaticamente
- [ ] Botão Finalizar disabled se split inválido

### Task 5.4: Teste mobile responsivo
- [ ] Bottom nav acessível
- [ ] Inputs/buttons > 44px height
- [ ] Sem scroll horizontal
- [ ] Modais/sheets ocupam altura correta

---

## RESUMO POR FASE

| Fase | Tasks | Tempo | Saída |
|---|---|---|---|
| 1. Fundação visual | 1.1-1.6 | 1-2h | CSS tema claro, variáveis, utilities |
| 2. Agenda | 2.1-2.8 | 2-3h | Ocupação %, day pills, avatares, info bar |
| 3. Checkout | 3.1-3.7 | 2-3h | Abas, stepper, split payment |
| 4. Integração | 4.1-4.2 | 30min | Validações, service worker |
| 5. QA | 5.1-5.4 | 30min | Testes manuais, responsividade |

**Total**: 6-7h para ficar pronto em produção

---

## PRÓXIMOS PASSOS

1. ✅ Criar branch `codex/v1.3-agenda-checkout-premium`
2. ✅ Ler spec completo (este doc + SPEC_V1_3_...)
3. ⏳ Começar Task 1.1 (CSS variables)
4. ⏳ Proceder sequencialmente por fase

**Goto**: Fase 1, Task 1.1 (CSS variables de tema claro)
