import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon, GrRaffleItem, GrSkeleton, esConReanudacion, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, FalloApi } from '../core/competition';
import type { Horarios } from '../core/horarios';
import { I18n } from '../core/i18n';
import { Seo } from '../core/seo';
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
const euros = (c: number, loc = 'es-ES') => (c % 100 ? (c / 100).toLocaleString(loc, { minimumFractionDigits: 2 }) : String(c / 100)) + ' €';
/** «19 dic a las 21:00» · «19 Dec at 21:00». */
const diaHora = (iso: string, utc = true, loc = 'es-ES') => {
  // schedule times are already local (Madrid): format them without shifting the zone
  const d = utc ? new Date(iso) : new Date(iso + 'Z');
  const tz = utc ? 'Europe/Madrid' : 'UTC';
  const dia = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: tz }).format(d).replace('.', '');
  const hora = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
  return `${dia} ${loc === 'es-ES' ? 'a las' : 'at'} ${hora}`;
};

const T = {
  es: {
    rifa: 'Rifa',
    noPublicada: 'La rifa todavía no está publicada. Vuelve pronto: anunciaremos aquí los objetos que se rifan.',
    limitado: 'Demasiadas visitas desde tu red: espera un minuto y vuelve a cargar la página.',
    fallo: 'No hemos podido cargar la rifa. Vuelve a intentarlo en unos minutos.',
    presencial: 'Rifa presencial',
    sorteoEl: ' · sorteo el ',
    titulo: 'Rifa solidaria GRS Cup',
    infoDef: 'Boletos solo en efectivo en el stand de la rifa, en el recinto, durante el evento.',
    dondeCuando: 'Dónde y cuándo comprar boletos',
    boleto: 'Boleto',
    verObjetos: 'Ver objetos de la rifa',
    verNormas: 'Ver normas',
    comoFunciona: 'Cómo funciona la rifa',
    escaparate: 'Escaparate',
    objetos: 'Objetos que se rifan',
    objetosTxt: 'Cada objeto se sortea por separado entre los boletos vendidos en el recinto. Gracias a los patrocinadores que los donan.',
    vacio1: 'Aún no hay objetos',
    vacio2: 'en la rifa',
    vacioTxt: (p: string) => `Pronto anunciaremos los objetos. Boleto · ${p} en efectivo en el stand de la rifa, en el recinto.`,
    normas: ['Solo en el recinto', 'Solo efectivo', 'Horario de venta', 'Sorteo presencial', 'Ganadores'],
    seoTitulo: 'Rifa solidaria · GRS Cup',
    seoDesc: (p: string) => `Rifa presencial: boletos a ${p} en efectivo en el recinto. Mira los objetos que se rifan.`,
    seoDef: 'Rifa presencial de la GRS Cup.',
  },
  en: {
    rifa: 'Raffle',
    noPublicada: 'The raffle has not been published yet. Check back soon: we will announce the prizes here.',
    limitado: 'Too many visits from your network: wait a minute and reload the page.',
    fallo: 'We could not load the raffle. Please try again in a few minutes.',
    presencial: 'On-site raffle',
    sorteoEl: ' · draw on ',
    titulo: 'GRS Cup charity raffle',
    infoDef: 'Tickets cash only at the raffle stand, at the venue, during the event.',
    dondeCuando: 'Where and when to buy tickets',
    boleto: 'Ticket',
    verObjetos: 'See the raffle prizes',
    verNormas: 'See the rules',
    comoFunciona: 'How the raffle works',
    escaparate: 'Showcase',
    objetos: 'Prizes in the raffle',
    objetosTxt: 'Each prize is drawn separately among the tickets sold at the venue. Thanks to the sponsors who donate them.',
    vacio1: 'No prizes',
    vacio2: 'in the raffle yet',
    vacioTxt: (p: string) => `We will announce the prizes soon. Ticket · ${p} in cash at the raffle stand, at the venue.`,
    normas: ['Only at the venue', 'Cash only', 'Sales hours', 'On-site draw', 'Winners'],
    seoTitulo: 'Charity raffle · GRS Cup',
    seoDesc: (p: string) => `On-site raffle: tickets at ${p} in cash at the venue. See the prizes in the raffle.`,
    seoDef: 'GRS Cup on-site raffle.',
  },
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
 * price, place and hours (BO 60), how it works, and the objects raffled  or the empty state.
 */
@Component({
  selector: 'gr-sorteo',
  imports: [RouterLink, Navbar, Footer, GrButton, GrIcon, GrRaffleItem, GrSkeleton, SorteoTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = rifa();
    <gr-navbar />
    <main class="relative">
      @if (r === undefined) { <div class="mx-auto max-w-[1200px] px-5 pt-28 md:pt-30"><gr-skeleton class="h-[554px] rounded-3xl" /></div> }
      @else if (r === null) {
        <div class="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-5 pt-[120px] pb-24 text-center md:pt-40">
          <h1 class="text-display-m md:text-display-l">{{ t().rifa }}</h1>
          @if (noPublicada()) { <p class="text-body-m text-text-tertiary">{{ t().noPublicada }}</p> }
          @else {
            <p class="flex items-start gap-3 rounded-md border border-warning bg-warning/8 p-4 text-left text-body-s text-text-secondary" role="alert"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ fallo.limitado() ? t().limitado : t().fallo }}</p>
          }
        </div>
      } @else {
        <!-- Figma «Section / Rifa (escaparate)» -->
        <section class="relative md:px-8 md:pt-24 md:pb-24 lg:px-20">
          <div class="h-[90px] md:hidden"></div>
          <div class="grain-acento relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 overflow-hidden bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] px-5 pt-5 pb-7 md:gap-5 md:rounded-3xl md:border md:border-accent/35 md:px-8 md:py-8 lg:flex-row lg:gap-14 lg:py-14 lg:pr-14 lg:pl-16">
            <div class="pointer-events-none absolute -top-30 right-[-80px] size-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(196_43_62/0.25),transparent)]" aria-hidden="true"></div>
            <div class="relative flex w-full min-w-0 flex-col items-center gap-4 text-center [overflow-wrap:anywhere] lg:max-w-[720px] lg:items-start lg:gap-5 lg:text-left">
              <p class="inline-flex items-center gap-2 text-label-xs text-text-secondary">{{ t().presencial }}{{ cuando() ? t().sorteoEl + cuando() : '' }}</p>
              <h1 class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-m lg:text-display-l">{{ t().titulo }}</h1>
              <p class="text-body-m text-text-tertiary lg:text-body-l">{{ r.textoInfo || t().infoDef }}</p>
              <div class="flex flex-col gap-2 text-body-m text-text-secondary">
                <p class="font-semibold">{{ t().dondeCuando }}</p>
                @if (r.lugar) { <p>{{ r.lugar }}</p> }
                <p>{{ r.horario ? r.horario + ' · ' : '' }}{{ t().boleto }} · {{ euros(r.precioBoletoEfectivoCents) }}</p>
              </div>
              <div class="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
                <a grButton variant="display-gradient" size="l" class="gr-brillo" routerLink="." fragment="objetos">{{ t().verObjetos }}</a>
                <a grButton variant="outline" size="l" routerLink="." fragment="normas">{{ t().verNormas }}</a>
              </div>
            </div>
          </div>
        </section>

        <!-- Cómo funciona la rifa -->
        <section id="normas" class="flex scroll-mt-20 flex-col items-center gap-6 px-5 py-16 md:gap-10 md:px-20 md:py-26">
          <gr-sorteo-titulo [titulo]="t().comoFunciona" />
          <div class="grid w-full max-w-[1104px] grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            @for (n of normas(); track n.t) {
              <div class="grain flex min-w-0 items-center gap-2.5 rounded-lg border border-line-subtle bg-bg-card p-3 md:gap-3 md:p-6 motion-safe:animate-[gr-hoja-in_240ms_ease-out_both]" [style.animation-delay.ms]="$index * 40">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent/12 text-accent-text"><gr-icon [name]="n.i" [size]="20" /></span>
                <h3 class="min-w-0 text-label-m [overflow-wrap:break-word] [hyphens:manual] md:text-ui-h5">{{ n.t }}</h3>
              </div>
            }
          </div>
        </section>

        <!-- Objetos que se rifan (escaparate gestionado en el BO) -->
        <section id="objetos" class="flex scroll-mt-20 flex-col items-center gap-10 px-5 pb-16 md:px-20 md:pb-26">
          <div class="flex w-full max-w-[880px] flex-col items-center gap-4 text-center">
            <p class="sr-only">{{ t().escaparate }}</p>
            <h2 class="text-display-s [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-l">{{ t().objetos }}</h2>
            <p class="text-body-m text-[#d1d6db]">{{ t().objetosTxt }}</p>
          </div>
          @let it = items();
          @if (it === undefined) {
            <div class="grid w-full max-w-[1104px] gap-5 sm:grid-cols-2 lg:grid-cols-3">@for (k of [1, 2, 3]; track k) { <gr-skeleton class="h-[371px] rounded-lg" /> }</div>
          } @else if (it.length) {
            <ul class="flex w-full max-w-[1104px] flex-wrap justify-center gap-4 md:gap-5" [attr.aria-label]="t().objetos">
              @for (i of it; track i.id) {
                <li class="flex w-full sm:w-[calc(50%-10px)] lg:w-[354px] motion-safe:animate-[gr-hoja-in_240ms_ease-out_both]" [style.animation-delay.ms]="$index * 40">
                  <gr-raffle-item class="w-full transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-accent/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    [nombre]="i.nombre" [descripcion]="i.descripcion" [imagen]="i.imagenUrl" [unidades]="i.unidades"
                    [valor]="i.valorEstimadoCents ? euros(i.valorEstimadoCents) : null" [donante]="i.donante" [ganador]="i.ganador?.boleto ?? null" />
                </li>
              }
            </ul>
          } @else {
            <!-- Figma «estado vacío» -->
            <div class="flex w-full max-w-[360px] flex-col items-center gap-3 rounded-lg motion-safe:animate-[gr-hoja-in_240ms_ease-out_both] border border-line-subtle bg-bg-card px-6 py-8 text-center">
              <span class="flex size-12 items-center justify-center rounded-full bg-accent/16 text-accent-text"><gr-icon name="gift" [size]="22" /></span>
              <h3 class="mt-1 text-display-xs">{{ t().vacio1 }}<br />{{ t().vacio2 }}</h3>
              <p class="text-body-s text-text-tertiary">{{ t().vacioTxt(euros(r.precioBoletoEfectivoCents)) }}</p>
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
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly fallo = inject(FalloApi);
  protected readonly rifa = signal<Rifa | null | undefined>(undefined);
  protected readonly items = signal<Item[] | undefined>(undefined);
  protected readonly noPublicada = signal(false);
  protected readonly euros = (c: number) => euros(c, this.i18n.locale());
  /** UX8-R1-10: one source for the draw time — the published schedule (same as /entradas), else the raffle config. */
  private readonly horarios = signal<Horarios | null>(null);
  protected readonly cuando = computed(() => {
    const loc = this.i18n.locale();
    for (const d of this.horarios()?.dias ?? []) {
      const a = d.agenda.find((x) => /sorteo/i.test(x.titulo)) ?? d.agenda.find((x) => x.icono === 'trophy');
      if (a) return diaHora(`${a.dia || d.fecha}T${a.hora}`, false, loc);
    }
    const f = this.rifa()?.fechaSorteo;
    return f ? diaHora(f, true, loc) : '';
  });
  protected readonly normas = computed<{ t: string; i: GrIconName }[]>(() => {
    const r = this.rifa();
    if (!r) return [];
    const n = this.t().normas;
    return [
      { t: `${this.t().boleto} · ${this.euros(r.precioBoletoEfectivoCents)}`, i: 'ticket' },
      { t: n[0], i: 'map-pin' },
      { t: n[1], i: 'info' },
      { t: n[2], i: 'clock' },
      { t: n[3], i: 'shuffle' },
      { t: n[4], i: 'trophy' },
    ];
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      try {
        const h = firstValueFrom(this.http.get<Horarios>(`/api/competiciones/${COMPETITION_SLUG}/horarios?resumen=true`)).catch(() => null);
        const [r, it] = await Promise.all([firstValueFrom(this.http.get<Rifa>(BASE)), firstValueFrom(this.http.get<{ items: Item[] }>(`${BASE}/items`))]);
        const hh = await h;
        this.horarios.set(hh?.publicado ? hh : null);
        this.rifa.set(r);
        this.items.set(it.items);
      } catch (e) {
        this.rifa.set(null);
        if (e instanceof HttpErrorResponse && e.status === 404) this.noPublicada.set(true);
        else this.fallo.marcar(e);
      }
      const r = this.rifa();
      const t = this.t();
      await applySeo(cms, seo, '/sorteo', t.seoTitulo, r ? t.seoDesc(this.euros(r.precioBoletoEfectivoCents)) : t.seoDef);
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const datos = (e: Event) => { try { return JSON.parse((e as MessageEvent).data)?.datos; } catch { return undefined; } };
      // Reopened on every come-back: iOS Safari leaves the stream dead after a freeze.
      const cerrar = esConReanudacion(() => {
        const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
        es.addEventListener('rifa.items_actualizados', (e) => { const d = datos(e); if (Array.isArray(d?.items)) this.items.set(d.items); });
        es.addEventListener('rifa.config_actualizada', (e) => {
          const d = datos(e);
          if (d && d.visible === false) { this.rifa.set(null); this.noPublicada.set(true); } else if (d) this.rifa.set(d);
        });
        return es;
      });
      inject(DestroyRef).onDestroy(() => cerrar());
    }
  }
}

