import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrBadge, GrButton, GrIcon, GrLogo, fmtLongDate, type GrIconName } from '@grcup/ui';
import type { CompeticionPublica } from '../core/competition';

/** Countdown to the event start in Madrid time (Figma «Countdown», fixed widths L 420 / S 312). */
@Component({
  selector: 'gr-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid w-[312px] grid-cols-4 gap-2 md:w-[420px] md:gap-3', role: 'timer', '[attr.aria-label]': 'aria()' },
  template: `
    @for (p of parts(); track p.label) {
      <div class="flex h-[76px] flex-col items-center justify-center rounded-md border border-line-subtle bg-bg-card/80 md:h-[92px]">
        <span class="text-display-s tabular-nums md:text-display-m">{{ p.value }}</span>
        <span class="text-mono-xs text-text-tertiary">{{ p.label }}</span>
      </div>
    }
  `,
})
export class Countdown {
  readonly target = input.required<string>(); // ISO date (local day start in Madrid)
  private readonly now = signal(Date.now());
  private readonly ms = computed(() => Math.max(0, new Date(this.target() + 'T08:30:00+02:00').getTime() - this.now()));
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

/** «Section / Campeonato» (Figma page 03): logo, title, event meta, countdown and the two CTAs. */
@Component({
  selector: 'gr-campeonato',
  imports: [GrLogo, GrIcon, GrButton, GrBadge, Countdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block overflow-hidden', id: 'campeonato' },
  template: `
    <div class="pointer-events-none absolute inset-0" style="background: radial-gradient(60% 50% at 30% 40%, rgb(110 20 32 / 0.35) 0%, transparent 70%)"></div>
    @let c = comp();
    <div class="relative mx-auto flex max-w-[1440px] flex-col items-center px-5 pt-32 pb-18 text-center md:px-8 md:pt-40 md:pb-24 xl:px-[120px] xl:pb-32">
      <gr-logo [height]="96" />
      <h2 class="mt-8 text-display-s md:text-display-l">Campeonato de powerlifting</h2>
      @if (subtitulo() || c?.evento?.nivel) { <p class="mt-2 text-display-2xs text-text-secondary md:text-display-xs">{{ subtitulo() || c!.evento.nivel }}</p> }
      <dl class="mt-10 flex flex-col gap-4 text-left sm:flex-row sm:flex-wrap sm:justify-center sm:gap-8">
        @for (m of meta(); track m.label) {
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon [name]="m.icon" [size]="18" /></span>
            <div><dt class="text-mono-xs text-text-tertiary">{{ m.label }}</dt><dd class="text-label-s">{{ m.value }}</dd></div>
          </div>
        }
      </dl>
      @if (c?.estado === 'proximamente') { <gr-badge tone="info" class="mt-6">Inscripciones próximamente</gr-badge> }
      @if (c?.fechaInicio && dias() >= 0) { <gr-countdown class="mt-8" [target]="c!.fechaInicio!" /> }
      <div class="mt-10 flex flex-col gap-3 sm:flex-row">
        @if (c?.modulos?.['entradas']) { <a grButton variant="primary" size="l" href="/entradas">Reserva tu entrada gratis</a> }
        @if (c?.modulos?.['atletas']) { <a grButton size="l" href="/atletas" iconRight="arrow-right">Ver atletas</a> }
      </div>
    </div>
  `,
})
export class Campeonato {
  readonly comp = input<CompeticionPublica | null>(null);
  readonly subtitulo = input('');
  protected readonly dias = computed(() => {
    const f = this.comp()?.fechaInicio;
    return f ? Math.round((new Date(f).getTime() - Date.now()) / 86_400_000) : -1;
  });
  protected readonly meta = computed(() => {
    const c = this.comp();
    if (!c) return [];
    const out: { icon: GrIconName; label: string; value: string }[] = [];
    if (c.fechaInicio) out.push({ icon: 'calendar', label: 'Fecha', value: fmtLongDate(c.fechaInicio) });
    if (c.sede?.nombre) out.push({ icon: 'map-pin', label: 'Sede', value: `${c.sede.nombre} · ${c.sede.ciudad}` });
    if (c.evento?.nivel) out.push({ icon: 'trophy', label: 'Nivel', value: c.evento.nivel });
    return out;
  });
}

/** «Patrocinadores y colaboradores» strip (logos until the CMS of step 06 manages them). */
@Component({
  selector: 'gr-sponsors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-y border-line-subtle bg-bg-deep/60' },
  template: `
    <div class="mx-auto max-w-[1440px] px-5 py-12 md:px-8 xl:px-[120px]">
      <p class="text-center text-mono-xs text-text-tertiary">Patrocinadores y colaboradores</p>
      <ul class="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
        @for (s of sponsors; track s.src) {
          <li><img [src]="s.src" [alt]="s.alt" class="h-10 w-auto opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0 md:h-12" loading="lazy" decoding="async" /></li>
        }
      </ul>
    </div>
  `,
})
export class Sponsors {
  protected readonly sponsors = [
    { src: 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/compressedAEP.webp', alt: 'AEP' },
    { src: 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_05_00.webp', alt: 'Patrocinador' },
    { src: 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_06_35.webp', alt: 'Patrocinador' },
    { src: 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_18.webp', alt: 'Patrocinador' },
    { src: 'https://jaimedigitalstudio.b-cdn.net/grcup/sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_21.webp', alt: 'Patrocinador' },
  ];
}

/** «Stats band» (Figma): headline numbers of the competition. */
@Component({
  selector: 'gr-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <dl class="mx-auto grid max-w-[1440px] grid-cols-2 gap-y-10 px-5 py-14 md:grid-cols-4 md:px-8 xl:px-[120px]">
      @for (s of stats; track s.label; let i = $index) {
        <div class="flex flex-col items-center gap-2 text-center md:border-l md:border-line-subtle md:first:border-0">
          <dd class="text-display-l" [class.text-accent-text]="i === 0">{{ s.value }}</dd>
          <dt class="text-mono-xs text-text-tertiary">{{ s.label }}</dt>
        </div>
      }
    </dl>
  `,
})
export class Stats {
  protected readonly stats = [
    { value: '150', label: 'Atletas inscritos' },
    { value: '18', label: 'Categorías de peso' },
    { value: '3', label: 'Movimientos: S · B · D' },
    { value: 'AEP', label: 'Jueces oficiales' },
  ];
}
