-- Rollback da migration 010 (pagamento de comissão e fechamento de caixa, D-017).
-- RECUSA rodar se houver qualquer lançamento gravado: histórico financeiro não se
-- apaga. Com dados em produção, o rollback é do backend (desligar as rotas).

begin;

do $$
declare t text; n bigint;
begin
  foreach t in array array['comissao_pagamentos', 'caixa_ajustes', 'caixa_fechamentos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then raise exception 'rollback 010 recusado: há % linha(s) em %', n, t; end if;
    end if;
  end loop;
end $$;

drop table if exists caixa_fechamentos;
drop table if exists caixa_ajustes;
drop table if exists comissao_pagamentos;
drop function if exists public.comissao_pagamentos_valida();

commit;
