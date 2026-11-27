/**
 * directo-social/porra-view.ts — pestaña «Porra» del panel del directo (Figma 171:70257): acceso para jugar (o el saldo
 * del nivel), la misma navegación que /porra (sexo → nivel AEP-2 / AEP-3 → grupo) con el resumen de cada mercado
 * (el top 3 en vivo de /porra, con «Ver más») y la llamada «Apostar en la porra». El estado vive en la URL, junto a
 * `?tab=porra`: ?sexo, ?prueba y ?grupo.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession } from '../../core/fan';
import { I18n, LocPipe } from '../../core/i18n';
import { JuegosEnVivo, JuegosEstado, PorraStore, monedas, seguirMercadosEnVivo, type Mercado } from '../../core/juegos';
import { MercadoResumen, etiquetaDeMercado } from '../porra/mercado-resumen';
import { PRUEBA_TXT, PorraNavegacion, filtrosPorra, mercadosDe, saldoNivelTxt } from '../porra/navegacion';
import { GrCoin } from './ui';

const T = {
  es: {
    entra: 'Entra para jugar con tus monedas',
    entrar: 'Entrar y jugar',
    nunca: 'Monedas de juego: nunca se compran con dinero.',
    porra: 'porra',
    titulo: 'Porra',
    apostar: 'Apostar en la porra',
    sinMercado: (n: string) => `No hay mercados de ${n} para este grupo.`,
    error: 'No hemos podido cargar la porra.',
    fantasy: 'Ficha 5 titulares con 1.000.000 de monedas',
    abrir: 'Abrir',
  },
  en: {
    entra: 'Sign in to play with your coins',
    entrar: 'Sign in and play',
    nunca: 'Game coins: never bought with money.',
    porra: 'pool',
    titulo: 'Pool',
    apostar: 'Bet in the pool',
    sinMercado: (n: string) => `There are no ${n} markets for this group.`,
    error: 'We could not load the pool.',
    fantasy: 'Sign 5 starters with 1,000,000 coins',
    abrir: 'Open',
  },
};

@Component({
  selector: 'gr-porra-view',
  imports: [RouterLink, LocPipe, GrIcon, GrButton, GrSkeleton, GrCoin, PorraNavegacion, MercadoResumen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]">
      <!-- saldo del nivel elegido: la cartera de su jornada -->
      @if (!fan.conSesion()) {
        <div class="flex shrink-0 flex-col gap-3">
          <p class="text-label-m text-text-primary">{{ t().entra }}</p>
          <button type="button" grButton variant="primary" [block]="true" (click)="fan.abrirAcceso('porra')">{{ t().entrar }}</button>
        </div>
      } @else if (cartera(); as c) {
        <div class="shrink-0 rounded-md border border-accent/30 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-3.5">
          <p class="font-mono text-[11px] font-medium tracking-[0.08em] text-accent-text uppercase">{{ etiquetaSaldo() }}</p>
          <p class="mt-2.5 flex flex-wrap gap-2">
            <gr-coin>{{ monedas(c.porra) }} {{ t().porra }}</gr-coin>
            <gr-coin tipo="fantasy">{{ monedas(c.fantasy) }} fantasy</gr-coin>
          </p>
          <p class="mt-2.5 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" class="shrink-0" />{{ t().nunca }}</p>
        </div>
      } @else {
        <gr-skeleton class="h-28 shrink-0 rounded-md" />
      }

      <!-- porra: sexo → nivel → grupo, con el resumen de cada mercado del grupo -->
      <div class="flex shrink-0 flex-col gap-3 pt-1">
        <p class="bg-[linear-gradient(180deg,#ff5a6e,#c8102e)] bg-clip-text pr-1 font-display text-[1.25rem] leading-none text-transparent uppercase italic">{{ t().titulo }}</p>
        <gr-porra-navegacion ruta="/en-directo" [mercados]="store.mercadosDeNivel(nav().prueba)" [sexo]="nav().sexo" [grupo]="nav().grupo" [prueba]="nav().prueba" />

        @if (store.cargando()) {
          <div class="flex flex-col gap-2"><gr-skeleton class="h-12 rounded-md" /><gr-skeleton class="h-12 rounded-md" /><gr-skeleton class="h-12 rounded-md" /></div>
        } @else if (store.error()) {
          <p class="flex items-center gap-2 rounded-md border border-line-subtle bg-bg-raised p-3 text-body-s text-text-tertiary"><gr-icon name="circle-alert" [size]="16" class="shrink-0" />{{ t().error }}</p>
        } @else if (mercadosGrupo().length) {
          @for (m of mercadosGrupo(); track m.id) {
            <gr-mercado-resumen [mercado]="m" [etiqueta]="etiqueta(m)" />
          }
        } @else {
          <p class="py-4 text-center text-body-xs text-text-tertiary" role="status">{{ t().sinMercado(nivelTxt()) }}</p>
        }

        <a grButton variant="primary" size="l" [block]="true" [routerLink]="'/porra' | loc" iconRight="arrow-right"
          [queryParams]="{ vista: 'hacer', sexo: nav().sexo, prueba: nav().prueba, grupo: nav().grupo }">{{ t().apostar }}</a>
      </div>

      <!-- llamada -->
      <div class="flex shrink-0 flex-col gap-2 pt-1">
        <a class="flex min-h-14 items-center gap-3 rounded-md border border-info/40 bg-info/6 px-3 py-2.5 transition-colors hover:border-info/70" [routerLink]="'/fantasy' | loc">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-info/14 text-info"><gr-icon name="star" [size]="18" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-label-s text-text-primary">GRS Fantasy</span>
            <span class="block text-body-xs text-text-tertiary">{{ t().fantasy }}</span>
          </span>
          <span class="inline-flex shrink-0 items-center gap-1 text-label-s text-info">{{ t().abrir }} <gr-icon name="arrow-right" [size]="14" /></span>
        </a>
      </div>
    </div>
  `,
})
export class PorraView {
  protected readonly fan = inject(FanSession);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly store = inject(PorraStore);
  private readonly estado = inject(JuegosEstado);
  private readonly vivo = inject(JuegosEnVivo);
  private readonly route = inject(ActivatedRoute);
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  protected readonly nav = computed(() => filtrosPorra(this.qp()));
  protected readonly cartera = computed(() => this.store.carteraDe(this.nav().prueba));
  protected readonly etiquetaSaldo = computed(() => saldoNivelTxt(this.nav().prueba, this.i18n.lang()));
  protected readonly nivelTxt = computed(() => PRUEBA_TXT[this.nav().prueba]);
  protected readonly mercadosGrupo = computed(() => mercadosDe(this.store.mercadosDeNivel(this.nav().prueba), this.nav().sexo, this.nav().grupo, this.nav().prueba));
  protected readonly monedas = (v: number | null | undefined) => monedas(v, this.i18n.lang());

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.estado.cargar().then(() => this.store.cargar());
      void this.fan.cargar().then(() => this.store.cargarCarteras());
      // los dos niveles a la vez: el stream sin filtro de jornada
      this.vivo.sinFiltroJornada();
      // en vivo como /porra: los cambios `porra.mercado` se aplican al momento y, como los botes cambian con cada
      // porra, un refresco ligero cada 20 s
      seguirMercadosEnVivo(
        (c) => this.store.aplicarCambio(c),
        () => void this.store.recargarMercados(),
      );
      const t = setInterval(() => {
        if (!document.hidden) void this.store.recargarMercados();
      }, 20000);
      inject(DestroyRef).onDestroy(() => clearInterval(t));
    }
  }

  protected etiqueta(m: Mercado): string {
    return etiquetaDeMercado(m, this.i18n.lang());
  }
}
