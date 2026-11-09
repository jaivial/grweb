/**
 * porra/formato.ts — helpers de presentación de /porra y /fantasy. Las cifras de monedas (saldos, botes, importes y
 * cláusulas) llevan siempre el punto de miles, como en Figma: es-ES no agrupa los números de 4 cifras por defecto
 * («3000»), así que se fuerza `useGrouping: 'always'` («3.000»).
 */

// `useGrouping: 'always'` es de Intl.NumberFormat v3 (ES2023); el lib de TS del proyecto (ES2022) solo admite boolean.
const opciones = { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
const nfMonedas = new Intl.NumberFormat('es-ES', opciones);
/** Motores sin NumberFormat v3 tratan 'always' como true (y no agrupan 4 cifras): ahí se agrupa a mano. */
const agrupaSiempre = nfMonedas.format(1000) === '1.000';

/** «3.000» · «128.400» (monedas, sin decimales); «—» si no hay valor. */
export const monedas = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '—';
  if (agrupaSiempre) return nfMonedas.format(v);
  const n = Math.round(v);
  return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
