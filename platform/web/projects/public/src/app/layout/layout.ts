import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injectable, PLATFORM_ID, PendingTasks, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrLogo } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import type { Patrocinador } from '../core/cms';
import { COMPETITION_SLUG, Competition, type CompeticionPublica } from '../core/competition';
import { Seo } from '../core/seo';
import { FanSession } from '../core/fan';
import { Newsletter } from './newsletter';
import { AccesoModal } from '../pages/directo-social/acceso-modal';

export interface NavLink {
  label: string;
  href: string;
}

export type Lang = 'es' | 'en';

/** UX1-R1-3: whether the mobile bottom «Reservar» bar is on screen (the navbar then drops its own CTA on phones). */
@Injectable({ providedIn: 'root' })
export class BarraCta { readonly visible = signal(false); }

const LINKS: Record<Lang, NavLink[]> = {
  es: [
    { label: 'Competición', href: '/#campeonato' },
    { label: 'Atletas', href: '/atletas' },
    { label: 'Horarios', href: '/horarios' },
    { label: 'Sorteo', href: '/sorteo' },
    { label: 'Cómo llegar', href: '/como-llegar' },
  ],
  en: [
    { label: 'Competition', href: '/en#compete' },
    { label: 'Athletes', href: '/atletas' },
    { label: 'Schedule', href: '/horarios' },
    { label: 'Raffle', href: '/en#raffle' },
    { label: 'Getting there', href: '/en#travel' },
  ],
};
/** «Navbar / Mega menú» of Figma: the three columns of «Competición ▾» and the highlighted booking card. */
interface MegaItem { label: string; desc: string; href: string }
const MEGA: { titulo: string; items: MegaItem[] }[] = [
  { titulo: 'Competición', items: [
    { label: 'Categorías de peso', desc: 'Pesos y divisiones de edad', href: '/categorias-de-peso' },
    { label: 'Marcas mínimas', desc: 'Totales AEP-1 por categoría', href: '/marcas-minimas' },
    { label: 'Reglamento', desc: 'Intentos, jueces y equipamiento', href: '/reglamento' },
    { label: 'Alta de atleta', desc: 'Completa tu perfil', href: '/alta-atleta' },
    { label: 'Resultados', desc: 'Clasificaciones por edición', href: '/resultados' },
  ] },
  { titulo: 'El evento', items: [
    { label: 'Atletas', desc: 'Perfiles y su horario', href: '/atletas' },
    { label: 'Horarios', desc: 'Flights y plataforma, en directo', href: '/horarios' },
    { label: 'En directo', desc: 'Streaming y marcador', href: '/en-directo' },
    { label: 'Sorteo', desc: 'Rifa presencial en efectivo', href: '/sorteo' },
    { label: 'Galería', desc: 'Fotos de la competición', href: '/galeria' },
  ] },
  { titulo: 'Visita y comunidad', items: [
    { label: 'Entradas', desc: 'Gratis con reserva', href: '/entradas' },
    { label: 'Cómo llegar', desc: 'Pabellón de Almussafes', href: '/como-llegar' },
    { label: 'Público', desc: 'Normas y servicios', href: '/publico' },
    { label: 'Preguntas frecuentes', desc: 'Resolvemos tus dudas', href: '/preguntas-frecuentes' },
    { label: 'Edición 2025', desc: 'Llíria · 1–2 marzo 2025', href: '/ediciones/2025' },
  ] },
];

/** Groups of the mobile menu (Figma «Mobile menu v3»): the footer columns, shorter. */
const GRUPOS_MOVIL: { titulo: string; items: NavLink[] }[] = [
  { titulo: 'Competición', items: [{ label: 'Categorías de peso', href: '/categorias-de-peso' }, { label: 'Marcas mínimas', href: '/marcas-minimas' }, { label: 'Reglamento', href: '/reglamento' }, { label: 'Alta de atleta', href: '/alta-atleta' }] },
  { titulo: 'El evento', items: [{ label: 'Sorteo', href: '/sorteo' }, { label: 'En directo', href: '/en-directo' }, { label: 'Resultados', href: '/resultados' }, { label: 'Galería', href: '/galeria' }, { label: 'Edición 2025', href: '/ediciones/2025' }] },
  { titulo: 'Visita y comunidad', items: [{ label: 'Cómo llegar', href: '/como-llegar' }, { label: 'Público', href: '/publico' }, { label: 'Preguntas frecuentes', href: '/preguntas-frecuentes' }, { label: 'Clubs', href: '/clubs' }, { label: 'Blog', href: '/blog' }] },
];

const UI = {
  es: { cta: 'Entrada gratis', ctaMenu: 'Reserva tu entrada gratis', open: 'Abrir menú', close: 'Cerrar menú', otherLang: 'EN', otherHref: '/en', otherLabel: 'English version', home: 'GR Strength Cup · inicio' },
  en: { cta: 'Free ticket', ctaMenu: 'Book your free ticket', open: 'Open menu', close: 'Close menu', otherLang: 'ES', otherHref: '/', otherLabel: 'Versión en español', home: 'GR Strength Cup · home' },
};

/**
 * Glass navbar aligned to the content column (Figma «Navbar», v7: column margins D 120 · T 32 · M 20).
 * On the home it appears once the hero intro is left behind (`hidden` input driven by the hero).
 */
@Component({
  selector: 'gr-navbar',
  imports: [RouterLink, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // UX1-R1-1: on phones the navbar stays visible during the intro (hidden only from md). UX1-R1-5: above the bottom bar and FAB while the menu is open.
  host: { class: 'fixed inset-x-0 top-0 pr-[max(20px,env(safe-area-inset-right))] pl-[max(20px,env(safe-area-inset-left))] pt-[max(12px,env(safe-area-inset-top))] max-[239px]:px-2 transition-[opacity,transform] duration-300 md:pr-[max(32px,env(safe-area-inset-right))] md:pl-[max(32px,env(safe-area-inset-left))] md:pt-[max(16px,env(safe-area-inset-top))] xl:px-[120px]', '(document:click)': 'fuera($event)', '(document:keydown.escape)': 'mega.set(false); open.set(false)', '[class.z-40]': '!open()', '[class.z-60]': 'open()', '[class.md:opacity-0]': 'hidden()', '[class.md:-translate-y-4]': 'hidden()', '[class.md:pointer-events-none]': 'hidden()', '[attr.aria-hidden]': '(hidden() && ancho()) || null' },
  template: `
    <nav class="@container relative mx-auto flex min-h-16 max-w-[1200px] items-center gap-2 overflow-hidden md:gap-4 lg:gap-6 rounded-md border border-accent-deep/35 bg-bg-deep/72 px-3 max-[239px]:px-1.5 backdrop-blur-[10px] md:min-h-[72px] md:px-6" aria-label="Principal">
      <span class="pointer-events-none absolute -top-20 -left-10 size-40 rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.35),transparent)]" aria-hidden="true"></span>
      <span class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(196_43_62/0.6),transparent)]" aria-hidden="true"></span>
      <a [routerLink]="lang() === 'en' ? '/en' : '/'" class="relative shrink-0" [attr.aria-label]="ui().home"><img [src]="logo" alt="GR Strength Cup" class="h-9 w-24 object-contain max-[239px]:w-20 md:h-10 md:w-[116px]" /></a>
      <!-- Figma «Navbar»: tablet keeps the first three links (the rest is in «Competición ▾»), desktop all five -->
      <ul class="relative -mr-2 ml-auto hidden items-center md:flex lg:gap-2">
        @for (l of links(); track l.href; let i = $index) {
          <li [class]="i > 2 ? 'hidden lg:block' : ''">
            @if (i === 0 && lang() === 'es') {
              <button type="button" class="group inline-flex flex-col items-center gap-2 rounded-xs p-2 text-label-s text-text-secondary transition-colors hover:text-text-primary" [attr.aria-expanded]="mega()" aria-controls="mega-competicion" (click)="mega.set(!mega())">
                <span class="inline-flex items-center gap-1">{{ l.label }}<gr-icon name="chevron-down" [size]="14" class="text-text-tertiary transition-transform" [class.rotate-180]="mega()" /></span>
                <span class="h-0.5 w-6 rounded-[1px] bg-transparent transition-colors group-hover:bg-white/30" aria-hidden="true"></span>
              </button>
            } @else {
              <!-- Figma «Nav link»: 2 px indicator under the label (white 30 % on hover, accent on the current route) -->
              <a [routerLink]="ruta(l.href)" [fragment]="frag(l.href)" class="group inline-flex flex-col items-center gap-2 rounded-xs px-2 pt-2 pb-2 text-label-s transition-colors hover:text-text-primary" [class]="activo(l.href) ? 'text-text-primary' : 'text-text-secondary'" [attr.aria-current]="activo(l.href) ? 'page' : null">{{ l.label }}<span class="h-0.5 w-6 rounded-[1px] transition-colors" [class]="activo(l.href) ? 'bg-accent' : 'bg-transparent group-hover:bg-white/30'" aria-hidden="true"></span></a>
            }
          </li>
        }
      </ul>
      <a [routerLink]="ui().otherHref" [attr.hreflang]="ui().otherLang.toLowerCase()" [attr.aria-label]="ui().otherLabel" class="relative hidden h-7 items-center gap-1 rounded-sm border border-white/12 px-2 text-label-xs text-text-secondary hover:text-text-primary md:inline-flex"><gr-icon name="globe" [size]="14" class="text-text-tertiary" />{{ lang() === 'en' ? 'EN' : 'ES' }}</a>
      <a grButton variant="primary" routerLink="/entradas" class="relative ml-auto max-[359px]:hidden @max-[18rem]:hidden md:ml-0" [class.max-md:hidden]="barraCta.visible()">{{ ui().cta }}</a>
      <span class="ml-auto md:hidden min-[360px]:hidden" aria-hidden="true"></span>
      @if (barraCta.visible()) { <span class="ml-auto md:hidden min-[360px]:inline" aria-hidden="true"></span> }
      <button type="button" data-menu class="relative flex size-11 shrink-0 @max-[18rem]:ml-auto items-center justify-center rounded-sm text-text-primary hover:bg-white/6 md:hidden" [attr.aria-label]="ui().open" [attr.aria-expanded]="open()" aria-controls="menu-movil" (click)="open.set(true)"><gr-icon name="menu" [size]="24" /></button>
    </nav>
    @if (mega()) {
      <div id="mega-competicion" class="mx-auto mt-2 hidden max-w-[1180px] flex-wrap gap-8 rounded-xl border border-line-strong bg-bg-raised p-7 shadow-card md:flex lg:flex-nowrap" (keydown.escape)="mega.set(false)">
        @for (col of megaCols; track col.titulo) {
          <div class="flex w-[194px] flex-col gap-1 lg:w-[250px]">
            <p class="mb-1.5 text-label-xs text-text-muted">{{ col.titulo }}</p>
            @for (it of col.items; track it.href) {
              <a [routerLink]="ruta(it.href)" (click)="mega.set(false)" class="flex flex-col gap-1 rounded-sm p-2 transition-colors hover:bg-white/5"><span class="text-label-s">{{ it.label }}</span><span class="text-body-xs text-text-tertiary">{{ it.desc }}</span></a>
            }
          </div>
        }
        <div class="flex w-full flex-col gap-2 self-start rounded-lg border lg:ml-auto lg:w-[240px] border-accent/60 bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] p-5">
          <p class="text-label-xs text-text-secondary">Entrada gratuita</p>
          <p class="text-display-2xs">Vive la GR Cup en directo</p>
          <p class="text-body-s text-text-secondary">Reserva gratis tu plaza en las gradas.</p>
          <!-- Figma: «Button / Display» 44 with glow -->
          <a grButton variant="display" routerLink="/entradas" class="mt-2 self-start md:h-11!">Reservar</a>
        </div>
      </div>
    }
    @if (open()) {
      <!-- Figma «Mobile menu v3»: logo, ES / EN and close; the four main links; the groups as an accordion (the first one
           open); the edition line and the booking button at the bottom -->
      <div id="menu-movil" class="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg-base px-5 pt-3 md:hidden" role="dialog" aria-modal="true" (keydown.tab)="atrapar($event)" (keydown.shift.tab)="atrapar($event)" [attr.aria-label]="lang() === 'en' ? 'Menu' : 'Menú'">
        <div class="flex shrink-0 items-center justify-between pt-2 pb-4">
          <a [routerLink]="lang() === 'en' ? '/en' : '/'" (click)="open.set(false)" [attr.aria-label]="ui().home"><img [src]="logo" alt="GR Strength Cup" class="h-[34px] w-[92px] object-contain" /></a>
          <div class="flex items-center gap-2">
            <a [routerLink]="ui().otherHref" [attr.hreflang]="ui().otherLang.toLowerCase()" [attr.aria-label]="ui().otherLabel" class="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-3 text-label-s">
              <span>{{ lang() === 'en' ? 'EN' : 'ES' }}</span><span class="text-text-muted">/ {{ ui().otherLang }}</span></a>
            <button type="button" data-cerrar-menu class="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5" [attr.aria-label]="ui().close" (click)="open.set(false)"><gr-icon name="x" [size]="22" /></button>
          </div>
        </div>
        <ul class="flex flex-col">
          @for (l of accesos(); track l.href) {
            <li><a [routerLink]="ruta(l.href)" [fragment]="frag(l.href)" (click)="open.set(false)" class="flex h-[54px] items-center justify-between border-b border-line-subtle px-1 text-display-xs decoration-accent decoration-2 underline-offset-8" [class.text-accent-text]="l.destacado" [class.underline]="activo(l.href)" [attr.aria-current]="activo(l.href) ? 'page' : null">{{ l.label }}<gr-icon name="arrow-right" [size]="18" class="text-text-tertiary" [class.text-accent-text!]="l.destacado" /></a></li>
          }
        </ul>
        @if (lang() === 'es') {
          <div class="flex flex-col pt-2">
            @for (g of grupos; track g.titulo; let gi = $index) {
              <div class="border-b border-line-subtle" [class.pb-3]="grupo() === gi">
                <button type="button" class="flex h-[52px] w-full items-center justify-between text-label-m" [class]="grupo() === gi ? 'text-text-primary' : 'text-text-secondary'" [attr.aria-expanded]="grupo() === gi" (click)="grupo.set(grupo() === gi ? -1 : gi)">
                  {{ g.titulo }}<gr-icon name="chevron-down" [size]="18" class="transition-transform" [class.rotate-180]="grupo() === gi" [class.text-accent-text]="grupo() === gi" />
                </button>
                @if (grupo() === gi) {
                  <ul class="flex flex-col gap-1">
                    @for (it of g.items; track it.href) {
                      <li><a [routerLink]="ruta(it.href)" (click)="open.set(false)" class="flex h-11 items-center justify-between rounded-sm px-3 text-body-m text-text-secondary hover:bg-white/4 hover:text-text-primary" [class.bg-white/4]="activo(it.href)" [attr.aria-current]="activo(it.href) ? 'page' : null">{{ it.label }}<gr-icon name="arrow-right" [size]="14" class="text-text-tertiary" /></a></li>
                    }
                  </ul>
                }
              </div>
            }
          </div>
        }
        <div class="-mx-5 mt-auto flex shrink-0 flex-col gap-3 border-t border-line-subtle px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
          @if (lang() === 'es') { <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="calendar" [size]="16" class="text-accent-text" />{{ edicion() }}</p> }
          <a grButton variant="primary" size="l" routerLink="/entradas" [block]="true" (click)="open.set(false)">{{ ui().ctaMenu }}</a>
        </div>
      </div>
    }
  `,
})
export class Navbar {
  readonly hidden = input(false);
  readonly lang = input<Lang>('es');
  /** md+ viewport: only there does `hidden` apply (UX1-R1-1). */
  protected readonly ancho = signal(false);
  protected readonly open = signal(false);
  protected readonly barraCta = inject(BarraCta);
  protected readonly mega = signal(false);
  private readonly el = inject(ElementRef<HTMLElement>);
  /** The mega menu closes with a click outside the navbar (and with Esc). */
  protected fuera(e: Event): void { if (this.mega() && !this.el.nativeElement.contains(e.target as Node)) this.mega.set(false); }
  protected readonly megaCols = MEGA;
  private readonly http = inject(HttpClient);
  /** Mobile menu is a modal: Tab / Shift+Tab cycle inside it. */
  protected atrapar(e: Event): void {
    const k = e as KeyboardEvent;
    const f = [...(k.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (!f.length) return;
    const [primero, ultimo] = [f[0], f[f.length - 1]];
    if (k.shiftKey && document.activeElement === primero) { k.preventDefault(); ultimo.focus(); }
    else if (!k.shiftKey && document.activeElement === ultimo) { k.preventDefault(); primero.focus(); }
  }
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo-2026.png';
  protected readonly links = computed(() => LINKS[this.lang()]);
  private readonly comp = inject(Competition);
  private readonly router = inject(Router);
  /** Open group of the mobile menu (Figma: «Competición» open). */
  protected readonly grupo = signal(0);
  protected readonly actual = signal('');
  /** Active on its own page and on its subpages (/atletas/:slug), by whole path segment. */
  /** SPA links (Figma 17 «Loader de página» can only show on in-app navigations): path and #fragment apart. */
  protected ruta(href: string): string { return href.split('#')[0] || '/'; }
  protected frag(href: string): string | undefined { return href.split('#')[1]; }
  protected activo(href: string): boolean { const a = this.actual(); return a === href || a.startsWith(href + '/'); }
  protected readonly grupos = GRUPOS_MOVIL;
  /** The four main links of the mobile menu (the booking one in red). */
  protected readonly accesos = computed(() => this.lang() === 'en'
    ? [{ label: 'Home', href: '/en', destacado: false }, { label: 'Free tickets', href: '/entradas', destacado: true }, ...LINKS.en.slice(1, 3).map((l) => ({ ...l, destacado: false }))]
    : [{ label: 'Inicio', href: '/', destacado: false }, { label: 'Entradas', href: '/entradas', destacado: true }, { label: 'Atletas', href: '/atletas', destacado: false }, { label: 'Horarios', href: '/horarios', destacado: false }]);
  protected readonly edicion = computed(() => {
    const c = this.comp.data();
    const f = c?.fechaInicio ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(c.fechaInicio + 'T12:00:00Z')) : 'fecha por confirmar';
    return `Edición ${(c?.fechaInicio ?? '2026').slice(0, 4)} · ${f} · ${c?.sede?.ciudad || 'Almussafes'}`;
  });
  constructor() {
    // current route also on the server: the SSR HTML already marks the active link (no flash, aria-current for crawlers)
    this.actual.set(this.router.url.split(/[?#]/)[0]);
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // the menu is a modal: no page scroll behind it, and it closes on navigation
      // focus goes into the menu when it opens (to «close») and back to the hamburger when it closes; Esc closes it
      const mq = window.matchMedia('(min-width: 768px)');
      const onMq = () => this.ancho.set(mq.matches);
      onMq();
      mq.addEventListener('change', onMq);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onMq));
      let estaba = false;
      effect(() => {
        const abierto = this.open();
        document.body.style.overflow = abierto ? 'hidden' : '';
        if (abierto) setTimeout(() => (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-cerrar-menu]')?.focus());
        else if (estaba) (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('button[data-menu]')?.focus();
        estaba = abierto;
      });
      const sub = this.router.events.subscribe(() => { this.open.set(false); this.actual.set(this.router.url.split(/[?#]/)[0]); });
      inject(DestroyRef).onDestroy(() => { sub.unsubscribe(); document.body.style.overflow = ''; });
    }
  }
  protected readonly ui = computed(() => UI[this.lang()]);
  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
}

/**
 * Overlays globales de la web: el modal de acceso al directo (una sola instancia: cualquier página puede pedirlo
 * con `FanSession.abrirAcceso()`). La bandeja de avisos vive solo en app.ts (UX3-R2-1).
 */
@Component({
  selector: 'gr-overlays',
  imports: [AccesoModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<gr-acceso-modal />`,
})
export class Overlays {
  private readonly fan = inject(FanSession);

  constructor() {
    // The session of the fan is the cookie httpOnly `grcup_fan`: the browser asks once and everyone la usa.
    if (isPlatformBrowser(inject(PLATFORM_ID))) void this.fan.cargar();
  }
}

/** Footer (Figma «Footer»). */
@Component({
  selector: 'gr-footer',
  imports: [RouterLink, GrLogo, GrIcon, Newsletter, Overlays],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-t border-line-subtle bg-bg-deep' },
  template: `
    @if (lang() === 'en') {
      <div class="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8 xl:px-[120px]">
        <div>
          <gr-logo [height]="56" [width]="150" />
          <p class="mt-4 max-w-sm text-body-s text-text-tertiary">Powerlifting championship in Almussafes (Valencia, Spain). Organised by GR Strength.</p>
        </div>
        <nav aria-label="Competition">
          <p class="text-mono-xs text-text-muted">Competition</p>
          <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
            <li><a routerLink="/en" fragment="compete" class="hover:text-text-primary">How to register</a></li>
            <li><a routerLink="/en" fragment="raffle" class="hover:text-text-primary">Raffle</a></li>
            <li><a routerLink="/en" fragment="travel" class="hover:text-text-primary">Getting there</a></li>
            <li><a routerLink="/" hreflang="es" class="hover:text-text-primary">Versión en español</a></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p class="text-mono-xs text-text-muted">Legal (in Spanish)</p>
          <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
            <li><a routerLink="/privacidad" hreflang="es" class="hover:text-text-primary">Privacy policy</a></li>
            <li><a routerLink="/terminos" hreflang="es" class="hover:text-text-primary">Terms</a></li>
            <li><a routerLink="/cookies" hreflang="es" class="hover:text-text-primary">Cookies</a></li>
            <li><a routerLink="/politica-concurso" hreflang="es" class="hover:text-text-primary">Raffle terms</a></li>
          </ul>
        </nav>
      </div>
      <p class="border-t border-line-subtle px-5 py-5 text-center text-body-xs text-text-muted">© {{ year }} GR Strength · All rights reserved</p>
    } @else {
    <!-- Figma «Footer»: mobile 48/20/32 with 28 between blocks, desktop 72/80/32 with 48 -->
    <div class="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pt-12 pb-8 md:gap-12 md:px-8 md:pt-[72px] xl:px-[120px]">
      <gr-newsletter [nivel]="nivelNewsletter()" />
      <div class="grid md:grid-cols-4 md:gap-x-4 lg:grid-cols-[300px_repeat(4,minmax(0,1fr))] lg:gap-x-10 xl:gap-x-14">
        <div class="mb-6 flex flex-col gap-4 md:col-span-4 md:mb-8 lg:col-span-1 lg:mb-0">
          <gr-logo [height]="56" [width]="150" />
          <p class="max-w-[300px] text-body-s text-text-tertiary md:max-w-none lg:max-w-[300px]">Competición de powerlifting organizada por GRStrength en Almussafes (Valencia). Rifa presencial de material para la comunidad.</p>
          <div class="flex flex-wrap gap-2">
            <a [href]="instagram()" target="_blank" rel="noopener" aria-label="Instagram" class="flex size-11 items-center justify-center rounded-sm border border-line-subtle bg-white/5 text-text-secondary hover:text-text-primary"><gr-icon name="instagram" [size]="18" /></a>
            @if (contacto()) { <a [href]="'mailto:' + contacto()" aria-label="Email" class="flex size-11 items-center justify-center rounded-sm border border-line-subtle bg-white/5 text-text-secondary hover:text-text-primary"><gr-icon name="mail" [size]="18" /></a> }
            <a routerLink="/en" hreflang="en" class="flex h-11 shrink-0 items-center gap-2 rounded-sm border border-line-subtle px-3 text-body-s text-text-secondary hover:text-text-primary"><gr-icon name="globe" [size]="16" class="text-text-tertiary" />Español · English</a>
          </div>
          <p class="text-body-s text-text-tertiary">{{ contacto() }}{{ contacto() ? ' · ' : '' }}{{ handle() }}</p>
        </div>
        @for (col of columnas; track col.titulo) {
          <!-- Tablet/desktop: open column. Mobile: accordion. -->
          <nav class="hidden md:block" [attr.aria-label]="col.titulo">
            <p class="text-label-xs text-text-muted">{{ col.titulo }}</p>
            <ul class="mt-4 flex flex-col md:gap-3 text-body-s text-text-secondary">@for (l of col.links; track l.href) { <li><a [routerLink]="l.href" class="flex min-h-11 items-center hover:text-text-primary md:min-h-0">{{ l.label }}</a></li> }</ul>
          </nav>
          <details class="group border-b border-line-subtle md:hidden">
            <summary class="flex h-15 cursor-pointer list-none items-center justify-between text-label-m">{{ col.titulo }}<gr-icon name="chevron-down" [size]="18" class="transition-transform group-open:rotate-180" /></summary>
            <ul class="flex flex-col pb-4 md:gap-3 text-body-s text-text-secondary">@for (l of col.links; track l.href) { <li><a [routerLink]="l.href" class="flex min-h-11 items-center hover:text-text-primary md:min-h-0">{{ l.label }}</a></li> }</ul>
          </details>
        }
      </div>
      @if (logos().length) {
        <ul class="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 md:gap-x-10 md:gap-y-5 md:py-2" aria-label="Patrocinadores">
          @for (p of logos(); track p.nombre) {
            <li><a [href]="p.url || '/patrocinadores'" [attr.target]="p.url ? '_blank' : null" rel="noopener" class="flex min-h-11 items-center opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0">
              <img [src]="p.logoUrl" [alt]="p.nombre" class="h-8 w-auto max-w-[150px] object-contain md:h-7" loading="lazy" /></a></li>
          }
        </ul>
      }
      <div class="flex flex-col items-center gap-1 border-t border-line-subtle pt-5 text-center text-body-xs text-text-muted md:flex-row md:justify-between md:gap-3 md:text-left">
        <p>© {{ year }} GR Cup · GRStrength. Todos los derechos reservados. · <a routerLink="/cookies" class="hover:text-text-secondary">Cookies</a></p>
        @if (stripe()) { <p class="inline-flex h-[29px] items-center gap-1.5 rounded-pill bg-white/5 px-3 text-text-tertiary"><gr-icon name="lock" [size]="12" />Pagos seguros con Stripe</p> }
      </div>
    </div>
    @if (barra()) {
      <!-- Figma «Bottom CTA bar / Entrada» (mobile, also over the end of the footer: room below it) and «Back to top» -->
      <div class="h-20 md:hidden" aria-hidden="true"></div>
      <!-- UX1-R1-3: compact (~72 px) and out of the way while an inline «Reserva tu entrada» CTA is on screen -->
      <div class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line-subtle bg-bg-base/95 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[10px] transition-[opacity,translate] duration-200 md:hidden" [class.translate-y-full]="ctaEnVista()" [class.opacity-0]="ctaEnVista()" [attr.inert]="ctaEnVista() || null">
        <span class="flex flex-1 flex-col gap-1"><span class="text-label-s">Entrada gratuita</span><span class="text-body-xs text-text-tertiary">Reserva en 1 minuto · aforo limitado</span></span>
        <a routerLink="/entradas" class="flex h-12 items-center justify-center rounded-sm bg-accent-grain px-6 text-label-m text-white">Reservar</a>
      </div>
      <!-- UX1-R1-4: iOS pattern - only while scrolling back up, past three screens -->
      <button type="button" (click)="arriba()" aria-label="Volver arriba" class="fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex size-11 items-center justify-center rounded-full border border-line-strong bg-bg-raised shadow-card transition-opacity duration-200 md:hidden" [class.opacity-0]="!fab()" [class.pointer-events-none]="!fab()" [attr.inert]="!fab() || null"><gr-icon name="arrow-up" [size]="20" /></button>
    }
    }
    <!-- Modal de acceso al directo y avisos: una sola instancia en toda la web -->
    <gr-overlays />
  `,
})
export class Footer {
  readonly lang = input<Lang>('es');
  private readonly seo = inject(Seo);
  /** En /alta-atleta el contenido ya tiene sus dos H2: la banda de novedades baja a H3. En las páginas con sus dos H2 y sus tres H3 no es un encabezado. */
  protected readonly nivelNewsletter = computed<'h2' | 'h3' | 'p'>(() => {
    const p = this.seo.path();
    return p === '/donde-dormir-y-comer' || p === '/mapa-de-accesos' ? 'p' : p === '/alta-atleta' ? 'h3' : 'h2';
  });
  protected readonly year = new Date().getFullYear();
  /** /sorteo is cash-only (D-RIFA): no payment badge there. */
  protected readonly stripe = computed(() => !this.seo.path().startsWith('/sorteo'));
  private readonly comp = inject(Competition);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
  protected readonly contacto = computed(() => this.comp.data()?.evento.emailContacto ?? '');
  protected readonly handle = computed(() => '@' + this.instagram().replace(/\/$/, '').split('/').pop());
  protected readonly logos = signal<Patrocinador[]>([]);
  protected arriba(): void { window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  private readonly scrolled = signal(false);
  protected readonly ctaEnVista = signal(false);
  protected readonly fab = signal(false);
  private readonly barraCta = inject(BarraCta);
  private readonly url = signal('');
  /** Mobile CTA bar (Figma Mobile, every public page): on the home only once the trophy intro is over; not on flows with their own bottom action. */
  protected readonly barra = computed(() => this.scrolled() && this.comp.data()?.modulos?.['entradas'] !== false &&
    !/^\/(inscripcion|pago|entradas|area-atleta|alta-atleta|novedades|baja|en|en-directo)(\/|$|\?)/.test(this.url()));
  protected readonly columnas = [
    { titulo: 'Competición', links: [{ label: 'Categorías de peso', href: '/categorias-de-peso' }, { label: 'Marcas mínimas', href: '/marcas-minimas' }, { label: 'Reglamento', href: '/reglamento' }, { label: 'Horarios', href: '/horarios' }, { label: 'Alta de atleta', href: '/alta-atleta' }] },
    { titulo: 'El evento', links: [{ label: 'Entradas', href: '/entradas' }, { label: 'Atletas', href: '/atletas' }, { label: 'Sorteo', href: '/sorteo' }, { label: 'En directo', href: '/en-directo' }, { label: 'Resultados', href: '/resultados' }, { label: 'Edición 2025', href: '/ediciones/2025' }, { label: 'Galería', href: '/galeria' }] },
    { titulo: 'Visita y comunidad', links: [{ label: 'Cómo llegar', href: '/como-llegar' }, { label: 'Público', href: '/publico' }, { label: 'Preguntas frecuentes', href: '/preguntas-frecuentes' }, { label: 'Clubs', href: '/clubs' }, { label: 'Patrocinadores', href: '/patrocinadores' }, { label: 'Voluntarios', href: '/voluntarios' }, { label: 'Blog', href: '/blog' }] },
    { titulo: 'Legal', links: [{ label: 'Privacidad', href: '/privacidad' }, { label: 'Términos', href: '/terminos' }, { label: 'Consentimiento de datos', href: '/consentimiento-datos' }, { label: 'Política del concurso', href: '/politica-concurso' }] },
  ];
  constructor() {
    // Same source on every page (cached per render and transferred to the browser): the event's data.
    void inject(PendingTasks).run(() => this.comp.load());
    // Sponsor logos are decoration: a failure must never turn the page into an error.
    void firstValueFrom(this.http.get<Patrocinador[]>(`/api/competiciones/${COMPETITION_SLUG}/patrocinadores`)).then((l) => this.logos.set((l ?? []).filter((p) => p.logoUrl).slice(0, 10)), () => undefined);
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.url.set(this.router.url);
      const sub = this.router.events.subscribe(() => { this.url.set(this.router.url); setTimeout(onScroll); });
      // always — except on the home while the trophy intro is on screen (the bar would cover it)
      const onScroll = () => {
        const hero = document.querySelector('gr-hero-trophy')?.getBoundingClientRect();
        this.scrolled.set(!hero || (window.scrollY > 480 && hero.bottom < window.innerHeight * 0.5));
        const h = window.innerHeight;
        this.ctaEnVista.set([...document.querySelectorAll('[data-cta-entrada]')].some((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < h; }));
        const y = window.scrollY;
        this.fab.set(y > h * 3 && y < ultimoY);
        ultimoY = y;
      };
      let ultimoY = window.scrollY;
      window.addEventListener('scroll', onScroll, { passive: true });
      setTimeout(onScroll);
      effect(() => this.barraCta.visible.set(this.barra()));
      inject(DestroyRef).onDestroy(() => {
        sub.unsubscribe();
        window.removeEventListener('scroll', onScroll);
      });
    }
  }
}

/** Instagram of the event («Evento» in the backoffice), with the organiser's account as fallback. */
export function instagramOf(c: CompeticionPublica | null): string {
  const v = c?.evento.instagram?.trim() ?? '';
  if (!v) return INSTAGRAM;
  return v.startsWith('https://') ? v : 'https://www.instagram.com/' + v.replace(/^@/, '').replace(/\/$/, '') + '/';
}

/** Official Instagram of the organiser (legacy site footer). */
export const INSTAGRAM = 'https://www.instagram.com/grstrengthclub/';
