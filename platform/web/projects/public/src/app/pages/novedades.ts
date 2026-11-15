import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GrIcon, GrSkeleton } from '@grcup/ui';
import { Novedades, mensajeError, type BajaInfo } from '../core/novedades';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';

const T = {
  es: {
    novedades: 'Novedades', confirmarSus: 'Confirmar suscripción', confirmada: '¡Suscripción confirmada!',
    escribiremos: (email: string) => `Te escribiremos a ${email} con fechas, horarios, sorteo y próximas competiciones. Un email al mes como mucho; cada uno lleva su enlace de baja.`,
    volver: 'Volver a la web', noVale: 'El enlace no vale', resuscribir: 'Puedes suscribirte de nuevo desde el pie de cualquier página.',
    seoConfTitulo: 'Confirmar suscripción · GR Strength Cup', seoConfDesc: 'Confirma que quieres recibir las novedades.',
    caducadoUsado: 'Ha caducado o ya se usó.',
    darteBaja: 'Darte de baja', baja: 'Baja', hecho: 'Hecho',
    yaNo: (destino: string, texto: string) => `${destino} ya no recibirá ${texto}. Los emails operativos de una entrada o inscripción tuya sí te seguirán llegando.`,
    dejar: (texto: string) => `¿Dejar de recibir ${texto}?`,
    para: (destino: string) => `Para ${destino}. Puedes volver a suscribirte cuando quieras.`,
    momento: 'Un momento…', darme: 'Darme de baja',
    seoBajaTitulo: 'Darte de baja · GR Strength Cup', seoBajaDesc: 'Deja de recibir emails de la GR Strength Cup.',
    caducadoInvalido: 'Ha caducado o no es válido.', errorDef: 'No hemos podido completarlo. Inténtalo en unos minutos.',
  },
  en: {
    novedades: 'News', confirmarSus: 'Confirm subscription', confirmada: 'Subscription confirmed!',
    escribiremos: (email: string) => `We’ll write to ${email} with dates, schedules, the prize draw and upcoming competitions. One email a month at most; each one includes an unsubscribe link.`,
    volver: 'Back to the website', noVale: 'This link isn’t valid', resuscribir: 'You can subscribe again from the footer of any page.',
    seoConfTitulo: 'Confirm subscription · GR Strength Cup', seoConfDesc: 'Confirm that you want to receive our news.',
    caducadoUsado: 'It has expired or has already been used.',
    darteBaja: 'Unsubscribe', baja: 'Unsubscribe', hecho: 'Done',
    yaNo: (destino: string, texto: string) => `${destino} will no longer receive ${texto}. You’ll still get the operational emails about your tickets or registrations.`,
    dejar: (texto: string) => `Stop receiving ${texto}?`,
    para: (destino: string) => `For ${destino}. You can subscribe again whenever you like.`,
    momento: 'One moment…', darme: 'Unsubscribe me',
    seoBajaTitulo: 'Unsubscribe · GR Strength Cup', seoBajaDesc: 'Stop receiving emails from the GR Strength Cup.',
    caducadoInvalido: 'It has expired or isn’t valid.', errorDef: 'We couldn’t complete it. Please try again in a few minutes.',
  },
};

/** /novedades/confirmar?t= (double opt-in link of the email). Confirms in the browser only (link scanners never confirm). */
@Component({
  selector: 'gr-novedades-confirmar',
  imports: [RouterLink, LocPipe, Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().novedades" [crumb]="t().confirmarSus">
      <div class="mx-auto max-w-lg">
        @switch (estado()) {
          @case ('cargando') { <gr-skeleton class="h-48 rounded-xl" /> }
          @case ('listo') {
            <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
              <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="26" /></span>
              <h2 class="text-display-2xs">{{ t().confirmada }}</h2>
              <p class="text-body-m text-text-secondary">{{ t().escribiremos(email()) }}</p>
              <a [routerLink]="'/' | loc" class="mt-2 inline-flex h-11 items-center gap-2 rounded-sm bg-accent-grain px-5 text-label-s text-white">{{ t().volver }}<gr-icon name="arrow-right" [size]="16" /></a>
            </section>
          }
          @default {
            <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
              <span class="flex size-14 items-center justify-center rounded-full bg-accent-deep/40 text-accent-text"><gr-icon name="circle-alert" [size]="26" /></span>
              <h2 class="text-display-2xs">{{ t().noVale }}</h2>
              <p class="text-body-m text-text-secondary">{{ error() }} {{ t().resuscribir }}</p>
            </section>
          }
        }
      </div>
    </gr-page>
  `,
})
export class NovedadesConfirmarPage {
  private readonly api = inject(Novedades);
  protected readonly t = inject(I18n).dict(T);
  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly email = signal('');
  protected readonly error = signal('');

  constructor() {
    inject(Seo).set({ title: this.t().seoConfTitulo, description: this.t().seoConfDesc, path: '/novedades/confirmar', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const t = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    void this.api.confirmar(t).then(
      (e) => {
        this.email.set(e);
        this.estado.set('listo');
      },
      (e) => {
        this.error.set(mensajeError(e, this.t().caducadoUsado));
        this.estado.set('error');
      },
    );
  }
}

/** /baja?t= (unsubscribe link of an email): shows what it unsubscribes and asks for one click. */
@Component({
  selector: 'gr-baja',
  imports: [Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().darteBaja" [crumb]="t().baja">
      <div class="mx-auto max-w-lg">
        @let i = info();
        @if (i === undefined) { <gr-skeleton class="h-48 rounded-xl" /> }
        @else if (i === null) {
          <section class="rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center"><h2 class="text-display-2xs">{{ t().noVale }}</h2><p class="mt-3 text-body-m text-text-secondary">{{ error() }}</p></section>
        } @else if (i.baja) {
          <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
            <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="26" /></span>
            <h2 class="text-display-2xs">{{ t().hecho }}</h2>
            <p class="text-body-m text-text-secondary">{{ t().yaNo(i.destino, i.texto) }}</p>
          </section>
        } @else {
          <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
            <span class="flex size-14 items-center justify-center rounded-full bg-accent-deep/40 text-accent-text"><gr-icon name="mail" [size]="24" /></span>
            <h2 class="text-display-2xs">{{ t().dejar(i.texto) }}</h2>
            <p class="text-body-m text-text-secondary">{{ t().para(i.destino) }}</p>
            <button type="button" class="mt-2 h-12 rounded-sm bg-accent-grain px-6 text-label-m text-white disabled:opacity-60" [disabled]="enviando()" (click)="confirmar()">{{ enviando() ? t().momento : t().darme }}</button>
            @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
          </section>
        }
      </div>
    </gr-page>
  `,
})
export class BajaPage {
  private readonly api = inject(Novedades);
  protected readonly t = inject(I18n).dict(T);
  protected readonly info = signal<BajaInfo | null | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  private readonly token: string;

  constructor() {
    inject(Seo).set({ title: this.t().seoBajaTitulo, description: this.t().seoBajaDesc, path: '/baja', robots: 'noindex' });
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.api.bajaInfo(this.token).then(
      (i) => this.info.set(i),
      (e) => {
        this.error.set(mensajeError(e, this.t().caducadoInvalido));
        this.info.set(null);
      },
    );
  }

  protected async confirmar(): Promise<void> {
    this.enviando.set(true);
    this.error.set('');
    try {
      this.info.set(await this.api.baja(this.token));
    } catch (e) {
      this.error.set(mensajeError(e, this.t().errorDef));
    } finally {
      this.enviando.set(false);
    }
  }
}
