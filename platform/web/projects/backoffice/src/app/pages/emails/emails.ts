import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, errText } from '../../shared/ui';
import { ESTADO_MSG, EmailsApi, hace, hora, type Autos, type Contenido, type Mensaje, type PlantillaDetalle, type PlantillaItem, type Render, type Resumen, type Salida } from './api';

type Tab = 'plantillas' | 'salida' | 'automatizaciones';
const FILTROS: { v: string; label: string }[] = [
  { v: '', label: 'Todos' }, { v: 'en_cola', label: 'En cola' }, { v: 'problemas', label: 'Con problemas' }, { v: 'enviado', label: 'Enviados' }, { v: 'omitido', label: 'Omitidos' }, { v: 'cancelado', label: 'Cancelados' },
];

/** «Emails y avisos» (Figma page 62): templates, outbox with retries and the SMTP state, automations. */
@Component({
  selector: 'bo-emails',
  imports: [FormsModule, RouterLink, BoPageHeader, BoDrawer, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = resumen();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Emails y avisos" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Emails y avisos']" />
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Emails">
        @for (t of tabs; track t.v) {
          <a [routerLink]="ruta(t.v)" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null">
            {{ t.label }}
            @if (t.v === 'plantillas' && plantillas()) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ plantillas()!.length }}</span> }
            @if (t.v === 'salida' && r?.enCola) { <span class="rounded-2xs bg-accent-deep/50 px-1.5 text-mono-xs text-accent-text">{{ r!.enCola }}</span> }
            @if (tab() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
          </a>
        }
      </nav>

      @if (r && r.smtp.conocido && !r.smtp.ok) {
        <gr-alert tone="danger" title="El servidor de email no responde">{{ r.smtp.servidor }}: {{ r.smtp.error }}. Los mensajes esperan en la cola y se reintentan solos cada minuto. Revisa el SMTP en Sistema → Integraciones.</gr-alert>
      }

      @switch (tab()) {
        @case ('plantillas') {
          @if (r) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Enviados (7 días)" [value]="n(r.enviados7d)" [delta]="delta(r)" caption="vs. semana pasada" [trend]="r.serie" />
              <gr-kpi label="Entregados" [value]="r.enviados7d ? r.entregados + ' %' : null" caption="objetivo > 98 %" />
              <gr-kpi label="Rebotes" [value]="n(r.rebotes7d)" caption="7 días" />
              <gr-kpi label="En cola" [value]="n(r.enCola)" [caption]="'SMTP ' + r.ritmo + ' / min'" />
            </div>
          }
          @if (plantillas(); as ps) {
            <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              @for (p of ps; track p.clave) {
                <li><a [routerLink]="['/', comps.current()?.slug, 'emails', 'plantillas', p.clave]" class="flex h-full flex-col rounded-lg border bg-bg-card p-3 transition-colors hover:border-line-strong" [class]="p.estado === 'error' ? 'border-accent/70' : 'border-line-subtle'">
                  <span class="relative block h-24 overflow-hidden rounded-md bg-[#f2eeee] p-2" aria-hidden="true">
                    <span class="block h-3 w-full rounded-2xs bg-[#141011]"></span><span class="mt-2 block h-2 w-2/3 rounded-2xs bg-[#c9c1c2]"></span><span class="mt-1.5 block h-2 w-5/6 rounded-2xs bg-[#ddd6d7]"></span>
                    <span class="mt-2 block h-4 w-16 rounded-2xs bg-accent"></span>
                  </span>
                  <span class="mt-3 flex items-start gap-2"><span class="min-w-0 flex-1 text-label-m">{{ p.nombre }}</span>
                    <gr-badge [tone]="p.estado === 'activa' ? 'success' : p.estado === 'error' ? 'danger' : 'warning'">{{ p.estado === 'activa' ? 'Activa' : p.estado === 'error' ? 'Error' : 'Pausada' }}</gr-badge></span>
                  <span class="mt-1 text-body-xs text-text-tertiary">{{ p.disparador }}</span>
                  <span class="mt-auto pt-2 text-body-xs" [class]="p.estado === 'error' ? 'text-accent-text' : 'text-text-tertiary'">{{ p.estado === 'error' ? p.error : 'Enviados ' + n(p.enviados) + ' · fallos ' + p.fallos + (p.personalizada ? ' · personalizada' : '') }}</span>
                </a></li>
              }
            </ul>
          } @else { <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-56 rounded-lg" /> }</div> }
        }

        @case ('salida') {
          @if (r) {
            <div class="flex items-start gap-3 rounded-lg border p-4" [class]="!r.smtp.conocido || r.smtp.ok ? 'border-success/40 bg-success/10' : 'border-accent/50 bg-accent-deep/20'">
              <gr-icon [name]="!r.smtp.conocido || r.smtp.ok ? 'circle-check' : 'circle-x'" [size]="18" [class]="!r.smtp.conocido || r.smtp.ok ? 'text-success' : 'text-accent-text'" />
              <div class="text-body-s"><p class="text-label-s" [class]="!r.smtp.conocido || r.smtp.ok ? 'text-success' : 'text-accent-text'">{{ !r.smtp.conocido ? 'SMTP sin usar todavía' : r.smtp.ok ? 'SMTP operativo' : 'SMTP caído' }} · {{ r.smtp.servidor }}{{ r.smtp.propio ? '' : ' (el del sistema)' }}</p>
                <p class="text-text-secondary">{{ r.smtp.ultimoEnvio ? 'Último envío ' + hace(r.smtp.ultimoEnvio) : 'Sin envíos todavía' }} · cola {{ r.enCola }} · ritmo {{ r.ritmo }}/min</p></div>
            </div>
          }
          <div class="flex flex-wrap items-center gap-2">
            @for (fx of filtros; track fx.v) {
              <button type="button" (click)="estado.set(fx.v); pagina.set(1); cargarSalida()" [attr.aria-pressed]="estado() === fx.v" class="inline-flex h-9 items-center rounded-pill border px-3 text-label-s"
                [class]="estado() === fx.v ? 'border-accent-text bg-accent-deep/40' : 'border-line-strong text-text-secondary'">{{ fx.label }}</button>
            }
            <input class="ml-auto h-9 w-56 rounded-md border border-line-strong bg-bg-field px-3 text-body-s" placeholder="Buscar destinatario" [ngModel]="q()" (ngModelChange)="q.set($event); buscar()" aria-label="Buscar destinatario" />
          </div>
          @if (sel().size) {
            <div class="flex items-center gap-2 rounded-md border border-line-strong bg-bg-raised px-3 py-2 text-body-s">
              <span class="flex-1">{{ sel().size }} seleccionados</span>
              <button grButton size="s" icon="refresh" (click)="bulk('reintentar')">Reintentar</button><button grButton size="s" variant="ghost" (click)="bulk('cancelar')">Cancelar envío</button>
            </div>
          }
          @let s = salida();
          @if (s === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar la bandeja"><button grButton (click)="cargarSalida()">Reintentar</button></gr-empty> }
          @else if (s) {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[860px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="w-10 px-3 py-3"></th><th class="px-3 py-3">Destinatario</th><th class="px-3 py-3">Canal</th><th class="px-3 py-3">Plantilla</th><th class="px-3 py-3">Estado</th><th class="px-3 py-3 text-center">Intentos</th><th class="px-3 py-3">Detalle</th></tr></thead>
                <tbody>
                  @for (m of s.items; track m.id) {
                    <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" (click)="ver(m)">
                      <td class="px-3 py-2.5" (click)="$event.stopPropagation()"><input type="checkbox" class="size-4 accent-[#c42b3e]" [checked]="sel().has(m.id)" (change)="toggle(m.id)" [attr.aria-label]="'Seleccionar ' + m.destino" /></td>
                      <td class="px-3 py-2.5"><p class="truncate">{{ m.destino }}</p>@if (m.prueba) { <p class="text-mono-xs text-text-muted">PRUEBA</p> }</td>
                      <td class="px-3 py-2.5"><gr-badge tone="info">Email</gr-badge></td>
                      <td class="px-3 py-2.5 text-text-secondary">{{ m.nombre || m.plantilla }}</td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="est[m.estado].tone">{{ est[m.estado].label }}</gr-badge></td>
                      <td class="px-3 py-2.5 text-center font-mono">{{ m.intentos }}{{ m.estado === 'reintentando' ? ' / 5' : '' }}</td>
                      <td class="px-3 py-2.5 text-body-xs text-text-tertiary">{{ m.enviadoAt ? hora(m.enviadoAt) + ' · ' : '' }}{{ m.detalle }}{{ m.proximoAt && m.estado === 'reintentando' ? ' · próximo ' + hora(m.proximoAt) : '' }}</td>
                    </tr>
                  } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-text-tertiary">Nada en la bandeja con este filtro.</td></tr> }
                </tbody>
              </table>
            </section>
            <div class="flex items-center justify-between text-body-xs text-text-tertiary">
              <span>{{ s.estados.en_cola ?? 0 }} en cola · {{ s.estados.reintentando ?? 0 }} reintentando · {{ s.estados.rebotado ?? 0 }} rebotados · {{ s.estados.fallido ?? 0 }} fallidos</span>
              <span class="flex gap-1">
                <button grButton size="s" variant="ghost" icon="chevron-left" [disabled]="s.pagina <= 1" (click)="pagina.set(s.pagina - 1); cargarSalida()" aria-label="Anterior"></button>
                <button grButton size="s" variant="ghost" icon="chevron-right" [disabled]="s.pagina * s.por >= s.total" (click)="pagina.set(s.pagina + 1); cargarSalida()" aria-label="Siguiente"></button>
              </span>
            </div>
          } @else { <gr-skeleton class="h-80 rounded-lg" /> }
        }

        @case ('automatizaciones') {
          @let a = autos();
          @if (a) {
            <section class="flex items-center gap-4 rounded-lg border border-line-subtle bg-bg-card p-5">
              <div class="min-w-0 flex-1"><h2 class="text-ui-h5">Global</h2><p class="mt-1 text-label-s">Pausar automatizaciones no esenciales durante el evento</p>
                <p class="text-body-xs text-text-tertiary">{{ fechasEvento() }}: siguen las confirmaciones, los enlaces de acceso y los cambios de horario; el resto sale la mañana siguiente.</p></div>
              <bo-toggle [value]="a.pausarEnEvento" label="Pausar no esenciales durante el evento" (changed)="ajustes($event, a.ritmo)" />
            </section>
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[820px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Automatización</th><th class="px-3 py-3">Canales</th><th class="px-3 py-3">Cuándo</th><th class="px-3 py-3">Público</th><th class="px-3 py-3">7 días</th><th class="px-3 py-3">Estado</th><th class="w-16"></th></tr></thead>
                <tbody>
                  @for (x of a.items; track x.clave) {
                    <tr class="border-b border-line-subtle last:border-0" [class.bg-accent-deep/10]="x.estado === 'error'">
                      <td class="px-4 py-3 text-label-s">{{ x.nombre }}</td>
                      <td class="px-3 py-3">@for (c of x.canales; track c) { <gr-badge tone="info">{{ c === 'email' ? 'Email' : 'WA' }}</gr-badge> }</td>
                      <td class="px-3 py-3 font-mono text-mono-xs text-text-secondary">{{ x.cuando }}</td>
                      <td class="px-3 py-3 text-text-secondary">{{ x.publico }}</td>
                      <td class="px-3 py-3 text-text-tertiary">{{ x.enviados7d }}{{ x.ultimo ? ' · ' + hace(x.ultimo) : '' }}</td>
                      <td class="px-3 py-3"><gr-badge [tone]="x.estado === 'activa' ? 'success' : x.estado === 'error' ? 'danger' : 'neutral'">{{ x.estado === 'activa' ? 'Activa' : x.estado === 'error' ? 'Error' : 'Desactivada' }}</gr-badge></td>
                      <td class="px-3 py-3">@if (x.esencial) { <span class="flex size-11 items-center justify-center text-text-muted" title="Operativa: siempre activa"><gr-icon name="lock" [size]="16" /></span> } @else { <bo-toggle [value]="x.activa" [label]="'Activar ' + x.nombre" (changed)="auto(x.clave, $event)" /> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
            <p class="text-body-xs text-text-tertiary">Recordatorios de entradas (T−7, T−1) y «Resultados y fotos» llegan con las entradas y el directo. WhatsApp, con las campañas.</p>
          } @else { <gr-skeleton class="h-80 rounded-lg" /> }
        }
      }
    </div>

    <bo-drawer [(open)]="verOpen" [title]="msg()?.asunto || msg()?.nombre || 'Mensaje'" [badge]="msg() ? est[msg()!.estado].label : ''">
      @if (msg(); as m) {
        <dl class="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-body-s">
          <dt class="text-text-tertiary">Para</dt><dd class="truncate">{{ m.destino }}</dd>
          <dt class="text-text-tertiary">Plantilla</dt><dd>{{ m.nombre }}</dd>
          <dt class="text-text-tertiary">Creado</dt><dd>{{ hora(m.createdAt) }}</dd>
          <dt class="text-text-tertiary">Intentos</dt><dd>{{ m.intentos }} · {{ m.detalle }}</dd>
          @if (m.proveedorId) { <dt class="text-text-tertiary">Message-ID</dt><dd class="truncate font-mono text-mono-xs">{{ m.proveedorId }}</dd> }
        </dl>
        <p class="mt-4 text-body-xs text-text-tertiary">Los enlaces personales (acceso, pago, baja) no se muestran: son de la persona.</p>
        @if (msgHtml(); as h) { <iframe title="Contenido del email" sandbox="" class="mt-2 h-[560px] w-full rounded-md border border-line-subtle bg-white" [srcdoc]="h"></iframe> }
      }
      <ng-container drawerActions>
        @if (msg()?.estado === 'fallido' || msg()?.estado === 'rebotado' || msg()?.estado === 'omitido') { <button grButton icon="refresh" (click)="bulk('reintentar', [msg()!.id])">Reintentar</button> }
        <button grButton variant="ghost" (click)="verOpen.set(false)">Cerrar</button>
      </ng-container>
    </bo-drawer>
  `,
})
export class EmailsPage {
  private readonly api = inject(EmailsApi);
  private readonly toasts = inject(GrToasts);
  private readonly route = inject(ActivatedRoute);
  private readonly san = inject(DomSanitizer);
  protected readonly comps = inject(Competitions);
  protected readonly est = ESTADO_MSG;
  protected readonly filtros = FILTROS;
  protected readonly hora = hora;
  protected readonly hace = hace;
  protected readonly tabs: { v: Tab; label: string }[] = [{ v: 'plantillas', label: 'Plantillas' }, { v: 'salida', label: 'Bandeja de salida' }, { v: 'automatizaciones', label: 'Automatizaciones' }];
  protected readonly tab = signal<Tab>((this.route.snapshot.data['tab'] as Tab) ?? 'plantillas');
  protected readonly resumen = signal<Resumen | null>(null);
  protected readonly plantillas = signal<PlantillaItem[] | null>(null);
  protected readonly salida = signal<Salida | null | undefined>(undefined);
  protected readonly autos = signal<Autos | null>(null);
  protected readonly estado = signal('');
  protected readonly q = signal('');
  protected readonly pagina = signal(1);
  protected readonly sel = signal(new Set<string>());
  protected readonly verOpen = signal(false);
  protected readonly msg = signal<Mensaje | null>(null);
  protected readonly msgHtml = signal<SafeHtml | null>(null);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly fechasEvento = computed(() => {
    const c = this.comps.current() as { fechaInicio?: string; fechaFin?: string } | null;
    return c?.fechaInicio ? `Días de competición (${c.fechaInicio}${c.fechaFin && c.fechaFin !== c.fechaInicio ? ' a ' + c.fechaFin : ''})` : 'Días de competición';
  });
  private t?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => this.cargarTodo());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo === 'mensaje.estado' || e.tipo === 'smtp.estado') {
        clearTimeout(this.t);
        this.t = setTimeout(() => {
          void this.cargarResumen();
          if (this.tab() === 'salida') void this.cargarSalida();
        }, 800);
      }
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }
  protected ruta(t: Tab): string[] {
    return ['/', this.comps.current()?.slug ?? '', 'emails', ...(t === 'plantillas' ? [] : [t])];
  }
  private cargarTodo(): void {
    void this.cargarResumen();
    if (this.tab() === 'plantillas') void this.api.plantillas(this.cid()).then((p) => this.plantillas.set(p), () => this.plantillas.set([]));
    if (this.tab() === 'salida') void this.cargarSalida();
    if (this.tab() === 'automatizaciones') void this.api.autos(this.cid()).then((a) => this.autos.set(a));
  }
  private async cargarResumen(): Promise<void> {
    try {
      this.resumen.set(await this.api.resumen(this.cid()));
    } catch {
      /* the header stays as it was */
    }
  }
  protected async cargarSalida(): Promise<void> {
    try {
      this.salida.set(await this.api.salida(this.cid(), this.estado(), this.q(), this.pagina()));
    } catch {
      this.salida.set(null);
    }
  }
  protected buscar(): void {
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      this.pagina.set(1);
      void this.cargarSalida();
    }, 300);
  }
  protected n(v: number): string {
    return v.toLocaleString('es-ES');
  }
  protected delta(r: Resumen): string | null {
    const d = r.enviados7d - r.enviadosPrev;
    return d === 0 ? null : (d > 0 ? '+' : '') + d;
  }
  protected toggle(id: string): void {
    const s = new Set(this.sel());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.sel.set(s);
  }
  protected async bulk(accion: 'reintentar' | 'cancelar', ids = [...this.sel()]): Promise<void> {
    try {
      const r = await this.api.bulk(this.cid(), ids, accion);
      this.toasts.success(accion === 'reintentar' ? `${r.afectados} en cola de nuevo` : `${r.afectados} cancelados`);
      this.sel.set(new Set());
      this.verOpen.set(false);
      await this.cargarSalida();
    } catch (e) {
      this.toasts.error('No se pudo', errText(e));
    }
  }
  protected async ver(m: Mensaje): Promise<void> {
    this.msg.set(m);
    this.msgHtml.set(null);
    this.verOpen.set(true);
    try {
      const d = await this.api.mensaje(this.cid(), m.id);
      this.msg.set(d);
      this.msgHtml.set(d.html ? this.san.bypassSecurityTrustHtml(d.html) : null);
    } catch {
      /* details stay */
    }
  }
  protected async auto(clave: string, activa: boolean): Promise<void> {
    try {
      this.autos.set(await this.api.auto(this.cid(), clave, activa));
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
      this.autos.set(await this.api.autos(this.cid()));
    }
  }
  protected async ajustes(pausar: boolean, ritmo: number): Promise<void> {
    try {
      this.autos.set(await this.api.ajustes(this.cid(), pausar, ritmo));
      this.toasts.success(pausar ? 'Se pausarán las no esenciales durante el evento' : 'Las automatizaciones siguen durante el evento');
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
    }
  }
}

/** Template editor (Figma 62 · «Emails · editor»): variables, texts and live preview with sample data. */
@Component({
  selector: 'bo-plantilla-editor',
  imports: [FormsModule, RouterLink, BoPageHeader, BoDrawer, GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = plantilla();
    <div class="mx-auto flex max-w-[1400px] flex-col gap-5 pb-24">
      @if (p === undefined) { <gr-skeleton class="h-16 rounded-md" /><gr-skeleton class="h-[600px] rounded-lg" /> }
      @else if (p === null) { <gr-alert tone="warning" title="Esta plantilla no existe"><a routerLink="../.." class="underline">Volver a las plantillas</a></gr-alert> }
      @else {
        <bo-page-header [title]="p.info.nombre" [subtitle]="p.info.disparador + (p.updatedPor ? ' · editada por ' + p.updatedPor : '')" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Emails y avisos', 'Plantillas']"
          [badge]="p.info.estado === 'error' ? 'Error' : p.info.estado === 'pausada' ? 'Pausada' : sucio() ? 'Sin guardar' : ''" [badgeTone]="p.info.estado === 'error' ? 'danger' : 'warning'">
          <ng-container actions>
            @if (p.info.personalizada) { <button grButton variant="ghost" icon="undo" (click)="restaurar()">Diseño original</button> }
            @if (!p.info.esencial) { <button grButton variant="ghost" (click)="pausar()">{{ p.info.estado === 'pausada' ? 'Reactivar' : 'Pausar' }}</button> }
            <button grButton icon="send" (click)="pruebaOpen.set(true)">Enviar prueba</button>
            <button grButton variant="primary" [loading]="guardando()" [disabled]="!sucio() && p.info.estado !== 'error'" (click)="guardar()">Guardar y activar</button>
          </ng-container>
        </bo-page-header>
        @if (p.info.estado === 'error') { <gr-alert tone="danger" [title]="p.info.error || 'La plantilla tiene un error'">La plantilla está pausada hasta corregirlo; las demás siguen enviándose. Sus mensajes esperan en la cola.</gr-alert> }
        @if (errorVar()) { <gr-alert tone="danger" [title]="errorVar()">Corrígelo antes de guardar: no se enviaría bien.</gr-alert> }
        <div class="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[220px_minmax(0,1fr)_380px]">
          <aside class="h-fit rounded-lg border border-line-subtle bg-bg-card p-3">
            <p class="text-mono-xs text-text-tertiary">VARIABLES</p>
            <ul class="mt-2 flex flex-wrap gap-1.5 xl:flex-col">
              @for (v of p.variables; track v) {
                <li><button type="button" class="w-full rounded-sm border border-line-subtle bg-bg-raised px-2 py-1.5 text-left font-mono text-[12px] leading-4 hover:border-line-strong" (click)="insertar(v)" [title]="'Insertar · ejemplo: ' + (p.ejemplo[v] ?? '')">{{ '{{' + v + '}}' }}</button></li>
              }
            </ul>
            <p class="mt-3 text-body-xs text-text-tertiary">Pulsa para insertar en el último campo. Un párrafo con una variable vacía no se muestra.</p>
          </aside>
          <section class="flex min-w-0 flex-col rounded-lg border border-line-subtle bg-bg-card">
            <header class="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2">
              @for (v of vistas; track v.v) { <button type="button" class="h-9 rounded-sm px-3 text-label-s" [class]="vista() === v.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'" (click)="vista.set(v.v)">{{ v.label }}</button> }
              <span class="flex-1"></span>
              <button type="button" class="flex size-9 items-center justify-center rounded-sm" [class]="ancho() === 600 ? 'bg-bg-raised' : 'text-text-tertiary'" aria-label="Escritorio" (click)="ancho.set(600)"><gr-icon name="layout" [size]="16" /></button>
              <button type="button" class="flex size-9 items-center justify-center rounded-sm" [class]="ancho() === 375 ? 'bg-bg-raised' : 'text-text-tertiary'" aria-label="Móvil" (click)="ancho.set(375)"><gr-icon name="smartphone" [size]="16" /></button>
            </header>
            <div class="flex min-h-[640px] flex-1 justify-center bg-[#2a2426] p-4">
              @switch (vista()) {
                @case ('previa') { @if (html(); as h) { <iframe title="Vista previa" sandbox="" class="h-[640px] rounded-md bg-white transition-[width]" [style.width.px]="ancho()" [srcdoc]="h"></iframe> } }
                @case ('html') { <pre class="h-[640px] w-full overflow-auto rounded-md bg-bg-deep p-3 font-mono text-mono-xs whitespace-pre-wrap text-text-secondary">{{ render()?.html }}</pre> }
                @case ('texto') { <pre class="h-[640px] w-full overflow-auto rounded-md bg-bg-deep p-4 font-mono text-body-s whitespace-pre-wrap text-text-secondary">{{ render()?.texto }}</pre> }
              }
            </div>
            <p class="border-t border-line-subtle px-4 py-2 text-body-xs text-text-tertiary">Asunto: <span class="text-text-secondary">{{ render()?.asunto }}</span> · datos de ejemplo</p>
          </section>
          <aside class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-4">
            <gr-field label="Asunto" for="e-as"><input grInput id="e-as" maxlength="160" [(ngModel)]="c.asunto" (ngModelChange)="cambio()" (focus)="campo = 'asunto'" /></gr-field>
            <gr-field label="Texto de previsualización" for="e-pre"><input grInput id="e-pre" maxlength="160" [(ngModel)]="c.preheader" (ngModelChange)="cambio()" (focus)="campo = 'preheader'" /></gr-field>
            <gr-field label="Título" for="e-ti"><input grInput id="e-ti" maxlength="120" [(ngModel)]="c.titulo" (ngModelChange)="cambio()" (focus)="campo = 'titulo'" /></gr-field>
            <gr-field label="Texto (una línea en blanco separa párrafos · **negrita**)" for="e-cu"><textarea grInput id="e-cu" rows="10" maxlength="4000" [(ngModel)]="c.cuerpo" (ngModelChange)="cambio()" (focus)="campo = 'cuerpo'"></textarea></gr-field>
            <div class="grid grid-cols-2 gap-2">
              <gr-field label="Botón" for="e-bt"><input grInput id="e-bt" maxlength="40" [(ngModel)]="c.botonTexto" (ngModelChange)="cambio()" (focus)="campo = 'botonTexto'" /></gr-field>
              <gr-field label="Enlace del botón" for="e-bu"><input grInput id="e-bu" maxlength="300" [(ngModel)]="c.botonUrl" (ngModelChange)="cambio()" (focus)="campo = 'botonUrl'" /></gr-field>
            </div>
            <gr-field label="Pie" for="e-pie"><textarea grInput id="e-pie" rows="3" maxlength="400" [(ngModel)]="c.pie" (ngModelChange)="cambio()" (focus)="campo = 'pie'"></textarea></gr-field>
          </aside>
        </div>
      }
    </div>
    <bo-drawer [(open)]="pruebaOpen" title="Enviar prueba">
      <div class="flex flex-col gap-3">
        <gr-field label="Enviar a" for="pr-d"><input grInput id="pr-d" type="email" [(ngModel)]="destino" /></gr-field>
        <p class="text-body-xs text-text-tertiary">Con los datos de ejemplo y el asunto marcado como «[Prueba]». Se envía el diseño guardado.</p>
      </div>
      <ng-container drawerActions><button grButton variant="ghost" (click)="pruebaOpen.set(false)">Cancelar</button><button grButton variant="primary" [loading]="enviando()" (click)="prueba()">Enviar</button></ng-container>
    </bo-drawer>
  `,
})
export class PlantillaEditorPage {
  private readonly api = inject(EmailsApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly san = inject(DomSanitizer);
  protected readonly comps = inject(Competitions);
  protected readonly vistas = [{ v: 'previa' as const, label: 'Vista previa' }, { v: 'html' as const, label: 'HTML' }, { v: 'texto' as const, label: 'Texto' }];
  protected readonly plantilla = signal<PlantillaDetalle | null | undefined>(undefined);
  protected readonly render = signal<Render | null>(null);
  protected readonly html = signal<SafeHtml | null>(null);
  protected readonly vista = signal<'previa' | 'html' | 'texto'>('previa');
  protected readonly ancho = signal(600);
  protected readonly sucio = signal(false);
  protected readonly errorVar = signal('');
  protected readonly guardando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly pruebaOpen = signal(false);
  protected c: Contenido = { asunto: '', preheader: '', titulo: '', cuerpo: '', botonTexto: '', botonUrl: '', pie: '' };
  protected campo: keyof Contenido = 'cuerpo';
  protected destino = '';
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  private t?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destino = this.auth.user()?.email ?? '';
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
  }
  private async cargar(): Promise<void> {
    try {
      this.set(await this.api.plantilla(this.cid(), this.route.snapshot.paramMap.get('clave') ?? ''));
    } catch {
      this.plantilla.set(null);
    }
  }
  private set(p: PlantillaDetalle): void {
    this.plantilla.set(p);
    this.c = { asunto: p.asunto, preheader: p.preheader, titulo: p.titulo, cuerpo: p.cuerpo, botonTexto: p.botonTexto, botonUrl: p.botonUrl, pie: p.pie };
    this.sucio.set(false);
    void this.previsualizar();
  }
  protected cambio(): void {
    this.sucio.set(true);
    clearTimeout(this.t);
    this.t = setTimeout(() => void this.previsualizar(), 350);
  }
  private async previsualizar(): Promise<void> {
    const p = this.plantilla();
    if (!p) return;
    try {
      const r = await this.api.previsualizar(this.cid(), p.info.clave, this.c);
      this.render.set(r);
      this.html.set(this.san.bypassSecurityTrustHtml(r.html));
      this.errorVar.set('');
    } catch (e) {
      this.errorVar.set(errText(e, 'La plantilla tiene un error.'));
    }
  }
  protected insertar(v: string): void {
    this.c = { ...this.c, [this.campo]: (this.c[this.campo] ?? '') + `{{${v}}}` };
    this.cambio();
  }
  protected async guardar(): Promise<void> {
    const p = this.plantilla();
    if (!p) return;
    this.guardando.set(true);
    try {
      this.set(await this.api.guardar(this.cid(), p, this.c));
      this.toasts.success('Plantilla guardada y activa', 'Los próximos emails salen con este diseño.');
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async restaurar(): Promise<void> {
    const p = this.plantilla();
    if (!p || !(await this.confirm.ask({ title: 'Volver al diseño original', text: 'Se pierden tus cambios en esta plantilla.', confirm: 'Restaurar' }))) return;
    try {
      this.set(await this.api.restaurar(this.cid(), p.info.clave));
    } catch (e) {
      this.toasts.error('No se pudo restaurar', errText(e));
    }
  }
  protected async pausar(): Promise<void> {
    const p = this.plantilla();
    if (!p) return;
    try {
      this.set(await this.api.estado(this.cid(), p.info.clave, p.info.estado === 'pausada' ? 'activa' : 'pausada'));
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
    }
  }
  protected async prueba(): Promise<void> {
    const p = this.plantilla();
    if (!p) return;
    this.enviando.set(true);
    try {
      await this.api.prueba(this.cid(), p.info.clave, this.destino);
      this.pruebaOpen.set(false);
      this.toasts.success('Prueba en cola', 'Llegará en unos segundos. Puedes seguirla en la bandeja de salida.');
    } catch (e) {
      this.toasts.error('No se pudo enviar', errText(e));
    } finally {
      this.enviando.set(false);
    }
  }
  protected volver(): void {
    void this.router.navigate(['../..'], { relativeTo: this.route });
  }
}
