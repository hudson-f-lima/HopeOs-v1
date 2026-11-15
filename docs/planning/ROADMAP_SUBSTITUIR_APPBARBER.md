# Roteiro — substituir o app Barber no salão do dono (2026-11-15)

**Decisão do Platform Owner (2026-11-15):** o objetivo agora é **substituir o app Barber no próprio salão**. Vender para outros salões fica para depois. Para isso, falta separação entre empresas comprovada em produção, que hoje está BLOQUEADA (`docs/PROJECT_STATE.md`).

**Estado:** planejamento. Nada aqui está autorizado para construção. Cada item que exigir migration (013+), fornecedor ou custo depende de autorização própria.

## 0. Tese do produto (Platform Owner, 2026-11-15)
"Estado da arte" aqui **não** é ter mais telas que o app Barber. É ser **mais eficiente e dinâmico com baixo esforço cognitivo para qualquer usuário**, e **mais inteligente**, com obsessão por **desempenho, margem e gestão**. Nada de copiar telas.

**Princípios, que valem para todo item deste roteiro:**
1. **Resposta, não relatório.** O sistema diz o que mudou, por quê e a próxima ação ("terça à tarde está 40% vazia; 12 clientes estão atrasados no retorno"), em vez de 30 relatórios para o dono montar.
2. **Zero configuração para começar.** Os padrões já vêm certos; parâmetro só existe quando há escolha real do dono (o app Barber tem cerca de 72).
3. **Uma ação principal por tela**, com o mínimo de toques e campos.
4. **Margem real em tudo que envolve dinheiro:** preço menos comissão, menos taxa da forma de pagamento, menos insumo usado, por atendimento, profissional, hora de cadeira e plano de assinatura.
5. **Número só do servidor, com contexto:** comparação com o próprio histórico, aviso de amostra pequena, nunca valor inventado.

**Métricas de produto:**
- **Esforço:** toques e tempo por tarefa (agendar, fechar comanda, cobrar assinante), medidos pelos roteiros E2E antes e depois de cada entrega.
- **Gestão:**
  - margem de contribuição por hora de cadeira;
  - ocupação;
  - retorno no ciclo próprio de cada cliente;
  - margem por plano de assinatura;
  - custo de taxas.

**Consequência no roteiro:** cada item da fase 1 nasce com a camada de inteligência dele, não como cópia. Exemplos: assinatura já com margem por plano e alerta de plano deficitário; comanda aberta já com baixa do insumo usado; importação já apontando clientes atrasados no retorno.

## 1. Critério de saída da fase
- **30 dias corridos** operando o salão **só no HOPE OS**, sem voltar ao app Barber para nenhuma tarefa.
- O fechamento de caixa e as comissões do mês batem com a conferência manual do dono.
- Todos os assinantes ativos foram migrados, sem cobrança dupla nem perdida.

## 2. Evidência levantada na conta do app Barber (somente leitura, 2026-11-15)
Fatos observados. O que o salão **usa de verdade** ainda precisa de confirmação do dono (seção 4).
- **Clube de assinatura:** cerca de 10 planos (linhas Smart, Flex, VIP e Anual), assinantes ativos, cobrança recorrente pela GalaxPay e aviso de vencimentos. **Bloqueador:** sem isso não há migração.
- **Comandas abertas** (abertura no atendimento, fechamento depois, reabertura).
- **Entrada/saída e contas a pagar e receber**, com movimento no período e várias contas.
- **Agenda:** bloquear e desbloquear horário, agenda recorrente, fechamento de agenda (feriados), lista de espera, encaixe.
- **Parâmetros ligados:**
  - lembrete automático por SMS;
  - mensagens de aniversário pelo app;
  - comissão de auxiliar;
  - controle de clientes pelo celular;
  - telefone do cliente escondido de quem não é gestor.
- **Clientes:** coluna de pontos (programa de fidelidade).
- **Relatórios e exportação:** Excel e PDF em quase todas as listas. Isso torna viável importar os dados.

## 3. Itens da fase 1 (proposta, a confirmar)
| # | Item | Por quê | Exige | Ordem sugerida |
|---|---|---|---|---|
| 1 | **Importar dados do app Barber** (clientes, serviços, profissionais, planos, assinantes) a partir das planilhas exportadas | Sem isso, a troca custa semanas de digitação | Sem migration; a validação de dados é o risco | 1 |
| 2 | **Bloqueio e desbloqueio de horário + fechamento de agenda (feriados)** | Uso diário da agenda | Migration 013 provável | 2 |
| 3 | **Comanda aberta**: abrir no atendimento, acrescentar itens, fechar no caixa; reabrir só gestão, com trilha | Fluxo real do salão | Migration provável (estado da comanda) | 3 |
| 4 | **Clube de assinatura**: planos, assinantes, uso por atendimento, comissão sobre assinatura, cobrança recorrente | Bloqueador da migração | Migration + fornecedor de pagamento (cobrança no cartão sem guardar cartão no HOPE OS) | 4, mas começar o **desenho** já |
| 5 | **Lembrete automático por WhatsApp** (confirmação e retorno) | Hoje é por SMS no app Barber | Fornecedor e custo | 5 |
| 6 | **Contas a pagar e receber** e várias contas | Se o dono usa (evidência de movimento) | Migration | a confirmar |
| 7 | **Agendamento recorrente** | Clientes fixos semanais | Talvez sem migration | a confirmar |
| 8 | **Comissão de auxiliar** | Parâmetro ligado | Migration provável | a confirmar |
| 9 | **Pacotes, fidelidade, cupons, NFS-e** | Só se o salão usa | Variado | a confirmar |

**Fora da fase 1:** várias unidades, conta digital, app próprio do salão, anamnese e documentos, fila e rodízio, notícias e promoções, imagens de marketing e transportadora. Cada um entra só se o dono disser que usa.

## 4. Decisões do dono que destravam o plano
1. **Uso real:** marcar, entre os itens 6 a 9 e os "fora da fase 1", o que o salão usa toda semana.
2. **Fornecedor de pagamento da assinatura:** continuar na GalaxPay (migrar assinantes sem pedir cartão de novo, se a GalaxPay permitir; DESCONHECIDO) ou trocar (Asaas, Mercado Pago, Stripe, Pagar.me). A troca obriga cada assinante a cadastrar o cartão de novo.
3. **Prazo** desejado para sair do app Barber.
4. **Migration 013+:** cada item que precisar será desenhado e levado à autorização, como nas anteriores.

## 5. Riscos
- **Assinatura é dinheiro recorrente de cliente final:** erro de cobrança vira reclamação e estorno. Exige gate próprio, Red Team e período de operação paralela, com os dois sistemas e cobrança só em um.
- **Importação:** dados duplicados ou telefones em formatos diferentes. Mitigação: prévia antes de gravar, recusar duplicata pelo celular (o app Barber já controla clientes pelo celular) e relatório do que não entrou.
- **Operação paralela:** durante a transição, a agenda em dois lugares gera conflito. Mitigação: virada em data marcada, com agenda futura importada no dia.
- **Escopo:** cada "também usamos isso" alonga a fase. A tabela da seção 3 é o limite até nova decisão.
- **Concorrência (para depois):** aprender o que o mercado espera é legítimo; copiar telas, textos ou estrutura do app Barber não. Os termos de uso dele não foram verificados.
