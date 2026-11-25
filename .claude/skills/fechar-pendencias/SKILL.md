---
name: fechar-pendencias
description: Triar e ordenar as tarefas em aberto do HOPE OS / KortexOS e levar cada uma a um PR rascunho que se mescla sem conflito — classificar (livre, precisa de autorização, precisa de migration, bloqueado), escolher a de maior impacto, um PR por decisão a partir da main, numeração D-xxx, pontos de conflito entre PRs paralelos e o que nunca fazer sem ordem. Use quando o usuário disser "iniciar pendências", "tarefas em aberto", "o que falta", "seguir a decisão mais inteligente" ou ao terminar uma entrega e escolher a próxima.
---

# Fechar pendências — HOPE OS / KortexOS

Siga também `steward`. Para implementar, use `completar-lacuna` (sem migration) ou `integracao-futura` (com fornecedor, custo ou migration).

## 1. Levantar o que está aberto (fatos, não memória)
- `docs/PROJECT_STATE.md`: as linhas "pendente" e as decisões recentes.
- `docs/DECISIONS.md`: as linhas "Pendente:" das últimas D-xxx.
- PRs abertos: `mcp__github__list_pull_requests` (state open). Um PR verde à espera do dono **não** é tarefa sua. Só o cite.
- `docs/planning/INTEGRACOES_FUTURAS.md`: o que já está encaminhado.

## 2. Classificar cada item
| Classe | Critério | O que fazer |
|---|---|---|
| LIVRE | Só código, testes ou docs. Sem coluna nova, sem fornecedor, sem produção | Pode começar |
| AUTORIZAÇÃO | Lê ou muda produção (SQL, deploy, Render, dados reais) | Pergunta objetiva ao Platform Owner. Não executar |
| MIGRATION | Coluna, tabela, RPC ou trigger novos (028+) | `integracao-futura` + pergunta. Não criar o arquivo |
| BLOQUEADO | Decisão do dono adia (ex.: D-073 até V1.5) ou há P0 aberto | Só registrar |
| DESCONHECIDO | Falta evidência para classificar | Investigar antes de prometer |

## 3. Escolher a próxima, nesta ordem
1. Erro de dado ou número errado na tela. Métrica que mente vem antes de visual.
2. P0/P1 de segurança ou de integridade (financeiro, agenda, ledger).
3. Lacuna que destrava outras (ex.: card etapa 2 antes do arraste da etapa 3).
4. Teste que falta numa entrega já feita (E2E não coberto).
5. Polimento visual.

Uma prioridade por vez. Se duas são LIVRES e independentes, podem ir em PRs separados. Não junte as duas no mesmo PR.

## 4. Um PR por decisão
- Ramo novo a partir de `origin/main`, nunca do ramo de outro PR aberto: `git checkout -B <ramo> origin/main`. Use o ramo de trabalho da sessão como prefixo.
- **Número D-xxx:** pegue o maior em `DECISIONS.md` **e** nos PRs abertos (`grep -h "^## D-" ` em cada ramo) e some 1. PRs paralelos não podem repetir número.
- Commit com os trailers do lembrete da sessão. PR **rascunho**. Corpo sem identificador de modelo. Assine a atividade do PR.

## 5. Pontos de conflito entre PRs paralelos (já pagos)
| Arquivo | Como evitar |
|---|---|
| `service-worker.js` `CACHE_NAME` | Cada PR põe um nome próprio. No conflito, fica o do PR que entra por último, com o número maior |
| `docs/DECISIONS.md` | Acrescentar a decisão no fim. No conflito, mantenha as duas |
| `CHANGELOG.md`, `docs/PROJECT_STATE.md` | Linha própria por PR. No conflito, mantenha as duas |
| `backend/tests/e2e/run-all.js` `CASOS` | Um caso por linha. No conflito, mantenha os dois roteiros (lição dos PRs #60/#61) |
| `backend/package.json` `test:offline` | Idem. Confira que os dois gates continuam na lista |

Resolva com merge da main no ramo, nunca com rebase ou force-push em ramo de outra pessoa. Depois de resolver, rode os três gates.

## 6. Gates antes de cada push
```
cd backend && API_ACCESS_TOKEN=ci-dummy-token SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=ci-dummy-key npm run -s test:offline
cd .. && bash supabase/tests/check_migrations.sh
pkill -f static-server.py; pkill -f dev-memory-api.js; NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js
```
`API_ACCESS_TOKEN=x` quebra o RT-10. Use os valores do CI.

## 7. Nunca sem ordem explícita
- Merge na `main`. Ele publica Render, Pages e migrations em produção (D-010).
- SQL, leitura de dados reais ou mudança no Render/Supabase de produção.
- Fechar PR de outra pessoa (recomende; não feche).
- Gravar senha, chave ou dado pessoal em arquivo, commit ou PR.

## 8. Entrega ao dono
Use o formato: problema, impacto, diagnóstico, ação feita (com prova: gates, controle negativo), o que ficou de fora e por quê, e a decisão que só ele toma. Para cada PR diga se o CI está verde ou vermelho. "Pronto para produção" só com uso real.
