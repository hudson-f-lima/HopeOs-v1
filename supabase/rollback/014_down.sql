-- Rollback da migration 014 (D-034): volta as duas funções auxiliares ao search_path da sessão.
begin;
alter function public.disponibilidade_janela_legada(jsonb) reset search_path;
alter function public.disponibilidade_hora(int) reset search_path;
commit;
