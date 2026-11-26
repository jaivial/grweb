import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrIconButton, GrKpi, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { Realtime } from '../../../core/realtime';
import { BoPageHeader, BoToggle, Confirm, errText } from '../../../shared/ui';
import { SoCard, SoPuesto, SoSkelFilas, SoSkelKpis, compacto, diaCorto, num } from '../ui';
import { JuegosApi, type Clasificaciones, type EstadoJornada, type Jornada, type Mercado } from './api';

const ESTADOS: Record<EstadoJornada, { l: string; tone: GrTone }> = {
  borrador: { l: 'Borrador', tone: 'neutral' },
  abierta: { l: 'Abierta', tone: 'success' },
  en_juego: { l: 'En juego', tone: 'accent' },
  cerrada: { l: 'Cerrada', tone: 'neutral' },
};

/** Estado del mercado: verde acepta apuestas, ámbar falta liquidar, azul ya repartido. */
const MERCADO: Record<Mercado['estado'], { l: string; tone: GrTone; grupo: string; punto: string }> = {
  abierto: { l: 'Abierto', tone: 'success', grupo: 'ABIERTOS · ACEPTAN APUESTAS', punto: 'bg-success' },
  cerrado: { l: 'Cerrado', tone: 'warning', grupo: 'CERRADOS · PENDIENTES DE LIQUIDAR', punto: 'bg-warning' },
  liquidado: { l: 'Liquidado', tone: 'info', grupo: 'LIQUIDADOS', punto: 'bg-info' },
};

/** Liquidado sin ganador (o anulado por el staff): el bote volvió a las apuestas. */
const ANULADO = { l: 'Anulado', tone: 'neutral' as GrTone };

const MONEDAS = new Intl.NumberFormat('es-ES');

/**
 * «Juegos · Jornadas» (Figma 73 · «BO · Juegos · Jornadas», UI v2).
 * Jornadas con su estado, mercados de porra agrupados por lo que piden (abiertos, por liquidar, liquidados) y las
 * clasificaciones de porra y fantasy.
 */
@Component({
  selector: 'bo-juegos',
  imports: [RouterLink, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrIconButton, GrKpi, SoCard, SoPuesto, SoSkelFilas, SoSkelKpis],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header [title]="titulo()" [badge]="badge()" [badgeTone]="badgeTone()"
        [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Juegos']">
        <ng-container actions>
          <a grButton icon="sliders" [routerLink]="['/', comps.current()?.slug, 'juegos', 'config']">Configuración</a>
          @if (activo() !== null) {
            <label class="flex items-center gap-1 rounded-md border border-line-subtle bg-bg-card pl-3" [title]="activo() ? 'GRS Porra y GRS Fantasy se juegan en la web' : 'La web avisa de que los juegos aún no están abiertos'">
              <span class="text-label-s" [class]="activo() ? 'text-text-primary' : 'text-text-tertiary'">Activar juegos</span>
              <bo-toggle [value]="!!activo()" (changed)="activar($event)" label="Activar juegos" [disabled]="!puede() || cambiandoActivo()" />
            </label>
          }
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar los juegos">Hace falta el permiso «directo.operar». Puedes ver las jornadas y las clasificaciones, pero «Activar juegos» y los botones de cerrar y liquidar quedan desactivados.
          <a alertAction [routerLink]="['/', comps.current()?.slug, 'equipo']" class="mt-2 inline-flex items-center gap-1 text-label-s hover:underline">Pedir acceso a un admin <gr-icon name="arrow-right" [size]="14" /></a>
        </gr-alert>
      }

      @if (cargando()) {
        <so-skel-kpis />
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"><so-skel-filas [n]="4" [avatar]="false" /></div>
          <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"><so-skel-filas [n]="6" [avatar]="false" /></div>
        </div>
      } @else if (error()) {
        <div class="rounded-lg border border-line-subtle bg-bg-card">
          <gr-empty icon="wifi-off" title="No hemos podido cargar los juegos" [text]="error()">
            <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
          </gr-empty>
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <gr-kpi label="En porra" [value]="num(clasif().porra.length)" caption="jugadores en el top 50" />
          <gr-kpi label="En fantasy" [value]="num(jugadoresFantasyTotal())" [caption]="clasif().fantasy.length + (clasif().fantasy.length === 1 ? ' sala' : ' salas')" />
          <gr-kpi label="Monedas" [value]="monedas()" caption="porra del top + líderes de fantasy" />
          <gr-kpi label="Apuestas" [value]="num(apuestas())" [caption]="bote() + ' en botes'" />
          <gr-kpi label="Deuda fantasy" [value]="num(clasif().pendienteFantasy)" caption="reembolsos pendientes" />
        </div>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <!-- ===== Jornadas ===== -->
          <so-card titulo="Jornadas" [ayuda]="jornadas().length + ' jornadas · se abren y se cierran solas'" class="self-start">
            <a cardActions [routerLink]="['/', comps.current()?.slug, 'horarios']" class="inline-flex items-center gap-1 text-label-s text-accent-text hover:underline">Fechas en Horarios <gr-icon name="arrow-right" [size]="14" /></a>
            @if (!jornadas().length) {
              <gr-empty icon="calendar" title="No hay jornadas" text="Cada fecha de Horarios crea su jornada (mismas reglas de porra y fantasy). Añade las fechas en Horarios.">
                <a grButton variant="primary" icon="calendar" [routerLink]="['/', comps.current()?.slug, 'horarios']">Ir a Horarios</a>
              </gr-empty>
            } @else {
              <ul class="flex flex-col gap-2">
                @for (j of jornadas(); track j.id) {
                  @let actual = j.id === sel()?.id;
                  <li class="rounded-md border transition-colors" [class]="actual ? 'border-accent/70 bg-accent-deep/20' : 'border-line-subtle bg-bg-raised hover:border-line-strong'">
                    <button type="button" class="flex w-full items-start gap-3 p-3.5 text-left" [attr.aria-current]="actual ? 'true' : null" (click)="elegir(j)">
                      <span class="min-w-0 flex-1">
                        <span class="block text-label-m">{{ j.nombre }}</span>
                        <span class="mt-0.5 block text-body-xs text-text-tertiary">
                          {{ diaCorto(j.dia) || 'sin fecha' }} ·
                          @if (actual) { {{ jugadores(j) }} en porra · {{ jugadoresFantasy(j) }} en fantasy }
                          @else { {{ j.estado === 'cerrada' ? 'histórico · solo lectura' : j.estado === 'en_juego' ? 'en juego' : 'abierta · se juega desde ya' }} }
                        </span>
                      </span>
                      <gr-badge [tone]="est(j.estado).tone">{{ est(j.estado).l }}</gr-badge>
                    </button>
                  </li>
                }
              </ul>
            }
          </so-card>

          <!-- ===== Mercados y clasificaciones ===== -->
          <div class="flex min-w-0 flex-col gap-6">
            <so-card [titulo]="'Mercados de porra · ' + (sel()?.nombre || '—')" ayuda="El cierre es automático con el primer intento juzgado (§6.2) · cerrar, liquidar y anular a mano quedan auditados">
              @if (!mercados().length) {
                <gr-empty icon="zap" title="No hay mercados" text="Los mercados se crean y se actualizan solos con los atletas aprobados." />
              } @else {
                @for (g of grupos(); track g.estado) {
                  <div class="flex flex-col gap-2">
                    <p class="flex items-center gap-2 font-mono text-mono-xs text-text-tertiary"><span class="size-1.5 rounded-pill" [class]="g.punto"></span>{{ g.titulo }} · {{ g.items.length }}</p>
                    <ul class="flex flex-col gap-2">
                      @for (m of g.items; track m.id) {
                        <li class="flex flex-col gap-3 rounded-md border p-3.5 sm:flex-row sm:items-center sm:gap-4"
                          [class]="m.estado === 'abierto' ? 'border-success/40 bg-bg-raised' : m.estado === 'cerrado' ? 'border-line-subtle bg-bg-raised' : 'border-line-subtle bg-bg-raised/50'">
                          <div class="min-w-0 flex-1">
                            <p class="font-mono text-mono-xs" [class]="m.estado === 'abierto' ? 'text-success' : 'text-text-tertiary'">{{ tipo(m) }}</p>
                            <p class="truncate text-label-s" [class.text-text-secondary]="m.estado === 'liquidado'">{{ m.titulo }}</p>
                            <p class="truncate text-body-xs text-text-tertiary">{{ m.apuestas }} {{ m.apuestas === 1 ? 'apuesta' : 'apuestas' }} · {{ m.opciones.length }} {{ m.opciones.length === 1 ? 'atleta' : 'atletas' }}{{ m.estado === 'abierto' ? ' · cierra con el 1.er intento juzgado' : '' }}</p>
                          </div>
                          <div class="flex items-center gap-4">
                            <div class="text-right">
                              <p class="font-mono text-mono-xs text-text-tertiary">Bote</p>
                              <p class="font-mono text-mono-s">{{ fmt(m.bote) }}</p>
                            </div>
                            <gr-badge class="w-[88px] justify-center" [tone]="mer(m).tone">{{ mer(m).l }}</gr-badge>
                            <div class="ml-auto flex items-center gap-1 sm:ml-0 sm:w-[168px] sm:justify-end">
                              @if (m.estado === 'abierto') {
                                <button grButton size="s" icon="lock" [disabled]="!puede()" (click)="cerrarMercado(m)">Cerrar</button>
                                <button grIconButton icon="undo" [label]="'Anular y devolver ' + m.titulo" [disabled]="!puede()" (click)="devolver(m)"></button>
                              } @else if (m.estado === 'cerrado') {
                                <button grButton size="s" variant="primary" icon="circle-check" [disabled]="!puede()" (click)="liquidar(m)">Liquidar</button>
                                <button grIconButton icon="undo" [label]="'Anular y devolver ' + m.titulo" [disabled]="!puede()" (click)="devolver(m)"></button>
                              } @else {
                                <span class="text-body-xs text-text-muted">{{ m.devuelto ? 'Devuelto' : 'Bote repartido' }}</span>
                              }
                            </div>
                          </div>
                        </li>
                      }
                    </ul>
                  </div>
                }
              }
            </so-card>

            <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
              <so-card titulo="Porra" ayuda="Saldo de la jornada · top 50">
                <gr-badge cardActions tone="accent">En vivo</gr-badge>
                <ol class="-mt-1 flex flex-col divide-y divide-line-subtle">
                  @for (f of clasif().porra.slice(0, 8); track f.fanId) {
                    <li class="flex items-center gap-3 py-2">
                      <so-puesto [n]="f.puesto" />
                      <span class="min-w-0 flex-1 truncate text-body-s">{{ f.alias || 'Sin alias' }}</span>
                      <span class="shrink-0 font-mono text-mono-s text-text-secondary">{{ fmt(f.saldo) }}</span>
                    </li>
                  } @empty { <li class="py-6 text-center text-body-s text-text-tertiary">Todavía no hay jugadores.</li> }
                </ol>
              </so-card>
              <so-card titulo="Fantasy" ayuda="Salas del día · quién va ganando (nota media)">
                <gr-badge cardActions tone="accent">En vivo</gr-badge>
                <ol class="-mt-1 flex flex-col divide-y divide-line-subtle">
                  @for (f of clasif().fantasy.slice(0, 8); track f.id) {
                    <li class="flex items-center gap-3 py-2">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-body-s">{{ f.nombre }}</span>
                        <span class="block truncate text-body-xs text-text-tertiary">{{ f.miembros }}/{{ f.plazas }} · {{ f.lider ? '@' + (f.lider.alias || 'sin alias') : 'sin clasificar' }}</span>
                      </span>
                      <span class="shrink-0 font-mono text-mono-s text-text-secondary">{{ f.lider ? nota(f.lider.nota) : '—' }}</span>
                    </li>
                  } @empty { <li class="py-6 text-center text-body-s text-text-tertiary">Todavía no hay salas.</li> }
                </ol>
              </so-card>
            </div>
          </div>
        </div>
      }
    </div>

  `,
})
export class JuegosPage {
  private readonly api = inject(JuegosApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);

  protected readonly jornadas = signal<Jornada[]>([]);
  protected readonly seleccionada = signal('');
  protected readonly mercados = signal<Mercado[]>([]);
  protected readonly clasif = signal<Clasificaciones>({ porra: [], fantasy: [], pendienteFantasy: 0 });
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  /** «Activar juegos» (config_juegos.activo); null mientras carga. */
  protected readonly activo = signal<boolean | null>(null);
  protected readonly cambiandoActivo = signal(false);
  private t: ReturnType<typeof setTimeout> | undefined;

  protected readonly est = (e: EstadoJornada) => ESTADOS[e];
  protected readonly mer = (m: Mercado) => (m.estado === 'liquidado' && m.devuelto ? ANULADO : MERCADO[m.estado]);
  protected readonly fmt = (v: number) => MONEDAS.format(v);
  protected readonly num = num;
  protected readonly diaCorto = diaCorto;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly sel = computed(() => this.jornadas().find((j) => j.id === this.seleccionada()) ?? null);
  protected readonly titulo = computed(() => {
    const j = this.sel();
    return j ? `Jornada ${j.nombre} · ${diaCorto(j.dia)}` : 'Juegos';
  });
  protected readonly badge = computed(() => {
    const j = this.sel();
    return j ? ESTADOS[j.estado].l : '';
  });
  protected readonly badgeTone = computed(() => {
    const j = this.sel();
    return j ? ESTADOS[j.estado].tone : 'neutral';
  });
  protected readonly subtitulo = computed(() => {
    const j = this.sel();
    if (!j) return 'Porra y fantasy por jornada · liquidación al publicar resultados (§6)';
    return `${this.jugadores(j)} en porra · ${this.jugadoresFantasy(j)} en fantasy · liquidación al publicar resultados (§6)`;
  });
  /** Mercados agrupados por lo que piden: abiertos (cerrar), cerrados (liquidar) y liquidados. */
  protected readonly grupos = computed(() =>
    (['abierto', 'cerrado', 'liquidado'] as const)
      .map((e) => ({ estado: e, titulo: MERCADO[e].grupo, punto: MERCADO[e].punto, items: this.mercados().filter((m) => m.estado === e) }))
      .filter((g) => g.items.length),
  );
  protected readonly apuestas = computed(() => this.mercados().reduce((a, m) => a + m.apuestas, 0));
  protected readonly bote = computed(() => compacto(this.mercados().reduce((a, m) => a + (m.devuelto ? 0 : m.bote), 0)));
  protected readonly monedas = computed(() => {
    const p = this.clasif().porra.reduce((a, f) => a + f.saldo, 0);
    const f = this.clasif().fantasy.reduce((a, x) => a + (x.lider?.saldo ?? 0), 0);
    return compacto(p + f);
  });

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (!(e.tipo.startsWith('porra.') || e.tipo === 'fantasy.atletas') || !this.seleccionada()) return;
      clearTimeout(this.t);
      this.t = setTimeout(() => void this.cargarJornada(this.seleccionada()), 500);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.t);
      sub.unsubscribe();
    });
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const [{ jornadas }, cfg] = await Promise.all([this.api.jornadas(cid), this.api.config(cid)]);
      this.activo.set(cfg.activo);
      this.jornadas.set(jornadas);
      const actual = this.seleccionada();
      const sigue = jornadas.some((j) => j.id === actual)
        ? actual
        : (jornadas.find((j) => j.estado === 'en_juego')?.id ?? jornadas.find((j) => j.estado === 'abierta')?.id ?? jornadas[0]?.id ?? '');
      this.seleccionada.set(sigue);
      if (sigue) await this.cargarJornada(sigue);
    } catch (e) {
      this.error.set(errText(e, 'No se pudieron cargar los juegos.'));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarJornada(jid: string): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    try {
      const [c, m] = await Promise.all([
        this.api.clasificaciones(cid, jid),
        this.api.mercados(this.comps.current()?.slug ?? '', jid),
      ]);
      this.clasif.set(c);
      this.mercados.set(m.mercados);
    } catch (e) {
      this.error.set(errText(e, 'No se pudo cargar la jornada.'));
    }
  }

  protected jugadores(j: Jornada): number {
    return j.id === this.seleccionada() ? this.clasif().porra.length : 0;
  }
  /** Los jugadores de fantasy de la jornada: la suma de los miembros de sus salas. */
  protected readonly jugadoresFantasyTotal = computed(() => this.clasif().fantasy.reduce((a, s) => a + s.miembros, 0));
  protected nota(v: number): string {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }
  protected jugadoresFantasy(j: Jornada): number {
    return j.id === this.seleccionada() ? this.jugadoresFantasyTotal() : 0;
  }

  protected tipo(m: Mercado): string {
    if (m.tipo === 'gl') return 'GL';
    if (m.tipo === 'movimiento') return 'Movimiento';
    return 'Categoría';
  }

  protected async elegir(j: Jornada): Promise<void> {
    if (j.id === this.seleccionada()) return;
    this.seleccionada.set(j.id);
    this.clasif.set({ porra: [], fantasy: [], pendienteFantasy: 0 });
    this.mercados.set([]);
    await this.cargarJornada(j.id);
  }

  /** «Activar juegos»: la web pasa al momento (SSE juegos.estado) entre los juegos y el aviso de que aún no están abiertos. */
  protected async activar(v: boolean): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const antes = this.activo();
    this.activo.set(v);
    this.cambiandoActivo.set(true);
    try {
      const cfg = await this.api.activo(cid, v);
      this.activo.set(cfg.activo);
      this.toasts.success(v ? 'Juegos activados' : 'Juegos desactivados', v ? 'GRS Porra y GRS Fantasy ya se juegan en la web.' : 'La web avisa de que los juegos aún no están abiertos.');
    } catch (e) {
      this.activo.set(antes);
      this.toasts.error(errText(e, 'No se pudo cambiar «Activar juegos».'));
    } finally {
      this.cambiandoActivo.set(false);
    }
  }

  protected async cerrarMercado(m: Mercado): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const ok = await this.confirm.ask({
      title: '¿Cerrar el mercado?',
      text: `«${m.titulo}» dejará de aceptar apuestas. El bote se reparte al liquidarlo.`,
      confirm: 'Cerrar mercado',
      danger: true,
    });
    if (!ok) return;
    this.ocupado.set(true);
    try {
      await this.api.cerrarMercado(cid, m.id);
      this.toasts.success('Mercado cerrado');
      await this.cargarJornada(this.seleccionada());
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cerrar el mercado.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async liquidar(m: Mercado): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const ok = await this.confirm.ask({
      title: `¿Liquidar «${m.titulo}»?`,
      text: `Se reparte el bote (${num(m.bote)}) entre los que acertaron según el marcador de ahora. No se puede deshacer.`,
      confirm: 'Liquidar mercado',
      danger: true,
    });
    if (!ok) return;
    this.ocupado.set(true);
    try {
      await this.api.liquidarMercado(cid, m.id);
      this.toasts.success('Mercado liquidado');
      await this.cargarJornada(this.seleccionada());
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo liquidar el mercado.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  /**
   * «Anular y devolver»: el bote entero vuelve a las apuestas y el mercado queda liquidado. Es la salida manual
   * para un mercado cuyo resultado no va a llegar (o no es definitivo): el backend lo audita con un evento admin.
   */
  protected async devolver(m: Mercado): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const ok = await this.confirm.ask({
      title: '¿Anular el mercado y devolver el bote?',
      text: `Se devuelve todo (${m.bote}) a las apuestas de «${m.titulo}» y el mercado queda liquidado. No se puede deshacer y queda anotado en el registro de la acción.`,
      confirm: 'Anular y devolver',
      danger: true,
    });
    if (!ok) return;
    this.ocupado.set(true);
    try {
      await this.api.liquidarMercado(cid, m.id, true);
      this.toasts.success('Mercado anulado y bote devuelto');
      await this.cargarJornada(this.seleccionada());
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo anular el mercado.'));
    } finally {
      this.ocupado.set(false);
    }
  }

}
