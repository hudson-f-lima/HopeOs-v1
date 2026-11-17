-- Gate SQL da migration 025 (política de horários e faixa da lista de espera, D-054).
-- Transação desfeita no final.
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

insert into empresas (id, nome) values ('e2500000-0000-4000-8000-00000000000a', 'Empresa A');
insert into clientes (id, empresa_id, nome) values ('c2500000-0000-4000-8000-0000000000a1', 'e2500000-0000-4000-8000-00000000000a', 'Cliente');
insert into servicos (id, empresa_id, nome, valor_centavos, duracao_min) values
  ('b2500000-0000-4000-8000-0000000000a1', 'e2500000-0000-4000-8000-00000000000a', 'Corte', 5000, 30);
insert into lista_espera (id, empresa_id, cliente_id, servico_id) values
  ('a2500000-0000-4000-8000-0000000000a1', 'e2500000-0000-4000-8000-00000000000a', 'c2500000-0000-4000-8000-0000000000a1', 'b2500000-0000-4000-8000-0000000000a1');

-- 1. Padrões: nada muda para quem não configurar (sem política, espera sem faixa).
do $$ declare e record; l record; begin
  select * into e from empresas where id = 'e2500000-0000-4000-8000-00000000000a';
  select * into l from lista_espera where id = 'a2500000-0000-4000-8000-0000000000a1';
  if e.agenda_politica is not null or l.faixa_inicio is not null or l.faixa_fim is not null then
    raise exception 'gate_025 bloco 1: padrões errados';
  end if;
end $$;

-- 2. Valores: política fora da lista e faixa pela metade ou invertida são recusadas.
do $$ begin
  if pg_temp.erro_de($q$update empresas set agenda_politica = 'agressiva' where id = 'e2500000-0000-4000-8000-00000000000a'$q$) is null
     or pg_temp.erro_de($q$update lista_espera set faixa_inicio = '09:00' where id = 'a2500000-0000-4000-8000-0000000000a1'$q$) is null
     or pg_temp.erro_de($q$update lista_espera set faixa_inicio = '12:00', faixa_fim = '09:00' where id = 'a2500000-0000-4000-8000-0000000000a1'$q$) is null
     or pg_temp.erro_de($q$update lista_espera set faixa_inicio = '09:00', faixa_fim = '09:00' where id = 'a2500000-0000-4000-8000-0000000000a1'$q$) is null then
    raise exception 'gate_025 bloco 2: valor inválido aceito';
  end if;
  update empresas set agenda_politica = 'compacta' where id = 'e2500000-0000-4000-8000-00000000000a';
  update empresas set agenda_politica = null where id = 'e2500000-0000-4000-8000-00000000000a';
  update lista_espera set faixa_inicio = '08:00', faixa_fim = '12:00' where id = 'a2500000-0000-4000-8000-0000000000a1';
end $$;

-- 3. Acesso: anon e authenticated não leem empresas nem a lista de espera (padrão 007).
do $$ begin
  if has_table_privilege('anon', 'empresas', 'select') or has_table_privilege('authenticated', 'lista_espera', 'select')
     or has_table_privilege('anon', 'lista_espera', 'select') then
    raise exception 'gate_025 bloco 3: tabela exposta';
  end if;
end $$;

rollback;
\echo 'gate_025 OK'
