import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GrButton, CdnPipe } from '@grcup/ui';
import type { AtletaMercado, Nota } from '../core/juegos';
import { iniciales } from '../pages/porra/componentes';
import { monedas } from '../pages/porra/formato';
import { PistaFutsal, type AtletaPista } from '../pages/fantasy/pista';
import { ANCHO, SECCION } from './bloques';

/** GET /api/competiciones/{slug}/juegos/porra/resumen (internal/juegos/resumen.go). */
export interface ResumenPorra {
  jornada: { id: string; nombre: string; dia: string; estado: string } | null;
  bote: number;
  participantes: number;
  mercadosAbiertos: number;
  /** Close of the bets of the jornada (backoffice «hora de cierre»); null without it. */
  cierreAt: string | null;
  destacado: { mercadoId: string; titulo: string; sexo: 'F' | 'M'; categoria?: string; bote: number; opciones: { atletaId: string; nombre: string; cuota?: number }[] } | null;
  top3: { puesto: number; alias: string; saldo: number }[];
}

/** GET /api/competiciones/{slug}/juegos/fantasy/resumen. */
export interface ResumenFantasy {
  jornada: { id: string; nombre: string; dia: string; estado: string } | null;
  equiposCreados: number;
  atletasFichados: number;
  /** Leader of the jornada and their average score per jornada (Figma «mejor nota»). */
  mejorNota: { alias: string; notaMedia: number } | null;
  top3: { puesto: number; alias: string; nota: number }[];
  alineacionDestacada: { alias: string; nota: number; atletas: { atletaId: string; nombre: string; categoria: string; nota: Nota; compitiendo: boolean }[] } | null;
}

/** «sáb 21 nov». */
const diaCorto = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).replace(/\./g, '').replace(',', '') : '');
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const cuotaTxt = (c?: number) => (c ? '×' + c.toFixed(2).replace('.', ',') : '—');

/** Figma «Card» of the games (white 4 % · hairline white 8 % · radius 16). */
const CARD = 'rounded-2xl border border-white/8 bg-white/4';
const ETIQUETA = 'font-mono text-[11px] leading-[15px] font-medium tracking-[0.08em] text-accent-text uppercase';
const MEDALLA = [
  { fila: 'bg-[#f5c451]/12', disco: 'bg-[#f5c451]', saldo: 'text-[#f5c451]' },
  { fila: 'bg-[#c0c7d1]/6', disco: 'bg-[#c0c7d1]', saldo: 'text-text-secondary' },
  { fila: 'bg-[#cd8b5a]/6', disco: 'bg-[#cd8b5a]', saldo: 'text-[#cd8b5a]' },
];

/**
 * «Section / Juegos · Porra de GRS» (Figma 05-home-juegos 211:165579 · 165719 · 165859): logo, pitch and CTAs, the live
 * pot of the jornada and its top 3, and the featured open market. Consulting is free; playing needs a fan or athlete
 * session (the CTAs lead to /porra, which asks for it).
 */
@Component({
  selector: 'gr-sec-porra',
  imports: [CdnPipe, RouterLink, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    @let r = resumen();
    <div [class]="ancho + ' flex flex-col gap-12'">
      <!-- Figma home R2 (393:144517 · 211:165859): centred header (logo, text with «i», CTAs) and three centred cards -->
      <div class="flex flex-col items-center gap-5 text-center">
        <img [src]="'/img/home/logo-porra.webp' | cdn" alt="" width="280" height="145" class="h-auto w-[240px] md:w-[280px]" loading="lazy" decoding="async" />
        <p class="sr-only">J1 · Juegos · Porra</p>
        <h2 class="sr-only">La Porra de GRS</h2>
        <div class="relative flex max-w-[640px] items-start gap-3 text-left md:items-center md:text-center">
          <p class="text-body-m text-text-tertiary md:text-body-l">Apuesta monedas virtuales a la ganadora de cada categoría y al mejor de cada movimiento.</p>
          <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/6 font-serif text-[14px] font-semibold text-text-primary hover:bg-white/12" aria-label="Más información sobre la porra" [attr.aria-expanded]="info()" aria-controls="porra-info" (click)="info.set(!info())">i</button>
        </div>
        @if (info()) {
          <p id="porra-info" class="max-w-[560px] rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body-s text-[#d1d5db]">Las cuotas se mueven en vivo con cada intento: acierta y escala en la clasificación de la jornada. Juego sin dinero real: las monedas no se compran ni se canjean.</p>
        }
        <div class="flex w-full min-w-0 justify-center gap-3 max-[379px]:flex-col md:w-auto">
          <a grButton variant="primary" size="l" routerLink="/porra" class="min-w-0 flex-1 basis-0 px-4! max-md:text-[15px]! md:flex-none md:basis-auto">Jugar a la Porra</a>
          <a grButton variant="outline" size="l" routerLink="/porra" fragment="como-se-juega" class="min-w-0 flex-1 basis-0 px-4! max-md:text-[15px]! md:flex-none md:basis-auto">Cómo se juega</a>
        </div>
        <p class="text-[13px] leading-4 text-text-muted">Para jugar necesitas cuenta de fan o de atleta · consultar es libre</p>
      </div>

      <div class="grid gap-4 md:grid-cols-3 md:gap-6" aria-live="polite">
        <div [class]="card + ' flex min-w-0 flex-col items-center justify-center gap-2.5 p-6 text-center'">
          <span [class]="etiqueta">Bote de la jornada{{ r?.jornada ? ' · ' + r!.jornada!.nombre : '' }}</span>
          <span class="flex min-w-0 flex-wrap items-baseline justify-center gap-x-2"><span class="min-w-0 font-display text-[clamp(32px,10vw,48px)] leading-[1.25] tracking-[0.04em]">{{ monedas(r?.bote ?? 0) }}</span><span class="text-[14px] font-medium text-text-tertiary">monedas</span></span>
          <span class="h-1.5 w-full overflow-hidden rounded-pill bg-white/8"><span class="block h-full rounded-pill bg-[linear-gradient(90deg,#c42b3e,#e6606b)]" [style.width.%]="r?.bote ? 100 : 0"></span></span>
          <span class="text-[13px] text-[#d1d5db]">{{ num(r?.participantes ?? 0) }} participantes{{ cerrada() ? ' · apuestas cerradas' : '' }}</span>
        </div>
        @if (cuenta(); as t) {
          <!-- Figma «Cierre de apuestas»: h · min · s until the close set in the backoffice -->
          <div [class]="card + ' flex min-w-0 flex-col items-center justify-center gap-2.5 px-6 py-5 text-center'" role="timer" [attr.aria-label]="'Las apuestas cierran en ' + t.h + ' horas y ' + t.m + ' minutos'">
            <span class="max-w-full truncate font-mono text-[11px] leading-[15px] font-medium tracking-[0.08em] text-text-tertiary uppercase">Cierre de apuestas{{ r?.jornada ? ' · ' + r!.jornada!.nombre : '' }}</span>
            <span class="flex items-start justify-center gap-3 font-mono font-medium text-text-primary" aria-hidden="true">
              @for (p of [{ v: t.h, l: 'h' }, { v: t.m, l: 'min' }, { v: t.s, l: 's' }]; track p.l; let last = $last) {
                <span class="flex flex-col items-center gap-1"><span class="text-[32px] leading-[44px] tabular-nums">{{ p.v }}</span><span class="text-[11px] text-text-tertiary">{{ p.l }}</span></span>
                @if (!last) { <span class="text-[22px] leading-[44px] text-text-muted">:</span> }
              }
            </span>
          </div>
        } @else {
          <div [class]="card + ' flex min-w-0 flex-col items-center justify-center gap-2.5 px-6 py-5 text-center'">
            <span class="max-w-full truncate font-mono text-[11px] leading-[15px] font-medium tracking-[0.08em] text-text-tertiary uppercase">Jornada{{ r?.jornada ? ' · ' + r!.jornada!.nombre : '' }}</span>
            <span class="font-mono text-[28px] leading-[44px] font-medium text-text-primary">{{ r?.jornada ? dia(r!.jornada!.dia) : 'Próximamente' }}</span>
            <span class="text-[13px] text-text-tertiary">{{ estado() }}</span>
          </div>
        }
        <div [class]="card + ' flex min-w-0 flex-col items-center gap-2 p-5 text-center'">
          <span class="flex items-center gap-2 pb-1 font-display text-[24px] leading-[1.25] tracking-[0.04em]"><span class="size-2 rounded-full bg-accent shadow-[0_0_8px_#c42b3e]" aria-hidden="true"></span>Top 3 <span class="bg-accent-grain bg-clip-text text-transparent">en vivo</span></span>
          @for (f of r?.top3 ?? []; track f.puesto; let i = $index) {
            <span class="flex w-full max-w-[240px] min-w-0 items-center gap-3 rounded-xl px-3 py-2.5" [class]="medalla[i].fila">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-medium text-bg-base" [class]="medalla[i].disco">{{ f.puesto }}</span>
              <span class="min-w-0 flex-1 truncate text-left text-[15px] font-semibold" [title]="'@' + f.alias">&#64;{{ f.alias }}</span>
              <span class="shrink-0 font-mono text-[15px] font-medium" [class]="medalla[i].saldo">{{ monedas(f.saldo) }}</span>
            </span>
          } @empty {
            <span class="py-3 text-body-s text-text-tertiary">Aún no hay apuestas en esta jornada. ¡Sé el primero en la clasificación!</span>
          }
        </div>
      </div>

    </div>
  `,
})
export class SecPorra {
  readonly resumen = input<ResumenPorra | null>(null);
  /** «i» next to the pitch: the rest of the rules (live odds, no real money). */
  protected readonly info = signal(false);
  private readonly ahora = signal(Date.now());
  constructor() {
    const destroy = inject(DestroyRef);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    afterNextRender(() => {
      if (!browser) return;
      const t = setInterval(() => this.ahora.set(Date.now()), 1000);
      destroy.onDestroy(() => clearInterval(t));
    });
  }
  /** «02 : 14 : 37» until the close; null when there is no close or it already passed (the jornada card shows). */
  protected readonly cuenta = computed(() => {
    const c = this.resumen()?.cierreAt;
    const ms = c ? Date.parse(c) - this.ahora() : 0;
    if (!(ms > 0)) return null;
    const s = Math.floor(ms / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { h: pad(Math.floor(s / 3600)), m: pad(Math.floor((s % 3600) / 60)), s: pad(s % 60) };
  });
  /** The close of the bets already passed (cierreAt in the past): no more bets. */
  protected readonly cerrada = computed(() => {
    const c = this.resumen()?.cierreAt;
    return !!c && Date.parse(c) <= this.ahora();
  });
  protected readonly ancho = ANCHO;
  protected readonly card = CARD;
  protected readonly etiqueta = ETIQUETA;
  protected readonly medalla = MEDALLA;
  protected readonly monedas = monedas;
  protected readonly num = num;
  protected readonly ini = iniciales;
  protected readonly cuota = cuotaTxt;
  protected readonly dia = diaCorto;
  protected readonly estado = computed(() => this.cerrada() ? 'Apuestas cerradas · mira la clasificación' : ({ en_juego: 'En juego ahora', abierta: 'Abierta · apuesta antes de cada flight', cerrada: 'Cerrada · mira la clasificación' } as Record<string, string>)[this.resumen()?.jornada?.estado ?? ''] ?? 'Las apuestas abren el día de la competición');
}

/**
 * «Section / Juegos · GRS Fantasy» (Figma 211:165965 · 166047 · 166129): the leader's line-up on the futsal pitch,
 * pitch, the jornada numbers and the CTAs.
 */
@Component({
  selector: 'gr-sec-fantasy',
  imports: [CdnPipe, RouterLink, GrButton, PistaFutsal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    <!-- Figma home R2 (393:144584 · 211:166129): centred stack — logo, title, pitch, text, CTAs -->
    <div [class]="ancho + ' flex flex-col items-center gap-6 text-center'">
      <img [src]="'/img/home/logo-fantasy.webp' | cdn" alt="" width="280" height="132" class="h-auto w-[240px] md:w-[240px]" loading="lazy" decoding="async" />
      <p class="sr-only">J2 · Juegos · Fantasy</p>
      <h2 class="sr-only">GRS Fantasy</h2>
      <div class="w-full max-w-[490px]">
        <gr-pista-futsal [titulares]="titulares()" [rojo]="true" (abrir)="router.navigateByUrl('/fantasy')" />
      </div>
      <p class="max-w-[760px] text-body-m text-text-tertiary md:text-body-l">Ficha a 5 atletas y forma tu alineación de fútbol sala. Cada intento válido en la tarima sube su nota y su cláusula; los nulos restan. Juega en salas con tus amigos y pelea el palmarés del día.</p>
      <div class="flex w-full justify-center gap-3 md:w-auto">
        <a grButton variant="primary" size="l" routerLink="/fantasy" class="flex-1 md:flex-none">Crear mi equipo</a>
        <!-- Figma «Ver salas»: /fantasy until /fantasy/salas exists -->
        <a grButton variant="outline" size="l" routerLink="/fantasy" class="flex-1 md:flex-none">Ver salas</a>
      </div>
      <p class="text-[13px] leading-4 text-text-muted">Para crear tu equipo necesitas cuenta de fan o de atleta · consultar es libre</p>
    </div>
  `,
})
export class SecFantasy {
  readonly resumen = input<ResumenFantasy | null>(null);
  protected readonly router = inject(Router);
  protected readonly ancho = ANCHO;
  protected readonly titulares = computed<AtletaPista[]>(() =>
    (this.resumen()?.alineacionDestacada?.atletas ?? []).map((a) => ({
      atletaId: a.atletaId, nombre: a.nombre, sexo: a.categoria.startsWith('M') ? 'M' : 'F', categoria: a.categoria, clausula: 0, titular: true, protegido: false, libre: false, esMio: false, sesionEnCurso: a.compitiendo, nota: a.nota,
    }) as AtletaMercado),
  );

}

