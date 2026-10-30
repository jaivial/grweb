import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Section heading with eyebrow and a red accent part (Figma «Section header»). */
@Component({
  selector: 'gr-section-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (eyebrow()) { <p class="flex items-center gap-3 text-mono-xs text-text-tertiary" [class.justify-center]="center()"><span class="h-px w-8 bg-accent"></span>{{ eyebrow() }}</p> }
    <h2 class="mt-3 text-display-s md:text-display-l" [class.text-center]="center()">{{ titulo() }} @if (acento()) { <span class="text-accent-text">{{ acento() }}</span> }</h2>
  `,
})
export class SectionTitle {
  readonly eyebrow = input('');
  readonly titulo = input('');
  readonly acento = input('');
  readonly center = input(false);
}
