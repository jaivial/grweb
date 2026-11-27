/**
 * porra/ranking.ts — piezas de la porra compartidas: etiquetas de categoría y sexo, y lo que cada fan ha apostado por
 * mercado y atleta («Tu porra»).
 */
import type { Lang } from '../../core/i18n';
import type { Apuesta, Sexo } from '../../core/juegos';

/** «−63 kg» · «+84 kg» a partir de la categoría del mercado («-63», «84+»). */
export function kg(cat: string | undefined): string {
  if (!cat) return '';
  const c = cat.trim();
  if (c.endsWith('+')) return '+' + c.slice(0, -1) + ' kg';
  return c.replace(/^-/, '−') + ' kg';
}

export const sexoTxt = (s: Sexo, lang: Lang = 'es'): string => (lang === 'en' ? (s === 'F' ? 'Women' : 'Men') : s === 'F' ? 'Femenino' : 'Masculino');

/** Lo que he apostado a cada atleta en cada mercado (clave mercadoId:atletaId). */
export function misPorras(apuestas: Apuesta[]): Map<string, number> {
  const r = new Map<string, number>();
  for (const a of apuestas) {
    if (a.devuelto) continue;
    const k = a.mercadoId + ':' + a.atletaId;
    r.set(k, (r.get(k) ?? 0) + a.importe);
  }
  return r;
}
