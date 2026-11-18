# Comandas — verificação da D-057 em 18/11/2026

A base de comparação é `3e19ea7`, na branch `feat/ux-comandas-gestao`. As verificações usaram dados sintéticos.

| Percurso | Na base | Após a alteração |
|---|---|---|
| Voltar da venda avulsa à fila já carregada | 1 nova consulta à lista | 0 consultas, mesma data e foco na ação de retomada |
| Simular sem receber revisão financeira | O botão de fechar era habilitado | O carrinho é preservado e o operador pode simular novamente |
| Retomar com a mesma chave e outra revisão após gravar | HTTP 201, com possibilidade de concluir a agenda | HTTP 409, agenda preservada |
| Reparar o agendamento de uma venda confirmada | Aviso na tela | Ação no comprovante, com rota que atualiza exclusivamente a agenda |

Para repetir os gates por camada, execute em `backend/` os scripts `test:checkout-recovery`, `test:checkout-replay` e `test:comandas-list`, com as variáveis fictícias do job offline do CI. Na verificação local passaram 18, 14 e 7 testes, respectivamente. Os roteiros de navegador estão em `backend/tests/e2e/comandas-navegacao.e2e.js` e `agora.e2e.js`.

Com PostgreSQL 16 e PostgREST locais, duas RPCs financeiras chegaram juntas ao bloqueio de uma única unidade de estoque. A API respondeu 201 e 409 para os dois operadores. Ficaram uma venda, um pagamento, uma entrada de caixa e uma baixa. Após perda da resposta de uma venda já gravada, o reparo recusou o outro autor e concluiu o agendamento com o comprovante do autor original.

A prévia de uma venda de R$ 60 via HTTP local, em memória, teve mediana de 1,28 ms na base e 1,22 ms na revisão, com p95 de 1,68 ms e 1,85 ms. O ensaio alternou base e revisão sob Node 24, com 10 aquecimentos por execução e 100 amostras por versão. O tempo de tarefa com a equipe do salão segue sem medição.

A API precisa fornecer a revisão financeira antes da atualização da PWA. O reparo pelo botão dura enquanto o comprovante estiver visível. Um recibo antigo com plano, sem a revisão e sem a avaliação original de cobertura, pode exigir conferência no caixa.
