# HOPE OS — API Contract

> Formato das respostas, validações e erros por área. **A lista completa das rotas, com a permissão de cada uma, está em [`ROTAS.md`](ROTAS.md)** (gerada do código). As seções abaixo foram escritas por decisão (D-0xx) e podem não cobrir toda rota: em caso de dúvida, vale o código e o `ROTAS.md`.

## Checkout preview/close

Payload permitido:

```json
{
  "idempotencyKey": "checkout-001",
  "clienteId": "uuid",
  "data": "2026-07-01",
  "hora": "14:30",
  "itens": [
    { "tipo": "servico", "servicoId": "uuid", "profissionalId": "uuid" },
    { "tipo": "produto", "produtoId": "uuid", "quantidade": 1, "profissionalId": "uuid-opcional" }
  ],
  "payments": [
    { "formaCode": "dinheiro", "valorCentavos": 9500 }
  ],
  "descontoCentavos": 0,
  "gorjetaCentavos": 0
}
```

## Payload proibido

```txt
formasPagamento[]
valorCentavos/precoUnitarioCentavos no item
custoUnitarioCentavos no item
lucro/margem no item
comissaoPct no item
modeloComissao no item
taxaPct/taxaFixa no payment
receita/comissão/gorjeta calculada
```

## Totais de retorno

```txt
servicosLiquidosCentavos = somente serviços
produtosLiquidosCentavos = somente produtos
itensLiquidosCentavos = serviços + produtos
```

## Erros relevantes

```txt
MISSING_ITEM_TYPE
INVALID_ITEM_TYPE
FRONTEND_FINANCIAL_INPUT_FORBIDDEN
PRODUCT_OUT_OF_STOCK
PRODUCT_BELOW_COST
PAYMENT_TOTAL_MISMATCH
```

## Agenda — leitura do dia com ícones do card (D-077)

`GET /api/agenda?data=YYYY-MM-DD[&marcadores=1]` (`agenda:ver`; profissional vê só os próprios). Com `marcadores=1` e `data`, cada agendamento traz:
- `marcadores`: lista, na ordem do card, entre `assinatura`, `assinatura_atraso`, `primeira_visita`, `recorrente`, `link`, `espera` e `faltas`. Os de assinatura só vêm para quem tem `assinatura:ver`.
- `pago`: `true` só para `fechado` ou `concluido` pelo checkout.

Sem `marcadores=1`, a resposta é a de sempre.

## Agenda — sugestão de horários

`GET /api/agenda/slots?data=YYYY-MM-DD&profissionalId=uuid&servicoId=uuid[&duracaoMin=5..480]` — somente leitura; tenant vem de `req.auth` (nunca da query).

```json
{
  "ok": true,
  "data": {
    "data": "2026-10-19",
    "duracaoMin": 45,
    "passoMin": 30,
    "minUtilMin": 30,
    "janela": { "inicio": "09:00", "fim": "13:00" },
    "profissionalId": "uuid",
    "servicoId": "uuid",
    "slots": [
      { "horario": "09:00", "fim": "09:45", "ancora": true, "recomendado": true,
        "buracoAntesMin": 0, "buracoDepoisMin": 15, "desperdicioMin": 15 }
    ]
  }
}
```

- `duracaoMin`: override do profissional (`overrides[servicoId].duracao_min`) > `servicos.duracao_min` > 30 — mesma regra do `POST /agenda`.
- `janela: null` + `slots: []`: sem expediente configurado no dia (falha fechado; não há expediente padrão inventado).
- `ancora`: encosta em abertura, fechamento, almoço ou outro atendimento ativo. `recomendado`: âncora com a menor sobra inutilizável (sobra menor que o menor serviço vendável) dentro da janela livre.
- Data passada → `slots: []`; hoje → só a partir do horário atual em `APP_TIMEZONE`.
- A sugestão não reserva: `POST /agenda` revalida conflito na gravação.
- Erros: 422 `DATE_REQUIRED`, `PROFESSIONAL_REQUIRED`, `SERVICE_ID_REQUIRED`, `INVALID_UUID`, `INVALID_DURATION`; 422 `*_NOT_FOUND`/`*_INACTIVE`; 401 sem token.

## Autenticação (ADR-005)

Toda rota `/api/*` (exceto `/api/health`, `/api/auth/*` e `/api/me`) exige `Authorization: Bearer <credencial>`. Três tipos, nunca intercambiáveis:

| Credencial | Formato | `req.auth` | Autorização |
|---|---|---|---|
| Usuário | JWT do Supabase Auth (obtido em `/api/auth/login`) | `principal_type: 'user'`, `user_id`, `actor_id`, `empresa_id`, `role`, `unit_ids`, `profissional_id` | Matriz por papel (`backend/src/auth/rbac.js`) |
| Integração | `kxi_<credentialId>_<segredo>` | `principal_type: 'integration'`, `integration_id`, `empresa_id`, `scopes` | Scope com o nome da ação |
| Legado | `API_ACCESS_TOKEN` | `principal_type: 'legacy'`, só `empresa_id` | Tudo menos `/api/admin/*`; desligável (`LEGACY_TOKEN_AUTH_ENABLED=false`) |

Cabeçalhos opcionais (só seletores, validados contra o que o usuário já tem): `X-Empresa-Id` (obrigatório se o usuário tiver mais de uma empresa → senão 400 `EMPRESA_SELECTION_REQUIRED`), `X-Unidade-Id`.

Ações RBAC: cada rota exige uma ação, que é uma permissão fina do catálogo `backend/src/auth/permissoes.js` (D-032; matriz por papel em [`PERMISSOES.md`](PERMISSOES.md)) ou uma ação de administração de `backend/src/auth/rbac.js` (`admin`, `checkout:estornar`, `comissoes:pagar`). **A ação de cada rota está em [`ROTAS.md`](ROTAS.md).** Profissional tem escopo "Próprio" em agenda e checkout (`NOT_OWN_RESOURCE`).

Erros: 401 `UNAUTHENTICATED`/`LEGACY_AUTH_DISABLED`; 403 `USER_INACTIVE`, `NO_ACTIVE_MEMBERSHIP`, `EMPRESA_NOT_AUTHORIZED`, `NO_UNIT_ACCESS`, `UNIT_NOT_AUTHORIZED`, `INSUFFICIENT_ROLE`, `INSUFFICIENT_SCOPE`, `INTEGRATION_INACTIVE`, `PROFESSIONAL_LINK_REQUIRED`, `NOT_OWN_RESOURCE`, `USER_PRINCIPAL_REQUIRED`; 503 `AUTH_PROVIDER_UNAVAILABLE` (nunca vira acesso).

Campos de autoria (`created_by`, `updated_by`, `cancelled_by`, `actor_id`, `integration_id` e variações camelCase) no corpo de qualquer escrita → 422 `FORBIDDEN_FIELD`.

### Sessão
| Rota | Corpo | Resposta |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | `{ access_token, refresh_token, expires_in, expires_at, user }`; 429 após `LOGIN_RATE_LIMIT_MAX` tentativas por IP+e-mail |
| `POST /api/auth/refresh` | `{ refresh_token }` | nova sessão |
| `POST /api/auth/logout` | — (Bearer JWT) | revoga a sessão no provedor |
| `POST /api/auth/recover` | `{ email }` | sempre 200 com a mesma mensagem |
| `POST /api/auth/password` | `{ password }` (Bearer do link de convite/recuperação) | mínimo 8 caracteres; máximo 72 bytes em UTF-8 (`PASSWORD_TOO_LONG`, 422, D-062) |
| `GET /api/me` | — | usuário: `{ user, empresas[{ empresa_id, nome, role, unidades }] }` (funciona sem `X-Empresa-Id`); integração/legado: o próprio contexto |

### Administração (`admin`, só principal usuário)
| Rota | Uso |
|---|---|
| `GET /api/admin/memberships` · `POST /api/admin/invites` · `PATCH /api/admin/memberships/:id` | Equipe: convidar por e-mail (`{ email, role, profissionalId?, unitIds? }`), mudar papel/status/cadastro/unidades; nunca deixa a empresa sem admin ativo (409 `LAST_ADMIN`) |
| `GET/POST /api/admin/unidades` · `PATCH /api/admin/unidades/:id` | Unidades (desativar revoga o acesso de quem só tinha aquela) |
| `GET/POST /api/admin/integrations` · `PATCH /api/admin/integrations/:id` | Integrações; o segredo só aparece na resposta de criação/rotação |
| `POST /api/admin/integrations/:id/credentials` | Rotação: nova ativa, anterior expira após `INTEGRATION_ROTATION_OVERLAP_MIN`; máximo duas válidas |
| `POST /api/admin/integrations/:id/credentials/:credentialId/revoke` | Revogação imediata |
| `GET /api/admin/integrations/:id/audit` · `GET /api/admin/auth-metrics` | Auditoria e adoção JWT × legado |

## Empresa e assistente de configuração (D-008)
| Rota | Ação RBAC | Uso |
|---|---|---|
| `GET /api/empresa` | `cadastros:ver` | Dados e horários da empresa do usuário |
| `PATCH /api/empresa` | `empresa:configurar` | `{ nome, telefone, whatsapp, endereco, cidade, horarioPorDia: {seg:{ativo,inicio,fim},…}, slotPadrao: 10|15|20|30|45|60, intervaloAlmoco, almocoInicio, almocoFim }`; outros campos → 422 `FORBIDDEN_FIELD` |
| `GET /api/onboarding/status` | `empresa:configurar` | `{ fases[{id,titulo,concluida}], proximaFase, completo, resumo }` — derivado dos dados |
| `GET /api/onboarding/presets` | `empresa:configurar` | Cardápios por nicho, formas de pagamento e horário padrão (sugestões editáveis) |
| `POST /api/onboarding/servicos` | `empresa:configurar` | `{ itens: [{ nome, categoria, valorCentavos, duracaoMin, comissaoPct }] }` (até 50); nome repetido é ignorado |
| `POST /api/onboarding/formas` | `empresa:configurar` | `{ itens: [{ code, label, taxaPct, diasRecebimento }] }`; código repetido é ignorado |

## Onda B (D-009, migration 008)
| Rota | Ação RBAC | Uso |
|---|---|---|
| `GET /api/cargos` · `POST /api/cargos` · `PATCH /api/cargos/:id` | leitura: `cadastros:ver`; escrita: `catalogo:editar` | `{ nome, comissaoPct, modeloComissao: dividido|bruto_salao|bruto_staff, ativo }`; nome repetido (sem diferenciar maiúsculas) → 409 `CARGO_EXISTS` |
| `GET /api/categorias` · `POST /api/categorias` · `PATCH /api/categorias/:id` | idem | `{ nome, comissaoPct|null, ativo }`; 409 `CATEGORIA_EXISTS` |
| `POST/PATCH /api/profissionais` | `catalogo:editar` | aceita `cargoId` (da mesma empresa, senão 422 `CARGO_NOT_FOUND`) |
| `POST/PATCH /api/servicos` | `catalogo:editar` | aceita `categoriaId` e `modeloHeranca: FIXED_SERVICE|BY_CATEGORY|BY_ROLE` |
| `PATCH /api/empresa` | `empresa:configurar` | também `cnpj` (dígitos verificadores; máscara aceita; `null` limpa), `razaoSocial`, `salaoParceiro`, `bufferMin` (0/5/10/15), `reguaAlertaFaltas` < `reguaSinalFaltas` |
| `PATCH /api/empresa` (D-084, migration 028) | `empresa:configurar` | `agendaUsaChegada`: só `true` ou `false` (outro valor → 422 `INVALID_FIELD`). `GET /api/empresa` devolve `agenda_usa_chegada` (padrão `true`); a tela decide entre "Cliente chegou" e "Iniciar atendimento". O servidor continua aceitando os dois caminhos de status |
| `POST /api/onboarding/cargos` | `empresa:configurar` | `{ itens: [{ nome, comissaoPct, modeloComissao }] }`, idempotente |
| `GET /api/relatorios/cota-parte?mes=YYYY-MM` | `painel:financeiro` | `{ comandas, valorItensCentavos, cotaParteSalaoCentavos, cotaParteProfissionaisCentavos, profissionais[{ nome, itens, valorCentavos, cotaParteCentavos }], salaoParceiro, cnpj, razaoSocial }` |
| `GET /api/insights/clients/:id/reliability` | `painel:operacional` | inclui `regua: { faltasSeguidas, nivel: ok|tolerada|alerta|exigir_sinal, mensagem, limites }` — só alerta, sem cobrança |

- Comissão no checkout: `itens[].comissaoPct` + `comissaoOrigem` (`override_profissional`, `cargo`, `categoria` ou `servico`).
- `GET /api/agenda/slots` devolve `bufferMin`; cada atendimento ocupa até o fim + buffer (mesma regra do `agendamento_criar`).

## Lembretes e transições de status (D-011)
`GET /api/agenda/lembretes[?data=YYYY-MM-DD]` (`agenda:read`; profissional vê só os próprios). Sem `data` = amanhã no `APP_TIMEZONE`. Só leitura, não envia nada.
```json
{ "data": "2026-11-10", "pendentes": 3, "comLink": 2, "confirmados": 1,
  "itens": [{ "agendamentoId": "uuid", "horario": "09:30", "status": "agendado", "clienteNome": "João Silva",
              "servicoNome": "Corte", "profissionalNome": "Robson", "texto": "Olá, João! Lembrete…",
              "link": "https://wa.me/5511988887777?text=…", "motivo": null }] }
```
- Pendentes = `agendado`/`aguardando`, ordenados por horário. `link: null` com `motivo`: `sem_whatsapp`, `whatsapp_invalido` (precisa de DDD + 8/9 dígitos) ou `sem_cliente`.
- Data fora do formato → 422 `INVALID_DATE`.

`PATCH /api/agenda/:id/status`: agendamento `concluido`, `fechado` ou `reagendado` não muda mais de status → 409 `INVALID_STATUS_TRANSITION` (`details: { de, para }`).

Remarcação (`status: 'reagendado'` com `reagendamento`, e `POST /api/public/meu-agendamento/remarcar`), D-063/027: o novo horário e o original `reagendado` são gravados numa transação. Se o original mudou de status depois de lido → 409 `AGENDAMENTO_MUDOU`, sem nada gravado. Escala mudada durante a gravação → 409 `ESCALA_MUDOU` (antes da D-063, 500 no banco real).

Na remarcação pela equipe, `novaDuracaoMin` (opcional, inteiro de 10 a 480; fora disso, 422 `INVALID_DURATION`) grava o novo horário com outra duração na mesma operação. Conflito e escala são conferidos com a duração nova (D-081). Sem o campo, a duração é mantida.

## Comandas por período (D-082)

`GET /api/comandas?data=AAAA-MM-DD` (um dia, como antes) ou `?inicio=&fim=` (até 92 dias, inclusive), com permissão `comanda:historico`. Devolve `{data, inicio, fim, hoje, prazoDias, comandas, resumo:{comandas, recebidoCentavos, estornadoCentavos}}`, com as mais recentes primeiro. Erros 422: `INVALID_RANGE` (fim antes do início), `RANGE_TOO_LONG` e `INVALID_DATE`.

## D-013 — estorno de comanda (migration 009)
- `POST /api/comandas/:id/estorno` (`checkout:estornar`: admin/gestor, só usuário)
  - Corpo: `{tipo:'total'|'parcial', idempotencyKey, motivoCodigo: erro_lancamento|desistencia_cliente|insatisfacao|duplicidade|outro, motivo (10–500), devolverEstoque? (total), itens?:[{comandoItemId, quantidade, devolveEstoque?}] (parcial), reembolsos?:[{formaCode, valorCentavos}] | reembolsoForma? (parcial)}`.
  - Resposta: 201 (novo) ou 200 (repetição idempotente) com `{estornoId, tipo, data, itensCentavos, comissaoCentavos, receitaEmpresaCentavos, gorjeta*, reembolsoCentavos, reembolsos, statusComanda}`.
  - 403 `INSUFFICIENT_ROLE` | `USER_PRINCIPAL_REQUIRED` | `ESTORNO_FORBIDDEN`.
  - 404 `COMANDA_NOT_FOUND`.
  - 409 `ESTORNO_EXCEDE` | `ESTORNO_JA_TOTAL` | `IDEMPOTENCY_MISMATCH`.
  - 422 `IDEMPOTENCY_KEY_REQUIRED` | `ESTORNO_PAYLOAD_INVALIDO` | `ESTORNO_PRAZO_EXPIRADO` (> 30 dias) | `ESTORNO_DATA_INVALIDA` | `ESTORNO_ITEM_INVALIDO` | `ESTORNO_ITENS_OBRIGATORIOS` | `ESTORNO_FORMA_OBRIGATORIA` | `ESTORNO_REEMBOLSO_DIVERGENTE` | `FORBIDDEN_FIELD`.
- `GET /api/comandas/:id/estornos` e `GET /api/comandas?data=` (lista do dia com saldo estornável): RBAC `comanda:historico`.
- Campos novos:
  - `/caixa/fechamento`: `estornos{quantidadeMovimentos, valorCentavos, porForma}` e `saldoDoDiaCentavos`;
  - `/financeiro/resumo`: `estornos` e `totals.comandasValidas`;
  - `/insights/margin` e `/relatorios/cota-parte`: `estornos` (descontados na data do estorno).
  - `/insights/margin`, `ticketMedioCentavos` (D-071): mesma regra do Desempenho do salão (valor líquido dos itens, sem gorjeta; vendas do período e os estornos delas). Sem comandas válidas retorna `null`. Com uma comanda válida de valor zero retorna `0`.

## D-014 — histórico da agenda e agendamento online
- **`GET /api/agenda/:id/historico`** (`agenda:read`; profissional só vê os próprios)
  - 200 `{agendamentoId, statusAtual, eventos:[{id, tipo:'criado'|'status'|'reagendado'|'duracao', quando, de, para, origem, ator:{tipo, nome|null}, reagendadoPara?, reagendadoDe?}]}`.
  - Sem e-mail e sem `actor_id`.
  - A trilha é best-effort e começa nesta versão.
- **`GET /api/relatorios/piloto`, campo `confirmacaoPrevia`:** ganha `escopo` (`periodo_eventos` | `foto_do_dia`), `semTrilha`, `canceladosAntes` e `fotoDoDia`.
- **Agendamento online (público, sem login)**
  - Fica desligado sem `PUBLIC_BOOKING_LINKS` (JSON `{"slug":"<uuid>"}`); desligado, tudo responde 404.
  - Respostas com `Cache-Control: no-store` e erros sem `details`.
  - `GET /api/public/agendar/:slug` devolve catálogo, serviços com preço e o primeiro nome dos profissionais, e as regras de antecedência e janela.
  - `GET /api/public/agendar/:slug/slots?servicoId&profissionalId&data` devolve `{data, duracaoMin, slots, ofertas}`; cada oferta (D-068) tem `{horario, fim, profissional, duracaoMin, precoCentavos|null, cancelamentoPrazoMin, versaoOferta}`.
    - grade (D-069): em cada janela livre do profissional, do início da janela em passos da duração efetiva do serviço; o encaixe no fim só entra se cair na grade. Vale também para `POST /api/public/meu-agendamento/horarios` e `/remarcar`. Desde a D-079, `GET /api/agenda/slots` (recepção e profissional) usa a mesma grade.
  - `POST /api/public/agendar/:slug`:
    - corpo `{servicoId, profissionalId, data, horario, nome, whatsapp, consentimento:true, website:"", versaoOferta?}`, com até 10 KB e só esses campos; `versaoOferta` (opcional, hex de 64) é a da oferta revisada;
    - sucesso: 201 `{cancelamentoPrazoMin, data, horario, servico, profissional, link, calendario}`;
    - erros: 422 `DADOS_INVALIDOS` | `NOME_INVALIDO` | `WHATSAPP_INVALIDO` | `CONSENTIMENTO_OBRIGATORIO` | `INDISPONIVEL` | `HORARIO_INDISPONIVEL` | `AGENDAMENTO_ONLINE_INDISPONIVEL`; 409 `HORARIO_OCUPADO` | `OFERTA_ALTERADA` (versão não bate; nada gravado); 429 `MUITAS_TENTATIVAS`.

## D-012 — presença, checkout, caixa e piloto
- Corpo JSON máximo: 100 KB; acima disso, 413.
- **Agenda**:
  - `PATCH /api/agenda/:id/status` aceita também `aguardando` (cliente chegou) e `em_atendimento` (na cadeira);
  - transições permitidas (destino ← origens):
    - `confirmado ← agendado`;
    - `aguardando ← agendado|confirmado`;
    - `em_atendimento ← agendado|confirmado|aguardando`;
    - `no_show ← agendado|confirmado`;
    - `cancelado`/`reagendado ← agendado|confirmado|aguardando`;
    - `concluido ← agendado|confirmado|aguardando|em_atendimento`;
  - qualquer outra → 409 `INVALID_STATUS_TRANSITION` com `details.permitidoDe`.
- **Checkout** (`/checkout/preview` e `/checkout/close`):
  - `descontoCentavos` e `gorjetaCentavos` inteiros ≥ 0 → senão 422 `INVALID_FIELD`;
  - desconto > total dos itens → 422 `INVALID_DISCOUNT`;
  - `/checkout/close` ignora `data`/`hora` do cliente: usa agora no `APP_TIMEZONE`.
- **`GET /api/caixa/fechamento[?data=YYYY-MM-DD][&contadoDinheiroCentavos=N][&fundoTrocoCentavos=N]`**
  - RBAC `caixa:conferir`. Só leitura: calcula o dia na hora. Traz também `persistido` (há fechamento salvo), `ultimoFechamento` (com `desatualizado` se houve movimento depois dele) e `quantidadeFechamentos`. Salvar o fechamento é `POST /api/caixa/fechamentos` (`caixa:fechar`); sangria, suprimento e ajustes são `POST /api/caixa/ajustes` (`caixa:movimentar`) — migration 010 (D-017).
  - Devolve:
    - `quantidadeComandas`, `totalBrutoCentavos` (inclui gorjeta), `taxaTotalCentavos`, `liquidoEsperadoCentavos`;
    - `gorjetas {brutaCentavos, liquidaCentavos}`;
    - `porForma[] {formaCode, label?, quantidadePagamentos, valorCentavos, taxaCentavos, liquidoEsperadoCentavos, diasRecebimento?, dataRecebimentoPrevista?}`;
    - `dinheiro {esperadoCentavos, contadoCentavos?, diferencaCentavos?}` (negativo = falta);
    - `ledger {caixaMovimentosCentavos, consistente, divergencias[]}`.
  - Erros: 422 `INVALID_DATE`/`INVALID_FIELD`.
- **Metas e ranking** (D-019, migration 011)
  - `GET /api/metas?mes=YYYY-MM` — RBAC `metas:ver` (admin, gestor; profissional só as próprias). Devolve `{mes, metas:[{id, profissionalId, nome, tipo:'faturamento'|'atendimentos'|'produtos', alvo, realizado, percentual, atingida}]}`. `percentual` é truncado. `produtos` = venda de produtos pelo profissional (D-020).
  - `PUT /api/metas` — RBAC `metas:definir` (admin, gestor; só usuário). Corpo `{profissionalId, mes, tipo, valorAlvo}`; `valorAlvo` em centavos para faturamento; `null` ou `0` remove. 201 ao criar, 200 ao alterar ou remover. 404 `PROFESSIONAL_NOT_FOUND`; 422 `INVALID_MONTH`/`INVALID_FIELD`/`FORBIDDEN_FIELD`.
  - `GET /api/gamificacao/ranking?mes=YYYY-MM[&criterio=servicos|produtos|total]` — RBAC `ranking:ver`. Gestão: `{mes, criterio, visivelEquipe, ranking:[{posicao, profissionalId, nome, atendimentos, percentualDoLider, valorCentavos, faturamentoCentavos, produtosCentavos, totalCentavos, ticketMedioCentavos}]}`. `valorCentavos` é o do critério; critério inválido → 422. Profissional: se o salão não ligou, 200 com `visivelEquipe:false` e `ranking:[]`; ligado, recebe `voce` em cada linha e os valores em reais só na própria.
  - `PATCH /api/empresa` aceita `rankingVisivelEquipe` (só `true` liga).
- **Aviso de privacidade** (D-018)
  - `GET /api/me` (usuário) ganha `privacidade:{versaoAtual, versaoAceita, aceitoEm, pendente}`.
  - `POST /api/auth/privacidade/aceite` — Bearer de usuário; corpo `{versao}`. Só a versão vigente (`PRIVACY_NOTICE_VERSION`): outra → 422 `PRIVACY_VERSION_MISMATCH` (`details.versaoAtual`). Token legado ou ausente → 401; conta desativada → 403; provedor sem suporte → 503 `PRIVACY_NOT_SUPPORTED`.
- **Pagamento de comissão** (D-017, migration 010)
  - `GET /api/comissoes/pagamentos[?profissionalId]` — RBAC `ganhos:ver` (profissional: só o próprio). Devolve `{profissionalId, nome, ganhoCentavos, pagamentosCentavos, valesCentavos, estornadoCentavos, recebidoCentavos, saldoCentavos, lancamentos:[{id, tipo, valorCentavos, data, referenciaMes, observacao, estornaId, estornado}]}`.
  - `POST /api/comissoes/pagamentos` — RBAC `comissoes:pagar` (admin, gestor; só usuário). Corpo `{profissionalId, tipo:'pagamento'|'vale', valorCentavos, referenciaMes?, observacao?, idempotencyKey}`. 201; repetição idêntica → 200 `idempotente:true`; mesma chave com outro pedido → 409 `IDEMPOTENCY_MISMATCH`; pagamento acima do saldo → 422 `PAYMENT_EXCEEDS_BALANCE` (`details.saldoCentavos`).
  - `POST /api/comissoes/pagamentos/:id/estorno` — corpo `{observacao (3–500), idempotencyKey}`. 404 `PAYMENT_NOT_FOUND`, 409 `ALREADY_REVERSED`, 422 `INVALID_REVERSAL`.
- **Caixa com gravação** (D-017, migration 010)
  - `GET /api/caixa/fechamento[?data&contadoDinheiroCentavos&fundoTrocoCentavos]` ganha `fundoTrocoCentavos`, `ajustes:{sangriasCentavos, suprimentosCentavos, itens}`, `dinheiro.vendasCentavos`, `persistido`, `quantidadeFechamentos` e `ultimoFechamento:{..., desatualizado}`. `dinheiro.esperadoCentavos` = fundo + vendas − estornos + suprimentos − sangrias.
  - `POST /api/caixa/ajustes` — RBAC `caixa:movimentar` (admin, gestor, recepção; só usuário). Corpo `{tipo:'sangria'|'suprimento', valorCentavos, motivo (3–300), idempotencyKey}`. Sempre no dia corrente.
  - `POST /api/caixa/fechamentos` — corpo `{data?, contadoDinheiroCentavos, fundoTrocoCentavos?, observacao?, idempotencyKey}`. O esperado é calculado pelo servidor; campo desconhecido → 422. Dia futuro → 422 `INVALID_DATE`.
  - Em todas as escritas: `empresa_id`/`actor_id` no corpo → 422 `FORBIDDEN_FIELD`; token legado e integração → 403 `USER_PRINCIPAL_REQUIRED`.
- **`GET /api/relatorios/meus-ganhos?mes=YYYY-MM[&profissionalId]`** (D-016)
  - RBAC `ganhos:ver`: admin, gestor e profissional. Profissional: escopo próprio, `profissionalId` da query é ignorado. Gestão: `profissionalId` obrigatório (422 `PROFESSIONAL_REQUIRED`); de outra empresa ou inexistente → 404 `PROFESSIONAL_NOT_FOUND`.
  - Devolve `{mes, profissionalId, nome, atendimentos, valorServicosCentavos, comissaoCentavos, gorjetaLiquidaCentavos, estornos:{quantidade, comissaoCentavos, gorjetaCentavos}, totalCentavos, porDia:[{data, atendimentos, comissaoCentavos, gorjetaCentavos}]}`.
  - Estorno entra no mês do estorno. Só leitura: não há registro de pagamento de comissão.
- **`GET /api/relatorios/servicos-prestados?mes=YYYY-MM`** (D-016)
  - RBAC `painel:financeiro`. Devolve `{mes, linhas:[{data, lancamento:'venda'|'estorno', comandaId, tipo, descricao, profissional, quantidade, valorCentavos, cotaParteProfissionalCentavos, cotaParteSalaoCentavos}], totais}`. Estornos são linhas negativas. Sem dado de cliente.
- **`X-Request-Id`** (D-016): cabeçalho em toda resposta; em erro 5xx também em `error.requestId`.
- **`GET /api/relatorios/piloto[?de&ate]`**
  - RBAC `painel:financeiro`. Padrão: últimos 30 dias; máximo 366 (422 `INVALID_DATE`/`INVALID_PERIOD`).
  - KPIs `{numerador, denominador, taxa|null, referencia}`:
    - `taxaFalta` = no_show / (atendidos + no_show + cancelado tardio);
    - `reagendamentoCheckout` = atendimento com agendamento futuro criado até o dia seguinte;
    - `retornoClienteNovo` = 1º atendimento no período que voltou em até 60 dias, só coortes maduras;
    - `confirmacaoPrevia` = foto do dia: confirmados / (agendados + confirmados) de hoje;
    - `porProfissional[]` com falta e reagendamento.
  - Sem bônus.

## Cockpit do gestor (D-064)
`GET /api/cockpit` (`painel:financeiro`): `{ mes, hoje, saude: 'ok'|'ok_com_pontos'|'atencao', faturamento{realizadoCentavos, metaCentavos|null, metaPct|null, projecaoCentavos|null, projecaoNota, mesmoPeriodoAnteriorCentavos, variacaoPct|null, comandas}, margem{margemCentavos, margemPct|null, taxasCentavos, taxasPctDoRecebido|null, taxasPctAnterior|null}, ocupacao{janela, ocupacaoPct|null, minutosVendidos, minutosDisponiveis, minutosOciosos, porDia[{dow, nome, aberto, ocupacaoPct|null, tardePct|null, minutosOciosos}]}, ocupacaoMes{de, ate, ...indicadores de ocupação realizada} (D-071, campos abaixo), recorrencia{ativos, mrrCentavos, atrasados, valorEmAbertoCentavos, canceladasNoMes, churnPct|null, pctDaReceita|null}, alertas[{id, nivel:'alta'|'media'|'info', titulo, porque, impactoCentavos|null, acao{rotulo, destino:'agenda'|'assinaturas'|'escalas'|'regras'|'financeiro', dow?, profissionalId?}, clientes?}], equipe[{profissionalId, nome, ocupacaoRealizadaPct|null, minutosRealizados, minutosDisponiveis, ocupacaoPct|null, metaPct|null, naEspera}], simulador{avulsosFrequentes, planoMaisBaratoMensalCentavos|null, minutosOciosos28d, minutosFalta30d, receitaPorMinutoCentavos|null} }`. Só leitura; nada é gravado.

Com `GET /api/dashboard?visao=painel`, a gestão recebe apenas `paymentsByMethod` e `finance.repassesPorProfissional`. Os dois agregados incluem os ajustes de estornos e gorjetas do modelo financeiro. A chamada sem o parâmetro continua disponível para clientes anteriores. O formato operacional da recepção segue `{kpis:{realizadosPct}}` nos dois casos.

## Desempenho do salão (D-070)

`GET /api/cockpit/desempenho?inicio=YYYY-MM-DD&fim=YYYY-MM-DD` exige `painel:financeiro`. As duas datas são inclusivas. Por padrão, o fim é hoje no fuso configurado do salão, e o início é o primeiro dia do mês do fim. Intervalos invertidos, futuros ou acima de 366 dias recebem 422.

O objeto `data` contém `inicio`, `fim`, `faturamentoCentavos`, `comandas`, `ticketMedioCentavos`, `visitasIdentificadas`, `atendimentosSemCliente`, `produtosUnidades`, `minutosOcupados`, `minutosDisponiveis`, os indicadores de ocupação realizada descritos abaixo, `estornosVendasAnterioresCentavos` (D-071: estornos de vendas de outros períodos, fora do ticket), `clientesIdentificados`, `clientesFieis`, `parteSalaoServicosCentavos`, `parteSalaoServicosPorHoraCentavos` e `resultadoFinanceiro`. O ticket e a parte por hora retornam `null` quando o denominador é zero. A capacidade usa a escala disponível para consulta e os status do motor de ocupação. Não há fotografia imutável da escala histórica.

No Desempenho (D-072), `mes=atual` cobre o dia 1 até hoje, e `mes=anterior` cobre o mês anterior completo. Em ambos, o backend responde `periodoPredefinido` e resolve a janela no fuso configurado a cada chamada. Envie `inicio` e `fim` em consulta sem preset para usar datas explícitas. Cada seleção usa uma leitura, reutilizada pela tabela e pelo gráfico de composição.

No Cockpit, cada linha de `ocupacao.porDia` expõe também `preenchimentoGradePct` realizado e os minutos de diagnóstico do período. A chave anterior `ocupacaoPct` continua representando o preenchimento da grade de compromissos.

Em `GET /api/insights/retention`, `painel:operacional` dá acesso aos dados operacionais. Segmentação, candidatos de assinatura e prioridade econômica exigem `painel:financeiro`. A projeção de WhatsApp exige a permissão específica de contato. O backend deriva o escopo da sessão.

### Indicadores de ocupação (D-071)

O Cockpit (`ocupacaoMes`) e o Desempenho retornam os mesmos indicadores para as mesmas datas. A capacidade soma a disponibilidade de cada profissional. Um profissional escalado sem atendimento participa do denominador. Um profissional hoje inativo com execução registrada entra nos dias com evidência de trabalho.

| Campo | Significado e unidade |
|---|---|
| `ocupacaoRealizadaPct` | 100 × `minutosRealizados` / `minutosDisponiveis`. Inclui serviços simultâneos, fora da escala e com duração registrada sem hora de início. Pode superar 100%. |
| `preenchimentoGradePct` | 100 × `minutosPreenchidos` / `minutosDisponiveis`. Usa a união dos intervalos executados dentro da escala do executor. |
| `minutosSobrepostos` | Minutos de relógio em que o mesmo profissional teve duas ou mais execuções, dentro ou fora da escala. |
| `minutosForaDaEscala` | Minutos de relógio executados antes ou após o expediente, em dia sem expediente ou durante pausas e bloqueios. O detalhamento usa `minutosAntesExpediente`, `minutosAposExpediente`, `minutosSemExpediente` e `minutosEmPausasBloqueios`. |
| `minutosSemHorario`, `minutosDuracaoPrevista` | Serviços com duração cuja posição na grade é desconhecida e minutos atribuídos pela duração prevista da agenda. |
| `servicosSemDuracao`, `pendenciasVinculo`, `coberturaParcial`, `capacidadeHistoricaEstimada` | Contagens de registros incompletos e indicadores de qualidade. A escala passada é reconstruída com os dados cadastrais consultáveis. |

Os dois percentuais retornam `null` com capacidade zero. Com escala e nenhuma execução retornam zero. Os campos legados `minutosOcupados` e `ocupacaoPct` nesses dois objetos representam os minutos preenchidos e o percentual preenchido. O gráfico de quatro semanas e a equipe acrescentam `ocupacaoRealizadaPct` ao percentual legado da grade de compromissos. O intervalo de quatro semanas termina na véspera.

Em `GET /api/insights/occupancy` (`painel:operacional`), `realizada` contém a parte do período até hoje; `rangePrevisto`, `minutosPrevistos`, `minutosDisponiveisPrevistos` e `ocupacaoPrevistaPct` descrevem a parte futura. No dia atual, a previsão usa o horário local da consulta. `loadFactorPct` continua disponível para a PWA anterior. A rota devolve agregados de agenda e produção sem valores financeiros, dados de cliente ou recibos.

A composição contém `faturamentoCentavos`, `comissoesCentavos`, `taxasItensCentavos`, `custoProdutosVendidosCentavos`, `parteSalaoCentavos`, `diferencaConciliacaoCentavos`, `taxaGorjetaEstornadaCentavos` e `outraDiferencaCentavos` (D-071). O ticket usa a coorte: vendas do período e os estornos delas. As vendas excluem gorjetas. Estornos entram na sua própria data. Taxas sobre vendas e custos de produtos são os valores lançados nas vendas, conforme o fechamento original. Diferenças ficam explícitas.

## Painel (D-065)
`GET /api/dashboard`: `{ kpis{servicosLiquidosCentavos, produtosLiquidosCentavos, itensLiquidosCentavos, receitaEmpresaCentavos, realizadosPct|null, ticketMedioCentavos, comandos}, paymentsByMethod, finance }`. **Removidos:** `scoreHope`, `top3Actions` e `kpis.ocupacaoPct` (renomeado para `realizadosPct`). **D-071:** sem `painel:financeiro` (recepção), a resposta é só `{ kpis{realizadosPct|null} }`; receita, comissões, pagamentos por forma e repasses ficam com quem tem `painel:financeiro`. `/insights/piloto`: `referencia.media` e `referencia.topo` sempre `null`.
