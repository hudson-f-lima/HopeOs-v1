---
name: agendamento-inteligente
description: Regras e pontos de extensão do atendimento com vários serviços do HOPE OS (combinações de horários e profissionais, fracionamento, reserva tudo ou nada). Use ao mexer em AtendimentoEngine, /agenda/combinacoes, /agenda/atendimentos, na grade de horários ou ao estender para o link do cliente, combos e recursos.
---

# Agendamento inteligente — HOPE OS

Decisão: `docs/DECISIONS.md` D-040. Análise: `docs/planning/AGENDAMENTO_INTELIGENTE_ANALISE.md`. Siga também a skill `steward`.

## Onde está cada coisa
| O quê | Arquivo |
|---|---|
| Motor puro (totais, grade, combinações, validação) | `backend/src/engines/AtendimentoEngine.js` |
| Espaços livres do dia (fonte única da disponibilidade) | `livresDoProfissional` → `SlotEngine.periodosDoDia` → `DisponibilidadeEngine` |
| Consulta, gravação, etapas e cancelamento | `backend/src/routes/atendimento.js` |
| Reserva atômica | `supabase/migrations/019_atendimento_multiservico.sql` (`atendimento_criar`) e espelho em `dev/memoryBackend.js` |
| Tela | `js/ui/atendimento.js`, modal do novo agendamento e card em `js/ui/agenda.js` |
| Testes | `backend/tests/atendimento-gate.test.js`, `supabase/tests/gate_019.sql`, `concurrency_atendimento.sh`, E2E `atendimento` |

## Regras que não se quebram
1. Uma fonte de disponibilidade: nada calcula horário livre fora de `livresDoProfissional`.
2. Preço e duração são do servidor (override do profissional > serviço). Nunca aceitar do cliente.
3. Profissional fixado pelo usuário nunca é trocado; o motor lista opções e quem agenda escolhe.
4. Gravar é tudo ou nada, sempre por `atendimento_criar`. Não chamar `agendamento_criar` em laço.
5. Atendimento de várias etapas nunca encaixa à força.
6. Toda escolha é revalidada no servidor com `validarEtapas` antes de gravar.
7. Grade: do início de cada espaço livre, passo = duração total, mais o início que termina no fim do espaço.

## Como estender
- Regra nova de combinação: escreva primeiro o cenário em `atendimento-gate.test.js` com espaços livres dados (teste puro), veja falhar, depois mude o motor.
- Mudança na função do banco exige migration nova autorizada (a 019 não se edita), gate SQL e teste de concorrência.
- Link do cliente e série recorrente ainda trabalham com um serviço: reutilize `combinar` e `validarEtapas`, não duplique a lógica.
