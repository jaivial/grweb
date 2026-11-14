import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, inject } from '@angular/core';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
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
  /** «≈ 4 min en coche · 1,8 km». */
  distancia?: string;
  /** «Desde 65 €/noche», «Pase de día ~10 €». */
  precio?: string;
  web?: string;
  imagen?: string;
}
interface Seccion {
  id: string;
  eyebrow: string;
  titulo: string;
  texto: string;
  icono: GrIconName;
  sitios: Sitio[];
}

/** Google Maps search of a place (the «Mapa» link). */
export function mapaDe(s: Sitio): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.nombre}, ${s.detalle}`);
}

/**
 * /donde-dormir-y-comer (Figma 393:132672; without sections 393:136197): hotels, apartments, where to eat and gyms near
 * the venue, linked from /como-llegar?vista=alojamiento. An empty section is not painted.
 */
@Component({
  selector: 'gr-donde-dormir-page',
  imports: [RouterLink, Page, GrIcon, GrButton, GrCabecera, Related],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Alojamientos cerca" accent="del pabellón" eyebrow="Visita" section="Cómo llegar" crumb="Alojamientos cerca">
      <div class="flex flex-col gap-12 md:gap-20">
        @for (b of secciones; track b.id; let i = $index) {
          <section [id]="b.id" class="flex scroll-mt-28 flex-col gap-6 md:gap-8">
            <gr-cabecera [eyebrow]="b.eyebrow" [titulo]="b.titulo" [texto]="b.texto" [centro]="false" tam="m" />
            <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (s of b.sitios; track s.nombre) {
                <li class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                  <div class="aspect-video bg-bg-elevated">
                    @if (s.imagen) { <img [src]="s.imagen" [alt]="s.nombre" class="size-full object-cover" loading="lazy" /> }
                  </div>
                  <div class="flex flex-1 flex-col gap-2 p-5">
                    <div class="flex items-center gap-2">
                      <gr-icon [name]="b.icono" [size]="18" class="shrink-0 text-accent-text" />
                      <h3 class="text-label-m">{{ s.nombre }}</h3>
                    </div>
                    <p class="text-body-s text-text-tertiary">{{ s.detalle }}</p>
                    @if (s.distancia || s.precio) {
                      <p class="flex flex-wrap items-center gap-x-1.5 text-body-xs text-text-secondary">
                        @if (s.distancia) { <span>{{ s.distancia }}</span> }
                        @if (s.distancia && s.precio) { <span aria-hidden="true">·</span> }
                        @if (s.precio) { <span>{{ s.precio }}</span> }
                      </p>
                    }
                    <div class="mt-auto flex gap-4 pt-2">
                      @if (s.web) { <a [href]="s.web" target="_blank" rel="noopener nofollow" class="inline-flex items-center gap-1.5 text-label-s text-accent-text hover:underline">Web<gr-icon name="external-link" [size]="14" /></a> }
                      <a [href]="mapa(s)" target="_blank" rel="noopener nofollow" class="inline-flex items-center gap-1.5 text-label-s text-accent-text hover:underline">Mapa<gr-icon name="map-pin" [size]="14" /></a>
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
            <h2 class="text-ui-h4">Estamos preparando la guía</h2>
            <p class="max-w-md text-body-s text-text-tertiary">Pronto publicaremos alojamientos, restaurantes y gimnasios cerca del pabellón. Mientras tanto, mira cómo llegar.</p>
            <a grButton variant="outline" routerLink="/como-llegar" icon="map-pin" class="mt-2">Ver cómo llegar</a>
          </div>
        }
        <gr-related [items]="relacionados" />
      </div>
    </gr-page>
  `,
})
export class DondeDormirPage {
  protected readonly secciones = SECCIONES.filter((s) => s.sitios.length);
  protected readonly mapa = mapaDe;
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Público', texto: 'Entrada y normas', ruta: '/publico' },
    { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
    { titulo: 'Preguntas frecuentes', texto: 'Resolvemos tus dudas', ruta: '/preguntas-frecuentes' },
  ];

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(() =>
      applySeo(cms, seo, '/donde-dormir-y-comer', 'Alojamientos cerca del pabellón · GRS Cup 2',
        'Hoteles, apartamentos y restaurantes cerca del pabellón de Almussafes y gimnasios de fuerza en Valencia para atletas y público de la GRS Cup 2.'));
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
export const GIMNASIOS: Sitio[] = [
  { nombre: 'GR Strength Powerlifting Club', detalle: 'P. I. Canyada dels Codonyers, c/ 13, n.º 11, nave 9, Picassent', web: 'https://www.grteam.net/grs-powerlifting-club-valencia' },
  { nombre: 'Anvil Strength', detalle: 'Club de powerlifting · Puerto de Sagunto', web: 'https://anvilstrength.es/powerlifting-valencia' },
  { nombre: 'Titan Fitness Valencia', detalle: 'Fuerza y alto rendimiento · Valencia', web: 'https://www.instagram.com/titanfitnessvalencia' },
  { nombre: 'Fitness Park Valencia', detalle: 'Musculación y culturismo · Valencia', web: 'https://www.fitnesspark.es/valencia' },
];

const SECCIONES: Seccion[] = [
  { id: 'hoteles', eyebrow: 'Dormir', titulo: 'Hoteles *cerca*', texto: 'A pocos minutos del pabellón. Reserva con tiempo: el fin de semana de la competición la zona se llena.', icono: 'building', sitios: HOTELES },
  { id: 'apartamentos', eyebrow: 'Dormir', titulo: 'Apartamentos *turísticos*', texto: 'Para equipos y grupos que vienen varios días.', icono: 'home', sitios: APARTAMENTOS },
  { id: 'comer', eyebrow: 'Comer', titulo: 'Dónde *comer*', texto: 'Restaurantes y bares cerca del pabellón para antes y después de la competición.', icono: 'star', sitios: RESTAURANTES },
  { id: 'gimnasios', eyebrow: 'Entrenar', titulo: 'Gimnasios *para entrenar*', texto: 'Gimnasios de fuerza en Valencia y alrededores para entrenar los días previos.', icono: 'trophy', sitios: GIMNASIOS },
];
