import { RouterLink } from '@angular/router';
/**
 * fantasy/pista.ts — la alineación de /fantasy como una pista de fútbol sala (Figma «72 · /fantasy»: componentes
 * «Jugador · pista», «Pista · fútbol sala» y «Hoja · jugador»). En la pista solo va el avatar, el nombre corto y
 * la puntuación; todo lo demás (cláusula, desglose, flight y acciones) vive en la hoja inferior.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { type AtletaDetalle, type AtletaMercado } from '../../core/juegos';
import { iniciales } from '../porra/componentes';
import { monedas } from '../porra/formato';
import { ClauseTrend } from './componentes';

/** El atleta con su foto pública (perfil público con imagen consentida; el backend la envía solo en ese caso). */
export type AtletaPista = AtletaMercado & { fotoUrl?: string };

/**
 * Color estable del avatar sin foto, según el nombre (tokens de marca mezclados con bg/raised; mismo orden que la
 * paleta del Figma).
 */
const PALETA = [
  'bg-[color-mix(in_oklab,var(--color-accent)_55%,var(--color-bg-raised))]',
  'bg-[color-mix(in_oklab,var(--color-info)_40%,var(--color-bg-raised))]',
  'bg-[color-mix(in_oklab,var(--color-success)_35%,var(--color-bg-raised))]',
  'bg-[color-mix(in_oklab,var(--color-warning)_40%,var(--color-bg-raised))]',
  'bg-accent-700',
  'bg-[color-mix(in_oklab,var(--color-text-muted)_50%,var(--color-bg-raised))]',
];
export function colorAvatar(nombre: string): string {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETA[h % PALETA.length];
}

/** «Lucía Rubio Peris» → «Lucía Rubio» (nombre y primer apellido). */
export function nombreCorto(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).join(' ');
}

/** «+37» · «0» · «−4». */
export function puntosTxt(p: number): string {
  return p > 0 ? '+' + p : p < 0 ? '−' + -p : '0';
}

const TAM = { l: 'size-20', m: 'size-16', s: 'size-14' } as const;

/** Un jugador en la pista (Figma «Jugador · pista»): avatar (foto o iniciales), nombre corto y chip de puntos. */
@Component({
  selector: 'gr-jugador-pista',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button type="button" class="group flex w-[6.5rem] flex-col items-center gap-2.5 rounded-lg p-1 outline-offset-4 lg:w-[7.5rem]" (click)="abrir.emit($event)" [attr.aria-label]="etiqueta()" aria-haspopup="dialog">
      <span class="relative block shrink-0" [class]="tam()">
        <span class="flex size-full items-center justify-center overflow-hidden rounded-full border-2 font-display text-white italic shadow-[0_6px_16px_rgb(0_0_0/0.5)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95 motion-reduce:transform-none"
          [class]="(atleta().flightEnCurso ? 'border-warning ' : 'border-white/25 ') + (foto() ? 'bg-bg-raised' : color()) + (tamano() === 'l' ? ' text-[27px]' : tamano() === 'm' ? ' text-[22px]' : ' text-[19px]')">
          @if (foto(); as f) { <img [src]="f" alt="" class="size-full object-cover" loading="lazy" decoding="async" (error)="sinFoto.set(true)" /> } @else { {{ ini() }} }
        </span>
        @if (puntos() !== null) {
          <span class="absolute -right-2 -bottom-0.5 rounded-pill border-[1.5px] bg-bg-deep px-1.5 py-px font-mono text-[12px] leading-[1.35] font-bold tabular-nums"
            [class]="puntos()! > 0 ? 'border-success/70 text-success' : puntos()! < 0 ? 'border-accent-text/70 text-accent-text' : 'border-line-strong text-text-tertiary'" aria-hidden="true">{{ txt() }}</span>
        }
        @if (atleta().flightEnCurso) {
          <span class="absolute -top-1 -right-1 flex size-[22px] items-center justify-center rounded-full bg-warning text-bg-deep" aria-hidden="true"><gr-icon name="lock" [size]="12" [stroke]="2.5" /></span>
        }
      </span>
      <span class="line-clamp-2 w-full text-center text-[12px] leading-tight font-semibold text-text-primary [text-shadow:0_1px_6px_rgb(0_0_0/0.8)] lg:text-[14px]">{{ corto() }}</span>
    </button>
  `,
})
export class JugadorPista {
  readonly atleta = input.required<AtletaPista>();
  /** Puntos de la jornada (null: no se pinta el chip, p. ej. en el banquillo). */
  readonly puntos = input<number | null>(null);
  readonly tamano = input<'l' | 'm' | 's'>('m');
  readonly abrir = output<Event>();

  protected readonly sinFoto = signal(false);
  protected readonly foto = computed(() => (this.sinFoto() ? '' : this.atleta().fotoUrl || ''));
  protected readonly tam = computed(() => TAM[this.tamano()] + (this.tamano() === 'l' ? ' max-lg:size-16' : ''));
  protected readonly ini = computed(() => iniciales(this.atleta().nombre));
  protected readonly color = computed(() => colorAvatar(this.atleta().nombre));
  protected readonly corto = computed(() => nombreCorto(this.atleta().nombre));
  protected readonly txt = computed(() => puntosTxt(this.puntos() ?? 0));
  protected readonly etiqueta = computed(() => {
    const a = this.atleta();
    const p = this.puntos();
    return `${a.nombre}${p !== null ? `, ${p} ${p === 1 || p === -1 ? 'punto' : 'puntos'}` : ''}${a.flightEnCurso ? ', compitiendo ahora' : ''}. Ver detalles`;
  });
}

/** Las posiciones de la pista (rombo 1-1-2-1 de fútbol sala, el «portero» abajo); solo son visuales. */
const POSICIONES = [
  { nombre: 'Pívot', left: '50%', top: '6%' },
  { nombre: 'Ala izquierda', left: '21%', top: '28%' },
  { nombre: 'Ala derecha', left: '79%', top: '28%' },
  { nombre: 'Cierre', left: '50%', top: '52.5%' },
  { nombre: 'Portero', left: '50%', top: '76.5%' },
];

/**
 * La pista de fútbol sala (Figma «Pista · fútbol sala»): degradado de rojo de marca a negro con trama de puntos y
 * líneas muy sutiles (CSS, sin imágenes), y los 5 titulares en rombo. Los huecos llevan al mercado.
 */
@Component({
  selector: 'gr-pista-futsal',
  imports: [RouterLink, GrIcon, JugadorPista],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    .pista {
      background-color: var(--color-bg-deep);
      background-image:
        radial-gradient(rgb(255 255 255 / 0.11) 1.1px, transparent 1.5px),
        radial-gradient(120% 55% at 50% 0%, rgb(196 43 62 / 0.24), transparent 70%),
        linear-gradient(180deg, var(--color-accent-deep) 0%, color-mix(in oklab, var(--color-accent-deep) 50%, var(--color-bg-deep)) 55%, var(--color-bg-deep) 100%);
      background-size: 18px 18px, 100% 100%, 100% 100%;
    }
  `,
  template: `
    <div class="pista relative isolate aspect-[358/500] w-full overflow-hidden rounded-2xl border border-accent/35 shadow-[0_24px_60px_rgb(0_0_0/0.45)] lg:aspect-[680/760]">
      <!-- Líneas (área, medio campo y círculo central), decorativas -->
      <span class="pointer-events-none absolute inset-3 rounded-[10px] border-[1.5px] border-white/10 lg:inset-[18px] lg:rounded-[14px]" aria-hidden="true"></span>
      <span class="pointer-events-none absolute inset-x-3 top-1/2 h-0 border-t-[1.5px] border-white/10 lg:inset-x-[18px]" aria-hidden="true"></span>
      <span class="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/10" aria-hidden="true"></span>
      <span class="pointer-events-none absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/15" aria-hidden="true"></span>
      <span class="pointer-events-none absolute top-3 left-1/2 h-[13%] w-[46%] -translate-x-1/2 rounded-b-full border-[1.5px] border-t-0 border-white/10 lg:top-[18px]" aria-hidden="true"></span>
      <span class="pointer-events-none absolute bottom-3 left-1/2 h-[13%] w-[46%] -translate-x-1/2 rounded-t-full border-[1.5px] border-b-0 border-white/10 lg:bottom-[18px]" aria-hidden="true"></span>

      <ul class="absolute inset-0" aria-label="Titulares en la pista">
        @for (p of posiciones; track p.nombre; let i = $index) {
          <li class="absolute -translate-x-1/2" [style.left]="p.left" [style.top]="p.top">
            @if (titulares()[i]; as a) {
              <gr-jugador-pista [atleta]="a" [puntos]="puntosDe()(a)" tamano="l" (abrir)="abrir.emit({ atleta: a, origen: $event })" />
            } @else {
              <a routerLink="/fantasy/mercado" class="group flex w-[6.5rem] flex-col items-center gap-2.5 rounded-lg p-1 lg:w-[7.5rem]" [attr.aria-label]="'Hueco libre (' + p.nombre + '): fichar en el mercado'">
                <span class="flex size-16 items-center justify-center rounded-full border-[1.5px] border-dashed border-white/40 bg-bg-deep/35 text-text-secondary transition-colors group-hover:border-white/70 group-hover:text-white lg:size-20">
                  <gr-icon name="plus" [size]="24" />
                </span>
                <span class="text-[12px] font-semibold text-text-tertiary lg:text-[14px]">Fichar</span>
              </a>
            }
          </li>
        }
      </ul>
    </div>
  `,
})
export class PistaFutsal {
  /** Los titulares en orden de posición (pívot, alas, cierre, portero); los que falten son huecos. */
  readonly titulares = input<AtletaPista[]>([]);
  readonly puntosDe = input<(a: AtletaPista) => number | null>(() => null);
  readonly abrir = output<{ atleta: AtletaPista; origen: Event }>();
  protected readonly posiciones = POSICIONES;
}

/**
 * La hoja inferior del jugador (Figma «Hoja · jugador»): foto grande, sexo y categoría, flight, cláusula con
 * tendencia y minigráfica, desglose de puntos y acciones. role="dialog" con foco atrapado, cierre con Escape, con
 * el velo o arrastrando hacia abajo; sin animación con prefers-reduced-motion.
 */
@Component({
  selector: 'gr-hoja-jugador',
  imports: [GrIcon, ClauseTrend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown)': 'tecla($event)' },
  styles: `
    .velo { animation: aparece 0.2s ease-out both; }
    .panel { animation: sube 0.28s cubic-bezier(0.22, 1, 0.36, 1) both; }
    @keyframes aparece { from { opacity: 0; } }
    @keyframes sube { from { transform: translateY(100%); } }
    @media (min-width: 1024px) { @keyframes sube { from { transform: translateY(24px); opacity: 0; } } }
    @media (prefers-reduced-motion: reduce) { .velo, .panel { animation: none; } }
  `,
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center lg:p-6" role="presentation">
      <button type="button" tabindex="-1" class="velo absolute inset-0 bg-bg-deep/75 backdrop-blur-[2px]" aria-label="Cerrar" (click)="cerrar.emit()"></button>
      <div #panel class="panel relative flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-y-auto overscroll-contain rounded-t-3xl border border-line-strong bg-bg-raised shadow-[0_-8px_40px_rgb(0_0_0/0.55)] lg:rounded-3xl"
        role="dialog" aria-modal="true" aria-labelledby="hoja-jugador-nombre" [style.transform]="arrastre() ? 'translateY(' + arrastre() + 'px)' : null">
        <!-- Agarre: se arrastra hacia abajo para cerrar -->
        <div class="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing" (pointerdown)="empieza($event)" (pointermove)="mueve($event)" (pointerup)="suelta()" (pointercancel)="suelta()" aria-hidden="true">
          <span class="h-1 w-11 rounded-pill bg-line-strong"></span>
        </div>
        <div class="flex flex-col gap-4 px-5 pt-2 pb-6">
          <header class="flex items-start gap-4" (pointerdown)="empieza($event)" (pointermove)="mueve($event)" (pointerup)="suelta()" (pointercancel)="suelta()">
            <span class="flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-display text-[32px] text-white italic"
              [class]="(atleta().flightEnCurso ? 'border-warning ' : 'border-white/25 ') + (foto() ? 'bg-bg-raised' : color())">
              @if (foto(); as f) { <img [src]="f" [alt]="'Foto de ' + atleta().nombre" class="size-full object-cover" (error)="sinFoto.set(true)" /> } @else { {{ ini() }} }
            </span>
            <span class="min-w-0 flex-1 pt-1">
              <h2 id="hoja-jugador-nombre" class="text-ui-h4 text-text-primary">{{ atleta().nombre }}</h2>
              <span class="mt-0.5 block text-body-s text-text-tertiary">{{ meta() }}</span>
              @if (atleta().flightEnCurso) {
                <span class="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-warning/40 bg-warning/12 px-2.5 py-1 text-label-xs text-warning"><gr-icon name="lock" [size]="13" />Compitiendo ahora</span>
              } @else {
                <span class="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-success/35 bg-success/10 px-2.5 py-1 text-label-xs text-success"><span class="size-1.5 rounded-full bg-success"></span>Libre para moverse</span>
              }
            </span>
            <button #cerrarBtn type="button" class="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-card hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
          </header>

          <section class="flex items-center justify-between gap-4 rounded-lg border border-line-subtle bg-bg-card p-3.5" aria-label="Cláusula">
            <span class="min-w-0">
              <span class="block text-mono-xs text-text-tertiary">Cláusula · {{ dueno() }}</span>
              <span class="mt-1 flex items-center gap-2"><span class="font-mono text-[24px] leading-none font-bold text-text-primary tabular-nums">{{ monedas(atleta().clausula) }}</span><gr-clause-trend [delta]="delta()" /></span>
            </span>
            <svg class="h-8 w-28 shrink-0" viewBox="0 0 112 32" fill="none" role="img" [attr.aria-label]="resumenSerie()">
              <path [attr.d]="curva()" [attr.stroke]="serie().length < 2 ? 'var(--color-text-muted)' : delta() < 0 ? 'var(--color-warning)' : 'var(--color-success)'" [attr.stroke-dasharray]="serie().length < 2 ? '3 4' : null" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </section>

          <section class="rounded-lg border border-line-subtle bg-bg-card px-3.5 pt-3 pb-1.5" aria-labelledby="hoja-puntos">
            <p class="flex items-center justify-between gap-3">
              <span id="hoja-puntos" class="text-mono-xs text-text-tertiary">{{ atleta().titular ? 'Puntos de la jornada' : 'Puntos · no puntúa en el banquillo' }}</span>
              <span class="font-mono text-[22px] font-bold tabular-nums" [class]="total() > 0 ? 'text-success' : total() < 0 ? 'text-accent-text' : 'text-text-tertiary'">{{ totalTxt() }}</span>
            </p>
            @if (!detalle()) {
              <span class="my-3 block h-16 animate-pulse rounded-sm bg-bg-raised motion-reduce:animate-none" aria-hidden="true"></span>
            } @else if (detalle()!.puntos.length) {
              <ul class="mt-1.5">
                @for (p of detalle()!.puntos; track p.ref) {
                  <li class="flex items-center justify-between gap-3 border-t border-line-subtle py-2.5 text-body-s">
                    <span class="min-w-0 text-text-secondary">{{ p.concepto }}</span>
                    <span class="shrink-0 font-mono text-[13px] font-bold tabular-nums" [class]="p.puntos > 0 ? 'text-success' : p.puntos < 0 ? 'text-accent-text' : 'text-text-tertiary'">{{ ptxt(p.puntos) }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="border-t border-line-subtle py-3 text-body-s text-text-tertiary">Todavía no ha puntuado: los puntos llegan con cada veredicto mientras es titular.</p>
            }
          </section>

          <div class="flex flex-col gap-2.5 pt-1">
            <div class="grid grid-cols-2 gap-3">
              @if (atleta().titular) {
                <button type="button" class="h-12 rounded-sm border border-line-strong px-3 text-label-s text-text-primary transition-colors hover:border-text-muted disabled:cursor-not-allowed disabled:opacity-45" [disabled]="bloqueado()" (click)="banquillo.emit()">Pasar al banquillo</button>
              } @else {
                <button type="button" class="h-12 rounded-sm border border-line-strong px-3 text-label-s text-text-primary transition-colors hover:border-text-muted disabled:cursor-not-allowed disabled:opacity-45" [disabled]="bloqueado()" (click)="subir.emit()">Subir a titular</button>
              }
              <button type="button" class="h-12 rounded-sm bg-accent-grain px-3 text-label-s text-white transition-shadow hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-45" [disabled]="bloqueado()" (click)="vender.emit()">Vender · {{ monedas(atleta().clausula) }}</button>
            </div>
            @if (atleta().flightEnCurso) {
              <p class="text-body-xs text-warning">Mientras compite no se puede vender ni cambiar de sitio.</p>
            } @else if (!atleta().titular && saleAlBanquillo()) {
              <p class="text-body-xs text-text-tertiary">Tienes los 5 titulares: entra por {{ saleAlBanquillo() }}, que pasa al banquillo.</p>
            }
            @if (cargando()) { <p class="text-body-xs text-text-tertiary" role="status">Guardando…</p> }
            @if (error() && !cargando()) {
              <p class="flex items-start gap-2 rounded-md border border-accent-text/40 bg-accent-deep/30 px-3 py-2.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="16" class="mt-px shrink-0" />{{ error() }}</p>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HojaJugador {
  protected readonly monedas = monedas;
  readonly atleta = input.required<AtletaPista>();
  readonly detalle = input<AtletaDetalle | null>(null);
  readonly delta = input(0);
  /** La serie de la cláusula (del historial o de lo que llega en vivo). */
  readonly serie = input<number[]>([]);
  /** Con los 5 titulares, a quién manda al banquillo «Subir a titular». */
  readonly saleAlBanquillo = input('');
  readonly cargando = input(false);
  readonly error = input<string | null>(null);
  readonly cerrar = output<void>();
  readonly vender = output<void>();
  readonly banquillo = output<void>();
  readonly subir = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly cerrarBtn = viewChild.required<ElementRef<HTMLButtonElement>>('cerrarBtn');
  protected readonly arrastre = signal(0);
  private inicioY: number | null = null;
  protected readonly sinFoto = signal(false);

  protected readonly foto = computed(() => (this.sinFoto() ? '' : this.atleta().fotoUrl || ''));
  protected readonly ini = computed(() => iniciales(this.atleta().nombre));
  protected readonly color = computed(() => colorAvatar(this.atleta().nombre));
  protected readonly bloqueado = computed(() => this.atleta().flightEnCurso || this.cargando());
  protected readonly meta = computed(() => {
    const a = this.atleta();
    return `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg · ${a.titular ? 'Titular' : 'Suplente'}`;
  });
  protected readonly dueno = computed(() => (this.atleta().esMio ? 'dueño @tú' : this.atleta().duenoAlias ? 'dueño @' + this.atleta().duenoAlias : 'libre'));
  protected readonly total = computed(() => (this.detalle()?.puntos ?? []).reduce((s, p) => s + p.puntos, 0));
  protected readonly totalTxt = computed(() => (this.detalle() ? puntosTxt(this.total()) : '—'));
  protected readonly curva = computed(() => {
    const v = this.serie().length > 1 ? this.serie() : [this.atleta().clausula, this.atleta().clausula];
    const min = Math.min(...v);
    const span = Math.max(...v) - min || 1;
    return v.map((y, i) => `${i ? 'L' : 'M'}${(2 + (i / (v.length - 1)) * 108).toFixed(1)} ${(29 - ((y - min) / span) * 26).toFixed(1)}`).join(' ');
  });
  protected readonly resumenSerie = computed(() => {
    const v = this.serie();
    return v.length > 1 ? `Evolución de la cláusula: de ${monedas(v[0])} a ${monedas(v[v.length - 1])}` : 'Cláusula sin cambios en la jornada';
  });
  protected ptxt(p: number): string {
    return puntosTxt(p);
  }

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    afterNextRender(() => this.cerrarBtn().nativeElement.focus());
    if (browser) {
      // Sin scroll de fondo mientras la hoja está abierta.
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      inject(DestroyRef).onDestroy(() => (document.body.style.overflow = prev));
    }
  }

  /** Escape cierra; Tab y Mayús+Tab no salen de la hoja (foco atrapado). */
  protected tecla(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cerrar.emit();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [...this.panel().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    if (!focusables.length) return;
    const primero = focusables[0];
    const ultimo = focusables[focusables.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || !this.panel().nativeElement.contains(activo))) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && (activo === ultimo || !this.panel().nativeElement.contains(activo))) {
      e.preventDefault();
      primero.focus();
    }
  }

  /** Arrastrar hacia abajo desde el agarre o la cabecera: más de 110 px cierra la hoja. */
  protected empieza(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('button')) return;
    this.inicioY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  protected mueve(e: PointerEvent): void {
    if (this.inicioY === null) return;
    this.arrastre.set(Math.max(0, e.clientY - this.inicioY));
  }
  protected suelta(): void {
    if (this.inicioY === null) return;
    const d = this.arrastre();
    this.inicioY = null;
    this.arrastre.set(0);
    if (d > 110) this.cerrar.emit();
  }
}
