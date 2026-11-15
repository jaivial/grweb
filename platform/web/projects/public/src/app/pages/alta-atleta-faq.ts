import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { I18n } from '../core/i18n';

/** Preguntas frecuentes del alta (también van al JSON-LD FAQPage). */
const FAQS_ES = [
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
export const FAQS = {
  es: FAQS_ES,
  en: [
    { q: 'How long does the review of my sign-up take?', a: "The team reviews every request by hand; we'll let you know by email when your profile is published." },
    { q: 'Can I edit my profile after signing up?', a: 'Yes. Once your sign-up is approved you can edit your photo, lifts and bio from the athlete area.' },
    { q: 'Does it cost anything to sign up as an athlete?', a: 'No. Signing up is free and you only do it once.' },
    { q: 'Is signing up the same as entering the competition?', a: 'No. Your place is already sorted; signing up only creates your public athlete profile on the website.' },
    { q: 'What do I need to sign up?', a: 'The email you entered with, your competitor details and, if you like, a photo and your best lifts. It takes less than five minutes.' },
    { q: 'What is my athlete profile for?', a: 'It shows you on /atletas, on the scoreboard and in the live stream, and lets the public follow you and build their schedule.' },
    { q: 'How is my photo published?', a: 'In black and white, cropped to 4:5 and compressed, so that all profiles look the same.' },
    { q: 'Who can see my details?', a: 'Only sporting details are published (name, club, city, category, lifts and photo). Your email and phone number are never shown.' },
    { q: 'Where can I read the legal texts or ask questions?', a: 'The terms, the privacy policy and the image consent are linked in the form. For any questions, write to contacto@grstrength.com.' },
  ] as typeof FAQS_ES,
};

const T = {
  es: { rapidas: 'Preguntas rápidas', titulo: 'Tu ficha de atleta en la competición de powerlifting de ', ciudad: 'Valencia' },
  en: { rapidas: 'Quick questions', titulo: 'Your athlete profile at the powerlifting competition in ', ciudad: 'Valencia' },
};

/** Figma 75: «Preguntas rápidas». */
@Component({
  selector: 'gr-alta-faq',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-18 flex flex-col gap-6 md:mt-24">
      <div>
        <p class="sr-only">{{ t().rapidas }}</p>
        <h2 class="text-display-s md:text-display-m">{{ t().titulo }}<span class="text-accent-text">{{ t().ciudad }}</span></h2>
      </div>
      <ul class="flex flex-col gap-3">
        @for (f of faqs(); track f.q; let i = $index) {
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
  protected readonly t = inject(I18n).dict(T);
  protected readonly faqs = inject(I18n).dict(FAQS);
  protected readonly abierta = signal(0);
}
