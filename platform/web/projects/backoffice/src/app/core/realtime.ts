import { Injectable, computed, inject, signal } from '@angular/core';
import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source';
import { Subject } from 'rxjs';
import { Auth } from './auth';

export interface LiveEvent {
  id: string;
  tipo: string;
  entidad?: string;
  datos?: Record<string, unknown>;
  actor?: string;
  origen?: string;
  fecha: string;
}

class Retry extends Error {}

/** The server writes a `: ping` comment every 15 s on the stream: two intervals without data mean it is dead. */
const PING_MS = 15_000;

/** Connection state shown by `bo-live-status` (Figma 48/50): offline after 3 failed attempts or without network. */
export type RealtimeStatus = 'connected' | 'reconnecting' | 'offline' | 'paused';

/**
 * Admin real-time channel: GET /api/admin/competiciones/{cid}/stream (SSE over fetch so the bearer token can be sent).
 * Resumes with Last-Event-ID; control events: `reautenticar` (token expiring → refresh and reconnect),
 * `reconectar`, `resync` (history lost → screens reload their data).
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private readonly auth = inject(Auth);
  private ctrl: AbortController | null = null;
  private lastId = '';
  private cid = '';
  private readonly fallos = signal(0);
  private readonly activo = signal(false);
  /** Browser network state (window online/offline): offline is shown at once, coming back reconnects at once. */
  private readonly online = signal(typeof navigator === 'undefined' || navigator.onLine !== false);
  private wake: (() => void) | null = null;
  /** Last byte read from the stream (the server pings every 15 s, even when nothing happens). */
  private ultimo = 0;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', () => {
      this.online.set(false);
      this.connected.set(false);
    });
    window.addEventListener('online', () => {
      this.online.set(true);
      if (this.cid && this.activo() && !this.connected()) this.reconnect();
    });
  }

  readonly connected = signal(false);
  /** Spectators on /en-directo, set by the Directo desk while it is open (topbar «En directo · 342»). */
  readonly espectadores = signal<number | null>(null);
  /** Failed reconnection attempts since the last successful open. */
  readonly intentos = this.fallos.asReadonly();
  readonly status = computed<RealtimeStatus>(() =>
    !this.activo() ? 'paused' : !this.online() ? 'offline' : this.connected() ? 'connected' : this.fallos() >= 3 ? 'offline' : 'reconnecting');
  readonly events = new Subject<LiveEvent>();
  readonly resync = new Subject<void>();

  connect(cid: string): void {
    if (this.cid === cid && this.ctrl) return;
    this.disconnect();
    this.cid = cid;
    this.lastId = '';
    this.fallos.set(0);
    void this.run();
  }

  disconnect(): void {
    this.ctrl?.abort();
    this.ctrl = null;
    this.wake?.();
    this.connected.set(false);
    this.activo.set(false);
  }

  /** Forces a reconnection (the «Conexión en vivo perdida» banner of the screens). */
  reconnect(): void {
    if (!this.cid) return;
    this.disconnect();
    this.lastId = '';
    this.fallos.set(0);
    void this.run();
  }

  /**
   * Back from a frozen tab (iOS Safari): the stream died with the tab. It only reconnects when it is really down — no
   * connection, or no data at all (not even the server's `: ping`, every 15 s) for two whole ping intervals — so a
   * stream that came back healthy is left untouched instead of being aborted and logged as a failed request.
   */
  reanudar(): void {
    if (!this.cid || !this.activo()) return;
    const sano = this.connected() && this.ultimo > 0 && Date.now() - this.ultimo < 2 * PING_MS;
    if (sano) return;
    this.disconnect();
    this.fallos.set(0);
    void this.run();
  }

  /** Fetch of the stream that timestamps every chunk: the pings are SSE comments and never reach `onmessage`. */
  private async conActividad(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init);
    this.ultimo = Date.now();
    if (!res.body) return res;
    const [mio, lector] = res.body.tee();
    void (async () => {
      const r = lector.getReader();
      try {
        for (;;) {
          const { done } = await r.read();
          if (done) return;
          this.ultimo = Date.now();
        }
      } catch {
        /* el stream se cerró: lo decide el bucle de reconexión */
      }
    })();
    return new Response(mio, { status: res.status, statusText: res.statusText, headers: res.headers });
  }

  private async run(): Promise<void> {
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.activo.set(true);
    this.ultimo = Date.now();
    while (!ctrl.signal.aborted) {
      const token = await this.auth.freshToken();
      if (!token) {
        // no session: stop and show «paused» instead of an endless «Reconectando…»
        this.connected.set(false);
        this.activo.set(false);
        if (this.ctrl === ctrl) this.ctrl = null;
        return;
      }
      try {
        await fetchEventSource(`/api/admin/competiciones/${this.cid}/stream`, {
          signal: ctrl.signal,
          openWhenHidden: true,
          fetch: (input, init) => this.conActividad(input, init),
          headers: { Authorization: `Bearer ${token}`, ...(this.lastId ? { 'Last-Event-ID': this.lastId } : {}) },
          onopen: async (res) => {
            if (res.ok && res.headers.get('content-type')?.startsWith(EventStreamContentType)) {
              this.connected.set(true);
              this.fallos.set(0);
              return;
            }
            throw new Retry(String(res.status));
          },
          onmessage: (m) => {
            if (m.event === 'reautenticar' || m.event === 'reconectar') throw new Retry(m.event);
            if (m.event === 'resync') {
              this.resync.next();
              return;
            }
            if (m.id) this.lastId = m.id;
            if (!m.data) return;
            try {
              this.events.next(JSON.parse(m.data) as LiveEvent);
            } catch {
              /* ignore malformed */
            }
          },
          onclose: () => {
            throw new Retry('cerrado');
          },
          onerror: (err) => {
            throw err; // handled by the loop below (we control the back-off)
          },
        });
      } catch {
        this.connected.set(false);
        if (ctrl.signal.aborted) return;
        this.fallos.update((n) => n + 1);
        // exponential back-off with jitter, capped at 30 s
        const base = Math.min(30000, 2000 * 2 ** Math.min(this.fallos() - 1, 4));
        await new Promise<void>((r) => {
          const t = setTimeout(r, base + Math.random() * 2000);
          this.wake = () => {
            clearTimeout(t);
            r();
          };
        });
        this.wake = null;
      }
    }
  }
}
