import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';

let seq = 0;

/** Figma 48 «BO / Tag input»: free tags (UTM, segments, SEO). Enter adds, Backspace on empty removes the last. Default · Focus · Error. */
@Component({
  selector: 'bo-tag-input',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    <label [attr.for]="id" class="text-label-s text-text-secondary">{{ label() }}</label>
    <div class="flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-bg-field p-2 transition-colors motion-reduce:transition-none"
      [class]="err() ? 'border-error' : 'border-line-strong hover:border-line-hover focus-within:border-accent'">
      @for (t of value(); track t) {
        <span class="flex h-7 items-center gap-1 rounded-xs bg-bg-raised px-1.5 text-mono-xs text-text-secondary">
          {{ t }}
          <button type="button" class="flex size-4 items-center justify-center rounded-2xs text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]"
            [attr.aria-label]="'Quitar ' + t" (click)="remove(t)"><gr-icon name="x" [size]="12" /></button>
        </span>
      }
      <input [id]="id" class="h-7 min-w-24 flex-1 bg-transparent text-body-s text-text-primary placeholder:text-text-muted focus:outline-none"
        placeholder="Añadir…" [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown)="key($event)" [attr.aria-invalid]="err() || null"
        [attr.aria-describedby]="id + '-h'" />
    </div>
    <p [id]="id + '-h'" class="text-body-xs" [class]="err() ? 'text-error' : 'text-text-tertiary'" [attr.role]="err() ? 'alert' : null">
      {{ err() || 'Intro para añadir · Retroceso para borrar' }}
    </p>
  `,
})
export class BoTagInput {
  readonly value = model<string[]>([]);
  readonly label = input.required<string>();
  readonly max = input(10);
  readonly error = input<string | null>(null);
  protected readonly id = `bo-tags-${++seq}`;
  protected readonly draft = signal('');
  private readonly full = signal(false);
  protected readonly err = computed(() => this.error() || (this.full() ? `Máximo ${this.max()} etiquetas` : ''));
  protected key(e: KeyboardEvent): void {
    const t = this.draft().trim().toLowerCase().replace(/\s+/g, '_');
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!t || this.value().includes(t)) return;
      if (this.value().length >= this.max()) return this.full.set(true);
      this.value.update((v) => [...v, t]);
      this.draft.set('');
    } else if (e.key === 'Backspace' && !this.draft() && this.value().length) {
      this.value.update((v) => v.slice(0, -1));
      this.full.set(false);
    }
  }
  protected remove(t: string): void {
    this.value.update((v) => v.filter((x) => x !== t));
    this.full.set(false);
  }
}
