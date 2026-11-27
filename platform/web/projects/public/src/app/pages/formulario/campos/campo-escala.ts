import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, viewChild } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { I18n } from '../../../core/i18n';
import { Campo } from '../formulario-api';
import { TEXTOS } from '../formulario-textos';
import { ctrlId, descrito } from './campo-base';

interface Paso { v: string | number; texto: string }

const MAX_PASOS = 101;

/**
 * Deslizador (puntos = opciones, de izquierda a derecha) y escala numérica. Una sola línea con paradas discretas:
 * arrastrar, pulsar una parada o usar las flechas, Inicio y Fin. Es un role="slider" con aria-valuetext.
 */
@Component({
  selector: 'gr-form-escala',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="flex flex-col gap-2">
      @if (esDeslizador()) {
        <p class="min-h-6 text-[15px] font-semibold text-[var(--f-texto)]" aria-hidden="true">{{ textoValor() }}</p>
      }
      <div #pista role="slider" tabindex="0" [id]="ctrl()" [attr.aria-label]="campo().etiqueta"
        [attr.aria-valuemin]="0" [attr.aria-valuemax]="ultimo()" [attr.aria-valuenow]="indice() >= 0 ? indice() : null" [attr.aria-valuetext]="textoValor()"
        [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()"
        class="relative h-12 cursor-pointer touch-none select-none rounded-[var(--f-radio)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-acento)]"
        (keydown)="tecla($event)" (pointerdown)="puntero($event)" (pointermove)="arrastrando($event)" (pointerup)="soltar()" (pointercancel)="soltar()">
        <div #carril class="pointer-events-none absolute inset-x-3 inset-y-0">
          <div class="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--f-texto)_18%,transparent)]"></div>
          <div class="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--f-acento)]" [style.width.%]="posicionActual()"></div>
          @for (p of pasos(); track $index; let i = $index) {
            <span class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" [style.left.%]="posicion(i)"
              [class]="indice() >= 0 && i <= indice() ? 'bg-white' : 'bg-[color-mix(in_srgb,var(--f-texto)_35%,transparent)]'"></span>
          }
          @if (indice() >= 0) {
            <span class="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--f-acento)] shadow-md ring-4 ring-[var(--f-fondo)]" [style.left.%]="posicionActual()"></span>
          }
        </div>
      </div>
      @if (!esDeslizador() && pasos().length <= 11) {
        <div class="relative mx-3 h-5 text-[14px] text-[var(--f-texto)]" aria-hidden="true">
          @for (p of pasos(); track $index; let i = $index) {
            <span class="absolute -translate-x-1/2" [style.left.%]="posicion(i)">{{ p.texto }}</span>
          }
        </div>
      }
      @if (campo().minEtiqueta || campo().maxEtiqueta) {
        <div class="flex justify-between gap-3 text-[14px] text-[color-mix(in_srgb,var(--f-texto)_75%,transparent)]">
          <span>{{ campo().minEtiqueta }}</span><span class="text-right">{{ campo().maxEtiqueta }}</span>
        </div>
      }
    </div>
  `,
})
export class FormEscala {
  readonly campo = input.required<Campo>();
  readonly valor = input<unknown>(undefined);
  readonly error = input<string | null>(null);
  readonly cambio = output<unknown>();

  private readonly t = inject(I18n).dict(TEXTOS);
  private readonly pistaRef = viewChild.required<ElementRef<HTMLElement>>('pista');
  private readonly carril = viewChild.required<ElementRef<HTMLElement>>('carril');
  private arrastre = false;

  protected readonly ctrl = computed(() => ctrlId(this.campo()));
  protected readonly descrito = computed(() => descrito(this.campo(), this.error()));
  protected readonly esDeslizador = computed(() => this.campo().tipo === 'deslizador');

  protected readonly pasos = computed<Paso[]>(() => {
    const c = this.campo();
    if (c.tipo === 'deslizador') return (c.opciones ?? []).map((o) => ({ v: o.id, texto: o.texto }));
    const min = c.min ?? 0;
    const max = c.max ?? 10;
    const paso = c.paso && c.paso > 0 ? c.paso : 1;
    const n = Math.min(MAX_PASOS, Math.max(1, Math.floor((max - min) / paso) + 1));
    return Array.from({ length: n }, (_, i) => ({ v: min + i * paso, texto: String(min + i * paso) }));
  });
  protected readonly ultimo = computed(() => Math.max(0, this.pasos().length - 1));
  protected readonly indice = computed(() => this.pasos().findIndex((p) => p.v === this.valor()));
  protected readonly textoValor = computed(() => {
    const i = this.indice();
    return i < 0 ? this.t().sinValorar : this.pasos()[i].texto;
  });
  protected readonly posicionActual = computed(() => (this.indice() < 0 ? 0 : this.posicion(this.indice())));

  protected posicion(i: number): number {
    return this.ultimo() > 0 ? (i / this.ultimo()) * 100 : 0;
  }

  /** Teclado: con valor, flechas mueven una parada; sin valor, derecha/arriba empieza por el final y izquierda/abajo por el principio. */
  protected tecla(ev: KeyboardEvent): void {
    const n = this.pasos().length;
    if (!n) return;
    const i = this.indice();
    let k: number;
    switch (ev.key) {
      case 'ArrowRight':
      case 'ArrowUp': k = i < 0 ? n - 1 : i + 1; break;
      case 'ArrowLeft':
      case 'ArrowDown': k = i < 0 ? 0 : i - 1; break;
      case 'Home': k = 0; break;
      case 'End': k = n - 1; break;
      default: return;
    }
    ev.preventDefault();
    this.elegir(Math.min(n - 1, Math.max(0, k)));
  }

  protected puntero(ev: PointerEvent): void {
    if (!this.pasos().length) return;
    ev.preventDefault();
    this.pistaRef().nativeElement.setPointerCapture(ev.pointerId);
    this.pistaRef().nativeElement.focus();
    this.arrastre = true;
    this.desdePuntero(ev.clientX);
  }

  protected arrastrando(ev: PointerEvent): void {
    if (this.arrastre) this.desdePuntero(ev.clientX);
  }

  protected soltar(): void {
    this.arrastre = false;
  }

  private desdePuntero(x: number): void {
    const r = this.carril().nativeElement.getBoundingClientRect();
    const f = r.width > 0 ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
    this.elegir(Math.round(f * this.ultimo()));
  }

  private elegir(i: number): void {
    const p = this.pasos()[i];
    if (p && i !== this.indice()) this.cambio.emit(p.v);
  }
}

/** Valoración con estrellas (3–10, por defecto 5). Radios nativos: el teclado mueve la selección como en un grupo. */
@Component({
  selector: 'gr-form-valoracion',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="flex flex-wrap items-center gap-1">
      @for (n of estrellas(); track n) {
        <label class="relative inline-flex size-12 cursor-pointer items-center justify-center">
          <input type="radio" class="peer sr-only" [name]="ctrl()" [id]="$first ? ctrl() : null" [checked]="valor() === n"
            [attr.aria-label]="t().estrellas(n, max())" [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="descrito()" (change)="cambio.emit(n)" />
          <span class="flex items-center justify-center rounded-md transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--f-acento)] motion-reduce:transition-none"
            [class]="activa(n) ? 'text-[var(--f-acento)] [&_svg]:fill-current' : 'text-[color-mix(in_srgb,var(--f-texto)_35%,transparent)]'">
            <gr-icon name="star" [size]="32" [stroke]="1.75" />
          </span>
        </label>
      }
    </div>
  `,
})
export class FormValoracion {
  readonly campo = input.required<Campo>();
  readonly valor = input<unknown>(undefined);
  readonly error = input<string | null>(null);
  readonly cambio = output<number>();

  protected readonly t = inject(I18n).dict(TEXTOS);
  protected readonly ctrl = computed(() => ctrlId(this.campo()));
  protected readonly descrito = computed(() => descrito(this.campo(), this.error()));
  protected readonly max = computed(() => Math.min(10, Math.max(3, this.campo().max ?? 5)));
  protected readonly estrellas = computed(() => Array.from({ length: this.max() }, (_, i) => i + 1));

  protected activa(n: number): boolean {
    const v = this.valor();
    return typeof v === 'number' && n <= v;
  }
}
