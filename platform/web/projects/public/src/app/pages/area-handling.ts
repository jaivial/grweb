import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton, confetti } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { AREA_API } from '../core/area';
import { textoError } from '../core/errores';
import { I18n, LocPipe } from '../core/i18n';

/** Estado de la solicitud de handling gratis del atleta (GET/POST /api/area-atleta/handling). */
interface Estado {
  estado: 'ninguna' | 'pendiente' | 'revision' | 'aprobada' | 'rechazada';
  fecha?: string;
  motivo?: string;
}

const T = {
  es: {
    volver: 'Mi área', h1: 'Handling gratis',
    pregunta: '¿Necesitas handler?',
    texto: 'El equipo de GR Strength te acompaña en la competición: te ayuda con las alturas, los intentos y los tiempos del día. Es gratis.',
    pedir: 'Solicitar handling',
    ok: '¡Recibido! El equipo de GR Strength ha recibido tu interés y se pondrá en contacto contigo pronto.',
    revision: 'Tu solicitud está en revisión',
    revisionTxt: 'El equipo de GR Strength la revisa y se pondrá en contacto contigo.',
    aprobada: '¡Ya tienes handler!',
    aprobadaTxt: 'Tu solicitud de handling ha sido aprobada: el equipo de GR Strength se pondrá en contacto contigo para organizar el día.',
    rechazada: 'No podemos asignarte handler',
    rechazadaTxt: 'Tu inscripción sigue en vigor: esto no afecta a tu participación. Si crees que es un error, escríbenos.',
    motivo: 'Motivo', pedida: 'Solicitada el', error: 'No se ha podido enviar la solicitud. Inténtalo otra vez.',
    cargando: 'Cargando tu solicitud',
  },
  en: {
    volver: 'My area', h1: 'Free handling',
    pregunta: 'Do you need a handler?',
    texto: 'The GR Strength team is with you at the competition: they help with rack heights, attempts and the timing of the day. It is free.',
    pedir: 'Request handling',
    ok: 'Got it! The GR Strength team has your request and will get in touch with you soon.',
    revision: 'Your request is under review',
    revisionTxt: 'The GR Strength team is reviewing it and will get in touch with you.',
    aprobada: 'You have a handler!',
    aprobadaTxt: 'Your handling request has been approved: the GR Strength team will get in touch with you to arrange the day.',
    rechazada: "We can't assign you a handler",
    rechazadaTxt: 'Your entry is still valid: this does not affect your participation. If you think it is a mistake, write to us.',
    motivo: 'Reason', pedida: 'Requested on', error: "The request couldn't be sent. Please try again.",
    cargando: 'Loading your request',
  },
};

/** «Handling gratis» del área de atleta: pedirlo y seguir su estado (pendiente · aprobada · rechazada). */
@Component({
  selector: 'gr-area-handling',
  imports: [RouterLink, LocPipe, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-xl">
      <a [routerLink]="'/area-atleta' | loc" class="mb-4 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent"><gr-icon name="chevron-left" [size]="16" />{{ t().volver }}</a>
      <h1 class="text-display-xs outline-none md:text-display-m" tabindex="-1">{{ t().h1 }}</h1>

      @if (!e()) {
        <gr-skeleton class="mt-5 h-40 rounded-lg" />
        <span class="sr-only">{{ t().cargando }}</span>
      } @else {
        <section class="mt-5 flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
          @switch (e()!.estado) {
            @case ('ninguna') {
              <div class="flex items-start gap-3">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon name="users" [size]="20" /></span>
                <div class="min-w-0">
                  <h2 class="text-ui-h5">{{ t().pregunta }}</h2>
                  <p class="mt-1 text-body-s text-text-tertiary">{{ t().texto }}</p>
                </div>
              </div>
              <button grButton variant="primary" size="l" class="self-start max-sm:w-full" [loading]="enviando()" [disabled]="enviando()" (click)="pedir()">{{ t().pedir }}</button>
            }
            @case ('pendiente') {
              <p class="flex items-start gap-3 text-body-m"><gr-icon name="hourglass" [size]="22" class="mt-0.5 shrink-0 text-warning" /><span><span class="block text-label-m">{{ t().revision }}</span><span class="block text-text-tertiary">{{ t().revisionTxt }}</span></span></p>
            }
            @case ('aprobada') {
              <p class="flex items-start gap-3 text-body-m"><gr-icon name="circle-check" [size]="22" class="mt-0.5 shrink-0 text-success" /><span><span class="block text-label-m text-success">{{ t().aprobada }}</span><span class="block text-text-tertiary">{{ t().aprobadaTxt }}</span></span></p>
            }
            @case ('rechazada') {
              <p class="flex items-start gap-3 text-body-m"><gr-icon name="frown" [size]="22" class="mt-0.5 shrink-0 text-text-tertiary" /><span><span class="block text-label-m">{{ t().rechazada }}</span><span class="block text-text-tertiary">{{ t().rechazadaTxt }}</span></span></p>
              @if (e()!.motivo) {
                <p class="rounded-md border border-line-subtle bg-bg-raised px-4 py-3 text-body-s"><span class="block text-label-xs text-text-tertiary uppercase">{{ t().motivo }}</span>{{ e()!.motivo }}</p>
              }
              <button grButton class="self-start max-sm:w-full" [loading]="enviando()" [disabled]="enviando()" (click)="pedir()">{{ t().pedir }}</button>
            }
          }
          @if (aviso(); as a) { <p class="text-body-s text-accent-text" role="alert">{{ a }}</p> }
          @if (e()!.fecha && e()!.estado !== 'ninguna') { <p class="text-body-xs text-text-tertiary">{{ t().pedida }} {{ fecha() }}</p> }
        </section>
      }
    </div>
  `,
})
export class AreaHandlingPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly e = signal<Estado | null>(null);
  protected readonly enviando = signal(false);
  protected readonly aviso = signal('');

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.e.set(await firstValueFrom(this.http.get<Estado>(`${AREA_API}/handling`)));
    } catch {
      this.e.set({ estado: 'ninguna' }); // sin estado no se bloquea: el POST dirá si ya había una solicitud
    }
  }

  protected async pedir(): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(true);
    this.aviso.set('');
    try {
      this.e.set(await firstValueFrom(this.http.post<Estado>(`${AREA_API}/handling`, {})));
      confetti();
      this.aviso.set(this.t().ok);
    } catch (err) {
      this.aviso.set(textoError(err, this.t().error, this.i18n.lang()));
      await this.cargar();
    } finally {
      this.enviando.set(false);
    }
  }

  /** «19 dic 2026» de la fecha de la solicitud. */
  protected fecha(): string {
    const f = this.e()?.fecha;
    if (!f) return '';
    return new Intl.DateTimeFormat(this.i18n.lang() === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(f));
  }
}
