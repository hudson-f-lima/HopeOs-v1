# HOPE OS V1.3 - Auditoria Visual e Estrutural de UI/UX

## 1. Visão Geral do Estado Atual
O arquivo base `index.html` é um monólito de ~2.400 linhas que concentra todo o HTML, CSS e JavaScript (lógica de apresentação e chamadas de API). Embora funcional e integrado com o backend V1.2, o visual atual tem um aspecto de "painel técnico" e carece da fluidez e sofisticação propostas pela V1.3.

## 2. Mapa de Telas e Navegação (Atual vs. Proposto)

| Elemento | Estado Atual (V1.2) | Proposta V1.3 (Premium) |
| :--- | :--- | :--- |
| **Navegação** | Bottom Nav fixa com: Agenda, Comanda, Dashboard, **Mais** | Bottom Nav fixa com: Agenda, Comanda, Dashboard, **Avatar (Gestão)** |
| **Agenda** | Calendário superior simples, filtros em texto, timeline básica. | Calendário Booksy-like, avatares para profissionais, visualização focada no dia, linha de tempo destacada, FAB unificado. |
| **Comanda** | Formulários verticais padrão, cálculo de totais ao final. | Smart Cart visual, fluxo guiado (Cliente -> Serviços -> Produtos -> Pagamento), preview transparente e fixo. |
| **Dashboard** | Cards simples em `grid-template-columns: repeat(2, 1fr)`. | Bento Grid expansivo, agrupamento inteligente (receita, ocupação, alertas). |
| **Cadastros** | Ficam escondidos na aba "Mais" como sub-tabs. | Ficam na "Gestão/Conta", acessados pelo Avatar via Bottom Sheet (Mobile) ou Popover (Desktop). |

## 3. Inconsistências e Pontos Críticos de Risco

### 3.1 Arquitetura e Código (Risco Técnico: Baixo/Médio)
* **Monolito de Código:** O CSS está embutido no `<head>` (linhas 14 a 272). A alteração visual maciça exigirá muito cuidado para não quebrar os seletores do JavaScript que manipulam o DOM.
* **Estilos Inline:** Presença de estilos como `style="margin:16px;border:1px solid #f3c6c6;"`. Devem ser extraídos para classes utilitárias no CSS.

### 3.2 UI e Design System (Risco Visual: Alto)
* **Tokens Ausentes:** Não há tokens estruturados para `glassmorphism`, sombras avançadas (`elevation` limitadas), ou tipografia (usa `system-ui` sem fontes premium importadas).
* **Ausência do Avatar:** O botão "Mais" precisa ser removido e substituído pela lógica de Avatar/Gestão, que não existe atualmente.

### 3.3 Acessibilidade e Usabilidade (Risco de UX: Alto)
* **Dialogs Nativos:** O sistema depende do `confirm()` nativo do navegador para exclusões ou ações críticas, o que quebra a imersão premium.
* **Acessibilidade:** Botões iconográficos (como setas da semana e FAB) carecem de atributos `aria-label`. Labels não estão estritamente vinculadas via `for` aos seus inputs.
* **Feedback de Ações:** Os banners (`.banner-error`, `.banner-ok`) são funcionais, mas estáticos. Precisamos de Toast Notifications fluidas (Material 3).

## 4. Prioridades de Ação (Matriz de Impacto)

1. **Design System & CSS (Alta Prioridade, Baixo Risco):** Criar os tokens de cor, glass, tipografia e bordas sem quebrar a estrutura.
2. **Navegação e Avatar (Alta Prioridade, Baixo Risco):** Trocar o botão "Mais" pela Bottom Sheet de Gestão e rotear os cadastros para lá.
3. **Agenda Premium (Alta Prioridade, Médio Risco):** Refatorar o header do calendário, adicionar avatares de profissionais e estilizar os cards de agendamento. Exige cuidado com o JS que desenha o grid.
4. **Comanda Smart Cart (Média Prioridade, Alto Risco):** Modificar a tela de Comanda exige muita cautela com o formulário e chamadas do CheckoutEngine, que não podem sofrer regressão.
5. **Acessibilidade e Componentes Custom (Média Prioridade, Baixo Risco):** Trocar `confirm()` por modais, adicionar atributos ARIA e limpezas gerais de HTML.
