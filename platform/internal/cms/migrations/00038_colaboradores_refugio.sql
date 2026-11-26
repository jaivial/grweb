-- +goose Up
-- Colaboradores Refugio: the hotels / apartments / restaurants of /donde-dormir-y-comer and the powerlifting gyms of
-- /como-llegar, editable from the backoffice instead of hard-coded in the web. Both tables keep the fields of a place
-- of the guide (nombre, detalle, distancia, precio, contacto, web, imagen, logo, mapa, descripción); images live in
-- the CDN (Bunny) and only their URL is stored. «en» holds the English texts (detalle, precio, descripcion).
CREATE TABLE hoteles_restaurantes (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    tipo            text        NOT NULL DEFAULT 'hotel' CHECK (tipo IN ('hotel', 'apartamento', 'restaurante')),
    nombre          text        NOT NULL,
    detalle         text        NOT NULL DEFAULT '',
    distancia       text        NOT NULL DEFAULT '',
    precio          text        NOT NULL DEFAULT '',
    telefono        text        NOT NULL DEFAULT '',
    email           text        NOT NULL DEFAULT '',
    web             text        NOT NULL DEFAULT '',
    imagen_url      text        NOT NULL DEFAULT '',
    logo_url        text        NOT NULL DEFAULT '',
    logo_claro      boolean     NOT NULL DEFAULT false,
    logo_oscuro_url text        NOT NULL DEFAULT '',
    maps_url        text        NOT NULL DEFAULT '',
    descripcion     text        NOT NULL DEFAULT '',
    orden           integer     NOT NULL DEFAULT 0,
    en              jsonb       NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hoteles_restaurantes_comp_idx ON hoteles_restaurantes (competition_id, orden);

CREATE TABLE gimnasios (
    id              uuid PRIMARY KEY,
    competition_id  uuid        NOT NULL,
    nombre          text        NOT NULL,
    detalle         text        NOT NULL DEFAULT '',
    distancia       text        NOT NULL DEFAULT '',
    precio          text        NOT NULL DEFAULT '',
    telefono        text        NOT NULL DEFAULT '',
    email           text        NOT NULL DEFAULT '',
    web             text        NOT NULL DEFAULT '',
    imagen_url      text        NOT NULL DEFAULT '',
    logo_url        text        NOT NULL DEFAULT '',
    logo_claro      boolean     NOT NULL DEFAULT false,
    logo_oscuro_url text        NOT NULL DEFAULT '',
    maps_url        text        NOT NULL DEFAULT '',
    descripcion     text        NOT NULL DEFAULT '',
    orden           integer     NOT NULL DEFAULT 0,
    en              jsonb       NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gimnasios_comp_idx ON gimnasios (competition_id, orden);

-- The places the web showed hard-coded (24 Nov 2026), for every competition with web content.
INSERT INTO hoteles_restaurantes (id, competition_id, tipo, nombre, detalle, precio, telefono, email, web, maps_url, descripcion, orden, en)
SELECT gen_random_uuid(), c.competition_id, h.tipo, h.nombre, h.detalle, h.precio, h.telefono, h.email, h.web, h.maps_url, h.descripcion, h.orden, h.en
FROM (SELECT DISTINCT competition_id FROM secciones) c CROSS JOIN (VALUES
  ('hotel', 'Hotel Key Reig', 'Carrer dels Llauradors, 13, 46440 Almussafes, Valencia',
   'Tarifa GRS: 60 € en habitación doble (precio especial de grupo)', '+34 615 872 444', 'info@hotelkeyreig.com',
   'https://www.hotelkeyreig.com/', 'https://www.google.com/maps/search/?api=1&query=Hotel+Key+Reig+Almussafes',
   'Para reservar: llamar al hotel e indicar que se viene con el grupo GRS. Hotel urbano renovado, dentro del casco urbano de Almussafes y con buena conexión con la AP-7/A-7 hacia Valencia. 48 habitaciones con baño privado, TV y aire acondicionado: individuales, dobles y compartidas (hasta 4 personas). Wi-Fi de alta velocidad, desayuno tipo buffet, coworking, comedor, gimnasio, lavandería y traslado al aeropuerto. Acceso con código inteligente y check-in 24 horas.',
   1, jsonb_build_object('precio', 'GRS rate: €60 per double room (special group price)',
   'descripcion', 'To book: call the hotel and say you are coming with the GRS group. Renovated urban hotel in the town centre of Almussafes, well connected to the AP-7/A-7 towards Valencia. 48 rooms with private bathroom, TV and air conditioning: single, double and shared (up to 4 people). High-speed Wi-Fi, buffet breakfast, coworking, dining room, gym, laundry and airport transfer. Smart-code access and 24-hour check-in.')),
  ('hotel', 'Ramada by Wyndham Valencia Almussafes', 'Avenida de la Foia, s/n, 46440 Almussafes, Valencia',
   'Tarifa GRS: 99 € con desayuno incluido (tarifa especial)', '+34 961 744 300', 'reservas@ramadavalencia.com',
   'https://ramada-wyndham-valencia-almussafes.bookstaygo.com/', 'https://www.google.com/maps/search/?api=1&query=Ramada+by+Wyndham+Valencia+Almussafes',
   'Para reservar: indicar "reserva GRS" (enlace de reserva facilitado por el grupo). Hotel de 3 estrellas junto a la AP-7, a unos 30 km del aeropuerto de Valencia y al lado del parque empresarial Juan Carlos I y la factoría Ford. Piscina exterior, gimnasio 24 horas, restaurante de desayunos, bar, parking gratuito, Wi-Fi de alta velocidad, recepción 24 horas y salas para eventos.',
   2, jsonb_build_object('precio', 'GRS rate: €99 with breakfast included (special rate)',
   'descripcion', 'To book: say "reserva GRS" (booking link provided by the group). 3-star hotel next to the AP-7, about 30 km from Valencia airport, beside the Juan Carlos I business park and the Ford factory. Outdoor pool, 24-hour gym, breakfast restaurant, bar, free parking, high-speed Wi-Fi, 24-hour reception and event rooms.'))
) AS h(tipo, nombre, detalle, precio, telefono, email, web, maps_url, descripcion, orden, en);

INSERT INTO gimnasios (id, competition_id, nombre, detalle, web, logo_url, logo_claro, logo_oscuro_url, maps_url, descripcion, orden, en)
SELECT gen_random_uuid(), c.competition_id, g.nombre, g.detalle, g.web, g.logo_url, g.logo_claro, g.logo_oscuro_url, g.maps_url, g.descripcion, g.orden, g.en
FROM (SELECT DISTINCT competition_id FROM secciones) c CROSS JOIN (VALUES
  ('F.E.R Entrenamiento', 'Polígono Industrial Canyada dels Codonyers, calle 13, nº 11, nave 9, 46220 Picassent', 'https://ferentrenamiento.wodbuster.com',
   'https://jaimedigitalstudio.b-cdn.net/grcup/gimnasios_donde_entrenar/logo-fer-entrenamiento.webp', true, '', 'https://maps.app.goo.gl/U6JRbXb7iw7wTuC78',
   'Abierto 24 h. 400 m² de material, clases de crosstraining y sala de musculación. Tarifa «Open Powerlifting» de 40 €/mes con acceso a la zona de material de competición.',
   1, jsonb_build_object('descripcion', 'Open 24 h. 400 m² of equipment, crosstraining classes and a weights room. «Open Powerlifting» plan at €40/month with access to the competition equipment area.')),
  ('NewQ Almussafes Fitness', 'Ronda Síndic Antoni Albuixech, 123, 46440 Almussafes', 'https://newquo.es',
   'https://jaimedigitalstudio.b-cdn.net/grcup/gimnasios_donde_entrenar/logo-newq-almussafes.webp', false, 'https://jaimedigitalstudio.b-cdn.net/grcup/gimnasios_donde_entrenar/logo-newq-almussafes-claro.webp', 'https://maps.app.goo.gl/T5FYoVatjRhNw5Y76',
   'Gimnasio con clases colectivas variadas y monitores; máquinas nuevas tras una reforma.',
   2, jsonb_build_object('descripcion', 'Gym with a variety of group classes and instructors; new machines after a refurbishment.')),
  ('Valhalla Gym Almussafes', 'Carrer Sant Cristòfol, 61, Bajo, 46440 Almussafes', 'https://valhallagymalmussafes.es',
   'https://jaimedigitalstudio.b-cdn.net/grcup/gimnasios_donde_entrenar/logo-valhalla-gym-almussafes.webp', false, '', 'https://maps.app.goo.gl/7KYWNZ6vU88cCVJL8',
   'Gimnasio reciente con mucha variedad de máquinas.',
   3, jsonb_build_object('descripcion', 'Recently opened gym with a wide variety of machines.')),
  ('Pabellón Municipal de Almussafes', 'Avda. Laura Méndez, s/n, 46440 Almussafes', 'https://almussafes.es',
   'https://jaimedigitalstudio.b-cdn.net/grcup/static/b3c1eec5aa3f/logo-almussafes-bn.webp', true, '', 'https://maps.app.goo.gl/aidcANg9ngd7qvoz7',
   'Centro deportivo municipal: pabellón cubierto con acceso por la CV-42 desde la AP-7.',
   4, jsonb_build_object('descripcion', 'Municipal sports centre: indoor hall reached via the CV-42 from the AP-7.')),
  ('The Factory Workout', 'Carrer Montroi, 10, 46450 Benifaió', 'https://mimpalawellness.com/tfw',
   'https://jaimedigitalstudio.b-cdn.net/grcup/gimnasios_donde_entrenar/logo-the-factory-workout.webp', true, '', 'https://maps.app.goo.gl/yGipVmFfo4M9G4Dt9',
   'Sala fitness con máquinas de musculación y peso libre, clases dirigidas y asesoramiento nutricional.',
   5, jsonb_build_object('descripcion', 'Fitness room with weight machines and free weights, group classes and nutrition advice.')),
  ('3D Valencia Centro Deportivo', 'Calle Cofrentes, 5, 46010 Valencia (tranvía Primado Reig, líneas 4/6)', 'https://3dvalencia.es',
   'https://jaimedigitalstudio.b-cdn.net/grcup/gimnasios_donde_entrenar/logo-3d-valencia.webp', false, '', 'https://maps.app.goo.gl/AnFsLHhz2YyLt9YeA',
   'Gimnasio y entrenamiento personal, con asesoría online y amplia zona de máquinas.',
   6, jsonb_build_object('detalle', 'Calle Cofrentes, 5, 46010 Valencia (Primado Reig tram stop, lines 4/6)',
   'descripcion', 'Gym and personal training, with online coaching and a large machine area.'))
) AS g(nombre, detalle, web, logo_url, logo_claro, logo_oscuro_url, maps_url, descripcion, orden, en);

-- +goose Down
DROP TABLE gimnasios;
DROP TABLE hoteles_restaurantes;
