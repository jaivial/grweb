#!/bin/sh
# Creates one database and one role per service (database-per-service). Dev only: passwords are "dev_<svc>".
set -eu
for svc in identity competition cms athletes schedule live ticketing raffle crm messaging ai audit; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE grcup_${svc} LOGIN PASSWORD 'dev_${svc}';
CREATE DATABASE grcup_${svc} OWNER grcup_${svc};
REVOKE ALL ON DATABASE grcup_${svc} FROM PUBLIC;
SQL
  # citext and other extensions are created by the service migrations; the owner needs CREATE on its schema.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "grcup_${svc}" -c "CREATE EXTENSION IF NOT EXISTS citext;"
done
