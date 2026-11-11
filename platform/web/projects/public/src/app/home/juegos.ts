import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton } from '@grcup/ui';
import type { AtletaMercado } from '../core/juegos';
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
  destacado: { mercadoId: string; titulo: string; sexo: 'F' | 'M'; categoria?: string; bote: number; opciones: { atletaId: string; nombre: string; cuota?: number }[] } | null;
  top3: { puesto: number; alias: string; saldo: number }[];
}

/** GET /api/competiciones/{slug}/juegos/fantasy/resumen. */
export interface ResumenFantasy {
  jornada: { id: string; nombre: string; dia: string; estado: string } | null;
  equiposCreados: number;
  atletasFichados: number;
  top3: { puesto: number; alias: string; puntos: number }[];
  alineacionDestacada: { alias: string; puntos: number; atletas: { atletaId: string; nombre: string; categoria: string; puntos: number; compitiendo: boolean }[] } | null;
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

/** Eyebrow «J1 —— Juegos · Porra» of the games sections. */
@Component({
  selector: 'gr-eyebrow-juego',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-2.5' },
  template: `<span [class]="etiqueta">{{ n() }}</span><span class="h-px w-7 bg-accent/60"></span><span class="text-[12px] leading-[15px] font-medium tracking-[0.04em] text-text-secondary">{{ texto() }}</span>`,
})
export class EyebrowJuego {
  readonly n = input('');
  readonly texto = input('');
  protected readonly etiqueta = ETIQUETA;
}

/**
 * «Section / Juegos · Porra de GRS» (Figma 05-home-juegos 211:165579 · 165719 · 165859): logo, pitch and CTAs, the live
 * pot of the jornada and its top 3, and the featured open market. Consulting is free; playing needs a fan or athlete
 * session (the CTAs lead to /porra, which asks for it).
 */
@Component({
  selector: 'gr-sec-porra',
  imports: [RouterLink, GrButton, EyebrowJuego],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    @let r = resumen();
    <div [class]="ancho + ' flex flex-col gap-12'">
      <div class="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
        <div class="flex w-full flex-col items-start gap-5 lg:w-[480px] lg:shrink-0">
          <img src="/img/home/logo-porra.webp" alt="La Porra de GRS" width="280" height="145" class="h-auto w-[240px] md:w-[280px]" loading="lazy" decoding="async" />
          <gr-eyebrow-juego n="J1" texto="Juegos · Porra" />
          <h2 class="font-display text-[36px] leading-[1.25] tracking-[0.1em] md:text-[48px]">Porra de GRS</h2>
          <p class="text-body-m text-text-tertiary md:text-body-l">Apuesta monedas virtuales a la ganadora de cada categoría y al mejor de cada movimiento. Las cuotas se mueven en vivo con cada intento: acierta y escala en la clasificación de la jornada.</p>
          <p class="flex items-center gap-2 rounded-pill border border-white/10 bg-white/5 px-3 py-2 text-[13px] leading-4 font-medium text-[#d1d5db]">
            <span class="text-[10px] text-[#34d399]" aria-hidden="true">●</span>
            <span class="md:hidden">Sin dinero real · monedas virtuales</span><span class="hidden md:inline">Juego sin dinero real · las monedas no se compran ni se canjean</span>
          </p>
          <div class="flex w-full gap-3 md:w-auto">
            <a grButton variant="primary" size="l" routerLink="/porra" class="flex-1 md:flex-none">Jugar a la Porra</a>
            <a grButton variant="outline" size="l" routerLink="/porra" fragment="como-se-juega" class="flex-1 md:flex-none">Cómo se juega</a>
          </div>
          <p class="text-[13px] leading-4 text-text-muted">Para jugar necesitas cuenta de fan o de atleta · consultar es libre</p>
        </div>

        <div class="flex w-full flex-col gap-4 lg:mt-16" aria-live="polite">
          <div class="grid gap-4 md:grid-cols-2">
            <div [class]="card + ' flex flex-col gap-2.5 p-6'">
              <span [class]="etiqueta">Bote de la jornada{{ r?.jornada ? ' · ' + r!.jornada!.nombre : '' }}</span>
              <span class="flex items-baseline gap-2"><span class="font-display text-[48px] leading-[60px] tracking-[0.04em]">{{ monedas(r?.bote ?? 0) }}</span><span class="text-[14px] font-medium text-text-tertiary">monedas</span></span>
              <span class="h-1.5 overflow-hidden rounded-pill bg-white/8"><span class="block h-full rounded-pill bg-[linear-gradient(90deg,#c42b3e,#e6606b)]" [style.width.%]="r?.bote ? 100 : 0"></span></span>
              <span class="text-[13px] text-[#d1d5db]">{{ num(r?.participantes ?? 0) }} participantes · {{ r?.mercadosAbiertos ?? 0 }} mercados abiertos</span>
            </div>
            <div [class]="card + ' flex flex-col gap-2.5 self-start px-6 py-5'">
              <span class="font-mono text-[11px] leading-[15px] font-medium tracking-[0.08em] text-text-tertiary uppercase">Jornada{{ r?.jornada ? ' · ' + r!.jornada!.nombre : '' }}</span>
              <span class="font-mono text-[32px] leading-[44px] font-medium text-text-primary">{{ r?.jornada ? dia(r!.jornada!.dia) : 'Próximamente' }}</span>
              <span class="text-[13px] text-text-tertiary">{{ estado() }}</span>
            </div>
          </div>
          <div [class]="card + ' flex flex-col gap-2 p-5'">
            <span class="flex items-baseline gap-1 pb-1"><span [class]="etiqueta">Top 3 · en vivo</span><span class="text-[12px] text-text-tertiary">saldo</span></span>
            @for (f of r?.top3 ?? []; track f.puesto; let i = $index) {
              <span class="flex w-fit items-center gap-3 rounded-xl px-3 py-2.5" [class]="medalla[i].fila">
                <span class="flex size-7 items-center justify-center rounded-full font-mono text-[13px] font-medium text-bg-base" [class]="medalla[i].disco">{{ f.puesto }}</span>
                <span class="text-[15px] font-semibold">&#64;{{ f.alias }}</span>
                <span class="font-mono text-[15px] font-medium" [class]="medalla[i].saldo">{{ monedas(f.saldo) }}</span>
              </span>
            } @empty {
              <span class="py-3 text-body-s text-text-tertiary">Aún no hay apuestas en esta jornada. ¡Sé el primero en la clasificación!</span>
            }
          </div>
        </div>
      </div>

      @if (r?.destacado; as d) {
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1 md:flex-row md:items-center md:gap-0">
            <span [class]="etiqueta">Mercado abierto · {{ d.titulo }}{{ r?.jornada ? ' · ' + r!.jornada!.nombre : '' }}</span>
            <a routerLink="/porra" class="text-[14px] font-semibold text-accent-text hover:underline md:ml-1">Ver los {{ r!.mercadosAbiertos }} mercados →</a>
          </div>
          <ul class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            @for (o of d.opciones; track o.atletaId) {
              <li [class]="card + ' flex flex-col gap-3 p-5 transition-[border-color,box-shadow] hover:border-[#e6606b]/50 hover:bg-white/7 hover:shadow-[0_0_32px_rgb(230_96_107/0.28)] focus-within:border-[#e6606b] motion-reduce:transition-none'">
                <span [class]="etiqueta">{{ (d.categoria || '').replace('-', '−') }}{{ d.categoria ? ' kg · ' : '' }}{{ d.sexo }}</span>
                <span class="flex items-center gap-3">
                  <span class="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#e6606b]/50 bg-[#c42b3e]/22 font-mono text-[14px] font-medium">{{ ini(o.nombre) }}</span>
                  <span class="font-display text-[22px] leading-7 tracking-[0.04em]">{{ o.nombre }}</span>
                </span>
                <span class="flex items-end border-t border-white/8 pt-3">
                  <span class="flex flex-col"><span class="text-[10px] tracking-[0.08em] text-text-tertiary uppercase">Cuota</span><span class="font-mono text-[18px] font-medium">{{ cuota(o.cuota) }}</span></span>
                  <a routerLink="/porra" [queryParams]="{ mercado: d.mercadoId }" class="ml-1 flex items-center gap-2 rounded-pill border border-white/12 bg-white/6 px-3 py-2 text-[13px] font-semibold text-[#d1d5db] hover:bg-white/10" [attr.aria-label]="'Elegir a ' + o.nombre">
                    <span class="size-3.5 rounded-full border-[1.5px] border-white/60" aria-hidden="true"></span>Elegir
                  </a>
                </span>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class SecPorra {
  readonly resumen = input<ResumenPorra | null>(null);
  protected readonly ancho = ANCHO;
  protected readonly card = CARD;
  protected readonly etiqueta = ETIQUETA;
  protected readonly medalla = MEDALLA;
  protected readonly monedas = monedas;
  protected readonly num = num;
  protected readonly ini = iniciales;
  protected readonly cuota = cuotaTxt;
  protected readonly dia = diaCorto;
  protected readonly estado = computed(() => ({ en_juego: 'En juego ahora', abierta: 'Abierta · apuesta antes de cada flight', cerrada: 'Cerrada · mira la clasificación' } as Record<string, string>)[this.resumen()?.jornada?.estado ?? ''] ?? 'Las apuestas abren el día de la competición');
}

/**
 * «Section / Juegos · GRS Fantasy» (Figma 211:165965 · 166047 · 166129): the leader's line-up on the futsal pitch,
 * pitch, the jornada numbers and the CTAs.
 */
@Component({
  selector: 'gr-sec-fantasy',
  imports: [RouterLink, GrButton, EyebrowJuego, PistaFutsal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    <div [class]="ancho + ' flex flex-col-reverse gap-10 lg:flex-row lg:items-center lg:gap-16'">
      <div class="w-full lg:w-[680px] lg:shrink-0">
        <gr-pista-futsal [titulares]="titulares()" [puntosDe]="puntosDe" />
      </div>
      <div class="flex w-full flex-col items-start gap-5">
        <img src="/img/home/logo-fantasy.webp" alt="GRS Fantasy" width="280" height="132" class="h-auto w-[240px] md:w-[280px]" loading="lazy" decoding="async" />
        <gr-eyebrow-juego n="J2" texto="Juegos · Fantasy" />
        <h2 class="font-display text-[36px] leading-[1.25] tracking-[0.1em] md:text-[48px]">GRS Fantasy</h2>
        <p class="text-body-m text-text-tertiary md:text-body-l">Ficha a 5 atletas y forma tu alineación de fútbol sala. Cada intento válido en la tarima sube su nota y su cláusula; los nulos restan. Juega con tus amigos y pelea el palmarés del día.</p>
        <dl class="grid w-full gap-3 md:grid-cols-3">
          @for (d of datos(); track d.l) {
            <div class="flex flex-col gap-1 rounded-xl border border-white/8 bg-white/4 px-4 py-3.5">
              <dt class="order-last text-[12px] text-text-tertiary">{{ d.l }}</dt>
              <dd class="font-mono text-[22px] leading-[29px] font-medium">{{ d.v }}</dd>
            </div>
          }
        </dl>
        <div class="flex w-full gap-3 md:w-auto">
          <a grButton variant="primary" size="l" routerLink="/fantasy" class="flex-1 md:flex-none">Crear mi equipo</a>
          <a grButton variant="outline" size="l" routerLink="/fantasy/clasificacion" class="flex-1 md:flex-none">Ver clasificación</a>
        </div>
        <p class="text-[13px] leading-4 text-text-muted">Para crear tu equipo necesitas cuenta de fan o de atleta · consultar es libre</p>
      </div>
    </div>
  `,
})
export class SecFantasy {
  readonly resumen = input<ResumenFantasy | null>(null);
  protected readonly ancho = ANCHO;
  protected readonly titulares = computed<AtletaPista[]>(() =>
    (this.resumen()?.alineacionDestacada?.atletas ?? []).map((a) => ({
      atletaId: a.atletaId, nombre: a.nombre, sexo: a.categoria.startsWith('M') ? 'M' : 'F', categoria: a.categoria, clausula: 0, titular: true, protegido: false, libre: false, esMio: false, flightEnCurso: a.compitiendo,
    }) as AtletaMercado),
  );
  private readonly puntos = computed(() => new Map((this.resumen()?.alineacionDestacada?.atletas ?? []).map((a) => [a.atletaId, a.puntos])));
  protected readonly puntosDe = (a: AtletaPista) => this.puntos().get(a.atletaId) ?? null;
  protected readonly datos = computed(() => {
    const r = this.resumen();
    const lider = r?.top3[0];
    return [
      { v: num(r?.equiposCreados ?? 0), l: 'equipos creados' },
      { v: r?.jornada?.nombre ?? '—', l: r?.jornada ? 'jornada · ' + diaCorto(r.jornada.dia) : 'jornada' },
      { v: lider ? num(lider.puntos) : '—', l: lider ? 'mejor puntuación · @' + lider.alias : 'mejor puntuación' },
    ];
  });
}

