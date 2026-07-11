#!/bin/bash
# HISTORICAL SECURITY CLEANUP SCRIPT.
#
# Do not run casually. This rewrites git history and requires coordination with
# every clone of the repository. Kept versioned as evidence of the Tarefa B
# cleanup procedure for PII/secrets.
#
# Intended scope:
# - remove historical PII/cache files from data/clientes.json and data/backups/
# - remove accidental real env files if present in history
#
# Run only with explicit Platform Owner approval.
set -euo pipefail

git filter-branch -f --index-filter 'git rm -rf --cached --ignore-unmatch data/clientes.json data/backups/ .env backend/.env' -- --all
git reflog expire --expire=now --all
git gc --prune=now --aggressive
