# HOPE OS / KortexOS — contexto permanente

Leia [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) para o estado atual. Este arquivo não mantém diário de progresso.

## Regras invioláveis
- Backend é a fonte de verdade para financeiro, comissão, estoque, agenda e ledger.
- Não tratar `API_ACCESS_TOKEN` como autenticação final ou declarar multi-tenant seguro.
- Não usar `empresa_id` vindo de body/query como verdade.
- Não criar migrations 024+, não tocar 001–023 e não executar SQL sem autorização do Platform Owner (007 em D-007, 008 em D-009, 009 em D-013, 010 em D-017, 011 em D-019, 012 em D-032, 013 em D-033, 014 em D-034, 015 em D-035, 016 em D-037, 017 em D-038, 018 em D-039, 019 em D-040, 020 em D-041, 021 em D-042 = Onda A da assinatura, fase 1; 022 em D-043 = fase 2; 023 em D-047 = prova de autonomia do profissional).
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
- Migrations físicas: 001–023. 023 = trilha encadeada (hash), encurtar bloqueio e aceite da escala (D-047), aplica em produção no merge do PR que a contém. 022 = assinantes, cobranças manuais e uso na comanda (D-043), aplicada em produção no merge do PR #37. 021 = planos de assinatura, Onda A fase 1 (D-042), aplicada em produção no merge do PR #36.  020 = lembretes por push (D-041), aplica em produção no merge do PR que a contém. 019 = atendimento com vários serviços (D-040), aplica em produção no merge do PR que a contém. 018 = recorrência pela equipe (D-039), aplica em produção no merge do PR que a contém. 017 = link pessoal do agendamento (D-038), aplica em produção no merge do PR que a contém. 016 = agendamento online por salão (D-037), aplicada em produção no merge do PR #31. 015 = escalas em lote e modelos de escala (D-035), aplicada em produção no merge do PR que a contém. 014 = search_path fixo nas funções auxiliares da 013 (D-034), aplicada em produção no merge do PR que a contém. 012 (permissões individuais, D-032) e 013 (disponibilidade e escalas, D-033) aplicadas em produção em 2026-11-15 pela integração, no merge do PR #29 (a do PR #28 falhou antes de executar SQL). 010 = pagamento de comissão + fechamento de caixa salvo (D-017), aplicada em produção em 2026-11-10 no merge do PR #22. 011 = metas e ranking (D-019, D-020), aplicada em produção em 2026-11-11 no merge do PR #23. 001–008 aplicadas em produção (`hopeos-v1`) em 2026-11-08 (007 = ADR-005, D-007; 008 = Onda B, D-009); 009 = estorno de comanda + ledger imutável por trigger (D-013), aplicada no merge do PR #18.
- **Merge na `main` aplica `supabase/migrations` em produção** (integração GitHub do Supabase, D-010). Toda migration precisa de linha em `supabase/migrations.lock`; o CI (`check_migrations.sh`) barra o resto.
- Documentação: [`docs/INDEX.md`](docs/INDEX.md).
