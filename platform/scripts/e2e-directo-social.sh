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
ATLETA_EMAIL_MAL="${ATLETA_EMAIL_MAL:-nadie@ejemplo.test}"
HOY="$(TZ=Europe/Madrid date +%F)"
STAMP="$(date +%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASOS=0; OKS=0; FALLOS=0
paso()   { echo; echo "== $*"; PASOS=$((PASOS+1)); }
ok()     { echo "   OK    · $*"; OKS=$((OKS+1)); }
fallo()  { echo "   FALLO · $*"; FALLOS=$((FALLOS+1)); }
nota()   { echo "         · $*"; }
espera() { echo "         · espero ${1}s ($2)"; sleep "$1"; }

# api MÉTODO URL [CUERPO] [CURL_EXTRA...] → código HTTP en HTTP_CODE, cuerpo en stdout
api() {
  local metodo="$1" url="$2" cuerpo="${3:-}"
  shift 3
  if [ -n "$cuerpo" ]; then
    curl -s -o "$TMP/resp" -w '%{http_code}' -X "$metodo" -H 'Content-Type: application/json' "$@" -d "$cuerpo" "$url"
  else
    curl -s -o "$TMP/resp" -w '%{http_code}' -X "$metodo" "$@" "$url"
  fi
}
JWT=''; JAR_PUB="$TMP/fan-publico.jar"; JAR_ATE="$TMP/fan-atleta.jar"; JAR_MIL="$TMP/fan-millas.jar"
WS_BASE="$(printf '%s' "$GW" | sed 's|^http://|ws://|; s|^https://|wss://|')"
CID=''; JID=''; MAOP=''

# resolver el cid de la competición con un JWT dado (la vista pública no incluye el id)
resolver_cid() {
  local jwt="$1"
  curl -s -H "Authorization: Bearer $jwt" "$GW/api/admin/competiciones" | jq -r --arg s "$SLUG" '.[] | select(.slug==$s) | .id' | head -1
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

paso "0b · horarios publicados con flights HOY ($HOY) para el marcador interno de live"
code=$(api GET "$GW/api/admin/competiciones/$CID/horarios" "" "${AUTH[@]}")
ETAG="$(curl -s -o /dev/null -D - -H "Authorization: Bearer $JWT" "$GW/api/admin/competiciones/$CID/horarios" | tr -d '\r' | awk 'tolower($1)=="etag:"{print $2}')"
if [ "$code" != 200 ]; then fallo "GET horarios (HTTP $code)"; else
  if [ "$(jq -r '.config.dias[0].fecha // ""' "$TMP/resp")" = "$HOY" ]; then
    nota "el día ya es hoy; no cambio la configuración"
  else
    CFG="$(jq -c '.config | .dias = [{"fecha":"'"$HOY"'","inicio":"09:00","fin":"21:00","puertas":"08:30"}]' "$TMP/resp")"
    code=$(api PUT "$GW/api/admin/competiciones/$CID/horarios/config" "$CFG" "${AUTH[@]}" -H "If-Match: $ETAG")
    if [ "$code" != 200 ]; then fallo "PUT horarios/config (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "config de horarios con día de hoy"; fi
    code=$(api POST "$GW/api/admin/competiciones/$CID/horarios/generar" '{}' "${AUTH[@]}")
    if [ "$code" != 200 ]; then fallo "POST horarios/generar (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "flights generados: $(jq -r '.flights | length' "$TMP/resp")"; fi
    code=$(api POST "$GW/api/admin/competiciones/$CID/horarios/publicar" '{"avisarAtletas":false,"avisarSeguidores":false}' "${AUTH[@]}")
    if [ "$code" != 200 ]; then fallo "POST horarios/publicar (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "horarios publicados (versión $(jq -r .version "$TMP/resp"))"; fi
    nota "la caché del plan de live dura 15 s"
    espera 16 "caché del plan de live"
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

paso "0d · config de juegos con protección de clausulazo a 0 (para el e2e, la real es 10 min)"
code=$(api GET "$GW/api/admin/competiciones/$CID/juegos/config" "" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "GET juegos/config (HTTP $code)"; else
  CFGJ="$(jq -c '. | .proteccionMin = 0' "$TMP/resp")"
  code=$(api PUT "$GW/api/admin/competiciones/$CID/juegos/config" "$CFGJ" "${AUTH[@]}")
  if [ "$code" != 200 ]; then fallo "PUT juegos/config (HTTP $code)"; else ok "proteccionMin=0"; fi
fi
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "fans" ]; then
[ -z "$CID" ] && { api GET "$GW/api/competiciones/$SLUG" >/dev/null 2>&1; CID="$(curl -s "$GW/api/competiciones/$SLUG" | jq -r .id)"; JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); }
[ -z "$JID" ] && JID="$(curl -s "$GW/api/competiciones/$SLUG/juegos/jornadas" | jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" | head -1)"

paso "1a · fans: enlace mágico como PÚBLICO → canjear → cookie en /fans/yo"
ALIAS_PUB="e2e_pub_$STAMP"
code=$(api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"e2e-$STAMP@ejemplo.test\",\"tipo\":\"publico\",\"alias\":\"$ALIAS_PUB\",\"aceptaNormas\":true}")
if [ "$code" != 202 ]; then fallo "POST fans/acceso público (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "acceso pedido (202)"; fi
ENLACE="$(docker logs grcup-dev-fans-1 --since 3m 2>/dev/null | jq -r 'select(.msg=="enlace mágico de fan (dev)") | .enlace' | tail -1)"
TOK="$(printf '%s' "$ENLACE" | sed 's/.*acceso=//')"
if [ -z "$TOK" ] || [ "$TOK" = "$ENLACE" ]; then fallo "no hay enlace mágico en el log de fans"; else
  ok "enlace sacado del log (token ${TOK:0:8}…)"
  code=$(api POST "$GW/api/competiciones/$SLUG/fans/canjear" "{\"token\":\"$TOK\"}" -c "$JAR_PUB")
  if [ "$code" != 200 ]; then fallo "canjear token (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "canjeado, cookie grcup_fan guardada"; fi
  code=$(api GET "$GW/api/competiciones/$SLUG/fans/yo" "" -b "$JAR_PUB")
  if [ "$code" != 200 ] || [ "$(jq -r .alias "$TMP/resp")" != "$ALIAS_PUB" ]; then fallo "GET fans/yo con cookie (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fans/yo: alias=$(jq -r .alias "$TMP/resp") tipo=$(jq -r .tipo "$TMP/resp")"; fi
fi

paso "1b · fans: como ATLETA (email del seed) y email inexistente (ATLETA_NO_ENCONTRADO)"
ALIAS_ATE="e2e_ate_$STAMP"
code=$(api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"$ATLETA_EMAIL\",\"tipo\":\"atleta\",\"alias\":\"$ALIAS_ATE\",\"aceptaNormas\":true}")
if [ "$code" != 202 ]; then fallo "POST fans/acceso atleta (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "acceso de atleta pedido (202)"; fi
ENLACE="$(docker logs grcup-dev-fans-1 --since 3m 2>/dev/null | jq -r 'select(.msg=="enlace mágico de fan (dev)") | select(.tipo=="atleta") | .enlace' | tail -1)"
TOK="$(printf '%s' "$ENLACE" | sed 's/.*acceso=//')"
if [ -z "$TOK" ] || [ "$TOK" = "$ENLACE" ]; then fallo "no hay enlace de atleta en el log"; else
  code=$(api POST "$GW/api/competiciones/$SLUG/fans/canjear" "{\"token\":\"$TOK\"}" -c "$JAR_ATE")
  code2=$(api GET "$GW/api/competiciones/$SLUG/fans/yo" "" -b "$JAR_ATE")
  if [ "$code" != 200 ] || [ "$code2" != 200 ] || [ "$(jq -r .atletaId // empty "$TMP/resp")" = "" ]; then fallo "canje/yo de atleta (canje $code, yo $code2): $(head -c 200 "$TMP/resp")"; else ok "atleta canjeado: insignia=$(jq -r .insignia "$TMP/resp") atletaId=$(jq -r .atletaId "$TMP/resp" | head -c 8)…"; fi
fi
code=$(api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"$ATLETA_EMAIL_MAL\",\"tipo\":\"atleta\",\"alias\":\"e2e_mal_$STAMP\",\"aceptaNormas\":true}")
if [ "$code" = 422 ] && grep -q ATLETA_NO_ENCONTRADO "$TMP/resp"; then ok "email inexistente → 422 ATLETA_NO_ENCONTRADO"; else fallo "email inexistente: esperaba 422 ATLETA_NO_ENCONTRADO y llegó $code"; fi
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "chat" ]; then
[ -z "$CID" ] && { JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); CID="$(resolver_cid "$JWT")"; }
[ -z "$JID" ] && JID="$(curl -s "$GW/api/competiciones/$SLUG/juegos/jornadas" | jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" | head -1)"
WS_OUT="$TMP/ws-sala.log"; : > "$WS_OUT"
cgrun -m 2G -n e2e-ws-lector -- go run scripts/e2e-ws.go -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -seg 190 > "$WS_OUT" 2>"$TMP/ws-lector.err" &
WS_PID=$!
espera 2 "arranque del lector WS"

paso "2a · chat: REST + dos clientes que se ven + SSE"
T1="hola sala e2e $STAMP"
code=$(api POST "$GW/api/competiciones/$SLUG/chat/mensajes" "{\"texto\":\"$T1\"}" -b "$JAR_PUB")
if [ "$code" != 201 ] && [ "$code" != 200 ]; then fallo "POST chat/mensajes (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "mensaje REST enviado (id $(jq -r .id "$TMP/resp" | head -c 16)…)"; fi
code=$(api POST "$GW/api/competiciones/$SLUG/chat/mensajes" "{\"texto\":\"segundo cliente $STAMP\"}" -b "$JAR_ATE")
ok2=0; [ "$code" = 201 ] || [ "$code" = 200 ] && ok2=1
if [ "$ok2" != 1 ]; then fallo "POST chat/mensajes del 2.º fan (HTTP $code)"; else ok "mensaje del 2.º fan enviado"; fi
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

paso "2b · chat: límite de ritmo (6.º mensaje rápido → 429)"
code429=0
for i in 1 2 3 4 5 6; do
  code=$(api POST "$GW/api/competiciones/$SLUG/chat/mensajes" "{\"texto\":\"ráfaga $i $STAMP\"}" -b "$JAR_PUB")
  [ -s "$TMP/resp" ] || printf '{}' > "$TMP/resp"
  if [ "$code" = 429 ]; then code429=1; break; fi
  sleep 0.3
done
if [ "$code429" = 1 ]; then ok "429 en el mensaje $i (ráfaga de 5, fan público)"; else fallo "ningún 429 con ráfaga rápida (último $code)"; fi

paso "2c · chat: 10 mensajes contables → hito t=hito (5 y 10) → cartera +100/+600 porra y +10k/+60k fantasy"
FAN_MIL="$(awk '$6=="grcup_fan"{print $7}' "$JAR_MIL" 2>/dev/null | tail -1)"
if [ -z "$FAN_MIL" ]; then
  nota "creo un fan nuevo para las millas (la cubeta del público está gastada por la ráfaga)"
  api POST "$GW/api/competiciones/$SLUG/fans/acceso" "{\"email\":\"e2e-millas-$STAMP@ejemplo.test\",\"tipo\":\"publico\",\"alias\":\"e2e_mil_$STAMP\",\"aceptaNormas\":true}" >/dev/null
  TOK="$(docker logs grcup-dev-fans-1 --since 2m 2>/dev/null | jq -r 'select(.msg=="enlace mágico de fan (dev)") | .enlace' | tail -1 | sed 's/.*acceso=//')"
  api POST "$GW/api/competiciones/$SLUG/fans/canjear" "{\"token\":\"$TOK\"}" -c "$JAR_MIL" >/dev/null
  FAN_MIL="$(awk '$6=="grcup_fan"{print $7}' "$JAR_MIL" | tail -1)"
fi
go run scripts/e2e-ws.go -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -fan "$FAN_MIL" -seg 45 -n 10 -pausa 2300ms -texto "millas $STAMP" > "$TMP/ws-millas.log" 2>"$TMP/ws-millas.err"
HITOS="$(grep -o '"t":"hito","mensajes":[0-9]*' "$TMP/ws-millas.log" | grep -o '[0-9]*$' | tr '\n' ' ')"
if echo "$HITOS" | grep -q '\b5\b' && echo "$HITOS" | grep -q '\b10\b'; then ok "hitos recibidos por WS: $(echo $HITOS | tr ' ' ',')"; else fallo "hitos esperados 5 y 10; recibidos: ${HITOS:-ninguno} ($(grep -c '"t":"msg"' "$TMP/ws-millas.log") msg vistos)"; fi
espera 9 "juegos-worker acredita las recompensas"
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/cartera?jornada=$JID" "" -b "$JAR_MIL")
PORRA="$(jq -r .porra.saldo "$TMP/resp" 2>/dev/null)"; FANTA="$(jq -r .fantasy.saldo "$TMP/resp" 2>/dev/null)"
if [ "$code" = 200 ] && [ "$PORRA" = 100700 ] && [ "$FANTA" = 1070000 ]; then
  ok "cartera tras hitos: porra=$PORRA (100000+100+100+500) · fantasy=$FANTA (1M+10k+10k+50k)"
else fallo "cartera esperaba porra=100700 fantasy=1070000; hay porra=${PORRA:-?} fantasy=${FANTA:-?} (HTTP $code)"; fi
kill "$WS_PID" 2>/dev/null
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "donaciones" ]; then
[ -z "$CID" ] && { JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); CID="$(resolver_cid "$JWT")"; }
[ -z "$JID" ] && JID="$(curl -s "$GW/api/competiciones/$SLUG/juegos/jornadas" | jq -r ".jornadas[]? | select(.dia == \"$HOY\") | .id" | head -1)"
[ -s "$JAR_MIL" ] || JAR_MIL="$JAR_PUB"

paso "3 · donaciones: crear → pagar simulado → confirmada (chat, ranking, fantasy) → reembolso"
WS_OUT_D="$TMP/ws-dona.log"; : > "$WS_OUT_D"
cgrun -m 2G -n e2e-ws-dona -- go run scripts/e2e-ws.go -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -seg 55 > "$WS_OUT_D" 2>/dev/null &
WS_PID_D=$!
espera 2 "lector WS para el frame de donación"
code=$(api POST "$GW/api/competiciones/$SLUG/donaciones" '{"importe":500,"mensaje":"para el club","anonimo":false}' -b "$JAR_MIL")
if [ "$code" != 201 ] && [ "$code" != 200 ]; then fallo "crear donativo (HTTP $code): $(head -c 200 "$TMP/resp")"; else
  DONID="$(jq -r .donacionId "$TMP/resp")"; SESS="$(jq -r .url "$TMP/resp" | sed 's/.*s=donaciones://')"
  ok "donativo creado $DONID · sesión simulada $SESS"
  code=$(api GET "$GW/api/pagos/simulado/donaciones/$SESS")
  if [ "$code" = 200 ] && [ "$(jq -r .estado "$TMP/resp")" = "open" ]; then ok "sesión de pago visible (estado open, 5,00 €)"; else fallo "GET sesión simulada (HTTP $code): $(head -c 120 "$TMP/resp")"; fi
  code=$(api POST "$GW/api/pagos/simulado/donaciones/$SESS/pagar" '{"tarjeta":"4242 4242 4242 4242"}')
  if [ "$code" = 200 ] && [ "$(jq -r .estado "$TMP/resp")" = "pagado" ]; then ok "pago simulado completado (webhook entregado)"; else fallo "pagar simulado (HTTP $code): $(head -c 200 "$TMP/resp")"; fi
  espera 8 "worker consume donacion.confirmada"
  grep -q '"t":"donacion"' "$WS_OUT_D" && ok "frame t=donacion en el chat (importe $(grep -o '"importe":[0-9]*' "$WS_OUT_D" | head -1))" || fallo "no llegó el frame t=donacion al chat"
  code=$(api GET "$GW/api/competiciones/$SLUG/juegos/cartera?jornada=$JID" "" -b "$JAR_MIL")
  FANTA="$(jq -r .fantasy.saldo "$TMP/resp")"
  if [ "$FANTA" = 1120000 ]; then ok "fantasy +50.000 por 50 € (saldo $FANTA)"; else fallo "fantasy esperaba 1120000, hay ${FANTA:-?}"; fi
  code=$(api GET "$GW/api/competiciones/$SLUG/donaciones/ranking?dia=$HOY")
  TOPALIAS="$(jq -r '[.top[].alias] | join(",")' "$TMP/resp" 2>/dev/null)"
  if [ "$code" = 200 ] && [ "$(jq -r .totalRecaudado "$TMP/resp" 2>/dev/null)" -ge 500 ] && echo "$TOPALIAS" | grep -q "e2e_mil"; then ok "ranking: total $(jq -r .totalRecaudado "$TMP/resp") céntimos, donante visible en el top ($TOPALIAS)"; else fallo "ranking (HTTP $code): $(head -c 200 "$TMP/resp")"; fi
  code=$(api POST "$GW/api/admin/competiciones/$CID/donaciones/$DONID/reembolso" '{}' "${AUTH[@]}")
  if [ "$code" != 200 ] && [ "$code" != 204 ]; then fallo "reembolso admin (HTTP $code): $(head -c 200 "$TMP/resp")"; else
    ok "reembolso pedido"; espera 8 "worker retira la recompensa"
    code=$(api GET "$GW/api/competiciones/$SLUG/juegos/cartera?jornada=$JID" "" -b "$JAR_MIL")
    FANTA="$(jq -r .fantasy.saldo "$TMP/resp")"
    if [ "$FANTA" = 1070000 ]; then ok "reembolso retira +50.000 (fantasy $FANTA)"; else fallo "tras reembolso esperaba 1070000, hay ${FANTA:-?}"; fi
  fi
fi
kill "$WS_PID_D" 2>/dev/null
fi

# ---------------------------------------------------------------------------------------------
if [ "${SOLO:-todos}" = "todos" ] || [ "${SOLO:-}" = "patrocinio" ]; then
[ -z "$CID" ] && { JWT="$(curl -s -X POST "$GW/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_ROOT\",\"password\":\"$PASS_ROOT\"}" | jq -r .accessToken)"; AUTH=(-H "Authorization: Bearer $JWT"); CID="$(resolver_cid "$JWT")"; }
WS_OUT_B="$TMP/ws-banners.log"; : > "$WS_OUT_B"
cgrun -m 2G -n e2e-ws-banners -- go run scripts/e2e-ws.go -url "$WS_BASE/api/competiciones/$SLUG/chat/ws" -seg 150 > "$WS_OUT_B" 2>/dev/null &
WS_PID_B=$!

paso "4 · patrocinio: 3 banners (oro/plata/bronce), intervalo 15 s, frames t=banner y clic 302"
ETAGP="$(curl -s -o "$TMP/pcfg" -D - -H "Authorization: Bearer $JWT" "$GW/api/admin/competiciones/$CID/patrocinio/config" | tr -d '\r' | awk 'tolower($1)=="etag:"{print $2}')"
CFG_P="$(jq -c '. | .intervaloSeg = 15 | .soloEnDirecto = false | .activo = true' "$TMP/pcfg")"
code=$(api PUT "$GW/api/admin/competiciones/$CID/patrocinio/config" "$CFG_P" "${AUTH[@]}" -H "If-Match: $ETAGP")
if [ "$code" != 200 ]; then fallo "PUT patrocinio/config (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "config: intervalo 15 s, solo_en_directo=false"; fi
declare -A BID
i=0
for tier in oro plata bronce; do
  i=$((i+1))
  code=$(api POST "$GW/api/admin/competiciones/$CID/patrocinio/banners" "{\"patrocinador\":\"Patrocinador $tier e2e\",\"imagenUrl\":\"https://ejemplo.test/$tier.png\",\"urlDestino\":\"https://ejemplo.test/$tier\",\"tier\":\"$tier\",\"activo\":true,\"orden\":$i}" "${AUTH[@]}")
  if [ "$code" != 201 ]; then fallo "crear banner $tier (HTTP $code): $(head -c 200 "$TMP/resp")"; else BID[$tier]="$(jq -r .id "$TMP/resp")"; ok "banner $tier creado ${BID[$tier]}"; fi
done
nota "el worker saca los 3 pendientes primero (1 por tic) y luego repite por peso 3:2:1"
espera 100 "worker de banners (intervalo 15 s): 3 pendientes + reparto por peso"
if [ "$(grep -c '"t":"banner"' "$WS_OUT_B")" -ge 3 ]; then
  ok "frames t=banner llegan al chat ($(grep -c '"t":"banner"' "$WS_OUT_B") frames)"
  PRIM3="$(grep '"t":"banner"' "$WS_OUT_B" | jq -r '.bannerId' | head -3 | sort -u | wc -l)"
  if [ "$PRIM3" = 3 ]; then ok "los tres banners salen una vez cada uno antes de repetir"; else fallo "los primeros tics no cubrieron los 3 banners (distintos en los 3 primeros: $PRIM3)"; fi
  declare -A CNT
  for tier in oro plata bronce; do CNT[$tier]="$(grep '"t":"banner"' "$WS_OUT_B" | jq -r --arg t "Patrocinador $tier e2e" 'select(.patrocinador==$t)' | wc -l)"; done
  nota "apariciones: oro=${CNT[oro]} plata=${CNT[plata]} bronce=${CNT[bronce]} (pesos 3:2:1)"
  if [ "${CNT[oro]}" -gt "${CNT[plata]}" ] && [ "${CNT[plata]}" -ge "${CNT[bronce]}" ]; then ok "proporción por peso creciente oro>plata>=bronce"; else fallo "proporciones fuera de lo esperado: ${CNT[oro]}/${CNT[plata]}/${CNT[bronce]}"; fi
else fallo "no llegó ningún frame t=banner (lector: $(wc -l < "$WS_OUT_B") líneas)"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/patrocinio/banners/${BID[oro]}/clic" -o /dev/null -w '%{http_code} %{redirect_url}')
if [ "$code" = "302 https://ejemplo.test/oro" ]; then ok "clic registra y redirige 302 → https://ejemplo.test/oro"; else fallo "clic esperaba 302 a /oro; llegó: $code"; fi
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
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/jornadas/$JID" "" "${AUTH[@]}")
NATS="$(jq -r '.atletas | length' "$TMP/resp" 2>/dev/null)"
if [ "${NATS:-0}" -ge 1 ]; then ok "la jornada tiene $NATS atletas con cláusula"; else fallo "la jornada no tiene atletas (marcador vacío para $HOY)"; fi
code=$(api POST "$GW/api/admin/competiciones/$CID/juegos/mercados/generar" "{\"jornada\":\"$JID\"}" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "generar mercados (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "mercados generados: $(jq -r .creados "$TMP/resp")"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/porra/mercados?jornada=$JID")
MERC_GANADOR="$(jq -c '[.mercados[] | select(.tipo=="categoria")][0]' "$TMP/resp" 2>/dev/null)"
MID="$(jq -r .id <<<"$MERC_GANADOR")"; MAOP="$(jq -r '.opciones[0]' <<<"$MERC_GANADOR")"
if [ -n "$MID" ] && [ "$MID" != null ]; then ok "mercado de categoría: $MID (opciones $(jq -r '.opciones | length' <<<"$MERC_GANADOR"))"; else fallo "no hay mercado de categoria"; fi

paso "5b · porra: dos fans apuestan al mismo atleta del mismo mercado (el que se juzgará en live)"
code=$(api POST "$GW/api/competiciones/$SLUG/juegos/porra/apuestas" "{\"mercadoId\":\"$MID\",\"atletaId\":\"$MAOP\",\"importe\":1000,\"jornada\":\"$JID\"}" -b "$JAR_PUB")
if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "apuesta fan público (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan público apuesta 1000 al atleta $MAOP (porra $(jq -r .saldo "$TMP/resp"))"; fi
if [ -s "$JAR_ATE" ]; then
  code=$(api POST "$GW/api/competiciones/$SLUG/juegos/porra/apuestas" "{\"mercadoId\":\"$MID\",\"atletaId\":\"$MAOP\",\"importe\":2000,\"jornada\":\"$JID\"}" -b "$JAR_ATE")
  if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "apuesta fan atleta (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan atleta apuesta 2000 (porra $(jq -r .saldo "$TMP/resp"))"; fi
fi

paso "5c · fantasy: dos fans compran, clausulazo, y alineación"
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID")
AT1="$(jq -r '[.atletas[] | select(.dueno == null)][0].atletaId' "$TMP/resp" 2>/dev/null)"
AT2="$(jq -r '[.atletas[] | select(.dueno == null)][1].atletaId' "$TMP/resp" 2>/dev/null)"
CLAU="$(jq -r "[.atletas[] | select(.atletaId==\"$AT1\")][0].clausula" "$TMP/resp" 2>/dev/null)"
if [ -n "$AT1" ] && [ "$AT1" != null ]; then ok "mercado fantasy con atletas libres (cláusula inicial $CLAU)"; else fallo "fantasy/mercado sin atletas libres"; fi
code=$(api POST "$GW/api/competiciones/$SLUG/juegos/fantasy/comprar" "{\"atletaId\":\"$AT1\",\"jornada\":\"$JID\"}" -b "$JAR_PUB")
if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "comprar fan1 (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "fan1 compra $AT1 por $CLAU (fantasy $(jq -r .saldo "$TMP/resp"))"; fi
code=$(api POST "$GW/api/competiciones/$SLUG/juegos/fantasy/comprar" "{\"atletaId\":\"$AT2\",\"jornada\":\"$JID\"}" -b "$JAR_ATE")
[ "$code" = 200 ] || [ "$code" = 201 ] && ok "fan2 compra $AT2" || fallo "comprar fan2 (HTTP $code)"
code=$(api POST "$GW/api/competiciones/$SLUG/juegos/fantasy/clausulazo" "{\"atletaId\":\"$AT1\",\"jornada\":\"$JID\"}" -b "$JAR_ATE")
if [ "$code" != 200 ] && [ "$code" != 201 ]; then fallo "clausulazo (HTTP $code): $(head -c 200 "$TMP/resp")"; else ok "clausulazo de fan2 sobre el atleta de fan1 (fantasy fan2 $(jq -r .saldo "$TMP/resp"))"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/cartera?jornada=$JID" "" -b "$JAR_PUB")
F1="$(jq -r .fantasy.saldo "$TMP/resp")"
if [ "$F1" = 1000000 ]; then ok "el dinero del clausulazo llega al dueño (fan1 fantasy $F1 = 1M − 200k compra + 200k clausulazo)"; else nota "fan1 fantasy = ${F1:-?} (esperaba 1000000; se revisa)"; fi

paso "5d · live (mesa): declarar y juzgar un intento → cláusulas cambian y el mercado se cierra"
code=$(api GET "$GW/api/admin/competiciones/$CID/directo" "" "${AUTH[@]}")
FILA="$(jq -c --arg a "$MAOP" '.atletas[] | select(.id==$a)' "$TMP/resp" | head -1)"
AID="$(jq -r .id <<<"$FILA")"; IID="$(jq -r '.intentos.sq[0].id // empty' <<<"$FILA")"
if [ "$AID" != "$MAOP" ]; then fallo "el atleta apostado ($MAOP) no está en la mesa de live"; fi
if [ -z "$IID" ]; then
  code=$(api POST "$GW/api/admin/competiciones/$CID/directo/intentos" "{\"atletaId\":\"$AID\",\"movimiento\":\"sq\",\"numero\":1,\"peso\":100}" "${AUTH[@]}")
  if [ "$code" != 200 ]; then fallo "declarar intento (HTTP $code): $(head -c 300 "$TMP/resp")"; else
    IID="$(jq -r ".atletas[] | select(.id==\"$AID\") | .intentos.sq[0].id" "$TMP/resp")"
    ok "intento declarado (100 kg) → intento $IID"
  fi
else ok "intento ya declarado $IID"; fi
CLAU1="$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID" >/dev/null; jq -r "[.atletas[] | select(.atletaId==\"$AID\")][0].clausula" "$TMP/resp" 2>/dev/null)"
code=$(api POST "$GW/api/admin/competiciones/$CID/directo/intentos/$IID/veredicto" '{"votos":"BBB"}' "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "veredicto (HTTP $code): $(head -c 300 "$TMP/resp")"; else ok "veredicto BBB (válido)"; fi
espera 9 "worker aplica variación de cláusula y cierra el mercado"
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID")
CLAU2="$(jq -r "[.atletas[] | select(.atletaId==\"$AID\")][0].clausula" "$TMP/resp")"
if [ -n "$CLAU1" ] && [ "$CLAU1" != "$CLAU2" ]; then ok "cláusula $AID: $CLAU1 → $CLAU2 (+5 % por válido)"; else fallo "la cláusula no cambió ($CLAU1 → $CLAU2)"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/porra/mercados?jornada=$JID")
EST="$(jq -r "[.mercados[] | select(.id==\"$MID\")][0].estado" "$TMP/resp")"
if [ "$EST" = "cerrado" ]; then ok "mercado de la categoría cerrado al primer intento juzgado"; else fallo "el mercado $MID sigue '$EST'"; fi

paso "5e · resultados publicados → liquidación de la porra y puntos fantasy por puesto"
# completar los 9 intentos del atleta para tener total y puesto
declare -A VOTOS=( [sq2]=BBB [sq3]=BBB [bp1]=BBB [bp2]=RRR [bp3]=BBB [dl1]=BBB [dl2]=BBB [dl3]=BBB )
orden="sq2 sq3 bp1 bp2 bp3 dl1 dl2 dl3"
for paso_int in $orden; do
  mov="${paso_int//[0-9]/}"; n="${paso_int//[a-z]/}"
  # declarar si no existe el intento y juzgar
  EXISTE="$(jq -r ".atletas[] | select(.id==\"$AID\") | .intentos.$mov[$((n-1))].id // empty" "$TMP/resp" 2>/dev/null)"
  if [ -z "$EXISTE" ]; then
    code=$(api POST "$GW/api/admin/competiciones/$CID/directo/intentos" "{\"atletaId\":\"$AID\",\"movimiento\":\"$mov\",\"numero\":$n,\"peso\":$((100+n*5))}" "${AUTH[@]}")
    EXISTE="$(jq -r ".atletas[] | select(.id==\"$AID\") | .intentos.$mov[$((n-1))].id // empty" "$TMP/resp" 2>/dev/null)"
    [ -z "$EXISTE" ] && { fallo "no pude declarar $paso_int"; continue; }
  fi
  code=$(api POST "$GW/api/admin/competiciones/$CID/directo/intentos/$EXISTE/veredicto" "{\"votos\":\"${VOTOS[$paso_int]}\"}" "${AUTH[@]}")
  [ "$code" = 200 ] || fallo "veredicto $paso_int (HTTP $code)"
done
CAT="$(jq -r .categoria <<<"$FILA")"; SEXO="$(jq -r .sexo <<<"$FILA")"
code=$(api POST "$GW/api/admin/competiciones/$CID/resultados/publicar" "{\"categorias\":[\"$SEXO$CAT\"],\"avisar\":false}" "${AUTH[@]}")
if [ "$code" != 200 ]; then fallo "publicar resultados (HTTP $code): $(head -c 300 "$TMP/resp")"; else ok "resultados publicados de $SEXO$CAT ($(jq -c .publicadas "$TMP/resp"))"; fi
espera 10 "worker liquida porra y reparte puntos"
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/porra/clasificacion?jornada=$JID" "" -b "$JAR_PUB")
PORRA1="$(jq -r .miSaldo "$TMP/resp")"
if [ "$PORRA1" != 99000 ]; then
  nota "fan público porra=$PORRA1 (apostó 1000 al ganador del bote de 3000 → esperaba 100000−1000+3000=302000… revisando)"
fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/clasificacion?jornada=$JID" "" -b "$JAR_PUB")
PTOS="$(jq -r .miPuntos "$TMP/resp")"
if [ "${PTOS:-0}" -gt 0 ]; then ok "liquidación: fan1 fantasy puntos=$PTOS · porra fan1=$PORRA1"; else fallo "sin puntos fantasy tras publicar resultados"; fi
code=$(api GET "$GW/api/competiciones/$SLUG/juegos/fantasy/mercado?jornada=$JID")
CLAU3="$(jq -r "[.atletas[] | select(.atletaId==\"$AID\")][0].clausula" "$TMP/resp")"
nota "cláusula final del atleta tras resultados: $CLAU3"
fi

# ---------------------------------------------------------------------------------------------
paso "Resumen"
echo "   pasos: $PASOS · OK: $OKS · FALLOS: $FALLOS"
[ "$FALLOS" = 0 ] && echo "   TODO OK" || echo "   HAY $FALLOS FALLOS (arriba, marcados con FALLO)"
exit "$FALLOS"
