import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrSkeleton, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoPagination, BoSearch } from '../../shared/kit';
import { BoTablaMovil } from '../../shared/ui';
import { FormulariosApi, type EstadoRespuesta, type Formulario, type RespuestaDetalle, type RespuestaFila } from './api';
import { BoRespuestaCampos } from './respuesta-detalle';
import { ESTADO_RESPUESTA, ORIGEN, fechaHora } from './formato';

const PAGINA = 20;
const DEBOUNCE_MS = 300;
/** Motion of the list ↔ detail switch (the contract's durations; off with prefers-reduced-motion). */
const SALIDA_MS = 180;
const ENTRADA_MS = 220;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

const CHIPS: { v: EstadoRespuesta | ''; label: string }[] = [
  { v: '', label: 'Todas' },
  { v: 'completa', label: 'Completas' },
  { v: 'parcial', label: 'Parciales' },
  { v: 'sin_respuesta', label: 'Sin respuesta' },
];

/** Nearest ancestor that scrolls vertically (the page scrolls inside the shell), or null for the window. */
function contenedorDeScroll(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}
const posicionScroll = (el: HTMLElement): number => contenedorDeScroll(el)?.scrollTop ?? window.scrollY;
function fijarScroll(el: HTMLElement, y: number): void {
  const c = contenedorDeScroll(el);
  if (c) c.scrollTop = y;
  else window.scrollTo({ top: y });
}
const reducido = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const nombreDe = (r: RespuestaFila): string => `${r.atleta.nombre} ${r.atleta.apellidos}`;
const clubDe = (r: RespuestaFila): string => [r.atleta.club, r.atleta.categoria].filter(Boolean).join(' · ');

/**
 * «Atletas» tab: the form's answers per athlete. Search (debounced), status chips, paginated table and CSV export.
 * Opening a row swaps the list for the answer (fade out 180 ms, fade in 220 ms; instant with reduced motion); «Volver»
 * reverses it and restores the scroll, search and page. Focus goes to the detail heading and back to the row.
 */
@Component({
  selector: 'bo-form-atletas',
  imports: [BoRespuestaCampos, BoSearch, BoPagination, BoTablaMovil, GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #vistaLista [hidden]="vista() !== 'lista'">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1 basis-64"><bo-search [value]="busqueda()" (valueChange)="onBuscar($event)" placeholder="Buscar atleta, club o categoría" [loading]="cargando()" [shortcut]="false" /></div>
          <button type="button" grButton variant="secondary" icon="download" [loading]="descargando()" (click)="exportar()">Exportar CSV</button>
        </div>
        <div role="group" aria-label="Filtrar por estado" class="flex flex-wrap gap-2">
          @for (c of chips; track c.v) {
            <button type="button" [attr.aria-pressed]="estadoFiltro() === c.v" (click)="filtrar(c.v)"
              class="h-11 rounded-pill border px-4 text-label-s transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none md:h-9"
              [class]="estadoFiltro() === c.v ? 'border-accent/60 bg-accent/14 text-text-primary' : 'border-line-strong bg-bg-field text-text-secondary hover:border-line-hover'">{{ c.label }}</button>
          }
        </div>

        @if (error()) { <gr-alert tone="danger" title="No hemos podido cargar las respuestas"><button grButton size="s" (click)="cargar()">Reintentar</button></gr-alert> }
        @if (filas(); as f) {
          @if (f.length) {
            <div class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table boTablaMovil class="w-full min-w-[840px] text-left text-body-s">
                <caption class="sr-only">Respuestas de «{{ formulario().nombre }}». Pulsa una fila con respuesta para verla.</caption>
                <thead class="text-label-xs text-text-tertiary uppercase">
                  <tr class="border-b border-line-subtle">
                    <th scope="col" class="px-4 py-3 font-medium">Atleta</th>
                    <th scope="col" class="px-4 py-3 font-medium">Club y categoría</th>
                    <th scope="col" class="px-4 py-3 font-medium">Estado</th>
                    <th scope="col" class="w-44 px-4 py-3 font-medium">Respondido</th>
                    <th scope="col" class="px-4 py-3 font-medium">Origen</th>
                    <th scope="col" class="px-4 py-3 font-medium">Fecha</th>
                    <th scope="col" class="w-10 px-2 py-3"><span class="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of f; track $index) {
                    <tr class="border-b border-line-subtle align-middle last:border-0"
                      [class]="r.id ? 'cursor-pointer hover:bg-bg-raised/60' : 'text-text-tertiary'"
                      [attr.data-fila]="r.id" [attr.tabindex]="r.id ? 0 : null" [attr.aria-disabled]="r.id ? null : 'true'" (click)="abrir(r)" (keydown.enter)="abrir(r)">
                      <td class="px-4 py-3"><span class="block text-label-m">{{ nombre(r) }}</span></td>
                      <td class="px-4 py-3 text-body-s text-text-tertiary">{{ clubDe(r) || '—' }}</td>
                      <td class="px-4 py-3"><gr-badge [tone]="etiqueta(r).tone" [attr.title]="etiqueta(r).ayuda ?? null">{{ etiqueta(r).label }}</gr-badge></td>
                      <td class="px-4 py-3">
                        @if (r.estado !== 'completa') {
                          <span class="flex items-center gap-3">
                            <span class="block h-1.5 min-w-16 flex-1 overflow-hidden rounded-pill bg-bg-raised" aria-hidden="true"><span class="block h-full rounded-pill bg-accent" [style.width.%]="r.porcentaje"></span></span>
                            <span class="w-12 shrink-0 text-right font-mono text-mono-xs tabular-nums">{{ r.porcentaje }} %</span>
                          </span>
                        }
                      </td>
                      <td class="px-4 py-3 text-body-s">
                        @if (r.origen; as o) { <span class="inline-flex items-center gap-1.5 text-text-secondary"><gr-icon [name]="origen[o].icon" [size]="14" class="text-text-tertiary" />{{ origen[o].label }}</span> } @else { <span class="text-text-muted">—</span> }
                      </td>
                      <td class="px-4 py-3 font-mono text-mono-xs whitespace-nowrap text-text-tertiary">{{ fecha(r) }}</td>
                      <td class="px-2 py-3 text-right">@if (r.id) { <gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <bo-pagination [page]="pagina()" [pages]="paginas()" [loading]="cargando()" (change)="irPagina($event)" />
          } @else {
            <gr-empty icon="user" [title]="busqueda() || estadoFiltro() ? 'Ningún atleta coincide' : 'Aún no hay atletas en este formulario'">
              {{ busqueda() || estadoFiltro() ? 'Cambia la búsqueda o el filtro.' : 'Los atletas aparecen aquí en cuanto el formulario se envía.' }}
            </gr-empty>
          }
        } @else if (filas() === undefined) { <gr-skeleton class="h-72 rounded-lg" /> }
      </div>
    </div>

    <div #vistaDetalle [hidden]="vista() !== 'detalle'">
      @if (abierta(); as r) {
        <div class="flex flex-col gap-5">
          <div><button type="button" grButton variant="ghost" icon="arrow-left" (click)="volver()">Volver</button></div>
          <header class="flex flex-wrap items-start gap-4">
            <div class="min-w-0 flex-1">
              <h2 #tituloDetalle tabindex="-1" class="text-ui-h3 break-words focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]">{{ nombre(r) }}</h2>
              <p class="mt-1 text-body-s text-text-tertiary">{{ clubDe(r) || 'Sin club ni categoría' }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-body-s">
              <gr-badge [tone]="etiqueta(r).tone" [attr.title]="etiqueta(r).ayuda ?? null">{{ etiqueta(r).label }}</gr-badge>
              @if (r.estado !== 'completa') { <span class="font-mono text-mono-s tabular-nums">{{ r.porcentaje }} %</span> }
              @if (r.origen; as o) { <span class="inline-flex items-center gap-1.5 text-text-tertiary"><gr-icon [name]="origen[o].icon" [size]="14" />Respondió por {{ origen[o].label.toLowerCase() }}</span> }
            </div>
          </header>
          @if (detalle(); as d) { <bo-respuesta-campos [detalle]="d" [versionActual]="formulario().version" /> }
          @else if (detalleError()) { <gr-alert tone="danger" title="No hemos podido cargar la respuesta"><button grButton size="s" (click)="reintentarDetalle()">Reintentar</button></gr-alert> }
          @else { <gr-skeleton class="h-64 rounded-lg" /> }
        </div>
      }
    </div>
  `,
})
export class BoFormAtletas {
  readonly formulario = input.required<Formulario>();
  private readonly api = inject(FormulariosApi);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  private readonly injector = inject(Injector);
  private readonly vistaLista = viewChild.required<ElementRef<HTMLElement>>('vistaLista');
  private readonly vistaDetalle = viewChild.required<ElementRef<HTMLElement>>('vistaDetalle');
  private readonly tituloDetalle = viewChild<ElementRef<HTMLElement>>('tituloDetalle');
  protected readonly chips = CHIPS;
  protected readonly origen = ORIGEN;
  protected readonly nombre = nombreDe;
  protected readonly clubDe = clubDe;
  protected readonly busqueda = signal('');
  protected readonly estadoFiltro = signal<EstadoRespuesta | ''>('');
  protected readonly pagina = signal(1);
  protected readonly total = signal(0);
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / PAGINA)));
  protected readonly filas = signal<RespuestaFila[] | null | undefined>(undefined);
  protected readonly cargando = signal(false);
  protected readonly error = signal(false);
  protected readonly descargando = signal(false);
  protected readonly vista = signal<'lista' | 'detalle'>('lista');
  /** Row whose answer is open: its header comes from the row, its body from the detail. */
  protected readonly abierta = signal<RespuestaFila | null>(null);
  protected readonly detalle = signal<RespuestaDetalle | null>(null);
  protected readonly detalleError = signal(false);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  /** Tracks the form id only, so saves of the same form do not reload the answers. */
  private readonly formularioId = computed(() => this.formulario().id);
  private peticion = 0;
  private seqDetalle = 0;
  private t: ReturnType<typeof setTimeout> | undefined;
  private posicion = 0;
  private ocupado = false;

  constructor() {
    effect(() => {
      const id = this.formularioId();
      if (!this.cid() || !id) return;
      untracked(() => void this.cargar());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.t));
  }

  protected etiqueta(r: RespuestaFila) {
    return ESTADO_RESPUESTA[r.estado];
  }

  protected fecha(r: RespuestaFila): string {
    return fechaHora(r.actualizadoAt ?? r.enviadoAt);
  }

  protected async cargar(): Promise<void> {
    const mine = ++this.peticion;
    this.cargando.set(true);
    try {
      const p = await this.api.respuestas(this.cid(), this.formulario().id, {
        estado: this.estadoFiltro(),
        q: this.busqueda().trim(),
        page: this.pagina(),
        size: PAGINA,
      });
      if (mine !== this.peticion) return;
      this.filas.set(p.items);
      this.total.set(p.total);
      this.error.set(false);
    } catch {
      if (mine !== this.peticion) return;
      this.error.set(true);
      if (!this.filas()) this.filas.set(null);
    } finally {
      if (mine === this.peticion) this.cargando.set(false);
    }
  }

  /** Debounced search: one request per pause in typing, always back to page 1. */
  protected onBuscar(q: string): void {
    this.busqueda.set(q);
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      this.pagina.set(1);
      void this.cargar();
    }, DEBOUNCE_MS);
  }

  protected filtrar(v: EstadoRespuesta | ''): void {
    if (v === this.estadoFiltro()) return;
    this.estadoFiltro.set(v);
    this.pagina.set(1);
    void this.cargar();
  }

  protected irPagina(p: number): void {
    this.pagina.set(p);
    void this.cargar();
  }

  protected async exportar(): Promise<void> {
    this.descargando.set(true);
    try {
      await this.api.descargarCsv(this.cid(), this.formulario().id, this.formulario().nombre);
    } catch {
      this.toasts.error('No se pudo exportar', 'Vuelve a intentarlo en unos segundos.');
    } finally {
      this.descargando.set(false);
    }
  }

  /** Opens the answer of a row (rows without an answer are not clickable). */
  protected async abrir(r: RespuestaFila): Promise<void> {
    if (!r.id || this.ocupado) return;
    this.ocupado = true;
    this.posicion = posicionScroll(this.vistaLista().nativeElement);
    this.abierta.set(r);
    await this.animar(this.vistaLista().nativeElement, [{ opacity: 1 }, { opacity: 0 }], SALIDA_MS);
    this.vista.set('detalle');
    afterNextRender(
      () => {
        void this.animar(this.vistaDetalle().nativeElement, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], ENTRADA_MS);
        this.tituloDetalle()?.nativeElement.focus({ preventScroll: true });
        fijarScroll(this.vistaDetalle().nativeElement, 0);
      },
      { injector: this.injector },
    );
    this.ocupado = false;
    await this.cargarDetalle(r.id);
  }

  protected reintentarDetalle(): void {
    const id = this.abierta()?.id;
    if (id) void this.cargarDetalle(id);
  }

  private async cargarDetalle(rid: string): Promise<void> {
    const mine = ++this.seqDetalle;
    this.detalle.set(null);
    this.detalleError.set(false);
    try {
      const d = await this.api.respuesta(this.cid(), this.formulario().id, rid);
      if (mine === this.seqDetalle) this.detalle.set(d);
    } catch {
      if (mine === this.seqDetalle) this.detalleError.set(true);
    }
  }

  /** «Volver»: the detail fades out, the list fades back in at the same scroll, search and page, focus on the row. */
  protected async volver(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    const id = this.abierta()?.id ?? null;
    await this.animar(this.vistaDetalle().nativeElement, [{ opacity: 1 }, { opacity: 0 }], SALIDA_MS);
    this.vista.set('lista');
    const y = this.posicion;
    afterNextRender(
      () => {
        void this.animar(this.vistaLista().nativeElement, [{ opacity: 0 }, { opacity: 1 }], ENTRADA_MS);
        fijarScroll(this.vistaLista().nativeElement, y);
        if (id) this.vistaLista().nativeElement.querySelector<HTMLElement>(`[data-fila="${id}"]`)?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
    this.ocupado = false;
  }

  /** Web Animations with the contract's easing; resolves at once with prefers-reduced-motion. */
  private animar(el: HTMLElement, frames: Keyframe[], ms: number): Promise<void> {
    if (reducido()) return Promise.resolve();
    return el.animate(frames, { duration: ms, easing: EASE }).finished.then(
      () => undefined,
      () => undefined,
    );
  }
}
