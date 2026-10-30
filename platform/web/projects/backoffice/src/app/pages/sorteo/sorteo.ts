import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../../core/api';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, BoToggle, Confirm, Media, errText } from '../../shared/ui';
import { ESTADO_COMPRA, ESTADO_VENTA, SorteoApi, euros, fecha, fechaLarga, type Compra, type Compras, type Config, type Panel, type Sorteo } from './api';

type Tab = 'config' | 'boletos' | 'directo' | 'historial';
const aLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const deLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** «Sorteo» (Figma page 60): set-up with the legal checklist, tickets and payments, the live draw and its history.
 *  On a phone the live tab is the presenter view («Móvil · presentador»). */
@Component({
  selector: 'bo-sorteo',
  imports: [FormsModule, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = panel();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Sorteo" [badge]="p ? est[p.estado]?.l ?? p.estado : ''" [badgeTone]="p ? est[p.estado]?.tone ?? 'neutral' : 'neutral'"
        [subtitle]="p ? (p.config.premio || 'Sin premio') + (p.config.fechaSorteo ? ' · sorteo el ' + fechaLarga(p.config.fechaSorteo) : '') : ''" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Sorteo']">
        @if (tab() === 'boletos') { <ng-container actions><button grButton icon="download" (click)="exportar()">Exportar CSV</button></ng-container> }
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Sorteo">
        @for (t of tabs; track t.v) {
          <button type="button" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null" (click)="ir(t.v)">
            {{ t.l }}@if (t.v === 'boletos' && p) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ p.kpis.boletos }}</span> }
            @if (tab() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
          </button>
        }
      </nav>

      @if (p === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar el sorteo"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (p === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else {
        @switch (tab()) {
          @case ('config') {
            <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div class="flex flex-col gap-5">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Premio</h2>
                  <div class="mt-4 flex flex-col gap-4 sm:flex-row">
                    <label class="flex h-40 w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed border-line-strong bg-bg-raised sm:w-56">
                      @if (cfg.premioImagen) { <img [src]="cfg.premioImagen" alt="" class="h-full w-full object-contain" /> } @else { <gr-icon name="camera" [size]="22" class="text-text-tertiary" /><span class="text-body-xs text-text-tertiary">Subir imagen</span> }
                      <input type="file" accept="image/*" class="sr-only" (change)="subir($event)" [disabled]="!puede()" />
                    </label>
                    <div class="flex flex-1 flex-col gap-3">
                      <gr-field label="Nombre del premio"><input grInput [(ngModel)]="cfg.premio" maxlength="160" [disabled]="!puede()" /></gr-field>
                      <div class="grid gap-3 sm:grid-cols-2">
                        <gr-field label="Valor aproximado (€)"><input grInput type="number" min="0" [ngModel]="cfg.premioValor / 100" (ngModelChange)="cfg.premioValor = toCents($event)" [disabled]="!puede()" /></gr-field>
                        <gr-field label="Destino de la recaudación" [error]="!cfg.destino ? 'Obligatorio antes de abrir la venta' : ''"><input grInput [(ngModel)]="cfg.destino" maxlength="200" [disabled]="!puede()" /></gr-field>
                      </div>
                      <gr-field label="Descripción"><textarea grInput rows="2" [(ngModel)]="cfg.premioDetalle" maxlength="600" [disabled]="!puede()"></textarea></gr-field>
                    </div>
                  </div>
                </section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Precio y límites</h2><p class="text-body-xs text-text-tertiary">Lo que se ve al comprar en /sorteo</p>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <gr-field label="Precio por boleto (€)" [hint]="p.kpis.boletos ? 'Con boletos vendidos ya no cambia' : ''"><input grInput type="number" min="0.5" step="0.5" [ngModel]="cfg.precio / 100" (ngModelChange)="cfg.precio = toCents($event)" [disabled]="!puede() || p.kpis.boletos > 0" /></gr-field>
                    <gr-field label="Máximo por persona"><input grInput type="number" min="1" max="100" [(ngModel)]="cfg.maxPorPersona" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Botones rápidos" hint="Separados por comas"><input grInput [ngModel]="cfg.presets.join(', ')" (ngModelChange)="cfg.presets = nums($event)" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Boletos totales" hint="Vacío = sin límite"><input grInput type="number" min="1" [ngModel]="cfg.totalMax" (ngModelChange)="cfg.totalMax = $event ? +$event : null" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Venta desde"><input grInput type="datetime-local" [ngModel]="aLocal(cfg.ventaDesde)" (ngModelChange)="cfg.ventaDesde = deLocal($event)" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Venta hasta"><input grInput type="datetime-local" [ngModel]="aLocal(cfg.ventaHasta)" (ngModelChange)="cfg.ventaHasta = deLocal($event)" [disabled]="!puede()" /></gr-field>
                    <gr-field label="Fecha del sorteo"><input grInput type="datetime-local" [ngModel]="aLocal(cfg.fechaSorteo)" (ngModelChange)="cfg.fechaSorteo = deLocal($event)" [disabled]="!puede()" /></gr-field>
                  </div>
                  @if (puede()) { <div class="mt-4 flex justify-end"><button grButton variant="primary" [loading]="guardando()" (click)="guardar()">Guardar</button></div> }
                </section>
              </div>
              <aside class="flex flex-col gap-5">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Checklist legal</h2><p class="text-body-xs text-text-tertiary">Para revisión de la asesoría · {{ hechos() }} de {{ p.checklist.length }}</p>
                  <ul class="mt-4 flex flex-col gap-3">
                    @for (it of p.checklist; track it.clave) {
                      <li class="flex items-start gap-3">
                        <gr-icon [name]="it.estado === 'pendiente' ? 'circle-alert' : 'circle-check'" [size]="18" [class]="it.estado === 'pendiente' ? 'mt-0.5 text-warning' : 'mt-0.5 text-success'" />
                        <div class="min-w-0 flex-1"><p class="text-label-s">{{ it.titulo }}</p><p class="text-body-xs text-text-tertiary">{{ it.nota || it.detalle }}@if (it.estado === 'no_aplica') { · no aplica }</p></div>
                        @if (puede()) {
                          @if (it.estado === 'pendiente') { <button grButton size="s" variant="primary" (click)="marcar(it.clave, 'hecho')">Marcar</button> }
                          @else { <button grButton size="s" variant="ghost" (click)="marcar(it.clave, 'pendiente')">Deshacer</button> }
                        }
                      </li>
                    }
                  </ul>
                </section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <div class="flex items-center gap-3"><div class="flex-1"><h2 class="text-ui-h5">Venta</h2><p class="text-body-xs text-text-tertiary">{{ cfg.activa ? 'Activa en /sorteo' : p.checklistCompleta ? 'Lista para abrir' : 'Requiere completar la checklist legal' }} · pasarela {{ p.pasarela }}</p></div>
                    <bo-toggle [value]="cfg.activa" label="Venta activa" [disabled]="!puede() || (!p.checklistCompleta && !cfg.activa)" (changed)="cfg.activa = $event; guardar()" /></div>
                </section>
                <gr-alert tone="info" title="No activar sin visto bueno de la asesoría">Sorteo con precio: autorización autonómica, tributación del premio y bases. El organizador decide el precio final (1 € decidido).</gr-alert>
              </aside>
            </div>
          }

          @case ('boletos') {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Boletos válidos" [value]="n(p.kpis.boletos)" [delta]="'+' + p.kpis.nuevos7d" caption="esta semana" [trend]="p.kpis.serie" />
              <gr-kpi label="Recaudado" [value]="euros(p.kpis.recaudado)" [caption]="'pasarela ' + p.pasarela" />
              <gr-kpi label="Compradores" [value]="n(p.kpis.compradores)" [caption]="p.kpis.compradores ? (p.kpis.boletos / p.kpis.compradores).toFixed(1) + ' boletos de media' : ''" />
              <gr-kpi label="Incidencias" [value]="n(p.kpis.reembolsadas + p.kpis.fallidas)" [caption]="p.kpis.reembolsadas + ' reembolsos · ' + p.kpis.fallidas + ' fallidos'" />
            </div>
            @if (p.kpis.pendientes) { <gr-alert tone="warning" [title]="p.kpis.pendientes + ' pagos pendientes de confirmar'">Si el webhook no llega en 30 min la compra caduca y sus boletos no se asignan.</gr-alert> }
            <div class="flex flex-wrap items-center gap-2">
              <label class="relative min-w-0 flex-1 basis-64 md:max-w-xs"><span class="sr-only">Buscar</span><gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
                <input grInput class="pl-9" placeholder="Nombre, email o número" [ngModel]="f().q" (ngModelChange)="filtrar({ q: $event })" /></label>
              <select class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s" aria-label="Estado" [ngModel]="f().estado" (ngModelChange)="filtrar({ estado: $event })"><option value="">Todos los pagos</option>@for (e of estadosC; track e.v) { <option [value]="e.v">{{ e.l }}</option> }</select>
            </div>
            @if (compras(); as l) {
              <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
                <table class="w-full min-w-[820px] text-left text-body-s">
                  <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Boletos</th><th class="px-3 py-3">Comprador</th><th class="px-3 py-3 text-center">Cant.</th><th class="px-3 py-3 text-right">Importe</th><th class="px-3 py-3">Pago</th><th class="px-3 py-3">Fecha</th><th class="px-4 py-3"></th></tr></thead>
                  <tbody>
                    @for (x of l.items; track x.id) {
                      <tr class="border-b border-line-subtle last:border-0" [class.opacity-60]="x.estado === 'reembolsada' || x.estado === 'caducada'">
                        <td class="px-4 py-2.5 font-mono text-mono-s">{{ x.boletos }}</td>
                        <td class="px-3 py-2.5"><div class="flex items-center gap-2.5"><span class="flex size-8 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-bg-raised text-mono-xs">{{ ini(x.nombre) }}</span><div class="min-w-0"><p class="truncate text-label-s">{{ x.nombre }}</p><p class="truncate text-body-xs text-text-tertiary">{{ x.email }}</p></div></div></td>
                        <td class="px-3 py-2.5 text-center font-mono">{{ x.cantidad }}</td>
                        <td class="px-3 py-2.5 text-right font-mono">{{ euros(x.importe) }}</td>
                        <td class="px-3 py-2.5"><gr-badge [tone]="estC[x.estado].tone">{{ estC[x.estado].l }}</gr-badge></td>
                        <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ fecha(x.createdAt) }}</td>
                        <td class="px-4 py-2.5 text-right">@if (x.estado === 'pagada' && puede() && !p.actual) {
                          <button type="button" class="rounded-sm px-2 py-1 text-label-s text-text-tertiary hover:bg-bg-raised hover:text-text-primary" (click)="reenviar(x)">Reenviar</button>
                          <button type="button" class="rounded-sm px-2 py-1 text-label-s text-accent-text hover:bg-bg-raised" (click)="abrirReembolso(x)">Reembolsar</button> }</td>
                      </tr>
                    } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-text-tertiary">Aún no hay compras.</td></tr> }
                  </tbody>
                </table>
              </section>
              <p class="flex items-center justify-between text-body-xs text-text-tertiary"><span>Mostrando {{ l.items.length ? (l.pagina - 1) * l.por + 1 : 0 }}–{{ (l.pagina - 1) * l.por + l.items.length }} de {{ n(l.total) }} compras</span>
                <span class="flex gap-1"><button grButton size="s" variant="ghost" icon="chevron-left" [disabled]="l.pagina <= 1" (click)="filtrar({ pagina: l.pagina - 1 }, false)" aria-label="Anterior"></button><button grButton size="s" variant="ghost" icon="chevron-right" [disabled]="l.pagina * l.por >= l.total" (click)="filtrar({ pagina: l.pagina + 1 }, false)" aria-label="Siguiente"></button></span></p>
            } @else { <gr-skeleton class="h-72 rounded-lg" /> }
          }

          @case ('directo') {
            @let a = p.actual;
            <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div class="flex flex-col gap-4">
                <section class="flex min-h-[320px] flex-col items-center justify-center rounded-xl border p-8 text-center" [class]="a?.estado === 'sorteado' || a?.estado === 'confirmado' ? 'border-accent/50 bg-[linear-gradient(150deg,#4a121c,#1b1112_70%)]' : 'border-line-subtle bg-bg-card'">
                  <p class="text-mono-xs tracking-[0.2em] text-text-tertiary">BOLETO</p>
                  <p class="mt-2 font-display text-[88px] leading-none italic md:text-[120px]" [class.text-accent-text]="a?.numero && !girando()">{{ girando() ? rueda() : a?.numero || '????' }}</p>
                  @if (girando()) { <p class="mt-4 text-ui-h4">Sorteando…</p><p class="text-body-s text-text-tertiary">Semilla registrada en auditoría</p> }
                  @else if (a?.ganador && (a?.estado === 'sorteado' || a?.estado === 'confirmado')) {
                    <p class="mt-4 text-ui-h3">{{ a!.ganador!.nombre }}</p><p class="text-body-s text-text-secondary">Compró {{ a!.ganador!.cantidad }} boletos · {{ fecha(a!.ganador!.compra) }}</p>
                    @if (a?.estado === 'confirmado') { <gr-badge class="mt-3" tone="success">Confirmado y publicado</gr-badge> }
                  } @else if (a?.estado === 'congelado') { <p class="mt-4 text-ui-h4">Listo para sortear</p><p class="text-body-s text-text-tertiary">{{ n(a!.total) }} boletos válidos congelados</p> }
                  @else { <p class="mt-4 text-ui-h4">Antes del sorteo</p><p class="text-body-s text-text-tertiary">{{ n(p.kpis.boletos) }} boletos válidos · {{ n(p.kpis.compradores) }} personas</p> }
                </section>
                @if (puedeSortear()) {
                  <div class="flex flex-wrap justify-center gap-2">
                    @if (!a) { <button grButton variant="primary" icon="lock" [loading]="ocupado()" (click)="congelar()">Congelar lista</button> }
                    @if (a?.estado === 'congelado') { <button grButton variant="primary" icon="zap" [loading]="ocupado()" (click)="sortear()">Sortear ahora</button> }
                    @if (a?.estado === 'sorteado') {
                      <button grButton variant="ghost" (click)="repetirOpen.set(true)">Repetir (con motivo)</button>
                      <button grButton variant="primary" [loading]="ocupado()" (click)="confirmar()">{{ notificar ? 'Confirmar y notificar' : 'Confirmar' }}</button>
                    }
                    @if (a?.estado === 'confirmado') { <button grButton variant="ghost" (click)="repetirOpen.set(true)">Repetir (con motivo)</button> }
                  </div>
                }
              </div>
              <aside class="flex flex-col gap-4">
                @if (a?.estado === 'sorteado') {
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                    <h2 class="text-ui-h5">Opciones al confirmar</h2>
                    <div class="mt-3 flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Email al ganador</p><p class="text-body-xs text-text-tertiary">Plantilla «Has ganado el sorteo»</p></div><bo-toggle [(value)]="notificar" label="Email al ganador" /></div>
                    <p class="mt-3 text-body-xs text-text-tertiary">Al confirmar se publica en /sorteo (nombre e inicial del apellido) y se revela la semilla para que cualquiera pueda verificarlo.</p>
                  </section>
                }
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Antes de sortear</h2>
                  <ul class="mt-3 flex flex-col gap-3 text-body-s">
                    <li class="flex gap-2.5"><gr-icon [name]="a ? 'circle-check' : 'circle-alert'" [size]="18" [class]="a ? 'text-success' : 'text-text-muted'" /><div><p class="text-label-s">{{ a ? n(a.total) + ' boletos válidos congelados' : 'Lista sin congelar' }}</p><p class="text-body-xs text-text-tertiary">Excluye reembolsados y anulados · la venta debe estar cerrada</p></div></li>
                    <li class="flex gap-2.5"><gr-icon [name]="a ? 'circle-check' : 'circle-alert'" [size]="18" [class]="a ? 'text-success' : 'text-text-muted'" /><div class="min-w-0"><p class="text-label-s">Semilla generada</p><p class="truncate font-mono text-body-xs text-text-tertiary">{{ a ? 'sha256 ' + a.semillaHash.slice(0, 16) + '… · publicada en /sorteo' : 'Se genera al congelar' }}</p></div></li>
                    <li class="flex gap-2.5"><gr-icon [name]="a?.testigo || testigo ? 'circle-check' : 'circle-alert'" [size]="18" [class]="a?.testigo || testigo ? 'text-success' : 'text-text-muted'" /><div class="flex-1"><p class="text-label-s">Testigo presente</p>
                      @if (a) { <p class="text-body-xs text-text-tertiary">{{ a.testigo || '—' }}</p> } @else { <input grInput class="mt-1" [(ngModel)]="testigo" placeholder="Nombre (staff, notario…)" /> }</div></li>
                  </ul>
                </section>
                <gr-alert tone="info" title="Cómo se elige">Índice = HMAC-SHA256(semilla, hash de la lista) mod N: cualquiera puede reproducirlo con la lista publicada y la semilla que se revela al confirmar.</gr-alert>
              </aside>
            </div>
          }

          @case ('historial') {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[760px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Fecha</th><th class="px-3 py-3">Estado</th><th class="px-3 py-3">Boleto</th><th class="px-3 py-3">Lista</th><th class="px-3 py-3">Semilla (hash)</th><th class="px-4 py-3">Motivo / testigo</th></tr></thead>
                <tbody>
                  @for (x of historial(); track x.id) {
                    <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-2.5 font-mono text-mono-xs">{{ fecha(x.createdAt) }}</td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="x.estado === 'confirmado' ? 'success' : x.estado === 'repetido' ? 'danger' : 'info'">{{ x.estado }}</gr-badge></td>
                      <td class="px-3 py-2.5 font-mono">{{ x.numero || '—' }}@if (x.ganador) { <span class="ml-2 font-sans text-body-xs text-text-tertiary">{{ x.ganador.nombre }}</span> }</td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs">{{ x.total }} · {{ x.hashLista.slice(0, 10) }}…</td><td class="px-3 py-2.5 font-mono text-mono-xs">{{ x.semillaHash.slice(0, 12) }}…</td>
                      <td class="px-4 py-2.5 text-body-xs text-text-tertiary">{{ x.motivo || x.testigo || '—' }}</td></tr>
                  } @empty { <tr><td colspan="6" class="px-4 py-10 text-center text-text-tertiary">Aún no hay sorteos.</td></tr> }
                </tbody>
              </table>
            </section>
          }
        }
      }
    </div>

    @if (reembolso(); as r) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="reembolso.set(null)" (keydown.escape)="reembolso.set(null)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="alertdialog" aria-modal="true" [attr.aria-label]="'Reembolsar ' + r.cantidad + ' boletos'" (click)="$event.stopPropagation()" (ngSubmit)="reembolsar()">
          <h2 class="text-ui-h5">Reembolsar {{ r.cantidad }} boletos ({{ euros(r.importe) }})</h2>
          <p class="mt-3 text-body-s text-text-secondary">{{ r.nombre }} · boletos {{ r.boletos }}. La pasarela devolverá {{ euros(r.importe) }} en 5–10 días; los boletos dejan de participar y se le enviará un email.</p>
          <gr-field label="Motivo" class="mt-4"><input grInput name="motivo" [(ngModel)]="motivo" maxlength="200" placeholder="Compra duplicada" /></gr-field>
          <gr-field label="Escribe REEMBOLSAR para confirmar" class="mt-3"><input grInput name="conf" [(ngModel)]="confirmacion" autocomplete="off" /></gr-field>
          <div class="mt-6 flex justify-end gap-2"><button type="button" grButton variant="ghost" (click)="reembolso.set(null)">Cancelar</button>
            <button type="submit" grButton variant="danger" [loading]="ocupado()" [disabled]="confirmacion.trim().toUpperCase() !== 'REEMBOLSAR' || motivo.trim().length < 3">Reembolsar {{ euros(r.importe) }}</button></div>
        </form>
      </div>
    }
    @if (repetirOpen()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="repetirOpen.set(false)" (keydown.escape)="repetirOpen.set(false)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="alertdialog" aria-modal="true" aria-label="Repetir sorteo" (click)="$event.stopPropagation()" (ngSubmit)="repetir()">
          <h2 class="text-ui-h5">Repetir el sorteo</h2>
          <p class="mt-3 text-body-s text-text-secondary">Este sorteo queda anulado en el historial, con el motivo. Después se congela una lista nueva y se vuelve a sortear.</p>
          <gr-field label="Motivo (obligatorio)" class="mt-4"><input grInput name="motivo" [(ngModel)]="motivoRep" maxlength="200" placeholder="El ganador es menor de edad" /></gr-field>
          <label class="mt-3 flex items-center gap-2 text-body-s"><input type="checkbox" class="size-4 accent-[#c42b3e]" name="anular" [(ngModel)]="anularGanador" />Anular el boleto que salió (no entra en el siguiente sorteo)</label>
          <div class="mt-6 flex justify-end gap-2"><button type="button" grButton variant="ghost" (click)="repetirOpen.set(false)">Cancelar</button><button type="submit" grButton variant="danger" [loading]="ocupado()" [disabled]="motivoRep.trim().length < 5">Repetir</button></div>
        </form>
      </div>
    }
  `,
})
export class SorteoPage {
  private readonly api = inject(SorteoApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly media = inject(Media);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly est = ESTADO_VENTA;
  protected readonly estC = ESTADO_COMPRA;
  protected readonly estadosC = Object.entries(ESTADO_COMPRA).map(([v, x]) => ({ v, l: x.l }));
  protected readonly euros = euros;
  protected readonly fecha = fecha;
  protected readonly fechaLarga = fechaLarga;
  protected readonly aLocal = aLocal;
  protected readonly deLocal = deLocal;
  protected readonly tabs: { v: Tab; l: string }[] = [{ v: 'config', l: 'Configuración' }, { v: 'boletos', l: 'Boletos y pagos' }, { v: 'directo', l: 'Sorteo en directo' }, { v: 'historial', l: 'Historial' }];
  protected readonly panel = signal<Panel | null | undefined>(undefined);
  protected readonly compras = signal<Compras | null>(null);
  protected readonly historial = signal<Sorteo[]>([]);
  protected readonly f = signal<{ estado: string; q: string; pagina: number }>({ estado: '', q: '', pagina: 1 });
  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || (typeof window !== 'undefined' && window.innerWidth < 768 ? 'directo' : 'config'));
  protected readonly guardando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly girando = signal(false);
  protected readonly rueda = signal('0000');
  protected readonly reembolso = signal<Compra | null>(null);
  protected readonly repetirOpen = signal(false);
  protected cfg: Config = { premio: '', premioDetalle: '', premioImagen: '', premioValor: 0, destino: '', precio: 100, maxPorPersona: 10, presets: [1, 2, 5, 10], activa: false, version: 0, updatedPor: '', updatedAt: '' };
  protected motivo = '';
  protected confirmacion = '';
  protected motivoRep = '';
  protected anularGanador = false;
  protected testigo = '';
  protected notificar = true;
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'sorteo.gestionar'));
  protected readonly puedeSortear = computed(() => this.auth.can(this.cid(), 'sorteo.sortear'));
  protected readonly hechos = computed(() => this.panel()?.checklist.filter((x) => x.estado !== 'pendiente').length ?? 0);
  private t: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('sorteo.')) {
        clearTimeout(this.t);
        this.t = setTimeout(() => void this.cargar(false), 800);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.t);
      sub.unsubscribe();
    });
  }

  async cargar(form = true): Promise<void> {
    try {
      const p = await this.api.panel(this.cid());
      this.aplicar(p, form);
      if (this.tab() === 'boletos') void this.cargarCompras();
      if (this.tab() === 'historial') this.historial.set(await this.api.sorteos(this.cid()));
    } catch {
      if (!this.panel()) this.panel.set(null);
    }
  }
  private aplicar(p: Panel, form = true): void {
    this.panel.set(p);
    if (form) this.cfg = { ...p.config, presets: [...(p.config.presets ?? [])] };
  }
  protected ir(t: Tab): void {
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
    if (t === 'boletos') void this.cargarCompras();
    if (t === 'historial') void this.api.sorteos(this.cid()).then((h) => this.historial.set(h));
  }
  protected n(v: number): string { return new Intl.NumberFormat('es-ES').format(v); }
  protected ini(s: string): string { return s.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(); }
  protected toCents(v: unknown): number { return Math.round(Number(v || 0) * 100); }
  protected nums(v: string): number[] { return v.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => x > 0).slice(0, 6); }

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      this.aplicar(await this.api.guardar(this.cid(), this.cfg));
      this.toasts.success('Sorteo guardado');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar.'));
      const p = problemOf(e);
      if (p.code === 'CHECKLIST_LEGAL_PENDIENTE' || p.code === 'FALTAN_DATOS') this.cfg.activa = false;
    } finally {
      this.guardando.set(false);
    }
  }
  protected async marcar(clave: string, estado: string): Promise<void> {
    try { this.aplicar(await this.api.checklist(this.cid(), clave, estado)); } catch (e) { this.toasts.error(errText(e, 'No se pudo marcar.')); }
  }
  protected async subir(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try { this.cfg.premioImagen = await this.media.upload(file, this.cfg.premio); } catch (e) { this.toasts.error(errText(e, 'No se pudo subir.')); }
  }

  protected filtrar(p: Partial<{ estado: string; q: string; pagina: number }>, reset = true): void {
    this.f.update((f) => ({ ...f, ...(reset ? { pagina: 1 } : {}), ...p }));
    clearTimeout(this.t);
    this.t = setTimeout(() => void this.cargarCompras(), 250);
  }
  private async cargarCompras(): Promise<void> {
    try { this.compras.set(await this.api.compras(this.cid(), this.f())); } catch { /* keep */ }
  }
  protected async exportar(): Promise<void> {
    const b = await this.api.csv(this.cid());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'sorteo-compras.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  protected abrirReembolso(x: Compra): void {
    this.motivo = '';
    this.confirmacion = '';
    this.reembolso.set(x);
  }
  protected async reembolsar(): Promise<void> {
    const r = this.reembolso();
    if (!r) return;
    this.ocupado.set(true);
    try {
      await this.api.reembolsar(this.cid(), r.id, this.motivo.trim());
      this.reembolso.set(null);
      this.toasts.success(`Reembolsados ${euros(r.importe)}`);
      await this.cargar(false);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo reembolsar.'));
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async reenviar(x: Compra): Promise<void> {
    try { await this.api.reenviar(this.cid(), x.id); this.toasts.success('Boletos reenviados a ' + x.email); } catch (e) { this.toasts.error(errText(e, 'No se pudo reenviar.')); }
  }

  protected async congelar(): Promise<void> {
    const p = this.panel();
    if (!p) return;
    const ok = await this.confirm.ask({ title: '¿Congelar la lista?', text: `Entran ${this.n(p.kpis.boletos)} boletos válidos. Se genera la semilla y se publican sus hashes; la lista ya no cambia.`, confirm: 'Congelar' });
    if (!ok) return;
    await this.paso(() => this.api.congelar(this.cid(), this.testigo.trim()));
  }
  protected async sortear(): Promise<void> {
    const a = this.panel()?.actual;
    if (!a) return;
    this.girando.set(true);
    const t = setInterval(() => this.rueda.set(String(Math.floor(Math.random() * 10000)).padStart(4, '0')), 70);
    const [r] = await Promise.all([this.paso(() => this.api.ejecutar(this.cid(), a.id)), new Promise((res) => setTimeout(res, 2200))]);
    clearInterval(t);
    this.girando.set(false);
    void r;
  }
  protected async confirmar(): Promise<void> {
    const a = this.panel()?.actual;
    if (a) await this.paso(() => this.api.confirmar(this.cid(), a.id, this.notificar));
  }
  protected async repetir(): Promise<void> {
    const a = this.panel()?.actual;
    if (!a) return;
    await this.paso(() => this.api.repetir(this.cid(), a.id, this.motivoRep.trim(), this.anularGanador));
    this.repetirOpen.set(false);
    this.motivoRep = '';
  }
  private async paso(fn: () => Promise<Sorteo>): Promise<Sorteo | null> {
    this.ocupado.set(true);
    try {
      const s = await fn();
      await this.cargar(false);
      return s;
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo completar.'));
      return null;
    } finally {
      this.ocupado.set(false);
    }
  }
}
