# Red Team em produção — C1 (agendamento online por salão, D-037)

Data: 2026-11-16, 00:18–00:25 UTC. Alvos:
- API `https://hopeos-v1.onrender.com/api`;
- PWA `https://hudson-f-lima.github.io/HopeOs-v1/`;
- banco `hopeos-v1`.

Escopo: superfície pública `/api/public/agendar/*` e configuração `/api/empresa/agendamento-online`.

Restrições desta rodada:
- só sondas sem gravação e slugs inexistentes;
- leitura do histórico de migrations, do esquema e do log da API do Supabase;
- nenhum agendamento, cliente ou SQL de escrita em produção.

O link **está desligado em produção**: nenhuma empresa com `online_slug`, `online_ativo = false`. Esta rodada cobre a fase "link desligado"; a fase "link ligado" está na seção 4.

## 1. O que está publicado (evidência)
| Item | Evidência | Classe |
|---|---|---|
| Migration 016 aplicada | `list_migrations` mostra `016 agendamento_online_config`. Em `empresas`: 8 colunas com os padrões esperados, 4 constraints e o índice `ux_empresas_online_slug`. 1 empresa, 0 com slug, 0 ligadas | REAL |
| Backend com o código da C1 | Log do PostgREST: para cada slug sondado, uma consulta `empresas?select=id,online_ativo&online_slug=eq.<slug>&limit=1` vinda do backend. O código anterior não consulta o banco | REAL |
| PWA com a C1 | `index.html` com `subtabBtnOnline`; `CACHE_NAME = hope-os-shell-v1-32-0-link-online`; `agendar.html` e `js/agendar.js` publicados iguais ao repositório | REAL |

## 2. Achados
| ID | Superfície | Achado (como explorar, impacto) | Classe | Prova | Estado |
|---|---|---|---|---|---|
| RTP-01 | Público | **O limite por IP não segura um cliente que troca de IPv4.** 66 GETs em cerca de 40 s, com slugs inventados, deram 0 respostas 429 (localmente, o mesmo código dá 429 a partir da 61ª). O IP de saída desta sonda trocava a cada requisição dentro de 160.79.106.0/24 (6 consultas, 6 IPs), e o limitador conta IPv4 por endereço. Impacto: cada slug inventado custa uma consulta indexada ao banco (1 para 1, sem amplificação), e um atacante com um bloco de IPs passa dos 60/min. Não vaza dado. A gravação tem barreiras que não dependem do IP: 5 POSTs por número por hora, teto diário do salão, máximo de futuros por número e revalidação do horário | PARCIAL (custo/DoS, sem dado) | sonda P8 + log do PostgREST + `api.ipify.org` × 6; `RT-31` falhava na base (`404,404,404,404,404,404`) | Corrigido no código (opção 1, aprovada pelo dono): o limitador público conta IPv4 por /24 (`chaveIpPublico`); o login segue por endereço. `RT-31` e controle negativo `NR-31`. Vale em produção depois do merge e do deploy |
| RTP-02 | Público | `X-Forwarded-For` forjado não muda a chave do limite: 66 GETs com `X-Forwarded-For: 203.0.113.7` fixo deram 0 respostas 429 (o app não usa o IP informado pelo cliente) | Proteção REAL | sonda | OK |
| RTP-03 | Público | Slug inexistente e variantes, em GET, em `slots` com `profissionalId=qualquer` e em outro caminho público: 404 idêntico com `Cache-Control: no-store`. Variantes testadas: maiúsculas, `..%2F`, `constructor`, uuid, 2 letras, 70 letras, `qualquer`. `__proto__` (403) e `%00` (400) são barrados pelo Cloudflare do Render antes do app, com qualquer slug: não revelam se um salão existe | Proteção REAL | sondas P2–P4 + comparação com o app local (404 nos dois) | OK |
| RTP-04 | Público | O corpo não é lido antes de resolver um salão ligado: JSON malformado e corpo de 20 kB em slug inexistente → 404 (nem 400 nem 413) | Proteção REAL | sondas P1, P9 | OK |
| RTP-05 | Admin | `GET`/`PATCH /api/empresa/agendamento-online` sem credencial, com JWT falso ou com o token legado `dev` → 401 | Proteção REAL | sonda P5 | OK |
| RTP-06 | CORS | Origem estranha e sufixo (`…github.io.evil.example`) não recebem `Access-Control-Allow-Origin`, nem na rota pública nem na do admin. `localhost` continua liberado por código (WARN já conhecido) | Proteção REAL / WARN pré-existente | sonda P6 + `smoke.js` | OK |
| RTP-07 | PWA | No GitHub Pages, `index.html` sai sem CSP nem headers de segurança (RT-30, já registrado). A aba nova "Link online" passa todo dado por `escapeHtml` (o scanner RT-13 cobre). `agendar.html` tem CSP própria em `<meta>`. Sem `frame-ancestors`, a página pode ser emoldurada (clique-sequestro de baixo impacto: o cliente precisa digitar nome e número) | PARCIAL pré-existente | `smoke.js` (`pwa.csp` FAIL, `pwa.headers` FAIL) | Proposta antiga: servir a PWA pelo static do Render |

Nenhum achado CRÍTICO ou ALTO na fase "link desligado".

## 3. Decisão do RTP-01 (aprovada pelo dono em 2026-11-16: opção 1)
Opções, da mais simples para a mais completa:
1. **Contar IPv4 por /24 só no limitador público** (o IPv6 já conta por /64). É simples e barato. Risco: clientes da mesma operadora no mesmo /24 dividem os 60 GETs/min e os 10 POSTs/h. Para um salão, é improvável chegar perto disso.
2. **Orçamento global de consultas de slug desconhecido por instância.** Limita o custo no banco seja qual for o número de IPs. Risco: durante um ataque, um salão real fora do cache também pode receber 404.
3. **Deixar como está.** O custo por requisição é uma consulta indexada, e a gravação já tem limites independentes do IP.

Recomendação: **opção 1**. Fecha o caminho com uma linha de código, mantém o limite por pessoa e não derruba salões legítimos. Precisa de teste com controle negativo e de merge.

## 4. Fase "link ligado" — não testada (DESCONHECIDO)
Só dá para testar com um salão ligado e gravações reais. Itens:
- resolução de um slug ligado e 404 imediato ao desligar (cache de 30 s por instância);
- catálogo com o override real (preço e duração) e o "preço oculto";
- "sem preferência" com a agenda real;
- POST real, que cria cliente e agendamento:
  - evento de origem com `fonte_link = banco`, `aviso_hash` e **`ip_truncado`** (é o único jeito de ver qual IP o app enxerga atrás do Cloudflare);
- limite por número, máximo de futuros, teto diário e régua de faltas;
- corrida de dois POSTs no mesmo horário;
- aviso de privacidade com a razão social, o CNPJ e o contato reais.

Pré-requisitos (aprovados pelo dono em 2026-11-16; falta ligar o link):
1. Ligar o link em Conta → Link online (endereço, razão social, contato de privacidade). Sugestão: antecedência 0 e janela 30 dias só durante o teste.
2. Autorizar até 6 agendamentos de teste numa data futura combinada, com nome "Teste Red Team" e um número de WhatsApp de teste do próprio dono.
3. Limpar depois pela agenda (cancelar) e inativar o cliente de teste, ou autorizar a limpeza por SQL.

## 5. Veredito
- **C1 em produção com o link desligado: aprovada.** Nenhum crítico ou alto. O RTP-01 foi corrigido no código e vale depois do merge e do deploy.
- **C1 com o link ligado: ainda não aprovada.** A fase da seção 4 falta.
