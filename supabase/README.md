# supabase/

- `migrations/NNN_nome.sql`: **o merge na `main` aplica estas migrations em produção** pela integração GitHub do Supabase (D-010). Toda migration precisa de autorização do Platform Owner e de uma linha em `migrations.lock` (sha256 + decisão); o CI (`tests/check_migrations.sh`) barra o resto.
- `rollback/NNN_down.sql`: desfaz a migration correspondente (testado no ciclo do `tests/run.sh`).
- `tests/`: gates SQL por migration (`gate_NNN.sql`, com controles negativos), concorrência e backup.

## Se a integração falhar no merge
1. Confirmar com o conector do Supabase (`list_migrations`, só leitura) quais versões entraram.
2. Ler o log da integração (`workflow_run_logs`). Falha antes de executar SQL (ex.: timeout da API do Supabase) não muda o banco.
3. Reacionar a integração: novo merge na `main` com mudança dentro de `supabase/` (este arquivo serve para isso) ou "redeploy" no painel do Supabase.
4. Não aplicar pelo conector no celular: ele não mostra a confirmação de SQL (D-010) e grava o histórico com outro nome.
