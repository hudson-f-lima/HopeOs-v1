# Runbook — Migration 007 e login por usuário em produção

Autorização: Platform Owner, 2026-10-16 ("criar, testar e aplicar em prod") — D-007.
Estado em 2026-10-16: código e migration prontos e testados (Postgres 16 local + CI);
**não aplicados em produção** porque esta sessão não tinha acesso ao projeto Supabase
de produção e o serviço do Render estava suspenso (ver "Bloqueios encontrados").

Tempo estimado: 30–45 min. Rollback: seção 8.

## 0. Bloqueios encontrados (por que não foi aplicado automaticamente)
| Item | Situação | O que destrava |
|---|---|---|
| Supabase de produção (`qosioymzswhkqkziocas`, citado em `docs/audit_global/12_*`) | DESCONHECIDO — não aparece na conta conectada à sessão | Executar este runbook com acesso ao projeto, ou conectar a conta certa ao conector Supabase do Claude |
| Projeto do HOPE OS | **`hopeos-v1` (`gsttjozcmdvgstcpadiq`)**, criado em 2026-10-16, banco novo. **001–008 aplicadas em 2026-11-08** pelo merge do PR #16 (verificação 12/12 `true`). Desde 2026-11-08 a integração GitHub do Supabase está ligada ("Deploy to production" na `main`) e o histórico foi alinhado aos nomes dos arquivos (ver passo 4, opção C) | Merge do PR na `main` (opção C) ou SQL Editor (opção A) |
| `kortex-os-v2-staging` (`hyzoocmmtmjlgdyifwhu`) | **OUTRO PROJETO — nunca usar para o HOPE OS** (decisão do Platform Owner, 2026-10-16). Foi reativado e pausado de novo em 2026-10-16; só uma consulta de leitura rodou nele, sem escrita | — |
| Backend Render `hopeos-v1` | BLOQUEADO — `https://hopeos-v1.onrender.com/api/health` responde 503 "Service suspended by its owner" | Reativar o serviço no painel do Render |

## 1. Pré-requisitos
- Acesso de dono ao projeto Supabase de produção e ao Render.
- `psql` ou o SQL Editor do Supabase.
- Branch/PR com a migration mesclado em `main` **só depois** do passo 4 (o backend novo chama RPCs da 007).

## 2. Backup (obrigatório)
Supabase → Database → Backups: confirme um backup do dia, **ou** gere um dump:
```bash
pg_dump "$SUPABASE_DB_URL" --schema=public --schema=auth -Fc -f backup_pre_007.dump
```

## 3. Checagens antes (somente leitura)
```sql
-- 001–006 aplicadas?
select to_regclass('public.agendamentos') is not null as agenda,
       to_regproc('public.checkout_close') is not null as checkout,
       to_regproc('public.produto_estoque_ajuste') is not null as estoque,
       to_regclass('public.app_users') is null as sem_007_ainda;

-- O que anon/authenticated enxergam HOJE (guarde o resultado: a 007 revoga tudo).
select grantee, table_name, string_agg(privilege_type, ',') privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;
```
Todas as colunas da primeira consulta devem vir `true`. Se a segunda listar tabelas,
elas estão expostas pela API REST para quem tiver a anon key: a 007 fecha isso.

## 4. Aplicar a 007
Opção A — SQL Editor: cole o conteúdo de `supabase/migrations/007_identity_tenant_rbac_actor.sql` e execute (é uma transação: ou aplica tudo, ou nada). Em seguida, do mesmo jeito, `supabase/migrations/008_empresa_fiscal_buffer_cargos_categorias.sql` (D-009).

Opção B — terminal:
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/007_identity_tenant_rbac_actor.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/008_empresa_fiscal_buffer_cargos_categorias.sql
```

Opção C — integração GitHub do Supabase (recomendada para `hopeos-v1`):
- Configuração: Project Settings → Integrations → GitHub, working directory `.`, "Deploy to production" ligado, branch `main`.
- O merge na `main` aplica as migrations de `supabase/migrations` que faltam no histórico `supabase_migrations.schema_migrations`.
- Em 2026-11-08 o histórico foi alinhado aos nomes dos arquivos. Antes: `20261016103449`…`20261016103903`, gravados pelo conector MCP. Depois: `001`…`005`. A mudança mexeu só nesse registro, não no schema. Para desfazer, volte as versões antigas com um `update` equivalente.
- Validado localmente com Supabase CLI 2.122.1 contra um banco com 001–005 e o mesmo histórico: `migration list` aponta 006–008 como pendentes. Depois `db push` aplicou as três e `gate_007`/`gate_008` passaram.
- Depois do merge: Supabase → Branches → `main` mostra o resultado do deploy. Em seguida rode a verificação abaixo.

Verificação (todas devem retornar `true`):
```sql
select to_regclass('public.app_users') is not null as app_users,
       to_regclass('public.empresa_memberships') is not null as memberships,
       to_regclass('public.integration_credentials') is not null as integracoes,
       to_regproc('public.agendamento_criar') is not null as agenda_atomica,
       to_regproc('public.checkout_close_autoria') is not null as checkout_autoria,
       (select bool_and(rowsecurity) from pg_tables where schemaname = 'public') as rls_em_tudo,
       not exists (select 1 from information_schema.role_table_grants
                   where table_schema = 'public' and grantee in ('anon', 'authenticated')) as anon_fechado,
       (select count(*) from unidades) >= (select count(*) from empresas) as unidade_padrao,
       exists (select 1 from pg_trigger where tgname = 'trg_app_users_sync_from_auth') as trigger_auth,
       to_regclass('public.cargos') is not null as cargos_008,
       exists (select 1 from information_schema.columns where table_name = 'empresas' and column_name = 'buffer_min') as buffer_008;
```

### 4.1 Migration 009 — estorno de comanda (D-013)
Aplicada pelo merge na `main` (integração GitHub, opção C), como a 008. Antes do merge: `supabase/tests/check_migrations.sh` e `supabase/tests/run.sh` verdes (gate_009, concorrência, controles negativos e ciclo de rollback 009→008→007). Backend e migration vão juntos: o backend novo lê `comanda_estornos*` no snapshot e nos relatórios e falha sem a 009.

Verificação pós-merge (todas `true`):
```sql
select to_regclass('public.comanda_estornos') is not null as estornos,
       to_regclass('public.comanda_estorno_itens') is not null as estorno_itens,
       to_regclass('public.comanda_estorno_pagamentos') is not null as estorno_pagamentos,
       to_regclass('public.comanda_estorno_gorjetas') is not null as estorno_gorjetas,
       to_regprocedure('public.comanda_estornar(uuid, uuid, jsonb, uuid)') is not null as rpc_estorno,
       not has_function_privilege('anon', 'public.comanda_estornar(uuid, uuid, jsonb, uuid)', 'execute') as rpc_fechada_anon,
       not has_function_privilege('authenticated', 'public.comanda_estornar(uuid, uuid, jsonb, uuid)', 'execute') as rpc_fechada_auth,
       not has_table_privilege('service_role', 'public.comanda_estornos', 'update') as estorno_sem_update,
       (select count(*) from pg_trigger where tgname = 'trg_ledger_imutavel') = 10 as imutabilidade_10_tabelas,
       pg_get_constraintdef((select oid from pg_constraint where conname = 'produto_estoque_movimentos_tipo_check')) like '%devolucao%' as estoque_devolucao,
       exists (select 1 from pg_constraint where conname = 'caixa_movimentos_estorno_negativo') as caixa_estorno_negativo,
       (select bool_and(rowsecurity) from pg_tables where schemaname = 'public') as rls_em_tudo,
       not exists (select 1 from information_schema.role_table_grants
                   where table_schema = 'public' and grantee in ('anon', 'authenticated')) as anon_fechado;
```
Fumaça pela API (admin logado, comanda de teste do dia): `POST /api/comandas/:id/estorno` com `{"tipo":"total","idempotencyKey":"<uuid>","motivoCodigo":"erro_lancamento","motivo":"teste de fumaça do estorno"}` → 201; repetir o mesmo corpo → 200 `idempotent: true`; `GET /api/caixa/fechamento` mostra `estornos.valorCentavos` negativo; com o token legado → 403.

**Ledger imutável a partir da 009:** `update`/`delete`/`truncate` em `comandos`, `comando_itens`, `comando_pagamentos`, `comando_gorjetas`, `caixa_movimentos`, `produto_estoque_movimentos` e `comanda_estorno*` falham (`ledger imutável: ...`). Isso inclui apagar empresa/produto/comanda com histórico (cascade) e `backend/scripts/clear-test-data.js`. Limpeza de dados de teste em produção passa a exigir SQL autorizado pelo Platform Owner, numa transação, com `alter table <t> disable trigger trg_ledger_imutavel` antes e `enable trigger` depois.

## 5. Configurar o Supabase Auth
Authentication → URL Configuration:
- **Site URL** e **Redirect URLs**: a URL pública da PWA (ex.: `https://hudson-f-lima.github.io/HopeOs-v1/` ou a do Render static). É para onde vão os links de convite e de recuperação. Use a mesma URL em `APP_PUBLIC_URL` (passo 6).

Authentication → Providers → Email: deixe **Confirm email** ligado. Recomendado: desligar
"Allow new users to sign up" — o fluxo do app é por convite do admin. O `doctor` (passo 6.4) lê
essas duas opções em `/auth/v1/settings` e avisa (WARN) se estiverem diferentes. Site URL/Redirect
URLs não são expostos pela API: confira no painel.

## 6. Deploy do backend (Render)
Procedimento completo e "o que nunca fazer": skill `.claude/skills/deploy-producao`. Ferramentas em
`backend/scripts/ops/` (Node puro, `--help` em todas; saída `0` ok, `1` falhou, `2` uso, `3` recusado
por segurança). Nenhuma imprime a chave secreta nem o `API_ACCESS_TOKEN`.

1. Reative o serviço `hopeos-v1`.
2. Variáveis de ambiente — lista completa (o `render.yaml` declara as mesmas):

| Variável | Valor | Observação |
|---|---|---|
| `NODE_ENV` | `production` | liga HSTS |
| `PORT` | `10000` | |
| `SUPABASE_URL` | `https://gsttjozcmdvgstcpadiq.supabase.co` | `hopeos-v1`; **nunca** o `kortex-os-v2-staging` (o `doctor` recusa) |
| `SUPABASE_SERVICE_ROLE_KEY` **ou** `SUPABASE_SECRET_KEY` | chave secreta do `hopeos-v1` | só UMA das duas; com as duas e valores diferentes o backend usa `SUPABASE_SECRET_KEY` e o `doctor` reprova |
| `API_ACCESS_TOKEN` | aleatório ≥ 32 caracteres | token legado (transição) |
| `DEFAULT_EMPRESA_ID` | UUID do salão | o mesmo do passo 7 (`--empresa-id`) |
| `CORS_ORIGIN` | origem da PWA, sem barra final | GitHub Pages já é liberado pelo código |
| `APP_PUBLIC_URL` | URL pública da PWA | destino dos links de convite/recuperação |
| `LEGACY_TOKEN_AUTH_ENABLED` | `true` | mantém o token antigo durante a transição |
| `AUTH_TIMEOUT_MS` | `5000` | timeout da validação no Supabase Auth |
| `INTEGRATION_ROTATION_OVERLAP_MIN` | `60` | janela da credencial antiga após rotação |
| `APP_TIMEZONE` | `America/Sao_Paulo` | slots e "hoje" |
| `PUBLIC_BOOKING_LINKS` | **ausente** | agendamento online desligado até D-014 (aviso de privacidade + Red Team) |

3. Deploy **manual** da `main` (Render → Manual Deploy → *Deploy latest commit*). Banco e backend
   precisam estar na mesma versão: o backend atual lê tabelas da 007–009.
4. Diagnóstico com as mesmas variáveis, guardadas num arquivo **fora** do repositório (`chmod 600`):
```bash
node --env-file=$HOME/hopeos-prod.env backend/scripts/ops/doctor.js --no-dotenv \
  --api https://hopeos-v1.onrender.com/api
```
   Esperado: `APTO (código 0)`, com `api.health` e `db.schema.001–006`/`007`/`008`/`009` OK.
   `db.bootstrap` WARN ("nenhuma empresa") é normal antes do passo 7. `--offline` confere só as variáveis.

   Alternativa manual (sem a ferramenta):
```bash
curl -s https://hopeos-v1.onrender.com/api/health              # 200
curl -s -o /dev/null -w '%{http_code}\n' https://hopeos-v1.onrender.com/api/clientes   # 401
```
   e a verificação SQL do passo 4 / §4.1 no SQL Editor.

## 7. Primeiro admin (bootstrap, uma vez)
1. Supabase → Authentication → Users → **Invite user** com o e-mail do dono. O trigger da 007 cria a
   linha em `app_users` na hora; o dono recebe o link, abre a PWA e define a senha.
2. Crie a empresa, a unidade e o vínculo de admin. Num banco novo (como o `hopeos-v1`) a tabela
   `empresas` está vazia: sem a linha da empresa o vínculo falha por FK, e empresa criada depois da 007
   não ganha "Unidade principal" automaticamente — sem unidade, recepção e profissional recebem
   `NO_UNIT_ACCESS`.

   **Com a ferramenta (recomendado)** — idempotente, simulação por padrão, usa o mesmo acesso do
   backend (PostgREST com a chave secreta), recusa o projeto de staging e não grava nada se o e-mail
   não estiver em `app_users`:
```bash
# 1) simulação (padrão): mostra CRIAR/EXISTE/ATUALIZAR para empresa, unidade e vínculo
node --env-file=$HOME/hopeos-prod.env backend/scripts/ops/bootstrap-admin.js --no-dotenv \
  --empresa-id <DEFAULT_EMPRESA_ID do Render> --empresa-nome "<nome do salão>" --admin-email <e-mail do dono>
# 2) gravação (só com autorização do Platform Owner): o mesmo comando + --apply
```
   Empresa já existente não é renomeada; vínculo existente é promovido a `admin`/`ativo`. Repetir não
   duplica nada. Depois, `doctor` de novo: `db.bootstrap` some.

   **Alternativa manual (SQL Editor)** — equivalente, também idempotente (troque os três valores):
```sql
insert into empresas (id, nome) values ('<DEFAULT_EMPRESA_ID do Render>', '<nome do salão>')
on conflict (id) do nothing;
insert into unidades (empresa_id, nome)
select '<DEFAULT_EMPRESA_ID do Render>', 'Unidade principal'
where not exists (select 1 from unidades where empresa_id = '<DEFAULT_EMPRESA_ID do Render>');
insert into empresa_memberships (empresa_id, user_id, role)
select '<DEFAULT_EMPRESA_ID do Render>', id, 'admin'
from app_users where lower(email) = lower('<e-mail do dono>')
on conflict (empresa_id, user_id) do update set role = 'admin', status = 'ativo';
```
3. Fumaça pós-deploy (read-only; API + PWA):
```bash
node backend/scripts/ops/smoke.js --api https://hopeos-v1.onrender.com/api \
  --pwa <URL pública da PWA>
```
   Confere health 200, rota de negócio sem token 401, headers de segurança, CORS só para a PWA,
   `/api/public/*` 404 (desligado), CSP/headers do site e `config.json`. WARN conhecidos:
   `api.cors.localhost` e `pwa.publicacao` (ver `PROJECT_STATE`). A PWA no GitHub Pages reprova
   `pwa.csp`/`pwa.headers`: o Pages não envia headers — a CSP só existe no static do Render.
4. Entre na PWA com e-mail e senha. O **assistente de configuração** abre sozinho (dados, horários,
   pagamentos, serviços, equipe e simulação). Depois, **Gestão → Equipe** convida o restante.

Smoke test com o JWT do admin (DevTools → Application → Local Storage → `hopeos.session`):
```bash
curl -s https://hopeos-v1.onrender.com/api/me -H "Authorization: Bearer $JWT"    # principal_type: user, role admin
curl -s https://hopeos-v1.onrender.com/api/clientes -H "Authorization: Bearer $API_ACCESS_TOKEN"   # legado ainda 200
```

## 8. Rollback
| Situação | Ação |
|---|---|
| Problema só no login/JWT | Usar o token legado (`?apiToken=` / "modo antigo"); não exige mexer no banco |
| Backend novo com erro | Reverter o merge em `main` **e** aplicar `supabase/rollback/007_down.sql` (o backend antigo não conhece as RPCs novas, mas também não depende delas) |
| Problema no estorno com estornos já gravados | Rollback é do **backend** (reverter o merge do backend / esconder a rota), não do banco: `009_down.sql` recusa rodar com estorno, devolução de estoque ou `estorno_pagamento` gravados (ledger não se apaga) |
| Desfazer a 009 (sem estornos gravados) | `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/009_down.sql` — antes de desfazer a 008; remove tabelas/RPC de estorno, triggers de imutabilidade e volta o check de estoque sem `devolucao`. Reverter junto o backend (ele lê `comanda_estornos*`) |
| Desfazer a 008 | `supabase/rollback/008_down.sql` (antes de desfazer a 007; restaura o `agendamento_criar` sem buffer) |
| Desfazer a 007 | `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/007_down.sql` — apaga memberships, integrações e a autoria gravada após a 007; RLS/revogações de anon **não** são desfeitas de propósito |
| Perda de dados | Restaurar o backup do passo 2 |

## 9. Depois da adoção
- Acompanhe `GET /api/admin/auth-metrics` (admin): proporção de chamadas `user` × `legacy`.
- Com 100% em `user`/`integration` e autorização do Platform Owner: `LEGACY_TOKEN_AUTH_ENABLED=false` e troca/remoção do `API_ACCESS_TOKEN` (ADR-005, "Condição de remoção").
- Integrações servidor-a-servidor: `POST /api/admin/integrations` (segredo aparece uma vez).
