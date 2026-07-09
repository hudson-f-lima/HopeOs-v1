# KORTEXOS 5.1 — RED TEAM CORRECTION PLAN

**Arquivo:** `docs/redteam/KORTEXOS_5_1_REDTEAM_CORRECTION_PLAN.md`
**Data:** 2026-07-08
**Regra de ouro:** sem patch, delta, remendo ou documento paralelo. Correção = reescrita integral in-place. Proibido `*_REVISED.md`.
**Nota de navegação:** paths reorganizados após arquitetura documental (2026-07-08); ver `docs/INDEX.md` como fonte de navegação. Localizações citadas no §2 refletem o estado da auditoria original (registro histórico).

## 0. Status

```text
GERADO / AGUARDA RED TEAM
```

## 1. Decisão do Platform Owner

- Caminho B aprovado.
- Base real: migrations 001–006 (`supabase/migrations/`, projeto `qosioymzswhkqkziocas`, em produção).
- KortexOS 5.1 reancorado em 007+.
- Blueprint 4.0 é referência de design, não sequência física (colisão de números confirmada: 4.0 `001_shared_foundation` ≠ real `001_init`).
- `tenant_core`, multi-tenant e ledger double-entry deixam de ser premissa física; viram decisão explícita de design no Planning revisado.
- SQL executável continua bloqueado.
- V1.4 now-scope (zero migration) segue liberado.

## 2. Estado real do repositório (auditado 2026-07-08)

- **Migrations reais (6):** `001_init.sql`, `002_checkout_close_rpc.sql`, `003_lock_rpc_permissions.sql`, `004_service_role_table_grants.sql`, `005_agenda_status_reagendado.sql`, `006_produto_estoque_ajuste_rpc.sql`.
- **Docs KortexOS 5.1:** Master Briefing Rewrite, Truth Map, Migration Map, Blueprint, SQL Master Planning, SQL Master Draft, Redteam Prompt, este plano (raiz); Benchmark Map e Comparative Proposal (`docs/`).
- **Legados:** `docs/legacy/SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md`, `docs/legacy/SMART_FLOW_4_0_BLUEPRINT_UNIFICADO_CANONICO.md` (movidos e normalizados nesta higienização).
- **Divergências de nome corrigidas:** `SQL_MASTER_PLANNING(1)` → canônico; Blueprint legado `-1` → canônico. Sem duplicatas restantes.
- **Docs que ainda afirmam 046–060 como próxima faixa:** `docs/planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md`, `docs/planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md`, `docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md` (046+ bloqueado), Blueprint §8.1 ("001–045 preservadas"). Todos aguardam reescrita (§4).

## 3. Achados Red Team A01–A14

| ID | Sev | Status | Decisão | Documento impactado | Correção |
|---|---|---|---|---|---|
| A01 | P0 | CONFIRMADO | Caminho B | Truth Map, Migration Map, Blueprint, Planning, Draft | Reancorar em 001–006; nova faixa 007+; 046–060 obsoleto |
| A02 | P0 | CONFIRMADO | Reclassificar | Truth Map | Colunas `Status documental` × `Status implementado`; PARCIAL para tudo que não existe em 001–006 |
| A03 | P0 | CONFIRMADO | Ledger core primeiro | Planning, Draft | Migration de ledger double-entry antes de wallet/staff account/subscription/corporate/partner |
| A04 | P1 | CONFIRMADO | Endurecer | Draft (catálogo vendável) | Eliminar `source_table+source_id` solto: colunas por tipo + CHECK, ou trigger por `item_kind`, ou origem materializada + Command |
| A05 | P1 | CONFIRMADO | Contrato mínimo | Draft (todas as migrations) | RLS + REVOKE + GRANT técnico + append-only + `idempotency_key` + audit/outbox + rollback por migration |
| A06 | P1 | CONFIRMADO | Reintroduzir | Draft (subscription/wallet) | Obrigação de receita antecipada: recebido / obrigação / consumo / reconhecimento |
| A07 | P1 | CONFIRMADO | Despublicar aprovação | Truth Map, Migration Map, Blueprint, Planning, Draft | Vereditos auto-declarados → `GERADO / AGUARDA RED TEAM` |
| A08 | P1 | RESOLVIDO | Higienizado | `docs/legacy/` | Legados commitados, movidos e renomeados (esta rodada) |
| A09 | P2 | CONFIRMADO | Nome único | Migration Map, Blueprint, Draft | Fixar um nome RevPAH e propagar |
| A10 | P2 | CONFIRMADO | Ajustar unique | Draft 046→futura | Incluir `business_unit_id` ou justificar |
| A11 | P2 | CONFIRMADO | Reforçar | Draft (trust/corporate) | Validação de referência no score; consent/retention LGPD no corporativo |
| A12 | P2 | RESOLVIDO | Higienizado | Planning, legados | Nomes canônicos normalizados (esta rodada) |
| A13 | P3 | ACEITO | Manter | Draft | Blocos DRAFT ONLY; nunca em `.sql` |
| A14 | P3 | CONFIRMADO | Definir limiar | Draft (corporate) | K-anonimato mínimo em analytics agregado (ex.: n≥5) |

## 4. Correções obrigatórias por documento

### 4.1 Truth Map (`docs/canon/KORTEXOS_5_1_TRUTH_MAP.md`)
- Adicionar colunas `Status documental` e `Status implementado`.
- Reclassificar como PARCIAL tudo que não existe na base real 001–006 (D01 RLS multi-tenant, D11, D13 COF/PSP, D15 ledger double-entry, KortexFlow completo).
- Status do doc → `GERADO / AGUARDA RED TEAM`.

### 4.2 Migration Map (`docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md`)
- Remover premissa física 001–045. Declarar: 001–006 = real; 007+ = futuro; 001–045 legacy = referência de design; 046–060 = obsoleto até replanejamento.
- Fixar nome único RevPAH.

### 4.3 Blueprint 5.1 (`docs/architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md`)
- Remover "001–045 preservadas" como sequência física (§8.1).
- Manter D00–D31 e Gates 00–25 como arquitetura.
- Incluir reancoramento 001–006 → 007+.
- Unificar nome RevPAH; status → `GERADO / AGUARDA RED TEAM`.

### 4.4 SQL Master Planning (`docs/planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md`)
- Próxima faixa = 007+.
- Ledger core obrigatório antes de wallet/staff account.
- `tenant_core` não é premissa; multi-tenant é decisão futura explícita.

### 4.5 SQL Master Draft (`docs/planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md`)
- Remover 046–060; substituir por rascunho 007+.
- Ledger core antes de obrigações/wallet/staff.
- Corrigir polymorphic solto (A04).
- Incluir RLS/REVOKE/GRANT/append-only/idempotência por migration (A05).
- Reintroduzir obrigações de receita antecipada (A06); k-anonimato (A14); unique com `business_unit_id` (A10).
- Manter DRAFT ONLY; não criar `.sql`.

## 5. Nova regra de fundação

```text
001–006 = base real (única sequência física; intocável)
007+    = nova faixa futura (só após Red Team aprovar docs corrigidos)
001–045 legado 4.0 = referência de design (docs/legacy/), nunca sequência física
046–060 = bloqueado/obsoleto
```

## 6. Bloqueios

- SQL executável bloqueado.
- Supabase real bloqueado (nenhuma migration/alteração de banco).
- Marketplace aberto bloqueado.
- IA soberana bloqueada.
- Saldo sem ledger bloqueado.
- Benefício sem obrigação/origem bloqueado.
- `*_REVISED.md` e documentos paralelos bloqueados.

## 7. Ordem de execução

### 24h
1. ✅ Decisão de fundação registrada (§1).
2. ✅ Legados movidos para `docs/legacy/` e renomeados.
3. ✅ `SQL_MASTER_PLANNING(1)` normalizado.
4. ✅ Este plano reescrito in-place.

### 7 dias
5. ✅ Truth Map reescrito in-place (§4.1) — A01/A02/A07.
6. ✅ Migration Map reescrito in-place (§4.2) — A01/A07/A09; faixa 007–023 definida.
7. ✅ Blueprint editado cirurgicamente (§4.3) — §0.2, §2, §8.1/8.2, §12.
8. ✅ SQL Master Planning reescrito in-place (§4.4) — A01/A03/A05/A07; tenancy explícita.
9. ✅ SQL Master Draft reescrito in-place (§4.5) — faixa 007–023; ledger core primeiro (A03); obrigações (A06); polymorphic endurecido (A04); contrato mínimo §1.1 (A05); k-anonimato (A14); nome único rev_pah_snapshots (A09).

### Pré-SQL
10. ✅ Red Team final rodado sobre o conjunto corrigido (2026-07-08) — ver §10.
11. Só com veredito A/B: SQL Executable Package 007+ em sandbox → fixtures → gates → produção.

## 8. Critério de aprovação

O conjunto só avança quando:
- Truth Map reclassificado;
- Migration Map reancorado;
- Blueprint corrigido;
- SQL Planning corrigido;
- SQL Draft corrigido;
- novo Red Team aprovado.

## 9. Veredito

```text
NÃO avançar para SQL executável.
```

## 10. Red Team final — Rodada 2 (2026-07-08)

Escopo: `docs/canon/`, `docs/architecture/`, `docs/planning/`, `docs/redteam/`, `docs/prompts/`, `AGENTS.md`, `CLAUDE.md`, `README.md`. Confirmado: base real ainda 001–006 (working tree limpo antes da auditoria); nenhuma auto-aprovação residual encontrada (`grep aprovado` sem ocorrência de autodeclaração).

| ID | Sev | Achado | Documento | Correção aplicada |
|---|---|---|---|---|
| B01 | P1 | RAGOV §10 do Blueprint listava D00–D31, Gates 00–25, ledger double-entry, Booking Candidate, Action Requests como REAL sem qualificação — contradizia o Truth Map corrigido (A02 não propagado ao Blueprint) | `docs/architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md` §10 | Nota de sincronização + reclassificação citando Truth Map como autoridade de status implementado |
| B02 | P1 | DoD §11 do Blueprint mantinha "Migrations 001–045 não renumeradas \| OK" — linha órfã que trata o 4.0 como sequência física, contradizendo §0.2/§2/§8.1 do mesmo documento | `docs/architecture/KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md` §11 | Linha substituída por critério consistente com base real 001–006 + faixa 007+ |
| B03 | P1 | README.md raiz — 5 referências não corrigidas na rodada de path-fix anterior (linhas 31/40/41/142-144: "Como continuar" e "Documentos principais" apontavam para paths pré-reorganização) | `README.md` | Paths corrigidos para `docs/canon/`; adicionados ponteiros para `AGENTS.md`/`docs/INDEX.md` |
| B04 | P2 | Migration Map §4.1 (dependências) incompleto — faltavam 014/015/020/021/022, presentes no SQL Master Planning §6 | `docs/planning/KORTEXOS_5_1_MIGRATION_MAP.md` §4.1 | Entradas faltantes adicionadas; nota apontando Planning §6 como autoridade da tabela completa |
| B05 | P3 | A10 (unique do catálogo sem `business_unit_id`) sem justificativa explícita no ponto da constraint — Correction Plan exigia "incluir OU justificar" | `docs/planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md` §008 | Comentário inline justificando pela decisão de tenancy (Migration Map §3) |

Todos os achados B01–B05 foram corrigidos in-place na mesma rodada (sem `*_REVISED`, sem novo documento). Nenhum achado P0 encontrado. Nenhuma violação de: base real 001–006 intocada, faixa 046–060 tratada como obsoleta em todos os docs, SQL executável ausente, autoaprovação ausente.

### Veredito Rodada 2

```text
APROVADO COM RESSALVAS MENORES (todas corrigidas nesta rodada).
Bloqueadores P0: nenhum.
Bloqueadores P1: nenhum remanescente (B01–B03 corrigidos).
Próximo passo permitido: commit desta rodada; início do design técnico da migration 007 (ledger core) como documento — SQL ainda bloqueado.
Próximo passo bloqueado: qualquer SQL executável ou aplicação em supabase/.
```
