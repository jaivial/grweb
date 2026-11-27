import type { BoTab } from '../../shared/ui';

/** Tabs of «Sistema e integraciones», shared by its pages (each one passes the counters it knows). */
export function sistemaTabs(c: { competiciones?: number | null; integraciones?: number | null; salud?: number | null; cola?: number | null } = {}): BoTab[] {
  return [
    { label: 'Competiciones', path: '../competiciones', count: c.competiciones ?? null },
    { label: 'Integraciones', path: '../integraciones', count: c.integraciones ?? null },
    { label: 'Salud', path: '../salud', count: c.salud ?? null },
    { label: 'Cola de envío', path: '../cola-envio', count: c.cola ?? null },
    { label: 'Zona peligrosa', path: '../zona-peligrosa' },
  ];
}
