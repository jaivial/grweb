import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrIconTile, type GrIconName } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { webPublica } from '../core/web';
import { BoCollection, type CollectionConfig } from '../shared/collection';
import type { FieldDef } from '../shared/schema-form';
import { BoPageHeader } from '../shared/ui';

// Colaboradores Refugio (Público): the hotels, apartments and restaurants of /donde-dormir-y-comer and the gyms of
// /como-llegar. The web follows every change live (SSE «web.hoteles_restaurantes» / «web.gimnasios»).

const AYUDA_SUBIDA = 'JPG, PNG o WebP de hasta 10 MB. Se sube al CDN (Bunny) y se guarda su URL.';

/** Fields of a place of the guide (same for both lists); images go through the upload of their own list. */
function camposSitio(lista: string): FieldDef[] {
  const subida = `/web/${lista}/imagen`;
  return [
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', max: 120 },
    { clave: 'detalle', etiqueta: 'Dirección', tipo: 'texto', max: 200, ayuda: 'Dirección y localidad, o «Tipo · localidad»' },
    { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'area', max: 1500 },
    { clave: 'precio', etiqueta: 'Precio o tarifa', tipo: 'texto', max: 160, ayuda: '«Tarifa GRS: 60 € en habitación doble», «Pase de día ~10 €»' },
    { clave: 'distancia', etiqueta: 'Distancia', tipo: 'texto', max: 80, ancho: 'mitad', ayuda: '«≈ 4 min en coche · 1,8 km»' },
    { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', max: 40, ancho: 'mitad' },
    { clave: 'email', etiqueta: 'Email', tipo: 'texto', max: 160, ancho: 'mitad' },
    { clave: 'web', etiqueta: 'Web', tipo: 'url', ancho: 'mitad' },
    { clave: 'maps', etiqueta: 'Enlace de Google Maps', tipo: 'url', ayuda: 'Vacío: el enlace «Mapa» busca el nombre y la dirección' },
    { clave: 'imagen', etiqueta: 'Foto', tipo: 'imagen', subida, ayuda: AYUDA_SUBIDA + ' Con foto, la tarjeta no muestra el logo.' },
    { clave: 'logo', etiqueta: 'Logo', tipo: 'imagen', subida, ayuda: AYUDA_SUBIDA },
    { clave: 'logoClaro', etiqueta: 'Logo claro (blanco o gris)', tipo: 'bool', ayuda: 'Se pinta sobre fondo oscuro en lugar de blanco' },
    { clave: 'logoOscuro', etiqueta: 'Logo para fondo negro (opcional)', tipo: 'imagen', subida, ayuda: '«Dónde entrenar» de /como-llegar pinta los logos sobre negro. ' + AYUDA_SUBIDA },
  ];
}

const TIPOS: Record<string, string> = { hotel: 'Hotel', apartamento: 'Apartamento', restaurante: 'Restaurante' };
const miniatura = { key: 'imagen', label: 'Imagen', kind: 'image' as const, value: (r: Record<string, unknown>) => String(r['imagen'] || r['logoOscuro'] || r['logo'] || '') };

export const HOTELES_RESTAURANTES: CollectionConfig = {
  title: 'Hoteles, apartamentos y restaurantes', subtitle: 'Se ven en /donde-dormir-y-comer (los hoteles también en /como-llegar), en este orden: arrastra para ordenar',
  path: '/web/hoteles-restaurantes', item: 'sitio', reorder: true, filterBy: 'tipo', en: ['detalle', 'precio', 'descripcion'],
  columns: [miniatura, { key: 'nombre', label: 'Nombre' },
    { key: 'tipo', label: 'Tipo', kind: 'badge', value: (r) => TIPOS[String(r['tipo'])] ?? String(r['tipo']), tone: (r) => (r['tipo'] === 'restaurante' ? 'info' : r['tipo'] === 'apartamento' ? 'warning' : 'accent') },
    { key: 'detalle', label: 'Dirección', hideMobile: true }],
  fields: [{ clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', ancho: 'mitad', opciones: Object.entries(TIPOS).map(([value, label]) => ({ value, label })) }, ...camposSitio('hoteles-restaurantes')],
  defaults: { tipo: 'hotel', logoClaro: false },
  empty: { title: 'Sin hoteles ni restaurantes', text: 'Añade los hoteles, apartamentos y restaurantes colaboradores cerca del pabellón.' },
};

export const GIMNASIOS: CollectionConfig = {
  title: 'Gimnasios de powerlifting', subtitle: 'Se ven en /donde-dormir-y-comer y en «Dónde entrenar» de /como-llegar, en este orden: arrastra para ordenar',
  path: '/web/gimnasios', item: 'gimnasio', reorder: true, en: ['detalle', 'precio', 'descripcion'],
  columns: [miniatura, { key: 'nombre', label: 'Nombre' }, { key: 'detalle', label: 'Dirección', hideMobile: true }],
  fields: camposSitio('gimnasios'),
  defaults: { logoClaro: false },
  empty: { title: 'Sin gimnasios', text: 'Añade los gimnasios colaboradores donde los atletas pueden entrenar los días previos.' },
};

interface Acceso { titulo: string; texto: string; icono: GrIconName; ruta: string; web: string }
const ACCESOS: Acceso[] = [
  { titulo: 'Dónde dormir y comer', texto: 'Hoteles, apartamentos y restaurantes colaboradores: tarifas, contacto, foto o logo y mapa.', icono: 'building', ruta: 'donde-dormir-y-comer', web: '/donde-dormir-y-comer' },
  { titulo: 'Gimnasios de powerlifting', texto: 'Gimnasios donde entrenar los días previos a la competición, con su logo, web y mapa.', icono: 'dumbbell', ruta: 'gimnasios', web: '/como-llegar#entrenar' },
];

/** /refugio: overview of Colaboradores Refugio with a quick link to each list. */
@Component({
  selector: 'bo-refugio',
  imports: [RouterLink, BoPageHeader, GrIcon, GrIconTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Colaboradores Refugio" subtitle="Hoteles, restaurantes y gimnasios que la web recomienda a atletas y público"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Colaboradores Refugio']" />
      <div class="grid gap-4 md:grid-cols-2">
        @for (a of accesos; track a.ruta) {
          <a [routerLink]="a.ruta" class="group flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5 transition-colors hover:border-line-hover hover:bg-bg-surface focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none md:p-6">
            <div class="flex items-center gap-3">
              <gr-icon-tile [icon]="a.icono" tone="accent" />
              <h2 class="min-w-0 flex-1 text-ui-h5">{{ a.titulo }}</h2>
              <gr-icon name="arrow-right" [size]="18" class="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-text-primary motion-reduce:transition-none" />
            </div>
            <p class="text-body-s text-text-tertiary">{{ a.texto }}</p>
            <p class="mt-auto text-mono-xs text-text-muted">{{ a.web }}</p>
          </a>
        }
      </div>
    </div>
  `,
})
export class RefugioPage {
  protected readonly comps = inject(Competitions);
  protected readonly accesos = ACCESOS;
}

/** One list of Colaboradores Refugio (route data «lista»: hoteles | gimnasios). */
@Component({
  selector: 'bo-refugio-lista',
  imports: [BoCollection, BoPageHeader, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = acceso();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header [title]="a.titulo" [subtitle]="a.texto"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Público', { label: 'Colaboradores Refugio', link: ['/', comps.current()?.slug, 'refugio'] }, a.titulo]">
        <ng-container actions><a grButton [href]="web + a.web" target="_blank" rel="noopener" icon="external-link">Ver en la web</a></ng-container>
      </bo-page-header>
      <bo-collection [config]="config()" />
    </div>
  `,
})
export class RefugioListaPage {
  protected readonly comps = inject(Competitions);
  protected readonly web = webPublica();
  /** Route data (withComponentInputBinding). */
  readonly lista = input<'hoteles' | 'gimnasios'>('hoteles');
  protected readonly config = computed(() => (this.lista() === 'gimnasios' ? GIMNASIOS : HOTELES_RESTAURANTES));
  protected readonly acceso = computed(() => ACCESOS[this.lista() === 'gimnasios' ? 1 : 0]);
}
