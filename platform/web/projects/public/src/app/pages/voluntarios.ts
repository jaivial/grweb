import { textoError } from '../core/errores';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, PendingTasks, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrButton, GrIcon, GrInput, GrTelefono, type GrIconName, telefonoValido } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Competition } from '../core/competition';
import { FanSession } from '../core/fan';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Related } from './landings';

interface Rol { id: string; t: string; d: string; req: string; icono: GrIconName }

const BORRADOR = 'grcup_borrador_voluntario';
/** Weekday names in Spanish: also the value sent as availability (the staff reads it in Spanish). */
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const T = {
  es: {
    emailPh: 'tu@email.com',
    /** Figma 33 «¿Cómo quieres ayudar?». */
    roles: [
      { id: 'jueces', t: 'Jueces', d: 'Arbitraje de los intentos en plataforma.', req: 'Licencia de juez AEP', icono: 'shield' },
      { id: 'cargadores', t: 'Cargadores', d: 'Carga de discos y seguridad (spotters).', req: 'Experiencia en fuerza', icono: 'maximize' },
      { id: 'mesa', t: 'Mesa técnica', d: 'Marcador, intentos y orden de salida.', req: 'Manejo de ordenador', icono: 'monitor' },
      { id: 'foto', t: 'Foto y vídeo', d: 'Contenido para redes y la galería.', req: 'Equipo propio', icono: 'camera' },
      { id: 'acreditaciones', t: 'Acreditaciones y logística', d: 'Pesaje, acreditaciones y atención al público.', req: '', icono: 'users' },
    ] as Rol[],
    dias: DIAS, montaje: (d: string) => `Montaje (${d})`, diaComp: 'Día de la competición', montajeAnterior: 'Montaje (día anterior)',
    titulo: 'Hazte', acento: 'voluntario', voluntariado: 'Voluntariado', comunidad: 'Comunidad', crumb: 'Voluntarios',
    subtitulo: 'Una competición de powerlifting necesita jueces, cargadores, mesa técnica y mucha gente con ganas. Elige cómo quieres ayudar.',
    eligeRol: 'Elige tu rol', comoAyudar: '¿Cómo quieres *ayudar?*', rolesAria: 'Roles de voluntariado', almenosRol: 'Elige al menos un rol.',
    teLlevas: 'Qué te llevas', aDefinir: 'A definir',
    beneficios: ['Camiseta oficial de voluntario', 'Comida durante la jornada', 'Certificado de voluntariado', 'Ver la competición desde dentro'],
    apuntate: 'Apúntate', enEquipo: '¡Ya estás en el equipo!',
    turno: (puesto: string, turno: string) => `${puesto} · turno ${turno}. Unos días antes te enviaremos el briefing con la hora de llegada.`,
    noPudo: 'Esta vez no ha podido ser', motivo: 'Te hemos escrito con el motivo. Te tendremos en cuenta para la próxima edición.',
    solicitud: (revision: boolean) => `Tu solicitud está ${revision ? 'en revisión' : 'recibida'}`, escribiremos: 'Te escribiremos con el puesto y el turno en cuanto la revisemos.',
    modificar: 'Modificar mi solicitud', volver: 'Volver al inicio', gracias: '¡Gracias por apuntarte!',
    briefing: (email: string) => `Te escribiremos a ${email} con el briefing y los turnos unas semanas antes de la competición.`,
    nombre: 'Nombre y apellidos', tuNombre: 'Tu nombre', errNombre: 'Escribe tu nombre y apellidos.', errEmail: 'Escribe un email válido.',
    telefono: 'Teléfono', disponibilidad: 'Disponibilidad', experiencia: 'Experiencia', opcional: '(opcional)',
    expPh: 'Cuéntanos si has sido juez, cargador o voluntario antes…', menor: 'Soy menor de edad',
    autorizacion: 'Necesitaremos la autorización firmada de tu madre, padre o tutor antes de confirmarte.',
    acepto: 'He leído y acepto la', politica: 'política de tratamiento de mis datos', errAcepta: 'Marca la casilla para enviar la solicitud.',
    noEnviar: 'No se pudo enviar', enviar: 'Enviar solicitud', revisa: 'Revisa los campos marcados.', reintenta: 'Inténtalo de nuevo en unos minutos.',
    rel: [
      { titulo: 'Reglamento', texto: 'Cómo se juzga un intento', ruta: '/reglamento' },
      { titulo: 'Patrocinadores', texto: 'Quién lo hace posible', ruta: '/patrocinadores' },
    ],
    seoTitulo: 'Voluntarios · GR Strength Cup', seoDesc: 'Jueces, cargadores, mesa técnica, foto y acreditaciones: apúntate como voluntario en la GR Strength Cup.',
  },
  en: {
    emailPh: 'you@email.com',
    roles: [
      { id: 'jueces', t: 'Referees', d: 'Judging the attempts on the platform.', req: 'AEP referee licence', icono: 'shield' },
      { id: 'cargadores', t: 'Loaders', d: 'Loading plates and safety (spotters).', req: 'Strength training experience', icono: 'maximize' },
      { id: 'mesa', t: 'Technical desk', d: 'Scoreboard, attempts and lifting order.', req: 'Computer skills', icono: 'monitor' },
      { id: 'foto', t: 'Photo and video', d: 'Content for social media and the gallery.', req: 'Own equipment', icono: 'camera' },
      { id: 'acreditaciones', t: 'Accreditation and logistics', d: 'Weigh-in, accreditation and spectator assistance.', req: '', icono: 'users' },
    ] as Rol[],
    dias: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], montaje: (d: string) => `Set-up (${d})`,
    diaComp: 'Competition day', montajeAnterior: 'Set-up (day before)',
    titulo: 'Become a', acento: 'volunteer', voluntariado: 'Volunteering', comunidad: 'Community', crumb: 'Volunteers',
    subtitulo: 'A powerlifting competition needs referees, loaders, a technical desk and plenty of willing people. Choose how you want to help.',
    eligeRol: 'Choose your role', comoAyudar: 'How would you like *to help?*', rolesAria: 'Volunteer roles', almenosRol: 'Choose at least one role.',
    teLlevas: 'What you get', aDefinir: 'To be decided',
    beneficios: ['Official volunteer T-shirt', 'Lunch during the day', 'Volunteering certificate', 'See the competition from the inside'],
    apuntate: 'Sign up', enEquipo: 'You’re on the team!',
    turno: (puesto: string, turno: string) => `${puesto} · shift ${turno}. A few days before, we’ll send you the briefing with your arrival time.`,
    noPudo: 'It wasn’t possible this time', motivo: 'We’ve emailed you the reason. We’ll keep you in mind for the next edition.',
    solicitud: (revision: boolean) => `Your application has been ${revision ? 'put under review' : 'received'}`, escribiremos: 'We’ll write to you with your role and shift as soon as we’ve reviewed it.',
    modificar: 'Edit my application', volver: 'Back to home', gracias: 'Thanks for signing up!',
    briefing: (email: string) => `We’ll write to ${email} with the briefing and shifts a few weeks before the competition.`,
    nombre: 'Full name', tuNombre: 'Your name', errNombre: 'Enter your full name.', errEmail: 'Enter a valid email address.',
    telefono: 'Phone', disponibilidad: 'Availability', experiencia: 'Experience', opcional: '(optional)',
    expPh: 'Tell us if you have been a referee, loader or volunteer before…', menor: 'I am under 18',
    autorizacion: 'We’ll need the signed authorisation of your mother, father or guardian before confirming you.',
    acepto: 'I have read and accept the', politica: 'policy on the processing of my data', errAcepta: 'Tick the box to send the application.',
    noEnviar: 'Couldn’t send it', enviar: 'Send application', revisa: 'Check the highlighted fields.', reintenta: 'Please try again in a few minutes.',
    rel: [
      { titulo: 'Rules', texto: 'How an attempt is judged', ruta: '/reglamento' },
      { titulo: 'Sponsors', texto: 'Who makes it possible', ruta: '/patrocinadores' },
    ],
    seoTitulo: 'Volunteers · GR Strength Cup', seoDesc: 'Referees, loaders, technical desk, photography and accreditation: sign up as a volunteer at the GR Strength Cup.',
  },
};

/**
 * /voluntarios (Figma page 33): the roles to pick as checkbox cards, «Qué te llevas», and the «Apúntate» form
 * (availability chips built from the event days, experience, a separate unticked privacy consent). After sending, the
 * form card shows the confirmation (Figma «enviado»).
 */
@Component({
  selector: 'gr-voluntarios-page',
  imports: [RouterLink, LocPipe, Page, FormsModule, GrIcon, GrInput, GrTelefono, GrButton, GrAlert, GrCabecera, Related],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [eyebrow]="t().voluntariado" [section]="t().comunidad" [crumb]="t().crumb"
      [subtitle]="t().subtitulo">
      <div class="flex flex-col gap-16 md:gap-20">
        <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-6">
          <section class="flex flex-col gap-5 md:gap-6">
            <gr-cabecera [eyebrow]="t().eligeRol" [titulo]="t().comoAyudar" [centro]="false" tam="m" />
            <ul class="flex flex-col gap-3" role="group" [attr.aria-label]="t().rolesAria">
              @for (r of t().roles; track r.id) {
                <li>
                  <label class="flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors md:p-5" [class]="elegido(r.id) ? 'border-accent/60 bg-accent/8' : 'border-line-subtle bg-bg-card hover:border-line-strong'">
                    <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="r.icono" [size]="20" /></span>
                    <span class="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span class="text-label-m">{{ r.t }}</span>
                      <span class="text-body-s text-text-tertiary">{{ r.d }}</span>
                      @if (r.req) { <span class="mt-1 inline-flex h-6 items-center rounded-full bg-white/6 px-2.5 text-label-xs text-text-secondary uppercase">{{ r.req }}</span> }
                    </span>
                    <input type="checkbox" class="mt-0.5 size-5 shrink-0 accent-[#C42B3E]" [checked]="elegido(r.id)" (change)="alternarRol(r.id)" [attr.aria-invalid]="falta() && !rolesElegidos().size" />
                  </label>
                </li>
              }
            </ul>
            @if (falta() && !rolesElegidos().size) { <span class="flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ t().almenosRol }}</span> }
            <div class="rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-label-m">{{ t().teLlevas }}</h2>
                <span class="inline-flex h-6 items-center rounded-full border border-info/40 bg-info/10 px-2.5 text-label-xs text-info uppercase">{{ t().aDefinir }}</span>
              </div>
              <ul class="mt-4 flex flex-col gap-2.5">
                @for (b of t().beneficios; track b) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ b }}</li> }
              </ul>
            </div>
          </section>

          <section id="apuntate" class="scroll-mt-28 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6 lg:sticky lg:top-28" aria-labelledby="apuntate-t">
            <h2 id="apuntate-t" class="text-ui-h3">{{ t().apuntate }}</h2>
            @if (mia(); as m) {
              <div class="flex flex-col items-center gap-4 py-8 text-center" role="status">
                <span class="flex size-14 items-center justify-center rounded-full" [class]="m.estado === 'descartado' ? 'bg-bg-raised text-text-secondary' : 'bg-success/12 text-success'"><gr-icon [name]="m.estado === 'descartado' ? 'info' : 'circle-check'" [size]="26" /></span>
                @switch (m.estado) {
                  @case ('confirmado') { <p class="text-display-xs">{{ t().enEquipo }}</p><p class="max-w-sm text-body-s text-text-secondary">{{ t().turno(m.puesto, m.turno) }}</p> }
                  @case ('descartado') { <p class="text-display-xs">{{ t().noPudo }}</p><p class="max-w-sm text-body-s text-text-secondary">{{ t().motivo }}</p> }
                  @default { <p class="text-display-xs">{{ t().solicitud(m.estado === 'revision') }}</p><p class="max-w-sm text-body-s text-text-secondary">{{ t().escribiremos }}</p> }
                }
                @if (m.estado === 'pendiente') { <button grButton variant="outline" type="button" (click)="mia.set(null)">{{ t().modificar }}</button> }
                @else { <a grButton variant="outline" [routerLink]="'/' | loc">{{ t().volver }}</a> }
              </div>
            } @else if (enviado()) {
              <div class="flex flex-col items-center gap-4 py-8 text-center" role="status">
                <span class="flex size-14 items-center justify-center rounded-full bg-success/12 text-success"><gr-icon name="circle-check" [size]="26" /></span>
                <p class="text-display-xs">{{ t().gracias }}</p>
                <p class="max-w-sm text-body-s text-text-secondary">{{ t().briefing(email) }}</p>
                <a grButton variant="outline" [routerLink]="'/' | loc">{{ t().volver }}</a>
              </div>
            } @else {
              <form class="mt-5 flex flex-col gap-4" (ngSubmit)="enviar()" novalidate>
                <label class="flex flex-col gap-1.5" for="v-nombre"><span class="text-label-s">{{ t().nombre }} <span class="text-accent-text">*</span></span>
                  <input grInput id="v-nombre" name="nombre" autocomplete="name" required [placeholder]="t().tuNombre" [(ngModel)]="nombre" [attr.aria-invalid]="falta() && nombre.trim().length < 2" /></label>
                @if (falta() && nombre.trim().length < 2) { <span class="flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ t().errNombre }}</span> }
                <label class="flex flex-col gap-1.5" for="v-email"><span class="text-label-s">Email <span class="text-accent-text">*</span></span>
                  <input grInput id="v-email" name="email" type="email" autocomplete="email" required [placeholder]="t().emailPh" [(ngModel)]="email" [attr.aria-invalid]="falta() && !emailOk()" /></label>
                @if (falta() && !emailOk()) { <span class="flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ t().errEmail }}</span> }
                <label class="flex flex-col gap-1.5" for="v-tel"><span class="text-label-s">{{ t().telefono }}</span>
                  <gr-telefono id="v-tel" name="telefono" [aria-label]="t().telefono" [(ngModel)]="telefono" /></label>
                <fieldset class="flex flex-col gap-2">
                  <legend class="mb-1.5 text-label-s">{{ t().disponibilidad }}</legend>
                  <div class="flex flex-wrap gap-2">
                    @for (d of dias(); track d; let i = $index) {
                      <button type="button" class="inline-flex h-11 items-center gap-2 rounded-full border px-4 text-label-s transition-colors" [attr.aria-pressed]="disponible().has(d)" (click)="alternarDia(d)"
                        [class]="disponible().has(d) ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-tertiary hover:text-text-primary'">
                        <gr-icon [name]="disponible().has(d) ? 'check' : 'plus'" [size]="14" />{{ diasVisibles()[i] }}
                      </button>
                    }
                  </div>
                </fieldset>
                <label class="flex flex-col gap-1.5" for="v-exp"><span class="text-label-s">{{ t().experiencia }} <span class="text-text-tertiary">{{ t().opcional }}</span></span>
                  <textarea grInput id="v-exp" name="experiencia" rows="3" maxlength="1000" [placeholder]="t().expPh" class="min-h-24 py-2.5" [(ngModel)]="experiencia"></textarea></label>
                <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="menor" [(ngModel)]="menor" class="mt-0.5 size-5 shrink-0 accent-[#C42B3E]" /><span>{{ t().menor }} <span class="block text-body-xs text-text-tertiary">{{ t().autorizacion }}</span></span></label>
                <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="priv" [(ngModel)]="acepta" [attr.aria-invalid]="falta() && !acepta" class="mt-0.5 size-5 shrink-0 accent-[#C42B3E]" /><span>{{ t().acepto }} <a [href]="'/privacidad' | loc" target="_blank" class="text-accent-text underline">{{ t().politica }}</a></span></label>
                @if (falta() && !acepta) { <span class="flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ t().errAcepta }}</span> }
                @if (error()) { <gr-alert tone="danger" [title]="t().noEnviar" role="alert">{{ error() }}</gr-alert> }
                <button grButton variant="primary" size="l" type="submit" class="w-full" [loading]="enviando()">{{ t().enviar }}</button>
              </form>
            }
          </section>
        </div>
        <gr-related [items]="t().rel" />
      </div>
    </gr-page>
  `,
})
export class VoluntariosPage {
  private readonly cms = inject(Cms);
  private readonly comp = inject(Competition);
  private readonly fan = inject(FanSession);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected nombre = '';
  protected email = '';
  protected telefono = '';
  protected experiencia = '';
  protected acepta = false;
  protected menor = false;
  /** The signed-in fan's request once sent: its status replaces the form. */
  protected readonly mia = signal<{ estado: string; puesto: string; turno: string } | null>(null);
  protected readonly rolesElegidos = signal(new Set<string>());
  protected readonly disponible = signal(new Set<string>());
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal('');
  protected readonly falta = signal(false);

  /** The event days by name («Sábado») and the set-up the day before («Montaje (viernes)»), in Spanish and in the current language. */
  /** Spanish values: the availability chips and the value sent to the staff. */
  protected readonly dias = computed(() => this.diasDe(T.es, this.comp.data()));
  protected readonly diasVisibles = computed(() => this.diasDe(this.t(), this.comp.data()));
  private diasDe(t: typeof T.es, c: ReturnType<Competition['data']>): string[] {
    if (!c?.fechaInicio) return [t.diaComp, t.montajeAnterior];
    const dia = (iso: string, mas = 0) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + mas); return d; };
    const out: string[] = [];
    for (let d = dia(c.fechaInicio), fin = dia(c.fechaFin || c.fechaInicio); d <= fin && out.length < 4; d.setUTCDate(d.getUTCDate() + 1)) out.push(t.dias[d.getUTCDay()]);
    const montaje = t.dias[dia(c.fechaInicio, -1).getUTCDay()];
    return [...out, t.montaje(t === T.es ? montaje.toLowerCase() : montaje)];
  }

  constructor() {
    const seo = inject(Seo);
    // back from the access email: restore what was typed (D-MIEMBROS). After render so hydration can't reset the checkboxes.
    afterNextRender(() => {
      // Only with a session: anonymous visitors get 401 from `mi-solicitud` (nothing to look up on every visit)
      void this.fan.cargar().then((f) => f && this.cms.miVoluntario().then((m) => { if (m?.estado) { this.mia.set(m); this.cdr.markForCheck(); } }));
      const b = sessionStorage.getItem(BORRADOR);
      if (!b) return;
      sessionStorage.removeItem(BORRADOR);
      const d = JSON.parse(b);
      Object.assign(this, { nombre: d.nombre, email: d.email, telefono: d.telefono, experiencia: d.experiencia, acepta: !!d.acepta, menor: !!d.menor });
      this.rolesElegidos.set(new Set(d.roles));
      this.disponible.set(new Set(d.dias));
      this.cdr.markForCheck();
    });
    void inject(PendingTasks).run(async () => {
      await this.comp.load();
      await applySeo(this.cms, seo, '/voluntarios', this.t().seoTitulo, this.t().seoDesc);
    });
  }

  protected elegido(id: string): boolean { return this.rolesElegidos().has(id); }
  protected alternarRol(id: string): void { const s = new Set(this.rolesElegidos()); if (!s.delete(id)) s.add(id); this.rolesElegidos.set(s); }
  protected alternarDia(d: string): void { const s = new Set(this.disponible()); if (!s.delete(d)) s.add(d); this.disponible.set(s); }
  protected emailOk(): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim()); }

  protected async enviar(): Promise<void> {
    this.error.set('');
    this.falta.set(true);
    if (this.nombre.trim().length < 2 || !this.emailOk() || (this.telefono.trim() && !telefonoValido(this.telefono)) || !this.rolesElegidos().size || !this.acepta) {
      this.error.set(this.t().revisa);
      // take the person to the first marked field (roles sit in the other column, far above on mobile)
      const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      setTimeout(() => { const el = document.querySelector<HTMLElement>('[aria-invalid="true"]'); el?.scrollIntoView({ behavior, block: 'center' }); el?.focus({ preventScroll: true }); });
      return;
    }
    // D-MIEMBROS: the request needs a fan session; the access email brings the person back here.
    if (!(await this.fan.cargar())) {
      sessionStorage.setItem(BORRADOR, JSON.stringify({ nombre: this.nombre, email: this.email, telefono: this.telefono, experiencia: this.experiencia, acepta: this.acepta, menor: this.menor,
        roles: [...this.rolesElegidos()], dias: [...this.disponible()] }));
      return this.fan.abrirAcceso('formulario', this.i18n.path('/voluntarios'), this.email.trim());
    }
    this.enviando.set(true);
    try {
      await this.cms.voluntario({
        nombre: this.nombre.trim(), email: this.email.trim(), telefono: this.telefono.trim(),
        disponibilidad: this.dias().filter((d) => this.disponible().has(d)).join(', '),
        roles: T.es.roles.map((r) => r.id).filter((id) => this.rolesElegidos().has(id)), experiencia: this.experiencia.trim(),
        esMenor: this.menor, aceptaPrivacidad: this.acepta,
      });
      this.enviado.set(true);
      setTimeout(() => document.getElementById('apuntate')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      this.error.set(textoError(e, this.t().reintenta));
    } finally {
      this.enviando.set(false);
    }
  }
}
