-- Migration 014 — search_path fixo nas funções auxiliares da 013 (D-034).
-- Autorizada pelo Platform Owner em 2026-11-15 ("1. Autorizado"), para fechar o aviso
-- function_search_path_mutable do advisor de segurança do Supabase. As duas funções só servem à
-- conversão dos horários antigos (disponibilidade_converter_legado) e ninguém de fora as executa;
-- fixar o search_path impede que um objeto homônimo em outro schema mude o que elas chamam.
begin;

alter function public.disponibilidade_janela_legada(jsonb) set search_path = pg_catalog, public;
alter function public.disponibilidade_hora(int) set search_path = pg_catalog, public;

commit;
