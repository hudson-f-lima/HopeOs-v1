# ADR-005 — Identity, Tenant, RBAC and Actor Model

## Status
PROPOSTA — decisão arquitetural registrada para autorização do Platform Owner. Nenhum código, migration ou dado foi alterado por esta ADR. V1.5 permanece bloqueada até implementação completa e gates verdes.

## Contexto
- V1.4.2 parcial (commit `c5a2914`, merged em `main`) introduziu `req.auth` estrutural e fechou 4 riscos cross-tenant nas rotas e no `SupabaseRepository`, mas `empresa_id` ainda deriva exclusivamente de `DEFAULT_EMPRESA_ID` (env), não de identidade real.
- Hoje existe um único mecanismo de perímetro: Bearer `API_ACCESS_TOKEN` compartilhado, fail-closed, sem noção de usuário individual.
- Não existe tabela de usuários, papéis, unidades ou autoria em `supabase/migrations/001` a `006`.
- `req.auth.user_id`, `.actor_id`, `.role` e `.unit_ids` existem como campos estruturais (`null`/`[]`) e não são lidos em nenhuma rota — não simulam identidade que não existe (`docs/DECISIONS.md` D-004, `docs/audit_global/13_V142_IDENTITY_TENANT_AUDIT_PLAN.md`).
- Débito à parte, não coberto por esta ADR: o repositório não possui CI remoto (`.github/workflows` inexistente) — registrado como P1 separado em `docs/PROJECT_STATE.md`, não deve ser resolvido no mesmo branch desta ADR.

## Problema
Definir a arquitetura canônica única para autenticar usuários individuais, resolver `empresa_id` a partir de identidade real (não de configuração), conceder acesso a unidades, aplicar papéis (RBAC) e registrar autoria (`actor_id`/`created_by`/`updated_by`) em operações críticas — sem quebrar o perímetro atual (`API_ACCESS_TOKEN`) durante a transição e sem migrar para V1.5 ou escala global.

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

## Decisão
Adotar **Supabase Auth com JWT** como provedor de identidade, com um modelo de membership mínimo (`app_users` → `empresa_memberships` → `membership_units`) e **RBAC por role fixa** (enum) na membership — sem tabela de permissões genérica. `empresa_id`, `role` e `unit_ids` são sempre resolvidos no backend a partir do banco, nunca aceitos como claim do JWT nem do cliente. `actor_id` referencia `app_users.id` (não `auth.users.id` diretamente), preservando um FK estável para autoria mesmo se o usuário for removido do provedor de auth. Autoria é modelada por tipo de tabela (evento vs. estado vs. derivada), não com uma coluna `actor_id` genérica em todas as tabelas.

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
- `membership_units` vazio para uma membership `admin`/`gestor` significa acesso a todas as unidades da empresa (resolvido dinamicamente); para `recepcao`/`profissional`, vazio significa **nenhum** acesso a recurso com escopo de unidade (fail closed — via de regra, times operacionais devem ter ao menos 1 unidade vinculada).

## Fluxo de autenticação
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
     user_id,     // app_users.id
     actor_id,    // = user_id (mesmo id estável, ver Autoria)
     empresa_id,  // da membership resolvida, nunca do cliente
     role,        // da membership resolvida
     unit_ids     // de membership_units, ou "todas" se admin/gestor
   };
   ```
8. Rotas continuam consumindo `req.auth.empresa_id` exatamente como hoje (V1.4.2 já centralizou esse ponto de leitura) — a mudança fica isolada no middleware/serviço de resolução de identidade, sem exigir reescrita de rotas.

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

## Autoria
Autoria não é uma coluna genérica `actor_id` em toda tabela — o tipo de tabela decide o modelo:

| Categoria | Exemplo no schema atual | Modelo de autoria |
| --- | --- | --- |
| Evento imutável (uma ação, um autor, não muda depois) | `comandos` (fechamento de checkout), `produto_estoque_movimentos` (cada ajuste) | Coluna `actor_id` própria, preenchida no momento da criação, sem UPDATE permitido depois |
| Derivada de um evento principal (criada atomicamente pela mesma RPC) | `comando_itens`, `comando_pagamentos`, `comando_gorjetas` | **Não** ganham `actor_id` próprio — herdam autoria via FK ao `comando_id`/evento pai (evita duplicação, conforme já sinalizado na auditoria 13) |
| Estado que muda ao longo do tempo, por mais de uma pessoa | `agendamentos`, `clientes`, `produtos`, `servicos`, `profissionais`, `formas_pagamento` | Colunas `created_by` e `updated_by` (não `actor_id` único) — `agendamentos` adicionalmente pode registrar `cancelled_by` quando o status for `cancelado` |
| Ledger futuro (ainda não existe como tabela dedicada; `caixa_movimentos`/`produto_estoque_movimentos` cumprem parcialmente esse papel hoje) | `caixa_movimentos` | Já referencia `comando_id`; herda autoria do comando associado. Se/quando existir abertura/fechamento de caixa como feature própria (fora de escopo atual), essa ação vira um evento com `actor_id` próprio. Nenhum evento de ledger permite alteração retroativa de autoria (sem GRANT de UPDATE nessas colunas para nenhuma role de aplicação) |

`actor_id`/`created_by`/`updated_by`/`cancelled_by` sempre referenciam `app_users.id` — nunca `auth.users.id` diretamente, e nunca um valor compartilhado/genérico.

## Compatibilidade temporária
- `API_ACCESS_TOKEN` continua válido durante toda a transição — não há corte abrupto.
- Ambientes permitidos para o modo legado: dev, staging, CI, scripts internos e integrações servidor-a-servidor (jobs, automações) que não representam um usuário humano.
- Em produção, tráfego de usuário final deve migrar para JWT; `API_ACCESS_TOKEN` em produção fica restrito a integrações server-to-server explicitamente registradas, nunca para telas de usuário.
- Impedir uso indevido em produção: flag explícita (ex.: `LEGACY_TOKEN_AUTH_ENABLED`) — quando desligada, o middleware rejeita Bearer `API_ACCESS_TOKEN` mesmo que o valor esteja correto, independente do valor da env var do token em si.
- Revogação: rotação/remoção do valor de `API_ACCESS_TOKEN` do ambiente de produção assim que o modo legado for desligado — token vazado hoje não expira sozinho, então a rotação é o mecanismo de revogação.
- Teste de coexistência (gate obrigatório): provar que os dois mecanismos podem estar ativos ao mesmo tempo sem contaminação — Bearer legado só popula `req.auth.empresa_id` (fixo, de env) e mantém `user_id`/`actor_id`/`role`/`unit_ids` em `null`/`[]`; JWT sempre popula todos os campos. Nunca o inverso.
- Condição de remoção definitiva do código legado: 100% do tráfego de produção medido em JWT, todos os gates migrados para JWT, e autorização explícita do Platform Owner para remover o middleware Bearer.

### Questão aberta — credencial de integrações servidor-a-servidor
Esta ADR **não decide** o formato final da credencial usada por integrações servidor-a-servidor em produção; apenas registra que reutilizar o mesmo `API_ACCESS_TOKEN` global do modo legado para esse fim é uma solução de transição, não o alvo final. Antes de aprovar esta ADR para implementação, a revisão do Platform Owner deve refinar uma credencial própria por integração, cobrindo:
- credencial específica por integração (não o token global compartilhado);
- hash ou armazenamento seguro da credencial (nunca texto plano em configuração);
- escopo limitado (a integração só acessa as rotas/ações que precisa, não o mesmo perímetro amplo do `API_ACCESS_TOKEN` atual);
- tenant fixado no servidor por integração (nunca escolhido pela própria integração via body/query/header);
- expiração e rotação da credencial;
- revogação individual (revogar uma integração não deve afetar as demais, ao contrário do token único atual);
- auditoria de uso por integração (quem/o quê chamou, quando);
- impossibilidade de essa credencial criar identidade humana ou RBAC fictício — uma integração nunca deve resultar em `user_id`/`role` que pareçam um usuário real.
Esta questão é bloqueante para a **aprovação de implementação** da ADR, não para o commit da proposta em si.

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
| RLS (Row Level Security) nas tabelas de negócio | Defesa em profundidade além do filtro em aplicação | Alto (requer teste extenso; pode quebrar acesso do `service_role` se mal configurado) | Precisa de policy explícita permitindo `service_role` (o backend continua sendo o único caminho de escrita) | N/A | Desabilitar RLS na tabela (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) | 8 (último, opcional nesta fase — pode ficar para um ciclo posterior à adoção de JWT) |

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

## Observabilidade
- Registrar métrica de proporção de requests autenticadas via JWT vs. `API_ACCESS_TOKEN` legado, para decidir quando desligar o modo legado com segurança.
- Registrar tentativas de seleção de `empresa_id`/`unit_id` fora do conjunto autorizado do usuário (403) como sinal de possível uso indevido ou bug de frontend.
- Este item de observabilidade não substitui nem resolve o débito P1 já registrado (ausência de CI remoto); são preocupações distintas.

## Testes
Gates obrigatórios antes de qualquer implementação ser considerada pronta:
```text
JWT ausente → 401
JWT inválido → 401
JWT expirado → 401
usuário sem membership → 403
membership inativa → 403
empresa A não acessa empresa B
unidade não autorizada → 403
role insuficiente → 403
escrita crítica grava autoria (actor_id/created_by/updated_by conforme categoria da tabela)
tenant nunca vem do frontend (body/query/header não têm efeito na resolução de empresa_id/role/unit_ids)
API_ACCESS_TOKEN legado desativável (flag OFF rejeita mesmo token correto)
coexistência: Bearer legado nunca popula user_id/actor_id/role/unit_ids reais; JWT sempre popula todos
```
Todos os testes devem exercitar comportamento real (chamadas HTTP reais ou invocação direta de função/repositório com asserts sobre valores reais), seguindo o padrão já estabelecido em `backend/tests/tenant-boundary-gate.test.js` — nenhum teste deve validar apenas por inspeção textual.

## Critérios de aceite
Esta ADR só é considerada implementada quando:
- Todos os gates da seção Testes estiverem verdes.
- Nenhuma rota crítica aceitar `empresa_id`, `role` ou `unit_id` do cliente como autoridade.
- Nenhum acesso cross-tenant, cross-role ou cross-unit for possível, comprovado por teste.
- Toda escrita crítica (categoria "evento" e "estado" da tabela de Autoria) registrar autoria real, nunca compartilhada/fabricada.
- `API_ACCESS_TOKEN` continuar funcional durante toda a transição, com plano de desligamento documentado e não executado prematuramente.
- Migration 007 (desenhada aqui, não executada) for aprovada explicitamente pelo Platform Owner antes de qualquer `CREATE TABLE`/`ALTER TABLE` real.
- V1.5 e escala global continuarem bloqueadas até os itens acima serem cumpridos e evidenciados (não apenas declarados).

## Riscos residuais
- **Questão aberta bloqueante para aprovação de implementação:** a credencial de integrações servidor-a-servidor ainda não tem modelo definido (ver seção "Questão aberta" em Compatibilidade temporária) — reutilizar o `API_ACCESS_TOKEN` global como está hoje não é aceitável como destino final, só como transição.
- Enquanto esta ADR não for implementada, `empresa_id` continua vindo de `DEFAULT_EMPRESA_ID` (env) — multi-tenant seguro continua BLOQUEADO.
- RLS (item 8 da Migration 007) é opcional nesta fase e, se adiada, mantém o backend como único controle de tenant (mitigado por V1.4.2, mas sem defesa em profundidade no banco).
- Ausência de CI remoto (`.github/workflows`) permanece um débito P1 separado — não é resolvido nem agravado por esta ADR, mas amplia o risco de qualquer implementação futura desta ADR não ser validada automaticamente antes do merge.
- `xlsx` com vulnerabilidade HIGH pré-existente permanece sem relação com esta ADR.

## Consequências
- Caminho de evolução aberto (não decidido agora): se surgir necessidade real de permissão granular além dos 4 papéis fixos, um modelo híbrido (role fixa + tabela de overrides pontuais) pode ser adicionado sem quebrar `empresa_memberships` — não requer redesenho do modelo de dados aqui proposto.
- `app_users` como camada própria (em vez de `auth.users` direto) adiciona uma tabela extra de sincronização, mas paga-se pela estabilidade de FK em autoria/ledger mesmo após remoção de usuários do provedor de auth.
- A resolução de tenant por membership (em vez de claim no JWT) adiciona uma consulta ao banco por requisição — aceitável dado que o backend já consulta o banco para toda operação de negócio; pode ser otimizado com cache de curta duração se necessário, sem mudar a regra de origem canônica.
