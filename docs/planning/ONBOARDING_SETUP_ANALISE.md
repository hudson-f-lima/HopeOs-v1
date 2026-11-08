# Análise — proposta "Onboarding Progressivo em 6 Fases + Master Prompt" (2026-11-08)

Origem: prompt externo colado pelo Platform Owner. Este documento compara a proposta com o código real e diz o que vale aproveitar, o que contradiz decisões já tomadas e o que exige autorização. **Não é decisão aprovada.** SQL aqui é `DRAFT ONLY`.

## 1. Veredito
- **Aproveitar:** a esteira de onboarding (ordem das fases, presets por nicho, retomada do ponto onde parou, "simulação" final). Ataca um problema real: gestor diante de telas vazias.
- **Rejeitar:** reescrita para Next.js/TypeScript, RLS por `tenant_id` como controle principal, exclusion constraint `tstzrange` na agenda. Contradizem a stack e decisões já implementadas e testadas (ver §3).
- **Adiar com decisão de negócio:** gateway Pix/split de recebíveis, sinal de 50%, overtime +20%, WhatsApp Cloud API, teto de crédito de coworking. Cada um é um projeto com custo, risco jurídico ou fornecedor externo.
- **Pré-requisito que a proposta ignora:** o sistema não está no ar. Migrations 006/007 pendentes no banco `hopeos-v1`, banco pausado por inatividade e backend no Render suspenso. Onboarding de um produto que ninguém consegue abrir não gera valor. **Prioridade 1 continua sendo colocar o que existe em produção.**

## 2. Matriz proposta × código atual
| Item da proposta | Situação no HOPE OS | Classificação | Precisa de migration? |
|---|---|---|---|
| 3 modelos de split (`GROSS_SPLIT`, `NET_SPLIT_SHARED`, `PRO_ASSUMES_ALL`) | `CommissionEngine`: `bruto_salao`, `dividido`, `bruto_staff` (= colaborador assume a taxa, máquina do salão) | REAL (3 de 4 variantes) | Não |
| `PRO_ASSUMES_ALL` com máquina própria + teto de crédito | Não existe: dinheiro sempre entra pelo salão | AUSENTE | Sim (dívida do parceiro, limite) |
| Override por profissional (tempo, preço, comissão) | `profissionais.overrides[servicoId]` + RPC `profissional_servico_override_set`; usado no checkout, nos slots e no `POST /agenda` | REAL | Não |
| Herança `BY_ROLE` / `BY_CATEGORY` / `FIXED_SERVICE` | Só comissão fixa por serviço (`servicos.comissao_pct`) + override; `servicos.categoria` é texto livre; não há cargo | PARCIAL | Sim (cargo, comissão por categoria) |
| Horário semanal da casa e do profissional | `empresas.horario_por_dia`, `profissionais.horario`, almoço; usado pelo `SlotEngine` | REAL | Não |
| Buffer de higienização | Não existe | AUSENTE | Sim (ou campo em `empresas`) |
| Overtime +20% com aceite | Não existe | AUSENTE | Sim + gateway |
| Double-booking | `agendamento_criar` com advisory lock (migration 007), teste de concorrência com controle negativo | REAL (após aplicar a 007) | Não |
| Contador de faltas e risco | `clientes.faltas` + `RetentionService` (no-shows 365d) | PARCIAL | Não para a régua; sim para sinal |
| Régua 1ª isenta / 2ª alerta / 3ª sinal 50% | Não existe | AUSENTE | Régua: não; sinal: gateway |
| Datas especiais com sinal compulsório | Não existe | AUSENTE | Sim + gateway |
| CNPJ, razão social, Lei do Salão-Parceiro | `empresas` sem CNPJ; sem segregação de cota-parte | AUSENTE | Sim |
| Convite da equipe | Gestão → Equipe com convite por e-mail (Supabase Auth) | REAL | Não |
| Convite por WhatsApp | `waLink` (wa.me) já existe no front | PARCIAL | Não (link wa.me); Cloud API = fornecedor |
| Estado de onboarding retomável | Não existe | AUSENTE | Sim (1 coluna ou tabela) |
| Presets de cardápio por nicho | Não existe | AUSENTE | Não (dados versionados no código) |
| "Simulação de voo" com fechamento de caixa | `/checkout/preview` calcula split sem gravar | PARCIAL | Não (ver risco §4) |
| Deep link JWT de 15 min | Não existe | AUSENTE | Ver §4 |
| RLS em 100% das tabelas | RLS deny-all + revogação de `anon`/`authenticated` (007); backend é o único caminho | REAL (modelo diferente, ver §3) | Não |

## 3. Onde a proposta contradiz decisões já tomadas
1. **Stack Next.js/TS/Server Actions.** A stack canônica é Express + Supabase + PWA (`CLAUDE.md`). Reescrever um sistema com 179 testes verdes e financeiro auditado não resolve dor de cliente e reabre todos os riscos já fechados. Rejeitado.
2. **Exclusion constraint `tstzrange` contra double-booking.** Já foi avaliada e descartada (D-007): bloquearia o encaixe forçado (`permitirConflito`), que é recurso real do salão. A trava por advisory lock fecha a corrida e foi provada com duas sessões simultâneas.
3. **RLS por `tenant_id` como defesa principal.** Só faz sentido se o frontend falar direto com o banco. Aqui o backend é a fonte de verdade (regra inviolável), usa `service_role` e resolve tenant por membership (ADR-005). RLS por tenant viraria uma segunda implementação da mesma regra, com risco de divergência. Mantido o deny-all.
4. **Herança só por cargo/categoria.** O modelo atual (comissão do serviço + override do profissional) já resolve o caso "Robson: 45 min, R$ 70, 60%". Cargo/categoria entram como **camada a mais** na ordem de resolução, não como substituição.

## 4. Pontos cegos e riscos da proposta
- **Simulação de voo no ledger real.** Criar comanda fictícia, "fechar caixa" e gerar split grava no ledger financeiro, que é imutável por desenho: polui relatórios e a contabilidade da cota-parte. A simulação tem de usar `/checkout/preview` (calcula sem gravar) ou um tenant de demonstração, nunca a empresa real. CRÍTICO se feito como descrito.
- **Lei do Salão-Parceiro (Lei 13.352/2016).** O software pode separar cota-parte, mas o enquadramento depende de contrato de parceria homologado e de orientação contábil. A tela não pode prometer "blindagem jurídica". DESCONHECIDO até validação com contador.
- **Overtime +20% e sinal de 50%.** Cobrança antecipada exige preço informado antes (CDC) e um gateway com custo por transação. Sem gateway, nada disso é executável. O número "+20%" é opinião, não dado.
- **Deep link JWT "sem onerar o banco".** JWT puro não é de uso único nem revogável: um link de sinal/aprovação pode ser reutilizado durante os 15 min. Pagamento e aceite precisam de registro no banco (idempotência), o que a própria proposta pede na seção de webhooks. PARCIAL: JWT serve para leitura, não para ação financeira.
- **"8 a 15 minutos" e presets (Barbeiro 50%, Manicure 60%...).** Hipóteses, não fatos. Presets devem ser editáveis e o tempo de onboarding, medido.
- **WhatsApp Cloud API.** Exige conta Business verificada, templates aprovados e custo por conversa. O `wa.me` resolve o convite hoje, sem custo.

## 5. Plano recomendado (uma prioridade por vez)
| Onda | Conteúdo | Migration | Critério de aceite |
|---|---|---|---|
| **0 — Produção** (bloqueante) | Reativar o banco `hopeos-v1`, aplicar 006/007, reativar o Render, criar o primeiro admin | 006/007 (autorizadas) | `RUNBOOK_MIGRATION_007.md` passo 4 todo `true`; login de admin em produção |
| **A — Onboarding sem schema novo** | Assistente que reaproveita o que existe: dados da empresa, horários e almoço, formas de pagamento com taxa, cardápio por preset de nicho (barbearia, salão feminino, estética), equipe + overrides, convite por e-mail/wa.me, simulação via `/checkout/preview` | Nenhuma | Gestor novo sai do zero até a 1ª simulação de checkout sem tela vazia; E2E Playwright do fluxo; tempo medido |
| **B — Herança e configuração** | Estado de onboarding retomável, CNPJ/salão-parceiro, buffer de higienização, cargos com comissão e modelo padrão, comissão por categoria, régua de faltas (alerta, sem cobrança) | 008 (precisa de autorização) | Ordem de resolução override → serviço fixo → categoria → cargo coberta por testes; buffer respeitado no `SlotEngine` e no `agendamento_criar` |
| **C — Dinheiro externo** | Gateway Pix + webhooks idempotentes, sinal (régua/datas especiais), overtime pago, máquina própria + teto de crédito | 009+ e fornecedor | Decisão de fornecedor e custo; webhook duplicado não gera 2 lançamentos; reversão testada |

## 6. Rascunho de schema da Onda B — DRAFT ONLY (não executar)
```sql
-- DRAFT ONLY — migration 008 não autorizada.
alter table empresas add column cnpj text, add column razao_social text,
  add column salao_parceiro boolean not null default false,
  add column buffer_min int not null default 0 check (buffer_min in (0,5,10,15)),
  add column onboarding jsonb not null default '{"fase":1,"concluidas":[]}'::jsonb;
create table cargos (id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null, comissao_pct numeric(5,2) not null,
  modelo_comissao text not null check (modelo_comissao in ('bruto_salao','dividido','bruto_staff')),
  unique (empresa_id, nome));
alter table profissionais add column cargo_id uuid references cargos(id);
create table servico_categorias (id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null, comissao_pct numeric(5,2), unique (empresa_id, nome));
alter table servicos add column categoria_id uuid references servico_categorias(id),
  add column modelo_heranca text not null default 'FIXED_SERVICE'
    check (modelo_heranca in ('FIXED_SERVICE','BY_CATEGORY','BY_ROLE'));
```
Ordem de resolução proposta (compatível com o que existe): override do profissional → `FIXED_SERVICE` (`servicos.comissao_pct`) | `BY_CATEGORY` | `BY_ROLE`.

## 7. Decisões que dependem do Platform Owner
1. Confirmar que a Onda 0 vem antes de qualquer item desta proposta.
2. Autorizar a Onda A como feature (exceção ao bloqueio de "novas features", como D-006).
3. Autorizar ou não a migration 008 da Onda B.
4. Escolher o gateway (Asaas, Pagar.me, Stripe) antes de qualquer item da Onda C, e validar com o contador o uso da Lei do Salão-Parceiro.
