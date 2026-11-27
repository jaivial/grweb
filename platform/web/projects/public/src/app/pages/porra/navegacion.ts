/**
 * porra/navegacion.ts — navegación de la porra (sexo → cinco mercados → nivel AEP-2 / AEP-3 → categoría de peso). Todo
 * el estado vive en la URL (?sexo=F|M&grupo=categoria|gl|sq|bp|dl&prueba=aep2|aep3&peso=-83); ?vista se conserva al
 * cambiar de filtro. `ruta` dice dónde viven sus enlaces: /porra o la página del directo (pestaña Porra).
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ParamMap, RouterLink } from '@angular/router';
import { I18n, LocPipe, type Lang } from '../../core/i18n';
import type { Mercado, Sexo } from '../../core/juegos';
import { kg } from './ranking';

export type Grupo = 'categoria' | 'gl' | 'sq' | 'bp' | 'dl';
export type Prueba = 'aep2' | 'aep3';
export const GRUPOS: readonly Grupo[] = ['categoria', 'gl', 'sq', 'bp', 'dl'];
export const PRUEBAS: readonly Prueba[] = ['aep2', 'aep3'];
export const PRUEBA_TXT: Record<Prueba, string> = { aep2: 'AEP-2', aep3: 'AEP-3' };

/** El peso de la categoría como número para ordenar («-63» → 63, «+84» → 84.5, «−120» → 120). */
export const pesoCategoria = (c: string | undefined): number => (c ? parseFloat(c.replace(/[^\d.]/g, '')) + (c.includes('+') ? 0.5 : 0) : 999);

/** Los mercados de un sexo, nivel y grupo (las categorías de menos a más peso). */
export function mercadosDe(ms: Mercado[], sexo: Sexo, grupo: Grupo, prueba: Prueba): Mercado[] {
  return ms
    .filter((m) => m.sexo === sexo && m.prueba === prueba && (grupo === 'categoria' ? m.tipo === 'categoria' : grupo === 'gl' ? m.tipo === 'gl' : m.tipo === 'movimiento' && m.movimiento === grupo))
    .sort((a, b) => pesoCategoria(a.categoria) - pesoCategoria(b.categoria));
}

export const pruebaDeUrl = (v: string | null): Prueba => (v === 'aep3' ? 'aep3' : 'aep2');
export const sexoDeUrl = (v: string | null): Sexo => (v === 'M' ? 'M' : 'F');
export const grupoDeUrl = (v: string | null): Grupo => ((GRUPOS as readonly string[]).includes(v ?? '') ? (v as Grupo) : 'categoria');

/** Los filtros de la porra tal como están en la URL. */
export interface FiltrosPorra {
  sexo: Sexo;
  grupo: Grupo;
  prueba: Prueba;
  peso: string;
}
export function filtrosPorra(p: ParamMap): FiltrosPorra {
  return { sexo: sexoDeUrl(p.get('sexo')), grupo: grupoDeUrl(p.get('grupo')), prueba: pruebaDeUrl(p.get('prueba')), peso: p.get('peso') ?? '' };
}

/** «Saldo AEP-2» (o «Balance AEP-2»): la etiqueta del saldo de un nivel. */
export const saldoNivelTxt = (prueba: Prueba, lang: Lang): string => (lang === 'en' ? 'Balance ' : 'Saldo ') + PRUEBA_TXT[prueba];

const T = {
  es: {
    sexo: 'Sexo',
    mercados: 'Mercados',
    nivel: 'Nivel de la porra',
    pesos: 'Categorías de peso',
    femenino: 'Femenino',
    masculino: 'Masculino',
    categoria: 'Ganador categoría de peso',
    gl: 'Mejor total IPF GL',
    sq: 'Mayor sentadilla',
    bp: 'Mayor press de banca',
    dl: 'Mayor peso muerto',
    nMercados: (n: number) => (n ? `${n} ${n === 1 ? 'mercado' : 'mercados'}` : 'Sin mercados todavía'),
  },
  en: {
    sexo: 'Sex',
    mercados: 'Markets',
    nivel: 'Pool level',
    pesos: 'Weight classes',
    femenino: 'Women',
    masculino: 'Men',
    categoria: 'Weight class winner',
    gl: 'Best IPF GL total',
    sq: 'Heaviest squat',
    bp: 'Heaviest bench press',
    dl: 'Heaviest deadlift',
    nMercados: (n: number) => (n ? `${n} ${n === 1 ? 'market' : 'markets'}` : 'No markets yet'),
  },
};

/** El nivel de la porra (AEP-2 / AEP-3) como pestañas tipo pill. Cada enlace conserva el resto de la URL. */
@Component({
  selector: 'gr-porra-nivel',
  imports: [RouterLink, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="t().nivel" class="flex gap-2">
      @for (p of pruebas(); track p.v) {
        <a [routerLink]="ruta() | loc" [queryParams]="{ prueba: p.v, peso: null }" queryParamsHandling="merge"
          class="inline-flex h-11 items-center rounded-pill border px-4 text-label-s transition-colors"
          [class]="prueba() === p.v ? 'border-accent bg-accent-deep/50 text-accent-text' : 'border-line-strong bg-bg-surface/60 text-text-secondary hover:text-text-primary'"
          [attr.aria-current]="prueba() === p.v ? 'true' : null">{{ p.l }}</a>
      }
    </nav>
  `,
})
export class PorraNivel {
  readonly prueba = input<Prueba>('aep2');
  readonly ruta = input('/porra');
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly pruebas = computed(() => PRUEBAS.map((v) => ({ v, l: PRUEBA_TXT[v] })));
}

/** Navegación de la porra: sexo, cinco mercados (tarjetas), nivel AEP-2 / AEP-3 y, en «Hacer porra», categorías. */
@Component({
  selector: 'gr-porra-navegacion',
  imports: [RouterLink, LocPipe, PorraNivel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 @container' },
  template: `
    <div class="flex rounded-pill border border-line-subtle bg-bg-surface p-1" role="group" [attr.aria-label]="t().sexo">
      @for (s of sexos(); track s.v) {
        <a [routerLink]="ruta() | loc" [queryParams]="{ sexo: s.v, peso: null }" queryParamsHandling="merge"
          class="flex h-10 flex-1 items-center justify-center rounded-pill border text-label-s transition-colors"
          [class]="sexo() === s.v ? 'border-line-strong bg-bg-raised text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'"
          [attr.aria-current]="sexo() === s.v ? 'true' : null">{{ s.l }}</a>
      }
    </div>

    <nav [attr.aria-label]="t().mercados" class="grid grid-cols-2 gap-2 @[28rem]:grid-cols-3 @[44rem]:grid-cols-5">
      @for (g of grupos(); track g.v) {
        <a [routerLink]="ruta() | loc" [queryParams]="{ sexo: sexo(), grupo: g.v, prueba: prueba(), peso: null }" queryParamsHandling="merge"
          class="flex min-h-24 flex-col justify-between gap-2 rounded-md border p-3 transition-colors last:col-span-2 @[44rem]:last:col-span-1"
          [class]="g.v === grupo() ? 'border-accent bg-accent-deep/40' : 'border-line-subtle bg-bg-card hover:border-line-strong'"
          [attr.aria-current]="g.v === grupo() ? 'true' : null">
          <span class="text-label-s text-text-primary">{{ g.l }}</span>
          <span class="text-body-xs" [class]="g.n ? 'text-text-tertiary' : 'text-text-muted'">{{ g.txt }}</span>
        </a>
      }
    </nav>

    <gr-porra-nivel [prueba]="prueba()" [ruta]="ruta()" />

    @if (conPesos() && grupo() === 'categoria' && categorias().length) {
      <div class="flex flex-col gap-2">
        <p class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ t().pesos }}</p>
        <nav class="flex flex-wrap gap-2" [attr.aria-label]="t().pesos">
          @for (m of categorias(); track m.id) {
            <a [routerLink]="ruta() | loc" [queryParams]="{ peso: m.categoria }" queryParamsHandling="merge"
              class="inline-flex h-11 items-center rounded-pill border px-4 font-mono text-[13px] transition-colors"
              [class]="m.categoria === peso() ? 'border-accent bg-accent-deep/50 text-accent-text' : 'border-line-strong bg-bg-surface/60 text-text-secondary hover:text-text-primary'"
              [attr.aria-current]="m.categoria === peso() ? 'true' : null">{{ kgTxt(m.categoria) }}</a>
          }
        </nav>
      </div>
    }
  `,
})
export class PorraNavegacion {
  readonly mercados = input.required<Mercado[]>();
  readonly sexo = input<Sexo>('F');
  readonly grupo = input<Grupo>('categoria');
  readonly prueba = input<Prueba>('aep2');
  /** La categoría activa (con su mercado); vacía si no hay. */
  readonly peso = input('');
  /** Muestra las categorías de peso (solo en «Hacer porra»). */
  readonly conPesos = input(false);
  /** Dónde van los enlaces: /porra, o la página del directo para su pestaña Porra. */
  readonly ruta = input('/porra');
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly kgTxt = kg;

  protected readonly sexos = computed(() => [
    { v: 'F' as Sexo, l: this.t().femenino },
    { v: 'M' as Sexo, l: this.t().masculino },
  ]);
  protected readonly grupos = computed(() =>
    GRUPOS.map((v) => {
      const n = mercadosDe(this.mercados(), this.sexo(), v, this.prueba()).length;
      return { v, l: this.t()[v], n, txt: this.t().nMercados(n) };
    }),
  );
  protected readonly categorias = computed(() => mercadosDe(this.mercados(), this.sexo(), 'categoria', this.prueba()));
}
