-- Rollback da migration 027 (D-063): remove as duas RPCs, o índice e a normalização do número.
-- O backend volta sozinho ao caminho anterior (PGRST202/42883 = função ausente).
begin;
drop function if exists public.agendamento_remarcar(uuid, uuid, text[], jsonb, boolean, uuid);
drop function if exists public.agendamento_publico_criar(uuid, text, uuid, jsonb, jsonb, jsonb);
drop index if exists public.idx_clientes_empresa_chave_numero;
drop function if exists public.chave_numero_br(text);
commit;
