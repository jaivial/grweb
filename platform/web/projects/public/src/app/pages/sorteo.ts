import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, RESPONSE_INIT, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon, GrLogo, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { SecSorteo } from '../home/secciones';
import { Footer, Navbar, instagramOf } from '../layout/layout';
import { Page } from '../layout/page';
import { applySeo } from './content';

interface Publico {
  estado: 'en_venta' | 'proximamente' | 'cerrada' | 'agotada' | 'bloqueada' | 'sorteado'; motivo?: string; premio: string; premioDetalle: string; premioImagen: string; premioValor: number;
  destino: string; precio: number; maxPorPersona: number; presets: number[]; vendidos: number; totalMax?: number; ventaHasta?: string; fechaSorteo?: string; pasarela: 'stripe' | 'simulado' | 'ninguna';
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
      @if (eyebrow()) { <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase"><span class="h-px w-7 bg-accent/60"></span>{{ eyebrow() }}</p> }
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

/** /sorteo (Figma page 07): the prize, the rules, how to take part, the result (with its verification) and the purchase form. */
@Component({
  selector: 'gr-sorteo',
  imports: [RouterLink, Navbar, Footer, FormsModule, GrButton, GrIcon, GrSkeleton, SecSorteo, SorteoTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = data();
    <gr-navbar />
    <main class="relative">
      @if (s === undefined) { <div class="mx-auto max-w-[1200px] px-5 pt-28 md:pt-30"><gr-skeleton class="h-[583px] rounded-3xl" /></div> }
      @else if (s === null) {
        <div class="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-5 pt-[120px] pb-24 text-center md:pt-40">
          <h1 class="text-display-m md:text-display-l">Sorteo</h1>
          <p class="flex items-start gap-3 rounded-md border border-warning bg-warning/8 p-4 text-left text-body-s text-text-secondary" role="alert"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />No hemos podido cargar el sorteo. Vuelve a intentarlo en unos minutos.</p>
        </div>
      } @else {
        <!-- Figma «Section / Sorteo» (the same panel as the home, as the page's hero) -->
        <div class="h-[76px] md:hidden"></div>
        <gr-sec-sorteo [sorteo]="s" [pagina]="true" [texto]="textoHero()" />

        <!-- Normas del sorteo -->
        <section id="normas" [class]="seccion + ' scroll-mt-20'">
          <gr-sorteo-titulo titulo="Normas" acento="del sorteo" texto="Simple, justo y transparente. Aquí tienes lo que necesitas saber; las bases completas están en la política del concurso." />
          <div class="grid w-full max-w-[1104px] gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
            @for (r of normas(); track r.t) {
              <div class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6">
                <span class="flex size-10 items-center justify-center rounded-sm bg-accent/12 text-accent-text"><gr-icon [name]="r.i" [size]="20" /></span>
                <p class="mt-2 text-ui-h5">{{ r.t }}</p><p class="text-body-s text-text-tertiary">{{ r.d }}</p>
              </div>
            }
          </div>
          <div class="flex w-full max-w-[420px] flex-col items-center gap-2 rounded-md border border-accent bg-accent/8 p-6 text-center">
            <p class="text-body-s text-text-tertiary">¿Cuánto cuesta?</p>
            <p class="text-ui-h2 text-accent-text">{{ euros(s.precio) }} por boleto</p>
            <p class="text-body-xs text-text-tertiary">Más boletos, más posibilidades · máx. {{ s.maxPorPersona }} por persona</p>
          </div>
          <a href="/politica-concurso" class="text-label-s text-accent-text hover:underline">Leer las bases del sorteo →</a>
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
                  <h3 class="mt-1 text-ui-h4">{{ p.t }}</h3><p class="text-body-s text-text-tertiary">{{ p.d }}</p>
                </div>
                <span class="relative z-10 order-1 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-bg-base text-text-primary md:order-none"><gr-icon [name]="p.i" [size]="18" /></span>
                <span class="hidden flex-1 md:block md:max-w-[428px]"></span>
              </li>
            }
          </ol>
        </section>

        <!-- Resultados -->
        <section [class]="seccion">
          <gr-sorteo-titulo titulo="Resultados" />
          <div class="flex w-full max-w-[520px] flex-col items-center gap-3 rounded-lg border p-7 text-center" [class]="s.ganador ? 'border-accent/50 bg-[linear-gradient(150deg,#4a121c,#1b1112_70%)]' : 'border-line-subtle bg-bg-card'">
            @if (s.ganador; as g) {
              <p class="text-mono-xs tracking-[0.2em] text-text-tertiary">BOLETO GANADOR</p>
              <p class="font-display text-[72px] leading-none text-accent-text italic">{{ g.numero }}</p>
              <p class="text-ui-h4">{{ g.nombre }}</p><p class="text-body-s text-text-tertiary">¡Enhorabuena! · {{ s.premio }}</p>
            } @else {
              <span class="flex size-16 items-center justify-center rounded-full bg-[radial-gradient(circle,rgb(196_43_62/0.25),transparent_70%)] text-accent-text"><gr-icon name="trophy" [size]="28" /></span>
              <p class="mt-1 text-display-xs">Ganador pendiente</p>
              <p class="text-body-s text-text-tertiary">{{ cuando(s.fechaSorteo) }} Publicaremos aquí el boleto ganador.</p>
            }
            @if (s.verificacion; as v) {
              <details class="mt-2 w-full rounded-md border border-line-subtle bg-bg-base/40 p-4 text-left text-body-xs text-text-secondary">
                <summary class="cursor-pointer text-label-s text-text-primary">Comprueba que el sorteo es limpio</summary>
                <p class="mt-3">Antes de sortear se congeló la lista de {{ n(v.total) }} boletos (<a [href]="lista" class="text-accent-text underline">descargar lista</a>) y una semilla secreta, publicando sus huellas:</p>
                <p class="mt-2 font-mono break-all">lista · sha256 {{ v.hashLista }}</p>
                <p class="font-mono break-all">semilla · sha256 {{ v.semillaHash }}</p>
                @if (v.semilla) {
                  <p class="mt-2">Semilla revelada: <span class="font-mono break-all">{{ v.semilla }}</span></p>
                  <p class="mt-2">Boleto ganador = posición HMAC-SHA256(semilla, huella de la lista) mod {{ v.total }} = {{ v.indice }} de la lista ordenada (empezando en 0).</p>
                } @else { <p class="mt-2">La semilla se revela al confirmar el ganador: cualquiera podrá recalcular el resultado.</p> }
              </details>
            }
          </div>
          @if (s.estado === 'en_venta') {
            <p class="w-full max-w-[520px] rounded-md border border-accent bg-accent/8 p-6 text-left text-body-s">Cuantos más boletos compres, más oportunidades tienes de ganar.</p>
            <div class="flex flex-col items-center gap-10">
              <p class="text-body-s text-text-tertiary">¿Quieres ser nuestro próximo ganador?</p>
              <a grButton variant="primary" size="l" routerLink="." fragment="participa">Participa ahora</a>
            </div>
          }
        </section>

        <!-- Premio -->
        <section [class]="seccion + ' md:pt-0'">
          <gr-sorteo-titulo eyebrow="Premio del sorteo" titulo="Participa para ganar" acento="este premio" />
          <article class="flex w-full max-w-[360px] flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
            <div class="relative h-[200px] bg-[radial-gradient(60%_60%_at_50%_45%,#4a121c,#1b1112)]">
              @if (s.premioImagen) { <img [src]="s.premioImagen" [alt]="s.premio" class="size-full object-cover" loading="lazy" /> }
            </div>
            <div class="flex flex-col gap-2 p-5">
              <h3 class="text-ui-h5">{{ s.premio }}</h3>
              <p class="text-body-s text-text-tertiary">{{ s.premioDetalle }}@if (s.premioValor) { {{ ' ' }}Valor aproximado {{ euros(s.premioValor) }}. }</p>
            </div>
          </article>
        </section>

        <!-- Inscríbete ahora -->
        <section id="participa" [class]="seccion + ' scroll-mt-20'">
          <gr-sorteo-titulo titulo="Inscríbete" acento="ahora" [texto]="'Completa el formulario para participar en el sorteo de la ' + nombreComp() + '.'" />
          @if (s.estado === 'en_venta') {
            <!-- Figma «Step progress» (mobile) -->
            <ol class="flex w-full max-w-[350px] items-center gap-2 md:hidden" aria-label="Pasos">
              @for (x of ['Boletos', 'Datos', 'Pago']; track x; let i = $index; let ultimo = $last) {
                <li class="flex items-center gap-1.5 text-label-s" [class]="i === 0 ? 'text-text-primary' : 'text-text-muted'" [attr.aria-current]="i === 0 ? 'step' : null"><span class="flex size-6 items-center justify-center rounded-full text-label-xs" [class]="i === 0 ? 'bg-accent text-white' : 'bg-bg-raised'">{{ i + 1 }}</span>{{ x }}</li>
                @if (!ultimo) { <li class="h-0.5 flex-1 bg-line-strong" aria-hidden="true"></li> }
              }
            </ol>
          }
          <div class="w-full max-w-[560px] rounded-[20px] border border-line-subtle bg-bg-card p-5 shadow-[0_24px_60px_rgb(0_0_0/0.45)] md:p-7">
            @if (s.estado !== 'en_venta') {
              <div class="flex flex-col items-center gap-3 py-2 text-center"><gr-icon name="lock" [size]="24" class="text-text-tertiary" /><p class="text-ui-h5">{{ estadoTitulo[s.estado] }}</p><p class="text-body-s text-text-secondary">{{ s.motivo }}</p>
                <a href="#novedades" (click)="irNovedades($event)" class="text-label-s text-accent-text hover:underline">Avísame por email →</a></div>
            } @else {
              <form class="flex flex-col gap-5" (ngSubmit)="comprar()" novalidate>
                @if (cancelado) { <p class="flex items-start gap-3 rounded-md border border-line-strong bg-bg-field p-4 text-body-s text-text-secondary"><gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-info" />Pago cancelado: no se ha cobrado nada. Puedes intentarlo de nuevo cuando quieras.</p> }
                @if (s.pasarela === 'simulado') { <p class="flex items-start gap-3 rounded-md border border-warning bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-warning" />Modo pruebas: la pasarela es de pruebas y no se cobra nada.</p> }
                @if (error()) { <p class="flex items-start gap-3 rounded-md border border-accent bg-accent/8 p-4 text-body-s" role="alert"><gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0 text-accent-text" />{{ error() }}</p> }
                <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">Nombre completo</span><input name="nombre" [(ngModel)]="f.nombre" autocomplete="name" required maxlength="120" placeholder="Tu nombre y apellidos" [class]="campo + (tocado() && f.nombre.trim().length < 2 ? ' border-accent-text' : ' border-line-strong')" /></label>
                <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">Correo electrónico</span><input name="email" type="email" [(ngModel)]="f.email" autocomplete="email" required placeholder="tu@email.com" [class]="campo + (tocado() && !emailOk() ? ' border-accent-text' : ' border-line-strong')" /></label>
                <label class="flex flex-col gap-2"><span class="text-label-s text-text-secondary">Teléfono <span class="text-text-muted">(opcional)</span></span>
                  <span class="flex h-12 items-center rounded-sm border border-line-strong bg-bg-field focus-within:border-accent-text"><span class="pl-3 text-body-m text-text-secondary">+34</span><span class="mx-2 h-6 w-px bg-line-strong"></span><input name="tel" type="tel" [(ngModel)]="f.telefono" autocomplete="tel-national" placeholder="600 000 000" class="h-full w-0 min-w-0 flex-1 bg-transparent pr-3 text-body-m outline-none placeholder:text-text-muted" /></span></label>

                <!-- Figma «Ticket stepper» -->
                <div class="flex flex-col items-center gap-3 rounded-md border border-line-subtle bg-bg-field p-5">
                  <p class="flex w-full justify-between"><span class="text-label-s text-text-secondary">Número de boletos</span><span class="text-body-xs text-text-muted">{{ euros(s.precio) }} por boleto · máx. {{ s.maxPorPersona }}</span></p>
                  <div class="flex items-center gap-7">
                    <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-bg-card disabled:opacity-40" [disabled]="cantidad() <= 1" (click)="cantidad.set(cantidad() - 1)" aria-label="Menos boletos"><gr-icon name="minus" [size]="16" /></button>
                    <span class="min-w-8 text-center text-ui-h1 tabular-nums" aria-live="polite">{{ cantidad() }}</span>
                    <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-bg-card disabled:opacity-40" [disabled]="cantidad() >= s.maxPorPersona" (click)="cantidad.set(cantidad() + 1)" aria-label="Más boletos"><gr-icon name="plus" [size]="16" /></button>
                  </div>
                  <div class="flex gap-2">@for (p of s.presets; track p) { <button type="button" class="h-11 w-12 rounded-full text-label-xs" [class]="cantidad() === p ? 'bg-accent text-white' : 'bg-bg-raised text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="cantidad() === p" (click)="cantidad.set(p)">{{ p }}</button> }</div>
                  <p class="mt-1 flex w-full items-center justify-between border-t border-line-subtle pt-4"><span class="text-body-s text-text-secondary">{{ cantidad() }} {{ cantidad() === 1 ? 'boleto' : 'boletos' }} × {{ euros(s.precio) }}</span><span class="text-ui-h4">{{ eur.format(total() / 100) }}</span></p>
                </div>

                <div class="flex flex-col gap-1">
                  @for (k of checks; track k.k) {
                    <label class="flex min-h-11 items-start gap-3 py-1 text-body-s" [class]="k.req ? 'text-text-primary' : 'text-text-secondary'">
                      <span class="relative flex size-5 shrink-0 items-center justify-center">
                        <input type="checkbox" [name]="k.k" [attr.name]="k.k" [(ngModel)]="f[k.k]" class="peer size-5 appearance-none rounded-xs border bg-bg-base checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text" [class]="tocado() && k.req && !f[k.k] ? 'border-accent-text' : 'border-line-strong'" />
                        @if (f[k.k]) { <gr-icon name="check" [size]="13" class="pointer-events-none absolute text-white" /> }
                      </span>
                      <span>
                        @switch (k.k) {
                          @case ('mayorEdad') { Tengo 18 años o más }
                          @case ('aceptaBases') { He leído y acepto las <a href="/politica-concurso" target="_blank" class="text-accent-text hover:underline">bases del sorteo</a> y la <a href="/privacidad" target="_blank" class="text-accent-text hover:underline">política de privacidad</a> }
                          @default { Quiero recibir novedades de la GR Strength Cup por email (opcional; te enviaremos un email para confirmarlo) }
                        }
                      </span>
                    </label>
                  }
                </div>
                <div class="flex flex-col gap-3">
                  <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="enviando()">Inscribirme · {{ eur.format(total() / 100) }}</button>
                  <p class="text-center text-body-xs text-text-muted"><gr-icon name="lock" [size]="13" class="mr-1.5 inline-block align-[-2px]" />Pago seguro con {{ s.pasarela === 'stripe' ? 'Stripe' : 'tarjeta' }}. Recibirás tus números por email.</p>
                </div>
              </form>
            }
          </div>
        </section>
      }
    </main>
    <gr-footer />
  `,
})
export class SorteoPage {
  private readonly http = inject(HttpClient);
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  private readonly comp = inject(Competition);
  protected readonly data = signal<Publico | null | undefined>(undefined);
  protected readonly cantidad = signal(1);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly tocado = signal(false);
  protected f: { nombre: string; email: string; telefono: string; mayorEdad: boolean; aceptaBases: boolean; novedades: boolean } = { nombre: '', email: '', telefono: '', mayorEdad: false, aceptaBases: false, novedades: false };
  protected readonly checks = [{ k: 'mayorEdad' as const, req: true }, { k: 'aceptaBases' as const, req: true }, { k: 'novedades' as const, req: false }];
  protected readonly campo = 'h-12 rounded-sm border bg-bg-field px-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none';
  protected readonly seccion = SECCION;
  protected readonly cancelado = inject(ActivatedRoute).snapshot.queryParamMap.has('cancelado');
  protected readonly euros = euros;
  protected readonly eur = eur;
  protected readonly fechaLarga = fechaLarga;
  protected readonly lista = `${BASE}/lista.txt`;
  protected readonly total = computed(() => (this.data()?.precio ?? 0) * this.cantidad());
  protected readonly nombreComp = computed(() => this.comp.data()?.nombre ?? 'GR Strength Cup');
  protected readonly estadoTitulo: Record<string, string> = { proximamente: 'La venta abrirá pronto', cerrada: 'La venta ha terminado', agotada: 'Boletos agotados', bloqueada: 'Venta en preparación', sorteado: 'El sorteo ya se hizo' };
  protected readonly textoHero = computed(() => {
    const s = this.data();
    return s ? `Compra hasta ${s.maxPorPersona} boletos para tener más oportunidades de ganar. Lo recaudado va a ${s.destino || 'una causa benéfica local'}.` : '';
  });
  protected readonly pasos = computed<{ t: string; d: string; i: GrIconName }[]>(() => {
    const s = this.data();
    return [
      { t: 'Elige tus boletos', d: `Selecciona cuántos boletos quieres (hasta ${s?.maxPorPersona ?? 10}). Cada boleto cuesta ${euros(s?.precio ?? 100)}.`, i: 'ticket' },
      { t: 'Rellena tus datos', d: 'Tu nombre y tu email, para enviarte tus números.', i: 'user' },
      { t: 'Completa el pago', d: 'Paga de forma segura con tarjeta. Al momento recibes tus números por email.', i: 'credit-card' },
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
      { t: 'Pago seguro', d: 'Con tarjeta a través de la pasarela; nunca guardamos tus datos de pago.', i: 'lock' },
      { t: 'Selección aleatoria y verificable', d: 'Lista y semilla publicadas antes de sortear.', i: 'shield' },
      { t: 'Solo mayores de 18', d: 'Lo recaudado va a ' + (s.destino || 'una causa benéfica local') + '.', i: 'gift' },
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
        this.cantidad.set(Math.min(s.presets?.[0] ?? 1, s.maxPorPersona));
      } catch (e) {
        this.data.set(null);
        if (this.res && !(e instanceof HttpErrorResponse && e.status === 404)) {
          this.res.status = 503;
          this.res.headers = { ...(this.res.headers as Record<string, string> | undefined), 'Retry-After': '30', 'Cache-Control': 'no-store' };
        }
      }
      const s = this.data();
      await applySeo(cms, seo, '/sorteo', 'Sorteo benéfico · GR Strength Cup', s ? `Participa en el sorteo de un ${s.premio} por ${euros(s.precio)} el boleto. Lo recaudado va a ${s.destino || 'una causa benéfica'}. Sorteo en directo y verificable.` : 'Sorteo benéfico de la GR Strength Cup.');
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
  protected emailOk(): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.f.email.trim()); }
  protected irNovedades(e: Event): void {
    e.preventDefault();
    document.querySelector('gr-newsletter input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  protected async comprar(): Promise<void> {
    this.tocado.set(true);
    this.error.set('');
    if (this.f.nombre.trim().length < 2 || !this.emailOk()) return this.error.set('Revisa tu nombre y tu email.');
    if (!this.f.mayorEdad || !this.f.aceptaBases) return this.error.set('Para participar tienes que ser mayor de edad y aceptar las bases y la privacidad.');
    const tel = this.f.telefono.trim();
    this.enviando.set(true);
    try {
      const r = await firstValueFrom(this.http.post<{ checkoutUrl: string }>(`${BASE}/compras`, {
        nombre: this.f.nombre.trim(), email: this.f.email.trim(), telefono: tel ? (tel.startsWith('+') ? tel : '+34 ' + tel) : undefined, cantidad: this.cantidad(),
        mayorEdad: true, aceptaBases: true, aceptaPrivacidad: true, novedades: this.f.novedades, origen: new URLSearchParams(location.search).get('utm_source') ?? undefined,
      }));
      location.href = r.checkoutUrl;
    } catch (e) {
      const d = e instanceof HttpErrorResponse ? (e.error?.detail as string | undefined) : undefined;
      this.error.set(d ?? 'No se pudo iniciar el pago. Inténtalo de nuevo.');
      this.enviando.set(false);
    }
  }
}

/** /sorteo/confirmacion?compra=…&t=… — after paying (Figma 09 «/success»): summary, next steps, share; waits for the payment confirmation. */
@Component({
  selector: 'gr-sorteo-confirmacion',
  imports: [Page, GrButton, GrIcon, GrLogo],
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
              <a grButton variant="primary" href="/sorteo#participa">Reintentar</a>
              <a grButton variant="outline" href="/">Volver al inicio</a>
            </div>
          </div>
        } @else if (c.estado === 'reembolsada') {
          <div class="flex flex-col items-center gap-4 py-6">
            <span class="flex size-12 items-center justify-center rounded-full bg-info/15 text-info"><gr-icon name="info" [size]="22" /></span>
            <h1 class="text-ui-h4">Compra reembolsada</h1>
            <p class="text-body-s text-text-tertiary">Te hemos devuelto el importe y estos boletos ya no participan.</p>
            <a grButton variant="outline" href="/sorteo">Volver al sorteo</a>
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
          <a grButton variant="primary" size="l" href="/">Volver al inicio</a>
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
    const t = encodeURIComponent('Ya participo en el sorteo benéfico de la GR Strength Cup. ¡Apúntate tú también!');
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
