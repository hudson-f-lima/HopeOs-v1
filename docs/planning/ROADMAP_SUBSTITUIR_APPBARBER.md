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

## Decisões do dono (2026-11-15, à tarde)
- **Condição para a troca:** só migrar do app Barber quando o **fluxo de agendamento estiver completo de ponta a ponta, inclusive o app do cliente** (agendamento online, confirmação, remarcação e cancelamento pelo cliente).
- **Importação de dados:** fica para depois. Se for preciso, faz-se nova leitura de aprendizado no app Barber.
- **Escalas, Onda 2** (lote e modelos): em construção.
- **Clube de assinatura:** desenho completo, independente de fornecedor, pronto para escolher o fornecedor de pagamento depois ([`ASSINATURAS_DESENHO.md`](ASSINATURAS_DESENHO.md)).

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

## 3. Itens da fase 1 (uso confirmado pelo dono em 2026-11-15)
**O salão usa toda semana, além de agenda, comanda e caixa:**
- (a) contas a pagar e a receber;
- (b) agendamento recorrente;
- (c) comissão de auxiliar;
- (d) pacotes;
- (e) pontos de fidelidade;
- (f) cupons e vale-presente;
- (i) fila de chegada e rodízio;
- clube de assinatura (evidência na conta).

**Não usa:** (g) nota fiscal e (h) várias unidades. Os dois ficam fora da fase 1.

**Detalhe do (b), pedido do dono:**
- recorrência semanal, quinzenal e mensal;
- cancelar uma ocorrência ou a série;
- alterar tocando no próprio card do agendamento, com a escolha "só este", "este e os próximos" ou "todos";
- referência de facilidade: Booksy. É padrão de mercado, também presente em agendas de calendário; seguimos o comportamento, sem copiar tela.

**Decisão de arquitetura proposta (mais inteligente, menos complexo):** pacote, assinatura, vale-presente e pontos de fidelidade viram **um só mecanismo de saldo do cliente** (créditos de serviço ou de valor, com validade), com um único registro imutável. Pacote é crédito pré-pago; assinatura é crédito renovado por cobrança recorrente; vale-presente é crédito em valor; pontos são crédito ganho. Cupom é desconto na comanda, com o impacto na margem à vista antes de aplicar. Um mecanismo, uma trilha e uma conta de margem, em vez de quatro sistemas separados.

| # | Item | Camada inteligente | Exige | Ordem |
|---|---|---|---|---|
| 1 | **Importar dados do app Barber** (clientes, serviços, profissionais, planos, assinantes, pacotes e saldos) | Prévia com duplicatas pelo celular e clientes atrasados no retorno já apontados | Sem migration (valida dados) | 1 |
| 2 | **Agenda: disponibilidade e escalas ([desenho](DISPONIBILIDADE_ESCALAS.md)) + recorrência (b) + bloqueio de horário + feriados** | Recorrência respeita bloqueio e feriado e avisa o conflito antes de gravar | Migration 013 | 2 |
| 3 | **Comanda aberta** + **comissão de auxiliar (c)** | Margem do atendimento à vista antes de fechar, já descontada a parte do auxiliar | Migration | 3 |
| 4 | **Saldo do cliente: pacotes (d) + vale-presente (f)** | Margem por pacote; alerta de pacote vencendo sem uso | Migration | 4 |
| 5 | **Clube de assinatura** sobre o saldo do cliente | Margem por plano, assinante que usa acima do que paga, risco de cancelamento | Migration + fornecedor de pagamento | 5, com o **desenho começando já** |
| 6 | **Pontos de fidelidade (e) + cupons (f)** | Custo real do benefício na margem; cupom que só traz desconto, sem retorno, fica marcado | Migration | 6 |
| 7 | **Contas a pagar e receber (a)** | Fluxo de caixa projetado com assinaturas e recebíveis das maquininhas | Migration | 7 |
| 8 | **Fila de chegada e rodízio (i)** | Tempo de espera estimado; rodízio justo por ordem e por carga | Migration provável | 8 |
| 9 | **Lembrete automático por WhatsApp** | Confirmação e retorno no ritmo de cada cliente | Fornecedor e custo | 9 |

A ordem pode mudar por prazo. Itens 5 e 9 dependem de fornecedor e podem ser contratados em paralelo enquanto 1 a 4 são construídos.

**Fora da fase 1:** nota fiscal, várias unidades, conta digital, app próprio do salão, anamnese e documentos, notícias e promoções, imagens de marketing, transportadora.

## 4. Decisões do dono que destravam o plano
1. ~~Uso real~~ — **respondido em 2026-11-15** (seção 3).
2. **Fornecedor de pagamento da assinatura:** continuar na GalaxPay (migrar assinantes sem pedir cartão de novo, se a GalaxPay permitir; DESCONHECIDO) ou trocar (Asaas, Mercado Pago, Stripe, Pagar.me). A troca obriga cada assinante a cadastrar o cartão de novo.
3. **Prazo** desejado para sair do app Barber.
4. **Migration 013+:** cada item que precisar será desenhado e levado à autorização, como nas anteriores.

## 5. Riscos
- **Assinatura é dinheiro recorrente de cliente final:** erro de cobrança vira reclamação e estorno. Exige gate próprio, Red Team e período de operação paralela, com os dois sistemas e cobrança só em um.
- **Importação:** dados duplicados ou telefones em formatos diferentes. Mitigação: prévia antes de gravar, recusar duplicata pelo celular (o app Barber já controla clientes pelo celular) e relatório do que não entrou.
- **Operação paralela:** durante a transição, a agenda em dois lugares gera conflito. Mitigação: virada em data marcada, com agenda futura importada no dia.
- **Escopo:** cada "também usamos isso" alonga a fase. A tabela da seção 3 é o limite até nova decisão.
- **Concorrência (para depois):** aprender o que o mercado espera é legítimo; copiar telas, textos ou estrutura do app Barber não. Os termos de uso dele não foram verificados.
