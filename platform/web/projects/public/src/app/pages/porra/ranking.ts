/**
 * porra/ranking.ts — ranking «En vivo» de la porra (Figma 211:163291 y vista previa del directo 171:70257): atletas
 * de un sexo ordenados por las monedas apostadas a su favor (lo que llevan en el bote de su categoría), con barra
 * proporcional y la marca «Tu porra». Al cambiar el orden las filas se recolocan con FLIP (300 ms, sin animación con
 * prefers-reduced-motion).
 */
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { I18n, type Lang } from '../../core/i18n';
import type { Apuesta, Mercado, Sexo } from '../../core/juegos';
import { monedas } from './formato';

/** Una fila del ranking: el atleta, su categoría y el total apostado a su favor. */
export interface FilaRanking {
  atletaId: string;
  nombre: string;
  sexo: Sexo;
  categoria: string;
  total: number;
  /** Lo que he apostado yo a este atleta (0 = nada). */
  mio: number;
}

/** «−63 kg» · «+84 kg» a partir de la categoría del mercado («-63», «84+»). */
export function kg(cat: string | undefined): string {
  if (!cat) return '';
  const c = cat.trim();
  if (c.endsWith('+')) return '+' + c.slice(0, -1) + ' kg';
  return c.replace(/^-/, '−') + ' kg';
}

export const sexoTxt = (s: Sexo, lang: Lang = 'es'): string => (lang === 'en' ? (s === 'F' ? 'Women' : 'Men') : s === 'F' ? 'Femenino' : 'Masculino');

const T = {
  es: { hasPuesto: (n: string) => 'Has puesto ' + n + ' monedas', tuPorra: 'Tu porra', monedas: ' monedas' },
  en: { hasPuesto: (n: string) => 'You have put ' + n + ' coins', tuPorra: 'Your pick', monedas: ' coins' },
};

/** Solo los mercados por categoría tienen un atleta por opción sin repetirse entre mercados. */
export const mercadosCategoria = (l: Mercado[]): Mercado[] => l.filter((m) => m.tipo === 'categoria');

/** Lo que he apostado a cada atleta en los mercados por categoría (clave mercadoId:atletaId). */
export function misPorras(apuestas: Apuesta[]): Map<string, number> {
  const r = new Map<string, number>();
  for (const a of apuestas) {
    if (a.devuelto) continue;
    const k = a.mercadoId + ':' + a.atletaId;
    r.set(k, (r.get(k) ?? 0) + a.importe);
  }
  return r;
}

/** El ranking total de un sexo, sin agrupar por categoría, de más a menos apostado (empate: por nombre). */
export function rankingAtletas(mercados: Mercado[], sexo: Sexo, mias: Map<string, number>): FilaRanking[] {
  const filas: FilaRanking[] = [];
  for (const m of mercadosCategoria(mercados)) {
    if (m.sexo !== sexo) continue;
    for (const o of m.opciones) {
      filas.push({ atletaId: o.atletaId, nombre: o.nombre, sexo: m.sexo, categoria: kg(m.categoria), total: o.apostado ?? 0, mio: mias.get(m.id + ':' + o.atletaId) ?? 0 });
    }
  }
  return filas.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
}

@Component({
  selector: 'gr-ranking-porra',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex flex-col">
      @for (f of filas(); track f.atletaId; let i = $index) {
        <li class="relative flex flex-col gap-2 border-b border-line-subtle py-3" [attr.data-id]="f.atletaId">
          <div class="flex items-center gap-3">
            <span class="w-5 shrink-0 font-mono text-[12px] tabular-nums" [class]="i < 3 ? 'text-text-primary' : 'text-text-tertiary'">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-label-s text-text-primary">{{ f.nombre }}</span>
              <span class="block truncate text-[11px] leading-[1.3] text-text-tertiary">{{ sexoTxt(f.sexo, i18n.lang()) }} · {{ f.categoria }}</span>
            </span>
            @if (f.mio) {
              <span class="shrink-0 rounded-pill border border-warning/50 px-2 py-0.5 text-[11px] leading-none text-warning" [attr.title]="t().hasPuesto(monedas(f.mio))">{{ t().tuPorra }}</span>
            }
            <span class="inline-flex shrink-0 items-center gap-1.5 font-mono text-[13px] font-medium text-text-primary tabular-nums">
              <span class="size-2.5 rounded-full bg-warning" aria-hidden="true"></span>{{ monedas(f.total) }}<span class="sr-only">{{ t().monedas }}</span>
            </span>
          </div>
          <span class="block h-1 overflow-hidden rounded-pill bg-white/6" aria-hidden="true">
            <span class="block h-full rounded-pill bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none" [style.width.%]="ancho(f.total)"></span>
          </span>
        </li>
      }
    </ol>
  `,
})
export class RankingPorra {
  readonly filas = input.required<FilaRanking[]>();
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly monedas = (v: number) => monedas(v, this.i18n.locale());
  protected readonly sexoTxt = sexoTxt;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Posición (top relativa a la lista) de cada fila en el último render, para el FLIP. */
  private antes = new Map<string, number>();

  constructor() {
    afterRenderEffect(() => {
      this.filas();
      const lista = this.el.nativeElement.querySelector('ol');
      if (!lista) return;
      const base = lista.getBoundingClientRect().top;
      const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const ahora = new Map<string, number>();
      for (const li of Array.from(lista.children) as HTMLElement[]) {
        const id = li.dataset['id'] ?? '';
        const top = li.getBoundingClientRect().top - base;
        ahora.set(id, top);
        const prev = this.antes.get(id);
        if (!quieto && prev !== undefined && prev !== top && typeof li.animate === 'function') {
          li.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'translateY(0)' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      }
      this.antes = ahora;
    });
  }

  protected ancho(v: number): number {
    const max = Math.max(...this.filas().map((f) => f.total), 0);
    return max ? Math.max(2, (v / max) * 100) : 0;
  }
}
