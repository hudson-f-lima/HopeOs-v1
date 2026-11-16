# Assinaturas e pacotes — benchmark público (2026-11-16)

**Escopo:** concorrentes em **fontes públicas**, sem login (Trinks, BestBarbers, CashBarber). **O AppBarber real não foi estudado nesta rodada**: a credencial não estava disponível na sessão (ver §5). Nada aqui altera o desenho da Onda A; são entradas para a decisão.

**Método:** três agentes de baixo custo, um por concorrente, com a ordem de separar FATO (com fonte), INFERÊNCIA e DESCONHECIDO. Tudo que é texto de marketing do próprio fornecedor está marcado como tal. Não há preço verificado.

## 1. Resumo

| Tema | Trinks | BestBarbers | CashBarber |
|---|---|---|---|
| Clube de assinatura | Fato: existe, como solução adicional (exemplo: plano mensal com 2 cortes e 1 barba) | Fato: existe; planos limitados (ex.: 4 cortes/mês) ou ilimitados, definidos pelo dono | **Não confirmado**: as fontes tratam da assinatura do próprio software |
| Pacotes de serviço | Fato: venda de pacote com controle automático de uso e saldo; cliente agenda do celular | DESCONHECIDO (não achado) | DESCONHECIDO |
| Unidade de consumo | Saldo de uso do pacote | "Créditos" ou "dias de uso" | DESCONHECIDO |
| Cobrança recorrente | Fato (sem detalhes); pagamentos Stone e link Pagar.me | Fato (marketing): cartão, Pix ou boleto, no vencimento; gateway Asaas | Gateway próprio (relato da empresa em reclamação) |
| Inadimplência | DESCONHECIDO | Fato (marketing): agendamento bloqueado se o pagamento não cai; tolerância em dias DESCONHECIDA | DESCONHECIDO |
| Troca/cancelamento pelo cliente | DESCONHECIDO | Fato (marketing): upgrade, downgrade e cancelamento pelo app, com pro-rata automático | Relatos de dificuldade de cancelar o contrato do software |
| Comissão sobre serviço coberto | Divisão automática de comissão (geral); regra para serviço coberto DESCONHECIDA | Fato (marketing): divide o valor da assinatura entre os barbeiros que atenderam o cliente no mês (rateio) | DESCONHECIDO |
| Relatórios | "130+ relatórios" (marketing); recorrência/churn DESCONHECIDOS | Churn, frequência e receita (marketing) | DESCONHECIDO |
| Preço do produto | Não publicado | "A partir de R$ 299/mês" (marketing, não confirmado na página) | R$ 5.000/ano, só em relato de cliente |
| Reputação | Reclame Aqui 6,46; 89 reclamações em 6 meses | App Store 3,5 (86 avaliações); sem página no Reclame Aqui | Reclame Aqui 7,5; 54 reclamações; instabilidade, suporte e taxa de 10% não informada (relatos) |

## 2. O que isso confirma ou muda no desenho da Onda A (`ASSINATURAS_DESENHO.md`)

**Confirma (padrão do mercado):**
- Plano com limite de usos por ciclo, ou ilimitado.
- Bloqueio de agendamento/uso quando a cobrança não cai.
- Cobrança por Pix, cartão e boleto com gateway terceirizado.
- Relatórios de churn, frequência e receita do clube.

**Sugere decidir (hipóteses, não conclusões):**
1. **Pacote com saldo é um produto diferente da assinatura.** O Trinks trata os dois separados. O desenho da Onda A prevê só limite por ciclo; o "saldo de sessões compradas, com validade" ficou para o "saldo do cliente" do roteiro. A Onda A deve ser modelada para não fechar essa porta (já previsto no §12 do desenho). **Pergunta ao dono:** o AppBarber vende pacote hoje? Quantos?
2. **Comissão por rateio é o modelo do BestBarbers** (marketing). O dono já escolheu as três regras (tabela, rateio, fixo), com (c) fixo como padrão sugerido. A Onda A entrega **tabela e fixo**; o **rateio**, que só se fecha no fim do ciclo, fica adiado e isso precisa ser dito com todas as letras (desvio da D-036).
3. **Pro-rata na troca de plano** é anunciado pelo BestBarbers. A D-038 decidiu "troca vale no próximo ciclo". Manter, e rever só se o salão pedir.
4. **Tolerância de inadimplência:** nenhum concorrente publica o número. A decisão do dono (7 dias) permanece.

**Alerta de risco (relatos, não verificados):** taxas não informadas e dificuldade de cancelamento aparecem como queixa. No HOPE OS, taxa do fornecedor entra na margem do plano e o cancelamento tem regra clara (fim do ciclo pago), o que vira argumento de produto.

## 3. Limitações

- Quase tudo vem do **marketing do próprio fornecedor**. Não verifiquei preços, limites nem comportamento real.
- O CashBarber **não** é referência confirmada de assinatura (premissa refutada pelas fontes achadas).
- A central de ajuda do Trinks, onde estão os campos reais, exige login de salão.
- Sem acesso ao produto, não sei: validade de crédito, intervalo mínimo entre usos, restrição por dia/horário/profissional, nem como a comanda baixa o serviço coberto.

## 4. O que fecha as lacunas

Ordem de valor: (1) **AppBarber real, somente leitura**: campos de plano e de pacote, restrições, regra de comissão e relatórios, e o que são "pacotes" ali; (2) demonstração do Trinks (vídeo público ou teste grátis de 5 dias, a pedido do dono, com cadastro dele); (3) conversa com a GalaxPay sobre migrar assinantes sem recadastro de cartão (já listada no desenho).

## 5. AppBarber — estado do acesso

Em 2026-11-15 houve leitura real (resumida no §1 do desenho): cerca de 10 planos ativos, cobrança pela GalaxPay, relatórios de uso por assinatura e o parâmetro "gerar comissão com base no valor original do serviço". Nesta rodada a credencial **não estava disponível** (a sessão reiniciou) e o acesso **não foi contornado**. Retomar quando o dono fornecer o acesso por canal seguro; a leitura será apenas de consulta (nada salvo, cadastrado ou enviado). Lembrete: a senha precisa ser rotacionada depois.
