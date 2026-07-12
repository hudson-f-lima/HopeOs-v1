# 13 — V1.4.2: Identity, Tenant Boundary & Actor ID — Auditoria e Plano

**Data:** 2026-07-12
**Escopo:** `identidade → empresa_id → unit_ids → role → actor_id`
**Fora de escopo:** V1.5, features novas, migrations 007+, alteração ampla do ledger.

## Método

Leitura restrita a: `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, `CHANGELOG.md`, `backend/package.json`.
Busca restrita aos termos: `DEFAULT_EMPRESA_ID`, `empresa_id`, `unit_id`, `req.auth`, `API_ACCESS_TOKEN`, `actor_id`, `checkout`, `estoque`, `caixa`, `agenda`, `clientes`.
Migrations físicas revisadas (001–006) sem alteração.

## Achados classificados

### 1. Perímetro de autenticação
- **REAL** — `backend/src/middleware/auth.js`: Bearer `API_ACCESS_TOKEN`, comparação com `timingSafeEqual`, fail-closed (503 sem token configurado, 401 sem/token inválido). Confirmado por `test:auth` (9/9).
- **PARCIAL** — é perímetro de aplicação, não autenticação por usuário. Não existe emissão de sessão/JWT nem tabela de identidade.

### 2. `req.auth`
- **DESCONHECIDO/INEXISTENTE** antes desta auditoria — zero ocorrências no backend. Nenhuma rota recebia um objeto de identidade; cada handler instanciava `SupabaseRepository` e lia `empresa_id` direto de `env` a cada chamada.

### 3. `DEFAULT_EMPRESA_ID`
- **HARDCODED** — `backend/src/config/env.js:20`, consumido em `backend/src/repositories/SupabaseRepository.js:9` (`this.empresaId = env.DEFAULT_EMPRESA_ID`). É a **única** fonte de `empresa_id` para toda instância de repositório no processo — não há mecanismo de override por identidade porque não há identidade. Isso não é apenas fallback: é a autoridade de fato hoje, para todas as requisições, indistintamente do chamador.
- Confirmado: frontend (`**/*.{js,jsx,ts,tsx}` fora de `backend/`) nunca envia `empresa_id`/`empresaId` — 0 ocorrências.

### 4. `empresa_id` vindo de body/query
- **REAL (bloqueado corretamente)** — `rejectDangerousFields` em `backend/src/validators/cadastros.validator.js` rejeita `empresa_id`/`empresaId` em todo payload de cadastro (clientes, serviços, profissionais, produtos, estoque, formas de pagamento, vínculos, lista de espera). Toda escrita de cadastro usa `insertScoped`/`updateScoped`, que fixam `empresa_id = repo.empresaId` no servidor.
- RPCs críticas (`checkout_close`, `produto_criar_com_estoque`, `produto_estoque_ajuste`, `profissional_servicos_replace`, `profissional_servico_override_set`) recebem `p_empresa_id` resolvido no backend, nunca do payload bruto. GRANT restrito a `service_role` (migrations 003/004), confirmado por `test:rpc-lock` (11.1–11.8).

### 5. CRÍTICO — leituras/escritas sem filtro de tenant (código, não RPC)
Encontrados 4 pontos onde o filtro por `empresa_id` está ausente, mesmo a arquitetura já suportando o padrão em todo o resto do código:

| Rota | Arquivo | Problema |
|---|---|---|
| `GET /api/clientes` | `backend/src/routes/index.js:86` | `new SupabaseRepository().list('clientes')` sem filtro `empresa_id` — lista clientes de **todas** as empresas. |
| `GET /api/agenda` | `backend/src/routes/index.js:288-293` | filtro só por `data`, sem `empresa_id` — lista agendamentos de **todas** as empresas. |
| `PATCH /api/agenda/:id/duracao` | `backend/src/routes/index.js:386-399` | `repo.update('agendamentos', req.params.id, ...)` sem checagem de existência/tenant — aceita `id` de qualquer empresa. |
| `POST /api/checkout/close` (vínculo opcional com agenda) | `backend/src/routes/index.js:434-444` | `repo.update('agendamentos', req.body.agendamentoId, ...)` usa `agendamentoId` do body sem validação de UUID nem escopo de tenant. |

Hoje o impacto prático é nulo (só existe uma empresa em produção via `DEFAULT_EMPRESA_ID`), mas o código, se uma segunda empresa existisse, permitiria leitura e escrita cross-tenant sem exigir nada além de conhecer um `id`. Classificado **CRÍTICO** — corrigido nesta entrega (ver seção Implementação).

### 6. `actor_id`
- **INEXISTENTE / BLOQUEADO** — nenhuma migration (001–006) tem coluna `actor_id`, `created_by` ou equivalente em `comandos`, `comando_itens`, `produto_estoque_movimentos`, `agendamentos`, `caixa_movimentos` ou `clientes`. Registrar autoria requer `ALTER TABLE` (migration 007+), não autorizado neste ciclo.
- Não foi simulada autoria com ator compartilhado, conforme vedado.
- **Migration mínima necessária (documentada, não executada):**
  ```sql
  -- DRAFT ONLY — requer autorização do Platform Owner, migration 007
  alter table comandos add column actor_id uuid null;
  alter table produto_estoque_movimentos add column actor_id uuid null;
  alter table agendamentos add column actor_id uuid null;
  alter table caixa_movimentos add column actor_id uuid null;
  alter table clientes add column actor_id uuid null;
  -- FK para tabela de identidade fica pendente até existir tabela de usuários/sessão.
  ```

### 7. `unit_id` / unidades
- **INEXISTENTE / BLOQUEADO** — não há conceito de unidade/filial no schema; `empresa_id` é hoje a única granularidade de tenant. Nenhuma rota aceita `unit_id`. Implementar exigiria nova tabela/coluna (migration 007+) e é feature nova — fora de escopo deste ciclo.

### 8. RBAC / `role`
- **INEXISTENTE / BLOQUEADO** — não há tabela de papéis nem de usuários. `role` em `req.auth` não pode ser derivado de identidade real hoje; permanece `null` explicitamente (não simulado).

### 9. `caixa` open/close
- **DESCONHECIDO / N/A** — não existe endpoint de abertura/fechamento de caixa como feature própria. `caixa_movimentos` só é escrito dentro da RPC `checkout_close` (já `p_empresa_id`-scoped, atômica). Nenhuma alteração feita aqui — criar essa feature está fora do escopo autorizado.

### 10. `user_id` / autenticação por usuário
- **PENDENTE / BLOQUEADO** — não há tabela de usuários nem emissão de sessão/JWT. Requer integração de identidade (Supabase Auth ou equivalente) — feature nova, fora de escopo deste ciclo.

## Riscos cross-tenant remanescentes após esta entrega
- `empresa_id` continua vindo de `DEFAULT_EMPRESA_ID` (env), agora centralizado em `req.auth.empresa_id` e propagado explicitamente às rotas — mas a **fonte** ainda não é identidade validada por usuário. Multi-tenant seguro continua **BLOQUEADO** (`AGENTS.md`).
- `actor_id`, `unit_ids` e `role` continuam `null`/`[]` em `req.auth` até existir schema de identidade (migration 007+ autorizada) — documentado, não simulado.

## Implementação mínima aplicada (ver commits não realizados — sem push/commit nesta tarefa)
1. `req.auth` passa a existir em toda rota `/api/*`, populado pelo middleware de auth a partir de config server-side (não de claims do cliente).
2. `SupabaseRepository` passa a aceitar `empresaId` no construtor; rotas passam `req.auth.empresa_id` explicitamente em vez de cada handler ler `env` implicitamente.
3. Os 4 pontos CRÍTICOS da seção 5 foram corrigidos para filtrar/validar por `empresa_id` do `req.auth`, usando o mesmo padrão já empregado no restante do código (`empresa_id: repo.empresaId` / `updateScoped` / checagem de existência escopada antes de update).
4. **Corrigido na revisão pré-commit:** `SupabaseRepository.insert()` permitia que `payload.empresa_id`/`payload.empresaId` sobrescrevessem `this.empresaId` via spread do objeto (nenhum chamador atual explorava isso, mas a camada de dados não impunha o invariante por si só). Corrigido para sempre descartar esses campos do payload e gravar `empresa_id: this.empresaId`; falha fechado (`TENANT_CONTEXT_MISSING`, 500) se `this.empresaId` estiver ausente/inválido, antes de tocar o banco. `insertScoped()` já era seguro (spread do payload vem antes do `empresa_id: this.empresaId` fixo).
5. Novo gate de teste `backend/tests/tenant-boundary-gate.test.js` (12 testes) prova: `req.auth` populado com token válido; override de `empresa_id`/`unit_id`/`role` por query/body é ignorado; `GET /clientes` e `GET /agenda` não vazam de fora do tenant; update por id estrangeiro é rejeitado (404), não silenciosamente aplicado; vínculo agenda↔checkout usa validateUUID + updateScoped; `insert()` ignora `empresa_id`/`empresaId` maliciosos do payload (inserção real + limpeza) e falha fechado sem tenant válido.
6. `actor_id`, `unit_id` e RBAC **não** foram implementados — permanecem `BLOQUEADO` conforme seções 6–8, com a migration mínima documentada acima para quando houver autorização do Platform Owner.

## Critério de aceite — status
- Gates aplicáveis verdes: **SIM** (ver execução em `docs/PROJECT_STATE.md`).
- Zero rota crítica usando `empresa_id` do frontend como autoridade: **SIM** (nunca existiu; confirmado por busca).
- Zero acesso cross-tenant comprovado: **SIM após correção** dos 4 pontos da seção 5 (antes da correção, eram exploráveis em teoria caso existisse 2ª empresa).
- Escritas críticas com `actor_id` ou formalmente bloqueadas: **BLOQUEADO formalmente**, migration mínima documentada.
- V1.5 permanece bloqueada: **SIM**.
