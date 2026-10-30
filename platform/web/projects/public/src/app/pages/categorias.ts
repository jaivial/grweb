import { ChangeDetectionStrategy, Component, DestroyRef, PendingTasks, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GrIcon } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GrCallout, GrChipsAncla, GrHechos } from './seo-bloques';

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
const kg = (n: number, dec = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: 2 });
const nombre = (k: string) => k.replace('-', '−') + ' kg';

/** /categorias-de-peso (Figma page 21): category finder, the 18 classes, age divisions and the weigh-in. */
@Component({
  selector: 'gr-categorias-page',
  imports: [Page, FormsModule, GrIcon, GrCabecera, GrCallout, GrHechos, GrChipsAncla, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Categorías de" accent="peso y edad" eyebrow="Competición" section="Competición" crumb="Categorías de peso"
      subtitle="Las 18 categorías de peso corporal y las divisiones por edad con las que se compite en la GR Strength Cup, según la Asociación Española de Powerlifting (AEP)."
      stamp="Fuente: AEP / IPF · categorías vigentes de la IPF">
      <gr-chips-ancla [anclas]="anclas" />
      <div class="flex flex-col gap-12 md:gap-20">
        <!-- 01 · Calculadora -->
        <section id="calculadora" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera eyebrow="01 · Herramienta" titulo="¿En qué *categoría compito?*" [centro]="false" tam="m" />
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="flex flex-col gap-4 rounded-[20px] border border-accent bg-bg-card p-5 md:p-7">
              <div class="flex items-center gap-2">
                <span class="flex size-9 items-center justify-center rounded-sm bg-accent/14 text-accent-text"><gr-icon name="scale" [size]="18" /></span>
                <h3 class="text-ui-h5 md:text-ui-h4">¿En qué categoría compito?</h3>
              </div>
              <div class="grid grid-cols-2 gap-1 rounded-xl border border-line-subtle p-1" role="radiogroup" aria-label="Sexo">
                @for (g of generos; track g.k) {
                  <button type="button" role="radio" [attr.aria-checked]="sexo() === g.k" (click)="sexo.set(g.k)" class="h-11 rounded-md text-label-s" [class]="sexo() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-tertiary hover:text-text-primary'">{{ g.l }}</button>
                }
              </div>
              <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">Tu peso corporal (kg)</span>
                <input inputmode="decimal" autocomplete="off" placeholder="Ej. 81,4" [ngModel]="peso()" (ngModelChange)="peso.set($event)" class="h-12 rounded-sm border border-line-strong bg-bg-field px-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" /></label>
              <div aria-live="polite">
                @if (resultado(); as r) {
                  @if (r.reservada) {
                    <p class="flex gap-3 rounded-2xl bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />Con {{ kgTxt(r.peso, 0) }} kg compites en {{ r.nombre }}, categoría reservada a sub-júnior y júnior. Si eres open, consulta con la organización.</p>
                  } @else {
                    <div class="flex flex-col gap-2 rounded-2xl bg-[linear-gradient(135deg,#4c111b,#280d12_60%,#1b1112)] px-4 py-5">
                      <p class="text-label-xs text-text-secondary uppercase">Compites en</p>
                      <p class="text-display-s md:text-display-l">{{ sexo() === 'M' ? 'Masculino' : 'Femenino' }} {{ r.nombre }}</p>
                      <p class="text-body-s text-text-secondary">{{ r.margen }}</p>
                    </div>
                  }
                  <a href="/marcas-minimas" class="text-label-s text-accent-text hover:underline">Ver marcas mínimas {{ r.nombre }} →</a>
                } @else if (peso().trim()) {
                  <p class="text-body-s text-text-tertiary">Escribe un peso entre 30 y 250 kg (por ejemplo, 81,4).</p>
                } @else {
                  <p class="text-body-s text-text-tertiary">Introduce tu peso para ver tu categoría y el margen hasta la siguiente.</p>
                }
              </div>
            </div>
            <div class="flex flex-col gap-3 self-start rounded-2xl border border-line-subtle bg-bg-card p-6">
              <h3 class="text-ui-h5">Cómo funciona</h3>
              <ul class="flex flex-col gap-2">
                @for (c of comoFunciona; track c) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ c }}</li> }
              </ul>
            </div>
          </div>
        </section>

        <!-- 02 · 18 categorías -->
        <section id="categorias" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera eyebrow="02 · Categorías AEP" titulo="18 categorías de *peso corporal*" texto="9 masculinas y 9 femeninas. Los rangos indican el peso del pesaje con el que entras en cada categoría." [centro]="false" tam="m" />
          <div class="grid grid-cols-2 gap-1 rounded-xl border border-line-subtle p-1 md:hidden" role="tablist" aria-label="Sexo">
            @for (g of generos; track g.k) {
              <button type="button" role="tab" [attr.aria-selected]="tabla() === g.k" (click)="tabla.set(g.k)" class="h-11 rounded-md text-label-s" [class]="tabla() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-tertiary'">{{ g.l }}</button>
            }
          </div>
          <div class="grid gap-6 lg:grid-cols-2">
            @for (g of generos; track g.k) {
              <div [id]="g.id" class="scroll-mt-36 flex-col gap-3 md:flex" [class.flex]="tabla() === g.k" [class.hidden]="tabla() !== g.k">
                <h3 class="hidden text-display-xs md:block">{{ g.l }}</h3>
                <table class="w-full overflow-hidden rounded-2xl border border-line-subtle text-left">
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
        <section id="edad" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera eyebrow="03 · Divisiones por edad" titulo="Compite con los de *tu edad*" texto="Además de la categoría de peso, cada atleta compite en su división de edad (según el calendario oficial de la AEP)." [centro]="false" tam="m" />
          <div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            @for (d of divisiones; track d.t) {
              <div class="flex flex-col gap-2 rounded-2xl border bg-bg-card p-4 md:p-5" [class]="d.destacada ? 'border-accent' : 'border-line-subtle'">
                <p class="text-display-2xs" [class.text-accent-text]="d.destacada">{{ d.t }}</p>
                <p class="text-label-s">{{ d.edad }}</p>
                <p class="text-body-xs text-text-tertiary">{{ d.nota }}</p>
              </div>
            }
          </div>
          <gr-callout tono="dato">La división se determina por el año de nacimiento: cuenta la edad que cumples durante el año de la competición.</gr-callout>
        </section>

        <!-- 04 · El pesaje -->
        <section id="pesaje" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera eyebrow="04 · Pesaje" titulo="El *pesaje*" [centro]="false" tam="m" />
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
  protected readonly anclas = [{ id: 'calculadora', t: 'Calculadora' }, { id: 'hombres', t: 'Hombres' }, { id: 'mujeres', t: 'Mujeres' }, { id: 'edad', t: 'Edad' }, { id: 'pesaje', t: 'Pesaje' }];
  protected readonly sexo = signal<'M' | 'F'>('M');
  protected readonly tabla = signal<'M' | 'F'>('M');
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
    const margen = c.max === null ? 'Categoría sin límite superior' : `Margen: ${kg(c.max - p)} kg hasta el límite${sig ? ' · siguiente categoría ' + nombre(sig.k) : ''}`;
    return { peso: p, nombre: nombre(c.k), margen, reservada: !!c.nota };
  });

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    // the «Hombres» / «Mujeres» chips (mobile) open their table
    const sub = inject(ActivatedRoute).fragment.subscribe((f) => { if (f === 'hombres') this.tabla.set('M'); else if (f === 'mujeres') this.tabla.set('F'); });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    void inject(PendingTasks).run(() => applySeo(cms, seo, '/categorias-de-peso', 'Categorías de peso y edad · GR Strength Cup',
      'Las 18 categorías de peso de la AEP (9 masculinas y 9 femeninas), las divisiones por edad y cómo es el pesaje. Calcula en qué categoría compites.'));
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
