# HOPE OS V1.0.3 — PRE DEPLOY HOTFIX BLUEPRINT

## 1. Status

```txt
Patch base: V1.0.3 Polymorphic Command Items
Hotfix: pré-deploy, sem abrir V1.0.4
Objetivo: fechar 3 correções antes do Supabase real
Status local: 38/38 checks verdes
```

## 2. Escopo fechado

```txt
1. Separar serviços líquidos, produtos líquidos e itens líquidos.
2. Bloquear produto abaixo do custo.
3. Produto sem vendedor não gera comissão.
```

Não entra:

```txt
frontend
pacotes
assinaturas
gift cards
relatórios novos
gateway
WhatsApp API
```

## 3. Payload canônico

```json
{
  "itens": [
    {
      "tipo": "servico",
      "servicoId": "uuid",
      "profissionalId": "uuid"
    },
    {
      "tipo": "produto",
      "produtoId": "uuid",
      "quantidade": 1,
      "profissionalId": "uuid-opcional"
    }
  ],
  "payments": [
    { "formaCode": "dinheiro", "valorCentavos": 9500 }
  ]
}
```

O frontend continua proibido de enviar preço, custo, margem, comissão, taxas ou valores calculados.

## 4. Separação contábil

```txt
servicosLiquidosCentavos = somente itens tipo servico
produtosLiquidosCentavos = somente itens tipo produto
itensLiquidosCentavos = serviços + produtos
```

Invariante:

```txt
servicosLiquidosCentavos + produtosLiquidosCentavos = itensLiquidosCentavos
```

Na tabela `comandos`:

```txt
servicos_liquidos_centavos
produtos_liquidos_centavos
itens_liquidos_centavos
```

## 5. Produto abaixo do custo

Regra V1:

```txt
Produto abaixo do custo bloqueia checkout.
```

Erro:

```txt
PRODUCT_BELOW_COST
```

Bloqueios:

```txt
produto.preco_venda_centavos < produto.custo_centavos
desconto proporcional que deixe valor_liquido do produto < total_custo do produto
```

## 6. Comissão de produto

Regra:

```txt
Produto com profissionalId: usa comissao_pct do produto.
Produto sem profissionalId: comissaoPct = 0 e comissaoCentavos = 0.
```

Documentação permanente:

```txt
Modelo de comissão de produto vem do produto, não do profissional.
```

## 7. RPC checkout_close

A RPC continua transacional e deve persistir:

```txt
comandos
comando_itens
comando_pagamentos
comando_gorjetas
caixa_movimentos
produto_estoque_movimentos
baixa de produtos.estoque_atual
```

Mapeamento obrigatório:

```txt
comandos.servicos_liquidos_centavos ← totals.servicosLiquidosCentavos
comandos.produtos_liquidos_centavos ← totals.produtosLiquidosCentavos
comandos.itens_liquidos_centavos ← totals.itensLiquidosCentavos
```

## 8. Gates

```bash
cd backend
npm run test:gate
```

Esperado:

```txt
Finance Gate V1: 10/10
Product Foundation Gate: 8/8
Schema Polymorphic Gate: 12/12
RPC Permission Gate: 8/8
```

Total:

```txt
38/38 verdes
```

## 9. Ordem real agora

```txt
1. Aplicar 001 → 002 → 003 no Supabase real limpo.
2. Rodar seed.
3. Rodar npm run test:gate.
4. Testar anon key bloqueada na RPC.
5. Fechar comanda só serviço.
6. Fechar comanda serviço + produto.
7. Conferir baixa de estoque e movimentos.
```

## 10. Regra de processo

```txt
Este é o último rewrite in-place permitido.
Depois do Supabase real, 001/002/003 ficam congeladas.
Toda mudança futura entra como migration 004+.
```

## 11. Veredito

Após este hotfix, backend fica congelado para deploy real.
A próxima prova é operacional: comanda real no Supabase real.
