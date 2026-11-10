import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Seo } from '../core/seo';

type Swatch = [name: string, hex: string, uso: string];
type Tipo = [estilo: string, clase: string, muestra: string];

/** Colour groups of Figma 01 · Fundamentos (variables «GR Cup · Tokens»), in the order of the page. Legacy ones are shown, not tokenised. */
const COLORES: Swatch[][] = [
  [['bg/base', '#141112', 'Fondo global con grano'], ['bg/deep', '#0E0C0D', 'Bandas alternas, footer'], ['bg/surface', '#1B1718', 'Paneles'], ['bg/card', '#221D1F', 'Tarjetas'], ['bg/raised', '#2B2527', 'Hover, menús'], ['bg/field', '#181516', 'Inputs']],
  [['legacy/black', '#0A0A0A', '⚠ Fondo actual #0A0A0A'], ['legacy/api-primary', '#DC2626', '⚠ landingConfig.primaryColor (API): cambiar a #C42B3E'], ['legacy/crimson', '#DC143C', '⚠ Rojo actual de la web'], ['legacy/navy-login', '#1A1A2E', '⚠ Fondo login actual (a eliminar)'], ['legacy/cyan-link', '#22D3EE', '⚠ Enlaces legales footer (a eliminar)']],
  [['brand/accent', '#C42B3E', 'Rellenos: botones, chips, barras (blanco encima 5,6:1)'], ['brand/accent-text', '#E6606B', 'Texto e iconos de acento (5,6:1 sobre fondo, AA)'], ['brand/accent-deep', '#6E1420', 'Degradado CTA, glow, panel sorteo'], ['brand/accent-700', '#A82334', 'Hover / pressed']],
  [['text/primary', '#FFFFFF', 'Titulares'], ['text/secondary', '#D1D5DB', 'Cuerpo'], ['text/tertiary', '#9CA3AF', 'Cuerpo secundario'], ['text/muted', '#6B7280', 'Metadatos'], ['text/disabled', '#4B5563', 'Deshabilitado']],
  [['line/subtle', '#2E2729', 'Divisores'], ['line/strong', '#433A3C', 'Bordes de campo'], ['line/accent', '#6E1420', 'Marcos de sección']],
  [['state/success', '#22C55E', 'Pago completado'], ['state/warning', '#F59E0B', 'Avisos'], ['state/info', '#38BDF8', 'Info']],
];

const GRADIENTES: [string, string][] = [
  ['CTA rojo → rojo profundo', 'linear-gradient(90deg, #c42b3e, #6e1420)'],
  ['Separador (60 %)', 'linear-gradient(90deg, rgb(196 43 62 / 0), rgb(196 43 62 / 0.6) 50%, rgb(196 43 62 / 0))'],
  ['Glow radial', 'radial-gradient(50% 50% at 50% 50%, rgb(110 20 32 / 0.6), rgb(110 20 32 / 0))'],
  ['Viñeteado de foto', 'radial-gradient(64% 64% at 50% 50%, rgb(20 17 18 / 0) 55%, #141112), #8a8a8a'],
  ['Fade inferior hero', 'linear-gradient(180deg, rgb(20 17 18 / 0), #141112)'],
];

const D = 'Premio para los mejores';
const U = 'Las inscripciones todavía no están abiertas';
const M = '08:00 – 13:30 · −120 KG';
const TIPOS: Tipo[] = [
  ['Display/Hero 72', 'text-display-hero', D], ['Display/XL 60', 'text-display-xl', D], ['Display/L 48', 'text-display-l', D],
  ['Display/M 36', 'text-display-m', D], ['Display/S 30', 'text-display-s', D], ['Display/XS 24', 'text-display-xs', D],
  ['Display/2XS 20', 'text-display-2xs', D], ['Display/Body 18', 'text-display-body', D], ['Display/Label 14', 'text-display-label', D],
  ['UI/H1 48', 'text-ui-h1', U], ['UI/H2 36', 'text-ui-h2', U], ['UI/H3 24', 'text-ui-h3', U], ['UI/H4 20', 'text-ui-h4', U], ['UI/H5 18', 'text-ui-h5', U],
  ['Body/L 18', 'text-body-l', U], ['Body/M 16', 'text-body-m', U], ['Body/S 14', 'text-body-s', U], ['Body/XS 12', 'text-body-xs', U],
  ['Label/M 16', 'text-label-m', 'Inscribirse'], ['Label/S 14', 'text-label-s', 'Inscribirse'], ['Label/XS 12', 'text-label-xs', 'Inscribirse'],
  ['Mono/S 13', 'text-mono-s', M], ['Mono/XS 11', 'text-mono-xs', M],
];

const RAMPA = [
  'hero    D Display/Hero 72   ·   T Display/XL 60   ·   M Display/M 36',
  'h1      D Display/XL 60   ·   T Display/XL 60   ·   M Display/M 36',
  'h2      D Display/L 48   ·   T Display/L 48   ·   M Display/S 30',
  'h3      D Display/M 36   ·   T Display/M 36   ·   M Display/XS 24',
  'h4      D Display/S 30   ·   T Display/S 30   ·   M Display/2XS 20',
  'h5      D Display/XS 24   ·   T Display/XS 24   ·   M Display/Body 18',
  'dbody   D Display/2XS 20   ·   T Display/Body 18   ·   M Display/Label 14',
  'uih1    D UI/H1 48   ·   T UI/H1 48   ·   M UI/H2 36',
  'uih2    D UI/H2 36   ·   T UI/H2 36   ·   M UI/H3 24',
  'body    D Body/L 18   ·   T Body/M 16   ·   M Body/M 16',
];

/** Effect styles: [name, classes of the 120×64 sample, grain layer (image, opacity, blend) or null]. */
const EFECTOS: [string, string, [string, number, string] | null][] = [
  ['Glow/Accent', 'bg-bg-card shadow-glow', null], ['Glow/Accent deep', 'bg-bg-card shadow-glow-deep', null],
  ['Shadow/Card', 'bg-bg-card shadow-card', null], ['Shadow/Text', 'bg-bg-card shadow-text', null],
  ['Blur/Glass 20', 'bg-accent backdrop-blur-glass', null], ['Blur/Smoke 80', 'bg-accent blur-smoke', null],
  ['Grain/Fondo', 'bg-bg-card', ['var(--grain-light)', 0.065, 'normal']], ['Grain/Fondo suave', 'bg-bg-card', ['var(--grain-light)', 0.04, 'normal']],
  ['Grain/Acento', 'bg-bg-card', ['var(--grain-dark)', 0.16, 'multiply']],
];

const RADIOS: [string, string][] = [['2xs 4 · checks', 'rounded-2xs'], ['xs 6 · tags', 'rounded-xs'], ['sm 8 · botones', 'rounded-sm'], ['md 12 · campos', 'rounded-md'],
  ['lg 16 · tarjetas', 'rounded-lg'], ['xl 20 · paneles', 'rounded-xl'], ['2xl 24 · hojas', 'rounded-2xl'], ['pill · chips', 'rounded-pill']];

const ESPACIOS: [number, boolean][] = [2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 96, 128].map((n) => [n, n === 2 || n === 6 || n === 10]);

/** Column grids of the three breakpoints, drawn at the Figma thumbnail scale: [label, w, h, columns, gutter, margin]. */
const REJILLAS: [string, number, number, number, number, number][] = [
  ['Desktop 1440×900 · margen 80 · 12 columnas', 461, 288, 12, 7.68, 25.6],
  ['Tablet 768×1024 · margen 32 · 12 columnas', 246, 328, 12, 5.12, 10.24],
  ['Mobile 390×844 · margen 20 · 4 columnas', 125, 270, 4, 5.12, 6.4],
];

/** /_styleguide (internal, noindex, not in the sitemap): the design tokens as on Figma page 01 · Fundamentos, for visual QA. */
@Component({
  selector: 'gr-styleguide-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex max-w-[1600px] flex-col gap-16 px-5 py-20 md:px-8 xl:px-20">
      <header class="flex flex-col gap-3">
        <h1 class="text-display-m md:text-display-xl">Fundamentos</h1>
        <p class="max-w-[1100px] text-body-l text-text-tertiary">Tokens medidos con getComputedStyle sobre la app en ejecución. Variables en la colección "GR Cup · Tokens" (modo Dark), estilos de texto y de efecto locales.</p>
      </header>

      <section class="flex flex-col gap-6" aria-labelledby="sg-color">
        <h2 id="sg-color" class="text-ui-h3">Color</h2>
        @for (grupo of colores; track $index) {
          <ul class="flex flex-wrap gap-4">
            @for (c of grupo; track c[0]) {
              <!-- no mobile frame in Figma: two columns on phones instead of one 220 px card -->
              <li class="flex w-[calc((100%-16px)/2)] flex-col overflow-hidden rounded-md border border-line-subtle bg-bg-card sm:w-[220px]">
                <span class="h-[88px] shrink-0" [style.background]="c[1]"></span>
                <span class="flex min-w-0 flex-col gap-1 px-3 py-4 break-words">
                  <!-- Figma line boxes 18 / 15 / 17 (the 1.4–1.45 ratios round up to one extra px per card) -->
                  <span class="text-mono-s leading-[18px]">{{ c[0] }}</span>
                  <span class="text-mono-xs leading-[15px] text-text-muted">{{ c[1] }}</span>
                  <span class="text-body-xs leading-[17px] text-text-tertiary">{{ c[2] }}</span>
                </span>
              </li>
            }
          </ul>
        }
        <!-- Figma lays the five 280 px swatches in one row even though they overflow the 1440 column by 24 px (into the margin); narrower screens shrink them -->
        <ul class="flex flex-wrap gap-4 xl:flex-nowrap">
          @for (g of gradientes; track g[0]) {
            <li class="flex w-[280px] flex-col gap-2 min-[1600px]:shrink-0">
              <span class="h-[72px] rounded-md border border-line-subtle" [style.background]="g[1]"></span>
              <span class="text-body-s text-text-secondary">{{ g[0] }}</span>
            </li>
          }
        </ul>
      </section>

      <section class="flex flex-col gap-5" aria-labelledby="sg-tipo">
        <h2 id="sg-tipo" class="text-ui-h3">Tipografía</h2>
        <!-- Figma: 1200×50 text box (one line at desktop) -->
        <p class="max-w-[1200px] text-body-m text-text-tertiary md:min-h-[50px]">Contrail One para titulares (en mayúsculas, como en la web) · Inter para interfaz y cuerpo · Roboto Mono para datos.</p>
        <ul class="flex flex-col gap-5">
          @for (t of tipos; track t[0]) {
            <li class="flex flex-col gap-2 border-b border-line-subtle py-3 md:flex-row md:items-center md:gap-8">
              <span class="w-[220px] shrink-0 text-mono-s text-text-muted">{{ t[0] }}</span>
              <span class="min-w-0 max-w-[1000px] flex-1" [class]="t[1]">{{ t[2] }}</span>
            </li>
          }
        </ul>
        <div class="flex flex-col gap-2 overflow-x-auto rounded-md bg-bg-card p-6">
          <p class="text-label-s leading-[17px] text-text-secondary">Escala responsive (Tailwind del proyecto: sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1440)</p>
          @for (l of rampa; track $index) { <p class="text-mono-s leading-[18px] whitespace-pre text-text-tertiary">{{ l }}</p> }
        </div>
      </section>

      <section class="flex flex-wrap gap-6" aria-label="Efectos">
        @for (e of efectos; track e[0]) {
          <div class="flex w-[calc((100%-24px)/2)] flex-col items-center gap-2 rounded-md bg-bg-surface p-6 sm:w-[220px] md:w-[calc((100%-48px)/3)] lg:w-[calc((100%-72px)/4)] xl:w-[calc((100%-120px)/6)]">
            <span class="relative h-16 w-[120px] overflow-hidden rounded-md" [class]="e[1]">
              @if (e[2]; as g) { <span class="absolute inset-0 bg-[length:128px_128px]" [style.background-image]="g[0]" [style.opacity]="g[1]" [style.mix-blend-mode]="g[2]"></span> }
            </span>
            <span class="text-mono-s text-text-secondary">{{ e[0] }}</span>
          </div>
        }
      </section>

      <section class="flex flex-wrap gap-6" aria-label="Radios">
        @for (r of radios; track r[0]) {
          <div class="flex flex-col gap-2">
            <span class="h-16 w-24 border border-accent/50 bg-bg-card" [class]="r[1]"></span>
            <span class="text-mono-s text-text-tertiary">{{ r[0] }}</span>
          </div>
        }
      </section>

      <section class="flex flex-col gap-16" aria-label="Espaciado">
        <ul class="flex flex-wrap gap-5">
          @for (s of espacios; track s[0]) {
            <li class="flex flex-col items-center gap-2">
              <span class="h-12 bg-accent" [style.width.px]="s[0]"></span>
              <span class="text-mono-xs text-text-muted">{{ s[0] }}{{ s[1] ? '*' : '' }}</span>
            </li>
          }
        </ul>
        <p class="text-body-s text-text-tertiary">Espaciado: rejilla de 4 pt en layout · * 2 · 6 · 10 solo en controles compactos (≤ 32 px: pills, chips, badges) · ritmo de secciones D 128 / 96 / 64 · T 96 / 72 / 48 · M 72 / 56 / 40 · táctil mínimo 44 px en móvil.</p>
      </section>

      <section class="flex flex-wrap items-start gap-10" aria-label="Rejillas">
        @for (g of rejillas; track g[0]) {
          <!-- Figma: the frame hugs the label (tablet label 321 px over a 246 px grid), so the label stays on one line -->
          <div class="flex max-w-full flex-col gap-2">
            <span class="text-mono-s text-text-tertiary">{{ g[0] }}</span>
            <span class="flex max-w-full border border-line-subtle bg-bg-card" [style.width.px]="g[1]" [style.aspect-ratio]="g[1] + ' / ' + g[2]" [style.gap.px]="g[4]" [style.padding-inline.px]="g[5]">
              @for (c of cols(g[3]); track c) { <span class="flex-1 bg-[#dc143d]/12"></span> }
            </span>
          </div>
        }
      </section>
    </main>
  `,
})
export class StyleguidePage {
  protected readonly colores = COLORES;
  protected readonly gradientes = GRADIENTES;
  protected readonly tipos = TIPOS;
  protected readonly rampa = RAMPA;
  protected readonly efectos = EFECTOS;
  protected readonly radios = RADIOS;
  protected readonly espacios = ESPACIOS;
  protected readonly rejillas = REJILLAS;
  protected cols(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  constructor() {
    inject(Seo).set({ title: 'Styleguide · GR Strength Cup', description: 'Tokens de diseño (uso interno).', path: '/_styleguide', robots: 'noindex, nofollow' });
  }
}
