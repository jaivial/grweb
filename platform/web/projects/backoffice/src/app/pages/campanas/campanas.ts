import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, errText } from '../../shared/ui';
import { CampanasApi, ESTADO, fecha, n, type CampanaItem, type Lista, type WAEstado } from './api';

/** «Campañas · lista» (Figma page 61): campaigns by email and WhatsApp with their audience and progress. */
@Component({
  selector: 'bo-campanas',
  imports: [FormsModule, RouterLink, BoPageHeader, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Campañas" subtitle="Anuncios por email y WhatsApp a tus contactos · solo a quien aceptó cada canal" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Campañas']">
        <ng-container actions>
          <a grButton [routerLink]="['/', comps.current()?.slug, 'contactos', 'bajas']">Bajas y supresiones</a>
          <a grButton icon="smartphone" [routerLink]="['/', comps.current()?.slug, 'campanas', 'whatsapp']">WhatsApp</a>
          <button grButton variant="primary" icon="plus" (click)="nueva.set(true)">Nueva campaña</button>
        </ng-container>
      </bo-page-header>
      <div class="flex flex-wrap items-end gap-3">
        <gr-field label="Estado" class="w-56">
          <select grInput [ngModel]="estado()" (ngModelChange)="estado.set($event)">
            <option value="">Todas</option>@for (e of estados; track e.v) { <option [value]="e.v">{{ e.l }}</option> }
          </select>
        </gr-field>
        @if (l) { <p class="pb-2.5 text-body-xs text-text-tertiary">{{ l.total }} campañas · {{ l.enCurso }} en curso</p> }
      </div>
      @if (l?.whatsapp === 'simulado') {
        <gr-alert tone="info" title="WhatsApp en modo simulado">Aún no hay un número vinculado (evo-weai): los envíos por WhatsApp quedan registrados como entregados sin salir de la plataforma. Vincúlalo en «WhatsApp».</gr-alert>
      }
      @if (l === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar las campañas"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (l === undefined) { <gr-skeleton class="h-72 rounded-lg" /> }
      @else if (!l.items.length) {
        <gr-empty icon="send" title="Aún no hay campañas">Crea una para anunciar entradas, horarios o resultados a quien aceptó recibir novedades.
          <button grButton variant="primary" class="mt-4" (click)="nueva.set(true)">Nueva campaña</button></gr-empty>
      } @else {
        <ul class="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
          @for (c of l.items; track c.id) {
            <li>
              <a [routerLink]="['/', comps.current()?.slug, 'campanas', c.id]" class="flex flex-col gap-3 px-4 py-4 hover:bg-bg-raised/60 md:flex-row md:items-center md:gap-5">
                <span class="hidden size-9 shrink-0 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text md:flex"><gr-icon name="send" [size]="16" /></span>
                <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ c.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.asunto || 'Sin asunto' }}@if (c.segmento) { · {{ c.segmento }} }</span></span>
                <span class="flex gap-1.5">@for (ch of c.canales; track ch) { <span class="inline-flex h-6 items-center gap-1 rounded-2xs border px-1.5 text-mono-xs" [class]="ch === 'email' ? 'border-info/40 text-info' : 'border-success/40 text-success'"><gr-icon [name]="ch === 'email' ? 'mail' : 'smartphone'" [size]="12" />{{ ch === 'email' ? 'Email' : 'WhatsApp' }}</span> }</span>
                <span class="w-full md:w-48">
                  @if (total(c); as t) {
                    <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-raised"><span class="block h-full rounded-pill" [class]="c.estado === 'enviada' ? 'bg-success' : 'bg-accent'" [style.width.%]="hechos(c) * 100 / t"></span></span>
                    <span class="mt-1 block font-mono text-mono-xs text-text-tertiary">{{ n(hechos(c)) }} / {{ n(t) }}</span>
                  } @else { <span class="block font-mono text-mono-xs text-text-muted">{{ c.estado === 'programada' ? 'Programada ' + fecha(c.programadaAt) : 'Editada ' + fecha(c.updatedAt) }}</span> }
                </span>
                <gr-badge [tone]="est[c.estado].tone">{{ est[c.estado].l }}</gr-badge>
              </a>
            </li>
          }
        </ul>
      }
    </div>
    @if (nueva()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="nueva.set(false)" (keydown.escape)="nueva.set(false)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Nueva campaña" (click)="$event.stopPropagation()" (ngSubmit)="crear()">
          <h2 class="text-ui-h5">Nueva campaña</h2>
          <gr-field label="Nombre interno" class="mt-4" hint="Solo lo ve el equipo"><input grInput name="nombre" [(ngModel)]="nombre" maxlength="160" placeholder="Última semana para reservar tu entrada" autofocus /></gr-field>
          <div class="mt-6 flex justify-end gap-2"><button type="button" grButton variant="ghost" (click)="nueva.set(false)">Cancelar</button><button type="submit" grButton variant="primary" [loading]="creando()" [disabled]="!nombre.trim()">Crear y diseñar</button></div>
        </form>
      </div>
    }
  `,
})
export class CampanasPage {
  private readonly api = inject(CampanasApi);
  protected readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  private readonly router = inject(Router);
  protected readonly lista = signal<Lista | null | undefined>(undefined);
  protected readonly estado = signal('');
  protected readonly nueva = signal(false);
  protected readonly creando = signal(false);
  protected nombre = '';
  protected readonly est = ESTADO;
  protected readonly estados = Object.entries(ESTADO).map(([v, x]) => ({ v, l: x.l }));
  protected readonly n = n;
  protected readonly fecha = fecha;
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  private t: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.estado();
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('campana.')) {
        clearTimeout(this.t);
        this.t = setTimeout(() => void this.cargar(), 800);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.t);
      sub.unsubscribe();
    });
  }
  async cargar(): Promise<void> {
    try {
      this.lista.set(await this.api.lista(this.cid(), this.estado()));
    } catch {
      if (!this.lista()) this.lista.set(null);
    }
  }
  protected total(c: CampanaItem): number { return (c.progreso.email?.total ?? 0) + (c.progreso.whatsapp?.total ?? 0); }
  protected hechos(c: CampanaItem): number { return (c.progreso.email?.enviados ?? 0) + (c.progreso.whatsapp?.enviados ?? 0) + (c.progreso.email?.fallidos ?? 0) + (c.progreso.whatsapp?.fallidos ?? 0); }
  protected async crear(): Promise<void> {
    this.creando.set(true);
    try {
      const c = await this.api.crear(this.cid(), this.nombre.trim());
      void this.router.navigate(['/', this.comps.current()?.slug, 'campanas', c.id], { queryParams: { tab: 'diseno' } });
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo crear.'));
    } finally {
      this.creando.set(false);
    }
  }
}

/** WhatsApp channel (evo-weai): state of the linked number and linking with a pairing code. */
@Component({
  selector: 'bo-whatsapp',
  imports: [FormsModule, BoPageHeader, GrAlert, GrBadge, GrButton, GrField, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let w = estado();
    <div class="mx-auto flex max-w-[880px] flex-col gap-5 pb-24">
      <bo-page-header title="WhatsApp" subtitle="Número de la competición para campañas y avisos (evo-weai)" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Campañas', 'WhatsApp']" />
      @if (!w) { <gr-skeleton class="h-48 rounded-lg" /> } @else {
        <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="flex-1 text-ui-h5">Estado del canal</h2>
            <gr-badge [tone]="w.conexion === 'open' ? 'success' : w.modo === 'simulado' ? 'info' : 'warning'">{{ etiqueta(w) }}</gr-badge>
          </div>
          <dl class="mt-4 grid gap-3 text-body-s sm:grid-cols-2">
            <div><dt class="text-text-tertiary">Proveedor</dt><dd>{{ w.modo === 'evo-weai' ? 'evo-weai (número propio)' : w.modo === 'simulado' ? 'Simulado (QA)' : 'Sin configurar' }}</dd></div>
            <div><dt class="text-text-tertiary">Número</dt><dd class="font-mono">{{ w.numero || '—' }}</dd></div>
          </dl>
          @if (w.detalle) { <p class="mt-3 text-body-xs text-warning">{{ w.detalle }}</p> }
        </section>
        @if (w.modo === 'evo-weai') {
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-ui-h5">Vincular el número</h2>
            <p class="mt-1 text-body-s text-text-secondary">En el móvil del número: WhatsApp › Dispositivos vinculados › Vincular con número de teléfono, y escribe el código que aparece aquí.</p>
            <div class="mt-4 flex flex-wrap items-end gap-2">
              <gr-field label="Número" class="w-64"><input grInput [(ngModel)]="numero" placeholder="+34 600 000 000" inputmode="tel" /></gr-field>
              <button grButton variant="primary" [loading]="conectando()" [disabled]="!puedeConfigurar()" (click)="conectar()">Obtener código</button>
            </div>
            @if (codigo()) { <p class="mt-4 font-mono text-display-s tracking-[0.3em]">{{ codigo() }}</p> }
            @if (!puedeConfigurar()) { <p class="mt-2 text-body-xs text-text-tertiary">Vincular el número requiere el permiso «integraciones.config».</p> }
          </section>
        } @else {
          <gr-alert tone="info" title="Cómo conectarlo">Configura la integración «WhatsApp» en «Sistema e integraciones» con proveedor evo-weai, la URL del servidor, el nombre de la instancia y su clave; después vuelve aquí para vincular el número con un código.</gr-alert>
        }
        <gr-alert tone="warning" title="Antes de usarlo (asesoría)">WhatsApp exige un consentimiento expreso y separado (ya se recoge aparte del email), baja con un mensaje («BAJA») y registro de la prueba. Con un número propio el ritmo debe ser bajo (6 por minuto por defecto) para no arriesgar el bloqueo del número.</gr-alert>
      }
    </div>
  `,
})
export class WhatsAppPage {
  private readonly api = inject(CampanasApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  protected readonly estado = signal<WAEstado | null>(null);
  protected readonly codigo = signal('');
  protected readonly conectando = signal(false);
  protected numero = '';
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puedeConfigurar = computed(() => this.auth.can(this.cid(), 'integraciones.config'));
  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.api.whatsapp(this.cid()).then((w) => {
        this.estado.set(w);
        this.numero = w.numero ?? '';
      }));
    });
  }
  protected etiqueta(w: WAEstado): string {
    return { open: 'Conectado', connecting: 'Conectando', close: 'Desconectado', simulado: 'Simulado', ninguno: 'Sin configurar' }[w.conexion];
  }
  protected async conectar(): Promise<void> {
    this.conectando.set(true);
    try {
      const r = await this.api.conectar(this.cid(), this.numero);
      this.codigo.set(r.codigo ?? '');
      if (!r.codigo) this.toasts.info('El servidor no devolvió código: revisa la instancia en evo-weai.');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo vincular.'));
    } finally {
      this.conectando.set(false);
    }
  }
}
