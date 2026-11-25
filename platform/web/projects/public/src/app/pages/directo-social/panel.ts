import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, computed, effect, inject, input, signal, untracked, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { GrIcon, GrToasts, type GrLiveEstado } from '@grcup/ui';
import { ChatService, diaDeHoy } from '../../core/chat';
import { type Directo } from '../../core/directo';
import { FanSession } from '../../core/fan';
import { I18n } from '../../core/i18n';
import { Juegos, type Jornada } from '../../core/juegos';
import { ChatView } from './chat-view';
import { DonantesView } from './donantes-view';
import { DonarModal } from './donar-modal';
import { PorraView } from './porra-view';
import { TarimaView } from './tarima-view';

type Pestana = 'chat' | 'donantes' | 'porra' | 'tarima';
const PESTANAS: readonly Pestana[] = ['chat', 'donantes', 'porra', 'tarima'];

const T = {
  es: {
    seccion: 'Chat y juegos del directo',
    conectados: (n: string) => n + ' ' + (n === '1' ? 'conectado' : 'conectados'),
    secciones: 'Secciones del directo',
    pestanas: { chat: 'Chat', donantes: 'Donantes', porra: 'Porra', tarima: 'Tarima' } as Record<Pestana, string>,
    graciasT: '¡Gracias! Tu donativo aparecerá en el chat',
    graciasD: 'Los coins y las monedas de GRS Fantasy se acreditan al volver a la sala de la jornada.',
    canceladoT: 'Donativo cancelado',
    canceladoD: 'No se ha hecho ningún cargo: puedes intentarlo otra vez cuando quieras.',
  },
  en: {
    seccion: 'Live chat and games',
    conectados: (n: string) => n + ' online',
    secciones: 'Live sections',
    pestanas: { chat: 'Chat', donantes: 'Donors', porra: 'Pool', tarima: 'Platform' } as Record<Pestana, string>,
    graciasT: 'Thank you! Your donation will appear in the chat',
    graciasD: 'The coins and GRS Fantasy money are credited when you return to the matchday room.',
    canceladoT: 'Donation cancelled',
    canceladoD: 'No charge has been made: you can try again whenever you like.',
  },
};

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
 * tab. The tab lives in `?tab=` (always written, chat when absent or unknown). On desktop «Tarima» stays under the player.
 *
 * Connections per tab (contract with perf-20261115): each tab only talks to its own service and closes it on leaving.
 * - chat: chat service (WS `/chat/ws`, SSE fallback, `/chat/estado`, `/chat/mensajes`); opened only while the tab is shown.
 * - donantes: donaciones (ranking/totals) + juegos `/jornadas` and `/premios` (its own, once); no chat socket.
 * - porra: juegos (`/jornadas`, `/porra/mercados` every 20 s, cartera, mis-apuestas); no chat socket.
 * - tarima: the page's live data (competition SSE + `/directo`), shared by the whole page; nothing else.
 * Tab bodies are `@defer`red: their code and requests load when the tab is opened and die with it.
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
    <section class="flex flex-col md:overflow-hidden md:rounded-lg md:border md:border-line-subtle md:bg-bg-card lg:sticky lg:top-[92px] lg:h-[calc(100vh-120px)]" [attr.aria-label]="t().seccion">
      <p class="flex h-6 shrink-0 items-center justify-end gap-1.5 px-4 pt-1.5 pb-0.5 font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-text-tertiary uppercase md:h-8 md:pt-3" role="status">
        @if (vivo()) { <gr-icon name="users" [size]="16" />{{ t().conectados(conectados()) }} }
      </p>
      <nav class="grid shrink-0 border-b border-line-subtle px-1" [class]="visibles().length === 4 ? 'grid-cols-4' : 'grid-cols-3'" role="tablist" [attr.aria-label]="t().secciones">
        @for (tb of visibles(); track tb.v) {
          <button type="button" role="tab" [id]="'tab-' + tb.v" aria-controls="panel-directo" [attr.aria-selected]="tab() === tb.v" class="relative h-[42px] pt-0.5 text-[14px] leading-[17px] font-semibold transition-colors" [class]="tab() === tb.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="elegir(tb.v)">
            {{ t().pestanas[tb.v] }}
            @if (tab() === tb.v) { <span class="absolute inset-x-0 bottom-0 h-[3px] rounded-t-2xs bg-accent-grain" aria-hidden="true"></span> }
          </button>
        }
      </nav>

      @for (t of [tab()]; track t) {
      <div id="panel-directo" role="tabpanel" [attr.aria-labelledby]="'tab-' + t" class="gr-tab flex flex-col lg:min-h-0 lg:flex-1"
        [class]="t === 'chat' ? 'h-[max(360px,calc(100dvh-382px))] md:h-[600px] lg:h-auto' : 'min-h-[480px] md:min-h-[600px]'">
        @switch (t) {
          @case ('chat') { @defer (on immediate) { <gr-chat-view (donar)="donar.set(true)" /> } }
          @case ('donantes') { @defer (on immediate) { <gr-donantes-view [diaSala]="hoy" [jornadaId]="jornadaPorra()?.id ?? ''" (donar)="donar.set(true)" /> } }
          @case ('porra') { @defer (on immediate) { <gr-porra-view [jornadaId]="jornadaPorra()?.id ?? ''" [jornadaNombre]="jornadaPorra()?.nombre ?? ''" [cargada]="jornadasCargadas()" /> } }
          @case ('tarima') { @if (directo(); as d) { @defer (on immediate) { <gr-tarima-view class="px-4 py-4 md:px-5" [directo]="d" [conexion]="conexion()" /> } } }
        }
      </div>
      }
    </section>
    <gr-donar-modal [(abierto)]="donar" (verRanking)="elegir('donantes')" />
  `,
})
export class PanelSocial {
  protected readonly chat = inject(ChatService);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
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

  private readonly pestanas: { v: Pestana }[] = [{ v: 'chat' }, { v: 'donantes' }, { v: 'porra' }, { v: 'tarima' }];
  protected readonly visibles = computed(() => (this.escritorio() ? this.pestanas.filter((t) => t.v !== 'tarima') : this.pestanas));

  /** Today (Madrid): the day of the chat room and of the games. */
  protected readonly hoy = diaDeHoy();
  /** The porra of today; without a jornada today it falls back to the open one (never a 404 «no jornada today»). */
  protected readonly jornadaPorra = computed<Jornada | undefined>(() => {
    const l = this.jornadas();
    return l.find((j) => j.dia === this.hoy) ?? l.find((j) => j.estado === 'abierta' || j.estado === 'en_juego');
  });

  /** Connected and live: the audience shows (no red dot, Figma 393:120125). */
  protected readonly vivo = computed(() => this.chat.estado() === 'conectado' && !this.chat.cerrado() && this.chat.conectados() > 0);
  protected readonly conectados = computed(() => new Intl.NumberFormat(this.i18n.locale()).format(this.chat.conectados()));

  constructor() {
    if (this.browser) {
      void this.fan.cargar();
      // Only the shown tab keeps a connection: the chat socket lives while «Chat» is open (one room, today's)
      effect(() => {
        const t = this.tab();
        untracked(() => (t === 'chat' ? this.chat.conectar(this.hoy) : this.chat.desconectar()));
      });
      // The jornadas (juegos service) are only needed by «Porra» («Donantes» loads its own): loaded the first time it opens
      let pedidas = false;
      effect(() => {
        const t = this.tab();
        if (pedidas || t !== 'porra') return;
        pedidas = true;
        void this.juegos
          .jornadas()
          .then((l) => this.jornadas.set(l))
          .catch(() => this.jornadas.set([]))
          .finally(() => this.jornadasCargadas.set(true));
      });
      // `?tab=` always names the tab shown (an absent or unknown value becomes the real one, without a history entry)
      effect(() => {
        const t = this.tab();
        if (this.pedida() !== t) untracked(() => void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t }, queryParamsHandling: 'merge', replaceUrl: true }));
      });
      // The return of the payment (the backend sends to /en-directo?donacion=ok|cancelada).
      const donacion = this.route.snapshot.queryParamMap.get('donacion');
      // consumed once: a re-created panel (the page reloads its data) must not toast again
      if (donacion) {
        const queryParams: Record<string, string | null> = { donacion: null };
        if (donacion === 'ok') queryParams['tab'] = 'donantes';
        void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
      }
      if (donacion === 'ok') {
        this.toasts.success(this.t().graciasT, this.t().graciasD);
      } else if (donacion === 'cancelada') {
        this.toasts.info(this.t().canceladoT, this.t().canceladoD);
      }
    }
    inject(DestroyRef).onDestroy(() => this.chat.desconectar());
  }

  protected elegir(t: Pestana): void {
    if (t !== this.tab()) void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t }, queryParamsHandling: 'merge', replaceUrl: true });
    // Figma 393:121897 · 5: on mobile, opening the chat scrolls the page so the block fits the screen
    if (t === 'chat' && this.browser && window.matchMedia('(max-width: 767px)').matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => this.host.nativeElement.scrollIntoView({ block: 'end', behavior: suave ? 'smooth' : 'auto' }));
    }
  }
}
