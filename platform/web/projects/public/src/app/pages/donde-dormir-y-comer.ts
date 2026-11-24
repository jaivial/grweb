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
  /** English «precio». */
  precioEn?: string;
  telefono?: string;
  email?: string;
  /** Booking conditions / description, as given by the source. */
  nota?: string;
  /** English «nota». */
  notaEn?: string;
  /** Explicit Google Maps link (otherwise a search by name + detalle). */
  maps?: string;
  web?: string;
  imagen?: string;
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
                    @if (s.distancia || s.precio) {
                      <p class="flex flex-wrap items-center gap-x-1.5 text-body-xs text-text-secondary">
                        @if (s.distancia) { <span>{{ s.distancia }}</span> }
                        @if (s.distancia && s.precio) { <span aria-hidden="true">·</span> }
                        @if (s.precio) { <span>{{ (lang() === 'en' && s.precioEn) || s.precio }}</span> }
                      </p>
                    }
                    @if (s.telefono || s.email) {
                      <p class="flex flex-wrap items-center gap-x-1.5 text-body-xs text-text-secondary">
                        @if (s.telefono) { <a [href]="'tel:' + s.telefono.replaceAll(' ', '')" class="hover:underline">{{ s.telefono }}</a> }
                        @if (s.telefono && s.email) { <span aria-hidden="true">·</span> }
                        @if (s.email) { <a [href]="'mailto:' + s.email" class="hover:underline">{{ s.email }}</a> }
                      </p>
                    }
                    @if (s.nota) { <p class="text-body-xs text-text-tertiary">{{ (lang() === 'en' && s.notaEn) || s.nota }}</p> }
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

// Hotels: «Dónde alojarse» document (official hotel webs, 24 Nov 2026; GRS rates agreed by the group). Edit these lists.
const HOTELES: Sitio[] = [
  {
    nombre: 'Hotel Key Reig', detalle: 'Carrer dels Llauradors, 13, 46440 Almussafes, Valencia',
    precio: 'Tarifa GRS: 60 € en habitación doble (precio especial de grupo)', precioEn: 'GRS rate: €60 per double room (special group price)',
    telefono: '+34 615 872 444', email: 'info@hotelkeyreig.com',
    nota: 'Para reservar: llamar al hotel e indicar que se viene con el grupo GRS. Hotel urbano renovado, dentro del casco urbano de Almussafes y con buena conexión con la AP-7/A-7 hacia Valencia. 48 habitaciones con baño privado, TV y aire acondicionado: individuales, dobles y compartidas (hasta 4 personas). Wi-Fi de alta velocidad, desayuno tipo buffet, coworking, comedor, gimnasio, lavandería y traslado al aeropuerto. Acceso con código inteligente y check-in 24 horas.',
    notaEn: 'To book: call the hotel and say you are coming with the GRS group. Renovated urban hotel in the town centre of Almussafes, well connected to the AP-7/A-7 towards Valencia. 48 rooms with private bathroom, TV and air conditioning: single, double and shared (up to 4 people). High-speed Wi-Fi, buffet breakfast, coworking, dining room, gym, laundry and airport transfer. Smart-code access and 24-hour check-in.',
    web: 'https://www.hotelkeyreig.com/', maps: 'https://www.google.com/maps/search/?api=1&query=Hotel+Key+Reig+Almussafes',
  },
  {
    nombre: 'Ramada by Wyndham Valencia Almussafes', detalle: 'Avenida de la Foia, s/n, 46440 Almussafes, Valencia',
    precio: 'Tarifa GRS: 99 € con desayuno incluido (tarifa especial)', precioEn: 'GRS rate: €99 with breakfast included (special rate)',
    telefono: '+34 961 744 300', email: 'reservas@ramadavalencia.com',
    nota: 'Para reservar: indicar "reserva GRS" (enlace de reserva facilitado por el grupo). Hotel de 3 estrellas junto a la AP-7, a unos 30 km del aeropuerto de Valencia y al lado del parque empresarial Juan Carlos I y la factoría Ford. Piscina exterior, gimnasio 24 horas, restaurante de desayunos, bar, parking gratuito, Wi-Fi de alta velocidad, recepción 24 horas y salas para eventos.',
    notaEn: 'To book: say "reserva GRS" (booking link provided by the group). 3-star hotel next to the AP-7, about 30 km from Valencia airport, beside the Juan Carlos I business park and the Ford factory. Outdoor pool, 24-hour gym, breakfast restaurant, bar, free parking, high-speed Wi-Fi, 24-hour reception and event rooms.',
    web: 'https://ramada-wyndham-valencia-almussafes.bookstaygo.com/', maps: 'https://www.google.com/maps/search/?api=1&query=Ramada+by+Wyndham+Valencia+Almussafes',
  },
];
const APARTAMENTOS: Sitio[] = [];
const RESTAURANTES: Sitio[] = [];
export const GIMNASIOS: Sitio[] = [
  { nombre: 'GR Strength Powerlifting Club', detalle: 'P. I. Canyada dels Codonyers, c/ 13, n.º 11, nave 9, Picassent', web: 'https://www.grteam.net/grs-powerlifting-club-valencia' },
  { nombre: 'Anvil Strength', detalle: 'Club de powerlifting · Puerto de Sagunto', detalleEn: 'Powerlifting club · Puerto de Sagunto', web: 'https://anvilstrength.es/powerlifting-valencia' },
  { nombre: 'Titan Fitness Valencia', detalle: 'Fuerza y alto rendimiento · Valencia', detalleEn: 'Strength and high performance · Valencia', web: 'https://www.instagram.com/titanfitnessvalencia' },
  { nombre: 'Fitness Park Valencia', detalle: 'Musculación y culturismo · Valencia', detalleEn: 'Weight training and bodybuilding · Valencia', web: 'https://www.fitnesspark.es/valencia' },
];

const SECCIONES: Seccion[] = [
  { id: 'hoteles', eyebrow: { es: 'Dormir', en: 'Stay' }, titulo: { es: 'Hoteles *cerca*', en: 'Hotels *nearby*' }, texto: { es: 'Los dos hoteles de Almussafes con tarifa especial para el grupo GRS.', en: 'The two hotels in Almussafes with a special rate for the GRS group.' }, icono: 'building', sitios: HOTELES },
  { id: 'apartamentos', eyebrow: { es: 'Dormir', en: 'Stay' }, titulo: { es: 'Apartamentos *turísticos*', en: 'Holiday *apartments*' }, texto: { es: 'Para equipos y grupos que vienen varios días.', en: 'For teams and groups staying several days.' }, icono: 'home', sitios: APARTAMENTOS },
  { id: 'comer', eyebrow: { es: 'Comer', en: 'Eat' }, titulo: { es: 'Dónde *comer*', en: 'Where to *eat*' }, texto: { es: 'Restaurantes y bares cerca del pabellón para antes y después de la competición.', en: 'Restaurants and bars near the sports hall for before and after the competition.' }, icono: 'star', sitios: RESTAURANTES },
  { id: 'gimnasios', eyebrow: { es: 'Entrenar', en: 'Train' }, titulo: { es: 'Gimnasios *para entrenar*', en: 'Gyms *to train at*' }, texto: { es: 'Gimnasios de fuerza en Valencia y alrededores para entrenar los días previos.', en: 'Strength gyms in and around Valencia to train at in the days before.' }, icono: 'trophy', sitios: GIMNASIOS },
];
