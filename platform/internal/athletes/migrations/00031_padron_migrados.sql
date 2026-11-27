-- +goose Up
-- BIZ-211 · Coherencia de las coincidencias que migró la 00030.
--
-- 00030 pasó las solicitudes «sugerido» a «parcial» con padron_origen='ia' sin tocar el detalle, así que una fila que
-- el código había resuelto sin modelo (motivo «… (sin IA)») se leía en el registro como una decisión de la IA, y una
-- sugerencia sin motivo no decía nada. Los dos valores de origen que se escriben aquí (exacto y revision) ya están en el
-- CHECK de la 00030, así que no hay que tocar ninguna restricción: solo los datos.
UPDATE solicitudes_atleta
   SET padron_origen = 'exacto', updated_at = now()
 WHERE padron_origen = 'ia'
   AND padron_estado IN ('parcial', 'confirmada', 'manual', 'descartada')
   AND padron_detalle->>'motivo' ILIKE '%sin IA%';

UPDATE solicitudes_atleta
   SET padron_origen = 'revision',
       padron_detalle = jsonb_set(padron_detalle, '{motivo}', to_jsonb('Sugerencia anterior: revísala.'::text)),
       updated_at = now()
 WHERE padron_origen = 'ia'
   AND padron_estado IN ('parcial', 'manual')
   AND COALESCE(padron_detalle->>'motivo', '') = '';

-- +goose Down
-- Vuelve a dejarlas como las dejó la 00030 (origen «ia»), solo las que esta migración cambió.
UPDATE solicitudes_atleta
   SET padron_origen = 'ia', updated_at = now()
 WHERE padron_origen = 'exacto'
   AND padron_detalle->>'motivo' ILIKE '%sin IA%';

UPDATE solicitudes_atleta
   SET padron_origen = 'ia',
       padron_detalle = jsonb_set(padron_detalle, '{motivo}', to_jsonb(''::text)),
       updated_at = now()
 WHERE padron_origen = 'revision'
   AND padron_detalle->>'motivo' = 'Sugerencia anterior: revísala.';
