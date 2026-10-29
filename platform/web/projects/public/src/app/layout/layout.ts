import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrIconButton, GrLogo } from '@grcup/ui';

export interface NavLink {
  label: string;
  href: string;
}

const LINKS: NavLink[] = [
  { label: 'Competición', href: '/#campeonato' },
  { label: 'Atletas', href: '/atletas' },
  { label: 'Horarios', href: '/horarios' },
  { label: 'Sorteo', href: '/sorteo' },
  { label: 'Cómo llegar', href: '/como-llegar' },
];

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
      <a routerLink="/" class="shrink-0" aria-label="GR Strength Cup · inicio"><gr-logo [height]="32" /></a>
      <ul class="ml-auto hidden items-center gap-1 lg:flex">
        @for (l of links; track l.href) {
          <li><a [href]="l.href" class="inline-flex h-10 items-center rounded-sm px-3 text-label-s text-text-secondary transition-colors hover:text-text-primary">{{ l.label }}</a></li>
        }
      </ul>
      <span class="hidden h-8 items-center gap-1.5 rounded-pill border border-line-strong px-2.5 text-mono-xs text-text-secondary lg:inline-flex"><gr-icon name="globe" [size]="14" />ES</span>
      <a grButton variant="primary" size="s" href="/entradas" class="ml-auto lg:ml-0">Entrada gratis</a>
      <button grIconButton icon="menu" label="Abrir menú" class="lg:hidden" (click)="open.set(true)"></button>
    </nav>
    @if (open()) {
      <div class="fixed inset-0 z-50 flex flex-col bg-bg-base/98 px-5 pt-3 backdrop-blur-xl lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
        <div class="flex h-14 items-center justify-between">
          <gr-logo [height]="32" />
          <button grIconButton icon="x" label="Cerrar menú" (click)="open.set(false)"></button>
        </div>
        <ul class="mt-8 flex flex-col gap-1">
          @for (l of links; track l.href) {
            <li><a [href]="l.href" (click)="open.set(false)" class="flex h-14 items-center justify-between border-b border-line-subtle text-display-xs">{{ l.label }}<gr-icon name="chevron-right" [size]="20" class="text-text-tertiary" /></a></li>
          }
        </ul>
        <a grButton variant="primary" size="l" href="/entradas" [block]="true" class="mt-auto mb-8">Reserva tu entrada gratis</a>
      </div>
    }
  `,
})
export class Navbar {
  readonly hidden = input(false);
  protected readonly open = signal(false);
  protected readonly links = LINKS;
  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
}

/** Footer (Figma «Footer»). */
@Component({
  selector: 'gr-footer',
  imports: [GrLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-t border-line-subtle bg-bg-deep' },
  template: `
    <div class="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8 xl:px-[120px]">
      <div>
        <gr-logo [height]="44" />
        <p class="mt-4 max-w-sm text-body-s text-text-tertiary">Campeonato de powerlifting en Almussafes (Valencia). Organiza GR Strength.</p>
      </div>
      <nav aria-label="Competición">
        <p class="text-mono-xs text-text-muted">Competición</p>
        <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
          <li><a href="/#campeonato" class="hover:text-text-primary">El campeonato</a></li>
          <li><a href="/atletas" class="hover:text-text-primary">Atletas</a></li>
          <li><a href="/horarios" class="hover:text-text-primary">Horarios</a></li>
          <li><a href="/como-llegar" class="hover:text-text-primary">Cómo llegar</a></li>
        </ul>
      </nav>
      <nav aria-label="Legal">
        <p class="text-mono-xs text-text-muted">Legal</p>
        <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
          <li><a href="/privacidad" class="hover:text-text-primary">Privacidad</a></li>
          <li><a href="/terminos" class="hover:text-text-primary">Términos</a></li>
          <li><a href="/politica-concurso" class="hover:text-text-primary">Bases del sorteo</a></li>
          <li><a href="https://instagram.com/grstrength" rel="noopener" target="_blank" class="hover:text-text-primary">Instagram</a></li>
        </ul>
      </nav>
    </div>
    <p class="border-t border-line-subtle px-5 py-5 text-center text-body-xs text-text-muted">© {{ year }} GR Strength · Todos los derechos reservados</p>
  `,
})
export class Footer {
  protected readonly year = new Date().getFullYear();
}
