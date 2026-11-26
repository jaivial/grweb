import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GrAlert, GrIcon } from '@grcup/ui';
import { Cms } from '../core/cms';
import { I18n, LocPipe } from '../core/i18n';
import { Footer, Navbar } from './layout';

const T = {
  es: {
    migas: 'Migas', inicio: 'Inicio',
    limitadoTitulo: 'Demasiadas visitas desde tu red', limitado: 'Hemos recibido muchas peticiones desde tu conexión. Espera un minuto y vuelve a cargar la página.',
    falloTitulo: 'No hemos podido cargar el contenido', fallo: 'Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.',
  },
  en: {
    migas: 'Breadcrumbs', inicio: 'Home',
    limitadoTitulo: 'Too many visits from your network', limitado: 'We have received a lot of requests from your connection. Wait a minute and reload the page.',
    falloTitulo: 'We could not load the content', fallo: 'We are having a temporary problem. Please try again in a few minutes.',
  },
};

/**
 * Standard inner page (Figma pages 11–34): navbar, header with breadcrumbs / eyebrow / title with accent, content, footer.
 * `centrado`: the form pages of Figma (06 /inscripcion…): no breadcrumbs, centred header and a 760 px column.
 * `[cabecera]="false"`: the content brings its own h1 (state screens such as «Plazas completas»).
 */
@Component({
  selector: 'gr-page',
  imports: [RouterLink, LocPipe, Navbar, Footer, GrIcon, GrAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-navbar />
    <!-- overflow-x-clip: the header glow must not widen the page on phones (clip keeps «sticky» working) -->
    <main class="relative overflow-x-clip">
      <!-- Figma «Cabecera» (SEO pages): 640 px glow at the top right (360 on mobile; none at 200 % zoom, UX6-R1-12) -->
      @if (!centrado()) { <div class="pointer-events-none absolute -top-20 left-[55%] size-[360px] max-[239px]:hidden rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.42),transparent)] md:left-[55%] md:size-[640px]" aria-hidden="true"></div> }
      <!-- One wrapper and ONE plain <ng-content>: projecting through an <ng-template> + ngTemplateOutlet broke hydration
           (NG0501) on pages whose content starts with control flow. The layout only changes classes. -->
      <div [class]="centrado() ? 'relative mx-auto flex max-w-[800px] flex-col gap-5 px-5 pt-[120px] pb-18 md:gap-7 md:pt-40 md:pb-30'
        : juego() ? 'relative mx-auto flex max-w-[1440px] flex-col gap-6 px-4 pt-[104px] pb-8 md:gap-7 md:px-8 md:pt-[120px] md:pb-12 xl:px-16'
        : 'relative mx-auto max-w-[1440px] px-5 pb-18 md:px-8 md:pt-[148px] xl:px-[120px] xl:pb-26 ' + (tituloMovilGrande() ? 'pt-[149px]' : 'pt-[92px]')">
        @if (cabecera() && centrado()) {
          <header class="flex flex-col items-center gap-3 text-center">
            @if (eyebrow()) { <p class="text-mono-xs text-text-tertiary">{{ eyebrow() }}</p> }
            <h1 class="text-display-s md:text-display-l" [class.sr-only]="hideTitle()">{{ title() }} @if (accent()) { <span class="text-accent-text">{{ accent() }}</span> }@if (suffix()) { {{ ' ' + suffix() }} }</h1>
            @if (subtitle()) { @if (subtitleHtml()) { <p class="text-body-s text-text-secondary md:text-body-l" [innerHTML]="subtitleHtml()"></p> } @else { <p class="text-body-s text-text-secondary md:text-body-l">{{ subtitle() }}</p> } }
          </header>
        }
        <!-- Figma «Cabecera de página» (387:116856, Jaime 14-nov): only breadcrumbs + title on every page. The eyebrow stays
             as sr-only text (SEO), the intro is not painted (sr-only; the page's meta description carries it) and the
             «Meta» row (updated stamp / pageStamps badges) is gone. -->
        @if (cabecera() && !centrado() && !juego()) {
          <header class="max-w-[900px] flex-col gap-4 md:flex md:gap-6" [class.flex]="cabeceraMovil()" [class.hidden]="!cabeceraMovil()" [class.mx-auto]="tituloCentrado()" [class.text-center]="tituloCentrado()">
            <nav class="flex-wrap items-center gap-1.5 text-body-s text-text-tertiary md:flex" [class.justify-center]="tituloCentrado()" [class.flex]="migasMovil()" [class.hidden]="!migasMovil()" [attr.aria-label]="t().migas">
              <a [routerLink]="'/' | loc" class="-mx-2 -my-3 inline-flex min-h-11 min-w-11 items-center justify-center px-2 hover:text-text-primary">{{ t().inicio }}</a>
              @if (section()) { <gr-icon name="chevron-right" [size]="14" /><span>{{ section() }}</span> }
              <gr-icon name="chevron-right" [size]="14" /><span class="text-text-secondary">{{ crumb() || (title() + (accent() ? ' ' + accent() : '')) }}</span>
            </nav>
            <div class="flex flex-col">
              @if (eyebrow()) { <p class="sr-only">{{ eyebrow() }}</p> }
              <h1 [class.text-display-l]="tituloMovilGrande()" [class.text-display-m]="!tituloMovilGrande()" [class.gr-h1-movil]="tituloMovilGrande()" class="hyphens-none [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-xl" [class.sr-only]="hideTitle()">{{ title() }} @if (accent()) { <span [class]="tituloMovilGrande() ? 'text-accent' : 'text-accent-text'">{{ accent() }}</span> }@if (suffix()) { {{ ' ' + suffix() }} }</h1>
              @if (subtitle()) { @if (subtitleHtml()) { <p class="sr-only" [innerHTML]="subtitleHtml()"></p> } @else { <p class="sr-only">{{ subtitle() }}</p> } }
            </div>
            <div class="flex flex-wrap items-center gap-3 empty:hidden"><ng-content select="[pageStamps]" /></div>
          </header>
        }
        @if (!centrado() && cms.limitado()) {
          <gr-alert class="mt-10 md:mt-16" tone="warning" [title]="t().limitadoTitulo">{{ t().limitado }}</gr-alert>
        } @else if (!centrado() && cms.failed()) {
          <gr-alert class="mt-10 md:mt-16" tone="warning" [title]="t().falloTitulo">{{ t().fallo }}</gr-alert>
        }
        <div [class]="centrado() || juego() ? 'contents' : cabecera() ? (separacion() || 'mt-10 block md:mt-16') : 'block'"><ng-content /></div>
      </div>
    </main>
    <gr-footer />
  `,
})
export class Page {
  protected readonly cms = inject(Cms);
  protected readonly t = inject(I18n).dict(T);
  readonly title = input.required<string>();
  readonly accent = input('');
  /** Keep the h1 for SEO / screen readers but hide it (the page shows the name in its own hero). */
  readonly hideTitle = input(false);
  /** Text after the red accent («Los 150 atletas de la GR Cup»). */
  readonly suffix = input('');
  readonly eyebrow = input('');
  readonly subtitle = input('');
  /** Subtitle with inline markup (sanitized by Angular); wins over subtitle when set. */
  readonly subtitleHtml = input('');
  /** Display/L title on mobile too (Figma 75 Alta de atleta). */
  readonly tituloMovilGrande = input(false);
  /** Centred title block (e.g. /alta-atleta success state). */
  readonly tituloCentrado = input(false);
  readonly crumb = input('');
  /** Middle breadcrumb (e.g. «Visita», «Comunidad»). */
  readonly section = input('');
  /** Ignored since the «Cabecera de página» redesign (no updated stamp in the header); kept so pages still compile. */
  readonly stamp = input('');
  readonly centrado = input(false);
  /** Game pages (Figma 71 /porra): 64 px sides, 120 px top, the content brings its own header; children stack with 28/24 px gaps. */
  readonly juego = input(false);
  readonly cabecera = input(true);
  /** false: the header only shows from tablet (the page brings its own mobile title, e.g. /en-directo under the video). */
  readonly cabeceraMovil = input(true);
  /** false: breadcrumbs only from tablet (Figma 38 /mi-entrada mobile has none). */
  readonly migasMovil = input(true);
  /** Classes for the gap header → content when the Figma header keeps its empty 100 px «Meta» row (pages 29–31). */
  readonly separacion = input('');
}
