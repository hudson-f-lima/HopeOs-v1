---
name: integracao-futura
description: Deixar ENCAMINHADA (sem implementar) uma funcionalidade do HOPE OS / KortexOS que depende de fornecedor, custo ou migration — gateway de pagamento, Pix, sinal, assinatura, NFS-e, WhatsApp API, pagamento de comissão, fechamento de caixa salvo, alertas. Use quando o usuário disser "deixar encaminhado", "integração futura", "preparar para o gateway", ou quando uma lacuna não couber na skill completar-lacuna.
---

# Integração futura — HOPE OS / KortexOS

Registro único: `docs/planning/INTEGRACOES_FUTURAS.md`. Não crie um documento por integração.

## 1. O que "encaminhar" significa
Escrever o que permite decidir e depois implementar sem redescobrir nada. **Não** significa código pela metade:
- sem interface vazia, adaptador "stub" ou rota que responde 501;
- sem variável de ambiente nova sem uso;
- sem tabela "para o futuro" (migration 010+ exige autorização e executa em produção no merge).

Código que ninguém chama apodrece e passa falsa impressão de que a integração existe.

## 2. Ficha de cada item
| Campo | Conteúdo |
|---|---|
| Já existe | Arquivos e rotas reais que a integração vai reusar (confira com `grep`) |
| Falta | Em termos de dado e de tela, não de tecnologia |
| Exige | Fornecedor, migration, decisão jurídica (LGPD, trabalhista, fiscal), Red Team, autorização |
| Contrato proposto | Rotas e sentido do fluxo; quem grava (sempre o backend) |
| Aceite | Critérios verificáveis, incluindo o caso de falha e de repetição |
| Decisão do dono | A pergunta objetiva, com a recomendação |

## 3. Regras que toda integração herda
- Dinheiro, comissão, estoque e agenda: só RPC do backend. O fornecedor informa; não grava.
- Webhook: assinatura conferida, idempotência por id do evento, valor reconferido contra o esperado, corpo limitado, resposta sem detalhes.
- Chave do fornecedor só em variável do Render. Nunca na PWA, no repositório ou no chat.
- Nasce desligada: sem a variável, 404 (padrão do agendamento online, `PUBLIC_BOOKING_LINKS`).
- Dado pessoal novo (consentimento, cartão, documento) exige aviso de privacidade e base legal.
- Ledger imutável: correção é lançamento inverso, nunca edição.

## 4. Enquanto a integração não vem: mitigar sem fornecedor
Procure a saída manual que entrega parte do valor hoje e documente o limite:
| Integração | Mitigação já feita |
|---|---|
| WhatsApp API | Lembrete com link wa.me enviado pela recepção |
| NFS-e | CSV de serviços prestados para o contador |
| Pagamento de comissão | Extrato de ganhos por profissional |
| Fechamento salvo | Conferência do dia na tela |
| Rastreio de erro | `X-Request-Id` |

## 5. Quando o dono autorizar
1. Reler a ficha e conferir se "Já existe" continua verdadeiro.
2. Desenho curto em `docs/planning/<NOME>_DRAFT.md` se houver migration (modelo: `ESTORNO_COMANDA_DRAFT.md`).
3. Migration com linha no `migrations.lock`, gate SQL e rollback testado.
4. Skill `red-team` na superfície nova antes de ligar em produção.
5. Atualizar a ficha: de "encaminhado" para a referência da decisão (D-xxx).
