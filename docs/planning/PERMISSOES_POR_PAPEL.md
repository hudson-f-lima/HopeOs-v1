# Permissões por papel e acessos extras — desenho (2026-11-14)

**Estado:** desenho. Nada implementado. SQL abaixo é DRAFT ONLY: a migration 012 não está autorizada.

## 1. Pedido
O Platform Owner quer que um **profissional possa ter acesso de recepção**, concedido por gestor ou proprietário, e que as permissões de cada papel fiquem definidas em detalhe ("microabilidades").

## 2. Estado atual (fatos)
- Cada pessoa tem **um papel por empresa**, no vínculo `empresa_memberships.role`: `admin` (proprietário), `gestor`, `recepcao`, `profissional`. Não há campo para acesso extra.
- A tabela `cargos` (migration 008) é do **profissional** e serve à comissão (ex.: cabeleireiro, manicure). **Não é permissão.** Para não confundir, este documento fala em "papel" para acesso e "cargo" só para comissão.
- O backend decide tudo (`backend/src/auth/rbac.js`): 18 ações, cada uma com os papéis que podem e, para o profissional, o escopo "próprio" (só os próprios agendamentos, comandas e números).
- Auditoria de quem mudou acesso: existe só para integrações (`integration_audit_events`). Para pessoas, não.

## 3. Microabilidades
Cada linha é uma coisa que alguém faz no app. A coluna "ação no backend" é onde a regra já vive hoje.

| Grupo | Microabilidade | Ação no backend |
|---|---|---|
| Agenda | Ver a própria agenda | `agenda:read` (próprio) |
| Agenda | Ver a agenda de todos | `agenda:read` |
| Agenda | Marcar, confirmar, marcar chegada, concluir | `agenda:write` |
| Agenda | Cancelar e remarcar | `agenda:write` |
| Agenda | Lista de espera | `lista_espera:read` / `lista_espera:write` |
| Comanda | Fechar a própria comanda | `checkout:write` (próprio) |
| Comanda | Fechar comanda de qualquer profissional | `checkout:write` |
| Comanda | Estornar comanda | `checkout:estornar` |
| Caixa | Conferir e fechar o caixa do dia; sangria e suprimento | `caixa:operar` |
| Clientes | Ver clientes | `clientes:read` |
| Clientes | Cadastrar e editar clientes | `clientes:write` |
| Cadastros | Ver serviços, produtos, profissionais, formas de pagamento | `cadastros:read` |
| Cadastros | Criar e editar cadastros, preços e taxas | `cadastros:write` |
| Estoque | Ajustar estoque | `estoque:write` |
| Painel | Painel da operação (pendências do dia, ocupação) | `relatorios:operacional` |
| Painel | Painel financeiro e indicadores de clientes | `relatorios:full` |
| Ganhos | Ver os próprios ganhos | `relatorios:proprio` (próprio) |
| Ganhos | Ver ganhos de qualquer profissional; pagar comissão | `relatorios:proprio` / `comissoes:pagar` |
| Metas | Ver as próprias metas e o ranking liberado | `metas:read` / `ranking:read` (próprio) |
| Metas | Definir metas | `metas:write` |
| Desempenho | Ver o próprio desempenho | `desempenho:read` (próprio) |
| Desempenho | Ver o desempenho da equipe | `desempenho:read` |
| Equipe | Convidar pessoas e mudar papéis | `admin` |
| Empresa | Configurar a empresa, integrações | `admin` |

## 4. Padrão por papel (como está hoje)

| Microabilidade | Proprietário | Gerente | Recepção | Profissional |
|---|---|---|---|---|
| Agenda de todos, marcar, cancelar | Sim | Sim | Sim | Só a própria |
| Lista de espera | Sim | Sim | Sim | Não |
| Fechar comanda | Qualquer | Qualquer | Qualquer | Só a própria |
| Estornar comanda | Sim | Sim | Não | Não |
| Caixa do dia | Sim | Sim | Sim | Não |
| Editar clientes | Sim | Sim | Sim | Não |
| Editar cadastros, preços, estoque | Sim | Sim | Não | Não |
| Painel da operação | Sim | Sim | Sim | Não |
| Painel financeiro e indicadores | Sim | Sim | Não | Não |
| Ganhos, metas, desempenho | Todos | Todos | Não | Só os próprios |
| Pagar comissão, definir metas | Sim | Sim | Não | Não |
| Equipe e configurações | Sim | Não | Não | Não |

## 5. Proposta: acessos extras em pacotes
Em vez de 24 caixas de marcar por pessoa, **pacotes** com nome, concedidos a um profissional por proprietário ou gerente. Menos combinações inválidas (ex.: caixa sem comanda), menos erro e menos esforço para quem concede.

| Pacote | O que acrescenta ao profissional |
|---|---|
| **Recepção** | Agenda de todos (marcar, confirmar, cancelar, remarcar para qualquer profissional), lista de espera, fechar comanda de qualquer profissional, caixa do dia, cadastrar e editar clientes, painel da operação |

**Continua igual para ele:** os próprios ganhos, metas e desempenho ("Meu mês").

**Nunca entra em pacote** (só muda trocando o papel para gerente): estornar comanda, pagar comissão, definir metas, ver ganhos e desempenho de colegas, painel financeiro, editar cadastros e preços, estoque, equipe e configurações.

**Quem concede:** proprietário e gerente, em Conta → Equipe ("Pode atuar na recepção"). O gerente não concede nada além do pacote. Toda concessão e retirada fica registrada com quem fez e quando.

**Como o backend decide:** a ação é permitida se o papel permite **ou** se um pacote da pessoa permite; quando é o pacote que permite, o escopo deixa de ser "próprio" só nas ações do pacote. O `/me` passa a devolver as permissões efetivas, e a tela mostra e esconde a partir delas, nunca a partir de suposição.

## 6. Onde guardar: alternativas

| Opção | Como | Avaliação |
|---|---|---|
| **A. Migration 012 (recomendada)** | Coluna de acessos extras no vínculo, limitada aos pacotes conhecidos, mais uma tabela de eventos de concessão (imutável) | Fonte única da verdade no banco, auditável, testável no gate SQL. **Exige sua autorização** e aplica em produção no merge |
| B. Trocar o papel para recepção | Sem mudança técnica | Funciona hoje, mas a pessoa perde "Meu mês" (ganhos, metas e desempenho próprios). Não recomendo |
| C. Guardar nos dados do login (Supabase Auth) | Sem migration | Divide a regra de acesso entre dois lugares e não deixa trilha consultável. Não recomendo para permissão |

**DRAFT ONLY — migration 012 (não aplicar sem autorização):**
```sql
alter table empresa_memberships
  add column acessos_extras text[] not null default '{}'
    check (acessos_extras <@ array['recepcao']::text[]);

create table membership_acesso_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  membership_id uuid not null references empresa_memberships(id) on delete cascade,
  actor_id uuid not null references app_users(id),
  de text[] not null,
  para text[] not null,
  created_at timestamptz not null default now()
);
-- + RLS deny-all e revogação para anon/authenticated (padrão da 007),
-- + gatilho que impede UPDATE/DELETE em membership_acesso_eventos,
-- + rollback 012_down.sql, gate_012.sql com controle negativo e linha no migrations.lock.
```

## 7. Implementação e critérios de aceite (após autorização)
1. Migration 012 com gate SQL (pacote desconhecido recusado; evento imutável; deny-all).
2. `rbac.js`: decisão por papel **ou** pacote; teste com controle negativo — profissional sem pacote recebe 403 na agenda de colega; com pacote, recebe 200; com pacote, continua recebendo 403 em estorno, pagar comissão, painel financeiro e desempenho da equipe.
3. Rota para conceder e retirar, só proprietário e gerente, com evento gravado.
4. `/me` com permissões efetivas; a tela usa isso para a barra inferior e as abas.
5. Tela em Conta → Equipe e E2E: conceder, entrar como o profissional, ver a agenda de todos e a Comanda de qualquer um, continuar sem estorno.
6. Red Team da mudança antes do merge (é mudança de autorização).

## 8. Decisões do dono
1. **Autoriza a migration 012** (opção A)?
2. Só o pacote **Recepção**, ou também um pacote **Caixa** separado (só caixa do dia, sem agenda de todos)?
3. O **gerente** pode conceder o pacote, ou só o proprietário?
