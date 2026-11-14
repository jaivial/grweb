import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';

/** Preguntas frecuentes del alta (también van al JSON-LD FAQPage). */
export const FAQS = [
  { q: '¿Cuánto tarda la revisión de mi alta?', a: 'El equipo revisa cada solicitud a mano; te avisamos por email cuando tu ficha esté publicada.' },
  { q: '¿Puedo editar mi perfil después de darlo de alta?', a: 'Sí. Cuando tu alta esté aprobada podrás editar foto, marcas y presentación desde el área de atleta.' },
  { q: '¿Tiene coste darse de alta como atleta?', a: 'No. El alta es gratuita y se hace una sola vez.' },
  { q: '¿El alta es una inscripción en la competición?', a: 'No. Tu plaza ya está gestionada; el alta solo crea tu ficha pública de atleta en la web.' },
  { q: '¿Qué necesito para darme de alta?', a: 'El email con el que te inscribiste, tus datos de competidor y, si quieres, una foto y tus mejores marcas. Son menos de cinco minutos.' },
  { q: '¿Para qué sirve mi ficha de atleta?', a: 'Te muestra en /atletas, en el marcador y en el directo, y permite que el público te siga y cree su horario.' },
  { q: '¿Cómo se publica mi foto?', a: 'En blanco y negro, recortada a 4:5 y comprimida, para que todas las fichas sean uniformes.' },
  { q: '¿Quién ve mis datos?', a: 'Solo se publica lo deportivo (nombre, club, ciudad, categoría, marcas y foto). Tu email y tu teléfono nunca se muestran.' },
  { q: '¿Dónde leo los textos legales o resuelvo dudas?', a: 'Los términos, la privacidad y el consentimiento de imagen están enlazados en el formulario. Para cualquier duda, escribe a contacto@grstrength.com.' },
];

/** Figma 75: «Preguntas rápidas». */
@Component({
  selector: 'gr-alta-faq',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-18 flex flex-col gap-6 md:mt-24">
      <div>
        <p class="sr-only">Preguntas rápidas</p>
        <h2 class="text-display-s md:text-display-m">Tu ficha de atleta en la competición de powerlifting de <span class="text-accent-text">Valencia</span></h2>
      </div>
      <ul class="flex flex-col gap-3">
        @for (f of faqs; track f.q; let i = $index) {
          <li class="rounded-lg border border-line-subtle bg-bg-card" [class.border-accent]="abierta() === i">
            <button type="button" class="flex w-full items-center gap-4 px-5 py-5 text-left text-ui-h5" [attr.aria-expanded]="abierta() === i" [attr.aria-controls]="'faq-alta-' + i" (click)="abierta.set(abierta() === i ? -1 : i)">
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
  protected readonly abierta = signal(0);
}
