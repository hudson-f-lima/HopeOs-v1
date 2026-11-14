# Matriz de permissões

> Gerado de `backend/src/auth/permissoes.js` por `node backend/scripts/gerar-matriz-permissoes.js --escrever`. Não editar à mão: o `permissoes-gate` reprova se este arquivo divergir do código (D-032).

## Como funciona
- Cada papel tem o **mínimo necessário** abaixo. "Só o próprio" = só os agendamentos, comandas e números do próprio profissional.
- **Permissão individual** só acrescenta: dá a permissão por inteiro a uma pessoa, sem tirar nada do papel dela.
- **Quem concede:** o proprietário e o gerente, só para papéis abaixo do seu e nunca para si; só o que eles mesmos têm por inteiro; permissões de administração, só o proprietário. Revogar segue a mesma regra.
- Cada concessão e revogação fica registrada com quem fez, para quem e quando. Revogada, a permissão deixa de valer na próxima ação (o servidor relê o vínculo a cada pedido).
- O servidor decide tudo; a tela só mostra o que o servidor permite (`/api/auth/me` devolve as permissões efetivas).
- Equipe, convites, papéis e integrações (`/api/admin`) continuam só do proprietário e não são concedíveis.

## Matriz

### Agenda

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Ver a agenda | `agenda:ver` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente |
| Criar agendamento | `agenda:criar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente |
| Encaixar (agendar em horário já ocupado) | `agenda:encaixar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente |
| Remarcar e mudar a duração | `agenda:editar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente |
| Confirmar, registrar chegada, atender, concluir e marcar falta | `agenda:atender` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente |
| Cancelar agendamento | `agenda:cancelar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente |

### Lista de espera

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Ver a lista de espera | `espera:ver` | Sim | Sim | Sim | — | Proprietário ou gerente |
| Incluir e atualizar na lista de espera | `espera:gerir` | Sim | Sim | Sim | — | Proprietário ou gerente |

### Comanda

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Simular e fechar comanda | `comanda:fechar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente |
| Ver comandas fechadas e seus estornos | `comanda:historico` | Sim | Sim | — | — | Proprietário ou gerente |
| Estornar comanda | `comanda:estornar` | Sim | Sim | — | — | Proprietário ou gerente |

### Caixa

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Conferir o caixa do dia | `caixa:conferir` | Sim | Sim | Sim | — | Proprietário ou gerente |
| Fechar o caixa do dia | `caixa:fechar` | Sim | Sim | Sim | — | Proprietário ou gerente |
| Lançar sangria e suprimento | `caixa:movimentar` | Sim | Sim | Sim | — | Proprietário ou gerente |

### Clientes

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Ver clientes | `clientes:ver` | Sim | Sim | Sim | Sim | Proprietário ou gerente |
| Cadastrar e editar clientes | `clientes:editar` | Sim | Sim | Sim | — | Proprietário ou gerente |

### Cadastros

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Ver serviços, produtos, profissionais e formas de pagamento | `cadastros:ver` | Sim | Sim | Sim | Sim | Proprietário ou gerente |
| Criar e editar serviços, produtos e profissionais | `catalogo:editar` | Sim | Sim | — | — | Proprietário ou gerente |
| Criar e editar formas de pagamento e taxas | `pagamentos:editar` | Sim | Sim | — | — | Proprietário ou gerente |
| Ajustar estoque | `estoque:ajustar` | Sim | Sim | — | — | Proprietário ou gerente |

### Painel

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Painel da operação (pendências, ocupação, clientes) | `painel:operacional` | Sim | Sim | Sim | — | Proprietário ou gerente |
| Painel financeiro, margem e indicadores de agenda e clientes | `painel:financeiro` | Sim | Sim | — | — | Proprietário ou gerente |

### Ganhos e metas

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Ver ganhos e comissões | `ganhos:ver` | Sim | Sim | — | Só o próprio | Proprietário ou gerente |
| Pagar e estornar comissão | `comissoes:pagar` | Sim | Sim | — | — | Proprietário ou gerente |
| Ver metas e a meta do salão | `metas:ver` | Sim | Sim | — | Só o próprio | Proprietário ou gerente |
| Definir metas | `metas:definir` | Sim | Sim | — | — | Proprietário ou gerente |
| Ver o ranking | `ranking:ver` | Sim | Sim | — | Só o próprio | Proprietário ou gerente |
| Ver indicadores de desempenho | `desempenho:ver` | Sim | Sim | — | Só o próprio | Proprietário ou gerente |

### Administração

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede |
|---|---|---|---|---|---|---|
| Dados da empresa e assistente de configuração | `empresa:configurar` | Sim | Sim | — | — | Só o proprietário |
| Conceder e revogar permissões individuais | `equipe:permissoes` | Sim | Sim | — | — | Só o proprietário |

## Pacote "Recepção"

Atalho na tela de Equipe para dar a um profissional tudo o que a recepção tem por padrão e ele não tem por inteiro:

- `agenda:ver` — Ver a agenda
- `agenda:criar` — Criar agendamento
- `agenda:encaixar` — Encaixar (agendar em horário já ocupado)
- `agenda:editar` — Remarcar e mudar a duração
- `agenda:atender` — Confirmar, registrar chegada, atender, concluir e marcar falta
- `agenda:cancelar` — Cancelar agendamento
- `espera:ver` — Ver a lista de espera
- `espera:gerir` — Incluir e atualizar na lista de espera
- `comanda:fechar` — Simular e fechar comanda
- `caixa:conferir` — Conferir o caixa do dia
- `caixa:fechar` — Fechar o caixa do dia
- `caixa:movimentar` — Lançar sangria e suprimento
- `clientes:editar` — Cadastrar e editar clientes
- `painel:operacional` — Painel da operação (pendências, ocupação, clientes)

O profissional mantém ganhos, metas e desempenho só dele.

## Integrações e token legado

Continuam pela ação ampla de origem de cada permissão (ex.: `agenda:criar` → `agenda:write`), sem mudança nas credenciais existentes.
