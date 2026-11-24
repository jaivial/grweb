import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon } from '@grcup/ui';
import { I18n, LocPipe } from '../core/i18n';

const T = {
  es: {
    titulo: 'Qué pasa ahora', sub: 'Esto es lo que va a pasar desde ahora.',
    email: 'Revisa tu email: te hemos enviado la confirmación de tu solicitud. Si no la ves en unos minutos, mira en la carpeta de spam.',
    atletas: 'Ver atletas', area: 'Ir al área de atleta', cambiar: '¿Necesitas cambiar algo antes de que revisemos tu solicitud? Escríbenos a', fin: '.',
    revision: 'Revisión a mano', revisionD: (foto: boolean) => 'El equipo revisa a mano los datos de tu alta' + (foto ? ' y tu foto.' : '.'),
    tutor: 'Autorización del tutor', tutorD: (c: string) => 'Eres menor de edad: necesitamos la autorización firmada de tu madre, padre o tutor. Te la pediremos por email; también puedes enviarla a ' + c + '. Sin ella no podemos aprobar tu alta.',
    resultado: 'Email con el resultado', resultadoD: 'Te escribimos a tu email: si está aprobada, con el acceso a tu área de atleta; si falta algo, con la corrección que pedimos.',
    privada: 'Tu ficha, privada', privadaD: 'Al aprobarla tu ficha queda privada: no aparece en /atletas hasta que actives su publicación desde el área de atleta.',
  },
  en: {
    titulo: 'What happens next', sub: "Here's what happens from now on.",
    email: "Check your email: we've sent you confirmation of your request. If you can't see it within a few minutes, look in your spam folder.",
    atletas: 'View athletes', area: 'Go to the athlete area', cambiar: 'Need to change something before we review your request? Write to us at', fin: '.',
    revision: 'Manual review', revisionD: (foto: boolean) => 'The team manually reviews your sign-up details' + (foto ? ' and your photo.' : '.'),
    tutor: "Guardian's authorisation", tutorD: (c: string) => "You're under 18: we need an authorisation signed by your mother, father or guardian. We'll ask for it by email; you can also send it to " + c + ". Without it we can't approve your sign-up.",
    resultado: 'Email with the outcome', resultadoD: "We'll write to your email: if approved, with access to your athlete area; if something is missing, with the correction we need.",
    privada: 'Your profile, private', privadaD: "Once approved your profile stays private: it won't appear on /atletas until you turn on publishing from the athlete area.",
  },
};

/** Figma 75 «Éxito»: qué pasa ahora, paso a paso. */
@Component({
  selector: 'gr-alta-exito',
  imports: [RouterLink, GrButton, GrIcon, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-8" aria-labelledby="exito-t">
      <span class="flex size-16 items-center justify-center self-center rounded-full bg-success text-white"><gr-icon name="check" [size]="28" /></span>
      <div class="text-center">
        <h2 id="exito-t" class="text-display-s md:text-display-m">{{ t().titulo }}</h2>
        <p class="mt-2 text-body-m text-text-secondary md:text-body-l">{{ t().sub }}</p>
      </div>
      <ol class="-mt-6 grid items-start gap-4" [class]="pasos().length === 4 ? 'md:grid-cols-2' : 'md:grid-cols-3'">
        @for (p of pasos(); track p.n) {
          <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5">
            <span class="text-display-xs text-accent-text">{{ p.n }}</span>
            <span class="text-label-m">{{ p.t }}</span>
            <span class="text-body-s text-text-tertiary">{{ p.d }}</span>
          </li>
        }
      </ol>
      <p class="flex items-start gap-3 rounded-lg border border-info/40 bg-info/8 p-4 text-body-s text-text-secondary">
        <gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-info" />
        {{ t().email }}
      </p>
      <div class="flex flex-col gap-3 sm:flex-row">
        <a grButton variant="primary" size="l" [routerLink]="'/atletas' | loc">{{ t().atletas }}</a>
        <a grButton variant="outline" size="l" [routerLink]="'/area-atleta' | loc">{{ t().area }}</a>
      </div>
      <p class="text-body-s text-text-tertiary">{{ t().cambiar }} <a [href]="'mailto:' + contacto()" class="text-accent-text hover:underline">{{ contacto() }}</a>{{ t().fin }}</p>
    </section>
  `,
})
export class AltaExito {
  readonly contacto = input.required<string>();
  /** The request has a photo: only then the review mentions it. */
  readonly foto = input(false);
  /** The athlete is a minor: the signed authorisation of the guardian is needed before approving. */
  readonly menor = input(false);
  protected readonly t = inject(I18n).dict(T);
  protected readonly pasos = computed(() => {
    const t = this.t();
    const p: { t: string; d: string }[] = [
      { t: t.revision, d: t.revisionD(this.foto()) },
    ];
    if (this.menor()) {
      p.push({ t: t.tutor, d: t.tutorD(this.contacto()) });
    }
    // A new profile always stays private until the athlete activates its publication (as the backend).
    p.push({ t: t.resultado, d: t.resultadoD });
    p.push({ t: t.privada, d: t.privadaD });
    return p.map((x, i) => ({ n: String(i + 1).padStart(2, '0'), ...x }));
  });
}
