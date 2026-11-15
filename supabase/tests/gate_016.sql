-- Gate SQL da migration 016 (agendamento online por salão, D-037). Transação desfeita no final.
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

insert into empresas (id, nome) values
  ('e1600000-0000-4000-8000-00000000000a', 'Empresa A'),
  ('e1600000-0000-4000-8000-00000000000b', 'Empresa B');

-- 1. Padrões: nasce desligado, com os mesmos limites que o servidor usava por variável de ambiente.
do $$ declare e record; begin
  select * into e from empresas where id = 'e1600000-0000-4000-8000-00000000000a';
  if e.online_ativo or e.online_slug is not null or e.online_antecedencia_min <> 120 or e.online_janela_dias <> 30
     or e.online_cancelamento_prazo_min <> 120 or e.online_max_futuros <> 2 or not e.online_mostrar_preco then
    raise exception 'gate_016 bloco 1: padrões errados';
  end if;
end $$;

-- 2. Ligar sem slug, sem razão social ou sem contato de privacidade é recusado; com os três, liga.
do $$ declare m text; begin
  m := pg_temp.erro_de($q$update empresas set online_ativo = true where id = 'e1600000-0000-4000-8000-00000000000a'$q$);
  if m is null then raise exception 'gate_016 bloco 2: ligou sem requisitos'; end if;
  update empresas set online_slug = 'salao-a', privacidade_contato = 'privacidade@salao-a.test'
   where id = 'e1600000-0000-4000-8000-00000000000a';
  m := pg_temp.erro_de($q$update empresas set online_ativo = true where id = 'e1600000-0000-4000-8000-00000000000a'$q$);
  if m is null then raise exception 'gate_016 bloco 2: ligou sem razão social'; end if;
  update empresas set razao_social = 'Salão A Ltda', online_ativo = true where id = 'e1600000-0000-4000-8000-00000000000a';
  m := pg_temp.erro_de($q$update empresas set privacidade_contato = null where id = 'e1600000-0000-4000-8000-00000000000a'$q$);
  if m is null then raise exception 'gate_016 bloco 2: apagou o contato com o link ligado'; end if;
end $$;

-- 3. Slug: formato e unicidade entre salões (o link não pode apontar para dois tenants).
do $$ declare m text; begin
  m := pg_temp.erro_de($q$update empresas set online_slug = 'salao-a' where id = 'e1600000-0000-4000-8000-00000000000b'$q$);
  if m is null then raise exception 'gate_016 bloco 3: slug duplicado aceito'; end if;
  m := pg_temp.erro_de($q$update empresas set online_slug = 'Salão A' where id = 'e1600000-0000-4000-8000-00000000000b'$q$);
  if m is null then raise exception 'gate_016 bloco 3: slug fora do formato aceito'; end if;
  m := pg_temp.erro_de($q$update empresas set online_slug = '-a' where id = 'e1600000-0000-4000-8000-00000000000b'$q$);
  if m is null then raise exception 'gate_016 bloco 3: slug curto aceito'; end if;
  update empresas set online_slug = 'salao-b' where id = 'e1600000-0000-4000-8000-00000000000b';
end $$;

-- 4. Limites fora da faixa são recusados (controle negativo: valores na borda passam).
do $$ declare m text; begin
  foreach m in array array[
    'online_antecedencia_min = -1', 'online_antecedencia_min = 10081', 'online_janela_dias = 0', 'online_janela_dias = 181',
    'online_cancelamento_prazo_min = -5', 'online_max_futuros = 0', 'online_max_futuros = 11'] loop
    if pg_temp.erro_de(format($q$update empresas set %s where id = 'e1600000-0000-4000-8000-00000000000b'$q$, m)) is null then
      raise exception 'gate_016 bloco 4: aceitou %', m;
    end if;
  end loop;
  update empresas set online_antecedencia_min = 0, online_janela_dias = 180, online_cancelamento_prazo_min = 10080, online_max_futuros = 10
   where id = 'e1600000-0000-4000-8000-00000000000b';
  if pg_temp.erro_de($q$update empresas set privacidade_contato = ' a ' where id = 'e1600000-0000-4000-8000-00000000000b'$q$) is null
     or pg_temp.erro_de(format($q$update empresas set privacidade_contato = %L where id = 'e1600000-0000-4000-8000-00000000000b'$q$, repeat('x', 201))) is null then
    raise exception 'gate_016 bloco 4: contato de privacidade fora do tamanho aceito';
  end if;
end $$;

-- 5. A busca pública do link usa o índice único (sem varrer a tabela por slug).
do $$ begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ux_empresas_online_slug') then
    raise exception 'gate_016 bloco 5: índice do slug ausente';
  end if;
end $$;

rollback;
\echo gate_016 OK (5 blocos)
