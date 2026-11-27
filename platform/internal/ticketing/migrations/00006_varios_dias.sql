-- +goose Up
-- Una entrada cubre uno o varios días: un solo QR para todos, plazas descontadas de cada día y un contador de
-- personas dentro por día (la puerta valida el día que está entrando). Generaliza el par sesion2_id/dentro2.
--
-- Los despliegues son sin corte (blue/green en local, rollout en producción): las columnas viejas se quedan una
-- release más para que el código anterior siga leyendo mientras convive con el nuevo (sesion_id/dentro siguen
-- siendo el primer día). Se pueden borrar cuando todo el parque esté en esta versión.
CREATE TABLE entrada_sesiones (
    entrada_id uuid    NOT NULL REFERENCES entradas (id) ON DELETE CASCADE,
    sesion_id  uuid    NOT NULL REFERENCES sesiones (id),
    dentro     integer NOT NULL DEFAULT 0 CHECK (dentro >= 0),
    PRIMARY KEY (entrada_id, sesion_id)
);
CREATE INDEX entrada_sesiones_sesion ON entrada_sesiones (sesion_id);

INSERT INTO entrada_sesiones (entrada_id, sesion_id, dentro)
SELECT e.id, e.sesion_id, e.dentro FROM entradas e
ON CONFLICT DO NOTHING;

INSERT INTO entrada_sesiones (entrada_id, sesion_id, dentro)
SELECT e.id, e.sesion2_id, e.dentro2 FROM entradas e WHERE e.sesion2_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE entrada_sesiones;
