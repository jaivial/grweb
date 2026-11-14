import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, PLATFORM_ID, afterNextRender, computed, effect, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrInput, GrSkeleton, type GrIconName } from '@grcup/ui';
import { GrCoin } from './ui';
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
  imports: [FormsModule, A11yModule, GrButton, GrIcon, GrInput, GrSkeleton, GrCoin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @keyframes gr-velo { from { opacity: 0; } to { opacity: 1; } }
    @keyframes gr-sube { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: none; } }
    @keyframes gr-aparece { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
    .gr-velo { animation: gr-velo 180ms ease-out both; }
    .gr-hoja { animation: gr-sube 260ms var(--ease-out-soft) both; }
    @media (min-width: 768px) { .gr-hoja { animation-name: gr-aparece; } }
    @media (prefers-reduced-motion: reduce) { .gr-velo, .gr-hoja { animation: none; } }
  `,
  template: `
    @if (abierto()) {
      <div class="gr-velo fixed inset-0 z-[60] flex items-end justify-center bg-black/65 backdrop-blur-[2px] md:items-center md:px-4" (click)="cerrar()">
        <div class="gr-hoja relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-xl border border-line-strong bg-bg-card bg-[linear-gradient(180deg,rgb(110_20_32/0.5),transparent_240px)] px-5 pt-2.5 shadow-card md:max-w-[440px] md:rounded-xl md:px-6 md:pt-6"
          role="dialog" aria-modal="true" aria-labelledby="donar-titulo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <!-- UX4-R1-6: iOS sheet - drag the grabber down 80 px to close -->
          <span class="-mt-2.5 mb-2 flex h-6 touch-none items-center justify-center md:hidden" aria-hidden="true" (pointerdown)="arrastre($event)" (pointerup)="suelta($event)" (pointercancel)="inicioY = null"><span class="block h-1 w-10 rounded-full bg-line-strong"></span></span>
          @if (estado() === 'exito') {
            <div class="flex justify-end"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-subtle bg-bg-raised text-text-secondary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar()"><gr-icon name="x" [size]="16" /></button></div>
            <div class="flex flex-col items-center gap-2.5 text-center">
              <span class="flex size-[72px] items-center justify-center rounded-full border-2 border-success/50 bg-success/14 text-success shadow-[0_0_28px_rgb(34_197_94/0.35)]"><gr-icon name="check" [size]="32" /></span>
              <h2 id="donar-titulo" class="font-display text-[30px] leading-tight uppercase italic">¡Gracias por tu donativo!</h2>
              <p class="text-body-s text-text-secondary">Tus {{ eurosCorto(importe()) }} apoyan a la GR Strength Cup y tu nombre sale en el chat y en el ranking del día.</p>
            </div>
            <p class="mt-4 flex flex-wrap justify-center gap-2">
              <gr-coin>+{{ num(coins()) }} GRS coins</gr-coin><gr-coin tipo="fantasy">+{{ num(fantasy()) }} fantasy</gr-coin>
            </p>
            <p class="mt-4 flex items-start gap-2 rounded-sm border border-line-subtle bg-bg-surface px-3 py-2.5 text-body-xs text-text-secondary"><gr-icon name="circle-check" [size]="14" class="mt-px shrink-0 text-success" />Las monedas se acreditan al volver a la sala de la jornada</p>
            <div class="mt-5 flex flex-col gap-2 pb-[max(28px,env(safe-area-inset-bottom))] md:pb-6">
              <button type="button" grButton variant="primary" size="l" [block]="true" (click)="cerrar()">Volver al directo</button>
              <button type="button" grButton variant="outline" [block]="true" (click)="cerrar(); verRanking.emit()">Ver ranking de donantes</button>
            </div>
          } @else {
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 id="donar-titulo" tabindex="-1" class="font-display text-[24px] outline-none leading-tight uppercase italic">Donar al directo</h2>
                <p class="mt-1.5 text-body-s text-text-secondary">Tu donativo sale en el chat y en el ranking del día.</p>
              </div>
              <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-subtle bg-bg-raised text-text-secondary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar()"><gr-icon name="x" [size]="16" /></button>
            </div>
            <ul class="mt-4 flex flex-wrap gap-1.5" aria-label="Garantías">
              @for (g of garantias(); track g.t) {
                <li class="inline-flex h-6 items-center gap-1.5 rounded-pill border border-line-subtle bg-bg-raised pr-2 pl-1.5 font-mono text-[11px] tracking-[0.08em] text-text-secondary uppercase"><gr-icon [name]="g.i" [size]="12" class="text-success" />{{ g.t }}</li>
              }
            </ul>
            <!-- UX4-R1-2: said up front, not next to «Pagar» -->
            @if (!cargando() && !activo()) {
              <p class="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-body-s text-warning" role="status"><gr-icon name="triangle-alert" [size]="16" class="mt-0.5 shrink-0" />Las donaciones aún no están activas. Vuelve en unos días.</p>
            }

            @if (cargando()) {
              <!-- UX4-R1-7: the same shape as the form, so the sheet does not jump -->
              <div class="mt-5 flex flex-col gap-3 pb-6" aria-busy="true"><gr-skeleton class="h-5 w-32 rounded-xs" /><div class="grid grid-cols-3 gap-2">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <gr-skeleton class="h-[68px] rounded-md" /> }</div><gr-skeleton class="h-24 rounded-md" /><gr-skeleton class="h-11 rounded-md" /><gr-skeleton class="h-36 rounded-md" /><gr-skeleton class="h-12 rounded-md" /></div>
            } @else {
              <!-- importe -->
              <fieldset class="mt-5" [disabled]="!activo()" [class.opacity-50]="!activo()">
                <legend class="text-label-s text-text-primary">Elige el importe</legend>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  @for (c of chips(); track c) {
                    <button type="button" class="flex h-[68px] flex-col items-center justify-center gap-1 rounded-md border transition-[border-color,background,box-shadow]"
                      [class]="!otro() && importe() === c ? 'border-accent bg-accent-deep/32 shadow-[0_0_16px_rgb(196_43_62/0.3)]' : 'border-line-strong bg-bg-surface hover:border-text-muted'"
                      [attr.aria-pressed]="!otro() && importe() === c" (click)="elegir(c)">
                      <span class="font-display text-[24px] leading-none text-text-primary italic">{{ eurosCorto(c) }}</span>
                      <span class="font-mono text-[11px] tracking-[0.08em] uppercase" [class]="!otro() && importe() === c ? 'text-accent-text' : 'text-text-tertiary'">{{ num(coinsDe(c)) }} coins</span>
                    </button>
                  }
                  <button type="button" class="flex h-[68px] flex-col items-center justify-center gap-1 rounded-md border transition-[border-color,background,box-shadow]" [style.grid-column]="'span ' + spanOtro()"
                    [class]="otro() ? 'border-accent bg-accent-deep/32 shadow-[0_0_16px_rgb(196_43_62/0.3)]' : 'border-line-strong bg-bg-surface hover:border-text-muted'"
                    [attr.aria-pressed]="otro()" (click)="otro.set(true)">
                    <span class="text-label-s text-text-primary">Otro importe</span>
                    <span class="font-mono text-[11px] tracking-[0.08em] uppercase" [class]="otro() ? 'text-accent-text' : 'text-text-tertiary'">De {{ minimoEuros() }} a {{ maximoEuros() }}</span>
                  </button>
                </div>
              </fieldset>
              @if (otro()) {
                <label class="mt-4 block">
                  <span class="text-label-s text-text-primary">Importe en € *</span>
                  <span class="relative mt-1.5 block"><input grInput type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" class="pr-10" placeholder="15,00" aria-label="Importe en euros" aria-describedby="donar-rango" [attr.aria-invalid]="fueraDeRango()" [invalid]="fueraDeRango()" [ngModel]="otroEuros()" (ngModelChange)="ponerOtro($event)" />
                    <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body-m text-text-tertiary" aria-hidden="true">€</span></span>
                  <span id="donar-rango" class="mt-1.5 block text-body-xs" [class]="fueraDeRango() ? 'text-accent-text' : 'text-text-tertiary'">Entre {{ minimoEuros() }} y {{ maximoEuros() }}</span>
                </label>
              }

              <!-- mensaje -->
              <label class="mt-4 block">
                <span class="flex items-baseline justify-between gap-2"><span class="text-label-s text-text-primary">Mensaje para el chat <span class="font-normal text-text-tertiary">(opcional)</span></span>
                  <span class="font-mono text-[11px] tracking-[0.08em]" [class]="mensaje().length > 140 ? 'text-accent-text' : 'text-text-muted'">{{ mensaje().length }}/140</span></span>
                <textarea grInput rows="2" class="mt-1.5 resize-none" placeholder="Escribe algo para los atletas…" aria-label="Mensaje para el chat" [invalid]="mensaje().length > 140" [ngModel]="mensaje()" (ngModelChange)="mensaje.set($event)"></textarea>
              </label>

              <!-- anónimo -->
              <label class="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" class="size-5 shrink-0 accent-[#c42b3e]" [ngModel]="anonimo()" (ngModelChange)="anonimo.set($event)" />
                <span class="text-body-s text-text-secondary">Donar de forma anónima <span class="text-text-tertiary">(sales como «Anónimo» en el ranking)</span></span>
              </label>

              <!-- resumen -->
              <div class="mt-3 rounded-md border border-line-subtle bg-bg-surface p-3.5">
                <p class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">Con tu donativo</p>
                <p class="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1"><gr-coin>+{{ num(coins()) }} GRS coins</gr-coin><span class="text-body-xs text-text-tertiary">anunciados en el chat</span></p>
                <p class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1"><gr-coin tipo="fantasy">+{{ num(fantasy()) }} fantasy</gr-coin><span class="text-body-xs text-text-tertiary">para tu equipo de GRS Fantasy</span></p>
                <p class="mt-3 flex items-center justify-between border-t border-line-subtle pt-3"><span class="text-label-s text-text-primary">Total</span><span class="font-display text-[24px] leading-none italic">{{ total() }}</span></p>
              </div>

              @if (error(); as e) {
                <p class="mt-4 flex items-start gap-2 rounded-md border border-accent/40 bg-accent-deep/20 p-3 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />{{ e }}</p>
              }

              <!-- UX4-R1-7: «Pagar» always in reach of the thumb -->
              <div class="sticky bottom-0 -mx-5 mt-4 border-t border-line-subtle bg-bg-card px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:-mx-6 md:px-6 md:pb-6">
                <button type="button" grButton variant="primary" size="l" [block]="true" icon="lock" [loading]="pagando()" [disabled]="!puedePagar()" (click)="pagar()">Pagar{{ importe() > 0 ? ' ' + total() : '' }}</button>
                <p class="mt-2 flex items-center justify-center gap-1.5 text-center text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />{{ pie() }}</p>
              </div>
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
  /** «Otro importe» fills the rest of the last row of the 3-column grid. */
  protected readonly spanOtro = computed(() => 3 - (this.chips().length % 3));
  protected readonly fueraDeRango = computed(() => {
    if (!this.otro() || this.otroEuros() === '') return false;
    const cfg = this.don.config();
    return this.importe() < (cfg?.minimo ?? 100) || this.importe() > (cfg?.maximo ?? 50000);
  });
  protected readonly pie = computed(() =>
    this.don.config()?.pasarela === 'stripe' ? 'Pago seguro con Stripe · no guardamos tu tarjeta' : 'Pago seguro · no guardamos tu tarjeta',
  );
  /** Only what the product does: the gateway pill shows only when the gateway is Stripe. */
  protected readonly garantias = computed<{ i: GrIconName; t: string }[]>(() => [
    { i: 'heart', t: 'Apoyo al evento' },
    { i: 'lock', t: 'Pago seguro' },
    ...(this.don.config()?.pasarela === 'stripe' ? [{ i: 'credit-card' as GrIconName, t: 'Pago con Stripe' }] : []),
  ]);
  /** «10,00 €» */
  protected readonly total = computed(() => euros2.format(this.importe() / 100));

  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  /** Start of a drag on the grabber (px). */
  protected inicioY: number | null = null;

  constructor() {
    // UX4-R1-6: modal sheet - the page behind does not scroll, Escape closes from anywhere, focus goes in.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.abierto()) this.cerrar(); };
    if (this.browser) {
      this.doc.addEventListener('keydown', esc);
      inject(DestroyRef).onDestroy(() => { this.doc.removeEventListener('keydown', esc); this.doc.body.style.overflow = ''; });
    }
    effect(() => {
      if (!this.browser) return;
      const a = this.abierto();
      this.doc.body.style.overflow = a ? 'hidden' : '';
      if (a) afterNextRender(() => this.doc.getElementById('donar-titulo')?.focus({ preventScroll: true }), { injector: this.injector });
    });
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

  protected arrastre(e: PointerEvent): void {
    this.inicioY = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  protected suelta(e: PointerEvent): void {
    if (this.inicioY !== null && e.clientY - this.inicioY > 80) this.cerrar();
    this.inicioY = null;
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
  /** The amount is kept as text: only digits and one decimal separator. */
  protected ponerOtro(v: string | null): void {
    this.otroEuros.set((v ?? '').replace(/[^0-9.,]/g, ''));
  }
  protected coinsDe(c: number): number {
    return coinsDe(c, this.don.config()?.coinsPorEuro ?? 100);
  }
}
