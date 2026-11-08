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
