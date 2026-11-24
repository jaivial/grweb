import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GrButton } from '@grcup/ui';
import type { Seccion } from '../core/cms';
import { I18n } from '../core/i18n';
import { ANCHO, GLOW, GrCabecera, SECCION } from './bloques';

const T = {
  es: {
    eyebrow: "What's next", titulo: 'Competiciones', fecha: 'Abril 2027', lugar: 'Almussafes (Valencia)', nombre: 'Nombre por revelar',
    texto: 'RESERVA TU PLAZA DE ESTA COMPETICIÓN A UN PRECIO REDUCIDO. ¡LLEVAMOS YA DOS CAMPEONATOS SOLD OUT!',
    reservar: 'Reservar mi plaza · 40 €', pronto: 'Reservar mi plaza · próximamente',
  },
  en: {
    eyebrow: "What's next", titulo: 'Competitions', fecha: 'April 2027', lugar: 'Almussafes (Valencia)', nombre: 'Name to be revealed',
    texto: 'BOOK YOUR SPOT IN THIS COMPETITION AT A REDUCED PRICE. WE HAVE ALREADY SOLD OUT TWO CHAMPIONSHIPS!',
    reservar: 'Book my spot · €40', pronto: 'Book my spot · coming soon',
  },
};

/**
 * BIZ-164 «What's next · Competiciones»: the mystery competition (April 2027, Almussafes, name still secret) with a
 * 40 € reservation. The button goes to a Stripe Payment Link set in the CMS (home section «competiciones», field
 * «reservaUrl»); without it the button stays disabled («próximamente»).
 */
@Component({
  selector: 'gr-sec-competiciones',
  imports: [GrButton, GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base', id: 'competiciones' },
  template: `
    <div [class]="glow + ' top-10 left-1/2 size-[320px] -translate-x-1/2 md:size-[560px]'"></div>
    <div [class]="ancho + ' flex flex-col items-center gap-8 text-center md:gap-10'">
      <gr-cabecera [eyebrow]="$any(s()['eyebrow']) || t().eyebrow" [titulo]="$any(s()['titulo']) || t().titulo" />
      <article class="relative flex w-full max-w-[720px] flex-col items-center gap-5 overflow-hidden rounded-lg border border-line-subtle bg-white/[0.03] px-5 py-10 md:px-12 md:py-14">
        <span class="font-display text-[64px] leading-none text-accent-text select-none md:text-[96px]" aria-hidden="true">?</span>
        <h3 class="font-display text-[28px] leading-[1.2] tracking-[0.12em] text-text-primary uppercase md:text-[40px]">
          <span aria-hidden="true">? ? ? ? ? ?</span><span class="sr-only">{{ t().nombre }}</span>
        </h3>
        <p class="flex flex-col items-center gap-1">
          <span class="font-archivo text-[14px] leading-[18px] font-extrabold tracking-[0.08em] text-text-primary uppercase md:text-[16px] md:leading-5">{{ t().fecha }}</span>
          <span class="font-archivo text-[11px] leading-[14px] font-medium tracking-[0.08em] text-text-secondary uppercase md:text-[14px] md:leading-5">{{ t().lugar }}</span>
        </p>
        <p class="max-w-[560px] text-label-m text-text-secondary">{{ t().texto }}</p>
        @if (url()) {
          <a grButton variant="primary" size="l" [href]="url()" target="_blank" rel="noopener">{{ t().reservar }}</a>
        } @else {
          <button grButton variant="primary" size="l" type="button" [disabled]="true">{{ t().pronto }}</button>
        }
      </article>
    </div>
  `,
})
export class SecCompeticiones {
  protected readonly t = inject(I18n).dict(T);
  readonly s = input<Seccion>({});
  /** Only an https Stripe Payment Link is accepted. */
  protected readonly url = computed(() => {
    const u = String(this.s()['reservaUrl'] ?? '').trim();
    return /^https:\/\/(buy|checkout)\.stripe\.com\//.test(u) ? u : '';
  });
  protected readonly glow = GLOW;
  protected readonly ancho = ANCHO;
}

