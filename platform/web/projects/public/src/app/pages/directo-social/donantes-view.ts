import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Donaciones, type DonantesRanking } from '../../core/donaciones';
import { diaDeHoy, etiquetaDia } from '../../core/chat';
import type { Horarios } from '../../core/horarios';
import { COMPETITION_SLUG } from '../../core/competition';
import { I18n } from '../../core/i18n';
import { Juegos, type Jornada, type Premio } from '../../core/juegos';
import { MEDALLA } from './ui';

/** «1.480 €» (sin decimales: los totales del día). */
const euros0 = (loc: string) => new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** «4,74 €» */
const euros2 = (loc: string) => new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const T = {
  es: {
    jornada: 'Jornada', hoy: 'Hoy · en directo', reintenta: 'Vuelve a intentarlo en unos segundos.', premio: 'Premio', patrocina: 'Patrocina ',
    entra: 'Entra en el ranking del día', cada: 'Cada donativo sale en el chat y suma al ranking.',
    recaudadoHoy: 'Recaudado hoy', recaudado: 'Recaudado · ',
    donativos: (n: number) => n + ' ' + (n === 1 ? 'donativo' : 'donativos'), media: ' · media ',
    apoya: 'Apoya la GRS Cup', ranking: 'Ranking del día',
    sinDonativos: (hoy: boolean) => 'Todavía no hay donativos ' + (hoy ? 'hoy' : 'en esta jornada'), primero: 'El primero en donar encabeza el ranking.',
    donar: 'Donar y entrar en el ranking', seguro: 'Pago seguro · no guardamos tu tarjeta', inactivo: 'Las donaciones aún no están activas. Vuelve en unos días.',
    error: 'No hemos podido cargar el ranking de donantes.',
    eyebrow: (n: number) => (n === 1 ? '1.er donante del día' : `${n}.º donante del día`),
  },
  en: {
    jornada: 'Matchday', hoy: 'Today · live', reintenta: 'Try again in a few seconds.', premio: 'Prize', patrocina: 'Sponsored by ',
    entra: 'Get into today’s ranking', cada: 'Every donation appears in the chat and counts towards the ranking.',
    recaudadoHoy: 'Raised today', recaudado: 'Raised · ',
    donativos: (n: number) => n + ' ' + (n === 1 ? 'donation' : 'donations'), media: ' · average ',
    apoya: 'Support the GRS Cup', ranking: 'Today’s ranking',
    sinDonativos: (hoy: boolean) => 'No donations ' + (hoy ? 'today' : 'on this matchday') + ' yet', primero: 'The first to donate tops the ranking.',
    donar: 'Donate and join the ranking', seguro: 'Secure payment · we do not store your card', inactivo: 'Donations are not open yet. Check back in a few days.',
    error: 'We could not load the donor ranking.',
    eyebrow: (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'} donor of the day`,
  },
};

/**
 * Pestaña «Donantes» del panel del directo (Figma 171:69928 en jornada, 393:120815 fuera de jornada): sub-pestañas por
 * jornada (días de los horarios), el premio como gancho, lo recaudado y el ranking de la jornada elegida.
 */
@Component({
  selector: 'gr-donantes-view',
  imports: [GrIcon, GrButton, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  styles: `
    .gr-sub { transition: background-color 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out; }
    @keyframes gr-sub-fade { from { opacity: 0; } to { opacity: 1; } }
    .gr-sub-fade { animation: gr-sub-fade 120ms ease-out both; }
    @media (prefers-reduced-motion: reduce) { .gr-sub { transition: none; } .gr-sub-fade { animation: none; } }
  `,
  template: `
    @if (dias().length) {
      <div class="flex shrink-0 gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none]" role="tablist" [attr.aria-label]="t().jornada">
        @for (d of dias(); track d) {
          <button type="button" role="tab" [attr.aria-selected]="d === diaSel()" class="gr-sub inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-label-s"
            [class]="d === diaSel() ? 'border-accent/60 bg-accent-deep/35 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted hover:text-text-primary'" (click)="elegido.set(d)">
            @if (d === hoy) { <span class="size-1.5 rounded-full bg-accent shadow-[0_0_6px_rgb(196_43_62/0.8)]" aria-hidden="true"></span>{{ t().hoy }} }
            @else { {{ corto(d) }} }
          </button>
        }
      </div>
    }
    @for (k of [diaSel()]; track k) {
    <div class="gr-sub-fade flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]">
      @if (cargando() && !ranking()) {
        <gr-skeleton class="h-44 shrink-0 rounded-lg" /><gr-skeleton class="h-24 shrink-0 rounded-md" /><gr-skeleton class="h-64 shrink-0 rounded-md" />
      } @else if (error()) {
        <div class="flex flex-col items-center gap-2 py-10 text-center">
          <span class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-text-tertiary"><gr-icon name="circle-alert" [size]="18" /></span>
          <p class="text-label-s text-text-primary">{{ error() }}</p>
          <p class="text-body-xs text-text-tertiary">{{ t().reintenta }}</p>
        </div>
      } @else {
        <!-- gancho: el premio del 1.er donante (o la invitación si la jornada no tiene premios) -->
        @if (primero(); as p) {
          <article class="shrink-0 overflow-hidden rounded-lg border border-[#d4af37]/35 bg-bg-card">
            <div class="relative flex min-h-[184px] flex-col justify-between overflow-hidden bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-4">
              @if (imagenPremio(p); as img) { <img [src]="img" [alt]="p.titulo" class="absolute inset-0 size-full object-cover" loading="lazy" (error)="falloImagen(p.id)" /> }
              @else { <gr-icon name="gift" [size]="96" class="absolute top-1/2 right-5 -translate-y-1/2 text-accent-text/25" /> }
              <span class="absolute inset-0 bg-[linear-gradient(90deg,rgb(14_12_13/0.95),rgb(23_12_14/0.7)_50%,rgb(23_12_14/0.05))]" aria-hidden="true"></span>
              <span class="relative inline-flex h-6 w-fit items-center gap-1.5 rounded-pill border border-[#d4af37]/50 bg-[#d4af37]/15 pr-2.5 pl-2 font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-[#e3c25a] uppercase">
                <gr-icon name="trophy" [size]="12" />{{ t().premio }} · {{ eyebrow() }}</span>
              <div class="relative mt-6 max-w-[240px]">
                <p class="font-display text-[24px] leading-[1.1] break-words text-text-primary uppercase italic [overflow-wrap:anywhere]">{{ p.titulo }}</p>
                @if (p.patrocinador) { <p class="mt-1 text-body-xs text-text-secondary">{{ t().patrocina }}{{ p.patrocinador }}</p> }
              </div>
            </div>
            @if (premios().length > 1) {
              <ul class="flex flex-col gap-1 px-3 pt-2 pb-3">
                @for (q of premios().slice(1, 3); track q.id) {
                  <li class="flex items-center gap-2.5 px-1 py-1.5">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium" [class]="medalla(q.puestoDesde)">{{ q.puestoDesde }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-label-s break-words text-text-primary [overflow-wrap:anywhere]">{{ q.titulo }}</span>
                      @if (q.patrocinador) { <span class="block truncate text-body-xs text-text-tertiary">{{ t().patrocina }}{{ q.patrocinador }}</span> }
                    </span>
                  </li>
                }
              </ul>
            }
          </article>
        }
        <div class="flex shrink-0 items-start gap-2.5">
          <gr-icon name="trophy" [size]="14" class="mt-0.5 shrink-0 text-[#e3c25a]" />
          <div class="min-w-0">
            <p class="text-label-s text-text-primary">{{ t().entra }}</p>
            <p class="text-body-xs text-text-secondary">{{ t().cada }}</p>
          </div>
        </div>

        <!-- recaudado -->
        <div class="flex shrink-0 items-center gap-3 rounded-md border border-accent/35 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-4">
          <div class="min-w-0 flex-1">
            <p class="font-mono text-[11px] font-medium tracking-[0.08em] text-accent-text uppercase">{{ diaSel() === hoy || !diaSel() ? t().recaudadoHoy : t().recaudado + corto(diaSel()) }}</p>
            <p class="mt-1 font-display text-[36px] leading-none text-text-primary italic">{{ euros0(ranking()?.totalRecaudado ?? 0) }}</p>
            <p class="mt-1.5 text-body-xs text-text-secondary">{{ t().donativos(donativos()) }}{{ t().media }}{{ media() }}</p>
          </div>
          <button type="button" class="flex w-[104px] shrink-0 flex-col items-center gap-1 rounded-sm bg-black/25 px-3 py-2.5 text-center text-body-xs text-text-secondary transition-colors hover:bg-black/40 hover:text-text-primary" (click)="donar.emit()">
            <gr-icon name="heart" [size]="18" class="text-accent-text" />{{ t().apoya }}
          </button>
        </div>

        <!-- ranking -->
        <div class="shrink-0">
          <p class="flex items-center justify-between gap-2 pt-1"><span class="text-label-s text-text-primary">{{ t().ranking }}</span><span class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ dia() }}</span></p>
          @if (!ranking()?.items?.length) {
            <div class="mt-3 flex flex-col items-center gap-1.5 rounded-md border border-dashed border-line-strong px-4 py-6 text-center">
              <p class="text-label-s text-text-primary">{{ t().sinDonativos(diaSel() === hoy || !diaSel()) }}</p>
              <p class="text-body-xs text-text-tertiary">{{ t().primero }}</p>
            </div>
          } @else {
            <ol class="mt-2 flex flex-col gap-0.5">
              @for (d of ranking()!.items; track d.puesto) {
                <li class="flex min-h-14 items-center gap-3 rounded-md px-3 py-2" [class]="d.puesto === 1 ? 'border border-[#d4af37]/25 bg-[#d4af37]/7' : ''">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-full border" [class]="d.puesto <= 3 ? medalla(d.puesto) + ' text-label-s' : 'border-line-strong font-mono text-[13px] text-text-tertiary'">{{ d.puesto }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-label-s text-text-primary">{{ d.alias }}</span>
                    <span class="block text-body-xs text-text-tertiary">{{ t().donativos(d.donativos) }}</span>
                  </span>
                  <span [class]="d.puesto === 1 ? 'text-label-m text-[#e3c25a]' : 'font-mono text-[13px] text-text-primary'">{{ euros0(d.total) }}</span>
                </li>
              }
            </ol>
          }
        </div>
      }
    </div>
    }
    <div class="shrink-0 border-t border-line-subtle px-4 pt-3 pb-4">
      @if (activo()) {
        <button type="button" grButton variant="primary" size="l" [block]="true" icon="heart" (click)="donar.emit()">{{ t().donar }}</button>
        <p class="mt-2 flex items-center justify-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />{{ t().seguro }}</p>
      } @else {
        <!-- UX4-R1-2: no primary CTA for a module that is off -->
        <p class="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-body-s text-warning" role="status"><gr-icon name="triangle-alert" [size]="16" class="mt-0.5 shrink-0" />{{ t().inactivo }}</p>
      }
    </div>
  `,
})
export class DonantesView {
  private readonly don = inject(Donaciones);
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  /** Donations are on (until the config says otherwise). */
  protected readonly activo = computed(() => this.don.config()?.activo !== false);

  private readonly juegos = inject(Juegos);
  /** Day of the panel (fallback when the schedule has no days). */
  readonly diaSala = input<string>('');
  /** Id of the panel's jornada (fallback for the prizes when the day has no game jornada). */
  readonly jornadaId = input<string>('');

  /** Today (Europe/Madrid) of the panel: the day the donors tab passes to its view (moves at midnight). Without it, the clock. */
  protected get hoy(): string {
    return this.diaSala() || diaDeHoy();
  }
  /** Days of the competition (from the public schedule), sorted. */
  protected readonly dias = signal<string[]>([]);
  private readonly jornadas = signal<Jornada[]>([]);
  /** Sub-tab chosen by the fan (null = default). */
  protected readonly elegido = signal<string | null>(null);
  /** Day shown: chosen → today if it is a jornada → first jornada → the panel's day. */
  protected readonly diaSel = computed(() => {
    const d = this.dias();
    return this.elegido() ?? (d.includes(this.hoy) ? this.hoy : (d[0] ?? this.diaSala()));
  });
  private readonly jornadaSel = computed(() => (this.dias().length ? (this.jornadas().find((j) => j.dia === this.diaSel())?.id ?? '') : this.jornadaId()));
  /** The fan wants to donate (the panel opens the dialog). */
  readonly donar = output<void>();

  /** Ranking of the day shown (the shared one may be refreshed for another day by the panel). */
  protected readonly ranking = signal<DonantesRanking | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly premios = signal<Premio[]>([]);
  protected readonly primero = computed(() => this.premios()[0]);
  protected readonly dia = computed(() => (this.diaSel() ? etiquetaDia(this.diaSel(), this.i18n.lang()) : ''));
  /** Average donation (from the ranking: the API only returns the top 20). */
  protected readonly media = computed(() => {
    const r = this.ranking();
    const donativos = (r?.items ?? []).reduce((s, d) => s + d.donativos, 0);
    const f = euros2(this.i18n.locale());
    return donativos ? f.format((r?.totalRecaudado ?? 0) / 100 / donativos) : f.format(0);
  });
  /** The image of the prize failed: the brand block is shown instead. */
  private readonly imagenFalla = signal<ReadonlySet<string>>(new Set());

  constructor() {
    if (!this.don.config()) void this.don.cargarConfig();
    // straight GET (not HorariosPublic): a schedule failure must not turn the page into a 503, the tab just has no sub-tabs
    firstValueFrom(this.http.get<Horarios>(`/api/competiciones/${COMPETITION_SLUG}/horarios`)).then(
      (h) => this.dias.set([...new Set((h?.dias ?? []).map((d) => d.fecha.slice(0, 10)))].sort()),
      () => this.dias.set([]),
    );
    void this.juegos.jornadas().then((l) => this.jornadas.set(l), () => this.jornadas.set([]));
    effect(() => {
      const dia = this.diaSel();
      this.cargando.set(true);
      this.ranking.set(null);
      void this.don.cargarRanking(dia || undefined).then((r) => {
        if (dia !== untracked(this.diaSel)) return; // a newer day was chosen meanwhile
        this.ranking.set(r);
        this.error.set(r ? null : untracked(this.t).error);
        this.cargando.set(false);
      });
    });
    // live refresh: this tab has no chat socket (each tab only talks to its own service), so the ranking of the day
    // shown is re-read every 30 s while the tab is open and visible; the shared signal below still applies
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const t = setInterval(() => {
        if (document.hidden) return;
        const dia = this.diaSel();
        void this.don.cargarRanking(dia || undefined);
      }, 30_000);
      inject(DestroyRef).onDestroy(() => clearInterval(t));
    }
    effect(() => {
      const r = this.don.ranking();
      if (r && r.dia === untracked(this.diaSel)) this.ranking.set(r);
    });
    effect(() => {
      void this.cargarPremios(this.jornadaSel());
    });
  }

  /** Los premios de los donantes (`?ranking=donantes`); con el backend antiguo, se filtran en el cliente. */
  private async cargarPremios(jornadaId: string): Promise<void> {
    const base = `/api/competiciones/${COMPETITION_SLUG}/juegos/premios`;
    const con = new URLSearchParams();
    if (jornadaId) con.set('jornada', jornadaId);
    con.set('ranking', 'donantes');
    try {
      const r = await firstValueFrom(this.http.get<{ premios: Premio[] }>(`${base}?${con.toString()}`));
      this.premios.set(r.premios ?? []);
    } catch {
      const sin = new URLSearchParams();
      if (jornadaId) sin.set('jornada', jornadaId);
      try {
        const r = await firstValueFrom(this.http.get<{ premios: Premio[] }>(`${base}?${sin.toString()}`));
        this.premios.set((r.premios ?? []).filter((p) => p.ranking === 'donantes'));
      } catch {
        this.premios.set([]);
      }
    }
  }

  /** «Sáb 19» */
  protected corto(dia: string): string {
    const d = new Date(dia + 'T12:00:00Z');
    if (isNaN(d.getTime())) return dia;
    const s = new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(d).replace(',', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  protected falloImagen(id: string): void {
    this.imagenFalla.update((s) => (s.has(id) ? s : new Set(s).add(id)));
  }

  /** La imagen del premio (undefined si no hay o si falló): se dibuja el bloque de marca. */
  protected imagenPremio(p: Premio): string | undefined {
    if (!p.imagenUrl || this.imagenFalla().has(p.id)) return undefined;
    return p.imagenUrl;
  }

  /** «1.er donante» / «2.º donante» */
  protected eyebrow(): string {
    const p = this.primero();
    if (!p) return '';
    return this.t().eyebrow(p.puestoDesde);
  }

  /** Number of donations of the day (from the ranking: the API only returns the top 20). */
  protected readonly donativos = computed(() => (this.ranking()?.items ?? []).reduce((s, d) => s + d.donativos, 0));

  protected medalla(puesto: number): string {
    return MEDALLA[puesto] ?? 'border-line-strong text-text-tertiary';
  }

  protected euros0(v: number): string {
    return euros0(this.i18n.locale()).format(v / 100); // the API answers in cents
  }
}
