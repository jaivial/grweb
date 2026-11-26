import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { I18n } from './i18n';

/** BIZ-160: registration was done through the AEP and is closed; 152 athletes registered (AEP-2: 68, AEP-3: 84; lists below). */
export const INSCRITOS_AEP = 152;
export const LISTAS_AEP = [
  { nivel: 'AEP 2', url: 'https://powerliftingspain.es/aep-2-gr-strength-cup-ii-almussafes-valencia-2026/' },
  { nivel: 'AEP 3', url: 'https://powerliftingspain.es/aep-3-gr-strength-cup-ii-almussafes-valencia-2026/' },
];

const T = {
  es: { cerradas: 'Inscripciones cerradas', txt: (n: number) => `Las inscripciones se hicieron a través de la AEP (Asociación Española de Powerlifting) y ya están cerradas: hay ${n} atletas inscritos.`, atletas: 'atletas inscritos', lista: (nivel: string) => `Inscripción ${nivel}` },
  en: { cerradas: 'Registration closed', txt: (n: number) => `Registration was handled by the AEP (Spanish Powerlifting Association) and is now closed: ${n} athletes are registered.`, atletas: 'registered athletes', lista: (nivel: string) => `${nivel} registration` },
};

/** Clear «registration closed» notice with the AEP count and lists (home + /inscripcion). */
@Component({
  selector: 'gr-inscripciones-cerradas',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="mx-auto flex w-full max-w-[760px] flex-col items-center gap-4 rounded-lg border border-accent/40 bg-accent/8 p-6 text-center">
      @if (chip()) { <p class="inline-flex h-7 items-center rounded-pill border border-accent bg-accent/12 px-3 text-label-xs text-accent-text uppercase">{{ t().cerradas }}</p> }
      <p class="flex items-end gap-2"><span class="font-display text-[48px] leading-none text-accent-text md:text-[60px]">{{ n }}</span><span class="pb-1 text-display-2xs text-text-tertiary">{{ t().atletas }}</span></p>
      <p class="max-w-[600px] text-body-m text-text-secondary">{{ t().txt(n) }}</p>
      <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        @for (l of listas; track l.url) {
          <a [href]="l.url" target="_blank" rel="noopener" [attr.aria-label]="t().lista(l.nivel)" class="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line-subtle bg-white/5 px-4 text-body-s font-semibold hover:bg-white/10">{{ l.nivel }}<gr-icon name="arrow-right" [size]="16" /></a>
        }
      </div>
    </div>
  `,
})
export class GrInscripcionesCerradas {
  /** /inscripcion already says it in its h1 (BIZ-160): no repeated chip there. */
  readonly chip = input(true);
  protected readonly t = inject(I18n).dict(T);
  protected readonly n = INSCRITOS_AEP;
  protected readonly listas = LISTAS_AEP;
}
