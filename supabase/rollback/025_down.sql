-- Rollback da migration 025 (D-054): sem política de sugestão (volta ao comportamento anterior)
-- e sem faixa de horário na lista de espera.
begin;
alter table public.lista_espera drop constraint if exists lista_espera_faixa_valida;
alter table public.empresas drop constraint if exists empresas_agenda_politica_valida;
alter table public.lista_espera drop column if exists faixa_fim, drop column if exists faixa_inicio;
alter table public.empresas drop column if exists agenda_politica;
commit;
