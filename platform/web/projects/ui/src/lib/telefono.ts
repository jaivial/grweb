import { ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, inject, input, signal, viewChildren } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { GrIcon } from './icon';
import { GrSelect } from './select';
import { GR_LANG, grDict } from './lang';

/** One country of the phone selector: ISO code, dial code and length of the national number. */
export interface PaisTelefono {
  iso: string;
  dial: string;
  /** Longitud del número nacional (sin prefijo). */
  digitos: number;
  es: string;
  en: string;
}

/** Common countries, Spain first and then alphabetical. `digitos` is the national significant number of a mobile. */
export const PAISES_TELEFONO: readonly PaisTelefono[] = [
  { iso: 'ES', dial: '34', digitos: 9, es: 'España', en: 'Spain' },
  { iso: 'DE', dial: '49', digitos: 10, es: 'Alemania', en: 'Germany' },
  { iso: 'AR', dial: '54', digitos: 10, es: 'Argentina', en: 'Argentina' },
  { iso: 'AT', dial: '43', digitos: 9, es: 'Austria', en: 'Austria' },
  { iso: 'BE', dial: '32', digitos: 9, es: 'Bélgica', en: 'Belgium' },
  { iso: 'BR', dial: '55', digitos: 11, es: 'Brasil', en: 'Brazil' },
  { iso: 'US', dial: '1', digitos: 10, es: 'Estados Unidos', en: 'United States' },
  { iso: 'CA', dial: '1', digitos: 10, es: 'Canadá', en: 'Canada' },
  { iso: 'CL', dial: '56', digitos: 9, es: 'Chile', en: 'Chile' },
  { iso: 'CO', dial: '57', digitos: 10, es: 'Colombia', en: 'Colombia' },
  { iso: 'EC', dial: '593', digitos: 9, es: 'Ecuador', en: 'Ecuador' },
  { iso: 'FR', dial: '33', digitos: 9, es: 'Francia', en: 'France' },
  { iso: 'IE', dial: '353', digitos: 9, es: 'Irlanda', en: 'Ireland' },
  { iso: 'IT', dial: '39', digitos: 10, es: 'Italia', en: 'Italy' },
  { iso: 'MA', dial: '212', digitos: 9, es: 'Marruecos', en: 'Morocco' },
  { iso: 'MX', dial: '52', digitos: 10, es: 'México', en: 'Mexico' },
  { iso: 'NL', dial: '31', digitos: 9, es: 'Países Bajos', en: 'Netherlands' },
  { iso: 'PE', dial: '51', digitos: 9, es: 'Perú', en: 'Peru' },
  { iso: 'PL', dial: '48', digitos: 9, es: 'Polonia', en: 'Poland' },
  { iso: 'PT', dial: '351', digitos: 9, es: 'Portugal', en: 'Portugal' },
  { iso: 'GB', dial: '44', digitos: 10, es: 'Reino Unido', en: 'United Kingdom' },
  { iso: 'RO', dial: '40', digitos: 9, es: 'Rumanía', en: 'Romania' },
  { iso: 'CH', dial: '41', digitos: 9, es: 'Suiza', en: 'Switzerland' },
  { iso: 'UY', dial: '598', digitos: 8, es: 'Uruguay', en: 'Uruguay' },
  { iso: 'VE', dial: '58', digitos: 10, es: 'Venezuela', en: 'Venezuela' },
];

const LARGO_DIAL = [...PAISES_TELEFONO].sort((a, b) => b.dial.length - a.dial.length);

/** Country of a number written with its dial code («34692747052» → España); the longest dial code wins. */
function paisDe(cifras: string): PaisTelefono | undefined {
  return LARGO_DIAL.find((p) => cifras.startsWith(p.dial));
}

/** ISO 3166 alpha-2 → emoji flag (regional indicators). */
export function bandera(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Splits a phone into country and national digits. Understands E.164 («+34692747052»), a number with 00 instead of +,
 * a bare number with the dial code («34692747052») and a bare national number. With no prefix the current country is
 * kept (Spanish by default for 9 digits).
 */
export function partirTelefono(v: string, isoActual = 'ES'): { iso: string; digitos: string } {
  const s = String(v ?? '').trim();
  const actual = PAISES_TELEFONO.find((p) => p.iso === isoActual) ?? PAISES_TELEFONO[0];
  if (!s) return { iso: actual.iso, digitos: '' };
  const crudo = s.replace(/[^\d+]/g, '');
  const mas = crudo.startsWith('+');
  const cero = !mas && crudo.startsWith('00');
  let cifras = crudo.replace(/\D/g, '');
  if (cero) cifras = cifras.slice(2);
  if (!mas && !cero && (cifras.length === 9 || cifras.length === actual.digitos)) return { iso: actual.iso, digitos: cifras };
  const p = paisDe(cifras);
  if (p) return { iso: p.iso, digitos: cifras.slice(p.dial.length) };
  return { iso: actual.iso, digitos: cifras };
}

/** True when v is a complete E.164 number of a country of the table (empty is not a valid phone). */
export function telefonoValido(v: string): boolean {
  const { iso, digitos } = partirTelefono(v);
  const p = PAISES_TELEFONO.find((x) => x.iso === iso);
  return !!p && digitos.length === p.digitos;
}

let seq = 0;

/**
 * Teléfono con selector de país y casillas de dígito (Figma: campo «Teléfono»).
 *
 * - Izquierda, el prefijo (bandera + «+NN», con el país en la lista; España por defecto).
 * - Derecha, una casilla por dígito del número nacional de ese país: escribir avanza, retroceso en vacío vuelve,
 *   las flechas mueven, y pegar un número completo rellena todo y detecta el prefijo.
 * - El valor es E.164 («+34692747052») y vacío cuando no hay dígitos. Al salir con el número a medias marca el error
 *   del campo (misma línea que `gr-field`).
 */
@Component({
  selector: 'gr-telefono',
  imports: [GrIcon, GrSelect],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GrTelefono), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-wrap items-start gap-2', '(focusout)': 'finFoco($event)' },
  template: `
    <div class="w-[120px] shrink-0 sm:w-[132px]">
      <gr-select [id]="uid + '-pais'" [tam]="tam()" [invalido]="invalido()" [disabled]="bloqueado()" [aria-label]="t().pais" [value]="iso()" (valorChange)="cambiaPais($event)">
        @for (p of paises(); track p.iso) { <option [value]="p.iso">{{ bandera(p.iso) }} +{{ p.dial }} · {{ p[lang()] }}</option> }
      </gr-select>
    </div>
    <div class="flex min-w-0 flex-1 basis-40 flex-col gap-1.5" role="group" [attr.aria-label]="etiqueta() || t().numero">
      <div class="flex w-full items-center gap-[3px] sm:gap-1">
        @for (i of casillas(); track i) {
          <input #caja type="text" [attr.id]="i === 0 ? id() || null : null" [value]="valor(i)" inputmode="numeric" pattern="[0-9]*" [attr.autocomplete]="i === 0 ? 'tel-national' : 'off'"
            [attr.aria-label]="t().digito(i + 1, n())" [attr.aria-invalid]="invalido() || error() ? true : null" [disabled]="bloqueado()"
            [class]="cajaCls()" (focus)="focoCaja($event)" (input)="escribe(i, $event)" (keydown)="tecla(i, $event)" (paste)="pega($event)" />
        }
      </div>
      @if (error(); as e) {
        <p class="flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p>
      }
    </div>
  `,
})
export class GrTelefono implements ControlValueAccessor {
  private readonly lang = inject(GR_LANG);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = grDict({
    es: { pais: 'País', numero: 'Número de teléfono', digito: (i: number, n: number) => `Dígito ${i} de ${n}`, falta: (n: number) => `Escribe los ${n} dígitos del número.` },
    en: { pais: 'Country', numero: 'Phone number', digito: (i: number, n: number) => `Digit ${i} of ${n}`, falta: (n: number) => `Enter the ${n} digits of the number.` },
  });
  /** «l» en la web (48 px) · «m» en el backoffice (44 px · 40 px en escritorio). */
  readonly tam = input<'m' | 'l'>('l');
  /** Red border from the outside (the form's own error), like `gr-field`. */
  readonly invalido = input(false);
  /** Accessible name of the group: the field label. */
  readonly etiqueta = input('', { alias: 'aria-label' });
  /** Goes to the first box, so `<label for>` focuses the phone like with a native input. */
  readonly id = input('');

  protected readonly uid = `gr-telefono-${++seq}`;
  protected readonly bandera = bandera;
  protected readonly paises = computed(() => [...PAISES_TELEFONO].sort((a, b) => (a.iso === 'ES' ? -1 : b.iso === 'ES' ? 1 : a[this.lang()].localeCompare(b[this.lang()]))));
  protected readonly iso = signal('ES');
  protected readonly digitos = signal<string[]>([]);
  protected readonly tocado = signal(false);
  private readonly deshabilitado = signal(false);
  private readonly cajas = viewChildren<ElementRef<HTMLInputElement>>('caja');
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected readonly pais = computed(() => PAISES_TELEFONO.find((p) => p.iso === this.iso()) ?? PAISES_TELEFONO[0]);
  protected readonly n = computed(() => this.pais().digitos);
  protected readonly casillas = computed(() => Array.from({ length: this.n() }, (_, i) => i));
  protected readonly bloqueado = computed(() => this.deshabilitado());
  /** Digits up to the first empty box: the number as it reads, without the boxes filled out of order after a gap. */
  private readonly cifras = computed(() => {
    const ds = this.digitos();
    const hueco = ds.indexOf('');
    return (hueco < 0 ? ds : ds.slice(0, hueco)).join('');
  });
  /** Boxes filled after a gap («6 _ _ _ 7»): the number is not the one on screen, so it is not a value yet. */
  private readonly sueltas = computed(() => {
    const ds = this.digitos();
    const hueco = ds.indexOf('');
    return hueco < 0 ? 0 : ds.slice(hueco + 1).filter(Boolean).length;
  });
  protected readonly error = computed(() => {
    const faltan = this.cifras().length < this.n() && (this.cifras().length > 0 || this.sueltas() > 0);
    return this.tocado() && faltan ? this.t().falta(this.n()) : null;
  });
  protected readonly cajaCls = computed(() => {
    const alto = this.tam() === 'l' ? 'h-12 text-[17px] md:text-[16px]' : 'h-11 text-[15px] md:pointer-fine:h-10';
    return `min-w-0 flex-1 ${alto} rounded-sm border bg-bg-field px-0 text-center font-mono leading-none text-text-primary caret-accent ` +
      'focus:border-accent-text focus:ring-2 focus:ring-accent/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ' +
      (this.invalido() || this.error() ? 'border-accent-text' : 'border-line-strong hover:border-line-hover');
  });

  protected valor(i: number): string {
    return this.digitos()[i] ?? '';
  }

  writeValue(v: unknown): void {
    const { iso, digitos } = partirTelefono(v == null ? '' : String(v));
    this.iso.set(iso);
    this.digitos.set(this.relleno(digitos));
    this.tocado.set(false);
  }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.deshabilitado.set(d); }

  /** Pads or trims the digits to the boxes of the current country. */
  private relleno(d: string): string[] {
    return Array.from({ length: this.pais().digitos }, (_, i) => d[i] ?? '');
  }

  private emitir(): void {
    const cifras = this.cifras();
    // digits after a gap are not the number on screen: the value stays empty until the boxes read in order
    this.onChange(!this.sueltas() && cifras ? '+' + this.pais().dial + cifras : '');
  }

  protected cambiaPais(iso: string): void {
    const pais = PAISES_TELEFONO.find((p) => p.iso === iso);
    if (!pais || pais.iso === this.iso()) return;
    this.iso.set(pais.iso);
    this.digitos.set(this.relleno(this.digitos().join('')));
    this.emitir();
  }

  protected focoCaja(e: Event): void {
    (e.target as HTMLInputElement).select();
  }

  protected escribe(i: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    const ds = el.value.replace(/\D/g, '');
    if (ds.length > 1) { this.rellena(ds, i); return; }
    this.pon(i, ds.slice(-1));
    el.value = this.valor(i); // a letter or a second digit never stays in the box
    if (ds && i < this.n() - 1) this.foco(i + 1);
  }

  protected tecla(i: number, e: KeyboardEvent): void {
    const n = this.n();
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); this.foco(i - 1); }
    else if (e.key === 'ArrowRight' && i < n - 1) { e.preventDefault(); this.foco(i + 1); }
    else if (e.key === 'Home') { e.preventDefault(); this.foco(0); }
    else if (e.key === 'End') { e.preventDefault(); this.foco(n - 1); }
    else if (e.key === 'Backspace') {
      e.preventDefault();
      if (this.valor(i)) this.pon(i, '');
      else if (i > 0) { this.pon(i - 1, ''); this.foco(i - 1); }
    } else if (e.key === 'Delete') { e.preventDefault(); this.pon(i, ''); }
    else if (e.key.length === 1 && /\d/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.pon(i, e.key);
      if (i < n - 1) this.foco(i + 1);
    }
  }

  /** Paste: fills the boxes and detects the dial code of the pasted number. */
  protected pega(e: ClipboardEvent): void {
    const txt = e.clipboardData?.getData('text') ?? '';
    if (!txt.replace(/\D/g, '')) return;
    e.preventDefault();
    this.rellena(txt, 0);
  }

  private rellena(txt: string, desde: number): void {
    const { iso, digitos } = partirTelefono(txt, this.iso());
    const previos = this.digitos().join('');
    if (iso !== this.iso()) this.iso.set(iso);
    this.digitos.set(this.relleno(desde === 0 ? digitos : previos.slice(0, desde) + digitos));
    this.emitir();
    this.foco(Math.min(this.cifras().length, this.n() - 1));
  }

  private pon(i: number, d: string): void {
    const ds = this.relleno(this.digitos().join(''));
    ds[i] = d;
    this.digitos.set(ds);
    this.emitir();
  }

  private foco(i: number): void {
    const el = this.cajas()[i]?.nativeElement;
    el?.focus();
    el?.select();
  }

  /** Touched only when the focus leaves the whole component (not on each box). */
  protected finFoco(e: FocusEvent): void {
    if (this.host.nativeElement.contains(e.relatedTarget as Node | null)) return;
    this.tocado.set(true);
    this.onTouched();
  }
}
