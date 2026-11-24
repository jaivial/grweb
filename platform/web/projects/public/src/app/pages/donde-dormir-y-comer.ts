import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, inject } from '@angular/core';
import { GrButton, GrIcon, type GrIconName, CdnPipe } from '@grcup/ui';
import { Cms } from '../core/cms';
import { I18n, LocPipe, type Lang } from '../core/i18n';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Related, type RelatedLink } from './landings';

/** A place of the guide: the lists below are data, change them there (no BO yet: see SeccionVisita/LugarVisita). */
export interface Sitio {
  nombre: string;
  /** «Dirección, localidad» or «Tipo · localidad». */
  detalle: string;
  /** English «detalle» when it is not just an address. */
  detalleEn?: string;
  /** «≈ 4 min en coche · 1,8 km». */
  distancia?: string;
  /** «Desde 65 €/noche», «Pase de día ~10 €». */
  precio?: string;
  web?: string;
  imagen?: string;
  /** Exact Google Maps link (overrides the search built by mapaDe). */
  maps?: string;
  descripcion?: string;
  descripcionEn?: string;
}
interface Seccion {
  id: string;
  eyebrow: Record<Lang, string>;
  titulo: Record<Lang, string>;
  texto: Record<Lang, string>;
  icono: GrIconName;
  sitios: Sitio[];
}

/** Google Maps search of a place (the «Mapa» link). */
export function mapaDe(s: Sitio): string {
  return s.maps || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.nombre}, ${s.detalle}`);
}

/** The «detalle» of a place in the given language. */
export function detalleDe(s: Sitio, lang: Lang): string {
  return (lang === 'en' && s.detalleEn) || s.detalle;
}

const T = {
  es: {
    titulo: 'Alojamientos cerca', acento: 'del pabellón', visita: 'Visita', seccion: 'Cómo llegar',
    mapa: 'Mapa', preparando: 'Estamos preparando la guía',
    pronto: 'Pronto publicaremos alojamientos, restaurantes y gimnasios cerca del pabellón. Mientras tanto, mira cómo llegar.', verComo: 'Ver cómo llegar',
    relacionados: [
      { titulo: 'Público', texto: 'Entrada y normas', ruta: '/publico' },
      { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
      { titulo: 'Preguntas frecuentes', texto: 'Resolvemos tus dudas', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    seoTitulo: 'Alojamientos cerca del pabellón · GRS Cup 2',
    seoDesc: 'Hoteles, apartamentos y restaurantes cerca del Pabellón Municipal de Almussafes y gimnasios de fuerza en Valencia para atletas y público de la GRS Cup 2.',
  },
  en: {
    titulo: 'Accommodation near', acento: 'the sports hall', visita: 'Visit', seccion: 'Getting there',
    mapa: 'Map', preparando: 'We’re putting the guide together',
    pronto: 'We’ll soon publish places to stay, restaurants and gyms near the sports hall. In the meantime, see how to get there.', verComo: 'See how to get there',
    relacionados: [
      { titulo: 'Spectators', texto: 'Tickets and rules', ruta: '/publico' },
      { titulo: 'Schedule', texto: 'Sessions by category', ruta: '/horarios' },
      { titulo: 'FAQ', texto: 'Answers to your questions', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    seoTitulo: 'Accommodation near the sports hall · GRS Cup 2',
    seoDesc: 'Hotels, apartments and restaurants near the Almussafes sports hall, and strength gyms in Valencia, for GRS Cup 2 athletes and spectators.',
  },
};

/**
 * /donde-dormir-y-comer (Figma 393:132672; without sections 393:136197): hotels, apartments, where to eat and gyms near
 * the venue, linked from /como-llegar?vista=alojamiento. An empty section is not painted.
 */
@Component({
  selector: 'gr-donde-dormir-page',
  imports: [CdnPipe, RouterLink, LocPipe, Page, GrIcon, GrButton, GrCabecera, Related],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [eyebrow]="t().visita" [section]="t().seccion" [crumb]="t().titulo">
      <div class="flex flex-col gap-12 md:gap-20">
        @for (b of secciones; track b.id; let i = $index) {
          <section [id]="b.id" class="flex scroll-mt-28 flex-col gap-6 md:gap-8">
            <gr-cabecera [eyebrow]="b.eyebrow[lang()]" [titulo]="b.titulo[lang()]" [texto]="b.texto[lang()]" [centro]="false" tam="m" />
            <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (s of b.sitios; track s.nombre) {
                <li class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                  @if (s.imagen) {
                  <div class="aspect-video bg-bg-elevated">
                    <img [src]="s.imagen | cdn" [alt]="s.nombre" class="size-full object-cover" loading="lazy" />
                  </div>
                  }
                  <div class="flex flex-1 flex-col gap-2 p-5">
                    <div class="flex items-center gap-2">
                      <gr-icon [name]="b.icono" [size]="18" class="shrink-0 text-accent-text" />
                      <h3 class="text-label-m">{{ s.nombre }}</h3>
                    </div>
                    <p class="text-body-s text-text-tertiary">{{ detalle(s) }}</p>
                    @if (s.descripcion) { <p class="text-body-s text-text-secondary">{{ lang() === 'en' ? s.descripcionEn || s.descripcion : s.descripcion }}</p> }
                    @if (s.distancia || s.precio) {
                      <p class="flex flex-wrap items-center gap-x-1.5 text-body-xs text-text-secondary">
                        @if (s.distancia) { <span>{{ s.distancia }}</span> }
                        @if (s.distancia && s.precio) { <span aria-hidden="true">·</span> }
                        @if (s.precio) { <span>{{ s.precio }}</span> }
                      </p>
                    }
                    <div class="mt-auto flex gap-4 pt-2">
                      @if (s.web) { <a [href]="s.web" target="_blank" rel="noopener nofollow" class="inline-flex items-center gap-1.5 text-label-s text-accent-text hover:underline">Web<gr-icon name="external-link" [size]="14" /></a> }
                      <a [href]="mapa(s)" target="_blank" rel="noopener nofollow" class="inline-flex items-center gap-1.5 text-label-s text-accent-text hover:underline">{{ t().mapa }}<gr-icon name="map-pin" [size]="14" /></a>
                    </div>
                  </div>
                </li>
              }
            </ul>
          </section>
        } @empty {
          <!-- Figma 393:136197 -->
          <div class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-12 text-center">
            <gr-icon name="building" [size]="28" class="text-text-tertiary" />
            <h2 class="text-ui-h4">{{ t().preparando }}</h2>
            <p class="max-w-md text-body-s text-text-tertiary">{{ t().pronto }}</p>
            <a grButton variant="outline" [routerLink]="'/como-llegar' | loc" icon="map-pin" class="mt-2">{{ t().verComo }}</a>
          </div>
        }
        <gr-related [items]="t().relacionados" />
      </div>
    </gr-page>
  `,
})
export class DondeDormirPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly lang = this.i18n.lang;
  protected readonly secciones = SECCIONES.filter((s) => s.sitios.length);
  protected readonly mapa = mapaDe;
  protected readonly detalle = (s: Sitio) => detalleDe(s, this.i18n.lang());

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(() =>
      applySeo(cms, seo, '/donde-dormir-y-comer', this.t().seoTitulo, this.t().seoDesc));
  }
}

// Provisional places (OpenStreetMap and the web of each place, November 2026): edit these lists.
const HOTELES: Sitio[] = [
  { nombre: 'Hotel Bartos', detalle: 'Carrer del Mestre Medina, Almussafes', web: 'https://www.hotelbartos.com/' },
  { nombre: 'Ramada by Wyndham Valencia Almussafes', detalle: 'Avinguda de la Foia, Almussafes', web: 'https://www.wyndhamhotels.com/es-xl/ramada/almussafes-spain/ramada-valencia-almussafes/overview' },
  { nombre: 'Hotel Isabel', detalle: 'Carrer de Salvador Botella, Almussafes' },
  { nombre: 'Pensión Nadal', detalle: 'Carrer de la Lira Almussafense, 6, Almussafes' },
];
const APARTAMENTOS: Sitio[] = [];
const RESTAURANTES: Sitio[] = [
  { nombre: 'Casa La Cuesta', detalle: "Carrer d'Ausiàs March, Almussafes" },
  { nombre: 'Cervecería Enjoy', detalle: "Ronda de l'Historiador Lluís Duart Alabarta, Almussafes" },
  { nombre: 'Bar Polideportivo', detalle: 'Ronda Antoni Ludeña, Almussafes' },
];
// BIZ-173: «Gimnasios de powerlifting» document + its Google Maps links (24 Nov 2026).
export const GIMNASIOS: Sitio[] = [
  { nombre: 'F.E.R Entrenamiento', detalle: 'Polígono Industrial Canyada dels Codonyers, calle 13, nº 11, nave 9, 46220 Picassent', web: 'https://ferentrenamiento.wodbuster.com', maps: 'https://maps.app.goo.gl/U6JRbXb7iw7wTuC78',
    descripcion: 'Abierto 24 h. 400 m² de material, clases de crosstraining y sala de musculación. Tarifa «Open Powerlifting» de 40 €/mes con acceso a la zona de material de competición.',
    descripcionEn: 'Open 24 h. 400 m² of equipment, crosstraining classes and a weights room. «Open Powerlifting» plan at €40/month with access to the competition equipment area.' },
  { nombre: 'NewQ Almussafes Fitness', detalle: 'Ronda Síndic Antoni Albuixech, 123, 46440 Almussafes', web: 'https://newquo.es', maps: 'https://maps.app.goo.gl/T5FYoVatjRhNw5Y76',
    descripcion: 'Gimnasio con clases colectivas variadas y monitores; máquinas nuevas tras una reforma.',
    descripcionEn: 'Gym with a variety of group classes and instructors; new machines after a refurbishment.' },
  { nombre: 'Valhalla Gym Almussafes', detalle: 'Carrer Sant Cristòfol, 61, Bajo, 46440 Almussafes', web: 'https://valhallagymalmussafes.es', maps: 'https://maps.app.goo.gl/7KYWNZ6vU88cCVJL8',
    descripcion: 'Gimnasio reciente con mucha variedad de máquinas.',
    descripcionEn: 'Recently opened gym with a wide variety of machines.' },
  { nombre: 'Pabellón Municipal de Almusafes', detalle: 'Avda. Laura Méndez, s/n, 46440 Almussafes', web: 'https://almussafes.es', maps: 'https://maps.app.goo.gl/aidcANg9ngd7qvoz7',
    descripcion: 'Centro deportivo municipal: pabellón cubierto con acceso por la CV-42 desde la AP-7.',
    descripcionEn: 'Municipal sports centre: indoor hall reached via the CV-42 from the AP-7.' },
  { nombre: 'The Factory Workout', detalle: 'Carrer Montroi, 10, 46450 Benifaió', web: 'https://mimpalawellness.com/tfw', maps: 'https://maps.app.goo.gl/yGipVmFfo4M9G4Dt9',
    descripcion: 'Sala fitness con máquinas de musculación y peso libre, clases dirigidas y asesoramiento nutricional.',
    descripcionEn: 'Fitness room with weight machines and free weights, group classes and nutrition advice.' },
  { nombre: '3D Valencia Centro Deportivo', detalle: 'Calle Cofrentes, 5, 46010 Valencia (tranvía Primado Reig, líneas 4/6)', detalleEn: 'Calle Cofrentes, 5, 46010 Valencia (Primado Reig tram stop, lines 4/6)', web: 'https://3dvalencia.es', maps: 'https://maps.app.goo.gl/AnFsLHhz2YyLt9YeA',
    descripcion: 'Gimnasio y entrenamiento personal, con asesoría online y amplia zona de máquinas.',
    descripcionEn: 'Gym and personal training, with online coaching and a large machine area.' },
];

const SECCIONES: Seccion[] = [
  { id: 'hoteles', eyebrow: { es: 'Dormir', en: 'Stay' }, titulo: { es: 'Hoteles *cerca*', en: 'Hotels *nearby*' }, texto: { es: 'A pocos minutos del pabellón. Reserva con tiempo: el fin de semana de la competición la zona se llena.', en: 'A few minutes from the sports hall. Book early: the area fills up on competition weekend.' }, icono: 'building', sitios: HOTELES },
  { id: 'apartamentos', eyebrow: { es: 'Dormir', en: 'Stay' }, titulo: { es: 'Apartamentos *turísticos*', en: 'Holiday *apartments*' }, texto: { es: 'Para equipos y grupos que vienen varios días.', en: 'For teams and groups staying several days.' }, icono: 'home', sitios: APARTAMENTOS },
  { id: 'comer', eyebrow: { es: 'Comer', en: 'Eat' }, titulo: { es: 'Dónde *comer*', en: 'Where to *eat*' }, texto: { es: 'Restaurantes y bares cerca del pabellón para antes y después de la competición.', en: 'Restaurants and bars near the sports hall for before and after the competition.' }, icono: 'star', sitios: RESTAURANTES },
  { id: 'gimnasios', eyebrow: { es: 'Entrenar', en: 'Train' }, titulo: { es: 'Gimnasios de powerlifting *donde entrenar*', en: 'Powerlifting gyms *to train at*' }, texto: { es: 'Gimnasios en Almussafes, Picassent, Benifaió y Valencia para entrenar los días previos.', en: 'Gyms in Almussafes, Picassent, Benifaió and Valencia to train at in the days before.' }, icono: 'trophy', sitios: GIMNASIOS },
];
