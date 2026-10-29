import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import {
  GrAvatar, GrBadge, GrIcon, GrIconButton, GrIconTile, GrLogo, GrToasts, daysUntil, fmtAgo, fmtShortDate, type GrIconName,
} from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { Notifications } from '../core/notifications';
import { Realtime } from '../core/realtime';
import type { Notificacion } from '../core/api';
import { ALL_ITEMS, NAV, type NavItem } from './nav';
import { Outside } from './outside';

const nivelIcon: Record<Notificacion['nivel'], { icon: GrIconName; tone: 'info' | 'success' | 'warning' | 'accent' }> = {
  info: { icon: 'bell', tone: 'info' },
  ok: { icon: 'circle-check', tone: 'success' },
  aviso: { icon: 'triangle-alert', tone: 'warning' },
  error: { icon: 'circle-x', tone: 'accent' },
};

@Component({
  selector: 'bo-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, GrIcon, GrIconButton, GrAvatar, GrLogo, GrBadge, GrIconTile, Outside],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(Auth);
  protected readonly comps = inject(Competitions);
  protected readonly notifs = inject(Notifications);
  protected readonly live = inject(Realtime);
  private readonly toasts = inject(GrToasts);
  private readonly router = inject(Router);

  protected readonly collapsed = signal(typeof localStorage !== 'undefined' && localStorage.getItem('bo.collapsed') === '1');
  protected readonly mobileMenu = signal(false);
  protected readonly switcher = signal(false);
  protected readonly notifPanel = signal(false);
  protected readonly userMenu = signal(false);
  protected readonly palette = signal(false);
  protected readonly query = signal('');
  protected readonly url = signal(this.router.url);

  protected readonly comp = this.comps.current;
  protected readonly cid = computed(() => this.comp()?.id);
  protected readonly visible = (it: NavItem) => !it.perm || this.auth.can(this.cid(), it.perm);
  protected readonly nav = computed(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => this.visible(i)) })).filter((g) => g.items.length));
  protected readonly tabs = computed(() => ALL_ITEMS.filter((i) => i.mobileTab && this.visible(i)).slice(0, 4));
  protected readonly pageTitle = computed(() => ALL_ITEMS.find((i) => this.url().includes(`/${i.path}`))?.label ?? 'Backoffice');
  protected readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    const items = ALL_ITEMS.filter((i) => this.visible(i));
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
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
    this.query.set('');
    this.palette.set(true);
    setTimeout(() => document.getElementById('bo-palette-input')?.focus());
  }

  protected go(it: NavItem): void {
    this.palette.set(false);
    void this.router.navigate(['/', this.comp()?.slug, it.path]);
  }

  protected paletteEnter(): void {
    const first = this.results()[0];
    if (first) this.go(first);
  }

  protected switchTo(slug: string): void {
    this.switcher.set(false);
    void this.router.navigate(['/', slug, 'inicio']);
  }

  protected openNotif(n: Notificacion): void {
    void this.notifs.mark(n.id);
    this.notifPanel.set(false);
    if (n.enlace) void this.router.navigateByUrl(`/${this.comp()?.slug}${n.enlace}`);
  }
}
