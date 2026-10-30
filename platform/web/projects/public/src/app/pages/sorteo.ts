import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, RESPONSE_INIT, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrIcon, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG } from '../core/competition';
import { Seo } from '../core/seo';
import { SectionTitle } from '../home/cms-sections';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';

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

/** /sorteo (Figma page 07): the prize, the rules, how to take part, the result (with its verification) and the purchase form. */
@Component({
  selector: 'gr-sorteo',
  imports: [Page, FormsModule, GrAlert, GrIcon, GrSkeleton, SectionTitle, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = data();
    <gr-page title="Sorteo" [hideTitle]="true">
      @if (s === undefined) { <gr-skeleton class="h-96 rounded-xl" /> }
      @else if (s === null) { <gr-alert tone="warning" title="No hemos podido cargar el sorteo">Vuelve a intentarlo en unos minutos.</gr-alert> }
      @else {
        @if (cancelado) { <gr-alert class="mb-6 block" tone="info" title="Pago cancelado">No se ha cobrado nada. Puedes intentarlo de nuevo cuando quieras.</gr-alert> }
        <!-- Hero -->
        <section class="relative grid overflow-hidden rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_65%)] md:grid-cols-[minmax(0,1fr)_420px]">
          <div class="p-6 md:p-10">
            <p class="flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>Sorteo benéfico</p>
            <h1 class="mt-3 text-display-l md:text-display-xl">Sorteo</h1>
            <p class="mt-1 font-display text-[22px] uppercase italic md:text-[28px]">Entra en el sorteo de un <span class="text-accent-text">{{ s.premio || 'premio' }}</span></p>
            <p class="mt-4 max-w-lg text-body-m text-text-secondary">Participa tantas veces como quieras (hasta {{ s.maxPorPersona }} boletos) para tener más oportunidades de ganar. Lo recaudado va a {{ s.destino || 'una causa benéfica local' }}.</p>
            <p class="mt-5 flex flex-wrap gap-2">
              <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs"><gr-icon name="ticket" [size]="14" />{{ euros(s.precio) }} por boleto</span>
              <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs"><gr-icon name="calendar" [size]="14" />Sorteo: {{ fechaLarga(s.fechaSorteo) }}</span>
            </p>
            <div class="mt-5 max-w-md">
              <p class="flex justify-between text-label-s"><span>Boletos vendidos</span><span class="font-mono">{{ n(s.vendidos) }}@if (s.totalMax) { / {{ n(s.totalMax) }} }</span></p>
              @if (s.totalMax) { <div class="mt-2 h-2 overflow-hidden rounded-pill bg-bg-base/60"><div class="h-full rounded-pill bg-accent" [style.width.%]="min(100, s.vendidos * 100 / s.totalMax)"></div></div> }
            </div>
            <div class="mt-6 flex flex-wrap gap-2">
              @if (s.estado === 'en_venta') { <a href="#participa" class="inline-flex h-11 items-center rounded-md bg-accent px-5 text-label-m text-white shadow-glow hover:bg-accent-hover">Compra ya</a> }
              <a href="#normas" class="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-5 text-label-m hover:border-white">Ver normas <gr-icon name="arrow-right" [size]="16" /></a>
            </div>
          </div>
          <div class="relative min-h-60 bg-[radial-gradient(60%_60%_at_50%_45%,#5a1621,transparent)]">
            @if (s.premioImagen) { <img [src]="s.premioImagen" [alt]="s.premio" class="absolute inset-0 size-full object-contain p-6" /> }
          </div>
        </section>

        <!-- Rules -->
        <section id="normas" class="mt-16 scroll-mt-28">
          <gr-section-title [center]="true" titulo="Normas" acento="del sorteo" />
          <p class="mx-auto mt-3 max-w-xl text-center text-body-s text-text-secondary">Simple, justo y transparente. Las bases completas están en <a href="/politica-concurso" class="text-accent-text underline">bases del sorteo</a>.</p>
          <div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (r of normas(); track r.t) {
              <div class="rounded-lg border border-line-subtle bg-bg-card p-5"><span class="flex size-9 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon [name]="r.i" [size]="18" /></span>
                <p class="mt-3 text-label-m">{{ r.t }}</p><p class="mt-1 text-body-s text-text-secondary">{{ r.d }}</p></div>
            }
          </div>
        </section>

        <!-- How -->
        <section class="mt-16">
          <gr-section-title [center]="true" titulo="Cómo" acento="participar" />
          <ol class="mx-auto mt-8 flex max-w-2xl flex-col gap-3">
            @for (p of pasos; track p.t; let i = $index) {
              <li class="flex gap-4 rounded-lg border border-line-subtle bg-bg-card p-4"><span class="flex size-9 shrink-0 items-center justify-center rounded-pill bg-accent text-label-m text-white">{{ i + 1 }}</span>
                <div><p class="text-label-m">{{ p.t }}</p><p class="text-body-s text-text-secondary">{{ p.d }}</p></div></li>
            }
          </ol>
        </section>

        <!-- Result -->
        <section class="mt-16">
          <gr-section-title [center]="true" titulo="Resultados" />
          <div class="mx-auto mt-8 max-w-xl rounded-xl border p-6 text-center" [class]="s.ganador ? 'border-accent/50 bg-[linear-gradient(150deg,#4a121c,#1b1112_70%)]' : 'border-line-subtle bg-bg-card'">
            @if (s.ganador; as g) {
              <p class="text-mono-xs tracking-[0.2em] text-text-tertiary">BOLETO GANADOR</p>
              <p class="mt-2 font-display text-[72px] leading-none text-accent-text italic">{{ g.numero }}</p>
              <p class="mt-3 text-ui-h4">{{ g.nombre }}</p><p class="text-body-s text-text-tertiary">¡Enhorabuena! · {{ s.premio }}</p>
            } @else {
              <gr-icon name="trophy" [size]="28" class="text-text-tertiary" />
              <p class="mt-3 font-display text-[22px] uppercase italic">Ganador pendiente</p>
              <p class="mt-2 text-body-s text-text-secondary">El sorteo se hace en directo el {{ fechaLarga(s.fechaSorteo) }}. Publicaremos aquí el boleto ganador.</p>
            }
            @if (s.verificacion; as v) {
              <details class="mt-5 rounded-md border border-line-subtle bg-bg-base/40 p-4 text-left text-body-xs text-text-secondary">
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
        </section>

        <!-- Prize -->
        <section class="mt-16">
          <gr-section-title [center]="true" titulo="Participa para ganar" acento="este premio" />
          <div class="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-[260px_minmax(0,1fr)]">
            <div class="flex aspect-square items-center justify-center rounded-lg border border-line-subtle bg-[radial-gradient(60%_60%_at_50%_45%,#4a121c,#1b1112)]">@if (s.premioImagen) { <img [src]="s.premioImagen" [alt]="s.premio" class="max-h-[85%] max-w-[85%] object-contain" loading="lazy" /> }</div>
            <div class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="font-display text-[24px] uppercase italic">{{ s.premio }}</p>
              @if (s.premioValor) { <p class="mt-1 text-body-s text-text-tertiary">Valor aproximado {{ euros(s.premioValor) }}</p> }
              <p class="mt-3 text-body-s text-text-secondary">{{ s.premioDetalle }}</p></div>
          </div>
        </section>

        <!-- Purchase -->
        <section id="participa" class="mt-16 scroll-mt-28">
          <gr-section-title [center]="true" titulo="Inscríbete" acento="ahora" />
          <div class="mx-auto mt-8 max-w-xl rounded-xl border border-line-subtle bg-bg-card p-5 md:p-7">
            @if (s.estado !== 'en_venta') {
              <div class="text-center"><gr-icon name="lock" [size]="24" class="text-text-tertiary" /><p class="mt-3 text-ui-h5">{{ estadoTitulo[s.estado] }}</p><p class="mt-1 text-body-s text-text-secondary">{{ s.motivo }}</p>
                <a href="#novedades" (click)="irNovedades($event)" class="mt-4 inline-flex text-label-s text-accent-text">Avísame por email →</a></div>
            } @else {
              @if (s.pasarela === 'simulado') { <gr-alert class="mb-4 block" tone="info" title="Modo pruebas">La pasarela es de pruebas: no se cobra nada.</gr-alert> }
              <form class="flex flex-col gap-4" (ngSubmit)="comprar()" novalidate>
                @if (error()) { <gr-alert tone="danger" [title]="error()" /> }
                <label class="flex flex-col gap-1.5"><span class="text-label-s">Nombre completo</span><input name="nombre" [(ngModel)]="f.nombre" autocomplete="name" required maxlength="120" class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" [class.border-accent]="tocado() && f.nombre.trim().length < 2" /></label>
                <label class="flex flex-col gap-1.5"><span class="text-label-s">Correo electrónico</span><input name="email" type="email" [(ngModel)]="f.email" autocomplete="email" required class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" [class.border-accent]="tocado() && !emailOk()" /></label>
                <label class="flex flex-col gap-1.5"><span class="text-label-s">Teléfono <span class="text-text-tertiary">(opcional)</span></span><input name="tel" type="tel" [(ngModel)]="f.telefono" autocomplete="tel" placeholder="+34 600 000 000" class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" /></label>
                <div>
                  <p class="flex justify-between text-label-s"><span>Número de boletos</span><span class="text-text-tertiary">máx. {{ s.maxPorPersona }}</span></p>
                  <div class="mt-2 flex items-center justify-center gap-5">
                    <button type="button" class="flex size-11 items-center justify-center rounded-pill border border-line-strong disabled:opacity-40" [disabled]="cantidad() <= 1" (click)="cantidad.set(cantidad() - 1)" aria-label="Menos boletos"><gr-icon name="minus" [size]="18" /></button>
                    <span class="w-12 text-center text-display-s tabular-nums" aria-live="polite">{{ cantidad() }}</span>
                    <button type="button" class="flex size-11 items-center justify-center rounded-pill border border-line-strong disabled:opacity-40" [disabled]="cantidad() >= s.maxPorPersona" (click)="cantidad.set(cantidad() + 1)" aria-label="Más boletos"><gr-icon name="plus" [size]="18" /></button>
                  </div>
                  <div class="mt-3 flex justify-center gap-2">@for (p of s.presets; track p) { <button type="button" class="h-9 min-w-11 rounded-pill border px-3 text-label-s" [class]="cantidad() === p ? 'border-accent bg-accent text-white' : 'border-line-strong'" (click)="cantidad.set(p)">{{ p }}</button> }</div>
                  <p class="mt-3 flex justify-between border-t border-line-subtle pt-3 text-body-s"><span class="text-text-secondary">{{ cantidad() }} × {{ euros(s.precio) }}</span><span class="text-label-m">{{ euros(total()) }}</span></p>
                </div>
                <label class="flex items-start gap-2.5 text-body-s"><input type="checkbox" name="mayor" class="mt-0.5 size-4 accent-[#c42b3e]" [(ngModel)]="f.mayorEdad" />Tengo 18 años o más</label>
                <label class="flex items-start gap-2.5 text-body-s"><input type="checkbox" name="bases" class="mt-0.5 size-4 accent-[#c42b3e]" [(ngModel)]="f.aceptaBases" /><span>He leído y acepto las <a href="/politica-concurso" target="_blank" class="text-accent-text underline">bases del sorteo</a> y la <a href="/privacidad" target="_blank" class="text-accent-text underline">política de privacidad</a></span></label>
                <label class="flex items-start gap-2.5 text-body-s text-text-secondary"><input type="checkbox" name="novedades" class="mt-0.5 size-4 accent-[#c42b3e]" [(ngModel)]="f.novedades" />Quiero recibir novedades de la GR Strength Cup por email (opcional; te enviaremos un email para confirmarlo)</label>
                <button type="submit" class="flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-label-m text-white shadow-glow hover:bg-accent-hover disabled:opacity-60" [disabled]="enviando()">
                  @if (enviando()) { <gr-icon name="loader" [size]="18" class="animate-spin" /> } Comprar {{ cantidad() }} {{ cantidad() === 1 ? 'boleto' : 'boletos' }} · {{ euros(total()) }}</button>
                <p class="text-center text-body-xs text-text-tertiary">Pago seguro con {{ s.pasarela === 'stripe' ? 'Stripe' : 'tarjeta' }}. Recibirás tus números por email.</p>
              </form>
            }
          </div>
        </section>
        <gr-related class="mt-16 block" [items]="rel" />
        <gr-community class="mt-14 block" />
      }
    </gr-page>
  `,
})
export class SorteoPage {
  private readonly http = inject(HttpClient);
  private readonly res = inject(RESPONSE_INIT, { optional: true });
  protected readonly data = signal<Publico | null | undefined>(undefined);
  protected readonly cantidad = signal(1);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly tocado = signal(false);
  protected f = { nombre: '', email: '', telefono: '', mayorEdad: false, aceptaBases: false, novedades: false };
  protected readonly cancelado = inject(ActivatedRoute).snapshot.queryParamMap.has('cancelado');
  protected readonly euros = euros;
  protected readonly fechaLarga = fechaLarga;
  protected readonly lista = `${BASE}/lista.txt`;
  protected readonly total = computed(() => (this.data()?.precio ?? 0) * this.cantidad());
  protected readonly estadoTitulo: Record<string, string> = { proximamente: 'La venta abrirá pronto', cerrada: 'La venta ha terminado', agotada: 'Boletos agotados', bloqueada: 'Venta en preparación', sorteado: 'El sorteo ya se hizo' };
  protected readonly pasos = [
    { t: 'Elige tus boletos', d: 'Cuantos más boletos, más oportunidades.' },
    { t: 'Rellena tus datos', d: 'Nombre y email para enviarte tus números.' },
    { t: 'Completa el pago', d: 'Pago seguro con tarjeta. Al instante recibes tus números por email.' },
    { t: 'Síguenos en Instagram', d: 'Opcional: anunciaremos el sorteo y el ganador.' },
    { t: 'Espera al sorteo', d: 'Se hace en directo, con la lista y la semilla publicadas para que cualquiera lo compruebe.' },
  ];
  protected readonly rel: RelatedLink[] = [
    { titulo: 'Bases del sorteo', texto: 'Condiciones completas', ruta: '/politica-concurso' },
    { titulo: 'Entradas', texto: 'Gratis con reserva', ruta: '/entradas' },
    { titulo: 'En directo', texto: 'Sigue la competición', ruta: '/en-directo' },
  ];
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
        const s = await firstValueFrom(this.http.get<Publico>(BASE));
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
  protected n(v: number): string { return new Intl.NumberFormat('es-ES').format(v); }
  protected min(a: number, b: number): number { return Math.min(a, b); }
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
    this.enviando.set(true);
    try {
      const r = await firstValueFrom(this.http.post<{ checkoutUrl: string }>(`${BASE}/compras`, {
        nombre: this.f.nombre.trim(), email: this.f.email.trim(), telefono: this.f.telefono.trim() || undefined, cantidad: this.cantidad(),
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

/** /sorteo/confirmacion?compra=…&t=… — after paying: the ticket numbers (waits for the payment confirmation). */
@Component({
  selector: 'gr-sorteo-confirmacion',
  imports: [Page, GrAlert, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = compra();
    <gr-page title="Tus boletos" eyebrow="Sorteo benéfico" section="Sorteo" crumb="Confirmación">
      <div class="mx-auto max-w-xl">
        @if (c === undefined) { <gr-skeleton class="h-64 rounded-xl" /> }
        @else if (c === null) { <gr-alert tone="warning" title="No encontramos esta compra">Revisa el enlace del email o escríbenos.</gr-alert> }
        @else {
          @switch (c.estado) {
            @case ('pagada') {
              <section class="rounded-xl border border-accent/50 bg-[linear-gradient(150deg,#4a121c,#1b1112_70%)] p-6 text-center md:p-8">
                <gr-icon name="circle-check" [size]="32" class="text-success" />
                <h2 class="mt-3 text-ui-h3">¡Ya participas, {{ c.nombre }}!</h2>
                <p class="mt-1 text-body-s text-text-secondary">{{ c.cantidad }} {{ c.cantidad === 1 ? 'boleto' : 'boletos' }} · {{ euros(c.importe) }}@if (c.tarjeta) { · {{ c.tarjeta }} }</p>
                <div class="mt-6 flex flex-wrap justify-center gap-2">@for (b of c.boletos; track b) { <span class="rounded-md border border-accent/50 bg-bg-base/60 px-4 py-2 font-display text-[30px] italic">{{ b }}</span> }</div>
                <p class="mt-6 text-body-s text-text-secondary">Te hemos enviado tus números a {{ c.email }}. Guarda el email: el número es tu boleto.</p>
                @if (c.pruebas) { <p class="mt-2 text-body-xs text-info">Modo pruebas: no se ha cobrado nada.</p> }
                <a href="/sorteo" class="mt-6 inline-flex h-11 items-center rounded-md border border-line-strong px-5 text-label-m hover:border-white">Volver al sorteo</a>
              </section>
            }
            @case ('pendiente') {
              <section class="rounded-xl border border-line-subtle bg-bg-card p-8 text-center"><gr-icon name="loader" [size]="28" class="animate-spin text-text-tertiary" /><p class="mt-3 text-ui-h5">Confirmando el pago…</p><p class="mt-1 text-body-s text-text-secondary">Tarda unos segundos. No cierres esta página.</p></section>
            }
            @case ('reembolsada') { <gr-alert tone="info" title="Compra reembolsada">Te hemos devuelto el importe y estos boletos ya no participan.</gr-alert> }
            @default { <gr-alert tone="warning" title="El pago no se completó">No se ha cobrado nada. <a href="/sorteo#participa" class="underline">Inténtalo de nuevo</a>.</gr-alert> }
          }
        }
      </div>
    </gr-page>
  `,
})
export class SorteoConfirmacionPage {
  private readonly http = inject(HttpClient);
  protected readonly compra = signal<EstadoCompra | null | undefined>(undefined);
  protected readonly euros = euros;
  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const url = `${BASE}/compras/${q.get('compra')}?t=${encodeURIComponent(q.get('t') ?? '')}`;
    inject(Seo).set({ title: 'Tus boletos · GR Strength Cup', description: 'Confirmación de tus boletos del sorteo.', path: '/sorteo/confirmacion', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
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
}
