import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrButton, GrIcon, type GrIconName, cdn, CdnPipe } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Lightbox } from '../layout/lightbox';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GIMNASIOS, detalleDe, mapaDe, type Sitio } from './donde-dormir-y-comer';


const T = {
  es: {
    titulo: 'Cómo llegar al', pabellonDe: (ciudad: string) => 'Pabellón de ' + ciudad, pabellon: 'pabellón', sede: 'Sede', crumb: 'Cómo llegar',
    subtitulo: 'Dirección, mapa, transporte desde Valencia y todo lo práctico para el día de la competición.', ubicacionOsm: 'Ubicación: OpenStreetMap · ',
    ubicacion: 'Ubicación', direccionMapa: 'Dirección y *mapa*', mapaDe: (n: string) => 'Mapa de ' + n,
    abrirMaps: 'Abrir en Google Maps', copiada: 'Dirección copiada', copiar: 'Copiar dirección',
    direccion: 'Dirección', coordenadas: 'Coordenadas', distancia: 'Distancia', puertas: 'Apertura de puertas',
    transporte: 'Transporte', comoLlegar: 'Cómo *llegar*', porConfirmar: 'Por confirmar',
    practica: 'Información práctica', aparcamiento: 'Aparcamiento *y accesibilidad*', laSede: 'La sede', fotosPabellon: 'Fotos del *pabellón*', ampliar: 'Ampliar: ',
    alojamiento: 'Alojamiento', dormirComer: 'Dónde *dormir y comer*', alojGim: 'Alojamientos y gimnasios cerca',
    alojTexto: 'Infórmate acerca de los mejores alojamientos y gimnasios para entrenar cerca del lugar de competición.', verAloj: 'Ver alojamientos cerca',
    entrenar: 'Entrenar', dondeEntrenar: 'Dónde *entrenar*', verWeb: 'Ver web', verMapa: 'Ver en el mapa',
    relacionados: [
      { titulo: 'Público', texto: 'Entrada y normas', ruta: '/publico' },
      { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
      { titulo: 'Preguntas frecuentes', texto: 'Resolvemos tus dudas', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    enValencia: 'En Valencia', rumbos: ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'],
    kmDe: (km: number, rumbo: string) => `≈ ${km} km al ${rumbo} de Valencia`,
    elPabellon: 'El pabellón', fotosAlt: ['Entrada del pabellón', 'La grada', 'Instalaciones', 'La pista central'],
    seoTitulo: 'Cómo llegar · GRS Cup 2',
    seoDesc: (nombre: string, ciudad: string) => `Cómo llegar al ${nombre} de ${ciudad}: mapa, coche, transporte público, aparcamiento y alojamiento.`,
  },
  en: {
    titulo: 'Getting to the', pabellonDe: (ciudad: string) => ciudad + ' Sports Hall', pabellon: 'sports hall', sede: 'Venue', crumb: 'Getting there',
    subtitulo: 'Address, map, transport from Valencia and everything practical for competition day.', ubicacionOsm: 'Location: OpenStreetMap · ',
    ubicacion: 'Location', direccionMapa: 'Address and *map*', mapaDe: (n: string) => 'Map of ' + n,
    abrirMaps: 'Open in Google Maps', copiada: 'Address copied', copiar: 'Copy address',
    direccion: 'Address', coordenadas: 'Coordinates', distancia: 'Distance', puertas: 'Doors open',
    transporte: 'Transport', comoLlegar: 'Getting *there*', porConfirmar: 'To be confirmed',
    practica: 'Practical information', aparcamiento: 'Parking *and accessibility*', laSede: 'The venue', fotosPabellon: 'Photos of the *sports hall*', ampliar: 'Enlarge: ',
    alojamiento: 'Accommodation', dormirComer: 'Where to *stay and eat*', alojGim: 'Accommodation and gyms nearby',
    alojTexto: 'Find out about the best places to stay and gyms to train at near the competition venue.', verAloj: 'See accommodation nearby',
    entrenar: 'Train', dondeEntrenar: 'Where to *train*', verWeb: 'Visit website', verMapa: 'View on the map',
    relacionados: [
      { titulo: 'Spectators', texto: 'Tickets and rules', ruta: '/publico' },
      { titulo: 'Schedule', texto: 'Sessions by category', ruta: '/horarios' },
      { titulo: 'FAQ', texto: 'Answers to your questions', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    enValencia: 'In Valencia', rumbos: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
    kmDe: (km: number, rumbo: string) => `≈ ${km} km ${rumbo} of Valencia`,
    elPabellon: 'The sports hall', fotosAlt: ['Entrance to the sports hall', 'The stands', 'Facilities', 'The main floor'],
    seoTitulo: 'Getting there · GRS Cup 2',
    seoDesc: (nombre: string, ciudad: string) => `How to get to ${nombre} in ${ciudad}: map, car, public transport, parking and accommodation.`,
  },
};

/** /como-llegar (Figma page 11, «ampliada»): address and map, transport, parking and accessibility, venue photos, where to stay. */
@Component({
  selector: 'gr-como-llegar-page',
  imports: [CdnPipe, RouterLink, LocPipe, Page, GrIcon, GrButton, GrCabecera, Related, Community, Lightbox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = comp();
    <gr-page [title]="t().titulo" [accent]="c ? t().pabellonDe(c.sede.ciudad) : t().pabellon" [eyebrow]="t().sede" [crumb]="t().crumb"
      [subtitle]="t().subtitulo" [stamp]="c ? t().ubicacionOsm + c.sede.nombre : ''">
      @if (c) {
        <!-- Jaime 16-nov: every section on one page (no «Vista» selector) -->
        <div class="flex flex-col gap-12 md:gap-20">
          <!-- 01 · Dirección y mapa -->
          <section id="mapa" class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().ubicacion" [titulo]="t().direccionMapa" [centro]="false" tam="m" />
            <div class="grid gap-6 lg:grid-cols-2">
              <article class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                <div class="relative aspect-[348/220] md:aspect-auto md:h-[300px]">
                  <img [src]="'/img/home/mapa.webp' | cdn" [alt]="t().mapaDe(c.sede.nombre)" class="absolute inset-0 size-full object-cover" loading="lazy" />
                  <span class="absolute right-2 bottom-2 rounded-[4px] bg-black/50 px-1.5 py-0.5 text-body-xs text-text-tertiary">© OpenStreetMap</span>
                </div>
                <div class="flex flex-col gap-3 p-5 md:p-7">
                  <h3 class="text-display-xs">{{ c.sede.nombre }}</h3>
                  <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="map-pin" [size]="16" class="shrink-0 text-accent-text" />{{ direccion() }}</p>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <a grButton variant="display-gradient" [href]="c.sede.mapsUrl" target="_blank" rel="noopener" icon="map-pin">{{ t().abrirMaps }}</a>
                    <button grButton variant="outline" type="button" (click)="copiar()">{{ copiado() ? t().copiada : t().copiar }}</button>
                  </div>
                </div>
              </article>
              <dl class="flex flex-col gap-3 self-start rounded-lg border border-line-subtle bg-bg-card p-6 lg:self-stretch">
                <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">{{ t().direccion }}</dt><dd class="text-label-m">{{ direccion() }}</dd></div>
                @if (c.sede.lat && c.sede.lng) { <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">{{ t().coordenadas }}</dt><dd class="text-label-m tabular-nums">{{ coord(c.sede.lat) }}, {{ coord(c.sede.lng) }}</dd></div> }
                @if (distancia()) { <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">{{ t().distancia }}</dt><dd class="text-label-m">{{ distancia() }}</dd></div> }
                @if (c.evento.puertas) { <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">{{ t().puertas }}</dt><dd class="text-label-m">{{ c.evento.puertas }}</dd></div> }
                @if (c.sede.lat && c.sede.lng) {
                  <div class="mt-1 flex flex-wrap gap-2">
                    <a grButton variant="outline" [href]="'https://maps.apple.com/?daddr=' + c.sede.lat + ',' + c.sede.lng + '&q=' + enc(c.sede.nombre)" target="_blank" rel="noopener">Apple Maps</a>
                    <a grButton variant="outline" [href]="'https://waze.com/ul?ll=' + c.sede.lat + ',' + c.sede.lng + '&navigate=yes'" target="_blank" rel="noopener">Waze</a>
                  </div>
                }
              </dl>
            </div>
          </section>

          <!-- 02 · Cómo llegar -->
          @if (transporte().length) {
            <section id="transporte" class="flex flex-col gap-5 md:gap-7">
              <gr-cabecera [eyebrow]="t().transporte" [titulo]="t().comoLlegar" [centro]="false" tam="m" />
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                @for (t of transporte(); track $index) {
                  <article class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5">
                    <div class="flex items-center gap-3">
                      <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="icono(t.tipo)" [size]="20" /></span>
                      <h3 class="text-label-m">{{ t.titulo }}</h3>
                    </div>
                    <p class="text-body-s text-text-tertiary">{{ t.detalle }}</p>
                    @if (t.nota || t.estado === 'por_confirmar') {
                      <p class="mt-auto flex items-center gap-1.5 pt-1 text-[13px] text-text-tertiary" [class.italic]="!t.nota"><gr-icon name="clock" [size]="13" class="shrink-0" />{{ t.nota || tx().porConfirmar }}</p>
                    }
                  </article>
                }
              </div>
            </section>
          }

          <!-- 03 · Aparcamiento y accesibilidad -->
          @if (practica().length) {
          <section id="aparcamiento" class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().practica" [titulo]="t().aparcamiento" [centro]="false" tam="m" />
            <div class="grid gap-4 lg:grid-cols-2">
              @for (t of practica(); track $index) {
                <article class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6">
                  <div class="flex items-center gap-3">
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="icono(t.tipo)" [size]="20" /></span>
                    <h3 class="text-ui-h5">{{ t.titulo }}</h3>
                  </div>
                  <p class="text-body-s text-text-tertiary">{{ t.detalle }}</p>
                  @if (t.estado === 'por_confirmar') { <p class="flex items-center gap-1.5 text-[13px] text-text-tertiary italic"><gr-icon name="clock" [size]="13" class="shrink-0" />{{ tx().porConfirmar }}</p> }
                  @if (t.nota) { <p class="text-body-xs text-text-secondary">{{ t.nota }}</p> }
                </article>
              }
            </div>
          </section>
          }

          <!-- 04 · Fotos del pabellón -->
          <section id="fotos" class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().laSede" [titulo]="t().fotosPabellon" [centro]="false" tam="m" />
            <ul class="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0" (scroll)="alDesplazar($event)">
              @for (f of fotos(); track f.imagen; let i = $index) {
                <li class="relative aspect-[300/220] w-[300px] shrink-0 snap-center overflow-hidden rounded-lg border border-white/8 md:aspect-[288/190] md:w-auto">
                  <button type="button" class="group absolute inset-0 cursor-zoom-in" [attr.aria-label]="t().ampliar + f.alt" (click)="ver.set(i)">
                    <img [src]="f.imagen" [alt]="f.alt" class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  </button>
                </li>
              }
            </ul>
            <gr-lightbox [fotos]="fotos()" [(indice)]="ver" />
            <div class="flex items-center gap-1.5 md:hidden" aria-hidden="true">
              @for (f of fotos(); track f.imagen; let i = $index) { <span class="h-1.5 rounded-pill transition-all" [class]="i === foto() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
            </div>
          </section>

          <!-- 05 · Alojamiento (Figma 393:130556) -->
          <section id="alojamiento" class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().alojamiento" [titulo]="t().dormirComer" [centro]="false" tam="m" />
            <article class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
              <div class="flex items-center gap-3">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="building" [size]="20" /></span>
                <h3 class="text-label-m">{{ t().alojGim }}</h3>
              </div>
              <p class="text-body-s text-text-tertiary">{{ t().alojTexto }}</p>
              <a grButton variant="outline" size="l" class="mt-1 w-full sm:w-auto sm:self-start" [routerLink]="'/donde-dormir-y-comer' | loc">{{ t().verAloj }}</a>
            </article>
          </section>
          <section id="entrenar" class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera [eyebrow]="t().entrenar" [titulo]="t().dondeEntrenar" [centro]="false" tam="m" />
            <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              @for (g of gimnasios; track g.nombre) {
                <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5">
                  <div class="flex items-center gap-3">
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="trophy" [size]="20" /></span>
                    <h3 class="text-label-m">{{ g.nombre }}</h3>
                  </div>
                  <p class="text-body-s text-text-tertiary">{{ detalle(g) }}</p>
                  <a [href]="g.web || mapa(g)" target="_blank" rel="noopener nofollow" class="mt-auto inline-flex items-center gap-1.5 pt-1 text-label-s text-accent-text hover:underline">{{ g.web ? t().verWeb : t().verMapa }}<gr-icon name="external-link" [size]="14" /></a>
                </li>
              }
            </ul>
          </section>

          <gr-related [items]="t().relacionados" />
          <gr-community />
        </div>
      }
    </gr-page>
  `,
})
export class ComoLlegarPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  /** Same dictionary, for the @for blocks whose item is called «t». */
  protected readonly tx = this.t;
  protected readonly comp = signal<CompeticionPublica | null>(null);
  protected readonly copiado = signal(false);
  protected readonly foto = signal(0);
  /** Photo open in the lightbox (−1: closed). */
  protected readonly ver = signal(-1);
  protected readonly gimnasios = GIMNASIOS;
  protected readonly mapa = mapaDe;
  protected readonly detalle = (s: Sitio) => detalleDe(s, this.i18n.lang());
  protected readonly enc = encodeURIComponent;
  private readonly fotosCms = signal<{ imagen: string; alt?: string }[]>([]);
  protected readonly fotos = computed(() =>
    this.fotosCms().length
      ? this.fotosCms().map((f) => ({ imagen: f.imagen, alt: f.alt || this.t().elPabellon }))
      : FOTOS_SEDE.map((f, i) => ({ ...f, alt: this.t().fotosAlt[i] ?? f.alt })),
  );
  protected readonly direccion = computed(() => {
    const s = this.comp()?.sede;
    return s ? [s.direccion, [s.cp, s.ciudad].filter(Boolean).join(' ') + (s.provincia ? ` (${s.provincia})` : '')].filter(Boolean).join(' · ') : '';
  });
  /** «≈ 16 km al sur de Valencia» (straight line from the city centre). */
  protected readonly distancia = computed(() => {
    const s = this.comp()?.sede;
    if (!s?.lat || !s?.lng) return '';
    const [la1, lo1, la2, lo2] = [VALENCIA[0], VALENCIA[1], s.lat, s.lng].map((x) => (x * Math.PI) / 180);
    const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
    const km = Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
    if (km < 3) return this.t().enValencia;
    const ang = (Math.atan2(Math.sin(lo2 - lo1) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1)) * 180) / Math.PI;
    const rumbo = this.t().rumbos[Math.round(((ang + 360) % 360) / 45) % 8];
    return this.t().kmDe(km, rumbo);
  });
  protected readonly transporte = computed(() => (this.comp()?.comoLlegar ?? []).filter((t) => !PRACTICA.includes(t.tipo)));
  protected readonly practica = computed(() => {
    return (this.comp()?.comoLlegar ?? []).filter((t) => PRACTICA.includes(t.tipo));
  });
  constructor() {
    const competition = inject(Competition);
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const [c, home] = await Promise.all([competition.load(), cms.home().catch(() => null)]);
      this.comp.set(c);
      // the venue photos are the ones of the home «Localización» section (one place to edit them)
      const loc = home?.secciones?.['localizacion'];
      const imgs = (loc?.['imagenes'] as { imagen?: string; alt?: string }[] | undefined) ?? [];
      this.fotosCms.set(imgs.filter((x) => x?.imagen).map((x) => ({ imagen: x.imagen!, alt: x.alt })).slice(0, 4));
      await applySeo(cms, seo, '/como-llegar', this.t().seoTitulo, this.t().seoDesc(c?.sede.nombre ?? this.t().pabellon, c?.sede.ciudad ?? 'Almussafes'));
    });
  }
  protected icono(tipo: string): GrIconName {
    return ({ coche: 'car', tren: 'train', metro: 'train', avion: 'plane', bus: 'bus', bici: 'bike', parking: 'parking', accesibilidad: 'accessibility' } as Record<string, GrIconName>)[tipo] ?? 'map-pin';
  }
  protected coord(n: number): string {
    return n.toFixed(4).replace('-', '−');
  }
  protected alDesplazar(e: Event): void {
    this.foto.set(Math.round((e.target as HTMLElement).scrollLeft / 312));
  }
  protected copiar(): void {
    const c = this.comp();
    void navigator.clipboard?.writeText(`${c?.sede.nombre}, ${this.direccion().replace(' · ', ', ')}`).then(() => {
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2500);
    });
  }
}

const VALENCIA = [39.4699, -0.3763];
const PRACTICA = ['parking', 'accesibilidad'];
export const FOTOS_SEDE = [
  { imagen: cdn('/img/home/sede-exterior-s.webp'), alt: 'Entrada del pabellón' },
  { imagen: cdn('/img/home/sede-grada.webp'), alt: 'La grada' },
  { imagen: cdn('/img/home/sede-instalaciones.webp'), alt: 'Instalaciones' },
  { imagen: cdn('/img/home/sede-pista.webp'), alt: 'La pista central' },
];
