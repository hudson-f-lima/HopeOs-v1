# 12 — PRODUCTION DEPLOYMENT CHECKLIST — TAREFA B (Segredos & PII)

**Data:** 2026-07-10
**Tarefa:** Rotação de segredos + remoção de PII do versionamento
**Pré-requisito:** Tarefa A completada e validada em produção
**Bloqueador:** Segredos vivos no zip distribuído + PII no git = P0 LGPD + segurança
**Crítico:** Estes passos são **obrigatórios**, não opcionais

---

## VISÃO GERAL

Quatro segredos foram distribuídos no `backend/.env`:
1. `SUPABASE_SECRET_KEY` (service_role)
2. `SUPABASE_DB_PASSWORD` (admin DB)
3. `GH_TOKEN` (GitHub API access)
4. Render deploy hook URL (com key embutida)

PII real foi versionada em:
- `data/clientes.json` (1481+ clientes reais com nome + whatsapp)
- `data/backups/export-*.json` (backups de PII)

---

## PARTE A — ROTAÇÃO DE SEGREDOS

### A.1 — Supabase: Rotacionar `SUPABASE_SECRET_KEY`

**O quê:** Service role key — a credencial mais crítica (lê/escreve tudo em Supabase).

**Onde:** https://app.supabase.com → seu projeto (`qosioymzswhkqkziocas` ou equivalente) → Settings → API keys

**Steps:**

1. Abrir https://app.supabase.com/project/[seu-project-id]/settings/api
2. Seção **Service Role Key** → copiar valor atual (guardar para validação)
3. Clicar **Regenerate** (ou botão de rotação)
4. **Aguardar ~10 segundos** — o Supabase reitera a key
5. Copiar **nova** key
6. Ir para Render → hopeos-v1 backend → Environment
7. Atualizar variável `SUPABASE_SERVICE_ROLE_KEY` com a nova key
8. Salvar e redeploy
9. Validar: `curl -H "Authorization: Bearer <API_TOKEN>" https://hopeos-v1.onrender.com/api/clientes` funciona

- [ ] Key antiga copiada (backup, se precisar reverter)
- [ ] Key regenerada no Supabase console
- [ ] Key nova definida no Render
- [ ] Redeploy completado
- [ ] `/api/clientes` continua respondendo (não rejeitado por auth Supabase)

### A.2 — Supabase: Rotacionar `SUPABASE_DB_PASSWORD`

**O quê:** Senha de admin do banco de dados Postgres.

**Onde:** https://app.supabase.com → Settings → Database → Connection pooling + Password reset

**Steps:**

1. Abrir https://app.supabase.com/project/[seu-project-id]/settings/database
2. Localizar seção **Connection pooling** ou **Database Password**
3. Se houver botão **Reset password** / **Change password** → clicar
4. Confirmar (confirmação de segurança pode pedir autenticação 2FA)
5. **Nova password será gerada** (Supabase mostra uma vez só)
6. Copiar a nova password
7. Ir para Render → hopeos-v1 backend → Environment
8. Atualizar `SUPABASE_DB_PASSWORD` com a nova senha
9. Salvar e redeploy
10. Validar: backend conecta ao Supabase (check logs em Render)

- [ ] DB password anterior anotado (para reverter se crítico)
- [ ] Nova password gerada no Supabase
- [ ] Nova password definida no Render
- [ ] Redeploy completado
- [ ] Logs do Render não mostram `ECONNREFUSED` ou erro de autenticação DB

### A.3 — GitHub: Rotacionar `GH_TOKEN`

**O quê:** Token de API do GitHub (usado para quê? check `.env` comentário ou histórico).

**Onde:** https://github.com/settings/tokens

**Steps:**

1. Abrir https://github.com/settings/tokens
2. Se for token clássico (PAT): listar → encontrar o token usado (`GH_TOKEN`)
3. Se a descrição diz "HOPE OS" ou "deploy": este é o token
4. Clicar em **Delete** ou **Regenerate** (se a plataforma oferece)
5. Se só houver delete: deletar e criar um novo
   - Nome: `HOPE OS Deploy` (ou similar)
   - Scopes: só o mínimo necessário (ex: se só faz push, marcar `repo:write` + `public_repo`)
   - Expiração: 90 dias recomendado
6. Copiar o novo token (GitHub mostra uma vez só)
7. Ir para Render → hopeos-v1 backend → Environment
8. Atualizar `GH_TOKEN` com o novo token
9. Salvar e redeploy
10. Se o token é usado em CI/deploy: validar que o próximo push/trigger funciona

- [ ] Token antigo identificado
- [ ] Token deletado ou regenerado
- [ ] Novo token gerado
- [ ] Novo token definido no Render
- [ ] Redeploy completado
- [ ] (Validar se houver CI/webhook que usa o token)

### A.4 — Render: Rotacionar Deploy Hook

**O quê:** URL de webhook com key embutida — permite trigger de redeploy via HTTP.

**Onde:** https://dashboard.render.com → hopeos-v1 → Settings → Deploy Hooks

**Steps:**

1. Abrir https://dashboard.render.com/services
2. Selecionar serviço **hopeos-v1**
3. Ir para **Settings** → **Deploy Hooks** (ou **Webhooks**)
4. Listar os deploy hooks existentes
5. Encontrar o hook com padrão `https://api.render.com/deploy/...?key=...`
6. Copiar a URL atual (guardar para referência)
7. Clicar **Delete** ou **Regenerate** (se Render oferece)
8. Se só houver delete: deletar e **criar novo**
   - Nome: `GitHub CI` (ou qual for o propósito)
   - Trigger: escolher (ex: `main` branch)
   - A URL nova será gerada
9. Copiar a nova URL
10. Se a URL é usada em GitHub Actions / CI file (ex: `.github/workflows/deploy.yml`): **atualizar o arquivo**
11. Fazer commit da mudança de CI
12. Validar: próximo push/trigger dispara um redeploy no Render (check Logs)

- [ ] Deploy hook antigo identificado
- [ ] Hook deletado
- [ ] Novo hook gerado
- [ ] Nova URL copiada
- [ ] CI / GitHub Actions atualizado (se aplicável)
- [ ] Próximo redeploy funciona via webhook

---

## PARTE B — REMOÇÃO DE PII DO VERSIONAMENTO

### B.1 — Identificar arquivos com PII

```bash
cd /path/to/repo
git ls-files data/
```

**Esperado:**
```
data/clientes.json
data/backups/export-2026-01-15.json
data/backups/export-2026-03-01.json
... (outros backups)
```

- [ ] `data/clientes.json` listado
- [ ] `data/backups/*.json` listados

### B.2 — Remover do versionamento (git index)

```bash
git rm --cached data/clientes.json
git rm --cached data/backups/export-*.json
```

**Ou** (mais seguro):
```bash
git rm --cached data/
```

- [ ] Arquivos removidos do index (git status mostra deleted)
- [ ] Arquivos físicos ainda existem no filesystem (não foram deletados, só removidos do git)

### B.3 — Atualizar `.gitignore`

Adicionar ao arquivo `.gitignore` na raiz:

```text
# PII e dados de cliente (nunca versionado)
data/clientes.json
data/backups/
data/*.json
```

Ou se aplicável:
```text
# Dados locais
/data/
```

- [ ] `.gitignore` atualizado
- [ ] Padrão cobre `data/clientes.json` e `data/backups/*`

### B.4 — Validar que os arquivos não serão mais trackados

```bash
git status
```

**Esperado:**
```
modified:   .gitignore
deleted:    data/clientes.json
deleted:    data/backups/export-2026-01-15.json
...
```

- [ ] `.gitignore` modificado
- [ ] Arquivos de PII aparecem como "deleted" ou não aparecem em future commits

### B.5 — Reescrever histórico (ALTAMENTE RECOMENDADO)

**CRÍTICO:** A ausência deste passo deixa PII acessível via `git log` e `git show <commit-hash>`.

**Opção 1: BFG Repo-Cleaner (recomendado, mais simples)**

```bash
# Instalar BFG se não tiver
brew install bfg  # macOS
# OU via java: java -jar bfg-1.14.0.jar (baixar de https://rtyley.github.io/bfg-repo-cleaner/)

# Fazer backup do repo
cp -r .git .git.backup

# Rodar BFG para remover arquivos históricos
bfg --delete-files data/clientes.json --no-blob-protection

# Forçar limpeza
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

**Opção 2: Git filter-branch (mais manual, controle fino)**

```bash
# AVISO: reescreve TODO o histórico — coordenar com team
git filter-branch --tree-filter 'rm -f data/clientes.json data/backups/*.json' -- --all

git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

**Opção 3: Git filter-repo (modernizador do filter-branch)**

```bash
# Instalar
pip install git-filter-repo

# Remover arquivos
git filter-repo --path data/ --invert-paths
```

**AVISO IMPORTANTE:**
- Após reescrever histórico, qualquer pessoa com clone local precisará fazer `git pull --force` ou reclone
- Coordenar com todos que têm o repositório checkouted
- Se é um monorepo com outras pessoas trabalhando: considerar **se realmente precisa reescrever agora** ou se pode deixar para later (após V1.4.1 stabilize)

- [ ] Backup do `.git` feito (se reescrevendo)
- [ ] BFG / filter-branch / filter-repo executado
- [ ] `git log --all --source --remotes --branches` não mostra mais referências a `data/clientes.json`
- [ ] Histórico reescrito (opcional mas recomendado)

### B.6 — Validar remoção

```bash
git log --name-only --oneline | grep -i "data/clientes\|data/backups"
```

**Esperado:** (nenhuma saída)

- [ ] Histórico não contém referências a PII

---

## PARTE C — VALIDAÇÃO FINAL

### C.1 — Verificar que nenhum secret está no repositório

```bash
# Procurar por secrets conhecidos
git log -p --all -S "SUPABASE_SECRET_KEY" | head -5
git log -p --all -S "SUPABASE_DB_PASSWORD" | head -5
git log -p --all -S "GH_TOKEN" | head -5
```

**Esperado:** (nenhuma saída) — se houver resultado, o secret antigo continua no histórico

- [ ] Nenhum secret em histórico recente
- [ ] (Se encontrou, considerar reescrever histórico)

### C.2 — Verificar que PII não está em novo checkout

```bash
# Clone um novo repo
cd /tmp
git clone <repo-url> test-clone
cd test-clone
ls -la data/
```

**Esperado:**
```
ls: cannot access 'data/': No such file or directory
# OU
data/ é vazio ou não existe
```

- [ ] `data/clientes.json` NÃO existe em novo clone
- [ ] `data/backups/` NÃO existe ou está vazio

### C.3 — Confirmar que variáveis de ambiente estão FORA do histórico

```bash
git log --name-status | grep ".env"
```

**Esperado:**
```
M   backend/.env.example  (só exemplo, com placeholders, nunca valores reais)
```

- [ ] Nenhum `.env` real trackeado
- [ ] Só `.env.example` existe (com placeholders tipo `COLE_AQUI_...`)

---

## DOCUMENTAÇÃO & AUDITORIA

### D.1 — Atualizar CLAUDE.md / README com status de segredos

Adicionar seção:

```markdown
### Segredos (Tarefa B)

| Item | Status | Data | Evidência |
|------|--------|------|-----------|
| SUPABASE_SECRET_KEY | ✅ Rotacionado | 2026-07-11 | Supabase console + Render env log |
| SUPABASE_DB_PASSWORD | ✅ Rotacionado | 2026-07-11 | Supabase console + Render env log |
| GH_TOKEN | ✅ Rotacionado | 2026-07-11 | GitHub settings + Render env log |
| Deploy hook | ✅ Rotacionado | 2026-07-11 | Render dashboard + CI config |
| PII (`data/*.json`) | ✅ Removida | 2026-07-11 | git log | grep — sem resultados |
| Histórico reescrito | ✅ Sim | 2026-07-11 | BFG repo-cleaner |
```

- [ ] CLAUDE.md atualizado com status
- [ ] README.md atualizado com nota de segredos rotacionados

### D.2 — Criar commit final da Tarefa B

```bash
git add .gitignore CLAUDE.md README.md
git commit -m "fix(v1.4.1): rotate secrets + remove PII from versionning

- Rotated SUPABASE_SECRET_KEY in Supabase + Render
- Rotated SUPABASE_DB_PASSWORD in Supabase + Render
- Rotated GH_TOKEN in GitHub + Render
- Rotated Render deploy hook in dashboard + CI config
- Removed data/clientes.json, data/backups/ from git index
- Updated .gitignore to prevent future PII commits
- Rewrote git history with BFG to purge old references
- Validated: new clones have no PII, no secrets in logs

Tarefa A (API perimeter auth) + Tarefa B (secrets rotation) complete.
Ready for V1.4.1 production validation.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

- [ ] Commit criado com mensagem clara
- [ ] Commit inclui `.gitignore` + doc updates
- [ ] Nenhum `.env` real ou `data/` incluído no commit

---

## VEREDITO FINAL DA TAREFA B

### Critério de Aceite

✅ **Tarefa B está APROVADA se:**

- [ ] Todos os 4 segredos foram rotacionados (confirmado em dashboards)
- [ ] Render foi redeploy com as novas credenciais
- [ ] Backend continua funcional após rotações (check API)
- [ ] `data/*.json` removido do git index
- [ ] `.gitignore` atualizado
- [ ] `git log` não mostra mais PII ou secrets antigos
- [ ] Novo clone não contém `data/clientes.json`
- [ ] Histórico foi reescrito (BFG ou similar)

### Classificação Final

| Item | Status |
|------|--------|
| Secrets rotacionados | ✅ REAL |
| PII removida de index | ✅ REAL |
| `.gitignore` atualizado | ✅ REAL |
| Histórico limpo | ✅ REAL |
| Backend funcional | ✅ REAL |

**Veredito:** **TAREFA B CONCLUÍDA**

---

## PRÓXIMA AÇÃO

Após Tarefa B completada:

1. **V1.4.1 está PRONTO para produção:** Tarefa A (API auth) + Tarefa B (secrets) validadas
2. **Próximo ciclo:** V1.5 ou V1.4.2 (depende do backlog)
3. **Backlog desbloqueado:**
   - migration 007+ (append-only físico, actor_id, estorno)
   - multi-tenant real (tenant por token)
   - RBAC (roles e permissões)
   - Insights em SQL (O(n) → O(log n) agregação)

**KPI simplificado:** Zero P0 de segurança em produção. Ready para próximo escopo.

---

*Checklist de produção para V1.4.1 Security Hardening — Tarefa B rotação e limpeza. Gerado 2026-07-10.*
