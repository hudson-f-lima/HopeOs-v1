-- DRAFT ONLY
-- DO NOT EXECUTE
-- NOT APPROVED FOR PRODUCTION
--
-- Especificacao SQL isolada da Fase 1 (Identidade minima).
-- Baseado na decisao documentada em docs/PROJECT_STATE.md e
-- docs/migrations/MIGRATION-007-IDENTITY-MODEL-DRAFT.md.
--
-- Contem apenas:
-- 1. Tabela app_users
-- 2. Trigger auth.users -> app_users

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete restrict,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger de sincronizacao auth.users -> app_users
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
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), 'Usuário sem nome'),
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
