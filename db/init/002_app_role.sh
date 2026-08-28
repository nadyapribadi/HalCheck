#!/bin/bash
# Creates the application's low-privilege database role with its real
# password injected from the environment -- never hardcoded in a committed
# file. Runs immediately after 001_schema.sql via docker-entrypoint-initdb.d
# (both .sh and .sql files there run in alphabetical order against the
# freshly-initialized database).
set -euo pipefail

: "${HALCHECK_APP_DB_PASSWORD:?HALCHECK_APP_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$HALCHECK_APP_DB_PASSWORD" <<-EOSQL
    CREATE ROLE halcheck_app LOGIN PASSWORD :'app_password';
    GRANT SELECT ON users TO halcheck_app;
    GRANT INSERT, SELECT ON audit_log TO halcheck_app;
    GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO halcheck_app;
    -- Unlike audit_log, idempotency_keys is an operational cache, not
    -- accountability-relevant -- UPDATE/DELETE are legitimate here
    -- (withIdempotency records the real result after a placeholder insert,
    -- and cleans up on failure so a retry isn't wedged forever).
    GRANT INSERT, SELECT, UPDATE, DELETE ON idempotency_keys TO halcheck_app;
EOSQL
