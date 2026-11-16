-- Migration 018 — recorrência de agendamentos, só pela equipe (D-039, C4 da auditoria de
-- agendamento). Autorizada pelo Platform Owner em 2026-11-16 (D-038: "C2, migrações, C3 C4 C5").
-- Aplica em produção só no merge.
--
-- Uma série guarda a regra (semanal, quinzenal ou mensal, quantas vezes, horário, serviço,
-- profissional, cliente). Cada ocorrência é um agendamento comum, criado pela mesma função de
-- sempre (agendamento_criar, com a checagem de conflito sob trava) e marcado com serie_id e
-- serie_seq. Ocorrência indisponível (conflito ou fora da escala) é pulada e informada; nada é
-- encaixado à força pela série. O cliente nunca cria série pelo link (risco de fraude, decisão
-- do dono): a rota exige a permissão agenda:recorrencia.
begin;

create table if not exists public.agendamento_series (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id),
  servico_id uuid not null references public.servicos(id),
  profissional_id uuid not null references public.profissionais(id),
  frequencia text not null check (frequencia in ('semanal', 'quinzenal', 'mensal')),
  horario time not null,
  duracao_min int not null check (duracao_min between 5 and 600),
  data_inicio date not null,
  ocorrencias int not null check (ocorrencias between 2 and 52),
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  created_at timestamptz not null default now(),
  created_by uuid null references public.app_users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.app_users(id)
);
create index if not exists idx_agendamento_series_empresa on public.agendamento_series (empresa_id, status);

alter table public.agendamentos add column if not exists serie_id uuid null references public.agendamento_series(id);
alter table public.agendamentos add column if not exists serie_seq int null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agendamentos_serie_seq_faixa') then
    alter table public.agendamentos add constraint agendamentos_serie_seq_faixa
      check ((serie_id is null and serie_seq is null) or (serie_id is not null and serie_seq is not null and serie_seq between 1 and 52));
  end if;
end $$;
create index if not exists idx_agendamentos_serie on public.agendamentos (serie_id, serie_seq) where serie_id is not null;

-- Série e ocorrência são sempre da mesma empresa; as referências da série também.
create or replace function public.agendamento_series_mesma_empresa() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'agendamento_series' then
    if not exists (select 1 from public.clientes c where c.id = new.cliente_id and c.empresa_id = new.empresa_id)
       or not exists (select 1 from public.servicos s where s.id = new.servico_id and s.empresa_id = new.empresa_id)
       or not exists (select 1 from public.profissionais p where p.id = new.profissional_id and p.empresa_id = new.empresa_id) then
      raise exception 'agendamento_series: referência de outra empresa' using errcode = '23514';
    end if;
  elsif new.serie_id is not null
     and not exists (select 1 from public.agendamento_series s where s.id = new.serie_id and s.empresa_id = new.empresa_id) then
    raise exception 'agendamentos: série de outra empresa' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_agendamento_series_mesma_empresa on public.agendamento_series;
create trigger trg_agendamento_series_mesma_empresa
  before insert or update of empresa_id, cliente_id, servico_id, profissional_id on public.agendamento_series
  for each row execute function public.agendamento_series_mesma_empresa();
drop trigger if exists trg_agendamentos_serie_mesma_empresa on public.agendamentos;
create trigger trg_agendamentos_serie_mesma_empresa
  before insert or update of serie_id, empresa_id on public.agendamentos
  for each row execute function public.agendamento_series_mesma_empresa();

revoke all on table public.agendamento_series from public, anon, authenticated;
alter table public.agendamento_series enable row level security;
grant select, insert, update on table public.agendamento_series to service_role;
revoke delete, truncate on table public.agendamento_series from service_role;
revoke all on function public.agendamento_series_mesma_empresa() from public, anon, authenticated;

commit;
