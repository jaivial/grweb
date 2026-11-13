import { TituloMovil } from '../shared/ui';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import {
  GrAvatar, GrIcon, GrIconButton, GrIconTile, GrLogo, GrToasts, daysUntil, fmtAgo, fmtShortDate, type GrIconName,
} from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { Notifications } from '../core/notifications';
import { Realtime } from '../core/realtime';
import { SolicitudesContador } from '../core/solicitudes';
import type { Notificacion } from '../core/api';
import { BoCommandPalette, BoLiveStatus, BoNavItem, BoNotificationItem, BoWorkspaceSwitcher, type BoPaletteItem, type BoTone, type BoWorkspace } from '../shared/kit';
import { ALL_ITEMS, NAV, type NavItem } from './nav';
import { PaletteSearch } from './palette-search';
import { Outside } from './outside';
import { BoDosFactores, DosFactoresUi } from '../shared/dos-factores';

const nivelIcon: Record<Notificacion['nivel'], { icon: GrIconName; tone: BoTone }> = {
  info: { icon: 'bell', tone: 'info' },
  ok: { icon: 'circle-check', tone: 'success' },
  aviso: { icon: 'triangle-alert', tone: 'warning' },
  error: { icon: 'circle-x', tone: 'error' },
};

@Component({
  selector: 'bo-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, GrIcon, GrIconButton, GrAvatar, GrLogo, GrIconTile, Outside, BoNavItem, BoWorkspaceSwitcher, BoCommandPalette, BoLiveStatus, BoNotificationItem, BoDosFactores],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(Auth);
  protected readonly comps = inject(Competitions);
  protected readonly notifs = inject(Notifications);
  protected readonly live = inject(Realtime);
  protected readonly solicitudes = inject(SolicitudesContador);
  private readonly toasts = inject(GrToasts);
  private readonly router = inject(Router);
  private readonly tituloMovil = inject(TituloMovil);

  /** Figma 47/55: expanded sidebar at 1440. The saved «contraer» choice only applies to narrower desktops. */
  protected readonly collapsed = signal(typeof localStorage !== 'undefined' && localStorage.getItem('bo.collapsed') === '1' && typeof window !== 'undefined' && window.innerWidth < 1440);
  protected readonly mobileMenu = signal(false);
  protected readonly notifPanel = signal(false);
  protected readonly userMenu = signal(false);
  protected readonly palette = signal(false);
  protected readonly query = signal('');
  protected readonly url = signal(this.router.url);

  protected readonly comp = this.comps.current;
  protected readonly cid = computed(() => this.comp()?.id);
  protected readonly dosFactores = inject(DosFactoresUi);
  protected readonly exige2fa = computed(() => !!this.auth.user()?.competiciones.find((c) => c.competitionId === this.cid())?.exige2fa);
  /** One figure for the bell badge and its label (capped like the rail badges). */
  protected readonly unreadTxt = computed(() => { const n = this.notifs.unread(); return n > 99 ? '99+' : String(n); });
  protected readonly visible = (it: NavItem) => !it.perm || this.auth.can(this.cid(), it.perm);
  protected readonly nav = computed(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => this.visible(i)) })).filter((g) => g.items.length));
  /** Figma 49 tab bar order: Inicio · Check-in · Directo · Entradas · Más. */
  protected readonly tabs = computed(() => ['inicio', 'checkin', 'directo', 'entradas'].map((p) => ALL_ITEMS.find((i) => i.path === p)!).filter((i) => this.visible(i)));
  protected tabLabel(t: NavItem): string { return t.path === 'checkin' ? 'Check-in' : t.label.split(' ')[0]; }
  protected readonly search = inject(PaletteSearch);
  protected readonly workspaces = computed<BoWorkspace[]>(() => this.comps.list().map((c) => ({
    slug: c.slug, nombre: c.nombreCorto || c.nombre,
    detalle: c.estado === 'archivada' ? 'archivada · solo lectura' : [c.slug, c.fechaInicio && fmtShortDate(c.fechaInicio), this.auth.rolEn(c.id)].filter(Boolean).join(' · '),
  })));
  protected readonly workspace = computed(() => this.workspaces().find((w) => w.slug === this.comp()?.slug) ?? null);
  protected readonly paletteHint = computed(() => (/^grc-/i.test(this.query()) ? 'Los códigos de entrada tienen 4 caracteres tras GRC- · prueba con el email' : 'Prueba con el nombre, el email o el código de la entrada'));
  protected readonly pageTitle = computed(() => {
    const url = this.url();
    const extra = this.tituloMovil.texto();
    if (extra) return extra;
    if (url.includes('/atletas/solicitudes')) return 'Solicitudes';
    if (url.includes('/atletas/pesaje')) return 'Pesaje';
    if (url.includes('/atletas/inscripcion')) return 'Inscripción';
    if (url.includes('/sistema/whatsapp')) return 'WhatsApp';
    return ALL_ITEMS.find((i) => url.includes(`/${i.path}`))?.label ?? 'Backoffice';
  });
  protected readonly countdown = computed(() => {
    const c = this.comp();
    const d = daysUntil(c?.fechaInicio);
    if (!c || d === null) return null;
    if (d > 1) return `Faltan ${d} días · ${fmtShortDate(c.fechaInicio)}`;
    if (d === 1) return `Mañana · ${fmtShortDate(c.fechaInicio)}`;
    if (d === 0) return `Hoy · ${fmtShortDate(c.fechaInicio)}`;
    return `Celebrada · ${fmtShortDate(c.fechaInicio)}`;
  });
  protected readonly nivelIcon = nivelIcon;
  protected readonly ago = fmtAgo;

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.mobileMenu.set(false);
    });
    effect(() => {
      const id = this.cid();
      if (!id) return;
      this.live.connect(id);
      void this.notifs.load(id);
      void this.solicitudes.cargar(id);
    });
    const sub = this.live.events.subscribe((e) => {
      const id = this.cid();
      if (!id) return;
      if (e.tipo === 'notificacion.nueva' && e.datos) {
        const d = e.datos as unknown as Notificacion;
        this.notifs.push({ ...d, leida: false, fecha: e.fecha });
        if (d.nivel === 'error' || d.nivel === 'aviso') this.toasts.show({ tone: d.nivel === 'error' ? 'error' : 'info', title: d.titulo, text: d.cuerpo });
      }
      if (e.tipo === 'evento.estado' || e.tipo.startsWith('competition.')) void this.comps.reload(id);
    });
    const rs = this.live.resync.subscribe(() => {
      const id = this.cid();
      if (id) void this.notifs.load(id);
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      rs.unsubscribe();
      this.live.disconnect();
    });
  }

  protected toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
    localStorage.setItem('bo.collapsed', this.collapsed() ? '1' : '0');
  }

  protected onKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.openPalette();
    }
  }

  protected openPalette(): void {
    this.onQuery('');
    this.palette.set(true);
  }

  protected onQuery(q: string): void {
    this.query.set(q);
    void this.search.search(this.cid(), this.comp()?.slug, q);
  }

  protected pick(it: BoPaletteItem, newTab: boolean): void {
    const url = this.search.url(it);
    if (!url) return;
    this.search.remember(it);
    this.palette.set(false);
    if (newTab) window.open(url, '_blank', 'noopener');
    else void this.router.navigateByUrl(url);
  }

  protected nuevaCompeticion(): void {
    void this.router.navigate(['/', this.comp()?.slug, 'evento']);
  }

  /** Live badge of a section of the menu (athlete requests waiting for a review). */
  protected contadorDe(it: NavItem): number | null {
    if (it.contador !== 'solicitudes') return null;
    const n = this.solicitudes.pendientes();
    return n > 0 ? n : null;
  }

  protected switchTo(slug: string): void {
    void this.router.navigate(['/', slug, 'inicio']);
  }

  protected openNotif(n: Notificacion): void {
    void this.notifs.mark(n.id);
    this.notifPanel.set(false);
    if (n.enlace) void this.router.navigateByUrl(`/${this.comp()?.slug}${n.enlace}`);
  }
}
