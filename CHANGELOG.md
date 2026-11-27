# Changelog

## Agenda: atendimentos ao mesmo tempo lado a lado (D-085)
- Dois atendimentos no mesmo horário do mesmo profissional agora dividem a largura, em vez de um cobrir o outro.
- Com três ou mais ao mesmo tempo, cada card mostra o horário e as iniciais. Toque para ver tudo.

## "Cliente chegou" pode ser desligado no salão (D-084)
- Em Gestão › Regras da agenda, escolha se a recepção marca a chegada do cliente.
- Desligado, o card e a tela Agora oferecem "Iniciar atendimento" direto, e o aviso de atraso não aparece.
- Corrigido: a recepção e o profissional agora recebem as regras do salão (tolerância de atraso e prazo de cancelamento). Antes, a tela usava sempre o padrão.

## Gestão organizada pelo que você quer fazer (D-083)
- A aba Gestão agora tem 8 grupos: Como o salão funciona, Como a agenda aparece, Clientes que agendam sozinhos, Equipe, O que o salão vende, Clientes, Dinheiro e Primeiros passos.
- A busca continua achando pelos nomes antigos, como "financeiro" e "pessoas e acessos".
- Novo: zoom da grade (compacto, normal, largo) neste aparelho. O passo do arraste mudou para o mesmo lugar: Gestão › Como a agenda aparece. O (i) da agenda tem um atalho para lá.

## Comandas: histórico por período (D-082)
- No histórico de comandas, escolha o período com um toque: Hoje, Ontem, Esta semana, Este mês ou Mês anterior.
- Em "Personalizado", toque no primeiro dia e no último, como no extrato do banco.
- O topo mostra quantas comandas, o total recebido e, se houver, o estornado. A lista vem separada por dia.

## Agenda: alças de cima e de baixo e passo de 10 minutos (D-081)
- Segure a faixa de cima do card para mudar o início (o fim fica onde está); a de baixo muda o fim; o meio arrasta.
- Enquanto arrasta ou estica, uma etiqueta mostra "início–fim (duração)". Esc cancela.
- O passo agora é de 10 minutos. Para trocar neste aparelho: Agenda › (i) › Passo do arraste.

## Agenda: legenda dos ícones e 2 profissionais por vez no celular (D-080)
- Ao tocar no card, o campo "Ícones deste card" explica cada ícone. "Ver todos os ícones" mostra a legenda completa.
- Assinante em dia aparece com estrela amarela. Atendimento pago no caixa mostra um "$" verde no lugar do texto "PAGO".
- No celular, a agenda mostra 2 profissionais por vez, com mais espaço para ler. Deslize para o lado para ver os outros.

## Agenda: horários livres pela duração do serviço também no app (D-079)
- No novo agendamento, a lista de horários livres agora parte de cada espaço livre e anda pela duração do serviço, como no link do cliente. Não aparecem mais horários colados uns nos outros, como 14:20 e 14:30 para um serviço de 30 min.
- Um horário fora da lista ainda pode ser digitado à mão; o sistema confere conflito e escala ao gravar.
- O aviso de faltas diz "1 falta seguida" em vez de "1 faltas seguidas".
## Agenda: arrastar e soltar mais seguro (D-078)
- Dá para arrastar pelo card inteiro. No celular, segure o card por um instante; deslizar continua rolando a agenda.
- Antes de soltar, aparece o horário de início e fim e o profissional. Se o horário estiver ocupado, a tela diz por quem e nada muda.
- Depois de soltar, um aviso traz "Desfazer" por 8 segundos.
- Pelo teclado: Tab até o card, setas para cima e para baixo mudam o horário, para os lados mudam o profissional.
- Segurar o card perto da borda de cima ou de baixo rola a agenda.

## Agenda: card novo com ícones do cliente (D-077)
- O card mostra, sem abrir, se o cliente é assinante (ou está com a assinatura em atraso), se é a primeira visita, se o horário é recorrente, se veio pelo link ou da lista de espera e se tem histórico de faltas.
- A situação (agendado, confirmado, chegou, em atendimento, concluído, faltou) aparece num ícone no canto; a cor do card continua sendo a do serviço, agora em tom suave.
- O atendimento concluído e pago fica acinzentado, com o canto recortado e a marca "PAGO".

## Cockpit: alertas não contam trabalho fora da escala (teste)
- Um teste novo (K07b) garante que atendimentos fora da escala não geram o alerta "profissional saturado" nem escondem horas livres no alerta de gargalo. O comportamento já estava certo; agora ele é verificado. Nada mudou na tela.

## Recorrência: encaixe fora da escala (D-076)
- A série recorrente agora oferece encaixe para as datas fora da escala, como o agendamento avulso, para quem tem a permissão de encaixe.
- Horário já ocupado continua fora da série.

## Cockpit: preenchimento da grade no cartão de ocupação (D-075)
- O cartão "Ocupação realizada" mostra o preenchimento da grade na mesma tela, sem precisar abrir o detalhe.

## Agenda: nada fica fora da grade (D-074)
- A grade do dia cresce até o primeiro e o último atendimento. Um encaixe às 7h ou às 20h30 agora aparece e pode ser tocado.
- Um selo pequeno ao lado do total do dia mostra quantos atendimentos estão fora da escala; tocar leva ao primeiro.

## Painel: um número por indicador (D-071)
- O Painel distingue **ocupação realizada** (minutos de serviços concluídos por minuto de escala) de **preenchimento da grade** (quanto tempo da escala teve atendimento). A produção pode ultrapassar 100%. O detalhe informa minutos sobrepostos, fora da escala e sem horário conhecido.
- O gráfico, a equipe e os horários livres indicam a janela usada. A previsão considera os compromissos futuros. O ticket exibe “Sem comandas válidas” quando falta a base, e uma cortesia válida pode resultar em R$ 0,00.
- Ocupação, faturamento e ticket mostram o mesmo valor no Cockpit e no Desempenho do salão, com o período escrito ao lado.
- Saíram os cards que somavam todo o histórico com o rótulo "no período".
- O ticket médio não cai mais por causa de estorno de venda de outro mês; esse estorno aparece à parte.
- "Desempenho do salão" fica visível sem abrir "Análises".

## Análise de desempenho do salão (D-070)
- O gestor abre **Painel → Análises → Desempenho do salão** para consultar o faturamento, as visitas identificadas, os produtos vendidos, o ticket por comanda, a ocupação e a fidelização no mesmo período.
- O destaque mostra quanto fica para o salão em serviços por hora-profissional disponível. A composição financeira detalha o valor das vendas.


## Agendamento pelo link: horários em sequência (D-069)
- No link, os horários oferecidos começam logo depois de cada atendimento e seguem a duração do serviço (ex.: 09:35, 10:20, 11:05 para um serviço de 45 min), sem buracos entre um cliente e outro.
- Vale para agendar e para remarcar pelo link. A agenda da recepção continua igual.

## Agendamento pelo link: revisar antes de confirmar (D-068)
- Antes de confirmar, o cliente vê até que horas vai o atendimento, a duração, o preço e até quando pode cancelar.
- Se o salão mudar o preço ou a duração enquanto o cliente preenche, o app avisa, mostra os horários de novo e não grava nada até ele revisar.
- Tocar duas vezes em "Agendar" não cria dois horários.

## Documentação revisada de ponta a ponta (D-066)
- O estado do projeto, o guia para agentes de código e o índice foram reescritos a partir do que está de fato em produção (migrations 001–027 aplicadas).
- Nova lista de todas as rotas da API com a permissão de cada uma (`docs/ROTAS.md`, gerada do código).
- Removidos 12 arquivos de planos e checklists das versões antigas; documentos históricos ficam marcados como tal.

## Painel sem número inventado (D-065)
- Saíram o "score" calculado sem base e as frases automáticas como "Operação estável".
- Os indicadores do piloto não mostram mais faixas "de mercado" que nunca foram conferidas: a comparação é com o histórico do próprio salão.

## Cockpit do gestor (D-064)
- No topo do Painel (administração e gestão): faturamento do mês contra a meta e o ritmo, margem real, ocupação por dia da semana, assinaturas (receita mensal, atrasos, cancelamentos), a equipe e um simulador.
- "Decidir agora": o que pede ação, com o porquê e o valor em jogo. O botão leva direto à tela certa (agenda do dia ocioso, assinantes, escala, regras).
- Sem número inventado: o que não tem dado aparece como "—", com o motivo.

## Agendamento pelo link e remarcação sem meio-termo (D-063, migration 027)
- Agendamento pelo link: se o horário for tomado no último instante, não fica mais um cadastro de cliente sem horário; dois pedidos ao mesmo tempo do mesmo número criam um cliente só.
- Remarcação: se outra pessoa mudar o horário enquanto você remarca, o app avisa e nada é gravado (antes podiam ficar dois horários ativos).
- Corrigido: quando a escala mudava durante a gravação, o app mostrava erro interno em vez do aviso "a escala mudou".

## Senha, teto do link público e aviso de cliente parecido (D-062)
- Ao cadastrar um cliente com nome parecido com um já existente, o app avisa e oferece usar o cadastro existente.
- Senha com mais de 72 bytes é recusada com aviso claro, em vez de ser cortada sem avisar.
- O limite diário de agendamentos pelo link conta só os do dia, sem ler o histórico inteiro.
- Testes: gates S04b e P14b; E2E 41/41.

## Novo visual, modo escuro e tela "Agora" do profissional (D-022)
- Visual redesenhado: cores, tipografia (Inter), botões e campos maiores.
- **Modo escuro** automático, conforme o aparelho.
- **Profissional:** a Agenda abre com o atendimento do momento e um único botão para o próximo passo (cliente chegou, iniciar, concluir e abrir comanda), mais os próximos horários do dia.
- Testes: E2E 17/17 (novo: agora).

## Ferramentas de backup e teste de restauração (D-021)
- Ferramentas para exportar o banco e para provar que o arquivo restaura (contagem, ids e totais conferidos).
- **Ainda não há backup automático.** Onde a rotina diária vai rodar depende de decisão do dono (`docs/RUNBOOK_BACKUP.md`).

## Comanda com vários serviços, produtos e profissionais (D-020)
- **Checkout:** o botão "+ Adicionar à comanda" inclui quantos serviços e produtos forem necessários, cada um com o profissional que atendeu ou vendeu, e a quantidade de cada produto. A lista mostra os itens, o subtotal e permite remover.
- As abas "Serviços | Produtos" do checkout, que não funcionavam, foram removidas.
- **Metas e ranking** passam a incluir a venda de produtos: meta de produtos por profissional e ranking por serviços, por produtos ou pelo total.
- Campo de busca: apagar o texto desfaz a escolha.
- Testes: gamificação 14; E2E 16/16 (novo: comanda).

## Metas do mês e ranking (D-019, migration 011)
- **Gestão > Ganhos > Metas do mês:** a gestão define, para cada profissional, a meta de faturamento em serviços e de atendimentos. O progresso aparece em barra e é calculado das comandas fechadas, já descontados os estornos.
- **Ranking do mês:** a gestão vê a classificação com os valores. Uma chave liga o ranking para a equipe, que passa a ver a própria posição e a proporção em relação ao primeiro, sem o valor em reais dos colegas.
- Metas e ranking não alteram comissão, agenda nem distribuição de clientes, e não há prêmio.
- Testes: offline 23 suítes (nova: gamificação 11); SQL gate_011 com 6 blocos; E2E 15/15.

## Aviso de privacidade no primeiro acesso (D-018)
- Quem cria a conta ou entra pela primeira vez lê o aviso de privacidade e toca em "Li e aceito" para continuar. O aceite fica registrado com data e versão.
- Se o aviso mudar de versão, todos aceitam de novo no próximo acesso.
- Vale para a equipe. O agendamento online pelo cliente continua desligado e tem aviso próprio.
- Testes: offline 22 suítes (nova: privacidade 7); E2E 14/14 (roteiro do convite cobre recusa e aceite).

## Pagamento de comissão e fechamento de caixa salvo (D-017, migration 010)
- **Gestão > Ganhos:** saldo a pagar de cada profissional, com registro de **pagamento**, **vale** (adiantamento) e **estorno**. O profissional consulta o próprio saldo. Pagamento não passa do saldo; vale pode.
- **Fechamento de caixa:** fundo de troco, **sangria** e **suprimento** com motivo, e botão **"Fechar caixa do dia"**, que grava o valor contado e a diferença. Movimento depois do fechamento avisa para fechar de novo.
- Tudo é registro imutável com autor: corrige-se lançando o inverso ou fechando de novo.
- **Monitor de produção:** verificação automática a cada 30 minutos (API, login e site), com aviso por e-mail do GitHub em caso de falha.
- Testes: offline 21 suítes (nova: financeiro-ops 14); SQL gate_010 com 10 blocos, controles negativos e rollback; E2E 14/14.

## Ganhos do profissional, exportação para o contador e código de erro (D-016)
- **Gestão > Ganhos:** comissão, gorjeta e estornos do mês, dia a dia. O profissional vê só os seus; admin e gestão escolhem o profissional. O pagamento não é registrado.
- **Dashboard > "Exportar para o contador (CSV)":** uma linha por item vendido no mês e linha negativa por estorno, com a cota-parte do salão e do profissional. Abre no Excel em português. Não substitui a nota fiscal.
- **Código de erro:** toda resposta da API traz `X-Request-Id`; em erro interno o código aparece também no corpo, para informar ao suporte.
- **Erro interno sem detalhe técnico:** falha inesperada mostra texto genérico e o código; o detalhe fica no log do servidor.
- **Correção:** o app não tenta mais carregar a lista de espera para o profissional, e a aba "Espera" some para ele.
- Testes: offline 20 suítes (nova: ganhos 13); E2E 13/13 (novo: ganhos).

## Estorno de comanda, histórico da agenda e agendamento online (D-013, D-014)
- **Estorno de comanda (migration 009):**
  - total ou parcial, pelo botão "Estornar" em "Comandas do dia" no Dashboard (só gestão);
  - devolve estoque e reembolsa pela forma escolhida;
  - os relatórios descontam o estorno no dia e no mês em que ele acontece, então mês fechado não muda.
- **Histórico financeiro imutável no próprio banco:** nada do caixa, das comandas ou do estoque pode ser alterado ou apagado depois de gravado.
- **Histórico de cada horário da agenda:** criado, confirmado, chegou, na cadeira, cancelado, reagendado e concluído, com quem fez. A confirmação prévia do painel do piloto passa a ser medida no período.
- **Agendamento online pelo link do salão** (`agendar.html`), desligado até a configuração e as aprovações.
- Testes:
  - offline 16 suítes (novas: estorno 14, histórico 12, agendamento público 19);
  - SQL: gate_009 11 blocos, concorrência do estorno, controles negativos e rollback 009→007;
  - E2E 12/12.

## Blueprint Beauty & Wellness (D-012)
- Agenda com presença:
  - "Cliente chegou" e "Iniciar atendimento" na folha do horário;
  - quem já chegou não pode ser marcado como falta;
  - atendimento cancelado ou com falta não volta.
- Fechamento de caixa no Dashboard: total por forma de pagamento, taxa, líquido previsto, gorjetas e conferência do dinheiro contado (mostra falta ou sobra).
- Painel do piloto (gestão): taxa de falta, reagendamento no checkout, retorno do cliente novo e confirmação prévia, comparados com a referência de mercado, também por profissional.
- Correções:
  - gorjeta negativa (desconto escondido) e desconto acima do total agora são recusados;
  - a venda fechada depois das 21h de Brasília caía no dia seguinte, e agora a data da comanda é sempre a do servidor no fuso da empresa.
- Cancelamento tardio: com dados reais do banco (horário com segundos), cancelar no próprio dia nunca contava como tardio, e o horário era lido em UTC; agora conta certo, no fuso da empresa (afeta confiabilidade do cliente e o painel do piloto).
- Segurança: cabeçalhos próprios na API (nosniff, X-Frame-Options DENY, no-referrer, CORP same-site, HSTS em produção, sem X-Powered-By) e corpo JSON até 100 KB; CSP e cabeçalhos no site estático (`render.yaml`).
- CI: novo job `e2e-pwa` roda os 10 roteiros de navegador da PWA sob a CSP (falha com erro de console ou violação de CSP).
- Números com largura fixa em todo o app.
- Análise do blueprint e desenhos de estorno e agendamento online em `docs/planning/`.
- Testes: offline 11 suítes verdes (novas: caixa 7, piloto 10; lembretes 8; onda-b 10); 9 E2E sem erro de console.

## Auditoria, segurança e lembretes (D-011)
- Lembretes de confirmação: na Agenda, botão "Lembretes" lista os horários de amanhã (ou do dia escolhido) ainda não confirmados, com a mensagem pronta no WhatsApp do cliente e o botão "Confirmou".
- Segurança: dependências de produção sem vulnerabilidades conhecidas (antes: 1 crítica, 2 altas); CORS passa a comparar a origem exata.
- Agenda: atendimento já pago (concluído) ou reagendado não pode mais virar cancelado/falta.
- Auditoria de estado e benchmark de mercado em `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md`.
- lembretes-gate 7/7 (com controle negativo); offline 204/204; E2E dos lembretes.

## Produção do banco e trava de migrations (D-010)
- Banco `hopeos-v1` com 001–008 aplicadas pela integração GitHub do Supabase no merge do PR #16; verificação do runbook 12/12.
- `supabase/migrations.lock` + `check_migrations.sh` no CI: migration não autorizada, editada ou apagada reprova o PR, porque o merge na `main` agora executa SQL em produção.

## Onda B (D-009, migration 008)
- Empresa com CNPJ (dígito verificador), razão social e regime de salão-parceiro; relatório mensal de cota-parte (salão × profissionais) no Dashboard da gestão.
- Intervalo de higienização entre atendimentos (0/5/10/15 min), respeitado na sugestão de horários e na trava de agenda do banco.
- Cargos e categorias com herança da comissão: ajuste do profissional → cargo ou categoria → comissão do serviço. Serviços existentes não mudam (`FIXED_SERVICE`).
- Régua de faltas (só alerta): faltas seguidas recentes avisam ao agendar.
- Gestão → Comissões; assistente de configuração com cargos, buffer e dados fiscais.
- migration 008 + rollback; gate_008 com controle negativo; onda-b-gate 9/9; offline 197/197; E2E.

## Assistente de configuração (Onda A, D-008)
- Novo assistente em 6 fases para salão recém-criado: dados, horários, pagamentos, cardápio pronto por nicho, equipe com ajustes por serviço e simulação de atendimento sem gravar no caixa. Retoma de onde parou em qualquer aparelho.
- `GET/PATCH /api/empresa` (antes os dados e horários da empresa só mudavam por SQL) e rotas `/api/onboarding/*`.
- Runbook: o bootstrap do primeiro admin agora cria a empresa e a "Unidade principal" (num banco novo o passo antigo falhava por FK).
- onboarding-gate 9/9; offline 188/188; E2E do assistente.

## Identidade, RBAC e autoria (ADR-005, migration 007) — código pronto, produção pendente
- Migration 007: `app_users` (sincronizado de `auth.users`), `empresa_memberships` com papel fixo, `unidades`, `membership_units`, principal de integração (`integrations`, credenciais só em hash, scopes, auditoria), autoria em comandos/estoque/agenda/clientes, `agendamento_criar` atômico (fecha a corrida de double-booking) e RLS deny-all + revogação de `anon`/`authenticated` em todo `public`. Rollback em `supabase/rollback/007_down.sql`.
- Backend: três mecanismos de autenticação coexistentes (usuário JWT, integração `kxi_…`, legado desligável), RBAC em todas as rotas de negócio, escopo "Próprio" do profissional, autoria injetada pelo servidor, convite por e-mail, recuperação de senha, administração de equipe/unidades/integrações e métricas de adoção.
- CRÍTICO corrigido: dashboard, financeiro, snapshot e insights liam a empresa padrão em vez da empresa do usuário.
- PWA: login, "Defina sua senha" (convite/recuperação), "Esqueci minha senha", seleção de empresa, Gestão > Equipe, UI por papel; token legado continua funcionando.
- Testes: identity-gate 38/38, gate SQL da 007 + teste de concorrência real (com controle negativo) no CI em Postgres 16, E2E Playwright versionados.
- Produção: ver `docs/RUNBOOK_MIGRATION_007.md` (Supabase de produção fora do alcance desta sessão; Render suspenso).

## Agenda — slots-âncora (backend, sem migration)
- Novo `GET /api/agenda/slots?data=&profissionalId=&servicoId=[&duracaoMin=]`: sugere horários livres e marca `ancora`/`recomendado` (encaixes que encostam em abertura, fechamento, almoço ou outro atendimento e deixam a menor sobra inutilizável). Somente leitura; tenant vem de `req.auth`.
- Novo motor puro `backend/src/engines/SlotEngine.js`; aceita os dois formatos de horário existentes (`{seg:{ativo,inicio,fim}}` e `{1:{start,end}}`) e falha fechado sem horário configurado.
- `POST /agenda` passa a gravar a duração com o override do profissional por serviço (`overrides[servicoId].duracao_min`), a mesma regra usada para sugerir os slots.
- `APP_TIMEZONE` (padrão `America/Sao_Paulo`) evita sugerir horário passado e a virada de data UTC.
- Novo gate `schedule-slots-gate.test.js` (18/18) no `test:gate`.
- PWA: chips de encaixe ideal no modal de novo agendamento; prévia e conflito local usam a duração efetiva do backend.
- CI: `.github/workflows/ci.yml` com `npm run test:offline` (141 testes sem banco).
- Fix: acumulado D+N do fluxo de caixa (insights) passou a usar a data-base da curva em vez do relógio do servidor.
- Origem: revisão crítica de uma proposta externa (Gemini "Onda 1 Smart Slots"); schema, RPCs `SECURITY DEFINER` com tenant vindo do cliente e frontend React foram descartados.

## V1.4.2 (parcial)
- Introduzido `req.auth` no middleware de autenticação (empresa_id/user_id/actor_id/role/unit_ids), populado no backend, nunca a partir de claims do cliente.
- Corrigidos 4 pontos sem filtro de tenant (`GET /clientes`, `GET /agenda`, `PATCH /agenda/:id/duracao`, vínculo de agenda em `checkout/close`).
- Bloqueado `unit_id`/`unitId` nos validators de cadastro.
- `SupabaseRepository.insert()` não aceita mais `empresa_id`/`empresaId` do payload; grava sempre `this.empresaId` e falha fechado sem tenant válido.
- Adicionado gate `tenant-boundary-gate.test.js` (12/12) ao `test:gate`.
- `actor_id`, RBAC e tenant por identidade real permanecem BLOQUEADOS — exigem migration 007+ não autorizada.

## V1.4.1
- Implementado middleware de perímetro Bearer com fail-closed.
- Adicionado bootstrap de token e tratamento de erro de autenticação na PWA.
- Adicionados gates automatizados de autenticação.

## V1.4
- Entregues Dashboard Insights, split payment, rebooking, waitlist e melhorias de checkout.
