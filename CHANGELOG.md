# Changelog

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
