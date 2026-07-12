# Render Deployment Validation — HopeOS V1.4.1

**Validado em:** 2026-07-12  
**Estado:** REAL (configuração local); PENDENTE (validação remota)

---

## 1. Configuração render.yaml

### ✅ Backend Service
```yaml
type: web
name: hopeos-v1
runtime: node
rootDir: backend
buildCommand: npm install
startCommand: npm start
plan: free
envVars:
  - NODE_ENV: production
  - PORT: 10000
  - SUPABASE_URL: [sync: false]
  - SUPABASE_SERVICE_ROLE_KEY: [sync: false]
  - API_ACCESS_TOKEN: [sync: false]
  - DEFAULT_EMPRESA_ID: [sync: false]
  - CORS_ORIGIN: [sync: false]
```

**Verificação:**
- ✅ `rootDir: backend` — correto, `backend/package.json` existe com script `"start": "node src/server.js"`
- ✅ `buildCommand: npm install` — correto
- ✅ `startCommand: npm start` — correto, mapeia para `backend/src/server.js`
- ✅ `PORT: 10000` — explicitamente configurado (override do default 3333)
- ✅ `plan: free` — tier configurado

### ✅ Frontend Service
```yaml
type: web
name: hopeos-v1-frontend
runtime: static
buildCommand: ""
staticPublishPath: .
pullRequestPreviewsEnabled: false
headers:
  - path: /service-worker.js → Cache-Control: no-cache
  - path: /manifest.json → Cache-Control: no-cache
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

**Verificação:**
- ✅ `runtime: static` — correto para PWA
- ✅ `staticPublishPath: .` — correto, archivos raiz
- ✅ `index.html` presente (34 KB)
- ✅ `manifest.json` presente (538 B)
- ✅ `service-worker.js` presente (2.6 KB)
- ✅ Rewrite `/*` → `/index.html` — correto para SPA fallback

---

## 2. Verificação Backend Local

### Health Endpoint
```javascript
// backend/src/app.js:41-43
app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'HOPE OS V1 API', time: new Date().toISOString() });
});
```

**Teste esperado em produção:**
```bash
curl https://hopeos-v1.onrender.com/api/health
# Resposta: { "ok": true, "app": "HOPE OS V1 API", "time": "2026-07-12T..." }
```

- ✅ Health check é público (sem autenticação)
- ✅ `/` redireciona para `/api/health`

### Autenticação e Segurança
```javascript
// backend/src/app.js:45-46
app.use('/api', requireAuth);    // Todas as rotas /api/* protegidas
app.use('/api', routes);
```

- ✅ `requireAuth` middleware protege todas as rotas (exceto health)
- ✅ API_ACCESS_TOKEN obrigatório para requests não-health

### Configuração de Ambiente
```javascript
// backend/src/config/env.js
const env = {
  PORT: Number(process.env.PORT || 3333),              // 3333 local, 10000 em Render
  NODE_ENV: process.env.NODE_ENV || 'development',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  API_ACCESS_TOKEN: process.env.API_ACCESS_TOKEN || '',
  DEFAULT_EMPRESA_ID: process.env.DEFAULT_EMPRESA_ID || '00000000-0000-0000-0000-000000000001',
  CORS_ORIGIN: splitCsv(process.env.CORS_ORIGIN || 'null,http://localhost:5173,http://127.0.0.1:5500')
};
```

- ✅ PORT responde a processo.env.PORT (Render seta 10000)
- ✅ Fallbacks documentados para desenvolvimento local
- ⚠️ CORS_ORIGIN default não inclui Render; será configurado via env var

---

## 3. Verificação Frontend PWA

### Arquivos Necessários
| Arquivo | Tamanho | Estado |
|---------|---------|--------|
| `index.html` | 34 KB | ✅ Presente |
| `manifest.json` | 538 B | ✅ Presente |
| `service-worker.js` | 2.6 KB | ✅ Presente |
| `js/` | múltiplos | ✅ Presente |
| `css/` | múltiplos | ✅ Presente |

### Manifest Configuration
```json
{
  "name": "HOPE OS",
  "short_name": "HOPE OS",
  "description": "Agenda, comanda e gestão premium para beauty tech conectado ao backend real."
}
```

- ✅ PWA manifest configurado
- ✅ Service worker para cache offline

### Cache Headers
```yaml
headers:
  - path: /service-worker.js
    name: Cache-Control
    value: no-cache
  - path: /manifest.json
    name: Cache-Control
    value: no-cache
```

- ✅ Service worker e manifest com `no-cache` — garante atualizações
- ✅ SPA rewrite ativa para navegação

---

## 4. Dependências e Build

### Backend Dependencies
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "morgan": "^1.10.0",
    "xlsx": "^0.18.5"
  }
}
```

- ✅ Todas as dependências mapeadas
- ✅ Sem devDependencies que bloqueiem build
- ✅ `npm install` suficiente para Render

### Build Validação
```bash
# Em Render: buildCommand "npm install"
npm install
# Gera node_modules/ → pronto para npm start
```

- ✅ Build path válido

---

## 5. Checklist de Deploymento Render

### Antes de Fazer Deploy
- [ ] **SUPABASE_URL** — configurar env var em Render dashboard (ex: `https://xxxx.supabase.co`)
- [ ] **SUPABASE_SERVICE_ROLE_KEY** — configurar em Render (chave privada, nunca exponha)
- [ ] **API_ACCESS_TOKEN** — gerar token e configurar (ver `AGENTS.md` para protocolo)
- [ ] **DEFAULT_EMPRESA_ID** — deixar padrão ou sobrescrever conforme tentativa
- [ ] **CORS_ORIGIN** — adicionar frontend Render (ex: `https://hopeos-v1-frontend.onrender.com`)
- [ ] **NODE_ENV** → `production` (já configurado no render.yaml)
- [ ] **PORT** → `10000` (já configurado no render.yaml)

### Health Check Esperado
Após deploy, validar:
```bash
# Backend health
curl -s https://hopeos-v1.onrender.com/api/health | jq

# Esperado:
{
  "ok": true,
  "app": "HOPE OS V1 API",
  "time": "2026-07-12T..."
}

# Frontend SPA
curl -s https://hopeos-v1-frontend.onrender.com/
# Esperado: HTML raiz com manifest link
```

### Teste de Autenticação
```bash
# Sem token — deve retornar 401
curl -s https://hopeos-v1.onrender.com/api/pessoas | jq
# Esperado: { "error": "Unauthorized", "status": 401 }

# Com token correto
curl -s -H "Authorization: Bearer <API_ACCESS_TOKEN>" \
  https://hopeos-v1.onrender.com/api/pessoas | jq
# Esperado: { "pessoas": [...] } ou sucesso conforme acesso
```

---

## 6. Riscos e Mitigações

| Risco | Severidade | Mitigation |
|-------|------------|-----------|
| Env vars não configuradas em Render | 🔴 CRÍTICO | Copiar de `.env.local` → Render dashboard antes de deploy |
| `service_role` exposto via frontend | 🔴 CRÍTICO | Render.yaml não o expõe; conforme AGENTS.md |
| CORS_ORIGIN não inclui frontend Render | 🟡 ALTO | Adicionar hostname Render antes de deploy |
| Cache service worker obsoleto | 🟡 MÉDIO | Headers `no-cache` já configurados |
| Port conflict (10000) | 🟢 BAIXO | Render aloca automaticamente |
| Node.js version | 🟢 BAIXO | Render default é estável; pode ser fixado em .node-version |

---

## 7. Próximos Passos

1. **Deploy em Render:**
   - [ ] Fazer login em Render dashboard
   - [ ] Criar novo projeto via blueprint YAML
   - [ ] Configurar env vars (SUPABASE_URL, SERVICE_ROLE_KEY, API_ACCESS_TOKEN, etc.)
   - [ ] Fazer deploy

2. **Validação Pós-Deploy:**
   - [ ] `curl` health endpoint
   - [ ] Testar auth (sem token → 401, com token → acesso)
   - [ ] Validar CORS (frontend pode chamar backend)
   - [ ] Testar PWA offline (service worker ativo)

3. **Monitoramento:**
   - [ ] Logs de backend em Render dashboard
   - [ ] Alertas de 5xx errors
   - [ ] Performance metrics

---

## 8. Referências

- **render.yaml** — configuração declarativa (este arquivo)
- **CLAUDE.md** — regras invioláveis do projeto
- **AGENTS.md** — protocolo de segurança (API_ACCESS_TOKEN, multi-tenant)
- **PROJECT_STATE.md** — estado geral V1.4.1
- **backend/src/app.js** — health endpoint e middlewares
- **backend/src/config/env.js** — configuração de ambiente

---

## Conclusão

✅ **Configuração local validada:** render.yaml, backend e frontend estão prontos.  
⏳ **Validação remota pendente:** Deploy em Render requer acesso à plataforma e configuração de secrets.  
🔐 **Segurança:** Nenhum secret no código; todos os env vars sinalizados como `sync: false` em render.yaml.

**Estado:** REAL (config) + BLOQUEADO (validação remota até fazer deploy em Render)
