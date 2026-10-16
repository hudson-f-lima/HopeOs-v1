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
Opção A — SQL Editor: cole o conteúdo de `supabase/migrations/007_identity_tenant_rbac_actor.sql` e execute (é uma transação: ou aplica tudo, ou nada).

Opção B — terminal:
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/007_identity_tenant_rbac_actor.sql
```

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
       exists (select 1 from pg_trigger where tgname = 'trg_app_users_sync_from_auth') as trigger_auth;
```

## 5. Configurar o Supabase Auth
Authentication → URL Configuration:
- **Site URL** e **Redirect URLs**: a URL pública da PWA (ex.: `https://hudson-f-lima.github.io/HopeOs-v1/` ou a do Render static). É para onde vão os links de convite e de recuperação.

Authentication → Providers → Email: deixe **Confirm email** ligado. Opcional: desligar
"Allow new users to sign up" — o fluxo do app é por convite do admin.

## 6. Deploy do backend (Render)
1. Reative o serviço `hopeos-v1`.
2. Variáveis de ambiente (além das que já existem):

| Variável | Valor | Observação |
|---|---|---|
| `APP_PUBLIC_URL` | URL pública da PWA | destino dos links de convite/recuperação |
| `LEGACY_TOKEN_AUTH_ENABLED` | `true` | mantém o token antigo durante a transição |
| `AUTH_TIMEOUT_MS` | `5000` | timeout da validação no Supabase Auth |
| `INTEGRATION_ROTATION_OVERLAP_MIN` | `60` | janela da credencial antiga após rotação |
| `APP_TIMEZONE` | `America/Sao_Paulo` | slots e "hoje" |

3. Mescle o PR em `main` (o Render faz o deploy). Confirme:
```bash
curl -s https://hopeos-v1.onrender.com/api/health              # 200
curl -s -o /dev/null -w '%{http_code}\n' https://hopeos-v1.onrender.com/api/clientes   # 401
```

## 7. Primeiro admin (bootstrap, uma vez)
1. Supabase → Authentication → Users → **Invite user** com o e-mail do dono. Ele recebe o link, abre a PWA e define a senha.
2. Dê o papel de admin na empresa (troque os dois valores):
```sql
insert into empresa_memberships (empresa_id, user_id, role)
select '<DEFAULT_EMPRESA_ID do Render>', id, 'admin'
from app_users where lower(email) = lower('<e-mail do dono>');
```
3. Entre na PWA com e-mail e senha. A partir daqui, **Gestão → Equipe** convida o restante
   (recepção, profissionais — ligando cada profissional ao seu cadastro).

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
| Desfazer a 007 | `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/007_down.sql` — apaga memberships, integrações e a autoria gravada após a 007; RLS/revogações de anon **não** são desfeitas de propósito |
| Perda de dados | Restaurar o backup do passo 2 |

## 9. Depois da adoção
- Acompanhe `GET /api/admin/auth-metrics` (admin): proporção de chamadas `user` × `legacy`.
- Com 100% em `user`/`integration` e autorização do Platform Owner: `LEGACY_TOKEN_AUTH_ENABLED=false` e troca/remoção do `API_ACCESS_TOKEN` (ADR-005, "Condição de remoção").
- Integrações servidor-a-servidor: `POST /api/admin/integrations` (segredo aparece uma vez).
