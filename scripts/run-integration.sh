#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Brak SUPABASE_DB_URL. Podaj adres bazy testowej. Nie używaj adresu produkcji." >&2
  exit 1
fi

files=(
  tests/integration/stage2.sql
  tests/integration/stage3.sql
  tests/integration/stage4.sql
  tests/integration/stage5.sql
  tests/integration/stage6.sql
  tests/integration/stage7.sql
  tests/integration/stage8.sql
  tests/integration/stage9.sql
  tests/integration/stage10.sql
  tests/integration/stage11.sql
)

for file in "${files[@]}"; do
  echo "=== ${file}"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$file"
done
