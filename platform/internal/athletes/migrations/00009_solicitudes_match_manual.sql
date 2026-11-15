-- +goose Up
-- El enlace a mano de un atleta por el revisor es otra coincidencia («manual»): el chip del panel
-- dice que la enlazó una persona y no el formulario.
ALTER TABLE solicitudes_atleta DROP CONSTRAINT solicitudes_atleta_match_tipo_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_match_tipo_check
    CHECK (match_tipo IN ('', 'licencia', 'email', 'nombre', 'manual'));

-- +goose Down
ALTER TABLE solicitudes_atleta DROP CONSTRAINT solicitudes_atleta_match_tipo_check;
ALTER TABLE solicitudes_atleta ADD CONSTRAINT solicitudes_atleta_match_tipo_check
    CHECK (match_tipo IN ('', 'licencia', 'email', 'nombre'));
