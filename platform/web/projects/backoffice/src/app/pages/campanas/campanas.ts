import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts, GrSelect, GrPopover } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, Confirm, errText } from '../../shared/ui';
import { CampanasApi, ESTADO, fecha, n, type CampanaItem, type Lista, type WAEstado } from './api';

/** «Campañas · lista» (Figma page 61): campaigns by email and WhatsApp with their audience and progress. */
@Component({
  selector: 'bo-campanas',
  imports: [GrSelect, FormsModule, RouterLink, BoPageHeader, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrPopover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Campañas" subtitle="Anuncios por email y WhatsApp a tus contactos · solo a quien aceptó cada canal" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Campañas']">
        <ng-container actions>
          <a grButton [routerLink]="['/', comps.current()?.slug, 'contactos', 'bajas']">Bajas y supresiones</a>
          <a grButton icon="smartphone" [routerLink]="['/', comps.current()?.slug, 'campanas', 'whatsapp']">WhatsApp</a>
          <span class="hidden md:block"><button grButton variant="primary" icon="plus" (click)="nueva.set(true)">Nueva campaña</button></span>
        </ng-container>
      </bo-page-header>
      <div class="flex flex-wrap items-end gap-3">
        <gr-field label="Estado" class="w-56">
          <gr-select [ngModel]="estado()" (ngModelChange)="estado.set($event)">
            <option value="">Todas</option>@for (e of estados; track e.v) { <option [value]="e.v">{{ e.l }}</option> }
          </gr-select>
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
        <ul class="divide-y divide-line-subtle rounded-lg border border-line-subtle bg-bg-card">
          @for (c of l.items; track c.id) {
            <li class="relative flex items-start md:items-center">
              <a [routerLink]="['/', comps.current()?.slug, 'campanas', c.id]" class="flex min-w-0 flex-1 flex-col gap-3 py-4 pl-4 pr-1 hover:bg-bg-raised/60 md:flex-row md:items-center md:gap-5">
                <span class="hidden size-9 shrink-0 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text md:flex"><gr-icon name="send" [size]="16" /></span>
                <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ c.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.asunto || 'Sin asunto' }}@if (c.segmento) { · {{ c.segmento }} }</span></span>
                <span class="flex gap-1.5">@for (ch of c.canales; track ch) { <span class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-label-s text-text-primary" [class]="ch === 'email' ? 'border-info/50 bg-info/10 [&>gr-icon]:text-info' : 'border-success/50 bg-success/10 [&>gr-icon]:text-success'"><gr-icon [name]="ch === 'email' ? 'mail' : 'message'" [size]="14" />{{ ch === 'email' ? 'Email' : 'WhatsApp' }}</span> }</span>
                <span class="w-full md:w-48">
                  @if (total(c); as t) {
                    <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-raised"><span class="block h-full rounded-pill" [class]="c.estado === 'enviada' ? 'bg-success' : 'bg-accent'" [style.width.%]="hechos(c) * 100 / t"></span></span>
                    <span class="mt-1 block font-mono text-mono-xs text-text-tertiary">{{ n(hechos(c)) }} / {{ n(t) }}</span>
                  } @else { <span class="block font-mono text-mono-xs text-text-muted">{{ c.estado === 'programada' ? 'Programada ' + fecha(c.programadaAt) : 'Editada ' + fecha(c.updatedAt) }}</span> }
                </span>
                <gr-badge [tone]="est[c.estado].tone">{{ est[c.estado].l }}</gr-badge>
              </a>
              <span class="relative shrink-0 px-2 pt-3 md:pt-0">
                <button type="button" class="flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary" [attr.aria-label]="'Acciones de ' + c.nombre" [attr.aria-expanded]="menu() === c.id" (click)="menu.set(menu() === c.id ? null : c.id)"><gr-icon name="more" [size]="16" /></button>
                @if (menu() === c.id) {
                  <gr-popover etiqueta="Acciones de la campaña" (cerrar)="menu.set(null)">
                    <a grButton variant="ghost" icon="pencil" [routerLink]="['/', comps.current()?.slug, 'campanas', c.id]" [queryParams]="{ tab: 'diseno' }">Abrir el editor</a>
                    <button grButton variant="ghost" icon="copy" (click)="duplicar(c)">Duplicar</button>
                    @if (c.estado === 'borrador') { <button grButton variant="danger" icon="trash" (click)="borrar(c)">Eliminar</button> }
                  </gr-popover>
                }
              </span>
            </li>
          }
        </ul>
      }
    </div>
    <div class="fixed inset-x-0 bottom-16 z-30 border-t border-line-subtle bg-bg-deep/95 px-4 py-3 md:hidden"><button grButton variant="primary" icon="plus" class="w-full" (click)="nueva.set(true)">Nueva campaña</button></div>
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
  private readonly confirm = inject(Confirm);
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
  protected readonly menu = signal<string | null>(null);
  protected async duplicar(c: CampanaItem): Promise<void> {
    this.menu.set(null);
    try {
      const d = await this.api.duplicar(this.cid(), c.id);
      this.toasts.success('Campaña duplicada');
      void this.router.navigate(['/', this.comps.current()?.slug, 'campanas', d.id], { queryParams: { tab: 'diseno' } });
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo duplicar.'));
    }
  }
  protected async borrar(c: CampanaItem): Promise<void> {
    this.menu.set(null);
    if (!(await this.confirm.ask({ title: `¿Eliminar «${c.nombre}»?`, text: 'Se borra el borrador con su diseño. No se puede deshacer.', confirm: 'Eliminar', danger: true }))) return;
    try {
      await this.api.borrar(this.cid(), c.id);
      this.toasts.success('Campaña eliminada');
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo eliminar.'));
    }
  }
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

/** WhatsApp channel (evo-weai): the state of the linked number. The linking itself lives in «Sistema › WhatsApp» (Figma D4). */
@Component({
  selector: 'bo-whatsapp',
  imports: [FormsModule, RouterLink, BoPageHeader, GrAlert, GrBadge, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let w = estado();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="WhatsApp" subtitle="Canal de WhatsApp de la competición para campañas y avisos" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Campañas', 'WhatsApp']">
        <ng-container actions>
          <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-success/40 bg-success/10 px-3 text-label-s text-success"><gr-icon name="radio" [size]="16" />Conexión en vivo</span>
        </ng-container>
      </bo-page-header>
      @if (!w) { <gr-skeleton class="h-48 rounded-lg" /> } @else {
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <div class="flex flex-wrap items-center gap-3">
              <h2 class="flex-1 text-ui-h5">Estado del canal</h2>
              <gr-badge [tone]="w.conexion === 'open' ? 'success' : 'warning'">{{ w.conexion === 'open' ? 'Vinculado' : 'Sin vincular' }}</gr-badge>
            </div>
            <p class="mt-3 text-body-s text-text-secondary">{{ descripcion(w) }}</p>
            <p class="mt-3 text-body-xs text-text-tertiary">El canal lo usan las campañas y los avisos del alta</p>
            <p class="text-body-xs text-text-tertiary">Estado · {{ estadoTexto(w) }}</p>
            <p class="text-body-xs text-text-tertiary">Antes del primer envío: máximo 6 mensajes por minuto y con el consentimiento del destinatario</p>
            <gr-alert tone="info" title="La vinculación vive en Sistema › WhatsApp" class="mt-4">
              Número, QR o código y avisos de solicitudes se gestionan en un solo sitio. Aquí solo se consulta el estado del canal.
              <a alertAction [routerLink]="['/', comps.current()?.slug, 'sistema', 'whatsapp']" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text">Abrir Sistema › WhatsApp <gr-icon name="arrow-right" [size]="14" /></a>
            </gr-alert>
            <div class="mt-5 flex flex-wrap gap-2">
              <a grButton variant="primary" [routerLink]="['/', comps.current()?.slug, 'sistema', 'whatsapp']">Vincular en Sistema › WhatsApp</a>
              <a grButton variant="ghost" [routerLink]="['/', comps.current()?.slug, 'sistema', 'whatsapp']">Ver estado del servicio</a>
            </div>
          </section>
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-ui-h5">Qué se gestiona en Sistema › WhatsApp</h2>
            <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
              <li>Crear el servidor de WhatsApp de la competición</li>
              <li>Vincular el número con QR o con código</li>
              <li>Reiniciar la conexión y desconectar el número</li>
              <li>Configurar los teléfonos y el mensaje de prueba</li>
            </ul>
          </section>
        </div>
      }
    </div>
  `,
})
export class WhatsAppPage {
  private readonly api = inject(CampanasApi);
  protected readonly comps = inject(Competitions);
  protected readonly estado = signal<WAEstado | null>(null);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.api.whatsapp(this.cid()).then((w) => this.estado.set(w)).catch(() => this.estado.set(null)));
    });
  }
  protected descripcion(w: WAEstado): string {
    if (w.conexion === 'open') return `Esta competición tiene el número ${w.numero ?? ''} vinculado. Las campañas con canal WhatsApp y los avisos del alta salen por aquí.`.trim();
    if (w.conexion === 'connecting') return 'El número se está conectando. En cuanto esté listo, las campañas con canal WhatsApp y los avisos del alta saldrán por aquí.';
    return 'Esta competición no tiene número de WhatsApp vinculado. Los envíos de campañas con canal WhatsApp quedan en pausa y los avisos del alta salen solo por email.';
  }
  protected estadoTexto(w: WAEstado): string {
    if (w.conexion === 'open') return `número vinculado${w.numero ? ' · ' + w.numero : ''}`;
    if (w.conexion === 'connecting') return 'conectando';
    if (w.modo === 'simulado') return 'sin número vinculado · simulado';
    return 'sin número vinculado';
  }
}
