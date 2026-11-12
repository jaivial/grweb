/**
 * fantasy/salas-ui.ts — piezas de las salas de GRS Fantasy (Figma «81 · /fantasy/salas»): la tarjeta de estado
 * (enlace, solicitud), el popover con la alineación de un jugador y el modal de crear o editar sala.
 */
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrPopover, type GrIconName } from '@grcup/ui';
import { codigoError, detalleError } from '../../core/fan';
import { Juegos, mensajeError, nota2, type FilaSala } from '../../core/juegos';
import { AlineacionLista, GrAviso } from './componentes';

const TONO_TARJETA = {
  neutro: 'border-line-subtle bg-bg-surface',
  exito: 'border-success bg-bg-deep',
  aviso: 'border-warning bg-bg-deep',
  error: 'border-crimson bg-bg-deep',
} as const;
const ICONO_TARJETA = { neutro: 'text-text-secondary', exito: 'text-success', aviso: 'text-warning', error: 'text-crimson' } as const;

/**
 * Una tarjeta de estado (Figma «Estado · …» de /fantasy/unirse y de las solicitudes): icono, título, detalle y
 * acciones. Como los avisos: fondo casi negro con el borde y el icono del tono.
 */
@Component({
  selector: 'gr-tarjeta-estado',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex flex-col gap-3 rounded-xl border p-7 " + caja()', '[attr.role]': 'tono() === "error" || tono() === "aviso" ? "alert" : "status"' },
  template: `
    <gr-icon [name]="icono()" [size]="32" [class]="color()" />
    <p class="text-ui-h5 text-text-primary">{{ titulo() }}</p>
    <div class="text-body-s text-text-secondary"><ng-content /></div>
    @if (meta()) { <p class="text-body-xs text-text-tertiary">{{ meta() }}</p> }
    <div class="flex flex-col gap-2 empty:hidden"><ng-content select="[acciones]" /></div>
  `,
})
export class TarjetaEstado {
  readonly tono = input<keyof typeof TONO_TARJETA>('neutro');
  readonly icono = input<GrIconName>('circle-alert');
  readonly titulo = input.required<string>();
  readonly meta = input('');
  protected readonly caja = computed(() => TONO_TARJETA[this.tono()]);
  protected readonly color = computed(() => ICONO_TARJETA[this.tono()]);
}

/**
 * El popover con la alineación de un jugador (Figma «Popover alineación»; en móvil, «Hoja inferior»): solo lectura,
 * con la nota de cada atleta y la media. Se cierra con Escape, con la X o al pulsar fuera.
 */
@Component({
  selector: 'gr-popover-alineacion',
  imports: [AlineacionLista, GrButton, GrIcon, GrPopover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <gr-popover [etiqueta]="'Alineación de @' + fila().alias" (cerrar)="cerrar.emit()">
      <div class="flex items-start gap-2">
        <p class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-ui-h4 text-text-primary md:text-label-s">Alineación de &#64;{{ fila().alias }}</span>
          <span class="text-body-s text-text-secondary md:text-body-xs md:text-text-tertiary">{{ sala() }} · {{ fila().alineacion.length }} {{ fila().alineacion.length === 1 ? 'atleta' : 'atletas' }} · media {{ final() ? 'final' : 'provisional' }} {{ n2(fila().nota) }}</span>
        </p>
        <button type="button" class="-m-3 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="16" /></button>
      </div>
      <gr-alineacion-lista [atletas]="fila().alineacion" [media]="fila().nota" [conNota]="fila().conNota" [final]="final()" />
      @if (verSala()) { <a grButton variant="outline" [block]="true" class="md:hidden" [href]="verSala()">Ver sala</a> }
    </gr-popover>
  `,
})
export class PopoverAlineacion {
  protected readonly n2 = nota2;
  readonly fila = input.required<Pick<FilaSala, 'alias' | 'nota' | 'conNota' | 'alineacion'>>();
  readonly sala = input('');
  /** Jornada cerrada: las notas son finales. */
  readonly final = input(false);
  /** Enlace «Ver sala» de la hoja inferior (móvil). */
  readonly verSala = input('');
  readonly cerrar = output<void>();
}

/** Lo que se edita de una sala ya creada (el anfitrión, antes de empezar). */
export interface SalaEditable {
  id: string;
  nombre: string;
  plazas: number;
  publica: boolean;
  miembros: number;
}

/**
 * El modal de crear sala (Figma «Modal · Crear sala»; en móvil, hoja inferior): nombre (3–32), plazas (de 2 al cupo
 * del día = atletas ÷ 5, tope 10) y visibilidad. El mismo modal edita una sala ya creada (nombre, plazas y
 * visibilidad) mientras no haya empezado.
 */
@Component({
  selector: 'gr-crear-sala-modal',
  imports: [A11yModule, FormsModule, GrAviso, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <button type="button" tabindex="-1" class="absolute inset-0 bg-bg-deep/80" aria-label="Cerrar" (click)="cerrar.emit()"></button>
      <form class="relative flex max-h-[94dvh] w-full max-w-[560px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-2xl border border-line-strong bg-bg-surface px-5 pt-5 pb-7 md:rounded-2xl md:p-8"
        role="dialog" aria-modal="true" aria-labelledby="crear-sala-titulo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (ngSubmit)="enviar()">
        <header class="flex items-start gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="crear-sala-titulo" class="text-ui-h3 text-text-primary">{{ editar() ? 'Editar sala' : 'Crear sala' }}</h2>
            <p class="text-body-s text-text-tertiary">{{ editar() ? 'Puedes cambiar el nombre, las plazas y la visibilidad hasta que empiece el día.' : 'Tú serás el anfitrión. Comparte el enlace y empieza con 2 jugadores o más.' }}</p>
          </div>
          <button type="button" class="-m-3 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>

        @if (!puede()) {
          <gr-aviso tono="aviso" titulo="Hoy no hay atletas suficientes para crear una sala">Se necesitan al menos 10 atletas inscritos hoy (2 jugadores × 5 titulares). Ahora mismo hay {{ atletas() }}. Vuelve cuando se publique el cuadro completo del día.</gr-aviso>
        } @else if (errorGeneral(); as e) {
          <gr-aviso tono="error" [titulo]="e.titulo">{{ e.texto }}</gr-aviso>
        }

        <label class="flex flex-col gap-1.5" [class.opacity-50]="!puede()">
          <span class="text-label-s text-text-secondary">Nombre de la sala</span>
          <span class="flex h-12 items-center gap-2 rounded-md border bg-bg-field px-3 focus-within:border-line-accent" [class]="errorNombre() ? 'border-2 border-crimson' : 'border-line-strong'">
            <input type="text" name="nombre" class="min-w-0 flex-1 bg-transparent text-body-m text-text-primary outline-none placeholder:text-text-muted" maxlength="32" autocomplete="off" placeholder="Los Cuervos de Gonzalo"
              [disabled]="!puede()" [attr.aria-invalid]="!!errorNombre()" aria-describedby="crear-sala-ayuda" [ngModel]="nombre()" (ngModelChange)="nombre.set($event); errorNombre.set(null)" />
            <span class="shrink-0 text-mono-xs" [class]="errorNombre() ? 'text-crimson' : 'text-text-muted'">{{ nombre().trim().length }}/32</span>
          </span>
          @if (puede()) {
            <span id="crear-sala-ayuda" class="text-body-xs" [class]="errorNombre() ? 'text-crimson' : 'text-text-tertiary'">{{ errorNombre() || (publica() ? 'Visible para todos en el lobby. 3–32 caracteres, único por día.' : 'Solo lo ve quien tenga el enlace. 3–32 caracteres, único por día.') }}</span>
          }
        </label>

        @if (puede()) {
          <div class="flex flex-col gap-2" role="group" aria-labelledby="crear-sala-plazas">
            <span id="crear-sala-plazas" class="text-label-s text-text-secondary">Plazas (jugadores)</span>
            <div class="flex items-center gap-4">
              <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-strong bg-bg-raised text-text-primary disabled:opacity-40" aria-label="Una plaza menos" [disabled]="plazas() <= minimo()" (click)="plazas.set(plazas() - 1)"><gr-icon name="minus" [size]="20" /></button>
              <output class="flex h-11 w-20 items-center justify-center rounded-md border border-line-strong bg-bg-field text-mono-s text-text-primary tabular-nums" aria-live="polite">{{ plazas() }}</output>
              <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-strong bg-bg-raised text-text-primary disabled:opacity-40" aria-label="Una plaza más" [disabled]="plazas() >= plazasMax()" (click)="plazas.set(plazas() + 1)"><gr-icon name="plus" [size]="20" /></button>
            </div>
            <ol class="flex flex-wrap gap-1.5" aria-hidden="true">
              @for (n of escala(); track n) {
                <li class="flex size-7 items-center justify-center rounded-sm text-mono-xs text-text-primary" [class]="n <= plazas() ? 'bg-accent' : 'bg-bg-raised'">{{ n }}</li>
              }
            </ol>
          </div>
          <p class="text-body-xs text-text-tertiary">Máximo hoy: {{ plazasMax() }} ({{ atletas() }} atletas ÷ 5, tope 10). Mínimo 2. Si hay menos atletas, las plazas se ajustan solas.</p>

          <div class="flex flex-col gap-1.5" role="radiogroup" aria-labelledby="crear-sala-vis">
            <span id="crear-sala-vis" class="text-label-s text-text-secondary">Visibilidad</span>
            <div class="grid grid-cols-2 gap-1 rounded-md border border-line-subtle bg-bg-field p-1">
              @for (o of visibilidades; track o.l) {
                <button type="button" role="radio" [attr.aria-checked]="publica() === o.v" class="flex min-h-11 flex-col gap-0.5 rounded-sm border px-3 py-2 text-left" [class]="publica() === o.v ? 'border-line-accent bg-bg-raised' : 'border-transparent'" (click)="publica.set(o.v)">
                  <span class="text-label-s" [class]="publica() === o.v ? 'text-text-primary' : 'text-text-tertiary'">{{ o.l }}</span>
                  <span class="text-body-xs text-text-muted">{{ o.d }}</span>
                </button>
              }
            </div>
          </div>

          <p class="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-bg-card p-3">
            <span class="text-mono-xs text-text-muted">Así se publicará</span>
            <span class="text-body-s text-text-secondary">{{ vistaPrevia() }}</span>
          </p>
        }

        <div class="flex flex-col-reverse gap-2 md:flex-row">
          <button type="button" grButton variant="outline" class="w-full md:w-auto" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" grButton variant="primary" class="w-full md:w-auto" [loading]="enviando()" [disabled]="!valido()">{{ editar() ? 'Guardar cambios' : 'Crear sala' }}</button>
        </div>
      </form>
    </div>
  `,
})
export class CrearSalaModal {
  private readonly juegos = inject(Juegos);
  /** Atletas del día y cupo de jugadores por sala (floor(atletas ÷ 5), tope 10). */
  readonly atletas = input(0);
  readonly plazasMax = input(0);
  readonly puedeCrear = input(true);
  /** El alias del anfitrión (para el resumen). */
  readonly alias = input('');
  /** Si se pasa, el modal edita esa sala en vez de crear una. */
  readonly editar = input<SalaEditable | null>(null);
  readonly cerrar = output<void>();
  /** La sala creada o editada (su id). */
  readonly hecho = output<string>();

  protected readonly nombre = signal('');
  protected readonly plazas = signal(2);
  protected readonly publica = signal(true);
  protected readonly enviando = signal(false);
  protected readonly errorNombre = signal<string | null>(null);
  protected readonly errorGeneral = signal<{ titulo: string; texto: string } | null>(null);
  protected readonly visibilidades = [
    { v: true, l: 'Pública', d: 'Aparece en el lobby' },
    { v: false, l: 'Solo enlace', d: 'No se lista' },
  ];

  protected readonly puede = computed(() => !!this.editar() || (this.puedeCrear() && this.plazasMax() >= 2));
  /** No se puede bajar de los jugadores que ya hay. */
  protected readonly minimo = computed(() => Math.max(2, this.editar()?.miembros ?? 2));
  protected readonly escala = computed(() => Array.from({ length: Math.max(0, this.plazasMax() - 1) }, (_, i) => i + 2));
  /** «Así se publicará»: sigue al nombre y a las plazas elegidas. */
  protected readonly vistaPrevia = computed(() => {
    const m = this.editar()?.miembros ?? 1;
    return `${this.nombre().trim() || 'Tu sala'} · ${m}/${this.plazas()} jugadores · ${m < 2 ? 'Esperando (mín. 2)' : 'Abierta'} · Anfitrión @${this.alias()}`;
  });
  protected readonly valido = computed(() => this.puede() && this.nombre().trim().length >= 3 && this.nombre().trim().length <= 32 && !this.enviando());

  constructor() {
    // El formulario arranca con la sala que se edita o, al crear, con el cupo completo del día.
    effect(() => {
      const e = this.editar();
      this.nombre.set(e?.nombre ?? '');
      this.plazas.set(e?.plazas ?? Math.max(2, this.plazasMax()));
      this.publica.set(e?.publica ?? true);
    });
  }

  protected async enviar(): Promise<void> {
    if (!this.valido()) return;
    this.enviando.set(true);
    this.errorNombre.set(null);
    this.errorGeneral.set(null);
    const nombre = this.nombre().trim();
    try {
      const e = this.editar();
      if (e) {
        await this.juegos.editarSala(e.id, { nombre: nombre !== e.nombre ? nombre : undefined, plazas: this.plazas() !== e.plazas ? this.plazas() : undefined, publica: this.publica() !== e.publica ? this.publica() : undefined });
        this.hecho.emit(e.id);
      } else {
        const { salaId } = await this.juegos.crearSala(nombre, this.publica());
        // La sala nace con el cupo del día: si el anfitrión eligió menos plazas, se ajusta a continuación.
        if (this.plazas() < this.plazasMax()) await this.juegos.editarSala(salaId, { plazas: this.plazas() }).catch(() => undefined);
        this.hecho.emit(salaId);
      }
    } catch (err) {
      const c = codigoError(err);
      if (c === 'NOMBRE_NO_VALIDO' || c === 'NOMBRE_OCUPADO') this.errorNombre.set(detalleError(err)); // el detalle del API dice el motivo exacto (caracteres, palabra o repetido)
      else if (c === 'YA_EN_SALA') this.errorGeneral.set({ titulo: 'Ya estás en otra sala hoy', texto: 'Solo puedes estar en una sala por día. Sal de ella para crear una nueva.' });
      else if (c === 'PLAZAS_NO_VALIDAS') this.errorGeneral.set({ titulo: 'Plazas no válidas', texto: `Máximo hoy: ${this.plazasMax()} plazas (${this.atletas()} atletas ÷ 5 = ${this.plazasMax()}).` });
      else this.errorGeneral.set({ titulo: 'No se pudo guardar la sala', texto: mensajeError(err) });
    } finally {
      this.enviando.set(false);
    }
  }
}
