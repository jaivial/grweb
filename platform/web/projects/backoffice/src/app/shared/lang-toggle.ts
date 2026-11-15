import { ChangeDetectionStrategy, Component, model } from '@angular/core';

export type Idioma = 'es' | 'en';

/** ES | EN switch of the CMS editors: EN edits the `en` overlay (empty fields fall back to Spanish on the public web). */
@Component({
  selector: 'bo-lang-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex gap-1 rounded-md border border-line-subtle bg-bg-surface p-1" role="group" aria-label="Idioma del contenido">
      @for (l of idiomas; track l.value) {
        <button type="button" (click)="value.set(l.value)" [attr.aria-pressed]="value() === l.value"
          class="inline-flex h-8 items-center rounded-sm px-3 text-label-s transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
          [class]="value() === l.value ? 'bg-bg-raised text-text-primary' : 'text-text-secondary hover:text-text-primary'">{{ l.label }}</button>
      }
    </div>
    @if (value() === 'en') { <p class="mt-2 text-body-xs text-text-tertiary">Traducción al inglés. Los campos vacíos muestran el texto en español en la web /en.</p> }
  `,
})
export class BoLangToggle {
  readonly value = model<Idioma>('es');
  protected readonly idiomas: { value: Idioma; label: string }[] = [{ value: 'es', label: 'ES' }, { value: 'en', label: 'EN' }];
}
