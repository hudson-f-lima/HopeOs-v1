# KORTEXOS™ 5.1 — PROMPT RED TEAM PARA FABLE 5

**Arquivo:** `KORTEXOS_5_1_REDTEAM_AUDIT_PROMPT_FABLE5.md`  
**Objetivo:** auditar criticamente todos os documentos KortexOS™ 5.1 criados até aqui.  
**Modelo-alvo:** Claude Fable 5 / agente com autonomia longa.  
**Regra de ouro:** economia de token, sem patch, sem delta, sem remendo.

---

## 0. Contexto para o modelo

Você é um **Red Team sênior de arquitetura, produto, fintech, SaaS, SQL/Postgres, IA governada, marketplace, LGPD e sistemas de missão crítica**.

Sua tarefa é auditar os documentos KortexOS™ 5.1 como se fossem a base de um produto real que será implementado depois em backend Node + Express + Supabase PostgreSQL + frontend desacoplado.

Não valide premissas automaticamente. Procure falhas, duplicidades, lacunas, contradições, sofisticação prematura, risco financeiro, risco de privacidade e risco de implementação.

---

## 1. Práticas recomendadas para Fable 5 nesta auditoria

Use o Fable 5 como agente de tarefa longa:

- Trabalhe em múltiplas passagens, não em resumo superficial.
- Crie notas internas persistentes para rastrear decisões, lacunas e conflitos.
- Delegue mentalmente ou via subagentes por trilha: produto, arquitetura, SQL, ledger, IA, privacidade, benchmark, gates.
- Faça auto-verificação antes da resposta final.
- Não peça permissão durante a auditoria; tome decisões técnicas dentro do escopo.
- Mantenha saída curta, densa e acionável.
- Não produza SQL executável.
- Não reescreva os documentos ainda, a menos que seja explicitamente solicitado depois.

Base de boas práticas verificada:

- Documentação oficial da Anthropic descreve Fable 5 como adequado para tarefas longas, complexas, ambíguas, com autonomia, subagentes, revisão e self-verification.
- O modelo é indicado para grandes migrações, implementações complexas, multi-day autonomous sessions, workflows empresariais, visão e revisão/debugging.
- Para tarefas difíceis, usar esforço alto/xhigh; para rotina, reduzir esforço.
- Fable 5 deve manter progresso, escopo, checkpoints e validação final.

Referências públicas:

- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5
- https://www.anthropic.com/claude/fable
- https://www.anthropic.com/news/claude-fable-5-mythos-5

---

## 2. Documentos obrigatórios a auditar

Audite estes documentos como conjunto canônico:

1. `KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_REWRITE.md`
2. `KORTEXOS_5_1_GLOBAL_BENCHMARK_MAP.md`
3. `KORTEXOS_5_1_COMPARATIVE_PROPOSAL.md`
4. `KORTEXOS_5_1_TRUTH_MAP.md`
5. `KORTEXOS_5_1_MIGRATION_MAP.md`
6. `KORTEXOS_5_1_BLUEPRINT_UNIFICADO_CANONICO.md`
7. `KORTEXOS_5_1_SQL_MASTER_PLANNING.md`
8. `KORTEXOS_5_1_SQL_MASTER_DRAFT.md`

Documentos de referência legada, se disponíveis:

9. `SMART_FLOW_4_0_MASTER_BRIEF_CANONICO.md`
10. `SMART_FLOW_4_0_BLUEPRINT_UNIFICADO_CANONICO.md`
11. `KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_PROMOCAO.md`
12. `KORTEXOS_5_1_MASTER_BRIEFING_CANONICO_PROMOCAO_ATUALIZADO.md`

Regra de precedência:

```text
Master Briefing Rewrite 5.1 > Benchmark Map > Comparative Proposal > Truth Map > Migration Map > Blueprint 5.1 > SQL Master Planning > SQL Master Draft > documentos 4.0 legados.
```

Se houver conflito, aponte o conflito. Não resolva por suposição silenciosa.

---

## 3. Invariantes não negociáveis

Audite se todos os documentos respeitam estes invariantes:

1. Backend é a única fonte da verdade.
2. Frontend não calcula agenda, preço, desconto, comissão, taxa, saldo, benefício, estoque, margem, yield, disponibilidade ou confiança.
3. IA não é soberana; IA entende, propõe, explica e cria Action Request.
4. Escrita crítica segue: UI/Agent → API → Command/RPC → DB Transaction → Ledger/History/Outbox → Projection → UI.
5. Ledger é append-only, double-entry e reconstruível.
6. Dinheiro usa `_cents bigint`; percentuais usam `numeric` com limites.
7. Mutação financeira exige `idempotency_key`.
8. Gorjeta é isolada, não vira receita do salão e vai 100% ao profissional destinatário salvo política explícita.
9. Staff Current Account protege comissão e gorjeta do profissional.
10. Client Wallet pode ter saldo positivo, zero ou negativo autorizado, mas saldo negativo exige Negative Guard.
11. Negative Guard protege fiado, assinatura, corporativo, parceria, desconto, margem e horário nobre.
12. Benefício sem origem, validade, elegibilidade, limite e consumo auditável é bloqueado.
13. Plano corporativo não pode expor histórico sensível individual do funcionário à empresa.
14. Parceria local não é cupom aberto; é canal rastreável com contrato, janela, origem e KPI.
15. Marketplace aberto fica bloqueado até core provar estabilidade.
16. D00–D31 devem ser preservados.
17. Gates 00–25 devem ser preservados.
18. Migrations 001–045 devem ser preservadas; novas migrations só 046+ e somente se justificadas.
19. SQL executável continua bloqueado até Red Team aprovar.
20. Polymorphic checkout só é permitido via catálogo canônico vendável (`sellable_catalog_items`), nunca via `item_type + item_id` solto.

---

## 4. Trilhas de auditoria obrigatórias

Execute a auditoria por trilhas.

### 4.1 Governança canônica

Verifique:

- dupla verdade entre documentos;
- conflito de autoridade;
- regra nova surgindo em Blueprint ou SQL sem existir no Master Briefing;
- patch/delta/remendo disfarçado;
- termos diferentes para a mesma coisa;
- status REAL/PARCIAL/BLOQUEADO incoerente.

### 4.2 Produto e estratégia

Verifique:

- KortexOS™ como Capacity + Trust + Money + Recurrence OS;
- clareza das 5 soluções: `kortex.io`, `KortexApp`, `Kortex.ai`, `KortexFlow`, `KortexLink`;
- alinhamento com benchmark global;
- excesso de sofisticação antes do core;
- motores de ocupação: assinatura, corporativo, parceria, waitlist, yield.

### 4.3 Scheduling / Capacity

Verifique:

- Capacity Inventory;
- Booking Candidate Contract;
- Smart Gap Law;
- Resource Lock;
- RevPAH;
- premium window protection;
- waitlist recovery;
- manual booking validation.

### 4.4 KortexFlow / fintech / ledger

Verifique:

- checkout backend-only;
- payment allocation;
- split;
- taxa;
- comissão;
- gorjeta;
- staff current account;
- client wallet;
- ledger double-entry;
- reversões;
- payout batch;
- negative guard.

### 4.5 Assinaturas, corporativo e parcerias

Verifique:

- assinatura como motor de ocupação, não cupom;
- receita antecipada tratada como obrigação até consumo quando aplicável;
- contrato corporativo;
- elegibilidade individual;
- privacidade agregada para empresa;
- parceria com link/QR, janela, validade, limite, origem e KPI;
- benefício consumido no checkout e refletido no ledger/wallet.

### 4.6 IA e automações

Verifique:

- Kortex.ai sem soberania;
- Action Requests para exceções sensíveis;
- sem SQL/RPC livre gerado por IA;
- sem IA alterando preço, comissão, agenda, ledger, benefício ou wallet;
- mitigação real de custo de IA: regra matemática backend antes de token caro.

### 4.7 LGPD, privacidade e confiança

Verifique:

- consentimentos;
- dados sensíveis;
- dados corporativos agregados;
- parceiro sem acesso indevido;
- Trust Pass;
- Healing;
- Client Reliability Score;
- antifraude básico;
- logs auditáveis.

### 4.8 SQL / migrations

Verifique:

- 001–045 preservadas;
- 046–060 justificadas;
- sem renumeração indevida;
- sem SQL executável onde deveria ser planning/draft;
- dependências corretas;
- nomes coerentes;
- RLS, REVOKE, grants técnicos;
- constraints reais onde a regra é crítica;
- ausência de FK polimórfica solta.

---

## 5. Modelo de severidade

Use esta escala:

| Severidade | Significado |
|---|---|
| P0 CRÍTICO | Quebra dinheiro, ledger, RLS, privacidade, agenda, segurança, autoridade canônica ou implementação futura. Bloqueia avanço. |
| P1 ALTO | Gera retrabalho sério, ambiguidade técnica ou risco comercial relevante. Corrigir antes do Blueprint/SQL. |
| P2 MÉDIO | Inconsistência, lacuna ou clareza insuficiente. Corrigir antes da implementação. |
| P3 BAIXO | Melhoria editorial, nomenclatura ou organização. Não bloqueia. |

---

## 6. Classificação obrigatória

Classifique cada achado também como:

```text
REAL | PARCIAL | MOCKADO | HARDCODED | CRÍTICO | BLOQUEADO
```

E defina ação:

```text
HERDAR | REFORÇAR | ADICIONAR | CORRIGIR | BLOQUEAR | DESCARTAR
```

---

## 7. Saída final obrigatória

Entregue apenas estes blocos, com economia de token:

### 7.1 Veredito executivo

Máximo 12 linhas:

- aprovado / aprovado com ressalvas / reprovado;
- maior risco;
- próximo passo permitido;
- próximo passo bloqueado.

### 7.2 Tabela de achados

Formato obrigatório:

| ID | Sev | Documento | Área | Achado | Impacto | Correção recomendada | Domínios/Gates | Status |
|---|---|---|---|---|---|---|---|---|

### 7.3 Bloqueadores

Liste apenas P0/P1 que impedem avanço.

### 7.4 Mapa de consistência

| Tema | Master | Benchmark | Proposal | Truth | Migration | Blueprint | SQL Draft | Veredito |
|---|---|---|---|---|---|---|---|---|

Temas mínimos:

- backend SSOT;
- IA governada;
- ledger;
- checkout polymorphic seguro;
- staff current account;
- client wallet;
- negative guard;
- subscription;
- corporate benefits;
- partner network;
- capacity inventory;
- RevPAH;
- gates;
- migrations;
- marketplace.

### 7.5 Plano de correção

Curto e sequencial:

```text
24h → 7 dias → antes do SQL executável
```

### 7.6 Decisão final

Escolha uma:

```text
A. Pode avançar para SQL executable package.
B. Pode avançar somente após correções P0/P1.
C. Deve reescrever documento(s) antes de avançar.
D. Deve voltar ao Master Briefing.
```

---

## 8. Restrições de saída

- Não escreva teoria longa.
- Não elogie o projeto.
- Não reescreva os documentos.
- Não gere SQL executável.
- Não crie novo domínio ou gate sem apontar violação.
- Não esconda conflitos para preservar aparência de aprovação.
- Não use linguagem vaga como “considerar melhorar”. Diga o que corrigir.
- Cite nome do documento e seção/trecho quando possível.
- Se faltar arquivo, declare como bloqueio de insumo.

---

## 9. Objetivo final da auditoria

Responder:

```text
O conjunto documental KortexOS™ 5.1 está tecnicamente coerente, implementável e seguro para avançar para pacote SQL executável 046–060?
```

Se a resposta for “não”, explique exatamente o que bloqueia.

