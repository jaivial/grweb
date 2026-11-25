import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild, viewChildren } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { I18n } from '../core/i18n';
import { ANCHO, GLOW, GrCabecera, SECCION } from './bloques';

/** BIZ-166 / BIZ-213: conceptual clips of the GRS Cup 2 set-up (Pabellón Municipal de Almussafes), on BunnyCDN (v2). */
const CDN = 'https://jaimedigitalstudio.b-cdn.net/grcup/videos/360/v2';
const VISTAS = [
  { id: 'aerea', base: 'aerea-zoom', original: 'gemini_generated_video_ae4761c2.mp4' },
  { id: 'frontal', base: 'frontal-panoramica', original: 'grs-cup2-orbit-10s-final-e6bc509a.mp4' },
  { id: 'rack', base: 'rack', original: 'gemini_generated_video_828e5cfd.mp4' },
].map((v) => ({ id: v.id, poster: `${CDN}/posters/montaje-${v.base}.webp`, web: `${CDN}/web/montaje-${v.base}-web.mp4`, original: `${CDN}/${v.original}` }));

const T = {
  es: {
    eyebrow: 'GRS Cup 2 · El montaje',
    titulo: 'Cómo será *nuestro campeonato*',
    vistas: 'Vistas del montaje',
    video: (v: string) => `Visualización conceptual del montaje · ${v}`,
    pausar: 'Pausar el vídeo',
    reproducir: 'Reproducir el vídeo',
    error: 'No hemos podido cargar este vídeo.',
    abrir: 'Abrir el vídeo en otra pestaña',
    nombres: { aerea: 'Aérea con zoom', frontal: 'Frontal panorámica', rack: 'Rack de cerca' } as Record<string, string>,
  },
  en: {
    eyebrow: 'GRS Cup 2 · The set-up',
    titulo: 'What *our championship* will look like',
    vistas: 'Set-up views',
    video: (v: string) => `Conceptual visualisation of the set-up · ${v}`,
    pausar: 'Pause the video',
    reproducir: 'Play the video',
    error: 'We could not load this video.',
    abrir: 'Open the video in a new tab',
    nombres: { aerea: 'Aerial zoom', frontal: 'Front panorama', rack: 'Rack close-up' } as Record<string, string>,
  },
};

/**
 * «Cómo será nuestro campeonato» (BIZ-213, minimal): one muted 16:9 clip that plays by itself while the section is on
 * screen and moves on to the next view when it ends; three tabs (with a progress line) pick a view. Nothing downloads
 * until the section is visible (preload none), a pause button stops it (WCAG 2.2.2), and with reduced motion it
 * waits for the user to press play.
 */
@Component({
  selector: 'gr-sec-montaje',
  imports: [GrCabecera, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base', id: 'montaje' },
  template: `
    <div [class]="glow + ' top-10 right-[6%] size-[280px] md:size-[480px]'"></div>
    <div [class]="ancho + ' flex max-w-[960px] flex-col gap-6 md:gap-8'">
      <gr-cabecera [eyebrow]="t().eyebrow" [titulo]="t().titulo" />
      @let v = vista();
      <div class="relative aspect-video w-full overflow-hidden rounded-lg bg-black" role="tabpanel" id="montaje-panel" [attr.aria-labelledby]="'montaje-tab-' + v.id">
        @if (error()) {
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center" role="alert">
            <p class="text-body-m text-text-primary">{{ t().error }}</p>
            <a [href]="v.original" target="_blank" rel="noopener" class="text-label-m text-accent-text underline">{{ t().abrir }}</a>
          </div>
        } @else {
          @for (x of [v]; track x.id) {
            <video #video class="absolute inset-0 size-full object-cover" muted [muted]="true" playsinline preload="none" [poster]="x.poster" [attr.aria-label]="t().video(t().nombres[x.id])"
              (play)="sonando.set(true)" (pause)="sonando.set(false)" (timeupdate)="progreso($event)" (ended)="siguiente()" (error)="error.set(true)">
              <source [src]="x.web" type="video/mp4" (error)="error.set(true)" />
            </video>
          }
          <button type="button" (click)="alternar()" class="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none" [attr.aria-label]="sonando() ? t().pausar : t().reproducir">
            <gr-icon [name]="sonando() ? 'pause' : 'play'" [size]="18" />
          </button>
        }
      </div>
      <div role="tablist" [attr.aria-label]="t().vistas" class="grid grid-cols-3 gap-2" (keydown)="teclas($event)">
        @for (x of vistas; track x.id; let i = $index) {
          <button #tab type="button" role="tab" [id]="'montaje-tab-' + x.id" aria-controls="montaje-panel" [attr.aria-selected]="i === sel()" [tabindex]="i === sel() ? 0 : -1" (click)="elegir(i, true)"
            class="relative flex min-h-11 items-center justify-center overflow-hidden rounded-md border px-2 py-2 text-center text-label-s leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            [class]="i === sel() ? 'border-line-strong bg-white/6 text-text-primary' : 'border-line-subtle text-text-secondary hover:text-text-primary'">
            {{ t().nombres[x.id] }}
            @if (i === sel()) { <span class="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent transition-transform duration-300 ease-linear motion-reduce:transition-none" [style.transform]="'scaleX(' + avance() + ')'" aria-hidden="true"></span> }
          </button>
        }
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
  protected readonly error = signal(false);
  protected readonly sonando = signal(false);
  /** 0–1 progress of the current clip (the line under the selected tab). */
  protected readonly avance = signal(0);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');
  private visible = false;
  /** Paused by the user (or by reduced motion until they press play). */
  private pausado = false;

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      this.pausado = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.sincronizar(); }, { threshold: 0.25 });
      io.observe(host);
      destroy.onDestroy(() => io.disconnect());
    });
  }

  /** Plays while the section is on screen and the user has not paused it; pauses otherwise. */
  private sincronizar(): void {
    const el = this.video()?.nativeElement;
    if (!el) return;
    if (this.visible && !this.pausado) void el.play().catch(() => undefined);
    else el.pause();
  }

  protected alternar(): void {
    this.pausado = this.sonando();
    this.sincronizar();
  }

  protected progreso(e: Event): void {
    const v = e.target as HTMLVideoElement;
    this.avance.set(v.duration ? v.currentTime / v.duration : 0);
  }

  /** When a clip ends the next view starts (the three loop). */
  protected siguiente(): void {
    this.elegir((this.sel() + 1) % VISTAS.length, false);
  }

  /** Changing the view replaces the clip (one video at a time); a tab click also resumes playback. */
  protected elegir(i: number, porUsuario: boolean): void {
    if (porUsuario) this.pausado = false;
    if (i !== this.sel()) {
      this.error.set(false);
      this.avance.set(0);
      this.sel.set(i);
    }
    setTimeout(() => this.sincronizar());
  }

  /** Tablist keyboard pattern: arrows, Home and End move and select. */
  protected teclas(e: KeyboardEvent): void {
    const n = VISTAS.length;
    const i = { ArrowRight: this.sel() + 1, ArrowLeft: this.sel() - 1 + n, Home: 0, End: n - 1 }[e.key];
    if (i === undefined) return;
    e.preventDefault();
    this.elegir(i % n, true);
    this.tabs()[i % n]?.nativeElement.focus();
  }
}
