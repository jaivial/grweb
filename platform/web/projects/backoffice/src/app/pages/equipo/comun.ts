import type { GrTone } from '@grcup/ui';

// Types and helpers of «Equipo y permisos» and «Auditoría» (Figma 63).

export interface Miembro {
  usuarioId: string;
  email: string;
  nombre: string;
  rolSlug: string;
  rolNombre: string;
  estado: 'activo' | 'suspendido';
  ultimoAcceso?: string;
  desde: string;
  dosFactores: boolean;
  competiciones: string[];
  invitadoPor?: string;
}
export interface Rol {
  id: string;
  slug: string;
  nombre: string;
  sistema: boolean;
  bloqueado: boolean;
  permisos: string[];
  exige2fa: boolean;
  miembros: number;
  version: number;
}
export interface RolesResp {
  roles: Rol[];
  heredados: Record<string, string[]>;
}
export interface Invitacion {
  id: string;
  email: string;
  rolSlug: string;
  rolNombre: string;
  invitadoPor: string;
  expiresAt: string;
  createdAt: string;
  caducada: boolean;
}
export interface Sesion {
  id: string;
  origen: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
}
export interface Entrada {
  id: string;
  tipo: string;
  servicio: string;
  entidad: string;
  actorId?: string;
  actor: string;
  origen: string;
  datos: Record<string, unknown>;
  diff?: unknown;
  requestId: string;
  fecha: string;
  resumen: string;
  ip?: string;
  agente?: string;
  peticion?: string;
}

/** The 17 permission keys in the order and groups of the matrix (Figma 63 · «Roles y permisos»). */
export const PERMISOS: { g: string; items: { k: string; d: string }[] }[] = [
  {
    g: 'Evento',
    items: [
      { k: 'evento.editar', d: 'Datos, estado y módulos' },
      { k: 'web.editar', d: 'Textos, FAQ, patrocinadores' },
      { k: 'web.publicar', d: 'Publicar cambios de la web' },
    ],
  },
  {
    g: 'Competición',
    items: [
      { k: 'atletas.editar', d: 'Fichas, importar acta' },
      { k: 'horarios.publicar', d: 'Publicar flights' },
      { k: 'directo.operar', d: 'Mesa de control' },
      { k: 'resultados.publicar', d: 'Publicar resultados' },
    ],
  },
  {
    g: 'Público',
    items: [
      { k: 'entradas.gestionar', d: 'Sesiones, reservas, anular' },
      { k: 'checkin.escanear', d: 'Escáner de puerta' },
      { k: 'sorteo.gestionar', d: 'Precio, boletos, reembolsos' },
      { k: 'sorteo.sortear', d: 'Realizar el sorteo' },
      { k: 'contactos.ver', d: 'Ver contactos' },
      { k: 'contactos.exportar', d: 'Exportar / RGPD' },
      { k: 'campanas.enviar', d: 'Enviar campañas (email y WhatsApp)' },
    ],
  },
  {
    g: 'Equipo y sistema',
    items: [
      { k: 'equipo.gestionar', d: 'Invitar y asignar roles' },
      { k: 'auditoria.ver', d: 'Ver auditoría' },
      { k: 'integraciones.config', d: 'Email, Stripe, AEP, CDN' },
    ],
  },
];

/** Permissions of the day of the event (desk and door): Figma recommends 2FA for them. */
export const PERMISOS_DIA = ['directo.operar', 'checkin.escanear'];

const dm = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

/** «ahora», «hace 5 min», «hace 1 h», else «25/07 08:12». */
export function rel(iso?: string | null): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return dm.format(new Date(iso)).replace(',', '');
}

export function iniciales(s: string): string {
  return s
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
}

/** Badge tone of a role (Figma: Admin red, Comunicación blue, the rest neutral). */
export function tonoRol(slug: string): GrTone {
  return slug === 'admin' || slug === 'root'
    ? 'danger'
    : slug === 'comunicacion'
      ? 'info'
      : 'neutral';
}

export function dispositivo(ua: string): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  const br = /Firefox\//.test(ua)
    ? 'Firefox'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /curl|grcup/i.test(ua)
            ? 'CLI'
            : '';
  return [os, br].filter(Boolean).join(' · ') || 'Dispositivo desconocido';
}

/** IP shown without the host part: «83.45.x.x». */
export function ipCorta(ip: string): string {
  const p = ip.split('.');
  if (p.length === 4) return `${p[0]}.${p[1]}.x.x`;
  const q = ip.split(':');
  return q.length > 2 ? `${q[0]}:${q[1]}:x` : ip || '—';
}

/** Diffs as Figma shows them: `"campo": [antes, después]`. */
export function diffLegible(diff: unknown): unknown {
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return diff;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(diff as Record<string, unknown>)) {
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && 'antes' in v && 'despues' in v
        ? [(v as Record<string, unknown>)['antes'], (v as Record<string, unknown>)['despues']]
        : v;
  }
  return out;
}
