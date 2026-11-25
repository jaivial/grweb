# Limpieza de atletas de ejemplo en producción (2026-11-25)

Producción (`grcup`, competición GRS Cup 2 `01a1dc27-6fe0-7a92-8399-b9a3a0f77f0e`) tenía los 150 atletas del
`athletes-seed` («Datos de ejemplo»: emails `@ejemplo.test`, licencias `XXX-0000`, todos creados el
2026-11-14 22:22:15) y el atleta QA «Atleta Test QA» (`atleta@hotmail.com`). Lista exacta: `atletas-mock.txt` (151).

Copia previa (pg_dump -Fc de athletes, schedule, fans, messaging, openlifter, juegos, crm, audit):
`kraken:~/grcup-backups/prod-pre-cleanup-20261125-155650/`.

## Orden aplicado

| # | Qué | Cómo | Resultado |
|---|-----|------|-----------|
| 1 | 11 sesiones con solo atletas de ejemplo (146 `sesion_atletas`) | API `DELETE …/horarios/sesiones/{id}` | 0 `sesion_atletas`; queda la sesión vacía de aep2 creada a mano |
| 2 | Horario publicado (versión 1, con los de ejemplo) | API `POST …/horarios/despublicar` (publicar falla con `SIN_SESIONES`) | web en «Próximamente»; la versión 1 queda como historial `retirada` |
| 3 | Fans `atleta@hotmail.com` (vinculado al atleta QA) y `nuevo-h@ejemplo.test` | `01-fans.sql` | 2 fans, 2 avisos (cascada), 1 acceso |
| 4 | Emails enviados a esas cuentas | `02-messaging.sql` | 5 mensajes |
| 5 | Vínculos de OpenLifter | `03-openlifter.sql` | 0 |
| 6 | 151 atletas | API `DELETE …/atletas/{id}` (evento `athletes.atleta_borrado`, cascadas) | 0 atletas, perfiles, historial, seguimientos, area_* |
| 7 | 4 cupones del seed | API `DELETE …/cupones/{id}` | 0 cupones |

`90-*.sql` y `91-*.sql` son la reserva en SQL de los pasos hechos por API (sin eventos): solo si la API no está.
Todos los `.sql` son idempotentes y comprueban el número de filas (RAISE → ROLLBACK si no es el esperado o 0).

Se conservan: las 2 `solicitudes_atleta` reales, los resultados de 2025 (`live.resultados`) y los usuarios de
identity.

## Fan de QA de público (mismo día, después)

El fan `publico@hotmail.com` (`publico_test`, sin atleta ni usuario de identity) también se borró. El servicio fans no
tiene API para borrar fans, así que se hizo por SQL. Copia previa (pg_dump -Fc de fans y messaging):
`kraken:~/grcup-backups/prod-pre-publico-20261125-162628/`.

| # | Qué | Cómo | Resultado |
|---|-----|------|-----------|
| 8 | Fan `publico@hotmail.com` y sus avisos | `04-fan-publico.sql` | 1 fan, 2 `fan_avisos`, 0 accesos |
| 9 | Emails enviados a esa cuenta | `05-messaging-publico.sql` | 2 mensajes (0 en campañas ni destinos inválidos) |

No tenía filas en chat, juegos ni donaciones.

El seed de athletes ya no se ejecuta con `SERVICE_ENV=prod` (además del parche `sin-ejemplos.yaml` del overlay).
