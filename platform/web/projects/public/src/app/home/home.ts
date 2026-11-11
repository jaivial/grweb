import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, RESPONSE_INIT, afterNextRender, effect, inject, signal, untracked,
} from '@angular/core';
import { GrAlert, fmtLongDate } from '@grcup/ui';
import { Cms, type HomeCms } from '../core/cms';
import { COMPETITION_SLUG, Competition, FalloApi, esLimitado } from '../core/competition';
import type { Entradas } from '../core/entradas';
import type { Horarios } from '../core/horarios';
import { JuegosEnVivo } from '../core/juegos';
import { HOME_ALTERNATES, Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { NoEncontrada } from '../layout/no-encontrada';
import { Campeonato, fechaCorta, fechasHero } from './campeonato';
import { HeroTrophy } from './hero-trophy';
import {
  SecAfiliaciones, SecAlta, SecAtletas, SecCategorias, SecCifras, SecEntradas, SecFaq, SecHorarios, SecLocalizacion, SecOrganizacion,
} from './secciones';
import { SecPremios } from './premios';
import { SecFantasy, SecPorra, type ResumenFantasy, type ResumenPorra } from './juegos';
import { SecSorteo, type SorteoHome } from './sorteo';

/**
 * «/ — Home» (Figma page 05, desktop · tablet · mobile). Data from the competition and the CMS («Web · home»: order,
 * visibility and texts of every section) plus the live numbers of tickets, raffle, schedule and athletes; all of it
 * rendered on the server. A section whose service fails is left out instead of showing wrong numbers.
 */
@Component({
  selector: 'gr-home',
  imports: [Navbar, Footer, GrAlert, HeroTrophy, Campeonato, SecCifras, SecAlta, SecEntradas, SecAtletas, SecPremios, SecOrganizacion, SecAfiliaciones,
    SecSorteo, SecPorra, SecFantasy, SecCategorias, SecHorarios, SecLocalizacion, SecFaq],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = cms();
    @let c = comp.data();
    <gr-navbar [hidden]="!introDone()" />
    <main>
      <gr-hero-trophy [meta]="heroMeta()" [fechas]="heroFechas()" [lugar]="heroLugar()" [patrocinadores]="heroPatro()" [titulo]="$any(h?.secciones?.['hero']?.['titulo']) || ''" (done)="introDone.set($event)" />
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
            @case ('premios') {
              <gr-sec-premios [s]="h.secciones[k]" />
              <!-- Figma 05-home-juegos: Porra and Fantasy right after «Premios v2» (hidden when the games service does not answer) -->
              @if (porra()) { <gr-sec-porra [resumen]="porra()" /> }
              @if (fantasy()) { <gr-sec-fantasy [resumen]="fantasy()" /> }
            }
            @case ('organizacion') {
              @if (!h.orden.includes('premios')) {
                @if (porra()) { <gr-sec-porra [resumen]="porra()" /> }
                @if (fantasy()) { <gr-sec-fantasy [resumen]="fantasy()" /> }
              }
              <gr-sec-organizacion [s]="h.secciones[k]" />
            }
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
  protected readonly heroFechas = signal('');
  protected readonly heroLugar = signal('');
  protected readonly heroPatro = signal<{ nombre: string; logoUrl: string; url: string }[]>([]);
  protected readonly sorteo = signal<SorteoHome | null>(null);
  protected readonly entradas = signal<Entradas | null>(null);
  protected readonly horarios = signal<Horarios | null>(null);
  protected readonly porra = signal<ResumenPorra | null>(null);
  protected readonly fantasy = signal<ResumenFantasy | null>(null);
  private readonly http = inject(HttpClient);
  private readonly fallo = inject(FalloApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    // PendingTasks keeps the server render open until the data and the SEO tags are in place.
    const opt = <T,>(p: string, set: (v: T) => void) => firstValueFrom(this.http.get<T>(this.api(p))).catch((e: unknown) => {
      this.reintentar(e, p, set, 0);
      return null;
    });
    void inject(PendingTasks).run(() => Promise.all([
      this.comp.load(), this.cmsApi.home(), opt<SorteoHome>('/sorteo', (v) => this.sorteo.set(v)), opt<Entradas>('/entradas', (v) => this.entradas.set(v)),
      opt<Horarios>('/horarios?resumen=true', (v) => this.horarios.set(v)),
      opt<ResumenPorra>('/juegos/porra/resumen', (v) => this.porra.set(v)), opt<ResumenFantasy>('/juegos/fantasy/resumen', (v) => this.fantasy.set(v)),
      opt<{ nombre: string; logoUrl: string; url: string }[]>('/patrocinadores?hero=true', (v) => this.heroPatro.set(v.filter((p) => p.logoUrl))),
    ]).then(([c, h, sorteo, entradas, horarios, porra, fantasy, patro]) => {
      this.porra.set(porra);
      this.fantasy.set(fantasy);
      this.heroPatro.set((patro ?? []).filter((p) => p.logoUrl));
      this.heroFechas.set(fechasHero(c?.fechaInicio, c?.fechaFin));
      this.heroLugar.set(c?.sede ? [c.sede.ciudad && (c.sede.provincia ? `${c.sede.ciudad} (${c.sede.provincia})` : c.sede.ciudad), c.sede.nombre].filter(Boolean).join(' · ') : '');
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

    // «Top 3 · en vivo» and the odds (Figma 05-home-juegos): the public SSE of the competition announces bets,
    // markets, clauses and rankings; the two summaries are fetched again (debounced, and once more after the 10 s
    // server cache so the last change is never missed).
    const vivo = inject(JuegosEnVivo);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => this.timers.forEach(clearTimeout));
    afterNextRender(() => {
      vivo.conectar();
      destroy.onDestroy(() => vivo.desconectar());
    });
    let primera = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let segunda: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      vivo.version();
      if (primera || !this.browser) {
        primera = false;
        return;
      }
      untracked(() => {
        clearTimeout(espera);
        clearTimeout(segunda);
        espera = setTimeout(() => this.refrescarJuegos(), 1000);
        segunda = setTimeout(() => this.refrescarJuegos(), 11500);
        this.timers.push(espera, segunda);
      });
    });
  }

  private api(p: string): string {
    return `/api/competiciones/${COMPETITION_SLUG}${p}`;
  }

  /** The live summaries again, skipping the browser's 10 s HTTP cache (the server keeps its own). */
  private refrescarJuegos(): void {
    const headers = new HttpHeaders({ 'Cache-Control': 'no-cache' });
    this.http.get<ResumenPorra>(this.api('/juegos/porra/resumen'), { headers }).subscribe({ next: (v) => this.porra.set(v), error: () => undefined });
    this.http.get<ResumenFantasy>(this.api('/juegos/fantasy/resumen'), { headers }).subscribe({ next: (v) => this.fantasy.set(v), error: () => undefined });
  }

  /**
   * A 429 of the gateway (the visitor's network over its quota) in the browser: show the «too many visits» notice
   * and try again after its Retry-After (at most three times); the notice goes away when the retry succeeds.
   */
  private reintentar<T>(e: unknown, p: string, set: (v: T) => void, intento: number): void {
    if (!this.browser || !esLimitado(e) || intento >= 3) return;
    this.fallo.limitado.set(true);
    const seg = Math.min(120, Math.max(1, Number((e as { headers?: HttpHeaders }).headers?.get('Retry-After')) || 20));
    this.timers.push(setTimeout(() => this.http.get<T>(this.api(p)).subscribe({
      next: (v) => {
        set(v);
        this.fallo.limitado.set(false);
      },
      error: (e2: unknown) => this.reintentar(e2, p, set, intento + 1),
    }), seg * 1000));
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
