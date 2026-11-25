-- Limpieza de los atletas de ejemplo en producción (namespace grcup), 2026-11-25. Idempotente: una segunda pasada borra 0.
-- Cada fichero es una transacción en su BD: comprueba lo borrado y hace ROLLBACK (RAISE) si no es lo esperado (o 0, ya limpio).
-- Ejecutar con: kubectl -n grcup exec -i statefulset/postgres -- psql -U postgres -d <bd> -v ON_ERROR_STOP=1 < <fichero>
-- BD grcup_messaging: los emails enviados a las cuentas de ejemplo (historial de envíos, sin FKs).
BEGIN;
DO $$
DECLARE n int;
BEGIN
  DELETE FROM mensajes WHERE destino IN ('nuevo-h@ejemplo.test', 'atleta@hotmail.com') OR destino::text LIKE '%@ejemplo.test';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 5) THEN RAISE EXCEPTION 'mensajes: % filas, se esperaban 5 (o 0)', n; END IF;
  RAISE NOTICE 'mensajes: %', n;
END $$;
COMMIT;
