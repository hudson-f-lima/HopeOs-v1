# Runbook — backup e restauração (D-021)

## Estado
**Não existe backup automático em produção, e a rotina diária foi adiada pelo Platform Owner em 2026-11-11 para outra etapa** (risco aceito até lá). O que existe são as ferramentas e a prova de que o ciclo exportar → restaurar → conferir funciona. A rotina diária depende de uma decisão do Platform Owner (abaixo).

## O que existe
| Peça | O que faz |
|---|---|
| `backend/scripts/ops/backup.js` | Exporta todas as tabelas do schema `public` pelo PostgREST, só leitura, para um arquivo local, com contagem, hash de ids e somas em centavos por tabela |
| `backend/scripts/ops/restore-check.js` | Carrega o arquivo num Postgres limpo com as migrations e confere tabela por tabela |
| `supabase/tests/backup_restore.sh` | Prova do ciclo no CI, com dados de teste e controles negativos (arquivo com linha a menos e com valor adulterado são reprovados) |

## Decisão pendente: onde roda a rotina diária
Uma rotina no GitHub Actions foi escrita e **não foi incluída no repositório**: o repositório é público, e o arquivo de backup (com nome e telefone dos clientes e todo o histórico financeiro) ficaria baixável por qualquer conta do GitHub, protegido só por uma frase-senha. Além disso, a chave secreta do Supabase teria de ser cadastrada no GitHub.

| Opção | Como fica | Custo |
|---|---|---|
| A. Plano pago do Supabase (recomendado) | Backup diário do próprio provedor; nenhum dado sai para o GitHub | Mensalidade |
| B. Rotina no GitHub com repositório privado | Exige migrar o site do GitHub Pages para o Render antes | Trabalho de migração |
| C. Rotina no GitHub com repositório público | Arquivo criptografado e público | Risco de exposição de dados pessoais; não recomendado |

## Uso manual (quem tem a chave e um computador)
```
SUPABASE_URL=... SUPABASE_SECRET_KEY=... node backend/scripts/ops/backup.js --out backup.json
node backend/scripts/ops/restore-check.js --in backup.json --db <banco descartável com as migrations>
```
O arquivo contém dados pessoais em claro: guardar criptografado e fora de pastas sincronizadas ou públicas.

## Restaurar depois de uma perda
1. Projeto Supabase novo (ou o mesmo, vazio) com as migrations aplicadas pela `main`.
2. Conferir antes num banco local com `restore-check.js`.
3. A carga em produção é SQL com triggers desligados na sessão e **exige autorização do Platform Owner**. Não há botão para isso.
4. Reconvidar a equipe: logins e senhas ficam no schema `auth`, que o backup não cobre.

## Limites
- Não cobre logins e senhas (schema `auth`).
- O teste de restauração usa as migrations do repositório; se produção divergir, o teste acusa.
- Sem rotina automática, o backup só existe quando alguém roda o script.
