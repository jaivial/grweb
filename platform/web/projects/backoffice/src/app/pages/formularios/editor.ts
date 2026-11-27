import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { GrAlert, GrButton, GrEmpty, GrIcon, GrInput, GrSelect, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../../core/api';
import { Competitions } from '../../core/competitions';
import { BoTabBar, Confirm, errText } from '../../shared/ui';
import { BoEditorSave, type BoSave } from '../../shared/kit';
import { tabEnUrl } from '../../shared/tab-url';
import { FormulariosApi, type Borrador, type Campo, type EstadoFormulario, type Formulario } from './api';
import { ESTADOS_FORMULARIO, infoTipo } from './catalogo';
import { FormularioTabEditar } from './tab-editar';
import { FormularioTabVistaPrevia } from './tab-vista-previa';
import { BoFormEnvios } from './tab-envios';
import { BoFormEstadisticas } from './tab-estadisticas';
import { BoFormAtletas } from './tab-atletas';
import { FormularioStore } from './store';

const TABS = ['editar', 'vista', 'envios', 'estadisticas', 'atletas'] as const;

/**
 * Editor of one form (`/formularios/:id`): header (name, state, save with dirty indicator), the five tabs (in `?tab=`)
 * and the shortcuts. The draft lives in `FormularioStore`, provided here for the tabs below.
 */
@Component({
  selector: 'bo-formulario-editor',
  imports: [FormsModule, RouterLink, BoTabBar, BoEditorSave, FormularioTabEditar, FormularioTabVistaPrevia, BoFormEnvios, BoFormEstadisticas, BoFormAtletas, GrAlert, GrButton, GrEmpty, GrIcon, GrInput, GrSelect, GrSkeleton],
  providers: [FormularioStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = store.formulario();
    @if (noEncontrado()) {
      <gr-empty icon="file-text" title="No encontramos este formulario">Puede que se haya eliminado. <a grButton [routerLink]="['/', comps.current()?.slug, 'formularios']">Volver a formularios</a></gr-empty>
    } @else if (!f) {
      <gr-skeleton class="h-[600px] rounded-lg" />
    } @else {
      <div class="mx-auto flex max-w-[1400px] flex-col gap-4 pb-24">
        <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-3 lg:p-4">
          <div class="flex flex-wrap items-center gap-2 lg:gap-3">
            <a [routerLink]="['/', comps.current()?.slug, 'formularios']" class="flex size-10 shrink-0 items-center justify-center rounded-md border border-line-strong hover:bg-bg-raised" aria-label="Volver a formularios"><gr-icon name="chevron-left" [size]="18" /></a>
            <div class="flex min-w-0 flex-1 flex-col">
              <label class="sr-only" for="fz-nombre">Nombre interno</label>
              <input grInput id="fz-nombre" class="h-10 min-w-0 border-transparent bg-transparent px-1 text-ui-h5 font-semibold hover:border-line-strong focus:border-accent lg:text-ui-h4" [ngModel]="store.draft()?.nombre ?? ''" (ngModelChange)="store.setNombre($event)" maxlength="160" [disabled]="!store.draft()" />
              <p class="px-1 text-body-xs text-text-tertiary">{{ f.soloWeb ? 'Solo web' : 'Email y web' }} · versión {{ f.version }}</p>
            </div>
            <gr-select tipo="filtro" aria-label="Estado del formulario" [value]="f.estado" (valorChange)="cambiarEstado($any($event))">
              @for (e of estados; track e.v) { <option [value]="e.v">{{ e.l }}</option> }
            </gr-select>
            <bo-save-state [status]="guardado()" />
            <button grButton variant="primary" icon="save" [loading]="guardando()" [disabled]="!store.dirty() || guardando()" (click)="guardar()" aria-keyshortcuts="Control+S">Guardar</button>
          </div>

          @if (conflicto()) {
            <gr-alert tone="danger" title="Otra persona ha guardado cambios antes">El formulario cambió mientras editabas. Si guardas ahora, sobrescribirías esos cambios.
              <button alertAction grButton size="s" class="mt-2" (click)="recargar()">Recargar y descartar mis cambios</button></gr-alert>
          } @else if (error()) {
            <gr-alert tone="danger" title="No se ha guardado">{{ error() }}</gr-alert>
          }

          <bo-tab-bar [tabs]="tabs" [(value)]="tab" label="Secciones del formulario" />
        </section>

        @switch (tab()) {
          @case ('editar') { <bo-tab-editar /> }
          @case ('vista') { <bo-tab-vista-previa /> }
          @case ('envios') { <bo-form-envios [formulario]="f" /> }
          @case ('estadisticas') { <bo-form-estadisticas [formulario]="f" /> }
          @case ('atletas') { <bo-form-atletas [formulario]="f" /> }
        }
      </div>
    }
  `,
})
export class FormularioEditorPage {
  protected readonly store = inject(FormularioStore);
  protected readonly comps = inject(Competitions);
  private readonly api = inject(FormulariosApi);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly route = inject(ActivatedRoute);
  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly estados = Object.entries(ESTADOS_FORMULARIO).map(([v, x]) => ({ v, l: x.l }));
  protected readonly tabs = [
    { value: 'editar', label: 'Editar' },
    { value: 'vista', label: 'Vista previa' },
    { value: 'envios', label: 'Envíos' },
    { value: 'estadisticas', label: 'Estadísticas' },
    { value: 'atletas', label: 'Atletas' },
  ];
  protected readonly tab = signal<string>('editar');
  protected readonly guardando = signal(false);
  protected readonly conflicto = signal(false);
  protected readonly error = signal('');
  protected readonly noEncontrado = signal(false);

  constructor() {
    tabEnUrl(this.tab, () => TABS);
    effect(() => {
      const id = this.id();
      const c = this.cid();
      if (!id || !c) return;
      untracked(() => void this.cargar(c, id));
    });
    // A save error describes the draft it was sent with: any new change makes it stale.
    effect(() => {
      this.store.revision();
      untracked(() => this.error.set(''));
    });
  }

  /** Estado de guardado para el indicador de la cabecera. */
  protected readonly guardado = computed<BoSave>(() => {
    if (this.guardando()) return 'saving';
    return this.store.dirty() ? 'dirty' : 'saved';
  });

  private async cargar(cid: string, id: string): Promise<void> {
    this.noEncontrado.set(false);
    try {
      this.store.cargar(await this.api.get(cid, id));
      this.conflicto.set(false);
      this.error.set('');
    } catch (e) {
      const p = problemOf(e);
      if (p.status === 404) this.noEncontrado.set(true);
      else this.error.set(errText(e, 'No se pudo cargar el formulario.'));
    }
  }

  protected async recargar(): Promise<void> {
    const cid = this.cid();
    const id = this.id();
    if (cid && id) await this.cargar(cid, id);
  }

  /** Save: PUT with the current version. 409 = someone else saved; 422 = the schema is not valid. */
  protected async guardar(): Promise<void> {
    const b = this.store.draft();
    const f = this.store.formulario();
    if (!b || !f || this.guardando() || !this.store.dirty()) return;
    const enviado: Borrador = structuredClone(b);
    this.guardando.set(true);
    try {
      const r: Formulario = await this.api.guardar(this.cid(), f.id, { ...enviado, version: f.version });
      this.store.marcarGuardado(r, enviado);
      this.conflicto.set(false);
      this.error.set('');
      this.toasts.success('Formulario guardado');
    } catch (e) {
      const p = problemOf(e);
      if (p.status === 409 || p.code === 'CONFLICTO_EDICION') {
        this.conflicto.set(true);
      } else if (p.code === 'CAMPO_CON_RESPUESTAS') {
        // El borrador sigue sin guardar (no se marca como guardado): el admin ajusta el cambio o duplica el formulario.
        const msg = p.detail ?? 'No se puede quitar ese campo o esa opción porque ya tiene respuestas.';
        this.error.set(msg);
        this.toasts.error(msg);
      } else {
        this.error.set(this.mensajeGuardado(e, enviado.esquema.campos));
      }
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * Message of a failed save. Schema errors name a raw JSON key («archivo»): when the error location points at a field of
   * the draft, the message names that field by its type and label; otherwise a generic message.
   */
  private mensajeGuardado(e: unknown, campos: Campo[]): string {
    const p = problemOf(e);
    if (!p.errors?.length) return p.detail ?? 'No se ha podido guardar. Revisa los campos e inténtalo de nuevo.';
    const generico = 'No se ha podido guardar. Revisa los campos del formulario e inténtalo de nuevo.';
    const i = Number(p.errors[0].location?.match(/campos\.(\d+)/)?.[1]);
    const campo = Number.isInteger(i) ? campos[i] : undefined;
    if (!campo) return generico;
    const tipo = infoTipo(campo.tipo).label;
    const etiqueta = campo.etiqueta.replace(/\*+/g, '').trim().slice(0, 40);
    return `Revisa el campo ${etiqueta ? `${tipo} «${etiqueta}»` : tipo}: su configuración no es válida. Ajústalo y vuelve a guardar.`;
  }

  protected async cambiarEstado(estado: EstadoFormulario): Promise<void> {
    const f = this.store.formulario();
    if (!f || estado === f.estado) return;
    try {
      const r = await this.api.cambiarEstado(this.cid(), f.id, estado);
      this.store.setEstado(r.estado, r.actualizadoAt);
      this.toasts.success(`Formulario ${ESTADOS_FORMULARIO[estado].l.toLowerCase()}`);
    } catch (e) {
      this.toasts.error(errText(e, 'No se ha podido cambiar el estado.'));
    }
  }

  /** Leave guard (route `canDeactivate`): asks before losing unsaved changes. */
  async puedeSalir(): Promise<boolean> {
    if (!this.store.dirty()) return true;
    return this.confirm.ask({
      title: '¿Salir sin guardar?',
      text: 'Hay cambios sin guardar en este formulario. Si sales ahora, se pierden.',
      confirm: 'Salir sin guardar',
      danger: true,
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  protected avisarAntesDeCerrar(ev: BeforeUnloadEvent): void {
    if (!this.store.dirty()) return;
    ev.preventDefault();
    ev.returnValue = '';
  }

  /** Ctrl+S saves on every tab; undo/redo, Delete and Escape only where the editor is focused (not in a text field). Nothing runs behind an open confirmation. */
  @HostListener('document:keydown', ['$event'])
  protected teclas(ev: KeyboardEvent): void {
    if (this.confirm.current()) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (mod && k === 's') {
      ev.preventDefault();
      void this.guardar();
      return;
    }
    if (this.tab() !== 'editar' || escribiendo(ev.target)) return;
    if (mod && k === 'z' && !ev.shiftKey) { ev.preventDefault(); this.store.deshacer(); }
    else if (mod && ((k === 'z' && ev.shiftKey) || k === 'y')) { ev.preventDefault(); this.store.rehacer(); }
    else if ((k === 'delete' || k === 'backspace') && this.store.seleccion() && enElementoOCuerpo(ev.target)) {
      ev.preventDefault();
      this.store.borrar(this.store.seleccion()!);
    } else if (k === 'escape' && this.store.seleccion()) {
      this.store.seleccionar(null);
    }
  }
}

/** True when the key press belongs to a text field (let the browser handle it). */
function escribiendo(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** True when focus is on the canvas item itself or on nothing (body). Any control inside an item (slider stop, radio, button) keeps its own keys. */
function enElementoOCuerpo(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return el === document.body || !!el?.hasAttribute('data-campo-item');
}
