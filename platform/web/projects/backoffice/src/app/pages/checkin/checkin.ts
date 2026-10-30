import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrBadge, GrButton, GrIcon, GrKpi, GrSkeleton, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, errText } from '../../shared/ui';
import { EntradasApi, RESULTADO, horaSeg, hora, type Bootstrap, type Compacta, type Entrada, type EscaneoIn, type Resultado, type ResumenCheckin } from '../entradas/api';

/** «Check-in y taquilla» (Figma 59 · «Taquilla · resumen»): people inside, pace, incidents and the latest scans. */
@Component({
  selector: 'bo-taquilla',
  imports: [RouterLink, BoPageHeader, GrBadge, GrButton, GrIcon, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = data();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Check-in y taquilla" [subtitle]="sub()" [crumbs]="[comps.current()?.nombreCorto || '', 'Hoy', 'Check-in y taquilla']">
        <a actions grButton variant="primary" icon="scan" routerLink="escaner">Abrir escáner</a>
      </bo-page-header>
      @if (r) {
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <gr-kpi label="Personas dentro" [value]="n(dentro())" [delta]="pct() + ' %'" [caption]="'de ' + n(reservadas())" [trend]="acum(r.ritmo)" />
          <gr-kpi label="Escaneos / min" [value]="n(r.ritmo[r.ritmo.length - 1] ?? 0)" [caption]="'pico ' + max(r.ritmo) + ' · últimos 30 min'" />
          <gr-kpi label="Sin presentarse" [value]="n(reservadas() - dentro())" caption="reservas sin escanear" />
          <gr-kpi label="Incidencias" [value]="n(r.incidencias.length)" caption="duplicados, otra sesión y QR inválidos (24 h)" />
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
            <h2 class="flex items-center justify-between text-ui-h5">Entradas por minuto<span class="text-mono-xs text-text-tertiary">últimos 30 min</span></h2>
            <div class="mt-4 flex h-44 items-end gap-1">
              @for (v of r.ritmo; track $index) { <div class="flex-1 rounded-t-2xs" [class]="v === max(r.ritmo) && v ? 'bg-accent' : 'bg-accent-deep'" [style.height.%]="max(r.ritmo) ? 4 + v * 96 / max(r.ritmo) : 4" [title]="v + ' personas'"></div> }
            </div>
            <ul class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              @for (s of r.sesiones; track s.id) {
                @if (s.publicada) {
                  <li class="rounded-md bg-bg-raised p-3"><p class="flex justify-between text-label-s"><span>{{ s.nombre }}</span><span class="font-mono">{{ n(s.dentro) }} / {{ n(s.ocupadas) }}</span></p>
                    <div class="mt-2 h-1.5 rounded-pill bg-bg-base"><div class="h-full rounded-pill bg-success" [style.width.%]="s.ocupadas ? s.dentro * 100 / s.ocupadas : 0"></div></div></li>
                }
              }
            </ul>
          </section>
          <aside class="flex flex-col gap-3">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
              <h2 class="text-ui-h5">Incidencias</h2>
              <ul class="mt-3 flex flex-col gap-2">
                @for (p of sinRed(); track p.id) {
                  <li class="rounded-md border border-accent/50 bg-accent-deep/20 p-3 text-body-s"><p class="flex items-center gap-2 text-label-s text-accent-text"><gr-icon name="wifi-off" [size]="14" />{{ p.nombre }} sin conexión</p>
                    <p class="text-text-secondary">{{ p.cola }} en cola · último latido {{ hora(p.ultimoPing) }}</p></li>
                }
                @for (x of r.incidencias.slice(0, 5); track x.id) {
                  <li class="rounded-md border border-warning/40 bg-warning/10 p-3 text-body-s"><p class="text-label-s text-warning">{{ x.codigo || 'QR no reconocido' }} · {{ res[x.resultado].label }}</p>
                    <p class="text-text-secondary">{{ x.nombre || '—' }} · {{ x.puesto }} · {{ hora(x.at) }}</p></li>
                } @empty { @if (!sinRed().length) { <li class="flex items-center gap-2 text-body-s text-success"><gr-icon name="circle-check" [size]="16" />Sin incidencias</li> } }
              </ul>
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
              <h2 class="text-ui-h5">Puestos</h2>
              <ul class="mt-2 flex flex-col">
                @for (p of r.puestos; track p.id) {
                  <li class="flex items-center gap-2 border-b border-line-subtle py-2 text-body-s last:border-0"><span class="size-2 rounded-full" [class]="vivo(p.ultimoPing) ? 'bg-success' : 'bg-line-strong'"></span>
                    <span class="flex-1">{{ p.nombre }}<span class="block text-body-xs text-text-tertiary">{{ p.detalle }}</span></span><span class="text-mono-xs text-text-tertiary">{{ p.escaneos15 }} / 15 min</span></li>
                }
              </ul>
            </section>
          </aside>
        </div>
        <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
          <table class="w-full min-w-[640px] text-left text-body-s">
            <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Hora</th><th class="px-3 py-3">Código</th><th class="px-3 py-3">Titular</th><th class="px-3 py-3">Puesto</th><th class="px-3 py-3">Resultado</th></tr></thead>
            <tbody>
              @for (x of r.ultimos; track x.id) {
                <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-2.5 font-mono text-mono-xs">{{ horaSeg(x.at) }}</td><td class="px-3 py-2.5 font-mono text-mono-xs">{{ x.codigo || '—' }}</td>
                  <td class="px-3 py-2.5">{{ x.nombre || 'QR no reconocido' }}{{ x.personas ? ' (' + x.personas + ')' : '' }}</td><td class="px-3 py-2.5 text-text-secondary">{{ x.puesto }}{{ x.offline ? ' · sin conexión' : '' }}</td>
                  <td class="px-3 py-2.5"><gr-badge [tone]="res[x.resultado].tone">{{ res[x.resultado].label }}</gr-badge></td></tr>
              } @empty { <tr><td colspan="5" class="px-4 py-10 text-center text-text-tertiary">Todavía no se ha escaneado nada.</td></tr> }
            </tbody>
          </table>
        </section>
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
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly dentro = computed(() => (this.data()?.sesiones ?? []).reduce((a, s) => a + s.dentro, 0));
  protected readonly reservadas = computed(() => (this.data()?.sesiones ?? []).filter((s) => s.publicada).reduce((a, s) => a + s.ocupadas, 0));
  protected readonly pct = computed(() => (this.reservadas() ? Math.round((this.dentro() * 100) / this.reservadas()) : 0));
  protected readonly sinRed = computed(() => (this.data()?.puestos ?? []).filter((p) => p.cola > 0 && !this.vivo(p.ultimoPing)));
  protected readonly sub = computed(() => {
    const s = (this.data()?.sesiones ?? []).find((x) => x.publicada && new Date(x.fin).getTime() > Date.now());
    return s ? `${s.nombre} · puertas ${hora(s.puertas)}` : 'Sin sesiones por delante';
  });
  private t?: ReturnType<typeof setTimeout>;

  constructor() {
    const router = inject(Router);
    if (isPlatformBrowser(inject(PLATFORM_ID)) && window.innerWidth < 768) void router.navigate(['/', this.comps.current()?.slug ?? '', 'checkin', 'escaner'], { replaceUrl: true });
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
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
  private async cargar(): Promise<void> {
    try {
      this.data.set(await this.api.resumenCheckin(this.cid()));
    } catch {
      /* keep the last data */
    }
  }
  protected n(v: number): string {
    return (v ?? 0).toLocaleString('es-ES');
  }
  protected max(a: number[]): number {
    return Math.max(0, ...a);
  }
  protected acum(a: number[]): number[] {
    let t = 0;
    return a.map((x) => (t += x));
  }
  protected vivo(iso?: string): boolean {
    return !!iso && Date.now() - new Date(iso).getTime() < 90_000;
  }
}

interface Cola extends EscaneoIn { clave: string; nombre: string }
type LectorQR = (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
type Vista = 'puesto' | 'escaner' | 'buscar';

/**
 * Door scanner (Figma 59 · check-in móvil): station and session, camera with jsQR, result cards (valid, already
 * used, wrong session, invalid, saved offline), search by name, and an offline queue that syncs when the network is
 * back (idempotent keys; the server resolves duplicates).
 */
@Component({
  selector: 'bo-escaner',
  imports: [FormsModule, RouterLink, GrBadge, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-3 pb-24">
      @switch (vista()) {
        @case ('puesto') {
          <h1 class="text-ui-h3">Elige tu puesto</h1>
          <p class="-mt-2 text-body-s text-text-tertiary">Lo puedes cambiar luego desde el menú.</p>
          <ul class="flex flex-col gap-2" role="radiogroup" aria-label="Puesto">
            @for (p of boot()?.puestos ?? []; track p.id) {
              <li><button type="button" role="radio" [attr.aria-checked]="puesto() === p.nombre" [disabled]="p.tipo === 'pesaje'" (click)="puesto.set(p.nombre)"
                class="flex w-full items-center gap-3 rounded-lg border p-4 text-left disabled:opacity-40" [class]="puesto() === p.nombre ? 'border-accent bg-accent-deep/25' : 'border-line-subtle bg-bg-card'">
                <span class="flex size-5 items-center justify-center rounded-full border-2" [class]="puesto() === p.nombre ? 'border-accent' : 'border-line-strong'">@if (puesto() === p.nombre) { <span class="size-2.5 rounded-full bg-accent"></span> }</span>
                <span><span class="block text-label-m">{{ p.nombre }}</span><span class="block text-body-xs text-text-tertiary">{{ p.tipo === 'pesaje' ? 'Pesaje de atletas: desde Atletas' : p.detalle }}</span></span>
              </button></li>
            }
          </ul>
          <label class="text-label-s" for="es-s">Sesión</label>
          <select id="es-s" class="h-12 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" [ngModel]="sesion()" (ngModelChange)="sesion.set($event)">
            @for (s of boot()?.sesiones ?? []; track s.id) { <option [value]="s.id">{{ s.nombre }}{{ s.id === boot()?.actual ? ' (ahora)' : '' }}</option> }
          </select>
          <button grButton variant="primary" size="l" [disabled]="!puesto() || !sesion()" (click)="empezar()">Empezar a escanear</button>
          @if (!boot()) { <p class="text-body-s text-text-tertiary">Cargando puestos y entradas…</p> }
        }

        @case ('escaner') {
          <header class="flex items-center gap-2">
            <button type="button" class="flex min-w-0 flex-1 items-center gap-1 text-left text-label-m" (click)="vista.set('puesto')"><span class="truncate">{{ puesto() }} · {{ sesionNombre() }}</span><gr-icon name="chevron-down" [size]="16" /></button>
            <span class="flex size-9 items-center justify-center rounded-pill" [class]="online() ? 'bg-success/15 text-success' : 'bg-info/15 text-info'" [attr.aria-label]="online() ? 'Con conexión' : 'Sin conexión'"><gr-icon [name]="online() ? 'radio' : 'wifi-off'" [size]="16" /></span>
          </header>
          @if (!online()) {
            <p class="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-body-s text-warning"><gr-icon name="triangle-alert" [size]="16" class="mt-0.5" /><span><b>Sin conexión · modo local.</b> {{ cola().length }} escaneos en cola · se enviarán solos.</span></p>
          }
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-md bg-bg-card p-2.5"><p class="text-mono-xs text-text-tertiary">DENTRO</p><p class="text-ui-h4">{{ dentroSesion() }}</p></div>
            <div class="rounded-md bg-bg-card p-2.5"><p class="text-mono-xs text-text-tertiary">RESERVAS</p><p class="text-ui-h4">{{ reservasSesion() }}</p></div>
            <div class="rounded-md bg-bg-card p-2.5"><p class="text-mono-xs text-text-tertiary">COLA</p><p class="text-ui-h4" [class.text-warning]="cola().length">{{ cola().length }}</p></div>
          </div>
          <div class="relative aspect-square overflow-hidden rounded-xl bg-black">
            <video #video class="size-full object-cover" playsinline muted [class.hidden]="sinCamara()"></video>
            @if (!sinCamara()) { <div class="pointer-events-none absolute inset-[18%] rounded-lg border-4 transition-colors" [class]="marco()"></div> }
            @if (sinCamara()) {
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <gr-icon name="camera" [size]="32" class="text-text-tertiary" /><p class="text-label-m">No podemos usar la cámara</p>
                <p class="text-body-s text-text-tertiary">Da permiso a la cámara en el navegador o busca por nombre o código.</p>
                <button grButton (click)="arrancar()">Reintentar</button>
              </div>
            }
            @if (comprobando()) { <p class="absolute inset-x-0 bottom-3 text-center text-label-s text-white">Comprobando…</p> }
          </div>
          @if (r(); as x) {
            <section class="rounded-xl border-2 p-4 text-center" [class]="tarjeta(x)" aria-live="assertive">
              <p class="text-ui-h4">{{ titulo(x) }}</p>
              <p class="mt-1 font-mono text-label-s">{{ x.codigo }}{{ x.nombre ? ' · ' + x.nombre : '' }}</p>
              <p class="mt-1 text-body-s opacity-90">{{ x.mensaje }}</p>
              @switch (x.resultado) {
                @case ('valida') {
                  @if (!x.registrado) {
                    @if (x.pendientes > 1) {
                      <div class="mt-3 flex items-center justify-center gap-3"><button type="button" class="flex size-11 items-center justify-center rounded-full border border-current" aria-label="Menos" (click)="personas.set(max(1, personas() - 1))">−</button>
                        <span class="text-ui-h4">{{ personas() }}</span><button type="button" class="flex size-11 items-center justify-center rounded-full border border-current" aria-label="Más" (click)="personas.set(min(x.pendientes, personas() + 1))">+</button></div>
                    }
                    <button grButton variant="primary" size="l" class="mt-3 w-full" [loading]="enviando()" (click)="confirmar(x)">Confirmar entrada ({{ personas() }})</button>
                  } @else { <button grButton size="l" class="mt-3 w-full" (click)="siguiente()">Escanear siguiente</button> }
                }
                @case ('otra_sesion') { <button grButton size="l" class="mt-3 w-full" (click)="confirmar(x, true)">Permitir igualmente</button> }
                @case ('invalida') { <button grButton size="l" class="mt-3 w-full" (click)="vista.set('buscar')">Buscar por nombre</button> }
                @default { <button grButton size="l" class="mt-3 w-full" (click)="siguiente()">Escanear siguiente</button> }
              }
            </section>
          } @else {
            <p class="text-center text-body-s text-text-tertiary">Apunta al QR de la entrada</p>
          }
          <div class="flex gap-2"><button grButton class="flex-1" icon="search" (click)="vista.set('buscar')">Buscar por nombre</button><a grButton routerLink=".." aria-label="Resumen de taquilla" icon="activity"></a></div>
        }

        @case ('buscar') {
          <header class="flex items-center gap-2"><button grButton variant="ghost" icon="chevron-left" (click)="vista.set('escaner')" aria-label="Volver al escáner"></button><h1 class="text-ui-h4">Buscar entrada</h1></header>
          <input type="search" class="h-12 rounded-md border border-line-strong bg-bg-field px-3 text-body-m" placeholder="Nombre, email, teléfono o código" [ngModel]="q()" (ngModelChange)="buscar($event)" aria-label="Buscar entrada" />
          <ul class="flex flex-col gap-2">
            @for (e of encontrados(); track e.codigo) {
              <li class="rounded-lg border border-line-subtle bg-bg-card p-3">
                <p class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate text-label-m">{{ e.nombre }} {{ e.apellidos }}</span>
                  @if (e.sesionId !== sesion()) { <gr-badge tone="warning">Otra sesión</gr-badge> } @else if (e.dentro >= e.personas) { <gr-badge tone="success">Dentro</gr-badge> } @else { <gr-badge tone="info">Reservada</gr-badge> }</p>
                <p class="text-body-xs text-text-tertiary">{{ e.sesion }} · {{ e.personas }} personas · {{ e.codigo }}</p>
                @if (e.dentro < e.personas) { <button grButton [variant]="e.sesionId === sesion() ? 'primary' : 'secondary'" class="mt-2 w-full" (click)="porCodigo(e)">{{ e.sesionId === sesion() ? 'Entrar (' + (e.personas - e.dentro) + ')' : 'Ver' }}</button> }
              </li>
            } @empty { @if (q().length > 1) { <li class="text-body-s text-text-tertiary">Nadie con «{{ q() }}».</li> } }
          </ul>
        }
      }
    </div>
  `,
})
export class EscanerPage {
  private readonly api = inject(EntradasApi);
  private readonly toasts = inject(GrToasts);
  protected readonly comps = inject(Competitions);
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
    if (!x) return 'border-white/70';
    return x.resultado === 'valida' || x.resultado === 'manual' ? 'border-success' : x.resultado === 'invalida' || x.resultado === 'anulada' ? 'border-accent' : 'border-warning';
  });
  private stream: MediaStream | null = null;
  private raf = 0;
  private ultimo = { v: '', at: 0 };
  /** QR of the result on screen (sent again when confirming, so the scan is recorded as a QR read, not a manual entry). */
  private qrActual = '';
  private jsQR: LectorQR | null = null;
  private t?: ReturnType<typeof setTimeout>;

  constructor() {
    if (!this.browser) return;
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
      // Offline reload: the last list downloaded on this device.
      const b = localStorage.getItem(this.clave('lista'));
      if (b) this.boot.set(JSON.parse(b) as Bootstrap);
      this.online.set(false);
    }
    if (silencioso) return;
    if (!this.sesion()) this.sesion.set(prefs.sesion ?? this.boot()?.actual ?? this.boot()?.sesiones[0]?.id ?? '');
    if (prefs.puesto && !this.puesto()) {
      this.puesto.set(prefs.puesto);
      this.empezar();
    }
  }
  protected empezar(): void {
    localStorage.setItem(this.clave('puesto'), JSON.stringify({ puesto: this.puesto(), sesion: this.sesion() }));
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
    this.comprobando.set(true);
    this.r.set(null);
    try {
      if (!this.online()) throw new Error('offline');
      const x = await this.api.escanear(this.cid(), { ...b, puesto: this.puesto(), sesionId: this.sesion() });
      this.personas.set(Math.max(1, x.pendientes));
      this.r.set(x);
      navigator.vibrate?.(x.resultado === 'valida' ? 60 : [80, 60, 80]);
    } catch (e) {
      if (e instanceof Error && e.message !== 'offline' && navigator.onLine) {
        this.toasts.error('No se pudo comprobar', errText(e));
      } else {
        this.online.set(false);
        this.r.set(this.local(b));
      }
    } finally {
      this.comprobando.set(false);
    }
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
    return { ...base, resultado: 'valida', mensaje: `${x.p - x.d} persona(s) · sin conexión` };
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
      const c = [...this.cola(), { ...b, clave, nombre: x.nombre }];
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
      const r = await this.api.lote(this.cid(), c.map(({ nombre: _n, ...b }) => b));
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
    this.vista.set('escaner');
    void this.comprobar({ codigo: e.codigo });
  }
  protected tarjeta(x: Resultado): string {
    if (x.registrado && !this.online()) return 'border-info/60 bg-info/10 text-info';
    return x.resultado === 'valida' || x.resultado === 'manual' ? 'border-success/60 bg-success/10 text-success' : x.resultado === 'invalida' || x.resultado === 'anulada' ? 'border-accent/60 bg-accent-deep/25 text-accent-text' : 'border-warning/60 bg-warning/10 text-warning';
  }
  protected titulo(x: Resultado): string {
    if (x.registrado && !this.online()) return 'Guardado sin conexión';
    if (x.registrado) return '¡Dentro!';
    return { valida: 'Entrada válida', manual: 'Entrada válida', ya_usada: 'Ya usada', otra_sesion: 'Sesión equivocada', invalida: 'QR no válido', anulada: 'Entrada anulada' }[x.resultado];
  }
}
