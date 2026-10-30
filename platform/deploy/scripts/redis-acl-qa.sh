#!/usr/bin/env bash
# QA Redis ACL (kept for habit and docs): the same as deploy/scripts/redis-acl.sh qa.
exec "$(dirname "$0")/redis-acl.sh" qa "$@"
