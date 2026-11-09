---
name: deploy-producao
description: Publicar o HOPE OS em produção com segurança (Supabase hopeos-v1 + backend Render + PWA) — ordem dos passos, lista exata de variáveis do Render, ferramentas doctor / bootstrap-admin / smoke, primeiro admin, rollback e o que nunca fazer. Use quando o usuário pedir para "publicar", "subir", "reativar o Render", "fazer o deploy", "criar o primeiro admin" ou "conferir produção".
---

# Deploy em produção — HOPE OS

Fonte do procedimento detalhado: `docs/RUNBOOK_MIGRATION_007.md` (passos 5–8). Estado atual: `docs/PROJECT_STATE.md`.
Ferramentas (Node puro, sem dependência nova, todas com `--help`), em `backend/scripts/ops/`:

| Ferramenta | Faz | Escreve? |
|---|---|---|
| `doctor.js` | variáveis + `/api/health` + tabelas 001–009 via PostgREST (HEAD `limit=0`) + Auth settings | nunca |
| `bootstrap-admin.js` | empresa + "Unidade principal" + vínculo admin (passo 7) | só com `--apply` |
| `smoke.js` | health, 401, headers, CORS, `/api/public` 404, CSP/headers da PWA, `config.json` | nunca |

Códigos de saída: `0` ok · `1` falhou · `2` uso incorreto · `3` recusado por segurança (staging / projeto ou chave divergente).
Segredos só por variável de ambiente; as ferramentas mostram apenas tipo e tamanho da chave.

## 0. Quem executa
- Agente: só roda as ferramentas se o **Platform Owner** pediu nesta sessão e forneceu o ambiente. Sem isso, prepara os comandos e para.
- SQL em produção: só com autorização explícita do Platform Owner. `bootstrap-admin` não roda SQL arbitrário (usa o PostgREST do backend), mas grava em produção: `--apply` também precisa de autorização.

## 1. Ordem (não pular, não inverter)
1. **Banco já com 001–009** no `hopeos-v1` (`gsttjozcmdvgstcpadiq`). Conferir pela verificação SQL do runbook (passo 4 e §4.1) ou pelo `doctor` (passo 4 abaixo). Migration nova só entra pela `main` com linha em `supabase/migrations.lock` e decisão em `docs/DECISIONS.md`.
2. **Supabase Auth → URL Configuration**: Site URL e Redirect URLs = URL pública da PWA. Providers → Email: *Confirm email* ligado; *Allow new users to sign up* desligado (o app é por convite).
3. **Render → `hopeos-v1` → Environment** (lista exata; nada além disto):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `SUPABASE_URL` | `https://gsttjozcmdvgstcpadiq.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` **ou** `SUPABASE_SECRET_KEY` (só uma) | chave secreta do `hopeos-v1` |
   | `API_ACCESS_TOKEN` | aleatório ≥ 32 caracteres (`openssl rand -hex 32`) |
   | `DEFAULT_EMPRESA_ID` | UUID do salão (`node -e "console.log(crypto.randomUUID())"`); o mesmo do passo 7 |
   | `CORS_ORIGIN` | origem da PWA, sem barra (ex.: `https://hopeos-v1-frontend.onrender.com`) |
   | `APP_PUBLIC_URL` | URL pública da PWA (ex.: `https://hopeos-v1-frontend.onrender.com/`) |
   | `LEGACY_TOKEN_AUTH_ENABLED` | `true` (transição, ADR-005) |
   | `AUTH_TIMEOUT_MS` | `5000` |
   | `INTEGRATION_ROTATION_OVERLAP_MIN` | `60` |
   | `APP_TIMEZONE` | `America/Sao_Paulo` |
   | `PUBLIC_BOOKING_LINKS` | **ausente** (agendamento online só com D-014: aviso de privacidade + Red Team) |

4. **Reativar o serviço e fazer deploy manual da `main`** (Render → Manual Deploy → *Deploy latest commit*). Plano free: a primeira resposta pode levar ~1 min.
5. **`doctor`** com as mesmas variáveis, num arquivo FORA do repositório (`chmod 600`, nunca commitar):
   ```bash
   node --env-file=$HOME/hopeos-prod.env backend/scripts/ops/doctor.js --no-dotenv \
     --api https://hopeos-v1.onrender.com/api
   ```
   Tem que sair `APTO (código 0)`. `db.schema.001–006/007/008/009` OK; `db.bootstrap` WARN é esperado antes do passo 7.
6. **Convite do admin**: Supabase → Authentication → Users → *Invite user* com o e-mail do dono. O convite cria o usuário no Auth e o trigger da 007 cria a linha em `app_users` na hora; o dono abre o link na PWA e define a senha (pode ser antes ou depois do passo 8).
7. **`bootstrap-admin --dry-run`** (padrão) e leitura do plano:
   ```bash
   node --env-file=$HOME/hopeos-prod.env backend/scripts/ops/bootstrap-admin.js --no-dotenv \
     --empresa-id <DEFAULT_EMPRESA_ID do Render> --empresa-nome "Nome do Salão" --admin-email dono@exemplo.com
   ```
   Esperado: `CRIAR` para empresa/unidade/membership (ou `EXISTE`). `usuario` FAIL = e-mail não convidado (ou digitado diferente) → voltar ao passo 6. Nada é gravado nesse caso.
8. **`bootstrap-admin --apply`** (mesmo comando + `--apply`). Idempotente: repetir não duplica nada.
9. **`smoke`**:
   ```bash
   node backend/scripts/ops/smoke.js --api https://hopeos-v1.onrender.com/api \
     --pwa https://hopeos-v1-frontend.onrender.com/
   ```
   Tem que sair `APTO`. WARN conhecidos: `api.cors.localhost` (app.js libera localhost/LAN), `pwa.publicacao` (static publica o repositório).
10. **Login** na PWA com o e-mail do dono → o assistente de configuração abre. `GET /api/me` com o JWT → `principal_type: user`, `role: admin`. Rodar `doctor` de novo: `db.bootstrap` some.

## 2. Rollback
| Situação | Ação |
|---|---|
| `doctor`/`smoke` reprovam após o deploy | Corrigir a variável e *Manual Deploy* de novo; se o código for o problema, Render → Deploys → *Rollback* para o deploy anterior |
| Login/JWT com problema | Token legado (`?apiToken=` / "modo antigo"); não mexe no banco |
| Admin criado na empresa errada | Ajustar o vínculo (`empresa_memberships.status = 'inativo'`) — SQL autorizado pelo Platform Owner. Empresa com histórico não se apaga (ledger imutável, RUNBOOK §4.1) |
| Banco | `supabase/rollback/009_down.sql` → `008_down.sql` → `007_down.sql`, nessa ordem, só com autorização e conforme RUNBOOK §8 |
| Parar tudo | Render → *Suspend* o `hopeos-v1` (a PWA mostra API indisponível; dados intactos) |

## 3. Nunca
- Usar o `kortex-os-v2-staging` (`hyzoocmmtmjlgdyifwhu`) — é OUTRO projeto. As três ferramentas recusam (código 3); não contornar com `--expected-ref`.
- Executar SQL em produção, ou `bootstrap-admin --apply`, sem autorização do Platform Owner.
- Mesclar na `main` mudança em `supabase/migrations/` sem linha no `supabase/migrations.lock` e decisão registrada: o merge aplica SQL em produção (D-010).
- Colar chave secreta em chat, commit, `config.json`, frontend ou log. `service_role` nunca vai para a PWA.
- Ligar `PUBLIC_BOOKING_LINKS` ou desligar `LEGACY_TOKEN_AUTH_ENABLED` sem decisão registrada.
- Declarar "produção aprovada" ou "multi-tenant seguro" só porque `doctor`/`smoke` passaram: eles provam configuração, não Red Team.
- Rodar `backend/scripts/clear-test-data.js` ou seeds contra produção.

## 4. Registro
Ao terminar, registrar em `docs/PROJECT_STATE.md` (estado de produção, saída resumida do `doctor` e do `smoke`, data) e no `CHANGELOG.md`. Saída das ferramentas já vem sem segredos; ainda assim, não colar o arquivo de ambiente.
