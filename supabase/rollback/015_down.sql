-- Rollback da migration 015 (D-035): apaga os modelos de escala e a função de lote. As escalas e
-- exceções já aplicadas ficam (são cópias, na 013).
begin;
drop function if exists public.disponibilidade_lote(uuid, jsonb, jsonb, uuid, jsonb);
drop table if exists public.escala_modelos;
commit;
