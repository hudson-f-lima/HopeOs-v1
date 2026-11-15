-- Migration 015 — escalas em lote e modelos de escala (D-035, Onda 2 da D-033).
-- Autorizada pelo Platform Owner em 2026-11-15: o desenho aprovado da D-033
-- (docs/planning/DISPONIBILIDADE_ESCALAS.md, "Todas as recomendações aprovadas") já previa
-- `escala_modelos`, e o dono mandou "escalar a onda 2". Aplica em produção só no merge.
--
-- 1. escala_modelos: períodos por dia da semana, reutilizáveis. Aplicar um modelo COPIA as regras
--    (disponibilidade_semanal ou exceções); mudar o modelo depois não altera o que foi aplicado.
--    Modelo não se apaga: arquiva-se.
-- 2. disponibilidade_lote: aplica várias escalas semanais e exceções numa transação só (tudo ou
--    nada), pelas mesmas funções da 013, que conferem empresa e ator e gravam a trilha imutável.
begin;

create table if not exists public.escala_modelos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  conteudo jsonb not null default '[]'::jsonb check (jsonb_typeof(conteudo) = 'array' and jsonb_array_length(conteudo) <= 100),
  arquivado_em timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.app_users(id)
);
create unique index if not exists ux_escala_modelos_nome_ativo
  on public.escala_modelos (empresa_id, lower(btrim(nome))) where arquivado_em is null;

create or replace function public.disponibilidade_lote(
  p_empresa_id uuid, p_semanais jsonb, p_excecoes jsonb, p_actor_id uuid, p_decisoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; v_n int := 0; v_total int; v_chunk jsonb; i int := 0;
begin
  if p_semanais is null or jsonb_typeof(p_semanais) <> 'array' or p_excecoes is null or jsonb_typeof(p_excecoes) <> 'array' then
    raise exception 'disponibilidade: lote inválido' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_excecoes);
  if jsonb_array_length(p_semanais) + v_total = 0 or jsonb_array_length(p_semanais) > 100 or v_total > 2000 then
    raise exception 'disponibilidade: lote vazio ou grande demais' using errcode = '22023';
  end if;
  for x in select e from jsonb_array_elements(p_semanais) as e loop
    perform disponibilidade_semanal_definir(p_empresa_id, nullif(x->>'profissionalId', '')::uuid, x->'periodos',
      coalesce((x->>'publicar')::boolean, false), p_actor_id, p_decisoes);
    v_n := v_n + 1;
  end loop;
  while i < v_total loop
    select jsonb_agg(e order by o) into v_chunk
      from jsonb_array_elements(p_excecoes) with ordinality as t(e, o) where o > i and o <= i + 50;
    perform disponibilidade_excecoes_criar(p_empresa_id, v_chunk, p_actor_id, p_decisoes);
    i := i + 50;
  end loop;
  return jsonb_build_object('semanais', v_n, 'excecoes', v_total);
end $$;

-- Acesso (padrão 007/010/012/013): nada para anon/authenticated. O backend lê e grava modelos
-- (sem apagar) e chama o lote; escala de verdade só pelas funções com trilha.
revoke all on table public.escala_modelos from public, anon, authenticated;
alter table public.escala_modelos enable row level security;
grant select, insert, update on table public.escala_modelos to service_role;
revoke delete, truncate on table public.escala_modelos from service_role;

revoke all on function public.disponibilidade_lote(uuid, jsonb, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.disponibilidade_lote(uuid, jsonb, jsonb, uuid, jsonb) to service_role;

commit;
