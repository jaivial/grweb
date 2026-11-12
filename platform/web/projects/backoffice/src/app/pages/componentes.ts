import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { GrBadge, GrButton, GrField, GrIconButton, GrInput, type GrTone } from '@grcup/ui';
import { BoToggle } from '../shared/ui';

/** Figma 48 «BO · Componentes · base»: catalogue of every BO base component and state, for visual QA (root only). */
@Component({
  selector: 'bo-componentes-page',
  imports: [GrBadge, GrButton, GrField, GrIconButton, GrInput, BoToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-bg-base px-4 py-8 text-text-primary md:px-10' },
  template: `
    <h1 class="text-ui-h3 md:text-[28px]">BO · Componentes base</h1>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-btn">
      <h2 id="c-btn" class="text-ui-h5">Button</h2>
      @for (v of variants; track v) {
        <div class="flex flex-wrap items-center gap-3">
          <button grButton [variant]="v">{{ v }}</button>
          <button grButton [variant]="v" icon="plus">Con icono</button>
          <button grButton [variant]="v" [loading]="true">Cargando</button>
          <button grButton [variant]="v" [disabled]="true">Desactivado</button>
        </div>
      }
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-ib">
      <h2 id="c-ib" class="text-ui-h5">Icon button</h2>
      <div class="flex flex-wrap items-center gap-3">
        @for (k of iconKinds; track k) { <button grIconButton icon="pencil" [kind]="k" [label]="k"></button> }
        <button grIconButton icon="pencil" label="desactivado" disabled></button>
      </div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-badge">
      <h2 id="c-badge" class="text-ui-h5">Badge</h2>
      <div class="flex flex-wrap gap-2">@for (t of tones; track t) { <gr-badge [tone]="t">{{ t }}</gr-badge> }</div>
    </section>
    <section class="mt-8 grid max-w-xl gap-4" aria-labelledby="c-in">
      <h2 id="c-in" class="text-ui-h5">Input</h2>
      <gr-field label="Nombre" for="c1" hint="Texto de ayuda"><input grInput id="c1" placeholder="Placeholder" /></gr-field>
      <gr-field label="Email" for="c2" error="Email no válido"><input grInput id="c2" [invalid]="true" value="ana@" /></gr-field>
      <gr-field label="Desactivado" for="c3"><input grInput id="c3" disabled value="Bloqueado" /></gr-field>
      <gr-field label="Notas" for="c4" [optional]="true"><textarea grInput id="c4" rows="3"></textarea></gr-field>
    </section>
    <section class="mt-8 flex items-center gap-4" aria-labelledby="c-tg">
      <h2 id="c-tg" class="text-ui-h5">Toggle</h2>
      <bo-toggle label="Activo" [(value)]="on" />
      <bo-toggle label="Desactivado" [disabled]="true" />
    </section>
  `,
})
export class ComponentesPage {
  protected readonly variants = ['primary', 'secondary', 'ghost', 'danger'] as const;
  protected readonly iconKinds = ['ghost', 'secondary', 'primary', 'danger'] as const;
  protected readonly tones: GrTone[] = ['neutral', 'accent', 'success', 'warning', 'info', 'danger', 'live'];
  protected readonly on = signal(true);
}
