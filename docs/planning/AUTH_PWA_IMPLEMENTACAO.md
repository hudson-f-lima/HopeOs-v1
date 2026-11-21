# Autenticação e PWA — execução D-056

Autorização: o proprietário aprovou aplicar o plano de correção e usar agentes em 17/11/2026. Base: main `ad75d8a`. Este documento é o runbook desta entrega; `PROJECT_STATE.md` mantém o estado geral. Código em branch e testes não representam publicação.

## Entregas e alcance

| Item | Implementação prevista nesta branch | Limite de aceite |
|---|---|---|
| C01 | Lookup literal sem distinguir caixa, resultado único, verificação do e-mail/UUID do destinatário e do espelho do convite | Postgres/PostgREST locais, fixtures sintéticas e testes HTTP; produção não consultada. |
| C02/C03 | Geração de sessão/contexto, descarte de refresh/respostas antigas, saída propagada entre abas e limpeza da interface | Validar módulo real e navegador; não supor revogação instantânea de todo JWT. |
| C04 | Separar convite, recuperação e autenticação sem senha | Magic Link nunca exige criar senha. |
| C05 | Prova recente verificada antes de alterar senha no endpoint Express | PARCIAL: o endpoint nativo Supabase continua sujeito às políticas do provedor, não ao middleware Express. |
| C06 | Legado desligado por padrão em produção/blueprint; tela de token/query removida | Não altera a configuração já existente no Render; confirmar recuperação antes de publicar/desligar caminho em uso. |
| C07 | Limitador bounded por chave, controles de refresh e respostas 401/403/429/503 corretas; no-store Auth | Limitador de uma instância não substitui rate limits do Supabase nem store compartilhado quando necessário. |
| C08 | Contenção: recusar reduções de administrador ativo sem garantia atômica | PARCIAL: reduz funcionalidade administrativa de forma explícita. Solução transacional requer autorização própria. |
| F2/F3 | SDK oficial local, Google/Apple/links/código e vinculação por configuração pública | Providers reais, SMTP e dispositivos dependem de configuração e teste externos; flags não significam configuração aprovada. |
| P01/P05/P06 | Prioridade da agenda, marcador de novidades por UUID/empresa e callback fora do cache | Ganhos de latência reais só com medição; sem escrita offline. |
| P02–P04/P07 e I01/I02 | Preservar regras existentes e registrar dependências de medição/transação | Não declarar consulta por intervalo, busca paginada ou corrida de escala resolvidas por mudanças de Auth. |

## Configuração de autenticação

`GET /api/auth/config` devolve apenas `{supabaseUrl,publishableKey,providers}` dentro do envelope da API. Sem configuração válida, o login individual existente continua disponível e os novos métodos não aparecem como funcionais. Nenhuma chave secreta é enviada ao cliente.

| Variável | Uso | Valor seguro inicial |
|---|---|---|
| `SUPABASE_URL` | Projeto canônico do HOPE OS | Conferir `hopeos-v1`, referência `gsttjozcmdvgstcpadiq`; nunca escolher por nome parecido. |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável do mesmo projeto para SDK Auth | Ausente até confirmar projeto; nunca secret/service_role. |
| `APP_PUBLIC_URL` | Convites/recovery e retorno compatível com Pages/subdiretório | URL real autorizada no Supabase; sem redirects genéricos. |
| `AUTH_GOOGLE_ENABLED` | Exibir/usar Google | `false` até prova real. |
| `AUTH_APPLE_ENABLED` | Exibir/usar Apple | `false` até prova real. |
| `AUTH_MAGIC_LINK_ENABLED` | Entrada por link | `false` até prova SMTP/PKCE. |
| `AUTH_OTP_ENABLED` | Código por e-mail | `false` até configurar template/verificação. |
| `AUTH_LINK_IDENTITY_ENABLED` | Vincular provedor na conta autenticada | `false` até ativar política e testar vinculação sem duplicar UUID. |
| `LEGACY_TOKEN_AUTH_ENABLED` | Compatibilidade temporária | `false` em produção após acesso individual/recuperação comprovados. |

O frontend usa SDK 2.109.0 local, com licença e versão registradas; não há CDN irrestrita. A conexão Auth aceita somente a origem canônica, além de localhost no ambiente de teste local. A configuração pública não é autoridade de papel/tenant: `/me` e cada operação de negócio continuam validados pelo servidor.

### Checklist de habilitação dos métodos

1. Confirmar projeto e acesso administrativo: a conexão Supabase disponível nesta execução lista apenas projetos antigos/inativos e não disponibiliza a referência canônica. Nenhum deles pode ser reutilizado por semelhança de nome.
2. Validar login individual e recuperação do proprietário; preservar uma sessão operacional enquanto testa a nova em ambiente isolado.
3. Configurar domínio/URL de retorno exata. Callback precisa funcionar em `index.html` no caminho publicado; não pressupor rewrite em Pages.
4. Google: credenciais e consentimento, escopos mínimos e teste de conta convidada/existente. Apple: Services ID/App ID, segredo e `.p8` protegidos, e-mail privado e relay quando houver envio. A renovação do segredo web tem responsável e antecedência definidos.
5. SMTP/template: link/código de uso único, validade e reenvio, envio entregue e tracking que não reescreva links. Código deve permitir concluir na janela original quando e-mail abrir em outro contexto.
6. Verificar a política nativa de mudança de senha e criação de conta no Supabase. A barreira do Express não impede chamada direta à API nativa do provedor. Confirmar controles nativos aplicáveis e risco residual antes de habilitar social.
7. Rate limits/CAPTCHA e quotas de Auth: chamadas diretas do SDK não atravessam Express. Cadastro fechado e vinculação manual precisam funcionar nos casos convidados, sem ligar signup global apenas para eliminar erro.
8. Fazer prova dos fluxos em Android Chrome, iOS Safari, desktop e PWA instalada. Habilitar flags apenas para os métodos cujo fluxo foi aprovado.

## Sessão e migração

Manter um único dono de refresh. Quando configurado, o SDK gerencia a sessão; o modo anterior é compatibilidade enquanto não configurado. Geração persistida impede respostas de outra sessão regravarem dados, e a escolha de empresa não deve mudar silenciosamente em outra aba.

A migração pode exigir uma reautenticação única. Realizar fora de uma finalização de comanda; manter no servidor a comanda e a chave idempotente de resultado incerto. Após definição de senha, usar novo login: a operação administrativa do provedor revoga refresh tokens. Nunca guardar a senha em storage.

O fechamento guarda um journal mínimo em IndexedDB antes de enviar: apenas IDs/valores do pedido e chave idempotente, separado por UUID/empresa, sem nomes/contatos/credenciais. A retomada é explícita e repete o corpo original; confirmação apaga a pendência. Cada tentativa é contabilizada em transação: uma recusa pré-gravação comprovada só libera o registro se não restarem tentativas ativas/incertas; timeout, logout ou resposta perdida não provam ausência de venda. Sem gravação durável, a interface não envia. Este journal não é operação offline nem histórico financeiro.

O servidor confirma replay por chave/empresa/ator e intenção antes de recalcular preço/estoque/plano. O snapshot JSON dos novos comandos inclui o vínculo de agenda, sem alterar schema. Replay após a RPC também é revalidado contra o comando vencedor; a conclusão da agenda usa CAS e pode ser reconciliada sem refazer o financeiro. Dados antigos sem prova do vínculo podem exigir conferência manual. Se o navegador receber confirmação financeira com `vinculoAgenda.aplicado:false`, ele mostra que a venda foi salva e orienta conferir a Agenda; não apresenta sucesso integral nem repete pagamento automaticamente. Se a resposta se perder, a retomada explícita reconcilia o vínculo validado com a mesma intenção.

O marcador antigo global de novidades não é copiado para outra empresa. Novos marcadores usam UUID de usuário e empresa e descartam resposta tardia de outro contexto. Falta de contexto não recebe chave global alternativa.

## Testes e evidências

- **REAL, Node 22.23.5:** 43 suítes locais concluídas com sucesso; gate de sessão 20/20, proteção Auth 8/8, journal 7/7, replay 5/5 e contexto local 2/2. A verificação opcional C01 com PostgREST é executada separadamente no ambiente local específico, sem tratar skip condicional como prova de banco.
- **REAL, Postgres 16.15/PostgREST 12.2.12 locais:** C01 literal e C08 contido, inclusive alteração obsoleta recusada; nenhuma chamada ao projeto remoto.
- **REAL, SQL local:** migrations existentes 001–025 aplicadas; 19 arquivos de gates SQL passaram, 19 rollbacks executados, migrations reaplicadas e 19 gates novamente verdes. Scripts de concorrência/backup completos seguem a execução do CI.
- **REAL, SDK 2.109.0 com transporte local simulado:** perda de refresh por 429/408/425/508, verificador durante vinculação, resposta tardia e fluxo de callbacks têm regressões antes/depois. Isso não é prova de consentimento/SMTP reais.
- **REAL, CI Chromium:** [execução 155](https://github.com/hudson-f-lima/HopeOs-v1/actions/runs/44208549956) aprovou **39/39 E2E**, incluindo login/convite/recuperação, Auth social com transporte simulado, journal IndexedDB real e duas abas, retomada sem duplicar caixa/estoque, papéis e CSP. O navegador local permaneceu bloqueado pelo executor; o CI fechou essa lacuna. Não são testes de consentimento ou SMTP de fornecedores reais. O gate SQL completo do CI também passou.
- **REAL, CI geral:** a primeira execução detectou uma assertion de log afetada por ANSI; o formato passou a ser texto simples, sem remover os controles de PII. [Execução 156](https://github.com/hudson-f-lima/HopeOs-v1/actions/runs/44209081606): gates offline e SQL aprovados; resultado completo no PR #51. Alterações posteriores de evidência/teste também são acompanhadas pelo CI.
- **Revisão adversarial independente:** achados geraram correções de compatibilidade, seleção de empresa, sessão transitória e recuperação financeira; não é Red Team de produção.

Matriz mínima: e-mails semelhantes/especiais; refresh após logout e em abas; callbacks sem token em cache/log; 401/403/429/503/rede; conta existente/inativa/sem vínculo; papel e tenant alheios; sequência agenda→comanda→split→caixa→comissão→estorno; atualização sobre instalação antiga.

Testes de provedor com rotas simuladas verificam integração cliente, não entrega de e-mail ou consentimento real. Gates integrados precisam de banco isolado. O runtime deve ser Node 22.x com o lock versionado.

## Publicação e rollback

Sem merge/publicação automática nesta entrega. A versão revisável precisa de CI e dos gates externos aplicáveis; o branch não altera produção.

Publicar primeiro as correções de identidade/sessão com métodos novos desligados. Depois habilitar cada método testado para proprietário e colaborador escolhido, observar um ciclo operacional e ampliar. Não executar restauração de backup sobre vendas novas sem conciliação.

Se um provedor falhar, desligar seu método e manter login individual validado. Se a migração de sessão falhar, parar expansão e usar versão de correções compatível/reautenticação. Não reativar legado nem voltar a um build que reintroduz busca por padrão, logout defeituoso ou concessão incorreta. Mudanças de banco têm retorno próprio autorizado.

## Pendências de escopo e risco residual

- Provedor/SMTP/credenciais e dispositivos reais: dependências externas, sem prova nesta branch.
- C05: proteção do endpoint Express não representa controle total da API nativa do Supabase.
- C08: edição que reduz admin ativo fica bloqueada; reabilitação depende de transação/lock por empresa com releitura e teste concorrente no banco.
- P07: a checagem pós-gravação de escala reduz a janela, mas a atomicidade completa segue dependente da proposta de banco já documentada em D-055.
- P02–P04: consulta semanal, pesquisa paginada e agregações exigem baseline volumétrico/medição próprios. Nenhum número de melhoria é presumido.
- Limites por instância, origem de dados por unidade e revogação de JWT continuam com seus limites documentados; não declarar multi-tenant seguro.
