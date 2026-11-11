import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GrErrorState, GrPageLoader, GrToastCard, GrToasts } from '@grcup/ui';
import { Lightbox, type FotoLightbox } from '../layout/lightbox';
import { NoEncontrada } from '../layout/no-encontrada';
import { FOTOS_SEDE } from './como-llegar';

/**
 * /_overlays (internal, noindex, CSR only, not in the sitemap): the global overlays and states of Figma page
 * «17 · Overlays y estados globales» for visual QA. Each frame is a `transform` box so the fixed overlays stay inside it.
 * The «Modal · confirmar compra» frame is not implemented: the raffle is sold in person, in cash.
 */
@Component({
  selector: 'gr-overlays-page',
  imports: [GrToastCard, GrPageLoader, GrErrorState, Lightbox, NoEncontrada],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex max-w-[1600px] flex-col gap-20 px-5 py-20 md:px-8 xl:px-20">
      <header class="flex flex-col gap-3">
        <h1 class="text-display-m md:text-display-xl">Overlays y estados</h1>
        <p class="max-w-[1100px] text-body-l text-text-tertiary">Página de Figma «17 · Overlays y estados globales». El modal de compra de boletos no se implementa (sorteo solo presencial).</p>
      </header>

      <section class="flex flex-col gap-6" aria-label="Toasts">
        <h2 class="text-ui-h3">Toasts</h2>
        <div class="flex flex-col gap-2">
          <gr-toast tone="success" [closable]="false" title="Inscripción enviada correctamente. Revisa tu correo (y la carpeta de spam) para confirmar tu plaza en la competición." />
          <gr-toast tone="error" title="No se pudo conectar con el servidor" [action]="reintentar" />
        </div>
        <div class="flex flex-wrap gap-3">
          <button type="button" class="rounded-sm border border-line-strong px-4 py-2 text-label-s hover:bg-bg-raised" (click)="toasts.success('Inscripción enviada correctamente. Revisa tu correo (y la carpeta de spam) para confirmar tu plaza en la competición.')">Lanzar toast de éxito</button>
          <button type="button" class="rounded-sm border border-line-strong px-4 py-2 text-label-s hover:bg-bg-raised" (click)="toasts.error('No se pudo conectar con el servidor', undefined, reintentar)">Lanzar toast de error</button>
        </div>
      </section>

      <section class="flex flex-col gap-6" aria-label="Lightbox">
        <h2 class="text-ui-h3">Lightbox · fotos de la sede</h2>
        <button type="button" class="self-start rounded-sm border border-line-strong px-4 py-2 text-label-s hover:bg-bg-raised" (click)="foto = 0">Abrir lightbox</button>
        <gr-lightbox [fotos]="fotos" [(indice)]="foto" />
      </section>

      <section class="flex flex-col gap-6" aria-label="Loader de página">
        <h2 class="text-ui-h3">Loader de página</h2>
        <div class="relative h-[600px] w-full overflow-hidden rounded-sm border border-line-subtle [transform:translateZ(0)]"><gr-page-loader /></div>
      </section>

      <section class="flex flex-col gap-6" aria-label="404">
        <h2 class="text-ui-h3">404 · Ruta no encontrada</h2>
        <div class="rounded-sm border border-line-subtle"><gr-no-encontrada /></div>
      </section>

      <section class="flex flex-col gap-6" aria-label="ErrorBoundary">
        <h2 class="text-ui-h3">ErrorBoundary (backoffice)</h2>
        <div class="rounded-sm border border-line-subtle bg-bg-base"><gr-error-state (reintentar)="toasts.info('Reintentar')" /></div>
      </section>
    </main>
  `,
})
export class OverlaysPage {
  protected readonly toasts = inject(GrToasts);
  protected readonly reintentar = { label: 'Reintentar', run: () => this.toasts.info('Reintentando…') };
  protected foto = -1;
  protected readonly fotos: FotoLightbox[] = FOTOS_SEDE;
}
