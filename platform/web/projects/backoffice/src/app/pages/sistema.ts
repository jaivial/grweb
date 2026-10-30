import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrField, GrIcon, GrInput, GrKpi, GrSkeleton, GrToasts, type GrIconName } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { BoDrawer, BoPageHeader, Confirm, errText } from '../shared/ui';

interface Integracion { tipo: 'smtp' | 'stripe' | 'whatsapp' | 'bunny' | 'aep'; config: Record<string, string>; secreto: string; estado: 'sin_configurar' | 'configurada' | 'ok' | 'error'; probadoAt?: string; error?: string; version: number }
interface Registro { estado: 'correcto' | 'falta' | 'revisar'; valor?: string; ayuda: string }
interface Dominio { dominio: string; spf: Registro; dkim: Registro; dmarc: Registro }
interface Salud {
  servicios: { nombre: string; ok: boolean; ms: number; error?: string; p95: number; peticiones: number }[]; grupos: { nombre: string; pendientes: number; retraso: number; consumers: number }[];
  eventos: number; espectadores: number; generado: string;
}
interface CompItem { id: string; slug: string; nombre: string; nombreCorto: string; estado: string; fechaInicio?: string; fechaFin?: string; sede?: { ciudad?: string }; archivedAt?: string }
type Tab = 'competiciones' | 'integraciones' | 'email' | 'salud' | 'peligro';

const INTEG: Record<string, { l: string; d: string; i: GrIconName; campos: { k: string; l: string; tipo?: string; opciones?: string[] }[]; secreto?: string; ayudaSecreto?: string }> = {
  smtp: { l: 'Email (SMTP)', d: 'Envío de emails transaccionales y campañas', i: 'mail', secreto: 'Contraseña de aplicación',
    campos: [{ k: 'host', l: 'Host' }, { k: 'puerto', l: 'Puerto' }, { k: 'usuario', l: 'Usuario' }, { k: 'remitente', l: 'Remitente (email)' }, { k: 'nombreRemitente', l: 'Nombre del remitente' }, { k: 'tls', l: 'TLS', opciones: ['si', 'starttls', 'no'] }] },
  stripe: { l: 'Stripe', d: 'Pagos de inscripciones y del sorteo', i: 'ticket', secreto: 'Secreto', ayudaSecreto: 'JSON {"clave":"sk_…","webhook":"whsec_…"}', campos: [{ k: 'modo', l: 'Modo', opciones: ['test', 'live'] }, { k: 'clavePublica', l: 'Clave pública' }] },
  whatsapp: { l: 'WhatsApp (evo-weai)', d: 'Campañas y avisos por WhatsApp', i: 'smartphone', secreto: 'API key de evo-weai',
    campos: [{ k: 'proveedor', l: 'Proveedor', opciones: ['evo-weai'] }, { k: 'url', l: 'URL del servidor' }, { k: 'instancia', l: 'Instancia' }, { k: 'numero', l: 'Número' }] },
  bunny: { l: 'Bunny CDN', d: 'Imágenes y frames de la web', i: 'globe', secreto: 'Access key', campos: [{ k: 'zona', l: 'Storage zone' }, { k: 'cdn', l: 'URL del CDN' }] },
  aep: { l: 'AEP (acta)', d: 'Importación del acta de inscritos', i: 'download', campos: [{ k: 'modo', l: 'Modo', opciones: ['manual', 'api'] }, { k: 'url', l: 'URL' }] },
};
const ESTADO_INT: Record<string, { l: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = { sin_configurar: { l: 'Sin configurar', tone: 'neutral' }, configurada: { l: 'Configurada', tone: 'info' }, ok: { l: 'Operativo', tone: 'success' }, error: { l: 'Error', tone: 'danger' } };
const ESTADO_COMP: Record<string, string> = { borrador: 'Borrador', proximamente: 'Próximamente', inscripciones: 'Inscripciones abiertas', completas: 'Completas', hoy: 'Hoy', finalizado: 'Finalizado', archivada: 'Archivada' };

/** «Sistema e integraciones» (Figma page 64): competitions (new edition cloning the setup), integrations, the email domain, health and the danger zone. */
@Component({
  selector: 'bo-sistema',
  imports: [FormsModule, BoPageHeader, BoDrawer, GrAlert, GrBadge, GrButton, GrField, GrIcon, GrInput, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Sistema e integraciones" [crumbs]="['Sistema', 'Sistema e integraciones']">
        @if (tab() === 'competiciones' && auth.user()?.root) { <ng-container actions><button grButton variant="primary" icon="plus" (click)="nuevaOpen.set(true)">Nueva competición</button></ng-container> }
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Sistema">
        @for (t of tabs; track t.v) {
          <button type="button" class="relative flex h-11 shrink-0 items-center px-3 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="ir(t.v)">{{ t.l }}
            @if (tab() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }</button>
        }
      </nav>
      @switch (tab()) {
        @case ('competiciones') {
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            @for (c of comps.list(); track c.id) {
              <section class="flex flex-col rounded-lg border border-line-subtle bg-bg-card p-4">
                <div class="flex items-start gap-2"><h2 class="flex-1 text-ui-h5">{{ c.nombre }}</h2><gr-badge [tone]="c.estado === 'finalizado' || c.estado === 'archivada' ? 'neutral' : 'success'">{{ estComp[c.estado] ?? c.estado }}</gr-badge></div>
                <p class="mt-1 text-body-xs text-text-tertiary">{{ $any(c).slug }}@if ($any(c).fechaInicio) { · {{ $any(c).fechaInicio }} }</p>
                <div class="mt-auto flex gap-2 pt-4"><button grButton size="s" variant="primary" (click)="entrar($any(c).slug)">Entrar</button>@if (auth.user()?.root) { <button grButton size="s" variant="ghost" (click)="nuevaDesde($any(c))">Nueva edición desde esta</button> }</div>
              </section>
            }
          </div>
        }
        @case ('integraciones') {
          @if (integs() === null) { <gr-skeleton class="h-64 rounded-lg" /> }
          @else {
            <div class="grid gap-3 md:grid-cols-2">
              @for (x of integs(); track x.tipo) {
                <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4">
                  <div class="flex items-start gap-3"><span class="flex size-9 shrink-0 items-center justify-center rounded-sm bg-bg-raised"><gr-icon [name]="info(x.tipo).i" [size]="18" /></span>
                    <div class="min-w-0 flex-1"><p class="text-label-m">{{ info(x.tipo).l }}</p><p class="text-body-xs text-text-tertiary">{{ resumen(x) }}</p></div><gr-badge [tone]="estInt[x.estado].tone">{{ estInt[x.estado].l }}</gr-badge></div>
                  @if (x.error) { <p class="text-body-xs text-accent-text">{{ x.error }}</p> }
                  <p class="text-body-xs text-text-tertiary">{{ x.probadoAt ? 'Probada ' + fecha(x.probadoAt) : info(x.tipo).d }}</p>
                  @if (puede()) { <div class="flex gap-2"><button grButton size="s" [loading]="probando() === x.tipo" [disabled]="x.estado === 'sin_configurar'" (click)="probar(x)">Probar</button><button grButton size="s" variant="ghost" (click)="configurar(x)">Configurar</button></div> }
                </section>
              }
            </div>
          }
        }
        @case ('email') {
          <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h5">Servidor</h2>
              @if (smtp(); as s) {
                <dl class="mt-3 grid gap-2 text-body-s sm:grid-cols-2">
                  <div><dt class="text-text-tertiary">Host</dt><dd class="font-mono text-mono-s">{{ s.config['host'] || '—' }}:{{ s.config['puerto'] || '' }}</dd></div>
                  <div><dt class="text-text-tertiary">Usuario</dt><dd>{{ s.config['usuario'] || '—' }}</dd></div>
                  <div><dt class="text-text-tertiary">Remitente</dt><dd>{{ s.config['nombreRemitente'] }} &lt;{{ s.config['remitente'] || '—' }}&gt;</dd></div>
                  <div><dt class="text-text-tertiary">Estado</dt><dd><gr-badge [tone]="estInt[s.estado].tone">{{ estInt[s.estado].l }}</gr-badge></dd></div>
                </dl>
                @if (puede()) { <div class="mt-4 flex gap-2"><button grButton size="s" (click)="configurar(s)">Configurar</button><button grButton size="s" [loading]="probando() === 'smtp'" (click)="probar(s)">Enviar prueba</button></div> }
              }
              <p class="mt-4 text-body-xs text-text-tertiary">Sin SMTP propio se usa el del sistema. Los límites de envío se ajustan en cada campaña (Campañas › Ajustes).</p>
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <div class="flex items-center justify-between"><h2 class="text-ui-h5">Dominio {{ dominio()?.dominio }}</h2><button grButton size="s" variant="ghost" (click)="comprobar()">Comprobar</button></div>
              @if (dominio(); as d) {
                <ul class="mt-3 flex flex-col gap-3">
                  @for (r of [{ k: 'SPF', v: d.spf }, { k: 'DKIM', v: d.dkim }, { k: 'DMARC', v: d.dmarc }]; track r.k) {
                    <li><p class="flex items-center justify-between text-label-s">{{ r.k }}<gr-badge [tone]="r.v.estado === 'correcto' ? 'success' : r.v.estado === 'falta' ? 'danger' : 'warning'">{{ r.v.estado === 'correcto' ? 'Correcto' : r.v.estado === 'falta' ? 'Falta' : 'Revisar' }}</gr-badge></p>
                      @if (r.v.valor) { <p class="truncate font-mono text-[11px] text-text-tertiary">{{ r.v.valor }}</p> }<p class="text-body-xs text-text-tertiary">{{ r.v.ayuda }}</p></li>
                  }
                </ul>
              } @else { <gr-skeleton class="mt-3 h-40" /> }
            </section>
          </div>
        }
        @case ('salud') {
          @if (salud(); as s) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Servicios" [value]="ok(s) + ' / ' + s.servicios.length" [caption]="ok(s) === s.servicios.length ? 'todos operativos' : 'revisa los marcados'" />
              <gr-kpi label="API p95" [value]="p95(s) + ' ms'" [caption]="n(peticiones(s)) + ' peticiones desde el último arranque'" />
              <gr-kpi label="Conexiones SSE" [value]="s.espectadores + ''" caption="público de esta competición" />
              <gr-kpi label="Bus de eventos" [value]="n(s.eventos)" [caption]="retraso(s) ? retraso(s) + ' eventos por procesar' : 'al día'" />
            </div>
            <div class="grid gap-5 lg:grid-cols-2">
              <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card"><h2 class="border-b border-line-subtle px-4 py-3 text-ui-h5">Servicios</h2>
                <table class="w-full text-left text-body-s"><tbody>@for (v of s.servicios; track v.nombre) {
                  <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-2 font-mono text-mono-s">{{ v.nombre }}</td><td class="px-3 py-2 text-right font-mono text-mono-xs text-text-tertiary" title="p95 de las peticiones · comprobación /readyz">p95 {{ v.p95 * 1000 }} ms · {{ n(v.peticiones) }}</td>
                    <td class="px-4 py-2 text-right"><gr-badge [tone]="v.ok ? 'success' : 'danger'">{{ v.ok ? 'OK' : (v.error || 'error') }}</gr-badge></td></tr> }</tbody></table></section>
              <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card"><h2 class="border-b border-line-subtle px-4 py-3 text-ui-h5">Trabajos en segundo plano</h2>
                <table class="w-full text-left text-body-s"><thead class="text-mono-xs text-text-tertiary"><tr><th class="px-4 py-2">Consumidor</th><th class="px-3 py-2 text-right">Pendientes</th><th class="px-4 py-2 text-right">Por leer</th></tr></thead>
                  <tbody>@for (g of s.grupos; track g.nombre) {
                    <tr class="border-t border-line-subtle"><td class="px-4 py-2 font-mono text-mono-s">{{ g.nombre }}<span class="ml-1 text-text-muted">×{{ g.consumers }}</span></td><td class="px-3 py-2 text-right font-mono">{{ g.pendientes }}</td>
                      <td class="px-4 py-2 text-right font-mono" [class.text-warning]="g.retraso > 100">{{ g.retraso }}</td></tr> }</tbody></table></section>
            </div>
            <p class="text-body-xs text-text-tertiary">Actualizado {{ fecha(s.generado) }} · <button type="button" class="underline" (click)="cargarSalud()">recargar</button></p>
          } @else { <gr-skeleton class="h-72 rounded-lg" /> }
        }
        @case ('peligro') {
          <div class="flex flex-col gap-3">
            <section class="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-bg-card p-4"><div class="min-w-0 flex-1"><p class="text-label-m">Archivar {{ comps.current()?.nombre }}</p><p class="text-body-xs text-text-tertiary">Pasa a solo lectura: la web deja de mostrarla y el backoffice no permite cambios.</p></div>
              <button grButton variant="danger" [disabled]="!auth.user()?.root" (click)="archivar()">Archivar</button></section>
            @for (x of pendientes; track x.t) {
              <section class="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-bg-card p-4 opacity-70"><div class="min-w-0 flex-1"><p class="text-label-m">{{ x.t }}</p><p class="text-body-xs text-text-tertiary">{{ x.d }}</p></div><gr-badge>{{ x.b }}</gr-badge></section>
            }
            @if (!auth.user()?.root) { <gr-alert tone="info" title="Solo Root">Estas acciones solo las puede hacer la cuenta Root de la plataforma.</gr-alert> }
          </div>
        }
      }
    </div>

    <bo-drawer [(open)]="cfgOpen" [title]="cfg ? info(cfg.tipo).l : ''">
      @if (cfg) {
        <div class="flex flex-col gap-3">
          @for (c of info(cfg.tipo).campos; track c.k) {
            <gr-field [label]="c.l">
              @if (c.opciones) { <select grInput [(ngModel)]="cfgVals[c.k]">@for (o of c.opciones; track o) { <option [value]="o">{{ o }}</option> }</select> }
              @else { <input grInput [(ngModel)]="cfgVals[c.k]" /> }
            </gr-field>
          }
          @if (info(cfg.tipo).secreto) {
            <gr-field [label]="info(cfg.tipo).secreto!" [hint]="(cfg.secreto ? 'Actual: ' + cfg.secreto + ' · vacío = conservarla' : 'Se guarda cifrado; nunca se vuelve a mostrar') + (info(cfg.tipo).ayudaSecreto ? ' · ' + info(cfg.tipo).ayudaSecreto : '')">
              <input grInput type="password" autocomplete="new-password" [(ngModel)]="cfgSecreto" /></gr-field>
          }
        </div>
      }
      <ng-container drawerActions>@if (cfg) { <button grButton variant="primary" [loading]="guardando()" (click)="guardarCfg()">Guardar</button> }</ng-container>
    </bo-drawer>

    @if (nuevaOpen()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="nuevaOpen.set(false)" (keydown.escape)="nuevaOpen.set(false)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Nueva competición" (click)="$event.stopPropagation()" (ngSubmit)="crear()">
          <h2 class="text-ui-h5">Nueva competición</h2>
          @if (nueva.clonarDe) { <p class="mt-1 text-body-s text-text-secondary">Copia sede, evento, módulos, inscripción y cómo llegar de «{{ nueva.origen }}». Nunca se copian datos personales (contactos, entradas, atletas).</p> }
          <gr-field label="Nombre" class="mt-4"><input grInput name="nombre" [(ngModel)]="nueva.nombre" (ngModelChange)="autoSlug()" /></gr-field>
          <gr-field label="Slug (URL)" class="mt-3" hint="Minúsculas, números y guiones"><input grInput name="slug" [(ngModel)]="nueva.slug" /></gr-field>
          <gr-field label="Primer día" class="mt-3"><input grInput type="date" name="fecha" [(ngModel)]="nueva.fecha" /></gr-field>
          <div class="mt-6 flex justify-end gap-2"><button type="button" grButton variant="ghost" (click)="nuevaOpen.set(false)">Cancelar</button><button type="submit" grButton variant="primary" [disabled]="nueva.nombre.trim().length < 2 || !nueva.slug">Crear</button></div>
        </form>
      </div>
    }
  `,
})
export class SistemaPage {
  private readonly http = inject(HttpClient);
  protected readonly comps = inject(Competitions);
  protected readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly estInt = ESTADO_INT;
  protected readonly estComp = ESTADO_COMP;
  protected readonly tabs: { v: Tab; l: string }[] = [{ v: 'competiciones', l: 'Competiciones' }, { v: 'integraciones', l: 'Integraciones' }, { v: 'email', l: 'Email' }, { v: 'salud', l: 'Salud' }, { v: 'peligro', l: 'Zona peligrosa' }];
  protected readonly pendientes = [
    { t: 'Anonimizar datos personales', d: 'Borrar contactos, entradas y atletas de una edición terminada manteniendo resultados y estadísticas. Se activa cuando la organización fije el plazo de conservación (propuesta: 12 meses).', b: 'Pendiente de decidir' },
    { t: 'Exportación completa', d: 'ZIP con los CSV de todas las tablas de la competición. Mientras tanto: la exportación de cada sección (atletas, contactos, entradas, sorteo, acta) y las copias nocturnas.', b: 'Pendiente' },
    { t: 'Eliminar competición', d: 'Solo Root, solo sin datos: ahora se archiva.', b: 'No disponible' },
  ];
  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || 'competiciones');
  protected readonly integs = signal<Integracion[] | null>(null);
  protected readonly dominio = signal<Dominio | null>(null);
  protected readonly salud = signal<Salud | null>(null);
  protected readonly probando = signal('');
  protected readonly guardando = signal(false);
  protected readonly cfgOpen = signal(false);
  protected readonly nuevaOpen = signal(false);
  protected cfg: Integracion | null = null;
  protected cfgVals: Record<string, string> = {};
  protected cfgSecreto = '';
  protected nueva = { nombre: '', slug: '', fecha: '', clonarDe: '', origen: '' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'integraciones.config'));
  protected readonly smtp = computed(() => this.integs()?.find((x) => x.tipo === 'smtp'));
  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => this.cargarTab());
    });
  }
  private b(): string { return `/api/admin/competiciones/${this.cid()}`; }
  protected ir(t: Tab): void {
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
    this.cargarTab();
  }
  private cargarTab(): void {
    const t = this.tab();
    if (t === 'integraciones' || t === 'email') void this.cargarInteg();
    if (t === 'email') void this.comprobar();
    if (t === 'salud') void this.cargarSalud();
  }
  private async cargarInteg(): Promise<void> { this.integs.set(await firstValueFrom(this.http.get<Integracion[]>(`${this.b()}/integraciones`)).catch(() => [])); }
  protected async comprobar(): Promise<void> { this.dominio.set(await firstValueFrom(this.http.get<Dominio>(`${this.b()}/integraciones/smtp/dominio`)).catch(() => null)); }
  async cargarSalud(): Promise<void> {
    try { this.salud.set(await firstValueFrom(this.http.get<Salud>(`${this.b()}/sistema/salud`))); } catch (e) { this.toasts.error(errText(e, 'No se pudo leer la salud.')); }
  }
  protected info(t: string) { return INTEG[t]; }
  protected resumen(x: Integracion): string {
    const c = x.config;
    switch (x.tipo) {
      case 'smtp': return c['host'] ? `${c['host']} · ${c['remitente'] || c['usuario'] || ''}` : 'Usa el SMTP del sistema';
      case 'stripe': return c['modo'] ? `Modo ${c['modo']}` : 'Sin claves: pasarela simulada en QA';
      case 'whatsapp': return c['instancia'] ? `${c['proveedor'] || ''} · ${c['instancia']} · ${c['numero'] || ''}` : 'Sin número: modo simulado en QA';
      default: return Object.values(c).filter(Boolean).join(' · ') || 'Sin configurar';
    }
  }
  protected fecha(iso: string): string { return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)); }
  protected n(v: number): string { return new Intl.NumberFormat('es-ES').format(v); }
  protected ok(s: Salud): number { return s.servicios.filter((x) => x.ok).length; }
  protected p95(s: Salud): number { return Math.round(Math.max(0, ...s.servicios.map((x) => x.p95)) * 1000); }
  protected peticiones(s: Salud): number { return s.servicios.reduce((a, x) => a + x.peticiones, 0); }
  protected retraso(s: Salud): number { return s.grupos.reduce((a, g) => a + (g.retraso || 0), 0); }
  protected entrar(slug: string): void { void this.router.navigate(['/', slug, 'inicio']); }
  protected configurar(x: Integracion): void {
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
      await firstValueFrom(this.http.put(`${this.b()}/integraciones/${this.cfg.tipo}`, { config: this.cfgVals, ...(this.cfgSecreto ? { secreto: this.cfgSecreto } : {}) }));
      this.cfgOpen.set(false);
      this.toasts.success('Integración guardada');
      await this.cargarInteg();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar.'));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async probar(x: Integracion): Promise<void> {
    this.probando.set(x.tipo);
    try {
      await firstValueFrom(this.http.post(`${this.b()}/integraciones/${x.tipo}/probar`, {}));
      await this.cargarInteg();
      const r = this.integs()?.find((i) => i.tipo === x.tipo);
      if (r?.estado === 'ok') this.toasts.success(`${INTEG[x.tipo].l}: funciona`); else this.toasts.error(r?.error || 'La prueba ha fallado.');
    } catch (e) {
      this.toasts.error(errText(e, 'La prueba ha fallado.'));
    } finally {
      this.probando.set('');
    }
  }
  protected nuevaDesde(c: CompItem): void {
    this.nueva = { nombre: c.nombre.replace(/\d{4}/, (y) => String(+y + 1)), slug: '', fecha: '', clonarDe: c.id, origen: c.nombre };
    this.autoSlug();
    this.nuevaOpen.set(true);
  }
  protected autoSlug(): void {
    this.nueva.slug = this.nueva.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }
  protected async crear(): Promise<void> {
    try {
      const c = await firstValueFrom(this.http.post<CompItem>('/api/admin/competiciones', { nombre: this.nueva.nombre.trim(), slug: this.nueva.slug, fechaInicio: this.nueva.fecha || undefined, ...(this.nueva.clonarDe ? { clonarDe: this.nueva.clonarDe } : {}) }));
      this.nuevaOpen.set(false);
      await this.comps.load(true);
      this.toasts.success(`«${c.nombre}» creada en borrador`);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo crear.'));
    }
  }
  protected async archivar(): Promise<void> {
    const c = this.comps.current();
    if (!c) return;
    if (!(await this.confirm.ask({ title: `¿Archivar ${c.nombre}?`, text: 'Deja de verse en la web y el backoffice queda en solo lectura para esta competición.', confirm: 'Archivar', danger: true }))) return;
    try { await firstValueFrom(this.http.post(`${this.b()}/archivar`, {})); await this.comps.load(true); this.toasts.success('Archivada'); } catch (e) { this.toasts.error(errText(e, 'No se pudo archivar.')); }
  }
}
