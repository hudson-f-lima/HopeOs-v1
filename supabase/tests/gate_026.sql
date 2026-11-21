-- Gate SQL da migration 026 (escala e reserva sem corrida, D-058). Transação desfeita no final.
\set ON_ERROR_STOP 1
begin;
set local client_min_messages = warning;

create function pg_temp.erro_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

insert into empresas (id, nome) values ('e2600000-0000-4000-8000-00000000000a', 'Empresa A');
insert into app_users (id, email, nome) values ('c2600000-0000-4000-8000-0000000000a1', 'gate026@t', 'Gate');
insert into profissionais (id, empresa_id, nome) values ('a2600000-0000-4000-8000-0000000000a1', 'e2600000-0000-4000-8000-00000000000a', 'Ana');
insert into servicos (id, empresa_id, nome, valor_centavos, duracao_min) values
  ('b2600000-0000-4000-8000-0000000000a1', 'e2600000-0000-4000-8000-00000000000a', 'Corte', 5000, 30);

create function pg_temp.reservar(p_hora text, p_versao text) returns text language plpgsql as $$
begin
  perform agendamento_criar('e2600000-0000-4000-8000-00000000000a',
    jsonb_build_object('profissional_id', 'a2600000-0000-4000-8000-0000000000a1', 'servico_id', 'b2600000-0000-4000-8000-0000000000a1',
      'data', '2030-01-10', 'horario', p_hora, 'duracao_min', 30)
    || case when p_versao is null then '{}'::jsonb else jsonb_build_object('disp_versao', p_versao) end,
    false, null, null);
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- 1. Versão em dia (0: nenhuma mudança de escala ainda) grava; sem versão também (como antes).
do $$ begin
  if pg_temp.reservar('09:00', '0') is not null then raise exception 'gate_026 bloco 1: versão em dia recusada'; end if;
  if pg_temp.reservar('10:00', null) is not null then raise exception 'gate_026 bloco 1: sem versão recusada'; end if;
end $$;

-- 2. A escala muda (novo evento, seq 1): a versão lida antes (0) é recusada com HS412 e nada é gravado.
insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id)
  values ('e2600000-0000-4000-8000-00000000000a', 'c2600000-0000-4000-8000-0000000000a1', 'excecao_criar', 'a2600000-0000-4000-8000-0000000000a1');
do $$ declare r text; begin
  r := pg_temp.reservar('11:00', '0');
  if r is null or r not like 'HS412%ESCALA_MUDOU%' then raise exception 'gate_026 bloco 2: versão velha aceita (%)', r; end if;
  if exists (select 1 from agendamentos where empresa_id = 'e2600000-0000-4000-8000-00000000000a' and horario = '11:00') then
    raise exception 'gate_026 bloco 2: gravou com a versão velha';
  end if;
  -- Controle negativo: com a versão nova, o mesmo pedido grava.
  if pg_temp.reservar('11:00', '1') is not null then raise exception 'gate_026 bloco 2: versão nova recusada'; end if;
end $$;

-- 3. Conflito de horário continua sendo HS409 (a ordem das conferências não mudou).
do $$ declare r text; begin
  r := pg_temp.reservar('11:00', '1');
  if r is null or r not like 'HS409%' then raise exception 'gate_026 bloco 3: conflito não detectado (%)', r; end if;
end $$;

-- 4. Acesso: só service_role executa.
do $$ begin
  if has_function_privilege('anon', 'public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.agendamento_criar(uuid, jsonb, boolean, uuid, uuid)', 'execute') then
    raise exception 'gate_026 bloco 4: função exposta';
  end if;
end $$;

rollback;
\echo 'gate_026 OK'
