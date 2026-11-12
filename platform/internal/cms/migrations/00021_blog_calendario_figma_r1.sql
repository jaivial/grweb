-- +goose Up
-- U23 fix r1: the calendar article of Figma 34 1:1 (00020 skipped the row that already existed: overwrite it),
-- numbered sections and the 5 contents entries ({toc: …}), and the reading times of Figma 34 (minutos_lectura;
-- NULL = computed from the text).
ALTER TABLE paginas ADD COLUMN IF NOT EXISTS minutos_lectura int CHECK (minutos_lectura BETWEEN 1 AND 120);

UPDATE paginas SET minutos_lectura = v.m
FROM (VALUES ('calendario-powerlifting-comunitat-valenciana-2026', 6), ('primera-competicion-powerlifting-guia', 8), ('niveles-aep-1-aep-2-aep-3', 5),
  ('que-llevar-dia-competicion', 4), ('marcas-minimas-aep-explicadas', 6), ('grstrength-cup-2025-lliria', 5), ('elegir-primeros-intentos', 7)) AS v(slug, m)
WHERE paginas.tipo = 'blog' AND paginas.slug = v.slug;

UPDATE paginas SET
  titulo = 'Calendario de powerlifting 2026 en la Comunitat Valenciana',
  resumen = 'Las competiciones AEP de la zona Este-2 (Valencia, Murcia y Baleares) y los campeonatos nacionales a los que puedes clasificarte.',
  fuente = 'Calendario de competiciones AEP 2026 (actualizado a 09/11/2025)',
  categoria = 'calendario',
  cuerpo = $md$> [!resumen] En resumen {toc: En resumen}
> - 4 competiciones AEP en la zona Este-2 en 2026 (2 regionales AEP-2 y 2 de iniciación AEP-3).
> - La GR Strength organiza el AEP-3 de Valencia en octubre (fecha pendiente).
> - Tu total en un AEP-2 clasifica para un AEP-1 o el Clasificatorio Nacional.
> - Las fechas pendientes pueden cambiar hasta 3 meses antes.

## 1. Competiciones en la zona Este-2 {toc: Zona Este-2}

La zona Este-2 de la AEP agrupa a Valencia, Murcia y Baleares. Estas son las competiciones previstas para 2026 en la región:

| Fecha | Competición | Lugar | Organiza | Nivel |
| --- | --- | --- | --- | --- |
| 21–22 mar | AEP 3 · Murcia | Murcia | Myrthea | AEP-3 |
| junio · pendiente | ESTE-2 · Campeonato SudEste | Chiva (Valencia) | Fuerza Isabel | AEP-2 |
| octubre · pendiente | AEP 3 · Valencia | Valencia | GR Strength | AEP-3 |
| diciembre · pendiente | ESTE-2 · Campeonato SudEste | Murcia | Myrthea | AEP-2 |

> [!dato] Baleares {toc: Baleares}
> Los atletas de Baleares también pueden competir en el ESTE-1 (Cataluña y Baleares): Tarragona en mayo y Barcelona en el último trimestre, ambos pendientes de fecha.

## 2. Nacionales a las que puedes clasificarte {toc: Nacionales}

Con una marca conseguida en un AEP-2 puedes optar a una plaza en estos campeonatos AEP-1 (las fechas definitivas se publican entre el 20 de noviembre y el 1 de diciembre):

> [!filas]
> - **Clasificatorio Nacional** — 5–7 jun · Madrid
> - **Campeonato de España Júnior** — julio · Por confirmar
> - **Copa de España de Powerlifting** — oct–nov · Por confirmar
> - **Campeonato de España Absoluto** — noviembre · Por confirmar

> [!importante] Importante {toc: Cambios de fecha}
> Fechas sujetas a cambios: hasta 3 meses antes del inicio previsto, la AEP puede modificarlas por necesidades de organización. Consulta siempre el calendario oficial.
$md$
WHERE tipo = 'blog' AND slug = 'calendario-powerlifting-comunitat-valenciana-2026';

-- +goose Down
ALTER TABLE paginas DROP COLUMN IF EXISTS minutos_lectura;
