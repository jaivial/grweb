import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIconButton, GrInput, GrKpi, GrSkeleton, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, Confirm, errText } from '../../../shared/ui';
import { diaCorto, num } from '../ui';
import { JuegosApi, type Clasificaciones, type EstadoJornada, type Jornada, type Mercado } from './api';

const ESTADOS: Record<EstadoJornada, { l: string; tone: GrTone }> = {
  borrador: { l: 'Borrador', tone: 'neutral' },
  abierta: { l: 'Abierta', tone: 'info' },
  en_juego: { l: 'En juego', tone: 'accent' },
  cerrada: { l: 'Cerrada', tone: 'neutral' },
};

const MONEDAS = new Intl.NumberFormat('es-ES');

/**
 * «Juegos · Jornadas» (Figma 73 · «BO · Juegos · Jornadas»).
 * Jornadas con su estado, mercados de porra con su bote y las clasificaciones de porra y fantasy.
 */
@Component({
  selector: 'bo-juegos',
  imports: [FormsModule, RouterLink, BoPageHeader, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIconButton, GrInput, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header [title]="titulo()" [badge]="badge()" [badgeTone]="badgeTone()"
        [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Juegos']">
        <ng-container actions>
          <a grButton icon="sliders" [routerLink]="['/', comps.current()?.slug, 'juegos', 'config']">Configuración</a>
          <button grButton icon="plus" (click)="nuevaJornada.set(true)">Nueva jornada</button>
          <button grButton variant="primary" icon="zap" [loading]="ocupado()" [disabled]="!sel() || !puede()" (click)="generarMercados()">Generar mercados</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar los juegos">Hace falta el permiso «directo.operar».</gr-alert>
      }

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <gr-kpi label="Jugadores porra" [value]="num(clasif().porra.length)" caption="en el top 50" />
        <gr-kpi label="Jugadores fantasy" [value]="num(clasif().fantasy.length)" caption="en el top 50" />
        <gr-kpi label="Monedas en circulación" [value]="monedas()" caption="porra + fantasy del top" />
        <gr-kpi label="Apuestas" [value]="num(apuestas())" [caption]="bote() + ' en botes'" />
      </div>

      @if (cargando()) {
        <gr-skeleton class="h-96 rounded-lg" />
      } @else if (error()) {
        <gr-empty icon="wifi-off" title="No hemos podido cargar los juegos" [text]="error()">
          <button grButton (click)="cargar()">Reintentar</button>
        </gr-empty>
      } @else {
        <div class="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <!-- ===== Jornadas ===== -->
          <section class="flex flex-col gap-4">
            <h2 class="text-label-xs text-text-tertiary">Jornadas · {{ comps.current()?.nombreCorto }}</h2>
            @if (!jornadas().length) {
              <gr-empty icon="calendar" title="No hay jornadas" text="Crea la primera jornada para abrir la porra y el fantasy.">
                <button grButton variant="primary" icon="plus" (click)="nuevaJornada.set(true)">Nueva jornada</button>
              </gr-empty>
            } @else {
              <ul class="flex flex-col gap-3">
                @for (j of jornadas(); track j.id) {
                  <li class="rounded-lg border bg-bg-card p-4 transition-colors"
                    [class]="j.id === sel()?.id ? 'border-accent/60' : 'border-line-subtle'">
                    <button type="button" class="flex w-full items-start justify-between gap-3 text-left" (click)="elegir(j)">
                      <div class="min-w-0">
                        <p class="text-label-s">{{ j.nombre }}</p>
                        <p class="text-body-xs text-text-tertiary">
                          {{ diaCorto(j.dia) }}
                          @if (j.id === sel()?.id) { · {{ jugadores(j) }} en porra · {{ jugadoresFantasy(j) }} en fantasy }
                          @else { · {{ j.estado === 'cerrada' ? 'histórico · solo lectura' : j.estado === 'borrador' ? 'sin definir' : 'pendiente de abrir' }} }
                        </p>
                      </div>
                      <gr-badge [tone]="est(j.estado).tone">{{ est(j.estado).l }}</gr-badge>
                    </button>
                    @if (j.id === sel()?.id) {
                      <div class="mt-3 flex flex-wrap gap-2 border-t border-line-subtle pt-3">
                        @if (j.estado === 'borrador') {
                          <button grButton size="s" variant="primary" icon="play" [disabled]="!puede()" (click)="estado(j, 'abierta')">Abrir</button>
                        }
                        @if (j.estado === 'abierta') {
                          <button grButton size="s" variant="primary" icon="play" [disabled]="!puede()" (click)="estado(j, 'en_juego')">Pasar a en juego</button>
                        }
                        @if (j.estado === 'abierta' || j.estado === 'en_juego') {
                          <button grButton size="s" variant="secondary" icon="lock" [disabled]="!puede()" (click)="estado(j, 'cerrada')">Cerrar</button>
                        }
                        @if (j.estado !== 'cerrada') {
                          <button grButton size="s" variant="ghost" icon="refresh" [disabled]="!puede()" (click)="sincronizar()">Sincronizar atletas</button>
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          </section>

          <!-- ===== Mercados y clasificaciones ===== -->
          <section class="flex flex-col gap-5">
            <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <header class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-label-xs text-text-tertiary">Mercados de porra · {{ sel()?.nombre || '—' }}</h2>
                <span class="text-body-xs text-text-tertiary">El cierre es automático con el primer intento juzgado (§6.2)</span>
              </header>

              @if (!mercados().length) {
                <gr-empty icon="zap" title="No hay mercados" text="Genéralos desde el marcador de la jornada para que se pueda apostar.">
                  <button grButton variant="primary" icon="zap" [loading]="ocupado()" [disabled]="!puede()" (click)="generarMercados()">Generar mercados</button>
                </gr-empty>
              } @else {
                <ul class="mt-4 flex flex-col gap-2">
                  @for (m of mercados(); track m.id) {
                    <li class="flex flex-wrap items-center gap-3 rounded-md border border-line-subtle bg-bg-raised p-3">
                      <span class="inline-flex h-7 shrink-0 items-center rounded-2xs border border-line-strong bg-bg-surface px-2 text-mono-xs text-text-secondary">{{ tipo(m) }}</span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-label-s">{{ m.titulo }}</p>
                        <p class="text-body-xs text-text-tertiary">{{ m.apuestas }} apuestas · {{ m.opciones.length }} atletas</p>
                      </div>
                      <div class="text-right">
                        <p class="text-mono-xs text-text-tertiary">Bote</p>
                        <p class="font-mono text-body-s">{{ m.bote }}</p>
                      </div>
                      <gr-badge [tone]="m.estado === 'abierto' ? 'success' : m.estado === 'cerrado' ? 'neutral' : 'info'">{{ m.estado }}</gr-badge>
                      <div class="flex items-center gap-1">
                        @if (m.estado === 'abierto') {
                          <button grIconButton icon="lock" [label]="'Cerrar el mercado ' + m.titulo" [disabled]="!puede()" (click)="cerrarMercado(m)"></button>
                        }
                        @if (m.estado !== 'liquidado') {
                          <button grIconButton icon="circle-check" [label]="'Liquidar el mercado ' + m.titulo" [disabled]="!puede()" (click)="liquidar(m)"></button>
                          <button grIconButton icon="undo" [label]="'Anular y devolver el mercado ' + m.titulo" [disabled]="!puede()" (click)="devolver(m)"></button>
                        }
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <header class="flex items-center justify-between gap-2">
                  <h2 class="text-label-xs text-text-tertiary">Porra · saldo de la jornada</h2>
                  <gr-badge tone="accent">En vivo</gr-badge>
                </header>
                <ol class="mt-3 flex flex-col gap-2">
                  @for (f of clasif().porra.slice(0, 8); track f.fanId) {
                    <li class="flex items-center gap-3">
                      <span class="w-5 shrink-0 font-mono text-mono-xs text-text-tertiary">{{ f.puesto }}</span>
                      <span class="min-w-0 flex-1 truncate text-body-s">{{ f.alias || 'Sin alias' }}</span>
                      <span class="shrink-0 font-mono text-body-xs">{{ f.saldo }}</span>
                    </li>
                  } @empty { <li class="py-4 text-center text-body-xs text-text-tertiary">Todavía no hay jugadores.</li> }
                </ol>
              </div>
              <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <header class="flex items-center justify-between gap-2">
                  <h2 class="text-label-xs text-text-tertiary">Fantasy · puntos del día</h2>
                  <gr-badge tone="info">En vivo</gr-badge>
                </header>
                <ol class="mt-3 flex flex-col gap-2">
                  @for (f of clasif().fantasy.slice(0, 8); track f.fanId) {
                    <li class="flex items-center gap-3">
                      <span class="w-5 shrink-0 font-mono text-mono-xs text-text-tertiary">{{ f.puesto }}</span>
                      <span class="min-w-0 flex-1 truncate text-body-s">{{ f.alias || 'Sin alias' }}</span>
                      <span class="shrink-0 font-mono text-body-xs">{{ f.puntos }} pts</span>
                    </li>
                  } @empty { <li class="py-4 text-center text-body-xs text-text-tertiary">Todavía no hay jugadores.</li> }
                </ol>
              </div>
            </div>
          </section>
        </div>
      }
    </div>

    <!-- ===== Nueva jornada ===== -->
    @if (nuevaJornada()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="nuevaJornada.set(false)" (keydown.escape)="nuevaJornada.set(false)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Nueva jornada"
          (click)="$event.stopPropagation()" (ngSubmit)="crearJornada()">
          <h2 class="text-ui-h5">Nueva jornada</h2>
          <p class="mt-2 text-body-s text-text-secondary">Porra, fantasy, chat y la cola de banners se separan por jornada (§2).</p>
          <gr-field class="mt-4" label="Nombre"><input grInput name="nombre" [(ngModel)]="nombreJornada" maxlength="40" placeholder="AEP-3" required /></gr-field>
          <gr-field class="mt-4" label="Día"><input grInput type="date" name="dia" [(ngModel)]="diaJornada" required /></gr-field>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="nuevaJornada.set(false)">Cancelar</button>
            <button type="submit" grButton variant="primary" [loading]="ocupado()" [disabled]="!nombreJornada.trim() || !diaJornada">Crear jornada</button>
          </div>
        </form>
      </div>
    }
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
  protected readonly clasif = signal<Clasificaciones>({ porra: [], fantasy: [] });
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly nuevaJornada = signal(false);
  protected nombreJornada = '';
  protected diaJornada = new Date().toISOString().slice(0, 10);

  protected readonly est = (e: EstadoJornada) => ESTADOS[e];
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
  protected readonly apuestas = computed(() => this.mercados().reduce((a, m) => a + m.apuestas, 0));
  protected readonly bote = computed(() => MONEDAS.format(this.mercados().reduce((a, m) => a + m.bote, 0)));
  protected readonly monedas = computed(() => {
    const p = this.clasif().porra.reduce((a, f) => a + f.saldo, 0);
    const f = this.clasif().fantasy.reduce((a, x) => a + x.saldo, 0);
    return MONEDAS.format(p + f);
  });

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const { jornadas } = await this.api.jornadas(cid);
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
  protected jugadoresFantasy(j: Jornada): number {
    return j.id === this.seleccionada() ? this.clasif().fantasy.length : 0;
  }

  protected tipo(m: Mercado): string {
    if (m.tipo === 'gl') return 'GL';
    if (m.tipo === 'movimiento') return 'Movimiento';
    return 'Categoría';
  }

  protected async elegir(j: Jornada): Promise<void> {
    if (j.id === this.seleccionada()) return;
    this.seleccionada.set(j.id);
    this.clasif.set({ porra: [], fantasy: [] });
    this.mercados.set([]);
    await this.cargarJornada(j.id);
  }

  protected async estado(j: Jornada, estado: EstadoJornada): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    if (estado === 'cerrada') {
      const ok = await this.confirm.ask({
        title: '¿Cerrar la jornada?',
        text: `«${j.nombre}» quedará como histórico de solo lectura: no se podrá volver a apostar ni cambiar los mercados.`,
        confirm: 'Cerrar jornada',
        danger: true,
      });
      if (!ok) return;
    }
    this.ocupado.set(true);
    try {
      await this.api.jornada(cid, j.id, { estado });
      this.jornadas.update((l) => l.map((x) => (x.id === j.id ? { ...x, estado } : x)));
      this.toasts.success(`Jornada ${estado === 'abierta' ? 'abierta' : estado === 'en_juego' ? 'en juego' : 'cerrada'}`);
      await this.cargarJornada(j.id);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar el estado.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async generarMercados(): Promise<void> {
    const cid = this.cid();
    const j = this.sel();
    if (!cid || !j) return;
    const ok = await this.confirm.ask({
      title: '¿Generar los mercados?',
      text: `Se crean los mercados de porra de «${j.nombre}» desde el marcador de la jornada (categorías, IPF GL y movimientos).`,
      confirm: 'Generar',
    });
    if (!ok) return;
    this.ocupado.set(true);
    try {
      const r = await this.api.generarMercados(cid, j.id);
      this.toasts.success(`${r.creados} mercados generados`);
      await this.cargarJornada(j.id);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudieron generar los mercados.'));
    } finally {
      this.ocupado.set(false);
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
      title: '¿Liquidar el mercado?',
      text: `Se reparte el bote de «${m.titulo}» (${m.bote}) entre los que acertaron, según el marcador de ahora. No se puede deshacer.`,
      confirm: 'Liquidar',
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

  protected async sincronizar(): Promise<void> {
    const cid = this.cid();
    const j = this.sel();
    if (!cid || !j) return;
    this.ocupado.set(true);
    try {
      await this.api.sincronizarFantasy(cid, j.id);
      this.toasts.success('Atletas de fantasy sincronizados');
      await this.cargarJornada(j.id);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo sincronizar.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async crearJornada(): Promise<void> {
    const cid = this.cid();
    if (!cid || !this.nombreJornada.trim() || !this.diaJornada) return;
    this.ocupado.set(true);
    try {
      const r = await this.api.crearJornada(cid, this.diaJornada, this.nombreJornada.trim());
      this.nuevaJornada.set(false);
      this.nombreJornada = '';
      this.toasts.success('Jornada creada');
      this.seleccionada.set(r.id);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo crear la jornada.'));
    } finally {
      this.ocupado.set(false);
    }
  }
}
