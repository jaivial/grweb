import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrButton, GrIcon, GrInput, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Related } from './landings';

interface Rol { id: string; t: string; d: string; req: string; icono: GrIconName }

/** Figma 33 «¿Cómo quieres ayudar?». */
const ROLES: Rol[] = [
  { id: 'jueces', t: 'Jueces', d: 'Arbitraje de los intentos en plataforma.', req: 'Licencia de juez AEP', icono: 'shield' },
  { id: 'cargadores', t: 'Cargadores', d: 'Carga de discos y seguridad (spotters).', req: 'Experiencia en fuerza', icono: 'maximize' },
  { id: 'mesa', t: 'Mesa técnica', d: 'Marcador, intentos y orden de salida.', req: 'Manejo de ordenador', icono: 'monitor' },
  { id: 'foto', t: 'Foto y vídeo', d: 'Contenido para redes y la galería.', req: 'Equipo propio', icono: 'camera' },
  { id: 'acreditaciones', t: 'Acreditaciones y logística', d: 'Pesaje, acreditaciones y atención al público.', req: '', icono: 'users' },
];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * /voluntarios (Figma page 33): the roles to pick as checkbox cards, «Qué te llevas», and the «Apúntate» form
 * (availability chips built from the event days, experience, a separate unticked privacy consent). After sending, the
 * form card shows the confirmation (Figma «enviado»).
 */
@Component({
  selector: 'gr-voluntarios-page',
  imports: [Page, FormsModule, GrIcon, GrInput, GrButton, GrAlert, GrCabecera, Related],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Hazte" accent="voluntario" eyebrow="Voluntariado" section="Comunidad" crumb="Voluntarios"
      subtitle="Una competición de powerlifting necesita jueces, cargadores, mesa técnica y mucha gente con ganas. Elige cómo quieres ayudar.">
      <div class="flex flex-col gap-16 md:gap-20">
        <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-6">
          <section class="flex flex-col gap-5 md:gap-6">
            <gr-cabecera eyebrow="01 · Elige tu rol" titulo="¿Cómo quieres *ayudar?*" [centro]="false" tam="m" />
            <ul class="flex flex-col gap-3" role="group" aria-label="Roles de voluntariado">
              @for (r of roles; track r.id) {
                <li>
                  <label class="flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-colors md:p-5" [class]="elegido(r.id) ? 'border-accent/60 bg-accent/8' : 'border-line-subtle bg-bg-card hover:border-line-strong'">
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent-text"><gr-icon [name]="r.icono" [size]="18" /></span>
                    <span class="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span class="text-label-m">{{ r.t }}</span>
                      <span class="text-body-s text-text-tertiary">{{ r.d }}</span>
                      @if (r.req) { <span class="mt-1 inline-flex h-6 items-center rounded-full bg-white/6 px-2.5 text-label-xs text-text-secondary uppercase">{{ r.req }}</span> }
                    </span>
                    <input type="checkbox" class="mt-0.5 size-5 shrink-0 accent-[#C42B3E]" [checked]="elegido(r.id)" (change)="alternarRol(r.id)" />
                  </label>
                </li>
              }
            </ul>
            <div class="rounded-2xl border border-line-subtle bg-bg-card p-5 md:p-6">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-label-m">Qué te llevas</h2>
                <span class="inline-flex h-6 items-center rounded-full border border-info/40 bg-info/10 px-2.5 text-label-xs text-info uppercase">A definir</span>
              </div>
              <ul class="mt-4 flex flex-col gap-2.5">
                @for (b of beneficios; track b) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ b }}</li> }
              </ul>
            </div>
          </section>

          <section id="apuntate" class="scroll-mt-28 rounded-2xl border border-line-subtle bg-bg-card p-5 md:p-6 lg:sticky lg:top-28" aria-labelledby="apuntate-t">
            <h2 id="apuntate-t" class="text-ui-h3">Apúntate</h2>
            @if (enviado()) {
              <div class="flex flex-col items-center gap-4 py-8 text-center" role="status">
                <span class="flex size-14 items-center justify-center rounded-full bg-success/12 text-success"><gr-icon name="circle-check" [size]="26" /></span>
                <p class="text-display-xs">¡Gracias por apuntarte!</p>
                <p class="max-w-sm text-body-s text-text-secondary">Te escribiremos a {{ email }} con el briefing y los turnos unas semanas antes de la competición.</p>
                <a grButton variant="outline" href="/">Volver al inicio</a>
              </div>
            } @else {
              <form class="mt-5 flex flex-col gap-4" (ngSubmit)="enviar()" novalidate>
                <label class="flex flex-col gap-1.5" for="v-nombre"><span class="text-label-s">Nombre y apellidos <span class="text-accent-text">*</span></span>
                  <input grInput id="v-nombre" name="nombre" autocomplete="name" required placeholder="Tu nombre" [(ngModel)]="nombre" [attr.aria-invalid]="falta() && nombre.trim().length < 2" /></label>
                <label class="flex flex-col gap-1.5" for="v-email"><span class="text-label-s">Email <span class="text-accent-text">*</span></span>
                  <input grInput id="v-email" name="email" type="email" autocomplete="email" required placeholder="tu@email.com" [(ngModel)]="email" [attr.aria-invalid]="falta() && !emailOk()" /></label>
                <label class="flex flex-col gap-1.5" for="v-tel"><span class="text-label-s">Teléfono</span>
                  <span class="flex h-11 items-center overflow-hidden rounded-md border border-line-strong bg-bg-field focus-within:border-accent-text">
                    <span class="flex h-full items-center border-r border-line-subtle px-3 text-body-m text-text-secondary">+34</span>
                    <input id="v-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="600 000 000" class="h-full min-w-0 flex-1 bg-transparent px-3 text-body-m placeholder:text-text-muted focus:outline-none" [(ngModel)]="telefono" />
                  </span></label>
                <fieldset class="flex flex-col gap-2">
                  <legend class="mb-1.5 text-label-s">Disponibilidad</legend>
                  <div class="flex flex-wrap gap-2">
                    @for (d of dias(); track d) {
                      <button type="button" class="inline-flex h-11 items-center gap-2 rounded-full border px-4 text-label-s transition-colors md:h-10" [attr.aria-pressed]="disponible().has(d)" (click)="alternarDia(d)"
                        [class]="disponible().has(d) ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-tertiary hover:text-text-primary'">
                        <gr-icon [name]="disponible().has(d) ? 'check' : 'plus'" [size]="14" />{{ d }}
                      </button>
                    }
                  </div>
                </fieldset>
                <label class="flex flex-col gap-1.5" for="v-exp"><span class="text-label-s">Experiencia <span class="text-text-tertiary">(opcional)</span></span>
                  <textarea grInput id="v-exp" name="experiencia" rows="3" maxlength="1000" placeholder="Cuéntanos si has sido juez, cargador o voluntario antes…" class="min-h-24 py-2.5" [(ngModel)]="experiencia"></textarea></label>
                <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="menor" [(ngModel)]="esMenor" class="mt-0.5 size-5 shrink-0 accent-[#C42B3E]" />Soy menor de edad (pediremos la autorización de mi madre, padre o tutor)</label>
                <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" name="priv" [(ngModel)]="acepta" [attr.aria-invalid]="falta() && !acepta" class="mt-0.5 size-5 shrink-0 accent-[#C42B3E]" /><span>He leído y acepto la <a href="/privacidad" target="_blank" class="text-accent-text underline">política de tratamiento de mis datos</a></span></label>
                @if (error()) { <gr-alert tone="danger" title="No se pudo enviar" role="alert">{{ error() }}</gr-alert> }
                <button grButton variant="primary" size="l" type="submit" class="w-full" [loading]="enviando()">Enviar solicitud</button>
              </form>
            }
          </section>
        </div>
        <gr-related [items]="rel" />
      </div>
    </gr-page>
  `,
})
export class VoluntariosPage {
  private readonly cms = inject(Cms);
  private readonly comp = inject(Competition);
  protected readonly roles = ROLES;
  protected readonly beneficios = ['Camiseta oficial de voluntario', 'Comida durante la jornada', 'Certificado de voluntariado', 'Ver la competición desde dentro'];
  protected readonly rel = [
    { titulo: 'Reglamento', texto: 'Cómo se juzga un intento', ruta: '/reglamento' },
    { titulo: 'Clubs', texto: 'Clubs de la región', ruta: '/clubs' },
    { titulo: 'Patrocinadores', texto: 'Quién lo hace posible', ruta: '/patrocinadores' },
  ];
  protected nombre = '';
  protected email = '';
  protected telefono = '';
  protected experiencia = '';
  protected esMenor = false;
  protected acepta = false;
  private readonly rolesElegidos = signal(new Set<string>());
  protected readonly disponible = signal(new Set<string>());
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal('');
  protected readonly falta = signal(false);

  /** The event days by name («Sábado») and the set-up the day before («Montaje (viernes)»). */
  protected readonly dias = computed(() => {
    const c = this.comp.data();
    if (!c?.fechaInicio) return ['Día de la competición', 'Montaje (día anterior)'];
    const dia = (iso: string, mas = 0) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + mas); return d; };
    const out: string[] = [];
    for (let d = dia(c.fechaInicio), fin = dia(c.fechaFin || c.fechaInicio); d <= fin && out.length < 4; d.setUTCDate(d.getUTCDate() + 1)) out.push(DIAS[d.getUTCDay()]);
    return [...out, `Montaje (${DIAS[dia(c.fechaInicio, -1).getUTCDay()].toLowerCase()})`];
  });

  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      await this.comp.load();
      await applySeo(this.cms, seo, '/voluntarios', 'Voluntarios · GR Strength Cup', 'Jueces, cargadores, mesa técnica, foto y acreditaciones: apúntate como voluntario en la GR Strength Cup.');
    });
  }

  protected elegido(id: string): boolean { return this.rolesElegidos().has(id); }
  protected alternarRol(id: string): void { const s = new Set(this.rolesElegidos()); if (!s.delete(id)) s.add(id); this.rolesElegidos.set(s); }
  protected alternarDia(d: string): void { const s = new Set(this.disponible()); if (!s.delete(d)) s.add(d); this.disponible.set(s); }
  protected emailOk(): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim()); }

  protected async enviar(): Promise<void> {
    this.error.set('');
    this.falta.set(true);
    if (this.nombre.trim().length < 2 || !this.emailOk()) return this.error.set('Escribe tu nombre y un email válido.');
    if (!this.acepta) return this.error.set('Tienes que aceptar la política de tratamiento de datos para enviar la solicitud.');
    const tel = this.telefono.trim();
    this.enviando.set(true);
    try {
      await this.cms.voluntario({
        nombre: this.nombre.trim(), email: this.email.trim(), telefono: tel && !tel.startsWith('+') ? '+34 ' + tel : tel,
        disponibilidad: this.dias().filter((d) => this.disponible().has(d)).join(', '),
        roles: ROLES.map((r) => r.id).filter((id) => this.rolesElegidos().has(id)), experiencia: this.experiencia.trim(),
        esMenor: this.esMenor, aceptaPrivacidad: this.acepta,
      });
      this.enviado.set(true);
      setTimeout(() => document.getElementById('apuntate')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'Inténtalo de nuevo en unos minutos.');
    } finally {
      this.enviando.set(false);
    }
  }
}
