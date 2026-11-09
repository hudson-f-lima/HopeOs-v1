-- Rollback da migration 009 (estorno de comanda, D-013). Ordem inversa.
-- RECUSA rodar se existir estorno ou devolução de estoque gravados: ledger não se
-- apaga. Com estornos em produção, o rollback é do backend (desligar a rota), não do banco.
-- RLS e revogações de anon/authenticated das tabelas antigas não são desfeitas.

begin;

do $$ begin
  if to_regclass('public.comanda_estornos') is not null and exists (select 1 from public.comanda_estornos) then
    raise exception 'rollback 009 recusado: há estornos gravados (ledger não se apaga)';
  end if;
  if exists (select 1 from public.produto_estoque_movimentos where tipo = 'devolucao') then
    raise exception 'rollback 009 recusado: há devoluções de estoque gravadas';
  end if;
  if exists (select 1 from public.caixa_movimentos where tipo = 'estorno_pagamento') then
    raise exception 'rollback 009 recusado: há estornos no caixa';
  end if;
end $$;

drop function if exists public.comanda_estornar(uuid, uuid, jsonb, uuid);
drop function if exists public.comanda_estorno_resumo(uuid);

do $$
declare t text;
begin
  foreach t in array array[
    'comandos', 'comando_itens', 'comando_pagamentos', 'comando_gorjetas', 'caixa_movimentos',
    'produto_estoque_movimentos', 'comanda_estornos', 'comanda_estorno_itens',
    'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_ledger_imutavel on public.%I', t);
      execute format('drop trigger if exists trg_ledger_imutavel_truncate on public.%I', t);
    end if;
  end loop;
end $$;
drop function if exists public.ledger_imutavel();

drop table if exists comanda_estorno_gorjetas;
drop table if exists comanda_estorno_pagamentos;
drop table if exists comanda_estorno_itens;
drop table if exists comanda_estornos;

alter table caixa_movimentos drop constraint if exists caixa_movimentos_estorno_negativo;
alter table produto_estoque_movimentos drop constraint if exists produto_estoque_movimentos_tipo_check;
alter table produto_estoque_movimentos add constraint produto_estoque_movimentos_tipo_check
  check (tipo in ('entrada', 'venda', 'ajuste', 'perda'));

commit;
