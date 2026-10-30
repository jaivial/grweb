import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { CATEGORIAS_IPF, cat } from '../core/atletas';
import { COMPETITION_SLUG, Competition, type CompeticionPublica } from '../core/competition';
import { Seo } from '../core/seo';
import { instagramOf } from '../layout/layout';
import { Page } from '../layout/page';

interface ConfigPub { modo: 'externa' | 'propia'; estado: 'abierta' | 'proximamente' | 'cerrada' | 'completa'; cuota: number; plazas: number; ocupadas: number; abre?: string; cierra?: string; reserva: boolean; cupones: boolean; referidos: boolean; referidoTexto?: string; pasarela: 'stripe' | 'simulado' | 'ninguna'; pruebas: boolean }
interface Descuento { codigo: string; valido: boolean; importe: number; texto: string; motivo?: string; invitadoPor?: string }
interface Precio { cuota: number; cupon?: Descuento; referido?: Descuento; total: number }
interface Estado { id: string; estado: 'pendiente_pago' | 'pagada' | 'gratuita' | 'reserva' | 'cancelada' | 'fallida'; total: number; email: string; tarjeta?: string; referencia?: string; codigoReferido?: string; checkoutUrl?: string; categoria: string; division?: string }

const base = `/api/competiciones/${COMPETITION_SLUG}/inscripcion`;
export const eur = (c?: number) => ((c ?? 0) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const fechaLarga = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');
/** «35 €», «26,25 €» (Figma: whole euros without decimals in the event strip). */
const eurCorto = (c?: number) => ((c ?? 0) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: (c ?? 0) % 100 ? 2 : 0 });
/** «M 83» → «M −83 kg»; «F 84+» → «F +84 kg». */
const catTexto = (c: string) => {
  const [sexo, k] = c.split(' ');
  return k ? `${sexo} ${cat(k)} kg` : c;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Shared look of the form controls (Figma 06b «Input»: 48 px, radius 10, padding 14). */
const CAMPO = 'h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none';

type Vista = 'cargando' | 'formulario' | 'proximamente' | 'aep' | 'completas' | 'cerrada';
interface Campo { k: keyof InscripcionPage['d']; label: string; req?: boolean; type?: string; ac?: string; ph?: string; error?: string; corto?: string }

/** /inscripcion (Figma pages 06 and 06b): AEP link (external mode) or own registration with payment, coupon and referral. */
@Component({
  selector: 'gr-inscripcion-page',
  imports: [Page, FormsModule, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = cfg();
    @let v = vista();
    <gr-page title="¡Inscríbete a la" [accent]="tituloComp() + '!'" eyebrow="Inscripción" [centrado]="true" [cabecera]="v === 'formulario' || v === 'cargando'"
      subtitle="Rellena tus datos y paga tu plaza en un minuto. Te confirmamos por email.">
      @if (v === 'cargando') { <gr-skeleton class="h-96 rounded-[18px]" /> }

      <!-- Figma 06 «Próximamente»: own registration not open yet, or the AEP has not opened it -->
      @if (v === 'proximamente') {
        <section class="flex flex-col items-center gap-6 pt-2 pb-2 text-center md:gap-8 md:pt-8">
          <p class="inline-flex h-7 items-center rounded-pill border border-warning bg-warning/12 px-3 text-label-xs text-warning uppercase">Próximamente</p>
          <h1 class="text-display-m [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-xl">Próximamente…</h1>
          <gr-icon name="instagram" [size]="56" class="text-text-primary" />
          <p class="max-w-[560px] text-body-m text-text-secondary md:text-body-l">
            @if (c?.modo === 'propia' && c?.abre) { La inscripción a la {{ nombreComp() }} abre el {{ fechaLarga(c!.abre) }}. Síguenos en Instagram para no perdértelo. }
            @else { Las inscripciones a la {{ nombreComp() }} todavía no están abiertas. Síguenos en Instagram para mantenerte informado. }
          </p>
          <a grButton size="l" [href]="instagram()" target="_blank" rel="noopener" icon="instagram" class="border-white/10! bg-white/6!">Síguenos en Instagram</a>
        </section>
      }

      <!-- Figma 06 «Modo AEP» -->
      @if (v === 'aep') {
        <section class="flex flex-col items-center gap-6 pt-2 text-center md:gap-8 md:pt-8">
          <h1 class="text-display-m [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-xl">Inscripciones AEP</h1>
          <p class="max-w-[560px] text-body-m text-text-secondary md:text-body-l">La inscripción al campeonato se realiza en la web oficial de la Asociación Española de Powerlifting.</p>
          @if (urlAep()) { <a grButton variant="primary" size="l" [href]="urlAep()" target="_blank" rel="noopener" iconRight="external-link" class="w-full md:w-auto">Ir a la inscripción oficial AEP</a> }
          @else {
            <p class="flex w-full max-w-[560px] items-center gap-2 rounded-xl border border-warning bg-warning/8 px-4 py-3 text-left text-body-s text-text-secondary"><gr-icon name="clock" [size]="18" class="shrink-0 text-warning" />Todavía no se ha publicado la URL de las inscripciones de la AEP. Próximamente…</p>
          }
        </section>
      }

      <!-- Figma 06 «Completas» (and the closed registration, same layout) -->
      @if (v === 'completas' || v === 'cerrada') {
        <section class="flex flex-col items-center gap-6 pt-2 text-center md:gap-8 md:pt-8">
          <p class="inline-flex h-7 items-center rounded-pill border border-text-tertiary bg-text-tertiary/12 px-3 text-label-xs text-text-tertiary uppercase">{{ v === 'completas' ? 'Inscripciones completas' : 'Inscripciones cerradas' }}</p>
          <h1 class="text-display-m [text-shadow:0_4px_24px_rgb(0_0_0/0.6)] md:text-display-xl">{{ v === 'completas' ? 'Plazas completas' : 'Inscripción cerrada' }}</h1>
          @if (plazas()) {
            <p class="flex items-end gap-2"><span class="font-display text-[60px] leading-none text-accent-text md:text-[72px]">{{ inscritos() }}</span><span class="pb-1 text-display-2xs text-text-tertiary md:text-display-xs">/ {{ plazas() }} atletas</span></p>
          }
          <p class="max-w-[640px] text-body-m text-text-secondary md:text-body-l">
            @if (v === 'completas' && c?.modo !== 'propia') { La inscripción de la {{ nombreComp() }} se gestiona a través de la AEP y ya no quedan plazas. Si alguien se da de baja, la federación avisa por orden de la lista de espera. }
            @else if (v === 'completas') { Ya no quedan plazas para la {{ nombreComp() }}. Si se libera alguna, avisaremos por orden de la lista de reserva. }
            @else { La inscripción de la {{ nombreComp() }} está cerrada. Si tienes una duda sobre tu inscripción, escríbenos{{ contacto() ? ' a ' + contacto() : '' }}. }
          </p>
          <div class="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <a grButton variant="primary" size="l" href="/atletas">Ver atletas inscritos</a>
            @if (v === 'completas' && c?.modo !== 'propia' && urlAep()) { <a grButton variant="outline" size="l" [href]="urlAep()" target="_blank" rel="noopener">Lista de espera en la AEP</a> }
          </div>
          <div class="grid w-full gap-4 pt-6 text-left md:max-w-[960px] md:grid-cols-2">
            <article class="flex flex-col items-start gap-3 rounded-2xl border border-line-subtle bg-bg-card p-6">
              <span class="flex size-11 items-center justify-center rounded-xl bg-accent/12 text-accent-text"><gr-icon name="user" [size]="20" /></span>
              <h2 class="text-ui-h5">¿Ya estás inscrito/a?</h2>
              <p class="text-body-s text-text-tertiary">Entra en tu área de atleta con el email {{ c?.modo === 'propia' ? 'de tu inscripción' : 'de la AEP' }}: completa tu perfil, revisa tu flight y deja tus alturas de rack.</p>
              <a grButton variant="glass" href="/area-atleta" iconRight="arrow-right" class="mt-auto">Área de atleta</a>
            </article>
            @if (entradas()) {
              <article class="flex flex-col items-start gap-3 rounded-2xl border border-line-subtle bg-bg-card p-6">
                <span class="flex size-11 items-center justify-center rounded-xl bg-accent/12 text-accent-text"><gr-icon name="ticket" [size]="20" /></span>
                <h2 class="text-ui-h5">¿Vienes a animar?</h2>
                <p class="text-body-s text-text-tertiary">La entrada es gratuita con reserva. Te llega un QR por email{{ sorteo() ? ' y puedes sumarte al sorteo benéfico' : '' }}.</p>
                <a grButton variant="glass" href="/entradas" iconRight="arrow-right" class="mt-auto">Reservar entrada</a>
              </article>
            }
          </div>
        </section>
      }

      <!-- Figma 06b: own registration with payment, coupon and referral -->
      @if (v === 'formulario' && c) {
        <dl class="flex flex-col gap-3 rounded-[18px] border border-line-subtle bg-bg-card p-4 md:flex-row md:justify-center md:gap-8 md:px-6">
          @for (m of meta(); track m.k) {
            <div class="flex items-center gap-3">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent-text"><gr-icon [name]="m.icon" [size]="16" /></span>
              <span class="flex flex-col gap-0.5"><dt class="text-mono-xs text-text-muted">{{ m.k }}</dt><dd class="text-label-s">{{ m.v }}</dd></span>
            </div>
          }
        </dl>

        @if (pagoCancelado(); as pc) {
          <!-- Figma 06b «Pago rechazado»: the place stays held while the payment page is valid -->
          <div class="flex items-start gap-3 rounded-xl border border-accent bg-accent/8 p-4 md:items-center" role="alert">
            <gr-icon name="circle-alert" [size]="20" class="shrink-0 text-accent-text" />
            <div class="flex min-w-0 flex-1 flex-col items-start gap-3 md:flex-row md:items-center">
              <p class="flex-1 text-body-s">El pago no se ha completado y no se ha cobrado nada.{{ pc.checkoutUrl ? ' Tu plaza sigue reservada unos minutos.' : '' }}</p>
              @if (pc.checkoutUrl) { <a [href]="pc.checkoutUrl" class="flex h-9 shrink-0 items-center rounded-sm bg-accent/15 px-2.5 text-label-s text-accent-text hover:bg-accent/25">Reintentar el pago</a> }
            </div>
            <button type="button" class="flex size-8 shrink-0 items-center justify-center text-text-tertiary hover:text-text-primary" aria-label="Cerrar aviso" (click)="pagoCancelado.set(null)"><gr-icon name="x" [size]="16" /></button>
          </div>
        }
        @if (c.pasarela === 'ninguna' && c.estado !== 'completa') {
          <p class="flex items-start gap-3 rounded-xl border border-line-strong bg-bg-card p-4 text-body-s text-text-secondary"><gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-text-tertiary" />Todavía no podemos cobrar la inscripción online. Solo se aceptan códigos que la dejan gratis.</p>
        }
        @if (c.estado === 'completa') {
          <!-- Figma 06b «Plazas completas → reserva» -->
          <p class="flex items-start gap-3 rounded-xl border border-warning bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />Las {{ c.plazas }} plazas están cubiertas. Puedes apuntarte a la lista de reserva: no se cobra nada hasta que haya plaza, y entonces te enviamos el enlace de pago.</p>
        }
        @if (resumenErrores().length) {
          <!-- Figma 06 «Errores de validación» -->
          <div #errores tabindex="-1" class="rounded-xl border border-accent bg-accent/8 p-4 outline-none" role="alert">
            <p class="flex items-center gap-2 text-label-s"><gr-icon name="circle-alert" [size]="18" class="text-accent-text" />Revisa {{ resumenErrores().length === 1 ? 'un campo' : resumenErrores().length + ' campos' }} antes de enviar</p>
            <ul class="mt-2 flex flex-col gap-1 pl-1 text-body-s text-text-secondary">@for (e of resumenErrores(); track e) { <li>• {{ e }}</li> }</ul>
          </div>
        }

        <form class="flex flex-col gap-5 rounded-[18px] border border-line-subtle bg-bg-card p-4 md:p-7" (ngSubmit)="enviar()" novalidate>
          <div class="grid gap-4 md:grid-cols-2">
            @for (f of campos; track f.k) {
              <div class="flex min-w-0 flex-col gap-2">
                <label class="text-label-s" [for]="'i-' + f.k">{{ f.label }}{{ f.req ? ' *' : '' }}</label>
                @switch (f.k) {
                  @case ('sexo') {
                    <span class="relative"><select [id]="'i-' + f.k" [class]="CAMPO + ' appearance-none pr-10 border-line-strong'" name="sexo" [(ngModel)]="d.sexo" (ngModelChange)="d.categoria = ''; revalidar()"><option value="F">Mujer</option><option value="M">Hombre</option></select>
                      <gr-icon name="chevron-down" [size]="16" class="pointer-events-none absolute top-4 right-3.5 text-accent-text" /></span>
                  }
                  @case ('categoria') {
                    <span class="relative"><select [id]="'i-' + f.k" [class]="CAMPO + ' appearance-none pr-10 ' + (err()[f.k] ? 'border-accent-text' : 'border-line-strong') + (d.categoria ? '' : ' text-text-muted')" name="categoria" [(ngModel)]="d.categoria" (ngModelChange)="revalidar()" [attr.aria-invalid]="!!err()[f.k]" [attr.aria-describedby]="err()[f.k] ? 'e-' + f.k : null"><option value="">Seleccionar categoría</option>@for (k of categorias(); track k) { <option [value]="k">{{ cat(k) }} kg</option> }</select>
                      <gr-icon name="chevron-down" [size]="16" class="pointer-events-none absolute top-4 right-3.5 text-accent-text" /></span>
                  }
                  @default {
                    <input [id]="'i-' + f.k" [class]="CAMPO + ' ' + (err()[f.k] ? 'border-accent-text' : 'border-line-strong')" [name]="f.k" [attr.name]="f.k" [type]="f.type || 'text'" [attr.autocomplete]="f.ac" [attr.placeholder]="f.ph" [(ngModel)]="d[f.k]" (ngModelChange)="revalidar()"
                      [attr.aria-invalid]="!!err()[f.k]" [attr.aria-describedby]="err()[f.k] ? 'e-' + f.k : null" />
                  }
                }
                @if (err()[f.k]; as e) { <p [id]="'e-' + f.k" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
              </div>
            }
          </div>

          @if (c.cupones || c.referidos) {
            <fieldset class="flex min-w-0 flex-col gap-3">
              <legend class="mb-3 text-ui-h5">Descuentos</legend>
              <div class="grid gap-3 md:grid-cols-2">
                @if (c.cupones) {
                  <div class="flex min-w-0 flex-col gap-2">
                    <label class="text-label-s" for="i-cupon">Código de descuento</label>
                    <span class="flex h-12 items-center rounded-[10px] border bg-bg-field pr-3.5 focus-within:border-accent-text" [class]="precio()?.cupon && !precio()!.cupon!.valido ? 'border-accent-text' : 'border-line-strong'">
                      <input id="i-cupon" name="cupon" class="h-full w-0 min-w-0 flex-1 bg-transparent px-3.5 text-body-m uppercase outline-none placeholder:normal-case placeholder:text-text-muted" [(ngModel)]="cupon" [readonly]="!!precio()?.cupon?.valido" (keydown.enter)="$event.preventDefault(); calcular()" />
                      <button type="button" class="h-full shrink-0 pl-2 text-label-s text-accent-text hover:underline" (click)="precio()?.cupon?.valido ? quitar('cupon') : calcular()">{{ precio()?.cupon?.valido ? 'Quitar' : 'Aplicar' }}</button>
                    </span>
                    @if (precio()?.cupon; as x) { <p class="flex items-center gap-1.5 text-body-xs" [class]="x.valido ? 'text-success' : 'text-accent-text'" aria-live="polite">@if (x.valido) { <gr-icon name="check" [size]="14" /> Cupón aplicado: {{ x.texto }} sobre la cuota } @else { {{ x.motivo }} }</p> }
                  </div>
                }
                @if (c.referidos) {
                  <div class="flex min-w-0 flex-col gap-2">
                    <label class="text-label-s" for="i-ref">¿Te ha invitado alguien?</label>
                    <span class="flex h-12 items-center rounded-[10px] border bg-bg-field pr-3.5 focus-within:border-accent-text" [class]="precio()?.referido && !precio()!.referido!.valido ? 'border-accent-text' : 'border-line-strong'">
                      <input id="i-ref" name="referido" placeholder="Código de referido" class="h-full w-0 min-w-0 flex-1 bg-transparent px-3.5 text-body-m uppercase outline-none placeholder:normal-case placeholder:text-text-muted" [(ngModel)]="referido" [readonly]="!!precio()?.referido?.valido" (keydown.enter)="$event.preventDefault(); calcular()" />
                      <button type="button" class="h-full shrink-0 pl-2 text-label-s text-accent-text hover:underline" (click)="precio()?.referido?.valido ? quitar('referido') : calcular()">{{ precio()?.referido?.valido ? 'Quitar' : 'Aplicar' }}</button>
                    </span>
                    @if (precio()?.referido; as x) { <p class="flex items-center gap-1.5 text-body-xs" [class]="x.valido ? 'text-success' : 'text-accent-text'" aria-live="polite">@if (x.valido) { <gr-icon name="check" [size]="14" /> Te ha invitado {{ x.invitadoPor }}: {{ x.texto }} } @else { {{ x.motivo }} }</p> }
                    @else if (c.referidoTexto) { <p class="text-body-xs text-text-tertiary">Si un amigo ya inscrito te pasó su código, tienes {{ c.referidoTexto.replace(' con el código de un amigo inscrito', '') }}.</p> }
                  </div>
                }
              </div>
            </fieldset>
          }

          @if (c.estado !== 'completa') {
            <div class="rounded-[14px] border border-line-subtle bg-bg-surface px-5 py-2">
              <p class="flex justify-between gap-4 py-2.5 text-body-s"><span class="text-text-secondary">Inscripción · {{ tituloComp() }}</span><span class="text-mono-s">{{ eur(c.cuota) }}</span></p>
              @if (precio()?.cupon?.valido) { <p class="flex justify-between gap-4 py-2.5 text-body-s"><span class="text-text-secondary">Cupón {{ precio()!.cupon!.codigo }} ({{ precio()!.cupon!.texto }})</span><span class="text-mono-s text-success">−{{ eur(precio()!.cupon!.importe) }}</span></p> }
              @if (precio()?.referido?.valido) { <p class="flex justify-between gap-4 py-2.5 text-body-s"><span class="text-text-secondary">Código {{ precio()!.referido!.codigo }} ({{ precio()!.referido!.texto }})</span><span class="text-mono-s text-success">−{{ eur(precio()!.referido!.importe) }}</span></p> }
              <p class="flex items-center justify-between border-t border-line-subtle py-3"><span class="text-label-m">Total</span><span class="text-ui-h4">{{ eur(total()) }}</span></p>
            </div>
          }

          <div class="flex flex-col">
            @for (k of checks; track k.k) {
              <label class="flex min-h-11 items-start gap-2.5 py-1 text-body-s" [class]="k.req ? 'text-text-primary' : 'text-text-secondary'">
                <span class="relative mt-px flex size-5 shrink-0 items-center justify-center">
                  <input type="checkbox" [name]="k.k" [attr.name]="k.k" [(ngModel)]="acepta[k.k]" (ngModelChange)="revalidar()" class="peer size-[18px] appearance-none rounded-[5px] border bg-bg-base checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text" [class]="k.req && err()['terminos'] && !acepta[k.k] ? 'border-accent-text' : 'border-line-strong'" />
                  @if (acepta[k.k]) { <gr-icon name="check" [size]="12" class="pointer-events-none absolute text-white" /> }
                </span>
                <span>
                  @switch (k.k) {
                    @case ('terminos') { He leído y acepto los <a href="/terminos" target="_blank" class="text-accent-text hover:underline">términos de inscripción</a> y el <a href="/reglamento" target="_blank" class="text-accent-text hover:underline">reglamento</a> * }
                    @case ('privacidad') { He leído la <a href="/privacidad" target="_blank" class="text-accent-text hover:underline">política de privacidad</a> * }
                    @default { Acepto que se publique mi foto en la web (opcional, se puede retirar) }
                  }
                </span>
              </label>
            }
            @if (err()['terminos']; as e) { <p class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
          </div>
          @if (error()) { <p class="flex items-start gap-2 rounded-xl border border-accent bg-accent/8 p-4 text-body-s" role="alert"><gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0 text-accent-text" />{{ error() }}</p> }
          <div class="flex flex-col gap-3">
            <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="enviando()">{{ c.estado === 'completa' ? 'Apuntarme a la reserva' : total() === 0 ? 'Confirmar inscripción' : 'Pagar ' + eur(total()) }}</button>
            <p class="text-center text-body-xs text-text-muted">
              @if (c.estado === 'completa') { No se cobra nada hasta que haya plaza. }
              @else if (total() === 0) { Sin pago: te inscribimos al confirmar. }
              @else { <gr-icon name="lock" [size]="13" class="mr-1.5 inline-block align-[-2px]" />{{ c.pasarela === 'stripe' ? 'Pago seguro con Stripe' : 'Pago seguro' }}{{ c.pruebas ? ' · ahora en modo pruebas, no se cobra nada' : '' }} }
            </p>
          </div>
        </form>
      }
    </gr-page>
  `,
})
export class InscripcionPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly eur = eur;
  protected readonly cat = cat;
  protected readonly fechaLarga = fechaLarga;
  protected readonly CAMPO = CAMPO;
  protected readonly cfg = signal<ConfigPub | null | undefined>(undefined);
  protected readonly competicion = signal<CompeticionPublica | null>(null);
  protected readonly precio = signal<Precio | null>(null);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  /** ?cancelado=<id>: the buyer came back from the payment page without paying. */
  protected readonly pagoCancelado = signal<{ checkoutUrl?: string } | null>(null);
  /** Field errors, shown after the first submit and updated while the person fixes them. */
  protected readonly err = signal<Record<string, string>>({});
  private intentado = false;
  d = { nombre: '', apellidos: '', email: '', telefono: '', sexo: 'M' as 'F' | 'M', categoria: '', fechaNacimiento: '', licencia: '', club: '' };
  protected cupon = '';
  protected referido = '';
  protected acepta: Record<'terminos' | 'privacidad' | 'imagen', boolean> = { terminos: false, privacidad: false, imagen: false };
  protected readonly checks = [{ k: 'terminos' as const, req: true }, { k: 'privacidad' as const, req: true }, { k: 'imagen' as const, req: false }];
  protected readonly campos: Campo[] = [
    { k: 'nombre', label: 'Nombre', req: true, ac: 'given-name', ph: 'Tu nombre', error: 'El nombre es obligatorio', corto: 'es obligatorio' },
    { k: 'apellidos', label: 'Apellidos', req: true, ac: 'family-name', ph: 'Tus apellidos', error: 'Los apellidos son obligatorios', corto: 'son obligatorios' },
    { k: 'email', label: 'Email', req: true, type: 'email', ac: 'email', ph: 'email@ejemplo.com', error: 'Introduce un email válido', corto: 'introduce un email válido' },
    { k: 'telefono', label: 'Teléfono', type: 'tel', ac: 'tel', ph: '+34 600 000 000' },
    { k: 'sexo', label: 'Sexo', req: true }, { k: 'categoria', label: 'Categoría de peso', req: true, error: 'Selecciona tu categoría', corto: 'selecciona tu categoría' },
    { k: 'fechaNacimiento', label: 'Fecha de nacimiento', req: true, type: 'date', ac: 'bday', error: 'Indica tu fecha de nacimiento', corto: 'indica tu fecha de nacimiento' },
    { k: 'licencia', label: 'Licencia AEP', req: true, ph: 'VAL-0000', error: 'Indica tu número de licencia AEP', corto: 'indica tu número de licencia' },
    { k: 'club', label: 'Club', ph: 'Nombre del club (o vacío si eres independiente)' },
  ];
  protected readonly total = computed(() => this.precio()?.total ?? this.cfg()?.cuota ?? 0);
  protected readonly vista = computed<Vista>(() => {
    const c = this.cfg();
    const comp = this.competicion();
    if (c === undefined) return 'cargando';
    if (c?.modo === 'propia') return c.estado === 'proximamente' ? 'proximamente' : c.estado === 'cerrada' ? 'cerrada' : 'formulario';
    // external (AEP) registration: the state the organiser set in «Evento»
    switch (comp?.inscripcion?.estado) {
      case 'proximamente': return 'proximamente';
      case 'completa': return 'completas';
      case 'cerrada': return 'cerrada';
      default: return 'aep';
    }
  });
  /** «II GR Strength Cup» (edition in Roman numerals, without the year of the name). */
  protected readonly tituloComp = computed(() => {
    const c = this.competicion();
    const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][c?.edicion ?? 0] ?? '';
    return `${roman ? roman + ' ' : ''}${(c?.nombre ?? 'GR Strength Cup').replace(/\s*\d{4}$/, '')}`;
  });
  protected readonly nombreComp = computed(() => this.competicion()?.nombre ?? 'GR Strength Cup');
  protected readonly urlAep = computed(() => this.competicion()?.inscripcion?.url ?? '');
  protected readonly instagram = computed(() => instagramOf(this.competicion()));
  protected readonly contacto = computed(() => this.competicion()?.evento?.emailContacto ?? '');
  protected readonly plazas = computed(() => this.cfg()?.plazas || this.competicion()?.inscripcion?.plazas || 0);
  protected readonly inscritos = computed(() => Math.min(this.cfg()?.ocupadas ?? 0, this.plazas()) || (this.vista() === 'completas' ? this.plazas() : 0));
  protected readonly entradas = computed(() => this.competicion()?.modulos?.['entradas'] !== false);
  protected readonly sorteo = computed(() => this.competicion()?.modulos?.['sorteo'] === true);
  protected readonly meta = computed(() => {
    const c = this.cfg();
    const f = this.competicion()?.fechaInicio;
    return [
      { k: 'Fecha', icon: 'calendar' as const, v: f ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(f)).replace(/ de /g, ' ') : 'Por confirmar' },
      { k: 'Sede', icon: 'map-pin' as const, v: `${this.competicion()?.sede?.ciudad || 'Almussafes'} (Valencia)` },
      { k: 'Plazas', icon: 'user' as const, v: `${c?.plazas || '—'}${c?.modo === 'propia' ? ' · ' + eurCorto(c.cuota) : ''}` },
    ];
  });
  protected readonly resumenErrores = computed(() => {
    const e = this.err();
    const l = this.campos.filter((f) => e[f.k]).map((f) => `${f.label}: ${f.corto}`);
    if (e['terminos']) l.push('Términos y privacidad: acéptalos para continuar');
    return l;
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
      seo.set({ title: 'Inscripción · GR Strength Cup', description: c?.modo === 'propia' ? `Inscríbete en la GR Strength Cup: ${eur(c.cuota)}, ${c.plazas} plazas.` : 'Cómo inscribirte como atleta en la GR Strength Cup (inscripción en la AEP).', path: '/inscripcion' });
    });
    if (this.browser) {
      const p = new URLSearchParams(location.search);
      const ref = p.get('ref');
      if (ref) this.referido = ref; // shared link …/inscripcion?ref=LAURA412
      const cancelado = route.snapshot.queryParamMap.get('cancelado');
      if (cancelado) {
        this.pagoCancelado.set({});
        // the payment page stays valid while the place is held: offer to go back to it
        if (/^[0-9a-f-]{36}$/.test(cancelado)) void firstValueFrom(this.http.get<Estado>(`${base}/${cancelado}`)).then((e) => this.pagoCancelado.set(e.estado === 'pendiente_pago' ? { checkoutUrl: e.checkoutUrl } : {}), () => undefined);
      }
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

  private validar(): Record<string, string> {
    const d = this.d;
    const e: Record<string, string> = {};
    const msg = (k: string) => this.campos.find((f) => f.k === k)!.error!;
    if (!d.nombre.trim()) e['nombre'] = msg('nombre');
    if (!d.apellidos.trim()) e['apellidos'] = msg('apellidos');
    if (!EMAIL.test(d.email.trim())) e['email'] = msg('email');
    if (!d.categoria) e['categoria'] = msg('categoria');
    if (!d.fechaNacimiento) e['fechaNacimiento'] = msg('fechaNacimiento');
    if (d.licencia.trim().length < 3) e['licencia'] = msg('licencia');
    if (!this.acepta.terminos || !this.acepta.privacidad) e['terminos'] = 'Acepta los términos, el reglamento y la política de privacidad';
    return e;
  }

  protected revalidar(): void {
    if (this.intentado) this.err.set(this.validar());
  }

  protected async enviar(): Promise<void> {
    this.error.set('');
    this.intentado = true;
    const e = this.validar();
    this.err.set(e);
    if (Object.keys(e).length) {
      // the summary sits above the form: take the person there (Figma 06 «Errores de validación»)
      setTimeout(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('[role=alert][tabindex]')?.focus({ preventScroll: false }));
      return;
    }
    const p = this.precio();
    if ((this.cupon && !p?.cupon?.valido) || (this.referido && !p?.referido?.valido)) {
      await this.calcular();
      const q = this.precio();
      if ((this.cupon && !q?.cupon?.valido) || (this.referido && !q?.referido?.valido)) return this.error.set('Revisa los códigos de descuento (o quítalos) antes de continuar.');
    }
    this.enviando.set(true);
    try {
      const r = await firstValueFrom(this.http.post<Estado>(base, { ...this.d, cupon: this.cupon, referido: this.referido, aceptaTerminos: true, aceptaPrivacidad: true, aceptaImagen: this.acepta.imagen }));
      if (r.checkoutUrl) location.href = r.checkoutUrl;
      else void this.router.navigate(['/inscripcion/estado'], { queryParams: { id: r.id } });
    } catch (err) {
      this.error.set((err as { error?: { detail?: string } }).error?.detail ?? 'No se pudo completar la inscripción. Inténtalo en unos minutos.');
    } finally {
      this.enviando.set(false);
    }
  }
}

/** /inscripcion/estado?id=… — confirmation after paying (polls while the webhook arrives). Figma 06b «/inscripcion/confirmada». */
@Component({
  selector: 'gr-inscripcion-estado',
  imports: [Page, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = estado();
    <gr-page title="Inscripción" [centrado]="true" [cabecera]="false">
      <div class="mx-auto flex w-full max-w-[560px] flex-col gap-5 md:pt-4">
        @if (e === undefined || (e?.estado === 'pendiente_pago' && intentos() < 10)) {
          <div class="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
            <span class="size-14 animate-spin rounded-full border-4 border-accent/25 border-t-accent" aria-hidden="true"></span>
            <h1 class="mt-1 text-display-s md:text-display-m">Confirmando el pago…</h1>
            <p class="text-body-m text-text-secondary">No cierres esta página. Tardamos unos segundos en recibir la confirmación del banco.</p>
          </div>
        } @else if (e === null) {
          <div class="flex flex-col items-center gap-3 text-center">
            <h1 class="text-display-s md:text-display-m">No encontramos esta inscripción</h1>
            <p class="text-body-m text-text-secondary">Si has pagado, te llegará un email de confirmación. Si no, vuelve a <a href="/inscripcion" class="text-accent-text hover:underline">inscribirte</a>.</p>
          </div>
        } @else if (e.estado === 'pagada' || e.estado === 'gratuita') {
          <div class="flex flex-col items-center gap-2.5 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-success bg-success/14 text-success"><gr-icon name="circle-check" [size]="30" /></span>
            <h1 class="mt-2.5 text-display-m">¡Estás inscrito!</h1>
            <p class="text-body-m text-text-secondary">{{ e.estado === 'pagada' ? 'Pago de ' + eur(e.total) + ' confirmado.' : 'Inscripción confirmada sin pago.' }} Te lo hemos enviado a {{ e.email }}.</p>
          </div>
          <dl class="rounded-[18px] border border-line-subtle bg-bg-card px-5 py-2">
            <div class="flex justify-between gap-4 py-3" [class.border-b]="e.estado === 'pagada' || e.referencia" [class.border-line-subtle]="true"><dt class="text-body-s text-text-tertiary">Inscripción</dt><dd class="text-label-s">{{ catTexto(e.categoria) }}{{ e.division ? ' · ' + e.division : '' }}</dd></div>
            @if (e.estado === 'pagada') { <div class="flex justify-between gap-4 py-3" [class.border-b]="!!e.referencia" [class.border-line-subtle]="true"><dt class="text-body-s text-text-tertiary">Pago</dt><dd class="text-label-s">{{ eur(e.total) }}{{ e.tarjeta ? ' · ' + e.tarjeta : '' }}</dd></div> }
            @if (e.referencia) { <div class="flex justify-between gap-4 py-3"><dt class="text-body-s text-text-tertiary">Referencia</dt><dd class="text-label-s">{{ e.referencia }}</dd></div> }
          </dl>
          @if (e.codigoReferido) {
            <section class="flex flex-col gap-3 rounded-[18px] border border-line-subtle bg-bg-card p-6">
              <h2 class="text-label-m">Invita y recupera parte de tu cuota</h2>
              <p class="text-body-xs text-text-tertiary">Tus amigos tienen descuento con tu código y te devolvemos una parte de lo que pagaste por cada uno.</p>
              <div class="flex h-12 items-center gap-2.5 rounded-[10px] border border-line-strong bg-bg-field pl-3.5"><gr-icon name="link" [size]="16" class="text-text-tertiary" /><span class="min-w-0 flex-1 truncate text-mono-s">{{ e.codigoReferido }}</span><button type="button" class="h-full px-3.5 text-label-s text-accent-text hover:underline" (click)="copiar(e.codigoReferido!)">{{ copiado() ? 'Copiado' : 'Copiar' }}</button></div>
            </section>
          }
          <a grButton variant="outline" size="l" [block]="true" href="/area-atleta">Ir a mi área de atleta</a>
        } @else if (e.estado === 'reserva') {
          <div class="flex flex-col items-center gap-2.5 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-warning bg-warning/12 text-warning"><gr-icon name="clock" [size]="30" /></span>
            <h1 class="mt-2.5 text-display-m">Estás en la reserva</h1>
            <p class="text-body-m text-text-secondary">No se ha cobrado nada. Si queda una plaza libre, te escribiremos a {{ e.email }} con el enlace de pago.</p>
          </div>
          <a grButton variant="outline" size="l" [block]="true" href="/">Volver al inicio</a>
        } @else {
          <!-- Figma 06b «Pago rechazado» -->
          <div class="flex items-start gap-3 rounded-xl border border-accent bg-accent/8 p-4 md:items-center" role="alert">
            <gr-icon name="circle-alert" [size]="20" class="shrink-0 text-accent-text" />
            <div class="flex min-w-0 flex-1 flex-col items-start gap-3 md:flex-row md:items-center">
              <p class="flex-1 text-body-s">{{ e.estado === 'pendiente_pago' ? 'Aún no hemos recibido la confirmación del pago. Si has pagado, te llegará un email en unos minutos.' : 'El pago no se ha completado y no se ha cobrado nada.' }}{{ e.checkoutUrl ? ' Tu plaza sigue reservada unos minutos.' : '' }}</p>
              @if (e.checkoutUrl) { <a [href]="e.checkoutUrl" class="flex h-9 shrink-0 items-center rounded-sm bg-accent/15 px-2.5 text-label-s text-accent-text hover:bg-accent/25">Reintentar el pago</a> }
            </div>
          </div>
          <a href="/inscripcion" class="self-center py-2 text-label-s text-text-secondary hover:text-text-primary">{{ e.estado === 'pendiente_pago' ? 'Volver a la inscripción' : 'Cambiar los datos' }}</a>
        }
      </div>
    </gr-page>
  `,
})
export class InscripcionEstadoPage {
  private readonly http = inject(HttpClient);
  protected readonly eur = eur;
  protected readonly catTexto = catTexto;
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

interface SesionSim { id: string; descripcion: string; importe: number; email: string; estado: string; cancelUrl: string; pruebas: boolean; tarjetas: [string, string][]; lineas?: { concepto: string; importe: number }[] }

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
      <!-- Figma 06b «Pasarela simulada»: summary half (surface) and payment half, 420 px columns -->
      <div class="grid md:min-h-[calc(100vh-36px)] md:grid-cols-2">
        <section class="flex flex-col gap-4 px-5 pt-6 md:bg-bg-surface md:px-16 md:pt-24 md:pb-16 xl:pl-[120px]">
          <div class="flex w-full flex-col gap-4 md:max-w-[420px]">
            <a [href]="s.cancelUrl" class="-my-2.5 flex h-11 items-center gap-1.5 self-start text-label-s text-text-secondary hover:text-text-primary"><gr-icon name="arrow-left" [size]="16" />GR Strength Cup</a>
            <p class="text-body-m text-text-secondary">{{ s.descripcion }}</p>
            <p class="text-display-m md:text-display-l">{{ eur(s.importe) }}</p>
            @if (s.lineas?.length) {
              <dl class="hidden md:block">
                @for (l of s.lineas; track l.concepto) { <div class="flex justify-between border-b border-line-subtle py-2.5"><dt class="text-body-s text-text-tertiary">{{ l.concepto }}</dt><dd class="text-label-s">{{ l.importe < 0 ? '−' + eur(-l.importe) : eur(l.importe) }}</dd></div> }
                <div class="flex justify-between border-b border-line-subtle py-2.5"><dt class="text-body-s text-text-tertiary">Total</dt><dd class="text-label-s">{{ eur(s.importe) }}</dd></div>
              </dl>
            }
          </div>
        </section>
        <section class="flex flex-col gap-4 px-5 pt-6 pb-10 md:px-16 md:pt-24 md:pb-16">
          <div class="flex w-full flex-col gap-4 md:max-w-[420px]">
          <h1 class="text-ui-h5">Pagar con tarjeta</h1>
          <label class="flex flex-col gap-2"><span class="text-label-s">Email</span><input class="h-12 rounded-[10px] border border-line-strong bg-bg-field px-3.5 text-body-m focus:border-accent-text focus:outline-none" name="email" [(ngModel)]="email" autocomplete="email" /></label>
          <label class="flex flex-col gap-2"><span class="text-label-s">Datos de la tarjeta</span>
            <span class="flex items-center gap-2.5 rounded-[10px] border border-line-strong bg-bg-field px-3.5 focus-within:border-accent-text"><gr-icon name="credit-card" [size]="16" class="text-text-tertiary" /><input class="h-12 w-0 min-w-0 flex-1 bg-transparent text-body-m outline-none placeholder:text-text-muted" name="tarjeta" inputmode="numeric" autocomplete="cc-number" placeholder="1234 1234 1234 1234" [(ngModel)]="tarjeta" /><span class="text-label-s text-accent-text">12/34 · 123</span></span></label>
          <label class="flex flex-col gap-2"><span class="text-label-s">Nombre en la tarjeta</span><input class="h-12 rounded-[10px] border border-line-strong bg-bg-field px-3.5 text-body-m focus:border-accent-text focus:outline-none" name="nombre" autocomplete="cc-name" [(ngModel)]="nombre" /></label>
          <div class="flex flex-col gap-1.5 rounded-[10px] bg-bg-raised p-3">
            <p class="text-label-xs text-text-tertiary uppercase">Tarjetas de prueba</p>
            @for (t of s.tarjetas; track t[0]) { <button type="button" class="flex w-full justify-between py-0.5 text-left hover:text-accent-text" (click)="tarjeta = t[0]"><span class="text-mono-s">{{ t[0] }}</span><span class="text-body-xs text-text-tertiary">{{ t[1] }}</span></button> }
          </div>
          @if (mensaje()) { <gr-alert [tone]="tresDS() ? 'info' : 'danger'" [title]="tresDS() ? '3D Secure' : 'Pago no completado'">{{ mensaje() }}</gr-alert> }
          @if (tresDS()) {
            <div class="flex gap-2"><button grButton variant="primary" class="flex-1" [loading]="pagando()" (click)="pagar('ok')">Autenticar</button><button grButton class="flex-1" [disabled]="pagando()" (click)="pagar('fallo')">Fallar autenticación</button></div>
          } @else {
            <button grButton variant="primary" size="l" [loading]="pagando()" (click)="pagar('')">Pagar {{ eur(s.importe) }}</button>
          }
          </div>
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
