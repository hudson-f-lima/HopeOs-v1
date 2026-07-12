# HOPE OS → KortexOS™

Sistema operacional para beauty tech, com agenda, checkout financeiro, dashboard e cadastros conectados ao backend.

O estado operacional atual está exclusivamente em [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md). Regras permanentes para agentes estão em [`AGENTS.md`](AGENTS.md); o mapa documental está em [`docs/INDEX.md`](docs/INDEX.md).

## Segurança

O código contém perímetro Bearer `API_ACCESS_TOKEN` e fail-closed. A configuração e validação em produção permanecem DESCONHECIDAS até evidência do Render. Não compartilhar URLs de produção, tokens ou segredos.

## Como rodar

```bash
cd backend
npm install
npm start
npm run test:gate
```

Gate local validado em 2026-07-12: 73/73 verdes.

## Banco e escopo

As migrations físicas vigentes são 001–006. Não criar migrations 007+, não avançar para V1.5 e não expandir features enquanto houver bloqueadores P0 em [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).
