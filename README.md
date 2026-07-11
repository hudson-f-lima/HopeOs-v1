# HOPE OS → KortexOS™

Sistema operacional para beauty tech: agenda, comanda (checkout financeiro real), dashboard e cadastros conectados a backend real. **KortexOS™ é o nome canônico do produto** (HOPE OS é o legado interno). Mapa de documentação: [`docs/INDEX.md`](docs/INDEX.md). Agentes de IA: ler [`AGENTS.md`](AGENTS.md) antes de qualquer tarefa.

## ⚠️ Aviso de segurança

```text
V1.4.1 Security Perimeter implementado no código (2026-07-10).
API_ACCESS_TOKEN ainda NÃO configurado no Render — backend em produção
pode estar sem autenticação até a Tarefa A ser concluída.

Não compartilhar URLs de produção publicamente até Tarefa A validada.
Não commitar .env, tokens ou segredos.
```

## Estado atual (2026-07-11)

```text
Backend:  V1.4.1 — auth gate implementado; pendente configuração no Render (Tarefa A)
Frontend: V1.4 UI/UX premium + Dashboard Insights — em produção no GitHub Pages
Banco:    Supabase (migrations 001–006 aplicadas; projeto qosioymzswhkqkziocas)
Ciclo:    V1.4.1 Security Perimeter — código CONCLUÍDO; produção PENDENTE (Tarefas A e B)
Branch:   main
SW cache: hope-os-shell-v1-4-7
Testes:   cd backend && npm run test:gate → 73/73 verdes
```

URLs:

```text
Frontend:       https://hudson-f-lima.github.io/HopeOs-v1/
Backend health: https://hopeos-v1.onrender.com/api/health
```

## Como continuar este projeto

Leia NESTA ORDEM antes de escrever qualquer código:

```text
1. AGENTS.md                                    → manifesto para agentes de IA
2. CLAUDE.md                                    → estado atual, bloqueios, regras
3. docs/audit_global/00_STATUS_EXECUCAO.md      → tarefas pendentes (Tarefa A e B)
4. docs/canon/KORTEXOS_5_1_MASTER_BRIEFING_...  → visão canônica, domínios, bloqueios
5. docs/INDEX.md                                → mapa completo de documentação
```

## Como rodar

```bash
# Backend
cd backend
npm install
npm start

# Testes (obrigatório verde antes de qualquer merge)
cd backend && npm run test:gate
# Esperado: 73/73 verdes

# Frontend local (preview)
npx --yes serve . -l 5500
```

## Como testar auth

```bash
# Sem token → deve retornar 401
curl https://hopeos-v1.onrender.com/api/clientes

# Health (sem token → deve retornar 200)
curl https://hopeos-v1.onrender.com/api/health

# Com token válido → deve retornar 200
curl -H "Authorization: Bearer <SEU_TOKEN>" https://hopeos-v1.onrender.com/api/clientes
```

## Status V1.4.1

| Item | Status |
|------|--------|
| Middleware auth Bearer `API_ACCESS_TOKEN` em `/api/*` (exceto `/api/health`) | ✅ REAL |
| Frontend envia Bearer em todas as chamadas | ✅ REAL |
| `npm run test:gate` = 73/73 | ✅ REAL |
| PII removida do git index | ✅ REAL |
| `API_ACCESS_TOKEN` configurado no Render | ⛔ PENDENTE |
| Segredos rotacionados | ⛔ PENDENTE |
| Histórico git sem PII | ⛔ PENDENTE |

## Documentação de auditoria

Auditoria global completa em [`docs/audit_global/`](docs/audit_global/):

- `00_STATUS_EXECUCAO.md` — estado atual e bloqueios
- `10_EXECUTIVE_SUMMARY.md` — sumário executivo com veredito
- `11_PRODUCTION_DEPLOYMENT_TAREFA_A.md` — checklist auth produção
- `12_PRODUCTION_DEPLOYMENT_TAREFA_B.md` — checklist segredos e PII

Hierarquia documental completa: [`docs/INDEX.md`](docs/INDEX.md).
