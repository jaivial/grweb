/**
 * porra/navegacion.ts — navegación de la porra en dos pasos, igual en «Hacer porra», «En vivo» y la pestaña Porra del
 * directo. Paso 1 (sin ?grupo): las cinco categorías de apuesta. Paso 2 (?grupo=X): migas con «← Categorías», sexo,
 * nivel AEP-2 / AEP-3 y, en categorías, las de peso; debajo va el contenido de cada vista (proyectado). Todo el estado
 * vive en la URL (?sexo=F|M&grupo=categoria|gl|sq|bp|dl&prueba=aep2|aep3&peso=-83); ?vista se conserva al cambiar.
 * `ruta` dice dónde viven sus enlaces: /porra o la página del directo (pestaña Porra).
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, PLATFORM_ID, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { ParamMap, RouterLink } from '@angular/router';
import { GrIcon, type GrIconName } from '@grcup/ui';
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
export const grupoDeUrl = (v: string | null): Grupo | null => ((GRUPOS as readonly string[]).includes(v ?? '') ? (v as Grupo) : null);

/** Los filtros de la porra tal como están en la URL (grupo null = paso de categorías). */
export interface FiltrosPorra {
  sexo: Sexo;
  grupo: Grupo | null;
  prueba: Prueba;
  peso: string;
}
export function filtrosPorra(p: ParamMap): FiltrosPorra {
  return { sexo: sexoDeUrl(p.get('sexo')), grupo: grupoDeUrl(p.get('grupo')), prueba: pruebaDeUrl(p.get('prueba')), peso: p.get('peso') ?? '' };
}

/** Los mercados que se ven con los filtros: en categorías, solo la de ?peso (o la primera); los demás, todos. */
export function mercadosSeleccion(ms: Mercado[], f: FiltrosPorra): Mercado[] {
  if (!f.grupo) return [];
  const l = mercadosDe(ms, f.sexo, f.grupo, f.prueba);
  if (f.grupo !== 'categoria') return l;
  const m = l.find((x) => x.categoria === f.peso) ?? l[0];
  return m ? [m] : [];
}

/** «Saldo AEP-2» (o «Balance AEP-2»): la etiqueta del saldo de un nivel. */
export const saldoNivelTxt = (prueba: Prueba, lang: Lang): string => (lang === 'en' ? 'Balance ' : 'Saldo ') + PRUEBA_TXT[prueba];

const T = {
  es: {
    sexo: 'Sexo',
    mercados: 'Mercados',
    categorias: 'Categorías',
    nivel: 'Nivel de la porra',
    pesos: 'Categorías de peso',
    femenino: 'Femenino',
    masculino: 'Masculino',
    categoria: 'Ganador categoría de peso',
    gl: 'Mejor total IPF GL',
    sq: 'Mayor sentadilla',
    bp: 'Mayor press de banca',
    dl: 'Mayor peso muerto',
    desc: {
      categoria: 'Acierta quién gana su categoría de peso.',
      gl: 'Acierta quién logra el mejor total IPF GL.',
      sq: 'Acierta quién levanta la sentadilla más pesada.',
      bp: 'Acierta quién levanta el press de banca más pesado.',
      dl: 'Acierta quién levanta el peso muerto más pesado.',
    },
  },
  en: {
    sexo: 'Sex',
    mercados: 'Markets',
    categorias: 'Categories',
    nivel: 'Pool level',
    pesos: 'Weight classes',
    femenino: 'Women',
    masculino: 'Men',
    categoria: 'Weight class winner',
    gl: 'Best IPF GL total',
    sq: 'Heaviest squat',
    bp: 'Heaviest bench press',
    dl: 'Heaviest deadlift',
    desc: {
      categoria: 'Pick who wins their weight class.',
      gl: 'Pick who scores the best IPF GL total.',
      sq: 'Pick who squats the heaviest.',
      bp: 'Pick who benches the heaviest.',
      dl: 'Pick who deadlifts the heaviest.',
    },
  },
};

const ICONOS: Record<Grupo, GrIconName> = { categoria: 'trophy', gl: 'gauge', sq: 'person-standing', bp: 'biceps-flexed', dl: 'weight' };
/** Duración de cada mitad del cambio de paso (salida y entrada). */
const PASO_MS = 150;

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

/**
 * Navegación de la porra en dos pasos. Paso 1: las cinco categorías (icono, título y una línea). Paso 2 (con ?grupo):
 * migas con «← Categorías», sexo, nivel y categorías de peso, y debajo el contenido proyectado. El cambio de paso se
 * desvanece (salida y entrada de 150 ms, sin animación con reducción de movimiento) y el foco va al título del paso
 * nuevo, o a la primera categoría al volver.
 */
@Component({
  selector: 'gr-porra-navegacion',
  imports: [RouterLink, LocPipe, GrIcon, PorraNivel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 @container' },
  template: `
    <div class="flex flex-col transition-opacity duration-150 ease-out motion-reduce:transition-none" [class.opacity-0]="saliendo()">
      @if (visible(); as g) {
        <div class="flex flex-col gap-4">
          <nav class="flex min-w-0 items-center gap-1" [attr.aria-label]="t().categorias">
            <a [routerLink]="ruta() | loc" [queryParams]="{ grupo: null, peso: null }" queryParamsHandling="merge"
              class="inline-flex min-h-11 shrink-0 items-center gap-1 pr-2 text-label-s text-text-secondary transition-colors hover:text-text-primary">
              <gr-icon name="arrow-left" [size]="18" />{{ t().categorias }}
            </a>
            <span class="text-text-tertiary" aria-hidden="true">/</span>
            <h2 #titulo tabindex="-1" class="min-w-0 truncate pl-2 text-label-m text-text-primary outline-none">{{ t()[g] }}</h2>
          </nav>

          <div class="flex rounded-pill border border-line-subtle bg-bg-surface p-1" role="group" [attr.aria-label]="t().sexo">
            @for (s of sexos(); track s.v) {
              <a [routerLink]="ruta() | loc" [queryParams]="{ sexo: s.v, peso: null }" queryParamsHandling="merge"
                class="flex h-10 flex-1 items-center justify-center rounded-pill border text-label-s transition-colors"
                [class]="sexo() === s.v ? 'border-line-strong bg-bg-raised text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'"
                [attr.aria-current]="sexo() === s.v ? 'true' : null">{{ s.l }}</a>
            }
          </div>

          <gr-porra-nivel [prueba]="prueba()" [ruta]="ruta()" />

          @if (g === 'categoria' && categorias().length) {
            <div class="flex flex-col gap-2">
              <p class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ t().pesos }}</p>
              <nav class="flex flex-wrap gap-2" [attr.aria-label]="t().pesos">
                @for (m of categorias(); track m.id) {
                  <a [routerLink]="ruta() | loc" [queryParams]="{ peso: m.categoria }" queryParamsHandling="merge"
                    class="inline-flex h-11 items-center rounded-pill border px-4 font-mono text-[13px] transition-colors"
                    [class]="m.id === activa()?.id ? 'border-accent bg-accent-deep/50 text-accent-text' : 'border-line-strong bg-bg-surface/60 text-text-secondary hover:text-text-primary'"
                    [attr.aria-current]="m.id === activa()?.id ? 'true' : null">{{ kgTxt(m.categoria) }}</a>
                }
              </nav>
            </div>
          }

          <ng-content />
        </div>
      } @else {
        <nav class="grid gap-2" [class]="dosColumnas() ? 'grid-cols-2' : 'grid-cols-1 @[28rem]:grid-cols-2 @[40rem]:grid-cols-6'" [attr.aria-label]="t().mercados">
          @for (g of grupos(); track g.v) {
            <a #tarjeta [routerLink]="ruta() | loc" [queryParams]="{ grupo: g.v, sexo: null, prueba: null, peso: null }" queryParamsHandling="merge"
              class="flex min-h-32 flex-col justify-between gap-4 rounded-md border border-line-subtle bg-bg-card p-4 transition-colors hover:border-line-strong" [class]="g.clase">
              <gr-icon [name]="g.icono" [size]="20" class="text-text-secondary" />
              <span class="flex flex-col gap-1">
                <span class="text-label-m text-text-primary">{{ g.l }}</span>
                <span class="text-body-xs text-text-tertiary">{{ g.d }}</span>
              </span>
            </a>
          }
        </nav>
      }
    </div>
  `,
})
export class PorraNavegacion {
  readonly mercados = input.required<Mercado[]>();
  readonly sexo = input<Sexo>('F');
  /** El grupo elegido; null = paso de categorías. */
  readonly grupo = input<Grupo | null>(null);
  readonly prueba = input<Prueba>('aep2');
  /** La categoría de ?peso (vacía = la primera). */
  readonly peso = input('');
  /** Dónde van los enlaces: /porra, o la página del directo para su pestaña Porra. */
  readonly ruta = input('/porra');
  /** Las categorías siempre en dos columnas (la pestaña Porra del directo es estrecha). */
  readonly dosColumnas = input(false);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly kgTxt = kg;
  private readonly injector = inject(Injector);
  private readonly reducido = isPlatformBrowser(inject(PLATFORM_ID)) && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly titulo = viewChild<ElementRef<HTMLElement>>('titulo');
  private readonly tarjetas = viewChildren<ElementRef<HTMLElement>>('tarjeta');

  /** El paso mostrado (undefined hasta el primer cambio, que no anima). */
  private readonly mostrado = signal<Grupo | null | undefined>(undefined);
  protected readonly visible = computed(() => {
    const m = this.mostrado();
    return m === undefined ? this.grupo() : m;
  });
  protected readonly saliendo = signal(false);
  private destino: Grupo | null | undefined;
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  protected readonly sexos = computed(() => [
    { v: 'F' as Sexo, l: this.t().femenino },
    { v: 'M' as Sexo, l: this.t().masculino },
  ]);
  protected readonly grupos = computed(() => GRUPOS.map((v, i) => ({ v, l: this.t()[v], d: this.t().desc[v], icono: ICONOS[v], clase: this.claseTarjeta(i) })));
  protected readonly categorias = computed(() => mercadosDe(this.mercados(), this.sexo(), 'categoria', this.prueba()));
  protected readonly activa = computed<Mercado | undefined>(() => this.categorias().find((m) => m.categoria === this.peso()) ?? this.categorias()[0]);

  constructor() {
    effect(() => {
      const g = this.grupo();
      untracked(() => this.mostrar(g));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizador));
  }

  /** Las tarjetas del paso 1: en 6 columnas, 2 + 2 + 2 y 3 + 3; en 2, la última ocupa la fila. */
  private claseTarjeta(i: number): string {
    if (this.dosColumnas()) return i === 4 ? 'col-span-2' : '';
    if (i === 4) return '@[28rem]:col-span-2 @[40rem]:col-span-3';
    return i === 3 ? '@[40rem]:col-span-3' : '@[40rem]:col-span-2';
  }

  private mostrar(g: Grupo | null): void {
    if (this.mostrado() === undefined) {
      this.mostrado.set(g);
      this.destino = g;
      return;
    }
    if (g === this.destino) return;
    this.destino = g;
    clearTimeout(this.temporizador);
    if (this.reducido) {
      this.ver(g);
      return;
    }
    this.saliendo.set(true);
    this.temporizador = setTimeout(() => this.ver(g), PASO_MS);
  }

  private ver(g: Grupo | null): void {
    this.mostrado.set(g);
    this.saliendo.set(false);
    afterNextRender(() => (g ? this.titulo() : this.tarjetas()[0])?.nativeElement.focus(), { injector: this.injector });
  }
}
