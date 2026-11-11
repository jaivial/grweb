import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GrIcon } from '@grcup/ui';

/** Los textos del bloque de ayuda (columna derecha). */
const AYUDA = [
  'El email con el que te inscribiste en la AEP',
  'Una foto tuya: recomendada; la publicamos en blanco y negro',
  'Tus mejores marcas, si las tienes (opcional)',
];

/** Figma 75: la columna «Resumen y ayuda» con el total de las marcas en vivo. */
@Component({
  selector: 'gr-alta-ayuda',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <aside class="flex flex-col gap-6 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-6 lg:sticky lg:top-24" aria-label="Resumen y ayuda">
      <h2 class="text-display-xs italic md:text-display-s md:text-[32px]">Resumen y ayuda</h2>
      <div class="flex items-start gap-3 rounded-md border border-info/30 bg-info/8 p-4">
        <gr-icon name="zap" [size]="18" class="mt-0.5 shrink-0 text-info" />
        <div class="min-w-0">
          <p class="text-label-s text-info">El alta no es una inscripción</p>
          <p class="mt-1 text-body-s text-text-secondary">Tu plaza ya la gestionó la AEP. Aquí completas tu ficha pública.</p>
        </div>
      </div>
      <div>
        <p class="text-label-s uppercase">Qué necesitas</p>
        <ul class="mt-3 flex flex-col gap-2">
          @for (a of ayuda; track a) {
            <li class="flex items-start gap-2 text-body-s text-text-secondary"><span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ a }}</li>
          }
        </ul>
      </div>
      <div class="rounded-[10px] bg-bg-raised p-4">
        <p class="text-label-xs text-text-tertiary uppercase">Total en vivo</p>
        @for (m of marcas(); track m.k) {
          <p class="mt-2 flex items-center justify-between gap-4 text-body-s text-text-secondary"><span>{{ m.c }} · {{ m.n }}</span><span class="tabular-nums text-text-tertiary">{{ m.v ?? '–' }}</span></p>
        }
        <p class="mt-2 flex items-center justify-between gap-4 border-t border-line-subtle pt-2 text-label-m"><span>Total</span><span class="tabular-nums" [class]="total() === null ? 'text-text-tertiary' : 'text-accent-text'">{{ total() === null ? '–' : total() }}</span></p>
      </div>
      <div>
        <p class="text-label-s uppercase">Textos legales</p>
        <ul class="mt-3 flex flex-col gap-2 text-body-s">
          <li><a href="/terminos" target="_blank" rel="noopener" class="text-accent-text hover:underline">Términos de uso y reglamento</a></li>
          <li><a href="/privacidad" target="_blank" rel="noopener" class="text-accent-text hover:underline">Política de privacidad</a></li>
          @if (imagen()) { <li><a href="/consentimiento-datos" target="_blank" rel="noopener" class="text-accent-text hover:underline">Consentimiento de imagen</a></li> }
          @if (whatsapp()) { <li><a href="/texto-whatsapp" target="_blank" rel="noopener" class="text-accent-text hover:underline">Texto de WhatsApp</a></li> }
        </ul>
      </div>
      <p class="text-body-s text-text-tertiary">¿Dudas? Escribe a <a [href]="'mailto:' + contacto()" class="text-accent-text hover:underline">{{ contacto() }}</a></p>
    </aside>
  `,
})
export class AltaAyuda {
  readonly contacto = input.required<string>();
  readonly marcas = input.required<{ k: string; c: string; n: string; v: string | null }[]>();
  readonly total = input<string | null>(null);
  readonly imagen = input(false);
  readonly whatsapp = input(false);
  protected readonly ayuda = AYUDA;
}
