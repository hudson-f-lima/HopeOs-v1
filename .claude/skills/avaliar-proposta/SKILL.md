---
name: avaliar-proposta
description: Avaliar uma proposta externa (prompt de outra IA, spec, "master prompt", documento colado) contra o HOPE OS real — o que já existe, o que contradiz decisões, o que exige migration/autorização, riscos e plano em ondas. Use sempre que o usuário colar um prompt/spec e pedir para "analisar", "aproveitar", "corrigir o software com base nisso" ou "ver a possibilidade".
---

# Avaliar proposta externa — HOPE OS / KortexOS

Propostas externas chegam escritas para um sistema que não é este (outra stack, schema do zero, nomes em inglês). O trabalho é traduzir para o que existe, não reescrever o que existe.

## 1. Ler antes de opinar
1. `docs/PROJECT_STATE.md` (está no ar? há P0? o que está bloqueado?), `docs/DECISIONS.md`, ADRs citadas.
2. Para cada afirmação da proposta, procure no código (`grep` em `backend/src`, `supabase/migrations`, `js/`). Nunca classifique sem olhar.

## 2. Dicionário proposta → HOPE OS
| Termo comum nas propostas | Aqui |
|---|---|
| tenant / `tenant_id` | `empresas` / `empresa_id` (só de `req.auth`) |
| appointments | `agendamentos` (+ `agendamento_criar`, `SlotEngine`) |
| professionals / services / customers | `profissionais` / `servicos` / `clientes` |
| `professional_services` com custom price/duration/commission | `profissional_servicos` (vínculo) + `profissionais.overrides[servicoId]` |
| `GROSS_SPLIT` / `NET_SPLIT_SHARED` / colaborador assume taxa | `modelo_comissao`: `bruto_salao` / `dividido` / `bruto_staff` (`CommissionEngine`) |
| POS / comanda / close | `/checkout/preview` (não grava) e `/checkout/close` → `checkout_close_autoria` |
| no-show counter | `clientes.faltas`, `RetentionService` |
| roles/RBAC | `empresa_memberships.role` (ADR-005) — não confundir com "cargo" do profissional |
| RLS por tenant | Não é o controle principal: backend `service_role` + deny-all (007) |
| exclusion constraint `tstzrange` | Rejeitada (D-007): quebra o encaixe forçado; usar `agendamento_criar` |

## 3. Classificar cada item
Tabela com: item | situação real (arquivo/função) | `REAL`/`PARCIAL`/`AUSENTE`/`CONTRADITÓRIO` | precisa de migration? | depende de fornecedor externo?

## 4. Perguntas de Red Team obrigatórias
- Grava dado fictício no ledger financeiro (imutável)? → exigir preview/sandbox.
- Promete efeito jurídico/fiscal (salão-parceiro, nota, LGPD)? → marcar DESCONHECIDO até contador/jurídico.
- Cobra o cliente final (sinal, taxa, overtime)? → gateway, CDC, idempotência de webhook, reversão.
- Token "stateless" para ação financeira? → JWT puro não é de uso único; exigir registro no banco.
- Números de negócio (percentuais, minutos, metas) são dados ou opinião? → presets editáveis + métrica.
- Troca de stack/reescrita? → rejeitar salvo decisão explícita.

## 5. Entregar
- Documento em `docs/planning/<NOME>_ANALISE.md` (SQL só como `DRAFT ONLY`), indexado em `docs/INDEX.md`.
- Plano em ondas: **0 = o que bloqueia produção hoje**, depois sem migration, depois com migration (pedir autorização), por fim fornecedores externos. Cada onda com critério de aceite verificável.
- Lista curta de decisões do Platform Owner. Não implementar feature nova nem migration 008+ sem essa decisão.
