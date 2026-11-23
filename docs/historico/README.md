# docs/historico — o que foi planejado e auditado em julho de 2026

> **Esta pasta NÃO representa o estado atual do projeto.** O estado vale em [`../PROJECT_STATE.md`](../PROJECT_STATE.md).

## O que é
41 arquivos da fase anterior (V1.0 a V1.4 e visão KortexOS 5.1): auditoria global, Red Team, prompts, blueprints, planejamento de SQL e as referências SMART_FLOW 4.0. Foram movidos para cá em 2026-11-23 (D-067), a pedido do Platform Owner, **sem alterar um byte** (`git` os registra como renomeação 100%). Ficam preservados porque o `AGENTS.md` proíbe sobrescrever ou comprimir auditorias, prompts históricos e evidências do dono.

Para achar o caminho original de qualquer arquivo: `git log --follow -- docs/historico/<caminho>`.

| Antes | Agora |
|---|---|
| `docs/audit_global/` (14) | `historico/audit_global/` |
| `docs/canon/` (4) e `docs/architecture/` (1) | `historico/canon/`, `historico/architecture/` |
| `docs/redteam/` (1) e `docs/prompts/` (1) | `historico/redteam/`, `historico/prompts/` |
| `docs/legacy/` (5) e `docs/archive/` (9) | `historico/legacy/`, `historico/archive/` |
| `docs/planning/KORTEXOS_5_1_*` (3) | `historico/planning/` |
| `docs/FRONTEND_V1_3_*` (2) e `docs/RENDER_DEPLOYMENT_VALIDATION.md` | `historico/` |

## O que NÃO vale mais (não use como fato)
- "A base real do banco são as migrations 001–006" e "a faixa 007+ é reservada ao KortexOS 5.1": hoje a base é **001–027**, todas em produção, e a faixa 007+ foi usada pelo HOPE OS.
- "A numeração 046–060": obsoleta.
- O projeto Supabase `qosioymzswhkqkziocas`: não existe mais; a produção é `hopeos-v1` (`gsttjozcmdvgstcpadiq`).
- O `API_ACCESS_TOKEN` como autenticação do sistema: hoje é JWT do Supabase Auth com RBAC; o token legado está desligado em produção.
- Contagens de testes (73/73, 82/82, 94/94 e outras), regras de "zero migration" do escopo V1.4 e qualquer "PENDENTE" de produção.
- "Não avançar para migrations 007+": já foram autorizadas e aplicadas, uma a uma, em `../DECISIONS.md`.

## O que ainda pode ter valor
- **A visão do dono em julho.** O Master Briefing 5.1 (`canon/`) já fala de Yield, Smart Gap, Reliability Score, no-show progressivo e Trust Pass, que têm vocabulário parecido com o M11 e o M12 do Blueprint v2 (`../planning/BLUEPRINT_MASTER_V2_ANALISE.md`). Não foram comparados em detalhe.
- **O registro de Red Team e de auditoria** de cada etapa, com data.
- **Benchmarks de mercado** (`canon/`), a conferir antes de citar como referência (D-065 removeu faixas de mercado não verificadas do Painel).

## Limitações conhecidas
- Quatro links relativos dentro destes arquivos ficaram quebrados pelo movimento, porque apontam para documentos que continuam em `docs/`, um nível acima: `audit_global/00_STATUS_EXECUCAO.md` e `audit_global/11_PRODUCTION_DEPLOYMENT_TAREFA_A.md` (`../PROJECT_STATE.md`), `planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md` e `planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md` (`../INDEX.md`). O conteúdo foi mantido intacto de propósito.
- Alguns destes arquivos citam por nome documentos que já foram removidos do repositório (os de V1.2 a V1.4, na D-066). Eles continuam no histórico do Git.

## Regras
Não edite estes arquivos. Não os use como fonte de estado. SQL dentro deles é rascunho e **nunca** deve ser executado.
