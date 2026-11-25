import { isPlatformBrowser } from '@angular/common';
import { VideoConsentido } from '../layout/cookies';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrButton, GrIcon, GrLogo, GrSkeleton, GrSelect, type GrLiveEstado, cdn, CdnPipe } from '@grcup/ui';
import { Cms, type Album, type Patrocinador } from '../core/cms';
import { COMPETITION_SLUG, FalloApi, type CompeticionPublica } from '../core/competition';
import { DirectoPublic, MOV, MOV_EN, ORD, ORD_EN, catCorta, catLarga, embed, gl, kg, type Categoria, type Directo, type Edicion, type EnPlataforma, type Fila, type Pantalla, type ResultadosPublicos } from '../core/directo';
import { ICS_URL } from '../core/horarios';
import { DivisionPipe, I18n, LocPipe, divisionEn } from '../core/i18n';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Lightbox } from '../layout/lightbox';
import { Footer, Navbar } from '../layout/layout';
import { NoEncontrada } from '../layout/no-encontrada';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { PanelSocial, escritorio } from './directo-social/panel';
import { Clasificacion, TarimaView } from './directo-social/tarima-view';
import { ChatService } from '../core/chat';

const TZ = 'Europe/Madrid';
const PABELLON = 'https://jaimedigitalstudio.b-cdn.net/grcup/pabellon/pabellonentrada.webp';
const FOTO_2025 = 'https://jaimedigitalstudio.b-cdn.net/grcup/images/club/alfonso-fernandez/img-3364.webp';
const CARTEL_2025 = cdn('/img/cartel-2025.jpg');
/** The eight photos of Figma 28 (2025 edition), in the design's order. */
const FOTOS_2025: [string, string][] = [
  ['foto-1', 'Atleta delante de la barra antes de su peso muerto, con 275 kg en el marcador'],
  ['foto-2', 'Atleta concentrada con cascos antes de su intento'],
  ['foto-3', 'Sentadilla en la plataforma, con los cargadores a los lados'],
  ['foto-4', 'Atleta en el press de banca bajo el cartel de la competición'],
  ['foto-5', 'Peso muerto bloqueado bajo los focos del escenario'],
  ['foto-6', 'Cinturón y muñequeras colgados de una barra en la zona de calentamiento'],
  ['foto-7', 'Un compañero ajusta el cinturón de un atleta antes de salir'],
  ['foto-8', 'Atleta concentrado antes de salir a la plataforma'],
];
const diaHora = (iso: string, l = 'es-ES') => new Intl.DateTimeFormat(l, { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)).replace(',', ' ·');
const fechas = (a?: string, b?: string, l = 'es-ES') => {
  if (!a) return l === 'es-ES' ? 'Fecha por confirmar' : T.en.fechaPc;
  const d = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(l, { ...o, timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
  return b && b !== a ? `${d(a, { day: 'numeric' })}–${d(b, { day: 'numeric', month: 'long', year: 'numeric' })}` : d(a, { day: 'numeric', month: 'long', year: 'numeric' });
};
/** Figma 25/28 short form: «1–2 marzo 2025». */
const fechasCortas = (a?: string, b?: string, l = 'es-ES') => fechas(a, b, l).replace(/ de /g, ' ');
const T = {
  es: {
    mov: MOV, ord: ORD, intento: 'intento', seccion: 'El evento', enDirecto: 'en directo', crumb: 'En directo', h1: 'GRS Cup 2 en directo',
    falloT: 'No hemos podido cargar el directo', falloD: 'Vuelve a intentarlo en unos segundos.', pausaT: 'Pausa técnica', pausaD: 'Volvemos enseguida.', retraso: (n: number) => 'Vamos con ' + n + ' min de retraso.',
    retransmision: 'Retransmisión', iframe: 'Retransmisión de la GRS Cup 2', empiezaEn: 'La retransmisión empieza en', empezara: 'La retransmisión empezará con el primer bloque', recordar: 'Recordármelo',
    verRep: 'Ver la repetición', repCompleta: 'Repetición completa', repBreve: 'La repetición estará disponible en breve', breve: 'El vídeo empieza en breve · sigue los intentos aquí', vivo: 'En directo',
    faltan: 'Faltan ', primerBloque: 'Primer bloque', verHorarios: 'Ver horarios', horarios2: 'Los horarios se publican unas 2 semanas antes', terminadaT: 'La competición ha terminado',
    terminadaD: 'Ya puedes consultar los resultados oficiales.', verResultados: 'Ver resultados →', celebrada: 'Celebrada', ed2025: '1–2 marzo 2025 · Llíria (Valencia) · AEP-2 Regional', verEdicion: 'Ver la edición →',
    mientrasT: 'Mientras tanto', cuenta: ['días', 'horas', 'min', 'seg'], fechaPc: 'Fecha por confirmar',
    mientras: [{ titulo: 'Participantes', texto: 'Busca tu bloque', ruta: '/participantes' }, { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' }, { titulo: 'Reglamento', texto: 'Cómo se juzga un intento', ruta: '/reglamento' }] as RelatedLink[],
    seoT: 'En directo · GRS Cup 2', seoVivo: 'Sigue en directo la GRS Cup 2: chat, quién está en la tarima, los siguientes y la clasificación provisional.',
    seoOtro: 'Retransmisión y resultados en directo de la GRS Cup 2: quién compite, los siguientes atletas y la clasificación al momento.',
  },
  en: {
    mov: MOV_EN, ord: ORD_EN, intento: 'attempt', seccion: 'The event', enDirecto: 'live', crumb: 'Live', h1: 'GRS Cup 2 live',
    falloT: 'We couldn’t load the live feed', falloD: 'Please try again in a few seconds.', pausaT: 'Technical break', pausaD: 'We’ll be right back.', retraso: (n: number) => 'We’re running ' + n + ' min late.',
    retransmision: 'Broadcast', iframe: 'GRS Cup 2 broadcast', empiezaEn: 'The broadcast starts in', empezara: 'The broadcast will start with the first block', recordar: 'Remind me',
    verRep: 'Watch the replay', repCompleta: 'Full replay', repBreve: 'The replay will be available shortly', breve: 'The video starts shortly · follow the attempts here', vivo: 'Live',
    faltan: '', primerBloque: 'First block', verHorarios: 'See schedule', horarios2: 'The schedule is published about 2 weeks before', terminadaT: 'The competition is over',
    terminadaD: 'You can now check the official results.', verResultados: 'See results →', celebrada: 'Held', ed2025: '1–2 March 2025 · Llíria (Valencia) · AEP-2 Regional', verEdicion: 'See the edition →',
    mientrasT: 'In the meantime', cuenta: ['days', 'hours', 'min', 'sec'], fechaPc: 'Date to be confirmed',
    mientras: [{ titulo: 'Participants', texto: 'Find your block', ruta: '/participantes' }, { titulo: 'Schedule', texto: 'Blocks by class', ruta: '/horarios' }, { titulo: 'Rules', texto: 'How an attempt is judged', ruta: '/reglamento' }] as RelatedLink[],
    seoT: 'Live · GRS Cup 2', seoVivo: 'Follow GRS Cup 2 live: chat, who’s on the platform, who’s next and the provisional standings.',
    seoOtro: 'Live broadcast and results from GRS Cup 2: who’s competing, the next athletes and the standings as they happen.',
  },
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();


/** Public SSE of the competition: reloads on the live events (no personal data travels in them); `estado` gets the connection state. */
function escuchar(tipos: string[], recargar: () => void, estado?: (e: GrLiveEstado) => void, chatEstado?: () => void): () => void {
  const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
  if (estado) {
    es.onopen = () => estado('en-directo');
    es.onerror = () => estado(es.readyState === EventSource.CLOSED ? 'sin-conexion' : 'reconectando');
  }
  let t: ReturnType<typeof setTimeout> | undefined;
  const fn = () => {
    clearTimeout(t);
    t = setTimeout(recargar, 300);
  };
  for (const ev of tipos) es.addEventListener(ev, fn);
  // chat switched on/off by the organisation: the event carries `{ chat_enabled }`; re-read the room state
  if (chatEstado) es.addEventListener('chat.estado', chatEstado);
  return () => {
    clearTimeout(t);
    es.close();
  };
}
const EVENTOS = ['directo.estado', 'directo.intento', 'directo.veredicto', 'directo.correccion', 'resultados.publicados', 'resultados.retirados', 'reconectar'];

// ============================================================ /en-directo ===

/** /en-directo (Figma page 27): before the event (countdown, first block), live (stream, athlete on the platform, next ones,
 *  provisional ranking) and finished (replay, results, previous edition). */
@Component({
  selector: 'gr-en-directo',
  imports: [RouterLink, LocPipe, Page, GrAlert, GrIcon, GrSkeleton, Related, Community, PanelSocial, TarimaView, VideoConsentido],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRS Cup 2" [accent]="t().enDirecto" [section]="t().seccion" [crumb]="t().crumb" [cabecera]="false">
      <!-- Figma 171:65287: no visible title (the video goes first); the H1 stays for SEO and screen readers -->
      <h1 class="sr-only">{{ t().h1 }}</h1>
      @let d = dir();
      @if (d === undefined) { <gr-skeleton class="-mx-5 mt-1.5 block h-[218px] md:mx-0 md:mt-0 md:h-[480px] md:rounded-lg" /> }
      @else if (d === null) { @if (!fallo.limitado()) { <gr-alert tone="warning" [title]="t().falloT">{{ t().falloD }}</gr-alert> } }
      @else {
        @if (d.pausa && d.fase === 'en_directo') { <gr-alert class="mb-5" tone="warning" [title]="t().pausaT">{{ t().pausaD }}@if (d.retrasoMin) { {{ t().retraso(d.retrasoMin) }} }</gr-alert> }
        <div class="grid md:gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr]">
          <!-- Video -->
          <!-- Figma 27 mobile: the video full width right under the navbar, then the title -->
          <section class="relative -mx-5 mt-1.5 h-[218px] overflow-hidden md:h-auto md:aspect-video border-y border-line-subtle bg-black md:mx-0 md:mt-0 md:rounded-xl md:border lg:col-start-1 lg:row-start-1" [attr.aria-label]="t().retransmision">
            @if (video(); as v) {
              <gr-video-consentido [src]="v" [titulo]="t().iframe" />
            } @else {
              <!-- Figma «Video»: the full venue as the poster (bright while live, dimmed before and after) -->
              <img [src]="poster" [attr.srcset]="poster + ' 640w, ' + posterL + ' 1300w'" sizes="(min-width: 1024px) 800px, 100vw" alt="Tarima de la GRS Cup 2" class="absolute inset-0 size-full object-cover" [class.opacity-50]="d.fase !== 'en_directo'" />
              <div class="absolute inset-0" [class]="d.fase === 'en_directo' ? 'bg-[linear-gradient(180deg,transparent_55%,rgb(20_16_18/0.75))]' : 'bg-[linear-gradient(180deg,rgb(20_16_18/0.2),rgb(20_16_18/0.85))]'"></div>
              @if (d.fase === 'antes') {
                <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <p class="text-mono-xs text-text-secondary">{{ futuro() ? t().empiezaEn : t().empezara }}</p>
                  @if (futuro()) { <p class="font-display text-[34px] leading-none uppercase italic md:text-[56px]">{{ cuentaTexto() }}</p> }
                  <a [href]="ics" class="mt-2 inline-flex h-10 items-center gap-2 rounded-pill border border-line-strong bg-bg-base/60 px-4 text-label-s hover:border-white">{{ t().recordar }} <gr-icon name="arrow-right" [size]="14" /></a>
                </div>
              } @else if (d.fase === 'finalizado') {
                @if (d.replayUrl) { <a [href]="d.replayUrl" target="_blank" rel="noopener" class="absolute inset-0 flex items-center justify-center" [attr.aria-label]="t().verRep"><span class="flex size-16 items-center justify-center rounded-pill bg-accent shadow-glow"><gr-icon name="play" [size]="28" /></span></a> }
                <p class="absolute bottom-4 left-4 text-label-s">{{ d.replayUrl ? t().repCompleta : t().repBreve }}</p>
              } @else {
                <p class="absolute top-3 right-3 left-36 hidden text-right text-body-xs text-text-secondary [text-shadow:0_1px_8px_rgb(0_0_0/0.9)] md:block">{{ t().breve }}</p>
              }
            }
            <!-- over the poster only: on top of the player they would hide YouTube's controls (volume, since it starts muted) -->
            @if (d.fase === 'en_directo' && !video()) {
              <span class="absolute top-3 left-3 inline-flex h-6 items-center gap-1.5 rounded-full bg-accent px-2.5 text-label-xs text-white uppercase"><gr-icon name="radio" [size]="12" />{{ t().vivo }}</span>
              @if (d.espectadores) { <span class="absolute top-3 right-3 inline-flex h-6 items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-label-xs"><gr-icon name="eye" [size]="12" />{{ d.espectadores.toLocaleString(i18n.locale()) }}</span> }
              @if (d.actual; as a) {
                <div class="absolute bottom-3 left-3 flex items-end gap-3 rounded-md bg-black/70 px-3 py-2">
                  <div><p class="text-label-s">{{ a.nombre }} · {{ a.categoria.replace('-', '−') }} kg</p><p class="text-body-xs text-text-tertiary">{{ t().mov[a.movimiento] }} · {{ t().ord[a.numero] }} {{ t().intento }}</p></div>
                  <p class="font-display text-[22px] leading-none text-accent-text italic">{{ kg(a.peso) }} KG</p>
                </div>
              }
            }
          </section>

          <!-- Panel social (Figma 171:65287): tabs Chat · Donantes · Porra · Tarima right under the player, full width on
               mobile; on desktop, the right column -->
          <gr-panel-social class="-mx-5 min-w-0 md:mx-0 lg:col-start-2 lg:row-start-1 lg:row-span-2" [directo]="d" [conexion]="conexion()" />

          <div class="flex min-w-0 flex-col max-md:mt-6 lg:col-start-1 lg:row-start-2">
            <!-- desktop: the «Tarima» content stays under the player (the panel column is too narrow for it) -->
            @if (d.fase === 'en_directo' && escritorio()) { <gr-tarima-view [directo]="d" [conexion]="conexion()" /> }
            <!-- Contenido de la fase (Figma 27): en escritorio, bajo el player -->
            <aside class="flex flex-col gap-4">
              @switch (d.fase) {
                @case ('antes') {
                  @if (futuro()) {
                    <div class="grid grid-cols-4 gap-2" role="timer" [attr.aria-label]="t().faltan + cuentaTexto()">
                      @for (p of cuenta(); track p.l) { <div class="flex h-[76px] flex-col items-center justify-center rounded-md border border-line-subtle bg-bg-card"><span class="text-display-s tabular-nums">{{ p.v }}</span><span class="text-mono-xs text-text-tertiary">{{ p.l }}</span></div> }
                    </div>
                  }
                  @if (d.proximo; as p) {
                    <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                      <p class="text-mono-xs text-text-tertiary">{{ t().primerBloque }}</p>
                      <p class="mt-2 text-label-m first-letter:uppercase">{{ diaHora(p.inicio) }} · {{ p.titulo }}</p>
                      <a [routerLink]="'/horarios' | loc" class="mt-3 inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-s hover:border-white">{{ t().verHorarios }} <gr-icon name="arrow-right" [size]="14" /></a>
                    </section>
                  } @else {
                    <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ t().horarios2 }}</p><a [routerLink]="'/horarios' | loc" class="mt-3 inline-flex text-label-s text-accent-text">{{ t().verHorarios }} →</a></section>
                  }
                  <a [href]="ics" class="flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-label-m text-white shadow-glow hover:bg-accent-hover"><gr-icon name="calendar-plus" [size]="18" />{{ t().recordar }}</a>
                }
                @case ('finalizado') {
                  <gr-alert tone="success" [title]="t().terminadaT">{{ t().terminadaD }}
                    <a [routerLink]="'/resultados/' + anio() | loc" class="mt-2 block text-label-s text-accent-text hover:underline">{{ t().verResultados }}</a></gr-alert>
                  <a [routerLink]="'/ediciones/2025' | loc" class="group overflow-hidden rounded-lg border border-line-subtle bg-bg-card transition-colors hover:border-line-strong">
                    <div class="relative h-40"><img [src]="foto2025" alt="Edición 2025 de la GRS Cup" class="size-full object-cover object-top" /><p class="absolute bottom-3 left-4 font-display text-[44px] leading-none italic">2025</p></div>
                    <div class="p-4"><span class="rounded-2xs border border-line-strong px-1.5 py-0.5 text-mono-xs text-text-tertiary">{{ t().celebrada }}</span>
                      <p class="mt-2 font-display text-[22px] uppercase italic">GRS Cup 2025</p>
                      <p class="mt-1 text-body-xs text-text-tertiary">{{ t().ed2025 }}</p>
                      <span class="mt-3 inline-flex text-label-s group-hover:text-accent-text">{{ t().verEdicion }}</span></div>
                  </a>
                }
              }
            </aside>
          @if (d.fase !== 'en_directo') {
            <gr-related class="mt-14 block" [titulo]="t().mientrasT" [items]="t().mientras" />
          }
          </div>
        </div>
        <gr-community class="mt-14 block" />
      }
    </gr-page>
  `,
})
export class EnDirectoPage {
  private readonly api = inject(DirectoPublic);
  protected readonly fallo = inject(FalloApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly dir = signal<Directo | null | undefined>(undefined);
  private readonly ahora = signal(Date.now());
  protected readonly escritorio = escritorio();
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly kg = (v?: number | null) => kg(v, this.i18n.lang());
  protected readonly catLarga = catLarga;
  protected readonly diaHora = (iso: string) => diaHora(iso, this.i18n.locale());
  protected readonly ics = ICS_URL;
  protected readonly pabellon = PABELLON;
  protected readonly poster = cdn('/img/home/org-publico-s.webp');
  protected readonly posterL = cdn('/img/home/org-publico-l.webp');
  protected readonly conexion = signal<GrLiveEstado>('en-directo');
  protected readonly foto2025 = FOTO_2025;
  private readonly san = inject(DomSanitizer);

  protected readonly video = computed(() => {
    const d = this.dir();
    if (!d || !this.browser) return null;
    // Figma 27/70: the live player only while live; after it, the replay if there is one; before it (and after
    // without a replay) the poster with its state.
    const url = d.fase === 'en_directo' ? d.streamUrl : d.fase === 'finalizado' ? d.replayUrl : '';
    const u = url ? embed(url, location.hostname, d.fase === 'en_directo') : null;
    return u ? this.san.bypassSecurityTrustResourceUrl(u) : null;
  });
  private readonly ms = computed(() => {
    const p = this.dir()?.proximo;
    return p ? new Date(p.inicio).getTime() - this.ahora() : 0;
  });
  protected readonly futuro = computed(() => this.ms() > 0);
  protected readonly cuenta = computed(() => {
    const s = Math.max(0, Math.floor(this.ms() / 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    return [{ v: pad(Math.floor(s / 86400)), l: this.t().cuenta[0] }, { v: pad(Math.floor((s % 86400) / 3600)), l: this.t().cuenta[1] }, { v: pad(Math.floor((s % 3600) / 60)), l: this.t().cuenta[2] }, { v: pad(s % 60), l: this.t().cuenta[3] }];
  });
  protected readonly cuentaTexto = computed(() => {
    const [d, h, m] = this.cuenta();
    return `${Number(d.v)} d ${h.v} h ${m.v} min`;
  });
  protected readonly anio = computed(() => (this.dir()?.proximo?.inicio ?? new Date().toISOString()).slice(0, 4));

  constructor() {
    // the chat panel follows the phase of the live (header, chip and composer)
    const chat = inject(ChatService);
    effect(() => {
      const f = this.dir()?.fase;
      if (f) chat.fase.set(f);
    });
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      this.dir.set(await this.api.directo());
      const d = this.dir();
      await applySeo(cms, seo, '/en-directo', this.t().seoT,
        d?.fase === 'en_directo' ? this.t().seoVivo
          : this.t().seoOtro);
    });
    if (this.browser) {
      const tick = setInterval(() => this.ahora.set(Date.now()), 1000);
      const recargar = async () => {
        const d = await this.api.directo();
        if (d) this.dir.set(d);
      };
      const cerrar = escuchar(EVENTOS, () => void recargar(), (e) => this.conexion.set(e), () => void chat.cargarEstadoSala());
      const poll = setInterval(() => void recargar(), 30_000);
      inject(DestroyRef).onDestroy(() => {
        clearInterval(tick);
        clearInterval(poll);
        cerrar();
      });
    }
  }
}

// ============================================================ /resultados ===

interface EdicionCard { e: Edicion; c: CompeticionPublica | null; publicado: boolean }

const TR = {
  es: {
    titulo: 'Resultados de la', crumb: 'Resultados', eyebrow: 'Clasificaciones', sub: 'Clasificaciones completas por categoría, podios y mejores levantadores de cada edición.',
    edEyebrow: 'Ediciones', edTitulo: 'Todas las *ediciones*', celebrada: 'Celebrada', proxima: 'Próxima edición', fechaPc: 'Fecha por confirmar', verResultados: 'Ver resultados', masInfo: 'Más información',
    comoEyebrow: 'Cómo se clasifica', comoTitulo: 'Total y *puntos GL*',
    como: [{ t: 'Por categoría', d: 'Gana el mayor total (sentadilla + banca + peso muerto). En caso de empate, gana quien pesó menos.' }, { t: 'Mejor levantador', d: 'Se compara a atletas de distinto peso con los puntos GL de la IPF.' }, { t: 'Clasificación oficial', d: 'El acta oficial la publica la AEP en PDF tras la competición.' }],
    rel: [{ titulo: 'Edición 2025', texto: 'Llíria · 1–2 marzo 2025', ruta: '/ediciones/2025' }, { titulo: 'Galería', texto: 'Fotos de la competición', ruta: '/galeria' }, { titulo: 'Marcas mínimas', texto: 'Totales AEP-1 por categoría', ruta: '/marcas-minimas' }] as RelatedLink[],
    seoT: 'Resultados · GR Strength Cup', seoD: 'Clasificaciones por categoría, podios y mejores levantadores (puntos GL) de cada edición de la GR Strength Cup.',
  },
  en: {
    titulo: 'Results of the', crumb: 'Results', eyebrow: 'Standings', sub: 'Full standings by class, podiums and best lifters from every edition.',
    edEyebrow: 'Editions', edTitulo: 'All the *editions*', celebrada: 'Held', proxima: 'Next edition', fechaPc: 'Date to be confirmed', verResultados: 'See results', masInfo: 'More information',
    comoEyebrow: 'How the ranking works', comoTitulo: 'Total and *GL points*',
    como: [{ t: 'By class', d: 'The highest total wins (squat + bench + deadlift). In a tie, the lighter lifter wins.' }, { t: 'Best lifter', d: 'Athletes of different bodyweights are compared using IPF GL points.' }, { t: 'Official standings', d: 'The AEP publishes the official results sheet as a PDF after the competition.' }],
    rel: [{ titulo: '2025 edition', texto: 'Llíria · 1–2 March 2025', ruta: '/ediciones/2025' }, { titulo: 'Gallery', texto: 'Competition photos', ruta: '/galeria' }, { titulo: 'Qualifying totals', texto: 'AEP-1 totals by class', ruta: '/marcas-minimas' }] as RelatedLink[],
    seoT: 'Results · GR Strength Cup', seoD: 'Standings by class, podiums and best lifters (GL points) from every edition of GR Strength Cup.',
  },
};

/** /resultados (Figma page 25): every edition and how the rankings work. */
@Component({
  selector: 'gr-resultados-index',
  imports: [CdnPipe, RouterLink, LocPipe, Page, GrSkeleton, GrIcon, GrButton, GrCabecera, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" accent="GRS Cup 2" [crumb]="t().crumb" [eyebrow]="t().eyebrow" [subtitle]="t().sub">
      <div class="flex flex-col gap-12 md:gap-20">
        <section class="flex flex-col gap-5 md:gap-7">
          <gr-cabecera [eyebrow]="t().edEyebrow" [titulo]="t().edTitulo" [centro]="false" tam="m" />
          @if (cards() === undefined) { <div class="grid gap-6 md:grid-cols-2"><gr-skeleton class="h-[420px] rounded-xl" /><gr-skeleton class="h-[420px] rounded-xl" /></div> }
          @else {
            <div class="grid gap-6 md:grid-cols-2">
              @for (x of cards(); track x.e.slug) {
                @let fin = x.e.estado === 'finalizado';
                <!-- Figma «Edition card»: 260 px photo with the year, badge, name, meta with icons and the action -->
                <article class="flex flex-col overflow-hidden rounded-xl border border-line-subtle bg-bg-card">
                  <div class="relative h-[220px] overflow-hidden md:h-[260px]">
                    <img [src]="(fin ? '/img/home/edicion-2025.webp' : '/img/home/edicion-2026.webp') | cdn" [alt]="x.e.nombre" class="size-full object-cover" [class]="fin ? 'object-[50%_42%]' : 'object-[50%_30%]'" loading="lazy" />
                    <span class="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgb(20_17_18/0.85))]"></span>
                    <p class="absolute bottom-4 left-6 font-display text-[64px] leading-none italic drop-shadow-lg md:text-[72px]">{{ x.e.anio }}</p>
                  </div>
                  <div class="flex flex-1 flex-col gap-2 p-6">
                    <span class="inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-label-xs uppercase" [class]="fin ? 'border-text-muted bg-text-muted/12 text-text-tertiary' : 'border-info bg-info/12 text-info'">{{ fin ? t().celebrada : x.c?.fechaInicio ? t().proxima : t().fechaPc }}</span>
                    <h3 class="mt-1 text-display-xs">{{ x.e.nombre }}</h3>
                    <ul class="flex flex-col gap-1.5 text-body-s text-text-secondary">
                      @if (x.c?.fechaInicio) { <li class="flex items-center gap-2"><gr-icon name="calendar" [size]="14" class="text-accent-text" />{{ fechas(x.c?.fechaInicio, x.c?.fechaFin) }}</li> }
                      <li class="flex items-center gap-2"><gr-icon name="map-pin" [size]="14" class="text-accent-text" />{{ x.c?.sede!.ciudad || x.e.ciudad }}@if (x.c?.sede!.provincia) { ({{ x.c?.sede!.provincia }}) }</li>
                      @if (x.c?.evento!.nivel) { <li class="flex items-center gap-2"><gr-icon name="trophy" [size]="14" class="text-accent-text" />{{ x.c?.evento!.nivel }}</li> }
                    </ul>
                    <div class="mt-auto pt-3">
                      @if (x.publicado) { <a grButton variant="outline" [routerLink]="'/resultados/' + x.e.anio | loc" iconRight="arrow-right">{{ t().verResultados }}</a> }
                      @else if (x.e.slug === slug) { <a grButton variant="primary" [routerLink]="'/' | loc">{{ t().masInfo }}</a> }
                    </div>
                  </div>
                </article>
              }
            </div>
          }
        </section>
        <section class="flex flex-col gap-5 md:gap-7">
          <gr-cabecera [eyebrow]="t().comoEyebrow" [titulo]="t().comoTitulo" [centro]="false" tam="m" />
          <div class="grid gap-4 md:grid-cols-3">
            @for (c of t().como; track c.t) { <div class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6"><p class="text-label-l">{{ c.t }}</p><p class="text-body-s text-text-tertiary">{{ c.d }}</p></div> }
          </div>
        </section>
        <gr-related [items]="t().rel" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class ResultadosIndexPage {
  private readonly api = inject(DirectoPublic);
  private readonly http = inject(HttpClient);
  protected readonly cards = signal<EdicionCard[] | undefined>(undefined);
  protected readonly slug = COMPETITION_SLUG;
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(TR);
  protected readonly fechas = (a?: string, b?: string) => fechasCortas(a, b, this.i18n.locale());
  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      const eds = (await this.api.ediciones()) ?? [];
      const cards = await Promise.all(eds.map(async (e) => {
        const [c, r] = await Promise.all([firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${e.slug}`)).catch(() => null), this.api.resultados(e.slug)]);
        return { e, c, publicado: !!r?.publicado };
      }));
      this.cards.set(cards);
      await applySeo(cms, seo, '/resultados', this.t().seoT, this.t().seoD);
    });
  }
}

// ============================================================ /resultados/:anio ===

const TE = {
  es: {
    titulo: 'Resultados', subGl: 'Podios, mejores levantadores y clasificación completa por categoría.', sub: 'Podios y clasificación completa por categoría.',
    fuente: 'Fuente: acta oficial AEP (PDF)', ejemplo: 'Datos de ejemplo', falloT: 'No hemos podido cargar los resultados', falloD: 'Vuelve a intentarlo en unos minutos.',
    aun: 'Aún no hay resultados publicados', aunD: 'Cada categoría se publica aquí al terminar. Mientras tanto, sigue la competición en directo.', verDirecto: 'Ver en directo',
    secciones: 'Secciones', buscar: 'Buscar atleta o club', ph: 'Buscar atleta o club…', filtros: 'Filtros', categoria: 'Categoría', todas: 'Todas', ordenar: 'Ordenar', posicion: 'posición', puntosGl: 'puntos GL',
    mejEyebrow: 'Mejores levantadores', mejTitulo: 'Mejor *levantador/a*', mejTexto: 'Por puntos GL de la IPF.', fem: 'Femenino', masc: 'Masculino',
    podEyebrow: 'Podios', podTitulo: 'Podio por *categoría*', carrusel: 'carrusel', podios: 'Podios por categoría', atletas: (n: number) => n + ' ' + (n === 1 ? 'atleta' : 'atletas'),
    desliza: (n: number) => 'Desliza para ver las ' + n + ' categorías →', catW: 'Categoría ', clasEyebrow: 'Clasificación', clasTitulo: 'Clasificación *completa*', nadie: 'Nadie coincide con la búsqueda.',
    acta: 'Descargar acta oficial (PDF)', copiado: 'Enlace copiado', compartir: 'Compartir resultados',
    tabs: { mejores: 'Mejores', podios: 'Podios', clasificacion: 'Clasificación', descargar: 'Descargas' } as Record<string, string>,
    sexos: { '': 'Todas', F: 'Femenino', M: 'Masculino' } as Record<string, string>,
    notFoundT: 'Página no encontrada · GR Strength Cup', notFoundD: 'La página que buscas no existe.',
    rel: (a: string) => [{ titulo: 'Edición ' + a, texto: 'Crónica y fotos', ruta: '/ediciones/' + a }, { titulo: 'Galería', texto: 'Fotos por atleta', ruta: '/galeria' }, { titulo: 'Marcas mínimas', texto: '¿Te vale tu total?', ruta: '/marcas-minimas' }] as RelatedLink[],
    y: ' y ', seoT: (n: string) => 'Resultados ' + n + ' · Clasificación por categoría',
    seoD: (n: string, m: string) => 'Podios, mejores levantadores' + (m ? ' — ' + m : '') + ' y la clasificación completa por categoría de la ' + n + '.', seoNo: (n: string) => 'Resultados de la ' + n + ': se publican al terminar cada categoría.',
  },
  en: {
    titulo: 'Results', subGl: 'Podiums, best lifters and full standings by class.', sub: 'Podiums and full standings by class.',
    fuente: 'Source: official AEP results sheet (PDF)', ejemplo: 'Sample data', falloT: 'We couldn’t load the results', falloD: 'Please try again in a few minutes.',
    aun: 'No results published yet', aunD: 'Each class is published here once it finishes. In the meantime, follow the competition live.', verDirecto: 'Watch live',
    secciones: 'Sections', buscar: 'Search athlete or club', ph: 'Search athlete or club…', filtros: 'Filters', categoria: 'Class', todas: 'All', ordenar: 'Sort', posicion: 'position', puntosGl: 'GL points',
    mejEyebrow: 'Best lifters', mejTitulo: 'Best *lifter*', mejTexto: 'By IPF GL points.', fem: 'Women', masc: 'Men',
    podEyebrow: 'Podiums', podTitulo: 'Podium by *class*', carrusel: 'carousel', podios: 'Podiums by class', atletas: (n: number) => n + ' ' + (n === 1 ? 'athlete' : 'athletes'),
    desliza: (n: number) => 'Swipe to see all ' + n + ' classes →', catW: 'Class ', clasEyebrow: 'Standings', clasTitulo: 'Full *standings*', nadie: 'Nobody matches your search.',
    acta: 'Download official results sheet (PDF)', copiado: 'Link copied', compartir: 'Share results',
    tabs: { mejores: 'Best', podios: 'Podiums', clasificacion: 'Standings', descargar: 'Downloads' },
    sexos: { '': 'All', F: 'Women', M: 'Men' },
    notFoundT: 'Page not found · GR Strength Cup', notFoundD: 'The page you’re looking for doesn’t exist.',
    rel: (a: string) => [{ titulo: a + ' edition', texto: 'Report and photos', ruta: '/ediciones/' + a }, { titulo: 'Gallery', texto: 'Photos by athlete', ruta: '/galeria' }, { titulo: 'Qualifying totals', texto: 'Does your total qualify?', ruta: '/marcas-minimas' }] as RelatedLink[],
    y: ' and ', seoT: (n: string) => n + ' results · Standings by class',
    seoD: (n: string, m: string) => 'Podiums, best lifters' + (m ? ' — ' + m : '') + ' and the full standings by class of ' + n + '.', seoNo: (n: string) => 'Results of ' + n + ': published as each class finishes.',
  },
};

/** /resultados/:anio (Figma page 25): best lifters by GL, podiums and the full ranking of every category, with filters. */
@Component({
  selector: 'gr-resultados-edicion',
  imports: [RouterLink, LocPipe, GrSelect, Page, FormsModule, GrAlert, GrButton, GrIcon, GrSkeleton, GrCabecera, Clasificacion, Related, Community, Navbar, Footer, NoEncontrada],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = res();
    <!-- Figma 17 «404»: an edition that does not exist -->
    @if (noExiste()) { <gr-navbar /><main><gr-no-encontrada /></main><gr-footer /> } @else {
    <gr-page [title]="t().titulo" [accent]="r?.competicion?.nombre ?? 'GRS Cup 2'" [section]="t().titulo" [crumb]="anio()" [eyebrow]="r ? ((comp()?.sede?.ciudad || r.competicion.sede) + ' · ' + fechas(r.competicion.fechaInicio, r.competicion.fechaFin)) : ''"
      [subtitle]="r?.publicado ? (comp()?.evento?.nivel ? (i18n.lang() === 'es' ? comp()!.evento.nivel.replace(/^(AEP-\d Regional) (?!de )/, '$1 de ') : comp()!.evento.nivel) + '. ' : '') + ((r.mejores['F'] || r.mejores['M']) ? t().subGl : t().sub) : ''">
      @if (r?.publicado) {
        <div pageStamps class="flex flex-wrap gap-2">
          <!-- Figma 25: «Fuente: acta oficial AEP (PDF)» + «Datos de ejemplo» -->
          @if (acta(); as u) { <a [href]="u" target="_blank" rel="noopener" class="inline-flex items-center gap-2 rounded-sm border border-line-subtle px-3 py-2 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />{{ t().fuente }}</a> }
          @if (r!.ejemplo) { <span class="inline-flex h-7 items-center self-center rounded-full border border-info bg-info/12 px-3 text-label-xs text-info uppercase">{{ t().ejemplo }}</span> }
        </div>
      }
      @if (r === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (r === null) { @if (!fallo.limitado()) { <gr-alert tone="warning" [title]="t().falloT">{{ t().falloD }}</gr-alert> } }
      @else if (!r.publicado) {
        <div class="rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
          <p class="text-ui-h4">{{ t().aun }}</p>
          <p class="mx-auto mt-2 max-w-lg text-body-s text-text-secondary">{{ t().aunD }}</p>
          <a [routerLink]="'/en-directo' | loc" class="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-label-s text-white hover:bg-accent-hover"><gr-icon name="radio" [size]="16" />{{ t().verDirecto }}</a>
        </div>
      } @else {
        <!-- GL points need the body weight: editions imported from the previous web have none -->
        @let conGL = !!(r.mejores['F'] || r.mejores['M']);
        <!-- Filters -->
        <!-- Figma 25 mobile: section tabs under the header -->
        <nav [attr.aria-label]="t().secciones" class="-mx-5 mb-6 flex gap-2 overflow-x-auto border-y border-line-subtle px-5 py-3 [scrollbar-width:none] md:hidden">
          @for (tb of tabs(); track tb.id) { <a [href]="'#' + tb.id" (click)="ir($event, tb.id)" class="inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-label-s focus-visible:outline-2 focus-visible:outline-accent" [class]="tab() === tb.id ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary'">{{ t().tabs[tb.id] }}</a> }
        </nav>
        <div class="flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-56 md:max-w-xs"><span class="sr-only">{{ t().buscar }}</span><gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" enterkeyhint="search" autocomplete="off" (keydown.enter)="$any($event.target).blur()" class="h-11 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-9 text-body-m md:text-body-s" [placeholder]="t().ph" [ngModel]="q()" (ngModelChange)="q.set($event)" /></label>
          <button type="button" class="relative flex size-11 items-center justify-center rounded-md border border-line-strong md:hidden" [attr.aria-label]="t().filtros" aria-controls="filtros-resultados" [attr.aria-expanded]="filtros()" (click)="filtros.set(!filtros())"><gr-icon name="sliders" [size]="18" />
            @if ((cat() ? 1 : 0) + (orden() !== 'puesto' ? 1 : 0); as n) { <span class="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-label-xs text-white">{{ n }}</span> }</button>
          <div class="-mx-5 flex w-[calc(100%+40px)] gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:contents">
          @for (s of sexos; track s.v) { <button type="button" class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-label-s" [class]="sexo() === s.v ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'" [attr.aria-pressed]="sexo() === s.v" (click)="sexo.set(s.v)"><gr-icon [name]="sexo() === s.v ? 'check' : 'plus'" [size]="14" />{{ t().sexos[s.v] }}</button> }
          </div>
          <div id="filtros-resultados" class="w-full flex-col gap-2 md:contents" [class.flex]="filtros()" [class.hidden]="!filtros()">
          <gr-select tipo="filtro" [etiqueta]="t().categoria" [attr.aria-label]="t().categoria" [ngModel]="cat()" (ngModelChange)="cat.set($event)"><option value="">{{ t().todas }}</option>@for (c of r.categorias; track c.clave) { <option [value]="c.clave">{{ c.titulo }}</option> }</gr-select>
          <gr-select tipo="filtro" [etiqueta]="t().ordenar" [resaltar]="false" [attr.aria-label]="t().ordenar" class="md:ml-auto" [ngModel]="orden()" (ngModelChange)="orden.set($event)"><option value="puesto">{{ t().posicion }}</option><option value="total">total</option>@if (conGL) { <option value="gl">{{ t().puntosGl }}</option> }</gr-select>
          </div>
        </div>

        @if (!q() && !cat()) {
          @if (conGL) {
          <gr-cabecera id="mejores" class="mt-12 scroll-mt-28" [eyebrow]="t().mejEyebrow" [titulo]="t().mejTitulo" [texto]="t().mejTexto" [centro]="false" tam="m" />
          <div class="mt-5 grid gap-3 md:grid-cols-2">
            @for (s of sx; track s) {
              @if (r.mejores[s]; as f) {
                <div class="flex items-center gap-4 rounded-lg border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_70%)] p-5">
                  <span class="flex size-12 shrink-0 items-center justify-center rounded-pill border border-[#c9a227]/60 bg-[#c9a227]/15 text-[#e3c25a]"><gr-icon name="award" [size]="22" /></span>
                  <div class="min-w-0 flex-1"><p class="text-mono-xs text-text-tertiary">{{ s === 'F' ? t().fem : t().masc }}</p><p class="truncate font-display text-[24px] uppercase italic">{{ f.nombre }}</p><p class="text-body-xs text-text-tertiary">{{ catDe(f) }}</p></div>
                  <div class="text-right"><p class="font-display text-[28px] leading-none text-accent-text italic">{{ gl(f.gl) }} GL</p><p class="text-mono-xs text-text-tertiary">{{ kg(f.total) }} kg</p></div>
                </div>
              }
            }
          </div>

          }
          <gr-cabecera id="podios" [class]="conGL ? 'mt-14 scroll-mt-28' : 'mt-12 scroll-mt-28'" [eyebrow]="t().podEyebrow" [titulo]="t().podTitulo" [centro]="false" tam="m" />
          <div role="region" [attr.aria-roledescription]="t().carrusel" [attr.aria-label]="t().podios" (scroll)="podioScroll($event)" class="-mx-5 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:mt-7 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0">
            @for (c of r.categorias; track c.clave) {
              <section [attr.aria-label]="c.titulo" class="w-[86%] shrink-0 snap-center rounded-xl border border-line-subtle bg-bg-card p-5 md:w-auto">
                <header class="flex flex-wrap items-baseline justify-between gap-x-2"><h3 class="font-display text-[20px] uppercase italic">{{ c.titulo }}</h3><span class="text-mono-xs text-text-tertiary">{{ t().atletas(c.atletas) }}</span></header>
                <!-- only the steps with an athlete (no empty «3» in a category of two) -->
                <div class="mt-4 grid items-end gap-2 max-[260px]:!grid-cols-1" [style.grid-template-columns]="'repeat(' + podio(c).length + ', minmax(0, 1fr))'">
                  @for (p of podio(c); track p.pos) {
                    <div class="flex flex-col items-center gap-1 text-center">
                      <p class="w-full text-label-s hyphens-auto [overflow-wrap:break-word]" lang="es">{{ p.f.nombre }}</p><p class="text-mono-xs text-text-tertiary">{{ kg(p.f.total) }} kg</p>
                      <div class="flex w-full items-center justify-center rounded-t-md border font-display text-[34px] italic" [style.height.px]="[0, 124, 96, 76][p.pos]"
                        [class]="p.pos === 1 ? 'border-accent/60 bg-accent-deep/60 text-[#e3c25a]' : p.pos === 2 ? 'border-line-strong bg-bg-raised' : 'border-[#b0703e]/50 bg-[#b0703e]/15 text-[#d79a66]'">{{ p.pos }}</div>
                    </div>
                  }
                </div>
              </section>
            }
          </div>
          @if (r.categorias.length > 1) {
            <div class="mt-3 flex items-center justify-between gap-3 md:hidden">
              <p class="text-body-xs text-text-tertiary">{{ t().desliza(r.categorias.length) }}</p>
              <p class="shrink-0 text-mono-s text-text-secondary tabular-nums" aria-live="polite"><span class="sr-only">{{ t().catW }}</span>{{ podioIdx() + 1 }}/{{ r.categorias.length }}</p>
            </div>
          }
        }

        <gr-cabecera id="clasificacion" class="mt-14 scroll-mt-28" [eyebrow]="t().clasEyebrow" [titulo]="cat() ? tituloCat().replace(/(\S+ kg)$/, '*$1*') : t().clasTitulo" [centro]="false" tam="m" />
        @for (c of filtradas(); track c.clave) {
          @if (!cat()) { <h3 class="mt-8 font-display text-[22px] uppercase italic">{{ c.titulo }}</h3> }
          <gr-clasificacion class="mt-3 block" [c]="c" [abrir]="$first" />
        } @empty { <p class="mt-6 text-body-s text-text-tertiary">{{ t().nadie }}</p> }
        <div id="descargar" class="mt-6 flex scroll-mt-28 flex-wrap gap-2">
          @if (acta(); as u) { <a grButton variant="primary" [href]="u" target="_blank" rel="noopener">{{ t().acta }}</a> }
          <button grButton variant="outline" type="button" icon="send" (click)="compartir()">{{ copiado() ? t().copiado : t().compartir }}</button>
        </div>
      }
      <div class="mt-12 flex flex-col gap-12 md:mt-20 md:gap-20">
        <gr-related [items]="rel()" />
        <gr-community />
      </div>
    </gr-page>
    }
  `,
})
export class ResultadosEdicionPage {
  protected readonly noExiste = signal(false);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(TE);
  private noEncontrada(seo: Seo): void {
    this.noExiste.set(true);
    this.cms.notFound();
    seo.set({ title: this.t().notFoundT, description: this.t().notFoundD, path: '/404', robots: 'noindex' });
  }
  private readonly api = inject(DirectoPublic);
  protected readonly fallo = inject(FalloApi);
  private readonly cms = inject(Cms);
  protected readonly anio = signal(inject(ActivatedRoute).snapshot.paramMap.get('anio') ?? '');
  protected readonly res = signal<ResultadosPublicos | null | undefined>(undefined);
  /** The edition's public data: AEP level (subtitle) and the official report (Figma 25). */
  protected readonly comp = signal<CompeticionPublica | null>(null);
  private readonly http = inject(HttpClient);
  protected readonly q = signal('');
  protected readonly sexo = signal<'' | 'F' | 'M'>('');
  /** Mobile: the «Filtros» panel (category and order). */
  protected readonly filtros = signal(false);
  /** podium carousel position (mobile scroll-snap) */
  protected readonly podioIdx = signal(0);
  protected podioScroll(e: Event): void {
    const el = e.target as HTMLElement, w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    if (w) this.podioIdx.set(Math.min(el.children.length - 1, Math.round(el.scrollLeft / (w + 12))));
  }
  protected readonly cat = signal('');
  protected readonly orden = signal<'puesto' | 'total' | 'gl'>('puesto');
  protected readonly copiado = signal(false);
  /** Mobile section tabs (Figma 25). */
  protected readonly tab = signal('mejores');
  protected readonly tabs = computed(() => {
    const r = this.res();
    const conGL = !!(r?.mejores['F'] || r?.mejores['M']);
    return [...(conGL ? [{ id: 'mejores', l: 'Mejores' }] : []), { id: 'podios', l: 'Podios' }, { id: 'clasificacion', l: 'Clasificación' }, { id: 'descargar', l: 'Descargas' }];
  });
  /** Official AEP report: from the results API, else from the edition. */
  protected readonly acta = computed(() => this.res()?.competicion.actaUrl || this.comp()?.actaUrl || '');
  protected ir(e: Event, id: string): void {
    e.preventDefault();
    this.tab.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  protected readonly sx: ('F' | 'M')[] = ['F', 'M'];
  protected readonly sexos = [{ v: '' as const, l: 'Todas' }, { v: 'F' as const, l: 'Femenino' }, { v: 'M' as const, l: 'Masculino' }];
  protected readonly fechas = (a?: string, b?: string) => fechasCortas(a, b, this.i18n.locale());
  protected readonly kg = (v?: number | null) => kg(v, this.i18n.lang());
  protected readonly gl = (v?: number | null) => gl(v, this.i18n.lang());
  /** «Club · −63 kg» under the best lifter (Figma 25). */
  protected catDe(f: Fila): string {
    const c = this.res()?.categorias.find((c) => c.filas.includes(f) || c.filas.some((x) => x.nombre === f.nombre && x.total === f.total));
    return [f.club, c ? c.categoria.replace('-', '−') + ' kg' : ''].filter(Boolean).join(' · ');
  }
  protected readonly tituloCat = computed(() => this.res()?.categorias.find((c) => c.clave === this.cat())?.titulo ?? '');
  protected readonly rel = computed<RelatedLink[]>(() => this.t().rel(this.anio()));
  protected readonly filtradas = computed<Categoria[]>(() => {
    const r = this.res();
    if (!r) return [];
    const q = norm(this.q());
    return r.categorias
      .filter((c) => (!this.sexo() || c.sexo === this.sexo()) && (!this.cat() || c.clave === this.cat()))
      .map((c) => {
        let filas = q.length > 1 ? c.filas.filter((f) => norm(f.nombre + ' ' + (f.club ?? '')).includes(q)) : c.filas;
        if (this.orden() === 'gl') filas = [...filas].sort((a, b) => (b.gl ?? -1) - (a.gl ?? -1));
        if (this.orden() === 'total') filas = [...filas].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
        return { ...c, filas };
      })
      .filter((c) => c.filas.length);
  });
  protected podio(c: Categoria): { f: Fila; pos: number }[] {
    const t = c.filas.filter((f) => f.puesto);
    return [2, 1, 3].filter((pos) => t[pos - 1]).map((pos) => ({ f: t[pos - 1], pos }));
  }
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const eds = await this.api.ediciones();
      const e = eds?.find((x) => String(x.anio) === this.anio());
      if (!e) {
        this.res.set(null);
        if (eds) this.noEncontrada(seo);
        return;
      }
      const [r, c] = await Promise.all([this.api.resultados(e.slug), firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${e.slug}`)).catch(() => null)]);
      this.comp.set(c);
      this.res.set(r);
      const mejores = r ? Object.values(r.mejores).map((f) => `${f!.nombre} (${gl(f!.gl, this.i18n.lang())} GL)`).join(this.t().y) : '';
      await applySeo(this.cms, seo, '/resultados/' + this.anio(), this.t().seoT(e.nombre),
        r?.publicado ? this.t().seoD(e.nombre, mejores) : this.t().seoNo(e.nombre));
    });
  }
  protected async compartir(): Promise<void> {
    const url = location.href;
    if (navigator.share) {
      await navigator.share({ title: document.title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }
}

// ============================================================ /ediciones/:anio ===

const TD = {
  es: {
    celebrada: 'Celebrada',
    eyebrow: 'Edición anterior', seccion: 'Ediciones', fuente: (a: string) => 'Fuente: cartel oficial de la edición ' + a, cartel: (n: string) => 'Cartel de la ' + n,
    verResultados: 'Ver resultados', verGaleria: 'Ver galería', galEyebrow: 'Galería', galTitulo: (a: string) => 'Así fue *la edición ' + a + '*', ampliar: 'Ampliar: ',
    patro: (a: string) => 'Patrocinadores ' + a, patroTitulo: 'Gracias a *nuestros colaboradores*', logos: (a: string) => 'Logos del cartel de la edición ' + a + '.',
    compite: 'Compite en la GRS Cup 2', compiteD: 'Plazas limitadas. La inscripción se hace a través de la AEP.', inscribirse: 'Inscribirse',
    notFoundT: 'Página no encontrada · GRS Cup', notFoundD: 'La página que buscas no existe.', fotos: FOTOS_2025.map(([, a]) => a),
    resumen: (nivel: string, f: string, dos: boolean, ciudad: string) => 'Campeonato de powerlifting ' + nivel + ', celebrado ' + (dos ? 'los días ' + f.replace('–', ' y ') : 'el ' + f) + ' en ' + ciudad + '.',
    datos: ['Fecha', 'Sede', 'Nivel', 'Organiza'],
    rel: (a: string, sig: number) => [{ titulo: 'Resultados ' + a, texto: 'Podios y clasificación', ruta: '/resultados/' + a }, { titulo: 'Galería', texto: 'Todas las fotos', ruta: '/galeria' }, { titulo: 'Edición ' + sig, texto: 'Próxima competición', ruta: '/' }] as RelatedLink[],
    seoT: (a: string) => 'Edición ' + a + ' · GRS Cup 2', seoD: (f: string, c: string, d: string) => f + ' en ' + c + '. ' + d,
  },
  en: {
    celebrada: 'Held',
    eyebrow: 'Past edition', seccion: 'Editions', fuente: (a: string) => 'Source: official poster of the ' + a + ' edition', cartel: (n: string) => 'Poster of ' + n,
    verResultados: 'See results', verGaleria: 'See gallery', galEyebrow: 'Gallery', galTitulo: (a: string) => 'How *the ' + a + ' edition* went', ampliar: 'Enlarge: ',
    patro: (a: string) => a + ' sponsors', patroTitulo: 'Thanks to *our partners*', logos: (a: string) => 'Logos from the ' + a + ' edition poster.',
    compite: 'Compete in GRS Cup 2', compiteD: 'Limited places. Registration is done through the AEP.', inscribirse: 'Register',
    notFoundT: 'Page not found · GRS Cup', notFoundD: 'The page you’re looking for doesn’t exist.',
    fotos: ['Athlete in front of the bar before his deadlift, with 275 kg on the scoreboard', 'Focused athlete wearing headphones before her attempt', 'Squat on the platform, with the loaders at the sides', 'Athlete on the bench press under the competition banner', 'Deadlift locked out under the stage lights', 'Belt and wrist wraps hanging from a bar in the warm-up area', 'A teammate adjusts an athlete’s belt before he goes out', 'Focused athlete before stepping onto the platform'],
    resumen: (nivel: string, f: string, dos: boolean, ciudad: string) => nivel + ' powerlifting championship, held ' + (dos ? 'on ' + f.replace('–', ' and ') : 'on ' + f) + ' in ' + ciudad + '.',
    datos: ['Date', 'Venue', 'Level', 'Organiser'],
    rel: (a: string, sig: number) => [{ titulo: a + ' results', texto: 'Podiums and standings', ruta: '/resultados/' + a }, { titulo: 'Gallery', texto: 'All the photos', ruta: '/galeria' }, { titulo: sig + ' edition', texto: 'Next competition', ruta: '/' }] as RelatedLink[],
    seoT: (a: string) => a + ' edition · GRS Cup 2', seoD: (f: string, c: string, d: string) => f + ' in ' + c + '. ' + d,
  },
};

/** /ediciones/:anio (Figma page 28): the archive of a past edition: poster, facts, gallery and sponsors. */
@Component({
  selector: 'gr-edicion',
  imports: [LocPipe, CdnPipe, RouterLink, Page, GrSkeleton, GrIcon, GrButton, GrCabecera, Lightbox, Related, Navbar, Footer, NoEncontrada],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = comp();
    <!-- Figma 17 «404»: an edition that does not exist -->
    @if (noExiste()) { <gr-navbar /><main><gr-no-encontrada /></main><gr-footer /> } @else {
    <gr-page title="GRS Cup" [accent]="anio()" [eyebrow]="t().eyebrow" [section]="t().seccion" [crumb]="anio()" [subtitle]="resumen()">
      @if (c) {
        <div pageStamps class="flex flex-wrap gap-2">
          <span class="inline-flex items-center gap-2 rounded-sm border border-line-subtle px-3 py-2 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />{{ t().fuente(anio()) }}</span>
          <span class="inline-flex h-7 items-center rounded-full border border-text-muted bg-text-muted/12 px-3 text-label-xs text-text-tertiary uppercase">{{ t().celebrada }}</span>
        </div>
      }
      @if (c === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (c) {
        <!-- Figma «Ficha»: the poster (360 × 480) and the facts in one column, the story and the actions -->
        <div class="flex flex-col gap-12 md:gap-20">
        <div class="grid gap-6 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-10">
          @if (cartel()) { <img [src]="cartel()" [alt]="t().cartel(c.nombre)" class="mx-auto w-full max-w-[300px] rounded-lg border border-line-subtle md:max-w-[360px]" width="360" height="480" /> }
          <div class="flex flex-col gap-5">
            <dl class="flex flex-col gap-4">
              @for (x of datos(); track x.l) {
                <div class="flex items-center gap-3"><span class="flex size-11 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/12 text-accent-text"><gr-icon [name]="x.i" [size]="20" /></span>
                  <div><dt class="text-label-xs text-text-muted uppercase">{{ x.l }}</dt><dd class="text-label-m">{{ x.v }}</dd></div></div>
              }
            </dl>
            @if (historia()) { <p class="text-body-m text-text-secondary">{{ historia() }}</p> }
            <!-- full-width stacked buttons on mobile (Figma 28 mobile) -->
            <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-2">
              <a grButton variant="primary" class="max-sm:h-12 max-sm:w-full" [routerLink]="'/resultados/' + anio() | loc">{{ t().verResultados }}</a>
              <a grButton variant="outline" class="max-sm:h-12 max-sm:w-full" [routerLink]="'/galeria' | loc" iconRight="arrow-right">{{ t().verGaleria }}</a>
            </div>
          </div>
        </div>

        @if (galeria().length) {
          <section class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().galEyebrow" [titulo]="t().galTitulo(anio())" [centro]="false" tam="m" />
            <div class="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              @for (f of galeria(); track f.url; let i = $index) {
                <!-- mobile shows six (Figma 28 mobile), desktop eight -->
                <button type="button" class="group relative aspect-[285/379] overflow-hidden rounded-md border border-white/8 cursor-zoom-in" [class.max-md:hidden]="i >= 6" [attr.aria-label]="t().ampliar + f.alt" (click)="ver.set(i)">
                  <img [src]="mini(f.url)" [alt]="f.alt" loading="lazy" class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" [style.object-position]="f.focalX + '% ' + f.focalY + '%'" />
                </button>
              }
            </div>
            <gr-lightbox [fotos]="fotosLightbox()" [(indice)]="ver" />
          </section>
        }
        @if (sponsors().length) {
          <section class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().patro(anio())" [titulo]="t().patroTitulo" [centro]="false" tam="m" />
            <!-- Figma 80:189922 / 80:190214: one common box per logo (120×40 mobile, 140×48 desktop), optical scale per logo -->
            <ul class="flex flex-wrap gap-3 md:gap-4">
              @for (p of sponsors(); track p.nombre) { <li class="flex items-center justify-center rounded-lg border border-line-subtle bg-bg-card px-4 py-3 md:px-5"><span class="flex h-10 w-[120px] items-center justify-center md:h-12 md:w-[140px]"><img [src]="p.logoUrl | cdn" [alt]="p.nombre" class="max-h-full max-w-full object-contain" [style.transform]="escalaLogo(p)" loading="lazy" /></span></li> }
            </ul>
            <p class="text-body-xs text-text-tertiary">{{ t().logos(anio()) }}</p>
          </section>
        }
        <gr-related [items]="rel()" />
        <section class="overflow-hidden rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-6 md:flex md:items-center md:justify-between md:p-10">
          <div><p class="flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase">Edición {{ siguiente() }}</p>
            <h2 class="mt-3 text-display-xs md:text-display-m">{{ t().compite }}</h2><p class="mt-2 text-body-s text-text-secondary">{{ t().compiteD }}</p></div>
          <a grButton variant="primary" size="l" [routerLink]="'/inscripcion' | loc" class="mt-5 max-sm:w-full md:mt-0">{{ t().inscribirse }}</a>
        </section>
        </div>
      }
    </gr-page>
    }
  `,
})
export class EdicionPage {
  protected readonly noExiste = signal(false);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(TD);
  private noEncontrada(seo: Seo): void {
    this.noExiste.set(true);
    this.cms.notFound();
    seo.set({ title: this.t().notFoundT, description: this.t().notFoundD, path: '/404', robots: 'noindex' });
  }
  private readonly api = inject(DirectoPublic);
  private readonly http = inject(HttpClient);
  private readonly cms = inject(Cms);
  protected readonly anio = signal(inject(ActivatedRoute).snapshot.paramMap.get('anio') ?? '');
  protected readonly comp = signal<CompeticionPublica | null | undefined>(undefined);
  protected readonly fotos = signal<Album['fotos']>([]);
  protected readonly sponsors = signal<Patrocinador[]>([]);
  protected readonly siguiente = computed(() => Number(this.anio()) + 1);
  protected readonly cartel = computed(() => (this.anio() === '2025' ? CARTEL_2025 : ''));
  protected readonly ver = signal(-1);
  /** The 2025 design photos (Figma 28) are only a fallback when the BO has no album for the year. */
  protected readonly galeria = computed(() => {
    const f = this.fotos();
    // eight at most (Figma 28): the whole album is in /galeria
    if (f.length || this.anio() !== '2025') return f.slice(0, 8);
    return FOTOS_2025.map(([f], i) => ({ url: cdn(`/img/edicion-2025/${f}.webp`), alt: this.t().fotos[i], focalX: 50, focalY: 35 })) as Album['fotos'];
  });
  /**
   * Optical weight per logo inside the common box (object-contain). Measured on the trimmed files: compact marks fill the
   * box height and look heavier, so they shrink; long wordmarks (Valkyria 5.3:1, GRStrength 8:1, Coaching 9:1) stay at 1.
   * AEP 2.4:1 → 0.9 · A7 1.8:1 → 0.8 · CF Isabel Atlas 1.8:1 → 0.85 · Gym Mediterrani 1.2:1 → 1 (QA: 0.75 quedaba diminuto) · PHED 3.4:1 → 0.95 · Maniak 3.7:1 → 1.
   */
  private static readonly ESCALA_LOGO: [RegExp, number][] = [[/\baep\b/i, 0.9], [/^a7\b/i, 0.8], [/isabel|\bcfi\b/i, 0.85], [/phed/i, 0.95]];
  protected escalaLogo(p: Patrocinador): string | null {
    const e = EdicionPage.ESCALA_LOGO.find(([r]) => r.test(p.nombre))?.[1];
    return e ? `scale(${e})` : null;
  }
  /** Media library photos at 480 px (the tiles are 285 px wide). */
  protected mini = (url: string) => (url.startsWith('/api/medios/') ? url + '?w=480' : url);
  protected readonly fotosLightbox = computed(() => this.galeria().map((f) => ({ imagen: f.url, alt: f.alt })));
  /** Figma: «Campeonato de powerlifting AEP-2 Regional…, celebrado los días 1 y 2 de marzo de 2025 en Llíria (Valencia).» */
  protected readonly resumen = computed(() => {
    const c = this.comp();
    if (!c) return '';
    const dos = c.fechaFin && c.fechaFin !== c.fechaInicio;
    const f = fechas(c.fechaInicio, c.fechaFin, this.i18n.locale());
    return this.t().resumen(c.evento.nivel || '', f, !!dos, c.sede.ciudad + (c.sede.provincia ? ' (' + c.sede.provincia + ')' : '')).replace(/\s+,/g, ',');
  });
  protected readonly historia = computed(() => this.comp()?.evento?.descripcion ?? '');
  protected readonly datos = computed(() => {
    const c = this.comp();
    if (!c) return [];
    return [
      { l: this.t().datos[0], v: fechasCortas(c.fechaInicio, c.fechaFin, this.i18n.locale()), i: 'calendar' as const },
      { l: this.t().datos[1], v: [c.sede.ciudad, c.sede.provincia].filter(Boolean).join(' (') + (c.sede.provincia ? ')' : ''), i: 'map-pin' as const },
      { l: this.t().datos[2], v: c.evento.nivel, i: 'trophy' as const },
      { l: this.t().datos[3], v: c.evento.organizador, i: 'user' as const },
    ];
  });
  protected readonly rel = computed<RelatedLink[]>(() => this.t().rel(this.anio(), this.siguiente()));
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const eds = await this.api.ediciones();
      const e = eds?.find((x) => String(x.anio) === this.anio() && x.estado === 'finalizado');
      if (!e) {
        this.comp.set(null);
        if (eds) this.noEncontrada(seo);
        return;
      }
      const [c, albums, pats] = await Promise.all([firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${e.slug}`)).catch(() => null), this.cms.galeria(), this.cms.patrocinadores()]);
      this.comp.set(c);
      // photos from the BO album of the year (Web › Blog y galería; the CMS only serves published ones)
      this.fotos.set(albums?.find((a) => a.slug.endsWith(this.anio()))?.fotos ?? []);
      // one tile per logo (the CMS repeats some, e.g. AEP), as on the poster (Figma 28). The Ajuntament d'Almussafes did not
      // sponsor 2025: the sponsor list is not per year, so it is filtered here for that edition.
      this.sponsors.set((pats ?? []).filter((p, i, a) => p.logoUrl && a.findIndex((x) => x.logoUrl === p.logoUrl || x.nombre === p.nombre) === i
        && !(this.anio() === '2025' && /almussafes/i.test(p.nombre))));
      if (c) {
        await applySeo(this.cms, seo, '/ediciones/' + this.anio(), this.t().seoT(this.anio()), this.t().seoD(fechas(c.fechaInicio, c.fechaFin, this.i18n.locale()), c.sede.ciudad, c.evento.descripcion), this.cartel() || undefined, {
          jsonLd: { '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nombre, sport: 'Powerlifting', startDate: c.fechaInicio, endDate: c.fechaFin, eventStatus: 'https://schema.org/EventScheduled',
            location: { '@type': 'Place', name: c.sede.nombre, address: c.sede.ciudad }, organizer: { '@type': 'Organization', name: c.evento.organizador } },
        });
      }
    });
  }
}

// ============================================================ /pantalla/:slug ===

const TP = {
  es: {
    enVivo: '● En directo', aContinuacion: 'A continuación',
    ...T.es, noVale: 'Este enlace de pantalla ya no vale.', copia: 'Copia el nuevo desde el backoffice: Directo › Pantalla del pabellón.', pausaD2: 'Volvemos enseguida', retraso2: (n: number) => ' · ' + n + ' min de retraso',
    webRes: 'Resultados en la web: /resultados', empezamos: (h: string) => 'Empezamos ' + h, enseguida: 'Enseguida empezamos', sigue: 'Sigue el directo', sigueD: '/en-directo · sigue a tus atletas y recibe aviso antes de que compitan',
  },
  en: {
    enVivo: '● Live', aContinuacion: 'Up next',
    ...T.en, noVale: 'This screen link is no longer valid.', copia: 'Copy the new one from the back office: Live › Venue screen.', pausaD2: 'We’ll be right back', retraso2: (n: number) => ' · ' + n + ' min late',
    webRes: 'Results online: /en/resultados', empezamos: (h: string) => 'Starting ' + h, enseguida: 'Starting shortly', sigue: 'Follow it live', sigueD: '/en/en-directo · follow your athletes and get an alert before they compete',
  },
};

/** Arena screen (Figma page 44 · «Pantalla del pabellón»): 1920 × 1080 scaled to the window, fed by the public SSE. */
@Component({
  selector: 'gr-pantalla',
  imports: [CdnPipe, GrLogo, DivisionPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed inset-0 overflow-hidden bg-[#0d0a0b]' },
  template: `
    @let p = data();
    <div class="absolute top-0 left-0 h-[1080px] w-[1920px] origin-top-left overflow-hidden bg-[radial-gradient(70%_80%_at_25%_30%,#3a0f17,#120d0f_70%)] text-white" [style.transform]="'scale(' + escala() + ')'">
      @if (p === 'enlace') {
        <div class="flex size-full flex-col items-center justify-center gap-6"><gr-logo [height]="120" /><p class="text-[40px]">{{ t().noVale }}</p><p class="text-[28px] text-white/60">{{ t().copia }}</p></div>
      } @else if (p) {
        @let d = p.directo;
        <header class="absolute top-[60px] left-[80px] flex items-center gap-8">
          <gr-logo [height]="76" />
          @if (d.fase === 'en_directo') { <span class="rounded-pill border border-accent/70 px-4 py-1.5 font-mono text-[18px] text-accent-text">{{ t().enVivo }}</span> }
          @if (d.sesion) { <span class="font-display text-[30px] text-white/70 uppercase italic">Sesión de las {{ d.sesion.hora }}</span> }
        </header>

        @if (d.fase === 'en_directo' && d.pausa) {
          <div class="absolute top-[300px] left-[80px]"><p class="font-display text-[150px] leading-none uppercase italic">{{ t().pausaT }}</p><p class="mt-6 text-[40px] text-white/70">{{ t().pausaD2 }}@if (d.retrasoMin) { {{ t().retraso2(d.retrasoMin) }} }</p></div>
        } @else if (d.fase === 'en_directo' && foco(); as a) {
          <div class="absolute top-[230px] left-[80px] w-[1180px]">
            <p class="overflow-hidden pt-[0.15em] font-display leading-[1.1] whitespace-nowrap uppercase italic" [style.font-size.px]="tamNombre(a.nombre)">{{ a.nombre }}</p>
            <p class="mt-6 font-display text-[40px] text-white/85 uppercase italic">{{ a.club ? a.club + ' · ' : '' }}{{ catLarga(a.sexo, a.categoria) }}@if (a.division) { · {{ a.division | division }} }</p>
            <p class="mt-3 font-display text-[44px] text-accent-text uppercase italic">{{ t().mov[a.movimiento] }} · {{ t().ord[a.numero] }} {{ t().intento }}</p>
            <div class="mt-6 flex items-center gap-10">
              <p class="font-display text-[260px] leading-[0.85] italic">{{ kg(a.peso) }}</p>
              <span class="self-end pb-8 font-display text-[60px] text-white/70 italic">KG</span>
              <div class="flex gap-6 self-center">@for (v of luces(); track $index) { <span class="size-[110px] rounded-pill border-4" [class]="v === 'B' ? 'border-white bg-white' : v === 'R' ? 'border-accent bg-accent' : 'border-white/25'"></span> }</div>
            </div>
          </div>
        } @else {
          <div class="absolute top-[300px] left-[80px] w-[1180px]">
            <p class="font-display text-[130px] leading-none uppercase italic">{{ d.fase === 'finalizado' ? '¡Gracias!' : p.nombre }}</p>
            <p class="mt-8 text-[44px] text-white/75">{{ d.fase === 'finalizado' ? t().webRes : d.proximo ? t().empezamos(diaHora(d.proximo.inicio)) : t().enseguida }}</p>
          </div>
        }

        <aside class="absolute top-[60px] right-[80px] flex w-[560px] flex-col gap-8">
          @if (p.pantalla.siguientes && d.fase === 'en_directo' && d.siguientes.length) {
            <section class="rounded-[24px] border border-white/10 bg-white/[0.04] p-8">
              <p class="font-display text-[28px] text-white/70 uppercase italic">{{ t().aContinuacion }}</p>
              @for (s of d.siguientes; track $index) { <p class="mt-5 flex justify-between font-display text-[34px] uppercase italic"><span class="truncate pr-4">{{ s.nombre }}</span><span class="text-accent-text">{{ kg(s.peso) }} kg</span></p> }
            </section>
          }
          @if (podio(); as c) {
            <section class="rounded-[24px] border border-white/10 bg-white/[0.04] p-8">
              <p class="font-display text-[28px] text-white/70 uppercase italic">Clasificación {{ c.corto }} kg</p>
              @for (f of c.filas.slice(0, 3); track $index) { <p class="mt-5 flex justify-between font-display text-[34px] uppercase italic"><span class="truncate pr-4"><span class="text-accent-text">{{ $index + 1 }}</span>  {{ f.nombre }}</span><span [class.text-white/60]="!f.total">{{ kg(f.total ?? f.subtotal) }}</span></p> }
            </section>
          }
        </aside>

        @if (p.pantalla.qr && qr()) {
          <section class="absolute right-[80px] bottom-[60px] flex w-[560px] items-center gap-6 rounded-[24px] border border-accent/50 bg-accent-deep/40 p-6">
            <img [src]="qr()" alt="Código QR" class="size-[150px] rounded-md bg-white p-2" />
            <div><p class="font-display text-[30px] uppercase italic">{{ t().sigue }}</p><p class="mt-2 text-[22px] text-white/75">{{ host() }}{{ t().sigueD }}</p></div>
          </section>
        }
        @if (p.pantalla.carrusel && sponsors().length) {
          <div class="absolute bottom-[70px] left-[80px] flex h-[90px] w-[1100px] flex-wrap content-start items-center gap-x-14 overflow-hidden">
            @for (s of visibles(); track s.nombre) { <img [src]="s.logoUrl | cdn" [alt]="s.nombre" class="h-[90px] w-auto max-w-[200px] object-contain py-[10px] opacity-90" /> }
          </div>
        }
      }
    </div>
  `,
})
export class PantallaPublicaPage {
  /** Name font that fits the 1180px column (≈0.44em per condensed capital), 150px at most: the full name, never «…». */
  protected tamNombre(n: string): number {
    return Math.max(72, Math.min(150, Math.floor(1180 / (n.length * 0.44))));
  }
  private readonly api = inject(DirectoPublic);
  private readonly cms = inject(Cms);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly data = signal<Pantalla | 'enlace' | null>(null);
  protected readonly escala = signal(1);
  protected readonly qr = signal('');
  protected readonly sponsors = signal<Patrocinador[]>([]);
  private readonly ahora = signal(Date.now());
  private readonly giro = signal(0);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(TP);
  protected readonly kg = (v?: number | null) => kg(v, this.i18n.lang());
  protected readonly catLarga = catLarga;
  protected readonly diaHora = (iso: string) => diaHora(iso, this.i18n.locale());
  protected readonly host = signal('');
  private readonly dir = computed(() => {
    const p = this.data();
    return p && p !== 'enlace' ? p.directo : null;
  });
  private readonly reciente = computed(() => {
    const u = this.dir()?.ultimo;
    return !!u?.juzgadoAt && this.ahora() - new Date(u.juzgadoAt).getTime() < 8000;
  });
  /** The judged attempt stays 8 s with its lights, then the next athlete. */
  protected readonly foco = computed<EnPlataforma | undefined>(() => (this.reciente() ? this.dir()?.ultimo : this.dir()?.actual));
  protected readonly luces = computed(() => [0, 1, 2].map((i) => (this.reciente() ? (this.dir()?.ultimo?.votos ?? '')[i] : '') ?? ''));
  protected readonly podio = computed<Categoria | undefined>(() => {
    const d = this.dir();
    const a = this.foco();
    return d?.clasificacion.find((c) => a && c.clave === a.sexo + a.categoria) ?? d?.clasificacion[0];
  });
  protected readonly visibles = computed(() => {
    const l = this.sponsors();
    const n = Math.min(5, l.length);
    return Array.from({ length: n }, (_, i) => l[(this.giro() + i) % l.length]);
  });

  constructor() {
    if (!this.browser) return;
    const slug = this.route.snapshot.paramMap.get('slug') ?? COMPETITION_SLUG;
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    const previa = this.route.snapshot.queryParamMap.has('previa');
    this.host.set(location.host);
    const ajustar = () => this.escala.set(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    ajustar();
    window.addEventListener('resize', ajustar);
    const cargar = async () => {
      const r = await this.api.pantalla(slug, token, previa);
      if (r) this.data.set(r);
    };
    void cargar();
    void this.cms.patrocinadores().then((p) => this.sponsors.set(p ?? []));
    void import('qrcode').then(async (m) => this.qr.set(await (m.default ?? m).toDataURL(location.origin + this.i18n.path('/en-directo'), { margin: 1, width: 300 })));
    const cerrar = escuchar(EVENTOS, () => void cargar());
    const tick = setInterval(() => this.ahora.set(Date.now()), 500);
    const poll = setInterval(() => void cargar(), 20_000); // also the «en línea» ping of the backoffice
    const rot = setInterval(() => this.giro.update((g) => g + 1), 8000);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', ajustar);
      cerrar();
      clearInterval(tick);
      clearInterval(poll);
      clearInterval(rot);
    });
  }
}
