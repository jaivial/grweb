-- +goose Up
-- El id del stream («1710000000000-0») solo es único dentro de una sala: dos salas (competiciones o jornadas
-- distintas) pueden generar el mismo id en el mismo milisegundo y la PK global descartaba el segundo mensaje en
-- silencio (ON CONFLICT DO NOTHING). La clave pasa a ser compuesta: (competition_id, dia, id).
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_pkey;
ALTER TABLE mensajes ADD PRIMARY KEY (competition_id, dia, id);

-- +goose Down
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_pkey;
ALTER TABLE mensajes ADD PRIMARY KEY (id);
