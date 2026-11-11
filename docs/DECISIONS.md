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

