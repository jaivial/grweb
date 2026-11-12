import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrBadge, GrButton, GrIcon, GrIconButton, type GrIconName, type GrTone } from '@grcup/ui';

export type BoAforo = 'normal' | 'almost' | 'full' | 'over' | 'closed';

/** Business state of a ticket session from its numbers (≥ 90 % = casi llena). */
export function boAforo(ocupadas: number, aforo: number, cerrada = false): BoAforo {
  if (cerrada) return 'closed';
  if (ocupadas > aforo) return 'over';
  if (ocupadas >= aforo) return 'full';
  return aforo > 0 && ocupadas / aforo >= 0.9 ? 'almost' : 'normal';
}

const BAR: Record<BoAforo, string> = { normal: 'bg-accent', almost: 'bg-warning', full: 'bg-error', over: 'bg-error', closed: 'bg-text-tertiary' };
const PIE: Record<BoAforo, string> = { normal: 'text-text-tertiary', almost: 'text-warning', full: 'text-error', over: 'text-error', closed: 'text-text-tertiary' };
const BADGE: Partial<Record<BoAforo, [string, GrTone]>> = { full: ['Lista de espera', 'danger'], over: ['Sobreventa', 'danger'], closed: ['Cerrada', 'neutral'] };

/** Figma 50 «BO / Capacity meter»: aforo of a session (ticketing `SesionAdmin` + SSE `aforo.actualizado`). */
@Component({
  selector: 'bo-capacity-meter',
  imports: [GrBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex flex-col gap-2 rounded-md border bg-bg-card p-4 " + (estado() === "over" ? "border-error" : "border-line-subtle")' },
  template: `
    <div class="flex items-start justify-between gap-2">
      <span class="min-w-0 text-[14px] leading-[18px] font-semibold text-text-primary">{{ titulo() }}</span>
      <span class="shrink-0 font-mono text-[13px] leading-[18px] text-text-secondary">{{ ocupadas() }} / {{ aforo() }}</span>
    </div>
    <div class="h-2 overflow-hidden rounded-pill bg-bg-raised" role="meter" [attr.aria-valuenow]="ocupadas()" aria-valuemin="0" [attr.aria-valuemax]="aforo()" [attr.aria-label]="'Aforo ' + titulo()">
      <div class="h-full transition-[width] duration-300 motion-reduce:transition-none" [class]="bar()" [style.width.%]="pct()"></div>
    </div>
    <div class="flex items-center justify-between gap-2">
      <span class="text-[12px] leading-[17px]" [class]="tono()">{{ pie() }}</span>
      @if (badge(); as b) { <gr-badge [tone]="b[1]">{{ b[0] }}</gr-badge> }
    </div>
  `,
})
export class BoCapacityMeter {
  readonly titulo = input('');
  readonly ocupadas = input(0);
  readonly aforo = input(0);
  readonly espera = input(0);
  readonly cerrada = input(false);
  /** Closed: who/when («Cerrada manualmente por Nico · 18:40»). */
  readonly nota = input('');
  readonly estado = computed(() => boAforo(this.ocupadas(), this.aforo(), this.cerrada()));
  protected readonly pct = computed(() => (this.aforo() ? Math.min(100, (this.ocupadas() / this.aforo()) * 100) : 0));
  protected readonly bar = computed(() => 'block ' + BAR[this.estado()]);
  protected readonly tono = computed(() => PIE[this.estado()]);
  protected readonly badge = computed(() => BADGE[this.estado()] ?? null);
  protected readonly pie = computed(() => {
    const libres = this.aforo() - this.ocupadas();
    switch (this.estado()) {
      case 'normal': return `Quedan ${libres} entradas`;
      case 'almost': return `¡Últimas ${libres} entradas!`;
      case 'full': return `Agotada · ${this.espera()} en lista de espera`;
      case 'over': return `+${-libres} sobre el aforo · revisar antes de la puerta`;
      default: return this.nota() || 'Cerrada';
    }
  });
}

export type BoSesion = 'open' | 'almost' | 'full' | 'closed' | 'draft';
const SES: Record<BoSesion, [string, GrTone]> = {
  open: ['Abierta', 'success'], almost: ['Casi llena', 'warning'], full: ['Agotada', 'danger'], closed: ['Cerrada', 'neutral'], draft: ['Borrador', 'neutral'],
};

/** Figma 50 «BO / Session card»: free-ticket session (aforo, apertura/cierre, lista de espera). Draft = not yet visible in /entradas. */
@Component({
  selector: 'bo-session-card',
  imports: [BoCapacityMeter, GrBadge, GrButton, GrIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5' },
  template: `
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-[18px] leading-[22px] font-semibold">{{ nombre() }}</h3>
        <p class="mt-1 text-[12px] leading-[17px] text-text-tertiary">{{ cuando() }}</p>
      </div>
      <gr-badge [tone]="b()[1]">{{ b()[0] }}</gr-badge>
    </header>
    <bo-capacity-meter [titulo]="meterTitulo() || nombre()" [ocupadas]="ocupadas()" [aforo]="aforo()" [espera]="espera()" [cerrada]="estado() === 'closed'" [nota]="nota()" />
    <dl class="text-[12px] leading-[17px]">
      @for (f of filas(); track f[0]) {
        <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">{{ f[0] }}</dt><dd class="text-right text-text-secondary">{{ f[1] }}</dd></div>
      }
    </dl>
    <div class="flex items-center justify-between gap-2">
      @if (estado() === 'draft') {
        <button grButton variant="primary" type="button" (click)="publicar.emit()">Publicar sesión</button>
      } @else {
        <button grButton type="button" (click)="ver.emit()">Ver reservas</button>
      }
      <button grIconButton icon="more" label="Más acciones de la sesión" type="button" (click)="menu.emit($event)"></button>
    </div>
  `,
})
export class BoSessionCard {
  readonly nombre = input('');
  readonly meterTitulo = input('');
  readonly cuando = input('');
  readonly ocupadas = input(0);
  readonly aforo = input(0);
  readonly espera = input(0);
  readonly nota = input('');
  readonly estado = input<BoSesion>('open');
  readonly apertura = input('');
  readonly maxPorReserva = input('');
  readonly listaEspera = input('');
  readonly ver = output<void>();
  readonly publicar = output<void>();
  readonly menu = output<MouseEvent>();
  protected readonly b = computed(() => SES[this.estado()]);
  protected readonly filas = computed(() => [['Reservas abiertas', this.apertura()], ['Máx. por reserva', this.maxPorReserva()], ['Lista de espera', this.listaEspera()]]);
}

export type BoScan = 'valid' | 'used' | 'session' | 'invalid' | 'offline' | 'searching';
const SCAN: Record<BoScan, { t: string; i: GrIconName; c: string; box: string; primary: boolean }> = {
  valid: { t: 'Entrada válida', i: 'circle-check', c: 'text-success', box: 'border-success/45 bg-success/10', primary: true },
  used: { t: 'Ya usada', i: 'triangle-alert', c: 'text-warning', box: 'border-warning/45 bg-warning/10', primary: false },
  session: { t: 'Sesión equivocada', i: 'clock', c: 'text-warning', box: 'border-warning/45 bg-warning/10', primary: false },
  invalid: { t: 'QR no válido', i: 'circle-x', c: 'text-error', box: 'border-error/45 bg-error/10', primary: false },
  offline: { t: 'Guardado sin conexión', i: 'wifi-off', c: 'text-info', box: 'border-info/45 bg-info/10', primary: true },
  searching: { t: 'Comprobando…', i: 'loader', c: 'text-text-tertiary', box: 'border-text-tertiary/45 bg-text-tertiary/10', primary: false },
};

/** Figma 50 «BO / Scan result»: door scanner result (ticketing `POST …/checkin/escaneos`), 44 px action. */
@Component({
  selector: 'bo-scan-result',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex flex-col items-center gap-3 rounded-[20px] border p-5 text-center " + s().box', role: 'status', 'aria-live': 'assertive' },
  template: `
    <span class="flex size-14 items-center justify-center rounded-full bg-current/15" [class]="s().c"><gr-icon [name]="s().i" [size]="24" [spin]="estado() === 'searching'" /></span>
    <p class="text-[24px] leading-[30px] font-bold" [class]="s().c">{{ s().t }}</p>
    <p class="text-[16px] leading-[20px] font-semibold text-text-primary">{{ titulo() }}</p>
    <p class="text-[14px] leading-[18px] text-text-secondary">{{ detalle() }}</p>
    <button type="button" (click)="accion.emit()" class="mt-1 flex h-11 w-full items-center justify-center rounded-sm text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      [class]="btn()">{{ boton() }}</button>
  `,
})
export class BoScanResult {
  readonly estado = input<BoScan>('valid');
  readonly titulo = input('');
  readonly detalle = input('');
  readonly boton = input('');
  readonly accion = output<void>();
  protected readonly s = computed(() => SCAN[this.estado()]);
  protected readonly btn = computed(() =>
    this.s().primary ? 'bg-gradient-to-r from-accent to-accent-deep text-text-primary hover:brightness-110'
      : this.estado() === 'searching' ? 'text-text-secondary hover:bg-bg-hover' : 'bg-bg-raised text-text-primary hover:bg-bg-hover');
}
