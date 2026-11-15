-- +goose Up
-- U23: the article of Figma 34 (/blog/calendario-powerlifting-comunitat-valenciana-2026) with its exact copy.
-- Only the GR Cup (the competition with the seeded «abren-las-reservas» post); idempotent.
INSERT INTO paginas (id, competition_id, tipo, slug, titulo, resumen, cuerpo, portada_url, publicada, publicar_at, categoria, fuente)
SELECT gen_random_uuid(), p.competition_id, 'blog', 'calendario-powerlifting-comunitat-valenciana-2026',
  'Calendario de powerlifting 2026 en la Comunitat Valenciana',
  'Las competiciones AEP de la zona Este-2 (Valencia, Murcia y Baleares) y los campeonatos nacionales a los que puedes clasificarte.',
  $md$> [!resumen]
> - 4 competiciones AEP en la zona Este-2 en 2026 (2 regionales AEP-2 y 2 de iniciación AEP-3).
> - La GR Strength organiza el AEP-3 de Valencia en octubre (fecha pendiente).
> - Tu total en un AEP-2 clasifica para un AEP-1 o el Clasificatorio Nacional.
> - Las fechas pendientes pueden cambiar hasta 3 meses antes.

## Competiciones en la zona Este-2

La zona Este-2 de la AEP agrupa a Valencia, Murcia y Baleares. Estas son las competiciones previstas para 2026 en la región:

| Fecha | Competición | Lugar | Organiza | Nivel |
| --- | --- | --- | --- | --- |
| 21–22 mar | AEP 3 · Murcia | Murcia | Myrthea | AEP-3 |
| junio · pendiente | ESTE-2 · Campeonato SudEste | Chiva (Valencia) | Fuerza Isabel | AEP-2 |
| octubre · pendiente | AEP 3 · Valencia | Valencia | GR Strength | AEP-3 |
| diciembre · pendiente | ESTE-2 · Campeonato SudEste | Murcia | Myrthea | AEP-2 |

## Baleares

> [!dato] Baleares
> Los atletas de Baleares también pueden competir en el ESTE-1 (Cataluña y Baleares): Tarragona en mayo y Barcelona en el último trimestre, ambos pendientes de fecha.

## Nacionales a las que puedes clasificarte

Con una marca conseguida en un AEP-2 puedes optar a una plaza en estos campeonatos AEP-1 (las fechas definitivas se publican entre el 20 de noviembre y el 1 de diciembre):

- **Clasificatorio Nacional** — 5–7 jun · Madrid
- **Campeonato de España Júnior** — julio · Por confirmar
- **Copa de España de Powerlifting** — oct–nov · Por confirmar
- **Campeonato de España Absoluto** — noviembre · Por confirmar

## Cambios de fecha

> [!importante] Importante
> Fechas sujetas a cambios: hasta 3 meses antes del inicio previsto, la AEP puede modificarlas por necesidades de organización. Consulta siempre el calendario oficial.
$md$, '', true, '2026-10-28 10:00:00+01', 'calendario', 'Calendario de competiciones AEP 2026 (actualizado a 09/11/2025)'
FROM (SELECT DISTINCT competition_id FROM paginas WHERE tipo = 'blog' AND slug = 'abren-las-reservas') p
ON CONFLICT (competition_id, tipo, slug) DO NOTHING;

-- +goose Down
DELETE FROM paginas WHERE tipo = 'blog' AND slug = 'calendario-powerlifting-comunitat-valenciana-2026';
