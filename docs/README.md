# KortexOS / HOPE OS — Documentação

Leia [INDEX.md](INDEX.md) para o mapa completo de autoridade e ordem de leitura. Agentes de IA: leiam `AGENTS.md` na raiz ANTES de qualquer tarefa.

## Fatos de fundação (não negociáveis)

```text
- Base real do projeto: supabase/migrations/001–006 (aplicadas em produção, projeto qosioymzswhkqkziocas).
- SQL futuro: faixa 007+ (planejada em docs/planning/; NÃO autorizada).
- SMART_FLOW 4.0 (docs/legacy/): referência de design, NÃO sequência física.
- Faixa 046–060: OBSOLETA como numeração.
- SQL executável: BLOQUEADO até novo Red Team aprovar o conjunto corrigido.
- Não criar documentos paralelos (*_REVISED, copy, final): correção é reescrita in-place.
- Não mexer em supabase/ sem autorização explícita do Platform Owner.
```

## Estrutura

```text
docs/
  INDEX.md        ← mapa de autoridade e ordem de leitura
  canon/          ← fonte de verdade 5.1 (Master Briefing > Benchmark > Proposal > Truth Map)
  architecture/   ← Blueprint 5.1
  planning/       ← Migration Map, SQL Planning, SQL Draft (DRAFT ONLY)
  redteam/        ← auditorias e correction plans
  prompts/        ← prompts históricos de geração/auditoria
  legacy/         ← SMART_FLOW 4.0 e docs V1.0/V1.1 superados (referência)
  archive/        ← histórico morto (patches V1.0.x, backups)
  *.md (nesta pasta) ← docs operacionais do produto V1.x ativo (contratos, specs, handoffs)
```
