import { ChangeDetectionStrategy, Component, PLATFORM_ID, PendingTasks, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrIcon, GrLogo, GrSkeleton } from '@grcup/ui';
import { Cms, type Faq } from '../core/cms';
import { Competition } from '../core/competition';
import { EntradasPublic, dia, diaLargo, errorDe, hora, qrDataURL, type Entradas, type MiEntrada, type Oferta, type SesionPub } from '../core/entradas';
import { Seo } from '../core/seo';
import { Newsletter } from '../layout/newsletter';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community } from './landings';

const ESTADO: Record<SesionPub['estado'], { label: string; cls: string }> = {
  disponible: { label: 'Disponible', cls: 'border-success/40 bg-success/10 text-success' },
  ultimas: { label: 'Últimas', cls: 'border-warning/50 bg-warning/10 text-warning' },
  agotada: { label: 'Agotada', cls: 'border-line-strong text-text-tertiary' },
  cerrada: { label: 'Cerrada', cls: 'border-line-strong text-text-tertiary' },
  proximamente: { label: 'Próximamente', cls: 'border-info/40 bg-info/10 text-info' },
};

/** Ticket card (Figma 37 hero, 38 confirmation and «Mi entrada»). */
@Component({
  selector: 'gr-ticket',
  imports: [GrIcon, GrLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="relative overflow-hidden rounded-xl border p-5 shadow-card" [class]="anulada() ? 'border-line-strong bg-bg-card opacity-60' : 'border-accent/50 bg-[linear-gradient(160deg,#3a0f17,#1b1112_70%)]'">
      <header class="flex items-start justify-between gap-3"><gr-logo [height]="34" /><span class="inline-flex h-6 items-center rounded-pill border px-2 text-mono-xs" [class]="anulada() ? 'border-line-strong text-text-tertiary' : 'border-success/50 bg-success/10 text-success'">{{ anulada() ? 'Anulada' : 'Entrada gratuita' }}</span></header>
      <p class="mt-3 font-display text-[26px] leading-none uppercase italic">{{ evento() }}</p>
      <ul class="mt-3 flex flex-col gap-1.5 text-body-s text-text-secondary">
        <li class="flex items-center gap-2"><gr-icon name="calendar" [size]="14" class="text-accent-text" />{{ linea1() }}</li>
        <li class="flex items-center gap-2"><gr-icon name="clock" [size]="14" class="text-accent-text" />{{ linea2() }}</li>
        @if (lugar()) { <li class="flex items-center gap-2"><gr-icon name="map-pin" [size]="14" class="text-accent-text" />{{ lugar() }}</li> }
        <li class="flex items-center gap-2"><gr-icon name="users" [size]="14" class="text-accent-text" />{{ titular() }}</li>
      </ul>
      <div class="relative my-4 border-t border-dashed border-white/20"><span class="absolute -top-3 -left-8 size-6 rounded-full bg-bg-base"></span><span class="absolute -top-3 -right-8 size-6 rounded-full bg-bg-base"></span></div>
      <div class="flex flex-col items-center gap-2">
        @if (img()) { <img [src]="img()" alt="Código QR de la entrada" width="168" height="168" class="size-42 rounded-md bg-white p-2" /> } @else { <span class="size-42 rounded-md bg-white/10"></span> }
        <p class="font-mono text-label-m tracking-widest">{{ codigo() }}</p>
        <p class="text-center text-body-xs text-text-tertiary">Enséñalo en la puerta desde el móvil (no hace falta imprimirlo)</p>
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
  readonly anulada = input(false);
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
  `${m.nombre} ${m.apellidos.split(' ')[0] ?? ''}`.trim() + (m.personas > 1 ? ` + ${m.personas - 1} acompañante${m.personas > 2 ? 's' : ''}` : '');

// ============================================================ /entradas ===

/** /entradas (Figma page 37): free tickets per session, waiting list when sold out. */
@Component({
  selector: 'gr-entradas-page',
  imports: [RouterLink, Page, FormsModule, GrAlert, GrIcon, GrSkeleton, TicketCard, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    <gr-page title="Vive la GRStrength Cup" accent="en directo" eyebrow="Entrada gratuita · aforo limitado" crumb="Entradas"
      subtitle="150 atletas, jueces AEP y tres movimientos al límite en Almussafes. La entrada es gratis: resérvala en un minuto y entra sin colas.">
      <div pageStamps class="flex flex-col gap-2 text-body-s text-text-secondary">
        <p class="flex items-center gap-2"><gr-icon name="calendar" [size]="16" class="text-accent-text" />{{ fechas() }}</p>
        <p class="flex items-center gap-2"><gr-icon name="map-pin" [size]="16" class="text-accent-text" />{{ comp.data()?.sede?.nombre || 'Almussafes' }}</p>
        @if (d?.personas) { <p class="flex items-center gap-2"><gr-icon name="users" [size]="16" class="text-accent-text" /><b class="text-text-primary">{{ n(d!.personas) }} personas</b> ya tienen entrada</p> }
      </div>

      <div class="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div class="order-2 flex flex-col gap-14 lg:order-1">
          <section class="hidden items-center gap-8 lg:flex" aria-label="Ejemplo de entrada">
            <gr-ticket class="w-80 shrink-0 -rotate-2" [linea1]="ejemplo().l1" [linea2]="ejemplo().l2" [lugar]="comp.data()?.sede?.nombre ?? ''" titular="Laura Gómez + 2 acompañantes" codigo="GRC-7K3P" qr="E:GRC-7K3P:ejemplo" />
            <div><p class="text-mono-xs text-text-tertiary">Ejemplo</p><h2 class="mt-2 text-display-2xs">Así es tu entrada</h2>
              <p class="mt-2 text-body-m text-text-secondary">Te llega por email y la tienes siempre en «Mi entrada». Un solo QR para todo tu grupo: lo escaneamos en la puerta y entráis juntos.</p>
              <a routerLink="." fragment="como-funciona" class="mt-4 inline-flex h-11 items-center gap-2 rounded-sm border border-line-strong px-4 text-label-s">Cómo funciona<gr-icon name="arrow-right" [size]="14" /></a></div>
          </section>
          <section>
            <p class="flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>El día</p>
            <h2 class="mt-2 text-display-xs md:text-display-s">Qué vas a <span class="text-accent-text">ver</span></h2>
            <ul class="mt-5 grid gap-3 sm:grid-cols-2">
              @for (x of queVer; track x.t) { <li class="rounded-lg border border-line-subtle bg-bg-card p-4"><gr-icon [name]="x.i" [size]="18" class="text-accent-text" /><p class="mt-3 text-label-m">{{ x.t }}</p><p class="mt-1 text-body-s text-text-tertiary">{{ x.d }}</p></li> }
            </ul>
          </section>
          <section id="como-funciona" class="scroll-mt-28">
            <p class="flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>Sin colas</p>
            <h2 class="mt-2 text-display-xs md:text-display-s">Cómo <span class="text-accent-text">funciona</span></h2>
            <ol class="mt-5 grid gap-3 sm:grid-cols-3">
              @for (x of pasos; track x.t; let i = $index) { <li class="rounded-lg border border-line-subtle bg-bg-card p-4"><span class="flex size-8 items-center justify-center rounded-sm bg-accent-deep/50 text-label-s text-accent-text">{{ i + 1 }}</span><p class="mt-3 text-label-m">{{ x.t }}</p><p class="mt-1 text-body-s text-text-tertiary">{{ x.d }}</p></li> }
            </ol>
          </section>
          @if (faq().length) {
            <section>
              <p class="flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>Dudas</p>
              <h2 class="mt-2 text-display-xs md:text-display-s">Preguntas <span class="text-accent-text">frecuentes</span></h2>
              <div class="mt-5 flex flex-col gap-2">
                @for (f of faq(); track f.pregunta) { <details class="group rounded-lg border border-line-subtle bg-bg-card px-4"><summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-label-m">{{ f.pregunta }}<gr-icon name="plus" [size]="16" class="transition-transform group-open:rotate-45" /></summary><p class="pb-4 text-body-s text-text-secondary">{{ f.respuesta }}</p></details> }
              </div>
            </section>
          }
        </div>

        <aside id="reservar" class="order-1 scroll-mt-28 lg:order-2">
          <div class="lg:sticky lg:top-28">
          @if (d === undefined) { <gr-skeleton class="h-[640px] rounded-xl" /> }
          @else if (d === null) { <gr-alert tone="warning" title="No hemos podido cargar las entradas">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert> }
          @else if (!abiertas().length) {
            <section class="rounded-xl border border-line-subtle bg-bg-card p-6 text-center">
              <h2 class="text-display-2xs">{{ todasAgotadas() ? 'Entradas agotadas' : 'Reservas cerradas' }}</h2>
              <p class="mt-2 text-body-s text-text-secondary">{{ todasAgotadas() ? 'Apúntate a la lista de espera de una sesión: si alguien anula, te escribimos.' : 'Ahora mismo no hay sesiones con reservas abiertas.' }}</p>
            </section>
          }
          @if (d && (abiertas().length || todasAgotadas())) {
            @if (enviado(); as e) {
              <section class="rounded-xl border border-success/40 bg-success/10 p-6 text-center" role="status"><gr-icon name="mail" [size]="24" class="text-success" /><h2 class="mt-2 text-ui-h4">Te hemos apuntado</h2><p class="mt-1 text-body-s text-text-secondary">{{ e }}</p></section>
            } @else if (sesSel()?.estado === 'agotada' && sesSel()?.listaEspera) {
              <section class="rounded-xl border border-warning/50 bg-bg-card p-5">
                <h2 class="flex items-center gap-2 text-ui-h4"><gr-icon name="bell" [size]="20" class="text-warning" />{{ sesSel()!.nombre }} está completa</h2>
                <p class="mt-2 text-body-s text-text-secondary">Apúntate a la lista de espera de esta sesión. Si alguien anula, te mandamos un enlace y tendrás un plazo para confirmar tu entrada.</p>
                <label class="mt-4 block"><span class="sr-only">Email</span><input type="email" class="h-12 w-full rounded-md border border-line-strong bg-bg-field px-3 text-body-m" placeholder="tu@email.com" [(ngModel)]="f.email" name="we" /></label>
                <div class="mt-3 flex items-center justify-between rounded-md border border-line-subtle px-3 py-2"><span class="text-label-m">Personas<span class="block text-body-xs text-text-tertiary">Tú + acompañantes</span></span>
                  <span class="flex items-center gap-3"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong" aria-label="Menos personas" (click)="f.personas = max(1, f.personas - 1)">−</button><span class="w-5 text-center text-ui-h5">{{ f.personas }}</span><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong" aria-label="Más personas" (click)="f.personas = min(sesSel()?.maxPorReserva ?? 6, f.personas + 1)">+</button></span></div>
                <label class="mt-3 flex items-start gap-2 text-body-s"><input type="checkbox" class="mt-1 size-4 accent-[#c42b3e]" [(ngModel)]="f.privacidad" name="wp" /><span>He leído y acepto la <a href="/privacidad" class="text-accent-text underline">política de privacidad</a> *</span></label>
                @if (error()) { <p class="mt-2 text-body-s text-accent-text" role="alert">{{ error() }}</p> }
                <button type="button" class="mt-4 h-12 w-full rounded-sm bg-accent-grain text-label-m text-white disabled:opacity-60" [disabled]="enviando()" (click)="apuntarme()">{{ enviando() ? 'Enviando…' : 'Apuntarme a la lista de espera' }}</button>
                <button type="button" class="mt-2 h-11 w-full text-label-s text-text-tertiary" (click)="sesion.set('')">Elegir otra sesión</button>
              </section>
            } @else {
              <form class="flex flex-col gap-5 rounded-xl border border-line-subtle bg-bg-card p-5" (submit)="$event.preventDefault(); reservar()" novalidate>
                <div><h2 class="text-display-2xs">Reserva tu entrada</h2>
                  <p class="mt-2 flex flex-wrap gap-1.5">@for (c of ['Gratis', '1 minuto', 'QR por email']; track c) { <span class="inline-flex h-6 items-center gap-1 rounded-pill border border-success/40 px-2 text-mono-xs text-success"><gr-icon name="check" [size]="10" />{{ c }}</span> }</p></div>
                @if (errores().length) { <gr-alert tone="danger" [title]="'Revisa ' + errores().length + (errores().length === 1 ? ' campo' : ' campos')">@for (e of errores(); track e) { <span class="block">{{ e }}</span> }</gr-alert> }
                <fieldset class="flex flex-col gap-3"><legend class="mb-2 flex items-center gap-2 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent text-mono-xs text-white">1</span>Tus datos</legend>
                  <div class="grid grid-cols-2 gap-2">
                    <label class="text-body-xs text-text-tertiary">Nombre *<input class="mt-1 h-12 w-full rounded-md border bg-bg-field px-3 text-body-m text-text-primary" [class]="err('nombre') ? 'border-accent-text' : 'border-line-strong'" [(ngModel)]="f.nombre" name="nombre" autocomplete="given-name" /></label>
                    <label class="text-body-xs text-text-tertiary">Apellidos *<input class="mt-1 h-12 w-full rounded-md border bg-bg-field px-3 text-body-m text-text-primary" [class]="err('apellidos') ? 'border-accent-text' : 'border-line-strong'" [(ngModel)]="f.apellidos" name="apellidos" autocomplete="family-name" /></label>
                  </div>
                  <label class="text-body-xs text-text-tertiary">Email *<input type="email" class="mt-1 h-12 w-full rounded-md border bg-bg-field px-3 text-body-m text-text-primary" [class]="err('email') ? 'border-accent-text' : 'border-line-strong'" [(ngModel)]="f.email" name="email" autocomplete="email" placeholder="ahí te llega la entrada" /></label>
                  <div class="grid grid-cols-2 gap-2">
                    <label class="text-body-xs text-text-tertiary">Teléfono (opcional)<input type="tel" class="mt-1 h-12 w-full rounded-md border border-line-strong bg-bg-field px-3 text-body-m text-text-primary" [(ngModel)]="f.telefono" name="tel" autocomplete="tel" placeholder="+34 600 000 000" /></label>
                    <label class="text-body-xs text-text-tertiary">¿Cómo nos conociste?<select class="mt-1 h-12 w-full rounded-md border border-line-strong bg-bg-field px-3 text-body-m text-text-primary" [(ngModel)]="f.origen" name="origen"><option value="">Elige una opción</option>@for (o of origenes; track o) { <option [value]="o">{{ o }}</option> }</select></label>
                  </div>
                </fieldset>
                <fieldset class="flex flex-col gap-2"><legend class="mb-2 flex w-full items-center gap-2 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent text-mono-xs text-white">2</span>Elige sesión</legend>
                  @for (s of d!.sesiones; track s.id) {
                    <button type="button" role="radio" [attr.aria-checked]="sesion() === s.id" [disabled]="s.estado === 'cerrada' || s.estado === 'proximamente'" (click)="elegir(s)"
                      class="flex items-center gap-3 rounded-lg border p-3 text-left disabled:opacity-50" [class]="sesion() === s.id ? 'border-accent bg-accent-deep/25' : err('sesion') ? 'border-accent-text/60' : 'border-line-subtle'">
                      <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2" [class]="sesion() === s.id ? 'border-accent' : 'border-line-strong'">@if (sesion() === s.id) { <span class="size-2.5 rounded-full bg-accent"></span> }</span>
                      <span class="min-w-0 flex-1"><span class="block text-label-m first-letter:uppercase">{{ s.nombre }}</span><span class="block text-body-xs text-text-tertiary">Puertas {{ hora(s.puertas) }}{{ s.detalle ? ' · ' + s.detalle : '' }}</span></span>
                      <span class="inline-flex h-6 shrink-0 items-center rounded-pill border px-2 text-mono-xs" [class]="estado[s.estado].cls">{{ s.estado === 'ultimas' ? 'Últimas ' + s.libres : estado[s.estado].label }}</span>
                    </button>
                  }
                </fieldset>
                <fieldset><legend class="mb-2 flex items-center gap-2 text-label-m"><span class="flex size-6 items-center justify-center rounded-full bg-accent text-mono-xs text-white">3</span>¿Cuántos venís?</legend>
                  <div class="flex items-center justify-between rounded-md border border-line-subtle px-3 py-2"><span class="text-label-m">Personas<span class="block text-body-xs text-text-tertiary">Tú + acompañantes</span></span>
                    <span class="flex items-center gap-3"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong" aria-label="Menos personas" (click)="f.personas = max(1, f.personas - 1)">−</button><span class="w-5 text-center text-ui-h5">{{ f.personas }}</span><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong" aria-label="Más personas" (click)="f.personas = min(maxPersonas(), f.personas + 1)">+</button></span></div>
                </fieldset>
                <div class="flex flex-col gap-2 text-body-s">
                  <label class="flex items-start gap-2" [class.text-accent-text]="err('privacidad')"><input type="checkbox" class="mt-1 size-4 shrink-0 accent-[#c42b3e]" [(ngModel)]="f.privacidad" name="priv" /><span>He leído y acepto la <a href="/privacidad" class="text-accent-text underline">política de privacidad</a> *</span></label>
                  <label class="flex items-start gap-2"><input type="checkbox" class="mt-1 size-4 shrink-0 accent-[#c42b3e]" [(ngModel)]="f.novedades" name="nov" /><span>Quiero recibir novedades de la GRStrength Cup y de otras competiciones de GRStrength. <span class="text-text-tertiary">(Opcional: te pediremos confirmarlo por email)</span></span></label>
                  <p class="rounded-md bg-bg-raised p-3 text-body-xs text-text-tertiary">Responsable: GRStrength · Finalidad: gestionar tu entrada y, si lo marcas, enviarte novedades · Legitimación: tu consentimiento · Derechos: acceso, rectificación, supresión y oposición escribiendo a {{ comp.data()?.evento?.emailContacto || 'la organización' }} · Más en la política de privacidad.</p>
                </div>
                <button type="submit" class="h-12 rounded-sm bg-accent-grain text-label-m text-white disabled:opacity-60" [disabled]="enviando()">{{ enviando() ? 'Reservando…' : 'Reservar entrada gratis' }}</button>
                <p class="flex items-center justify-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />Solo usamos tus datos para tu entrada. Sin spam.</p>
              </form>
            }
          }
          @if (sesHero(); as s) {
            <div class="mt-4 rounded-lg border border-line-subtle bg-bg-card p-4">
              <p class="flex justify-between text-label-s"><span>Aforo · {{ s.nombre }}</span><span class="font-mono">{{ n(s.ocupadas) }} / {{ n(s.aforo) }}</span></p>
              <div class="mt-2 h-2 rounded-pill bg-bg-raised"><div class="h-full rounded-pill bg-accent" [style.width.%]="min(100, s.ocupadas * 100 / s.aforo)"></div></div>
              <p class="mt-1.5 text-body-xs text-text-tertiary">{{ s.libres ? 'Quedan ' + n(s.libres) + ' entradas para esta sesión' : 'Agotada · lista de espera' }}</p>
            </div>
          }
          </div>
        </aside>
      </div>
      <div class="mt-18 md:mt-24"><gr-community /></div>
    </gr-page>
  `,
})
export class EntradasPage {
  private readonly api = inject(EntradasPublic);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly comp = inject(Competition);
  protected readonly hora = hora;
  protected readonly estado = ESTADO;
  protected readonly max = Math.max;
  protected readonly min = Math.min;
  protected readonly origenes = ['Instagram', 'Un amigo o familiar', 'Mi club o gimnasio', 'Un atleta', 'Cartel o flyer', 'Otro'];
  protected readonly queVer = [
    { i: 'zap' as const, t: 'Sentadilla, banca y peso muerto', d: 'Tres intentos por movimiento y atleta, con jueces oficiales de la AEP.' },
    { i: 'users' as const, t: '150 atletas', d: 'De subjúnior a máster, de clubs de toda la Comunitat Valenciana.' },
    { i: 'trophy' as const, t: 'Premios y sorteo en directo', d: 'Medallas por categoría y sorteo del cinturón SBD al final del día.' },
    { i: 'star' as const, t: 'Sigue a tus atletas', d: 'Horarios en directo en el móvil y aviso 30 min antes de que compitan.' },
  ];
  protected readonly pasos = [
    { t: 'Reserva en 1 minuto', d: 'Elige sesión y cuántos venís. Si quieres, súmate al sorteo.' },
    { t: 'Recibe tu QR', d: 'Por email y en «Mi entrada». Añádelo al calendario.' },
    { t: 'Enséñalo en la puerta', d: 'Los escaneamos desde el móvil y entras. No hace falta imprimirlo.' },
  ];
  protected readonly data = signal<Entradas | null | undefined>(undefined);
  protected readonly faq = signal<Faq[]>([]);
  protected readonly sesion = signal('');
  protected readonly enviando = signal(false);
  protected readonly errores = signal<string[]>([]);
  protected readonly campos = signal<string[]>([]);
  protected readonly error = signal('');
  protected readonly enviado = signal('');
  protected f = { nombre: '', apellidos: '', email: '', telefono: '', origen: '', personas: 1, privacidad: false, novedades: false };
  protected readonly sesSel = computed(() => this.data()?.sesiones.find((s) => s.id === this.sesion()));
  protected readonly abiertas = computed(() => (this.data()?.sesiones ?? []).filter((s) => s.estado === 'disponible' || s.estado === 'ultimas'));
  protected readonly todasAgotadas = computed(() => { const l = this.data()?.sesiones ?? []; return l.length > 0 && l.every((s) => s.estado === 'agotada' || s.estado === 'cerrada') && l.some((s) => s.estado === 'agotada'); });
  protected readonly sesHero = computed(() => this.sesSel() ?? this.abiertas()[0]);
  protected readonly ejemplo = computed(() => {
    const x = this.sesHero();
    return x ? { l1: dia(x.inicio) + ' · ' + x.nombre, l2: 'Puertas ' + hora(x.puertas) + ' · hasta las ' + hora(x.fin) } : { l1: 'Sábado 25 jul · Sesión de mañana', l2: 'Puertas 8:30 · hasta las 14:00' };
  });
  protected readonly maxPersonas = computed(() => Math.min(this.sesSel()?.maxPorReserva ?? 6, Math.max(1, this.sesSel()?.libres ?? 6)));
  protected readonly fechas = computed(() => {
    const c = this.comp.data();
    return c?.fechaInicio ? diaLargo(c.fechaInicio + 'T12:00:00Z') + (c.fechaFin && c.fechaFin !== c.fechaInicio ? ' y ' + diaLargo(c.fechaFin + 'T12:00:00Z') : '') : 'Fecha por confirmar';
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      const [d, faq] = await Promise.all([this.api.sesiones(), cms.faq(), this.comp.load()]);
      this.data.set(d);
      const l = faq ?? [];
      this.faq.set((l.some((x) => /entrada/i.test(x.categoria)) ? l.filter((x) => /entrada/i.test(x.categoria)) : l).slice(0, 5));
      const s = d?.sesiones.find((x) => x.estado === 'disponible' || x.estado === 'ultimas');
      if (s) this.sesion.set(s.id);
      await applySeo(cms, seo, '/entradas', 'Entradas gratis · GR Strength Cup', 'Reserva gratis tu entrada para la GR Strength Cup en Almussafes: elige sesión, recibe tu QR por email y entra sin colas.');
    });
  }
  protected n(v: number): string {
    return v.toLocaleString('es-ES');
  }
  protected err(c: string): boolean {
    return this.campos().includes(c);
  }
  protected elegir(s: SesionPub): void {
    this.sesion.set(s.id);
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
    return e.length === 0;
  }
  protected async reservar(): Promise<void> {
    if (!this.validar()) return;
    this.enviando.set(true);
    const qp = this.route.snapshot.queryParamMap;
    const utm: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'ref']) { const v = qp.get(k); if (v) utm[k] = v.slice(0, 60); }
    try {
      const r = await this.api.reservar({ sesionId: this.sesion(), nombre: this.f.nombre.trim(), apellidos: this.f.apellidos.trim(), email: this.f.email.trim(), telefono: this.f.telefono.trim() || undefined,
        personas: this.f.personas, origen: this.f.origen || undefined, utm, aceptaPrivacidad: true, novedades: this.f.novedades });
      void this.router.navigate(['/entradas/confirmacion'], { queryParams: { t: r.token } });
    } catch (e) {
      const x = errorDe(e);
      if (x.code === 'AGOTADA') {
        this.data.set(await this.api.sesiones());
      }
      this.errores.set([x.detail]);
    } finally {
      this.enviando.set(false);
    }
  }
  protected async apuntarme(): Promise<void> {
    this.error.set('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.f.email.trim())) return this.error.set('Escribe un email válido.');
    if (!this.f.privacidad) return this.error.set('Acepta la política de privacidad.');
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

/** /entradas/confirmacion (Figma 38): «¡Tienes entrada!», QR, calendar, news and «Invita a tu gente». */
@Component({
  selector: 'gr-entrada-confirmacion',
  imports: [Page, GrIcon, GrSkeleton, TicketCard, Newsletter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="¡Tienes entrada!" crumb="Confirmación" [hideTitle]="true">
      <div class="mx-auto flex max-w-md flex-col gap-4">
        @let m = mia();
        @if (m === undefined) { <gr-skeleton class="h-[560px] rounded-xl" /> }
        @else if (m === null) { <section class="rounded-xl border border-line-subtle bg-bg-card p-6 text-center"><h1 class="text-display-2xs">Enlace caducado</h1><p class="mt-2 text-body-s text-text-secondary">Abre el enlace de tu email o pídelo de nuevo en <a href="/mi-entrada" class="text-accent-text underline">Mi entrada</a>.</p></section> }
        @else {
          <div class="flex flex-col items-center text-center"><span class="flex size-12 items-center justify-center rounded-full border border-success/50 text-success"><gr-icon name="check" [size]="22" /></span>
            <h1 class="mt-3 text-display-s">¡Tienes entrada!</h1><p class="mt-2 text-body-m text-text-secondary">Te la hemos enviado a {{ m.email }}. Si no la ves en 2 minutos, mira en spam.</p></div>
          <gr-ticket [linea1]="dia(m.sesion.inicio) + ' · ' + m.sesion.nombre" [linea2]="'Puertas ' + hora(m.sesion.puertas) + ' · hasta las ' + hora(m.sesion.fin)" [lugar]="m.lugar" [titular]="tit(m)" [codigo]="m.codigo" [qr]="m.qr" />
          <div class="grid grid-cols-2 gap-2">
            <a [href]="ics()" class="flex h-11 items-center justify-center gap-2 rounded-sm border border-line-strong text-label-s"><gr-icon name="calendar-plus" [size]="16" />Al calendario</a>
            <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-sm border border-line-strong text-label-s" (click)="imprimir()"><gr-icon name="download" [size]="16" />Guardar en PDF</button>
          </div>
          <gr-newsletter titulo="¿Te avisamos de la próxima?" texto="Novedades de GRStrength: un email al mes como mucho. Te pediremos confirmarlo." origen="/entradas/confirmacion" [compacta]="true" />
          <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
            <p class="text-label-m">Invita a tu gente</p><p class="mt-1 text-body-xs text-text-tertiary">Comparte tu enlace: sabremos cuántas entradas trae tu invitación.</p>
            <div class="mt-3 flex items-center gap-2 rounded-md border border-line-strong bg-bg-field px-3"><span class="min-w-0 flex-1 truncate py-2.5 font-mono text-body-xs">{{ m.compartir }}</span><button type="button" class="text-label-s text-accent-text" (click)="copiar(m.compartir)">{{ copiado() ? 'Copiado' : 'Copiar' }}</button></div>
            <div class="mt-2 grid grid-cols-3 gap-2 text-label-s">
              <a [href]="'https://wa.me/?text=' + enc('Vente a la GRStrength Cup, la entrada es gratis: ' + m.compartir)" target="_blank" rel="noopener" class="flex h-10 items-center justify-center rounded-sm border border-line-strong">WhatsApp</a>
              <a [href]="'https://twitter.com/intent/tweet?url=' + enc(m.compartir)" target="_blank" rel="noopener" class="flex h-10 items-center justify-center rounded-sm border border-line-strong">X</a>
              <a [href]="'https://www.facebook.com/sharer/sharer.php?u=' + enc(m.compartir)" target="_blank" rel="noopener" class="flex h-10 items-center justify-center rounded-sm border border-line-strong">Facebook</a>
            </div>
          </section>
          <a [href]="'/mi-entrada?t=' + token" class="text-center text-label-s text-accent-text">Gestionar mi entrada →</a>
        }
      </div>
    </gr-page>
  `,
})
export class ConfirmacionPage {
  private readonly api = inject(EntradasPublic);
  protected readonly hora = hora;
  protected readonly dia = dia;
  protected readonly tit = titular;
  protected readonly mia = signal<MiEntrada | null | undefined>(undefined);
  protected readonly copiado = signal(false);
  protected readonly token: string;
  protected readonly ics = computed(() => this.api.ics(this.token));
  constructor() {
    inject(Seo).set({ title: 'Tu entrada · GR Strength Cup', description: 'Tu entrada gratuita con su QR.', path: '/entradas/confirmacion', robots: 'noindex' });
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('t') ?? '';
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.api.mia(this.token).then((m) => this.mia.set(m), () => this.mia.set(null));
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
  imports: [Page, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Hay plaza para ti" crumb="Lista de espera">
      <div class="mx-auto max-w-md">
        @let o = oferta();
        @if (o === undefined) { <gr-skeleton class="h-64 rounded-xl" /> }
        @else if (o === null || o.estado !== 'oferta') {
          <section class="rounded-xl border border-line-subtle bg-bg-card p-6 text-center"><h2 class="text-display-2xs">Esta oferta ya no vale</h2><p class="mt-2 text-body-s text-text-secondary">{{ error() || 'Ha caducado o ya la has usado. Si quedan plazas, puedes reservar en Entradas.' }}</p><a href="/entradas" class="mt-4 inline-flex h-11 items-center rounded-sm bg-accent-grain px-5 text-label-s text-white">Ver entradas</a></section>
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
  imports: [Page, FormsModule, GrIcon, GrSkeleton, TicketCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Mi entrada" crumb="Mi entrada" [subtitle]="mia()?.email ?? ''">
      <div class="mx-auto flex max-w-md flex-col gap-4">
        @let m = mia();
        @if (m === undefined) { <gr-skeleton class="h-[560px] rounded-xl" /> }
        @else if (m === null) {
          <section class="rounded-xl border border-line-subtle bg-bg-card p-6">
            <h2 class="text-ui-h4">{{ token ? 'Este enlace ya no vale' : 'Accede a tu entrada' }}</h2>
            <p class="mt-2 text-body-s text-text-secondary">Escribe el email con el que reservaste y te enviamos un enlace nuevo.</p>
            @if (pedido()) { <p class="mt-3 rounded-md border border-success/40 bg-success/10 p-3 text-body-s text-success">Si ese email tiene entradas, te llegará un enlace en unos minutos.</p> }
            @else {
              <input type="email" class="mt-3 h-12 w-full rounded-md border border-line-strong bg-bg-field px-3 text-body-m" placeholder="tu@email.com" [(ngModel)]="email" aria-label="Email" />
              <button type="button" class="mt-3 h-12 w-full rounded-sm bg-accent-grain text-label-m text-white" (click)="pedir()">Enviarme el enlace</button>
            }
          </section>
        } @else {
          <gr-ticket [linea1]="dia(m.sesion.inicio) + ' · ' + m.sesion.nombre" [linea2]="'Puertas ' + hora(m.sesion.puertas) + ' · hasta las ' + hora(m.sesion.fin)" [lugar]="m.lugar" [titular]="tit(m)" [codigo]="m.codigo" [qr]="m.estado === 'anulada' ? '' : m.qr" [anulada]="m.estado === 'anulada'" />
          @if (m.estado === 'anulada') { <p class="rounded-lg border border-line-strong p-3 text-center text-body-s text-text-secondary">Entrada anulada. Si fue un error, <a href="/entradas" class="text-accent-text underline">reserva otra</a> mientras queden plazas.</p> }
          @if (m.puedeCambiar) {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
              <h2 class="text-label-m">¿Cambia algo?</h2>
              <div class="mt-3 flex items-center justify-between"><span class="text-body-s">Personas<span class="block text-body-xs text-text-tertiary">Tú + acompañantes</span></span>
                <span class="flex items-center gap-3"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong" aria-label="Menos" (click)="personas.set(max(1, personas() - 1))">−</button><span class="w-5 text-center text-ui-h5">{{ personas() }}</span><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong" aria-label="Más" (click)="personas.set(min(m.maxPersonas, personas() + 1))">+</button></span></div>
              <button type="button" class="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-line-strong text-label-s disabled:opacity-50" [disabled]="personas() === m.personas || ocupado()" (click)="guardar()">Guardar cambios <gr-icon name="arrow-right" [size]="14" /></button>
            </section>
          }
          @if (msg()) { <p class="rounded-md border border-success/40 bg-success/10 p-3 text-body-s text-success" role="status">{{ msg() }}</p> }
          @if (m.estado !== 'anulada') {
            <ul class="flex flex-col rounded-lg border border-line-subtle bg-bg-card">
              <li><button type="button" class="flex h-12 w-full items-center gap-3 px-4 text-left text-body-s" (click)="reenviar()"><gr-icon name="send" [size]="16" /><span class="flex-1">Reenviar la entrada por email</span><gr-icon name="chevron-right" [size]="16" /></button></li>
              <li class="border-t border-line-subtle"><a [href]="ics()" class="flex h-12 items-center gap-3 px-4 text-body-s"><gr-icon name="calendar-plus" [size]="16" /><span class="flex-1">Añadir al calendario (.ics)</span><gr-icon name="chevron-right" [size]="16" /></a></li>
              @if (m.puedeCambiar) { <li class="border-t border-line-subtle"><button type="button" class="flex h-12 w-full items-center gap-3 px-4 text-left text-body-s text-accent-text" (click)="anularOpen.set(true)"><gr-icon name="x" [size]="16" /><span class="flex-1">Anular entrada y liberar la plaza</span><gr-icon name="chevron-right" [size]="16" /></button></li> }
            </ul>
          }
        }
      </div>
    </gr-page>
    @if (anularOpen() && mia(); as m) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:px-4" (click)="anularOpen.set(false)">
        <div class="w-full max-w-md rounded-t-xl border border-line-strong bg-bg-raised p-6 sm:rounded-xl" role="alertdialog" aria-modal="true" aria-label="Anular tu entrada" (click)="$event.stopPropagation()">
          <h2 class="text-ui-h4">¿Anular tu entrada?</h2>
          <p class="mt-2 text-body-s text-text-secondary">Liberarás {{ m.personas }} plaza{{ m.personas > 1 ? 's' : '' }} de {{ m.sesion.nombre }} para la lista de espera. Tu QR dejará de valer.</p>
          <div class="mt-5 flex justify-end gap-2"><button type="button" class="h-11 rounded-sm border border-line-strong px-4 text-label-s" (click)="anularOpen.set(false)">Volver</button>
            <button type="button" class="h-11 rounded-sm bg-accent-grain px-4 text-label-s text-white" (click)="anular()">Sí, anular</button></div>
        </div>
      </div>
    }
  `,
})
export class MiEntradaPage {
  private readonly api = inject(EntradasPublic);
  protected readonly hora = hora;
  protected readonly dia = dia;
  protected readonly tit = titular;
  protected readonly max = Math.max;
  protected readonly min = Math.min;
  protected readonly mia = signal<MiEntrada | null | undefined>(undefined);
  protected readonly personas = signal(1);
  protected readonly ocupado = signal(false);
  protected readonly msg = signal('');
  protected readonly anularOpen = signal(false);
  protected readonly pedido = signal(false);
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
    try {
      await this.api.reenviar(this.token);
      this.msg.set('Te la hemos reenviado. Llega en unos minutos.');
    } catch (e) {
      this.msg.set(errorDe(e).detail);
    }
  }
  protected async anular(): Promise<void> {
    this.anularOpen.set(false);
    try {
      this.set(await this.api.anular(this.token));
      this.msg.set('Entrada anulada. Gracias por liberar la plaza.');
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
