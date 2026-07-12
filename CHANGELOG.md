# Changelog

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
