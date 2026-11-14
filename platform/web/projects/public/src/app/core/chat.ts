import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';
import { FanSession } from './fan';

/**
 * Chat of the live page (service `chat`, contract §4).
 *
 * Transport: WebSocket (`/chat/ws`) with exponential backoff and jitter; if the socket fails twice in a row the
 * client switches to SSE (`/chat/stream`, which resumes with `Last-Event-ID`) and sends through REST
 * (`POST /chat/mensajes`). The history comes from `GET /chat/mensajes`.
 *
 * Nothing here touches `window`, `WebSocket` or `EventSource` on the server: the service is inert during SSR.
 */

/** Frames the server sends (internal/chat/sala.go). */
export interface ChatFrame {
  t: 'msg' | 'donacion' | 'banner' | 'borrado' | 'sistema' | 'hito' | 'estado' | 'pong';
  id?: string;
  texto?: string;
  alias?: string;
  /**
   * Pseudonym of the fan (HMAC of its UUID with the key of the service): the real UUID never travels to the
   * clients. The service gives the own pseudonym in the room state (and in the greeting of the socket), so the
   * client can tell which messages are its own.
   */
  fanKey?: string;
  atleta?: boolean;
  /** Id of the deleted message (frame «borrado»): the room reader overwrites «id» with the id of the entry. */
  mensajeId?: string;
  ts?: number;
  cid?: string;
  conectados?: number;
  mensajes?: number;
  bannerId?: string;
  patrocinador?: string;
  imagenUrl?: string;
  imagenMovilUrl?: string;
  clicUrl?: string;
  tier?: string;
  /** Céntimos. */
  importe?: number;
  coins?: number;
  dia?: string;
  motivo?: string;
}

/** A message of the room. `mio` marks the ones written by this browser. */
export interface ChatMsg {
  kind: 'msg';
  id: string;
  alias: string;
  atleta: boolean;
  texto: string;
  ts: number;
  mio: boolean;
  cid?: string;
  /** Pseudonym of the author (never the UUID): it is compared with the own one to mark the message. */
  fanKey?: string;
  estado: 'pendiente' | 'enviado' | 'error';
  error?: string;
  borrado?: boolean;
}
export interface ChatDonacion {
  kind: 'donacion';
  id: string;
  alias: string;
  /** Céntimos. */
  importe: number;
  coins: number;
  texto: string;
  ts: number;
}
export interface ChatBanner {
  kind: 'banner';
  id: string;
  patrocinador: string;
  imagenUrl: string;
  imagenMovilUrl?: string;
  clicUrl: string;
  tier: string;
  ts: number;
}
export interface ChatSistema {
  kind: 'sistema';
  id: string;
  texto: string;
  ts: number;
}
export interface ChatHito {
  kind: 'hito';
  id: string;
  mensajes: number;
  ts: number;
}
/** A message deleted by the moderation. */
export interface ChatBorrado {
  kind: 'borrado';
  id: string;
  texto: string;
  ts: number;
}
export type ChatItem = ChatMsg | ChatDonacion | ChatBanner | ChatSistema | ChatHito | ChatBorrado;

/** Connection state shown in the panel. */
export type ChatEstado = 'conectado' | 'reconectando' | 'sin-conexion';
/** Transport in use: WebSocket or the SSE fallback (then the sending goes through REST). */
export type ChatTransporte = 'ws' | 'sse';

/** Public state of the room (`GET /chat/estado`). */
export interface ChatEstadoSala {
  conectados: number;
  salaActiva: boolean;
  modoLentoSeg: number;
  dia: string;
  /** Pseudonym of the fan of the request (empty when the request is anonymous). */
  fanKey?: string;
}

export interface ChatHistorial {
  dia: string;
  mensajes: ChatFrame[];
}

/** Maximum number of items kept in memory. */
const MAX_ITEMS = 300;
/** Maximum length of a message (runas, like the backend). */
export const MAX_TEXTO = 280;

const hoyMadrid = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** Day of the room in Europe/Madrid (the backend's `hoy()`). */
export function diaDeHoy(): string {
  return hoyMadrid();
}

/** ws:// or wss:// from the current location (the browser only). */
function wsUrl(ruta: string, params: Record<string, string | undefined>): string {
  const loc = location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const qs = q.toString();
  return `${proto}//${loc.host}${ruta}${qs ? '?' + qs : ''}`;
}

/** Short human label of a day («sáb 21 nov»). */
export function etiquetaDia(dia: string): string {
  const d = new Date(dia + 'T12:00:00Z');
  if (isNaN(d.getTime())) return dia;
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(d)
    .replace(',', '');
}

/** Un UUID (o un id de mensaje) dentro del texto de un mensaje: nunca se enseña (son ids internos). */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Id de stream del chat («1794179057593-0»). */
const ID_STREAM = /\b\d{10,}-\d+\b/g;

/** Limpia el texto de un mensaje: fuera los identificadores internos (UUID e ids del stream). */
export function sinIds(texto: string): string {
  return texto.replace(UUID, '…').replace(ID_STREAM, '…').replace(/\s{2,}/g, ' ').trim();
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly fan = inject(FanSession);
  private readonly base = `/api/competiciones/${COMPETITION_SLUG}/chat`;

  /** The list of the room (messages, donations, banners, milestones). */
  readonly items = signal<ChatItem[]>([]);
  /** Connection state. */
  readonly estado = signal<ChatEstado>('sin-conexion');
  /** Transport in use. */
  readonly transporte = signal<ChatTransporte>('ws');
  /** People connected (presence frame every 10 s). */
  readonly conectados = signal(0);
  /** The room is open (config `activo`). */
  readonly salaActiva = signal(true);
  /** Seconds between messages in slow mode (0 = off). */
  readonly modoLentoSeg = signal(0);
  /** Day of the room being shown. */
  readonly dia = signal<string>(diaDeHoy());
  /** True when the day shown is not today: history only, no sending. */
  readonly soloLectura = computed(() => this.dia() !== diaDeHoy());
  /** Phase of the live (set by /en-directo): before or after it, today's room is read-only too. */
  readonly fase = signal<'antes' | 'en_directo' | 'finalizado'>('en_directo');
  /** No sending: a past day, or today outside the live. */
  readonly cerrado = computed(() => this.soloLectura() || this.fase() !== 'en_directo');
  /** Last error when sending (the backend's detail). */
  readonly errorEnvio = signal<string | null>(null);
  /** Notice about the moderation (silence) received from the server. */
  readonly aviso = signal<string | null>(null);
  /** Seconds left to send in slow mode (countdown). */
  readonly esperaEnvio = signal(0);
  /**
   * Pseudonym of the own fan (the service never sends the UUID of a fan): the frames carry this value and the
   * client compares them to know which messages are its own.
   */
  readonly miHash = signal<string>('');

  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private ping: ReturnType<typeof setInterval> | undefined;
  private cuentaAtras: ReturnType<typeof setInterval> | undefined;
  private intentosWs = 0;
  private erroresSse = 0;
  private ultimoId = '';
  private vivo = false;

  /** Opens (or reopens) the room of a day. Browser only. */
  conectar(dia?: string): void {
    if (!this.browser) return;
    const d = dia ?? this.dia();
    if (this.vivo && this.dia() === d) return;
    this.dia.set(d);
    this.ultimoId = '';
    this.items.set([]);
    this.errorEnvio.set(null);
    this.aviso.set(null);
    this.vivo = true;
    this.intentosWs = 0;
    this.erroresSse = 0;
    void this.cargarEstadoSala();
    // El historial de la sala (los últimos mensajes): el socket solo trae lo que pasa desde que te conectas.
    void this.cargarHistorial(d);
    this.anadir([
      {
        kind: 'sistema',
        id: 'hola-' + d,
        texto: this.soloLectura() ? `Estás viendo el chat del ${etiquetaDia(d)} (solo lectura)` : 'Te has unido al chat · Sé respetuoso con atletas y público',
        ts: Date.now(),
      },
    ]);
    if (this.soloLectura()) {
      // Un día pasado es solo historial: ni socket ni envío.
      this.pararWs();
      this.pararSse();
      this.estado.set('sin-conexion');
      return;
    }
    this.abrirWs();
  }

  /** Closes the connection (the page leaves the live). */
  desconectar(): void {
    this.vivo = false;
    this.pararWs();
    this.pararSse();
    clearTimeout(this.temporizador);
    clearInterval(this.ping);
    clearInterval(this.cuentaAtras);
    this.estado.set('sin-conexion');
  }

  /** History of a day (`GET /chat/mensajes`): the backend answers newest first. */
  async cargarHistorial(dia: string): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<ChatHistorial>(`${this.base}/mensajes`, { params: { dia, limite: 50 } }));
      const items = (r?.mensajes ?? []).slice().reverse().map((f) => this.aItem(f)).filter((i): i is ChatItem => !!i);
      this.anadir(items);
      const ultimo = this.items()
        .filter((i): i is ChatMsg => i.kind === 'msg' && !i.id.startsWith('local-'))
        .map((i) => i.id)
        .pop();
      if (ultimo) this.ultimoId = ultimo;
    } catch {
      /* the panel shows the error state */
    }
  }

  /** Public state of the room (`GET /chat/estado`). */
  async cargarEstadoSala(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<ChatEstadoSala>(`${this.base}/estado`));
      if (!r) return;
      this.conectados.set(r.conectados);
      this.salaActiva.set(r.salaActiva);
      this.modoLentoSeg.set(r.modoLentoSeg);
      if (r.fanKey) {
        this.miHash.set(r.fanKey);
        this.recalcularMios();
      }
    } catch {
      /* nothing */
    }
  }

  /**
   * Sends a message: optimistic (it appears at once) with a `cid` for the deduplication of retries.
   * Returns false when the message could not be published (the error is in `errorEnvio()`).
   */
  async enviar(texto: string): Promise<boolean> {
    const limpio = texto.trim();
    if (!limpio) return false;
    if (this.soloLectura()) {
      this.errorEnvio.set('Este día ya está cerrado: solo se puede leer.');
      return false;
    }
    if (!this.fan.conSesion()) {
      this.fan.abrirAcceso('chat');
      return false;
    }
    const cid = this.nuevoCid();
    const mio: ChatMsg = {
      kind: 'msg',
      id: 'local-' + cid,
      alias: this.fan.yo()?.alias ?? 'Tú',
      atleta: this.fan.yo()?.tipo === 'atleta',
      texto: limpio,
      ts: Date.now(),
      mio: true,
      cid,
      estado: 'pendiente',
    };
    this.anadir([mio]);
    this.errorEnvio.set(null);
    const ok = await this.publicar(limpio, cid, mio);
    if (!ok) return false;
    if (this.modoLentoSeg() > 0) this.contarEspera(this.modoLentoSeg());
    return true;
  }

  /** Retries a message that failed. */
  async reintentar(m: ChatMsg): Promise<void> {
    if (!m.cid) return;
    this.items.update((l) => l.map((i) => (i.kind === 'msg' && i.cid === m.cid ? { ...i, estado: 'pendiente', error: undefined } : i)));
    const ok = await this.publicar(m.texto, m.cid, m);
    if (!ok) return;
    if (this.modoLentoSeg() > 0) this.contarEspera(this.modoLentoSeg());
  }

  /** Removes the error of the composer. */
  limpiarError(): void {
    this.errorEnvio.set(null);
    this.aviso.set(null);
  }

  /**
   * Reports a message for the moderation (`POST /mensajes/{id}/reportar`): the day of the room travels with the
   * report, because the id of the stream is only unique inside a room (without it the report would fall on the
   * most recent message with that id, maybe of another jornada). Returns the number of reports of the message.
   */
  async reportar(id: string, motivo?: string): Promise<number> {
    try {
      const r = await firstValueFrom(this.http.post<{ reportes: number }>(`${this.base}/mensajes/${id}/reportar`, { motivo }, { params: { dia: this.dia() } }));
      return r?.reportes ?? 0;
    } catch {
      return 0;
    }
  }

  // ------------------------------------------------------------- transporte

  private abrirWs(): void {
    if (!this.browser || !this.vivo) return;
    this.pararWs();
    this.pararSse();
    this.transporte.set('ws');
    const url = wsUrl(`${this.base}/ws`, { dia: this.dia(), desde: this.ultimoId || undefined });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.wsFallo();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.intentosWs = 0;
      this.estado.set('conectado');
      clearInterval(this.ping);
      // the server closes the socket after 90 s without a read: the ping keeps it alive
      this.ping = setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ t: 'ping' })), 30000);
    };
    ws.onmessage = (ev) => {
      const f = this.parse(ev.data);
      if (f) this.aplicar(f);
    };
    ws.onerror = () => {
      /* the close event does the rest */
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.ping);
      if (!this.vivo) return;
      // 1012: the pod is shutting down (scale-down/rollout), not a failure: reconnect soon to another pod
      // with ?desde, without counting towards the SSE fallback.
      if (ev.code === 1012) {
        this.estado.set('reconectando');
        clearTimeout(this.temporizador);
        this.temporizador = setTimeout(() => this.vivo && this.abrirWs(), 200 + Math.random() * 800);
        return;
      }
      this.wsFallo();
    };
  }

  /** A WebSocket failure: two in a row and the client switches to SSE. */
  private wsFallo(): void {
    if (!this.vivo) return;
    this.intentosWs++;
    this.estado.set('reconectando');
    if (this.intentosWs >= 2) {
      this.abrirSse();
      return;
    }
    this.programarReintento();
  }

  /** Reconnection with exponential backoff and jitter. */
  private programarReintento(): void {
    clearTimeout(this.temporizador);
    const base = Math.min(30000, 1000 * Math.pow(2, Math.max(0, this.intentosWs - 1)));
    const jitter = base * 0.3 * (Math.random() * 2 - 1);
    this.temporizador = setTimeout(() => {
      if (!this.vivo) return;
      this.abrirWs();
    }, Math.max(500, base + jitter));
  }

  /** SSE fallback: the browser re-sends `Last-Event-ID` on its own. */
  private abrirSse(): void {
    if (!this.browser || !this.vivo) return;
    this.pararWs();
    this.transporte.set('sse');
    const q = new URLSearchParams({ dia: this.dia() });
    if (this.ultimoId) q.set('desde', this.ultimoId);
    const es = new EventSource(`${this.base}/stream?${q.toString()}`);
    this.es = es;
    es.onopen = () => {
      this.erroresSse = 0;
      this.estado.set('conectado');
    };
    es.onerror = () => {
      if (!this.vivo) return;
      this.erroresSse++;
      this.estado.set('reconectando');
      if (this.erroresSse >= 3) {
        // the SSE does not work either: back to the WebSocket
        this.erroresSse = 0;
        this.intentosWs = 0;
        this.abrirWs();
      }
    };
    for (const t of ['msg', 'donacion', 'banner', 'borrado', 'sistema', 'hito', 'estado', 'pong']) {
      es.addEventListener(t, (ev) => {
        const f = this.parse((ev as MessageEvent).data);
        if (f) this.aplicar(f);
      });
    }
    es.addEventListener('reconectar', () => this.estado.set('reconectando'));
  }

  private pararWs(): void {
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
  }

  private pararSse(): void {
    const es = this.es;
    this.es = null;
    if (es) es.close();
  }

  /** Publishes a message: WebSocket when it is open, REST otherwise (SSE mode). */
  private async publicar(texto: string, cid: string, mio: ChatMsg): Promise<boolean> {
    if (this.transporte() === 'ws' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: 'msg', texto, cid }));
      return true;
    }
    try {
      await firstValueFrom(this.http.post(`${this.base}/mensajes`, { texto, cid }));
      this.marcarEnviado(cid);
      return true;
    } catch (e) {
      const detalle = e instanceof HttpErrorResponse ? (e.error?.detail as string) || (e.error?.code as string) || 'No se ha podido enviar.' : 'No se ha podido enviar.';
      this.errorEnvio.set(detalle);
      this.items.update((l) => l.map((i) => (i.kind === 'msg' && i.cid === cid ? { ...i, estado: 'error', error: detalle } : i)));
      return false;
    }
  }

  private marcarEnviado(cid: string): void {
    this.items.update((l) => l.map((i) => (i.kind === 'msg' && i.cid === cid ? { ...i, estado: 'enviado' } : i)));
  }

  // ------------------------------------------------------------- frames

  private parse(datos: unknown): ChatFrame | null {
    if (typeof datos !== 'string') return null;
    try {
      const f = JSON.parse(datos) as ChatFrame;
      return f && typeof f.t === 'string' ? f : null;
    } catch {
      return null;
    }
  }

  /** Applies a frame of the server to the list. */
  private aplicar(f: ChatFrame): void {
    if (f.id) this.ultimoId = f.id;
    switch (f.t) {
      case 'msg': {
        // The author's own message comes back with its `cid`: it confirms the optimistic one.
        const mio = this.items().find((i) => i.kind === 'msg' && i.cid && i.cid === f.cid);
        if (mio && mio.kind === 'msg') {
          this.items.update((l) => l.map((i) => (i.kind === 'msg' && i.cid === f.cid ? { ...i, id: f.id ?? i.id, estado: 'enviado', error: undefined } : i)));
          return;
        }
        if (f.cid && this.items().some((i) => i.kind === 'msg' && i.cid === f.cid)) return; // duplicate
        const item = this.aItem(f);
        if (item) this.anadir([item]);
        return;
      }
      case 'donacion': {
        const item = this.aItem(f);
        if (item) this.anadir([item]);
        return;
      }
      case 'banner': {
        const item = this.aItem(f);
        if (item) this.anadir([item]);
        return;
      }
      case 'borrado': {
        // The backend injects the id of the deleted message in «mensajeId», but the room reader overwrites «id»
        // with the id of the stream entry of the deletion: the message is looked up by «mensajeId» (with «id»
        // as a fallback). When it matches nothing, the deletion is shown as its own line.
        const id = f.mensajeId ?? f.id ?? '';
        if (id && this.items().some((i) => i.kind === 'msg' && i.id === id)) {
          this.items.update((l) => l.map((i) => (i.kind === 'msg' && i.id === id ? { ...i, borrado: true } : i)));
          return;
        }
        const borrado: ChatBorrado = { kind: 'borrado', id: id || 'b' + f.ts, texto: 'Mensaje eliminado por moderación', ts: f.ts ?? Date.now() };
        this.anadir([borrado]);
        return;
      }
      case 'hito': {
        const item = this.aItem(f);
        if (item) this.anadir([item]);
        return;
      }
      case 'sistema': {
        // The server answers the errors of the socket with a `sistema` frame (code + detail).
        const motivo = f.motivo ?? '';
        if (motivo && /^[A-Z0-9_]+$/.test(motivo)) {
          if (motivo === 'SILENCIADO') this.aviso.set(f.texto ?? 'Un moderador te ha silenciado temporalmente.');
          else if (motivo.startsWith('SESION_FAN')) {
            this.fan.sesionPerdida();
            this.aviso.set(f.texto ?? 'Tu sesión ya no está activa. Vuelve a entrar.');
          } else this.errorEnvio.set(f.texto ?? 'No se ha podido enviar el mensaje.');
          return;
        }
        const item = this.aItem(f);
        if (item) this.anadir([item]);
        return;
      }
      case 'estado': {
        if (typeof f.conectados === 'number') this.conectados.set(f.conectados);
        if (f.dia) this.dia.set(f.dia);
        if (f.motivo === 'conectado') this.estado.set('conectado');
        if (f.fanKey) {
          this.miHash.set(f.fanKey);
          this.recalcularMios();
        }
        return;
      }
      default:
        return;
    }
  }

  /** Turns a frame into an item of the list (null when it is not shown). */
  private aItem(f: ChatFrame): ChatItem | null {
    const ts = f.ts ?? Date.now();
    switch (f.t) {
      case 'msg':
        return {
          kind: 'msg',
          id: f.id ?? 'x' + ts,
          alias: f.alias ?? 'Anónimo',
          atleta: !!f.atleta,
          texto: f.texto ?? '',
          ts,
          mio: !!f.fanKey && f.fanKey === this.miHash(),
          fanKey: f.fanKey,
          cid: f.cid,
          estado: 'enviado',
        };
      case 'donacion':
        return {
          kind: 'donacion',
          id: f.id ?? 'd' + ts,
          alias: f.alias ?? 'Anónimo',
          importe: f.importe ?? 0,
          coins: f.coins ?? 0,
          texto: f.texto ?? '',
          ts,
        };
      case 'banner':
        return {
          kind: 'banner',
          id: f.id ?? 'b' + ts,
          patrocinador: f.patrocinador ?? '',
          imagenUrl: f.imagenUrl ?? '',
          imagenMovilUrl: f.imagenMovilUrl,
          clicUrl: f.clicUrl ?? '',
          tier: f.tier ?? '',
          ts,
        };
      case 'hito':
        return { kind: 'hito', id: f.id ?? 'h' + ts, mensajes: f.mensajes ?? 0, ts };
      case 'borrado':
        // history: a message deleted by moderation keeps its placeholder
        return { kind: 'borrado', id: f.id ?? 'b' + ts, texto: 'Mensaje eliminado por moderación', ts };
      case 'sistema':
        return { kind: 'sistema', id: f.id ?? 's' + ts, texto: f.texto ?? '', ts };
      default:
        return null;
    }
  }

  /** Adds items to the list (removing duplicates and keeping the last 300). */
  private anadir(nuevos: ChatItem[]): void {
    if (!nuevos.length) return;
    this.items.update((l) => this.dedup([...l, ...nuevos]).slice(-MAX_ITEMS));
  }

  /**
   * The own pseudonym arrives with the state of the room: the messages already in the list are marked now
   * (the history and the state travel in parallel).
   */
  private recalcularMios(): void {
    const hash = this.miHash();
    if (!hash) return;
    this.items.update((l) => l.map((i) => (i.kind === 'msg' && i.fanKey ? { ...i, mio: i.fanKey === hash } : i)));
  }

  /** Removes duplicated items (same id) keeping the last one. */
  private dedup(l: ChatItem[]): ChatItem[] {
    const vistos = new Set<string>();
    const out: ChatItem[] = [];
    for (let i = l.length - 1; i >= 0; i--) {
      const it = l[i];
      const k = it.kind + ':' + it.id;
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.unshift(it);
    }
    return out;
  }

  /** Countdown of the slow mode after sending. */
  private contarEspera(seg: number): void {
    clearInterval(this.cuentaAtras);
    this.esperaEnvio.set(seg);
    this.cuentaAtras = setInterval(() => {
      const n = this.esperaEnvio() - 1;
      this.esperaEnvio.set(Math.max(0, n));
      if (n <= 0) clearInterval(this.cuentaAtras);
    }, 1000);
  }

  private nuevoCid(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
  }
}
