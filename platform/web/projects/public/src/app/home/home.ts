import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ChangeDetectionStrategy, Component, PendingTasks, RESPONSE_INIT, inject, signal } from '@angular/core';
import { fmtLongDate } from '@grcup/ui';
import { Cms, type HomeCms } from '../core/cms';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import type { Entradas } from '../core/entradas';
import type { Horarios } from '../core/horarios';
import { HOME_ALTERNATES, Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { Campeonato, fechaCorta } from './campeonato';
import { HeroTrophy } from './hero-trophy';
import {
  SecAfiliaciones, SecAtletas, SecCategorias, SecCifras, SecEntradas, SecFaq, SecHorarios, SecInscripciones, SecLocalizacion, SecOrganizacion, SecPremios, SecSorteo,
  type SorteoHome,
} from './secciones';

/**
 * «/ — Home» (Figma page 05, desktop · tablet · mobile). Data from the competition and the CMS («Web · home»: order,
 * visibility and texts of every section) plus the live numbers of tickets, raffle, schedule and athletes; all of it
 * rendered on the server. A section whose service fails is left out instead of showing wrong numbers.
 */
@Component({
  selector: 'gr-home',
  imports: [Navbar, Footer, HeroTrophy, Campeonato, SecCifras, SecInscripciones, SecEntradas, SecAtletas, SecPremios, SecOrganizacion, SecAfiliaciones,
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
      @if (h) {
        <!-- Sections in the order and visibility published from the backoffice («Web · home»). -->
        @for (k of h.orden; track k) {
          @switch (k) {
            @case ('cifras') { <gr-sec-cifras [s]="h.secciones[k]" /> }
            @case ('inscripciones') { <gr-sec-inscripciones [s]="h.secciones[k]" [comp]="c" [propia]="propia()" [inscritos]="inscritos()" /> }
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
  private readonly seo = inject(Seo);
  protected readonly introDone = signal(false);
  protected readonly cms = signal<HomeCms | null>(null);
  protected heroMeta = signal('');
  protected readonly propia = signal(false);
  protected readonly sorteo = signal<SorteoHome | null>(null);
  protected readonly entradas = signal<Entradas | null>(null);
  protected readonly horarios = signal<Horarios | null>(null);
  protected readonly inscritos = signal<number | null>(null);

  constructor() {
    // PendingTasks keeps the server render open until the data and the SEO tags are in place.
    const cmsApi = inject(Cms);
    const http = inject(HttpClient);
    const api = (p: string) => `/api/competiciones/${COMPETITION_SLUG}${p}`;
    const opt = <T,>(p: string) => firstValueFrom(http.get<T>(api(p))).catch(() => null);
    const modo = opt<{ modo: string }>('/inscripcion').then((r) => r?.modo === 'propia');
    void inject(PendingTasks).run(() => Promise.all([
      this.comp.load(), cmsApi.home(), modo, opt<SorteoHome>('/sorteo'), opt<Entradas>('/entradas'), opt<Horarios>('/horarios?resumen=true'),
      opt<{ resumen: { total: number } }>('/atletas?resumen=true'),
    ]).then(([c, h, propia, sorteo, entradas, horarios, atletas]) => {
      this.cms.set(h);
      this.propia.set(propia);
      this.sorteo.set(sorteo);
      this.entradas.set(entradas);
      this.horarios.set(horarios);
      this.inscritos.set(atletas?.resumen?.total ?? null);
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
