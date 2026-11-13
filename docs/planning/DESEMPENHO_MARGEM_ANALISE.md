# Análise — proposta "Desempenho e Margem Variável" (2026-11-13)

**Estado:** análise. Nada implementado. SQL citado é DRAFT ONLY. Migration 012 não autorizada.

## Classificação item a item
| Item da proposta | Situação real | Classe | Migration? | Fornecedor? |
|---|---|---|---|---|
| Stack Shadcn/UI, tabelas do zero | PWA em JS puro; D-021 fixou "evoluir o HOPE OS" | CONTRADITÓRIO | — | — |
| Produtividade ativa (minutos em atendimento ÷ minutos de turno) | `occupancy.computeSur` por profissional, exposto em `/insights/occupancy` (`surPct`, `minutosVendidos`, `minutosDisponiveis`). Conta minuto **agendado**, não minuto de comanda paga | PARCIAL | não | não |
| Proficiência (concluído dentro do tempo padrão) | Só há a trilha `agendamento_eventos` (hora em que alguém tocou em "iniciar"/"concluir"), best-effort. Não mede tempo real de execução | AUSENTE (dado frágil) | não para medir pela trilha | não |
| Sugestão de meta = média móvel de 3 meses + incremento | Metas e desempenho mensal existem (`gamificacao.js`, 011). Sugestão não existe | AUSENTE | não | não |
| Margem muda com a forma de pagamento | `formas_pagamento.taxa_pct` + `taxa_fixa_centavos`; taxa gravada por pagamento e rateada por item (`taxa_item_centavos`); `margin.js` decompõe por profissional e por forma | REAL | — | — |
| PIX: só taxa fixa/mínima | Cadastrar a forma com `taxa_fixa_centavos` | REAL | — | — |
| Crédito 1x–12x com MDR + antecipação pro-rata | Uma taxa por forma; não há número de parcelas na comanda | AUSENTE | **não**, se cada parcelamento for uma forma (`credito_2x` … `credito_12x`) com a taxa efetiva; **sim (012)** para tabela de MDR e campo de parcelas | não (taxas digitadas) |
| Comissão "estritamente" sobre o líquido | `modelo_comissao`: `bruto_salao`, `dividido` (base = valor − taxa), `bruto_staff`. É escolha por regra, não imposição | CONTRADITÓRIO como regra única | não | não |
| Tabela de snapshots de performance | Ledger é imutável (009); os números são recalculáveis a qualquer data | DESNECESSÁRIO agora | sim, se feito | não |
| Selos "Elegível a Bônus / Atenção / Risco de Desligamento" | Ranking e metas existem, só para gestão | AUSENTE | não | não |
| Exportação analítica | CSV para contador existe (`toCsv`) | PARCIAL | não | não |

## Red Team
- **Risco trabalhista (CRÍTICO, DESCONHECIDO sem advogado).** Medir minutos de turno, proficiência e rotular "risco de desligamento" é registro escrito de controle de jornada e de subordinação. Em salão-parceiro (Lei 13.352/2016) isso é prova a favor de vínculo de emprego. D-012 já bloqueava; D-019 aceitou o risco só para metas e ranking. Este pacote vai além.
- **LGPD art. 20.** Selo automático que embasa desligamento é decisão automatizada sobre pessoa; exige revisão humana e explicação. O sistema não pode "decidir".
- **Proficiência é manipulável.** O tempo vem do toque no botão; quem for medido passa a tocar na hora "certa". O indicador premia quem registra bem, não quem trabalha bem, e pune quem atende cliente difícil.
- **Produtividade pune quem não controla a própria agenda.** Ocupação baixa pode ser falta de demanda ou má distribuição pela recepção.
- **Comissão só sobre o líquido muda o pagamento de quem já tem acordo.** Com parcelado em 12x a comissão cai de forma visível; sem contrato que preveja, é passivo.
- **Taxas são dado, não opinião.** MDR e antecipação variam por adquirente e por negociação; nada pode vir embutido no código.
- **Pior cenário plausível:** relatório exportado com "Risco de Desligamento" anexado a uma reclamação trabalhista.

## Plano em ondas
- **Onda 0:** nada bloqueia produção.
- **Onda 1 (sem migration, baixo risco):**
  1. Sugestão de meta: média dos 3 últimos meses fechados × (1 + incremento ajustável), só como sugestão no formulário de metas. Aceite: gate com controle negativo; profissional com menos de 3 meses mostra "sem histórico".
  2. Parcelado como formas de pagamento + calculadora de taxa efetiva (MDR + antecipação pro-rata) na tela de formas. Aceite: comanda em `credito_6x` grava a taxa certa; margem por forma mostra a diferença para PIX.
  3. Margem líquida por profissional e por forma no painel do gestor (dados já existem). Aceite: soma bate com `margin.js`.
- **Onda 2 (depende de decisão e parecer):** painel de desempenho individual com ocupação e faixas neutras ("acima / na faixa / abaixo da meta"), só gestão, sem rótulo de desligamento.
- **Onda 3 (migration 012, pedir autorização):** tabela de MDR por parcelas e campo de parcelas no pagamento, se a Onda 1.2 ficar incômoda no uso real.
- **Não recomendado:** proficiência por tempo cronometrado; snapshots; comissão forçada sobre o líquido.

## Decisões do Platform Owner
1. Autoriza a Onda 1?
2. Painel de desempenho individual: com parecer trabalhista antes, ou aceita o risco por escrito como em D-019?
3. Os rótulos "Risco de Desligamento" ficam fora? (recomendado: sim)
