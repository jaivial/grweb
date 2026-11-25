import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GrIcon, type GrIconName, CdnPipe } from '@grcup/ui';
import { I18n } from '../core/i18n';
import { detalleDe, mapaDe, type Sitio } from './donde-dormir-y-comer';

/** Card grid of places (hotels, gyms…), shared by /donde-dormir-y-comer and /como-llegar. */
@Component({
  selector: 'gr-sitios',
  imports: [CdnPipe, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      @for (s of sitios(); track s.nombre) {
        <li class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
          @if (s.imagen) {
          <div class="aspect-video bg-bg-elevated">
            <img [src]="s.imagen | cdn" [alt]="s.nombre" class="size-full object-cover" loading="lazy" />
          </div>
          } @else if (s.logo) {
          <!-- BIZ-198: every logo in the same fixed-size box -->
          <div class="flex h-40 w-full items-center justify-center p-6" [class]="s.logoClaro ? 'bg-[#141112]' : 'bg-white'">
            <img [src]="s.logo" [alt]="s.nombre" class="max-h-full max-w-full object-contain" loading="lazy" />
          </div>
          } @else if (conLogo()) {
          <div class="flex h-40 w-full items-center justify-center bg-bg-elevated text-text-tertiary">
            <gr-icon [name]="icono()" [size]="40" />
          </div>
          }
          <div class="flex flex-1 flex-col gap-2 p-5">
            <div class="flex items-center gap-2">
              <gr-icon [name]="icono()" [size]="18" class="shrink-0 text-accent-text" />
              <h3 class="text-label-m">{{ s.nombre }}</h3>
            </div>
            <p class="text-body-s text-text-tertiary">{{ detalle(s) }}</p>
            @if (s.descripcion) { <p class="text-body-s text-text-secondary">{{ lang() === 'en' ? s.descripcionEn || s.descripcion : s.descripcion }}</p> }
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
            <div class="mt-auto flex gap-4 pt-2">
              @if (s.web) { <a [href]="s.web" target="_blank" rel="noopener nofollow" class="inline-flex items-center gap-1.5 text-label-s text-accent-text hover:underline">Web<gr-icon name="external-link" [size]="14" /></a> }
              <a [href]="mapa(s)" target="_blank" rel="noopener nofollow" class="inline-flex items-center gap-1.5 text-label-s text-accent-text hover:underline">{{ lang() === 'en' ? 'Map' : 'Mapa' }}<gr-icon name="map-pin" [size]="14" /></a>
            </div>
          </div>
        </li>
      }
    </ul>
  `,
})
export class Sitios {
  readonly sitios = input.required<Sitio[]>();
  readonly icono = input.required<GrIconName>();
  /** Some places of the list have a logo: give the ones without it the same-size box (with the icon). */
  readonly conLogo = input(false);
  private readonly i18n = inject(I18n);
  protected readonly lang = this.i18n.lang;
  protected readonly mapa = mapaDe;
  protected readonly detalle = (s: Sitio) => detalleDe(s, this.i18n.lang());
}
