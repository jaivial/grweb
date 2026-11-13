import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSelect, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { BoPageHeader, BoToggle, errText } from '../../shared/ui';
import { MODULOS, SistemaApi, fecha, type CompSistema } from './api';

const COPIAR = [
  { k: 'legal', l: 'Textos legales', d: 'Privacidad, términos, bases (como borrador, sin publicar)' },
  { k: 'plantillas', l: 'Plantillas de email', d: 'Las plantillas editadas · revisa las fechas' },
  { k: 'faq', l: 'FAQ y páginas', d: 'Preguntas, páginas, SEO y secciones de la home (como borrador)' },
  { k: 'patrocinadores', l: 'Patrocinadores', d: 'Logos y niveles (sin contratos)' },
  { k: 'roles', l: 'Roles y equipo', d: 'Roles propios y el equipo, cada persona con su rol' },
] as const;
const NUNCA = ['Contactos y consentimientos', 'Entradas y check-ins', 'Boletos y pagos', 'Atletas e intentos'];
const PASOS = ['Datos', 'Clonar contenidos', 'Módulos', 'Equipo'];

/** «Sistema · nueva edición» (Figma 64 · 96:43224): new competition, optionally cloning the structure of another one (never personal data). */
@Component({
  selector: 'bo-sistema-nueva',
  imports: [FormsModule, BoPageHeader, BoToggle, GrAlert, GrButton, GrField, GrIcon, GrInput, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-8 pb-24">
      <bo-page-header title="Nueva competición" [crumbs]="['Sistema', 'Sistema e integraciones', 'Nueva']" />
      @if (!root()) { <gr-alert tone="info" icon="lock" title="Solo Root">Solo la cuenta Root de la plataforma puede crear competiciones.</gr-alert> }
      @else {
        <ol class="flex items-center gap-3 overflow-x-auto [scrollbar-width:none]" aria-label="Pasos">
          @for (p of pasos; track p; let i = $index; let last = $last) {
            <li class="flex shrink-0 items-center gap-3" [class.flex-1]="!last" [attr.aria-current]="i === paso() ? 'step' : null">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-full text-mono-xs"
                [class]="i < paso() ? 'bg-accent text-white' : i === paso() ? 'border border-accent text-accent-text' : 'bg-bg-raised text-text-tertiary'">
                @if (i < paso()) { <gr-icon name="check" [size]="14" /> } @else { {{ i + 1 }} }</span>
              <span class="text-label-m whitespace-nowrap" [class]="i <= paso() ? 'text-text-primary' : 'text-text-tertiary'">{{ p }}</span>
              @if (!last) { <span class="hidden h-px min-w-6 flex-1 md:block" [class]="i < paso() ? 'bg-accent' : 'bg-line-strong'"></span> }
            </li>
          }
        </ol>

        @switch (paso()) {
          @case (0) {
            <section class="max-w-[720px] rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-6 font-semibold">Datos de la edición</h2>
              <div class="mt-5 grid gap-4 sm:grid-cols-2">
                <gr-field label="Copiar de" class="sm:col-span-2" hint="Copia sede, evento, módulos e inscripción. Nunca datos personales.">
                  @if (comps() === null) { <gr-skeleton class="h-10" /> }
                  @else { <gr-select [ngModel]="origenId()" (ngModelChange)="elegirOrigen($event)"><option value="">Ninguna (empezar en blanco)</option>
                    @for (c of comps(); track c.id) { <option [value]="c.id">{{ c.nombre }}{{ c.archivedAt ? ' (archivada)' : '' }}</option> }</gr-select> }
                </gr-field>
                <gr-field label="Nombre" class="sm:col-span-2" [error]="tocado && nombre.trim().length < 2 ? 'Mínimo 2 caracteres' : null"><input grInput [(ngModel)]="nombre" (ngModelChange)="autoSlug()" maxlength="120" placeholder="GR Strength Cup 2027" /></gr-field>
                <gr-field label="Identificador (URL)" class="sm:col-span-2" [error]="tocado && !slugOk() ? 'Minúsculas, números y guiones (2–41)' : null" [hint]="'backoffice/' + (slug || '…') + '/inicio'"><input grInput [(ngModel)]="slug" (ngModelChange)="slugManual = true" maxlength="41" class="font-mono" /></gr-field>
                <gr-field label="Primer día"><input grInput type="date" [(ngModel)]="fechaInicio" /></gr-field>
                <gr-field label="Último día" [error]="fechaFin && fechaInicio && fechaFin < fechaInicio ? 'Antes del primer día' : null"><input grInput type="date" [(ngModel)]="fechaFin" [min]="fechaInicio" /></gr-field>
              </div>
            </section>
          }
          @case (1) {
            <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
              <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                @if (origen(); as o) {
                  <h2 class="text-[20px] leading-6 font-semibold">Copiar de {{ o.nombre }}</h2><p class="mt-1 text-body-xs text-text-tertiary">Estructura y contenidos reutilizables</p>
                  <ul class="mt-4 flex flex-col">
                    @for (x of copiarOpc; track x.k) {
                      <li class="flex items-center gap-4 py-2.5"><div class="min-w-0 flex-1"><p class="text-label-m">{{ x.l }}</p><p class="text-body-xs text-text-tertiary">{{ x.d }}</p></div>
                        <bo-toggle [label]="x.l" [value]="copiar()[x.k]" (changed)="setCopiar(x.k, $event)" /></li>
                    }
                  </ul>
                } @else {
                  <h2 class="text-[20px] leading-6 font-semibold">Empezar en blanco</h2>
                  <p class="mt-2 text-body-s text-text-secondary">No has elegido edición de origen: la competición se crea vacía, con los roles por defecto. Vuelve a «Datos» para copiar de otra.</p>
                }
              </section>
              <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                <h2 class="text-[20px] leading-6 font-semibold">Nunca se copia</h2><p class="mt-1 text-body-xs text-text-tertiary">Datos personales y operativos (RGPD)</p>
                <ul class="mt-4 flex flex-col gap-3">@for (x of nunca; track x) { <li class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="lock" [size]="16" class="text-text-tertiary" />{{ x }}</li> }</ul>
              </section>
            </div>
          }
          @case (2) {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-6 font-semibold">Módulos de la web</h2><p class="mt-1 text-body-xs text-text-tertiary">{{ origen() ? 'Los mismos que ' + origen()!.nombre + '; cámbialos si hace falta.' : 'Puedes cambiarlos después en «Evento y módulos».' }}</p>
              <ul class="mt-4 grid gap-x-8 md:grid-cols-2">
                @for (m of modulosCat; track m.k) {
                  <li class="flex items-center gap-4 border-b border-line-subtle py-2.5"><div class="min-w-0 flex-1"><p class="text-label-m">{{ m.l }}</p><p class="text-body-xs text-text-tertiary">{{ m.d }}</p></div>
                    <bo-toggle [label]="m.l" [value]="!!modulos()[m.k]" (changed)="setModulo(m.k, $event)" /></li>
                }
              </ul>
            </section>
          }
          @case (3) {
            <section class="max-w-[720px] rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-6 font-semibold">Equipo y resumen</h2>
              <dl class="mt-4 flex flex-col gap-3 text-body-s">
                <div class="flex gap-3"><dt class="w-36 shrink-0 text-text-tertiary">Competición</dt><dd>{{ nombre }} · <span class="font-mono text-mono-s">{{ slug }}</span></dd></div>
                <div class="flex gap-3"><dt class="w-36 shrink-0 text-text-tertiary">Fechas</dt><dd>{{ fechaInicio ? fecha(fechaInicio) + (fechaFin && fechaFin !== fechaInicio ? ' – ' + fecha(fechaFin) : '') : 'Sin fecha' }}</dd></div>
                <div class="flex gap-3"><dt class="w-36 shrink-0 text-text-tertiary">Copia de</dt><dd>{{ origen()?.nombre ?? 'Ninguna' }}{{ origen() ? ' · ' + (copiados() || 'solo datos del evento') : '' }}</dd></div>
                <div class="flex gap-3"><dt class="w-36 shrink-0 text-text-tertiary">Módulos</dt><dd>{{ modulosOn() || 'Ninguno' }}</dd></div>
                <div class="flex gap-3"><dt class="w-36 shrink-0 text-text-tertiary">Equipo</dt><dd>{{ origen() && copiar()['roles'] ? 'Tú como Admin y el equipo de ' + origen()!.nombre + (origen()!.miembros ? ' (' + origen()!.miembros + ' personas)' : '') + ' con sus roles' : 'Tú como Admin; invita al resto desde «Equipo y permisos»' }}</dd></div>
              </dl>
              <p class="mt-4 text-body-xs text-text-tertiary">Se crea en borrador: no se ve en la web hasta que cambies su estado en «Evento y módulos».</p>
            </section>
          }
        }

        <div class="flex items-center justify-end gap-2">
          <button grButton variant="ghost" (click)="atras()">{{ paso() === 0 ? 'Cancelar' : 'Atrás' }}</button>
          @if (paso() < 3) { <button grButton variant="primary" [disabled]="paso() === 0 && !datosOk()" (click)="siguiente()">Siguiente: {{ pasos[paso() + 1].toLowerCase() }}</button> }
          @else { <button grButton variant="primary" [loading]="creando()" (click)="crear()">Crear competición</button> }
        </div>
      }
    </div>
  `,
})
export class SistemaNuevaPage {
  private readonly api = inject(SistemaApi);
  private readonly cs = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly pasos = PASOS;
  protected readonly copiarOpc = COPIAR;
  protected readonly nunca = NUNCA;
  protected readonly modulosCat = MODULOS;
  protected readonly fecha = fecha;
  protected readonly root = computed(() => !!this.auth.user()?.root);
  protected readonly paso = signal(0);
  protected readonly comps = signal<CompSistema[] | null>(null);
  protected readonly origenId = signal('');
  protected readonly origen = computed(() => this.comps()?.find((c) => c.id === this.origenId()) ?? null);
  protected readonly copiar = signal<Record<string, boolean>>({ legal: true, plantillas: true, faq: true, patrocinadores: false, roles: true });
  protected readonly modulos = signal<Record<string, boolean>>({});
  protected readonly creando = signal(false);
  protected nombre = '';
  protected slug = '';
  protected slugManual = false;
  protected fechaInicio = '';
  protected fechaFin = '';
  protected tocado = false;

  constructor() {
    void this.api.competiciones().then((l) => {
      this.comps.set(l);
      const actual = l.find((c) => c.id === this.cs.current()?.id) ?? l[0];
      if (actual) this.elegirOrigen(actual.id);
    }).catch(() => this.comps.set([]));
  }
  protected elegirOrigen(id: string): void {
    this.origenId.set(id);
    const o = this.comps()?.find((c) => c.id === id);
    const m: Record<string, boolean> = {};
    for (const x of MODULOS) m[x.k] = o ? !!o.modulos?.[x.k]?.activo : ['entradas', 'atletas', 'horarios', 'resultados'].includes(x.k);
    this.modulos.set(m);
    if (o && !this.nombre) {
      this.nombre = o.nombre.replace(/\d{4}/, (y) => String(+y + 1));
      if (this.nombre === o.nombre) this.nombre = '';
      this.autoSlug();
    }
  }
  protected autoSlug(): void {
    if (this.slugManual) return;
    this.slug = this.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 41);
  }
  protected slugOk(): boolean { return /^[a-z0-9][a-z0-9-]{1,40}$/.test(this.slug); }
  protected datosOk(): boolean { return this.nombre.trim().length >= 2 && this.slugOk() && !(this.fechaFin && this.fechaInicio && this.fechaFin < this.fechaInicio); }
  protected setCopiar(k: string, v: boolean): void { this.copiar.update((c) => ({ ...c, [k]: v })); }
  protected setModulo(k: string, v: boolean): void { this.modulos.update((c) => ({ ...c, [k]: v })); }
  protected copiados(): string { return COPIAR.filter((x) => this.copiar()[x.k]).map((x) => x.l.toLowerCase()).join(', '); }
  protected modulosOn(): string { return MODULOS.filter((m) => this.modulos()[m.k]).map((m) => m.l).join(' · '); }
  protected siguiente(): void {
    this.tocado = true;
    if (this.paso() === 0 && !this.datosOk()) return;
    this.paso.update((p) => p + 1);
  }
  protected atras(): void {
    if (this.paso() === 0) { void this.router.navigate(['../'], { relativeTo: this.route }); return; }
    this.paso.update((p) => p - 1);
  }
  protected async crear(): Promise<void> {
    this.creando.set(true);
    try {
      const o = this.origen();
      const c = await this.api.crear({
        nombre: this.nombre.trim(), slug: this.slug, fechaInicio: this.fechaInicio || undefined, fechaFin: this.fechaFin || undefined, modulos: this.modulos(),
        ...(o ? { clonarDe: o.id, copiar: COPIAR.filter((x) => this.copiar()[x.k]).map((x) => x.k) } : {}),
      });
      await this.cs.load(true);
      this.toasts.success(`«${c.nombre}» creada en borrador`, o ? 'Los contenidos se copian en unos segundos.' : '');
      void this.router.navigate(['/', c.slug, 'inicio']);
    } catch (e) {
      this.toasts.error('No se pudo crear', errText(e));
      this.paso.set(0);
    } finally {
      this.creando.set(false);
    }
  }
}
