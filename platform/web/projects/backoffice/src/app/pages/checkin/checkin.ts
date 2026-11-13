import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrBadge, GrButton, GrIcon, GrKpi, GrSkeleton, GrToasts, GrSelect, type GrIconName } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, TituloMovil, errText } from '../../shared/ui';
import { AtletasApi } from '../atletas/api';
import { EntradasApi, RESULTADO, fechaCorta, horaSeg, hora, type Bootstrap, type Compacta, type Entrada, type EscaneoIn, type Resultado, type ResumenCheckin } from '../entradas/api';

type TabTaquilla = 'puerta' | 'escaneos' | 'incidencias';
/** «Sábado mañana» → «Sáb. mañana» (mobile topbar and search rows). */
const corta = (s: string) => s.replace(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)/, (m) => m.slice(0, 3) + '.');

/** «Check-in y taquilla» (Figma 59 · «Taquilla · resumen»): people inside, pace, incidents and the latest scans. */
@Component({
  selector: 'bo-taquilla',
  imports: [RouterLink, BoPageHeader, GrBadge, GrButton, GrIcon, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = data();
    <div class="mx-auto -mt-2.5 flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Check-in y taquilla" [subtitle]="sub()" [crumbs]="[comps.current()?.nombreCorto || '', 'Hoy', 'Check-in y taquilla']">
        <a actions grButton variant="primary" routerLink="escaner">Abrir escáner</a>
      </bo-page-header>
      <nav class="-mt-[18px] flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" role="tablist" aria-label="Check-in">
        @for (t of tabs(); track t.key) {
          @if (t.key === 'pesaje') {
            <a role="tab" aria-selected="false" routerLink="../atletas/pesaje" class="flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 pb-3 pt-1 text-[15px] font-medium leading-[1.2] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none">{{ t.label }}</a>
          } @else {
            <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" (click)="tab.set($any(t.key))"
              class="flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-[15px] font-medium leading-[1.2] transition-colors focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
              [class]="tab() === t.key ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'">{{ t.label }}
              @if (t.n !== null) { <span class="rounded-xs bg-bg-raised px-1.5 py-0.5 text-mono-xs text-text-secondary">{{ n(t.n) }}</span> }</button>
          }
        }
      </nav>
      @if (r) {
        @if (tab() === 'puerta') {
          <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <gr-kpi label="Personas dentro" [value]="n(dentro())" [delta]="pct() + ' %'" [caption]="'de ' + n(reservadas())" [trend]="acum(r.ritmo)" />
            <gr-kpi label="Escaneos / min" [value]="n(r.ritmo[r.ritmo.length - 1] ?? 0)" [caption]="'pico ' + max(r.ritmo) + (max(r.ritmo) ? ' · ' + pico(r.ritmo) : '')" [trend]="r.ritmo" />
            <gr-kpi label="Sin presentarse" [value]="n(reservadas() - dentro())" caption="reservas sin escanear" [trend]="sinPres(r.ritmo)" />
            <gr-kpi label="Incidencias" [value]="n(r.incidencias.length + sinRed().length)" caption="duplicados y QR inválidos" [trend]="r.ritmoIncidencias ?? []" />
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="flex items-center justify-between text-ui-h4">Entradas por minuto<span class="text-body-xs font-normal text-text-tertiary">{{ desde() }}</span></h2>
              <div class="mt-6 flex h-48 items-end gap-1" role="img" [attr.aria-label]="'Entradas por minuto, pico ' + max(r.ritmo)">
                @for (v of r.ritmo; track $index) { <div class="flex-1 rounded-t-2xs" [class]="v && v >= max(r.ritmo) * 0.75 ? 'bg-accent' : 'bg-accent-deep'" [style.height.%]="max(r.ritmo) ? 6 + v * 94 / max(r.ritmo) : 6" [title]="v + ' personas'"></div> }
              </div>
              @if (r.hitos?.length) {
                <div class="relative mt-2 h-5" aria-label="Campañas">
                  @for (h of r.hitos; track h.at) { <span class="absolute -translate-x-1/2 whitespace-nowrap border-l border-accent pl-1 text-mono-xs text-accent-text" [style.left.%]="hitoPos(h.at)">{{ h.etiqueta }}</span> }
                </div>
              }
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h4">Incidencias</h2>
              <ul class="mt-4 flex flex-col gap-2">
                @for (p of sinRed(); track p.id) {
                  <li class="flex gap-3 rounded-md border border-accent/50 bg-accent-deep/20 p-4 text-body-s"><gr-icon name="circle-x" [size]="18" class="mt-0.5 text-accent-text" />
                    <span><b class="block text-label-m text-accent-text">{{ p.nombre }} sin conexión</b><span class="text-text-secondary">{{ p.cola }} en cola desde {{ hora(p.ultimoPing) }}.</span>
                      @if (p.telefono) { <a class="mt-1 flex items-center gap-1 text-label-s text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-accent" [href]="'tel:' + p.telefono.replaceAll(' ', '')">Llamar a {{ p.responsable || 'responsable' }} <gr-icon name="arrow-right" [size]="14" /></a> }</span></li>
                }
                @for (x of r.incidencias.slice(0, 3); track x.id) {
                  <li class="flex gap-3 rounded-md border border-warning/50 bg-warning/10 p-4 text-body-s"><gr-icon [name]="x.resultado === 'invalida' || x.resultado === 'anulada' ? 'circle-x' : 'triangle-alert'" [size]="18" class="mt-0.5 text-warning" />
                    <span><b class="block text-label-m text-warning">{{ x.codigo || 'QR no reconocido' }} · {{ x.resultado === 'ya_usada' && x.puestoAnterior ? (x.puestoAnterior !== x.puesto ? 'usada en ' + x.puestoAnterior + ' y ' + x.puesto : 'usada 2 veces en ' + x.puesto) : res[x.resultado].label }}</b>
                      <span class="block text-text-secondary">{{ x.nombre || '—' }} · {{ x.puesto }} · {{ hora(x.at) }}</span>
                      <button type="button" class="mt-1 inline-flex items-center gap-1 text-label-m text-warning hover:underline focus-visible:outline-2 focus-visible:outline-accent" (click)="tab.set('incidencias')">Ver escaneos <gr-icon name="arrow-right" [size]="14" /></button></span></li>
                } @empty { @if (!sinRed().length) { <li class="flex items-center gap-2 text-body-s text-success"><gr-icon name="circle-check" [size]="16" />Sin incidencias</li> } }
              </ul>
            </section>
          </div>
        }
        @let filas = tab() === 'incidencias' ? r.incidencias : tab() === 'escaneos' ? r.ultimos : r.ultimos.slice(0, 6);
        <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
          <table class="w-full table-fixed text-left text-body-s">
            <thead class="border-b border-line-subtle text-mono-xs uppercase text-text-tertiary"><tr><th class="w-36 px-4 py-3 font-normal">Hora</th><th class="w-28 px-3 py-3 font-normal">Código</th><th class="px-3 py-3 font-normal">Titular</th><th class="w-40 px-3 py-3 font-normal">Puesto</th><th class="w-36 px-3 py-3 font-normal">Resultado</th></tr></thead>
            <tbody>
              @for (x of filas; track x.id) {
                <tr class="border-b border-line-subtle last:border-0 hover:bg-bg-raised" [class.bg-success/5]="$first && x.resultado === 'valida'"><td class="px-4 py-3 font-mono text-mono-xs">{{ cuando(x.at) }}</td><td class="px-3 py-3 font-mono text-mono-xs">{{ x.codigo || '–' }}</td>
                  <td class="truncate px-3 py-3">{{ x.nombre || 'QR no reconocido' }}{{ (x.total ?? 0) > 1 && x.resultado !== 'anulada' && (x.acumulado ?? x.personas) > 0 ? ' (' + (x.acumulado ?? x.personas) + ' de ' + x.total + ')' : x.personas > 1 ? ' (' + x.personas + ')' : '' }}</td><td class="truncate px-3 py-3 text-text-secondary">{{ x.puesto }}{{ x.offline ? ' · offline' : '' }}</td>
                  <td class="px-3 py-3">@if (x.offline && x.resultado === 'valida') { <gr-badge tone="info">En cola</gr-badge> } @else { <gr-badge [tone]="res[x.resultado].tone">{{ res[x.resultado].label }}</gr-badge> }</td></tr>
              } @empty { <tr><td colspan="5" class="px-4 py-10 text-center text-text-tertiary">{{ tab() === 'incidencias' ? 'Sin incidencias en las últimas 24 h.' : 'Todavía no se ha escaneado nada.' }}</td></tr> }
            </tbody>
          </table>
        </section>
      } @else if (error()) {
        <div class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card p-10 text-center"><gr-icon name="wifi-off" [size]="24" class="text-text-tertiary" />
          <p class="text-body-s text-text-secondary">No se pudo cargar la taquilla.</p><button grButton (click)="cargar()">Reintentar</button></div>
      } @else { <gr-skeleton class="h-96 rounded-lg" /> }
    </div>
  `,
})
export class TaquillaPage {
  private readonly api = inject(EntradasApi);
  protected readonly comps = inject(Competitions);
  protected readonly res = RESULTADO;
  protected readonly hora = hora;
  protected readonly horaSeg = horaSeg;
  protected readonly data = signal<ResumenCheckin | null>(null);
  protected readonly error = signal(false);
  protected readonly tab = signal<TabTaquilla>('puerta');
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly dentro = computed(() => (this.data()?.sesiones ?? []).reduce((a, s) => a + s.dentro, 0));
  protected readonly reservadas = computed(() => (this.data()?.sesiones ?? []).filter((s) => s.publicada).reduce((a, s) => a + s.ocupadas, 0));
  protected readonly pct = computed(() => (this.reservadas() ? Math.round((this.dentro() * 100) / this.reservadas()) : 0));
  protected readonly sinRed = computed(() => (this.data()?.puestos ?? []).filter((p) => p.cola > 0 && !this.vivo(p.ultimoPing)));
  protected readonly tabs = computed(() => {
    const r = this.data();
    return [
      { key: 'puerta', label: 'Puerta', n: null as number | null },
      { key: 'pesaje', label: 'Atletas (pesaje)', n: this.atletas() },
      { key: 'escaneos', label: 'Escaneos', n: r ? (r.escaneos ?? r.ultimos.length) : null },
      { key: 'incidencias', label: 'Incidencias', n: r ? r.incidencias.length + this.sinRed().length : null },
    ];
  });
  protected readonly sub = computed(() => {
    const now = Date.now();
    const s = (this.data()?.sesiones ?? []).find((x) => x.publicada && new Date(x.fin).getTime() > now);
    if (!s) return 'Sin sesiones por delante';
    const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(s.inicio)).replace(/[.,]/g, '');
    const curso = new Date(s.inicio).getTime() <= now ? ' en curso' : '';
    const abiertas = new Date(s.puertas).getTime() <= now ? 'abiertas' : 'abren';
    return dia + ' · ' + s.nombre + curso + ' · puertas ' + abiertas + ' ' + hora(s.puertas);
  });
  protected readonly atletas = signal<number | null>(null);
  /** Chart window: «hh:mm – ahora» while a session has its doors open, otherwise a relative label. */
  protected readonly desde = computed(() => {
    const now = Date.now();
    const abierta = (this.data()?.sesiones ?? []).some((s) => new Date(s.puertas).getTime() <= now && new Date(s.fin).getTime() > now);
    return abierta ? hora(new Date(now - 29 * 60_000).toISOString()) + ' – ahora' : 'Últimos 30 min';
  });
  private t?: ReturnType<typeof setTimeout>;

  constructor() {
    const router = inject(Router);
    const atletasApi = inject(AtletasApi);
    if (isPlatformBrowser(inject(PLATFORM_ID)) && window.innerWidth < 768) void router.navigate(['/', this.comps.current()?.slug ?? '', 'checkin', 'escaner'], { replaceUrl: true });
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
    effect(() => {
      const cid = this.cid();
      if (cid) untracked(() => void atletasApi.lista(cid, { pestana: 'confirmados', por: 1 }).then((l) => this.atletas.set(l.pestanas.confirmados), () => undefined));
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('checkin.')) {
        clearTimeout(this.t);
        this.t = setTimeout(() => void this.cargar(), 800);
      }
    });
    const i = setInterval(() => void this.cargar(), 30_000);
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      clearInterval(i);
    });
  }
  protected async cargar(): Promise<void> {
    try {
      this.data.set(await this.api.resumenCheckin(this.cid()));
      this.error.set(false);
    } catch {
      this.error.set(true); // the last data stays on screen if there was any
    }
  }
  /** es-ES thousands always grouped («1.200»; toLocaleString leaves 4 digits ungrouped). */
  protected n(v: number): string {
    return String(Math.round(v ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  /** «13/11 03:03:12» for scans of another day, «03:03:12» for today. */
  protected cuando(iso: string): string {
    const d = (x: Date) => x.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
    return d(new Date(iso)) === d(new Date()) ? horaSeg(iso) : fechaCorta(iso).replace(',', '') + horaSeg(iso).slice(5);
  }
  /** Still to come per minute: reserved minus those inside, walking the last 30 minutes back. */
  protected sinPres(a: number[]): number[] {
    const total = this.reservadas() - this.dentro() + a.reduce((x, y) => x + y, 0);
    return this.acum(a).map((x) => total - x);
  }
  protected hitoPos(iso: string): number {
    return Math.min(100, Math.max(0, 100 - ((Date.now() - new Date(iso).getTime()) / 60_000 / 30) * 100));
  }
  protected max(a: number[]): number {
    return Math.max(0, ...a);
  }
  /** Time of the busiest minute of the last 30. */
  protected pico(a: number[]): string {
    return hora(new Date(Date.now() - (a.length - 1 - a.indexOf(this.max(a))) * 60_000).toISOString());
  }
  protected acum(a: number[]): number[] {
    let t = 0;
    return a.map((x) => (t += x));
  }
  protected vivo(iso?: string): boolean {
    return !!iso && Date.now() - new Date(iso).getTime() < 90_000;
  }
}

/** A queued offline scan: codes only (no names), kept until it can be sent even across logouts. */
interface Cola extends EscaneoIn { clave: string }
type LectorQR = (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
type Vista = 'puesto' | 'escaner' | 'buscar';

/**
 * Door scanner (Figma 59 · check-in móvil): station and session, camera with jsQR, result cards (valid, already
 * used, wrong session, invalid, checking, saved offline), camera denied, search by name, and an offline queue that
 * syncs when the network is back (idempotent keys; the server resolves duplicates).
 */
@Component({
  selector: 'bo-escaner',
  imports: [GrSelect, FormsModule, RouterLink, GrBadge, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-4 pb-24 pt-2">
      @switch (vista()) {
        @case ('puesto') {
          <h1 class="text-ui-h3">Elige tu puesto</h1>
          <p class="-mt-2 text-body-s text-text-secondary">Lo puedes cambiar luego desde el menú</p>
          <ul class="flex flex-col gap-3" role="radiogroup" aria-label="Puesto">
            @for (p of boot()?.puestos ?? []; track p.id) {
              <li><button type="button" role="radio" [attr.aria-checked]="puesto() === p.nombre" [disabled]="p.tipo === 'pesaje'" (click)="puesto.set(p.nombre)"
                class="flex min-h-[72px] w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none" [class]="puesto() === p.nombre ? 'border-accent! bg-accent-deep/25' : 'border-line-subtle bg-bg-card'">
                <span class="flex size-[18px] shrink-0 items-center justify-center rounded-full border-2" [class]="puesto() === p.nombre ? 'border-accent' : 'border-line-strong'">@if (puesto() === p.nombre) { <span class="size-2 rounded-full bg-accent"></span> }</span>
                <span><span class="block text-[15px] font-semibold leading-[1.3]">{{ p.nombre }}</span><span class="block text-body-s text-text-secondary">{{ p.tipo === 'pesaje' ? 'Solo staff de competición' : p.detalle }}</span></span>
              </button></li>
            } @empty { @if (!boot()) { @for (i of [1, 2, 3]; track i) { <li class="h-[72px] animate-pulse rounded-lg bg-bg-card motion-reduce:animate-none"></li> } } @else { <li class="text-body-s text-text-tertiary">No hay puestos configurados.</li> } }
          </ul>
          <label class="text-label-s" for="es-s">Sesión</label>
          <gr-select id="es-s" class="-mt-2" [ngModel]="sesion()" (ngModelChange)="sesion.set($event)">
            @for (s of boot()?.sesiones ?? []; track s.id) { <option [value]="s.id">{{ s.nombre }}{{ s.id === boot()?.actual ? ' (ahora)' : '' }}</option> }
          </gr-select>
          <button grButton variant="primary" size="l" [disabled]="!puesto() || !sesion()" (click)="empezar()">Empezar a escanear</button>
        }

        @case ('escaner') {
          <button type="button" class="hidden items-center gap-1 self-start text-ui-h4 hover:text-text-secondary md:flex" (click)="cambiarPuesto()">{{ titulo.texto() }}<gr-icon name="chevron-down" [size]="16" /></button>
          @if (sinCamara() && !r() && !comprobando()) {
            <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
              <span class="flex size-14 items-center justify-center rounded-lg bg-accent-deep/40 text-accent-text"><gr-icon name="lock" [size]="22" /></span>
              <h2 class="text-ui-h4">Necesitamos la cámara</h2>
              <p class="text-[13px] leading-[1.5] text-text-secondary">Ajustes › Safari › Cámara › Permitir. Mientras tanto puedes buscar por nombre, email o código.</p>
              <button grButton variant="primary" class="mt-1" (click)="vista.set('buscar')">Buscar por nombre</button>
              <button type="button" class="text-body-s text-text-tertiary hover:text-text-secondary" (click)="sinCamara.set(false); volver()">Reintentar con la cámara</button>
            </section>
          } @else {
            @if (!online()) {
              <p class="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-body-s"><gr-icon name="triangle-alert" [size]="18" class="mt-0.5 text-warning" />
                <span><b class="block text-label-m text-warning">Sin conexión · modo local</b><span class="text-text-secondary">{{ cola().length }} escaneos en cola · se enviarán solos</span></span></p>
            }
            <div class="grid grid-cols-3 gap-2">
              <div class="rounded-md border border-line-subtle bg-bg-card px-3 py-2.5"><p class="text-mono-xs text-text-tertiary">DENTRO</p><p class="text-ui-h4">{{ dentroSesion() }}</p></div>
              <div class="rounded-md border border-line-subtle bg-bg-card px-3 py-2.5"><p class="text-mono-xs text-text-tertiary">RESERVAS</p><p class="text-ui-h4">{{ reservasSesion() }}</p></div>
              <div class="rounded-md border border-line-subtle bg-bg-card px-3 py-2.5"><p class="text-mono-xs text-text-tertiary">COLA</p><p class="text-ui-h4" [class.text-warning]="cola().length">{{ cola().length }}</p></div>
            </div>
            <div class="relative overflow-hidden rounded-xl border border-line-subtle bg-linear-to-b from-bg-card to-black" [class]="r() || comprobando() ? 'h-[260px]' : 'h-[420px]'">
              <video #video class="absolute inset-0 size-full object-cover opacity-60" playsinline muted></video>
              <div class="pointer-events-none absolute left-1/2 top-[45%] size-[164px] -translate-x-1/2 -translate-y-1/2" [class]="r() || comprobando() ? '' : 'scale-[1.3]'" aria-hidden="true">
                <span class="absolute left-0 top-0 size-10 border-l-4 border-t-4" [class]="marco()"></span><span class="absolute right-0 top-0 size-10 border-r-4 border-t-4" [class]="marco()"></span>
                <span class="absolute bottom-0 left-0 size-10 border-b-4 border-l-4" [class]="marco()"></span><span class="absolute bottom-0 right-0 size-10 border-b-4 border-r-4" [class]="marco()"></span>
                @if (!r() && !comprobando()) { <span class="absolute inset-x-2 top-1/2 h-0.5 bg-accent motion-safe:animate-pulse"></span> }
              </div>
              <p class="absolute inset-x-0 bottom-9 text-center text-label-m text-text-secondary">{{ r() || comprobando() ? 'Escaneado' : 'Apunta al QR de la entrada' }}</p>
            </div>
            @if (comprobando()) {
              <section class="flex flex-col items-center gap-2 rounded-xl border border-line-strong bg-bg-card p-5 text-center" aria-live="polite">
                <span class="flex size-16 items-center justify-center rounded-full bg-bg-raised"><gr-icon name="loader" [size]="26" class="text-text-secondary motion-safe:animate-spin" /></span>
                <p class="text-ui-h3 text-text-tertiary">Comprobando…</p><p class="font-mono text-label-l">{{ codComprobando() }}</p>
                <p class="text-body-s text-text-secondary">Consultando el servidor</p>
                <button grButton variant="ghost" class="w-full" (click)="cancelar()">Cancelar</button>
              </section>
            } @else if (r(); as x) {
              <section class="flex flex-col items-center gap-2 rounded-xl border p-5 text-center" [class]="tarjeta(x)" aria-live="assertive">
                <span class="flex size-16 items-center justify-center rounded-full bg-current/15"><gr-icon [name]="icono(x)" [size]="26" /></span>
                <p class="text-ui-h3">{{ tituloR(x) }}</p>
                <p class="text-label-l text-text-primary">{{ x.resultado === 'invalida' && !x.codigo ? 'Firma no reconocida' : x.codigo + (x.nombre ? ' · ' + x.nombre : '') }}</p>
                <p class="text-body-s text-text-secondary">{{ mensaje(x) }}</p>
                @if (x.resultado === 'valida' && !x.registrado && x.pendientes > 1) {
                  <div class="flex items-center justify-center gap-3 text-text-primary"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong hover:bg-bg-raised" aria-label="Menos" (click)="personas.set(max(1, personas() - 1))"><gr-icon name="minus" [size]="16" /></button>
                    <span class="w-8 text-ui-h4">{{ personas() }}</span><button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong hover:bg-bg-raised" aria-label="Más" (click)="personas.set(min(x.pendientes, personas() + 1))"><gr-icon name="plus" [size]="16" /></button></div>
                }
                @switch (x.registrado ? 'hecho' : x.resultado) {
                  @case ('valida') { <button grButton variant="primary" size="l" class="mt-1 w-full" [loading]="enviando()" (click)="confirmar(x)">Confirmar entrada ({{ personas() }})</button> }
                  @case ('manual') { <button grButton variant="primary" size="l" class="mt-1 w-full" [loading]="enviando()" (click)="confirmar(x)">Confirmar entrada ({{ personas() }})</button> }
                  @case ('otra_sesion') { <button grButton size="l" class="mt-1 w-full" [loading]="enviando()" (click)="confirmar(x, true)">Permitir igualmente</button> }
                  @case ('invalida') { <button grButton size="l" class="mt-1 w-full" (click)="vista.set('buscar')">Buscar por nombre</button> }
                  @case ('hecho') { <button grButton variant="primary" size="l" class="mt-1 w-full" (click)="siguiente()">Escanear siguiente</button> }
                  @default { <a grButton size="l" class="mt-1 w-full" [routerLink]="['../../entradas']" [queryParams]="{ q: x.codigo }">Ver detalle</a> }
                }
              </section>
            }
            <div class="flex gap-2"><button grButton size="l" class="flex-1" (click)="vista.set('buscar')">Buscar por nombre</button>
              <button grButton size="l" icon="download" aria-label="Descargar la lista para escanear sin conexión" [loading]="descargando()" (click)="descargar()"></button></div>
            <button type="button" class="self-center text-body-s text-text-tertiary hover:text-text-secondary md:hidden" (click)="cambiarPuesto()">Cambiar puesto o sesión</button>
          }
        }

        @case ('buscar') {
          <div class="relative">
            <gr-icon name="search" [size]="18" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input type="search" class="h-12 w-full rounded-lg border border-line-strong bg-bg-field pl-11 pr-11 text-body-m focus-visible:border-accent focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden" placeholder="Nombre, email, teléfono o código" [ngModel]="q()" (ngModelChange)="buscar($event)" aria-label="Buscar entrada" />
            @if (q()) { <button type="button" class="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary hover:text-text-primary" aria-label="Borrar" (click)="buscar('')"><gr-icon name="x" [size]="18" /></button> }
          </div>
          <ul class="flex flex-col gap-3">
            @for (e of encontrados(); track e.codigo) {
              <li class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4">
                <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><p class="truncate text-label-l">{{ e.nombre }} {{ e.apellidos }}</p>
                  <p class="text-body-s text-text-secondary">{{ corta(e.sesion) }} · @if (e.estado === 'anulada') { anulada } @else { {{ e.personas }} persona{{ e.personas === 1 ? '' : 's' }} · <span class="whitespace-nowrap font-mono">{{ e.codigo }}</span> }</p></div>
                  @if (e.estado === 'anulada') { <gr-badge tone="neutral">Anulada</gr-badge> } @else if (e.dentro > 0) { <gr-badge tone="success">Dentro {{ e.dentro }} de {{ e.personas }}</gr-badge> } @else if (e.sesionId !== sesion()) { <gr-badge tone="warning">Otra sesión</gr-badge> } @else { <gr-badge tone="info">Reservada</gr-badge> }</div>
                @if (e.estado !== 'anulada' && e.dentro < e.personas) { <button grButton size="l" [variant]="e.sesionId === sesion() ? 'primary' : 'secondary'" class="w-full" (click)="porCodigo(e)">{{ e.sesionId === sesion() ? 'Entrar (' + (e.personas - e.dentro) + ')' : 'Ver' }}</button> }
              </li>
            } @empty { @if (q().length > 1) { <li class="rounded-lg border border-line-subtle bg-bg-card p-6 text-center text-body-s text-text-tertiary">Nadie con «{{ q() }}».</li> } }
          </ul>
          <button grButton variant="ghost" icon="chevron-left" class="self-start" (click)="volver()">Volver al escáner</button>
        }
      }
    </div>
  `,
})
export class EscanerPage {
  private readonly api = inject(EntradasApi);
  private readonly toasts = inject(GrToasts);
  protected readonly comps = inject(Competitions);
  protected readonly titulo = inject(TituloMovil);
  protected readonly corta = corta;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  protected readonly max = Math.max;
  protected readonly min = Math.min;
  protected readonly vista = signal<Vista>('puesto');
  protected readonly boot = signal<Bootstrap | null>(null);
  protected readonly puesto = signal('');
  protected readonly sesion = signal('');
  protected readonly online = signal(true);
  protected readonly r = signal<Resultado | null>(null);
  protected readonly personas = signal(1);
  protected readonly comprobando = signal(false);
  protected readonly codComprobando = signal('');
  protected readonly descargando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly sinCamara = signal(false);
  protected readonly cola = signal<Cola[]>([]);
  protected readonly q = signal('');
  protected readonly encontrados = signal<Entrada[]>([]);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly sesionNombre = computed(() => this.boot()?.sesiones.find((s) => s.id === this.sesion())?.nombre ?? '');
  protected readonly dentroSesion = computed(() => (this.boot()?.lista ?? []).filter((x) => x.s === this.sesion()).reduce((a, x) => a + x.d, 0));
  protected readonly reservasSesion = computed(() => (this.boot()?.lista ?? []).filter((x) => x.s === this.sesion()).reduce((a, x) => a + x.p, 0));
  protected readonly marco = computed(() => {
    const x = this.r();
    if (!x) return 'border-white';
    if (x.registrado && !this.online()) return 'border-info';
    return x.resultado === 'valida' || x.resultado === 'manual' ? 'border-success' : x.resultado === 'invalida' || x.resultado === 'anulada' ? 'border-accent-text' : 'border-warning';
  });
  private stream: MediaStream | null = null;
  private raf = 0;
  private ultimo = { v: '', at: 0 };
  /** QR of the result on screen (sent again when confirming, so the scan is recorded as a QR read, not a manual entry). */
  private qrActual = '';
  private jsQR: LectorQR | null = null;
  private t?: ReturnType<typeof setTimeout>;
  /** Bumped on «Cancelar»: a slow answer that arrives after it is ignored (a retry reuses the server's idempotency). */
  private intento = 0;

  constructor() {
    if (!this.browser) return;
    effect(() => {
      const v = this.vista();
      this.titulo.texto.set(v === 'buscar' ? 'Buscar entrada' : v === 'escaner' && this.puesto() ? this.puesto() + ' · ' + corta(this.sesionNombre()) : 'Check-in');
    });
    this.online.set(navigator.onLine);
    const on = () => {
      this.online.set(true);
      void this.sincronizar();
    };
    const off = () => this.online.set(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
    const sync = setInterval(() => {
      void this.sincronizar();
      if (this.puesto()) void this.api.ping(this.cid(), this.puesto(), this.cola().length).catch(() => undefined);
    }, 15_000);
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo === 'checkin.escaneo' && this.online()) {
        clearTimeout(this.t);
        this.t = setTimeout(() => void this.cargar(true), 3000);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(sync);
      sub.unsubscribe();
      this.parar();
      this.titulo.texto.set('');
    });
  }

  private clave(k: string): string {
    return `gr-checkin-${k}-${this.cid()}`;
  }
  private async cargar(silencioso = false): Promise<void> {
    this.cola.set(JSON.parse(localStorage.getItem(this.clave('cola')) ?? '[]') as Cola[]);
    const prefs = JSON.parse(localStorage.getItem(this.clave('puesto')) ?? '{}') as { puesto?: string; sesion?: string };
    try {
      const b = await this.api.bootstrap(this.cid());
      localStorage.setItem(this.clave('lista'), JSON.stringify(b));
      this.boot.set(b);
    } catch {
      // Offline reload: the last list downloaded on this device, if it is recent (it holds names).
      const raw = localStorage.getItem(this.clave('lista'));
      const b = raw ? (JSON.parse(raw) as Bootstrap) : null;
      if (b && Date.now() - new Date(b.generado).getTime() < 48 * 3600_000) this.boot.set(b);
      else localStorage.removeItem(this.clave('lista'));
      this.online.set(false);
    }
    if (silencioso) return;
    if (!this.puesto() && !prefs.puesto) this.puesto.set(this.boot()?.puestos.find((p) => p.tipo !== 'pesaje')?.nombre ?? '');
    if (!this.sesion()) this.sesion.set(prefs.sesion ?? this.boot()?.actual ?? this.boot()?.sesiones[0]?.id ?? '');
    if (prefs.puesto && !this.puesto()) {
      this.puesto.set(prefs.puesto);
      this.empezar();
    }
  }
  protected empezar(): void {
    localStorage.setItem(this.clave('puesto'), JSON.stringify({ puesto: this.puesto(), sesion: this.sesion() }));
    this.volver();
  }
  /** Back to the scanner view: its <video> is re-created by the @switch, so the camera is restarted on it. */
  protected volver(): void {
    this.parar();
    this.vista.set('escaner');
    setTimeout(() => void this.arrancar(), 0);
  }
  protected async arrancar(): Promise<void> {
    this.sinCamara.set(false);
    try {
      this.jsQR ??= ((await import('jsqr')) as unknown as { default: LectorQR }).default;
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const v = this.video()?.nativeElement;
      if (!v) return;
      v.srcObject = this.stream;
      await v.play();
      this.leer();
    } catch {
      this.sinCamara.set(true);
    }
  }
  private parar(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
  private leer(): void {
    const v = this.video()?.nativeElement;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (v && ctx && v.readyState === v.HAVE_ENOUGH_DATA && this.vista() === 'escaner' && !this.comprobando() && this.jsQR) {
        const w = 480;
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const code = this.jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
        // The same QR in front of the camera is read once every 3 s.
        if (code?.data && !(code.data === this.ultimo.v && Date.now() - this.ultimo.at < 3000)) {
          this.ultimo = { v: code.data, at: Date.now() };
          void this.comprobar({ qr: code.data });
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  protected async comprobar(b: { qr?: string; codigo?: string }): Promise<void> {
    this.qrActual = b.qr ?? '';
    const n = ++this.intento;
    this.codComprobando.set(b.codigo ?? (b.qr?.startsWith('E:') ? b.qr.split(':')[1] : ''));
    this.comprobando.set(true);
    this.r.set(null);
    try {
      if (!this.online()) throw new Error('offline');
      const x = await this.api.escanear(this.cid(), { ...b, puesto: this.puesto(), sesionId: this.sesion() });
      if (n !== this.intento) return;
      this.personas.set(Math.max(1, x.pendientes));
      this.r.set(x);
      navigator.vibrate?.(x.resultado === 'valida' ? 60 : [80, 60, 80]);
    } catch (e) {
      if (n !== this.intento) return;
      if (e instanceof Error && e.message !== 'offline' && navigator.onLine) {
        this.toasts.error('No se pudo comprobar', errText(e));
      } else {
        this.online.set(false);
        this.r.set(this.local(b));
      }
    } finally {
      if (n === this.intento) this.comprobando.set(false);
    }
  }
  protected cancelar(): void {
    this.intento++;
    this.comprobando.set(false);
    this.ultimo = { v: '', at: 0 };
  }
  protected cambiarPuesto(): void {
    this.r.set(null);
    this.vista.set('puesto');
  }
  /** Downloads the compact list again so the door can keep scanning without network. */
  protected async descargar(): Promise<void> {
    this.descargando.set(true);
    await this.cargar(true);
    this.descargando.set(false);
    if (this.online()) this.toasts.success('Lista descargada', (this.boot()?.lista.length ?? 0) + ' entradas para escanear sin conexión.');
  }
  /** Offline answer from the downloaded list (the server re-checks the signature when the queue is sent). */
  private local(b: { qr?: string; codigo?: string }): Resultado {
    const cod = b.codigo ?? (b.qr?.startsWith('E:') ? b.qr.split(':')[1] : '');
    const x = (this.boot()?.lista ?? []).find((e: Compacta) => e.c === cod);
    const base = { codigo: cod, nombre: x?.n ?? '', personas: x?.p ?? 0, dentro: x?.d ?? 0, pendientes: x ? x.p - x.d : 0, sesion: '', registrado: false } as Resultado;
    if (!x) return { ...base, resultado: 'invalida', mensaje: 'No está en la lista descargada.' };
    if (x.d >= x.p) return { ...base, resultado: 'ya_usada', mensaje: 'Ya ha entrado todo el grupo (según este dispositivo).' };
    if (x.s !== this.sesion()) return { ...base, resultado: 'otra_sesion', mensaje: 'Su entrada es para otra sesión.' };
    this.personas.set(Math.max(1, x.p - x.d));
    return { ...base, resultado: 'valida', mensaje: `${x.p - x.d} persona${x.p - x.d === 1 ? '' : 's'} · sin conexión` };
  }
  protected async confirmar(x: Resultado, forzar = false): Promise<void> {
    const clave = crypto.randomUUID();
    const b: EscaneoIn = { ...(this.qrActual ? { qr: this.qrActual } : { codigo: x.codigo }), puesto: this.puesto(), sesionId: this.sesion(), confirmar: true, personas: this.personas(), forzar, clave, escaneadoAt: new Date().toISOString() };
    this.enviando.set(true);
    try {
      if (!this.online()) throw new Error('offline');
      const r = await this.api.escanear(this.cid(), b);
      this.r.set(r);
      this.actualizarLocal(x.codigo, r.dentro);
    } catch {
      // No network: queue it (kept on this device until it can be sent).
      const c = [...this.cola(), { ...b, clave }];
      this.cola.set(c);
      localStorage.setItem(this.clave('cola'), JSON.stringify(c));
      this.actualizarLocal(x.codigo, x.dentro + this.personas());
      this.r.set({ ...x, registrado: true, mensaje: `Guardado sin conexión · se validará al volver la red · ${c.length} en cola` });
    } finally {
      this.enviando.set(false);
    }
  }
  private actualizarLocal(cod: string, dentro: number): void {
    const b = this.boot();
    if (!b) return;
    this.boot.set({ ...b, lista: b.lista.map((e) => (e.c === cod ? { ...e, d: dentro } : e)) });
  }
  protected siguiente(): void {
    this.r.set(null);
  }
  private async sincronizar(): Promise<void> {
    const c = this.cola();
    if (!c.length || !navigator.onLine) return;
    try {
      const r = await this.api.lote(this.cid(), c);
      this.cola.set([]);
      localStorage.setItem(this.clave('cola'), '[]');
      this.online.set(true);
      const problemas = r.resultados.filter((x) => !x.registrado).length;
      this.toasts.success(`${c.length} escaneos enviados`, problemas ? `${problemas} con incidencias: revísalos en Taquilla.` : 'Todo validado.');
      void this.cargar(true);
    } catch {
      /* still offline */
    }
  }
  protected buscar(v: string): void {
    this.q.set(v);
    clearTimeout(this.t);
    if (v.trim().length < 2) return this.encontrados.set([]);
    this.t = setTimeout(async () => {
      try {
        this.encontrados.set(await this.api.buscar(this.cid(), v.trim()));
      } catch {
        // Offline: search the downloaded list.
        const n = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        this.encontrados.set((this.boot()?.lista ?? []).filter((e) => e.n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(n) || e.c.includes(v.toUpperCase())).slice(0, 20)
          .map((e) => ({ id: e.c, codigo: e.c, nombre: e.n, apellidos: '', email: '', telefono: '', sesionId: e.s, sesion: this.boot()?.sesiones.find((s) => s.id === e.s)?.nombre ?? '', personas: e.p, dentro: e.d,
            estado: e.e as Entrada['estado'], origen: '', manual: false, nota: '', novedades: false, consentimientos: {}, createdAt: '' })));
      }
    }, 250);
  }
  protected porCodigo(e: Entrada): void {
    this.volver();
    void this.comprobar({ codigo: e.codigo });
  }
  protected tarjeta(x: Resultado): string {
    if (x.registrado && !this.online()) return 'border-info/50 bg-info/10 text-info';
    return x.resultado === 'valida' || x.resultado === 'manual' ? 'border-success/50 bg-success/10 text-success' : x.resultado === 'invalida' || x.resultado === 'anulada' ? 'border-accent-text/50 bg-accent-deep/25 text-accent-text' : 'border-warning/50 bg-warning/10 text-warning';
  }
  protected icono(x: Resultado): GrIconName {
    if (x.registrado && !this.online()) return 'wifi-off';
    return ({ valida: 'circle-check', manual: 'circle-check', ya_usada: 'triangle-alert', otra_sesion: 'clock', invalida: 'circle-x', anulada: 'circle-x' } as const)[x.resultado];
  }
  protected mensaje(x: Resultado): string {
    if (x.registrado && !this.online()) return 'Se validará al volver la red · ' + this.cola().length + ' en cola';
    if (x.resultado === 'valida' && !x.registrado) return x.pendientes + (x.pendientes === 1 ? ' persona · ' : ' personas · ') + (x.sesion || this.sesionNombre());
    if (x.resultado === 'ya_usada' && x.primera) return 'Entró a las ' + hora(x.primera) + (x.puestoAnterior ? ' · ' + x.puestoAnterior : '');
    return x.mensaje;
  }
  protected tituloR(x: Resultado): string {
    if (x.registrado && !this.online()) return 'Guardado sin conexión';
    if (x.registrado) return '¡Dentro!';
    return { valida: 'Entrada válida', manual: 'Entrada válida', ya_usada: 'Ya usada', otra_sesion: 'Sesión equivocada', invalida: 'QR no válido', anulada: 'Entrada anulada' }[x.resultado];
  }
}
