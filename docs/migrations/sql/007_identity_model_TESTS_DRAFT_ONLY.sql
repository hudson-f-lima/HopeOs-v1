-- DRAFT ONLY
-- DO NOT EXECUTE
-- NOT APPROVED FOR PRODUCTION
--
-- Test plan for docs/migrations/sql/007_identity_model_DRAFT_ONLY.sql.
-- Run ONLY against a disposable/local test database that already has
-- 001_init.sql .. 006_produto_estoque_ajuste_rpc.sql and the companion
-- 007_identity_model_DRAFT_ONLY.sql applied. Never against staging or
-- production. Each block is a schema-level test — none of them require the
-- backend (middleware/JWT/req.auth) to exist, matching the "SCHEMA" gates
-- listed in the companion Markdown.
--
-- Revision 3 (Red Team round 3) fixed two remaining false-positive risks:
-- (1) every EXCEPTION WHEN OTHERS now checks the specific SQLSTATE (and,
-- where relevant, the constraint name) expected from the mechanism under
-- test, instead of accepting ANY error — a stray permission/column/typo
-- error could previously have been misread as the trigger/FK working;
-- (2) TESTE 3's data selection was not actually deterministic (it picked
-- "the oldest empresa" and "any membership" rather than the exact rows
-- Setup created) — fixed by pinning every test fixture (both empresas, the
-- auth user, the app user) to fixed, well-known UUIDs that every test
-- references directly, never by lookup/ordering. TESTE 2b was also
-- rewritten: the previous version started from zero credentials, so the
-- two concurrent inserts could legitimately both succeed and never
-- exercise the rejection path at all; and it accepted a lock_timeout error
-- as "passing", which only proves contention happened, not that the count
-- after the lock correctly rejected a 3rd credential.
--
-- Convention: every test ends with an assertion that RAISEs (with a message
-- prefixed TESTE N FALHOU) on failure, so a clean run (only "TESTE N OK"
-- notices) means all tests passed for the reason claimed — not for any
-- incidental reason.

begin;

-- ---------------------------------------------------------------------
-- Setup: fixed, well-known UUIDs for every fixture, so no test needs to
-- "guess" which empresa/user is the test one via ordering or name
-- matching (a disposable DB is not guaranteed to be empty).
-- ---------------------------------------------------------------------
-- v_test_empresa_a = 00000000-0000-0000-0000-0000000000e1
-- v_test_empresa_b = 00000000-0000-0000-0000-0000000000e2
-- v_test_auth_user  = 00000000-0000-0000-0000-0000000000a1  (= app_users.id)
do $$
declare
  v_test_empresa_a uuid := '00000000-0000-0000-0000-0000000000e1'::uuid;
  v_test_empresa_b uuid := '00000000-0000-0000-0000-0000000000e2'::uuid;
  v_test_auth_user uuid := '00000000-0000-0000-0000-0000000000a1'::uuid;
begin
  insert into empresas (id, nome) values (v_test_empresa_a, 'Empresa Teste A — 007 tests')
    on conflict (id) do nothing;
  insert into empresas (id, nome) values (v_test_empresa_b, 'Empresa Teste B — 007 tests')
    on conflict (id) do nothing;

  begin
    insert into auth.users (id, email)
      values (v_test_auth_user, 'teste-007@example.invalid')
      on conflict (id) do nothing;
  exception when others then
    raise exception 'SETUP FALHOU ao inserir em auth.users: %. Este teste depende de auth.users aceitar um INSERT minimo (id, email); ajuste este bloco conforme a versao do schema auth.users do projeto Supabase alvo antes de rodar novamente.', sqlerrm;
  end;

  insert into app_users (id, nome)
    values (v_test_auth_user, 'Usuario de teste 007')
    on conflict (id) do nothing;

  insert into empresa_memberships (empresa_id, user_id, role)
    values (v_test_empresa_a, v_test_auth_user, 'admin')
    on conflict (empresa_id, user_id) do nothing;

  if not exists (
    select 1 from empresa_memberships
    where empresa_id = v_test_empresa_a and user_id = v_test_auth_user
  ) then
    raise exception 'SETUP FALHOU: membership de teste nao foi criada em empresa_memberships';
  end if;

  -- TESTE 3 depende de o usuario fixture NAO ter membership na empresa B
  -- (para validar a rejeicao cross-tenant pela FK composta). Uma base de
  -- teste nao-vazia pode estar contaminada por execucao anterior ou por
  -- dado manual; falhar aqui de forma visivel em vez de seguir em frente
  -- com uma premissa falsa, e sem apagar nada silenciosamente.
  if exists (
    select 1 from empresa_memberships
    where empresa_id = v_test_empresa_b and user_id = v_test_auth_user
  ) then
    raise exception 'SETUP FALHOU: base de teste contaminada — usuario fixture % ja possui membership na empresa B (%), mas o Setup so deveria criar membership na empresa A. TESTE 3 depende da ausencia dessa membership para validar a rejeicao cross-tenant pela FK composta fk_comandos_actor_empresa. Este setup nao remove memberships existentes automaticamente; investigue e limpe manualmente a base de teste antes de reexecutar.', v_test_auth_user, v_test_empresa_b;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- TESTE 1 — Append-only: UPDATE/DELETE em integration_audit_events devem
-- falhar especificamente com o SQLSTATE do trigger (P0001), não com
-- qualquer erro.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa uuid := '00000000-0000-0000-0000-0000000000e1'::uuid;
  v_integration uuid;
  v_event_id uuid;
  v_sqlstate text;
  v_message text;
begin
  insert into integrations (empresa_id, nome) values (v_empresa, 'integracao-teste-audit')
    returning id into v_integration;
  insert into integration_audit_events (integration_id, rota, status_code)
    values (v_integration, '/api/teste', 200)
    returning id into v_event_id;

  v_sqlstate := null;
  begin
    update integration_audit_events set status_code = 500 where id = v_event_id;
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  end;

  if v_sqlstate is null then
    raise exception 'TESTE 1 FALHOU: UPDATE em integration_audit_events deveria ter sido rejeitado, mas nao levantou erro';
  elsif v_sqlstate <> 'P0001' or v_message not like '%append-only%' then
    raise exception 'TESTE 1 FALHOU: UPDATE falhou, mas com erro inesperado (sqlstate=%, mensagem=%) — nao e o trigger append-only', v_sqlstate, v_message;
  end if;

  v_sqlstate := null;
  begin
    delete from integration_audit_events where id = v_event_id;
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  end;

  if v_sqlstate is null then
    raise exception 'TESTE 1 FALHOU: DELETE em integration_audit_events deveria ter sido rejeitado, mas nao levantou erro';
  elsif v_sqlstate <> 'P0001' or v_message not like '%append-only%' then
    raise exception 'TESTE 1 FALHOU: DELETE falhou, mas com erro inesperado (sqlstate=%, mensagem=%) — nao e o trigger append-only', v_sqlstate, v_message;
  end if;

  raise notice 'TESTE 1 OK: integration_audit_events e append-only (UPDATE e DELETE rejeitados com P0001 do trigger esperado)';
end
$$;

-- ---------------------------------------------------------------------
-- TESTE 2 — Limite de 2 credenciais ativas (caminho serial, sem
-- concorrencia real). Prova a contagem numa unica transacao/sessao E que o
-- erro e especificamente o do trigger de limite (P0001 + mensagem), nao
-- qualquer erro. NAO prova a correcao de corrida — isso e responsabilidade
-- exclusiva do TESTE 2b (duas sessoes reais).
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa uuid := '00000000-0000-0000-0000-0000000000e1'::uuid;
  v_integration uuid;
  v_sqlstate text;
  v_message text;
begin
  insert into integrations (empresa_id, nome) values (v_empresa, 'integracao-teste-rotacao')
    returning id into v_integration;

  insert into integration_credentials (integration_id, secret_hash) values (v_integration, 'hash-1');
  insert into integration_credentials (integration_id, secret_hash) values (v_integration, 'hash-2');

  v_sqlstate := null;
  begin
    insert into integration_credentials (integration_id, secret_hash) values (v_integration, 'hash-3');
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  end;

  if v_sqlstate is null then
    raise exception 'TESTE 2 FALHOU: terceira credencial ativa deveria ter sido rejeitada, mas foi aceita';
  elsif v_sqlstate <> 'P0001' or v_message not like '%maximo de 2 credenciais%' then
    raise exception 'TESTE 2 FALHOU: insercao falhou, mas com erro inesperado (sqlstate=%, mensagem=%) — nao e o trigger de limite', v_sqlstate, v_message;
  end if;

  raise notice 'TESTE 2 OK (caminho serial apenas): terceira credencial ativa foi rejeitada pelo trigger esperado (P0001). Concorrencia real ainda depende do TESTE 2b.';
end
$$;

-- ---------------------------------------------------------------------
-- TESTE 2b — ÚNICO TESTE VÁLIDO DE CONCORRÊNCIA. Um único script de sessão
-- não consegue abrir duas conexões simultâneas de verdade; precisa ser
-- executado manualmente em duas sessões `psql` contra o MESMO banco de
-- teste. CORRIGIDO na revisão 3: a versão anterior começava do zero
-- (0 credenciais ativas) — as duas inserções concorrentes terminariam
-- legitimamente em 2 credenciais ativas, sem NUNCA tentar criar uma
-- terceira, ou seja, não reproduzia a corrida original. Corrigido para
-- partir de exatamente 1 credencial ativa; a Sessão A cria a 2ª (deve ter
-- sucesso), e só a Sessão B — tentando criar a 3ª ao mesmo tempo — testa
-- de fato o limite sob concorrência.
--
-- Preparação (rodar antes de abrir as duas sessões, fora de transação):
--   INSERT INTO integrations (id, empresa_id, nome)
--     VALUES ('<uuid-fixo-da-integracao>', '00000000-0000-0000-0000-0000000000e1', 'integracao-teste-2b');
--   INSERT INTO integration_credentials (integration_id, secret_hash)
--     VALUES ('<uuid-fixo-da-integracao>', 'hash-preexistente'); -- agora ha 1 ativa
--
--   Sessão A: BEGIN;
--             INSERT INTO integration_credentials (integration_id, secret_hash)
--               VALUES ('<uuid-fixo-da-integracao>', 'hash-a'); -- será a 2ª ativa — deve funcionar
--             -- trigger BEFORE adquire lock em integrations.id via FOR UPDATE
--             -- NÃO faça COMMIT ainda — segure a sessão aberta
--   Sessão B: SET lock_timeout = '30s'; BEGIN;
--             INSERT INTO integration_credentials (integration_id, secret_hash)
--               VALUES ('<uuid-fixo-da-integracao>', 'hash-b'); -- tentativa da 3ª ativa
--             -- deve BLOQUEAR aqui, esperando o lock da Sessão A
--   Sessão A: COMMIT; -- libera o lock rapidamente (segundos, não minutos)
--   Sessão B: -- desbloqueia após o COMMIT de A, reconta (agora vê 2 ativas:
--             -- a pré-existente + a de A) e DEVE FALHAR com o erro do
--             -- trigger de limite — não com timeout de lock.
--
-- Critério de aceite (os dois, não apenas um):
--   1. Sessão A completa com sucesso (2ª credencial ativa criada).
--   2. Sessão B desbloqueia e falha ESPECIFICAMENTE com o erro do trigger
--      de limite (mesma mensagem/SQLSTATE P0001 do TESTE 2), não com o
--      erro de lock_timeout (SQLSTATE 55P03). Se Sessão B falhar por
--      lock_timeout, isso só prova contenção — não prova que a contagem
--      pós-lock rejeitou a 3ª credencial — e o teste deve ser considerado
--      NÃO CONCLUÍDO, não aprovado. O lock_timeout de 30s existe só como
--      rede de segurança contra um travamento genuíno (ex.: Sessão A
--      esquecida sem commit), não como resultado esperado do teste.
-- Status: ESCRITO, NÃO EXECUTADO — não classificar a correção de
-- concorrência como comprovada até este roteiro rodar de fato e satisfazer
-- os dois critérios acima.

-- ---------------------------------------------------------------------
-- TESTE 3 — Autoria cross-tenant deve ser rejeitada pela FK composta.
-- CORRIGIDO na revisão 3: a versão anterior selecionava "a empresa mais
-- antiga" e "qualquer membership dessa empresa" em vez de referenciar
-- exatamente os IDs que o Setup criou — numa base de teste não-vazia,
-- isso podia selecionar dados de outro teste/execução anterior, não os
-- fixtures determinísticos. Agora usa os UUIDs fixos diretamente, sem
-- select nenhum, e valida o SQLSTATE (23503, foreign_key_violation) e o
-- nome da constraint que deveria falhar.
-- ---------------------------------------------------------------------
do $$
declare
  v_empresa_b uuid := '00000000-0000-0000-0000-0000000000e2'::uuid;
  v_user uuid := '00000000-0000-0000-0000-0000000000a1'::uuid; -- membership so' existe na empresa A (ausencia na empresa B verificada explicitamente no Setup)
  v_sqlstate text;
  v_constraint text;
begin
  v_sqlstate := null;
  begin
    insert into comandos (empresa_id, actor_id, data, hora, status)
      values (v_empresa_b, v_user, current_date, current_time, 'fechado');
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_constraint = constraint_name;
  end;

  if v_sqlstate is null then
    raise exception 'TESTE 3 FALHOU: comando da empresa B com actor_id de membership só da empresa A deveria ter sido rejeitado, mas foi aceito';
  elsif v_sqlstate <> '23503' or v_constraint <> 'fk_comandos_actor_empresa' then
    raise exception 'TESTE 3 FALHOU: insercao falhou, mas com erro inesperado (sqlstate=%, constraint=%) — nao e a FK composta de autoria cross-tenant', v_sqlstate, v_constraint;
  end if;

  raise notice 'TESTE 3 OK: autoria cross-tenant rejeitada pela FK composta fk_comandos_actor_empresa (23503), com fixtures deterministicos';
end
$$;

-- ---------------------------------------------------------------------
-- TESTE 4 — Re-execução do arquivo 007_identity_model_DRAFT_ONLY.sql
-- inteiro não deve falhar. Automatizado em
-- `run_idempotency_test_DRAFT_ONLY.sh` (sintaxe verificada com `bash -n`;
-- ainda não executado contra um banco real).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- TESTE 5 — Assertion real (não apenas SELECT visual) de que service_role
-- tem os privilégios esperados nas tabelas novas. has_table_privilege()
-- consulta o estado real da tabela, não a promessa de default privilege
-- para tabelas futuras.
-- ---------------------------------------------------------------------
do $$
declare
  v_table text;
  v_priv text;
  v_missing text[] := array[]::text[];
  v_tables text[] := array['app_users','empresa_memberships','unidades','membership_units',
                            'integrations','integration_credentials','integration_scopes',
                            'integration_audit_events'];
  v_privs text[] := array['SELECT','INSERT','UPDATE','DELETE'];
begin
  foreach v_table in array v_tables loop
    foreach v_priv in array v_privs loop
      if not has_table_privilege('service_role', v_table, v_priv) then
        v_missing := v_missing || (v_table || ':' || v_priv);
      end if;
    end loop;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception 'TESTE 5 FALHOU: service_role sem privilegios esperados: %', array_to_string(v_missing, ', ');
  end if;

  raise notice 'TESTE 5 OK: service_role possui SELECT/INSERT/UPDATE/DELETE em todas as 8 tabelas novas';
end
$$;

rollback;
-- Este script roda tudo dentro de uma transação e faz ROLLBACK no final —
-- nenhum dado de teste fica na base. Remover o ROLLBACK (trocar por COMMIT)
-- apenas em banco de teste descartável, nunca em staging/produção.
