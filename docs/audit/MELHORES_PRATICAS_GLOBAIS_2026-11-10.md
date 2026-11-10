# Melhores práticas globais, de qualquer segmento, aplicadas ao HOPE OS — 2026-11-10

Pedido do Platform Owner: pesquisar as melhores práticas do mercado global, de qualquer segmento. Este documento é **pesquisa e diagnóstico**; não implementa nada. Complementa `AUDITORIA_E_BENCHMARK_2026-11-10.md` (concorrentes) olhando para disciplinas, não para produtos.

**Qualidade das fontes.** A maior parte do que a busca devolve é blog de fornecedor ou material secundário. Cada linha diz o tipo de fonte. "Primária" = norma, artigo revisado ou documentação do próprio autor da prática. Número sem fonte primária está marcado como **não verificado**. Classificação do HOPE OS: REAL, PARCIAL, AUSENTE, DESCONHECIDO.

## 1. Veredito
- O HOPE OS já segue as práticas mais difíceis de acertar: **ledger imutável, correção por lançamento inverso, idempotência, dinheiro em centavos inteiros, servidor como fonte da verdade**. É o núcleo do que a engenharia de pagamentos recomenda.
- As maiores distâncias para a boa prática **não são de funcionalidade**. São de **operação**: backup com teste de restauração, controle interno do caixa (quem conta não deveria ver o esperado; quem fecha não deveria ser quem confere) e medição (ativação, disponibilidade).
- Nenhuma dessas práticas substitui uso real. Várias delas só podem ser calibradas com dado de piloto.

## 2. Práticas por disciplina

### 2.1 Engenharia de pagamentos e livro-razão (fintech)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Livro só de inclusão; nada é editado | secundária ([DEV](https://dev.to/gabrielanhaia/design-a-payment-ledger-idempotent-audit-compliant-reconciles-to-the-cent-59p7), [TechInterview](https://www.techinterview.org/post/3233474171/system-design-payment-system-stripe-idempotency-double-charge-prevention-ledger-reconciliation-pci-compliance-webhooks/)) | REAL | triggers `ledger_imutavel` (009, 010) |
| Erro se corrige com lançamento inverso | idem | REAL | estorno de comanda (009), estorno de pagamento de comissão (010) |
| Idempotência na fronteira de escrita, devolvendo o resultado original e recusando repetição divergente | idem | REAL | `checkout_close`, estorno, `financeiroOps.js` (409 `IDEMPOTENCY_MISMATCH`) |
| Dinheiro em inteiros (centavos), nunca decimal flutuante | secundária ([skills.sh](https://skills.sh/oimiragieo/agent-studio/fintech-engineer)) | REAL | colunas `*_centavos int` |
| Partidas dobradas: todo movimento soma zero | secundária | **AUSENTE** | o modelo é de lançamentos simples por tabela. Aceitável neste porte; vira exigência se houver carteira, sinal ou repasse |
| Conciliação automática diária contra o extrato do processador, com alerta de divergência | secundária | **PARCIAL** | só a checagem `ledger.consistente` na tela do caixa; não há rotina nem extrato (não há gateway) |
| Consumidor de webhook tolera duplicata e entrega fora de ordem | secundária | n/a hoje | requisito registrado em `INTEGRACOES_FUTURAS.md` §1 |

### 2.2 Controle interno de caixa (varejo, auditoria)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| **Contagem cega:** quem conta não vê o valor esperado antes de informar o contado | glossário de fornecedor ([Plum POS](https://plumpos.com/glossary/blind-cash-count.html)); prática de operador | **AUSENTE** | a tela mostra "Dinheiro esperado na gaveta" antes de a pessoa digitar o contado. É a lacuna mais barata de fechar |
| **Segregação de funções:** contar, conferir, depositar e conciliar em pelo menos duas pessoas | primária de instituição ([Trinity College Dublin](https://www.tcd.ie/financial-services/assets/pdfs/Cash_Handling_Guidelines_2019.pdf), [Vinnies](https://mavs.vinnies.org.au/media/2bdbi5wu/cash-handling-policy.pdf)) | **PARCIAL** | o autor de cada fechamento e ajuste fica gravado, mas a mesma pessoa conta e fecha, e não há etapa de conferência pela gestão |
| Limite de diferença com escalonamento (avisar gestor, recontar) | modelos de fornecedor; **não há número de norma** | **AUSENTE** | a diferença é gravada, mas não há limite nem aviso à gestão |
| Sangria quando a gaveta passa de um teto | fornecedor, **não verificado** (US$ 200–500) | PARCIAL | sangria existe (010); sem teto nem lembrete |
| Contagem surpresa periódica | checklists de auditoria | PARCIAL | "Conferir" pode ser feito a qualquer hora, mas não é registrado |
| Política de caixa escrita | prática de seguradora e auditor | AUSENTE | é do salão, não do software; o sistema poderia fornecer o modelo |

### 2.3 Falta do cliente (saúde, restaurante)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Lembrete (SMS, telefone, carta) reduz falta, com efeito **modesto** | **primária**: revisão sistemática e meta-análise, BMC Health Services Research 2023 ([doi](https://doi.org/10.1186/s12913-023-10059-9)) | REAL (manual) | `ReminderEngine.js` |
| Lembrete **direcionado por previsão de risco**; ligação telefônica para os de maior risco tem o maior efeito (RR mediano 0,61 em 3 ensaios, certeza moderada) | primária: revisão rápida citada na busca | **PARCIAL** | a régua já calcula o risco (`NoShowLadder.js`), mas a lista de lembretes não destaca "ligue para este" |
| Overbooking guiado por previsão | primária: efeito **incerto** | AUSENTE, e correto | não copiar |
| Sinal ou cartão em garantia | dado de restaurante: 0,80% de falta com garantia × 2,47% sem; em saúde, **sem evidência rigorosa** na busca | AUSENTE | encaminhado (Onda C). A evidência é mais fraca do que os fornecedores afirmam |

### 2.4 Ativação e onboarding (SaaS)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Definir **um** evento de ativação (a ação mais ligada à retenção) e levar o usuário até ele | blogs de fornecedor, consenso ([Arcade](https://www.arcade.software/post/saas-onboarding-complete-playbook)) | **AUSENTE** | há assistente de 6 fases, mas nenhum evento de ativação definido nem medido. Candidato natural: **primeira comanda fechada** |
| Medir tempo até o primeiro valor | idem; números conflitantes (de minutos a 14 dias), **não verificados** e sem recorte de pequeno negócio | AUSENTE | o dado existe no banco (criação da empresa × primeira comanda); falta a leitura |
| Taxa de ativação como indicador | média citada de 37,5% (Userpilot, via terceiros), **não verificado** | AUSENTE | sem base de clientes para medir |

### 2.5 Segurança de aplicação
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Verificar contra um padrão público. OWASP ASVS 5.0: ~350 requisitos, 17 capítulos, 3 níveis; nível 1 é a base para qualquer aplicação | secundária ([SoftwareMill](https://softwaremill.com/whats-new-in-asvs-5-0/)); o padrão em si é primário | **DESCONHECIDO** | houve Red Team com 26 testes, mas nenhuma autoavaliação contra o ASVS. Meta realista: nível 1 (**inferência**) |
| Cabeçalhos e CSP no site | — | PARCIAL | API ok; PWA no GitHub Pages sem CSP (risco aceito) |
| Proteção contra senha vazada | Supabase advisor | AUSENTE | ligar no painel |

### 2.6 Confiabilidade e operação (SRE, continuidade)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| **Backup 3-2-1** (3 cópias, 2 mídias, 1 fora) e **teste de restauração** pelo menos anual; mensal ou trimestral para banco crítico | blogs citando CISA e NIST; **redação oficial não verificada** | **AUSENTE** | plano gratuito do Supabase sem backup baixável; `export-to-data.js` existe e não foi testado contra produção. **Maior risco operacional do projeto** |
| Variante 3-2-1-1-0: uma cópia imutável e zero erro verificado por restauração | idem | AUSENTE | — |
| Objetivo de disponibilidade (SLO) e orçamento de erro = 1 − SLO | **primária** ([Google SRE Workbook](https://sre.google/workbook/error-budget-policy/)) | AUSENTE | há monitor a cada 30 min (D-017), mas nenhum objetivo declarado |
| Postmortem obrigatório quando um incidente consome parte relevante do orçamento, com ação de causa raiz | primária (idem: >20% em 4 semanas) | AUSENTE | não há modelo; para equipe pequena, as fontes recomendam resposta graduada |
| Alerta de indisponibilidade | — | REAL (novo) | `.github/workflows/monitor.yml` |

### 2.7 Usabilidade e acessibilidade
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Alvo de toque: mínimo 24×24 px (WCAG 2.2, 2.5.8, nível AA); 44 px (AAA, Apple) ou 48 dp (Material) | secundária citando a norma ([Deque](https://dequeuniversity.com/rules/axe/4.8/target-size)) | **DESCONHECIDO** | nunca medido. O botão "Estornar" dentro da linha de lançamento (D-017) é candidato a ficar abaixo de 44 px |
| Prevenir erro é melhor que boa mensagem de erro; ação reversível prefere **desfazer** a confirmação; confirmação fica para o irreversível | secundárias resumindo as heurísticas de Nielsen | REAL | confirmação só em fechamento de caixa, pagamento e estorno, que são irreversíveis por desenho |
| Confirmação em excesso irrita e perde efeito | praticante ([UX Collective](https://uxdesign.cc/what-to-do-with-user-mistakes-305d084ae1f9)) | REAL | não há confirmação em ações reversíveis (conferir, filtrar) |
| Estado do sistema sempre visível | Nielsen | PARCIAL | carregamento e erro tratados; **não verificado** se a tela avisa quando está sem rede |

### 2.8 Privacidade (LGPD)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Regime simplificado para agente de pequeno porte (Resolução CD/ANPD nº 2/2022): registro simplificado, política de segurança simplificada, encarregado opcional (mas boa prática), prazos diferenciados | guias de escritórios e Sebrae ([Demarest](https://www.demarest.com.br/wp-content/uploads/2022/03/DEMAREST-Guia-LGPD-para-os-Agentes-de-Tratamento-de-Pequeno-Porte.pdf)); texto oficial não lido nesta rodada | PARCIAL | o salão é o controlador; o HOPE OS é operador. Há rascunho de aviso de privacidade |
| Atender pedido do titular (acesso, correção, eliminação) | idem | **AUSENTE** | não há exportação nem anonimização por cliente; o ledger imutável exige anonimização, não exclusão |
| Prazo de retenção definido | **não encontrado** na busca | AUSENTE | — |
| O regime simplificado **não vale** para tratamento de alto risco | idem | atenção | agendamento público e mensagens em massa mudam o perfil de risco |

### 2.9 Gestão de receita (hotelaria, aviação)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Preço por horário: desconto no ocioso, prêmio no pico | fornecedores ([Zenoti](https://www.zenoti.com/platform/dynamic-pricing), [Fresha](https://www.fresha.com/blog/5-dynamic-pricing-tactics-that-will-get-you-booked)); ganhos de 18–30% são **alegação de fornecedor ou exemplo hipotético** | AUSENTE | a ocupação por horário já é medida (`/insights/occupancy`) |
| Risco: desconto canibaliza receita e o cliente passa a esperar o preço baixo | white paper de fornecedor ([Book4Time](https://book4time.com/wp-content/uploads/2023/10/1348032_A-guide-to-revenue-management-in-your-spa-white-paper_053122.pdf)) | — | **não construir antes de ter dado de ocupação do piloto** |

### 2.10 Piloto e validação (startup enxuta, vendas B2B)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Até 3 critérios de sucesso, com limite numérico, definidos **antes** | blogs de praticantes ([Pear VC](https://pear.vc/how-to-run-pilots), [SaaStr](https://www.saastr.com/dear-saastr-were-starting-a-big-paid-pilot-how-do-maximize-the-chances-of-success)) | PARCIAL | há 4 indicadores e um critério ("30 dias sem perda de dado nem caixa divergente"), mas **sem limite numérico** |
| Critério de **fracasso** e o que acontece em cada caso | idem | **AUSENTE** | não está escrito o que faria o projeto mudar de rumo |
| Piloto com prazo (2–4 semanas como padrão) e não parceria aberta | idem | PARCIAL | 30 dias definidos; data de início não |
| Perguntar ao cliente o que é sucesso para ele | SaaStr | AUSENTE | não há salão piloto nomeado nos documentos |

### 2.11 Entrega de software (DevOps)
| Prática | Fonte | HOPE OS | Evidência / lacuna |
|---|---|---|---|
| Mudanças pequenas e frequentes; ramo principal sempre publicável | fornecedores citando DORA 2021; o relatório DORA 2025 **abandonou** as faixas "elite" | **PARCIAL** | CI com 4 checks e trava de migration são fortes; mas o PR #22 junta duas decisões, uma migration e ~40 arquivos. É o oposto de "mudança pequena" |
| Funcionalidade nova atrás de chave de liga/desliga | idem | PARCIAL | só o agendamento online (`PUBLIC_BOOKING_LINKS`). As rotas da 010 entram ligadas |
| Chave antiga deve ser removida (custo de carregar) | fornecedor ([Unleash](https://docs.getunleash.io/feature-flag-tutorials/use-cases/trunk-based-development)) | atenção | `LEGACY_TOKEN_AUTH_ENABLED` está desligada em produção e o código legado continua |

## 3. Pontos cegos que a pesquisa revelou
1. **A tela de caixa não é cega.** Toda a literatura de controle de caixa parte de que quem conta não vê o esperado. Hoje a recepção vê. Com o fechamento agora gravado, isso deixou de ser detalhe.
2. **Não existe backup testado.** É a prática com maior consenso entre todas as disciplinas pesquisadas, e é a única totalmente ausente.
3. **A evidência a favor de sinal é mais fraca do que parece.** O dado sólido é de restaurante; em saúde a revisão não encontrou ensaio rigoroso. Isso reforça adiar a Onda C até medir a falta com lembrete.
4. **O melhor uso da régua de faltas é dizer para quem ligar.** A evidência mais forte é a de ligação telefônica direcionada por risco, e o HOPE OS já calcula o risco.
5. **Não há critério de fracasso do piloto.** Sem ele, qualquer resultado será lido como sucesso.
6. **O próprio processo desta sessão contraria a prática de entrega.** PR grande, com migration, sem uso real entre uma entrega e outra.

## 4. Prioridade (uma por vez)
| # | Ação | Por quê | Exige |
|---|---|---|---|
| 1 | **Backup com restauração testada** | Maior risco; consenso de todas as fontes | Decisão de infra (plano pago com backup) ou rotina semanal com `export-to-data.js` + um teste de restauração registrado |
| 2 | **Teste de ponta a ponta com dado real** e definição do piloto: até 3 critérios com número, critério de fracasso, data de início | Sem isso, o resto é hipótese | 30 min do dono + uma página de critérios |
| 3 | **Contagem cega e conferência pela gestão** no caixa | Lacuna de controle mais barata; sem migration para a contagem cega | Autorização para a mudança de tela; a conferência da gestão pode exigir migration |
| 4 | **"Ligue para estes clientes"** na lista de lembretes, usando a régua | Melhor evidência disponível contra falta; sem fornecedor | Autorização |
| 5 | **Evento de ativação = primeira comanda fechada**, com o tempo medido | Passa a existir um número de onboarding | Leitura de dado existente |
| 6 | Autoavaliação OWASP ASVS nível 1 e medição dos alvos de toque | Transforma "DESCONHECIDO" em lista de itens | Trabalho de auditoria, sem código de produto |
| 7 | Fluxo do titular (LGPD): exportar e anonimizar cliente | Obrigação do controlador que o operador precisa viabilizar | Migration (anonimização em tabelas imutáveis exige desenho) |

**Não recomendado agora:** preço por horário, overbooking, partidas dobradas, recepcionista com IA. Todos dependem de dado ou de escala que o projeto não tem.

## 5. Limites desta pesquisa
- Buscas na web com resultados em sua maioria secundários; nenhuma norma (ASVS, WCAG, Resolução ANPD nº 2/2022, NIST, CISA) foi lida no texto oficial nesta rodada.
- Números de mercado (ativação, tempo até o valor, ganho com preço dinâmico, limites de sangria) não foram verificados em fonte primária e **não devem virar meta**.
- A coluna "HOPE OS" vem do código e dos gates; nada foi observado em uso real.
