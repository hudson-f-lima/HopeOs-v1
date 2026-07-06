# PROMPT PARA CLAUDE / ANTIGRAVITY — HOPE OS V1.2 Backend Cadastros Reais

Você vai trabalhar no projeto HOPE OS V1.1, com backend Node.js + Express + Supabase e frontend PWA em HTML único.

## Objetivo único

Implementar a etapa **V1.2 Backend Cadastros Reais**.

Transformar os cadastros hoje parciais em cadastros reais via backend, mantendo o backend como verdade única e sem criar regra financeira no frontend.

## Antes de editar qualquer arquivo

Leia obrigatoriamente:

1. `Claude.md`
2. `docs/HOPE_OS_V1_2_BACKEND_CADASTROS_REAIS_BLUEPRINT.md`
3. `docs/API_CONTRACT.md`
4. `docs/DATA_CONTRACT.md`
5. `backend/src/routes/index.js`
6. `backend/src/repositories/SupabaseRepository.js`
7. `backend/src/engines/CheckoutInputResolver.js`
8. `backend/src/engines/ProductEngine.js`
9. `backend/src/engines/InventoryEngine.js`
10. `supabase/migrations/001_init.sql`
11. `supabase/migrations/002_checkout_close_rpc.sql`
12. `supabase/migrations/003_lock_rpc_permissions.sql`
13. `supabase/migrations/004_service_role_table_grants.sql`
14. `supabase/migrations/005_agenda_status_reagendado.sql`

## Regra-mãe

Backend é a verdade única.

Proibido:

- frontend calcular financeiro;
- frontend calcular comissão;
- frontend calcular margem;
- frontend alterar estoque direto;
- expor service role;
- criar mocks para parecer que funciona;
- criar tabela nova sem necessidade real;
- criar ledger financeiro único;
- quebrar os gates existentes.

## Escopo obrigatório

Criar endpoints reais para:

1. serviços;
2. profissionais;
3. produtos;
4. formas de pagamento;
5. vínculo serviço x profissional;
6. overrides por profissional.

## Endpoints esperados

Implementar, no mínimo:

```txt
GET    /api/servicos
POST   /api/servicos
PATCH  /api/servicos/:id

GET    /api/profissionais
POST   /api/profissionais
PATCH  /api/profissionais/:id
GET    /api/profissionais/:id/servicos
PUT    /api/profissionais/:id/servicos
PATCH  /api/profissionais/:id/servicos/:servicoId/override

GET    /api/produtos
POST   /api/produtos
PATCH  /api/produtos/:id
POST   /api/produtos/:id/estoque/ajuste

GET    /api/formas-pagamento
POST   /api/formas-pagamento
PATCH  /api/formas-pagamento/:code
```

## Estoque

Produto é área crítica.

Não permitir PATCH direto em `estoque_atual`.

Para estoque inicial ou ajuste manual:

- atualizar saldo com segurança;
- criar movimento em `produto_estoque_movimentos`;
- impedir saldo negativo;
- preferir RPC transacional com `FOR UPDATE`.

Se criar RPC, criar migration:

```txt
supabase/migrations/006_produto_estoque_ajuste_rpc.sql
```

A RPC deve:

- receber `empresa_id`, `produto_id`, `tipo`, `quantidade`, `custo_unitario_centavos`, `motivo`;
- travar produto `FOR UPDATE`;
- calcular saldo anterior/posterior;
- atualizar `produtos.estoque_atual`;
- inserir `produto_estoque_movimentos`;
- revogar execução de `public`, `anon`, `authenticated`;
- liberar execução somente para `service_role`.

## Validações

Criar:

```txt
backend/src/validators/cadastros.validator.js
```

Com validações para:

- serviço;
- profissional;
- produto;
- estoque;
- forma de pagamento;
- vínculo profissional-serviço;
- override.

Regras:

- bloquear campos desconhecidos perigosos;
- bloquear `empresa_id` vindo do cliente;
- bloquear `id` em PATCH;
- normalizar camelCase para snake_case;
- usar centavos como inteiro;
- rejeitar negativos;
- comissão entre 0 e 100;
- duração entre 5 e 480;
- modelo de comissão somente `bruto_salao`, `dividido`, `bruto_staff`;
- forma de pagamento com `code` minúsculo e sem espaço.

## Repositório

Atualizar `backend/src/repositories/SupabaseRepository.js` com métodos seguros e escopados por empresa.

Não usar update sem `empresa_id`.

Métodos sugeridos:

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

## Testes obrigatórios

Criar:

```txt
backend/tests/cadastros-reais-gate.test.js
```

Adicionar script:

```json
"test:cadastros": "node tests/cadastros-reais-gate.test.js"
```

Atualizar `test:gate` para incluir o novo gate, sem remover os gates antigos.

Casos mínimos:

- criar/editar/desativar serviço;
- rejeitar serviço inválido;
- criar/editar/desativar profissional;
- rejeitar modelo de comissão inválido;
- criar produto válido;
- rejeitar venda abaixo do custo;
- rejeitar estoque negativo;
- criar estoque inicial com movimento;
- bloquear PATCH direto de `estoque_atual`;
- ajustar estoque com movimento;
- bloquear saldo negativo;
- criar/editar/desativar forma de pagamento;
- vincular serviços ao profissional;
- bloquear vínculo inválido;
- criar override;
- checkout usar override;
- remover override;
- checkout voltar ao padrão;
- garantir regressão: gates antigos continuam verdes.

## Frontend

Só adaptar depois que o backend e os testes estiverem verdes.

Atualizar `index.html` para usar endpoints reais em Cadastros.

Proibido:

- simular salvamento;
- salvar cadastro em localStorage;
- calcular taxa, comissão, margem ou repasse;
- editar estoque diretamente.

Permitido:

- formulário simples;
- lista simples;
- botão salvar;
- botão desativar;
- ajuste de estoque chamando endpoint específico;
- exibir erro retornado pelo backend.

## Execução esperada

Siga esta ordem:

1. Ler arquivos obrigatórios.
2. Confirmar o estado atual em resumo curto.
3. Implementar validators.
4. Implementar métodos seguros no repository.
5. Implementar endpoints.
6. Criar migration 006 se necessária para estoque.
7. Criar testes.
8. Rodar `npm run test:gate` dentro de `backend`.
9. Corrigir regressões.
10. Só então adaptar o frontend.
11. Atualizar documentação.
12. Entregar relatório final classificando REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO.

## Relatório final obrigatório

Ao final, informe:

```txt
Arquivos alterados
Endpoints criados
Migration criada ou justificativa para não criar
Testes executados
Resultado dos testes
O que ficou REAL
O que ficou PARCIAL
O que segue proibido para próxima etapa
```

## Critério de aprovação

A tarefa só está aprovada se:

```txt
cd backend
npm run test:gate
```

passar sem quebrar os gates anteriores.

Não avance para IA, marketplace, CRM avançado, dashboard sofisticado, multiunidade ou assinatura recorrente nesta etapa.
