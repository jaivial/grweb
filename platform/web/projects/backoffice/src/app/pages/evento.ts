import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer as DomSanitizerRef } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrField, GrIcon, GrInput, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../core/api';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { BoPageHeader, BoToggle, Media, errText } from '../shared/ui';

interface Sede { nombre: string; direccion: string; cp: string; ciudad: string; provincia: string; lat?: number | null; lng?: number | null; mapsUrl: string }
interface Evento { descripcion: string; nivel: string; organizador: string; emailContacto: string; telefono: string; puertas: string; aforoPabellon: number; instagram: string; web: string }
interface Modulo { activo: boolean; bloqueado: boolean; motivo?: string }
interface Inscripcion { modo: 'externa' | 'cerrada'; url: string; estado: 'proximamente' | 'abierta' | 'completa' | 'cerrada'; plazas?: number; responsable: { nombre: string; email: string }; nota: string }
interface ComoLlegar { tipo: string; titulo: string; detalle: string; estado: 'confirmado' | 'por_confirmar' }
interface Comp {
  id: string; slug: string; nombre: string; nombreCorto: string; edicion: number; estado: string; fechaInicio?: string; fechaFin?: string; zonaHoraria: string; sede: Sede; evento: Evento;
  modulos: Record<string, Modulo>; inscripcion: Inscripcion; comoLlegar: ComoLlegar[]; logoUrl: string; version: number;
}
interface ModItem extends Modulo { clave: string; nombre: string; descripcion: string }
interface EstadoInfo { estado: string; programados: { id: string; estado: string; en: string }[] }
type Tab = 'datos' | 'estado' | 'modulos' | 'inscripcion' | 'llegar';

const ESTADOS = [
  { v: 'proximamente', l: 'Próximamente', d: 'Cuenta atrás + «Avísame» (newsletter)' }, { v: 'inscripciones', l: 'Inscripciones abiertas', d: 'CTA a la inscripción de la AEP' },
  { v: 'completas', l: 'Inscripciones completas · campaña', d: 'CTA «Reserva tu entrada gratis»' }, { v: 'hoy', l: 'Hoy se compite', d: 'Directo, horarios y mapa de acceso' },
  { v: 'finalizado', l: 'Finalizado', d: 'Resultados, galería y «Nos vemos en…»' },
];
const TRANSPORTES = ['coche', 'parking', 'bus', 'tren', 'metro', 'bici', 'avion', 'otro'];

/** «Evento y módulos» (Figma page 53): event data with a live preview, web state (with scheduled changes), modules, AEP registration and how to get there. */
@Component({
  selector: 'bo-evento',
  imports: [FormsModule, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = comp();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-28">
      <bo-page-header title="Evento y módulos" subtitle="Lo que ve el público en la home, /como-llegar y los emails" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Evento y módulos']">
        <ng-container actions><a grButton icon="external-link" [href]="web" target="_blank" rel="noopener">Ver en la web</a></ng-container>
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Evento">
        @for (t of tabs; track t.v) {
          <button type="button" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null" (click)="ir(t.v)">
            {{ t.l }}@if (t.v === 'modulos' && mods().length) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ activos() }}</span> }
            @if (tab() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }</button>
        }
      </nav>
      @if (!c) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else {
        @if (errores().length) { <gr-alert tone="danger" [title]="'Revisa ' + errores().length + ' campos antes de guardar'">{{ errores().join(' · ') }}</gr-alert> }
        @switch (tab()) {
          @case ('datos') {
            <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div class="flex flex-col gap-5">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><h2 class="text-ui-h5">Identidad</h2><p class="text-body-xs text-text-tertiary">Nombre e imagen tal y como aparecen en el cartel</p>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <gr-field label="Nombre público"><input grInput [(ngModel)]="d.nombre" (ngModelChange)="tocar()" maxlength="120" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Slug (URL)" hint="No se puede cambiar: rompería enlaces y QR"><input grInput [value]="c.slug" disabled /></gr-field>
                    <gr-field label="Nivel"><input grInput [(ngModel)]="d.evento.nivel" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Edición"><input grInput type="number" min="1" [(ngModel)]="d.edicion" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Nombre corto" hint="Pestañas y emails"><input grInput [(ngModel)]="d.nombreCorto" (ngModelChange)="tocar()" maxlength="40" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Logo (URL)"><div class="flex gap-2"><input grInput class="flex-1" [(ngModel)]="d.logoUrl" (ngModelChange)="tocar()" [disabled]="!puede()" />
                      <label class="flex h-10 cursor-pointer items-center rounded-md border border-line-strong px-3 text-label-s hover:bg-bg-raised"><gr-icon name="camera" [size]="14" /><input type="file" accept="image/*" class="sr-only" (change)="subirLogo($event)" [disabled]="!puede()" /></label></div></gr-field>
                    <gr-field label="Descripción" class="sm:col-span-2"><textarea grInput rows="2" [(ngModel)]="d.evento.descripcion" (ngModelChange)="tocar()" [disabled]="!puede()"></textarea></gr-field>
                  </div></section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><h2 class="text-ui-h5">Fecha y horario</h2><p class="text-body-xs text-text-tertiary">Se usa en la cuenta atrás, el calendario .ics y los recordatorios</p>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <gr-field label="Día 1"><input grInput type="date" [(ngModel)]="d.fechaInicio" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Día 2" [error]="err('fechaFin')"><input grInput type="date" [(ngModel)]="d.fechaFin" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Apertura de puertas"><input grInput type="time" [(ngModel)]="d.evento.puertas" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Zona horaria"><input grInput [(ngModel)]="d.zonaHoraria" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                  </div></section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><h2 class="text-ui-h5">Sede</h2><p class="text-body-xs text-text-tertiary">Dirección y aforo del pabellón (también en /como-llegar)</p>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <gr-field label="Pabellón" class="sm:col-span-2"><input grInput [(ngModel)]="d.sede.nombre" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Dirección" class="sm:col-span-2"><input grInput [(ngModel)]="d.sede.direccion" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Código postal"><input grInput [(ngModel)]="d.sede.cp" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Ciudad"><input grInput [(ngModel)]="d.sede.ciudad" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Aforo del pabellón" [error]="err('aforo')"><input grInput type="number" min="0" [(ngModel)]="d.evento.aforoPabellon" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Coordenadas (lat, lng)"><input grInput [ngModel]="coords()" (ngModelChange)="setCoords($event)" placeholder="39.3253, -0.4127" [disabled]="!puede()" /></gr-field>
                  </div></section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><h2 class="text-ui-h5">Contacto</h2>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <gr-field label="Email público"><input grInput type="email" [(ngModel)]="d.evento.emailContacto" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Teléfono"><input grInput [(ngModel)]="d.evento.telefono" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Instagram"><input grInput [(ngModel)]="d.evento.instagram" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Web de la AEP"><input grInput [(ngModel)]="d.evento.web" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Organiza"><input grInput [(ngModel)]="d.evento.organizador" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                  </div></section>
              </div>
              <aside class="flex h-fit flex-col gap-4 lg:sticky lg:top-20">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-label-s">Vista previa</p><p class="text-body-xs text-text-tertiary">Home pública con los datos sin guardar</p>
                  <div class="mt-3 overflow-hidden rounded-md border border-line-strong bg-[radial-gradient(60%_80%_at_50%_20%,#4a121c,#141012)] p-5 text-center">
                    <p class="text-mono-xs text-text-tertiary uppercase">{{ d.evento.nivel }}</p>
                    <p class="mt-2 font-display text-[28px] leading-none uppercase italic">{{ d.nombre }}</p>
                    <p class="mt-2 text-body-xs text-text-secondary">{{ rango() }} · {{ d.sede.ciudad }}</p>
                    <span class="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-label-s text-white">Reserva tu entrada gratis</span>
                  </div>
                  <dl class="mt-3 flex flex-col gap-1.5 text-body-xs"><div class="flex justify-between"><dt class="text-text-tertiary">Sede</dt><dd>{{ d.sede.nombre || '—' }}</dd></div><div class="flex justify-between"><dt class="text-text-tertiary">Puertas</dt><dd>{{ d.evento.puertas || '—' }}</dd></div></dl>
                </section>
                <gr-alert tone="info" title="Decisiones de diseño">Los cambios no son públicos hasta guardar; se guardan con control de versión (otra persona no los pisa). El slug es de solo lectura.</gr-alert>
              </aside>
            </div>
          }
          @case ('estado') {
            <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><h2 class="text-ui-h5">Estado actual de la web</h2><p class="text-body-xs text-text-tertiary">Afecta al hero, la cabecera, el CTA de la navbar y el orden de secciones</p>
                <div class="mt-4 grid gap-2 sm:grid-cols-2">
                  @for (e of estados; track e.v) {
                    <button type="button" class="flex items-start gap-3 rounded-md border p-3 text-left" [class]="est()?.estado === e.v ? 'border-accent bg-accent-deep/30' : 'border-line-subtle hover:border-line-strong'" [disabled]="!puede()" (click)="cambiarEstado(e.v)">
                      <span class="mt-0.5 size-4 shrink-0 rounded-pill border-2" [class]="est()?.estado === e.v ? 'border-accent bg-accent' : 'border-line-strong'"></span>
                      <span><span class="block text-label-s">{{ e.l }}</span><span class="block text-body-xs text-text-tertiary">{{ e.d }}</span></span></button>
                  }
                </div>
                <h3 class="mt-6 text-label-m">Cambio programado</h3><p class="text-body-xs text-text-tertiary">Pasa a otro estado a una hora (zona {{ c.zonaHoraria }})</p>
                @for (p of est()?.programados ?? []; track p.id) {
                  <div class="mt-2 flex items-center gap-3 rounded-md bg-bg-raised px-3 py-2 text-body-s"><gr-icon name="clock" [size]="14" /><span class="flex-1">Pasar a «{{ nombreEstado(p.estado) }}» el {{ fechaHora(p.en) }}</span>@if (puede()) { <button type="button" class="text-label-s text-accent-text" (click)="cancelarProgramado(p.id)">Cancelar</button> }</div>
                }
                @if (puede()) {
                  <div class="mt-3 flex flex-wrap items-end gap-2">
                    <gr-field label="Estado"><select grInput [(ngModel)]="prog.estado">@for (e of estados; track e.v) { <option [value]="e.v">{{ e.l }}</option> }</select></gr-field>
                    <gr-field label="Cuándo"><input grInput type="datetime-local" [(ngModel)]="prog.en" /></gr-field>
                    <button grButton (click)="programar()" [disabled]="!prog.en">Programar</button>
                  </div>
                }
              </section>
              <gr-alert tone="info" title="Qué cambia en la web al pasar a «Hoy se compite»">Navbar: CTA «Ver directo» · Hero: estado «en directo» · Home: Directo y Horarios suben arriba · Emails de recordatorio se pausan.</gr-alert>
            </div>
          }
          @case ('modulos') {
            <section class="grid gap-3 md:grid-cols-2">
              @for (m of mods(); track m.clave) {
                <div class="flex items-center gap-3 rounded-lg border border-line-subtle bg-bg-card p-4" [class.opacity-60]="m.bloqueado">
                  <div class="min-w-0 flex-1"><p class="text-label-s">{{ m.nombre }}</p><p class="text-body-xs text-text-tertiary">{{ m.bloqueado ? (m.motivo || 'Bloqueado') : m.descripcion }}</p></div>
                  @if (m.bloqueado) { <gr-badge tone="warning">Bloqueado</gr-badge> }
                  <bo-toggle [value]="m.activo" [label]="m.nombre" [disabled]="!puede() || m.bloqueado" (changed)="modulo(m, $event)" />
                </div>
              }
            </section>
            @if (bloqueoSorteo(); as m) { <gr-alert tone="warning" title="Sorteo de pago pendiente de asesoría">{{ m.motivo }} · Completa la checklist en Sorteo › Configuración para poder activarlo.</gr-alert> }
          }
          @case ('inscripcion') {
            <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><h2 class="text-ui-h5">Estado de la inscripción</h2><p class="text-body-xs text-text-tertiary">Se muestra en la sección «Inscripciones» y en /inscripcion</p>
                <div class="mt-4 flex gap-1 rounded-md border border-line-strong p-1">@for (e of estadosInsc; track e.v) { <button type="button" class="h-9 flex-1 rounded-sm text-label-s" [class]="d.inscripcion.estado === e.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'" [disabled]="!puede()" (click)="d.inscripcion.estado = e.v; tocar()">{{ e.l }}</button> }</div>
                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                  <gr-field label="Plazas de atletas (cupo AEP)"><input grInput type="number" min="0" [(ngModel)]="d.inscripcion.plazas" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                  <gr-field label="Modo"><select grInput [(ngModel)]="d.inscripcion.modo" (ngModelChange)="tocar()" [disabled]="!puede()"><option value="externa">Inscripción en la web de la AEP</option><option value="cerrada">Sin inscripción</option></select></gr-field>
                  <gr-field label="URL de inscripción AEP" class="sm:col-span-2" [error]="err('url')"><input grInput [(ngModel)]="d.inscripcion.url" (ngModelChange)="tocar()" placeholder="https://aep-powerlifting.com/…" [disabled]="!puede()" /></gr-field>
                  <gr-field label="Responsable"><input grInput [(ngModel)]="d.inscripcion.responsable.nombre" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                  <gr-field label="Email de dudas"><input grInput type="email" [(ngModel)]="d.inscripcion.responsable.email" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                  <gr-field label="Nota interna" class="sm:col-span-2"><input grInput [(ngModel)]="d.inscripcion.nota" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field>
                </div></section>
              <aside class="flex flex-col gap-3"><section class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-label-s">Así se ve en la home</p>
                <div class="mt-3 rounded-md border border-line-strong bg-[#1b1112] p-4"><gr-badge [tone]="d.inscripcion.estado === 'abierta' ? 'success' : 'neutral'">{{ nombreInsc(d.inscripcion.estado) }}</gr-badge>
                  <p class="mt-2 font-display text-[22px] uppercase italic">{{ d.inscripcion.plazas || '—' }} atletas</p><p class="text-body-xs text-text-tertiary">{{ d.inscripcion.estado === 'completa' ? 'Ven a verlo: la entrada es gratis' : 'Inscripción a través de la AEP' }}</p></div></section>
                <gr-alert tone="info" title="Inscripción propia con pago">Se configura en Atletas › Inscripción (cupones, referidos y pasarela).</gr-alert></aside>
            </div>
          }
          @case ('llegar') {
            <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section class="flex flex-col gap-3">
                @for (x of d.comoLlegar; track $index; let i = $index) {
                  <div class="rounded-lg border border-line-subtle bg-bg-card p-4">
                    <div class="flex flex-wrap items-center gap-2"><select class="h-9 rounded-md border border-line-strong bg-bg-field px-2 text-label-s" [(ngModel)]="x.tipo" (ngModelChange)="tocar()" [disabled]="!puede()">@for (t of transportes; track t) { <option [value]="t">{{ t }}</option> }</select>
                      <input grInput class="min-w-0 flex-1" [(ngModel)]="x.titulo" (ngModelChange)="tocar()" placeholder="Título" [disabled]="!puede()" />
                      <button type="button" class="h-9 rounded-sm px-2 text-mono-xs uppercase" [class]="x.estado === 'confirmado' ? 'text-success' : 'text-warning'" (click)="x.estado = x.estado === 'confirmado' ? 'por_confirmar' : 'confirmado'; tocar()" [disabled]="!puede()">{{ x.estado === 'confirmado' ? 'Confirmado' : 'Por confirmar' }}</button>
                      @if (puede()) { <button type="button" class="flex size-9 items-center justify-center rounded-sm text-accent-text hover:bg-bg-raised" (click)="quitarTransporte(i)" aria-label="Quitar"><gr-icon name="trash" [size]="14" /></button> }</div>
                    <textarea grInput rows="2" class="mt-2" [(ngModel)]="x.detalle" (ngModelChange)="tocar()" [disabled]="!puede()"></textarea>
                  </div>
                }
                @if (puede()) { <button grButton icon="plus" class="self-start" (click)="anadirTransporte()">Añadir medio de transporte</button> }
              </section>
              <section class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-label-s">Ubicación</p><p class="text-body-xs text-text-tertiary">Coordenadas del punto de entrada principal</p>
                @if (d.sede.lat && d.sede.lng) { <iframe [title]="'Mapa ' + d.sede.nombre" class="mt-3 h-56 w-full rounded-md border-0" [src]="mapa()" loading="lazy"></iframe> }
                <div class="mt-3 grid grid-cols-2 gap-2"><gr-field label="Latitud"><input grInput type="number" step="0.0001" [(ngModel)]="d.sede.lat" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field><gr-field label="Longitud"><input grInput type="number" step="0.0001" [(ngModel)]="d.sede.lng" (ngModelChange)="tocar()" [disabled]="!puede()" /></gr-field></div>
              </section>
            </div>
          }
        }
      }
    </div>
    @if (cambios() && puede()) {
      <div class="fixed inset-x-0 bottom-0 z-40 border-t border-line-strong bg-bg-raised/95 px-4 py-3 backdrop-blur md:left-[264px]">
        <div class="mx-auto flex max-w-[1280px] items-center gap-3"><gr-icon name="pencil" [size]="16" class="text-warning" /><p class="flex-1 text-body-s">Tienes cambios sin guardar</p>
          <button grButton variant="ghost" (click)="descartar()">Descartar</button><button grButton variant="primary" [loading]="guardando()" (click)="guardar()">Guardar cambios</button></div>
      </div>
    }
  `,
})
export class EventoPage {
  private readonly http = inject(HttpClient);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly media = inject(Media);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly san = inject(DomSanitizerRef);
  protected readonly tabs: { v: Tab; l: string }[] = [{ v: 'datos', l: 'Datos' }, { v: 'estado', l: 'Estado del evento' }, { v: 'modulos', l: 'Módulos' }, { v: 'inscripcion', l: 'Inscripción AEP' }, { v: 'llegar', l: 'Cómo llegar' }];
  protected readonly estados = ESTADOS;
  protected readonly estadosInsc = [{ v: 'proximamente' as const, l: 'Próximamente' }, { v: 'abierta' as const, l: 'Abiertas' }, { v: 'completa' as const, l: 'Completas' }, { v: 'cerrada' as const, l: 'Cerradas' }];
  protected readonly transportes = TRANSPORTES;
  protected readonly web = 'https://grcup-qa.menustudioai.com/';
  protected readonly comp = signal<Comp | null>(null);
  protected readonly mods = signal<ModItem[]>([]);
  protected readonly est = signal<EstadoInfo | null>(null);
  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || 'datos');
  protected readonly cambios = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<string[]>([]);
  protected d!: Comp;
  protected prog = { estado: 'hoy', en: '' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'evento.editar'));
  protected readonly activos = computed(() => this.mods().filter((m) => m.activo).length);
  protected readonly bloqueoSorteo = computed(() => this.mods().find((m) => m.clave === 'sorteo' && m.bloqueado));

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
  }
  private b(): string { return `/api/admin/competiciones/${this.cid()}`; }
  async cargar(): Promise<void> {
    const [c, m, e] = await Promise.all([
      firstValueFrom(this.http.get<Comp>(this.b())), firstValueFrom(this.http.get<ModItem[]>(`${this.b()}/modulos`)), firstValueFrom(this.http.get<EstadoInfo>(`${this.b()}/estado`)),
    ]);
    this.aplicar(c);
    this.mods.set(m);
    this.est.set(e);
  }
  private aplicar(c: Comp): void {
    this.comp.set(c);
    this.d = structuredClone(c);
    this.d.inscripcion.responsable ??= { nombre: '', email: '' };
    this.d.comoLlegar ??= [];
    this.cambios.set(false);
    this.errores.set([]);
  }
  protected ir(t: Tab): void {
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
  }
  protected tocar(): void { this.cambios.set(true); }
  protected descartar(): void { const c = this.comp(); if (c) this.aplicar(c); }
  protected coords(): string { return this.d.sede.lat != null && this.d.sede.lng != null ? `${this.d.sede.lat}, ${this.d.sede.lng}` : ''; }
  protected setCoords(v: string): void {
    const [a, b] = v.split(',').map((x) => parseFloat(x.trim()));
    if (!isNaN(a) && !isNaN(b)) { this.d.sede.lat = a; this.d.sede.lng = b; this.tocar(); }
  }
  protected mapa() {
    const { lat, lng } = this.d.sede;
    return this.san.bypassSecurityTrustResourceUrl(`https://www.openstreetmap.org/export/embed.html?bbox=${lng! - 0.006},${lat! - 0.004},${lng! + 0.006},${lat! + 0.004}&marker=${lat},${lng}`);
  }
  protected rango(): string {
    const f = (s?: string) => (s ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z')) : '');
    return this.d.fechaInicio ? f(this.d.fechaInicio) + (this.d.fechaFin && this.d.fechaFin !== this.d.fechaInicio ? '–' + f(this.d.fechaFin) : '') : 'Fecha por confirmar';
  }
  protected err(campo: string): string {
    if (campo === 'fechaFin' && this.d.fechaFin && this.d.fechaInicio && this.d.fechaFin < this.d.fechaInicio) return 'Debe ser posterior al día 1';
    if (campo === 'aforo' && this.d.evento.aforoPabellon < 0) return 'No puede ser negativo';
    if (campo === 'url' && this.d.inscripcion.url && !/^https:\/\//.test(this.d.inscripcion.url)) return 'Debe empezar por https://';
    return '';
  }
  protected nombreEstado(v: string): string { return ESTADOS.find((e) => e.v === v)?.l ?? v; }
  protected nombreInsc(v: string): string { return this.estadosInsc.find((e) => e.v === v)?.l ?? v; }
  protected fechaHora(iso: string): string { return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)); }
  protected anadirTransporte(): void { this.d.comoLlegar.push({ tipo: 'coche', titulo: '', detalle: '', estado: 'por_confirmar' }); this.tocar(); }
  protected quitarTransporte(i: number): void { this.d.comoLlegar.splice(i, 1); this.tocar(); }
  protected async subirLogo(ev: Event): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { this.d.logoUrl = await this.media.upload(f, 'Logo'); this.tocar(); } catch (e) { this.toasts.error(errText(e, 'No se pudo subir.')); }
  }

  protected async guardar(): Promise<void> {
    const errs = ['fechaFin', 'aforo', 'url'].map((x) => this.err(x)).filter(Boolean);
    this.errores.set(errs);
    if (errs.length) return;
    const c = this.comp()!;
    this.guardando.set(true);
    try {
      let v = c.version;
      const put = async (path: string, body: unknown) => {
        const r = await firstValueFrom(this.http.put<Comp>(`${this.b()}/${path}`, body, { headers: new HttpHeaders({ 'If-Match': `W/"${v}"` }) }));
        v = r.version;
        return r;
      };
      let r = await put('evento-config', { nombre: this.d.nombre, nombreCorto: this.d.nombreCorto, edicion: this.d.edicion, fechaInicio: this.d.fechaInicio || undefined, fechaFin: this.d.fechaFin || undefined,
        zonaHoraria: this.d.zonaHoraria, sede: this.d.sede, evento: this.d.evento, logoUrl: this.d.logoUrl });
      if (JSON.stringify(c.inscripcion) !== JSON.stringify(this.d.inscripcion)) r = await put('inscripcion', this.d.inscripcion);
      if (JSON.stringify(c.comoLlegar) !== JSON.stringify(this.d.comoLlegar)) r = await put('como-llegar', this.d.comoLlegar);
      this.aplicar(r);
      void this.comps.load(true);
      this.toasts.success('Cambios guardados');
    } catch (e) {
      const p = problemOf(e);
      this.toasts.error(p.code === 'CONFLICTO_EDICION' || p.status === 412 ? 'Otra persona ha guardado antes: copia tus cambios y recarga.' : errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async cambiarEstado(v: string): Promise<void> {
    try { this.est.set(await firstValueFrom(this.http.put<EstadoInfo>(`${this.b()}/estado`, { estado: v }))); this.toasts.success('Estado: ' + this.nombreEstado(v)); void this.comps.load(true); }
    catch (e) { this.toasts.error(errText(e, 'No se pudo cambiar el estado.')); }
  }
  protected async programar(): Promise<void> {
    try { this.est.set(await firstValueFrom(this.http.put<EstadoInfo>(`${this.b()}/estado`, { estado: this.prog.estado, programarEn: new Date(this.prog.en).toISOString() }))); this.prog.en = ''; }
    catch (e) { this.toasts.error(errText(e, 'No se pudo programar.')); }
  }
  protected async cancelarProgramado(id: string): Promise<void> {
    try { await firstValueFrom(this.http.delete(`${this.b()}/estado/programados/${id}`)); this.est.set(await firstValueFrom(this.http.get<EstadoInfo>(`${this.b()}/estado`))); }
    catch (e) { this.toasts.error(errText(e, 'No se pudo cancelar.')); }
  }
  protected async modulo(m: ModItem, activo: boolean): Promise<void> {
    try {
      await firstValueFrom(this.http.put(`${this.b()}/modulos/${m.clave}`, { activo }));
      this.mods.set(await firstValueFrom(this.http.get<ModItem[]>(`${this.b()}/modulos`)));
      this.toasts.success(`${m.nombre}: ${activo ? 'activo' : 'desactivado'}`);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar el módulo.'));
      this.mods.set([...this.mods()]);
    }
  }
}
