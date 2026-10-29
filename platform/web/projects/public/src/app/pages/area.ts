import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { cat, hora, kg } from '../core/atletas';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';

interface Marcas {
  sq?: number;
  bp?: number;
  dl?: number;
}
interface Panel {
  competicion: { slug: string; nombre: string };
  atleta: {
    id: string; nombre: string; apellidos: string; nombreCompleto: string; sexo: 'F' | 'M'; categoria: string; divisionNombre: string; club: string; ciudad: string; menor: boolean;
    estado: 'confirmado' | 'reserva' | 'baja'; flight: string; plataforma?: number; horaInicio?: string; pesajeInicio?: string; pesajeFin?: string; completo: number;
    pesaje: { rackSq?: number; rackBp: string; segurosBp?: number; intentos: Marcas; estado: string; at?: string };
    perfil: { slug: string; fotoUrl: string; focalX: number; focalY: number; frase: string; bio: string; instagram: string; marcas: Marcas; visible: boolean; imagen?: { at: string; version: string } };
  };
  acreditacion: string;
  checklist: { clave: string; texto: string; hecho: boolean; accion?: 'pesaje' | 'perfil' }[];
  pesajeAbierto: boolean;
  avisos: string[];
}
type Vista = 'cargando' | 'acceso' | 'enviado' | 'panel' | 'perfil' | 'pesaje';

const api = '/api/area-atleta';

/** /area-atleta (Figma page 42): password-less access, panel, profile editor and weigh-in preview. Not indexed. */
@Component({
  selector: 'gr-area-atleta',
  imports: [FormsModule, Navbar, Footer, GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = panel();
    <gr-navbar />
    <main class="relative">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style="background: radial-gradient(60% 70% at 15% 0%, rgb(110 20 32 / 0.35), transparent 70%)"></div>
      <div class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px]">
        @switch (vista()) {
          @case ('cargando') { <div class="mx-auto max-w-md"><gr-skeleton class="h-64 rounded-lg" /></div> }

          @case ('acceso') {
            <div class="mx-auto max-w-md">
              <h1 class="text-display-m md:text-display-l">Área de atleta</h1>
              <p class="mt-2 text-body-m text-text-tertiary">Para atletas inscritos en la {{ nombreComp() }}.</p>
              <p class="mt-4 text-body-l text-text-secondary">Entra con el email con el que te inscribiste en la AEP. Te enviamos un enlace de acceso: sin contraseñas.</p>
              @if (errorEnlace()) { <gr-alert class="mt-6" tone="warning" title="El enlace no sirve">{{ errorEnlace() }}</gr-alert> }
              <form class="mt-6 flex flex-col gap-4" (ngSubmit)="pedir()" novalidate>
                <gr-field label="Email de tu inscripción" for="a-email"><input grInput id="a-email" name="email" type="email" autocomplete="email" [(ngModel)]="email" required /></gr-field>
                @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
                <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="busy()">Enviarme el enlace</button>
              </form>
              <aside class="mt-6 rounded-lg border border-line-subtle bg-bg-card p-5">
                <p class="text-label-m">¿No te llega?</p>
                <p class="mt-1 text-body-s text-text-tertiary">Revisa spam{{ contacto() ? ' o escribe a ' + contacto() : '' }}. Por privacidad, no confirmamos si un email está inscrito.</p>
              </aside>
            </div>
          }

          @case ('enviado') {
            <div class="mx-auto flex max-w-md flex-col items-center text-center">
              <span class="flex size-20 items-center justify-center rounded-full bg-accent-deep/50 text-accent-text"><gr-icon name="mail" [size]="32" /></span>
              <h1 class="mt-6 text-display-m">Revisa tu email</h1>
              <p class="mt-3 text-body-l text-text-secondary">Si {{ email }} está inscrito, te llegará un enlace de acceso. Caduca en 30 minutos.</p>
              <button grButton class="mt-6" [disabled]="espera() > 0" [loading]="busy()" (click)="pedir()">{{ espera() > 0 ? 'Reenviar en 0:' + espera().toString().padStart(2, '0') : 'Reenviar el enlace' }}</button>
              <button type="button" class="mt-3 h-11 text-label-m text-accent-text" (click)="vista.set('acceso')">Usar otro email</button>
            </div>
          }

          @case ('panel') {
            @if (p) {
              <header class="flex items-center gap-4">
                @if (p.atleta.perfil.fotoUrl) { <img [src]="p.atleta.perfil.fotoUrl" alt="" class="size-14 rounded-full object-cover" [style.object-position]="p.atleta.perfil.focalX + '% ' + p.atleta.perfil.focalY + '%'" /> }
                @else { <span class="flex size-14 items-center justify-center rounded-full bg-accent-deep/50 text-label-l">{{ p.atleta.nombre[0] }}{{ p.atleta.apellidos[0] }}</span> }
                <div class="min-w-0 flex-1"><h1 class="truncate text-display-xs md:text-display-m">Hola, {{ p.atleta.nombre }}</h1><p class="text-body-s text-text-tertiary">{{ p.competicion.nombre }} · {{ p.atleta.club || 'Independiente' }}</p></div>
                <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-strong" aria-label="Cerrar sesión" (click)="salir()"><gr-icon name="log-out" [size]="18" /></button>
              </header>
              @for (a of p.avisos; track a) { <gr-alert class="mt-6" tone="info" title="Importante">{{ a }}</gr-alert> }
              <div class="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
                <section class="rounded-lg border border-accent/40 bg-[linear-gradient(160deg,#2a0d12,#171213)] p-5">
                  <h2 class="text-ui-h5">Tu competición</h2>
                  <p class="mt-2 inline-flex h-7 items-center gap-1.5 rounded-pill border px-2.5 text-mono-xs" [class]="p.atleta.estado === 'confirmado' ? 'border-success/40 bg-success/10 text-success' : 'border-info/40 bg-info/10 text-info'">
                    <gr-icon [name]="p.atleta.estado === 'confirmado' ? 'check' : 'clock'" [size]="12" />{{ p.atleta.estado === 'confirmado' ? 'Inscripción AEP confirmada' : 'En la reserva' }}</p>
                  <dl class="mt-4 grid grid-cols-2 gap-2">
                    @for (d of datos(); track d.k) { <div class="rounded-md bg-black/25 p-3"><dt class="text-mono-xs text-text-tertiary">{{ d.k }}</dt><dd class="mt-0.5 text-label-m">{{ d.v }}</dd></div> }
                  </dl>
                  @if (qr()) {
                    <div class="mt-4 flex items-center gap-4 rounded-md bg-black/25 p-3">
                      <img [src]="qr()" alt="Código QR de tu acreditación" class="size-24 rounded-sm bg-white p-1" />
                      <div><p class="text-label-m">Tu acreditación</p><p class="text-body-xs text-text-tertiary">Enséñala en el pesaje. Es el QR de tu inscripción.</p></div>
                    </div>
                  }
                </section>
                <div class="flex flex-col gap-6">
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                    <h2 class="text-ui-h5">Prepara tu día</h2>
                    <ul class="mt-3">
                      @for (c of p.checklist; track c.clave) {
                        <li class="flex min-h-12 items-center gap-3 border-b border-line-subtle py-2 last:border-0">
                          <span class="flex size-6 shrink-0 items-center justify-center rounded-full" [class]="c.hecho ? 'bg-success/20 text-success' : 'border border-line-strong'">@if (c.hecho) { <gr-icon name="check" [size]="14" /> }</span>
                          <span class="flex-1 text-body-s" [class.text-text-tertiary]="c.hecho">{{ c.texto }}</span>
                          @if (c.accion && !c.hecho) { <button type="button" class="h-11 px-1 text-label-s text-accent-text" (click)="abrir(c.accion)">{{ c.accion === 'pesaje' ? 'Añadir' : 'Completar' }}</button> }
                        </li>
                      }
                    </ul>
                  </section>
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                    <div class="flex items-center justify-between"><h2 class="text-ui-h5">Perfil público</h2><span class="text-mono-s text-accent-text">{{ p.atleta.completo }} %</span></div>
                    <div class="mt-3 h-1.5 rounded-pill bg-bg-raised"><div class="h-full rounded-pill bg-accent" [style.width.%]="p.atleta.completo"></div></div>
                    <p class="mt-3 text-body-s text-text-tertiary">Con foto y mejores marcas, tu perfil sale destacado en /atletas y en la pantalla del pabellón.</p>
                    <div class="mt-4 grid gap-2 sm:grid-cols-2">
                      <button grButton variant="primary" (click)="abrir('perfil')">Completar perfil</button>
                      @if (p.pesajeAbierto && p.atleta.estado === 'confirmado') { <button grButton (click)="abrir('pesaje')">Previa del pesaje</button> }
                    </div>
                  </section>
                </div>
              </div>
            }
          }

          @case ('perfil') {
            @if (p) {
              <div class="mx-auto max-w-xl">
                <button type="button" class="mb-4 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary" (click)="vista.set('panel')"><gr-icon name="chevron-left" [size]="16" />Volver</button>
                <h1 class="text-display-m">Tu perfil</h1>
                <p class="mt-1 text-body-s text-text-tertiary">Lo verán en /atletas/{{ p.atleta.perfil.slug }}</p>
                <div class="mt-6 flex gap-4">
                  <button type="button" class="relative size-24 shrink-0 overflow-hidden rounded-full bg-bg-raised" (click)="focal($event)" [disabled]="!p.atleta.perfil.fotoUrl" aria-label="Encuadre: pulsa en tu cara">
                    @if (p.atleta.perfil.fotoUrl) { <img [src]="p.atleta.perfil.fotoUrl" alt="" class="size-full object-cover" [style.object-position]="fx + '% ' + fy + '%'" /> }
                    @else { <span class="flex size-full items-center justify-center text-label-l text-text-tertiary">{{ p.atleta.nombre[0] }}{{ p.atleta.apellidos[0] }}</span> }
                  </button>
                  <div class="min-w-0">
                    <p class="text-label-m">Foto de perfil</p>
                    <p class="text-body-xs text-text-tertiary">JPG, PNG o WebP hasta 8 MB. Pulsa en la foto para centrar tu cara (se guarda la posición).</p>
                    <label class="mt-2 inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 text-label-s">{{ subiendo() ? 'Subiendo…' : p.atleta.perfil.fotoUrl ? 'Cambiar' : 'Subir foto' }}<gr-icon name="arrow-right" [size]="14" />
                      <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="foto($event)" [disabled]="subiendo()" /></label>
                  </div>
                </div>
                @if (!p.atleta.perfil.imagen) {
                  <label class="mt-4 flex min-h-11 items-start gap-3 rounded-md border border-line-subtle bg-bg-card p-3 text-body-s text-text-secondary">
                    <input type="checkbox" name="imagen" [(ngModel)]="aceptaImagen" class="mt-0.5 size-5 accent-[#C42B3E]" />
                    <span>Acepto que la organización publique mi foto en la web de la competición (<a href="/consentimiento-datos" target="_blank" class="text-accent-text underline">consentimiento de imagen</a>). Puedo retirarlo cuando quiera.</span>
                  </label>
                } @else {
                  <p class="mt-4 text-body-xs text-text-tertiary">Consentimiento de imagen aceptado ({{ p.atleta.perfil.imagen.version }}). <button type="button" class="text-accent-text underline" (click)="retirar = true; guardarPerfil()">Retirarlo</button></p>
                }
                <form class="mt-6 flex flex-col gap-5" (ngSubmit)="guardarPerfil()" novalidate>
                  <gr-field label="Club" for="f-club"><input grInput id="f-club" name="club" [(ngModel)]="f.club" maxlength="120" /></gr-field>
                  <gr-field label="Ciudad" for="f-city"><input grInput id="f-city" name="ciudad" [(ngModel)]="f.ciudad" maxlength="80" /></gr-field>
                  @if (!p.atleta.menor) { <gr-field label="Instagram" for="f-ig" [optional]="true"><input grInput id="f-ig" name="ig" [(ngModel)]="f.instagram" placeholder="@usuario" maxlength="60" /></gr-field> }
                  <gr-field label="Sobre ti (máx. 280)" for="f-bio"><textarea grInput id="f-bio" name="bio" rows="4" [(ngModel)]="f.bio" maxlength="280" placeholder="Tercera temporada en powerlifting. Vengo de la halterofilia…"></textarea></gr-field>
                  <fieldset><legend class="text-label-s">Mejores marcas (kg)</legend>
                    <div class="mt-2 grid grid-cols-3 gap-3">
                      @for (m of lifts; track m.k) { <label class="flex flex-col gap-1"><span class="text-mono-xs text-text-tertiary">{{ m.s }}</span><input grInput type="number" inputmode="decimal" step="2.5" min="0" max="600" [name]="'m' + m.k" [(ngModel)]="f.marcas[m.k]" /></label> }
                    </div>
                  </fieldset>
                  <div class="flex items-center justify-between gap-4 rounded-md border border-line-subtle bg-bg-card p-4">
                    <span><span class="block text-label-m">Mostrar mi perfil público</span><span class="block text-body-xs text-text-tertiary">Foto, bio, Instagram y marcas. Nombre, club, categoría, horario y resultados son públicos siempre.</span></span>
                    <button type="button" role="switch" [attr.aria-checked]="f.visible" (click)="f.visible = !f.visible" class="flex h-11 w-12 shrink-0 items-center justify-center" aria-label="Mostrar mi perfil público">
                      <span class="relative h-6 w-10 rounded-pill" [class]="f.visible ? 'bg-accent' : 'bg-line-strong'"><span class="absolute top-0.5 size-5 rounded-full bg-white transition-[left]" [style.left.px]="f.visible ? 18 : 2"></span></span>
                    </button>
                  </div>
                  @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
                  <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="busy()">Guardar perfil</button>
                </form>
              </div>
            }
          }

          @case ('pesaje') {
            @if (p) {
              <div class="mx-auto max-w-xl">
                <button type="button" class="mb-4 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary" (click)="vista.set('panel')"><gr-icon name="chevron-left" [size]="16" />Volver</button>
                <h1 class="text-display-m">Previa del pesaje</h1>
                <p class="mt-1 text-body-l text-text-tertiary">{{ p.atleta.flight ? 'Flight ' + p.atleta.flight + (p.atleta.pesajeInicio ? ' · pesaje ' + hora(p.atleta.pesajeInicio) + '–' + hora(p.atleta.pesajeFin) : '') : 'Horario por publicar' }}</p>
                <section class="mt-6 rounded-lg border border-line-subtle bg-bg-card p-5">
                  <p class="text-body-m text-text-secondary">Déjalo hecho y el pesaje irá más rápido. La mesa lo verá precargado y solo tendrás que confirmarlo.</p>
                  @for (s of steppers; track s.k) {
                    <div class="flex items-center justify-between gap-4 border-b border-line-subtle py-4 last:border-0">
                      <span class="text-body-l">{{ s.label }}</span>
                      <span class="flex items-center gap-3">
                        <button type="button" class="flex size-12 items-center justify-center rounded-full border border-line-strong" [attr.aria-label]="'Bajar ' + s.label" (click)="paso(s.k, -1)"><gr-icon name="minus" [size]="18" /></button>
                        <span class="w-8 text-center text-ui-h3" aria-live="polite">{{ pz[s.k] ?? '–' }}</span>
                        <button type="button" class="flex size-12 items-center justify-center rounded-full border border-line-strong" [attr.aria-label]="'Subir ' + s.label" (click)="paso(s.k, 1)"><gr-icon name="plus" [size]="18" /></button>
                      </span>
                    </div>
                  }
                  <p class="mt-5 text-label-l">Primeros intentos previstos (kg)</p>
                  <div class="mt-2 grid grid-cols-3 gap-3">
                    @for (m of lifts; track m.k) { <label class="flex flex-col gap-1"><span class="text-mono-xs text-text-tertiary">{{ m.s }}</span><input grInput type="number" inputmode="decimal" step="2.5" min="0" max="600" [name]="'i' + m.k" [(ngModel)]="pz.intentos[m.k]" /></label> }
                  </div>
                  @if (error()) { <p class="mt-3 text-body-s text-accent-text" role="alert">{{ error() }}</p> }
                  <button grButton variant="primary" size="l" class="mt-6" [block]="true" [loading]="busy()" (click)="guardarPesaje()">Guardar para el pesaje</button>
                </section>
              </div>
            }
          }
        }
        @if (ok()) { <p class="fixed inset-x-5 bottom-5 z-50 mx-auto max-w-md rounded-md border border-success/40 bg-bg-raised px-4 py-3 text-center text-label-s text-success shadow-card" role="status">{{ ok() }}</p> }
      </div>
    </main>
    <gr-footer />
  `,
})
export class AreaAtletaPage {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly comp = inject(Competition);
  protected readonly hora = hora;
  protected readonly vista = signal<Vista>('cargando');
  protected readonly panel = signal<Panel | null>(null);
  protected readonly qr = signal('');
  protected readonly busy = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly error = signal('');
  protected readonly errorEnlace = signal('');
  protected readonly ok = signal('');
  protected readonly espera = signal(0);
  protected email = '';
  protected aceptaImagen = false;
  protected retirar = false;
  protected fx = 50;
  protected fy = 50;
  protected f = { club: '', ciudad: '', instagram: '', bio: '', marcas: {} as Marcas, visible: true };
  protected pz: { rackSq?: number; rackBp?: number; segurosBp?: number; intentos: Marcas } = { intentos: {} };
  protected readonly lifts: { k: keyof Marcas; s: string }[] = [{ k: 'sq', s: 'SQ' }, { k: 'bp', s: 'BP' }, { k: 'dl', s: 'DL' }];
  protected readonly steppers: { k: 'rackSq' | 'rackBp' | 'segurosBp'; label: string }[] = [{ k: 'rackSq', label: 'Altura rack sentadilla' }, { k: 'rackBp', label: 'Altura rack banca' }, { k: 'segurosBp', label: 'Seguros de banca' }];
  protected readonly nombreComp = computed(() => this.comp.data()?.nombre ? `${this.comp.data()!.nombre} ${this.comp.data()!.edicion}` : 'GR Cup');
  protected readonly contacto = computed(() => this.comp.data()?.evento.emailContacto ?? '');
  protected readonly datos = computed(() => {
    const a = this.panel()?.atleta;
    if (!a) return [];
    return [
      { k: 'Categoría', v: `${a.sexo} ${cat(a.categoria)} kg` }, { k: 'División', v: a.divisionNombre },
      { k: 'Flight', v: a.flight ? a.flight + (a.plataforma ? ' · Plataforma ' + a.plataforma : '') : 'Por publicar' },
      { k: 'Pesaje', v: a.pesajeInicio ? `${hora(a.pesajeInicio)}–${hora(a.pesajeFin)}` : 'Por publicar' },
      { k: 'Inicio', v: a.horaInicio ? hora(a.horaInicio) : 'Por publicar' },
      { k: 'Marcas', v: a.perfil.marcas.sq ? `${kg(a.perfil.marcas.sq)} / ${kg(a.perfil.marcas.bp)} / ${kg(a.perfil.marcas.dl)}` : '–' },
    ];
  });
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    inject(Seo).set({ title: 'Área de atleta · GR Strength Cup', description: 'Acceso para atletas inscritos: tu flight, tu acreditación, tu perfil y la previa del pesaje.', path: '/area-atleta', robots: 'noindex' });
    const route = inject(ActivatedRoute);
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
    void inject(PendingTasks).run(() => this.comp.load());
    if (!this.browser) return; // private page: rendered in the browser (session cookie)
    void (async () => {
      const token = route.snapshot.queryParamMap.get('acceso');
      if (token) {
        history.replaceState(null, '', '/area-atleta'); // the one-time token never stays in the address bar
        try {
          this.set(await firstValueFrom(this.http.post<Panel>(`${api}/sesion`, { acceso: token })));
          return;
        } catch {
          this.errorEnlace.set('Ha caducado o ya se usó. Pide uno nuevo con tu email.');
        }
      }
      try {
        this.set(await firstValueFrom(this.http.get<Panel>(`${api}/yo`)));
      } catch {
        this.vista.set('acceso');
      }
    })();
  }

  private async set(p: Panel): Promise<void> {
    this.panel.set(p);
    if (this.vista() === 'cargando' || this.vista() === 'acceso') this.vista.set('panel');
    // qrcode is CommonJS: the dynamic import exposes it as `default`.
    const mod = await import('qrcode');
    const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
    this.qr.set(await QR.toDataURL(p.acreditacion, { margin: 1, width: 240, errorCorrectionLevel: 'M' }));
  }

  protected async pedir(): Promise<void> {
    this.error.set('');
    if (!this.email.includes('@')) return this.error.set('Escribe el email de tu inscripción.');
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post(`${api}/enlace`, { competicion: COMPETITION_SLUG, email: this.email.trim() }));
      this.vista.set('enviado');
      this.espera.set(45);
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.espera.update((n) => Math.max(0, n - 1));
        if (this.espera() === 0) clearInterval(this.timer);
      }, 1000);
    } catch (e) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'Inténtalo de nuevo en unos minutos.');
    } finally {
      this.busy.set(false);
    }
  }

  protected abrir(v: 'perfil' | 'pesaje'): void {
    const a = this.panel()?.atleta;
    if (!a) return;
    this.error.set('');
    if (v === 'perfil') {
      this.f = { club: a.club, ciudad: a.ciudad, instagram: a.perfil.instagram, bio: a.perfil.bio || a.perfil.frase, marcas: { ...a.perfil.marcas }, visible: a.perfil.visible };
      this.fx = a.perfil.focalX;
      this.fy = a.perfil.focalY;
      this.aceptaImagen = false;
      this.retirar = false;
    } else {
      const [bp, seg] = (a.pesaje.rackBp || '').split('/').map((x) => Number(x) || undefined);
      this.pz = { rackSq: a.pesaje.rackSq ?? 12, rackBp: bp ?? 6, segurosBp: a.pesaje.segurosBp ?? seg ?? 4, intentos: { ...a.pesaje.intentos } };
    }
    this.vista.set(v);
    if (this.browser) scrollTo({ top: 0 });
  }

  protected paso(k: 'rackSq' | 'rackBp' | 'segurosBp', d: number): void {
    this.pz[k] = Math.min(30, Math.max(k === 'segurosBp' ? 0 : 1, (this.pz[k] ?? 0) + d));
  }

  protected async focal(ev: MouseEvent): Promise<void> {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.fx = Math.round(((ev.clientX - r.left) / r.width) * 100);
    this.fy = Math.round(((ev.clientY - r.top) / r.height) * 100);
    try {
      this.set(await firstValueFrom(this.http.put<Panel>(`${api}/foto/encuadre`, { focalX: this.fx, focalY: this.fy })));
    } catch {
      /* the next save keeps trying */
    }
  }

  protected async foto(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set('');
    this.subiendo.set(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const p = await firstValueFrom(this.http.post<Panel>(`${api}/foto`, fd));
      this.fx = p.atleta.perfil.focalX;
      this.fy = p.atleta.perfil.focalY;
      this.set(p);
      this.aviso('Foto subida');
    } catch (e) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'No se pudo subir la foto.');
    } finally {
      this.subiendo.set(false);
    }
  }

  protected async guardarPerfil(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    const n = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));
    try {
      const p = await firstValueFrom(this.http.put<Panel>(`${api}/perfil`, {
        club: this.f.club, ciudad: this.f.ciudad, instagram: this.f.instagram, bio: this.f.bio, marcas: { sq: n(this.f.marcas.sq), bp: n(this.f.marcas.bp), dl: n(this.f.marcas.dl) },
        visible: this.f.visible, aceptaUsoDeImagen: this.aceptaImagen, retirarConsentimiento: this.retirar,
      }));
      this.set(p);
      this.retirar = false;
      this.vista.set('panel');
      this.aviso('Perfil guardado');
    } catch (e) {
      this.error.set(this.msg(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async guardarPesaje(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    const n = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));
    try {
      this.set(await firstValueFrom(this.http.put<Panel>(`${api}/pesaje`, { rackSq: this.pz.rackSq, rackBp: this.pz.rackBp, segurosBp: this.pz.segurosBp, intentos: { sq: n(this.pz.intentos.sq), bp: n(this.pz.intentos.bp), dl: n(this.pz.intentos.dl) } })));
      this.vista.set('panel');
      this.aviso('Guardado para el pesaje');
    } catch (e) {
      this.error.set(this.msg(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async salir(): Promise<void> {
    await firstValueFrom(this.http.post(`${api}/salir`, {})).catch(() => undefined);
    this.panel.set(null);
    this.vista.set('acceso');
  }

  private msg(e: unknown): string {
    if (e instanceof HttpErrorResponse && e.status === 401) {
      this.vista.set('acceso');
      return '';
    }
    return (e as { error?: { detail?: string } }).error?.detail ?? 'No se pudo guardar. Inténtalo de nuevo.';
  }

  private aviso(t: string): void {
    this.ok.set(t);
    setTimeout(() => this.ok.set(''), 2500);
  }
}
