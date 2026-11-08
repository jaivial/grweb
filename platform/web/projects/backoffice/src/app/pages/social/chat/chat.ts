import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { Realtime } from '../../../core/realtime';
import { BoPageHeader, BoToggle, errText } from '../../../shared/ui';
import { ChatApi, type ChatConfig, type ChatEstado, type MensajeAdmin } from './api';
import { SoTags, SoNumber, descargarCsv, diaCorto, hora, iniciales, num } from '../ui';

interface ChatForm {
  activo: boolean;
  modoLentoSeg: number;
  palabrasProhibidas: string[];
  dominiosPermitidos: string[];
  maxHitos: number;
}

type Vista = 'todos' | 'reportados' | 'silenciados';

const VACIA: ChatForm = { activo: true, modoLentoSeg: 0, palabrasProhibidas: [], dominiosPermitidos: [], maxHitos: 100 };

/**
 * «Chat · Moderación» (Figma 73 · «BO · Chat · Moderación»).
 *
 * Feed en vivo: el listado de moderación (GET /admin/…/chat/mensajes) se persiste en PostgreSQL y trae el número de
 * reportes y el estado «borrado», cosa que el SSE público no da; por eso se sondea cada 3 s en lugar de abrir el
 * stream (además el SSE público es anónimo y no lleva los contadores de sala). El estado de la sala (conectados) sí
 * viene del endpoint público /chat/estado.
 */
@Component({
  selector: 'bo-chat',
  imports: [FormsModule, RouterLink, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton, SoNumber, SoTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Chat · Moderación" [badge]="estado()?.salaActiva ? 'En directo' : 'Sala en pausa'" [badgeTone]="estado()?.salaActiva ? 'accent' : 'neutral'"
        [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Chat']">
        <ng-container actions>
          <button grButton icon="download" (click)="exportar()">Exportar registro</button>
          <button grButton [variant]="estado()?.salaActiva ? 'secondary' : 'primary'" [icon]="estado()?.salaActiva ? 'pause' : 'play'"
            [loading]="ocupado()" (click)="alternarSala()">{{ estado()?.salaActiva ? 'Pausar sala' : 'Reanudar sala' }}</button>
        </ng-container>
      </bo-page-header>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <gr-kpi label="Conectados" [value]="num(estado()?.conectados ?? null)" caption="en la sala" />
        <gr-kpi label="Mensajes/min" [value]="num(porMinuto())" caption="en el último minuto" [trend]="serie()" />
        <gr-kpi label="Silenciados" [value]="num(silenciados().size)" caption="en esta sesión" />
        <gr-kpi label="Reportados" [value]="num(reportados().length)" caption="sin revisar" />
      </div>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede operar el chat">Hace falta el permiso «directo.operar» para moderar la sala.</gr-alert>
      }

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <!-- ===== Feed ===== -->
        <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
          <header class="flex flex-wrap items-center gap-2 border-b border-line-subtle p-4">
            <span class="text-mono-xs text-text-tertiary">Feed en vivo</span>
            <span class="inline-flex h-7 items-center gap-1.5 rounded-pill border border-success/40 bg-success/10 px-2.5 text-label-xs text-success">
              <gr-icon name="radio" [size]="12" />{{ num(estado()?.conectados ?? 0) }} conectados
            </span>
            <gr-select tipo="filtro" etiqueta="Mensajes" [ngModel]="vista()" (ngModelChange)="vista.set($event)" class="ml-auto">
              <option value="todos">Todos</option>
              <option value="reportados">Reportados</option>
              <option value="silenciados">Silenciados</option>
            </gr-select>
            <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary md:h-10"
              [class.border-accent]="vista() === 'silenciados'" [class.text-accent-text]="vista() === 'silenciados'" (click)="vista.set(vista() === 'silenciados' ? 'todos' : 'silenciados')">
              <gr-icon name="plus" [size]="16" />Silenciados
            </button>
            <span class="inline-flex h-7 items-center gap-1.5 rounded-pill border border-accent/50 bg-accent/10 px-2.5 text-label-xs text-accent-text">
              <gr-icon name="circle-alert" [size]="12" />Reportados {{ reportados().length }}
            </span>
            <input type="date" class="h-11 rounded-sm border border-line-strong bg-bg-field px-3 text-body-s text-text-primary md:h-10" [value]="dia()" (change)="cambiarDia($any($event.target).value)" aria-label="Jornada" />
          </header>

          @if (cargando() && !mensajes().length) {
            <gr-skeleton class="m-4 h-24 rounded-md" />
            <gr-skeleton class="m-4 h-24 rounded-md" />
          } @else if (error()) {
            <gr-empty icon="wifi-off" title="No hemos podido cargar la sala" [text]="error()">
              <button grButton (click)="cargar()">Reintentar</button>
            </gr-empty>
          } @else if (!visibles().length) {
            <gr-empty icon="circle-check" title="No hay mensajes que revisar" [text]="vista() === 'reportados' ? 'Nadie ha reportado ningún mensaje.' : 'La sala está tranquila.'" />
          } @else {
            <ul class="divide-y divide-line-subtle" aria-live="polite" aria-label="Mensajes de la sala">
              @for (m of visibles(); track m.id) {
                <li class="flex items-start gap-3 p-4" [class.bg-accent-deep/25]="m.reportes > 0">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-mono-xs text-text-secondary">{{ iniciales(m.alias) }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="flex flex-wrap items-center gap-2">
                      <span class="text-label-s" [class.text-text-primary]="!m.borrado" [class.text-text-tertiary]="m.borrado">{{ m.alias }}</span>
                      @if (silenciados().has(m.fanId)) { <span class="text-label-xs text-accent-text">Silenciado</span> }
                      @if (m.reportes > 0) { <span class="text-label-xs text-accent-text">{{ m.reportes }} {{ m.reportes === 1 ? 'reporte' : 'reportes' }}</span> }
                      @if (m.borrado) { <gr-badge>Borrado</gr-badge> }
                      <span class="font-mono text-mono-xs text-text-tertiary">{{ hora(m.fecha) }}</span>
                    </p>
                    <p class="mt-1 text-body-s" [class.text-text-secondary]="!m.borrado" [class.text-text-muted]="m.borrado" [class.line-through]="m.borrado">{{ m.texto }}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <button grIconButton icon="trash" [label]="'Borrar el mensaje de ' + m.alias" [disabled]="m.borrado || !puede()" (click)="borrar(m)"></button>
                    <button grIconButton icon="clock" [label]="'Silenciar a ' + m.alias" [disabled]="!puede()" (click)="abrirSilenciar(m)"></button>
                    <button grIconButton icon="circle-x" [label]="'Banear a ' + m.alias" [disabled]="!puede()" (click)="abrirBanear(m)"></button>
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <!-- ===== Configuración de la sala ===== -->
        <aside class="flex flex-col gap-5">
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-label-xs text-text-tertiary">Configuración de la sala</h2>

            <div class="mt-4 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-label-s">Sala activa</p>
                <p class="text-body-xs text-text-tertiary">Los mensajes entran en la sala de la jornada</p>
              </div>
              <bo-toggle [value]="form().activo" label="Sala activa" [disabled]="!puede()" (changed)="set({ activo: $event })" />
            </div>

            <gr-field class="mt-4" label="Modo lento (s)" hint="1 msg cada 5 s · ráfaga de 5">
              <input grInput type="number" min="0" max="3600" [ngModel]="form().modoLentoSeg" (ngModelChange)="set({ modoLentoSeg: +$event })" [disabled]="!puede()" />
            </gr-field>

            <gr-field class="mt-4" label="Palabras prohibidas" hint="Se borran al publicar y cuentan como reporte (§4)">
              <so-tags [items]="form().palabrasProhibidas" placeholder="Añadir palabra…" (changed)="set({ palabrasProhibidas: $event })" />
            </gr-field>

            <gr-field class="mt-4" label="Dominios permitidos" hint="Los enlaces a otros dominios se bloquean (§4)">
              <so-tags [items]="form().dominiosPermitidos" placeholder="Añadir dominio…" (changed)="set({ dominiosPermitidos: $event })" />
            </gr-field>

            <gr-field class="mt-4" label="Máx. de hitos por fan y jornada">
              <so-number label="Máximo de hitos por fan y jornada" [disabled]="!puede()" [valor]="form().maxHitos" (changed)="set({ maxHitos: $event })" />
            </gr-field>

            <footer class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4">
              <div class="min-w-0">
                <p class="text-label-s">{{ sucio() ? 'Cambios sin guardar' : 'Todo guardado' }}</p>
                <p class="text-body-xs text-text-tertiary">Se aplican en caliente</p>
              </div>
              <div class="flex gap-2">
                <button grButton variant="ghost" [disabled]="!sucio()" (click)="descartar()">Descartar</button>
                <button grButton variant="primary" [loading]="guardando()" [disabled]="!sucio()" (click)="guardar()">Guardar</button>
              </div>
            </footer>
          </section>

          <gr-alert tone="info" title="Baneo y silencios">
            Silenciar es temporal (5, 30 o 60 min) y solo afecta al chat. Banear cierra la sesión del fan, bloquea su acceso y borra sus últimos mensajes: se hace desde
            <a [routerLink]="['/', comps.current()?.slug, 'fans']" class="text-accent-text hover:underline">Fans</a>.
          </gr-alert>
        </aside>
      </div>
    </div>

    <!-- ===== Modal de silenciar ===== -->
    @if (accion(); as a) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="accion.set(null)" (keydown.escape)="accion.set(null)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="alertdialog" aria-modal="true" [attr.aria-label]="a.tipo === 'silenciar' ? 'Silenciar a ' + a.mensaje.alias : 'Banear a ' + a.mensaje.alias"
          (click)="$event.stopPropagation()" (ngSubmit)="confirmar()">
          <h2 class="text-ui-h5">{{ a.tipo === 'silenciar' ? 'Silenciar a ' + a.mensaje.alias : 'Banear a ' + a.mensaje.alias }}</h2>
          @if (a.tipo === 'silenciar') {
            <p class="mt-3 text-body-s text-text-secondary">No podrá escribir en la sala hasta que acabe el silencio. Los mensajes que ya ha enviado se quedan.</p>
            <div class="mt-4 flex gap-2">
              @for (m of [5, 30, 60]; track m) {
                <button type="button" class="h-11 flex-1 rounded-sm border text-label-s" [class]="minutos() === m ? 'border-accent bg-accent/15 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-muted'"
                  (click)="minutos.set(m)">{{ m }} min</button>
              }
            </div>
          } @else {
            <p class="mt-3 text-body-s text-text-secondary">Se cierra su sesión de directo, no puede volver a entrar hasta el fin del baneo y se borran sus últimos mensajes de la sala.</p>
            <gr-field class="mt-4" label="Duración del baneo">
              <gr-select name="horas" [ngModel]="horas()" (ngModelChange)="horas.set(+$event)" aria-label="Duración del baneo">
                <option [value]="1">1 hora</option>
                <option [value]="24">24 horas</option>
                <option [value]="168">7 días</option>
                <option [value]="720">30 días</option>
              </gr-select>
            </gr-field>
          }
          <gr-field class="mt-4" label="Motivo" [optional]="true">
            <input grInput name="motivo" [(ngModel)]="motivo" maxlength="200" placeholder="Spam,CHF" />
          </gr-field>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="accion.set(null)">Cancelar</button>
            <button type="submit" grButton [variant]="a.tipo === 'silenciar' ? 'primary' : 'danger'" [loading]="ocupado()">
              {{ a.tipo === 'silenciar' ? 'Silenciar' : 'Banear' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class ChatPage {
  private readonly api = inject(ChatApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly realtime = inject(Realtime);

  protected readonly config = signal<ChatConfig | null>(null);
  protected readonly estado = signal<ChatEstado | null>(null);
  protected readonly mensajes = signal<MensajeAdmin[]>([]);
  protected readonly reportados = signal<MensajeAdmin[]>([]);
  protected readonly silenciados = signal<Set<string>>(new Set());
  protected readonly vista = signal<Vista>('todos');
  protected readonly dia = signal('');
  protected readonly form = signal<ChatForm>({ ...VACIA });
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly serie = signal<number[]>([]);
  protected readonly accion = signal<{ tipo: 'silenciar' | 'banear'; mensaje: MensajeAdmin } | null>(null);
  protected readonly minutos = signal(30);
  protected readonly horas = signal(24);
  protected motivo = '';

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly porMinuto = computed(() => {
    const ahora = Date.now();
    return this.mensajes().filter((m) => ahora - new Date(m.fecha).getTime() < 60_000).length;
  });
  protected readonly visibles = computed(() => {
    const lista = this.mensajes();
    const v = this.vista();
    if (v === 'reportados') return lista.filter((m) => m.reportes > 0);
    if (v === 'silenciados') return lista.filter((m) => this.silenciados().has(m.fanId));
    return lista;
  });
  protected readonly sucio = computed(() => {
    const c = this.config();
    const f = this.form();
    if (!c) return false;
    return (
      f.activo !== c.activo ||
      f.modoLentoSeg !== c.modoLentoSeg ||
      f.maxHitos !== c.maxHitos ||
      f.palabrasProhibidas.join('|') !== (c.palabrasProhibidas ?? []).join('|') ||
      f.dominiosPermitidos.join('|') !== (c.dominiosPermitidos ?? []).join('|')
    );
  });
  protected readonly subtitulo = computed(() => {
    const e = this.estado();
    const dia = e?.dia ?? this.dia();
    return dia ? `Sala · ${diaCorto(dia)} · recompensas de porra y fantasy activas` : 'Recompensas de porra y fantasy activas';
  });

  protected readonly num = num;
  protected readonly hora = hora;
  protected readonly iniciales = iniciales;

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
    // Sondeo de 3 s: el listado de moderación es persistido (trae reportes y borrados) y el SSE público no los da.
    const timer = setInterval(() => {
      if (this.cid()) void this.sondear();
    }, 3000);
    const sub = this.realtime.events.subscribe((e) => {
      if (e.tipo.startsWith('chat.')) void this.sondear();
    });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      sub.unsubscribe();
    });
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const [cfg, estado] = await Promise.all([this.api.config(cid), this.api.estado(this.comps.current()?.slug ?? '')]);
      this.config.set(cfg);
      this.form.set({
        activo: cfg.activo,
        modoLentoSeg: cfg.modoLentoSeg,
        palabrasProhibidas: [...(cfg.palabrasProhibidas ?? [])],
        dominiosPermitidos: [...(cfg.dominiosPermitidos ?? [])],
        maxHitos: cfg.maxHitos,
      });
      if (estado) this.estado.set(estado);
      if (!this.dia()) this.dia.set(estado?.dia ?? new Date().toISOString().slice(0, 10));
      await this.sondear();
    } catch (e) {
      this.error.set(errText(e, 'No se pudo cargar la sala.'));
    } finally {
      this.cargando.set(false);
    }
  }

  private async sondear(): Promise<void> {
    const cid = this.cid();
    if (!cid || !this.dia()) return;
    try {
      const [msgs, rep] = await Promise.all([this.api.mensajes(cid, this.dia(), 100), this.api.reportados(cid, this.dia(), 100)]);
      this.mensajes.set(msgs.mensajes);
      this.reportados.set(rep.mensajes);
      this.serie.update((s) => [...s.slice(-11), msgs.mensajes.filter((m) => Date.now() - new Date(m.fecha).getTime() < 60_000).length]);
      this.estado.set(await this.api.estado(this.comps.current()?.slug ?? ''));
      this.error.set('');
    } catch (e) {
      if (!this.mensajes().length) this.error.set(errText(e, 'No se pudo cargar la sala.'));
    }
  }

  protected cambiarDia(d: string): void {
    this.dia.set(d);
    void this.sondear();
  }

  protected set(p: Partial<ChatForm>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected descartar(): void {
    const c = this.config();
    if (!c) return;
    this.form.set({
      activo: c.activo,
      modoLentoSeg: c.modoLentoSeg,
      palabrasProhibidas: [...(c.palabrasProhibidas ?? [])],
      dominiosPermitidos: [...(c.dominiosPermitidos ?? [])],
      maxHitos: c.maxHitos,
    });
  }

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    const c = this.config();
    if (!cid || !c) return;
    this.guardando.set(true);
    try {
      const f = this.form();
      const guardado = await this.api.guardarConfig(cid, f, c.version);
      this.config.set(guardado);
      this.toasts.success('Configuración del chat guardada');
    } catch (e) {
      const p = problemOf(e);
      this.toasts.error(p.code === 'CONFLICTO_EDICION' ? 'Otra persona ha cambiado la configuración' : errText(e, 'No se pudo guardar.'));
      if (p.code === 'CONFLICTO_EDICION') await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }

  protected async alternarSala(): Promise<void> {
    const cid = this.cid();
    const c = this.config();
    if (!cid || !c) return;
    this.ocupado.set(true);
    try {
      const guardado = await this.api.guardarConfig(cid, { ...this.form(), activo: !c.activo }, c.version);
      this.config.set(guardado);
      this.set({ activo: guardado.activo });
      this.toasts.success(guardado.activo ? 'Sala reanudada' : 'Sala pausada');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar el estado de la sala.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async borrar(m: MensajeAdmin): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.ocupado.set(true);
    try {
      await this.api.borrar(cid, m.id);
      this.toasts.success('Mensaje borrado');
      await this.sondear();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo borrar el mensaje.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected abrirSilenciar(m: MensajeAdmin): void {
    this.accion.set({ tipo: 'silenciar', mensaje: m });
    this.minutos.set(30);
    this.motivo = '';
  }

  protected abrirBanear(m: MensajeAdmin): void {
    this.accion.set({ tipo: 'banear', mensaje: m });
    this.horas.set(24);
    this.motivo = '';
  }

  protected async confirmar(): Promise<void> {
    const cid = this.cid();
    const a = this.accion();
    if (!cid || !a) return;
    this.ocupado.set(true);
    try {
      if (a.tipo === 'silenciar') {
        const r = await this.api.silenciar(cid, a.mensaje.fanId, this.minutos(), this.motivo.trim());
        this.silenciados.update((s) => new Set(s).add(a.mensaje.fanId));
        this.toasts.success(`${a.mensaje.alias} silenciado hasta las ${hora(r.hasta)}`);
      } else {
        const hasta = new Date(Date.now() + this.horas() * 3_600_000).toISOString();
        await this.api.banear(cid, a.mensaje.fanId, hasta, this.motivo.trim());
        this.silenciados.update((s) => new Set(s).add(a.mensaje.fanId));
        this.toasts.success(`${a.mensaje.alias} baneado`);
      }
      this.accion.set(null);
      await this.sondear();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo completar la acción.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected exportar(): void {
    const filas = this.mensajes().map((m) => [m.fecha, m.alias, m.fanId, m.texto, m.reportes, m.borrado ? 'sí' : 'no']);
    descargarCsv(`chat-${this.dia() || 'hoy'}.csv`, ['Fecha', 'Alias', 'Fan', 'Texto', 'Reportes', 'Borrado'], filas);
  }
}
