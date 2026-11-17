-- Migration 024 — Regras da agenda configuráveis (D-049). Autorizada pelo Platform Owner em
-- 2026-11-17 ("Autorizo a 024"). Aplica em produção só no merge.
--
-- Decisões do dono: um prazo de cancelamento só (o online_cancelamento_prazo_min da 016 passa a
-- valer para todos os canais e para a confiabilidade); na recepção a regra AVISA e deixa seguir
-- (a exceção fica no histórico); no link online a regra bloqueia.
--
--   empresas.agenda_janela_dias_recepcao  quantos dias à frente a recepção agenda sem aviso (null = sem limite)
--   empresas.agenda_max_futuros_recepcao  quantos horários futuros um cliente pode ter sem aviso (null = sem limite)
--   empresas.agenda_intervalo_min_dias    o mesmo cliente no mesmo serviço a menos de N dias de outro horário
--                                          (aviso na recepção, bloqueio no link; null = desligado)
--   empresas.agenda_atraso_alerta_min     minutos de atraso para o card sugerir no-show (0 = desligado)
--   servicos.antecedencia_min_online      antecedência mínima do link só para este serviço (null = a do salão)
--   servicos.cancelamento_prazo_min       prazo de cancelamento só para este serviço (null = o do salão)
-- Nada aqui é lido pelo cliente direto: só o backend, com service_role.
begin;

alter table public.empresas add column if not exists agenda_janela_dias_recepcao int null;
alter table public.empresas add column if not exists agenda_max_futuros_recepcao int null;
alter table public.empresas add column if not exists agenda_intervalo_min_dias int null;
alter table public.empresas add column if not exists agenda_atraso_alerta_min int not null default 15;
alter table public.servicos add column if not exists antecedencia_min_online int null;
alter table public.servicos add column if not exists cancelamento_prazo_min int null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_agenda_regras_limites') then
    alter table public.empresas add constraint empresas_agenda_regras_limites check (
      (agenda_janela_dias_recepcao is null or agenda_janela_dias_recepcao between 1 and 730)
      and (agenda_max_futuros_recepcao is null or agenda_max_futuros_recepcao between 1 and 50)
      and (agenda_intervalo_min_dias is null or agenda_intervalo_min_dias between 1 and 180)
      and agenda_atraso_alerta_min between 0 and 240);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servicos_agenda_regras_limites') then
    alter table public.servicos add constraint servicos_agenda_regras_limites check (
      (antecedencia_min_online is null or antecedencia_min_online between 0 and 10080)
      and (cancelamento_prazo_min is null or cancelamento_prazo_min between 0 and 10080));
  end if;
end $$;

commit;
