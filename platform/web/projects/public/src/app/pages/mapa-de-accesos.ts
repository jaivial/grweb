import { RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { Cms, type MapaAcceso } from '../core/cms';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Lightbox } from '../layout/lightbox';
import { Page } from '../layout/page';
import { applySeo } from './content';

type Practica = { titulo: string; texto: string; icono: GrIconName; enlace: string; ruta: string };
const T = {
  es: {
    titulo: 'Mapa de accesos al', pabellonDe: (c: string) => 'Pabellón de ' + c, visita: 'Visita', seccion: 'Cómo llegar', crumb: 'Mapa de accesos',
    subtitulo: 'Planos de las entradas del pabellón para atletas y público: por dónde se entra, dónde está el pesaje y cómo llegar a la grada.',
    accesos: 'Accesos', planos: 'Planos de acceso para *atletas y público*', ampliar: 'Ampliar: ', porConfirmar: 'Por confirmar',
    publicaremos: 'Publicaremos aquí los planos de acceso antes de la competición. Mientras tanto, tienes la dirección y el transporte en «Cómo llegar».',
    practicaEyebrow: 'Información práctica', antes: 'Antes de venir *al pabellón*', comoLlegar: 'Cómo llegar al pabellón', dormir: 'Dónde dormir y comer',
    practica: [
      { titulo: 'Acceso de atletas', texto: 'Localiza en el plano la entrada de atletas, el pesaje y la zona de calentamiento, y revisa a qué hora compite tu categoría.', icono: 'door', enlace: 'Ver horarios', ruta: '/horarios' },
      { titulo: 'Acceso del público', texto: 'La entrada es gratuita con reserva. Sigue el acceso de público del plano hasta la grada y ten tu entrada a mano.', icono: 'ticket', enlace: 'Reservar entrada', ruta: '/entradas' },
      { titulo: 'Aparcamiento y transporte', texto: 'Dirección, cómo llegar desde Valencia en coche o transporte público y dónde aparcar cerca del pabellón.', icono: 'parking', enlace: 'Cómo llegar', ruta: '/como-llegar' },
    ] as Practica[],
    seoTitulo: (c: string) => `Mapa de accesos al Pabellón de ${c} · GR Strength Cup`,
    seoDesc: (c: string) => `Planos de acceso al Pabellón de ${c} para atletas y público de la GR Strength Cup: entradas, pesaje, grada y aparcamiento.`,
    alt: (n: number, c: string) => `Mapa de accesos ${n} al Pabellón de ${c}`,
  },
  en: {
    titulo: 'Access map of the', pabellonDe: (c: string) => c + ' Sports Hall', visita: 'Visit', seccion: 'Getting there', crumb: 'Access map',
    subtitulo: 'Plans of the sports hall entrances for athletes and spectators: where to go in, where the weigh-in is and how to reach the stands.',
    accesos: 'Access', planos: 'Access plans for *athletes and spectators*', ampliar: 'Enlarge: ', porConfirmar: 'To be confirmed',
    publicaremos: 'We’ll publish the access plans here before the competition. In the meantime, you’ll find the address and transport under «Getting there».',
    practicaEyebrow: 'Practical information', antes: 'Before you come *to the sports hall*', comoLlegar: 'Getting to the sports hall', dormir: 'Where to stay and eat',
    practica: [
      { titulo: 'Athlete access', texto: 'Find the athletes’ entrance, the weigh-in and the warm-up area on the plan, and check what time your category competes.', icono: 'door', enlace: 'See the schedule', ruta: '/horarios' },
      { titulo: 'Spectator access', texto: 'Entry is free with a booking. Follow the spectator access on the plan to the stands and keep your ticket to hand.', icono: 'ticket', enlace: 'Book a ticket', ruta: '/entradas' },
      { titulo: 'Parking and transport', texto: 'Address, how to get there from Valencia by car or public transport and where to park near the sports hall.', icono: 'parking', enlace: 'Getting there', ruta: '/como-llegar' },
    ] as Practica[],
    seoTitulo: (c: string) => `Access map of the ${c} Sports Hall · GR Strength Cup`,
    seoDesc: (c: string) => `Access plans of the ${c} Sports Hall for GR Strength Cup athletes and spectators: entrances, weigh-in, stands and parking.`,
    alt: (n: number, c: string) => `Access map ${n} of the ${c} Sports Hall`,
  },
};

/**
 * /mapa-de-accesos: the access maps the staff uploads in the backoffice («Web y contenidos · Mapas de acceso»),
 * in their order, with the optional title, subtitle and description. Loaded by REST and reloaded on the public
 * SSE event «web.mapas». SEO: one h1, two h2 and three h3 (the titles of the maps are not headings: their
 * number changes).
 */
@Component({
  selector: 'gr-mapa-accesos-page',
  imports: [RouterLink, LocPipe, Page, GrIcon, GrButton, GrCabecera, Lightbox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().pabellonDe(ciudad())" [eyebrow]="t().visita" [section]="t().seccion" [crumb]="t().crumb"
      [subtitle]="t().subtitulo">
      <div class="flex flex-col gap-12 md:gap-20">
        <section id="planos" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
          <gr-cabecera [eyebrow]="t().accesos" [titulo]="t().planos" [centro]="false" tam="m" />
          @if (mapas(); as l) {
            @if (l.length) {
              <ul class="grid gap-6 lg:grid-cols-2" [class.lg:grid-cols-1]="l.length === 1">
                @for (m of l; track m.imagenUrl; let i = $index) {
                  <li>
                    <figure class="flex h-full flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                      <button type="button" class="group cursor-zoom-in bg-black/30" [attr.aria-label]="t().ampliar + alt(m, i)" (click)="ver.set(i)">
                        <img [src]="m.imagenUrl" [alt]="alt(m, i)" class="max-h-[720px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]" [attr.loading]="i ? 'lazy' : 'eager'" />
                      </button>
                      @if (m.titulo || m.subtitulo || m.descripcion) {
                        <figcaption class="flex flex-col gap-1.5 p-5 md:p-6">
                          @if (m.titulo) { <p class="text-ui-h5">{{ m.titulo }}</p> }
                          @if (m.subtitulo) { <p class="text-body-s text-text-secondary">{{ m.subtitulo }}</p> }
                          @if (m.descripcion) { <p class="text-body-s whitespace-pre-line text-text-tertiary">{{ m.descripcion }}</p> }
                        </figcaption>
                      }
                    </figure>
                  </li>
                }
              </ul>
              <gr-lightbox [fotos]="fotos()" [(indice)]="ver" />
            } @else {
              <!-- Figma «Callout» (info): nothing uploaded yet -->
              <div class="flex gap-3 rounded-lg bg-info/8 p-4">
                <gr-icon name="clock" [size]="20" class="ml-2 shrink-0 text-info" />
                <div class="flex flex-col gap-1"><p class="text-label-s text-info">{{ t().porConfirmar }}</p>
                  <p class="text-body-m text-text-secondary">{{ t().publicaremos }}</p></div>
              </div>
            }
          }
        </section>

        <section id="antes-de-venir" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
          <gr-cabecera [eyebrow]="t().practicaEyebrow" [titulo]="t().antes" [centro]="false" tam="m" />
          <div class="grid gap-4 lg:grid-cols-3">
            @for (p of t().practica; track p.ruta) {
              <article class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6">
                <div class="flex items-center gap-2">
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="p.icono" [size]="20" /></span>
                  <h3 class="text-ui-h5">{{ p.titulo }}</h3>
                </div>
                <p class="text-body-s text-text-tertiary">{{ p.texto }}</p>
                <a [routerLink]="p.ruta | loc" class="mt-auto inline-flex items-center gap-1.5 pt-2 text-label-s text-accent-text hover:underline">{{ p.enlace }}<gr-icon name="arrow-right" [size]="14" /></a>
              </article>
            }
          </div>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a grButton variant="outline" size="l" [routerLink]="'/como-llegar' | loc" icon="map-pin">{{ t().comoLlegar }}</a>
            <a grButton variant="outline" size="l" [routerLink]="'/donde-dormir-y-comer' | loc">{{ t().dormir }}</a>
          </div>
        </section>
      </div>
    </gr-page>
  `,
})
export class MapaAccesosPage {
  private readonly cms = inject(Cms);
  protected readonly t = inject(I18n).dict(T);
  /** null: still loading. */
  protected readonly mapas = signal<MapaAcceso[] | null>(null);
  protected readonly ciudad = signal('Almussafes');
  /** Map open in the lightbox (−1: closed). */
  protected readonly ver = signal(-1);
  protected readonly fotos = computed(() => (this.mapas() ?? []).map((m, i) => ({ imagen: m.imagenUrl, alt: this.alt(m, i), pie: [m.titulo, m.subtitulo].filter(Boolean).join(' · ') || undefined })));

  constructor() {
    const seo = inject(Seo);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [c, l] = await Promise.all([competition.load(), this.cms.mapas()]);
      if (c?.sede.ciudad) this.ciudad.set(c.sede.ciudad);
      this.mapas.set(l ?? []);
      await applySeo(this.cms, seo, '/mapa-de-accesos', this.t().seoTitulo(this.ciudad()), this.t().seoDesc(this.ciudad()));
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // Live: reload when the staff uploads, edits, sorts or deletes a map (public SSE, no personal data).
      const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
      let t: ReturnType<typeof setTimeout> | undefined;
      es.addEventListener('web.mapas', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const l = await this.cms.mapas();
          if (l) this.mapas.set(l);
        }, 400);
      });
      inject(DestroyRef).onDestroy(() => { clearTimeout(t); es.close(); });
    }
  }

  protected alt(m: MapaAcceso, i: number): string {
    return m.titulo || this.t().alt(i + 1, this.ciudad());
  }
}
