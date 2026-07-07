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
- Não criar IA, marketplace, multiunidade, assinatura recorrente ou CRM avançado antes de cadastros reais estáveis. Dashboard sofisticado passou a ser exceção autorizada em 2026-07-07 (ver seção V1.3).

## Estado atual confirmado

### Backend

- Node + Express + Supabase service role no backend: REAL.
- Supabase/Postgres com migrations versionadas (001-006 aplicadas e validadas no projeto real `qosioymzswhkqkziocas`): REAL.
- RLS e permissões travadas para RPC `checkout_close`: REAL.
- Checkout preview/close no backend: REAL — validado com fechamento real controlado em produção (ledger distribuído conferido linha a linha).
- Baixa de estoque no checkout via RPC: REAL.
- Ledger financeiro distribuído: REAL.
- Cadastros reais (clientes, serviços, profissionais, produtos, formas de pagamento, vínculo serviço×profissional, overrides): REAL — endpoints, validações e RPCs atômicas implementados e em produção (ver seção Cadastros).
- Hardening pós-auditoria aplicado: `overrides` bloqueado no POST/PATCH genérico de profissionais (só endpoint dedicado), `POST /formas-pagamento` não faz upsert silencioso (409 em duplicado), `CommissionEngine` bloqueia comissão fora de 0-100%, CHECK no banco para produto ativo não vender abaixo do custo, override de profissional via RPC atômica (`jsonb_set`, sem read-modify-write em Node), validação de UUID em params/listas, RPC de produto revalida `comissao_pct`/`modelo_comissao` internamente, erros de negócio da RPC (`P0001`) mapeados para HTTP 422, `POST/PATCH /clientes` validados (antes era passthrough cru).
- `SupabaseRepository.list()` pagina além de 1000 linhas (limite padrão do PostgREST) — sem isso, tabelas grandes (`clientes` já passou de 1000 registros reais) perdiam linhas silenciosamente em toda leitura (snapshot, export, `GET /catalog`).
- Testes: `npm run test:gate` — 58/58 verdes (Finance 10 + Product Foundation 8 + Schema Polymorphic 12 + RPC Permission 8 + Cadastros Reais 20).

### Frontend

- `index.html` (PWA de arquivo único) publicado no GitHub Pages, consumindo o backend real via `/api/*`.
- Estrutura de abas: Agenda, Checkout, Dashboard, Mais.
- Aba **Mais**: UI de Cadastros Reais implementada — CRUD de clientes, serviços, profissionais (+ vínculo com serviços + overrides por serviço), produtos (+ ajuste de estoque), formas de pagamento. Desativação sempre via `ativo=false`, nunca delete físico.
- Checkout: preview reorganizado em blocos Bruto → Deduções → Resultado (mesmos campos que a API já retornava; nenhum cálculo novo no frontend).
- Service worker: cache do shell HTML corrigido para network-first (antes usava stale-while-revalidate e podia servir HTML desatualizado por um reload inteiro). `/api/*` e métodos não-GET nunca são cacheados. Versão de cache atual: `hope-os-shell-v1-2`.
- `frontendCalculates: false` continua sendo a regra vigente — frontend só coleta intenção, chama API e exibe a resposta.

### Cadastros

- Clientes: REAL — `GET/POST /clientes`, `PATCH /clientes/:id` (payload validado, campos perigosos bloqueados), UI de cadastro na aba Mais.
- Serviços: REAL — `GET/POST /servicos`, `PATCH /servicos/:id`, UI de cadastro na aba Mais.
- Profissionais: REAL — `GET/POST /profissionais`, `PATCH /profissionais/:id`, UI de cadastro na aba Mais. `overrides` só via endpoint dedicado (bloqueado no POST/PATCH genérico).
- Produtos: REAL — `GET/POST /produtos`, `PATCH /produtos/:id`, ajuste de estoque via `POST /produtos/:id/estoque/ajuste` (RPC atômica, bloqueia saldo negativo), UI de cadastro + ajuste de estoque na aba Mais.
- Formas de pagamento: REAL — `GET/POST /formas-pagamento`, `PATCH /formas-pagamento/:code` (POST duplicado retorna 409, não sobrescreve), UI de cadastro na aba Mais.
- Serviço x profissional: REAL — `GET/PUT /profissionais/:id/servicos` (RPC atômica), UI de vínculo (checklist) na aba Mais.
- Overrides por profissional: REAL — `PATCH /profissionais/:id/servicos/:servicoId/override` (RPC atômica com `jsonb_set`, sem read-modify-write), checkout já lê e aplica os overrides, UI de personalização por serviço na aba Mais.

## V1.3 — Frontend UI/UX Premium (em andamento)

Etapa atual do projeto, autorizada pelo usuário em 2026-07-07. Documentos de referência:

- `docs/HOPE_OS_V1_3_FRONTEND_UI_UX_PREMIUM_BLUEPRINT.md` — plano de produto/UX.
- `docs/FRONTEND_V1_3_UI_UX_AUDIT.md` — auditoria visual/estrutural do estado atual.
- `docs/DILEMA_EXCLUIR_VS_DESATIVAR_SNAPSHOT.md` — pesquisa de mercado sobre excluir vs desativar (referência, não bloqueia V1.3).

Regra-mãe do V1.3: nenhuma regra de negócio muda por causa da UI; backend continua verdade única; sem migration nova, sem alteração no Supabase, sem novo backend, sem app do cliente/marketplace/IA/notificações reais/login completo nesta etapa (ver "Fora de escopo" no blueprint).

**Decisão registrada em 2026-07-07**: dashboard sofisticado (bento grid, alertas operacionais) está explicitamente autorizado como parte do escopo do V1.3 — exceção pontual ao gate abaixo, decidida pelo usuário após auditoria adversarial do blueprint apontar o conflito. As demais proibições continuam de pé.

Achados da auditoria adversarial ao blueprint (2026-07-07) ainda não resolvidos no próprio blueprint, a considerar durante a execução:
- Nenhum teste cobre o frontend (`test:gate` é 100% backend) — QA manual estruturado por fluxo é obrigatório, não opcional.
- Lista de Clientes (1481+ registros reais) não tem paginação/virtualização/busca — mover para bottom sheet (Etapa 3/7) piora, não melhora, sem resolver isso antes.
- Trocar os 3 `confirm()` nativos por modal custom é risco funcional em ações destrutivas (cancelar agendamento, no-show, esvaziar vínculos), não só cosmético.
- Toast/notificação nova precisa herdar a separação já existente entre banner global e `modal-error` inline (construída nesta sessão para resolver bug real de z-index atrás de modais).
- "Mínimo texto" não pode se aplicar a mensagens de erro vindas do backend (`err.message`) — só a textos estáticos do próprio frontend.

## Próximo gate proibido

Não avançar para, sem decisão explícita do usuário:

- IA;
- marketplace;
- app do cliente;
- multiunidade;
- assinatura recorrente;
- CRM avançado;
- gamificação;
- marketing automático.

("dashboards sofisticados" foi removido desta lista — ver decisão do V1.3 acima.)
