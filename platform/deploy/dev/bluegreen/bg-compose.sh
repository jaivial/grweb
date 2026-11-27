#!/usr/bin/env bash
# bg-compose.sh app <color> <args de compose...> | infra <args de compose...>
# Compose con el entorno de blue/green. Lo llaman los scripts envueltos en cgrun (los builds van en cgroup).
set -Eeuo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

case "${1:-}" in
  app) shift; compose_app "$@" ;;
  infra) shift; compose_infra "$@" ;;
  *) die "uso: bg-compose.sh app <color> <args…> | infra <args…>" ;;
esac
