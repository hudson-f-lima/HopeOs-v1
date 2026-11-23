# KortexOS / HOPE OS — Índice documental

Este arquivo é só índice. O estado operacional está em [`PROJECT_STATE.md`](PROJECT_STATE.md). Atualizado em 2026-11-23.

## 1. Comece por aqui (ordem de leitura)
1. [`../AGENTS.md`](../AGENTS.md): regras permanentes para agentes (bloqueios, classificação de achados, formato de entrega).
2. [`../CLAUDE.md`](../CLAUDE.md): contexto permanente e limites operacionais (regras invioláveis, autorização de cada migration).
3. [`../CODEX.md`](../CODEX.md): guia para agentes de código (como rodar, testar, entregar; armadilhas já pagas; trabalho em paralelo).
4. [`PROJECT_STATE.md`](PROJECT_STATE.md): **estado atual**, pendências, bloqueadores e handoff. Única fonte de estado.
5. [`../README.md`](../README.md): apresentação, instalação e estrutura do repositório.

## 2. Decisões e histórico de entregas
- [`DECISIONS.md`](DECISIONS.md): decisões D-001 a D-067, cada uma com autorização, escopo e evidência.
- [`../CHANGELOG.md`](../CHANGELOG.md): entregas concluídas, da mais nova para a mais antiga.
- [`adr/ADR-005-identity-tenant-rbac-actor.md`](adr/ADR-005-identity-tenant-rbac-actor.md): identidade, tenant, RBAC e autoria (aprovada e implementada).

## 3. Contratos e referência técnica
- [`ROTAS.md`](ROTAS.md): **todas as rotas da API com a permissão de cada uma** (gerado do código; regenerar ao mudar rotas).
- [`API_CONTRACT.md`](API_CONTRACT.md): formato das respostas, validações e erros por área.
- [`PERMISSOES.md`](PERMISSOES.md): matriz de permissões por papel (gerada de `backend/src/auth/permissoes.js`; conferida pelo gate).
- [`DATA_CONTRACT.md`](DATA_CONTRACT.md): campos financeiros autoritativos e regra do checkout; a pasta `data/` não é versionada.
- [`SECURITY_PII_POLICY.md`](SECURITY_PII_POLICY.md): nenhum dado pessoal no Git; histórico da limpeza de julho.
- [`../supabase/README.md`](../supabase/README.md): migrations, rollbacks, gates SQL e o que fazer se a integração falhar no merge.
- [`README.md`](README.md): estrutura da pasta `docs/` e fatos de fundação.
- [`../frontend/README_FRONTEND_PATCH.md`](../frontend/README_FRONTEND_PATCH.md): a pasta `frontend/` é histórico (o app real é a PWA da raiz).

## 4. Runbooks
- [`RUNBOOK_MIGRATION_007.md`](RUNBOOK_MIGRATION_007.md): 007 já aplicada; mantém a verificação (§4) e a limpeza de dados (§4.1).
- [`RUNBOOK_BACKUP.md`](RUNBOOK_BACKUP.md): backup e teste de restauração; a rotina diária está adiada pelo dono.
- Skills em [`../.claude/skills/`](../.claude/skills/): `steward` (como trabalhar), `completar-lacuna`, `red-team`, `deploy-producao`, `auditoria-estado`, `avaliar-proposta`, `integracao-futura`, `usabilidade-pwa`, `agendamento-inteligente`.

## 5. Planejamento e análises (novembro de 2026)
SQL dentro destes documentos é **DRAFT ONLY**: o schema real está em `supabase/migrations/`. O status de cada um está no cabeçalho do próprio documento.

| Documento | Situação em 2026-11-23 |
|---|---|
| [`planning/BLUEPRINT_MASTER_V2_ANALISE.md`](planning/BLUEPRINT_MASTER_V2_ANALISE.md) | Ondas 1 e 2 feitas (D-062, D-063); decisões da Onda 3 pendentes |
| [`planning/CADASTROS_PROFUNDIDADE_ANALISE.md`](planning/CADASTROS_PROFUNDIDADE_ANALISE.md) | Análise; decisões do dono pendentes (ficha do cliente, leitura do AppBarber) |
| [`planning/ROADMAP_SUBSTITUIR_APPBARBER.md`](planning/ROADMAP_SUBSTITUIR_APPBARBER.md) | Planejamento; tabela de situação dos 9 itens no topo |
| [`planning/INTEGRACOES_FUTURAS.md`](planning/INTEGRACOES_FUTURAS.md) | Itens 1–3 (pagamento, NFS-e, mensagens) pendentes de fornecedor; 4–5 implementados (D-017) |
| [`planning/ASSINATURAS_DESENHO.md`](planning/ASSINATURAS_DESENHO.md), [`ASSINATURAS_ONDA_A_PLANO.md`](planning/ASSINATURAS_ONDA_A_PLANO.md), [`ASSINATURAS_PACOTES_BENCHMARK_2026-11-16.md`](planning/ASSINATURAS_PACOTES_BENCHMARK_2026-11-16.md), [`APPBARBER_ASSINATURAS_PACOTES_LEITURA_2026-11-16.md`](planning/APPBARBER_ASSINATURAS_PACOTES_LEITURA_2026-11-16.md) | Onda A implementada (D-042 a D-045); cobrança recorrente pendente de fornecedor |
| [`planning/AGENDAMENTO_ONLINE_DRAFT.md`](planning/AGENDAMENTO_ONLINE_DRAFT.md), [`AGENDAMENTO_PONTA_A_PONTA_AUDITORIA.md`](planning/AGENDAMENTO_PONTA_A_PONTA_AUDITORIA.md), [`AVISO_PRIVACIDADE_AGENDAMENTO_DRAFT.md`](planning/AVISO_PRIVACIDADE_AGENDAMENTO_DRAFT.md) | Implementado (C1–C5); link desligado; o aviso é modelo a validar juridicamente |
| [`planning/AGENDAMENTO_INTELIGENTE_ANALISE.md`](planning/AGENDAMENTO_INTELIGENTE_ANALISE.md), [`DISPONIBILIDADE_ESCALAS.md`](planning/DISPONIBILIDADE_ESCALAS.md) | Implementados (D-033, D-035, D-040) |
| [`planning/ESTORNO_COMANDA_DRAFT.md`](planning/ESTORNO_COMANDA_DRAFT.md) | Implementado (009, D-013) |
| [`planning/ONBOARDING_SETUP_ANALISE.md`](planning/ONBOARDING_SETUP_ANALISE.md), [`DESEMPENHO_MARGEM_ANALISE.md`](planning/DESEMPENHO_MARGEM_ANALISE.md), [`BLUEPRINT_BEAUTY_WELLNESS_ANALISE.md`](planning/BLUEPRINT_BEAUTY_WELLNESS_ANALISE.md) | Análises de propostas externas; partes aproveitadas e implementadas (D-008, D-009, D-012, D-023) |
| [`planning/PERMISSOES_POR_PAPEL.md`](planning/PERMISSOES_POR_PAPEL.md) | Desenho original; implementado (D-032, migration 012) |
| [`planning/REDESIGN_PONTA_A_PONTA.md`](planning/REDESIGN_PONTA_A_PONTA.md) | Planejamento do redesign; fases 1 e 2 entregues (D-022) |
| [`planning/AUTH_PWA_IMPLEMENTACAO.md`](planning/AUTH_PWA_IMPLEMENTACAO.md) | D-056: login social, link e código atrás de flags; provedores e SMTP reais não validados |

## 6. Auditorias e Red Team datados (evidência; não sobrescrever)
Cada um descreve o estado **na data do arquivo**. O estado de hoje vale em `PROJECT_STATE.md`.
- [`audit/AUDITORIA_E_BENCHMARK_2026-11.md`](audit/AUDITORIA_E_BENCHMARK_2026-11.md) (08/11) e [`2026-11-10`](audit/AUDITORIA_E_BENCHMARK_2026-11-10.md): auditoria de estado e benchmark global.
- [`audit/RED_TEAM_2026-11.md`](audit/RED_TEAM_2026-11.md) (09/11) e [`RED_TEAM_2026-11-16_PRODUCAO_C1.md`](audit/RED_TEAM_2026-11-16_PRODUCAO_C1.md): Red Team do agendamento online, estorno, auth e PWA; C1 em produção.
- [`audit/AUDITORIA_RECORRENCIA_2026-11-16.md`](audit/AUDITORIA_RECORRENCIA_2026-11-16.md): recorrência que não aparecia na agenda.
- [`audit/COMANDAS_D057.md`](audit/COMANDAS_D057.md): evidências da revisão do checkout e das comandas (D-057).
- [`audit/TRIGGER_AUTH_USERS_2026-11-23.md`](audit/TRIGGER_AUTH_USERS_2026-11-23.md): trigger `auth.users → app_users` falha ao recriar e-mail já usado (P2; correção pendente de autorização).
- [`audit/MELHORES_PRATICAS_GLOBAIS_2026-11-10.md`](audit/MELHORES_PRATICAS_GLOBAIS_2026-11-10.md): práticas de outras disciplinas × HOPE OS.
- Pesquisa e justificativas: [`DILEMA_EXCLUIR_VS_DESATIVAR_SNAPSHOT.md`](DILEMA_EXCLUIR_VS_DESATIVAR_SNAPSHOT.md) (cadastro desativa, não apaga; é o que o sistema faz) e [`AI_MODEL_SELECTION_RATIONALE.md`](AI_MODEL_SELECTION_RATIONALE.md).
- [`promo/README.md`](promo/README.md): kit promocional (rascunho, fora do produto).

## 7. Histórico de julho de 2026 (V1.0–V1.4 e KortexOS 5.1): NÃO representa o estado atual
Tudo em [`historico/`](historico/) (41 arquivos, movidos sem alterar o conteúdo; ver [`historico/README.md`](historico/README.md)). É evidência preservada por regra do `AGENTS.md`: não sobrescrever auditorias, prompts históricos nem evidências do dono. **Afirmações como "base real 001–006", "faixa 007+ reservada ao KortexOS 5.1" e "projeto `qosioymzswhkqkziocas`" são do passado**: hoje a base é 001–027 e a produção é o projeto `hopeos-v1`. O caminho do produto é evoluir o HOPE OS (D-021).
- [`historico/canon/`](historico/canon/) e [`historico/architecture/`](historico/architecture/): visão KortexOS 5.1 (Master Briefing, Benchmark, Proposal, Truth Map, Blueprint).
- [`historico/planning/KORTEXOS_5_1_MIGRATION_MAP.md`](historico/planning/KORTEXOS_5_1_MIGRATION_MAP.md), [`KORTEXOS_5_1_SQL_MASTER_PLANNING.md`](historico/planning/KORTEXOS_5_1_SQL_MASTER_PLANNING.md), [`KORTEXOS_5_1_SQL_MASTER_DRAFT.md`](historico/planning/KORTEXOS_5_1_SQL_MASTER_DRAFT.md): planejamento e SQL do 5.1 (DRAFT ONLY, **nunca executar**; a numeração 046–060 é obsoleta).
- [`historico/redteam/`](historico/redteam/) e [`historico/prompts/`](historico/prompts/): plano de correção e prompt de Red Team do 5.1.
- [`historico/audit_global/`](historico/audit_global/): auditoria global de julho (14 arquivos), incluindo checklists de produção da V1.4.1.
- [`historico/FRONTEND_V1_3_UI_UX_AUDIT.md`](historico/FRONTEND_V1_3_UI_UX_AUDIT.md), [`historico/FRONTEND_V1_3_ADVERSARIAL_AUDIT.md`](historico/FRONTEND_V1_3_ADVERSARIAL_AUDIT.md), [`historico/RENDER_DEPLOYMENT_VALIDATION.md`](historico/RENDER_DEPLOYMENT_VALIDATION.md): auditorias e validação de V1.3 e V1.4.1.
- [`historico/legacy/`](historico/legacy/) (SMART_FLOW 4.0, V1.0 e V1.1) e [`historico/archive/`](historico/archive/): referências históricas e arquivos arquivados.
