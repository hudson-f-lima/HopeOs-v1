# HOPE OS / KortexOS — contexto permanente

Leia [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) para o estado atual. Este arquivo não mantém diário de progresso.

## Regras invioláveis
- Backend é a fonte de verdade para financeiro, comissão, estoque, agenda e ledger.
- Não tratar `API_ACCESS_TOKEN` como autenticação final ou declarar multi-tenant seguro.
- Não usar `empresa_id` vindo de body/query como verdade.
- Não criar migrations 012+, não tocar 001–011 e não executar SQL sem autorização do Platform Owner (007 em D-007, 008 em D-009, 009 em D-013, 010 em D-017, 011 em D-019).
- Não avançar para V1.5, escala global ou novas features com P0 aberto.
- Não expor `service_role` ao frontend.
- Classificar achados como REAL, PARCIAL, MOCKADO, HARDCODED, CRÍTICO, BLOQUEADO ou DESCONHECIDO.
- Não declarar produção aprovada sem evidência e Red Team quando aplicável.

## Fundação
- Stack: Node.js/Express, Supabase/Postgres e PWA.
- Migrations físicas: 001–011. 010 = pagamento de comissão + fechamento de caixa salvo (D-017), aplicada em produção em 2026-11-10 no merge do PR #22. 011 = metas e ranking (D-019); só existe em produção depois do merge do PR que a contém. 001–008 aplicadas em produção (`hopeos-v1`) em 2026-11-08 (007 = ADR-005, D-007; 008 = Onda B, D-009); 009 = estorno de comanda + ledger imutável por trigger (D-013), aplicada no merge do PR #18.
- **Merge na `main` aplica `supabase/migrations` em produção** (integração GitHub do Supabase, D-010). Toda migration precisa de linha em `supabase/migrations.lock`; o CI (`check_migrations.sh`) barra o resto.
- Documentação: [`docs/INDEX.md`](docs/INDEX.md).
