# Decisões arquiteturais — KortexOS

## D-001 — Backend como fonte de verdade
- Regras críticas de preço, comissão, estoque, agenda e financeiro permanecem no backend.

## D-002 — Fundação física
- As migrations físicas vigentes são 001–006. Migrations 007+ permanecem não autorizadas enquanto houver P0.

## D-003 — Perímetro de autenticação
- O perímetro atual usa Bearer `API_ACCESS_TOKEN`; não é autenticação final por usuário nem prova de multi-tenant seguro.

## D-004 — `req.auth` como seam para identidade futura
- `req.auth` (empresa_id/user_id/actor_id/role/unit_ids) é populado pelo backend em `requireAuth`, nunca a partir de claims do cliente. Hoje só `empresa_id` tem valor real (vindo de `DEFAULT_EMPRESA_ID`); os demais campos ficam `null`/`[]` para não simular identidade que não existe.
- `actor_id`, RBAC e `unit_id` permanecem BLOQUEADOS até haver migration 007 autorizada (nova coluna/tabela) e um mecanismo real de identidade (JWT/Supabase Auth). Não simular autoria com ator compartilhado.

## D-005 — Modelo canônico de identidade, tenant, RBAC e autoria (proposta)
- Arquitetura completa em [`docs/adr/ADR-005-identity-tenant-rbac-actor.md`](adr/ADR-005-identity-tenant-rbac-actor.md). Status: PROPOSTA, aguardando nova revisão e aprovação do Platform Owner — nenhum código ou migration foi alterado.
- Resumo da decisão: Supabase Auth com JWT para o principal `user`; membership mínimo (`app_users` → `empresa_memberships` → `membership_units`); RBAC por role fixa (enum), sem tabela de permissões genérica; `empresa_id`/`role`/`unit_ids` sempre resolvidos no banco a partir da membership, nunca por claim do JWT ou do cliente; `actor_id` referencia `app_users.id`; autoria modelada por tipo de tabela (evento vs. estado vs. derivada), não como coluna genérica em todas as tabelas; `API_ACCESS_TOKEN` mantido em paralelo até condição de remoção explícita.
- **Correção desta revisão (bloqueio do Red Team):** dois principals formalmente distintos e nunca intercambiáveis — `user` (humano, membership/role/actor_id) e `integration` (servidor-a-servidor, credencial própria em `integrations`/`integration_credentials`/`integration_scopes`/`integration_audit_events`, sem role humana, sem membership, sem `actor_id` de pessoa). Integração nunca reutiliza o `API_ACCESS_TOKEN` global como destino final nem escolhe seu próprio `empresa_id`.
- Migration 007 é apenas desenhada na ADR (tabelas de usuário e de integração, ordem, backfill, rollback) — segue não autorizada para execução.

## D-006 — Sugestão de horários (slots-âncora) sem migration
- Exceção ao bloqueio de "novas features" do `AGENTS.md`, autorizada pelo Platform Owner na sessão de 2026-10-16 ("descartar o que está errado, reaproveitar o que funciona e corrigir"; depois "autonomia máxima").
- Origem: proposta externa (Gemini "Onda 1 Smart Slots"). Aproveitada só a ideia de geometria de agenda; descartados schema paralelo, RPCs `SECURITY DEFINER` com tenant vindo do cliente, fechamento financeiro fora do backend e UI com dados mockados.
- Implementação: motor puro no backend (`SlotEngine`), `GET /agenda/slots` somente leitura, PWA só exibe. Duração efetiva única para sugerir e gravar.
- Não resolve a corrida de double-booking: a garantia definitiva é exclusion constraint no banco (migration 007+, não autorizada).

## D-007 — Migration 007 e implementação da ADR-005
- Autorizada pelo Platform Owner em 2026-10-16 (resposta explícita: "Criar, testar e aplicar em prod"). Fundação física passa a ser 001–007; 008+ segue não autorizada.
- Implementação: identidade (`app_users`), membership/RBAC por role fixa, unidades, principal de integração separado, autoria por categoria de tabela, agenda atômica e fechamento de `anon`/`authenticated` com RLS deny-all. Desvios e limites registrados no Status da ADR-005.
- Produção: aplicação PENDENTE — a sessão não tinha acesso ao projeto Supabase de produção e o backend no Render estava suspenso. Procedimento, verificação e rollback em `docs/RUNBOOK_MIGRATION_007.md`.
- `API_ACCESS_TOKEN` continua aceito (flag `LEGACY_TOKEN_AUTH_ENABLED`) até adoção medida de 100% e nova autorização.

## D-008 — Assistente de configuração (Onda A) sem migration
- Autorizado pelo Platform Owner em 2026-11-08 ("Autorizo a Onda A, pode implementar"), a partir da análise `docs/planning/ONBOARDING_SETUP_ANALISE.md`. Exceção ao bloqueio de "novas features", como D-006.
- Escopo: 6 fases (dados, horários, pagamentos, cardápio por nicho, equipe com ajustes, simulação) usando só tabelas existentes; `GET/PATCH /api/empresa` passa a existir.
- Progresso derivado dos dados (sem coluna de estado): retoma em qualquer aparelho e não diverge do cadastro. "Fazer depois" vale para a sessão do navegador.
- A simulação usa `/checkout/preview`: nunca grava no ledger.
- Fora do escopo (Ondas B/C, não autorizadas): CNPJ/salão-parceiro, buffer, cargos, comissão por categoria, régua de faltas, sinal, gateway, overtime.

## D-009 — Onda B e migration 008
- Autorizadas pelo Platform Owner em 2026-11-08 ("Autorizo a Onda B e a migration 008"). Fundação física passa a 001–008; 009+ segue não autorizada.
- Escopo: CNPJ (com dígito verificador), razão social, salão-parceiro; buffer de higienização (0/5/10/15) respeitado na sugestão de horários e no `agendamento_criar` (redefinido na 008); cargos e categorias; herança da comissão (ajuste do profissional → cargo ou categoria pelo `modelo_heranca` do serviço → comissão do serviço, que sempre existe); régua de faltas só como alerta; relatório de cota-parte do mês.
- Fora: coluna de estado do onboarding (o progresso continua derivado dos dados, D-008); cobrança de sinal, gateway, overtime e máquina própria (Onda C, não autorizada).
- `FIXED_SERVICE` é o padrão de `modelo_heranca`: serviços existentes mantêm exatamente a comissão atual.

## D-010 — Migrations em produção pela integração GitHub do Supabase
- Contexto (2026-11-08): o Platform Owner reativou o `hopeos-v1` e ligou a integração GitHub do Supabase ("Deploy to production" na `main`, working directory `.`). Só tinha acesso pelo celular, e lá o conector do Supabase não mostra a confirmação de SQL destrutivo. Por isso aplicar pelo SQL Editor ou pelo conector não funcionava. O Platform Owner pediu o merge do PR #16.
- Feito: o histórico `supabase_migrations.schema_migrations` foi alinhado aos nomes dos arquivos. Antes estava `20261016…`, gravado pelo conector. Depois ficou `001`…`005`. A mudança mexeu só no registro, não no schema, e foi validada antes com a Supabase CLI 2.122.1 num Postgres local no mesmo estado. Com o merge do #16 (`5cff579`), a integração aplicou 006, 007 e 008. A verificação do runbook deu 12/12 `true` e o advisor de segurança só traz INFO "RLS sem policy", que é o deny-all esperado.
- Consequência: **merge na `main` passa a executar SQL em produção.** A regra "não executar SQL sem autorização" agora inclui o merge de qualquer arquivo em `supabase/migrations/`.
- Trava: `supabase/migrations.lock` guarda o sha256 de cada migration autorizada e a decisão que a autorizou. `supabase/tests/check_migrations.sh` roda no CI e falha em migration nova sem linha no lock, em migration já aplicada que foi editada, em arquivo apagado e em nome fora do padrão `NNN_nome.sql`. Autorizar uma migration nova = adicionar a linha no lock no mesmo PR, citando o D-xxx.
- Limite: a trava só bloqueia o merge se o check estiver como obrigatório na proteção da `main` (GitHub → Settings → Branches). Isso é PENDENTE do Platform Owner. Sem essa proteção, o check só avisa.

## D-011 — Auditoria de estado, correções de segurança e lembretes de confirmação
- Pedido do Platform Owner em 2026-11-08: "Rodar uma auditoria de estado do software, desenvolva as habilidades necessárias e complete o software; faça um benchmark global e cross-indústria". Relatório: `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md`.
- Escopo executado (sem migration, sem fornecedor, sem Onda C):
  - dependências de produção sem vulnerabilidade (`express` 4.22.3, `morgan` 1.12.1; `xlsx` só em dev);
  - CORS por origem exata;
  - máquina de estados mínima da agenda: `concluido`/`fechado`/`reagendado` são finais;
  - lembretes de confirmação via wa.me (`GET /api/agenda/lembretes` + tela na Agenda).
- Por que lembrete manual e não automático: o envio automático exige fornecedor (WhatsApp Cloud API, custo por conversa, templates aprovados). No estudo citado no relatório, o lembrete feito pela equipe teve resultado igual ou melhor que o automático. É reversível e não custa nada.
- Fora (registrado como lacunas priorizadas no relatório): estorno de comanda e pagamento de comissão (exigem migration 009+); agendamento online pelo cliente; fechamento de caixa; sinal/clube/Pix (Onda C); NFS-e (fornecedor).

## D-012 — Blueprint Beauty & Wellness: análise, presença, fechamento de caixa e KPIs do piloto
- Pedido do Platform Owner em 2026-11-08, com dois blueprints externos: "Analise e desenvolva e2e, fix os pontos cegos". Análise em `docs/planning/BLUEPRINT_BEAUTY_WELLNESS_ANALISE.md`.
- Execução em agentes paralelos: A (caixa), B (KPIs), C (segurança + E2E no CI) e D (desenhos). O supervisor revisou, integrou e validou.
- Entrou (sem migration, sem fornecedor):
  - máquina de estados completa da agenda, com presença (check-in → na cadeira);
  - checkout recusa gorjeta negativa e desconto acima do total;
  - data/hora da comanda definidas pelo servidor no fuso da empresa (antes, UTC do Postgres ou data enviada pelo cliente);
  - `GET /api/caixa/fechamento` (só leitura);
  - `GET /api/relatorios/piloto` (falta, reagendamento no checkout, retorno do cliente novo e confirmação prévia, por salão e por profissional, sem bônus);
  - `tabular-nums`;
  - desenhos DRAFT de estorno (009) e de agendamento online.
- Rejeitado da spec: trava de agenda condicionada a sinal pago (não protege a maioria dos horários; enum inválido) e `process_checkout_atomic` (sem tenant, sem idempotência, `UPDATE` sobre o registro).
- Não fazer sem parecer trabalhista: gamificação com prêmio, metas e bônus, 360°/9-box, distribuição de clientes por desempenho (risco de descaracterizar a parceria da Lei 13.352/2016).

## D-013 — Migration 009: estorno de comanda e ledger imutável
- Autorizado pelo Platform Owner em 2026-11-09 (escolha "Estorno de comanda"), com merge autorizado "quando estiver verde". Fora: presença com horário, ficha técnica.
- Modelo: lançamentos inversos em 4 tabelas próprias (`comanda_estornos`, `_itens`, `_pagamentos`, `_gorjetas`), linha negativa `estorno_pagamento` em `caixa_movimentos` na data do estorno, tipo de estoque `devolucao`, RPC `comanda_estornar` (security definer, advisory lock por comanda, idempotência por chave + md5 do payload, papel conferido no banco).
- Padrões adotados (recomendados no desenho; revisáveis pelo Platform Owner):
  - só admin/gestor estornam (`checkout:estornar`, userOnly; token legado e integração não estornam);
  - comissão e cota-parte entram no mês do estorno;
  - prazo de 30 dias da data da comanda;
  - a agenda não muda;
  - o salão absorve a taxa da maquininha;
  - no parcial a gorjeta fica, no total é revertida;
  - comanda de dia anterior é estornada com lançamento hoje (`APP_TIMEZONE`).
- **Ledger imutável por trigger** (update/delete/truncate) em comandos, itens, pagamentos, gorjetas, caixa, estoque e tabelas de estorno. `service_role` perde update/delete nelas. Consequência intencional: `clear-test-data` e exclusão de empresa/produto/comanda com histórico exigem SQL autorizado (RUNBOOK §4.1).
- Relatórios descontam o estorno no dia/mês do estorno: financeiro, dashboard, insights de margem e fluxo de caixa, cota-parte, fechamento de caixa. Piloto e retenção não mudam (a visita aconteceu).

## D-014 — Trilha de status da agenda e agendamento online (sem migration)
- Pedido do Platform Owner em 2026-11-09: "Continue o desenvolvimento do software até o final".
- **Trilha:** criação, status, reagendamento, duração e conclusão pelo checkout gravam em `agendamento_eventos` (tabela da 001). A gravação é best-effort e não guarda PII. Rota `GET /api/agenda/:id/historico` e "Histórico" na PWA. O KPI de confirmação prévia passa a ser medido por período quando há trilha.
- **Agendamento online pelo link** (`agendar.html?s=<slug>`, `/api/public/agendar/:slug`):
  - o tenant vem só do mapa `PUBLIC_BOOKING_LINKS` no servidor (opção B do desenho);
  - **desligado por padrão**, e a variável não está no `render.yaml`;
  - tem revalidação de horário no backend, deduplicação sem revelar nome, limites por número, salão e IP, honeypot, recusa genérica para a régua `exigir_sinal` e evento de origem com IP truncado.
- **Para ligar em produção, faltam:**
  - aviso de privacidade aprovado;
  - Red Team;
  - decisão sobre spam sem verificação do número (PARCIAL);
  - decisão sobre o rate limit em memória por instância.

## D-015 — Backend oficial no Render, Red Team, ferramentas de operação e correções
- **Backend oficial (Platform Owner, 2026-11-09, revisado no mesmo dia):** a escolha inicial foi o serviço do Blueprint (`hopeos-v1-rvo9`), mas na operação o Platform Owner manteve **`HopeOs-v1` em `https://hopeos-v1.onrender.com`** (já conectado ao `hopeos-v1`, login validado: 401 para credencial inválida) e suspendeu o rvo9. Oficial = **`https://hopeos-v1.onrender.com`**. Consequência: esse serviço NÃO é gerenciado pelo `render.yaml` — variáveis, build command e headers do site estático são configurados no painel; o `render.yaml` serve de referência.
  - O serviço antigo `HopeOs-v1` (`https://hopeos-v1.onrender.com`, criado à mão) deve ser **suspenso**.
  - Motivo: variáveis, headers e a CSP do site estático passam a vir do `render.yaml` versionado.
  - `config.json`, a CSP do `render.yaml`, a CSP de `agendar.html`, as ferramentas `ops/`, o runbook e as skills apontam para o rvo9.
- **Red Team (Agente H):**
  - CRÍTICOS corrigidos: zeramento do rate limit por spray; XSS no FuzzyField; `?apiBase=` aceito em qualquer host.
  - REAIS corrigidos: IPv6 /64; 9º dígito no celular; cadastros duplicados; PII em log; escapes.
  - Relatório: `docs/audit/RED_TEAM_2026-11.md`. O agendamento online continua desligado até o aviso de privacidade aprovado (`docs/planning/AVISO_PRIVACIDADE_AGENDAMENTO_DRAFT.md`) e a decisão sobre spam e verificação do número.
- **Ferramentas (Agente I):** `backend/scripts/ops/doctor.js`, `bootstrap-admin.js` (simulação por padrão) e `smoke.js`. Recusam o projeto `kortex-os-v2-staging`. Procedimento na skill `deploy-producao`.
- **Correções (Agente J):**
  - checkout valida a máquina de estados da agenda antes de gravar;
  - fluxo de caixa projetado pela data da comanda (antes, todo o histórico caía em hoje);
  - ocupação com o expediente real;
  - insights e retenção no fuso da empresa;
  - memory backend com a idempotência do RPC.

## D-016 — Segunda auditoria + benchmark, ganhos do profissional, saída para o contador e encaminhamento das integrações
- **Pedido (Platform Owner, 2026-11-10):** benchmark global e cross-indústria; corrigir, criar e completar o que está ausente ou parcial; o que depender de integração futura fica encaminhado; verificar pontos cegos; criar as skills para completar o software.
- **Regra aplicada:** só entra o que não exige migration, fornecedor nem custo. O resto vira item de `docs/planning/INTEGRACOES_FUTURAS.md` com contrato, pré-requisitos e aceite.
- **Entregue (sem migration):**
  - `GET /api/relatorios/meus-ganhos` + aba Gestão > Ganhos. Ação RBAC nova `relatorios:proprio` (admin, gestor, profissional com escopo próprio). Fecha o limite "Relatórios do profissional" da ADR-005.
  - `GET /api/relatorios/servicos-prestados` + botão "Exportar para o contador (CSV)". Sem dado de cliente. É apoio à NFS-e, obrigatória para ME/EPP do Simples desde 2026-11-01; o sistema não emite nota.
  - `X-Request-Id` em toda resposta, no corpo do erro 5xx e no log. Erro inesperado (sem status da aplicação) responde `INTERNAL_ERROR` com texto genérico: a mensagem crua da exceção não vai mais ao cliente.
  - Correção: a PWA chamava `/lista-espera` para o profissional (403 a cada abertura) e mostrava a aba "Espera" a quem não pode usar.
- **Não feito, por regra:** pagamento de comissão e fechamento de caixa salvo (migration 010); sinal, Pix e clube (Onda C); emissão de NFS-e e WhatsApp automático (fornecedor); alertas (fornecedor ou tarefa agendada).
- **Skills novas:** `completar-lacuna`, `integracao-futura`, `usabilidade-pwa`.
- **Relatório:** `docs/audit/AUDITORIA_E_BENCHMARK_2026-11-10.md`. Recomendação: parar de construir e fazer o teste de ponta a ponta com dado real.

## D-017 — Migration 010: pagamento de comissão e fechamento de caixa salvo; monitor de produção
- **Autorização (Platform Owner, 2026-11-10):** "desbloquear e implementar todas as funcionalidades ausentes". Interpretação aplicada: autoriza a migration 010 para o que **não depende de fornecedor**. O merge do PR (que executa a 010 em produção, D-010) depende de confirmação explícita.
- **Migration 010** (`010_comissao_pagamentos_caixa_fechamento.sql`, rollback `010_down.sql`, gate `gate_010.sql`):
  - `comissao_pagamentos`: pagamento, vale e estorno. Estorno espelha o original (mesma empresa, profissional e valor), uma única vez, e não se estorna estorno.
  - `caixa_ajustes`: sangria e suprimento com motivo.
  - `caixa_fechamentos`: foto do dia (fundo, esperado, contado, diferença). Fechar de novo grava outra linha; vale a mais recente.
  - As três tabelas são imutáveis (reusam `ledger_imutavel` da 009), com RLS deny-all e `service_role` só com select e insert. Autor humano obrigatório.
- **API:** `GET/POST /api/comissoes/pagamentos`, `POST /api/comissoes/pagamentos/:id/estorno`, `POST /api/caixa/ajustes`, `POST /api/caixa/fechamentos`; `GET /api/caixa/fechamento` passa a considerar fundo e ajustes e a informar o último fechamento. Ações RBAC novas, ambas `userOnly`: `comissoes:pagar` (admin, gestor) e `caixa:operar` (admin, gestor, recepção).
- **Regras:** saldo = ganho acumulado − (pagamentos + vales − estornos). Pagamento não passa do saldo; vale pode (saldo fica negativo). O esperado do caixa é calculado pelo servidor na hora do fechamento; o cliente só informa contado e fundo.
- **Limites conhecidos:**
  - o teto do pagamento é conferido pela API, não pelo banco: duas requisições simultâneas podem passar do saldo (o lançamento fica registrado e pode ser estornado);
  - o dia fechado não é travado: comanda ou ajuste posterior marca o fechamento como "desatualizado" em vez de ser recusado;
  - sangria e suprimento só no dia corrente;
  - parecer trabalhista (piso, vínculo, metas) continua pendente e não é resolvido pelo registro do pagamento;
  - nenhuma das rotas novas rodou contra o Supabase real: os gates usam banco em memória e Postgres local.
- **Monitor:** `.github/workflows/monitor.yml`, a cada 30 minutos: API, login (detecta Supabase pausado) e PWA. Falha gera e-mail do GitHub ao dono.
- **Continua encaminhado (exige fornecedor, conta e chave):** gateway de pagamento/Pix/sinal/assinatura, emissão de NFS-e, WhatsApp automático. Também fora: agendamento online (aviso de privacidade + Red Team), gamificação (parecer trabalhista), multiunidade.
- **Regra de migrations:** passa a ser "não criar 011+, não tocar 001–010". Com autorização do Platform Owner (2026-11-10, "alterar as regras para resolver todo e qualquer conflito"), `CLAUDE.md`, `AGENTS.md` e as skills foram atualizados. Escopo aplicado, de propósito estreito: (1) a faixa de migrations; (2) em `AGENTS.md`, "não implementar novas features" passou a "…sem autorização registrada em `docs/DECISIONS.md`", porque a regra literal contradizia D-016 e D-017. Nenhuma regra de segurança, tenant, `service_role`, SQL ou produção foi afrouxada.
- **Melhores práticas globais:** pesquisa em `docs/audit/MELHORES_PRATICAS_GLOBAIS_2026-11-10.md`. Só diagnóstico; nada implementado a partir dela.

## D-018 — Aviso de privacidade aceito ao criar a conta e entrar; gamificação e metas aprovadas
- **Decisão (Platform Owner, 2026-11-10):** "aviso de privacidade é aprovado ao aceitar criar a conta e login"; "gamificação e metas aprovado".
- **Aviso de privacidade — implementado, sem migration:**
  - No primeiro acesso (logo depois de definir a senha pelo convite, ou no login), a PWA mostra o aviso e só segue com "Li e aceito". "Não aceito" encerra a sessão. A tela de login informa que entrar implica ter lido o aviso.
  - O aceite fica em `app_metadata.hopeos_privacy = {versao, aceito_em}` do usuário no Supabase Auth. `app_metadata` só é alterável pelo servidor (`user_metadata` o próprio usuário altera).
  - Versão em `PRIVACY_NOTICE_VERSION` (padrão `2026-11-10`). Trocar a versão faz todos aceitarem de novo.
  - API: `GET /api/me` devolve `privacidade {versaoAtual, versaoAceita, aceitoEm, pendente}`; `POST /api/auth/privacidade/aceite {versao}` só registra a versão vigente.
- **Limites:**
  - **O aceite cobre a equipe (quem tem conta). Não cobre o cliente do salão**, que agenda pelo link público sem criar conta. O agendamento online já registra o aceite do aviso próprio em cada agendamento (D-014) e continua desligado: faltam os dados do salão no texto (CNPJ, contato), o Red Team em produção e a variável `PUBLIC_BOOKING_LINKS`.
  - O bloqueio é da tela. A API não recusa requisições de quem ainda não aceitou: recusar poderia trancar para fora quem está com a versão antiga do app em cache. Avaliar depois que a versão nova estiver em todos os aparelhos.
  - O texto é um modelo aprovado pelo dono, não um parecer jurídico. O controlador é o salão.
  - Em produção, o admin atual verá o aviso no próximo acesso depois do deploy.
- **Gamificação e metas — aprovadas, não implementadas:** a aprovação remove o bloqueio "sem parecer trabalhista" de D-012 por decisão do dono (o risco de caracterizar subordinação no regime de salão-parceiro continua existindo e passa a ser risco aceito). Falta definir o escopo: metas individuais, ranking entre colegas, prêmio. Meta gravada exige migration 011, que precisa de autorização própria.

## D-019 — Migration 011: metas mensais e ranking; merge do PR #22 e 010 em produção
- **Autorização (Platform Owner, 2026-11-10):** "1. Ok" para o merge do PR #22; "2. Todos" para o escopo da gamificação (metas individuais, ranking da gestão e ranking visível à equipe), depois de informado que meta gravada exige a migration 011. O merge do PR com a 011 depende de confirmação explícita.
- **PR #22 mesclado** (`5592761`). **Migration 010 aplicada em produção** pela integração GitHub: três tabelas com RLS, `service_role` só com select e insert, sem update/delete, e dois triggers de imutabilidade em cada uma (conferido por SQL). Backend novo no ar (`X-Request-Id` presente).
- **Migration 011** (`011_metas_ranking.sql`, rollback `011_down.sql`, gate `gate_011.sql`): tabela `metas` (profissional, mês, tipo `faturamento`|`atendimentos`, alvo; uma por profissional/mês/tipo) e coluna `empresas.ranking_visivel_equipe` (padrão `false`). Meta é configuração: pode ser alterada e removida.
- **API:** `GET /api/metas?mes`, `PUT /api/metas`, `GET /api/gamificacao/ranking?mes`; `PATCH /api/empresa` aceita `rankingVisivelEquipe`. Ações RBAC: `metas:read`, `metas:write` (gestão, só usuário), `ranking:read`.
- **Regras:**
  - o progresso nunca é gravado; sai do checkout, menos os estornos do mês. Só serviço conta;
  - profissional vê só as próprias metas;
  - ranking: a gestão sempre vê, com valores. A equipe só vê se o salão ligar, e recebe posição, atendimentos e proporção do líder — **nunca o valor em reais de um colega**;
  - recepção não vê metas nem ranking;
  - sem prêmio em dinheiro e sem efeito em comissão, agenda ou distribuição de clientes.
- **Risco aceito pelo dono:** metas e ranking entre parceiros são indícios que pesam para caracterizar subordinação no regime de salão-parceiro (Lei 13.352/2016). Não houve parecer trabalhista. Mitigações embutidas: ranking para a equipe desligado por padrão, sem valores de colegas, sem prêmio, sem consequência automática.
- **Não feito:** prêmio, ligas, quiz, avaliação 360°, distribuição de clientes por desempenho, metas da equipe ou do salão.
- **Regra de migrations:** passa a "não criar 012+, não tocar 001–011" (`CLAUDE.md`, `AGENTS.md`, skills), dentro da autorização de 2026-11-10 para alinhar as regras ao que foi aprovado.

## D-020 — Comanda com vários itens e profissionais; produtos nas metas e no ranking
- **Relato do Platform Owner (2026-11-11), primeiro achado de uso real:** no checkout não havia como adicionar mais serviços nem mais produtos. Cenário real: o cliente agenda um serviço e, durante o atendimento, compra serviços extras de outros profissionais e vários produtos; tudo numa comanda só.
- **Diagnóstico:** o backend já aceitava vários itens, cada um com o seu profissional (`POST /checkout/close`, `itens[]`). **A tela é que limitava** a um serviço, um produto e um profissional. As abas "Serviços | Produtos" do checkout eram MOCKADAS: não faziam nada além de escrever no console.
- **Corrigido (sem migration, sem mudança de API):**
  - botão "+ Adicionar à comanda": cada toque inclui o serviço e/ou o produto escolhidos, com quantidade do produto e o profissional que atendeu ou vendeu. Lista de itens com subtotal e remoção. Limite de 50 itens na tela;
  - o fluxo simples (escolher um serviço e simular) continua igual;
  - abas falsas removidas;
  - campo de busca: apagar o texto à mão desfaz a escolha (antes a escolha ficava escondida e ia para a comanda); `setValue(null)` limpa o texto; a lista não fecha mais sozinha quando se volta ao campo em menos de 200 ms.
- **Metas e ranking com produtos (migration 011, ainda não aplicada em produção quando foi alterada):**
  - novo tipo de meta `produtos` (venda de produtos pelo profissional, em centavos);
  - ranking por critério: `servicos`, `produtos` ou `total`; a gestão vê também serviços, produtos e ticket médio de cada um;
  - cada item conta para o profissional gravado nele. Produto sem vendedor não conta para ninguém.
- **"Complementos":** serviço extra vendido durante o atendimento é gravado como serviço do profissional que o executou e já entra em serviços, atendimentos e ticket médio. **Não existe marcação de "extra × agendado"** nem de "quem vendeu" quando é diferente de quem executou. Isso exigiria coluna nova em `comando_itens` (tabela imutável) e, portanto, migration.
- **Limites:**
  - o subtotal da tela usa o preço de tabela do serviço; preço diferenciado por profissional só aparece no resumo vindo do servidor (já era assim);
  - o vínculo com a agenda continua sendo de um agendamento por comanda;
  - **fuso do aparelho:** a PWA calcula "hoje" pelo relógio do aparelho, e o servidor pelo fuso do salão. Aparelho em outro fuso (ou entre 21h e meia-noite de Brasília num aparelho em UTC) vê a agenda do dia errado. Não afeta quem usa o app no próprio salão. Apareceu porque três roteiros antigos falhavam nesse intervalo; o runner de E2E passou a rodar o navegador no fuso do salão. A correção de produto (a tela usar o fuso da empresa) fica em aberto;
  - a migration 011 foi editada depois do primeiro push do PR #23 (novo tipo de meta). É permitido porque ainda não tinha sido aplicada em produção; o hash no `migrations.lock` foi atualizado.

## D-021 — Caminho do produto (evoluir o HOPE OS) e backup diário com restauração testada
- **Contexto (2026-11-11):** o Platform Owner enviou uma especificação de SaaS multi-tenant com outra stack (Next.js, Prisma, NestJS/Fastify, Redis, monorepo). Não foi iniciada: reescreveria o que já está em produção e testado. Sem preferência do dono entre os caminhos, vale a recomendação: **evoluir o HOPE OS** na stack atual. A lista priorizada foi aprovada ("Aprovado").
- **Mapa da especificação × HOPE OS:** isolamento por salão, RBAC, agenda com trava, comissão, caixa, estorno, estoque, portal público (desligado), dashboard e agenda do profissional = REAL. Multiunidade, lembretes e recuperação de inativos = PARCIAL. Cliente com login, recorrência e assinatura, anamnese, pontos/cashback, gateway, sincronização de calendário, NFS-e, Redis e Docker = AUSENTE.
- **Ordem aprovada:** (1) backup com restauração testada; (2) ligar o agendamento público (depende de dados do salão, Red Team em produção e variável no Render); (3) anamnese; (4) gateway de pagamento (depende de fornecedor); (5) cliente com login e fidelidade.
- **Item 1 — PARCIAL:**
  - entregue: `backend/scripts/ops/backup.js` (exporta o schema `public` pelo PostgREST, só leitura), `restore-check.js` (carrega num Postgres limpo e confere contagem, ids e somas em centavos por tabela) e `supabase/tests/backup_restore.sh` no CI, com controles negativos; `docs/RUNBOOK_BACKUP.md`;
  - **não entregue: a rotina diária.** Foi escrita como workflow do GitHub Actions e barrada antes do commit: o repositório é público, o arquivo com dados pessoais dos clientes ficaria baixável por qualquer conta do GitHub (protegido só por frase-senha) e a chave secreta do Supabase teria de ir para o GitHub. Tratar isso como "limite aceitável" foi um erro de julgamento da sessão; é decisão do dono;
  - **decisão pendente do dono:** plano pago do Supabase com backup do provedor (recomendado), rotina no GitHub com repositório privado (exige migrar o site do Pages), ou rotina em repositório público (não recomendado).
- **Backup automático em produção continua AUSENTE.**
- **Adiado pelo Platform Owner (2026-11-11):** "por enquanto não fazer o backup, vamos deixar para outra etapa". O risco (perda total de dados sem cópia fora do Supabase) fica aceito até lá. As ferramentas e o teste de restauração ficam prontos para quando a etapa for retomada.
- **Item 3 (anamnese):** não iniciado. É dado de saúde (dado pessoal sensível na LGPD): exige migration 012 e definição de quem pode ler, antes de qualquer código.
- **Migration 011 conferida em produção** (2026-11-11): tabela `metas` com os três tipos, RLS ligado, sem acesso anônimo, coluna `ranking_visivel_equipe` criada.

## D-022 — Redesign de UI/UX: fase 1 (tokens, modo escuro e cartão "Agora" do profissional)
- **Pedido e aprovação (Platform Owner, 2026-11-11):** redesenhar a interface (moderna, baixa carga cognitiva, adaptada por papel, claro e escuro). A proposta em quatro telas foi aprovada ("Aprovado"); ordem acordada: celular primeiro, desktop depois.
- **Proposta de design:** canvas privado do Claude com quatro telas (recepção e gestor em desktop; barbeiro e comanda no celular). É referência visual, não código.
- **Fase 1 — entregue, sem migration e sem mudança de API:**
  - **Tokens de cor únicos** em `css/app.css`: as ~100 cores fixas do CSS e as do JS viraram variáveis. Primária `#6d28d9` (a anterior, `#7c6af7`, não atingia 4,5:1 como texto sobre branco).
  - **Modo escuro** por `prefers-color-scheme`: só os tokens mudam; nenhum componente tem regra própria.
  - **Tipografia Inter**, títulos em caixa normal, rótulos de campo sem maiúsculas.
  - **Alvos de toque** de pelo menos 44 px em botões, campos e menu inferior; botão principal com 52 px.
  - **Cartão "Agora"** (`js/ui/agora.js`) no topo da Agenda, só para o profissional: atendimento do momento, uma ação principal por estado (chegou → iniciar → concluir e abrir comanda) e os três próximos horários.
  - Correções achadas pelos prints: menu inferior e botões flutuantes com texto branco sobre fundo claro; dias da semana com fundo branco fixo no escuro; diálogo de confirmação com cores fixas; lupa em emoji nos campos de busca.
- **Verificação:** prints em 390×844 nos dois modos para recepção, profissional e admin (agenda, comanda, dashboard, gestão), olhados um a um; E2E `agora` confere fundo claro e escuro, altura do botão e a cor do menu.
- **Não feito nesta fase:** telas de desktop (recepção com grade e gaveta; gestor com indicadores), gaveta de adicionar item com atalhos, atalhos de teclado, esqueletos de carregamento, encurtar o Dashboard (hoje é uma página longa), redesenho de login, cadastros, caixa, estorno e assistente. Emojis ainda aparecem em alguns rótulos.
- **Limite:** os prints foram vistos por quem implementou, em navegador de teste. Aparelho real e leitor de tela não foram testados.
- **Fase 2 — Dashboard curto (2026-11-13, aprovada pelo Platform Owner), sem migration e sem mudança de API:**
  - **"Precisa de você" no topo:** só o que pede ação hoje, calculado do que a tela já carrega — caixa de hoje com comanda e sem fechamento (ou com movimento depois do fechamento), horários de hoje ainda sem confirmação e clientes para chamar de volta. Sem pendência, mostra "Nada pendente agora.".
  - **Resto recolhido** em quatro seções (`<details>`): Indicadores, Pagamentos e repasses, Fechamento de caixa e Comandas do dia. O painel recolhido passou a caber em cerca de uma tela e meia de celular.
  - **Não entrou:** comissão a pagar como pendência (exigiria uma chamada por profissional) e a lembrança de quais seções a pessoa deixou abertas.
  - **Verificação:** E2E `dashboard` (pendência do caixa aparece, o botão abre a seção, some depois do fechamento; seções começam recolhidas; abre por teclado; profissional não vê o painel) e 18/18 roteiros sob a CSP. Prints claro e escuro vistos em navegador de teste, não em aparelho real.


## D-023 — Desempenho e margem por forma de pagamento: adaptação da proposta externa (Onda 1)
- **Pedido (Platform Owner, 2026-11-13):** adaptar ao HOPE OS a proposta "Análise de Desempenho + Margem Variável (PIX vs Crédito)". Análise completa em [`planning/DESEMPENHO_MARGEM_ANALISE.md`](planning/DESEMPENHO_MARGEM_ANALISE.md).
- **Já existia (não refeito):** taxa por forma de pagamento gravada em cada pagamento e rateada por item; três modelos de comissão, um deles sobre o líquido; ocupação por profissional; metas e ranking.
- **Entregue, sem migration e sem mudança no ledger:**
  - **Sugestão de meta** (`GET /api/metas/sugestao`, só gestão): média dos 3 meses fechados anteriores + crescimento ajustável (padrão 5%). Só preenche o formulário; a gestão decide e salva. Sem movimento nos 3 meses, não sugere.
  - **Parcelado como forma de pagamento** (`credito_2x` … `credito_12x`) com **calculadora de taxa efetiva** (`GET /api/formas-pagamento/simular-taxa`): MDR + antecipação pro rata por juros simples, prazo médio de (n+1)/2 meses. É estimativa para preencher a taxa; vale o que for salvo na forma. Nenhuma taxa vem embutida no código.
  - **Painel:** margem por profissional mostra o que fica no salão; novo bloco "Líquido por forma de pagamento" com a taxa paga em cada forma.
  - **Dashboard atualiza ao abrir a aba** (antes só no início, no botão ou depois de uma comanda fechada no mesmo aparelho).
- **Não feito, por decisão pendente ou por risco:**
  - painel de desempenho individual com ocupação e faixas — depende de parecer trabalhista ou de aceite escrito do risco (vínculo em salão-parceiro, Lei 13.352/2016; LGPD art. 20);
  - rótulo "Risco de Desligamento" — não recomendado;
  - proficiência por tempo cronometrado — o dado é o toque no botão, manipulável;
  - comissão obrigatória sobre o líquido — continua escolha por regra de comissão;
  - tabela de MDR por parcelas e campo de parcelas na comanda — exigiria migration 012, não autorizada.
- **Limites:** a fórmula de antecipação é uma aproximação (adquirentes usam dias úteis, D+2 ou juros compostos); conferir com o extrato. Nomes e taxas das formas parceladas dependem de cadastro manual. Verificado em gate (`gamificacao-gate`, 19 testes) e E2E `metas`, com dados de teste.

## D-024 — Taxa da forma de pagamento visível antes de fechar a comanda
- **Decisão (Platform Owner, 2026-11-13):** aprovado o aviso da taxa no fechamento da comanda. Painel de desempenho individual continua fora: o dono não assume o risco trabalhista agora; a inteligência fica em dados financeiros e de volume do caixa.
- **Entregue, sem migration e sem mudança no fechamento:**
  - `POST /api/checkout/preview` passa a devolver `comparativoFormas`: a taxa de cada forma ativa sobre o total da comanda, pela mesma função do fechamento (`feeForPayment`), da mais barata para a mais cara. O fechamento não lê esse campo.
  - Na comanda, depois de "Simular", um aviso abaixo da forma de pagamento: quanto ela custa ao salão, quanto sobra, quanto a mais barata economizaria e um botão "Trocar para …" que troca a forma e simula de novo.
- **Desvio do plano proposto:** o cálculo não é feito no front-end. A tela só mostra o que o servidor calculou (regra: backend é a fonte de verdade do financeiro), e o aviso vale para qualquer forma com taxa, não só parcelado.
- **Quem vê:** todos os papéis que fecham comanda (admin, gestão, recepção e o profissional na própria comanda). Não é exposição nova: a taxa total já aparecia no resumo da comanda para esses papéis.
- **Limites:** com pagamento dividido o aviso não aparece (a taxa total continua no resumo). O aviso só aparece depois de simular, não no instante em que a forma é escolhida. A forma mais barata para o salão nem sempre é a que o cliente pode pagar; o aviso informa, não bloqueia.
- **Verificação:** `onda-b-gate` B90 (valores à mão, forma inativa fora, igualdade com a taxa do resumo) e E2E `comanda` (6x custa 19,64 em 205,00; "Trocar para Pix" zera a taxa; nada é gravado antes de fechar).

## D-025 — Atalhos "Mais vendidos" na comanda e cartão parcelado em lote
- **Pedido (Platform Owner, 2026-11-13):** (1) atalho para criar as formas de 2x a 12x; (2) "redesign da gaveta de adicionar item" com mais vendidos, busca e preservação de estado.
- **Mapeamento:** não existe gaveta de itens. A comanda monta os itens com campos na própria tela (serviço, produto, quantidade, profissional e "Adicionar à comanda"), populados pelo catálogo carregado no login (`state.catalog`, campos `FuzzyField`).
- **Entregue, sem migration e sem mudança no ledger:**
  - **Cartão parcelado em lote** (`POST /api/formas-pagamento/parcelados`, `cadastros:write`): taxas de 2–6x e 7–12x + antecipação → prévia; com `gravar: true` cria as formas que faltam e, nas que existem, muda só taxa e prazo (nome e situação ficam). Tela em Gestão > Pagamentos.
  - **Mais vendidos** (`GET /api/checkout/mais-vendidos`, `checkout:write`): 4 serviços e 2 produtos com mais unidades em comandas dos últimos 90 dias; devolve só ids. A tela mostra os atalhos no topo dos itens da comanda; sem histórico o bloco não aparece.
  - **Um toque:** produto entra direto (1 unidade). Serviço entra direto quando já há profissional escolhido no campo; sem profissional, o serviço fica escolhido e o foco vai para o campo do profissional.
- **Desvios do pedido, e por quê:**
  - Rota `/checkout/mais-vendidos` em vez de `/produtos-servicos/mais-vendidos`, e empresa vinda de `req.auth`, nunca de parâmetro (`tenant_id`).
  - Sem Shadcn/UI: a PWA é JS puro (D-021).
  - **Sem gaveta por enquanto.** Os atalhos ficam na tela, onde já estão os campos: nada se perde ao tocar fora (não há o que fechar) e adicionar um item não ganha um toque extra. A gaveta do desenho aprovado em D-022 continua possível; fica como decisão do dono.
  - "Injetar instantaneamente" não vale para serviço sem profissional: o banco exige profissional em todo serviço (comissão e ledger).
  - **Profissional antes dos atalhos:** o campo do profissional subiu para logo abaixo do cliente; com ele escolhido, cada atalho de serviço entra com um toque.
- **Limites:** a rota lê as comandas e os itens da empresa inteiros e conta em memória, como os demais relatórios; com histórico grande precisa de agregação no banco (migration). Estornos não são descontados da contagem. A busca dos campos não foi alterada.
- **Verificação:** `gamificacao-gate` T03/T04 (parcelados) e V01/V02 (mais vendidos, com controle negativo de janela e isolamento entre empresas); E2E `metas` (lote de parcelados) e `comanda` (atalhos).

## D-026 — Pagamento dividido: correção do fluxo na comanda
- **Relato (Platform Owner, 2026-11-13, teste em produção):** não conseguiu usar mais de uma forma de pagamento ao fechar a comanda.
- **Diagnóstico (reproduzido com a API em memória):** o servidor sempre aceitou vários pagamentos; o defeito era de tela. "Dividir pagamento" só respondia depois de escolher uma forma única **e** simular; antes disso o toque não mostrava nada além de um aviso passageiro. Ligado, abria com uma linha só. O valor era campo numérico que não aceitava vírgula em alguns teclados. Não havia nenhum roteiro E2E do pagamento dividido. Classificação: REAL (usabilidade), existente desde a V1.3; não foi causado pelas entregas recentes.
- **Correção, sem migration e sem mudança no backend:**
  - "Dividir pagamento" liga a qualquer momento, sem simulação prévia, e abre com duas linhas; a forma única já escolhida vira a primeira linha e o campo de forma única sai da tela enquanto a divisão está ligada.
  - O restante da última linha usa o subtotal da tela (itens + gorjeta) e acompanha itens, gorjeta e valores digitados; depois de simular, usa o total confirmado pelo servidor. Divergência é recusada pelo servidor (`PAYMENT_TOTAL_MISMATCH`), como antes.
  - Valor aceita "20", "20,50" e "20.50". Soma acima do total avisa na hora e não simula.
  - Botões com 44 px, rótulos para leitor de tela e `role="switch"` no interruptor.
- **Limites:** com pagamento dividido não há o aviso de taxa por forma (a taxa total aparece no resumo). Continua sendo preciso simular antes de fechar. Verificado em navegador de teste com dados de teste; o dono precisa repetir o teste em produção depois do deploy.
- **Verificação:** E2E novo `split` — ligar sem simular, três formas, vírgula, soma acima do total, fechamento com três pagamentos gravados (Pix 30,50 + Débito 20,00 + Dinheiro 49,50) e taxa só do débito.

## D-027 — Meta do salão: reconhecimento sem valor
- **Decisão (Platform Owner, 2026-11-13):** o aplicativo mostra só um reconhecimento quando o salão atinge a meta do mês. Sem valor em dinheiro, sem efeito em comissão, repasse ou pagamento. Qualquer gesto físico (um brinde, um momento da equipe) é decisão do salão e fica fora do sistema.
- **Ponto aberto que motivou a decisão:** o D-012 bloqueava "gamificação com prêmio, metas e bônus" sem parecer. O D-019 aprovou metas e ranking explicitamente sem prêmio. Esta entrega fica dentro do D-019; qualquer recompensa com valor exige nova decisão escrita, alterando D-012 e D-019.
- **Regra:** a meta do salão é a soma das metas de faturamento já definidas para o mês, pelos profissionais que têm meta. Quem não tem meta fica fora da soma e do realizado. Não há meta nova para guardar, então não há migration.
- **Quem vê:** admin, gestão e profissional (mesmo acesso de `metas:read`). A recepção não vê, como antes nas metas.
- **O que aparece:** "Meta do salão: X%" enquanto não bate, e "★ Meta do salão atingida neste mês" quando bate, com o faturamento de serviços do salão e a meta. Não aparece nome, nem valor por pessoa.
- **Limite:** como a meta do salão vem das metas individuais, quem define o alvo é a gestão. Metas baixas tornam o reconhecimento fácil de atingir; a gestão precisa cuidar disso.
- **Verificação:** `gamificacao-gate` R01 (soma, exclusão de quem não tem meta, reconhecimento só ao chegar) e R02 (acesso por papel, resposta sem nomes); E2E `metas` (bloco aparece para gestão e profissional, reconhecimento aparece depois que a meta é atingida, sem nomes para o profissional).

## D-028 — Indicadores de agenda e clientes: Fase 1 (visão do salão)
- **Pedido (Platform Owner, 2026-11-14):** ver os indicadores de metas e desempenho de forma global e, depois, por colaborador, para avaliação pontual caso a caso. A visão individual (Fase 2) só para gerente e proprietário; a recepção não tem acesso.
- **O que já existia (não refeito):** o motor do Piloto (`engines/insights/piloto.js`) já media faltas, reagendamento, retorno de clientes novos (janela de 60 dias) e confirmação prévia; ocupação, ticket médio, produtos e complementares já tinham painel. A rota `/relatorios/piloto` (`relatorios:full`, só admin e gestão) já devolve, por profissional, faltas e reagendamento; o painel não os mostra.
- **Entregue na Fase 1, sem migration:**
  - **Retorno de clientes novos em três categorias**, com as mesmas definições de "novo", "maduro" e janela de 60 dias: voltou com o mesmo profissional, voltou com outro, não voltou. Quando a primeira visita ou os retornos não têm profissional registrado, o cliente vai para uma quarta contagem, "sem profissional registrado". Voltar com o mesmo e com outro conta como mesmo.
  - **Fidelização:** clientes atendidos no período com 3 ou mais atendimentos (dias distintos) nos 365 dias até o fim do período, mais a média de visitas.
  - **Taxa de cancelamento:** cancelado / (atendidos + faltas + cancelado), em qualquer antecedência.
  - Painel renomeado de "Piloto — 4 números" para "Agenda e clientes". Só admin e gestão veem.
- **Janela de retorno variável (pedido do dono, 2026-11-14):** 60, 90 ou 120 dias, escolhida no painel (`?retornoDias=`); padrão 60, o valor que o Piloto já usava. Outros valores são recusados (422). A maturação acompanha a janela: com 120 dias, clientes que chegaram há menos de 120 dias ficam fora do denominador. A escolha fica lembrada só no aparelho.
- **Limites:** o cliente é opcional no fechamento da comanda; atendimentos sem cliente cadastrado não entram em retorno nem em fidelização. Cadastro duplicado da mesma pessoa tende a contar como "não voltou". Não há referência de mercado para fidelização e cancelamento: as fontes de fornecedores divergem, e o painel diz isso em vez de inventar uma faixa. O relatório lê as tabelas da empresa e calcula em memória, como os demais.
- **Fase 2 (indicadores por colaborador): NÃO implementada.** Regra de acesso decidida pelo dono: somente admin e gestão. Pendente: confirmação explícita de que o dono assume o risco trabalhista de exibir indicadores individuais à gestão (alteração do D-012), a ser registrada como decisão própria. Desenho proposto: gestão escolhe pessoa e período; componentes com tamanho de amostra; comparação com o histórico da própria pessoa e com a média do salão; sem ranking, rótulo ou nota; nada gravado; a própria pessoa vê os mesmos números sobre ela.
- **Verificação:** `piloto-gate` C01 (categorias, soma igual ao denominador e ao numerador), C02 (fidelização), C03 (cancelamento), C04 e C05 (janela 60/90/120, maturação, 422 para outros valores); E2E `dashboard` (admin vê os indicadores novos e troca a janela; recepção não vê o painel).

## D-029 — Indicadores por colaborador (Fase 2 do D-028)
- **Decisão (Platform Owner, 2026-11-14):** ver os indicadores por colaborador para avaliação pontual, caso a caso. Acesso só para gerente (gestor) e proprietário (admin); a recepção não tem acesso. O dono declarou que o parecer trabalhista não é necessário e confirmou a Fase 2 ("2", em resposta à lista em que o item 2 era a confirmação de assumir o risco trabalhista de exibir indicadores individuais à gestão). Esta decisão **altera o D-012** no ponto "indicadores individuais de desempenho"; o D-012 continua valendo para prêmio, bônus e efeito em comissão.
- **Recomendação registrada e não seguida:** parecer trabalhista antes de exibir indicadores individuais (risco de caracterizar subordinação no salão-parceiro, Lei 13.352/2016; LGPD art. 20). Classificação do risco: DESCONHECIDO, aceito pelo dono.
- **Entregue, sem migration:**
  - `GET /api/desempenho/profissional?mes=&profissionalId=&retornoDias=` (`desempenho:read`: admin e gestor qualquer pessoa da empresa; profissional só a si mesmo, a query é ignorada; recepção 403; token legado e integração 403 por `userOnly`).
  - Indicadores do mês: atendimentos, faturamento em serviços, produtos (valor e unidades), ticket médio, ocupação da agenda, faltas dos clientes, reagendamento no fechamento e clientes novos que voltaram (com as três categorias, vistas a partir de quem fez a primeira visita). Comparados com o mês anterior da própria pessoa e com a média do salão (valores por pessoa entre os profissionais com movimento; taxas pelo total do salão).
  - Na tela: aba Ganhos, seção "Desempenho do mês". A gestão escolhe o profissional no seletor que já existia; o profissional vê os próprios números.
- **Salvaguardas:** nada é gravado (calculado na hora, sem histórico de avaliação); sem ranking, posição, rótulo, cor de julgamento ou nota; taxas com menos de 5 casos aparecem como "amostra pequena"; o texto da tela diz que é apoio para conversa e que a decisão é de uma pessoa; o profissional vê o mesmo que a gestão vê sobre ele.
- **Limites:** o mês corrente é parcial (até hoje); ocupação depende do expediente cadastrado; os limites de cadastro de cliente do D-028 valem aqui. A navegação continua escondida (Gestão → Ganhos); o desenho de uma entrada própria "Metas e desempenho" está pendente.
- **Verificação:** `gamificacao-gate` D01 (cálculo, mês anterior, média do salão, amostra pequena, ausência de nota) e D02 (acesso por papel, profissional forçado a si mesmo, legado 403, outra empresa 404, entradas inválidas 422); `piloto-gate` C06 (retorno por profissional da primeira visita); E2E `metas` (gestão vê 8 indicadores da pessoa escolhida; profissional vê os seus, sem seletor).

## D-030 — Navegação: aba "Metas" para a gestão e "Meu mês" para o profissional
- **Problema (relato do dono, 2026-11-14):** metas, ranking e desempenho existiam, mas não eram achados: ficavam em Gestão → aba Ganhos (uma de nove abas) e o formulário de metas só aparecia depois de escolher um profissional num seletor. A navegação dessas funções nunca tinha sido desenhada.
- **Desenho aprovado pelo dono (canvas de redesign, fileira "Onde cada coisa fica"):** barra inferior por papel.
- **Implementado, sem migration e sem mudança de regra ou permissão:**
  - Barra inferior renomeada: Agenda · Comanda · Painel · **Metas** · Conta (antes Checkout, Dashboard e Gestão).
  - **Metas** (admin e gestor): meta do salão no topo e a lista da equipe com o progresso da meta de faturamento, à vista sem escolher ninguém; tocar numa pessoa abre, logo abaixo, os ganhos, as metas e o desempenho dela (o mesmo conteúdo da antiga aba Ganhos, movido com os mesmos identificadores).
  - **Meu mês** (profissional): a mesma aba, só com os próprios números; a Agenda aparece como **Hoje**.
  - **Recepção:** sem a aba.
  - A aba Ganhos saiu do painel de Conta.
- **Desvio do desenho:** o profissional continua com **Comanda** e **Conta** na barra (o desenho mostrava só Hoje e Meu mês), porque ele fecha a própria comanda e o cartão "Agora" abre a comanda; tirar seria perda de função. A aba "Clientes" do desenho não foi feita: os indicadores de agenda e clientes continuam no Painel.
- **Verificação:** E2E `metas` (lista da equipe à vista; tocar na pessoa escolhe o profissional; "Meu mês" e "Hoje" para o profissional; meta do salão no topo da equipe), `ganhos` (recepção sem a aba) e `finops` (pagamento de comissão pelo novo caminho).

## D-031 — Seletor de tema: Automático, Claro ou Escuro
- **Pedido (Platform Owner, 2026-11-14):** o modo escuro existia só automático (seguia o aparelho, D-022) e não havia como escolher.
- **Entregue:** em Conta, "Aparência" com Automático (padrão), Claro e Escuro. Guardado só no aparelho (`localStorage`), não vai ao servidor. Aplicado antes da primeira pintura por um script clássico no `<head>` (`js/tema-inicial.js`; a CSP proíbe script inline), para a tela não piscar. A barra do navegador acompanha a escolha. Só os tokens mudam: nenhum componente ganhou regra própria.
- **Verificação:** E2E `dashboard` (aparelho claro; "Escuro" muda o fundo na hora; a escolha sobrevive ao recarregar; "Automático" volta a seguir o aparelho; opções com 44 px) e `csp` sem violações.

## D-032 — Permissões finas por papel e permissões individuais (migration 012)
- **Decisão (Platform Owner, 2026-11-14):** opção A do desenho (`planning/PERMISSOES_POR_PAPEL.md`) aprovada ("Implemente a recomendação aprovada"), o que **autoriza a migration 012**. Recepção em celular, tablet ou computador. Gestor e proprietário concedem e revogam funções a uma pessoa, individualmente, sem tirar o que vem do papel.
- **Regras implementadas:**
  - Matriz por papel com ações específicas (34 permissões em 11 grupos; ex.: agenda ver, criar, encaixar, editar, atender, cancelar). Fonte única: `backend/src/auth/permissoes.js`; documento gerado: [`PERMISSOES.md`](PERMISSOES.md), conferido pelo gate.
  - Padrão mínimo e igual ao comportamento anterior (nenhum papel ganhou nem perdeu acesso padrão).
  - Permissão individual só acrescenta e dá alcance "todos".
  - Autoridade: só em papéis abaixo do próprio, nunca em si mesmo, só o que o ator tem por inteiro; permissões sensíveis e de administração só o proprietário concede (revisão de 2026-11-15 abaixo).
  - Servidor decide; o `/me` devolve as permissões efetivas e a tela se ajusta a elas. O vínculo é relido a cada requisição: revogação vale na próxima ação.
  - Trilha `membership_permissao_eventos` (quem, o quê, para quem, quando), imutável por gatilho; escrita só pela RPC `membership_permissoes_definir` (service_role); anon/authenticated sem acesso.
- **Revisão após o Red Team (Platform Owner, 2026-11-15):**
  - **Profissional só recebe o que não mexe em valores financeiros críticos:** a **agenda de todos** (as ações de agendar, encaixar, remarcar, atender e cancelar acompanham a visão; não se concedem sozinhas) e **fechar comanda de qualquer profissional**. Caixa, estorno, comissão, preços, estoque, painel financeiro, contato de clientes e números de colegas nunca são concedidos ao profissional, nem pelo proprietário. O pacote "Recepção" para profissional saiu: para cobrir o caixa, a pessoa precisa do papel Recepção.
  - **Três níveis de concessão:** operação (gerente ou proprietário), **sensível** (dinheiro ou dado pessoal; só o proprietário) e administração (só o proprietário). Fecha o achado MÉDIO do Red Team (gerente dando acesso a dinheiro ou a ganhos de colegas).
  - **Clientes:** todos veem o nome e cadastram cliente novo (`clientes:criar`, também pelo cadastro rápido no novo agendamento); WhatsApp e observações só com `clientes:contato` (recepção e gestão). Editar cliente existente continua `clientes:editar`. Antes, o profissional recebia o contato de todos os clientes em `/clientes` e `/catalog`.
  - **Lembretes:** por WhatsApp só com `agenda:lembretes` (recepção e gestão). O profissional vê, no app, os próprios horários a confirmar, sem contato. Notificação push no aparelho não existe hoje (exige infraestrutura de push e consentimento); fica encaminhada.
  - **Corrida (achado BAIXO 2):** a migration 012 foi ajustada antes do merge (autorizado pelo dono, "5. Sim"): a RPC recebe a lista lida (`p_esperado`) e recusa se ela mudou (409 `PERMISSIONS_CHANGED`); vínculo inativo só perde permissões.
  - **Troca de papel ou desativação (achado BAIXO 3):** as permissões individuais saem, com eventos de revogação na trilha.
  - **Segunda passada do Red Team (2026-11-15), sem achado crítico ou alto, quatro correções:** cadastro rápido de quem não edita clientes grava só nome e WhatsApp (cliente ativo, sem faltas) e recusa número já cadastrado (evita bloquear o agendamento online de um número); a RPC também confere o papel lido (`p_role_esperado`) e a troca de papel grava o papel novo antes de zerar as permissões, com releitura; extra antigo que o papel atual não recebe deixa de valer e sempre pode ser revogado pelo proprietário; observações dos horários de colegas não vão para o profissional com agenda de todos. A 012 remove versões anteriores da função.
- **Decisões do dono (2026-11-15):**
  - **Padrões do profissional mantidos:** ele continua agendando, encaixando, remarcando e cancelando os próprios horários sem permissão extra.
  - **"Ninguém mexe no próprio dinheiro", ligado e desligado pelo proprietário:** quem não é o proprietário e está vinculado a um cadastro de profissional (ex.: gerente que também atende) não paga nem estorna a própria comissão, não estorna comanda com atendimento ou venda própria, não muda o próprio cadastro (comissão), os próprios serviços e overrides, nem a própria meta (403 `OWN_MONEY_FORBIDDEN`). O proprietário libera por gerente com a permissão individual `financeiro:proprio` (só para o papel gerente, só o proprietário concede) e retira quando quiser; vale na próxima ação. **Padrão: regra ligada** (mínimo acesso). Sem migration: usa as permissões individuais da 012.
  - Limite: a comissão definida pelo cargo (vale para várias pessoas, inclusive o próprio gerente) não entra na regra.
- **Pendente:** a tela só reflete a mudança de permissão após novo login (o servidor já aplica na hora).
- **Verificação:** `gate_012.sql` (7 blocos, controles negativos, corrida de lista e de papel, ciclo de rollback); `permissoes-gate` G01–G22; `identity-gate` U10/U15 ajustados (profissional cadastra cliente novo, não edita); Red Team de inventário (C05); E2E `permissoes` (conceder agenda de todos e comanda, usar, lembretes sem WhatsApp, cadastro rápido de cliente, comanda de colega, revogar com sessão aberta → 403, histórico; recepção em 390, 820 e 1280 px).

## D-033 — Disponibilidade da unidade e escalas dos profissionais (migration 013)
- **Decisão (Platform Owner, 2026-11-15):** "Todas as recomendações aprovadas" sobre [`planning/DISPONIBILIDADE_ESCALAS.md`](planning/DISPONIBILIDADE_ESCALAS.md), o que **autoriza a migration 013**:
  - o profissional pode bloquear o próprio horário (só bloqueio e ausência);
  - agendar fora da disponibilidade só com `agenda:encaixar`, marcando "forçar", com registro;
  - o horário atual de cada profissional vira escala publicada; profissionais novos nascem indisponíveis até publicar.
- **Auditoria (antes):** não havia disponibilidade padrão do profissional. Ele herdava inteiro o horário da empresa (`empresas.horario_por_dia`, um período por dia), com um almoço global, e `profissionais.horario` não tinha tela. Não havia exceção por data. O agendamento pela equipe não conferia o expediente.
- **Fonte única:** `disponibilidade_semanal` (unidade e profissional, vários períodos, alternância de semanas) + `disponibilidade_excecoes` (unidade: horário excepcional e fechamento integral ou parcial; profissional: horário excepcional, ausência, bloqueio) + `profissionais.escala_publicada_em`.
  - Os jsonb antigos foram convertidos na migration e não são mais lidos pelo cálculo, salvo em banco ainda sem a 013.
  - O assistente de configuração converte o horário simples para a escala da unidade.
- **Precedência** (`DisponibilidadeEngine`):
  1. Fechamento integral da unidade.
  2. Horário excepcional da unidade.
  3. Semanal da unidade.
  4. Ausência do profissional.
  5. Horário excepcional do profissional.
  6. Semanal publicado do profissional.
  7. Bloqueios e fechamentos parciais retiram trechos.

  Efetivo = unidade ∩ profissional − bloqueios − atendimentos, com o serviço inteiro cabendo. Abrir a unidade num dia excepcional não libera ninguém. Sem regra, nada é oferecido.
- **Servidor:**
  - `GET /agenda/slots`, o agendamento online e a ocupação usam o mesmo cálculo.
  - `POST /agenda`, remarcação e aumento de duração recusam fora da disponibilidade (409 `FORA_DA_DISPONIBILIDADE`), salvo encaixe forçado, registrado no evento de criação.
  - Empresa sem nenhuma regra da unidade mantém o comportamento anterior.
- **Conflitos:** mudança que deixa agendamentos de fora devolve 409 `CONFLITOS_PENDENTES` com a lista. Só grava quando quem tem `escala:conflitos` decide "manter" cada um; a decisão vai para a trilha imutável `disponibilidade_eventos` (antes, depois, decisões). Nada é cancelado ou movido sozinho.
- **Permissões:**
  - `escala:ver`: o profissional vê a própria escala; segue a agenda de todos.
  - `escala:bloquear`: o profissional só bloqueia a própria escala.
  - `escala:conflitos`: recepção e gestão.
  - `escala:editar` e `unidade:horario`: gestão; nível sensível.
- **Tela:** Conta → Escalas, com semana padrão da unidade e de cada profissional, datas especiais, "Usar o horário da unidade", conflitos com "Manter e salvar". A agenda mostra a origem quando não há horário e oferece "agendar mesmo assim" a quem pode encaixar.
- **Red Team independente (2026-11-15), corrigido antes do merge:**
  - **ALTO:** `profissionalId` em formato de lista fazia profissional ou recepção fecharem a unidade. Agora formato inválido cai na permissão mais forte e é recusado (422).
  - **MÉDIO:** zerar o horário da unidade desligava a checagem do servidor. Agora só uma empresa sem nenhuma regra nem exceção mantém o comportamento anterior.
  - **MÉDIO:** a conversão tirava o horário de profissional em dia em que a empresa não abria. Agora a unidade abre nesse trecho e só quem tinha horário atende.
  - **MÉDIO:** salvar o assistente de configuração apagava a escala da unidade. Agora sincroniza só quando o horário muda de fato, exige `unidade:horario` e grava a escala antes do jsonb.
  - **BAIXO:**
    - o encaixe forçado na remarcação e na mudança de duração passou a ser registrado;
    - semanas alternadas podem repetir o horário.
  - **Riscos aceitos:**
    - corrida entre o cálculo de conflitos e a gravação: um agendamento criado nesse intervalo vira conflito listado depois;
    - divergências de borda entre a conversão SQL e o espelho JS em formatos antigos raros (`ativo` como texto, `24:00`).
- **Fora desta onda:** alteração em lote, modelos de escala, importação e exportação CSV, visual semana × profissional no computador, várias unidades (o salão tem uma). Notificação push não existe.
- **Verificação:**
  - `gate_013.sql` (6 blocos: conversão, formas, funções, trilha imutável, acesso; ciclo de rollback);
  - `disponibilidade-gate` D01–D14 (precedência; regressões do Red Team; cenário obrigatório do domingo com as 9 verificações; servidor; permissões; conflitos; novo e existente);
  - E2E `escalas` (data especial pela tela, efeito nos horários, conflito com "Manter e salvar", origem, recepção e profissional com o que podem).

## D-034 — search_path fixo nas funções auxiliares da 013 (migration 014)
- **Contexto:** depois da aplicação da 013 em produção (2026-11-15), o advisor de segurança do Supabase acusou `function_search_path_mutable` (WARN) em `disponibilidade_janela_legada` e `disponibilidade_hora`. As duas só servem à conversão dos horários antigos e não são executáveis por anon, authenticated nem service_role. O risco prático é baixo, mas o aviso é real.
- **Decisão (Platform Owner, 2026-11-15):** "1. Autorizado" (migration 014). A proteção contra senha vazada do Auth fica desligada por ora ("2. Ainda não").
- **Migration 014:** `alter function ... set search_path = pg_catalog, public` nas duas funções. Rollback `014_down.sql`. `gate_014.sql` (3 blocos: search_path fixo com controle negativo, resultado das funções inalterado, nenhuma função nova da 012/013 sem search_path).

## D-035 — Escalas: alteração em lote e modelos (migration 015)
- **Decisão (Platform Owner, 2026-11-15):**
  - "Escalar a onda 2". A migration 015 cria `escala_modelos`, já previsto no desenho aprovado da D-033.
  - Na mesma mensagem: deixar a importação do app Barber como está e fazer o desenho completo do clube de assinatura sem escolher fornecedor.
  - A troca do app Barber só quando o fluxo de agendamento estiver completo de ponta a ponta, inclusive o app do cliente.
- **Entregue:**
  - `POST /api/disponibilidade/lote` (`escala:lote`, gestão, sensível):
    - alvos: unidade e/ou profissionais;
    - o quê: ausência, bloqueio, horário excepcional, fechamento (só unidade), mesma semana padrão, modelo como semana padrão ou modelo num período (até 62 dias, horário excepcional só nos dias do modelo);
    - `simular: true` devolve a prévia (quem, o quê, agendamentos afetados, itens inválidos) sem gravar;
    - aplicar é tudo ou nada (`disponibilidade_lote`, pelas funções da 013, com a trilha);
    - inválido → 422;
    - conflitos → 409 até a decisão de quem tem `escala:conflitos`.
  - Modelos (`escala:modelos`, gestão, sensível): listar, criar, editar, duplicar, arquivar e reativar. O nome é único entre os ativos. Aplicar copia: mudar o modelo não altera o que já foi aplicado.
  - Tela Conta → Escalas:
    - "Alterar vários de uma vez", com "Ver prévia" obrigatória antes de "Aplicar"; qualquer mudança depois da prévia exige nova prévia;
    - lista de modelos com Editar, Duplicar e Arquivar.
- **Correção no executor de E2E:** `run-all.js` passou a consumir o corpo das respostas ao esperar os servidores. A resposta não lida derrubava o processo com um assert interno do `fetch` do Node 22 quando o `index.html` cresceu; o problema foi reproduzido isolado.
- **Verificação:**
  - `gate_015.sql` (5 blocos: lote com trilha, tudo ou nada, mais de 50 exceções, modelos, acesso);
  - `disponibilidade-gate` D15–D20 (prévia sem gravar, aplicação em lote, conflito no lote, ciclo de vida do modelo, modelo no período e como semana, permissões);
  - E2E `escalas` (modelo pela tela; lote com prévia e aplicação).

## D-036 — Clube de assinatura: regras definidas pelo dono (desenho, sem implementação)
- **Decisão (Platform Owner, 2026-11-15)** sobre [`planning/ASSINATURAS_DESENHO.md`](planning/ASSINATURAS_DESENHO.md):
  - comissão do serviço coberto em **múltipla escolha por plano**: valor de tabela, rateio da mensalidade pelos usos ou valor fixo por uso (padrão sugerido: fixo por uso);
  - **tolerância de inadimplência de 7 dias**;
  - cancelamento no fim do ciclo pago, sem reembolso proporcional;
  - usos não feitos não acumulam;
  - **Onda A** (planos, uso, limites, comissão e margem, com a cobrança ainda fora) **antes** de escolher o fornecedor.
- **Estado:** desenho. A Onda A exige migration nova, que depende de autorização. O fornecedor de pagamento ainda não foi escolhido.

## D-037 — Agendamento online configurado por salão (migration 016, C1)
- **Decisão (Platform Owner, 2026-11-15)** sobre [`planning/AGENDAMENTO_PONTA_A_PONTA_AUDITORIA.md`](planning/AGENDAMENTO_PONTA_A_PONTA_AUDITORIA.md):
  - os dados do salão no aviso de privacidade variam por salão (SaaS futuro);
  - prazo de cancelamento/remarcação, antecedência e máximo de horários futuros por número variam por salão;
  - a página do cliente mostra preço, duração e disponibilidade conforme o override do profissional;
  - ordem C1→C5 aprovada; o cliente não marca horário recorrente sozinho (risco de fraude);
  - migration 016 autorizada ("1. Autorizado").
- **Entregue:**
  - Migration 016: colunas em `empresas` — `online_slug` (único, formato fixo), `online_ativo` (nasce desligado), `online_antecedencia_min` (0–10080), `online_janela_dias` (1–180), `online_cancelamento_prazo_min` (0–10080), `online_max_futuros` (1–10), `online_mostrar_preco`, `privacidade_contato` (3–200). O banco recusa ligar sem slug, razão social e contato de privacidade. Rollback em `supabase/rollback/016_down.sql`.
  - Link público (`backend/src/routes/publicBooking.js`):
    - o salão vem do slug gravado no banco; o mapa `PUBLIC_BOOKING_LINKS` da env vale só para slug que não está no banco (e antes da 016). Slug no banco com o link desligado = 404, mesmo que esteja no mapa;
    - o corpo do POST só é lido depois de resolver um salão ligado (slug desconhecido nem chega ao parser);
    - consulta do slug com cache de 30 s por instância (inclusive "não existe", até 500 entradas); salvar a configuração limpa o cache da instância. Em mais de uma instância, desligar leva até 30 s para valer em todas;
    - antecedência, janela e limite de futuros vêm da linha do salão; a env é reserva;
    - preço e duração por profissional (override); no serviço, a faixa; `online_mostrar_preco = false` tira todos os preços da resposta;
    - o agendamento grava o preço de quem atende (antes gravava o do serviço);
    - "sem preferência" (`profissionalId = "qualquer"`): mostra os horários de qualquer profissional do serviço e grava com o de agenda mais leve no dia que tem o horário (empate: nome);
    - aviso de privacidade com razão social, CNPJ e contato do salão; o evento de origem guarda a versão, um hash curto do texto exibido, a fonte do link e se o profissional foi escolhido pelo cliente ou pelo sistema.
  - `GET/PATCH /api/empresa/agendamento-online` (`empresa:configurar`): faixas validadas, ligar sem requisitos → 422 com a lista do que falta, slug de outro salão (banco ou env) → 409, sem a 016 → 503.
  - Tela Conta → Link online e página `agendar.html` (faixa de preço e duração, "sem preferência", controlador no aviso, prazo de cancelamento na confirmação).
  - Smoke: liga/desliga agora é por salão (`--public-slug`); slug inexistente continua 404 no GET e no POST.
- **Verificação:** `gate_016.sql` (5 blocos); `agendamento-online-config-gate` 13/13 (3 controles negativos); `agendamento-publico-gate` 19/19; E2E `link-online` (admin liga, cliente agenda sem preferência, admin desliga).
- **Fora do escopo (próximas etapas):** C2 link pessoal do cliente (confirmar, cancelar, remarcar, .ics/Google Agenda), C3 aviso à recepção, C4 série recorrente só pela equipe, C5 push e WhatsApp pré-configurado. Ícone de instalação da página do cliente fica para a C2.

## D-038 — Plano autorizado (C2–C5, assinatura Onda A) e C2: link pessoal do agendamento (migration 017)
- **Decisão (Platform Owner, 2026-11-16):** "Autorizado plano de assinatura, C2, migrações, C3 C4 C5".
  - Autoriza a implementação de C2, C3, C4, C5 (auditoria do agendamento) e da Onda A do clube de assinatura (D-036), **com as migrations que cada uma precisar**.
  - Continua valendo: cada migration tem linha no `migrations.lock`, gate SQL, rollback e decisão registrada; o merge que aplica SQL em produção exige "ok merge" explícito.
  - Ordem de execução: C2 → C3 → C4 → C5 → Onda A (o critério do dono para sair do AppBarber é o agendamento de ponta a ponta).
  - Na mesma rodada (2026-11-16): aprovados o limite IPv4 por /24 no agendamento público (RTP-01), a fase "link ligado" do Red Team em produção (até 6 agendamentos de teste) e a limpeza depois.
- **C2 entregue:**
  - Migration 017: tabela `agendamento_acessos`:
    - só o SHA-256 do código (o banco recusa texto que não seja hash);
    - validade, revogação, contador de remarcações (0–20) e origem (`link_publico` ou `recepcao`);
    - trigger que impede acesso de uma empresa apontar para agendamento de outra;
    - RLS ligada, sem acesso de `anon`/`authenticated`, `service_role` sem `delete`;
    - rollback em `supabase/rollback/017_down.sql`.
  - O link: código aleatório de 32 bytes no fragmento da URL (`meu-horario.html#t=…`), que não vai ao servidor nem no Referer. A página manda o código no **corpo** de POSTs (a URL é registrada no log de acesso). Vale até 24 h depois do início do horário. No máximo 5 links ativos por agendamento (o mais antigo é revogado).
  - `POST /api/public/meu-agendamento` (ver), `/confirmar`, `/cancelar`, `/horarios`, `/remarcar`:
    - código ausente, malformado, desconhecido, revogado ou vencido → o mesmo 404;
    - cancelar e remarcar só até o prazo do salão (`online_cancelamento_prazo_min`), conferido no servidor;
    - remarcar: mesmo serviço e profissional, regras do link público do salão (antecedência, janela, disponibilidade), mesma duração e preço, no máximo 3 vezes por link, só com o link do salão ligado; o antigo vira `reagendado`, o link passa a mostrar o novo; se o original mudar no meio, o novo é desfeito (409);
    - confirmar e cancelar são atualizações condicionais;
    - trilha em `agendamento_eventos` com `origem: link_cliente` e `actor_type: cliente_link`;
    - limite de 30 pedidos por minuto por /24 (`PUBLIC_BOOKING_RATE_LINK_MAX`).
  - Confirmação do agendamento online: "Guarde seu link", copiar, e lembrete na agenda do celular (.ics com alarmes de 1 dia e 2 h, gerado no aparelho; link do Google Agenda).
  - Recepção: ao tocar em WhatsApp nos lembretes, `POST /api/agenda/:id/link-cliente` (`agenda:lembretes`) gera um link e ele vai no fim da mensagem. Remarcação pela recepção leva o link do cliente para o novo horário.
- **Riscos aceitos:** quem tiver o link (encaminhado, no histórico ou na agenda sincronizada na nuvem) pode confirmar, cancelar ou remarcar dentro das regras; a trilha registra que foi pelo link. O ícone de instalação da página do cliente fica para a C5 (push no iPhone exige o app instalado).
- **Verificação:** `gate_017.sql` (5 blocos); `meu-agendamento-gate` 11/11 (2 controles negativos); `agendamento-publico-gate` 19/19; E2E `link-pessoal`.
- **C3 entregue (sem migration):** aviso de agendamento online novo.
  - `GET /api/agenda/online-novos?desde=` (`agenda:ver`): devolve os agendamentos criados pelo link público desde o instante dado, no máximo 7 dias para trás e 50 itens, com o mesmo escopo da agenda.
  - Na agenda, o botão "N novos online" consulta o servidor a cada minuto, com o app aberto e visível, e abre a lista com "Marcar como vistos".
  - "Visto" fica guardado **no aparelho** (`localStorage`), não no banco. Cada aparelho da recepção tem o seu, e limpar o navegador traz de volta as últimas 24 h. Para valer entre aparelhos, precisaria de migration (não pedido agora).
  - Sem som: o aviso é visual.
  - Verificação: `meu-agendamento-gate` C301 e E2E `link-pessoal` (aviso aparece, lista, some depois de visto).

## D-039 — Recorrência só pela equipe (C4, migration 018)
- **Decisão (Platform Owner):** autorizada em D-038. Regras herdadas da auditoria (D-037): o cliente não cria série pelo link (risco de fraude); série semanal, quinzenal ou mensal; cancelar ou alterar "só este", "este e os próximos" ou "todos" pelo card; a série respeita escalas e conflitos.
- **Entregue:**
  - Migration 018:
    - tabela `agendamento_series` (frequência, horário, duração 5–600, início, 2–52 ocorrências, `ativa`/`encerrada`);
    - colunas `agendamentos.serie_id` e `serie_seq` (1–52, os dois juntos ou nenhum);
    - triggers que impedem série ou ocorrência de cruzar empresa;
    - RLS ligada, sem `delete`;
    - rollback em `supabase/rollback/018_down.sql`.
  - Permissão nova `agenda:recorrencia` (recepção, gerente e proprietário; o profissional não recebe por padrão).
  - Datas (`RecorrenciaEngine`): semanal +7 dias, quinzenal +14, mensal no mesmo dia do mês. Em mês sem esse dia, cai no último dia do mês, sem deslocar os seguintes.
  - Rotas:
    - `POST /api/agenda/series/previa`: diz, sem gravar, quais datas estão livres, em conflito, fora da escala ou no passado.
    - `POST /api/agenda/series`: grava a série e cada ocorrência livre pelo `agendamento_criar` de sempre. O que ficar indisponível até a gravação é pulado e informado; a série nunca encaixa à força.
    - `GET /api/agenda/series/:id`.
    - `POST /api/agenda/series/:id/cancelar` (`agenda:cancelar`).
    - `POST /api/agenda/series/:id/alterar` (`agenda:editar`): novo horário e/ou profissional, cada data no mesmo dia. A que não couber fica como estava. "Este e os próximos" e "todos" atualizam a regra da série. O link pessoal do cliente (C2) acompanha.
  - A remarcação avulsa de uma ocorrência mantém a marcação da série. Cancelar todas as futuras encerra a série.
  - Tela:
    - "Repetir" (toda semana, a cada 15 dias, todo mês; quantas vezes) no novo agendamento, com prévia e confirmação;
    - no card, "Cancelar na série…" e "Alterar na série…", com o escopo.
- **Fora do escopo:** alterar a data (dia da semana) da série; editar a série inteira de uma vez fora do card; séries sem fim.
- **Verificação:**
  - `gate_018.sql` (5 blocos). Pegou um furo real: `serie_seq` nulo passava o CHECK, corrigido antes do lock.
  - `series-gate` 9/9, com controle negativo.
  - E2E `series`: prévia, criação, alterar "este e os próximos", cancelar "todos", profissional sem "Repetir".

## D-040 — Agendamento inteligente: atendimento com vários serviços (migration 019)
- **Decisão (Platform Owner, 2026-11-16)** sobre [`planning/AGENDAMENTO_INTELIGENTE_ANALISE.md`](planning/AGENDAMENTO_INTELIGENTE_ANALISE.md):
  - migration 019 autorizada;
  - grade nova (passo igual à duração total, mais o início que termina no fim do espaço livre) nas combinações; "ver todos" do agendamento de um serviço continua com a grade de 30 min;
  - limite de espera padrão de 30 minutos, ajustável por unidade;
  - combo continua sendo um serviço único;
  - esta proposta vem antes da C5.
- **Onda 1 (sem migration):**
  - `AtendimentoEngine` (puro): duração e preço por profissional (override > serviço); grade de inícios; combinações em três tipos (tudo com um profissional; em sequência com profissionais diferentes, sem espera; fracionado, com espera até o limite); validação de uma escolha.
  - O profissional fixado pelo usuário nunca é trocado. O motor só lista opções; quem agenda escolhe.
  - Ordenação: sem espera primeiro (um profissional, depois sequência, por início); as demais pelo tempo total do cliente.
  - `POST /api/agenda/combinacoes` (`agenda:ver`, somente leitura): opções, totais por profissional e, se vier `escolha`, se ela ainda é válida.
- **Onda 2 (migration 019):**
  - `empresas.atendimento_espera_max_min` (0–240, padrão 30).
  - `atendimento_criar`: reserva todas as etapas ou nenhuma. Trava a agenda de cada profissional em ordem fixa, confere conflito com higienização contra outros atendimentos e só sobreposição entre etapas do mesmo atendimento. Etapas ligadas por `grupo_id`/`grupo_seq` (colunas da 001). Nunca encaixa à força.
  - `POST /api/agenda/atendimentos` (`agenda:criar`): o servidor recalcula duração e preço, confere habilitação, disponibilidade, ordem e limite de espera, e grava. Etapa que não cabe → 409 `ATENDIMENTO_INVALIDO` com os problemas; conflito na gravação → 409 `ATENDIMENTO_CONFLITO`, nada reservado.
  - `GET /api/agenda/atendimentos/:grupoId` e `POST …/cancelar` (`etapa` ou `todas`; `simular: true` devolve etapas afetadas e mantidas sem gravar).
  - Tela: "+ Adicionar serviço" no novo agendamento; lista de combinações com etapas, preço, espera e total; no card, "Ver etapas do atendimento" com cancelar só a etapa ou todas, mostrando o impacto antes. Limite de espera em Conta → Escalas.
- **Limitações (ficam para a Onda 3 ou decisão futura):**
  - remarcar o atendimento inteiro de uma vez (hoje: remarcar cada etapa, ou cancelar e agendar de novo);
  - remarcar uma etapa encostada em outra do mesmo profissional pode esbarrar no tempo de higienização;
  - vários serviços no link do cliente e na série recorrente;
  - combo que conhece os componentes; recursos (cadeira, sala);
  - checkout: cada etapa vai para a comanda como hoje (uma por vez).
- **Verificação:** `gate_019.sql` (5 blocos); `concurrency_atendimento.sh` (duas reservas simultâneas → uma inteira, a outra sem nenhuma etapa); `atendimento-gate` 16/16 (cenários de aceite 1 a 10); E2E `atendimento`.

## D-041 — C5: lembretes por push; WhatsApp e SMS pré-configurados e desligados (migration 020)
- **Decisão (Platform Owner, 2026-11-16):** "C5: autorizado", o que inclui a dependência `web-push` (3.6.7, `npm audit` sem achados) e a migration 020.
- **Entregue:**
  - Migration 020:
    - `agendamento_push`: assinatura do aparelho do cliente, presa ao link pessoal (017); o mesmo aparelho só entra uma vez; o banco recusa assinatura que não seja objeto ou passe de 4 KB;
    - `agendamento_lembretes`: um registro por (agendamento, tipo, canal), com UNIQUE. É a trava contra envio duplicado, inclusive com duas instâncias do servidor;
    - `empresas.lembretes_push_ativo` (padrão ligado);
    - triggers que impedem cruzar empresa; RLS ligada; sem `delete`; rollback em `supabase/rollback/020_down.sql`.
  - Lembretes: `d1` entre 24 h e 12 h antes do horário; `h2` entre 2 h e 30 min antes. Passou da janela, não sai. Só recebe quem ligou o push **antes** de a janela abrir.
  - O aviso diz serviço, salão, dia e hora; sem preço nem nome do cliente.
  - Agendador dentro do próprio servidor, uma rodada por minuto (`LEMBRETES_INTERVALO_MS`). Prefere perder um lembrete a mandar dois: se o envio falha, não há reenvio automático.
  - Assinatura morta (HTTP 404 ou 410) é revogada. Máximo de 5 aparelhos por link. Remarcar leva o push junto, porque ele está preso ao link.
  - Segurança: o endereço da assinatura vem do aparelho do cliente, então só servidores de push conhecidos (Google, Mozilla, Apple, Microsoft), em https, sem credenciais nem porta estranha, são aceitos. Sem isso, qualquer pessoa faria o servidor chamar um endereço interno (SSRF).
  - Canais: `push` ativo quando as três variáveis VAPID existem no servidor; `whatsapp` e `sms` com adaptador pronto e **desligados**, com duas travas: `WHATSAPP_ENABLED`/`SMS_ENABLED` mais um provedor registrado, e `podeContatar(cliente)`, que hoje devolve sempre falso porque o cadastro ainda não tem o "não quero receber mensagens" do cliente. Nenhuma mensagem sai por esses canais.
  - Cliente: botão "Receber lembrete por notificação" na página do horário; service worker próprio (`sw-cliente.js`, escopo `./cliente-push/`), que só recebe o push e abre a página. O código do link fica guardado no aparelho para o toque na notificação abrir o horário, e some ao desativar. Interruptor do salão em Conta → Link online.
- **Para ligar em produção (o dono, no Render):** gerar o par de chaves no próprio computador com `npx web-push generate-vapid-keys` (a chave privada não passa por chat nem repositório) e definir `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (`mailto:` do salão). O `doctor.js` confere. Sem as três, o push fica desligado e nada mais muda.
- **Limitações e riscos:**
  - iPhone: o navegador só aceita push em página adicionada à Tela de Início (iOS 16.4 ou mais novo). A página explica o caminho.
  - Se o servidor dormir (Render gratuito sem ping do UptimeRobot), os lembretes esperam ele acordar. As janelas largas dão folga, mas uma parada longa perde o lembrete daquela janela.
  - O toque na notificação depende do código guardado no aparelho. Se o cliente limpar os dados do navegador, abre a tela neutra e ele usa o link original.
  - WhatsApp e SMS: abrir esses canais exige antes escolher o fornecedor e criar o campo de opt-out do cliente (migration e texto de consentimento).
- **Verificação:** `gate_020.sql` (5 blocos); `lembretes-push-gate` 18/18 (3 controles negativos); E2E `push-cliente`: página liga e desliga, toque sem `#t=`, e o service worker real mostra a notificação entregue pelo protocolo do Chromium.


## D-042 — Assinatura, Onda A, fase 1: planos e restrições (migration 021)
- **Decisão (Platform Owner, 2026-11-16):** "Onda a: autorizado" (D-038); "Aprovado o rateio por quantidade. Conforme recomendação"; "Pode começar a fazer um da onda a". Regras de uso fora do plano: comissão padrão do profissional, cliente avisado, estorno "o que for mais inteligente", padrão de plano novo = bloquear, regra de cada plano configurável pelo gestor.
- **Base:** leitura real do AppBarber ([`planning/APPBARBER_ASSINATURAS_PACOTES_LEITURA_2026-11-16.md`](planning/APPBARBER_ASSINATURAS_PACOTES_LEITURA_2026-11-16.md)): 9 planos com rateio de 50%, dias da semana por item, profissionais por plano.
- **Entregue:**
  - Migration 021: `assinatura_planos` (preço, periodicidade, vencimento, cobrança manual ou recorrente, tolerância, regra de comissão, política fora da regra com teto e aprovação, arquivamento), `assinatura_plano_itens` (desconto, limite por ciclo nulo = ilimitado, dias da semana, faixa de horário, intervalo mínimo) e `assinatura_plano_profissionais` (vazio = todos). Coerência no banco (cada escolha traz o seu número), nome único entre ativos, nada cruza empresa, RLS, sem `delete` de plano; itens e profissionais só pela função `assinatura_plano_salvar` (tudo ou nada). Rollback em `supabase/rollback/021_down.sql`.
  - Motor puro `AssinaturaRegrasEngine.avaliarUso`: serviço fora do plano e limite esgotado cobram cheio; restrição violada aplica a política do plano (bloquear, cobrar X% e gastar uso, cobrar X% sem gastar, cobertura total), com teto por ciclo; uma política por plano, sem somar.
  - Rotas `/api/assinaturas/planos` (listar, ver, criar, editar, arquivar, simular). Permissões novas: `assinatura:ver` (operação) e `planos:editar` (gestão, sensível).
  - PWA: Gestão → Planos, com simulador. Cache `v1-40-0-planos-assinatura`.
- **Fora desta fase:** assinantes, ciclos, usos na agenda e na comanda, estorno de uso (fase 2); cálculo da comissão e rateio, margem (fase 3); aviso ao cliente no link (fase 4); cobrança pelo fornecedor (Onda B); pacotes.
- **Verificação:** `gate_021.sql` (6 blocos, controle negativo conferido à mão: sem a checagem de empresa o gate reprova); `assinatura-planos-gate` 15/15 (com NC1); E2E `planos` (criar, simular sábado e quarta, editar, arquivar, nome repetido, recepção e profissional).

## D-043 — Assinatura, Onda A, fase 2: assinantes, cobranças manuais e uso na comanda (migration 022)
- **Decisão (Platform Owner, 2026-11-16):** "Após merge iniciar a fase 2, migração autorizada". Uma só migration para toda a fase 2; o código entra em PRs seguintes sem novas migrations.
- **Desenho:**
  - `assinaturas`: cliente + plano + estado base (ativa, pausada, cancelada) + início. O **ciclo** e a **situação de pagamento** (em dia, atrasada, suspensa pela tolerância de 7 dias) são **calculados** pelo backend do início, da periodicidade e das cobranças; nada disso é gravado como estado, então não há estado velho para corrigir. O mesmo cliente não assina o mesmo plano duas vezes ao mesmo tempo.
  - `assinatura_cobrancas`: uma por ciclo, vencimento, valor, estado (pendente, paga, cancelada). **Cobrança manual** na Onda A: a equipe marca "paga". Sem fornecedor.
  - `assinatura_usos` (livro-caixa, imutável por trigger como a 009): cada atendimento coberto ou fora da regra, preso ao **item da comanda**, com valor de tabela, valor cobrado, ação aplicada, motivos e quem aprovou.
  - `assinatura_usos_estornos` (imutável): o uso volta ao limite do ciclo quando o **item** é estornado. Um gatilho novo em `comanda_estorno_itens` faz isso; **a 009 não foi tocada**. Decisão do dono: o estorno reverte tudo.
  - `checkout_close_assinatura`: chama o `checkout_close_autoria` de sempre e grava os usos **na mesma transação**; se o uso não achar o item, a comanda inteira é desfeita. Fechamento repetido (idempotente) devolve o já gravado e não duplica uso. O item é achado por (serviço, profissional, preço cobrado); itens iguais são intercambiáveis.
  - O backend calcula o preço cobrado de cada item coberto (o cliente nunca informa valor). A comissão do item coberto a R$ 0 é zero no fechamento; o rateio do ciclo é a fase 3. Fora da regra: comissão normal do serviço sobre o valor cobrado, fora do rateio (decisão do dono).
- **Verificação:** `gate_022.sql` (8 blocos: duplicidade de plano, estado, tenant, cobrança, fechamento com uso, tudo ou nada, imutabilidade, estorno devolve o uso, grants); três controles negativos conferidos (sem o retorno idempotente, sem o casamento por preço, sem o gatilho de estorno o gate reprova); ciclo de rollback e reaplicação.
- **Aplicação (mesmo PR, sem nova migration):**
  - Motor `AssinaturaCicloEngine`: ciclo a partir do início (31/01 → 28/02 → 31/03; bissexto), vencimento (na contratação ou dia fixo), cobranças devidas **calculadas** (só pagas e dispensadas viram linha), situação em dia / atrasada (até a tolerância, ainda usa) / suspensa / pausada / cancelada / cancelamento agendado.
  - Rotas `/api/assinaturas`: listar, detalhe, vender (com ou sem o 1º ciclo pago; valor sempre o do plano), pagar ciclo (uma vez só), pausar, retomar (ciclos da pausa dispensados; o atual é devido), cancelar no fim do ciclo (padrão) ou agora, e `GET /assinaturas/cobertura` (nada gravado). Permissões novas: `assinatura:vender` (operação) e `assinatura:gerir` (gestão, sensível).
  - Comanda: o item de serviço pode trazer `assinaturaId`; o servidor aplica a mesma regra da cobertura, conta os usos da própria comanda, ajusta o preço (R$ 0 ou X%), exige a liberação da gestão quando o plano pede, e fecha com `checkout_close_assinatura`. Comanda toda coberta fecha sem pagamento; se sobrar valor, o pagamento continua obrigatório. A tela nunca informa preço.
  - PWA: Gestão → Assinantes; selo "★ Assinante · Plano X: coberto (2 de 4)" no card da agenda; na comanda, o plano aparece no item com "Não usar o plano", e o resumo mostra o que o plano cobriu. Cache `v1-41-0-assinantes`.
- **Limites conhecidos:**
  - Duas comandas do mesmo assinante fechadas **ao mesmo tempo** podem passar do limite do ciclo por um uso (a contagem é feita pela aplicação, sem trava no banco). Raro no balcão; registrado como risco.
  - Comissão do item coberto a R$ 0 é zero até a fase 3 (rateio do ciclo).
  - O profissional que fecha a própria comanda não aplica plano (não tem `assinatura:ver`); a recepção aplica.
  - Cancelar pela tela usa duas confirmações do navegador (fim do ciclo / agora); melhorar com diálogo próprio.
- **Verificação adicional:** `assinantes-gate` 16/16 (com NC1); E2E `assinantes` (vender, suspensa → pagar → em dia, pausar, retomar, cancelar, papéis) e `assinatura-comanda` (selo na agenda, comanda a R$ 0 sem pagamento, uso preso ao item, "Não usar o plano").

## D-044 — Assinatura, Onda A, fase 3: comissão dos atendimentos de plano e margem por plano (sem migration)
- **Decisão (Platform Owner, 2026-11-16):** "Aprovado o rateio por quantidade. Conforme recomendação" (D-042); "Após Merge ok, iniciar fase 3". Percentual da comissão configurável por plano.
- **Entregue (calculado, nada gravado: usa os usos e as cobranças da 022):**
  - `AssinaturaComissaoEngine`, por plano e por mês:
    - **rateio:** % do plano × cobranças **pagas no mês** (pela data do pagamento), dividido entre os profissionais pela **quantidade de atendimentos cobertos** do plano no mês (pela data da comanda), sem sobra de centavo. Mês sem atendimento: o valor não é distribuído (fica com o salão) e aparece no relatório.
    - **tabela:** % de comissão do serviço (gravada no item) × valor de tabela, por atendimento.
    - **fixo por uso:** o valor fixo do plano, por atendimento.
    - Ficam de fora: uso estornado e uso **fora da regra** (já teve comissão normal sobre o valor cobrado na comanda).
  - A comissão de assinatura entra em **"Meus ganhos"** (linha própria) e no **saldo a pagar** (pagamento de comissão da 010), sem mudar o que já existia para quem não tem plano.
  - `GET /api/assinaturas/relatorio?mes=AAAA-MM` (`painel:financeiro`): por plano, receita, comissão, margem, valor de tabela usado, atendimentos por profissional, valor não distribuído e assinantes que usaram mais do que pagam (sinal para rever o plano, nunca ação automática).
  - PWA: "Resumo do mês" em Gestão → Assinantes (só a gestão); linha "Comissão de assinaturas" em Ganhos.
- **Conferência com o AppBarber:** o exemplo lido (3 e 19 atendimentos) reparte 104,95 em 14,31 e 90,64 no gate. A conferência com dados reais fica para o primeiro mês com assinantes no HOPE OS: comparar o relatório com as "Comissões geradas" do AppBarber no mesmo período; se divergir de um jeito que aponte o tempo dos serviços, evoluir para rateio por minutos (o uso já guarda o necessário).
- **Limites:** é calculado na hora, então mudar a regra do plano ou pagar uma cobrança atrasada muda o mês em aberto (como o resto dos ganhos). Comissão já paga não é refeita: o saldo mostra a diferença.
- **Verificação:** `assinatura-comissao-gate` 9/9 (com NC1); E2E `assinantes` (resumo do mês da gestão; recepção sem o resumo), `ganhos`, `finops`, `metas` e `assinatura-comanda` verdes.

## D-045 — Comissão de assinatura liberada só depois do fim do ciclo pago (corrige o D-044)
- **Achado (2026-11-16, pergunta do dono):** o desenho e o plano previam o rateio "no fechamento do ciclo", mas o D-044 calculou por mês do calendário e na hora, com a comissão entrando no saldo a pagar antes de o ciclo terminar. Risco real: pagar no meio do mês e depois a parte do profissional cair (saldo negativo). O desvio não estava declarado no D-044. Classificação: PARCIAL → corrigido aqui.
- **Decisão (Platform Owner, 2026-11-16):** "1. A, 2. Sim conforme recomendação" — opção A (por assinante e por ciclo) e rateio sobre o valor líquido.
- **Regra implementada (sem migration):**
  - Unidade: cada **ciclo pago de cada assinante**. Valor líquido = mensalidade paga − taxa da forma de pagamento (`taxa_pct` e `taxa_fixa_centavos` da forma).
  - Rateio: % do plano × valor líquido, dividido entre os profissionais que atenderam **aquele assinante naquele ciclo**, pela quantidade de atendimentos cobertos. Tabela e fixo por uso: por atendimento do ciclo.
  - **Liberação:** no dia seguinte ao fim do ciclo **e** depois do prazo de recebimento da forma (`dias_recebimento`, contado do pagamento), o que vier por último. Antes: **prevista** (aparece em Ganhos e no resumo, fora do saldo). Ciclo não pago: atendimentos **aguardando pagamento**.
  - Ganhos e saldo a pagar contam **só a liberada**; o relatório do mês mostra os ciclos liberados no mês (bruto, taxa, líquido, comissão, margem) e o que está em aberto.
  - A forma da cobrança passa a ser uma forma **cadastrada e ativa**; a venda valida a forma **antes** de gravar (corrige um bug: com forma inválida, a assinatura ficava gravada sem o pagamento).
- **Diferença em relação ao AppBarber (aceita pelo dono):** o AppBarber junta o clube inteiro num período; aqui cada assinante fecha no seu ciclo. Os números não batem um a um com as "Comissões geradas" do AppBarber.
- **Verificação:** `assinatura-comissao-gate` 10/10 (Pix libera no dia seguinte ao fim do ciclo; crédito 3% D+30 libera depois do prazo, sobre o líquido; ciclo não pago aguarda; NC1 sem a regra de liberação reprova); `assinantes-gate` 16/16 (forma desconhecida, desativada ou ausente recusada, sem gravação parcial); E2E `assinantes`, `ganhos`, `finops`, `comanda`, `assinatura-comanda` verdes.

## D-046 — Bloqueio do profissional é dele: só ele remove; histórico imutável com cópia conferível (Onda 0, sem migration)
- **Pedido (Platform Owner, 2026-11-16):** log de bloqueio de horário pelo colaborador como prova de autonomia (contra vínculo CLT; parceria da Lei 13.352/2016), sempre auditado.
- **Decisões do dono (2026-11-16):** (1) o profissional **pode cancelar** o próprio bloqueio — a trilha imutável guarda o original; proibir cancelar seria restrição do salão sobre o tempo dele, o contrário da autonomia que se quer provar; (2) bloqueio ou ausência **marcado pelo próprio profissional só ele remove** (gestão, recepção e admin veem, mas recebem 403 `BLOQUEIO_DO_PROFISSIONAL`); (3) registrar o **aceite do profissional na escala semanal** (escala feita em comum acordo) — fica para a Onda 1, que exige migration.
- **Fato que mudou o desenho:** a trilha já existia desde a 013 (`disponibilidade_eventos`: quem, quando pela hora do servidor, antes e depois; UPDATE/DELETE barrados por trigger). Remover um bloqueio nunca apagou a prova.
- **Entregue (sem migration):**
  - Autor do bloqueio = `created_by` gravado pelo banco, comparado ao profissional vinculado ao login (nunca vem da tela). `GET /disponibilidade` devolve `marcadoPeloProfissional`.
  - `GET /disponibilidade/bloqueios/historico` (`escala:ver`; o profissional vê só o seu): cada bloqueio/ausência marcado e removido, quando, por quem e a origem (o próprio profissional ou a equipe). Vem com CSV e o **SHA-256** do CSV; fórmula de planilha neutralizada.
  - PWA (Escalas): selo "marcado pelo profissional", sem "Remover" para quem não é o dono; "Histórico de bloqueios" com "Baixar cópia (CSV)" e o código de conferência. Cache `v1-47-0`.
- **Limites (não esconder):** o SHA-256 prova que a cópia baixada não mudou depois de gerada, não que o banco não foi alterado antes; quem administra o banco ainda pode desligar o trigger. Bloqueio marcado pela equipe para o profissional continua removível pela equipe (e fica no histórico como "equipe"). Não é parecer jurídico: contrato homologado, CNPJ, sem exclusividade e sem jornada imposta seguem sendo o principal.
- **Onda 1 (migration 023, exige autorização):** aceite da escala pelo profissional; operação "encurtar" atômica ligada ao bloqueio original; origem gravada no evento; corrente de hash nos eventos com rotina de conferência. **Onda 2:** ancoragem diária fora do banco (OpenTimestamps ou carimbo do tempo ICP-Brasil, com custo).
- **Verificação:** `disponibilidade-gate` 22/22 — D21 (admin, gestor e recepção 403; o da gestão a gestão remove; o profissional remove o seu) e D22 (só o próprio, origem, ordem, SHA-256 confere, fórmula neutralizada, token legado 403); controle negativo sem a regra: D21 e D22 reprovam. E2E `escalas`: histórico, download com SHA-256 igual ao da tela, recepção e admin sem "Remover".

## D-047 — Prova de autonomia, Onda 1 (migration 023): trilha encadeada, encurtar, aceite da escala + Agendar ou Bloquear na agenda
- **Decisão (Platform Owner, 2026-11-16):** "2. aprovado" (migration 023 da Onda 1 do D-046) e "ao clicar em um [horário] duas opções (criar agendamento ou bloquear o horário), desenvolva as estratégias inteligentes".
- **Migration 023 (aplica no merge):**
  - `disponibilidade_eventos` ganha `seq`, `origem`, `hash_anterior`, `hash`. Gatilho antes de inserir: hora do servidor (`now()`, ignora a de quem chama), origem calculada pelos vínculos (o próprio profissional ou a equipe, ignora a de quem chama), `seq` por empresa e **SHA-256 encadeado** (cada evento leva o hash do anterior). Os eventos de antes da 023 **não são alterados**: o primeiro elo guarda o hash de todos eles. TRUNCATE barrado como UPDATE e DELETE.
  - `disponibilidade_cadeia_conferir`: confere a corrente inteira e diz onde quebrou (conteúdo alterado, evento apagado do meio, eventos antigos alterados).
  - `disponibilidade_excecao_encurtar`: bloqueio ou ausência do profissional fica menor (mesmo id; antes e depois na trilha); só dentro do original.
  - `disponibilidade_escala_aceitar`: só o próprio profissional, só a última escala definida para ele (se mudou, recusa), idempotente; o aceite guarda os períodos aceitos e o hash da definição.
  - Defesa também no banco: o que o profissional marcou só ele remove ou encurta (remover da 013 reescrito com a mesma assinatura).
- **Backend:** `POST /disponibilidade/excecoes/:id/encurtar`, `POST /disponibilidade/escala/aceitar`, `GET /disponibilidade/cadeia`; `GET /disponibilidade` traz o aceite de cada profissional (aceita, pendente, sem registro); o histórico passa a incluir encurtar, escala definida e escala aceita, com `seq` e `hash` por linha, e o CSV termina com o último elo da trilha.
- **Agenda (sem migration):** bloqueios e ausências aparecem na grade (hachurado) e o trecho deixa de ser oferecido. Tocar num horário livre oferece **Agendar cliente** ou **Bloquear horário** (quem não pode bloquear vai direto agendar). Fins sugeridos: 30 min, 1 hora, **até o próximo cliente** e **até o fim do expediente** (da disponibilidade do dia); motivos rápidos (Almoço, Pessoal, Médico, Curso). Tocar num bloqueio: encurtar ("Terminar o bloqueio aí" quando está em curso) ou remover; o que o profissional marcou aparece só leitura para a equipe.
- **Fora da escala na grade (pedido do dono, 2026-11-16):** onde o profissional não trabalha (dia inativo, folga, unidade fechada, fora do horário da escala) a grade fica em **cinza claro pontilhado**, com rótulo quando é o dia inteiro (Folga, Fechado, Escala não publicada). Vem de `GET /disponibilidade/grade?data=` (horário de trabalho de cada profissional visível, sem recortar os bloqueios, que são desenhados à parte). Hierarquia: livre (borda tracejada) < fora da escala (pontilhado, sem rótulo por trecho) < bloqueado (hachura diagonal com rótulo) < agendamento (cor cheia). Legenda acima da grade (padrão + rótulo, não só cor). Horário fora da escala não oferece "Bloquear" (não há o que bloquear); "Agendar" continua e o servidor pede confirmação para encaixar.
- **Escalas:** "Aceitar minha escala" para o profissional; "Aceita pelo profissional em …" / "Aguardando aceite" para a gestão; "Encurtar" nas datas especiais; a aba recarrega ao abrir; histórico com o estado da trilha.
- **Limites:** quem administra o banco ainda pode reescrever a corrente inteira; a prova contra isso é a cópia guardada fora do sistema (o CSV leva o último elo). Ancoragem externa automática (OpenTimestamps ou carimbo ICP-Brasil) segue para a Onda 2. Escala convertida em 2026-11-15 sem evento de definição aparece como "anterior ao registro": a gestão salva de novo para pedir o aceite.
- **Verificação:** `gate_023.sql` (encadeamento, hora e origem do servidor, adulteração de conteúdo, evento apagado e evento antigo detectados, truncate e update barrados, encurtar dentro do original e só pelo dono, aceite só do próprio e só da última, acesso); controle negativo: sem a defesa do remover e sem a checagem de conteúdo, o gate reprova. `disponibilidade-gate` 25/25 (D23 encurtar, D24 aceite, D25 corrente). E2E `agenda-bloqueio` (Ana bloqueia pelo horário livre com "até o próximo cliente", grade, encurta; recepção só lê o dela e agenda no Bruno; aceite pela tela; trilha íntegra) e `escalas`, `csp`, `slots`, `agora`, `series`, `atendimento` verdes.

## D-048 — Camadas na ordem de abertura, card do agendamento compacto e editável, padrão dos modais (sem migration)
- **Pedido (Platform Owner, 2026-11-16):** editar campos do card do agendamento, card menor, botões menores, redesign dos modais e "campos que eu clico e o modal abre por baixo"; scan minucioso.
- **Scan (evidência):** 18 overlays em `div` (16 modais e 2 folhas) com o mesmo `z-index: 300`: o de cima era o que vinha depois no HTML, não o último aberto. Teste de todos os pares (abre A, depois B): **171 de 342 (50%) abriam por baixo**. Casos reais: Conta → Cliente, Serviço, Profissional e Lista de espera; card → Reagendar e Novo agendamento. Os `<dialog>` nativos (lembretes, série, etapas, confirmações) já ficavam no topo e nenhum abre modal comum. Classificação: REAL, corrigido.
- **Correção:** pilha de camadas em `utils.js`: `openModal` e um observador de classe (cobre quem mostra o overlay sem `openModal`) dão a cada overlay aberto o z-index seguinte; Esc fecha só o de cima. Depois: **0 de 342** pelos dois caminhos.
- **Card do agendamento:** cabeçalho com cliente, situação, faixa de horário e confiabilidade numa linha; Serviço, Profissional, Quando e Duração em grade 2×2, tocáveis (✎) para quem tem `agenda:editar` (o profissional que só mexe no próprio não troca de profissional). O editor abre **dentro do card** (sem outro modal). Serviço, profissional e quando gravam pelo **reagendamento** (atômico, sem conflito, na trilha; fora da escala e horário ocupado pedem confirmação de quem pode encaixar); **trocar só serviço ou profissional no mesmo dia e hora mantém "Confirmado"** (mudança no servidor); mudar dia ou hora volta para "agendado" (o cliente reconfirma), com aviso. Quando sugere os horários livres do dia escolhido. Duração por `PATCH /agenda/:id/duracao` (−15/+15). Ações: "Fazer checkout" primeiro e largo; as outras em grade de 2 colunas com botões de 40 px; série e etapas compactas. "Reagendar" saiu do card (o Quando faz o mesmo, sem modal). Altura medida: 377 px num celular de 844 px.
- **Modais:** no celular viram folha que sobe de baixo; cabeçalho fixo com título e ✕ (44 px) montado no primeiro uso; altura até 88% da tela com rolagem interna; respeita a área segura do iPhone; botões de 44 px com menos preenchimento.
- **Limites:** editar no lugar (sem criar novo agendamento) com garantia de conflito no banco exigiria migration 024 (não autorizada): a edição usa o reagendamento, e o histórico do card mostra o "reagendado". Trocar o cliente de um agendamento não está no card. O botão "voltar" do Android ainda fecha a tela, não o modal de cima.
- **Verificação:** `series-gate` 18/18 com S17 (confirmação mantida no mesmo dia e hora; outra hora volta para agendado; controle negativo reprova); suíte offline verde; E2E `card-agendamento` (novo: card compacto e no tamanho, trocar serviço mantém confirmado, mudar dia com horários sugeridos, duração +15, Conta → Novo cliente por cima, ✕, Esc fecha só o de cima, profissional sem trocar profissional) e a **suíte E2E completa, 31/31**, verde (o E2E de permissões pegou o ✕ com 36 px; corrigido para 44 px).

## D-049 — Regras da agenda configuráveis: prazo único de cancelamento, janela, futuros, intervalo, atraso e regras por serviço (migration 024)
- **Pedido (Platform Owner, 2026-11-17):** "Desenvolver as regras de tempo de cancelamento tardio, cancelamento em tempo, agendamento futuro, número de agendamentos futuros permitidos. E outras regras inteligentes e configuráveis." Antes, sobre a troca de cliente: "O cliente desistiu com antecedência e foi trocado por outro não é falta".
- **Decisões do dono (2026-11-17):** autoriza a **migration 024**; na **recepção a regra avisa e deixa seguir**; **um prazo de cancelamento só**, configurável.
- **Achado (REAL):** o link do cliente deixava cancelar até 2 h antes (prazo do salão, 016), mas a confiabilidade contava como tardio todo cancelamento com menos de **24 h fixas no código**: quem cancelava dentro da regra oferecida perdia 8 pontos. E qualquer cancelamento, mesmo antecipado, **zerava a sequência de comparecimentos** (até +20).
- **Regras (024):** empresas `agenda_janela_dias_recepcao`, `agenda_max_futuros_recepcao`, `agenda_intervalo_min_dias` (mesmo cliente e mesmo serviço), `agenda_atraso_alerta_min`; serviços `cancelamento_prazo_min` e `antecedencia_min_online` (vazio = o do salão). Faixas no banco. Sem configuração, **nada muda** (todas nascem desligadas; o atraso só mostra no card).
- **Prazo único:** serviço > salão (`online_cancelamento_prazo_min`) > 120 min. Vale para o link do cliente (cancelar e remarcar), para o diálogo de cancelar na recepção ("Dentro do prazo: não conta contra o cliente" ou "Cancelamento tardio: faltam X e o prazo é Y. Conta na confiabilidade") e para a confiabilidade.
- **Confiabilidade:** tardio = cancelado a menos do prazo do horário; **cancelar em tempo não é falta e não zera a sequência**; o tardio conta (−8) e zera.
- **Recepção:** criar ou mudar o dia de um horário passa pelas regras; violou → 409 `REGRAS_DA_AGENDA` com os avisos e nada é gravado; a tela pergunta "Seguir mesmo assim?"; seguindo (`aceitarAvisos`), grava e o histórico do horário guarda `excecao_regras`. Mudar só a hora ou o serviço no mesmo dia não passa pelas regras. Vale no novo agendamento, no card, no modal de reagendar e no arrastar.
- **Link online:** antecedência própria do serviço (ex.: química só com 24 h); intervalo mínimo no mesmo serviço **bloqueia** sem revelar a data do outro horário (quem digita um número não descobre a agenda do dono dele). Janela, máximo de futuros e régua de faltas seguem como estavam.
- **Atraso:** passou do alerta e o cliente não chegou → o card mostra "⏱ atrasado N min" e destaca o no-show. Nada é marcado sozinho.
- **Tela:** Gestão → **Regras da agenda** (prazo, janela, futuros, intervalo, atraso, régua de faltas, num lugar só); Cadastros → Serviço com "Antecedência no link" e "Prazo de cancelamento" próprios.
- **Retirado na verificação:** um aviso fixo de "mesmo dia" (sempre ligado) mudava o comportamento de quem não configurou nada e quebrou a suíte (corte e barba marcados separados são legítimos). Regra desligada não muda nada.
- **Fica para a próxima:** troca de cliente no card ("Corrigir" e "Passar a vaga", vaga repassada neutra na confiabilidade, sugestões da lista de espera) — desenho em D-048/conversa de 2026-11-17, ainda não implementado. Séries (recorrência) não passam pelas regras de futuros (são explícitas).
- **Verificação:** `gate_024.sql` (padrões, faixas, acesso) e ciclo de rollback; `agenda-regras-gate` 8/8 (motor, confiabilidade com prazo e sequência, PATCH empresa e serviço, 409 e exceção no histórico, reagendar, confiabilidade pela rota com prazo do salão e do serviço); controles negativos (sem avisos: R02/R06/R07 reprovam; sem a correção da sequência: R03 reprova); `agendamento-online-config-gate` 14/14 (O11: antecedência do serviço e intervalo sem vazar a data); `piloto-gate` 16/16 (corrigida a chamada de `isLateCancel` que recebia o índice do `filter` como prazo); suíte offline verde; **E2E completo 32/32** com o novo `regras-agenda`.

## D-050 — Gestão de agenda e escalas: auditoria, calendário do mês, datas avulsas, conflitos visíveis, filtro de profissionais e Escalas em blocos (sem migration)
- **Pedido (Platform Owner, 2026-11-17):** gestão inteligente de agenda, disponibilidade e escalas (referências Booksy, Boulevard, Fresha, Deputy como hipóteses), preservando arquitetura; depois: "Verifique se não está sendo feito na tela errada… nessa tela [Gestão → Escalas] de forma otimizada & inteligente, com economia de espaço. Apple style bentogrid".
- **Auditoria (regra → estado atual, com evidência no código):**
  - Interseção unidade ∩ escala ∩ exceções − bloqueios − fechamento parcial; unidade fechada bloqueia; exceção do profissional não reabre a unidade (`DisponibilidadeEngine.disponibilidadeDoDia`): **REAL**.
  - Exceção por data prevalece sobre a semanal no mesmo escopo (horário excepcional substitui a semanal do dia): **REAL**.
  - Prévia antes de reduzir horário ou fechar, com os agendamentos afetados; nada é cancelado ou movido sozinho; "manter" fica registrado (`decisoesPara`, 409 `CONFLITOS_PENDENTES`, lote com `simular`): **REAL**.
  - Escalas em lote para um, vários ou todos, modelos e alternância de semanas (013/015): **REAL**. **Datas não consecutivas: AUSENTE → feito aqui.**
  - Recorrência com prévia por ocorrência (livre, ocupado, fora da escala, passado) e alteração "só esta / esta e as próximas / todas" (018): **REAL**.
  - Vários serviços em sequência com o mesmo ou outros profissionais e espera máxima (019, `AtendimentoEngine`): **REAL** na recepção; **AUSENTE** no link do cliente.
  - Encaixes que reduzem lacuna (`SlotEngine` "Encaixes ideais"): **PARCIAL** (heurística de desperdício, sem regra configurável de intervalo entre ofertas).
  - Recursos (cadeira, sala, equipamento) e tempo de processamento/finalização do serviço: **AUSENTE** no banco → exige **migration 025 (não autorizada)**.
  - Lista de espera: estados `aguardando`, `contatado`, `agendado`, `cancelado`; a tela só oferece contato por WhatsApp ("Avise quem preferir"): identificação e notificação **REAIS**; **reserva temporária AUSENTE** (não é comunicada como reserva).
  - Calendário mensal, filtro de vários profissionais e conflito visível na grade: **AUSENTES → feitos aqui.**
  - Fuso: `APP_TIMEZONE` no servidor; concorrência: conflito checado e gravado atomicamente no banco (`agendamento_criar`) e testes de concorrência SQL: **REAL**.
- **Feito (sem migration):**
  - `GET /disponibilidade/mes`: por dia, estado da unidade (aberta, fechada, especial, sem expediente) com motivo, agendamentos ativos, **conflitos** (agendamento fora da disponibilidade, inclusive sobre bloqueio) e ausências/bloqueios; respeita o escopo do profissional; filtro por profissionais.
  - Lote com `operacao.datas` (1 a 62 datas não consecutivas; uma exceção por data; prévia "em N data(s): …"); a função do banco (015) já aceitava até 2000 exceções.
  - Componente `calendarioMes.js` (símbolo + rótulo para leitor de tela, não só cor: ★ especial, ✕ fechado, – sem expediente, ⚠N conflito, nº de agendamentos).
  - **Agenda:** tocar na data do dia abre o mês para **navegar**; filtro de vários profissionais (chips); agendamento em conflito marcado na grade ("⚠ fora da escala" / "⚠ sobre bloqueio", contorno tracejado) até alguém resolver.
  - **Gestão → Escalas redesenhada em blocos (bento):** ações (Alterar vários, Nova data especial); **calendário de gestão** (tocar num dia abre "Nova data especial" já na data; "Escolher datas" marca datas avulsas e abre o lote com a prévia); semana padrão em **pontos por dia** + horas resumidas ("Ter–Sex 09:00–19:00 · Sáb 08:00–18:00"); números de pendências (aguardando aceite, datas especiais); datas especiais, histórico e modelos em blocos. 2 colunas no celular, 4 no desktop; alvos de toque de 44 px.
- **Correção de rota (pedido do dono):** a gestão de datas tinha ido para a agenda; ficou em Escalas. Na agenda o mês só navega.
- **Limites e riscos:** recursos e processamento exigem migration 025; sugestão de horários com intervalo configurável entre ofertas e alternativas automáticas no link público (vários serviços) não foram feitas; o profissional vê o pontilhado e o conflito só na própria coluna; o cálculo do mês percorre todos os agendamentos da empresa (aceitável no volume atual; paginar por mês se crescer).
- **Verificação:** `disponibilidade-gate` 28/28 (D27 mês: especial, fechada, conflito mantido, escopo do profissional; D28 datas avulsas e limites) com controle negativo (sem contagem de conflito e sem as datas avulsas: D27/D28 reprovam); suíte offline verde; E2E novo `agenda-mes` (estados acessíveis, tocar no dia leva a agenda, conflito na grade, filtro de profissionais, Escalas em blocos, tocar no dia abre a data especial, datas avulsas → lote → ausência só nelas) e **suíte E2E completa 33/33**.

## D-051 — Troca de cliente no card: "Corrigir" e "Passar a vaga" (sem migration)
- **Pedido (Platform Owner, 2026-11-17):** "Troca de cliente no card"; antes: "O cliente desistiu com antecedência e foi trocado por outro não é falta"; no AppBarber a troca só existe na comanda do checkout.
- **Duas intenções, registros diferentes** (`POST /agenda/:id/trocar-cliente`, `motivo`):
  - **correcao** (engano de cadastro): o original vira "reagendado" (neutro) e o histórico registra `cliente_corrigido`; nada conta contra quem estava.
  - **vaga_repassada** (o cliente desistiu e outro assume): o original vira "cancelado" e o histórico registra `vaga_repassada`; a **confiabilidade ignora** esse cancelamento (não é falta, não é tardio, não zera a sequência), porque o salão não perdeu o horário.
- **Regras:** mesmo horário, profissional, serviço, duração e valor, gravado pelo `agendamento_criar` (atômico); o novo nasce "agendado" (quem vem é que confirma); só horário futuro agendado ou confirmado; só quem edita a agenda de todos (o profissional não troca); o cliente novo passa pelas regras da agenda (avisos de D-049, com "seguir mesmo assim"); o link pessoal e a série do anterior não acompanham; se o novo estava na lista de espera do serviço, ela passa a "agendado".
- **Tela:** o nome do cliente no topo do card fica tocável (✎); o editor no próprio card pergunta o motivo (explica o efeito para quem sai) e sugere: lista de espera do serviço, mesma família (sobrenome ou telefone), recentes do profissional na semana, e busca pelo nome. O histórico do card mostra "Cliente corrigido" e "Vaga repassada a outro cliente (não conta como falta)".
- **Achado na verificação:** os tipos de evento da agenda são uma lista fechada (`AgendaEventosService.TIPOS`); um tipo novo era descartado em silêncio (o evento é best-effort). Os dois tipos novos entraram na lista; o teste pegou.
- **Limites:** não há cadastro rápido de cliente dentro do editor (cadastra em Clientes e volta); a troca não reaproveita a confirmação do anterior por desenho.
- **Verificação:** `agenda-regras-gate` 11/11 (R09 corrigir; R10 passar a vaga com a confiabilidade de quem desistiu intacta e **controle negativo** sem o evento = tardio; lista de espera vira agendado; R11 recusas: mesmo cliente, motivo, passado, cancelado, profissional); offline verde; E2E `card-agendamento` (passar a vaga pela busca; profissional sem o botão) e **suíte E2E completa 33/33**.
