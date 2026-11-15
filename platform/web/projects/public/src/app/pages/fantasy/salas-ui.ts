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
import { I18n } from '../../core/i18n';
import { AlineacionLista, GrAviso } from './componentes';

const T = {
  es: {
    alineacionDe: 'Alineación de @',
    popoverSub: (s: string, n: number, f: boolean, m: string) => `${s} · ${n} ${n === 1 ? 'atleta' : 'atletas'} · media ${f ? 'final' : 'provisional'} ${m}`,
    cerrar: 'Cerrar',
    verSala: 'Ver sala',
    editarSala: 'Editar sala',
    crearSala: 'Crear sala',
    editarTxt: 'Puedes cambiar el nombre, las plazas y la visibilidad hasta que empiece el día.',
    crearTxt: 'Tú serás el anfitrión. Comparte el enlace y empieza con 2 jugadores o más.',
    sinAtletas: 'Hoy no hay atletas suficientes para crear una sala',
    sinAtletasTxt: (n: number) => `Se necesitan al menos 10 atletas inscritos hoy (2 jugadores × 5 titulares). Ahora mismo hay ${n}. Vuelve cuando se publique el cuadro completo del día.`,
    nombre: 'Nombre de la sala',
    placeholder: 'Los Cuervos de Gonzalo',
    ayudaPublica: 'Visible para todos en el lobby. 3–32 caracteres, único por día.',
    ayudaEnlace: 'Solo lo ve quien tenga el enlace. 3–32 caracteres, único por día.',
    plazas: 'Plazas (jugadores)',
    menos: 'Una plaza menos',
    mas: 'Una plaza más',
    maximo: (m: number, a: number) => `Máximo hoy: ${m} (${a} atletas ÷ 5, tope 10). Mínimo 2. Si hay menos atletas, las plazas se ajustan solas.`,
    visibilidad: 'Visibilidad',
    asi: 'Así se publicará',
    cancelar: 'Cancelar',
    guardar: 'Guardar cambios',
    publica: 'Pública',
    publicaD: 'Aparece en el lobby',
    enlace: 'Solo enlace',
    enlaceD: 'No se lista',
    tuSala: 'Tu sala',
    vista: (n: string, m: number, p: number, esperando: boolean, a: string) => `${n} · ${m}/${p} jugadores · ${esperando ? 'Esperando (mín. 2)' : 'Abierta'} · Anfitrión @${a}`,
    min3: 'Mínimo 3 caracteres.',
    yaEnSala: 'Ya estás en otra sala hoy',
    yaEnSalaTxt: 'Solo puedes estar en una sala por día. Sal de ella para crear una nueva.',
    plazasMal: 'Plazas no válidas',
    plazasMalTxt: (m: number, a: number) => `Máximo hoy: ${m} plazas (${a} atletas ÷ 5 = ${m}).`,
    noGuardar: 'No se pudo guardar la sala',
  },
  en: {
    alineacionDe: 'Line-up of @',
    popoverSub: (s: string, n: number, f: boolean, m: string) => `${s} · ${n} ${n === 1 ? 'athlete' : 'athletes'} · ${f ? 'final' : 'provisional'} average ${m}`,
    cerrar: 'Close',
    verSala: 'See league',
    editarSala: 'Edit league',
    crearSala: 'Create league',
    editarTxt: 'You can change the name, places and visibility until the day starts.',
    crearTxt: "You'll be the host. Share the link and start with 2 or more players.",
    sinAtletas: 'There are not enough athletes today to create a league',
    sinAtletasTxt: (n: number) => `At least 10 athletes registered today are needed (2 players × 5 starters). Right now there are ${n}. Come back when the day's full line-up is published.`,
    nombre: 'League name',
    placeholder: "Gonzalo's Ravens",
    ayudaPublica: 'Visible to everyone in the lobby. 3–32 characters, unique per day.',
    ayudaEnlace: 'Only people with the link can see it. 3–32 characters, unique per day.',
    plazas: 'Places (players)',
    menos: 'One place fewer',
    mas: 'One place more',
    maximo: (m: number, a: number) => `Maximum today: ${m} (${a} athletes ÷ 5, cap of 10). Minimum 2. If there are fewer athletes, places adjust automatically.`,
    visibilidad: 'Visibility',
    asi: 'How it will be published',
    cancelar: 'Cancel',
    guardar: 'Save changes',
    publica: 'Public',
    publicaD: 'Shown in the lobby',
    enlace: 'Link only',
    enlaceD: 'Not listed',
    tuSala: 'Your league',
    vista: (n: string, m: number, p: number, esperando: boolean, a: string) => `${n} · ${m}/${p} players · ${esperando ? 'Waiting (min. 2)' : 'Open'} · Host @${a}`,
    min3: 'Minimum 3 characters.',
    yaEnSala: 'You are already in another league today',
    yaEnSalaTxt: 'You can only be in one league per day. Leave it to create a new one.',
    plazasMal: 'Invalid number of places',
    plazasMalTxt: (m: number, a: number) => `Maximum today: ${m} places (${a} athletes ÷ 5 = ${m}).`,
    noGuardar: "The league couldn't be saved",
  },
};

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
    <div class="text-body-m text-text-secondary"><ng-content /></div>
    @if (meta()) { <p class="text-body-s text-text-tertiary">{{ meta() }}</p> }
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
    <gr-popover [etiqueta]="t().alineacionDe + fila().alias" (cerrar)="cerrar.emit()">
      <div class="flex items-start gap-2">
        <p class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-ui-h4 text-text-primary md:text-label-s">{{ t().alineacionDe }}{{ fila().alias }}</span>
          <span class="text-body-s text-text-secondary md:text-body-xs md:text-text-tertiary">{{ t().popoverSub(sala(), fila().alineacion.length, final(), n2(fila().nota)) }}</span>
        </p>
        <button type="button" class="-m-3 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:text-text-primary" [attr.aria-label]="t().cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="16" /></button>
      </div>
      <gr-alineacion-lista [atletas]="fila().alineacion" [media]="fila().nota" [conNota]="fila().conNota" [final]="final()" />
      @if (verSala()) { <a grButton variant="outline" [block]="true" class="md:hidden" [href]="verSala()">{{ t().verSala }}</a> }
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
  protected readonly t = inject(I18n).dict(T);
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
      <button type="button" tabindex="-1" class="absolute inset-0 bg-bg-deep/80 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none" [attr.aria-label]="t().cerrar" (click)="cerrar.emit()"></button>
      <!-- UX6-R1-4: hoja inferior iOS: tirador, safe-area, entrada deslizando y arrastrar hacia abajo para cerrar -->
      <form class="relative flex max-h-[94dvh] w-full max-w-[560px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-2xl border border-line-strong bg-bg-surface px-5 pt-6 pb-[max(28px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] starting:translate-y-full motion-reduce:transition-none md:rounded-2xl md:p-8 md:starting:translate-y-0"
        [style.transform]="arrastre() ? 'translateY(' + arrastre() + 'px)' : null" [class.transition-none]="arrastrando"
        role="dialog" aria-modal="true" aria-labelledby="crear-sala-titulo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (ngSubmit)="enviar()">
        <div class="absolute inset-x-0 top-0 flex h-6 touch-none justify-center pt-2 md:hidden" aria-hidden="true" (pointerdown)="empezarArrastre($event)" (pointermove)="moverArrastre($event)" (pointerup)="soltarArrastre()" (pointercancel)="soltarArrastre()">
          <span class="h-[5px] w-9 rounded-full bg-line-strong"></span>
        </div>
        <header class="flex items-start gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="crear-sala-titulo" class="text-ui-h3 text-text-primary">{{ editar() ? t().editarSala : t().crearSala }}</h2>
            <p class="text-body-s text-text-tertiary">{{ editar() ? t().editarTxt : t().crearTxt }}</p>
          </div>
          <button type="button" class="-m-3 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:text-text-primary" [attr.aria-label]="t().cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>

        @if (!puede()) {
          <gr-aviso tono="aviso" [titulo]="t().sinAtletas">{{ t().sinAtletasTxt(atletas()) }}</gr-aviso>
        } @else if (errorGeneral(); as e) {
          <gr-aviso tono="error" [titulo]="e.titulo">{{ e.texto }}</gr-aviso>
        }

        <label class="flex flex-col gap-1.5" [class.opacity-50]="!puede()">
          <span class="text-label-s text-text-secondary">{{ t().nombre }}</span>
          <span class="flex h-12 items-center gap-2 rounded-md border bg-bg-field px-3 focus-within:border-line-accent" [class.border-2]="!!errorNombre()" [class.border-crimson]="!!errorNombre()" [class.border-line-strong]="!errorNombre()">
            <input type="text" name="nombre" class="min-w-0 flex-1 bg-transparent text-body-m text-text-primary outline-none placeholder:text-text-muted" maxlength="32" autocomplete="off" enterkeyhint="done" autocapitalize="words" spellcheck="false" [placeholder]="t().placeholder"
              [disabled]="!puede()" [attr.aria-invalid]="!!errorNombre()" aria-describedby="crear-sala-ayuda" [ngModel]="nombre()" (ngModelChange)="nombre.set($event); errorNombre.set(null)" (blur)="validarNombre(true)" />
            <span class="shrink-0 text-meta" [class]="errorNombre() ? 'text-crimson' : 'text-text-tertiary'">{{ nombre().trim().length }}/32</span>
          </span>
          @if (puede()) {
            <span id="crear-sala-ayuda" class="text-body-s" [class]="errorNombre() ? 'text-crimson' : 'text-text-tertiary'">{{ errorNombre() || (publica() ? t().ayudaPublica : t().ayudaEnlace) }}</span>
          }
        </label>

        @if (puede()) {
          <div class="flex flex-col gap-2" role="group" aria-labelledby="crear-sala-plazas">
            <span id="crear-sala-plazas" class="text-label-s text-text-secondary">{{ t().plazas }}</span>
            <div class="flex items-center gap-4">
              <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-strong bg-bg-raised text-text-primary disabled:opacity-40" [attr.aria-label]="t().menos" [disabled]="plazas() <= minimo()" (click)="plazas.set(plazas() - 1)"><gr-icon name="minus" [size]="20" /></button>
              <output class="flex h-11 w-20 items-center justify-center rounded-md border border-line-strong bg-bg-field text-mono-s text-text-primary tabular-nums" aria-live="polite">{{ plazas() }}</output>
              <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-strong bg-bg-raised text-text-primary disabled:opacity-40" [attr.aria-label]="t().mas" [disabled]="plazas() >= plazasMax()" (click)="plazas.set(plazas() + 1)"><gr-icon name="plus" [size]="20" /></button>
            </div>
            <span class="block h-1.5 max-w-[236px] overflow-hidden rounded-pill bg-bg-raised" aria-hidden="true"><span class="block h-full rounded-pill bg-accent" [style.width.%]="plazasMax() ? (plazas() / plazasMax()) * 100 : 0"></span></span>
          </div>
          <p class="text-body-s text-text-tertiary">{{ t().maximo(plazasMax(), atletas()) }}</p>

          <div class="flex flex-col gap-1.5" role="radiogroup" aria-labelledby="crear-sala-vis">
            <span id="crear-sala-vis" class="text-label-s text-text-secondary">{{ t().visibilidad }}</span>
            <div class="grid grid-cols-2 gap-1 rounded-md border border-line-subtle bg-bg-field p-1">
              @for (o of visibilidades(); track o.l) {
                <button type="button" role="radio" [attr.aria-checked]="publica() === o.v" class="flex min-h-11 flex-col gap-0.5 rounded-sm border px-3 py-2 text-left" [class]="publica() === o.v ? 'border-line-accent bg-bg-raised' : 'border-transparent'" (click)="publica.set(o.v)">
                  <span class="text-label-s" [class]="publica() === o.v ? 'text-text-primary' : 'text-text-tertiary'">{{ o.l }}</span>
                  <span class="text-body-s text-text-tertiary">{{ o.d }}</span>
                </button>
              }
            </div>
          </div>

          <p class="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-bg-card p-3">
            <span class="text-meta text-text-tertiary">{{ t().asi }}</span>
            <span class="text-body-s text-text-secondary">{{ vistaPrevia() }}</span>
          </p>
        }

        <div class="flex flex-col-reverse gap-2 md:flex-row">
          <button type="button" grButton variant="outline" class="w-full md:w-auto" (click)="cerrar.emit()">{{ t().cancelar }}</button>
          <button type="submit" grButton variant="primary" class="w-full md:w-auto" [loading]="enviando()" [disabled]="!puede()">{{ editar() ? t().guardar : t().crearSala }}</button>
        </div>
      </form>
    </div>
  `,
})
export class CrearSalaModal {
  private readonly juegos = inject(Juegos);
  protected readonly t = inject(I18n).dict(T);
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
  protected readonly visibilidades = computed(() => [
    { v: true, l: this.t().publica, d: this.t().publicaD },
    { v: false, l: this.t().enlace, d: this.t().enlaceD },
  ]);

  protected readonly puede = computed(() => !!this.editar() || (this.puedeCrear() && this.plazasMax() >= 2));
  /** No se puede bajar de los jugadores que ya hay. */
  protected readonly minimo = computed(() => Math.max(2, this.editar()?.miembros ?? 2));
  protected readonly arrastre = signal(0);
  protected arrastrando = false;
  private inicioArrastre = 0;
  /** «Así se publicará»: sigue al nombre y a las plazas elegidas. */
  protected readonly vistaPrevia = computed(() => {
    const m = this.editar()?.miembros ?? 1;
    return this.t().vista(this.nombre().trim() || this.t().tuSala, m, this.plazas(), m < 2, this.alias());
  });

  constructor() {
    // El formulario arranca con la sala que se edita o, al crear, con el cupo completo del día.
    effect(() => {
      const e = this.editar();
      this.nombre.set(e?.nombre ?? '');
      this.plazas.set(e?.plazas ?? Math.max(2, this.plazasMax()));
      this.publica.set(e?.publica ?? true);
    });
  }

  /** UX6-R1-8: el botón no se deshabilita; el nombre se valida al salir del campo y al enviar. */
  protected validarNombre(blur = false): boolean {
    const n = this.nombre().trim().length;
    if (blur && !n) return false;
    if (n < 3) this.errorNombre.set(this.t().min3);
    return n >= 3;
  }
  protected empezarArrastre(e: PointerEvent): void {
    this.arrastrando = true;
    this.inicioArrastre = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  protected moverArrastre(e: PointerEvent): void {
    if (this.arrastrando) this.arrastre.set(Math.max(0, e.clientY - this.inicioArrastre));
  }
  protected soltarArrastre(): void {
    if (!this.arrastrando) return;
    this.arrastrando = false;
    if (this.arrastre() > 80) this.cerrar.emit();
    else this.arrastre.set(0);
  }

  protected async enviar(): Promise<void> {
    if (this.enviando() || !this.puede() || !this.validarNombre()) return;
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
      else if (c === 'YA_EN_SALA') this.errorGeneral.set({ titulo: this.t().yaEnSala, texto: this.t().yaEnSalaTxt });
      else if (c === 'PLAZAS_NO_VALIDAS') this.errorGeneral.set({ titulo: this.t().plazasMal, texto: this.t().plazasMalTxt(this.plazasMax(), this.atletas()) });
      else this.errorGeneral.set({ titulo: this.t().noGuardar, texto: mensajeError(err) });
    } finally {
      this.enviando.set(false);
    }
  }
}
