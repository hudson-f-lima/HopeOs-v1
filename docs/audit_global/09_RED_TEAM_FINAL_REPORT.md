# 09 — RED TEAM FINAL REPORT — HOPE OS V1 → KortexOS

**Data:** 2026-07-10
**Método:** ataque adversarial contra a própria auditoria (docs 01–08, 10) e contra o estado real do repositório. Objetivo: quebrar conclusões, expor otimismo, achar o que a auditoria minimizou. Classificação REAL / PARCIAL / MOCKADO / HARDCODED / CRÍTICO / BLOQUEADO.
**Nota de execução:** o agente automatizado de Red Team do workflow MAS abortou por limite de gasto mensal da conta de API. Este relatório foi escrito diretamente pelo orquestrador a partir do corpus completo das seis auditorias de domínio (frontend, backend, SQL, docs, segurança, escala) já consolidado nos docs 01–08 e 10.

---

## 0. Veredito do Red Team

Sustento o veredito **CRÍTICO** do doc 10 — e vou além: a documentação canônica (CLAUDE.md, README, AGENTS.md) declara **"V1.4 CONCLUÍDO / validado em produção"**, o que é **verdadeiro para funcionalidade e falso para prontidão**. Um produto financeiro com PII de 1481+ pessoas exposto na internet **sem autenticação** não está "em produção validado"; está **incidente em aberto**. A maior falha do projeto não é técnica — é **de narrativa**: os documentos comemoram o que funciona e são silenciosos sobre o que qualquer atacante faz em 30 segundos com `curl`.

---

## 1. Onde a arquitetura está SUPERDIMENSIONADA (sofisticação prematura)

| Item | Crítica adversarial |
|---|---|
| Matriz de bancos pool/silo/bridge/dedicado (doc 05, 10 combinações) | Correta como roadmap, **perigosa como pauta**. O projeto tem **1 tenant** (`DEFAULT_EMPRESA_ID` HARDCODED). Discutir banco dedicado por país antes de existir o segundo tenant é fuga do P0. Mantido apenas porque o doc 05 se declara explicitamente BLOQUEADO/roadmap — se algum dev tratar isso como sprint, é retrabalho garantido. |
| Extração de microsserviços / API gateway / BFF (doc 04) | 100M atendimentos/dia é hipótese teórica. Um modular monolith Express em Render aguenta os primeiros milhares de tenants. Serviço separado agora = complexidade operacional sem carga que a justifique. |
| Event outbox / event store separado | Necessário eventualmente para analytics em escala; hoje `agendamento_eventos` é **tabela morta (MOCKADO)** — construir o pipeline de eventos antes de ter um evento real gravado é castelo no ar. |
| Insights V1.4 (RFM, churn, reliability, attach) | Feature de "decision intelligence" entregue **antes** de haver autenticação. Prioridade invertida: sofisticou o dashboard enquanto a porta da frente ficou sem fechadura. Não é bug do código (as engines são REAIS e puras), é bug de sequência de produto. |

## 2. Onde está SUBDIMENSIONADA (a auditoria não pode ter subestimado)

| Item | Crítica adversarial |
|---|---|
| **Perímetro de auth** | O doc 06 chama de P0 e está certo. Reforço: não é "falta uma feature", é que **toda a postura de segurança do projeto é uma mentira arquitetural** — RLS deny-all + RPC locks + service_role protegido são REAIS, mas todos rodam atrás de uma API que não tem porteiro. Segurança de banco impecável é inútil quando a única credencial que importa (service_role) atende qualquer requisição anônima. |
| **`checkout_close` não revalida totais** | A auditoria classificou como "mitigado porque só service_role executa". Adversarialmente: assim que a auth entrar e o backend Node tiver **qualquer** bug de cálculo no `preview`, a RPC grava o valor errado no ledger sem questionar. É uma bomba-relógio de defesa-em-profundidade. A regra-mãe diz "backend é a verdade única" — mas a RPC confia cegamente no Node, então a verdade é gravável por um único ponto de falha. |
| **Append-only é convenção, não física** | `DELETE` concedido ao service_role em todas as tabelas do ledger + cascades. Um `DELETE FROM comandos` apaga pagamentos e gorjetas por cascade. Não existe trigger nem REVOKE seletivo. O ledger "auditável e reversível por estorno" do briefing **não existe fisicamente** — nem o estorno (não há tipo de saída em `caixa_movimentos`, só `entrada_pagamento` HARDCODED). |
| **Ausência de `actor_id` em 100% das escritas** | Sem autoria, o ledger é auditável em valores mas **não em responsabilidade**. Em disputa financeira ("quem baixou esse estoque?"/"quem fechou esse caixa?") não há resposta. Débito estrutural, não cosmético. |

## 3. Risco FINANCEIRO

- **Checkout anônimo (P0):** qualquer pessoa fecha comandas reais via `POST /checkout/close`. Além do vazamento, permite **poluição do ledger** — inserção de faturamento/pagamentos falsos que contaminam todo o dashboard de decisão do V1.4. A "decision intelligence" fica lixo-entra-lixo-sai.
- **Sem idempotência em estoque/waitlist:** ajuste de estoque sem chave de idempotência explícita → retry de rede duplica movimento. O checkout tem idempotência de comando (REAL), mas o ajuste manual não (débito já reconhecido no CLAUDE.md).
- **TOCTOU na agenda:** verificação-e-ação sem lock permite double-booking sob concorrência — impacto financeiro indireto (slot vendido duas vezes).

## 4. Risco LGPD

- **`GET /clientes` anônimo (P0):** exposição da base inteira (nome + whatsapp + observações em texto livre) = **incidente reportável à ANPD**. Não é hipotético; é o estado atual do endpoint público.
- **PII versionada no git (P0):** `data/clientes.json` + `data/backups/export-*.json` com nomes reais trackeados. Mesmo removendo agora, o histórico do git retém — exige reescrita de histórico, não só `git rm`.
- **Soft-delete conflita com direito de eliminação (art. 18):** `ativo=false` é a política do projeto por design operacional, mas colide com o direito do titular à eliminação. Precisa de rota de anonimização real, não só desativação.
- **Sem base legal/consentimento registrado.** Sem redaction em logs (`morgan('dev')` + `console.error(err)` podem cuspir PII).

## 5. Risco de LOCK-IN

- **Supabase:** o coração financeiro são RPCs `SECURITY DEFINER` em PL/pgSQL (`checkout_close`, ajuste de estoque, overrides). Isso é lock-in **de plataforma Postgres**, aceitável — porém a dependência de `service_role`/RLS-bypass amarra ao modelo Supabase. Migração para outro Postgres gerenciado é viável; sair de Postgres é reescrita.
- **Render:** deploy hook com key embutida; sem WAF. Baixo lock-in técnico, mas o `.env` distribuído no zip acopla segredos ao artefato.
- **GitHub Pages:** PWA em CDN estático — zero lock-in, saudável. Ressalva: **não permite headers customizados** (CSP/HSTS impossíveis no PWA hoje — mitigável só via edge/WAF futuro).

## 6. Risco de MIGRAÇÃO FUTURA

- **Tenant retrofit:** 16 tabelas já têm `empresa_id` com índices tenant-first (REAL, excelente decisão). MAS `insert()` genérico aceita `payload.empresa_id` do body como override — ao ligar multi-tenant, isso é **injeção de tenant cross-boundary**. Precisa ser fechado ANTES do segundo tenant, não depois.
- **Migration 007+:** corretamente ausente/BLOQUEADO. O risco é documental: se a faixa 046–060 obsoleta ou o `_ai_index/` divergente for consultado por engano, um dev pode aplicar SQL fantasma.
- **`DEFAULT_EMPRESA_ID`:** desligar o tenant hardcoded exige que o `empresa_id` venha do JWT — ou seja, **auth e multi-tenant são o mesmo trabalho** (E1). Bem sequenciado nos docs 06/08.

## 7. Onde o FRONTEND ainda pode MENTIR

- **`renderActionStrip` é stub MOCKADO (TODO)** — a "action strip" do dashboard bento não renderiza ação real. Risco: parecer entregue quando é placeholder. Deve ser marcado como PARCIAL na doc canônica.
- **Donut de ocupação da agenda morto (PARCIAL):** SVG presente sem dados vivos — exatamente o tipo de "dado falso de ocupação" que a Regra 2 do prompt manda caçar. Não engana em valor financeiro (que vem do backend), mas engana em **percepção de completude**.
- **Positivo (defesa que se sustentou):** grep confirma `frontendCalculates: false` REAL — nenhum cálculo financeiro/comissão/margem no cliente. Split payment está COMPLETO (débito V1.3 quitado). A regra-mãe **não** é violada. Aqui a documentação diz a verdade.

## 8. Onde o BACKEND ainda pode DIVERGIR

- **Confiança cega no `p_preview`:** já coberto (§2). O Node é fonte única de cálculo e a RPC não confere — divergência silenciosa possível se o Node errar.
- **5 rotas sem escopo `empresa_id`** (`GET /clientes`, `GET /agenda`, `PATCH /agenda/:id/duracao`, vínculo de agenda no `checkout/close`, `insert()` genérico): hoje mascaradas pelo single-tenant, viram vazamento no 2º tenant.
- **CORS por substring:** `origin.includes('hudson-f-lima.github.io')` casa `...github.io.evil.com`. Irrelevante enquanto não há auth por cookie, mas é dívida que morde quando a auth entrar.

## 9. Onde os DOCUMENTOS ainda contradizem o CÓDIGO (drift residual)

| Drift | Evidência | Ação |
|---|---|---|
| README/AGENTS.md dizem "EM VALIDAÇÃO"; só CLAUDE.md foi atualizado | Auditoria de docs | Alinhar in-place (escopo V1.4.1) |
| "76 testes" / "21 testes waitlist" sem lastro | Real medido: **73/73** | Corrigir números nas docs |
| `API_CONTRACT.md` / `DATA_CONTRACT.md` são V1.0.3, vendidos como ativos no INDEX | Auditoria de docs | Marcar como LEGADO ou atualizar |
| `_ai_index/` = bolsão de docs paralelos divergentes | Auditoria de docs | Classificar OBSOLETO/quarentena |
| CLAUDE.md/10 celebram "V1.4 concluído e validado" sem mencionar o P0 de auth | Contradição de postura | **Adicionar ressalva de segurança à seção de status do CLAUDE.md** |

**Contradição mais grave:** o próprio ato de declarar "release aprovado" viola o item da Regra 6 do prompt ("declarar release como aprovado sem teste [de segurança]"). O V1.4 foi aprovado em funcionalidade sem gate de segurança. A auditoria corrige isso rebaixando para CRÍTICO.

---

## 10. Ataques que NÃO procederam (a auditoria resistiu)

Para não ser um Red Team que só confirma o próprio time:

1. **"O frontend calcula financeiro escondido"** — FALSO. Grep confirma ausência; regra-mãe respeitada.
2. **"O service_role vazou pro frontend"** — FALSO. `config.json` só tem `apiBase`; nenhuma key no bundle.
3. **"O hotfix P0 dos renderers ainda está quebrado"** — FALSO. `renderOccupancy/Money/Margin/People` existem (dashboard.js:122–234); SWs unificados em `hope-os-shell-v1-4-3`; test:gate 73/73. Tarefa 7 do prompt está genuinamente CONCLUÍDA.
4. **"As migrations não estão aplicadas mas são tratadas como aplicadas"** — não refutado nem confirmado por código local (exigiria acesso ao banco `qosioymzswhkqkziocas`); os arquivos 001–006 são coerentes e os testes de RPC-lock verdes sugerem aplicação real. Deixado como PARCIAL/verificável.

---

## 11. Conclusão do Red Team

O núcleo de engenharia é **melhor que a média** — schema multi-tenant desde o início, ledger distribuído em centavos inteiros, RPCs atômicas, validadores agressivos, frontend disciplinado. O problema é **prioridade e honestidade documental**: construiu-se decision-intelligence sofisticada sobre uma API sem tranca, e a documentação canônica comemora "concluído" sem citar o incidente LGPD ativo.

**Veredito sustentado: CRÍTICO.**
**Proibição sustentada (do prompt, Tarefa 7/4):**

> NÃO AVANÇAR PARA V1.5. NÃO CRIAR 007+. NÃO IMPLEMENTAR ESCALA GLOBAL. NÃO EXPANDIR FEATURE.
> **Corrigir primeiro:** rotação de segredos + remoção de PII do git (24h) → auth mínima + tenant por token + fechar 5 furos de escopo (7 dias, escopo V1.4.1 do doc 08).

O hotfix P0 de *runtime* (renderers/SW) está resolvido. O **P0 de perímetro** (auth/PII) é o novo bloqueador — e é maior.

---

*Red Team conduzido em 2026-07-10 sobre o corpus das auditorias de domínio e o código real em `backend/src/`, `supabase/migrations/001–006`, PWA raiz e `docs/`.*
