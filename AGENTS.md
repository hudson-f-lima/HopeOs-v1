# AGENTS.md

Manifesto permanente para agentes de IA. Leia antes de qualquer tarefa.

## Ordem de leitura

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/INDEX.md`
4. `docs/PROJECT_STATE.md`
5. auditorias e documentos canônicos somente quando a tarefa exigir

O estado atual e o handoff vivem exclusivamente em `docs/PROJECT_STATE.md`. Este manifesto não mantém diário de progresso.

## Bloqueios permanentes

- Não avançar para V1.5.
- Não criar migrations 013+ nem tocar 001–012 (007 em D-007, 008 em D-009, 009 em D-013, 010 em D-017, 011 em D-019, 012 em D-032).
- Não implementar escala global, novas features ou regras de negócio sem autorização do Platform Owner registrada em `docs/DECISIONS.md` (ex.: D-016, D-017).
- Não tratar `API_ACCESS_TOKEN` como autenticação final.
- Não declarar multi-tenant seguro.
- Não usar `empresa_id` vindo de body/query como verdade.

## Regras de segurança e arquitetura

- Backend é a única fonte de verdade para preço, comissão, saldo, estoque, agenda e financeiro.
- `service_role` nunca é exposto ao frontend.
- Não criar SQL executável sem autorização explícita do Platform Owner.
- Não criar documentos paralelos `*_REVISED`, `copy`, `final`, patch/delta/adendo.
- Não declarar documento aprovado sem Red Team real registrado.
- Nunca comprimir ou sobrescrever auditorias, prompts históricos ou evidências do Owner.

## Classificação obrigatória

Todo achado deve ser classificado como `REAL`, `PARCIAL`, `MOCKADO`, `HARDCODED`, `CRÍTICO`, `BLOQUEADO`, `DESCONHECIDO`, `OBSOLETO` ou `CONTRADITÓRIO`.

## Migrações e documentação

- Fundação física: `supabase/migrations/001–012` (rollbacks da 007 à 012 em `supabase/rollback/`). Desde a 009 o ledger financeiro é imutável por trigger: limpeza de dados ou exclusão de empresa com histórico exige SQL autorizado (RUNBOOK §4.1).
- Merge na `main` aplica migrations em produção (D-010): migration nova só com linha em `supabase/migrations.lock` e decisão em `docs/DECISIONS.md`.
- Faixa 013+ é futura e não autorizada; 046–060 é obsoleta.
- Correções documentais são in-place e entram no índice.
- SQL draft só em Markdown com `DRAFT ONLY`.

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

## Formato obrigatório ao alterar arquivos

```text
FILES_CHANGED:
- <paths com natureza da mudança>
BLOCKERS_REMAINING:
- <o que segue bloqueado/pendente>
VEREDITO:
- <status geral + próximo passo>
```
