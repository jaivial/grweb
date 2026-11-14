import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { AltchaConfig, AltchaEstado, payloadBase64, resolverReto } from '../core/altcha';

/**
 * Widget antibots del alta de atleta.
 *
 * Resuelve el reto ALTCHA (mismo formato de payload que verifica altcha-lib-go): «No soy un robot» ·
 * «Protegido por ALTCHA» (Figma 75). El reto se resuelve en un Web Worker; si el padre pide otro
 * reto (porque el anterior ya se usó o falló), vuelve a verificarse con el nuevo.
 */
@Component({
  selector: 'gr-altcha',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <div class="relative flex min-h-[62px] items-center gap-3 rounded-lg border border-line-subtle bg-bg-surface px-4 py-3">
        @if (estado() === 'verificando') {
          <span class="flex size-5 shrink-0 items-center justify-center text-text-tertiary"><gr-icon name="loader" [size]="18" [spin]="true" /></span>
          <span class="text-label-m text-text-secondary">Comprobando…</span>
        } @else {
          <button type="button" role="checkbox" class="flex size-[22px] shrink-0 cursor-pointer after:absolute after:inset-0 after:rounded-lg after:content-[''] items-center justify-center rounded-[5px] border bg-bg-base transition-colors"
            [class]="estado() === 'verificado' ? 'border-accent bg-accent' : estado() === 'fallo' ? 'border-accent-text' : 'border-line-strong hover:border-text-muted'"
            [attr.aria-checked]="estado() === 'verificado'" [attr.aria-label]="'No soy un robot'" [disabled]="estado() === 'verificando'"
            (click)="verificar()">
            @if (estado() === 'verificado') { <gr-icon name="check" [size]="13" class="text-white" /> }
            @else if (estado() === 'fallo') { <gr-icon name="circle-alert" [size]="13" class="text-accent-text" /> }
          </button>
          <span class="text-label-m" [class]="estado() === 'fallo' ? 'text-accent-text' : 'text-text-primary'">No soy un robot</span>
        }
        <span class="ml-auto text-body-xs text-text-tertiary">Protegido por ALTCHA</span>
      </div>
      <p class="text-body-xs text-text-tertiary" aria-live="polite">
        @switch (estado()) {
          @case ('verificado') { Verificado. }
          @case ('fallo') { No hemos podido verificar que no eres un robot. Vuelve a pulsarlo para reintentar.
            <button type="button" class="ml-1 text-accent-text hover:underline" (click)="pedirReto.emit()">Reintentar</button> }
          @case ('verificando') { Verificamos que no eres un robot… }
          @default { Marca la casilla para continuar. }
        }
      </p>
    </div>
  `,
})
export class GrAltcha {
  /** El reto que devuelve el servicio. */
  readonly cfg = input<AltchaConfig | null>(null);
  /** Al incrementarlo, el widget verifica otra vez (el padre ya ha pedido un reto nuevo). */
  readonly reiniciar = input(0);
  /** Payload (base64) cuando la verificación es correcta. */
  readonly verificado = output<string>();
  /** El padre debe pedir un reto nuevo a la API (y un token de tiempo nuevo). */
  readonly pedirReto = output<void>();

  protected readonly estado = signal<AltchaEstado>('idle');
  private readonly pending = signal(false);

  constructor() {
    // Un reto nuevo (o un reinicio) vuelve a verificar con el reto que hay ahora mismo.
    // `untracked`: verificar() lee y escribe señales propias; dentro del efecto se convertirían en
    // dependencias y el efecto se invalidaría solo (bucle).
    let primera = true;
    effect(() => {
      this.reiniciar();
      if (primera) {
        primera = false;
        return;
      }
      // Reto nuevo: el anterior ya no vale aunque estuviera verificado.
      untracked(() => {
        this.estado.set('idle');
        void this.verificar();
      });
    });
  }

  /** Verifica el reto actual. */
  protected async verificar(): Promise<void> {
    if (this.estado() === 'verificado' || this.pending()) return;
    const cfg = this.cfg();
    if (!cfg?.challenge) return;
    this.pending.set(true);
    this.estado.set('verificando');
    try {
      const number = await resolverReto(cfg);
      if (number === null) {
        this.estado.set('fallo');
        return;
      }
      this.estado.set('verificado');
      this.verificado.emit(
        payloadBase64({
          algorithm: cfg.algorithm || 'SHA-256',
          challenge: cfg.challenge,
          number,
          salt: cfg.salt,
          signature: cfg.signature,
        }),
      );
    } finally {
      this.pending.set(false);
    }
  }
}
