import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import type { Campo } from './api';
import { textoHtml } from './texto';

const TAMANO_TITULO: Record<string, string> = { s: '18px', m: '22px', l: '28px' };
const TAMANO_TEXTO: Record<string, string> = { s: '14px', m: '16px', l: '20px' };
const ALINEA: Record<string, string> = { izquierda: 'left', centro: 'center', derecha: 'right' };

/**
 * One field of a form as the person sees it (web, email-like preview) or as the canvas shows it. `interactivo` false
 * makes it inert: the canvas selects and drags fields, the person fills them on the web. Theme colours come from the
 * CSS variables set by the owner (`--f-acento`, `--f-texto`, `--f-superficie`, `--f-radio`).
 */
@Component({
  selector: 'bo-campo-render',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '[attr.inert]': 'interactivo() ? null : ""' },
  template: `
    @switch (campo().tipo) {
      @case ('titulo') { <h2 class="font-semibold leading-tight tracking-tight text-[var(--f-texto)] [overflow-wrap:anywhere]" [style]="bloque()" [innerHTML]="html()"></h2> }
      @case ('parrafo') { <p class="text-[var(--f-texto)] leading-relaxed [overflow-wrap:anywhere]" [style]="bloque()" [innerHTML]="html()"></p> }
      @case ('separador') { <hr class="border-0 border-t border-[color-mix(in_srgb,var(--f-texto)_14%,transparent)]" /> }
      @case ('imagen') {
        @if (campo().imagen) { <img [src]="campo().imagen" [alt]="campo().alt" class="block h-auto max-w-full rounded-[var(--f-radio)]" loading="lazy" /> }
        @else { <div class="flex h-32 items-center justify-center rounded-[var(--f-radio)] border border-dashed border-[color-mix(in_srgb,var(--f-texto)_30%,transparent)] text-[13px] text-[color-mix(in_srgb,var(--f-texto)_60%,transparent)]">Imagen sin dirección</div> }
      }
      @case ('casilla') {
        <label class="flex items-start gap-3 text-[var(--f-texto)]">
          <input type="checkbox" class="mt-1 size-4 accent-[var(--f-acento)]" [checked]="!!valor()" (change)="valorCambia.emit(($any($event.target)).checked)" />
          <span class="min-w-0"><span [innerHTML]="html()"></span>@if (campo().obligatorio) { <span class="text-[var(--f-acento)]"> *</span> }
            @if (campo().ayuda) { <span class="block text-[13px] opacity-70">{{ campo().ayuda }}</span> }</span>
        </label>
        @if (error()) { <p class="mt-1 text-[13px] text-[#c4262e]" role="alert">{{ error() }}</p> }
      }
      @default {
        <div class="flex flex-col gap-2">
          <span class="flex flex-col gap-0.5">
            <span class="text-[15px] font-medium text-[var(--f-texto)]" [id]="'f-' + campo().id + '-t'" [innerHTML]="html()"></span>
            @if (campo().obligatorio) { <span class="text-[12px] text-[var(--f-acento)]">Obligatorio</span> }
            @if (campo().ayuda) { <span class="text-[13px] opacity-70 text-[var(--f-texto)]">{{ campo().ayuda }}</span> }
          </span>
          @switch (campo().tipo) {
            @case ('texto_largo') { <textarea rows="4" class="campo-input" [attr.aria-labelledby]="'f-' + campo().id + '-t'" [placeholder]="campo().placeholder" [value]="valor() ?? ''" (input)="valorCambia.emit($any($event.target).value)"></textarea> }
            @case ('texto_corto') { <input type="text" class="campo-input" [attr.aria-labelledby]="'f-' + campo().id + '-t'" [placeholder]="campo().placeholder" [value]="valor() ?? ''" (input)="valorCambia.emit($any($event.target).value)" /> }
            @case ('email') { <input type="email" class="campo-input" [attr.aria-labelledby]="'f-' + campo().id + '-t'" [placeholder]="campo().placeholder" [value]="valor() ?? ''" (input)="valorCambia.emit($any($event.target).value)" /> }
            @case ('telefono') { <input type="tel" class="campo-input" [attr.aria-labelledby]="'f-' + campo().id + '-t'" [placeholder]="campo().placeholder" [value]="valor() ?? ''" (input)="valorCambia.emit($any($event.target).value)" /> }
            @case ('numero') { <input type="number" class="campo-input" [attr.aria-labelledby]="'f-' + campo().id + '-t'" [attr.min]="campo().min" [attr.max]="campo().max" [attr.step]="campo().paso ?? 'any'" [value]="valor() ?? ''" (input)="valorCambia.emit($any($event.target).value === '' ? null : +$any($event.target).value)" /> }
            @case ('fecha') { <input type="date" class="campo-input" [attr.aria-labelledby]="'f-' + campo().id + '-t'" [value]="valor() ?? ''" (input)="valorCambia.emit($any($event.target).value)" /> }
            @case ('desplegable') {
              <select class="campo-input" [attr.aria-labelledby]="'f-' + campo().id + '-t'" [value]="valor() ?? ''" (change)="valorCambia.emit($any($event.target).value)">
                <option value="" disabled>{{ campo().placeholder || 'Selecciona' }}</option>
                @for (o of campo().opciones; track o.id) { <option [value]="o.id">{{ o.texto }}</option> }
              </select>
            }
            @case ('opcion_unica') {
              <div class="flex flex-col gap-2" role="radiogroup" [attr.aria-labelledby]="'f-' + campo().id + '-t'">
                @for (o of campo().opciones; track o.id) {
                  <label class="flex items-center gap-2.5 text-[15px] text-[var(--f-texto)]"><input type="radio" class="size-4 accent-[var(--f-acento)]" [name]="'f-' + campo().id" [value]="o.id" [checked]="valor() === o.id" (change)="valorCambia.emit(o.id)" />{{ o.texto }}</label>
                }
              </div>
            }
            @case ('casillas') {
              <div class="flex flex-col gap-2" role="group" [attr.aria-labelledby]="'f-' + campo().id + '-t'">
                @for (o of campo().opciones; track o.id) {
                  <label class="flex items-center gap-2.5 text-[15px] text-[var(--f-texto)]"><input type="checkbox" class="size-4 accent-[var(--f-acento)]" [checked]="marcadas().includes(o.id)" (change)="alternar(o.id)" />{{ o.texto }}</label>
                }
              </div>
            }
            @case ('seleccion_multiple') {
              <div class="flex flex-wrap gap-2" role="group" [attr.aria-labelledby]="'f-' + campo().id + '-t'">
                @for (o of campo().opciones; track o.id) {
                  <button type="button" [attr.aria-pressed]="marcadas().includes(o.id)" (click)="alternar(o.id)" class="h-9 rounded-pill border px-3.5 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--f-acento)]"
                    [class]="marcadas().includes(o.id) ? 'border-[var(--f-acento)] bg-[var(--f-acento)] text-white' : 'border-[color-mix(in_srgb,var(--f-texto)_25%,transparent)] text-[var(--f-texto)]'">{{ o.texto }}</button>
                }
              </div>
            }
            @case ('si_no') {
              <div class="flex gap-2" role="radiogroup" [attr.aria-labelledby]="'f-' + campo().id + '-t'">
                @for (o of [{ v: true, l: 'Sí' }, { v: false, l: 'No' }]; track o.l) {
                  <button type="button" role="radio" [attr.aria-checked]="valor() === o.v" (click)="valorCambia.emit(o.v)" class="h-10 min-w-20 rounded-[var(--f-radio)] border px-4 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--f-acento)]"
                    [class]="valor() === o.v ? 'border-[var(--f-acento)] bg-[var(--f-acento)] text-white' : 'border-[color-mix(in_srgb,var(--f-texto)_25%,transparent)] text-[var(--f-texto)]'">{{ o.l }}</button>
                }
              </div>
            }
            @case ('deslizador') {
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-1.5 overflow-x-auto" role="radiogroup" [attr.aria-labelledby]="'f-' + campo().id + '-t'">
                  @for (o of campo().opciones; track o.id) {
                    <button type="button" role="radio" [attr.aria-checked]="valor() === o.id" [attr.aria-label]="o.texto" (click)="valorCambia.emit(o.id)" class="flex h-10 min-w-10 flex-1 items-center justify-center rounded-[var(--f-radio)] border text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--f-acento)]"
                      [class]="valor() === o.id ? 'border-[var(--f-acento)] bg-[var(--f-acento)] text-white' : 'border-[color-mix(in_srgb,var(--f-texto)_25%,transparent)] text-[var(--f-texto)]'">{{ o.texto }}</button>
                  }
                </div>
                @if (campo().minEtiqueta || campo().maxEtiqueta) { <div class="flex justify-between text-[12px] opacity-70 text-[var(--f-texto)]"><span>{{ campo().minEtiqueta }}</span><span>{{ campo().maxEtiqueta }}</span></div> }
              </div>
            }
            @case ('escala') {
              <div class="flex flex-col gap-1.5">
                <div class="flex gap-1.5" role="radiogroup" [attr.aria-labelledby]="'f-' + campo().id + '-t'">
                  @for (v of valores(); track v) {
                    <button type="button" role="radio" [attr.aria-checked]="valor() === v" (click)="valorCambia.emit(v)" class="flex h-10 flex-1 items-center justify-center rounded-[var(--f-radio)] border text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--f-acento)]"
                      [class]="valor() === v ? 'border-[var(--f-acento)] bg-[var(--f-acento)] text-white' : 'border-[color-mix(in_srgb,var(--f-texto)_25%,transparent)] text-[var(--f-texto)]'">{{ v }}</button>
                  }
                </div>
                @if (campo().minEtiqueta || campo().maxEtiqueta) { <div class="flex justify-between text-[12px] opacity-70 text-[var(--f-texto)]"><span>{{ campo().minEtiqueta }}</span><span>{{ campo().maxEtiqueta }}</span></div> }
              </div>
            }
            @case ('valoracion') {
              <div class="flex gap-1" role="radiogroup" [attr.aria-labelledby]="'f-' + campo().id + '-t'">
                @for (v of estrellas(); track v) {
                  <button type="button" role="radio" [attr.aria-checked]="valor() === v" [attr.aria-label]="v + ' de ' + (campo().max ?? 5)" (click)="valorCambia.emit(v)" class="flex size-10 items-center justify-center focus-visible:outline-2 focus-visible:outline-[var(--f-acento)]">
                    <gr-icon name="star" [size]="26" [class]="v <= numero(valor()) ? 'text-[var(--f-acento)]' : 'text-[color-mix(in_srgb,var(--f-texto)_25%,transparent)]'" /></button>
                }
              </div>
            }
            @case ('archivo') {
              <div class="flex flex-col items-center gap-2 rounded-[var(--f-radio)] border border-dashed border-[color-mix(in_srgb,var(--f-texto)_30%,transparent)] p-5 text-center text-[var(--f-texto)]">
                <gr-icon name="upload" [size]="22" class="opacity-70" />
                <p class="text-[14px]">Arrastra un archivo o pulsa para elegirlo</p>
                <p class="text-[12px] opacity-70">{{ resumenArchivo() }}</p>
              </div>
            }
          }
          @if (error()) { <p class="text-[13px] text-[#c4262e]" role="alert">{{ error() }}</p> }
        </div>
      }
    }
  `,
  styles: [`
    .campo-input { width: 100%; min-height: 44px; border-radius: var(--f-radio); border: 1px solid color-mix(in srgb, var(--f-texto) 25%, transparent); background: var(--f-superficie); color: var(--f-texto); padding: 10px 12px; font: inherit; font-size: 16px; }
    .campo-input:focus-visible { outline: 2px solid var(--f-acento); outline-offset: 1px; }
  `],
})
export class BoCampoRender {
  readonly campo = input.required<Campo>();
  /** Current answer of this field (id, text, number, array of ids…). */
  readonly valor = input<unknown>(undefined);
  readonly error = input<string | null>(null);
  readonly interactivo = input(true);
  readonly valorCambia = output<unknown>();

  protected readonly html = computed(() => textoHtml(this.campo().etiqueta));
  protected readonly bloque = computed(() => {
    const e = this.campo().estilo;
    const mapa = this.campo().tipo === 'titulo' ? TAMANO_TITULO : TAMANO_TEXTO;
    return {
      'font-size': mapa[e.tamano] ?? '16px',
      'text-align': ALINEA[e.alinear] ?? 'left',
      color: e.color || '',
      'font-weight': e.negrita ? '700' : '',
      'background-color': e.fondo || '',
      padding: e.fondo || e.borde ? '8px 12px' : '',
      border: e.borde ? '1px solid color-mix(in srgb, var(--f-texto) 20%, transparent)' : '',
      'border-radius': e.borde || e.fondo ? 'var(--f-radio)' : '',
    };
  });
  protected readonly marcadas = computed<string[]>(() => (Array.isArray(this.valor()) ? (this.valor() as string[]) : []));
  protected readonly valores = computed<number[]>(() => {
    const c = this.campo();
    const min = c.min ?? 0;
    const max = c.max ?? 10;
    const paso = c.paso && c.paso > 0 ? c.paso : 1;
    const out: number[] = [];
    for (let v = min; v <= max && out.length < 100; v += paso) out.push(v);
    return out;
  });
  protected readonly estrellas = computed(() => Array.from({ length: Math.max(3, Math.min(10, this.campo().max ?? 5)) }, (_, i) => i + 1));
  protected readonly resumenArchivo = computed(() => {
    const a = this.campo().archivo;
    if (!a) return '';
    const tipos = a.tipos.map((t) => (t === 'image/*' ? 'imágenes' : t === 'application/pdf' ? 'PDF' : t)).join(', ');
    return `${tipos} · máx. ${a.maxMb} MB · ${a.maxArchivos} ${a.maxArchivos === 1 ? 'archivo' : 'archivos'}`;
  });

  /** Toggle of one option in a multi-value field; emits the new array of ids. */
  protected alternar(id: string): void {
    const actual = this.marcadas();
    this.valorCambia.emit(actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]);
  }

  protected numero(v: unknown): number {
    return Number(v ?? 0);
  }
}
