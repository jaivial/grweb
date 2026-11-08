import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession, codigoError, detalleError } from '../core/fan';
import { Page } from '../layout/page';

/**
 * Página /acceso: canjea el enlace mágico (?acceso=TOKEN) y deja al fan dentro del directo.
 * Con SSR el canje se hace en el navegador (la cookie es httpOnly: solo el navegador la guarda).
 */
@Component({
  selector: 'gr-acceso-page',
  imports: [Page, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Acceso" accent="al directo" [centrado]="true" [cabecera]="false">
      <h1 class="sr-only">Acceso al directo</h1>
      <div class="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-line-subtle bg-bg-card p-8 text-center">
        @if (estado() === 'cargando') {
          <gr-skeleton class="size-12 rounded-full" />
          <p class="text-label-m">Entrando…</p>
          <p class="text-body-s text-text-tertiary">Estamos comprobando tu enlace mágico.</p>
        } @else if (estado() === 'error') {
          <span class="flex size-12 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/25 text-accent-text"><gr-icon name="circle-alert" [size]="22" /></span>
          <p class="text-ui-h4">No hemos podido entrar</p>
          <p class="text-body-s text-text-secondary">{{ error() }}</p>
          <a grButton variant="primary" href="/en-directo" class="mt-2">Ir al directo</a>
        } @else {
          <span class="flex size-12 items-center justify-center rounded-full border border-success/50 bg-success/10 text-success"><gr-icon name="circle-check" [size]="22" /></span>
          <p class="text-ui-h4">¡Ya estás dentro!</p>
          <p class="text-body-s text-text-secondary">Te llevamos al directo con tu alias {{ alias() }}.</p>
          <a grButton variant="primary" href="/en-directo" class="mt-2">Ir al directo</a>
        }
      </div>
    </gr-page>
  `,
})
export class AccesoPage {
  private readonly fan = inject(FanSession);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly estado = signal<'cargando' | 'error' | 'ok'>('cargando');
  protected readonly error = signal<string | null>(null);
  protected readonly alias = signal('');

  constructor() {
    effect(() => {
      const token = this.route.snapshot.queryParamMap.get('acceso') ?? '';
      if (!this.browser) return;
      if (!token) {
        this.estado.set('error');
        this.error.set('Este enlace no es válido. Pide uno nuevo desde el directo.');
        return;
      }
      void this.fan
        .canjear(token)
        .then((f) => {
          this.alias.set(f.alias);
          this.estado.set('ok');
          // The account is already created: the direct is the natural destination.
          setTimeout(() => void this.router.navigate(['/en-directo']), 900);
        })
        .catch((e) => {
          this.estado.set('error');
          this.error.set(codigoError(e) === 'ENLACE_INVALIDO' ? 'El enlace ha caducado o ya se usó. Pide otro desde el directo.' : detalleError(e));
        });
    });
  }
}
