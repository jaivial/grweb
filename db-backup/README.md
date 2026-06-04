# db-backup/

Automated, cron-scheduled MySQL backups of the `grcup` database.

## Source pipeline

- **Script:** `/var/www/grweb/scripts/db-backup.sh`
- **Trigger:** cron (`17 */12 * * *`) running as `root`
- **Log:** `/var/log/db-backup.log`
- **Schedule:** twice per day, 17 minutes past every 12th hour (UTC)

Each successful run produces a gzipped SQL dump named with a UTC timestamp:

```
YYYYMMDDTHHMMSSZ.sql.gz     (e.g. 20260602T182000Z.sql.gz)
```

## Retention policy

Only the **7 most recent** `.sql.gz` files are retained. Anything older is
removed from disk AND `git rm`-ed from the repository in the same commit, so
the Git history shrinks over time as well (no orphan blobs).

A full 7-day retention means approximately 84 hours of history at the
`*/12h` cadence.

## What the dump contains

A full logical backup of the `grcup` database: schema + data + routines +
triggers + events, captured with `mysqldump --single-transaction`.

> **WARNING — PII**
> This folder contains personally identifiable information including but
> not limited to athlete **emails**, phone numbers, dates of birth, and
> payment metadata. **Keep this repository private.** Do not push to a
> public remote. Do not share the dump files outside of the operations
> team.

## Restoring a dump

```bash
# 1. Decompress
gunzip -c /var/www/grweb/db-backup/YYYYMMDDTHHMMSSZ.sql.gz > /tmp/restore.sql

# 2. Restore (will DROP and recreate the target database)
mysql --host=localhost --port=3306 --user=grcup_app --password \
      -e "DROP DATABASE IF EXISTS grcup; CREATE DATABASE grcup CHARACTER SET utf8mb4;"
mysql --host=localhost --port=3306 --user=grcup_app --password \
      grcup < /tmp/restore.sql
```

For a non-destructive restore into a side database:

```bash
mysql --host=localhost --port=3306 --user=grcup_app --password \
      -e "CREATE DATABASE IF NOT EXISTS grcup_restore CHARACTER SET utf8mb4;"
gunzip -c /var/www/grweb/db-backup/YYYYMMDDTHHMMSSZ.sql.gz \
  | mysql --host=localhost --port=3306 --user=grcup_app --password grcup_restore
```

## Operational notes

- The connection string is read at runtime from
  `backend/GrCup.Api/appsettings.json` via `jq`. The password is never
  written into the script.
- A pre-flight gate aborts the run if `SELECT COUNT(*) FROM Inscripciones
  WHERE CompeticionId=2` does not return `30`. This guards against
  running against the wrong database or a half-migrated schema.
- The script is idempotent: if a dump for the current UTC timestamp
  already exists, the run is a no-op (`exit 0`).
- On any error, the working tree is restored with `git reset --hard HEAD`
  and the script exits non-zero so cron will (a) not email silently and
  (b) leave the repo in a known-clean state.
