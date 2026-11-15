import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GrIcon, GrSelect } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GrCallout, GrChipsAncla } from './seo-bloques';
import { I18n } from '../core/i18n';

type Div = 'JUN' | 'ABS' | 'M1';
/** AEP-1 minimum totals (kg) per class: júnior, absoluto, máster 1 (null = not applicable). Figma 22 · AEP table in force since 2022. */
const TOTALES: Record<'M' | 'F', [string, number | null, number | null, number | null][]> = {
  M: [['-53', 350, null, null], ['-59', 390, 425, 375], ['-66', 425, 475, 415], ['-74', 455, 520, 450], ['-83', 515, 607.5, 485], ['-93', 530, 630, 515], ['-105', 550, 655, 540], ['-120', 560, 670, 565], ['+120', 565, 680, 585]],
  F: [['-43', 160, null, null], ['-47', 187.5, 220, 160], ['-52', 202.5, 245, 180], ['-57', 235, 260, 195], ['-63', 267.5, 285, 210], ['-69', 282.5, 300, 220], ['-76', 295, 315, 240], ['-84', 300, 325, 250], ['+84', 305, 335, 260]],
};
const DIVS: { k: Div; i: 1 | 2 | 3; q: string }[] = [{ k: 'JUN', i: 1, q: 'junior' }, { k: 'ABS', i: 2, q: 'absoluto' }, { k: 'M1', i: 3, q: 'master1' }];
const kg = (n: number, locale = 'es-ES') => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const T = {
  es: {
    titulo: 'Marcas mínimas', eyebrow: 'Competición', subtitulo: 'El total que necesitas acreditar para competir en los campeonatos nacionales AEP-1, por categoría de peso y división de edad.',
    stamp: 'Fuente: AEP · Marcas mínimas AEP-1, en vigor desde enero de 2022', vigencia: 'Revisar vigencia 2026',
    anclas: [{ id: 'tabla', t: 'Tabla' }, { id: 'comprobar', t: 'Comprobar' }, { id: 'normas', t: 'Normas' }, { id: 'pdf', t: 'Normativa' }],
    importante: 'Importante', importanteTxt: 'Las marcas mínimas solo se exigen para campeonatos nacionales AEP-1. En la GRS Cup (AEP-2 / AEP-3) no hace falta: es donde puedes conseguirla.',
    tablaEyebrow: 'Tabla oficial', tablaTitulo: 'Totales mínimos *por categoría*', tablaTexto: 'Total = sentadilla + press de banca + peso muerto, en kg. JUN = júnior · ABS = absoluto · M1 = máster 1.',
    sexo: 'Sexo', division: 'División', hombres: 'Hombres', mujeres: 'Mujeres', divL: { JUN: 'Júnior', ABS: 'Absoluto', M1: 'Máster 1' } as Record<Div, string>,
    soloJun: '— (solo JUN)', masculino: 'Masculino', femenino: 'Femenino', categoria: 'Categoría',
    herramienta: 'Herramienta', compTitulo: '¿Tienes *la marca?*', compH: '¿Tienes la marca mínima?', tuTotal: 'Tu total', min: (k: string) => 'Mín. ' + k + ' kg',
    escribe: 'Escribe tu mejor total oficial', conseguida: (k: string) => '¡Marca conseguida! +' + k + ' kg', faltan: (k: string) => 'Te faltan ' + k + ' kg',
    normasEyebrow: 'Normas', normasTitulo: 'Cómo se *acredita*',
    normas: [
      'Marca de total en competición oficial (AEP, EPF/IPF) de los últimos 12 meses.',
      'Júnior y máster 1: marca de su edad. El resto, ABS.',
      'Sub-júnior y máster 2–4: exentos.',
      'La AEP revisa las marcas cada año.',
    ],
    verNormativa: 'Ver normativa AEP', fuente: 'Fuente: Powerlifting Spain (AEP) · Marcas mínimas AEP-1 · powerliftingspain.es',
    dudasEyebrow: 'Dudas', dudasTitulo: 'Preguntas *frecuentes*',
    faq: [
      { q: '¿Qué pasa si no tengo la marca mínima?', a: 'Puedes competir igualmente en la GRS Cup: en un AEP-2 o AEP-3 no se exige marca. Solo la necesitas para inscribirte en un campeonato nacional AEP-1.' },
      { q: '¿Vale mi total de la GRS Cup para un AEP-1?', a: 'Sí. Un total conseguido en un AEP-2 es clasificatorio para optar a una plaza en un AEP-1 de tu división de edad o al Clasificatorio Nacional, según el calendario AEP.' },
      { q: '¿Se actualizan las marcas cada año?', a: 'Sí. La AEP las revisa cada temporada a partir de los resultados AEP-1 y publica la tabla vigente en su web. Comprueba siempre la versión oficial antes de inscribirte.' },
    ],
    relacionados: [
      { titulo: 'Categorías de peso', texto: 'Pesos y divisiones por edad', ruta: '/categorias-de-peso' },
      { titulo: 'Reglamento', texto: 'Niveles AEP-1, AEP-2 y AEP-3', ruta: '/reglamento' },
      { titulo: 'Calendario 2026', texto: 'Dónde conseguir tu marca', ruta: '/blog' },
    ] as RelatedLink[],
    seoTitulo: 'Marcas mínimas AEP-1 · GRS Cup',
    seoDesc: 'Totales mínimos AEP-1 por categoría y división (júnior, absoluto, máster 1), cómo se acreditan y comprobador de marca. En la GRS Cup no se exige marca.',
    ldNombre: 'Marcas mínimas AEP-1 2026', ldDesc: 'Totales mínimos AEP-1 por categoría de peso y división de edad.', ldCreador: 'Asociación Española de Powerlifting',
  },
  en: {
    titulo: 'Qualifying totals', eyebrow: 'Competition', subtitulo: 'The total you need to prove to compete at the AEP-1 national championships, by weight class and age division.',
    stamp: 'Source: AEP · AEP-1 qualifying totals, in force since January 2022', vigencia: 'Check 2026 validity',
    anclas: [{ id: 'tabla', t: 'Table' }, { id: 'comprobar', t: 'Check' }, { id: 'normas', t: 'Rules' }, { id: 'pdf', t: 'Regulations' }],
    importante: 'Important', importanteTxt: "Qualifying totals are only required for AEP-1 national championships. At GRS Cup (AEP-2 / AEP-3) you don't need one: it's where you can get it.",
    tablaEyebrow: 'Official table', tablaTitulo: 'Qualifying totals *by class*', tablaTexto: 'Total = squat + bench press + deadlift, in kg. JUN = junior · ABS = open · M1 = master 1.',
    sexo: 'Sex', division: 'Division', hombres: 'Men', mujeres: 'Women', divL: { JUN: 'Junior', ABS: 'Open', M1: 'Master 1' } as Record<Div, string>,
    soloJun: '— (JUN only)', masculino: 'Men', femenino: 'Women', categoria: 'Class',
    herramienta: 'Tool', compTitulo: 'Have you got *the total?*', compH: 'Have you got the qualifying total?', tuTotal: 'Your total', min: (k: string) => 'Min. ' + k + ' kg',
    escribe: 'Enter your best official total', conseguida: (k: string) => 'Total achieved! +' + k + ' kg', faltan: (k: string) => 'You need ' + k + ' kg more',
    normasEyebrow: 'Rules', normasTitulo: 'How it is *proven*',
    normas: [
      'A total set at an official competition (AEP, EPF/IPF) in the last 12 months.',
      'Juniors and master 1: the total for their age. Everyone else, ABS.',
      'Sub-juniors and masters 2–4: exempt.',
      'The AEP reviews the totals every year.',
    ],
    verNormativa: 'See AEP regulations', fuente: 'Source: Powerlifting Spain (AEP) · AEP-1 qualifying totals · powerliftingspain.es',
    dudasEyebrow: 'Questions', dudasTitulo: 'Frequently *asked questions*',
    faq: [
      { q: "What if I don't have the qualifying total?", a: "You can still compete at GRS Cup: no total is required at an AEP-2 or AEP-3. You only need it to enter an AEP-1 national championship." },
      { q: 'Does my GRS Cup total count for an AEP-1?', a: 'Yes. A total set at an AEP-2 qualifies you to apply for a place at an AEP-1 in your age division or at the National Qualifier, according to the AEP calendar.' },
      { q: 'Are the totals updated every year?', a: 'Yes. The AEP reviews them every season based on AEP-1 results and publishes the current table on its website. Always check the official version before entering.' },
    ],
    relacionados: [
      { titulo: 'Weight classes', texto: 'Weights and age divisions', ruta: '/categorias-de-peso' },
      { titulo: 'Rules', texto: 'AEP-1, AEP-2 and AEP-3 levels', ruta: '/reglamento' },
      { titulo: '2026 calendar', texto: 'Where to get your total', ruta: '/blog' },
    ] as RelatedLink[],
    seoTitulo: 'AEP-1 qualifying totals · GRS Cup',
    seoDesc: 'AEP-1 qualifying totals by class and division (junior, open, master 1), how they are proven and a total checker. No total is required at GRS Cup.',
    ldNombre: 'AEP-1 qualifying totals 2026', ldDesc: 'AEP-1 qualifying totals by weight class and age division.', ldCreador: 'Asociación Española de Powerlifting',
  },
};
const nombre = (k: string) => k.replace('-', '−') + ' kg';

/** /marcas-minimas (Figma page 22): the AEP-1 table, «¿Tienes la marca?», how it is accredited and FAQ. */
@Component({
  selector: 'gr-marcas-page',
  imports: [GrSelect, Page, FormsModule, GrIcon, GrCabecera, GrCallout, GrChipsAncla, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Figma 80:183056/80:183063: switching sex or division crossfades the list (160 ms, none with reduced motion)
  styles: `@keyframes fundido { from { opacity: 0; } } .fundido { animation: fundido 160ms ease-out; } @media (prefers-reduced-motion: reduce) { .fundido { animation: none; } }`,
  template: `
    <gr-page [title]="t().titulo" accent="AEP-1" [eyebrow]="t().eyebrow" [section]="t().eyebrow" [crumb]="t().titulo"
      [subtitle]="t().subtitulo"
      [stamp]="t().stamp">
      <p pageStamps><span class="inline-flex h-7 items-center rounded-full border border-info bg-info/12 px-3 text-label-xs text-info uppercase">{{ t().vigencia }}</span></p>
      <gr-chips-ancla [anclas]="t().anclas" />
      <div class="flex flex-col gap-12 md:gap-20">
        <gr-callout tono="importante" [titulo]="t().importante">{{ t().importanteTxt }}</gr-callout>

        <!-- 01 · Tabla -->
        <section id="tabla" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera [eyebrow]="t().tablaEyebrow" [titulo]="t().tablaTitulo" [texto]="t().tablaTexto" [centro]="false" tam="m" />
          <!-- mobile: sex tabs and one division at a time -->
          <div class="flex flex-col gap-3 md:hidden">
            <div class="grid grid-cols-2 gap-1 rounded-md border border-line-subtle p-1" role="tablist" [attr.aria-label]="t().sexo">
              @for (g of generos; track g.k) { <button type="button" role="tab" [attr.aria-selected]="sexoTabla() === g.k" (click)="elegir(g.k, divTabla())" class="h-11 rounded-md text-label-s" [class]="sexoTabla() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-tertiary'">{{ t()[g.id] }}</button> }
            </div>
            <div class="flex flex-wrap gap-2" role="radiogroup" [attr.aria-label]="t().division">
              @for (d of divs; track d.k) {
                <button type="button" role="radio" [attr.aria-checked]="divTabla() === d.k" (click)="elegir(sexoTabla(), d.k)" class="flex h-11 items-center gap-1.5 rounded-full border px-4 text-label-s" [class]="divTabla() === d.k ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary'"><gr-icon [name]="divTabla() === d.k ? 'check' : 'plus'" [size]="14" />{{ t().divL[d.k] }}</button>
              }
            </div>
            @for (k of [sexoTabla() + divTabla()]; track k) {
            <ul class="fundido rounded-lg border border-line-subtle bg-bg-card px-4">
              @for (r of totales[sexoTabla()]; track r[0]) {
                <li class="flex h-[60px] items-center justify-between border-b border-line-subtle last:border-0"><span class="font-display text-[18px] uppercase italic">{{ nombre(r[0]) }}</span>
                  <span class="text-label-m" [class.text-text-muted]="r[divIdx()] === null">{{ r[divIdx()] === null ? t().soloJun : kg(r[divIdx()]!) + ' kg' }}</span></li>
              }
            </ul>
            }
          </div>
          <div class="hidden gap-6 md:grid lg:grid-cols-2">
            @for (g of generos; track g.k) {
              <div class="flex flex-col gap-3">
                <h3 class="text-display-xs">{{ g.k === 'M' ? t().masculino : t().femenino }}</h3>
                <table class="w-full overflow-hidden rounded-lg border border-line-subtle bg-bg-card text-left">
                  <thead><tr class="border-b border-line-subtle text-label-xs text-text-muted uppercase"><th class="px-4 py-3 font-medium">{{ t().categoria }}</th>@for (d of divs; track d.k) { <th class="px-4 py-3 font-medium">{{ t().divL[d.k] }}</th> }</tr></thead>
                  <tbody>
                    @for (r of totales[g.k]; track r[0]) {
                      <tr class="border-b border-line-subtle last:border-0">
                        <th scope="row" class="px-4 py-3.5 font-display text-[18px] font-normal uppercase italic">{{ nombre(r[0]) }}</th>
                        <td class="px-4 py-3.5 text-mono-s text-text-tertiary">{{ r[1] === null ? '—' : kg(r[1]) }}</td>
                        <td class="px-4 py-3.5 text-label-m">{{ r[2] === null ? '—' : kg(r[2]) }}</td>
                        <td class="px-4 py-3.5 text-mono-s text-text-tertiary">{{ r[3] === null ? '–' : kg(r[3]) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </section>

        <!-- 02 · ¿Tienes la marca? -->
        <section id="comprobar" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera [eyebrow]="t().herramienta" [titulo]="t().compTitulo" [centro]="false" tam="m" />
          <div class="flex w-full flex-col gap-4 rounded-xl border border-line-subtle bg-bg-card p-5 lg:max-w-[588px]">
            <h3 class="text-ui-h5">{{ t().compH }}</h3>
            <div class="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <div class="flex min-w-0 flex-col gap-2"><label for="mm-cat" class="text-label-s text-text-secondary">{{ t().categoria }}</label>
                <gr-select id="mm-cat" tam="l" [ngModel]="sel()" (ngModelChange)="sel.set($event)">
                  @for (o of opciones; track o.v) { <option [value]="o.v">{{ o.l }}</option> }
                </gr-select></div>
              <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">{{ t().tuTotal }}</span>
                <input inputmode="decimal" placeholder="570" [ngModel]="total()" (ngModelChange)="total.set($event)" class="h-12 rounded-sm border border-line-strong bg-bg-field px-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" /></label>
            </div>
            @let c = check();
            <div class="flex flex-col gap-2" aria-live="polite">
              <p class="flex items-center justify-between gap-2"><span class="text-label-s" [class]="c.ok === null ? 'text-text-tertiary' : c.ok ? 'text-success' : 'text-accent-text'">{{ c.texto }}</span><span class="text-mono-s text-text-muted">{{ t().min(kg(c.min)) }}</span></p>
              <div class="h-2 overflow-hidden rounded-full bg-bg-raised"><div class="h-full rounded-full transition-[width]" [class]="c.ok ? 'bg-success' : 'bg-[linear-gradient(90deg,#c42b3e,#6e1420)]'" [style.width.%]="c.pct"></div></div>
            </div>
          </div>
        </section>

        <!-- 03 · Cómo se acredita -->
        <section id="normas" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera [eyebrow]="t().normasEyebrow" [titulo]="t().normasTitulo" [centro]="false" tam="m" />
          <ul class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
            @for (n of t().normas; track n) { <li class="flex gap-3 text-body-s text-text-secondary md:text-body-m"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ n }}</li> }
          </ul>
          <div id="pdf" class="flex scroll-mt-36 flex-col items-start gap-3">
            <!-- the AEP has no stable PDF URL: the link opens its official rules page, so it says so -->
            <a href="https://powerliftingspain.es/directrices-normativas-reglamentos/" target="_blank" rel="noopener" class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-accent-grain px-6 text-label-m text-white sm:w-auto"><gr-icon name="external-link" [size]="16" />{{ t().verNormativa }}</a>
            <p class="w-full border-t border-line-subtle pt-2 font-mono text-[12px] text-text-secondary">{{ t().fuente }}</p>
          </div>
        </section>

        <!-- 04 · Preguntas frecuentes -->
        <section id="dudas" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera [eyebrow]="t().dudasEyebrow" [titulo]="t().dudasTitulo" [centro]="false" tam="m" />
          <div class="flex max-w-[720px] flex-col gap-3">
            @for (f of t().faq; track f.q; let i = $index) {
              <div class="rounded-lg border bg-bg-card" [class]="abierta() === i ? 'border-accent/60' : 'border-line-subtle'">
                <button type="button" class="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left text-label-l" [attr.aria-expanded]="abierta() === i" (click)="abierta.set(abierta() === i ? -1 : i)">
                  {{ f.q }}<span class="flex size-7 shrink-0 items-center justify-center rounded-full" [class]="abierta() === i ? 'bg-accent/20 text-accent-text' : 'bg-white/8'"><gr-icon [name]="abierta() === i ? 'minus' : 'plus'" [size]="14" /></span>
                </button>
                @if (abierta() === i) { <p class="px-5 pb-5 text-body-s text-text-tertiary">{{ f.a }}</p> }
              </div>
            }
          </div>
        </section>

        <gr-related [items]="t().relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class MarcasPage {
  protected readonly totales = TOTALES;
  protected readonly divs = DIVS;
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly kg = (n: number) => kg(n, this.i18n.locale());
  protected readonly nombre = nombre;
  protected readonly generos = [{ k: 'M' as const, id: 'hombres' as const }, { k: 'F' as const, id: 'mujeres' as const }];
  protected readonly sexoTabla = signal<'M' | 'F'>('M');
  protected readonly divTabla = signal<Div>('ABS');
  protected readonly divIdx = computed(() => DIVS.find((d) => d.k === this.divTabla())!.i);
  protected readonly abierta = signal(1);
  /** «M −83 · ABS» options of the checker (only the combinations with a minimum). */
  protected readonly opciones = (['M', 'F'] as const).flatMap((s) => TOTALES[s].flatMap((r) => DIVS.filter((d) => r[d.i] !== null).map((d) => ({ v: `${s}|${r[0]}|${d.k}`, l: `${s} ${r[0].replace('-', '−')} · ${d.k}` }))));
  protected readonly sel = signal('M|-83|ABS');
  protected readonly total = signal('');
  protected readonly check = computed(() => {
    const [s, c, d] = this.sel().split('|') as ['M' | 'F', string, Div];
    const r = TOTALES[s].find((x) => x[0] === c)!;
    const min = r[DIVS.find((x) => x.k === d)!.i] ?? 0;
    const t = Number(this.total().trim().replace(',', '.'));
    const tx = this.t();
    if (!this.total().trim() || !Number.isFinite(t) || t <= 0) return { ok: null as boolean | null, texto: tx.escribe, min, pct: 0 };
    const dif = t - min;
    return { ok: dif >= 0, texto: dif >= 0 ? tx.conseguida(this.kg(dif)) : tx.faltan(this.kg(-dif)), min, pct: Math.min(100, (t / min) * 100) };
  });

  private readonly router = inject(Router);
  /** Tabs ↔ URL (?sexo=hombres|mujeres&tab=junior|absoluto|master1); invalid values fall back to the defaults. */
  protected elegir(s: 'M' | 'F', d: Div) {
    void this.router.navigate([], { queryParams: { sexo: s === 'F' ? 'mujeres' : 'hombres', tab: DIVS.find((x) => x.k === d)!.q },
      queryParamsHandling: 'merge', replaceUrl: true, preserveFragment: true });
  }

  constructor() {
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => {
      this.sexoTabla.set(q.get('sexo') === 'mujeres' ? 'F' : 'M');
      this.divTabla.set(DIVS.find((x) => x.q === q.get('tab'))?.k ?? 'ABS');
    });
    const cms = inject(Cms);
    const seo = inject(Seo);
    const t = this.t();
    void inject(PendingTasks).run(() => applySeo(cms, seo, '/marcas-minimas', t.seoTitulo,
      t.seoDesc, undefined,
      // Figma 20: Dataset schema (the minimum totals table).
      { jsonLd: { '@context': 'https://schema.org', '@type': 'Dataset', name: t.ldNombre,
        description: t.ldDesc, creator: { '@type': 'Organization', name: t.ldCreador } } }));
  }
}
