# HOPE OS V1.0.3 — /data Contract

A pasta `/data` é contrato e seed, não banco final.

## Coleções principais

```txt
empresa.json
clientes.json
servicos.json
produtos.json
profissionais.json
profissional_servicos.json
formas_pagamento.json
agendamentos.json
comandos.json
caixa_movimentos.json
produto_estoque_movimentos.json
lista_espera.json
agendamento_eventos.json
```

## Regra do checkout

```txt
itens[] exige tipo: servico | produto
frontend envia IDs e quantidade
backend busca preço, custo, comissão, modelo e estoque
```

## Campos financeiros autoritativos

Serviços:

```txt
servicos.valor_centavos
servicos.duracao_min
servicos.comissao_pct
profissionais.modelo_comissao
profissionais.overrides
```

Produtos:

```txt
produtos.preco_venda_centavos
produtos.custo_centavos
produtos.estoque_atual
produtos.comissao_pct
produtos.modelo_comissao
produtos.controla_estoque
```

Formas de pagamento:

```txt
formas_pagamento.taxa_pct
formas_pagamento.taxa_fixa_centavos
```
