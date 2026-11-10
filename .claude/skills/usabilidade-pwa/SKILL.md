---
name: usabilidade-pwa
description: Passada de usabilidade na PWA do HOPE OS / KortexOS por papel (admin, gestão, recepção, profissional) em tela de celular — erros 4xx/5xx silenciosos, abas que o papel não pode usar, estados vazios, mensagens fora do português, carregamento e erro. Use quando o usuário pedir "usabilidade", "experiência", "testar a tela", "polir o app", "usabilidade máxima" ou depois de adicionar tela nova.
---

# Usabilidade da PWA — HOPE OS / KortexOS

Ferramenta: os E2E de `backend/tests/e2e/` (Playwright, 390×844, CSP de produção). Modelo: `ganhos.e2e.js`.

## 1. Regra de ouro
Usabilidade aqui é **medida**, não opinada. Cada achado vira uma checagem no E2E que falha antes da correção.

## 2. Checagens por papel (admin, recepção, profissional)
Entre com cada conta do seed (`admin@dev.local`, `recepcao@dev.local`, `profissional@dev.local`, senha `dev12345`) e percorra Agenda, Checkout, Dashboard e Gestão.

| Checagem | Como medir |
|---|---|
| Nenhuma resposta ≥ 400 ao abrir e navegar | `p.on('response', r => { if (r.status() >= 400) erros.push(...) })` — o runner reprova lista não vazia |
| Nenhum erro de página nem violação de CSP | `p.on('pageerror')`; roteiro `csp` |
| O papel só vê o que pode usar | Botão e aba escondidos por `sessionRoleIn`; o backend continua negando (403) |
| Estado vazio explica o que fazer | Texto em `.empty-state`, nunca área em branco |
| Erro diz o que aconteceu, em português | Mensagem do backend em pt-BR; nada de "updated", "Error", código cru |
| Carregamento visível | Ação com rede mostra "Gerando…/Carregando…" e desabilita o botão |
| Valor da tela = valor do banco | Compare `data-*` da tela com `GET /__db/<tabela>` do dev-memory-api |
| Toque | Alvos com pelo menos 44 px; nada depende de hover |
| Dinheiro | Sempre `centsToBRL`; entrada aceita "75,50" e "75.50" |

## 3. Onde os defeitos costumam estar
- Chamada feita para todos os papéis no carregamento (`init*`, `renderList*`) que só a operação pode fazer.
- Aba de Gestão visível para quem recebe 403 ao abrir.
- `catch` que engole o erro e deixa a tela vazia.
- Arquivo JS novo fora do `SHELL_ASSETS` do service worker (funciona no teste, quebra no aparelho instalado).
- Texto de formulário só como `placeholder` (some ao digitar): use `<label>`.

## 4. O que o E2E não vê
Diga isso na entrega; não trate como verificado:
- aparelho real (teclado cobrindo campo, instalação na tela inicial, rede 4G);
- serviço do Render acordando (primeira chamada lenta);
- leitura por leitor de tela;
- o que o dono do salão entende do texto.

O teste que fecha essas lacunas é o dono usando no celular com dado real.

## 5. Limites
- Não mudar regra de negócio para "melhorar a experiência": o backend é a fonte da verdade.
- Não esconder erro do servidor; mostre a mensagem e, em 5xx, o código `X-Request-Id`.
- Não acrescentar biblioteca nem CDN (a CSP não permite e o app é vanilla JS).
