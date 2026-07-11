# Política de PII e Segurança de Dados

**Data:** 2026-07-11  
**Status:** ✅ Implementado  
**Arquivo de referência:** `CLAUDE.md` (seção "Segurança & Conformidade")

---

## Resumo Executivo

Nenhum dado de cliente (PII) ou informação sensível de negócio deve ser versionado no Git. Todos os dados relacionados a clientes, agendamentos, movimentos financeiros vivem em **Supabase Postgres** (backend, SSOT) ou em cache local em `data/` (scratch, nunca commitado).

---

## O que foi feito (2026-07-11)

### Remoção do Git
- **Removido:** 15 arquivos JSON da pasta `data/`:
  - `clientes.json` — cadastros de clientes
  - `agendamentos.json`, `agendamento_eventos.json` — agenda
  - `comandos.json` — pedidos/comandos
  - `caixa_movimentos.json`, `produto_estoque_movimentos.json` — movimentos financeiros
  - `servicos.json`, `profissionais.json`, `profissional_servicos.json` — cadastros operacionais
  - `formas_pagamento.json`, `lista_espera.json`, `produtos.json`, `empresa.json`, `meta.json`
  - `data/schemas/db.contract.schema.json` — contrato de schema

- **Commit:** `eed9bd1` — "fix(security): remove PII from git index and prevent future commits"
- **Autenticação:** SSH configurada (chave RSA 4096-bit, ID `hudson_v1_pc`)

### Proteção Permanente
**.gitignore** atualizado:
```
# PII e dados sensíveis (nunca versionado)
data/*.json
data/backups/
```

---

## Regras Invioláveis

1. **Nenhum arquivo em `data/` pode ser commitado.**
   - Exceção: `data/schemas/` pode ter arquivos documentais (DDL/ERD), mas **nunca** dados vivos.

2. **Dados de negócio vivem em Supabase:**
   - Clientes, agendamentos, movimentos financeiros, etc. → Postgres (backend source of truth).
   - Frontend lê via `/api/*` (dados já filtrados/sanitizados).
   - Backend gravação = RPC atômica ou API validada.

3. **Cache local é scratch:**
   - `data/*.json` pode ser criado localmente para testes/debug.
   - **Deve ser deletado ou gitignored antes de push.**

4. **Novos JSONs de dados devem entrar em `.gitignore` imediatamente.**
   - Se você cria `data/algo_novo.json` com dados reais, adicione a padrão ao `.gitignore` **agora**.

---

## Checklist para Desenvolvedores

- [ ] Antes de adicionar um novo arquivo em `data/`: verificar se `.gitignore` cobre
- [ ] Não fazer dump de Postgres direto em JSON versionado (usar migrações ou API)
- [ ] Se testar com dados reais localmente: adicionar padrão em `.gitignore`
- [ ] Revisar commits antes de push: `git diff --cached` deve estar limpo de `.json` sensíveis
- [ ] CI/CD: nenhum segredo (.env, tokens, keys) em **nenhum** arquivo versionado

---

## Autenticação SSH (Setup 2026-07-11)

**Por quê:** GitHub não suporta autenticação por senha; SSH é o padrão seguro.

**Chave:** RSA 4096-bit, `hudson_v1_pc`  
**Fingerprint:** `SHA256:N4VsizMr93/9drM9yE84rTAKLBaDSWmCvU39UzZ6mc0`  
**Remote:** `git@github.com:hudson-f-lima/HopeOs-v1.git`

---

## Próximos Passos

- [ ] Auditoria periódica: `git log --all --name-only` para detectar JSON sensíveis se escaparem
- [ ] CI/CD gate: bloquear commits com padrões de PII (futuro — via pre-commit hook)
- [ ] Documentar política no onboarding de novos devs

---

## Referência

- **CLAUDE.md** — Seção "Segurança & Conformidade"
- **.gitignore** — Regras de proteção ativas
- **Commit `eed9bd1`** — Histórico da limpeza
