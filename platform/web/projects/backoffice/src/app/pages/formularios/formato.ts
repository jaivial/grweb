import type { GrIconName, GrTone } from '@grcup/ui';
import type { CanalEstado, CanalFormulario, EstadoRespuesta, OrigenRespuesta } from './api';

// Shared formatting and status maps of the Formularios tabs (Envíos, Estadísticas, Atletas).

const TZ = 'Europe/Madrid';
const fechaHoraFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const numeroFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** «12 mar, 18:04» (Europe/Madrid). */
export function fechaHora(iso: string | null | undefined): string {
  return iso ? fechaHoraFmt.format(new Date(iso)).replace(/\./g, '') : '—';
}

/** «1,2 MB» / «340 KB». */
export function tamanoArchivo(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${numeroFmt.format(bytes / (1024 * 1024))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Integer percentage of `parte` over `total` (0 when there is no total). */
export function porcentaje(parte: number, total: number): number {
  return total ? Math.round((parte * 100) / total) : 0;
}

/** Channel chip: email uses info and WhatsApp success, as in Campañas. */
export const CANAL: Record<CanalFormulario, { label: string; icon: GrIconName; tone: GrTone }> = {
  email: { label: 'Email', icon: 'mail', tone: 'info' },
  whatsapp: { label: 'WhatsApp', icon: 'message', tone: 'success' },
};

export const ORIGEN: Record<OrigenRespuesta, { label: string; icon: GrIconName }> = {
  web: { label: 'Web', icon: 'globe' },
  email: { label: 'Email', icon: 'mail' },
};

export const ESTADO_RESPUESTA: Record<EstadoRespuesta, { label: string; tone: GrTone }> = {
  completa: { label: 'Completa', tone: 'success' },
  parcial: { label: 'Parcial', tone: 'warning' },
  sin_respuesta: { label: 'Sin respuesta', tone: 'neutral' },
};

/** Delivery parts of a channel, in stacking order (colour = status, shown with text too). */
export const PARTES_ENTREGA: { clave: keyof Pick<CanalEstado, 'enviados' | 'enCola' | 'fallidos' | 'omitidos'>; label: string; clase: string }[] = [
  { clave: 'enviados', label: 'enviados', clase: 'bg-success' },
  { clave: 'enCola', label: 'en cola', clase: 'bg-warning' },
  { clave: 'fallidos', label: 'fallidos', clase: 'bg-error' },
  { clave: 'omitidos', label: 'omitidos', clase: 'bg-line-strong' },
];

/** Plain-text summary of a channel's delivery («12 enviados · 3 en cola · 0 fallidos · 2 omitidos»). */
export function resumenEntregas(c: CanalEstado): string {
  return PARTES_ENTREGA.map((p) => `${numeroFmt.format(c[p.clave])} ${p.label}`).join(' · ');
}
