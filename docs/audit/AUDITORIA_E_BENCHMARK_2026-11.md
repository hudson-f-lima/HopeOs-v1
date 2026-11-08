# Auditoria de estado + benchmark global e cross-indústria — 2026-11-08

Escopo: código em `main` (`5cff579`) e no branch `ccr-9854814d-ialzxj`, banco `hopeos-v1`, CI e pesquisa web de mercado.

Classificação dos achados: REAL, PARCIAL, AUSENTE, CRÍTICO, BLOQUEADO, DESCONHECIDO.

Fatos têm evidência no repositório ou numa fonte citada. **Inferências** e **hipóteses** estão marcadas como tal.

## 1. Veredito
- **Núcleo de produto: sólido.** Agenda com trava atômica, checkout com ledger imutável, comissão com herança, RBAC por papel e isolamento de tenant por vínculo. São 204 testes offline, mais testes SQL no CI e E2E.
- **Produto em produção: inexistente.** O banco está pronto (001–008), mas o backend não está publicado: Render suspenso por decisão do dono. Valor entregue a cliente real hoje: **zero**.
- **Contra o mercado: forte no back-office, fraco na ponta do cliente final.** Todos os concorrentes relevantes têm agendamento online pelo cliente, lembretes automáticos e pagamento integrado. O HOPE OS não tem nenhum dos três (os lembretes agora existem no modo manual, D-011).
- **Maior risco antes de cobrar de alguém:** infraestrutura gratuita para um sistema de caixa.
  - O plano gratuito do Supabase pausa o banco após ~7 dias sem atividade (aconteceu em 2026-11-08) e não tem backup para download.
  - O plano gratuito do Render dorme o serviço quando ocioso. A primeira abertura do dia demora (**hipótese**: dezenas de segundos; não medido).

## 2. Auditoria brutal
### Pontos fortes (REAL)
| Área | Evidência |
|---|---|
| Backend como fonte da verdade (agenda, financeiro, comissão, estoque) | Rotas com `authorize()`; RPCs `checkout_close`, `agendamento_criar` |
| Double-booking fechado no banco | Advisory lock (007); teste de concorrência com controle negativo |
| Identidade, RBAC e tenant | ADR-005, migration 007; identity-gate 38/38 |
| Comissão com herança (ajuste → cargo/categoria → serviço) e 3 modelos de taxa | Onda B; onda-b-gate 9/9 |
| Inteligência de retenção já embutida | `/insights/*`: RFM, risco de abandono, confiabilidade, sugestão de reagendamento no checkout, attach, margem, ocupação, fluxo de caixa |
| Onboarding guiado em 6 fases | Onda A; E2E do salão vazio até o app |
| Disciplina de engenharia | CI com gates offline + SQL em Postgres 16; rollback testado; migrations travadas por hash (D-010) |

### Corrigido nesta auditoria (D-011)
| Achado | Classe | Correção | Prova |
|---|---|---|---|
| Dependências de produção: `proxy-addr` crítica, `body-parser` alta, `qs`/`morgan` moderadas; `xlsx` alta sem correção | REAL | `express` 4.22.3 / `morgan` 1.12.1 no lockfile; `xlsx` passou a `devDependencies` (só os scripts locais de importação usam) | `npm audit --omit=dev`: **0 vulnerabilidades** |
| CORS comparava por substring: `https://hudson-f-lima.github.io.evil.com` e `https://localhost.evil.com` recebiam permissão | REAL (impacto baixo: a API usa Bearer, não cookie) | Comparação exata por origem | lembretes-gate L07; falha sem a correção |
| `PATCH /agenda/:id/status` aceitava qualquer transição: atendimento já pago podia virar "cancelado"/"no_show", e um reagendado podia voltar a "confirmado". Distorce régua de faltas, retenção e confiabilidade | REAL, P1 | `concluido`/`fechado`/`reagendado` são finais → 409 `INVALID_STATUS_TRANSITION` | lembretes-gate L06; falha sem a correção |
| Texto em inglês na UI ("Agendamento updated.") | REAL, cosmético | "Agendamento atualizado." | — |
| Sem lembrete de confirmação (falta é a maior perda evitável do setor, §3) | AUSENTE | Lembretes por WhatsApp (wa.me) com texto pronto e "Confirmou" | lembretes-gate L01–L05; E2E |

### Pontos fracos e lacunas (abertos)
| # | Lacuna | Classe | Por que importa | Exige |
|---|---|---|---|---|
| 1 | Backend não publicado | BLOQUEADO (decisão do dono) | Sem uso real, sem dado, sem receita | Reativar Render (runbook 5–7) |
| 2 | Infra gratuita para caixa: pausa por inatividade, sem backup baixável, serviço que dorme | REAL (risco) | Perda ou indisponibilidade de dado financeiro | Decisão de custo: Supabase Pro + Render pago antes do 1º cliente pagante |
| 3 | Cancelamento/estorno de comanda | AUSENTE | Erro de caixa hoje não tem correção auditável; o ledger é imutável por desenho, então precisa de lançamento de estorno | Migration 009 (autorização) |
| 4 | Agendamento online pelo cliente (link público) | AUSENTE | Item básico em todos os concorrentes (§3) | Rota pública sem login + anti-abuso; sem migration se reusar `agendamento_criar` (**inferência**) |
| 5 | Abertura/fechamento de caixa e conferência | PARCIAL (`caixa_movimentos` é gravado; não há tela de fechamento) | Controle diário de dinheiro | Provavelmente sem migration (**inferência**) |
| 6 | Pagamento de comissão (fechamento, vales, adiantamentos) | AUSENTE (só o cálculo existe) | Dor recorrente do dono de salão | Migration |
| 7 | Sinal/depósito, clube de assinatura, Pix integrado | AUSENTE (Onda C) | Maior alavanca de receita e de falta (§3) | Gateway + autorização |
| 8 | NFS-e | AUSENTE | Padrão nacional obrigatório para ME/EPP do Simples desde set/nov-2026 (fontes divergem na data) | Fornecedor de emissão + contador |
| 9 | Sessão em `localStorage` | PARCIAL | Um XSS rouba o token; mitigado por `escapeHtml` em toda renderização | CSP no site estático (Render `headers`) |
| 10 | Token legado ligado (`LEGACY_TOKEN_AUTH_ENABLED=true`) | PARCIAL | Quem tem o token age sem RBAC nem autoria | Desligar após medir adoção (`/admin/auth-metrics`) |
| 11 | `test:gate` integrado e E2E fora do CI | DESCONHECIDO / PARCIAL | Divergência memória × Supabase real passa despercebida | Chave do projeto no CI; Playwright no Actions |
| 12 | Arquivos legados na raiz (`index.pre-merge-v1.1.backup.html` 80 KB, `frontend/` 220 KB, `test-10-comandas.sh`) publicados pelo site estático (`staticPublishPath: .`) | REAL (baixo: o repo é público) | Ruído; o site serve o repo inteiro | Limpeza ou pasta de publicação dedicada |
| 13 | 41 chaves estrangeiras sem índice (advisor) | REAL, INFO | Sem impacto com banco vazio | Migration futura, medir antes |
| 14 | Observabilidade: só `morgan` no console; sem rastreio de erro | AUSENTE | Falha em produção passa sem alerta | Log estruturado/alerta (fornecedor ou Render logs) |

### Pontos cegos
- **Nenhuma métrica de produto existe** porque não há uso. Taxa de falta, de reagendamento, de retorno do cliente novo e ticket médio: todas DESCONHECIDAS. Qualquer roadmap sem esses números é aposta.
- **Validação com cliente real: zero.** Presets do onboarding, régua de faltas e textos de lembrete são hipóteses.
- **Celular é o canal do dono.** O próprio Platform Owner não conseguiu operar o Supabase pelo celular (2026-11-08). O PWA precisa ser testado em aparelho real, não só em viewport de 390 px.

### Causa raiz
O produto foi construído de dentro para fora: motor, segurança, finanças. Isso está certo para um sistema de caixa. Mas a camada que gera tração foi adiada: cliente final, lembrete, pagamento. E **o deploy foi tratado como etapa final, não contínua**, então nenhum aprendizado de uso real retroalimenta as decisões.

### Prioridade (uma por vez)
1. **Publicar com infra adequada** (lacunas 1 e 2). Sem isso, nada abaixo tem valor.
2. **Estorno de comanda** (3): risco operacional desde o 1º dia de caixa.
3. **Agendamento online pelo cliente** (4): o item mais universal do mercado.
4. **Sinal só para cliente de risco + clube de assinatura com Pix** (7): receita e falta. Depende de gateway.

## 3. Benchmark
### Mercado (global e Brasil)
A maior parte das fontes é material de fornecedor ou de afiliado. Leia como direcional.

| Fornecedor | Posicionamento citado | Fonte |
|---|---|---|
| Fresha | Tudo-em-um; um review independente aponta taxa de ~20% sobre cliente novo vindo do marketplace (não confirmado em 2ª fonte) | [Koalendar](https://koalendar.com/blog/fresha-alternatives-salon-software), [Fresha](https://www.fresha.com/for-business/salon/best-salon-software) |
| Booksy | Marketplace forte para descoberta, foco em barbeiro; densidade cai fora das capitais | [SchedulingKit](https://schedulingkit.com/compare/booksy-vs-vagaro), [Addagio](https://addagio.io/best/best-barber-booking-software) |
| Vagaro | Back-office mais completo; entrada ~US$ 20–30/mês por agenda | [SchedulingKit](https://schedulingkit.com/compare/booksy-vs-vagaro), [Toolradar](https://toolradar.com/compare/booksy-vs-vagaro) |
| Boulevard | Premium (a partir de ~US$ 175/mês); recepção com colunas de status (aguardando/em atendimento/concluído) | [Zoca](https://www.zoca.com/post/best-salon-and-spa-software-in-2026-what-actually-helps-you-grow) |
| Zenoti | Tudo-em-um para redes; recepcionista com IA para ligação perdida; lista de espera automática por SMS/e-mail | [Zenoti](https://zenoti.com/thecheckin/best-salon-management-software-2026), [Zenoti waitlist](https://zenoti.com/platform/waitlist-management) |
| Phorest | Foco em retenção/CRM/fidelidade; IA de recepção lançada em jun/2026 | [Stork](https://www.stork.ai/en/phorest) |
| Trinks, Avec, Belasis, AppBarber (BR) | Agendamento online, CRM e comissionamento; Avec para médio/grande porte; AppBarber para barbearia. **Preços não encontrados** | [Mercado Pago](https://www.mercadopago.com.br/blog/ferramentas-automatizar-agenda-pagamento-salao), [GetApp](https://www.getapp.com/all-software/a/trinks/) |

| Capacidade | Mercado (comum) | HOPE OS |
|---|---|---|
| Agendamento online pelo cliente | Padrão em todos | AUSENTE |
| Marketplace/descoberta | Booksy, Fresha | AUSENTE (não recomendado: exige escala) |
| Lembrete de confirmação | Automático (SMS/WhatsApp) | PARCIAL: manual via wa.me (D-011) |
| Sinal/depósito, política de falta | Comum | AUSENTE (régua já identifica o risco) |
| Lista de espera | Automática nos premium | PARCIAL: sugere candidatos ao cancelar, contato manual |
| PDV + pagamento integrado | Padrão | PARCIAL: checkout e ledger REAL; sem gateway |
| Comissão | Comum | REAL e acima da média (herança + 3 modelos de taxa + cota-parte do salão-parceiro) |
| Estoque | Comum | REAL |
| Retenção/CRM com inteligência | Phorest, Zenoti | REAL (insights) — sem campanha automática |
| Recepcionista com IA | Zenoti, Phorest (novo) | AUSENTE |
| Assinatura/clube | Tendência em barbearia BR | AUSENTE |
| NFS-e (BR) | Comum nos nacionais | AUSENTE |

**Diferencial defensável (inferência):** cota-parte da Lei do Salão-Parceiro, herança de comissão e o rigor financeiro (ledger imutável, trava atômica). O diferencial não está em agenda nem em marketplace, onde há gigantes.

### Números de referência do setor
- **Falta (no-show) em salão:** ~10–20%, com fontes conflitantes ([SchedulingKit](https://schedulingkit.com/statistics/no-show-statistics), [Salon Today](https://www.salontoday.com/1076870/no-shows-does-your-city-have-a-high-rate)).
- **Reagendamento no checkout:** média ~40–52%, topo 70–80%+ ([Kitomba](https://www.kitomba.com/blog/industry-insights-rebooking-rates-for-the-hair-and-beauty-industry-and-how-to-improve-yours/), [SalonIQ](https://www.saloniq.com/article/increase-your-salon-bookings/)).
- **Retorno do cliente novo:** ~30–35%; topo 70%+ ([Phorest](https://www.phorest.com/?p=10215), [Boulevard](https://www.joinblvd.com/blog/client-retention-formula)).

### Cross-indústria: o que copiar
| Indústria | Prática | Evidência | Aplicação no HOPE OS |
|---|---|---|---|
| Saúde (ambulatório) | Lembrete antes da consulta | Meta-análise de 10 ensaios: ~+11% de comparecimento; SMS ≈ telefone. Estudo citado de 2ª mão: falta de 13,6% com lembrete da equipe × 17,3% automático × 23,1% sem lembrete ([SchedulingKit](https://www.schedulingkit.com/blog/average-no-show-rates-by-industry), [Koalendar](https://koalendar.com/blog/how-to-reduce-no-show-appointments)) | **Feito (D-011):** lembrete manual pela equipe, com o melhor resultado no estudo citado e sem custo de fornecedor |
| Saúde (clínica do sono) | Depósito + lembrete + orientação | Falta caiu de 9,1% para 4,3% ([CHI](https://child.chi.sg/learn/child-collection/projects/deposit-collection-reduces-no-show-rates-for-sleep-studies/)) | Sinal **só** para cliente que a régua marca como `exigir_sinal` (Onda C) — não para todos |
| Med spa / clínicas | Lista de espera com janela de resposta (~15 min) e "quem responder primeiro leva" | Prática de fornecedor ([SchedulingKit](https://schedulingkit.com/features/waitlist-management), [Pabau](https://pabau.com/features/waitlist-software/)) | Evolução da lista de espera atual: ordenar por antiguidade e marcar oferta com prazo |
| SaaS/streaming + Pix Automático | Receita recorrente com débito sem cartão | Pix Automático: +170% de receita processada no 1º ano segundo a PagBrasil (dado da própria empresa) ([Let's Money](https://www.letsmoney.com.br/noticias/pagbrasil-pix-automatico-um-ano-recorrencia/)). Clubes de barbearia a R$ 69,90–170/mês ([exemplo Asaas](https://www.asaas.com/c/w86bo58wgzmsyvp4)) | Clube de assinatura (Onda C): receita previsível, ocupação de horário ocioso |
| Varejo | Venda adicional no caixa | Já medido em `/insights/attach` | Sugerir produto no checkout pelo histórico |
| Aviação/hotelaria | Overbooking controlado | — | **Não copiar:** o encaixe forçado (`permitirConflito`) já cobre o caso real sem prometer o que não cabe |

## 4. Recomendação
**Ação de maior impacto: publicar o que existe, com infraestrutura paga mínima, num salão piloto, e medir 4 números por 30 dias:**
- taxa de falta;
- reagendamento no checkout;
- retorno do cliente novo;
- tempo de fechamento de caixa.

Todo o resto do roadmap (agendamento online, sinal, clube) deve ser decidido por esses números, não por benchmark.

Critério de validação do piloto: **30 dias de uso diário sem perda de dado nem caixa divergente**, com os 4 números medidos.
