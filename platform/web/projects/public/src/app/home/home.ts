import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ChangeDetectionStrategy, Component, PendingTasks, RESPONSE_INIT, inject, signal } from '@angular/core';
import { GrAlert, fmtLongDate } from '@grcup/ui';
import { Cms, type HomeCms } from '../core/cms';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import type { Entradas } from '../core/entradas';
import type { Horarios } from '../core/horarios';
import { HOME_ALTERNATES, Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { NoEncontrada } from '../layout/no-encontrada';
import { Campeonato, fechaCorta } from './campeonato';
import { HeroTrophy } from './hero-trophy';
import {
  SecAfiliaciones, SecAlta, SecAtletas, SecCategorias, SecCifras, SecEntradas, SecFaq, SecHorarios, SecLocalizacion, SecOrganizacion, SecPremios,
} from './secciones';
import { SecSorteo, type SorteoHome } from './sorteo';

/**
 * «/ — Home» (Figma page 05, desktop · tablet · mobile). Data from the competition and the CMS («Web · home»: order,
 * visibility and texts of every section) plus the live numbers of tickets, raffle, schedule and athletes; all of it
 * rendered on the server. A section whose service fails is left out instead of showing wrong numbers.
 */
@Component({
  selector: 'gr-home',
  imports: [Navbar, Footer, GrAlert, HeroTrophy, Campeonato, SecCifras, SecAlta, SecEntradas, SecAtletas, SecPremios, SecOrganizacion, SecAfiliaciones,
    SecSorteo, SecCategorias, SecHorarios, SecLocalizacion, SecFaq],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = cms();
    @let c = comp.data();
    <gr-navbar [hidden]="!introDone()" />
    <main>
      <gr-hero-trophy [meta]="heroMeta()" [titulo]="$any(h?.secciones?.['hero']?.['titulo']) || ''" (done)="introDone.set($event)" />
      <gr-campeonato [comp]="c" [titulo]="$any(h?.secciones?.['campeonato']?.['titulo']) || 'Campeonato de powerlifting'"
        [subtitulo]="$any(h?.secciones?.['campeonato']?.['subtitulo']) || ''" [aviso]="$any(h?.secciones?.['campeonato']?.['aviso']) || ''"
        [patrocinadores]="h && h.orden.includes('patrocinadores') ? h.patrocinadores : []" [tituloPatrocinadores]="$any(h?.secciones?.['patrocinadores']?.['titulo']) || ''" />
      @if (cmsApi.limitado()) {
        <div class="mx-auto max-w-[1440px] px-5 py-10 md:px-8 xl:px-[120px]">
          <gr-alert tone="warning" title="Demasiadas visitas desde tu red">Hemos recibido muchas peticiones desde tu conexión. Espera un minuto y vuelve a cargar la página.</gr-alert>
        </div>
      }
      @if (h) {
        <!-- Sections in the order and visibility published from the backoffice («Web · home»). -->
        @for (k of h.orden; track k) {
          @switch (k) {
            @case ('cifras') { <gr-sec-cifras [s]="h.secciones[k]" /> }
            @case ('alta-atleta') { <gr-sec-alta [s]="h.secciones[k]" /> }
            @case ('inscripciones') { @if (!h.orden.includes('alta-atleta')) { <gr-sec-alta [s]="h.secciones[k]" /> } }
            @case ('entradas') { @if (c?.modulos?.['entradas']) { <gr-sec-entradas [s]="h.secciones[k]" [comp]="c" [entradas]="entradas()" [sorteo]="c?.modulos?.['sorteo'] ? sorteo() : null" /> } }
            @case ('atletas') { <gr-sec-atletas [atletas]="h.secciones['atletas']" [dia]="h.orden.includes('dia') ? h.secciones['dia'] : undefined" /> }
            @case ('dia') { @if (!h.orden.includes('atletas')) { <gr-sec-atletas [dia]="h.secciones['dia']" /> } }
            @case ('premios') { <gr-sec-premios [s]="h.secciones[k]" /> }
            @case ('organizacion') { <gr-sec-organizacion [s]="h.secciones[k]" /> }
            @case ('afiliaciones') { <gr-sec-afiliaciones [s]="h.secciones[k]" /> }
            @case ('sorteo') { @if (c?.modulos?.['sorteo'] && sorteo()) { <gr-sec-sorteo [s]="h.secciones[k]" [sorteo]="sorteo()" /> } }
            @case ('categorias') { <gr-sec-categorias [s]="h.secciones[k]" /> }
            @case ('horarios') { @if (horarios()?.publicado) { <gr-sec-horarios [s]="h.secciones[k]" [horarios]="horarios()" /> } }
            @case ('localizacion') { <gr-sec-localizacion [s]="h.secciones[k]" [comp]="c" /> }
            @case ('faq') { @if (h.faqDestacadas.length) { <gr-sec-faq [s]="h.secciones[k]" [items]="h.faqDestacadas" [contacto]="c?.evento?.emailContacto || ''" /> } }
          }
        }
      }
    </main>
    <gr-footer />
  `,
})
export class HomePage {
  protected readonly comp = inject(Competition);
  protected readonly cmsApi = inject(Cms);
  private readonly seo = inject(Seo);
  protected readonly introDone = signal(false);
  protected readonly cms = signal<HomeCms | null>(null);
  protected heroMeta = signal('');
  protected readonly sorteo = signal<SorteoHome | null>(null);
  protected readonly entradas = signal<Entradas | null>(null);
  protected readonly horarios = signal<Horarios | null>(null);

  constructor() {
    // PendingTasks keeps the server render open until the data and the SEO tags are in place.
    const http = inject(HttpClient);
    const api = (p: string) => `/api/competiciones/${COMPETITION_SLUG}${p}`;
    const opt = <T,>(p: string) => firstValueFrom(http.get<T>(api(p))).catch(() => null);
    void inject(PendingTasks).run(() => Promise.all([
      this.comp.load(), this.cmsApi.home(), opt<SorteoHome>('/sorteo'), opt<Entradas>('/entradas'), opt<Horarios>('/horarios?resumen=true'),
    ]).then(([c, h, sorteo, entradas, horarios]) => {
      this.cms.set(h);
      this.sorteo.set(sorteo);
      this.entradas.set(entradas);
      this.horarios.set(horarios);
      this.heroMeta.set([fechaCorta(c?.fechaInicio), c?.sede?.ciudad, c?.sede?.provincia].filter(Boolean).join(' · '));
      const nombre = c?.nombre ?? 'GR Strength Cup';
      this.seo.set({
        title: `${nombre} · Campeonato de powerlifting en ${c?.sede?.ciudad ?? 'Almussafes'}`,
        description: `${nombre}: campeonato de powerlifting ${c?.evento?.nivel ? '(' + c.evento.nivel + ') ' : ''}el ${c?.fechaInicio ? fmtLongDate(c.fechaInicio) : ''} en ${c?.sede?.nombre ?? 'Almussafes'}. Entradas gratuitas, atletas, horarios y directo.`,
        path: '/',
        alternates: HOME_ALTERNATES,
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
  imports: [Navbar, Footer, NoEncontrada],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-navbar />
    <main><gr-no-encontrada /></main>
    <gr-footer />
  `,
})
export class NotFoundPage {
  constructor() {
    const res = inject(RESPONSE_INIT, { optional: true });
    if (res) res.status = 404;
    inject(Seo).set({ title: 'Página no encontrada · GR Strength Cup', description: 'La página que buscas no existe.', path: '/404', robots: 'noindex' });
  }
}
