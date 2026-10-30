import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GrIcon, GrSkeleton } from '@grcup/ui';
import { Novedades, mensajeError, type BajaInfo } from '../core/novedades';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';

/** /novedades/confirmar?t= (double opt-in link of the email). Confirms in the browser only (link scanners never confirm). */
@Component({
  selector: 'gr-novedades-confirmar',
  imports: [Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Novedades" crumb="Confirmar suscripción">
      <div class="mx-auto max-w-lg">
        @switch (estado()) {
          @case ('cargando') { <gr-skeleton class="h-48 rounded-xl" /> }
          @case ('listo') {
            <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
              <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="26" /></span>
              <h2 class="text-display-2xs">¡Suscripción confirmada!</h2>
              <p class="text-body-m text-text-secondary">Te escribiremos a {{ email() }} con fechas, horarios, sorteo y próximas competiciones. Un email al mes como mucho; cada uno lleva su enlace de baja.</p>
              <a href="/" class="mt-2 inline-flex h-11 items-center gap-2 rounded-sm bg-accent-grain px-5 text-label-s text-white">Volver a la web<gr-icon name="arrow-right" [size]="16" /></a>
            </section>
          }
          @default {
            <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
              <span class="flex size-14 items-center justify-center rounded-full bg-accent-deep/40 text-accent-text"><gr-icon name="circle-alert" [size]="26" /></span>
              <h2 class="text-display-2xs">El enlace no vale</h2>
              <p class="text-body-m text-text-secondary">{{ error() }} Puedes suscribirte de nuevo desde el pie de cualquier página.</p>
            </section>
          }
        }
      </div>
    </gr-page>
  `,
})
export class NovedadesConfirmarPage {
  private readonly api = inject(Novedades);
  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly email = signal('');
  protected readonly error = signal('');

  constructor() {
    inject(Seo).set({ title: 'Confirmar suscripción · GR Strength Cup', description: 'Confirma que quieres recibir las novedades.', path: '/novedades/confirmar', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const t = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    void this.api.confirmar(t).then(
      (e) => {
        this.email.set(e);
        this.estado.set('listo');
      },
      (e) => {
        this.error.set(mensajeError(e, 'Ha caducado o ya se usó.'));
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
    <gr-page title="Darte de baja" crumb="Baja">
      <div class="mx-auto max-w-lg">
        @let i = info();
        @if (i === undefined) { <gr-skeleton class="h-48 rounded-xl" /> }
        @else if (i === null) {
          <section class="rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center"><h2 class="text-display-2xs">El enlace no vale</h2><p class="mt-3 text-body-m text-text-secondary">{{ error() }}</p></section>
        } @else if (i.baja) {
          <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
            <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="26" /></span>
            <h2 class="text-display-2xs">Hecho</h2>
            <p class="text-body-m text-text-secondary">{{ i.destino }} ya no recibirá {{ i.texto }}. Los emails operativos de una entrada o inscripción tuya sí te seguirán llegando.</p>
          </section>
        } @else {
          <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
            <span class="flex size-14 items-center justify-center rounded-full bg-accent-deep/40 text-accent-text"><gr-icon name="mail" [size]="24" /></span>
            <h2 class="text-display-2xs">¿Dejar de recibir {{ i.texto }}?</h2>
            <p class="text-body-m text-text-secondary">Para {{ i.destino }}. Puedes volver a suscribirte cuando quieras.</p>
            <button type="button" class="mt-2 h-12 rounded-sm bg-accent-grain px-6 text-label-m text-white disabled:opacity-60" [disabled]="enviando()" (click)="confirmar()">{{ enviando() ? 'Un momento…' : 'Darme de baja' }}</button>
            @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
          </section>
        }
      </div>
    </gr-page>
  `,
})
export class BajaPage {
  private readonly api = inject(Novedades);
  protected readonly info = signal<BajaInfo | null | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  private readonly token: string;

  constructor() {
    inject(Seo).set({ title: 'Darte de baja · GR Strength Cup', description: 'Deja de recibir emails de la GR Strength Cup.', path: '/baja', robots: 'noindex' });
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.api.bajaInfo(this.token).then(
      (i) => this.info.set(i),
      (e) => {
        this.error.set(mensajeError(e, 'Ha caducado o no es válido.'));
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
      this.error.set(mensajeError(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
