-- Gate SQL da migration 024 (regras da agenda, D-049). Transação desfeita no final.
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

insert into empresas (id, nome) values ('e2400000-0000-4000-8000-00000000000a', 'Empresa A');
insert into servicos (id, empresa_id, nome, valor_centavos, duracao_min) values
  ('b2400000-0000-4000-8000-0000000000a1', 'e2400000-0000-4000-8000-00000000000a', 'Química', 20000, 120);

-- 1. Padrões: nada muda para quem não configurar (sem limite na recepção, alerta de atraso 15 min,
--    serviço herda os prazos do salão).
do $$ declare e record; s record; begin
  select * into e from empresas where id = 'e2400000-0000-4000-8000-00000000000a';
  select * into s from servicos where id = 'b2400000-0000-4000-8000-0000000000a1';
  if e.agenda_janela_dias_recepcao is not null or e.agenda_max_futuros_recepcao is not null or e.agenda_intervalo_min_dias is not null
     or e.agenda_atraso_alerta_min <> 15 or s.antecedencia_min_online is not null or s.cancelamento_prazo_min is not null then
    raise exception 'gate_024 bloco 1: padrões errados';
  end if;
end $$;

-- 2. Faixas: fora delas é recusado; dentro, grava.
do $$ begin
  if pg_temp.erro_de($q$update empresas set agenda_janela_dias_recepcao = 0 where id = 'e2400000-0000-4000-8000-00000000000a'$q$) is null
     or pg_temp.erro_de($q$update empresas set agenda_max_futuros_recepcao = 51 where id = 'e2400000-0000-4000-8000-00000000000a'$q$) is null
     or pg_temp.erro_de($q$update empresas set agenda_intervalo_min_dias = 181 where id = 'e2400000-0000-4000-8000-00000000000a'$q$) is null
     or pg_temp.erro_de($q$update empresas set agenda_atraso_alerta_min = -1 where id = 'e2400000-0000-4000-8000-00000000000a'$q$) is null
     or pg_temp.erro_de($q$update servicos set cancelamento_prazo_min = 10081 where id = 'b2400000-0000-4000-8000-0000000000a1'$q$) is null
     or pg_temp.erro_de($q$update servicos set antecedencia_min_online = -5 where id = 'b2400000-0000-4000-8000-0000000000a1'$q$) is null then
    raise exception 'gate_024 bloco 2: valor fora da faixa aceito';
  end if;
  update empresas set agenda_janela_dias_recepcao = 90, agenda_max_futuros_recepcao = 4, agenda_intervalo_min_dias = 7, agenda_atraso_alerta_min = 0
   where id = 'e2400000-0000-4000-8000-00000000000a';
  update servicos set cancelamento_prazo_min = 2880, antecedencia_min_online = 1440 where id = 'b2400000-0000-4000-8000-0000000000a1';
end $$;

-- 3. Acesso: anon e authenticated não leem empresas nem serviços (padrão 007).
do $$ begin
  if has_table_privilege('anon', 'empresas', 'select') or has_table_privilege('authenticated', 'servicos', 'select') then
    raise exception 'gate_024 bloco 3: tabela exposta';
  end if;
end $$;

rollback;
\echo 'gate_024 OK'
