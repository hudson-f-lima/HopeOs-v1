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

## Delegação eficiente de tarefas (Platform Owner, 2026-11-14)
Antes de criar subagentes, avaliar se a delegação tende a melhorar o resultado, reduzir o tempo ou diminuir o custo total, considerando execução, contexto, coordenação, integração e retrabalho.
1. Executar diretamente tarefas simples, curtas ou fortemente dependentes do contexto principal, quando delegar não trouxer benefício claro.
2. Quando delegar for permitido e útil, escolher para cada subtarefa o agente e o nível de esforço de menor custo estimado que sejam suficientes para a complexidade, o risco e os critérios de aceite.
3. Dar a cada agente objetivo específico, contexto mínimo necessário, limites e resultado esperado.
4. Agrupar subtarefas pequenas e relacionadas quando isso reduzir comunicação e coordenação. Paralelizar só trabalhos independentes.
5. Reservar mais capacidade de raciocínio para decisões arquiteturais, segurança, integração complexa, ambiguidades relevantes e falhas não resolvidas com o esforço inicial.
6. Escalonar a capacidade quando houver evidência de que o agente escolhido não conclui com a qualidade exigida. Não repetir tentativas equivalentes sem mudar de estratégia.
7. O agente da tarefa principal integra os resultados, verifica a coerência e garante os critérios de aceite antes da entrega.
8. Respeitar instruções superiores, limitações da plataforma e disponibilidade de modelos e subagentes. Não afirmar economia de tokens ou custo como fato sem medição.

## Fundação
- Stack: Node.js/Express, Supabase/Postgres e PWA.
- Migrations físicas: 001–011. 010 = pagamento de comissão + fechamento de caixa salvo (D-017), aplicada em produção em 2026-11-10 no merge do PR #22. 011 = metas e ranking (D-019, D-020), aplicada em produção em 2026-11-11 no merge do PR #23. 001–008 aplicadas em produção (`hopeos-v1`) em 2026-11-08 (007 = ADR-005, D-007; 008 = Onda B, D-009); 009 = estorno de comanda + ledger imutável por trigger (D-013), aplicada no merge do PR #18.
- **Merge na `main` aplica `supabase/migrations` em produção** (integração GitHub do Supabase, D-010). Toda migration precisa de linha em `supabase/migrations.lock`; o CI (`check_migrations.sh`) barra o resto.
- Documentação: [`docs/INDEX.md`](docs/INDEX.md).
