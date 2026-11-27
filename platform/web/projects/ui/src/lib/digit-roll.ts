import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';

/** Una posición del texto: un dígito sobre su rodillo (pos: índice en la tira de 3 × 0–9) o un signo fijo. */
interface Celda {
  ch: string;
  d: number | null;
  pos: number;
  animar: boolean;
}

const TIRA = Array.from({ length: 30 }, (_, i) => i % 10);
const MEDIO = 10;
const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cifras que ruedan (Figma «Digit roll»): cada dígito de `texto` gira sobre un rodillo con CSS transform. Si `valor`
 * sube, los dígitos ruedan hacia arriba; si baja, hacia abajo. Sin movimiento con prefers-reduced-motion. El texto
 * final va en un sr-only con aria-live="polite" (los rodillos son aria-hidden).
 */
@Component({
  selector: 'gr-digit-roll',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-baseline leading-none tabular-nums whitespace-nowrap' },
  template: `
    <span class="sr-only" aria-live="polite">{{ texto() }}</span>
    <span class="inline-flex items-baseline" aria-hidden="true">
      @for (c of celdas(); track $index) {
        @if (c.d === null) {
          <span>{{ c.ch }}</span>
        } @else {
          <span class="relative inline-block h-[1em] overflow-hidden">
            <span class="flex flex-col" [class.transition-transform]="c.animar" [class.duration-500]="c.animar" [class.ease-out]="c.animar"
              [style.transform]="'translateY(' + -c.pos + 'em)'" (transitionend)="reposicionar($index)">
              @for (n of tira; track $index) { <span class="block h-[1em]">{{ n }}</span> }
            </span>
            <span class="invisible">{{ c.ch }}</span>
          </span>
        }
      }
    </span>
  `,
})
export class GrDigitRoll {
  readonly texto = input.required<string>();
  /** El valor numérico: su sentido (sube o baja) decide hacia dónde ruedan los dígitos. */
  readonly valor = input<number | null>(null);
  protected readonly tira = TIRA;
  protected readonly celdas = signal<Celda[]>([]);
  private textoAnterior = '';
  private valorAnterior: number | null = null;

  constructor() {
    effect(() => {
      const t = this.texto();
      const v = this.valor();
      untracked(() => this.aplicar(t, v));
    });
  }

  /** Al acabar un giro, el rodillo vuelve al dígito equivalente en la franja central sin animación (sin saltos visibles). */
  protected reposicionar(i: number): void {
    const c = this.celdas()[i];
    if (!c || c.d === null || !c.animar) return;
    this.celdas.update((l) => l.map((x, k) => (k === i ? { ...x, pos: MEDIO + c.d!, animar: false } : x)));
  }

  private aplicar(t: string, v: number | null): void {
    const sube = v !== null && this.valorAnterior !== null ? v >= this.valorAnterior : true;
    const anterior = this.textoAnterior;
    const previas = this.celdas();
    this.textoAnterior = t;
    this.valorAnterior = v;
    this.celdas.set(
      [...t].map((ch, i): Celda => {
        if (!/\d/.test(ch)) return { ch, d: null, pos: 0, animar: false };
        const d = Number(ch);
        const previa = previas[i];
        const viejo = /\d/.test(anterior.charAt(i)) ? Number(anterior.charAt(i)) : null;
        if (!previa || previa.d === null || viejo === null) return { ch, d, pos: MEDIO + d, animar: false };
        if (viejo === d) return previa.ch === ch ? previa : { ...previa, ch };
        if (reducido()) return { ch, d, pos: MEDIO + d, animar: false };
        const actual = previa.pos % 10;
        const pasos = sube ? (d - actual + 10) % 10 : -((actual - d + 10) % 10);
        return { ch, d, pos: Math.min(29, Math.max(0, previa.pos + pasos)), animar: true };
      }),
    );
  }
}
