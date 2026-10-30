import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { GrAlert, GrIcon } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Footer, Navbar, type Lang } from './layout';

/**
 * Standard inner page (Figma pages 11–34): navbar, header with breadcrumbs / eyebrow / title with accent, content, footer.
 * `centrado`: the form pages of Figma (06 /inscripcion…): no breadcrumbs, centred header and a 760 px column.
 * `[cabecera]="false"`: the content brings its own h1 (state screens such as «Plazas completas»).
 */
@Component({
  selector: 'gr-page',
  imports: [Navbar, Footer, GrIcon, GrAlert, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- one projection point, shown by either layout -->
    <ng-template #contenido><ng-content /></ng-template>
    <gr-navbar [lang]="lang()" />
    <main class="relative">
      @if (!centrado()) { <div class="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style="background: radial-gradient(60% 70% at 15% 0%, rgb(110 20 32 / 0.35), transparent 70%)"></div> }
      @if (centrado()) {
        <div class="relative mx-auto flex max-w-[800px] flex-col gap-5 px-5 pt-[120px] pb-18 md:gap-7 md:pt-40 md:pb-30">
          @if (cabecera()) {
            <header class="flex flex-col items-center gap-3 text-center">
              @if (eyebrow()) { <p class="text-mono-xs text-text-tertiary">{{ eyebrow() }}</p> }
              <h1 class="text-display-s md:text-display-l" [class.sr-only]="hideTitle()">{{ title() }} @if (accent()) { <span class="text-accent-text">{{ accent() }}</span> }@if (suffix()) { {{ ' ' + suffix() }} }</h1>
              @if (subtitle()) { <p class="text-body-s text-text-secondary md:text-body-l">{{ subtitle() }}</p> }
            </header>
          }
          <ng-container [ngTemplateOutlet]="contenido" />
        </div>
      } @else {
      <div class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px] xl:pb-24">
        <header class="max-w-3xl">
          <nav class="flex flex-wrap items-center gap-1.5 text-body-xs text-text-tertiary" aria-label="Migas">
            <a href="/" class="hover:text-text-primary">Inicio</a>
            @if (section()) { <gr-icon name="chevron-right" [size]="12" /><span>{{ section() }}</span> }
            <gr-icon name="chevron-right" [size]="12" /><span class="text-text-secondary">{{ crumb() || (title() + (accent() ? ' ' + accent() : '')) }}</span>
          </nav>
          @if (eyebrow()) { <p class="mt-6 flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>{{ eyebrow() }}</p> }
          <h1 class="mt-3 text-display-m md:text-display-l" [class.sr-only]="hideTitle()">{{ title() }} @if (accent()) { <span class="text-accent-text">{{ accent() }}</span> }@if (suffix()) { {{ ' ' + suffix() }} }</h1>
          @if (subtitle()) { <p class="mt-4 text-body-m text-text-secondary md:text-body-l">{{ subtitle() }}</p> }
          @if (stamp()) { <p class="mt-5 inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />{{ stamp() }}</p> }
          <ng-content select="[pageStamps]" />
        </header>
        @if (cms.failed()) {
          <gr-alert class="mt-10 md:mt-14" tone="warning" title="No hemos podido cargar el contenido">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert>
        }
        <div class="mt-10 md:mt-14"><ng-container [ngTemplateOutlet]="contenido" /></div>
      </div>
      }
    </main>
    <gr-footer [lang]="lang()" />
  `,
})
export class Page {
  protected readonly cms = inject(Cms);
  readonly title = input.required<string>();
  readonly accent = input('');
  /** Keep the h1 for SEO / screen readers but hide it (the page shows the name in its own hero). */
  readonly hideTitle = input(false);
  /** Text after the red accent («Los 150 atletas de la GR Cup»). */
  readonly suffix = input('');
  readonly eyebrow = input('');
  readonly subtitle = input('');
  readonly crumb = input('');
  /** Middle breadcrumb (e.g. «Visita», «Comunidad»). */
  readonly section = input('');
  readonly lang = input<Lang>('es');
  readonly stamp = input('');
  readonly centrado = input(false);
  readonly cabecera = input(true);
}
