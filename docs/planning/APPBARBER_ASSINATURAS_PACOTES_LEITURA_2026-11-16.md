# AppBarber — assinaturas e pacotes (leitura real, 2026-11-16)

**Como foi feito:** acesso autorizado pelo dono à conta do salão, **somente leitura**: login, navegação e consulta. Nada foi salvo, cadastrado, cancelado, pausado, sincronizado ou enviado. Nenhum dado de cliente consta neste documento (só agregados). A senha foi usada apenas em memória; **precisa ser rotacionada**.

**Classificação:** tudo abaixo é REAL (visto na tela) salvo onde marcado INFERÊNCIA ou DESCONHECIDO.

## 1. Planos de assinatura (9 cadastrados)

| Plano | Valor | Periodicidade | Tipo | Itens cobertos (desconto 100%) |
|---|---|---|---|---|
| Smart Corte Masc (3ª–5ª) | R$ 94,90 | Mensal | Recorrência | Corte assinatura × 999 |
| Smart Barba (3ª–5ª) | R$ 94,90 | Mensal | Recorrência | Barba assinatura × 999 |
| Smart Corte&Barba (3ª–5ª) | R$ 184,90 | Mensal | Recorrência | Barba, Corte e "Corte & Barba" × 999 |
| FLEX Barba VIP | R$ 149,90 | Mensal | Recorrência | Barba assinatura × 5 |
| FLEX Corte Masc VIP | R$ 149,90 | Mensal (vencimento "Base na contratação (fixa)") | Recorrência | Corte assinatura × 5 |
| FLEX Corte&Barba VIP | R$ 294,90 | Mensal | Recorrência | Barba e Corte assinatura × 555; Corte, Barba, Corte&Barba e Barba+Toalha Quente × 999 |
| CLUB Corte LIMITADO | R$ 115,00 | Mensal | Recorrência | Corte assinatura × 5 |
| Local Corte 3ª a 5ª | R$ 94,90 | Mensal | **Comum** | Corte assinatura × 9999 |
| Anual black | R$ 2.900,00 | Anual | **Comum** | Corte Masc. × 99999 |

(Valores de limite lidos de 9 planos; "999", "9999" e "99999" funcionam como "ilimitado" digitado à mão.)

### Campos do formulário do plano (5 abas)
- **Dados do plano:** descrição; valor total; *tipo de vencimento* (data fixa / base na contratação / base na contratação fixa); dia de vencimento (só para data fixa); *periodicidade* (mensal, trimestral, semestral, anual); *disponível para venda* (sim/não).
- **Serviços do plano:** lista de itens, cada um com tipo (serviço ou produto), item, **desconto %** (100 = coberto), **quantidade de usos** e "gerar pontos do programa de fidelidade". Aviso na tela: "serviços já agendados não terão desconto aplicado".
- **Comissão:** tipo — **"por produtividade (divisão)"** ou "comissão fixa (porcentagem)"; campo "comissão sobre o clube (%)".
- **Apresentação:** texto de descrição (vazio nos planos lidos). **Documentos:** não aberta.

### Fatos que mais importam
1. **Os 9 planos usam a mesma comissão: "por produtividade (divisão)", 50% do valor do clube.** A tela explica: uma porcentagem do valor do clube é destinada à comissão e **dividida entre os profissionais conforme o número de serviços que cada um realizou no período**. É o **rateio** que a Onda A tinha adiado (D-036). Nenhum plano usa a opção de comissão fixa.
2. **Restrição "3ª–5ª" está só no nome do plano.** Nas abas lidas não há campo de dia da semana, horário ou profissional. Como o AppBarber impede o uso fora de 3ª–5ª, se é que impede, é DESCONHECIDO.
3. **O serviço coberto é um serviço "sombra"** (ex.: "*CORTE ASSINATURA", R$ 94,90, 30 min, comissão de serviço 50%), com preço igual ao do plano mais barato; o desconto de 100% do plano o zera na comanda.
4. **Usos:** a tela de usos mostra "utilizados X de N" por item e a lista de comandas. Há uso **por fatura** (ciclo).

## 2. Assinantes e cobrança

- 25 registros na aba "Ativas" (há também "Canceladas"). Na 1ª página (10): **6 atrasados, 3 em dia, 1 a vencer**; **5 "comum"** (cobrança manual) e **5 "com recorrência"** (GalaxPay).
- **Assinante "comum"** tem o botão **"Integrar GalaxPay"**: é o caminho para migrar da cobrança manual para a recorrente.
- Ações por assinante: **Usos, Faturas, Cancelar, Pausar** (só recorrência), **Integrar GalaxPay** (só comum). No topo: **Ver comissões geradas, Ver comissão atual, Sincronizar dados GalaxPay**.
- **Faturas** (uma por ciclo): nome do plano, valor, vencimento, pagamento, estado "Paga" com **comprovante**, e para a fatura em aberto **Recobrar, Alterar plano, Usos**. Há também **"Copiar link de gerência de assinatura"**: o cliente tem um link próprio para gerenciar a assinatura.
- Estados vistos: **Em dia, A vencer, Atrasado**.
- **Aviso na tela inicial:** "existem assinantes com vencimento previsto para os próximos 7 dias".

## 3. Comissão das assinaturas ("Comissões geradas")
Tela por período e por profissional com: nº de serviços, comissão a receber e detalhamento por comanda (cliente, serviço, assinatura, data). Rótulos: **Total de assinaturas, Total líquido, Base de comissão (líquida/desconto), Valor do minuto.**
Exemplo lido (período padrão da tela, 17/10 a 16/11): dois profissionais, 3 serviços → R$ 35,58 e 19 serviços → R$ 201,66; total R$ 237,24.
**INFERÊNCIA (não provada):** "Valor do minuto" sugere que o rateio pesa o **tempo** dos serviços e não só a contagem; a fórmula exata é DESCONHECIDA. O R$ por serviço difere entre os dois profissionais (≈ 11,86 e 10,61), o que apoia que não é divisão simples por quantidade, mas também pode vir de planos de valores diferentes.

## 4. Comanda de assinante
Item coberto entra com **valor 0,00**, desconto, "Associação: Clube de Assinatura", profissional e total R$ 0,00 (forma de pagamento registrada como dinheiro com valor zero). O profissional que atende **fica registrado no item**, que alimenta o rateio.

## 5. Pacotes de serviços (separados da assinatura)

- Menus: **Meus pacotes** (cadastro) e **Venda de pacotes** (vendas, com abas de cancelados e expirados). 5 pacotes cadastrados, 3 deles com nome de cliente (pacotes sob medida); relatório gerencial de pacotes: vendas, expirados, em aberto, relação de serviços.
- **Campos do pacote:** nome; observação (texto livre, ex.: "02 cortes por mês, dentro do período de 30 dias da contratação"); **comissão pela venda** (%); **expiração em dias**; disponível; gera pontos; **disponível no app**; **disponível para pagamento online**; **parcelas máximas (1 a 12)**; imagem; **itens** (tipo serviço/produto, item, **quantidade**, **valor unitário no pacote**) com total.
- Exemplo: 2 × "Corte assinatura" a R$ 42,50 = R$ 85,00, expira em 30 dias.
- **Venda de pacote:** cliente, sessões, usadas, celular, expiração, **crédito**, pagamento; abas "vendas ativas" e "concluídas".
- Anomalia de dado: um pacote mostra comissão "5000,00" (provável digitação errada). Não corrigi (somente leitura).

## 6. Relatórios do clube (15 tipos)
Agendamentos por assinatura; contratações e tentativas; novas contratações (recorrente e comum); média de rendimento por clube; atendimentos por cliente; serviços por assinatura; atendimentos por profissional por assinatura; quantidade utilizada por cliente por fatura; faturas pagas por cliente e por assinatura; comissões geradas e detalhamento; **cancelamentos**; **assinantes por plano**. Filtros: período, assinatura, serviço.

## 7. O que isso muda para a Onda A

| Ponto | AppBarber (real) | Desenho atual (`ASSINATURAS_DESENHO.md`) | Consequência |
|---|---|---|---|
| Comissão | 9 de 9 planos usam **rateio de 50% do valor do clube pelos serviços feitos** | Onda A entrega tabela e fixo; rateio adiado | **Sem rateio, a Onda A não reproduz a comissão que a equipe recebe hoje.** Risco de conflito com a equipe |
| Restrição de dia/horário | Só no nome do plano | Campos próprios (dias da semana, profissionais) | Melhora o AppBarber; manter |
| Ilimitado | número alto digitado (999…) | limite nulo = ilimitado | Melhora; manter |
| Pacote com saldo, validade, parcelas | Produto à parte, com expiração e venda parcelada | Fora da Onda A (saldo do cliente) | Confirma separar; ver §8 |
| Assinante "comum" vs recorrência | 5 de 10 na 1ª página são "comum" (cobrança manual) | Onda A já prevê cobrança fora do HOPE OS | Confirma a Onda A sem gateway |
| Link do cliente para gerenciar | Existe | Previsto no app do cliente | Manter |
| Atraso | 6 de 10 atrasados | Tolerância de 7 dias, suspensão | Atraso é comum: a regra de tolerância importa desde o dia 1 |

## 8. Opções e recomendação (decisão do dono)

**Comissão do serviço coberto na Onda A:**
- **A1. Só tabela e fixo (como planejado).** Rápido e previsível. Não reproduz o pagamento atual da equipe.
- **A2. Rateio por quantidade de serviços no ciclo.** Aproxima a regra descrita na tela do AppBarber.
- **A3. Rateio ponderado por tempo.** Pode ser o que o AppBarber faz ("valor do minuto"), mas é INFERÊNCIA.

**Recomendação: A2 com critério de aceite de reconciliação.** Implementar o rateio por serviços no fechamento do ciclo e **conferir contra as "Comissões geradas" do próprio AppBarber no mesmo período** (o exemplo acima: R$ 237,24). Se bater, ótimo; se divergir de forma que aponte o tempo, evoluir para A3 sem refazer a estrutura (o uso já guarda serviço, profissional e duração). Isso troca a dúvida por um teste.

**Pacotes:** manter fora da Onda A, **modelando o uso de assinatura como um tipo de crédito**, como o desenho já prevê. Se o salão usa pouco (5 cadastrados, 3 sob medida), a prioridade é baixa; **pergunta ao dono:** quantos pacotes são vendidos por mês?

## 9. Limites desta leitura
- Aba "Documentos" do plano, "Clube de clientes" (fidelidade) e cupons não foram abertos.
- Fórmula do rateio, regra de 3ª–5ª e política de pausa: DESCONHECIDAS.
- Detalhes da cobrança na GalaxPay (taxas, retentativas) não estão no AppBarber.
