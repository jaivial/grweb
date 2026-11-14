import { ChangeDetectionStrategy, Component, DestroyRef, PendingTasks, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrSelect } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GrCallout, GrHechos } from './seo-bloques';

/** One IPF / AEP weight class: upper limit in kg (null = no limit) and an optional note. */
interface Clase { k: string; max: number | null; nota?: string }
const CLASES: Record<'M' | 'F', Clase[]> = {
  M: [{ k: '-53', max: 53, nota: 'Solo sub-júnior y júnior' }, { k: '-59', max: 59 }, { k: '-66', max: 66 }, { k: '-74', max: 74 }, { k: '-83', max: 83 }, { k: '-93', max: 93 }, { k: '-105', max: 105 }, { k: '-120', max: 120 }, { k: '+120', max: null }],
  F: [{ k: '-43', max: 43, nota: 'Solo sub-júnior y júnior' }, { k: '-47', max: 47 }, { k: '-52', max: 52 }, { k: '-57', max: 57 }, { k: '-63', max: 63 }, { k: '-69', max: 69 }, { k: '-76', max: 76 }, { k: '-84', max: 84 }, { k: '+84', max: null }],
};
const DIVISIONES = [
  { t: 'Sub-júnior', edad: 'Hasta 18 años', nota: 'Exento de marca mínima en AEP-1' },
  { t: 'Júnior', edad: 'Hasta 23 años', nota: 'Marca mínima JUN en AEP-1' },
  { t: 'Open', edad: 'Desde 14 años', nota: 'Absoluta, sin límite de edad', destacada: true },
  { t: 'Máster 1', edad: 'Desde 40 años', nota: 'Marca mínima M1 en AEP-1' },
  { t: 'Máster 2', edad: 'Desde 50 años', nota: 'Exento de marca mínima' },
  { t: 'Máster 3', edad: 'Desde 60 años', nota: 'Exento de marca mínima' },
  { t: 'Máster 4', edad: 'Desde 70 años', nota: 'Exento de marca mínima' },
];
type Vista = 'calculadora' | 'hombres' | 'mujeres' | 'edad' | 'pesaje';
const VISTAS: { id: Vista; t: string }[] = [
  { id: 'calculadora', t: 'Calculadora' }, { id: 'hombres', t: 'Categorías · Hombres' }, { id: 'mujeres', t: 'Categorías · Mujeres' },
  { id: 'edad', t: 'Divisiones por edad' }, { id: 'pesaje', t: 'El pesaje' },
];
const kg = (n: number, dec = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: 2 });
const nombre = (k: string) => k.replace('-', '−') + ' kg';

/** /categorias-de-peso (Figma page 21): category finder, the 18 classes, age divisions and the weigh-in. */
@Component({
  selector: 'gr-categorias-page',
  imports: [RouterLink, Page, FormsModule, GrButton, GrIcon, GrSelect, GrCabecera, GrCallout, GrHechos, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Categorías de" accent="peso y edad" eyebrow="Competición" section="Competición" crumb="Categorías de peso"
      subtitle="Las 18 categorías de peso corporal y las divisiones por edad con las que se compite en la GRS Cup 2, según la Asociación Española de Powerlifting (AEP).">
      <!-- Figma 46:15 (Jaime 14-nov): a dropdown, not sticky chips that scroll. Each option is its own view (?vista=…), so
           the page is shorter. All views are rendered (SSR / SEO, canonical without query); the inactive ones are hidden. -->
      <label class="mb-8 flex max-w-sm flex-col gap-2 md:mb-12"><span class="text-label-s text-text-secondary">Sección</span>
        <gr-select tipo="campo" [ngModel]="vista()" (ngModelChange)="irA($event)">
          @for (v of vistas; track v.id) { <option [value]="v.id">{{ v.t }}</option> }
        </gr-select>
      </label>
      <div class="flex flex-col gap-12 md:gap-20">
        <!-- 01 · Calculadora -->
        <section id="calculadora" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'calculadora'" [class.hidden]="vista() !== 'calculadora'">
          <gr-cabecera eyebrow="Herramienta" titulo="¿En qué *categoría compito?*" [centro]="false" tam="m" />
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="flex flex-col gap-4 self-start rounded-[20px] border border-accent/10 bg-bg-card p-5 md:p-7">
              <div class="grid grid-cols-2 gap-1 rounded-md border border-line-subtle p-1" role="radiogroup" aria-label="Sexo">
                @for (g of generos; track g.k) {
                  <button type="button" role="radio" [attr.aria-checked]="sexo() === g.k" (click)="sexo.set(g.k)" class="h-11 rounded-md text-label-s" [class]="sexo() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-tertiary hover:text-text-primary'">{{ g.l }}</button>
                }
              </div>
              <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">Tu peso corporal (kg)</span>
                <input inputmode="decimal" autocomplete="off" placeholder="Ej. 81,4" [ngModel]="peso()" (ngModelChange)="peso.set($event)" class="h-12 rounded-sm border border-line-strong bg-bg-field px-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" /></label>
              <div aria-live="polite">
                @if (resultado(); as r) {
                  @if (r.reservada) {
                    <p class="flex gap-3 rounded-md bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />Con {{ kgTxt(r.peso, 0) }} kg compites en {{ r.nombre }}, categoría reservada a sub-júnior y júnior. Si eres open, consulta con la organización.</p>
                  } @else {
                    <!-- the result lives in the calculator itself: no box inside the box -->
                    <div class="flex flex-col gap-1 border-t border-line-subtle pt-5">
                      <p class="text-label-xs text-text-secondary uppercase">Compites en</p>
                      <p class="text-display-s md:text-display-m">{{ sexo() === 'M' ? 'Masculino' : 'Femenino' }} {{ r.nombre }}</p>
                      <dl class="mt-2 flex flex-col">
                        @if (r.margen !== null) { <div class="flex items-baseline justify-between gap-4 border-b border-line-subtle py-3"><dt class="text-body-s text-text-secondary">Margen hasta el límite</dt><dd class="text-label-m whitespace-nowrap">{{ kgTxt(r.margen) }} kg</dd></div> }
                        @else { <div class="flex items-baseline justify-between gap-4 border-b border-line-subtle py-3"><dt class="text-body-s text-text-secondary">Límite superior</dt><dd class="text-label-m">Sin límite</dd></div> }
                        @if (r.siguiente) { <div class="flex items-baseline justify-between gap-4 py-3"><dt class="text-body-s text-text-secondary">Siguiente categoría</dt><dd class="text-label-m whitespace-nowrap">{{ r.siguiente }}</dd></div> }
                      </dl>
                    </div>
                  }
                  <a grButton variant="secondary" size="l" [block]="true" routerLink="/marcas-minimas" class="mt-4 border-0! bg-white! text-bg-base! hover:bg-white/90!">Ver marcas mínimas {{ r.nombre }}</a>
                } @else if (peso().trim()) {
                  <p class="text-body-s text-text-tertiary">Escribe un peso entre 30 y 250 kg (por ejemplo, 81,4).</p>
                } @else {
                  <p class="text-body-s text-text-tertiary">Introduce tu peso para ver tu categoría y el margen hasta la siguiente.</p>
                }
              </div>
            </div>
            <div class="flex flex-col gap-3 self-start rounded-lg border border-line-subtle bg-bg-card p-6">
              <h3 class="text-ui-h5">Cómo funciona</h3>
              <ul class="flex flex-col gap-2">
                @for (c of comoFunciona; track c) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ c }}</li> }
              </ul>
            </div>
          </div>
        </section>

        <!-- 02 · 18 categorías -->
        <section id="categorias" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'hombres' || vista() === 'mujeres'" [class.hidden]="vista() !== 'hombres' && vista() !== 'mujeres'">
          <gr-cabecera eyebrow="Categorías AEP" titulo="18 categorías de *peso corporal*" texto="9 masculinas y 9 femeninas. Los rangos indican el peso del pesaje con el que entras en cada categoría." [centro]="false" tam="m" />
          <div class="max-w-[720px]">
            @for (g of generos; track g.k) {
              <div [id]="g.id" class="flex-col gap-3" [class.flex]="tabla() === g.k" [class.hidden]="tabla() !== g.k">
                <h3 class="sr-only">{{ g.l }}</h3>
                <table class="w-full overflow-hidden rounded-lg border border-line-subtle text-left">
                  <thead class="hidden md:table-header-group"><tr class="border-b border-line-subtle text-label-xs text-text-muted uppercase"><th class="px-4 py-3 font-medium">Categoría</th><th class="px-4 py-3 font-medium">Peso en el pesaje</th><th class="px-4 py-3 font-medium">Nota</th></tr></thead>
                  <tbody>
                    @for (c of clases[g.k]; track c.k; let i = $index) {
                      <tr class="border-b border-line-subtle last:border-0" [class.bg-accent/10]="!!c.nota">
                        <th scope="row" class="px-4 py-3.5 text-left font-display text-[18px] font-normal uppercase italic">{{ nombre(c.k) }}@if (c.nota) { <span class="md:hidden">*</span> }</th>
                        <td class="px-4 py-3.5 text-right text-mono-s text-text-secondary md:text-left md:text-body-s">{{ rango(g.k, i) }}</td>
                        <td class="hidden px-4 py-3.5 text-body-xs text-text-tertiary md:table-cell">{{ c.nota || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
                <p class="text-body-xs text-text-muted md:hidden">* Solo sub-júnior y júnior.</p>
              </div>
            }
          </div>
        </section>

        <!-- 03 · Divisiones por edad -->
        <section id="edad" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'edad'" [class.hidden]="vista() !== 'edad'">
          <gr-cabecera eyebrow="Divisiones por edad" titulo="Compite con los de *tu edad*" texto="Además de la categoría de peso, cada atleta compite en su división de edad (según el calendario oficial de la AEP)." [centro]="false" tam="m" />
          <div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            @for (d of divisiones; track d.t) {
              <div class="flex flex-col gap-2 rounded-lg border bg-bg-card p-4 md:p-5" [class]="d.destacada ? 'border-accent/10' : 'border-line-subtle'">
                <p class="text-display-2xs" [class.text-accent-text]="d.destacada">{{ d.t }}</p>
                <p class="text-label-s">{{ d.edad }}</p>
                <p class="text-body-xs text-text-tertiary">{{ d.nota }}</p>
              </div>
            }
          </div>
          <gr-callout tono="dato">La división se determina por el año de nacimiento: cuenta la edad que cumples durante el año de la competición.</gr-callout>
        </section>

        <!-- 04 · El pesaje -->
        <section id="pesaje" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'pesaje'" [class.hidden]="vista() !== 'pesaje'">
          <gr-cabecera eyebrow="Pesaje" titulo="El *pesaje*" [centro]="false" tam="m" />
          <div class="grid gap-6 lg:grid-cols-2">
            <gr-hechos [items]="pesaje" />
            <gr-callout tono="consejo" class="self-start lg:self-stretch">Declara tus primeros intentos y la altura del rack en el pesaje: no podrás cambiarlos después sin prisa.</gr-callout>
          </div>
        </section>

        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class CategoriasPage {
  protected readonly clases = CLASES;
  protected readonly divisiones = DIVISIONES;
  protected readonly nombre = nombre;
  protected readonly kgTxt = kg;
  protected readonly generos = [{ k: 'M' as const, l: 'Hombres', id: 'hombres' }, { k: 'F' as const, l: 'Mujeres', id: 'mujeres' }];
  protected readonly vistas = VISTAS;
  /** ?vista= (default «calculadora»); unknown values fall back to the calculator. */
  protected readonly vista = signal<Vista>('calculadora');
  protected readonly tabla = computed<'M' | 'F'>(() => (this.vista() === 'mujeres' ? 'F' : 'M'));
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly sexo = signal<'M' | 'F'>('M');
  protected readonly peso = signal('');
  protected readonly comoFunciona = [
    'Tu categoría es la primera cuyo límite es igual o superior a tu peso en el pesaje oficial.',
    'Se compite con el peso del pesaje del día, no con el de la inscripción.',
    'Las categorías −53 kg (hombres) y −43 kg (mujeres) son solo para sub-júnior y júnior.',
  ];
  protected readonly pesaje = [
    'Empieza 2 horas antes de tu bloque y dura 1 h 30 min.',
    'Puedes volver a pesarte dentro de ese horario si no das el peso.',
    'Lleva tu licencia AEP y tu documento de identidad.',
    'En el pesaje declaras tus primeros intentos y la altura del rack.',
  ];
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Marcas mínimas', texto: 'Totales AEP-1 por categoría', ruta: '/marcas-minimas' },
    { titulo: 'Reglamento', texto: 'Intentos, jueces y equipamiento', ruta: '/reglamento' },
    { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
  ];
  /** The finder: first class whose limit is ≥ the weight; the margin up to that limit and the next class. */
  protected readonly resultado = computed(() => {
    const p = Number(this.peso().trim().replace(',', '.'));
    if (!this.peso().trim() || !Number.isFinite(p) || p < 30 || p > 250) return null;
    const l = CLASES[this.sexo()];
    const i = l.findIndex((c) => c.max === null || p <= c.max);
    const c = l[i];
    const sig = l[i + 1];
    return { peso: p, nombre: nombre(c.k), margen: c.max === null ? null : c.max - p, siguiente: sig ? nombre(sig.k) : null, reservada: !!c.nota };
  });

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    const sub = this.route.queryParamMap.subscribe((q) => {
      const v = q.get('vista');
      this.vista.set(VISTAS.some((x) => x.id === v) ? (v as Vista) : 'calculadora');
    });
    // old links with the former anchors (#hombres, #edad…) open their view
    const frag = this.route.snapshot.fragment;
    if (frag && frag !== 'calculadora' && VISTAS.some((x) => x.id === frag)) this.irA(frag);
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    void inject(PendingTasks).run(() => applySeo(cms, seo, '/categorias-de-peso', 'Categorías de peso y edad · GR Strength Cup',
      'Las 18 categorías de peso de la AEP (9 masculinas y 9 femeninas), las divisiones por edad y cómo es el pesaje. Calcula en qué categoría compites.', undefined,
      // Figma 20: ItemList schema of the 18 weight classes.
      { jsonLd: { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Categorías de peso AEP/IPF',
        itemListElement: (['M', 'F'] as const).flatMap((s) => CLASES[s].map((c) => (s === 'M' ? 'Masculino ' : 'Femenino ') + nombre(c.k)))
          .map((name, i) => ({ '@type': 'ListItem', position: i + 1, name })) } }));
  }

  /** The dropdown opens the view in the URL (no scroll); the calculator is the bare URL. */
  protected irA(v: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { vista: v === 'calculadora' ? null : v } });
  }

  /** «hasta 53,0 kg», «53,01 – 59,0 kg», «más de 120,0 kg». */
  protected rango(s: 'M' | 'F', i: number): string {
    const l = CLASES[s];
    const c = l[i];
    const prev = l[i - 1]?.max ?? null;
    if (c.max === null) return `más de ${kg(prev ?? 0)} kg`;
    if (prev === null) return `hasta ${kg(c.max)} kg`;
    return `${kg(prev + 0.01)} – ${kg(c.max)} kg`;
  }
}
