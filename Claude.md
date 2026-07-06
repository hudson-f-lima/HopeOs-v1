# HOPE OS V1.2 — Contexto do projeto

## Stack

Backend Node.js + Express + Supabase/Postgres. Frontend é uma PWA em HTML único (`index.html` na raiz) publicada no GitHub Pages e conectada ao backend real via `/api/*`. Backend hospedado no Render e banco no Supabase.

## Regra-mãe

Backend é a verdade única.

O frontend não calcula financeiro, comissão, margem, taxa, repasse, baixa de estoque ou preço final confiável. O frontend apenas coleta intenção, chama API e exibe resposta do backend.

## Regras invioláveis

- Auditoria brutal sempre: classificar REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO.
- Uma prioridade por vez.
- Básico antes do sofisticado.
- Nenhuma tabela nova sem migration versionada em `supabase/migrations/`.
- `service_role` nunca exposto ao frontend.
- Ledger financeiro é distribuído por design: `comandos`, `comando_itens`, `comando_pagamentos`, `comando_gorjetas`, `caixa_movimentos`, `produto_estoque_movimentos`.
- Não existe e não deve existir uma tabela única `financial_ledger`.
- Estoque não pode ser alterado diretamente pelo frontend.
- Produto vendido abaixo do custo deve ser bloqueado.
- Masters operacionais devem ser desativados com `ativo=false`, não deletados fisicamente.
- Não criar IA, marketplace, multiunidade, assinatura recorrente, dashboard sofisticado ou CRM avançado antes de cadastros reais estáveis.

## Estado atual confirmado

### Backend

- Node + Express + Supabase service role no backend: REAL.
- Supabase/Postgres com migrations versionadas: REAL.
- RLS e permissões travadas para RPC `checkout_close`: REAL.
- Checkout preview/close no backend: REAL.
- Baixa de estoque no checkout via RPC: REAL.
- Ledger financeiro distribuído: REAL.
- Testes locais existentes: 38/38 verdes antes da etapa V1.2.

### Frontend V1.1

- `index.html` foi substituído por frontend operacional V1.1.
- Estrutura principal: Hoje, Agenda, Checkout, Cadastros, Gestão.
- Manifest PWA corrigido para `index.html`.
- Service worker corrigido para reduzir cache antigo.
- `index.v1.0.3.backup.html` preservado.
- `FRONTEND_V1_1_AUDIT.md` registra o estado da troca.

### Cadastros

- Clientes: REAL via `POST /clientes`.
- Serviços: PARCIAL, leitura existe; cadastro/edição ainda ausentes.
- Profissionais: PARCIAL, leitura existe; cadastro/edição ainda ausentes.
- Produtos: PARCIAL, leitura existe; cadastro/edição ainda ausentes.
- Formas de pagamento: PARCIAL, leitura existe; cadastro/edição ainda ausentes.
- Serviço x profissional: PARCIAL, tabela existe; gestão via API ainda ausente.
- Overrides por profissional: PARCIAL, checkout já lê `profissionais.overrides`; gestão segura via API ainda ausente.

## Tarefa atual aprovada

Implementar **HOPE OS V1.2 — Backend Cadastros Reais**.

Ler antes de executar:

- `docs/HOPE_OS_V1_2_BACKEND_CADASTROS_REAIS_BLUEPRINT.md`
- `docs/PROMPT_CLAUDE_ANTIGRAVITY_V1_2_CADASTROS_REAIS.md`
- `backend/src/routes/index.js`
- `backend/src/repositories/SupabaseRepository.js`
- `backend/src/engines/CheckoutInputResolver.js`
- `backend/src/engines/ProductEngine.js`
- `backend/src/engines/InventoryEngine.js`
- `supabase/migrations/001_init.sql`
- `supabase/migrations/002_checkout_close_rpc.sql`
- `supabase/migrations/003_lock_rpc_permissions.sql`
- `supabase/migrations/004_service_role_table_grants.sql`
- `supabase/migrations/005_agenda_status_reagendado.sql`

## Escopo da etapa V1.2

Criar endpoints reais, validações e testes para:

- serviços;
- profissionais;
- produtos;
- formas de pagamento;
- vínculo serviço x profissional;
- overrides por profissional.

## Endpoints esperados

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

- Não aceitar `estoque_atual` em PATCH comum.
- Todo ajuste de estoque precisa gerar linha em `produto_estoque_movimentos`.
- Ajuste de estoque deve impedir saldo negativo.
- Se necessário, criar `supabase/migrations/006_produto_estoque_ajuste_rpc.sql` com RPC transacional e `FOR UPDATE`.
- A RPC deve revogar execução de `public`, `anon` e `authenticated`, liberando apenas `service_role`.

## Teste obrigatório

Criar `backend/tests/cadastros-reais-gate.test.js`.

Atualizar scripts:

```txt
npm run test:cadastros
npm run test:gate
```

O novo `test:gate` deve continuar rodando os gates antigos e incluir o novo gate.

## Critério de aprovação

A etapa V1.2 só pode ser considerada REAL quando:

```txt
cd backend
npm run test:gate
```

passar com todos os testes antigos e novos.

## Próximo gate proibido até V1.2 estabilizar

Não avançar para:

- IA;
- marketplace;
- app do cliente;
- multiunidade;
- assinatura recorrente;
- CRM avançado;
- dashboards sofisticados;
- gamificação;
- marketing automático.

O próximo passo é somente cadastros reais estáveis.
