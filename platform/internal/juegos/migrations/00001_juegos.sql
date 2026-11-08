-- +goose Up
-- Juegos (contract §6): jornadas, carteras as a ledger (porra and fantasy coins never mix), porra (parimutuel
-- markets), GRS Fantasy (clauses, signings, points), prizes and classifications.

-- One jornada = (competition_id, dia) with a visible name («AEP-2»). Active = dia = today (Europe/Madrid) with
-- estado abierta or en_juego. borrador → abierta (playable) → en_juego (attempts) → cerrada (liquidated, read-only).
CREATE TABLE jornadas (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    dia            date        NOT NULL,
    nombre         text        NOT NULL,
    estado         text        NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'abierta', 'en_juego', 'cerrada')),
    version        integer     NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (competition_id, dia)
);
CREATE INDEX jornadas_activa ON jornadas (competition_id, estado, dia);

-- Configurable amounts (contract §6.2–6.4: bets, clauses, rewards and points). One row per competition.
CREATE TABLE config_juegos (
    competition_id      uuid PRIMARY KEY,
    porra_min           integer     NOT NULL DEFAULT 100,
    porra_max           integer     NOT NULL DEFAULT 50000,
    hito5_porra         integer     NOT NULL DEFAULT 100,
    hito10_porra        integer     NOT NULL DEFAULT 500,
    hito5_fantasy       integer     NOT NULL DEFAULT 10000,
    hito10_fantasy      integer     NOT NULL DEFAULT 50000,
    fantasy_por_euro    integer     NOT NULL DEFAULT 10000 CHECK (fantasy_por_euro BETWEEN 0 AND 1000000),
    max_hitos           integer     NOT NULL DEFAULT 100 CHECK (max_hitos BETWEEN 1 AND 1000),
    max_clausulazos     integer     NOT NULL DEFAULT 3 CHECK (max_clausulazos BETWEEN 0 AND 20),
    proteccion_min      integer     NOT NULL DEFAULT 10 CHECK (proteccion_min BETWEEN 0 AND 240),
    plantilla_max       integer     NOT NULL DEFAULT 8 CHECK (plantilla_max BETWEEN 1 AND 30),
    titulares_max       integer     NOT NULL DEFAULT 5 CHECK (titulares_max BETWEEN 1 AND 15),
    clausula_inicial    bigint      NOT NULL DEFAULT 200000,
    clausula_min        bigint      NOT NULL DEFAULT 50000,
    clausula_max        bigint      NOT NULL DEFAULT 5000000,
    pct_valido          integer     NOT NULL DEFAULT 5,
    pct_nulo            integer     NOT NULL DEFAULT -4,
    pct_blanqueo        integer     NOT NULL DEFAULT -30,
    pct_demanda         integer     NOT NULL DEFAULT 3,
    pct_puesto          integer[]   NOT NULL DEFAULT '{25,15,8}' CHECK (array_length(pct_puesto, 1) = 3),
    puntos              jsonb       NOT NULL DEFAULT '{"intentoValido":3,"pleno":5,"blanqueo":-15,"cat":[20,14,10,5,2],"gl":[25,18,12,4],"mov":[10,6,3]}',
    activo              boolean     NOT NULL DEFAULT true,
    version             integer     NOT NULL DEFAULT 1,
    updated_por         text        NOT NULL DEFAULT '',
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Wallets. Two separated, non-transferable coins. saldo >= 0 in the database: no double spending, no debt.
CREATE TABLE saldos (
    jornada_id    uuid        NOT NULL,
    competition_id uuid       NOT NULL,
    fan_id        uuid        NOT NULL,
    moneda        text        NOT NULL CHECK (moneda IN ('porra', 'fantasy')),
    saldo         bigint      NOT NULL DEFAULT 0 CHECK (saldo >= 0),
    alias         text        NOT NULL DEFAULT '',
    version       integer     NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (jornada_id, fan_id, moneda)
);
CREATE INDEX saldos_rank ON saldos (jornada_id, moneda, saldo DESC);

-- Ledger: every change of a wallet is a row, idempotent by ref (contract §6.1 and §6.4).
CREATE TABLE movimientos (
    id          uuid PRIMARY KEY,
    jornada_id  uuid        NOT NULL,
    fan_id      uuid        NOT NULL,
    moneda      text        NOT NULL CHECK (moneda IN ('porra', 'fantasy')),
    importe     bigint      NOT NULL,
    motivo      text        NOT NULL,
    ref         text        NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_cartera ON movimientos (jornada_id, fan_id, moneda, created_at DESC);

-- Porra markets: ganador de categoría, mejor IPF GL por sexo, mayor levantamiento por sexo y movimiento.
CREATE TABLE mercados (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    jornada_id     uuid        NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
    tipo           text        NOT NULL CHECK (tipo IN ('categoria', 'gl', 'movimiento')),
    sexo           text        NOT NULL CHECK (sexo IN ('F', 'M')),
    categoria      text        NOT NULL DEFAULT '',
    movimiento     text        NOT NULL DEFAULT '' CHECK (movimiento IN ('', 'sq', 'bp', 'dl')),
    titulo         text        NOT NULL,
    opciones       uuid[]      NOT NULL DEFAULT '{}',
    estado         text        NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'liquidado')),
    ganador        uuid[]      NOT NULL DEFAULT '{}',
    cerrado_en     timestamptz,
    liquidado_at   timestamptz,
    version        integer     NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (jornada_id, tipo, sexo, categoria, movimiento)
);
CREATE INDEX mercados_jornada ON mercados (jornada_id, estado);

-- Bets: several per market and fan allowed; min and max configurable.
CREATE TABLE apuestas (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    jornada_id     uuid        NOT NULL,
    mercado_id     uuid        NOT NULL REFERENCES mercados(id) ON DELETE CASCADE,
    fan_id         uuid        NOT NULL,
    atleta_id      uuid        NOT NULL,
    importe        bigint      NOT NULL CHECK (importe > 0),
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX apuestas_mercado ON apuestas (mercado_id);
CREATE INDEX apuestas_fan ON apuestas (jornada_id, fan_id, created_at DESC);

-- GRS Fantasy athletes of a jornada (from the live scoreboard). clausula = valor (one number per athlete and
-- jornada). One owner at most per jornada; protegido_hasta blocks clausulazos for a while after a change.
CREATE TABLE fantasy_atletas (
    jornada_id     uuid        NOT NULL,
    competition_id uuid        NOT NULL,
    atleta_id      uuid        NOT NULL,
    nombre_publico text        NOT NULL,
    sexo           text        NOT NULL CHECK (sexo IN ('F', 'M')),
    categoria      text        NOT NULL,
    clausula       bigint      NOT NULL CHECK (clausula > 0),
    dueno_fan_id   uuid,
    dueno_alias    text        NOT NULL DEFAULT '',
    titular        boolean     NOT NULL DEFAULT false,
    protegido_hasta timestamptz,
    version        integer     NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (jornada_id, atleta_id)
);
CREATE INDEX fantasy_atletas_dueno ON fantasy_atletas (jornada_id, dueno_fan_id);

-- Signings: compra (free athlete), venta (back to the market) and clausulazo (pay another owner's clause).
CREATE TABLE fichajes (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    jornada_id     uuid        NOT NULL,
    atleta_id      uuid        NOT NULL,
    de_fan         uuid,
    a_fan          uuid        NOT NULL,
    tipo           text        NOT NULL CHECK (tipo IN ('compra', 'venta', 'clausulazo')),
    precio         bigint      NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fichajes_jornada ON fichajes (jornada_id, created_at DESC);

-- Clause history for the chart; every change is one row (contract §6.3).
CREATE TABLE historial_clausulas (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    jornada_id     uuid        NOT NULL,
    atleta_id      uuid        NOT NULL,
    clausula       bigint      NOT NULL,
    delta          bigint      NOT NULL,
    motivo         text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historial_clausulas_atleta ON historial_clausulas (jornada_id, atleta_id, created_at);

-- Points of the fantasy. Idempotent by ref (e.g. punto:intento:<atleta>:<mov>:<n>); a correction rewrites the row
-- without changing the owner (contract §6.3).
CREATE TABLE puntos (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    jornada_id     uuid        NOT NULL,
    fan_id         uuid        NOT NULL,
    atleta_id      uuid        NOT NULL,
    concepto       text        NOT NULL,
    puntos         integer     NOT NULL,
    ref            text        NOT NULL UNIQUE,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX puntos_clasificacion ON puntos (jornada_id, fan_id);

-- What the worker has already seen of each attempt: the owner (titular) at the verdict moment, so a later
-- correction keeps the attribution (contract §6.3).
CREATE TABLE intentos_vistos (
    jornada_id   uuid        NOT NULL,
    atleta_id    uuid        NOT NULL,
    mov          text        NOT NULL CHECK (mov IN ('sq', 'bp', 'dl')),
    numero       integer     NOT NULL CHECK (numero BETWEEN 1 AND 3),
    resultado    text        NOT NULL CHECK (resultado IN ('valido', 'nulo', 'renuncia')),
    dueno_fan_id uuid,
    titular      boolean     NOT NULL DEFAULT false,
    delta_pct    integer     NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (jornada_id, atleta_id, mov, numero)
);

-- Published categories already applied (fantasy place points and clause adjustments) and whole sexes (GL and
-- movement points, gl/movimiento market liquidation). clave = cat:F-63 | sexo:F.
CREATE TABLE publicaciones (
    jornada_id uuid        NOT NULL,
    clave      text        NOT NULL,
    aplicada_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (jornada_id, clave)
);

-- Prizes (contract §6.5): managed in the backoffice, shown as a hook in the live classifications.
CREATE TABLE premios (
    id             uuid PRIMARY KEY,
    competition_id uuid        NOT NULL,
    jornada_id     uuid,
    ranking        text        NOT NULL CHECK (ranking IN ('porra', 'fantasy', 'donantes')),
    puesto_desde   integer     NOT NULL CHECK (puesto_desde >= 1),
    puesto_hasta   integer     NOT NULL CHECK (puesto_hasta >= puesto_desde),
    titulo         text        NOT NULL,
    descripcion    text        NOT NULL DEFAULT '',
    imagen_url     text        NOT NULL DEFAULT '',
    valor_texto    text        NOT NULL DEFAULT '',
    patrocinador   text        NOT NULL DEFAULT '',
    orden          integer     NOT NULL DEFAULT 0,
    activo         boolean     NOT NULL DEFAULT true,
    version        integer     NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX premios_visibles ON premios (competition_id, jornada_id, activo, ranking, orden);

-- +goose Down
DROP TABLE premios;
DROP TABLE publicaciones;
DROP TABLE intentos_vistos;
DROP TABLE puntos;
DROP TABLE historial_clausulas;
DROP TABLE fichajes;
DROP TABLE fantasy_atletas;
DROP TABLE apuestas;
DROP TABLE mercados;
DROP TABLE movimientos;
DROP TABLE saldos;
DROP TABLE config_juegos;
DROP TABLE jornadas;
