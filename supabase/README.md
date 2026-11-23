# supabase/

Banco do projeto `hopeos-v1` (ID `gsttjozcmdvgstcpadiq`). Migrations físicas: **001–027**.

- `migrations/NNN_nome.sql`: **o merge na `main` aplica estas migrations em produção** pela integração GitHub do Supabase (D-010). Toda migration precisa de autorização do Platform Owner registrada em `docs/DECISIONS.md` e de uma linha em `migrations.lock` (sha256 + decisão). O CI (`tests/check_migrations.sh`) barra o resto.
- `rollback/NNN_down.sql`: desfaz a migration correspondente. Existe para 007 até 027 (21 arquivos) e é exercitado pelo ciclo do `tests/run.sh`.
- `tests/`:
  - `gate_NNN.sql`: gates SQL por migration, com controles negativos (existem para 007 até 027);
  - `concurrency_*.sh`: duas sessões reais competindo pelo mesmo recurso (agenda, estorno, atendimento e, desde a 027, link público por número);
  - `controle_negativo_009.sh`, `backup_restore.sh`;
  - `run.sh`: aplica tudo num Postgres 16 limpo, roda os gates, os testes de concorrência e o ciclo de rollback (`WITH_ROLLBACK=1`, padrão).

## Como rodar os testes SQL localmente

```bash
su postgres -c "cd <caminho-do-repo> && WITH_ROLLBACK=1 supabase/tests/run.sh"
```

Precisa de um Postgres 16 com o usuário `postgres` acessível. O CI roda o mesmo script no job "Migrations + gates SQL (Postgres 16)".

## Se a integração falhar no merge

1. Confirmar com o conector do Supabase (`list_migrations`, só leitura) quais versões entraram.
2. Ler o log da integração (`workflow_run_logs`). Falha antes de executar SQL (ex.: timeout da API do Supabase) não muda o banco.
3. Reacionar a integração: novo merge na `main` com mudança dentro de `supabase/` (este arquivo serve para isso) ou "redeploy" no painel do Supabase.
4. Não aplicar pelo conector no celular: ele não mostra a confirmação de SQL (D-010) e grava o histórico com outro nome.

## Rollback de uma migration em produção

Não use `rollback/*.sql` sem autorização do Platform Owner. Ele altera a função ou a tabela em produção. Para a 027, o rollback remove as funções `agendamento_publico_criar` e `agendamento_remarcar`, o índice e a função `chave_numero_br`; o backend volta sozinho ao caminho anterior.
