import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, output, signal, untracked, computed } from '@angular/core';
import { GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoIaChat, type ChatAplicada, type ChatMensaje } from '../../shared/ia-chat';
import { errText } from '../../shared/ui';
import { FormulariosApi, type Modelo } from './api';
import { FormularioStore } from './store';

const EJEMPLOS = [
  'Añade una pregunta de talla de camiseta con S, M, L y XL',
  'Haz el título más corto y directo',
  'Marca como obligatorios el email y el teléfono',
  'Pon el texto del botón en «Confirmar inscripción»',
];

/**
 * AI assistant of the form editor (contract §7). Sends the draft and the selection, and applies the returned draft as
 * ONE undoable change; nothing is saved until the person presses «Guardar».
 */
@Component({
  selector: 'bo-ia-formulario',
  imports: [BoIaChat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
  protected readonly aplicada = signal<ChatAplicada | null>(null);
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
      this.store.aplicarBorrador(r.borrador);
      const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date());
      this.aplicada.set({ cambios: r.cambios, hora });
      this.mensajes.update((m) => [...m, { rol: 'asistente', texto: r.respuesta || 'Hecho. Revisa el resultado en el lienzo.' }]);
    } catch (e) {
      const msg = errText(e, 'La IA no ha podido editar el formulario. Inténtalo de nuevo.');
      this.mensajes.update((m) => [...m, { rol: 'asistente', texto: msg }]);
      this.toasts.error('No se ha aplicado el cambio', msg);
    } finally {
      clearInterval(this.timer);
      this.cargando.set(false);
    }
  }

  protected deshacer(): void {
    this.store.deshacer();
    this.aplicada.set(null);
  }
}
