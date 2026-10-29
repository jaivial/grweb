import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GrAlert, GrIcon } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Footer, Navbar, type Lang } from './layout';

/** Standard inner page (Figma pages 11–34): navbar, header with breadcrumbs / eyebrow / title with accent, content, footer. */
@Component({
  selector: 'gr-page',
  imports: [Navbar, Footer, GrIcon, GrAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-navbar [lang]="lang()" />
    <main class="relative">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style="background: radial-gradient(60% 70% at 15% 0%, rgb(110 20 32 / 0.35), transparent 70%)"></div>
      <div class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px] xl:pb-24">
        <header class="max-w-3xl">
          <nav class="flex flex-wrap items-center gap-1.5 text-body-xs text-text-tertiary" aria-label="Migas">
            <a href="/" class="hover:text-text-primary">Inicio</a>
            @if (section()) { <gr-icon name="chevron-right" [size]="12" /><span>{{ section() }}</span> }
            <gr-icon name="chevron-right" [size]="12" /><span class="text-text-secondary">{{ crumb() || (title() + (accent() ? ' ' + accent() : '')) }}</span>
          </nav>
          @if (eyebrow()) { <p class="mt-6 flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>{{ eyebrow() }}</p> }
          <h1 class="mt-3 text-display-m md:text-display-l">{{ title() }} @if (accent()) { <span class="text-accent-text">{{ accent() }}</span> }</h1>
          @if (subtitle()) { <p class="mt-4 text-body-m text-text-secondary md:text-body-l">{{ subtitle() }}</p> }
          @if (stamp()) { <p class="mt-5 inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />{{ stamp() }}</p> }
        </header>
        @if (cms.failed()) {
          <gr-alert class="mt-10 md:mt-14" tone="warning" title="No hemos podido cargar el contenido">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert>
        }
        <div class="mt-10 md:mt-14"><ng-content /></div>
      </div>
    </main>
    <gr-footer [lang]="lang()" />
  `,
})
export class Page {
  protected readonly cms = inject(Cms);
  readonly title = input.required<string>();
  readonly accent = input('');
  readonly eyebrow = input('');
  readonly subtitle = input('');
  readonly crumb = input('');
  /** Middle breadcrumb (e.g. «Visita», «Comunidad»). */
  readonly section = input('');
  readonly lang = input<Lang>('es');
  readonly stamp = input('');
}
