# Análise — "Blueprint SaaS Beauty, Barber & Wellness" (2 versões, 2026-11-08)

## Origem e escopo
- Origem: dois documentos externos enviados pelo Platform Owner, ambos com o pedido "Analise e desenvolva e2e, fix os pontos cegos":
  - "Especificação Completa / Master Prompt";
  - "Documentação Técnica e Blueprint".
- A segunda versão contém a primeira e acrescenta: ficha técnica de insumos, gorjeta, assinaturas, roteamento por retenção (SRS), gamificação, quiz, carteira de cashback, TV de sala de espera e uma procedure de fechamento.
- Continuação da análise anterior em `docs/planning/ONBOARDING_SETUP_ANALISE.md` (Ondas A e B, já implementadas). O que já foi decidido lá não é repetido aqui.
- Classificação: REAL, PARCIAL, AUSENTE, CRÍTICO, DESCONHECIDO. SQL desta página é `DRAFT ONLY`.

## 1. Veredito
- **Já temos, e com mais rigor que a spec:**
  - herança da comissão em 3 níveis;
  - os 3 modelos de taxa;
  - gorjeta com desconto proporcional da taxa;
  - buffer de higienização;
  - onboarding em 6 fases com simulação que não grava;
  - régua de faltas;
  - cota-parte do salão-parceiro;
  - trava contra horário duplicado.
- **A spec tem defeitos graves no próprio desenho** (§3): a trava de agenda não protege a maioria dos horários, e a procedure de fechamento não confere o tenant nem é idempotente. Copiar o DDL e o SQL dela introduziria falhas que o HOPE OS já fechou.
- **Implementado agora** (§4), sem migration e sem fornecedor: presença na agenda (cliente chegou → na cadeira) com máquina de estados completa, e números tabulares.
- **Maior ponto cego da spec: risco trabalhista.** Metas, ligas, quiz com prêmio em dinheiro, bônus por "terminei cedo", avaliação 360° e distribuição de clientes por desempenho são indícios de subordinação. A Lei 13.352/2016 pressupõe autonomia do profissional-parceiro (**inferência jurídica**; validar com advogado trabalhista antes de qualquer item de gamificação).

## 2. Matriz spec × código
| Item da spec | HOPE OS | Classe | Exige |
|---|---|---|---|
| Herança: override → cargo/categoria → serviço | `CommissionResolver.js`; serviço sem cargo/categoria cai na comissão do próprio serviço. A spec cai num `50.0` fixo | REAL (melhor) | — |
| 3 modelos de taxa; DIVIDIDO como padrão | `bruto_salao`, `dividido`, `bruto_staff`; presets de cargo já usam `dividido` | REAL | — |
| Gorjeta com taxa proporcional | `FinanceEngine.js:90-118` (rateio da taxa por gorjeta, em centavos inteiros) | REAL | — |
| Pagamento dividido em várias formas | Suportado; a procedure da spec aceita uma forma só | REAL (melhor) | — |
| Ficha técnica de insumos (BOM) descontada antes da partilha; profissional que traz o próprio produto | Não existe: o estoque baixa só produto vendido | AUSENTE | Migration (receitas por serviço) + decisão de regra |
| Máquina própria + teto de dívida | Não existe | AUSENTE | Migration + Onda C |
| Sinal 50% / datas especiais / overtime +20% | Régua só alerta | AUSENTE | Gateway (Onda C) |
| Presença: check-in, na cadeira | Status `aguardando`/`em_atendimento` no CHECK da 001, mas fora do fluxo | **Feito agora** (§4) | — |
| Telemetria com horários (check-in, início, fim) | Sem colunas de horário de presença | PARCIAL | Migration (colunas de timestamp) |
| Clube de assinatura / pacotes | Não existe | AUSENTE | Migration + Pix Automático (Onda C) |
| Roteamento por retenção (SRS) | Retenção por profissional ainda não calculada | AUSENTE | KPIs por profissional (Agente B), depois decisão |
| Gamificação, ligas, quiz Kahoot, bônus por agilidade | Não existe | AUSENTE — **não recomendado** sem parecer jurídico (§3.4) | Decisão + parecer |
| Carteira de cashback, indicação | Não existe | AUSENTE | Migration + contabilidade (passivo) |
| TV de sala de espera em tempo real | Não existe; o frontend nunca fala direto com o banco (RLS deny-all) | AUSENTE | Endpoint de leitura anonimizado; realtime exigiria mudar a arquitetura |
| Onboarding que bloqueia a operação até completar | Assistente retomável com "fazer depois" (D-008) | Divergência intencional | — |
| Design system: tokens, `tabular-nums` | Paleta violeta Material próxima; `tabular-nums` **feito agora** | PARCIAL | Rebrand = decisão de produto |
| Gavetas, ⌘K, atualização otimista com desfazer | Modais e folha de ações; sem ⌘K | PARCIAL | ⌘K serve teclado de desktop; o uso real é celular |
| Next.js/TS, RLS por tenant, exclusion constraint | Rejeitados em D-007 e na análise anterior | Rejeitado | — |

## 3. Pontos cegos da spec
### 3.1 Trava de agenda que não trava — CRÍTICO no desenho
`EXCLUDE ... WHERE (deposit_status IN ('PAID', 'HELD'))`:
1. `'HELD'` não existe no enum `deposit_status_enum` (`NONE, PENDING, PAID, FORFEITED, REFUNDED`). O `CREATE TABLE` falha.
2. Corrigido o enum, a trava só vale para horário com sinal pago. A grande maioria dos horários (`NONE`) pode ser duplicada em concorrência.
3. Ela também bloquearia o encaixe consciente.

**HOPE OS:** `agendamento_criar` com advisory lock (007/008), teste de concorrência com controle negativo, buffer incluído.

### 3.2 `process_checkout_atomic` — CRÍTICO no desenho
| Falha | Consequência | HOPE OS |
|---|---|---|
| Não confere o tenant do agendamento nem da forma de pagamento; `SECURITY DEFINER` sem `search_path` e sem `revoke` | Qualquer chamador fecha comanda de outro salão e usa a taxa de outro salão | `checkout_close` com tenant, `search_path`, grants só `service_role` (003/007) |
| Sem idempotência | Duplo clique ou retry refaz o cálculo; a função sobrescreve o registro | Chave de idempotência |
| Grava o dinheiro com `UPDATE appointments` | Sem trilha: o valor anterior se perde | Ledger em tabelas próprias, autoria (007) |
| Forma de pagamento inexistente → `NULL` | Totais nulos gravados como pagos | Validação + erro |
| Desconto maior que o preço é zerado em silêncio; gorjeta negativa aceita | Contas inconsistentes | Validadores |
| Só implementa DIVIDIDO | BRUTO e COLABORADOR ASSUME ignorados no fechamento | 3 modelos no `FinanceEngine` |
| `ROUND` separado de profissional e salão | Soma pode diferir 1 centavo da base | Centavos inteiros com rateio |

### 3.3 Fórmulas e TypeScript
- **`calculatePayout` (versão 1):**
  - usa `number` em reais com `toFixed`, que tem erro de ponto flutuante;
  - na máquina própria devolve `proNetPayout = gross` **e** `salonNetPayout = salonShare`: a soma excede o valor recebido. Contagem dupla.
- **Comissão por categoria:** a categoria sem comissão cai em `50.0` fixo, um valor inventado. O nosso cai na comissão do serviço.
- **SRS:**
  - `totalNewClientsToday % 5 === 0` manda o **primeiro** cliente do dia (0 % 5 = 0) para o profissional em ramp-up;
  - ordenar pela taxa crua premia amostra pequena: 2 de 2 clientes retidos (100%) vence 160 de 200 (80%). Exige suavização (ex.: média bayesiana com prior do salão) e um mínimo de clientes;
  - o score fica gravado numa tabela, que diverge da realidade sem recálculo.
- **Contadores gravados que divergem da fonte** (`client_risk_profiles.consecutive_no_shows`, `professional_goals.achieved_*`, `client_wallets.balance_amount` + `wallet_ledger`, `current_debt_amount`): dois lugares para a mesma verdade. **HOPE OS:** a régua e a confiabilidade são derivadas da agenda (`NoShowLadder.js`, `RetentionService.js`).
- **Quiz:** resposta certa vale no mínimo 500 mesmo após o tempo-limite. Não há validação de tempo do lado do servidor, então o tempo pode ser forjado pelo cliente.
- **`referral_code UNIQUE` global e `tenant_id` sem FK nem tabela de tenants:** colisão entre salões e nenhum isolamento garantido pelo banco.

### 3.4 Produto, jurídico e operação
- **Salão-parceiro × gestão de desempenho (inferência, validar):**
  - metas impostas, ligas, ranking, avaliação 360°/9-box pelo gestor, quiz obrigatório com prêmio e bônus condicionado a NPS/falta indicam subordinação e controle de jornada;
  - isso pode descaracterizar a parceria e gerar vínculo empregatício;
  - **recomendação:** só indicadores **informativos** ao próprio profissional (o Agente B entrega falta e reagendamento por profissional), sem prêmio nem punição até haver parecer.
- **"Terminei cedo" +R$ 5:** incentiva atendimento apressado. Atrito com qualidade e com o reagendamento, que é justamente a métrica de retenção.
- **Atualização otimista em baixa de comanda:** mostrar "pago" antes do servidor confirmar é perigoso em financeiro. No HOPE OS, checkout e status esperam o backend. Atualização otimista só para arrastar horário.
- **"Substituir a recepção humana":** irreal para salão pequeno, que é o público do piloto. A presença implementada (§4) apoia a recepção em vez de substituí-la.
- **Onboarding que bloqueia:** impede operar no dia 1 enquanto o cadastro não fica perfeito. Mantido o assistente retomável.
- **WhatsApp Cloud API com janela de silêncio:** fornecedor pago com templates aprovados. O lembrete manual via wa.me (D-011) resolve o piloto sem custo.
- **Cashback e indicação:** saldo de cliente é passivo contábil, com prazo e expiração. Exige contador antes de existir.
- **TV com dados de cliente (LGPD):** mesmo "anonimizado", primeiro nome + horário + profissional em local público expõe o cliente. Exige opt-in.

## 4. O que foi implementado agora (D-012)
| Item | Onde | Prova |
|---|---|---|
| **Máquina de estados completa da agenda**: tabela "para → de onde pode vir"; check-in (`aguardando`) e na cadeira (`em_atendimento`); quem chegou não vira falta; cancelado e falta não voltam; pago e reagendado são finais | `backend/src/validators/agenda.validator.js` (`TRANSICOES`) | lembretes-gate L08 + L06; identity-gate 38/38 |
| Ações "Cliente chegou" e "Iniciar atendimento" na folha do agendamento; selos "Chegou"/"Na cadeira" | `js/ui/agenda.js` | `backend/tests/e2e/presenca.e2e.js` (banco: `aguardando` → `em_atendimento`; ações certas em cada estado; zero erros de console) |
| Lembrete não lista quem já fez check-in | `ReminderEngine.js` (`PENDENTES = ['agendado']`) | lembretes-gate L02 |
| Dígitos tabulares no app inteiro | `css/app.css` | — |

## 5. Próximas ondas (uma prioridade por vez)
| Onda | Conteúdo | Exige |
|---|---|---|
| Em curso (agentes) | Fechamento de caixa (o "voo de teste" termina nele); KPIs do piloto por salão e por profissional; cabeçalhos de segurança + E2E no CI | Nada |
| D | Horários de presença (check-in, início, fim) para tempo de espera e duração real | Migration 009+ |
| E | Ficha técnica de insumos (BOM) no modelo DIVIDIDO, com "profissional traz o produto" | Migration + regra validada com contador |
| F | Estorno de comanda (`docs/planning/ESTORNO_COMANDA_DRAFT.md`) | Migration 009 |
| G | Agendamento online (`docs/planning/AGENDAMENTO_ONLINE_DRAFT.md`) | Produção publicada |
| H | Sinal, datas especiais, clube de assinatura, máquina própria | Gateway (Onda C) |
| Não fazer sem parecer | Gamificação com prêmio, ligas, 360°/9-box, bônus por meta, SRS que distribui clientes | Parecer trabalhista |

## 6. Decisões do Platform Owner
1. Autorizar uma migration 009 e escolher o primeiro item dela: estorno (F), presença com horário (D) ou BOM (E).
2. Pedir parecer trabalhista sobre metas, gamificação e distribuição de clientes no regime de salão-parceiro antes de qualquer item da §3.4.
3. Confirmar a divergência intencional: onboarding retomável, sem bloqueio.
