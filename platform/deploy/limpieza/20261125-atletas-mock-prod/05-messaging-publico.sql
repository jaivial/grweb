-- Limpieza del fan de QA de público en producción (namespace grcup), 2026-11-25. Idempotente: una segunda pasada borra 0.
-- Cada fichero es una transacción en su BD: comprueba lo borrado y hace ROLLBACK (RAISE) si no es lo esperado (o 0, ya limpio).
-- Ejecutar con: kubectl -n grcup exec -i statefulset/postgres -- psql -U postgres -d <bd> -v ON_ERROR_STOP=1 < <fichero>
-- BD grcup_messaging: los 2 emails enviados a publico@hotmail.com (publico-anuncio-juegos y publico-anuncio-chat).
-- No figura en campana_destinatarios ni en destinos_invalidos.
BEGIN;
DO $$
DECLARE n int; c int; d int;
BEGIN
  DELETE FROM mensajes WHERE destino = 'publico@hotmail.com';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 2) THEN RAISE EXCEPTION 'mensajes: % filas, se esperaban 2 (o 0)', n; END IF;
  DELETE FROM campana_destinatarios WHERE lower(destino) = 'publico@hotmail.com';
  GET DIAGNOSTICS c = ROW_COUNT;
  DELETE FROM destinos_invalidos WHERE destino = 'publico@hotmail.com';
  GET DIAGNOSTICS d = ROW_COUNT;
  IF c <> 0 OR d <> 0 THEN RAISE EXCEPTION 'campana_destinatarios: %, destinos_invalidos: %; se esperaban 0', c, d; END IF;
  RAISE NOTICE 'mensajes: %, campana_destinatarios: %, destinos_invalidos: %', n, c, d;
END $$;
COMMIT;
