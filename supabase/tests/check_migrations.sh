#!/usr/bin/env bash
# Trava de produção: a integração GitHub do Supabase aplica em produção toda
# migration nova que chega na main (D-010). Este check falha se uma migration
# não está em supabase/migrations.lock, se o conteúdo de uma já autorizada mudou
# ou se há arquivo fora do padrão NNN_nome.sql na pasta.
set -euo pipefail
cd "$(dirname "$0")/../.."
LOCK=supabase/migrations.lock
erro=0
for f in supabase/migrations/*; do
  nome=$(basename "$f")
  if [[ ! "$nome" =~ ^[0-9]{3}_[a-z0-9_]+\.sql$ ]]; then
    echo "ERRO: $nome fora do padrão NNN_nome.sql"; erro=1; continue
  fi
  esperado=$(awk -v n="$nome" '$1 !~ /^#/ && $2 == n { print $1 }' "$LOCK")
  atual=$(sha256sum "$f" | cut -d' ' -f1)
  if [ -z "$esperado" ]; then
    echo "ERRO: $nome não autorizada (ausente em $LOCK)"; erro=1
  elif [ "$esperado" != "$atual" ]; then
    echo "ERRO: $nome foi alterada depois de autorizada/aplicada"; erro=1
  fi
done
while read -r hash nome _; do
  [[ -z "$hash" || "$hash" == \#* ]] && continue
  [ -e "supabase/migrations/$nome" ] || { echo "ERRO: $nome está no lock mas o arquivo sumiu"; erro=1; }
done < "$LOCK"
[ "$erro" = 0 ] && echo "OK migrations conferem com $LOCK" || exit 1
