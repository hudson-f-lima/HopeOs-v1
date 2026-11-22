# Cadastros: profundidade vertical — HOPE OS × mercado (2026-11-22)

## Origem e escopo
- Pedido do Platform Owner: "aprender mais a respeito dos cadastros e da profundidade vertical deles" e pesquisar "funções para serem aprimoradas de forma inteligente", antes de trocar a senha do AppBarber.
- "Profundidade vertical" aqui = o que cada cadastro carrega **abaixo** dos dados básicos, em cinco camadas:
  1. perfil;
  2. regras operacionais;
  3. relações com outros cadastros;
  4. histórico;
  5. inteligência derivada.
- Classes: REAL, PARCIAL, AUSENTE, DESCONHECIDO.
- Fontes:
  - **schema e código do HOPE OS** (migrations 001–027, rotas, PWA);
  - **AppBarber**: leitura com login de 2026-11-16, só assinaturas e pacotes, e a ficha pública da App Store;
  - **Fresha**: central de ajuda pública.
- **Nenhum cadastro do AppBarber foi lido ainda** (clientes, profissionais, serviços, produtos). Tudo sobre eles abaixo é DESCONHECIDO até a leitura (§5).

## 1. Veredito
- **Cliente é o cadastro mais raso e o de maior retorno.** Tem 5 campos e nenhuma tela que junte o que o sistema já sabe sobre a pessoa. Os dados para uma ficha rica **já existem**, espalhados em agendamentos, comandas, assinaturas, lista de espera e eventos.
- **Profissional e serviço já são profundos** em regras: herança de comissão, ajustes por profissional, vínculos, escala, permissões, regras do link. Faltam perfil (foto, cor, bio) e tempo de pausa no serviço.
- **Produto é o mais completo** dos quatro.
- **Ação de maior impacto, sem migration:** **Ficha do cliente**, só leitura, montada a partir do que já está gravado (§4, item 1).

## 2. O que existe hoje (schema real)
| Cadastro | Camada 1 — perfil | 2 — regras | 3 — relações | 4 — histórico | 5 — inteligência |
|---|---|---|---|---|---|
| **Cliente** | `nome`, `whatsapp`, `observacoes`, `ativo`, `faltas` (contador antigo) | Régua de faltas (salão), limites do link | Agendamentos, comandas, assinaturas, lista de espera | Existe nos dados, **sem tela que junte** | Confiabilidade (D-049), inativos (`RetentionService`), **sem ficha** |
| **Profissional** | `nome`, `whatsapp`, `cargo_id` | `modelo_comissao`, `horario`, escala semanal e exceções, aceite da escala (023), permissões individuais (012) | Vínculos `profissional_servicos`, ajustes `overrides[servico]` (preço/duração/comissão), planos de assinatura | Trilha de escala, comissões pagas | Metas e ranking (011), desempenho |
| **Serviço** | `nome`, `categoria`/`categoria_id`, `valor`, `duracao`, `slot_min` | `comissao_pct`, `modelo_heranca` (008), `antecedencia_min_online`, `cancelamento_prazo_min` (024) | Profissionais aptos, itens de plano | Vendas na comanda | Margem (`DESEMPENHO_MARGEM_ANALISE.md`) |
| **Produto** | `nome`, `sku`, `codigo_barras`, `categoria` | `custo`, `preco_venda`, `estoque_minimo`, `controla_estoque`, comissão | Itens de plano, comanda | Movimentos de estoque com autor | Estoque baixo |

Evidência da lacuna principal:
- Não há `GET /clientes/:id/...` de histórico nem tela de ficha (`grep` em `backend/src` e `js/`).
- A única leitura por cliente é a lista `GET /clientes`. O profissional não recebe contato nem observações de clientes que não são dele (`routes/index.js:457`, D-032).

## 3. Mercado (o que é público)
| Recurso | Fresha (central de ajuda) | AppBarber | HOPE OS |
|---|---|---|---|
| Notas internas no cliente (fórmula de cor, preferências) | REAL: várias notas, invisíveis ao cliente | DESCONHECIDO | PARCIAL: um campo de texto livre `observacoes` |
| **Alerta para a equipe** (aparece no perfil e no horário) | REAL | DESCONHECIDO | AUSENTE |
| Alergia / teste de mecha com validade (6 meses), exigido por serviço | REAL | DESCONHECIDO | AUSENTE |
| Formulário de consulta/anamnese que atualiza o perfil | REAL | DESCONHECIDO | AUSENTE |
| Programa de fidelidade, pesquisa de satisfação | — | REAL na ficha da App Store (sem detalhe de campos) | AUSENTE |
| Pacotes e assinaturas com dias e profissionais permitidos | — | REAL (leitura de 16/11) | REAL (021/022) |

Fontes públicas:
- [Fresha — notas no perfil](https://www.fresha.com/help-center/knowledge-base/clients/56-add-notes-to-client-profiles)
- [Fresha — alertas para a equipe](https://www.fresha.com/help-center/knowledge-base/clients/54-add-staff-alerts-to-client-profiles)
- [Fresha — teste de mecha](https://www.fresha.com/help-center/knowledge-base/clients/55-record-client-patch-tests)
- [Fresha — alergia](https://www.fresha.com/help-center/knowledge-base/clients/53-record-an-allergy)
- [Fresha — formulários](https://www.fresha.com/help-center/knowledge-base/clients/607-client-forms-overview)
- [AppBarber PRO na App Store](https://apps.apple.com/app/id1602535418)

## 4. Funções para aprimorar (ordem de retorno ÷ custo)
| # | Função | Por que é "inteligente" | Migration? | Risco / condição |
|---|---|---|---|---|
| 1 | **Ficha do cliente (só leitura)**: últimas visitas, próximo horário, total gasto, ticket médio, frequência e **ciclo médio de retorno**, serviço e profissional mais frequentes, faltas e cancelamentos tardios (a confiabilidade que já existe), assinatura ativa e usos, pedidos na espera | Tudo derivado do que já está gravado, sem digitar nada. Responde "quem é este cliente" antes do atendimento | **Não** | RBAC: profissional só vê o que é dele e sem contato (D-032); valores só com `painel:financeiro` |
| 2 | **"Volta prevista"**: no ciclo médio de retorno, o cliente entra numa lista para a recepção avisar (lembrete assistido, mesmo fluxo dos lembretes) | Recupera receita sem custo de envio | Não (derivado) | Sem envio automático; só sugere |
| 3 | **Alerta para a equipe** no cliente: alergia, cuidado, preferência. Aparece no card da agenda e na comanda | Evita erro no atendimento | **Sim** (campo estruturado) | Alergia é **dado de saúde = dado sensível (LGPD art. 11)**: base legal e aviso de privacidade antes (jurídico) |
| 4 | Aniversário, e-mail, "como conheceu", consentimento para mensagens | Campanha de aniversário, origem dos clientes | Sim | Consentimento separado para marketing (LGPD); campo opcional |
| 5 | **Tempo de pausa no serviço** (química): o profissional atende outro no intervalo | Mais atendimentos no mesmo dia | Sim (já previsto na D-054) | Recurso físico (cadeira/lavatório) ainda não modelado |
| 6 | Perfil do profissional: foto, cor na agenda, bio no link público | Agenda mais legível, link mais vendedor | Sim | Foto = armazenamento (custo) |
| 7 | Ficha técnica por atendimento (fórmula, máquina, produto usado) | Repetir o resultado na próxima visita | Sim | Pode conter dado de saúde: mesmo cuidado do item 3 |

**Recomendação:** fazer o item 1 já, pela skill `completar-lacuna`: motor puro, rota com RBAC, gate com controle negativo, tela, E2E. Os itens 3, 4 e 7 esperam a leitura do AppBarber (§5) e a decisão sobre LGPD. O item 2 vem logo depois do 1, porque usa o mesmo cálculo.

## 5. Leitura dos cadastros do AppBarber (próximo passo)
- **Objetivo:** descobrir campos, abas e regras de cada cadastro para comparar camada por camada e não copiar no escuro.
- **Telas a ler** (só leitura, sem salvar nada): **Cliente**, com todas as abas (dados, histórico, ficha/anamnese, fidelidade, créditos/pacotes); **Profissional**, com todas as abas (comissão, serviços, horários, acesso); **Serviço** (todos os campos); **Produto**; **Configurações de agenda e de cadastro**.
- **Método sem expor senha (recomendado):** capturas de tela de cada aba, uma por formulário, sem dados de cliente visíveis ou com eles cortados. Nada de senha passa pela conversa.
- **Alternativa:** leitura com login, como em 16/11. A senha precisa ser trocada logo depois, e a troca está adiada justamente por isso.

## 6. Decisões do Platform Owner
1. Implementar agora a **Ficha do cliente (item 1, sem migration)**?
2. Leitura do AppBarber por **capturas de tela** (recomendado) ou por login?
3. Antes dos itens 3, 4 e 7: consultar jurídico sobre dado de saúde (alergia, anamnese) no cadastro?
