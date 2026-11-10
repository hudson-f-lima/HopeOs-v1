# Integrações e extensões futuras — encaminhamento (D-016)

**Estado:** planejamento. Nada aqui está implementado nem autorizado. Cada item diz o que já existe, o que falta, o que exige e como saber que ficou pronto. Origem: `docs/audit/AUDITORIA_E_BENCHMARK_2026-11-10.md`.

Regras que valem para todos:
- Dinheiro, comissão, estoque e agenda continuam calculados só no backend. O fornecedor informa um evento; quem grava é a RPC.
- Nenhuma chave de fornecedor vai para a PWA nem para o repositório. Só variável de ambiente do Render.
- Toda integração nasce **desligada** (sem a variável, a rota responde 404), como o agendamento online.
- Migration 010+ exige autorização do Platform Owner e linha em `supabase/migrations.lock`.
- Entrada de fornecedor (webhook) é tratada como dado não confiável: assinatura conferida, idempotência por id do evento, valor reconferido contra o que o backend esperava.

## 1. Pagamento: sinal, Pix e clube de assinatura (Onda C)
| | |
|---|---|
| Já existe | `formas_pagamento` com taxa e prazo; `checkout_close` atômico e idempotente; régua de faltas que marca quem exigiria sinal (`NoShowLadder.js`); principal de integração com escopos e auditoria (`/api/admin/integrations`) |
| Falta | Tabela de cobranças (pendente, paga, expirada, devolvida) ligada a agendamento ou assinatura; rota de webhook; tela de "aguardando sinal" |
| Exige | Escolha do gateway (Pix e Pix Automático); migration; aviso de privacidade; Red Team da rota de webhook; autorização da Onda C |
| Contrato proposto | `POST /api/pagamentos/cobrancas` (cria e devolve o código Pix) · `POST /api/webhooks/pagamento/:fornecedor` (assinado, idempotente) · o sinal vira pagamento já recebido na comanda daquele agendamento |
| Aceite | Sinal pago aparece no caixa do dia do pagamento; falta com sinal não devolve sem estorno autorizado; webhook repetido não duplica; valor divergente é recusado e registrado |
| Decisão do dono | Qual gateway; sinal para todos ou só para cliente de risco (recomendado: só risco) |

## 2. NFS-e
| | |
|---|---|
| Já existe | Dados fiscais da empresa (CNPJ validado, razão social, salão-parceiro); cota-parte do mês; **CSV de serviços prestados para o contador** (`GET /api/relatorios/servicos-prestados`) |
| Falta | Emissão, cancelamento e guarda do número da nota por comanda |
| Exige | Fornecedor de emissão ou API do Emissor Nacional; certificado digital; contador para definir como a cota-parte do parceiro entra na nota; migration (número, status e protocolo da nota) |
| Contrato proposto | Emissão assíncrona após o fechamento da comanda; estorno gera cancelamento ou nota de ajuste conforme a regra do município |
| Aceite | Toda comanda fechada tem nota emitida ou motivo de não emissão; totais do mês batem com o CSV |
| Decisão do dono | Emitir pelo sistema ou manter o contador emitindo a partir do CSV (recomendado no piloto: CSV) |

## 3. Mensagens automáticas (WhatsApp API): lembrete, lista de espera, campanha
| | |
|---|---|
| Já existe | Texto e link do lembrete (`ReminderEngine.js`); candidatos da lista de espera ao abrir vaga; segmentos de retenção (`/insights/retention`) |
| Falta | Envio sem ação humana; registro de consentimento; resposta do cliente confirmando |
| Exige | Fornecedor pago; consentimento por cliente (LGPD) — coluna nova, logo migration; modelos de mensagem aprovados |
| Aceite | Só recebe quem consentiu; resposta "sim" confirma o agendamento com autoria "cliente"; falha de envio aparece para a recepção |
| Decisão do dono | Só depois de o piloto medir a taxa de falta com o lembrete manual |

## 4. Pagamento de comissão (sem fornecedor; exige migration)
| | |
|---|---|
| Já existe | Cálculo por item no checkout; cota-parte do mês; **extrato por profissional** (`GET /api/relatorios/meus-ganhos`, aba Ganhos) |
| Falta | Registrar que foi pago: período, valor, vale ou adiantamento, quem pagou; saldo a pagar |
| Exige | Migration 010 (tabela de pagamentos de comissão, imutável como o ledger); parecer trabalhista se envolver meta ou piso |
| Aceite | Saldo = ganhos − pagamentos; pagamento não se edita, só se estorna; profissional vê o próprio saldo |

## 5. Fechamento de caixa salvo (sem fornecedor; exige migration)
| | |
|---|---|
| Já existe | Conferência do dia na tela (`CaixaEngine.js`): por forma, dinheiro esperado, diferença |
| Falta | Abertura com fundo de troco, sangria, suprimento, quem fechou e quando, trava do dia fechado |
| Exige | Migration |
| Aceite | Dia fechado guarda o valor contado e a diferença; reabrir exige gestão e fica registrado |
| Referência | PDV de restaurante: relatório Z, contagem da gaveta contra o relatório, nada entra no dia depois do fechamento |

## 6. Alertas de produção
| | |
|---|---|
| Já existe | `X-Request-Id` em toda resposta e no log; erro 4xx em uma linha; `smoke.js` |
| Falta | Alguém ser avisado quando há erro 5xx ou o serviço cai |
| Exige | Fornecedor de monitoramento (há planos gratuitos) ou tarefa agendada rodando o `smoke.js` |
| Aceite | Queda do `/api/health` gera aviso ao dono em até 10 minutos |

## Ordem recomendada
1. Nenhum item antes do teste de ponta a ponta com dado real e do início do piloto.
2. §6 (alerta) junto com a infra paga.
3. §4 e §5 numa única migration 010, se o piloto mostrar a dor.
4. §1 depois de 30 dias de números de falta.
5. §2 e §3 por último: dependem de fornecedor e de terceiros (contador, consentimento).
