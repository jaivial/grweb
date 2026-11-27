import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, output, signal, untracked, computed } from '@angular/core';
import { GrButton, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoIaChat, type ChatAplicada, type ChatMensaje } from '../../shared/ia-chat';
import { errText } from '../../shared/ui';
import { FormulariosApi, type Modelo, type RespuestaIA } from './api';
import { FormularioStore } from './store';

const EJEMPLOS = [
  'Añade una pregunta de talla de camiseta con S, M, L y XL',
  'Haz el título más corto y directo',
  'Marca como obligatorios el email y el teléfono',
  'Pon el texto del botón en «Confirmar inscripción»',
];

/** Receipt of an applied AI change: `revision` is the draft revision it produced (undo is exact only while it still matches). */
interface Recibo { cambios: string[]; hora: string; revision: number }

const horaAhora = (): string => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date());

/**
 * AI assistant of the form editor (contract §7). Sends the draft and the selection, and applies the returned draft as
 * ONE undoable change; nothing is saved until the person presses «Guardar». If the draft changed while the AI worked,
 * the result is not applied silently: the person chooses «Aplicar igualmente» or «Descartar».
 */
@Component({
  selector: 'bo-ia-formulario',
  imports: [BoIaChat, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pendiente(); as p) {
      <div role="alert" class="mb-3 flex flex-col gap-2 rounded-[10px] border border-line-strong bg-bg-raised p-3 text-body-xs">
        <p class="text-text-primary">Has cambiado el formulario mientras la IA trabajaba.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" grButton size="s" variant="primary" (click)="aplicarIgualmente()">Aplicar igualmente</button>
          <button type="button" grButton size="s" variant="ghost" (click)="descartar()">Descartar</button>
        </div>
      </div>
    }
    @if (reciboObsoleto(); as r) {
      <p class="mb-3 rounded-[10px] border border-line-subtle bg-bg-raised/60 px-3 py-2 text-body-xs text-text-secondary">
        Aplicado{{ r.cambios.length ? ' · ' + r.cambios.join(', ') : '' }} · {{ r.hora }}. Has editado después: usa Deshacer del editor.
      </p>
    }
    <bo-ia-chat
      titulo="Asistente IA"
      descripcion="Cambia textos, campos, opciones, tema o los textos del email. Pide cambios concretos."
      placeholder="Pide un cambio al formulario…"
      [mensajes]="mensajes()"
      [ejemplos]="ejemplos"
      [cargando]="cargando()"
      [segundos]="segundos()"
      [modelos]="modelos()"
      [aplicada]="aplicada()"
      [(modelo)]="modelo"
      (enviar)="enviar($event)"
      (cerrar)="cerrar.emit()"
      (deshacer)="deshacer()"
    />
  `,
})
export class BoIaFormulario {
  private readonly api = inject(FormulariosApi);
  private readonly store = inject(FormularioStore);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  readonly cerrar = output<void>();
  protected readonly mensajes = signal<ChatMensaje[]>([]);
  protected readonly cargando = signal(false);
  protected readonly segundos = signal(0);
  protected readonly modelos = signal<Modelo[]>([]);
  protected readonly modelo = signal('');
  /** AI result not applied because the draft changed while it worked. */
  protected readonly pendiente = signal<RespuestaIA | null>(null);
  private readonly recibo = signal<Recibo | null>(null);
  /** The receipt (with its Deshacer) only while the draft is still the one the AI produced. */
  protected readonly aplicada = computed<ChatAplicada | null>(() => {
    const r = this.recibo();
    return r && r.revision === this.store.revision() ? { cambios: r.cambios, hora: r.hora } : null;
  });
  /** Applied earlier, but edited since: its undo is no longer exact, so the receipt points to the editor's undo. */
  protected readonly reciboObsoleto = computed(() => {
    const r = this.recibo();
    return r && r.revision !== this.store.revision() ? r : null;
  });
  protected readonly ejemplos = EJEMPLOS;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly cid = computed(() => this.comps.current()?.id ?? '');

  constructor() {
    effect(() => {
      const c = this.cid();
      if (!c) return;
      untracked(() => void this.cargarModelos(c));
    });
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  private async cargarModelos(cid: string): Promise<void> {
    try {
      const lista = await this.api.modelos(cid);
      this.modelos.set(lista);
      const recomendado = lista.find((m) => m.recomendado) ?? lista[0];
      if (recomendado && !this.modelo()) this.modelo.set(recomendado.id);
    } catch {
      this.modelos.set([]);
    }
  }

  protected async enviar(texto: string): Promise<void> {
    const borrador = this.store.draft();
    if (!borrador || this.cargando()) return;
    const historial = this.mensajes();
    // Revision of the draft the AI works on: if it moves before the answer arrives, the answer waits for the person.
    const revisionEnvio = this.store.revision();
    this.pendiente.set(null);
    this.mensajes.update((m) => [...m, { rol: 'usuario', texto }]);
    this.cargando.set(true);
    this.segundos.set(0);
    this.timer = setInterval(() => this.segundos.update((s) => s + 1), 1000);
    try {
      const sel = this.store.seleccion();
      const r = await this.api.ia(this.cid(), {
        instruccion: texto,
        historial: historial.slice(-12),
        borrador,
        seleccion: sel ?? undefined,
        modelo: this.modelo() || undefined,
      });
      if (this.store.revision() === revisionEnvio) {
        this.aplicarResultado(r);
        this.responder(r.respuesta || 'Hecho. Revisa el resultado en el lienzo.');
      } else {
        this.pendiente.set(r);
        this.responder(r.respuesta || 'La IA ha terminado.');
      }
    } catch (e) {
      const msg = errText(e, 'La IA no ha podido editar el formulario. Inténtalo de nuevo.');
      this.responder(msg);
      this.toasts.error('No se ha aplicado el cambio', msg);
    } finally {
      clearInterval(this.timer);
      this.cargando.set(false);
    }
  }

  protected aplicarIgualmente(): void {
    const p = this.pendiente();
    if (!p) return;
    this.pendiente.set(null);
    this.aplicarResultado(p);
  }

  protected descartar(): void {
    this.pendiente.set(null);
    this.responder('Cambio descartado: el formulario no se ha modificado.');
  }

  protected deshacer(): void {
    const r = this.recibo();
    if (r && this.store.deshacerDesde(r.revision)) this.recibo.set(null);
  }

  /** Applies the AI draft as one undoable step and keeps its receipt. */
  private aplicarResultado(r: RespuestaIA): void {
    const revision = this.store.aplicarBorrador(r.borrador);
    this.recibo.set({ cambios: r.cambios, hora: horaAhora(), revision });
  }

  private responder(texto: string): void {
    this.mensajes.update((m) => [...m, { rol: 'asistente', texto }]);
  }
}
