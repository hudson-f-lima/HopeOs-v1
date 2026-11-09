# Estorno de comanda — proposta (DRAFT)

**Status:** proposta para decisão. Nada aqui foi implementado ou executado. A migration 009 **não** está autorizada (CLAUDE.md; D-009).
**Origem:** lacuna 3 de `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md` ("erro de caixa hoje não tem correção auditável").
**Convenção:** **Fato** traz arquivo:linha. **Inferência** é conclusão a partir dos fatos. **Hipótese** precisa de validação.

## 1. Fatos do código atual
| # | Fato | Evidência |
|---|---|---|
| F1 | A comanda é gravada de uma vez pela RPC `checkout_close`, que insere em `comandos`, `comando_itens`, `comando_pagamentos`, `caixa_movimentos`, `comando_gorjetas` e baixa estoque em `produto_estoque_movimentos` (`tipo='venda'`) | `003_lock_rpc_permissions.sql:66-268` |
| F2 | Não existe rota, RPC ou tela de cancelamento/estorno | `backend/src/routes/index.js:515-556` (só preview e close) |
| F3 | `comando_itens` não aceita valor negativo: `quantidade > 0`, `preco_unitario >= 0`, `comissao_centavos >= 0` | `001_init.sql:160,162,174` |
| F4 | `produto_estoque_movimentos.tipo` só aceita `entrada/venda/ajuste/perda`, com `quantidade > 0` | `001_init.sql:189-190` |
| F5 | `caixa_movimentos.tipo` é texto livre e `valor_centavos` não tem `check` | `001_init.sql:226-235` |
| F6 | **A imutabilidade do ledger é por convenção, não por trigger.** O único trigger de imutabilidade protege a *autoria* (`actor_id`) de `comandos` e de movimentos de estoque. `service_role` tem `update/delete` em todas as tabelas | `007:231-255`, `007:414` |
| F7 | `comandos.status` é texto livre, default `fechado`, sem `check` | `001_init.sql:142` |
| F8 | A comanda **não guarda `agendamento_id`**. O vínculo é só um `update` de status do agendamento para `concluido`, feito depois da RPC e sem falhar a resposta | `SupabaseRepository.js:234-259`, `routes/index.js:533-552` |
| F9 | `concluido`, `fechado` e `reagendado` são estados finais da agenda (409) | `backend/src/validators/agenda.validator.js:8-14` |
| F10 | Todos os relatórios somam `comandos`/`comando_itens`/`comando_gorjetas` sem filtro de status: financeiro, insights, cota-parte | `FinanceReadModel.js:41-59`, `InsightsService.js:78-96`, `insights/cotaParte.js:5-26` |
| F11 | O principal legado (`API_ACCESS_TOKEN`) passa em toda ação RBAC, exceto as `userOnly` | `backend/src/auth/rbac.js:36-38` |
| F12 | Escrita humana sem `actor_id` falha antes do banco | `backend/src/middleware/auth.js:183-191` |
| F13 | Merge na `main` aplica `supabase/migrations/` em produção; migration nova precisa de linha no `migrations.lock` com o D-xxx | `supabase/migrations.lock:1-5`, D-010 |

**Inferências:**
- Por F3, o estorno **não** cabe como linhas negativas nas tabelas atuais. Afrouxar esses `check` contaminaria todas as somas de F10. O estorno precisa de tabelas próprias.
- Por F10, gravar o estorno sem mudar os read models faz os relatórios **superestimarem** receita, comissão e cota-parte.
- Por F6, um `update` acidental no backend hoje passaria. A 009 é a oportunidade de transformar a convenção em garantia.

## 2. Modelo proposto: lançamentos inversos
Princípio: **nada é alterado ou apagado.** O estorno é um evento novo, com linhas positivas que significam "valor revertido". O efeito líquido de uma comanda é sempre `original − Σ estornos`.

### 2.1 Entidades novas (migration 009)
- `comanda_estornos`: o evento. Campos: `empresa_id`, `comando_id`, `tipo` (`total`|`parcial`), `motivo_codigo` (`erro_lancamento`, `desistencia_cliente`, `insatisfacao`, `duplicidade`, `outro`), `motivo` (texto obrigatório, 10–500 caracteres), `data` (dia do estorno no fuso da empresa), `idempotency_key` (obrigatória), `actor_id` (**not null**), `agendamento_id` (opcional e informativo; ver F8) e os totais revertidos (itens, comissão, gorjeta, receita do salão, reembolso).
- `comanda_estorno_itens`: por item original, `comando_item_id`, `quantidade` estornada, valores revertidos (líquido, comissão, receita do salão, custo) e `devolve_estoque`.
- `comanda_estorno_pagamentos`: reembolso por forma (`forma_code`, `valor_centavos`).
- `comanda_estorno_gorjetas`: gorjeta revertida por profissional.
- `caixa_movimentos`: sem mudança de schema. Ganha linhas `tipo='estorno_pagamento'` com `valor_centavos` **negativo** e `data` = dia do estorno (F5).
- `produto_estoque_movimentos`: novo `tipo='devolucao'`. Exige trocar o `check` de F4 por um novo `check` na 009. **Alternativa sem mexer no `check`:** usar `tipo='entrada'` com `comando_id` preenchido. Seria mais barato, mas misturaria devolução com compra de mercadoria. Não recomendo.

### 2.2 Total e parcial
- **Total:** reverte todos os itens pelo saldo ainda não estornado, todas as gorjetas e reembolsa tudo o que ainda não foi reembolsado. Não depende do cliente informar valores: a RPC calcula a partir do ledger.
- **Parcial:** o cliente informa `{comandoItemId, quantidade}` e os reembolsos por forma. A granularidade é **item × quantidade**; estorno de "valor livre" (desconto depois da venda) fica fora. Os valores revertidos são proporcionais ao item original (`valor_liquido`, `comissao`, `receita_empresa`, `custo`). Para não perder centavos, o último estorno do item leva o resto exato. O backend já tem `allocateProportional` em `backend/src/engines/allocation.js:28`.
- **Invariantes** (checadas na RPC, sob lock):
  - Σ quantidade estornada ≤ quantidade original, por item.
  - Σ reembolso ≤ `total_recebido_centavos − reembolsos anteriores`, por comanda.
  - Σ reembolso por forma ≤ o pago naquela forma.
  - Estorno total de comanda já 100% estornada → `409 ESTORNO_JA_TOTAL`.
- **Status:** não há `update` em `comandos.status` (F7). O status efetivo (`fechado`, `estornado_parcial`, `estornado`) é **derivado** das somas, como o progresso do onboarding em D-008.

### 2.3 Autoria, idempotência e RBAC
- **Autoria:** `actor_id` obrigatório. Só o principal `user` estorna; integração e legado não estornam. A RPC chama `app_set_autoria` (membership ativa, `007:193-217`) e, como defesa extra, confere no banco se o papel é `admin` ou `gestor`.
- **Idempotência:** `unique (empresa_id, idempotency_key)`. A mesma chave devolve o estorno existente com `idempotent: true`, como faz `checkout_close` (`003:44-64`). A mesma chave com um payload diferente → `409 IDEMPOTENCY_MISMATCH`, comparando um hash do payload guardado no evento.
- **RBAC:** nova ação `checkout:estornar` com `{ roles: GESTAO, userOnly: true }` em `rbac.js`. O `userOnly` é obrigatório: sem ele, o token legado estornaria sem autoria (F11). Recepção e profissional recebem 403.
- **Corpo:** campos de autoria no body continuam proibidos (`422 FORBIDDEN_FIELD`, `docs/API_CONTRACT.md:103`).
- **Rota proposta:** `POST /api/checkout/:comandoId/estorno` com `{ tipo, motivoCodigo, motivo, idempotencyKey, itens?, reembolsos? }`. `empresa_id` vem só de `req.auth` (ADR-005 §6).

## 3. Efeitos colaterais
| Área | Proposta | Classe hoje |
|---|---|---|
| Estoque | Item de produto com `controla_estoque=true` e `devolve_estoque=true` gera `devolucao` com `saldo_anterior/posterior` sob `for update` do produto, como na venda (`003:179-212`). Produto danificado → `devolve_estoque=false` (sem movimento). Produto inativo: devolve mesmo assim | AUSENTE |
| Comissão | Revertida proporcionalmente em `comanda_estorno_itens.comissao_centavos`. Como ainda não existe pagamento de comissão (lacuna 6 da auditoria), basta o relatório descontar. **Quando** descontar é decisão (§7 Q3) | AUSENTE |
| Gorjeta | No total, reverte toda a gorjeta. No parcial, a gorjeta **fica**, salvo pedido explícito (`reverterGorjeta: true`). A gorjeta é do profissional, não do item | AUSENTE |
| Taxa da maquininha | Registrar o reembolso bruto. A taxa devolvida ou retida pela adquirente é **hipótese**: depende do contrato. Proposta V1: a taxa original não volta, e a perda fica com o salão | DESCONHECIDO |
| Caixa do dia | `estorno_pagamento` negativo na **data do estorno**. O caixa do dia original não muda. Hoje não existe fechamento de caixa (lacuna 5), então ainda não existe "dia fechado" para proteger | PARCIAL |
| Agendamento | **Não muda.** `concluido` continua final (F9). O atendimento aconteceu, e o estorno é financeiro. Se o motivo for `erro_lancamento` de cliente que não veio, isso fica registrado no estorno, e a correção da agenda é decisão (§7 Q5). Sem `agendamento_id` na comanda (F8), o vínculo só existe se o operador informar | — |
| Relatórios (F10) | `FinanceReadModel`, `InsightsService` (margem, cashflow, attach), `cotaParte`, Dashboard (ticket médio) e Retention (visita) passam a subtrair os estornos. Gate obrigatório: relatório depois de estorno total = relatório sem a comanda | CRÍTICO se o estorno entrar sem isso |
| Cota-parte | `computeCotaParte` subtrai `comissao`/`receita_empresa` estornadas no mês **do estorno** (recomendado) ou no mês da comanda (§7 Q3) | AUSENTE |
| Retenção/régua | Comanda 100% estornada com motivo `erro_lancamento`/`duplicidade` não conta como visita. As demais contam (o cliente veio) | Inferência |

## 4. DRAFT da migration 009
```sql
-- DRAFT ONLY — não executar. Não copiar para supabase/migrations/ sem D-xxx e linha no migrations.lock.
begin;
create table if not exists comanda_estornos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  comando_id uuid not null references comandos(id) on delete restrict,
  tipo text not null check (tipo in ('total','parcial')),
  motivo_codigo text not null check (motivo_codigo in ('erro_lancamento','desistencia_cliente','insatisfacao','duplicidade','outro')),
  motivo text not null check (char_length(btrim(motivo)) between 10 and 500),
  data date not null,
  idempotency_key text not null,
  payload_hash text not null,
  agendamento_id uuid null references agendamentos(id) on delete set null,
  itens_centavos int not null default 0 check (itens_centavos >= 0),
  comissao_centavos int not null default 0 check (comissao_centavos >= 0),
  receita_empresa_centavos int not null default 0,
  gorjeta_liquida_centavos int not null default 0 check (gorjeta_liquida_centavos >= 0),
  reembolso_centavos int not null default 0 check (reembolso_centavos >= 0),
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  unique (empresa_id, idempotency_key)
);
create index if not exists ix_estornos_comando on comanda_estornos (empresa_id, comando_id);
create index if not exists ix_estornos_data on comanda_estornos (empresa_id, data);
create table if not exists comanda_estorno_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  estorno_id uuid not null references comanda_estornos(id) on delete restrict,
  comando_item_id uuid not null references comando_itens(id) on delete restrict,
  quantidade int not null check (quantidade > 0),
  valor_liquido_centavos int not null check (valor_liquido_centavos >= 0),
  comissao_centavos int not null check (comissao_centavos >= 0),
  receita_empresa_centavos int not null,
  custo_centavos int not null default 0 check (custo_centavos >= 0),
  devolve_estoque boolean not null default true
);
create table if not exists comanda_estorno_pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  estorno_id uuid not null references comanda_estornos(id) on delete restrict,
  forma_code text not null,
  valor_centavos int not null check (valor_centavos > 0)
);
create table if not exists comanda_estorno_gorjetas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  estorno_id uuid not null references comanda_estornos(id) on delete restrict,
  profissional_id uuid null references profissionais(id),
  valor_liquido_centavos int not null check (valor_liquido_centavos >= 0)
);
-- Estoque: novo tipo 'devolucao' (substitui o check de 001_init.sql:189 sem editar a 001).
alter table produto_estoque_movimentos drop constraint if exists produto_estoque_movimentos_tipo_check;
alter table produto_estoque_movimentos add constraint produto_estoque_movimentos_tipo_check
  check (tipo in ('entrada','venda','ajuste','perda','devolucao'));
-- Imutabilidade real (F6) nas tabelas de estorno; opcional nas tabelas de 001 (ver §7 Q6).
create or replace function public.ledger_imutavel() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'ledger imutável: % em %', tg_op, tg_table_name using errcode = 'P0001'; end; $$;
-- create trigger trg_<t>_imutavel before update or delete on <t> for each row execute function public.ledger_imutavel();
-- para cada t em comanda_estornos, comanda_estorno_itens, comanda_estorno_pagamentos, comanda_estorno_gorjetas

create or replace function public.comanda_estornar(
  p_empresa_id uuid, p_comando_id uuid, p_payload jsonb, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing comanda_estornos%rowtype; v_key text := nullif(p_payload->>'idempotencyKey','');
begin
  if p_empresa_id is null or p_comando_id is null or p_actor_id is null or v_key is null then
    raise exception 'empresa, comanda, ator e idempotencyKey obrigatorios' using errcode = 'P0001';
  end if;
  perform public.app_set_autoria(p_actor_id, null, p_empresa_id);           -- membership ativa
  if not exists (select 1 from empresa_memberships where user_id = p_actor_id and empresa_id = p_empresa_id
                 and status = 'ativo' and role in ('admin','gestor')) then
    raise exception 'ESTORNO_FORBIDDEN' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('estorno:' || p_empresa_id || ':' || p_comando_id, 0));
  select * into v_existing from comanda_estornos where empresa_id = p_empresa_id and idempotency_key = v_key;
  if found then
    if v_existing.payload_hash <> md5(p_payload::text) then raise exception 'IDEMPOTENCY_MISMATCH' using errcode = 'HS409'; end if;
    return jsonb_build_object('idempotent', true, 'estornoId', v_existing.id);
  end if;
  perform 1 from comandos where id = p_comando_id and empresa_id = p_empresa_id;
  if not found then raise exception 'COMANDA_NOT_FOUND' using errcode = 'P0001'; end if;
  -- 1. saldo estornável por item = comando_itens.quantidade − Σ comanda_estorno_itens.quantidade
  -- 2. validar itens/reembolsos do payload contra o saldo (ESTORNO_EXCEDE, HS409)
  -- 3. inserir evento, itens, pagamentos, gorjetas
  -- 4. caixa_movimentos 'estorno_pagamento' (valor negativo, data = p_payload->>'data' validada no backend)
  -- 5. estoque: select ... from produtos for update; update estoque_atual; movimento 'devolucao'
  return jsonb_build_object('idempotent', false /* , 'estornoId', ..., totais */);
end; $$;
revoke all on function public.comanda_estornar(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.comanda_estornar(uuid, uuid, jsonb, uuid) to service_role;
revoke all on function public.ledger_imutavel() from public, anon, authenticated;
-- RLS deny-all coerente com 007:408-416
do $$ declare t text; begin
  foreach t in array array['comanda_estornos','comanda_estorno_itens','comanda_estorno_pagamentos','comanda_estorno_gorjetas'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert on table public.%I to service_role', t);   -- sem update/delete
  end loop; end $$;
commit;
```
Notas do draft:
- `on delete restrict` é intencional: apagar empresa ou comanda com estorno falha. É coerente com o ledger imutável, mas é uma mudança de comportamento (§7 Q6).
- Conferir o nome real do `check` de `tipo` no banco antes de fazer o `drop`. O nome `produto_estoque_movimentos_tipo_check` é o padrão do Postgres para `check` inline (**inferência**).
- `md5(p_payload::text)` depende da ordem das chaves do JSON. Recomendação: o backend normaliza o payload e envia o hash pronto.

### Rollback DRAFT
```sql
-- DRAFT ONLY — não executar.
begin;
do $$ begin
  if exists (select 1 from comanda_estornos) then
    raise exception 'rollback 009 recusado: há estornos gravados (ledger não se apaga)';
  end if;
  if exists (select 1 from produto_estoque_movimentos where tipo = 'devolucao') then
    raise exception 'rollback 009 recusado: há devoluções de estoque';
  end if;
end $$;
drop function if exists public.comanda_estornar(uuid, uuid, jsonb, uuid);
drop table if exists comanda_estorno_gorjetas, comanda_estorno_pagamentos, comanda_estorno_itens, comanda_estornos;
drop function if exists public.ledger_imutavel();
alter table produto_estoque_movimentos drop constraint if exists produto_estoque_movimentos_tipo_check;
alter table produto_estoque_movimentos add constraint produto_estoque_movimentos_tipo_check
  check (tipo in ('entrada','venda','ajuste','perda'));
commit;
```
Com estornos já gravados, o rollback é **do backend** (desligar a rota por flag), não do banco.

## 5. Plano de gates (todos com controle negativo)
1. **`supabase/tests/gate_009.sql`** (Postgres 16 no CI, padrão de `gate_007/008`):
   - total → Σ líquido da comanda = 0; estoque volta ao saldo anterior; caixa do dia do estorno com o valor negativo;
   - parcial de 1 de 3 unidades → comissão proporcional e centavos fechando no último estorno;
   - excesso de quantidade ou de reembolso → `ESTORNO_EXCEDE`;
   - mesma chave → mesmo `estornoId`; mesma chave com outro payload → `IDEMPOTENCY_MISMATCH`;
   - ator `recepcao`, ator de outra empresa ou ator nulo → erro; comanda de outra empresa → `COMANDA_NOT_FOUND`;
   - `set role anon/authenticated; select comanda_estornar(...)` → `permission denied`;
   - `update`/`delete` em `comanda_estorno_*` → erro do trigger. **Controle negativo:** o mesmo bloco sem o trigger passa, provando que o teste detecta a falha.
2. **`supabase/tests/concurrency_estorno.sh`** (molde de `concurrency_agenda.sh`): duas sessões, **chaves diferentes**, estorno total da mesma comanda. Esperado: 1 grava e 1 recebe `ESTORNO_JA_TOTAL`, com estoque devolvido uma vez só. **Controle negativo:** cópia temporária da função sem o `pg_advisory_xact_lock` grava 2 e devolve o estoque em dobro. Um terceiro caso usa a **mesma chave** em paralelo: o resultado é 1 evento.
3. **`backend/tests/estorno-gate.test.js`** (offline, `memoryBackend`):
   - 403 para recepção, profissional, legado e integração;
   - 422 sem motivo ou com `actorId` no body;
   - 409 em excesso; 200 idempotente;
   - financeiro, cota-parte e margem depois do estorno total iguais ao cenário sem a comanda.
4. **E2E PWA:** gestor estorna pela tela da comanda e vê o valor negativo no caixa do dia; recepção não vê o botão.
5. **`test:gate` integrado** contra o Supabase real com a 009 (hoje DESCONHECIDO em PROJECT_STATE).

## 6. O que exige autorização do Platform Owner
- A migration 009 em si (D-xxx novo + linha em `supabase/migrations.lock`). O merge executa SQL em produção (F13).
- Trocar o `check` de `produto_estoque_movimentos.tipo` (novo valor `devolucao`).
- Triggers de imutabilidade nas tabelas da 001 (muda o comportamento de `delete` de empresa e de scripts de limpeza).
- Regras de negócio de §7 (prazo, competência, taxa, gorjeta).
- Estimativa: **M**. São a migration, a RPC, a rota, a mudança em 5 read models, a tela e 3 gates. A maior parte do risco está nos read models, não na RPC.

## 7. Decisões pendentes do Platform Owner
1. Autoriza a migration 009 com as 4 tabelas, o `check` de estoque e a RPC `comanda_estornar`, como desenhado aqui?
2. Quem estorna: só `admin`/`gestor` (recomendado), ou a recepção também, com aprovação do gestor?
3. Comissão e cota-parte do estorno entram no mês **do estorno** (recomendado: relatório fechado não muda) ou no mês da comanda?
4. Qual o prazo máximo para estornar (sugestão: 30 dias)? Depois disso, recusa ou exige `admin`?
5. Estorno total por `erro_lancamento` deve permitir corrigir o agendamento `concluido` (exceção controlada à regra de estado final) ou a agenda nunca muda?
6. Ativa os triggers de imutabilidade (`update`/`delete`) também em `comandos`, `comando_itens`, `comando_pagamentos`, `comando_gorjetas`, `caixa_movimentos` e `produto_estoque_movimentos`? Isso faz a exclusão de empresa com histórico falhar.
7. A taxa da maquininha no reembolso: o salão absorve a taxa original (V1 proposta) ou ela é registrada como devolvida?
8. No estorno parcial, a gorjeta fica (recomendado) ou é revertida proporcionalmente?
9. Estorno de comanda de dia anterior: permitido normalmente, com o lançamento no dia de hoje? Ou bloqueado até existir fechamento de caixa (lacuna 5)?
