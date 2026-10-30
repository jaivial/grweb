import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { CATEGORIAS_IPF, cat } from '../core/atletas';
import { COMPETITION_SLUG, Competition, type CompeticionPublica } from '../core/competition';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';

interface ConfigPub { modo: 'externa' | 'propia'; estado: 'abierta' | 'proximamente' | 'cerrada' | 'completa'; cuota: number; plazas: number; ocupadas: number; abre?: string; cierra?: string; reserva: boolean; cupones: boolean; referidos: boolean; referidoTexto?: string; pasarela: string; pruebas: boolean }
interface Descuento { codigo: string; valido: boolean; importe: number; texto: string; motivo?: string; invitadoPor?: string }
interface Precio { cuota: number; cupon?: Descuento; referido?: Descuento; total: number }
interface Estado { id: string; estado: 'pendiente_pago' | 'pagada' | 'gratuita' | 'reserva' | 'cancelada' | 'fallida'; total: number; email: string; tarjeta?: string; referencia?: string; codigoReferido?: string; checkoutUrl?: string; categoria: string }

const base = `/api/competiciones/${COMPETITION_SLUG}/inscripcion`;
export const eur = (c?: number) => ((c ?? 0) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const fechaLarga = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');

/** /inscripcion (Figma pages 06 and 06b): AEP link (external mode) or own registration with payment, coupon and referral. */
@Component({
  selector: 'gr-inscripcion-page',
  imports: [Page, FormsModule, GrAlert, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = cfg();
    @let comp = competicion();
    <gr-page title="¡Inscríbete a la" [accent]="tituloComp()" eyebrow="Inscripción" crumb="Inscripción"
      [subtitle]="c?.modo === 'propia' ? 'Rellena tus datos y paga tu plaza en un minuto. Te confirmamos por email.' : 'Cómo inscribirte como atleta en el campeonato.'">
      @if (c === undefined) { <gr-skeleton class="h-96 max-w-3xl rounded-lg" /> }
      @else if (c) {
        <div class="max-w-3xl">
          <div class="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-line-subtle bg-bg-card p-4 sm:grid-cols-3">
            <p class="flex items-center gap-3"><span class="flex size-9 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon name="calendar" [size]="16" /></span><span><span class="block text-mono-xs text-text-tertiary">Fecha</span><span class="text-label-s">{{ fechaComp() }}</span></span></p>
            <p class="flex items-center gap-3"><span class="flex size-9 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon name="map-pin" [size]="16" /></span><span><span class="block text-mono-xs text-text-tertiary">Sede</span><span class="text-label-s">{{ comp?.sede?.ciudad || 'Almussafes' }} (Valencia)</span></span></p>
            <p class="flex items-center gap-3"><span class="flex size-9 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon name="users" [size]="16" /></span><span><span class="block text-mono-xs text-text-tertiary">Plazas</span><span class="text-label-s">{{ c.plazas || '—' }}{{ c.modo === 'propia' ? ' · ' + eur(c.cuota) : '' }}</span></span></p>
          </div>

          @if (cancelado()) { <gr-alert class="mb-6" tone="warning" title="Pago cancelado">No se ha cobrado nada. Puedes volver a intentarlo; si cierras esta página, la plaza se libera en 30 minutos.</gr-alert> }

          @if (c.modo !== 'propia') {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-ui-h4">La inscripción la gestiona la AEP</h2>
              <p class="mt-2 text-body-m text-text-secondary">Necesitas licencia de la Asociación Española de Powerlifting. La lista de espera también la lleva la AEP; cuando cierre, publicaremos los inscritos en <a href="/participantes" class="text-accent-text underline">participantes</a>.</p>
              @if (comp?.inscripcion?.url) { <a grButton variant="primary" size="l" class="mt-5" [href]="comp!.inscripcion.url" target="_blank" rel="noopener" iconRight="external-link">Inscribirme en la AEP</a> }
            </section>
          } @else if (c.estado === 'proximamente') {
            <gr-alert tone="info" title="La inscripción abre pronto">Abre el {{ fechaLarga(c.abre) }}. Vuelve entonces: las plazas se asignan por orden de pago.</gr-alert>
          } @else if (c.estado === 'cerrada') {
            <gr-alert tone="warning" title="La inscripción está cerrada">Si tienes una duda sobre tu inscripción, escríbenos{{ comp?.evento?.emailContacto ? ' a ' + comp!.evento.emailContacto : '' }}.</gr-alert>
          } @else {
            @if (c.estado === 'completa') { <gr-alert class="mb-6" tone="warning" title="Las {{ c.plazas }} plazas están cubiertas">Puedes apuntarte a la lista de reserva: no se cobra nada hasta que haya plaza, y entonces te enviamos el enlace de pago.</gr-alert> }
            <form class="flex flex-col gap-6 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-7" (ngSubmit)="enviar(c)" novalidate>
              <div class="grid gap-4 md:grid-cols-2">
                @for (f of campos; track f.k) {
                  <label class="flex flex-col gap-2" [class.md:col-span-2]="f.k === 'club'">
                    <span class="text-label-s">{{ f.label }}{{ f.req ? ' *' : '' }}</span>
                    @switch (f.k) {
                      @case ('sexo') { <select class="h-12 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" name="sexo" [(ngModel)]="d.sexo" (ngModelChange)="d.categoria = ''"><option value="F">Mujer</option><option value="M">Hombre</option></select> }
                      @case ('categoria') { <select class="h-12 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" name="categoria" [(ngModel)]="d.categoria"><option value="">Seleccionar categoría</option>@for (k of categorias(); track k) { <option [value]="k">{{ cat(k) }} kg</option> }</select> }
                      @default { <input class="h-12 rounded-md border border-line-strong bg-bg-field px-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" [name]="f.k" [type]="f.type || 'text'" [attr.autocomplete]="f.ac" [attr.placeholder]="f.ph" [(ngModel)]="$any(d)[f.k]" /> }
                    }
                  </label>
                }
              </div>

              @if (c.cupones || c.referidos) {
                <fieldset class="flex flex-col gap-4">
                  <legend class="mb-3 text-ui-h5">Descuentos</legend>
                  <div class="grid gap-4 md:grid-cols-2">
                    @if (c.cupones) {
                      <div class="flex flex-col gap-2">
                        <label class="text-label-s" for="i-cupon">Código de descuento</label>
                        <div class="flex gap-2"><input id="i-cupon" name="cupon" class="h-12 min-w-0 flex-1 rounded-md border bg-bg-field px-3 text-mono-s uppercase" [class]="precio()?.cupon?.valido ? 'border-success' : precio()?.cupon ? 'border-accent-text' : 'border-line-strong'" [(ngModel)]="cupon" (keydown.enter)="$event.preventDefault(); calcular()" />
                          <button type="button" class="h-12 rounded-md border border-line-strong px-3 text-label-s" (click)="precio()?.cupon?.valido ? quitar('cupon') : calcular()">{{ precio()?.cupon?.valido ? 'Quitar' : 'Aplicar' }}</button></div>
                        @if (precio()?.cupon; as x) { <p class="flex items-center gap-1.5 text-body-xs" [class]="x.valido ? 'text-success' : 'text-accent-text'">@if (x.valido) { <gr-icon name="check" [size]="14" /> Cupón aplicado: {{ x.texto }} } @else { {{ x.motivo }} }</p> }
                      </div>
                    }
                    @if (c.referidos) {
                      <div class="flex flex-col gap-2">
                        <label class="text-label-s" for="i-ref">¿Te ha invitado alguien?</label>
                        <div class="flex gap-2"><input id="i-ref" name="referido" placeholder="Código de referido" class="h-12 min-w-0 flex-1 rounded-md border bg-bg-field px-3 text-mono-s uppercase placeholder:normal-case placeholder:text-text-muted" [class]="precio()?.referido?.valido ? 'border-success' : precio()?.referido ? 'border-accent-text' : 'border-line-strong'" [(ngModel)]="referido" (keydown.enter)="$event.preventDefault(); calcular()" />
                          <button type="button" class="h-12 rounded-md border border-line-strong px-3 text-label-s" (click)="precio()?.referido?.valido ? quitar('referido') : calcular()">{{ precio()?.referido?.valido ? 'Quitar' : 'Aplicar' }}</button></div>
                        @if (precio()?.referido; as x) { <p class="flex items-center gap-1.5 text-body-xs" [class]="x.valido ? 'text-success' : 'text-accent-text'">@if (x.valido) { <gr-icon name="check" [size]="14" /> Te ha invitado {{ x.invitadoPor }}: {{ x.texto }} } @else { {{ x.motivo }} }</p> }
                        @else if (c.referidoTexto) { <p class="text-body-xs text-text-tertiary">{{ c.referidoTexto }}.</p> }
                      </div>
                    }
                  </div>
                </fieldset>
              }

              @if (c.estado !== 'completa') {
                <div class="rounded-md border border-line-subtle bg-bg-surface px-5 py-2">
                  <p class="flex justify-between py-2 text-body-s"><span class="text-text-secondary">Inscripción</span><span class="text-mono-s">{{ eur(c.cuota) }}</span></p>
                  @if (precio()?.cupon?.valido) { <p class="flex justify-between py-2 text-body-s"><span class="text-text-secondary">Cupón {{ precio()!.cupon!.codigo }} ({{ precio()!.cupon!.texto }})</span><span class="text-mono-s text-success">−{{ eur(precio()!.cupon!.importe) }}</span></p> }
                  @if (precio()?.referido?.valido) { <p class="flex justify-between py-2 text-body-s"><span class="text-text-secondary">Código {{ precio()!.referido!.codigo }} ({{ precio()!.referido!.texto }})</span><span class="text-mono-s text-success">−{{ eur(precio()!.referido!.importe) }}</span></p> }
                  <p class="flex items-center justify-between border-t border-line-subtle py-3"><span class="text-label-m">Total</span><span class="text-ui-h4">{{ eur(total()) }}</span></p>
                </div>
              }

              <div class="flex flex-col gap-1">
                <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="t" [(ngModel)]="aceptaTerminos" class="mt-1 size-5 accent-[#C42B3E]" /><span>He leído y acepto los <a href="/terminos" target="_blank" class="text-accent-text underline">términos de inscripción</a> y el <a href="/reglamento" target="_blank" class="text-accent-text underline">reglamento</a> *</span></label>
                <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="p" [(ngModel)]="aceptaPrivacidad" class="mt-1 size-5 accent-[#C42B3E]" /><span>He leído la <a href="/privacidad" target="_blank" class="text-accent-text underline">política de privacidad</a> *</span></label>
                <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="i" [(ngModel)]="aceptaImagen" class="mt-1 size-5 accent-[#C42B3E]" /><span>Acepto que se publique mi foto en la web (opcional, se puede retirar)</span></label>
              </div>
              @if (error()) { <gr-alert tone="danger" title="No se pudo completar">{{ error() }}</gr-alert> }
              <button grButton variant="primary" size="l" type="submit" [loading]="enviando()">{{ c.estado === 'completa' ? 'Apuntarme a la reserva' : total() === 0 ? 'Confirmar inscripción' : 'Pagar ' + eur(total()) }}</button>
              <p class="flex items-center justify-center gap-1.5 text-body-xs text-text-muted"><gr-icon name="lock" [size]="13" />{{ c.pasarela === 'stripe' ? 'Pago seguro con Stripe' : 'Pago seguro' }}{{ c.pruebas ? ' · ahora en modo pruebas, no se cobra nada' : '' }}</p>
            </form>
          }
        </div>
      }
    </gr-page>
  `,
})
export class InscripcionPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly eur = eur;
  protected readonly cat = cat;
  protected readonly fechaLarga = fechaLarga;
  protected readonly cfg = signal<ConfigPub | null | undefined>(undefined);
  protected readonly competicion = signal<CompeticionPublica | null>(null);
  protected readonly precio = signal<Precio | null>(null);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  protected readonly cancelado = signal(false);
  protected d = { nombre: '', apellidos: '', email: '', telefono: '', sexo: 'M' as 'F' | 'M', categoria: '', fechaNacimiento: '', licencia: '', club: '' };
  protected cupon = '';
  protected referido = '';
  protected aceptaTerminos = false;
  protected aceptaPrivacidad = false;
  protected aceptaImagen = false;
  protected readonly campos: { k: string; label: string; req?: boolean; type?: string; ac?: string; ph?: string }[] = [
    { k: 'nombre', label: 'Nombre', req: true, ac: 'given-name', ph: 'Tu nombre' }, { k: 'apellidos', label: 'Apellidos', req: true, ac: 'family-name', ph: 'Tus apellidos' },
    { k: 'email', label: 'Email', req: true, type: 'email', ac: 'email', ph: 'email@ejemplo.com' }, { k: 'telefono', label: 'Teléfono', type: 'tel', ac: 'tel', ph: '+34 600 000 000' },
    { k: 'sexo', label: 'Sexo', req: true }, { k: 'categoria', label: 'Categoría de peso', req: true },
    { k: 'fechaNacimiento', label: 'Fecha de nacimiento', req: true, type: 'date', ac: 'bday' }, { k: 'licencia', label: 'Licencia AEP', req: true, ph: 'VAL-0000' },
    { k: 'club', label: 'Club', ph: 'Nombre del club (o vacío si eres independiente)' },
  ];
  protected readonly total = computed(() => this.precio()?.total ?? this.cfg()?.cuota ?? 0);
  /** «II GR Strength Cup!» (edition in Roman numerals, without the year of the name). */
  protected readonly tituloComp = computed(() => {
    const c = this.competicion();
    const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][c?.edicion ?? 0] ?? '';
    return `${roman ? roman + ' ' : ''}${(c?.nombre ?? 'GR Strength Cup').replace(/\s*\d{4}$/, '')}!`;
  });
  protected readonly fechaComp = computed(() => {
    const f = this.competicion()?.fechaInicio;
    return f ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(f)) : 'Por confirmar';
  });

  constructor() {
    const route = inject(ActivatedRoute);
    const comp = inject(Competition);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const [c, cp] = await Promise.all([firstValueFrom(this.http.get<ConfigPub>(base)).catch(() => null), comp.load()]);
      this.cfg.set(c);
      this.competicion.set(cp);
      if (this.browser && this.referido && c?.modo === 'propia') void this.calcular(); // shared link …?ref=CODE
      this.cancelado.set(!!route.snapshot.queryParamMap.get('cancelado'));
      seo.set({ title: 'Inscripción · GR Strength Cup', description: c?.modo === 'propia' ? `Inscríbete en la GR Strength Cup: ${eur(c.cuota)}, ${c.plazas} plazas.` : 'Cómo inscribirte como atleta en la GR Strength Cup (inscripción en la AEP).', path: '/inscripcion' });
    });
    if (this.browser) {
      const p = new URLSearchParams(location.search);
      const ref = p.get('ref');
      if (ref) this.referido = ref; // shared link …/inscripcion?ref=LAURA412
    }
  }

  protected categorias(): string[] {
    return CATEGORIAS_IPF[this.d.sexo];
  }

  protected async calcular(): Promise<void> {
    try {
      this.precio.set(await firstValueFrom(this.http.post<Precio>(`${base}/precio`, { cupon: this.cupon, referido: this.referido, email: this.d.email })));
    } catch (e) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'No se pudo comprobar el código.');
    }
  }

  protected quitar(k: 'cupon' | 'referido'): void {
    if (k === 'cupon') this.cupon = '';
    else this.referido = '';
    void this.calcular();
  }

  protected async enviar(c: ConfigPub): Promise<void> {
    this.error.set('');
    const d = this.d;
    if (!d.nombre.trim() || !d.apellidos.trim() || !d.email.includes('@') || !d.categoria || !d.fechaNacimiento || d.licencia.trim().length < 3) return this.error.set('Completa los campos obligatorios (*).');
    if (!this.aceptaTerminos || !this.aceptaPrivacidad) return this.error.set('Tienes que aceptar los términos, el reglamento y la política de privacidad.');
    const p = this.precio();
    if ((this.cupon && !p?.cupon?.valido) || (this.referido && !p?.referido?.valido)) {
      await this.calcular();
      const q = this.precio();
      if ((this.cupon && !q?.cupon?.valido) || (this.referido && !q?.referido?.valido)) return this.error.set('Revisa los códigos de descuento (o quítalos) antes de continuar.');
    }
    this.enviando.set(true);
    try {
      const r = await firstValueFrom(this.http.post<Estado>(base, { ...d, cupon: this.cupon, referido: this.referido, aceptaTerminos: true, aceptaPrivacidad: true, aceptaImagen: this.aceptaImagen }));
      if (r.checkoutUrl) location.href = r.checkoutUrl;
      else void this.router.navigate(['/inscripcion/estado'], { queryParams: { id: r.id } });
    } catch (e) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'No se pudo completar la inscripción. Inténtalo en unos minutos.');
    } finally {
      this.enviando.set(false);
    }
    void c;
  }
}

/** /inscripcion/estado?id=… — confirmation after paying (polls while the webhook arrives). */
@Component({
  selector: 'gr-inscripcion-estado',
  imports: [Page, GrAlert, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = estado();
    <gr-page title="Inscripción" crumb="Confirmación" [hideTitle]="true">
      <div class="mx-auto max-w-lg">
        @if (e === undefined || (e?.estado === 'pendiente_pago' && intentos() < 10)) {
          <div class="flex flex-col items-center gap-4 py-10 text-center">
            <span class="size-14 animate-spin rounded-full border-4 border-accent border-t-transparent"></span>
            <h1 class="text-display-m">Confirmando el pago…</h1>
            <p class="text-body-m text-text-secondary">No cierres esta página. Tardamos unos segundos en recibir la confirmación del banco.</p>
          </div>
        } @else if (e === null) {
          <gr-alert tone="warning" title="No encontramos esta inscripción">Si has pagado, te llegará un email de confirmación. Si no, vuelve a <a href="/inscripcion" class="underline">inscribirte</a>.</gr-alert>
        } @else if (e.estado === 'pagada' || e.estado === 'gratuita') {
          <div class="flex flex-col items-center gap-3 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-success/40 bg-success/15 text-success"><gr-icon name="circle-check" [size]="30" /></span>
            <h1 class="text-display-m">¡Estás inscrito!</h1>
            <p class="text-body-m text-text-secondary">{{ e.estado === 'pagada' ? 'Pago de ' + eur(e.total) + ' confirmado.' : 'Inscripción confirmada sin pago.' }} Te lo hemos enviado a {{ e.email }}.</p>
          </div>
          <dl class="mt-6 rounded-lg border border-line-subtle bg-bg-card px-5 py-2 text-body-s">
            <div class="flex justify-between border-b border-line-subtle py-3"><dt class="text-text-tertiary">Inscripción</dt><dd>{{ e.categoria }} kg</dd></div>
            @if (e.estado === 'pagada') { <div class="flex justify-between border-b border-line-subtle py-3"><dt class="text-text-tertiary">Pago</dt><dd>{{ eur(e.total) }}{{ e.tarjeta ? ' · ' + e.tarjeta : '' }}</dd></div> }
            @if (e.referencia) { <div class="flex justify-between py-3"><dt class="text-text-tertiary">Referencia</dt><dd class="text-mono-s">{{ e.referencia }}</dd></div> }
          </dl>
          @if (e.codigoReferido) {
            <section class="mt-6 rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-label-l">Invita y recupera parte de tu cuota</h2>
              <p class="mt-1 text-body-s text-text-tertiary">Tus amigos tienen descuento con tu código y te devolvemos una parte de lo que pagaste por cada uno.</p>
              <div class="mt-3 flex items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3"><gr-icon name="send" [size]="16" class="text-text-tertiary" /><span class="flex-1 py-3 text-mono-s">{{ e.codigoReferido }}</span><button type="button" class="h-11 text-label-s text-accent-text" (click)="copiar(e.codigoReferido!)">{{ copiado() ? 'Copiado' : 'Copiar enlace' }}</button></div>
            </section>
          }
          <a grButton size="l" [block]="true" class="mt-6" href="/area-atleta">Ir a mi área de atleta</a>
        } @else if (e.estado === 'reserva') {
          <gr-alert tone="info" title="Estás en la lista de reserva">No se ha cobrado nada. Si queda una plaza libre, te escribiremos a {{ e.email }} con el enlace de pago.</gr-alert>
        } @else if (e.estado === 'pendiente_pago') {
          <gr-alert tone="warning" title="Aún no hemos recibido la confirmación del pago">Si has pagado, te llegará un email en unos minutos. Puedes recargar esta página.</gr-alert>
        } @else {
          <gr-alert tone="danger" title="El pago no se ha completado">No se ha cobrado nada. Puedes volver a intentarlo.</gr-alert>
          <a grButton variant="primary" class="mt-4" href="/inscripcion">Volver a la inscripción</a>
        }
      </div>
    </gr-page>
  `,
})
export class InscripcionEstadoPage {
  private readonly http = inject(HttpClient);
  protected readonly eur = eur;
  protected readonly estado = signal<Estado | null | undefined>(undefined);
  protected readonly intentos = signal(0);
  protected readonly copiado = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(Seo).set({ title: 'Inscripción · GR Strength Cup', description: 'Confirmación de tu inscripción.', path: '/inscripcion/estado', robots: 'noindex' });
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    if (!browser) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      this.estado.set(null);
      return;
    }
    const poll = async () => {
      try {
        const e = await firstValueFrom(this.http.get<Estado>(`${base}/${id}`));
        this.estado.set(e);
        if (e.estado === 'pendiente_pago' && this.intentos() < 10) {
          this.intentos.update((n) => n + 1);
          this.timer = setTimeout(poll, 2000);
        }
      } catch {
        this.estado.set(null);
      }
    };
    void poll();
  }

  protected async copiar(code: string): Promise<void> {
    await navigator.clipboard?.writeText(`${location.origin}/inscripcion?ref=${code}`);
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }
}

interface SesionSim { id: string; descripcion: string; importe: number; email: string; estado: string; cancelUrl: string; pruebas: boolean; tarjetas: [string, string][] }

/** /pago/simulado?s=<service>:<session> — test gateway that imitates Stripe Checkout (Figma 06b). */
@Component({
  selector: 'gr-pago-simulado',
  imports: [FormsModule, GrAlert, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-screen bg-bg-base' },
  template: `
    @let s = sesion();
    <p class="flex h-9 items-center justify-center bg-warning/15 text-mono-xs text-warning">MODO PRUEBAS · NO SE COBRA NADA</p>
    @if (s === undefined) { <div class="mx-auto max-w-md p-8"><gr-skeleton class="h-80 rounded-lg" /></div> }
    @else if (s === null || s.estado === 'caducada') {
      <div class="mx-auto max-w-md p-8"><gr-alert tone="warning" title="Este pago ha caducado">Vuelve a la web y empieza de nuevo la inscripción.</gr-alert><a grButton class="mt-4" href="/inscripcion">Volver a la inscripción</a></div>
    } @else {
      <div class="mx-auto grid max-w-5xl md:min-h-[calc(100vh-36px)] md:grid-cols-2">
        <section class="flex flex-col gap-3 px-5 pt-8 md:bg-bg-surface md:px-12 md:pt-24">
          <a [href]="s.cancelUrl" class="flex h-11 items-center gap-1.5 text-label-s text-text-secondary"><gr-icon name="chevron-left" [size]="16" />GR Strength Cup</a>
          <p class="text-body-m text-text-secondary">{{ s.descripcion }}</p>
          <p class="font-display text-[48px] leading-none">{{ eur(s.importe) }}</p>
        </section>
        <section class="flex flex-col gap-4 px-5 py-8 md:px-12 md:pt-24">
          <h1 class="text-ui-h5">Pagar con tarjeta</h1>
          <label class="flex flex-col gap-1.5"><span class="text-label-s">Email</span><input class="h-12 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" name="email" [(ngModel)]="email" autocomplete="email" /></label>
          <label class="flex flex-col gap-1.5"><span class="text-label-s">Datos de la tarjeta</span>
            <span class="flex items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3"><gr-icon name="ticket" [size]="16" class="text-text-tertiary" /><input class="h-12 min-w-0 flex-1 bg-transparent text-body-m outline-none" name="tarjeta" inputmode="numeric" autocomplete="cc-number" placeholder="1234 1234 1234 1234" [(ngModel)]="tarjeta" /><span class="text-mono-xs text-text-tertiary">12/34 · 123</span></span></label>
          <label class="flex flex-col gap-1.5"><span class="text-label-s">Nombre en la tarjeta</span><input class="h-12 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" name="nombre" autocomplete="cc-name" [(ngModel)]="nombre" /></label>
          <div class="rounded-md bg-bg-raised p-3">
            <p class="text-label-xs text-text-tertiary">Tarjetas de prueba</p>
            @for (t of s.tarjetas; track t[0]) { <button type="button" class="flex w-full justify-between py-1.5 text-left" (click)="tarjeta = t[0]"><span class="text-mono-s">{{ t[0] }}</span><span class="text-body-xs text-text-tertiary">{{ t[1] }}</span></button> }
          </div>
          @if (mensaje()) { <gr-alert [tone]="tresDS() ? 'info' : 'danger'" [title]="tresDS() ? '3D Secure' : 'Pago no completado'">{{ mensaje() }}</gr-alert> }
          @if (tresDS()) {
            <div class="flex gap-2"><button grButton variant="primary" class="flex-1" [loading]="pagando()" (click)="pagar('ok')">Autenticar</button><button grButton class="flex-1" [disabled]="pagando()" (click)="pagar('fallo')">Fallar autenticación</button></div>
          } @else {
            <button grButton variant="primary" size="l" [loading]="pagando()" (click)="pagar('')">Pagar {{ eur(s.importe) }}</button>
          }
        </section>
      </div>
    }
  `,
})
export class PagoSimuladoPage {
  private readonly http = inject(HttpClient);
  protected readonly eur = eur;
  protected readonly sesion = signal<SesionSim | null | undefined>(undefined);
  protected readonly mensaje = signal('');
  protected readonly tresDS = signal(false);
  protected readonly pagando = signal(false);
  protected email = '';
  protected tarjeta = '';
  protected nombre = '';
  private api = '';

  constructor() {
    inject(Seo).set({ title: 'Pago (modo pruebas) · GR Strength Cup', description: 'Pasarela de pago en modo pruebas.', path: '/pago/simulado', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const s = new URLSearchParams(location.search).get('s') ?? '';
    const [svc, id] = s.split(':');
    if (!/^[a-z]+$/.test(svc ?? '') || !/^sim_cs_[a-z0-9]+$/.test(id ?? '')) {
      this.sesion.set(null);
      return;
    }
    this.api = `/api/pagos/simulado/${svc}/${id}`;
    void firstValueFrom(this.http.get<SesionSim>(this.api)).then((x) => {
      this.sesion.set(x);
      this.email = x.email;
    }).catch(() => this.sesion.set(null));
  }

  protected async pagar(tresDS: '' | 'ok' | 'fallo'): Promise<void> {
    this.pagando.set(true);
    this.mensaje.set('');
    try {
      const r = await firstValueFrom(this.http.post<{ estado: string; mensaje?: string; redirect?: string }>(`${this.api}/pagar`, { tarjeta: this.tarjeta, email: this.email, tresDS }));
      if (r.estado === 'pagado' && r.redirect) {
        location.href = r.redirect;
        return;
      }
      this.tresDS.set(r.estado === '3ds');
      this.mensaje.set(r.mensaje ?? 'No se pudo completar el pago.');
    } catch (e) {
      this.tresDS.set(false);
      this.mensaje.set((e as { error?: { detail?: string } }).error?.detail ?? 'No se pudo completar el pago.');
    } finally {
      this.pagando.set(false);
    }
  }
}
