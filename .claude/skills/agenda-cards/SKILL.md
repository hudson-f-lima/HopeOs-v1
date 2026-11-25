---
name: agenda-cards
description: Regras aprovadas pelo Platform Owner para a grade do dia, os cards e o arrastar e soltar da agenda do HOPE OS (projeto dos cards, etapas 1–3) — o que o card mostra por altura, ícones permitidos e de onde vêm os dados, cor do serviço, situação no canto, concluído e pago, arraste com prévia, conflito, desfazer e teclado. Use ao mexer em js/ui/agenda.js, nos estilos .ag-block/.agx-*, no E2E da agenda ou quando o usuário falar em "cards", "card da agenda", "arrastar", "grade" ou "selo fora".
---

# Cards da agenda — HOPE OS

Protótipo aprovado (25/11): artifact "Cards da Agenda" (claude.ai/artifact/2TnU3ipgUZu2UifBuQT4WE). Decisões: D-074 (grade, etapa 1) e D-076 (série com encaixe). Siga também `steward` e `usabilidade-pwa`.

## Etapas e estado
| Etapa | Escopo | Estado |
|---|---|---|
| 1 | Grade do tamanho do dia + selo "N fora" | Feita (D-074, PR #66) |
| 2 | Card novo: densidade por altura, situação no canto, 7 ícones com dados, concluído e pago | Feita (D-077), sem migration |
| 3 | Arraste: prévia início–fim + profissional, conflito com nome, desfazer 8 s, teclado, rolagem na borda | Feita (D-078), sem migration. Pendente: passo do salão (`slot_padrao` não chega à tela) |
| — | Cor e intensidade escolhidas no cadastro do serviço | **BLOQUEADO**: coluna nova = migration 028+, só com autorização |

Ordem: 2 antes de 3. O arraste usa o card novo; fazer 3 antes refaz o trabalho.

## Escolhas do Platform Owner (não reabrir sem ele)
- Intensidade **suave** é o padrão. A agenda **não** tem botão suave/marcante: a escolha seria por serviço, no cadastro (bloqueado). Enquanto isso, todos ficam suaves.
- Concluído e pago: **os dois**, acinzentado + chanfro. A cor do serviço continua.
- Situação (agendado, confirmado, chegou, atendendo, pago, faltou) é um **ícone no canto superior**. Nunca troca a cor do card.
- Selo da grade: texto curto **"N fora"** (`#agSeloFora`). Não usar faixa larga.
- Ícones: só os **7 que já têm dado**. São estes: assinante, assinatura em atraso, primeira visita, horário recorrente, agendou pelo link, veio da lista de espera e histórico de faltas.

## Ícones fora da etapa 2 (não implementar)
| Ícone | Motivo |
|---|---|
| Aniversário | Data de nascimento = migration |
| Prefere não conversar | Campo novo na ficha = migration |
| Pacote, Cupom | Recurso inexistente |
| Pago online | Depende de fornecedor (skill `integracao-futura`) |
| Assinatura multi (rede) | D-073, bloqueado até V1.5 |

## Dados dos 7 ícones (D-077, confirmados)
O servidor calcula em `MarcadoresAgendaEngine`; a tela só desenha (`GET /agenda?data=…&marcadores=1`).

| Ícone | Fonte |
|---|---|
| Recorrente | `agendamentos.serie_id` (018) |
| Pelo link | evento `origem_link_publico` em `agendamento_eventos` |
| Lista de espera | evento `criado` com `espera_baixada` (D-060) |
| Faltas | `computeReguaFaltas` em alerta/exigir_sinal, só com o que veio antes do horário |
| Assinante / em atraso | `situacao()` de HOJE; só com `assinatura:ver` |
| Primeira visita | nenhum concluído/fechado nem comanda fechada em dia anterior |
| Pago (não é ícone) | `fechado`, ou `concluido` com evento de status `origem: 'checkout'` |

Regras:
- A trilha de eventos é best-effort: link, espera e pago podem faltar, nunca sobrar. Não "corrija" isso com valor fixo.
- Ícone novo só com fonte gravada, gate com controle negativo e linha nesta tabela.
- Leitura por lista de ids, em lotes de 100 (`clienteIds`, `agendamentoIds` no repositório). Nunca uma requisição por card.

## Densidade por altura (minutos)
- Sempre aparecem: horário, cliente, ícones e situação.
- Serviço: a partir de 30 min.
- Aviso: a partir de 45 min.
- O texto que não cabe é cortado com reticências, nunca some sem sinal. Tocar abre o modal de hoje.
- Todo texto do servidor passa por `escapeHtml`.

## Cor
- Hoje a cor é adivinhada pelo nome (`SERVICE_COLORS` em `js/ui/agenda.js`). A etapa 2 pode trocar só a **forma**: suave = fundo claro, texto escuro, borda esquerda forte. Isso vale no claro e no escuro.
- Serviço sem palavra conhecida deve receber uma cor distinta e estável (hash do id). Isso não precisa de migration.
- Contraste mínimo AA do texto no fundo, nos dois temas. Meça; não estime.

## Arraste (etapa 3)
1. O card inteiro é a alça. No celular, segurar por 0,3 s; a rolagem da tela continua livre.
2. Contorno no destino com início, fim e nome do profissional, antes de soltar.
3. Conflito: contorno vermelho com o nome de quem ocupa. Soltar ali não muda nada.
4. Fora da escala: contorno âmbar. Soltar ali pede o encaixe, como no avulso, só com `agenda:encaixar` (D-076 vale para a série; no arraste, a mesma regra).
5. Depois de soltar aparece "Desfazer" por 8 s. Desfazer é outra chamada ao servidor, nunca só estado local.
6. Concluído e pago não se arrasta. Mudar o registro financeiro só pelo estorno.
7. Passo: `SNAP_MIN = 20`. `empresas.slot_padrao` existe, mas não chega à tela da agenda; trocar o passo exige trocar também a grade (`GRID_MIN`) e os testes de arraste, num PR próprio.
8. Teclado: setas movem um passo, ← → trocam de profissional; o foco segue o card novo. Rolagem automática só depois de 0,4 s parado na faixa de 32 px da borda: soltar no último horário visível não pode rolar.
9. Mudar situação só no toque, nunca no arraste.

## Regras da grade (etapa 1, não quebrar)
- A janela é `8–20 ∪ escala do dia ∪ atendimentos`, arredondada para a hora. **Só cresce**, nunca encolhe.
- O E2E `agenda-grade-dinamica` precisa continuar verde.

## Testes obrigatórios por etapa
- Gate do servidor para cada marcador, com controle negativo: tire a fonte e veja o teste cair.
- E2E em 390×844 sob CSP, com marcadores plantados via `POST /__db/<tabela>`. Ele confere quais ícones aparecem e quais não aparecem, e que o card de 15 min não esconde horário nem cliente.
- Para cada papel (recepção, profissional), nenhuma resposta ≥ 400 nova.
- Troque o `CACHE_NAME` do service worker sempre que mudar JS ou CSS em cache.
- Screenshots para o dono: `deviceScaleFactor: 2`, claro e escuro.
