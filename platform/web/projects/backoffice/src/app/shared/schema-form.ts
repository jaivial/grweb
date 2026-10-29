import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { marked } from 'marked';
import { GrButton, GrField, GrIcon, GrIconButton, GrInput, GrToasts } from '@grcup/ui';
import { BoCount, BoToggle, Media } from './ui';

export interface FieldDef {
  clave: string;
  etiqueta: string;
  tipo: 'texto' | 'area' | 'markdown' | 'url' | 'imagen' | 'numero' | 'bool' | 'select' | 'fecha' | 'lista';
  ayuda?: string;
  max?: number;
  opciones?: { value: string; label: string }[];
  campos?: FieldDef[];
  ancho?: 'mitad';
}

type Obj = Record<string, unknown>;

/** Form rendered from a field schema (the same schema the API returns for home sections). Lists nest recursively. */
@Component({
  selector: 'bo-schema-form',
  imports: [GrField, GrInput, GrButton, GrIcon, GrIconButton, BoCount, BoToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' },
  template: `
    @for (f of fields(); track f.clave) {
      @let id = prefix() + f.clave;
      <div [class.sm:col-span-2]="f.ancho !== 'mitad'">
        @switch (f.tipo) {
          @case ('bool') {
            <div class="flex items-center justify-between gap-4 rounded-md border border-line-subtle bg-bg-surface px-4 py-2">
              <div><p class="text-label-s">{{ f.etiqueta }}</p>@if (f.ayuda) { <p class="text-body-xs text-text-tertiary">{{ f.ayuda }}</p> }</div>
              <bo-toggle [value]="!!get(f.clave)" [label]="f.etiqueta" (changed)="set(f.clave, $event)" />
            </div>
          }
          @case ('lista') {
            <fieldset class="rounded-md border border-line-subtle p-4">
              <legend class="px-1 text-label-s">{{ f.etiqueta }} <span class="text-body-xs font-normal text-text-muted">{{ list(f.clave).length }}{{ f.max ? ' / ' + f.max : '' }}</span></legend>
              <div class="flex flex-col gap-3">
                @for (item of list(f.clave); track $index; let i = $index; let first = $first; let last = $last) {
                  <div class="rounded-sm border border-line-subtle bg-bg-surface p-3">
                    <div class="mb-2 flex items-center justify-between"><span class="text-mono-xs text-text-tertiary">#{{ i + 1 }}</span>
                      <span class="flex">
                        <button grIconButton icon="arrow-up" label="Subir" [disabled]="first" (click)="move(f.clave, i, -1)"></button>
                        <button grIconButton icon="arrow-down" label="Bajar" [disabled]="last" (click)="move(f.clave, i, 1)"></button>
                        <button grIconButton icon="x" label="Quitar" (click)="removeAt(f.clave, i)"></button>
                      </span>
                    </div>
                    <bo-schema-form [fields]="f.campos ?? []" [value]="item" (valueChange)="setAt(f.clave, i, $event)" [prefix]="id + '-' + i + '-'" />
                  </div>
                }
                @if (!f.max || list(f.clave).length < f.max) {
                  <button grButton size="s" type="button" icon="plus" (click)="add(f.clave)">Añadir</button>
                }
              </div>
            </fieldset>
          }
          @default {
            <gr-field [label]="f.etiqueta" [for]="id" [hint]="f.ayuda ?? null">
              @if (f.max) { <bo-count fieldAside [value]="str(f.clave)" [max]="f.max" /> }
              @switch (f.tipo) {
                @case ('area') { <textarea grInput [id]="id" rows="4" class="h-auto! py-2" [value]="str(f.clave)" (input)="set(f.clave, $any($event.target).value)"></textarea> }
                @case ('markdown') {
                  <div class="flex flex-col gap-2">
                    <div class="flex gap-1 text-label-s">
                      <button type="button" class="h-8 rounded-xs px-2" [class.bg-bg-raised]="!preview()" (click)="preview.set(false)">Escribir</button>
                      <button type="button" class="h-8 rounded-xs px-2" [class.bg-bg-raised]="preview()" (click)="preview.set(true)">Vista previa</button>
                    </div>
                    @if (preview()) {
                      <div class="prose-gr min-h-40 rounded-sm border border-line-strong bg-bg-field p-3 text-body-s" [innerHTML]="md(str(f.clave))"></div>
                    } @else {
                      <textarea grInput [id]="id" rows="10" class="h-auto! py-2 font-mono text-[13px]" [value]="str(f.clave)" (input)="set(f.clave, $any($event.target).value)"></textarea>
                    }
                  </div>
                }
                @case ('numero') { <input grInput [id]="id" type="number" inputmode="numeric" [value]="get(f.clave) ?? ''" (input)="set(f.clave, num($any($event.target).value))" /> }
                @case ('fecha') { <input grInput [id]="id" type="datetime-local" [value]="local(f.clave)" (input)="set(f.clave, iso($any($event.target).value))" /> }
                @case ('select') {
                  <select grInput [id]="id" (change)="set(f.clave, $any($event.target).value)">
                    @for (o of f.opciones ?? []; track o.value) { <option [value]="o.value" [selected]="o.value === get(f.clave)">{{ o.label }}</option> }
                  </select>
                }
                @case ('imagen') {
                  <div class="flex flex-col gap-2">
                    <div class="flex gap-2">
                      <input grInput [id]="id" type="url" placeholder="https://… o súbela" [value]="str(f.clave)" (input)="set(f.clave, $any($event.target).value)" />
                      <label class="relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-bg-raised px-3 text-label-s hover:border-text-muted md:h-10">
                        <gr-icon name="download" [size]="16" class="rotate-180" />{{ uploading() ? 'Subiendo…' : 'Subir' }}
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" (change)="upload(f.clave, $event)" />
                      </label>
                    </div>
                    @if (str(f.clave)) { <img [src]="str(f.clave)" alt="" class="max-h-40 w-auto self-start rounded-sm border border-line-subtle object-cover" /> }
                  </div>
                }
                @default { <input grInput [id]="id" [type]="f.tipo === 'url' ? 'url' : 'text'" [value]="str(f.clave)" (input)="set(f.clave, $any($event.target).value)" /> }
              }
            </gr-field>
          }
        }
      </div>
    }
  `,
})
export class BoSchemaForm {
  private readonly media = inject(Media);
  private readonly toasts = inject(GrToasts);
  readonly fields = input.required<FieldDef[]>();
  readonly value = model<Obj>({});
  readonly prefix = input('f-');
  protected readonly preview = signal(false);
  protected readonly uploading = signal(false);

  protected get(k: string): unknown { return this.value()?.[k]; }
  protected str(k: string): string { const v = this.get(k); return v === null || v === undefined ? '' : String(v); }
  protected list(k: string): Obj[] { const v = this.get(k); return Array.isArray(v) ? (v as Obj[]) : []; }
  protected set(k: string, v: unknown): void { this.value.update((o) => ({ ...(o ?? {}), [k]: v })); }
  protected setAt(k: string, i: number, v: Obj): void { const l = [...this.list(k)]; l[i] = v; this.set(k, l); }
  protected add(k: string): void { this.set(k, [...this.list(k), {}]); }
  protected removeAt(k: string, i: number): void { this.set(k, this.list(k).filter((_, j) => j !== i)); }
  protected move(k: string, i: number, d: number): void {
    const l = [...this.list(k)];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    this.set(k, l);
  }
  protected num(v: string): number | null { return v === '' ? null : Number(v); }
  protected local(k: string): string { const v = this.str(k); return v ? v.slice(0, 16) : ''; }
  protected iso(v: string): string | null { return v ? new Date(v).toISOString() : null; }
  protected md(src: string): string { return marked.parse(src, { async: false }) as string; }

  protected async upload(k: string, e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    try {
      this.set(k, await this.media.upload(file));
    } catch {
      this.toasts.error('No se pudo subir la imagen', 'JPG, PNG, WebP o GIF de hasta 10 MB.');
    } finally {
      this.uploading.set(false);
    }
  }
}

/** Shallow-copies a row into an editable object limited to the form fields. */
export function pick(row: Obj | null | undefined, fields: FieldDef[], defaults: Obj = {}): Obj {
  const o: Obj = { ...defaults };
  for (const f of fields) if (row && f.clave in row) o[f.clave] = row[f.clave];
  return o;
}

