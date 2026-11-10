---
name: completar-lacuna
description: Implementar de ponta a ponta uma lacuna do HOPE OS / KortexOS que NÃO exige migration, fornecedor nem custo — motor puro, rota com RBAC, gate com controle negativo, tela na PWA por papel, E2E sob CSP, cache do service worker e documentação. Use quando o usuário pedir para "completar", "criar o que falta", "fechar lacuna", "corrigir o que está parcial" ou depois de uma auditoria/benchmark apontar itens AUSENTE/PARCIAL.
---

# Completar lacuna — HOPE OS / KortexOS

Modelo pronto: D-016 (`backend/src/engines/insights/ganhos.js`, `backend/src/routes/relatorios.js`, `backend/tests/ganhos-gate.test.js`, `js/ui/ganhos.js`, `backend/tests/e2e/ganhos.e2e.js`). Siga também a skill `steward`.

## 1. Triagem: cabe aqui?
| A lacuna precisa de… | Então |
|---|---|
| Coluna, tabela, RPC ou trigger novos | **Não cabe.** Vai para `docs/planning/INTEGRACOES_FUTURAS.md` (skill `integracao-futura`) e pergunta objetiva ao Platform Owner |
| Fornecedor, chave de API ou custo | **Não cabe.** Idem |
| Gravar dinheiro, comissão, estoque ou agenda fora das RPCs existentes | **Não cabe** |
| Só ler o que já está gravado, ou corrigir comportamento | Cabe |

Antes de escrever, confirme que não existe: `grep -rn` pelo termo em `backend/src js index.html`. Uma "lacuna" do benchmark muitas vezes já está feita com outro nome.

## 2. Ordem de construção
1. **Motor puro** em `backend/src/engines/` (sem I/O, centavos inteiros). Estorno entra no dia/mês DO estorno, nunca no da comanda.
2. **Rota** em arquivo próprio de `backend/src/routes/`, montada em `app.js` depois do `requireAuth`. Toda rota tem `authorize('<ação>')` (o Red Team RT-20 reprova rota sem guarda). Tenant só de `req.auth.empresa_id`; `empresa_id` de query ou corpo é ignorado.
3. **Papel profissional:** ação com `own: ['profissional']`; o id vem de `req.authz.profissionalId`, nunca da query. Recurso de outra empresa responde 404, não 403.
4. **Gate** `backend/tests/<nome>-gate.test.js` + script `test:<nome>` + inclusão em `test:offline` **e** `test:gate` no `package.json`.
5. **PWA:** módulo em `js/ui/`, `init<Nome>()` chamado em `js/app.js`, visibilidade por `sessionRoleIn(...)`. Todo texto vindo do servidor passa por `escapeHtml`. Sem `style=` novo se der para usar classe.
6. **Service worker:** acrescentar o arquivo em `SHELL_ASSETS` e trocar `CACHE_NAME`. Sem isso o aparelho do usuário fica com a versão antiga.
7. **E2E** `backend/tests/e2e/<nome>.e2e.js` + entrada em `CASOS` de `run-all.js`.
8. **Docs:** `DECISIONS.md` (D-xxx), `PROJECT_STATE.md`, `CHANGELOG.md`, `API_CONTRACT.md`; ADR se fechar um "desvio".

## 3. O que o gate precisa provar
- Números calculados à mão no comentário da fixture (não copie a saída do código para o `assert`).
- Isolamento: empresa B não vê A; `empresa_id` na query ignorado.
- RBAC por papel, sem token = 401, profissional sem vínculo = 403.
- Entradas inválidas = 422 com código.
- **Controle negativo:** remova a proteção, rode e veja falhar; restaure. Registre quais testes caíram.

## 4. Armadilhas já pagas
| Sintoma | Causa |
|---|---|
| Recepção ou profissional recebem 403 `NO_UNIT_ACCESS` no gate | Faltou `unidades` + `membership_units` na fixture de identidade |
| Auth Gate 8/9 local | Rode com `API_ACCESS_TOKEN=ci-dummy-token SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=ci-dummy-key` |
| RT-08 (enumeração) quebra ao adicionar cabeçalho por requisição | Cabeçalho variável precisa entrar na lista de ignorados do teste |
| E2E "passa" com `0 === 0` | O seed de desenvolvimento tem comissão 0; exija `> 0` e valores diferentes entre os casos |
| Tela nova gera 403 para outro papel | Capture respostas ≥ 400 no E2E (skill `usabilidade-pwa`) |
| CSV abre quebrado no Excel | Use `toCsv`/`centsToDecimal`/`baixarArquivo` de `js/utils.js` (BOM, `;`, vírgula decimal, proteção contra fórmula) |

## 5. Validação antes do push
```
cd backend && API_ACCESS_TOKEN=ci-dummy-token SUPABASE_URL=https://example.invalid SUPABASE_SECRET_KEY=ci-dummy-key npm run test:offline
cd .. && bash supabase/tests/check_migrations.sh
NODE_PATH=$(npm root -g) node backend/tests/e2e/run-all.js
```
Os três verdes. `git status` não pode mostrar arquivo em `supabase/migrations/`.

## 6. Entrega
O que foi feito com prova; o que ficou de fora e por quê; o que depende do dono. Não declarar "produção aprovada": gates locais não são uso real.
