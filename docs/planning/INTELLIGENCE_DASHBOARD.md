# Kortex Intelligence Dashboard

Auditoria de 24/11/2026 na `main` `ec19f15` e no PR #63 `f5d38dc`. A implementação parte do PR #63, que ainda estava aberto na conferência. O código e as provas desta entrega são de ambiente isolado. Nenhuma leitura de produção.

## Inventário

| Visão e destino atuais | Indicadores e origem | Acesso e atualização |
|---|---|---|
| Painel executivo e Cockpit | Faturamento, parte do salão, taxas, meta, previsão heurística, ocupação, recorrência, alertas, equipe e simulação. `GET /cockpit` usa agenda, fechamentos, estornos, assinaturas e metas | `painel:financeiro`, leitura ao abrir/atualizar |
| Desempenho do salão | Faturamento, ticket, visitas, unidades, fidelização, ocupação e conciliação. `GET /cockpit/desempenho` | `painel:financeiro`, leitura sob demanda por janela |
| Indicadores operacionais do Painel | Ocupação semanal e lacunas em `/insights/occupancy`, retorno e contato em `/insights/retention`, vendas associadas em `/insights/attach`. Agenda tem disponibilidade própria | `painel:operacional`, atualização ao abrir Painel. Whatsapp respeita autorização de contato |
| Financeiro e caixa | `/insights/margin`, `/insights/cashflow`, `/financeiro/resumo`, cota-parte, pagamentos, repasses, conciliação, histórico, estornos e fechamento de caixa | Gestão depende de `painel:financeiro` ou permissão da operação. Caixa tem ações granulares disponíveis à recepção conforme perfil |
| Comercial e assinaturas | Reagendamento, recência, retorno, recorrência, inadimplência e candidatos, separados nas rotas do Painel e telas Gestão | Status de atendimento separa previsão e execução. Dados econômicos de clientes no Painel requerem `painel:financeiro` |
| Metas e desempenho individual | `/desempenho/profissional`, metas, comissões e ganhos | Próprio profissional vinculado e escopos gerenciais previstos no backend. Ciclos/escopos variam por tela |

## Diagnóstico e impacto

| Estado | Evidência e causa | Consequência e tratamento |
|---|---|---|
| REAL | `routes/index.js` autorizava retenção por `painel:operacional`; `RetentionService` devolvia valores, prioridade por gasto e gasto médio mensal do cliente. O Painel chegava a imprimir o gasto | Aplicar autorização na leitura, no modelo e na resposta. Manter ação de reativação pela recência e cadência. Confirmar em HTTP por papel e empresa |
| REAL | Simulador do Cockpit somava estimativas de folgas e faltas. `occupancy.analisarGrade` já mede faltas na interseção com as janelas livres | O potencial total podia exagerar a receita. Mostrar cenários independentes, indicar hipótese e ação |
| REAL | O gráfico semanal do Cockpit tinha só ocupação realizada. A grade de compromissos tem outro denominador temporal e outro conjunto de eventos | Oferecer comparação com preenchimento realizado e detalhe na própria tela, sem buscar novos dados por interação |
| REAL | A PWA consultava `/dashboard` para recepção, embora o renderer ignorasse `realizadosPct`. Na gestão, a leitura de pagamentos aguardava antes de iniciar indicadores | Dispensar a consulta ociosa no cliente e iniciar leituras independentes em paralelo, preservando o contrato anterior |
| CONTRADITÓRIO | O texto do widget Piloto dizia “ao mercado”, enquanto as medidas se referiam ao salão | Remover alegação sem base |
| PARCIAL | `cockpit.recorrencia` dividia MRR nominal por faturamento acumulado parcial. A meta do Cockpit compara receita geral à soma de metas cadastradas; `gamificacao` usa outra base operacional | Mostrar MRR nominal em reais por mês. Explicitar a base das metas preservando o contrato do backend |
| PARCIAL | `InsightsService.loadCashflowInsights` projeta prazos cadastrados e `cashflow` usa esses prazos também com dados históricos | Datas bancárias efetivas precisam de reconciliação. Não elevar recebíveis previstos a caixa liquidado |
| PARCIAL | `desempenhoIndividual` fornece média monetária e tamanho da equipe. Em grupos pequenos, o par pode ser aproximado por diferença | Avaliar dados com controle de acesso e decidir supressão de agregados pequenos. A análise só avaliou o contrato |
| PARCIAL | Escala histórica e durações dependem do cadastro e da duração gravada. Retenção econômica e clientes identificados têm cobertura desigual | Expor lacunas. Preservar o significado das métricas existentes ao comparar períodos |
| DESCONHECIDO | Custo de leitura física, pintura no aparelho real, acessibilidade integral com tecnologia assistiva, desempenho com dados reais | Medir em ambiente autorizado antes de liberar |

## Arquitetura e recorte

**Resumo → evidência → ação** dentro dos destinos existentes. O gestor usa o Cockpit, expande o dia para ver horas e lacunas e pode abrir a Agenda em data com janela reservável confirmada. O Desempenho é o destino da composição financeira. O detalhamento usa cascata e tabela da mesma resposta. O filtro de mês usa o período civil do backend a cada consulta, inclusive na virada do mês. A rota existente preserva os filtros por datas. O gráfico é montado ao expandir e está disponível no cache do app se a resposta autorizada já foi carregada. A recepção mantém a visão operacional. Ganhos, caixa e gestão preservam seus fluxos e permissões.

| Próximo visual, quando houver base | Pergunta a validar antes de implementar |
|---|---|
| Bullet de metas e sparklines | A meta usa o mesmo conjunto do realizado? A variação usa períodos equivalentes? |
| Heatmap de demanda e capacidade | O volume de reservas, as execuções e as lacunas usam eixos compatíveis? |
| Cohort, funil, LTV e RFM | Existem denominadores rastreáveis, chaves estáveis e coortes com maturação suficiente? |
| Treemap e dispersão | A distribuição de custos é suficiente para classificar rentabilidade? A associação tem amostra adequada? |
| Séries temporais e previsão | O histórico abrange sazonalidade, feriados e mudanças de política? A validação temporal e a cobertura de intervalos sustentam a divulgação? |

A previsão linear atual fica rotulada como estimativa sem intervalo estatístico. Em análises futuras, comparar com referência simples em períodos fora da amostra e divulgar janela, erro e cobertura. Usar atribuição causal somente com evidência. Para BI embutido, testar com dois tenants sintéticos e uma fonte de leitura mínima. Aprovação de instância, credencial e acesso a dados reais é independente.

## Bibliotecas gráficas

| Opção | Compatibilidade com PWA sem build | Peso e desempenho | Acessibilidade e licença |
|---|---|---|---|
| HTML/CSS + SVG | Componentes ESM do app | Zero bytes de biblioteca. Adequado aos sete dias e às poucas etapas da cascata | HTML nativo, navegação por teclado, tabela equivalente e rótulos. Sem licença adicional |
| Apache ECharts | Builds distribuídos. Importações seletivas exigem construção de um artefato ou distribuição customizada | Candidato prioritário para zoom, escala temporal densa e filtros cruzados. Canvas/SVG, medir configuração real sob demanda | ARIA/decal opcional. Alternativa tabular e teclado permanecem requisitos. Apache-2.0 |
| Chart.js | Build UMD autocontido para uso na stack. Módulos seletivos com empacotamento. Eixo temporal pode exigir adaptador | Séries e barras comuns, decimação de linhas. Medir bibliotecas e adaptadores junto ao app | Canvas requer alternativa acessível. MIT |
| D3 | UMD ou ESM. Exige implementar visual e interação com SVG/Canvas | Útil para gráficos sob medida. Pesar os módulos e o custo de manutenção juntos | Semântica, foco e interação implementados pela equipe. ISC |

Teste comparável para adoção: mesma distribuição fixada e servida na mesma origem, mesmos dados (90 dias, duas séries, ranking e tabela), mesmas ações e animações desativadas. Medir corpo transferido incluindo service worker, tempo até primeiro gráfico, interação p50/p95 e memória em Android representativo. Validar modo offline e atualização instalável. Não foram obtidos os artefatos das três bibliotecas para comparar gzip na mesma configuração. Implementação nativa escolhida para o volume e as interações deste recorte.

- [ECharts — importação seletiva](https://echarts.apache.org/handbook/en/basics/import/) · [renderers](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/) · [acessibilidade](https://echarts.apache.org/handbook/en/best-practices/aria/)
- [Chart.js — integração](https://www.chartjs.org/docs/latest/getting-started/integration.html) · [desempenho](https://www.chartjs.org/docs/latest/general/performance.html) · [acessibilidade](https://www.chartjs.org/docs/latest/general/accessibility.html)
- [D3 — introdução](https://d3js.org/what-is-d3) · [licença](https://github.com/d3/d3/blob/main/LICENSE)
- [Apple HIG — gráficos](https://developer.apple.com/design/human-interface-guidelines/charts) · [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Validação e decisão de implantação

- Baseline de interação por inspeção do PR #63: um acesso ao Desempenho, um ao detalhe financeiro. Selecionar mês anterior e investigar um dia no gráfico eram tarefas indisponíveis na interface. A nova versão preserva a abertura sob demanda e a composição reaproveita a consulta do período.
- O teste de 150% do PR #63 distingue 90 minutos executados, 60 minutos disponíveis, 15 sobrepostos e 15 fora da escala. Os novos testes da grade verificam o preenchimento realizado independente da agenda confirmada. A cascata fecha pelos centavos persistidos, inclusive estornos, taxas e saldo negativo.
- Benchmark da rota de retenção contra `f5d38dc`: 450 clientes, 4.200 comandas/itens e 5.600 agendamentos sintéticos. HTTP local com banco e sessão em memória, três aquecimentos e vinte amostras alternadas por revisão e perfil. Medianas recepção 844,20 → 235,62 ms e gestor/admin 821,93 → 296,41 ms. Corpo de recepção 6.577 → 2.956 bytes, gestão 6.577 bytes nas duas versões. Uma chamada a menos na abertura da recepção. Renderização, rede móvel e Postgres em produção não foram medidos.
- Peso do código: os arquivos estáticos afetados cresceram aproximadamente 4 kB gzip com o módulo de composição incluído no cache. Nenhuma biblioteca de gráficos foi adicionada.
- A revisão independente apontou virada de mês com o aplicativo aberto, gráfico ainda indisponível ao perder rede, combinação de HTML/JS de versões diferentes e equivalência entre o gráfico e os valores acessíveis. O preset foi movido para o servidor, o módulo incluído no cache e os controles novos detectam HTML antigo. A tabela descreve a direção das parcelas.
- O protótipo usa HTML local com duas entradas de navegação e dados sintéticos. A conexão MagicPath usa créditos externos de build. Metabase e Figma ficam fora desta execução.
- O registro [Métricas do Dashboard](../METRICAS_DASHBOARD.md) cobre os contratos principais. Liberação exige checks verdes no SHA candidato, integração do PR #63 e teste pós-publicação autorizado. Um piloto de usabilidade precisa medir tempo, acerto e necessidade de ajuda.
