-- Migration 025 — Política de sugestão de horários e faixa de horário da lista de espera (D-054).
-- Autorizada pelo Platform Owner em 2026-11-17 ("Autorizo migração"; escopo escolhido: política
-- de horários + lista de espera compatível com faixa). Aplica em produção só no merge.
--
--   empresas.agenda_politica   como a agenda sugere horários (null = como antes: a recepção vê
--                              primeiro os encaixes ideais e o link mostra todos os livres)
--       'flexivel'    oferece todo horário livre (recepção e link)
--       'equilibrada' só horários que não deixam sobra inútil (menor que o menor serviço)
--       'compacta'    só os encaixes ideais: encostam em outro horário e deixam a menor sobra
--     A recepção sempre pode ver todos e escolher qualquer um (o servidor revalida conflito).
--   lista_espera.faixa_inicio / faixa_fim  faixa de horário preferida do cliente (ambos ou nenhum)
-- Nada aqui é lido pelo cliente direto: só o backend, com service_role.
begin;

alter table public.empresas add column if not exists agenda_politica text null;
alter table public.lista_espera add column if not exists faixa_inicio time null;
alter table public.lista_espera add column if not exists faixa_fim time null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_agenda_politica_valida') then
    alter table public.empresas add constraint empresas_agenda_politica_valida check (
      agenda_politica is null or agenda_politica in ('flexivel', 'equilibrada', 'compacta'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lista_espera_faixa_valida') then
    alter table public.lista_espera add constraint lista_espera_faixa_valida check (
      (faixa_inicio is null and faixa_fim is null)
      or (faixa_inicio is not null and faixa_fim is not null and faixa_inicio < faixa_fim));
  end if;
end $$;

commit;
