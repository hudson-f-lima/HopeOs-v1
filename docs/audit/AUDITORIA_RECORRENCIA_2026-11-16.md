# Auditoria — "recorrência não aparece na agenda" (2026-11-16)

Caso: recorrência semanal, 4 ocorrências, Artur Galindo / Design de sobrancelha / Eduardo, 17/11/2026 às 17h.
Esperado: 17/11, 24/11, 01/12 e 08/12 às 17h. O card (captura das 07:11) não mostrava série nem ações da série.

Método: consulta **somente leitura** em produção (Supabase `gsttjozcmdvgstcpadiq`), leitura do código publicado e testes sintéticos. Nada foi criado, alterado, aplicado ou publicado em produção.

## 1. O que está PROVADO (leitura em produção)

| Fato | Evidência | Classe |
|---|---|---|
| A série **nunca foi criada** | `agendamento_series` sem linha para esse cliente; nenhum `agendamentos.serie_id` preenchido para ele | REAL |
| Existe **um único** horário (17/11 17h), criado pelo caminho de agendamento simples | `agendamento_eventos`: 1 evento `criado` com `origem: agenda`, sem `serie_id` | REAL |
| Não houve conflito, folga ou fora-de-escala que explicasse datas puladas | não há tentativa de série para pular datas | REAL |
| O backend e a PWA publicados já continham a recorrência (C4) | rota `/agenda/series` publicada; `index.html` com `agRepetirBox` | REAL |

Conclusão: **o que o card mostrava estava correto para o dado gravado.** Não há série escondida: ela não existe. O agendamento foi gravado como horário avulso.

## 2. Causa — o que é comprovado e o que é hipótese

**Comprovado (defeitos reais, reproduzidos por teste):**

1. **Service worker servia JavaScript do cache primeiro.** Depois de um deploy, a primeira abertura trazia o HTML novo com os módulos `.js` antigos (sem o "Repetir"). Reproduzido no teste SW1 sobre o código anterior. `service-worker.js`.
2. **Falha de carga da agenda era engolida**: `loadWeekAgenda` fazia `.catch(() => [])`; um dia que falhou parecia dia sem horários. `js/state.js`.
3. **Criação da série não era tudo-ou-nada**: série gravada antes das ocorrências; criar e vincular em duas chamadas; erro que não fosse conflito deixava horários criados sem vínculo e série "ativa" pela metade. `backend/src/routes/series.js`.
4. **Sem proteção contra repetição** (duplo toque / retry): duas séries iguais.
5. **Resposta e GET não diziam a situação de cada data**; o card de horário da série não tinha aviso clicável nem lista das datas.

**Hipótese (NÃO provada):** o aparelho do dono rodava JavaScript antigo logo após o deploy das 08:44Z (defeito 1) e por isso não viu "Repetir". Alternativa igualmente compatível com as evidências: "Repetir" estava visível e não foi selecionado. Produção não registra o que a tela mostrou. **Pergunta ao dono:** o modal de novo agendamento tinha o campo "Repetir"? A resposta fecha a dúvida.

## 3. Situação de cada data (produção)

| Data | Situação |
|---|---|
| 17/11/2026 17h | criada — horário **avulso** (sem série) |
| 24/11, 01/12, 08/12 | **nunca criadas** (a série não existe) |

Nada foi recriado: a série do cliente não foi tocada.

## 4. Correções (branch `ccr-9854814d-ialzxj`, sem deploy)

- **`service-worker.js`**: HTML/JS/CSS "rede primeiro" (cache só se a rede falhar); versão nova avisa as páginas abertas; cache `…-v1-38-0-recorrencia-cache`.
- **`js/app.js`**: aviso "O app foi atualizado…" ao instalar versão nova.
- **`js/state.js` + `js/ui/agenda.js`**: falha ao carregar dias da agenda vira aviso visível.
- **`backend/src/routes/series.js`**:
  - criação tudo-ou-nada: falha de vínculo (3 tentativas) ou erro inesperado desfaz os horários já criados (cancela, com motivo na trilha) e encerra a série → `SERIE_FALHOU` com quantos foram desfeitos;
  - conflito real entre prévia e gravação continua sendo pulado (nada é encaixado);
  - nenhuma data livre → `SERIE_SEM_HORARIOS`; série nunca fica "ativa e vazia";
  - repetição do mesmo pedido → `SERIE_DUPLICADA` (409) com o id da série existente; trava por cliente/profissional/dia/horário na instância;
  - a resposta devolve `datas` (cada data: criada / conflito / fora da escala, com motivo) e `resumo`; os pulados ficam registrados no evento da 1ª ocorrência;
  - `GET /agenda/series/:id` devolve as datas previstas com a situação (agendada, concluída, cancelada, remarcada, **não criada + motivo**) e `resumo.faltando`.
- **`js/ui/series.js` + `index.html`**: banner da criação com datas criadas e de fora (com motivo); no card, aviso "🔁 Série recorrente (Nª) — ver datas" para qualquer horário vinculado, abrindo a lista; "Cancelar/Alterar na série" só em horário ativo e conforme permissão (`agenda:cancelar`, `agenda:editar`).

Não feito (decisão separada): **reposição automática** de ocorrências futuras (manter sempre N à frente). "4 ocorrências" continua significando 4 datas no momento da criação.

## 5. Limite conhecido (não corrigido, exige autorização)

A trava contra criação simultânea vale **por instância** do backend. Entre instâncias quem protege é o conflito de horário no banco (o mesmo horário nunca é gravado duas vezes), mas o "tudo ou nada" continua feito pela aplicação (criar + vincular + desfazer), não por transação. A solução completa é uma RPC atômica (migration 021+), que **precisa de autorização do Platform Owner** (regra do projeto). Proposta a escrever só se autorizada.

## 6. Testes (dados sintéticos, Node 22)

- `series-gate` 17/17 (S09–S16 novos: resposta por data, GET com datas, falha de vínculo, erro no meio, repetição, concorrência, corrida total, permissões; + S01–S08 e NC1).
- `service-worker-gate` 6/6 (SW1 reproduz o defeito do cache no código antigo).
- E2E `series`: criar série → abrir card → aviso da série → "ver datas" (4 agendadas, a aberta marcada) → alterar → cancelar; profissional não vê "Repetir".
- Suíte offline completa: verde. E2E completo e SQL: ver resultado no PR.
- **Não testado** (sem como simular aqui): cache real de navegador entre dois deploys num aparelho físico.

## 7. Implantação e reversão

Implantação: merge do PR (autorização do dono). Sem migration, sem SQL. PWA: GitHub Pages; backend: Render. Na primeira abertura depois do deploy, o service worker novo assume e o aviso "app atualizado" aparece; fechar e abrir de novo.
Reversão: reverter o commit do PR (sem dados a desfazer). Séries já criadas continuam válidas.

## 8. Riscos

- Tudo-ou-nada por aplicação (seção 5).
- Aparelhos presos num service worker antigo só pegam a correção na próxima atualização do SW (o navegador verifica ao abrir).
- Reposição automática não existe: série de 4 acaba em 4.
