import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrEmpty, GrIcon, GrInput, GrPopover, GrSkeleton, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, errText } from '../../shared/ui';
import { diffLegible, dispositivo, type Entrada } from './comun';

interface Facetas {
  personas: { id: string; nombre: string }[];
  entidades: string[];
}
type Filtro = 'fecha' | 'persona' | 'entidad' | 'accion';

const th =
  'px-4 py-3 text-left text-[12px] leading-4 font-medium tracking-[0.04em] uppercase text-text-tertiary';
const chip =
  'inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-label-s whitespace-nowrap focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]';
const opcion =
  'flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card';

/** Action groups (prefix of the event type). */
const ACCIONES = [
  { v: 'competition.', l: 'Evento' },
  { v: 'cms.', l: 'Web y contenidos' },
  { v: 'web.', l: 'Publicación web' },
  { v: 'athletes.', l: 'Atletas' },
  { v: 'horarios.', l: 'Horarios' },
  { v: 'directo.', l: 'Directo' },
  { v: 'resultados.', l: 'Resultados' },
  { v: 'entrada', l: 'Entradas' },
  { v: 'checkin.', l: 'Check-in' },
  { v: 'sorteo.', l: 'Sorteo' },
  { v: 'crm.', l: 'Contactos' },
  { v: 'campana.', l: 'Campañas' },
  { v: 'identity.', l: 'Equipo y accesos' },
];
const ENTIDADES: Record<string, string> = {
  usuario: 'Persona del equipo',
  rol: 'Rol',
  invitacion: 'Invitación',
  campana: 'Campaña',
  contacto: 'Contacto',
  atleta: 'Atleta',
  entrada: 'Entrada',
  sesion: 'Sesión de entradas',
  flight: 'Flight',
  intento: 'Intento',
  competicion: 'Competición',
  pagina: 'Página web',
  plantilla: 'Plantilla',
  solicitud: 'Solicitud',
  sorteo: 'Sorteo',
  item: 'Item de rifa',
};

const dia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** «Auditoría · registro» (Figma 63): who changed what, when and from where, with before → after; filters and CSV export. */
@Component({
  selector: 'bo-auditoria',
  imports: [FormsModule, BoPageHeader, GrButton, GrEmpty, GrIcon, GrInput, GrPopover, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'det.set(null)' },
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header
        title="Auditoría"
        subtitle="Retención 24 meses · sin datos personales en los cambios de contactos suprimidos"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Equipo y sistema', 'Auditoría']"
      >
        <ng-container actions
          ><button grButton icon="download" [loading]="exportando()" (click)="exportar()">
            Exportar
          </button></ng-container
        >
      </bo-page-header>

      <div class="-mt-1 flex flex-wrap gap-2" role="group" aria-label="Filtros">
        <div class="relative">
          <button
            type="button"
            class="${chip} border-line-strong bg-bg-raised"
            [attr.aria-expanded]="abierto() === 'fecha'"
            (click)="abrir('fecha')"
          >
            <gr-icon name="calendar" [size]="16" />{{ rango()
            }}<gr-icon name="chevron-down" [size]="14" />
          </button>
          @if (abierto() === 'fecha') {
            <gr-popover etiqueta="Fechas" (cerrar)="abierto.set(null)">
              <div class="flex flex-wrap gap-2">
                @for (p of presets; track p.l) {
                  <button
                    type="button"
                    class="h-9 rounded-pill border border-line-strong px-3 text-label-s hover:bg-bg-card"
                    (click)="preset(p.d)"
                  >
                    {{ p.l }}
                  </button>
                }
              </div>
              <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1 text-label-s text-text-secondary"
                  >Desde<input grInput type="date" [(ngModel)]="f.desde" [max]="f.hasta || null"
                /></label>
                <label class="flex flex-col gap-1 text-label-s text-text-secondary"
                  >Hasta<input grInput type="date" [(ngModel)]="f.hasta" [min]="f.desde || null"
                /></label>
              </div>
              <div class="flex justify-between gap-2">
                <button grButton variant="ghost" (click)="f.desde = ''; f.hasta = ''; aplicar()">
                  Todo</button
                ><button grButton variant="primary" (click)="aplicar()">Aplicar</button>
              </div>
            </gr-popover>
          }
        </div>
        @for (x of chips(); track x.k) {
          <div class="relative">
            <button
              type="button"
              class="${chip}"
              [class]="
                x.valor
                  ? 'border-accent/50 bg-accent-deep/30 text-text-primary'
                  : 'border-line-strong text-text-primary hover:bg-bg-raised'
              "
              [attr.aria-expanded]="abierto() === x.k"
              (click)="abrir(x.k)"
            >
              @if (!x.valor) {
                <gr-icon name="plus" [size]="16" />
              }
              {{ x.valor ? x.l + ': ' + x.valor : x.l }}<gr-icon name="chevron-down" [size]="14" />
            </button>
            @if (abierto() === x.k) {
              <gr-popover [etiqueta]="x.l" (cerrar)="abierto.set(null)">
                <div
                  class="flex max-h-[50dvh] flex-col overflow-y-auto md:-m-2"
                  role="listbox"
                  [attr.aria-label]="x.l"
                >
                  @if (x.valor) {
                    <button
                      type="button"
                      role="option"
                      class="${opcion} text-text-tertiary"
                      (click)="poner(x.k, '')"
                    >
                      <gr-icon name="x" [size]="16" />Quitar filtro
                    </button>
                  }
                  @for (o of x.opciones; track o.v) {
                    <button
                      type="button"
                      role="option"
                      class="${opcion}"
                      [attr.aria-selected]="valorDe(x.k) === o.v"
                      (click)="poner(x.k, o.v)"
                    >
                      @if (valorDe(x.k) === o.v) {
                        <gr-icon name="check" [size]="16" class="text-accent-text" />
                      }
                      {{ o.l }}
                    </button>
                  } @empty {
                    <p class="px-3 py-3 text-body-s text-text-tertiary">
                      Sin opciones en el registro.
                    </p>
                  }
                </div>
              </gr-popover>
            }
          </div>
        }
        @if (hayFiltros()) {
          <button
            type="button"
            class="h-10 px-2 text-label-s text-text-tertiary hover:text-text-primary"
            (click)="limpiar()"
          >
            Limpiar
          </button>
        }
      </div>

      @if (error()) {
        <gr-empty icon="circle-alert" title="No se pudo cargar el registro" [text]="error()"
          ><button grButton icon="refresh" (click)="buscar()">Reintentar</button></gr-empty
        >
      } @else if (items() === null) {
        <section
          class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"
          aria-busy="true"
          aria-label="Cargando"
        >
          @for (r of [1, 2, 3, 4, 5, 6]; track r) {
            <div
              class="flex h-[52px] items-center gap-6 border-b border-line-subtle px-4 last:border-0"
            >
              <gr-skeleton class="h-3 w-28" /><gr-skeleton class="h-3 w-28" /><gr-skeleton
                class="hidden h-3 w-36 md:block"
              /><gr-skeleton class="hidden h-3 w-40 lg:block" />
            </div>
          }
        </section>
      } @else if (!items()!.length) {
        <gr-empty
          icon="history"
          title="Nada en este periodo"
          text="Prueba con otras fechas o quita algún filtro."
        >
          @if (hayFiltros()) {
            <button grButton (click)="limpiar()">Limpiar filtros</button>
          }
        </gr-empty>
      } @else {
        <section
          class="hidden overflow-hidden rounded-lg border border-line-subtle bg-bg-card md:block"
        >
          <table class="w-full table-fixed text-body-s">
            <thead class="border-b border-line-subtle">
              <tr>
                <th class="${th} w-[150px]">Fecha</th>
                <th class="${th} w-[17%]">Persona</th>
                <th class="${th} w-[22%]">Acción</th>
                <th class="${th} w-[20%]">Entidad</th>
                <th class="${th} hidden lg:table-cell">Resumen</th>
              </tr>
            </thead>
            <tbody>
              @for (e of items(); track e.id) {
                <tr
                  class="h-[52px] cursor-pointer border-b border-line-subtle last:border-0 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgb(230_96_107/0.9)]"
                  [class]="det()?.id === e.id ? 'bg-accent-deep/30' : 'hover:bg-bg-raised/50'"
                  tabindex="0"
                  (click)="ver(e)"
                  (keydown.enter)="ver(e)"
                >
                  <td class="px-4 font-mono text-mono-s whitespace-nowrap">{{ fecha(e.fecha) }}</td>
                  <td class="truncate px-4">{{ e.actor || 'Sistema' }}</td>
                  <td class="truncate px-4 font-mono text-mono-s">{{ e.tipo }}</td>
                  <td class="truncate px-4 font-mono text-mono-s text-text-secondary">
                    {{ entidad(e) }}
                  </td>
                  <td
                    class="hidden truncate px-4 text-text-secondary first-letter:uppercase lg:table-cell"
                  >
                    {{ e.resumen }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
        <ul class="flex flex-col gap-2 md:hidden">
          @for (e of items(); track e.id) {
            <li>
              <button
                type="button"
                class="flex w-full flex-col gap-1 rounded-lg border border-line-subtle bg-bg-card p-4 text-left"
                [class.border-accent]="det()?.id === e.id"
                (click)="ver(e)"
              >
                <span class="flex items-center justify-between gap-2"
                  ><span class="truncate font-mono text-mono-s">{{ e.tipo }}</span
                  ><span class="shrink-0 font-mono text-mono-xs text-text-tertiary">{{
                    fecha(e.fecha)
                  }}</span></span
                >
                <span class="truncate text-label-s"
                  >{{ e.actor || 'Sistema' }} ·
                  <span class="text-text-secondary">{{ entidad(e) }}</span></span
                >
                @if (e.resumen) {
                  <span class="text-body-xs text-text-tertiary first-letter:uppercase">{{
                    e.resumen
                  }}</span>
                }
              </button>
            </li>
          }
        </ul>
        @if (siguiente()) {
          <button grButton class="self-center" [loading]="cargandoMas()" (click)="mas()">
            Cargar más
          </button>
        }
      }
    </div>

    @if (det(); as e) {
      <div class="fixed inset-0 z-40 bg-black/50 lg:hidden" (click)="det.set(null)"></div>
      <aside
        class="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto border-l border-line-strong bg-bg-card p-6 shadow-card sm:w-[480px] sm:rounded-l-[20px]"
        role="dialog"
        [attr.aria-label]="'Detalle de ' + e.tipo"
      >
        <div class="flex items-center gap-3">
          <h2 class="min-w-0 flex-1 truncate font-mono text-mono-m">{{ e.tipo }}</h2>
          <button
            type="button"
            class="-m-1 rounded-xs p-2 text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]"
            aria-label="Cerrar"
            (click)="det.set(null)"
          >
            <gr-icon name="x" [size]="18" />
          </button>
        </div>
        <dl class="mt-4 flex flex-col text-body-s">
          @for (r of filasDet(e); track r[0]) {
            <div class="flex justify-between gap-4 border-b border-line-subtle py-2.5">
              <dt class="shrink-0 text-text-tertiary">{{ r[0] }}</dt>
              <dd class="min-w-0 truncate text-right" [title]="r[1]">{{ r[1] }}</dd>
            </div>
          }
        </dl>
        @if (e.resumen) {
          <p class="mt-4 text-body-s text-text-secondary first-letter:uppercase">{{ e.resumen }}</p>
        }
        <p
          class="mt-5 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase"
        >
          {{ e.diff ? 'Cambios (antes → después)' : 'Datos del evento' }}
        </p>
        <pre
          class="mt-2 overflow-auto rounded-md border border-line-subtle bg-bg-deep p-3 font-mono text-[12px] leading-[18px] whitespace-pre-wrap text-text-primary"
          >{{ json(e.diff ? diffLegible(e.diff) : e.datos) }}</pre>
      </aside>
    }
  `,
})
export class AuditoriaPage {
  private readonly http = inject(HttpClient);
  private readonly toasts = inject(GrToasts);
  protected readonly comps = inject(Competitions);
  protected readonly diffLegible = diffLegible;
  protected readonly items = signal<Entrada[] | null>(null);
  protected readonly siguiente = signal('');
  protected readonly error = signal('');
  protected readonly det = signal<Entrada | null>(null);
  protected readonly abierto = signal<Filtro | null>(null);
  protected readonly facetas = signal<Facetas>({ personas: [], entidades: [] });
  protected readonly exportando = signal(false);
  protected readonly cargandoMas = signal(false);
  /** Bumped on every applied filter so the chips recompute (the form model is a plain object). */
  private readonly version = signal(0);
  protected f = { desde: '', hasta: '', usuario: '', entidad: '', tipo: '' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly presets = [
    { l: 'Hoy', d: 0 },
    { l: '7 días', d: 7 },
    { l: '30 días', d: 30 },
    { l: 'Este mes', d: -1 },
  ];

  protected readonly rango = computed(() => {
    this.version();
    const { desde, hasta } = this.f;
    if (!desde && !hasta) return 'Todas las fechas';
    const fmt = (s: string, y = false) =>
      new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        ...(y ? { year: 'numeric' } : {}),
      })
        .format(new Date(s + 'T12:00:00'))
        .replace('.', '');
    if (desde && hasta) return `${fmt(desde)} – ${fmt(hasta, true)}`;
    return desde ? `Desde ${fmt(desde, true)}` : `Hasta ${fmt(hasta, true)}`;
  });
  protected readonly chips = computed(() => {
    this.version();
    const fa = this.facetas();
    return [
      {
        k: 'persona' as const,
        l: 'Persona',
        valor:
          fa.personas.find((p) => p.id === this.f.usuario)?.nombre ??
          (this.f.usuario ? 'otra' : ''),
        opciones: fa.personas.map((p) => ({ v: p.id, l: p.nombre || 'Sin nombre' })),
      },
      {
        k: 'entidad' as const,
        l: 'Entidad',
        valor: this.f.entidad ? (ENTIDADES[this.f.entidad] ?? this.f.entidad) : '',
        opciones: fa.entidades.map((e) => ({ v: e, l: ENTIDADES[e] ?? e })),
      },
      {
        k: 'accion' as const,
        l: 'Acción',
        valor: ACCIONES.find((a) => a.v === this.f.tipo)?.l ?? '',
        opciones: ACCIONES,
      },
    ];
  });
  protected readonly hayFiltros = computed(() => {
    this.version();
    return Object.values(this.f).some(Boolean);
  });

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    this.f.usuario = q.get('usuario') ?? '';
    const hoy = new Date();
    this.f.desde = q.get('desde') ?? dia(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    this.f.hasta = q.get('hasta') ?? '';
    effect(() => {
      if (!this.cid()) return;
      untracked(() => {
        void this.buscar();
        firstValueFrom(
          this.http.get<Facetas>(`/api/admin/competiciones/${this.cid()}/auditoria/facetas`),
        ).then(
          (x) => this.facetas.set(x),
          () => undefined,
        );
      });
    });
    // live: new audited actions appear on top (first page only, without moving what the user is reading)
    let t: ReturnType<typeof setTimeout> | undefined;
    const live = inject(Realtime).events.subscribe((e) => {
      if (
        e.tipo.endsWith('.progreso') ||
        e.tipo === 'kpi.delta' ||
        e.tipo === 'notificacion.nueva' ||
        (this.siguiente() && (this.items()?.length ?? 0) > 50)
      )
        return;
      clearTimeout(t);
      t = setTimeout(() => void this.buscar(true), 1500);
    });
    inject(DestroyRef).onDestroy(() => {
      live.unsubscribe();
      clearTimeout(t);
    });
  }

  private params(cursor = ''): HttpParams {
    let p = new HttpParams().set('limite', 50);
    if (this.f.desde) p = p.set('desde', new Date(this.f.desde + 'T00:00:00').toISOString());
    if (this.f.hasta)
      p = p.set(
        'hasta',
        new Date(new Date(this.f.hasta + 'T00:00:00').getTime() + 86_400_000).toISOString(),
      );
    if (this.f.usuario) p = p.set('usuario', this.f.usuario);
    if (this.f.entidad) p = p.set('entidad', this.f.entidad);
    if (this.f.tipo) p = p.set('tipo', this.f.tipo);
    if (cursor) p = p.set('cursor', cursor);
    return p;
  }
  private url(): string {
    return `/api/admin/competiciones/${this.cid()}/auditoria`;
  }

  async buscar(silencioso = false): Promise<void> {
    if (!silencioso) this.items.set(null);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: Entrada[]; siguiente?: string }>(this.url(), {
          params: this.params(),
        }),
      );
      this.items.set(r.items);
      this.siguiente.set(r.siguiente ?? '');
    } catch (e) {
      if (!silencioso) this.error.set(errText(e, 'Comprueba la conexión y vuelve a intentarlo.'));
    }
  }
  protected async mas(): Promise<void> {
    this.cargandoMas.set(true);
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: Entrada[]; siguiente?: string }>(this.url(), {
          params: this.params(this.siguiente()),
        }),
      );
      this.items.update((l) => [...(l ?? []), ...r.items]);
      this.siguiente.set(r.siguiente ?? '');
    } catch (e) {
      this.toasts.error('No se pudo cargar más', errText(e));
    } finally {
      this.cargandoMas.set(false);
    }
  }

  protected abrir(k: Filtro): void {
    this.abierto.set(this.abierto() === k ? null : k);
  }
  protected valorDe(k: Filtro): string {
    return k === 'persona' ? this.f.usuario : k === 'entidad' ? this.f.entidad : this.f.tipo;
  }
  protected poner(k: Filtro, v: string): void {
    if (k === 'persona') this.f.usuario = v;
    else if (k === 'entidad') this.f.entidad = v;
    else this.f.tipo = v;
    this.aplicar();
  }
  protected preset(d: number): void {
    const hoy = new Date();
    this.f.hasta = dia(hoy);
    this.f.desde =
      d === -1
        ? dia(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
        : dia(new Date(hoy.getTime() - d * 86_400_000));
    this.aplicar();
  }
  protected aplicar(): void {
    this.abierto.set(null);
    this.det.set(null);
    this.version.update((v) => v + 1);
    void this.buscar();
  }
  protected limpiar(): void {
    this.f = { desde: '', hasta: '', usuario: '', entidad: '', tipo: '' };
    this.aplicar();
  }

  protected async exportar(): Promise<void> {
    this.exportando.set(true);
    try {
      const p = this.params().delete('limite');
      const blob = await firstValueFrom(
        this.http.get(`${this.url()}/exportar.csv`, { params: p, responseType: 'blob' }),
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `auditoria-${this.comps.current()?.slug}-${this.f.desde || 'inicio'}_${this.f.hasta || dia(new Date())}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this.toasts.success(
        'Auditoría exportada',
        'CSV con los filtros aplicados (máx. 50.000 filas)',
      );
    } catch (e) {
      this.toasts.error('No se pudo exportar', errText(e));
    } finally {
      this.exportando.set(false);
    }
  }

  protected ver(e: Entrada): void {
    this.det.set(this.det()?.id === e.id ? null : e);
  }
  protected fecha(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Madrid',
    })
      .format(new Date(iso))
      .replace(',', '');
  }
  protected entidad(e: Entrada): string {
    const [k, id] = e.entidad.split(':');
    if (!id) return e.entidad || e.servicio;
    return `${ENTIDADES[k] ?? k} ${/^[0-9a-f-]{36}$/.test(id) ? '#' + id.slice(-6) : id}`;
  }
  protected filasDet(e: Entrada): [string, string][] {
    const full = new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Madrid',
    })
      .format(new Date(e.fecha))
      .replace(',', '');
    const origen =
      e.origen === 'cli'
        ? 'CLI'
        : e.origen === 'mcp'
          ? 'MCP'
          : e.origen?.startsWith('token:')
            ? 'Token ' + e.origen.slice(6)
            : 'Backoffice';
    return [
      ['Persona', `${e.actor || 'Sistema'} (${origen})`],
      ['Fecha', full],
      [
        'IP',
        [e.ip || '—', e.agente ? dispositivo(e.agente).replace(' · ', ' / ') : '']
          .filter(Boolean)
          .join(' · '),
      ],
      ['Petición', e.peticion || e.requestId || '—'],
      ['Entidad', e.entidad || '—'],
    ];
  }
  protected json(v: unknown): string {
    return JSON.stringify(v ?? {}, null, 2);
  }
}
