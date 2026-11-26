-- Gate SQL da migration 028 ("Cliente chegou" como opção do salão, D-084). Transação desfeita no final.
\set ON_ERROR_STOP 1
begin;
set local client_min_messages = warning;

create function pg_temp.erro_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

insert into empresas (id, nome) values ('e2800000-0000-4000-8000-00000000000a', 'Empresa A');

-- 1. Padrão: nada muda para quem não configurar (o salão usa "Cliente chegou").
do $$ begin
  if (select agenda_usa_chegada from empresas where id = 'e2800000-0000-4000-8000-00000000000a') is distinct from true then
    raise exception 'gate_028 bloco 1: padrão deveria ser true';
  end if;
end $$;

-- 2. Nunca fica sem valor; desligar grava.
do $$ begin
  if pg_temp.erro_de($q$update empresas set agenda_usa_chegada = null where id = 'e2800000-0000-4000-8000-00000000000a'$q$) is null then
    raise exception 'gate_028 bloco 2: null aceito';
  end if;
  update empresas set agenda_usa_chegada = false where id = 'e2800000-0000-4000-8000-00000000000a';
  if (select agenda_usa_chegada from empresas where id = 'e2800000-0000-4000-8000-00000000000a') then
    raise exception 'gate_028 bloco 2: false não gravou';
  end if;
end $$;

-- 3. Acesso: anon e authenticated não leem empresas (padrão 007).
do $$ begin
  if has_table_privilege('anon', 'empresas', 'select') or has_table_privilege('authenticated', 'empresas', 'select') then
    raise exception 'gate_028 bloco 3: tabela exposta';
  end if;
end $$;

rollback;
\echo 'gate_028 OK'
