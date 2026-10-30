import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GrButton } from '@grcup/ui';

/** Figma «404 · Ruta no encontrada»: the big red 404, the title, one line and «Volver al inicio». Also used by CMS routes. */
@Component({
  selector: 'gr-no-encontrada',
  imports: [GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center gap-6 px-5 py-[120px] text-center md:gap-8 md:py-[200px]' },
  template: `
    <p class="text-display-xl text-accent-text [text-shadow:0_4px_32px_rgb(196_43_62/0.45)] md:text-display-hero" aria-hidden="true">404</p>
    <h1 class="text-display-s md:text-display-m">Página no encontrada</h1>
    <p class="max-w-[560px] text-body-m text-text-tertiary">La página que buscas no existe o se ha movido.</p>
    <a grButton variant="primary" size="l" href="/">Volver al inicio</a>
  `,
})
export class NoEncontrada {}
