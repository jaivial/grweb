-- +goose Up
-- BIZ-143: GRS Fantasy por salas. Una sala = un grupo de 2–10 fans de una jornada con su propio mercado (un dueño
-- por atleta DENTRO de la sala), alineación de exactamente 5 atletas (sin suplentes) y nota 0–10 por atleta.

CREATE TABLE salas (
    id               uuid PRIMARY KEY,
    competition_id   uuid        NOT NULL,
    jornada_id       uuid        NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
    nombre           text        NOT NULL,
    nombre_norm      text        NOT NULL,
    anfitrion_fan_id uuid        NOT NULL,
    plazas           integer     NOT NULL CHECK (plazas BETWEEN 2 AND 10),
    publica          boolean     NOT NULL DEFAULT true,
    codigo           text        NOT NULL UNIQUE,
    -- abierta (antes de la primera sesión) → en_juego → finalizada; cancelada = empezó el día con 1 miembro;
    -- cerrada = la cerró el anfitrión o se quedó vacía.
    estado           text        NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_juego', 'cancelada', 'cerrada', 'finalizada')),
    version          integer     NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX salas_nombre ON salas (jornada_id, nombre_norm) WHERE estado IN ('abierta', 'en_juego');
CREATE INDEX salas_jornada ON salas (jornada_id, estado);

-- Una sala por fan y jornada (UNIQUE). miembro_id es el identificador público del miembro (nunca el fan id).
CREATE TABLE sala_miembros (
    sala_id    uuid        NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    jornada_id uuid        NOT NULL,
    fan_id     uuid        NOT NULL,
    miembro_id uuid        NOT NULL UNIQUE,
    alias      text        NOT NULL DEFAULT '',
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sala_id, fan_id),
    UNIQUE (jornada_id, fan_id)
);

-- Solicitudes de unión desde el lobby (una fila por fan y sala). «expulsada» también bloquea la entrada por enlace.
CREATE TABLE sala_solicitudes (
    id         uuid PRIMARY KEY,
    sala_id    uuid        NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    jornada_id uuid        NOT NULL,
    fan_id     uuid        NOT NULL,
    alias      text        NOT NULL DEFAULT '',
    estado     text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'cancelada', 'caducada', 'sala_llena', 'expulsada')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sala_id, fan_id)
);
CREATE INDEX sala_solicitudes_fan ON sala_solicitudes (jornada_id, fan_id, estado);

-- Propiedad de los atletas dentro de una sala (la cláusula sigue en fantasy_atletas: una por atleta y jornada).
CREATE TABLE sala_atletas (
    sala_id         uuid        NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    jornada_id      uuid        NOT NULL,
    atleta_id       uuid        NOT NULL,
    dueno_fan_id    uuid,
    dueno_alias     text        NOT NULL DEFAULT '',
    protegido_hasta timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sala_id, atleta_id)
);
CREATE INDEX sala_atletas_dueno ON sala_atletas (sala_id, dueno_fan_id);

-- Palmarés: foto de la clasificación de cada sala al cerrar la jornada.
CREATE TABLE palmares (
    sala_id        uuid          NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    fan_id         uuid          NOT NULL,
    jornada_id     uuid          NOT NULL,
    competition_id uuid          NOT NULL,
    puesto         integer       NOT NULL,
    alias          text          NOT NULL DEFAULT '',
    nota           numeric(5, 2) NOT NULL DEFAULT 0,
    valor          bigint        NOT NULL DEFAULT 0,
    saldo          bigint        NOT NULL DEFAULT 0,
    alineacion     jsonb         NOT NULL DEFAULT '[]',
    created_at     timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (sala_id, fan_id)
);
CREATE INDEX palmares_jornada ON palmares (competition_id, jornada_id, puesto);

ALTER TABLE fichajes ADD COLUMN sala_id uuid;
CREATE INDEX fichajes_sala ON fichajes (sala_id, created_at DESC);

-- Nota 0–10 ya aplicada a la cláusula (NULL = todavía sin intentos juzgados).
ALTER TABLE fantasy_atletas ADD COLUMN nota numeric(4, 2);
-- Factor de la nota ya aplicado a la cláusula: 1 sin nota, 1 + 4 % × (nota − 5) con nota, 0,70 con blanqueo.
ALTER TABLE fantasy_atletas ADD COLUMN factor_nota numeric(6, 4) NOT NULL DEFAULT 1;

-- Datos previos: las jornadas cerradas no se tocan (histórico). En las no cerradas la propiedad global deja de
-- existir: cada dueño recupera el valor actual del atleta (movimiento idempotente por ref) y el atleta queda libre.
WITH dev AS (
    INSERT INTO movimientos (id, jornada_id, fan_id, moneda, importe, motivo, ref)
    SELECT gen_random_uuid(), fa.jornada_id, fa.dueno_fan_id, 'fantasy', fa.clausula, 'migracion_salas',
           'migracion-salas:' || fa.jornada_id || ':' || fa.atleta_id
    FROM fantasy_atletas fa JOIN jornadas j ON j.id = fa.jornada_id
    WHERE fa.dueno_fan_id IS NOT NULL AND j.estado <> 'cerrada'
    ON CONFLICT (ref) DO NOTHING
    RETURNING jornada_id, fan_id, importe
)
UPDATE saldos s SET saldo = s.saldo + d.total, version = s.version + 1, updated_at = now()
FROM (SELECT jornada_id, fan_id, sum(importe) AS total FROM dev GROUP BY jornada_id, fan_id) d
WHERE s.jornada_id = d.jornada_id AND s.fan_id = d.fan_id AND s.moneda = 'fantasy';

UPDATE fantasy_atletas fa SET dueno_fan_id = NULL, dueno_alias = '', titular = false, protegido_hasta = NULL
FROM jornadas j WHERE j.id = fa.jornada_id AND j.estado <> 'cerrada' AND fa.dueno_fan_id IS NOT NULL;

-- Sin suplentes: alineación de exactamente 5. La tabla de puntos pasa a ser la de la nota 0–10.
ALTER TABLE config_juegos ALTER COLUMN plantilla_max SET DEFAULT 5;
ALTER TABLE config_juegos ALTER COLUMN puntos SET DEFAULT '{"intentos":5,"puesto":[3,2.4,1.8,1.2,0.6],"pleno":0.5,"recordPersonal":0.6,"recordCompeticion":1,"total":0.3,"nulo":0.3,"pctClausula":4}';
UPDATE config_juegos SET plantilla_max = 5, titulares_max = 5,
    puntos = '{"intentos":5,"puesto":[3,2.4,1.8,1.2,0.6],"pleno":0.5,"recordPersonal":0.6,"recordCompeticion":1,"total":0.3,"nulo":0.3,"pctClausula":4}',
    version = version + 1, updated_at = now();

-- +goose Down
UPDATE config_juegos SET plantilla_max = 8,
    puntos = '{"intentoValido":3,"pleno":5,"blanqueo":-15,"cat":[20,14,10,5,2],"gl":[25,18,12,4],"mov":[10,6,3]}';
ALTER TABLE config_juegos ALTER COLUMN puntos SET DEFAULT '{"intentoValido":3,"pleno":5,"blanqueo":-15,"cat":[20,14,10,5,2],"gl":[25,18,12,4],"mov":[10,6,3]}';
ALTER TABLE config_juegos ALTER COLUMN plantilla_max SET DEFAULT 8;
ALTER TABLE fantasy_atletas DROP COLUMN factor_nota;
ALTER TABLE fantasy_atletas DROP COLUMN nota;
DROP INDEX fichajes_sala;
ALTER TABLE fichajes DROP COLUMN sala_id;
DROP TABLE palmares;
DROP TABLE sala_atletas;
DROP TABLE sala_solicitudes;
DROP TABLE sala_miembros;
DROP TABLE salas;
