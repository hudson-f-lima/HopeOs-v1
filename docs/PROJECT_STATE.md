# PROJECT STATE — KortexOS / HOPE OS

**Atualizado:** 2026-11-24 · base do PR #63 em `ec19f15` (PR #62). **Fonte canônica do estado operacional.**
Este arquivo guarda o estado, as pendências e o handoff do ciclo atual. A cronologia das decisões (D-001 a D-072) está em [`DECISIONS.md`](DECISIONS.md); o histórico de entregas, em [`../CHANGELOG.md`](../CHANGELOG.md).

## 1. Identificação e produção (conferido em 2026-11-23, só leitura)

| Item | Estado | Evidência |
|---|---|---|
| Banco | Supabase **`hopeos-v1`** (`gsttjozcmdvgstcpadiq`, sa-east-1, Postgres 17), `ACTIVE_HEALTHY` | `list_projects` |
| Migrations em produção | **001–027 todas aplicadas** (a 027 `agendamento_atomico` entrou no merge do PR #58) | `list_migrations` |
| API | Render, serviço `HopeOs-v1`, deploy **live no commit `3358bf8`** desde 2026-11-22 11:26 UTC | `list_deploys` |
| Saúde | `GET /api/health` 200 · `GET /api/health/banco` 200 `banco: ok` · PWA 200 | requisições de 2026-11-23 |
| PWA | GitHub Pages: `https://hudson-f-lima.github.io/HopeOs-v1/` | — |
| Monitoramento | UptimeRobot: API (KeepAlive), app (PWA) e banco (D-059). Chave da API do UptimeRobot trocada pelo dono em 2026-11-22 | D-059 |
| Dados reais | 1 empresa, 8 clientes ativos, 0 telefones duplicados (consulta agregada de 2026-11-22). Contagem de dados de teste: **não executada** | — |

- **Fundação física:** `supabase/migrations/001–027` (rollbacks 007–027). **028+ não autorizada.** Merge na `main` aplica migrations em produção (D-010); toda migration exige linha em `supabase/migrations.lock` e decisão em `DECISIONS.md`. A lista de qual decisão autorizou cada migration está em [`../CLAUDE.md`](../CLAUDE.md).
- **Não misturar:** o projeto `kortex-os-v2-staging` (`hyzoocmmtmjlgdyifwhu`) é de OUTRO projeto. Nunca aplicar migrations, SQL ou configuração do HOPE OS nele (Platform Owner, 2026-10-16).
- **V1.5 e escala global:** BLOQUEADAS. Não avançar com P0 aberto.
- **Agendamento pelo link público:** vem **desligado** (`PUBLIC_BOOKING_LINKS` ausente no `render.yaml`). Ligar exige aviso de privacidade do cliente aprovado, dados do salão no aviso e Red Team com o link ligado (D-014, D-037).

## 2. Estado confirmado

- **D-072 · Inteligência do Painel e Desempenho:** branch isolada sobre `f5d38dc` (PR #63). Gráficos de ocupação e composição financeira, seleção do mês anterior, proteção dos dados econômicos em retenção e simulador com cenários independentes. [Registro de métricas](METRICAS_DASHBOARD.md). Sem migration. Produção e piloto humano pendentes.
- **D-071 · Painel com uma definição por métrica (PR rascunho):** o Painel e o Desempenho distinguem produção realizada, preenchimento da grade e compromissos futuros. Serviços fora do expediente e encaixes contam na produção. Recepção lê os status da agenda para montar o resumo operacional. O ticket da coorte distingue ausência de comandas e valor zero. A publicação e a validação do app instalado em produção seguem pendentes. Sem migration.
  - **Verificação sintética:** PostgreSQL 16.15 e PostgREST 12.2.12 com as 27 migrations. Dez cenários de ocupação, dois fechamentos pela RPC e reenvio idempotente. Permissões de API testadas com autenticação simulada.
  - **Medição HTTP local:** 5.600 agendamentos e 4.200 comandas em memória. Para o gestor, os corpos das chamadas automáticas do Painel passaram de 7.255.204 para 49.563 bytes e a mediana de 1.025 para 777 ms. Para a recepção, de 24.713 para 25.889 bytes e de 632 para 572 ms. Doze rodadas por papel, após três aquecimentos. Na consulta isolada de Desempenho mensal, a mediana passou de 23,27 para 49,82 ms (30 rodadas após cinco aquecimentos); os novos diagnósticos elevaram o custo. Tempo até pintar a tela e custo físico do banco em produção seguem desconhecidos.
- **D-070 · Desempenho do salão:** implementação no Painel e em `GET /api/cockpit/desempenho`. Base de integração `184b3fa` (PR #61). Validação de implantação em produção pendente.

| Área | Estado | Evidência |
|---|---|---|
| Autenticação por usuário (JWT Supabase Auth) | **REAL em produção** (login, `/me`, catálogo validados em 2026-11-10; sem revalidação completa depois) | `routes/auth.js`, identity-gate, `smoke.js` |
| Token legado `API_ACCESS_TOKEN` | **Informado desligado** em produção (`LEGACY_TOKEN_AUTH_ENABLED=false`, Platform Owner, 2026-11-22). NÃO verificado por requisição | `render.yaml`, identity-gate C01/C03 |
| Login social, por link e por código (D-056) | REAL no código, **atrás de flags `AUTH_*_ENABLED`**, desligadas até haver prova externa. Provedores e SMTP reais **NÃO validados**; nenhuma aprovação de produção ou multi-tenant decorre dele | `planning/AUTH_PWA_IMPLEMENTACAO.md` |
| Trigger `auth.users → app_users` (007) | **PARCIAL**: espelha o usuário (caminho feliz coberto pelo gate), mas **falha ao recriar uma conta com e-mail já usado** por um usuário removido do Auth (REAL no Postgres local; Supabase real DESCONHECIDO). Correção exige migration 028+, não autorizada | `audit/TRIGGER_AUTH_USERS_2026-11-23.md` |
| Principal de integração (credencial, scopes, rotação, auditoria) | REAL no código; uso em produção DESCONHECIDO | `auth/credentials.js`, identity-gate I01–I10 |
| RBAC (4 papéis) + permissões individuais (012) | REAL — `authorize()` em toda rota de negócio | `auth/rbac.js`, `docs/PERMISSOES.md`, gates S04/C05 |
| Tenant por identidade (membership; `X-Empresa-Id` só seletor) | REAL no código | identity-gate U06–U08 |
| **Multi-tenant seguro** | **BLOQUEADO**: falta Red Team em produção com mais de uma empresa | `AGENTS.md` |
| Unidades | PARCIAL: acesso por unidade resolvido e fail-closed; dados de negócio ainda sem `unit_id` | ADR-005 |
| Agenda sem corrida | REAL: horário duplicado fechado no banco (007); escala × reserva (026); link público e remarcação atômicos (027) | `concurrency_*.sh`, `gate_026/027.sql` |
| Disponibilidade, escalas, regras e política de horários | REAL (013–015, 023–025) | gates SQL, E2E `escalas`, `agenda-politica-espera` |
| Atendimento com vários serviços, recorrência, link pessoal do cliente | REAL (017–019) | gates, E2E |
| Lista de espera compatível e baixa atômica (opção C) | REAL (025, D-060) | `agenda-confiavel-gate` 19/19 |
| Comanda, caixa, estorno com ledger imutável, comissão paga, caixa salvo | REAL no código e nas migrations (009–010). Em produção, só **leituras** validadas (2026-11-10); escrita real não registrada | gates, `smoke.js` |
| Metas e ranking | REAL (011) | gate_011 |
| Assinaturas: planos, assinantes, cobrança **manual**, uso na comanda, comissão e margem por plano | REAL (021–022, D-044/045). **Cobrança recorrente automática: AUSENTE** (exige fornecedor de pagamento) | D-042..045 |
| **Cockpit do gestor** (`/api/cockpit`) | REAL (D-064): faturamento × meta, margem, ocupação, recorrência, alertas com porquê e ação | `cockpit-gate` 12/12, E2E `cockpit` |
| Painel sem número inventado | REAL (D-065): sem score, sem ações de enchimento, sem faixas de mercado não verificadas | `correcoes-gate` J14/J14b |
| Lembretes por push | REAL no código (020); **desligado**: faltam as chaves VAPID no Render | D-041 |
| WhatsApp e SMS automáticos | **AUSENTE**: canais pré-configurados e desligados; faltam fornecedor e o campo "não quero receber mensagens" (migration) | `notifications/canais.js` |
| Cobrança de sinal, Pix, cashback, NFS-e | **AUSENTE**: exigem gateway, contador e parecer jurídico | `planning/INTEGRACOES_FUTURAS.md` |
| `DEFAULT_EMPRESA_ID` | HARDCODED: usado só pelo principal legado | `middleware/auth.js` |
| `doctor.js` (ferramenta de ops) | PARCIAL: verifica só as tabelas das migrations 001–009; não conhece 010–027. Use `list_migrations` | `backend/scripts/ops/doctor.js` |
| `test:gate` integrado (Supabase real) | DESCONHECIDO: não roda no CI; último resultado registrado é de 2026-07-12, anterior à 007 | — |
| Backup automático em produção | **AUSENTE**: ferramentas e teste de restauração existem (D-021); a rotina diária foi adiada pelo dono | `RUNBOOK_BACKUP.md` |

## 3. Entregas recentes (detalhe em `DECISIONS.md`)
- **D-080 (26/11, PR rascunho):** legenda dos ícones no modal do card (fechada por padrão), estrela amarela, "$" verde do pago e agenda com 2 profissionais por vez no celular (o resto ao lado, com indicador). Sem migration.
- **D-079 (25/11, PR #75):** a lista de horários livres do app (recepção e profissional) passa a usar a grade por duração do link (D-069), sem a grade do salão + bordas. Corrige também "1 faltas seguidas". Sem migration.
- **D-078 (25/11, PR #74):** arrastar e soltar da agenda (cards etapa 3): card inteiro como alça, prévia com início–fim e profissional, ocupado não muda nada e diz por quem, desfazer por 8 s no servidor, teclado e rolagem na borda. Passo do salão fica pendente. Sem migration.
- **D-077 (25/11, PR #73):** card novo da agenda (cards etapa 2): 7 ícones calculados no servidor (`GET /agenda?marcadores=1`), situação no canto, concluído e pago acinzentado + chanfro, cor suave. Sem migration.
- **D-076 (25/11, PR #69):** recorrência com encaixe fora da escala para quem tem agenda:encaixar (conflito continua de fora). Substitui em parte a D-039. Sem migration.
- **D-074 (25/11, PR #66):** agenda com grade do tamanho do dia (encaixe às 07:00 ou depois das 20:00 aparece) e selo "N fora da escala". Etapa 1 do projeto dos cards. Sem migration.
- **D-069 (23/11, PR #61):** no link público (reserva e remarcação), a grade parte do início de cada janela livre e anda pela duração efetiva do serviço; a recepção mantém a grade do salão. Interpretação da D-054 registrada. Sem migration.
- **D-068 (23/11, PR #60):** no link público, o cliente revisa fim, duração, preço e prazo de cancelamento antes de confirmar; se algo mudar até o envio, `OFERTA_ALTERADA` sem gravar; envio travado contra toque duplo. Sem migration.
- **D-067 (23/11):** os 41 documentos históricos de julho foram movidos para `docs/historico/` sem alterar um byte; PR #15 (rascunho de julho da 007) fechado; achado do trigger `auth.users` registrado (P2, abaixo).
- **D-066 (23/11):** revisão semântica de toda a documentação (este arquivo reescrito, `CODEX.md`, `INDEX.md`, `ROTAS.md` gerado, 12 arquivos obsoletos removidos).
- **D-065 (23/11):** Painel sem número inventado; `kpis.ocupacaoPct` virou `realizadosPct`.
- **D-064 (22/11):** Cockpit do gestor.
- **D-063 (22/11):** migration 027, agendamento público e remarcação atômicos; HS412 de `agendamento_criar` passou a responder 409 em vez de 500.
- **D-062 (22/11):** senha até 72 bytes, teto diário do link só do dia, aviso de nome parecido no cadastro.
- **D-056 (17/11):** correção de identidade e sessão da PWA (login social/link/código por flag, SDK oficial, prova recente para trocar senha). Detalhe e provas em `planning/AUTH_PWA_IMPLEMENTACAO.md`.
- **D-061 (22/11):** E2E com navegação comum (`backend/tests/e2e/navegacao.js`).
- **D-060 (21/11):** lista de espera, opção C. **D-059:** saúde do banco. **D-058:** migration 026. **D-054..D-057:** política de horários, agenda confiável, comandas.
- Anteriores (D-016 a D-053): comissão, assinaturas, escalas, regras da agenda, link do cliente, permissões, estorno, metas. Ver `DECISIONS.md`.

## 4. Evidências de produção datadas
- **2026-11-08:** migrations 001–008 aplicadas pela integração GitHub no merge do PR #16; verificação do runbook 12/12 `true`; advisor de segurança só com INFO "RLS sem policy" (deny-all intencional).
- **2026-11-10:** produção publicada e validada por `smoke.js`, leituras reais da API e Playwright (login, assistente, dashboard, comandas/estorno, lembretes, logout; zero erro de console).
- **2026-11-15:** migrations 012 e 013 aplicadas no merge do PR #29 (a do PR #28 falhou antes de executar SQL, por timeout da API do Supabase). Conferido: histórico 001–013, unidade ter–sex 09–12/13–19 e sáb 08–12/13–18, 3 profissionais com escala publicada, tabelas e funções sem acesso de `anon`/`authenticated`. O WARN de `search_path` em duas funções da 013 foi corrigido pela 014 (D-034).
- **2026-11-16:** Red Team em produção da C1 (link online por salão), com o link desligado: nenhum achado crítico ou alto. RTP-01 corrigido (limite por IPv4 `/24`). Ver `audit/RED_TEAM_2026-11-16_PRODUCAO_C1.md`.
- **2026-11-23:** 001–027 aplicadas; API, banco e PWA respondem 200.

## 5. Riscos aceitos (Platform Owner)
- **PWA no GitHub Pages:** CSP no `<meta>` desde D-052, mas sem cabeçalhos HTTP de segurança; o Pages publica o repositório inteiro. Aceito no piloto. Migrar para o site estático do Render (CSP do `render.yaml`) **antes de clientes pagantes**: muda URL do app, CORS e Redirect URL do Supabase.
- **Infra gratuita:** Supabase Free pausa após ~7 dias sem atividade e não tem backup baixável; Render Free dorme quando ocioso. Resolver antes do primeiro cliente pagante.
- **Risco trabalhista** de metas, ranking e indicadores por colaborador aceito pelo dono sem parecer jurídico (D-019, D-029). Prêmio em dinheiro, ligas e distribuição de clientes por desempenho seguem fora.
- **Node:** `engines.node = 22.x` (igual ao CI). Confirmar no log do próximo deploy que o Render usa Node 22.

## 6. Bloqueadores e pendências
- **P0:** nenhum conhecido no código.
- **P1 (dono, no GitHub):** tornar os três checks de CI obrigatórios na proteção da `main` (**aprovado em 2026-11-22; configuração não confirmada**). Sem isso, a trava de migrations só avisa. Checks: `Gates offline (sem Supabase)`, `E2E da PWA (Playwright + CSP do render.yaml)`, `Migrations + gates SQL (Postgres 16)`.
- **P1 (dono, no Supabase):** ligar a proteção contra senhas vazadas (advisor WARN).
- **P1 (dono, no Render):** chaves VAPID para o lembrete por push; decidir sobre os serviços duplicados suspensos (`hopeos-v1-rvo9`, `hopeos-v1-frontend`, `Kortex_*`); `NODE_ENV=production` em minúsculas (HSTS) e `APP_PUBLIC_URL` (status destes dois itens não verificado nesta revisão).
- **P1:** trocar a senha do AppBarber (o dono mantém até terminar a leitura dos cadastros).
- **P1:** teste de ponta a ponta com dado real em produção (cliente → agendamento → comanda → caixa → ganhos → estorno → CSV). Escrita real em produção nunca foi registrada como exercitada.
- **P2:** 41 FKs sem índice (INFO); unidades sem particionar dados; autoria de integração em estado mutável; `doctor.js` sem as migrations 010–027; **trigger `auth.users → app_users` falha ao recriar e-mail já usado** (mitigação: desativar usuários pelo app, não excluir no painel do Supabase Auth; ver `audit/TRIGGER_AUTH_USERS_2026-11-23.md`).
- **BLOQUEADO — rede de unidades (D-073).** Direção aprovada: uma empresa (rede) com várias unidades, cada uma podendo ter CNPJ próprio, e assinatura "multi" válida em qualquer unidade. Fica para a V1.5. Antes: regra de repasse entre CNPJs com o contador e validação jurídica do aviso de privacidade por unidade. Desde já, tabela nova de operação prevê `unidade_id`.
- **BLOQUEADO — comandas abertas e venda interna persistentes (D-057).** Contrato proposto para revisão: criação retorna ID, versão, empresa, unidade, autor e tipo de comprador (cliente ou profissional). Listagem autorizada inclui abertas de dias anteriores; detalhe carrega os itens e a revisão. Edição envia a revisão que o operador viu, conflito preserva as duas intenções para conferência. Fechamento transacional consome uma única revisão, usa chave por operação e grava o vínculo com a venda. Comprador, profissional executor, vendedor e operador têm identidades separadas. Regras de acesso, cancelamento, preços e eventual liquidação interna exigem decisão do proprietário. Persistência depende de autorização específica para a migration. A UI atual oferece somente fluxo de cliente e dados já registrados. Rascunho do editor vive na aba e o journal persiste tentativas de fechamento incertas.
- **Decisões abertas (dono):** fornecedor de pagamento da assinatura (GalaxPay ou outro); fornecedor de WhatsApp; migration 028 (campo "não quero receber mensagens" e aniversário); ficha do cliente; leitura dos cadastros do AppBarber (capturas de tela); parecer jurídico para dado de saúde antes de guardar alergia ou anamnese; infra paga antes do primeiro cliente.
- **PRs abertos:** #59 (esta documentação) e #53 (agendamento online, grade por duração, rascunho). O #15 (rascunho de julho sobre a migration 007) foi **fechado em 2026-11-23** (D-067); a branch `codex/fase1-identidade-minima` foi mantida.
- NFS-e é obrigatória para ME/EPP do Simples desde 2026-11-01: o salão piloto precisa do contador emitindo (o CSV do Painel é o apoio).

## 7. Gates (como verificar; os números vêm do CI do último commit)
| Gate | Comando | Observação |
|---|---|---|
| Suíte offline | `cd backend && API_ACCESS_TOKEN=x SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=x npm run test:offline` | Sem Supabase. Os três valores fictícios são exigidos (sem eles, o auth-gate dá 503). CI: "Gates offline" |
| E2E da PWA | `NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js` | 42 roteiros sob a CSP de produção, zero erro de console. CI: "E2E da PWA" |
| Migrations + gates SQL | `su postgres -c "cd <repo> && WITH_ROLLBACK=1 supabase/tests/run.sh"` | Postgres 16 limpo: 001–027, gates `gate_007..027`, concorrência (agenda, estorno, atendimento, link público), controles negativos, ciclo de rollback. CI: "Migrations + gates SQL" |
| Trava de migrations | `bash supabase/tests/check_migrations.sh` | Lock confere 001–027; reprova migration editada, apagada ou não autorizada |
| `npm audit --omit=dev` | `cd backend && npm audit --omit=dev` | 0 vulnerabilidades em 2026-11-08 (D-011). `xlsx` com HIGH sem correção, só em scripts locais |

## 8. Handoff (ciclo de 2026-11-21 a 2026-11-23)
- **Concluído:** migrations 025–027; agenda confiável (D-055, D-058, D-060); saúde do banco e monitores (D-059); E2E com navegação comum (D-061); Onda 1 e Onda 2 do Blueprint v2 (D-062, D-063); Cockpit (D-064); Painel sem número inventado (D-065); revisão semântica da documentação (este ciclo).
- **Para o próximo agente:** leia `AGENTS.md`, `CLAUDE.md`, `docs/INDEX.md` e este arquivo. Para código, leia também `CODEX.md`. Uma prioridade por vez.
- **Não fazer:** migration 028+ sem autorização registrada; tocar 001–027; executar SQL em produção; declarar produção aprovada sem Red Team; apagar auditorias, prompts históricos ou evidências do dono (regra do `AGENTS.md`); colocar segredos, credenciais do AppBarber ou dado pessoal em arquivo, commit ou PR.
- **Ordem recomendada do que vem:** painel e cockpit já estão no ar → chaves VAPID e lembrete por push → migration 028 (consentimento e aniversário) → WhatsApp automático (fornecedor) → cobrança recorrente da assinatura (fornecedor + Red Team + período em paralelo).
