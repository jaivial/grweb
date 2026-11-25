import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild, viewChildren } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { I18n } from '../core/i18n';
import { ANCHO, GLOW, GrCabecera, SECCION } from './bloques';

/** BIZ-166: conceptual clips of the GRS Cup 2 set-up (Pabellón Municipal de Almussafes), on BunnyCDN. */
const CDN = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/360';
const VISTAS = [
  { id: 'aerea', original: 'gemini_generated_video_754808d8.mp4' },
  { id: 'frontal', original: 'gemini_generated_video_7b2ed36f.mp4' },
  { id: 'lateral', original: 'gemini_generated_video_35be5cc5.mp4' },
].map((v) => ({ ...v, poster: `${CDN}/posters/montaje-${v.id}.webp`, web: `${CDN}/web/montaje-${v.id}-web.mp4`, original: `${CDN}/${v.original}` }));

const T = {
  es: {
    eyebrow: 'GRS Cup 2 · El montaje',
    titulo: 'Cómo será *nuestro campeonato*',
    intro: 'Así queremos vestir el Pabellón Municipal de Almussafes para la GRS Cup 2. Elige una vista y dale al play.',
    aviso: 'Visualización conceptual del montaje. La distribución final puede variar.',
    vistas: 'Vistas del montaje',
    reproducir: (v: string) => `Reproducir la vista ${v}`,
    error: 'No hemos podido cargar este vídeo.',
    abrir: 'Abrir el vídeo en otra pestaña',
    nombres: { aerea: 'Aérea', frontal: 'Frontal', lateral: 'Lateral' } as Record<string, string>,
    descr: {
      aerea: 'Vista desde lo alto de la grada: todo el pabellón con la moqueta, la tarima central y las tres lonas al fondo.',
      frontal: 'Vista de frente a la tarima: la lona principal de 6×3 m con el logo de la GRS Cup 2 y el truss de focos encima.',
      lateral: 'Vista lateral a pie de tarima: las lonas de 3×3 m en ángulo y la luz roja en su base.',
    } as Record<string, string>,
    montajeTitulo: 'El montaje',
    montaje: ['Todo el suelo cubierto de moqueta e iluminación profesional.', 'Tarima central para la competición.', 'Lona principal de 6×3 m al fondo.', 'Dos lonas laterales de 3×3 m, en ángulo.', 'Truss con focos encima y luz roja en la base de las lonas.'],
  },
  en: {
    eyebrow: 'GRS Cup 2 · The set-up',
    titulo: 'What *our championship* will look like',
    intro: 'This is how we plan to dress the Almussafes municipal sports hall for GRS Cup 2. Pick a view and press play.',
    aviso: 'Conceptual visualisation of the set-up. The final layout may vary.',
    vistas: 'Set-up views',
    reproducir: (v: string) => `Play the ${v} view`,
    error: 'We could not load this video.',
    abrir: 'Open the video in a new tab',
    nombres: { aerea: 'Aerial', frontal: 'Front', lateral: 'Side' } as Record<string, string>,
    descr: {
      aerea: 'View from the top of the stands: the whole hall with the carpet, the central platform and the three banners at the back.',
      frontal: 'View facing the platform: the 6×3 m main banner with the GRS Cup 2 logo and the lighting truss above it.',
      lateral: 'Side view at platform level: the angled 3×3 m banners and the red light at their base.',
    } as Record<string, string>,
    montajeTitulo: 'The set-up',
    montaje: ['Carpet over the whole floor and professional lighting.', 'Central competition platform.', '6×3 m main banner at the back.', 'Two 3×3 m side banners, set at an angle.', 'Lighting truss above and red light at the base of the banners.'],
  },
};

/**
 * «Cómo será nuestro campeonato» (BIZ-166): one 16:9 player with three views (aerial, front, side) picked from an
 * accessible tablist. Only posters load with the page; the chosen clip is fetched when the user presses play, and
 * only one plays at a time (the element is replaced when the view changes). No autoplay, native controls, playsinline.
 */
@Component({
  selector: 'gr-sec-montaje',
  imports: [GrCabecera, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base', id: 'montaje' },
  template: `
    <div [class]="glow + ' top-10 right-[6%] size-[280px] md:size-[480px]'"></div>
    <div [class]="ancho + ' flex max-w-[960px] flex-col gap-8 md:gap-12'">
      <gr-cabecera [eyebrow]="t().eyebrow" [titulo]="t().titulo" [texto]="t().intro" />
      @let v = vista();
      <div class="flex flex-col gap-4">
        <div class="relative aspect-video w-full overflow-hidden rounded-lg border border-line-subtle bg-black" role="tabpanel" [id]="'montaje-panel'" [attr.aria-labelledby]="'montaje-tab-' + v.id">
          @if (error()) {
            <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center" role="alert">
              <p class="text-body-m text-text-primary">{{ t().error }}</p>
              <a [href]="v.original" target="_blank" rel="noopener" class="text-label-m text-accent-text underline">{{ t().abrir }}</a>
            </div>
          } @else if (activo()) {
            @for (x of [v]; track x.id) {
              <video #video class="absolute inset-0 size-full object-contain" controls playsinline preload="none" [poster]="x.poster" [attr.aria-label]="t().nombres[x.id] + ' — ' + t().descr[x.id]" (error)="error.set(true)">
                <source [src]="x.web" type="video/mp4" (error)="error.set(true)" />
                <a [href]="x.original">{{ t().abrir }}</a>
              </video>
            }
          } @else {
            <img [src]="v.poster" alt="" width="1280" height="720" loading="lazy" decoding="async" class="absolute inset-0 size-full object-cover" />
            <button type="button" (click)="reproducir()" class="group absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none" [attr.aria-label]="t().reproducir(t().nombres[v.id])">
              <span class="flex size-16 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none md:size-20" aria-hidden="true"><gr-icon name="play" [size]="28" /></span>
            </button>
          }
        </div>
        <p class="inline-flex items-start gap-2 self-start rounded-md border border-info/60 bg-info/12 px-3 py-2 text-body-s text-info"><gr-icon name="info" [size]="16" class="mt-0.5 shrink-0" />{{ t().aviso }}</p>
        <p class="text-body-m text-text-secondary" aria-live="polite"><strong class="text-text-primary">{{ t().nombres[v.id] }}.</strong> {{ t().descr[v.id] }}</p>
      </div>
      <div role="tablist" [attr.aria-label]="t().vistas" class="grid grid-cols-3 gap-2 md:gap-4" (keydown)="teclas($event)">
        @for (x of vistas; track x.id; let i = $index) {
          <button #tab type="button" role="tab" [id]="'montaje-tab-' + x.id" [attr.aria-label]="t().nombres[x.id]" aria-controls="montaje-panel" [attr.aria-selected]="i === sel()" [tabindex]="i === sel() ? 0 : -1" (click)="elegir(i)"
            class="flex min-w-0 flex-col gap-2 rounded-md border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none md:p-2"
            [class]="i === sel() ? 'border-accent bg-white/6' : 'border-line-subtle hover:border-white/30'">
            <img [src]="x.poster" alt="" width="1280" height="720" loading="lazy" decoding="async" class="aspect-video w-full rounded-sm object-cover" />
            <span class="truncate px-1 pb-1 text-label-s" [class]="i === sel() ? 'text-text-primary' : 'text-text-secondary'">{{ t().nombres[x.id] }}</span>
          </button>
        }
      </div>
      <div class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-white/3 p-5 md:p-8">
        <h3 class="text-display-xs">{{ t().montajeTitulo }}</h3>
        <ul class="grid gap-2 text-body-m text-text-secondary md:grid-cols-2">
          @for (m of t().montaje; track $index) { <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>{{ m }}</li> }
        </ul>
      </div>
    </div>
  `,
})
export class SecMontaje {
  protected readonly t = inject(I18n).dict(T);
  protected readonly vistas = VISTAS;
  protected readonly glow = GLOW;
  protected readonly ancho = ANCHO;
  protected readonly sel = signal(0);
  protected readonly vista = computed(() => VISTAS[this.sel()]);
  /** The player only exists once the user asks for it: nothing is downloaded before. */
  protected readonly activo = signal(false);
  protected readonly error = signal(false);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  protected reproducir(): void {
    this.activo.set(true);
    // user gesture: start the clip as soon as the element is rendered
    setTimeout(() => this.video()?.nativeElement.play().catch(() => undefined));
  }

  /** Changing the view stops (removes) the current clip and shows the new poster: one video at a time. */
  protected elegir(i: number): void {
    if (i === this.sel()) return;
    this.video()?.nativeElement.pause();
    this.activo.set(false);
    this.error.set(false);
    this.sel.set(i);
  }

  /** Tablist keyboard pattern: arrows, Home and End move and select. */
  protected teclas(e: KeyboardEvent): void {
    const n = VISTAS.length;
    const i = { ArrowRight: this.sel() + 1, ArrowLeft: this.sel() - 1 + n, Home: 0, End: n - 1 }[e.key];
    if (i === undefined) return;
    e.preventDefault();
    this.elegir(i % n);
    this.tabs()[i % n]?.nativeElement.focus();
  }
}
