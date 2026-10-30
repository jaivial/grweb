#!/usr/bin/env bash
# Synthetic legacy MySQL in QA (step 16): builds the previous web's schema (deploy/migracion/esquema-legado.sql) with
# synthetic data («Datos de ejemplo», sintetico.py) in the grcup-qa namespace, with a SELECT-only user for the ETL,
# and leaves its DSN in the Secret grcup-legado (MYSQL_DSN), which migrar-legado.sh reads, plus the password of the
# synthetic team (QA_PASSWORD, to try the login with an imported password). QA never receives data from production.
#
# Usage (from platform/): deploy/scripts/legado-qa.sh            create or recreate it
#                         deploy/scripts/legado-qa.sh --borrar   remove it (pod, service, policy, config, secret)
set -euo pipefail
cd "$(dirname "$0")/../.."
KRAKEN="${KRAKEN:-kraken}"
NS="${NS:-grcup-qa}"
K="sudo k3s kubectl -n $NS"

if [ "${1:-}" = "--borrar" ]; then
  ssh "$KRAKEN" "$K delete -l app.kubernetes.io/part-of=grcup-legado deploy,job,service,networkpolicy,configmap --ignore-not-found; $K delete secret grcup-legado --ignore-not-found"
  echo "✓ BD heredada sintética eliminada de $NS"
  exit 0
fi

root=$(openssl rand -hex 18)
etl=$(openssl rand -hex 18)
equipo=$(openssl rand -base64 18 | tr -d '/+=')
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp deploy/migracion/esquema-legado.sql "$tmp/01-esquema.sql"
LEGADO_PASSWORD="$equipo" python3 deploy/migracion/sintetico.py > "$tmp/02-sintetico.sql"
cat > "$tmp/03-lector.sh" <<'EOF'
# SELECT-only user of the ETL (sourced by the MySQL entrypoint after the .sql files)
docker_process_sql --database=mysql <<-EOSQL
	CREATE USER 'etl'@'%' IDENTIFIED BY '${ETL_PASSWORD}';
	GRANT SELECT ON grcup.* TO 'etl'@'%';
EOSQL
EOF
echo "→ BD heredada sintética en $NS ($(grep -c '^(' "$tmp/02-sintetico.sql") filas de ejemplo)"
# secrets travel over ssh stdin, never on a command line
tar -C "$tmp" -cf - . | ssh "$KRAKEN" "set -e
d=\$(mktemp -d /tmp/grcup-legado.XXXXXX)
tar -C \$d -xf -
$K delete -l app.kubernetes.io/part-of=grcup-legado deploy --ignore-not-found >/dev/null
$K create configmap legado-mysql-init --from-file=\$d --dry-run=client -o yaml | sudo k3s kubectl label --local -f - app.kubernetes.io/part-of=grcup-legado -o yaml | $K apply -f - >/dev/null
rm -rf \$d"
# the Secret is built here and applied from stdin: its values never reach a command line
ROOT="$root" ETL="$etl" EQUIPO="$equipo" python3 -c '
import json, os
print(json.dumps({"apiVersion": "v1", "kind": "Secret", "type": "Opaque",
                  "metadata": {"name": "grcup-legado", "labels": {"app.kubernetes.io/part-of": "grcup-legado"}},
                  "stringData": {"MYSQL_ROOT_PASSWORD": os.environ["ROOT"], "ETL_PASSWORD": os.environ["ETL"], "QA_PASSWORD": os.environ["EQUIPO"],
                                 "MYSQL_DSN": "etl:" + os.environ["ETL"] + "@tcp(legado-mysql:3306)/grcup"}}))
' | ssh "$KRAKEN" "$K apply -f - >/dev/null"
ssh "$KRAKEN" "$K apply -f -" < deploy/migracion/legado-mysql.yaml
ssh "$KRAKEN" "$K rollout status deploy/legado-mysql --timeout=300s"
echo "✓ BD heredada sintética lista: legado-mysql:3306 (usuario etl, solo SELECT; DSN en el Secret grcup-legado)"
