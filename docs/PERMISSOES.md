# Matriz de permissões

> Gerado de `backend/src/auth/permissoes.js` por `node backend/scripts/gerar-matriz-permissoes.js --escrever`. Não editar à mão: o `permissoes-gate` reprova se este arquivo divergir do código (D-032).

## Como funciona
- Cada papel tem o **mínimo necessário** abaixo. "Só o próprio" = só os agendamentos, comandas e números do próprio profissional.
- **Permissão individual** só acrescenta: dá a permissão por inteiro a uma pessoa, sem tirar nada do papel dela.
- **Quem concede:** o proprietário e o gerente, só para papéis abaixo do seu e nunca para si, e só o que eles mesmos têm por inteiro. Permissões **sensíveis** (dinheiro ou dado pessoal de colega ou de cliente) e de **administração**, só o proprietário. Revogar segue a mesma regra.
- **Profissional:** só recebe o que não mexe em valores financeiros críticos — a **agenda de todos** e **fechar comanda de qualquer profissional**. Caixa, estorno, comissão, preços, estoque, painel financeiro, contato de clientes e números de colegas nunca são concedidos ao profissional.
- **Agenda:** as ações (agendar, encaixar, remarcar, atender, cancelar) seguem a visão da agenda: com a agenda própria valem só nos próprios horários; com a agenda de todos, para qualquer profissional. Não se concedem sozinhas.
- **Clientes:** todos veem o nome e cadastram cliente novo; WhatsApp e observações só quem tem `clientes:contato`. Lembretes por WhatsApp só com `agenda:lembretes`; o profissional vê os próprios horários a confirmar, sem contato.
- **Mudar o papel ou desativar** a pessoa tira as permissões individuais, com registro na trilha.
- Cada concessão e revogação fica registrada com quem fez, para quem e quando. Revogada, a permissão deixa de valer na próxima ação (o servidor relê o vínculo a cada pedido).
- O servidor decide tudo; a tela só mostra o que o servidor permite (`/api/me` devolve as permissões efetivas).
- Equipe, convites, papéis e integrações (`/api/admin`) continuam só do proprietário e não são concedíveis.

## Matriz

### Agenda

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Ver a agenda | `agenda:ver` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente | Sim |
| Criar agendamento | `agenda:criar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente | Segue `agenda:ver` |
| Encaixar (agendar em horário já ocupado) | `agenda:encaixar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente | Segue `agenda:ver` |
| Remarcar e mudar a duração | `agenda:editar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente | Segue `agenda:ver` |
| Confirmar, registrar chegada, atender, concluir e marcar falta | `agenda:atender` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente | Segue `agenda:ver` |
| Cancelar agendamento | `agenda:cancelar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente | Segue `agenda:ver` |
| Lembretes de confirmação por WhatsApp | `agenda:lembretes` | Sim | Sim | Sim | — | Proprietário ou gerente | Não |

### Lista de espera

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Ver a lista de espera | `espera:ver` | Sim | Sim | Sim | — | Proprietário ou gerente | Não |
| Incluir e atualizar na lista de espera | `espera:gerir` | Sim | Sim | Sim | — | Proprietário ou gerente | Não |

### Comanda

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Simular e fechar comanda | `comanda:fechar` | Sim | Sim | Sim | Só o próprio | Proprietário ou gerente | Sim |
| Ver comandas fechadas e seus estornos | `comanda:historico` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |
| Estornar comanda | `comanda:estornar` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |

### Caixa

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Conferir o caixa do dia | `caixa:conferir` | Sim | Sim | Sim | — | Só o proprietário (sensível) | Não |
| Fechar o caixa do dia | `caixa:fechar` | Sim | Sim | Sim | — | Só o proprietário (sensível) | Não |
| Lançar sangria e suprimento | `caixa:movimentar` | Sim | Sim | Sim | — | Só o proprietário (sensível) | Não |

### Clientes

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Ver clientes (nome) | `clientes:ver` | Sim | Sim | Sim | Sim | Proprietário ou gerente | Não |
| Ver WhatsApp e observações dos clientes | `clientes:contato` | Sim | Sim | Sim | — | Só o proprietário (sensível) | Não |
| Cadastrar cliente novo | `clientes:criar` | Sim | Sim | Sim | Sim | Proprietário ou gerente | Não |
| Editar clientes já cadastrados | `clientes:editar` | Sim | Sim | Sim | — | Só o proprietário (sensível) | Não |

### Cadastros

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Ver serviços, produtos, profissionais e formas de pagamento | `cadastros:ver` | Sim | Sim | Sim | Sim | Proprietário ou gerente | Não |
| Criar e editar serviços, produtos e profissionais | `catalogo:editar` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |
| Criar e editar formas de pagamento e taxas | `pagamentos:editar` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |
| Ajustar estoque | `estoque:ajustar` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |

### Painel

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Painel da operação (pendências, ocupação, clientes) | `painel:operacional` | Sim | Sim | Sim | — | Proprietário ou gerente | Não |
| Painel financeiro, margem e indicadores de agenda e clientes | `painel:financeiro` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |

### Ganhos e metas

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Ver ganhos e comissões | `ganhos:ver` | Sim | Sim | — | Só o próprio | Só o proprietário (sensível) | Não |
| Pagar e estornar comissão | `comissoes:pagar` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |
| Ver metas e a meta do salão | `metas:ver` | Sim | Sim | — | Só o próprio | Só o proprietário (sensível) | Não |
| Definir metas | `metas:definir` | Sim | Sim | — | — | Só o proprietário (sensível) | Não |
| Ver o ranking | `ranking:ver` | Sim | Sim | — | Só o próprio | Só o proprietário (sensível) | Não |
| Ver indicadores de desempenho | `desempenho:ver` | Sim | Sim | — | Só o próprio | Só o proprietário (sensível) | Não |

### Administração

| Permissão | Código | Proprietário | Gerente | Recepção | Profissional | Quem concede | Concedível ao profissional |
|---|---|---|---|---|---|---|---|
| Dados da empresa e assistente de configuração | `empresa:configurar` | Sim | Sim | — | — | Só o proprietário | Não |
| Conceder e revogar permissões individuais | `equipe:permissoes` | Sim | Sim | — | — | Só o proprietário | Não |

## O que o profissional pode receber

- `agenda:ver` — Agenda de todos (ver, agendar, remarcar e cancelar para qualquer profissional)
- `comanda:fechar` — Fechar comanda de qualquer profissional

Ganhos, metas e desempenho continuam só dele. Para cobrir o caixa, a pessoa precisa do papel Recepção.

## Integrações e token legado

Continuam pela ação ampla de origem de cada permissão (ex.: `agenda:criar` → `agenda:write`), sem mudança nas credenciais existentes.
