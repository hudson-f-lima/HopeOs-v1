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
- Supabase/Postgres com migrations versionadas (001-006 aplicadas e validadas no projeto real `qosioymzswhkqkziocas`): REAL.
- RLS e permissões travadas para RPC `checkout_close`: REAL.
- Checkout preview/close no backend: REAL — validado com fechamento real controlado em produção (ledger distribuído conferido linha a linha).
- Baixa de estoque no checkout via RPC: REAL.
- Ledger financeiro distribuído: REAL.
- Cadastros reais (serviços, profissionais, produtos, formas de pagamento, vínculo serviço×profissional, overrides): REAL — endpoints, validações e RPCs atômicas implementados e em produção (ver seção Cadastros).
- Hardening pós-auditoria aplicado: `overrides` bloqueado no POST/PATCH genérico de profissionais (só endpoint dedicado), `POST /formas-pagamento` não faz upsert silencioso (409 em duplicado), `CommissionEngine` bloqueia comissão fora de 0-100%, CHECK no banco para produto ativo não vender abaixo do custo, override de profissional via RPC atômica (`jsonb_set`, sem read-modify-write em Node), validação de UUID em params/listas, RPC de produto revalida `comissao_pct`/`modelo_comissao` internamente, erros de negócio da RPC (`P0001`) mapeados para HTTP 422.
- Testes: `npm run test:gate` — 57/57 verdes (Finance 10 + Product Foundation 8 + Schema Polymorphic 12 + RPC Permission 8 + Cadastros Reais 19).

### Frontend

- `index.html` (PWA de arquivo único) publicado no GitHub Pages, consumindo o backend real via `/api/*`.
- Estrutura de abas: Agenda, Checkout, Dashboard, Mais.
- Aba **Mais**: UI de Cadastros Reais implementada — CRUD de serviços, profissionais (+ vínculo com serviços + overrides por serviço), produtos (+ ajuste de estoque), formas de pagamento. Desativação sempre via `ativo=false`, nunca delete físico.
- Checkout: preview reorganizado em blocos Bruto → Deduções → Resultado (mesmos campos que a API já retornava; nenhum cálculo novo no frontend).
- Service worker: cache do shell HTML corrigido para network-first (antes usava stale-while-revalidate e podia servir HTML desatualizado por um reload inteiro). `/api/*` e métodos não-GET nunca são cacheados. Versão de cache atual: `hope-os-shell-v1-2`.
- `frontendCalculates: false` continua sendo a regra vigente — frontend só coleta intenção, chama API e exibe a resposta.

### Cadastros

- Clientes: REAL via `POST /clientes` (leitura via `GET /clientes`). Sem `PATCH`/desativação ainda — limitação conhecida, não bloqueante.
- Serviços: REAL — `GET/POST /servicos`, `PATCH /servicos/:id`, UI de cadastro na aba Mais.
- Profissionais: REAL — `GET/POST /profissionais`, `PATCH /profissionais/:id`, UI de cadastro na aba Mais. `overrides` só via endpoint dedicado (bloqueado no POST/PATCH genérico).
- Produtos: REAL — `GET/POST /produtos`, `PATCH /produtos/:id`, ajuste de estoque via `POST /produtos/:id/estoque/ajuste` (RPC atômica, bloqueia saldo negativo), UI de cadastro + ajuste de estoque na aba Mais.
- Formas de pagamento: REAL — `GET/POST /formas-pagamento`, `PATCH /formas-pagamento/:code` (POST duplicado retorna 409, não sobrescreve), UI de cadastro na aba Mais.
- Serviço x profissional: REAL — `GET/PUT /profissionais/:id/servicos` (RPC atômica), UI de vínculo (checklist) na aba Mais.
- Overrides por profissional: REAL — `PATCH /profissionais/:id/servicos/:servicoId/override` (RPC atômica com `jsonb_set`, sem read-modify-write), checkout já lê e aplica os overrides, UI de personalização por serviço na aba Mais.

## Próxima decisão em aberto

A condição da regra abaixo ("antes de cadastros reais estáveis") está satisfeita: cadastros reais estão implementados, testados (57/57) e validados em produção (Supabase real + smoke test + checkout close controlado). O próximo passo não está definido neste documento — é decisão do usuário quando retomar o trabalho.

## Próximo gate proibido

Não avançar para, sem decisão explícita do usuário:

- IA;
- marketplace;
- app do cliente;
- multiunidade;
- assinatura recorrente;
- CRM avançado;
- dashboards sofisticados;
- gamificação;
- marketing automático.
