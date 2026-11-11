import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon } from '@grcup/ui';

/** Figma 75 «Éxito»: qué pasa ahora, en tres pasos. */
@Component({
  selector: 'gr-alta-exito',
  imports: [RouterLink, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-8" aria-labelledby="exito-t">
      <span class="flex size-16 items-center justify-center rounded-full bg-success text-white"><gr-icon name="check" [size]="28" /></span>
      <div>
        <h2 id="exito-t" class="text-display-s md:text-display-m">Qué pasa ahora</h2>
        <p class="mt-2 text-body-m text-text-secondary md:text-body-l">Esto es lo que va a pasar desde ahora.</p>
      </div>
      <ol class="-mt-6 grid items-start gap-4 md:grid-cols-3">
        @for (p of pasos; track p.n) {
          <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5">
            <span class="text-display-xs text-accent-text">{{ p.n }}</span>
            <span class="text-label-m">{{ p.t }}</span>
            <span class="text-body-s text-text-tertiary">{{ p.d }}</span>
          </li>
        }
      </ol>
      <p class="flex items-start gap-3 rounded-lg border border-info/40 bg-info/8 p-4 text-body-s text-text-secondary">
        <gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-info" />
        Revisa tu email: te hemos enviado la confirmación de tu solicitud. Si no la ves en unos minutos, mira en la carpeta de spam.
      </p>
      <div class="flex flex-col gap-3 sm:flex-row">
        <a grButton variant="primary" size="l" routerLink="/atletas">Ver atletas</a>
        <a grButton variant="outline" size="l" routerLink="/area-atleta">Ir al área de atleta</a>
      </div>
      <p class="text-body-s text-text-tertiary">¿Necesitas cambiar algo antes de que revisemos tu solicitud? Escríbenos a <a [href]="'mailto:' + contacto()" class="text-accent-text hover:underline">{{ contacto() }}</a>.</p>
    </section>
  `,
})
export class AltaExito {
  readonly contacto = input.required<string>();
  protected readonly pasos = [
    { n: '01', t: 'Revisión a mano', d: 'El equipo comprueba tu email contra la lista de inscritos de la AEP y revisa tus datos y tu foto.' },
    { n: '02', t: 'Email con el resultado', d: 'Te escribimos a tu email: si está aprobada, con el enlace a tu ficha; si falta algo, con la corrección que pedimos.' },
    { n: '03', t: 'Tu ficha en /atletas', d: 'Al aprobarla, tu ficha se publica en la lista de atletas y ya puedes editarla desde el área de atleta.' },
  ];
}
