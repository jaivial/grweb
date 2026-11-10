import { RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { Cms, type MapaAcceso } from '../core/cms';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Lightbox } from '../layout/lightbox';
import { Page } from '../layout/page';
import { applySeo } from './content';

/**
 * /mapa-de-accesos: the access maps the staff uploads in the backoffice («Web y contenidos · Mapas de acceso»),
 * in their order, with the optional title, subtitle and description. Loaded by REST and reloaded on the public
 * SSE event «web.mapas». SEO: one h1, two h2 and three h3 (the titles of the maps are not headings: their
 * number changes).
 */
@Component({
  selector: 'gr-mapa-accesos-page',
  imports: [RouterLink, Page, GrIcon, GrButton, GrCabecera, Lightbox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Mapa de accesos al" [accent]="'Pabellón de ' + ciudad()" eyebrow="Visita" section="Cómo llegar" crumb="Mapa de accesos"
      subtitle="Planos de las entradas del pabellón para atletas y público: por dónde se entra, dónde está el pesaje y cómo llegar a la grada.">
      <div class="flex flex-col gap-12 md:gap-20">
        <section id="planos" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
          <gr-cabecera eyebrow="Accesos" titulo="Planos de acceso para *atletas y público*" [centro]="false" tam="m" />
          @if (mapas(); as l) {
            @if (l.length) {
              <ul class="grid gap-6 lg:grid-cols-2" [class.lg:grid-cols-1]="l.length === 1">
                @for (m of l; track m.imagenUrl; let i = $index) {
                  <li>
                    <figure class="flex h-full flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                      <button type="button" class="group cursor-zoom-in bg-black/30" [attr.aria-label]="'Ampliar: ' + alt(m, i)" (click)="ver.set(i)">
                        <img [src]="m.imagenUrl" [alt]="alt(m, i)" class="max-h-[720px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]" [attr.loading]="i ? 'lazy' : 'eager'" />
                      </button>
                      @if (m.titulo || m.subtitulo || m.descripcion) {
                        <figcaption class="flex flex-col gap-1.5 p-5 md:p-6">
                          @if (m.subtitulo) { <p class="text-label-xs text-text-muted uppercase">{{ m.subtitulo }}</p> }
                          @if (m.titulo) { <p class="text-ui-h5">{{ m.titulo }}</p> }
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
                <div class="flex flex-col gap-1"><p class="text-label-s text-info">Por confirmar</p>
                  <p class="text-body-m text-text-secondary">Publicaremos aquí los planos de acceso antes de la competición. Mientras tanto, tienes la dirección y el transporte en «Cómo llegar».</p></div>
              </div>
            }
          }
        </section>

        <section id="antes-de-venir" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
          <gr-cabecera eyebrow="Información práctica" titulo="Antes de venir *al pabellón*" [centro]="false" tam="m" />
          <div class="grid gap-4 lg:grid-cols-3">
            @for (t of practica; track t.titulo) {
              <article class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6">
                <div class="flex items-center gap-2">
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="t.icono" [size]="20" /></span>
                  <h3 class="text-ui-h5">{{ t.titulo }}</h3>
                </div>
                <p class="text-body-s text-text-tertiary">{{ t.texto }}</p>
                <a [routerLink]="t.ruta" class="mt-auto inline-flex items-center gap-1.5 pt-2 text-label-s text-accent-text hover:underline">{{ t.enlace }}<gr-icon name="arrow-right" [size]="14" /></a>
              </article>
            }
          </div>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a grButton variant="outline" size="l" routerLink="/como-llegar" icon="map-pin">Cómo llegar al pabellón</a>
            <a grButton variant="outline" size="l" routerLink="/donde-dormir-y-comer">Dónde dormir y comer</a>
          </div>
        </section>
      </div>
    </gr-page>
  `,
})
export class MapaAccesosPage {
  private readonly cms = inject(Cms);
  /** null: still loading. */
  protected readonly mapas = signal<MapaAcceso[] | null>(null);
  protected readonly ciudad = signal('Almussafes');
  /** Map open in the lightbox (−1: closed). */
  protected readonly ver = signal(-1);
  protected readonly fotos = computed(() => (this.mapas() ?? []).map((m, i) => ({ imagen: m.imagenUrl, alt: this.alt(m, i), pie: [m.titulo, m.subtitulo].filter(Boolean).join(' · ') || undefined })));
  protected readonly practica: { titulo: string; texto: string; icono: GrIconName; enlace: string; ruta: string }[] = [
    { titulo: 'Acceso de atletas', texto: 'Localiza en el plano la entrada de atletas, el pesaje y la zona de calentamiento, y revisa a qué hora compite tu categoría.', icono: 'door', enlace: 'Ver horarios', ruta: '/horarios' },
    { titulo: 'Acceso del público', texto: 'La entrada es gratuita con reserva. Sigue el acceso de público del plano hasta la grada y ten tu entrada a mano.', icono: 'ticket', enlace: 'Reservar entrada', ruta: '/entradas' },
    { titulo: 'Aparcamiento y transporte', texto: 'Dirección, cómo llegar desde Valencia en coche o transporte público y dónde aparcar cerca del pabellón.', icono: 'parking', enlace: 'Cómo llegar', ruta: '/como-llegar' },
  ];

  constructor() {
    const seo = inject(Seo);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [c, l] = await Promise.all([competition.load(), this.cms.mapas()]);
      if (c?.sede.ciudad) this.ciudad.set(c.sede.ciudad);
      this.mapas.set(l ?? []);
      await applySeo(this.cms, seo, '/mapa-de-accesos', `Mapa de accesos al Pabellón de ${this.ciudad()} · GR Strength Cup`,
        `Planos de acceso al Pabellón de ${this.ciudad()} para atletas y público de la GR Strength Cup: entradas, pesaje, grada y aparcamiento.`);
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
    return m.titulo || `Mapa de accesos ${i + 1} al Pabellón de ${this.ciudad()}`;
  }
}
