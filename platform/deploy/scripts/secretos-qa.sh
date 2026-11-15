#!/usr/bin/env bash
# QA Secrets (kept for habit and docs): the same as deploy/scripts/secretos.sh qa.
exec "$(dirname "$0")/secretos.sh" qa "$@"
