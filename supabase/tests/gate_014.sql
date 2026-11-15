-- Gate SQL da migration 014 (D-034). Transação desfeita no final.
\set ON_ERROR_STOP 1
begin;
set local client_min_messages = warning;

-- 1. As duas funções auxiliares têm search_path fixo; controle negativo: sem ele, o gate pega.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('disponibilidade_janela_legada', 'disponibilidade_hora')
                and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)) then
    raise exception 'gate_014 bloco 1: função auxiliar sem search_path fixo';
  end if;
  alter function public.disponibilidade_hora(int) reset search_path;
  if not exists (select 1 from pg_proc where proname = 'disponibilidade_hora' and proconfig is null) then
    raise exception 'gate_014 bloco 1: controle negativo falhou';
  end if;
  alter function public.disponibilidade_hora(int) set search_path = pg_catalog, public;
end $$;

-- 2. Continuam funcionando (a conversão depende delas).
do $$ declare r record; begin
  select * into r from public.disponibilidade_janela_legada('{"ativo": true, "inicio": "09:00", "fim": "12:30"}');
  if r.ini <> 540 or r.fim <> 750 or public.disponibilidade_hora(750) <> '12:30'::time then
    raise exception 'gate_014 bloco 2: funções auxiliares mudaram de resultado';
  end if;
end $$;

-- 3. Nenhuma função do schema public sem search_path fixo entre as que o projeto criou depois da 012.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and (p.proname like 'disponibilidade_%' or p.proname like 'membership_permissoes_%' or p.proname = 'permissoes_codigos_validos')
                and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)) then
    raise exception 'gate_014 bloco 3: função nova sem search_path fixo';
  end if;
end $$;

rollback;
\echo gate_014 OK (3 blocos)
