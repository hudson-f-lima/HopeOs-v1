# HOPE OS / KortexOS — Documentação

Leia [INDEX.md](INDEX.md) para o mapa completo de autoridade e ordem de leitura. Agentes de IA: leiam `AGENTS.md` na raiz ANTES de qualquer tarefa. Estado atual: [PROJECT_STATE.md](PROJECT_STATE.md). Decisões: [DECISIONS.md](DECISIONS.md).

## Fatos de fundação (não negociáveis)

```text
- Base física do banco: supabase/migrations/001–027.
  001–026 aplicadas em produção no merge de cada PR (D-010), conforme CLAUDE.md e PROJECT_STATE.md.
  027 (D-063) mesclada na main em 2026-11-22; a aplicação em produção ainda NÃO foi confirmada (conferir no Supabase).
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
  DECISIONS.md    ← decisões D-001 a D-065, com autorização e evidência
  API_CONTRACT.md ← contrato das rotas da API
  canon/          ← fonte de verdade 5.1 (Master Briefing > Benchmark > Proposal > Truth Map)
  architecture/   ← Blueprint 5.1
  planning/       ← roteiros e análises (Blueprint v2, cadastros, agenda, assinaturas); SQL marcado DRAFT ONLY
  redteam/        ← auditorias e planos de correção
  prompts/        ← prompts históricos de geração/auditoria
  legacy/         ← SMART_FLOW 4.0 e docs V1.0/V1.1 superados (referência)
  archive/        ← histórico morto (patches V1.0.x, backups)
  promo/          ← rascunho de material de marketing (fora do produto)
  *.md (nesta pasta) ← docs operacionais do produto V1.x ativo (contratos, specs, runbooks, handoffs)
```
