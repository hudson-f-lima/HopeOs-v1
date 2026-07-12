#!/usr/bin/env bash
# DRAFT ONLY
# DO NOT EXECUTE AGAINST STAGING OR PRODUCTION
# NOT APPROVED FOR PRODUCTION
#
# Automates TESTE 4 from 007_identity_model_TESTS_DRAFT_ONLY.sql: applies
# 007_identity_model_DRAFT_ONLY.sql twice against the same disposable test
# database and fails loudly if the second run errors. This replaces the
# "manual procedure documented in a comment" from the first draft, per the
# Red Team finding that a documented-but-unautomated step is not a real
# gate.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@localhost:5432/disposable_test_db \
#     ./run_idempotency_test_DRAFT_ONLY.sh
#
# Requires: psql. Never point DATABASE_URL at staging or production — this
# script applies schema changes twice, on purpose, to a database that must
# be safe to discard afterward.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="${SCRIPT_DIR}/007_identity_model_DRAFT_ONLY.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERRO: defina DATABASE_URL apontando para um banco de teste DESCARTAVEL antes de rodar este script." >&2
  echo "Este script NUNCA deve rodar contra staging ou producao." >&2
  exit 1
fi

if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "ERRO: nao encontrei $MIGRATION_FILE" >&2
  exit 1
fi

echo "== Execucao 1/2 de 007_identity_model_DRAFT_ONLY.sql =="
if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_FILE"; then
  echo "FALHA na primeira execucao — isso e um problema do schema base, nao de idempotencia. Corrigir antes de reavaliar o TESTE 4." >&2
  exit 1
fi
echo "== Execucao 1/2 OK =="

echo "== Execucao 2/2 de 007_identity_model_DRAFT_ONLY.sql (prova de idempotencia) =="
if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_FILE"; then
  echo "TESTE 4 FALHOU: a segunda execucao do arquivo nao foi limpa. O arquivo ainda nao e seguro de reexecutar." >&2
  exit 1
fi

echo "TESTE 4 OK: 007_identity_model_DRAFT_ONLY.sql e seguro de reexecutar duas vezes seguidas contra a mesma base."
