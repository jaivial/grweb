-- +goose Up
-- Autorización de madre, padre o tutor (atletas menores): la organización pide la autorización desde la ficha, el
-- tutor la firma y la sube desde un enlace personal (solo se guarda el sha256 del token) y el equipo la revisa como
-- una solicitud de tipo «autorizacion» (la URL subida va en «cambios» → {"autorizacionUrl": "…"}).
ALTER TABLE solicitudes_atleta DROP CONSTRAINT solicitudes_atleta_tipo_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_tipo_check CHECK (tipo IN ('alta', 'cambio_perfil', 'autorizacion'));
-- Una sola solicitud viva por email es una regla del alta: el cambio de perfil y la autorización usan el email del atleta.
DROP INDEX IF EXISTS solicitudes_atleta_email_viva;
CREATE UNIQUE INDEX solicitudes_atleta_email_viva ON solicitudes_atleta (competition_id, email)
    WHERE tipo = 'alta' AND estado IN ('pendiente', 'revision');
-- Una sola autorización abierta por atleta (tras un rechazo, la nueva subida es otra fila).
CREATE UNIQUE INDEX solicitudes_atleta_autorizacion_viva ON solicitudes_atleta (competition_id, match_atleta_id)
    WHERE tipo = 'autorizacion' AND estado IN ('pendiente', 'revision');

-- El token del enlace se deriva de «id» con la clave interna del servicio (como el QR): así el aviso de un rechazo
-- puede repetir el mismo enlace sin guardar el token en claro.
CREATE TABLE autorizacion_tokens (
    hash           text PRIMARY KEY,
    id             uuid        NOT NULL UNIQUE,
    competition_id uuid        NOT NULL,
    atleta_id      uuid        NOT NULL REFERENCES atletas (id) ON DELETE CASCADE,
    formulario_url text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    revoked_at     timestamptz
);
-- Un solo enlace vivo por atleta: al reenviar la petición se revoca el anterior.
CREATE UNIQUE INDEX autorizacion_tokens_vivo ON autorizacion_tokens (atleta_id) WHERE revoked_at IS NULL;
CREATE INDEX autorizacion_tokens_atleta ON autorizacion_tokens (atleta_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS autorizacion_tokens;
DROP INDEX IF EXISTS solicitudes_atleta_autorizacion_viva;
DROP INDEX IF EXISTS solicitudes_atleta_email_viva;
DELETE FROM solicitudes_atleta WHERE tipo = 'autorizacion';
CREATE UNIQUE INDEX solicitudes_atleta_email_viva ON solicitudes_atleta (competition_id, email)
    WHERE estado IN ('pendiente', 'revision');
ALTER TABLE solicitudes_atleta DROP CONSTRAINT solicitudes_atleta_tipo_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_tipo_check CHECK (tipo IN ('alta', 'cambio_perfil'));
