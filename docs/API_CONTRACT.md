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
