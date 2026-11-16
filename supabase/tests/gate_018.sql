-- Gate SQL da migration 018 (recorrência, D-039). Transação desfeita no final.
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

insert into empresas (id, nome) values ('e1800000-0000-4000-8000-00000000000a', 'A'), ('e1800000-0000-4000-8000-00000000000b', 'B');
insert into clientes (id, empresa_id, nome) values
  ('c1800000-0000-4000-8000-0000000000a1', 'e1800000-0000-4000-8000-00000000000a', 'Cli A'),
  ('c1800000-0000-4000-8000-0000000000b1', 'e1800000-0000-4000-8000-00000000000b', 'Cli B');
insert into servicos (id, empresa_id, nome) values
  ('b1800000-0000-4000-8000-0000000000a1', 'e1800000-0000-4000-8000-00000000000a', 'Corte'),
  ('b1800000-0000-4000-8000-0000000000b1', 'e1800000-0000-4000-8000-00000000000b', 'Corte B');
insert into profissionais (id, empresa_id, nome) values
  ('a1800000-0000-4000-8000-0000000000a1', 'e1800000-0000-4000-8000-00000000000a', 'Ana'),
  ('a1800000-0000-4000-8000-0000000000b1', 'e1800000-0000-4000-8000-00000000000b', 'Bia');

-- 1. Série válida e ocorrência marcada com serie_id/serie_seq.
do $$ begin
  insert into agendamento_series (id, empresa_id, cliente_id, servico_id, profissional_id, frequencia, horario, duracao_min, data_inicio, ocorrencias)
  values ('f1800000-0000-4000-8000-0000000000a1', 'e1800000-0000-4000-8000-00000000000a', 'c1800000-0000-4000-8000-0000000000a1',
          'b1800000-0000-4000-8000-0000000000a1', 'a1800000-0000-4000-8000-0000000000a1', 'semanal', '10:00', 30, '2026-12-01', 8);
  insert into agendamentos (id, empresa_id, data, horario, serie_id, serie_seq)
  values ('d1800000-0000-4000-8000-0000000000a1', 'e1800000-0000-4000-8000-00000000000a', '2026-12-01', '10:00', 'f1800000-0000-4000-8000-0000000000a1', 1);
  if (select status from agendamento_series where id = 'f1800000-0000-4000-8000-0000000000a1') <> 'ativa' then
    raise exception 'gate_018 bloco 1: status padrão errado';
  end if;
end $$;

-- 2. Faixas: frequência, ocorrências, duração e seq.
do $$ begin
  if pg_temp.erro_de($q$insert into agendamento_series (empresa_id, cliente_id, servico_id, profissional_id, frequencia, horario, duracao_min, data_inicio, ocorrencias)
       values ('e1800000-0000-4000-8000-00000000000a', 'c1800000-0000-4000-8000-0000000000a1', 'b1800000-0000-4000-8000-0000000000a1', 'a1800000-0000-4000-8000-0000000000a1', 'diaria', '10:00', 30, '2026-12-01', 8)$q$) is null
     or pg_temp.erro_de($q$insert into agendamento_series (empresa_id, cliente_id, servico_id, profissional_id, frequencia, horario, duracao_min, data_inicio, ocorrencias)
       values ('e1800000-0000-4000-8000-00000000000a', 'c1800000-0000-4000-8000-0000000000a1', 'b1800000-0000-4000-8000-0000000000a1', 'a1800000-0000-4000-8000-0000000000a1', 'semanal', '10:00', 30, '2026-12-01', 53)$q$) is null
     or pg_temp.erro_de($q$insert into agendamento_series (empresa_id, cliente_id, servico_id, profissional_id, frequencia, horario, duracao_min, data_inicio, ocorrencias)
       values ('e1800000-0000-4000-8000-00000000000a', 'c1800000-0000-4000-8000-0000000000a1', 'b1800000-0000-4000-8000-0000000000a1', 'a1800000-0000-4000-8000-0000000000a1', 'semanal', '10:00', 30, '2026-12-01', 1)$q$) is null
     or pg_temp.erro_de($q$update agendamentos set serie_seq = 53 where id = 'd1800000-0000-4000-8000-0000000000a1'$q$) is null
     or pg_temp.erro_de($q$update agendamentos set serie_seq = null where id = 'd1800000-0000-4000-8000-0000000000a1'$q$) is null then
    raise exception 'gate_018 bloco 2: valor fora da faixa aceito';
  end if;
end $$;

-- 3. Nada cruza empresa: série com cliente/serviço/profissional de B, ocorrência de B na série de A.
do $$ begin
  if pg_temp.erro_de($q$insert into agendamento_series (empresa_id, cliente_id, servico_id, profissional_id, frequencia, horario, duracao_min, data_inicio, ocorrencias)
       values ('e1800000-0000-4000-8000-00000000000a', 'c1800000-0000-4000-8000-0000000000b1', 'b1800000-0000-4000-8000-0000000000a1', 'a1800000-0000-4000-8000-0000000000a1', 'semanal', '10:00', 30, '2026-12-01', 8)$q$) is null
     or pg_temp.erro_de($q$insert into agendamento_series (empresa_id, cliente_id, servico_id, profissional_id, frequencia, horario, duracao_min, data_inicio, ocorrencias)
       values ('e1800000-0000-4000-8000-00000000000a', 'c1800000-0000-4000-8000-0000000000a1', 'b1800000-0000-4000-8000-0000000000a1', 'a1800000-0000-4000-8000-0000000000b1', 'semanal', '10:00', 30, '2026-12-01', 8)$q$) is null then
    raise exception 'gate_018 bloco 3: série com referência de outra empresa aceita';
  end if;
  if pg_temp.erro_de($q$insert into agendamentos (empresa_id, data, horario, serie_id, serie_seq)
       values ('e1800000-0000-4000-8000-00000000000b', '2026-12-08', '10:00', 'f1800000-0000-4000-8000-0000000000a1', 2)$q$) is null then
    raise exception 'gate_018 bloco 3: ocorrência de B na série de A aceita';
  end if;
end $$;

-- 4. Agendamento comum (sem série) continua como sempre (controle: nada mudou para quem não usa).
do $$ begin
  insert into agendamentos (empresa_id, data, horario) values ('e1800000-0000-4000-8000-00000000000b', '2026-12-08', '11:00');
end $$;

-- 5. Acesso: só service_role; ninguém apaga série; função com search_path fixo.
do $$ begin
  if has_table_privilege('anon', 'agendamento_series', 'select') or has_table_privilege('authenticated', 'agendamento_series', 'select')
     or has_table_privilege('service_role', 'agendamento_series', 'delete') or not has_table_privilege('service_role', 'agendamento_series', 'update') then
    raise exception 'gate_018 bloco 5: grants errados';
  end if;
  if not exists (select 1 from pg_proc where proname = 'agendamento_series_mesma_empresa' and array_to_string(proconfig, ',') like '%search_path=%') then
    raise exception 'gate_018 bloco 5: função sem search_path fixo';
  end if;
end $$;

rollback;
\echo gate_018 OK (5 blocos)
