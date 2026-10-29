import { ChangeDetectionStrategy, Component, PendingTasks, inject, signal } from '@angular/core';
import { fmtLongDate } from '@grcup/ui';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { HeroTrophy } from './hero-trophy';
import { Campeonato, Sponsors, Stats } from './sections';

/** «/ — Home» (Figma page 05). Data from GET /api/competiciones/grcup, rendered on the server. */
@Component({
  selector: 'gr-home',
  imports: [Navbar, Footer, HeroTrophy, Campeonato, Sponsors, Stats],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-navbar [hidden]="!introDone()" />
    <main>
      <gr-hero-trophy [meta]="heroMeta()" (done)="introDone.set($event)" />
      <gr-campeonato [comp]="comp.data()" />
      <gr-sponsors />
      <gr-stats />
    </main>
    <gr-footer />
  `,
})
export class HomePage {
  protected readonly comp = inject(Competition);
  private readonly seo = inject(Seo);
  protected readonly introDone = signal(false);
  protected heroMeta = signal('');

  constructor() {
    // PendingTasks keeps the server render open until the data and the SEO tags are in place.
    void inject(PendingTasks).run(() => this.comp.load().then((c) => {
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
    inject(Seo).set({ title: 'Página no encontrada · GR Strength Cup', description: 'La página que buscas no existe.', path: '/404' });
  }
}
