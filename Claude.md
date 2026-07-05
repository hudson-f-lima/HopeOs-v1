# HOPE OS V1.0.3 — Contexto do projeto

## Stack
Backend Node.js + Express + Supabase (Postgres). Frontend é uma PWA
(`index.html` na raiz + `frontend/index.local-prototype.html`) conectada ao
backend real via `/api/*` — não é mais protótipo isolado, é a interface que
o barbeiro usa quinta. Publicado no GitHub Pages
(`https://hudson-f-lima.github.io/HopeOs-v1/`).

## Regras invioláveis
- Auditoria brutal sempre: classificar REAL / PARCIAL / MOCKADO / CRÍTICO
- 1 prioridade por vez, sem sofisticação prematura
- Nenhuma tabela nova sem migration versionada em supabase/migrations/
- service_role nunca exposto ao frontend
- Ledger financeiro é distribuído por design: comandos, comando_itens, 
  comando_pagamentos, comando_gorjetas, caixa_movimentos, produto_estoque_movimentos.
  NÃO existe (e não deve existir) uma tabela única "financial_ledger".

## Estado atual
- Migrations 001-004 rodadas no Supabase real
- migration 004 (supabase/migrations/004_service_role_table_grants.sql) formaliza
  o GRANT de tabela/sequence/function pro service_role e faz DROP TABLE financial_ledger
  (tabela confirmada removida do banco real em 2026-07-03)
- Seed OK (7 tabelas operacionais populadas)
- 38/38 testes locais passam (npm run test:gate)
- Checkout real validado fim-a-fim em 2026-07-03 contra o Supabase real
  (qosioymzswhkqkziocas): comanda só serviço e comanda serviço+produto fecharam
  via POST /checkout/close, com baixa de estoque, comando_pagamentos,
  caixa_movimentos e idempotencyKey todos confirmados via dashboard/finance
  read model. anon/publishable key confirmada bloqueada (401) na RPC checkout_close.
- Frontend patch executado em 2026-07-03 (era o "próximo gate" em aberto):
  endpoint GET /api/catalog novo (clientes, serviços, produtos, profissionais,
  formas_pagamento); frontend reescrito sem cálculo local, com dropdown de
  produto pra testar comanda serviço+produto; PWA (manifest.json,
  service-worker.js, icon.svg) publicada em
  https://hudson-f-lima.github.io/HopeOs-v1/.
- Conectividade celular → backend depende de um túnel Cloudflare Quick Tunnel
  (`cloudflared tunnel --url http://localhost:3333`) rodando neste PC, porque
  GitHub Pages é HTTPS e o backend local é HTTP (bloqueio de conteúdo misto
  no navegador do celular). A URL do túnel é efêmera — muda toda vez que o
  processo reinicia. CORS do backend foi ampliado pra aceitar qualquer origem
  de rede local (192.168.x.x/10.x.x.x/172.16-31.x.x), além do domínio do
  GitHub Pages, pra suportar teste tanto por Wi-Fi local quanto pelo túnel.
- Fluxo completo (GitHub Pages → túnel → backend → Supabase) validado
  manualmente num celular real em 2026-07-03.
- Relatório detalhado desta expansão em docs/RELATORIO_EXECUTIVO_2026-07-03.md.

## Tarefa pendente
1. Decidir se o túnel Cloudflare efêmero é aceitável pro teste de quinta
   (PC precisa ficar ligado o dia todo) ou se vale migrar pra algo mais
   permanente antes disso.
2. Decidir se limpa as ~10 comandas de teste técnico já fechadas no Supabase
   real antes do barbeiro rodar os 5 checkouts de verdade (dashboard hoje
   está com números inflados por teste, não por uso real).

## Gate de expansão
Nada de tabela nova, feature nova, ou Blueprint V4 antes desse checkout real fechar.
Esse checkout real já fechou (ver Estado atual). Frontend patch (era a próxima
expansão discutível) já foi decidido e executado — ver Estado atual. Próxima
expansão real (pacotes, assinaturas, relatórios novos, etc.) seria migration 005+.