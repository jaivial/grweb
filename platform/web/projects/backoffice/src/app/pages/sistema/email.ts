import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrBadge, GrButton, GrErrorState, GrField, GrIcon, GrInput, GrSelect, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { BoPageHeader, errText } from '../../shared/ui';
import { SistemaApi, type Dominio, type Integracion } from './api';

/** Provider presets: picking one fills host, port and TLS. */
const PROVEEDORES: Record<string, { host: string; puerto: string; tls: string }> = {
  Gmail: { host: 'smtp.gmail.com', puerto: '587', tls: 'starttls' },
  'Google Workspace': { host: 'smtp-relay.gmail.com', puerto: '587', tls: 'starttls' },
  'Microsoft 365': { host: 'smtp.office365.com', puerto: '587', tls: 'starttls' },
  Mailpit: { host: 'mailpit', puerto: '1025', tls: 'no' },
  Otro: { host: '', puerto: '587', tls: 'starttls' },
};
const PUERTOS: { v: string; l: string; tls: string }[] = [
  { v: '587', l: '587 (STARTTLS)', tls: 'starttls' },
  { v: '465', l: '465 (SSL/TLS)', tls: 'si' },
  { v: '25', l: '25 (sin cifrar)', tls: 'no' },
  { v: '1025', l: '1025 (pruebas, sin TLS)', tls: 'no' },
];

/** «Sistema · email» (Figma 64 · 96:43886): SMTP server, limits and SPF/DKIM/DMARC of the sender domain. */
@Component({
  selector: 'bo-sistema-email',
  imports: [FormsModule, BoPageHeader, GrAlert, GrBadge, GrButton, GrErrorState, GrField, GrIcon, GrInput, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Email" [crumbs]="['Sistema', 'Sistema e integraciones', 'Email']">
        @if (puede() && smtp()) {
          <ng-container actions>
            <button grButton [loading]="probando()" [disabled]="!f['host'] || !f['puerto']" (click)="probar()">Enviar prueba</button>
            <button grButton variant="primary" [loading]="guardando()" [disabled]="!cambiado() || !valido()" (click)="guardar()">Guardar</button>
          </ng-container>
        }
      </bo-page-header>
      @if (error()) { <gr-error-state titulo="No se pudo cargar la configuración de email" texto="Comprueba la conexión y vuelve a intentarlo." (reintentar)="cargar()" /> }
      @else if (!puede()) { <gr-alert tone="info" icon="lock" title="Sin permiso">Necesitas el permiso «integraciones» para ver y cambiar el servidor de email.</gr-alert> }
      @else if (!smtp()) { <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]"><gr-skeleton class="h-[520px] rounded-lg" /><gr-skeleton class="h-64 rounded-lg" /></div> }
      @else {
        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div class="flex min-w-0 flex-col gap-4">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-6 font-semibold">Servidor</h2>
              <div class="mt-5 grid gap-4 sm:grid-cols-2">
                <gr-field label="Proveedor"><gr-select [ngModel]="f['proveedor']" (ngModelChange)="proveedor($event)">@for (p of proveedores; track p) { <option [value]="p">SMTP ({{ p }})</option> }</gr-select></gr-field>
                <gr-field label="Host" [error]="f['host'] || !tocado ? null : 'Obligatorio'"><input grInput [(ngModel)]="f['host']" (ngModelChange)="tocar()" autocomplete="off" placeholder="smtp.ejemplo.com" /></gr-field>
                <gr-field label="Puerto"><gr-select [ngModel]="f['puerto']" (ngModelChange)="puerto($event)">@for (p of puertos(); track p.v) { <option [value]="p.v">{{ p.l }}</option> }</gr-select></gr-field>
                <gr-field label="Usuario"><input grInput [(ngModel)]="f['usuario']" (ngModelChange)="tocar()" autocomplete="off" /></gr-field>
                <gr-field label="Contraseña de aplicación" [hint]="smtp()!.secreto ? 'Cifrada · vacía = conservar la actual' : 'Se guarda cifrada; nunca se vuelve a mostrar'">
                  <input grInput type="password" autocomplete="new-password" [(ngModel)]="secreto" (ngModelChange)="tocar()" [placeholder]="smtp()!.secreto || ''" /></gr-field>
                <gr-field label="Remitente visible" [error]="remitenteOk() ? null : 'Formato: Nombre <email@dominio>'" hint="Se muestra en el pie de los emails">
                  <input grInput [(ngModel)]="remitente" (ngModelChange)="tocar()" placeholder="GR Strength Cup <hola@grcup.es>" /></gr-field>
              </div>
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-6 font-semibold">Límites</h2>
              <div class="mt-5 grid gap-4 sm:grid-cols-2">
                <gr-field label="Envíos por minuto" hint="Ritmo máximo de la cola de emails"><input grInput type="number" min="1" max="10000" [(ngModel)]="f['porMinuto']" (ngModelChange)="tocar()" /></gr-field>
                <gr-field label="Límite diario del proveedor" [hint]="ayudaLimite()"><input grInput type="number" min="1" [(ngModel)]="f['limiteDiario']" (ngModelChange)="tocar()" /></gr-field>
              </div>
            </section>
            @if (resultado(); as r) {
              <gr-alert [tone]="r.estado === 'ok' ? 'success' : 'danger'" [icon]="r.estado === 'ok' ? 'circle-check' : 'circle-alert'" [title]="r.estado === 'ok' ? 'Prueba correcta' : 'La prueba ha fallado'">
                {{ r.estado === 'ok' ? 'Conexión y autenticación correctas' + (r.latenciaMs ? ' en ' + r.latenciaMs + ' ms' : '') + (r.enviado ? ' · email de prueba enviado a ' + r.enviado : '') + '.' : r.error }}
                @if (cambiado()) { <span class="block">Probado sin guardar: pulsa «Guardar» para aplicarlo.</span> }
              </gr-alert>
            }
          </div>
          <div class="flex flex-col gap-4">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-6 font-semibold">Dominio {{ dominio()?.dominio || dominioRemitente() || '' }}</h2>
              @if (dominio(); as d) {
                <ul class="mt-3 flex flex-col">
                  @for (r of registros(d); track r.k) {
                    <li class="flex items-center gap-3 border-b border-line-subtle py-3 last:border-0">
                      <div class="min-w-0 flex-1"><p class="text-label-m">{{ r.k }}</p><p class="truncate font-mono text-[11px] tracking-[0.06em] text-text-tertiary uppercase" [title]="r.v.valor || r.v.ayuda">{{ r.v.valor || r.v.ayuda }}</p></div>
                      <gr-badge [tone]="r.v.estado === 'correcto' ? 'success' : 'warning'">{{ r.v.estado === 'correcto' ? 'Correcto' : r.v.estado === 'falta' ? 'Falta' : 'Revisar' }}</gr-badge>
                    </li>
                  }
                </ul>
              } @else if (dominioError()) { <p class="mt-3 text-body-xs text-text-tertiary">{{ dominioError() }}</p> }
              @else { <gr-skeleton class="mt-3 h-40" /> }
            </section>
            @if (dominio(); as d) { @if (d.dmarc.estado !== 'correcto') {
              <gr-alert tone="info" icon="info" title="Sin DMARC, más emails pueden ir a spam">
                Afecta sobre todo a la newsletter. Añade el registro TXT y vuelve a comprobar.
                <button type="button" class="mt-1 inline-flex items-center gap-1 text-label-s text-info hover:underline" (click)="comprobar()">Comprobar de nuevo <gr-icon name="arrow-right" [size]="14" /></button>
              </gr-alert>
            } @else { <button grButton variant="ghost" class="self-start" (click)="comprobar()">Comprobar de nuevo</button> } }
          </div>
        </div>
      }
    </div>
  `,
})
export class SistemaEmailPage {
  private readonly api = inject(SistemaApi);
  private readonly cs = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  protected readonly proveedores = Object.keys(PROVEEDORES);
  protected readonly smtp = signal<Integracion | null>(null);
  protected readonly dominio = signal<Dominio | null>(null);
  protected readonly dominioError = signal('');
  protected readonly resultado = signal<Integracion | null>(null);
  protected readonly error = signal(false);
  protected readonly probando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly version = signal(0);
  protected f: Record<string, string> = {};
  protected secreto = '';
  protected remitente = '';
  protected tocado = false;
  private original = '';
  private readonly cid = computed(() => this.cs.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'integraciones.config'));

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => this.cargar());
    });
  }
  protected async cargar(): Promise<void> {
    this.error.set(false);
    if (!this.puede()) return;
    try {
      const s = (await this.api.integraciones(this.cid())).find((x) => x.tipo === 'smtp')!;
      this.f = { proveedor: 'Otro', puerto: '587', tls: 'starttls', porMinuto: '120', limiteDiario: '2000', ...s.config };
      this.remitente = s.config['remitente'] ? (s.config['nombreRemitente'] ? `${s.config['nombreRemitente']} <${s.config['remitente']}>` : s.config['remitente']) : '';
      this.secreto = '';
      this.tocado = false;
      this.original = this.huella();
      this.smtp.set(s);
      this.version.update((v) => v + 1);
      void this.comprobar();
    } catch {
      this.error.set(true);
    }
  }
  protected async comprobar(): Promise<void> {
    this.dominio.set(null);
    this.dominioError.set('');
    try { this.dominio.set(await this.api.dominio(this.cid())); } catch (e) { this.dominioError.set(errText(e, 'No se pudo comprobar el dominio.')); }
  }
  protected registros(d: Dominio) { return [{ k: 'SPF', v: d.spf }, { k: 'DKIM', v: d.dkim }, { k: 'DMARC', v: d.dmarc }]; }
  protected puertos() { return PUERTOS.some((p) => p.v === this.f['puerto']) ? PUERTOS : [...PUERTOS, { v: this.f['puerto'], l: this.f['puerto'], tls: this.f['tls'] }]; }
  protected proveedor(p: string): void {
    const d = PROVEEDORES[p];
    this.f = { ...this.f, proveedor: p, ...(p === 'Otro' ? {} : d) };
    this.tocar();
  }
  protected puerto(v: string): void {
    this.f = { ...this.f, puerto: v, tls: PUERTOS.find((p) => p.v === v)?.tls ?? this.f['tls'] };
    this.tocar();
  }
  protected tocar(): void {
    this.tocado = true;
    this.version.update((v) => v + 1);
  }
  private partes(): { nombre: string; email: string } | null {
    const r = this.remitente.trim();
    const m = /^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(r);
    if (m) return { nombre: m[1].trim().replace(/^"|"$/g, ''), email: m[2] };
    return /^[^<>\s]+@[^<>\s]+$/.test(r) ? { nombre: '', email: r } : r ? null : { nombre: '', email: '' };
  }
  protected remitenteOk(): boolean { this.version(); return this.partes() !== null; }
  protected dominioRemitente(): string { return this.partes()?.email.split('@')[1] ?? ''; }
  protected ayudaLimite(): string { return this.f['proveedor'] === 'Gmail' ? 'Gmail: 500/día · Workspace: 2.000/día · newsletters grandes por lotes' : 'Las campañas grandes se envían por lotes'; }
  private config(): Record<string, string> {
    const p = this.partes() ?? { nombre: '', email: '' };
    const c: Record<string, string> = {};
    for (const k of ['proveedor', 'host', 'puerto', 'usuario', 'tls', 'porMinuto', 'limiteDiario']) if (this.f[k] !== undefined && this.f[k] !== null) c[k] = String(this.f[k]).trim();
    c['remitente'] = p.email;
    c['nombreRemitente'] = p.nombre;
    return c;
  }
  private huella(): string { return JSON.stringify(this.config()) + this.secreto; }
  protected cambiado(): boolean { this.version(); return this.huella() !== this.original; }
  protected valido(): boolean { this.version(); return !!this.f['host'] && !!this.f['puerto'] && this.partes() !== null && +this.f['porMinuto'] > 0; }
  protected async probar(): Promise<void> {
    this.probando.set(true);
    try {
      const r = await this.api.probar(this.cid(), 'smtp', this.cambiado() ? { config: this.config(), secreto: this.secreto || undefined } : undefined);
      this.resultado.set(r);
      if (!this.cambiado()) this.smtp.set(r);
    } catch (e) {
      this.toasts.error('La prueba ha fallado', errText(e));
    } finally {
      this.probando.set(false);
    }
  }
  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      await this.api.guardar(this.cid(), 'smtp', this.config(), this.secreto || undefined);
      this.toasts.success('Email guardado', 'Pulsa «Enviar prueba» para comprobarlo.');
      this.resultado.set(null);
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
