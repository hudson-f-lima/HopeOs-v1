# Changelog

## Estorno de comanda, histórico da agenda e agendamento online (D-013, D-014)
- **Estorno de comanda (migration 009):**
  - total ou parcial, pelo botão "Estornar" em "Comandas do dia" no Dashboard (só gestão);
  - devolve estoque e reembolsa pela forma escolhida;
  - os relatórios descontam o estorno no dia e no mês em que ele acontece, então mês fechado não muda.
- **Histórico financeiro imutável no próprio banco:** nada do caixa, das comandas ou do estoque pode ser alterado ou apagado depois de gravado.
- **Histórico de cada horário da agenda:** criado, confirmado, chegou, na cadeira, cancelado, reagendado e concluído, com quem fez. A confirmação prévia do painel do piloto passa a ser medida no período.
- **Agendamento online pelo link do salão** (`agendar.html`), desligado até a configuração e as aprovações.
- Testes:
  - offline 16 suítes (novas: estorno 14, histórico 12, agendamento público 19);
  - SQL: gate_009 11 blocos, concorrência do estorno, controles negativos e rollback 009→007;
  - E2E 12/12.

## Blueprint Beauty & Wellness (D-012)
- Agenda com presença:
  - "Cliente chegou" e "Iniciar atendimento" na folha do horário;
  - quem já chegou não pode ser marcado como falta;
  - atendimento cancelado ou com falta não volta.
- Fechamento de caixa no Dashboard: total por forma de pagamento, taxa, líquido previsto, gorjetas e conferência do dinheiro contado (mostra falta ou sobra).
- Painel do piloto (gestão): taxa de falta, reagendamento no checkout, retorno do cliente novo e confirmação prévia, comparados com a referência de mercado, também por profissional.
- Correções:
  - gorjeta negativa (desconto escondido) e desconto acima do total agora são recusados;
  - a venda fechada depois das 21h de Brasília caía no dia seguinte, e agora a data da comanda é sempre a do servidor no fuso da empresa.
- Cancelamento tardio: com dados reais do banco (horário com segundos), cancelar no próprio dia nunca contava como tardio, e o horário era lido em UTC; agora conta certo, no fuso da empresa (afeta confiabilidade do cliente e o painel do piloto).
- Segurança: cabeçalhos próprios na API (nosniff, X-Frame-Options DENY, no-referrer, CORP same-site, HSTS em produção, sem X-Powered-By) e corpo JSON até 100 KB; CSP e cabeçalhos no site estático (`render.yaml`).
- CI: novo job `e2e-pwa` roda os 10 roteiros de navegador da PWA sob a CSP (falha com erro de console ou violação de CSP).
- Números com largura fixa em todo o app.
- Análise do blueprint e desenhos de estorno e agendamento online em `docs/planning/`.
- Testes: offline 11 suítes verdes (novas: caixa 7, piloto 10; lembretes 8; onda-b 10); 9 E2E sem erro de console.

## Auditoria, segurança e lembretes (D-011)
- Lembretes de confirmação: na Agenda, botão "Lembretes" lista os horários de amanhã (ou do dia escolhido) ainda não confirmados, com a mensagem pronta no WhatsApp do cliente e o botão "Confirmou".
- Segurança: dependências de produção sem vulnerabilidades conhecidas (antes: 1 crítica, 2 altas); CORS passa a comparar a origem exata.
- Agenda: atendimento já pago (concluído) ou reagendado não pode mais virar cancelado/falta.
- Auditoria de estado e benchmark de mercado em `docs/audit/AUDITORIA_E_BENCHMARK_2026-11.md`.
- lembretes-gate 7/7 (com controle negativo); offline 204/204; E2E dos lembretes.

## Produção do banco e trava de migrations (D-010)
- Banco `hopeos-v1` com 001–008 aplicadas pela integração GitHub do Supabase no merge do PR #16; verificação do runbook 12/12.
- `supabase/migrations.lock` + `check_migrations.sh` no CI: migration não autorizada, editada ou apagada reprova o PR, porque o merge na `main` agora executa SQL em produção.

## Onda B (D-009, migration 008)
- Empresa com CNPJ (dígito verificador), razão social e regime de salão-parceiro; relatório mensal de cota-parte (salão × profissionais) no Dashboard da gestão.
- Intervalo de higienização entre atendimentos (0/5/10/15 min), respeitado na sugestão de horários e na trava de agenda do banco.
- Cargos e categorias com herança da comissão: ajuste do profissional → cargo ou categoria → comissão do serviço. Serviços existentes não mudam (`FIXED_SERVICE`).
- Régua de faltas (só alerta): faltas seguidas recentes avisam ao agendar.
- Gestão → Comissões; assistente de configuração com cargos, buffer e dados fiscais.
- migration 008 + rollback; gate_008 com controle negativo; onda-b-gate 9/9; offline 197/197; E2E.

## Assistente de configuração (Onda A, D-008)
- Novo assistente em 6 fases para salão recém-criado: dados, horários, pagamentos, cardápio pronto por nicho, equipe com ajustes por serviço e simulação de atendimento sem gravar no caixa. Retoma de onde parou em qualquer aparelho.
- `GET/PATCH /api/empresa` (antes os dados e horários da empresa só mudavam por SQL) e rotas `/api/onboarding/*`.
- Runbook: o bootstrap do primeiro admin agora cria a empresa e a "Unidade principal" (num banco novo o passo antigo falhava por FK).
- onboarding-gate 9/9; offline 188/188; E2E do assistente.

## Identidade, RBAC e autoria (ADR-005, migration 007) — código pronto, produção pendente
- Migration 007: `app_users` (sincronizado de `auth.users`), `empresa_memberships` com papel fixo, `unidades`, `membership_units`, principal de integração (`integrations`, credenciais só em hash, scopes, auditoria), autoria em comandos/estoque/agenda/clientes, `agendamento_criar` atômico (fecha a corrida de double-booking) e RLS deny-all + revogação de `anon`/`authenticated` em todo `public`. Rollback em `supabase/rollback/007_down.sql`.
- Backend: três mecanismos de autenticação coexistentes (usuário JWT, integração `kxi_…`, legado desligável), RBAC em todas as rotas de negócio, escopo "Próprio" do profissional, autoria injetada pelo servidor, convite por e-mail, recuperação de senha, administração de equipe/unidades/integrações e métricas de adoção.
- CRÍTICO corrigido: dashboard, financeiro, snapshot e insights liam a empresa padrão em vez da empresa do usuário.
- PWA: login, "Defina sua senha" (convite/recuperação), "Esqueci minha senha", seleção de empresa, Gestão > Equipe, UI por papel; token legado continua funcionando.
- Testes: identity-gate 38/38, gate SQL da 007 + teste de concorrência real (com controle negativo) no CI em Postgres 16, E2E Playwright versionados.
- Produção: ver `docs/RUNBOOK_MIGRATION_007.md` (Supabase de produção fora do alcance desta sessão; Render suspenso).

## Agenda — slots-âncora (backend, sem migration)
- Novo `GET /api/agenda/slots?data=&profissionalId=&servicoId=[&duracaoMin=]`: sugere horários livres e marca `ancora`/`recomendado` (encaixes que encostam em abertura, fechamento, almoço ou outro atendimento e deixam a menor sobra inutilizável). Somente leitura; tenant vem de `req.auth`.
- Novo motor puro `backend/src/engines/SlotEngine.js`; aceita os dois formatos de horário existentes (`{seg:{ativo,inicio,fim}}` e `{1:{start,end}}`) e falha fechado sem horário configurado.
- `POST /agenda` passa a gravar a duração com o override do profissional por serviço (`overrides[servicoId].duracao_min`), a mesma regra usada para sugerir os slots.
- `APP_TIMEZONE` (padrão `America/Sao_Paulo`) evita sugerir horário passado e a virada de data UTC.
- Novo gate `schedule-slots-gate.test.js` (18/18) no `test:gate`.
- PWA: chips de encaixe ideal no modal de novo agendamento; prévia e conflito local usam a duração efetiva do backend.
- CI: `.github/workflows/ci.yml` com `npm run test:offline` (141 testes sem banco).
- Fix: acumulado D+N do fluxo de caixa (insights) passou a usar a data-base da curva em vez do relógio do servidor.
- Origem: revisão crítica de uma proposta externa (Gemini "Onda 1 Smart Slots"); schema, RPCs `SECURITY DEFINER` com tenant vindo do cliente e frontend React foram descartados.

## V1.4.2 (parcial)
- Introduzido `req.auth` no middleware de autenticação (empresa_id/user_id/actor_id/role/unit_ids), populado no backend, nunca a partir de claims do cliente.
- Corrigidos 4 pontos sem filtro de tenant (`GET /clientes`, `GET /agenda`, `PATCH /agenda/:id/duracao`, vínculo de agenda em `checkout/close`).
- Bloqueado `unit_id`/`unitId` nos validators de cadastro.
- `SupabaseRepository.insert()` não aceita mais `empresa_id`/`empresaId` do payload; grava sempre `this.empresaId` e falha fechado sem tenant válido.
- Adicionado gate `tenant-boundary-gate.test.js` (12/12) ao `test:gate`.
- `actor_id`, RBAC e tenant por identidade real permanecem BLOQUEADOS — exigem migration 007+ não autorizada.

## V1.4.1
- Implementado middleware de perímetro Bearer com fail-closed.
- Adicionado bootstrap de token e tratamento de erro de autenticação na PWA.
- Adicionados gates automatizados de autenticação.

## V1.4
- Entregues Dashboard Insights, split payment, rebooking, waitlist e melhorias de checkout.
