-- Limpieza de los atletas de ejemplo en producción (namespace grcup), 2026-11-25. Idempotente: una segunda pasada borra 0.
-- Cada fichero es una transacción en su BD: comprueba lo borrado y hace ROLLBACK (RAISE) si no es lo esperado (o 0, ya limpio).
-- Ejecutar con: kubectl -n grcup exec -i statefulset/postgres -- psql -U postgres -d <bd> -v ON_ERROR_STOP=1 < <fichero>
-- BD grcup_fans: el fan del atleta QA (atleta@hotmail.com) y el fan de ejemplo nuevo-h@ejemplo.test.
-- publico@hotmail.com (publico_test) no es atleta: se queda. fan_avisos cae en cascada.
BEGIN;
DO $$
DECLARE n int; m int;
BEGIN
  DELETE FROM fans WHERE competition_id = '01a1dc27-6fe0-7a92-8399-b9a3a0f77f0e'
    AND (atleta_id IN ('0193f1a0-0000-7000-8000-00000000a7e1') OR email IN ('nuevo-h@ejemplo.test', 'atleta@hotmail.com'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 2) THEN RAISE EXCEPTION 'fans: % filas, se esperaban 2 (o 0)', n; END IF;
  DELETE FROM accesos WHERE competition_id = '01a1dc27-6fe0-7a92-8399-b9a3a0f77f0e' AND fan_email IN ('nuevo-h@ejemplo.test', 'atleta@hotmail.com');
  GET DIAGNOSTICS m = ROW_COUNT;
  IF m NOT IN (0, 1) THEN RAISE EXCEPTION 'accesos: % filas, se esperaban 1 (o 0)', m; END IF;
  RAISE NOTICE 'fans: %, accesos: %', n, m;
END $$;
COMMIT;
