import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { Seccion } from '../core/cms';
import { CATEGORIAS_IPF } from '../core/atletas';
import { ANCHO, GrCabecera, GrTitulo } from './bloques';
import { MedallaFisica } from './medalla-fisica';
import { Trofeo3d } from './trofeo-3d';
import { irA } from './secciones';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);

/**
 * «Section / Premios v2» (Figma 80 · Home · Premios 3D, physics of page 79; in 05 Home 204:124862 · 125008 · 125132).
 * A · gold medals hanging over the three lift cards; B · podium medals (silver, gold, bronze) and the weight classes;
 * C · the two absolute GL Points trophies (3D model, lazy). The medals are the Figma renders with the pendulum physics
 * of page 79 (MedallaFisica; CSS sway as the no-JS fallback); the trophy keeps its static render until three.js is
 * loaded near the viewport. Below lg (tablet and phone) A and B are the 350 px column of Figma: carousel and tabs.
 */
@Component({
  selector: 'gr-sec-premios',
  imports: [GrCabecera, GrTitulo, Trofeo3d, MedallaFisica],
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
        <!-- tablet/phone: the long ribbons are 474 px in Figma (the render is 392 at 150 px): push them down so the discs hang over the cards -->
        <img grMedalla [amp]="m.amp" [periodo]="m.per" [fase]="m.fase" [src]="m.src" alt="" width="300" [attr.height]="m.h" class="colgante h-auto w-[150px] lg:w-[300px]" [class.max-lg:hidden]="m.h > 500" [style.--t]="m.t" [style.--d]="m.d" loading="lazy" decoding="async" />
      }
    </div>
    <div class="pointer-events-none absolute inset-x-0 top-0 z-30 h-28 bg-[linear-gradient(180deg,#141112_0%,#141112_40%,rgb(20_17_18/0.55)_72%,transparent)] lg:h-[180px]" aria-hidden="true"></div>

    <div [class]="ancho + ' flex flex-col items-center pt-[220px] lg:pt-[420px]'">
      <div class="flex w-full flex-col items-center gap-7 lg:gap-12">
        <gr-cabecera class="relative z-10 max-w-[350px] lg:max-w-[720px] max-lg:[&_h2]:text-display-s max-lg:[&_p]:text-body-m" [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
        <ul #pista class="relative z-10 -mx-5 flex w-[calc(100%+40px)] snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:-mx-8 md:w-[calc(100%+64px)] md:scroll-px-[calc(50vw-175px)] md:px-[calc(50vw-175px)] lg:mx-0 lg:w-full lg:justify-center lg:gap-10 lg:overflow-visible lg:px-0" (scroll)="alDesplazar($event)">
          @for (p of items(); track p.titulo; let i = $index) {
            <li class="relative w-[300px] shrink-0 snap-start max-lg:pt-[100px] lg:flex lg:h-[480px] lg:w-[340px] lg:items-center lg:justify-center">
              @if (i < 2) {
                <!-- tablet/phone (Figma): the side medals hang from the first two cards, below the title -->
                <div class="pointer-events-none absolute top-0 left-1/2 z-10 h-[160px] w-[120px] -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(transparent,#000_35%)] lg:hidden" aria-hidden="true">
                  <img grMedalla [amp]="colgantesA[0].amp" [periodo]="colgantesA[0].per" [fase]="colgantesA[0].fase + i * 0.33" src="/img/home/medalla-oro-larga.webp" alt="" width="120" height="300" class="colgante absolute bottom-0 left-0 h-auto w-[120px]" loading="lazy" decoding="async" />
                </div>
              }
              <div class="relative aspect-[300/360] w-full overflow-hidden rounded-lg border shadow-card lg:aspect-[300/420] lg:w-[300px]"
                [class]="(i === 1 ? 'border-accent shadow-glow-deep' : 'border-white/8') + ' ' + giro[i % 3]">
                <img [src]="p.imagen" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
                <div class="absolute inset-0 flex flex-col justify-end gap-2 bg-[linear-gradient(180deg,transparent_55%,rgb(14_12_13/0.92))] p-5">
                  <span class="inline-flex h-[22px] w-fit items-center rounded-pill bg-[linear-gradient(120deg,#c42b3e,#6e1420)] px-2.5 text-label-xs">Premio · {{ (i + 1).toString().padStart(2, '0') }}</span>
                  <span class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)]">{{ p.titulo }}</span>
                </div>
              </div>
            </li>
          }
        </ul>
        <div class="flex items-center lg:hidden" role="group" aria-label="Premios">
          @for (p of items(); track p.titulo; let i = $index) { <button type="button" class="relative flex size-6 items-center justify-center before:absolute before:-inset-2.5 before:content-['']" [attr.aria-label]="'Ir a premio ' + (i + 1)" [attr.aria-current]="i === activa() || null" (click)="irA(pista, i)"><span class="h-1.5 rounded-pill transition-all motion-reduce:transition-none" [class]="i === activa() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span></button> }
        </div>
        @if (t('lema')) { <p class="max-w-[350px] text-center font-display text-[20px] leading-[27px] tracking-[0.02em] text-[#d1d5db] uppercase lg:max-w-none lg:text-[24px] lg:leading-[30px]"><gr-titulo [titulo]="t('lema')" /></p> }
      </div>

      <!-- B · podium medals per weight class -->
      <div class="mt-20 flex w-full flex-col items-center lg:mt-[120px]">
        <div class="relative h-[334px] w-full max-w-[350px] lg:h-[700px] lg:max-w-none" aria-hidden="true">
          <div class="absolute top-4 left-1/2 flex h-[660px] w-max origin-top -translate-x-1/2 scale-50 items-start justify-center gap-[13px] lg:top-10 lg:scale-100 lg:gap-[67px]">
            @for (m of podio; track m.src) {
              <img grMedalla [amp]="m.amp" [periodo]="m.per" [fase]="m.fase" [src]="m.src" alt="" [attr.width]="m.w" [attr.height]="m.h" class="colgante h-auto" [style.width.px]="m.w" [style.--t]="m.t" [style.--d]="m.d" loading="lazy" decoding="async" />
            }
          </div>
          <div class="pointer-events-none absolute inset-x-[-50vw] -top-3 h-[240px] bg-[radial-gradient(60%_50%_at_50%_30%,#141112_40%,transparent)] lg:h-[400px] lg:-top-[30px]"></div>
        </div>
        <div class="relative z-10 -mt-6 flex w-full max-w-[350px] flex-col items-center gap-5 lg:-mt-12 lg:max-w-none lg:gap-10">
          <gr-cabecera class="max-lg:[&_h2]:text-display-s max-lg:[&_p]:text-body-m" [eyebrow]="t('catEyebrow') || 'Categorías de peso'" [titulo]="t('catTitulo') || 'Premio por *categoría de peso*'"
            [texto]="t('catTexto') || 'El podio de cada categoría se lleva su medalla: oro, plata y bronce para los tres mejores totales.'" />
          <div class="grid w-full grid-cols-2 gap-1 rounded-md border border-line-subtle p-1 lg:hidden" role="tablist" aria-label="Sexo">
            @for (g of generos; track g.k) {
              <button type="button" role="tab" [attr.aria-selected]="sel() === g.k" (click)="sel.set(g.k)" class="h-11 rounded-sm text-label-m" [class]="sel() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-secondary'">{{ g.l }}</button>
            }
          </div>
          <div class="flex w-full flex-col justify-center gap-6 lg:flex-row">
            @for (g of generos; track g.k) {
              <div class="w-full flex-col gap-4 rounded-[20px] border border-[#2e2729] bg-[#221d1f]/85 px-4 py-5 lg:flex lg:w-[400px] lg:flex-none lg:p-7" [class.flex]="sel() === g.k" [class.hidden]="sel() !== g.k" role="tabpanel">
                <div class="hidden items-center justify-between lg:flex"><span class="text-display-xs">{{ g.l }}</span><span class="text-label-xs text-text-muted uppercase">{{ cats[g.k].length }} categorías</span></div>
                <ul class="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  @for (c of cats[g.k]; track c; let last = $last) { <li class="flex h-[53px] items-center justify-center rounded-sm border border-[#2e2729] bg-bg-card text-display-body uppercase" [class]="last && cats[g.k].length % 2 ? 'col-span-2 mx-auto w-[calc(50%-4px)] lg:col-span-1 lg:mx-0 lg:w-auto' : ''">{{ kg(c) }}</li> }
                </ul>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- C · absolute winners (GL Points) -->
      <div class="mt-20 flex w-full flex-col items-center gap-7 lg:mt-[120px] lg:gap-10">
        <gr-cabecera class="max-lg:[&_h2]:text-display-s max-lg:[&_p]:text-body-m" [eyebrow]="t('absEyebrow') || 'Clasificación absoluta'" [titulo]="t('absTitulo') || 'Ganadores absolutos · *GL Points*'"
          [texto]="t('absTexto') || 'Mejor atleta masculino y mejor atleta femenina por puntos GL.'" />
        <ul class="grid w-full gap-6 md:grid-cols-2">
          @for (a of absolutos; track a.label; let i = $index) {
            <li class="flex flex-col overflow-hidden rounded-[32px] border border-[#d4af37]/35 bg-[#221d1f] bg-[radial-gradient(70%_60%_at_50%_45%,rgb(212_175_55/0.22),transparent)]">
              <!-- both start facing the camera (Figma); a small offset so they do not turn in lockstep -->
              <gr-trofeo-3d class="mx-auto mt-6 h-[260px] w-full max-w-[448px] md:h-[300px] lg:mt-10 lg:h-[400px]" [alt]="a.alt" [fase]="i * -0.25" />
              <div class="flex flex-col gap-2 p-6 text-center lg:p-10">
                <span class="text-body-m text-[#d4af37] md:text-body-l">{{ a.titulo }}</span>
                <span class="font-display text-[36px] leading-[44px] tracking-[0.06em] uppercase md:text-[48px] md:leading-[53px]">{{ a.label }}</span>
              </div>
            </li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class SecPremios {
  readonly s = input<Seccion | undefined>();
  protected readonly ancho = ANCHO;
  /** Figma: −4° · 0 · +4° (with their vertical offsets inside the 340 × 480 holders). */
  protected readonly giro = ['lg:-rotate-4 lg:-translate-y-2.5', 'lg:translate-y-0', 'lg:rotate-4 lg:translate-y-2.5'];
  protected readonly colgantesA = [
    { src: '/img/home/medalla-oro-larga.webp', h: 784, t: '6.2s', d: '-1s', amp: 4.5, per: 3.2, fase: 0.33 },
    { src: '/img/home/medalla-oro-corta.webp', h: 429, t: '5.4s', d: '-3s', amp: 3.5, per: 3.6, fase: 0 },
    { src: '/img/home/medalla-oro-larga.webp', h: 784, t: '6.8s', d: '-2s', amp: 5, per: 3, fase: 0.66 },
  ];
  /** B: silver 228 · gold 218 · bronze 228 (Figma 204:124907); swing, period and phase of page 79's table. */
  protected readonly podio = [
    { src: '/img/home/medalla-plata.webp', w: 228, h: 617, t: '5.8s', d: '-2s', amp: 4.5, per: 3.2, fase: 0.33 },
    { src: '/img/home/medalla-oro-cat.webp', w: 218, h: 665, t: '6.4s', d: '-4s', amp: 3.5, per: 3.6, fase: 0 },
    { src: '/img/home/medalla-bronce.webp', w: 228, h: 597, t: '6s', d: '-1s', amp: 5, per: 3, fase: 0.66 },
  ];
  protected readonly absolutos = [
    { titulo: 'Ganador Absoluto - GL points', label: 'Masculino', alt: 'Trofeo del ganador absoluto masculino' },
    { titulo: 'Ganadora Absoluta - GL points', label: 'Femenino', alt: 'Trofeo de la ganadora absoluta femenina' },
  ];
  protected readonly cats = CATEGORIAS_IPF;
  protected readonly generos = [{ k: 'M' as const, l: 'Hombres' }, { k: 'F' as const, l: 'Mujeres' }];
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

