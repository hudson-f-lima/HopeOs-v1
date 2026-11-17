-- Rollback da migration 024 (D-049): tira as regras da agenda configuráveis. O prazo de
-- cancelamento (016) continua; a confiabilidade volta a usar só ele (ou 24 h no código antigo).
begin;
alter table public.servicos drop constraint if exists servicos_agenda_regras_limites;
alter table public.empresas drop constraint if exists empresas_agenda_regras_limites;
alter table public.servicos drop column if exists cancelamento_prazo_min, drop column if exists antecedencia_min_online;
alter table public.empresas
  drop column if exists agenda_atraso_alerta_min,
  drop column if exists agenda_intervalo_min_dias,
  drop column if exists agenda_max_futuros_recepcao,
  drop column if exists agenda_janela_dias_recepcao;
commit;
