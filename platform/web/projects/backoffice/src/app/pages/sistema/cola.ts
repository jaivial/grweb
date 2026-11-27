import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrErrorState, GrIcon, GrSelect, GrSkeleton, type GrTone } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoDrawer, BoPageHeader, BoTabBar, BoTablaMovil, BoTabs, errText, type BoTabOpcion } from '../../shared/ui';
import { fechaDMA } from './api';
import { ColaApi, type CanalCola, type ColaItem, type ColaPagina, type FiltroCola, type IntentoCola } from './cola-api';
import { sistemaTabs } from './tabs';

const ESTADO: Record<string, { l: string; tone: GrTone }> = {
  en_cola: { l: 'En cola', tone: 'neutral' }, reintentando: { l: 'En espera', tone: 'warning' }, enviando: { l: 'Enviando', tone: 'info' },
  enviado: { l: 'Enviado', tone: 'success' }, fallido: { l: 'Fallido', tone: 'danger' }, rebotado: { l: 'Rebotado', tone: 'danger' },
  pausa: { l: 'En pausa', tone: 'warning' }, omitido: { l: 'Omitido', tone: 'neutral' }, cancelado: { l: 'Cancelado', tone: 'neutral' },
};
const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const fechaHora = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
const dos = (n: number) => String(n).padStart(2, '0');

/**
 * «Sistema › Cola de envío»: the WhatsApp and email notifications waiting for their turn (ritmo anti-spam of
 * messaging), the failed ones with the log of their tries and the sent ones. Live: the admin stream's
 * «mensaje.estado» reloads the page and the countdown ticks every second against the server clock.
 */
@Component({
  selector: 'bo-sistema-cola',
  imports: [FormsModule, BoPageHeader, BoTabs, BoTabBar, BoTablaMovil, BoDrawer, GrAlert, GrBadge, GrButton, GrEmpty, GrErrorState, GrIcon, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Cola de envío" [crumbs]="['Sistema', 'Sistema e integraciones', 'Cola de envío']" />
      <bo-tabs [tabs]="tabs()" />
      @if (!puede()) { <gr-alert tone="info" icon="lock" title="Sin permiso">Necesitas el permiso «campañas» para ver la cola de envío.</gr-alert> }
      @else {
        <div class="flex flex-wrap items-end gap-4">
          <bo-tab-bar class="min-w-0 flex-1" label="Canal" [alwaysTabs]="true" [tabs]="canales()" [value]="canal()" (valueChange)="elegirCanal($event)" />
          <gr-select class="w-56" tipo="filtro" aria-label="Estado" [ngModel]="filtro()" (ngModelChange)="elegirFiltro($event)">
            @for (f of filtros(); track f.value) { <option [value]="f.value">{{ f.label }}</option> }
          </gr-select>
          <span class="flex items-center gap-2 text-body-xs text-text-tertiary" [title]="rt.status() === 'connected' ? 'Recibiendo cambios en tiempo real' : 'Reconectando con el servidor'">
            <span class="size-2 rounded-full" [class]="rt.status() === 'connected' ? 'bg-success' : 'bg-warning'"></span>{{ rt.status() === 'connected' ? 'En vivo' : 'Reconectando…' }}
          </span>
        </div>
        @if (error()) { <gr-error-state titulo="No se pudo cargar la cola de envío" texto="Comprueba la conexión y vuelve a intentarlo." (reintentar)="cargar()" /> }
        @else if (pagina(); as p) {
          <div class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
            <table boTablaMovil class="w-full min-w-[920px] text-left text-body-s">
              <thead class="text-label-xs text-text-tertiary uppercase">
                <tr class="border-b border-line-subtle">
                  <th class="px-4 py-3 font-medium">Atleta</th>
                  <th class="px-4 py-3 font-medium">{{ canal() === 'whatsapp' ? 'Teléfono' : 'Email' }}</th>
                  <th class="px-4 py-3 font-medium">{{ filtro() === 'pendientes' ? 'Sale en' : filtro() === 'enviados' ? 'Enviado' : 'Falló' }}</th>
                  <th class="px-4 py-3 font-medium">Notificación</th>
                  <th class="px-4 py-3 font-medium">Estado</th>
                  <th class="px-4 py-3 font-medium"><span class="sr-only">Registro</span></th>
                </tr>
              </thead>
              <tbody>
                @for (m of p.items; track m.id) {
                  <tr class="border-b border-line-subtle align-top last:border-0">
                    <td class="px-4 py-3"><span class="text-label-m">{{ m.atleta || '—' }}</span>@if (m.prueba) { <gr-badge class="ml-2" tone="info">Prueba</gr-badge> }</td>
                    <td class="px-4 py-3 font-mono text-mono-s break-all">{{ m.destino }}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      @if (filtro() === 'pendientes') {
                        <span class="font-mono text-mono-m tabular-nums" [class.text-accent-text]="enSegundos(m) <= 60">{{ cuentaAtras(m) }}</span>
                        @if (m.proximoAt) { <span class="block text-body-xs text-text-tertiary">a las {{ horaDe(m.proximoAt) }}</span> }
                      } @else { <span class="text-body-s text-text-secondary">{{ fechaHoraDe(filtro() === 'enviados' ? m.enviadoAt || m.updatedAt : m.updatedAt) }}</span> }
                    </td>
                    <td class="max-w-[420px] px-4 py-3">
                      <p class="truncate text-label-m" [title]="m.titulo">{{ m.titulo || '—' }}</p>
                      <p class="line-clamp-2 text-body-xs text-text-tertiary" [title]="m.resumen">{{ m.resumen }}</p>
                    </td>
                    <td class="max-w-[280px] px-4 py-3">
                      <gr-badge [tone]="estado(m.estado).tone">{{ estado(m.estado).l }}</gr-badge>
                      <span class="mt-1 line-clamp-2 block text-body-xs text-text-tertiary" [title]="m.detalle">{{ m.intentos }} {{ m.intentos === 1 ? 'intento' : 'intentos' }}{{ m.detalle ? ' · ' + m.detalle : '' }}</span>
                    </td>
                    <td class="px-4 py-3 text-right"><button grButton size="s" variant="ghost" (click)="verRegistro(m)"><gr-icon name="history" [size]="16" />Registro</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="6"><gr-empty icon="inbox" [title]="vacio()" [text]="filtro() === 'pendientes' ? 'Los avisos nuevos aparecen aquí en cuanto entran en la cola.' : null" /></td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (p.total > p.por) {
            <div class="flex items-center justify-between text-body-xs text-text-tertiary">
              <span>{{ (p.pagina - 1) * p.por + 1 }}–{{ min(p.pagina * p.por, p.total) }} de {{ p.total }}</span>
              <span class="flex gap-2">
                <button grButton size="s" variant="ghost" [disabled]="p.pagina <= 1" (click)="irPagina(p.pagina - 1)">Anterior</button>
                <button grButton size="s" variant="ghost" [disabled]="p.pagina * p.por >= p.total" (click)="irPagina(p.pagina + 1)">Siguiente</button>
              </span>
            </div>
          }
        } @else { <gr-skeleton class="h-96 rounded-lg" /> }
      }
    </div>
    <bo-drawer [open]="!!registro()" (openChange)="$event || registro.set(null)" title="Registro de intentos" [sub]="registro() ? (registro()!.atleta || registro()!.destino) + ' · ' + registro()!.titulo : ''">
      @if (registroError()) { <gr-alert tone="danger" icon="circle-alert" title="No se pudo cargar el registro">{{ registroError() }}</gr-alert> }
      @else if (intentos(); as is) {
        <ol class="flex flex-col gap-3">
          @for (i of is; track $index) {
            <li class="rounded-md border border-line-subtle p-4">
              <div class="flex items-center gap-2"><gr-badge [tone]="estado(i.estado).tone">{{ estado(i.estado).l }}</gr-badge><span class="text-body-xs text-text-tertiary">Intento {{ i.intento }} · {{ fechaHoraDe(i.at) }}</span></div>
              @if (i.detalle) { <p class="mt-2 text-body-s">{{ i.detalle }}</p> }
              @if (i.tecnico) { <p class="mt-2 font-mono text-mono-xs break-words text-text-tertiary">{{ i.tecnico }}</p> }
            </li>
          } @empty { <li class="text-body-s text-text-tertiary">Todavía no hay intentos: el mensaje espera su turno.</li> }
        </ol>
      } @else { <gr-skeleton class="h-40" /> }
      <ng-container drawerActions><button grButton variant="primary" (click)="registro.set(null)">Cerrar</button></ng-container>
    </bo-drawer>
  `,
})
export class SistemaColaPage {
  private readonly api = inject(ColaApi);
  private readonly cs = inject(Competitions);
  private readonly auth = inject(Auth);
  protected readonly rt = inject(Realtime);
  protected readonly min = Math.min;
  protected readonly canal = signal<CanalCola>('whatsapp');
  protected readonly filtro = signal<FiltroCola>('pendientes');
  private readonly numPagina = signal(1);
  protected readonly pagina = signal<ColaPagina | null>(null);
  protected readonly error = signal(false);
  protected readonly registro = signal<ColaItem | null>(null);
  protected readonly intentos = signal<IntentoCola[] | null>(null);
  protected readonly registroError = signal('');
  private readonly ahora = signal(Date.now());
  /** Server clock minus browser clock, measured on every load. */
  private desfase = 0;
  private recarga: ReturnType<typeof setTimeout> | undefined;
  private peticion = 0;
  private readonly cid = computed(() => this.cs.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'campanas.enviar'));
  protected readonly tabs = computed(() => sistemaTabs({ cola: this.pagina() ? this.pagina()!.cuentas.whatsapp.pendientes + this.pagina()!.cuentas.email.pendientes : null }));
  protected readonly canales = computed<BoTabOpcion[]>(() => {
    const c = this.pagina()?.cuentas;
    return [
      { value: 'whatsapp', label: 'WhatsApp', count: c ? c.whatsapp.pendientes : null },
      { value: 'email', label: 'Email', count: c ? c.email.pendientes : null },
    ];
  });
  protected readonly filtros = computed(() => {
    const c = this.pagina()?.cuentas[this.canal()];
    const n = (k: FiltroCola) => (c ? ` (${c[k]})` : '');
    return [
      { value: 'pendientes', label: 'Pendientes' + n('pendientes') },
      { value: 'fallidos', label: 'Fallidos' + n('fallidos') },
      { value: 'enviados', label: 'Enviados' + n('enviados') },
    ];
  });
  protected readonly vacio = computed(() => ({ pendientes: 'No hay nada pendiente de enviar', fallidos: 'Ningún envío ha fallado', enviados: 'Todavía no se ha enviado nada' })[this.filtro()]);

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => this.cargar());
    });
    const t = setInterval(() => this.ahora.set(Date.now()), 1000);
    const sub = this.rt.events.subscribe((e) => {
      if (e.tipo !== 'mensaje.estado') return;
      // a burst (a queue being drained, a bulk send) becomes one reload
      clearTimeout(this.recarga);
      this.recarga = setTimeout(() => void this.cargar(true), 700);
    });
    const resync = this.rt.resync.subscribe(() => void this.cargar(true));
    inject(DestroyRef).onDestroy(() => {
      clearInterval(t);
      clearTimeout(this.recarga);
      sub.unsubscribe();
      resync.unsubscribe();
    });
  }

  protected async cargar(silencioso = false): Promise<void> {
    if (!this.puede()) return;
    const n = ++this.peticion;
    this.error.set(false);
    if (!silencioso) this.pagina.set(null);
    try {
      const p = await this.api.lista(this.cid(), this.canal(), this.filtro(), this.numPagina());
      if (n !== this.peticion) return; // a newer filter or page already asked
      this.desfase = new Date(p.ahora).getTime() - Date.now();
      // a page emptied by the queue moving on goes back to the last one with rows
      if (!p.items.length && p.pagina > 1 && p.total > 0) {
        this.numPagina.set(Math.ceil(p.total / p.por));
        return this.cargar(silencioso);
      }
      this.pagina.set(p);
    } catch {
      if (n === this.peticion && !silencioso) this.error.set(true);
    }
  }
  protected elegirCanal(v: string): void {
    this.canal.set(v as CanalCola);
    this.numPagina.set(1);
    void this.cargar();
  }
  protected elegirFiltro(v: string): void {
    this.filtro.set(v as FiltroCola);
    this.numPagina.set(1);
    void this.cargar();
  }
  protected irPagina(n: number): void {
    this.numPagina.set(n);
    void this.cargar();
  }
  protected async verRegistro(m: ColaItem): Promise<void> {
    this.registro.set(m);
    this.intentos.set(null);
    this.registroError.set('');
    try {
      const is = await this.api.intentos(this.cid(), m.id);
      if (this.registro()?.id === m.id) this.intentos.set(is);
    } catch (e) {
      if (this.registro()?.id === m.id) this.registroError.set(errText(e, 'Inténtalo de nuevo en unos segundos.'));
    }
  }
  protected estado(e: string) { return ESTADO[e] ?? { l: e, tone: 'neutral' as GrTone }; }
  /** Seconds until the message's turn (server clock). */
  protected enSegundos(m: ColaItem): number {
    if (!m.proximoAt) return 0;
    return Math.ceil((new Date(m.proximoAt).getTime() - (this.ahora() + this.desfase)) / 1000);
  }
  protected cuentaAtras(m: ColaItem): string {
    if (m.estado === 'enviando') return 'Enviando…';
    const s = this.enSegundos(m);
    if (s <= 0) return 'Saliendo…';
    if (s < 3600) return `${dos(Math.floor(s / 60))}:${dos(s % 60)}`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ${dos(Math.floor((s % 3600) / 60))} min`;
    return fechaDMA(m.proximoAt);
  }
  protected horaDe(iso: string): string { return hora.format(new Date(iso)); }
  protected fechaHoraDe(iso?: string): string { return iso ? fechaHora.format(new Date(iso)) : ''; }
}
