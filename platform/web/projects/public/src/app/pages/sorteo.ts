import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon, GrLogo, GrRaffleItem, GrRaffleNotice, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, Competition, FalloApi } from '../core/competition';
import { Seo } from '../core/seo';
import { SecSorteo } from '../home/sorteo';
import { Footer, Navbar, instagramOf } from '../layout/layout';
import { Page } from '../layout/page';
import { applySeo } from './content';

interface Publico {
  estado: 'en_venta' | 'proximamente' | 'cerrada' | 'agotada' | 'bloqueada' | 'sorteado'; motivo?: string; premio: string; premioDetalle: string; premioImagen: string; premioValor: number;
  precio: number; maxPorPersona: number; presets: number[]; vendidos: number; totalMax?: number; ventaHasta?: string; fechaSorteo?: string; pasarela: 'stripe' | 'simulado' | 'ninguna';
  ganador?: { numero: string; nombre: string; at: string };
  verificacion?: { semillaHash: string; hashLista: string; total: number; semilla?: string; indice?: number; estado: string };
}
interface EstadoCompra { id: string; estado: 'pendiente' | 'pagada' | 'fallida' | 'caducada' | 'reembolsada'; nombre: string; email: string; cantidad: number; importe: number; boletos: string[]; tarjeta?: string; pruebas: boolean }

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const euros = (c: number) => eur.format(c / 100).replace(',00', '');
const fechaLarga = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : 'por confirmar');
const BASE = `/api/competiciones/${COMPETITION_SLUG}/sorteo`;
/** «Se hace en directo el viernes, 20 de noviembre, 06:45.» — or, without a date yet, where it will be announced. */
const cuando = (iso?: string) => (iso ? `Se hace en directo el ${fechaLarga(iso)}.` : 'Se hace en directo; anunciaremos la fecha en la web y en Instagram.');

/** Section heading of /sorteo (Figma 07): display title with its red part, a soft shadow and a short gradient rule. */
@Component({
  selector: 'gr-sorteo-titulo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center gap-6 text-center md:gap-10' },
  template: `
    <div class="flex flex-col items-center gap-4">
      @if (eyebrow()) { <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase">{{ eyebrow() }}</p> }
      <h2 class="text-display-s [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-l">{{ titulo() }}@if (acento()) { {{ ' ' }}<span class="text-accent-text">{{ acento() }}</span> }</h2>
      @if (!eyebrow()) { <span class="h-0.5 w-18 bg-[linear-gradient(90deg,transparent,#c42b3e,transparent)] md:w-24" aria-hidden="true"></span> }
    </div>
    @if (texto()) { <p class="max-w-[640px] text-body-m text-text-tertiary md:text-body-l">{{ texto() }}</p> }
  `,
})
export class SorteoTitulo {
  readonly titulo = input.required<string>();
  readonly acento = input('');
  readonly texto = input('');
  readonly eyebrow = input('');
}

/** Section frame of /sorteo: Figma 104/80 (desktop) and 64/20 (mobile). */
const SECCION = 'flex flex-col items-center gap-6 px-5 py-16 md:gap-10 md:px-20 md:py-26';

/** /sorteo (Figma page 07): the prize, the rules, how to take part and the result. Tickets are sold only at the venue, in cash. */
@Component({
  selector: 'gr-sorteo',
  imports: [RouterLink, Navbar, Footer, GrButton, GrIcon, GrRaffleItem, GrRaffleNotice, GrSkeleton, SecSorteo, SorteoTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = data();
    <gr-navbar />
    <main class="relative">
      @if (s === undefined) { <div class="mx-auto max-w-[1200px] px-5 pt-28 md:pt-30"><gr-skeleton class="h-[583px] rounded-3xl" /></div> }
      @else if (s === null) {
        <div class="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-5 pt-[120px] pb-24 text-center md:pt-40">
          <h1 class="text-display-m md:text-display-l">Sorteo</h1>
          <p class="flex items-start gap-3 rounded-md border border-warning bg-warning/8 p-4 text-left text-body-s text-text-secondary" role="alert"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ fallo.limitado() ? 'Demasiadas visitas desde tu red: espera un minuto y vuelve a cargar la página.' : 'No hemos podido cargar el sorteo. Vuelve a intentarlo en unos minutos.' }}</p>
        </div>
      } @else {
        <!-- Figma «Section / Sorteo» (the same panel as the home, as the page's hero) -->
        <div class="h-[76px] md:hidden"></div>
        <gr-sec-sorteo [sorteo]="s" [pagina]="true" />

        <!-- Normas del sorteo -->
        <section id="normas" [class]="seccion + ' scroll-mt-20'">
          <gr-sorteo-titulo titulo="Normas" acento="del sorteo" texto="Simple, justo y transparente. Aquí tienes lo que necesitas saber; las bases completas están en la política del concurso." />
          <div class="grid w-full max-w-[1104px] gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
            @for (r of normas(); track r.t) {
              <div class="flex min-w-0 flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6">
                <span class="flex size-10 items-center justify-center rounded-sm bg-accent/12 text-accent-text"><gr-icon [name]="r.i" [size]="20" /></span>
                <p class="mt-2 text-ui-h5">{{ r.t }}</p><p class="min-w-0 text-body-s text-text-tertiary [overflow-wrap:anywhere]">{{ r.d }}</p>
              </div>
            }
          </div>
          <div class="flex w-full max-w-[420px] flex-col items-center gap-2 rounded-md border border-accent bg-accent/8 p-6 text-center">
            <p class="text-body-s text-text-tertiary">¿Cuánto cuesta?</p>
            <p class="text-ui-h2 text-accent-text">{{ euros(s.precio) }} por boleto</p>
            <p class="text-body-xs text-text-tertiary">Más boletos, más posibilidades · máx. {{ s.maxPorPersona }} por persona</p>
          </div>
          <a routerLink="/politica-concurso" class="text-label-s text-accent-text hover:underline">Leer las bases del sorteo →</a>
        </section>

        <!-- Cómo participar: zigzag timeline on desktop, a rail on the left on mobile -->
        <section [class]="seccion">
          <gr-sorteo-titulo titulo="Cómo" acento="participar" [texto]="'¡Es rápido y fácil! Sigue estos ' + pasos().length + ' pasos para entrar en el sorteo.'" />
          <ol class="relative flex w-full max-w-[960px] flex-col gap-4 md:gap-6">
            <span class="absolute top-5 bottom-5 left-[19px] w-0.5 bg-[linear-gradient(180deg,#c42b3e,rgb(196_43_62/0.15))] md:left-1/2 md:-translate-x-1/2" aria-hidden="true"></span>
            @for (p of pasos(); track p.t; let i = $index; let par = $even) {
              <li class="relative flex items-center gap-4 md:gap-8" [class.md:flex-row-reverse]="!par">
                <div class="order-2 flex min-w-0 flex-1 flex-col gap-2 rounded-md border border-line-subtle bg-bg-card p-6 md:order-none md:max-w-[428px]">
                  <span class="flex size-7 items-center justify-center rounded-full bg-accent text-label-xs">{{ i + 1 }}</span>
                  <h3 class="mt-1 text-ui-h4">{{ p.t }}</h3><p class="text-body-s text-text-tertiary [overflow-wrap:anywhere]">{{ p.d }}</p>
                </div>
                <span class="relative z-10 order-1 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-bg-base text-text-primary md:order-none"><gr-icon [name]="p.i" [size]="18" /></span>
                <span class="hidden flex-1 md:block md:max-w-[428px]"></span>
              </li>
            }
          </ol>
        </section>

        <!-- Resultados -->
        <section id="resultados" [class]="seccion + ' scroll-mt-20'">
          <gr-sorteo-titulo titulo="Resultados" />
          <div class="flex w-full max-w-[520px] flex-col items-center gap-3 rounded-lg border p-7 text-center" [class]="s.ganador ? 'border-accent/50 bg-[linear-gradient(150deg,#4a121c,#1b1112_70%)]' : 'border-line-subtle bg-bg-card'">
            @if (s.ganador; as g) {
              <p class="text-mono-xs tracking-[0.2em] text-text-tertiary">BOLETO GANADOR</p>
              <p class="font-display text-[72px] leading-none text-accent-text italic">{{ g.numero }}</p>
              <p class="w-full text-ui-h4 [overflow-wrap:anywhere]">{{ g.nombre }}</p><p class="w-full text-body-s text-text-tertiary [overflow-wrap:anywhere]">¡Enhorabuena! · {{ s.premio }}</p>
            } @else {
              <span class="flex size-16 items-center justify-center rounded-full bg-[radial-gradient(circle,rgb(196_43_62/0.25),transparent_70%)] text-accent-text"><gr-icon name="trophy" [size]="28" /></span>
              <p class="mt-1 text-display-xs">Ganador pendiente</p>
              <p class="text-body-s text-text-tertiary">{{ cuando(s.fechaSorteo) }} Publicaremos aquí el boleto ganador.</p>
            }
          </div>
          @if (s.estado === 'en_venta') {
            <p class="w-full max-w-[520px] rounded-md border border-accent bg-accent/8 p-6 text-left text-body-s">Cuantos más boletos compres, más oportunidades tienes de ganar.</p>
            <div class="flex flex-col items-center gap-10">
              <p class="text-body-s text-text-tertiary">¿Quieres ser nuestro próximo ganador?</p>
              <a grButton variant="primary" size="l" routerLink="." fragment="participa">Cómo participar</a>
            </div>
          }
        </section>

        <!-- Premio -->
        <section [class]="seccion + ' md:pt-0'">
          <gr-sorteo-titulo eyebrow="Premio del sorteo" titulo="Participa para ganar" acento="este premio" />
          <!-- Figma «Tarjeta item rifa» + «Aviso · Rifa presencial» (the item showcase from the BO arrives with U13) -->
          <gr-raffle-item class="w-full max-w-[360px]" [nombre]="s.premio" [descripcion]="s.premioDetalle" [imagen]="s.premioImagen || null"
            [valor]="s.premioValor ? euros(s.premioValor) : null" [ganador]="s.ganador?.numero ?? null" />
          <gr-raffle-notice class="w-full max-w-[360px]" [href]="null">Además, el día de la competición hay rifa en la sede: los boletos se compran allí y solo en efectivo.</gr-raffle-notice>
        </section>

        <!-- Boletos: solo en la sede y en efectivo (no hay venta online) -->
        <section id="participa" [class]="seccion + ' scroll-mt-20'">
          <gr-sorteo-titulo titulo="Boletos" acento="en la sede" [texto]="'Así participas en el sorteo de la ' + nombreComp() + '.'" />
          <div class="w-full max-w-[560px] rounded-[20px] border border-line-subtle bg-bg-card p-5 shadow-[0_24px_60px_rgb(0_0_0/0.45)] md:p-7">
            <div class="flex flex-col items-center gap-3 py-2 text-center">
              @if (s.estado === 'en_venta') {
                <gr-icon name="ticket" [size]="24" class="text-accent-text" /><p class="text-ui-h5">Boletos en la sede, solo en efectivo</p>
                <p class="text-body-s text-text-secondary">No hay venta online: compra tus boletos el día de la competición en el pabellón, en efectivo. {{ euros(s.precio) }} por boleto · máx. {{ s.maxPorPersona }} por persona.</p>
                <a routerLink="/como-llegar" class="text-label-s text-accent-text hover:underline">Cómo llegar →</a>
              } @else {
                <gr-icon name="lock" [size]="24" class="text-text-tertiary" /><p class="text-ui-h5">{{ estadoTitulo[s.estado] }}</p><p class="text-body-s text-text-secondary">{{ s.motivo }}</p>
                <a href="#novedades" (click)="irNovedades($event)" class="text-label-s text-accent-text hover:underline">Avísame por email →</a>
              }
            </div>
          </div>
        </section>
      }
    </main>
    <gr-footer />
  `,
})
export class SorteoPage {
  private readonly http = inject(HttpClient);
  protected readonly fallo = inject(FalloApi);
  private readonly comp = inject(Competition);
  protected readonly data = signal<Publico | null | undefined>(undefined);
  protected readonly seccion = SECCION;
  protected readonly euros = euros;
  protected readonly fechaLarga = fechaLarga;
  protected readonly lista = `${BASE}/lista.txt`;
  protected readonly nombreComp = computed(() => this.comp.data()?.nombre ?? 'GR Strength Cup');
  protected readonly estadoTitulo: Record<string, string> = { proximamente: 'La venta abrirá pronto', cerrada: 'La venta ha terminado', agotada: 'Boletos agotados', bloqueada: 'Venta en preparación', sorteado: 'El sorteo ya se hizo' };
  protected readonly pasos = computed<{ t: string; d: string; i: GrIconName }[]>(() => {
    const s = this.data();
    return [
      { t: 'Ven a la sede', d: `El día de la competición, en el pabellón. Cada boleto cuesta ${euros(s?.precio ?? 100)} (hasta ${s?.maxPorPersona ?? 10} por persona).`, i: 'ticket' },
            { t: 'Paga en efectivo', d: 'Solo en efectivo, en el punto de venta de la sede. Guarda tu boleto: el número es tu participación.', i: 'credit-card' },
      { t: 'Síguenos en Instagram', d: 'Opcional: allí anunciamos el sorteo y el ganador.', i: 'instagram' },
      { t: 'Espera al sorteo', d: 'Se hace en directo, con la lista y la semilla publicadas para que cualquiera lo compruebe.', i: 'clock' },
    ];
  });
  protected readonly normas = computed<{ t: string; d: string; i: GrIconName }[]>(() => {
    const s = this.data();
    if (!s) return [];
    return [
      { t: `${euros(s.precio)} por boleto`, d: 'Cada boleto es un número más en el sorteo.', i: 'ticket' },
      { t: `Hasta ${s.maxPorPersona} boletos por persona`, d: 'Para que participe más gente.', i: 'users' },
      { t: 'Un ganador', d: 'Un único premio: ' + (s.premio || 'por confirmar') + '.', i: 'trophy' },
      { t: 'Solo presencial', d: 'Los boletos se venden en la sede y solo en efectivo; no hay venta online.', i: 'lock' },
      { t: 'Selección aleatoria y verificable', d: 'Lista y semilla publicadas antes de sortear.', i: 'shield' },
      { t: 'Solo mayores de 18', d: 'Para participar tienes que tener 18 años o más.', i: 'gift' },
    ];
  });
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      try {
        const [s] = await Promise.all([firstValueFrom(this.http.get<Publico>(BASE)), this.comp.load()]);
        this.data.set(s);
      } catch (e) {
        this.data.set(null);
        if (!(e instanceof HttpErrorResponse && e.status === 404)) this.fallo.marcar(e);
      }
      const s = this.data();
      await applySeo(cms, seo, '/sorteo', 'Sorteo · GR Strength Cup', s ? `Participa en el sorteo de un ${s.premio} por ${euros(s.precio)} el boleto. Sorteo en directo.` : 'Sorteo de la GR Strength Cup.');
    });
    if (this.browser) {
      const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
      const recargar = () => void firstValueFrom(this.http.get<Publico>(BASE)).then((s) => this.data.set(s)).catch(() => undefined);
      es.addEventListener('sorteo.ganador', recargar);
      es.addEventListener('sorteo.estado', recargar);
      inject(DestroyRef).onDestroy(() => es.close());
    }
  }
  protected readonly cuando = cuando;
  protected n(v: number): string { return new Intl.NumberFormat('es-ES').format(v); }
  protected irNovedades(e: Event): void {
    e.preventDefault();
    document.querySelector('gr-newsletter input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/** /sorteo/confirmacion?compra=…&t=… — after paying (Figma 09 «/success»): summary, next steps, share; waits for the payment confirmation. */
@Component({
  selector: 'gr-sorteo-confirmacion',
  imports: [RouterLink, Page, GrButton, GrIcon, GrLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = compra();
    <gr-page title="Tus boletos" [centrado]="true" [cabecera]="false">
      <div class="mx-auto flex w-full max-w-[560px] flex-col items-center gap-6 text-center md:gap-8 md:pt-3">
        @if (c === undefined || c?.estado === 'pendiente') {
          <!-- Figma 09 «Verificando» -->
          <div class="flex min-h-[40vh] flex-col items-center justify-center gap-4" aria-live="polite">
            <span class="size-12 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" aria-hidden="true"></span>
            <h1 class="text-body-s text-text-secondary">Verificando tu compra…</h1>
            @if (c) { <p class="text-body-xs text-text-muted">Tarda unos segundos. No cierres esta página.</p> }
          </div>
        } @else if (c === null || c.estado === 'fallida' || c.estado === 'caducada') {
          <!-- Figma 09 «Error» -->
          <div class="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-6">
            <span class="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent-text"><gr-icon name="x" [size]="22" /></span>
            <h1 class="text-ui-h4">{{ c === null ? 'No encontramos esta compra' : 'Algo salió mal' }}</h1>
            <p class="max-w-[440px] text-body-s text-text-tertiary">{{ c === null ? 'Revisa el enlace del email. Si has pagado y no te llega, escríbenos.' : 'El pago no se completó y no se ha cobrado nada. Si crees que es un error, escríbenos.' }}</p>
            <div class="mt-2 flex flex-wrap justify-center gap-3">
              <a grButton variant="primary" routerLink="/sorteo" fragment="participa">Reintentar</a>
              <a grButton variant="outline" routerLink="/">Volver al inicio</a>
            </div>
          </div>
        } @else if (c.estado === 'reembolsada') {
          <div class="flex flex-col items-center gap-4 py-6">
            <span class="flex size-12 items-center justify-center rounded-full bg-info/15 text-info"><gr-icon name="info" [size]="22" /></span>
            <h1 class="text-ui-h4">Compra reembolsada</h1>
            <p class="text-body-s text-text-tertiary">Te hemos devuelto el importe y estos boletos ya no participan.</p>
            <a grButton variant="outline" routerLink="/sorteo">Volver al sorteo</a>
          </div>
        } @else {
          <!-- Figma 09 «Pago completado» -->
          <gr-logo [height]="97" class="hidden md:block" />
          <span class="flex size-18 items-center justify-center rounded-full bg-success/12 text-success"><gr-icon name="circle-check" [size]="36" /></span>
          <div class="flex flex-col gap-3">
            <h1 class="text-ui-h3 md:text-ui-h2">Pago completado</h1>
            <p class="text-body-m text-text-tertiary">Tu participación en el sorteo ha sido confirmada.@if (c.pruebas) { {{ ' ' }}Modo pruebas: no se ha cobrado nada. }</p>
          </div>
          <section class="flex w-full flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6 text-left">
            <h2 class="text-ui-h5">Resumen</h2>
            <p class="flex justify-between gap-4 text-body-s"><span class="text-text-tertiary">Nombre</span><span>{{ c.nombre }}</span></p>
            <p class="flex justify-between gap-4 text-body-s"><span class="text-text-tertiary">Email</span><span class="truncate">{{ c.email }}</span></p>
            <p class="flex justify-between gap-4 text-body-s"><span class="text-text-tertiary">Boletos</span><span>{{ c.cantidad }}</span></p>
            @if (c.tarjeta) { <p class="flex justify-between gap-4 text-body-s"><span class="text-text-tertiary">Pago</span><span>{{ c.tarjeta }}</span></p> }
            <p class="flex justify-between gap-4 text-body-s"><span class="text-text-tertiary">Total</span><span class="text-label-m text-accent-text">{{ eurFmt(c.importe) }}</span></p>
            <div class="mt-1 flex flex-col gap-2 border-t border-line-subtle pt-4">
              <p class="text-label-s text-text-secondary">Tus números</p>
              <div class="flex flex-wrap gap-2">@for (b of c.boletos; track b) { <span class="rounded-md border border-accent/50 bg-bg-base/60 px-3 py-1.5 font-display text-[24px] leading-none italic">{{ b }}</span> }</div>
            </div>
          </section>
          <section class="flex w-full flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6 text-left">
            <h2 class="text-ui-h5">Siguientes pasos</h2>
            @for (p of siguientes(); track p) { <p class="flex gap-2.5 text-body-s text-text-secondary"><gr-icon name="check" [size]="16" class="mt-0.5 shrink-0 text-accent-text" />{{ p }}</p> }
          </section>
          <div class="flex flex-col items-center gap-4">
            <p class="text-label-s text-text-tertiary">Comparte con tus amigos</p>
            <div class="flex flex-wrap justify-center gap-2">
              @for (r of redes; track r.n) { <a [href]="r.url" target="_blank" rel="noopener" class="flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-white"><gr-icon name="send" [size]="16" />{{ r.n }}</a> }
              <button type="button" class="flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-white" (click)="copiar()"><gr-icon name="copy" [size]="16" />{{ copiado() ? 'Copiado' : 'Copiar enlace' }}</button>
            </div>
          </div>
          <a grButton variant="primary" size="l" routerLink="/">Volver al inicio</a>
        }
      </div>
    </gr-page>
  `,
})
export class SorteoConfirmacionPage {
  private readonly http = inject(HttpClient);
  private readonly comp = inject(Competition);
  protected readonly compra = signal<EstadoCompra | null | undefined>(undefined);
  protected readonly fechaSorteo = signal<string | undefined>(undefined);
  protected readonly copiado = signal(false);
  protected readonly eurFmt = (c: number) => eur.format(c / 100);
  private readonly enlace = signal('');
  protected readonly siguientes = computed(() => {
    const c = this.compra();
    const ig = this.comp.data() ? instagramOf(this.comp.data()).replace(/\/$/, '').split('/').pop() : 'grstrengthclub';
    return [
      `Te hemos enviado tus números a ${c?.email ?? 'tu email'}. Guarda el email: el número es tu boleto.`,
      `${cuando(this.fechaSorteo())} La lista y la semilla se publican para que cualquiera lo compruebe.`,
      `Sigue @${ig} en Instagram para estar al día.`,
    ];
  });
  protected get redes() {
    const u = encodeURIComponent(this.enlace());
    const t = encodeURIComponent('Ya participo en el sorteo de la GR Strength Cup. ¡Apúntate tú también!');
    return [
      { n: 'X', url: `https://x.com/intent/post?text=${t}&url=${u}` },
      { n: 'Facebook', url: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
      { n: 'WhatsApp', url: `https://wa.me/?text=${t}%20${u}` },
    ];
  }
  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const url = `${BASE}/compras/${q.get('compra')}?t=${encodeURIComponent(q.get('t') ?? '')}`;
    inject(Seo).set({ title: 'Tus boletos · GR Strength Cup', description: 'Confirmación de tus boletos del sorteo.', path: '/sorteo/confirmacion', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.enlace.set(location.origin + '/sorteo');
    void this.comp.load();
    void firstValueFrom(this.http.get<Publico>(BASE)).then((s) => this.fechaSorteo.set(s.fechaSorteo), () => undefined);
    let n = 0;
    const cargar = async () => {
      try {
        const c = await firstValueFrom(this.http.get<EstadoCompra>(url));
        this.compra.set(c);
        if (c.estado === 'pendiente' && ++n < 20) setTimeout(cargar, 1500);
      } catch {
        this.compra.set(null);
      }
    };
    void cargar();
  }
  protected async copiar(): Promise<void> {
    await navigator.clipboard?.writeText(this.enlace());
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }
}
