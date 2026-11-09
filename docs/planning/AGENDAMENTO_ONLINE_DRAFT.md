# Agendamento online pelo cliente — proposta (DRAFT)

**Status:** proposta para decisão. Nada foi implementado. É uma feature nova (bloqueio do `AGENTS.md`) e precisa de autorização como D-006/D-008. A migration 009+ **não** está autorizada.
**Origem:** lacuna 4 e prioridade 3 de `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md` ("item básico em todos os concorrentes").
**Convenção:** **Fato** traz arquivo:linha. **Inferência** é conclusão a partir dos fatos. **Hipótese** precisa de validação.

## 1. Fatos do código atual
| # | Fato | Evidência |
|---|---|---|
| F1 | Todo `/api` de negócio passa por `requireAuth`. Só `/api/health` e `authRouter` (login etc.) ficam antes do perímetro | `backend/src/app.js:47-57` |
| F2 | Tenant vem da membership; `X-Empresa-Id` é só um seletor dentro das memberships do usuário; `empresa_id` do cliente nunca é autoridade | ADR-005 `:150`, `:194` |
| F3 | `agendamento_criar` faz a checagem de conflito e o insert sob `pg_advisory_xact_lock` por (empresa, profissional, data), respeitando o buffer. O teste de concorrência tem controle negativo | `008:113-180`, `supabase/tests/concurrency_agenda.sh` |
| F4 | `agendamento_criar` **não** valida expediente, antecedência nem `ativo` de serviço/profissional. Também aceita `status` do payload. Essas regras vivem no backend (`requireActiveEntity`, `resolveDuracaoMin`) | `007:328-375`; `routes/index.js:392-424` |
| F5 | `buildSlotsDoDia` é puro. Recebe expediente, agendamentos do dia, buffer e `agora`, e devolve só horários (sem dados de outros clientes). Já recusa dia passado e horário antes de agora | `backend/src/engines/SlotEngine.js:164-188` |
| F6 | `clientes.whatsapp` é texto livre, sem índice único nem normalização | `001_init.sql:24-33` |
| F7 | A régua de faltas calcula `exigir_sinal`/`alerta` a partir do histórico do cliente. Só alerta; não cobra | `backend/src/engines/NoShowLadder.js:6-28`; `RetentionService.js:211` |
| F8 | Já existe rate limit em memória por IP+e-mail no login, com `trust proxy` ligado | `routes/auth.js:13-25`; `app.js:39` |
| F9 | `agendamento_eventos (tipo, payload jsonb)` existe desde a 001 e serve para registrar origem/consentimento sem schema novo | `001_init.sql:250-256` |
| F10 | `agendamentos.created_by` é nullable (histórico e principal sem ator) | `007:186` |
| F11 | Lembretes de confirmação via wa.me listam os agendamentos não confirmados de amanhã | `routes/index.js:337-361` (D-011) |
| F12 | `express.json({ limit: '5mb' })` é global | `app.js:40` |

## 2. Identificar o salão sem `empresa_id` na URL
A regra (CLAUDE.md; F2) proíbe tratar `empresa_id` vindo do cliente como verdade. Uma rota pública não tem membership, então o servidor precisa resolver o tenant a partir de **algo que ele mesmo emitiu ou configurou**.

| Opção | Como | Migration | Prós | Contras |
|---|---|---|---|---|
| A. UUID da empresa na URL | `/agendar/<empresa_id>` | Não | Trivial | **Viola a regra:** tenant escolhido pelo cliente, sem liga/desliga por salão, expõe o id interno. **Rejeitar** |
| B. Mapa no servidor (env) | `PUBLIC_BOOKING_LINKS={"salao-da-ana":"<uuid>"}`; a URL leva o slug | Não | Tenant resolvido por configuração do servidor; URL legível; desliga com deploy | Não escala (cada salão exige deploy); o dono não ativa sozinho |
| C. Token assinado (HMAC) | URL `/agendar/<token>` com token = `v1.<empresa_id>.<hmac(secret, ...)>` | Não | Sem tabela; o servidor só aceita o que ele assinou | Desligar um salão exige lista de bloqueio ou troca de segredo (derruba todos); URL feia; `empresa_id` visível (assinado, não secreto) |
| D. Tabela de links públicos | `empresa_links_publicos (slug unique, ativo, config)`; slug → empresa no banco | **Sim (009+)** | O dono ativa/desativa pela PWA; config por salão (antecedência, janela, profissionais online); revogação imediata | Exige migration e autorização |

**Recomendação:** **B no piloto** (um salão, sem migration, reversível) e **D quando houver o 2º salão**. A opção C não compensa: tem a complexidade da D sem a revogação.

Em qualquer opção, a rota pública monta um contexto próprio (`req.publicBooking = { empresa_id, fonte: 'link_publico' }`). Esse contexto **nunca** é `req.auth`, nunca passa por `authorize()` e só acessa os 3 endpoints abaixo. Slug desconhecido ou desativado → `404` genérico (não revela se o salão existe).

## 3. Fluxo
Router `publicBookingRouter` montado **antes** de `requireAuth` (F1), com `express.json({ limit: '10kb' })` próprio (F12) e CORS restrito à origem da PWA.

1. `GET /api/public/agendar/:slug` → nome do salão, serviços ativos (nome, duração, preço se o dono quiser mostrar) e profissionais que atendem cada serviço (`profissional_servicos`), só com o primeiro nome. Sem WhatsApp, sem comissão, sem clientes.
2. `GET /api/public/agendar/:slug/slots?servicoId&profissionalId&data` → reaproveita exatamente o que `GET /agenda/slots` faz (`routes/index.js:364-389`): `buildSlotsDoDia` com `agora` no fuso da empresa e mais 2 filtros públicos, a **antecedência mínima** (ex.: 2 h) e a **janela máxima** (ex.: 30 dias). Opção "qualquer profissional": o backend percorre os profissionais do serviço e devolve a união dos horários, escolhendo o profissional só na gravação.
3. `POST /api/public/agendar/:slug` com `{ servicoId, profissionalId, data, horario, nome, whatsapp, consentimento, hp }`:
   - valida formato, nome (2–80 caracteres) e WhatsApp normalizado para E.164 BR (`+55` + DDD + 8/9 dígitos);
   - **recalcula os slots no servidor** e exige que `horario` esteja entre eles. Isso fecha F4: expediente, antecedência e serviço/profissional ativos, regras que a RPC não checa;
   - resolve o cliente (§4) e a régua (§6);
   - grava via `repo.criarAgendamento` → `agendamento_criar` com `status: 'agendado'` **fixo**, `permitirConflito: false` **fixo** e `created_by: null` (F10). Conflito concorrente → `409` "Horário acabou de ser ocupado, escolha outro" (F3);
   - registra `agendamento_eventos` com `tipo='criado_online'` e payload `{ origem, versao_aviso_privacidade, consentimento_em }`, sem IP em claro (F9).
4. **Confirmação:**
   - Tela de sucesso com data, hora, serviço e endereço, mais um botão wa.me para o cliente avisar o salão (opcional).
   - O agendamento entra como `agendado` e aparece nos Lembretes (F11). A recepção confirma como faz hoje. Não há SMS/OTP: envio automático exige fornecedor (D-011).
   - Cancelamento pelo cliente: fase 2. Link com token HMAC do `agendamento_id` (sem migration) e prazo mínimo.

## 4. Identificação e deduplicação do cliente
- Dados mínimos: **nome + WhatsApp**. E-mail, CPF e data de nascimento não são pedidos.
- Busca por WhatsApp **normalizado** dentro da empresa. Os números atuais são texto livre (F6), então a comparação normaliza os dois lados no backend (**inferência**: volume pequeno por salão, aceitável em memória no piloto).
  - Achou 1 cliente ativo → reusa o `cliente_id`. **Não** atualiza o nome cadastrado e **não** mostra ao visitante o nome que já existe. Mostrar permitiria enumerar clientes pelo número.
  - Achou mais de 1 → usa o mais antigo ativo e marca no evento (`dedup: 'ambiguo'`) para a recepção revisar.
  - Não achou → cria o cliente (`created_by: null`, `observacoes: 'Cadastro pelo link online'`).
- Corrida de criação duplicada (dois POSTs do mesmo número ao mesmo tempo): sem migration fica PARCIAL, mitigada por um lock em memória por número. A garantia real seria um índice único parcial em `(empresa_id, whatsapp_normalizado)` ou uma RPC com advisory lock (**migration**). Antes, é preciso limpar as duplicatas existentes.
- Inferência de risco: sem verificação do número, alguém pode marcar em nome de outra pessoa. A mitigação é o limite por número (§5) e a confirmação humana (F11).

## 5. Anti-abuso sem fornecedor
| Controle | Proposta | Sem migration? |
|---|---|---|
| Rate limit por IP | Padrão de F8: ex. 20 GET/min e 5 POST/h por IP+slug; `429` | Sim (em memória; zera no restart e não é compartilhado entre instâncias: PARCIAL) |
| Limite por número | No máximo 2 agendamentos futuros ativos por WhatsApp, por salão; o 3º recebe mensagem genérica "fale com o salão" | Sim (consulta a `agendamentos`) |
| Limite por salão | Teto diário de agendamentos online (ex.: 30) como disjuntor contra spam | Sim (env no piloto; coluna na opção D) |
| Antecedência e janela | Mínimo de 2 h e máximo de 30 dias (configurável) | Sim |
| Honeypot + tempo mínimo | Campo `hp` invisível preenchido, ou envio em menos de 3 s desde o GET → `201` falso (não grava) | Sim |
| Captcha | Turnstile/hCaptcha é **fornecedor** (decisão §9). Começar sem e ligar se aparecer spam | — |
| Payload | Corpo de 10 kB; só os campos listados; qualquer campo de autoria ou `empresaId` → `422` | Sim |

## 6. Régua de faltas
Calculada no POST para o cliente já existente (F7), sem revelar o motivo ao visitante.
- `exigir_sinal` — **Opção 1 (recomendada):** bloqueia online com mensagem genérica "Para este horário, fale com o salão pelo WhatsApp" e botão wa.me. A mesma mensagem dos limites de §5, para não revelar o histórico. **Opção 2:** permite e marca o evento (`alerta_regua: 'exigir_sinal'`), deixando a recepção decidir. **Opção 3:** exigir sinal online, que é Onda C (gateway), não autorizada.
- `alerta` → permite e marca no evento, para a recepção confirmar com prioridade nos Lembretes.
- `ok`/`tolerada` → fluxo normal.

## 7. LGPD
- **Base legal (inferência, validar com jurídico):** o agendamento é procedimento preliminar de contrato pedido pelo titular (LGPD art. 7º, V), então não depende de consentimento. O checkbox é de **ciência** do aviso de privacidade, com versão registrada no evento.
- Marketing (promoções por WhatsApp) é opt-in **separado** e desmarcado. Sem coluna própria, fica fora do V1.
- Minimização: sem IP em claro (o rate limit usa a memória do processo; se for registrar, usar hash com sal rotativo). Sem dado de saúde: o texto do aviso deve pedir para não escrever informação clínica em observações, e o formulário público não tem campo de observações.
- Aviso de privacidade com controlador (o salão), finalidade, retenção e canal do titular. O HOPE OS é operador (**inferência**). Precisa de texto aprovado (§9).
- Direitos do titular: exclusão/anonimização do cliente ainda não existe no produto (lacuna, fora deste escopo).

## 8. Riscos e Red Team
| Ataque | Mitigação | Estado proposto |
|---|---|---|
| Enumeração de clientes pelo WhatsApp | A resposta nunca traz nome ou histórico; a mensagem é igual para bloqueio por régua, limite ou erro | Mitigado no desenho |
| Enumeração de salões | Slug não sequencial; `404` genérico; rate limit | Mitigado |
| Spam de agenda (lotar horários) | Limite por número + por IP + teto diário + honeypot; online entra como `agendado` e a recepção pode cancelar em lote | PARCIAL (sem captcha nem verificação do número) |
| Double-booking | Advisory lock no banco (F3); gate de concorrência existente | REAL, fechado no banco |
| Burlar expediente/antecedência chamando a RPC direto | A RPC só executa com `service_role` (`008:210-211`); o backend recalcula os slots (§3.3) | Mitigado |
| Tenant forjado | Opção B/D resolve no servidor; `empresaId` no body → `422` | Mitigado |
| Injeção/XSS via nome | `escapeHtml` em toda renderização (auditoria lacuna 9); limite de tamanho e de caracteres | Mitigado; incluir no gate |
| DoS no `/slots` | Rate limit; consulta limitada a 1 profissional × 1 dia (ou N profissionais do serviço) | PARCIAL |
| Envenenar a régua (marcar em nome de terceiro e faltar) | Agendamento online não confirmado que vira `no_show` deveria contar menos. **Hipótese**: excluir `no_show` de online não confirmado da régua | Decisão §9 |

Red Team obrigatório antes de produção: rota pública é superfície nova, sem autenticação.

## 9. Escopo, tamanho e gates
**Sem migration (opção B):** os 3 endpoints, a página pública estática (`/agendar.html` na PWA, sem login), a deduplicação em memória, os limites em env, o evento em `agendamento_eventos`, a régua e o aviso de privacidade. **Tamanho: M** (~1 semana de trabalho focado, **hipótese**).
**Com migration (009+, opção D):**
- `empresa_links_publicos` (slug, ativo, antecedência, janela, teto diário, profissionais visíveis);
- índice/coluna de WhatsApp normalizado com unicidade parcial;
- coluna `agendamentos.origem`;
- RLS deny-all e grants só para `service_role`, como em `007:408-416`.

Mais tela de configuração na PWA. **Tamanho: G** somando as duas fases.

Gates propostos:
- `public-booking-gate.test.js` (offline):
  - slug inválido → 404;
  - `empresaId` no body → 422;
  - horário fora do expediente, antes da antecedência ou ocupado → recusado;
  - limite por número → mensagem genérica;
  - `exigir_sinal` → bloqueado com a mesma mensagem;
  - nenhuma resposta contém nome de cliente existente;
  - status gravado sempre `agendado`.
  - **Controle negativo:** desligar a revalidação de slot no POST faz o teste de "fora do expediente" falhar.
- Concorrência: reusar `concurrency_agenda.sh`. É a mesma RPC; o gate HTTP dispara 2 POSTs simultâneos e espera 1 `201` + 1 `409`.
- E2E Playwright: cliente marca pelo link, a recepção vê nos Lembretes e confirma.

Pré-requisito: produção publicada (prioridade 1 da auditoria). Sem backend no ar, o link público não tem valor.

## 10. Decisões pendentes do Platform Owner
1. Autoriza o agendamento online como feature nova (exceção ao bloqueio de novas features, como D-006/D-008)?
2. Aprova a identificação por **mapa slug → empresa em variável de ambiente** no piloto (opção B), deixando a tabela de links (opção D, migration 009+) para o 2º salão?
3. Cliente com `exigir_sinal` é bloqueado no online com mensagem genérica (recomendado), apenas marcado, ou fica à espera da Onda C?
4. Quais são a antecedência mínima e a janela máxima padrão (sugestão: 2 h e 30 dias)? E o limite por número (sugestão: 2 agendamentos futuros)?
5. O preço do serviço aparece na página pública?
6. Pode usar captcha de fornecedor (Turnstile/hCaptcha) se surgir spam, ou só controles próprios?
7. Quem redige e aprova o aviso de privacidade (controlador = salão)? O HOPE OS fornece um modelo?
8. `no_show` de agendamento online **não confirmado** conta na régua de faltas?
9. O cancelamento pelo próprio cliente (link com token) entra no V1 ou fica para a fase 2?
