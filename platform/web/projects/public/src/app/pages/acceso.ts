import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { DESTINO_INTERNO, FanSession, codigoError, detalleError } from '../core/fan';
import { Page } from '../layout/page';

/**
 * Página /acceso: canjea el enlace mágico (?acceso=TOKEN) y deja al fan dentro del directo.
 * Con SSR el canje se hace en el navegador (la cookie es httpOnly: solo el navegador la guarda).
 */
@Component({
  selector: 'gr-acceso-page',
  imports: [Page, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @keyframes gr-progreso { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .gr-progreso { transform-origin: left; animation: gr-progreso 900ms var(--ease-out-soft) both; }
    @media (prefers-reduced-motion: reduce) { .gr-progreso { animation: none; } }
  `,
  template: `
    <gr-page title="Acceso" accent="al directo" [centrado]="true" [cabecera]="false">
      <h1 class="sr-only">Acceso al directo</h1>
      <div class="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-line-subtle bg-bg-card bg-[linear-gradient(180deg,rgb(110_20_32/0.45),transparent_220px)] shadow-card" aria-live="polite">
        <div class="flex flex-col items-center gap-3 px-6 pt-9 pb-8 text-center md:px-8">
          @if (estado() === 'cargando') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/45 bg-accent-deep/40 text-accent-text"><gr-icon name="loader" [size]="26" [spin]="true" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">Entrando…</p>
            <p class="text-body-s text-text-secondary">Estamos comprobando tu enlace mágico.</p>
            <gr-skeleton class="mt-2 h-11 w-full rounded-sm" />
          } @else if (estado() === 'error') {
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/50 bg-accent-deep/40 text-accent-text"><gr-icon name="circle-alert" [size]="28" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">No hemos podido entrar</p>
            <p class="text-body-s text-text-secondary">{{ error() }}</p>
            <div class="mt-3 flex w-full flex-col gap-2">
              <button type="button" grButton variant="primary" size="l" [block]="true" icon="mail" (click)="pedirOtro()">Pedir un enlace nuevo</button>
              <a grButton variant="outline" [block]="true" href="/en-directo">Ir al directo</a>
            </div>
            <p class="mt-1 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />Cada enlace sirve una vez y caduca en 30 min</p>
          } @else {
            <span class="flex size-16 items-center justify-center rounded-full border-2 border-success/50 bg-success/14 text-success shadow-[0_0_28px_rgb(34_197_94/0.35)]"><gr-icon name="check" [size]="30" /></span>
            <p class="mt-1 font-display text-[28px] leading-tight uppercase italic">¡Ya estás dentro!</p>
            <p class="text-body-s text-text-secondary">{{ destino() === '/en-directo' ? 'Te llevamos al directo' : 'Te llevamos de vuelta a GRS Fantasy' }} con tu alias <span class="font-semibold text-text-primary">{{ alias() }}</span>.</p>
            <span class="mt-2 block h-1 w-full overflow-hidden rounded-full bg-bg-raised" aria-hidden="true"><span class="gr-progreso block h-full rounded-full bg-accent-grain"></span></span>
            <a grButton variant="primary" size="l" [block]="true" [href]="destino()" iconRight="arrow-right" class="mt-2">{{ destino() === '/en-directo' ? 'Ir al directo' : 'Continuar' }}</a>
          }
        </div>
      </div>
    </gr-page>
  `,
})
export class AccesoPage {
  private readonly fan = inject(FanSession);
  /** The access dialog (mounted in the layout) asks for a new magic link. */
  protected pedirOtro(): void {
    this.fan.abrirAcceso();
  }
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly estado = signal<'cargando' | 'error' | 'ok'>('cargando');
  protected readonly error = signal<string | null>(null);
  protected readonly alias = signal('');
  /** Where the fan goes after redeeming: the internal destination saved with the link (an invitation to a room) or the direct. */
  protected readonly destino = signal('/en-directo');

  constructor() {
    effect(() => {
      const token = this.route.snapshot.queryParamMap.get('acceso') ?? '';
      if (!this.browser) return;
      if (!token) {
        this.estado.set('error');
        this.error.set('Este enlace no es válido. Pide uno nuevo y entra en un minuto.');
        return;
      }
      void this.fan
        .canjear(token)
        .then((f) => {
          this.alias.set(f.alias);
          this.estado.set('ok');
          // Only internal /fantasy routes are accepted as destination (never an external URL); otherwise, the direct.
          if (f.next && DESTINO_INTERNO.test(f.next)) this.destino.set(f.next);
          setTimeout(() => void this.router.navigateByUrl(this.destino()), 900);
        })
        .catch((e) => {
          this.estado.set('error');
          // ENLACE_INVALIDO, VALIDACION (a malformed token answers 422 «validation failed») or any bare 4xx: the fan only needs a new link.
          const c = codigoError(e);
          this.error.set(c === 'ENLACE_INVALIDO' || c === 'VALIDACION' || /^HTTP_4/.test(c) ? 'El enlace ha caducado o ya se usó. Pide uno nuevo y entra en un minuto.' : detalleError(e));
        });
    });
  }
}
