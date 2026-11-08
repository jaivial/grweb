import { isPlatformBrowser } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Donaciones, coinsDe, euros, eurosCorto, fantasyDe, num } from '../../core/donaciones';
import { FanSession, detalleError } from '../../core/fan';

/** «10,00 €» */
const euros2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «500 €» */
const euros0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * Modal «Donar al directo» (Figma 70): importes, mensaje, anónimo, equivalencias y el pago.
 * El backend devuelve la URL de la pasarela: la web redirige allí y vuelve a /en-directo?donacion=ok.
 */
@Component({
  selector: 'gr-donar-modal',
  imports: [FormsModule, A11yModule, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (abierto()) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 px-0 md:items-center md:px-4" (click)="cerrar()" (keydown.escape)="cerrar()">
        <div class="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-line-strong bg-bg-raised p-5 shadow-card md:max-w-[440px] md:rounded-xl md:p-6"
          role="dialog" aria-modal="true" aria-label="Donar al directo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h4">Donar al directo</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar()"><gr-icon name="x" [size]="18" /></button>
          </div>
          @if (estado() === 'exito') {
            <p class="mt-3 text-body-s text-text-secondary">{{ num(coins()) }} GRS coins en el chat y +{{ num(fantasy()) }} monedas de GRS Fantasy se acreditan al volver a la sala de la jornada.</p>
            <p class="mt-3 inline-flex items-center gap-2 rounded-sm bg-bg-surface px-2.5 py-1 text-mono-xs text-text-secondary"><gr-icon name="circle-check" [size]="14" class="text-success" />Recibo enviado a tu email</p>
            <div class="mt-5 flex flex-col gap-2">
              <button type="button" grButton variant="primary" [block]="true" (click)="cerrar()">Volver al directo</button>
              <button type="button" grButton variant="secondary" [block]="true" (click)="cerrar(); verRanking.emit()">Ver ranking de donantes</button>
            </div>
          } @else {
            <p class="mt-2 text-body-s text-text-secondary">El 100 % llega al club anfitrión. Tu donativo aparece en el chat y en el ranking del día.</p>

            @if (cargando()) {
              <div class="mt-4 flex flex-col gap-3"><gr-skeleton class="h-11 rounded-md" /><gr-skeleton class="h-24 rounded-md" /></div>
            } @else {
              <!-- importe -->
              <p class="mt-5 text-label-s text-text-primary">Importe</p>
              <div class="mt-2 flex flex-wrap gap-2">
                @for (c of chips(); track c) {
                  <button type="button" class="h-11 rounded-md border px-3 text-label-s md:h-9" [class]="importe() === c ? 'border-accent bg-accent-deep/30 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-muted'"
                    [attr.aria-pressed]="importe() === c" (click)="elegir(c)">{{ eurosCorto(c) }}</button>
                }
                <button type="button" class="h-11 rounded-md border px-4 text-label-s md:h-9" [class]="otro() ? 'border-accent bg-accent-deep/30 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-muted'"
                  [attr.aria-pressed]="otro()" (click)="otro.set(true)">Otro</button>
              </div>
              @if (otro()) {
                <label class="mt-3 block">
                  <span class="text-label-s text-text-primary">Importe en €</span>
                  <input grInput type="number" inputmode="decimal" min="1" step="0.5" class="mt-1.5" placeholder="15,00 €" aria-label="Importe en euros" [ngModel]="otroEuros()" (ngModelChange)="otroEuros.set($event)" />
                </label>
                <p class="mt-1 text-mono-xs text-text-tertiary">Entre {{ minimoEuros() }} y {{ maximoEuros() }}</p>
              }

              <!-- mensaje -->
              <label class="mt-5 block">
                <span class="text-label-s text-text-primary">Mensaje (opcional) · máx. 140</span>
                <textarea grInput rows="3" class="mt-1.5" placeholder="Escribe un mensaje para el chat…" aria-label="Mensaje para el chat" [ngModel]="mensaje()" (ngModelChange)="mensaje.set($event)"></textarea>
                <span class="mt-1 block text-right font-mono text-mono-xs" [class]="mensaje().length > 140 ? 'text-accent-text' : 'text-text-tertiary'">{{ mensaje().length }} / 140</span>
              </label>

              <!-- anónimo -->
              <label class="mt-3 flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" class="mt-0.5 size-4 shrink-0 accent-[#c42b3e]" [ngModel]="anonimo()" (ngModelChange)="anonimo.set($event)" />
                <span class="text-body-xs text-text-secondary">Donar anónimamente (apareces como «Anónimo» en el ranking)</span>
              </label>

              <!-- equivalencias -->
              <div class="mt-4 flex flex-col gap-1.5 rounded-md bg-bg-surface p-3">
                <p class="flex items-center gap-2 text-body-xs text-text-secondary"><span class="size-2 shrink-0 rounded-full bg-warning"></span>{{ eurosCorto(importe()) }} = {{ num(coins()) }} GRS coins anunciados en el chat</p>
                <p class="flex items-center gap-2 text-body-xs text-text-secondary"><span class="size-2 shrink-0 rounded-full bg-info"></span>+{{ num(fantasy()) }} monedas de GRS Fantasy (10.000 por €)</p>
              </div>

              @if (!activo()) {
                <p class="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-body-xs text-warning"><gr-icon name="triangle-alert" [size]="14" class="mt-0.5 shrink-0" />Las donaciones aún no están activas. Vuelve en unos días.</p>
              }
              @if (error(); as e) {
                <p class="mt-4 flex items-start gap-2 rounded-md border border-accent/40 bg-accent-deep/20 p-3 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />{{ e }}</p>
              }

              <!-- total -->
              <p class="mt-5 flex items-center justify-between text-label-s text-text-primary"><span>Total</span><span class="font-mono">{{ total() }}</span></p>
              <button type="button" grButton variant="primary" size="l" [block]="true" class="mt-3" [loading]="pagando()" [disabled]="!puedePagar()" (click)="pagar()">Pagar con Stripe</button>
              <p class="mt-3 text-center text-body-xs text-text-tertiary">Pasarela segura · al terminar vuelves al directo (/en-directo?donacion=ok)</p>
            }
          }
        </div>
      </div>
    }
  `,
})
export class DonarModal {
  private readonly don = inject(Donaciones);
  private readonly fan = inject(FanSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The modal is open. */
  readonly abierto = model(false);
  /** The user asks for the ranking of donors. */
  readonly verRanking = output<void>();

  protected readonly estado = signal<'formulario' | 'exito'>('formulario');
  protected readonly cargando = signal(true);
  protected readonly pagando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly importe = signal(1000);
  protected readonly otro = signal(false);
  protected readonly otroEuros = signal('');
  protected readonly mensaje = signal('');
  protected readonly anonimo = signal(false);

  protected readonly chips = computed(() => this.don.config()?.importesSugeridos?.length ? this.don.config()!.importesSugeridos : [500, 1000, 2500, 5000]);
  protected readonly activo = computed(() => this.don.config()?.activo !== false);
  protected minimoEuros = computed(() => euros0.format((this.don.config()?.minimo ?? 100) / 100));
  protected maximoEuros = computed(() => euros0.format((this.don.config()?.maximo ?? 50000) / 100));
  protected readonly coins = computed(() => coinsDe(this.importe(), this.don.config()?.coinsPorEuro ?? 100));
  protected readonly fantasy = computed(() => fantasyDe(this.importe()));
  /** «10,00 €» */
  protected readonly total = computed(() => euros2.format(this.importe() / 100));

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      this.estado.set('formulario');
      this.error.set(null);
      this.cargando.set(true);
      void this.don.cargarConfig().finally(() => this.cargando.set(false));
    });
    // «Otro»: the amount written in euros is the amount paid (in cents).
    effect(() => {
      if (!this.otro()) return;
      const n = parseFloat(this.otroEuros().replace(',', '.'));
      this.importe.set(isNaN(n) ? 0 : Math.round(n * 100));
    });
  }

  protected elegir(c: number): void {
    this.otro.set(false);
    this.otroEuros.set('');
    this.importe.set(c);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected puedePagar(): boolean {
    if (!this.activo() || this.pagando()) return false;
    const cfg = this.don.config();
    const min = cfg?.minimo ?? 100;
    const max = cfg?.maximo ?? 50000;
    return this.importe() >= min && this.importe() <= max && this.mensaje().length <= 140;
  }

  protected async pagar(): Promise<void> {
    if (!this.puedePagar()) return;
    if (!this.fan.conSesion()) {
      this.cerrar();
      this.fan.abrirAcceso('donar');
      return;
    }
    this.pagando.set(true);
    this.error.set(null);
    try {
      const r = await this.don.donar(this.importe(), this.mensaje().trim(), this.anonimo());
      if (!this.browser) return;
      if (r?.url) location.href = r.url;
      else this.estado.set('exito');
    } catch (e) {
      this.error.set(detalleError(e));
    } finally {
      this.pagando.set(false);
    }
  }

  protected euros(c: number): string {
    return euros(c);
  }
  protected eurosCorto(c: number): string {
    return eurosCorto(c);
  }
  protected num(n: number): string {
    return num(n);
  }
}
