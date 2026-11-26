-- Migration 028 — "Cliente chegou" como opção do salão (D-084). Autorizada pelo Platform Owner em
-- 2026-11-26 ("Migração aprovada", depois da proposta "agenda_usa_chegada"). Aplica em produção só no merge.
--
--   empresas.agenda_usa_chegada  o salão marca a chegada do cliente antes de iniciar o atendimento
--                                (true, como sempre foi). false: o card e a tela Agora oferecem
--                                "Iniciar atendimento" direto, e o aviso de atraso não aparece
--                                (sem a chegada marcada, todo cliente pareceria atrasado).
-- Só muda o que a tela oferece: o servidor continua aceitando aguardando e em_atendimento
-- (agendado → em_atendimento já era permitido). Lida só pelo backend, com service_role.
begin;

alter table public.empresas add column if not exists agenda_usa_chegada boolean not null default true;

commit;
