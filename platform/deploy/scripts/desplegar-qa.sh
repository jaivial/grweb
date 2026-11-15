#!/usr/bin/env bash
# QA deploy (kept for habit and docs): the same as deploy/scripts/desplegar.sh qa.
exec "$(dirname "$0")/desplegar.sh" qa "$@"
