/** Spanish formatting helpers shared by web and backoffice (Europe/Madrid). */
const TZ = 'Europe/Madrid';

export function fmtNumber(n: number | null | undefined): string {
  // useGrouping 'always': es-ES skips the separator under 10.000 ("1593"); Figma shows "1.593".
  return n === null || n === undefined ? '—' : new Intl.NumberFormat('es-ES', { useGrouping: 'always' as unknown as boolean }).format(n);
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

/**
 * «18–20 de diciembre de 2026» (EN: «18–20 December 2026»); the long date when there is one day.
 * The month and the year are written once when both dates share them.
 */
export function fmtDateRange(ini: string | null | undefined, fin?: string | null, locale = 'es-ES'): string {
  const fecha = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  const partes = (d: Date) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).formatToParts(d).filter((p) => p.type !== 'literal');
  const valor = (p: Intl.DateTimeFormatPart[], t: string) => p.find((x) => x.type === t)?.value ?? '';
  if (!ini) return '';
  const a = fecha(ini), b = fin ? fecha(fin) : a;
  const pa = partes(a), pb = partes(b);
  if (Number.isNaN(a.getTime())) return '';
  if (Number.isNaN(b.getTime()) || a.getTime() === b.getTime()) return fmtLongDate(ini);
  const diaA = valor(pa, 'day'), diaB = valor(pb, 'day'), mes = valor(pb, 'month'), anio = valor(pb, 'year');
  if (valor(pa, 'month') === mes && valor(pa, 'year') === anio) {
    return locale.startsWith('es') ? `${diaA}–${diaB} de ${mes} de ${anio}` : `${diaA}–${diaB} ${mes} ${anio}`;
  }
  return `${fmtLongDate(ini)} – ${fmtLongDate(fin)}`;
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
