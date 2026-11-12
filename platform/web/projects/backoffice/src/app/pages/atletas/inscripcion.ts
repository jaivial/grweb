import { webPublica } from '../../core/web';
import { TitleCasePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrAvatar, GrBadge, GrButton, GrIconButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSegmented, GrSkeleton, GrToasts, type GrTone, GrSelect } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, errText } from '../../shared/ui';

interface Referidos { activo: boolean; modo: 'basico' | 'acumulativo'; descTipo: 'porcentaje' | 'importe'; descValor: number; recompensa: number; maxUsos: number; acumModo: 'basica' | 'multiplicador'; multiplicador: number }
interface Config { modo: 'externa' | 'propia'; cuota: number; abre?: string; cierra?: string; reserva: boolean; cupones: boolean; referidos: Referidos; version: number }
interface Cupon { id: string; codigo: string; tipo: 'porcentaje' | 'importe'; valor: number; limite?: number; caduca?: string; activo: boolean; usos: number; ahorro: number; estado: 'activo' | 'pausado' | 'agotado' | 'caducado' }
interface CodigoRef { id: string; codigo: string; atleta: string; club: string; pagado: number; invitados: number; descuento: number; devuelto: number; fallidas: number; ajustes?: Referidos }
interface Pago {
  id: string; fecha: string; atleta: string; email: string; atletaId?: string; cuota: number; descCupon: number; descReferido: number; total: number; devuelto: number; cupon: string; referido: string;
  estado: 'pendiente_pago' | 'pagada' | 'gratuita' | 'reserva' | 'cancelada' | 'fallida'; proveedor: string; referencia: string; tarjeta: string; pagadaAt?: string;
  devoluciones?: { importe: number; motivo: string; detalle: string; ref: string; por: string; at: string }[];
}
interface Pagos { items: Pago[]; recaudado: number; devuelto: number; pendientes: number; rechazados: number; pasarela: string; pruebas: boolean }
type Tab = 'config' | 'cupones' | 'referidos' | 'pagos';
/** The AEP registration of the competition (competition service: link, state, places, contact, internal note). */
interface Aep { modo: string; url: string; estado: 'proximamente' | 'abierta' | 'completa' | 'cerrada'; plazas?: number; responsable: { nombre: string; email: string }; nota: string }

export const euros = (c?: number | null) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format((c ?? 0) / 100);
const ESTADO_PAGO: Record<Pago['estado'], { label: string; tone: GrTone }> = {
  pagada: { label: 'Pagado', tone: 'success' }, gratuita: { label: 'Gratis (cupón)', tone: 'success' }, reserva: { label: 'Reserva', tone: 'info' },
  pendiente_pago: { label: 'Pendiente', tone: 'warning' }, cancelada: { label: 'Cancelado', tone: 'neutral' }, fallida: { label: 'Rechazado', tone: 'danger' },
};
const ESTADO_CUPON: Record<Cupon['estado'], GrTone> = { activo: 'success', pausado: 'neutral', agotado: 'warning', caducado: 'neutral' };

/** «Inscripción» (Figma page 66): own registration with payment, coupons, referrals and payments. */
@Component({
  selector: 'bo-inscripcion',
  imports: [GrSelect, FormsModule, RouterLink, TitleCasePipe, BoPageHeader, BoToggle, BoDrawer, GrAlert, GrAvatar, GrBadge, GrButton, GrIconButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSegmented, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6 pb-24">
      <bo-page-header title="Inscripción" [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Atletas', 'Inscripción']">
        @if (tab() === 'config') { <a actions grButton icon="external-link" [href]="web + '/inscripcion'" target="_blank" rel="noopener">Ver /inscripcion</a> }
        @if (tab() === 'config' && (canEdit() || canEditAep())) { <button actions grButton variant="primary" [loading]="guardando()" (click)="guardarConfig()">Guardar</button> }
        @if (tab() === 'cupones' && canEdit()) { <button actions grButton variant="primary" icon="plus" (click)="editarCupon(null)">Nuevo cupón</button> }
        @if (tab() === 'referidos' && canEdit()) { <button actions grButton variant="primary" [loading]="guardando()" (click)="guardarConfig()">Guardar</button> }
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" role="tablist" aria-label="Inscripción">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" (click)="cambiar(t.key); $any($event.currentTarget).scrollIntoView({ block: 'nearest', inline: 'nearest' })" [disabled]="bloqueada(t.key)"
            [attr.title]="bloqueada(t.key) ? 'Solo con la inscripción propia con pago' : null"
            class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s disabled:cursor-not-allowed disabled:opacity-40" [class]="tab() === t.key ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
            {{ t.label }}
            @if (t.key === 'cupones' && cupones()) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ cupones()!.length }}</span> }
            @if (t.key === 'pagos' && pagos()) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ pagos()!.items.length }}</span> }
            @if (tab() === t.key) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
          </button>
        }
      </nav>
      @if (conflicto()) { <gr-alert tone="warning" title="Otra persona ha cambiado la configuración">Recarga para ver sus cambios. <button alertAction grButton size="s" class="mt-2" (click)="cargar()">Recargar</button></gr-alert> }

      @let c = cfg();
      @switch (tab()) {
        @case ('config') {
          @if (!c) { <gr-skeleton class="h-96 rounded-lg" /> } @else {
            <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,736px)_260px]">
              <div class="flex min-w-0 flex-col gap-6">
                <!-- Figma 66 «Inscripción · modo AEP (por defecto)»: the mode as two cards, then the data of that mode -->
                <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                  <h2 class="text-ui-h5">Modo de inscripción</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">{{ hayPagadas() ? 'Bloqueado: ya hay inscripciones pagadas' : 'Se puede cambiar mientras no haya inscripciones pagadas' }}</p>
                  <div class="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Modo de inscripción">
                    @for (m of modos; track m.value) {
                      <button type="button" role="radio" [attr.aria-checked]="c.modo === m.value" [disabled]="!canEdit() || (hayPagadas() && c.modo !== m.value)" [attr.title]="hayPagadas() && c.modo !== m.value ? 'Ya hay inscripciones pagadas' : null" (click)="c.modo = m.value; tocado.set(true)"
                        class="flex items-start gap-3.5 rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed" [class]="c.modo === m.value ? 'border-accent bg-accent/8' : 'border-line-subtle bg-bg-surface hover:border-line-strong'">
                        <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2" [class]="c.modo === m.value ? 'border-accent' : 'border-line-strong'">@if (c.modo === m.value) { <span class="size-2.5 rounded-full bg-accent"></span> }</span>
                        <span class="flex flex-col gap-1"><span class="flex items-center gap-2 text-label-m">{{ m.label }}@if (m.value === 'externa') { <span class="sr-only">. </span><gr-badge class="shrink-0" tone="success">Por defecto</gr-badge> }</span><span class="sr-only">. </span><span class="text-body-s text-text-tertiary">{{ m.desc }}</span></span>
                      </button>
                    }
                  </div>
                </section>
                @if (c.modo === 'externa') {
                  @let a = aep();
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                    <h2 class="text-ui-h5">Inscripción en la AEP</h2>
                    <p class="mt-0.5 text-body-xs text-text-tertiary">Lo que ve el atleta en /inscripcion</p>
                    @if (!a) { <gr-skeleton class="mt-4 h-40" /> } @else {
                      <div class="mt-4 grid gap-4 md:grid-cols-2">
                        <gr-field label="Enlace de inscripción de la AEP" for="a-url" class="md:col-span-2" hint="Se abre en una pestaña nueva" [error]="urlMal() ? 'Debe empezar por https://' : ''"><input grInput id="a-url" type="url" placeholder="https://powerliftingspain.es/…" [(ngModel)]="a.url" (ngModelChange)="tocado.set(true)" [invalid]="urlMal()" [disabled]="!canEditAep()" /></gr-field>
                        <gr-field label="Estado" for="a-estado"><gr-select id="a-estado" [(ngModel)]="a.estado" (ngModelChange)="tocado.set(true)" [disabled]="!canEditAep()">@for (e of estadosAep; track e.v) { <option [value]="e.v">{{ e.l }}</option> }</gr-select></gr-field>
                        <gr-field label="Plazas (cupo AEP)" for="a-plazas"><input grInput id="a-plazas" type="number" min="0" max="5000" [(ngModel)]="a.plazas" (ngModelChange)="tocado.set(true)" [disabled]="!canEditAep()" /></gr-field>
                        <gr-field label="Email de dudas" for="a-email"><input grInput id="a-email" type="email" [(ngModel)]="a.responsable.email" (ngModelChange)="tocado.set(true)" [disabled]="!canEditAep()" /></gr-field>
                        <gr-field label="Responsable" for="a-resp"><input grInput id="a-resp" [(ngModel)]="a.responsable.nombre" (ngModelChange)="tocado.set(true)" [disabled]="!canEditAep()" /></gr-field>
                        <gr-field label="Nota interna (no se publica)" for="a-nota" class="md:col-span-2"><input grInput id="a-nota" [(ngModel)]="a.nota" (ngModelChange)="tocado.set(true)" [disabled]="!canEditAep()" /></gr-field>
                      </div>
                      @if (!canEditAep()) { <p class="mt-3 text-body-xs text-text-tertiary">Editar los datos de la AEP requiere el permiso «evento.editar».</p> }
                      <gr-alert class="mt-4" tone="info" title="Cupones, referidos y pagos no se usan">Con la inscripción en la AEP el pago lo gestiona la federación. Esas pestañas se activan al elegir «Inscripción propia con pago» y guardar.</gr-alert>
                    }
                  </section>
                } @else {
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                    <h2 class="text-ui-h5">Inscripción propia con pago</h2>
                    <p class="mt-0.5 text-body-xs text-text-tertiary">Formulario en /inscripcion con cuota, plazas, cupones y referidos</p>
                    <div class="mt-4 grid gap-4 md:grid-cols-2">
                      <gr-field label="Cuota de inscripción (€)" for="i-cuota" hint="IVA incluido"><input grInput id="i-cuota" type="number" min="0" step="0.5" [ngModel]="c.cuota / 100" (ngModelChange)="c.cuota = round($event); tocado.set(true)" [disabled]="!canEdit()" /></gr-field>
                      <gr-field label="Plazas" for="i-plazas" hint="El cupo de atletas del evento"><input grInput id="i-plazas" type="number" min="0" max="5000" [ngModel]="aep()?.plazas ?? plazas()" (ngModelChange)="ponerPlazas($event)" [disabled]="!canEditAep()" /></gr-field>
                      <gr-field label="Abre" for="i-abre" [optional]="true"><input grInput id="i-abre" type="datetime-local" [ngModel]="local(c.abre)" (ngModelChange)="c.abre = iso($event); tocado.set(true)" [disabled]="!canEdit()" /></gr-field>
                      <gr-field label="Cierra" for="i-cierra" [optional]="true"><input grInput id="i-cierra" type="datetime-local" [ngModel]="local(c.cierra)" (ngModelChange)="c.cierra = iso($event); tocado.set(true)" [disabled]="!canEdit()" /></gr-field>
                    </div>
                    <ul class="mt-4">
                      <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Lista de reserva al completarse</span><span class="block text-body-xs text-text-tertiary">Las inscripciones de más quedan en reserva, sin cobrar, hasta que haya plaza</span></span><bo-toggle [(value)]="c.reserva" label="Lista de reserva" [disabled]="!canEdit()" /></li>
                      <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Aceptar cupones de descuento</span><span class="block text-body-xs text-text-tertiary">{{ cupones()?.length ?? 0 }} cupones · se gestionan en la pestaña Cupones</span></span><bo-toggle [(value)]="c.cupones" label="Aceptar cupones" [disabled]="!canEdit()" /></li>
                      <li class="flex items-center justify-between gap-4 py-2"><span><span class="block text-label-s">Programa de referidos</span><span class="block text-body-xs text-text-tertiary">Cada inscrito recibe su código para invitar</span></span><bo-toggle [(value)]="c.referidos.activo" label="Programa de referidos" [disabled]="!canEdit()" /></li>
                    </ul>
                  </section>
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                    <h2 class="text-ui-h5">Pasarela de pago</h2>
                    <p class="mt-0.5 text-body-xs text-text-tertiary">Sistema → Integraciones → Stripe</p>
                    <dl class="mt-3 text-body-s">
                      <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Proveedor</dt><dd>{{ pagos()?.pasarela === 'stripe' ? 'Stripe' + (pagos()?.pruebas ? ' (modo test)' : '') : 'Pasarela simulada (modo pruebas)' }}</dd></div>
                      <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Claves de Stripe</dt><dd>{{ pagos()?.pasarela === 'stripe' ? 'Configuradas' : 'No configuradas' }}</dd></div>
                      <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Webhook</dt><dd class="text-right">/api/webhooks/pagos/inscripciones · firma HMAC</dd></div>
                      <div class="flex justify-between gap-3 py-2"><dt class="text-text-tertiary">Reembolsos</dt><dd>Totales o parciales desde Pagos</dd></div>
                    </dl>
                    @if (pagos()?.pasarela === 'ninguna') { <gr-alert class="mt-3" tone="warning" title="Pagos sin configurar">Añade las claves de Stripe en Sistema → Integraciones. Sin ellas solo se aceptan inscripciones gratuitas (cupón del 100 %) o en reserva.</gr-alert> }
                    @if (pagos()?.pruebas) { <gr-alert class="mt-3" tone="info" title="Modo pruebas: no se cobra nada">La pasarela simulada reproduce Stripe Checkout (tarjetas de prueba, pago rechazado, 3D Secure) y envía el mismo webhook firmado. Al añadir claves de Stripe se usa Stripe sin cambiar nada más.</gr-alert> }
                  </section>
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                    <h2 class="text-ui-h5">Textos que acepta el atleta</h2>
                    <p class="mt-0.5 text-body-xs text-text-tertiary">Casillas sin marcar, obligatorias para pagar</p>
                    <dl class="mt-3 text-body-s">
                      @for (t of textosLegales; track t[0]) { <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">{{ t[0] }}</dt><dd>{{ t[1] }}</dd></div> }
                    </dl>
                  </section>
                }
              </div>
              <!-- what /inscripcion shows with these settings (Figma: phone mock) -->
              <aside class="flex h-fit flex-col gap-1 lg:sticky lg:top-4">
                <h2 class="text-ui-h5">Así lo ve el atleta</h2>
                <p class="text-body-xs text-text-tertiary">/inscripcion</p>
                <div class="mx-auto mt-3 flex min-h-[560px] w-[260px] flex-col gap-3 rounded-[30px] border-[6px] border-[#3a3434] bg-bg-base p-3 pt-2 lg:mx-0">
                  <span class="mx-auto mb-2 h-1.5 w-16 rounded-pill bg-black" aria-hidden="true"></span>
                  @if (c.modo === 'externa') {
                    @let a = aep();
                    @if (a?.estado === 'proximamente') { <gr-badge tone="warning">Próximamente</gr-badge><p class="font-display text-[22px] uppercase italic">Próximamente…</p><p class="text-body-xs text-text-tertiary">Las inscripciones todavía no están abiertas.</p> }
                    @else if (a?.estado === 'completa' || a?.estado === 'cerrada') { <gr-badge tone="neutral">{{ a?.estado === 'completa' ? 'Inscripciones completas' : 'Inscripciones cerradas' }}</gr-badge><p class="font-display text-[22px] uppercase italic">{{ a?.estado === 'completa' ? 'Plazas completas' : 'Inscripción cerrada' }}</p>@if (a?.estado === 'completa' && a?.url) { <p class="text-body-xs text-text-tertiary">Con el botón «Lista de espera en la AEP»</p> } }
                    @else {
                      <p class="font-display text-[22px] uppercase italic">Inscripciones AEP</p>
                      <p class="text-body-xs text-text-secondary">La inscripción al campeonato se realiza en la web oficial de la Asociación Española de Powerlifting.</p>
                      @if (a?.url && !urlMal()) { <span class="inline-flex h-10 items-center justify-center rounded-sm bg-accent px-3 text-label-s text-white">Ir a la inscripción oficial AEP</span> }
                      @else { <p class="rounded-sm border border-warning bg-warning/8 px-3 py-2 text-left text-body-xs text-text-secondary">Sin enlace: la web dice que la URL de la AEP se publicará próximamente.</p> }
                    }
                  } @else {
                    <p class="font-display text-[26px] uppercase italic">¡Inscríbete!</p>
                    <p class="-mt-2 text-body-xs text-text-secondary">{{ euros(c.cuota) }}{{ plazas() ? ' · ' + plazas() + ' plazas' : '' }}{{ c.cierra ? (cerrada(c.cierra) ? ' · cerrada' : ' · cierra el ' + fecha(c.cierra).slice(0, 5)) : '' }}</p>
                    @for (f of ['Nombre y apellidos', 'Email', 'Categoría de peso']; track f) { <span class="flex h-9 items-center rounded-sm border border-line-subtle px-2.5 text-body-xs text-text-tertiary">{{ f }}</span> }
                    @let cp = cuponEjemplo();
                    @if (c.cupones && cp) {
                      <span class="flex gap-1.5"><span class="flex h-9 flex-1 items-center rounded-sm border border-success px-2.5 text-mono-xs">{{ cp.codigo }}</span><span class="flex h-9 items-center rounded-sm border border-line-subtle px-2 text-mono-xs uppercase text-success">Aplicado</span></span>
                    }
                    <div class="flex flex-col gap-2 rounded-md border border-line-subtle p-3 text-body-s">
                      <span class="flex justify-between"><span class="text-text-secondary">Inscripción</span><span class="text-mono-xs">{{ euros(c.cuota) }}</span></span>
                      @if (c.cupones && cp) { <span class="flex justify-between"><span class="text-text-secondary">Cupón {{ cp.codigo }}</span><span class="text-mono-xs text-success">−{{ euros(descEjemplo()) }}</span></span> }
                      <span class="flex justify-between border-t border-line-subtle pt-2"><span class="text-label-m">Total</span><span class="text-ui-h5">{{ euros(c.cuota - descEjemplo()) }}</span></span>
                    </div>
                    <span class="flex h-10 items-center justify-center rounded-sm bg-accent text-label-s text-white">Pagar {{ euros(c.cuota - descEjemplo()) }}</span>
                  }
                </div>
              </aside>
            </div>
          }
        }

        @case ('cupones') {
          @let l = cupones();
          @if (l) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Cupones activos" [value]="activos() + ''" [caption]="'de ' + l.length" />
              <gr-kpi label="Inscripciones con cupón" [value]="usosTotales() + ''" caption="pagadas o gratuitas" />
              <gr-kpi label="Descuento aplicado" [value]="euros(ahorroTotal())" caption="en inscripciones confirmadas" />
              <gr-kpi label="Inscritos gratis" [value]="gratis() + ''" caption="cupón del 100 % o sin pago" />
            </div>
          }
          @if (l?.length) {
            <div class="flex flex-wrap items-center gap-2 lg:flex-nowrap">
              <label class="relative w-full md:w-[280px] md:shrink-0"><span class="sr-only">Buscar código</span><gr-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" /><input grInput class="pl-9" placeholder="Buscar código…" [ngModel]="qCupon()" (ngModelChange)="qCupon.set($event)" /></label>
              <gr-select tipo="filtro" class="shrink-0" aria-label="Estado" [ngModel]="fEstado()" (ngModelChange)="fEstado.set($event)"><option value="">Estado</option>@for (e of estadosCupon; track e) { <option [value]="e">{{ e | titlecase }}</option> }</gr-select>
              <gr-select tipo="filtro" class="shrink-0" aria-label="Tipo" [ngModel]="fTipo()" (ngModelChange)="fTipo.set($event)"><option value="">Tipo</option><option value="porcentaje">Porcentaje</option><option value="importe">Importe fijo</option></gr-select>
              <gr-select tipo="filtro" class="shrink-0" aria-label="Caducidad" [ngModel]="fCaduca()" (ngModelChange)="fCaduca.set($event)"><option value="">Caducidad</option><option value="con">Con fecha</option><option value="sin">Sin fecha</option><option value="caducado">Caducados</option></gr-select>
              <span class="ml-auto whitespace-nowrap text-body-xs text-text-tertiary">{{ cuponesFiltrados().length }} de {{ l.length }} cupones</span>
              <button grButton size="s" icon="download" (click)="exportarCupones()">Exportar</button>
            </div>
          }
          <section class="rounded-lg border-line-subtle md:border md:bg-bg-card">
            @if (!l) { <div class="p-5"><gr-skeleton class="h-40" /></div> }
            @else if (!l.length) { <gr-empty class="py-10" icon="ticket" title="Sin cupones" text="Crea un código de descuento sobre la cuota de inscripción." /> }
            @else if (!cuponesFiltrados().length) { <gr-empty class="py-10" icon="search" title="Ningún cupón coincide" text="Cambia la búsqueda o los filtros." /> }
            @else {
              <table class="hidden w-full table-fixed text-left md:table">
                <thead class="border-b border-line-subtle text-mono-xs uppercase tracking-wide text-text-tertiary"><tr><th class="w-[216px] px-4 py-3 font-normal">Código</th><th class="w-[156px] px-3 py-3 font-normal">Descuento</th><th class="px-3 py-3 font-normal">Usos</th><th class="w-28 px-3 py-3 font-normal">Caduca</th><th class="w-32 px-3 py-3 text-right font-normal">Ahorro total</th><th class="w-32 px-3 py-3 font-normal">Estado</th><th class="w-12"></th></tr></thead>
                <tbody>
                  @for (cp of cuponesFiltrados(); track cp.id) {
                    <tr class="h-14 cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" [class.opacity-55]="cp.estado === 'caducado'" tabindex="0" [attr.aria-label]="'Editar cupón ' + cp.codigo" (click)="editarCupon(cp)" (keydown.enter)="editarCupon(cp)" (keydown.space)="$event.preventDefault(); editarCupon(cp)">
                      <td class="px-4 py-3 text-mono-s">{{ cp.codigo }}</td><td class="px-3 py-3 text-mono-s">{{ desc(cp.tipo, cp.valor) }}</td>
                      <td class="px-3 py-3"><span class="flex min-w-0 items-center gap-2"><span class="h-1 min-w-0 flex-1 overflow-hidden rounded-pill bg-bg-raised"><span class="block h-full min-w-1 rounded-pill" [class]="cp.estado === 'agotado' ? 'bg-success' : 'bg-warning'" [style.width.%]="cp.limite ? Math.min(100, (cp.usos * 100) / cp.limite) : 0"></span></span><span class="shrink-0 text-mono-xs text-text-secondary">{{ cp.usos }} / {{ cp.limite ?? 'sin límite' }}</span></span></td>
                      <td class="px-3 py-3 text-body-s">{{ cp.caduca ? fecha(cp.caduca) : '—' }}</td><td class="px-3 py-3 text-right text-mono-s">{{ euros(cp.ahorro) }}</td>
                      <td class="px-3 py-3"><gr-badge [tone]="estadoCupon[cp.estado]">{{ cp.estado | titlecase }}</gr-badge></td><td class="px-2 text-center"><button grIconButton icon="more" [label]="'Acciones del cupón ' + cp.codigo" tabindex="-1" (click)="$event.stopPropagation(); editarCupon(cp)"></button></td>
                    </tr>
                  }
                </tbody>
              </table>
              <ul class="flex flex-col gap-4 md:hidden">
                @for (cp of cuponesFiltrados(); track cp.id) {
                  <li class="rounded-lg border border-line-subtle bg-bg-card"><button type="button" class="flex w-full flex-col gap-2 p-4 text-left focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" (click)="editarCupon(cp)">
                    <span class="flex items-center justify-between"><span class="text-mono-s">{{ cp.codigo }}</span><gr-badge [tone]="estadoCupon[cp.estado]">{{ cp.estado | titlecase }}</gr-badge></span>
                    <span class="text-body-m text-text-secondary">{{ desc(cp.tipo, cp.valor) }}{{ cp.caduca ? (cp.estado === 'caducado' || cp.estado === 'agotado' ? ' · caducó ' : ' · caduca ') + fecha(cp.caduca).slice(0, 5) : ' · sin caducidad' }}</span>
                    <span class="text-body-xs text-text-tertiary">{{ cp.usos }} / {{ cp.limite ?? 'sin límite' }} usos</span>
                  </button></li>
                }
              </ul>
            }
          </section>
        }

        @case ('referidos') {
          @if (c) {
            <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
              <div class="flex min-w-0 flex-col gap-4">
              <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
                <h2 class="text-ui-h5">Programa de referidos</h2>
                <div class="flex items-center justify-between gap-4"><span><span class="block text-label-m">Activo</span><span class="block text-body-xs text-text-tertiary">Los nuevos inscritos reciben su código en el email de confirmación y en su área</span></span><bo-toggle [(value)]="c.referidos.activo" label="Activo" [disabled]="!canEdit()" /></div>
                <gr-segmented class="self-start" label="Modo" [options]="modosRef" [(value)]="c.referidos.modo" />
                <div class="grid gap-4 md:grid-cols-2">
                  <gr-field label="Descuento para quien se inscribe" for="r-d"><div class="flex gap-2"><input grInput id="r-d" type="number" min="0" [ngModel]="c.referidos.descTipo === 'porcentaje' ? c.referidos.descValor : c.referidos.descValor / 100" (ngModelChange)="c.referidos.descValor = c.referidos.descTipo === 'porcentaje' ? +$event : round($event)" [disabled]="!canEdit()" /><gr-select class="w-24" [(ngModel)]="c.referidos.descTipo" [disabled]="!canEdit()"><option value="porcentaje">%</option><option value="importe">€</option></gr-select></div></gr-field>
                  <gr-field label="Recompensa para quien invita" hint="€ por invitado" for="r-r"><input grInput id="r-r" type="number" min="0" step="0.5" [ngModel]="c.referidos.recompensa / 100" (ngModelChange)="c.referidos.recompensa = round($event)" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Invitados máximos por código" for="r-m" hint="0 = sin límite"><input grInput id="r-m" type="number" min="0" [(ngModel)]="c.referidos.maxUsos" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Tope de devolución" for="r-t"><input grInput id="r-t" [value]="euros(c.cuota) + ' (lo que pagó)'" disabled /></gr-field>
                </div>
              </section>
              <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6" [class.opacity-55]="c.referidos.modo !== 'acumulativo'">
                <span><h2 class="text-ui-h5">Modo acumulativo</h2><p class="mt-0.5 text-body-xs text-text-tertiary">Solo si eliges «Acumulativo»</p></span>
                <fieldset class="flex flex-col gap-4" [disabled]="!canEdit() || c.referidos.modo !== 'acumulativo'">
                  <gr-segmented class="self-start" label="Acumulativo" [options]="acumModos" [(value)]="c.referidos.acumModo" />
                  @if (c.referidos.acumModo === 'multiplicador') { <gr-field class="md:max-w-[315px]" label="Multiplicador" for="r-x" [hint]="ejemploMult()"><input grInput id="r-x" type="number" min="1" max="5" step="0.1" [(ngModel)]="c.referidos.multiplicador" /></gr-field> }
                </fieldset>
              </section>
              <gr-alert tone="info" title="Devoluciones sobre el pago original">La recompensa se devuelve como reembolso parcial del pago de quien invita (no es dinero nuevo ni un premio). Si la inscripción del invitado se anula o se reembolsa, la recompensa se deshace si aún no se ha devuelto.</gr-alert>
              </div>
              <div class="flex flex-col gap-4">
              <aside class="h-fit rounded-lg border border-line-subtle bg-bg-card p-6">
                <h2 class="text-ui-h5">Así funciona</h2>
                <p class="mt-0.5 text-body-xs text-text-tertiary">Ejemplo con la configuración actual</p>
                <dl class="mt-3 text-body-s">
                  @for (e of ejemplo(); track e[0]) { <div class="flex justify-between gap-3 border-b border-line-subtle py-2 last:border-0"><dt class="text-text-tertiary">{{ e[0] }}</dt><dd>{{ e[1] }}</dd></div> }
                </dl>
              </aside>
              <!-- what the athlete sees in their area (Figma: phone «Invita y ahorra») -->
              <div class="mx-auto flex min-h-[300px] w-[260px] flex-col gap-3 rounded-[30px] border-[6px] border-[#3a3434] bg-bg-base p-3 pt-2 lg:mx-0" aria-label="Vista previa del área del atleta">
                <span class="mx-auto mb-1 h-1.5 w-16 rounded-pill bg-black" aria-hidden="true"></span>
                <p class="text-label-m">Invita y ahorra</p>
                <span class="flex h-10 items-center justify-between rounded-sm border border-line-strong px-3"><span class="text-mono-xs">{{ refs()?.[0]?.codigo ?? 'LAURA412' }}</span><span class="text-mono-xs uppercase text-accent-text">Copiar</span></span>
                <span class="flex justify-between border-b border-line-subtle pb-2 text-body-s"><span class="text-text-secondary">Invitados</span><span>{{ refs()?.[0]?.invitados ?? 0 }} / {{ c.referidos.maxUsos || '∞' }}</span></span>
                <span class="flex justify-between border-b border-line-subtle pb-2 text-body-s"><span class="text-text-secondary">Devuelto</span><span>{{ euros(refs()?.[0]?.devuelto ?? 0) }}</span></span>
              </div>
              </div>
            </div>
          }
          <section class="rounded-lg border border-line-subtle bg-bg-card">
            <header class="hidden border-b border-line-subtle px-4 py-3 text-mono-xs uppercase tracking-wide text-text-tertiary md:flex"><span class="flex-1 pl-12">Atleta</span><span class="w-28">Código</span><span class="w-20 text-right">Invitados</span><span class="w-28 text-right">Devuelto</span><span class="w-24 pl-3">Ajustes</span></header>
            @if (!refs()) { <div class="p-5"><gr-skeleton class="h-24" /></div> }
            @else if (!refs()!.length) { <gr-empty class="py-8" icon="users" title="Aún no hay códigos" text="Se crean al confirmarse cada inscripción pagada." /> }
            @else {
              <ul>
                @for (r of refs(); track r.id) {
                  <li class="border-b border-line-subtle last:border-0"><button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-raised/60 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgb(230_96_107/0.9)]" [class.bg-accent/8]="refSel()?.id === r.id && refOpen()" (click)="editarRef(r)">
                    <gr-avatar [name]="r.atleta" />
                    <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ r.atleta }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ r.club || 'Independiente' }} · pagó {{ euros(r.pagado) }}</span></span>
                    <span class="hidden w-28 text-mono-s text-text-secondary md:block">{{ r.codigo }}</span>
                    <span class="w-20 text-right text-mono-s">{{ r.invitados }}<span class="md:hidden"> inv.</span></span>
                    <span class="hidden w-28 text-right text-mono-s md:block">{{ euros(r.devuelto) }}</span>
                    <span class="hidden w-24 pl-3 md:block">@if (r.fallidas) { <gr-badge tone="danger" [attr.title]="r.fallidas + ' devoluciones fallidas'">{{ r.fallidas }} fallida{{ r.fallidas === 1 ? '' : 's' }}</gr-badge> } @else { <gr-badge [tone]="r.ajustes ? 'accent' : 'neutral'">{{ r.ajustes ? 'Propios' : 'General' }}</gr-badge> }</span>
                  </button></li>
                }
              </ul>
            }
          </section>
        }

        @case ('pagos') {
          @let p = pagos();
          @if (p) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Recaudado" [value]="euros(p.recaudado)" caption="inscripciones pagadas" />
              <gr-kpi label="Devuelto" [value]="euros(p.devuelto)" caption="referidos y reembolsos" />
              <gr-kpi label="Pendientes" [value]="p.pendientes + ''" [caption]="reservas() ? 'y ' + reservas() + ' en reserva' : 'se liberan en 30 min'" />
              <gr-kpi label="Rechazados" [value]="p.rechazados + ''" caption="tarjeta denegada" />
            </div>
            @if (p.pruebas) { <gr-alert tone="info" title="Modo pruebas">Pagos con {{ p.pasarela === 'simulado' ? 'la pasarela simulada' : 'Stripe en modo test' }}: no se ha cobrado nada.</gr-alert> }
            <section class="rounded-lg border border-line-subtle bg-bg-card">
              @if (!p.items.length) { <gr-empty class="py-10" icon="ticket" title="Aún no hay pagos" text="Las inscripciones desde /inscripcion aparecerán aquí." /> }
              @else {
                <header class="hidden border-b border-line-subtle px-4 py-3 text-mono-xs uppercase tracking-wide text-text-tertiary md:flex md:gap-3"><span class="w-28">Fecha</span><span class="w-[258px]">Atleta</span><span class="hidden flex-1 lg:block">Concepto</span><span class="w-24 text-right">Importe</span><span class="w-36">Estado</span><span class="hidden w-28 lg:block">Referencia</span><span class="w-4"></span></header>
                <ul>
                  @for (x of p.items; track x.id) {
                    <li class="border-b border-line-subtle last:border-0"><button type="button" aria-haspopup="dialog" class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-bg-raised/60 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgb(230_96_107/0.9)]" (click)="abrirPago(x)">
                      <span class="hidden w-28 text-mono-xs md:block">{{ fechaHora(x.fecha) }}</span>
                      <span class="flex min-w-0 flex-1 items-center gap-2.5 md:w-[258px] md:flex-none"><gr-avatar class="hidden md:flex" [name]="x.atleta" /><span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ x.atleta }}</span><span class="block truncate text-body-xs text-text-tertiary"><span class="lg:hidden">{{ concepto(x) }}</span><span class="hidden lg:inline">{{ x.email }}</span></span></span></span>
                      <span class="hidden min-w-0 flex-1 truncate text-body-s lg:block">{{ concepto(x) }}</span>
                      <span class="shrink-0 text-right text-mono-s md:w-24">{{ euros(x.total) }}</span>
                      <span class="shrink-0 md:w-36"><gr-badge [tone]="x.devuelto ? 'info' : estadoPago[x.estado].tone">{{ x.devuelto ? 'Devuelto ' + euros(x.devuelto) : etiquetaPago(x) }}</gr-badge></span>
                      <span class="hidden w-28 truncate text-mono-xs normal-case text-text-secondary lg:block">{{ x.referencia }}</span>
                      <span class="hidden size-8 items-center justify-center rounded-sm text-text-tertiary md:flex" aria-hidden="true"><gr-icon name="more" [size]="16" /></span>
                    </button></li>
                  }
                </ul>
                <p class="border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">{{ p.items.length }} pagos</p>
              }
            </section>
          } @else { <gr-skeleton class="h-64 rounded-lg" /> }
        }
      }
    </div>

    <bo-drawer [(open)]="cuponOpen" [title]="cupon.id ? 'Editar cupón' : 'Nuevo cupón'">
      @if (errorDrawer()) { <gr-alert class="mb-4" tone="danger" title="No se pudo guardar">{{ errorDrawer() }}</gr-alert> }
      <div class="flex flex-col gap-4">
        <gr-field label="Código" for="c-cod" [hint]="cupon.codigo && codigoNorm() !== cupon.codigo ? 'Se guardará como ' + (codigoNorm() || '—') : 'Mayúsculas y números · único en la competición'" [error]="errCodigo()"><input grInput id="c-cod" autocomplete="off" [(ngModel)]="cupon.codigo" (ngModelChange)="errCodigo.set('')" [invalid]="!!errCodigo()" maxlength="30" /></gr-field>
        <gr-segmented label="Tipo" [options]="tiposCupon" [(value)]="cupon.tipo" />
        <div class="grid grid-cols-2 gap-3">
          <gr-field [label]="cupon.tipo === 'porcentaje' ? 'Descuento (%)' : 'Descuento (€)'" for="c-val"><input grInput id="c-val" type="number" min="1" [(ngModel)]="cupon.valorUI" /></gr-field>
          <gr-field label="Precio final" for="c-final"><input grInput id="c-final" [value]="precioFinal()" disabled /></gr-field>
        </div>
        <div class="flex items-center justify-between gap-4"><span><span class="block text-label-s">Límite de usos</span><span class="block text-body-xs text-text-tertiary">Máximo de inscripciones con este código</span></span><bo-toggle [(value)]="cupon.conLimite" label="Límite de usos" /></div>
        @if (cupon.conLimite) { <gr-field label="Usos máximos" for="c-lim"><input grInput id="c-lim" type="number" min="1" [(ngModel)]="cupon.limite" /></gr-field> }
        <div class="flex items-center justify-between gap-4"><span><span class="block text-label-s">Fecha de caducidad</span><span class="block text-body-xs text-text-tertiary">Deja de aceptarse a las 23:59 (Europe/Madrid)</span></span><bo-toggle [(value)]="cupon.conCaduca" label="Fecha de caducidad" /></div>
        @if (cupon.conCaduca) { <gr-field label="Caduca" for="c-cad"><input grInput id="c-cad" type="date" [(ngModel)]="cupon.caducaDia" /></gr-field> }
        <div class="flex items-center justify-between gap-4"><span><span class="block text-label-s">Activo</span><span class="block text-body-xs text-text-tertiary">Si lo pausas, deja de aceptarse al momento</span></span><bo-toggle [(value)]="cupon.activo" label="Activo" /></div>
        @if (cupon.usos) { <p class="text-body-xs text-text-tertiary">Ya tiene {{ cupon.usos }} usos: el descuento no se puede cambiar.</p> }
      </div>
      <ng-container drawerActions>
        @if (cupon.id && !cupon.usos) { <button grButton variant="danger" class="mr-auto" (click)="borrarCupon()">Borrar</button> }
        <button grButton variant="ghost" (click)="cuponOpen.set(false)">Cancelar</button>
        <button grButton variant="primary" [loading]="guardando()" (click)="guardarCupon()">{{ cupon.id ? 'Guardar' : 'Crear cupón' }}</button>
      </ng-container>
    </bo-drawer>

    <bo-drawer [(open)]="refOpen" [title]="(refSel()?.codigo ?? '') + ' · ajustes propios'">
      @if (refSel(); as r) {
        <p class="mb-4 text-body-s text-text-tertiary">{{ r.atleta }} · {{ r.invitados }} invitados · pagó {{ euros(r.pagado) }} · devuelto {{ euros(r.devuelto) }}</p>
        <div class="flex items-center justify-between gap-4"><span><span class="block text-label-s">Usar ajustes propios</span><span class="block text-body-xs text-text-tertiary">Si lo desactivas, vuelve a la configuración general</span></span><bo-toggle [(value)]="refPropios" label="Usar ajustes propios" /></div>
        @if (refPropios()) {
          <div class="mt-4 flex flex-col gap-4">
            <gr-segmented label="Modo" [options]="modosRef" [(value)]="refAj.modo" />
            <gr-field label="Descuento para el invitado (%)" for="a-d"><input grInput id="a-d" type="number" min="0" max="100" [(ngModel)]="refAj.descValor" /></gr-field>
            <gr-field label="Recompensa por invitado (€)" for="a-r"><input grInput id="a-r" type="number" min="0" step="0.5" [ngModel]="refAj.recompensa / 100" (ngModelChange)="refAj.recompensa = round($event)" /></gr-field>
            <gr-field label="Invitados máximos" for="a-m"><input grInput id="a-m" type="number" min="0" [(ngModel)]="refAj.maxUsos" /></gr-field>
          </div>
        }
        @if (r.pagado && r.devuelto >= r.pagado) { <gr-alert class="mt-4" tone="info" title="Tope alcanzado">Ya ha recuperado todo lo que pagó: sus invitados mantienen el descuento, pero no generan más devolución.</gr-alert> }
      }
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="refOpen.set(false)">Cancelar</button>
        <button grButton variant="primary" [loading]="guardando()" (click)="guardarRef()">Guardar</button>
      </ng-container>
    </bo-drawer>

    <bo-drawer [(open)]="pagoOpen" [title]="'Pago · ' + (pagoSel()?.atleta || '')" [sub]="pagoSel()?.referencia || ''">
      @if (pagoSel(); as x) {
        <div class="rounded-md border border-line-subtle bg-bg-surface px-4 py-2 text-body-s">
          <div class="flex justify-between py-1.5"><span class="text-text-tertiary">Cuota</span><span class="text-mono-s">{{ euros(x.cuota) }}</span></div>
          @if (x.descCupon) { <div class="flex justify-between py-1.5"><span class="text-text-tertiary">Cupón {{ x.cupon }}</span><span class="text-mono-s text-success">−{{ euros(x.descCupon) }}</span></div> }
          @if (x.descReferido) { <div class="flex justify-between py-1.5"><span class="text-text-tertiary">Referido {{ x.referido }}</span><span class="text-mono-s text-success">−{{ euros(x.descReferido) }}</span></div> }
          <div class="flex justify-between border-t border-line-subtle py-2"><span class="text-label-m">Total</span><span class="text-ui-h5">{{ euros(x.total) }}</span></div>
        </div>
        <dl class="mt-4 text-body-s">
          @for (k of datosPago(x); track k[0]) { <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">{{ k[0] }}</dt><dd class="text-right">{{ k[1] }}</dd></div> }
        </dl>
        <h3 class="mt-5 text-label-m">Devoluciones</h3>
        @for (d of x.devoluciones ?? []; track $index) { <div class="flex justify-between gap-3 border-b border-line-subtle py-2 text-body-s"><span class="text-text-tertiary">{{ fechaHora(d.at) }} · {{ d.motivo === 'referido' ? 'referido' : 'manual (' + d.por + ')' }}</span><span class="text-mono-s">−{{ euros(d.importe) }}</span></div> }
        @empty { <p class="mt-1 text-body-xs text-text-tertiary">Ninguna.</p> }
        @if (canRefund() && x.estado === 'pagada' && x.total > x.devuelto) {
          <div class="mt-5 rounded-md border border-line-subtle p-4">
            <p class="text-label-s">Reembolsar</p>
            <div class="mt-2 flex items-end gap-2">
              <gr-field class="flex-1" label="Importe (€)" for="re-imp" [hint]="'Máximo ' + euros(x.total - x.devuelto)"><input grInput id="re-imp" type="number" min="0.01" step="0.01" [(ngModel)]="reImporte" /></gr-field>
            </div>
            <label class="mt-3 flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" [(ngModel)]="reBaja" class="mt-1 size-5 accent-[#C42B3E]" />Dar de baja también (libera su plaza)</label>
            <button grButton variant="primary" class="mt-3" [loading]="guardando()" (click)="reembolsar(x)">Reembolsar {{ euros(round(reImporte)) }}</button>
          </div>
        }
        @if (x.atletaId) { <a grButton variant="ghost" class="mt-4" [routerLink]="['/', comps.current()?.slug, 'atletas', x.atletaId]">Ver ficha del atleta</a> }
      }
    </bo-drawer>
  `,
})
export class InscripcionPage {
  protected readonly web = webPublica();
  protected readonly comps = inject(Competitions);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly euros = euros;
  protected readonly estadoPago = ESTADO_PAGO;
  /** «Gratis (cupón)» only with a coupon: registrations confirmed without payment (e.g. imported) are just «Gratis». */
  protected etiquetaPago(x: Pago): string { return x.estado === 'gratuita' && !x.cupon ? 'Gratis' : ESTADO_PAGO[x.estado].label; }
  protected readonly estadoCupon = ESTADO_CUPON;
  protected readonly estadosCupon: Cupon['estado'][] = ['activo', 'pausado', 'agotado', 'caducado'];
  protected concepto(x: Pago): string { return 'Inscripción' + (x.cupon ? ' · cupón ' + x.cupon : '') + (x.referido ? ' · referido ' + x.referido : ''); }
  protected readonly tabs: { key: Tab; label: string }[] = [{ key: 'config', label: 'Configuración' }, { key: 'cupones', label: 'Cupones' }, { key: 'referidos', label: 'Referidos' }, { key: 'pagos', label: 'Pagos' }];
  protected readonly modos: { value: 'externa' | 'propia'; label: string; desc: string }[] = [
    { value: 'externa', label: 'Inscripción en la AEP', desc: 'Los atletas se inscriben en la web de la federación con su licencia. /inscripcion explica el paso y enlaza a la AEP.' },
    { value: 'propia', label: 'Inscripción propia con pago', desc: 'Formulario en /inscripcion con cuota, plazas, cupones, referidos y pago con tarjeta.' },
  ];
  protected readonly estadosAep = [{ v: 'proximamente', l: 'Próximamente' }, { v: 'abierta', l: 'Abierta' }, { v: 'completa', l: 'Completa' }, { v: 'cerrada', l: 'Cerrada' }];
  protected readonly modosRef = [{ value: 'basico', label: 'Básico' }, { value: 'acumulativo', label: 'Acumulativo' }];
  protected readonly acumModos = [{ value: 'basica', label: 'Recompensa básica' }, { value: 'multiplicador', label: 'Multiplicador' }];
  protected readonly tiposCupon = [{ value: 'porcentaje', label: 'Porcentaje' }, { value: 'importe', label: 'Importe fijo' }];
  protected readonly tab = signal<Tab>('config');
  protected readonly cfg = signal<Config | null>(null);
  /** AEP data of the competition, edited here (competition service, its own version). */
  protected readonly aep = signal<Aep | null>(null);
  /** Mode as saved: the payment tabs follow it, not the unsaved choice. */
  protected readonly modoGuardado = signal<'externa' | 'propia'>('externa');
  protected readonly tocado = signal(false);
  private aepOriginal = '';
  private compVersion = 0;
  protected readonly cupones = signal<Cupon[] | null>(null);
  protected readonly refs = signal<CodigoRef[] | null>(null);
  protected readonly pagos = signal<Pagos | null>(null);
  protected readonly guardando = signal(false);
  protected readonly conflicto = signal(false);
  protected readonly errorDrawer = signal('');
  protected readonly cuponOpen = signal(false);
  protected readonly refOpen = signal(false);
  protected readonly pagoOpen = signal(false);
  protected readonly refSel = signal<CodigoRef | null>(null);
  protected readonly pagoSel = signal<Pago | null>(null);
  protected readonly refPropios = signal(false);
  protected refAj: Referidos = this.refDefault();
  protected cupon = this.blankCupon();
  protected reImporte = 0;
  protected reBaja = false;
  private etagCfg = '';

  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'atletas.editar'));
  protected readonly canRefund = computed(() => this.auth.can(this.comps.current()?.id, 'evento.editar'));
  protected readonly canEditAep = computed(() => this.auth.can(this.comps.current()?.id, 'evento.editar'));
  protected ponerPlazas(v: unknown): void { const a = this.aep(); if (a) a.plazas = Math.max(0, Math.round(+(v as number) || 0)); this.tocado.set(true); }
  protected urlMal(): boolean { const u = this.aep()?.url?.trim(); return !!u && !/^https:\/\/\S+$/.test(u); }
  protected readonly plazas = computed(() => (this.comps.current() as { inscripcion?: { plazas?: number } } | null)?.inscripcion?.plazas ?? 0);
  protected readonly subtitulo = computed(() => {
    const c = this.cfg();
    if (!c) return '';
    if (this.tab() === 'cupones') return `Descuentos sobre la cuota de ${euros(c.cuota)}`;
    if (this.tab() === 'referidos') return `${this.refs()?.length ?? 0} códigos · ${this.invitadosTotal()} invitados · ${euros(this.devueltoTotal())} devueltos`;
    if (this.tab() === 'pagos') return '';
    return `Cómo se inscriben los atletas en la ${this.comps.current()?.nombreCorto || 'competición'}`;
  });
  protected readonly textosLegales: [string, string][] = [['Términos de inscripción', 'terminos'], ['Reglamento de la competición', '/reglamento'], ['Privacidad', 'privacidad'], ['Uso de imagen (opcional)', 'consentimiento']];
  /** First active coupon, used as the example in the phone preview. */
  protected readonly cuponEjemplo = computed(() => (this.cupones() ?? []).find((c) => c.estado === 'activo') ?? null);
  protected descEjemplo(): number {
    const c = this.cfg(), cp = this.cuponEjemplo();
    if (!c?.cupones || !cp) return 0;
    return cp.tipo === 'porcentaje' ? Math.round((c.cuota * cp.valor) / 100) : Math.min(c.cuota, cp.valor);
  }
  protected readonly Math = Math;
  /** AEP mode with no coupons or payments: nothing to show. With data (e.g. back to AEP after selling) the tabs stay open. */
  protected bloqueada(t: Tab): boolean {
    return t !== 'config' && this.modoGuardado() !== 'propia' && !this.cupones()?.length && !this.pagos()?.items.length;
  }
  protected readonly hayPagadas = computed(() => (this.pagos()?.items ?? []).some((p) => p.estado === 'pagada'));
  protected readonly reservas = computed(() => (this.pagos()?.items ?? []).filter((p) => p.estado === 'reserva').length);
  protected readonly errCodigo = signal('');
  protected codigoNorm(): string { return this.cupon.codigo.normalize('NFD').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  protected cerrada(iso: string): boolean { return new Date(iso).getTime() < Date.now(); }
  protected readonly fCaduca = signal('');
  protected exportarCupones(): void {
    const rows = [['codigo', 'tipo', 'valor', 'usos', 'limite', 'caduca', 'ahorro', 'estado'], ...this.cuponesFiltrados().map((c) => [c.codigo, c.tipo, c.tipo === 'porcentaje' ? c.valor : c.valor / 100, c.usos, c.limite ?? '', c.caduca ?? '', c.ahorro / 100, c.estado])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'cupones.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  protected readonly qCupon = signal('');
  protected readonly fEstado = signal('');
  protected readonly fTipo = signal('');
  protected readonly cuponesFiltrados = computed(() => {
    const q = this.qCupon().trim().toUpperCase(), e = this.fEstado(), t = this.fTipo(), k = this.fCaduca();
    return (this.cupones() ?? []).filter((c) => (!q || c.codigo.includes(q)) && (!e || c.estado === e) && (!t || c.tipo === t)
      && (!k || (k === 'con' ? !!c.caduca : k === 'sin' ? !c.caduca : c.estado === 'caducado')));
  });
  protected readonly activos = computed(() => (this.cupones() ?? []).filter((c) => c.estado === 'activo').length);
  protected readonly usosTotales = computed(() => (this.cupones() ?? []).reduce((a, c) => a + c.usos, 0));
  protected readonly ahorroTotal = computed(() => (this.cupones() ?? []).reduce((a, c) => a + c.ahorro, 0));
  protected readonly gratis = computed(() => (this.pagos()?.items ?? []).filter((p) => p.estado === 'gratuita').length);
  protected readonly invitadosTotal = computed(() => (this.refs() ?? []).reduce((a, r) => a + r.invitados, 0));
  protected readonly devueltoTotal = computed(() => (this.refs() ?? []).reduce((a, r) => a + r.devuelto, 0));

  constructor() {
    effect(() => {
      if (this.comps.current()?.id) untracked(() => void this.cargar());
    });
  }

  private get base(): string {
    return `/api/admin/competiciones/${this.comps.current()?.id}`;
  }

  async cargar(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<Config>(`${this.base}/inscripcion/config`, { observe: 'response' }));
      this.etagCfg = r.headers.get('ETag') ?? '';
      this.cfg.set(r.body);
      this.modoGuardado.set(r.body?.modo ?? 'externa');
      if (r.body?.modo !== 'propia' && this.tab() !== 'config') this.tab.set('config');
      this.conflicto.set(false);
      this.tocado.set(false);
      await this.cargarAep();
      const [c, refs, p] = await Promise.all([
        firstValueFrom(this.http.get<Cupon[]>(`${this.base}/cupones`)),
        firstValueFrom(this.http.get<CodigoRef[]>(`${this.base}/referidos/codigos`)),
        firstValueFrom(this.http.get<Pagos>(`${this.base}/pagos`)),
      ]);
      this.cupones.set(c);
      this.refs.set(refs);
      this.pagos.set(p);
    } catch (e) {
      this.toasts.error('No se pudo cargar la inscripción', errText(e, 'Inténtalo de nuevo.'));
    }
  }

  /** The AEP block comes from the competition (GET /api/admin/competiciones/{id}). */
  private async cargarAep(): Promise<void> {
    const comp = await firstValueFrom(this.http.get<{ version: number; inscripcion?: Partial<Aep> }>(this.base));
    const i = comp.inscripcion ?? {};
    const a: Aep = { modo: i.modo || 'externa', url: i.url ?? '', estado: i.estado ?? 'proximamente', plazas: i.plazas ?? 0, responsable: { nombre: i.responsable?.nombre ?? '', email: i.responsable?.email ?? '' }, nota: i.nota ?? '' };
    this.compVersion = comp.version;
    this.aepOriginal = JSON.stringify(a);
    this.aep.set(a);
  }

  protected cambiar(t: Tab): void {
    if (this.bloqueada(t)) return;
    this.tab.set(t);
  }

  protected async guardarConfig(): Promise<void> {
    const c = this.cfg();
    if (!c) return;
    if (this.urlMal()) { this.toasts.error('Revisa el enlace de la AEP', 'Debe empezar por https://'); return; }
    this.guardando.set(true);
    let aepGuardada = false;
    try {
      // AEP data first (competition service, optimistic lock on its version; needs evento.editar), then the mode
      // (athletes; needs atletas.editar). Each part only with its permission.
      const a = this.aep();
      if (a && this.canEditAep() && JSON.stringify(a) !== this.aepOriginal) {
        const body = { ...a, url: a.url.trim(), plazas: Math.max(0, Math.round(+(a.plazas ?? 0))) };
        const comp = await firstValueFrom(this.http.put<{ version: number }>(`${this.base}/inscripcion`, body, { headers: new HttpHeaders({ 'If-Match': `W/"${this.compVersion}"` }) }));
        this.compVersion = comp.version;
        this.aepOriginal = JSON.stringify(body);
        aepGuardada = true;
        void this.comps.load(true);
      }
      if (!this.canEdit()) { this.tocado.set(false); this.toasts.success('Datos de la AEP guardados'); return; }
      const r = await firstValueFrom(this.http.put<Config>(`${this.base}/inscripcion/config`, c, { observe: 'response', headers: new HttpHeaders(this.etagCfg ? { 'If-Match': this.etagCfg } : {}) }));
      this.etagCfg = r.headers.get('ETag') ?? '';
      this.cfg.set(r.body);
      this.modoGuardado.set(r.body?.modo ?? 'externa');
      this.tocado.set(false);
      this.toasts.success('Inscripción guardada', c.modo === 'propia' ? 'El formulario /inscripcion acepta inscripciones con pago.' : 'La web enlaza a la inscripción de la AEP.');
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error?.code === 'CONFLICTO_EDICION') this.conflicto.set(true);
      else if (aepGuardada) this.toasts.error('Datos de la AEP guardados; el modo no', errText(e));
      else this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  // ---- coupons ----
  protected editarCupon(c: Cupon | null): void {
    if (!this.canEdit()) return;
    this.errorDrawer.set('');
    this.errCodigo.set('');
    this.cupon = c
      ? { id: c.id, codigo: c.codigo, tipo: c.tipo, valorUI: c.tipo === 'porcentaje' ? c.valor : c.valor / 100, conLimite: !!c.limite, limite: c.limite ?? 50, conCaduca: !!c.caduca, caducaDia: c.caduca ? c.caduca.slice(0, 10) : '', activo: c.activo, usos: c.usos }
      : this.blankCupon();
    this.cuponOpen.set(true);
  }
  protected precioFinal(): string {
    const cuota = this.cfg()?.cuota ?? 0;
    const v = Number(this.cupon.valorUI) || 0;
    const d = this.cupon.tipo === 'porcentaje' ? Math.round((cuota * Math.min(100, v)) / 100) : Math.min(cuota, Math.round(v * 100));
    return euros(cuota - d);
  }
  protected async guardarCupon(): Promise<void> {
    const c = this.cupon;
    if (this.codigoNorm().length < 3) { this.errCodigo.set('El código necesita al menos 3 letras o números.'); return; }
    if (!(Number(c.valorUI) > 0)) { this.errorDrawer.set('El descuento tiene que ser mayor que 0.'); return; }
    const body = {
      codigo: this.codigoNorm(), tipo: c.tipo, valor: c.tipo === 'porcentaje' ? Math.round(Number(c.valorUI)) : this.round(c.valorUI), limite: c.conLimite ? Number(c.limite) : undefined,
      caduca: c.conCaduca && c.caducaDia ? new Date(c.caducaDia + 'T23:59:00+02:00').toISOString() : undefined, activo: c.activo,
    };
    this.guardando.set(true);
    this.errorDrawer.set('');
    try {
      if (c.id) await firstValueFrom(this.http.put(`${this.base}/cupones/${c.id}`, body));
      else await firstValueFrom(this.http.post(`${this.base}/cupones`, body));
      this.cuponOpen.set(false);
      this.toasts.success(c.id ? 'Cupón guardado' : 'Cupón creado', body.codigo.toUpperCase());
      this.cupones.set(await firstValueFrom(this.http.get<Cupon[]>(`${this.base}/cupones`)));
    } catch (e) {
      this.errorDrawer.set(errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async borrarCupon(): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Borrar el cupón ${this.cupon.codigo}?`, text: 'No se ha usado nunca, así que no afecta a ninguna inscripción.', confirm: 'Borrar', danger: true }))) return;
    try {
      await firstValueFrom(this.http.delete(`${this.base}/cupones/${this.cupon.id}`));
      this.cuponOpen.set(false);
      this.cupones.set(await firstValueFrom(this.http.get<Cupon[]>(`${this.base}/cupones`)));
    } catch (e) {
      this.errorDrawer.set(errText(e));
    }
  }

  // ---- referral codes ----
  protected editarRef(r: CodigoRef): void {
    if (!this.canEdit()) return;
    this.refSel.set(r);
    this.refPropios.set(!!r.ajustes);
    this.refAj = r.ajustes ? { ...r.ajustes } : { ...(this.cfg()?.referidos ?? this.refDefault()), activo: true };
    this.refOpen.set(true);
  }
  protected async guardarRef(): Promise<void> {
    const r = this.refSel();
    if (!r) return;
    this.guardando.set(true);
    try {
      await firstValueFrom(this.http.put(`${this.base}/referidos/codigos/${r.id}`, { ajustes: this.refPropios() ? { ...this.refAj, activo: true, descTipo: 'porcentaje' } : null }));
      this.refOpen.set(false);
      this.refs.set(await firstValueFrom(this.http.get<CodigoRef[]>(`${this.base}/referidos/codigos`)));
      this.toasts.success('Ajustes guardados', r.codigo);
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected ejemplo(): [string, string][] {
    const c = this.cfg();
    if (!c) return [];
    const r = c.referidos;
    const d = r.descTipo === 'porcentaje' ? Math.round((c.cuota * r.descValor) / 100) : Math.min(c.cuota, r.descValor);
    let rec = 0;
    for (let n = 1; n <= 3; n++) rec += r.modo === 'acumulativo' && r.acumModo === 'multiplicador' ? Math.round(r.recompensa * Math.pow(r.multiplicador || 1, n - 1)) : r.recompensa;
    rec = Math.min(rec, c.cuota);
    return [['Laura paga', euros(c.cuota)], ['Sus 3 invitados pagan', euros(c.cuota - d) + ' cada uno'], ['Laura recupera', euros(rec)], ['Coste real de Laura', euros(c.cuota - rec)]];
  }
  protected ejemploMult(): string {
    const r = this.cfg()?.referidos;
    if (!r) return '';
    return [1, 2, 3].map((n) => `${n}.º ${euros(Math.round(r.recompensa * Math.pow(r.multiplicador || 1, n - 1)))}`).join(' · ') + '…';
  }

  // ---- payments ----
  protected async abrirPago(x: Pago): Promise<void> {
    this.pagoSel.set(x);
    this.reImporte = (x.total - x.devuelto) / 100;
    this.reBaja = false;
    this.pagoOpen.set(true);
    try {
      this.pagoSel.set(await firstValueFrom(this.http.get<Pago>(`${this.base}/pagos/${x.id}`)));
    } catch {
      /* keep the list data */
    }
  }
  protected datosPago(x: Pago): [string, string][] {
    return [
      ['Estado', this.etiquetaPago(x)], ['Proveedor', x.proveedor === 'simulado' ? 'Pasarela simulada' : 'Stripe'], ['Tarjeta', x.tarjeta || '—'],
      ['Creado', this.fechaHora(x.fecha)], ['Pagado', x.pagadaAt ? this.fechaHora(x.pagadaAt) : '—'], ['Email', x.email],
    ];
  }
  protected async reembolsar(x: Pago): Promise<void> {
    const imp = this.round(this.reImporte);
    if (!(await this.confirm.ask({ title: `¿Reembolsar ${euros(imp)} a ${x.atleta}?`, text: `Se devuelve a la tarjeta del pago original.${this.reBaja ? ' Además pasará a «Baja» y liberará su plaza.' : ' La inscripción sigue activa.'}`, confirm: 'Reembolsar' }))) return;
    this.guardando.set(true);
    try {
      this.pagoSel.set(await firstValueFrom(this.http.post<Pago>(`${this.base}/pagos/${x.id}/reembolso`, { importe: imp, darDeBaja: this.reBaja })));
      this.pagos.set(await firstValueFrom(this.http.get<Pagos>(`${this.base}/pagos`)));
      this.toasts.success('Reembolso hecho', euros(imp));
    } catch (e) {
      this.toasts.error('No se pudo reembolsar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  // ---- helpers ----
  protected round(v: unknown): number {
    return Math.round((Number(v) || 0) * 100);
  }
  protected desc(tipo: string, valor: number): string {
    return tipo === 'porcentaje' ? `−${valor} %` : `−${euros(valor)}`;
  }
  protected fecha(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  }
  protected fechaHora(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  }
  protected local(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  protected iso(v: string): string | undefined {
    return v ? new Date(v).toISOString() : undefined;
  }
  private refDefault(): Referidos {
    return { activo: true, modo: 'basico', descTipo: 'porcentaje', descValor: 10, recompensa: 500, maxUsos: 10, acumModo: 'basica', multiplicador: 1.5 };
  }
  private blankCupon() {
    return { id: '', codigo: '', tipo: 'porcentaje' as 'porcentaje' | 'importe', valorUI: 10, conLimite: true, limite: 50, conCaduca: false, caducaDia: '', activo: true, usos: 0 };
  }
}
