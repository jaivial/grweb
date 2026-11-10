import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, computed, effect, inject, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon } from '@grcup/ui';
import { ChatService, MAX_TEXTO, sinIds, type ChatItem } from '../../core/chat';
import { FanSession } from '../../core/fan';
import { GrChatAvatar, GrCoin } from './ui';

/** Emojis frecuentes del selector (sin dependencias nuevas). */
const EMOJIS = ['😀', '😂', '😍', '🔥', '💪', '👏', '🙌', '😮', '😢', '😎', '🤔', '👀', '🥹', '🙏', '💯', '🏆', '⚡', '❤️', '🎉', '🤝', '🏋️', '🥇', '🫡', '😤'];
/** Frases para romper el hielo cuando el chat está vacío: rellenan la caja, no se envían solas. */
const SUGERENCIAS = ['💪 ¡Vamos!', '🔥 Qué nivel', '👏 Bravo'];
/** Mensajes seguidos del mismo autor dentro de esta ventana se agrupan bajo una sola cabecera. */
const VENTANA_GRUPO_MS = 3 * 60 * 1000;
/** El contador de caracteres aparece al escribir; en ámbar a partir de aquí. */
const AVISO_TEXTO = 240;

const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const nf = new Intl.NumberFormat('es-ES', { useGrouping: true });

/** Un item del chat con su posición en el grupo (continuación = sin avatar ni cabecera). */
interface Fila {
  it: ChatItem;
  cont: boolean;
}

/**
 * Lista de mensajes y composer del chat (Figma 70 v2, «Chat message», «Chat avatar» y «Chat composer»).
 * La lista es un `log` con `aria-live="polite"`: el scroll automático solo baja si el usuario estaba abajo.
 */
@Component({
  selector: 'gr-chat-view',
  imports: [FormsModule, GrIcon, GrButton, GrChatAvatar, GrCoin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  styles: `
    @keyframes gr-pop { 0% { opacity: 0; transform: translateY(6px) scale(0.96); } 60% { opacity: 1; transform: translateY(0) scale(1.015); } 100% { opacity: 1; transform: none; } }
    @keyframes gr-barrido { from { transform: translateX(-120%); } to { transform: translateX(120%); } }
    @keyframes gr-entra { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .gr-hito, .gr-donativo { animation: gr-pop 420ms var(--ease-out-soft) both; }
    .gr-hito::after { content: ''; position: absolute; inset: 0; pointer-events: none; transform: translateX(-120%);
      background: linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 0.16) 50%, transparent 65%); animation: gr-barrido 1.1s 260ms ease-out 1 both; }
    .gr-entra { animation: gr-entra 180ms ease-out both; }
    @media (prefers-reduced-motion: reduce) { .gr-hito, .gr-donativo, .gr-entra, .gr-hito::after { animation: none; } }
  `,
  template: `
    <div class="relative flex min-h-0 flex-1 flex-col">
      <!-- reconexión -->
      @if (chat.estado() === 'reconectando') {
        <p class="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-body-xs text-warning" role="status">
          <gr-icon name="refresh" [size]="14" class="shrink-0 motion-safe:animate-spin" /><span>Reconectando… recuperaremos los mensajes que te pierdas</span>
        </p>
      }
      <!-- lista -->
      <div #lista class="h-[56vh] max-h-[520px] min-h-[320px] overflow-y-auto overscroll-contain py-2 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin] lg:h-auto lg:max-h-none lg:min-h-0 lg:flex-1"
        role="log" aria-live="polite" aria-label="Mensajes del chat" (scroll)="alScroll($event)">
        @if (chat.items().length === 0) {
          <div class="flex h-full flex-col items-center justify-center gap-3 px-8 py-10 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-accent/45 bg-[linear-gradient(135deg,#4c111b,#170c0e)] text-[28px] shadow-glow-deep" aria-hidden="true">💬</span>
            <p class="text-ui-h5 text-text-primary">El chat está en calma</p>
            <p class="max-w-[260px] text-body-s text-text-tertiary">Rompe el hielo: anima a los atletas y gana monedas cada 5 mensajes.</p>
            @if (fan.conSesion() && !chat.soloLectura()) {
              <div class="mt-1 flex flex-wrap justify-center gap-2">
                @for (s of sugerencias; track s) {
                  <button type="button" class="h-11 rounded-pill border border-line-strong bg-bg-raised px-3.5 text-label-s text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary md:h-9" (click)="sugerir(s)">{{ s }}</button>
                }
              </div>
            }
          </div>
        }
        <ul class="flex flex-col">
          @for (f of filas(); track f.it.id + f.it.kind) {
            @let it = f.it;
            @switch (it.kind) {
              @case ('msg') {
                @if (it.borrado) {
                  <li class="flex items-center gap-2 px-4 py-1.5 text-body-xs text-text-muted italic"><gr-icon name="shield" [size]="14" />Mensaje eliminado por moderación</li>
                } @else {
                  <li class="group gr-entra relative flex gap-3 pr-4" [class]="claseMsg(it.atleta, f.cont)" [class.opacity-70]="it.estado === 'pendiente'">
                    @if (f.cont) {
                      <time class="absolute top-1 left-0 w-[52px] text-right font-mono text-[10px] leading-5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">{{ hora(it.ts) }}</time>
                    } @else {
                      <gr-chat-avatar class="mt-0.5" [alias]="it.alias" [atleta]="it.atleta" [mio]="it.mio" />
                    }
                    <div class="min-w-0 flex-1">
                      @if (!f.cont) {
                        <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span class="text-label-s" [class]="it.mio ? 'text-accent-text' : 'text-text-primary'">{{ it.mio ? 'Tú' : it.alias }}</span>
                          @if (it.atleta) {
                            <span class="inline-flex h-[18px] items-center gap-1 rounded-2xs bg-accent px-1.5 font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-white uppercase"><gr-icon name="trophy" [size]="11" />Atleta</span>
                          }
                          <time class="font-mono text-[11px] tracking-[0.08em] text-text-muted">{{ hora(it.ts) }}</time>
                        </p>
                      }
                      <p class="text-body-s break-words [overflow-wrap:anywhere]" [class]="it.mio || it.atleta ? 'text-text-primary' : 'text-text-secondary'">{{ sinIds(it.texto) }}</p>
                      @if (it.estado === 'pendiente') { <p class="mt-0.5 font-mono text-[11px] text-text-muted">Enviando…</p> }
                      @if (it.estado === 'error') {
                        <p class="mt-1 flex flex-wrap items-center gap-x-2 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="13" />{{ it.error }}
                          <button type="button" class="min-h-11 font-semibold underline underline-offset-2 md:min-h-0" (click)="chat.reintentar(it)">Reintentar</button></p>
                      }
                    </div>
                  </li>
                }
              }
              @case ('donacion') {
                <li class="px-4 py-2">
                  <div class="gr-donativo relative overflow-hidden rounded-md border border-white/12 bg-accent-grain p-3.5 shadow-[0_6px_24px_rgb(196_43_62/0.35)]">
                    <div class="flex items-center gap-2.5">
                      <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/16 text-white"><gr-icon name="heart" [size]="18" /></span>
                      <p class="min-w-0 flex-1">
                        <span class="line-clamp-2 block text-label-xs break-words text-white/85 [overflow-wrap:anywhere]">{{ it.alias }} ha donado</span>
                        <span class="block font-display text-[24px] leading-none text-white italic">{{ euros(it.importe) }}</span>
                      </p>
                      <gr-coin>+{{ nf(it.coins) }} coins</gr-coin>
                    </div>
                    @if (it.texto) { <p class="mt-2.5 rounded-sm bg-black/25 px-2.5 py-2 text-body-s break-words text-white [overflow-wrap:anywhere]">{{ sinIds(it.texto) }}</p> }
                  </div>
                </li>
              }
              @case ('banner') {
                <li class="px-4 py-2">
                  <div class="overflow-hidden rounded-md border border-line-subtle bg-bg-raised">
                    <p class="flex items-center justify-between gap-2 px-3 py-2">
                      <span class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">Patrocinado</span>
                      @if (it.tier) { <span class="inline-flex h-5 items-center rounded-pill border px-2 font-mono text-[11px] tracking-[0.08em] uppercase" [class]="tier(it.tier)">{{ it.tier }}</span> }
                    </p>
                    @if (imagen(it); as img) {
                      <img [src]="img" [alt]="'Banner de ' + it.patrocinador" class="aspect-[3/1] w-full object-cover" loading="lazy" (error)="falloImagen(it.id)" />
                    } @else {
                      <!-- la imagen no carga: bloque de marca del diseño (degradado + nombre del patrocinador) -->
                      <div class="flex aspect-[3/1] w-full items-center justify-center bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] px-4">
                        <span class="text-center font-display text-[26px] leading-tight text-text-primary uppercase italic">{{ it.patrocinador }}</span>
                      </div>
                    }
                    <div class="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5">
                      <p class="min-w-0 flex-1 truncate text-label-s">{{ it.patrocinador }}</p>
                      <a class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-label-s text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary md:h-9"
                        [href]="it.clicUrl" target="_blank" rel="sponsored noopener">Visitar web <gr-icon name="external-link" [size]="14" /><span class="sr-only">(se abre en otra pestaña)</span></a>
                    </div>
                  </div>
                </li>
              }
              @case ('hito') {
                <li class="px-4 py-2">
                  <div class="gr-hito relative overflow-hidden rounded-md border border-warning/40 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] px-4 py-3.5 text-center shadow-[0_0_24px_rgb(245_158_11/0.18)]" role="status">
                    <p class="flex items-center justify-center gap-2 text-label-s text-text-primary">
                      <span class="flex size-6 items-center justify-center rounded-full bg-warning/20 text-warning"><gr-icon name="zap" [size]="14" /></span>¡Recompensa desbloqueada!
                    </p>
                    <p class="mt-2.5 flex flex-wrap justify-center gap-2">
                      <gr-coin>+{{ porraHito(it.mensajes) }} porra</gr-coin>
                      <gr-coin tipo="fantasy">+{{ nf(fantasyHito(it.mensajes)) }} fantasy</gr-coin>
                    </p>
                    <p class="mt-2 text-body-xs text-text-secondary">por tus {{ it.mensajes }} mensajes de hoy en el chat</p>
                  </div>
                </li>
              }
              @case ('sistema') {
                <li class="flex items-center gap-3 px-4 py-2.5" role="separator" [attr.aria-label]="it.texto">
                  <span class="h-px flex-1 bg-line-subtle"></span>
                  <span class="max-w-[75%] text-center text-body-xs text-text-tertiary">{{ it.texto }}</span>
                  <span class="h-px flex-1 bg-line-subtle"></span>
                </li>
              }
              @case ('borrado') {
                <li class="flex items-center gap-2 px-4 py-1.5 text-body-xs text-text-muted italic"><gr-icon name="shield" [size]="14" />{{ it.texto }}</li>
              }
            }
          }
        </ul>
      </div>

      @if (noLeido() > 0) {
        <button type="button" class="absolute bottom-[calc(var(--composer-h,0px)+12px)] left-1/2 z-10 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-pill border border-line-strong bg-bg-raised/95 px-4 text-label-s shadow-card backdrop-blur-sm transition-colors hover:border-text-muted md:h-9"
          [style.--composer-h.px]="altoComposer()" (click)="irAlFinal()">
          {{ noLeido() }} {{ noLeido() === 1 ? 'mensaje nuevo' : 'mensajes nuevos' }} <gr-icon name="arrow-down" [size]="14" class="text-accent-text" />
        </button>
      }

      <!-- composer -->
      <div #composer class="border-t border-line-subtle bg-bg-card px-4 pt-3 pb-3.5">
        @if (chat.soloLectura()) {
          <p class="flex items-center gap-2.5 rounded-md border border-line-subtle bg-bg-raised p-3 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="16" class="shrink-0" />Este día ya está cerrado: puedes leer el chat, pero no escribir.</p>
        } @else if (!fan.conSesion()) {
          <div class="rounded-md border border-accent/35 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-3.5">
            <div class="flex items-center gap-3">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/20 text-accent-text"><gr-icon name="users" [size]="18" /></span>
              <div class="min-w-0">
                <p class="text-label-m text-text-primary">Únete a la conversación</p>
                <p class="mt-0.5 text-body-xs text-text-secondary">Gratis y sin contraseña: te enviamos un enlace a tu email.</p>
              </div>
            </div>
            <p class="mt-3 flex flex-wrap gap-1.5" aria-label="Con tu cuenta de directo">
              <span class="inline-flex h-7 items-center gap-1.5 rounded-pill bg-black/25 pr-2.5 pl-2 text-label-xs text-text-secondary"><gr-icon name="send" [size]="12" class="text-accent-text" />Chatea</span>
              <span class="inline-flex h-7 items-center gap-1.5 rounded-pill bg-black/25 pr-2.5 pl-2 text-label-xs text-text-secondary"><gr-icon name="heart" [size]="12" class="text-accent-text" />Dona</span>
              <span class="inline-flex h-7 items-center gap-1.5 rounded-pill bg-black/25 pr-2.5 pl-2 text-label-xs text-text-secondary"><gr-icon name="trophy" [size]="12" class="text-accent-text" />Juega</span>
            </p>
            <button type="button" grButton variant="primary" [block]="true" class="mt-3" (click)="fan.abrirAcceso('chat')">Entrar al chat</button>
          </div>
        } @else if (chat.aviso(); as aviso) {
          <div class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-3" role="status">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"><gr-icon name="shield-alert" [size]="18" /></span>
            <div class="min-w-0">
              <p class="text-label-s text-warning">{{ aviso }}</p>
              <p class="mt-0.5 text-body-xs text-text-tertiary">Puedes seguir leyendo el chat; podrás escribir cuando termine el silencio.</p>
            </div>
          </div>
        } @else {
          @if (chat.modoLentoSeg() > 0) {
            <p class="mb-2 flex items-center gap-2 rounded-sm border border-line-subtle bg-bg-raised px-2.5 py-2 text-body-xs text-text-secondary">
              <gr-icon name="clock" [size]="14" class="shrink-0 text-info" /><span class="flex-1">Modo lento · 1 mensaje cada {{ chat.modoLentoSeg() }} s</span>
              @if (chat.esperaEnvio() > 0) { <span class="rounded-pill bg-accent-deep/45 px-2 py-0.5 font-mono text-[11px] text-accent-text" aria-live="off">{{ chat.esperaEnvio() }} s</span> }
            </p>
          }
          @if (chat.errorEnvio(); as error) {
            <p class="mb-2 flex items-start gap-2 rounded-sm border border-accent/40 bg-accent-deep/20 px-2.5 py-2 text-body-xs text-accent-text" role="alert">
              <gr-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" /><span class="flex-1">{{ error }}</span>
              <button type="button" aria-label="Cerrar el aviso" class="-m-2 flex size-8 shrink-0 items-center justify-center" (click)="chat.limpiarError()"><gr-icon name="x" [size]="14" /></button>
            </p>
          }
          @if (largo()) {
            <p class="mb-2 flex items-center gap-2 rounded-sm border border-warning/40 bg-warning/10 px-2.5 py-2 text-body-xs text-warning" role="alert">
              <gr-icon name="triangle-alert" [size]="14" class="shrink-0" />Te pasas de {{ maxTexto }} caracteres: acórtalo para enviarlo.
            </p>
          }
          <div class="relative">
            <div class="flex items-end gap-1 rounded-md border bg-bg-field p-1 transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-accent/30"
              [class]="largo() ? 'border-warning/70' : 'border-line-strong focus-within:border-accent-text'">
              <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-sm text-[20px] transition-colors hover:bg-white/5" aria-label="Emojis" [attr.aria-expanded]="emojis()" (click)="emojis.set(!emojis())">
                <span aria-hidden="true">😊</span>
              </button>
              <textarea #caja rows="1" class="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-[11px] text-body-s text-text-primary outline-none placeholder:text-text-muted focus-visible:outline-none [field-sizing:content]"
                placeholder="Escribe un mensaje…" aria-label="Mensaje del chat" [attr.aria-describedby]="'chat-ayuda'" [ngModel]="texto()" (ngModelChange)="texto.set($event)" (keydown.enter)="enter($event)" (keydown.escape)="emojis.set(false)"></textarea>
              <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-[10px] transition-[background,box-shadow,color]" aria-label="Enviar mensaje"
                [class]="puedeEnviar() ? 'bg-accent-grain text-white hover:shadow-glow' : 'bg-bg-raised text-text-muted'" [disabled]="!puedeEnviar()" (click)="enviar()">
                <gr-icon name="send" [size]="18" />
              </button>
            </div>
            @if (emojis()) {
              <div class="absolute bottom-full left-0 z-20 mb-2 grid w-full max-w-[344px] grid-cols-6 gap-1 rounded-md border border-line-strong bg-bg-raised p-2 shadow-card sm:grid-cols-8" role="group" aria-label="Emojis frecuentes" (keydown.escape)="emojis.set(false)">
                @for (e of emojisLista; track e) {
                  <button type="button" class="flex h-11 items-center justify-center rounded-sm text-[20px] transition-colors hover:bg-white/8 md:h-10" [attr.aria-label]="'Emoji ' + e" (click)="ponerEmoji(e)">{{ e }}</button>
                }
              </div>
            }
          </div>
          <p id="chat-ayuda" class="mt-2 flex items-center gap-1.5 text-body-xs text-text-tertiary">
            <gr-icon name="zap" [size]="12" class="shrink-0 text-warning" /><span class="min-w-0 flex-1 truncate">Cada 5 mensajes: +100 porra · +10.000 fantasy</span>
            @if (texto().length > 0) { <span class="shrink-0 font-mono text-[11px] tracking-[0.08em]" [class]="contadorClase()">{{ texto().length }}/{{ maxTexto }}</span> }
          </p>
        }
      </div>
    </div>
  `,
})
export class ChatView {
  readonly chat = inject(ChatService);
  protected readonly fan = inject(FanSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The panel asks for the donate dialog (kept for the panel binding; Donar lives in the header). */
  readonly donar = output<void>();

  protected readonly maxTexto = MAX_TEXTO;
  protected readonly texto = signal('');
  /** Banners cuya imagen no carga: se sustituyen por el bloque de marca. */
  private readonly imagenFalla = signal<ReadonlySet<string>>(new Set());
  protected readonly emojis = signal(false);
  protected readonly emojisLista = EMOJIS;
  protected readonly sugerencias = SUGERENCIAS;
  /** New messages that arrived while the user was not at the bottom. */
  protected readonly noLeido = signal(0);
  /** True when the list is scrolled to the bottom (the autoscroll follows it). */
  private readonly pegado = signal(true);

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  private readonly caja = viewChild<ElementRef<HTMLTextAreaElement>>('caja');
  private readonly composer = viewChild<ElementRef<HTMLElement>>('composer');

  /** Items with their grouping: consecutive messages of the same author (≤ 3 min) share one header. */
  protected readonly filas = computed<Fila[]>(() => {
    const out: Fila[] = [];
    let prev: ChatItem | undefined;
    for (const it of this.chat.items()) {
      const cont =
        it.kind === 'msg' && !it.borrado && prev?.kind === 'msg' && !prev.borrado &&
        prev.alias === it.alias && prev.mio === it.mio && prev.atleta === it.atleta && it.ts - prev.ts < VENTANA_GRUPO_MS;
      out.push({ it, cont });
      prev = it;
    }
    return out;
  });

  protected readonly largo = computed(() => this.texto().length > MAX_TEXTO);
  protected readonly contadorClase = computed(() =>
    this.largo() ? 'text-accent-text' : this.texto().length >= AVISO_TEXTO ? 'text-warning' : 'text-text-muted',
  );

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

  /** Row classes of a message: first of a group, continuation, athlete (red tint + bar). */
  protected claseMsg(atleta: boolean, cont: boolean): string {
    const pos = cont ? 'pt-0.5 pb-1' : 'pt-2 pb-1';
    if (atleta) return `${pos} border-l-2 border-accent bg-accent/8 ${cont ? 'pl-[58px]' : 'pl-3.5'}`;
    return `${pos} ${cont ? 'pl-[60px]' : 'pl-4'}`;
  }

  /** Tier chip of a banner (oro · plata · bronce, the medal colours). */
  protected tier(t: string): string {
    const k = t.toLowerCase();
    if (k === 'oro') return 'border-[#d4af37]/45 bg-[#d4af37]/15 text-[#e3c25a]';
    if (k === 'plata') return 'border-[#c0c4cc]/45 bg-[#c0c4cc]/12 text-[#d4dae0]';
    if (k === 'bronce') return 'border-[#c8835a]/45 bg-[#c8835a]/15 text-[#d79a66]';
    return 'border-line-strong bg-bg-surface text-text-secondary';
  }

  protected altoComposer(): number {
    return this.composer()?.nativeElement.offsetHeight ?? 0;
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
    this.texto.set(this.texto() + e);
    this.emojis.set(false);
    this.enfocar();
  }

  /** An ice-breaker fills the box (the fan still decides to send it). */
  protected sugerir(s: string): void {
    this.texto.set(s);
    this.enfocar();
  }

  private enfocar(): void {
    queueMicrotask(() => {
      const c = this.caja()?.nativeElement;
      if (!c) return;
      c.focus();
      c.setSelectionRange(c.value.length, c.value.length);
    });
  }
}
