import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, effect, inject, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon } from '@grcup/ui';
import { ChatService, MAX_TEXTO, sinIds, type ChatItem } from '../../core/chat';
import { FanSession } from '../../core/fan';

/** Emojis frecuentes del selector (sin dependencias nuevas). */
const EMOJIS = ['😀', '😂', '😍', '🔥', '💪', '👏', '🙌', '😮', '😢', '😎', '🤔', '👀', '🥹', '🙏', '💯', '🏆', '⚡', '❤️', '🎉', '🤝'];

const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const nf = new Intl.NumberFormat('es-ES', { useGrouping: true });

/**
 * Lista de mensajes y composer del chat (Figma 70, «Chat message» y «Chat composer»).
 * La lista es un `log` con `aria-live="polite"`: el scroll automático solo baja si el usuario estaba abajo.
 */
@Component({
  selector: 'gr-chat-view',
  imports: [FormsModule, GrIcon, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col">
      <!-- reconexión -->
      @if (chat.estado() === 'reconectando') {
        <p class="flex items-start gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-body-xs text-warning">
          <gr-icon name="refresh" [size]="14" class="mt-0.5 shrink-0" /><span>Reconectando… se recuperarán los mensajes perdidos</span>
        </p>
      }
      <!-- lista -->
      <div #lista class="h-[56vh] max-h-[520px] min-h-[320px] overflow-y-auto overscroll-contain lg:h-auto lg:max-h-none lg:min-h-0 lg:flex-1" role="log" aria-live="polite" aria-label="Mensajes del chat" (scroll)="alScroll($event)">
        @if (chat.items().length === 0) {
          <div class="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span class="flex size-11 items-center justify-center rounded-md border border-line-strong bg-bg-raised text-[20px]" aria-hidden="true">💬</span>
            <p class="text-label-s text-text-primary">El chat está quieto</p>
            <p class="max-w-[240px] text-body-xs text-text-tertiary">Sé quien empiece: anima a los atletas y gana monedas por tus mensajes.</p>
          </div>
        }
        <ul class="flex flex-col">
          @for (it of chat.items(); track it.id + it.kind) {
            @switch (it.kind) {
              @case ('msg') {
                <li class="px-3 py-1.5">
                  @if (it.borrado) {
                    <p class="flex items-center gap-2 text-body-xs text-text-muted"><gr-icon name="shield" [size]="13" />Mensaje eliminado por moderación</p>
                  } @else if (it.mio) {
                    <div class="rounded-md border border-accent/40 bg-accent-deep/15 px-3 py-2">
                      <p class="flex items-baseline gap-2"><span class="text-label-s text-accent-text">Tú</span><span class="text-mono-xs text-text-tertiary">{{ hora(it.ts) }}</span></p>
                      <p class="mt-0.5 text-body-s break-words text-text-primary [overflow-wrap:anywhere]">{{ sinIds(it.texto) }}</p>
                      @if (it.estado === 'pendiente') { <p class="mt-1 text-mono-xs text-text-muted">Enviando…</p> }
                      @if (it.estado === 'error') {
                        <p class="mt-1 flex items-center gap-2 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="13" />{{ it.error }} <button type="button" class="underline underline-offset-2" (click)="chat.reintentar(it)">Reintentar</button></p>
                      }
                    </div>
                  } @else {
                    <p class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span class="text-label-s text-text-primary">{{ it.alias }}</span>
                      <span class="rounded-xs px-1.5 py-0.5 text-mono-xs" [class]="it.atleta ? 'bg-accent text-white' : 'bg-white/8 text-text-secondary'">{{ it.atleta ? 'ATLETA' : 'PÚBLICO' }}</span>
                      <span class="text-mono-xs text-text-tertiary">{{ hora(it.ts) }}</span>
                    </p>
                    <p class="mt-0.5 text-body-s break-words text-text-secondary [overflow-wrap:anywhere]">{{ sinIds(it.texto) }}</p>
                  }
                </li>
              }
              @case ('donacion') {
                <li class="px-3 py-1.5">
                  <div class="rounded-md border border-accent/50 bg-accent-deep/25 px-3 py-2">
                    <p class="flex flex-wrap items-center justify-between gap-2">
                      <span class="flex items-center gap-1.5 text-label-s text-accent-text"><gr-icon name="heart" [size]="14" />{{ it.alias }} donó {{ euros(it.importe) }}</span>
                      <span class="inline-flex items-center gap-1.5 rounded-pill bg-bg-raised px-2 py-0.5 text-mono-xs text-text-primary"><span class="size-2 rounded-full bg-warning"></span>+{{ nf(it.coins) }} GRS coins</span>
                    </p>
                    @if (it.texto) { <p class="mt-1 text-body-s break-words text-accent-text/90 [overflow-wrap:anywhere]">{{ sinIds(it.texto) }}</p> }
                  </div>
                </li>
              }
              @case ('banner') {
                <li class="px-3 py-1.5">
                  <div class="overflow-hidden rounded-md border border-line-subtle bg-bg-raised">
                    <p class="flex items-center justify-between gap-2 px-3 pt-2">
                      <span class="text-mono-xs text-text-tertiary uppercase">Patrocinado</span>
                      @if (it.tier) { <span class="rounded-pill bg-warning px-2 py-0.5 text-mono-xs text-black uppercase">{{ it.tier }}</span> }
                    </p>
                    @if (imagen(it); as img) {
                      <img [src]="img" [alt]="'Banner de ' + it.patrocinador" class="mt-1 aspect-[3/1] w-full object-cover" loading="lazy" (error)="falloImagen(it.id)" />
                    } @else {
                      <!-- la imagen no carga: bloque de marca del diseño (degradado + nombre del patrocinador) -->
                      <div class="mt-1 flex aspect-[3/1] w-full items-center justify-center bg-[linear-gradient(135deg,#4c111b,#170c0e)] px-4">
                        <span class="text-center font-display text-[20px] leading-tight uppercase italic text-text-primary">{{ it.patrocinador }}</span>
                      </div>
                    }
                    <div class="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                      <p class="min-w-0 flex-1 text-label-s break-words [overflow-wrap:anywhere]">{{ it.patrocinador }}</p>
                      <a class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary" [href]="it.clicUrl" target="_blank" rel="sponsored noopener">Visitar web <gr-icon name="arrow-right" [size]="14" /></a>
                    </div>
                  </div>
                </li>
              }
              @case ('hito') {
                <li class="px-3 py-1.5">
                  <div class="rounded-md bg-accent-deep/45 px-3 py-2 text-center">
                    <p class="flex flex-wrap items-center justify-center gap-2">
                      <span class="inline-flex items-center gap-1.5 rounded-pill bg-bg-raised px-2 py-0.5 text-mono-xs text-text-primary"><span class="size-2 rounded-full bg-warning"></span>+{{ porraHito(it.mensajes) }} porra</span>
                      <span class="inline-flex items-center gap-1.5 rounded-pill bg-bg-raised px-2 py-0.5 text-mono-xs text-text-primary"><span class="size-2 rounded-full bg-info"></span>+{{ nf(fantasyHito(it.mensajes)) }} fantasy</span>
                    </p>
                    <p class="mt-1.5 text-body-xs text-text-secondary">por tus {{ it.mensajes }} mensajes en el chat de la jornada</p>
                  </div>
                </li>
              }
              @case ('sistema') {
                <li class="px-3 py-2"><p class="text-center text-body-xs text-text-tertiary">{{ it.texto }}</p></li>
              }
              @case ('borrado') {
                <li class="px-3 py-1.5"><p class="flex items-center gap-2 text-body-xs text-text-muted"><gr-icon name="shield" [size]="13" />{{ it.texto }}</p></li>
              }
            }
          }
        </ul>
      </div>

      @if (noLeido() > 0) {
        <button type="button" class="mx-auto -mt-8 mb-2 inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong bg-bg-raised px-4 text-label-s shadow-card" (click)="irAlFinal()">
          {{ noLeido() }} {{ noLeido() === 1 ? 'nuevo mensaje' : 'nuevos mensajes' }} <gr-icon name="arrow-down" [size]="14" />
        </button>
      }

      <!-- composer -->
      <div class="border-t border-line-subtle bg-bg-card/60 p-3">
        @if (chat.soloLectura()) {
          <p class="rounded-md border border-line-subtle bg-bg-raised px-3 py-2.5 text-body-xs text-text-tertiary">Este día ya está cerrado: puedes leer el chat, pero no escribir.</p>
        } @else if (!fan.conSesion()) {
          <div class="rounded-md border border-line-subtle bg-bg-raised p-3">
            <p class="text-label-s text-text-primary">Entra para chatear, donar y jugar</p>
            <p class="mt-1 text-body-xs text-text-tertiary">Cuenta de directo gratuita, sin contraseñas: un enlace mágico a tu email.</p>
            <button type="button" grButton variant="primary" size="s" class="mt-2" (click)="fan.abrirAcceso('chat')">Entrar</button>
          </div>
        } @else if (chat.aviso(); as aviso) {
          <div class="rounded-md border border-warning/50 bg-warning/10 p-3">
            <p class="flex items-start gap-2 text-body-s text-warning"><gr-icon name="shield-alert" [size]="15" class="mt-0.5 shrink-0" />{{ aviso }}</p>
            <p class="mt-1 text-body-xs text-text-tertiary">Podrás escribir cuando termine el silencio. El resto del chat sigue abierto.</p>
          </div>
        } @else {
          @if (chat.modoLentoSeg() > 0) {
            <p class="mb-2 flex items-center gap-2 rounded-sm border border-line-subtle bg-bg-raised px-2.5 py-1.5 text-mono-xs text-text-secondary">
              <gr-icon name="clock" [size]="13" />Modo lento activo: puedes enviar un mensaje cada {{ chat.modoLentoSeg() }} s
              @if (chat.esperaEnvio() > 0) { <span class="ml-auto text-accent-text">{{ chat.esperaEnvio() }} s</span> }
            </p>
          }
          @if (chat.errorEnvio(); as error) {
            <p class="mb-2 flex items-start gap-2 rounded-sm border border-accent/40 bg-accent-deep/20 px-2.5 py-2 text-body-xs text-accent-text" role="alert">
              <gr-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" /><span class="flex-1">{{ error }}</span>
              <button type="button" aria-label="Cerrar el aviso" class="shrink-0" (click)="chat.limpiarError()"><gr-icon name="x" [size]="14" /></button>
            </p>
          }
          @if (texto().length > maxTexto) {
            <p class="mb-2 flex items-center gap-2 rounded-sm border border-warning/40 bg-warning/10 px-2.5 py-2 text-body-xs text-warning" role="alert">
              <gr-icon name="triangle-alert" [size]="14" />El mensaje supera los {{ maxTexto }} caracteres. Acórtalo para enviarlo.
            </p>
          }
          <div class="relative">
            <textarea #caja grInput rows="1" class="max-h-24 min-h-11 resize-none pl-11 [field-sizing:content]" placeholder="Escribe un mensaje…" aria-label="Mensaje del chat"
              [ngModel]="texto()" (ngModelChange)="texto.set($event)" (keydown.enter)="enter($event)"></textarea>
            <button type="button" class="absolute bottom-2 left-2 flex size-9 items-center justify-center rounded-sm text-[18px] hover:bg-white/5" aria-label="Emojis" [attr.aria-expanded]="emojis()" (click)="emojis.set(!emojis())">
              <span aria-hidden="true">😊</span>
            </button>
            @if (emojis()) {
              <div class="absolute bottom-full left-0 z-10 mb-2 grid w-[248px] grid-cols-8 gap-1 rounded-md border border-line-strong bg-bg-raised p-2 shadow-card" role="group" aria-label="Emojis frecuentes">
                @for (e of emojisLista; track e) {
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm text-[18px] hover:bg-white/8" [attr.aria-label]="'Emoji ' + e" (click)="ponerEmoji(e)">{{ e }}</button>
                }
              </div>
            }
          </div>
          <div class="mt-2 flex items-center gap-2">
            <p class="font-mono text-mono-xs" [class]="texto().length > maxTexto ? 'text-accent-text' : 'text-text-tertiary'">{{ texto().length }} / {{ maxTexto }}</p>
            <button type="button" grButton variant="secondary" size="s" class="ml-auto" [disabled]="!puedeEnviar()" (click)="enviar()">Enviar</button>
            <button type="button" grButton variant="primary" size="s" (click)="donar.emit()">Donar</button>
          </div>
        }
      </div>
    </div>
  `,
})
export class ChatView {
  readonly chat = inject(ChatService);
  protected readonly fan = inject(FanSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The panel asks for the donate dialog. */
  readonly donar = output<void>();

  protected readonly maxTexto = MAX_TEXTO;
  protected readonly texto = signal('');
  /** Banners cuya imagen no carga: se sustituyen por el bloque de marca. */
  private readonly imagenFalla = signal<ReadonlySet<string>>(new Set());
  protected readonly emojis = signal(false);
  protected readonly emojisLista = EMOJIS;
  /** New messages that arrived while the user was not at the bottom. */
  protected readonly noLeido = signal(0);
  /** True when the list is scrolled to the bottom (the autoscroll follows it). */
  private readonly pegado = signal(true);

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  private readonly caja = viewChild<ElementRef<HTMLTextAreaElement>>('caja');

  constructor() {
    effect(() => {
      // The list element is read inside the effect: the first run can happen before the view exists.
      const n = this.chat.items().length;
      const el = this.lista()?.nativeElement;
      if (!n || !el) return;
      untracked(() => {
        if (this.pegado()) this.bajar();
        else this.noLeido.update((v) => v + 1);
      });
    });
  }

  protected hora(ts: number): string {
    return HORA.format(new Date(ts));
  }
  protected nf(n: number): string {
    return nf.format(n);
  }
  /** El texto sin identificadores internos (UUID e ids del stream). */
  protected sinIds(texto: string): string {
    return sinIds(texto);
  }
  /** Fantasy coins of a milestone: 10.000 por cada 5 mensajes y 50.000 extra cada 10 (contract §6.4). */
  protected fantasyHito(mensajes: number): number {
    return 10000 * Math.floor(mensajes / 5) + 50000 * Math.floor(mensajes / 10);
  }
  /** Porra coins of a milestone: 100 por cada 5 mensajes y 500 extra cada 10 (contract §6.4). */
  protected porraHito(mensajes: number): number {
    return 100 * Math.floor(mensajes / 5) + 500 * Math.floor(mensajes / 10);
  }
  protected euros(c: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c / 100);
  }
  /** The mobile image of the sponsor when the screen is narrow. */
  protected imagen(it: Extract<ChatItem, { kind: 'banner' }>): string | undefined {
    if (this.imagenFalla().has(it.id)) return undefined;
    const movil = this.browser && window.matchMedia('(max-width: 767px)').matches;
    const url = (movil && it.imagenMovilUrl) || it.imagenUrl;
    return url || undefined;
  }

  /** The image failed: the banner shows the brand block instead. */
  protected falloImagen(id: string): void {
    this.imagenFalla.update((s) => (s.has(id) ? s : new Set(s).add(id)));
  }

  protected alScroll(e: Event): void {
    const el = e.target as HTMLElement;
    this.pegado.set(el.scrollTop + el.clientHeight >= el.scrollHeight - 48);
    if (this.pegado()) this.noLeido.set(0);
  }

  protected irAlFinal(): void {
    this.pegado.set(true);
    this.noLeido.set(0);
    this.bajar();
  }

  private bajar(): void {
    if (!this.browser) return;
    // Dos frames: el primero aplica el scroll y el segundo lo corrige cuando la lista aún no había pintado los items.
    requestAnimationFrame(() => {
      const el = this.lista()?.nativeElement;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        const e2 = this.lista()?.nativeElement;
        if (!e2) return;
        if (e2.scrollTop + e2.clientHeight < e2.scrollHeight - 8) e2.scrollTop = e2.scrollHeight;
      });
    });
  }

  protected puedeEnviar(): boolean {
    const t = this.texto().trim();
    return !!t && t.length <= MAX_TEXTO && this.chat.esperaEnvio() === 0 && !this.chat.soloLectura();
  }

  protected async enviar(): Promise<void> {
    if (!this.puedeEnviar()) return;
    const t = this.texto();
    this.texto.set('');
    this.emojis.set(false);
    const ok = await this.chat.enviar(t);
    if (!ok) this.texto.set(t);
  }

  /** Enter sends, Shift+Enter makes a new line. */
  protected enter(e: Event): void {
    const ev = e as KeyboardEvent;
    if (ev.shiftKey || ev.key !== 'Enter') return;
    ev.preventDefault();
    void this.enviar();
  }

  protected ponerEmoji(e: string): void {
    const t = this.texto();
    this.texto.set(t + e);
    this.emojis.set(false);
    queueMicrotask(() => {
      const c = this.caja()?.nativeElement;
      if (!c) return;
      c.focus();
      c.setSelectionRange(c.value.length, c.value.length);
    });
  }
}
