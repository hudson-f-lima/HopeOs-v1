# Agenda — cards, etapa 4: plano (2026-11-26)

Origem: teste do Platform Owner no aparelho depois das etapas 2 e 3 (D-077, D-078), em 26/11. O que funcionou: segurar e arrastar troca de profissional e de horário; redimensionar pela borda de baixo funciona dentro do arraste. Pedidos novos estão abaixo. Siga a skill `agenda-cards`.

Classificação: **LIVRE** = só código, sem migration. **DECISÃO** = depende de escolha do dono. **BLOQUEADO** = depende de migration, fornecedor ou V1.5.

## 1. Pedidos do dono e o que cada um exige

| # | Pedido | Fato no código hoje | Classe | Proposta |
|---|---|---|---|---|
| 1 | Passo do arraste de 10 em 10 min ou configurável | `SNAP_MIN = 20` e `GRID_MIN = 20` fixos em `js/ui/agenda.js`. `empresas.slot_padrao` existe, mas é usado pelo Cockpit, não chega à agenda | DECISÃO | Padrão 10 min. A escolha é por aparelho (5/10/15/20/30), guardada no navegador, sem migration. Configuração por salão precisa de coluna nova (028) |
| 2 | O horário do encaixe aparece enquanto arrasta | A prévia no destino já mostra "início–fim · profissional" (D-078). O dedo cobre parte da coluna no celular | LIVRE | Repetir o horário numa etiqueta presa ao card que acompanha o dedo, acima do dedo |
| 3 | O horário aparece ao redimensionar para cima e para baixo | Embaixo existe a dica de duração (`showResizeTooltip`); em cima não há alça | LIVRE | Etiqueta "início–fim (duração)" durante o gesto, nas duas bordas |
| 4 | Topo do card redimensiona, base redimensiona, meio arrasta | A faixa de cima é só visual desde a D-078; só a base redimensiona. Remarcar não aceita duração nova | LIVRE (servidor sem migration) | Alça de cima muda o início e mantém o fim. O servidor passa a aceitar `novaDuracaoMin` na remarcação. A função atômica da 027 já recebe a duração no `jsonb`. Em card menor que 30 min só a base redimensiona, para o meio continuar pegável |
| 5 | Legenda dos ícones ao tocar no card, num campo que abre, como o histórico | O menu do card não explica os ícones | LIVRE | Dobra "Ícones deste card", com o nome e o motivo de cada um, e um link "Ver todos os ícones" |
| 6 | Estrela amarela: plano ativo e pago | Hoje o fundo é âmbar escuro com estrela branca | LIVRE | Fundo amarelo com estrela escura (contraste medido) |
| 7 | Estrela vermelha: inativo ou inadimplente | Já existe (`assinatura_atraso`: atrasada ou suspensa) | LIVRE | Manter. Pausada e cancelada não mostram estrela |
| 8 | Estrela laranja: plano de outra unidade | Não há isolamento por unidade (D-073) | BLOQUEADO até V1.5 | Só registrar |
| 9 | Pago no local: cifrão verde | `pago` já vem do servidor (checkout). Hoje mostra "PAGO" e acinzenta o card inteiro com `filter`, que também apagaria um ícone verde | LIVRE | Ícone "$" verde no lugar do texto "PAGO". O acinzentado passa para o fundo (saturação menor), sem `filter`, para o verde continuar verde |
| 10 | Pago online: escolher o melhor ícone | Não existe pagamento online (sem fornecedor) | BLOQUEADO (fornecedor) | Ícone reservado: cartão com raio, azul. Entra quando houver gateway (`integracao-futura`) |

## 2. Referências pesquisadas (o que aproveitar)
- **Ícones de card com legenda:** Mangomint ("NEW", fita de membro), Timely ("New", cédula para sinal pago), Saloniq (coroa amarela para cliente novo, "£" para sinal pago, "R" para profissional pedido), Slick e MyTime publicam a legenda. Padrão comum: poucos ícones, legenda acessível a um toque.
- **Arraste e redimensionamento:**
  - Componentes de agenda (CoreUI, Bryntum, Kendo) usam passo configurável (5–60 min), prévia ao vivo e Esc para cancelar.
  - Problemas relatados: alça de redimensionar difícil de acertar no toque (o fornecedor aumentou para 30 px); a borda parada "pulando" ao redimensionar a outra; salto do passo quando o card é pego longe do topo.
  - DayPilot separa a zona de mover da zona de redimensionar.
- **Fresha:** documenta o redimensionamento só pela borda de baixo. Não achei documentação do topo nem do passo. **Booksy:** confirma arrastar e soltar; não achei a configuração de passo. Não afirmamos o que eles fazem além disso.

## 3. Decisões de desenho (para não repetir os erros relatados)
- **Zonas do card, em altura de toque:** topo 14 px = início; base 14 px = fim; o resto = mover. Card abaixo de 30 min: só a base redimensiona.
- **Borda parada não se mexe:** redimensionar pelo topo mantém o fim exato; pela base, mantém o início.
- **Passo contado a partir do horário original do card,** não do ponto onde o dedo pegou (evita o "salto" relatado).
- **Etiqueta única de horário:** "09:10–09:40 (30 min)". Mesmo formato na prévia, no arraste e no redimensionamento.
- **Esc cancela** o arraste e o redimensionamento sem gravar (teclado).
- **Pago:** o fundo perde cor e o "$" verde continua com cor. Concluído à mão continua sem "$".

## 4. Outras formas de card de baixo esforço cognitivo (sugestões, por valor/custo)
| Ideia | Ajuda em | Dado existe? | Custo |
|---|---|---|---|
| **Buraco aproveitável:** espaço livre maior que o menor serviço aparece como "+ 40 min livre" tocável, que abre o agendar | Encher a agenda sem procurar | Sim (escala + agendamentos) | Baixo |
| **Visita com vários serviços ligada:** cards do mesmo `grupo_id` com um conector e a mesma borda | Entender que é um cliente só | Sim (`grupo_id`) | Baixo |
| **Card sobreposto lado a lado:** dois atendimentos ao mesmo tempo dividem a largura em vez de um cobrir o outro | Encaixe forçado visível | Sim | Médio |
| **Cliente atrasado:** contorno pulsando leve ou "atrasado 10 min" quando passou do horário sem "chegou" | Ação da recepção | Sim (`atrasoMin` já existe) | Baixo |
| **Zoom da grade:** compacto, normal ou largo (px por minuto) por aparelho | Dia cheio versus detalhe | Sim | Baixo |
| **Agora:** a linha do horário atual destaca o card em andamento | Orientação rápida | Sim | Baixo |
| **Tempo de pausa/processamento** (química) em listras dentro do card | Encaixar outro cliente na pausa | **Não** (campo novo = migration) | — |

## 5. Ordem proposta (cada uma em PR próprio)
1. **4a. Legenda e ícones** (5, 6, 9): dobra no menu do card, estrela amarela, "$" verde, acinzentado sem `filter`. Menor risco e mais visível.
2. **4b. Alças de cima e de baixo, e etiqueta de horário** (2, 3, 4): `novaDuracaoMin` na remarcação, com gate; E2E com as duas bordas e controle negativo.
3. **4c. Passo** (1), depois da decisão do dono. A grade (`GRID_MIN`) acompanha o passo, para o card cair na linha.
4. **4d. Ideias da seção 4**, uma por vez, na ordem: buraco aproveitável, visita ligada, cliente atrasado.
- Bloqueados: estrela laranja (V1.5), pago online (gateway), tempo de pausa (migration).

## 6. Critérios de aceite comuns
- Gate do servidor com controle negativo para cada mudança de regra (ex.: `novaDuracaoMin` fora de 10–480 dá 422; o fim fica fixo ao redimensionar pelo topo).
- E2E 390×844 sob a CSP de produção, claro e escuro, sem resposta ≥ 400 nova por papel.
- Contraste AA medido em cada ícone novo.
- `CACHE_NAME` trocado em cada PR que muda JS ou CSS.
