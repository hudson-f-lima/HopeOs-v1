# Aviso de privacidade do agendamento online — MODELO (DRAFT)

> **Modelo a validar juridicamente.** Este texto não é parecer jurídico e não está aprovado. O controlador é o salão: cabe a ele (com assessoria jurídica) revisar, completar os campos entre `[colchetes]` e aprovar. O HOPE OS fornece o modelo como operador (inferência do `AGENDAMENTO_ONLINE_DRAFT.md` §7, a confirmar no contrato com o salão).
>
> Origem: `docs/audit/RED_TEAM_2026-11.md` (RT-11c) e pendência de D-014 ("aviso de privacidade aprovado"). A versão curta exibida em `agendar.html` (bloco "Aviso de privacidade") segue este modelo; a versão aprovada deve ser registrada em `PUBLIC_BOOKING_AVISO_VERSAO` (gravada em cada agendamento online, no evento `origem_link_publico`).

## 1. O que o sistema faz hoje (fatos para quem for validar)
| Item | Fato no código | Onde |
|---|---|---|
| Dados pedidos ao cliente | nome, WhatsApp, serviço, profissional, dia e horário | `agendar.html`, `POST /api/public/agendar/:slug` |
| Dados gravados além do formulário | data/hora do aceite do aviso, versão do aviso, IP truncado (IPv4 /24, IPv6 /48), origem (`link_publico`), se o número já era cliente | `agendamento_eventos.payload` (`publicBooking.js`) |
| Dados **não** gravados | IP completo; dado de saúde (não há campo de observações no formulário público) | `publicBooking.js` |
| Uso em memória, não gravado | IP (agrupado) e número, para limite de tentativas; zera ao reiniciar o servidor | `security/rateLimit.js` |
| Quem acessa | equipe do salão pela PWA, conforme o papel (admin, gestor, recepção, profissional) | `auth/rbac.js` |
| Onde fica | banco Supabase (Postgres) do HOPE OS e API no Render | `render.yaml`, D-010 |
| Terceiros na página pública | nenhum (sem Google Fonts, sem analytics, CSP `default-src 'none'`) | `agendar.html`, E2E `agendar` |
| Exclusão/anonimização pelo produto | **não existe** ainda (lacuna registrada no draft §7); hoje o salão desativa o cadastro | `PATCH /api/clientes/:id` |
| Mensagens | o salão manda confirmação/lembrete pelo WhatsApp dele (link `wa.me`), não há envio automático | `ReminderEngine.js` |

## 2. Texto modelo (versão completa)

**Aviso de privacidade — agendamento online de [NOME DO SALÃO]** · versão `[AAAA-MM-DD]`

**1. Quem é o responsável pelos seus dados (controlador)**
[RAZÃO SOCIAL DO SALÃO], CNPJ [00.000.000/0000-00], [endereço], é quem decide como seus dados são usados neste agendamento. Contato para assuntos de privacidade: [WhatsApp e/ou e-mail do salão] ([nome do encarregado, se houver]).

**2. Quem guarda os dados em nome do salão (operador)**
O sistema de gestão HOPE OS armazena e processa os dados somente conforme as instruções do salão, em provedores de nuvem [Supabase / Render, região — confirmar].

**3. Quais dados usamos**
- Os que você informa: nome, número de WhatsApp, serviço, profissional, dia e horário escolhidos.
- Os registrados automaticamente: data e hora em que você confirmou ter lido este aviso, a versão do aviso e parte do seu endereço de internet (IP), sem o número completo, para prevenir abuso.
- Não pedimos nem queremos dados de saúde neste formulário.

**4. Para que usamos (finalidade)**
- Registrar o seu agendamento na agenda do salão.
- Falar com você sobre ele: confirmação, lembrete, remarcação ou cancelamento, pelo WhatsApp.
- Evitar agendamentos falsos ou em excesso (limites de tentativas e histórico de comparecimento no salão).
Não usamos estes dados para propaganda. Se o salão quiser mandar promoções, pedirá a sua autorização separadamente.

**5. Base legal**
Execução de procedimentos preliminares relacionados ao serviço que você pediu (Lei 13.709/2018 — LGPD, art. 7º, V). Para a prevenção de abuso: legítimo interesse do salão (art. 7º, IX) [validar].

**6. Com quem compartilhamos**
Com o operador (HOPE OS) e os provedores de nuvem dele, só para o funcionamento do sistema. Não vendemos nem cedemos seus dados. [Listar outros, se houver.]

**7. Por quanto tempo guardamos**
Enquanto você for cliente do salão ou até pedir a exclusão, respeitados os prazos que a lei exigir do salão (por exemplo, registros fiscais de serviços pagos). [Definir prazo para cadastro sem atendimento — sugestão a validar: 24 meses sem agendamento.]

**8. Seus direitos**
Você pode, a qualquer momento: confirmar se tratamos seus dados; acessá-los; corrigi-los; pedir anonimização, bloqueio ou exclusão dos desnecessários; pedir informação sobre compartilhamento; e reclamar à Autoridade Nacional de Proteção de Dados (ANPD). Fale com o salão pelo contato do item 1. [Prazo de resposta — validar.]

**9. Segurança**
Acesso restrito à equipe do salão por login individual e papel, conexão criptografada (HTTPS) e registro de quem faz cada alteração.

**10. Mudanças neste aviso**
Quando mudarmos este aviso, a versão e a data acima mudam. Cada agendamento guarda a versão que você leu.

## 3. Versão curta (a da página)
Mantida em `agendar.html`, bloco `<details class="privacidade">`: controlador e operador, dados e finalidade, base legal, retenção e direitos, com a versão exibida a partir de `PUBLIC_BOOKING_AVISO_VERSAO`. Quando o texto completo for aprovado, publicar a versão completa num endereço estável e linkar na versão curta.

## 4. Pendências antes de aprovar
1. Preencher os `[colchetes]` (dados do salão, contato, prazos).
2. Confirmar a base legal da prevenção de abuso (legítimo interesse exige teste de balanceamento).
3. Confirmar o papel do HOPE OS (operador) no contrato com o salão.
4. Definir retenção de cadastro sem atendimento e criar o fluxo de exclusão/anonimização no produto (lacuna; pode exigir migration).
5. Registrar a versão aprovada em `PUBLIC_BOOKING_AVISO_VERSAO` e no `docs/DECISIONS.md`.
