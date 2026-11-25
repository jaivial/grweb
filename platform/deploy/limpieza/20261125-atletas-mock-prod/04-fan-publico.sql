-- Limpieza del fan de QA de público en producción (namespace grcup), 2026-11-25. Idempotente: una segunda pasada borra 0.
-- Cada fichero es una transacción en su BD: comprueba lo borrado y hace ROLLBACK (RAISE) si no es lo esperado (o 0, ya limpio).
-- Ejecutar con: kubectl -n grcup exec -i statefulset/postgres -- psql -U postgres -d <bd> -v ON_ERROR_STOP=1 < <fichero>
-- BD grcup_fans: el fan publico@hotmail.com (publico_test, sin atleta). Sus 2 fan_avisos se borran a mano antes del fan
-- (también caerían en cascada) para poder contarlos. No tiene accesos pendientes.
BEGIN;
DO $$
DECLARE n int; a int; m int;
BEGIN
  DELETE FROM fan_avisos WHERE fan_id IN (SELECT id FROM fans
    WHERE competition_id = '01a1dc27-6fe0-7a92-8399-b9a3a0f77f0e' AND email = 'publico@hotmail.com');
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM fans WHERE competition_id = '01a1dc27-6fe0-7a92-8399-b9a3a0f77f0e' AND email = 'publico@hotmail.com';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 1) OR (n = 1 AND a <> 2) OR (n = 0 AND a <> 0) THEN
    RAISE EXCEPTION 'fans: %, fan_avisos: %; se esperaban 1 y 2 (o 0 y 0)', n, a;
  END IF;
  DELETE FROM accesos WHERE competition_id = '01a1dc27-6fe0-7a92-8399-b9a3a0f77f0e' AND fan_email = 'publico@hotmail.com';
  GET DIAGNOSTICS m = ROW_COUNT;
  IF m <> 0 THEN RAISE EXCEPTION 'accesos: % filas, se esperaban 0', m; END IF;
  RAISE NOTICE 'fans: %, fan_avisos: %, accesos: %', n, a, m;
END $$;
COMMIT;
