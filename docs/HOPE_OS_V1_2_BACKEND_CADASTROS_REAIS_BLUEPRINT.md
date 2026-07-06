# HOPE OS V1.2 — Blueprint Backend Cadastros Reais

**Status:** planejamento aprovado, execução ainda não iniciada  
**Base:** HOPE OS V1.1 Frontend Operacional  
**Prioridade única:** transformar cadastros parciais em cadastros reais via backend  
**Regra-mãe:** backend é a verdade única. Frontend não calcula, não valida dinheiro sozinho e não altera estoque direto.

---

## 1. Problema real

O HOPE OS já possui fundação real para agenda, checkout, baixa de estoque e leitura de catálogo. Porém a operação ainda depende de dados previamente existentes no banco ou em seed para manter serviços, profissionais, produtos e formas de pagamento.

Isso cria dependência técnica para tarefas básicas do salão.

### Diagnóstico direto

| Área | Estado atual | Problema |
|---|---:|---|
| Clientes | REAL | `POST /clientes` já existe |
| Serviços | PARCIAL | leitura existe, cadastro/edição não |
| Profissionais | PARCIAL | leitura existe, cadastro/edição não |
| Produtos | PARCIAL | leitura existe, cadastro/edição não |
| Formas de pagamento | PARCIAL | leitura existe, cadastro/edição não |
| Serviço x profissional | PARCIAL | tabela existe, mas não há gestão via API |
| Overrides por profissional | PARCIAL | resolver lê `profissionais.overrides`, mas não há endpoint seguro de gestão |
| Estoque | REAL no checkout | ajuste manual ainda não deve ser feito direto no frontend |

---

## 2. Impacto no negócio

Sem cadastros reais:

- o salão depende de intervenção técnica para alterar preço, duração e comissão;
- a equipe não consegue manter catálogo operacional;
- qualquer front bonito vira maquiagem;
- produtos e estoque podem ficar inconsistentes se forem editados diretamente;
- o checkout fica real, mas a preparação do checkout continua frágil.

### KPI de sucesso da etapa

Uma pessoa não técnica deve conseguir:

1. cadastrar serviço;
2. cadastrar profissional;
3. vincular serviço ao profissional;
4. configurar preço/duração/comissão padrão;
5. cadastrar produto sem quebrar estoque;
6. cadastrar forma de pagamento;
7. fechar checkout usando os dados criados;
8. rodar os gates sem regressão.

Sem abrir Supabase. Sem editar JSON. Sem alterar HTML manualmente.

---

## 3. Escopo aprovado

### Incluir nesta etapa

- Endpoints reais de cadastro e edição para:
  - serviços;
  - profissionais;
  - produtos;
  - formas de pagamento;
  - vínculo serviço x profissional;
  - overrides de serviço por profissional.
- Validações server-side.
- Testes de gate.
- Atualização do frontend V1.1 apenas para consumir endpoints reais.
- Documentação de contrato API.

### Não incluir nesta etapa

- IA;
- marketplace;
- app do cliente;
- multiunidade;
- campanhas automáticas;
- CRM avançado;
- fila virtual;
- assinatura recorrente automatizada;
- pagamento online antecipado;
- dashboard sofisticado;
- gamificação;
- folha de pagamento completa.

---

## 4. Regras invioláveis

1. **Frontend não calcula financeiro.**
2. **Frontend não calcula comissão.**
3. **Frontend não calcula margem.**
4. **Frontend não altera `estoque_atual` diretamente.**
5. **Frontend não expõe service role.**
6. **Backend valida todos os campos antes de gravar.**
7. **Toda alteração de estoque precisa gerar movimento em `produto_estoque_movimentos`.**
8. **Masters não devem ser deletados fisicamente. Usar `ativo=false`.**
9. **Não criar tabela nova sem justificativa e migration versionada.**
10. **Não quebrar os 38 testes atuais.**
11. **Qualquer cálculo final de preço, taxa, comissão, repasse e baixa de estoque continua no backend/banco.**

---

## 5. Decisão técnica principal

Usar as tabelas existentes.

### Tabelas já existentes

- `servicos`
- `profissionais`
- `produtos`
- `formas_pagamento`
- `profissional_servicos`
- `produto_estoque_movimentos`

### Migration 006

Criar **somente se necessário**.

Casos aceitáveis:

- função RPC para ajuste seguro de estoque;
- índices faltantes;
- constraints realmente necessárias;
- grants para service role se algo novo for criado.

Casos proibidos:

- criar ledger financeiro novo;
- criar tabela duplicada de cadastro;
- criar tabela de estoque paralela;
- criar estrutura multi-tenant avançada além do `empresa_id` atual.

---

## 6. Contrato de API esperado

Prefixo atual: `/api`

### 6.1 Serviços

#### `GET /api/servicos`

Retorna serviços da empresa atual.

#### `POST /api/servicos`

Cria serviço.

Payload mínimo:

```json
{
  "nome": "Corte masculino",
  "categoria": "Barbearia",
  "valorCentavos": 5000,
  "duracaoMin": 30,
  "slotMin": 30,
  "comissaoPct": 45,
  "ativo": true
}
```

Campos gravados:

- `nome`
- `categoria`
- `valor_centavos`
- `duracao_min`
- `slot_min`
- `comissao_pct`
- `ativo`
- `empresa_id`
- `updated_at`

Validações:

- `nome` obrigatório;
- `valorCentavos >= 0`;
- `duracaoMin` entre 5 e 480;
- `slotMin` entre 5 e 480;
- `comissaoPct` entre 0 e 100.

#### `PATCH /api/servicos/:id`

Atualiza serviço existente da empresa atual.

Regras:

- não aceitar alteração de `empresa_id`;
- não aceitar campos financeiros fora do contrato;
- permitir `ativo=false` para desativar;
- atualizar `updated_at`.

---

### 6.2 Profissionais

#### `GET /api/profissionais`

Retorna profissionais da empresa atual.

#### `POST /api/profissionais`

Payload mínimo:

```json
{
  "nome": "Robson",
  "whatsapp": "11999999999",
  "modeloComissao": "dividido",
  "horario": {},
  "ativo": true
}
```

Validações:

- `nome` obrigatório;
- `modeloComissao` somente: `bruto_salao`, `dividido`, `bruto_staff`;
- `horario` deve ser objeto JSON;
- `overrides` deve ser objeto JSON.

#### `PATCH /api/profissionais/:id`

Atualiza profissional.

Regras:

- `ativo=false` desativa sem apagar histórico;
- não apagar agendamentos, comandos ou vínculos;
- atualizar `updated_at`.

---

### 6.3 Produtos

#### `GET /api/produtos`

Retorna produtos da empresa atual.

#### `POST /api/produtos`

Payload mínimo:

```json
{
  "nome": "Pomada modeladora",
  "sku": "POMADA-001",
  "categoria": "Finalizadores",
  "custoCentavos": 2000,
  "precoVendaCentavos": 4500,
  "estoqueInicial": 10,
  "estoqueMinimo": 2,
  "comissaoPct": 0,
  "modeloComissao": "bruto_salao",
  "controlaEstoque": true,
  "ativo": true
}
```

Regras:

- `precoVendaCentavos >= custoCentavos` para produto ativo;
- `estoqueInicial >= 0`;
- `estoqueMinimo >= 0`;
- não gravar venda abaixo do custo;
- se `estoqueInicial > 0`, criar movimento `entrada` em `produto_estoque_movimentos`;
- não permitir que o frontend escreva em `estoque_atual` diretamente.

#### `PATCH /api/produtos/:id`

Atualiza dados comerciais do produto.

Permitido:

- nome;
- sku;
- código de barras;
- categoria;
- custo;
- preço de venda;
- estoque mínimo;
- comissão;
- modelo de comissão;
- controla estoque;
- ativo.

Proibido:

- alterar `estoque_atual` via PATCH.

#### `POST /api/produtos/:id/estoque/ajuste`

Ajuste manual seguro de estoque.

Payload:

```json
{
  "tipo": "entrada",
  "quantidade": 5,
  "custoUnitarioCentavos": 2000,
  "motivo": "Compra de reposição"
}
```

Tipos aceitos:

- `entrada`
- `ajuste`
- `perda`

Regras:

- deve atualizar saldo com segurança;
- deve criar movimento em `produto_estoque_movimentos`;
- não pode gerar saldo negativo;
- idealmente usar RPC transacional com `FOR UPDATE`.

---

### 6.4 Formas de pagamento

Tabela com chave composta: `empresa_id + code`.

#### `GET /api/formas-pagamento`

Retorna formas de pagamento da empresa atual.

#### `POST /api/formas-pagamento`

Payload:

```json
{
  "code": "credito",
  "label": "Cartão de crédito",
  "icon": "💳",
  "taxaPct": 3.19,
  "taxaFixaCentavos": 0,
  "diasRecebimento": 30,
  "ativo": true
}
```

Validações:

- `code` obrigatório, minúsculo, sem espaço;
- `label` obrigatório;
- `taxaPct >= 0`;
- `taxaFixaCentavos >= 0`;
- `diasRecebimento >= 0`.

#### `PATCH /api/formas-pagamento/:code`

Atualiza forma existente.

Regras:

- não alterar `code` via PATCH;
- usar `ativo=false` para desativar.

---

### 6.5 Serviço x profissional

#### `GET /api/profissionais/:id/servicos`

Retorna vínculos do profissional.

#### `PUT /api/profissionais/:id/servicos`

Substitui a lista completa de serviços permitidos para o profissional.

Payload:

```json
{
  "servicoIds": ["uuid-servico-1", "uuid-servico-2"]
}
```

Regras:

- validar profissional ativo/existente;
- validar todos os serviços ativos/existentes;
- substituir vínculos de forma consistente;
- não afetar comandos fechados;
- não afetar histórico.

---

### 6.6 Overrides por profissional

O checkout atual já lê overrides em `profissionais.overrides` por `servicoId`.

Formato esperado:

```json
{
  "uuid-servico": {
    "valor_centavos": 6000,
    "duracao_min": 45,
    "comissao_pct": 50
  }
}
```

#### `PATCH /api/profissionais/:id/servicos/:servicoId/override`

Cria, atualiza ou remove override.

Payload para atualizar:

```json
{
  "valorCentavos": 6000,
  "duracaoMin": 45,
  "comissaoPct": 50
}
```

Payload para remover:

```json
{
  "remover": true
}
```

Regras:

- validar profissional;
- validar serviço;
- serviço deve estar vinculado ao profissional;
- `valorCentavos >= 0`;
- `duracaoMin` entre 5 e 480;
- `comissaoPct` entre 0 e 100;
- atualizar apenas a chave daquele serviço dentro do JSON;
- não substituir todos os overrides por acidente.

---

## 7. Validações server-side

Criar arquivo sugerido:

```txt
backend/src/validators/cadastros.validator.js
```

Funções mínimas:

- `validateCreateServicoPayload`
- `validateUpdateServicoPayload`
- `validateCreateProfissionalPayload`
- `validateUpdateProfissionalPayload`
- `validateCreateProdutoPayload`
- `validateUpdateProdutoPayload`
- `validateEstoqueAjustePayload`
- `validateCreateFormaPagamentoPayload`
- `validateUpdateFormaPagamentoPayload`
- `validateProfissionalServicosPayload`
- `validateProfissionalServicoOverridePayload`

Princípios:

- normalizar camelCase para snake_case no backend;
- remover campos desconhecidos;
- bloquear `empresa_id` vindo do cliente;
- bloquear `id` em PATCH;
- converter centavos para inteiro;
- rejeitar `NaN`, string vazia e número negativo;
- retornar erro padronizado com `createAppError`.

---

## 8. Repositório

Atualizar `SupabaseRepository` com métodos seguros:

```txt
getByIdScoped(table, id)
insertScoped(table, payload)
updateScoped(table, id, payload)
upsertFormaPagamento(payload)
updateFormaPagamento(code, payload)
replaceProfissionalServicos(profissionalId, servicoIds)
updateProfissionalServicoOverride(profissionalId, servicoId, override)
adjustProdutoEstoque(produtoId, payload)
```

Regras:

- todo select/update precisa filtrar `empresa_id`;
- não usar update sem escopo por empresa;
- formas de pagamento usam `code`, não `id`;
- estoque precisa de transação/RPC se houver mais de uma operação.

---

## 9. Migration 006 recomendada

Criar se implementar ajuste seguro de estoque por RPC.

Nome sugerido:

```txt
supabase/migrations/006_produto_estoque_ajuste_rpc.sql
```

Objetivo:

- travar linha do produto com `FOR UPDATE`;
- calcular saldo anterior e posterior;
- impedir saldo negativo;
- atualizar `produtos.estoque_atual`;
- inserir `produto_estoque_movimentos`;
- conceder execução somente ao `service_role`;
- revogar de `anon` e `authenticated`.

Classificação: **REAL necessário** para estoque confiável.

---

## 10. Testes obrigatórios

Criar gate novo:

```txt
backend/tests/cadastros-reais-gate.test.js
```

Adicionar no `package.json`:

```json
{
  "scripts": {
    "test:cadastros": "node tests/cadastros-reais-gate.test.js",
    "test:gate": "npm run test:finance && npm run test:product && npm run test:schema && npm run test:rpc-lock && npm run test:cadastros"
  }
}
```

### Casos mínimos

Serviços:

- cria serviço válido;
- rejeita nome vazio;
- rejeita valor negativo;
- atualiza preço/duração/comissão;
- desativa serviço.

Profissionais:

- cria profissional válido;
- rejeita modelo de comissão inválido;
- atualiza horário;
- desativa profissional.

Produtos:

- cria produto válido;
- rejeita venda abaixo do custo;
- rejeita estoque negativo;
- cria estoque inicial com movimento;
- bloqueia PATCH direto de `estoque_atual`;
- ajusta estoque com movimento;
- bloqueia saldo negativo.

Formas de pagamento:

- cria forma válida;
- rejeita code inválido;
- atualiza taxa;
- desativa forma.

Serviço x profissional:

- vincula serviços;
- bloqueia serviço inexistente;
- bloqueia profissional inexistente;
- checkout aceita serviço vinculado;
- checkout rejeita serviço não vinculado.

Overrides:

- cria override;
- checkout usa preço/duração/comissão do override;
- remove override;
- checkout volta ao padrão do serviço.

Regressão:

- todos os 38 gates atuais continuam verdes.

---

## 11. Frontend V1.1 — adaptação posterior

Só depois do backend verde.

### Atualizar telas de Cadastros

- Clientes: manter real.
- Serviços: criar/editar/desativar.
- Profissionais: criar/editar/desativar.
- Produtos: criar/editar/desativar/ajustar estoque.
- Pagamentos: criar/editar/desativar.
- Vínculos: selecionar serviços por profissional.
- Overrides: editar preço/duração/comissão por profissional.

### Regras de UI

- mostrar erro vindo do backend;
- não recalcular valores finais;
- não prometer cadastro salvo antes da resposta 201/200;
- não usar mock/localStorage para dados operacionais;
- manter interface mobile-first e simples.

---

## 12. Gate de aprovação

A etapa só está aprovada quando:

```txt
npm run test:gate
```

passar com todos os gates, incluindo `cadastros-reais-gate`.

Além disso, validar manualmente:

1. criar serviço;
2. criar profissional;
3. vincular serviço ao profissional;
4. criar override;
5. criar produto com estoque inicial;
6. ajustar estoque;
7. criar forma de pagamento;
8. abrir frontend;
9. criar agendamento usando novo serviço/profissional;
10. fechar checkout;
11. confirmar baixa de estoque, comissão e caixa.

---

## 13. Veredito

Esta etapa é **fundação operacional**, não expansão sofisticada.

Sem ela, qualquer melhoria visual do frontend continua dependente de banco, seed ou intervenção técnica.

Com ela, o HOPE OS começa a virar um sistema operável por equipe.
