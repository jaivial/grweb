import { Injectable, inject, signal } from '@angular/core';
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

  readonly connected = signal(false);
  readonly events = new Subject<LiveEvent>();
  readonly resync = new Subject<void>();

  connect(cid: string): void {
    if (this.cid === cid && this.ctrl) return;
    this.disconnect();
    this.cid = cid;
    this.lastId = '';
    void this.run();
  }

  disconnect(): void {
    this.ctrl?.abort();
    this.ctrl = null;
    this.connected.set(false);
  }

  private async run(): Promise<void> {
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    while (!ctrl.signal.aborted) {
      const token = await this.auth.freshToken();
      if (!token) {
        this.connected.set(false);
        return;
      }
      try {
        await fetchEventSource(`/api/admin/competiciones/${this.cid}/stream`, {
          signal: ctrl.signal,
          openWhenHidden: true,
          headers: { Authorization: `Bearer ${token}`, ...(this.lastId ? { 'Last-Event-ID': this.lastId } : {}) },
          onopen: async (res) => {
            if (res.ok && res.headers.get('content-type')?.startsWith(EventStreamContentType)) {
              this.connected.set(true);
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
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
      }
    }
  }
}
