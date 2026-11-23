# HOPE OS / KortexOS — Documentação

Leia [INDEX.md](INDEX.md) para o mapa completo de autoridade e ordem de leitura. Agentes de IA: leiam `AGENTS.md` na raiz ANTES de qualquer tarefa. Estado atual: [PROJECT_STATE.md](PROJECT_STATE.md). Decisões: [DECISIONS.md](DECISIONS.md).

## Fatos de fundação (não negociáveis)

```text
- Base física do banco: supabase/migrations/001–027.
  Todas aplicadas em produção (conferido por list_migrations em 2026-11-23); a 027 (D-063) entrou no merge do PR #58.
- Produção: projeto Supabase "hopeos-v1" (ID gsttjozcmdvgstcpadiq, sa-east-1).
  Os IDs qosioymzswhkqkziocas que aparecem em documentos antigos (docs/audit_global, docs/archive) não existem mais nesta organização.
- SQL novo: faixa 028+ NÃO autorizada. Só com autorização registrada em DECISIONS.md.
- Faixa 046–060: OBSOLETA como numeração (vem do plano KortexOS 5.1, nunca aplicado).
- Os SQL drafts do KortexOS 5.1 em docs/planning/ são DRAFT ONLY: não executar.
- Não criar documentos paralelos (*_REVISED, copy, final): correção é reescrita in-place.
- Não mexer em supabase/ sem autorização explícita do Platform Owner.
- Merge na main aplica as migrations em produção (D-010).
```

## Estrutura

```text
docs/
  INDEX.md        ← mapa de autoridade e ordem de leitura
  PROJECT_STATE.md← estado operacional (única fonte de estado)
  DECISIONS.md    ← decisões D-001 a D-066, com autorização e evidência
  API_CONTRACT.md ← contrato das rotas da API
  ROTAS.md        ← todas as rotas da API com a permissão de cada uma (GERADO do código)
  audit/          ← auditorias e Red Team datados de novembro de 2026 (evidência)
  planning/       ← roteiros e análises de novembro (Blueprint v2, cadastros, agenda, assinaturas); SQL marcado DRAFT ONLY
  adr/            ← decisões de arquitetura (ADR-005: identidade, tenant, RBAC)
  canon/          ← HISTÓRICO de julho: visão KortexOS 5.1 (NÃO é fonte de estado nem de verdade do produto atual)
  architecture/   ← HISTÓRICO de julho: Blueprint 5.1
  redteam/ prompts/ ← HISTÓRICO de julho: plano de correção e prompt de Red Team do 5.1
  audit_global/   ← HISTÓRICO de julho: auditoria global e checklists da V1.4.1
  legacy/         ← SMART_FLOW 4.0 e docs V1.0/V1.1 superados (referência)
  archive/        ← histórico morto (patches V1.0.x, backups)
  promo/          ← rascunho de material de marketing (fora do produto)
  *.md (nesta pasta) ← docs operacionais do produto V1.x ativo (contratos, specs, runbooks, handoffs)
```
