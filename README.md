# HOPE OS

App operacional para beauty tech: agenda, comanda, dashboard e gestao conectados ao backend real.

## Estado atual

```txt
Backend: V1.2 cadastros reais + hardening aplicado
Frontend: V1.3 UI/UX premium publicado
Deploy frontend: GitHub Pages
Deploy backend: Render
Banco: Supabase
PWA cache atual: hope-os-shell-v1-3-8
```

URLs:

```txt
Frontend: https://hudson-f-lima.github.io/HopeOs-v1/
Backend health: https://hopeos-v1.onrender.com/api/health
```

## O que existe

```txt
Agenda premium mobile-first
Comanda / checkout real
Dashboard bento
Gestao via avatar
Clientes, servicos, profissionais, produtos e formas de pagamento
Service worker com HTML network-first
Backend real com validacoes e gates
```

## Regras de seguranca

```txt
Nao commitar .env
Nao expor tokens
Nao rodar migration sem autorizacao
Nao alterar Supabase sem autorizacao explicita
Nao mudar regra financeira pelo frontend
Backend continua sendo a fonte da verdade
```

## Comandos uteis

Backend:

```bash
cd backend
npm install
npm run test:gate
npm start
```

Git status:

```bash
git status
git log --oneline -5
```

## Deploy e cache

Depois de alterar frontend:

```txt
1. Atualizar CACHE_NAME em service-worker.js
2. Atualizar CACHE_NAME em frontend/service-worker.js
3. Validar GitHub Pages publicado
4. Se o navegador mostrar tela antiga, usar Ctrl+F5 ou abrir com query ?refresh=1
```

## Documentos principais

```txt
docs/HOPE_OS_V1_3_FRONTEND_UI_UX_PREMIUM_BLUEPRINT.md
docs/FRONTEND_V1_3_UI_UX_AUDIT.md
docs/FRONTEND_V1_3_ADVERSARIAL_AUDIT.md
docs/HOPE_OS_V1_2_BACKEND_CADASTROS_REAIS_BLUEPRINT.md
docs/API_CONTRACT.md
docs/DATA_CONTRACT.md
docs/archive/legacy-v1/
```

## Ultima validacao conhecida

```txt
GitHub Pages: HTTP 200
service-worker.js: hope-os-shell-v1-3-8
Backend /api/health: HTTP 200
App abriu em navegador limpo com fatalVisible=false e appVisible=true
```
