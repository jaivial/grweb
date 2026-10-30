import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import type { Patrocinador } from '../core/cms';
import type { CompeticionPublica } from '../core/competition';
import { GLOW, GrEyebrow, GrTitulo } from './bloques';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «25 julio 2026» (Figma event meta). */
export const fechaCorta = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
};

/** Countdown to the event start in Madrid time (Figma «Countdown» L 420 × 105 · S 312 × 80). */
@Component({
  selector: 'gr-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid w-[312px] grid-cols-4 gap-2 md:w-[420px] md:gap-3', role: 'timer', '[attr.aria-label]': 'aria()' },
  template: `
    @for (p of parts(); track p.label) {
      <div class="flex h-20 flex-col items-center justify-center gap-1 rounded-md border border-line-subtle bg-bg-card md:h-[105px]">
        <span class="text-display-s tabular-nums md:text-display-l">{{ p.value }}</span>
        <span class="text-label-xs text-text-muted">{{ p.label }}</span>
      </div>
    }
  `,
})
export class Countdown {
  readonly target = input.required<string>(); // ISO date (local day start in Madrid)
  private readonly now = signal(Date.now());
  private readonly ms = computed(() => Math.max(0, new Date(this.target().slice(0, 10) + 'T08:30:00+02:00').getTime() - this.now()));
  protected readonly parts = computed(() => {
    const s = Math.floor(this.ms() / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      { value: pad(Math.floor(s / 86400)), label: 'días' },
      { value: pad(Math.floor((s % 86400) / 3600)), label: 'horas' },
      { value: pad(Math.floor((s % 3600) / 60)), label: 'min' },
      { value: pad(s % 60), label: 'seg' },
    ];
  });
  protected readonly aria = computed(() => `Faltan ${this.parts()[0].value} días y ${this.parts()[1].value} horas`);
  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (!browser) return;
      const t = setInterval(() => this.now.set(Date.now()), 1000);
      destroy.onDestroy(() => clearInterval(t));
    });
  }
}

/**
 * «Section / Campeonato» (Figma 03/05): logo L, title with the level, separator, event meta, notice badge, countdown,
 * the two CTAs and the sponsors strip (an endless marquee with edge fades). It slides over the end of the hero
 * («Relevo», margin-top −400 px).
 */
@Component({
  selector: 'gr-campeonato',
  imports: [GrIcon, GrButton, Countdown, GrEyebrow, GrTitulo],
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
      <h2 class="max-w-[1024px] text-display-xs md:text-display-l">
        <gr-titulo [titulo]="titulo() + (nivel() ? '|' + nivel() : '')" />
      </h2>
      <div class="h-px w-full max-w-[560px] bg-[linear-gradient(90deg,transparent,rgb(196_43_62/0.7),transparent)]" aria-hidden="true"></div>
      @if (meta().length) {
        <dl class="flex w-full flex-col gap-3 rounded-lg border border-line-subtle px-4 py-5 text-left md:w-auto md:flex-row md:justify-center md:gap-10 md:rounded-none md:border-0 md:p-0">
          @for (m of meta(); track m.label) {
            <div class="flex items-center gap-3">
              <span class="flex size-11 shrink-0 items-center justify-center rounded-md border border-accent bg-accent/10 text-accent-text"><gr-icon [name]="m.icon" [size]="20" /></span>
              <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted">{{ m.label }}</dt><dd class="text-label-m">{{ m.value }}</dd></div>
            </div>
          }
        </dl>
      }
      @if (aviso()) { <span class="inline-flex h-7 items-center rounded-pill border border-info/60 bg-info/12 px-3 text-label-xs text-info">{{ aviso() }}</span> }
      @if (c?.fechaInicio && dias() >= 0) { <gr-countdown [target]="c!.fechaInicio!" /> }
      <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        @if (c?.modulos?.['entradas'] !== false) { <a grButton variant="primary" size="l" href="/entradas">Reserva tu entrada gratis</a> }
        @if (c?.modulos?.['atletas'] !== false) { <a grButton variant="glass" size="l" href="/atletas" iconRight="arrow-right">Ver atletas</a> }
      </div>
      @if (patrocinadores().length) {
        <gr-eyebrow class="mt-6 md:mt-10" [texto]="tituloPatrocinadores() || 'Patrocinadores y colaboradores'" />
        <div class="relative w-full max-w-[1200px] overflow-hidden" role="list" aria-label="Patrocinadores y colaboradores">
          <div class="flex w-max animate-[gr-marquesina_40s_linear_infinite] items-center gap-9 hover:[animation-play-state:paused] motion-reduce:animate-none md:gap-[72px]">
            @for (p of cinta(); track $index) {
              <a role="listitem" [attr.href]="p.url || null" target="_blank" rel="noopener sponsored" [attr.aria-hidden]="$index >= patrocinadores().length || null" [attr.tabindex]="$index >= patrocinadores().length ? -1 : null">
                <img [src]="p.logoUrl" [alt]="p.nombre" class="h-[34px] w-auto max-w-none opacity-90 transition-opacity hover:opacity-100 md:h-12" loading="lazy" />
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
  styles: [`@keyframes gr-marquesina { from { transform: translateX(0); } to { transform: translateX(-50%); } }`],
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
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png';
  protected readonly nivel = computed(() => this.subtitulo() || this.comp()?.evento?.nivel || '');
  /** The logos twice: the track scrolls half its width and starts again without a jump. */
  protected readonly cinta = computed(() => [...this.patrocinadores(), ...this.patrocinadores()]);
  protected readonly dias = computed(() => {
    const f = this.comp()?.fechaInicio;
    return f ? Math.round((new Date(f).getTime() - Date.now()) / 86_400_000) : -1;
  });
  protected readonly meta = computed(() => {
    const c = this.comp();
    if (!c) return [];
    const out: { icon: GrIconName; label: string; value: string }[] = [];
    if (c.fechaInicio) out.push({ icon: 'calendar', label: 'Fecha', value: fechaCorta(c.fechaInicio) });
    if (c.sede?.nombre) {
      const n = c.sede.nombre, ciudad = c.sede.ciudad ?? '';
      // «Pavelló Poliesportiu d'Almussafes» + «Almussafes» → «Pavelló Poliesportiu · Almussafes»
      const corto = ciudad && n.toLowerCase().includes(ciudad.toLowerCase()) ? n.replace(new RegExp(`\\s+(d['’]|de\\s+)?${ciudad}$`, 'i'), '') : n;
      out.push({ icon: 'map-pin', label: 'Sede', value: ciudad ? `${corto} · ${ciudad}` : corto });
    }
    if (c.evento?.nivel) out.push({ icon: 'trophy', label: 'Nivel', value: c.evento.nivel });
    return out;
  });
}
