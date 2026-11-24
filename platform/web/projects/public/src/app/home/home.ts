import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, RESPONSE_INIT, afterNextRender, effect, inject, signal, untracked,
} from '@angular/core';
import { GrAlert, GrIcon, embedVideo, fmtLongDate } from '@grcup/ui';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { DirectoPublic } from '../core/directo';
import { Cms, type HomeCms } from '../core/cms';
import { COMPETITION_SLUG, Competition, FalloApi, esLimitado } from '../core/competition';
import type { Entradas } from '../core/entradas';
import type { Horarios } from '../core/horarios';
import { JuegosEnVivo } from '../core/juegos';
import { Seo } from '../core/seo';
import { I18n, LocPipe } from '../core/i18n';
import { Footer, Navbar } from '../layout/layout';
import { NoEncontrada } from '../layout/no-encontrada';
import { Campeonato, fechasHero } from './campeonato';
import { HeroTrophy } from './hero-trophy';
import {
  SecAfiliaciones, SecAlta, SecAtletas, SecCategorias, SecEntradas, SecFaq, SecHorarios, SecLocalizacion, SecOrganizacion,
} from './secciones';
import { SecPremios } from './premios';
import { SecFantasy, SecPorra, type ResumenFantasy, type ResumenPorra } from './juegos';
import { SecSorteo } from './sorteo';
import { SecCompeticiones } from './competiciones';

const T = {
  es: {
    retransmision: 'Retransmisión en directo', enDirecto: 'En directo', verDirecto: 'Ver el directo completo →',
    limitadoTitulo: 'Demasiadas visitas desde tu red', limitado: 'Hemos recibido muchas peticiones desde tu conexión. Espera un minuto y vuelve a cargar la página.',
    campeonato: 'Campeonato de powerlifting',
    seoTitulo: (nombre: string, ciudad: string) => `${nombre} · Campeonato de powerlifting en ${ciudad}`,
    seoTexto: (nombre: string, nivel: string, fecha: string, sede: string) => `${nombre}: campeonato de powerlifting ${nivel ? '(' + nivel + ') ' : ''}el ${fecha} en ${sede}. Entradas gratuitas, atletas, horarios y directo.`,
    noEncontradaTitulo: 'Página no encontrada · GRS Cup 2', noEncontradaTexto: 'La página que buscas no existe.',
    sobreTitulo: 'Sobre GRS Cup 2',
    sobreTexto: 'GRS Cup 2 es la web oficial del campeonato de powerlifting GRS Cup 2, organizado por GR Strength. Aquí puedes consultar la información del evento, inscribirte como atleta, reservar entradas gratuitas, participar en el sorteo y seguir la competición en directo, sin necesidad de registrarte.',
    sobreGoogle: 'El equipo organizador puede conectar su propia cuenta de Gmail (Google) para enviar desde ella los correos del campeonato (confirmaciones de entradas, inscripciones y avisos). Solo usamos el permiso de envío de correo y la dirección de email de esa cuenta; no leemos su bandeja de entrada ni compartimos esos datos con terceros.',
    sobrePrivacidad: 'Política de privacidad', sobreTerminos: 'Términos del servicio',
  },
  en: {
    retransmision: 'Live broadcast', enDirecto: 'Live', verDirecto: 'Watch the full live stream →',
    limitadoTitulo: 'Too many visits from your network', limitado: 'We have received a lot of requests from your connection. Wait a minute and reload the page.',
    campeonato: 'Powerlifting championship',
    seoTitulo: (nombre: string, ciudad: string) => `${nombre} · Powerlifting championship in ${ciudad}`,
    seoTexto: (nombre: string, nivel: string, fecha: string, sede: string) => `${nombre}: powerlifting championship ${nivel ? '(' + nivel + ') ' : ''}on ${fecha} at ${sede}. Free tickets, athletes, schedule and live stream.`,
    noEncontradaTitulo: 'Page not found · GRS Cup 2', noEncontradaTexto: 'The page you are looking for does not exist.',
    sobreTitulo: 'About GRS Cup 2',
    sobreTexto: 'GRS Cup 2 is the official website of the GRS Cup 2 powerlifting championship, organised by GR Strength. Here you can read the event information, register as an athlete, book free tickets, enter the raffle and follow the competition live, without creating an account.',
    sobreGoogle: 'The organising team can connect its own Gmail (Google) account to send the championship emails from it (ticket confirmations, registrations and notices). We only use the permission to send email and that account\'s email address; we never read its inbox or share that data with third parties.',
    sobrePrivacidad: 'Privacy policy', sobreTerminos: 'Terms of service',
  },
};

/**
 * «/ — Home» (Figma page 05, desktop · tablet · mobile). Data from the competition and the CMS («Web · home»: order,
 * visibility and texts of every section) plus the live numbers of tickets, raffle, schedule and athletes; all of it
 * rendered on the server. A section whose service fails is left out instead of showing wrong numbers.
 */
@Component({
  selector: 'gr-home',
  imports: [Navbar, Footer, GrAlert, GrIcon, RouterLink, LocPipe, HeroTrophy, Campeonato, SecAlta, SecEntradas, SecAtletas, SecPremios, SecOrganizacion, SecAfiliaciones,
    SecSorteo, SecPorra, SecFantasy, SecCategorias, SecHorarios, SecLocalizacion, SecFaq, SecCompeticiones],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = cms();
    @let c = comp.data();
    <gr-navbar [hidden]="!introDone()" />
    <main>
      <!-- BIZ-178: Google brand verification — above the fold (before the intro hero) the home must name the app, state its purpose and its use of Google data, without login -->
      <section id="sobre" class="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-4 md:px-8 xl:px-[120px]" [attr.aria-label]="t().sobreTitulo">
        <h1 class="text-xl font-semibold text-text-primary">GRS Cup 2</h1>
        <p class="text-sm font-semibold text-text-primary">{{ t().sobreTitulo }}</p>
        <p class="max-w-4xl text-sm text-text-secondary">{{ t().sobreTexto }}</p>
        <p class="max-w-4xl text-sm text-text-secondary">{{ t().sobreGoogle }}</p>
        <p class="flex gap-4 text-sm text-text-tertiary"><a class="underline" [routerLink]="'/privacidad' | loc">{{ t().sobrePrivacidad }}</a><a class="underline" [routerLink]="'/terminos' | loc">{{ t().sobreTerminos }}</a></p>
      </section>
      <gr-hero-trophy [titulo]="$any(h?.secciones?.['hero']?.['titulo']) || ''" [hero]="$any(h?.secciones?.['hero']) || {}" (done)="introDone.set($event)" />
      <gr-campeonato [comp]="c" [titulo]="$any(h?.secciones?.['campeonato']?.['titulo']) || t().campeonato"
        [subtitulo]="$any(h?.secciones?.['campeonato']?.['subtitulo']) || ''" [aviso]="$any(h?.secciones?.['campeonato']?.['aviso']) || ''" [fechas]="heroFechas()" [lugar]="heroLugar()"
        [patrocinadores]="h && h.orden.includes('patrocinadores') ? h.patrocinadores : []" [tituloPatrocinadores]="$any(h?.secciones?.['patrocinadores']?.['titulo']) || ''" />
      @if (enVivo(); as v) {
        <!-- Event day: the broadcast also on the home («Directo › Retransmisión», switch «también en la home») -->
        <section class="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-10 md:px-8 xl:px-[120px]" [attr.aria-label]="t().retransmision">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="inline-flex items-center gap-2 text-display-label text-success"><gr-icon name="radio" [size]="16" />{{ t().enDirecto }}</span>
            <a [routerLink]="'/en-directo' | loc" class="text-label-m text-accent-text hover:underline">{{ t().verDirecto }}</a>
          </div>
          <div class="relative aspect-video overflow-hidden rounded-lg border border-line-subtle bg-black">
            <iframe [src]="v" class="absolute inset-0 size-full border-0" [title]="t().retransmision" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
          </div>
        </section>
      }
      @if (cmsApi.limitado()) {
        <div class="mx-auto max-w-[1440px] px-5 py-10 md:px-8 xl:px-[120px]">
          <gr-alert tone="warning" [title]="t().limitadoTitulo">{{ t().limitado }}</gr-alert>
        </div>
      }
      @if (h) {
        <!-- Sections in the order and visibility published from the backoffice («Web · home»). -->
        @for (k of h.orden; track k) {
          @switch (k) {
            @case ('alta-atleta') { @defer (on immediate; hydrate on viewport) { <gr-sec-alta [s]="h.secciones[k]" /> } }
            @case ('inscripciones') { @if (!h.orden.includes('alta-atleta')) { @defer (on immediate; hydrate on viewport) { <gr-sec-alta [s]="h.secciones[k]" /> } } }
            @case ('entradas') { @if (c?.modulos?.['entradas']) { @defer (on immediate; hydrate on viewport) { <gr-sec-entradas [s]="h.secciones[k]" [comp]="c" [entradas]="entradas()" /> } } }
            @case ('atletas') { @defer (on immediate; hydrate on viewport) { <gr-sec-atletas [atletas]="h.secciones['atletas']" [dia]="h.orden.includes('dia') ? h.secciones['dia'] : undefined" /> } }
            @case ('dia') { @if (!h.orden.includes('atletas')) { @defer (on immediate; hydrate on viewport) { <gr-sec-atletas [dia]="h.secciones['dia']" /> } } }
            @case ('premios') {
              @defer (on immediate; hydrate on viewport) { <gr-sec-premios [s]="h.secciones[k]" /> }
              <!-- Figma 05-home-juegos: Porra and Fantasy right after «Premios v2» (hidden when the games service does not answer) -->
              @if (porra()) { @defer (on immediate; hydrate on viewport) { <gr-sec-porra [resumen]="porra()" /> } }
              @if (fantasy()) { @defer (on immediate; hydrate on viewport) { <gr-sec-fantasy [resumen]="fantasy()" /> } }
            }
            @case ('organizacion') {
              @if (!h.orden.includes('premios')) {
                @if (porra()) { @defer (on immediate; hydrate on viewport) { <gr-sec-porra [resumen]="porra()" /> } }
                @if (fantasy()) { @defer (on immediate; hydrate on viewport) { <gr-sec-fantasy [resumen]="fantasy()" /> } }
              }
              @defer (on immediate; hydrate on viewport) { <gr-sec-organizacion [s]="h.secciones[k]" /> }
            }
            @case ('afiliaciones') { @defer (on immediate; hydrate on viewport) { <gr-sec-afiliaciones [s]="h.secciones[k]" /> } }
            @case ('sorteo') { @if (c?.modulos?.['sorteo']) { @defer (on immediate; hydrate on viewport) { <gr-sec-sorteo [s]="h.secciones[k]" /> } } }
            @case ('categorias') { @if (!h.orden.includes('premios')) { @defer (on immediate; hydrate on viewport) { <gr-sec-categorias [s]="h.secciones[k]" /> } } }
            @case ('horarios') { @if (horarios()?.publicado) { @defer (on immediate; hydrate on viewport) { <gr-sec-horarios [s]="h.secciones[k]" [horarios]="horarios()" /> } } }
            @case ('localizacion') { @defer (on immediate; hydrate on viewport) { <gr-sec-localizacion [s]="h.secciones[k]" [comp]="c" /> } }
            @case ('competiciones') { @defer (on immediate; hydrate on viewport) { <gr-sec-competiciones [s]="h.secciones[k]" /> } }
            @case ('faq') { @if (h.faqDestacadas.length) { @defer (on immediate; hydrate on viewport) { <gr-sec-faq [s]="h.secciones[k]" [items]="h.faqDestacadas" [contacto]="c?.evento?.emailContacto || ''" /> } } }
          }
        }
        <!-- BIZ-164: shown even without a CMS row (then at the end, button disabled until «reservaUrl» is set) -->
        @if (!h.orden.includes('competiciones')) { @defer (on immediate; hydrate on viewport) { <gr-sec-competiciones /> } }
      }
    </main>
    @defer (on immediate; hydrate on viewport) { <gr-footer /> }
  `,
})
export class HomePage {
  protected readonly comp = inject(Competition);
  protected readonly cmsApi = inject(Cms);
  private readonly seo = inject(Seo);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly introDone = signal(false);
  protected readonly cms = signal<HomeCms | null>(null);
  protected readonly heroFechas = signal('');
  protected readonly heroLugar = signal('');
  protected readonly entradas = signal<Entradas | null>(null);
  protected readonly horarios = signal<Horarios | null>(null);
  protected readonly porra = signal<ResumenPorra | null>(null);
  protected readonly fantasy = signal<ResumenFantasy | null>(null);
  /** Player of the live broadcast when the organiser shows it on the home too (browser only, while live). */
  protected readonly enVivo = signal<SafeResourceUrl | null>(null);
  private readonly http = inject(HttpClient);
  private readonly fallo = inject(FalloApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  /** Calls waiting for their Retry-After: the «too many visits» notice stays until all of them succeed. */
  private pendientes = 0;

  constructor() {
    // PendingTasks keeps the server render open until the data and the SEO tags are in place.
    const opt = <T,>(p: string, set: (v: T) => void) => firstValueFrom(this.http.get<T>(this.api(p))).catch((e: unknown) => {
      this.reintentar(e, p, set, 0);
      return null;
    });
    void inject(PendingTasks).run(() => Promise.all([
      this.comp.load(), this.cmsApi.home(), opt<Entradas>('/entradas', (v) => this.entradas.set(v)),
      opt<Horarios>('/horarios?resumen=true', (v) => this.horarios.set(v)),
      opt<ResumenPorra>('/juegos/porra/resumen', (v) => this.porra.set(v)), opt<ResumenFantasy>('/juegos/fantasy/resumen', (v) => this.fantasy.set(v)),
    ]).then(([c, h, entradas, horarios, porra, fantasy]) => {
      this.porra.set(porra);
      this.fantasy.set(fantasy);
      this.heroFechas.set(fechasHero(c?.fechaInicio, c?.fechaFin, this.i18n.lang()));
      this.heroLugar.set(c?.sede ? [c.sede.ciudad && (c.sede.provincia ? `${c.sede.ciudad} (${c.sede.provincia})` : c.sede.ciudad), c.sede.nombre].filter(Boolean).join(' · ') : '');
      this.cms.set(h);
      this.entradas.set(entradas);
      this.horarios.set(horarios);
      const nombre = c?.nombre ?? 'GRS Cup 2';
      this.seo.set({
        title: this.t().seoTitulo('GRS Cup 2', c?.sede?.ciudad || 'Almussafes'),
        description: this.t().seoTexto(nombre, c?.evento?.nivel ?? '', c?.fechaInicio ? this.fechaLarga(c.fechaInicio) : '', c?.sede?.nombre ?? 'Almussafes'),
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

    // «Top 3 · en vivo» and the odds (Figma 05-home-juegos): the public SSE of the competition announces bets,
    // markets, clauses and rankings; the two summaries are fetched again (throttled to one refresh per second while
    // events keep coming, plus a trailing one after the 10 s server cache so the last change is never missed).
    const vivo = inject(JuegosEnVivo);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => this.timers.forEach(clearTimeout));
    const directo = inject(DirectoPublic);
    const san = inject(DomSanitizer);
    afterNextRender(() => {
      void directo.directo().then((d) => {
        const u = d?.streamHome ? embedVideo(d.streamUrl, location.hostname, true) : null;
        if (u) this.enVivo.set(san.bypassSecurityTrustResourceUrl(u));
      });
      vivo.conectar();
      destroy.onDestroy(() => vivo.desconectar());
    });
    let primera = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let final: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      vivo.version();
      if (primera || !this.browser) {
        primera = false;
        return;
      }
      untracked(() => {
        if (!espera) {
          espera = setTimeout(() => {
            espera = undefined;
            this.refrescarJuegos();
          }, 1000);
          this.timers.push(espera);
        }
        clearTimeout(final);
        final = setTimeout(() => this.refrescarJuegos(), 11500);
        this.timers.push(final);
      });
    });
  }

  /** «19 de diciembre de 2026» / «19 December 2026». */
  private fechaLarga(iso: string): string {
    return this.i18n.lang() === 'es' ? fmtLongDate(iso)
      : new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso));
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
    if (intento === 0) this.pendientes++;
    const seg = Math.min(120, Math.max(1, Number((e as { headers?: HttpHeaders }).headers?.get('Retry-After')) || 20));
    this.timers.push(setTimeout(() => this.http.get<T>(this.api(p)).subscribe({
      next: (v) => {
        set(v);
        if (--this.pendientes === 0) this.fallo.limitado.set(false);
      },
      error: (e2: unknown) => {
        if (esLimitado(e2) && intento + 1 < 3) this.reintentar(e2, p, set, intento + 1);
        else this.pendientes--; // gave up: the notice stays (the page still lacks data)
      },
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
    const t = inject(I18n).dict(T)();
    inject(Seo).set({ title: t.noEncontradaTitulo, description: t.noEncontradaTexto, path: '/404', robots: 'noindex' });
  }
}
