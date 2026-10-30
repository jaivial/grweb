/** Spanish formatting helpers shared by web and backoffice (Europe/Madrid). */
const TZ = 'Europe/Madrid';

export function fmtNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : new Intl.NumberFormat('es-ES').format(n);
}

/** "sáb 25 jul" */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(d).replace(/[.,]/g, '');
}

/** "19 de diciembre de 2026" */
export function fmtLongDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(d);
}

/** Whole days from today to a date (negative when past). */
export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const target = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "hace 3 min", "hace 2 h", "ayer", "12 oct" */
export function fmtAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 172800) return 'ayer';
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso)).replace(/\./g, '');
}

/** "Buenos días" / "Buenas tardes" / "Buenas noches" in Madrid time. */
export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now));
  return h < 6 || h >= 21 ? 'Buenas noches' : h < 14 ? 'Buenos días' : 'Buenas tardes';
}
