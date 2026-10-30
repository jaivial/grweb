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
    <!-- overflow-x-clip: the header glow must not widen the page on phones (clip keeps «sticky» working) -->
    <main class="relative overflow-x-clip">
      <!-- Figma «Cabecera» (SEO pages): 640 px glow at the top right (360 on mobile) -->
      @if (!centrado()) { <div class="pointer-events-none absolute -top-20 left-[55%] size-[360px] rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.42),transparent)] md:left-[55%] md:size-[640px]" aria-hidden="true"></div> }
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
      <!-- Figma «Cabecera» v2: 92 (mobile) / 148 (desktop) from the top, breadcrumbs Body/S, eyebrow Label/XS with
           the dash, Display/M → Display/XL title, tertiary Body/M → Body/L intro, «Updated stamp» -->
      <div class="relative mx-auto max-w-[1440px] px-5 pt-[92px] pb-18 md:px-8 md:pt-[148px] xl:px-[120px] xl:pb-26">
@if (cabecera()) {
                <header class="flex max-w-[900px] flex-col gap-3 md:gap-4">
          <nav class="flex flex-wrap items-center gap-1.5 text-body-s text-text-tertiary" aria-label="Migas">
            <a href="/" class="hover:text-text-primary">Inicio</a>
            @if (section()) { <gr-icon name="chevron-right" [size]="14" /><span>{{ section() }}</span> }
            <gr-icon name="chevron-right" [size]="14" /><span class="text-text-secondary">{{ crumb() || (title() + (accent() ? ' ' + accent() : '')) }}</span>
          </nav>
          <div class="flex flex-col gap-3 md:gap-4">
            @if (eyebrow()) { <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase"><span class="h-px w-7 bg-accent/60"></span>{{ eyebrow() }}</p> }
            <h1 class="text-display-m [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-xl" [class.sr-only]="hideTitle()">{{ title() }} @if (accent()) { <span class="text-accent-text">{{ accent() }}</span> }@if (suffix()) { {{ ' ' + suffix() }} }</h1>
            @if (subtitle()) { <p class="text-body-m text-text-tertiary md:text-body-l">{{ subtitle() }}</p> }
          </div>
          <!-- Figma «Meta»: the updated stamp and the badges in one row -->
          <div class="flex flex-wrap items-center gap-3 empty:hidden">
            @if (stamp()) { <p class="inline-flex items-center gap-2 rounded-sm border border-line-subtle px-3 py-2 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="14" class="shrink-0" />{{ stamp() }}</p> }
            <ng-content select="[pageStamps]" />
          </div>
        </header>
        }
        @if (cms.failed()) {
          <gr-alert class="mt-10 md:mt-16" tone="warning" title="No hemos podido cargar el contenido">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert>
        }
        <div [class]="cabecera() ? 'mt-10 md:mt-16' : ''"><ng-container [ngTemplateOutlet]="contenido" /></div>
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
