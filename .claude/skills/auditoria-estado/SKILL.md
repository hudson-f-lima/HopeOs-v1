---
name: auditoria-estado
description: Auditoria de estado do HOPE OS / KortexOS (código, banco de produção, segurança, dependências, CI, lacunas de produto) e benchmark de mercado global e cross-indústria. Use quando o usuário pedir "auditoria", "estado do software", "o que falta", "benchmark", "comparar com concorrentes" ou "completar o software".
---

# Auditoria de estado + benchmark — HOPE OS / KortexOS

Modelos prontos: `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md` e `AUDITORIA_E_BENCHMARK_2026-11-10.md` (2ª rodada: o que mudou, o que foi completado, o que foi encaminhado). Uma auditoria nova é um arquivo novo com data, não uma edição do anterior.

## 1. Fatos antes de opinião (só leitura)
| O quê | Como |
|---|---|
| Estado declarado | `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`. Confronte com o código; o documento pode estar velho |
| Banco de produção (`hopeos-v1`, `gsttjozcmdvgstcpadiq`) | Supabase MCP: `list_migrations`, `get_advisors` (security + performance), a consulta de verificação do `docs/RUNBOOK_MIGRATION_007.md`. Nunca o `kortex-os-v2-staging` |
| Backend no ar | `curl -s -o /dev/null -w '%{http_code}' https://hopeos-v1.onrender.com/api/health` |
| Superfície da API | `grep -rhoE "\.(get\|post\|patch\|put\|delete)\('[^']+'" backend/src/routes` |
| Dependências | `cd backend && npm audit --omit=dev --json`. Veja `fixAvailable` e se o pacote é usado em `src/` ou só em `scripts/` |
| Gates | `API_ACCESS_TOKEN=ci-dummy-token SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=ci-dummy-key npm --prefix backend run test:offline` (sem essas variáveis o Auth Gate dá 8/9 falso), `supabase/tests/check_migrations.sh`, `supabase/tests/run.sh` |
| Lacunas de produto | `grep -rli` por termos de mercado (estorno, lembrete, booking público, sinal, assinatura, fechamento de caixa, NFS-e) em `backend/src js index.html` |

Pontos que já renderam achado real e merecem olhar toda vez:
- transições de estado aceitas sem checar o estado atual;
- CORS comparando por `includes`;
- pacote vulnerável em `dependencies` que só scripts usam;
- texto de UI fora do português.

## 2. Benchmark
- Pesquise em lote (várias `WebSearch` no mesmo turno):
  - concorrentes globais (Fresha, Booksy, Vagaro, Square, Boulevard, Zenoti, Phorest);
  - concorrentes brasileiros (Trinks, Avec, Belasis, AppBarber);
  - números do setor (falta, reagendamento, retorno do cliente novo);
  - práticas de outras indústrias (saúde: lembrete e depósito; clínicas: lista de espera; SaaS/Pix Automático: recorrência).
- A maior parte das fontes é de fornecedor: escreva isso. Número sem fonte primária vira "citado por X", nunca fato.
- Preço não encontrado = "não encontrado", nunca estimado.
- Toda linha de benchmark termina em "HOPE OS: REAL/PARCIAL/AUSENTE" com evidência no código.

## 3. Formato do relatório
Seguir a Auditoria Brutal do Platform Owner, nesta ordem:
- veredito;
- pontos fortes;
- corrigido nesta rodada, com prova;
- lacunas, com classe e o que exigem;
- pontos cegos;
- causa raiz;
- prioridade, uma por vez;
- benchmark;
- recomendação com critério de validação.

Diferencie fato, inferência e hipótese.

## 4. "Completar o software": o que pode e o que não pode
- **Pode, sem perguntar:** correção de segurança ou integridade com teste e controle negativo; feature sem migration e sem fornecedor que ataque uma lacuna do relatório. Exemplo: lembrete via wa.me (D-011). Registrar como D-xxx.
- **Não pode:**
  - migration 011+ (o merge na `main` executa SQL em produção, D-010; o CI reprova sem linha no `supabase/migrations.lock`);
  - Onda C (gateway, sinal, clube);
  - fornecedor pago;
  - reativar ou pagar infraestrutura.

  Para esses itens: lacuna priorizada + o que exige + pergunta objetiva ao Platform Owner.
- Cada correção vem com teste que falha sem ela. Rode o teste com a correção revertida e mostre a falha.

- Para executar: skill `completar-lacuna` (o que cabe sem migration) e `integracao-futura` (o que não cabe). Tela nova passa pela `usabilidade-pwa`.
- Auditoria repetida em poucos dias rende pouco: diga isso no veredito e recomende uso real em vez de mais benchmark.

## 5. Fechamento
- Atualizar `docs/PROJECT_STATE.md` (gates, bloqueadores), `docs/DECISIONS.md`, `CHANGELOG.md` e `docs/API_CONTRACT.md` se houver rota nova.
- Entregar: veredito em 3 linhas, o que foi corrigido com prova, as 3 prioridades seguintes e o que depende do dono.
