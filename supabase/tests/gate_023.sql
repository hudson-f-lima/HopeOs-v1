-- Gate SQL da migration 023 (D-046, Onda 1: prova de autonomia). Transação desfeita no final.
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

insert into empresas (id, nome) values ('e2300000-0000-4000-8000-00000000000a', 'Empresa A'), ('e2300000-0000-4000-8000-00000000000b', 'Empresa B');
insert into profissionais (id, empresa_id, nome, horario) values
  ('a2300000-0000-4000-8000-0000000000a1', 'e2300000-0000-4000-8000-00000000000a', 'Ana', '{}'),
  ('a2300000-0000-4000-8000-0000000000a2', 'e2300000-0000-4000-8000-00000000000a', 'Bia', '{}');
insert into app_users (id, email, nome) values
  ('c2300000-0000-4000-8000-0000000000a1', 'adm@t', 'Admin'),
  ('c2300000-0000-4000-8000-0000000000a2', 'ana@t', 'Ana'),
  ('c2300000-0000-4000-8000-0000000000b1', 'admb@t', 'Admin B');
insert into empresa_memberships (id, empresa_id, user_id, role, profissional_id) values
  ('d2300000-0000-4000-8000-0000000000a1', 'e2300000-0000-4000-8000-00000000000a', 'c2300000-0000-4000-8000-0000000000a1', 'admin', null),
  ('d2300000-0000-4000-8000-0000000000a2', 'e2300000-0000-4000-8000-00000000000a', 'c2300000-0000-4000-8000-0000000000a2', 'profissional', 'a2300000-0000-4000-8000-0000000000a1'),
  ('d2300000-0000-4000-8000-0000000000b1', 'e2300000-0000-4000-8000-00000000000b', 'c2300000-0000-4000-8000-0000000000b1', 'admin', null);

-- Um evento de "antes da 023" (sem seq): é o elo zero da corrente.
alter table disponibilidade_eventos disable trigger trg_disp_eventos_encadear;
insert into disponibilidade_eventos (id, empresa_id, actor_id, acao, profissional_id, depois, created_at)
values ('f2300000-0000-4000-8000-000000000001', 'e2300000-0000-4000-8000-00000000000a', 'c2300000-0000-4000-8000-0000000000a1', 'excecao_criar',
        'a2300000-0000-4000-8000-0000000000a1', '[{"tipo": "bloqueio"}]', '2026-01-01 10:00:00+00');
alter table disponibilidade_eventos enable trigger trg_disp_eventos_encadear;

-- 1. Encadeamento: seq, elo, origem e hora do servidor.
do $$
declare r jsonb; e1 disponibilidade_eventos%rowtype; e2 disponibilidade_eventos%rowtype; e3 disponibilidade_eventos%rowtype;
begin
  -- Ana bloqueia o próprio horário; a gestão bloqueia para ela.
  r := disponibilidade_excecoes_criar('e2300000-0000-4000-8000-00000000000a',
    '[{"profissionalId": "a2300000-0000-4000-8000-0000000000a1", "tipo": "bloqueio", "dataInicio": "2026-12-01", "dataFim": "2026-12-01", "inicio": "09:00", "fim": "12:00", "motivo": "Médico"}]',
    'c2300000-0000-4000-8000-0000000000a2', null);
  r := disponibilidade_excecoes_criar('e2300000-0000-4000-8000-00000000000a',
    '[{"profissionalId": "a2300000-0000-4000-8000-0000000000a1", "tipo": "bloqueio", "dataInicio": "2026-12-02", "dataFim": "2026-12-02", "inicio": "14:00", "fim": "16:00"}]',
    'c2300000-0000-4000-8000-0000000000a1', null);
  -- Inserção direta tentando escolher hora e origem: o servidor decide.
  insert into disponibilidade_eventos (empresa_id, actor_id, acao, profissional_id, created_at, origem, seq, hash)
  values ('e2300000-0000-4000-8000-00000000000a', 'c2300000-0000-4000-8000-0000000000a1', 'excecao_criar', 'a2300000-0000-4000-8000-0000000000a1', '2020-01-01', 'profissional', 99, 'x');
  select * into e1 from disponibilidade_eventos where empresa_id = 'e2300000-0000-4000-8000-00000000000a' and seq = 1;
  select * into e2 from disponibilidade_eventos where empresa_id = 'e2300000-0000-4000-8000-00000000000a' and seq = 2;
  select * into e3 from disponibilidade_eventos where empresa_id = 'e2300000-0000-4000-8000-00000000000a' and seq = 3;
  if e1.id is null or e2.id is null or e3.id is null then raise exception 'gate_023 bloco 1: sequência 1, 2, 3 não gravada'; end if;
  if e1.origem <> 'profissional' or e2.origem <> 'equipe' or e3.origem <> 'equipe' then
    raise exception 'gate_023 bloco 1: origem errada (%, %, %)', e1.origem, e2.origem, e3.origem;
  end if;
  if e1.hash_anterior <> disponibilidade_cadeia_base('e2300000-0000-4000-8000-00000000000a') or e2.hash_anterior <> e1.hash or e3.hash_anterior <> e2.hash then
    raise exception 'gate_023 bloco 1: elos não encadeados';
  end if;
  if e3.created_at < now() - interval '1 minute' or e3.hash = 'x' then
    raise exception 'gate_023 bloco 1: hora ou hash vieram de quem chamou';
  end if;
  if exists (select 1 from disponibilidade_eventos where empresa_id = 'e2300000-0000-4000-8000-00000000000b' and seq is not null) then
    raise exception 'gate_023 bloco 1: corrente vazou para outra empresa';
  end if;
  r := disponibilidade_cadeia_conferir('e2300000-0000-4000-8000-00000000000a');
  if (r->>'ok')::boolean is not true or (r->>'total')::int <> 3 or (r->>'legado')::int <> 1 or r->>'ultimoHash' <> e3.hash then
    raise exception 'gate_023 bloco 1: conferência íntegra falhou: %', r;
  end if;
end $$;

-- 2. Adulteração é detectada (trigger de imutabilidade desligado de propósito, só aqui).
savepoint adulterar;
alter table disponibilidade_eventos disable trigger trg_ledger_imutavel;
update disponibilidade_eventos set depois = '[]' where empresa_id = 'e2300000-0000-4000-8000-00000000000a' and seq = 2;
do $$ declare r jsonb := disponibilidade_cadeia_conferir('e2300000-0000-4000-8000-00000000000a'); begin
  if (r->>'ok')::boolean or (r->>'quebraEm')::int <> 2 or r->>'motivo' <> 'o conteúdo do evento foi alterado' then raise exception 'gate_023 bloco 2: conteúdo alterado não detectado: %', r; end if;
end $$;
rollback to savepoint adulterar;
savepoint adulterar;
alter table disponibilidade_eventos disable trigger trg_ledger_imutavel;
delete from disponibilidade_eventos where empresa_id = 'e2300000-0000-4000-8000-00000000000a' and seq = 2;
do $$ declare r jsonb := disponibilidade_cadeia_conferir('e2300000-0000-4000-8000-00000000000a'); begin
  if (r->>'ok')::boolean or (r->>'quebraEm')::int <> 2 or r->>'motivo' <> 'falta um evento na sequência' then raise exception 'gate_023 bloco 2: evento apagado não detectado: %', r; end if;
end $$;
rollback to savepoint adulterar;
savepoint adulterar;
alter table disponibilidade_eventos disable trigger trg_ledger_imutavel;
update disponibilidade_eventos set created_at = '2025-06-01' where id = 'f2300000-0000-4000-8000-000000000001';
do $$ declare r jsonb := disponibilidade_cadeia_conferir('e2300000-0000-4000-8000-00000000000a'); begin
  if (r->>'ok')::boolean or (r->>'quebraEm')::int <> 1 or r->>'motivo' <> 'eventos anteriores à corrente foram alterados' then raise exception 'gate_023 bloco 2: evento antigo alterado não detectado: %', r; end if;
end $$;
rollback to savepoint adulterar;
do $$ begin
  if not (disponibilidade_cadeia_conferir('e2300000-0000-4000-8000-00000000000a')->>'ok')::boolean then raise exception 'gate_023 bloco 2: desfazer não voltou ao íntegro'; end if;
  if coalesce(pg_temp.erro_de('truncate disponibilidade_eventos'), '') not like '%ledger imutável%' then raise exception 'gate_023 bloco 2: truncate não barrado'; end if;
  if coalesce(pg_temp.erro_de($q$update disponibilidade_eventos set origem = 'profissional' where seq = 2$q$), '') not like '%ledger imutável%' then raise exception 'gate_023 bloco 2: update não barrado'; end if;
end $$;

-- 3. O que a Ana marcou só ela remove ou encurta; o da gestão a gestão mexe.
do $$
declare v_dela uuid; v_gestao uuid; r jsonb; e disponibilidade_eventos%rowtype; x disponibilidade_excecoes%rowtype;
begin
  select id into v_dela from disponibilidade_excecoes where profissional_id = 'a2300000-0000-4000-8000-0000000000a1' and data_inicio = '2026-12-01';
  select id into v_gestao from disponibilidade_excecoes where profissional_id = 'a2300000-0000-4000-8000-0000000000a1' and data_inicio = '2026-12-02';
  if coalesce(pg_temp.erro_de(format($q$select disponibilidade_excecao_remover('e2300000-0000-4000-8000-00000000000a', %L, 'c2300000-0000-4000-8000-0000000000a1', null)$q$, v_dela)), '') not like '%só ele pode remover%' then
    raise exception 'gate_023 bloco 3: admin removeu o bloqueio da profissional';
  end if;
  if coalesce(pg_temp.erro_de(format($q$select disponibilidade_excecao_encurtar('e2300000-0000-4000-8000-00000000000a', %L, '2026-12-01', '2026-12-01', '10:00', '11:00', 'c2300000-0000-4000-8000-0000000000a1')$q$, v_dela)), '') not like '%só ele pode encurtar%' then
    raise exception 'gate_023 bloco 3: admin encurtou o bloqueio da profissional';
  end if;
  for r in select to_jsonb(t) from (values ('2026-12-01', '2026-12-01', '08:00', '11:00'), ('2026-12-01', '2026-12-01', '10:00', '13:00'),
      ('2026-11-30', '2026-12-01', '10:00', '11:00'), ('2026-12-01', '2026-12-01', '11:00', '10:00'), ('2026-12-01', '2026-12-01', '09:00', '12:00')) as t(a, b, c, d) loop
    if pg_temp.erro_de(format($q$select disponibilidade_excecao_encurtar('e2300000-0000-4000-8000-00000000000a', %L, %L, %L, %L, %L, 'c2300000-0000-4000-8000-0000000000a2')$q$, v_dela, r->>'a', r->>'b', r->>'c', r->>'d')) is null then
      raise exception 'gate_023 bloco 3: encurtar aceitou fora do original ou igual: %', r;
    end if;
  end loop;
  r := disponibilidade_excecao_encurtar('e2300000-0000-4000-8000-00000000000a', v_dela, '2026-12-01', '2026-12-01', '09:00', '10:30', 'c2300000-0000-4000-8000-0000000000a2');
  select * into x from disponibilidade_excecoes where id = v_dela;
  select * into e from disponibilidade_eventos where acao = 'excecao_encurtar' order by seq desc limit 1;
  if x.fim <> '10:30' or x.inicio <> '09:00' or e.origem <> 'profissional' or e.antes->0->>'fim' <> '12:00:00' or e.depois->0->>'fim' <> '10:30:00' then
    raise exception 'gate_023 bloco 3: encurtar não gravou antes e depois';
  end if;
  r := disponibilidade_excecao_encurtar('e2300000-0000-4000-8000-00000000000a', v_gestao, '2026-12-02', '2026-12-02', '14:00', '15:00', 'c2300000-0000-4000-8000-0000000000a1');
  if coalesce(pg_temp.erro_de(format($q$select disponibilidade_excecao_encurtar('e2300000-0000-4000-8000-00000000000a', %L, '2026-12-02', '2026-12-02', '14:00', '14:30', 'c2300000-0000-4000-8000-0000000000b1')$q$, v_gestao)), '') not like '%sem vínculo%' then
    raise exception 'gate_023 bloco 3: ator de outra empresa encurtou';
  end if;
  r := disponibilidade_excecao_remover('e2300000-0000-4000-8000-00000000000a', v_dela, 'c2300000-0000-4000-8000-0000000000a2', null);
  if exists (select 1 from disponibilidade_excecoes where id = v_dela) then raise exception 'gate_023 bloco 3: a profissional não removeu o seu'; end if;
  if not (disponibilidade_cadeia_conferir('e2300000-0000-4000-8000-00000000000a')->>'ok')::boolean then raise exception 'gate_023 bloco 3: corrente quebrou'; end if;
end $$;

-- 4. Aceite da escala: só a própria, só a última, idempotente.
do $$
declare r jsonb; v_def uuid; v_def2 uuid; e disponibilidade_eventos%rowtype;
begin
  r := disponibilidade_semanal_definir('e2300000-0000-4000-8000-00000000000a', 'a2300000-0000-4000-8000-0000000000a1',
    '[{"diaSemana": 2, "inicio": "09:00", "fim": "18:00"}]', true, 'c2300000-0000-4000-8000-0000000000a1', null);
  select id into v_def from disponibilidade_eventos where acao = 'semanal_definir' and profissional_id = 'a2300000-0000-4000-8000-0000000000a1' order by seq desc limit 1;
  if coalesce(pg_temp.erro_de(format($q$select disponibilidade_escala_aceitar('e2300000-0000-4000-8000-00000000000a', 'a2300000-0000-4000-8000-0000000000a1', 'c2300000-0000-4000-8000-0000000000a1', %L)$q$, v_def)), '') not like '%Só o próprio profissional%' then
    raise exception 'gate_023 bloco 4: admin aceitou pela profissional';
  end if;
  if coalesce(pg_temp.erro_de($q$select disponibilidade_escala_aceitar('e2300000-0000-4000-8000-00000000000a', 'a2300000-0000-4000-8000-0000000000a2', 'c2300000-0000-4000-8000-0000000000a2', gen_random_uuid())$q$), '') not like '%Só o próprio profissional%' then
    raise exception 'gate_023 bloco 4: Ana aceitou a escala da Bia';
  end if;
  r := disponibilidade_escala_aceitar('e2300000-0000-4000-8000-00000000000a', 'a2300000-0000-4000-8000-0000000000a1', 'c2300000-0000-4000-8000-0000000000a2', v_def);
  select * into e from disponibilidade_eventos where id = (r->>'eventoAceite')::uuid;
  if (r->>'jaAceita')::boolean or e.acao <> 'semanal_aceitar' or e.origem <> 'profissional' or e.depois->0->>'eventoId' <> v_def::text
     or e.depois->0->'periodos'->0->>'inicio' is null then
    raise exception 'gate_023 bloco 4: aceite não gravou o que foi aceito: %', to_jsonb(e);
  end if;
  r := disponibilidade_escala_aceitar('e2300000-0000-4000-8000-00000000000a', 'a2300000-0000-4000-8000-0000000000a1', 'c2300000-0000-4000-8000-0000000000a2', v_def);
  if not (r->>'jaAceita')::boolean then raise exception 'gate_023 bloco 4: aceite repetido gravou de novo'; end if;
  r := disponibilidade_semanal_definir('e2300000-0000-4000-8000-00000000000a', 'a2300000-0000-4000-8000-0000000000a1',
    '[{"diaSemana": 3, "inicio": "09:00", "fim": "18:00"}]', true, 'c2300000-0000-4000-8000-0000000000a1', null);
  if coalesce(pg_temp.erro_de(format($q$select disponibilidade_escala_aceitar('e2300000-0000-4000-8000-00000000000a', 'a2300000-0000-4000-8000-0000000000a1', 'c2300000-0000-4000-8000-0000000000a2', %L)$q$, v_def)), '') not like '%A escala mudou%' then
    raise exception 'gate_023 bloco 4: aceitou escala antiga';
  end if;
  if not (disponibilidade_cadeia_conferir('e2300000-0000-4000-8000-00000000000a')->>'ok')::boolean then raise exception 'gate_023 bloco 4: corrente quebrou'; end if;
end $$;

-- 5. Acesso: anon e authenticated não chamam; o backend chama.
do $$ begin
  if has_function_privilege('authenticated', 'disponibilidade_excecao_encurtar(uuid, uuid, date, date, time, time, uuid)', 'execute')
     or has_function_privilege('anon', 'disponibilidade_escala_aceitar(uuid, uuid, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'disponibilidade_cadeia_conferir(uuid)', 'execute')
     or has_function_privilege('authenticated', 'disponibilidade_excecao_remover(uuid, uuid, uuid, jsonb)', 'execute') then
    raise exception 'gate_023 bloco 5: função exposta a anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'disponibilidade_excecao_encurtar(uuid, uuid, date, date, time, time, uuid)', 'execute')
     or not has_function_privilege('service_role', 'disponibilidade_escala_aceitar(uuid, uuid, uuid, uuid)', 'execute')
     or not has_function_privilege('service_role', 'disponibilidade_cadeia_conferir(uuid)', 'execute') then
    raise exception 'gate_023 bloco 5: backend sem acesso às funções';
  end if;
end $$;

rollback;
\echo 'gate_023 OK'
