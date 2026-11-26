/**
 * porra/formato.ts — helpers de presentación de /porra y /fantasy. Las cifras de monedas (saldos, botes, importes y
 * cláusulas) llevan siempre el punto de miles, como en Figma: es-ES no agrupa los números de 4 cifras por defecto
 * («3000»), así que se fuerza `useGrouping: 'always'` («3.000»).
 */

/** Sin tildes ni mayúsculas, para los buscadores de atletas (/porra, /fantasy/mercado). */
export const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// `useGrouping: 'always'` es de Intl.NumberFormat v3 (ES2023); el lib de TS del proyecto (ES2022) solo admite boolean.
const opciones = { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
/** One formatter per locale (es-ES · en-GB) and whether it already groups 4-digit numbers. */
const nfs = new Map<string, { nf: Intl.NumberFormat; agrupa: boolean; sep: string }>();
const fmt = (locale: string) => {
  let f = nfs.get(locale);
  if (!f) {
    const nf = new Intl.NumberFormat(locale, opciones);
    const sep = locale === 'es-ES' ? '.' : ',';
    // Motores sin NumberFormat v3 tratan 'always' como true (y no agrupan 4 cifras): ahí se agrupa a mano.
    f = { nf, agrupa: nf.format(1000) === '1' + sep + '000', sep };
    nfs.set(locale, f);
  }
  return f;
};

/** «3.000» · «128.400» (monedas, sin decimales; «3,000» en en-GB); «—» si no hay valor. */
export const monedas = (v: number | null | undefined, locale = 'es-ES'): string => {
  if (v === null || v === undefined) return '—';
  const f = fmt(locale);
  if (f.agrupa) return f.nf.format(v);
  const n = Math.round(v);
  return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, f.sep);
};
