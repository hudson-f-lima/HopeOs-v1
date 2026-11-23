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

## Registro original em `PROJECT_STATE.md` (2026-11-17)

Texto preservado ao reescrever o `PROJECT_STATE.md` em 2026-11-23, sem alteração.

- D-057, branch `feat/ux-comandas-gestao`, base 7cfc5a1. **REAL em ambiente de teste**. Comandas abre uma lista por data, com detalhe do atendimento ou da venda, conforme o papel. O checkout mantém revisão do carrinho, associa o resumo ao cálculo do servidor e conserva a chave para retomada financeira. Na API atualizada a PK existente arbitra fechamentos concorrentes do mesmo agendamento. Os testes com PostgreSQL/PostgREST locais, duas chaves e dois operadores produziram uma venda, uma entrada de caixa e uma baixa de estoque. Histórico anterior sem identificação do agendamento e agenda ainda ativa exige conferência humana. O aviso de conclusão pendente da agenda já existia na base D-056.

- Gestão agrupa as tarefas em cinco famílias com permissões efetivas. O avatar reúne preferências pessoais. Recursos da operação são carregados ao entrar no destino correspondente. No microbenchmark local do seletor, com 10 mil nomes sintéticos, 5 aquecimentos e 100 buscas, a mediana da busca vazia caiu de 5,0 ms para menos de 0,01 ms e a da busca por “9923” de 8,8 para 4,3 ms. Medida do algoritmo sem DOM, rede ou usuários. A venda avulsa requer uma ação adicional para abrir o editor a partir da navegação.

- Critérios e comparação do checkout. Entrada pela lista → detalhe → rascunho → itens e forma → simulação no servidor → fechamento confirmado ou retomada pela chave. Em oito cenários de regressão idênticos com transporte controlado, a base 7cfc5a1 passou em um e a revisão passou nos oito. Incluem inversão de respostas, preço específico, divisão, mudança de atendimento durante o fechamento e falha na consulta da cobertura. Simulação sem cobertura confirmada conserva o rascunho. Mudança de taxa mesmo com total idêntico requer revisão antes de gravar. A atualização de catálogo na inicialização dispara uma renderização das seis listas cadastradas (antes duas), incluindo a consulta à espera para papéis autorizados. Metas e ganhos passam de uma para duas ações desde a Agenda. No endpoint de prévia em HTTP local com repositório em memória, a mediana foi de 1,61 para 1,60 ms e o p95 de 2,16 para 2,09 ms (100 amostras por revisão, Node 22, mesma venda). O ensaio não mede o banco remoto nem o tempo do operador no salão.
