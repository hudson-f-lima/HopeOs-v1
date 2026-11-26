# HOPE OS / KortexOS — contexto permanente

Leia [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) para o estado atual. Este arquivo não mantém diário de progresso.

## Regras invioláveis
- Backend é a fonte de verdade para financeiro, comissão, estoque, agenda e ledger.
- Não tratar `API_ACCESS_TOKEN` como autenticação final ou declarar multi-tenant seguro.
- Não usar `empresa_id` vindo de body/query como verdade.
- Não criar migrations 029+, não tocar 001–028 e não executar SQL sem autorização do Platform Owner (007 em D-007, 008 em D-009, 009 em D-013, 010 em D-017, 011 em D-019, 012 em D-032, 013 em D-033, 014 em D-034, 015 em D-035, 016 em D-037, 017 em D-038, 018 em D-039, 019 em D-040, 020 em D-041, 021 em D-042 = Onda A da assinatura, fase 1; 022 em D-043 = fase 2; 023 em D-047 = prova de autonomia do profissional; 024 em D-049 = regras da agenda; 025 em D-054 = política de sugestão de horários e faixa da lista de espera; 026 em D-058 = escala e reserva sem corrida; 027 em D-063 = agendamento público e remarcação atômicos; 028 em D-084 = "Cliente chegou" como opção do salão).
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
- Migrations físicas: **001–027, todas aplicadas em produção** (`hopeos-v1`; conferido por `list_migrations` em 2026-11-23). A decisão que autorizou cada uma está na regra de migrations acima e em `docs/DECISIONS.md`; os nomes estão nos arquivos de `supabase/migrations/`. Rollbacks da 007 à 028 em `supabase/rollback/`. **028 autorizada (D-084), entra em produção no merge do PR dela. 029+ não autorizada.** A 009 tornou o ledger financeiro imutável por trigger (D-013): limpar dados ou excluir empresa com histórico exige SQL autorizado (RUNBOOK §4.1).
- **Merge na `main` aplica `supabase/migrations` em produção** (integração GitHub do Supabase, D-010). Toda migration precisa de linha em `supabase/migrations.lock`; o CI (`check_migrations.sh`) barra o resto.
- Documentação: [`docs/INDEX.md`](docs/INDEX.md).
