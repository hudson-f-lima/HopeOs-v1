# Agendamento de ponta a ponta, com o app do cliente: auditoria (2026-11-15)

**Pedido do dono:** "Faça a auditoria do agendamento de ponta a ponta." É a condição para trocar o app Barber: o fluxo precisa estar completo, inclusive o app do cliente ([roteiro](ROADMAP_SUBSTITUIR_APPBARBER.md)).

**Método:** leitura do código (`backend/src/routes/publicBooking.js`, `agendar.html`, `js/agendar.js`, agenda interna), das decisões (D-011, D-014, D-033) e dos parâmetros que o salão usa hoje no app Barber (leitura de 2026-11-15).

**Classificação:**
- **REAL:** existe e funciona.
- **PARCIAL:** existe com limite.
- **AUSENTE:** não existe.
- **BLOQUEADO:** existe, mas está desligado por decisão pendente.

---

## 1. Jornada do cliente
| # | Etapa | Estado | Evidência e limite |
|---|---|---|---|
| 1 | Abrir o link do salão | **BLOQUEADO** | A página `agendar.html?s=<slug>` existe, mas está desligada em produção porque `PUBLIC_BOOKING_LINKS` não está configurada (D-014). Para ligar, faltam o aviso de privacidade com os dados do salão e o Red Team em produção |
| 2 | Escolher serviço, profissional, data e horário | **REAL** | Horários vêm do mesmo cálculo da recepção, já com escalas, datas especiais e bloqueios (D-033). O servidor revalida o horário ao gravar |
| 3 | "Sem preferência" (qualquer profissional) | **AUSENTE** | Previsto no desenho; o salão usa hoje no app Barber (parâmetro 38 ligado) |
| 4 | Identificar-se | **PARCIAL** | Nome + WhatsApp, sem login. O número não é verificado: risco de spam, contido por limites por número, IP e teto diário. O limite por IP fica em memória de cada instância |
| 5 | Confirmação na tela | **REAL** | Tela de sucesso com data, hora e serviço |
| 6 | Comprovante enviado ao cliente (WhatsApp ou e-mail) | **AUSENTE** | Envio automático exige fornecedor |
| 7 | Lembrete antes do horário | **PARCIAL** | A recepção envia pelo botão de WhatsApp na tela Lembretes (D-011), um por um. Automático exige fornecedor |
| 8 | Cliente confirma presença por link | **AUSENTE** | — |
| 9 | Cliente cancela | **AUSENTE** | Desenho previa um link com token assinado, sem migration. No app Barber o salão usa tolerância de 45 min (parâmetro 2) |
| 10 | Cliente remarca | **AUSENTE** | — |
| 11 | Cliente vê os próprios agendamentos | **AUSENTE** | Exige identificar o cliente com segurança: link com token por agendamento (sem fornecedor) ou código por WhatsApp/SMS (com fornecedor) |
| 12 | Agendamento recorrente (cliente fixo) | **AUSENTE** | Item (b) do roteiro. O salão usa: semanal, quinzenal e mensal, com edição pelo card |
| 13 | Lista de espera pelo cliente | **AUSENTE** | A lista de espera interna existe (recepção) |
| 14 | Assinatura, pacote ou sinal pagos online | **AUSENTE** | Desenho da assinatura pronto (D-036); pagamento exige fornecedor |
| 15 | Avaliação depois do atendimento | **AUSENTE** | — |
| 16 | App instalável do cliente | **PARCIAL** | É uma página web responsiva. Não há ícone próprio de instalação nem notificação no aparelho |

## 2. Lado do salão
| # | Etapa | Estado | Evidência e limite |
|---|---|---|---|
| 17 | Agendamento online cai na agenda com a origem | **REAL** | Evento `origem_link_publico`, sem dado pessoal em claro |
| 18 | Régua de faltas no online | **REAL** | Cliente com régua "exigir sinal" recebe recusa genérica |
| 19 | Aviso para a recepção de novo agendamento online | **AUSENTE** | Só aparece ao abrir a agenda |
| 20 | Confirmação pela recepção | **PARCIAL** | Botão de WhatsApp + "Confirmou" (manual) |
| 21 | Disponibilidade correta (escalas, folgas, feriados) | **REAL** | D-033 e D-035 em produção |
| 22 | Encaixe e conflitos | **REAL** | Servidor recusa fora da disponibilidade; encaixe forçado registrado |

**Resumo:**
- **A parte do salão está quase completa.** A do cliente para no primeiro passo: o link está desligado.
- **Depois de agendar, o cliente não tem nenhuma ação própria:** não confirma, não cancela, não remarca e não vê os próprios horários.

## 3. O que "completo de ponta a ponta" deve significar (proposta de critério para a troca)
O cliente, sem ligar para o salão:
1. Agenda pelo link, escolhendo profissional ou "sem preferência".
2. Recebe o comprovante com um link pessoal do agendamento.
3. Por esse link, confirma, cancela ou remarca dentro das regras do salão.
4. É lembrado antes do horário: automático, ou pelo menos com o link pessoal no lembrete da recepção.
5. Se for cliente fixo, tem a série recorrente criada pela recepção.

O salão vê tudo na agenda, com origem e histórico, e é avisado de agendamentos novos.

**Fora do critério da troca** (podem vir depois): assinatura paga online, avaliação, app nativo nas lojas.

## 4. Plano proposto
| Onda | Escopo | Migration? | Fornecedor? | Critério de aceite |
|---|---|---|---|---|
| **C1. Ligar o link** | Aviso de privacidade com os dados do salão; Red Team em produção; "sem preferência"; ícone de instalação próprio do cliente | Não | Não | Cliente agenda pelo celular em produção; Red Team sem crítico ou alto |
| **C2. Link pessoal do agendamento** | Página do agendamento com token assinado (sem login, expira após o horário): ver, **confirmar**, **cancelar**, **remarcar** dentro do prazo. Link na tela de sucesso e no lembrete de WhatsApp da recepção. Tudo registrado na trilha | Provável que não (token assinado + eventos existentes); prazo configurável pode exigir uma coluna | Não | Confirmar, cancelar e remarcar pelo link em 390 px; token de outro agendamento ou adulterado recusado; prazo respeitado no servidor |
| **C3. Aviso para a recepção** | Contador e destaque de agendamentos online novos na agenda; som opcional com o app aberto | Não | Não | Recepção vê "2 novos online" sem procurar |
| **C4. Recorrência** | Série semanal, quinzenal e mensal; cancelar ou alterar "só este", "este e os próximos" ou "todos" pelo card; a série respeita escalas e conflitos | **Sim** (série) | Não | Criar série de 8 semanas com conflitos avisados; mudar "este e os próximos" sem tocar os anteriores |
| **C5. Automático** | Comprovante e lembrete por WhatsApp com o link pessoal; "meus agendamentos" com código | Talvez | **Sim** (WhatsApp ou SMS) | Lembrete sai sozinho no horário configurado; opt-out respeitado |

**Ordem recomendada:** C1 → C2 → C3 → C4 → C5.
- C1 a C3 não dependem de fornecedor nem de migration e já cumprem o critério da §3, menos a recorrência e o automático.
- C4 é a única que exige migration.
- C5 depende de contratar um fornecedor de WhatsApp.

## 5. Riscos
- **Spam sem verificação de número:** os limites contêm o volume. Se aparecer abuso, a saída é verificar o número (C5) ou usar captcha (decisão pendente desde o desenho original).
- **Link pessoal vazado:** quem tiver o link pode cancelar aquele horário. Mitigação: token só daquele agendamento, que expira depois do horário, e toda ação fica registrada e pode ser desfeita pela recepção.
- **Limite por IP em memória:** com mais de uma instância da API, o limite vale por instância. É aceitável no piloto; um limite compartilhado exigiria infraestrutura.
- **Dados pessoais:** o aviso de privacidade precisa dos dados reais do salão (o controlador). O texto é modelo, não parecer jurídico.

## 6. Decisões do dono
1. **Dados do salão para o aviso de privacidade:** razão social, CNPJ, contato para assuntos de dados pessoais.
2. **Prazo para o cliente cancelar ou remarcar:** no app Barber o salão usa **45 min**. Manter?
3. **Antecedência mínima para agendar online:** o HOPE OS usa 2 h por padrão; no app Barber o salão usa **10 min**. Qual vale?
4. **Agendamentos futuros por número:** o padrão é 2. Manter?
5. **Mostrar preço** na página do cliente?
6. **Começar pela C1** (ligar o link) e seguir na ordem recomendada?
