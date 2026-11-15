import type { BoTab } from '../../../shared/ui';

/** Las tres vistas de Patrocinio (banners, informe del día y configuración del reparto) como pestañas con estado activo. */
export const patrocinioTabs = (slug: string | undefined): BoTab[] => [
  { label: 'Banners', path: `/${slug}/patrocinio/banners` },
  { label: 'Informe del día', path: `/${slug}/patrocinio/informe` },
  { label: 'Configuración', path: `/${slug}/patrocinio/configuracion` },
];
