-- +goose Up
-- D-RIFA (Figma 60 · BO · Rifa): the online sale, payments, buyers, legal checklist and auditable draw are gone. The
-- old tables are archived (renamed, not dropped) so no purchase or draw history is lost; drop them by hand once a
-- pg_dump of grcup_raffle has been kept. rifa_items gains the optional internal note of the winner (BO «Nota interna»).
ALTER TABLE rifa_items ADD COLUMN ganador_nota text;

ALTER TABLE config        RENAME TO legacy_venta_config;
ALTER TABLE checklist     RENAME TO legacy_venta_checklist;
ALTER TABLE compras       RENAME TO legacy_venta_compras;
ALTER TABLE boletos       RENAME TO legacy_venta_boletos;
ALTER TABLE sorteos       RENAME TO legacy_venta_sorteos;
ALTER TABLE pagos_eventos RENAME TO legacy_venta_pagos_eventos;

-- +goose Down
ALTER TABLE legacy_venta_pagos_eventos RENAME TO pagos_eventos;
ALTER TABLE legacy_venta_sorteos       RENAME TO sorteos;
ALTER TABLE legacy_venta_boletos       RENAME TO boletos;
ALTER TABLE legacy_venta_compras       RENAME TO compras;
ALTER TABLE legacy_venta_checklist     RENAME TO checklist;
ALTER TABLE legacy_venta_config        RENAME TO config;
ALTER TABLE rifa_items DROP COLUMN ganador_nota;
