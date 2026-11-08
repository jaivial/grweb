import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, BoToggle, errText } from '../../../shared/ui';
import { descargarCsv, euros, fecha, num, SoNumber } from '../ui';
import { DonacionesApi, type ConfigDonaciones, type Donacion, type KpisDonaciones, type ListaDonaciones, type RankingDonaciones } from './api';

type Estado = 'pendiente' | 'pagada' | 'caducada' | 'reembolsada';

const ESTADOS: Record<Estado, { l: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  pagada: { l: 'Pagada', tone: 'success' },
  pendiente: { l: 'Pendiente', tone: 'warning' },
  caducada: { l: 'Caducada', tone: 'neutral' },
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
@Component({
  selector: 'bo-donaciones',
  imports: [FormsModule, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton, SoNumber],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Donaciones" [badge]="pasarela()" [badgeTone]="pasarela() === 'Stripe en verde' ? 'success' : 'neutral'"
        subtitle="GRS coins de exhibición: coins = euros × 100 · solo se anuncian en el chat, nunca son gastables (§5)"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Donaciones']">
        <ng-container actions>
          <button grButton icon="download" (click)="exportar()">Exportar CSV</button>
          <button grButton variant="primary" icon="award" (click)="verRanking.set(true)">Ver ranking</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar las donaciones">Hace falta el permiso «sorteo.gestionar».</gr-alert>
      }

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <gr-kpi label="Recaudado hoy" [value]="euros(ranking()?.totalRecaudado ?? 0)" caption="hoy" />
        <gr-kpi label="Total" [value]="euros(kpis()?.recaudado ?? 0)" [caption]="(kpis()?.pagadas ?? 0) + ' donativos pagados'" />
        <gr-kpi label="Donantes" [value]="num(kpis()?.donantes ?? null)" caption="en la competición" />
        <gr-kpi label="Ticket medio" [value]="euros(ticketMedio())" caption="por donativo" />
      </div>

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <!-- ===== Listado ===== -->
        <section class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <label class="relative min-w-0 flex-1 basis-64 md:max-w-xs">
              <span class="sr-only">Buscar</span>
              <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
              <input grInput class="pl-9" placeholder="Alias, mensaje o fan…" [ngModel]="filtro().q" (ngModelChange)="buscar($event)" />
            </label>
            <gr-select tipo="filtro" etiqueta="Estado" [ngModel]="filtro().estado" (ngModelChange)="filtrar({ estado: $event })">
              <option value="">Todos</option>
              <option value="pagada">Pagadas</option>
              <option value="pendiente">Pendientes</option>
              <option value="caducada">Caducadas</option>
              <option value="reembolsada">Reembolsadas</option>
            </gr-select>
          </div>

          @if (cargando() && !lista()) {
            <gr-skeleton class="h-72 rounded-lg" />
          } @else if (error()) {
            <gr-empty icon="wifi-off" title="No hemos podido cargar las donaciones" [text]="error()">
              <button grButton (click)="cargar()">Reintentar</button>
            </gr-empty>
          } @else if (lista(); as l) {
            <div class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[720px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                  <tr><th class="px-4 py-3">Fecha</th><th class="px-3 py-3">Alias</th><th class="px-3 py-3 text-right">Importe</th><th class="px-3 py-3">Mensaje</th><th class="px-3 py-3">Estado</th><th class="px-3 py-3">Proveedor</th><th class="px-4 py-3"></th></tr>
                </thead>
                <tbody>
                  @for (d of l.items; track d.id) {
                    <tr class="border-b border-line-subtle last:border-0" [class.opacity-60]="d.estado === 'reembolsada' || d.estado === 'caducada'">
                      <td class="px-4 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ fecha(d.createdAt) }}</td>
                      <td class="px-3 py-2.5">
                        <span class="text-label-s">{{ d.alias || 'Anónimo' }}</span>
                        @if (d.anonimo) { <gr-badge class="ml-2">Anónimo</gr-badge> }
                      </td>
                      <td class="px-3 py-2.5 text-right font-mono">{{ euros(d.importe) }}</td>
                      <td class="max-w-[220px] truncate px-3 py-2.5 text-text-tertiary">{{ d.mensaje || '—' }}</td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="est(d.estado).tone">{{ est(d.estado).l }}</gr-badge></td>
                      <td class="px-3 py-2.5 text-text-tertiary">{{ d.proveedor }}</td>
                      <td class="px-4 py-2.5 text-right">
                        @if (d.estado === 'pagada') {
                          <button grIconButton icon="undo" [label]="'Reembolsar la donación de ' + d.alias" [disabled]="!puede()" (click)="abrirReembolso(d)"></button>
                        }
                      </td>
                    </tr>
                  } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-text-tertiary">Aún no hay donaciones.</td></tr> }
                </tbody>
              </table>
            </div>
            <p class="flex items-center justify-between text-body-xs text-text-tertiary">
              <span>Mostrando {{ l.items.length ? (l.pagina - 1) * l.por + 1 : 0 }}–{{ (l.pagina - 1) * l.por + l.items.length }} de {{ num(l.total) }} donaciones</span>
              <span class="flex gap-1">
                <button grButton size="s" variant="ghost" icon="chevron-left" [disabled]="l.pagina <= 1" (click)="filtrar({ pagina: l.pagina - 1 }, false)" aria-label="Anterior"></button>
                <button grButton size="s" variant="ghost" icon="chevron-right" [disabled]="l.pagina * l.por >= l.total" (click)="filtrar({ pagina: l.pagina + 1 }, false)" aria-label="Siguiente"></button>
              </span>
            </p>
          }
        </section>

        <!-- ===== Configuración ===== -->
        <aside class="flex flex-col gap-5">
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-label-xs text-text-tertiary">Configuración (§5)</h2>

            <div class="mt-4 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-label-s">Donaciones activas</p>
                <p class="text-body-xs text-text-tertiary">El botón Donar aparece en /en-directo</p>
              </div>
              <bo-toggle [value]="form().activo" label="Donaciones activas" [disabled]="!puede()" (changed)="set({ activo: $event })" />
            </div>

            <gr-field class="mt-4" label="Importe mínimo" hint="Cobertura de comisiones">
              <input grInput type="number" min="1" [ngModel]="form().minimo / 100" (ngModelChange)="set({ minimo: Math.round(+$event * 100) })" [disabled]="!puede()" />
            </gr-field>

            <gr-field class="mt-4" label="Importe máximo" hint="Límite por donativo (céntimos 100–50000)">
              <input grInput type="number" min="1" [ngModel]="form().maximo / 100" (ngModelChange)="set({ maximo: Math.round(+$event * 100) })" [disabled]="!puede()" />
            </gr-field>

            <gr-field class="mt-4" label="Coins por euro (exhibición)" hint="Se anuncian en el chat · no gastables">
              <so-number label="Coins por euro" [disabled]="!puede()" [valor]="form().coinsPorEuro" (changed)="set({ coinsPorEuro: $event })" />
            </gr-field>

            <gr-field class="mt-4" label="Importes sugeridos" hint="En euros · máximo 6">
              <div class="flex flex-wrap gap-2">
                @for (s of form().importesSugeridos; track $index) {
                  <span class="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line-strong bg-bg-raised px-3 text-label-s">
                    {{ s / 100 }} €
                    <button type="button" class="flex size-5 items-center justify-center rounded-pill text-text-tertiary hover:text-text-primary" [attr.aria-label]="'Quitar ' + (s / 100) + ' euros'" (click)="quitarSugerido(s)">
                      <gr-icon name="x" [size]="12" />
                    </button>
                  </span>
                }
                <label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-pill border border-dashed border-line-strong px-3 text-label-s text-text-tertiary hover:border-text-muted hover:text-text-primary">
                  <gr-icon name="plus" [size]="14" />Añadir
                  <input type="number" class="w-16 bg-transparent text-label-s outline-none" min="1" [value]="nuevoSugerido()" (input)="nuevoSugerido.set(+$any($event.target).value)" (change)="anadirSugerido()" aria-label="Nuevo importe sugerido en euros" />
                </label>
              </div>
            </gr-field>

            <div class="mt-6 flex items-center gap-3 rounded-md border border-success/30 bg-success/5 p-4">
              <gr-icon name="circle-check" [size]="20" class="text-success" />
              <div class="min-w-0 flex-1">
                <p class="text-label-s">Config guardada</p>
                <p class="text-body-xs text-text-tertiary">Webhook verificado · idempotente</p>
              </div>
            </div>

            <div class="mt-4 flex justify-end gap-2">
              <button grButton variant="ghost" [disabled]="!sucio()" (click)="descartar()">Descartar</button>
              <button grButton variant="primary" [loading]="guardando()" [disabled]="!sucio()" (click)="guardar()">Guardar configuración</button>
            </div>
          </section>
        </aside>
      </div>
    </div>

    <!-- ===== Reembolso ===== -->
    @if (reembolso(); as d) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="reembolso.set(null)" (keydown.escape)="reembolso.set(null)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="alertdialog" aria-modal="true" [attr.aria-label]="'Reembolsar ' + euros(d.importe)"
          (click)="$event.stopPropagation()" (ngSubmit)="reembolsar()">
          <h2 class="text-ui-h5">Reembolsar {{ euros(d.importe) }}</h2>
          <p class="mt-3 text-body-s text-text-secondary">{{ d.alias || 'Anónimo' }} · {{ d.proveedor }} · {{ fecha(d.createdAt) }}. La pasarela devolverá el importe en 5–10 días y se retirará la recompensa de fantasy.</p>
          <gr-field class="mt-4" label="Motivo" [error]="motivo().length > 0 && motivo().trim().length < 3 ? 'Escribe al menos 3 caracteres.' : ''">
            <input grInput name="motivo" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" maxlength="200" placeholder="Compra duplicada" />
          </gr-field>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="reembolso.set(null)">Cancelar</button>
            <button type="submit" grButton variant="danger" [loading]="ocupado()" [disabled]="motivo().trim().length < 3">Reembolsar</button>
          </div>
        </form>
      </div>
    }

    <!-- ===== Ranking ===== -->
    @if (verRanking()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="verRanking.set(false)" (keydown.escape)="verRanking.set(false)">
        <div class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Ranking de donantes" (click)="$event.stopPropagation()">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-ui-h5">Ranking de donantes</h2>
              <p class="text-body-xs text-text-tertiary">{{ diaCorto(ranking()?.dia) }} · {{ euros(ranking()?.totalRecaudado ?? 0) }} repartidos</p>
            </div>
            <button grIconButton icon="x" label="Cerrar" (click)="verRanking.set(false)"></button>
          </header>
          <ol class="mt-4 flex flex-col gap-2">
            @for (r of ranking()?.items ?? []; track r.puesto) {
              <li class="flex items-center gap-3 rounded-sm border border-line-subtle bg-bg-card p-3">
                <span class="w-5 shrink-0 font-mono text-mono-xs text-text-tertiary">{{ r.puesto }}</span>
                <span class="min-w-0 flex-1 truncate text-body-s">{{ r.alias }}</span>
                <span class="shrink-0 font-mono text-body-xs">{{ euros(r.total) }}</span>
                <span class="shrink-0 text-body-xs text-text-tertiary">{{ r.donativos }} don.</span>
              </li>
            } @empty { <li class="py-6 text-center text-body-s text-text-tertiary">Todavía no hay donaciones de hoy.</li> }
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

  protected readonly est = (e: Estado) => ESTADOS[e];
  protected readonly euros = euros;
  protected readonly num = num;
  protected readonly fecha = fecha;
  protected readonly Math = Math;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'sorteo.gestionar'));
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
