# Disponibilidade e escalas: auditoria e desenho (2026-11-15)

**Estado:** **Onda 1 implementada** (D-033, 2026-11-15; migration 013 autorizada com "Todas as recomendações aprovadas"). Ondas 2 a 4 (lote, modelos, importação/exportação, visual semana × profissional) pendentes. A migration aplica em produção só no merge.

**Pedido:** "PROMPT MASTER — Controle de disponibilidade e escalas" (Platform Owner, 2026-11-15). O roteiro em [`ROADMAP_SUBSTITUIR_APPBARBER.md`](ROADMAP_SUBSTITUIR_APPBARBER.md) já previa bloqueio de horário e feriados como item 2. Este desenho o substitui e amplia.

---

## 1. Auditoria: o que existe hoje (fatos do código)

### 1.1 Onde mora a disponibilidade
| Dado | Onde | Formato | Classificação |
|---|---|---|---|
| Horário da empresa | `empresas.horario_por_dia` (jsonb, migration 001) | um período por dia da semana: `{ seg: { ativo, inicio, fim } }` | REAL, limitado |
| Almoço | `empresas.intervalo_almoco`, `almoco_inicio`, `almoco_fim` | **um** intervalo para todos os dias e todos os profissionais | REAL, limitado |
| Grade de horários | `empresas.slot_padrao` | minutos | REAL |
| Higienização entre atendimentos | `empresas.buffer_min` (008) | 0, 5, 10 ou 15 | REAL |
| Horário do profissional | `profissionais.horario` (jsonb, 001) | mesmo formato da empresa, um período por dia | Coluna existe; **nenhuma tela edita** (PARCIAL) |
| Serviços que o profissional faz | `profissional_servicos` | por profissional, sem unidade | REAL |
| Unidades | `unidades` + `membership_units` (007) | servem só para limitar o acesso de pessoas | Sem horário próprio; agendamentos não têm unidade |

### 1.2 Cálculo de horários
- **Motor:** `backend/src/engines/SlotEngine.js`, funções puras.
  - `resolveJanela` faz a interseção entre o horário do profissional e o da empresa.
  - `computeSlots` desconta atendimentos (com o tempo de higienização) e o almoço, e só oferece horário em que o serviço inteiro cabe.
- **Quem usa:**
  - `GET /agenda/slots`, que sugere horários à recepção;
  - o agendamento online (`publicBooking.js`), que **revalida** o horário no servidor ao gravar;
  - os indicadores de ocupação (`insights/occupancy.js`).
- **Conflito entre atendimentos:** é garantido no banco pela RPC `agendamento_criar` (007/008), atômica. É a proteção contra duas reservas simultâneas.
- **Agendamento pela equipe** (`POST /agenda`): **não confere o expediente**. Confere só o conflito com outro atendimento; o encaixe sobre conflito exige `agenda:encaixar`. A recepção consegue agendar fora do horário de funcionamento sem aviso do servidor.

### 1.3 Respostas da verificação obrigatória no cadastro do profissional
1. **Ao cadastrar um profissional, é criada uma disponibilidade padrão?** Não. A coluna `horario` nasce vazia (`{}`).
2. **É automática ou manual?** Nenhuma das duas: não existe tela para preencher.
3. **De onde vem?** Do horário da empresa: profissional sem horário próprio **herda** o horário da empresa, inteiro (`resolveJanela`).
4. **O profissional fica disponível logo após o cadastro?** **Sim**, se a empresa tiver horário configurado (o assistente de configuração o preenche). Sem horário da empresa nem do profissional, o motor recusa (nenhum horário oferecido).
5. **Onde fica e como entra no cálculo?** Nos jsonb citados, lidos a cada pedido pelo `SlotEngine`.
6. **Intervalos, folgas, vários períodos, exceções por data?**
   - Há só **um** período por dia e **um** almoço global.
   - Folga existe apenas como dia da semana desligado.
   - Não há exceção por data: nem feriado, nem abertura excepcional, nem férias, nem bloqueio.
7. **E se o horário da empresa mudar?** Todo profissional sem horário próprio muda junto, na hora (herança). Quem tivesse horário próprio ficaria com a interseção dos dois.
8. **Efeito das mudanças propostas:** ver a seção 5. A recomendação preserva o comportamento atual dos profissionais existentes.

### 1.4 Lacunas e riscos atuais
- **Disponibilidade padrão do profissional:** **não há uma de verdade**. O que existe é a herança do horário da empresa, e o prompt pede que o profissional sem escala publicada fique indisponível.
- **Duas fontes parciais** (jsonb da empresa e do profissional) sem tela para uma delas, e o almoço fora das duas.
- **Agendamento pela equipe não respeita o expediente.**
- **Sem trilha** de quem alterou o horário.
- **Sem exceções por data:** é o que o cenário obrigatório exige (domingo excepcional).
- **Funcionamento offline:** a PWA não grava agendamento offline (o service worker não guarda nada de `/api/`). Não há sincronização a tratar. **Fato.**

---

## 2. Reaproveitamento
- **`SlotEngine`:** continua sendo o motor. Muda só a **entrada**: a janela do dia passa a vir das regras novas, com vários períodos, em vez de um período fixo.
- **RPC `agendamento_criar`:** continua sendo a garantia contra reserva simultânea.
- **Revalidação do agendamento online:** permanece.
- **Permissões finas e individuais** (D-032, 012): as novas permissões entram no mesmo catálogo, na mesma matriz e com a mesma trilha.
- **`agenda:encaixar`:** passa a cobrir também "agendar fora da disponibilidade", como ação consciente e registrada.
- **Trilha imutável:** o gatilho `ledger_imutavel` (009), usado na 012.
- **Testes:** o padrão de gate com controle negativo e o E2E sob a CSP.

---

## 3. Fonte de verdade e precedência

**Uma só fonte depois da 013:** as tabelas de regras e exceções.
- Os jsonb antigos (`horario_por_dia`, `profissionais.horario`, almoço) são **convertidos** em regras na migration e passam a ser somente leitura.
- Saem do código numa etapa seguinte.
- O assistente de configuração passa a gravar nas tabelas novas.

**Precedência para uma data D** (do mais forte para o mais fraco):

| # | Regra | Efeito |
|---|---|---|
| 1 | Fechamento integral da unidade em D | Ninguém atende |
| 2 | Horário excepcional da unidade em D (abertura ou alteração) | **Substitui** o semanal da unidade só em D |
| 3 | Semanal da unidade (vários períodos por dia) | Base |
| 4 | Ausência do profissional (folga, férias, falta) cobrindo D | Profissional indisponível |
| 5 | Horário excepcional do profissional em D | **Substitui** o semanal dele só em D |
| 6 | Semanal **publicado** do profissional | Base; **sem escala publicada, indisponível** |
| 7 | Fechamentos parciais e bloqueios (unidade e profissional) | Retiram trechos |
| 8 | Atendimentos existentes + tempo de higienização | Retiram trechos |
| 9 | Serviço habilitado para o profissional e duração completa cabendo | Filtra |

**Como o efeito se calcula:**
- **Disponibilidade efetiva** = (janela da unidade em D ∩ escala do profissional em D) − bloqueios − atendimentos, com o serviço cabendo inteiro.
- **Abertura excepcional da unidade não libera profissionais.** No domingo excepcional, só atende quem tiver horário excepcional próprio nesse dia, porque o semanal de domingo dele está vazio (regra 5 ou 6).
- **Na dúvida, o horário não é oferecido:** sem regra, regra inválida ou conflito não resolvido.
- **No servidor:**
  - `GET /agenda/slots` e o agendamento online usam o mesmo cálculo;
  - `POST /agenda` e a remarcação passam a recusar horário fora da disponibilidade, a menos que quem pede tenha `agenda:encaixar` e marque "forçar". Isso fica registrado.

---

## 4. Modelo de dados — DRAFT da migration 013 (não aplicar sem autorização)

| Tabela | Para quê | Colunas principais |
|---|---|---|
| `disponibilidade_semanal` | Regras recorrentes da unidade (`profissional_id` nulo) ou do profissional | `empresa_id`, `unidade_id`, `profissional_id` nulo, `dia_semana` 0–6, `inicio`, `fim`, `a_cada_semanas` (1 = toda semana; 2 = escala alternada), `semana_ancora`, `vigente_de`, `vigente_ate`. Vários períodos = várias linhas; intervalo = espaço entre períodos |
| `disponibilidade_excecoes` | Abertura, fechamento, horário excepcional, ausência, bloqueio | `empresa_id`, `unidade_id`, `profissional_id` nulo, `tipo` (`abertura`, `fechamento`, `horario`, `ausencia`, `bloqueio`), `data_inicio`, `data_fim`, `inicio`/`fim` nulos = dia inteiro, `motivo`, `created_by` |
| `profissional_escala_status` | Publicação da escala | `profissional_id`, `unidade_id`, `publicada_em`, `publicada_por` |
| `escala_modelos` | Modelos reutilizáveis | `nome`, `conteudo` jsonb (períodos por dia), `arquivado_em`. Aplicar copia as regras; mudar o modelo não altera o que já foi aplicado |
| `disponibilidade_eventos` | Trilha imutável | quem, quando, escopo, `antes`/`depois` jsonb, decisão sobre agendamentos afetados |

Mais:
- RLS que nega tudo para anon e authenticated;
- funções `security definer` para gravar em lote numa transação só;
- rollback e `gate_013.sql` com controles negativos.

---

## 5. Estratégia para dados existentes
- **Unidade:** o `horario_por_dia` vira as regras semanais da unidade principal, e o almoço vira intervalo, ou seja, dois períodos.
- **Profissionais existentes:** recebem como escala **publicada** a cópia do horário que vale hoje para eles. Se tiverem horário próprio, ficam com a interseção; senão, com o da empresa. **Ninguém ganha nem perde horário no dia da migração.**
- **Profissionais novos (após a 013):** nascem **sem escala publicada**, portanto indisponíveis, com aviso na tela ("configure e publique a escala"). Para dar pouco trabalho, "Usar horário da unidade" preenche a escala em um toque.
- **Agendamentos existentes:** nenhum é alterado. Os que ficarem fora de uma nova regra aparecem como **conflito a tratar**, nunca são cancelados ou movidos sozinhos.
- **Agendamentos não têm unidade hoje.** O salão tem uma unidade só (o dono confirmou que não usa várias), então todos são da unidade principal. A coluna `unidade_id` em agendamentos fica para quando houver várias unidades.

---

## 6. Permissões (proposta, mesmo catálogo da D-032)
| Código | Proprietário | Gerente | Recepção | Profissional | Nível |
|---|---|---|---|---|---|
| `escala:ver` (escala e disponibilidade) | Sim | Sim | Sim | Só a própria | operação |
| `escala:bloquear` (bloqueio e ausência pontual) | Sim | Sim | Sim | Só a própria* | operação |
| `escala:editar` (escala semanal e horário excepcional de profissionais) | Sim | Sim | — | — | sensível |
| `unidade:horario` (abrir e fechar a unidade, horário e exceções) | Sim | Sim | — | — | sensível |
| `escala:lote` (alterar vários de uma vez e aplicar modelo) | Sim | Sim | — | — | sensível |
| `escala:modelos` (criar, editar, arquivar modelos) | Sim | Sim | — | — | sensível |
| `escala:importar` (importar e publicar) | Sim | Sim | — | — | sensível |
| `escala:exportar` | Sim | Sim | Sim | — | operação |
| `escala:conflitos` (decidir sobre agendamentos afetados) | Sim | Sim | Sim | — | operação |

\* **Decisão do dono:** o profissional bloqueia o próprio horário? O app Barber tem um parâmetro para proibir isso. Recomendação: **sim**, mas só bloqueio. Se o bloqueio cobrir agendamento, vira conflito para a recepção ou a gestão tratar.

As regras de concessão da D-032 continuam valendo: autoridade, revogação e o que pode ser concedido ao profissional (a agenda de todos inclui `escala:ver` de todos).

---

## 7. Importação e exportação
- **CSV primeiro, sem dependência nova.** Colunas:
  - `unidade`, `profissional` (nome ou e-mail), `data` ou `dia_semana`;
  - `inicio`, `fim`, `intervalo_inicio`, `intervalo_fim`;
  - `tipo` (`escala`, `abertura`, `fechamento`, `ausencia`, `bloqueio`), `motivo`.
- **Antes de gravar:** prévia linha a linha (erros, sobreposições), modo explícito (acrescentar, atualizar ou substituir o período) e confirmação de quem tem `escala:importar`. Há um arquivo-modelo para baixar.
- **XLSX:** só com dependência. Candidata `exceljs` (licença MIT, mantida). Fica para depois, justificada só se o CSV não bastar, porque o Excel abre e salva CSV.
- **Exportação:** CSV primeiro. ICS e PDF são evoluções.

---

## 8. Conflitos com agendamentos
- Toda alteração (individual, em lote, importação ou modelo) calcula **antes de gravar** os agendamentos que ficariam fora da disponibilidade: profissional, cliente, data e horário.
- **Para salvar**, quem tem `escala:conflitos` escolhe, para cada um:
  - manter como exceção registrada;
  - remarcar ou cancelar pelos fluxos que já existem, com motivo.
- Nada é cancelado ou movido sozinho. A decisão vai para `disponibilidade_eventos`.

---

## 9. Ondas de entrega
| Onda | Escopo | Critério de aceite |
|---|---|---|
| **1. Essencial** | Migration 013 + conversão dos dados; motor com precedência e vários períodos; exceções da unidade e do profissional (abertura, fechamento integral e parcial, horário excepcional, ausência, bloqueio); escala publicada; servidor recusando fora da disponibilidade (exceto encaixe forçado); permissões e trilha; conflitos com prévia; telas simples por unidade e por profissional, com a origem de cada regra | **Cenário obrigatório do domingo (seção 10) passando em gate e E2E** |
| 2. Lote e modelos | Seleção de vários, grupo ou unidade; prévia; modelos com duplicar e arquivar | Aplicar "Equipe de sábado" a 3 pessoas com prévia e conflitos |
| 3. Importar e exportar | CSV com prévia e arquivo-modelo; exportação CSV | Arquivo com erros mostra a linha e não grava nada |
| 4. Visual | Semana × profissional no tablet e no computador, cores de aberto, fechado, folga e bloqueio | Prints em 390, 820 e 1280 px |

---

## 10. Cenário obrigatório: como será verificado (Onda 1)
**Configuração:** a unidade fecha aos domingos; abertura excepcional no domingo D, das 08h às 16h. Horários excepcionais em D:
- Eduardo, 08h às 12h;
- A, 09h às 15h;
- B, 10h às 12h e 13h às 16h.

| # | Verificação | Como |
|---|---|---|
| 1 | A unidade abre só em D | Horários em D; nenhum em D−7 e D+7 |
| 2 | Os outros domingos seguem a regra | Controle negativo em D+7 |
| 3 | Só os selecionados atendem | C (sem exceção em D): nenhum horário |
| 4 | Intervalo de B | Nenhum horário de B começa entre 12h e 13h, nem atravessa |
| 5 | Serviço que passa do fim | Serviço de 60 min: Eduardo até 11:00, A até 14:00, B até 15:00 |
| 6 | Bloqueios e agendamentos | Bloqueio de A às 10h e agendamento de B às 14h tiram os horários |
| 7 | Sem permissão | Recepção e profissional não abrem a unidade (403); controle negativo com gerente |
| 8 | Conflitos | Encurtar Eduardo para 08–10h com agendamento às 11h mostra o conflito e não grava sem decisão |
| 9 | Existentes e novos | Profissional antigo mantém a escala convertida; profissional novo fica indisponível até publicar |

**Instruções de configuração (Onda 1):**
1. Conta → Horários da unidade → "Exceção" → domingo D → Abrir 08:00–16:00.
2. Para cada profissional, em Agenda → Escala → data D, informe o horário excepcional.
3. Revise a prévia e salve.

---

## 11. Decisões do dono
1. **Autorizar a migration 013** com este desenho (seção 4), depois do merge do PR #28.
2. **O profissional pode bloquear o próprio horário?** Recomendação: sim, só bloqueio.
3. **A equipe pode agendar fora da disponibilidade?** Recomendação: só quem tem `agenda:encaixar`, marcando "forçar", com registro.
4. **Profissionais existentes mantêm o horário atual convertido em escala publicada?** Recomendação: sim. Os novos nascem indisponíveis.

## 12. Riscos e premissas
- **Premissa: uma unidade.** Confirmado pelo dono (não usa várias). O modelo já tem `unidade_id`, para não refazer.
- **Dados atuais de produção desconhecidos:** não foi consultado quantos profissionais têm horário próprio (executar SQL exige autorização). A conversão trata os dois casos.
- **Mudança de comportamento:** a recepção hoje agenda fora do expediente sem aviso e passará a precisar de "forçar". Isso pode atrapalhar no primeiro dia; mitigação: mensagem clara e o botão de forçar para quem tem encaixe.
- **Corrida entre mudança de escala e reserva:** o agendamento online revalida no servidor, mas a escala pode mudar entre a revalidação e a gravação (milissegundos). Aceitável: o efeito é um agendamento que vira conflito listado, sem perda de dado.
- **Tamanho:** a Onda 1 é a maior entrega desde a 009. Lote, modelos e importação ficam nas ondas seguintes para não atrasar o essencial.
