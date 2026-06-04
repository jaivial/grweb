#!/usr/bin/env bash
# =============================================================================
# db-backup.sh — Automated MySQL backup for the grcup database
# -----------------------------------------------------------------------------
# Pipeline:
#   1. Parse connection string from appsettings.json (no hardcoded creds)
#   2. Pre-flight gate: Inscripciones count for CompeticionId=2 must equal 30
#   3. mysqldump --single-transaction -> gzip -9 -> /var/www/grweb/db-backup/
#   4. Prune to the 7 most recent .sql.gz files (older ones `git rm`-ed at commit)
#   5. Commit + rebase + push to origin/main
#   6. On any failure: git reset --hard HEAD, exit non-zero
#
# Schedule: `17 */12 * * *` via crontab
# Author: gr-devops-agent (project-managed)
# =============================================================================
set -Eeuo pipefail
IFS=$'\n\t'

# -----------------------------------------------------------------------------
# Paths and constants
# -----------------------------------------------------------------------------
readonly REPO_ROOT="/var/www/grweb"
readonly BACKUP_DIR="${REPO_ROOT}/db-backup"
readonly APPSETTINGS="${REPO_ROOT}/backend/GrCup.Api/appsettings.json"
readonly LOG_FILE="/var/log/db-backup.log"
readonly RETENTION_COUNT=7
readonly EXPECTED_INSCRIPCIONES=30
readonly COMPDB_FIELD="CompeticionId"
readonly COMPDB_TABLE="Inscripciones"
readonly COMPDB_VALUE=2

# Timestamp YYYYMMDDTHHMMSSZ (UTC, per requirement)
TS="$(date -u +%Y%m%dT%H%M%SZ)"
TS_HUMAN="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DUMP_FILE="${BACKUP_DIR}/${TS}.sql.gz"
START_EPOCH="$(date +%s)"

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "${msg}" | tee -a "${LOG_FILE}" >/dev/null
  echo "${msg}"
}

log "===== db-backup start (pid=$$ ts=${TS_HUMAN}) ====="

# -----------------------------------------------------------------------------
# Cleanup trap — on any error: log, git reset --hard HEAD, exit non-zero
# -----------------------------------------------------------------------------
on_error() {
  local rc=$?
  local line=${1:-unknown}
  log "ERROR: script failed at line ${line} with exit code ${rc}"
  log "Performing git reset --hard HEAD to leave repo untouched"
  if git -C "${REPO_ROOT}" reset --hard HEAD 2>>"${LOG_FILE}"; then
    log "git reset --hard HEAD: OK"
  else
    log "git reset --hard HEAD: FAILED (manual intervention may be required)"
  fi
  log "===== db-backup aborted ====="
  exit "${rc}"
}
trap 'on_error ${LINENO}' ERR

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
[[ -r "${APPSETTINGS}" ]] || { log "FATAL: cannot read ${APPSETTINGS}"; exit 1; }
[[ -d "${REPO_ROOT}/.git" ]] || { log "FATAL: ${REPO_ROOT} is not a git repo"; exit 1; }
[[ -d "${BACKUP_DIR}" ]] || mkdir -p "${BACKUP_DIR}"

for tool in mysqldump gzip jq git; do
  command -v "${tool}" >/dev/null 2>&1 || { log "FATAL: ${tool} not found in PATH"; exit 1; }
done

# -----------------------------------------------------------------------------
# Idempotency: skip if a dump for this exact timestamp already exists
# -----------------------------------------------------------------------------
if [[ -f "${DUMP_FILE}" ]]; then
  log "IDEMPOTENT: dump ${DUMP_FILE} already exists — skipping (exit 0)"
  log "===== db-backup end (idempotent skip) ====="
  exit 0
fi

# -----------------------------------------------------------------------------
# Parse connection string with jq (no hardcoded password)
# -----------------------------------------------------------------------------
CONN_STR="$(jq -r '.ConnectionStrings.Default' "${APPSETTINGS}")"
if [[ -z "${CONN_STR}" || "${CONN_STR}" == "null" ]]; then
  log "FATAL: could not extract ConnectionStrings.Default from ${APPSETTINGS}"
  exit 1
fi

# Parse key=value segments separated by `;`
parse_kv() {
  local str="$1" key="$2"
  echo "${str}" | tr ';' '\n' | awk -F= -v k="${key}" 'tolower($1)==tolower(k){sub(/^[^=]+=/, "", $0); print; exit}'
}

DB_HOST="$(parse_kv "${CONN_STR}" "Server")"
DB_PORT="$(parse_kv "${CONN_STR}" "Port")"
DB_NAME="$(parse_kv "${CONN_STR}" "Database")"
DB_USER="$(parse_kv "${CONN_STR}" "User")"
DB_PASS="$(parse_kv "${CONN_STR}" "Password")"
DB_CHARSET="$(parse_kv "${CONN_STR}" "CharSet")"

: "${DB_HOST:=localhost}"
: "${DB_PORT:=3306}"
: "${DB_NAME:=grcup}"
: "${DB_CHARSET:=utf8mb4}"

if [[ -z "${DB_USER}" || -z "${DB_PASS}" ]]; then
  log "FATAL: missing User or Password in connection string"
  exit 1
fi

readonly DB_PASS
log "Parsed connection: server=${DB_HOST} port=${DB_PORT} db=${DB_NAME} user=${DB_USER} charset=${DB_CHARSET} (password redacted)"

# -----------------------------------------------------------------------------
# Pre-flight gate: count Inscripciones WHERE CompeticionId=2 must equal 30
# -----------------------------------------------------------------------------
log "Pre-flight: SELECT COUNT(*) FROM \`${COMPDB_TABLE}\` WHERE \`${COMPDB_FIELD}\`=${COMPDB_VALUE}"

export MYSQL_PWD="${DB_PASS}"
COUNT_OUT="$(mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --database="${DB_NAME}" \
  --batch \
  --skip-column-names \
  --default-character-set="${DB_CHARSET}" \
  --execute="SELECT COUNT(*) FROM \`${COMPDB_TABLE}\` WHERE \`${COMPDB_FIELD}\`=${COMPDB_VALUE};" 2>>"${LOG_FILE}" \
  | tr -d '[:space:]')"
unset MYSQL_PWD

if ! [[ "${COUNT_OUT}" =~ ^[0-9]+$ ]]; then
  log "FATAL: pre-flight query returned non-numeric result: '${COUNT_OUT}'"
  exit 1
fi

log "Pre-flight: COUNT(*) = ${COUNT_OUT} (expected ${EXPECTED_INSCRIPCIONES})"

if [[ "${COUNT_OUT}" -ne ${EXPECTED_INSCRIPCIONES} ]]; then
  log "FATAL: pre-flight gate failed — aborting, no dump, no commit, no push"
  log "===== db-backup aborted (pre-flight) ====="
  exit 2
fi
log "Pre-flight: PASS"

# -----------------------------------------------------------------------------
# Run mysqldump
# -----------------------------------------------------------------------------
log "Starting mysqldump -> ${DUMP_FILE}"

export MYSQL_PWD="${DB_PASS}"
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --default-character-set="${DB_CHARSET}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  "${DB_NAME}" 2>>"${LOG_FILE}" \
  | gzip -9 > "${DUMP_FILE}"
unset MYSQL_PWD

if [[ ! -s "${DUMP_FILE}" ]]; then
  log "FATAL: dump file is empty or missing: ${DUMP_FILE}"
  rm -f "${DUMP_FILE}"
  exit 3
fi

DUMP_BYTES="$(stat -c%s "${DUMP_FILE}")"
log "Dump created: ${DUMP_FILE} (${DUMP_BYTES} bytes)"

# -----------------------------------------------------------------------------
# Retention: keep only the 7 most recent .sql.gz files
#   - Files beyond the 7 newest are listed for `git rm` in the same commit
#   - After commit succeeds, prune the local files too
# -----------------------------------------------------------------------------
mapfile -t ALL_DUMPS < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.sql.gz' | sort)
TOTAL_DUMPS="${#ALL_DUMPS[@]}"
log "Retention: ${TOTAL_DUMPS} dumps present, keeping ${RETENTION_COUNT}"

PRUNED=()
if (( TOTAL_DUMPS > RETENTION_COUNT )); then
  PRUNE_COUNT=$(( TOTAL_DUMPS - RETENTION_COUNT ))
  for ((i = 0; i < PRUNE_COUNT; i++)); do
    PRUNED+=("${ALL_DUMPS[i]}")
  done
fi

# -----------------------------------------------------------------------------
# Git: stage new file + deletions, commit, rebase, push
# -----------------------------------------------------------------------------
log "Staging changes in ${BACKUP_DIR}"
cd "${REPO_ROOT}"

git config user.name  >/dev/null 2>&1 || git config user.name  "gr-devops-agent"
git config user.email >/dev/null 2>&1 || git config user.email "devops@grcup.local"

git add -- "${BACKUP_DIR}/${TS}.sql.gz"
if (( ${#PRUNED[@]} > 0 )); then
  REL_PRUNED=()
  for f in "${PRUNED[@]}"; do
    rel="${f#${REPO_ROOT}/}"
    REL_PRUNED+=("${rel}")
  done
  git rm -f -- "${REL_PRUNED[@]}" 2>>"${LOG_FILE}" || true
fi

if git diff --cached --quiet; then
  log "No staged changes — skipping commit/push"
  log "===== db-backup end (nothing to commit) ====="
  exit 0
fi

log "Committing"
COMMIT_MSG="chore(db-backup): snapshot ${TS_HUMAN}"
git commit -m "${COMMIT_MSG}" 2>>"${LOG_FILE}"
COMMIT_SHA="$(git rev-parse --short HEAD)"
log "Commit SHA: ${COMMIT_SHA}"

# After commit, physically remove the pruned files (git rm already did the index+worktree)
if (( ${#PRUNED[@]} > 0 )); then
  PRUNED_LIST="$(printf '%s ' "${PRUNED[@]}")"
  log "Pruned ${#PRUNED[@]} old dump(s): ${PRUNED_LIST}"
fi

log "Pull --rebase --autostash from origin/main"
if ! git pull --rebase --autostash origin main 2>>"${LOG_FILE}"; then
  log "FATAL: git pull --rebase failed — leaving repo as-is for review"
  exit 4
fi

log "Push to origin/main"
if ! git push origin main 2>>"${LOG_FILE}"; then
  log "FATAL: git push failed"
  exit 5
fi
log "Push: OK"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
END_EPOCH="$(date +%s)"
DURATION=$(( END_EPOCH - START_EPOCH ))
DUMPS_NOW="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.sql.gz' | wc -l | tr -d '[:space:]')"
log "Summary: dump_bytes=${DUMP_BYTES} pruned=${#PRUNED[@]} commit=${COMMIT_SHA} dumps_after=${DUMPS_NOW} duration=${DURATION}s"
log "===== db-backup end (success) ====="
exit 0
