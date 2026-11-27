import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GrButton, GrField, GrIcon, GrInput, GrSegmented, GrSwitch } from '@grcup/ui';
import type { Campo, Opcion, Tamano } from './api';
import { ALINEACIONES, ANCHOS, infoTipo, nuevoId } from './catalogo';
import { FormularioStore } from './store';

const TAMANOS = [
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
];
const TIPOS_ARCHIVO = [
  { mime: 'image/*', l: 'Imágenes' },
  { mime: 'application/pdf', l: 'PDF' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', l: 'Word' },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', l: 'Excel' },
];

/** Inspector of one selected field: every property its type uses (contract §2). Changes go through the store. */
@Component({
  selector: 'bo-inspector-campo',
  imports: [FormsModule, GrButton, GrField, GrIcon, GrInput, GrSegmented, GrSwitch, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = campo();
    @let info = tipo();
    <header class="flex items-center gap-2">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-bg-raised text-text-secondary"><gr-icon [name]="info.icon" [size]="16" /></span>
      <div class="min-w-0 flex-1"><p class="truncate text-label-m">{{ info.label }}</p></div>
      <button grButton variant="ghost" size="s" icon="copy" (click)="store.duplicar(c.id)" aria-label="Duplicar elemento"></button>
      <button grButton variant="ghost" size="s" icon="trash" (click)="store.borrar(c.id)" aria-label="Borrar elemento"></button>
    </header>

    <div class="mt-4 flex flex-col gap-4">
      @if (info.decorativo && c.tipo !== 'imagen' && c.tipo !== 'separador') {
        <gr-field label="Texto"><textarea grInput rows="3" [ngModel]="c.etiqueta" (ngModelChange)="p({ etiqueta: $event }, 'etiqueta')"></textarea></gr-field>
      } @else if (c.tipo === 'casilla') {
        <gr-field label="Texto de la casilla" hint="Se muestra junto a la casilla"><input grInput [ngModel]="c.etiqueta" (ngModelChange)="p({ etiqueta: $event }, 'etiqueta')" /></gr-field>
      } @else if (info.respondible) {
        <gr-field label="Etiqueta" hint="**negrita** y saltos de línea admitidos"><textarea grInput rows="2" [ngModel]="c.etiqueta" (ngModelChange)="p({ etiqueta: $event }, 'etiqueta')"></textarea></gr-field>
        <gr-field label="Ayuda" hint="Texto pequeño bajo la pregunta (opcional)"><input grInput [ngModel]="c.ayuda" (ngModelChange)="p({ ayuda: $event }, 'ayuda')" maxlength="500" /></gr-field>
      }

      @if (c.tipo === 'imagen') {
        <gr-field label="Dirección de la imagen" hint="https://… (la subida de imágenes va en la biblioteca de medios)"><input grInput [ngModel]="c.imagen" (ngModelChange)="p({ imagen: $event }, 'imagen')" placeholder="https://" /></gr-field>
        <gr-field label="Texto alternativo"><input grInput [ngModel]="c.alt" (ngModelChange)="p({ alt: $event }, 'alt')" /></gr-field>
      }

      @if (info.respondible) {
        <div class="flex items-center justify-between gap-3"><span class="text-label-s">Obligatorio</span><gr-switch [checked]="c.obligatorio" (checkedChange)="p({ obligatorio: $event })" label="Obligatorio" /></div>
      }

      @if (info.conPlaceholder) {
        <gr-field label="Texto de ayuda dentro del campo"><input grInput [ngModel]="c.placeholder" (ngModelChange)="p({ placeholder: $event }, 'placeholder')" /></gr-field>
      }

      @if (info.respondible || info.decorativo) {
        <div><p class="mb-1.5 text-label-s">Ancho</p><gr-segmented [options]="anchos" [value]="c.ancho" (valueChange)="p({ ancho: $any($event) })" label="Ancho" /></div>
      }

      @if (info.conRango) { <ng-container *ngTemplateOutlet="rango" /> }

      @if (c.tipo === 'escala' || c.tipo === 'deslizador') {
        <div class="grid grid-cols-2 gap-3">
          <gr-field label="Etiqueta inicial"><input grInput [ngModel]="c.minEtiqueta" (ngModelChange)="p({ minEtiqueta: $event }, 'minEtiqueta')" /></gr-field>
          <gr-field label="Etiqueta final"><input grInput [ngModel]="c.maxEtiqueta" (ngModelChange)="p({ maxEtiqueta: $event }, 'maxEtiqueta')" /></gr-field>
        </div>
      }

      @if (info.conOpciones) {
        <section aria-labelledby="fz-opciones-t">
          <div class="mb-2 flex items-center justify-between"><h3 id="fz-opciones-t" class="text-label-s">Opciones</h3><span class="font-mono text-mono-xs text-text-muted">{{ c.opciones.length }} / 30</span></div>
          <ul class="flex flex-col gap-1.5">
            @for (o of c.opciones; track o.id; let i = $index; let primera = $first; let ultima = $last) {
              <li class="flex items-center gap-1">
                <input grInput class="min-w-0 flex-1" [ngModel]="o.texto" (ngModelChange)="opcion(i, $event)" maxlength="120" [attr.aria-label]="'Opción ' + (i + 1)" />
                <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-30" [disabled]="primera" (click)="mover(i, -1)" aria-label="Subir opción"><gr-icon name="chevron-up" [size]="14" /></button>
                <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-30" [disabled]="ultima" (click)="mover(i, 1)" aria-label="Bajar opción"><gr-icon name="chevron-down" [size]="14" /></button>
                <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-sm text-error hover:bg-bg-raised disabled:opacity-30" [disabled]="c.opciones.length <= 2" (click)="quitar(i)" aria-label="Quitar opción"><gr-icon name="x" [size]="14" /></button>
              </li>
            }
          </ul>
          <button grButton variant="ghost" size="s" icon="plus" class="mt-2" [disabled]="c.opciones.length >= 30" (click)="anadirOpcion()">Añadir opción</button>
        </section>
      }

      @if (c.tipo === 'texto_corto' || c.tipo === 'texto_largo') {
        <div class="grid grid-cols-2 gap-3">
          <gr-field label="Mínimo de caracteres"><input grInput type="number" min="0" max="2000" [ngModel]="c.validacion.minLargo" (ngModelChange)="validacion({ minLargo: num($event) })" /></gr-field>
          <gr-field label="Máximo de caracteres"><input grInput type="number" min="1" max="5000" [ngModel]="c.validacion.maxLargo" (ngModelChange)="validacion({ maxLargo: num($event) })" /></gr-field>
        </div>
        <gr-field label="Patrón (expresión regular)" hint="Opcional. Por ejemplo ^[0-9]{8}$ para 8 cifras"><input grInput [ngModel]="c.validacion.patron" (ngModelChange)="validacion({ patron: $event })" /></gr-field>
      }

      @if (c.tipo === 'archivo' && c.archivo; as a) {
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-label-s">Tipos admitidos</legend>
          <div class="flex flex-wrap gap-2">
            @for (t of tiposArchivo; track t.mime) {
              <label class="flex h-9 cursor-pointer items-center gap-2 rounded-pill border px-3 text-label-s transition-colors" [class]="a.tipos.includes(t.mime) ? 'border-accent bg-accent-deep/40 text-text-primary' : 'border-line-strong text-text-tertiary'">
                <input type="checkbox" class="sr-only" [checked]="a.tipos.includes(t.mime)" (change)="alternarTipo(t.mime)" />{{ t.l }}
              </label>
            }
          </div>
        </fieldset>
        <div class="grid grid-cols-2 gap-3">
          <gr-field label="Tamaño máximo (MB)"><input grInput type="number" min="1" max="20" [ngModel]="a.maxMb" (ngModelChange)="archivo({ maxMb: num($event) ?? 10 })" /></gr-field>
          <gr-field label="Archivos máximos"><input grInput type="number" min="1" max="5" [ngModel]="a.maxArchivos" (ngModelChange)="archivo({ maxArchivos: num($event) ?? 1 })" /></gr-field>
        </div>
        <p class="text-body-xs text-text-tertiary">Un formulario con subida de archivos solo se puede rellenar en la web: el email lleva únicamente el botón.</p>
      }

      <section class="flex flex-col gap-3 border-t border-line-subtle pt-4" aria-labelledby="fz-estilo-t">
        <h3 id="fz-estilo-t" class="text-label-s">Estilo</h3>
        <div><p class="mb-1.5 text-label-s">Alineación</p><gr-segmented [options]="alineaciones" [value]="c.estilo.alinear" (valueChange)="estilo({ alinear: $any($event) })" label="Alineación" /></div>
        <div><p class="mb-1.5 text-label-s">Tamaño</p><gr-segmented [options]="tamanos" [value]="c.estilo.tamano" (valueChange)="estilo({ tamano: $any($event) })" label="Tamaño" /></div>
        <div class="flex items-center justify-between gap-3"><span class="text-label-s">Negrita</span><gr-switch [checked]="c.estilo.negrita" (checkedChange)="estilo({ negrita: $event })" label="Negrita" /></div>
        <div class="flex items-center justify-between gap-3"><span class="text-label-s">Borde</span><gr-switch [checked]="c.estilo.borde" (checkedChange)="estilo({ borde: $event })" label="Borde" /></div>
        <div class="grid grid-cols-2 gap-3">
          <gr-field label="Color del texto"><div class="flex items-center gap-2"><input type="color" class="size-9 shrink-0 cursor-pointer rounded-xs border border-line-strong bg-transparent" [value]="c.estilo.color || '#141011'" (input)="estilo({ color: $any($event.target).value })" aria-label="Color del texto" /><button grButton variant="ghost" size="s" (click)="estilo({ color: '' })">Sin color</button></div></gr-field>
          <gr-field label="Color de fondo"><div class="flex items-center gap-2"><input type="color" class="size-9 shrink-0 cursor-pointer rounded-xs border border-line-strong bg-transparent" [value]="c.estilo.fondo || '#ffffff'" (input)="estilo({ fondo: $any($event.target).value })" aria-label="Color de fondo" /><button grButton variant="ghost" size="s" (click)="estilo({ fondo: '' })">Sin fondo</button></div></gr-field>
        </div>
      </section>

      <details class="border-t border-line-subtle pt-4">
        <summary class="cursor-pointer text-label-s text-text-secondary">Avanzado</summary>
        <p class="mt-2 text-body-xs text-text-tertiary">Identificador interno: <span class="font-mono text-mono-xs">{{ c.id }}</span></p>
      </details>
    </div>

    <ng-template #rango>
      @if (c.tipo === 'numero') {
        <div class="grid grid-cols-3 gap-3">
          <gr-field label="Mínimo"><input grInput type="number" [ngModel]="c.min" (ngModelChange)="p({ min: num($event) })" /></gr-field>
          <gr-field label="Máximo"><input grInput type="number" [ngModel]="c.max" (ngModelChange)="p({ max: num($event) })" /></gr-field>
          <gr-field label="Paso"><input grInput type="number" min="0" [ngModel]="c.paso" (ngModelChange)="p({ paso: num($event) })" /></gr-field>
        </div>
      } @else if (c.tipo === 'escala') {
        <div class="grid grid-cols-3 gap-3">
          <gr-field label="Desde"><input grInput type="number" min="0" max="10" [ngModel]="c.min" (ngModelChange)="p({ min: num($event) ?? 0 })" /></gr-field>
          <gr-field label="Hasta"><input grInput type="number" min="2" max="10" [ngModel]="c.max" (ngModelChange)="p({ max: num($event) ?? 10 })" /></gr-field>
          <gr-field label="Paso"><input grInput type="number" min="1" [ngModel]="c.paso" (ngModelChange)="p({ paso: num($event) ?? 1 })" /></gr-field>
        </div>
      } @else if (c.tipo === 'valoracion') {
        <gr-field label="Estrellas" hint="De 3 a 10"><input grInput type="number" min="3" max="10" [ngModel]="c.max" (ngModelChange)="p({ max: num($event) ?? 5 })" /></gr-field>
      } @else {
        <div class="grid grid-cols-2 gap-3">
          <gr-field label="Mínimo de respuestas"><input grInput type="number" min="0" [ngModel]="c.min" (ngModelChange)="p({ min: num($event) })" /></gr-field>
          <gr-field label="Máximo de respuestas"><input grInput type="number" min="0" [ngModel]="c.max" (ngModelChange)="p({ max: num($event) })" /></gr-field>
        </div>
      }
    </ng-template>
  `,
})
export class BoInspectorCampo {
  protected readonly store = inject(FormularioStore);
  readonly campo = input.required<Campo>();
  protected readonly tipo = computed(() => infoTipo(this.campo().tipo));
  protected readonly anchos = ANCHOS.map((a) => ({ value: a.v, label: a.l }));
  protected readonly alineaciones = ALINEACIONES.map((a) => ({ value: a.v, label: a.l }));
  protected readonly tamanos = TAMANOS as { value: Tamano; label: string }[];
  protected readonly tiposArchivo = TIPOS_ARCHIVO;

  /** Changes of this field; `clave` (a field name) coalesces typing into one undo step. */
  protected p(parcial: Partial<Campo>, clave?: string): void {
    const id = this.campo().id;
    this.store.editarCampo(id, parcial, clave ? `campo:${id}:${clave}` : null);
  }

  protected estilo(parcial: Partial<Campo['estilo']>): void {
    this.p({ estilo: { ...this.campo().estilo, ...parcial } });
  }

  protected validacion(parcial: Partial<Campo['validacion']>): void {
    this.p({ validacion: { ...this.campo().validacion, ...parcial } }, 'validacion');
  }

  protected archivo(parcial: Partial<NonNullable<Campo['archivo']>>): void {
    const a = this.campo().archivo;
    if (a) this.p({ archivo: { ...a, ...parcial } }, 'archivo');
  }

  protected alternarTipo(mime: string): void {
    const a = this.campo().archivo;
    if (!a) return;
    const tipos = a.tipos.includes(mime) ? a.tipos.filter((t) => t !== mime) : [...a.tipos, mime];
    this.p({ archivo: { ...a, tipos } });
  }

  protected opcion(i: number, texto: string): void {
    const lista = this.campo().opciones.map((o, k) => (k === i ? { ...o, texto } : o));
    this.store.editarOpciones(this.campo().id, lista, `opcion:${this.campo().opciones[i]?.id}`);
  }

  protected mover(i: number, dir: -1 | 1): void {
    const lista = [...this.campo().opciones];
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    this.store.editarOpciones(this.campo().id, lista);
  }

  protected quitar(i: number): void {
    const lista = this.campo().opciones.filter((_, k) => k !== i);
    if (lista.length < 2) return;
    this.store.editarOpciones(this.campo().id, lista);
  }

  protected anadirOpcion(): void {
    const n = this.campo().opciones.length + 1;
    const nueva: Opcion = { id: nuevoId('o_'), texto: `Opción ${n}` };
    this.store.editarOpciones(this.campo().id, [...this.campo().opciones, nueva]);
  }

  /** Empty input → null; otherwise the number. */
  protected num(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
}
