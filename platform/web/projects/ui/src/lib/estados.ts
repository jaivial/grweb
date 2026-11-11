import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GrButton } from './button';
import { GrIcon } from './icon';

/** Figma 17 «Page loader»: 64 px dashed accent ring and «Cargando...» centred on bg/base (covers the viewport). */
@Component({
  selector: 'gr-page-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-bg-base', role: 'status' },
  template: `
    <svg class="size-16 animate-spin [animation-duration:1.2s] motion-reduce:animate-none" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="var(--color-accent)" stroke-width="4" stroke-dasharray="32 15.1" />
    </svg>
    <p class="text-body-m text-text-tertiary">{{ texto() }}</p>
  `,
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
