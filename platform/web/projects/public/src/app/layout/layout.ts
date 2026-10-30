import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrIconButton, GrLogo } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import type { Patrocinador } from '../core/cms';
import { COMPETITION_SLUG, Competition, type CompeticionPublica } from '../core/competition';
import { Newsletter } from './newsletter';

export interface NavLink {
  label: string;
  href: string;
}

export type Lang = 'es' | 'en';

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
    { label: 'Inscripción', desc: 'La gestiona la AEP', href: '/inscripcion' },
    { label: 'Resultados', desc: 'Clasificaciones por edición', href: '/resultados' },
  ] },
  { titulo: 'El evento', items: [
    { label: 'Atletas', desc: 'Perfiles y su horario', href: '/atletas' },
    { label: 'Horarios', desc: 'Flights y plataforma, en directo', href: '/horarios' },
    { label: 'En directo', desc: 'Streaming y marcador', href: '/en-directo' },
    { label: 'Sorteo', desc: '1 € por boleto', href: '/sorteo' },
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
  { titulo: 'Competición', items: [{ label: 'Categorías de peso', href: '/categorias-de-peso' }, { label: 'Marcas mínimas', href: '/marcas-minimas' }, { label: 'Reglamento', href: '/reglamento' }, { label: 'Inscripción (AEP)', href: '/inscripcion' }] },
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
  imports: [RouterLink, GrLogo, GrButton, GrIcon, GrIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed inset-x-0 top-0 z-40 px-5 pt-3 transition-[opacity,transform] duration-300 md:px-8 md:pt-4 xl:px-[120px]', '(document:click)': 'fuera($event)', '(document:keydown.escape)': 'mega.set(false)', '[class.opacity-0]': 'hidden()', '[class.-translate-y-4]': 'hidden()', '[class.pointer-events-none]': 'hidden()', '[attr.aria-hidden]': 'hidden() || null' },
  template: `
    <nav class="relative mx-auto flex h-[62px] max-w-[1200px] items-center gap-6 overflow-hidden rounded-md border border-accent-deep/35 bg-bg-deep/72 px-3 backdrop-blur-[20px] md:h-[70px] md:px-6" aria-label="Principal">
      <span class="pointer-events-none absolute -top-20 -left-10 size-40 rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.35),transparent)]" aria-hidden="true"></span>
      <span class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(196_43_62/0.6),transparent)]" aria-hidden="true"></span>
      <a [routerLink]="lang() === 'en' ? '/en' : '/'" class="relative shrink-0" [attr.aria-label]="ui().home"><img [src]="logo" alt="GR Strength Cup" class="h-9 w-auto md:h-10" /></a>
      <ul class="relative ml-auto hidden items-center gap-6 lg:flex">
        @for (l of links(); track l.href; let i = $index) {
          <li>
            @if (i === 0 && lang() === 'es') {
              <button type="button" class="inline-flex h-10 items-center gap-1 text-label-s text-text-secondary transition-colors hover:text-text-primary" [attr.aria-expanded]="mega()" aria-controls="mega-competicion" (click)="mega.set(!mega())">
                {{ l.label }}<gr-icon name="chevron-down" [size]="14" class="text-text-tertiary transition-transform" [class.rotate-180]="mega()" />
              </button>
            } @else {
              <a [href]="l.href" class="inline-flex h-10 items-center text-label-s text-text-secondary transition-colors hover:text-text-primary">{{ l.label }}</a>
            }
          </li>
        }
      </ul>
      <a [href]="ui().otherHref" [attr.hreflang]="ui().otherLang.toLowerCase()" [attr.aria-label]="ui().otherLabel" class="relative hidden h-7 items-center gap-1 rounded-sm border border-white/12 px-2 text-label-xs text-text-secondary hover:text-text-primary lg:inline-flex"><gr-icon name="globe" [size]="14" class="text-text-tertiary" />{{ lang() === 'en' ? 'EN' : 'ES' }}</a>
      <a grButton variant="primary" href="/entradas" class="relative ml-auto lg:ml-0">{{ ui().cta }}</a>
      <button grIconButton icon="menu" [label]="ui().open" class="relative lg:hidden" (click)="open.set(true)"></button>
    </nav>
    @if (mega()) {
      <div id="mega-competicion" class="mx-auto mt-2 hidden max-w-[1180px] gap-8 rounded-xl border border-line-strong bg-bg-raised p-7 shadow-card lg:flex" (keydown.escape)="mega.set(false)">
        @for (col of megaCols; track col.titulo) {
          <div class="flex w-[250px] flex-col gap-1">
            <p class="mb-1.5 text-label-xs text-text-muted">{{ col.titulo }}</p>
            @for (it of col.items; track it.href) {
              <a [href]="it.href" class="flex flex-col gap-1 rounded-sm p-2 transition-colors hover:bg-white/5"><span class="text-label-s">{{ it.label }}</span><span class="text-body-xs text-text-tertiary">{{ it.desc }}</span></a>
            }
          </div>
        }
        <div class="ml-auto flex w-[240px] flex-col gap-2 self-start rounded-lg border border-accent/60 bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] p-5">
          <p class="text-label-xs text-text-secondary">Entrada gratuita</p>
          <p class="text-display-2xs">Vive la GR Cup en directo</p>
          <p class="text-body-s text-text-secondary">Reserva gratis y súmate al sorteo por 1 €.</p>
          <a grButton variant="primary" href="/entradas" class="mt-2 self-start">Reservar</a>
        </div>
      </div>
    }
    @if (open()) {
      <!-- Figma «Mobile menu v3»: logo, ES / EN and close; the four main links; the groups as an accordion (the first one
           open); the edition line and the booking button at the bottom -->
      <div class="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg-base px-5 pt-3 lg:hidden" role="dialog" aria-modal="true" [attr.aria-label]="lang() === 'en' ? 'Menu' : 'Menú'">
        <div class="flex shrink-0 items-center justify-between pt-2 pb-4">
          <a [routerLink]="lang() === 'en' ? '/en' : '/'" (click)="open.set(false)" [attr.aria-label]="ui().home"><img [src]="logo" alt="GR Strength Cup" class="h-[34px] w-auto" /></a>
          <div class="flex items-center gap-2">
            <a [href]="ui().otherHref" [attr.hreflang]="ui().otherLang.toLowerCase()" [attr.aria-label]="ui().otherLabel" class="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-3 text-label-s">
              <span>{{ lang() === 'en' ? 'EN' : 'ES' }}</span><span class="text-text-muted">/ {{ ui().otherLang }}</span></a>
            <button type="button" class="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5" [attr.aria-label]="ui().close" (click)="open.set(false)"><gr-icon name="x" [size]="22" /></button>
          </div>
        </div>
        <ul class="flex flex-col">
          @for (l of accesos(); track l.href) {
            <li><a [href]="l.href" (click)="open.set(false)" class="flex h-[54px] items-center justify-between border-b border-line-subtle px-1 text-display-xs" [class.text-accent-text]="l.destacado">{{ l.label }}<gr-icon name="arrow-right" [size]="18" class="text-text-tertiary" [class.text-accent-text!]="l.destacado" /></a></li>
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
                      <li><a [href]="it.href" (click)="open.set(false)" class="flex h-11 items-center justify-between rounded-sm px-3 text-body-m text-text-secondary hover:bg-white/4 hover:text-text-primary" [class.bg-white/4]="actual() === it.href">{{ it.label }}<gr-icon name="arrow-right" [size]="14" class="text-text-tertiary" /></a></li>
                    }
                  </ul>
                }
              </div>
            }
          </div>
        }
        <div class="-mx-5 mt-auto flex shrink-0 flex-col gap-3 border-t border-line-subtle px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
          @if (lang() === 'es') { <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="calendar" [size]="16" class="text-accent-text" />{{ edicion() }}</p> }
          <a grButton variant="primary" size="l" href="/entradas" [block]="true" (click)="open.set(false)">{{ ui().ctaMenu }}</a>
        </div>
      </div>
    }
  `,
})
export class Navbar {
  readonly hidden = input(false);
  readonly lang = input<Lang>('es');
  protected readonly open = signal(false);
  protected readonly mega = signal(false);
  private readonly el = inject(ElementRef<HTMLElement>);
  /** The mega menu closes with a click outside the navbar (and with Esc). */
  protected fuera(e: Event): void { if (this.mega() && !this.el.nativeElement.contains(e.target as Node)) this.mega.set(false); }
  protected readonly megaCols = MEGA;
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png';
  protected readonly links = computed(() => LINKS[this.lang()]);
  private readonly comp = inject(Competition);
  private readonly router = inject(Router);
  /** Open group of the mobile menu (Figma: «Competición» open). */
  protected readonly grupo = signal(0);
  protected readonly actual = signal('');
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
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // the menu is a modal: no page scroll behind it, and it closes on navigation
      effect(() => { document.body.style.overflow = this.open() ? 'hidden' : ''; });
      const sub = this.router.events.subscribe(() => { this.open.set(false); this.actual.set(this.router.url.split(/[?#]/)[0]); });
      this.actual.set(this.router.url.split(/[?#]/)[0]);
      inject(DestroyRef).onDestroy(() => { sub.unsubscribe(); document.body.style.overflow = ''; });
    }
  }
  protected readonly ui = computed(() => UI[this.lang()]);
  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
}

/** Footer (Figma «Footer»). */
@Component({
  selector: 'gr-footer',
  imports: [GrLogo, GrIcon, Newsletter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-t border-line-subtle bg-bg-deep' },
  template: `
    @if (lang() === 'en') {
      <div class="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8 xl:px-[120px]">
        <div>
          <gr-logo [height]="44" />
          <p class="mt-4 max-w-sm text-body-s text-text-tertiary">Powerlifting championship in Almussafes (Valencia, Spain). Organised by GR Strength.</p>
        </div>
        <nav aria-label="Competition">
          <p class="text-mono-xs text-text-muted">Competition</p>
          <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
            <li><a href="/en#compete" class="hover:text-text-primary">How to register</a></li>
            <li><a href="/en#raffle" class="hover:text-text-primary">Raffle</a></li>
            <li><a href="/en#travel" class="hover:text-text-primary">Getting there</a></li>
            <li><a href="/" hreflang="es" class="hover:text-text-primary">Versión en español</a></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p class="text-mono-xs text-text-muted">Legal (in Spanish)</p>
          <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
            <li><a href="/privacidad" hreflang="es" class="hover:text-text-primary">Privacy policy</a></li>
            <li><a href="/terminos" hreflang="es" class="hover:text-text-primary">Terms</a></li>
            <li><a href="/cookies" hreflang="es" class="hover:text-text-primary">Cookies</a></li>
            <li><a href="/politica-concurso" hreflang="es" class="hover:text-text-primary">Raffle terms</a></li>
          </ul>
        </nav>
      </div>
      <p class="border-t border-line-subtle px-5 py-5 text-center text-body-xs text-text-muted">© {{ year }} GR Strength · All rights reserved</p>
    } @else {
    <!-- Figma «Footer»: mobile 48/20/32 with 28 between blocks, desktop 72/80/32 with 48 -->
    <div class="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pt-12 pb-28 md:gap-12 md:px-8 md:pt-[72px] md:pb-10 xl:px-[120px]">
      <gr-newsletter />
      <div class="grid lg:grid-cols-[300px_repeat(4,minmax(0,1fr))] lg:gap-x-10 xl:gap-x-14">
        <div class="mb-6 flex flex-col gap-4 lg:mb-0">
          <gr-logo [height]="56" />
          <p class="max-w-[300px] text-body-s text-text-tertiary">Competición de powerlifting organizada por GRStrength en Almussafes (Valencia). Sorteo benéfico de material SBD para la comunidad.</p>
          <div class="flex gap-2">
            <a [href]="instagram()" target="_blank" rel="noopener" aria-label="Instagram" class="flex size-11 items-center justify-center rounded-sm border border-line-subtle bg-white/5 text-text-secondary hover:text-text-primary"><gr-icon name="camera" [size]="18" /></a>
            @if (contacto()) { <a [href]="'mailto:' + contacto()" aria-label="Email" class="flex size-11 items-center justify-center rounded-sm border border-line-subtle bg-white/5 text-text-secondary hover:text-text-primary"><gr-icon name="mail" [size]="18" /></a> }
            <a href="/en" hreflang="en" class="flex h-11 shrink-0 items-center gap-2 rounded-sm border border-line-subtle px-3 text-body-s text-text-secondary hover:text-text-primary"><gr-icon name="globe" [size]="16" class="text-text-tertiary" />Español · English</a>
          </div>
          <p class="text-body-s text-text-tertiary">{{ contacto() }}{{ contacto() ? ' · ' : '' }}{{ handle() }}</p>
        </div>
        @for (col of columnas; track col.titulo) {
          <!-- Desktop: open column. Mobile: accordion. -->
          <nav class="hidden lg:block" [attr.aria-label]="col.titulo">
            <p class="text-label-xs text-text-muted">{{ col.titulo }}</p>
            <ul class="mt-4 flex flex-col gap-3 text-body-s text-text-secondary">@for (l of col.links; track l.href) { <li><a [href]="l.href" class="hover:text-text-primary">{{ l.label }}</a></li> }</ul>
          </nav>
          <details class="group border-b border-line-subtle lg:hidden">
            <summary class="flex h-15 cursor-pointer list-none items-center justify-between text-label-m">{{ col.titulo }}<gr-icon name="chevron-down" [size]="18" class="transition-transform group-open:rotate-180" /></summary>
            <ul class="flex flex-col gap-3 pb-4 text-body-s text-text-secondary">@for (l of col.links; track l.href) { <li><a [href]="l.href" class="hover:text-text-primary">{{ l.label }}</a></li> }</ul>
          </details>
        }
      </div>
      @if (logos().length) {
        <ul class="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 md:gap-x-10 md:gap-y-5 md:py-2" aria-label="Patrocinadores">
          @for (p of logos(); track p.nombre) {
            <li><a [href]="p.url || '/patrocinadores'" [attr.target]="p.url ? '_blank' : null" rel="noopener" class="block opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0">
              <img [src]="p.logoUrl" [alt]="p.nombre" class="h-[22px] w-auto max-w-[150px] object-contain md:h-7" loading="lazy" /></a></li>
          }
        </ul>
      }
      <div class="flex flex-col items-center gap-3 border-t border-line-subtle pt-5 text-center text-body-xs text-text-muted md:flex-row md:justify-between md:text-left">
        <p>© {{ year }} GR Cup · GRStrength. Todos los derechos reservados. · <a href="/cookies" class="hover:text-text-secondary">Cookies</a></p>
        <p class="inline-flex h-[29px] items-center gap-1.5 rounded-pill bg-white/5 px-3 text-text-tertiary"><gr-icon name="lock" [size]="12" />Pagos seguros con Stripe</p>
      </div>
    </div>
    @if (barra()) {
      <!-- Figma «Bottom CTA bar / Entrada» (mobile) and «Back to top» -->
      <div class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line-subtle bg-bg-base/95 px-4 pt-3 pb-[max(28px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[20px] md:hidden">
        <span class="flex flex-1 flex-col gap-1"><span class="text-label-s">Entrada gratuita</span><span class="text-body-xs text-text-tertiary">Aforo limitado · 1 minuto</span></span>
        <a href="/entradas" class="flex h-12 items-center justify-center rounded-sm bg-accent-grain px-6 text-label-m text-white">Reservar</a>
      </div>
      <button type="button" (click)="arriba()" aria-label="Volver arriba" class="fixed right-4 bottom-[104px] z-40 flex size-12 items-center justify-center rounded-full border border-line-strong bg-bg-raised shadow-card md:hidden"><gr-icon name="arrow-up" [size]="20" /></button>
    }
    }
  `,
})
export class Footer {
  readonly lang = input<Lang>('es');
  protected readonly year = new Date().getFullYear();
  private readonly comp = inject(Competition);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef<HTMLElement>);
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
  protected readonly contacto = computed(() => this.comp.data()?.evento.emailContacto ?? '');
  protected readonly handle = computed(() => '@' + this.instagram().replace(/\/$/, '').split('/').pop());
  protected readonly logos = signal<Patrocinador[]>([]);
  protected arriba(): void { window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  private readonly scrolled = signal(false);
  private readonly footerVisible = signal(false);
  private readonly url = signal('');
  /** Mobile CTA bar: after the first screen, not over the footer, not on flows with their own bottom action. */
  protected readonly barra = computed(() => this.scrolled() && !this.footerVisible() && this.comp.data()?.modulos?.['entradas'] !== false &&
    !/^\/(inscripcion|pago|entradas|area-atleta|novedades|baja|en)(\/|$|\?)/.test(this.url()));
  protected readonly columnas = [
    { titulo: 'Competición', links: [{ label: 'Categorías de peso', href: '/categorias-de-peso' }, { label: 'Marcas mínimas', href: '/marcas-minimas' }, { label: 'Reglamento', href: '/reglamento' }, { label: 'Horarios', href: '/horarios' }, { label: 'Inscripción (AEP)', href: '/inscripcion' }] },
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
      const sub = this.router.events.subscribe(() => this.url.set(this.router.url));
      // after the first screen — and on the home, once the trophy intro is over (the bar would cover it)
      const onScroll = () => {
        const hero = document.querySelector('gr-hero-trophy')?.getBoundingClientRect();
        this.scrolled.set(window.scrollY > 480 && (!hero || hero.bottom < window.innerHeight * 0.5));
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      const io = new IntersectionObserver(([e]) => this.footerVisible.set(e.isIntersecting), { rootMargin: '0px 0px -40px 0px' });
      io.observe(this.el.nativeElement);
      inject(DestroyRef).onDestroy(() => {
        sub.unsubscribe();
        window.removeEventListener('scroll', onScroll);
        io.disconnect();
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
