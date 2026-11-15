-- Rollback da migration 013 (disponibilidade e escalas, D-033). Apaga regras, exceções e a
-- trilha; o cálculo volta a depender do código anterior (horario_por_dia, que não é apagado).
begin;
drop function if exists public.disponibilidade_semanal_definir(uuid, uuid, jsonb, boolean, uuid, jsonb);
drop function if exists public.disponibilidade_excecoes_criar(uuid, jsonb, uuid, jsonb);
drop function if exists public.disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb);
drop function if exists public.disponibilidade_converter_legado();
drop function if exists public.disponibilidade_janela_legada(jsonb);
drop function if exists public.disponibilidade_hora(int);
drop table if exists public.disponibilidade_eventos;
drop table if exists public.disponibilidade_excecoes;
drop table if exists public.disponibilidade_semanal;
alter table public.profissionais drop column if exists escala_publicada_por;
alter table public.profissionais drop column if exists escala_publicada_em;
commit;
