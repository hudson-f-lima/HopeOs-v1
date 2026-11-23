# frontend/ — histórico (não é o app atual)

**Status:** arquivo de histórico. O patch descrito abaixo **não foi aplicado**. O app em produção é a PWA da raiz do repositório (`index.html`, `js/`, `css/`, `service-worker.js`), que chama a API por `js/api.js`.

## O que existe nesta pasta

- `index.local-prototype.html`: protótipo local V9.2.4 preservado, com uma chamada à API. Não é carregado pelo app atual.
- `hope_os_salao_V10_evolution_lab.html`: laboratório de evolução visual, sem ligação com a API.
- `api-client.js`: cliente `HopeApi` do plano de patch. O `index.html` da raiz não o usa (`grep`: zero ocorrências).
- `icon.svg`, `manifest.json`, `service-worker.js`: nenhum código do repositório referencia estes arquivos desta pasta; o app usa os da raiz.

Não editar nada aqui para mudar o comportamento do produto. Mudanças de tela vão em `js/ui/` e `index.html` na raiz.

## Plano original (não aplicado), para referência

```txt
1. Incluir api-client.js no HTML
2. Trocar load(KEYS.*) por HopeApi.snapshot()
3. Trocar checkout local por HopeApi.checkoutPreview() e HopeApi.checkoutClose()
4. Dashboard e financeiro lendo /api/dashboard e /api/financeiro/resumo
5. localStorage só como cache/configuração visual, não como banco
```

O que ficou no app real foi outro caminho (módulos `js/` e rotas `backend/src/routes/`). Use o `docs/PROJECT_STATE.md` como referência do estado atual.

## Regra canônica (ainda válida)

```txt
Frontend não calcula taxa, comissão, gorjeta ou líquido salão.
Frontend solicita preview ao backend.
Frontend fecha comanda pelo backend.
```
