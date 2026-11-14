-- Migration 012 — permissões individuais por vínculo (D-032).
-- Autorizada pelo Platform Owner em 2026-11-14 ("Implemente a recomendação aprovada":
-- opção A de docs/planning/PERMISSOES_POR_PAPEL.md).
--
-- O que muda:
-- 1. empresa_memberships.permissoes_extras: permissões ACRESCENTADAS ao padrão do papel
--    (nunca retiram). O catálogo e o padrão de cada papel ficam no backend
--    (backend/src/auth/permissoes.js); aqui o banco garante só o formato 'grupo:acao'.
-- 2. membership_permissao_eventos: trilha imutável de quem concedeu ou revogou o quê, para
--    quem e quando (reusa public.ledger_imutavel da 009).
-- 3. membership_permissoes_definir: grava as permissões e os eventos numa transação só.
--    Os limites de autoridade (quem pode conceder o quê) são decididos no backend.
begin;

-- 1. Formato do código: 'grupo:acao' em minúsculas; no máximo 64 por vínculo.
create or replace function public.permissoes_codigos_validos(p text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(cardinality(p), 0) <= 64
     and coalesce((select bool_and(c is not null and c ~ '^[a-z_]+:[a-z_]+$') from unnest(p) as c), true)
$$;

alter table public.empresa_memberships
  add column if not exists permissoes_extras text[] not null default '{}'::text[];
alter table public.empresa_memberships drop constraint if exists ck_memberships_permissoes_extras;
alter table public.empresa_memberships
  add constraint ck_memberships_permissoes_extras check (public.permissoes_codigos_validos(permissoes_extras));

-- 2. Trilha imutável. Sem cascade: apagar um vínculo com histórico é bloqueado (vínculos
--    se desativam, não se apagam).
create table if not exists public.membership_permissao_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  membership_id uuid not null references public.empresa_memberships(id),
  alvo_user_id uuid not null references public.app_users(id),
  actor_id uuid not null references public.app_users(id),
  acao text not null check (acao in ('conceder', 'revogar')),
  permissao text not null check (permissao ~ '^[a-z_]+:[a-z_]+$'),
  created_at timestamptz not null default now()
);
create index if not exists ix_membership_permissao_eventos_membership
  on public.membership_permissao_eventos (empresa_id, membership_id, created_at);

drop trigger if exists trg_ledger_imutavel on public.membership_permissao_eventos;
create trigger trg_ledger_imutavel before update or delete on public.membership_permissao_eventos
  for each row execute function public.ledger_imutavel();

-- 3. Definir as permissões de um vínculo (substitui a lista) e registrar a diferença.
create or replace function public.membership_permissoes_definir(
  p_empresa_id uuid,
  p_membership_id uuid,
  p_actor_id uuid,
  p_permissoes text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.empresa_memberships%rowtype;
  v_novas text[];
  v_add text[];
  v_rem text[];
begin
  if p_actor_id is null then
    raise exception 'permissões: ator obrigatório' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.empresa_memberships
                 where empresa_id = p_empresa_id and user_id = p_actor_id and status = 'ativo') then
    raise exception 'permissões: ator sem vínculo ativo na empresa' using errcode = 'P0001';
  end if;

  select * into v_m from public.empresa_memberships
   where id = p_membership_id and empresa_id = p_empresa_id
   for update;
  if not found then
    raise exception 'permissões: vínculo não encontrado na empresa' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct c order by c), '{}'::text[]) into v_novas
    from unnest(coalesce(p_permissoes, '{}'::text[])) as c;
  if not public.permissoes_codigos_validos(v_novas) then
    raise exception 'permissões: código inválido' using errcode = '22023';
  end if;

  select coalesce(array_agg(c order by c), '{}'::text[]) into v_add
    from unnest(v_novas) as c where not (c = any (v_m.permissoes_extras));
  select coalesce(array_agg(c order by c), '{}'::text[]) into v_rem
    from unnest(v_m.permissoes_extras) as c where not (c = any (v_novas));

  update public.empresa_memberships
     set permissoes_extras = v_novas, updated_at = now()
   where id = v_m.id;

  insert into public.membership_permissao_eventos (empresa_id, membership_id, alvo_user_id, actor_id, acao, permissao)
  select p_empresa_id, v_m.id, v_m.user_id, p_actor_id, 'conceder', c from unnest(v_add) as c
  union all
  select p_empresa_id, v_m.id, v_m.user_id, p_actor_id, 'revogar', c from unnest(v_rem) as c;

  return jsonb_build_object('permissoes', to_jsonb(v_novas), 'concedidas', to_jsonb(v_add), 'revogadas', to_jsonb(v_rem));
end;
$$;

-- 4. Acesso (padrão 007/010): nada para anon/authenticated; só o backend (service_role).
revoke all on table public.membership_permissao_eventos from public, anon, authenticated;
alter table public.membership_permissao_eventos enable row level security;
revoke update, delete, truncate on table public.membership_permissao_eventos from service_role;
grant select, insert on table public.membership_permissao_eventos to service_role;

revoke all on function public.permissoes_codigos_validos(text[]) from public, anon, authenticated;
grant execute on function public.permissoes_codigos_validos(text[]) to service_role;
revoke all on function public.membership_permissoes_definir(uuid, uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.membership_permissoes_definir(uuid, uuid, uuid, text[]) to service_role;

commit;
