-- Rollback da migration 022 (D-043): tira assinantes, cobranças e usos do plano. As comandas já
-- fechadas continuam como estão (o item coberto foi gravado a R$ 0 pelo fechamento de sempre);
-- só se perde o vínculo "este item foi um uso do plano". Os usos são livro-caixa (triggers de
-- imutabilidade): o rollback os desliga na tabela antes de apagar, e só vale com autorização.
begin;
drop trigger if exists trg_assinatura_usos_devolver on public.comanda_estorno_itens;
drop function if exists public.assinatura_usos_devolver();
drop function if exists public.checkout_close_assinatura(uuid, jsonb, jsonb, jsonb, uuid, uuid);
drop table if exists public.assinatura_usos_estornos;
drop table if exists public.assinatura_usos;
drop table if exists public.assinatura_cobrancas;
drop table if exists public.assinaturas;
drop function if exists public.assinatura_mesma_empresa();
commit;
