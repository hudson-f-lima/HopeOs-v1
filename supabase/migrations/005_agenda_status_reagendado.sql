-- HOPE OS V1.0.3 — Agenda: adiciona status 'reagendado'
-- Execute depois da 001..004. Não altera nenhuma das 6 tabelas do ledger
-- financeiro (comandos, comando_itens, comando_pagamentos, comando_gorjetas,
-- caixa_movimentos, produto_estoque_movimentos) nem a RPC checkout_close.
--
-- Motivo: o backend de agenda (PATCH /api/agenda/:id/status) precisa marcar
-- o registro original como 'reagendado' ao invés de apagá-lo, mantendo
-- rastro histórico. A CHECK constraint original de agendamentos.status
-- (001_init.sql) não incluía esse valor.

alter table public.agendamentos drop constraint if exists agendamentos_status_check;

alter table public.agendamentos
  add constraint agendamentos_status_check
  check (status in ('agendado','confirmado','aguardando','em_atendimento','concluido','cancelado','no_show','fechado','reagendado'));
