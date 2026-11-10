import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, BoToggle, errText } from '../../../shared/ui';
import { SoAjuste, SoCard, SoNumber, SoPuesto, SoSkelFilas, SoSkelKpis, descargarCsv, euros, fecha, hora, iniciales, num } from '../ui';
import { DonacionesApi, type ConfigDonaciones, type Donacion, type KpisDonaciones, type ListaDonaciones, type RankingDonaciones } from './api';

type Estado = 'pendiente' | 'pagada' | 'caducada' | 'reembolsando' | 'reembolsada';
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// El mapa es parcial a propósito: un estado que el backend añada después no puede romper la página (la etiqueta
// sale tal cual y con tono neutro).
const ESTADOS: Partial<Record<Estado, { l: string; tone: Tone }>> = {
  pagada: { l: 'Pagada', tone: 'success' },
  pendiente: { l: 'Pendiente', tone: 'warning' },
  caducada: { l: 'Caducada', tone: 'neutral' },
  reembolsando: { l: 'Reembolsando…', tone: 'warning' },
  reembolsada: { l: 'Reembolsada', tone: 'info' },
};

interface FormConfig {
  activo: boolean;
  minimo: number;
  maximo: number;
  coinsPorEuro: number;
  importesSugeridos: number[];
}

const VACIO: FormConfig = { activo: true, minimo: 100, maximo: 50000, coinsPorEuro: 100, importesSugeridos: [500, 1000, 2000, 5000] };

/**
 * «Donaciones» (Figma 73 · «BO · Donaciones»).
 * KPIs, listado con filtros y paginación, reembolso con confirmación y configuración de los donativos.
 */
/**
 * «Donaciones» (Figma 73 · «BO · Donaciones», UI v2).
 * KPIs, listado con filtros y paginación (tabla en escritorio, tarjetas en móvil), reembolso con confirmación,
 * configuración de los donativos y el top de donantes del día.
 */
@Component({
  selector: 'bo-donaciones',
  imports: [A11yModule, FormsModule, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, SoAjuste, SoCard, SoNumber, SoPuesto, SoSkelFilas, SoSkelKpis],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'reembolso.set(null); verRanking.set(false)' },
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Donaciones" [badge]="pasarela()" [badgeTone]="pasarela() === 'Stripe en verde' ? 'success' : 'neutral'"
        subtitle="GRS coins de exhibición: coins = euros × 100 · solo se anuncian en el chat, nunca son gastables (§5)"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Donaciones']">
        <ng-container actions>
          <button grButton icon="download" [disabled]="!lista()" (click)="exportar()">Exportar CSV</button>
          <button grButton variant="primary" icon="award" (click)="verRanking.set(true)">Ver ranking</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar las donaciones">Hace falta el permiso «sorteo.gestionar».</gr-alert>
      }

      @if (cargando() && !kpis()) {
        <so-skel-kpis />
      } @else {
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <gr-kpi label="Recaudado hoy" [value]="euros(ranking()?.totalRecaudado ?? 0)" [caption]="donativosHoy() + (donativosHoy() === 1 ? ' donativo hoy' : ' donativos hoy')" />
          <gr-kpi label="Total" [value]="euros(kpis()?.recaudado ?? 0)" [caption]="num(kpis()?.pagadas ?? 0) + ((kpis()?.pagadas ?? 0) === 1 ? ' donativo pagado' : ' donativos pagados')" />
          <gr-kpi label="Donantes" [value]="num(kpis()?.donantes ?? null)" caption="en la competición" />
          <gr-kpi label="Ticket medio" [value]="euros(ticketMedio())" caption="por donativo pagado" />
        </div>
      }

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <!-- ===== Listado ===== -->
        <section class="flex min-w-0 flex-col self-start overflow-hidden rounded-lg border border-line-subtle bg-bg-card" aria-label="Donaciones">
          <div class="flex flex-wrap items-center gap-3 border-b border-line-subtle p-4">
            <label class="relative min-w-0 flex-1 basis-56">
              <span class="sr-only">Buscar</span>
              <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
              <input grInput class="pl-9" placeholder="Alias, mensaje o fan…" [ngModel]="filtro().q" (ngModelChange)="buscar($event)" />
            </label>
            <gr-select tipo="filtro" etiqueta="Estado" [ngModel]="filtro().estado" (ngModelChange)="filtrar({ estado: $event })">
              <option value="">Todos</option>
              <option value="pagada">Pagadas</option>
              <option value="pendiente">Pendientes</option>
              <option value="caducada">Caducadas</option>
              <option value="reembolsando">Reembolsando</option>
              <option value="reembolsada">Reembolsadas</option>
            </gr-select>
          </div>

          @if (cargando() && !lista()) {
            <so-skel-filas [n]="6" />
          } @else if (error()) {
            <gr-empty icon="wifi-off" title="No hemos podido cargar las donaciones" [text]="error()">
              <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
            </gr-empty>
          } @else if (lista(); as l) {
            @if (!l.items.length) {
              @if (filtro().q || filtro().estado) {
                <gr-empty icon="search" title="Ninguna donación coincide" text="Prueba con otro alias o quita el filtro de estado.">
                  <button grButton (click)="limpiar()">Quitar filtros</button>
                </gr-empty>
              } @else {
                <gr-empty icon="heart" title="Aún no hay donaciones" text="Cuando un fan done desde /en-directo aparecerá aquí, con su mensaje y el estado del pago." />
              }
            } @else {
              <!-- escritorio -->
              <div class="hidden overflow-x-auto md:block">
                <table class="w-full min-w-[720px] text-left text-body-s">
                  <thead class="border-b border-line-subtle bg-bg-surface font-mono text-mono-xs text-text-tertiary">
                    <tr><th class="px-4 py-3 font-medium">Fecha</th><th class="px-3 py-3 font-medium">Donante</th><th class="px-3 py-3 text-right font-medium">Importe</th><th class="px-3 py-3 font-medium">Mensaje</th><th class="px-3 py-3 font-medium">Estado</th><th class="px-4 py-3"><span class="sr-only">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    @for (d of l.items; track d.id) {
                      @let apagada = d.estado === 'reembolsada' || d.estado === 'caducada';
                      <tr class="border-b border-line-subtle transition-colors last:border-0 hover:bg-bg-raised/40">
                        <td class="px-4 py-2.5 font-mono text-mono-s whitespace-nowrap text-text-tertiary">{{ fecha(d.createdAt) }}</td>
                        <td class="px-3 py-2.5">
                          <div class="flex items-center gap-2.5">
                            <span class="flex size-8 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-bg-raised font-mono text-mono-xs text-text-secondary">
                              @if (d.anonimo) { <gr-icon name="user" [size]="14" /> } @else { {{ iniciales(d.alias || '·') }} }
                            </span>
                            <div class="min-w-0">
                              <p class="truncate text-label-s" [class.text-text-tertiary]="apagada">{{ d.alias || 'Anónimo' }}</p>
                              <p class="truncate text-body-xs text-text-tertiary">{{ d.proveedor }}{{ d.anonimo ? ' · anónimo en el chat' : '' }}</p>
                            </div>
                          </div>
                        </td>
                        <td class="px-3 py-2.5 text-right font-mono text-mono-s whitespace-nowrap" [class]="apagada ? 'text-text-tertiary line-through' : 'text-text-primary'">{{ euros(d.importe) }}</td>
                        <td class="max-w-[220px] truncate px-3 py-2.5 text-text-tertiary" [title]="d.mensaje || ''">{{ d.mensaje || '—' }}</td>
                        <td class="px-3 py-2.5"><gr-badge [tone]="est(d.estado).tone">{{ est(d.estado).l }}</gr-badge></td>
                        <td class="px-4 py-2.5 text-right">
                          @if (d.estado === 'pagada') {
                            <button grButton size="s" variant="ghost" icon="undo" [attr.aria-label]="'Reembolsar la donación de ' + (d.alias || 'Anónimo')" [disabled]="!puede()" (click)="abrirReembolso(d)">Reembolsar</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <!-- móvil -->
              <ul class="divide-y divide-line-subtle md:hidden">
                @for (d of l.items; track d.id) {
                  <li class="flex flex-col gap-2 p-4">
                    <div class="flex items-start gap-3">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-label-s">{{ d.alias || 'Anónimo' }}</p>
                        <p class="font-mono text-mono-xs text-text-tertiary">{{ fecha(d.createdAt) }} · {{ d.proveedor }}</p>
                      </div>
                      <span class="font-mono text-mono-s" [class.line-through]="d.estado === 'reembolsada'">{{ euros(d.importe) }}</span>
                    </div>
                    @if (d.mensaje) { <p class="text-body-s text-text-tertiary">«{{ d.mensaje }}»</p> }
                    <div class="flex items-center gap-2">
                      <gr-badge [tone]="est(d.estado).tone">{{ est(d.estado).l }}</gr-badge>
                      @if (d.estado === 'pagada') {
                        <button grButton variant="ghost" icon="undo" class="ml-auto" [disabled]="!puede()" (click)="abrirReembolso(d)">Reembolsar</button>
                      }
                    </div>
                  </li>
                }
              </ul>
            }
            <footer class="flex items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">
              <span>Mostrando {{ l.items.length ? (l.pagina - 1) * l.por + 1 : 0 }}–{{ (l.pagina - 1) * l.por + l.items.length }} de {{ num(l.total) }}</span>
              <span class="flex items-center gap-1">
                <button grIconButton icon="chevron-left" label="Página anterior" [disabled]="l.pagina <= 1" (click)="filtrar({ pagina: l.pagina - 1 }, false)"></button>
                <span class="min-w-12 text-center font-mono text-mono-s text-text-secondary">{{ l.pagina }} / {{ paginas(l) }}</span>
                <button grIconButton icon="chevron-right" label="Página siguiente" [disabled]="l.pagina * l.por >= l.total" (click)="filtrar({ pagina: l.pagina + 1 }, false)"></button>
              </span>
            </footer>
          }
        </section>

        <!-- ===== Configuración y top ===== -->
        <aside class="flex min-w-0 flex-col gap-6">
          <so-card titulo="Configuración de donativos" ayuda="Lo que ve el fan al donar en /en-directo (§5)">
            <so-ajuste label="Donaciones activas" ayuda="El botón Donar aparece en /en-directo">
              <bo-toggle [value]="form().activo" label="Donaciones activas" [disabled]="!puede()" (changed)="set({ activo: $event })" />
            </so-ajuste>
            <hr class="border-line-subtle" />
            <div class="grid grid-cols-2 gap-3">
              <gr-field label="Mínimo" hint="Cubre comisiones">
                <span class="relative block">
                  <input grInput type="number" min="1" class="pr-8 text-right font-mono" [ngModel]="form().minimo / 100" (ngModelChange)="set({ minimo: Math.round(+$event * 100) })" [disabled]="!puede()" />
                  <span class="absolute top-1/2 right-3 -translate-y-1/2 text-body-xs text-text-tertiary">€</span>
                </span>
              </gr-field>
              <gr-field label="Máximo" hint="Por donativo">
                <span class="relative block">
                  <input grInput type="number" min="1" class="pr-8 text-right font-mono" [ngModel]="form().maximo / 100" (ngModelChange)="set({ maximo: Math.round(+$event * 100) })" [disabled]="!puede()" />
                  <span class="absolute top-1/2 right-3 -translate-y-1/2 text-body-xs text-text-tertiary">€</span>
                </span>
              </gr-field>
            </div>
            <so-ajuste label="Coins por euro" ayuda="GRS coins de exhibición · se anuncian, no se gastan">
              <so-number ancho="xs" unidad="coins" label="Coins por euro" [disabled]="!puede()" [valor]="form().coinsPorEuro" [cambiado]="form().coinsPorEuro !== config()?.coinsPorEuro" (changed)="set({ coinsPorEuro: $event })" />
            </so-ajuste>
            <div class="flex flex-col gap-2">
              <p class="text-label-s">Importes sugeridos</p>
              <div class="flex flex-wrap gap-2">
                @for (s of form().importesSugeridos; track $index) {
                  <span class="inline-flex h-9 items-center gap-1 rounded-pill border border-line-strong bg-bg-raised pr-1 pl-3 text-label-s">
                    {{ s / 100 }} €
                    <button type="button" class="flex size-7 items-center justify-center rounded-pill text-text-tertiary hover:bg-bg-card hover:text-text-primary" [attr.aria-label]="'Quitar ' + (s / 100) + ' euros'" [disabled]="!puede()" (click)="quitarSugerido(s)">
                      <gr-icon name="x" [size]="12" />
                    </button>
                  </span>
                }
                @if (form().importesSugeridos.length < 6) {
                  <label class="inline-flex h-9 cursor-text items-center gap-1.5 rounded-pill border border-dashed border-line-strong pr-2 pl-3 text-label-s text-text-tertiary focus-within:border-accent-text hover:border-text-muted">
                    <gr-icon name="plus" [size]="14" />
                    <input type="number" class="w-16 bg-transparent text-label-s text-text-primary outline-none placeholder:text-text-muted" min="1" placeholder="Añadir" [value]="nuevoSugerido() || ''"
                      (input)="nuevoSugerido.set(+$any($event.target).value)" (keydown.enter)="$event.preventDefault(); anadirSugerido()" (change)="anadirSugerido()" aria-label="Nuevo importe sugerido en euros" [disabled]="!puede()" />€
                  </label>
                }
              </div>
              <p class="text-body-xs text-text-tertiary">En euros · máximo 6 botones</p>
            </div>
            <footer class="flex flex-col gap-3 border-t border-line-subtle pt-4">
              <p class="flex items-center gap-2 text-label-s">
                <gr-icon [name]="sucio() ? 'pencil' : 'circle-check'" [size]="16" [class]="sucio() ? 'text-warning' : 'text-success'" />
                {{ sucio() ? 'Cambios sin guardar' : 'Todo guardado' }}
                <span class="ml-auto font-mono text-mono-xs text-text-tertiary">v{{ config()?.version ?? '—' }}</span>
              </p>
              @if (sucio()) {
                <div class="flex gap-2">
                  <button grButton class="flex-1" (click)="descartar()">Descartar</button>
                  <button grButton class="flex-1" variant="primary" [loading]="guardando()" [disabled]="!puede()" (click)="guardar()">Guardar</button>
                </div>
              } @else {
                <p class="text-body-xs text-text-tertiary">Webhook verificado e idempotente</p>
              }
            </footer>
          </so-card>

          <so-card titulo="Top donantes de hoy" [ayuda]="euros(ranking()?.totalRecaudado ?? 0) + ' recaudados hoy'">
            <ol class="-mt-1 flex flex-col divide-y divide-line-subtle">
              @for (r of (ranking()?.items ?? []).slice(0, 3); track r.puesto) {
                <li class="flex items-center gap-3 py-2">
                  <so-puesto [n]="r.puesto" />
                  <span class="min-w-0 flex-1 truncate text-body-s">{{ r.alias }}</span>
                  <span class="shrink-0 text-body-xs text-text-tertiary">{{ r.donativos }} don.</span>
                  <span class="shrink-0 font-mono text-mono-s">{{ euros(r.total) }}</span>
                </li>
              } @empty { <li class="py-4 text-body-s text-text-tertiary">Todavía no hay donaciones de hoy.</li> }
            </ol>
            @if ((ranking()?.items?.length ?? 0) > 3) {
              <button type="button" class="self-start text-label-s text-accent-text hover:underline" (click)="verRanking.set(true)">Ver ranking completo</button>
            }
          </so-card>
        </aside>
      </div>
    </div>

    <!-- ===== Reembolso ===== -->
    @if (reembolso(); as d) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" (click)="reembolso.set(null)">
        <form class="w-full max-w-md rounded-t-xl border border-line-strong bg-bg-card shadow-card sm:rounded-lg" role="alertdialog" aria-modal="true" aria-labelledby="re-titulo"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()" (ngSubmit)="reembolsar()">
          <header class="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-deep/50 text-accent-text"><gr-icon name="undo" [size]="20" /></span>
            <div class="min-w-0 flex-1">
              <h2 id="re-titulo" class="text-ui-h5">Reembolsar {{ euros(d.importe) }}</h2>
              <p class="truncate text-body-xs text-text-tertiary">{{ d.alias || 'Anónimo' }} · {{ d.proveedor }} · {{ fecha(d.createdAt) }}</p>
            </div>
            <button type="button" grIconButton icon="x" label="Cerrar" (click)="reembolso.set(null)"></button>
          </header>
          <div class="flex flex-col gap-4 px-5 py-5">
            <p class="text-body-s text-text-secondary">La pasarela devolverá el importe en 5–10 días y se retirará la recompensa de fantasy. No se puede deshacer.</p>
            <gr-field label="Motivo" hint="Queda en el registro del reembolso" [error]="motivo().length > 0 && motivo().trim().length < 3 ? 'Escribe al menos 3 caracteres.' : ''">
              <input grInput name="motivo" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" maxlength="200" placeholder="Compra duplicada" />
            </gr-field>
          </div>
          <footer class="flex justify-end gap-2 border-t border-line-subtle px-5 py-4">
            <button type="button" grButton variant="ghost" (click)="reembolso.set(null)">Cancelar</button>
            <button type="submit" grButton variant="danger" [loading]="ocupado()" [disabled]="motivo().trim().length < 3">Reembolsar {{ euros(d.importe) }}</button>
          </footer>
        </form>
      </div>
    }

    <!-- ===== Ranking ===== -->
    @if (verRanking()) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" (click)="verRanking.set(false)">
        <div class="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-xl border border-line-strong bg-bg-card shadow-card sm:rounded-lg" role="dialog" aria-modal="true" aria-labelledby="rk-titulo"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <header class="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-deep/50 text-accent-text"><gr-icon name="award" [size]="20" /></span>
            <div class="min-w-0 flex-1">
              <h2 id="rk-titulo" class="text-ui-h5">Ranking de donantes</h2>
              <p class="text-body-xs text-text-tertiary">{{ diaCorto(ranking()?.dia) }} · {{ euros(ranking()?.totalRecaudado ?? 0) }} recaudados</p>
            </div>
            <button grIconButton icon="x" label="Cerrar" (click)="verRanking.set(false)"></button>
          </header>
          <ol class="flex flex-col divide-y divide-line-subtle overflow-y-auto px-5 py-2">
            @for (r of ranking()?.items ?? []; track r.puesto) {
              <li class="flex items-center gap-3 py-2.5">
                <so-puesto [n]="r.puesto" />
                <span class="min-w-0 flex-1 truncate text-body-s">{{ r.alias }}</span>
                <span class="shrink-0 text-body-xs text-text-tertiary">{{ r.donativos }} don.</span>
                <span class="shrink-0 font-mono text-mono-s">{{ euros(r.total) }}</span>
              </li>
            } @empty { <li class="py-8 text-center text-body-s text-text-tertiary">Todavía no hay donaciones de hoy.</li> }
          </ol>
        </div>
      </div>
    }
  `,
})
export class DonacionesPage {
  private readonly api = inject(DonacionesApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);

  protected readonly kpis = signal<KpisDonaciones | null>(null);
  protected readonly config = signal<ConfigDonaciones | null>(null);
  protected readonly lista = signal<ListaDonaciones | null>(null);
  protected readonly ranking = signal<RankingDonaciones | null>(null);
  protected readonly filtro = signal<{ estado: string; q: string; pagina: number }>({ estado: '', q: '', pagina: 1 });
  protected readonly form = signal<FormConfig>({ ...VACIO });
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly reembolso = signal<Donacion | null>(null);
  protected readonly motivo = signal('');
  protected readonly verRanking = signal(false);
  protected readonly nuevoSugerido = signal(0);
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Etiqueta y tono del estado; un estado desconocido no rompe la página. */
  protected readonly est = (e: string): { l: string; tone: Tone } => ESTADOS[e as Estado] ?? { l: e, tone: 'neutral' };
  protected readonly euros = euros;
  protected readonly num = num;
  protected readonly fecha = fecha;
  protected readonly hora = hora;
  protected readonly iniciales = iniciales;
  protected readonly Math = Math;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'sorteo.gestionar'));
  protected readonly donativosHoy = computed(() => (this.ranking()?.items ?? []).reduce((a, r) => a + r.donativos, 0));
  protected readonly ticketMedio = computed(() => {
    const k = this.kpis();
    return k && k.pagadas ? Math.round(k.recaudado / k.pagadas) : 0;
  });
  protected readonly pasarela = computed(() =>
    this.proveedor() === 'stripe' ? 'Stripe en verde' : this.proveedor() === 'simulado' ? 'Pasarela simulada' : 'Sin pasarela',
  );
  protected readonly proveedor = signal<string>('ninguna');
  protected readonly sucio = computed(() => {
    const c = this.config();
    const f = this.form();
    if (!c) return false;
    return (
      f.activo !== c.activo ||
      f.minimo !== c.minimo ||
      f.maximo !== c.maximo ||
      f.coinsPorEuro !== c.coinsPorEuro ||
      f.importesSugeridos.join(',') !== (c.importesSugeridos ?? []).join(',')
    );
  });
  protected readonly diaCorto = (d?: string | null) =>
    d ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(d.length === 10 ? d + 'T12:00:00' : d)).replace('.', '') : '';

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const slug = this.comps.current()?.slug ?? '';
      const hoy = new Date().toISOString().slice(0, 10);
      const [panel, publica, ranking] = await Promise.all([this.api.panel(cid), this.api.configPublica(slug), this.api.ranking(slug, hoy)]);
      this.kpis.set(panel.kpis);
      this.config.set(panel.config);
      this.proveedor.set(publica.pasarela);
      this.ranking.set(ranking);
      this.form.set({
        activo: panel.config.activo,
        minimo: panel.config.minimo,
        maximo: panel.config.maximo,
        coinsPorEuro: panel.config.coinsPorEuro,
        importesSugeridos: [...(panel.config.importesSugeridos ?? [])],
      });
      await this.cargarLista();
    } catch (e) {
      this.error.set(errText(e, 'No se pudieron cargar las donaciones.'));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarLista(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    try {
      this.lista.set(await this.api.lista(cid, this.filtro()));
    } catch (e) {
      this.error.set(errText(e, 'No se pudo cargar el listado.'));
    }
  }

  protected filtrar(p: Partial<{ estado: string; q: string; pagina: number }>, reset = true): void {
    this.filtro.update((f) => ({ ...f, ...(reset ? { pagina: 1 } : {}), ...p }));
    void this.cargarLista();
  }

  protected paginas(l: ListaDonaciones): number {
    return Math.max(1, Math.ceil(l.total / (l.por || 1)));
  }

  protected limpiar(): void {
    this.filtrar({ q: '', estado: '' });
  }

  /** Búsqueda con retardo: no se lanza una petición por cada tecla. */
  protected buscar(q: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.filtrar({ q }), 300);
  }

  protected set(p: Partial<FormConfig>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected descartar(): void {
    const c = this.config();
    if (!c) return;
    this.form.set({
      activo: c.activo,
      minimo: c.minimo,
      maximo: c.maximo,
      coinsPorEuro: c.coinsPorEuro,
      importesSugeridos: [...(c.importesSugeridos ?? [])],
    });
  }

  protected quitarSugerido(s: number): void {
    this.form.update((f) => ({ ...f, importesSugeridos: f.importesSugeridos.filter((x) => x !== s) }));
  }

  protected anadirSugerido(): void {
    const v = Math.round(this.nuevoSugerido() * 100);
    if (!v) return;
    this.nuevoSugerido.set(0);
    this.form.update((f) => (f.importesSugeridos.includes(v) || f.importesSugeridos.length >= 6 ? f : { ...f, importesSugeridos: [...f.importesSugeridos, v] }));
  }

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    const c = this.config();
    if (!cid || !c) return;
    this.guardando.set(true);
    try {
      const f = this.form();
      const panel = await this.api.guardarConfig(cid, f, c.version);
      this.kpis.set(panel.kpis);
      this.config.set(panel.config);
      this.toasts.success('Configuración de las donaciones guardada');
    } catch (e) {
      const p = problemOf(e);
      this.toasts.error(p.code === 'CONFLICTO_EDICION' ? 'Otra persona ha cambiado la configuración' : errText(e, 'No se pudo guardar.'));
      if (p.code === 'CONFLICTO_EDICION') await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }

  protected abrirReembolso(d: Donacion): void {
    this.motivo.set('');
    this.reembolso.set(d);
  }

  protected async reembolsar(): Promise<void> {
    const cid = this.cid();
    const d = this.reembolso();
    if (!cid || !d) return;
    this.ocupado.set(true);
    try {
      await this.api.reembolsar(cid, d.id, this.motivo().trim());
      this.reembolso.set(null);
      this.toasts.success(`Reembolsados ${euros(d.importe)}`);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo reembolsar.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected exportar(): void {
    const l = this.lista();
    if (!l) return;
    descargarCsv('donaciones.csv', ['Fecha', 'Alias', 'Importe', 'Coins', 'Mensaje', 'Estado', 'Proveedor'], l.items.map((d) => [d.createdAt, d.alias, euros(d.importe), d.coins, d.mensaje ?? '', d.estado, d.proveedor]));
  }
}
