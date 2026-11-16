-- Gate SQL da migration 019 (atendimento com vários serviços, D-040). Transação desfeita no final.
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

insert into empresas (id, nome, buffer_min) values ('e1900000-0000-4000-8000-00000000000a', 'A', 10), ('e1900000-0000-4000-8000-00000000000b', 'B', 0);
insert into clientes (id, empresa_id, nome) values ('c1900000-0000-4000-8000-0000000000a1', 'e1900000-0000-4000-8000-00000000000a', 'Cli');
insert into servicos (id, empresa_id, nome) values
  ('b1900000-0000-4000-8000-0000000000a1', 'e1900000-0000-4000-8000-00000000000a', 'Corte'),
  ('b1900000-0000-4000-8000-0000000000a2', 'e1900000-0000-4000-8000-00000000000a', 'Barba'),
  ('b1900000-0000-4000-8000-0000000000b1', 'e1900000-0000-4000-8000-00000000000b', 'Corte B');
insert into profissionais (id, empresa_id, nome) values
  ('a1900000-0000-4000-8000-0000000000a1', 'e1900000-0000-4000-8000-00000000000a', 'Ana'),
  ('a1900000-0000-4000-8000-0000000000a2', 'e1900000-0000-4000-8000-00000000000a', 'Beto'),
  ('a1900000-0000-4000-8000-0000000000b1', 'e1900000-0000-4000-8000-00000000000b', 'Bia');
-- Beto ocupado 11:00–11:30 (com 10 min de higienização: livre de novo às 11:40).
insert into agendamentos (empresa_id, profissional_id, servico_id, data, horario, duracao_min) values
  ('e1900000-0000-4000-8000-00000000000a', 'a1900000-0000-4000-8000-0000000000a2', 'b1900000-0000-4000-8000-0000000000a2', '2026-12-01', '11:00', 30);

create function pg_temp.etapa(p_prof text, p_serv text, p_hora text, p_dur int, p_data text default '2026-12-01') returns jsonb language sql as $$
  select jsonb_build_object('cliente_id', 'c1900000-0000-4000-8000-0000000000a1', 'profissional_id', p_prof, 'servico_id', p_serv,
                            'data', p_data, 'horario', p_hora, 'duracao_min', p_dur, 'valor_centavos', 1000)
$$;

-- 1. Padrão do limite de espera e faixa.
do $$ begin
  if (select atendimento_espera_max_min from empresas where id = 'e1900000-0000-4000-8000-00000000000a') <> 30 then
    raise exception 'gate_019 bloco 1: padrão errado';
  end if;
  if pg_temp.erro_de($q$update empresas set atendimento_espera_max_min = 241 where id = 'e1900000-0000-4000-8000-00000000000a'$q$) is null
     or pg_temp.erro_de($q$update empresas set atendimento_espera_max_min = -1 where id = 'e1900000-0000-4000-8000-00000000000a'$q$) is null then
    raise exception 'gate_019 bloco 1: limite fora da faixa aceito';
  end if;
end $$;

-- 2. Duas etapas (Ana corte 10:00–10:45, Ana barba 10:45–11:05): grava as duas, ligadas e em
--    ordem, sem exigir higienização entre etapas do mesmo atendimento.
do $$ declare r jsonb; begin
  r := atendimento_criar('e1900000-0000-4000-8000-00000000000a', jsonb_build_array(
    pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a1', '10:00', 45),
    pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a2', '10:45', 20)), null);
  if (select count(*) from agendamentos where grupo_id = (r->>'grupo_id')::uuid) <> 2
     or (select array_agg(grupo_seq order by horario) from agendamentos where grupo_id = (r->>'grupo_id')::uuid) <> array[1, 2]
     or jsonb_array_length(r->'agendamentos') <> 2 then
    raise exception 'gate_019 bloco 2: etapas não gravadas como grupo';
  end if;
end $$;

-- 3. Tudo ou nada: a 2ª etapa conflita (Beto às 11:35 pega a higienização do horário das 11:00)
--    e a 1ª, que estava livre, NÃO fica gravada.
do $$ declare m text; n int; begin
  select count(*) into n from agendamentos where empresa_id = 'e1900000-0000-4000-8000-00000000000a';
  m := pg_temp.erro_de(format($q$select atendimento_criar('e1900000-0000-4000-8000-00000000000a', %L::jsonb, null)$q$, jsonb_build_array(
    pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a1', '14:00', 45),
    pg_temp.etapa('a1900000-0000-4000-8000-0000000000a2', 'b1900000-0000-4000-8000-0000000000a2', '11:35', 20))));
  if m is null or m <> 'SCHEDULE_CONFLICT' then raise exception 'gate_019 bloco 3: conflito não barrado (%)', m; end if;
  if (select count(*) from agendamentos where empresa_id = 'e1900000-0000-4000-8000-00000000000a') <> n then
    raise exception 'gate_019 bloco 3: reserva parcial ficou gravada';
  end if;
  -- Controle: a mesma 2ª etapa às 11:40 (depois da higienização) passa.
  perform atendimento_criar('e1900000-0000-4000-8000-00000000000a', jsonb_build_array(
    pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a1', '14:00', 45),
    pg_temp.etapa('a1900000-0000-4000-8000-0000000000a2', 'b1900000-0000-4000-8000-0000000000a2', '11:40', 20)), null);
end $$;

-- 4. Recusas: etapas sobrepostas no mesmo atendimento, dias diferentes, 0 ou 7 etapas, cadastro
--    de outra empresa.
do $$ declare ruins jsonb[]; x jsonb; begin
  ruins := array[
    jsonb_build_array(pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a1', '16:00', 45),
                      pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a2', '16:30', 20)),
    jsonb_build_array(pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a1', '16:00', 45),
                      pg_temp.etapa('a1900000-0000-4000-8000-0000000000a2', 'b1900000-0000-4000-8000-0000000000a2', '16:45', 20, '2026-12-02')),
    '[]'::jsonb,
    (select jsonb_agg(pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000a1', '08:00', 5)) from generate_series(1, 7)),
    jsonb_build_array(pg_temp.etapa('a1900000-0000-4000-8000-0000000000b1', 'b1900000-0000-4000-8000-0000000000a1', '16:00', 45)),
    jsonb_build_array(pg_temp.etapa('a1900000-0000-4000-8000-0000000000a1', 'b1900000-0000-4000-8000-0000000000b1', '16:00', 45))
  ];
  foreach x in array ruins loop
    if pg_temp.erro_de(format($q$select atendimento_criar('e1900000-0000-4000-8000-00000000000a', %L::jsonb, null)$q$, x)) is null then
      raise exception 'gate_019 bloco 4: aceitou %', x;
    end if;
  end loop;
  if exists (select 1 from agendamentos where empresa_id = 'e1900000-0000-4000-8000-00000000000a' and horario = '16:00') then
    raise exception 'gate_019 bloco 4: recusa deixou etapa gravada';
  end if;
end $$;

-- 5. Acesso: só service_role executa; search_path fixo.
do $$ begin
  if has_function_privilege('anon', 'atendimento_criar(uuid, jsonb, uuid)', 'execute')
     or has_function_privilege('authenticated', 'atendimento_criar(uuid, jsonb, uuid)', 'execute')
     or not has_function_privilege('service_role', 'atendimento_criar(uuid, jsonb, uuid)', 'execute') then
    raise exception 'gate_019 bloco 5: acesso errado';
  end if;
  if not exists (select 1 from pg_proc where proname = 'atendimento_criar' and array_to_string(proconfig, ',') like '%search_path=%') then
    raise exception 'gate_019 bloco 5: função sem search_path fixo';
  end if;
end $$;

rollback;
\echo gate_019 OK (5 blocos)
