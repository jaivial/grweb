# Concurrencia del stack (perf-20261115)

El informe completo, con todas las mediciones, está en `~/orq/perf-20261115/informe.md` (jaime-desktop). Aquí va lo
que necesita quien mantiene el código.

## Perfilar en local
- El compose dev define `PPROF_ADDR=:6060`. No se publica en el host ni pasa por el gateway. Para leerlo:
  `ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' grcup-h-chat-1)`
  y luego `go tool pprof "http://$ip:6060/debug/pprof/profile?seconds=30"`.
- En QA y prod no se define, así que no hay listener.

## Lo que se cambió y por qué (k6 ST1 local)
| Cambio | Antes → después |
|---|---|
| Chat: frames en lote por ventana de 100 ms (`?lote=1`, `CHAT_LOTE_MS`); SSE con un flush por ráfaga | 300 VU: chat 93 → 44 % de CPU, gateway 87 → 19 %. 600 VU con lotes cuestan lo mismo que 300 sin ellos |
| pgx `MaxConns = min(10, max(4, 2×GOMAXPROCS))` y suelo caliente 2 | 300 VU: de 392 errores 500 (53300) a 0 |
| Relay del outbox con backoff en reposo (40 → 640 ms) | Reposo del stack: 0,19 → 0,04 CPU |

## Protección ante sobrecarga (gateway, `internal/gateway/proteccion.go`)
- `ADMISION_MAX` (0 = apagado), `ADMISION_TTL_SEG` (60): sala de espera por competición en Redis. Por encima del
  límite de fans activos, un fan nuevo recibe 503 `EN_COLA` con `posicion` y `reintentarEn`. La web
  (`core/cola.ts`) muestra «Estás en la cola» y reintenta sola.
- `UPSTREAM_MAX_INFLIGHT` (256): número de peticiones REST en vuelo por servicio y réplica. Por encima, 503
  `SERVICIO_SATURADO` inmediato.
- `BREAKER_FALLOS` (5) y `BREAKER_SEG` (5): circuit breaker por upstream (502/504 o error de transporte), con
  half-open de una sola petición.
- Presión: cualquier cola o rechazo escribe `gw:presion` (30 s). Mientras está activa, el chat entra en modo lento
  (`CHAT_LENTO_PRESION_SEG`, 10 s).
- El compose dev limita la CPU por servicio (`cpus`): 1 por defecto y 2 para chat, gateway y postgres.

## Kraken (propuestas, no aplicadas)
Están en `deploy/k8s/propuestas/`:
- PriorityClass `grcup-qa-baja` (sin preempción).
- Quota a 8 CPU de limits.
- `limit_req` y `limit_conn` en nginx.

En un nodo único el HPA no añade capacidad.
