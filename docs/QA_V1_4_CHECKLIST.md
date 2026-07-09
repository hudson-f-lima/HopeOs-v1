# KortexOS V1.4 — QA Manual Checklist

**Arquivo:** `docs/QA_V1_4_CHECKLIST.md`  
**Objetivo:** Guia passo a passo para validação manual visual e funcional da versão V1.4 no Mobile (375px) e Desktop.  
**Status:** GERADO / AGUARDA RED TEAM  
**Data:** 2026-07-09

---

## Suíte 1: Ocupação & Dashboard Bento
*Esta suíte valida a renderização e interatividade da nova UI do Dashboard.*

### Cenário 1.1: Renderização do Grid Bento (Desktop vs Mobile)
- [ ] **Mobile (375px):** Todos os painéis se empilham verticalmente sem quebras, cortes ou overflows laterais.
- [ ] **Desktop:** Grade bento exibe os painéis organizados de forma equilibrada (estética premium).
- [ ] Os 4 stat-cards clássicos no topo estão presentes e alinhados.

### Cenário 1.2: Heatmap de Ocupação & SUR
- [ ] O heatmap de Ocupação (dia x hora) pinta as células utilizando as classes de cores vindas do backend (`faixa-alta`, `faixa-media`, `faixa-baixa`).
- [ ] O ranking SUR exibe corretamente os profissionais ordenados pela taxa de ocupação.
- [ ] O donut load factor (SVG) é exibido perfeitamente de acordo com a porcentagem calculada.

### Cenário 1.3: Widget Dinheiro & Margem
- [ ] Curva D+30 é renderizada utilizando barras SVG simples sem erros ou distorções.
- [ ] Valores são formatados usando a utilidade `centsToBRL` (com exibição em reais).
- [ ] Detalhamento do custo das taxas por forma de pagamento está legível.

### Cenário 1.4: Atualização de Dados (Refresh & Auto-Update)
- [ ] Clicar no botão "Atualizar" do dashboard força uma nova chamada de API e recarrega os painéis sem piscar a tela inteira.
- [ ] Ao fechar uma comanda no Checkout, navegar de volta para o Dashboard e confirmar se os dados foram atualizados via trigger `checkout:closed`.

---

## Suíte 2: Retenção & Ações (WhatsApp One-tap)
*Validação da aba Dashboard no painel "Pessoas" e fluxos de reengajamento.*

### Cenário 2.1: Painel "Quem Chamar Hoje" (RFM & Churn)
- [ ] Painel exibe no máximo 20 clientes em risco conforme limite estabelecido.
- [ ] Cada linha exibe o nome do cliente, o score de confiabilidade e o botão do WhatsApp.
- [ ] Clicar no botão do WhatsApp abre uma nova aba com o link canônico `wa.me/55...` preenchido com a mensagem de reengajamento sugerida.

### Cenário 2.2: Degradação sem dados
- [ ] Se a resposta da API retornar uma lista vazia ou falhar, o dashboard exibe um aviso amigável ("Sem clientes para reengajar hoje" ou similar) em vez de quebrar a tela.

---

## Suíte 3: Checkout Split Payment & Rebooking
*Fluxo financeiro-crítico e automação pós-fechamento.*

### Cenário 3.1: Dividir Pagamento (Split UI)
- [ ] Abrir uma comanda, adicionar itens e verificar que o botão "Dividir pagamento" está habilitado apenas após o preview de comanda.
- [ ] Clicar no toggle de Split Payment. O container de splits deve renderizar com a primeira linha preenchida com a forma padrão e o valor total.
- [ ] Clicar em "Adicionar forma de pagamento". Deve criar uma nova linha e recalcular o campo "Restante" automaticamente.
- [ ] Tentar fechar a comanda com a soma dos splits diferente do valor total do preview. O sistema deve bloquear a submissão no cliente (botão "Fechar comanda" desabilitado ou erro visível) e retornar `422 (PAYMENT_TOTAL_MISMATCH)` se enviado ao backend.
- [ ] Preencher a soma exata dos splits e confirmar que o botão "Fechar comanda" é liberado.

### Cenário 3.2: Rebooking pós-checkout
- [ ] Ao concluir o fechamento com sucesso, um card de sugestão de Rebooking baseado em `/insights/rebooking` deve aparecer na tela de sucesso.
- [ ] O card exibe o serviço recomendado e o profissional mais adequado para daqui a N dias.
- [ ] Clicar no botão de Rebooking ("1 toque") deve criar o agendamento no backend e adicioná-lo à agenda no dia sugerido.
- [ ] O card de sugestão deve ser dismissível (botão de fechar) caso o usuário não queira usá-lo.

---

## Suíte 4: Lista de Espera (Waitlist)
*Validação do fluxo completo de gerenciamento de candidatos.*

### Cenário 4.1: Cadastro de Candidato
- [ ] Na agenda, clicar no botão "+ Lista de espera" abre o modal correspondente.
- [ ] Selecionar cliente, serviço, profissional e submeter. O modal fecha e a lista na aba "Mais" atualiza.
- [ ] Tentar cadastrar sem preencher os campos obrigatórios e verificar a validação de formulário.

### Cenário 4.2: Prompt ao Cancelar Agendamento
- [ ] Cancelar um agendamento existente na Agenda. 
- [ ] Se houver candidatos na lista de espera compatíveis com o horário liberado, o sistema exibe um prompt sugerindo os candidatos para reocupar o slot.
- [ ] O prompt oferece a opção de contato via WhatsApp (One-tap) com o candidato.
