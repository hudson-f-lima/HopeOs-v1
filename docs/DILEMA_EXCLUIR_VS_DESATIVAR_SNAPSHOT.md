# Snapshot — Excluir vs. Desativar em Cadastros (pesquisa de melhores práticas)

Data: 2026-07-07
Gatilho: usuário notou que nenhum cadastro (Clientes, Serviços, Profissionais, Produtos,
Formas de Pagamento) tem opção "excluir", e um teste manual criou um registro de cliente
vazio (`nome: ""`) direto em produção, sem forma de removê-lo pela API existente na época.

## Pesquisa (fontes)

- [Referential Integrity — erwin](https://bookshelf.erwin.com/bookshelf/public_html/2020R2/Content/References/Data%20Modeling%20Overview/Referential%20Integrity.html)
- [Audit trail — referential integrity on deleted records (Tek-Tips)](https://www.tek-tips.com/threads/audit-trail-referential-integrity-on-deleted-records.1765249/)
- [Purging Soft-Deletes — Snipe-IT](https://snipe-it.readme.io/docs/purging-soft-deletes)
- [Enhancing Data Quality with CDC & Hard/Soft Deletes — Integrate.io](https://www.integrate.io/blog/cdc-and-hardsoft-deletes-by-integrateio/)
- [Declutter Your CRM By Purging Low-Quality Data — Insycle](https://blog.insycle.com/declutter-your-crm-purging-low-quality-data-automatically)
- [GDPR Article 17: Right to Erasure vs. AML Record-Keeping — Didit](https://didit.me/blog/gdpr-article-17-aml-record-keeping/)
- [Reconciling U.S. Banking/Securities Data Preservation with GDPR Erasure — Fordham JCFL](https://news.law.fordham.edu/jcfl/2020/01/30/reconciling-u-s-banking-and-securities-data-preservation-rules-with-european-mandatory-data-erasure-under-gdpr/)

## O que a indústria faz (consenso, não opinião isolada)

1. **Deleção física de master data referenciado é considerada anti-padrão em sistemas
   financeiros/ERP.** Se um registro (cliente, serviço, profissional, produto, forma de
   pagamento) já apareceu em qualquer transação/relatório, apagá-lo fisicamente quebra a
   reconciliação retroativa — relatórios antigos passam a referenciar um ID que não
   existe mais. A prática recomendada é um campo de status (`ativo`/`deleted_at`/`status`)
   que esconde o registro da operação do dia a dia sem apagar a linha. Isso é
   exatamente o que o HOPE OS já implementa (`ativo=false`).
2. **Deleção física É aceitável, mas para uma categoria diferente de dado**: registros
   que nunca tiveram conteúdo de negócio real — "bad import", dado de teste, entrada
   vazia/corrompida criada por erro operacional ou de ferramenta. A literatura de
   qualidade de dados trata isso como "purge" (expurgo), separado do "soft delete" do
   dia a dia, normalmente restrito a quem administra o sistema e só permitido quando o
   registro não tem nenhuma referência em outras tabelas.
3. **A tensão GDPR (direito ao esquecimento) vs. retenção fiscal/AML é resolvida por
   base legal, não por escolha de UX**: quando existe obrigação legal de retenção
   (registro financeiro, AML, fiscal), o direito à erasure não se aplica enquanto essa
   obrigação estiver ativa (GDPR Art. 17(3)(b)). Ou seja: mesmo fora do Brasil, onde
   existe a exigência mais forte de "apagar dados pessoais", a prática aceita é reter o
   registro (ofuscando dados pessoais sensíveis se necessário) em vez de apagar a linha
   inteira, quando ela sustenta um lançamento financeiro.

## Resolução recomendada para o HOPE OS

**Modelo de duas camadas**, já parcialmente implementado:

| Camada | Quando se aplica | Ação | Já existe? |
|---|---|---|---|
| **Desativar** (`ativo=false`) | Regra geral — qualquer cadastro que já é ou pode ter sido usado em agenda/comanda/vínculo | Botão "Desativar/Reativar" em toda a UI de Cadastros | Sim, para Serviços/Profissionais/Produtos/Formas. Cliente ganhou `PATCH` nesta sessão (ainda não deployado). |
| **Expurgo administrativo** (delete físico real) | Só para registros comprovadamente **sem nenhuma referência** em `comandos`, `comando_itens`, `agendamentos`, `profissional_servicos`, `comando_gorjetas`, `produto_estoque_movimentos` — ex: o cliente vazio criado por engano no teste desta sessão | Ação separada, não é um botão ao lado de "Editar/Desativar" no dia a dia. Precisa checar dependências antes de apagar, e bloquear com erro claro se houver qualquer referência | Não existe ainda — é a lacuna real que motivou a pergunta do usuário |

Isso confirma, com base em prática de mercado (não só preferência interna): **manter
"só desativar" como regra geral está certo e não deveria mudar** — a pergunta que fiz
antes (dispensada) já tinha essa resposta como a mais alinhada com a indústria. O que
faltava não era "excluir de verdade tudo", e sim um **expurgo seguro e restrito**, só
para lixo comprovado (como o cliente com `nome: ""`), que é uma necessidade legítima e
distinta de "excluir um cliente real que saiu do salão".

## Decisão em aberto para o usuário

1. Confirmar que a regra geral continua **só Desativar** para os 5 cadastros (Clientes,
   Serviços, Profissionais, Produtos, Formas) — recomendado, com respaldo de mercado.
2. Decidir como tratar o expurgo restrito:
   - **Opção A (mínima)**: não construir feature nova agora; tratar o registro-lixo
     específico manualmente, uma vez, com autorização explícita.
   - **Opção B**: construir uma RPC/endpoint de "expurgo seguro" (`DELETE` só se
     `count(*) = 0` em todas as tabelas de referência, senão erro `HAS_HISTORY`),
     reservado para dados claramente inválidos — não exposto como botão comum na lista,
     só acessível por um fluxo separado/administrativo.

Nenhuma ação de exclusão foi tomada neste snapshot — é só o registro da pesquisa e da
recomendação, aguardando a decisão acima.
