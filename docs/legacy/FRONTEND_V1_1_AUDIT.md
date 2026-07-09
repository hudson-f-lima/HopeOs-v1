# HOPE OS V1.1 — Frontend Audit Patch

## Decisão
Frontend substituído por uma versão operacional mais limpa, mobile-first e alinhada à regra: backend é a verdade única.

## Classificação
- Backend financeiro: REAL
- Checkout preview/close: REAL
- Agenda create/list: REAL
- Cadastro de cliente: REAL
- Cadastros de serviços/profissionais/produtos/formas: PARCIAL, somente leitura no frontend porque não há POST/PATCH no backend atual
- Frontend financeiro: protegido; não calcula preço, comissão, taxa ou estoque
- PWA: corrigido para abrir `index.html`

## Arquivos alterados
- `index.html`
- `manifest.json`
- `service-worker.js`
- `frontend/manifest.json`
- `frontend/service-worker.js`

## Backup criado
- `index.v1.0.3.backup.html`

## Gate de uso real
Uma pessoa da equipe deve conseguir:
1. abrir o app;
2. cadastrar cliente;
3. criar agendamento;
4. fechar comanda;
5. vender produto;
6. ver KPIs básicos;
7. operar sem editar banco ou HTML.

## Próximo backend necessário
Criar endpoints REST para:
- `POST/PATCH /servicos`
- `POST/PATCH /profissionais`
- `POST/PATCH /produtos`
- `POST/PATCH /formas-pagamento`
- `POST/PATCH /profissional-servicos`
