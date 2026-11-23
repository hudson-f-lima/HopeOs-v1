# Trigger `auth.users → app_users`: recriar usuário com e-mail já usado falha (2026-11-23)

**Classificação:** **REAL** no Postgres local com o shim do Auth (reproduzido). **DESCONHECIDO** no Supabase real (não testado lá). **Severidade:** P2, baixa a média. **Correção:** exige migration 028+ e autorização do Platform Owner; **não foi feita**.

## Origem
Apareceu ao analisar o PR #15 (rascunho de julho sobre a migration 007), cuja pendência era "validar o trigger `auth.users → app_users` quando ele falha". A 007 real, em produção desde 2026-11-08, tem esse trigger (`supabase/migrations/007_identity_tenant_rbac_actor.sql`, `trg_app_users_sync_from_auth`).

## O que acontece
1. O trigger roda `after insert or update of email on auth.users` e faz `insert into app_users ... on conflict (id) do update`.
2. O `app_users` não tem chave estrangeira para `auth.users` de propósito ("sobrevive à remoção no provedor"), então uma conta removida do Auth **deixa a linha em `app_users`**.
3. Existe o índice único `ux_app_users_email` sobre `lower(email)`.
4. Se o mesmo e-mail for criado de novo no Auth, o `id` é outro. O `on conflict (id)` não cobre o conflito do e-mail, o `insert` viola o índice, o trigger lança erro e a criação da conta **no Auth é abortada**.

O mesmo vale para trocar o e-mail de um usuário por um que já esteja em `app_users` de outra conta.

## Reprodução (local, não toca produção)
```bash
# Postgres 16 local, banco descartável
su postgres -c "psql -qX -d postgres -c 'create database t007'"
su postgres -c "cd <repo> && for f in supabase/tests/supabase_shim.sql supabase/migrations/00[1-7]_*.sql; do psql -v ON_ERROR_STOP=1 -qX -d t007 -f \$f; done"
su postgres -c "psql -qX -d t007" <<'SQL'
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'cliente@salao.test');   -- espelha em app_users
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';                                    -- app_users sobrevive
insert into auth.users (id, email) values ('bbbbbbbb-0000-4000-8000-000000000002', 'cliente@salao.test');   -- ERRO
select count(*) from auth.users where lower(email) = 'cliente@salao.test';                                   -- 0: a conta nova não existe
SQL
su postgres -c "psql -qX -d postgres -c 'drop database t007'"
```
Resultado observado em 2026-11-23: `ERROR: duplicate key value violates unique constraint "ux_app_users_email"` e **0 contas** criadas.

## Limites desta prova
- É o shim local do Auth (`supabase/tests/supabase_shim.sql`), não o Supabase Auth real. No Supabase real, um trigger que falha em `auth.users` costuma aparecer como "Database error saving new user"; isso **não foi testado**.
- O `gate_007.sql` (bloco 01) cobre só o caminho feliz do trigger (espelha e usa o nome padrão). Nenhum teste cobre a falha.
- Não verifiquei se existe hoje em produção algum usuário removido do Auth cujo e-mail volte a ser usado. A contagem de dados em produção ainda não foi executada.

## Quando acontece na prática
Só se alguém for **excluído no painel do Supabase Auth** e depois convidado de novo com o mesmo e-mail (ou trocar o e-mail para um já usado). Se os usuários são **desativados pelo app** (`ativo = false`) e nunca excluídos no provedor, não acontece.

## Mitigação imediata (sem código)
Não exclua usuários no painel do Supabase Auth; desative pelo app. Se for preciso reutilizar um e-mail, trate caso a caso antes de convidar.

## Opções de correção (nenhuma implementada; exigem migration 028+)
- **Liberar o e-mail quando a conta sai do provedor:** um trigger de remoção em `auth.users` que marca o `app_users` como inativo e libera ou anula o e-mail. Mantém o histórico e resolve na origem.
- **Tornar o trigger tolerante ao conflito de e-mail:** evita abortar o cadastro, mas pode deixar o usuário sem linha em `app_users`; precisa de teste do que o login faz nesse caso.
- Em qualquer opção: gate SQL novo que cubra a falha, com controle negativo, e teste no Supabase real antes de depender dele.

## Decisão pendente (Platform Owner)
Autorizar ou não a migration 028 para corrigir. Até lá, vale a mitigação acima.
