# Análise — "Blueprint Master Unificado HOPEOS v2.0 (M01–M12)" (2026-11-22)

## Origem e escopo
- Documento externo enviado pelo Platform Owner com `/avaliar-proposta`. Propõe 4 domínios novos (`crm/`, `finance/`, `messaging/`, `workers/` + `webhooks/`), schema "canônico" com `unidade_id` em tudo e 12 módulos em 4 fases.
- Continua as análises anteriores: `BLUEPRINT_BEAUTY_WELLNESS_ANALISE.md` (cashback, sinal, gamificação), `AGENDAMENTO_INTELIGENTE_ANALISE.md`, D-047, D-054, D-060. O que já foi decidido lá não é rediscutido aqui.
- Classes: REAL, PARCIAL, AUSENTE, CONTRADITÓRIO, DESCONHECIDO. SQL desta página é `DRAFT ONLY`.

## 1. Veredito
- **Escala errada para o momento.** Produção hoje: **1 salão, 8 clientes ativos, 0 telefones duplicados** (consulta agregada em `hopeos-v1`, 2026-11-22, sem dado pessoal). O blueprint desenha uma rede com filiais, busca semântica com vetores, fila de mensagens paga e carteira de créditos B2B. Quase nada disso tem demanda medida.
- **O que vale (M01):** três lacunas que o próprio código já marca como PARCIAL e o blueprint acerta:
  1. agendamento público grava cliente, agendamento e evento em passos separados, com trava só em memória;
  2. não há unicidade de telefone por salão no banco;
  3. remarcação (criar novo → baixar antigo → mover acessos) não é uma transação.
- **O que contradiz decisões vigentes:** numeração da migration, rate limit `/32` no link público, realocação silenciosa de profissional, merge que "transfere comandas", renomear o schema para inglês e pôr `unidade_id` em tudo.
- **O que fica sem efeito até contador/jurídico/gateway:** cashback em carteira, sinal Pix, recibo de multa por falta, "blindagem da Lei do Salão-Parceiro". Isso já estava registrado na análise anterior.

## 2. Matriz blueprint × código
| Item | Situação real | Classe | Migration? | Fornecedor? |
|---|---|---|---|---|
| M01 RPC de agendamento público atômico | `publicBooking.js:218` `comTrava` em memória (por instância); `repo.insert('clientes')` → `criarAgendamento` (já sob lock no banco, D-058) → `insert('agendamento_eventos')` separados. Se o agendamento falhar, sobra cliente órfão | PARCIAL | Sim (027) | Não |
| M01 `UNIQUE (empresa_id, whatsapp normalizado)` | Não existe. Dedup é feita no código (`clientesDoNumero`, estado `ambiguo`) | AUSENTE | Sim (027) | Não |
| M01 teto diário "O(log N)" | `publicBooking.js:383` lista **todos** os eventos do salão e filtra em memória | PARCIAL (cresce com o histórico) | Não (filtro por data no repo) ou junto da RPC | Não |
| M01 RPC de remarcação | `routes/index.js:729` e `publicBooking.js`: `criarAgendamento` → status do antigo por CAS (`atualizarStatusSe`) → `moverAcessos` em try separado | PARCIAL | Sim (027) | Não |
| M01 desligar `LEGACY_TOKEN_AUTH_ENABLED` | `render.yaml:41` já diz `"false"`; o valor **real** no Render está na lista de ações do dono (`PROJECT_STATE.md:137`) | DESCONHECIDO em produção | Não | Não |
| M01 rate limit IPv4 `/32` no link público | `security/rateLimit.js:62` conta por `/24` **de propósito** (Red Team em produção RTP-01: 66 requisições sem 429 trocando de IP no bloco). Login já é por endereço | CONTRADITÓRIO | — | — |
| M01 cache com `SHA-256(token)` | Não verificado nesta passada | DESCONHECIDO | Não | Não |
| M01 senha 8–128 + JWT recente (≤ 300 s) | `auth.js:109`: só mínimo 8. Exigir JWT recente quebra o link de recuperação se a pessoa demorar mais de 5 min | PARCIAL; teto de tamanho vale, frescor precisa de desenho | Não | Não |
| M01 Leaked Password Protection | Ação do dono no Supabase, já pendente | AUSENTE (config) | Não | Supabase |
| M01 `/me` com 2N consultas | `auth.js:145-150`: 2 consultas por vínculo, em paralelo. Hoje N = 1 | REAL, impacto desprezível | Não | Não |
| M01 Node 22, CSP em site estático | `engines.node 22.x`; `render.yaml:51-87` já tem site estático com CSP. A mudança de URL é risco aceito "antes de clientes pagantes" | REAL no repo, pendente no ar | Não | Render |
| M01 `test:gate` obrigatório na `main` | Já é P1 (proteção de branch é ação do dono) | PARCIAL | Não | GitHub |
| M01 logs 4xx em JSON com `ipHash` | Hoje uma linha `[status] CODE: msg` | PARCIAL | Não | Não |
| M10 busca híbrida RRF + `pgvector` | Busca da agenda só na semana carregada (`agendaMes.js`); sem `pg_trgm`/`unaccent`/vetor | AUSENTE. Vetor: rejeitar (custo, envio de nome a provedor de embedding = LGPD, 8 clientes) | Sim, para `pg_trgm` | Vetor: sim |
| M09 dedup na recepção (score, bloqueio por telefone) | Telefone já cadastrado é recusado em parte das rotas (`routes/index.js:187`); sem alerta por nome parecido | PARCIAL | Não para o alerta; sim para o índice | Não |
| M09 `mergeClients` que "transfere `orders`" + desfazer em 24 h | Ledger imutável por trigger (D-013): comandas e lançamentos não podem ser alterados. Merge tem de ser por apontamento (`merged_into`), nunca por UPDATE em linhas financeiras | CONTRADITÓRIO no desenho | Sim | Não |
| M08 app do cliente com OTP/OAuth e perfil progressivo | Cliente entra por link pessoal com token (D-038), sem conta | AUSENTE | Sim | SMS/OTP |
| M11.1 "Tetris" (`AdjacencyScore`) | D-054: política `compacta`/`equilibrada` no `SlotEngine.aplicarPolitica`, explicável e configurável | REAL (mesma ideia, sem pesos inventados) | — | — |
| M11.2 encaixe na pausa química | Ficou fora da 025 por decisão (D-054: tempo de processamento seria uma migration à parte) | AUSENTE | Sim | Não |
| M11.3 realocação silenciosa de "sem preferência" para atender VIP | Sistema distribuindo clientes entre profissionais por critério do salão é indício de subordinação (D-047, prova de autonomia). Mudar o profissional sem avisar o cliente quebra a confiança e o link pessoal | CONTRADITÓRIO | — | — |
| M11.4 lista de espera em cascata (oferta Top 5, token 15 min) | Lista compatível (D-054) + baixa atômica (D-060), **sem oferta automática**. Push existe (020); WhatsApp automático exige fornecedor | PARCIAL | Sim (ofertas) | Push: não; WhatsApp: sim |
| M11.5 cashback off-peak em carteira | Não existe. Saldo de cliente é passivo contábil com expiração (análise anterior) | AUSENTE / DESCONHECIDO jurídico-contábil | Sim | Contador |
| M12 Trust Score N0–N3 | `NoShowLadder.js`: régua configurável (alerta/sinal), só alerta; link público recusa `exigir_sinal` | PARCIAL | Não para os níveis; sim para o sinal | Gateway |
| M12 sinal Pix + recibo de multa | Onda C, não autorizada | AUSENTE / DESCONHECIDO (CDC, fiscal) | Sim | Gateway + contador |
| M02/M03 deep link WhatsApp Business + modelos | Lembretes por push (020); WhatsApp/SMS pré-configurado e desligado (C5) | PARCIAL | Talvez (modelos) | Não para o deep link |
| M04/M05/M07 fila única, cascata de custo T0/T1/T2, créditos com reserva em duas fases | Não existe | AUSENTE, prematuro | Sim | WhatsApp API/SMS |
| M06 cobrança SaaS, feature flags, carteira B2B | Não existe; não há cliente pagante | AUSENTE, prematuro | Sim | Gateway |
| Schema "canônico" (`full_name`, `services`, `orders`, `unidade_id` em tudo) | Schema real em português, 26 migrations em produção; multiunidade está fora (P2) | CONTRADITÓRIO (reescrita) | — | — |
| "Migrations 026+" | 026 já existe (D-058, versão da escala). A próxima seria 027, que exige autorização | CONTRADITÓRIO | — | — |

## 3. Red Team do blueprint
1. **Ledger imutável:** o merge proposto altera comandas e soma carteira. Isso viola D-013 e apaga a trilha fiscal. → Merge só por apontamento, com histórico de cada cliente intacto.
2. **Efeito jurídico prometido sem parecer:** "preserva 100% da cota-parte", "blindagem fiscal do sinal", "recibo de multa" → DESCONHECIDO até contador e jurídico. A realocação silenciosa e a distribuição por ocupação reforçam o risco trabalhista já registrado.
3. **Cobrança do cliente final (sinal, multa):** exige gateway, CDC (multa proporcional e informada antes), webhook idempotente e estorno. Nada disso existe.
4. **Token de 15 min na oferta de vaga:** precisa de registro no banco com uso único (o `UPDATE ... WHERE status = 'open'` do blueprint está certo). Um JWT sem estado não serve.
5. **Números de negócio sem dado:** pesos 0,45/0,35/0,10/0,10, limiares 0,72/0,85, boost 1,25, decay de +10 dias, Top 5, 30–50% de sinal. São opinião. Se algum entrar, entra como padrão editável com métrica de acerto.
6. **Reescrita:** renomear o schema e criar 4 domínios para 8 clientes é custo sem retorno. → Rejeitado.
7. **Rate limit `/32`:** reabre o furo RTP-01 provado em produção. O falso 429 em CGNAT é hipótese. Medir 429 reais no link antes de mexer.

## 4. Plano em ondas
**Onda 0: produção hoje, sem código (ações do dono)**
- Confirmar no Render `LEGACY_TOKEN_AUTH_ENABLED=false`. Aceite: uma requisição com o token legado volta 401 `LEGACY_AUTH_DISABLED`.
- Ligar Leaked Password Protection no Supabase. Aceite: o advisor de segurança não lista mais o item.
- Tornar o check de CI obrigatório na `main`. Aceite: PR com check vermelho não pode ser mesclado.
- Confirmar Node 22 no log do deploy.

**Onda 1: sem migration — FEITA em D-062 (2026-11-22)**
- Senha com teto de 72 bytes. O Supabase usa bcrypt, que ignora o que passa de 72 bytes; o teto de 128 do blueprint deixaria senhas "diferentes" equivalentes. Aceite: gate com senha de 73 bytes recusada em 422.
- Teto diário do link público contando só os eventos do dia (filtro por intervalo no repositório), não o histórico inteiro. Aceite: gate com 1.000 eventos antigos mostra que a contagem do dia não lê eles.
- Alerta não bloqueante na recepção: "nome parecido com X" (normalização sem acento), além do bloqueio por telefone que já existe. Aceite: E2E cria "Joao Silva" com "João Silva" já cadastrado e vê o aviso.

**Onda 2: migration 027 (exige autorização explícita)**
- `agendamento_publico_criar` (RPC): advisory lock por salão + telefone, upsert do cliente, `agendamento_criar` existente e evento de origem na mesma transação.
- Índice único parcial `(empresa_id, telefone normalizado)` para clientes ativos. Hoje há 0 duplicados, então dá para criar sem saneamento. A migration aborta se encontrar duplicado.
- `agendamento_remarcar` (RPC): novo + baixa do antigo + mover acessos na mesma transação.
- Aceite: gate SQL com dois POSTs concorrentes do mesmo número gerando 1 cliente; falha no agendamento sem cliente órfão; controle negativo sem o índice falha; rollback verde.

**Onda 3: depende de demanda medida**
- Busca de clientes com `pg_trgm` + `unaccent`, sem vetor (migration). Gatilho: mais de ~500 clientes ou reclamação da recepção.
- Oferta de vaga da lista de espera por push com token de uso único e 15 min (migration). Gatilho: cancelamentos tardios medidos por semana.
- Encaixe na pausa (tempo de processamento): migration à parte, já prevista em D-054.

**Fora, até a condição indicada**
- Cashback/carteira, indicação, sinal Pix, multa: contador + jurídico + gateway (Onda C).
- Fila de mensagens paga, créditos B2B, cobrança SaaS, feature flags: primeiro cliente pagante.
- App do cliente com login (OTP/OAuth): fornecedor de SMS + demanda.
- `unidade_id` em tudo / multiunidade: segunda unidade real.
- Realocação silenciosa de profissional e busca vetorial: rejeitadas.

## 5. Decisões do Platform Owner
1. Autorizar a **migration 027** com o escopo da Onda 2 (RPC pública atômica + índice único de telefone + RPC de remarcação)?
2. Índice único: **abortar se houver duplicado** (recomendado; hoje há 0) ou auto-mesclar?
3. Executar a Onda 1 (sem migration) agora?
4. Confirmar como rejeitados: realocação silenciosa (M11.3), busca vetorial (M10), renomear o schema e `/32` no link público.
