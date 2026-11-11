import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';

/** Preguntas frecuentes del alta (también van al JSON-LD FAQPage). */
export const FAQS = [
  { q: '¿Cuánto tarda la revisión de mi alta?', a: 'El equipo revisa cada solicitud a mano; te avisamos por email cuando tu ficha esté publicada.' },
  { q: '¿Puedo editar mi perfil después de darlo de alta?', a: 'Sí. Después podrás editar tu perfil desde el área de atleta.' },
  { q: '¿Tiene coste darse de alta como atleta?', a: 'No. El alta es gratuita; la inscripción y la licencia las gestiona la AEP.' },
];

/** Figma 75: «Preguntas rápidas». */
@Component({
  selector: 'gr-alta-faq',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-18 flex flex-col gap-6 md:mt-24">
      <div>
        <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase"><span class="h-px w-6 bg-accent"></span>Preguntas rápidas</p>
        <h2 class="mt-3 text-display-s md:text-display-l">Tu ficha de atleta en la competición de powerlifting de <span class="text-accent-text">Valencia</span></h2>
        <p class="mt-4 max-w-[900px] text-body-m text-text-tertiary md:text-body-l">{{ introH22 }}</p>
      </div>
      <ul class="flex flex-col gap-3">
        @for (f of faqs; track f.q; let i = $index) {
          <li class="rounded-lg border border-line-subtle bg-bg-card" [class.border-accent]="abierta() === i">
            <button type="button" class="flex w-full items-center gap-4 px-5 py-4 text-left text-label-l" [attr.aria-expanded]="abierta() === i" [attr.aria-controls]="'faq-alta-' + i" (click)="abierta.set(abierta() === i ? -1 : i)">
              <span class="flex-1">{{ f.q }}</span>
              <span class="flex size-8 shrink-0 items-center justify-center rounded-full" [class]="abierta() === i ? 'bg-accent/15 text-accent-text' : 'bg-white/5 text-text-secondary'"><gr-icon [name]="abierta() === i ? 'minus' : 'plus'" [size]="16" /></span>
            </button>
            @if (abierta() === i) { <p [id]="'faq-alta-' + i" class="px-5 pb-5 text-body-m text-text-tertiary">{{ f.a }}</p> }
          </li>
        }
      </ul>
    </section>
  `,
})
export class AltaFaq {
  protected readonly faqs = FAQS;
  protected readonly abierta = signal(-1);
  protected readonly introH22 =
    'La GR Strength Cup se celebra en el pabellón municipal de Almussafes, a 20 km de Valencia, con jueces oficiales de la AEP. Tu ficha de atleta trabaja durante toda la jornada: alimenta el seguimiento de los espectadores (cada seguidor genera su horario con tus intentos), aparece en el directo con tus datos y marcas cuando estás en plataforma, y es la referencia de la porra y el fantasy, donde el público pronostica tus totales. Rellena el formulario de alta antes del pesaje: así tu ficha está completa cuando se publiquen los flights y nadie te busque en vano.';
}
