import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, afterNextRender, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrButton, GrCheckbox, GrIcon, GrRaffleNotice, GrSkeleton, type GrIconName, GrSelect } from '@grcup/ui';
import { Cms, renderMarkdown, type Faq } from '../core/cms';
import { COMPETITION_SLUG, Competition, FalloApi } from '../core/competition';
import { FanSession } from '../core/fan';
import { EntradasPublic, dia, diaLargo, errorDe, hora, qrDataURL, validada, type Entradas, type MiEntrada, type Oferta, type SesionPub } from '../core/entradas';
import type { Horarios } from '../core/horarios';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Footer, Navbar } from '../layout/layout';
import { Newsletter } from '../layout/newsletter';
import { Page } from '../layout/page';
import { applySeo } from './content';

const ESTADO: Record<SesionPub['estado'], { label: string; cls: string }> = {
  disponible: { label: 'Disponible', cls: 'border-success/50 bg-success/10 text-success' },
  ultimas: { label: 'Últimas', cls: 'border-accent/50 bg-accent/10 text-accent-text' },
  agotada: { label: 'Agotada', cls: 'border-line-strong text-text-tertiary' },
  cerrada: { label: 'Cerrada', cls: 'border-line-strong text-text-tertiary' },
  proximamente: { label: 'Próximamente', cls: 'border-info/40 bg-info/10 text-info' },
};

/**
 * Ticket card (Figma 02 «Ticket»: Reservada · Usada · Cancelada; used in 37 hero, 38 confirmation and «Mi entrada»):
 * charcoal card radius 20, perforation with notches, the QR. «Usada» dims the QR under the green «Validada» stamp;
 * «Cancelada» replaces it with «QR desactivado». «Con sorteo» adds the raffle tickets paid with the booking (/entradas step 4).
 */
@Component({
  selector: 'gr-ticket',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let e = est();
    @let b = e !== 'anulada' ? boletos() : [];
    <article class="relative overflow-hidden rounded-[20px] border shadow-card [overflow-wrap:anywhere]" [class]="b.length ? 'border-accent/55 bg-[linear-gradient(to_bottom_right,#4e121d,#150b0d)]' : 'border-line-strong bg-bg-card'">
      <div class="flex flex-col gap-3 px-5 pt-6 pb-4">
        <header class="flex h-8 items-center justify-between gap-3"><img src="https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png" alt="GRStrength Cup" width="84" height="32" class="h-8 w-[84px] object-contain" />
          <span class="inline-flex h-6 shrink-0 items-center rounded-pill border px-2.5 text-label-xs" [class]="pill[e].cls">{{ pill[e].t }}</span></header>
        <p class="text-display-xs" [class.text-text-muted]="e === 'anulada'">{{ evento() }}</p>
        <ul class="flex flex-col gap-2 text-body-s text-text-secondary">
          <li class="flex items-center gap-2.5"><gr-icon name="calendar" [size]="15" class="text-accent-text" />{{ l1() }}</li>
          <li class="flex items-center gap-2.5"><gr-icon name="clock" [size]="15" class="text-accent-text" />{{ linea2() }}</li>
          @if (lugar()) { <li class="flex items-center gap-2.5"><gr-icon name="map-pin" [size]="15" class="text-accent-text" />{{ lugar() }}</li> }
          <li class="flex items-center gap-2.5"><gr-icon name="users" [size]="15" class="text-accent-text" />{{ titular() }}</li>
        </ul>
        @if (b.length) {
          <!-- Figma «Ticket / Con sorteo» -->
          <div class="flex items-center gap-2 rounded-md border border-accent/45 bg-black/25 p-3">
            <gr-icon name="ticket" [size]="16" class="shrink-0 text-accent-text" />
            <div class="flex min-w-0 flex-col gap-1">
              <p class="text-body-s font-semibold text-white">Sorteo · {{ b.length }} {{ b.length === 1 ? 'boleto pagado' : 'boletos pagados' }}</p>
              <p class="truncate text-mono-s text-text-secondary">Nº {{ b.join(' · ') }}@if (premio()) { · {{ premio() }} }</p>
            </div>
          </div>
        }
      </div>
      <!-- Figma «Perforado»: line 290 between two 24 notches cut half outside the card -->
      <div class="relative h-6" aria-hidden="true">
        <span class="absolute inset-x-[29px] top-3 border-t border-dashed border-line-strong"></span>
        <span class="absolute top-0 -left-3 size-6 rounded-full border border-line-strong bg-bg-base"></span>
        <span class="absolute top-0 -right-3 size-6 rounded-full border border-line-strong bg-bg-base"></span>
      </div>
      <div class="relative flex flex-col items-center gap-2 px-5 pt-2 pb-6 text-center">
        @if (e === 'anulada') {
          <span class="flex size-42 flex-col items-center justify-center gap-2 rounded-lg border border-line-strong text-text-muted"><gr-icon name="x" [size]="32" /><span class="text-label-s">QR desactivado</span></span>
        } @else if (img()) {
          <img [src]="img()" alt="Código QR de la entrada" width="168" height="168" class="size-42 rounded-sm bg-white p-2" [class.opacity-22]="e === 'usada'" />
        } @else { <span class="size-42 rounded-sm bg-white/10"></span> }
        @if (e === 'usada') {
          <span class="absolute top-[57px] flex translate-x-1 -rotate-8 flex-col items-center gap-1 rounded-md border-2 border-success px-5 py-2 text-success" aria-hidden="true">
            <span class="text-display-s">Validada</span>@if (validadaEn()) { <span class="text-mono-s">{{ validadaEn() }}</span> }
          </span>
        }
        <p class="text-mono-s" [class]="e === 'anulada' ? 'text-text-muted' : 'text-text-primary'">{{ codigo() }}</p>
        <p class="text-body-xs text-text-tertiary">{{ e === 'usada' ? 'Validada' + (validadaEn() ? ' a las ' + validadaEn().slice(-5) : '') + ' · ¡que lo disfrutes!' : e === 'anulada' ? 'Has liberado tu plaza. ¡Gracias por avisar!' : 'Enséñalo en la puerta desde el móvil (no hace falta imprimirlo)' }}</p>
      </div>
    </article>
  `,
})
export class TicketCard {
  readonly evento = input('GRStrength Cup 2026');
  readonly linea1 = input('');
  readonly linea2 = input('');
  readonly lugar = input('');
  readonly titular = input('');
  readonly codigo = input('');
  readonly qr = input('');
  readonly estado = input<'reservada' | 'usada' | 'anulada'>('reservada');
  /** Raffle ticket numbers paid with the booking («Con sorteo») and the prize. */
  readonly boletos = input<string[]>([]);
  readonly premio = input('');
  /** «25/07 · 10:12» on the stamp of a used ticket. */
  readonly validadaEn = input('');
  protected readonly est = this.estado;
  /** «Sábado 25 jul · …» (Intl gives the weekday in lower case). */
  protected readonly l1 = computed(() => this.linea1().charAt(0).toUpperCase() + this.linea1().slice(1));
  protected readonly pill = {
    reservada: { t: 'Entrada gratuita', cls: 'border-success/40 bg-success/12 text-success' },
    usada: { t: 'Validada', cls: 'border-text-tertiary/40 bg-text-tertiary/12 text-text-tertiary' },
    anulada: { t: 'Anulada', cls: 'border-accent/40 bg-accent/12 text-accent-text' },
  };
  protected readonly img = signal('');
  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const v = this.qr();
      if (v && browser) void qrDataURL(v, 336).then((u) => this.img.set(u));
    });
  }
}

const titular = (m: { nombre: string; apellidos: string; personas: number }) =>
  `${m.nombre} ${m.apellidos}`.trim() + (m.personas > 1 ? ` + ${m.personas - 1} acompañante${m.personas > 2 ? 's' : ''}` : '');

// ============================================================ /entradas ===

interface Fila { hora: string; titulo: string }

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
/** «2 €», «2,50 €» (cents in). */
const euros = (c: number) => eur.format(c / 100).replace(',00', '');
/** Booking draft kept across the magic-link login. */
const BORRADOR = 'gr.entradas.borrador';
const CAMPO = 'h-12 w-full rounded-sm border bg-bg-field px-3.5 text-body-m text-text-primary placeholder:text-text-muted focus:border-accent-text focus:outline-none';

/**
 * /entradas (Figma page 37): full-bleed hero with the example ticket and the session capacity; «Qué vas a ver», «Cómo
 * funciona», the day hour by hour (from the published schedule) and the FAQ on the left; the booking form (sticky) on
 * the right — on phones the form comes right after the hero and a bottom bar brings it back. Step 4 adds raffle tickets
 * while the raffle is on sale: the ticket is reserved first (free) and then the payment opens. States: errors, sending,
 * sold-out session (waiting list) and everything sold out.
 */
@Component({
  selector: 'gr-entradas-page',
  imports: [GrSelect, RouterLink, NgTemplateOutlet, Navbar, Footer, FormsModule, GrAlert, GrButton, GrCheckbox, GrIcon, GrSkeleton, GrRaffleNotice, GrCabecera, TicketCard, Newsletter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    <gr-navbar />
    <main class="relative overflow-x-clip">
      <!-- Figma «Hero campaña»: the crowd photo, a dark veil and the red glow; 920 px on desktop -->
      <section class="relative flex overflow-hidden lg:min-h-[920px] lg:items-center">
        <img src="/img/home/org-publico-l.webp" srcset="/img/home/org-publico-s.webp 640w, /img/home/org-publico-l.webp 1300w" sizes="100vw" alt="" class="absolute inset-0 size-full object-cover grayscale-[60%]" fetchpriority="high" />
        <div class="absolute inset-0 bg-[linear-gradient(180deg,rgb(14_12_13/0.72),rgb(14_12_13/0.8)_60%,var(--color-bg-base))]" aria-hidden="true"></div>
        <div class="pointer-events-none absolute -top-40 -right-40 size-[780px] rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.5),transparent)]" aria-hidden="true"></div>
        <div class="relative mx-auto grid w-full max-w-[1200px] items-center gap-10 px-5 pt-[104px] pb-12 md:px-8 md:pt-40 md:pb-20 lg:grid-cols-[minmax(0,700px)_350px] lg:justify-between lg:pt-24 lg:pb-16 xl:px-0">
          <div class="flex flex-col items-start gap-4 md:gap-5">
            <p class="inline-flex h-7 items-center rounded-full border px-3 text-label-xs uppercase" [class]="todasAgotadas() ? 'border-line-strong bg-white/5 text-text-secondary' : 'border-success/50 bg-success/10 text-success'">{{ todasAgotadas() ? 'Entradas agotadas' : 'Entrada gratuita · aforo limitado' }}</p>
            <h1 class="text-display-m md:text-display-hero">
              @if (todasAgotadas()) { Hasta aquí <span class="text-accent-text">el aforo</span> } @else { Vive la GRStrength Cup <span class="text-accent-text">en directo</span> }
            </h1>
            <p class="max-w-[640px] text-body-m text-text-secondary md:text-body-l">{{ todasAgotadas()
              ? 'Se han reservado todas las entradas. Apúntate a la lista de espera: si alguien anula, te avisamos por email y tienes un plazo para confirmar.'
              : '150 atletas, jueces AEP y tres movimientos al límite en ' + ciudad() + '. La entrada es gratis: resérvala en un minuto y entra sin colas.' }}</p>
            <ul class="flex flex-col gap-2 text-body-s text-text-secondary md:flex-row md:flex-wrap md:gap-x-6">
              <li class="flex items-center gap-2"><gr-icon name="calendar" [size]="16" class="text-accent-text" />{{ fechas() }}</li>
              <li class="flex items-center gap-2"><gr-icon name="map-pin" [size]="16" class="text-accent-text" />{{ comp.data()?.sede?.nombre || 'Almussafes' }}</li>
              @if (puertas()) { <li class="flex items-center gap-2 md:basis-full"><gr-icon name="clock" [size]="16" class="text-accent-text" />{{ puertas() }}</li> }
            </ul>
            <div class="mt-1 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              @if (todasAgotadas()) {
                <a grButton variant="primary" size="l" routerLink="." fragment="reservar">Apuntarme a la lista de espera</a>
                <a grButton variant="outline" size="l" routerLink="/en-directo" iconRight="arrow-right">Seguirlo en directo</a>
              } @else {
                <a grButton variant="primary" size="l" routerLink="." fragment="reservar">Reservar mi entrada</a>
                <a grButton variant="outline" size="l" routerLink="." fragment="como-funciona" iconRight="arrow-right">Cómo funciona</a>
              }
            </div>
            @if (d?.personas) {
              <div class="flex items-center gap-3">
                <span class="flex -space-x-2" aria-hidden="true">@for (i of [0, 1, 2, 3]; track i) { <span class="flex size-8 items-center justify-center rounded-full border-2 border-bg-base text-text-secondary" [class]="avatar[i]"><gr-icon name="user" [size]="14" /></span> }</span>
                <span class="flex flex-col"><span class="text-body-s"><b class="font-semibold">{{ n(d!.personas) }} personas</b> ya tienen entrada</span>
                  <span class="flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="radio" [size]="12" class="text-success" />Actualizado en directo</span></span>
              </div>
            }
          </div>
          <!-- Figma «Ticket» (rotated 4°) and «Aforo meter»: desktop only -->
          <div class="hidden flex-col gap-5 lg:flex">
            <gr-ticket class="rotate-[4deg]" [linea1]="ejemplo().l1" [linea2]="ejemplo().l2" [lugar]="comp.data()?.sede?.nombre ?? ''" titular="Laura Gómez + 2 acompañantes" codigo="GRC-7K3P" qr="E:GRC-7K3P:ejemplo" />
            @if (sesHero(); as s) { <ng-container [ngTemplateOutlet]="aforo" [ngTemplateOutletContext]="{ $implicit: s }" /> }
          </div>
        </div>
      </section>

      <div class="relative mx-auto mt-12 grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-16 px-5 pb-18 md:mt-20 md:px-8 md:pb-24 lg:grid-cols-[minmax(0,616px)_minmax(0,520px)] lg:justify-between lg:gap-10 xl:px-0">
        <!-- the form: right column (sticky) on desktop, right after the hero on phones -->
        <aside id="reservar" #reservarEl class="scroll-mt-24 lg:col-start-2 lg:row-start-1">
          <div class="lg:sticky lg:top-28">
            @if (d === undefined) { <gr-skeleton class="h-[640px] rounded-2xl" /> }
            @else if (d === null && fallo.limitado()) { <gr-alert tone="warning" title="Demasiadas visitas desde tu red">Hemos recibido muchas peticiones desde tu conexión. Espera un minuto y vuelve a cargar la página.</gr-alert> }
            @else if (d === null) { <gr-alert tone="warning" title="No hemos podido cargar las entradas">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert> }
            @else if (todasAgotadas() && !sesSel()) {
              <!-- Figma «Todo agotado»: no form; the waiting list is per session -->
              <section class="flex flex-col gap-4 rounded-2xl border border-line-strong bg-bg-card p-5 md:p-7">
                <h2 class="text-display-xs md:text-display-s">Elige sesión</h2>
                <p class="text-body-s text-text-secondary">Todas las sesiones están completas. Elige una para apuntarte a su lista de espera.</p>
                <ng-container [ngTemplateOutlet]="sesiones" />
              </section>
              <gr-newsletter class="mt-4 block" titulo="Te avisamos de lo importante" texto="Horarios, sorteo y próximas competiciones de GRStrength. Como mucho un email al mes." origen="/entradas" [compacta]="true" />
            } @else if (!abiertas().length && !todasAgotadas()) {
              <section class="rounded-2xl border border-line-strong bg-bg-card p-6 text-center">
                <h2 class="text-display-xs">Reservas cerradas</h2>
                <p class="mt-2 text-body-s text-text-secondary">Ahora mismo no hay sesiones con reservas abiertas. Síguenos en Instagram para saber cuándo se abren.</p>
              </section>
            } @else if (enviado(); as e) {
              <section class="flex flex-col items-center gap-3 rounded-2xl border border-success/40 bg-success/8 p-6 text-center" role="status"><gr-icon name="mail" [size]="26" class="text-success" /><h2 class="text-ui-h4">Te hemos apuntado</h2><p class="text-body-s text-text-secondary">{{ e }}</p></section>
            } @else if (sesSel()?.estado === 'agotada' && sesSel()?.listaEspera) {
              <!-- Figma «Sesión agotada · lista de espera» -->
              <section class="flex flex-col gap-4">
                <h2 class="text-display-xs md:text-display-s">Elige sesión</h2>
                <ng-container [ngTemplateOutlet]="sesiones" />
                <ng-container [ngTemplateOutlet]="aforo" [ngTemplateOutletContext]="{ $implicit: sesSel()! }" />
                <div class="flex flex-col gap-4 rounded-2xl border border-warning/60 bg-bg-card p-5 md:p-6">
                  <h3 class="flex items-center gap-3 text-ui-h4"><span class="flex size-10 items-center justify-center rounded-md bg-warning/12 text-warning"><gr-icon name="bell" [size]="20" /></span>{{ sesSel()!.nombre }} está completa</h3>
                  <p class="text-body-s text-text-secondary">Apúntate a la lista de espera de esta sesión. Si alguien anula, te mandamos un enlace y tendrás un plazo para confirmar tu entrada.</p>
                  <label class="relative block"><span class="sr-only">Email</span><gr-icon name="mail" [size]="16" class="absolute top-1/2 left-3.5 -translate-y-1/2 text-text-tertiary" />
                    <input type="email" autocomplete="email" class="pl-10" [class]="campo(false)" placeholder="tu@email.com" [(ngModel)]="f.email" name="we" /></label>
                  <ng-container [ngTemplateOutlet]="personas" />
                  <gr-checkbox name="wp" [(checked)]="f.privacidad">He leído y acepto la <a routerLink="/privacidad" class="text-accent-text underline">política de privacidad</a> *</gr-checkbox>
                  @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
                  <button grButton variant="primary" size="l" type="button" class="w-full" [loading]="enviando()" (click)="apuntarme()">Apuntarme a la lista de espera</button>
                  @if (abiertas().length) { <button type="button" class="h-11 text-label-s text-text-tertiary hover:text-text-primary" (click)="elegir(abiertas()[0])">Elegir otra sesión</button> }
                </div>
              </section>
            } @else {
              <!-- a card from tablet up; on phones the form sits on the page (Figma 37 mobile) -->
              <form method="post" class="flex flex-col gap-6 md:rounded-2xl md:border md:border-line-strong md:bg-bg-card md:p-7" (submit)="$event.preventDefault(); reservar()" novalidate>
                <div class="flex flex-col gap-3">
                  <h2 class="text-display-xs md:text-display-s">Reserva tu entrada</h2>
                  <p class="flex flex-wrap gap-1.5">
                    <span class="inline-flex h-6 items-center gap-1 rounded-full border border-success/50 bg-success/10 px-2 text-label-xs text-success uppercase"><gr-icon name="check" [size]="12" />Gratis</span>
                    <span class="inline-flex h-6 items-center gap-1 rounded-full border border-line-strong px-2 text-label-xs text-text-secondary uppercase"><gr-icon name="clock" [size]="12" />1 minuto</span>
                    <span class="inline-flex h-6 items-center gap-1 rounded-full border border-line-strong px-2 text-label-xs text-text-secondary uppercase"><gr-icon name="scan" [size]="12" />QR por email</span>
                  </p>
                </div>
                @if (errores().length) {
                  <div class="flex flex-col gap-1.5 rounded-md border border-accent/60 bg-accent/8 p-4" role="alert" tabindex="-1" #resumenErr>
                    <p class="flex items-center gap-2 text-label-s"><gr-icon name="circle-alert" [size]="18" class="text-accent-text" />{{ errores().length === 1 ? 'Revisa 1 campo' : 'Revisa ' + errores().length + ' campos' }}</p>
                    @for (e of errores(); track e) { <p class="pl-[26px] text-body-s text-text-secondary">{{ e }}</p> }
                  </div>
                }
                <fieldset class="flex flex-col gap-4">
                  <legend class="mb-4 flex items-center gap-2.5 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent/20 text-label-xs text-accent-text">1</span>Tus datos</legend>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="flex flex-col gap-1.5 text-label-s">Nombre *<input [class]="campo(err('nombre'))" [(ngModel)]="f.nombre" name="nombre" autocomplete="given-name" placeholder="Tu nombre" [attr.aria-invalid]="err('nombre')" /></label>
                    <label class="flex flex-col gap-1.5 text-label-s">Apellidos *<input [class]="campo(err('apellidos'))" [(ngModel)]="f.apellidos" name="apellidos" autocomplete="family-name" placeholder="Tus apellidos" [attr.aria-invalid]="err('apellidos')" /></label>
                  </div>
                  <label class="flex flex-col gap-1.5 text-label-s">Email *<input type="email" [class]="campo(err('email'))" [(ngModel)]="f.email" name="email" autocomplete="email" placeholder="email@ejemplo.com" [attr.aria-invalid]="err('email')" />
                    @if (err('email')) { <span class="flex items-center gap-1.5 text-body-xs font-normal text-accent-text"><gr-icon name="circle-alert" [size]="14" />Introduce un email válido</span> }</label>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="flex flex-col gap-1.5 text-label-s">Teléfono (opcional)
                      <span class="flex h-12 items-center overflow-hidden rounded-sm border border-line-strong bg-bg-field focus-within:border-accent-text"><span class="flex h-full items-center border-r border-line-subtle px-3 text-body-m font-normal text-text-secondary">+34</span>
                        <input type="tel" inputmode="tel" class="h-full min-w-0 flex-1 bg-transparent px-3 text-body-m font-normal placeholder:text-text-muted focus:outline-none" [(ngModel)]="f.telefono" name="tel" autocomplete="tel-national" placeholder="600 000 000" /></span></label>
                    <div class="flex flex-col gap-1.5 text-label-s"><label for="e-origen">¿Cómo nos conociste?</label><gr-select id="e-origen" tam="l" class="font-normal" [(ngModel)]="f.origen" name="origen"><option value="">Elige una opción</option>@for (o of origenes; track o) { <option [value]="o">{{ o }}</option> }</gr-select></div>
                  </div>
                </fieldset>
                <fieldset class="flex flex-col gap-3">
                  <legend class="mb-3 flex w-full items-center gap-2.5 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent/20 text-label-xs text-accent-text">2</span>Elige sesión<span class="ml-auto text-body-xs font-normal text-text-tertiary">{{ diaSesiones() }}</span></legend>
                  <ng-container [ngTemplateOutlet]="sesiones" />
                </fieldset>
                <fieldset class="flex flex-col gap-3">
                  <legend class="mb-3 flex items-center gap-2.5 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent/20 text-label-xs text-accent-text">3</span>¿Cuántos venís?</legend>
                  <ng-container [ngTemplateOutlet]="personas" />
                </fieldset>
                <gr-raffle-notice>Los boletos se compran en el recinto el día del evento. Aquí no se paga nada: consulta los objetos que se rifan.</gr-raffle-notice>
                <div class="flex flex-col gap-3 text-body-s">
                  <gr-checkbox name="priv" [(checked)]="f.privacidad" [invalid]="!!err('privacidad')"><span [class.text-accent-text]="err('privacidad')">He leído y acepto la <a routerLink="/privacidad" class="text-accent-text underline">política de privacidad</a> *</span></gr-checkbox>
                  <gr-checkbox name="nov" [(checked)]="f.novedades">Quiero recibir novedades de la GRStrength Cup y de otras competiciones de GRStrength. <span class="text-text-tertiary">(Opcional)</span></gr-checkbox>
                  <p class="rounded-md bg-white/4 p-3 text-body-xs text-text-tertiary">Responsable: GRStrength · Finalidad: gestionar tu entrada y, solo si lo marcas, enviarte novedades · Legitimación: tu consentimiento · Derechos: acceso, rectificación, supresión y baja escribiendo a {{ comp.data()?.evento?.emailContacto || 'la organización' }} o desde cualquier email.</p>
                </div>
                <button grButton variant="primary" size="l" type="submit" class="w-full" [disabled]="!hidratado()" [loading]="enviando()">Reservar entrada gratis</button>
                <p class="flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />Solo usamos tus datos para tu entrada. Sin spam.</p>
              </form>
            }
          </div>
        </aside>

        <div class="flex flex-col gap-16 md:gap-20 lg:col-start-1 lg:row-start-1">
          <section class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="El día" titulo="Qué vas a *ver*" [centro]="false" tam="m" />
            <ul class="grid gap-3 sm:grid-cols-2 md:gap-4">
              @for (x of queVer; track x.t) {
                <li class="flex gap-4 rounded-lg border border-line-subtle bg-bg-card p-5 sm:flex-col sm:gap-3"><span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="x.i" [size]="20" /></span>
                  <span class="flex flex-col gap-1"><span class="text-label-m">{{ x.t }}</span><span class="text-body-s text-text-tertiary">{{ x.d }}</span></span></li>
              }
            </ul>
          </section>
          <section id="como-funciona" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="Sin colas" titulo="Cómo *funciona*" [centro]="false" tam="m" />
            <ol class="grid gap-3 sm:grid-cols-3 md:gap-4">
              @for (x of pasos; track x.t; let i = $index) {
                <li class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5"><span class="flex size-7 items-center justify-center rounded-full bg-accent/20 text-label-s text-accent-text">{{ i + 1 }}</span>
                  <span class="text-label-m">{{ x.t }}</span><span class="text-body-s text-text-tertiary">{{ x.d }}</span></li>
              }
            </ol>
          </section>
          @if (filas().length) {
            <section class="flex flex-col gap-5 md:gap-7">
              <gr-cabecera [eyebrow]="eyebrowDia()" titulo="El día, *hora a hora*" [centro]="false" tam="m" />
              <ol class="rounded-lg border border-line-subtle bg-bg-card px-5">
                @for (x of filas(); track $index) {
                  <li class="flex items-baseline gap-5 border-b border-line-subtle py-3.5 last:border-b-0"><span class="w-12 shrink-0 font-mono text-mono-s text-accent-text">{{ x.hora }}</span><span class="text-body-m">{{ x.titulo }}</span></li>
                }
              </ol>
              <a grButton variant="outline" routerLink="/horarios" iconRight="arrow-right" class="w-full sm:w-auto sm:self-start">Ver horarios en directo</a>
            </section>
          }
          @if (faq().length) {
            <section class="flex flex-col gap-5 md:gap-7">
              <gr-cabecera eyebrow="Dudas" titulo="Preguntas *frecuentes*" [centro]="false" tam="m" />
              <div class="flex flex-col gap-3">
                @for (f of faq(); track f.pregunta; let first = $first) {
                  <details class="group rounded-lg border border-line-subtle bg-bg-card open:border-accent/60" [open]="first">
                    <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-ui-h5 md:text-ui-h4">{{ f.pregunta }}
                      <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-text-secondary group-open:bg-accent/20 group-open:text-accent-text"><gr-icon name="plus" [size]="14" class="transition-transform group-open:rotate-45" /></span></summary>
                    <div class="prose-gr px-5 pb-5 text-body-m text-text-secondary" [innerHTML]="md(f.respuesta)"></div>
                  </details>
                }
              </div>
            </section>
          }
        </div>
      </div>
    </main>
    <gr-footer />
    @if (barra()) {
      <!-- Figma «Bottom CTA bar» (mobile): back to the form -->
      <div class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line-subtle bg-bg-base/95 px-4 pt-3 pb-[max(28px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[20px] md:hidden">
        <span class="flex flex-1 flex-col gap-1"><span class="text-label-s">{{ todasAgotadas() ? 'Entradas agotadas' : 'Entrada gratuita' }}</span><span class="text-body-xs text-text-tertiary">{{ todasAgotadas() ? 'Lista de espera por sesión' : 'Aforo limitado · 1 minuto' }}</span></span>
        <a routerLink="." fragment="reservar" class="flex h-12 items-center justify-center rounded-sm bg-accent-grain px-6 text-label-m text-white">{{ todasAgotadas() ? 'Apuntarme' : 'Reservar' }}</a>
      </div>
    }

    <ng-template #sesiones>
      <div class="flex flex-col gap-3" role="radiogroup" aria-label="Sesión">
        @for (s of d!.sesiones; track s.id) {
          <button type="button" role="radio" [attr.aria-checked]="sesion() === s.id" [disabled]="s.estado === 'cerrada' || s.estado === 'proximamente'" (click)="elegir(s)"
            class="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-50"
            [class]="sesion() === s.id ? 'border-accent bg-accent/10' : err('sesion') ? 'border-accent-text/60' : 'border-line-subtle hover:border-line-strong'">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2" [class]="sesion() === s.id ? 'border-accent' : 'border-line-strong'">@if (sesion() === s.id) { <span class="size-2.5 rounded-full bg-accent"></span> }</span>
            <span class="min-w-0 flex-1" [class.text-text-tertiary]="s.estado === 'agotada' && sesion() !== s.id"><span class="block text-label-m first-letter:uppercase">{{ s.nombre }}</span><span class="block text-body-xs text-text-tertiary">Puertas {{ hora(s.puertas) }}{{ s.detalle ? ' · ' + s.detalle : '' }}</span></span>
            <span class="inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-label-xs uppercase" [class]="estado[s.estado].cls">{{ s.estado === 'ultimas' ? 'Últimas ' + s.libres : estado[s.estado].label }}</span>
          </button>
        }
      </div>
    </ng-template>
    <ng-template #personas>
      <div class="flex items-center justify-between rounded-lg border border-line-subtle px-4 py-3">
        <span class="flex flex-col"><span class="text-label-m">Personas</span><span class="text-body-xs text-text-tertiary">Tú + acompañantes</span></span>
        <span class="flex items-center gap-3">
          <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong disabled:opacity-40" aria-label="Menos personas" [disabled]="f.personas <= 1" (click)="f.personas = max(1, f.personas - 1)"><gr-icon name="minus" [size]="16" /></button>
          <span class="w-6 text-center text-ui-h4" aria-live="polite">{{ f.personas }}</span>
          <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong disabled:opacity-40" aria-label="Más personas" [disabled]="f.personas >= maxPersonas()" (click)="f.personas = min(maxPersonas(), f.personas + 1)"><gr-icon name="plus" [size]="16" /></button>
        </span>
      </div>
    </ng-template>
    <ng-template #aforo let-s>
      <div class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card/90 p-4">
        <p class="flex items-center justify-between gap-3 text-label-s"><span class="flex items-center gap-2"><gr-icon name="users" [size]="16" class="text-accent-text" />Aforo · {{ s.nombre }}</span><span class="font-mono text-mono-s text-text-secondary">{{ n(s.ocupadas) }} / {{ n(s.aforo) }}</span></p>
        <div class="h-1.5 rounded-full bg-white/10"><div class="h-full rounded-full" [class]="s.estado === 'agotada' ? 'bg-text-tertiary' : 'bg-accent'" [style.width.%]="min(100, s.ocupadas * 100 / s.aforo)"></div></div>
        <p class="flex items-center gap-1.5 text-body-s text-text-secondary">@if (!s.libres) { <gr-icon name="bell" [size]="14" class="text-text-tertiary" /> }{{ s.libres ? 'Quedan ' + n(s.libres) + ' entradas para esta sesión' : 'Agotadas · apúntate a la lista de espera' }}</p>
      </div>
    </ng-template>
  `,
})
export class EntradasPage {
  private readonly api = inject(EntradasPublic);
  private readonly fan = inject(FanSession);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly comp = inject(Competition);
  protected readonly fallo = inject(FalloApi);
  private readonly reservarEl = viewChild<ElementRef<HTMLElement>>('reservarEl');
  protected readonly hora = hora;
  protected readonly estado = ESTADO;
  protected readonly euros = euros;
  protected readonly max = Math.max;
  protected readonly min = Math.min;
  protected readonly avatar = ['bg-accent/30', 'bg-[#5a2a32]', 'bg-[#3d2a2e]', 'bg-bg-raised'];
  protected readonly origenes = ['Instagram', 'Un amigo o familiar', 'Mi club o gimnasio', 'Un atleta', 'Cartel o flyer', 'Otro'];
  protected readonly queVer: { i: GrIconName; t: string; d: string }[] = [
    { i: 'maximize', t: 'Sentadilla, banca y peso muerto', d: 'Tres intentos por movimiento y atleta, con jueces oficiales de la AEP.' },
    { i: 'users', t: '150 atletas', d: 'De subjúnior a máster, de clubs de toda la Comunitat Valenciana.' },
    { i: 'trophy', t: 'Premios y sorteo en directo', d: 'Medallas por categoría y sorteo del cinturón SBD al final del día.' },
    { i: 'radio', t: 'Sigue a tus atletas', d: 'Horarios en directo en el móvil y aviso 30 min antes de que compitan.' },
  ];
  protected readonly pasos = [
    { t: 'Reserva en 1 minuto', d: 'Elige sesión y cuántos venís. Te llega el QR al momento.' },
    { t: 'Recibe tu QR', d: 'Por email y en «Mi entrada». Añádelo al calendario.' },
    { t: 'Enséñalo en la puerta', d: 'Lo escaneamos desde el móvil y entras. No hace falta imprimirlo.' },
  ];
  protected readonly data = signal<Entradas | null | undefined>(undefined);
  protected readonly faq = signal<Faq[]>([]);
  private readonly horarios = signal<Horarios | null>(null);
  protected readonly sesion = signal('');
  protected readonly enviando = signal(false);
  protected readonly errores = signal<string[]>([]);
  protected readonly campos = signal<string[]>([]);
  protected readonly error = signal('');
  protected readonly enviado = signal('');
  private readonly formVisible = signal(true);
  private readonly bajoHero = signal(false);
  protected f = { nombre: '', apellidos: '', email: '', telefono: '', origen: '', personas: 1, privacidad: false, novedades: false};
  protected readonly sesSel = computed(() => this.data()?.sesiones.find((s) => s.id === this.sesion()));
  protected readonly abiertas = computed(() => (this.data()?.sesiones ?? []).filter((s) => s.estado === 'disponible' || s.estado === 'ultimas'));
  protected readonly todasAgotadas = computed(() => { const l = this.data()?.sesiones ?? []; return l.length > 0 && !this.abiertas().length && l.some((s) => s.estado === 'agotada'); });
  protected readonly sesHero = computed(() => this.sesSel() ?? this.abiertas()[0] ?? this.data()?.sesiones[0]);
  protected readonly ejemplo = computed(() => {
    const x = this.sesHero();
    return x ? { l1: dia(x.inicio) + ' · ' + x.nombre, l2: 'Puertas ' + hora(x.puertas) + ' · hasta las ' + hora(x.fin) } : { l1: 'Sábado · sesión de mañana', l2: 'Puertas 8:30 · hasta las 14:00' };
  });
  protected readonly maxPersonas = computed(() => Math.min(this.sesSel()?.maxPorReserva ?? 6, Math.max(1, this.sesSel()?.estado === 'agotada' ? 6 : (this.sesSel()?.libres ?? 6))));
  protected readonly ciudad = computed(() => this.comp.data()?.sede?.ciudad || 'Almussafes');
  protected readonly fechas = computed(() => {
    const c = this.comp.data();
    const t = c?.fechaInicio ? diaLargo(c.fechaInicio + 'T12:00:00Z') + (c.fechaFin && c.fechaFin !== c.fechaInicio ? ' y ' + diaLargo(c.fechaFin + 'T12:00:00Z') : '') : 'Fecha por confirmar';
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  /** «Puertas 8:30 · premios y sorteo 21:30» from the published schedule (else the first session's doors). */
  protected readonly puertas = computed(() => {
    const dd = this.horarios()?.dias?.[0];
    const p = dd?.puertas ?? (this.data()?.sesiones[0] ? hora(this.data()!.sesiones[0].puertas) : '');
    const premios = dd?.agenda.find((a) => a.icono === 'trophy')?.hora;
    return [p && 'Puertas ' + p.replace(/^0/, ''), premios && 'premios y sorteo ' + premios.replace(/^0/, '')].filter(Boolean).join(' · ');
  });
  protected readonly diaSesiones = computed(() => { const s = this.data()?.sesiones[0]; return s ? dia(s.inicio).replace(/^\w/, (c) => c.toUpperCase()) : ''; });
  protected readonly eyebrowDia = computed(() => { const f = this.horarios()?.dias?.[0]?.fecha; return (f ? dia(f + 'T12:00:00Z') : 'El día') + ' · horario publicado'; });
  /** The day hour by hour: the agenda and the flights, flights starting at the same time on one row. */
  protected readonly filas = computed<Fila[]>(() => {
    const dd = this.horarios()?.dias?.[0];
    if (!dd) return [];
    const porHora = new Map<string, { codigos: string[]; sexos: Set<string> }>();
    for (const fl of [...dd.flights].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
      const h = hora(fl.inicio);
      const g = porHora.get(h) ?? { codigos: [], sexos: new Set<string>() };
      g.codigos.push(fl.codigo); g.sexos.add(fl.sexo === 'F' ? 'femenino' : 'masculino');
      porHora.set(h, g);
    }
    const filas: Fila[] = [...porHora].map(([h, g]) => ({ hora: h, titulo: (g.codigos.length > 1 ? 'Flights ' + g.codigos.join(' y ') : 'Flight ' + g.codigos[0]) + ' · ' + [...g.sexos].join(' y ') }));
    for (const a of dd.agenda) filas.push({ hora: a.hora, titulo: a.titulo.split(' · ')[0] });
    return filas.sort((a, b) => a.hora.localeCompare(b.hora));
  });
  /** SSR markup: submitting is blocked until Angular takes over (no native submit with personal data). */
  protected readonly hidratado = signal(false);
  /** Mobile bottom bar: below the hero, while the form is off screen. */
  protected readonly barra = computed(() => this.bajoHero() && !this.formVisible() && !!this.data());

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      const opt = <T,>(p: Promise<T>) => p.catch(() => null);
      const [d, faq, h] = await Promise.all([this.api.sesiones(), cms.faq(), opt(firstValueFrom(this.http.get<Horarios>(`/api/competiciones/${COMPETITION_SLUG}/horarios?resumen=true`))),  this.comp.load()]);
      this.data.set(d);
      this.horarios.set(h?.publicado ? h : null);
      const l = faq ?? [];
      this.faq.set((l.some((x) => /entrada/i.test(x.categoria)) ? l.filter((x) => /entrada/i.test(x.categoria)) : l).slice(0, 5));
      const s = d?.sesiones.find((x) => x.estado === 'disponible' || x.estado === 'ultimas');
      if (s) this.sesion.set(s.id);
      await applySeo(cms, seo, '/entradas', 'Entradas gratis · GR Strength Cup', 'Reserva gratis tu entrada para la GR Strength Cup en Almussafes: elige sesión, recibe tu QR por email y entra sin colas.');
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const destroy = inject(DestroyRef);
      const cd = inject(ChangeDetectorRef);
      afterNextRender(() => {
        this.hidratado.set(true);
        const b = sessionStorage.getItem(BORRADOR);
        if (b) { sessionStorage.removeItem(BORRADOR); try { Object.assign(this.f, JSON.parse(b)); } catch { /* ignore a broken draft */ } }
        void this.fan.cargar().then((y) => { if (y?.email && !this.f.email) this.f.email = y.email; cd.markForCheck(); });
        const el = this.reservarEl()?.nativeElement;
        const io = new IntersectionObserver(([e]) => this.formVisible.set(e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
        if (el) io.observe(el);
        const onScroll = () => this.bajoHero.set(window.scrollY > 560);
        window.addEventListener('scroll', onScroll, { passive: true });
        // live capacity (arch 37): the public stream announces every change of a session
        const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
        es.addEventListener('aforo.actualizado', () => void this.api.sesiones().then((x) => { if (x) this.data.set(x); }));
        destroy.onDestroy(() => { io.disconnect(); window.removeEventListener('scroll', onScroll); es.close(); });
      });
    }
  }
  protected n(v: number): string {
    return v.toLocaleString('es-ES');
  }
  /** FAQ answers are markdown (Angular sanitizes the HTML). */
  protected md(v: string): string {
    return renderMarkdown(v).html;
  }
  protected err(c: string): boolean {
    return this.campos().includes(c);
  }
  protected campo(mal: boolean): string {
    return CAMPO + (mal ? ' border-accent-text' : ' border-line-strong');
  }
  protected elegir(s: SesionPub): void {
    this.sesion.set(s.id);
    this.error.set('');
    this.f.personas = Math.min(this.f.personas, s.maxPorReserva);
  }
  private validar(): boolean {
    const e: string[] = [];
    const c: string[] = [];
    if (!this.f.nombre.trim()) { e.push('Nombre: escribe tu nombre.'); c.push('nombre'); }
    if (!this.f.apellidos.trim()) { e.push('Apellidos: escribe tus apellidos.'); c.push('apellidos'); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.f.email.trim())) { e.push('Email: introduce un email válido.'); c.push('email'); }
    if (!this.sesion()) { e.push('Elige una sesión.'); c.push('sesion'); }
    if (!this.f.privacidad) { e.push('Acepta la política de privacidad para reservar.'); c.push('privacidad'); }
    this.errores.set(e);
    this.campos.set(c);
    if (e.length) setTimeout(() => this.reservarEl()?.nativeElement.querySelector<HTMLElement>('[role=alert]')?.focus());
    return e.length === 0;
  }
  protected async reservar(): Promise<void> {
    if (!this.validar()) return;
    // D-MIEMBROS: booking needs a fan session; the access modal brings the person back here.
    if (!(await this.fan.cargar())) {
      // keep what was typed: the email link reloads the page
      sessionStorage.setItem(BORRADOR, JSON.stringify(this.f));
      return this.fan.abrirAcceso('entradas', '/entradas', this.f.email.trim());
    }
    this.enviando.set(true);
    const qp = this.route.snapshot.queryParamMap;
    const utm: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'ref']) { const v = qp.get(k); if (v) utm[k] = v.slice(0, 60); }
    const tel = this.f.telefono.trim();
    const telefono = tel ? (tel.startsWith('+') ? tel : '+34 ' + tel) : undefined;
    let token = '';
    try {
      const r = await this.api.reservar({ sesionId: this.sesion(), nombre: this.f.nombre.trim(), apellidos: this.f.apellidos.trim(), email: this.f.email.trim(), telefono,
        personas: this.f.personas, origen: this.f.origen || undefined, utm, aceptaPrivacidad: true, novedades: this.f.novedades });
      token = r.token;
    } catch (e) {
      const x = errorDe(e);
      if (x.code === 'AGOTADA') this.data.set(await this.api.sesiones());
      this.errores.set([x.detail]);
      this.enviando.set(false);
      return;
    }
    void this.router.navigate(['/entradas/confirmacion'], { queryParams: { t: token } });
  }
  protected async apuntarme(): Promise<void> {
    this.error.set('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.f.email.trim())) return this.error.set('Escribe un email válido.');
    if (!this.f.privacidad) return this.error.set('Acepta la política de privacidad.');
    // D-MIEMBROS: booking needs a fan session; the access modal brings the person back here.
    if (!(await this.fan.cargar())) return this.fan.abrirAcceso('entradas', '/entradas');
    this.enviando.set(true);
    try {
      await this.api.espera({ sesionId: this.sesion(), email: this.f.email.trim(), nombre: `${this.f.nombre} ${this.f.apellidos}`.trim() || undefined, personas: this.f.personas, aceptaPrivacidad: true });
      this.enviado.set(`Estás en la lista de espera de ${this.sesSel()?.nombre}. Si se libera plaza te escribimos a ${this.f.email.trim()}.`);
    } catch (e) {
      this.error.set(errorDe(e).detail);
    } finally {
      this.enviando.set(false);
    }
  }
}

// ======================================================= confirmación ===

/** /entradas/confirmacion (Figma 38): «¡Tienes entrada!», QR, calendar, raffle notice (in person only), news and «Invita a tu gente». */
@Component({
  selector: 'gr-entrada-confirmacion',
  imports: [RouterLink, Page, GrButton, GrIcon, GrSkeleton, GrRaffleNotice, TicketCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="¡Tienes entrada!" crumb="Confirmación" [hideTitle]="true" [cabecera]="false">
      @let m = mia();
      @if (m === undefined) { <gr-skeleton class="mx-auto block h-[560px] max-w-[350px] rounded-xl" /> }
      @else if (m === null) {
        <section class="mx-auto flex max-w-[350px] flex-col items-center gap-3 pt-3 text-center">
          <span class="flex size-16 items-center justify-center rounded-full border border-line-strong bg-white/5 text-text-secondary"><gr-icon name="lock" [size]="26" /></span>
          <h1 class="text-display-xs">Este enlace ha caducado</h1>
          <p class="text-body-m text-text-secondary">Pide uno nuevo en <a routerLink="/mi-entrada" class="text-accent-text underline">Mi entrada</a>.</p>
        </section>
      } @else {
        <div class="mx-auto flex max-w-[350px] flex-col gap-6 md:max-w-[480px] xl:grid xl:max-w-none xl:grid-cols-[542px_563px] xl:items-start xl:justify-center xl:gap-4">
          <div class="flex flex-col gap-6 xl:items-center">
            @if (m.estado === 'anulada') {
              <div class="flex flex-col items-center gap-3 text-center">
                <span class="flex size-16 items-center justify-center rounded-full border border-line-strong bg-white/5 text-text-secondary"><gr-icon name="x" [size]="24" /></span>
                <h1 class="text-display-s">Entrada anulada</h1>
                <p class="text-body-m text-text-secondary">Tu QR ya no vale. Si fue un error, <a routerLink="/entradas" class="text-accent-text underline">reserva otra</a> mientras queden plazas.</p>
              </div>
            } @else {
            <div class="flex flex-col items-center gap-3 text-center">
              <span class="flex size-16 items-center justify-center rounded-full border border-success/50 bg-success/12 text-success"><gr-icon name="check" [size]="24" /></span>
              <h1 class="text-display-s">¡Tienes entrada!</h1>
              <p class="text-body-m text-text-secondary">Te la hemos enviado a {{ m.email }}. Si no la ves en 2 minutos, mira en spam.</p>
            </div>
            }
            <gr-ticket class="w-full xl:w-[342px]" [linea1]="dia(m.sesion.inicio) + ' · ' + m.sesion.nombre" [linea2]="'Puertas ' + hora(m.sesion.puertas) + ' · hasta las ' + hora(m.sesion.fin)" [lugar]="m.lugar" [titular]="tit(m)" [codigo]="m.codigo" [qr]="m.qr" [estado]="m.estado" />
            @if (m.estado !== 'anulada') {
            <div class="grid w-full grid-cols-2 gap-2 xl:w-[342px]">
              <a [href]="ics()" class="flex h-12 items-center justify-center gap-2 rounded-md border border-line-strong text-label-s transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent"><gr-icon name="calendar" [size]="16" />Al calendario</a>
              <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-md border border-line-strong text-label-s transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent" (click)="imprimir()"><gr-icon name="download" [size]="16" />Descargar PDF</button>
            </div>
            }
          </div>
          <div class="flex flex-col gap-6 xl:pt-10">
            <section class="flex flex-col gap-3"><h2 class="text-ui-h5">Rifa del evento</h2>
              <gr-raffle-notice>Los boletos se compran en el recinto el día del evento. Aquí no se paga nada: consulta los objetos que se rifan.</gr-raffle-notice></section>
            <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
              <div class="flex gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent-text"><gr-icon name="mail" [size]="18" /></span>
                <div><h2 class="text-label-m">¿Te avisamos de la próxima?</h2><p class="mt-1 text-body-xs text-text-tertiary">{{ nov() === 'si' ? 'Hecho: revisa tu correo para confirmarlo.' : nov() === 'no' ? 'Vale, no te escribiremos.' : 'No marcaste novedades. Un clic y te mandamos la confirmación.' }}</p></div></div>
              @if (!nov()) {
                <div class="flex gap-2"><button grButton variant="primary" size="m" type="button" [loading]="novEnviando()" [disabled]="novEnviando()" (click)="avisame(true)">Sí, avisadme</button>
                  <button grButton variant="outline" size="m" type="button" [disabled]="novEnviando()" (click)="avisame(false)">No, gracias</button></div>
              }
            </section>
            @if (m.estado !== 'anulada') {
            <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-label-m">Invita a tu gente</h2><p class="text-body-xs text-text-tertiary">Comparte tu enlace: sabremos cuántas entradas trae tu invitación.</p>
              <div class="flex items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3"><gr-icon name="link" [size]="16" class="text-text-tertiary" /><span class="min-w-0 flex-1 py-3 text-body-s [overflow-wrap:anywhere]">{{ corto(m.compartir) }}</span><button type="button" class="text-label-s text-accent-text hover:underline" (click)="copiar(m.compartir)">{{ copiado() ? 'Copiado' : 'Copiar' }}</button></div>
              <div class="flex flex-wrap gap-2 text-label-s">
                <a [href]="'https://twitter.com/intent/tweet?url=' + enc(m.compartir)" target="_blank" rel="noopener" [class]="chip"><gr-icon name="share" [size]="16" />X</a>
                <a [href]="'https://www.facebook.com/sharer/sharer.php?u=' + enc(m.compartir)" target="_blank" rel="noopener" [class]="chip"><gr-icon name="share" [size]="16" />Facebook</a>
                <a [href]="'https://wa.me/?text=' + enc('Vente a la GRStrength Cup, la entrada es gratis: ' + m.compartir)" target="_blank" rel="noopener" [class]="chip"><gr-icon name="share" [size]="16" />WhatsApp</a>
                <button type="button" [class]="chip" (click)="copiar(m.compartir)"><gr-icon name="external-link" [size]="16" />Copiar enlace</button>
              </div>
            </section>
            <a [href]="'/mi-entrada?t=' + token" class="text-center text-label-s text-accent-text hover:underline xl:hidden">Gestionar mi entrada →</a>
            }
          </div>
        </div>
      }
    </gr-page>
  `,
})
export class ConfirmacionPage {
  private readonly api = inject(EntradasPublic);
  protected readonly hora = hora;
  protected readonly dia = dia;
  protected readonly tit = titular;
  protected readonly chip = 'flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent';
  protected readonly mia = signal<MiEntrada | null | undefined>(undefined);
  protected readonly copiado = signal(false);
  protected readonly nov = signal<'' | 'si' | 'no'>('');
  protected readonly novEnviando = signal(false);
  protected readonly token: string;
  protected readonly ics = computed(() => this.api.ics(this.token));
  constructor() {
    inject(Seo).set({ title: 'Tu entrada · GR Strength Cup', description: 'Tu entrada gratuita con su QR.', path: '/entradas/confirmacion', robots: 'noindex' });
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.api.mia(this.token).then((m) => { this.mia.set(m); this.nov.set(m.novedades); }, () => this.mia.set(null));
  }
  protected corto(u: string): string {
    return u.replace(/^https?:\/\//, '');
  }
  protected async avisame(acepta: boolean): Promise<void> {
    this.novEnviando.set(true);
    try {
      this.nov.set((await this.api.avisame(this.token, acepta)).novedades);
    } catch {
      this.nov.set('');
    } finally {
      this.novEnviando.set(false);
    }
  }
  protected enc(v: string): string {
    return encodeURIComponent(v);
  }
  protected imprimir(): void {
    window.print();
  }
  protected async copiar(v: string): Promise<void> {
    await navigator.clipboard?.writeText(v);
    this.copiado.set(true);
  }
}


// ============================================================ oferta ===

/** /entradas/oferta (waiting-list offer email): confirm the offered places before they pass to the next person. */
@Component({
  selector: 'gr-entrada-oferta',
  imports: [RouterLink, Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Hay plaza para ti" crumb="Lista de espera">
      <div class="mx-auto max-w-md">
        @let o = oferta();
        @if (o === undefined) { <gr-skeleton class="h-64 rounded-xl" /> }
        @else if (o === null || o.estado !== 'oferta') {
          <section class="rounded-xl border border-line-subtle bg-bg-card p-6 text-center"><h2 class="text-display-2xs">Esta oferta ya no vale</h2><p class="mt-2 text-body-s text-text-secondary">{{ error() || 'Ha caducado o ya la has usado. Si quedan plazas, puedes reservar en Entradas.' }}</p><a routerLink="/entradas" class="mt-4 inline-flex h-11 items-center rounded-sm bg-accent-grain px-5 text-label-s text-white">Ver entradas</a></section>
        } @else {
          <section class="rounded-xl border border-accent/50 bg-bg-card p-6 text-center">
            <gr-icon name="ticket" [size]="28" class="text-accent-text" />
            <h2 class="mt-2 text-ui-h3">{{ o.personas }} plaza{{ o.personas > 1 ? 's' : '' }} para {{ o.sesion.nombre }}</h2>
            <p class="mt-1 text-body-s text-text-secondary">{{ dia(o.sesion.inicio) }} · puertas {{ hora(o.sesion.puertas) }}</p>
            <p class="mt-3 text-body-s text-warning">Confírmala antes del {{ dia(o.expira) }} a las {{ hora(o.expira) }}.</p>
            <button type="button" class="mt-4 h-12 w-full rounded-sm bg-accent-grain text-label-m text-white disabled:opacity-60" [disabled]="enviando()" (click)="aceptar()">{{ enviando() ? 'Confirmando…' : 'Confirmar mi entrada' }}</button>
            @if (error()) { <p class="mt-2 text-body-s text-accent-text" role="alert">{{ error() }}</p> }
          </section>
        }
      </div>
    </gr-page>
  `,
})
export class OfertaPage {
  private readonly api = inject(EntradasPublic);
  private readonly router = inject(Router);
  protected readonly hora = hora;
  protected readonly dia = dia;
  protected readonly oferta = signal<Oferta | null | undefined>(undefined);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  private readonly t: string;
  constructor() {
    inject(Seo).set({ title: 'Plaza de la lista de espera · GR Strength Cup', description: 'Confirma la plaza que te hemos ofrecido.', path: '/entradas/oferta', robots: 'noindex' });
    this.t = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.api.oferta(this.t).then((o) => this.oferta.set(o), () => this.oferta.set(null));
  }
  protected async aceptar(): Promise<void> {
    this.enviando.set(true);
    try {
      const r = await this.api.aceptar(this.t);
      void this.router.navigate(['/entradas/confirmacion'], { queryParams: { t: r.token } });
    } catch (e) {
      this.error.set(errorDe(e).detail);
      this.oferta.set(null);
    } finally {
      this.enviando.set(false);
    }
  }
}

// ========================================================== mi entrada ===

/** /mi-entrada (Figma 38): the ticket by magic link — change people, resend, calendar, cancel; expired link → new one. */
@Component({
  selector: 'gr-mi-entrada',
  imports: [RouterLink, Page, FormsModule, GrButton, GrIcon, GrSkeleton, TicketCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Mi entrada" crumb="Mi entrada" [migasMovil]="false" [subtitle]="mia()?.email ?? ''" [cabecera]="mia() !== null">
      <div class="mx-auto flex max-w-[350px] flex-col gap-6 max-md:-mt-[27px] md:max-w-[480px]">
        @let m = mia();
        @if (m === undefined) { <gr-skeleton class="h-[560px] rounded-xl" /> }
        @else if (m === null) {
          <section class="flex flex-col items-center gap-4 pt-3 text-center">
            <span class="flex size-16 items-center justify-center rounded-full border border-line-strong bg-white/5 text-text-secondary"><gr-icon name="lock" [size]="26" /></span>
            <h2 class="text-display-xs">{{ token ? 'Este enlace ha caducado' : 'Accede a tu entrada' }}</h2>
            <p class="text-body-m text-text-secondary">{{ token ? 'Por seguridad, los enlaces duran 30 minutos. ' : '' }}Te enviamos uno nuevo al email de tu reserva.</p>
            @if (pedido()) { <p class="w-full rounded-md border border-success/40 bg-success/10 p-3 text-body-s text-success" role="status">Si ese email tiene entradas, te llegará un enlace en unos minutos.</p> }
            @else {
              <label class="flex h-12 w-full items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3 focus-within:border-accent"><gr-icon name="mail" [size]="16" class="text-text-tertiary" />
                <input type="email" class="h-full min-w-0 flex-1 bg-transparent text-body-m outline-none" placeholder="tu@email.com" [(ngModel)]="email" aria-label="Email" autocomplete="email" (keydown.enter)="pedir()" /></label>
              <button grButton variant="primary" size="l" type="button" class="w-full" (click)="pedir()">Enviarme un enlace nuevo</button>
              <p class="text-body-xs text-text-tertiary">Siempre respondemos igual exista o no la reserva (no se filtran emails).</p>
            }
          </section>
        } @else {
          <gr-ticket [linea1]="dia(m.sesion.inicio) + ' · ' + m.sesion.nombre" [linea2]="'Puertas ' + hora(m.sesion.puertas) + ' · hasta las ' + hora(m.sesion.fin)" [lugar]="m.lugar" [titular]="tit(m)" [codigo]="m.codigo" [qr]="m.estado === 'anulada' ? '' : m.qr" [estado]="m.estado" [validadaEn]="validada(m.validadaAt)" />
          @if (m.puedeCambiar) {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-ui-h5">¿Cambia algo?</h2>
              <div class="mt-4 flex items-center justify-between rounded-md border border-line-subtle bg-white/[0.02] p-4"><span class="text-label-m">Personas<span class="block text-body-xs text-text-tertiary">Tú + acompañantes</span></span>
                <span class="flex items-center gap-3"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-white/5 hover:bg-white/10 disabled:opacity-40" [disabled]="personas() <= 1" aria-label="Menos" (click)="personas.set(max(1, personas() - 1))">−</button><span class="w-8 text-center text-ui-h4" aria-live="polite">{{ personas() }}</span><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-white/5 hover:bg-white/10 disabled:opacity-40" [disabled]="personas() >= m.maxPersonas" aria-label="Más" (click)="personas.set(min(m.maxPersonas, personas() + 1))">+</button></span></div>
              <button type="button" class="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-white/5 text-label-s hover:bg-white/10 disabled:opacity-50" [disabled]="personas() === m.personas || ocupado()" (click)="guardar()">Guardar cambios <gr-icon name="arrow-right" [size]="14" /></button>
            </section>
          }
          @if (msg()) { <p class="rounded-md border border-success/40 bg-success/10 p-3 text-body-s text-success" role="status">{{ msg() }}</p> }
          @if (m.estado !== 'anulada') {
            <ul class="flex flex-col">
              <li><button type="button" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m hover:text-white disabled:opacity-50" [disabled]="reenviando()" (click)="reenviar()"><gr-icon name="send" [size]="18" /><span class="flex-1">Reenviar la entrada por email</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></button></li>
              <li><a routerLink="/rifa" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m hover:text-white"><gr-icon name="ticket" [size]="18" /><span class="flex-1">Rifa presencial: ver objetos</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></a></li>
              <li><a [href]="ics()" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m hover:text-white"><gr-icon name="calendar" [size]="18" /><span class="flex-1">Añadir al calendario (.ics)</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></a></li>
              @if (m.puedeCambiar) { <li><button type="button" class="flex h-14 w-full items-center gap-3 border-b border-line-subtle text-left text-body-m text-accent-text" (click)="anularOpen.set(true)"><gr-icon name="x" [size]="18" /><span class="flex-1">Anular entrada y liberar la plaza</span><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></button></li> }
            </ul>
          }
        }
      </div>
    </gr-page>
    @if (anularOpen() && mia(); as m) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:px-4" (click)="anularOpen.set(false)">
        <div class="mx-5 mb-[82px] w-full max-w-[350px] rounded-xl border border-line-strong bg-bg-raised p-7 shadow-card sm:mb-0" role="alertdialog" aria-modal="true" aria-label="Anular tu entrada" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3"><h2 class="text-ui-h3">¿Anular tu entrada?</h2><button type="button" class="flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Cerrar" (click)="anularOpen.set(false)"><gr-icon name="x" [size]="18" /></button></div>
          <p class="mt-3 text-body-m text-text-secondary">Liberarás {{ m.personas }} plaza{{ m.personas > 1 ? 's' : '' }} de la sesión del {{ sesionLarga(m.sesion.nombre) }} para la lista de espera.</p>
          <div class="mt-5 flex justify-end gap-2"><button grButton variant="outline" size="m" type="button" (click)="anularOpen.set(false)">Volver</button>
            <button grButton variant="primary" size="m" type="button" (click)="anular()">Sí, anular</button></div>
        </div>
      </div>
    }
  `,
})
export class MiEntradaPage {
  private readonly api = inject(EntradasPublic);
  protected readonly hora = hora;
  protected readonly validada = validada;
  protected readonly dia = dia;
  protected readonly tit = titular;
  protected readonly max = Math.max;
  protected readonly min = Math.min;
  /** «Sábado mañana» → «sábado por la mañana». */
  protected sesionLarga(n: string): string {
    return n.toLowerCase().replace(/ (mañana|tarde|noche)$/, ' por la $1');
  }
  protected readonly mia = signal<MiEntrada | null | undefined>(undefined);
  protected readonly personas = signal(1);
  protected readonly ocupado = signal(false);
  protected readonly msg = signal('');
  protected readonly anularOpen = signal(false);
  protected readonly pedido = signal(false);
  protected readonly reenviando = signal(false);
  protected readonly token: string;
  protected readonly ics = computed(() => this.api.ics(this.token));
  protected email = '';
  constructor() {
    inject(Seo).set({ title: 'Mi entrada · GR Strength Cup', description: 'Gestiona tu entrada: QR, personas, calendario o anulación.', path: '/mi-entrada', robots: 'noindex' });
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    if (!this.token) {
      this.mia.set(null);
      return;
    }
    void this.api.mia(this.token).then((m) => this.set(m), () => this.mia.set(null));
  }
  private set(m: MiEntrada): void {
    this.mia.set(m);
    this.personas.set(m.personas);
  }
  protected async guardar(): Promise<void> {
    this.ocupado.set(true);
    try {
      this.set(await this.api.personas(this.token, this.personas()));
      this.msg.set('Guardado. Tu QR sirve para todas las personas de la entrada.');
    } catch (e) {
      this.msg.set(errorDe(e).detail);
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async reenviar(): Promise<void> {
    if (this.reenviando()) return;
    this.reenviando.set(true);
    try {
      await this.api.reenviar(this.token);
      this.msg.set('Te la hemos reenviado. Llega en unos minutos.');
    } catch (e) {
      this.msg.set(errorDe(e).detail);
    }
    setTimeout(() => this.reenviando.set(false), 30_000); // cooldown: one email per 30 s
  }
  protected async anular(): Promise<void> {
    this.anularOpen.set(false);
    try {
      this.set(await this.api.anular(this.token));
      this.msg.set('');
    } catch (e) {
      this.msg.set(errorDe(e).detail);
    }
  }
  protected async pedir(): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) return;
    await this.api.enlace(this.email.trim()).catch(() => undefined);
    this.pedido.set(true);
  }
}
