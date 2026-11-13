import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GrAlert, GrAvatar, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSkeleton, GrToasts, GrSelect } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { urlSort } from '../../shared/url-sort';
import { BO_ROW, BoCapacityMeter, BoCheckbox, BoModalForm, BoSessionCard, type BoSesion, BoSortHeader, BoEmptyState, BoPagination, BoSearch, BoSkeleton, BoTableToolbar } from '../../shared/kit';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, errText } from '../../shared/ui';
import { problemOf } from '../../core/api';
import {
  ESTADO_ENTRADA, ESTADO_SESION, EntradasApi, RESULTADO, aLocal, deLocal, diaHora, fechaCorta, hora,
  type Detalle, type Espera, type Lista, type Resumen, type Sesion, type SesionIn,
} from './api';

type Tab = 'sesiones' | 'reservas' | 'espera' | 'ajustes';

function descargar(blob: Blob, nombre: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const ORDEN_RESERVAS = ['titular', 'codigo', 'sesion', 'personas', 'estado', 'fecha'] as const;

/** «Entradas y aforo» (Figma page 58): sessions with capacity, bookings, waiting list. */
@Component({
  selector: 'bo-entradas',
  imports: [NgTemplateOutlet, GrSelect, GrAvatar, GrIconButton, BoModalForm, BoSessionCard, FormsModule, RouterLink, BoCapacityMeter, BoSortHeader, BoPageHeader, BoPagination, BoTableToolbar, BoSearch, BoSkeleton, BoEmptyState, BoCheckbox, BoDrawer, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = resumen();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Entradas y aforo" [subtitle]="r ? n(r.reservas) + ' reservas · ' + n(r.personas) + ' personas · ' + n(r.plazas) + ' plazas en ' + r.sesiones.length + ' sesiones' : ''" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Entradas y aforo']">
        @if (canEdit()) {
          <ng-container actions>
            <button grButton icon="download" (click)="exportar()">Exportar CSV</button>
            @if (tab() === 'reservas') { <button grButton variant="primary" icon="plus" (click)="abrirManual()">Reserva manual</button> }
            @else { <button grButton variant="primary" icon="plus" (click)="abrirSesion(null)">Nueva sesión</button> }
          </ng-container>
        }
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Entradas">
        @for (t of tabs; track t.v) {
          <a [routerLink]="ruta(t.v)" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null">
            {{ t.label }}@if (t.v !== 'ajustes' && r?.pestanas; as p) { <span class="rounded-2xs px-1.5 text-mono-xs" [class]="tab() === t.v ? 'bg-accent-deep/50 text-accent-text' : 'bg-bg-raised'">{{ n(p[t.v]) }}</span> }
            @if (tab() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
          </a>
        }
      </nav>
      @for (x of sobreventas(); track x.id) {
        <gr-alert tone="danger" [title]="x.nombre + ': ' + n(x.ocupadas) + ' reservas para ' + n(x.aforo) + ' plazas'">Sube el aforo, mueve reservas a otra sesión (con aviso) o mantenlo y vigila la puerta.</gr-alert>
      }

      @if (tab() === 'reservas') { @for (x of sobreventas(); track x.id) { <bo-capacity-meter [titulo]="x.nombre + ' · ' + hora(x.inicio)" [ocupadas]="x.ocupadas" [aforo]="x.aforo" /> } }

      @switch (tab()) {
        @case ('sesiones') {
          @if (r) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Reservas" [value]="n(r.reservas)" [delta]="'+' + r.nuevas7d" caption="esta semana" [trend]="acum(r.serie)" />
              <gr-kpi label="Personas" [value]="n(r.personas)" [caption]="r.media + ' por reserva'" />
              <gr-kpi label="Ocupación media" [value]="r.ocupacion + ' %'" [caption]="'de ' + n(r.plazas) + ' plazas'" />
              <gr-kpi label="Lista de espera" [value]="n(r.espera)" [caption]="r.esperaTop || 'sin espera'" />
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              @for (x of r.sesiones; track x.id) {
                <bo-session-card [nombre]="x.nombre" [cuando]="diaHora(x.inicio) + '–' + hora(x.fin) + ' · puertas ' + hora(x.puertas)" meterTitulo="Aforo" [ocupadas]="x.ocupadas" [aforo]="x.aforo" [espera]="x.enEspera"
                  [estado]="sesEstado(x)" [nota]="x.publicada ? '' : 'Borrador · no visible en /entradas'" [apertura]="(x.aperturaAt ? fechaCorta(x.aperturaAt) : 'ya') + ' → ' + (x.cierreAt ? fechaCorta(x.cierreAt) : 'inicio')"
                  [maxPorReserva]="x.maxPorReserva + ' personas'" [listaEspera]="!x.listaEspera ? 'no' : x.enEspera ? x.enEspera + ' personas · auto-promoción ' + (r.ajustes.autoPromocion ? 'ON' : 'OFF') : 'automática al agotar'"
                  (ver)="verReservas(x.id)" (publicar)="publicar(x)" (menu)="canEdit() && abrirSesion(x)" />
              }
            </div>
          } @else { <gr-skeleton class="h-96 rounded-lg" /> }
        }

        @case ('reservas') {
          <bo-table-toolbar noun="entradas" [total]="lista()?.total ?? 0" [selected]="sel().size" [loading]="lista() === undefined" [filtered]="filtrado()"
            (clear)="limpiarSel()" (reset)="filtrar({ q: '', sesion: '', estado: '', origen: '' })">
            <bo-search filters class="w-full md:w-[280px]" placeholder="Nombre, email, teléfono o código" [shortcut]="false" [value]="f().q ?? ''" (valueChange)="filtrar({ q: $event })" />
            <gr-select filters tipo="filtro" aria-label="Sesión" [ngModel]="f().sesion ?? ''" (ngModelChange)="filtrar({ sesion: $event })"><option value="">Todas las sesiones</option>@for (x of r?.sesiones ?? []; track x.id) { <option [value]="x.id">{{ x.nombre }}</option> }</gr-select>
            <gr-select filters tipo="filtro" aria-label="Estado" [ngModel]="f().estado ?? ''" (ngModelChange)="filtrar({ estado: $event })"><option value="">Sin anuladas</option><option value="reservada">Reservada</option><option value="usada">Usada</option><option value="anulada">Anulada</option></gr-select>
            <gr-select filters tipo="filtro" aria-label="Origen" [ngModel]="f().origen ?? ''" (ngModelChange)="filtrar({ origen: $event })"><option value="">Todos los orígenes</option>@for (o of lista()?.origenes ?? []; track o) { <option [value]="o">{{ o }}</option> }</gr-select>
            <button bulk grButton variant="secondary" icon="mail" (click)="bulk('reenviar')">Reenviar email</button>
            <button bulk grButton variant="secondary" (click)="moverOpen.set(true)">Mover</button>
            <button bulk grButton variant="danger" (click)="anularOpen.set(true)">Anular</button>
          </bo-table-toolbar>
          @let l = lista();
          @if (l === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar las reservas"><button grButton (click)="cargarLista()">Reintentar</button></gr-empty> }
          @else if (l) {
            <ul class="flex flex-col gap-3 md:hidden">
              @for (e of l.items; track e.id) {
                <li><button type="button" class="flex w-full items-center gap-3 rounded-md border border-line-subtle bg-bg-card p-3 text-left hover:bg-bg-raised focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none" [class.opacity-55]="e.estado === 'anulada'" (click)="ver(e.id)">
                  <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ e.nombre }} {{ e.apellidos }}</span><span class="block text-body-xs text-text-tertiary">{{ e.codigo }} · {{ e.sesion }} · {{ e.personas }} pers.</span></span>
                  <gr-badge [tone]="estE[e.estado].tone">{{ estE[e.estado].label }}</gr-badge>
                </button></li>
              } @empty { <li><bo-empty-state [kind]="filtrado() ? 'no-results' : 'no-data'" [title]="filtrado() ? 'Nada coincide con los filtros' : 'Todavía no hay reservas'" /></li> }
            </ul>
            <div class="flex items-center justify-between gap-2 md:hidden">
              <button grButton icon="chevron-left" [disabled]="l.pagina <= 1" (click)="filtrar({ pagina: l.pagina - 1 }, false)">Anterior</button>
              <span class="font-mono text-mono-xs text-text-tertiary">Página {{ l.pagina }} de {{ pages(l) }}</span>
              <button grButton [disabled]="l.pagina >= pages(l)" (click)="filtrar({ pagina: l.pagina + 1 }, false)">Siguiente<gr-icon name="chevron-right" [size]="16" /></button>
            </div>
            <section class="hidden overflow-x-auto rounded-lg border border-line-subtle bg-bg-card md:block">
              <table class="w-full min-w-[860px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-[11px] font-semibold tracking-[0.04em] text-text-tertiary uppercase"><tr><th class="w-10 px-3 py-3"><bo-checkbox [value]="todos()" (valueChange)="selTodos()" aria="Seleccionar todas las de esta página" /></th><th boSort class="py-3" [sort]="srt.sortDe('titular')" (toggle)="ordenar('titular')">Titular</th><th boSort class="py-3" [sort]="srt.sortDe('codigo')" (toggle)="ordenar('codigo')">Código</th><th boSort class="py-3" [sort]="srt.sortDe('sesion')" (toggle)="ordenar('sesion')">Sesión</th><th boSort class="py-3" [sort]="srt.sortDe('personas')" (toggle)="ordenar('personas')">Pers.</th><th boSort class="py-3" [sort]="srt.sortDe('estado')" (toggle)="ordenar('estado')">Estado</th><th class="px-3 py-3">Novedades</th><th class="px-3 py-3">Origen</th><th boSort class="py-3" [sort]="srt.sortDe('fecha')" (toggle)="ordenar('fecha')">Fecha</th><th class="w-12"></th></tr></thead>
                <tbody>
                  @for (e of l.items; track e.id) {
                    <tr class="cursor-pointer last:border-0 hover:bg-bg-raised" [class]="e.estado === 'anulada' ? row.disabled : sel().has(e.id) ? row.selected : row.default" (click)="ver(e.id)">
                      <td class="px-3 py-2.5" (click)="$event.stopPropagation()">@if (e.estado !== 'anulada') { <bo-checkbox [value]="sel().has(e.id)" (valueChange)="toggle(e.id)" [aria]="'Seleccionar ' + e.codigo" /> }</td>
                      <td class="px-3 py-2.5"><div class="flex items-center gap-3"><gr-avatar [name]="e.nombre + ' ' + e.apellidos" /><div class="min-w-0"><p class="text-label-s">{{ e.nombre }} {{ e.apellidos }}</p><p class="truncate text-body-xs text-text-tertiary">{{ e.email || (e.manual ? 'Reserva manual' : '') }}</p></div></div></td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs">{{ e.codigo }}</td>
                      <td class="px-3 py-2.5 text-text-secondary">{{ e.sesion }}</td>
                      <td class="px-3 py-2.5 text-center font-mono">{{ e.dentro ? e.dentro + '/' : '' }}{{ e.personas }}</td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="estE[e.estado].tone">{{ estE[e.estado].label }}</gr-badge></td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="e.novedades ? 'success' : 'neutral'">{{ e.novedades ? 'Sí' : 'No' }}</gr-badge></td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ e.origen }}</td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ fechaCorta(e.createdAt) }}</td>
                      <td class="px-2 py-2.5 text-right"><button grIconButton type="button" icon="more" [label]="'Abrir ' + e.codigo" (click)="$event.stopPropagation(); ver(e.id)"></button></td>
                    </tr>
                  } @empty { <tr><td colspan="10" class="p-4"><bo-empty-state class="border-0" [kind]="filtrado() ? 'no-results' : 'no-data'" [title]="filtrado() ? 'Nada coincide con los filtros' : 'Todavía no hay reservas'" [text]="filtrado() ? 'Prueba con el código o el email, o limpia los filtros.' : 'Aparecerán aquí en cuanto se abran las entradas.'" /></td></tr> }
                </tbody>
              </table>
            </section>
            <div class="hidden items-center justify-between text-body-xs text-text-tertiary md:flex">
              <span>Mostrando {{ l.items.length ? (l.pagina - 1) * l.por + 1 : 0 }}–{{ (l.pagina - 1) * l.por + l.items.length }} de {{ n(l.total) }}</span>
              <bo-pagination [page]="l.pagina" [pages]="pages(l)" (change)="filtrar({ pagina: $event }, false)" />
            </div>
          } @else { <bo-skeleton /> }
        }

        @case ('espera') {
          @let w = espera();
          <div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[560px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="w-10 px-3 py-3">#</th><th class="px-3 py-3">Persona</th><th class="px-3 py-3">Sesión</th><th class="px-3 py-3 text-center">Pers.</th><th class="px-3 py-3">Estado</th><th class="w-40"></th></tr></thead>
                <tbody>
                  @for (x of w?.items ?? []; track x.id) {
                    <tr class="border-b border-line-subtle last:border-0" [class.opacity-55]="x.estado === 'caducada'">
                      <td class="px-3 py-2.5 font-mono text-text-tertiary">{{ x.estado === 'en_espera' ? x.orden : '–' }}</td>
                      <td class="px-3 py-2.5"><div class="flex items-center gap-3"><gr-avatar [name]="x.nombre || x.email" /><div class="min-w-0"><p class="text-label-s">{{ x.nombre || x.email }}</p><p class="truncate text-body-xs text-text-tertiary">{{ x.email }}</p></div></div></td>
                      <td class="px-3 py-2.5 text-text-secondary">{{ x.sesion }}</td>
                      <td class="px-3 py-2.5 text-center font-mono">{{ x.personas }}</td>
                      <td class="px-3 py-2.5">
                        @switch (x.estado) {
                          @case ('oferta') { <gr-badge tone="warning">Oferta enviada · {{ quedan(x.expira) }}</gr-badge> }
                          @case ('caducada') { <gr-badge>Oferta caducada</gr-badge> }
                          @default { <gr-badge tone="info">En espera</gr-badge> }
                        }
                      </td>
                      <td class="px-3 py-2.5 text-right">@if (canEdit()) {
                        @if (x.estado !== 'oferta') { <button grButton size="s" variant="ghost" (click)="ofrecer(x.id)">Ofrecer plaza</button> }
                        <button type="button" class="inline-flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" [attr.aria-label]="'Quitar a ' + x.email" (click)="retirar(x.id)"><gr-icon name="trash" [size]="16" /></button>
                      }</td>
                    </tr>
                  } @empty { <tr><td colspan="6" class="px-4 py-10 text-center text-text-tertiary">Nadie en lista de espera.</td></tr> }
                </tbody>
              </table>
            </section>
            @if (w) {
              <div class="flex flex-col gap-4"><ng-container [ngTemplateOutlet]="promo" [ngTemplateOutletContext]="{ $implicit: w }" />
                @if (parcial(); as p) { <gr-alert tone="warning" [title]="'Reserva de ' + p.personas + ' personas y ' + p.libres + ' plazas libres'">{{ p.nombre }} pide {{ p.personas }}: {{ w.ajustes.permitirParcial ? 'se le ofrecerán ' + p.libres : 'se salta al siguiente' }} según «Permitir parciales».</gr-alert> }
              </div>
            }
          </div>
        }
        @case ('ajustes') {
          @if (espera(); as w) { <div class="max-w-[560px]"><ng-container [ngTemplateOutlet]="promo" [ngTemplateOutletContext]="{ $implicit: w }" /></div> } @else { <gr-skeleton class="h-60 max-w-[560px] rounded-lg" /> }
        }
      }
    </div>
    <ng-template #promo let-w>
      <aside class="flex h-fit flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
                <h2 class="text-ui-h5">Promoción automática</h2>
                <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Ofrecer plazas liberadas</p><p class="text-body-xs text-text-tertiary">Por orden de lista · email con enlace</p></div>
                  <bo-toggle [value]="w.ajustes.autoPromocion" label="Ofrecer plazas liberadas" [disabled]="!canEdit()" (changed)="ajustar({ autoPromocion: $event })" /></div>
                <gr-field label="Plazo para aceptar (horas)" for="aj-p"><input grInput id="aj-p" type="number" min="1" max="168" [ngModel]="w.ajustes.plazoHoras" (change)="ajustar({ plazoHoras: +$any($event.target).value })" [disabled]="!canEdit()" /></gr-field>
                <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Permitir parciales</p><p class="text-body-xs text-text-tertiary">Si pide 4 y quedan 2, se le ofrecen 2; si no, se salta al siguiente.</p></div>
                  <bo-toggle [value]="w.ajustes.permitirParcial" label="Permitir parciales" [disabled]="!canEdit()" (changed)="ajustar({ permitirParcial: $event })" /></div>
              </aside>
    </ng-template>

    <bo-drawer [(open)]="detOpen" [title]="det()?.codigo ?? ''" [badge]="det() ? estE[det()!.estado].label : ''">
      @if (det(); as d) {
        <p class="-mt-2 mb-4 text-body-s text-text-tertiary">{{ d.nombre }} {{ d.apellidos }} · {{ d.sesion }}</p>
        <dl class="grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 text-body-s">
          <dt class="text-text-tertiary">Personas</dt><dd>{{ d.personas }}{{ d.dentro ? ' · ' + d.dentro + ' dentro' : '' }}</dd>
          <dt class="text-text-tertiary">Email</dt><dd class="truncate">{{ d.email || '—' }}</dd>
          <dt class="text-text-tertiary">Teléfono</dt><dd>{{ d.telefono || '—' }}</dd>
          <dt class="text-text-tertiary">Origen</dt><dd>{{ d.origen }}{{ d.manual ? ' · manual' : '' }}</dd>
          <dt class="text-text-tertiary">Reservada</dt><dd>{{ fechaCorta(d.createdAt) }}</dd>
          @if (d.nota) { <dt class="text-text-tertiary">Nota</dt><dd>{{ d.nota }}</dd> }
          @if (d.motivo) { <dt class="text-text-tertiary">Motivo</dt><dd>{{ d.motivo }}</dd> }
          <dt class="text-text-tertiary">QR</dt><dd class="truncate font-mono text-mono-xs">{{ d.qr }}</dd>
        </dl>
        <h3 class="mt-5 text-mono-xs text-text-tertiary">CONSENTIMIENTOS</h3>
        <ul class="mt-2 flex flex-col gap-1.5 text-body-s">
          <li class="flex items-center gap-2"><gr-icon name="circle-check" [size]="14" class="text-success" />Privacidad {{ d.consentimientos['privacidad'] || '' }}</li>
          <li class="flex items-center gap-2"><gr-icon [name]="d.novedades ? 'circle-check' : 'minus'" [size]="14" [class]="d.novedades ? 'text-success' : 'text-text-muted'" />Novedades {{ d.novedades ? '(pendiente de doble opt-in en Contactos)' : 'no' }}</li>
        </ul>
        <h3 class="mt-5 text-mono-xs text-text-tertiary">ACCESOS</h3>
        <ul class="mt-2 flex flex-col gap-1.5 text-body-s">
          @for (x of d.escaneos; track x.id) { <li class="flex items-center gap-2"><gr-badge [tone]="res[x.resultado].tone">{{ res[x.resultado].label }}</gr-badge><span class="font-mono text-mono-xs">{{ fechaCorta(x.at) }}</span>{{ x.puesto }} · {{ x.personas }} pers.</li> }
          @empty { <li class="text-text-tertiary">Sin escanear todavía.</li> }
        </ul>
      }
      @if (canEdit() && det()?.estado !== 'anulada') {
        <ng-container drawerActions>
          <button grButton icon="mail" (click)="bulk('reenviar', [det()!.id])">Reenviar entrada</button>
          <button grButton variant="danger" class="mr-auto" (click)="anularUna()">Anular</button>
        </ng-container>
      }
    </bo-drawer>

    <bo-drawer [(open)]="sesOpen" [title]="sesEdit.id ? 'Editar ' + sesEdit.nombre : 'Nueva sesión'">
      <div class="flex flex-col gap-3">
        <gr-field label="Nombre" for="s-n"><input grInput id="s-n" maxlength="80" [(ngModel)]="sesEdit.nombre" /></gr-field>
        <gr-field label="Detalle (bloques, categorías)" for="s-d"><input grInput id="s-d" maxlength="160" [(ngModel)]="sesEdit.detalle" /></gr-field>
        <div class="grid grid-cols-2 gap-3">
          <gr-field label="Puertas" for="s-p"><input grInput id="s-p" type="datetime-local" [(ngModel)]="sesEdit.puertas" /></gr-field>
          <gr-field label="Inicio" for="s-i"><input grInput id="s-i" type="datetime-local" [(ngModel)]="sesEdit.inicio" /></gr-field>
          <gr-field label="Fin" for="s-f"><input grInput id="s-f" type="datetime-local" [(ngModel)]="sesEdit.fin" /></gr-field>
          <gr-field label="Aforo" for="s-a"><input grInput id="s-a" type="number" min="1" [(ngModel)]="sesEdit.aforo" /></gr-field>
          <gr-field label="Reservas desde" for="s-ra"><input grInput id="s-ra" type="datetime-local" [(ngModel)]="sesEdit.aperturaAt" /></gr-field>
          <gr-field label="Reservas hasta" for="s-rc"><input grInput id="s-rc" type="datetime-local" [(ngModel)]="sesEdit.cierreAt" /></gr-field>
          <gr-field label="Máx. por reserva" for="s-m"><input grInput id="s-m" type="number" min="1" max="20" [(ngModel)]="sesEdit.maxPorReserva" /></gr-field>
        </div>
        <label class="flex items-center gap-2 text-body-s"><bo-toggle [(value)]="sesEdit.publicada" label="Publicada" />Publicada en /entradas</label>
        <label class="flex items-center gap-2 text-body-s"><bo-toggle [(value)]="sesEdit.listaEspera" label="Lista de espera" />Lista de espera al agotarse</label>
        @if (sobreventa()) { <gr-alert tone="danger" [title]="sobreventa()">Sube el aforo, mueve reservas a otra sesión o confirma que mantienes la sobreventa.</gr-alert> }
      </div>
      <ng-container drawerActions>
        @if (sesEdit.id) { <button grButton variant="ghost" icon="trash" class="mr-auto" (click)="borrarSesion()">Borrar</button> }
        @if (sobreventa()) { <button grButton variant="danger" [loading]="guardando()" (click)="guardarSesion(true)">Mantener sobreventa</button> }
        <button grButton variant="primary" [loading]="guardando()" (click)="guardarSesion(false)">Guardar</button>
      </ng-container>
    </bo-drawer>

    <bo-modal-form [(open)]="manualOpen" title="Nueva entrada manual" [busy]="guardando()" (submit)="guardarManual()">
      <gr-field label="Nombre y apellidos" for="m-n"><input grInput id="m-n" name="nombre" maxlength="120" [(ngModel)]="man.nombre" /></gr-field>
      <div class="grid grid-cols-2 gap-3">
        <gr-field label="Sesión" for="m-s"><gr-select id="m-s" name="sesion" [(ngModel)]="man.sesionId">@for (x of resumen()?.sesiones ?? []; track x.id) { <option [value]="x.id">{{ x.nombre }}</option> }</gr-select></gr-field>
        <gr-field label="Personas" for="m-p"><input grInput id="m-p" name="personas" type="number" min="1" max="20" [(ngModel)]="man.personas" /></gr-field>
      </div>
      <gr-field label="Email" for="m-e"><input grInput id="m-e" name="email" type="email" placeholder="opcional · para enviar el QR" [(ngModel)]="man.email" /></gr-field>
      <ng-container modalActions><button grButton type="button" variant="ghost" (click)="manualOpen.set(false)">Cancelar</button><button grButton type="submit" variant="primary" [loading]="guardando()">{{ man.email ? 'Crear y enviar QR' : 'Crear entrada' }}</button></ng-container>
    </bo-modal-form>

    <bo-drawer [(open)]="moverOpen" [title]="'Mover ' + sel().size + ' reservas'">
      <div class="flex flex-col gap-3">
        <gr-field label="Sesión de destino" for="mv-s"><gr-select id="mv-s" [(ngModel)]="mover.sesionId"><option value="" hidden>Elige…</option>@for (x of resumen()?.sesiones ?? []; track x.id) { <option [value]="x.id">{{ x.nombre }} · quedan {{ x.libres }}</option> }</gr-select></gr-field>
        <label class="flex items-center gap-2 text-body-s"><bo-toggle [(value)]="mover.avisar" label="Avisar" />Enviar la entrada actualizada a cada titular</label>
      </div>
      <ng-container drawerActions><button grButton variant="ghost" (click)="moverOpen.set(false)">Cancelar</button><button grButton variant="primary" [disabled]="!mover.sesionId" (click)="bulk('mover')">Mover</button></ng-container>
    </bo-drawer>

    <bo-modal-form [open]="anularOpen()" (openChange)="anularOpen.set($event)" [title]="'Anular ' + sel().size + (sel().size === 1 ? ' entrada' : ' entradas')" (submit)="anularOk() && bulk('anular')">
      <p class="text-body-s text-text-secondary">{{ sel().size === 1 ? 'La entrada pasará' : 'Las ' + sel().size + ' entradas pasarán' }} a Anulada, se liberarán {{ plazasSel() }} plazas{{ anular.avisar ? ' y se avisará a sus titulares' : '' }}. Los QR dejarán de ser válidos en la puerta.</p>
      <gr-field label="Motivo" for="an-m"><input grInput id="an-m" name="motivo" maxlength="200" [(ngModel)]="anular.motivo" /></gr-field>
      <label class="flex items-center gap-2 text-body-s"><bo-toggle [(value)]="anular.avisar" label="Avisar" />Avisar a los titulares por email</label>
      @if (sel().size >= 10) { <gr-field label="Escribe ANULAR para confirmar" for="an-c" hint="Esta acción queda en el registro de auditoría"><input grInput id="an-c" name="confirma" autocomplete="off" [(ngModel)]="anular.confirma" /></gr-field> }
      <ng-container modalActions>
        <button grButton type="button" variant="ghost" (click)="anularOpen.set(false)">Cancelar</button>
        <button grButton type="submit" variant="danger" [disabled]="!anularOk()">Anular {{ sel().size }} {{ sel().size === 1 ? 'entrada' : 'entradas' }}</button>
      </ng-container>
    </bo-modal-form>
  `,
})
export class EntradasPage {
  private readonly api = inject(EntradasApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly route = inject(ActivatedRoute);
  protected readonly comps = inject(Competitions);
  protected readonly est = ESTADO_SESION;
  protected readonly estE = ESTADO_ENTRADA;
  protected readonly res = RESULTADO;
  protected readonly hora = hora;
  protected readonly diaHora = diaHora;
  protected readonly fechaCorta = fechaCorta;
  protected readonly min = Math.min;
  protected readonly tabs: { v: Tab; label: string }[] = [{ v: 'sesiones', label: 'Sesiones' }, { v: 'reservas', label: 'Reservas' }, { v: 'espera', label: 'Lista de espera' }, { v: 'ajustes', label: 'Ajustes' }];
  protected readonly tab = signal<Tab>((this.route.snapshot.data['tab'] as Tab) ?? 'sesiones');
  protected readonly resumen = signal<Resumen | null>(null);
  protected readonly lista = signal<Lista | null | undefined>(undefined);
  protected readonly row = BO_ROW;
  protected readonly filtrado = computed(() => { const f = this.f(); return !!(f.q || f.sesion || f.estado || f.origen); });
  protected readonly espera = signal<Espera | null>(null);
  protected readonly srt = urlSort(ORDEN_RESERVAS, 'fecha', 'desc', (c) => (c === 'fecha' ? 'desc' : 'asc'));
  protected readonly f = signal<{ sesion?: string; estado?: string; origen?: string; q?: string; pagina?: number }>({ pagina: 1, sesion: this.route.snapshot.queryParamMap.get('sesion') ?? undefined, q: this.route.snapshot.queryParamMap.get('q') ?? undefined });
  protected readonly sel = signal(new Set<string>());
  protected readonly det = signal<Detalle | null>(null);
  protected readonly detOpen = signal(false);
  protected readonly sesOpen = signal(false);
  protected readonly manualOpen = signal(false);
  protected readonly moverOpen = signal(false);
  protected readonly anularOpen = signal(false);
  protected readonly guardando = signal(false);
  protected readonly sobreventa = signal('');
  protected sesEdit: { id?: string; version?: number; nombre: string; detalle: string; inicio: string; fin: string; puertas: string; aforo: number; maxPorReserva: number; aperturaAt: string; cierreAt: string; publicada: boolean; listaEspera: boolean } = this.sesVacia();
  protected man = { sesionId: '', nombre: '', apellidos: '', email: '', telefono: '', personas: 1, nota: '', enviar: true, forzar: false };
  protected mover = { sesionId: '', avisar: true };
  protected anular = { motivo: '', avisar: true, confirma: '' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly canEdit = computed(() => this.auth.can(this.cid(), 'entradas.gestionar'));
  protected readonly sobreventas = computed(() => (this.resumen()?.sesiones ?? []).filter((x) => x.sobreventa > 0));
  private t?: ReturnType<typeof setTimeout>;

  constructor() {
    // ⌘K lands on reservas with ?q=; also when already on this page.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const q = p.get('q') ?? '';
      if (this.tab() === 'reservas' && q !== (this.f().q ?? '')) this.filtrar({ q });
    });
    effect(() => {
      if (!this.cid()) return;
      untracked(() => {
        // «Nueva entrada manual» from the Inicio lands here with ?manual=1.
        void this.cargar().then(() => {
          if (this.canEdit() && this.route.snapshot.queryParamMap.get('manual') === '1') this.abrirManual();
        });
        if (this.tab() === 'reservas') void this.cargarLista();
        if (this.tab() === 'espera' || this.tab() === 'ajustes') void this.api.espera(this.cid()).then((w) => this.espera.set(w));
      });
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (['entrada.creada', 'entrada.anulada', 'entrada.cambiada', 'aforo.actualizado', 'espera.oferta'].includes(e.tipo)) {
        clearTimeout(this.t);
        this.t = setTimeout(() => {
          void this.cargar();
          if (this.tab() === 'reservas') void this.cargarLista();
        }, 1000);
      }
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }
  protected ruta(t: Tab): string[] {
    return ['/', this.comps.current()?.slug ?? '', 'entradas', ...(t === 'sesiones' ? [] : [t])];
  }
  protected pages(l: { total: number; por: number }): number {
    return Math.max(1, Math.ceil(l.total / l.por));
  }
  protected n(v: number): string {
    return (v ?? 0).toLocaleString('es-ES');
  }
  protected acum(s: number[]): number[] {
    let t = 0;
    return s.map((x) => (t += x));
  }
  protected quedan(iso?: string): string {
    if (!iso) return '';
    const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));
    return h ? `${h} h` : 'menos de 1 h';
  }
  private async cargar(): Promise<void> {
    try {
      this.resumen.set(await this.api.resumen(this.cid()));
    } catch {
      /* the cards stay as they were */
    }
  }
  protected async cargarLista(): Promise<void> {
    try {
      this.lista.set(await this.api.lista(this.cid(), { ...this.f(), orden: this.srt.orden(), dir: this.srt.dir() }));
    } catch {
      this.lista.set(null);
    }
  }
  protected ordenar(c: (typeof ORDEN_RESERVAS)[number]): void {
    this.srt.toggle(c);
    this.filtrar({});
  }
  protected filtrar(p: Partial<{ sesion: string; estado: string; origen: string; q: string; pagina: number }>, reset = true): void {
    this.f.set({ ...this.f(), ...p, ...(reset ? { pagina: 1 } : {}) });
    clearTimeout(this.t);
    this.t = setTimeout(() => void this.cargarLista(), p.q !== undefined ? 250 : 0);
  }
  protected verReservas(id: string): void {
    this.tab.set('reservas');
    this.filtrar({ sesion: id });
  }
  protected limpiarSel(): void {
    this.sel.set(new Set());
  }
  protected readonly todos = computed(() => {
    const ids = (this.lista()?.items ?? []).filter((e) => e.estado !== 'anulada').map((e) => e.id), n = ids.filter((id) => this.sel().has(id)).length;
    return n && n === ids.length ? true : n ? 'mixed' : false;
  });
  protected selTodos(): void {
    this.sel.set(this.todos() === true ? new Set() : new Set((this.lista()?.items ?? []).filter((e) => e.estado !== 'anulada').map((e) => e.id)));
  }
  protected toggle(id: string): void {
    const s = new Set(this.sel());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.sel.set(s);
  }
  protected async ver(id: string): Promise<void> {
    this.det.set(null);
    this.detOpen.set(true);
    try {
      this.det.set(await this.api.detalle(this.cid(), id));
    } catch (e) {
      this.toasts.error('No se pudo abrir', errText(e));
    }
  }
  protected async exportar(): Promise<void> {
    try {
      descargar(await this.api.exportar(this.cid(), this.f()), 'entradas.csv');
    } catch (e) {
      this.toasts.error('No se pudo exportar', errText(e));
    }
  }
  protected anularUna(): void {
    const d = this.det();
    if (!d) return;
    this.sel.set(new Set([d.id]));
    this.detOpen.set(false);
    this.anularOpen.set(true);
  }
  protected async bulk(accion: 'anular' | 'reenviar' | 'mover', ids = [...this.sel()]): Promise<void> {
    try {
      const r = await this.api.bulk(this.cid(), ids, accion, accion === 'anular' ? { motivo: this.anular.motivo, avisar: this.anular.avisar } : accion === 'mover' ? { sesionId: this.mover.sesionId, avisar: this.mover.avisar } : {});
      this.toasts.success({ anular: `${r.afectadas} anuladas · ${r.personas} plazas liberadas`, reenviar: `${r.afectadas} entradas reenviadas`, mover: `${r.afectadas} reservas movidas` }[accion]);
      this.sel.set(new Set());
      this.anularOpen.set(false);
      this.moverOpen.set(false);
      this.anular = { motivo: '', avisar: true, confirma: '' };
      await Promise.all([this.cargar(), this.cargarLista()]);
    } catch (e) {
      this.toasts.error('No se pudo', errText(e));
    }
  }

  protected anularOk(): boolean {
    return !!this.anular.motivo.trim() && (this.sel().size < 10 || this.anular.confirma === 'ANULAR');
  }
  protected readonly plazasSel = computed(() => (this.lista()?.items ?? []).filter((e) => this.sel().has(e.id)).reduce((t, e) => t + e.personas - e.dentro, 0));
  /** First person waiting who asks for more seats than are free (Figma 96:25727 warning). */
  protected readonly parcial = computed(() => {
    const ses = this.resumen()?.sesiones ?? [];
    for (const x of this.espera()?.items ?? []) {
      if (x.estado !== 'en_espera') continue;
      const libres = ses.find((s) => s.id === x.sesionId)?.libres ?? 0;
      return libres > 0 && x.personas > libres ? { nombre: x.nombre || x.email, personas: x.personas, libres } : null;
    }
    return null;
  });

  // ---- sessions ----
  protected sesEstado(x: Sesion): BoSesion {
    if (!x.publicada) return 'draft';
    return ({ disponible: 'open', proximamente: 'open', ultimas: 'almost', agotada: 'full', cerrada: 'closed' } as const)[x.estado];
  }
  protected async publicar(x: Sesion): Promise<void> {
    if (!this.canEdit()) return this.toasts.error('Sin permiso', 'Necesitas entradas.gestionar para publicar.');
    const body: SesionIn = { nombre: x.nombre, detalle: x.detalle || undefined, inicio: x.inicio, fin: x.fin, puertas: x.puertas, aforo: x.aforo, maxPorReserva: x.maxPorReserva,
      aperturaAt: x.aperturaAt || undefined, cierreAt: x.cierreAt || undefined, publicada: true, listaEspera: x.listaEspera };
    try {
      this.resumen.set(await this.api.editarSesion(this.cid(), x.id, x.version, body));
      this.toasts.success('Sesión publicada', 'Ya aparece en /entradas.');
    } catch (e) {
      this.toasts.error('No se pudo publicar', errText(e));
    }
  }
  private sesVacia() {
    return { nombre: '', detalle: '', inicio: '', fin: '', puertas: '', aforo: 600, maxPorReserva: 6, aperturaAt: '', cierreAt: '', publicada: false, listaEspera: true };
  }
  protected abrirSesion(x: Sesion | null): void {
    this.sobreventa.set('');
    this.sesEdit = x
      ? { id: x.id, version: x.version, nombre: x.nombre, detalle: x.detalle, inicio: aLocal(x.inicio), fin: aLocal(x.fin), puertas: aLocal(x.puertas), aforo: x.aforo, maxPorReserva: x.maxPorReserva,
        aperturaAt: aLocal(x.aperturaAt), cierreAt: aLocal(x.cierreAt), publicada: x.publicada, listaEspera: x.listaEspera }
      : this.sesVacia();
    this.sesOpen.set(true);
  }
  protected async guardarSesion(forzar: boolean): Promise<void> {
    const e = this.sesEdit;
    if (!e.nombre || !e.inicio || !e.fin || !e.puertas) return this.toasts.error('Completa nombre, puertas, inicio y fin');
    const body: SesionIn = { nombre: e.nombre, detalle: e.detalle || undefined, inicio: deLocal(e.inicio), fin: deLocal(e.fin), puertas: deLocal(e.puertas), aforo: +e.aforo, maxPorReserva: +e.maxPorReserva,
      aperturaAt: e.aperturaAt ? deLocal(e.aperturaAt) : undefined, cierreAt: e.cierreAt ? deLocal(e.cierreAt) : undefined, publicada: e.publicada, listaEspera: e.listaEspera };
    this.guardando.set(true);
    try {
      this.resumen.set(e.id ? await this.api.editarSesion(this.cid(), e.id, e.version ?? 0, body, forzar) : await this.api.crearSesion(this.cid(), body));
      this.sesOpen.set(false);
      this.toasts.success('Sesión guardada');
    } catch (err) {
      const p = problemOf(err);
      if (p.code === 'SOBREVENTA') this.sobreventa.set(p.detail ?? 'Sobreventa');
      else this.toasts.error('No se pudo guardar', errText(err));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async borrarSesion(): Promise<void> {
    if (!this.sesEdit.id || !(await this.confirm.ask({ title: 'Borrar la sesión', text: 'Solo se puede borrar si no tiene reservas.', confirm: 'Borrar', danger: true }))) return;
    try {
      this.resumen.set(await this.api.borrarSesion(this.cid(), this.sesEdit.id));
      this.sesOpen.set(false);
    } catch (e) {
      this.toasts.error('No se pudo borrar', errText(e));
    }
  }

  // ---- manual booking ----
  protected abrirManual(): void {
    this.man = { sesionId: this.resumen()?.sesiones.find((x) => x.publicada)?.id ?? '', nombre: '', apellidos: '', email: '', telefono: '', personas: 1, nota: '', enviar: true, forzar: false };
    this.manualOpen.set(true);
  }
  protected async guardarManual(): Promise<void> {
    const m = this.man;
    const [nombre, ...ap] = m.nombre.trim().split(/\s+/);
    if (!m.sesionId || !nombre) return this.toasts.error('Elige sesión y escribe el nombre');
    this.guardando.set(true);
    try {
      const d = await this.api.manual(this.cid(), { ...m, nombre, apellidos: ap.join(' '), personas: +m.personas, enviar: !!m.email });
      this.manualOpen.set(false);
      this.toasts.success(`Entrada ${d.codigo} creada`, m.email ? `QR enviado a ${m.email}` : 'Sin email: dale el código.');
      await Promise.all([this.cargar(), this.cargarLista()]);
    } catch (e) {
      this.toasts.error('No se pudo reservar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  // ---- waiting list ----
  protected async ofrecer(id: string): Promise<void> {
    try {
      this.espera.set(await this.api.ofrecer(this.cid(), id));
      this.toasts.success('Oferta enviada', 'Tiene el plazo configurado para aceptarla.');
    } catch (e) {
      this.toasts.error('No se pudo ofrecer', errText(e));
    }
  }
  protected async retirar(id: string): Promise<void> {
    try {
      this.espera.set(await this.api.retirar(this.cid(), id));
    } catch (e) {
      this.toasts.error('No se pudo quitar', errText(e));
    }
  }
  protected async ajustar(p: Partial<{ autoPromocion: boolean; plazoHoras: number; permitirParcial: boolean }>): Promise<void> {
    const w = this.espera();
    if (!w) return;
    try {
      this.espera.set(await this.api.ajustes(this.cid(), { ...w.ajustes, ...p }));
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    }
  }
}
