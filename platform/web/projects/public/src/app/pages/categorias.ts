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
import { I18n, LocPipe } from '../core/i18n';

/** One IPF / AEP weight class: upper limit in kg (null = no limit) and an optional note. */
interface Clase { k: string; max: number | null; nota?: string }
const CLASES: Record<'M' | 'F', Clase[]> = {
  M: [{ k: '-53', max: 53, nota: 'Solo sub-júnior y júnior' }, { k: '-59', max: 59 }, { k: '-66', max: 66 }, { k: '-74', max: 74 }, { k: '-83', max: 83 }, { k: '-93', max: 93 }, { k: '-105', max: 105 }, { k: '-120', max: 120 }, { k: '+120', max: null }],
  F: [{ k: '-43', max: 43, nota: 'Solo sub-júnior y júnior' }, { k: '-47', max: 47 }, { k: '-52', max: 52 }, { k: '-57', max: 57 }, { k: '-63', max: 63 }, { k: '-69', max: 69 }, { k: '-76', max: 76 }, { k: '-84', max: 84 }, { k: '+84', max: null }],
};
type Div = { t: string; edad: string; nota: string; destacada?: boolean };
type Vista = 'calculadora' | 'hombres' | 'mujeres' | 'edad' | 'pesaje';
const VISTAS: Vista[] = ['calculadora', 'hombres', 'mujeres', 'edad', 'pesaje'];
const kg = (n: number, dec = 1, locale = 'es-ES') => n.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: 2 });

const T = {
  es: {
    titulo: 'Categorías de', acento: 'peso y edad', eyebrow: 'Competición', crumb: 'Categorías de peso',
    subtitulo: 'Las 18 categorías de peso corporal y las divisiones por edad con las que se compite en la GRS Cup 2, según la Asociación Española de Powerlifting (AEP).',
    seccion: 'Sección', vistas: { calculadora: 'Calculadora', hombres: 'Categorías · Hombres', mujeres: 'Categorías · Mujeres', edad: 'Divisiones por edad', pesaje: 'El pesaje' } as Record<Vista, string>,
    herramienta: 'Herramienta', calcTitulo: '¿En qué *categoría compito?*', sexo: 'Sexo', hombres: 'Hombres', mujeres: 'Mujeres',
    tuPeso: 'Tu peso corporal (kg)', ej: 'Ej. 81,4',
    reservada: (p: string, c: string) => 'Con ' + p + ' kg compites en ' + c + ', categoría reservada a sub-júnior y júnior. Si eres open, consulta con la organización.',
    compitesEn: 'Compites en', masculino: 'Masculino', femenino: 'Femenino', margen: 'Margen hasta el límite', limite: 'Límite superior', sinLimite: 'Sin límite',
    siguiente: 'Siguiente categoría', verMarcas: (c: string) => 'Ver marcas mínimas ' + c,
    rango: 'Escribe un peso entre 30 y 250 kg (por ejemplo, 81,4).', introduce: 'Introduce tu peso para ver tu categoría y el margen hasta la siguiente.',
    comoFuncionaT: 'Cómo funciona',
    comoFunciona: [
      'Tu categoría es la primera cuyo límite es igual o superior a tu peso en el pesaje oficial.',
      'Se compite con el peso del pesaje del día, no con el de la inscripción.',
      'Las categorías −53 kg (hombres) y −43 kg (mujeres) son solo para sub-júnior y júnior.',
    ],
    catEyebrow: 'Categorías AEP', catTitulo: '18 categorías de *peso corporal*',
    catTexto: '9 masculinas y 9 femeninas. Los rangos indican el peso del pesaje con el que entras en cada categoría.',
    categoria: 'Categoría', pesoPesaje: 'Peso en el pesaje', nota: 'Nota', soloJun: 'Solo sub-júnior y júnior', soloJunNota: '* Solo sub-júnior y júnior.',
    edadEyebrow: 'Divisiones por edad', edadTitulo: 'Compite con los de *tu edad*',
    edadTexto: 'Además de la categoría de peso, cada atleta compite en su división de edad (según el calendario oficial de la AEP).',
    divisiones: [
      { t: 'Sub-júnior', edad: 'Hasta 18 años', nota: 'Exento de marca mínima en AEP-1' },
      { t: 'Júnior', edad: 'Hasta 23 años', nota: 'Marca mínima JUN en AEP-1' },
      { t: 'Open', edad: 'Desde 14 años', nota: 'Absoluta, sin límite de edad', destacada: true },
      { t: 'Máster 1', edad: 'Desde 40 años', nota: 'Marca mínima M1 en AEP-1' },
      { t: 'Máster 2', edad: 'Desde 50 años', nota: 'Exento de marca mínima' },
      { t: 'Máster 3', edad: 'Desde 60 años', nota: 'Exento de marca mínima' },
      { t: 'Máster 4', edad: 'Desde 70 años', nota: 'Exento de marca mínima' },
    ] as Div[],
    edadCallout: 'La división se determina por el año de nacimiento: cuenta la edad que cumples durante el año de la competición.',
    pesajeEyebrow: 'Pesaje', pesajeTitulo: 'El *pesaje*',
    pesaje: [
      'Empieza 2 horas antes de tu bloque y dura 1 h 30 min.',
      'Puedes volver a pesarte dentro de ese horario si no das el peso.',
      'Lleva tu licencia AEP y tu documento de identidad.',
      'En el pesaje declaras tus primeros intentos y la altura del rack.',
    ],
    pesajeCallout: 'Declara tus primeros intentos y la altura del rack en el pesaje: no podrás cambiarlos después sin prisa.',
    relacionados: [
      { titulo: 'Marcas mínimas', texto: 'Totales AEP-1 por categoría', ruta: '/marcas-minimas' },
      { titulo: 'Reglamento', texto: 'Intentos, jueces y equipamiento', ruta: '/reglamento' },
      { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
    ] as RelatedLink[],
    masDe: (k: string) => `más de ${k} kg`, hasta: (k: string) => `hasta ${k} kg`,
    seoTitulo: 'Categorías de peso y edad · GR Strength Cup',
    seoDesc: 'Las 18 categorías de peso de la AEP (9 masculinas y 9 femeninas), las divisiones por edad y cómo es el pesaje. Calcula en qué categoría compites.',
    ldNombre: 'Categorías de peso AEP/IPF', ldM: 'Masculino ', ldF: 'Femenino ',
  },
  en: {
    titulo: 'Weight and', acento: 'age classes', eyebrow: 'Competition', crumb: 'Weight classes',
    subtitulo: 'The 18 bodyweight classes and the age divisions used at GRS Cup 2, as set by the Spanish Powerlifting Association (AEP).',
    seccion: 'Section', vistas: { calculadora: 'Calculator', hombres: 'Classes · Men', mujeres: 'Classes · Women', edad: 'Age divisions', pesaje: 'The weigh-in' } as Record<Vista, string>,
    herramienta: 'Tool', calcTitulo: 'Which *class do I compete in?*', sexo: 'Sex', hombres: 'Men', mujeres: 'Women',
    tuPeso: 'Your bodyweight (kg)', ej: 'e.g. 81.4',
    reservada: (p: string, c: string) => 'At ' + p + ' kg you compete in ' + c + ', a class reserved for sub-juniors and juniors. If you are open, check with the organisers.',
    compitesEn: 'You compete in', masculino: 'Men', femenino: 'Women', margen: 'Margin to the limit', limite: 'Upper limit', sinLimite: 'No limit',
    siguiente: 'Next class', verMarcas: (c: string) => 'See qualifying totals ' + c,
    rango: 'Enter a weight between 30 and 250 kg (for example, 81.4).', introduce: 'Enter your weight to see your class and the margin to the next one.',
    comoFuncionaT: 'How it works',
    comoFunciona: [
      'Your class is the first one whose limit is equal to or above your weight at the official weigh-in.',
      'You compete with your weight at the weigh-in on the day, not the one on your entry.',
      'The −53 kg (men) and −43 kg (women) classes are only for sub-juniors and juniors.',
    ],
    catEyebrow: 'AEP classes', catTitulo: '18 *bodyweight* classes',
    catTexto: '9 for men and 9 for women. The ranges show the weigh-in weight that puts you in each class.',
    categoria: 'Class', pesoPesaje: 'Weigh-in weight', nota: 'Note', soloJun: 'Sub-junior and junior only', soloJunNota: '* Sub-junior and junior only.',
    edadEyebrow: 'Age divisions', edadTitulo: 'Compete against *your age group*',
    edadTexto: 'As well as the weight class, every athlete competes in their age division (according to the official AEP calendar).',
    divisiones: [
      { t: 'Sub-junior', edad: 'Up to 18', nota: 'Exempt from the AEP-1 qualifying total' },
      { t: 'Junior', edad: 'Up to 23', nota: 'JUN qualifying total for AEP-1' },
      { t: 'Open', edad: 'From 14', nota: 'Senior, no age limit', destacada: true },
      { t: 'Master 1', edad: 'From 40', nota: 'M1 qualifying total for AEP-1' },
      { t: 'Master 2', edad: 'From 50', nota: 'Exempt from the qualifying total' },
      { t: 'Master 3', edad: 'From 60', nota: 'Exempt from the qualifying total' },
      { t: 'Master 4', edad: 'From 70', nota: 'Exempt from the qualifying total' },
    ] as Div[],
    edadCallout: 'The division is set by your year of birth: what counts is the age you turn during the year of the competition.',
    pesajeEyebrow: 'Weigh-in', pesajeTitulo: 'The *weigh-in*',
    pesaje: [
      'It starts 2 hours before your session and lasts 1 h 30 min.',
      'You can weigh in again within that window if you miss the weight.',
      'Bring your AEP licence and your ID document.',
      'At the weigh-in you declare your opening attempts and your rack height.',
    ],
    pesajeCallout: "Declare your opening attempts and rack height at the weigh-in: you won't be able to change them calmly later.",
    relacionados: [
      { titulo: 'Qualifying totals', texto: 'AEP-1 totals by class', ruta: '/marcas-minimas' },
      { titulo: 'Rules', texto: 'Attempts, referees and equipment', ruta: '/reglamento' },
      { titulo: 'Schedule', texto: 'Sessions by class', ruta: '/horarios' },
    ] as RelatedLink[],
    masDe: (k: string) => `over ${k} kg`, hasta: (k: string) => `up to ${k} kg`,
    seoTitulo: 'Weight and age classes · GR Strength Cup',
    seoDesc: 'The 18 AEP weight classes (9 for men and 9 for women), the age divisions and how the weigh-in works. Find out which class you compete in.',
    ldNombre: 'AEP/IPF weight classes', ldM: 'Men ', ldF: 'Women ',
  },
};
const nombre = (k: string) => k.replace('-', '−') + ' kg';

/** /categorias-de-peso (Figma page 21): category finder, the 18 classes, age divisions and the weigh-in. */
@Component({
  selector: 'gr-categorias-page',
  imports: [RouterLink, LocPipe, Page, FormsModule, GrButton, GrIcon, GrSelect, GrCabecera, GrCallout, GrHechos, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [eyebrow]="t().eyebrow" [section]="t().eyebrow" [crumb]="t().crumb"
      [subtitle]="t().subtitulo">
      <!-- Figma 46:15 (Jaime 14-nov): a dropdown, not sticky chips that scroll. Each option is its own view (?vista=…), so
           the page is shorter. All views are rendered (SSR / SEO, canonical without query); the inactive ones are hidden. -->
      <!-- <label for>, not a wrapping label: wrapping would add the hidden <option> texts to the control's accessible name -->
      <div class="mb-8 flex max-w-sm flex-col gap-2 md:mb-12"><label for="categorias-vista" class="text-label-s text-text-secondary">{{ t().seccion }}</label>
        <gr-select id="categorias-vista" tipo="campo" [ngModel]="vista()" (ngModelChange)="irA($event)">
          @for (v of vistas; track v) { <option [value]="v">{{ t().vistas[v] }}</option> }
        </gr-select>
      </div>
      <div class="flex flex-col gap-12 md:gap-20">
        <!-- 01 · Calculadora -->
        <section id="calculadora" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'calculadora'" [class.hidden]="vista() !== 'calculadora'">
          <gr-cabecera [eyebrow]="t().herramienta" [titulo]="t().calcTitulo" [centro]="false" tam="m" />
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="flex flex-col gap-4 self-start rounded-[20px] border border-accent/10 bg-bg-card p-5 md:p-7">
              <div class="grid grid-cols-2 gap-1 rounded-md border border-line-subtle p-1" role="radiogroup" [attr.aria-label]="t().sexo">
                @for (g of generos; track g.k) {
                  <button type="button" role="radio" [attr.aria-checked]="sexo() === g.k" (click)="sexo.set(g.k)" class="h-11 rounded-md text-label-s" [class]="sexo() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-tertiary hover:text-text-primary'">{{ t()[g.id] }}</button>
                }
              </div>
              <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">{{ t().tuPeso }}</span>
                <input inputmode="decimal" autocomplete="off" [placeholder]="t().ej" [ngModel]="peso()" (ngModelChange)="peso.set($event)" class="h-12 rounded-sm border border-line-strong bg-bg-field px-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" /></label>
              <div aria-live="polite">
                @if (resultado(); as r) {
                  @if (r.reservada) {
                    <p class="flex gap-3 rounded-md bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().reservada(kgTxt(r.peso, 0), r.nombre) }}</p>
                  } @else {
                    <!-- the result lives in the calculator itself: no box inside the box -->
                    <div class="flex flex-col gap-1 border-t border-line-subtle pt-5">
                      <p class="text-label-xs text-text-secondary uppercase">{{ t().compitesEn }}</p>
                      <p class="text-display-s md:text-display-m">{{ sexo() === 'M' ? t().masculino : t().femenino }} {{ r.nombre }}</p>
                      <dl class="mt-2 flex flex-col">
                        @if (r.margen !== null) { <div class="flex items-baseline justify-between gap-4 border-b border-line-subtle py-3"><dt class="text-body-s text-text-secondary">{{ t().margen }}</dt><dd class="text-label-m whitespace-nowrap">{{ kgTxt(r.margen) }} kg</dd></div> }
                        @else { <div class="flex items-baseline justify-between gap-4 border-b border-line-subtle py-3"><dt class="text-body-s text-text-secondary">{{ t().limite }}</dt><dd class="text-label-m">{{ t().sinLimite }}</dd></div> }
                        @if (r.siguiente) { <div class="flex items-baseline justify-between gap-4 py-3"><dt class="text-body-s text-text-secondary">{{ t().siguiente }}</dt><dd class="text-label-m whitespace-nowrap">{{ r.siguiente }}</dd></div> }
                      </dl>
                    </div>
                  }
                  <a grButton variant="secondary" size="l" [block]="true" [routerLink]="'/marcas-minimas' | loc" class="mt-4 border-0! bg-white! text-bg-base! hover:bg-white/90!">{{ t().verMarcas(r.nombre) }}</a>
                } @else if (peso().trim()) {
                  <p class="text-body-s text-text-tertiary">{{ t().rango }}</p>
                } @else {
                  <p class="text-body-s text-text-tertiary">{{ t().introduce }}</p>
                }
              </div>
            </div>
            <div class="flex flex-col gap-3 self-start rounded-lg border border-line-subtle bg-bg-card p-6">
              <h3 class="text-ui-h5">{{ t().comoFuncionaT }}</h3>
              <ul class="flex flex-col gap-2">
                @for (c of t().comoFunciona; track c) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ c }}</li> }
              </ul>
            </div>
          </div>
        </section>

        <!-- 02 · 18 categorías -->
        <section id="categorias" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'hombres' || vista() === 'mujeres'" [class.hidden]="vista() !== 'hombres' && vista() !== 'mujeres'">
          <gr-cabecera [eyebrow]="t().catEyebrow" [titulo]="t().catTitulo" [texto]="t().catTexto" [centro]="false" tam="m" />
          <div class="max-w-[720px]">
            @for (g of generos; track g.k) {
              <div [id]="g.id" class="flex-col gap-3" [class.flex]="tabla() === g.k" [class.hidden]="tabla() !== g.k">
                <h3 class="sr-only">{{ t()[g.id] }}</h3>
                <table class="w-full overflow-hidden rounded-lg border border-line-subtle text-left">
                  <thead class="hidden md:table-header-group"><tr class="border-b border-line-subtle text-label-xs text-text-muted uppercase"><th class="px-4 py-3 font-medium">{{ t().categoria }}</th><th class="px-4 py-3 font-medium">{{ t().pesoPesaje }}</th><th class="px-4 py-3 font-medium">{{ t().nota }}</th></tr></thead>
                  <tbody>
                    @for (c of clases[g.k]; track c.k; let i = $index) {
                      <tr class="border-b border-line-subtle last:border-0" [class.bg-accent/10]="!!c.nota">
                        <th scope="row" class="px-4 py-3.5 text-left font-display text-[18px] font-normal uppercase italic">{{ nombre(c.k) }}@if (c.nota) { <span class="md:hidden">*</span> }</th>
                        <td class="px-4 py-3.5 text-right text-mono-s text-text-secondary md:text-left md:text-body-s">{{ rango(g.k, i) }}</td>
                        <td class="hidden px-4 py-3.5 text-body-xs text-text-tertiary md:table-cell">{{ c.nota ? t().soloJun : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
                <p class="text-body-xs text-text-muted md:hidden">{{ t().soloJunNota }}</p>
              </div>
            }
          </div>
        </section>

        <!-- 03 · Divisiones por edad -->
        <section id="edad" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'edad'" [class.hidden]="vista() !== 'edad'">
          <gr-cabecera [eyebrow]="t().edadEyebrow" [titulo]="t().edadTitulo" [texto]="t().edadTexto" [centro]="false" tam="m" />
          <div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            @for (d of t().divisiones; track d.t) {
              <div class="flex flex-col gap-2 rounded-lg border bg-bg-card p-4 md:p-5" [class]="d.destacada ? 'border-accent/10' : 'border-line-subtle'">
                <p class="text-display-2xs" [class.text-accent-text]="d.destacada">{{ d.t }}</p>
                <p class="text-label-s">{{ d.edad }}</p>
                <p class="text-body-xs text-text-tertiary">{{ d.nota }}</p>
              </div>
            }
          </div>
          <gr-callout tono="dato">{{ t().edadCallout }}</gr-callout>
        </section>

        <!-- 04 · El pesaje -->
        <section id="pesaje" class="flex-col gap-5 md:gap-7" [class.flex]="vista() === 'pesaje'" [class.hidden]="vista() !== 'pesaje'">
          <gr-cabecera [eyebrow]="t().pesajeEyebrow" [titulo]="t().pesajeTitulo" [centro]="false" tam="m" />
          <div class="grid gap-6 lg:grid-cols-2">
            <gr-hechos [items]="t().pesaje" />
            <gr-callout tono="consejo" class="self-start lg:self-stretch">{{ t().pesajeCallout }}</gr-callout>
          </div>
        </section>

        <gr-related [items]="t().relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class CategoriasPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly clases = CLASES;
  protected readonly nombre = nombre;
  protected readonly kgTxt = (n: number, dec = 1) => kg(n, dec, this.i18n.locale());
  protected readonly generos = [{ k: 'M' as const, id: 'hombres' as const }, { k: 'F' as const, id: 'mujeres' as const }];
  protected readonly vistas = VISTAS;
  /** ?vista= (default «calculadora»); unknown values fall back to the calculator. */
  protected readonly vista = signal<Vista>('calculadora');
  protected readonly tabla = computed<'M' | 'F'>(() => (this.vista() === 'mujeres' ? 'F' : 'M'));
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly sexo = signal<'M' | 'F'>('M');
  protected readonly peso = signal('');
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
      this.vista.set(VISTAS.includes(v as Vista) ? (v as Vista) : 'calculadora');
    });
    // old links with the former anchors (#hombres, #edad…) open their view
    const frag = this.route.snapshot.fragment;
    if (frag && frag !== 'calculadora' && VISTAS.includes(frag as Vista)) this.irA(frag);
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    const t = this.t();
    void inject(PendingTasks).run(() => applySeo(cms, seo, '/categorias-de-peso', t.seoTitulo,
      t.seoDesc, undefined,
      // Figma 20: ItemList schema of the 18 weight classes.
      { jsonLd: { '@context': 'https://schema.org', '@type': 'ItemList', name: t.ldNombre,
        itemListElement: (['M', 'F'] as const).flatMap((s) => CLASES[s].map((c) => (s === 'M' ? t.ldM : t.ldF) + nombre(c.k)))
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
    const loc = this.i18n.locale();
    if (c.max === null) return this.t().masDe(kg(prev ?? 0, 1, loc));
    if (prev === null) return this.t().hasta(kg(c.max, 1, loc));
    return `${kg(prev + 0.01, 1, loc)} – ${kg(c.max, 1, loc)} kg`;
  }
}
