import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrErrorState, GrField, GrIcon, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { BoDrawer, BoPageHeader, BoTabs, Confirm, errText, type BoTab } from '../shared/ui';
import { WhatsAppApi, type EstadoWaInfo } from './sistema/whatsapp-api';
import { ESTADO_COMP, ESTADO_INT, INTEG, MODULOS, SistemaApi, fecha, fechaDMA, hace, type CompSistema, type Exportacion, type Integracion, type Salud, type Webhooks } from './sistema/api';

type Vista = 'competiciones' | 'integraciones' | 'salud' | 'peligro';
const ORDEN: Integracion['tipo'][] = ['smtp', 'stripe', 'whatsapp', 'aep', 'bunny'];
const WA: Record<string, { l: string; tone: GrTone }> = {
  conectado: { l: 'Conectado', tone: 'success' }, conectando: { l: 'Conectando', tone: 'warning' }, desconectado: { l: 'Desconectado', tone: 'danger' },
  error: { l: 'Error', tone: 'danger' }, sin_instancia: { l: 'Por confirmar', tone: 'warning' },
};

/** «Sistema e integraciones» (Figma 64): competitions, integrations, health and the danger zone (email and new edition are sub-pages). */
@Component({
  selector: 'bo-sistema',
  imports: [FormsModule, RouterLink, BoPageHeader, BoTabs, BoDrawer, GrAlert, GrBadge, GrButton, GrEmpty, GrErrorState, GrField, GrIcon, GrInput, GrKpi, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Sistema e integraciones" [crumbs]="['Sistema', 'Sistema e integraciones']">
        @if (vista() === 'competiciones' && root()) { <ng-container actions><a grButton variant="primary" routerLink="../nueva">Nueva competición</a></ng-container> }
      </bo-page-header>
      <bo-tabs [tabs]="tabs()" />

      @switch (vista()) {
        @case ('competiciones') {
          @if (error()) { <gr-error-state titulo="No se pudieron cargar las competiciones" texto="Comprueba la conexión y vuelve a intentarlo." (reintentar)="cargar()" /> }
          @else if (comps() === null) { <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-[346px] rounded-lg" /> }</div> }
          @else if (!comps()!.length) { <gr-empty icon="trophy" title="Sin competiciones" text="Crea la primera con «Nueva competición»." /> }
          @else {
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              @for (c of comps(); track c.id) {
                <section class="flex flex-col rounded-lg border border-line-subtle bg-bg-card p-6" [attr.data-comp]="c.slug">
                  <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <div class="min-w-0 flex-[1_1_60%]"><h2 class="text-[20px] leading-6 font-semibold">{{ c.nombre }}</h2>
                      <p class="mt-1 text-body-xs text-text-tertiary">{{ meta(c) }}</p></div>
                    <gr-badge [tone]="estComp(c).tone">{{ estComp(c).l }}</gr-badge>
                  </div>
                  <dl class="mt-5 flex flex-col">
                    <div class="border-b border-line-subtle pb-3"><dt class="text-body-xs text-text-tertiary">Módulos</dt><dd class="mt-1.5 text-body-s">{{ modulos(c) }}</dd></div>
                    <div class="border-b border-line-subtle py-3"><dt class="text-body-xs text-text-tertiary">Equipo</dt><dd class="mt-1.5 text-body-s">{{ c.miembros === undefined ? '—' : c.miembros === 1 ? '1 persona' : c.miembros + ' personas' }}</dd></div>
                  </dl>
                  <div class="mt-auto flex flex-wrap gap-2 pt-4">
                    @if (c.archivedAt) { <button grButton (click)="ver.set(c)">Ver (solo lectura)</button> }
                    @else { <button grButton variant="primary" (click)="entrar(c.slug, 'inicio')">Entrar</button> }
                    <button grButton variant="ghost" (click)="c.archivedAt ? ver.set(c) : entrar(c.slug, 'evento')">Ajustes</button>
                  </div>
                </section>
              }
            </div>
          }
        }
        @case ('integraciones') {
          @if (!puede()) { <gr-alert tone="info" icon="lock" title="Sin permiso">Necesitas el permiso «integraciones» para ver y probar las integraciones.</gr-alert> }
          @else if (error()) { <gr-error-state titulo="No se pudieron cargar las integraciones" texto="Comprueba la conexión y vuelve a intentarlo." (reintentar)="cargar()" /> }
          @else if (integs() === null) { <div class="grid gap-4 lg:grid-cols-2">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-[150px] rounded-lg" /> }</div> }
          @else {
            <div class="grid gap-4 lg:grid-cols-2">
              @for (x of integs(); track x.tipo) {
                <section class="flex flex-col gap-5 rounded-lg border border-line-subtle bg-bg-card p-6" [attr.data-integ]="x.tipo">
                  <div class="flex items-start gap-3">
                    <div class="min-w-0 flex-1"><h2 class="text-[20px] leading-6 font-semibold">{{ titulo(x) }}</h2><p class="mt-1 truncate text-body-xs text-text-tertiary">{{ resumen(x) }}</p></div>
                    <gr-badge [tone]="badge(x).tone">{{ badge(x).l }}</gr-badge>
                  </div>
                  <div class="flex flex-wrap items-center gap-3">
                    <p class="flex min-w-0 basis-full items-center gap-2 text-body-xs sm:basis-0 sm:flex-1" [class]="x.estado === 'error' ? 'text-accent-text' : 'text-text-tertiary'">
                      <gr-icon [name]="info(x.tipo).i" [size]="16" /><span class="truncate" [title]="ultimo(x)">{{ ultimo(x) }}</span></p>
                    @if (puede()) {
                      <button grButton variant="ghost" [loading]="probando() === x.tipo" [disabled]="x.estado === 'sin_configurar' && x.tipo !== 'whatsapp'" (click)="probar(x)">Probar</button>
                      <button grButton (click)="configurar(x)">Configurar</button>
                    }
                  </div>
                </section>
              }
            </div>
            <gr-alert tone="warning" icon="triangle-alert" title="Webhooks de Stripe por servicio">
              <p>Cada cobro tiene su endpoint: <span class="font-mono text-mono-s">/api/webhooks/pagos/inscripciones</span> y <span class="font-mono text-mono-s">/api/webhooks/pagos/donaciones</span>. Al pasar a modo live, da de alta los dos en Stripe y guarda su secreto whsec_ en «Configurar».</p>
              <a routerLink="../salud" class="mt-1 inline-flex items-center gap-1 text-label-s text-warning hover:underline">Ver webhooks recibidos <gr-icon name="arrow-right" [size]="14" /></a>
            </gr-alert>
          }
        }
        @case ('salud') {
          @if (!puede()) { <gr-alert tone="info" icon="lock" title="Sin permiso">Necesitas el permiso «integraciones» para ver la salud del sistema.</gr-alert> }
          @else if (error()) { <gr-error-state titulo="No se pudo leer la salud del sistema" texto="El servicio de auditoría no responde. Vuelve a intentarlo." (reintentar)="cargar()" /> }
          @else if (salud(); as s) {
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <gr-kpi label="API P95" [value]="p95(s) + ' ms'" [caption]="'objetivo < 300 ms · ' + ok(s) + '/' + s.servicios.length + ' servicios OK'" [trend]="serieP95()" />
              <gr-kpi label="Conexiones SSE" [value]="n(s.espectadores)" caption="público de esta competición" [trend]="serieSse()" />
              <gr-kpi label="Cola de emails" [value]="s.cola ? n(s.cola.pendientes) : '—'" [caption]="s.cola ? s.cola.enviadosHora + ' enviados en la última hora' : 'messaging no responde'" />
              <gr-kpi label="Último backup" [value]="s.ultimoBackup ? hace(s.ultimoBackup) : 'Sin datos'" [caption]="s.ultimoBackup ? 'cada noche a las 03:30 · 7 copias' : 'todavía no hay copias registradas'" />
            </div>
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
              <section class="min-w-0 rounded-lg border border-line-subtle bg-bg-card p-6">
                <h2 class="text-[20px] leading-6 font-semibold">Trabajos en segundo plano</h2>
                <div class="mt-4 overflow-x-auto rounded-md border border-line-subtle">
                  <table class="w-full min-w-[460px] text-left text-body-s">
                    <thead class="text-label-xs text-text-tertiary uppercase"><tr class="border-b border-line-subtle"><th class="px-4 py-3 font-medium">Worker</th><th class="px-4 py-3 font-medium">Último ciclo</th><th class="px-4 py-3 font-medium">Estado</th></tr></thead>
                    <tbody>
                      @for (g of s.grupos; track g.nombre) {
                        <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-3 font-mono text-mono-s">{{ g.nombre }}<span class="ml-1 text-text-muted">×{{ g.consumers }}</span></td>
                          <td class="px-4 py-3 font-mono text-mono-s text-text-secondary">{{ g.ultimoAt ? hace(g.ultimoAt) : 'sin eventos' }}</td>
                          <td class="px-4 py-3"><gr-badge [tone]="trabajo(g).tone">{{ trabajo(g).l }}</gr-badge></td></tr>
                      } @empty { <tr><td colspan="3" class="px-4 py-6 text-center text-body-xs text-text-tertiary">Sin trabajos registrados</td></tr> }
                    </tbody>
                  </table>
                </div>
              </section>
              <section class="min-w-0 rounded-lg border border-line-subtle bg-bg-card p-6">
                <div class="flex flex-wrap items-center gap-3"><h2 class="basis-full text-[20px] leading-6 font-semibold">Webhooks recibidos</h2>
                  <gr-select class="w-48" tipo="filtro" aria-label="Proveedor" [(ngModel)]="whProv" (ngModelChange)="whPagina = 1; cargarWebhooks()"><option value="">Todos los proveedores</option><option value="stripe">Stripe</option><option value="whatsapp">WhatsApp</option></gr-select>
                  <gr-select class="w-44" tipo="filtro" aria-label="Estado" [(ngModel)]="whEstado" (ngModelChange)="whPagina = 1; cargarWebhooks()"><option value="">Todos los estados</option><option value="error">Con error</option><option value="procesado">Procesados</option></gr-select></div>
                <div class="mt-4 overflow-x-auto rounded-md border border-line-subtle">
                  <table class="w-full min-w-[420px] text-left text-body-s">
                    <thead class="text-label-xs text-text-tertiary uppercase"><tr class="border-b border-line-subtle"><th class="px-4 py-3 font-medium">Evento</th><th class="px-4 py-3 font-medium">Respuesta</th></tr></thead>
                    <tbody>
                      @if (webhooks(); as w) {
                        @for (h of w.items; track h.id) {
                          <tr class="border-b border-line-subtle last:border-0" [class.bg-accent-deep/20]="h.estado === 'error'" [title]="h.servicio + ' · ' + hace(h.recibidoAt)">
                            <td class="px-4 py-3"><span class="font-mono text-mono-s">{{ h.proveedor === 'whatsapp' ? 'whatsapp · ' + (h.tipo || 'evento') : h.tipo || h.id }}</span><span class="block text-body-xs text-text-tertiary">{{ h.servicio }} · {{ hace(h.recibidoAt) }}</span></td>
                            <td class="px-4 py-3"><gr-badge [tone]="h.estado === 'error' ? 'danger' : 'success'">{{ h.respuesta }}{{ h.intentos > 1 ? ' · reintento ' + (h.intentos - 1) : '' }}</gr-badge></td></tr>
                        } @empty { <tr><td colspan="2" class="px-4 py-6 text-center text-body-xs text-text-tertiary">{{ whProv || whEstado ? 'Ningún webhook con estos filtros' : 'Todavía no se ha recibido ningún webhook' }}</td></tr> }
                      } @else { <tr><td colspan="2" class="p-3"><gr-skeleton class="h-24" /></td></tr> }
                    </tbody>
                  </table>
                </div>
                @if (webhooks(); as w) { @if (w.total > w.por) {
                  <div class="mt-3 flex items-center justify-between text-body-xs text-text-tertiary"><span>{{ (w.pagina - 1) * w.por + 1 }}–{{ min(w.pagina * w.por, w.total) }} de {{ w.total }}</span>
                    <span class="flex gap-2"><button grButton size="s" variant="ghost" [disabled]="w.pagina <= 1" (click)="whPagina = w.pagina - 1; cargarWebhooks()">Anterior</button><button grButton size="s" variant="ghost" [disabled]="w.pagina * w.por >= w.total" (click)="whPagina = w.pagina + 1; cargarWebhooks()">Siguiente</button></span></div>
                } }
              </section>
            </div>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-6 font-semibold">Servicios</h2>
              <ul class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                @for (v of s.servicios; track v.nombre) {
                  <li class="flex items-center gap-3 rounded-md border border-line-subtle px-4 py-3" [title]="'p95 ' + v.p95 * 1000 + ' ms · ' + n(v.peticiones) + ' peticiones'"><span class="size-2 rounded-full" [class]="v.ok ? 'bg-success' : 'bg-accent'"></span>
                    <span class="flex-1 font-mono text-mono-s">{{ v.nombre }}</span><span class="font-mono text-mono-xs text-text-tertiary">{{ v.ok ? v.ms + ' ms' : v.error || 'error' }}</span></li>
                }
              </ul>
            </section>
            <p class="text-body-xs text-text-tertiary">Se actualiza cada 10 s · último dato {{ hace(s.generado) }} · <button type="button" class="underline" (click)="cargar()">recargar</button></p>
          } @else { <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-[142px] rounded-lg" /> }</div><gr-skeleton class="h-80 rounded-lg" /> }
        }
        @case ('peligro') {
          @if (!root()) { <gr-alert tone="info" icon="lock" title="Solo Root">Estas acciones solo las puede hacer la cuenta Root de la plataforma.</gr-alert> }
          @if (comps() === null && !error()) { <gr-skeleton class="h-96 rounded-lg" /> }
          @else if (objetivo(); as c) {
            @if (root() && (comps()?.length ?? 0) > 1) {
              <gr-field label="Competición" class="max-w-sm"><gr-select [ngModel]="c.id" (ngModelChange)="objetivoId.set($event); cargarExport()">
                @for (o of comps(); track o.id) { <option [value]="o.id">{{ o.nombre }} · {{ o.slug }}{{ o.archivedAt ? ' (archivada)' : '' }}</option> }</gr-select></gr-field>
            }
            <div class="flex flex-col gap-4">
              <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6 md:flex-row md:items-center" data-peligro="archivar">
                <div class="min-w-0 flex-1"><h2 class="text-[20px] leading-6 font-semibold">Archivar {{ c.nombre }}</h2>
                  <p class="mt-1 text-body-xs text-text-tertiary">{{ c.archivedAt ? 'Archivada el ' + fechaDMA(c.archivedAt) + ': solo lectura, fuera de la web.' : 'Pasa a solo lectura: la web deja de mostrarla y el backoffice no permite cambios.' }}</p></div>
                <button grButton [disabled]="!root() || !!c.archivedAt" (click)="archivar(c)">{{ c.archivedAt ? 'Archivada' : 'Archivar' }}</button>
              </section>
              <section class="flex flex-col gap-4 rounded-lg border border-accent/40 bg-bg-card p-6 md:flex-row md:items-center" data-peligro="anonimizar">
                <div class="min-w-0 flex-1"><h2 class="text-[20px] leading-6 font-semibold">Anonimizar datos personales</h2>
                  <p class="mt-1 text-body-xs text-text-tertiary">{{ textoAnon(c) }}</p></div>
                <button grButton variant="danger" [disabled]="!root() || !!c.anonimizadaAt || anonimizando()" [loading]="anonimizando()" (click)="anonimizar(c)">{{ c.anonimizadaAt ? 'Anonimizada' : 'Adelantar anonimización' }}</button>
              </section>
              <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6 md:flex-row md:items-center" data-peligro="exportar">
                <div class="min-w-0 flex-1"><h2 class="text-[20px] leading-6 font-semibold">Exportación completa</h2>
                  <p class="mt-1 text-body-xs text-text-tertiary">ZIP con CSV de todo lo que ha pasado en la competición (registro de auditoría, KPIs, avisos y webhooks) para la asesoría o una auditoría. Caduca a las 24 h.</p>
                  @if (exportacion(); as e) {
                    <p class="mt-2 flex items-center gap-2 text-body-xs" [class]="e.estado === 'error' ? 'text-accent-text' : 'text-text-secondary'">
                      @switch (e.estado) {
                        @case ('en_curso') { <gr-icon name="loader" [size]="14" class="animate-spin" /> Generando la exportación… }
                        @case ('lista') { @if (e.url) { <gr-icon name="circle-check" [size]="14" class="text-success" /> Lista {{ hace(e.terminadaAt) }} · {{ kb(e.bytes) }} · <button type="button" class="text-accent-text underline" (click)="descargar(e)">Descargar ZIP</button> } @else { Última exportación caducada. } }
                        @case ('error') { {{ e.error || 'No se pudo generar.' }} }
                      }
                    </p>
                  }
                </div>
                <button grButton [disabled]="!root() || exportacion()?.estado === 'en_curso'" [loading]="exportacion()?.estado === 'en_curso'" (click)="exportar(c)">Solicitar exportación</button>
              </section>
              <section class="flex flex-col gap-4 rounded-lg border border-accent/40 bg-bg-card p-6 md:flex-row md:items-center" data-peligro="eliminar">
                <div class="min-w-0 flex-1"><h2 class="text-[20px] leading-6 font-semibold">Eliminar competición</h2>
                  <p class="mt-1 text-body-xs text-text-tertiary">Solo Root. Borra la competición y todos sus datos. No se puede deshacer.{{ c.archivedAt && c.anonimizadaAt ? '' : ' Antes hay que archivarla y anonimizarla.' }}</p></div>
                <button grButton variant="danger" [disabled]="!root() || !c.archivedAt || !c.anonimizadaAt" (click)="eliminar(c)">Eliminar…</button>
              </section>
            </div>
          }
        }
      }
    </div>

    <bo-drawer [(open)]="cfgOpen" [title]="cfg ? info(cfg.tipo).l : ''" sub="Los secretos se guardan cifrados y nunca se muestran completos">
      @if (cfg) {
        <div class="flex flex-col gap-4">
          @for (c of info(cfg.tipo).campos; track c.k) {
            <gr-field [label]="c.l">
              @if (c.opciones) { <gr-select [(ngModel)]="cfgVals[c.k]">@for (o of c.opciones; track o) { <option [value]="o">{{ o }}</option> }</gr-select> }
              @else { <input grInput [(ngModel)]="cfgVals[c.k]" /> }
            </gr-field>
          }
          @if (info(cfg.tipo).secreto) {
            <gr-field [label]="info(cfg.tipo).secreto!" [hint]="(cfg.secreto ? 'Actual: ' + cfg.secreto + ' · vacío = conservarlo' : 'Se guarda cifrado; nunca se vuelve a mostrar') + (info(cfg.tipo).ayudaSecreto ? ' · ' + info(cfg.tipo).ayudaSecreto : '')">
              <input grInput type="password" autocomplete="new-password" [(ngModel)]="cfgSecreto" [placeholder]="cfg.secreto || ''" /></gr-field>
          }
        </div>
      }
      <ng-container drawerActions><button grButton variant="ghost" (click)="cfgOpen.set(false)">Cancelar</button>@if (cfg) { <button grButton variant="primary" [loading]="guardando()" (click)="guardarCfg()">Guardar</button> }</ng-container>
    </bo-drawer>

    <bo-drawer [open]="!!ver()" (openChange)="!$event && ver.set(null)" [title]="ver()?.nombre ?? ''" sub="Solo lectura" [badge]="ver() ? estComp(ver()!).l : ''" badgeTone="neutral">
      @if (ver(); as c) {
        <dl class="flex flex-col gap-4 text-body-s">
          <div><dt class="text-body-xs text-text-tertiary">Identificador</dt><dd class="font-mono text-mono-s">{{ c.slug }}</dd></div>
          <div><dt class="text-body-xs text-text-tertiary">Fechas y sede</dt><dd>{{ meta(c) }}</dd></div>
          <div><dt class="text-body-xs text-text-tertiary">Módulos</dt><dd>{{ modulos(c) }}</dd></div>
          <div><dt class="text-body-xs text-text-tertiary">Equipo</dt><dd>{{ c.miembros === undefined ? '—' : c.miembros === 1 ? '1 persona' : c.miembros + ' personas' }}</dd></div>
          @if (c.archivedAt) { <div><dt class="text-body-xs text-text-tertiary">Archivada</dt><dd>{{ fecha(c.archivedAt) }}</dd></div> }
          <div><dt class="text-body-xs text-text-tertiary">Datos personales</dt><dd>{{ textoAnon(c) }}</dd></div>
        </dl>
      }
      <ng-container drawerActions>@if (root() && ver()) { <button grButton (click)="irPeligro(ver()!)">Zona peligrosa</button> }<button grButton variant="primary" (click)="ver.set(null)">Cerrar</button></ng-container>
    </bo-drawer>
  `,
})
export class SistemaPage {
  private readonly api = inject(SistemaApi);
  private readonly wa = inject(WhatsAppApi);
  protected readonly cs = inject(Competitions);
  protected readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly fecha = fecha;
  protected readonly fechaDMA = fechaDMA;
  protected readonly vista = signal<Vista>((this.route.snapshot.data['vista'] as Vista) || 'competiciones');
  protected readonly comps = signal<CompSistema[] | null>(null);
  protected readonly integs = signal<Integracion[] | null>(null);
  protected readonly waInfo = signal<EstadoWaInfo | null>(null);
  protected readonly stripeUltimo = signal<Webhooks['items'][number] | null>(null);
  protected readonly salud = signal<Salud | null>(null);
  protected readonly webhooks = signal<Webhooks | null>(null);
  protected readonly serieP95 = signal<number[]>([]);
  protected readonly serieSse = signal<number[]>([]);
  protected readonly error = signal(false);
  protected readonly probando = signal('');
  protected readonly guardando = signal(false);
  protected readonly anonimizando = signal(false);
  protected readonly cfgOpen = signal(false);
  protected readonly ver = signal<CompSistema | null>(null);
  protected readonly objetivoId = signal('');
  protected readonly exportacion = signal<Exportacion | null>(null);
  protected readonly ahora = signal(Date.now());
  protected cfg: Integracion | null = null;
  protected cfgVals: Record<string, string> = {};
  protected cfgSecreto = '';
  protected whProv = '';
  protected whEstado = '';
  protected whPagina = 1;
  private readonly cid = computed(() => this.cs.current()?.id ?? '');
  protected readonly root = computed(() => !!this.auth.user()?.root);
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'integraciones.config'));
  protected readonly objetivo = computed(() => this.comps()?.find((c) => c.id === this.objetivoId()) ?? this.comps()?.find((c) => c.id === this.cid()) ?? null);
  protected readonly tabs = computed<BoTab[]>(() => [
    { label: 'Competiciones', path: '../competiciones', count: this.comps()?.length ?? null },
    { label: 'Integraciones', path: '../integraciones', count: this.integs() ? this.integs()!.filter((x) => x.estado !== 'sin_configurar').length : null },
    { label: 'Salud', path: '../salud', count: this.salud() ? this.problemas(this.salud()!) : null },
    { label: 'Zona peligrosa', path: '../zona-peligrosa' },
  ]);

  constructor() {
    const legado = this.route.snapshot.queryParamMap.get('tab');
    if (legado) void this.router.navigate(['..', legado === 'peligro' ? 'zona-peligrosa' : legado], { relativeTo: this.route, replaceUrl: true });
    effect(() => {
      if (!this.cid()) return;
      untracked(() => this.cargar());
    });
    const t = setInterval(() => {
      this.ahora.set(Date.now());
      if (this.vista() === 'salud' && !document.hidden) void this.cargarSalud(true);
    }, 10_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected cargar(): void {
    this.error.set(false);
    const v = this.vista();
    void this.cargarComps();
    // the tab counters need integrations and health whatever the tab
    if (this.puede()) {
      void this.cargarInteg();
      void this.cargarSalud(v !== 'salud');
    }
    if (v === 'peligro') void this.cargarExport();
  }
  private async cargarComps(): Promise<void> {
    try {
      const list = this.root() ? await this.api.competiciones() : (this.cs.list() as CompSistema[]);
      this.comps.set(list);
    } catch {
      if (this.vista() === 'competiciones' || this.vista() === 'peligro') this.error.set(true);
    }
  }
  private async cargarInteg(): Promise<void> {
    try {
      const cid = this.cid();
      const [list, wa, wh] = await Promise.all([this.api.integraciones(cid), this.wa.estado(cid).catch(() => null), this.api.webhooks(cid, { proveedor: 'stripe', por: 1 }).catch(() => null)]);
      this.waInfo.set(wa);
      this.stripeUltimo.set(wh?.items[0] ?? null);
      this.integs.set(ORDEN.map((t) => list.find((x) => x.tipo === t)!).filter(Boolean));
    } catch {
      if (this.vista() === 'integraciones') this.error.set(true);
    }
  }
  async cargarSalud(silencioso = false): Promise<void> {
    try {
      const s = await this.api.salud(this.cid());
      this.salud.set(s);
      this.serieP95.update((a) => [...a, this.p95(s)].slice(-12));
      this.serieSse.update((a) => [...a, s.espectadores].slice(-12));
      this.error.set(false);
      if (this.vista() === 'salud') void this.cargarWebhooks();
    } catch {
      if (this.vista() === 'salud' && (!silencioso || !this.salud())) this.error.set(true);
    }
  }
  protected async cargarWebhooks(): Promise<void> {
    this.webhooks.set(await this.api.webhooks(this.cid(), { proveedor: this.whProv, estado: this.whEstado, pagina: this.whPagina, por: 8 }).catch(() => ({ items: [], total: 0, pagina: 1, por: 8 })));
  }
  protected async cargarExport(): Promise<void> {
    if (!this.root()) return;
    const id = this.objetivoId() || this.cid();
    this.exportacion.set((await this.api.exportaciones(id).catch(() => []))[0] ?? null);
  }

  protected info(t: Integracion['tipo']) { return INTEG[t]; }
  protected estComp(c: CompSistema) { return c.archivedAt ? ESTADO_COMP['archivada'] : (ESTADO_COMP[c.estado] ?? { l: c.estado, tone: 'neutral' as GrTone }); }
  protected meta(c: CompSistema): string {
    const f = c.fechaInicio ? (c.fechaFin && c.fechaFin !== c.fechaInicio ? `${fecha(c.fechaInicio)} – ${fecha(c.fechaFin)}` : fecha(c.fechaInicio)) : 'Sin fecha';
    return [c.slug, f, c.sede?.ciudad].filter(Boolean).join(' · ');
  }
  protected modulos(c: CompSistema): string {
    if (c.archivedAt) return 'Solo lectura · resultados publicados';
    const on = MODULOS.filter((m) => c.modulos?.[m.k]?.activo).map((m) => m.l);
    return on.length ? on.join(' · ') : 'Ningún módulo activo';
  }
  protected titulo(x: Integracion): string {
    if (x.tipo === 'smtp') return x.config['proveedor'] ? `Email (SMTP · ${x.config['proveedor']})` : 'Email (SMTP)';
    if (x.tipo === 'whatsapp') return 'WhatsApp (evo-weai)';
    return INTEG[x.tipo].l;
  }
  protected resumen(x: Integracion): string {
    const c = x.config;
    switch (x.tipo) {
      case 'smtp': return c['host'] ? `${c['host']}:${c['puerto'] || ''} · ${c['remitente'] || c['usuario'] || ''}` : 'Sin SMTP propio: se usa el del sistema';
      case 'stripe': return c['clavePublica'] ? `Checkout + webhooks · ${c['clavePublica'].slice(0, 8)}…${c['clavePublica'].slice(-3)}` : 'Sin claves: pasarela simulada';
      case 'whatsapp': { const w = this.waInfo(); return w?.instancia ? `${w.instancia}${w.numero ? ' · ' + w.numero : ''}` : 'Número de la GR Cup · avisos y campañas'; }
      case 'bunny': return c['zona'] ? `${c['zona']} · ${c['cdnUrl'] || ''}` : 'Imágenes y frames del hero';
      case 'aep': return c['urlActa'] ? 'Acta oficial enlazada en Resultados' : 'Importación de .xlsx · sin API pública';
    }
  }
  protected badge(x: Integracion): { l: string; tone: GrTone } {
    if (x.tipo === 'whatsapp') { const w = this.waInfo(); return w ? (w.modo === 'simulado' ? { l: 'Simulado', tone: 'info' } : w.servicio === 'caido' ? { l: 'Caído', tone: 'danger' } : (WA[w.estado] ?? WA['sin_instancia'])) : { l: 'Por confirmar', tone: 'warning' }; }
    if (x.tipo === 'stripe' && x.estado !== 'error' && x.config['modo']) return { l: x.config['modo'] === 'live' ? 'Modo live' : 'Modo test', tone: x.config['modo'] === 'live' ? 'success' : 'info' };
    if (x.tipo === 'aep' && x.estado !== 'error') return { l: x.config['urlActa'] ? 'Enlazada' : 'Manual', tone: 'info' };
    return ESTADO_INT[x.estado];
  }
  protected ultimo(x: Integracion): string {
    this.ahora();
    if (x.estado === 'error' && x.error) return x.error;
    if (x.tipo === 'stripe') { const w = this.stripeUltimo(); if (w) return `${w.tipo || 'evento'} ${hace(w.recibidoAt)}`; }
    if (x.tipo === 'whatsapp') { const w = this.waInfo(); if (w?.estado === 'conectado' && w.conectadoDesde) return `Conectado desde ${fecha(w.conectadoDesde)}`; return w?.modo === 'simulado' ? 'Modo simulado (sin número real)' : 'Proveedor y número pendientes de vincular'; }
    return x.probadoAt ? `Última prueba ${hace(x.probadoAt)}` : 'Sin probar todavía';
  }
  /** p95 of the API: streams (SSE, chat) stay open until the last histogram bucket (5 s) and are not API latency. */
  protected p95(s: Salud): number { return Math.round(Math.max(0, ...s.servicios.filter((x) => x.p95 < 5).map((x) => x.p95)) * 1000); }
  protected ok(s: Salud): number { return s.servicios.filter((x) => x.ok).length; }
  private problemas(s: Salud): number { return s.servicios.filter((x) => !x.ok).length + s.grupos.filter((g) => !g.consumers || g.retraso > 100).length; }
  protected trabajo(g: Salud['grupos'][number]): { l: string; tone: GrTone } {
    if (!g.consumers) return { l: 'Parado', tone: 'danger' };
    if (g.retraso > 100) return { l: `${g.retraso} por procesar`, tone: 'warning' };
    if (g.retraso > 0 || g.pendientes > 0) return { l: 'Procesando', tone: 'info' };
    return { l: 'OK', tone: 'success' };
  }
  protected hace(iso?: string | null): string { return hace(iso, this.ahora()); }
  protected n(v: number): string { return new Intl.NumberFormat('es-ES').format(v); }
  protected kb(b: number): string { return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; }
  protected min(a: number, b: number): number { return Math.min(a, b); }
  protected textoAnon(c: CompSistema): string {
    if (c.anonimizadaAt) return `Anonimizada el ${fechaDMA(c.anonimizadaAt)}: contactos, entradas y boletos sin datos personales; se mantienen totales y resultados.`;
    if (c.anonimizarAt) return `Programado el ${fechaDMA(c.anonimizarAt)} (12 meses tras el evento): contactos, entradas y boletos quedan sin datos personales; se mantienen totales y resultados.`;
    if (c.archivedAt) return 'Sin fecha de anonimización programada: adelántala cuando ya no hagan falta los datos personales.';
    const base = c.fechaFin || c.fechaInicio;
    const d = base ? new Date(base + 'T03:00:00Z') : null;
    if (d) d.setUTCFullYear(d.getUTCFullYear() + 1);
    return `Se programará al archivar${d ? ' para el ' + fechaDMA(d.toISOString()) : ''} (12 meses tras el evento): contactos, entradas y boletos quedan sin datos personales; se mantienen totales y resultados.`;
  }

  protected entrar(slug: string, ruta: string): void { void this.router.navigate(['/', slug, ruta]); }
  protected irPeligro(c: CompSistema): void {
    this.ver.set(null);
    this.objetivoId.set(c.id);
    void this.router.navigate(['../zona-peligrosa'], { relativeTo: this.route });
  }
  protected configurar(x: Integracion): void {
    if (x.tipo === 'smtp') { void this.router.navigate(['../email'], { relativeTo: this.route }); return; }
    if (x.tipo === 'whatsapp') { void this.router.navigate(['../whatsapp'], { relativeTo: this.route }); return; }
    this.cfg = x;
    this.cfgVals = { ...x.config };
    for (const c of INTEG[x.tipo].campos) if (c.opciones && !this.cfgVals[c.k]) this.cfgVals[c.k] = c.opciones[0];
    this.cfgSecreto = '';
    this.cfgOpen.set(true);
  }
  protected async guardarCfg(): Promise<void> {
    if (!this.cfg) return;
    this.guardando.set(true);
    try {
      await this.api.guardar(this.cid(), this.cfg.tipo, this.cfgVals, this.cfgSecreto || undefined);
      this.cfgOpen.set(false);
      this.toasts.success('Integración guardada', 'Pulsa «Probar» para comprobarla.');
      await this.cargarInteg();
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async probar(x: Integracion): Promise<void> {
    this.probando.set(x.tipo);
    try {
      if (x.tipo === 'whatsapp') {
        const w = await this.wa.estado(this.cid());
        this.waInfo.set(w);
        if (w.modo === 'simulado') this.toasts.success('WhatsApp en modo simulado', 'Los envíos se registran sin salir a WhatsApp.');
        else if (w.servicio === 'ok' && w.estado === 'conectado') this.toasts.success('WhatsApp conectado', w.numero || w.instancia);
        else this.toasts.error('WhatsApp no está conectado', w.servicio === 'caido' ? 'El servidor de WhatsApp no responde.' : 'Vincula el número en Configurar.');
        return;
      }
      const r = await this.api.probar(this.cid(), x.tipo);
      this.integs.update((l) => l?.map((i) => (i.tipo === x.tipo ? r : i)) ?? l);
      if (r.estado === 'ok') this.toasts.success(`${this.titulo(r)}: funciona`, [r.latenciaMs ? `${r.latenciaMs} ms` : '', r.enviado ? `email de prueba a ${r.enviado}` : ''].filter(Boolean).join(' · '));
      else this.toasts.error(`${this.titulo(r)}: la prueba ha fallado`, r.error || '');
    } catch (e) {
      this.toasts.error('La prueba ha fallado', errText(e));
    } finally {
      this.probando.set('');
    }
  }
  protected async archivar(c: CompSistema): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Archivar ${c.nombre}?`, text: 'Deja de verse en la web y el backoffice queda en solo lectura. Los datos personales se anonimizarán 12 meses después del evento.', confirm: 'Archivar', danger: true, word: c.slug }))) return;
    try {
      await this.api.archivar(c.id);
      this.toasts.success('Competición archivada');
      await this.cs.load(true);
      if (c.id === this.cid()) { const otra = this.cs.list()[0]; if (otra) { void this.router.navigate(['/', otra.slug, 'sistema', 'zona-peligrosa']); return; } }
      await this.cargarComps();
    } catch (e) {
      this.toasts.error('No se pudo archivar', errText(e));
    }
  }
  protected async anonimizar(c: CompSistema): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Anonimizar ahora', text: `Se borran ya los datos personales de ${c.nombre} (contactos, entradas, boletos y mensajes enviados). Totales y resultados se mantienen. No se puede deshacer.`, confirm: 'Anonimizar', danger: true, word: c.slug }))) return;
    this.anonimizando.set(true);
    try {
      const r = await this.api.anonimizar(c.id, c.slug);
      this.toasts.success('Anonimización en curso', `Servicios: ${r.servicios.join(', ')}`);
      await this.cargarComps();
    } catch (e) {
      this.toasts.error('No se pudo anonimizar', errText(e));
    } finally {
      this.anonimizando.set(false);
    }
  }
  protected async exportar(c: CompSistema): Promise<void> {
    try {
      this.exportacion.set(await this.api.exportar(c.id));
      this.toasts.success('Exportación solicitada', 'Tardará unos segundos.');
      for (let i = 0; i < 30 && this.exportacion()?.estado === 'en_curso'; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        await this.cargarExport();
      }
    } catch (e) {
      this.toasts.error('No se pudo exportar', errText(e));
    }
  }
  protected async descargar(e: Exportacion): Promise<void> {
    try {
      const blob = await this.api.descargar(e.url!);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `exportacion-${(this.objetivo()?.slug ?? 'competicion')}-${e.createdAt.slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      this.toasts.error('No se pudo descargar', errText(err));
    }
  }
  protected async eliminar(c: CompSistema): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Eliminar ${c.nombre}?`, text: 'Se borra la competición y todos sus datos. No se puede deshacer.', confirm: 'Eliminar para siempre', danger: true, word: c.slug }))) return;
    try {
      await this.api.eliminar(c.id, c.slug);
      this.toasts.success('Competición eliminada');
      this.objetivoId.set('');
      await Promise.all([this.cargarComps(), this.cs.load(true)]);
      await this.cargarExport();
    } catch (e) {
      this.toasts.error('No se pudo eliminar', errText(e));
    }
  }
}
