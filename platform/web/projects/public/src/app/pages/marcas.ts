import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrIcon } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GrCallout, GrChipsAncla } from './seo-bloques';

type Div = 'JUN' | 'ABS' | 'M1';
/** AEP-1 minimum totals (kg) per class: júnior, absoluto, máster 1 (null = not applicable). Figma 22 · AEP table in force since 2022. */
const TOTALES: Record<'M' | 'F', [string, number | null, number | null, number | null][]> = {
  M: [['-53', 350, null, null], ['-59', 390, 425, 375], ['-66', 425, 475, 415], ['-74', 455, 520, 450], ['-83', 515, 607.5, 485], ['-93', 530, 630, 515], ['-105', 550, 655, 540], ['-120', 560, 670, 565], ['+120', 565, 680, 585]],
  F: [['-43', 160, null, null], ['-47', 187.5, 220, 160], ['-52', 202.5, 245, 180], ['-57', 235, 260, 195], ['-63', 267.5, 285, 210], ['-69', 282.5, 300, 220], ['-76', 295, 315, 240], ['-84', 300, 325, 250], ['+84', 305, 335, 260]],
};
const DIVS: { k: Div; l: string; i: 1 | 2 | 3 }[] = [{ k: 'JUN', l: 'Júnior', i: 1 }, { k: 'ABS', l: 'Absoluto', i: 2 }, { k: 'M1', l: 'Máster 1', i: 3 }];
const kg = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nombre = (k: string) => k.replace('-', '−') + ' kg';

/** /marcas-minimas (Figma page 22): the AEP-1 table, «¿Tienes la marca?», how it is accredited and FAQ. */
@Component({
  selector: 'gr-marcas-page',
  imports: [Page, FormsModule, GrIcon, GrCabecera, GrCallout, GrChipsAncla, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Marcas mínimas" accent="AEP-1" eyebrow="Competición" section="Competición" crumb="Marcas mínimas"
      subtitle="El total que necesitas acreditar para competir en los campeonatos nacionales AEP-1, por categoría de peso y división de edad."
      stamp="Fuente: AEP · Marcas mínimas AEP-1, en vigor desde enero de 2022">
      <p pageStamps><span class="inline-flex h-7 items-center rounded-full border border-info bg-info/12 px-3 text-label-xs text-info uppercase">Revisar vigencia 2026</span></p>
      <gr-chips-ancla [anclas]="anclas" />
      <div class="flex flex-col gap-12 md:gap-20">
        <gr-callout tono="importante" titulo="Importante">Las marcas mínimas solo se exigen para campeonatos nacionales AEP-1. En la GR Strength Cup (AEP-2 / AEP-3) no hace falta: es donde puedes conseguirla.</gr-callout>

        <!-- 01 · Tabla -->
        <section id="tabla" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera eyebrow="01 · Tabla oficial" titulo="Totales mínimos *por categoría*" texto="Total = sentadilla + press de banca + peso muerto, en kg. JUN = júnior · ABS = absoluto · M1 = máster 1." [centro]="false" tam="m" />
          <!-- mobile: sex tabs and one division at a time -->
          <div class="flex flex-col gap-3 md:hidden">
            <div class="grid grid-cols-2 gap-1 rounded-xl border border-line-subtle p-1" role="tablist" aria-label="Sexo">
              @for (g of generos; track g.k) { <button type="button" role="tab" [attr.aria-selected]="sexoTabla() === g.k" (click)="sexoTabla.set(g.k)" class="h-11 rounded-md text-label-s" [class]="sexoTabla() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-tertiary'">{{ g.l }}</button> }
            </div>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="División">
              @for (d of divs; track d.k) {
                <button type="button" role="radio" [attr.aria-checked]="divTabla() === d.k" (click)="divTabla.set(d.k)" class="flex h-11 items-center gap-1.5 rounded-full border px-4 text-label-s" [class]="divTabla() === d.k ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary'"><gr-icon [name]="divTabla() === d.k ? 'check' : 'plus'" [size]="14" />{{ d.l }}</button>
              }
            </div>
            <ul class="rounded-2xl border border-line-subtle bg-bg-card px-4">
              @for (r of totales[sexoTabla()]; track r[0]) {
                <li class="flex h-[60px] items-center justify-between border-b border-line-subtle last:border-0"><span class="font-display text-[18px] uppercase italic">{{ nombre(r[0]) }}</span>
                  <span class="text-label-m" [class.text-text-muted]="r[divIdx()] === null">{{ r[divIdx()] === null ? '— (solo JUN)' : kg(r[divIdx()]!) + ' kg' }}</span></li>
              }
            </ul>
          </div>
          <div class="hidden gap-6 md:grid lg:grid-cols-2">
            @for (g of generos; track g.k) {
              <div class="flex flex-col gap-3">
                <h3 class="text-display-xs">{{ g.k === 'M' ? 'Masculino' : 'Femenino' }}</h3>
                <table class="w-full overflow-hidden rounded-2xl border border-line-subtle bg-bg-card text-left">
                  <thead><tr class="border-b border-line-subtle text-label-xs text-text-muted uppercase"><th class="px-4 py-3 font-medium">Categoría</th>@for (d of divs; track d.k) { <th class="px-4 py-3 font-medium">{{ d.l }}</th> }</tr></thead>
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
          <gr-cabecera eyebrow="02 · Herramienta" titulo="¿Tienes *la marca?*" [centro]="false" tam="m" />
          <div class="flex w-full flex-col gap-4 rounded-2xl border border-line-subtle bg-bg-card p-5 lg:max-w-[588px]">
            <h3 class="text-ui-h5">¿Tienes la marca mínima?</h3>
            <div class="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">Categoría</span>
                <span class="relative"><select [ngModel]="sel()" (ngModelChange)="sel.set($event)" class="h-12 w-full appearance-none rounded-sm border border-line-strong bg-bg-field pr-9 pl-3 text-body-m focus:border-accent-text focus:outline-none">
                  @for (o of opciones; track o.v) { <option [value]="o.v">{{ o.l }}</option> }
                </select><gr-icon name="chevron-down" [size]="16" class="pointer-events-none absolute top-4 right-3 text-text-tertiary" /></span></label>
              <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">Tu total</span>
                <input inputmode="decimal" placeholder="570" [ngModel]="total()" (ngModelChange)="total.set($event)" class="h-12 rounded-sm border border-line-strong bg-bg-field px-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" /></label>
            </div>
            @let c = check();
            <div class="flex flex-col gap-2" aria-live="polite">
              <p class="flex items-center justify-between gap-2"><span class="text-label-s" [class]="c.ok === null ? 'text-text-tertiary' : c.ok ? 'text-success' : 'text-accent-text'">{{ c.texto }}</span><span class="text-mono-s text-text-muted">Mín. {{ kg(c.min) }} kg</span></p>
              <div class="h-2 overflow-hidden rounded-full bg-bg-raised"><div class="h-full rounded-full transition-[width]" [class]="c.ok ? 'bg-success' : 'bg-[linear-gradient(90deg,#c42b3e,#6e1420)]'" [style.width.%]="c.pct"></div></div>
            </div>
          </div>
        </section>

        <!-- 03 · Cómo se acredita -->
        <section id="normas" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera eyebrow="03 · Normas" titulo="Cómo se *acredita*" [centro]="false" tam="m" />
          <ul class="flex flex-col gap-3 rounded-2xl border border-line-subtle bg-bg-card p-6">
            @for (n of normas; track n) { <li class="flex gap-3 text-body-s text-text-secondary md:text-body-m"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ n }}</li> }
          </ul>
          <div id="pdf" class="flex scroll-mt-36 flex-col items-start gap-3 sm:flex-row sm:items-center">
            <a href="https://powerliftingspain.es/directrices-normativas-reglamentos/" target="_blank" rel="noopener" class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-accent-grain px-6 text-label-m text-white sm:w-auto">Normativa oficial (AEP)<gr-icon name="external-link" [size]="16" /></a>
            <span class="text-mono-xs text-text-muted">powerliftingspain.es · directrices, normativas y reglamentos</span>
          </div>
        </section>

        <!-- 04 · Preguntas frecuentes -->
        <section id="dudas" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
          <gr-cabecera eyebrow="04 · Dudas" titulo="Preguntas *frecuentes*" [centro]="false" tam="m" />
          <div class="flex max-w-[720px] flex-col gap-3">
            @for (f of faq; track f.q; let i = $index) {
              <div class="rounded-2xl border bg-bg-card" [class]="abierta() === i ? 'border-accent/60' : 'border-line-subtle'">
                <button type="button" class="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left text-label-l" [attr.aria-expanded]="abierta() === i" (click)="abierta.set(abierta() === i ? -1 : i)">
                  {{ f.q }}<span class="flex size-7 shrink-0 items-center justify-center rounded-full" [class]="abierta() === i ? 'bg-accent/20 text-accent-text' : 'bg-white/8'"><gr-icon [name]="abierta() === i ? 'minus' : 'plus'" [size]="14" /></span>
                </button>
                @if (abierta() === i) { <p class="px-5 pb-5 text-body-s text-text-tertiary">{{ f.a }}</p> }
              </div>
            }
          </div>
        </section>

        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class MarcasPage {
  protected readonly totales = TOTALES;
  protected readonly divs = DIVS;
  protected readonly kg = kg;
  protected readonly nombre = nombre;
  protected readonly generos = [{ k: 'M' as const, l: 'Hombres' }, { k: 'F' as const, l: 'Mujeres' }];
  protected readonly anclas = [{ id: 'tabla', t: 'Tabla' }, { id: 'comprobar', t: 'Comprobar' }, { id: 'normas', t: 'Normas' }, { id: 'pdf', t: 'Normativa' }];
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
    if (!this.total().trim() || !Number.isFinite(t) || t <= 0) return { ok: null as boolean | null, texto: 'Escribe tu mejor total oficial', min, pct: 0 };
    const dif = t - min;
    return { ok: dif >= 0, texto: dif >= 0 ? `¡Marca conseguida! +${kg(dif)} kg` : `Te faltan ${kg(-dif)} kg`, min, pct: Math.min(100, (t / min) * 100) };
  });
  protected readonly normas = [
    'La marca de total debe conseguirse en competición oficial AEP-1, AEP-2 o internacional EPF/IPF en los 12 meses previos al cierre de inscripciones (o en la misma competición del año anterior).',
    'En competición absoluta sin divisiones por edad se exige siempre la marca absoluta (ABS).',
    'Los júnior y máster 1 deben acreditar la marca de su división de edad.',
    'Los sub-júnior y los máster 2, 3 y 4 están exentos de marca mínima.',
    'La AEP revisa y ajusta las marcas cada año a partir de los resultados AEP-1.',
  ];
  protected readonly faq = [
    { q: '¿Qué pasa si no tengo la marca mínima?', a: 'Puedes competir igualmente en la GR Strength Cup: en un AEP-2 o AEP-3 no se exige marca. Solo la necesitas para inscribirte en un campeonato nacional AEP-1.' },
    { q: '¿Vale mi total de la GR Strength Cup para un AEP-1?', a: 'Sí. Un total conseguido en un AEP-2 es clasificatorio para optar a una plaza en un AEP-1 de tu división de edad o al Clasificatorio Nacional, según el calendario AEP.' },
    { q: '¿Se actualizan las marcas cada año?', a: 'Sí. La AEP las revisa cada temporada a partir de los resultados AEP-1 y publica la tabla vigente en su web. Comprueba siempre la versión oficial antes de inscribirte.' },
  ];
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Categorías de peso', texto: 'Pesos y divisiones por edad', ruta: '/categorias-de-peso' },
    { titulo: 'Reglamento', texto: 'Niveles AEP-1, AEP-2 y AEP-3', ruta: '/reglamento' },
    { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
  ];

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(() => applySeo(cms, seo, '/marcas-minimas', 'Marcas mínimas AEP-1 · GR Strength Cup',
      'Totales mínimos AEP-1 por categoría y división (júnior, absoluto, máster 1), cómo se acreditan y comprobador de marca. En la GR Strength Cup no se exige marca.'));
  }
}
