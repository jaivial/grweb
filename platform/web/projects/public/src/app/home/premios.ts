import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon, cdn, CdnPipe } from '@grcup/ui';
import type { Seccion } from '../core/cms';
import { CATEGORIAS_IPF } from '../core/atletas';
import { ANCHO, GrCabecera, GrTitulo } from './bloques';
import { MedallaFisica } from './medalla-fisica';
import { irA } from './secciones';
import { I18n, LocPipe } from '../core/i18n';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);

const T = {
  es: {
    premios: 'Premios', irA: (n: number) => 'Ir a premio ' + n, catEyebrow: 'Categorías de peso', catTitulo: 'Premio por|*categoría de peso*',
    catTexto: 'El podio de cada categoría se lleva su medalla: oro, plata y bronce para los tres mejores totales.', sexo: 'Sexo', categorias: (n: number) => n + ' categorías',
    marcasTitulo: 'Consulta las marcas mínimas', marcasTexto: 'Para clasificar para otras competiciones AEP (PDF oficial).', verMarcas: 'Ver marcas mínimas',
    absEyebrow: 'Clasificación absoluta', absTitulo: 'Ganadores absolutos|*GL Points*', absTexto: 'Mejor atleta masculino y mejor atleta femenina por puntos GL.',
    absolutos: [
      { titulo: 'Ganador Absoluto - GL points', label: 'Masculino', alt: 'Trofeo del ganador absoluto masculino' },
      { titulo: 'Ganadora Absoluta - GL points', label: 'Femenino', alt: 'Trofeo de la ganadora absoluta femenina' },
    ],
    generos: [{ k: 'M' as const, l: 'Hombres' }, { k: 'F' as const, l: 'Mujeres' }] as { k: 'M' | 'F'; l: string }[],
  },
  en: {
    premios: 'Prizes', irA: (n: number) => 'Go to prize ' + n, catEyebrow: 'Weight classes', catTitulo: 'A prize for each|*weight class*',
    catTexto: 'The podium of each weight class takes its medal: gold, silver and bronze for the three best totals.', sexo: 'Sex', categorias: (n: number) => n + ' weight classes',
    marcasTitulo: 'Check the qualifying totals', marcasTexto: 'To qualify for other AEP competitions (official PDF).', verMarcas: 'See qualifying totals',
    absEyebrow: 'Overall standings', absTitulo: 'Overall winners|*GL Points*', absTexto: 'Best male lifter and best female lifter by GL points.',
    absolutos: [
      { titulo: 'Overall winner - GL points', label: 'Men', alt: 'Trophy of the overall men’s winner' },
      { titulo: 'Overall winner - GL points', label: 'Women', alt: 'Trophy of the overall women’s winner' },
    ],
    generos: [{ k: 'M' as const, l: 'Men' }, { k: 'F' as const, l: 'Women' }] as { k: 'M' | 'F'; l: string }[],
  },
};

/**
 * «Section / Premios v2» (Figma 80 · Home · Premios 3D, physics of page 79; in 05 Home 204:124862 · 125008 · 125132).
 * A · gold medals hanging over the three lift cards; B · podium medals (silver, gold, bronze) and the weight classes;
 * C · the two absolute GL Points trophies (3D model, lazy). The medals are the Figma renders with the pendulum physics
 * of page 79 (MedallaFisica; CSS sway as the no-JS fallback); the trophy keeps its static render until three.js is
 * loaded near the viewport. Below lg (tablet and phone) A and B are the 350 px column of Figma: carousel and tabs.
 */
@Component({
  selector: 'gr-sec-premios',
  imports: [CdnPipe, RouterLink, LocPipe, GrButton, GrIcon, GrCabecera, GrTitulo, MedallaFisica],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block overflow-hidden bg-bg-base px-5 pb-18 md:px-8 md:pb-24 xl:px-20 xl:pb-32' },
  styles: `
    .colgante { transform-origin: 50% 0; animation: vaiven var(--t, 6s) ease-in-out infinite alternate; animation-delay: var(--d, 0s); }
    @keyframes vaiven { from { transform: rotate(-1.4deg); } to { transform: rotate(1.4deg); } }
    @media (prefers-reduced-motion: reduce) { .colgante { animation: none; } }
  `,
  template: `
    <!-- Glow accent behind the medals and top fade (the ribbons come out of the dark) -->
    <div class="pointer-events-none absolute top-10 left-1/2 size-[640px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(196_43_62/0.2),transparent)] lg:top-[120px]" aria-hidden="true"></div>

    <!-- A · hanging gold medals (z over the cards) -->
    <div class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-center lg:space-x-[140px]" aria-hidden="true">
      @for (m of colgantesA; track m.src) {
        <!-- Desktop: the three medals; phone/tablet: only the central one here (the long side ones live next to the slider, below) -->
        <img grMedalla [amp]="m.amp" [periodo]="m.per" [fase]="m.fase" [src]="m.src" alt="" width="300" [attr.height]="m.h" class="colgante h-auto w-[150px] lg:w-[300px]" [class.max-lg:hidden]="m.h > 500" [style.--t]="m.t" [style.--d]="m.d" loading="lazy" decoding="async" />
      }
    </div>
    <div class="pointer-events-none absolute inset-x-0 top-0 z-30 h-28 bg-[linear-gradient(180deg,#141112_0%,#141112_40%,rgb(20_17_18/0.55)_72%,transparent)] lg:h-[180px]" aria-hidden="true"></div>

    <div [class]="ancho + ' flex flex-col items-center pt-[220px] lg:pt-[420px]'">
      <div class="flex w-full flex-col items-center gap-7 lg:gap-12">
        @if (t('eyebrow')) { <p class="sr-only">{{ t('eyebrow') }}</p> }
        <gr-cabecera class="relative z-[25] max-w-[350px] lg:max-w-[720px] max-lg:[&_h2]:text-display-s max-lg:[&_p]:text-body-m" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
        <div class="relative w-full">
        <!-- Jaime 11:13 (Figma 204:125152): phone/tablet side medals. Outside the scrolling track (they never move with it), above the cards and
             below the title (z 20 < title 25); their discs hang 25 % (90 px) over the first cards whatever the title height; the ribbons run up
             to the top of the section, where the fade hides where they start, level with the central one. -->
        <div class="pointer-events-none absolute inset-x-0 bottom-[calc(100%-90px)] z-20 flex items-end justify-center -space-x-[41px] lg:hidden" aria-hidden="true">
          @for (m of colgantesLado; track $index) {
            @if ($index === 1) { <span class="block w-[150px] shrink-0"></span> }
            <img grMedalla [amp]="m.amp" [periodo]="m.per" [fase]="m.fase" [src]="m.src" alt="" width="300" [attr.height]="m.h" class="colgante h-auto w-[150px] shrink-0" [style.--t]="m.t" [style.--d]="m.d" loading="lazy" decoding="async" />
          }
        </div>
        <ul #pista class="relative z-10 -mx-5 flex w-[calc(100%+40px)] snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:-mx-8 md:w-[calc(100%+64px)] md:scroll-px-[calc(50vw-175px)] md:px-[calc(50vw-175px)] lg:mx-0 lg:w-full lg:justify-center lg:gap-10 lg:overflow-visible lg:px-0" (scroll)="alDesplazar($event)">
          @for (p of items(); track p.titulo; let i = $index) {
            <li class="relative w-[300px] shrink-0 snap-start lg:flex lg:h-[480px] lg:w-[340px] lg:items-center lg:justify-center">
              <div class="relative aspect-[300/360] w-full overflow-hidden rounded-lg border shadow-card lg:aspect-[300/420] lg:w-[300px]"
                [class]="(i === 1 ? 'border-accent shadow-glow-deep' : 'border-white/8') + ' ' + giro[i % 3]">
                <img [src]="p.imagen | cdn" [alt]="p.titulo" class="absolute inset-0 size-full object-cover" loading="lazy" />
                <div class="absolute inset-0 flex flex-col justify-end gap-2 bg-[linear-gradient(180deg,transparent_55%,rgb(14_12_13/0.92))] p-5">
                  <span class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)]">{{ p.titulo }}</span>
                </div>
              </div>
            </li>
          }
        </ul>
        </div>
        <div class="flex items-center lg:hidden" role="group" [attr.aria-label]="tr().premios">
          @for (p of items(); track p.titulo; let i = $index) { <button type="button" class="relative flex size-6 items-center justify-center before:absolute before:-inset-2.5 before:content-['']" [attr.aria-label]="tr().irA(i + 1)" [attr.aria-current]="i === activa() || null" (click)="irA(pista, i)"><span class="h-1.5 rounded-pill transition-all motion-reduce:transition-none" [class]="i === activa() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span></button> }
        </div>
        @if (t('lema')) { <p class="max-w-[350px] text-center font-display text-[20px] leading-[27px] tracking-[0.02em] text-[#d1d5db] uppercase lg:max-w-none lg:text-[24px] lg:leading-[30px]"><gr-titulo [titulo]="t('lema')" /></p> }
      </div>

      <!-- B · podium medals per weight class -->
      <div class="mt-20 flex w-full flex-col items-center lg:mt-[120px]">
        <!-- Figma home R2: title and text first, then the podium medals and the weight classes (eyebrow only for SEO) -->
        <p class="sr-only">{{ t('catEyebrow') || tr().catEyebrow }}</p>
        <gr-cabecera class="relative z-[25] max-w-[350px] lg:max-w-[720px] max-lg:[&_h2]:text-display-s max-lg:[&_p]:text-body-m" [titulo]="t('catTitulo') || tr().catTitulo"
          [texto]="t('catTexto') || tr().catTexto" />
        <div class="relative mt-8 h-[334px] w-full max-w-[350px] lg:h-[700px] lg:max-w-none" aria-hidden="true">
          <div class="absolute top-4 left-1/2 flex h-[660px] w-max origin-top -translate-x-1/2 scale-50 items-start justify-center gap-[13px] lg:top-10 lg:scale-100 lg:gap-[67px]">
            @for (m of podio; track m.src) {
              <img grMedalla [amp]="m.amp" [periodo]="m.per" [fase]="m.fase" [src]="m.src" alt="" [attr.width]="m.w" [attr.height]="m.h" class="colgante h-auto" [style.width.px]="m.w" [style.--t]="m.t" [style.--d]="m.d" loading="lazy" decoding="async" />
            }
          </div>
          <div class="pointer-events-none absolute inset-x-[-50vw] -top-3 h-[120px] bg-[linear-gradient(180deg,#141112,transparent)] lg:h-[200px]"></div>
        </div>
        <div class="relative z-10 mt-4 flex w-full max-w-[350px] flex-col items-center gap-5 lg:mt-0 lg:max-w-none lg:gap-10">
          <!-- UX1-R1-11: the weight-class grid shows once on the home (in «Categorías» when that section is on) -->
          @if (!sinCategorias()) {
          <div class="grid w-full grid-cols-2 gap-1 rounded-md border border-line-subtle p-1 lg:hidden" role="tablist" [attr.aria-label]="tr().sexo">
            @for (g of tr().generos; track g.k) {
              <button type="button" role="tab" [attr.aria-selected]="sel() === g.k" (click)="sel.set(g.k)" class="h-11 rounded-sm text-label-m" [class]="sel() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-secondary'">{{ g.l }}</button>
            }
          </div>
          <div class="flex w-full flex-col justify-center gap-6 lg:flex-row">
            @for (g of tr().generos; track g.k) {
              <div class="w-full flex-col gap-4 rounded-[20px] border border-[#2e2729] bg-[#221d1f]/85 px-4 py-5 lg:flex lg:w-[400px] lg:flex-none lg:p-7" [class.flex]="sel() === g.k" [class.hidden]="sel() !== g.k" role="tabpanel">
                <div class="hidden items-center justify-between lg:flex"><span class="text-display-xs">{{ g.l }}</span><span class="text-label-xs text-text-muted uppercase">{{ tr().categorias(cats[g.k].length) }}</span></div>
                <ul class="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  @for (c of cats[g.k]; track c; let last = $last) { <li class="flex h-[53px] items-center justify-center rounded-sm border border-[#2e2729] bg-bg-card text-display-body uppercase" [class]="last && cats[g.k].length % 2 ? 'col-span-2 mx-auto w-[calc(50%-4px)] lg:col-span-1 lg:mx-0 lg:w-auto' : ''">{{ kg(c) }}</li> }
                </ul>
              </div>
            }
          </div>
          }
          <div class="flex w-full max-w-[824px] flex-col items-center gap-3 rounded-lg border border-accent/60 bg-accent/6 p-5 text-center md:flex-row md:gap-6 md:px-7 md:text-left">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/14 text-accent-text"><gr-icon name="trophy" [size]="20" /></span>
            <span class="flex flex-1 flex-col gap-1"><span class="text-label-m">{{ tr().marcasTitulo }}</span><span class="text-body-s text-text-tertiary">{{ tr().marcasTexto }}</span></span>
            <a grButton variant="glass" [routerLink]="'/marcas-minimas' | loc" iconRight="arrow-right" class="w-full md:w-auto">{{ tr().verMarcas }}</a>
          </div>
        </div>
      </div>

      <!-- C · absolute winners (GL Points) -->
      <div class="mt-20 flex w-full flex-col items-center gap-7 lg:mt-[120px] lg:gap-10">
        <gr-cabecera class="max-lg:[&_h2]:text-display-s max-lg:[&_p]:text-body-m" [eyebrow]="t('absEyebrow') || tr().absEyebrow" [titulo]="t('absTitulo') || tr().absTitulo"
          [texto]="t('absTexto') || tr().absTexto" />
        <ul class="grid w-full grid-cols-2 gap-3 md:gap-6">
          @for (a of tr().absolutos; track a.label; let i = $index) {
            <li class="flex flex-col overflow-hidden rounded-[24px] border md:rounded-[32px] border-[#d4af37]/35 bg-[#221d1f] bg-[radial-gradient(70%_60%_at_50%_45%,rgb(212_175_55/0.22),transparent)]">
              <!-- both start facing the camera (Figma); a small offset so they do not turn in lockstep -->
              <!-- Figma home R2: the trophy image (no 3D render) -->
              <img [src]="'/img/home/trofeo-gl.webp' | cdn" [alt]="a.alt" class="mx-auto mt-4 h-[130px] w-full object-contain md:h-[300px] lg:mt-10 lg:h-[400px]" loading="lazy" decoding="async" />
              <div class="flex flex-col gap-1 p-3 text-center md:gap-2 md:p-6 lg:p-10">
                <span class="text-body-xs text-[#d4af37] md:text-body-l">{{ a.titulo }}</span>
                <span class="font-display text-[22px] leading-[28px] tracking-[0.06em] uppercase md:text-[48px] md:leading-[53px]">{{ a.label }}</span>
              </div>
            </li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class SecPremios {
  protected readonly tr = inject(I18n).dict(T);
  readonly s = input<Seccion | undefined>();
  readonly sinCategorias = input(false);
  protected readonly ancho = ANCHO;
  /** Figma: −4° · 0 · +4° (with their vertical offsets inside the 340 × 480 holders). */
  protected readonly giro = ['lg:-rotate-4 lg:-translate-y-2.5', 'lg:translate-y-0', 'lg:rotate-4 lg:translate-y-2.5'];
  protected readonly colgantesA = [
    { src: cdn('/img/home/medalla-oro-larga.webp'), h: 784, t: '6.2s', d: '-1s', amp: 4.5, per: 3.2, fase: 0.33 },
    { src: cdn('/img/home/medalla-oro-corta.webp'), h: 429, t: '5.4s', d: '-3s', amp: 3.5, per: 3.6, fase: 0 },
    { src: cdn('/img/home/medalla-oro-larga.webp'), h: 784, t: '6.8s', d: '-2s', amp: 5, per: 3, fase: 0.66 },
  ];
  /** Phone/tablet: the two long side medals of block A (their own layer next to the slider). */
  protected readonly colgantesLado = this.colgantesA.filter((m) => m.h > 500);
  /** B: silver 228 · gold 218 · bronze 228 (Figma 204:124907); swing, period and phase of page 79's table. */
  protected readonly podio = [
    { src: cdn('/img/home/medalla-plata.webp'), w: 228, h: 617, t: '5.8s', d: '-2s', amp: 4.5, per: 3.2, fase: 0.33 },
    { src: cdn('/img/home/medalla-oro-cat.webp'), w: 218, h: 665, t: '6.4s', d: '-4s', amp: 3.5, per: 3.6, fase: 0 },
    { src: cdn('/img/home/medalla-bronce.webp'), w: 228, h: 597, t: '6s', d: '-1s', amp: 5, per: 3, fase: 0.66 },
  ];
  protected readonly cats = CATEGORIAS_IPF;
  protected readonly sel = signal<'M' | 'F'>('M');
  protected readonly activa = signal(0);
  protected t = (k: string) => str(this.s(), k);
  protected kg = (c: string) => c.replace('-', '−') + 'kg';
  protected readonly items = computed(() => list<{ titulo: string; imagen: string }>(this.s(), 'items'));
  protected readonly irA = irA;
  protected alDesplazar(e: Event): void {
    const el = e.target as HTMLElement;
    this.activa.set(Math.round(el.scrollLeft / 312));
  }
}

