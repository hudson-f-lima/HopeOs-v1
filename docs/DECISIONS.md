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
