import { ChangeDetectionStrategy, Component, PendingTasks, RESPONSE_INIT, inject, signal } from '@angular/core';
import { fmtLongDate } from '@grcup/ui';
import { Cms, type HomeCms } from '../core/cms';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { HeroTrophy } from './hero-trophy';
import { SecCifras, SecEditorial, SecEntradas, SecFaq, SecInscripciones, SecLocalizacion, SecOrganizacion, SecPatrocinadores, SecPremios } from './cms-sections';
import { Campeonato, Sponsors, Stats } from './sections';

/** «/ — Home» (Figma page 05). Data from GET /api/competiciones/grcup, rendered on the server. */
@Component({
  selector: 'gr-home',
  imports: [Navbar, Footer, HeroTrophy, Campeonato, Sponsors, Stats, SecInscripciones, SecEntradas, SecEditorial, SecPremios, SecOrganizacion, SecCifras, SecPatrocinadores, SecFaq, SecLocalizacion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = cms();
    @let c = comp.data();
    <gr-navbar [hidden]="!introDone()" />
    <main>
      <gr-hero-trophy [meta]="heroMeta()" [titulo]="$any(h?.secciones?.['hero']?.['titulo']) || ''" (done)="introDone.set($event)" />
      <gr-campeonato [comp]="c" [subtitulo]="$any(h?.secciones?.['campeonato']?.['subtitulo']) || ''" />
      @if (h) {
        <!-- Sections in the order and visibility published from the backoffice («Web · home»). -->
        @for (k of h.orden; track k) {
          @switch (k) {
            @case ('inscripciones') { <gr-sec-inscripciones [s]="h.secciones[k]" [comp]="c" /> }
            @case ('entradas') { @if (c?.modulos?.['entradas']) { <gr-sec-entradas [s]="h.secciones[k]" /> } }
            @case ('atletas') { <gr-sec-editorial [s]="h.secciones[k]" /> }
            @case ('dia') { <gr-sec-editorial [s]="h.secciones[k]" [reverse]="true" /> }
            @case ('premios') { <gr-sec-premios [s]="h.secciones[k]" /> }
            @case ('organizacion') { <gr-sec-organizacion [s]="h.secciones[k]" /> }
            @case ('cifras') { <gr-sec-cifras [s]="h.secciones[k]" /> }
            @case ('patrocinadores') { <gr-sec-patrocinadores [titulo]="$any(h.secciones[k]['titulo'])" [items]="h.patrocinadores" /> }
            @case ('faq') { @if (h.faqDestacadas.length) { <gr-sec-faq [s]="h.secciones[k]" [items]="h.faqDestacadas" /> } }
            @case ('localizacion') { <gr-sec-localizacion [s]="h.secciones[k]" [comp]="c" /> }
          }
        }
      } @else {
        <gr-sponsors />
        <gr-stats />
      }
    </main>
    <gr-footer />
  `,
})
export class HomePage {
  protected readonly comp = inject(Competition);
  private readonly seo = inject(Seo);
  protected readonly introDone = signal(false);
  protected readonly cms = signal<HomeCms | null>(null);
  protected heroMeta = signal('');

  constructor() {
    // PendingTasks keeps the server render open until the data and the SEO tags are in place.
    const cmsApi = inject(Cms);
    void inject(PendingTasks).run(() => Promise.all([this.comp.load(), cmsApi.home()]).then(([c, h]) => {
      this.cms.set(h);
      const fecha = c?.fechaInicio ? fmtLongDate(c.fechaInicio).replace(/ de /g, ' ').toUpperCase() : '';
      this.heroMeta.set([fecha, c?.sede?.ciudad?.toUpperCase(), c?.sede?.provincia?.toUpperCase()].filter(Boolean).join(' · '));
      const nombre = c?.nombre ?? 'GR Strength Cup';
      this.seo.set({
        title: `${nombre} · Campeonato de powerlifting en ${c?.sede?.ciudad ?? 'Almussafes'}`,
        description: `${nombre}: campeonato de powerlifting ${c?.evento?.nivel ? '(' + c.evento.nivel + ') ' : ''}el ${c?.fechaInicio ? fmtLongDate(c.fechaInicio) : ''} en ${c?.sede?.nombre ?? 'Almussafes'}. Entradas gratuitas, atletas, horarios y directo.`,
        path: '/',
        jsonLd: c
          ? {
              '@context': 'https://schema.org',
              '@type': 'SportsEvent',
              name: nombre,
              sport: 'Powerlifting',
              startDate: c.fechaInicio,
              endDate: c.fechaFin ?? c.fechaInicio,
              eventStatus: 'https://schema.org/EventScheduled',
              eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
              location: {
                '@type': 'Place',
                name: c.sede.nombre,
                address: { '@type': 'PostalAddress', streetAddress: c.sede.direccion, postalCode: c.sede.cp, addressLocality: c.sede.ciudad, addressRegion: c.sede.provincia, addressCountry: 'ES' },
              },
              organizer: { '@type': 'Organization', name: c.evento.organizador || 'GR Strength', url: this.seo.origin },
              image: this.seo.defaultImage,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: this.seo.origin + '/entradas' },
            }
          : undefined,
      });
    }));
  }
}

/** 404 of the public site. */
@Component({
  selector: 'gr-not-found',
  imports: [Navbar, Footer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-navbar />
    <main class="flex min-h-[80dvh] flex-col items-center justify-center px-5 pt-24 text-center">
      <p class="text-display-xl text-accent-text">404</p>
      <h1 class="mt-4 text-display-s">Esta página no existe</h1>
      <p class="mt-3 max-w-md text-body-m text-text-tertiary">Puede que el enlace esté mal o que la sección todavía no esté publicada.</p>
      <a href="/" class="mt-8 inline-flex h-12 items-center rounded-sm bg-accent-grain px-6 text-label-m">Volver al inicio</a>
    </main>
    <gr-footer />
  `,
})
export class NotFoundPage {
  constructor() {
    const res = inject(RESPONSE_INIT, { optional: true });
    if (res) res.status = 404;
    inject(Seo).set({ title: 'Página no encontrada · GR Strength Cup', description: 'La página que buscas no existe.', path: '/404' });
  }
}
