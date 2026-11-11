import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GrButton, GrCountdown, GrIcon, type GrIconName } from '@grcup/ui';
import type { Patrocinador } from '../core/cms';
import type { CompeticionPublica } from '../core/competition';
import { GLOW, GrEyebrow, GrTitulo } from './bloques';

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
/** «19 diciembre 2026» (Figma event meta). */
export const fechaCorta = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
};

/**
 * «Section / Campeonato» (Figma 03/05): logo L, the level as the visible title, separator, event meta, notice badge, countdown,
 * the two CTAs and the sponsors strip (an endless marquee with edge fades). It slides over the end of the hero
 * («Relevo», margin-top −400 px).
 */
@Component({
  selector: 'gr-campeonato',
  imports: [RouterLink, GrIcon, GrButton, GrCountdown, GrEyebrow, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative z-10 -mt-[400px] block motion-reduce:mt-0', id: 'campeonato' },
  template: `
    <!-- «Relevo»: the last 400 px of the hero, fading into the section -->
    <div class="pointer-events-none h-[400px] bg-[linear-gradient(180deg,transparent,#141112)] motion-reduce:hidden" aria-hidden="true"></div>
    <div class="relative overflow-hidden bg-bg-base">
    <div [class]="glow + ' top-20 left-[10%] size-[280px] md:size-[520px]'"></div>
    <div [class]="glow + ' top-[420px] right-[8%] size-[280px] md:size-[520px]'"></div>
    @let c = comp();
    <div class="relative mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-5 pt-18 pb-18 text-center md:gap-8 md:px-20 md:pt-32 md:pb-32">
      <img [src]="logo" alt="GR Strength Cup" class="h-[97px] w-auto select-none md:h-[145px]" draggable="false" />
      <!-- The hero already says «Campeonato de powerlifting»: the h2 keeps it for screen readers and shows the level -->
      <h2 class="max-w-[1024px] text-display-xs md:text-display-l">
        @if (nivel()) { <span class="sr-only">{{ titulo() }}: </span><gr-titulo [titulo]="'*' + nivel() + '*'" /> }
        @else { <gr-titulo [titulo]="titulo()" /> }
      </h2>
      <div class="h-px w-full max-w-[560px] bg-[linear-gradient(90deg,transparent,rgb(196_43_62/0.7),transparent)]" aria-hidden="true"></div>
      @if (meta().length) {
        <dl class="flex w-full flex-col gap-3 rounded-lg border border-line-subtle px-4 py-5 text-left md:w-auto md:flex-row md:flex-wrap md:justify-center md:gap-x-10 md:gap-y-4 md:rounded-none md:border-0 md:p-0">
          @for (m of meta(); track m.label) {
            <div class="flex items-center gap-3">
              <span class="flex size-11 shrink-0 items-center justify-center rounded-md border border-accent bg-accent/10 text-accent-text"><gr-icon [name]="m.icon" [size]="20" /></span>
              <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted">{{ m.label }}</dt><dd class="text-label-m">{{ m.value }}</dd></div>
            </div>
          }
        </dl>
      }
      @if (aviso()) { <span class="inline-flex h-7 items-center rounded-pill border border-info/60 bg-info/12 px-3 text-label-xs text-info">{{ aviso() }}</span> }
      @if (c?.fechaInicio) { <gr-countdown [target]="c!.fechaInicio!" [fin]="c!.fechaFin" [zona]="c!.zonaHoraria || 'Europe/Madrid'" [hora]="horaPuertas(c!.evento.puertas)" /> }
      <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        @if (c?.modulos?.['entradas'] !== false) { <a grButton variant="primary" size="l" routerLink="/entradas">Reserva tu entrada gratis</a> }
        @if (c?.modulos?.['atletas'] !== false) { <a grButton variant="glass" size="l" routerLink="/atletas" iconRight="arrow-right">Ver atletas</a> }
      </div>
      @if (patrocinadores().length) {
        <gr-eyebrow class="mt-6 md:mt-10" [texto]="tituloPatrocinadores() || 'Patrocinadores y colaboradores'" />
        <div class="relative w-full max-w-[1200px] overflow-hidden" role="list" aria-label="Patrocinadores y colaboradores">
          <!-- endless loop right to left (keyframes in tokens.css): each half repeats the logos until it is wider than 1440 px -->
          <div class="flex w-max animate-[gr-marquesina_linear_infinite] items-center hover:[animation-play-state:paused] motion-reduce:animate-none" [style.animation-duration.s]="duracion()">
            @for (p of cinta(); track $index) {
              <a role="listitem" class="shrink-0 pr-9 md:pr-[72px]" [attr.href]="p.url || null" target="_blank" rel="noopener sponsored" [attr.aria-hidden]="$index >= patrocinadores().length || null" [attr.tabindex]="$index >= patrocinadores().length ? -1 : null">
                <img [src]="p.logoUrl" [alt]="p.nombre" class="h-[34px] w-auto max-w-none opacity-90 transition-opacity hover:opacity-100 md:h-12" />
              </a>
            }
          </div>
          <div class="pointer-events-none absolute inset-y-0 left-0 w-16 bg-[linear-gradient(90deg,#141112,transparent)] md:w-[120px]"></div>
          <div class="pointer-events-none absolute inset-y-0 right-0 w-16 bg-[linear-gradient(270deg,#141112,transparent)] md:w-[120px]"></div>
        </div>
      }
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
  protected readonly glow = GLOW;
  /** Doors time («08:30») from the BO; the countdown falls back to 08:30 when it is not a HH:MM. */
  protected horaPuertas(p?: string): string {
    return /^\d{1,2}:\d{2}$/.test(p ?? '') ? p! : '08:30';
  }
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo-2026.png';
  protected readonly nivel = computed(() => this.subtitulo() || this.comp()?.evento?.nivel || '');
  /** Times the logos repeat in each half: at least 16 logos per half (≥ 2 500 px with the 72 px gap), wider than the
   *  1200 px strip, so the loop never shows an empty end. */
  private readonly veces = computed(() => Math.max(1, Math.ceil(16 / Math.max(1, this.patrocinadores().length))));
  /** Two equal halves: the track scrolls one half and starts again without a jump. */
  protected readonly cinta = computed(() => { const mitad = Array.from({ length: this.veces() }, () => this.patrocinadores()).flat(); return [...mitad, ...mitad]; });
  /** ~5 s per logo of a half: the same speed whatever the number of sponsors. */
  protected readonly duracion = computed(() => Math.max(20, this.patrocinadores().length * this.veces() * 5));
  protected readonly meta = computed(() => {
    const c = this.comp();
    if (!c) return [];
    const out: { icon: GrIconName; label: string; value: string }[] = [];
    if (c.fechaInicio) out.push({ icon: 'calendar', label: 'Fecha', value: fechasHero(c.fechaInicio, c.fechaFin).toLowerCase() });
    if (c.sede?.nombre) {
      const n = c.sede.nombre, ciudad = c.sede.ciudad ?? '';
      // «Pavelló Poliesportiu d'Almussafes» + «Almussafes» → «Pavelló Poliesportiu · Almussafes»
      const corto = ciudad && n.toLowerCase().includes(ciudad.toLowerCase()) ? n.replace(new RegExp(`\\s+(d['’]|de\\s+)?${ciudad}$`, 'i'), '') : n;
      out.push({ icon: 'map-pin', label: 'Sede', value: ciudad ? `${corto} · ${ciudad}` : corto });
    }
    // the level is the visible title: only repeated here when the title shows something else
    if (c.evento?.nivel && this.nivel() !== c.evento.nivel) out.push({ icon: 'trophy', label: 'Nivel', value: c.evento.nivel });
    return out;
  });
}
