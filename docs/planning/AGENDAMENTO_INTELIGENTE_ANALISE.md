# Disponibilidade e agendamento inteligente — análise da proposta (2026-11-16)

Proposta do Platform Owner: múltiplos serviços no mesmo atendimento, grade pelo tempo total, encaixes ideais, combinação de profissionais, fracionamento com limite de espera e reserva atômica. Este documento é a auditoria pedida na seção 1 da proposta. Nada foi implementado.

## 1. O que existe hoje
| Item da proposta | Situação real | Classe | Migration? |
|---|---|---|---|
| Cadastro de serviços, preço e duração | `servicos` (`valor_centavos`, `duracao_min`) | REAL | Não |
| Duração e preço por profissional | `profissionais.overrides[servicoId]` (`duracao_min`, `valor_centavos`); `resolveDuracaoMin` no `SlotEngine`, `precoDe` no link público e nas séries | REAL | Não |
| Serviço habilitado por profissional | `profissional_servicos` | REAL | Não |
| Combos | Não há estrutura de componentes. "Corte + barba" é um serviço comum da categoria Combo (preset do onboarding). Por isso não há cobrança nem reserva em duplicidade, mas o sistema não sabe que o combo contém corte e barba | PARCIAL | Só se o combo precisar conhecer os componentes |
| Disponibilidade padrão ao cadastrar profissional | A escala nasce **não publicada**: o profissional não aparece para agendar até alguém publicar em Conta → Escalas | PARCIAL | Não |
| Escalas, exceções, bloqueios, horário da unidade | `DisponibilidadeEngine` + migrations 013 e 015; fonte única (`repo.empresaComDisponibilidade`) | REAL | Não |
| Geração de horários | `SlotEngine.computeSlots`: grade de `empresas.slot_padrao` (30 min) a partir do início de cada período livre, mais as duas bordas do período | REAL, mas com **regra diferente** da proposta | Não |
| "Só encaixes ideais" | Mostra só os horários-âncora (colados no início ou no fim do espaço livre) com menor desperdício; "Ver todos" mostra a grade | REAL | Não |
| Tempo adicional | `empresas.buffer_min` (higienização) entra no cálculo e no banco | REAL | Não |
| Recursos (cadeira, sala, equipamento) | Não existe | AUSENTE | Sim |
| Prevenção de conflito | `agendamento_criar` (trava por profissional e dia, conflito conferido no banco) | REAL para **um** horário | — |
| Vários serviços no mesmo atendimento | Não existe: um agendamento = um serviço e um profissional. As colunas `agendamentos.grupo_id` e `grupo_seq` existem desde a 001 e nunca foram usadas | AUSENTE (com o encaixe pronto para o vínculo) | Vínculo: não. Reserva atômica: **sim** |
| Reserva atômica de várias etapas | Não existe. Chamar `agendamento_criar` várias vezes não é atômico (uma etapa pode gravar e a seguinte falhar) | AUSENTE | **Sim** (função nova) |
| Combinação de profissionais e fracionamento | Não existe. O mais próximo é o "sem preferência" do link público (um serviço) | AUSENTE | Não para calcular |
| Limite de espera por unidade | Não existe | AUSENTE | Sim (uma coluna) ou valor fixo |
| Cancelar ou alterar informando as etapas | Existe para séries (C4), não para etapas de um atendimento | AUSENTE | Não |

## 2. Conflitos com o que existe
1. **Grade.** Hoje: passo fixo de 30 min. Proposta: passo igual à duração total do atendimento, mais o horário que termina no fim do período. Exemplo 09h–12h com 60 min: hoje "ver todos" mostra 09:00, 09:30, 10:00, 10:30, 11:00; a proposta mostra 09:00, 10:00, 11:00. A proposta reduz buracos; o custo é esconder horários que hoje a recepção pode escolher.
2. **Encaixe forçado.** A recepção pode encaixar em horário ocupado (`agenda:encaixar`). Um atendimento de várias etapas com encaixe forçado em uma delas complica a regra de "tudo ou nada". Proposta de regra: atendimento com várias etapas nunca encaixa à força.
3. **Link do cliente e série recorrente.** Os dois trabalham com um serviço por vez. A proposta não diz se o cliente também monta vários serviços.

## 3. Plano em ondas
| Onda | Entrega | Migration | Aceite |
|---|---|---|---|
| **1. Motor e consulta** | Motor puro de atendimento: duração e preço totais por profissional; grade pelo tempo total com o horário de fim alinhado; busca de combinações (tudo com o escolhido; serviço fixado + outros profissionais em sequência; fracionado com limite de espera); ordenação por espera e tempo total. Rota somente leitura que devolve as opções | Não | Cenários 1 a 8 da proposta como testes do motor |
| **2. Gravar e operar** | Função no banco que reserva todas as etapas ou nenhuma, ligando-as por `grupo_id`; limite de espera por unidade; card do agendamento com adicionar e remover serviços, total, início e término; cancelar e alterar mostrando as etapas afetadas; checkout já com todos os serviços | **Sim (019)** | Cenários 9 e 10; teste de concorrência com duas reservas simultâneas |
| **3. Extensões** | Vários serviços no link do cliente; combo que conhece os componentes; recursos (cadeira, sala) | Sim | A definir |

## 4. Decisões do Platform Owner
1. **Migration 019** (função de reserva atômica + limite de espera). A D-038 cobre só a C5 e a Onda A da assinatura.
2. **Grade:** a regra nova substitui a atual para todos os agendamentos, ou vale só para "encaixes ideais" e mantém "ver todos" com a grade de 30 min? Recomendado: regra nova nos encaixes ideais; "ver todos" continua como está.
3. **Limite de espera padrão** no fracionamento. Sugestão: 30 minutos, ajustável por unidade.
4. **Combo:** continua sendo um serviço único (recomendado, já não duplica) ou passa a conhecer os componentes (Onda 3)?
5. **Ordem:** esta proposta antes ou depois da C5 (push).
