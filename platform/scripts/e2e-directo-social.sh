#!/usr/bin/env bash
# e2e-directo-social.sh — pruebas extremo a extremo del paso 17 (directo social) por el GATEWAY.
#
# Requisitos: curl, jq, go (para el helper WebSocket scripts/e2e-ws.go) y docker (para sacar el enlace
# mágico del log de fans en dev). El stack debe estar levantado (deploy/dev/compose.yml).
#
# Variables de entorno: GW (gateway), SLUG (competición sembrada), EMAIL_ROOT/PASS_ROOT (root de dev),
# ATLETA_EMAIL (email de un atleta confirmado del seed de athletes), SOLO=<seccion> para ejecutar una parte.
# Secciones: setup fans chat donaciones patrocinio juegos resumen.
#
# Uso: bash scripts/e2e-directo-social.sh
set -u
cd "$(dirname "$0")/.." || exit 1

GW="${GW:-http://127.0.0.1:18300}"
SLUG="${SLUG:-grcup}"
EMAIL_ROOT="${EMAIL_ROOT:-root@grcup.local}"
PASS_ROOT="${PASS_ROOT:-root-dev-password}"
ATLETA_EMAIL="${ATLETA_EMAIL:-alba.dominguez.garcia@ejemplo.test}"
# El fan «atleta» se crea con el email de un atleta del seed: si se repite el email, la cuenta (y su cartera)
# se reutilizan, así que el e2e rota entre varios para que cada ejecución tenga una cartera nueva.
ATLETA_EMAILS="${ATLETA_EMAILS:-alba.dominguez.garcia@ejemplo.test ana.rubio.ferrer@ejemplo.test ainhoa.molina.gil@ejemplo.test joan.castillo.ortega@ejemplo.test elena.torres.serrano@ejemplo.test lucia.martinez.lopez@ejemplo.test adrian.molina@ejemplo.test alicia.blanco.marin@ejemplo.test}"
ATLETA_EMAIL_MAL="${ATLETA_EMAIL_MAL:-nadie@ejemplo.test}"
HOY="${HOY:-$(TZ=Europe/Madrid date +%F)}"
STAMP="$(date +%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASOS=0; OKS=0; FALLOS=0
paso()   { echo; echo "== $*"; PASOS=$((PASOS+1)); }
ok()     { echo "   OK    · $*"; OKS=$((OKS+1)); }
fallo()  { echo "   FALLO · $*"; FALLOS=$((FALLOS+1)); }
nota()   { echo "         · $*"; }
espera() { echo "         · espero ${1}s ($2)"; sleep "$1"; }

# api MÉTODO URL [CUERPO] [CURL_EXTRA...] → código HTTP en stdout, cuerpo en $TMP/resp.
# Ojo: con 2 argumentos (sin cuerpo) hay que shifting 2, no 3 (si no, curl recibe la URL dos veces).
api() {
  local metodo="$1" url="$2" cuerpo="${3:-}"
  if [ "$#" -ge 3 ]; then shift 3; else shift 2; fi
  if [ -n "$cuerpo" ]; then
    curl -s -o "$TMP/resp" -w '%{http_code}' -X "$metodo" -H 'Content-Type: application/json' "$@" -d "$cuerpo" "$url"
  else
    curl -s -o "$TMP/resp" -w '%{http_code}' -X "$metodo" "$@" "$url"
  fi
}

# etag URL [CURL_EXTRA...] → el ETag de la respuesta (con comillas, tal cual lo devuelve el servicio).
etag() {
  local url="$1"; shift
  curl -s -o /dev/null -D - "$@" "$url" | tr -d '\r' | awk 'tolower($1)=="etag:"{print $2}' | tail -1
}

# json VALOR → imprime el valor como JSON compacto (para meterlo en otro cuerpo).
jq_c() { jq -c "$1" <<<"$2"; }

JWT=''; JAR_PUB="$TMP/fan-publico.jar"; JAR_ATE="$TMP/fan-atleta.jar"; JAR_MIL="$TMP/fan-millas.jar"
WS_BASE="$(printf '%s' "$GW" | sed 's|^http://|ws://|; s|^https://|wss://|')"
CID=''; JID=''; MAOP=''; MAOP2=''; MID=''; AID=''; AT2=''; AT3=''; WS_BIN="$TMP/e2e-ws"

# resolver el cid de la competición con un JWT dado (la vista pública no incluye el id)
resolver_cid() {
  local jwt="$1"
  curl -s -H "Authorization: Bearer $jwt" "$GW/api/admin/competiciones" | jq -r --arg s "$SLUG" '.[] | select(.slug==$s) | .id' | head -1
}

# crear_fan EMAIL ALIAS JAR → pide el acceso, saca el enlace del log y canjea el token (cookie en el jar).
crear_fan() {
  local email="$1" alias="$2" jar="$3" enlace tok code
  code=$(api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"$email\",\"tipo\":\"publico\",\"alias\":\"$alias\",\"aceptaNormas\":true}")
  [ "$code" = 202 ] || { nota "no pude pedir el acceso de $alias (HTTP $code)"; return 1; }
  enlace="$(docker logs grcup-dev-fans-1 --since 3m 2>/dev/null \
    | jq -Rr 'fromjson? | select(.msg=="enlace mágico de fan (dev)") | select(.alias=="'"$alias"'") | .enlace' | tail -1)"
  tok="${enlace##*acceso=}"
  if [ -z "$tok" ] || [ "$tok" = "$enlace" ]; then nota "no hay enlace mágico de $alias en el log"; return 1; fi
  code=$(api POST "$GW/api/competiciones/$SLUG/fans/canjear" "{\"token\":\"$tok\"}" -c "$jar")
  [ "$code" = 200 ] || { nota "no pude canjear a $alias (HTTP $code)"; return 1; }
  return 0
}

# cartera JAR → imprime "porra fantasy" de la cartera de la jornada activa.
cartera() {
  api GET "$GW/api/competiciones/$SLUG/juegos/cartera?jornada=$JID" "" -b "$1" >/dev/null
  jq -r '"\(.porra // 0) \(.fantasy // 0)"' "$TMP/resp" 2>/dev/null
}

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "setup" ]; then
paso "0 · login del root y datos de la competición"
code=$(api POST "$GW/api/auth/login" "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}")
if [ "$code" != 200 ]; then fallo "login root (HTTP $code): $(head -c 200 "$TMP/resp")"; else
  JWT="$(jq -r .accessToken "$TMP/resp")"; ok "login root, JWT de acceso"
fi
AUTH=(-H "Authorization: Bearer $JWT")
CID="$(resolver_cid "$JWT")"
if [ -z "$CID" ]; then fallo "no pude resolver el id de $SLUG por la lista admin"; else
  ok "competición $SLUG → cid $CID"
fi

paso "0b · horarios publicados con flights HOY ($HOY) y atletas (para el marcador interno de live)"
code=$(api GET "$GW/api/admin/competiciones/$CID/horarios" "" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "GET horarios (HTTP $code): $(head -c 200 "$TMP/resp")"; else
  HOY_FLIGHTS="$(jq -r --arg d "$HOY" '[.flights[]? | select(.dia==$d)] | length' "$TMP/resp")"
  HOY_ATLETAS="$(jq -r --arg d "$HOY" '[.flights[]? | select(.dia==$d) | .atletas[]?] | length' "$TMP/resp")"
  PUBLICADO="$(jq -r '.publicado // false' "$TMP/resp")"
  if [ "${HOY_FLIGHTS:-0}" -eq 0 ] || [ "${HOY_ATLETAS:-0}" -eq 0 ]; then
    nota "no hay flights de hoy con atletas ($HOY_FLIGHTS flights, $HOY_ATLETAS atletas): los creo y publico"
    ETAGH="$(etag "$GW/api/admin/competiciones/$CID/horarios" "${AUTH[@]}")"
    # el planificador llena el primer día de la lista: para que HOY tenga flights, los días anteriores se
    # quitan (los posteriores se conservan).
    # mesasPesaje = 4: el generador de schedule puede dejar dos pesajes solapados en la misma mesa con 2 mesas
    # (fallo previo del planificador, fuera de este paso); con datos de prueba basta con más mesas.
    CFGH="$(jq -c --arg d "$HOY" '.config | .mesasPesaje = 4 | .dias = [{"fecha":$d,"inicio":"09:00","fin":"21:00","puertas":"08:30"}] + ((.dias // []) | map(select(.fecha > $d)))' "$TMP/resp")"
    code=$(api PUT "$GW/api/admin/competiciones/$CID/horarios/config" "$CFGH" "${AUTH[@]}" -H "If-Match: $ETAGH")
    [ "$code" = 200 ] && ok "config de horarios con el día de hoy" || fallo "PUT horarios/config (HTTP $code): $(head -c 200 "$TMP/resp")"
    code=$(api POST "$GW/api/admin/competiciones/$CID/horarios/generar" '{}' "${AUTH[@]}")
    [ "$code" = 200 ] && ok "flights generados: $(jq -r '.flights | length' "$TMP/resp")" || fallo "POST horarios/generar (HTTP $code): $(head -c 200 "$TMP/resp")"
  else
    ok "$HOY_FLIGHTS flights de hoy con $HOY_ATLETAS atletas"
  fi
  if [ "${PUBLICADO:-false}" != "true" ] || [ "${HOY_FLIGHTS:-0}" -eq 0 ]; then
    code=$(api POST "$GW/api/admin/competiciones/$CID/horarios/publicar" '{"avisarAtletas":false,"avisarSeguidores":false}' "${AUTH[@]}")
    if [ "$code" != 200 ]; then fallo "POST horarios/publicar (HTTP $code): $(head -c 200 "$TMP/resp")"; else
      ok "horarios publicados (versión $(jq -r .version "$TMP/resp"))"; nota "la caché del plan de live dura 15 s"; espera 16 "caché del plan de live"
    fi
  else
    ok "los horarios ya estaban publicados (versión $(jq -r '.publicada.numero // "?"' "$TMP/resp"))"
  fi
fi

paso "0c · jornada de juegos de hoy (dia=$HOY) abierta"
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/jornadas" "" "${AUTH[@]}")
JID="$(jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" "$TMP/resp" | head -1)"
if [ -z "$JID" ]; then
  code=$(api POST "$GW/api/admin/competiciones/$CID/juegos/jornadas" "{\"dia\":\"$HOY\",\"nombre\":\"AEP-2 (e2e)\"}" "${AUTH[@]}")
  if [ "$code" != 201 ]; then fallo "crear jornada (HTTP $code): $(head -c 200 "$TMP/resp")"; else JID="$(jq -r .id "$TMP/resp")"; ok "jornada creada $JID"; fi
else
  ok "jornada de hoy ya existía: $JID"
fi
code=$(api PATCH "$GW/api/admin/competiciones/$CID/juegos/jornadas/$JID" '{"estado":"abierta"}' "${AUTH[@]}")
if [ "$code" != 204 ] && [ "$code" != 200 ]; then fallo "abrir jornada (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "jornada abierta"; fi

paso "0d · config de juegos con la protección de clausulazo a 0 (la real es 10 min)"
code=$(api GET "$GW/api/admin/competiciones/$CID/juegos/config" "" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "GET juegos/config (HTTP $code)"; else
  CFGJ="$(jq -c '. | .proteccionMin = 0 | .activo = true' "$TMP/resp")"
  VERJ="$(jq -r '.version // 1' "$TMP/resp")"
  code=$(api PUT "$GW/api/admin/competiciones/$CID/juegos/config" "$CFGJ" "${AUTH[@]}" -H "If-Match: \"$VERJ\"")
  if [ "$code" != 200 ]; then fallo "PUT juegos/config (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "proteccionMin=0"; fi
fi

paso "0e · el marcador interno de live devuelve atletas de hoy (sincronizar de juegos)"
code=$(api POST "$GW/api/admin/competiciones/$CID/juegos/fantasy/sincronizar" "{\"jornada\":\"$JID\"}" "${AUTH[@]}")
if [ "$code" != 204 ] && [ "$code" != 200 ]; then fallo "sincronizar (HTTP $code): $(head -c 300 "$TMP/resp")"; else ok "sincronización desde el marcador hecha"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/jornadas/$JID")
NATS="$(jq -r '.atletas | length' "$TMP/resp" 2>/dev/null)"
if [ "${NATS:-0}" -ge 1 ]; then ok "la jornada tiene $NATS atletas con cláusula (marcador con datos)"; else fallo "la jornada no tiene atletas (marcador vacío para $HOY)"; fi
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "fans" ]; then
[ -z "$CID" ] && { api GET "$GW/api/competiciones/$SLUG" >/dev/null 2>&1; CID="$(curl -s "$GW/api/competiciones/$SLUG" | jq -r .id)"; JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); }
[ -z "$JID" ] && JID="$(curl -s "$GW/api/competiciones/$SLUG/juegos/jornadas" | jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" | head -1)"

paso "1a · fans: enlace mágico como PÚBLICO → canjear → cookie en /fans/yo"
# el límite de accesos es de 20 por IP y hora (§3): en desarrollo limpio el contador para poder crear los fans
for k in $(docker compose -f deploy/dev/compose.yml exec -T redis redis-cli -a dev-redis --no-auth-warning --scan --pattern '*rl:fans:*' 2>/dev/null); do
  docker compose -f deploy/dev/compose.yml exec -T redis redis-cli -a dev-redis --no-auth-warning DEL "$k" >/dev/null 2>&1
done
ALIAS_PUB="e2e_pub_$STAMP"
code=$(api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"e2e-$STAMP@ejemplo.test\",\"tipo\":\"publico\",\"alias\":\"$ALIAS_PUB\",\"aceptaNormas\":true}")
if [ "$code" != 202 ]; then fallo "POST fans/acceso público (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "acceso pedido (202)"; fi
ENLACE="$(docker logs grcup-dev-fans-1 --since 3m 2>/dev/null | jq -Rr 'fromjson? | select(.msg=="enlace mágico de fan (dev)") | select(.alias=="'"$ALIAS_PUB"'") | .enlace' | tail -1)"
TOK="${ENLACE##*acceso=}"
if [ -z "$TOK" ] || [ "$TOK" = "$ENLACE" ]; then fallo "no hay enlace mágico en el log de fans"; else
  ok "enlace sacado del log (token ${TOK:0:8}…)"
  code=$(api POST "$GW/api/competiciones/$SLUG/fans/canjear" "{\"token\":\"$TOK\"}" -c "$JAR_PUB")
  if [ "$code" != 200 ]; then fallo "canjear token (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "canjeado, cookie grcup_fan guardada"; fi
  code=$(api GET "$GW/api/competiciones/$SLUG/fans/yo" "" -b "$JAR_PUB")
  if [ "$code" != 200 ] || [ "$(jq -r .alias "$TMP/resp")" != "$ALIAS_PUB" ]; then fallo "GET fans/yo con cookie (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fans/yo: alias=$(jq -r .alias "$TMP/resp") tipo=$(jq -r .tipo "$TMP/resp")"; fi
fi

paso "1b · fans: como ATLETA (email del seed) y email inexistente (ATLETA_NO_ENCONTRADO)"
# rota el email del atleta para no reutilizar la cuenta (y su cartera) de una ejecución anterior
LISTA=($ATLETA_EMAILS)
RC="${RC:-/tmp/e2e-directo-social.run}"; N=$(cat "$RC" 2>/dev/null || echo 0); N=$((N+1)); echo "$N" > "$RC"
IDX=$(( N % ${#LISTA[@]} ))
ATLETA_EMAIL="${LISTA[$IDX]}"
nota "email del atleta: $ATLETA_EMAIL"
ALIAS_ATE="e2e_ate_$STAMP"
code=$(api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"$ATLETA_EMAIL\",\"tipo\":\"atleta\",\"alias\":\"$ALIAS_ATE\",\"aceptaNormas\":true}")
if [ "$code" != 202 ]; then fallo "POST fans/acceso atleta (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "acceso de atleta pedido (202)"; fi
ENLACE="$(docker logs grcup-dev-fans-1 --since 3m 2>/dev/null | jq -Rr 'fromjson? | select(.msg=="enlace mágico de fan (dev)") | select(.alias=="'"$ALIAS_ATE"'") | .enlace' | tail -1)"
TOK="${ENLACE##*acceso=}"
if [ -z "$TOK" ] || [ "$TOK" = "$ENLACE" ]; then fallo "no hay enlace de atleta en el log"; else
  code=$(api POST "$GW/api/competiciones/$SLUG/fans/canjear" "{\"token\":\"$TOK\"}" -c "$JAR_ATE")
  code2=$(api GET "$GW/api/competiciones/$SLUG/fans/yo" "" -b "$JAR_ATE")
  if [ "$code" != 200 ] || [ "$code2" != 200 ] || [ "$(jq -r '.atletaId // empty' "$TMP/resp")" = "" ]; then fallo "canje/yo de atleta (canje $code, yo $code2): $(head -c 200 "$TMP/resp")"; else ok "atleta canjeado: insignia=$(jq -r .insignia "$TMP/resp") atletaId=$(jq -r .atletaId "$TMP/resp" | head -c 8)…"; fi
fi
code=$(api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"$ATLETA_EMAIL_MAL\",\"tipo\":\"atleta\",\"alias\":\"e2e_mal_$STAMP\",\"aceptaNormas\":true}")
if [ "$code" = 422 ] && grep -q ATLETA_NO_ENCONTRADO "$TMP/resp"; then ok "email inexistente → 422 ATLETA_NO_ENCONTRADO"; else fallo "email inexistente: esperaba 422 ATLETA_NO_ENCONTRADO y llegó $code"; fi
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "chat" ]; then
[ -z "$CID" ] && { JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); CID="$(resolver_cid "$JWT")"; }
[ -z "$JID" ] && JID="$(curl -s "$GW/api/competiciones/$SLUG/juegos/jornadas" | jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" | head -1)"
if ! cgrun -m 2G -n e2e-ws-build -- go build -o "$WS_BIN" scripts/e2e-ws.go >/dev/null 2>"$TMP/ws-build.err"; then
  fallo "no pude compilar el cliente WS: $(head -c 300 "$TMP/ws-build.err")"
else ok "cliente WS compilado"; fi
WS_OUT="$TMP/ws-sala.log"; : > "$WS_OUT"
cgrun -m 2G -n e2e-ws-lector -- "$WS_BIN" -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -seg 220 > "$WS_OUT" 2>"$TMP/ws-lector.err" &
WS_PID=$!
espera 2 "arranque del lector WS"

paso "2a · chat: REST + dos clientes que se ven + SSE"
T1="hola sala e2e $STAMP"
code=$(api POST "$GW/api/competiciones/$SLUG/chat/mensajes" "{\"texto\":\"$T1\"}" -b "$JAR_PUB")
if [ "$code" != 201 ] && [ "$code" != 200 ]; then fallo "POST chat/mensajes (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "mensaje REST enviado (id $(jq -r .id "$TMP/resp" | head -c 16)…)"; fi
code=$(api POST "$GW/api/competiciones/$SLUG/chat/mensajes" "{\"texto\":\"segundo cliente $STAMP\"}" -b "$JAR_ATE")
if [ "$code" != 201 ] && [ "$code" != 200 ]; then fallo "POST chat/mensajes del 2.º fan (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "mensaje del 2.º fan enviado"; fi
# el lector WS (cliente 3, anónimo) debe ver los dos
sleep 2
if grep -q "$T1" "$WS_OUT" && grep -q "segundo cliente $STAMP" "$WS_OUT"; then ok "los dos mensajes llegan por WebSocket"; else fallo "el lector WS no vio los mensajes (veo: $(grep -c '"t":"msg"' "$WS_OUT") msg)"; fi
# SSE: el mismo flujo en un stream HTTP
( sleep 1; curl -s -N --max-time 6 "$GW/api/competiciones/$SLUG/chat/stream" > "$TMP/sse.log" 2>/dev/null ) &
SSE_PID=$!
sleep 3
api POST "$GW/api/competiciones/$SLUG/chat/mensajes" "{\"texto\":\"por sse $STAMP\"}" -b "$JAR_PUB" >/dev/null
wait "$SSE_PID" 2>/dev/null
if grep -q "por sse $STAMP" "$TMP/sse.log"; then ok "SSE recibe los mensajes"; else fallo "SSE no vio el mensaje (bytes: $(wc -c < "$TMP/sse.log"))"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/chat/mensajes?limite=10" "" -b "$JAR_PUB")
if [ "$code" = 200 ] && [ "$(jq -r '.mensajes | length' "$TMP/resp")" -ge 2 ]; then ok "historial REST devuelve mensajes"; else fallo "historial (HTTP $code)"; fi

paso "2b · chat: límite de ritmo (el 6.º mensaje rápido → 429)"
code429=0; i=0
for i in 1 2 3 4 5 6 7; do
  code=$(api POST "$GW/api/competiciones/$SLUG/chat/mensajes" "{\"texto\":\"ráfaga $i $STAMP\"}" -b "$JAR_PUB")
  [ -s "$TMP/resp" ] || printf '{}' > "$TMP/resp"
  if [ "$code" = 429 ]; then code429=1; break; fi
  sleep 0.3
done
if [ "$code429" = 1 ]; then ok "429 en el mensaje $i (ráfaga de 5, fan público)"; else fallo "ningún 429 con ráfaga rápida (último $code)"; fi

paso "2c · chat: 10 mensajes contables → hitos 5 y 10 → cartera +700 porra y +70.000 fantasy"
ALIAS_MIL="e2e_mil_$STAMP"
if ! crear_fan "e2e-millas-$STAMP@ejemplo.test" "$ALIAS_MIL" "$JAR_MIL"; then fallo "no pude crear el fan de las millas"; fi
read -r PORRA0 FANTA0 <<<"$(cartera "$JAR_MIL")"
nota "cartera inicial del fan de las millas: porra=${PORRA0:-?} fantasy=${FANTA0:-?}"
cgrun -m 2G -n e2e-ws-millas -- "$WS_BIN" -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -fan "$(awk '$6=="grcup_fan"{print $7}' "$JAR_MIL" | tail -1)" -seg 60 -n 10 -pausa 2300ms -texto "millas $STAMP" > "$TMP/ws-millas.log" 2>"$TMP/ws-millas.err"
HITOS="$(grep '"t":"hito"' "$TMP/ws-millas.log" | jq -r '.mensajes' 2>/dev/null | tr '\n' ' ')"
if echo "$HITOS" | grep -q '\b5\b' && echo "$HITOS" | grep -q '\b10\b'; then ok "hitos recibidos por WS: $(echo $HITOS | tr ' ' ',')"; else fallo "hitos esperados 5 y 10; recibidos: ${HITOS:-ninguno} ($(grep -c '"t":"msg"' "$TMP/ws-millas.log") msg vistos)"; fi
espera 9 "juegos-worker acredita las recompensas"
read -r PORRA1 FANTA1 <<<"$(cartera "$JAR_MIL")"
D_PORRA=$(( PORRA1 - PORRA0 )); D_FANTA=$(( FANTA1 - FANTA0 ))
if [ "$D_PORRA" = 700 ] && [ "$D_FANTA" = 70000 ]; then
  ok "cartera tras hitos: porra $PORRA0→$PORRA1 (+700 = 100+100+500) · fantasy $FANTA0→$FANTA1 (+70.000 = 10k+10k+50k)"
else fallo "hitos: esperaba porra +700 y fantasy +70.000; hay porra +$D_PORRA y fantasy +$D_FANTA"; fi
kill "$WS_PID" 2>/dev/null
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "donaciones" ]; then
[ -z "$CID" ] && { JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); CID="$(resolver_cid "$JWT")"; }
[ -z "$JID" ] && JID="$(curl -s "$GW/api/competiciones/$SLUG/juegos/jornadas" | jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" | head -1)"
[ -s "$JAR_MIL" ] || { nota "no hay fan de las millas en esta ejecución parcial; creo uno"; ALIAS_MIL="e2e_mil_$STAMP"; crear_fan "e2e-millas-$STAMP@ejemplo.test" "$ALIAS_MIL" "$JAR_MIL"; }
ALIAS_MIL="${ALIAS_MIL:-e2e_mil_$STAMP}"

paso "3 · donaciones: activar la config → crear → pagar simulado → confirmada (chat, ranking, fantasy) → reembolso"
code=$(api GET "$GW/api/admin/competiciones/$CID/donaciones" "" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "GET panel de donaciones (HTTP $code): $(head -c 200 "$TMP/resp")"; else
  CFGD="$(jq -c '.config | .activo = true' "$TMP/resp")"
  ETAGD="$(etag "$GW/api/admin/competiciones/$CID/donaciones" "${AUTH[@]}")"
  code=$(api PUT "$GW/api/admin/competiciones/$CID/donaciones/config" "$CFGD" "${AUTH[@]}" -H "If-Match: $ETAGD")
  if [ "$code" != 200 ]; then fallo "PUT donaciones/config (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "donaciones activadas (versión $(jq -r .config.version "$TMP/resp"))"; fi
fi
WS_OUT_D="$TMP/ws-dona.log"; : > "$WS_OUT_D"
cgrun -m 2G -n e2e-ws-dona -- "$WS_BIN" -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -seg 70 > "$WS_OUT_D" 2>/dev/null &
WS_PID_D=$!
espera 2 "lector WS para el frame de donación"
read -r _ F0 <<<"$(cartera "$JAR_MIL")"
code=$(api POST "$GW/api/competiciones/$SLUG/donaciones" '{"importe":500,"mensaje":"para el club","anonimo":false}' -b "$JAR_MIL")
if [ "$code" != 201 ] && [ "$code" != 200 ]; then fallo "crear donativo (HTTP $code): $(head -c 200 "$TMP/resp")"; else
  DONID="$(jq -r .donacionId "$TMP/resp")"; SESS="$(jq -r .url "$TMP/resp" | sed 's/.*s=donaciones://')"
  ok "donativo creado $DONID · sesión simulada $SESS"
  code=$(api GET "$GW/api/pagos/simulado/donaciones/$SESS")
  if [ "$code" = 200 ] && [ "$(jq -r .estado "$TMP/resp")" = "open" ]; then ok "sesión de pago visible (estado open, 5,00 €)"; else fallo "GET sesión simulada (HTTP $code): $(head -c 120 "$TMP/resp")"; fi
  code=$(api POST "$GW/api/pagos/simulado/donaciones/$SESS/pagar" '{"tarjeta":"4242 4242 4242 4242"}')
  if [ "$code" = 200 ] && [ "$(jq -r .estado "$TMP/resp")" = "pagado" ]; then ok "pago simulado completado (webhook entregado)"; else fallo "pagar simulado (HTTP $code): $(head -c 200 "$TMP/resp")"; fi
  espera 9 "worker consume donacion.confirmada"
  if grep -q '"t":"donacion"' "$WS_OUT_D"; then ok "frame t=donacion en el chat (importe $(grep -o '"importe":[0-9]*' "$WS_OUT_D" | head -1))"; else fallo "no llegó el frame t=donacion al chat"; fi
  read -r _ F1 <<<"$(cartera "$JAR_MIL")"
  if [ $(( F1 - F0 )) = 50000 ]; then ok "fantasy +50.000 por 5,00 € (saldo $F0→$F1)"; else fallo "fantasy esperaba +50.000; hay +$(( F1 - F0 )) ($F0→$F1)"; fi
  code=$(api GET "$GW/api/competiciones/$SLUG/donaciones/ranking?dia=$HOY")
  TOPALIAS="$(jq -r '[.items[]?.alias] | join(",")' "$TMP/resp" 2>/dev/null)"
  if [ "$code" = 200 ] && [ "$(jq -r '.totalRecaudado // 0' "$TMP/resp")" -ge 500 ] && echo "$TOPALIAS" | grep -q "$ALIAS_MIL"; then ok "ranking: total $(jq -r .totalRecaudado "$TMP/resp") céntimos, donante visible en el top ($TOPALIAS)"; else fallo "ranking (HTTP $code): $(head -c 200 "$TMP/resp")"; fi
  code=$(api POST "$GW/api/admin/competiciones/$CID/donaciones/$DONID/reembolso" '{"motivo":"prueba e2e"}' "${AUTH[@]}")
  if [ "$code" != 200 ] && [ "$code" != 204 ]; then fallo "reembolso admin (HTTP $code): $(head -c 200 "$TMP/resp")"; else
    ok "reembolso pedido"; espera 9 "worker retira la recompensa"
    read -r _ F2 <<<"$(cartera "$JAR_MIL")"
    if [ $(( F2 - F0 )) = 0 ]; then ok "reembolso retira los +50.000 (fantasy vuelve a $F2)"; else fallo "tras reembolso esperaba $F0; hay $F2"; fi
  fi
fi
kill "$WS_PID_D" 2>/dev/null
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "patrocinio" ]; then
[ -z "$CID" ] && { JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); CID="$(resolver_cid "$JWT")"; }
WS_OUT_B="$TMP/ws-banners.log"; : > "$WS_OUT_B"
cgrun -m 2G -n e2e-ws-banners -- "$WS_BIN" -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -seg 300 > "$WS_OUT_B" 2>/dev/null &
WS_PID_B=$!

paso "4 · patrocinio: 3 banners (oro/plata/bronce), intervalo 15 s, frames t=banner y clic 302"
# el config se guarda con If-Match (el ETag que devuelve el GET)
CFGP="$(curl -s -H "Authorization: Bearer $JWT" "$GW/api/admin/competiciones/$CID/patrocinio/config")"
ETAGP="$(etag "$GW/api/admin/competiciones/$CID/patrocinio/config" "${AUTH[@]}")"
CFG_P="$(jq -c '. | .intervaloSeg = 15 | .soloEnDirecto = false | .activo = true' <<<"$CFGP")"
code=$(api PUT "$GW/api/admin/competiciones/$CID/patrocinio/config" "$CFG_P" "${AUTH[@]}" -H "If-Match: $ETAGP")
if [ "$code" != 200 ]; then fallo "PUT patrocinio/config (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "config: intervalo 15 s, solo_en_directo=false, activo (versión $(jq -r .version "$TMP/resp"))"; fi
# los banners que ya estaban activos se apagan: así los 3 nuevos son la primera ronda y el reparto por peso
BANNERS="$(curl -s -H "Authorization: Bearer $JWT" "$GW/api/admin/competiciones/$CID/patrocinio/banners")"
APAGADOS=0
for pid in $(jq -r '.items[]? | select(.activo == true) | .id' <<<"$BANNERS"); do
  BJ="$(jq -c --arg id "$pid" '.items[] | select(.id==$id)' <<<"$BANNERS")"
  [ -z "$BJ" ] && continue
  ETAGB="\"$(jq -r .version <<<"$BJ")\""
  BJ2="$(jq -c '. | .activo = false' <<<"$BJ")"
  code=$(api PUT "$GW/api/admin/competiciones/$CID/patrocinio/banners/$pid" "$BJ2" "${AUTH[@]}" -H "If-Match: $ETAGB")
  [ "$code" = 200 ] && APAGADOS=$((APAGADOS+1))
done
[ "$APAGADOS" -gt 0 ] && nota "apagados $APAGADOS banners anteriores (el e2e usa el espacio de banners en exclusiva)"
declare -A BID
i=0
for tier in oro plata bronce; do
  i=$((i+1))
  code=$(api POST "$GW/api/admin/competiciones/$CID/patrocinio/banners" "{\"patrocinador\":\"Patrocinador $tier e2e $STAMP\",\"imagenUrl\":\"https://ejemplo.test/$tier.png\",\"urlDestino\":\"https://ejemplo.test/$tier\",\"tier\":\"$tier\",\"activo\":true,\"orden\":$i}" "${AUTH[@]}")
  if [ "$code" != 201 ]; then fallo "crear banner $tier (HTTP $code): $(head -c 200 "$TMP/resp")"; else BID[$tier]="$(jq -r .id "$TMP/resp")"; ok "banner $tier creado ${BID[$tier]}"; fi
done
nota "el worker saca los 3 pendientes primero (1 por tic) y luego repite por peso 3:2:1"
espera 240 "worker de banners (intervalo 15 s): 3 pendientes + varias rondas por peso"
NB="$(grep -c '"t":"banner"' "$WS_OUT_B" 2>/dev/null || echo 0)"
if [ "${NB:-0}" -ge 3 ]; then
  ok "frames t=banner llegan al chat ($NB frames)"
  MIOS="$(for t in oro plata bronce; do grep '"t":"banner"' "$WS_OUT_B" | jq -r --arg t "Patrocinador $t e2e $STAMP" 'select(.patrocinador==$t) | .bannerId'; done | sort -u | wc -l)"
  if [ "$MIOS" = 3 ]; then ok "los tres banners salen una vez cada uno antes de repetir"; else fallo "no salieron los 3 banners nuevos (vistos: $MIOS de 3)"; fi
  declare -A CNT
  for tier in oro plata bronce; do CNT[$tier]="$(grep '"t":"banner"' "$WS_OUT_B" | jq -r --arg t "Patrocinador $tier e2e $STAMP" 'select(.patrocinador==$t) | .bannerId' | wc -l)"; done
  nota "apariciones: oro=${CNT[oro]} plata=${CNT[plata]} bronce=${CNT[bronce]} (pesos 3:2:1)"
  if [ "${CNT[oro]}" -gt "${CNT[plata]}" ] && [ "${CNT[plata]}" -ge "${CNT[bronce]}" ]; then ok "proporción por peso creciente oro>plata>=bronce"; else fallo "proporciones fuera de lo esperado: ${CNT[oro]}/${CNT[plata]}/${CNT[bronce]}"; fi
else fallo "no llegó ningún frame t=banner (lector: $(wc -l < "$WS_OUT_B") líneas)"; fi
CLIC="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$GW/api/competiciones/$SLUG/patrocinio/banners/${BID[oro]}/clic")"
if [ "$CLIC" = "302 https://ejemplo.test/oro" ]; then ok "clic registra y redirige 302 → https://ejemplo.test/oro"; else fallo "clic esperaba 302 a /oro; llegó: $CLIC"; fi
kill "$WS_PID_B" 2>/dev/null
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "juegos" ]; then
[ -z "$CID" ] && { JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); CID="$(resolver_cid "$JWT")"; }
[ -z "$JID" ] && JID="$(curl -s "$GW/api/competiciones/$SLUG/juegos/jornadas" | jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" | head -1)"
[ -s "$JAR_PUB" ] || { nota "no hay fans canjeados en esta ejecución parcial; los tests de fans son prerrequisito"; }

paso "5a · juegos+live: sincronizar atletas del marcador y generar mercados de porra"
code=$(api POST "$GW/api/admin/competiciones/$CID/juegos/fantasy/sincronizar" "{\"jornada\":\"$JID\"}" "${AUTH[@]}")
if [ "$code" != 204 ] && [ "$code" != 200 ]; then fallo "sincronizar (HTTP $code): $(head -c 300 "$TMP/resp")"; else ok "sincronización desde el marcador hecha"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/jornadas/$JID")
NATS="$(jq -r '.atletas | length' "$TMP/resp" 2>/dev/null)"
if [ "${NATS:-0}" -ge 1 ]; then ok "la jornada tiene $NATS atletas con cláusula"; else fallo "la jornada no tiene atletas (marcador vacío para $HOY)"; fi
code=$(api POST "$GW/api/admin/competiciones/$CID/juegos/mercados/generar" "{\"jornada\":\"$JID\"}" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "generar mercados (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "mercados generados: $(jq -r .creados "$TMP/resp")"; fi

# Elegir una categoría limpia: mercado abierto sin apuestas, categoría sin publicar y sin totales,
# y un atleta libre (para que el fan pueda comprarlo en fantasy).
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/porra/mercados?jornada=$JID")
MERCADOS="$(cat "$TMP/resp")"
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID")
LIBRES="$(jq -c '[.atletas[] | select(.libre == true) | {id: .atletaId, sexo: .sexo, categoria: .categoria}]' "$TMP/resp")"
MID=''; MAOP=''; MAOP2=''; CLAVE=''
for m in $(jq -r '.mercados[] | select(.tipo=="categoria") | .id' <<<"$MERCADOS"); do
  MC="$(jq -c --arg id "$m" '.mercados[] | select(.id==$id)' <<<"$MERCADOS")"
  [ "$(jq -r '.apuestas' <<<"$MC")" = "0" ] || continue
  [ "$(jq -r '.opciones | length' <<<"$MC")" -ge 2 ] || continue  # two bettors on two different athletes
  SEXO="$(jq -r .sexo <<<"$MC")"; CAT="$(jq -r .categoria <<<"$MC")"; CLAVE="$SEXO$CAT"
  LIBRE="$(jq -r --arg s "$SEXO" --arg c "$CAT" '[.[] | select(.sexo==$s and .categoria==$c)][0].id // empty' <<<"$LIBRES")"
  [ -n "$LIBRE" ] || continue
  RES="$(curl -s -H "Authorization: Bearer $JWT" "$GW/api/admin/competiciones/$CID/resultados?categoria=$CLAVE")"
  PUB="$(jq -r --arg c "$CLAVE" '[.categorias[]? | select(.clave==$c) | .publicado != null] | if length==0 then false else .[0] end' <<<"$RES")"
  [ "$PUB" = "false" ] || continue
  TOT="$(jq -r '[.categoria.filas[]? | select(.total != null)] | length' <<<"$RES")"
  [ "${TOT:-0}" = "0" ] || continue
  MID="$m"; MAOP="$LIBRE"; CLAVE="$CLAVE"; break
done
if [ -n "$MID" ]; then ok "mercado de categoría limpio: $MID ($CLAVE), atleta $MAOP"; else fallo "no hay mercado de categoría limpio (sin apuestas, sin publicar y sin totales)"; fi
if [ -n "$MID" ]; then
  MAOP2="$(jq -r --arg m "$MID" --arg a "$MAOP" '[.mercados[] | select(.id==$m) | .opciones[] | select(.atletaId != $a)][0].atletaId' <<<"$MERCADOS")"
  [ -n "$MAOP2" ] && ok "segundo atleta del mercado (para el que pierde): $MAOP2"
fi

paso "5b · porra: el fan público apuesta 1000 al ganador y el fan atleta 2000 a otro (bote 3000)"
read -r PP0 FP0 <<<"$(cartera "$JAR_PUB")"
read -r PA0 FA0 <<<"$(cartera "$JAR_ATE")"
code=$(api POST "$GW/api/competiciones/$SLUG/juegos/porra/apuestas" "{\"mercadoId\":\"$MID\",\"atletaId\":\"$MAOP\",\"importe\":1000,\"jornada\":\"$JID\"}" -b "$JAR_PUB")
if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "apuesta fan público (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan público apuesta 1000 al atleta $MAOP (porra $(jq -r .saldo "$TMP/resp"))"; fi
if [ -s "$JAR_ATE" ] && [ -n "$MAOP2" ]; then
  code=$(api POST "$GW/api/competiciones/$SLUG/juegos/porra/apuestas" "{\"mercadoId\":\"$MID\",\"atletaId\":\"$MAOP2\",\"importe\":2000,\"jornada\":\"$JID\"}" -b "$JAR_ATE")
  if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "apuesta fan atleta (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan atleta apuesta 2000 a $MAOP2 (porra $(jq -r .saldo "$TMP/resp"))"; fi
fi
read -r PP1 FP1 <<<"$(cartera "$JAR_PUB")"
read -r PA1 FA1 <<<"$(cartera "$JAR_ATE")"
nota "porra del fan público: $PP0 → $PP1 (−1000 por la apuesta)"

paso "5c · fantasy: comprar, clausulazo y comprobación del dinero del dueño"
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID")
AT2="$(jq -r --arg a "$MAOP" '[.atletas[] | select(.libre == true and .atletaId != $a)][0].atletaId' "$TMP/resp")"
AT3="$(jq -r --arg a "$MAOP" --arg b "$AT2" '[.atletas[] | select(.libre == true and .atletaId != $a and .atletaId != $b)][0].atletaId' "$TMP/resp")"
CLAU_MAOP="$(jq -r --arg a "$MAOP" '.atletas[] | select(.atletaId==$a) | .clausula' "$TMP/resp")"
CLAU_AT2="$(jq -r --arg a "$AT2" '.atletas[] | select(.atletaId==$a) | .clausula' "$TMP/resp")"
nota "cláusulas: $MAOP=$CLAU_MAOP · $AT2=$CLAU_AT2"
read -r _ FPUB0 <<<"$(cartera "$JAR_PUB")"
read -r _ FATE0 <<<"$(cartera "$JAR_ATE")"
code=$(api POST "$GW/api/competiciones/$SLUG/juegos/fantasy/comprar" "{\"atletaId\":\"$MAOP\",\"jornada\":\"$JID\"}" -b "$JAR_PUB")
if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "comprar MAOP (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan público compra $MAOP por $CLAU_MAOP (fantasy $(jq -r .saldo "$TMP/resp"))"; fi
code=$(api POST "$GW/api/competiciones/$SLUG/juegos/fantasy/comprar" "{\"atletaId\":\"$AT2\",\"jornada\":\"$JID\"}" -b "$JAR_PUB")
if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "comprar AT2 (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan público compra $AT2 por $CLAU_AT2 (fantasy $(jq -r .saldo "$TMP/resp"))"; fi
if [ -s "$JAR_ATE" ] && [ -n "$AT3" ]; then
  code=$(api POST "$GW/api/competiciones/$SLUG/juegos/fantasy/comprar" "{\"atletaId\":\"$AT3\",\"jornada\":\"$JID\"}" -b "$JAR_ATE")
  if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "comprar AT3 (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan atleta compra $AT3 (fantasy $(jq -r .saldo "$TMP/resp"))"; fi
  code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID")
  CLAU_AT2B="$(jq -r --arg a "$AT2" '.atletas[] | select(.atletaId==$a) | .clausula' "$TMP/resp")"
  read -r _ FPUB1 <<<"$(cartera "$JAR_PUB")"; read -r _ FATE1 <<<"$(cartera "$JAR_ATE")"
  code=$(api POST "$GW/api/competiciones/$SLUG/juegos/fantasy/clausulazo" "{\"atletaId\":\"$AT2\",\"jornada\":\"$JID\"}" -b "$JAR_ATE")
  if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "clausulazo (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "clausulazo de fan2 sobre $AT2 por $CLAU_AT2B (fantasy fan2 $(jq -r .saldo "$TMP/resp"))"; fi
  read -r _ FPUB2 <<<"$(cartera "$JAR_PUB")"; read -r _ FATE2 <<<"$(cartera "$JAR_ATE")"
  if [ $(( FPUB2 - FPUB1 )) -gt 0 ]; then ok "el dinero del clausulazo llega al dueño anterior (+$(( FPUB2 - FPUB1 )) fantasy)"; else fallo "el dueño anterior no recibió el dinero (fantasy $FPUB1→$FPUB2)"; fi
  if [ $(( FATE2 - FATE1 )) -lt 0 ]; then ok "el que clausula paga la cláusula (fantasy del fan2 $(( FATE2 - FATE1 )))"; else fallo "el fan2 no pagó la cláusula (fantasy $FATE1→$FATE2)"; fi
fi

paso "5d · live (mesa): declarar y juzgar los 9 intentos → cambia la cláusula y se cierra el mercado"
AID="$MAOP"
# la mesa tiene que mostrar el flight del atleta: el directo pasa a ese flight (sin publicar automático)
code=$(api GET "$GW/api/admin/competiciones/$CID/horarios" "" "${AUTH[@]}")
FLIGHT_MAOP="$(jq -r --arg a "$MAOP" '[.flights[] | select([.atletas[]?.id] | index($a))][0].id // empty' "$TMP/resp")"
FLIGHT_COD="$(jq -r --arg a "$MAOP" '[.flights[] | select([.atletas[]?.id] | index($a))][0].codigo // empty' "$TMP/resp")"
if [ -n "$FLIGHT_MAOP" ]; then
  code=$(api GET "$GW/api/admin/competiciones/$CID/directo" "" "${AUTH[@]}")
  ETAGM="$(etag "$GW/api/admin/competiciones/$CID/directo" "${AUTH[@]}")"
  ESTADO="$(jq -c --arg f "$FLIGHT_MAOP" '{fase:"en_directo",flightId:$f,movimiento:"sq",pausa:false,retrasoMin:0,streamUrl:(.estado.streamUrl // ""),replayUrl:(.estado.replayUrl // ""),pantalla:{siguientes:false,carrusel:false,qr:false},publicarAuto:false}' "$TMP/resp")"
  code=$(api PUT "$GW/api/admin/competiciones/$CID/directo/estado" "$ESTADO" "${AUTH[@]}" -H "If-Match: $ETAGM")
  if [ "$code" != 200 ]; then fallo "abrir el flight $FLIGHT_COD en la mesa (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "directo en el flight $FLIGHT_COD (movimiento sq)"; fi
else fallo "no encuentro el flight del atleta $MAOP en los horarios publicados"; fi
CLAU1="$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID" >/dev/null; jq -r --arg a "$AID" '.atletas[] | select(.atletaId==$a) | .clausula' "$TMP/resp")"
declare -A VOTOS=( [sq1]=BBB [sq2]=BBB [sq3]=BBB [bp1]=BBB [bp2]=RRR [bp3]=BBB [dl1]=BBB [dl2]=BBB [dl3]=BBB )
declare -A PESOS=( [sq1]=100 [sq2]=110 [sq3]=120 [bp1]=105 [bp2]=115 [bp3]=125 [dl1]=105 [dl2]=115 [dl3]=125 )
orden="sq1 sq2 sq3 bp1 bp2 bp3 dl1 dl2 dl3"
for paso_int in $orden; do
  mov="${paso_int//[0-9]/}"; n="${paso_int//[a-z]/}"
  code=$(api POST "$GW/api/admin/competiciones/$CID/directo/intentos" "{\"atletaId\":\"$AID\",\"movimiento\":\"$mov\",\"numero\":$n,\"peso\":${PESOS[$paso_int]}}" "${AUTH[@]}")
  if [ "$code" != 200 ]; then fallo "declarar $paso_int (HTTP $code): $(head -c 200 "$TMP/resp")"; continue; fi
  IID="$(jq -r --arg a "$AID" --arg m "$mov" --argjson n "$n" '.atletas[] | select(.id==$a) | .intentos[$m][($n-1)].id // empty' "$TMP/resp")"
  if [ -z "$IID" ]; then fallo "no encuentro el id del intento $paso_int en la mesa"; continue; fi
  code=$(api POST "$GW/api/admin/competiciones/$CID/directo/intentos/$IID/veredicto" "{\"votos\":\"${VOTOS[$paso_int]}\"}" "${AUTH[@]}")
  if [ "$code" != 200 ]; then fallo "veredicto $paso_int (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "$paso_int de $AID: ${PESOS[$paso_int]} kg → ${VOTOS[$paso_int]}"; fi
done
espera 9 "worker aplica la variación de cláusula y cierra el mercado"
# el worker aplica los cambios en cuanto llegan los eventos (hasta ~15 s): se espera con sondeo
CLAU2="$CLAU1"; EST=""
for i in $(seq 1 40); do
  api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID"
  CLAU2="$(jq -r --arg a "$AID" '.atletas[] | select(.atletaId==$a) | .clausula' "$TMP/resp")"
  api GET "$GW/api/competiciones/$SLUG/juegos/porra/mercados?jornada=$JID"
  EST="$(jq -r --arg id "$MID" '.mercados[] | select(.id==$id) | .estado' "$TMP/resp")"
  [ "$CLAU1" != "$CLAU2" ] && [ "$EST" != "abierto" ] && [ -n "$EST" ] && break
  sleep 1
done
if [ -n "$CLAU1" ] && [ "$CLAU1" != "$CLAU2" ]; then ok "cláusula de $AID: $CLAU1 → $CLAU2 (variación por los veredictos)"; else fallo "la cláusula no cambió ($CLAU1 → $CLAU2)"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/porra/mercados?jornada=$JID")
if [ "$EST" = "cerrado" ] || [ "$EST" = "liquidado" ]; then ok "el mercado $MID está '$EST' (se cierra al juzgar el primer intento de sus atletas)"; else fallo "el mercado $MID sigue '$EST'"; fi

paso "5e · resultados publicados → liquidación de la porra (parimutuel) y puntos fantasy por puesto"
code=$(api POST "$GW/api/admin/competiciones/$CID/resultados/publicar" "{\"categorias\":[\"$CLAVE\"],\"avisar\":false}" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "publicar resultados (HTTP $code): $(head -c 300 "$TMP/resp")"; else ok "resultados publicados de $CLAVE ($(jq -c .publicadas "$TMP/resp"))"; fi
espera 12 "worker liquida la porra y reparte puntos"
# sondeo: el worker necesita el evento «resultados.publicados» y su ronda de sincronización
PP2="$PP1"; PA2="$PA1"; PTOS=0
for i in $(seq 1 40); do
  read -r PP2 _ <<<"$(cartera "$JAR_PUB")"
  read -r PA2 _ <<<"$(cartera "$JAR_ATE")"
  api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/clasificacion?jornada=$JID" "" -b "$JAR_PUB"
  PTOS="$(jq -r '.miPuntos // 0' "$TMP/resp")"
  [ $(( PP2 - PP0 )) -ne 0 ] && [ "${PTOS:-0}" -gt 0 ] && break
  sleep 1
done
# parimutuel (§6.2): el bote es 3000 y solo hay 1000 apostados al ganador → el ganador se lleva los 3000
# (descontando lo que apostó, su porra sube en 2000).
if [ $(( PP2 - PP0 )) = 2000 ]; then ok "liquidación parimutuel: el fan público recupera su 1000 y se lleva el bote de 3000 (porra $PP0→$PP2)"; else fallo "liquidación: esperaba +2000 en la porra del fan público (1000 apostados × bote 3000); hay +$(( PP2 - PP0 )) ($PP0→$PP2)"; fi
if [ -s "$JAR_ATE" ] && [ -n "$MAOP2" ]; then
  if [ $(( PA2 - PA0 )) = -2000 ]; then ok "el fan atleta pierde su apuesta de 2000 (porra $PA0→$PA2)"; else fallo "el fan atleta esperaba −2000; hay $(( PA2 - PA0 )) ($PA0→$PA2)"; fi
fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/clasificacion?jornada=$JID" "" -b "$JAR_PUB")
PTOS="$(jq -r '.miPuntos // 0' "$TMP/resp")"
if [ "${PTOS:-0}" -gt 0 ]; then ok "puntos fantasy del fan público (dueño de $AID): $PTOS"; else fallo "sin puntos fantasy tras publicar resultados (miPuntos=$PTOS)"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/porra/clasificacion?jornada=$JID" "" -b "$JAR_PUB")
nota "clasificación de la porra: $(jq -r '.top | length' "$TMP/resp") fans con saldo; el público está en el puesto $(jq -r '.miPuesto' "$TMP/resp") con $(jq -r '.miSaldo' "$TMP/resp") de porra"
fi

# ---------------------------------------------------------------------------------------------
paso "Resumen"
echo "   pasos: $PASOS · OK: $OKS · FALLOS: $FALLOS"
[ "$FALLOS" = 0 ] && echo "   TODO OK" || echo "   HAY $FALLOS FALLOS (arriba, marcados con FALLO)"
exit "$FALLOS"
