#!/usr/bin/env sh
set -eu

psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/migrations/002_auth.sql
psql "$DATABASE_URL" -f db/migrations/003_billing.sql
echo "Savlivo database initialized."
