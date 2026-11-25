import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChildren } from '@angular/core';
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
    video: (v: string) => `Visualización conceptual del montaje · ${v}`,
    pausar: (v: string) => `Pausar el vídeo ${v}`,
    reproducir: (v: string) => `Reproducir el vídeo ${v}`,
    error: 'No hemos podido cargar este vídeo.',
    abrir: 'Abrir el vídeo en otra pestaña',
    nombres: { aerea: 'Aérea con zoom', frontal: 'Frontal panorámica', rack: 'Rack de cerca' } as Record<string, string>,
  },
  en: {
    eyebrow: 'GRS Cup 2 · The set-up',
    titulo: 'What *our championship* will look like',
    video: (v: string) => `Conceptual visualisation of the set-up · ${v}`,
    pausar: (v: string) => `Pause the ${v} video`,
    reproducir: (v: string) => `Play the ${v} video`,
    error: 'We could not load this video.',
    abrir: 'Open the video in a new tab',
    nombres: { aerea: 'Aerial zoom', frontal: 'Front panorama', rack: 'Rack close-up' } as Record<string, string>,
  },
};

/**
 * «Cómo será nuestro campeonato» (BIZ-213, minimal): the three views stacked in a column, each a muted 16:9 clip that
 * loops by itself while it is on screen (preload none: nothing downloads before). Every clip has its own pause button
 * (WCAG 2.2.2); with reduced motion they wait for the user to press play.
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
      <ul class="flex flex-col gap-4 md:gap-6">
        @for (x of vistas; track x.id) {
          @let nombre = t().nombres[x.id];
          <li class="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            @if (error()[x.id]) {
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center" role="alert">
                <p class="text-body-m text-text-primary">{{ t().error }}</p>
                <a [href]="x.original" target="_blank" rel="noopener" class="text-label-m text-accent-text underline">{{ t().abrir }}</a>
              </div>
            } @else {
              <video #video [attr.data-id]="x.id" class="absolute inset-0 size-full object-cover" muted [muted]="true" loop playsinline preload="none" [poster]="x.poster" [attr.aria-label]="t().video(nombre)"
                (play)="marcar(x.id, true)" (pause)="marcar(x.id, false)" (error)="fallo(x.id)">
                <source [src]="x.web" type="video/mp4" (error)="fallo(x.id)" />
              </video>
              <span class="pointer-events-none absolute bottom-3 left-3 rounded-sm bg-black/55 px-2.5 py-1 text-label-s text-white backdrop-blur-sm" aria-hidden="true">{{ nombre }}</span>
              <button type="button" (click)="alternar(x.id)" class="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none" [attr.aria-label]="sonando()[x.id] ? t().pausar(nombre) : t().reproducir(nombre)">
                <gr-icon [name]="sonando()[x.id] ? 'pause' : 'play'" [size]="18" />
              </button>
            }
          </li>
        }
      </ul>
    </div>
  `,
})
export class SecMontaje {
  protected readonly t = inject(I18n).dict(T);
  protected readonly vistas = VISTAS;
  protected readonly glow = GLOW;
  protected readonly ancho = ANCHO;
  protected readonly sonando = signal<Record<string, boolean>>({});
  protected readonly error = signal<Record<string, boolean>>({});
  private readonly videos = viewChildren<ElementRef<HTMLVideoElement>>('video');
  private readonly visibles = new Set<string>();
  /** Clips paused by the user (all of them with reduced motion, until the user presses play). */
  private readonly pausados = new Set<string>();

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) VISTAS.forEach((v) => this.pausados.add(v.id));
      const io = new IntersectionObserver((es) => {
        for (const e of es) {
          const id = (e.target as HTMLElement).dataset['id'] ?? '';
          if (e.isIntersecting) this.visibles.add(id);
          else this.visibles.delete(id);
          this.sincronizar(e.target as HTMLVideoElement);
        }
      }, { threshold: 0.25 });
      for (const v of this.videos()) io.observe(v.nativeElement);
      destroy.onDestroy(() => io.disconnect());
    });
  }

  /** A clip plays while it is on screen and the user has not paused it; otherwise it pauses. */
  private sincronizar(el: HTMLVideoElement): void {
    const id = el.dataset['id'] ?? '';
    if (this.visibles.has(id) && !this.pausados.has(id)) void el.play().catch(() => undefined);
    else el.pause();
  }

  protected alternar(id: string): void {
    if (this.sonando()[id]) this.pausados.add(id);
    else this.pausados.delete(id);
    const el = this.videos().find((v) => v.nativeElement.dataset['id'] === id)?.nativeElement;
    if (el) this.sincronizar(el);
  }

  protected marcar(id: string, v: boolean): void {
    this.sonando.update((s) => ({ ...s, [id]: v }));
  }

  protected fallo(id: string): void {
    this.error.update((s) => ({ ...s, [id]: true }));
    this.marcar(id, false);
  }
}
