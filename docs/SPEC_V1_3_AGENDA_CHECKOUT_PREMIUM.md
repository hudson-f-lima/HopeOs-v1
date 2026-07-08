# SPEC TÉCNICO: V1.3 Agenda + Checkout Premium

**Data**: 2026-07-08
**Escopo**: Implementação completa do redesign V1.3 (tema claro, ocupação %, split payment)
**Estimativa**: 6-7h de trabalho
**Branch**: `codex/v1.3-agenda-checkout-premium`

---

## 1. DESIGN SYSTEM: TEMA CLARO

### Cores
| Token | Valor | Uso |
|---|---|---|
| `--bg-app` | `#fff` | Fundo principal de telas |
| `--bg-app-light` | `#faf9ff` | Backgrounds de inputs, campos |
| `--bg-surface` | `#fff` | Cards, containers |
| `--bg-glass-light` | `#f3f1fb` | Backgrounds de buttons, pills |
| `--primary` | `#7c6af7` | CTA, selected states, highlights |
| `--primary-light` | `#efe9ff` | Background de primary text |
| `--text-primary` | `#171620` | Título, texto principal |
| `--text-secondary` | `#6d6a7c` | Subtítulos, labels |
| `--text-tertiary` | `#8b87a0` | Labels, helpers, hints |
| `--text-disabled` | `#c9c5da` | Texto desabilitado |
| `--border` | `#ece9f7` | Borders padrão |
| `--border-light` | `#f4f2fa` | Borders leves |
| `--error` | `#dc2626` | Estado de erro |
| `--success` | `#16a34a` | Estado de sucesso |
| `--warning` | `#f59e0b` | Estado de aviso |

### Typography
- **Heading 1**: 22px, weight 800, letter-spacing -0.02em (títulos de tela)
- **Heading 2**: 17px, weight 800 (subseções)
- **Label**: 11px-13px, weight 700-800, color --text-tertiary (labels de campo)
- **Body**: 13.5px, weight 500-600 (corpo de texto)
- **Small**: 11.5px-12px, weight 700 (hints, subtextos)

### Spacing
- **Padding internal**: 16px (padrão)
- **Padding cards**: 12px-14px
- **Gap entre elementos**: 8-12px
- **Bottom nav padding**: 8px 4px 18px

### Shadows
- **Elevation 1**: `0 2px 10px rgba(23,22,32,0.04)`
- **Elevation 2**: `0 6px 16px rgba(23,22,32,0.08)`
- **Elevation 3**: `0 10px 24px rgba(23,22,32,0.12)`
- **Elevation 4**: `0 12px 26px rgba(124,106,247,0.34)` (FAB)

### Border Radius
- **Small**: 10px (buttons, small components)
- **Medium**: 12px (inputs, cards)
- **Large**: 14px-16px (major cards)
- **Pill**: 999px (bottom nav, pills)

---

## 2. AGENDA PREMIUM

### Day Pills Component
**Elemento**: 7 dias horizontais, cada com:
- **Label**: DOM/SEG/TER/etc (9.5px, weight 700, color --text-tertiary)
- **Número**: dia do mês (16px, weight 800, color --primary se selected, else --text-primary)
- **Ocupação**: % em cor (9.5px, weight 700)
  - 0-25%: gray
  - 26-50%: yellow
  - 51-75%: orange
  - 76-100%: green (#22c55e)
- **Selected state**: background --primary, text white, rounded 12px

**Data**: derivada de `state.weekAgenda[dateStr].length / (activeProfs * CAPACITY_SLOTS_PER_PROF) * 100`

### Info Bar Component
3 cards em linha:
1. **Data**: "🗓️ TER, 07 de Julho" (11.5px, weight 700)
2. **Agendamentos**: "👥 12 agend." (11.5px, weight 700)
3. **Ocupação**: "⭕ 72% Ocupação" com donut visual
   - SVG circle: `stroke-dasharray` baseado em % ocupação
   - Cor: verde (#22c55e) para preenchimento

### Timeline Improvements
Mantém a estrutura grid atual, adiciona:
- Avatares com **iniciais + cor de profissional** (width 36px, height 36px, radius 50%)
- Background color: `PROF_COLORS[idx % 7]` (já existe em state.js)
- First name do profissional embaixo das iniciais (11px, weight 700)

---

## 3. CHECKOUT PREMIUM

### Abas (Serviços / Produtos)
Toggle visual:
- Background: --bg-glass-light
- 2 botões lado-a-lado, radius 12px, padding 8px
- Selected: background --bg-surface com sombra subtle, color --primary
- Not selected: color --text-tertiary

**Behavior**: 
- Click aba → renderiza `visibleCartItems` para aquela aba
- Estado: `state.checkoutTab` (produção já tem isso, checkout.js linha 46)

### Item Card (Serviço/Produto)
Layout flex horizontal:
- **Esquerda**: nome (13.5px, weight 800), subtítulo (11px, gray)
- **Direita**: 
  - Preço (13.5px, weight 800)
  - Botão ⇄ (swap) — muda item abrindo picker
  - Botão 🗑️ (remove) — remove da cart

**Behavior**:
- Swap abre sheet com picker (lista de serviços/produtos)
- Remove deleta do array `cart[tab]`

### Gorjeta Stepper
3 elementos em linha:
- Botão "−" (30×30, radius 9px, bg --bg-glass-light, color --primary)
- Valor em grande (15px, weight 800, color --text-primary)
- Botão "+" (30×30, radius 9px, bg --bg-glass-light, color --primary)

**Behavior**:
- Incrementa/decrementa `state.tip` de 1 em 1
- Recalcula total automaticamente

### Resumo Financeiro
3 linhas:
- **Subtotal**: valor (13px)
- **Gorjeta**: valor (13px)
- **Total**: valor em grande (15px, weight 800, color --primary)

**Cálculo**:
```
subtotal = sum(servicos) + sum(produtos)
total = subtotal + tip
```

### Split Payment
**Toggle**:
- Background: --bg-glass-light (18px height, radius 999px)
- Knob branco com sombra, posição left baseado em `state.splitEnabled`

**Se disabled** (split payment OFF):
- 1 select com formas de pagamento (PIX, Dinheiro, Débito, Crédito, Online)

**Se enabled** (split payment ON):
- Múltiplas linhas (1 por split):
  - Select de forma (disabled na última linha se houver > 1)
  - Input ou display de valor
  - Última linha: **valor é calculado automaticamente** (absorve o restante)
  - Botão ✕ para remover (exceto se é última e única linha)

**Behavior**:
- Botão "Adicionar forma" cria nova linha
- Última linha: `amount = total - sum(anterior)`
- Remover: se última e única, volta pro modo disabled

---

## 4. DADOS NOVOS / MUDANÇAS

### % Ocupação
**Onde vem**: Frontend-side (não precisa backend novo)
**Fórmula**:
```javascript
function occupancyForDate(dateStr) {
  const activeProfs = Math.max(1, activeProfissionais().length);
  const agendamentos = activeAgendaItemsForDate(dateStr).length;
  return Math.min(100, Math.round((agendamentos / (activeProfs * 8)) * 100));
}
```
**Constante**: `CAPACITY_SLOTS_PER_PROF = 8` (já existe em state.js)

### Split Payment
**Estado novo em state**:
```javascript
state.checkoutTab = 'servicos'; // ou 'produtos'
state.tip = 0; // em centavos
state.splitEnabled = false;
state.splits = [{ id: 's1', method: 'PIX', amount: '' }]; // última é sempre auto
```

**Validação**:
- Última linha `amount` é calculada automaticamente
- Se usuario digita valores manuais, último ajusta automaticamente
- Botão "Finalizar" só enabled se `total >= 0`

---

## 5. ESTRUTURA DE ARQUIVOS (MANTÉM ATUAL)

```
js/
├── ui/
│   ├── agenda.js     (renderTimeline, renderDayPills, occupancyForDate novo)
│   └── checkout.js   (tabs, stepper gorjeta, split payment novo)
├── state.js          (splitEnabled, splits, checkoutTab mantêm)
└── utils.js          (novos helpers: fmtOccupancyColor, etc)

css/
└── app.css           (tema claro: --colors, --spacing, --shadows novos)

index.html           (nenhuma mudança estrutural, só restyling)
```

---

## 6. FLUXOS CRÍTICOS

### Fluxo Agenda
1. Usuário clica dia pill
2. Timeline renderiza com ocupação visual
3. Info bar mostra % ocupação do dia
4. Clique em profissional/serviço → detalhes ou novo agendamento

### Fluxo Checkout
1. Usuário clica "Iniciar comanda" (já existe)
2. Seleciona entre Serviços/Produtos via aba
3. Clica "+" ou lista e adiciona items
4. Ajusta gorjeta com stepper
5. Ativa split payment (opcional)
6. Seleciona forma(s) de pagamento
7. Clica "Finalizar pagamento"

### Fluxo Split Payment
1. Toggle "Dividir pagamento" ativa
2. Interface muda para múltiplas linhas
3. Usuário insere valores em N formas
4. Última linha calcula automaticamente: `último = total - sum(anterior)`
5. Validação: `último >= 0` para ativar "Finalizar"

---

## 7. TESTES OBRIGATÓRIOS (QA Manual)

- [ ] Agenda: day pills mostram ocupação correta (% visual + cor)
- [ ] Info bar: data, agendamentos, ocupação refletem o dia selecionado
- [ ] Timeline: avatares de profissionais renderizam com cores
- [ ] Checkout: abas Serviços/Produtos funcionam
- [ ] Stepper gorjeta: +/− incrementa/decrementa e recalcula total
- [ ] Split payment: toggle ativa/desativa UI
- [ ] Split payment: última linha calcula automaticamente
- [ ] Finalizar: desabilitado se split payment não OK (último < 0)
- [ ] Mobile: bottom nav, responsividade, tappable areas >= 44px
- [ ] Service worker: precacheia novos CSS/JS

---

## 8. DECISÕES DE DESIGN CONFIRMADAS

✅ **Tema**: Claro/plano (branco, sombras leves, cantos 12-16px)  
✅ **Ocupação %**: Frontend-side, sem backend novo  
✅ **Fotos de profissional**: Avatares (iniciais + cor) por enquanto, upload fica para futuro  
✅ **Split payment**: Sim, implementar agora  
✅ **Base de código**: Mantém modular ES6, sem framework, backend truth  

---

**Próximo passo**: Ler o plano granular de tasks em `docs/PLAN_V1_3_TASKS.md`
