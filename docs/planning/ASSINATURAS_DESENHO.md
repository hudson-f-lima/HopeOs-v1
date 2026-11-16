# Clube de assinatura — desenho completo, independente de fornecedor (2026-11-15)

**Estado:** desenho com as decisões do dono registradas (§11). Nada implementado. O SQL é DRAFT ONLY: as migrations deste desenho não estão autorizadas.

**Pedido do dono (2026-11-15):** "Fazer o desenho completo e deixar preparado para posteriormente escolher o fornecedor do pagamento."

**Contexto:** a troca do app Barber só acontece com o fluxo de agendamento completo de ponta a ponta, inclusive o app do cliente ([roteiro](ROADMAP_SUBSTITUIR_APPBARBER.md)). A assinatura é o maior bloqueio dessa troca.

---

## 1. Problema e evidência
- **Fato:** na conta do app Barber (leitura de 2026-11-15) há cerca de 10 planos ativos. Exemplos: "CLUB Corte LIMITADO", "Smart Corte & Barba 3ª a 5ª", "FLEX Corte & Barba VIP" e "Anual black".
- **Fato:** a cobrança recorrente é feita pela GalaxPay; há assinantes com vencimento próximo.
- **Fato:** há relatórios de uso por assinatura e um parâmetro "gerar comissão com base no valor original do serviço".
- **Inferência:** a receita recorrente é relevante no caixa do salão. Errar cobrança ou comissão de assinante gera reclamação, estorno e conflito com a equipe.
- **O que não existe no HOPE OS:** plano, assinante, uso coberto, cobrança recorrente e margem por plano.

## 2. Princípios
1. **O fornecedor é trocável.** Toda a regra (plano, uso, comissão, margem) fica no HOPE OS. O fornecedor só cobra e avisa por webhook.
2. **Nenhum dado de cartão passa pelo HOPE OS.** Adesão e troca de cartão acontecem no checkout ou link de pagamento do fornecedor (fora do escopo PCI do HOPE OS).
3. **Dinheiro imutável.** Cobranças, pagamentos e usos ficam num registro sem edição (reaproveita `ledger_imutavel`); correção se faz por lançamento contrário, como no estorno (D-013).
4. **Webhook não é fonte de verdade sozinho.** Todo evento é registrado, conferido pela assinatura do fornecedor, processado uma vez só (idempotência) e reconsultado na API do fornecedor quando houver dúvida.
5. **Margem desde o primeiro dia.** Cada plano mostra receita − comissões − taxas − insumos, e avisa quando dá prejuízo.

## 3. Conceitos
| Conceito | O que é |
|---|---|
| **Plano** | Nome, preço, periodicidade (mensal ou anual), dia de cobrança, itens incluídos, restrições (dias da semana, horários, profissionais ou categorias), regra de comissão, ativo ou arquivado |
| **Item do plano** | Serviço incluído e limite por ciclo (ex.: 4 cortes por mês ou ilimitado), com intervalo mínimo opcional entre usos (ex.: 7 dias) |
| **Assinatura** | Cliente + plano + estado + ciclo atual + próxima cobrança + referência no fornecedor |
| **Ciclo** | Período pago (ex.: 10/12 a 09/01). Os limites zeram a cada ciclo; o que sobra não acumula, salvo decisão contrária |
| **Uso** | Atendimento coberto pela assinatura. Nasce na comanda (fechada) e consome o limite do ciclo |
| **Cobrança** | Valor devido em um ciclo, com estado: pendente, paga, falhou, estornada ou cancelada |
| **Evento do fornecedor** | Webhook recebido, guardado sem edição, processado uma vez |

**Estados da assinatura:** `pendente` (aguardando 1º pagamento) → `ativa` → `inadimplente` (cobrança falhou, dentro da tolerância) → `suspensa` (passou da tolerância; uso bloqueado) → `ativa` de novo ao pagar. A qualquer momento pode ir para `pausada` (por decisão do salão) ou `cancelada` (no fim do ciclo pago ou imediata, conforme a regra).

## 4. Regras de negócio
- **Na agenda:** ao agendar um cliente assinante, a tela mostra "coberto pela assinatura (2 de 4 usados)" ou o motivo de não estar coberto (limite atingido, dia fora do plano, assinatura suspensa). Não bloqueia o agendamento: avisa.
- **Na comanda:**
  - o serviço coberto entra com valor zero para o cliente e gera um **uso**;
  - o que não estiver coberto é cobrado normal;
  - produto nunca é coberto, salvo se um plano o incluir.
- **Comissão do serviço coberto (regra escolhida por plano, decisão do dono na §11):**
  - (a) sobre o valor de tabela do serviço (como o parâmetro do app Barber);
  - (b) sobre o valor rateado (mensalidade ÷ usos no ciclo, calculado no fechamento do ciclo);
  - (c) valor fixo por uso definido no plano.

  As três ficam disponíveis e cada plano escolhe a sua; o padrão sugerido é **(c)**, que é previsível para o profissional e protege a margem. A (a) pode levar o plano a prejuízo com assinante frequente, e o simulador mostra isso antes de salvar.
- **Inadimplência:** tolerância configurável (padrão de 7 dias, decisão do dono); depois disso a assinatura fica `suspensa` e o uso é bloqueado com aviso. Ao pagar, volta na hora.
- **Cancelamento:** o padrão é valer no fim do ciclo pago, sem reembolso proporcional; o cancelamento imediato com reembolso fica a critério da gestão e é registrado. Regras de direito do consumidor, como o arrependimento em 7 dias na contratação online, ficam para validação jurídica.
- **Troca de plano:** vale no próximo ciclo (simples e sem proporcional). Troca imediata fica para depois, se houver demanda.
- **Pausa:** a gestão pode pausar (ex.: férias do cliente) por até N ciclos; o fornecedor deixa de cobrar.
- **Uso fora da regra do plano (proposta do dono, 2026-11-16; DRAFT, aguarda os pontos abaixo):** quando o atendimento foge de uma restrição (dia da semana, profissional, faixa de horário), o **gestor configura por plano** o que acontece. Exemplo do dono: assinante de corte de terça a quinta vem no sábado → **consome 1 uso do plano e paga 50% do valor do corte**.
  - **Ação por tipo de restrição violada:** (1) **bloquear** a cobertura (cobra o valor integral, sem consumir uso); (2) **cobrar X% e consumir 1 uso**; (3) **cobrar X% sem consumir uso**; (4) **cobertura total** (a restrição só avisa). Padrão sugerido ao criar o plano: (1), o mais seguro.
  - **Base do percentual:** valor de tabela do serviço realizado, no momento do atendimento, arredondado ao centavo.
  - **Teto por ciclo:** máximo de usos fora da regra por assinante e ciclo (ex.: 2 por mês), para a exceção não virar o padrão.
  - **Aprovação opcional:** o plano pode exigir liberação de quem tem a permissão sensível; o motivo e quem liberou ficam no registro imutável.
  - **Mais de uma restrição violada:** vale a de maior percentual (não soma).
  - **Decisões do dono (2026-11-16):** (a) a comissão do profissional é a **comissão padrão do serviço, sobre o valor cobrado**, e o uso **fora do rateio** do ciclo (**confirmado**); (b) o **cliente é avisado** (**confirmado**) antes de confirmar: no link, aparece "fora do seu plano: R$ X e 1 uso" e ele confirma; (c) estorno: **o que for mais inteligente** (proposta abaixo).
  - **Estorno (proposta):** por padrão reverte tudo por lançamento contrário (devolve o uso, devolve a parte cobrada e estorna a comissão). Estorno só do valor, mantendo o uso, exige permissão sensível e motivo. Depois do **fechamento do ciclo** o uso não volta (usos não acumulam); só o estorno financeiro vale.
  - **Padrão ao criar plano (confirmado):** "bloquear a cobertura". **A regra de cada plano é configurável pelo gestor**; os planos importados do AppBarber **não** recebem regra fixa no código: nascem com o padrão e o gestor ajusta plano a plano. Estorno: proposta acima, aprovada pelo dono ("o que for mais inteligente").

## 5. Inteligência (o diferencial)
- **Margem por plano:** receita do ciclo − comissões dos usos − taxa do fornecedor − insumos dos serviços (quando houver ficha de insumos).
- **Assinante acima do preço:** uso × custo > mensalidade por 2 ciclos seguidos. Isso vira sinal para revisar limite ou preço, nunca ação automática.
- **Risco de cancelamento:** sem uso há 30 dias, cobrança falhando ou queda de frequência em relação ao próprio histórico.
- **Painel:** receita recorrente mensal, assinantes ativos, entradas e saídas, inadimplência, margem por plano e uso médio por plano.
- **Simulador de plano:** antes de criar um plano, estima a margem pela frequência histórica dos clientes que mais fazem aqueles serviços.

## 6. Camada de fornecedor (contrato único)
O backend fala com um **adaptador** com esta interface; cada fornecedor é uma implementação. Trocar de fornecedor é trocar o adaptador, sem mudar regra nem tela.

| Operação | O que faz |
|---|---|
| `criarClienteCobranca(cliente)` | Cadastra o pagador no fornecedor (sem cartão) |
| `linkDeAdesao(assinatura)` | Devolve o link ou checkout hospedado onde o cliente cadastra o cartão (ou Pix automático) e aceita a cobrança |
| `cancelar(assinatura, quando)` | Cancela no fornecedor (no fim do ciclo ou imediato) |
| `pausar` / `retomar` | Interrompe e volta a cobrança |
| `consultarCobranca(id)` | Reconsulta o estado real (usado para conferir webhooks) |
| `estornar(cobranca, valor)` | Devolve tudo ou parte |
| `validarWebhook(cabecalhos, corpo)` | Confere a assinatura do fornecedor; corpo inválido → 401 e registro |
| `traduzirEvento(corpo)` | Converte para os eventos internos: `cobranca_paga`, `cobranca_falhou`, `cobranca_estornada`, `assinatura_cancelada_no_fornecedor` |

**Requisitos para escolher o fornecedor** (a cotação real é DESCONHECIDA e depende de proposta):

| Critério | Por que importa |
|---|---|
| Cartão recorrente com checkout hospedado ou link | Mantém o HOPE OS fora do escopo PCI |
| Pix automático | Menor taxa e menos falha por cartão vencido |
| Webhooks assinados + API de consulta | Base da conferência |
| Migração de assinantes atuais | Trocar de gateway normalmente obriga o cliente a cadastrar o cartão de novo; continuar na GalaxPay pode evitar isso (DESCONHECIDO, perguntar à GalaxPay) |
| Taxa por cobrança, por falha e de antecipação | Entra na margem por plano |
| Retentativa automática de cartão recusado | Reduz a inadimplência |
| Sandbox para testes | Obrigatório para o gate antes de ligar em produção |

**Candidatos a cotar:** GalaxPay (atual), Asaas, Mercado Pago, Pagar.me, Iugu, Vindi e Stripe. Nenhum é recomendado antes da cotação.

## 7. Dados — DRAFT (não aplicar sem autorização)
| Tabela | Principais campos |
|---|---|
| `assinatura_planos` | nome, preco_centavos, periodicidade, dia_cobranca, regra_comissao (`tabela`, `rateio`, `fixo`), comissao_fixa_centavos, tolerancia_dias, ativo/arquivado |
| `assinatura_plano_itens` | plano, servico, limite_por_ciclo (nulo = ilimitado), intervalo_min_dias, dias_semana, profissionais ou categorias permitidos |
| `assinaturas` | cliente, plano, estado, inicio, ciclo_atual_inicio/fim, proxima_cobranca, fornecedor, ref_fornecedor, cancelar_no_fim_do_ciclo |
| `assinatura_usos` (imutável) | assinatura, ciclo, comando_item, servico, profissional, comissao_centavos, estornado_por (uso de comanda estornada volta ao limite) |
| `assinatura_cobrancas` (imutável) | assinatura, ciclo, valor, estado, ref_fornecedor, taxa_centavos, pago_em |
| `pagamento_eventos` (imutável) | fornecedor, id_evento (único), tipo, corpo, assinatura_valida, processado_em, erro |

Mais: RLS que nega tudo para anon e authenticated; escrita só por funções do banco; idempotência pelo `id_evento`; rollback e gate SQL com controle negativo, no padrão das migrations 009 a 015.

## 8. Telas
- **Gestão → Planos:** criar, editar e arquivar plano, com simulador de margem.
- **Cliente → Assinatura:** aderir (gera o link de adesão), estado, usos do ciclo, próxima cobrança, pausar e cancelar.
- **Agenda e comanda:** selo "assinante", "coberto (2/4)" e o motivo quando não coberto.
- **Painel → Assinaturas:** indicadores da §5.
- **App do cliente:** ver o plano, os usos e a próxima cobrança; trocar o cartão pelo link do fornecedor; agendar já sabendo se está coberto.

## 9. Permissões (catálogo D-032)
- `assinatura:ver`: recepção e gestão; o profissional vê só o selo no atendimento dele.
- `assinatura:vender`: recepção e gestão; gera o link de adesão.
- `assinatura:gerir`: pausar, cancelar e estornar; gestão, nível sensível.
- `planos:editar`: gestão, nível sensível.

## 10. Ondas
| Onda | Escopo | Depende de fornecedor? | Critério de aceite |
|---|---|---|---|
| **A. Assinatura sem cobrança automática** | Planos, assinantes, uso na comanda, limites, comissão, margem por plano. A cobrança continua fora (ex.: a GalaxPay segue cobrando e a gestão marca "paga" ou importa o extrato) | **Não** | Comanda de assinante gera uso e comissão certos; limite bloqueia com aviso; margem por plano bate com o cálculo manual |
| **B. Cobrança pelo fornecedor** | Adaptador do fornecedor escolhido, link de adesão, webhooks com conferência, inadimplência e suspensão automáticas | **Sim** | Gate com sandbox: pagamento, falha, estorno e cancelamento, evento repetido e assinatura de webhook inválida |
| **C. Inteligência** | Assinante acima do preço, risco de cancelamento, simulador de plano, painel | Não | Alertas conferidos contra casos montados |
| **D. Migração do app Barber** | Importar planos e assinantes; virada combinada da cobrança, sem cobrar duas vezes | Sim | Lista de assinantes conferida; nenhum cobrado duas vezes no mês da virada |

**A Onda A entrega valor sem esperar o fornecedor.** O salão pode controlar uso e comissão no HOPE OS enquanto a cobrança segue onde está.

## 11. Decisões do dono (2026-11-15)
1. **Comissão do serviço coberto: múltipla escolha.** O plano escolhe a regra, e as três ficam disponíveis:
   - (a) valor de tabela;
   - (b) rateio da mensalidade pelos usos do ciclo;
   - (c) valor fixo por uso.

   O padrão sugerido ao criar um plano é (c). O simulador mostra a margem de cada regra antes de salvar.
2. **Tolerância de inadimplência: 7 dias** antes de suspender o uso.
3. **Cancelamento:** no fim do ciclo pago, sem reembolso proporcional (como recomendado).
4. **Usos não feitos não acumulam** para o próximo ciclo (como recomendado).
5. **Fornecedor:** cotar depois, com os critérios da §6. Perguntar à GalaxPay sobre migrar os assinantes sem recadastro de cartão.
6. **Ordem:** a Onda A vem antes da escolha do fornecedor (como recomendado).

## 12. Riscos
- **Cobrança em dobro na virada** (app Barber e HOPE OS cobrando juntos): virada com data marcada e conferência da lista.
- **Webhook falso ou repetido:** assinatura verificada, inbox imutável, idempotência e reconsulta na API.
- **Comissão em plano com prejuízo:** margem visível e alertas; a regra (c) limita o risco.
- **Chargeback:** vira estorno da cobrança e suspensão, nunca apaga uso já feito.
- **Jurídico** (direito do consumidor no cancelamento, contrato do salão-parceiro na comissão): validar antes da Onda B. Classificação: DESCONHECIDO.
- **Escopo:** pacotes, vale-presente e pontos ficam para o "saldo do cliente" do roteiro. A Onda A deve ser modelada para não fechar essa porta: o uso de assinatura é um tipo de crédito consumido.
