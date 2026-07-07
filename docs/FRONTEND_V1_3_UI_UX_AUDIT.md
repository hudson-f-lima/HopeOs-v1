# HOPE OS V1.3 - Auditoria Visual e Estrutural de UI/UX

## 1. Visão Geral do Estado Atual
O arquivo base `index.html` é um monólito de **2673 linhas** (confirmado via `wc -l` em 2026-07-07, já com a área de Clientes incluída) que concentra todo o HTML, CSS e JavaScript (lógica de apresentação e chamadas de API). Embora funcional e integrado com o backend V1.2, o visual atual tem um aspecto de "painel técnico" e carece da fluidez e sofisticação propostas pela V1.3.

Nenhum teste automatizado cobre este arquivo: os 58 testes de `npm run test:gate` são 100% backend (validators, RPCs, migrations, engines financeiros). Qualquer regressão introduzida pela V1.3 só será detectada por QA manual — isso deve ser tratado como constraint de processo, não como detalhe.

## 2. Mapa de Telas e Navegação (Atual vs. Proposto)

| Elemento | Estado Atual (V1.2) | Proposta V1.3 (Premium) |
| :--- | :--- | :--- |
| **Navegação** | Bottom Nav fixa com: Agenda, Comanda, Dashboard, **Mais** | Bottom Nav fixa com: Agenda, Comanda, Dashboard, **Avatar (Gestão)** |
| **Agenda** | Calendário superior simples, filtros em texto, timeline básica. | Calendário Booksy-like, avatares para profissionais, visualização focada no dia, linha de tempo destacada, FAB unificado. |
| **Comanda** | Formulários verticais padrão, cálculo de totais ao final. | Smart Cart visual, fluxo guiado (Cliente -> Serviços -> Produtos -> Pagamento), preview transparente e fixo. |
| **Dashboard** | Cards simples em `grid-template-columns: repeat(2, 1fr)`. | Bento Grid expansivo, agrupamento inteligente (receita, ocupação, alertas). |
| **Cadastros** | Ficam escondidos na aba "Mais" como sub-tabs: Serviços, Profissionais, Produtos, Pagamentos, **Clientes**. | Ficam na "Gestão/Conta", acessados pelo Avatar via Bottom Sheet (Mobile) ou Popover (Desktop). |
| **Clientes (específico)** | Lista renderiza **1481+ registros reais** (confirmado em produção) inteiros no DOM via `innerHTML`, sem paginação/virtualização/busca. | Não definido no blueprint — mover essa lista para dentro de um bottom sheet (viewport menor) sem resolver a escala primeiro **piora** a experiência, não melhora. |

## 3. Inconsistências e Pontos Críticos de Risco

### 3.1 Arquitetura e Código (Risco Técnico: Baixo/Médio)
* **Monolito de Código:** O CSS está embutido no `<head>` (linhas 14 a 272). A alteração visual maciça exigirá muito cuidado para não quebrar os seletores do JavaScript que manipulam o DOM.
* **Estilos Inline:** **107 ocorrências** de `style="..."` (confirmado via grep), não "alguns" — a remoção gradual precisa de fasing explícito por tela, senão nunca sai do backlog.
* **Escala de dados sem estratégia (Risco: Alto, não visto antes):** `renderList()` monta a lista inteira no DOM sem paginação. Com Clientes em 1481+ linhas, isso já é pesado na aba Mais atual; mover para bottom sheet (Etapa 3/7) sem resolver isso é executar a mesma falha num espaço menor. Precisa de busca-primeiro (filtrar antes de renderizar) ou paginação antes da Etapa 7.

### 3.2 UI e Design System (Risco Visual: Alto)
* **Tokens Ausentes:** Não há tokens estruturados para `glassmorphism`, sombras avançadas (`elevation` limitadas), ou tipografia (usa `system-ui` sem fontes premium importadas).
* **Ausência do Avatar:** O botão "Mais" precisa ser removido e substituído pela lógica de Avatar/Gestão, que não existe atualmente.

### 3.3 Acessibilidade e Usabilidade (Risco de UX: Alto)
* **Dialogs Nativos (Risco Funcional, não só cosmético):** só **3 usos** de `confirm()` no código (confirmado via grep), mas cada um protege uma ação destrutiva real: cancelar agendamento, marcar no-show, e esvaziar todos os vínculos serviço×profissional de um profissional. `confirm()` é síncrono; um modal customizado exige reescrever os 3 fluxos para async — qualquer bug na wiring pode deixar uma ação destrutiva passar sem confirmação real. Tratar como risco funcional, testar cada um dos 3 fluxos individualmente depois da troca.
* **Acessibilidade:** Botões iconográficos (como setas da semana e FAB) carecem de atributos `aria-label`. Labels não estão estritamente vinculadas via `for` aos seus inputs.
* **Feedback de Ações — arquitetura dupla já existe e precisa ser preservada:** os banners (`.banner-error`, `.banner-ok`, 19 chamadas de `showBanner()`) cobrem fluxos fora de modal (agenda, checkout, toggles). Para fluxos **dentro** de modal (criar/editar em qualquer cadastro), existe hoje um segundo mecanismo — 8 elementos `.modal-error` inline (`svError`, `pfError`, `pdError`, `fmError`, `clError`, `aeError`, `vnError`...) — construído porque o banner global fica escondido atrás do `z-index` do modal-backdrop. Qualquer sistema de Toast novo precisa herdar essa separação (toast para fora de modal, mensagem inline para dentro de modal), senão reintroduz o bug de erro invisível atrás do modal que essa arquitetura dupla já resolveu.
* **"Mínimo texto" tem limite:** aplica-se a textos estáticos do frontend (ex: "avise o Hudson"), mas não pode se aplicar às mensagens de erro vindas do backend (`err.message`) — essas precisam continuar aparecendo verbatim, porque frequentemente comunicam um bloqueio de regra de negócio real (ex: "Produto ativo não pode vender abaixo do custo").

## 4. Prioridades de Ação (Matriz de Impacto)

1. **Design System & CSS (Alta Prioridade, Baixo Risco):** Criar os tokens de cor, glass, tipografia e bordas sem quebrar a estrutura.
2. **Navegação e Avatar (Alta Prioridade, Risco Médio — revisado):** Trocar o botão "Mais" pela Bottom Sheet de Gestão e rotear os cadastros para lá. Risco deixou de ser "baixo" porque a lista de Clientes (1481+ registros, ver 3.1) precisa de estratégia de escala antes de entrar num bottom sheet, e a Cadastros UI (incluindo Clientes) tem zero dias de uso real em produção até agora.
3. **Agenda Premium (Alta Prioridade, Médio Risco):** Refatorar o header do calendário, adicionar avatares de profissionais e estilizar os cards de agendamento. Exige cuidado com o JS que desenha o grid.
4. **Comanda Smart Cart (Média Prioridade, Alto Risco):** Modificar a tela de Comanda exige muita cautela com o formulário e chamadas do CheckoutEngine, que não podem sofrer regressão.
5. **Acessibilidade e Componentes Custom (Média Prioridade, Risco Médio — revisado):** Trocar `confirm()` por modais é risco funcional em ações destrutivas (ver 3.3), não só cosmético — testar os 3 fluxos individualmente. Adicionar atributos ARIA e limpezas gerais de HTML continuam baixo risco.

## 5. Governança (resolvido)

O `CLAUDE.md` proibia "dashboard sofisticado" sem decisão explícita do usuário. Isso foi resolvido em 2026-07-07: o usuário autorizou explicitamente essa exceção para o escopo do V1.3 (registrado no `CLAUDE.md`, seção "V1.3 — Frontend UI/UX Premium"). A Etapa 6 (Dashboard bento) pode prosseguir sem essa pendência de governança.
