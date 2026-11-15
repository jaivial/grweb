import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GrButton } from './button';
import { GrIcon } from './icon';

/**
 * Page loader = the hero's preload bar (hero-trophy.ts «gr-precarga», Jaime 15-nov 13:25): a 2 px track on top with the red
 * gradient pulsing while the next page loads. It never covers the page, so the current page stays readable until the new
 * one is ready (no full-screen flash between pages). Same component in the public web and the backoffice.
 */
@Component({
  selector: 'gr-page-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pointer-events-none fixed inset-x-0 top-0 z-[70] block h-0.5 bg-white/8',
    role: 'progressbar', '[attr.aria-label]': 'texto()', 'aria-busy': 'true',
  },
  template: `<div class="h-full w-full animate-pulse bg-[linear-gradient(90deg,#6e1420,#a82334)] motion-reduce:animate-none"></div>`,
})
export class GrPageLoader {
  readonly texto = input('Cargando...');
}

/** Figma 17 «ErrorBoundary (backoffice)»: alert icon in a 64 px accent/12 circle, title, one line and «Reintentar». */
@Component({
  selector: 'gr-error-state',
  imports: [GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-[640px] flex-col items-center justify-center gap-4 px-5 text-center', role: 'alert' },
  template: `
    <span class="flex size-16 items-center justify-center rounded-full bg-accent/12 text-accent-text"><gr-icon name="circle-alert" [size]="28" /></span>
    <h1 class="text-ui-h3 outline-none" tabindex="-1">{{ titulo() }}</h1>
    <p class="text-body-s text-text-tertiary [overflow-wrap:anywhere]">{{ texto() }}</p>
    <button grButton variant="primary" type="button" (click)="reintentar.emit()">Reintentar</button>
  `,
})
export class GrErrorState {
  readonly titulo = input('Algo salió mal');
  readonly texto = input('Ha ocurrido un error inesperado en el panel.');
  readonly reintentar = output<void>();
}
