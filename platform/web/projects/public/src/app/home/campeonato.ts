import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GrButton, GrCountdown, LOGO, cdn, CdnPipe } from '@grcup/ui';
import type { Patrocinador } from '../core/cms';
import type { CompeticionPublica } from '../core/competition';
import { GLOW, GrEyebrow } from './bloques';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** BIZ-144 hero: «19 Y 20 DICIEMBRE DE 2026» (two days) · «DEL 19 AL 22 DICIEMBRE DE 2026» (longer) ·
 *  «30 NOVIEMBRE Y 1 DICIEMBRE DE 2026» · «19 DICIEMBRE DE 2026». */
export const fechasHero = (ini?: string | null, fin?: string | null) => {
  if (!ini) return '';
  const [y, m, d] = ini.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = (fin || ini).slice(0, 10).split('-').map(Number);
  const txt = y2 !== y ? `${d} ${MESES[m - 1]} de ${y} y ${d2} ${MESES[m2 - 1]} de ${y2}`
    : m2 !== m ? `${d} ${MESES[m - 1]} y ${d2} ${MESES[m2 - 1]} de ${y}`
    : d2 - d === 1 ? `${d} y ${d2} ${MESES[m - 1]} de ${y}`
    : d2 !== d ? `del ${d} al ${d2} ${MESES[m - 1]} de ${y}` : `${d} ${MESES[m - 1]} de ${y}`;
  return txt.toUpperCase();
};

/**
 * «Section / Campeonato» (Figma 03/05): logo L, the level as the visible title, separator, event meta, notice badge, countdown,
 * the two CTAs and the sponsors strip (an endless marquee with edge fades). It slides over the end of the hero
 * («Relevo», margin-top −400 px).
 */
@Component({
  selector: 'gr-campeonato',
  imports: [CdnPipe, RouterLink, GrButton, GrCountdown, GrEyebrow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // iOS Safari paints the hero's composited sticky layer (bottom fade, clouds) over a non-composited z-index sibling:
  // its own layer (translateZ) keeps the section above it (Jaime 15-nov: title, dates and «Reserva» hidden on iPhone).
  host: { class: 'relative isolate z-10 -mt-[560px] block [transform:translate3d(0,0,0)] [will-change:transform] motion-reduce:mt-0', id: 'campeonato' },
  template: `
    <!-- «Relevo»: the last 400 px of the hero, fading into the section -->
    <div class="pointer-events-none h-[400px] bg-[linear-gradient(180deg,transparent,#141112_75%)] motion-reduce:hidden" aria-hidden="true"></div>
    <div class="relative overflow-hidden bg-bg-base">
    <div [class]="glow + ' top-20 left-[10%] size-[280px] md:size-[520px]'"></div>
    <div [class]="glow + ' top-[420px] right-[8%] size-[280px] md:size-[520px]'"></div>
    @let c = comp();
    <div class="relative mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-5 pt-2 pb-18 text-center md:gap-8 md:px-20 md:pt-6 md:pb-32">
      <!-- Figma home R2 «Cabecera evento»: logo, organiser logos in B/N (2 × 2 on mobile, one row from md), level, dates and place -->
      <img [src]="logo" alt="GRS Cup 2" class="h-[120px] w-auto select-none md:h-[200px]" draggable="false" />
      <ul class="grid w-full max-w-[350px] grid-cols-2 gap-x-5 gap-y-4 md:flex md:max-w-none md:justify-center md:gap-6" aria-label="Organizan y colaboran">
        @for (o of organizadores; track o.nombre) {
          <li class="flex h-12 min-w-0 items-center justify-center md:h-14 md:w-40"><img [src]="o.logo" [alt]="o.nombre" width="114" height="40" class="h-10 w-auto max-w-full object-contain" loading="lazy" decoding="async" /></li>
        }
      </ul>
      <div class="flex flex-col items-center gap-3 md:gap-4">
        <!-- The hero already says «Campeonato de powerlifting»: it stays as the red eyebrow; the h2 shows the level -->
        <p class="font-display text-[20px] leading-[1.25] tracking-[0.04em] text-accent-text uppercase md:text-[24px]"><span class="gr-texto-acento">{{ titulo() }}</span></p>
        <h2 class="max-w-[1024px] font-display text-[32px] leading-[1.25] tracking-[0.06em] text-text-primary [-webkit-text-fill-color:currentColor] md:text-[48px]">
          @if (nivel()) { <span class="sr-only">{{ titulo() }}: </span>{{ nivel() }} } @else { {{ titulo() }} }
        </h2>
        @if (fechas() || lugar()) {
          <p class="flex flex-col items-center gap-1">
            @if (fechas()) { <span class="font-archivo text-[14px] leading-[18px] font-extrabold tracking-[0.08em] text-text-primary [-webkit-text-fill-color:currentColor] uppercase md:text-[16px] md:leading-5">{{ fechas() }}</span> }
            @if (lugar()) { <span class="font-archivo text-[11px] leading-[14px] font-medium tracking-[0.08em] text-text-secondary [-webkit-text-fill-color:currentColor] uppercase md:text-[14px] md:leading-5">{{ lugar() }}</span> }
          </p>
        }
      </div>
      @if (aviso()) { <span class="inline-flex h-7 items-center rounded-pill border border-info/60 bg-info/12 px-3 text-label-xs text-info">{{ aviso() }}</span> }
      <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        @if (c?.modulos?.['entradas'] !== false) { <a grButton variant="primary" size="l" routerLink="/entradas" data-cta-entrada>Reserva tu entrada gratis</a> }
        @if (c?.modulos?.['atletas'] !== false) { <a grButton variant="glass" size="l" routerLink="/atletas" iconRight="arrow-right">Ver atletas</a> }
      </div>
      @if (patrocinadores().length) {
        <gr-eyebrow class="mt-6 md:mt-10" [texto]="tituloPatrocinadores() || 'Patrocinadores y colaboradores'" />
        <div class="relative w-full max-w-[1200px] overflow-hidden" role="list" aria-label="Patrocinadores y colaboradores">
          <!-- endless loop right to left (keyframes in tokens.css): each half repeats the logos until it is wider than 1440 px -->
          <div class="flex w-max animate-[gr-marquesina_linear_infinite] items-center hover:[animation-play-state:paused] motion-reduce:animate-none" [style.animation-duration.s]="duracion()">
            @for (p of cinta(); track $index) {
              <a role="listitem" class="shrink-0 pr-9 md:pr-[72px]" [attr.href]="p.url || null" target="_blank" rel="noopener sponsored" [attr.aria-hidden]="$index >= patrocinadores().length || null" [attr.tabindex]="$index >= patrocinadores().length ? -1 : null">
                @if (p.logoUrl) { <img [src]="p.logoUrl | cdn" [alt]="p.nombre" class="h-[34px] w-auto max-w-none opacity-90 transition-opacity hover:opacity-100 md:h-12" /> }
                @else { <span class="flex h-[34px] items-center text-label-m whitespace-nowrap text-text-secondary md:h-12">{{ p.nombre }}</span> }
              </a>
            }
          </div>
          <div class="pointer-events-none absolute inset-y-0 left-0 w-16 bg-[linear-gradient(90deg,#141112,transparent)] md:w-[120px]"></div>
          <div class="pointer-events-none absolute inset-y-0 right-0 w-16 bg-[linear-gradient(270deg,#141112,transparent)] md:w-[120px]"></div>
        </div>
      }
      @if (c?.fechaInicio) { <gr-countdown class="mt-2" [target]="c!.fechaInicio!" [fin]="c!.fechaFin" [zona]="c!.zonaHoraria || 'Europe/Madrid'" [hora]="horaPuertas(c!.evento.puertas)" /> }
    </div>
    </div>
  `,
})
export class Campeonato {
  readonly comp = input<CompeticionPublica | null>(null);
  readonly titulo = input('Campeonato de powerlifting');
  /** Second line of the title (the level); empty → the event's level. */
  readonly subtitulo = input('');
  /** Notice badge under the meta («Fecha por confirmar»). */
  readonly aviso = input('');
  readonly patrocinadores = input<Patrocinador[]>([]);
  readonly tituloPatrocinadores = input('');
  /** «19 Y 20 DICIEMBRE DE 2026» and «ALMUSSAFES (VALENCIA) · PAVELLÓ …» (were in the hero until R2). */
  readonly fechas = input('');
  readonly lugar = input('');
  /** Figma home R2: real organiser logos in black and white. */
  protected readonly organizadores = [
    { nombre: 'AEP · Asociación Española de Powerlifting', logo: cdn('/img/home/logo-aep-bn.webp') },
    { nombre: 'GRS Strength', logo: cdn('/img/home/logo-grs-strength-bn.webp') },
    { nombre: 'GRS Powerlifting Coaching', logo: cdn('/img/home/logo-grs-coaching-bn.webp') },
    { nombre: "Ajuntament d'Almussafes", logo: cdn('/img/home/logo-almussafes-bn.webp') },
  ];
  protected readonly glow = GLOW;
  /** Doors time («08:30») from the BO; the countdown falls back to 08:30 when it is not a HH:MM. */
  protected horaPuertas(p?: string): string {
    return /^\d{1,2}:\d{2}$/.test(p ?? '') ? p! : '08:30';
  }
  protected readonly logo = LOGO;
  protected readonly nivel = computed(() => this.subtitulo() || this.comp()?.evento?.nivel || '');
  /** Times the logos repeat in each half: at least 16 logos per half (≥ 2 500 px with the 72 px gap), wider than the
   *  1200 px strip, so the loop never shows an empty end. */
  private readonly veces = computed(() => Math.max(1, Math.ceil(16 / Math.max(1, this.patrocinadores().length))));
  /** Two equal halves: the track scrolls one half and starts again without a jump. */
  protected readonly cinta = computed(() => { const mitad = Array.from({ length: this.veces() }, () => this.patrocinadores()).flat(); return [...mitad, ...mitad]; });
  /** ~5 s per logo of a half: the same speed whatever the number of sponsors. */
  protected readonly duracion = computed(() => Math.max(20, this.patrocinadores().length * this.veces() * 5));
}
