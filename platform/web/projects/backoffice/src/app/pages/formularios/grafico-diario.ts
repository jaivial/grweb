import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DiaRespuestas } from './api';

const DIAS = 30;
const W = 640;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 36 };
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fechaIso = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Madrid' });

interface Dia { fecha: string; etiqueta: string; respuestas: number; completas: number; parciales: number; x: number; yCompletas: number; yParciales: number; hCompletas: number; hParciales: number }

/**
 * Responses per day over the last 30 days as stacked SVG bars (completas under parciales). Days without responses keep
 * their slot, so the axis always shows the whole period. Table fallback in a <details>, values in a native tooltip.
 */
@Component({
  selector: 'bo-grafico-diario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div class="flex flex-wrap gap-4 text-body-xs text-text-tertiary">
      <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-2xs bg-success" aria-hidden="true"></span>Completas</span>
      <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-2xs bg-warning" aria-hidden="true"></span>Parciales</span>
    </div>
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="h-auto w-full" role="img" [attr.aria-label]="resumen()">
      @for (g of grid(); track g.v) {
        <line [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="g.y" [attr.y2]="g.y" class="stroke-line-subtle" stroke-width="1" />
        <text [attr.x]="PAD.left - 6" [attr.y]="g.y + 4" text-anchor="end" class="fill-text-tertiary font-mono" font-size="10">{{ g.v }}</text>
      }
      @for (d of dias(); track d.fecha) {
        @if (d.respuestas > 0) {
          <g>
            <title>{{ d.etiqueta }}: {{ d.respuestas }} {{ d.respuestas === 1 ? 'respuesta' : 'respuestas' }} ({{ d.completas }} completas)</title>
            <rect [attr.x]="d.x" [attr.y]="d.yCompletas" [attr.width]="barra()" [attr.height]="d.hCompletas" class="fill-success" />
            <rect [attr.x]="d.x" [attr.y]="d.yParciales" [attr.width]="barra()" [attr.height]="d.hParciales" class="fill-warning" />
          </g>
        }
        @if ($index % 5 === 0) {
          <text [attr.x]="d.x + barra() / 2" [attr.y]="H - 8" text-anchor="middle" class="fill-text-tertiary" font-size="10">{{ d.etiqueta }}</text>
        }
      }
      <line [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="H - PAD.bottom" [attr.y2]="H - PAD.bottom" class="stroke-line-strong" stroke-width="1" />
    </svg>
    <details class="text-body-xs text-text-tertiary">
      <summary class="cursor-pointer text-label-s text-text-secondary hover:text-text-primary">Ver los datos por día</summary>
      @if (conDatos().length) {
        <table class="mt-2 w-full text-left">
          <thead><tr class="border-b border-line-subtle"><th scope="col" class="py-1.5 font-medium">Día</th><th scope="col" class="py-1.5 text-right font-medium">Respuestas</th><th scope="col" class="py-1.5 text-right font-medium">Completas</th></tr></thead>
          <tbody>
            @for (d of conDatos(); track d.fecha) {
              <tr class="border-b border-line-subtle last:border-0"><td class="py-1.5">{{ d.etiqueta }}</td><td class="py-1.5 text-right font-mono tabular-nums">{{ d.respuestas }}</td><td class="py-1.5 text-right font-mono tabular-nums">{{ d.completas }}</td></tr>
            }
          </tbody>
        </table>
      } @else { <p class="mt-2">Sin respuestas en los últimos 30 días.</p> }
    </details>
  `,
})
export class BoGraficoDiario {
  readonly datos = input<DiaRespuestas[]>([]);
  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD = PAD;
  private readonly plot = W - PAD.left - PAD.right;
  private readonly slot = this.plot / DIAS;
  protected readonly barra = computed(() => this.slot * 0.6);

  /** Top of the axis: the largest day, rounded up to a multiple of 4 (at least 4). */
  private readonly yMax = computed(() => Math.ceil(Math.max(4, ...this.datos().map((d) => d.respuestas)) / 4) * 4);
  private readonly yPx = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / this.yMax());

  /** The last 30 days ending today (Madrid), each with its counts (zero when the server sent nothing for it). */
  protected readonly dias = computed<Dia[]>(() => {
    const porFecha = new Map(this.datos().map((d) => [d.fecha, d]));
    const hoy = fechaIso.format(new Date()).split('-').map(Number);
    const k = (H - PAD.top - PAD.bottom) / this.yMax();
    const out: Dia[] = [];
    for (let i = DIAS - 1; i >= 0; i--) {
      const utc = new Date(Date.UTC(hoy[0], hoy[1] - 1, hoy[2] - i));
      const fecha = utc.toISOString().slice(0, 10);
      const d = porFecha.get(fecha);
      const respuestas = d?.respuestas ?? 0;
      const completas = d?.completas ?? 0;
      const parciales = respuestas - completas;
      out.push({
        fecha,
        etiqueta: fechaCorta.format(utc).replace('.', ''),
        respuestas,
        completas,
        parciales,
        x: PAD.left + (DIAS - 1 - i) * this.slot + (this.slot - this.slot * 0.6) / 2,
        yCompletas: this.yPx(completas),
        hCompletas: completas * k,
        yParciales: this.yPx(respuestas),
        hParciales: parciales * k,
      });
    }
    return out;
  });

  /** Gridlines at 0, half and the top of the axis. */
  protected readonly grid = computed(() => [0, this.yMax() / 2, this.yMax()].map((v) => ({ v, y: this.yPx(v) })));

  protected readonly conDatos = computed(() => this.dias().filter((d) => d.respuestas > 0));
  protected readonly resumen = computed(() => {
    const total = this.dias().reduce((s, d) => s + d.respuestas, 0);
    return `Respuestas por día en los últimos 30 días: ${total} en total`;
  });
}
