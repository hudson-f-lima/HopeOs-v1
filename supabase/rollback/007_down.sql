-- Rollback da migration 007. Ordem inversa, só remove o que a 007 criou.
-- ATENÇÃO: apaga memberships, integrações e a autoria gravada após a 007.
-- Faça backup (pg_dump das tabelas listadas) antes de executar em produção.
-- RLS e revogações de anon/authenticated NÃO são desfeitas: reabrir tabelas
-- para a anon key seria inseguro com a chave publicada na PWA.

begin;

drop function if exists public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid);
drop function if exists public.produto_criar_com_estoque_autoria(uuid, jsonb, int, text, uuid, uuid);
drop function if exists public.produto_estoque_ajuste_autoria(uuid, uuid, text, int, int, text, uuid, uuid);
drop function if exists public.checkout_close_autoria(uuid, jsonb, jsonb, uuid, uuid);

drop trigger if exists trg_estoque_mov_autoria_imutavel on produto_estoque_movimentos;
drop trigger if exists trg_estoque_mov_autoria_insert on produto_estoque_movimentos;
drop trigger if exists trg_comandos_autoria_imutavel on comandos;
drop trigger if exists trg_comandos_autoria_insert on comandos;
drop function if exists public.autoria_evento_imutavel();
drop function if exists public.autoria_evento_insert();
drop function if exists public.app_set_autoria(uuid, uuid, uuid);

alter table clientes drop column if exists updated_by;
alter table clientes drop column if exists created_by;
alter table agendamentos drop column if exists cancelled_by;
alter table agendamentos drop column if exists updated_by;
alter table agendamentos drop column if exists created_by;
alter table produto_estoque_movimentos drop constraint if exists estoque_mov_um_autor;
alter table produto_estoque_movimentos drop column if exists actor_integration_id;
alter table produto_estoque_movimentos drop column if exists actor_id;
alter table comandos drop constraint if exists comandos_um_autor;
alter table comandos drop column if exists actor_integration_id;
alter table comandos drop column if exists actor_id;

drop table if exists integration_audit_events;
drop table if exists integration_scopes;
drop table if exists integration_credentials;
drop table if exists integrations;

drop trigger if exists trg_membership_units_same_empresa on membership_units;
drop function if exists public.membership_units_same_empresa();
drop table if exists membership_units;
drop table if exists unidades;
drop table if exists empresa_memberships;
drop type if exists membership_role;

drop trigger if exists trg_app_users_sync_from_auth on auth.users;
drop function if exists public.app_users_sync_from_auth();
drop table if exists app_users;

commit;
