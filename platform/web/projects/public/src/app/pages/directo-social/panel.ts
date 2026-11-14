import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrButton, GrIcon, GrToasts } from '@grcup/ui';
import { ChatService, diaDeHoy, etiquetaDia } from '../../core/chat';
import { Donaciones } from '../../core/donaciones';
import { FanSession } from '../../core/fan';
import { Juegos, type Jornada } from '../../core/juegos';
import { ChatView } from './chat-view';
import { DonantesView } from './donantes-view';
import { DonarModal } from './donar-modal';
import { PorraView } from './porra-view';

type Pestana = 'chat' | 'donantes' | 'porra';

/**
 * Panel social del directo (Figma 70, «/en-directo · Directo con chat»): cabecera con la presencia, pestañas
 * Chat · Donantes · Porra, selector de jornada y el cuerpo de cada pestaña.
 */
@Component({
  selector: 'gr-panel-social',
  imports: [GrIcon, GrButton, ChatView, DonantesView, PorraView, DonarModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @keyframes gr-latido { 0% { transform: scale(1); opacity: 0.7; } 80%, 100% { transform: scale(2.4); opacity: 0; } }
    .gr-latido { animation: gr-latido 2s ease-out infinite; }
    @media (prefers-reduced-motion: reduce) { .gr-latido { animation: none; display: none; } }
  `,
  template: `
    <section class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card bg-[linear-gradient(180deg,rgb(110_20_32/0.42),transparent_220px)] lg:sticky lg:top-[92px] lg:h-[calc(100vh-120px)]" aria-label="Chat del directo">
      <header class="flex shrink-0 items-center justify-between gap-2 px-4 md:gap-3 pt-4 pb-3">
        <div class="min-w-0">
          <h2 class="font-display text-[20px] leading-none text-text-primary uppercase italic">Chat en directo</h2>
          <p class="mt-2 flex items-center gap-x-2 font-mono text-[12px] leading-none font-medium tracking-[0.04em] whitespace-nowrap uppercase md:tracking-[0.08em]" role="status">
            <span class="relative flex size-2 shrink-0" aria-hidden="true">
              @if (vivo()) { <span class="gr-latido absolute inset-0 rounded-full bg-accent"></span> }
              <span class="relative size-2 rounded-full" [class]="puntoClase()"></span>
            </span>
            <span [class]="estadoClase()">{{ badge() }}</span>
            @if (vivo()) {
              <span class="inline-flex items-center gap-1 whitespace-nowrap text-text-tertiary md:before:mr-0.5 md:before:text-text-muted md:before:content-['·']"><gr-icon name="users" [size]="12" />{{ conectados() }} {{ conectados() === '1' ? 'conectado' : 'conectados' }}</span>
            }
          </p>
        </div>
        <button type="button" grButton variant="primary" icon="heart" class="shrink-0" (click)="donar.set(true)">Donar</button>
      </header>

      <nav class="grid shrink-0 grid-cols-3 border-b border-line-subtle px-2" role="tablist" aria-label="Secciones del directo">
        @for (t of pestanas; track t.v) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.v" class="relative h-11 text-label-s transition-colors" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="tab.set(t.v)">
            {{ t.l }}
            @if (tab() === t.v) { <span class="absolute bottom-0 left-1/2 h-0.5 w-14 -translate-x-1/2 rounded-t-2xs bg-accent shadow-[0_0_8px_rgb(196_43_62/0.6)]"></span> }
          </button>
        }
      </nav>

      <!-- jornada: una sola fila con scroll horizontal y degradado de borde (la de hoy con punto vivo) -->
      <div class="shrink-0 border-b border-line-subtle/60" role="group" aria-label="Jornada">
        <div class="flex gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)] [scrollbar-width:none]">
          @for (o of opciones(); track o.dia) {
            <button type="button" class="group flex h-11 shrink-0 items-center md:h-[52px]" [attr.aria-pressed]="o.dia === chat.dia()" (click)="elegirDia(o.dia)">
              <span class="inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-label-s transition-colors"
                [class]="o.dia === chat.dia() ? 'border-accent/60 bg-accent-deep/35 text-accent-text' : 'border-line-strong text-text-secondary group-hover:border-text-muted group-hover:text-text-primary'">
                @if (o.hoy && chat.fase() === 'en_directo') { <span class="size-1.5 rounded-full bg-accent shadow-[0_0_6px_rgb(196_43_62/0.8)]" aria-hidden="true"></span> }
                {{ o.l }}
              </span>
            </button>
          }
          <span class="w-6 shrink-0" aria-hidden="true"></span>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        @switch (tab()) {
          @case ('chat') { <gr-chat-view (donar)="donar.set(true)" /> }
          @case ('donantes') { <gr-donantes-view [diaSala]="chat.dia()" [jornadaId]="jornadaId()" (donar)="donar.set(true)" /> }
          @case ('porra') { <gr-porra-view [jornadaId]="jornadaPorra()?.id ?? ''" [jornadaNombre]="jornadaPorra()?.nombre ?? ''" [cargada]="jornadasCargadas()" /> }
        }
      </div>
    </section>
    <gr-donar-modal [(abierto)]="donar" (verRanking)="tab.set('donantes')" />
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

  protected readonly tab = signal<Pestana>('chat');
  protected readonly donar = signal(false);
  protected readonly jornadas = signal<Jornada[]>([]);
  protected readonly jornadasCargadas = signal(false);
  /** Still on the first connection attempt (or its first 8 s). */
  private readonly primera = signal(true);

  protected readonly pestanas: { v: Pestana; l: string }[] = [
    { v: 'chat', l: 'Chat' },
    { v: 'donantes', l: 'Donantes' },
    { v: 'porra', l: 'Porra' },
  ];

  /** La sala viva (hoy) y las jornadas de juegos de otros días (historial de solo lectura). */
  protected readonly opciones = computed(() => {
    const hoy = diaDeHoy();
    const lista = [{ dia: hoy, l: this.chat.fase() === 'en_directo' ? 'Hoy · en directo' : 'Hoy', hoy: true }];
    const otras = this.jornadas()
      .filter((j) => j.dia !== hoy)
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((j) => ({ dia: j.dia, l: `${j.nombre} · ${etiquetaDia(j.dia)}`, hoy: false }));
    return [...lista, ...otras];
  });

  /** The jornada of the day being shown (its id is needed by the games). */
  protected readonly jornadaId = computed(() => this.jornadas().find((j) => j.dia === this.chat.dia())?.id ?? '');
  protected readonly jornadaNombre = computed(() => this.jornadas().find((j) => j.dia === this.chat.dia())?.nombre ?? '');
  /** The porra of the day shown; today without a jornada falls back to the open one (never a 404 «no jornada today»). */
  protected readonly jornadaPorra = computed<Jornada | undefined>(() => {
    const l = this.jornadas();
    return l.find((j) => j.dia === this.chat.dia()) ?? (this.chat.soloLectura() ? undefined : l.find((j) => j.estado === 'abierta' || j.estado === 'en_juego'));
  });

  protected readonly badge = computed(() => {
    if (this.chat.soloLectura()) return `Historial · ${etiquetaDia(this.chat.dia())}`;
    if (this.chat.fase() === 'antes') return 'Antes del directo';
    if (this.chat.fase() === 'finalizado') return 'Directo finalizado';
    if (this.chat.estado() === 'conectado') return 'En directo';
    if (this.chat.estado() === 'reconectando') return 'Reconectando…';
    // UX4-R1-9: the first attempt is not an outage
    return this.primera() ? 'Conectando…' : 'Sin conexión';
  });
  protected readonly puntoClase = computed(() => {
    if (this.chat.cerrado()) return 'bg-text-muted';
    if (this.chat.estado() === 'conectado') return 'bg-accent shadow-[0_0_8px_rgb(196_43_62/0.8)]';
    if (this.chat.estado() === 'reconectando') return 'bg-warning shadow-[0_0_8px_rgb(245_158_11/0.7)]';
    return 'bg-text-muted';
  });
  protected readonly estadoClase = computed(() => {
    if (this.chat.cerrado()) return 'text-text-tertiary';
    if (this.chat.estado() === 'conectado') return 'text-accent-text';
    if (this.chat.estado() === 'reconectando') return 'text-warning';
    return 'text-text-tertiary';
  });
  /** Live room of today, connected: the dot beats and the audience shows. */
  protected readonly vivo = computed(() => this.chat.estado() === 'conectado' && !this.chat.cerrado());
  protected readonly conectados = computed(() => new Intl.NumberFormat('es-ES').format(this.chat.conectados()));

  constructor() {
    if (this.browser) {
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
      if (donacion) void this.router.navigate([], { relativeTo: this.route, queryParams: { donacion: null }, queryParamsHandling: 'merge', replaceUrl: true });
      if (donacion === 'ok') {
        this.tab.set('donantes');
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
    effect(() => { if (this.chat.estado() !== 'sin-conexion') untracked(() => this.primera.set(false)); });
    if (this.browser) { const t = setTimeout(() => this.primera.set(false), 8000); inject(DestroyRef).onDestroy(() => clearTimeout(t)); }
    inject(DestroyRef).onDestroy(() => this.chat.desconectar());
  }

  protected elegirDia(dia: string): void {
    if (dia === this.chat.dia()) return;
    this.chat.conectar(dia);
  }
}
