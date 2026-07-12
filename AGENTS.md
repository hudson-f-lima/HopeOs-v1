# AGENTS.md

Manifesto permanente para agentes de IA. Leia antes de qualquer tarefa.

## Ordem de leitura

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/INDEX.md`
4. `docs/PROJECT_STATE.md`
5. auditorias e documentos canônicos somente quando a tarefa exigir

O estado atual e o handoff vivem exclusivamente em `docs/PROJECT_STATE.md`. Este manifesto não mantém diário de progresso.

## Bloqueios permanentes

- Não avançar para V1.5.
- Não criar migrations 007+ nem tocar 001–006.
- Não implementar escala global, novas features ou regras de negócio.
- Não tratar `API_ACCESS_TOKEN` como autenticação final.
- Não declarar multi-tenant seguro.
- Não usar `empresa_id` vindo de body/query como verdade.

## Regras de segurança e arquitetura

- Backend é a única fonte de verdade para preço, comissão, saldo, estoque, agenda e financeiro.
- `service_role` nunca é exposto ao frontend.
- Não criar SQL executável sem autorização explícita do Platform Owner.
- Não criar documentos paralelos `*_REVISED`, `copy`, `final`, patch/delta/adendo.
- Não declarar documento aprovado sem Red Team real registrado.
- Nunca comprimir ou sobrescrever auditorias, prompts históricos ou evidências do Owner.

## Classificação obrigatória

Todo achado deve ser classificado como `REAL`, `PARCIAL`, `MOCKADO`, `HARDCODED`, `CRÍTICO`, `BLOQUEADO`, `DESCONHECIDO`, `OBSOLETO` ou `CONTRADITÓRIO`.

## Migrações e documentação

- Fundação física: `supabase/migrations/001–006`.
- Faixa 007+ é futura e não autorizada; 046–060 é obsoleta.
- Correções documentais são in-place e entram no índice.
- SQL draft só em Markdown com `DRAFT ONLY`.

## Formato obrigatório ao alterar arquivos

```text
FILES_CHANGED:
- <paths com natureza da mudança>
BLOCKERS_REMAINING:
- <o que segue bloqueado/pendente>
VEREDITO:
- <status geral + próximo passo>
```
