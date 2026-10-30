import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Titles of the CMS with the Figma markup: «*text*» goes in the accent colour, «|» is a line break.
 * `trozosTitulo('*Una competición*|hecha para|los atletas')` → 3 lines, the first one in red. When the section still
 * uses the separate accent field, it is appended (in red) after the title.
 */
export interface Trozo { t: string; acento: boolean }
export function trozosTitulo(titulo: string, acento = ''): Trozo[][] {
  const lineas = (titulo || '').split('|').map((l) => l.trim());
  const out = lineas.map((l) => {
    const t: Trozo[] = [];
    l.split('*').forEach((parte, i) => { if (parte) t.push({ t: parte, acento: i % 2 === 1 }); });
    return t;
  });
  if (acento) {
    const ultima = out[out.length - 1] ?? [];
    if (ultima.length) ultima.push({ t: ' ', acento: false });
    ultima.push({ t: acento, acento: true });
    if (!out.length) out.push(ultima);
  }
  return out.filter((l) => l.length);
}

/** Plain text of a CMS title (alt texts, aria labels). */
export const textoTitulo = (titulo: string, acento = '') => trozosTitulo(titulo, acento).map((l) => l.map((t) => t.t).join('')).join(' ');

/** Title with its accent parts and explicit lines (Figma: drop shadow 0 2 20 black/80, accent text-shadow glow). */
@Component({
  selector: 'gr-titulo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block [text-shadow:0_2px_20px_rgb(0_0_0/0.8)]' },
  template: `
    @for (l of lineas(); track $index) {
      <span [class.block]="lineas().length > 1">@for (t of l; track $index) {<span [class.text-accent-text]="t.acento">{{ t.t }}</span>}</span>
    }
  `,
})
export class GrTitulo {
  readonly titulo = input('');
  readonly acento = input('');
  protected readonly lineas = computed(() => trozosTitulo(this.titulo(), this.acento()));
}

/**
 * Eyebrow of a section (Figma «Eyebrow»): «01 — Los atletas» = number in mono accent, a 28 px dash and the label.
 * The CMS keeps it as one text («01 · Los atletas»); without a number only the dash and the label are shown.
 */
@Component({
  selector: 'gr-eyebrow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-2.5' },
  template: `
    @if (partes().num) { <span class="text-mono-xs text-accent-text">{{ partes().num }}</span> }
    <span class="h-px w-7 shrink-0 bg-accent/60" aria-hidden="true"></span>
    <span class="text-label-xs" [class]="tono() === 'claro' ? 'text-text-secondary' : 'text-text-tertiary'">{{ partes().label }}</span>
  `,
})
export class GrEyebrow {
  readonly texto = input('');
  readonly tono = input<'normal' | 'claro'>('normal');
  protected readonly partes = computed(() => {
    const m = /^\s*(\d{1,2})\s*[·\-—–]\s*(.+)$/.exec(this.texto() || '');
    return m ? { num: m[1].padStart(2, '0'), label: m[2] } : { num: '', label: this.texto() };
  });
}

/**
 * Header of a home section (Figma «Header»): eyebrow, title (Display/L 48 desktop · Display/S 30 mobile) and an
 * optional text (Body/L 18 · Body/M 16, tertiary). Centred by default (880 px column).
 */
@Component({
  selector: 'gr-cabecera',
  imports: [GrEyebrow, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 md:gap-4', '[class.items-center]': 'centro()', '[class.text-center]': 'centro()', '[class.mx-auto]': 'centro()', '[class.max-w-[880px]]': 'centro()' },
  template: `
    @if (eyebrow()) { <gr-eyebrow [texto]="eyebrow()" /> }
    <h2 [class]="tam() === 'm' ? 'text-display-s md:text-display-m' : 'text-display-s md:text-display-l'"><gr-titulo [titulo]="titulo()" [acento]="acento()" /></h2>
    @if (texto()) { <p class="text-body-m text-text-tertiary md:text-body-l">{{ texto() }}</p> }
  `,
})
export class GrCabecera {
  readonly eyebrow = input('');
  readonly titulo = input('');
  readonly acento = input('');
  readonly texto = input('');
  readonly centro = input(true);
  readonly tam = input<'l' | 'm'>('l');
}

/** Section frame: background tone, Figma paddings (128/80 desktop · 72/20 mobile) and the 1200 px content width. */
export const SECCION = 'relative block overflow-hidden px-5 py-18 md:px-8 md:py-24 xl:px-20 xl:py-32';
export const ANCHO = 'relative mx-auto w-full max-w-[1200px]';
/** Radial glow of the sections (accent deep 16 % → 0). */
export const GLOW = 'pointer-events-none absolute rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.16),transparent)]';
