-- Rollback da migration 023 (D-047, Onda 1 do D-046): tira a corrente de hash, encurtar e o aceite da
-- escala; o remover volta ao da 013. Os eventos gravados ficam (trilha imutável): as colunas novas
-- saem, e a restrição de ação volta "not valid" para não falhar se já houver encurtar ou aceite.
-- Só vale com autorização do Platform Owner.
begin;
drop trigger if exists trg_disp_eventos_encadear on public.disponibilidade_eventos;
drop trigger if exists trg_ledger_imutavel_truncate on public.disponibilidade_eventos;
drop function if exists public.disponibilidade_evento_encadear();
drop function if exists public.disponibilidade_cadeia_conferir(uuid);
drop function if exists public.disponibilidade_cadeia_base(uuid);
drop function if exists public.disponibilidade_evento_texto(public.disponibilidade_eventos);
drop function if exists public.disponibilidade_excecao_encurtar(uuid, uuid, date, date, time, time, uuid);
drop function if exists public.disponibilidade_escala_aceitar(uuid, uuid, uuid, uuid);

create or replace function public.disponibilidade_excecao_remover(
  p_empresa_id uuid, p_id uuid, p_actor_id uuid, p_decisoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row disponibilidade_excecoes%rowtype;
begin
  if p_actor_id is null or not exists (select 1 from empresa_memberships where empresa_id = p_empresa_id and user_id = p_actor_id and status = 'ativo') then
    raise exception 'disponibilidade: ator sem vínculo ativo na empresa' using errcode = 'P0001';
  end if;
  perform 1 from empresas where id = p_empresa_id for update;
  delete from disponibilidade_excecoes where id = p_id and empresa_id = p_empresa_id returning * into v_row;
  if not found then raise exception 'disponibilidade: exceção não encontrada na empresa' using errcode = 'P0002'; end if;
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, antes, depois, decisoes)
  values (p_empresa_id, p_actor_id, 'excecao_remover', v_row.profissional_id, jsonb_build_array(to_jsonb(v_row) - 'empresa_id'), '[]'::jsonb, coalesce(p_decisoes, '[]'::jsonb));
  return jsonb_build_object('removida', to_jsonb(v_row) - 'empresa_id');
end $$;
revoke all on function public.disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb) to service_role;
drop function if exists public.disponibilidade_excecao_do_profissional(uuid, public.disponibilidade_excecoes);
drop function if exists public.disponibilidade_ator_e_o_profissional(uuid, uuid, uuid);

drop index if exists public.ux_disp_eventos_seq;
drop index if exists public.ix_disp_eventos_prof;
alter table public.disponibilidade_eventos drop constraint if exists ck_disp_eventos_origem;
alter table public.disponibilidade_eventos drop constraint if exists ck_disp_eventos_acao;
alter table public.disponibilidade_eventos add constraint disponibilidade_eventos_acao_check
  check (acao in ('semanal_definir', 'excecao_criar', 'excecao_remover')) not valid;
alter table public.disponibilidade_eventos drop column if exists hash;
alter table public.disponibilidade_eventos drop column if exists hash_anterior;
alter table public.disponibilidade_eventos drop column if exists seq;
alter table public.disponibilidade_eventos drop column if exists origem;
commit;
