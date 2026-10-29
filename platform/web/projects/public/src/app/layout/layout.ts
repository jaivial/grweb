import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrIconButton, GrLogo } from '@grcup/ui';

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
  host: { class: 'fixed inset-x-0 top-0 z-40 px-5 pt-3 transition-[opacity,transform] duration-300 md:px-8 xl:px-[120px]', '[class.opacity-0]': 'hidden()', '[class.-translate-y-4]': 'hidden()', '[class.pointer-events-none]': 'hidden()', '[attr.aria-hidden]': 'hidden() || null' },
  template: `
    <nav class="flex h-14 items-center gap-6 rounded-lg border border-line-subtle bg-bg-base/70 px-3 shadow-card backdrop-blur-[20px] md:h-16 md:px-6" aria-label="Principal">
      <a [routerLink]="lang() === 'en' ? '/en' : '/'" class="shrink-0" [attr.aria-label]="ui().home"><gr-logo [height]="32" /></a>
      <ul class="ml-auto hidden items-center gap-1 lg:flex">
        @for (l of links(); track l.href) {
          <li><a [href]="l.href" class="inline-flex h-10 items-center rounded-sm px-3 text-label-s text-text-secondary transition-colors hover:text-text-primary">{{ l.label }}</a></li>
        }
      </ul>
      <a [href]="ui().otherHref" [attr.hreflang]="ui().otherLang.toLowerCase()" [attr.aria-label]="ui().otherLabel" class="hidden h-8 items-center gap-1.5 rounded-pill border border-line-strong px-2.5 text-mono-xs text-text-secondary hover:text-text-primary lg:inline-flex"><gr-icon name="globe" [size]="14" />{{ lang() === 'en' ? 'EN' : 'ES' }}<span class="text-text-muted">/ {{ ui().otherLang }}</span></a>
      <a grButton variant="primary" size="s" href="/entradas" class="ml-auto lg:ml-0">{{ ui().cta }}</a>
      <button grIconButton icon="menu" [label]="ui().open" class="lg:hidden" (click)="open.set(true)"></button>
    </nav>
    @if (open()) {
      <div class="fixed inset-0 z-50 flex flex-col bg-bg-base/98 px-5 pt-3 backdrop-blur-xl lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
        <div class="flex h-14 items-center justify-between">
          <gr-logo [height]="32" />
          <button grIconButton icon="x" [label]="ui().close" (click)="open.set(false)"></button>
        </div>
        <ul class="mt-8 flex flex-col gap-1">
          @for (l of links(); track l.href) {
            <li><a [href]="l.href" (click)="open.set(false)" class="flex h-14 items-center justify-between border-b border-line-subtle text-display-xs">{{ l.label }}<gr-icon name="chevron-right" [size]="20" class="text-text-tertiary" /></a></li>
          }
          <li><a [href]="ui().otherHref" (click)="open.set(false)" class="flex h-14 items-center justify-between border-b border-line-subtle text-display-xs">{{ ui().otherLabel }}<gr-icon name="globe" [size]="20" class="text-text-tertiary" /></a></li>
        </ul>
        <a grButton variant="primary" size="l" href="/entradas" [block]="true" class="mt-auto mb-8">{{ ui().ctaMenu }}</a>
      </div>
    }
  `,
})
export class Navbar {
  readonly hidden = input(false);
  readonly lang = input<Lang>('es');
  protected readonly open = signal(false);
  protected readonly links = computed(() => LINKS[this.lang()]);
  protected readonly ui = computed(() => UI[this.lang()]);
  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
}

/** Footer (Figma «Footer»). */
@Component({
  selector: 'gr-footer',
  imports: [GrLogo],
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
    <div class="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8 xl:px-[120px]">
      <div>
        <gr-logo [height]="44" />
        <p class="mt-4 max-w-sm text-body-s text-text-tertiary">Campeonato de powerlifting en Almussafes (Valencia). Organiza GR Strength.</p>
      </div>
      <nav aria-label="Competición">
        <p class="text-mono-xs text-text-muted">Competición</p>
        <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
          <li><a href="/#campeonato" class="hover:text-text-primary">El campeonato</a></li>
          <li><a href="/reglamento" class="hover:text-text-primary">Reglamento</a></li>
          <li><a href="/categorias-de-peso" class="hover:text-text-primary">Categorías de peso</a></li>
          <li><a href="/preguntas-frecuentes" class="hover:text-text-primary">Preguntas frecuentes</a></li>
          <li><a href="/como-llegar" class="hover:text-text-primary">Cómo llegar</a></li>
          <li><a href="/blog" class="hover:text-text-primary">Blog</a> · <a href="/galeria" class="hover:text-text-primary">Galería</a></li>
          <li><a href="/publico" class="hover:text-text-primary">Ven a verlo</a> · <a href="/clubs" class="hover:text-text-primary">Clubs</a></li>
          <li><a href="/patrocinadores" class="hover:text-text-primary">Patrocinadores</a> · <a href="/voluntarios" class="hover:text-text-primary">Voluntarios</a></li>
          <li><a href="/en" hreflang="en" class="hover:text-text-primary">English</a></li>
        </ul>
      </nav>
      <nav aria-label="Legal">
        <p class="text-mono-xs text-text-muted">Legal</p>
        <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
          <li><a href="/privacidad" class="hover:text-text-primary">Privacidad</a></li>
          <li><a href="/terminos" class="hover:text-text-primary">Términos</a></li>
          <li><a href="/cookies" class="hover:text-text-primary">Cookies</a></li>
          <li><a href="/consentimiento-datos" class="hover:text-text-primary">Consentimiento de imagen</a></li>
          <li><a href="/politica-concurso" class="hover:text-text-primary">Bases del sorteo</a></li>
          <li><a [href]="instagram" rel="noopener" target="_blank" class="hover:text-text-primary">Instagram</a></li>
        </ul>
      </nav>
    </div>
    <p class="border-t border-line-subtle px-5 py-5 text-center text-body-xs text-text-muted">© {{ year }} GR Strength · Todos los derechos reservados</p>
    }
  `,
})
export class Footer {
  readonly lang = input<Lang>('es');
  protected readonly year = new Date().getFullYear();
  protected readonly instagram = INSTAGRAM;
}

/** Official Instagram of the organiser (legacy site footer). */
export const INSTAGRAM = 'https://www.instagram.com/grstrengthclub/';
