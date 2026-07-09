# Automação de Seleção de Modelo de IA — Por quê NÃO foi implementada

**Data:** 2026-07-08
**Decisão:** Manual, por design
**Autoridade:** Necessidade de decisão contextual > automação cega

---

## Pergunta Original

> "Seria interessante adicionar à documentação e ao readme a sugestão dos modelos de ia? é possivel automatizar a troca de modelo conforme sugestão?"

## Respostas

### 1. Documentação ✅ (FEITO)

**Sim.** Adicionado em:

- `README.md` § "Seleção de modelo de IA (Claude Code)"
- `CLAUDE.md` § "Seleção de Modelo de IA por Fase (V1.4 e além)"
- Este documento (rationale completo)

**Formato:** Tabelas por fase com recomendações, custo estimado, comando de troca.

### 2. Automação ❌ (NÃO SERÁ FEITA)

**Não é possível automatizar de forma útil.** Razões:

#### A. Decisão é contextual, não determinística

Cada sessão pode ter requisitos diferentes:

| Cenário | Escolha | Por quê |
|---------|---------|--------|
| Orçamento apertado, 1 dia | Haiku para F2–F4 | Economizar R$ 50+ |
| Deadline crítico, 1 dia | Sonnet para F3–F4 | Qualidade > custo |
| Auditoria de segurança | Sonnet para tudo | Confiança máxima |
| Bug em produção | Haiku + Sonnet (revisão) | Rápido + seguro |

**Não há regra automática** que capte isso. Nem um hook, nem um `/model auto`, nem uma IA-que-elige-IA.

#### B. Manual é transparente e consciente

```bash
# Antes de começar F2:
/model haiku
# Prompt exibe recomendação: "F2 usa Haiku 4.5 (funções puras, spec clara)"
# Você decide se concorda
```

Isso é **melhor** que automação invisível, porque:

1. Você vê a recomendação explícita
2. Você pode sobrepor se o contexto pedir (e sabe qual é a troca de custo)
3. Não há surpresa de tokens gastos ou modelo errado

#### C. Claude Code não suporta automação de modelo

O comando `/model` é manual. Não há:

- Hooks que disparem automáticamente
- Flags `model=auto` em comandos
- Configuração "detectar fase, trocar modelo"
- MCP server que gerencie isso

**Seria possível em teoria:**
- Script que lê o arquivo em andamento, detecta `"F3"` no nome, chama `/model haiku` antes de rodar
- Hook customizado no `.claude/hooks/` que roda por evento

**Mas não é recomendado:**
- Complexidade > benefício (1 `/model` por fase já é trivial)
- Erros silenciosos (trocar modelo sem avisar é pior que pedir ao usuário)
- Não generaliza (próximas fases/projetos teriam lógica diferente)

---

## Padrão Recomendado: Manual Explícito

### Antes de começar cada fase

1. Leia a recomendação em `CLAUDE.md` § tabela
2. Considere o contexto (orçamento, prazo, risco)
3. Execute:
   ```bash
   /model haiku     # ou /model sonnet conforme decisão
   ```
4. Prompt do AI exibirá o modelo ativo

### Se quiser rastreamento

Deixe comentário no commit:
```bash
git commit -m "feat(f2): retention backend

Model: Haiku 4.5 (determinístico, spec clara)
Budget: ~R$ 15 em créditos
"
```

Isso fica no `git log` e futuros colaboradores veem a decisão.

---

## Decisão de Design

**Manual > Automático** neste caso porque:

| Dimensão | Manual | Automático |
|----------|--------|-----------|
| Transparência | ✅ Sempre claro | ❌ Pode surpreender |
| Flexibilidade | ✅ Sobrepõe quando needed | ❌ Preso à regra |
| Manutenibilidade | ✅ Fácil ler a recomendação | ❌ Código + docs duplos |
| Erro | ⚠️ Humano escolhe errado | ⚠️ Máquina escolhe errado (silencioso) |

**Precedente:** Mesma filosofia da regra "backend é a verdade única" — explicitação vs magia.

---

## Próximas Fases: Revisitar?

Se em F5 houver:
- Múltiplos projetos rodando em paralelo (KortexOS vai ficar multinúcleo?)
- Transições de fase automáticas (pipeline CI/CD)
- Limites de orçamento hard (US$ X, depois stop)

...aí sim considerar automação. Por enquanto: **manual é certo**.

---

## Resumo para Próximas Sessões

✅ **Documentação:** README + CLAUDE.md  
✅ **Guia visual:** Tabela de fases + modelos + custo  
✅ **Comando:** `/model haiku` ou `/model sonnet`  
✅ **Decisão:** Manual por fase, consciente, documentável  

Não há automação porque decisão é contextual. Ler a recomendação, considerar, digitar `/model X` leva 5 segundos — overhead zero vs complexidade de automação.
