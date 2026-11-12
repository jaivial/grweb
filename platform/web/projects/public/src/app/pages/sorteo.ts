import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon, GrRaffleItem, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, FalloApi } from '../core/competition';
import { Seo } from '../core/seo';
import { GrCinturon } from '../home/sorteo';
import { Footer, Navbar } from '../layout/layout';
import { applySeo } from './content';

/** GET /api/competiciones/{slug}/rifa — cash ticket info (BO 60). */
interface Rifa { precioBoletoEfectivoCents: number; moneda: string; textoInfo: string; lugar: string; horario: string; fechaSorteo?: string; itemsVisibles: number }
/** GET /api/competiciones/{slug}/rifa/items — the objects raffled, in order. */
interface Item {
  id: string; nombre: string; descripcion: string; imagenUrl: string | null; valorEstimadoCents: number | null; donante: string | null; unidades: number;
  ganador: { boleto: string; nombre?: string } | null;
}

const BASE = `/api/competiciones/${COMPETITION_SLUG}/rifa`;
const BELT = 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp/frame_000085.webp';
const euros = (c: number) => (c % 100 ? (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : String(c / 100)) + ' €';
/** «19 dic a las 21:00». */
const diaHora = (iso: string) => {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(d).replace('.', '');
  const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(d);
  return `${dia} a las ${hora}`;
};

/** Section heading of /sorteo (Figma 07): display title, a short gradient rule (or an eyebrow with its dash) and the intro. */
@Component({
  selector: 'gr-sorteo-titulo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full max-w-[960px] flex-col items-center gap-6 text-center md:gap-10' },
  template: `
    <div class="flex flex-col items-center gap-4">
      @if (eyebrow()) { <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary"><span class="h-px w-7 bg-accent/60" aria-hidden="true"></span>{{ eyebrow() }}</p> }
      <h2 class="text-display-s [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-l">{{ titulo() }}</h2>
      @if (!eyebrow()) { <span class="h-0.5 w-18 bg-[linear-gradient(90deg,transparent,#c42b3e,transparent)] md:w-24" aria-hidden="true"></span> }
    </div>
    @if (texto()) { <p class="max-w-[640px] text-body-m text-text-tertiary md:text-body-l">{{ texto() }}</p> }
  `,
})
export class SorteoTitulo {
  readonly titulo = input.required<string>();
  readonly texto = input('');
  readonly eyebrow = input('');
}

/**
 * /sorteo (Figma 07 «Rifa · escaparate», D-RIFA): the raffle is only at the venue and in cash. Hero with the ticket
 * price, place and hours (BO 60), how it works, and the objects raffled (managed in the backoffice) or the empty state.
 */
@Component({
  selector: 'gr-sorteo',
  imports: [RouterLink, Navbar, Footer, GrButton, GrIcon, GrRaffleItem, GrSkeleton, GrCinturon, SorteoTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = rifa();
    <gr-navbar />
    <main class="relative">
      @if (r === undefined) { <div class="mx-auto max-w-[1200px] px-5 pt-28 md:pt-30"><gr-skeleton class="h-[554px] rounded-3xl" /></div> }
      @else if (r === null) {
        <div class="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-5 pt-[120px] pb-24 text-center md:pt-40">
          <h1 class="text-display-m md:text-display-l">Rifa</h1>
          @if (noPublicada()) { <p class="text-body-m text-text-tertiary">La rifa todavía no está publicada. Vuelve pronto: anunciaremos aquí los objetos que se rifan.</p> }
          @else {
            <p class="flex items-start gap-3 rounded-md border border-warning bg-warning/8 p-4 text-left text-body-s text-text-secondary" role="alert"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ fallo.limitado() ? 'Demasiadas visitas desde tu red: espera un minuto y vuelve a cargar la página.' : 'No hemos podido cargar la rifa. Vuelve a intentarlo en unos minutos.' }}</p>
          }
        </div>
      } @else {
        <!-- Figma «Section / Rifa (escaparate)» -->
        <section class="relative md:px-8 md:pt-24 md:pb-24 lg:px-20">
          <div class="h-[76px] md:hidden"></div>
          <div class="grain-acento relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 overflow-hidden bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] px-5 pt-5 pb-7 md:gap-5 md:rounded-3xl md:border md:border-accent/35 md:px-8 md:py-8 lg:flex-row lg:gap-14 lg:py-14 lg:pr-14 lg:pl-16">
            <div class="pointer-events-none absolute -top-30 right-[-80px] size-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(196_43_62/0.25),transparent)]" aria-hidden="true"></div>
            <div class="relative h-[260px] w-full shrink-0 md:h-[300px] lg:h-[440px] lg:w-[520px]">
              <div class="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[min(90%,468px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(196_43_62/0.35),transparent)]" aria-hidden="true"></div>
              <gr-cinturon class="absolute inset-x-[4%] inset-y-[9%] overflow-hidden rounded-2xl mix-blend-lighten [mask-image:radial-gradient(closest-side,#000_62%,transparent)]" [src]="belt" alt="Cinturón SBD" [prioridad]="true" />
              <span class="gr-flotar absolute top-1 right-3 flex size-24 flex-col items-center justify-center rounded-full bg-[linear-gradient(135deg,#c42b3e,#6e1420)] shadow-[0_8px_32px_rgb(196_43_62/0.5)] md:right-[22px] lg:top-2 lg:size-[148px]">
                <span class="text-display-m leading-none lg:text-display-l">{{ euros(r.precioBoletoEfectivoCents) }}</span><span class="text-label-xs">en efectivo</span>
              </span>
              <span class="absolute bottom-0 left-3 inline-flex h-7 items-center gap-1.5 rounded-pill border border-line-strong bg-bg-base px-3 text-label-xs text-text-secondary lg:bottom-6 lg:left-6"><gr-icon name="ticket" [size]="14" class="text-accent-text" />Boletos solo en el recinto</span>
            </div>
            <div class="relative flex w-full min-w-0 flex-col items-center gap-4 text-center [overflow-wrap:anywhere] lg:flex-1 lg:items-start lg:gap-5 lg:text-left">
              <p class="inline-flex items-center gap-2 text-label-xs text-text-secondary"><span class="size-2 shrink-0 rounded-full bg-success" aria-hidden="true"></span>Rifa presencial{{ r.fechaSorteo ? ' · sorteo el ' + diaHora(r.fechaSorteo) : '' }}</p>
              <h1 class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-m lg:text-display-l">Rifa solidaria GR Cup</h1>
              <p class="text-body-m text-text-tertiary lg:text-body-l">{{ r.textoInfo || 'Los boletos se compran solo en efectivo en el stand de la rifa, en el recinto, durante el evento. No hay venta online.' }} Mira los objetos que se rifan.</p>
              <div class="flex flex-col gap-2 text-[14px] leading-[1.2] text-text-secondary">
                <p class="font-semibold">Dónde y cuándo comprar boletos</p>
                @if (r.lugar) { <p>{{ r.lugar }}</p> }
                <p>{{ r.horario ? r.horario + ' · ' : '' }}{{ euros(r.precioBoletoEfectivoCents) }} el boleto</p>
              </div>
              <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <a grButton variant="display-gradient" size="l" class="gr-brillo" routerLink="." fragment="objetos">Ver objetos de la rifa</a>
                <a grButton variant="outline" size="l" routerLink="." fragment="normas">Ver normas</a>
              </div>
            </div>
          </div>
        </section>

        <!-- Cómo funciona la rifa -->
        <section id="normas" class="flex scroll-mt-20 flex-col items-center gap-6 px-5 py-16 md:gap-10 md:px-20 md:py-26">
          <gr-sorteo-titulo titulo="Cómo funciona la rifa" texto="Rifa solidaria y presencial: los boletos se compran en efectivo en el recinto el día del evento. No hay venta online." />
          <div class="grid w-full max-w-[1104px] gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
            @for (n of normas(); track n.t) {
              <div class="grain flex min-w-0 flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6">
                <span class="mb-2 flex size-10 items-center justify-center rounded-sm bg-accent/12 text-accent-text"><gr-icon [name]="n.i" [size]="20" /></span>
                <h3 class="text-ui-h5">{{ n.t }}</h3><p class="min-w-0 text-body-s text-text-tertiary [overflow-wrap:anywhere]">{{ n.d }}</p>
              </div>
            }
          </div>
          <div class="flex w-full max-w-[420px] flex-col items-center gap-2 rounded-md border border-accent/40 bg-accent/8 p-6 text-center">
            <p class="text-body-s text-text-tertiary">Precio del boleto</p>
            <p class="text-ui-h2 text-accent-text">{{ euros(r.precioBoletoEfectivoCents) }} el boleto</p>
            <p class="text-body-xs text-text-tertiary">En efectivo en el recinto · sin venta online</p>
          </div>
        </section>

        <!-- Objetos que se rifan (escaparate gestionado en el BO) -->
        <section id="objetos" class="flex scroll-mt-20 flex-col items-center gap-10 px-5 pb-16 md:px-20 md:pb-26">
          <div class="flex w-full max-w-[880px] flex-col items-center gap-4 text-center">
            <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary"><span class="h-px w-7 bg-accent/60" aria-hidden="true"></span>Escaparate</p>
            <h2 class="text-display-s [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-l">Objetos que se rifan</h2>
            <p class="text-body-m text-[#d1d6db]">Cada objeto se sortea por separado entre los boletos vendidos en el recinto. Gracias a los patrocinadores que los donan.</p>
          </div>
          @let it = items();
          @if (it === undefined) {
            <div class="grid w-full max-w-[1104px] gap-5 sm:grid-cols-2 lg:grid-cols-3">@for (k of [1, 2, 3]; track k) { <gr-skeleton class="h-[371px] rounded-lg" /> }</div>
          } @else if (it.length) {
            <ul class="flex w-full max-w-[1104px] flex-wrap justify-center gap-4 md:gap-5" aria-label="Objetos que se rifan">
              @for (i of it; track i.id) {
                <li class="flex w-full sm:w-[calc(50%-10px)] lg:w-[354px]">
                  <gr-raffle-item class="w-full transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-accent/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    [nombre]="i.nombre" [descripcion]="i.descripcion" [imagen]="i.imagenUrl" [unidades]="i.unidades"
                    [valor]="i.valorEstimadoCents ? euros(i.valorEstimadoCents) : null" [donante]="i.donante" [ganador]="i.ganador?.boleto ?? null" />
                </li>
              }
            </ul>
          } @else {
            <!-- Figma «estado vacío» -->
            <div class="flex w-full max-w-[368px] flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-8 text-center">
              <span class="flex size-12 items-center justify-center rounded-full bg-accent/16 text-accent-text"><gr-icon name="ticket" [size]="22" /></span>
              <h3 class="mt-1 text-display-xs">Aún no hay objetos en la rifa</h3>
              <p class="text-body-s text-text-tertiary">Pronto anunciaremos los objetos que se rifan. Los boletos se venden en efectivo en el recinto el día del evento.</p>
            </div>
          }
        </section>
      }
    </main>
    <gr-footer />
  `,
})
export class SorteoPage {
  private readonly http = inject(HttpClient);
  protected readonly fallo = inject(FalloApi);
  protected readonly rifa = signal<Rifa | null | undefined>(undefined);
  protected readonly items = signal<Item[] | undefined>(undefined);
  protected readonly noPublicada = signal(false);
  protected readonly euros = euros;
  protected readonly diaHora = diaHora;
  protected readonly belt = BELT;
  protected readonly normas = computed<{ t: string; d: string; i: GrIconName }[]>(() => {
    const r = this.rifa();
    if (!r) return [];
    const precio = euros(r.precioBoletoEfectivoCents);
    const lugar = r.lugar ? r.lugar.charAt(0).toLowerCase() + r.lugar.slice(1).replace(' · ', ', en el ') : 'stand de la rifa';
    return [
      { t: `${precio} el boleto`, d: 'Precio en efectivo fijado por la organización. Se paga en el stand de la rifa.', i: 'ticket' },
      { t: 'Solo en el recinto', d: `Los boletos se venden en el ${lugar}. No se venden por la web.`, i: 'infinity' },
      { t: 'Solo efectivo', d: 'Paga en efectivo al momento y guarda tu boleto de papel: es tu resguardo para reclamar el premio.', i: 'user' },
      { t: 'Horario de venta', d: r.horario ? `${r.horario}, mientras dure la competición.` : 'Mientras dure la competición.', i: 'shield' },
      { t: 'Sorteo presencial', d: `El sorteo se hace en directo en el recinto${r.fechaSorteo ? ' el ' + diaHora(r.fechaSorteo) : ''}, tras la entrega de premios. Cada objeto se sortea por separado.`, i: 'shuffle' },
      { t: 'Ganadores', d: 'Publicamos aquí el boleto ganador de cada objeto. Recogida en el stand de la rifa con el boleto.', i: 'globe' },
    ];
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      try {
        const [r, it] = await Promise.all([firstValueFrom(this.http.get<Rifa>(BASE)), firstValueFrom(this.http.get<{ items: Item[] }>(`${BASE}/items`))]);
        this.rifa.set(r);
        this.items.set(it.items);
      } catch (e) {
        this.rifa.set(null);
        if (e instanceof HttpErrorResponse && e.status === 404) this.noPublicada.set(true);
        else this.fallo.marcar(e);
      }
      const r = this.rifa();
      await applySeo(cms, seo, '/sorteo', 'Rifa solidaria · GR Strength Cup',
        r ? `Rifa presencial: boletos a ${euros(r.precioBoletoEfectivoCents)} en efectivo en el recinto. Mira los objetos que se rifan.` : 'Rifa presencial de la GR Strength Cup.');
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
      const datos = (e: Event) => { try { return JSON.parse((e as MessageEvent).data)?.datos; } catch { return undefined; } };
      es.addEventListener('rifa.items_actualizados', (e) => { const d = datos(e); if (Array.isArray(d?.items)) this.items.set(d.items); });
      es.addEventListener('rifa.config_actualizada', (e) => {
        const d = datos(e);
        if (d && d.visible === false) { this.rifa.set(null); this.noPublicada.set(true); } else if (d) this.rifa.set(d);
      });
      inject(DestroyRef).onDestroy(() => es.close());
    }
  }
}

