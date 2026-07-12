# MIGRATION 007 — IDENTITY MODEL — DRAFT ONLY

## Status
DRAFT TÉCNICO — não autorizado para execução. Transforma a arquitetura aprovada em [ADR-005](../adr/ADR-005-identity-tenant-rbac-actor.md) em um plano de schema executável. Nenhum SQL deste documento (ou dos arquivos companheiros `sql/007_identity_model_DRAFT_ONLY.sql` e `sql/007_identity_model_TESTS_DRAFT_ONLY.sql`) deve ser aplicado a nenhum ambiente sem autorização explícita do Platform Owner, revisão de segurança e aprovação da ordem de execução abaixo.

**Revisado após três rodadas de Red Team técnico.** Rodada 3 encontrou que os próprios testes de schema tinham falsos positivos: TESTE 2b não reproduzia a corrida original (começava de 0 credenciais, então as duas inserções concorrentes terminavam legitimamente em 2, nunca disputando uma 3ª) e aceitava timeout de lock como "sucesso" (timeout só prova contenção, não que a rejeição por limite aconteceu); TESTE 1/2/3 usavam `EXCEPTION WHEN OTHERS`, aceitando qualquer erro (permissão, coluna, digitação) como se fosse a rejeição arquitetural esperada; e TESTE 3 selecionava "a empresa mais antiga"/"qualquer membership" em vez dos fixtures exatos do Setup. Corrigido: todos os testes agora verificam o SQLSTATE específico esperado (`P0001` dos triggers customizados; `23503` da FK composta, com nome da constraint); TESTE 2b foi reescrito para partir de 1 credencial ativa pré-existente e exigir que a rejeição da 3ª aconteça por `P0001`, não por `lock_timeout`; todos os fixtures de teste (2 empresas + 1 usuário) usam UUIDs fixos referenciados diretamente, nunca por ordenação/nome. `docs/PROJECT_STATE.md` e `docs/INDEX.md` também foram corrigidos para listar todos os arquivos deste ciclo (faltavam o arquivo de testes, o runner e a própria entrada de índice). Rodada 1 corrigiu: (1) corrida de concorrência no limite de credenciais ativas; (2) `integration_audit_events` tornado append-only por trigger, não só por convenção; (3) tentativa de tornar o arquivo SQL seguro de re-executar; (4) autoria cross-tenant impedida por FK composta. Rodada 2 encontrou que a própria correção de idempotência da rodada 1 estava incompleta e que os "gates" de schema tinham caminhos de passagem silenciosa — corrigido nesta versão: (a) as 4 constraints `UNIQUE` que servem de alvo para as FKs compostas **não são mais dropadas** em re-execução (eram, e o Postgres recusa `DROP` de um `UNIQUE`/PK referenciado por FK sem `CASCADE` — a "correção" da rodada 1 quebrava na segunda execução exatamente pelas FKs que a mesma rodada adicionou); (b) o trigger de limite de credenciais foi movido de `AFTER` para `BEFORE`, por recomendação do Red Team, para eliminar ambiguidade de ordem de lock com o enforcement interno da FK — **isto continua sendo uma correção de desenho, não validada contra duas conexões reais**; (c) o teste de autoria cross-tenant não tem mais um caminho "PULADO" que passa em verde sem testar nada — o setup agora cria os dados determinísticos necessários ou falha explicitamente; (d) o teste de grants agora é uma assertion real (`has_table_privilege`), não uma consulta para inspeção visual; (e) a reexecução do arquivo (antes só documentada em comentário) agora tem um runner automatizado (`run_idempotency_test_DRAFT_ONLY.sh`). Achados classificados DESCONHECIDO (grants não validados contra catálogo real; sincronização `auth.users → app_users` não desenhada) permanecem em aberto — não foram fabricados nem escondidos, ver Bloqueadores. **Nenhum destes testes foi executado de fato contra um banco real ainda** — todos estão escritos e prontos, não comprovados.

## Fase 1 — Identidade mínima (plano faseado, decisão de 2026-07-12)

**Este é o próximo passo autorizado a ser especificado.** Em 2026-07-12 o Platform Owner rejeitou a implantação da 007 como bloco único (ver `docs/PROJECT_STATE.md`) e decidiu fasear a execução em quatro etapas independentes, cada uma com seu próprio critério de aceite: Fase 1 (identidade mínima, esta seção), Fase 2 (tenant e memberships), Fase 3 (RBAC), Fase 4 (integrações e autoria — o restante deste documento, preservado sem redesenho). Nenhuma fase constitui autorização para criar uma migration física `007+` — nem `007a`/`007b`/etc. — sem autorização explícita e separada do responsável do projeto, conforme `AGENTS.md`. Esta seção é especificação documental: nenhum SQL é executado e nenhum código de backend é alterado nesta etapa.

### Escopo da Fase 1

Somente:
- `app_users` (mesma definição já desenhada em "Tabelas" abaixo — nenhum redesenho, só extração de escopo).
- Trigger `auth.users → app_users`.
- Regra de ativação/desativação sem exclusão física.
- Backend: validação de JWT do Supabase Auth.
- Backend: preenchimento de `req.auth.user_id`.
- Testes mínimos (criação, duplicidade, desativação, falha do trigger).

Explicitamente fora da Fase 1 (fica para as fases seguintes, sem redesenho aqui):
- `empresa_id`, `empresa_memberships`, resolução de tenant — Fase 2.
- RBAC, `role`, autorização por rota — Fase 3.
- `unidades`, `membership_units`, `integrations`, `integration_credentials`, `integration_scopes`, `integration_audit_events`, colunas de autoria em tabelas existentes, tenant boundary via FK composta — Fase 4 (desenho já completo nas seções "Tabelas" a "Red Team" abaixo; não é redesenhado, só adiado).
- RLS com policies reais — segue adiada, sem mudança de recomendação (ver seção RLS).

### `app_users` — referência exclusiva à PK estável

`app_users.id` referencia apenas `auth.users.id` (`uuid`, chave primária estável do Supabase Auth) — nunca `email` ou qualquer outro campo mutável de `auth.users`. Isso já está refletido na definição de "Tabelas" abaixo (`id references auth.users(id) on delete restrict`); a Fase 1 não introduz nenhuma coluna nova em `app_users` além do que já está desenhado ali. Justificativa de reforço: `email` pode ser alterado pelo próprio usuário no Supabase Auth (troca de e-mail) ou ser nulo/pendente de confirmação — usá-lo como chave de vínculo criaria uma dependência frágil; `id` nunca muda depois de criado.

### Trigger `auth.users → app_users`

Desenho conceitual (DDL comentado, mesmo padrão do restante deste documento — não é o arquivo SQL executável):

```sql
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.app_users (id, nome, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
```

Pontos de desenho que precisam de teste real antes de qualquer autorização de execução:

- **`security definer`**: obrigatório — o trigger precisa gravar em `public.app_users` a partir de um evento em `auth.users`, schema onde o role que dispara o INSERT (o próprio GoTrue/Supabase Auth) não necessariamente tem permissão de escrita direta em `public`. `security definer` faz a função rodar com os privilégios do seu dono (deve ser criada por um role com permissão em `public.app_users`, nunca por um role de aplicação de baixo privilégio).
- **`search_path` restrito**: `set search_path = public, pg_temp` fixo na própria função — mitiga o ataque clássico de sequestro de `search_path` em funções `security definer` (um objeto malicioso criado num schema anterior no `search_path` do chamador não pode ser resolvido no lugar de `public.app_users`, porque o `search_path` da função é fixo, não herdado do chamador).
- **`on conflict (id) do nothing`**: torna a inserção idempotente — se o trigger disparar mais de uma vez para o mesmo `auth.users.id` (reprocessamento, retry), não gera erro nem duplicata. Isso é uma garantia de banco, não uma suposição sobre o comportamento do GoTrue.
- **Tratamento de falha — decisão de desenho, não validada empiricamente**: este trigger roda na mesma transação do `INSERT` em `auth.users` feito pelo Supabase Auth. Se o trigger lançar uma exceção não tratada, a transação inteira é revertida — **o cadastro do usuário falha**, não só a criação do perfil. Isso é deliberadamente **fail-closed**: a alternativa (capturar toda exceção e seguir em frente) criaria um `auth.users` órfão, sem `app_users` correspondente, que quebraria silenciosamente qualquer FK de autoria (`actor_id`/`created_by`) na primeira ação real desse usuário — um modo de falha pior, adiado e mais difícil de depurar. A recomendação desta especificação é **não engolir exceções genéricas** neste trigger; a única tolerância explícita é a idempotência via `on conflict do nothing` acima. **Isto precisa ser validado contra o comportamento real do GoTrue antes de qualquer execução** — não presumir aqui que a Supabase Auth necessariamente reverte cadastro em toda falha de trigger sem testar; ver "Testes mínimos" abaixo.
- **Origem do campo `nome`**: `auth.users` não tem coluna `nome` própria — vem de `raw_user_meta_data ->> 'nome'`, com fallback para 'Usuário sem nome' se ausente ou vazio. Ver nota abaixo sobre `raw_user_meta_data` não ser fonte de autorização.

### `raw_user_meta_data` — dado de perfil, nunca de autorização

`raw_user_meta_data` é preenchido pelo cliente no momento do signup (via SDK do Supabase Auth) e **não é confiável para decisões de autorização** — um usuário mal-intencionado pode enviar qualquer valor nesse campo diretamente na chamada de signup. Nesta especificação, `raw_user_meta_data` é usado **exclusivamente** para popular `app_users.nome` (dado de perfil, sem impacto em acesso). Nenhuma decisão de tenant, role ou permissão pode, agora ou em fase futura, ler `raw_user_meta_data` como fonte de verdade — isso vale também para claims customizadas de JWT (ver seção RBAC/Custom Access Token Hook, fora do escopo da Fase 1): a fonte de verdade para `empresa_id`/`role` continua sendo sempre uma consulta fresca a `empresa_memberships` no backend (Fase 2/3), nunca um valor que se origina de entrada do próprio usuário.

### Ativação/desativação sem exclusão física

Reafirma o que já está desenhado em "Tabelas" (`app_users.ativo`, `on delete restrict` de `auth.users`): a aplicação **desativa** (`update app_users set ativo = false where id = ...`), nunca exclui fisicamente uma linha de `app_users`. Isso preserva as FKs de autoria (`actor_id`/`created_by`/etc., adicionadas só na Fase 4) mesmo depois que um usuário deixa de ter acesso. Se algum dia uma exclusão física de `auth.users` for tentada com `app_users` associado, o `on delete restrict` já desenhado rejeita a operação explicitamente — comportamento herdado, não redesenhado aqui.

### Backend — validação de JWT e `req.auth.user_id`

Fora do schema, mas documentado aqui como escopo da Fase 1 (implementação real fica para quando o backend for de fato alterado — **nenhum código de backend é alterado por esta especificação**):
- O backend valida o JWT emitido pelo Supabase Auth (assinatura verificada contra o segredo/JWKS do projeto Supabase) em cada requisição autenticada.
- O `sub` claim do JWT validado é o `user_id` (== `auth.users.id` == `app_users.id`) — usado para preencher `req.auth.user_id`.
- Nesta fase, **somente** `req.auth.user_id` passa a vir de identidade real validada. `req.auth.empresa_id` continua vindo de `DEFAULT_EMPRESA_ID` (nenhuma mudança — resolução real de tenant é Fase 2); `req.auth.role`/`unit_ids` continuam `null`/`[]` (Fase 3), como já documentado em `docs/PROJECT_STATE.md`.
- Coexistência com `API_ACCESS_TOKEN`: mesma decisão já registrada na ADR-005 e na seção "Compatibilidade legada" deste documento — não redecidida aqui.

### Testes mínimos (Fase 1)

Descritos aqui como especificação — **não adicionados a `sql/007_identity_model_TESTS_DRAFT_ONLY.sql` nesta etapa** (esse arquivo pertence ao desenho de bloco único / Fase 4 e não é alterado por esta seção). Quando a Fase 1 for autorizada para execução real, estes quatro testes devem ser escritos como um roteiro próprio, seguindo a mesma convenção de rigor já usada no arquivo de testes existente (SQLSTATE específico, nunca `WHEN OTHERS` genérico; fixtures determinísticos, nunca por ordenação):

1. **Criação**: inserir uma linha em `auth.users` (fixture de teste) → confirmar que exatamente uma linha correspondente existe em `app_users`, com `id` igual, `ativo = true`, e `nome` igual ao `raw_user_meta_data->>'nome'` do fixture (ou 'Usuário sem nome', se o fixture não tiver esse campo ou for vazio).
2. **Duplicidade**: dois cenários — (a) inserir em `auth.users` e depois tentar simular novo disparo do trigger para o mesmo `id` (ex.: reexecução manual da função) → confirmar que continua existindo exatamente uma linha em `app_users`, sem erro; (b) tentar `insert into app_users` diretamente (fora do trigger) para um `id` que já tem linha → deve ser rejeitado pela PK, `SQLSTATE 23505`.
3. **Desativação**: `update app_users set ativo = false` → confirmar que a linha continua existindo (não há `DELETE`); confirmar que uma tentativa de `delete from auth.users` para esse `id` falha com `SQLSTATE 23503` (violação da FK `on delete restrict` já desenhada), não com sucesso silencioso.
4. **Falha do trigger**: forçar uma condição de erro dentro da função (ex.: uma constraint adicional de teste que rejeite um valor específico de `nome`) → confirmar que o `INSERT` em `auth.users` inteiro falha (transação revertida — nenhuma linha órfã em `auth.users` nem em `app_users`) e que o erro tem um `SQLSTATE` identificável, não um erro genérico engolido silenciosamente.

**Nenhum destes quatro testes foi escrito como SQL executável ou executado contra um banco** — são a especificação do que precisa existir antes de a Fase 1 ser considerada pronta para execução real, mesmo padrão de honestidade do restante deste documento (ver seção Gates: "escrito" ≠ "comprovado").

### Fora do escopo da Fase 1 (reafirmado)

- Nenhum `empresa_id`, RBAC, tenant boundary ou integração — isso é Fase 2, 3 e 4 respectivamente, cujo desenho já existe nas seções abaixo deste documento e não é alterado por esta especificação.
- Nenhuma execução de SQL contra qualquer banco (descartável ou não) nesta etapa — esta seção é documentação.
- Nenhuma alteração de código de backend nesta etapa.
- Nenhuma criação de migration física `007+` — a conversão desta especificação em migration exige autorização explícita e separada do responsável do projeto, mesmo depois de a especificação estar completa.

## Dependências
- [ADR-005](../adr/ADR-005-identity-tenant-rbac-actor.md) — aprovada e mesclada (`main`, commit `31b128d`). Este documento não reabre nenhuma decisão arquitetural já tomada lá; apenas a traduz em DDL.
- [Auditoria 13](../audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md) — mapeamento original dos riscos cross-tenant e do estado de `req.auth`.
- `supabase/migrations/001_init.sql` a `006_produto_estoque_ajuste_rpc.sql` — schema físico vigente; nenhum arquivo aí é alterado por este draft.
- Implementação de backend (middleware JWT, resolução de `req.auth`, RPCs de rotação/emissão de credencial S2S) — **não existe ainda**. Este draft assume que esse código será escrito depois da migration, nunca antes (uma migration que cria tabelas vazias é segura de aplicar antes do backend que as usa; o inverso — backend esperando tabelas inexistentes — não é).

## Escopo
- Desenho completo (DDL conceitual + comentado) das 8 tabelas novas da ADR-005: `app_users`, `empresa_memberships`, `unidades`, `membership_units`, `integrations`, `integration_credentials`, `integration_scopes`, `integration_audit_events`.
- Classificação de autoria (`ALTERAR`/`NÃO ALTERAR`/`BLOQUEADA`/`DESCONHECIDA`) para toda tabela existente em 001–006.
- Constraints de tenant boundary aplicadas no banco (não só na aplicação), incluindo o padrão de FK composta para impedir vínculo cross-tenant em `membership_units` e em toda coluna de autoria (`actor_id`/`created_by`/`updated_by`/`cancelled_by`/`integration_id`).
- Plano de backfill em fases (nullable → backfill → validação → constraint final).
- Ordem de execução numerada, rollback por etapa, gates de aceite, estratégia explícita de idempotência (arquivo seguro de reexecutar).
- Red Team dos cenários pedidos, com mitigação registrada para cada um — incluindo os 5 achados adicionais de uma revisão técnica posterior (corrida de concorrência no limite de credenciais, auditoria não realmente append-only, arquivo não idempotente, autoria cross-tenant sem FK, e as duas classificações `DESCONHECIDO`).
- Roteiro de testes de schema (`sql/007_identity_model_TESTS_DRAFT_ONLY.sql`) para os gates validáveis sem backend.

## Fora do escopo
- Executar qualquer SQL — este e o arquivo companheiro são `DRAFT ONLY`.
- Alterar `supabase/migrations/001` a `006`.
- Alterar backend, frontend ou qualquer código de aplicação.
- Implementar RLS com policies reais (ver seção RLS — decisão é adiar policies, manter só o padrão já vigente).
- V1.5, escala global, ou qualquer feature nova fora do modelo de identidade da ADR-005.
- Definir o mecanismo exato de emissão/validação de JWT no backend (isso é implementação de código, não schema — fica para quando o backend for escrito).

## Estado atual
- Schema físico: migrations 001–006, sem tabelas de identidade, papéis, unidades ou autoria (confirmado por leitura direta dos arquivos).
- RLS já está **habilitada sem policies** em todas as tabelas de negócio desde `001_init.sql` (`alter table ... enable row level security`, sem `create policy`) — com RLS habilitada e zero policies, `anon`/`authenticated` ficam bloqueados por padrão (ausência de policy nega acesso). **Correção de precisão desta revisão**: isso bloqueia acesso direto sem policy, mas **não é isolamento multi-tenant** e não protege contra uso indevido do próprio `service_role` (que ignora RLS por padrão no Supabase) — o controle de tenant continua inteiramente no backend (filtro por `empresa_id`). Evitar a formulação "defesa em profundidade real" sem essa ressalva, para não sugerir uma garantia que o schema não entrega.
- `004_service_role_table_grants.sql` configura `alter default privileges in schema public grant select, insert, update, delete on tables to service_role`, que **deveria** se aplicar automaticamente a qualquer tabela nova. **Correção de precisão desta revisão**: isso foi verificado por **leitura do arquivo de migration**, não por consulta ao catálogo (`pg_default_acl`) de um banco real — classificar como confirmado-por-código, não confirmado-em-produção, até alguém rodar a consulta do `TESTE 5` em `sql/007_identity_model_TESTS_DRAFT_ONLY.sql` contra o banco alvo real antes da execução.
- `req.auth` (V1.4.2, PR #13) já centraliza a leitura de `empresa_id` nas rotas — a migration 007 não precisa alterar `backend/src/routes/index.js` para as tabelas de negócio existentes; só o middleware de auth muda quando o backend for implementado (fora de escopo deste draft).

## Modelo de dados
Diagrama textual (idêntico ao da ADR-005, repetido aqui para referência rápida do schema):
```text
auth.users (Supabase Auth)
  ↓ (1:1, trigger de sincronização em INSERT)
app_users
  ↓ (1:N)
empresa_memberships ──(N:1)── empresas
  ↓ (1:N, opcional, via composite FK)
membership_units ──(N:1, mesma empresa)── unidades ──(N:1)── empresas

integrations ──(N:1)── empresas
  ↓ (1:N)
integration_credentials
integrations ↓ (1:N)
integration_scopes
integrations ↓ (1:N)
integration_audit_events
```

## Tabelas

### `app_users`
| Campo | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK; **não** tem default próprio — é sempre igual a `auth.users.id` (a linha é criada por um trigger de sincronização, não por INSERT direto do backend) |
| `nome` | `text` | not null |
| `ativo` | `boolean` | not null default `true` |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

- **FK**: `id references auth.users(id) on delete restrict` — deletar um `auth.users` com `app_users` associado falha explicitamente. Justificativa: preserva a FK de autoria (`actor_id`/`created_by`/etc. em outras tabelas) mesmo que o usuário saia do provedor de identidade; a aplicação deve sempre **desativar** (`ativo = false`) em vez de excluir.
- **`empresa_id`**: não existe nesta tabela — um `app_user` não pertence a uma empresa; o vínculo (e o `empresa_id`) vive em `empresa_memberships`. Isso é o que permite um usuário em múltiplas empresas sem retrabalho de schema.
- **Índices**: nenhum além da PK (tabela pequena, lookup sempre por `id`).
- **Regra de exclusão**: `on delete restrict` do lado de `auth.users`; nenhuma exclusão física prevista a partir da aplicação.
- **Compatibilidade**: aditiva, sem tocar em nenhuma tabela existente.
- **Rollback**: `DROP TABLE app_users` — só é seguro depois que todas as colunas de autoria que a referenciam (`actor_id`, `created_by`, etc., adicionadas mais abaixo) forem removidas primeiro (ordem inversa, ver Rollback).

### `empresa_memberships`
| Campo | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `empresa_id` | `uuid` | not null, FK → `empresas(id) on delete cascade` |
| `user_id` | `uuid` | not null, FK → `app_users(id) on delete cascade` |
| `role` | `membership_role` (enum: `admin`,`gestor`,`recepcao`,`profissional`) | not null |
| `status` | `text` | not null default `'ativo'`, check `in ('ativo','inativo')` |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

- **Constraint obrigatória**: `unique (empresa_id, user_id)` — membership única por usuário + empresa (pedida explicitamente; um usuário não pode ter duas linhas de membership para a mesma empresa, mesmo com roles diferentes — trocar de role é um `UPDATE`, não uma segunda linha).
- **Constraint auxiliar**: `unique (id, empresa_id)` — redundante sobre a PK, mas necessária como alvo de FK composta para `membership_units` (ver abaixo). Postgres permite unique constraints que são superset da PK.
- **`on delete cascade` em `user_id`**: aceitável porque a aplicação nunca exclui `app_users` fisicamente (só desativa); se algum dia uma exclusão física acontecer, é aceitável que as memberships associadas também sumam.
- **Índices**: `idx_empresa_memberships_user (user_id)`, `idx_empresa_memberships_empresa_status (empresa_id, status)` — a segunda serve exatamente a query de tenant resolution ("memberships ativas desta empresa/usuário") descrita na ADR.
- **Compatibilidade**: aditiva.
- **Rollback**: `DROP TABLE` — sistema volta a depender só de `DEFAULT_EMPRESA_ID`/`API_ACCESS_TOKEN` (documentado na ADR-005 e na auditoria 13).

### `unidades`
| Campo | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `empresa_id` | `uuid` | not null, FK → `empresas(id) on delete cascade` |
| `nome` | `text` | not null |
| `ativo` | `boolean` | not null default `true` |
| `created_at` | `timestamptz` | not null default `now()` |

- **Constraint auxiliar**: `unique (id, empresa_id)` — mesma razão que em `empresa_memberships`, necessária para a FK composta de `membership_units`.
- **Constraint recomendada (não obrigatória)**: `unique (empresa_id, nome)` — evita duas unidades com o mesmo nome na mesma empresa; erro de cadastro, não risco de segurança. Fica a critério do Platform Owner incluir ou não.
- **Índices**: `idx_unidades_empresa (empresa_id)`.
- **Regra de exclusão**: nenhuma prevista — unidades são desativadas (`ativo = false`), não excluídas, para preservar `membership_units` histórico.
- **Rollback**: `DROP TABLE` — mas só depois de `membership_units` (dependência).

### `membership_units`
| Campo | Tipo | Regra |
|---|---|---|
| `membership_id` | `uuid` | not null |
| `unit_id` | `uuid` | not null |
| `empresa_id` | `uuid` | not null — **denormalizado deliberadamente** (ver constraint de tenant boundary abaixo) |
| `created_at` | `timestamptz` | not null default `now()` |

- **PK**: `(membership_id, unit_id)` — impede vínculo duplicado (constraint "sem duplicidade" pedida).
- **Constraint de tenant boundary (a mais importante desta tabela)**: em vez de duas FKs simples (`membership_id → empresa_memberships(id)`, `unit_id → unidades(id)`), usar **FKs compostas** contra as colunas `unique (id, empresa_id)` criadas acima:
  ```text
  foreign key (membership_id, empresa_id) references empresa_memberships(id, empresa_id)
  foreign key (unit_id, empresa_id) references unidades(id, empresa_id)
  ```
  Isso torna **estruturalmente impossível** inserir uma linha onde a unidade pertence a uma empresa diferente da membership — o Postgres rejeita a linha no `INSERT`, antes de qualquer código de aplicação rodar. É a resposta direta e no nível de banco ao cenário de Red Team "unidade de outra empresa vinculada por engano ou por bug".
- **Índices**: `idx_membership_units_unit (unit_id)` (para a pergunta inversa "quem tem acesso a esta unidade").
- **Rollback**: `DROP TABLE` — sem dependentes.

### `integrations`
| Campo | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `empresa_id` | `uuid` | not null, FK → `empresas(id) on delete cascade` — **fixado na criação, imutável depois** |
| `nome` | `text` | not null |
| `status` | `text` | not null default `'ativo'`, check `in ('ativo','inativo')` |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

- **Constraint obrigatória — "integração vinculada a um único tenant" e "integração trocar tenant" (Red Team)**: um trigger `before update` que rejeita qualquer tentativa de mudar `empresa_id` depois da criação (`if NEW.empresa_id <> OLD.empresa_id then raise exception`). Isto é deliberadamente mais forte que "a aplicação nunca expõe um campo para isso" — um trigger de banco protege mesmo contra um bug de backend ou um `UPDATE` manual malfeito via `service_role` (que ignora RLS, mas **não** ignora triggers).
- **Índices**: `idx_integrations_empresa (empresa_id, status)`.
- **Rollback**: `DROP TABLE` (em ordem inversa às tabelas dependentes: `integration_audit_events` → `integration_scopes` → `integration_credentials` → `integrations`).

### `integration_credentials`
| Campo | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `integration_id` | `uuid` | not null, FK → `integrations(id) on delete cascade` |
| `secret_hash` | `text` | not null — **nunca** texto plano; hash (argon2/bcrypt) do segredo, gerado e verificado só pelo backend |
| `expires_at` | `timestamptz` | null — expiração opcional |
| `revoked_at` | `timestamptz` | null — revogação individual |
| `created_at` | `timestamptz` | not null default `now()` |

- **Constraint obrigatória — "no máximo duas credenciais ativas durante rotação"**: não é expressável em `CHECK` de linha única (depende de contagem entre linhas). Trigger `before insert or update` conta credenciais "ativas" (`revoked_at is null and (expires_at is null or expires_at > now())`), excluindo a própria linha, para o mesmo `integration_id` e recusa (`raise exception`) se o resultado atingir 2.
  **Correção de concorrência, em duas rodadas**: a versão original deste trigger contava sem travar nada (`AFTER`, sem lock), permitindo que duas transações concorrentes vissem ambas "menos de 2" e criassem uma terceira credencial (corrida clássica de TOCTOU) — corrigido travando a linha-pai em `integrations` (`select ... for update`) antes de contar. Uma segunda rodada de Red Team apontou que o trigger ainda era `AFTER`, rodando depois do enforcement interno da FK `integration_id → integrations` (que já toma seu próprio lock antes do trigger de usuário disparar) — ambiguidade de ordem de lock, não uma corrida comprovada, mas motivo suficiente para simplificar. Corrigido movendo o trigger para `before insert or update`, onde o lock explícito é sempre o primeiro a acontecer. **Isto continua sendo uma correção de desenho: não foi validada contra duas conexões reais.** O roteiro de teste de duas sessões (TESTE 2b, com `lock_timeout` para nunca travar silenciosamente) está escrito em `sql/007_identity_model_TESTS_DRAFT_ONLY.sql`, mas não foi executado — não classificar esta correção como comprovada até rodar de fato.
- **Índices**: `idx_integration_credentials_integration (integration_id)`.
- **Rollback**: `DROP TABLE`.

### `integration_scopes`
| Campo | Tipo | Regra |
|---|---|---|
| `integration_id` | `uuid` | not null, FK → `integrations(id) on delete cascade` |
| `scope` | `text` | not null |
| `created_at` | `timestamptz` | not null default `now()` |

- **PK**: `(integration_id, scope)` — a própria PK composta já garante "scope sem duplicidade" sem precisar de constraint adicional.
- **Rollback**: `DROP TABLE`.

### `integration_audit_events`
| Campo | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `integration_id` | `uuid` | not null, FK → `integrations(id) on delete restrict` — **restrict, não cascade**: excluir uma integração não pode apagar seu histórico de auditoria |
| `rota` | `text` | not null |
| `status_code` | `int` | not null |
| `created_at` | `timestamptz` | not null default `now()` |

- **Append-only — CORRIGIDO nesta revisão**: a versão anterior deste documento afirmava "append-only" contando só com a ausência de `GRANT` explícito — mas `004_service_role_table_grants.sql` já concede `UPDATE`/`DELETE` a `service_role` por `alter default privileges`, que se aplica automaticamente a esta tabela nova. Isso tornava a afirmação **falsa na prática**: sem um trigger, era só convenção de aplicação, exatamente o tipo de garantia que este projeto já decidiu não aceitar (ver ADR-005, "não confiar apenas nos validators"). Corrigido com um trigger `before update or delete` que rejeita **qualquer** tentativa, inclusive vinda de `service_role` (triggers rodam independente de role; só RLS é ignorada por `service_role`).
- **Índices**: `idx_integration_audit_events_integration_created (integration_id, created_at)`.
- **Rollback**: `DROP TABLE` (primeiro item da ordem inversa, por ser a mais dependente).

## Constraints
Resumo de todas as constraints obrigatórias pedidas e onde cada uma é implementada:

| Constraint pedida | Onde é implementada |
|---|---|
| Membership única por usuário + empresa | `unique (empresa_id, user_id)` em `empresa_memberships` |
| Role válida | Tipo `enum membership_role` (Postgres rejeita valor fora do enum) |
| Status válido | `check (status in ('ativo','inativo'))` em `empresa_memberships`/`integrations` |
| Unidade pertencente à mesma empresa da membership | FK composta em `membership_units` contra `(id, empresa_id)` de `empresa_memberships` e `unidades` |
| Vínculo membership × unidade sem duplicidade | PK `(membership_id, unit_id)` em `membership_units` |
| Integração vinculada a um único tenant | `empresa_id` fixo + trigger `before update` bloqueando mudança |
| Credencial associada à integração | FK `integration_credentials.integration_id → integrations(id)` |
| Segredo armazenado somente como hash | Coluna é `secret_hash`; nenhuma coluna de texto plano existe no schema — não há onde gravar o segredo em claro mesmo por engano |
| No máximo duas credenciais ativas durante rotação | Trigger `before insert or update` com lock de linha-pai em `integration_credentials` — corrigido no **desenho** em duas rodadas; concorrência real ainda não validada empiricamente (ver TESTE 2b) |
| Scope sem duplicidade | PK composta `(integration_id, scope)` em `integration_scopes` |
| Eventos de auditoria append-only | Trigger `before update or delete` que rejeita qualquer alteração/exclusão, inclusive de `service_role` (corrigido nesta revisão — antes dependia só de ausência de GRANT, que na verdade já existe via `004_service_role_table_grants.sql`) |
| Autoria humana e de integração mutuamente exclusivas | `check (actor_id is null or integration_id is null)` nas tabelas de evento imutável (`comandos`, `produto_estoque_movimentos`) — ver seção Autoria |
| Autoria (humana ou de integração) pertence à mesma empresa da linha | FK composta `(empresa_id, actor_id) → empresa_memberships(empresa_id, user_id)` e `(empresa_id, integration_id) → integrations(empresa_id, id)` — corrigido nesta revisão, ver seção Tenant boundary |

## Índices
Consolidado (além dos já citados por tabela):
```text
idx_empresa_memberships_user            empresa_memberships(user_id)
idx_empresa_memberships_empresa_status  empresa_memberships(empresa_id, status)
idx_unidades_empresa                    unidades(empresa_id)
idx_membership_units_unit               membership_units(unit_id)
idx_integrations_empresa                integrations(empresa_id, status)
idx_integration_credentials_integration integration_credentials(integration_id)
idx_integration_audit_events_integration integration_audit_events(integration_id, created_at)
```
Nenhum índice full-table-scan-prone é esperado nas tabelas novas (todas pequenas relativas ao volume de negócio); os índices acima existem para as consultas de resolução de tenant/autorização que rodam a **cada requisição autenticada**, onde latência importa mais que em cadastros administrativos.

## Tenant boundary
Como o banco impede cada cenário pedido:

| Cenário | Mecanismo |
|---|---|
| Membership apontar para empresa errada | Não há um "errado" a apontar — `empresa_id` vem do `INSERT` feito pelo backend a partir de uma ação administrativa explícita; a constraint `unique(empresa_id, user_id)` impede duplicar a mesma pessoa na mesma empresa, mas a escolha de qual empresa é responsabilidade da aplicação (não há uma segunda tabela para comparar) |
| Unidade de outra empresa vinculada à membership | **Impossível pelo schema** — FK composta em `membership_units` (ver tabela acima) |
| Integração trocar tenant | **Impossível pelo schema** — trigger `before update` em `integrations.empresa_id` |
| Credencial operar em tenant diferente | Não existe `empresa_id` em `integration_credentials`/`integration_scopes` — eles herdam o tenant de `integrations.empresa_id` via FK; não há como uma credencial "escolher" outro tenant porque ela não tem esse campo |
| Vínculo cross-tenant (genérico) | Mesmo padrão de FK composta aplicado sempre que uma tabela de vínculo (N:N) referencia duas outras tabelas com tenant próprio |
| Autoria apontar para usuário de outra empresa | **CORRIGIDO nesta revisão — bloqueado pelo schema.** Ver nota abaixo |

**Nota sobre autoria cross-tenant (corrigida)**: a versão anterior deste documento reconhecia esta lacuna mas recomendava não fechá-la, por avaliar (incorretamente) que exigiria uma consulta extra via trigger. A revisão Red Team apontou corretamente que isso não deveria ficar como lacuna aceita. Solução adotada: reaproveitar o mesmo padrão de FK composta já usado em `membership_units`, mas indexado pela unique constraint já existente `empresa_memberships(empresa_id, user_id)` (a mesma que implementa "membership única por usuário + empresa") e por uma nova `integrations(empresa_id, id)`:
```text
foreign key (empresa_id, actor_id) references empresa_memberships (empresa_id, user_id)
foreign key (empresa_id, integration_id) references integrations (empresa_id, id)
```
Como `actor_id`/`integration_id` são `nullable` e o Postgres usa `MATCH SIMPLE` por padrão em FKs compostas, a checagem é **automaticamente pulada** quando a coluna de autoria está `null` (evento sem autor humano, autor de integração, ou histórico pré-migração) e **aplicada** sempre que a coluna estiver preenchida — exatamente o comportamento desejado, sem precisar de trigger nem consulta extra. Aplicado em `comandos`, `produto_estoque_movimentos` (ambas colunas de autoria) e em `agendamentos`/`clientes`/`produtos`/`servicos`/`profissionais`/`formas_pagamento` (`created_by`/`updated_by`/`cancelled_by`). Detalhe importante: a FK verifica que o `(empresa_id, user_id)` **existe** em `empresa_memberships`, não que a membership está `status = 'ativo'` no momento da escrita — isso é intencional: uma membership desativada depois não deve invalidar retroativamente uma autoria que já era legítima quando o evento aconteceu.

## Autoria
Classificação de toda tabela existente (001–006):

| Tabela | Categoria (ADR-005) | Classificação | Ação |
|---|---|---|---|
| `comandos` | Evento imutável | **ALTERAR** | Adicionar `actor_id uuid null references app_users(id)` e `integration_id uuid null references integrations(id)`, com `check (actor_id is null or integration_id is null)` |
| `produto_estoque_movimentos` | Evento imutável | **ALTERAR** | Idem: `actor_id` + `integration_id` + check de exclusividade |
| `comando_itens` | Derivada do evento principal | **NÃO ALTERAR** | Herda autoria via `comando_id`; adicionar coluna própria seria duplicação (já sinalizado na auditoria 13) |
| `comando_pagamentos` | Derivada | **NÃO ALTERAR** | Idem |
| `comando_gorjetas` | Derivada | **NÃO ALTERAR** | Idem |
| `caixa_movimentos` | Ledger (parcial hoje) | **NÃO ALTERAR** | Já referencia `comando_id`; herda autoria de lá. Só precisará de `actor_id`/`integration_id` próprios se/quando existir abertura/fechamento de caixa como feature independente (fora de escopo) |
| `agendamentos` | Estado mutável | **ALTERAR** | Adicionar `created_by`, `updated_by`, `cancelled_by` (todos `uuid null references app_users(id)`) |
| `clientes` | Estado mutável | **ALTERAR** | Adicionar `created_by`, `updated_by` |
| `produtos` | Estado mutável | **ALTERAR** | Adicionar `created_by`, `updated_by` |
| `servicos` | Estado mutável | **ALTERAR** | Adicionar `created_by`, `updated_by` |
| `profissionais` | Estado mutável | **ALTERAR** | Adicionar `created_by`, `updated_by` |
| `formas_pagamento` | Estado mutável | **ALTERAR** | Adicionar `created_by`, `updated_by` (nota: PK é `(empresa_id, code)`, sem `id` próprio — colunas de autoria não mudam isso) |
| `profissional_servicos` | Não coberta pela ADR-005 | **DESCONHECIDA** | Tabela de vínculo N:N pura (sem `id`, sem `created_at`); ADR-005 não decidiu se merece autoria própria. Não alterar sem decisão explícita do Platform Owner |
| `lista_espera` | Não coberta pela ADR-005 | **DESCONHECIDA** | Tem `created_at` mas ADR-005 não a lista explicitamente entre as tabelas de estado mutável. Recomendo tratá-la como estado mutável (mesmo padrão de `clientes`) numa decisão futura, não presumir aqui |
| `agendamento_eventos` | Não coberta pela ADR-005 | **DESCONHECIDA** | É literalmente uma tabela de eventos (`tipo`/`payload`) — candidata natural a `actor_id`/`integration_id` como `comandos`, mas a ADR-005 não a menciona. Acho isto uma lacuna da ADR que deveria ser fechada antes da execução real, não decidida silenciosamente aqui |
| `empresas` | Raiz do tenant | **BLOQUEADA** | Não recebe autoria — é a própria unidade de tenant; autoria de "quem criou a empresa" é uma preocupação de onboarding/provisionamento, fora do escopo de identidade de usuário desta ADR |
| `profissional_servicos` (overrides) | — | já coberta acima | — |

**Regra fail-closed (herdada da ADR-005, não redecidida aqui)**: nenhuma coluna de autoria nova é `not null` nesta migration — todas nascem `nullable` (ver Backfill). A obrigatoriedade (fail-closed na escrita) é imposta pela **aplicação**, não pelo banco, na fase de implementação do backend — decisão já tomada na ADR-005 e reafirmada aqui, não uma constraint SQL nesta migration.

## Integrações S2S
Ver "Tabelas" acima para `integrations`/`integration_credentials`/`integration_scopes`/`integration_audit_events`. Resumo das garantias já decididas na ADR-005 e como o schema as sustenta:
- Segredo exibido uma única vez: não é uma constraint de banco — é uma garantia de **fluxo de API** (o backend só retorna o texto plano na resposta do `INSERT` inicial; a coluna `secret_hash` nunca guarda nem permite recuperar o valor original). O schema torna isso **fisicamente impossível de violar por acidente**: não existe coluna de texto plano para vazar.
- Comparação timing-safe: não é uma constraint de banco — é responsabilidade do código do backend (`crypto.timingSafeEqual`, mesmo padrão de `safeEquals`). O schema não pode impor isso; só o código de validação pode.
- Scopes controlados pelo servidor: já garantido pelo desenho — não existe nenhum caminho no schema para uma integração "escrever" em `integration_scopes`; só o backend (via ação administrativa de um `user` com role `admin`) insere/remove linhas.
- Auditoria append-only: **é** uma constraint de banco (corrigido nesta revisão) — trigger `before update or delete` em `integration_audit_events`, ver "Tabelas" e "Constraints".
- Limite de credenciais ativas sob concorrência: **é** uma constraint de banco (corrigido nesta revisão) — trigger com lock de linha-pai em `integration_credentials`, ver "Tabelas" e "Constraints".

## Compatibilidade legada
- `API_ACCESS_TOKEN` continua funcionando sem qualquer alteração de schema — nenhuma tabela existente muda de forma que quebre o middleware atual (`backend/src/middleware/auth.js`).
- Flag `LEGACY_TOKEN_AUTH_ENABLED` (implementação de backend, não desta migration) controla se o Bearer legado ainda é aceito; a migration não precisa de nenhuma tabela para isso (é uma env var).
- Ambientes permitidos para o legado: dev, staging, CI, scripts internos (decisão já tomada na ADR-005).
- Tenant fixo do legado: continua vindo de `DEFAULT_EMPRESA_ID` — nenhuma tabela nova precisa ser consultada para esse caminho.
- Ausência de ator humano no legado: ao gravar autoria com o Bearer legado ainda ativo, `actor_id`/`created_by`/etc. ficam `null` (o mesmo tratamento de "histórico pré-migração" — ver Backfill) até o legado ser desligado.
- Condição de desligamento e rollback: já definidas na ADR-005 (seção Compatibilidade temporária) — não redecidida aqui.
- Gate de coexistência: já especificado na ADR-005 ("Coexistência dos três mecanismos") — a migration não adiciona nada novo aqui, só garante que o schema não impede esse teste.

## Backfill
Fases obrigatoriamente separadas (nenhuma pode ser pulada ou combinada):

1. **Fase nullable** — todas as tabelas e colunas novas nascem sem `NOT NULL` (exceto onde já indicado como `not null` por não depender de dado pré-existente, como `status`/`created_at`). Nenhuma escrita existente quebra.
2. **Backfill**:
   - Criar `app_users` para o Platform Owner (e qualquer usuário inicial conhecido) a partir de `auth.users`, se já existirem contas no Supabase Auth; caso contrário, a primeira conta é criada manualmente como parte do rollout (fora desta migration).
   - Criar a **membership inicial do Platform Owner** com `role = 'admin'` na empresa atual (`empresas` já tem exatamente uma linha relevante hoje, dado o estado single-tenant confirmado na auditoria 13).
   - **Dados históricos**: nenhuma linha existente em `comandos`, `agendamentos`, `clientes`, etc. ganha autoria retroativa fabricada — todas as colunas novas ficam `null` para registros pré-migration. Isso é uma decisão explícita, não um efeito colateral: **proibido fabricar ator retroativo**, mesmo que isso deixe "buracos" no histórico de autoria.
3. **Validação**: antes de considerar qualquer coluna de autoria candidata a `NOT NULL` no futuro, rodar uma consulta de auditoria confirmando que **toda escrita nova** (pós-implementação do backend) já está gravando autoria corretamente — isto é, que a aplicação está honrando a regra fail-closed da ADR-005 na prática, não só na documentação.
4. **Constraint final**: só depois da fase de validação — e só para dados **novos** dali em diante — é que se poderia considerar tornar `actor_id`/`created_by` `NOT NULL` **com um `CHECK` que exclui explicitamente a janela histórica** (ex.: `check (created_by is not null or created_at < '<data do corte>')`), nunca uma constraint cega que quebraria o histórico. Esta fase 4 **não está autorizada nem desenhada em detalhe aqui** — é um possível ciclo futuro, citado só para não deixar a trilha incompleta.

## Ordem de execução
```text
1.  Pré-checks: confirmar migrations 001–006 aplicadas; confirmar backup/snapshot do banco disponível.
2.  Criação de tabelas: app_users, empresa_memberships, unidades, membership_units,
    integrations, integration_credentials, integration_scopes, integration_audit_events
    (nesta ordem — cada uma depende só das anteriores).
3.  Constraints básicas: unique(empresa_id, user_id), unique(id, empresa_id) auxiliares,
    checks de status/role.
4.  Constraints de tenant boundary: FKs compostas em membership_units; trigger de
    imutabilidade de integrations.empresa_id; trigger de limite de credenciais ativas.
5.  Índices (lista da seção Índices).
6.  Backfill inicial: app_users + membership admin do Platform Owner (fase 2 do Backfill).
7.  Colunas de autoria nas tabelas existentes (todas nullable), incluindo as FKs
    compostas de tenant boundary da autoria (dependem de empresa_memberships e
    integrations já existirem — por isso vêm depois da etapa 2): comandos,
    produto_estoque_movimentos (actor_id + integration_id + check de exclusividade
    + FK composta contra empresa_memberships/integrations); agendamentos
    (created_by/updated_by/cancelled_by + FK composta); clientes, produtos,
    servicos, profissionais, formas_pagamento (created_by/updated_by + FK composta).
8.  Validação: consultas de conferência (contagens, órfãos, constraints violadas em
    dry-run) — sem gravar nada nesta etapa.
9.  Gates (seção Gates) — **depende de código de backend ainda inexistente**; esta
    etapa só roda depois que o middleware JWT e a resolução de req.auth estiverem
    implementados. Dependência registrada explicitamente: a migration pode ser
    aplicada sozinha (schema vazio, sem uso), mas os gates de comportamento real
    não têm como passar até o backend existir.
10. Deploy backend futuro: middleware JWT, resolução de membership/role/unit,
    modelo de integração S2S — fora desta migration, mas é o passo que finalmente
    torna as tabelas "vivas".
11. Rollout (ver ADR-005 — dev/staging → admins → demais papéis → produção
    com coexistência → desligamento do legado).
```
Nenhuma etapa 1–8 depende de código ainda inexistente — são puramente schema. As etapas 9–11 dependem de backend que ainda não existe; essa dependência está registrada aqui para não ser esquecida, não para ser resolvida por este documento.

### Estratégia de idempotência (corrigida em duas rodadas)
A primeira versão deste draft usava `if not exists` só em `CREATE TABLE`/`ADD COLUMN` — mas o Postgres **não tem** `CREATE TYPE IF NOT EXISTS`, `ADD CONSTRAINT IF NOT EXISTS` nem `CREATE TRIGGER IF NOT EXISTS`. Uma segunda execução do arquivo falharia no meio, deixando o schema num estado parcial e ambíguo. A primeira correção adotou três padrões — tipos via bloco `DO`/checagem de catálogo; constraints via `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` (mesmo padrão já usado em `005_agenda_status_reagendado.sql`/`006_produto_estoque_ajuste_rpc.sql`); triggers via `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.

**Uma segunda rodada de Red Team encontrou que essa correção estava incompleta**: o padrão `DROP CONSTRAINT IF EXISTS` + `ADD` é seguro para `CHECK` e `FOREIGN KEY` (nada mais depende deles), mas **não é seguro para as 4 constraints `UNIQUE`** que servem de alvo às FKs compostas (`empresa_memberships_empresa_id_user_id_key`, `empresa_memberships_id_empresa_id_key`, `unidades_id_empresa_id_key`, `integrations_empresa_id_id_key`) — na segunda execução do arquivo, essas FKs já existem (criadas na primeira execução) e o Postgres **recusa** `DROP CONSTRAINT` num `UNIQUE`/PK referenciado por FK de outra tabela, a menos que se use `CASCADE` (o que dropar-e-recriar em cascata, correndo o risco de deixar o schema num estado intermediário se algo falhar no meio). Corrigido tratando essas 4 constraints de forma diferente das demais: **nunca são dropadas** — um bloco `DO` consulta `pg_constraint` e só executa o `ADD CONSTRAINT` se ela ainda não existir, já que a definição delas nunca muda entre execuções (não há necessidade de recriar algo que não muda).

Padrões finais, todos em `sql/007_identity_model_DRAFT_ONLY.sql`:
- **Tipos** (`membership_role`): bloco `DO` com checagem em `pg_type`.
- **Constraints `UNIQUE` que são alvo de FK composta** (as 4 listadas acima): bloco `DO` com checagem em `pg_constraint`, **nunca `DROP`**.
- **Demais constraints** (`CHECK`, `FOREIGN KEY`): `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` — seguro porque nada mais depende delas.
- **Triggers**: `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`. As funções por trás (`CREATE OR REPLACE FUNCTION`) já são nativamente idempotentes.

**Critério de aceite desta seção**: `run_idempotency_test_DRAFT_ONLY.sh` aplica `sql/007_identity_model_DRAFT_ONLY.sql` duas vezes seguidas contra a mesma base de teste e falha se a segunda execução der erro — isto substitui o que na primeira revisão era só um procedimento manual documentado em comentário. **Este script ainda não foi executado** contra nenhum banco; escrito, não comprovado.

## Rollout
Idêntico ao já definido na ADR-005 (seção Rollout) — este draft não introduz uma sequência de rollout paralela. A única adição é que os passos 1–8 da "Ordem de execução" acima **podem** ser aplicados em produção antes do rollout de backend começar, porque criam schema vazio e inerte (nenhuma rota, nenhum código lê essas tabelas ainda) — isso reduz o risco do dia do rollout, já que o schema já estaria testado e estável antes do primeiro usuário real ser migrado.

## Rollback
Por etapa, na ordem inversa da execução:

| Etapa | Como reverter | Dados preservados | Risco de perda | Ponto sem retorno |
|---|---|---|---|---|
| 7. Colunas de autoria | `ALTER TABLE ... DROP COLUMN` (todas nullable, nenhum consumidor obrigatório) | Sim — são só metadados adicionados; dropar a coluna não afeta as linhas em si | Nenhum (coluna nunca era a única cópia de um dado) | Nenhum — reversível a qualquer momento antes de a coluna se tornar `NOT NULL` (fase 4 do Backfill, não autorizada aqui) |
| 6. Backfill inicial | `DELETE` das linhas de `app_users`/`empresa_memberships` criadas manualmente | N/A (dado sintético de bootstrap) | Nenhum, se nenhuma escrita real já tiver referenciado essas linhas via `actor_id`/`created_by` | Se o backend já estiver em produção e escrevendo autoria real apontando para essas linhas, apagá-las quebra FKs — backup obrigatório antes de reverter nesta fase |
| 4–5. Constraints/índices | `DROP TRIGGER`, `DROP CONSTRAINT`, `DROP INDEX` | Sim | Nenhum | Nenhum |
| 2–3. Tabelas + constraints básicas | `DROP TABLE` na ordem inversa (`integration_audit_events` → `integration_scopes` → `integration_credentials` → `integrations`; depois `membership_units` → `unidades` → `empresa_memberships` → `app_users`) | Dados de identidade/integração são perdidos; dados de negócio (comandos, clientes, etc.) **não são tocados** | Perda do histórico de identidade/auditoria S2S se já estiver em uso real | **Ponto sem retorno**: uma vez que o backend em produção já resolve tenant/autorização a partir destas tabelas (etapa 10+), fazer rollback do schema derruba autenticação real — backup completo e plano de comunicação são obrigatórios antes disso, não é mais "reversível de graça" |

Regra geral: enquanto o backend não consumir estas tabelas (antes da etapa 10), o rollback de qualquer etapa 1–8 é aditivo-seguro e sem perda de dado canônico de negócio. Depois que o backend depender delas, rollback deixa de ser gratuito — vira uma operação de incidente, não uma reversão de rotina.

## Gates
Idênticos aos já especificados na ADR-005 (seções Testes, por principal), reafirmados aqui como critério de aceite desta migration especificamente no nível de schema (não de comportamento de aplicação, que já está coberto na ADR):
```text
JWT → user_id válido                              (depende de backend, fora desta migration)
membership inativa → 403                          (depende de backend)
cross-tenant → bloqueado                           (SCHEMA: membership_units via FK composta; resto no backend)
cross-unit → bloqueado                             (SCHEMA: FK composta de membership_units; resto no backend)
role insuficiente → 403                            (depende de backend)
autoria humana gravada                             (schema permite via actor_id/created_by; escrita real depende de backend)
autoria de integração gravada                      (schema permite via integration_id; escrita real depende de backend)
autoria cross-tenant rejeitada                     (SCHEMA: FK composta (empresa_id, actor_id)/(empresa_id,
                                                     integration_id), TESTE 3 — ESCRITO, NÃO EXECUTADO)
payload não sobrescreve autoria                    (depende de backend — schema não pode impor isso sozinho)
credencial revogada → 401                          (schema guarda revoked_at; verificação depende de backend)
scope insuficiente → 403                           (depende de backend)
rotação limita duas credenciais no caminho serial   (SCHEMA: TESTE 2, escrito e pronto para rodar)
rotação limita duas credenciais sob concorrência real (SCHEMA: TESTE 2b, parte de 1 credencial
                                                     pré-existente, exige rejeição da 3ª por P0001 —
                                                     timeout de lock não conta como aprovação — ESCRITO,
                                                     NÃO EXECUTADO; não classificar como comprovado até rodar)
auditoria append-only (UPDATE/DELETE sempre rejeitados, mesmo por service_role) (SCHEMA: trigger before
                                                     update/delete, TESTE 1 — corrigido nesta revisão, antes
                                                     dependia só de ausência de GRANT que na verdade já existe)
arquivo de migration é seguro de reexecutar do zero (SCHEMA: run_idempotency_test_DRAFT_ONLY.sh — ESCRITO,
                                                     NÃO EXECUTADO. A correção de idempotência já passou por
                                                     duas rodadas; só a execução real do script resolve a
                                                     dúvida definitivamente)
histórico sem ator permanece histórico              (SCHEMA: nenhuma coluna de autoria é retroativamente preenchida
                                                     por este draft — verificável por query, sem backend)
rollback não perde dados canônicos                  (SCHEMA: comandos/clientes/etc. não são alterados em nenhuma
                                                     forma destrutiva por esta migration — verificável por diff de schema)
```
Os gates marcados "SCHEMA" acima são os que podem ser validados **sem** o backend existir. Os testes correspondentes estão **escritos** em `sql/007_identity_model_TESTS_DRAFT_ONLY.sql` e em `run_idempotency_test_DRAFT_ONLY.sh` (append-only, limite de credenciais no caminho serial + roteiro de concorrência de duas sessões, rejeição de autoria cross-tenant com setup determinístico, reexecução automatizada do arquivo, confirmação de grants via `has_table_privilege`) — **nenhum deles foi executado contra um banco real ainda**. "Gate de schema" descreve o que é testável sem backend, não uma alegação de que já foi comprovado; tratar como comprovado só depois da execução real. Os demais gates continuam sendo responsabilidade da implementação futura do backend, não desta migration.

## Red Team
Cenário por cenário, com mitigação registrada:

| Cenário | Mitigação |
|---|---|
| Usuário em duas empresas | Suportado por desenho — `empresa_memberships` permite N linhas por `user_id`; cada uma com seu próprio `role`. Não é um ataque, é um caso de uso legítimo já coberto |
| Mesma unidade vinculada à empresa errada | **Bloqueado pelo schema** — FK composta em `membership_units` rejeita o `INSERT`/`UPDATE` antes de qualquer lógica de aplicação |
| Membership duplicada | **Bloqueado pelo schema** — `unique(empresa_id, user_id)` rejeita a segunda linha |
| Integração usando credencial de outro tenant | Estruturalmente impossível — `integration_credentials` não tem `empresa_id` próprio, herda de `integrations.empresa_id` via FK simples; não há "outro tenant" para uma credencial escolher |
| Usuário removido com sessão ativa | Fora do escopo de schema — mitigado pela ADR-005 (resolução de membership fresca a cada requisição, sem cache de autorização); o schema só precisa garantir que `app_users.ativo = false` seja consultável a qualquer momento, o que já é o caso (coluna simples, sem cache no banco) |
| Role alterada durante sessão | Mesma mitigação acima — `empresa_memberships.role` é lido fresco a cada requisição pela ADR-005; o schema não impede a leitura fresca, só a aplicação decide fazê-la (já decidido) |
| Autoria enviada pelo cliente | Fora do escopo de schema (é validação de payload) — mitigado pela regra fail-closed da ADR-005; o schema só garante que as colunas existem para o backend preencher, não que o cliente não *tente* mandar um valor (isso o backend descarta, como já faz hoje com `empresa_id`/`unit_id`) |
| Duas rotações simultâneas | **Corrigido no desenho, em três rodadas — não validado empiricamente.** A versão original do trigger só contava linhas sem travar nada. Corrigido travando a linha-pai em `integrations` antes de contar; uma segunda rodada moveu o trigger de `AFTER` para `BEFORE`. Uma terceira rodada corrigiu o próprio roteiro de teste (TESTE 2b): a versão anterior começava de 0 credenciais (as duas sessões terminariam legitimamente em 2, sem nunca disputar uma 3ª) e aceitava timeout de lock como prova de correção (timeout só prova contenção, não que a rejeição por limite aconteceu). Reescrito para partir de 1 credencial pré-existente e exigir rejeição por `P0001` especificamente — **escrito, ainda não executado** |
| Terceira credencial ativa | Bloqueado no caminho serial (TESTE 2, que agora exige `>= 2` outras ativas antes de rejeitar, excluindo a própria linha) — a garantia sob concorrência real depende do TESTE 2b acima, ainda não executado |
| Auditoria apagada ou alterada por chamada interna usando `service_role` | **CORRIGIDO nesta revisão** — a versão anterior confiava só em "a aplicação nunca chama UPDATE/DELETE nesta tabela", mas `service_role` já tem GRANT de UPDATE/DELETE por `004_service_role_table_grants.sql`; qualquer bug ou chamada indevida no backend (que sempre usa `service_role`) poderia alterar/apagar auditoria sem que o banco reclamasse. Corrigido com trigger `before update or delete` que rejeita incondicionalmente, inclusive vindo de `service_role` |
| Reexecução parcial após falha | **Corrigido em duas rodadas** — ver "Estratégia de idempotência". A primeira correção (`DROP CONSTRAINT IF EXISTS` + `ADD` para tudo) ainda falhava na segunda execução para as 4 constraints `UNIQUE` alvo de FK composta (Postgres recusa `DROP` de `UNIQUE` referenciado por FK sem `CASCADE`); corrigido tratando essas 4 sem `DROP`, só criação condicional via `pg_constraint`. Automatizado em `run_idempotency_test_DRAFT_ONLY.sh` — escrito, ainda não executado |
| Usuário de empresa A atribuído a registro de empresa B | FK composta `(empresa_id, actor_id) → empresa_memberships(empresa_id, user_id)` (e equivalente para `integration_id`) torna o `INSERT`/`UPDATE` impossível se o autor não tiver membership nessa empresa exata. Teste em `sql/007_identity_model_TESTS_DRAFT_ONLY.sql` (TESTE 3) — corrigido na rodada 2 para não ter mais um caminho "PULADO" que passava em verde sem testar nada; o setup agora cria os dados necessários ou falha explicitamente. **Escrito, ainda não executado contra um banco real** |
| Tenant alterado por operação que não passe pelo trigger previsto | O trigger de imutabilidade cobre `UPDATE` em `integrations.empresa_id`. Não há caminho de `UPDATE` alternativo que o ignore (triggers `BEFORE UPDATE` capturam todo `UPDATE` na tabela, independente de role). A única forma de uma integração "trocar" de tenant seria excluir e recriar a linha — o que gera um `integration_id` novo, ou seja, não é a mesma integração mudando de tenant, é uma integração diferente, o que não viola a garantia |
| Backfill parcial | Mitigado pela separação explícita de fases (nullable → backfill → validação → constraint final); um backfill interrompido no meio deixa colunas `null` (estado válido), nunca um estado inconsistente, porque nenhuma constraint `NOT NULL`/`CHECK` é ativada antes da fase de validação confirmar completude |
| Migration interrompida | Ver "Estratégia de idempotência" — corrigido nesta revisão para todos os tipos de objeto (tabelas, tipos, constraints, triggers), não só tabelas/colunas como na versão anterior |
| Rollback após escrita nova | Coberto na tabela de Rollback acima — vira uma operação de incidente com backup obrigatório assim que o backend real já estiver escrevendo autoria/tenant a partir destas tabelas; não é mais uma reversão "de graça" nesse ponto, e este documento não finge o contrário |
| Criação de `app_users` sem sincronização garantida com Supabase Auth | **Resolvido nesta revisão — classificado REAL (no SQL Draft).** O mecanismo de trigger `auth.users → app_users` está desenhado e incluído no arquivo SQL (com fallback para 'Usuário sem nome'). A validação real do comportamento do GoTrue, permissões e criação duplicada continua aguardando teste empírico (classificado DESCONHECIDO no banco, REAL no rascunho). |

## Riscos
- Os gates de comportamento de aplicação (parte da lista em "Gates") **não podem ser executados** até o backend da ADR-005 ser implementado — este draft cria o schema e escreve os testes das garantias de nível de banco ("SCHEMA"), não o comportamento fim-a-fim.
- Os triggers de "no máximo duas credenciais ativas" (com lock, movido para `BEFORE` na 2ª rodada), "empresa_id imutável em integrations" e "auditoria append-only", além das FKs compostas de autoria cross-tenant, têm roteiro de teste escrito em `sql/007_identity_model_TESTS_DRAFT_ONLY.sql` e `run_idempotency_test_DRAFT_ONLY.sh` — **nenhum foi executado** contra um banco real. Duas rodadas de revisão já encontraram problemas reais nesses testes/triggers antes mesmo de rodarem uma vez; não presumir que uma terceira rodada de leitura não encontraria mais nada — a única forma de encerrar essa dúvida é executar de fato.
- A lacuna de autoria em `agendamento_eventos` e `lista_espera` (classificadas `DESCONHECIDA`) fica em aberto — não é resolvida por este documento, precisa de decisão explícita antes da execução real.
- A sincronização `auth.users → app_users` (trigger, origem do campo `nome`) **está escrita** no SQL DRAFT — classificado `REAL` no documento, mas `DESCONHECIDO` em comportamento empírico no banco até validação.
- O default privilege de `004_service_role_table_grants.sql` para as tabelas novas foi confirmado **por leitura do arquivo**, não por consulta ao catálogo (`pg_default_acl`) de um banco real — classificado `DESCONHECIDO` até essa consulta (TESTE 5 do arquivo de testes) ser rodada contra o banco alvo.
- RLS com policies reais continua adiada (ver seção RLS) — o controle de tenant continua sendo, na prática, feito pela aplicação (`service_role` + filtros), não pelo banco, para as tabelas de negócio existentes e para as novas. RLS mínima **não é** isolamento multi-tenant nem proteção contra uso indevido de `service_role`.
- `xlsx` (débito pré-existente) e ausência de CI remoto (débito P1 separado) permanecem sem relação com esta migration.

## RLS
Comparação das três opções pedidas:

| Opção | Impacto | Risco | Compatibilidade com `service_role` |
|---|---|---|---|
| Sem RLS nesta migration (manter o padrão já vigente: RLS habilitada, zero policies, só `service_role` acessa) | Nenhum esforço adicional; consistente com as 16 tabelas existentes | Nenhum controle adicional além do que já existe (que já é "deny all para anon/authenticated por ausência de policy") | Total — é exatamente o padrão já em produção desde `001_init.sql` |
| RLS mínima na 007 (habilitar RLS nas 8 tabelas novas, sem policies, igual ao padrão existente) | Esforço mínimo — só replicar o `alter table ... enable row level security` já usado | Nenhum risco novo; mantém consistência com o resto do schema | Total |
| RLS com policies reais (ex.: policy por `empresa_id` para um futuro acesso direto de `anon`/`authenticated`) | Esforço alto — exige desenhar policies para cada tabela, testar contra `service_role`, e só faz sentido se o frontend algum dia acessar o Supabase diretamente (não é o caso hoje: tudo passa pelo backend) | Alto — uma policy mal escrita pode both vazar dados entre tenants OU bloquear o próprio `service_role` acidentalmente se a policy não prever a exceção correta | Depende inteiramente de a policy ser escrita corretamente — `service_role` só ignora RLS se a configuração do Supabase mantiver esse comportamento padrão; misturar policies mal pensadas com esse pressuposto é o tipo de erro que a auditoria 13 já viu acontecer neste projeto (grants ad-hoc feitos fora de migration, corrigidos depois pela 004) |

**Recomendação**: **RLS mínima na 007** — habilitar RLS (sem policies) nas 8 tabelas novas, replicando exatamente o padrão já usado nas 16 tabelas existentes desde `001_init.sql`. Justificativa: custo quase zero, consistência total com o schema existente, e não introduz o risco de uma policy real mal desenhada. **Não declarar isso como "segurança real" contra acesso indevido** — hoje, e depois desta migration, o controle de tenant continua sendo feito pelo backend (`req.auth.empresa_id` filtrando cada query), com o `service_role` usado sem policy adicional. RLS aqui é só "não pior que o resto do schema", não uma camada de defesa nova.

## Critérios de aceite
Esta migration (quando autorizada e executada) só é considerada tecnicamente completa quando:
- As 8 tabelas novas existem com exatamente as constraints e índices desta seção, incluindo as FKs compostas de autoria.
- Todos os gates "SCHEMA" da seção Gates passam por teste direto **executado de fato** contra um banco de teste real (`sql/007_identity_model_TESTS_DRAFT_ONLY.sql` + `run_idempotency_test_DRAFT_ONLY.sh`) — não só escrito ou lido — incluindo o roteiro de concorrência de duas sessões (TESTE 2b, que deve rejeitar por `P0001`, não por `lock_timeout`).
- Cada teste falha especificamente pelo `SQLSTATE`/nome de constraint esperado do mecanismo sob teste (`P0001` dos triggers customizados; `23503` + nome da FK composta para autoria cross-tenant) — não por qualquer erro capturado via `WHEN OTHERS` sem verificação adicional.
- O arquivo `sql/007_identity_model_DRAFT_ONLY.sql` foi executado duas vezes seguidas contra a mesma base de teste sem erro na segunda execução.
- Nenhuma tabela de negócio existente (`comandos`, `clientes`, etc.) perde dado ou constraint pré-existente.
- Toda coluna de autoria nova está `nullable`, sem exceção, até a fase de validação do Backfill ser explicitamente concluída e aprovada.
- `agendamento_eventos` e `lista_espera` têm uma decisão explícita registrada (mesmo que a decisão seja "não alterar por ora") antes da execução real — não podem ficar `DESCONHECIDA` no momento de aplicar em produção.
- O mecanismo de sincronização `auth.users → app_users` está desenhado e extraído para a Fase 1 (aguardando validação empírica).
- O default privilege de `service_role` para as tabelas novas foi confirmado por consulta real ao catálogo (`pg_default_acl`), não só por leitura do arquivo de migration 004.
- RLS mínima aplicada nas 8 tabelas novas, replicando o padrão existente — sem declará-la como isolamento multi-tenant.
- Nenhum SQL deste draft foi executado sem passar antes pela revisão de segurança e autorização explícita do Platform Owner.

## Bloqueadores
- Autorização explícita do Platform Owner para executar qualquer DDL — **não concedida ainda**.
- Decisão sobre `agendamento_eventos` e `lista_espera` (autoria) — pendente, não coberta pela ADR-005.
- Validação do mecanismo de sincronização `auth.users → app_users` (comportamento do GoTrue, permissões efetivas) — precisa ser testada empiricamente antes da execução real em produção.
- Execução real do roteiro de testes de schema (`sql/007_identity_model_TESTS_DRAFT_ONLY.sql`) contra um banco de teste descartável — escrito, não executado.
- Implementação do backend (middleware JWT, resolução de `req.auth`, RPCs de integração) — inexistente; a maioria dos gates de comportamento depende dela.
- V1.5 e escala global seguem bloqueadas até este ciclo completo (migration + backend + gates) ser concluído e evidenciado.

## Decisão requerida do Platform Owner
1. Autorizar (ou não) a execução da migration 007 conforme este desenho, incluindo os três triggers propostos (limite de credenciais ativas com lock de concorrência; imutabilidade de `integrations.empresa_id`; append-only de `integration_audit_events`) e as FKs compostas de tenant boundary da autoria.
2. Decidir explicitamente sobre `agendamento_eventos` e `lista_espera` (autoria) antes da execução real — este draft as deixa `DESCONHECIDA` de propósito, para não presumir uma decisão que a ADR-005 não tomou.
3. Confirmar a recomendação de RLS mínima (sem policies reais) para as tabelas novas, ou pedir o desenho de policies reais como um ciclo à parte.
4. Autorizar (ou não) que os passos 1–8 da "Ordem de execução" sejam aplicados em produção **antes** do backend existir (schema vazio e inerte) — reduz risco do dia do rollout, mas é uma escolha de sequenciamento que cabe ao Platform Owner, não a este draft.
5. Autorizar a execução isolada da Fase 1 (mecanismo `auth.users → app_users`) em base descartável, desenhado em `fase1_identidade_minima_DRAFT_ONLY.sql`.
6. Autorizar a execução do roteiro de testes de schema (`sql/007_identity_model_TESTS_DRAFT_ONLY.sql`) contra um banco de teste descartável, para produzir evidência real (não só leitura de código) antes de qualquer aplicação em ambiente compartilhado.
7. Só depois dos itens 1–6 resolvidos: autorizar o início da implementação de backend (fora deste branch, conforme já registrado em `docs/PROJECT_STATE.md`).
