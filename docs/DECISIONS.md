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

## D-052 — Checklist de lançamento (20 itens de segurança): auditoria com evidência e correções
- **Pedido (Platform Owner, 2026-11-17):** lista "20 coisas pra pedir pro seu Claude Code fazer antes de lançar o seu app".
- **Resultado por item (evidência no código, na configuração e em produção, só leitura):**
  1. Chaves de API escondidas — **REAL**: nenhuma chave no front; `service_role` só no backend (Render).
  2. Segredos fora do Git — **REAL**: varredura do histórico só achou placeholders (`COLE_AQUI…`) e uma chave falsa de teste. (A senha do AppBarber colada no chat nunca foi para o Git, mas **precisa ser trocada**.)
  3. Chave pública do banco — **N/A melhor**: o front não fala com o banco; tudo passa pelo backend.
  4. RLS — **REAL**: RLS ligada nas 50 tabelas, sem política (nega tudo a anon/authenticated); o aviso "sem políticas" do Supabase é INFO e é o desenho.
  5. Dados sensíveis criptografados — **PARCIAL**: links e credenciais guardados só como hash; disco criptografado pelo Supabase; telefone e nome em texto (necessário para operar).
  6. Autenticação no servidor — **REAL**: RBAC por ação e escopo em toda rota.
  7. Logs — **REAL**: tokens nunca em URL (morgan registra só a URL); erros 500 sem detalhe ao cliente, com requestId.
  8. Adulteração de campos — **REAL**: `empresa_id` só do login; corpos com lista de campos permitidos; campos perigosos recusados.
  9. Sessão — **PARCIAL**: token no `localStorage` (não em cookie), exposto a XSS; mitigado agora pela CSP no app (item 18). Cookie httpOnly exige mudança de arquitetura (front no GitHub Pages e API no Render = cookie entre sites + CSRF): **proposto**.
  10. Hash de senhas — **REAL**: Supabase Auth.
  11. Tentativas de login — **REAL** (em memória, por IP e e-mail; zera ao reiniciar o servidor: PARCIAL documentado).
  12. Proteção contra bots — **REAL** no link público (armadilha invisível, limite por IP e por número, teto diário).
  13. Queries parametrizadas — **REAL**: supabase-js e RPCs com parâmetros; nenhum SQL montado com texto.
  14. Validar entradas — **REAL**: validadores por rota.
  15. Escapar conteúdo — **REAL**: `escapeHtml`, varredura RT-13 contra interpolação de dados de cadastro, `encodeURIComponent`.
  16. Upload de arquivos — **N/A**: não há upload.
  17. Respostas enxutas — **REAL**: `publica()` na empresa, contato do cliente recortado para quem não pode ver.
  18. Headers de segurança — API **REAL** (nosniff, DENY, no-referrer, HSTS). **App principal: AUSENTE em produção (CRÍTICO de configuração)**: a CSP estava no `render.yaml`, mas a PWA é servida pelo GitHub Pages, que não envia esses headers; conferido em produção (`curl -I`: só HSTS). **Corrigido:** CSP no `<meta>` do `index.html` (mesma do render.yaml + API local de dev), `referrer` no-referrer, e anti-clickjacking em `js/app.js` (dentro de iframe o app fica oculto), porque `frame-ancestors`/X-Frame-Options não funcionam em `<meta>`.
  19. HTTPS — **REAL**: HSTS no Pages e no Render.
  20. Dependências — **REAL**: `npm audit` de produção com 0 vulnerabilidades; **adicionado ao CI** (`npm audit --omit=dev --audit-level=high` antes dos testes).
- **Fica com o dono:** ligar a **proteção contra senhas vazadas** no Supabase (Auth → senhas; aviso WARN do Supabase); trocar a senha do AppBarber.
- **Verificação:** E2E novo `seguranca-pwa` remove os headers da resposta (como o GitHub Pages) e prova: o app funciona com a CSP do `<meta>`; script inline injetado não roda; dentro de iframe o app fica oculto; **controle negativo** sem o `<meta>`, o mesmo script roda. Suíte offline verde; E2E completo verde (`regras-agenda` corrigido: a conferência de atraso só roda quando o horário cai na grade 08:00–20:00, antes falhava de madrugada).

## D-053 — Agenda inteligente: confiabilidade, clareza e cabeçalho compacto (sem migration)
- **Pedido (Platform Owner, 2026-11-17):** auditar e evoluir a agenda com prioridade confiabilidade → clareza → velocidade → inteligência, usando uma imagem de referência (data → profissionais → grade). Sem deploy nem mudança em produção.
- **Achados P0 (inspeção na PWA, 390×844, dev-memory-api):**
  1. **CRÍTICO — coluna do colega "livre" para o profissional.** `GET /agenda` devolve ao profissional (escopo próprio) só os horários dele, mas a grade mostrava as colunas de todos: a do colega aparecia vazia, com horários tocáveis, sem estar livre. Corrigido: com escopo próprio a grade mostra só a coluna dele e o seletor fica travado em "só você".
  2. **Contadores com escopo diferente da grade.** Total do dia, contagem nas pílulas da semana e total da semana contavam todos os profissionais, mesmo com o filtro mostrando só alguns. Corrigido: um único escopo (`profsNaGrade`) para grade, dia, semana e colunas; cada total diz o escopo ("no dia", "de 1 profissional"/"de todos os profissionais"); com falha de carga o total da semana avisa que pode estar incompleto.
  3. **Controles enganosos.** O botão com ícone de menu (☰) voltava uma semana e a pílula da data avançava uma semana; busca, filtro e sino eram ícones decorativos (`aria-hidden`) sem ação (MOCKADO). Corrigido: setas ‹ › rotuladas "Semana anterior/Próxima semana", data abre o calendário do mês, ícones viraram botões reais com rótulo.
  4. **Dois filtros de profissional ao mesmo tempo.** Tocar no cabeçalho da coluna esmaecia as outras (estado oculto que os totais não refletiam) além dos chips. Removido; fica só a seleção múltipla.
  5. **Número que não é dado.** Anel e rótulo de "ocupação" mostravam "—" fixo. Removidos (nada estimado na tela).
  6. **Cortes e sobreposição.** "08:00" cortado sob o cabeçalho; "Hoje"/"Lembretes" flutuantes e o "+" cobriam a grade; a data quebrava em duas linhas. Corrigido: 08:00 inteiro, Hoje no cabeçalho, Lembretes no sino, folga no fim da grade para o "+".
- **Desenho (P1):** uma linha com "Agenda" e ícones (buscar, mês, lembretes, informações); linha da data (‹ data ⌄ › Hoje); semana compacta (dia + número + ponto quando há agendamento, número exato no rótulo acessível); "Profissionais · Todos (N) ⌄" abre a seleção múltipla; total do dia ao lado; grade logo em seguida com cabeçalho do profissional em linha. Lista de espera, legenda e total da semana no painel de informações; painéis abrem um por vez (Esc fecha). Conta, versão e Sair saem do topo e vão para Conta; no celular a barra "HOPE OS" some. Busca procura cliente, telefone ou serviço **só na semana carregada** e diz isso; o resultado abre o card. Grade: topo de 556px → 231px e área visível de 288px → 533px em 390×844.
- **Inteligência (P2), auditoria sem código novo:** explicação de indisponibilidade **REAL** (o servidor diz a origem: unidade fechada, folga, fora da escala); sequência com o profissional escolhido, alternativas e fracionado **REAL** no atendimento com vários serviços (D-040, profissional fixado nunca é trocado); sugestão não reserva e o servidor revalida ao gravar **REAL**; política "compacta" **PARCIAL** (encaixe ideal = menor sobra, "ver todos" = flexível; sem escolha de política pela unidade — configurável exigiria campo novo, migration 025, não autorizada); compatibilidade da lista de espera com vaga aberta **AUSENTE** (hoje só acompanha a troca de cliente); recursos (cadeira/sala) e tempo de processamento **AUSENTE** (exige migration 025).
- **Verificação:** E2E novo `agenda-inteligente` (21 conferências: layout, rótulos, alvos ≥ 44px, mesmo escopo com e sem filtro e com cancelado, seleção múltipla, painéis, busca, mês, Hoje, horário livre com data e hora, profissional só com a própria coluna, desktop); E2E de login, convite e csp abrem Conta antes de Sair; `agenda-mes` abre o seletor antes dos chips. Cache do service worker `hope-os-shell-v1-56-0-agenda-inteligente`.

## D-054 — Migration 025: política de sugestão de horários e lista de espera compatível
- **Autorização (Platform Owner, 2026-11-17):** "Autorizo migração"; escopo escolhido: política de horários + lista de espera compatível com faixa. Recursos (cadeira/sala) e tempo de processamento ficaram de fora (seriam uma 026 à parte).
- **Migration 025** (aplica em produção no merge): `empresas.agenda_politica` (null, `flexivel`, `equilibrada` ou `compacta`, com check); `lista_espera.faixa_inicio`/`faixa_fim` (as duas ou nenhuma, início antes do fim). Rollback `025_down.sql`; gate `gate_025.sql` (padrões, valores recusados, tabelas não expostas a anon/authenticated); ciclo de rollback verde.
- **Política (SlotEngine.aplicarPolitica), regras explicáveis, nada reservado:**
  - null (padrão): como antes — a recepção vê primeiro os encaixes ideais; o link mostra todos os livres;
  - flexível: todo horário livre;
  - equilibrada: só horários que não deixam sobra menor que o menor serviço; se o dia ficar sem nenhum, os encaixes ideais;
  - compacta: só os encaixes ideais (colados no início, no fim ou em outro horário, com a menor sobra).
  - Na recepção o servidor marca `sugerido` e devolve todos os livres ("Ver todos" continua; quem agenda decide e o POST revalida conflito). No link, só o que a política oferece, e gravar fora dela é recusado (`HORARIO_INDISPONIVEL`).
  - Configuração em Gestão → Regras da agenda → "Sugestão de horários", com a regra explicada na tela.
- **Lista de espera compatível (ListaEsperaEngine, `GET /lista-espera/compativeis`, permissão `espera:ver`):** dada a vaga (dia, hora, profissional), mostra quem combina — ativo (aguardando/contatado), profissional pedido ou sem preferência, dia pedido ou qualquer, faixa que contém a hora, serviço que o profissional faz e que cabe no espaço livre — com o motivo de cada um. Ordem: quem pediu exatamente isto (dia, profissional, faixa), depois quem espera há mais tempo. **Não reserva, não muda status e não manda mensagem.**
  - Na agenda, tocar no horário livre mostra "Na lista de espera, combinam (N)"; escolher abre o agendar já preenchido; ao gravar, `listaEsperaId` vai junto e o servidor marca o item "agendado" (mesmo cliente e item ativo, senão `WAITLIST_MISMATCH` antes de gravar; exige `espera:gerir`).
  - Quem não pode bloquear e não tem ninguém compatível continua indo direto para o agendar.
- **Verificação:** gate offline `agenda-politica-gate` (9 testes; o PE04 tem controle negativo: o mesmo pedido no link dentro da política grava, provando que a recusa é da política); E2E `agenda-politica-espera` (política pela tela, faixa pela tela com recusa de só um lado, vaga mostra só quem combina, agendar marca "agendado", o outro item continua aguardando). Cache `hope-os-shell-v1-57-0-politica-espera`.

## D-055 — Agenda confiável: reauditoria do b00a904, correções P0 e proposta da 026 (sem migration)
- **Pedido (Platform Owner, 2026-11-17):** "AGENDA CONFIÁVEL E INTELIGENTE" — auditar a versão atual (b00a904) e corrigir na ordem confiabilidade → clareza → velocidade → inteligência. Sem migration nova, sem deploy, merge só por ordem.
- **Achados confirmados no b00a904 e corrigidos** (cada um reproduzido antes e depois, ver Verificação):
  1. **Semana com resposta antiga — REAL (CRÍTICO).** `loadWeekAgenda` não descartava respostas velhas: navegar rápido fazia a resposta da semana anterior chegar por último e sobrescrever a atual. A tela mostrava os dias certos, mas a grade e os contadores eram de outra semana: um agendamento sumiu e o contador mostrou 0. Correção: só o pedido mais recente vale (`seqSemana`); `semanaCarregada` diz de que semana são os dados; até chegar, a grade mostra "Carregando a semana…" e os contadores "…".
  2. **Arraste com horário errado — REAL.** A posição era medida a partir do topo do contêiner, que inclui o cabeçalho fixo dos profissionais, e não da coluna. Soltar com o topo do bloco na linha das 12:00 gravava 12:20. Correção: a conta parte da coluna e do ponto onde o bloco foi pego; a prévia mostra o horário e tem a altura da duração. Prévia, régua e gravação coincidem (12:00 / 12:00).
  3. **Vários serviços com falso negativo — REAL.** Os inícios só andavam pela duração total a partir do espaço do primeiro profissional, então a sequência sem espera alinhada ao espaço do segundo profissional sumia: com o B livre às 09:45, o primeiro início sem espera era 09:45 em vez de 09:15. Correção: a grade documentada (D-040) continua e ganha as âncoras das etapas feitas por outro profissional. A busca é limitada (20 000 montagens) e medida (`busca.avaliadas`, `truncada`).
  4. **Lista de espera usada duas vezes — REAL.** O pedido era conferido antes e baixado depois de gravar. Dois agendamentos ao mesmo tempo gravavam os dois (reproduzido: 201 e 201). Correção: baixa atômica (`atualizarStatusSe`, compare-and-set) **antes** de gravar; o segundo recebe 409 `WAITLIST_ALREADY_USED`. Se a gravação falhar, o pedido volta ao status anterior; se nem isso der, o erro diz `listaEspera: nao_devolvida` (nada silencioso). A baixa que falhava depois de gravar não existe mais.
  5. **Escala alterada durante a reserva — REAL (PARCIAL após a correção).** A disponibilidade é lida no Node antes de gravar, e o banco não tem trava comum entre escala e agendamento. Correção possível sem migration: depois de gravar, a disponibilidade é conferida de novo; se mudou (ex.: entrou um bloqueio), a reserva recém-criada é cancelada com o motivo `escala_mudou_durante_reserva` no histórico, e quem agendava recebe 409 `ESCALA_MUDOU`. Isso **reduz a janela, não a fecha**: existe um encaixe residual em que a escala lê a agenda antes da reserva entrar. A garantia completa precisa da 026 (abaixo).
  6. **Disponibilidade desconhecida parecendo livre — REAL (CRÍTICO).** Sem a escala do dia, sem os agendamentos do dia ou sem os bloqueios, os horários vazios apareciam como livres. Correção: ficam hachurados, com legenda "Não confirmado" e o motivo; o aviso traz "Tentar de novo" e diz de quando são os dados. Tocar ainda leva a agendar, e o servidor confere ao gravar.
- **Regras confirmadas (preservadas, sem decisão diferente):**
  - **Faixa da espera:** vale o **início** dentro da faixa (D-054).
  - **Profissional sem vínculos:** só é habilitado quando o salão não tem nenhum vínculo cadastrado (D-040). O link público e o motor de vários serviços já seguiam essa regra; a lista de espera (D-054) liberava tudo e foi alinhada.
  - **Troca de serviço com pedido da espera:** é regra nova (não havia decisão). O pedido **não** é baixado se o serviço (ou o cliente) mudou no formulário: o servidor recusa o vínculo (`WAITLIST_MISMATCH`), a tela grava sem ele e avisa que o pedido continua na espera. **Decisão a confirmar pelo Platform Owner.**
- **Clareza (P1):**
  - Colunas no celular se ajustam ao espaço (até 3 profissionais sem rolar de lado).
  - Profissional desativado sai da seleção do filtro (a grade nunca fica vazia por seleção antiga).
  - Linha de estado: carregando, falha e dados de quando.
  - Gestão de datas avulsas, consecutivas e da unidade, e a decisão explícita antes de fechar ou alterar escalas com agendamentos afetados, já existiam (D-033/D-035/D-050, `CONFLITOS_PENDENTES`): conferidas, **REAL**.
- **Inteligência (P2):**
  - **Ordenação escolhível nas combinações:** sem espera primeiro (padrão), profissional escolhido, menor espera, menor tempo total, melhor aproveitamento (sobra menor que o menor serviço) e mais cedo.
  - **Alternativas:** quando o escolhido não cabe, são oferecidas outras opções marcadas com quantas etapas mantêm a escolha. Nada é trocado sem a pessoa escolher.
  - **Explicações:** motivo quando nada cabe. Cada opção mostra tempo no salão, sobra e preferência.
  - Sugestão continua não sendo reserva; a gravação de vários serviços é tudo ou nada (019).
- **Proposta da migration 026 (NÃO criada; precisa de autorização). DRAFT ONLY:**
  ```sql
  -- DRAFT ONLY — não executar. Trava comum entre escala e reserva, por profissional e dia.
  -- Em agendamento_criar, atendimento_criar e nas funções de disponibilidade (semanal_definir,
  -- excecoes_criar, excecao_remover/encurtar, lote), antes de ler ou gravar:
  --   perform pg_advisory_xact_lock(hashtextextended(p_empresa_id::text || ':' || p_profissional_id::text || ':' || p_data::text, 0));
  -- e mover a conferência "cabe na disponibilidade" para dentro de agendamento_criar (hoje no Node).
  -- Mudanças da unidade inteira travam por empresa e dia. Com isso, escala e reserva do mesmo
  -- profissional e dia passam a acontecer uma de cada vez: some a corrida descrita no item 5.
  ```
- **Verificação:**
  - **Gate offline `agenda-confiavel` (9 testes):**
    - contra o código antigo (b00a904): 8 falham; o C06 passava porque a baixa antiga nem acontecia antes de gravar;
    - no código novo: 9/9;
    - inclui dupla confirmação simultânea da espera, falha ao gravar com devolução do pedido, troca de serviço, regra de vínculo e escala mudando entre a conferência e a gravação (com controle negativo).
  - **E2E `agenda-confiavel`:**
    - respostas fora de ordem: antes falhava (agendamento sumia, "0 agend."), agora passa;
    - escala sem resposta: antes 0 horários marcados e 72 parecendo livres, agora 72 marcados e "Tentar de novo";
    - também cobre dia sem resposta, filtro com profissional desativado e 3 colunas no celular.
  - **Arraste com a grade rolada:** roteiro antes/depois (12:20 → 12:00).
  - Cache `hope-os-shell-v1-58-0-agenda-confiavel`.


## D-056 — Correção de identidade, sessão e evolução do login (sem migration)
- **Autorização (Platform Owner, 2026-11-17):** “Plano aprovado aplicar. Autorizo desenvolver habilidades necessárias e criar múltiplos agentes, com as capacidades necessárias para efetuar cada tarefa, prioridade baixo consumo de token, máximo eficiência e desempenho”. Plano-base: `Plano_Correcao_KortexOS_Login_PWA_2026-11-17.md`, Library `libfile_8aa83bbb412881919ef199970b7c3ee8`.
- **Escopo:** F0/F1, código de Google/Apple/Magic Link/código e vinculação, segurança do callback/PWA, melhorias de inicialização e contexto local demonstráveis. Manter Supabase Auth e Express, autorização por identidade no backend e um único dono de sessão no navegador. Código e provas em branch isolado, sem publicar automaticamente.
- **Mudanças operacionais:** novos provedores e vinculação desligados por padrão até configurar credenciais públicas/privadas, SMTP, redirects e políticas do provedor e comprovar recuperação individual. O código/blueprint desliga legado por padrão em produção; isso não prova que o ambiente de produção foi alterado.
- **Limites:** nenhuma migration nova, edição de 001–025 ou mudança em dados/serviços de produção é autorizada por esta decisão. A corrida do último administrador e agenda x escala exigem solução transacional específica para reabilitar operações com garantia completa. A redução de admin ativo fica contida por recusa explícita enquanto não houver essa garantia.
- **Aceite:** testes reais por camada; doubles não aprovam fornecedor nem produção. E-mail exato, UUID, sessão/abas, callback, permissões e idempotência preservados. Limitação de credencial nativa do provedor deve constar no runbook antes de habilitar social.
- **Execução, evidências e pendências:** `planning/AUTH_PWA_IMPLEMENTACAO.md` e `PROJECT_STATE.md`. Não declarar multi-tenant ou produção aprovados por esta entrega.

## D-057 — Navegação por tarefas e integridade do checkout
O proprietário aprovou a direção Agenda, Comandas, Painel e Gestão, conta no avatar e tratamento distinto do comprador na venda interna, com execução em branch revisável. Base 7cfc5a1. Mantidos os limites para migrations e publicação. Nesta etapa, Comandas apresenta atendimentos reais e histórico autorizado. O contrato de abertura persistente e de comprador profissional está proposto no estado do projeto.

## D-058 — Migration 026: escala e reserva sem corrida
- **Autorização (Platform Owner, 2026-11-17):** "Migração aprovada, se tudo ok merge", sobre a proposta DRAFT do D-055 (item 5).
- **Problema (D-055, item 5):** a disponibilidade é conferida no backend antes de gravar, fora da transação. Uma mudança de escala entre a conferência e a gravação deixava a reserva em cima de um bloqueio. A conferência depois de gravar (D-055) só reduzia a janela.
- **Desenho (sem copiar regra de disponibilidade para o SQL):**
  - **Versão da escala** = maior `seq` da corrente de eventos de disponibilidade da empresa (023). Toda mudança de escala passa pelas funções que gravam evento (013/015/023), então a versão sobe sempre.
  - **Na reserva (026):**
    - o backend lê a versão **antes** de conferir e a manda junto (`disp_versao`);
    - `agendamento_criar` toma a mesma trava que o gatilho dos eventos já usa e compara a versão. Se mudou, recusa com `HS412 ESCALA_MUDOU` e **nada é gravado**;
    - sem `disp_versao` (encaixe forçado, chamadas antigas), segue como antes.
  - A 026 só redefine `agendamento_criar`, com a mesma assinatura e o mesmo corpo da 008, mais a conferência.
  - **Do lado da escala (Node):** se uma reserva gravou primeiro, entre a leitura dos afetados e a gravação da escala, a rota de escala confere de novo depois de gravar e devolve `afetadosDepois`. A tela avisa e a grade marca ⚠. Nada é mexido sozinho.
- **Residual (fechado em 2026-11-21, sem migration, por ordem do Platform Owner — "faça os itens 1 e 2"):**
  - **Remarcação, série (criar e alterar) e link público (agendar e remarcar pelo link pessoal)** mandam a versão lida antes da conferência. A série desfaz tudo e responde 409 `ESCALA_MUDOU` (não trata como conflito de uma data); alterar série deixa a ocorrência como está, com o motivo `escala_mudou`.
  - **Vários serviços (`atendimento_criar`, 019):** a função não confere versão e mudar isso seria migration. O backend lê a versão antes e confere depois de gravar; se mudou e alguma etapa não cabe mais, cancela todas as etapas (motivo no histórico) e responde 409. Se a mudança não pegou as etapas, mantém.
  - **Lote de escalas e remoção de data especial** devolvem `afetadosDepois`. A tela avisa em todo envio de escala.
  - **Verificação:** gate `agenda-confiavel` C12–C17. Com o backend anterior, os seis falham; com o novo, 17/17. O C15 tem controle negativo (mudança em outro horário grava).
- **Verificação:**
  - **gate SQL `gate_026`:** versão em dia grava; sem versão grava; versão velha recusa com HS412 sem gravar. Controle negativo: com a versão nova, o mesmo pedido grava. Conflito de horário continua HS409; função só para service_role; ciclo de rollback verde;
  - **gate offline `agenda-confiavel` (11 testes):**
    - C10: a escala muda por evento entre a conferência e a gravação → 409, nada gravado nem cancelado. Controle negativo: sem mandar a versão, o C10 falha;
    - C11: reserva entra durante a mudança de escala → `afetadosDepois`.

## D-059 — Saúde do banco para o monitor externo
- **Pedido (Platform Owner, 2026-11-21):** "Aprovado", sobre a proposta de perceber queda do banco no monitoramento (UptimeRobot conectado: "HOPE OS KeepAlive" na API e "HOPE OS App (PWA)" no GitHub Pages).
- **Problema:** `/api/health` só diz que o servidor Node está no ar; não consulta o banco. Com o Supabase fora, o monitor continuaria verde e a agenda parada.
- **Solução (sem migration):** `GET /api/health/banco`, público e sem dados.
  - Faz uma consulta mínima (`HEAD` com contagem em `empresas`), que não devolve linha nenhuma.
  - Tem limite de 5 s: banco lento conta como indisponível.
  - O resultado fica guardado 30 s, para que chamadas repetidas não virem carga.
  - Responde 200 `{ banco: 'ok' }` ou 503 `{ banco: 'indisponivel' }`, sem o detalhe do erro.
  - `/api/health` fica como estava (o KeepAlive continua leve e mantém o Render acordado).
- **Verificação:** gate `saude-banco` (5 testes): ok, falha sem vazar o erro do driver, lentidão, resultado guardado e `/api/health` intacto. A consulta real ao Supabase só é provada em produção, depois do deploy.
- **Depois do merge:** criar no UptimeRobot o monitor da rota nova, com alerta por e-mail.

## D-060 — Lista de espera: pedido de outro serviço ao agendar (opção C)
- **Decisão (Platform Owner, 2026-11-21):** "Merge do PR 56 e implemente a opção C", sobre a dúvida que ficou aberta no D-055 (troca de serviço com pedido da espera).
- **Regra:**
  - **Outro cliente no formulário:** o pedido **nunca** é baixado, nem com decisão (`WAITLIST_MISMATCH`). Quem esperava não foi agendado.
  - **Mesmo cliente e mesmo serviço:** baixa junto com o agendamento, de forma atômica (D-055).
  - **Mesmo cliente e outro serviço:** a recepção escolhe antes de gravar:
    - "Tirar da espera e agendar";
    - "Agendar e manter na espera";
    - "Voltar" (nada é gravado e o formulário continua aberto).
  - O servidor também exige a decisão: sem `baixarEsperaOutroServico`, um pedido de outro serviço volta 422 `WAITLIST_SERVICO_DIFERENTE`.
  - Se a recepção decidiu tirar da espera, o evento de criação do horário guarda `espera_baixada` (pedido, serviço pedido, serviço agendado e `outro_servico_por_decisao`).
- **Fechado junto:** abrir o agendamento a partir de um pedido cujo cliente este aparelho ainda não carregou não segue com o formulário sem cliente (gravaria o horário "sem cliente"); mostra o erro e fecha.
- **Verificação:**
  - Gate `agenda-confiavel`: C07 (sem decisão, recusa), C18 (com decisão, baixa e guarda no histórico) e C19 (outro cliente nunca baixa). Com o servidor anterior, C07 e C18 falham. O C19 já passava, porque a regra de outro cliente era a mesma, e fica como guarda de regressão.
  - E2E `agenda-politica-espera`: a tela pergunta com os nomes certos; "manter" agenda e o pedido continua aguardando; "voltar" não grava nada; "tirar da espera" agenda, dá baixa e guarda a decisão. Cache `v1-63-0`.
## D-061 — E2E: navegação comum (um lugar para mudar quando o menu mudar)
- **Pedido (Platform Owner, 2026-11-22):** "Aprovado corrigir", sobre a análise das falhas de CI dos últimos 7 dias. Seis das nove vieram de teste que esperava um botão ou formato que o PR tinha mudado (menu de Gestão no PR #52, logs no #51); mudar o menu obrigava a editar vários testes, cada um com o seu caminho.
- **Mudança (só testes, sem código de produto):** `backend/tests/e2e/navegacao.js` com `irParaGestao`, `irParaConta` e `sairDaConta`. 25 trechos repetidos em 18 testes passaram a usar o auxiliar. A saída com verificação extra (`sair` de login e convite) foi mantida.
- **Verificação:**
  - Controle negativo: com o seletor do menu errado só no auxiliar, `escalas` e `permissoes` falham juntos; restaurado, voltam.
  - Suíte completa de E2E verde.
- **Regra daqui para a frente:** teste novo que precise ir a Gestão ou à Conta usa o auxiliar. Uma mudança de menu ajusta `navegacao.js`.

## D-062 — Onda 1 do Blueprint v2 (sem migration): senha até 72 bytes, teto diário só do dia, aviso de nome parecido
- **Origem:** `docs/planning/BLUEPRINT_MASTER_V2_ANALISE.md`, Onda 1. O Platform Owner pediu `/completar-lacuna` depois da análise.
- **Senha (`POST /auth/password`):** acima de 72 bytes em UTF-8 volta 422 `PASSWORD_TOO_LONG`, e nada é gravado. O Supabase Auth guarda a senha com bcrypt, que ignora o que passa de 72 bytes, então duas senhas diferentes só depois disso entrariam como iguais. A tela de definir senha avisa antes de enviar.
- **Teto diário do link público:** conta os eventos desde a meia-noite do salão com uma contagem no banco (`contarDesde`, `count` sem trazer linhas). Antes, lia todos os eventos do salão e filtrava em memória, o que crescia com o histórico.
- **Nome parecido (recepção e Gestão):** antes de criar um cliente, procura um cliente ativo com o mesmo nome (ignorando acento, caixa e pontuação) ou com o mesmo primeiro e último nome.
  - No cadastro rápido do agendamento: **Usar** o existente, **Cadastrar novo mesmo assim** ou **Voltar**.
  - Em Gestão → Clientes: **Cadastrar novo mesmo assim** ou **Não cadastrar**.
  - Só avisa e não bloqueia. Telefone repetido continua barrado pelo servidor.
  - Sem pontuação inventada: os pesos e limiares do blueprint foram rejeitados (análise, §3.5).
- **Verificação:**
  - Gates: `identity` S04b (73 bytes, 37 "é" = 74 bytes, limite exato de 72) e `agendamento-publico` P14b (1.000 eventos de ontem e a borda 02:59Z/03:00Z; o teste falha se o teto listar os eventos).
  - Controles negativos: com o código anterior, S04b e P14b caem. Com a regra de nome desligada, o E2E `permissoes` cai.
  - E2E `permissoes`: aviso com o nome certo; Voltar não grava; Usar não cria cadastro; Cadastrar mesmo assim grava.
  - Suíte offline verde, E2E 41/41, migrations conferem. Sem migration.
- **Achado do E2E:** um segundo cadastro rápido com o mesmo telefone já é recusado pelo servidor. O teste limpa o telefone de propósito para exercitar só a regra do nome.

## D-063 — Migration 027: agendamento público e remarcação atômicos (Onda 2 do Blueprint v2)
- **Autorização (Platform Owner, 2026-11-22):** "Iniciar a próxima onda", sobre a Onda 2 de `docs/planning/BLUEPRINT_MASTER_V2_ANALISE.md` (migration 027). O merge, que aplica em produção, continua dependendo de ordem própria.
- **Mudança de desenho em relação à análise: sem índice único de telefone.**
  - Evidência: `POST /clientes` deixa quem tem `clientes:editar` cadastrar dois clientes no mesmo número (só o cadastro rápido de quem não edita é barrado). É o caso de mãe e filho no mesmo número; um `UNIQUE` quebraria esse uso.
  - A duplicata acidental vinha só da corrida do link público. Uma trava no banco por salão + número resolve a corrida sem tocar na recepção.
  - A pergunta "abortar ou mesclar duplicados" deixou de existir.
- **Migration 027 (aplica no merge):**
  - `chave_numero_br(text)`: mesma regra do backend (`chaveNumeroBr` = `normalizarWhatsapp` + 9 no celular antigo). Índice comum, não único, `(empresa_id, chave_numero_br(whatsapp))`.
  - `agendamento_publico_criar`: trava `cliente_numero:<empresa>:<número>`; acha o cliente ativo do número ou cria; chama `agendamento_criar` e grava o evento de origem, tudo na mesma transação. Se outro pedido criou o cliente depois da leitura do backend, usa esse cliente e marca `dedup: existente_concorrente`.
  - `agendamento_remarcar`: trava a linha do original (`FOR UPDATE`) e confere o status (HS410 `AGENDAMENTO_MUDOU`). Depois cria o novo por `agendamento_criar`, ignorando o original, e marca o original `reagendado`, na mesma transação.
  - Só `service_role` executa. Rollback `027_down.sql`.
- **Backend:**
  - O link público (agendar e remarcar) e a remarcação da recepção passam pelas RPCs.
  - Se a função não existir no banco (PGRST202/42883, na janela do deploy ou depois de um rollback), a rota usa o caminho anterior.
  - O espelho em memória reproduz o tudo ou nada.
- **Defeito de produção corrigido junto (introduzido na D-058):** `criarAgendamento` do repositório real não traduzia o HS412. Escala mudada durante a gravação dava 500 em vez de 409 `ESCALA_MUDOU` no `POST /agenda`, na remarcação e no link. Os testes não pegavam porque o espelho em memória traduzia. Agora há um tradutor único (`erroDaAgenda`: HS409, HS412, HS410).
- **Efeito para quem usa:**
  - Link público: um conflito de horário não deixa mais cadastro de cliente sem horário. Dois pedidos simultâneos do mesmo número criam um cliente só, mesmo com mais de uma instância do backend.
  - Recepção: se outra pessoa mudar o horário durante a remarcação, volta 409 `AGENDAMENTO_MUDOU` e nada é gravado. Antes ficavam dois horários ativos se a segunda gravação falhasse.
- **Verificação:**
  - `gate_027.sql` (10 blocos, verde antes e depois do ciclo de rollback): normalização, órfão, escala mudou, outra empresa, inativo, remarcar, status velho, conflito, acesso.
  - `concurrency_publico.sh`: duas sessões reais do mesmo número geram 1 cliente, 2 horários e 2 eventos. **Controle negativo:** sem a trava, 2 clientes (FALHA).
  - Gate `agendamento-atomico` (6 testes, novo em `test:offline` e `test:gate`): paridade com a tabela do SQL e tradução de erros. **Controle negativo:** com o `criarAgendamento` antigo, A04 (HS412) cai.
  - Gate `agendamento-publico` P13b/P13c: sem cliente órfão; caminho anterior quando a RPC falta. **Controle negativo:** pelo caminho anterior, P13b cai (órfão).
  - `meu-agendamento` M06 reescrito (com a 027, nada é criado) e M06b (caminho anterior).
  - Suíte offline verde; E2E 41/41; migrations conferem.
- **Fica de fora:**
  - As regras do link (limite de futuros, régua, intervalo) continuam conferidas no backend antes da RPC. A trava do banco cobre a criação do cliente e a gravação, não essas leituras. Com uma instância só no Render, a trava em memória continua cobrindo isso.
  - Mover o link pessoal na remarcação segue fora da transação (best-effort, como antes).

## D-064 — Cockpit do gestor orientado a decisão (sem migration)
- **Origem:** o Platform Owner definiu os três essenciais da troca (assinatura, automação e mensagens, gestão inteligente) e mandou os mockups "Cockpit do Gestor", "Automação & Mensageria" e "Cashback Dinâmico", com o pedido "Cockpit do gestor orientado a decisão". Esta entrega é o cockpit, o único dos três que não depende de fornecedor nem de migration.
- **`GET /api/cockpit`** (`painel:financeiro`, só leitura; tenant só do token). Motor puro em `engines/insights/cockpit.js`.
  - **Faturamento × meta:** itens líquidos do mês até hoje, menos estornos do mês. A meta é a soma das metas da equipe (011). A projeção usa o ritmo do mês, só a partir do dia 7. A comparação é com o mesmo período do mês anterior.
  - **Margem real:** receita do salão depois de comissão e taxas, mais a fatia de taxas no recebido, comparada com o mês anterior.
  - **Ocupação:** últimas 4 semanas, total e por dia da semana, com a tarde (13h–18h) separada. Dia sem expediente aparece como "fechado", nunca como 0%.
  - **Recorrência:** assinantes vigentes (pela mesma `situacao` do ciclo), receita mensal das assinaturas (MRR, com anual e trimestral convertidos para mês), atrasados ou suspensos com o valor em aberto, cancelamentos no mês e peso no faturamento.
  - **"Decidir agora":** alertas por regra, cada um com o porquê, a conta do impacto e a ação que abre uma tela que existe. Os alertas são:
    - gargalo: tarde (13h–18h) abaixo de 50%; se o dia não tem expediente à tarde, vale o dia inteiro (achado na captura: com o expediente só de manhã do banco de demonstração, o alerta sumia; teste K03b);
    - avulsos com 2+ comandas em 30 dias e sem assinatura, com o potencial no plano mais barato à venda;
    - assinantes atrasados;
    - profissional com 90%+ de ocupação e gente na espera por ele;
    - taxas que subiram 1 ponto ou mais;
    - 2+ faltas em 30 dias.
  - **Equipe:** ocupação e % da meta de cada profissional. Os serviços estornados no mês saem da meta.
  - **Simulador:** só multiplica as bases do servidor (avulsos × plano; horas livres × preço médio do minuto vendido; faltas × preço do minuto). A tela diz que é estimativa.
- **O que NÃO entrou dos mockups, e por quê:**
  - "IA" e "Aplicar recomendações": as regras são explicáveis, não há modelo, e o nome não promete o que não existe.
  - "Executar campanha automatizada": não há fornecedor de WhatsApp ainda. A ação leva à tela certa.
  - Números de exemplo dos mockups (fill rate, LTV, ROI de cashback): sem dado, o campo fica nulo e a tela diz o motivo.
  - Cashback: depende de contador (passivo do cliente).
- **Achado (HARDCODED, não corrigido aqui):** `GET /api/dashboard` devolve `scoreHope` (ocupação × 0,4 + 40) e completa `top3Actions` com "Operação estável". Nenhuma tela usa esses dois campos (`grep` em `js/`). Remover é mudança de contrato, fica para decidir.
- **Tela:** "Cockpit do gestor" no topo do Painel, só para quem tem `painel:financeiro`. A recepção nem faz a requisição.
- **Verificação:**
  - Gate `cockpit` (12 testes, números à mão): faturamento, margem, ocupação, recorrência, ordem e impacto dos alertas, equipe, simulador, saturação, "sem dados nada inventado", HTTP admin/gestor, isolamento com `empresa_id` da query ignorado, RBAC.
  - **Controles negativos:** estorno ignorado (6 caem), meta sem descontar estorno (K06), alerta de enchimento (K08), plano arquivado oferecido (K05, K06).
  - E2E `cockpit`: o admin vê tudo sem erro; o alerta de avulsos aparece com cliente e valor; a ação abre Gestão → Assinantes; não há rolagem horizontal em 390 px; a recepção não vê nem chama. **Controle negativo:** com a seção sempre escondida, o E2E cai.
  - Suíte offline verde; E2E 42/42; migrations conferem.

## D-065 — Sem número inventado nem referência não verificada no Painel
- **Pedido do Platform Owner (2026-11-22):** "Remover score inventado. Remover dados mocados."
- **Removido de `GET /api/dashboard`:**
  - `scoreHope`: fórmula sem base, ocupação × 0,4 + 40;
  - `top3Actions`: quando faltava alerta, era completado com "Operação estável";
  - a regra antiga que sugeria "sinal" a cada cancelamento.
  - Nenhuma tela usava esses campos; as decisões com o porquê estão no cockpit (D-064).
- **Renomeado:** `kpis.ocupacaoPct` → `kpis.realizadosPct`. Era a fração de agendamentos realizados, não ocupação. Sem agenda, o valor é `null`, não 0%. A ocupação de verdade, por minuto de cadeira, está no cockpit e em `/insights/occupancy`.
- **Removido do piloto (`/insights/piloto`, Painel → Indicadores):** as faixas "de mercado" (faltas 10–20%, reagendamento 40–52% e topo 70–80%, retorno de cliente novo 30–35% e topo 70%+). Vinham de materiais de fornecedores achados na web pela auditoria de 2026-11, nunca conferidos, e apareciam como referência. A tela agora diz "Compare com o histórico do salão (menor/maior é melhor)".
- **Mantido, com o motivo:**
  - **Taxas de exemplo do onboarding** (débito 1,99%, crédito 4,99%): aparecem rotuladas como exemplo e são confirmadas pelo dono antes de gravar. Trocar por 0% esconderia o custo.
  - **Banco de demonstração** (`backend/src/dev/`): só roda localmente e no E2E, nunca em produção.
  - Os textos "por exemplo, 150,00" são dicas de formato.
- **Não verificado:** se há registro de teste no banco de produção. A consulta só de contagens ficou sem aprovação e não foi executada.
- **Verificação:** `correcoes` J14 e J14b (sem score, sem enchimento, sem nome enganoso, sem agenda = `null`). **Controle negativo:** com o `DashboardService` antigo, J14 e J14b caem. `piloto` passa a exigir faixa nula. Suíte offline verde; E2E 42/42.

## D-066 — Segunda varredura semântica da documentação (sem código de produto, sem migration)
- **Pedido (Platform Owner, 2026-11-23):** "Faça uma segunda varredura semântica na documentação. Corrija qualquer divergência com o estado atual do projeto. Elimine o que é obsoleto." Motivo: há trabalho em paralelo com o GPT, e o outro agente precisa de documentação confiável.
- **Método:** inventário dos 109 arquivos `.md`, com última alteração, referências recebidas (código, testes, skills e outros documentos) e título. Cada afirmação sobre o estado foi conferida contra a fonte: `list_projects`, `list_migrations`, `list_deploys`, requisições de saúde, o código e os gates. Uma busca textual achou o óbvio; a leitura do **status** de cada documento de planejamento achou o resto.
- **Achado principal:** o `PROJECT_STATE.md`, declarado única fonte de estado, estava seriamente desatualizado: "migrations 001–011", "012+ não autorizada", "banco com 001–009", dezenas de "PENDENTE em produção", um "Trabalho atual" de ramo antigo, entradas fora de ordem e um handoff com "Não fazer: 010+" ao lado de decisões que fizeram exatamente isso. Reescrito (168 → 101 linhas), com tabela de produção conferida em 2026-11-23: **migrations 001–027 todas aplicadas**, Render no commit `3358bf8`, API, banco e app respondendo 200.
- **Reescritos:** `PROJECT_STATE.md`, `CODEX.md` (descrevia o `API_ACCESS_TOKEN` como autenticação, "82/82 verdes", porta 3000 em vez de 3333, "tarefas autorizadas" de julho e "migrations 007+ bloqueadas"), `docs/INDEX.md` (só listava parte dos documentos e rotulava como "não aprovada" análises já implementadas).
- **Corrigidos no lugar:**
  - `API_CONTRACT.md`: nomes de permissão do modelo anterior à D-032 (`cadastros:read`, `relatorios:full` e outros) trocados pelos que as rotas usam, e a seção do caixa (dizia "só leitura" e "sem sangria", mas a migration 010 existe); verificação cruzada: toda permissão citada existe em alguma rota.
  - Skills `steward`, `deploy-producao`, `integracao-futura`, `auditoria-estado`, `avaliar-proposta`: "migration 012+" e "001–011" viraram "028+" e "001–027"; o E2E oficial (`run-all.js`) entrou na `steward`; o CI tem três jobs, não dois.
  - Status parados em nove documentos de planejamento (`AGENDAMENTO_ONLINE_DRAFT`, `ASSINATURAS_DESENHO`, `ASSINATURAS_ONDA_A_PLANO`, `ESTORNO_COMANDA_DRAFT`, `INTEGRACOES_FUTURAS`, `ROADMAP_SUBSTITUIR_APPBARBER` com tabela de situação dos 9 itens, `DESEMPENHO_MARGEM_ANALISE`) e em `RUNBOOK_MIGRATION_007`, `SECURITY_PII_POLICY`, `DATA_CONTRACT`, os cinco READMEs e o parágrafo "Fundação" do `CLAUDE.md`.
  - O ID de projeto `qosioymzswhkqkziocas` não existe na organização (`list_projects`): a produção é o `hopeos-v1` (`gsttjozcmdvgstcpadiq`).
- **Novo:** `docs/ROTAS.md` (164 rotas, com a permissão de cada uma) gerado por `backend/scripts/docs/gerar-indice-rotas.js`, que percorre o Express como o RT-20. Antes, 93 das 151 rotas que uma busca por texto achou não apareciam no contrato. As 20 rotas sem permissão são exatamente as da lista de exceções do RT-20. **Não há gate que force regenerar**: de propósito, para não travar PRs de outros agentes; fica a regra no `CODEX.md`.
- **Removidos (`git rm`; recuperáveis pelo histórico):**
  - 12 arquivos, 2.781 linhas, todos de julho, sem referência de código, teste, skill ou documento ativo, e que **não** são auditoria, prompt histórico nem evidência do dono: plano, especificação e handoff das versões V1.2 a V1.4 (`HOPE_OS_V1_2_...BLUEPRINT`, `HOPE_OS_V1_3_...BLUEPRINT`, `SPEC_V1_3_...`, `PLAN_V1_3_TASKS`, `KORTEXOS_NOW_SCOPE_V1_4_*` ×3, `KORTEXOS_V1_4_SESSION_HANDOFF_COMPLETE`), `QA_V1_4_CHECKLIST`, `GATE_REAL_SUPABASE_CHECKLIST`, `planning/CADASTROS_DEEPENING_PLAN_V1_5` (substituído por `CADASTROS_PROFUNDIDADE_ANALISE`) e **`MANIFEST_SHA256.txt`**.
  - O manifesto de integridade tinha 260 entradas e **só 26 batiam** com os arquivos de hoje (100 mudaram, 134 não existem mais). Nenhuma verificação o usava, e ele passava a falsa impressão de integridade conferida.
- **Preservado por regra:** o `AGENTS.md` proíbe "comprimir ou sobrescrever auditorias, prompts históricos ou evidências do Owner". Por isso **não removi** 41 arquivos (cerca de 14.800 linhas): `audit_global` (14), `canon` (4), `architecture` (1), `redteam` (1), `prompts` (1), `legacy` (5), `archive` (9), `planning/KORTEXOS_5_1_*` (3) e `FRONTEND_V1_3_*` e `RENDER_DEPLOYMENT_VALIDATION` (3). Eles ficam rotulados no `INDEX.md` §7 como histórico de julho que **não representa o estado atual** (ex.: "base real 001–006", "faixa 007+ do KortexOS 5.1"). A remoção deles é decisão do Platform Owner.
- **Quase perdido, recuperado:** ao reescrever o `PROJECT_STATE.md` apaguei o contrato de comandas abertas persistentes para o qual a D-057 aponta ("proposto no estado do projeto") e os registros de evidência da D-057. Foram restaurados: o bloqueio no `PROJECT_STATE.md` §6 e os três parágrafos, **só acrescentados**, em `audit/COMANDAS_D057.md`. O fato de 2026-11-15 sobre a verificação das migrations 012 e 013 (que só existia no estado) foi levado para a §4.
- **Achados no código, não corrigidos aqui:** `doctor.js` só conhece as tabelas das migrations 001–009 (P2 em `PROJECT_STATE.md`); documentos históricos protegidos ainda citam por nome os removidos.
- **Verificação:** zero link relativo quebrado em todos os `.md`; todo documento alcançável pelo `INDEX.md`; toda permissão citada no contrato existe em rota; `docs/ROTAS.md` reprodutível (o gerador roda duas vezes com saída idêntica); nenhuma mudança em código de produto, testes ou migrations.

## D-067 — Documentos históricos movidos para `docs/historico`, PR #15 fechado e achado do trigger `auth.users` registrado
- **Pedido (Platform Owner, 2026-11-23):** "Mover para docs/historico, fechar o PR 15 e registrar o achado", em resposta à análise do risco de apagar os 41 arquivos protegidos da D-066.
- **Movimento:** os 41 arquivos (audit_global 14, canon 4, architecture 1, redteam 1, prompts 1, legacy 5, archive 9, `planning/KORTEXOS_5_1_*` 3, `FRONTEND_V1_3_*` e `RENDER_DEPLOYMENT_VALIDATION` 3) foram movidos com `git mv`, mantendo a estrutura de subpastas. O `git` os registra como **renomeação 100%**: nenhum byte mudou, então a regra do `AGENTS.md` (não sobrescrever evidência) foi respeitada. Nada foi apagado.
- **Por que mover e não apagar (evidência da análise):** nenhum teste, CI ou skill lê esses arquivos; não há dado pessoal nem segredo neles; mas o Master Briefing 5.1 registra a visão do dono de julho (Yield, Smart Gap, Reliability Score, no-show progressivo, Trust Pass), de vocabulário parecido com o M11 e o M12 do Blueprint v2, e as auditorias são o rastro de Red Team que o `AGENTS.md` exige. Mover tira o ruído do caminho sem perder o registro.
- **Pasta nova:** `docs/historico/README.md` explica o que é, o que **não** vale mais (base 001–006, faixa 007+ do 5.1, ID `qosioymzswhkqkziocas`, `API_ACCESS_TOKEN` como autenticação, contagens de teste), o que ainda pode ter valor e as limitações.
- **Referências atualizadas:** `INDEX.md` §7, `docs/README.md`, `CODEX.md`, `ADR-005` e `RUNBOOK_MIGRATION_007`. **Quatro links relativos dentro dos arquivos movidos ficaram quebrados** (apontam para `../PROJECT_STATE.md` e `../INDEX.md`); foram deixados assim de propósito para não alterar a evidência, e estão listados no README da pasta.
- **PR #15 fechado.** Era um rascunho de 2026-07-12 (branch `codex/fase1-identidade-minima`, 4 commits, 7 arquivos, +1.455 linhas, só documentação) com SQL de rascunho da migration 007 em fases. Está superado: a 007 real saiu como uma migration só (commit `b2b4473`, aplicada em 2026-11-08) e nenhum arquivo do PR existe na `main`. Não tinha revisão nem comentário. **A branch não foi apagada.**
- **Achado registrado:** o trigger `after insert or update of email on auth.users` da 007 real falha ao recriar uma conta com e-mail que já está em `app_users` (conta removida do Auth antes): `duplicate key ... ux_app_users_email`, e a conta nova não é criada. **REAL** no Postgres local com o shim do Auth; **DESCONHECIDO** no Supabase real. O gate da 007 só cobre o caminho feliz. Severidade P2. Evidência e passo a passo em `audit/TRIGGER_AUTH_USERS_2026-11-23.md`. **Correção não feita:** exige migration 028+, ainda sem autorização. Mitigação imediata: desativar usuários pelo app e não excluí-los no painel do Supabase Auth.
- **Verificação:** os 41 aparecem como `R100`; nenhum link quebrado em documento ativo; todo documento alcançável pelo índice; nenhuma mudança em código, testes ou migrations.

## D-068 — Agendamento pelo link: o cliente revisa a oferta antes de confirmar (sem migration)
- **Pedido (Platform Owner, 2026-11-23):** "Aprovo a entrega A em PR de rascunho, sobre a main atual, preservando a reserva atômica da 027. Inclua E2E do resumo, alteração da oferta antes de confirmar e toque duplo durante o envio. Verifique no banco de teste quantas reservas cada cenário gerou." Origem: a parte de "revisão da oferta" do PR #53 (`fix/grade-reserva-cliente`), portada sem a grade nova (que é a entrega B) e sem o intervalo mínimo na remarcação (fora do escopo aprovado).
- **Problema:** antes de confirmar, o cliente via só serviço, profissional, dia e início. Não via o fim, a duração, o preço nem o prazo para cancelar. E se o preço, a duração ou o profissional mudassem entre a lista e o envio, gravava nas condições novas sem que ele soubesse.
- **O que mudou:**
  - `GET /api/public/agendar/:slug/slots` devolve também `ofertas`: uma por horário, na mesma ordem de `slots`, com `horario`, `fim`, `profissional` (primeiro nome), `duracaoMin`, `precoCentavos` (ou `null` se o salão esconde o preço), `cancelamentoPrazoMin` e `versaoOferta`.
  - `versaoOferta` é o SHA-256 das condições: empresa, serviço, profissional, data, horário, duração, preço exibido e prazo de cancelamento. É uma impressão digital, **não** é segredo nem autorização: o servidor recalcula tudo no POST.
  - `POST /api/public/agendar/:slug` aceita `versaoOferta` (opcional; 64 caracteres hexadecimais minúsculos, senão 422 `DADOS_INVALIDOS`). Se vier e não bater com a oferta recalculada, responde **409 `OFERTA_ALTERADA`** antes de gravar: a revalidação de horário vem antes e a gravação (`comTrava` + RPC `agendamento_publico_criar` da 027) não é chamada. Sem `versaoOferta` (cliente antigo em cache), grava como antes.
  - A resposta 201 ganha `cancelamentoPrazoMin` (o do serviço, D-049, ou o do salão).
  - Página `agendar.html`: o resumo mostra "às 09:00 até 09:30 (30 min) · R$ 40,00. Cancelamento até 2 h antes." com os dados do servidor. Durante o envio, o fluxo fica `inert` (nenhum toque muda a escolha) e o botão desabilitado. Em `OFERTA_ALTERADA`, a página avisa e recarrega os horários, como já fazia em `HORARIO_INDISPONIVEL` e `HORARIO_OCUPADO`. A confirmação usa o prazo devolvido pelo servidor.
- **Efeito em "sem preferência":** o profissional entra na versão. Se outro agendamento mudar quem tem a agenda mais leve entre a lista e o envio, o cliente recebe `OFERTA_ALTERADA` e vê o nome novo antes de confirmar. É o comportamento pretendido.
- **Não muda:** a grade de horários, a recepção, a remarcação pelo link e a reserva atômica da 027.
- **Verificação:**
  - Gate `agendamento-publico` P13d: resumo exato da oferta; versão determinística; versões malformadas recusadas; preço alterado → 409 `OFERTA_ALTERADA` com **zero** chamadas à RPC e ao insert e nenhuma linha nova; oferta nova grava uma vez pela RPC. P13e: cliente sem versão continua gravando. **Controle negativo:** sem a comparação da versão, P13d cai (o POST grava com 201).
  - E2E `agendar-oferta` (Playwright, CSP de produção), com contagem no banco de teste (`/__db/agendamentos`) por cenário: resumo → **1** reserva; preço alterado antes de confirmar → **0** após a recusa e **1** após revisar, com o preço novo; toque duplo com o pedido segurado 1,5 s (mais um toque no botão, um `requestSubmit` e um toque em outro horário) → **1** POST e **1** reserva, no horário escolhido; dois POSTs simultâneos fora do navegador → um 201, um 422 `HORARIO_INDISPONIVEL`, **1** reserva. **Controle negativo:** sem o `inert`, caem "fluxo travado" e "escolha não muda com o pedido no ar".
- **Não verificado:** comportamento contra o Supabase real (o link público segue desligado em produção, sem `PUBLIC_BOOKING_LINKS`).

## D-069 — Link público: grade de horários pela duração do serviço, a partir de cada janela livre (sem migration)
- **Pedido (Platform Owner, 2026-11-23):** "Para a entrega B, a grade pública parte do início de cada janela livre e avança pela duração efetiva do serviço para o profissional. O encaixe no fim entra quando coincidir com a grade. A regra vale para flexível, equilibrada e compacta, na reserva e na remarcação. A recepção conserva sua grade atual." E: "Entregue B em PR separado, documente a interpretação da D-054 e inclua o exemplo 09h35 → 10h20 → 11h05 no teste de navegador." Origem: a parte de grade do PR #53 (`fix/grade-reserva-cliente`), portada sobre a `main` atual.
- **Problema:** o link usava a grade da recepção: passo do salão (`slot_padrao`) contado da abertura, mais as duas bordas de cada janela livre. Com um serviço de 45 min e passo de 30, um cliente que pega 10:00 depois de um atendimento que termina 09:35 deixa 25 min parados, e o link oferecia horários que se sobrepõem uns aos outros em sequência (10:00, 10:30, 11:00).
- **Regra (só no link):**
  - Em cada janela livre do profissional, o primeiro horário é o início da janela; os seguintes avançam pela **duração efetiva** do serviço para aquele profissional (a do vínculo, se houver; senão a do serviço). Na remarcação, a duração é a do próprio agendamento.
  - O último encaixe da janela (fim da janela menos a duração) **só entra se coincidir com essa grade**.
  - Com "agora" ou antecedência no meio da janela, o primeiro horário é o próximo ponto da grade dessa janela (a âncora continua sendo o início da janela).
  - Exemplo do dono: ocupado até 09:35, serviço de 45 min, expediente até 12:00 → **09:35, 10:20, 11:05**. A recepção, no mesmo dia, segue com 09:35, 10:00, 10:30, 11:00 e 11:15.
- **Interpretação da D-054 (política de sugestão) a partir daqui:** a política continua sendo aplicada depois do cálculo da grade, sem mudar suas regras. O que muda é o conjunto de partida no link:
  - **sem política (null):** "o link mostra todos os livres" passa a significar todos os pontos **da grade do link**, não todos os pontos da grade do salão mais as bordas;
  - **flexível:** todos os pontos da grade do link;
  - **equilibrada:** os pontos da grade do link que não deixam sobra menor que o menor serviço (se nenhum, os ideais), como antes;
  - **compacta:** os encaixes ideais **entre os pontos da grade do link**. "Colado no fim" só vale quando o fim coincide com a grade;
  - na recepção nada muda: grade do salão a partir da abertura, bordas, `sugerido` e "Ver todos";
  - a gravação pelo link continua recusando horário fora do que foi oferecido (`HORARIO_INDISPONIVEL`), agora contra a grade nova, na reserva e na remarcação.
- **Custo aceito (a decidir se incomodar na prática):** o link oferece menos horários (no exemplo, 3 em vez de 5) e não oferece o encaixe colado no fim da janela quando ele cai fora da grade (no E2E, 12:15). Esse encaixe continua disponível para a recepção.
- **Código:** `SlotEngine.computeSlots`/`buildSlotsDoDia` ganham `gradePorDuracao` (padrão `false`); só `publicBooking.slotsDoProfissional` passa `true`, e ele serve à lista, à gravação e à remarcação do link. `GET /api/agenda/slots` não passa a opção.
- **Fora do escopo:** o intervalo mínimo entre visitas na remarcação (M11 do PR #53) não entrou; é decisão separada do dono.
- **Verificação:**
  - `schedule-slots` 19 a 22: âncora com antecedência; o exemplo 09:35 → 10:20 → 11:05 contra a grade da recepção; borda final que coincide com a grade entra; `buildSlotsDoDia` com duração do vínculo.
  - `agenda-politica` PE04 (10:45 sai do link) e PE04b (sem política, flexível, equilibrada e compacta só oferecem pontos da grade; recepção mantém 09:45, 10:00 e 17:15). `meu-agendamento` M12: remarcação na grade de 45 a partir de 09:35; 10:00 recusado, 10:20 aceito. `agendamento-publico` P14 passou a usar 16:00 (16:30 deixou de ser ponto da grade no salão de teste).
  - **Controle negativo:** com `gradePorDuracao: false` na rota pública, caem PE04, PE04b e M12.
  - E2E `grade-link` (navegador, CSP de produção): o link mostra **09:35 → 10:20 → 11:05 → 11:50**; a recepção tem 10:00, 10:30 e 12:15; as três políticas só oferecem pontos da grade; reservar 10:20 gera **1** reserva de 45 min e a lista recomeça em 09:35, 11:05, 11:50.
- **Não verificado:** contra o Supabase real (o link público segue desligado em produção).

## D-070 — Desempenho do salão no Painel (2026-11-23)

O Platform Owner aprovou a análise de desempenho e o percurso Painel → Análises → Desempenho. A visualização usa a permissão `painel:financeiro` e um período comum para vendas, agenda e visitas. A parte do salão em serviços por hora considera todas as horas-profissional disponíveis e exclui vendas de produtos. Os valores são anteriores às despesas fixas.

Contar uma visita por cliente identificado por dia, reunindo atendimentos concluídos e comandas com serviço. Sinalizar registros sem cliente. Fidelização mede, entre os clientes com visita identificada no período, quantos acumularam três dias de visita nos últimos 365 dias até o fim do período. Ticket usa comandas, e ocupação reflete os minutos de agenda em relação à escala. Sem base para uma razão, mostrar indisponibilidade. A composição do faturamento distingue comissões, taxas sobre vendas, custo dos produtos e parte do salão. Divergências devem ficar explícitas. Nenhuma migration.

## D-071 — Painel: uma definição por métrica, no mesmo período (M13, etapa 1, sem migration)
- **Pedido (Platform Owner, 2026-11-24):** especificação M13 ("Correção do Painel, Desempenho e inteligência decisória"), etapa 1: unificar as métricas e a UX base em PR de rascunho. As etapas 2 (contagem só de leitura em produção) e 3 (período, comparação e visão por profissional) ficam para depois.
- **Problema (verificado em 2026-11-24):**
  - os cards "Receita empresa", "Comandas", "Comissões" e "Ticket médio" do Painel somavam **todo o histórico** (`FinanceReadModel`: "não há recorte de período"), com o rótulo "Fechadas no período", e apareciam também para a recepção (`/dashboard` exige só `painel:operacional`);
  - a "Ocupação da agenda" do Cockpit (últimas 4 semanas) e a do Desempenho (1º do mês até hoje) mostravam números diferentes para "ocupação" na mesma tela (0% e 0,8% no dado de teste);
  - o ticket do Desempenho dividia o faturamento de caixa (que desconta estornos de vendas de meses anteriores) pelas comandas do período: um estorno de outubro baixava o ticket de novembro;
  - o banco em memória dos testes ignorava a lista de colunas pedidas (`campos`), então um motor que lesse uma coluna esquecida no `select` passaria nos testes e erraria em produção.
- **O que mudou:**
  - `engines/insights/metricasPeriodo.js` é a fonte única de faturamento e parte do salão (`financeiroDoIntervalo`, agora só com comandas fechadas), ticket (`ticketDoPeriodo`) e ocupação (`ocupacaoDoPeriodo`). O Cockpit e o Desempenho usam essas funções.
  - **Ticket da coorte:** vendas do período e os estornos **delas**. Estornos de vendas de períodos anteriores ficam fora do ticket e aparecem à parte (`estornosVendasAnterioresCentavos`). O faturamento continua na visão de caixa (vendas do período menos estornos do período).
  - **Ocupação:** o card do Cockpit passa a mostrar o mês até hoje, com o período escrito ("01/11 a 22/11") e minutos de serviços realizados sobre a capacidade, igual ao Desempenho (`ocupacaoMes` na resposta). O gráfico por dia da semana e os alertas continuam com a janela de 4 semanas, com esse rótulo.
  - **Conciliação:** a diferença é separada em `taxaGorjetaEstornadaCentavos` (pela 009, o estorno tira da parte do salão "valor − comissão + taxa da gorjeta") e `outraDiferencaCentavos` (sem causa identificada). Correção de análise anterior: estorno **não** gera diferença por taxa e custo da venda; eles saem da parte do salão como perda.
  - **Painel:** saíram os quatro cards de histórico inteiro. O botão "Desempenho do salão" saiu da dobra fechada "Análises". Rodapé sem a versão parada "V1.3".
  - **Banco em memória:** `list` e `listDasComandas` devolvem só as colunas pedidas, como o PostgREST.
- **Itens do M13 que não se aplicam como escritos:** `VITE_APP_VERSION` (o app não tem build nem Vite); tabelas `orders`, `order_items`, `escalas_profissionais`, `transaction_margin_snapshots` e `ledger_reversals` (os nomes reais são `comandos`, `comando_itens`, a disponibilidade da empresa e `comanda_estornos`); `unidade_id` como escopo (as métricas são por `empresa_id`); cache com TTL infinito (etapa posterior, depois da medição). O alerta de "dia 0% ocupado" **já** ignorava dias sem expediente (`aberto: disponiveis > 0`); no dado de teste o domingo está aberto, por isso o alerta aparecia.
- **Verificação:**
  - `cockpit-gate` D02 com a conta à mão do ticket da coorte (3.500, antes 3.000); D04: Cockpit e Desempenho no mesmo período dão o mesmo faturamento (21.000) e a mesma ocupação (180 de 1.800 min, 10,0%); D05: estorno com gorjeta gera diferença de 50, toda na taxa da gorjeta.
  - **Controles negativos:** com o card do Cockpit de volta à janela de 4 semanas, D04 cai; tirando `tipo` dos estornos e `quantidade` dos itens do `select`, D02 cai (antes passaria); com o botão de volta dentro da dobra, o E2E `desempenho-salao` cai.
- **Não verificado:** contra o Supabase real; volume e tempo de resposta em produção (etapa 2, depende de autorização para leitura).
- **Revisão externa do PR #63 (2026-11-24), três achados confirmados no código e corrigidos no mesmo PR:**
  - **Permissões:** `/dashboard` exige só `painel:operacional` e devolvia o modelo financeiro inteiro (pagamentos por forma e repasses de todo o histórico), que a tela mostrava à recepção em "Pagamentos e repasses". Agora, sem `painel:financeiro`, a resposta é só `kpis.realizadosPct` e a dobra fica oculta. O fechamento de caixa usa outra rota e não muda. Gate `permissoes` G19b, com controle negativo.
  - **Ticket médio do quadro Margem:** usava o total recebido (com gorjeta) e todos os reembolsos do intervalo, inclusive de vendas anteriores. Agora usa `ticketDoPeriodo`, a mesma regra do Desempenho, e mostra o período ao lado. Gate `cockpit` D07: venda com gorjeta e estorno de venda de outubro dão 10.000 nos dois destinos (antes, 7.000 na Margem). O J15 (`correcoes`) ganhou o valor líquido dos itens no fixture.
  - **Ocupação realizada e preenchimento da grade (regra aprovada para a pré-produção):** dividir a soma das durações registradas dos serviços executados pela soma da capacidade dos profissionais no período. Dois serviços de 45 minutos para 60 de escala dão 150%. Quando os intervalos são 09h–09h45 e 09h30–10h15 em uma escala 09h–10h, o preenchimento da grade é 100%, há 15 minutos sobrepostos e 15 após o expediente. O caso do domingo com 30 minutos atendidos seguido de segunda-feira com 60 disponíveis dá 50% realizados e 0% preenchidos.
  - Cada minuto de relógio com duas ou mais execuções simultâneas do mesmo profissional conta uma vez em sobreposição. Recortar horários por dia local, descontar pausas e bloqueios unificados da escala e somar os denominadores dos profissionais. Um dia sem escala admite produção em minutos. A taxa exige capacidade positiva. A capacidade passada é reconstruída com o cadastro disponível.
  - **Qualidade dos dados:** na execução vinculada, a identidade vem do comprovante persistido ou da chave determinística da agenda. Combinar serviço e executor dentro do vínculo, preservando linhas distintas. Um serviço concluído usa a duração gravada no item ou, se ausente, a duração gravada na agenda. Esses valores são durações registradas. Uma comanda avulsa explícita pode somar produção mesmo sem hora inicial. Linhas antigas de identidade ambígua geram pendência; o sistema preserva a execução comprovada e evita duplicá-la. Produto, gorjeta e estorno financeiro não geram minutos.
  - Reservas futuras alimentam a previsão. Para orientar o gestor a abrir a agenda, o alerta deve encontrar janela reservável compatível com o intervalo analisado. O fechamento, a política da grade e as regras do link público continuam sob seus contratos de agendamento.
  - **Conciliação:** a taxa da gorjeta devolvida passou a vir do que o estorno registrou (bruta − líquida), não de uma conta por diferença. Se os totais não fecharem, o resto aparece como "diferença sem causa identificada" (D05b).
- **Eficiência:** para a recepção, `/dashboard` lê somente o status dos agendamentos da empresa autorizada. A PWA utiliza a projeção `visao=painel` para receber somente os agregados de pagamentos e repasses autorizados. O Cockpit gerencial ainda consulta histórico. O custo relativo em produção segue **DESCONHECIDO** até haver medição autorizada.

## D-072 — Inteligência do Painel e Desempenho, primeira entrega (2026-11-24)

Pedido do Platform Owner na missão Kortex Intelligence Dashboard. Implementação isolada sobre o PR #63. Registros e critérios em [Métricas do Dashboard](METRICAS_DASHBOARD.md).

- **Operação:** comparar produção e preenchimento realizado por dia da semana na mesma escala. O detalhe explica as bases e abre a Agenda apenas com data reservável entregue pelo servidor.
- **Gestão:** composição do faturamento em cascata com tabela dos valores registrados. Exibir o mês corrente ou o mês anterior completo por consulta explícita. Montar o gráfico somente ao abrir o resultado, com módulo disponível no cache do app.
- **Contrato:** preservar projeções autorizadas e restringir gasto, prioridade econômica e candidatos de assinatura na retenção. O Painel da recepção consulta os indicadores que exibe. O endpoint legado de resumo permanece disponível. As medianas de intervalo de retorno são reutilizadas por serviço dentro de cada requisição de retenção. Cenários do simulador são independentes.
- **Tecnologia:** componentes sem dependência gráfica e sem build. Testar ECharts com distribuição fixada e carregamento sob demanda quando houver séries densas, zoom ou filtros cruzados que justifiquem o custo de mantê-lo.
- **Liberação:** nenhuma migration. Publicação, validação com dispositivo instalado e medições reais exigem sua própria autorização e evidência.

## D-073 — Direção futura: uma rede, várias unidades, CNPJ por unidade (sem código, sem migration)
- **Decisão (Platform Owner, 2026-11-24):** "Futuramente vamos desenvolver isso. 1 tenant + múltiplas unidades. Mesmo com o CNPJ diferente." Contexto: a "assinatura multi" da legenda de referência é o plano que vale em qualquer unidade da rede.
- **Situação:** direção registrada, **BLOQUEADA** até a V1.5 (escala de rede; `CLAUDE.md`: não avançar para V1.5 com P0 aberto). Nenhum código, tela ou migration agora.
- **Modelo alvo:** o tenant continua sendo a empresa, que passa a representar a rede; cada unidade pode ter razão social e CNPJ próprios. O isolamento entre clientes do HOPE OS segue por empresa; a separação por unidade vale dentro da rede.
- **O que já existe (verificado em 2026-11-24):** tabela `unidades` da empresa (007), vínculos de acesso de usuário por unidade cadastráveis (`membership_units`) e `unidade_id` opcional nas escalas (013). **Nada disso isola por unidade hoje:** nenhuma consulta de dados filtra pelos vínculos, e a escala é lida pela empresa (`carregarDisponibilidade`). Não têm unidade: planos e assinaturas (021/022), agendamentos, comandas, caixa e estornos. Hoje todo plano vale para a empresa inteira, e a razão social e o CNPJ ficam na empresa.
- **O que muda quando a rede for construída:**
  - razão social, CNPJ e aviso de privacidade por unidade; quem responde pelos dados do cliente (controlador, LGPD) pode variar por unidade e **exige validação jurídica**;
  - agenda, comanda, caixa, comissão e estorno registram a unidade; o fechamento de caixa passa a ser por unidade;
  - nota fiscal (quando houver) emitida pelo CNPJ da unidade;
  - link público por unidade, ou escolha da unidade no link;
  - assinatura com escopo: uma unidade ou "multi" (qualquer unidade), com a unidade de cada uso registrada;
  - cadastro de clientes continua da rede;
  - Painel e Cockpit por unidade e consolidado da rede;
  - RLS e permissões testadas por unidade, com Red Team antes de declarar isolamento entre unidades.
- **Risco principal:** dinheiro atravessando CNPJs. Uma assinatura multi paga numa unidade e usada em outra gera receita num CNPJ e serviço prestado por outro. **Antes de implementar:** regra de repasse entre unidades definida com o contador.
- **Prática a seguir desde já (desenho, sem migration):** tabela nova de operação (agenda, comanda, caixa, assinatura e similares) deve prever `unidade_id`, mesmo vazio. Qualquer migration continua exigindo autorização do Platform Owner (028+).
- **Pré-requisitos para começar:** decisão contábil sobre repasse entre CNPJs; validação jurídica do aviso de privacidade por unidade; autorização das migrations; plano de Red Team do isolamento por unidade.

## D-075 — Cockpit: preenchimento da grade no cartão de ocupação realizada (sem migration)
- **Pedido (pendência do PR #64):** o cartão mensal mostrava a ocupação realizada (ex.: 150%) sem o preenchimento da grade ao lado; o preenchimento só aparecia no detalhe. Pedido para os dois aparecerem juntos.
- **Regra:** o cartão mensal ganha a linha "Preenchimento da grade: X%" logo abaixo da base em minutos. Nenhum cálculo novo: é o `preenchimentoGradePct` que o servidor já devolve em `ocupacaoMes`.
- **Verificação:** E2E `cockpit` lê o cartão "Ocupação realizada" e confere a linha de preenchimento (cenário local: 10,4% realizada e 2,8% preenchida).
- **Não muda:** cálculo, permissão, grade e demais cartões. Sem migration.

## D-074 — Agenda: grade do tamanho do dia e selo de fora da escala (cards, etapa 1; sem migration)
- **Pedido (Platform Owner, 2026-11-24/25):** um agendamento avulso encaixado às 07:00 "não ficou visível, pois a grade não se adapta". No retorno ao projeto dos cards, o dono escolheu a ordem grade → cards → arraste, com cada etapa num PR de rascunho. Decisões do projeto registradas para as próximas etapas: concluído e pago fica acinzentado e com chanfro; a intensidade padrão é suave; a primeira entrega de ícones usa só os 7 que já têm dado (assinante, assinatura em atraso, primeira visita, recorrente, agendou pelo link, lista de espera, faltas).
- **Problema (verificado no código):** `js/ui/agenda.js` fixava a grade em 08:00–20:00. Um atendimento fora disso era desenhado com posição negativa (acima da grade) ou além do fim, ficando invisível e impossível de tocar.
- **Regra:** a janela do dia é a união de 08:00–20:00 com a escala do dia e com os atendimentos dos profissionais na tela, arredondada para horas cheias. **Só cresce, nunca encolhe:** o trecho fora da escala dentro de 08:00–20:00 continua tocável para encaixe, como hoje. Quando a grade cresce para cima, a rolagem é ajustada para manter na tela o mesmo horário.
- **Selo:** ao lado do total do dia, "N fora da escala" conta os atendimentos ativos fora da escala (os mesmos que o card marca com ⚠). Tocar rola a grade até o primeiro e o destaca por um instante. Sem nenhum, o selo some. Substitui a ideia de uma faixa de aviso, que ocupava espaço na tela da agenda.
- **Não muda:** escala, servidor, regras de encaixe, card, arrastar. Nenhuma migration.
- **Verificação:** E2E `agenda-grade-dinamica` (CSP de produção, celular): encaixe às 07:00 e às 20:30 aparecem dentro da grade e tocáveis; régua de 07:00 a 21:00; selo "2 fora da escala" leva ao das 07:00 com destaque; num dia sem encaixe a grade continua 08:00–20:00 e o selo some. **Controle negativo:** com a janela fixa de antes, caem a régua, os dois atendimentos e o selo (o das 07:00 fica coberto pelo cabeçalho dos dias).
- **Achado sem mudança:** a barra de navegação fixa cobre o que estiver encostado no rodapé da tela; rolando, o horário fica tocável. Já era assim antes.
- **Pendente nesta frente:** série recorrente fora da escala: ver D-076.

## D-076 — Recorrência: encaixe fora da escala, como no avulso (substitui em parte a D-039; sem migration)
- **Pedido (Platform Owner, 2026-11-25):** uma série recorrente às 07:00, feita na simulação, foi bloqueada inteira sem o aviso de permissão de encaixe que o agendamento avulso já oferece. Pediu que a série ofereça o mesmo encaixe.
- **Regra anterior (D-039):** "a série nunca encaixa à força": datas fora da escala ficavam de fora e a tela não oferecia encaixe. Esta decisão substitui essa parte. O restante da D-039 continua valendo (sem encaixe pelo link público, cancelar e alterar por escopo, trilha, série respeita conflito).
- **Regra nova:**
  - Só datas **fora da escala** entram como encaixe. **Conflito com outro atendimento continua de fora**: encaixe nunca sobrepõe.
  - Quem pode: quem tem `agenda:encaixar`, além de `agenda:recorrencia`. O pedido é explícito: `foraDaDisponibilidade: true` no corpo de `POST /api/agenda/series`. Sem o pedido, a série se comporta como antes.
  - Pedido com o flag sem `agenda:encaixar` → 403 antes de ler a agenda; nada é gravado.
  - Cada data encaixada grava sem `disp_versao` (como o avulso forçado) e fica na trilha com `fora_da_disponibilidade: serie_encaixe`; a resposta marca essas datas com `encaixe: true`.
  - A tela pergunta, após a prévia, só para quem tem `agenda:encaixar` e só quando há datas fora da escala. Cancelar a pergunta cria só as livres.
- **Observação de permissão (verificada):** hoje nenhum papel tem `agenda:recorrencia` sem `agenda:encaixar`, e o profissional não recebe recorrência. Por isso o teste de negação por encaixe não tem usuário real hoje: a defesa existe no código, e o teste de navegação cobre que quem não pode criar série não grava nada.
- **Verificação:**
  - `series-gate` S18: recepção encaixa a data fora da escala; o conflito fica de fora; a trilha registra o encaixe. **Controle negativo:** com o encaixe desligado no servidor, S18 cai.
  - S19: pedido de encaixe sem permissão de recorrência → 403, nada gravado.
  - S20: flag que não é booleano → 422.
  - E2E `series` (prévia e criação normais) e `agenda-bloqueio`, `agenda-inteligente` passam.
  - **Não coberto por navegador:** a pergunta de encaixe na tela. A base de teste não tem data fora da escala no fluxo de "Repetir". Fica como pendência de teste.
- **Não muda:** escala, conflitos, link público, cancelar e alterar, permissões existentes. Sem migration.

## D-077 — Agenda: card novo com ícones de situação do cliente (cards etapa 2; sem migration)
- **Pedido (Platform Owner, 2026-11-25):** "Faz a etapa 2 dos cards", conforme o protótipo aprovado em 25/11 (skill `agenda-cards`). Escolhas do dono: suave por padrão, situação no canto, concluído e pago acinzentado + chanfro, só os 7 ícones que já têm dado.
- **Servidor:** `GET /api/agenda?data=AAAA-MM-DD&marcadores=1` devolve em cada agendamento `marcadores` (códigos dos ícones, na ordem do card) e `pago`. Sem `marcadores=1`, ou sem `data`, a resposta não muda. Motor puro `MarcadoresAgendaEngine`. As leituras são por lista de ids, em lotes de 100: nada de uma consulta por card.
- **Fonte de cada ícone (conferida no código e nas migrations):**
  | Ícone | Fonte |
  |---|---|
  | Assinante / assinatura em atraso | `situacao()` das assinaturas do cliente HOJE (em dia; atrasada ou suspensa). Só para quem tem `assinatura:ver`: o profissional não recebe |
  | Primeira visita | Nenhum atendimento concluído/fechado nem comanda fechada em **dia anterior** |
  | Recorrente | `agendamentos.serie_id` (018) |
  | Pelo link | Evento `origem_link_publico` na trilha `agendamento_eventos` |
  | Veio da espera | Evento `criado` com `espera_baixada` (D-060) |
  | Faltas | `computeReguaFaltas` em `alerta` ou `exigir_sinal`, só com o que veio **antes** do horário do card |
- **Pago:** status `fechado`, ou `concluido` com o evento de status do checkout (`origem: 'checkout'`). Concluído à mão não é pago.
- **Limite conhecido:** a trilha de eventos é best-effort (AgendaEventosService). "Pelo link", "veio da espera" e "pago" podem **faltar** se o evento não foi gravado, nunca sobrar.
- **Tela:** cor do serviço sempre suave. O matiz vem da categoria conhecida; sem categoria conhecida, o matiz é estável pelo id do serviço. Densidade pela duração:
  - sempre aparecem horário, cliente, ícones e situação;
  - o serviço aparece a partir de 30 min;
  - o aviso (observações) aparece a partir de 45 min.

  A falta tem contorno tracejado e nome riscado. O concluído e pago fica acinzentado, com chanfro, "PAGO" e sem alça de arraste. Contraste do texto medido nos 12 matizes: pior caso 5,54:1 (escuro) e 7,16:1 (claro); AA exige 4,5:1.
- **Verificação:**
  - `marcadores-gate` M01–M08: valores calculados à mão, papéis, isolamento entre empresas e pago.
  - Controles negativos:
    - eventos sem filtro de empresa → M01, M03 e M04 caem;
    - faltas sem o corte "antes do horário" → M06 cai;
    - assinatura para todos os papéis → M03 cai;
    - pago sem exigir o evento do caixa → M08 cai.
  - E2E `agenda-cards` (390×844, CSP, claro e escuro). Controle negativo: sem a marca de pago, o E2E cai.
  - `test:offline` verde; E2E 48/48.
- **Não muda:** arraste (etapa 3), cores por serviço no cadastro (migration 028+, não autorizada), permissões, rotas de escrita. O seed de desenvolvimento passa a declarar `agendamento_eventos` (para o E2E plantar eventos).

## D-078 — Agenda: arrastar e soltar com prévia, desfazer e teclado (cards etapa 3; sem migration)
- **Pedido (Platform Owner, 2026-11-25):** "Reiniciar etapa 3", com as regras do protótipo aprovado (skill `agenda-cards`).
- **O que muda na agenda:**
  - **O card inteiro é a alça.**
    - Mouse: o arraste começa quando o ponteiro anda mais de 6 px com o botão apertado. Sem andar, é clique e abre o card.
    - Toque: segurar 0,3 s pega o card. Mexer o dedo antes disso é rolagem.
    - O soltar de um arraste não abre o card.
  - **Prévia no destino, antes de soltar:** "início–fim · profissional".
    - Verde: livre.
    - Vermelho: "Ocupado: <cliente>". Soltar ali **não muda nada**, e a tela diz por quem está ocupado. Isto substitui o diálogo "Encaixar mesmo assim" no arraste. A remarcação pelo menu continua como estava.
    - Âmbar: "Fora da escala". Soltar pede o encaixe, como no avulso. O servidor decide, e só quem tem a permissão de encaixe pode.
  - **Desfazer por 8 s:** depois de soltar, um aviso traz "Desfazer". Desfazer é outra remarcação no servidor, de volta ao horário e ao profissional de antes, com as mesmas checagens. Se o horário antigo foi tomado nesse meio-tempo, o servidor recusa e a tela mostra o erro.
  - **Teclado:** o card recebe foco (Tab).
    - Enter ou espaço abrem o card.
    - ↑/↓ movem um passo; ←/→ trocam de profissional no mesmo horário.
    - Depois de mover, o foco fica no card novo, e redesenhar a grade não tira o foco.
  - **Rolagem automática:** começa quando o dedo fica 0,4 s numa faixa de 32 px na borda de cima ou de baixo da grade. Assim é possível soltar no último horário visível sem a grade rolar.
  - Concluído, falta e pago não se arrastam e não se movem pelo teclado.
- **Passo:** continua 20 min (`SNAP_MIN`). O passo do salão (`empresas.slot_padrao`) está gravado, mas não chega à tela da agenda. Fica como pendência, para não ter grade de 20 com arraste de 30.
- **Verificação:**
  - E2E `agenda-arraste` (390×844, CSP): clique abre o card; prévia livre; grava; desfazer pelo servidor; ocupado não muda nada e diz quem ocupa; fora da escala em âmbar; teclado com foco; pago não se arrasta; rolagem na borda.
  - Controles negativos: com "Desfazer" sem chamar o servidor, o E2E cai; com o card pago arrastável, o E2E cai.
  - `agenda-confiavel` passa a ler o início da prévia em `.dh-ini`. A medição mostrou que o teste soltava a 9 px da borda: com a rolagem imediata, o horário mudava. Daí a espera de 0,4 s.
  - `test:offline` verde; E2E 49/49.
- **Não coberto por navegador:** o toque com segurar 0,3 s. O Playwright não simula bem o gesto, e o mouse cobre a mesma lógica de destino.
- **Não muda:** servidor, permissões, regras de conflito e de escala, a remarcação pelo menu. Sem migration.
## D-079 — Lista de horários do app pela grade por duração, sem exceção (substitui em parte a D-069; sem migration)
- **Relato (Platform Owner, 2026-11-25, com print):** "a lista de horários disponíveis não segue a regra absoluta". No print (Sandrinho, Corte masculino de 30 min), a lista mostrava `… 13:00 13:10 | 14:20 14:30 15:00 …`.
- **Diagnóstico (fato):** não era defeito de código. A D-069 tinha decidido que "a recepção conserva sua grade atual": a grade do salão a partir da abertura mais as duas bordas de cada janela livre.
  - Reproduzi o print exatamente no motor: expediente 09:00–19:30, ocupado 13:40–14:20, serviço de 30.
  - Pela grade por duração (a do link), o mesmo dia dá `… 13:00 | 14:20 14:50 15:20 …`.
  - O problema da regra antiga é o mesmo que a D-069 corrigiu no link: horários em sequência que se sobrepõem (14:20 e 14:30) e deixam sobras inúteis de 10 min.
- **Decisão do dono (pergunta com 3 opções):** "Grade por duração, sem exceção".
- **Regra nova:**
  - `GET /api/agenda/slots` (recepção, profissional e edição do card) usa `gradePorDuracao: true`, igual ao link: de cada janela livre, em passos da duração efetiva. A borda final só entra se cair na grade. A grade do salão + bordas não aparece mais em nenhuma lista.
  - A política de sugestão (D-054) continua marcando `sugerido` dentro dessa grade. "Ver todos" mostra a grade inteira.
  - **Não muda:** o horário digitado à mão continua aceito no `POST /api/agenda`, que revalida conflito, escala e regras. O atendimento com vários serviços (`/agenda/combinacoes`) já seguia a duração total (D-040).
- **Correção junto:** a régua de faltas escrevia "1 faltas seguidas". Agora escreve "1 falta seguida" (servidor e tela).
- **Verificação:**
  - Gates reescritos para a regra nova, com valores calculados à mão:
    - `onda-b` B06: buffer de 10 → `09:00, 10:40, 11:10, 11:40, 12:10`; as bordas 09:20 e 12:30 saem.
    - `agenda-politica` PE02: a borda 10:45 sai, 11:00 fica.
    - `agenda-politica` PE04b: a recepção é igual à grade do link.
    - `disponibilidade` D23: o horário liberado volta a partir de 14:30.
    - B07b: concordância de "1 falta seguida".
  - E2E `grade-link`: a recepção recebe `09:35, 10:20, 11:05, 11:50`.
  - **Controle negativo:** com `gradePorDuracao: false` na rota, B06, PE02 e PE04b caem. O D23 passa nas duas regras, porque 14:30 também era borda na regra antiga.
  - `test:offline` verde; E2E 48/48.
- **Custo aceito:** menos horários na lista. No print, 13:10 some, e a tarde passa a andar de 14:20 em 30 em 30. Um encaixe fora da grade só é feito digitando o horário.

## D-080 — Legenda dos ícones no card, estrela amarela, "$" do pago e agenda com 2 profissionais por vez (cards 4a; sem migration)
- **Pedido (Platform Owner, 2026-11-26):**
  - Depois do protótipo da etapa 4: legenda dos ícones dentro do modal do card, "como o Histórico" (o dono confirmou: o mesmo modal, com um campo a mais).
  - Estrela amarela para plano ativo e pago; "$" verde para pago no local.
  - "A agenda está apresentando quatro profissionais mas ficou muito apertado… manter com a visibilidade de apenas dois".
- **Legenda:**
  - Campo "Ícones deste card (N)" no modal, fechado por padrão, igual ao Histórico. Só aparece quando o card tem ícone.
  - Cada linha tem o ícone, o nome e o motivo.
  - "Ver todos os ícones" troca para a legenda completa (os 8 que existem hoje).
- **Ícones:**
  - Assinante em dia: fundo amarelo com estrela escura.
  - Em atraso ou suspensa: vermelha, sem mudança.
  - "$" verde (pago no local) entra quando `pago` é verdadeiro (comanda fechada pelo caixa, D-077), logo depois das estrelas. O texto "PAGO" saiu.
  - O card pago perde cor **só no fundo** (saturação 12%). Antes era `filter` no card inteiro, que apagaria o verde. Continua com o chanfro.
- **Agenda no celular (até 767 px):**
  - Com 3 ou mais profissionais, cada coluna ocupa metade da largura útil (fora a régua de 44 px). As outras ficam ao lado, com encaixe por coluna ao deslizar.
  - **Sem barra extra acima da grade.** A primeira versão tinha um indicador "‹ Ana e Bruno · 1–2 de 4 ›"; o dono testou e pediu para tirar ("acaba poluindo… o movimento rolar de lado é mais inteligente"). Ficou só o deslizar, com encaixe por coluna; os nomes no cabeçalho dizem quem está na tela.
  - No arraste, segurar perto da borda esquerda (depois da régua) ou direita rola para o lado, com a mesma espera de 0,4 s da rolagem vertical.
  - Com 1 ou 2 profissionais e em telas largas, nada muda.
  - **Substitui** a regra da D-055 "no celular cabem até 3 profissionais sem rolar de lado".
- **Verificação:**
  - E2E `agenda-colunas`: com 4 profissionais, a coluna mede 149 px de 298 úteis e 2 cabem na tela; não há barra extra; a grade desliza de lado com encaixe até o card da Davi; filtrando 2, a grade não rola de lado. **Controle negativo:** sem a classe de 2 colunas, as colunas voltam a 96 px e o teste cai.
  - E2E `agenda-cards`: "$" verde primeiro, sem `filter`, com recorte do canto; legenda fechada por padrão com os 2 ícones do card; "Ver todos" mostra 8 e esconde os do card. **Controle negativo:** sem a regra que esconde a lista completa, o teste cai. Esse defeito apareceu na captura de tela e foi corrigido antes de entregar.
  - `agenda-confiavel`: a asserção da D-055 passou a conferir 2 por vez, com o terceiro ao deslizar.
  - `test:offline` verde; E2E 50/50.
- **Não muda:** servidor, permissões, ícones bloqueados (estrela laranja até a V1.5; pago online até haver fornecedor).

## D-081 — Alças de cima e de baixo do card, etiqueta de horário e passo de 10 min por aparelho (cards 4b; sem migration)
- **Pedido (Platform Owner, 2026-11-26):**
  - "Segurar no topo do card e redimensiona. Segurar na parte inferior do card e redimensiona. Segurar no meio do card arrastar."
  - O horário do encaixe aparece enquanto arrasta e enquanto redimensiona.
  - Passo de 10 min no aparelho (decidido em 26/11).
- **Zonas do card:**
  - Faixa de cima (14 px) muda o **início com o fim parado**.
  - Faixa de baixo muda o **fim com o início parado**.
  - O meio arrasta.
  - Card com menos de 30 min só tem a faixa de baixo, para sobrar meio para pegar.
  - A faixa de cima substitui a barrinha só visual que existia desde a D-078.
- **Etiqueta única "09:40–11:00 (80 min)"** nos três gestos. No arraste ela fica presa ao card que acompanha o dedo, com o profissional e "ocupado" ou "fora da escala" quando for o caso. Nas alças fica acima ou abaixo do card.
- **Limites:**
  - O passo conta a partir do início e da duração originais, não do ponto onde o dedo pegou.
  - A alça de cima para no fim do atendimento anterior do mesmo profissional; a de baixo para no início do seguinte.
  - Duração mínima de 10 min.
  - **Esc** cancela arraste e redimensionamento sem gravar.
- **Servidor:** `PATCH /api/agenda/:id/status` (reagendado) aceita `novaDuracaoMin` (inteiro de 10 a 480).
  - Puxar o topo é uma remarcação com duração nova numa operação só. A 027 grava a duração do `jsonb`: sem migration.
  - O conflito e a escala são conferidos com a duração nova.
  - "Desfazer" volta horário e duração.
  - Sem o campo, a remarcação mantém a duração, como antes.
- **Passo:** escolha por aparelho em Agenda › (i), com as opções 5, 10, 15, 20 e 30. O padrão é 10. Fica guardado no navegador; sem armazenamento, vale 10.
  - Vale para o arraste, as alças e as setas do teclado.
  - A grade de toque dos horários livres continua de 20 min, para o alvo de toque não ficar pequeno; o card pode parar entre as linhas.
- **Verificação:**
  - `historico-gate` H-DUR:
    - 10:00/30 puxado para 09:40 grava 09:40/50;
    - 10:30 com 60 min sobre um atendimento às 11:00 dá `SCHEDULE_CONFLICT`, e nada muda;
    - 5, 481, "50" e 12,5 dão 422;
    - sem o campo, a duração é mantida.
    - **Controle negativo:** com a rota ignorando o campo, o H-DUR cai.
  - E2E `agenda-alcas` (390×844, CSP). Cobre:
    - alça de cima "09:40–11:00 (80 min)" gravando 09:40/80, e Desfazer voltando a 10:00/60;
    - limite no vizinho "09:30–11:00 (90 min)", e Esc sem mudar nada;
    - alça de baixo "10:00–11:10 (70 min)";
    - card de 20 min sem alça de cima;
    - etiqueta do arraste "10:10–11:20 (70 min) · Ana", e Esc;
    - passo 30 lembrado depois de recarregar, com ↑ movendo 30 min.
    - **Controles negativos:** sem enviar a duração nova, o E2E cai (grava 09:40/60); sem o limite do vizinho, cai ("09:00–11:00 (120 min)").
  - Ajustes em testes antigos:
    - `agenda-confiavel` pega o card logo abaixo da alça de cima. Medido: o ponto de soltar antigo caía na borda de 1 px da grade.
    - `agenda-arraste`: ↓ anda 10 min (09:10).
  - `test:offline` verde; E2E 51/51.
- **Não coberto por navegador:** o toque com o dedo nas alças. O Playwright não simula bem; o mouse cobre a mesma conta.

## D-082 — Comandas: histórico por período, com atalhos e calendário de dois toques (sem migration)
- **Pedido (Platform Owner, 2026-11-26):** "o filtro que hoje é com data única… um calendário inteligente, aonde você clica na primeira data e na última… e também botões de toque: hoje, esta semana, este mês, mês anterior, e o calendário dentro do personalizado. Vi algo parecido no sistema bancário para consulta de extratos." Protótipo aprovado no mesmo dia.
- **Tela (Comandas › Histórico de comandas):**
  - Atalhos de um toque: Hoje, Ontem, Esta semana (a partir de domingo, como a agenda), Este mês, Mês anterior e Personalizado.
  - Personalizado abre um calendário: o primeiro toque marca o início e o segundo o fim. O primeiro toque sozinho não consulta nada. Datas futuras ficam desligadas; o limite é de 92 dias, contados inclusive. Tocar duas vezes no mesmo dia consulta esse dia.
  - No topo, o resumo vindo do servidor: "3 comandas · 24/11 a 25/11 · Recebido R$ 130,00" e, se houver, "Estornado R$ X". Com mais de um dia, a lista fica agrupada por dia.
  - No histórico, o campo de data some; na fila "Atendimentos da agenda", ele continua, com um dia só.
  - Voltar de uma comanda mantém o período, sem consultar de novo.
- **Servidor:** `GET /api/comandas?inicio=&fim=`, além do `?data=`, que continua.
  - Erros de período devolvem 422: `INVALID_RANGE` para intervalo invertido, `RANGE_TOO_LONG` acima de 92 dias e `INVALID_DATE` para data inválida ou só `fim`.
  - Mesmo cálculo de saldo e estorno de antes. Ordem: data e hora, mais recentes primeiro.
  - Novo campo `resumo {comandas, recebidoCentavos, estornadoCentavos}`. O recebido é a soma do recebido nas vendas; o estornado, a soma dos reembolsos dos estornos dessas comandas.
- **Verificação:**
  - Gate `comandas-periodo` CP01–CP04:
    - novembro tem 3 comandas, recebido 16000 e estornado 2000;
    - `data` continua valendo;
    - os 422, com 92 dias aceito e 93 recusado;
    - profissional recebe 403 e quem não tem token recebe 401.
    - **Controles negativos:** sem o limite, o CP03 cai; sem o filtro de empresa no período, o CP01 cai.
  - E2E `comandas-periodo`:
    - atalhos visíveis e campo de data escondido; "Hoje" consulta `?data=`;
    - o primeiro toque não consulta; o segundo consulta `?inicio=&fim=`;
    - 3 comandas e "Recebido R$ 130,00" em 2 dias;
    - voltar sem nova consulta;
    - na fila da agenda, a data volta.
    - **Controle negativo:** consultando já no primeiro toque, o E2E cai.
  - `comandas-list-gate` (7/7) passou a injetar o módulo `periodo.js`. O `comandas-navegacao` usa "Ontem" e "Hoje" no lugar de digitar a data no histórico.
  - `test:offline` verde; E2E 52/52.
- **Não muda:** estorno, prazos, permissões (`comanda:historico`) e a fila da agenda.

## D-083 — Gestão organizada por intenção e "Como a agenda aparece" (zoom e passo por aparelho; sem migration)
- **Pedido (Platform Owner, 2026-11-26):** as ideias da 4d "podem ser um campo de configuração (ativar desativar) na aba gestão. E também reorganizar/combinar ou agrupar todas as configurações de forma mais intuitiva por intenção". Escolhas no mesmo dia, depois do protótipo (claude.ai/artifact/7C9vndSEoHvmRSsjSYAJie):
  - opções da agenda **por aparelho, agora**;
  - novas opções **ligadas por padrão**;
  - "Cliente chegou" como opção **do salão (caminho B)**, que precisa da migration 028 e **não entra aqui**.
- **Gestão em 8 grupos, pelo que a pessoa quer fazer:**
  - Como o salão funciona: Horários e escalas, Regras da agenda.
  - Como a agenda aparece (novo): Zoom e passo do arraste.
  - Clientes que agendam sozinhos: Agendamento online, Lista de espera.
  - Equipe: Profissionais, Equipe e acessos.
  - O que o salão vende: Serviços, Produtos, Planos de assinatura.
  - Clientes: Clientes, Assinantes.
  - Dinheiro: Formas de pagamento, Regras de comissão, Caixa, Metas e ganhos.
  - Primeiros passos: Assistente de configuração.
- **Não muda:** os nomes dos atalhos, os ids, quem vê cada atalho (mesmas permissões) e o que cada tela faz.
- **Busca:** cada atalho carrega o nome do grupo antigo e palavras do que faz. Por isso "financeiro", "pessoas e acessos", "buffer", "tolerância" e "zoom" continuam achando.
- **Como a agenda aparece (só neste aparelho, guardado no navegador):**
  - **Zoom da grade:** compacto 2, normal 3 (como antes) ou largo 4 px por minuto. Chave `hopeos.agenda.zoom`.
  - **Passo do arraste:** sai do (i) da agenda e vem para cá (D-081, mesma chave `hopeos.agenda.passo`). O (i) ganha o botão "Zoom e passo do arraste", que abre esta tela.
  - Todo papel vê, inclusive o profissional: é escolha do aparelho, não regra do salão.
- **Ainda não entra, de propósito:** as chaves de espaço livre, visita ligada, destaque de atraso e lado a lado. Cada uma entra **no PR da própria função**, já ligada por padrão. Uma chave que ainda não faz nada seria enganosa.
- **Achado no caminho:**
  - O aviso de atraso já existe para o salão (D-049): tolerância em Regras da agenda, 0 desliga. Hoje ele aparece só no modal do card.
  - "Cliente chegou" é o status `aguardando`.
  - O servidor já aceita `agendado → em_atendimento` direto.
  - O destaque de atraso no card dependerá de o salão usar "Cliente chegou". Por isso o caminho B (opção do salão, migration 028) precisa vir antes ou junto do destaque.
- **Verificação:**
  - E2E novo `gestao-aparencia`:
    - admin vê os 8 grupos na ordem;
    - "financeiro", "buffer" e "zoom" acham os atalhos certos;
    - card de 30 min tem 90 px no normal e 60 px no compacto, e continua compacto depois de recarregar;
    - o (i) leva à tela;
    - o profissional vê o grupo;
    - sem CSP nem 5xx.
    - **Controle negativo:** com compacto = 3 px, o E2E cai (90 px).
  - `gestao-navegacao` passou a conferir os grupos novos pelo título.
  - `agenda-alcas` passou a escolher o passo pelo caminho novo.

## D-084 — "Cliente chegou" como opção do salão (migration 028)
- **Pedido (Platform Owner, 2026-11-26):** "Chegou pode ser uma função ligada e desligada". Entre as opções (A por aparelho, B do salão, C sem migration), o dono escolheu **B** e aprovou a migration ("Migração aprovada") depois da proposta `agenda_usa_chegada`.
- **Migration 028 `agenda_usa_chegada`:** `empresas.agenda_usa_chegada boolean not null default true`. O padrão `true` mantém tudo como antes. Rollback em `supabase/rollback/028_down.sql`.
  - Gate `gate_028`: padrão `true`, `null` recusado, `false` grava, tabela sem acesso de `anon`/`authenticated`.
  - Suíte SQL completa verde, com o ciclo de rollback.
  - **Controles negativos:** padrão `false` derruba o bloco 1; coluna aceitando `null` derruba o bloco 2.
- **Servidor:** `PATCH /empresa` aceita `agendaUsaChegada`, só booleano, e só quem tem `empresa:configurar`. `GET /empresa` devolve o campo.
  - O servidor não bloqueia nenhum status: `agendado → em_atendimento` já era permitido, e `aguardando` continua aceito.
  - É uma escolha de processo do salão, não uma regra de segurança.
- **Tela:**
  - Gestão › Regras da agenda › "Marcar 'Cliente chegou'" (Sim/Não), que vale para toda a equipe.
  - Com "Não":
    - o card de um horário agendado ou confirmado oferece "Iniciar atendimento" no lugar de "Cliente chegou";
    - a tela Agora do profissional faz o mesmo;
    - o aviso de atraso não aparece, porque sem a chegada marcada todo cliente pareceria atrasado.
  - A escolha chega a quem abrir ou recarregar o app depois de salva.
- **Bug corrigido no caminho (REAL, desde a D-049):** `carregarRegras()` roda ao abrir o app, antes do login.
  - A falha era guardada como `{}` e a busca nunca se repetia. Recepção e profissional nunca recebiam as regras do salão.
  - O aviso de atraso usava sempre 15 min, e o prazo de cancelamento do salão, no aviso ao cancelar, usava sempre 2 h, mesmo com outro valor configurado.
  - Agora só a resposta que deu certo é guardada, e a busca se repete quando a agenda carrega.
- **Segundo bug corrigido (REAL, desde a D-049; achado pelo CI):** abrir Regras da agenda buscava `GET /empresa` com o formulário antigo ainda na tela. Se a pessoa mudasse um campo antes da resposta chegar, o redesenho trazia o valor salvo de volta e "Salvar" gravava o valor antigo, sem aviso.
  - Agora a tela mostra "Carregando as regras…" até a resposta chegar.
  - Reproduzido com a resposta atrasada de propósito: o teste antigo cai igual ao CI; com a correção da tela, ele passa.
- **Numeração:** a 028 estava prevista para consentimento e aniversário. Esses itens passam para a 029, ainda não autorizada.
- **Verificação:**
  - Gate `agenda-regras` R04b: `false` grava e o profissional lê; `"sim"`, `1`, `0`, `null` e `"false"` dão 422; recepção recebe 403.
    - **Controle negativo:** sem a checagem de tipo, R04b cai.
  - E2E novo `chegada-salao`:
    - admin desliga pela tela;
    - a tela Agora do profissional mostra "Iniciar atendimento";
    - o card da recepção mostra "Iniciar atendimento", sem "Cliente chegou" e sem "atrasado";
    - tocar grava `em_atendimento`;
    - religado, "Cliente chegou" e "atrasado" voltam.
    - **Controles negativos:** com o cache antigo de `{}`, 3 conferências caem; com a opção ignorada, 3 caem.
  - `test:offline` verde.

## D-085 — Atendimentos ao mesmo tempo lado a lado na agenda (sem migration)
- **Pedido (Platform Owner, 2026-11-27):** teste em produção, "dois cards no mesmo tempo ficaram parcialmente sobrepostos. O melhor é que eles fiquem lado a lado". Aprovado sem chave: ligado sempre, porque ninguém quer um card escondendo outro. Isso é uma exceção à regra da D-083, de uma chave para cada função.
- **Antes:** cada card ocupava a largura inteira da coluna. Dois atendimentos ao mesmo tempo, como um encaixe forçado ou um horário marcado pelo link, ficavam um sobre o outro.
- **Agora:** é a lógica de uma agenda de calendário.
  - Os cards que se cruzam na mesma coluna formam um grupo. Cada card vai para a primeira faixa livre do grupo, e a largura é dividida pelo número de faixas.
  - Um card que não cruza com ninguém continua com a largura inteira.
  - O cruzamento usa o horário real: dois atendimentos seguidos, como 11:00–11:10 e 11:10, não ficam lado a lado.
  - **Card dividido:** o horário fica na primeira linha e o nome embaixo, em até 2 linhas.
  - **Com 3 ou mais ao mesmo tempo:** o card mostra o horário e as iniciais. O nome inteiro continua no rótulo de acessibilidade e aparece ao tocar.
- **Não muda:** arrastar, as alças de cima e de baixo, o teclado, o aviso ⚠ de conflito e as 2 colunas por vez no celular. O alvo do arraste é calculado pela coluna e pela altura, não pela largura do card.
- **Verificação:**
  - E2E novo `agenda-lado-a-lado`, em tela de 390×844:
    - um card sozinho fica com a largura inteira;
    - dois ao mesmo tempo ficam com metade cada, sem se cobrir;
    - um card das 10:40 reusa a faixa que ficou livre;
    - dois seguidos ficam com a largura inteira;
    - três ao mesmo tempo ficam com um terço cada e mostram as iniciais;
    - arrastar um card de metade grava o horário novo, e lá ele volta à largura inteira;
    - sem violação de CSP e sem 5xx.
  - **Controle negativo:** com todas as faixas iguais a 1, ou seja, como era antes, 6 conferências caem.
