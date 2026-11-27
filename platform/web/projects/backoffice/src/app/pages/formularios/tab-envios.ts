import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrIcon, GrSkeleton } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoTablaMovil } from '../../shared/ui';
import { FormulariosApi, type CanalFormulario, type Envio, type Formulario } from './api';
import { BoEntregasBarra } from './entregas-barra';
import { CANAL, fechaHora } from './formato';
import { BoEnvioDialogo } from './envio-dialogo';
import { FormularioStore } from './store';

/** While any message waits in the queue the table refreshes on this rhythm (stopped on destroy). */
const REFRESCO_MS = 10_000;

/**
 * «Envíos» tab: the sends of the form (channels, totals and per-channel delivery) and the «Nuevo envío» dialog. A send
 * only queues messages; the table follows them until the queue is empty.
 */
@Component({
  selector: 'bo-form-envios',
  imports: [RouterLink, BoTablaMovil, BoEntregasBarra, BoEnvioDialogo, GrAlert, GrButton, GrEmpty, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <p class="min-w-0 flex-1 basis-72 text-body-s text-text-tertiary">Envía el formulario por email o WhatsApp. Cada mensaje lleva el enlace a la web.</p>
        <div class="flex flex-wrap gap-2">
          <a grButton variant="ghost" icon="send" [routerLink]="['/', comps.current()?.slug, 'sistema', 'cola-envio']">Cola de envío</a>
          <button type="button" grButton variant="primary" icon="plus" (click)="dialogo.set(true)">Nuevo envío</button>
        </div>
      </div>

      @if (error()) { <gr-alert tone="danger" title="No hemos podido cargar los envíos"><button grButton size="s" (click)="cargar()">Reintentar</button></gr-alert> }
      @if (lista(); as l) {
        @if (!l.length) {
          <gr-empty icon="send" title="Aún no hay envíos">Envía el formulario a los atletas por email o WhatsApp. Los mensajes salen al ritmo anti-spam.
            <button grButton variant="primary" class="mt-4" (click)="dialogo.set(true)">Nuevo envío</button></gr-empty>
        } @else {
          <div class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
            <table boTablaMovil class="w-full min-w-[860px] text-left text-body-s">
              <caption class="sr-only">Envíos de «{{ formulario().nombre }}», del más reciente al más antiguo</caption>
              <thead class="text-label-xs text-text-tertiary uppercase">
                <tr class="border-b border-line-subtle">
                  <th scope="col" class="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" class="px-4 py-3 font-medium">Canales</th>
                  <th scope="col" class="px-4 py-3 text-right font-medium">Destinatarios</th>
                  <th scope="col" class="px-4 py-3 text-right font-medium">Omitidos</th>
                  <th scope="col" class="px-4 py-3 font-medium">Email</th>
                  <th scope="col" class="px-4 py-3 font-medium">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                @for (e of l; track e.id) {
                  <tr class="border-b border-line-subtle align-top last:border-0">
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span class="text-label-m">{{ fecha(e.createdAt) }}</span>
                      @if (e.creadoPor) { <span class="block text-body-xs text-text-tertiary">{{ e.creadoPor }}</span> }
                    </td>
                    <td class="px-4 py-3">
                      <span class="flex flex-wrap gap-1.5">
                        @for (c of e.canales; track c) {
                          <span class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-label-s text-text-primary" [class]="c === 'email' ? 'border-info/50 bg-info/10 [&>gr-icon]:text-info' : 'border-success/50 bg-success/10 [&>gr-icon]:text-success'"><gr-icon [name]="icono(c)" [size]="14" />{{ etiqueta(c) }}</span>
                        }
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right font-mono text-mono-s tabular-nums">{{ n(e.total) }}</td>
                    <td class="px-4 py-3 text-right font-mono text-mono-s tabular-nums text-text-tertiary">{{ n(e.omitidos) }}</td>
                    <td class="w-56 px-4 py-3">
                      @if (e.canales.includes('email')) { <bo-entregas-barra [canal]="e.email" /> } @else { <span class="text-text-muted">—</span> }
                    </td>
                    <td class="w-56 px-4 py-3">
                      @if (e.canales.includes('whatsapp')) { <bo-entregas-barra [canal]="e.whatsapp" /> } @else { <span class="text-text-muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (enCola()) {
            <p class="flex items-center gap-2 text-body-xs text-text-tertiary" role="status"><gr-icon name="loader" [size]="14" class="motion-safe:animate-spin" />Hay mensajes en cola: la tabla se actualiza sola cada 10 segundos.</p>
          }
        }
      } @else if (lista() === undefined) { <gr-skeleton class="h-72 rounded-lg" /> }
    </div>

    @if (dialogo()) {
      <bo-envio-dialogo [formulario]="formulario()" (cerrar)="dialogo.set(false)" (enviado)="alEnviar()" />
    }
  `,
})
export class BoFormEnvios {
  readonly formulario = input.required<Formulario>();
  protected readonly comps = inject(Competitions);
  private readonly api = inject(FormulariosApi);
  private readonly store = inject(FormularioStore);
  protected readonly n = (v: number) => v.toLocaleString('es-ES');
  protected readonly fecha = fechaHora;
  protected readonly etiqueta = (c: CanalFormulario) => CANAL[c].label;
  protected readonly icono = (c: CanalFormulario) => CANAL[c].icon;
  protected readonly lista = signal<Envio[] | null | undefined>(undefined);
  protected readonly error = signal(false);
  protected readonly dialogo = signal(false);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  /** Tracks the form id only: saves and status changes of the same form do not reload the tab. */
  private readonly formularioId = computed(() => this.formulario().id);
  /** Some channel still has messages waiting: the table keeps refreshing. */
  protected readonly enCola = computed(() => (this.lista() ?? []).some((e) => e.email.enCola > 0 || e.whatsapp.enCola > 0));
  private refresco: ReturnType<typeof setTimeout> | undefined;
  /** Number of the latest load: the answer of an older, overlapped load is dropped. */
  private turno = 0;
  private destruido = false;

  constructor() {
    effect(() => {
      const id = this.formularioId();
      if (!this.cid() || !id) return;
      untracked(() => void this.cargar());
    });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      clearTimeout(this.refresco);
    });
  }

  /**
   * Single live load: an overlapped call (send, form change, retry) makes the earlier answer stale, and only the latest
   * load schedules the next refresh, so one timer runs at a time.
   */
  protected async cargar(): Promise<void> {
    const mine = ++this.turno;
    clearTimeout(this.refresco);
    try {
      const lista = await this.api.envios(this.cid(), this.formularioId());
      if (this.obsoleta(mine)) return;
      this.lista.set(lista);
      this.error.set(false);
    } catch {
      if (this.obsoleta(mine)) return;
      this.error.set(true);
      if (!this.lista()) this.lista.set(null);
    }
    if (this.enCola()) this.refresco = setTimeout(() => void this.cargar(), REFRESCO_MS);
  }

  private obsoleta(mine: number): boolean {
    return mine !== this.turno || this.destruido;
  }

  /** A send moves a draft to active on the server: the editor header follows. */
  protected async alEnviar(): Promise<void> {
    this.dialogo.set(false);
    try {
      const f = await this.api.get(this.cid(), this.formulario().id);
      this.store.setEstado(f.estado, f.actualizadoAt);
    } catch {
      // the header keeps the previous state until the next reload
    }
    await this.cargar();
  }
}
