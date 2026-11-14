import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, computed, effect, inject, input, signal, untracked, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { GrIcon, GrToasts, type GrLiveEstado } from '@grcup/ui';
import { ChatService, diaDeHoy } from '../../core/chat';
import { type Directo } from '../../core/directo';
import { Donaciones } from '../../core/donaciones';
import { FanSession } from '../../core/fan';
import { Juegos, type Jornada } from '../../core/juegos';
import { ChatView } from './chat-view';
import { DonantesView } from './donantes-view';
import { DonarModal } from './donar-modal';
import { PorraView } from './porra-view';
import { TarimaView } from './tarima-view';

type Pestana = 'chat' | 'donantes' | 'porra' | 'tarima';
const PESTANAS: readonly Pestana[] = ['chat', 'donantes', 'porra', 'tarima'];

/** True on desktop (≥ 1024 px), following resizes; false on the server. Call it in an injection context. */
export function escritorio(): Signal<boolean> {
  const s = signal(false);
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    const mq = window.matchMedia('(min-width: 1024px)');
    s.set(mq.matches);
    const fn = (e: MediaQueryListEvent) => s.set(e.matches);
    mq.addEventListener('change', fn);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', fn));
  }
  return s.asReadonly();
}

/**
 * Panel social del directo (Figma 171:65287 · «Directo · Pestañas (móvil)» 393:120125): the connected count and the
 * Chat · Donantes · Porra · Tarima tabs right under the player (full width, no box, on mobile), and the body of each
 * tab. The tab lives in `?tab=` (chat by default). On desktop «Tarima» stays under the player, so the tab hides.
 */
@Component({
  selector: 'gr-panel-social',
  imports: [GrIcon, ChatView, DonantesView, PorraView, DonarModal, TarimaView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    @keyframes gr-tab { from { opacity: 0; } to { opacity: 1; } }
    .gr-tab { animation: gr-tab 200ms ease-out both; }
    @media (prefers-reduced-motion: reduce) { .gr-tab { animation: none; } }
  `,
  template: `
    <section class="flex flex-col md:overflow-hidden md:rounded-lg md:border md:border-line-subtle md:bg-bg-card lg:sticky lg:top-[92px] lg:h-[calc(100vh-120px)]" aria-label="Chat y juegos del directo">
      <p class="flex h-6 shrink-0 items-center justify-end gap-1.5 px-4 pt-1.5 pb-0.5 font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-text-tertiary uppercase md:h-8 md:pt-3" role="status">
        @if (vivo()) { <gr-icon name="users" [size]="16" />{{ conectados() }} {{ conectados() === '1' ? 'conectado' : 'conectados' }} }
      </p>
      <nav class="grid shrink-0 border-b border-line-subtle px-1" [class]="visibles().length === 4 ? 'grid-cols-4' : 'grid-cols-3'" role="tablist" aria-label="Secciones del directo">
        @for (t of visibles(); track t.v) {
          <button type="button" role="tab" [id]="'tab-' + t.v" aria-controls="panel-directo" [attr.aria-selected]="tab() === t.v" class="relative h-[42px] pt-0.5 text-[14px] leading-[17px] font-semibold transition-colors" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="elegir(t.v)">
            {{ t.l }}
            @if (tab() === t.v) { <span class="absolute inset-x-0 bottom-0 h-[3px] rounded-t-2xs bg-accent-grain" aria-hidden="true"></span> }
          </button>
        }
      </nav>

      @for (t of [tab()]; track t) {
      <div id="panel-directo" role="tabpanel" [attr.aria-labelledby]="'tab-' + t" class="gr-tab flex flex-col lg:min-h-0 lg:flex-1"
        [class]="t === 'chat' ? 'h-[max(360px,calc(100dvh-382px))] md:h-[600px] lg:h-auto' : 'min-h-[480px] md:min-h-[600px]'">
        @switch (t) {
          @case ('chat') { <gr-chat-view (donar)="donar.set(true)" /> }
          @case ('donantes') { <gr-donantes-view [diaSala]="chat.dia()" [jornadaId]="jornadaId()" (donar)="donar.set(true)" /> }
          @case ('porra') { <gr-porra-view [jornadaId]="jornadaPorra()?.id ?? ''" [jornadaNombre]="jornadaPorra()?.nombre ?? ''" [cargada]="jornadasCargadas()" /> }
          @case ('tarima') { @if (directo(); as d) { <gr-tarima-view class="px-4 py-4 md:px-5" [directo]="d" [conexion]="conexion()" /> } }
        }
      </div>
      }
    </section>
    <gr-donar-modal [(abierto)]="donar" (verRanking)="elegir('donantes')" />
  `,
})
export class PanelSocial {
  protected readonly chat = inject(ChatService);
  private readonly don = inject(Donaciones);
  private readonly juegos = inject(Juegos);
  protected readonly fan = inject(FanSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly toasts = inject(GrToasts);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The live data of the page (the «Tarima» tab shows it). */
  readonly directo = input<Directo | null | undefined>(undefined);
  /** State of the real-time connection of the page. */
  readonly conexion = input<GrLiveEstado>('en-directo');

  private readonly escritorio = escritorio();
  private readonly pedida = toSignal(this.route.queryParamMap.pipe(map((q) => q.get('tab'))), { initialValue: this.route.snapshot.queryParamMap.get('tab') });
  /** The tab of `?tab=`; chat when absent or unknown (and on desktop for «tarima», which sits under the player). */
  protected readonly tab = computed<Pestana>(() => {
    const p = this.pedida() as Pestana | null;
    if (!p || !PESTANAS.includes(p)) return 'chat';
    return p === 'tarima' && this.escritorio() ? 'chat' : p;
  });
  protected readonly donar = signal(false);
  protected readonly jornadas = signal<Jornada[]>([]);
  protected readonly jornadasCargadas = signal(false);

  private readonly pestanas: { v: Pestana; l: string }[] = [
    { v: 'chat', l: 'Chat' },
    { v: 'donantes', l: 'Donantes' },
    { v: 'porra', l: 'Porra' },
    { v: 'tarima', l: 'Tarima' },
  ];
  protected readonly visibles = computed(() => (this.escritorio() ? this.pestanas.filter((t) => t.v !== 'tarima') : this.pestanas));

  /** The jornada of today (its id is needed by the games). */
  protected readonly jornadaId = computed(() => this.jornadas().find((j) => j.dia === this.chat.dia())?.id ?? '');
  /** The porra of today; without a jornada today it falls back to the open one (never a 404 «no jornada today»). */
  protected readonly jornadaPorra = computed<Jornada | undefined>(() => {
    const l = this.jornadas();
    return l.find((j) => j.dia === this.chat.dia()) ?? l.find((j) => j.estado === 'abierta' || j.estado === 'en_juego');
  });

  /** Connected and live: the audience shows (no red dot, Figma 393:120125). */
  protected readonly vivo = computed(() => this.chat.estado() === 'conectado' && !this.chat.cerrado() && this.chat.conectados() > 0);
  protected readonly conectados = computed(() => new Intl.NumberFormat('es-ES').format(this.chat.conectados()));

  constructor() {
    if (this.browser) {
      // one room: the active one of today (no day picker)
      this.chat.conectar(diaDeHoy());
      void this.fan.cargar();
      void this.juegos
        .jornadas()
        .then((l) => this.jornadas.set(l))
        .catch(() => this.jornadas.set([]))
        .finally(() => this.jornadasCargadas.set(true));
      // The return of the payment (the backend sends to /en-directo?donacion=ok|cancelada).
      const donacion = this.route.snapshot.queryParamMap.get('donacion');
      // consumed once: a re-created panel (the page reloads its data) must not toast again
      if (donacion) {
        const queryParams: Record<string, string | null> = { donacion: null };
        if (donacion === 'ok') queryParams['tab'] = 'donantes';
        void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
      }
      if (donacion === 'ok') {
        this.toasts.success('¡Gracias! Tu donativo aparecerá en el chat', 'Los coins y las monedas de GRS Fantasy se acreditan al volver a la sala de la jornada.');
      } else if (donacion === 'cancelada') {
        this.toasts.info('Donativo cancelado', 'No se ha hecho ningún cargo: puedes intentarlo otra vez cuando quieras.');
      }
    }
    // A donation in the room refreshes the ranking of the day.
    effect(() => {
      const n = this.chat.items().filter((i) => i.kind === 'donacion').length;
      if (!n) return;
      untracked(() => void this.don.cargarRanking(this.chat.dia()));
    });
    inject(DestroyRef).onDestroy(() => this.chat.desconectar());
  }

  protected elegir(t: Pestana): void {
    if (t !== this.tab()) void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t === 'chat' ? null : t }, queryParamsHandling: 'merge', replaceUrl: true });
    // Figma 393:121897 · 5: on mobile, opening the chat scrolls the page so the block fits the screen
    if (t === 'chat' && this.browser && window.matchMedia('(max-width: 767px)').matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => this.host.nativeElement.scrollIntoView({ block: 'end', behavior: suave ? 'smooth' : 'auto' }));
    }
  }
}
