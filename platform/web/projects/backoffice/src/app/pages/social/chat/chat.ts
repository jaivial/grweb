import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { Realtime } from '../../../core/realtime';
import { BoPageHeader, BoToggle, errText } from '../../../shared/ui';
import { ChatApi, type ChatConfig, type ChatEstado, type MensajeAdmin } from './api';
import { SoAjuste, SoCard, SoIcon, SoNumber, SoSegmented, SoSkelFilas, SoSkelKpis, SoTags, descargarCsv, diaCorto, hora, iniciales, num, type SoOpcion } from '../ui';

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
 * «Chat · Moderación» (Figma 73 · «BO · Chat · Moderación», UI v2).
 *
 * Feed en vivo: el listado de moderación (GET /admin/…/chat/mensajes) se persiste en PostgreSQL y trae el número de
 * reportes y el estado «borrado», cosa que el SSE público no da; por eso se sondea cada 3 s en lugar de abrir el
 * stream (además el SSE público es anónimo y no lleva los contadores de sala). El estado de la sala (conectados) sí
 * viene del endpoint público /chat/estado.
 *
 * Pensado para el pico: los reportados van arriba, el feed tiene scroll propio y se modera con el teclado
 * (J/K o ↑↓ moverse, Supr borrar con confirmación en la fila, S silenciar, B banear, Esc cancelar).
 */
@Component({
  selector: 'bo-chat',
  imports: [A11yModule, FormsModule, RouterLink, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, SoAjuste, SoCard, SoIcon, SoNumber, SoSegmented, SoSkelFilas, SoSkelKpis, SoTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'escape()' },
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Chat · Moderación" [badge]="estado()?.salaActiva ? 'En directo' : 'Sala en pausa'" [badgeTone]="estado()?.salaActiva ? 'accent' : 'neutral'"
        [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Chat']">
        <ng-container actions>
          <span class="hidden sm:contents"><button grButton icon="download" (click)="exportar()">Exportar registro</button></span>
          <button grButton class="flex-1 sm:flex-none" [variant]="estado()?.salaActiva ? 'secondary' : 'primary'" [icon]="estado()?.salaActiva ? 'pause' : 'play'"
            [loading]="ocupado()" [disabled]="!puede()" (click)="alternarSala()">{{ estado()?.salaActiva ? 'Pausar sala' : 'Reanudar sala' }}</button>
          <span class="contents sm:hidden"><button grIconButton icon="download" label="Exportar registro" class="border border-line-strong" (click)="exportar()"></button></span>
        </ng-container>
      </bo-page-header>

      @if (cargando() && !mensajes().length && !error()) {
        <so-skel-kpis />
      } @else {
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <gr-kpi label="Conectados" [value]="num(estado()?.conectados ?? null)" caption="en la sala" />
          <gr-kpi label="Mensajes/min" class="overflow-hidden" [value]="num(porMinuto())" caption="en el último minuto" [trend]="ancho() ? serie() : []" />
          <gr-kpi label="Silenciados" [value]="num(silenciados().size)" caption="en esta sesión" />
          <gr-kpi label="Reportados" [value]="num(reportados().length)" [caption]="reportados().length ? 'sin revisar · aparecen arriba' : 'sin revisar'"
            [class.kpi-alerta]="reportados().length > 0" />
        </div>
      }

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede operar el chat">Hace falta el permiso «directo.operar». Puedes ver la sala, pero los botones de moderar y guardar quedan desactivados.</gr-alert>
      }

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <!-- ===== Feed ===== -->
        <section class="flex min-w-0 flex-col self-start overflow-hidden rounded-lg border border-line-subtle bg-bg-card" aria-labelledby="feed-titulo">
          <header class="flex flex-col gap-3 border-b border-line-subtle p-4 md:px-5">
            <div class="flex flex-wrap items-center gap-3">
              <h2 id="feed-titulo" class="text-ui-h5">Feed en vivo</h2>
              <span class="inline-flex h-7 items-center gap-1.5 rounded-pill border border-success/35 bg-success/10 px-2.5 text-label-s text-success">
                <span class="size-1.5 animate-pulse rounded-pill bg-success" aria-hidden="true"></span>{{ num(estado()?.conectados ?? 0) }}<span class="hidden sm:inline">conectados</span>
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <so-segmented class="w-full sm:w-auto" [llenar]="true" label="Mensajes" [opciones]="vistas()" [value]="vista()" (valueChange)="cambiarVista($event)" />
              <label class="relative ml-auto inline-flex h-11 items-center gap-2 rounded-sm border border-line-strong bg-bg-field pr-2 pl-3 text-label-s text-text-primary md:h-9">
                <gr-icon name="calendar" [size]="16" class="text-text-tertiary" />
                <span class="sr-only">Jornada</span>
                <input type="date" class="bg-transparent text-body-s text-text-primary outline-none [color-scheme:dark]" [value]="dia()" (change)="cambiarDia($any($event.target).value)" />
              </label>
            </div>
          </header>

          @if (cargando() && !mensajes().length) {
            <so-skel-filas [n]="5" />
          } @else if (error()) {
            <gr-empty icon="wifi-off" title="No hemos podido cargar la sala" text="Comprueba la conexión. Seguimos reintentando cada 3 s; también puedes hacerlo ahora.">
              <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
            </gr-empty>
          } @else if (!visibles().length) {
            <gr-empty icon="circle-check" title="No hay mensajes que revisar"
              [text]="vista() === 'reportados' ? 'Nadie ha reportado nada. Los reportados aparecerán arriba, en rojo, en cuanto lleguen.' : vista() === 'silenciados' ? 'No has silenciado a nadie en esta sesión.' : 'La sala está tranquila.'" />
          } @else {
            <div class="max-h-[70vh] overflow-y-auto lg:max-h-[640px]" role="listbox" tabindex="-1" aria-label="Mensajes de la sala" [attr.aria-activedescendant]="sel() ? 'msg-' + sel() : null"
              (keydown)="teclado($event)">
              @for (g of grupos(); track g.id) {
                @if (g.titulo) {
                  <p class="sticky top-0 z-10 flex items-center gap-2 border-b border-line-subtle px-4 py-2 font-mono text-mono-xs md:px-5"
                    [class]="g.id === 'rep' ? 'bg-[color-mix(in_srgb,var(--color-accent-deep)_45%,var(--color-bg-card))] text-accent-text' : 'bg-bg-surface text-text-tertiary'">
                    @if (g.id === 'rep') { <so-icon name="flag" [size]="14" /> }{{ g.titulo }}
                  </p>
                }
                @for (m of g.items; track m.id) {
                  @let hot = m.reportes > 0 && !m.borrado;
                  <div [id]="'msg-' + m.id" role="option" [attr.aria-selected]="sel() === m.id" tabindex="0" (focus)="sel.set(m.id)" (click)="sel.set(m.id)"
                    class="relative flex flex-col gap-3 border-b border-line-subtle px-4 py-3 outline-none last:border-0 focus-visible:ring-2 focus-visible:ring-accent-text/60 focus-visible:ring-inset sm:flex-row sm:items-center md:px-5"
                    [class]="hot ? (confirmando() === m.id ? 'bg-accent-deep/45' : 'bg-accent-deep/25') : sel() === m.id ? 'bg-bg-raised/60' : ''">
                    @if (hot) { <span class="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true"></span> }
                    <div class="flex min-w-0 flex-1 items-start gap-3">
                      <span class="flex size-8 shrink-0 items-center justify-center rounded-pill border font-mono text-mono-xs"
                        [class]="hot ? 'border-accent/60 bg-accent-deep/60 text-text-secondary' : 'border-line-strong bg-bg-raised text-text-secondary'">{{ iniciales(m.alias) }}</span>
                      <div class="min-w-0 flex-1">
                        <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span class="text-label-s" [class]="m.borrado ? 'text-text-muted' : 'text-text-primary'">{{ m.alias }}</span>
                          @if (m.reportes > 0) { <gr-badge tone="danger">{{ m.reportes }} {{ m.reportes === 1 ? 'reporte' : 'reportes' }}</gr-badge> }
                          @if (silenciados().has(m.fanId)) { <gr-badge tone="warning">Silenciado</gr-badge> }
                          @if (m.borrado) { <gr-badge>Borrado</gr-badge> }
                          <span class="font-mono text-mono-xs text-text-tertiary">{{ hora(m.fecha) }}</span>
                        </p>
                        <p class="mt-1 text-body-s break-words" [class]="m.borrado ? 'text-text-muted line-through' : 'text-text-secondary'">{{ m.texto }}</p>
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center justify-end gap-1.5">
                      @if (confirmando() === m.id) {
                        <span class="mr-auto text-label-s text-text-primary sm:mr-1">¿Borrar el mensaje?</span>
                        <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-label-s text-text-secondary hover:text-text-primary md:h-8"
                          (click)="$event.stopPropagation(); confirmando.set(null)"><gr-icon name="x" [size]="16" />Cancelar</button>
                        <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-sm border border-accent bg-accent-deep/70 px-3 text-label-s text-accent-text hover:bg-accent-deep md:h-8"
                          [attr.data-confirmar]="m.id" [disabled]="ocupado()" (click)="$event.stopPropagation(); borrar(m)"><gr-icon name="trash" [size]="16" />Borrar</button>
                      } @else if (!m.borrado) {
                        <button type="button" class="inline-flex size-11 items-center justify-center gap-1.5 rounded-sm text-label-s transition-colors disabled:opacity-40 sm:size-auto sm:h-8 sm:px-2.5"
                          [class]="hot ? 'border border-accent/70 bg-accent-deep/50 text-accent-text hover:bg-accent-deep' : 'border border-line-subtle text-text-secondary hover:bg-bg-raised hover:text-text-primary sm:border-transparent'"
                          [attr.aria-label]="'Borrar el mensaje de ' + m.alias + ' (Supr)'" title="Borrar (Supr)" [disabled]="!puede()" (click)="$event.stopPropagation(); pedirBorrado(m)">
                          <gr-icon name="trash" [size]="16" /><span class="hidden sm:inline">Borrar</span>
                        </button>
                        <button type="button" class="inline-flex size-11 items-center justify-center gap-1.5 rounded-sm border border-line-subtle text-label-s text-text-secondary transition-colors hover:bg-bg-raised hover:text-text-primary disabled:opacity-40 sm:size-auto sm:h-8 sm:border-transparent sm:px-2.5"
                          [attr.aria-label]="'Silenciar a ' + m.alias + ' (S)'" title="Silenciar (S)" [disabled]="!puede()" (click)="$event.stopPropagation(); abrirSilenciar(m)">
                          <so-icon name="volume-x" [size]="16" /><span class="hidden sm:inline">{{ silenciados().has(m.fanId) ? 'Ampliar' : 'Silenciar' }}</span>
                        </button>
                        <button type="button" class="inline-flex size-11 items-center justify-center gap-1.5 rounded-sm border border-line-subtle text-label-s text-text-secondary transition-colors hover:bg-bg-raised hover:text-text-primary disabled:opacity-40 sm:size-auto sm:h-8 sm:border-transparent sm:px-2.5"
                          [attr.aria-label]="'Banear a ' + m.alias + ' (B)'" title="Banear (B)" [disabled]="!puede()" (click)="$event.stopPropagation(); abrirBanear(m)">
                          <so-icon name="ban" [size]="16" /><span class="hidden sm:inline">Banear</span>
                        </button>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          }

          <footer class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle bg-bg-surface px-4 py-3 text-body-xs text-text-tertiary md:px-5">
            <span class="hidden items-center gap-1.5 md:inline-flex">
              <so-icon name="keyboard" [size]="16" />
              <kbd class="kbd">J</kbd><kbd class="kbd">K</kbd> moverse
              <kbd class="kbd ml-2">Supr</kbd> borrar <kbd class="kbd ml-2">S</kbd> silenciar <kbd class="kbd ml-2">B</kbd> banear
            </span>
            <span class="ml-auto">Últimos {{ mensajes().length }} mensajes · se actualiza cada 3 s</span>
          </footer>
        </section>

        <!-- ===== Configuración de la sala ===== -->
        <aside class="flex min-w-0 flex-col gap-4">
          <button type="button" class="flex items-center gap-3 rounded-lg border border-line-subtle bg-bg-card p-4 text-left lg:hidden" [attr.aria-expanded]="configAbierta()" (click)="configAbierta.update(v => !v)">
            <span class="min-w-0 flex-1">
              <span class="block text-label-m">Configuración de la sala</span>
              <span class="block text-body-xs text-text-tertiary">{{ form().activo ? 'Activa' : 'En pausa' }} · modo lento {{ form().modoLentoSeg }} s · {{ form().palabrasProhibidas.length }} palabras prohibidas</span>
            </span>
            <gr-icon name="chevron-down" [size]="20" class="text-text-tertiary transition-transform" [class.rotate-180]="configAbierta()" />
          </button>
          <div class="lg:block" [class.hidden]="!configAbierta()">
          <so-card titulo="Configuración de la sala" ayuda="Se aplica en caliente a todos los fans conectados">
            <so-ajuste label="Sala activa" ayuda="Los mensajes entran en la sala de la jornada">
              <bo-toggle [value]="form().activo" label="Sala activa" [disabled]="!puede()" (changed)="set({ activo: $event })" />
            </so-ajuste>
            <hr class="border-line-subtle" />
            <so-ajuste label="Modo lento" ayuda="Un mensaje cada N segundos por fan · ráfaga de 5 · 0 = sin límite">
              <so-number ancho="xs" unidad="s" label="Modo lento en segundos" [disabled]="!puede()" [valor]="form().modoLentoSeg" [cambiado]="form().modoLentoSeg !== config()?.modoLentoSeg" (changed)="set({ modoLentoSeg: $event })" />
            </so-ajuste>
            <so-ajuste label="Hitos por fan y jornada" ayuda="Tope de recompensas de porra y fantasy por chatear">
              <so-number ancho="xs" unidad="máx." label="Máximo de hitos por fan y jornada" [disabled]="!puede()" [valor]="form().maxHitos" [cambiado]="form().maxHitos !== config()?.maxHitos" (changed)="set({ maxHitos: $event })" />
            </so-ajuste>
            <hr class="border-line-subtle" />
            <gr-field label="Palabras prohibidas" hint="Se borran al publicar y cuentan como reporte · Intro o coma para añadir">
              <so-tags [items]="form().palabrasProhibidas" label="Añadir palabra prohibida" placeholder="Añadir palabra…" [disabled]="!puede()" (changed)="set({ palabrasProhibidas: $event })" />
            </gr-field>
            <gr-field label="Dominios permitidos" hint="Los enlaces a otros dominios se bloquean">
              <so-tags [items]="form().dominiosPermitidos" label="Añadir dominio permitido" placeholder="Añadir dominio…" [disabled]="!puede()" (changed)="set({ dominiosPermitidos: $event })" />
            </gr-field>
            <footer class="flex flex-col gap-3 border-t border-line-subtle pt-4">
              <p class="flex items-center gap-2 text-label-s">
                <span class="size-2 rounded-pill" [class]="sucio() ? 'bg-warning' : 'bg-success'" aria-hidden="true"></span>
                {{ sucio() ? cambios() + (cambios() === 1 ? ' cambio sin guardar' : ' cambios sin guardar') : 'Todo guardado' }}
                <span class="ml-auto font-mono text-mono-xs text-text-tertiary">v{{ config()?.version ?? '—' }}</span>
              </p>
              <div class="flex gap-2">
                <button grButton class="flex-1" [disabled]="!sucio()" (click)="descartar()">Descartar</button>
                <button grButton class="flex-1" variant="primary" [loading]="guardando()" [disabled]="!sucio() || !puede()" (click)="guardar()">Guardar cambios</button>
              </div>
            </footer>
          </so-card>
          </div>

          <gr-alert tone="info" title="Silenciar o banear">
            Silenciar es temporal (5, 30 o 60 min) y solo afecta al chat. Banear cierra la sesión del fan, bloquea su acceso y borra sus últimos mensajes.
            <a alertAction [routerLink]="['/', comps.current()?.slug, 'fans']" class="mt-2 inline-flex items-center gap-1 text-label-s text-info hover:underline">Ver fans baneados <gr-icon name="arrow-right" [size]="14" /></a>
          </gr-alert>
        </aside>
      </div>
    </div>

    <!-- ===== Silenciar / banear ===== -->
    @if (accion(); as a) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" (click)="accion.set(null)">
        <form class="w-full max-w-md rounded-t-xl border border-line-strong bg-bg-card shadow-card sm:rounded-lg" role="alertdialog" aria-modal="true" aria-labelledby="mod-titulo"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()" (ngSubmit)="confirmar()">
          <header class="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-md" [class]="a.tipo === 'silenciar' ? 'bg-warning/10 text-warning' : 'bg-accent-deep/50 text-accent-text'">
              <so-icon [name]="a.tipo === 'silenciar' ? 'volume-x' : 'ban'" [size]="20" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 id="mod-titulo" class="text-ui-h5">{{ a.tipo === 'silenciar' ? 'Silenciar a ' : 'Banear a ' }}{{ a.mensaje.alias }}</h2>
              <p class="truncate text-body-xs text-text-tertiary">«{{ a.mensaje.texto }}»</p>
            </div>
            <button type="button" grIconButton icon="x" label="Cerrar" (click)="accion.set(null)"></button>
          </header>
          <div class="flex flex-col gap-4 px-5 py-5">
            @if (a.tipo === 'silenciar') {
              <p class="text-body-s text-text-secondary">No podrá escribir en la sala hasta que acabe el silencio. Los mensajes que ya ha enviado se quedan.</p>
              <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Duración del silencio">
                @for (mn of [5, 30, 60]; track mn) {
                  <button type="button" role="radio" [attr.aria-checked]="minutos() === mn" class="h-11 rounded-sm border text-label-s transition-colors"
                    [class]="minutos() === mn ? 'border-accent bg-accent/15 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-muted'" (click)="minutos.set(mn)">{{ mn }} min</button>
                }
              </div>
            } @else {
              <p class="text-body-s text-text-secondary">Se cierra su sesión de directo, no puede volver a entrar hasta el fin del baneo y se borran sus últimos mensajes de la sala.</p>
              <gr-field label="Duración del baneo">
                <gr-select name="horas" [ngModel]="horas()" (ngModelChange)="horas.set(+$event)" aria-label="Duración del baneo">
                  <option [value]="1">1 hora</option>
                  <option [value]="24">24 horas</option>
                  <option [value]="168">7 días</option>
                  <option [value]="720">30 días</option>
                </gr-select>
              </gr-field>
            }
            <gr-field label="Motivo" [optional]="true" hint="Queda en el registro de moderación">
              <input grInput name="motivo" [(ngModel)]="motivo" maxlength="200" placeholder="Spam, insultos, enlaces…" />
            </gr-field>
          </div>
          <footer class="flex justify-end gap-2 border-t border-line-subtle px-5 py-4">
            <button type="button" grButton variant="ghost" (click)="accion.set(null)">Cancelar</button>
            <button type="submit" grButton [variant]="a.tipo === 'silenciar' ? 'primary' : 'danger'" [loading]="ocupado()">
              {{ a.tipo === 'silenciar' ? 'Silenciar ' + minutos() + ' min' : 'Banear' }}
            </button>
          </footer>
        </form>
      </div>
    }
  `,
  styles: `
    .kpi-alerta { border-color: var(--color-accent) !important; }
    .kbd { display: inline-flex; height: 20px; min-width: 20px; align-items: center; justify-content: center; border-radius: 4px; border: 1px solid var(--color-line-strong);
      background: var(--color-bg-raised); padding: 0 5px; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary); }
  `,
})
export class ChatPage {
  private readonly api = inject(ChatApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly realtime = inject(Realtime);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
  /** Mensaje seleccionado (teclado) y mensaje cuyo borrado se está confirmando en la fila. */
  protected readonly sel = signal<string | null>(null);
  protected readonly confirmando = signal<string | null>(null);
  protected readonly configAbierta = signal(false);
  /** ≥ 640 px: the KPI sparkline only fits from there on. */
  protected readonly ancho = signal(typeof matchMedia === 'undefined' || matchMedia('(min-width: 640px)').matches);
  protected motivo = '';

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly porMinuto = computed(() => {
    const ahora = Date.now();
    return this.mensajes().filter((m) => ahora - new Date(m.fecha).getTime() < 60_000).length;
  });
  protected readonly vistas = computed<SoOpcion[]>(() => [
    { v: 'todos', l: 'Todos', n: this.mensajes().length },
    { v: 'reportados', l: 'Reportados', n: this.reportados().length, tone: 'accent' },
    { v: 'silenciados', l: 'Silenciados', c: 'Silenc.', n: this.silenciados().size },
  ]);
  /** «Todos»: los reportados sin borrar van primero, en su propio grupo; después el resto por orden de llegada. */
  protected readonly grupos = computed(() => {
    const v = this.vista();
    const lista = this.mensajes();
    if (v === 'reportados') return [{ id: 'rep', titulo: '', items: this.reportados() }];
    if (v === 'silenciados') return [{ id: 'sil', titulo: '', items: lista.filter((m) => this.silenciados().has(m.fanId)) }];
    const rep = this.reportados().filter((m) => !m.borrado);
    const ids = new Set(rep.map((m) => m.id));
    const resto = lista.filter((m) => !ids.has(m.id));
    if (!rep.length) return [{ id: 'all', titulo: '', items: resto }];
    return [
      { id: 'rep', titulo: `REPORTADOS · ${rep.length} · REVISA PRIMERO`, items: rep },
      { id: 'all', titulo: 'RECIENTES · SE ACTUALIZA CADA 3 S', items: resto },
    ];
  });
  protected readonly visibles = computed(() => this.grupos().flatMap((g) => g.items));
  protected readonly cambios = computed(() => {
    const c = this.config();
    const f = this.form();
    if (!c) return 0;
    return [
      f.activo !== c.activo,
      f.modoLentoSeg !== c.modoLentoSeg,
      f.maxHitos !== c.maxHitos,
      f.palabrasProhibidas.join('|') !== (c.palabrasProhibidas ?? []).join('|'),
      f.dominiosPermitidos.join('|') !== (c.dominiosPermitidos ?? []).join('|'),
    ].filter(Boolean).length;
  });
  protected readonly sucio = computed(() => this.cambios() > 0);
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
    const mq = typeof matchMedia === 'undefined' ? null : matchMedia('(min-width: 640px)');
    const alCambiar = (e: MediaQueryListEvent) => this.ancho.set(e.matches);
    mq?.addEventListener('change', alCambiar);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      sub.unsubscribe();
      mq?.removeEventListener('change', alCambiar);
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
    this.sel.set(null);
    this.confirmando.set(null);
    void this.sondear();
  }

  protected cambiarVista(v: string): void {
    this.vista.set(v as Vista);
    this.confirmando.set(null);
  }

  // ---- teclado: J/K o ↑↓ moverse, Supr borrar, S silenciar, B banear ----
  protected teclado(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    if (this.accion() || e.metaKey || e.ctrlKey || e.altKey) return;
    const lista = this.visibles();
    if (!lista.length) return;
    const i = lista.findIndex((m) => m.id === this.sel());
    const mover = (d: number) => {
      e.preventDefault();
      const n = lista[Math.min(lista.length - 1, Math.max(0, (i < 0 ? -1 : i) + d))];
      if (!n) return;
      this.sel.set(n.id);
      this.confirmando.set(null);
      this.host.nativeElement.querySelector<HTMLElement>(`#msg-${CSS.escape(n.id)}`)?.focus();
    };
    const k = e.key.toLowerCase();
    if (k === 'j' || e.key === 'ArrowDown') return mover(1);
    if (k === 'k' || e.key === 'ArrowUp') return mover(-1);
    const m = lista[i];
    if (!m || !this.puede()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (!m.borrado) this.pedirBorrado(m);
    } else if (k === 's') {
      e.preventDefault();
      this.abrirSilenciar(m);
    } else if (k === 'b') {
      e.preventDefault();
      this.abrirBanear(m);
    }
  }

  protected escape(): void {
    if (this.accion()) this.accion.set(null);
    else this.confirmando.set(null);
  }

  /** Borrar es irreversible: la fila pregunta primero y el foco va a «Borrar» (Intro confirma, Esc cancela). */
  protected pedirBorrado(m: MensajeAdmin): void {
    this.sel.set(m.id);
    this.confirmando.set(m.id);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-confirmar="${CSS.escape(m.id)}"]`)?.focus());
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
      this.toasts.error(p.code === 'CONFLICTO_EDICION' ? 'Otra persona guardó antes. Hemos recargado los valores guardados: revisa y vuelve a aplicar tus cambios antes de guardar.' : errText(e, 'No se pudo guardar.'));
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
      // la jornada del listado que se está moderando: el id del stream solo es único dentro de una sala
      await this.api.borrar(cid, m.id, this.dia());
      this.toasts.success('Mensaje borrado');
      this.confirmando.set(null);
      await this.sondear();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo borrar el mensaje.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected abrirSilenciar(m: MensajeAdmin): void {
    this.confirmando.set(null);
    this.accion.set({ tipo: 'silenciar', mensaje: m });
    this.minutos.set(30);
    this.motivo = '';
  }

  protected abrirBanear(m: MensajeAdmin): void {
    this.confirmando.set(null);
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
