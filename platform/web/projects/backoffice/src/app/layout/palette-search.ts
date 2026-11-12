import { Injectable, inject, signal } from '@angular/core';
import type { BoPaletteGroup, BoPaletteItem } from '../shared/kit';
import { Auth } from '../core/auth';
import { AtletasApi } from '../pages/atletas/api';
import { EntradasApi } from '../pages/entradas/api';
import { ContactosApi } from '../pages/contactos/api';
import { ALL_ITEMS } from './nav';

type Hit = BoPaletteItem & { url: string };
const RECENT_KEY = 'bo.palette.recientes';

/** ⌘K search (Figma 49 «BO / Command palette»): actions + pages + existing ?q= searches (athletes, ticketing, crm) in parallel. No new endpoint. */
@Injectable({ providedIn: 'root' })
export class PaletteSearch {
  private readonly auth = inject(Auth);
  private readonly atletas = inject(AtletasApi);
  private readonly entradas = inject(EntradasApi);
  private readonly contactos = inject(ContactosApi);
  readonly groups = signal<BoPaletteGroup[]>([]);
  readonly loading = signal(false);
  private readonly urls = new Map<string, string>();
  private seq = 0;

  url(it: BoPaletteItem): string | undefined { return this.urls.get(it.id); }

  /** Stores the picked item so «Recientes» shows it next time (max 5, per browser). */
  remember(it: BoPaletteItem): void {
    const u = this.urls.get(it.id);
    if (!u || it.id.startsWith('act:') || it.id.startsWith('pag:')) return;
    const list = [{ ...it, url: u }, ...this.recent().filter((r) => r.id !== it.id)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }

  async search(cid: string | undefined, slug: string | undefined, raw: string): Promise<void> {
    const q = raw.trim(), id = ++this.seq, base = `/${slug}/`;
    const can = (p?: string) => !p || this.auth.can(cid, p);
    const put = (hits: Hit[]) => hits.map((h) => (this.urls.set(h.id, h.url), h as BoPaletteItem));
    if (!q) {
      const acciones: (Hit & { perm?: string })[] = [
        { id: 'act:entrada', icon: 'plus', title: 'Nueva entrada manual', kbd: 'N E', url: base + 'entradas/reservas', perm: 'entradas.gestionar' },
        { id: 'act:escaner', icon: 'scan', title: 'Abrir escáner de check-in', kbd: 'G C', url: base + 'checkin/escaner', perm: 'checkin.escanear' },
        { id: 'act:horarios', icon: 'upload', title: 'Publicar horarios', url: base + 'horarios', perm: 'horarios.publicar' },
      ].filter((a) => can(a.perm)).map(({ perm: _p, ...a }) => a as Hit);
      this.groups.set([{ label: 'Acciones', items: put(acciones) }, { label: 'Recientes', items: put(this.recent()) }]);
      this.loading.set(false);
      return;
    }
    const ql = q.toLowerCase();
    const paginas: Hit[] = ALL_ITEMS.filter((i) => can(i.perm) && i.label.toLowerCase().includes(ql)).slice(0, 4)
      .map((i) => ({ id: 'pag:' + i.path, icon: i.icon, title: i.label, sub: 'Página', url: base + i.path }));
    this.groups.set([{ label: 'Páginas · ' + paginas.length, items: put(paginas) }]);
    if (!cid || q.length < 2) { this.loading.set(false); return; }
    this.loading.set(true);
    await new Promise((r) => setTimeout(r, 200));
    if (id !== this.seq) return;
    const [a, e, c] = await Promise.allSettled([
      can('atletas.editar') ? this.atletas.lista(cid, { q, por: 3, pagina: 1 }) : Promise.reject(),
      can('entradas.gestionar') ? this.entradas.lista(cid, { q, pagina: 1 }) : Promise.reject(),
      can('contactos.ver') ? this.contactos.lista(cid, { q, pagina: 1 }) : Promise.reject(),
    ]);
    if (id !== this.seq) return;
    const g = (label: string, hits: Hit[]): BoPaletteGroup => ({ label: `${label} · ${hits.length}`, items: put(hits) });
    const at: Hit[] = a.status === 'fulfilled' ? a.value.items.slice(0, 3).map((x) => ({ id: 'atl:' + x.id, icon: 'user', title: x.nombreCompleto, sub: [x.categoria, x.club, x.flight && 'Flight ' + x.flight].filter(Boolean).join(' · '), url: base + 'atletas/' + x.id })) : [];
    const en: Hit[] = e.status === 'fulfilled' ? e.value.items.slice(0, 3).map((x) => ({ id: 'ent:' + x.id, icon: 'ticket', title: `${x.codigo} · ${x.nombre} ${x.apellidos}`.trim(), sub: `${x.sesion} · ${x.personas} ${x.personas === 1 ? 'persona' : 'personas'}`, url: base + 'entradas/reservas?q=' + encodeURIComponent(x.codigo) })) : [];
    const co: Hit[] = c.status === 'fulfilled' ? c.value.items.slice(0, 3).map((x) => ({ id: 'con:' + x.id, icon: 'users', title: x.email || x.nombre, sub: [x.nombre, x.origen && 'origen ' + x.origen].filter(Boolean).join(' · '), url: base + 'contactos/' + x.id })) : [];
    this.groups.set([g('Páginas', paginas), g('Atletas', at), g('Entradas', en), g('Contactos', co)].filter((x) => x.items.length));
    this.loading.set(false);
  }

  private recent(): Hit[] {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Hit[]; } catch { return []; }
  }
}
