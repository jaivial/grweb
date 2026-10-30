import { webPublica } from '../../core/web';
import { TitleCasePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrAvatar, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSegmented, GrSkeleton, GrToasts, type GrTone } from '@grcup/ui';
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

export const euros = (c?: number | null) => ((c ?? 0) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const ESTADO_PAGO: Record<Pago['estado'], { label: string; tone: GrTone }> = {
  pagada: { label: 'Pagado', tone: 'success' }, gratuita: { label: 'Gratis (cupón)', tone: 'success' }, reserva: { label: 'Reserva', tone: 'info' },
  pendiente_pago: { label: 'Pendiente', tone: 'warning' }, cancelada: { label: 'Cancelado', tone: 'neutral' }, fallida: { label: 'Rechazado', tone: 'danger' },
};
const ESTADO_CUPON: Record<Cupon['estado'], GrTone> = { activo: 'success', pausado: 'neutral', agotado: 'warning', caducado: 'neutral' };

/** «Inscripción» (Figma page 66): own registration with payment, coupons, referrals and payments. */
@Component({
  selector: 'bo-inscripcion',
  imports: [FormsModule, RouterLink, TitleCasePipe, BoPageHeader, BoToggle, BoDrawer, GrAlert, GrAvatar, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSegmented, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1180px] flex-col gap-6 pb-24">
      <bo-page-header title="Inscripción" [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Atletas', 'Inscripción']">
        @if (tab() === 'config') { <a actions grButton icon="external-link" [href]="web + '/inscripcion'" target="_blank" rel="noopener">Ver formulario</a> }
        @if (tab() === 'config' && canEdit()) { <button actions grButton variant="primary" [loading]="guardando()" (click)="guardarConfig()">Guardar</button> }
        @if (tab() === 'cupones' && canEdit()) { <button actions grButton variant="primary" icon="plus" (click)="editarCupon(null)">Nuevo cupón</button> }
        @if (tab() === 'referidos' && canEdit()) { <button actions grButton variant="primary" [loading]="guardando()" (click)="guardarConfig()">Guardar</button> }
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Inscripción">
        @for (t of tabs; track t.key) {
          <button type="button" (click)="cambiar(t.key)" [attr.aria-current]="tab() === t.key ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="tab() === t.key ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
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
            <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div class="flex min-w-0 flex-col gap-6">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Modo de inscripción</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">«Externa» mantiene el enlace a la AEP; «Propia con pago» abre /inscripcion con pago, cupones y referidos.</p>
                  <gr-segmented class="mt-4" label="Modo" [options]="modos" [(value)]="c.modo" />
                  <div class="mt-5 grid gap-4 md:grid-cols-2">
                    <gr-field label="Cuota de inscripción (€)" for="i-cuota" hint="IVA incluido"><input grInput id="i-cuota" type="number" min="0" step="0.5" [ngModel]="c.cuota / 100" (ngModelChange)="c.cuota = round($event)" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Plazas" for="i-plazas" hint="Se editan en Evento → Inscripción (cupo de la AEP)"><input grInput id="i-plazas" [value]="plazas()" disabled /></gr-field>
                    <gr-field label="Abre" for="i-abre" [optional]="true"><input grInput id="i-abre" type="datetime-local" [ngModel]="local(c.abre)" (ngModelChange)="c.abre = iso($event)" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Cierra" for="i-cierra" [optional]="true"><input grInput id="i-cierra" type="datetime-local" [ngModel]="local(c.cierra)" (ngModelChange)="c.cierra = iso($event)" [disabled]="!canEdit()" /></gr-field>
                  </div>
                  <ul class="mt-4">
                    <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Lista de reserva al completarse</span><span class="block text-body-xs text-text-tertiary">Las inscripciones de más quedan en reserva, sin cobrar, hasta que haya plaza</span></span><bo-toggle [(value)]="c.reserva" label="Lista de reserva" [disabled]="!canEdit()" /></li>
                    <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Aceptar cupones de descuento</span><span class="block text-body-xs text-text-tertiary">{{ cupones()?.length ?? 0 }} cupones · se gestionan en la pestaña Cupones</span></span><bo-toggle [(value)]="c.cupones" label="Aceptar cupones" [disabled]="!canEdit()" /></li>
                    <li class="flex items-center justify-between gap-4 py-2"><span><span class="block text-label-s">Programa de referidos</span><span class="block text-body-xs text-text-tertiary">Cada inscrito recibe su código para invitar</span></span><bo-toggle [(value)]="c.referidos.activo" label="Programa de referidos" [disabled]="!canEdit()" /></li>
                  </ul>
                </section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Pasarela de pago</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">Sistema → Integraciones → Stripe</p>
                  <dl class="mt-3 text-body-s">
                    <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Proveedor</dt><dd>{{ pagos()?.pasarela === 'stripe' ? 'Stripe' + (pagos()?.pruebas ? ' (modo test)' : '') : 'Pasarela simulada (modo pruebas)' }}</dd></div>
                    <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Webhook</dt><dd class="text-mono-xs">/api/webhooks/pagos/inscripciones · firma HMAC</dd></div>
                    <div class="flex justify-between gap-3 py-2"><dt class="text-text-tertiary">Reembolsos</dt><dd>Totales o parciales desde Pagos</dd></div>
                  </dl>
                  @if (pagos()?.pasarela === 'ninguna') { <gr-alert class="mt-3" tone="warning" title="Pagos sin configurar">Añade las claves de Stripe en Sistema → Integraciones. Sin ellas solo se aceptan inscripciones gratuitas (cupón del 100 %) o en reserva.</gr-alert> }
                  @if (pagos()?.pruebas) { <gr-alert class="mt-3" tone="info" title="Modo pruebas: no se cobra nada">La pasarela simulada reproduce Stripe Checkout (tarjetas de prueba, pago rechazado, 3D Secure) y envía el mismo webhook firmado. Al añadir claves de Stripe se usa Stripe sin cambiar nada más.</gr-alert> }
                </section>
              </div>
              <aside class="h-fit rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-label-m">Así lo ve el atleta</h2>
                <p class="mt-1 text-body-xs text-text-tertiary">{{ c.modo === 'propia' ? 'Formulario con pago en /inscripcion' : 'Enlace a la inscripción de la AEP' }}</p>
                <div class="mt-4 rounded-md bg-bg-surface p-4">
                  <p class="text-label-s">Inscripción</p>
                  <p class="mt-1 text-display-xs">{{ euros(c.cuota) }}</p>
                  <p class="text-body-xs text-text-tertiary">{{ plazas() ? plazas() + ' plazas' : '' }}{{ c.cierra ? ' · cierra el ' + fecha(c.cierra) : '' }}</p>
                  @if (c.referidos.activo) { <p class="mt-3 text-body-xs text-success">Con código de un amigo: {{ c.referidos.descTipo === 'porcentaje' ? '−' + c.referidos.descValor + ' %' : '−' + euros(c.referidos.descValor) }}</p> }
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
          <section class="rounded-lg border border-line-subtle bg-bg-card">
            @if (!l) { <div class="p-5"><gr-skeleton class="h-40" /></div> }
            @else if (!l.length) { <gr-empty class="py-10" icon="ticket" title="Sin cupones" text="Crea un código de descuento sobre la cuota de inscripción." /> }
            @else {
              <table class="hidden w-full table-fixed text-left md:table">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="w-48 px-4 py-3 font-normal">Código</th><th class="w-28 px-3 py-3 font-normal">Descuento</th><th class="px-3 py-3 font-normal">Usos</th><th class="w-28 px-3 py-3 font-normal">Caduca</th><th class="w-28 px-3 py-3 text-right font-normal">Ahorro</th><th class="w-28 px-3 py-3 font-normal">Estado</th><th class="w-12"></th></tr></thead>
                <tbody>
                  @for (cp of l; track cp.id) {
                    <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" [class.opacity-55]="cp.estado === 'caducado'" (click)="editarCupon(cp)">
                      <td class="px-4 py-3 text-mono-s">{{ cp.codigo }}</td><td class="px-3 py-3 text-body-s">{{ desc(cp.tipo, cp.valor) }}</td>
                      <td class="px-3 py-3"><span class="flex items-center gap-2"><span class="h-1.5 flex-1 rounded-pill bg-bg-raised"><span class="block h-full rounded-pill bg-warning" [style.width.%]="cp.limite ? (cp.usos * 100) / cp.limite : 0"></span></span><span class="text-mono-xs text-text-secondary">{{ cp.usos }} / {{ cp.limite ?? 'sin límite' }}</span></span></td>
                      <td class="px-3 py-3 text-body-s">{{ cp.caduca ? fecha(cp.caduca) : '—' }}</td><td class="px-3 py-3 text-right text-mono-s">{{ euros(cp.ahorro) }}</td>
                      <td class="px-3 py-3"><gr-badge [tone]="estadoCupon[cp.estado]">{{ cp.estado | titlecase }}</gr-badge></td><td class="px-2"><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></td>
                    </tr>
                  }
                </tbody>
              </table>
              <ul class="md:hidden">
                @for (cp of l; track cp.id) {
                  <li class="border-b border-line-subtle last:border-0"><button type="button" class="flex w-full flex-col gap-1 px-4 py-3 text-left" (click)="editarCupon(cp)">
                    <span class="flex items-center justify-between"><span class="text-mono-s">{{ cp.codigo }}</span><gr-badge [tone]="estadoCupon[cp.estado]">{{ cp.estado | titlecase }}</gr-badge></span>
                    <span class="text-body-s text-text-secondary">{{ desc(cp.tipo, cp.valor) }}{{ cp.caduca ? ' · caduca ' + fecha(cp.caduca) : ' · sin caducidad' }}</span>
                    <span class="text-body-xs text-text-tertiary">{{ cp.usos }} / {{ cp.limite ?? 'sin límite' }} usos</span>
                  </button></li>
                }
              </ul>
            }
          </section>
        }

        @case ('referidos') {
          @if (c) {
            <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5">
                <div class="flex items-center justify-between gap-4"><span><span class="block text-ui-h5">Programa de referidos</span><span class="block text-body-xs text-text-tertiary">Los nuevos inscritos reciben su código en el email de confirmación y en su área</span></span><bo-toggle [(value)]="c.referidos.activo" label="Activo" [disabled]="!canEdit()" /></div>
                <gr-segmented label="Modo" [options]="modosRef" [(value)]="c.referidos.modo" />
                <div class="grid gap-4 md:grid-cols-2">
                  <gr-field label="Descuento para quien se inscribe" for="r-d"><div class="flex gap-2"><input grInput id="r-d" type="number" min="0" [ngModel]="c.referidos.descTipo === 'porcentaje' ? c.referidos.descValor : c.referidos.descValor / 100" (ngModelChange)="c.referidos.descValor = c.referidos.descTipo === 'porcentaje' ? +$event : round($event)" [disabled]="!canEdit()" /><select grInput class="w-24" [(ngModel)]="c.referidos.descTipo" [disabled]="!canEdit()"><option value="porcentaje">%</option><option value="importe">€</option></select></div></gr-field>
                  <gr-field label="Recompensa para quien invita (€ por invitado)" for="r-r"><input grInput id="r-r" type="number" min="0" step="0.5" [ngModel]="c.referidos.recompensa / 100" (ngModelChange)="c.referidos.recompensa = round($event)" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Invitados máximos por código" for="r-m" hint="0 = sin límite"><input grInput id="r-m" type="number" min="0" [(ngModel)]="c.referidos.maxUsos" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Tope de devolución" for="r-t" hint="Nunca se devuelve más de lo que pagó"><input grInput id="r-t" [value]="'Lo que pagó (hasta ' + euros(c.cuota) + ')'" disabled /></gr-field>
                </div>
                @if (c.referidos.modo === 'acumulativo') {
                  <div class="rounded-md border border-line-subtle p-4">
                    <p class="text-label-s">Modo acumulativo</p>
                    <gr-segmented class="mt-2" label="Acumulativo" [options]="acumModos" [(value)]="c.referidos.acumModo" />
                    @if (c.referidos.acumModo === 'multiplicador') { <gr-field class="mt-3" label="Multiplicador" for="r-x" [hint]="ejemploMult()"><input grInput id="r-x" type="number" min="1" max="5" step="0.1" [(ngModel)]="c.referidos.multiplicador" [disabled]="!canEdit()" /></gr-field> }
                  </div>
                }
                <gr-alert tone="info" title="Devoluciones sobre el pago original">La recompensa se devuelve como reembolso parcial del pago de quien invita (no es dinero nuevo ni un premio), con tope en lo que pagó.</gr-alert>
              </section>
              <aside class="h-fit rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">Así funciona</h2>
                <p class="mt-0.5 text-body-xs text-text-tertiary">Ejemplo con la configuración actual</p>
                <dl class="mt-3 text-body-s">
                  @for (e of ejemplo(); track e[0]) { <div class="flex justify-between gap-3 border-b border-line-subtle py-2 last:border-0"><dt class="text-text-tertiary">{{ e[0] }}</dt><dd>{{ e[1] }}</dd></div> }
                </dl>
              </aside>
            </div>
          }
          <section class="rounded-lg border border-line-subtle bg-bg-card">
            <header class="border-b border-line-subtle px-5 py-4"><h2 class="text-ui-h5">Códigos</h2><p class="text-body-xs text-text-tertiary">{{ refs()?.length ?? 0 }} códigos · {{ invitadosTotal() }} invitados · {{ euros(devueltoTotal()) }} devueltos</p></header>
            @if (!refs()) { <div class="p-5"><gr-skeleton class="h-24" /></div> }
            @else if (!refs()!.length) { <gr-empty class="py-8" icon="users" title="Aún no hay códigos" text="Se crean al confirmarse cada inscripción pagada." /> }
            @else {
              <ul>
                @for (r of refs(); track r.id) {
                  <li class="border-b border-line-subtle last:border-0"><button type="button" class="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-bg-raised/60" (click)="editarRef(r)">
                    <gr-avatar [name]="r.atleta" />
                    <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ r.atleta }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ r.club || 'Independiente' }} · pagó {{ euros(r.pagado) }}</span></span>
                    <span class="hidden w-28 text-mono-s md:block">{{ r.codigo }}</span>
                    <span class="w-20 text-right text-mono-s">{{ r.invitados }} inv.</span>
                    <span class="hidden w-28 text-right text-mono-s md:block">{{ euros(r.devuelto) }}</span>
                    @if (r.fallidas) { <gr-badge tone="danger">{{ r.fallidas }} devolución{{ r.fallidas === 1 ? '' : 'es' }} fallida{{ r.fallidas === 1 ? '' : 's' }}</gr-badge> }
                    <gr-badge [tone]="r.ajustes ? 'accent' : 'neutral'">{{ r.ajustes ? 'Propios' : 'General' }}</gr-badge>
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
              <gr-kpi label="Pendientes" [value]="p.pendientes + ''" caption="se liberan en 30 min" />
              <gr-kpi label="Rechazados" [value]="p.rechazados + ''" caption="tarjeta denegada" />
            </div>
            @if (p.pruebas) { <gr-alert tone="info" title="Modo pruebas">Pagos con {{ p.pasarela === 'simulado' ? 'la pasarela simulada' : 'Stripe en modo test' }}: no se ha cobrado nada.</gr-alert> }
            <section class="rounded-lg border border-line-subtle bg-bg-card">
              @if (!p.items.length) { <gr-empty class="py-10" icon="ticket" title="Aún no hay pagos" text="Las inscripciones desde /inscripcion aparecerán aquí." /> }
              @else {
                <ul>
                  @for (x of p.items; track x.id) {
                    <li class="border-b border-line-subtle last:border-0"><button type="button" class="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-bg-raised/60" (click)="abrirPago(x)">
                      <span class="hidden w-28 text-mono-xs text-text-tertiary md:block">{{ fechaHora(x.fecha) }}</span>
                      <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ x.atleta }}</span><span class="block truncate text-body-xs text-text-tertiary">Inscripción{{ x.cupon ? ' · cupón ' + x.cupon : '' }}{{ x.referido ? ' · referido ' + x.referido : '' }}</span></span>
                      <span class="w-24 text-right text-mono-s">{{ euros(x.total) }}</span>
                      <gr-badge [tone]="x.devuelto ? 'info' : estadoPago[x.estado].tone">{{ x.devuelto ? 'Devuelto ' + euros(x.devuelto) : etiquetaPago(x) }}</gr-badge>
                      <span class="hidden w-32 truncate text-mono-xs text-text-tertiary lg:block">{{ x.referencia }}</span>
                    </button></li>
                  }
                </ul>
              }
            </section>
          } @else { <gr-skeleton class="h-64 rounded-lg" /> }
        }
      }
    </div>

    <bo-drawer [(open)]="cuponOpen" [title]="cupon.id ? 'Editar cupón' : 'Nuevo cupón'">
      @if (errorDrawer()) { <gr-alert class="mb-4" tone="danger" title="No se pudo guardar">{{ errorDrawer() }}</gr-alert> }
      <div class="flex flex-col gap-4">
        <gr-field label="Código" for="c-cod" hint="Mayúsculas y números · único en la competición"><input grInput id="c-cod" [(ngModel)]="cupon.codigo" maxlength="30" /></gr-field>
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

    <bo-drawer [(open)]="pagoOpen" [title]="'Pago ' + (pagoSel()?.referencia || '')">
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
  protected readonly tabs: { key: Tab; label: string }[] = [{ key: 'config', label: 'Configuración' }, { key: 'cupones', label: 'Cupones' }, { key: 'referidos', label: 'Referidos' }, { key: 'pagos', label: 'Pagos' }];
  protected readonly modos = [{ value: 'externa', label: 'Externa (AEP)' }, { value: 'propia', label: 'Propia con pago' }];
  protected readonly modosRef = [{ value: 'basico', label: 'Básico' }, { value: 'acumulativo', label: 'Acumulativo' }];
  protected readonly acumModos = [{ value: 'basica', label: 'Recompensa básica' }, { value: 'multiplicador', label: 'Multiplicador' }];
  protected readonly tiposCupon = [{ value: 'porcentaje', label: 'Porcentaje' }, { value: 'importe', label: 'Importe fijo' }];
  protected readonly tab = signal<Tab>('config');
  protected readonly cfg = signal<Config | null>(null);
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
  protected readonly plazas = computed(() => (this.comps.current() as { inscripcion?: { plazas?: number } } | null)?.inscripcion?.plazas ?? 0);
  protected readonly subtitulo = computed(() => {
    const c = this.cfg();
    if (!c) return '';
    return c.modo === 'propia' ? `Inscripción propia · ${euros(c.cuota)} · ${this.plazas()} plazas` : 'Inscripción externa en la AEP';
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
      this.conflicto.set(false);
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

  protected cambiar(t: Tab): void {
    this.tab.set(t);
  }

  protected async guardarConfig(): Promise<void> {
    const c = this.cfg();
    if (!c) return;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.http.put<Config>(`${this.base}/inscripcion/config`, c, { observe: 'response', headers: new HttpHeaders(this.etagCfg ? { 'If-Match': this.etagCfg } : {}) }));
      this.etagCfg = r.headers.get('ETag') ?? '';
      this.cfg.set(r.body);
      this.toasts.success('Inscripción guardada', c.modo === 'propia' ? 'El formulario /inscripcion acepta inscripciones con pago.' : 'La web enlaza a la inscripción de la AEP.');
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error?.code === 'CONFLICTO_EDICION') this.conflicto.set(true);
      else this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  // ---- coupons ----
  protected editarCupon(c: Cupon | null): void {
    if (!this.canEdit()) return;
    this.errorDrawer.set('');
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
    const body = {
      codigo: c.codigo, tipo: c.tipo, valor: c.tipo === 'porcentaje' ? Math.round(Number(c.valorUI)) : this.round(c.valorUI), limite: c.conLimite ? Number(c.limite) : undefined,
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
