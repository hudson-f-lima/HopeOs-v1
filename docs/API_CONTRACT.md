# HOPE OS V1.0.3 — API Contract

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

Ações RBAC: `cadastros:read|write`, `clientes:read|write`, `agenda:read|write`, `checkout:write`, `estoque:write`, `lista_espera:read|write`, `relatorios:operacional|full`, `admin`. Profissional tem escopo "Próprio" em agenda e checkout (`NOT_OWN_RESOURCE`).

Erros: 401 `UNAUTHENTICATED`/`LEGACY_AUTH_DISABLED`; 403 `USER_INACTIVE`, `NO_ACTIVE_MEMBERSHIP`, `EMPRESA_NOT_AUTHORIZED`, `NO_UNIT_ACCESS`, `UNIT_NOT_AUTHORIZED`, `INSUFFICIENT_ROLE`, `INSUFFICIENT_SCOPE`, `INTEGRATION_INACTIVE`, `PROFESSIONAL_LINK_REQUIRED`, `NOT_OWN_RESOURCE`, `USER_PRINCIPAL_REQUIRED`; 503 `AUTH_PROVIDER_UNAVAILABLE` (nunca vira acesso).

Campos de autoria (`created_by`, `updated_by`, `cancelled_by`, `actor_id`, `integration_id` e variações camelCase) no corpo de qualquer escrita → 422 `FORBIDDEN_FIELD`.

### Sessão
| Rota | Corpo | Resposta |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | `{ access_token, refresh_token, expires_in, expires_at, user }`; 429 após `LOGIN_RATE_LIMIT_MAX` tentativas por IP+e-mail |
| `POST /api/auth/refresh` | `{ refresh_token }` | nova sessão |
| `POST /api/auth/logout` | — (Bearer JWT) | revoga a sessão no provedor |
| `POST /api/auth/recover` | `{ email }` | sempre 200 com a mesma mensagem |
| `POST /api/auth/password` | `{ password }` (Bearer do link de convite/recuperação) | mínimo 8 caracteres |
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
| `GET /api/empresa` | `cadastros:read` | Dados e horários da empresa do usuário |
| `PATCH /api/empresa` | `cadastros:write` | `{ nome, telefone, whatsapp, endereco, cidade, horarioPorDia: {seg:{ativo,inicio,fim},…}, slotPadrao: 10|15|20|30|45|60, intervaloAlmoco, almocoInicio, almocoFim }`; outros campos → 422 `FORBIDDEN_FIELD` |
| `GET /api/onboarding/status` | `cadastros:write` | `{ fases[{id,titulo,concluida}], proximaFase, completo, resumo }` — derivado dos dados |
| `GET /api/onboarding/presets` | `cadastros:write` | Cardápios por nicho, formas de pagamento e horário padrão (sugestões editáveis) |
| `POST /api/onboarding/servicos` | `cadastros:write` | `{ itens: [{ nome, categoria, valorCentavos, duracaoMin, comissaoPct }] }` (até 50); nome repetido é ignorado |
| `POST /api/onboarding/formas` | `cadastros:write` | `{ itens: [{ code, label, taxaPct, diasRecebimento }] }`; código repetido é ignorado |

## Onda B (D-009, migration 008)
| Rota | Ação RBAC | Uso |
|---|---|---|
| `GET /api/cargos` · `POST /api/cargos` · `PATCH /api/cargos/:id` | read: `cadastros:read`; escrita: `cadastros:write` | `{ nome, comissaoPct, modeloComissao: dividido|bruto_salao|bruto_staff, ativo }`; nome repetido (sem diferenciar maiúsculas) → 409 `CARGO_EXISTS` |
| `GET /api/categorias` · `POST /api/categorias` · `PATCH /api/categorias/:id` | idem | `{ nome, comissaoPct|null, ativo }`; 409 `CATEGORIA_EXISTS` |
| `POST/PATCH /api/profissionais` | `cadastros:write` | aceita `cargoId` (da mesma empresa, senão 422 `CARGO_NOT_FOUND`) |
| `POST/PATCH /api/servicos` | `cadastros:write` | aceita `categoriaId` e `modeloHeranca: FIXED_SERVICE|BY_CATEGORY|BY_ROLE` |
| `PATCH /api/empresa` | `cadastros:write` | também `cnpj` (dígitos verificadores; máscara aceita; `null` limpa), `razaoSocial`, `salaoParceiro`, `bufferMin` (0/5/10/15), `reguaAlertaFaltas` < `reguaSinalFaltas` |
| `POST /api/onboarding/cargos` | `cadastros:write` | `{ itens: [{ nome, comissaoPct, modeloComissao }] }`, idempotente |
| `GET /api/relatorios/cota-parte?mes=YYYY-MM` | `relatorios:full` | `{ comandas, valorItensCentavos, cotaParteSalaoCentavos, cotaParteProfissionaisCentavos, profissionais[{ nome, itens, valorCentavos, cotaParteCentavos }], salaoParceiro, cnpj, razaoSocial }` |
| `GET /api/insights/clients/:id/reliability` | `relatorios:operacional` | inclui `regua: { faltasSeguidas, nivel: ok|tolerada|alerta|exigir_sinal, mensagem, limites }` — só alerta, sem cobrança |

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

## D-013 — estorno de comanda (migration 009)
- `POST /api/comandas/:id/estorno` (`checkout:estornar`: admin/gestor, só usuário)
  - Corpo: `{tipo:'total'|'parcial', idempotencyKey, motivoCodigo: erro_lancamento|desistencia_cliente|insatisfacao|duplicidade|outro, motivo (10–500), devolverEstoque? (total), itens?:[{comandoItemId, quantidade, devolveEstoque?}] (parcial), reembolsos?:[{formaCode, valorCentavos}] | reembolsoForma? (parcial)}`.
  - Resposta: 201 (novo) ou 200 (repetição idempotente) com `{estornoId, tipo, data, itensCentavos, comissaoCentavos, receitaEmpresaCentavos, gorjeta*, reembolsoCentavos, reembolsos, statusComanda}`.
  - 403 `INSUFFICIENT_ROLE` | `USER_PRINCIPAL_REQUIRED` | `ESTORNO_FORBIDDEN`.
  - 404 `COMANDA_NOT_FOUND`.
  - 409 `ESTORNO_EXCEDE` | `ESTORNO_JA_TOTAL` | `IDEMPOTENCY_MISMATCH`.
  - 422 `IDEMPOTENCY_KEY_REQUIRED` | `ESTORNO_PAYLOAD_INVALIDO` | `ESTORNO_PRAZO_EXPIRADO` (> 30 dias) | `ESTORNO_DATA_INVALIDA` | `ESTORNO_ITEM_INVALIDO` | `ESTORNO_ITENS_OBRIGATORIOS` | `ESTORNO_FORMA_OBRIGATORIA` | `ESTORNO_REEMBOLSO_DIVERGENTE` | `FORBIDDEN_FIELD`.
- `GET /api/comandas/:id/estornos` e `GET /api/comandas?data=` (lista do dia com saldo estornável): RBAC `relatorios:full`.
- Campos novos:
  - `/caixa/fechamento`: `estornos{quantidadeMovimentos, valorCentavos, porForma}` e `saldoDoDiaCentavos`;
  - `/financeiro/resumo`: `estornos` e `totals.comandasValidas`;
  - `/insights/margin` e `/relatorios/cota-parte`: `estornos` (descontados na data do estorno).

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
  - `GET /api/public/agendar/:slug/slots?servicoId&profissionalId&data` devolve `{data, duracaoMin, slots}`.
  - `POST /api/public/agendar/:slug`:
    - corpo `{servicoId, profissionalId, data, horario, nome, whatsapp, consentimento:true, website:""}`, com até 10 KB e só esses campos;
    - sucesso: 201 `{data, horario, servico, profissional}`;
    - erros: 422 `DADOS_INVALIDOS` | `NOME_INVALIDO` | `WHATSAPP_INVALIDO` | `CONSENTIMENTO_OBRIGATORIO` | `INDISPONIVEL` | `HORARIO_INDISPONIVEL` | `AGENDAMENTO_ONLINE_INDISPONIVEL`; 409 `HORARIO_OCUPADO`; 429 `MUITAS_TENTATIVAS`.

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
- **`GET /api/caixa/fechamento[?data=YYYY-MM-DD][&contadoDinheiroCentavos=N]`**
  - RBAC `relatorios:operacional`. Só leitura (`persistido: false`).
  - Devolve:
    - `quantidadeComandas`, `totalBrutoCentavos` (inclui gorjeta), `taxaTotalCentavos`, `liquidoEsperadoCentavos`;
    - `gorjetas {brutaCentavos, liquidaCentavos}`;
    - `porForma[] {formaCode, label?, quantidadePagamentos, valorCentavos, taxaCentavos, liquidoEsperadoCentavos, diasRecebimento?, dataRecebimentoPrevista?}`;
    - `dinheiro {esperadoCentavos, contadoCentavos?, diferencaCentavos?}` (negativo = falta);
    - `ledger {caixaMovimentosCentavos, consistente, divergencias[]}`.
  - Erros: 422 `INVALID_DATE`/`INVALID_FIELD`.
  - Sem troco/sangria/suprimento: não existem nas migrations 001–008.
- **Metas e ranking** (D-019, migration 011)
  - `GET /api/metas?mes=YYYY-MM` — RBAC `metas:read` (admin, gestor; profissional só as próprias). Devolve `{mes, metas:[{id, profissionalId, nome, tipo:'faturamento'|'atendimentos'|'produtos', alvo, realizado, percentual, atingida}]}`. `percentual` é truncado. `produtos` = venda de produtos pelo profissional (D-020).
  - `PUT /api/metas` — RBAC `metas:write` (admin, gestor; só usuário). Corpo `{profissionalId, mes, tipo, valorAlvo}`; `valorAlvo` em centavos para faturamento; `null` ou `0` remove. 201 ao criar, 200 ao alterar ou remover. 404 `PROFESSIONAL_NOT_FOUND`; 422 `INVALID_MONTH`/`INVALID_FIELD`/`FORBIDDEN_FIELD`.
  - `GET /api/gamificacao/ranking?mes=YYYY-MM[&criterio=servicos|produtos|total]` — RBAC `ranking:read`. Gestão: `{mes, criterio, visivelEquipe, ranking:[{posicao, profissionalId, nome, atendimentos, percentualDoLider, valorCentavos, faturamentoCentavos, produtosCentavos, totalCentavos, ticketMedioCentavos}]}`. `valorCentavos` é o do critério; critério inválido → 422. Profissional: se o salão não ligou, 200 com `visivelEquipe:false` e `ranking:[]`; ligado, recebe `voce` em cada linha e os valores em reais só na própria.
  - `PATCH /api/empresa` aceita `rankingVisivelEquipe` (só `true` liga).
- **Aviso de privacidade** (D-018)
  - `GET /api/me` (usuário) ganha `privacidade:{versaoAtual, versaoAceita, aceitoEm, pendente}`.
  - `POST /api/auth/privacidade/aceite` — Bearer de usuário; corpo `{versao}`. Só a versão vigente (`PRIVACY_NOTICE_VERSION`): outra → 422 `PRIVACY_VERSION_MISMATCH` (`details.versaoAtual`). Token legado ou ausente → 401; conta desativada → 403; provedor sem suporte → 503 `PRIVACY_NOT_SUPPORTED`.
- **Pagamento de comissão** (D-017, migration 010)
  - `GET /api/comissoes/pagamentos[?profissionalId]` — RBAC `relatorios:proprio` (profissional: só o próprio). Devolve `{profissionalId, nome, ganhoCentavos, pagamentosCentavos, valesCentavos, estornadoCentavos, recebidoCentavos, saldoCentavos, lancamentos:[{id, tipo, valorCentavos, data, referenciaMes, observacao, estornaId, estornado}]}`.
  - `POST /api/comissoes/pagamentos` — RBAC `comissoes:pagar` (admin, gestor; só usuário). Corpo `{profissionalId, tipo:'pagamento'|'vale', valorCentavos, referenciaMes?, observacao?, idempotencyKey}`. 201; repetição idêntica → 200 `idempotente:true`; mesma chave com outro pedido → 409 `IDEMPOTENCY_MISMATCH`; pagamento acima do saldo → 422 `PAYMENT_EXCEEDS_BALANCE` (`details.saldoCentavos`).
  - `POST /api/comissoes/pagamentos/:id/estorno` — corpo `{observacao (3–500), idempotencyKey}`. 404 `PAYMENT_NOT_FOUND`, 409 `ALREADY_REVERSED`, 422 `INVALID_REVERSAL`.
- **Caixa com gravação** (D-017, migration 010)
  - `GET /api/caixa/fechamento[?data&contadoDinheiroCentavos&fundoTrocoCentavos]` ganha `fundoTrocoCentavos`, `ajustes:{sangriasCentavos, suprimentosCentavos, itens}`, `dinheiro.vendasCentavos`, `persistido`, `quantidadeFechamentos` e `ultimoFechamento:{..., desatualizado}`. `dinheiro.esperadoCentavos` = fundo + vendas − estornos + suprimentos − sangrias.
  - `POST /api/caixa/ajustes` — RBAC `caixa:operar` (admin, gestor, recepção; só usuário). Corpo `{tipo:'sangria'|'suprimento', valorCentavos, motivo (3–300), idempotencyKey}`. Sempre no dia corrente.
  - `POST /api/caixa/fechamentos` — corpo `{data?, contadoDinheiroCentavos, fundoTrocoCentavos?, observacao?, idempotencyKey}`. O esperado é calculado pelo servidor; campo desconhecido → 422. Dia futuro → 422 `INVALID_DATE`.
  - Em todas as escritas: `empresa_id`/`actor_id` no corpo → 422 `FORBIDDEN_FIELD`; token legado e integração → 403 `USER_PRINCIPAL_REQUIRED`.
- **`GET /api/relatorios/meus-ganhos?mes=YYYY-MM[&profissionalId]`** (D-016)
  - RBAC `relatorios:proprio`: admin, gestor e profissional. Profissional: escopo próprio, `profissionalId` da query é ignorado. Gestão: `profissionalId` obrigatório (422 `PROFESSIONAL_REQUIRED`); de outra empresa ou inexistente → 404 `PROFESSIONAL_NOT_FOUND`.
  - Devolve `{mes, profissionalId, nome, atendimentos, valorServicosCentavos, comissaoCentavos, gorjetaLiquidaCentavos, estornos:{quantidade, comissaoCentavos, gorjetaCentavos}, totalCentavos, porDia:[{data, atendimentos, comissaoCentavos, gorjetaCentavos}]}`.
  - Estorno entra no mês do estorno. Só leitura: não há registro de pagamento de comissão.
- **`GET /api/relatorios/servicos-prestados?mes=YYYY-MM`** (D-016)
  - RBAC `relatorios:full`. Devolve `{mes, linhas:[{data, lancamento:'venda'|'estorno', comandaId, tipo, descricao, profissional, quantidade, valorCentavos, cotaParteProfissionalCentavos, cotaParteSalaoCentavos}], totais}`. Estornos são linhas negativas. Sem dado de cliente.
- **`X-Request-Id`** (D-016): cabeçalho em toda resposta; em erro 5xx também em `error.requestId`.
- **`GET /api/relatorios/piloto[?de&ate]`**
  - RBAC `relatorios:full`. Padrão: últimos 30 dias; máximo 366 (422 `INVALID_DATE`/`INVALID_PERIOD`).
  - KPIs `{numerador, denominador, taxa|null, referencia}`:
    - `taxaFalta` = no_show / (atendidos + no_show + cancelado tardio);
    - `reagendamentoCheckout` = atendimento com agendamento futuro criado até o dia seguinte;
    - `retornoClienteNovo` = 1º atendimento no período que voltou em até 60 dias, só coortes maduras;
    - `confirmacaoPrevia` = foto do dia: confirmados / (agendados + confirmados) de hoje;
    - `porProfissional[]` com falta e reagendamento.
  - Sem bônus.
