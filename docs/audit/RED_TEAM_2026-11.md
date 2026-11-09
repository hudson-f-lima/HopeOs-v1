# Red Team 2026-11 — agendamento online, estorno, auth e PWA

- **Data:** 2026-11-09. **Base:** `main` 2e14226 (PR #18: migration 009, D-013, D-014).
- **Escopo:** `/api/public/*` e `agendar.html`; estorno de comanda (rotas, `EstornoEngine`, espelho em memória, SQL da 009); RBAC de todas as rotas, rate limit, CORS, logs; renderização de nomes na PWA interna.
- **Método:** cada hipótese virou um teste executável em `backend/tests/redteam-gate.test.js` (`npm run test:redteam`, dentro de `test:offline` e `test:gate`). Primeiro o teste rodou contra a `main` e **falhou** (prova do achado); depois veio a correção e o teste passou. Controles negativos (`NR-*`) recompilam o módulo sem a proteção e mostram o ataque passando.
- **Fora do alcance desta sessão:** banco real, Render e a hospedagem do frontend (sem acesso, sem SQL remoto). O que depende disso está marcado como `DESCONHECIDO`.
- **Como repetir:** skill `.claude/skills/red-team/SKILL.md`.

## 1. Achados

Classificação conforme `AGENTS.md`. "Prova" = teste que falhou na `main` 2e14226. Saída da rodada antes das correções: 12/26 verdes.

| ID | Superfície | Achado | Classe | Prova | Estado |
|---|---|---|---|---|---|
| RT-01 | Público | Rate limit por IP com chave = IP inteiro: girar o IPv6 dentro do próprio /64 (um provedor entrega 2^64 endereços a um cliente) zera o limite. `::ffff:a.b.c.d` e `a.b.c.d` eram chaves diferentes | REAL | RT-01: `[422,422,422,422]` em vez de `[…,429]` | Corrigido |
| RT-21 | Login | Teto de memória do rate limit (`> 10 000 chaves → clear()`): do **mesmo IP**, girando e-mails (cada um vira chave nova), o atacante zera o limite da conta-alvo e volta a chutar senha. O mesmo `clear()` existia no público | CRÍTICO | RT-21: alvo voltou a receber 401 (tentativa aceita) depois do spray, em vez de 429 | Corrigido |
| RT-12 | PWA | `FuzzyField` (busca de cliente, serviço, produto, profissional e forma de pagamento) punha o rótulo em `innerHTML` **sem escape**, em atributo e em texto. Nome de cliente é texto livre para a recepção e para integrações com `clientes:write`. Recepção → XSS na sessão do admin → token no `localStorage` | CRÍTICO onde não há CSP (GitHub Pages); PARCIAL no Render (a CSP `script-src 'self'` barra handler inline, mas não a injeção de HTML) | RT-12: `<img src=x onerror=…>` virou tag | Corrigido |
| RT-13 | PWA | Varredura de toda interpolação `${…}` de campo livre em HTML: nome do profissional no diálogo de conflito da agenda (`agenda.js`), ícone e código da forma de pagamento (`cadastros.js`), rótulo de status com fallback do banco (`agenda.js`) sem `escapeHtml` | REAL (entrada de gestão) | RT-13 listou as linhas | Corrigido |
| RT-11a | PWA | `?apiBase=` aceito em qualquer host: `index.html?apiBase=https://atacante/api` mostra a tela de login legítima e manda e-mail e senha para o atacante; `agendar.html?s=…&apiBase=…` colhe nome e WhatsApp de clientes. No Render a CSP `connect-src` barra; no GitHub Pages (origem ainda liberada no CORS da API) nada barrava | CRÍTICO fora do Render; PARCIAL no Render | RT-11: `agendar.js não usa api-base.js` | Corrigido: override só com a página em host local (`js/api-base.js`) |
| RT-11b | Público | `agendar.html` sem CSP própria: fora do Render (sem o header do `render.yaml`) a página pública não tinha CSP | PARCIAL | RT-11 | Corrigido: `<meta http-equiv="Content-Security-Policy">` |
| RT-11c | LGPD | Aviso curto da página sem base legal, retenção, operador, dados coletados de fato (IP truncado, data do aceite) | PARCIAL | RT-11 | Texto alinhado; modelo em `docs/planning/AVISO_PRIVACIDADE_AGENDAMENTO_DRAFT.md` (a validar juridicamente) |
| RT-02 | Público | Celular escrito sem o 9º dígito (`(21) 9876-5432`) era outro número: dobrava o limite por número, furava o limite de 2 futuros e criava cadastro duplicado | REAL | RT-02: 3º futuro → 201 e cliente novo | Corrigido (`chaveNumero`) |
| RT-03 | Público | Número com dois cadastros ativos ("ambíguo"): limite de futuros e régua olhavam só o cadastro mais antigo | REAL | RT-03: 201 com DUP2 já tendo 2 futuros | Corrigido (histórico de todos os ativos do número) |
| RT-10 | Logs | Erro interno do agendamento ia inteiro para o log (`console.error(err)`): mensagem/`detail` do Postgres repetem a linha (WhatsApp, nome) | REAL | RT-10: log continha `5521943218765` e `Fulana` | Corrigido (`erroParaLog`: código + mensagem mascarada) |
| RT-14 | Estorno (memória) | O espelho em memória da RPC dizia "não há await entre ler o saldo e gravar", mas há: dois parciais simultâneos do último item gravavam os dois (Σ estornado > vendido). Só afeta gates offline e dev (a RPC tem `pg_advisory_xact_lock`), mas um gate que passa por sorte não prova nada | PARCIAL (fidelidade de teste) | NR-03: mutante sem a fila grava 2; RT-14 falhava pelo repositório | Corrigido (fila por empresa+comanda) |
| RT-20 | Auth | O C05 (identity-gate) só olhava `routes/index.js` por texto; admin, onboarding, estrutura, caixa e piloto não eram verificados e um router novo montado antes do `requireAuth` passaria | PARCIAL (cobertura) | RT-20 sem o marcador | Coberto: inventário de **todos** os routers pelo `app._router` + `authorize()` marcado (`rbacAction`) |
| RT-22 | PWA | `?apiToken=` (token legado) ficava na barra de endereço: histórico, print, link compartilhado | PARCIAL | RT-22 | Corrigido: `history.replaceState` remove o parâmetro |
| RT-23 | Público | Oráculo de recusa: só número já conhecido (2 futuros, faltas, cadastro inativo) recebe `AGENDAMENTO_ONLINE_INDISPONIVEL`; número novo nunca recebe | PARCIAL (inerente ao desenho) | — | Mitigado pelo limite por número (5/h) e mensagem única; aceitar ou exigir verificação do número (decisão) |
| RT-24 | Público | Tempo de resposta número novo × conhecido | DESCONHECIDO | memória não modela latência | Medir em produção (1 consulta em cada ramo: `list agendamentos` × `insert clientes`) |
| RT-25 | Público | `trust proxy 1`: a chave de rate limit é o último `X-Forwarded-For`. Exposta sem proxy, a API aceita IP forjado; atrás de mais de um proxy (CDN + Render) todos os clientes podem virar o mesmo IP | DESCONHECIDO (depende do Render) | RT-01 usa o header para simular o proxy | Verificar no ar (ver §4) |
| RT-26 | Público | Dedup e limite de futuros serializados só dentro de uma instância; teto diário depende do evento best-effort | PARCIAL | já registrado em D-014 | Exige migration (índice único de WhatsApp normalizado / RPC com lock) — BLOQUEADO |
| RT-27 | Público | Spam com número de terceiro (sem verificação) e "envenenar a régua" com `no_show` | PARCIAL | já registrado no draft §8 | Decisão do Platform Owner (draft §10, itens 6 e 8) |
| RT-28 | CORS | `CORS_ORIGIN` padrão inclui `null`; `localhost` e IPs de LAN aceitos também em produção | PARCIAL (baixo: a auth é Bearer, não cookie) | RT-22 confirma que origens parecidas não passam | Proposta: em produção, `CORS_ORIGIN` explícito sem `null` |
| RT-29 | Logs | Handler global `console.error(err)` (rotas internas) grava o erro inteiro, com `detail` do banco | PARCIAL | inspeção | Proposta: mesmo `erroParaLog` no handler global (fora do escopo desta rodada para não mudar logs operacionais) |
| RT-30 | PWA | `index.html` sem CSP própria; a CSP só existe no header do Render | PARCIAL | inspeção | Proposta: desligar o GitHub Pages ou replicar a CSP em `<meta>` (cuidado com o fluxo de LAN) |

Sem achado (o ataque falhou e virou regressão):

| Teste | Tentativa |
|---|---|
| RT-04 | Nome com HTML, aspas, controle bidi (U+202E), zero-width, emoji, `javascript:`: 422. Só o apóstrofo passa, e `escapeHtml` o escapa |
| RT-05 | `__proto__`, `constructor`, campos extras, tipos trocados, array no corpo, `text/plain` (CSRF sem preflight): 400/422, nada grava, protótipo intacto |
| RT-06 | 30/02, mês 13, ISO com hora, ano estendido, dígitos não ASCII, `24:00`, segundos, 29/02/2026: 422 |
| RT-07 | Encaixe fora da grade + buffer de 15 min: horários colados não são ofertados nem aceitos |
| RT-08 | Número novo × conhecido: mesmo status, corpo e headers (fora `date`/`etag`/`content-length`); nome nunca volta |
| RT-09 | 200/404/422/400/413/429 públicos com `Cache-Control: no-store` e `nosniff`; preflight de origem estranha sem `Access-Control-Allow-Origin` |
| RT-15/16 | Centavos: parciais 1 a 1 em 3 itens ímpares com comissão fracionária e 2000 sequências aleatórias: Σ estornado = original exato (valor, comissão, custo), nunca acima |
| RT-17 | Idempotência: chave reaproveitada em outra comanda ou com outro motivo → 409; mesma chave em outra empresa é independente; IDOR entre empresas (com e sem `X-Empresa-Id`) → 403/404 |
| RT-18 | Admin em B e recepção em A não estorna em A; gestor rebaixado perde o acesso na requisição seguinte |
| RT-19 | Prazo de 30 dias na virada do fuso: 01/12 23:59 de Brasília (02:59 UTC de 02/12) estorna, com data e caixa negativo em 01/12; 00:01 de 02/12 → 422 |

Leitura da SQL da 009 (sem execução): o `pg_advisory_xact_lock` por empresa+comanda vem antes da leitura de idempotência e de saldo; o corte proporcional é `bigint * q / Q` truncado e o último estorno do item leva o resto (`greatest(original − anterior, 0)`), o mesmo do `EstornoEngine` (RT-16 cobre). Corrida da mesma chave em comandas diferentes cai no `unique (empresa_id, idempotency_key)` e vira 409 (`mapEstornoError`). Divergência cosmética: quantidade com 7+ dígitos dá `ESTORNO_PAYLOAD_INVALIDO` na RPC e `ESTORNO_EXCEDE` em memória.

## 2. Correções (todas sem migration, sem dependência nova)

| Arquivo | Mudança |
|---|---|
| `backend/src/security/rateLimit.js` (novo) | Limitador compartilhado: teto de memória descarta expiradas → não bloqueadas (menos recentes) → só então bloqueadas; `chaveIp` com IPv6 por /64 e IPv4-mapeado |
| `backend/src/routes/auth.js`, `backend/src/config/env.js` | Login/recuperação usam o limitador; novo limite **por IP** `LOGIN_RATE_LIMIT_IP_MAX` (padrão 50 por janela) |
| `backend/src/routes/publicBooking.js` | Limitador + `chaveIp`; `chaveNumero` (celular sem o 9); futuros/régua sobre todos os cadastros ativos do número; `erroParaLog` |
| `backend/src/auth/rbac.js` | `authorize()` marca a guarda com `rbacAction` (inventário do RT-20) |
| `backend/src/dev/memoryBackend.js` | Fila por empresa+comanda no espelho da RPC de estorno |
| `js/components/fuzzy-field.js`, `js/ui/agenda.js`, `js/ui/cadastros.js` | `escapeHtml` em rótulo/valor do FuzzyField, nome do profissional, status, ícone e código da forma |
| `js/api-base.js` (novo), `js/api.js`, `js/agendar.js` | `?apiBase=` só com a página em host local; `?apiToken=` sai da URL |
| `agendar.html` | CSP em `<meta>`; aviso curto com controlador, operador, dados, finalidade, base legal, retenção e direitos |
| `service-worker.js` | `CACHE_NAME` novo e `js/api-base.js` no shell |

Validação: `test:offline` verde (17 suítes, `Red Team Gate: 26/26`); `node backend/tests/e2e/run-all.js` 12/12 (rodado em namespace de rede próprio porque 5599 estava ocupada por outro processo). Gate integrado e `supabase/tests/run.sh`: não rodados nesta sessão (DESCONHECIDO).

## 3. Veredito por superfície

| Superfície | Veredito |
|---|---|
| Agendamento online (`/api/public/*`, `agendar.html`) | **Pode ser ligado no piloto (1 salão, 1 instância) depois das condições do §4.** Sem achado CRÍTICO aberto no código; o que resta é PARCIAL conhecido (memória por instância, sem verificação de número) ou DESCONHECIDO de infraestrutura |
| Estorno | Aprovado no código e no espelho em memória. A garantia de concorrência real é a RPC (CI `supabase/tests/run.sh`, não rodado aqui) |
| Auth/RBAC | Todas as 87 rotas do app têm `authorize()` ou estão na lista explícita de sessão/pública (RT-20). Rate limit de login corrigido; continua PARCIAL (memória) |
| PWA interna | XSS por nome fechado no código; a CSP do Render segue como segunda barreira. Fora do Render (GitHub Pages) não há CSP no `index.html` (RT-30) |
| Multi-tenant | Continua **não** declarado seguro (`AGENTS.md`); este Red Team foi offline, não em produção |

## 4. Condições para ligar o agendamento online
1. Estas correções publicadas no backend e na PWA (o `CACHE_NAME` novo força a atualização).
2. Aviso de privacidade validado pelo jurídico e aprovado pelo salão (controlador); `PUBLIC_BOOKING_AVISO_VERSAO` com a versão aprovada.
3. Uma instância só no Render (rate limit e serialização em memória), ou aceitar formalmente a lacuna RT-26.
4. Conferir uma vez no ar que `req.ip` é o IP do cliente (RT-25): duas requisições de redes diferentes não podem cair na mesma chave, e `X-Forwarded-For` mandado pelo cliente não pode trocar a chave. Se o Render tiver mais de um salto, ajustar `trust proxy`.
5. Decisões do draft §10 registradas (spam sem verificação, `no_show` online na régua).
6. Frontend público servido pelo Render (CSP no header) — a página pública já tem CSP própria, então GitHub Pages também serve, mas o `index.html` lá continua sem CSP (RT-30).

## 5. O que exige migration ou decisão
- **Migration (BLOQUEADO, 010+ não autorizada):** índice/coluna de WhatsApp normalizado com unicidade parcial e RPC de agendamento público com lock (RT-26); rate limit compartilhado (tabela) se houver mais de uma instância.
- **Decisão:** verificação do número (OTP por WhatsApp = fornecedor) ou captcha; `no_show` de online não confirmado na régua; `CORS_ORIGIN` de produção sem `null` (RT-28); destino do GitHub Pages (RT-30); `erroParaLog` no handler global (RT-29).
