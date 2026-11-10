# Auditoria de estado + benchmark global e cross-indústria — 2026-11-10

Escopo: código em `main` (`e1cd548`) + branch `ccr-9854814d-ialzxj`, banco `hopeos-v1`, API e PWA em produção, pesquisa web de mercado. Segunda rodada; a primeira é `AUDITORIA_E_BENCHMARK_2026-11.md` (2026-11-08) e continua válida onde esta não a contradiz.

Classificação: REAL, PARCIAL, AUSENTE, CRÍTICO, BLOQUEADO, DESCONHECIDO. Fatos têm evidência no repositório ou fonte citada. **Inferências** e **hipóteses** estão marcadas.

## 1. Veredito
- **O que mudou em 2 dias:** o produto saiu de "não publicado" para **no ar** (API, PWA, banco 001–009, 1 salão, 1 admin). Estorno, fechamento de caixa, histórico de agenda, lembretes e Red Team foram entregues.
- **O que não mudou:** uso real continua **zero**. Nenhum agendamento ou comanda foi gravado em produção. As métricas do piloto seguem DESCONHECIDAS.
- **Contra o mercado:** o back-office está no nível dos concorrentes pagos em comissão, caixa e integridade financeira. As lacunas que restam são quase todas de **integração paga** (pagamento, nota fiscal, mensageria automática) ou exigem **migration** (pagamento de comissão, fechamento de caixa salvo). O que dava para fechar sem nenhum dos dois foi fechado nesta rodada (§3).
- **Alerta de método:** um segundo benchmark em 48 h rende pouco. A primeira auditoria já concluiu que o roadmap deve ser decidido por números do piloto, não por comparação com concorrentes. Isso continua verdadeiro.

## 2. Fatos verificados nesta rodada
| Item | Resultado | Como |
|---|---|---|
| Migrations em produção | 001–009 | Supabase `list_migrations` |
| Advisor de segurança | 30× INFO "RLS sem policy" (deny-all intencional) + **1 WARN: proteção contra senha vazada desligada** | Supabase `get_advisors` |
| API em produção | HSTS ligado; 401 sem token; CORS exato; `/api/public/*` = 404 | `smoke.js` 2026-11-10 |
| PWA em produção | Sem CSP nem cabeçalhos (GitHub Pages) — risco aceito pelo dono | `smoke.js`: `pwa.csp`, `pwa.headers` FAIL |
| Variáveis do Render | `NODE_ENV=production`, `LEGACY_TOKEN_AUTH_ENABLED=false` | print do painel enviado pelo dono (não verificável por fora) |
| Gates offline | 20 suítes verdes (ganhos 13) | `npm run test:offline` com as variáveis do CI |
| E2E da PWA | 13/13 sob a CSP do `render.yaml` | `backend/tests/e2e/run-all.js` |
| Escrita em produção | **Não testada** | Só leituras foram feitas com a conta real |

## 3. Corrigido e completado nesta rodada (D-016)
| Achado | Classe antes | O que foi feito | Prova |
|---|---|---|---|
| Profissional sem nenhum relatório (limite da ADR-005) | PARCIAL | `GET /api/relatorios/meus-ganhos` + aba **Gestão > Ganhos**: comissão, gorjeta e estornos do mês, por dia. Profissional vê só os seus; gestão escolhe o profissional | ganhos-gate G01–G10; E2E `ganhos`; controle negativo: sem a trava de escopo G06 e G08 falham |
| Sem saída para o contador (NFS-e obrigatória, §5) | AUSENTE | `GET /api/relatorios/servicos-prestados` + botão **"Exportar para o contador (CSV)"**: uma linha por item vendido e linha negativa por estorno, com cota-parte do salão e do profissional. Sem dado de cliente | ganhos-gate G04, G11; E2E confere o arquivo baixado |
| A PWA chamava `/lista-espera` para o profissional, que não tem permissão: 2 erros 403 a cada abertura, e a aba "Espera" aparecia para quem não pode usar | REAL (achado pelo E2E novo) | Chamada, botão e aba só para admin, gestão e recepção | E2E `ganhos`: lista de respostas ≥ 400 vazia para os 3 papéis |
| Erro 5xx sem nada que o usuário possa informar ao suporte | AUSENTE (observabilidade) | `X-Request-Id` em toda resposta; o mesmo código vai no corpo do erro 5xx e na linha do log | ganhos-gate G12 |
| Erro interno devolvia ao cliente a mensagem crua da exceção (pode conter nome de tabela ou detalhe do banco) | REAL (vazamento de informação, baixo) | Erro inesperado responde texto genérico + código; o detalhe fica só no log. Erros de regra de negócio (P0001) e erros com status da aplicação não mudam | ganhos-gate G13; sem a correção G13 falha |

Nada disso exigiu migration, fornecedor ou custo.

**Limite desta correção:** os gates usam banco em memória, que não reproduz erros do Postgres. Se alguma tela dependia da mensagem crua do banco para orientar o usuário, ela passa a mostrar o texto genérico. Só o uso real revela; o código no texto permite achar a causa no log.

## 4. Lacunas abertas
| # | Lacuna | Classe | Exige | Encaminhamento |
|---|---|---|---|---|
| 1 | Uso real (1 agendamento → comanda → caixa → estorno com dado real) | AUSENTE | 30 min do dono com a sessão acompanhando | Próxima ação (§8) |
| 2 | Infra gratuita para sistema de caixa (pausa, sem backup baixável, serviço que dorme) | REAL (risco) | Decisão de custo | Antes do 1º cliente pagante |
| 3 | Pagamento de comissão (fechamento, vale, adiantamento) | AUSENTE — só o cálculo e o extrato existem | Migration 010 | `INTEGRACOES_FUTURAS.md` §4 |
| 4 | Fechamento de caixa salvo (abertura, sangria, suprimento, quem fechou) | PARCIAL — conferência só na tela | Migration | `INTEGRACOES_FUTURAS.md` §5 |
| 5 | Sinal/depósito, Pix integrado, clube de assinatura | AUSENTE | Gateway + migration + autorização (Onda C) | `INTEGRACOES_FUTURAS.md` §1 |
| 6 | NFS-e emitida pelo sistema | AUSENTE — mitigado pelo CSV | Fornecedor de emissão ou API do Emissor Nacional + contador | `INTEGRACOES_FUTURAS.md` §2 |
| 7 | Lembrete e lista de espera automáticos (WhatsApp API) | PARCIAL — manual via wa.me | Fornecedor pago + opt-in (LGPD) | `INTEGRACOES_FUTURAS.md` §3 |
| 8 | Agendamento online pelo cliente | REAL no código, **desligado** | Aviso de privacidade aprovado + Red Team em produção | D-014 |
| 9 | PWA sem CSP (GitHub Pages) e repositório inteiro publicado | REAL — risco aceito | Migrar o site para o estático do Render | Antes de clientes pagantes |
| 10 | Dados de negócio sem `unit_id` (multiunidade) | PARCIAL | Migration | Só quando houver salão com 2 unidades |
| 11 | Alertas de falha em produção | PARCIAL — agora há código de requisição, mas ninguém é avisado | Fornecedor ou rotina de leitura de log | `INTEGRACOES_FUTURAS.md` §6 |
| 12 | Proteção contra senha vazada (Supabase Auth) | AUSENTE (advisor WARN) | Ligar no painel; **não verifiquei** se o plano gratuito permite | Dono |

## 5. Pontos cegos
- **NFS-e deixou de ser "futuro".** A primeira auditoria registrou datas divergentes. A Resolução CGSN 191/2026 fixou **1º de novembro de 2026** para ME e EPP do Simples emitirem pelo padrão nacional ([Fenacon](https://fenacon.org.br/reforma-tributaria/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026/), [LegisWeb](https://www.legisweb.com.br/noticia/?id=34185), [Contábeis](https://www.contabeis.com.br/noticias/76438/nfs-e-nacional-sera-obrigatoria-para-me-e-epp-do-simples/)). Todo salão piloto nesse regime já está obrigado. O HOPE OS não emite; o CSV desta rodada é apoio ao contador, não substituto. O enquadramento do salão e da cota-parte do parceiro na nota precisa de contador: a busca **não encontrou** fonte sobre isso.
- **Nenhuma escrita foi vista em produção.** Os 20 gates e os 13 E2E rodam contra banco em memória ou Postgres local. A divergência memória × Supabase real só aparece com dado real.
- **Comissão zerada passa despercebida.** Serviço cadastrado sem comissão gera ganho R$ 0,00 sem aviso. O seed de desenvolvimento é assim. No piloto, conferir a aba Comissões antes da primeira comanda.
- **E-mail de convite e recuperação.** **Hipótese a verificar:** o envio embutido do Supabase tem limite baixo por hora e serve para testes. Convidar a equipe inteira de uma vez pode falhar em silêncio.
- **Um único administrador.** Se a conta do dono ficar inacessível e o e-mail de recuperação falhar, a única saída é SQL autorizado no banco.
- **LGPD além do aviso.** Não há fluxo para exportar ou apagar os dados de um cliente que pedir. O ledger é imutável, então a exclusão exige anonimização por migration.
- **Sem rede.** A PWA guarda só a casca do app; sem internet nada funciona. Isso é correto para um sistema cujo servidor é a fonte da verdade (§6, PDV), mas **não verifiquei** se a tela avisa claramente que está sem conexão.
- **Backup.** Existe `backend/scripts/export-to-data.js`. **Não foi testado nesta rodada** contra o banco real; pode ser o backup manual semanal enquanto a infra for gratuita.

## 6. Benchmark
A maior parte das fontes é material de fornecedor ou de afiliado; preços conflitam entre si. Leia como direcional.

### Segmento — global
| Fornecedor | Posicionamento e preço citado | Fonte |
|---|---|---|
| Fresha | Núcleo gratuito, ganha em pagamentos e marketplace; taxas precisam de conferência | [Dupple](https://dupple.com/learn/best-salon-booking-software), [Koalendar](https://koalendar.com/blog/fresha-alternatives-salon-software) |
| Booksy | Marketplace para captar cliente; a partir de US$ 29,99/mês + por profissional (página do próprio fornecedor) | [Booksy](https://biz.booksy.com/blog/best-salon-software-2026) |
| Vagaro | Tudo-em-um para pequeno e médio; comparativos citam de ~US$ 25 a ~US$ 129/mês conforme o plano (a busca não identificou qual fonte dá cada valor); cobra aluguel de cadeira automaticamente | comparativos: [Toolradar](https://toolradar.com/guides/best-salon-booking-software), [Dupple](https://dupple.com/learn/best-salon-booking-software); [Vagaro](https://www.vagaro.com/en-ca/learn/salon-payroll-employee-tips) |
| Square Appointments | Entrada simples para quem já usa Square em pagamentos | [Koalendar](https://koalendar.com/blog/fresha-alternatives-salon-software) |
| Boulevard | Premium; um comparativo cita ~US$ 158/mês no plano de entrada (fonte exata não identificada pela busca) | comparativos: [Dupple](https://dupple.com/learn/best-salon-booking-software), [The Salon Business](https://thesalonbusiness.com/best-salon-software/) |
| Zenoti | Redes (3+ unidades ou 10+ profissionais); folha nativa com comissão em faixas | [Zenoti](https://zenoti.com/thecheckin/best-salon-software-comparison), [Zenoti folha](https://www.zenoti.com/thecheckin/best-salon-commission-payroll-software) |
| Phorest | Retenção e reagendamento automático; sem preço público | [Capterra](https://www.capterra.com/p/113530/Phorest-Salon-Software/alternatives/) |

### Segmento — Brasil
| Fornecedor | O que foi encontrado | Fonte |
|---|---|---|
| Belasis | A partir de R$ 52/mês | [GetApp](https://www.getapp.com/all-software/a/belasis/) |
| Trinks | Gestão + app em que o cliente encontra e agenda. Preço: **não encontrado** com moeda e plano | [GetApp](https://www.getapp.com/all-software/a/trinks/) |
| Avec | Tudo-em-um, médio e grande porte, app do cliente. Preço: **não encontrado** | [Mercado Pago](https://www.mercadopago.com.br/blog/ferramentas-automatizar-agenda-pagamento-salao) |
| AppBarber | Barbearia: agendamento online, comanda, comissão e clube de assinatura (citado por concorrente). Preço: **não encontrado** | [Visio AI](https://visioai-website.netlify.app/r/best-management-systems-barbershop-salon-chains-2026) |

### Capacidade × HOPE OS
| Capacidade | Mercado | HOPE OS | Evidência |
|---|---|---|---|
| Agenda sem conflito | Padrão | REAL | advisory lock (007), teste de concorrência |
| Agendamento online pelo cliente | Padrão | REAL no código, desligado | `agendar.html`, publico-gate 19 |
| Lembrete | Automático; IA liga 24 h antes (fornecedores) | PARCIAL — manual via wa.me | lembretes-gate |
| Lista de espera | Automática: avisa o próximo quando abre vaga (Fresha, Booksy, segundo fornecedor) | PARCIAL — sugere quem chamar | `promptWaitlistCandidates` |
| Sinal/cartão em arquivo | "O redutor de falta mais confiável" (fornecedor) | AUSENTE — a régua já aponta quem exigiria | `NoShowLadder.js` |
| Recepcionista com IA | Em expansão; avulso a ~US$ 109/mês + instalação (fornecedor) | AUSENTE — não recomendado antes do piloto | — |
| PDV + pagamento integrado | Padrão | PARCIAL — checkout e ledger REAL, sem gateway | `checkout_close` |
| Estorno auditável | Comum | REAL | migration 009, estorno-gate 14 |
| Fechamento de caixa | Padrão em PDV | PARCIAL — conferência sem salvar | `CaixaEngine.js` |
| Comissão (faixas, serviço × produto, híbrido com aluguel) | Zenoti, Mangomint, Vagaro | REAL e acima da média no cálculo (herança + 3 modelos + cota-parte) | onda-b-gate |
| Extrato do profissional | Comum nos apps de equipe (**inferência**, sem fonte nesta rodada) | **REAL (novo)** | ganhos-gate, E2E |
| Pagamento/folha de comissão | Zenoti nativo; Meevo via ADP; Homebase leva gorjeta à folha | AUSENTE | — |
| Nota fiscal (BR) | Comum nos nacionais | AUSENTE — CSV para o contador (novo) | `servicos-prestados` |
| Estoque | Comum | REAL | `InventoryEngine.js` |
| Retenção com inteligência | Phorest, Zenoti | REAL, sem campanha automática | `/insights/*` |
| Marketplace | Booksy, Fresha, Trinks | AUSENTE — não recomendado (exige escala) | — |

### Cross-indústria
| Indústria | Prática | Fonte | HOPE OS |
|---|---|---|---|
| Restaurante (PDV) | Fechamento do dia (relatório Z): contar gaveta contra o relatório, liquidar lotes, registrar pendências. Toast **bloqueia** o fechamento sem rede; Square aceita pagamento offline mas não fecha o dia offline | [Toast](https://doc.toasttab.com/doc/platformguide/platformCloseOutDayOverview.html), [Square](https://squareup.com/help/article/6594-end-of-day-reporting-with-square-for-restaurants) | PARCIAL: conferência existe, não é salva (lacuna 4). **Não copiar** venda offline: num ledger imutável, reconciliar depois é o maior risco |
| Restaurante (PDV) | Após o fechamento do dia, nenhuma transação entra naquele dia | [Eats365](https://support.eats365pos.com/perform-end-of-day-and-other-end-of-day-activities) | REAL por desenho: estorno entra no dia do estorno; dia fechado não muda |
| Saúde | Lembrete + depósito só para quem tem risco | 1ª auditoria | Lembrete REAL; sinal encaminhado (Onda C) |
| Folha/RH | Gorjeta em dinheiro e cartão fluindo para o pagamento; atenção ao piso quando a comissão não cobre | [Homebase](https://www.joinhomebase.com/blog/salon-software-with-payroll) | Gorjeta REAL no extrato (novo); pagamento AUSENTE. Piso e vínculo são tema do **parecer trabalhista** pendente |
| Contabilidade | Entrega mensal em planilha para o contador | prática geral (**inferência**) | **REAL (novo)**: CSV pt-BR, protegido contra fórmula |
| SaaS/suporte | Código de requisição que o usuário informa ao suporte | prática geral (**inferência**) | **REAL (novo)**: `X-Request-Id` |
| Recepção com IA | Escalar para humano: reclamação, alergia, contraindicação, pacote de noiva | [CallMissed](https://www.callmissed.com/blog/ai-receptionist-salons-2026-phone-whatsapp-implementation) | Guardar como requisito se a Onda C incluir IA |

## 7. Causa raiz
O que resta não é falta de código: é **falta de uso** e **decisões do dono** (custo de infra, fornecedor de pagamento e de nota, parecer trabalhista, aviso de privacidade). Continuar adicionando funcionalidade antes do primeiro dia de uso real aumenta a superfície sem aumentar a certeza.

## 8. Prioridade (uma por vez)
1. **Teste de ponta a ponta com dado real** em produção: cliente → agendamento → atendimento → comanda → caixa → ganhos → estorno → CSV. Critério: os números da tela batem com o banco, sem erro 5xx.
2. **Piloto de 30 dias** com os 4 números (falta, reagendamento, retorno do cliente novo, tempo de fechamento de caixa).
3. **Decidir a migration 010** (pagamento de comissão + fechamento de caixa salvo) só se o piloto mostrar que a falta disso dói.
4. **Infra paga + migração do site** antes do primeiro cliente pagante.

## 9. Recomendação
Parar de construir e usar. As quatro entregas desta rodada fecham o que era possível sem migration, fornecedor ou custo. Tudo o mais está descrito em `docs/planning/INTEGRACOES_FUTURAS.md` com contrato, pré-requisitos e critério de aceite, pronto para quando houver decisão.
