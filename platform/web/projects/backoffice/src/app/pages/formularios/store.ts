import { Injectable, computed, signal } from '@angular/core';
import type { Ajustes, Borrador, Campo, EstadoFormulario, Formulario, Opcion, Tema, TextosEmail, TipoCampo } from './api';
import { campoNuevo, clonarCampo } from './catalogo';
import { cambiar, esSoloWeb, indiceDe, insertar, mover } from './esquema';

const MAX_PASOS = 100;
/** Edits of the same field within this window are one undo step (typing is not one step per letter). */
const VENTANA_MS = 1000;

/**
 * Draft of one form in the editor: the working copy, the selection, the undo/redo history and the dirty flag.
 * Provided by the editor page (one instance per open form); the builder tabs and the preview read it.
 * Every change goes through `mutar`, so undo, dirty and the save baseline stay in one place.
 */
@Injectable()
export class FormularioStore {
  readonly formulario = signal<Formulario | null>(null);
  readonly draft = signal<Borrador | null>(null);
  readonly seleccion = signal<string | null>(null);

  readonly campos = computed<Campo[]>(() => this.draft()?.esquema.campos ?? []);
  readonly campoSeleccionado = computed<Campo | null>(() => {
    const id = this.seleccion();
    return this.campos().find((c) => c.id === id) ?? null;
  });
  readonly ajustes = computed<Ajustes | null>(() => this.draft()?.esquema.ajustes ?? null);
  readonly soloWeb = computed(() => esSoloWeb(this.campos()));
  readonly dirty = computed(() => {
    const b = this.draft();
    return !!b && JSON.stringify(b) !== this.base();
  });
  readonly puedeDeshacer = computed(() => this.pasado().length > 0);
  readonly puedeRehacer = computed(() => this.futuro().length > 0);
  /** Changes on every draft replacement (edit, undo, redo, load, save, AI result). Never goes back: equal revisions mean the same draft. */
  private readonly revisionSig = signal(0);
  readonly revision = this.revisionSig.asReadonly();

  /** JSON of the last saved (or loaded) draft: the dirty flag compares against it. */
  private readonly base = signal('');
  private readonly pasado = signal<Borrador[]>([]);
  private readonly futuro = signal<Borrador[]>([]);
  private claveActual: string | null = null;
  private ultimoCambio = 0;

  /** Loads a form from the server: resets the draft, history and selection. */
  cargar(f: Formulario): void {
    const b = borradorDe(f);
    this.formulario.set(f);
    this.fijarDraft(structuredClone(b));
    this.base.set(JSON.stringify(b));
    this.pasado.set([]);
    this.futuro.set([]);
    this.seleccion.set(null);
    this.claveActual = null;
  }

  /**
   * After a successful save: the baseline becomes what was sent. When nothing changed while saving, the draft takes the
   * server copy (normalised by the server); otherwise the new edits stay dirty.
   */
  marcarGuardado(f: Formulario, enviado: Borrador): void {
    this.formulario.set(f);
    const b = borradorDe(f);
    const sinCambiosMientras = this.draft() !== null && JSON.stringify(this.draft()) === JSON.stringify(enviado);
    if (sinCambiosMientras) this.fijarDraft(structuredClone(b));
    this.base.set(JSON.stringify(sinCambiosMientras ? b : enviado));
  }

  /** Name shown in the header; the list and the title follow it on save. */
  setNombre(nombre: string, clave: string | null = 'nombre'): void {
    this.mutar((b) => ({ ...b, nombre }), clave);
  }

  /** Estado changed on the server (not part of the draft: it never makes the form dirty). */
  setEstado(estado: EstadoFormulario, actualizadoAt: string): void {
    this.formulario.update((f) => (f ? { ...f, estado, actualizadoAt } : f));
  }

  editarAjustes(p: Partial<Ajustes>, clave: string | null = null): void {
    this.mutar((b) => ({ ...b, esquema: { ...b.esquema, ajustes: { ...b.esquema.ajustes, ...p } } }), clave);
  }

  editarTema(p: Partial<Tema>, clave: string | null = null): void {
    this.mutar((b) => {
      const ajustes = { ...b.esquema.ajustes, tema: { ...b.esquema.ajustes.tema, ...p } };
      return { ...b, esquema: { ...b.esquema, ajustes } };
    }, clave);
  }

  editarEmail(p: Partial<TextosEmail>, clave: string | null = null): void {
    this.mutar((b) => ({ ...b, email: { ...b.email, ...p } }), clave);
  }

  editarWhatsApp(texto: string, clave: string | null = null): void {
    this.mutar((b) => ({ ...b, whatsapp: { texto } }), clave);
  }

  /** Adds a new field of `tipo` at `indice` (default: after the selection, or at the end). Selects it; returns its id. */
  anadir(tipo: TipoCampo, indice?: number): string {
    const campo = campoNuevo(tipo);
    const campos = this.campos();
    const sel = indiceDe(campos, this.seleccion());
    const destino = indice ?? (sel >= 0 ? sel + 1 : campos.length);
    this.mutar((b) => ({ ...b, esquema: { ...b.esquema, campos: insertar(b.esquema.campos, campo, destino) } }));
    this.seleccion.set(campo.id);
    return campo.id;
  }

  /** Moves a field to a new position (drag in the canvas or in the layers list). */
  moverA(id: string, indice: number): void {
    const from = indiceDe(this.campos(), id);
    if (from < 0) return;
    this.mutar((b) => ({ ...b, esquema: { ...b.esquema, campos: mover(b.esquema.campos, from, indice) } }));
  }

  /** Copy of a field right after it; the copy is selected. */
  duplicar(id: string): void {
    const campos = this.campos();
    const i = indiceDe(campos, id);
    if (i < 0) return;
    const copia = clonarCampo(campos[i]);
    this.mutar((b) => ({ ...b, esquema: { ...b.esquema, campos: insertar(b.esquema.campos, copia, i + 1) } }));
    this.seleccion.set(copia.id);
  }

  borrar(id: string): void {
    if (indiceDe(this.campos(), id) < 0) return;
    this.mutar((b) => ({ ...b, esquema: { ...b.esquema, campos: b.esquema.campos.filter((c) => c.id !== id) } }));
    if (this.seleccion() === id) this.seleccion.set(null);
  }

  editarCampo(id: string, p: Partial<Campo>, clave: string | null = null): void {
    this.mutar((b) => ({ ...b, esquema: { ...b.esquema, campos: cambiar(b.esquema.campos, id, (c) => ({ ...c, ...p })) } }), clave);
  }

  editarOpciones(id: string, opciones: Opcion[], clave: string | null = null): void {
    this.editarCampo(id, { opciones }, clave);
  }

  /**
   * Replaces the whole draft as ONE undoable change (the AI assistant's result). Returns the revision it produced: keep it
   * to undo exactly this change later with `deshacerDesde`.
   */
  aplicarBorrador(b: Borrador): number {
    this.mutar(() => structuredClone(b));
    this.ajustarSeleccion();
    return this.revisionSig();
  }

  /**
   * Undoes the last change only if the draft is still the one produced at `revision` (no edit, undo or redo since).
   * Returns false, changing nothing, otherwise: a later edit must not be lost by undoing an older step.
   */
  deshacerDesde(revision: number): boolean {
    if (this.revisionSig() !== revision) return false;
    this.deshacer();
    return true;
  }

  seleccionar(id: string | null): void {
    this.seleccion.set(id);
  }

  deshacer(): void {
    const h = this.pasado();
    const actual = this.draft();
    if (!h.length || !actual) return;
    this.pasado.set(h.slice(0, -1));
    this.futuro.update((f) => [...f, actual]);
    this.fijarDraft(h[h.length - 1]);
    this.claveActual = null;
    this.ajustarSeleccion();
  }

  rehacer(): void {
    const f = this.futuro();
    const actual = this.draft();
    if (!f.length || !actual) return;
    this.futuro.set(f.slice(0, -1));
    this.pasado.update((h) => [...h, actual].slice(-MAX_PASOS));
    this.fijarDraft(f[f.length - 1]);
    this.claveActual = null;
    this.ajustarSeleccion();
  }

  /** Applies a change: one history step per call, except successive calls with the same `clave` within the window. */
  private mutar(fn: (b: Borrador) => Borrador, clave: string | null = null): void {
    const actual = this.draft();
    if (!actual) return;
    const siguiente = fn(structuredClone(actual));
    const ahora = Date.now();
    const agrupa = clave !== null && clave === this.claveActual && ahora - this.ultimoCambio < VENTANA_MS;
    if (!agrupa) {
      this.pasado.update((h) => [...h, actual].slice(-MAX_PASOS));
      this.futuro.set([]);
    }
    this.claveActual = clave;
    this.ultimoCambio = ahora;
    this.fijarDraft(siguiente);
    if (!agrupa) this.ajustarSeleccion();
  }

  /** The only place that replaces the draft: every replacement moves the revision. */
  private fijarDraft(b: Borrador | null): void {
    this.draft.set(b);
    this.revisionSig.update((r) => r + 1);
  }

  private ajustarSeleccion(): void {
    const id = this.seleccion();
    if (id && indiceDe(this.campos(), id) < 0) this.seleccion.set(null);
  }
}

/** The editable part of a form (what PUT receives). */
export function borradorDe(f: Formulario): Borrador {
  return { nombre: f.nombre, esquema: f.esquema, email: f.email, whatsapp: f.whatsapp };
}
