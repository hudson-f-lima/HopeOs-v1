-- Rollback da migration 012 (permissões individuais, D-032). Apaga as permissões extras
-- concedidas e a trilha de concessões: cada pessoa volta ao padrão do seu papel.
begin;
drop function if exists public.membership_permissoes_definir(uuid, uuid, uuid, text[]);
drop table if exists public.membership_permissao_eventos;
alter table public.empresa_memberships drop constraint if exists ck_memberships_permissoes_extras;
alter table public.empresa_memberships drop column if exists permissoes_extras;
drop function if exists public.permissoes_codigos_validos(text[]);
commit;
