#!/bin/bash
# Runs once on first Postgres init (empty data dir), before 01_init.sql.
# The container's POSTGRES_DB (microgreen) hosts the tgas CRM schema (01_init.sql).
# Here we additionally create the storefront database used by Prisma (apps/web).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE microgreen_db OWNER ' || quote_ident('$POSTGRES_USER')
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'microgreen_db')\gexec
EOSQL

echo "[db-init] storefront database 'microgreen_db' ensured (owner: $POSTGRES_USER)"
