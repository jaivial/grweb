-- +goose Up
-- BIZ-159: official CDN logos for the sponsors in every competition. A7 keeps its logo; FER Entrenamiento has none yet (shown as text).
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/01_KGxLB_Anabolik_Wear.webp', updated_at = now() WHERE nombre = 'KGXLB';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/02_SW.webp', updated_at = now() WHERE nombre = 'Silentworker';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/03_AEP.webp', updated_at = now() WHERE nombre = 'AEP';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/05_ELEIKO.webp', updated_at = now() WHERE nombre = 'Eleiko';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/06_ER.webp', updated_at = now() WHERE nombre = 'ER Strength Club';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/08_GRStrength.webp', updated_at = now() WHERE nombre = 'GR Strength Club';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/10_GRS_Powerlifting_Coaching.webp', updated_at = now() WHERE nombre = 'GR Strength Coaching';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/09_Ajuntament_Almussafes.webp', updated_at = now() WHERE nombre = 'Ayuntamiento de Almussafes';
UPDATE patrocinadores SET logo_url = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/gr-strength-alicante-v2.webp', updated_at = now() WHERE nombre = 'GR Strength Alicante';

-- +goose Down
-- Data change: previous logos can be restored from the backoffice.
SELECT 1;
