import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
  template: `
    <section class="flex flex-col overflow-hidden rounded-xl border border-line-subtle bg-bg-card/70 lg:sticky lg:top-[92px] lg:h-[calc(100vh-120px)]" aria-label="Chat del directo">
      <header class="flex shrink-0 items-start justify-between gap-3 px-4 pt-4">
        <div class="min-w-0">
          <h2 class="font-display text-[22px] leading-none uppercase italic">Chat en directo</h2>
          <p class="mt-2 flex items-center gap-2 text-mono-xs text-text-tertiary"><gr-icon name="users" [size]="14" />{{ chat.conectados() }} conectados</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-2">
          <span class="inline-flex h-6 items-center gap-1.5 rounded-pill border px-2.5 text-label-xs uppercase"
            [class]="badgeClase()"><gr-icon [name]="badgeIcono()" [size]="12" />{{ badge() }}</span>
          <button type="button" grButton variant="primary" size="s" (click)="donar.set(true)">Donar</button>
        </div>
      </header>

      <nav class="mt-3 grid shrink-0 grid-cols-3 border-b border-line-subtle px-2" role="tablist" aria-label="Secciones del directo">
        @for (t of pestanas; track t.v) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.v" class="relative h-11 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="tab.set(t.v)">
            {{ t.l }}
            @if (tab() === t.v) { <span class="absolute inset-x-6 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
          </button>
        }
      </nav>

      <div class="flex shrink-0 items-start gap-2 px-3 pt-3">
        <span class="shrink-0 pt-2.5 text-mono-xs text-text-tertiary uppercase">Jornada</span>
        <div class="-mr-3 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
          @for (o of opciones(); track o.dia) {
            <button type="button" class="h-9 shrink-0 rounded-pill border px-3 text-label-s" [class]="o.dia === chat.dia() ? 'border-accent bg-accent-deep/30 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted'"
              [attr.aria-pressed]="o.dia === chat.dia()" (click)="elegirDia(o.dia)">{{ o.l }}</button>
          }
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col pt-2">
        @switch (tab()) {
          @case ('chat') { <gr-chat-view (donar)="donar.set(true)" /> }
          @case ('donantes') { <gr-donantes-view [diaSala]="chat.dia()" [jornadaId]="jornadaId()" /> }
          @case ('porra') { <gr-porra-view [jornadaId]="jornadaId()" [jornadaNombre]="jornadaNombre()" /> }
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

  protected readonly tab = signal<Pestana>('chat');
  protected readonly donar = signal(false);
  protected readonly jornadas = signal<Jornada[]>([]);

  protected readonly pestanas: { v: Pestana; l: string }[] = [
    { v: 'chat', l: 'Chat' },
    { v: 'donantes', l: 'Donantes' },
    { v: 'porra', l: 'Porra' },
  ];

  /** La sala viva (hoy) y las jornadas de juegos de otros días (historial de solo lectura). */
  protected readonly opciones = computed(() => {
    const hoy = diaDeHoy();
    const lista = [{ dia: hoy, l: 'Hoy · en directo' }];
    const otras = this.jornadas()
      .filter((j) => j.dia !== hoy)
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((j) => ({ dia: j.dia, l: `${j.nombre} · ${etiquetaDia(j.dia)}` }));
    return [...lista, ...otras];
  });

  /** The jornada of the day being shown (its id is needed by the games). */
  protected readonly jornadaId = computed(() => this.jornadas().find((j) => j.dia === this.chat.dia())?.id ?? '');
  protected readonly jornadaNombre = computed(() => this.jornadas().find((j) => j.dia === this.chat.dia())?.nombre ?? '');

  protected readonly badge = computed(() => {
    if (this.chat.estado() === 'conectado') return 'En directo';
    if (this.chat.estado() === 'reconectando') return 'Reconectando…';
    return 'Sin conexión';
  });
  protected readonly badgeIcono = computed(() => (this.chat.estado() === 'conectado' ? 'radio' : this.chat.estado() === 'reconectando' ? 'refresh' : 'wifi-off'));
  protected readonly badgeClase = computed(() => {
    if (this.chat.estado() === 'conectado') return 'border-accent/50 bg-accent-deep/30 text-accent-text';
    if (this.chat.estado() === 'reconectando') return 'border-warning/50 bg-warning/10 text-warning';
    return 'border-line-strong bg-white/5 text-text-tertiary';
  });

  constructor() {
    if (this.browser) {
      this.chat.conectar(diaDeHoy());
      void this.fan.cargar();
      void this.juegos.jornadas().then((l) => this.jornadas.set(l)).catch(() => this.jornadas.set([]));
      // The return of the payment (the backend sends to /en-directo?donacion=ok|cancelada).
      const donacion = this.route.snapshot.queryParamMap.get('donacion');
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
    inject(DestroyRef).onDestroy(() => this.chat.desconectar());
  }

  protected elegirDia(dia: string): void {
    if (dia === this.chat.dia()) return;
    this.chat.conectar(dia);
  }
}
