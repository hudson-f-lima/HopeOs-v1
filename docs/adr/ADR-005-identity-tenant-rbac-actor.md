# ADR-005 — Identity, Tenant, RBAC and Actor Model

## Status
PROPOSTA CONCLUÍDA — aguardando nova revisão e aprovação do Platform Owner. Revisão anterior (Red Team) bloqueou a aprovação por ausência de separação formal entre principal humano e principal de integração; esta revisão endereça esse bloqueador. Nenhum código, migration ou dado foi alterado por esta ADR. V1.5 permanece bloqueada até implementação completa e gates verdes.

## Contexto
- V1.4.2 parcial (commit `c5a2914`, merged em `main`) introduziu `req.auth` estrutural e fechou 4 riscos cross-tenant nas rotas e no `SupabaseRepository`, mas `empresa_id` ainda deriva exclusivamente de `DEFAULT_EMPRESA_ID` (env), não de identidade real.
- Hoje existe um único mecanismo de perímetro: Bearer `API_ACCESS_TOKEN` compartilhado, fail-closed, sem noção de usuário individual.
- Não existe tabela de usuários, papéis, unidades ou autoria em `supabase/migrations/001` a `006`.
- `req.auth.user_id`, `.actor_id`, `.role` e `.unit_ids` existem como campos estruturais (`null`/`[]`) e não são lidos em nenhuma rota — não simulam identidade que não existe (`docs/DECISIONS.md` D-004, `docs/audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md`).
- Débito à parte, não coberto por esta ADR: o repositório não possui CI remoto (`.github/workflows` inexistente) — registrado como P1 separado em `docs/PROJECT_STATE.md`, não deve ser resolvido no mesmo branch desta ADR.

## Problema
Definir a arquitetura canônica única para autenticar usuários individuais, resolver `empresa_id` a partir de identidade real (não de configuração), conceder acesso a unidades, aplicar papéis (RBAC) e registrar autoria (`actor_id`/`created_by`/`updated_by`) em operações críticas — sem quebrar o perímetro atual (`API_ACCESS_TOKEN`) durante a transição e sem migrar para V1.5 ou escala global. Isso inclui, obrigatoriamente, distinguir com que tipo de *principal* o backend está lidando a cada requisição: um usuário humano (com membership, role e autoria pessoal) ou uma integração servidor-a-servidor (com escopo técnico fixo, sem role humana nem autoria de pessoa) — misturar os dois num único modelo de `req.auth` é a causa raiz do bloqueio identificado na revisão anterior.

## Restrições
- Não implementar código, migration ou alteração de schema nesta ADR.
- Não criar migrations 007+ sem autorização explícita do Platform Owner; não tocar 001–006.
- Não declarar qualquer estado como REAL sem evidência.
- Não introduzir RBAC granular por permissão (abstração prematura) sem justificar necessidade concreta.
- Manter compatibilidade operacional com `API_ACCESS_TOKEN` durante toda a transição.
- V1.5 e escala global continuam bloqueadas até esta ADR ser implementada e seus gates passarem.

## Opções consideradas

### Identidade
| Opção | Prós | Contras | Decisão |
|---|---|---|---|
| Supabase Auth + JWT | Já é a stack (Postgres/Supabase); gerencia hashing, refresh, recuperação de senha, MFA futuro; JWT verificável sem round-trip adicional (JWKS/secret); integra com RLS futuro | Acopla identidade ao Supabase (aceitável — já é o backend de dados) | **Adotada** |
| Token próprio emitido pelo backend (sessão custom) | Controle total do formato | Reimplementa hashing de senha, expiração, revogação, recuperação — superfície de ataque própria sem necessidade, dado que Supabase Auth já resolve isso | Rejeitada |
| Manter apenas `API_ACCESS_TOKEN` | Zero esforço | Não distingue usuários, não suporta RBAC/autoria por natureza — é exatamente o que a auditoria 13 já classificou como insuficiente | Rejeitada (mantida só como compatibilidade temporária, ver seção própria) |

### Membership (vínculo usuário × empresa)
| Opção | Prós | Contras | Decisão |
|---|---|---|---|
| `app_users` → `empresa_memberships` → `membership_units`, role como enum na membership | Suporta usuário em múltiplas empresas; unidades como tabela própria N:N; sem tabela de permissões genérica (evita abstração prematura) | Mais tabelas que o mínimo absoluto | **Adotada** |
| `empresa_id` direto em `auth.users`/`app_users` (1 usuário = 1 empresa) | Mais simples | Não suporta usuário com acesso a múltiplas empresas (caso real do negócio: profissional freelancer, gestor multi-unidade); exigiria retrabalho no primeiro caso de uso multi-empresa | Rejeitada |
| `roles`/`permissions` como tabelas genéricas de permissão por ação | Flexível a longo prazo | Abstração prematura para 4 papéis fixos conhecidos hoje; sem caso de uso concreto que a justifique agora | Rejeitada (revisitar somente se surgir necessidade real de permissão granular por cliente) |

### RBAC
| Opção | Prós | Contras | Decisão |
|---|---|---|---|
| Role fixa (enum) por membership | Simples, direto, cobre os 4 papéis conhecidos (Admin, Gestor, Recepção, Profissional) | Menos flexível a customização por cliente | **Adotada** |
| Tabela de permissões por ação | Máxima flexibilidade | Nenhum requisito atual demanda isso; custo de implementação e teste não se paga hoje | Rejeitada |
| Permissões por ação (matriz dinâmica configurável) | Customizável por empresa | Mesma objeção acima, ainda mais custosa | Rejeitada |
| Híbrido (role fixa + override pontual) | Meio-termo | Nenhum caso de uso concreto hoje justifica o override; pode ser adicionado depois sem quebrar o modelo de role fixa | Rejeitada por ora, caminho de evolução registrado em Consequências |

### Credencial de integração servidor-a-servidor (S2S)
| Opção | Prós | Contras | Decisão |
|---|---|---|---|
| Continuar usando o mesmo `API_ACCESS_TOKEN` global também como credencial "final" de integração | Zero esforço adicional | Sem tenant fixo por integração, sem escopo, sem revogação individual, sem auditoria por origem — é exatamente o modelo que a auditoria 13 e o Red Team já classificaram como insuficiente; revogar uma integração comprometida exige rotacionar o token de todas | Rejeitada como destino final (permanece só como transição documentada em Compatibilidade temporária) |
| Emitir um JWT de "usuário de sistema" para cada integração (reaproveitar o mesmo mecanismo de usuário humano) | Reaproveita a mesma validação de identidade | Cria um usuário humano fictício no banco (`app_users`/`empresa_memberships`) para representar uma máquina — mistura autoria de pessoa com autoria de processo, exatamente o risco apontado pelo Red Team | Rejeitada |
| Credencial dedicada por integração (`integrations` + `integration_credentials` + `integration_scopes`), com `principal_type: 'integration'` próprio, nunca passando pelo modelo de `app_users`/`empresa_memberships` | Tenant fixo no servidor, escopo mínimo explícito, revogação e rotação individuais, auditoria própria, impossível de confundir com um usuário humano | Mais uma entidade de dados para manter | **Adotada** |

## Decisão
Adotar **Supabase Auth com JWT** como provedor de identidade para o principal `user`, com um modelo de membership mínimo (`app_users` → `empresa_memberships` → `membership_units`) e **RBAC por role fixa** (enum) na membership — sem tabela de permissões genérica. `empresa_id`, `role` e `unit_ids` são sempre resolvidos no backend a partir do banco, nunca aceitos como claim do JWT nem do cliente. `actor_id` referencia `app_users.id` (não `auth.users.id` diretamente), preservando um FK estável para autoria mesmo se o usuário for removido do provedor de auth. Autoria é modelada por tipo de tabela (evento vs. estado vs. derivada), não com uma coluna `actor_id` genérica em todas as tabelas.

Adicionalmente — e esta é a correção desta revisão — o backend reconhece **dois tipos de principal, formalmente distintos e nunca intercambiáveis**: `user` (pessoa humana, com membership/role/actor_id) e `integration` (processo servidor-a-servidor, com credencial própria e escopo técnico, sem role humana, sem membership, sem `actor_id` de pessoa). Nenhuma rota, middleware ou tabela pode tratar um principal de integração como se fosse um usuário, nem vice-versa. Ver seções "Fluxo de autenticação", "Compatibilidade temporária" e "Autoria" para o detalhamento de cada principal.

## Modelo de dados
```text
auth.users (Supabase Auth)
  ↓ (1:1, trigger de sincronização em INSERT)
app_users
  id            uuid PK  = auth.users.id
  nome          text
  ativo         boolean
  ↓ (1:N)
empresa_memberships
  id            uuid PK
  empresa_id    uuid FK → empresas(id)
  user_id       uuid FK → app_users(id)
  role          membership_role enum ('admin','gestor','recepcao','profissional')
  status        text ('ativo'|'inativo')
  unique (empresa_id, user_id)
  ↓ (1:N, opcional)
membership_units
  membership_id uuid FK → empresa_memberships(id)
  unit_id       uuid FK → unidades(id)
  primary key (membership_id, unit_id)

unidades (nova tabela)
  id            uuid PK
  empresa_id    uuid FK → empresas(id)
  nome          text
  ativo         boolean
```

Justificativa das exclusões:
- Nenhuma tabela `roles`/`permissions` genérica — `role` é um enum fechado de 4 valores conhecidos.
- `app_users` é obrigatório (não usar `auth.users.id` direto em FKs de negócio) para que autoria em eventos/ledger sobreviva à remoção do usuário do provedor de auth (`app_users.ativo = false` preserva o FK; `auth.users` pode ser removido pelo Supabase Auth sem quebrar histórico).
- `membership_units` vazio para uma membership `admin`/`gestor` significa acesso a todas as unidades da empresa (resolvido dinamicamente); para `recepcao`/`profissional`, vazio significa **nenhum** acesso a recurso com escopo de unidade (fail closed — via de regra, times operacionais devem ter ao menos 1 unidade vinculada). Se uma unidade for desativada (`unidades.ativo = false`) enquanto uma membership ainda a referencia em `membership_units`, o acesso a essa unidade passa a ser negado (403) — desativar a unidade revoga o acesso, não o contrário.

### Modelo de dados — principal `integration` (separado do modelo de usuário)
```text
integrations
  id             uuid PK
  empresa_id     uuid FK → empresas(id)   -- tenant fixado na criação, nunca escolhido em runtime
  nome           text                     -- identificação humana da integração (ex.: "job de export noturno")
  status         text ('ativo'|'inativo')
  created_at     timestamptz

integration_credentials
  id             uuid PK
  integration_id uuid FK → integrations(id)
  secret_hash    text not null            -- nunca texto plano; hash (ex.: argon2/bcrypt) do segredo
  expires_at     timestamptz null         -- expiração opcional
  revoked_at     timestamptz null         -- revogação individual, sem afetar outras credenciais/integrações
  created_at     timestamptz

integration_scopes
  integration_id uuid FK → integrations(id)
  scope          text                     -- ex.: 'checkout:read', 'estoque:write' — mínimo necessário, nunca "*"
  primary key (integration_id, scope)

integration_audit_events
  id             uuid PK
  integration_id uuid FK → integrations(id)
  rota           text
  status_code    int
  created_at     timestamptz
```
Nenhuma dessas tabelas referencia `app_users` nem `empresa_memberships` — um principal de integração nunca é, nem se torna, um usuário. Detalhamento da decisão em "Compatibilidade temporária".

## Fluxo de autenticação
O backend reconhece dois fluxos de autenticação distintos, que produzem dois formatos diferentes de `req.auth`. Nenhuma rota decide sozinha qual fluxo se aplica — o middleware de autenticação identifica o tipo de credencial recebida (JWT Supabase vs. credencial de integração) antes de popular `req.auth`, e o restante do backend consome `req.auth.principal_type` para decidir o que uma requisição pode fazer.

### Fluxo — principal `user`
1. Cliente autentica via Supabase Auth (client-side ou endpoint de login que repassa ao Supabase Auth) e recebe um JWT.
2. Cliente envia `Authorization: Bearer <jwt>` em toda requisição `/api/*`.
3. Backend valida o JWT via Supabase Auth (`supabase.auth.getUser(jwt)`), obtendo `user_id` (= `auth.users.id`) com garantia de assinatura e expiração válidas.
   - JWT ausente → 401.
   - JWT inválido (assinatura/formato) → 401.
   - JWT expirado → 401 (mesmo código; o cliente deve re-autenticar/refresh, não é um caso especial de negócio).
4. Backend busca `app_users` pelo `user_id`. Se não existir ou `ativo = false` → 403 (identidade é válida, autorização é negada — usuário removido da aplicação, não da autenticação).
5. Backend resolve a(s) `empresa_memberships` ativa(s) do usuário. Se nenhuma existir ou nenhuma estiver `ativo` → 403.
6. Se o usuário tiver mais de uma membership ativa (múltiplas empresas), a empresa ativa é selecionada explicitamente pelo cliente (ex.: header `X-Empresa-Id` ou parâmetro de sessão) — o valor enviado é usado **apenas como chave de busca** dentro do conjunto de memberships já validado do usuário, nunca como autoridade direta. Se o valor não corresponder a uma membership ativa do usuário, 403 (nunca fallback silencioso para `DEFAULT_EMPRESA_ID`).
7. Backend monta `req.auth` inteiramente no servidor:
   ```js
   req.auth = {
     principal_type: 'user',
     user_id,     // app_users.id
     actor_id,    // = user_id (mesmo id estável, ver Autoria)
     empresa_id,  // da membership resolvida, nunca do cliente
     role,        // da membership resolvida
     unit_ids     // de membership_units, ou "todas" se admin/gestor
   };
   ```
8. Rotas continuam consumindo `req.auth.empresa_id` exatamente como hoje (V1.4.2 já centralizou esse ponto de leitura) — a mudança fica isolada no middleware/serviço de resolução de identidade, sem exigir reescrita de rotas.

### Fluxo — principal `integration`
1. Integração autentica com uma credencial própria (ver "Compatibilidade temporária" para o modelo `integrations`/`integration_credentials`/`integration_scopes`), nunca com um JWT de usuário nem com o `API_ACCESS_TOKEN` global legado.
2. Backend identifica a credencial (ex.: prefixo/formato distinto do JWT), busca a `integration_credentials` correspondente pelo hash do segredo.
   - Credencial inexistente/não reconhecida → 401.
   - Credencial revogada (`revoked_at` preenchido) → 401.
   - Credencial expirada (`expires_at` no passado) → 401.
3. Backend verifica `integrations.status = 'ativo'`. Se `inativo` → 403.
4. Backend monta `req.auth` inteiramente no servidor, em um formato **estruturalmente diferente** do principal `user` — nunca populando `user_id`, `actor_id` de pessoa ou `role` humana:
   ```js
   req.auth = {
     principal_type: 'integration',
     integration_id,  // integrations.id, estável
     empresa_id,      // fixado em integrations.empresa_id no momento da criação, nunca escolhido pela integração
     scopes           // de integration_scopes — lista explícita e mínima
   };
   ```
5. Toda rota que aceitar tráfego de integração deve verificar `req.auth.principal_type === 'integration'` e o(s) `scope(s)` necessário(s) para aquela ação — escopo insuficiente → 403. Uma integração nunca herda a matriz de autorização por role da seção "Autorização" (essa matriz é exclusiva do principal `user`).
6. Toda chamada é registrada em `integration_audit_events` (rota, status, timestamp) — auditoria própria, independente dos logs de usuário.

### Regra de não intercâmbio
Nenhum código pode: (a) tratar um `principal_type: 'integration'` como se tivesse `role`/`unit_ids`/`actor_id` humanos; (b) emitir uma credencial de integração a partir do fluxo de login de usuário; (c) permitir que uma integração influencie qual `empresa_id` lhe é atribuído (o valor é fixado no servidor na criação da integração, nunca por header/body/query da requisição).

## Tenant resolution
Regra única, sem exceção em produção:
```text
token (JWT) → user_id
user_id → membership ativa (empresa selecionada, validada contra as memberships do usuário)
membership → empresa_id
```
- Nenhum fallback silencioso para `DEFAULT_EMPRESA_ID` em produção. `DEFAULT_EMPRESA_ID` só pode ser usado como `empresa_id` quando `NODE_ENV !== 'production'` (dev/test/scripts locais) — guardado por checagem explícita no bootstrap do backend, não por convenção.
- `empresa_id` enviado por body/query/header pelo cliente nunca é autoridade — no máximo é usado como *seletor* dentro do conjunto já autorizado (passo 6 do fluxo acima), e rejeitado com 403 se fora desse conjunto.

## Autorização
Matriz mínima por papel (Full = todas as operações da ação; Próprio = restrito ao recurso do próprio profissional; Leitura = somente leitura; Negado = sem acesso):

| Ação | Admin | Gestor | Recepção | Profissional |
| --- | ---: | ---: | ---: | ---: |
| Checkout | Full | Full | Full | Próprio (só comandas dos seus próprios atendimentos) |
| Ajuste de estoque | Full | Full | Negado | Negado |
| Agenda | Full | Full | Full | Próprio (só sua própria agenda) |
| Clientes | Full | Full | Full | Leitura |
| Caixa | Full | Full | Full (operação) | Negado |
| Relatórios | Full | Full | Leitura limitada (operacional) | Leitura própria (seu desempenho) |

Justificativa:
- **Admin**: além do exposto acima, é o único papel que gerencia memberships/roles/unidades (fora desta matriz operacional, é escopo de administração de conta).
- **Gestor**: opera o negócio no dia a dia com o mesmo alcance operacional do Admin, exceto gestão de usuários/papéis.
- **Recepção**: atende clientes, opera agenda/checkout/caixa, mas não decide sobre inventário (ajuste de estoque é decisão de controle, não de atendimento) nem vê relatórios financeiros completos.
- **Profissional**: escopo restrito ao próprio trabalho — não deve ver nem alterar dados de outros profissionais, nem estoque/caixa da empresa.
- Toda ação com escopo "Próprio" exige comparar `req.auth.user_id`/`actor_id` contra o dono do recurso (ex.: `profissional_id` do agendamento/comanda), além do filtro de `empresa_id` e `unit_ids` já existente.
- Acesso a unidades (`unit_ids`) é ortogonal a esta matriz: mesmo um papel com "Full" numa ação só enxerga recursos das unidades às quais tem acesso (exceto Admin/Gestor, que têm acesso implícito a todas as unidades da empresa).
- Esta matriz e o conceito de `unit_ids` aplicam-se exclusivamente ao principal `user`. Um principal `integration` nunca é avaliado por esta matriz — sua autorização é por `scopes` (ver Fluxo de autenticação — principal `integration`).

## Autoria
Autoria não é uma coluna genérica `actor_id` em toda tabela — o tipo de tabela decide o modelo:

| Categoria | Exemplo no schema atual | Modelo de autoria |
| --- | --- | --- |
| Evento imutável (uma ação, um autor, não muda depois) | `comandos` (fechamento de checkout), `produto_estoque_movimentos` (cada ajuste) | Coluna `actor_id` própria, preenchida no momento da criação, sem UPDATE permitido depois |
| Derivada de um evento principal (criada atomicamente pela mesma RPC) | `comando_itens`, `comando_pagamentos`, `comando_gorjetas` | **Não** ganham `actor_id` próprio — herdam autoria via FK ao `comando_id`/evento pai (evita duplicação, conforme já sinalizado na auditoria 13) |
| Estado que muda ao longo do tempo, por mais de uma pessoa | `agendamentos`, `clientes`, `produtos`, `servicos`, `profissionais`, `formas_pagamento` | Colunas `created_by` e `updated_by` (não `actor_id` único) — `agendamentos` adicionalmente pode registrar `cancelled_by` quando o status for `cancelado` |
| Ledger futuro (ainda não existe como tabela dedicada; `caixa_movimentos`/`produto_estoque_movimentos` cumprem parcialmente esse papel hoje) | `caixa_movimentos` | Já referencia `comando_id`; herda autoria do comando associado. Se/quando existir abertura/fechamento de caixa como feature própria (fora de escopo atual), essa ação vira um evento com `actor_id` próprio. Nenhum evento de ledger permite alteração retroativa de autoria (sem GRANT de UPDATE nessas colunas para nenhuma role de aplicação) |

`actor_id`/`created_by`/`updated_by`/`cancelled_by` sempre referenciam `app_users.id` — nunca `auth.users.id` diretamente, e nunca um valor compartilhado/genérico.

### Regras fail-closed de autoria (aplicam-se a ambos os principals, a toda categoria de tabela, sem exceção não documentada)
- `actor_id`, `created_by`, `updated_by` e `cancelled_by` **nunca** são aceitos do payload do cliente (body/query/header), para nenhuma categoria de tabela e para nenhum principal — são sempre injetados pelo backend a partir de `req.auth` no momento da escrita, no mesmo espírito que já impede `empresa_id`/`unit_id` de virem do cliente (V1.4.2).
- O fail-closed de autoria **não se limita à categoria "evento imutável"** — aplica-se a toda escrita crítica humana, em qualquer categoria da tabela de Autoria acima:
  - **Eventos imutáveis** (`comandos`, `produto_estoque_movimentos`, futuros eventos de ledger): sem `actor_id` resolvível em `req.auth`, a criação falha fechada antes de tocar o banco.
  - **Estado mutável** (`agendamentos`, `clientes`, `produtos`, `servicos`, `profissionais`, `formas_pagamento`): sem ator resolvível em `req.auth`, a **criação** falha fechada antes de gravar `created_by`; a **atualização** falha fechada antes de gravar `updated_by`; o **cancelamento** (ex.: `agendamentos.status = 'cancelado'`) falha fechada antes de gravar `cancelled_by`. Nenhuma dessas três operações grava o campo de autoria correspondente como `null`/vazio quando deveria haver um ator — a única forma de `created_by`/`updated_by` ficarem `null` é para registros que já existiam **antes** desta ADR ser implementada (histórico pré-migração, documentado, não fabricado — ver Migration futura).
  - **Derivada de evento principal** (`comando_itens`, `comando_pagamentos`, `comando_gorjetas`): não têm autoria própria por desenho (herdam do evento pai); o fail-closed já ocorre no evento pai, então não há gravação independente a proteger aqui.
  - O padrão de implementação é o mesmo em toda categoria: análogo ao `TENANT_CONTEXT_MISSING` já usado em `SupabaseRepository.insert()` — rejeitar a operação antes de qualquer escrita, nunca prosseguir com um autor `null`/fabricado.
- Um principal `integration` **nunca** grava `actor_id`/`created_by`/`updated_by`/`cancelled_by` apontando para um `app_users.id` humano, em nenhuma categoria de tabela. Se uma integração executar uma ação que gera um evento ou altera um estado auditável, esse registro referencia `integration_id` (ou um campo de autoria próprio para eventos de máquina, fora do escopo de `app_users`) — nunca um `app_users.id`, mesmo que exista um usuário "genérico" ou "de sistema" cadastrado para esse fim (essa prática é explicitamente proibida: ver "Regra de não intercâmbio" em Fluxo de autenticação).
- Qualquer exceção técnica a estas regras (ex.: um processo de backfill administrativo que precise gravar autoria retroativamente) deve ser explícita, documentada como tal no momento em que for proposta, e **nunca** pode simular um usuário humano real para justificar a gravação — a ausência de autor é sempre preferível a um autor fabricado.

## Compatibilidade temporária
- `API_ACCESS_TOKEN` continua válido durante toda a transição — não há corte abrupto.
- Ambientes permitidos para o modo legado (`API_ACCESS_TOKEN` global): dev, staging, CI e scripts internos. **Não é o modelo final para integrações servidor-a-servidor em produção** — ver decisão abaixo.
- Em produção, tráfego de usuário final deve migrar para JWT (principal `user`); tráfego de integração servidor-a-servidor deve migrar para o modelo de credencial dedicada (principal `integration`, ver seção própria). `API_ACCESS_TOKEN` em produção, enquanto a migração não estiver completa, fica restrito a integrações legadas explicitamente registradas, nunca para telas de usuário nem como destino final.
- Impedir uso indevido em produção: flag explícita (ex.: `LEGACY_TOKEN_AUTH_ENABLED`) — quando desligada, o middleware rejeita Bearer `API_ACCESS_TOKEN` mesmo que o valor esteja correto, independente do valor da env var do token em si.
- Revogação: rotação/remoção do valor de `API_ACCESS_TOKEN` do ambiente de produção assim que o modo legado for desligado — token vazado hoje não expira sozinho, então a rotação é o mecanismo de revogação.
- Teste de coexistência (gate obrigatório): provar que os três mecanismos (Bearer legado, JWT de usuário, credencial de integração) podem estar ativos ao mesmo tempo sem contaminação — Bearer legado só popula `req.auth.empresa_id` (fixo, de env) e mantém os demais campos em `null`/`[]`/ausentes; JWT sempre popula o formato completo do principal `user`; credencial de integração sempre popula o formato completo do principal `integration`. Nenhum dos três produz o formato de outro.
- Condição de remoção definitiva do código legado: 100% do tráfego de produção medido em JWT/credencial de integração, todos os gates migrados, e autorização explícita do Platform Owner para remover o middleware Bearer.

### Modelo de integração servidor-a-servidor (decisão)
Reutilizar o `API_ACCESS_TOKEN` global como destino final para integrações **não é aceitável** — falta tenant fixo por integração, escopo, revogação individual e auditoria de origem, exatamente o que o Red Team apontou. A decisão é uma credencial dedicada por integração, com principal próprio (`principal_type: 'integration'`, ver "Fluxo de autenticação"), definida por:
- **Uma credencial por integração** — nunca compartilhada entre integrações nem reaproveitada do token legado.
- **Segredo armazenado somente como hash** (nunca texto plano em configuração ou banco) — `integration_credentials.secret_hash`.
- **Tenant fixado no servidor**, em `integrations.empresa_id`, definido na criação da integração por um Admin — nunca escolhido pela integração em runtime via body/query/header.
- **Escopos mínimos explícitos** (`integration_scopes`) — a integração só acessa as rotas/ações listadas em seu escopo, nunca um perímetro amplo por padrão.
- **Expiração opcional** (`integration_credentials.expires_at`) e **rotação** — gerar uma nova credencial para a mesma integração sem precisar recriar a integração inteira.
- **Revogação individual** (`integration_credentials.revoked_at`) — revogar uma integração comprometida nunca afeta as demais, ao contrário do token único atual.
- **Auditoria própria** (`integration_audit_events`) — toda chamada de integração é registrada separadamente do log de usuários.
- **Status ativo/inativo** em `integrations.status` — permite desativar uma integração inteira (todas as suas credenciais) sem apagar seu histórico de auditoria.
- **`integration_id` estável** — referência estável para auditoria e para o campo de autoria de eventos gerados por integração (nunca um `app_users.id`).
- **Proibição explícita**: nenhuma integração recebe `role` humana, nenhuma integração é associada a uma `empresa_memberships`, nenhuma integração grava `actor_id` apontando para um usuário, nenhuma integração escolhe livremente `empresa_id`, nenhuma integração recebe `unit_ids` "por conveniência" (se uma integração precisar de escopo por unidade, isso é um `scope` explícito, ex.: `estoque:unidade:<id>:write`, nunca o mecanismo humano de `membership_units`).

### Segredo exibido uma única vez (garantia obrigatória)
- O segredo em texto plano é gerado no momento da criação da integração ou de uma rotação de credencial — nunca antes, nunca sob demanda posterior.
- É exibido ao administrador **uma única vez**, na resposta daquela operação de criação/rotação — a interface deve deixar isso explícito (ex.: "esta é a única vez que este segredo será mostrado").
- Depois desse momento, o segredo em texto plano **não pode ser recuperado novamente** por nenhum meio — nem por consulta ao banco, nem por suporte, nem por endpoint de administração. Apenas `secret_hash` persiste.
- Perda do segredo pelo administrador exige **rotação** (gerar uma nova credencial), nunca "reenvio" do segredo original.
- Logs de aplicação, `integration_audit_events` e qualquer resposta de API **nunca armazenam nem retornam o segredo completo** — no máximo um identificador não sensível (ex.: prefixo curto ou `integration_id`) para fins de rastreamento.

### Comparação resistente a timing attack (garantia obrigatória)
- A validação da credencial de integração (comparação do segredo recebido contra o hash armazenado) deve usar comparação em tempo constante, resistente a timing attack — mesmo padrão já adotado em `safeEquals`/`crypto.timingSafeEqual` (`backend/src/middleware/auth.js`) para o `API_ACCESS_TOKEN` legado.
- **Nunca** usar comparação direta de strings sensíveis (`===`, `==` ou comparação byte-a-byte que retorna cedo na primeira diferença) para validar o segredo ou seu hash.
- Diferença de comprimento ou de formato entre o valor recebido e o esperado deve falhar fechado (401) sem vazar informação que permita a um atacante distinguir "credencial não existe" de "credencial existe mas está errada" através do tempo de resposta.

### Rotação de credenciais S2S (política mínima)
- Rotacionar uma credencial de integração **cria uma nova linha em `integration_credentials`**, separada da antiga — nunca sobrescreve o segredo/hash existente.
- A nova credencial é exibida em texto plano uma única vez, no momento da criação (mesma garantia de "Segredo exibido uma única vez"), e entra imediatamente em estado ativo.
- Após a ativação da nova, a credencial antiga **pode continuar válida por uma janela curta e configurável** (ex.: minutos a poucas horas, nunca dias por padrão) — isso permite trocar a credencial em uso por um consumidor sem downtime.
- Ao fim dessa janela, a credencial antiga é **revogada automaticamente** (`revoked_at` preenchido pelo próprio processo de rotação, sem exigir ação manual adicional).
- Durante a janela de sobreposição, uma integração tem **no máximo duas credenciais ativas simultaneamente** (a antiga, em contagem regressiva para expirar, e a nova) — nunca mais que isso; se uma terceira rotação for iniciada antes da janela anterior fechar, a mais antiga das duas é revogada imediatamente para preservar o limite de duas.
- Em caso de incidente (suspeita de comprometimento), a **revogação imediata** de qualquer credencial (antiga ou nova) é sempre possível, independente da janela de sobreposição configurada — a janela é uma conveniência operacional, nunca um obstáculo à revogação de emergência.
- Nenhuma credencial permanece ativa indefinidamente por causa de uma rotação incompleta ou abandonada — a janela tem um fim automático, não depende de um humano lembrar de revogar manualmente.
- Criação, ativação e revogação de cada credencial (automática ou manual/emergencial) são eventos auditados em `integration_audit_events`, associados ao `integration_id`.

### Scopes controlados exclusivamente pelo servidor (garantia obrigatória)
- `scopes` de uma integração são resolvidos **exclusivamente** a partir da configuração persistida em `integration_scopes` no momento da requisição — nunca de um claim, header, body, query ou qualquer campo enviado pela própria integração na chamada.
- Uma integração **não pode ampliar, substituir ou autoconceder** seus próprios scopes por nenhum meio da requisição. Qualquer tentativa nesse sentido é ignorada (o valor enviado não tem efeito algum na resolução de `req.auth.scopes`) e, se a rota exigir validação explícita de payload contra escopo declarado, rejeitada com 403.
- Alteração de `integration_scopes` só ocorre por ação administrativa autorizada (um Admin humano, autenticado como principal `user` com role `admin`, editando a integração) — nunca pela própria integração em runtime — e essa alteração é auditável (quem alterou, quando, de/para quais scopes).

Modelo de dados em "Modelo de dados — principal `integration`".

## Migration futura (Migration 007 — somente desenho, não executar)
| Item | Necessidade | Risco | Compatibilidade | Backfill | Rollback | Ordem |
| --- | --- | --- | --- | --- | --- | --- |
| `app_users` | FK estável para autoria/membership, independente do provedor de auth | Baixo (tabela nova, sem impacto em dados existentes) | Aditiva | Popular via trigger a partir de `auth.users` existentes (se houver) | `DROP TABLE` seguro enquanto nada mais referenciar | 1 |
| `empresa_memberships` | Vínculo usuário×empresa×role, base do tenant resolution real | Médio (define quem acessa o quê) | Aditiva | Requer decisão manual/curada de quem é Admin/Gestor/Recepção/Profissional de cada empresa hoje (não há dado de origem automático) | `DROP TABLE`; sistema volta a depender só de `DEFAULT_EMPRESA_ID`/`API_ACCESS_TOKEN` | 2 (depende de `app_users`) |
| `unidades` | Base para acesso por unidade | Baixo (tabela nova) | Aditiva | Uma unidade "padrão" por empresa pode ser criada automaticamente para não quebrar empresas single-unit | `DROP TABLE` | 3 |
| `membership_units` | Concede acesso granular a unidades | Baixo | Aditiva | Vazio inicialmente (admin/gestor já têm acesso implícito); recepção/profissional precisam de curadoria manual | `DROP TABLE` | 4 (depende de `empresa_memberships` e `unidades`) |
| `actor_id` em `comandos`, `produto_estoque_movimentos` | Autoria de eventos imutáveis | Baixo (coluna nullable) | Aditiva, não quebra leitura/escrita existente | Registros antigos ficam com `actor_id = null` (autoria desconhecida documentada, não fabricada) | `DROP COLUMN` seguro (nullable, sem consumidor obrigatório) | 5 |
| `created_by`/`updated_by`(/`cancelled_by`) em `agendamentos`, `clientes` | Autoria de estado mutável | Baixo (colunas nullable) | Aditiva | Idem — `null` para histórico pré-migração | `DROP COLUMN` seguro | 6 |
| Índices em `empresa_memberships(user_id)`, `empresa_memberships(empresa_id, status)`, `membership_units(unit_id)` | Performance de resolução de tenant a cada request | Baixo | Aditiva | N/A | `DROP INDEX` | 7 |
| `integrations`, `integration_credentials`, `integration_scopes`, `integration_audit_events` | Base do principal `integration` — credencial dedicada, escopo, revogação e auditoria por integração | Baixo (tabelas novas, não referenciam `app_users`/`empresa_memberships`) | Aditiva; nenhuma integração existe hoje (não há dado a migrar) | N/A — integrações são criadas manualmente pelo Platform Owner após a migration | `DROP TABLE` (em ordem inversa: `integration_audit_events` → `integration_scopes` → `integration_credentials` → `integrations`) | 8 |
| Índices em `integration_credentials(integration_id)`, `integration_audit_events(integration_id, created_at)` | Performance de validação de credencial e consulta de auditoria | Baixo | Aditiva | N/A | `DROP INDEX` | 9 |
| RLS (Row Level Security) nas tabelas de negócio | Defesa em profundidade além do filtro em aplicação | Alto (requer teste extenso; pode quebrar acesso do `service_role` se mal configurado) | Precisa de policy explícita permitindo `service_role` (o backend continua sendo o único caminho de escrita) | N/A | Desabilitar RLS na tabela (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) | 10 (último, opcional nesta fase — pode ficar para um ciclo posterior à adoção de JWT) |

Nenhum destes itens é executado por esta ADR. Requer autorização explícita do Platform Owner e SQL revisado em Markdown com `DRAFT ONLY` antes de qualquer execução, conforme `AGENTS.md`.

## Rollout
1. Implementar Supabase Auth + `app_users`/`empresa_memberships`/`membership_units` em ambiente de dev/staging, com `API_ACCESS_TOKEN` continuando ativo em paralelo.
2. Migrar clientes internos/admin primeiro (menor blast radius), validando a matriz de autorização com dados reais em staging.
3. Expandir para os demais papéis (Recepção, Profissional) somente após os gates da seção seguinte passarem em staging.
4. Habilitar JWT em produção com `LEGACY_TOKEN_AUTH_ENABLED=true` ainda ligado (coexistência).
5. Monitorar adoção real (métrica de % de requests autenticadas via JWT vs. Bearer legado) antes de considerar desligar o modo legado.
6. Só desligar `API_ACCESS_TOKEN` de produção após 100% de adoção medida e autorização explícita do Platform Owner.

## Rollback
- Feature flag (`LEGACY_TOKEN_AUTH_ENABLED`) permite reverter para "somente `API_ACCESS_TOKEN`" a qualquer momento sem depender de rollback de banco — o middleware JWT pode ser desligado independentemente das tabelas novas existirem.
- Reversão do middleware: manter o código do `requireAuth` atual (Bearer) intacto durante toda a transição; o novo caminho (JWT) é adicionado ao lado, não substitui, até a flag de corte.
- Preservação de dados de autoria: colunas novas (`actor_id`, `created_by`, `updated_by`) são sempre `nullable` — um rollback de código não exige `DROP COLUMN` nem apaga histórico já preenchido.
- Rollback de migration: cada item da tabela de Migration 007 tem uma reversão aditiva-segura (`DROP TABLE`/`DROP COLUMN`/`DROP INDEX`) documentada acima, executável na ordem inversa.
- Restauração do token temporário: `API_ACCESS_TOKEN` nunca é removido do ambiente de produção até a condição de remoção definitiva ser satisfeita — não há "restauração" propriamente dita porque ele nunca sai de operação durante o rollout.
- Condição para abortar o rollout: qualquer gate crítico falhando em produção (vazamento cross-tenant detectado, taxa anômala de 401/403, falhas de validação de JWT acima de um limiar) aciona reversão imediata via feature flag, sem esperar por correção de causa raiz antes de estabilizar o acesso.

## Segurança
- JWT prova identidade, nunca autoridade de tenant/role/unidade — esses três são sempre resolvidos por consulta ao banco, nunca por claim confiável do token ou do cliente.
- `empresa_id`/`role`/`unit_ids` do corpo, query ou header do cliente nunca são autoridade — no máximo seletor validado contra o conjunto já autorizado do usuário (mesma regra já aplicada a `empresa_id` desde V1.4.2, agora estendida a role/unidade).
- Membership inativa bloqueia acesso mesmo com JWT válido (403, não 401 — identidade provada, autorização negada).
- `service_role`/chave secreta do Supabase nunca é exposta ao frontend (regra já vigente, reafirmada aqui pois RLS futura não substitui esse cuidado).
- Nenhuma migration com RLS mal configurada deve ser aplicada sem teste de que o backend (via `service_role`) continua operando — RLS é defesa em profundidade, não o único controle.
- Principal `user` e principal `integration` nunca compartilham formato de `req.auth`, nunca compartilham tabela de credencial, e nenhum código de autorização pode aceitar um no lugar do outro (ver "Regra de não intercâmbio").

### Trade-off explícito — validação de JWT via `supabase.auth.getUser()`
- Validar o JWT chamando o serviço de Auth do Supabase (em vez de apenas decodificar/verificar a assinatura localmente) garante checagem em tempo real de revogação e expiração — um JWT de um usuário desativado no provedor deixa de validar imediatamente, sem esperar o token expirar por si só.
- Isso tem custo: cada requisição autenticada de usuário passa a depender de um round-trip adicional ao serviço de Auth, aumentando latência e criando uma dependência de disponibilidade externa que não existe hoje com o `API_ACCESS_TOKEN` local.
- A implementação (fora do escopo desta ADR) deve prever: timeout explícito nessa chamada, observabilidade (latência e taxa de erro da validação de JWT como métrica própria), e pode usar circuit breaking ou um cache seguro de curtíssima duração (segundos, não minutos) para absorver picos — nunca um cache que reintroduza a janela de revogação tardia que a chamada em tempo real deveria eliminar.
- **Falha de validação nunca vira autorização implícita.** Se o serviço de Auth estiver indisponível ou a chamada falhar por timeout/erro, o resultado é falha fechada (401/503, conforme o caso), nunca um "deixa passar" para não impactar o usuário — o mesmo princípio de fail-closed já aplicado ao `API_ACCESS_TOKEN` ausente (503) e ao tenant ausente no `SupabaseRepository.insert()` (`TENANT_CONTEXT_MISSING`).
- **Reforço (não bloqueante para aprovação, exigido na implementação):** se um cache de validação de JWT for usado, seu TTL deve ser **configurável** (não uma constante fixa enterrada no código) e o valor efetivo em uso deve ser **observável e auditável** (visível em métricas/configuração, não apenas em comentário de código). O cache deve permanecer curto por padrão. Revogação e suspensão de usuário continuam prioritárias sobre qualquer cache — o cache é uma otimização de pico, nunca uma fonte de verdade paralela. Indisponibilidade do provedor de identidade **nunca** vira fail-open, independentemente de configuração de cache.

### Cache de identidade nunca inclui autorização (garantia obrigatória)
- O cache descrito acima cobre **exclusivamente** a etapa de validação de identidade do JWT (assinatura/expiração via `supabase.auth.getUser()`) — ele **nunca** inclui `app_users.ativo`, `empresa_memberships` (role/status), `membership_units` ou qualquer outro dado de autorização.
- Membership, role, `empresa_id` e `unit_ids` são resolvidos no banco em **cada** requisição autenticada (passos 4–6 de "Fluxo — principal `user`"), nunca a partir de um valor cacheado junto com a identidade — mesmo que a identidade (JWT) esteja em cache, a autorização é sempre lida fresca.
- Consequência direta: suspender uma membership, desativar uma unidade ou alterar uma role tem efeito já na **próxima requisição** do usuário, independentemente de qualquer cache de identidade em vigor — não há janela de atraso equivalente à do cache de JWT.
- Falha ao resolver autorização (erro de consulta ao banco, timeout, etc.) falha fechada (403/500, conforme o caso) — nunca prossegue com uma autorização anterior ou presumida.

## Observabilidade
- Registrar métrica de proporção de requests autenticadas via JWT vs. `API_ACCESS_TOKEN` legado, para decidir quando desligar o modo legado com segurança.
- Registrar tentativas de seleção de `empresa_id`/`unit_id` fora do conjunto autorizado do usuário (403) como sinal de possível uso indevido ou bug de frontend.
- Este item de observabilidade não substitui nem resolve o débito P1 já registrado (ausência de CI remoto); são preocupações distintas.

## Testes
Gates obrigatórios antes de qualquer implementação ser considerada pronta:

### Principal `user`
```text
JWT ausente → 401
JWT inválido → 401
JWT expirado → 401
usuário sem membership → 403
membership inativa → 403
empresa A não acessa empresa B
unidade não autorizada → 403
membership vinculada a unidade inativa → 403 (unidade desativada revoga o acesso)
role insuficiente → 403
escrita crítica grava autoria (actor_id/created_by/updated_by/cancelled_by conforme categoria da tabela)
criação/atualização/cancelamento sem ator resolvido em req.auth falha fechado, em evento imutável e em estado mutável (nunca grava autor null/fabricado)
tenant nunca vem do frontend (body/query/header não têm efeito na resolução de empresa_id/role/unit_ids)
falha na validação do JWT (timeout/indisponibilidade do provedor) nunca vira autorização implícita — falha fechada
membership suspensa/unidade removida/role alterada surte efeito já na próxima requisição, mesmo com JWT ainda em cache
```

### Principal `integration`
```text
credencial inexistente → 401
credencial revogada → 401
credencial expirada → 401
escopo insuficiente → 403
tenant diferente do tenant fixado na integração → 403
integração não recebe role humana (estruturalmente ausente do formato de req.auth)
integração não recebe/grava actor_id humano
integração não pode escolher empresa_id (valor sempre fixado no servidor, nunca de body/query/header)
integração tenta ampliar scope via claim/header/body/query → ignorado ou 403 (scopes só vêm de integration_scopes)
comparação de credencial contra o hash é resistente a timing attack (tempo de resposta não varia entre "não existe" e "existe mas errada")
segredo em texto plano nunca é retornado por nenhum endpoint após a criação/rotação inicial
rotação mantém no máximo duas credenciais ativas por integração
credencial antiga expira/revoga automaticamente ao fim da janela de sobreposição
revogação emergencial invalida imediatamente a credencial antiga, independente da janela configurada
auditoria registra integration_id em integration_audit_events
token global (API_ACCESS_TOKEN) compartilhado não é aceito como modelo final de credencial de integração
```

### Coexistência dos três mecanismos
```text
API_ACCESS_TOKEN legado desativável (flag OFF rejeita mesmo token correto)
Bearer legado nunca popula user_id/actor_id/role/unit_ids reais nem integration_id/scopes
JWT de usuário sempre popula o formato completo do principal user, nunca o de integration
credencial de integração sempre popula o formato completo do principal integration, nunca o de user
```

Todos os testes devem exercitar comportamento real (chamadas HTTP reais ou invocação direta de função/repositório com asserts sobre valores reais), seguindo o padrão já estabelecido em `backend/tests/tenant-boundary-gate.test.js` — nenhum teste deve validar apenas por inspeção textual.

## Critérios de aceite
Esta ADR só é considerada implementada quando:
- Todos os gates da seção Testes estiverem verdes (principal `user`, principal `integration` e coexistência).
- Nenhuma rota crítica aceitar `empresa_id`, `role` ou `unit_id` do cliente como autoridade — para nenhum dos dois principals.
- Nenhum acesso cross-tenant, cross-role, cross-unit ou cross-scope for possível, comprovado por teste.
- Toda escrita crítica (categoria "evento" e "estado" da tabela de Autoria) registrar autoria real, nunca compartilhada/fabricada; nenhuma integração gravar autoria como se fosse um usuário.
- Usuário e integração permanecerem principals estruturalmente distintos em todo o código — nenhum caminho de autorização aceita um formato de `req.auth` no lugar do outro.
- `API_ACCESS_TOKEN` continuar funcional durante toda a transição, com plano de desligamento documentado e não executado prematuramente.
- Migration 007 (desenhada aqui, não executada) for aprovada explicitamente pelo Platform Owner antes de qualquer `CREATE TABLE`/`ALTER TABLE` real — incluindo as tabelas do principal `integration`.
- V1.5 e escala global continuarem bloqueadas até os itens acima serem cumpridos e evidenciados (não apenas declarados).

## Riscos residuais
- O modelo de credencial de integração (`integrations`/`integration_credentials`/`integration_scopes`/`integration_audit_events`) está decidido nesta revisão, mas não implementado — até a implementação, integrações continuam usando o `API_ACCESS_TOKEN` legado como transição, com o risco residual já conhecido desse mecanismo (token único, sem escopo, sem revogação individual).
- Enquanto esta ADR não for implementada, `empresa_id` continua vindo de `DEFAULT_EMPRESA_ID` (env) — multi-tenant seguro continua BLOQUEADO.
- RLS (item 8 da Migration 007) é opcional nesta fase e, se adiada, mantém o backend como único controle de tenant (mitigado por V1.4.2, mas sem defesa em profundidade no banco).
- Ausência de CI remoto (`.github/workflows`) permanece um débito P1 separado — não é resolvido nem agravado por esta ADR, mas amplia o risco de qualquer implementação futura desta ADR não ser validada automaticamente antes do merge.
- `xlsx` com vulnerabilidade HIGH pré-existente permanece sem relação com esta ADR.

## Consequências
- Caminho de evolução aberto (não decidido agora): se surgir necessidade real de permissão granular além dos 4 papéis fixos, um modelo híbrido (role fixa + tabela de overrides pontuais) pode ser adicionado sem quebrar `empresa_memberships` — não requer redesenho do modelo de dados aqui proposto.
- `app_users` como camada própria (em vez de `auth.users` direto) adiciona uma tabela extra de sincronização, mas paga-se pela estabilidade de FK em autoria/ledger mesmo após remoção de usuários do provedor de auth.
- A resolução de tenant por membership (em vez de claim no JWT) adiciona uma consulta ao banco por requisição — aceitável dado que o backend já consulta o banco para toda operação de negócio; pode ser otimizado com cache de curta duração se necessário, sem mudar a regra de origem canônica.
- Separar `user` e `integration` como principals estruturalmente distintos adiciona 4 tabelas (`integrations`, `integration_credentials`, `integration_scopes`, `integration_audit_events`) e um segundo caminho de validação no middleware — o custo é deliberado: evita a alternativa mais barata, porém insegura, de emitir "usuários de sistema" fictícios ou reutilizar o token global como identidade de máquina permanente.
