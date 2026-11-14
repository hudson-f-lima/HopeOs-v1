# Redesign de ponta a ponta — planejamento, specs e viabilidade (2026-11-14)

**Estado:** planejamento. Autorizado pelo Platform Owner ("criar o front-end do que foi projetado no canvas para o aplicativo real"), com o pedido de planejar antes de construir. Nada aqui muda regra de negócio, permissão (RBAC) ou banco: é apresentação e fluxo.

**Referências:** canvas de redesign (quadros Recepção, Gestor, Barbeiro, Comanda, Navegação, Metas, Uma pessoa, Meu mês); D-022 (fase 1), D-030 (navegação), D-031 (tema).

---

## 1. Problema, impacto e diagnóstico

- **Problema:** o app real tem só parte do design aprovado. O dono não achou funções que existiam (metas, desempenho) e não sabia que o modo escuro era automático.
- **Impacto:** função construída e não usada vale zero; cada tela com estilo diferente aumenta o esforço de quem opera o caixa com cliente na frente.
- **Causa raiz (fato):** as funções foram entregues uma a uma (motor, rota, tela, teste) sem uma etapa de arquitetura de informação e sem uma base de componentes. Cada tela nova herdou o estilo do lugar onde foi encaixada.

## 2. Estado atual (medido em 2026-11-14)

| Item | Valor |
|---|---|
| Stack | PWA em HTML, CSS e JS puros (módulos ES), sem build; GitHub Pages + API no Render |
| Política de segurança (CSP) | sem `<script>` e `<style>` inline; atributos `style=` permitidos |
| `index.html` | ~990 linhas, 5 abas e 13 janelas (modais e painéis) |
| `css/app.css` | ~1.050 linhas; zero cores fixas fora dos tokens; só 3 pontos de quebra de largura |
| Tokens antigos (`--md-*`) ainda em uso | 170 usos |
| `style=` inline | 121 no HTML, 73 gerados por JS |
| Maior arquivo | `js/ui/agenda.js`, ~1.260 linhas |
| Testes E2E | 19 roteiros sob a CSP de produção, rodando no CI |
| Já no padrão novo | tokens de cor, Inter, toques de 44 px, modo escuro e seletor, cartão "Agora", Painel curto, atalhos "Mais vendidos", navegação por papel (PR #28) |

**Não medido (DESCONHECIDO):** quantos toques e quanto tempo levam as tarefas principais hoje. É a primeira coisa da Onda 1, para comparar antes e depois.

## 3. Princípios (o que "menos esforço" quer dizer aqui)

1. **Uma ação principal por tela**, em destaque; o resto recolhido ou secundário.
2. **Reconhecer em vez de lembrar:** listas e atalhos à vista (mais vendidos, equipe com progresso) no lugar de campos que exigem digitar.
3. **Padrões sensatos:** a forma de pagamento, o profissional e o mês já vêm escolhidos quando há um valor provável.
4. **Estado preservado:** fechar uma gaveta, trocar de aba ou recarregar não apaga o que foi digitado.
5. **Retorno imediato:** cada toque responde em até ~100 ms (pressão, carregando, feito). Animação curta (150–250 ms) e desligada para quem pede menos movimento.
6. **Nada otimista em dinheiro:** valores e taxas continuam vindo do servidor (regra do projeto). A tela pode ser rápida; o número nunca é inventado.
7. **Acessível como desenhado:** botões reais, rótulos, foco visível, contraste AA, 44 px.

## 4. Viabilidade técnica e decisões

| Pedido | Decisão | Por quê |
|---|---|---|
| Tailwind / Shadcn | **Não.** Tokens CSS + classes de componente próprias | Sem build no projeto (D-021); a CSP proíbe estilos e scripts inline gerados; trocar a base agora é reescrever tudo |
| Framework (React etc.) | **Não** | Mesmo motivo; os 19 E2E protegem a base atual |
| Gaveta (bottom sheet) | **Sim**, componente próprio com `<dialog>` | Nativo, acessível (foco preso, Esc), sem biblioteca |
| Esqueletos de carregamento | **Sim** | Só CSS |
| Atalhos de teclado | **Sim, no computador**, sem atalho global que atrapalhe digitação | Recepção em computador ganha muito |
| Layout de tablet e computador | **Sim: tablet de 768 a 1199 px e computador a partir de 1200 px** | A recepção usa celular, tablet ou computador (dono, 2026-11-14) |
| Seletores modernos (`:has`) | **Sim, com fallback** | Suporte amplo em navegadores atuais; sem eles a tela continua usável |

**Restrições que continuam:** nenhuma migration; nenhuma mudança de permissão; cache do service worker invalidado a cada entrega; GitHub Pages sem cabeçalhos de segurança (risco já aceito).

## 5. Especificação por camada

### 5.1 Tokens (completar)
- Cor: os atuais (claro e escuro) + estados (sucesso, aviso, erro, informação) com contraste AA verificado no próprio teste.
- Espaço: 4, 8, 12, 16, 20, 24, 32. Raio: 10, 12, 14, 16, 20. Elevação: 1 a 3. Movimento: 150 e 250 ms, uma curva.
- Tipografia: Inter; 12, 13, 14, 15, 18, 22, 28; títulos 600–700.
- **Remover os 170 usos de `--md-*`**, mapeando cada um para o token novo.

### 5.2 Componentes base
Botão (principal, secundário, perigo, só ícone), campo e rótulo, seletor por toque (chips), controle segmentado, cartão, linha de lista, barra de progresso, gaveta, toast, estado vazio com ação, esqueleto, barra inferior. Cada um com estados: normal, foco, pressionado, desabilitado, carregando, erro.

### 5.3 Telas e fluxos por papel

| Papel | Tela | Canvas | Mudança principal |
|---|---|---|---|
| Recepção | Comanda | Comanda | Gaveta "Adicionar à comanda": tipo (serviço ou produto), mais vendidos, quantidade com + e −, "quem vendeu" em chips, botão com o total. Fechar a gaveta não perde nada |
| Recepção | Agenda (computador) | Recepção | Grade de profissionais e horários + comanda rápida ao lado, sem trocar de tela |
| Recepção | Agenda (celular) | — | Mantém a grade atual, com os componentes novos |
| Profissional | Hoje | Barbeiro | "Agora" + linha do tempo do dia + horário livre visível |
| Profissional | Meu mês | Meu mês | Cartões: metas, meta do salão, ganhos, desempenho resumido (ver tudo abre o detalhe) |
| Gestão | Painel | Gestor | Celular: atual (curto). Computador: indicadores em colunas |
| Gestão | Metas e uma pessoa | Metas, Uma pessoa | Lista da equipe já feita; detalhe da pessoa no formato do canvas (metas no topo, tabela compacta) e remoção do seletor redundante |
| Todos | Conta | — | As 8 abas de cadastro viram uma lista agrupada (Catálogo, Pagamentos, Clientes, Equipe), com busca |
| Todos | Entrar e assistente | — | Mesmos componentes; sem mudança de fluxo |

### 5.4 Interações
- Toque: pressão visual imediata; item adicionado pisca uma vez.
- Carregamento: esqueleto no lugar da lista; nunca tela em branco.
- Erro: mensagem no lugar onde aconteceu, em português, com o que fazer.
- Teclado (computador): `N` novo agendamento, `C` comanda, `/` buscar, `Esc` fecha. Desligados enquanto se digita.

## 6. Ondas de entrega

Cada onda: um PR, E2E verdes sob a CSP, prints em 390 px, 820 px e 1280 px nos dois temas, sem mudança de backend. Se uma onda precisar de backend, ela para e pede decisão.

| Onda | Escopo | Critério de aceite |
|---|---|---|
| 0 (feito) | Tokens, modo escuro e seletor, "Agora", Painel curto, mais vendidos, navegação por papel | PR #24 a #26 em produção; PR #28 aguarda merge |
| 1 | **Base:** medir toques e etapas das 5 tarefas principais (linha de base), componentes base, fim dos `--md-*`, `style=` repetidos viram classes | Zero `--md-*`; linha de base registrada; nenhuma tela regride nos E2E |
| 2 | **Comanda:** gaveta de adicionar item | Comanda de 3 itens com menos toques que a linha de base; estado preservado ao fechar a gaveta; teste dedicado |
| 3 | **Profissional:** Hoje (linha do tempo) e Meu mês nos cartões do canvas | Fluxo chegou → iniciar → concluir sem sair de Hoje |
| 4 | **Gestão:** detalhe da pessoa no formato do canvas; Painel em colunas no computador | Sem seletor redundante; Painel ≥1200 px em uma tela |
| 5 | **Recepção no tablet e no computador:** grade + comanda lateral + atalhos (atalhos só com teclado) | Agendar e fechar comanda sem trocar de tela, em 768 px e em 1280 px |
| 6 | **Conta:** cadastros agrupados com busca; entrar e assistente nos componentes novos | Achar qualquer cadastro em até 2 toques |

## 7. Medição de sucesso
- **Toques e etapas por tarefa** (agendar, fechar comanda simples, fechar comanda com 3 itens, dividir pagamento, ver desempenho de uma pessoa), contados pelos próprios roteiros E2E antes e depois.
- **Erros mostrados ao usuário** (respostas 4xx na tela) por roteiro: não podem aumentar.
- **Tempo para fechar uma comanda:** cronometrado por você no salão, antes e depois da Onda 2. O app não tem analytics e este plano não propõe rastrear usuários.

## 8. Riscos
- **Regressão em fluxo de dinheiro** (comanda, pagamento dividido, estorno): mitigado porque só a apresentação muda e os E2E de dinheiro rodam em toda entrega.
- **Visual sem teste automático:** os E2E não "veem" a tela; os prints por onda cobrem isso, revistos por mim e por você.
- **Leitor de tela e aparelho real não testados** até hoje: a Onda 1 inclui uma passada com leitor de tela no navegador; aparelho real depende de você.
- **Tamanho:** seis ondas são várias entregas. A ordem acima põe primeiro o que reduz esforço no caixa.

## 9. Decisões do dono
1. ~~Ordem das ondas~~ — **aprovada: 1 → 2 → 3 → 4 → 5 → 6** (2026-11-14).
2. ~~Aparelho da recepção~~ — **celular, tablet ou computador** (2026-11-14): a Onda 5 cobre tablet e computador.
3. O merge do PR #28 antes da Onda 1, para a base partir da navegação nova.
4. Profissional com acesso de recepção: desenho em [`PERMISSOES_POR_PAPEL.md`](PERMISSOES_POR_PAPEL.md); depende da migration 012.
