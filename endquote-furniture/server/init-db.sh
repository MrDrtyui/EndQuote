#!/bin/sh
set -eu
psql -X --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 --set=pw="$RUNTIME_PASSWORD" <<'SQL'
CREATE ROLE runtime LOGIN PASSWORD :'pw';
SQL
