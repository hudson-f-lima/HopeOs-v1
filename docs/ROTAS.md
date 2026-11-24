# Rotas da API (gerado do código)

> **Arquivo gerado. Não edite à mão.** Regenere depois de mudar qualquer rota:
> `node backend/scripts/docs/gerar-indice-rotas.js > docs/ROTAS.md`

Este índice lista **todas** as rotas registradas no Express, com a permissão que cada uma exige (`authorize`). O significado de cada permissão e quem a recebe está em [`PERMISSOES.md`](PERMISSOES.md). O formato das respostas e os erros estão em [`API_CONTRACT.md`](API_CONTRACT.md).

- **Permissão `—`:** a rota não usa `authorize`. São as rotas de saúde, de login e as **públicas** (`/api/public/*`), que usam outra credencial (limite por IP, link ou código do cliente). A lista de exceções é verificada pelo Red Team RT-20.
- Rotas depois do `requireAuth` exigem JWT de usuário, credencial de integração ou o token legado (desligado em produção).
- Permissão com `:` e rótulo (ex.: `agenda:status`) é uma ação RBAC; a permissão efetiva por papel está na matriz.

Total: **165 rotas**.

## admin

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/admin/auth-metrics` | `admin` | autenticado |
| GET | `/api/admin/integrations` | `admin` | autenticado |
| POST | `/api/admin/integrations` | `admin` | autenticado |
| PATCH | `/api/admin/integrations/:id` | `admin` | autenticado |
| GET | `/api/admin/integrations/:id/audit` | `admin` | autenticado |
| POST | `/api/admin/integrations/:id/credentials` | `admin` | autenticado |
| POST | `/api/admin/integrations/:id/credentials/:credentialId/revoke` | `admin` | autenticado |
| POST | `/api/admin/invites` | `admin` | autenticado |
| GET | `/api/admin/memberships` | `admin` | autenticado |
| POST | `/api/admin/memberships` | `admin` | autenticado |
| PATCH | `/api/admin/memberships/:id` | `admin` | autenticado |
| GET | `/api/admin/unidades` | `admin` | autenticado |
| POST | `/api/admin/unidades` | `admin` | autenticado |
| PATCH | `/api/admin/unidades/:id` | `admin` | autenticado |

## agenda

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/agenda` | `agenda:ver` | autenticado |
| POST | `/api/agenda` | `agenda:criar` | autenticado |
| PATCH | `/api/agenda/:id/duracao` | `agenda:editar` | autenticado |
| GET | `/api/agenda/:id/historico` | `agenda:ver` | autenticado |
| POST | `/api/agenda/:id/link-cliente` | `agenda:lembretes` | autenticado |
| PATCH | `/api/agenda/:id/status` | `agenda:atender|agenda:cancelar|agenda:editar` | autenticado |
| POST | `/api/agenda/:id/trocar-cliente` | `agenda:editar` | autenticado |
| POST | `/api/agenda/atendimentos` | `agenda:criar` | autenticado |
| GET | `/api/agenda/atendimentos/:grupoId` | `agenda:ver` | autenticado |
| POST | `/api/agenda/atendimentos/:grupoId/cancelar` | `agenda:cancelar` | autenticado |
| POST | `/api/agenda/combinacoes` | `agenda:ver` | autenticado |
| GET | `/api/agenda/lembretes` | `agenda:ver` | autenticado |
| GET | `/api/agenda/online-novos` | `agenda:ver` | autenticado |
| POST | `/api/agenda/series` | `agenda:recorrencia` | autenticado |
| GET | `/api/agenda/series/:id` | `agenda:ver` | autenticado |
| POST | `/api/agenda/series/:id/alterar` | `agenda:editar` | autenticado |
| POST | `/api/agenda/series/:id/cancelar` | `agenda:cancelar` | autenticado |
| POST | `/api/agenda/series/previa` | `agenda:recorrencia` | autenticado |
| GET | `/api/agenda/slots` | `agenda:ver` | autenticado |

## assinaturas

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/assinaturas` | `assinatura:ver` | autenticado |
| POST | `/api/assinaturas` | `assinatura:vender` | autenticado |
| GET | `/api/assinaturas/:id` | `assinatura:ver` | autenticado |
| POST | `/api/assinaturas/:id/cancelar` | `assinatura:gerir` | autenticado |
| POST | `/api/assinaturas/:id/pagar` | `assinatura:vender` | autenticado |
| POST | `/api/assinaturas/:id/pausar` | `assinatura:gerir` | autenticado |
| POST | `/api/assinaturas/:id/retomar` | `assinatura:gerir` | autenticado |
| GET | `/api/assinaturas/cobertura` | `assinatura:ver` | autenticado |
| GET | `/api/assinaturas/planos` | `assinatura:ver` | autenticado |
| POST | `/api/assinaturas/planos` | `planos:editar` | autenticado |
| GET | `/api/assinaturas/planos/:id` | `assinatura:ver` | autenticado |
| PUT | `/api/assinaturas/planos/:id` | `planos:editar` | autenticado |
| POST | `/api/assinaturas/planos/:id/arquivar` | `planos:editar` | autenticado |
| POST | `/api/assinaturas/planos/:id/simular` | `assinatura:ver` | autenticado |
| GET | `/api/assinaturas/relatorio` | `painel:financeiro` | autenticado |

## auth

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/auth/config` | — | aberto |
| POST | `/api/auth/login` | — | aberto |
| POST | `/api/auth/logout` | — | aberto |
| POST | `/api/auth/password` | — | aberto |
| POST | `/api/auth/privacidade/aceite` | — | aberto |
| POST | `/api/auth/recover` | — | aberto |
| POST | `/api/auth/refresh` | — | aberto |

## caixa

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| POST | `/api/caixa/ajustes` | `caixa:movimentar` | autenticado |
| GET | `/api/caixa/fechamento` | `caixa:conferir` | autenticado |
| POST | `/api/caixa/fechamentos` | `caixa:fechar` | autenticado |

## cargos

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/cargos` | `cadastros:ver` | autenticado |
| POST | `/api/cargos` | `catalogo:editar` | autenticado |
| PATCH | `/api/cargos/:id` | `catalogo:editar` | autenticado |

## catalog

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/catalog` | `clientes:ver` + `cadastros:ver` | autenticado |

## categorias

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/categorias` | `cadastros:ver` | autenticado |
| POST | `/api/categorias` | `catalogo:editar` | autenticado |
| PATCH | `/api/categorias/:id` | `catalogo:editar` | autenticado |

## checkout

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| POST | `/api/checkout/close` | `comanda:fechar` | autenticado |
| POST | `/api/checkout/comandas/:id/reconciliar-agenda` | `comanda:fechar` | autenticado |
| GET | `/api/checkout/mais-vendidos` | `comanda:fechar` | autenticado |
| POST | `/api/checkout/preview` | `comanda:fechar` | autenticado |

## clientes

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/clientes` | `clientes:ver` | autenticado |
| POST | `/api/clientes` | `clientes:criar` | autenticado |
| PATCH | `/api/clientes/:id` | `clientes:editar` | autenticado |

## cockpit

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/cockpit` | `painel:financeiro` | autenticado |
| GET | `/api/cockpit/desempenho` | `painel:financeiro` | autenticado |

## comandas

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/comandas` | `comanda:historico` | autenticado |
| POST | `/api/comandas/:id/estorno` | `comanda:estornar` | autenticado |
| GET | `/api/comandas/:id/estornos` | `comanda:historico` | autenticado |

## comissoes

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/comissoes/pagamentos` | `ganhos:ver` | autenticado |
| POST | `/api/comissoes/pagamentos` | `comissoes:pagar` | autenticado |
| POST | `/api/comissoes/pagamentos/:id/estorno` | `comissoes:pagar` | autenticado |

## dashboard

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/dashboard` | `painel:operacional` | autenticado |

## data-contract

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/data-contract` | `cadastros:ver` | autenticado |

## desempenho

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/desempenho/profissional` | `desempenho:ver` | autenticado |

## disponibilidade

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/disponibilidade` | `escala:ver` | autenticado |
| GET | `/api/disponibilidade/bloqueios/historico` | `escala:ver` | autenticado |
| GET | `/api/disponibilidade/cadeia` | `escala:ver` | autenticado |
| GET | `/api/disponibilidade/dia` | `escala:ver` | autenticado |
| POST | `/api/disponibilidade/escala/aceitar` | `escala:ver` | autenticado |
| POST | `/api/disponibilidade/excecoes` | `unidade:horario|escala:editar|escala:bloquear` | autenticado |
| DELETE | `/api/disponibilidade/excecoes/:id` | `escala:ver` | autenticado |
| POST | `/api/disponibilidade/excecoes/:id/encurtar` | `escala:ver` | autenticado |
| GET | `/api/disponibilidade/grade` | `escala:ver` | autenticado |
| POST | `/api/disponibilidade/lote` | `escala:lote` | autenticado |
| GET | `/api/disponibilidade/mes` | `escala:ver` | autenticado |
| GET | `/api/disponibilidade/modelos` | `escala:modelos` | autenticado |
| POST | `/api/disponibilidade/modelos` | `escala:modelos` | autenticado |
| PATCH | `/api/disponibilidade/modelos/:id` | `escala:modelos` | autenticado |
| POST | `/api/disponibilidade/modelos/:id/duplicar` | `escala:modelos` | autenticado |
| PUT | `/api/disponibilidade/profissionais/:id/semanal` | `escala:editar` | autenticado |
| PUT | `/api/disponibilidade/unidade/semanal` | `unidade:horario` | autenticado |

## empresa

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/empresa` | `cadastros:ver` | autenticado |
| PATCH | `/api/empresa` | `empresa:configurar` | autenticado |
| GET | `/api/empresa/agendamento-online` | `empresa:configurar` | autenticado |
| PATCH | `/api/empresa/agendamento-online` | `empresa:configurar` | autenticado |

## equipe

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/equipe/permissoes` | `equipe:permissoes` | autenticado |
| PUT | `/api/equipe/permissoes/:membershipId` | `equipe:permissoes` | autenticado |
| GET | `/api/equipe/permissoes/:membershipId/historico` | `equipe:permissoes` | autenticado |

## financeiro

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/financeiro/resumo` | `painel:financeiro` | autenticado |

## formas-pagamento

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/formas-pagamento` | `cadastros:ver` | autenticado |
| POST | `/api/formas-pagamento` | `pagamentos:editar` | autenticado |
| PATCH | `/api/formas-pagamento/:code` | `pagamentos:editar` | autenticado |
| POST | `/api/formas-pagamento/parcelados` | `pagamentos:editar` | autenticado |
| GET | `/api/formas-pagamento/simular-taxa` | `pagamentos:editar` | autenticado |

## gamificacao

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/gamificacao/meta-salao` | `metas:ver` | autenticado |
| GET | `/api/gamificacao/ranking` | `ranking:ver` | autenticado |

## health

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/health` | — | aberto |
| GET | `/api/health/banco` | — | aberto |

## insights

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/insights/attach` | `painel:operacional` | autenticado |
| GET | `/api/insights/cashflow` | `painel:financeiro` | autenticado |
| GET | `/api/insights/clients/:id/reliability` | `painel:operacional` | autenticado |
| GET | `/api/insights/margin` | `painel:financeiro` | autenticado |
| GET | `/api/insights/occupancy` | `painel:operacional` | autenticado |
| GET | `/api/insights/rebooking/:clienteId` | `painel:operacional` | autenticado |
| GET | `/api/insights/retention` | `painel:operacional` | autenticado |

## lista-espera

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/lista-espera` | `espera:ver` | autenticado |
| POST | `/api/lista-espera` | `espera:gerir` | autenticado |
| PATCH | `/api/lista-espera/:id` | `espera:gerir` | autenticado |
| GET | `/api/lista-espera/compativeis` | `espera:ver` | autenticado |

## me

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/me` | — | aberto |

## metas

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/metas` | `metas:ver` | autenticado |
| PUT | `/api/metas` | `metas:definir` | autenticado |
| GET | `/api/metas/sugestao` | `metas:definir` | autenticado |

## onboarding

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| POST | `/api/onboarding/cargos` | `empresa:configurar` | autenticado |
| POST | `/api/onboarding/formas` | `empresa:configurar` | autenticado |
| GET | `/api/onboarding/presets` | `empresa:configurar` | autenticado |
| POST | `/api/onboarding/servicos` | `empresa:configurar` | autenticado |
| GET | `/api/onboarding/status` | `empresa:configurar` | autenticado |

## produtos

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/produtos` | `cadastros:ver` | autenticado |
| POST | `/api/produtos` | `catalogo:editar` | autenticado |
| PATCH | `/api/produtos/:id` | `catalogo:editar` | autenticado |
| POST | `/api/produtos/:id/estoque/ajuste` | `estoque:ajustar` | autenticado |

## profissionais

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/profissionais` | `cadastros:ver` | autenticado |
| POST | `/api/profissionais` | `catalogo:editar` | autenticado |
| PATCH | `/api/profissionais/:id` | `catalogo:editar` | autenticado |
| GET | `/api/profissionais/:id/servicos` | `cadastros:ver` | autenticado |
| PUT | `/api/profissionais/:id/servicos` | `catalogo:editar` | autenticado |
| PATCH | `/api/profissionais/:id/servicos/:servicoId/override` | `catalogo:editar` | autenticado |

## public/agendar

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/public/agendar/:slug` | — | público |
| POST | `/api/public/agendar/:slug` | — | público |
| GET | `/api/public/agendar/:slug/slots` | — | público |

## public/meu-agendamento

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| POST | `/api/public/meu-agendamento` | — | público |
| POST | `/api/public/meu-agendamento/cancelar` | — | público |
| POST | `/api/public/meu-agendamento/confirmar` | — | público |
| POST | `/api/public/meu-agendamento/horarios` | — | público |
| POST | `/api/public/meu-agendamento/push` | — | público |
| POST | `/api/public/meu-agendamento/remarcar` | — | público |

## raiz

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/` | — | aberto |

## relatorios

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/relatorios/cota-parte` | `painel:financeiro` | autenticado |
| GET | `/api/relatorios/meus-ganhos` | `ganhos:ver` | autenticado |
| GET | `/api/relatorios/piloto` | `painel:financeiro` | autenticado |
| GET | `/api/relatorios/servicos-prestados` | `painel:financeiro` | autenticado |

## servicos

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/servicos` | `cadastros:ver` | autenticado |
| POST | `/api/servicos` | `catalogo:editar` | autenticado |
| PATCH | `/api/servicos/:id` | `catalogo:editar` | autenticado |

## snapshot

| Método | Caminho | Permissão (RBAC) | Perímetro |
|---|---|---|---|
| GET | `/api/snapshot` | `painel:financeiro` | autenticado |
