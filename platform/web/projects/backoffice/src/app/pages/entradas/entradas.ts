import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fmtNumber, type GrTone, GrAlert, GrAvatar, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSkeleton, GrToasts, GrSelect } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { urlSort } from '../../shared/url-sort';
import { BO_ROW, BoMenu, type BoMenuItem, BoCapacityMeter, BoCheckbox, BoModalForm, BoSessionCard, type BoSesion, BoSortHeader, BoEmptyState, BoPagination, BoSearch, BoSkeleton, BoTableToolbar } from '../../shared/kit';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, errText } from '../../shared/ui';
import { problemOf } from '../../core/api';
import {
  ESTADO_ENTRADA, ESTADO_SESION, EntradasApi, RESULTADO, aLocal, deLocal, diaHora, diaMes, fechaCorta, hora,
  type Ajustes, type DiaPabellon, type Detalle, type Entrada, type Espera, type EsperaItem, type Lista, type Resumen, type Sesion, type SesionIn,
} from './api';
import { SorteoApi, euros } from '../sorteo/api';

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
  imports: [NgTemplateOutlet, BoMenu, GrSelect, GrAvatar, GrIconButton, BoModalForm, BoSessionCard, FormsModule, RouterLink, BoCapacityMeter, BoSortHeader, BoPageHeader, BoPagination, BoTableToolbar, BoSearch, BoSkeleton, BoEmptyState, BoCheckbox, BoDrawer, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'menu.set(null)' },
  template: `
    @let r = resumen();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header [class.max-md:hidden]="tab() === 'reservas'" title="Entradas y aforo" [subtitle]="r ? n(r.reservas) + ' reservas · ' + n(r.personas) + ' personas · ' + n(r.plazas) + ' plazas en ' + r.sesiones.length + ' sesiones' : ''" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Entradas y aforo']">
        @if (canEdit()) {
          <ng-container actions>
            <button grButton icon="download" (click)="exportar()">Exportar CSV</button>
            @if (tab() === 'reservas') { <button grButton variant="primary" icon="plus" (click)="abrirManual()">Nueva entrada manual</button> }
            @else { <button grButton variant="primary" icon="plus" (click)="abrirSesion(null)">Nueva sesión</button> }
          </ng-container>
        }
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none] max-md:[mask-image:linear-gradient(to_right,#000_85%,transparent)]" aria-label="Entradas">
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
              <gr-kpi label="Personas" [value]="n(r.personas)" [caption]="dec(r.media) + ' por reserva'" [trend]="acum(r.serie)" />
              <gr-kpi label="Ocupación media" [value]="dec(r.ocupacion) + ' %'" [caption]="'de ' + n(r.plazas) + ' plazas'" [trend]="acum(r.serie)" />
              <gr-kpi label="Lista de espera" [value]="n(r.espera)" [caption]="r.esperaTop || 'sin espera'" />
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              @for (x of r.sesiones; track x.id) {
                <bo-session-card [nombre]="x.nombre" [cuando]="diaHora(x.inicio) + '–' + hora(x.fin) + ' · puertas ' + hora(x.puertas)" meterTitulo="Aforo" [ocupadas]="x.ocupadas" [aforo]="x.aforo" [espera]="x.enEspera"
                  [estado]="sesEstado(x)" [nota]="x.publicada ? '' : 'Borrador · no visible en /entradas'" [apertura]="(x.aperturaAt ? diaMes(x.aperturaAt) : 'ya') + ' → ' + diaMes(x.cierreAt || x.inicio)"
                  [maxPorReserva]="pl(x.maxPorReserva, 'persona')" [listaEspera]="!x.listaEspera ? 'no' : x.enEspera ? pl(x.enEspera, 'persona') + ' · auto-promoción ' + (r.ajustes.autoPromocion ? 'ON' : 'OFF') : 'automática al agotar'"
                  (ver)="verReservas(x.id)" (publicar)="publicar(x)" (menu)="canEdit() && menuSesion($event, x)" />
              }
            </div>
            @for (d of r.pabellon ?? []; track d.dia) {
              <gr-alert tone="info" [title]="d.dia + ': ' + n(r.ajustes.aforoPabellon || d.simultaneas) + ' plazas simultáneas como máximo'">{{ listaSes(d) }} {{ d.solapan ? 'se solapan: ' + n(d.simultaneas) + ' plazas a la vez.' : 'no se solapan; si cambias horarios para que se solapen, el sistema pedirá reducir aforos.' }}</gr-alert>
            }
          } @else { <gr-skeleton class="h-96 rounded-lg" /> }
        }

        @case ('reservas') {
          <bo-table-toolbar noun="entradas" [total]="lista()?.total ?? 0" [selected]="sel().size" [loading]="lista() === undefined" [filtered]="filtrado()"
            (clear)="limpiarSel()" (reset)="filtrar({ q: '', sesion: '', estado: '', origen: '' })">
            <bo-search filters class="w-full md:w-[280px]" placeholder="Nombre, email, teléfono o código" [shortcut]="false" [value]="f().q ?? ''" (valueChange)="filtrar({ q: $event })" />
            <gr-select filters class="max-md:hidden" tipo="filtro" aria-label="Sesión" [ngModel]="f().sesion ?? ''" (ngModelChange)="filtrar({ sesion: $event })"><option value="">Todas las sesiones</option>@for (x of r?.sesiones ?? []; track x.id) { <option [value]="x.id">{{ x.nombre }}</option> }</gr-select>
            <gr-select filters class="max-md:hidden" tipo="filtro" aria-label="Estado" [ngModel]="f().estado ?? ''" (ngModelChange)="filtrar({ estado: $event })"><option value="">Sin anuladas</option><option value="reservada">Reservada</option><option value="usada">Usada</option><option value="anulada">Anulada</option></gr-select>
            <gr-select filters class="max-md:hidden" tipo="filtro" aria-label="Origen" [ngModel]="f().origen ?? ''" (ngModelChange)="filtrar({ origen: $event })"><option value="">Todos los orígenes</option>@for (o of lista()?.origenes ?? []; track o) { <option [value]="o">{{ o }}</option> }</gr-select>
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
                  <ng-container [ngTemplateOutlet]="estado" [ngTemplateOutletContext]="{ $implicit: e }" />
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
                      <td class="px-3 py-2.5"><div class="flex items-center gap-3"><gr-avatar [name]="e.nombre + ' ' + e.apellidos" /><div class="min-w-0 max-w-[200px]"><p class="truncate text-label-s">{{ e.nombre }} {{ e.apellidos }}</p><p class="truncate text-body-xs text-text-tertiary">{{ e.email || (e.manual ? 'Reserva manual' : '') }}</p></div></div></td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs">{{ e.codigo }}</td>
                      <td class="max-w-[180px] truncate px-3 py-2.5 whitespace-nowrap text-text-secondary" [title]="e.sesion">{{ e.sesion }}</td>
                      <td class="px-3 py-2.5 text-center font-mono">{{ e.dentro ? e.dentro + '/' : '' }}{{ e.personas }}</td>
                      <td class="px-3 py-2.5"><ng-container [ngTemplateOutlet]="estado" [ngTemplateOutletContext]="{ $implicit: e }" /></td>
                      <td class="px-3 py-2.5">@switch (e.novedadesEstado ?? (e.novedades ? 'pendiente' : 'no')) { @case ('si') { <gr-badge tone="success">Sí</gr-badge> } @case ('pendiente') { <gr-badge tone="warning">Pendiente</gr-badge> } @default { <gr-badge>No</gr-badge> } }</td>
                      <td class="max-w-[96px] truncate px-3 py-2.5 font-mono text-mono-xs text-text-tertiary" [title]="e.origen">{{ e.origen }}</td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ fechaCorta(e.createdAt) }}</td>
                      <td class="px-2 py-2.5 text-right"><button grIconButton type="button" icon="more" [label]="'Abrir ' + e.codigo" (click)="$event.stopPropagation(); menuEntrada($event, e)"></button></td>
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
                  @for (x of visibles(); track x.id) {
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
                      <td class="px-3 py-2.5 text-right">@if (canEdit()) { <button grIconButton type="button" icon="more" [label]="'Acciones de ' + (x.nombre || x.email)" (click)="menuEspera($event, x)"></button> }</td>
                    </tr>
                  } @empty { <tr><td colspan="6" class="px-4 py-10 text-center text-text-tertiary">Nadie en lista de espera.</td></tr> }
                </tbody>
              </table>
              @if (caducadas(); as c) { <button type="button" class="w-full border-t border-line-subtle px-4 py-3 text-left text-body-xs text-text-tertiary hover:text-text-primary" (click)="verCaducadas.set(!verCaducadas())">{{ verCaducadas() ? 'Ocultar ofertas caducadas' : 'Ver ' + pl(c, 'oferta caducada', 'ofertas caducadas') }}</button> }
            </section>
            @if (w) {
              <div class="flex flex-col gap-4"><ng-container [ngTemplateOutlet]="promo" [ngTemplateOutletContext]="{ $implicit: w }" />
                @if (parcial(); as p) { <gr-alert tone="warning" [title]="'Reserva de ' + p.personas + ' personas y ' + p.libres + ' plazas libres'">{{ p.nombre }} pide {{ p.personas }}: {{ w.ajustes.permitirParcial ? 'se le ofrecerán ' + p.libres : 'se salta al siguiente' }} según «Permitir parciales».</gr-alert> }
              </div>
            }
          </div>
        }
        @case ('ajustes') {
          @if (espera(); as w) { <div class="flex max-w-[560px] flex-col gap-4"><ng-container [ngTemplateOutlet]="promo" [ngTemplateOutletContext]="{ $implicit: w }" />
            <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6"><h2 class="text-ui-h5">Pabellón</h2>
              <gr-field label="Plazas simultáneas como máximo" for="aj-a" hint="0 = sin límite. Al guardar una sesión se comprueba que las que se solapan no lo superen." [error]="ajErr()['aforoPabellon'] ?? null"><input grInput id="aj-a" type="number" min="0" max="100000" [ngModel]="w.ajustes.aforoPabellon" (change)="ajustarNum('aforoPabellon', $any($event.target), 0, 100000)" [disabled]="!canEdit()" /></gr-field>
            </section></div> } @else { <gr-skeleton class="h-60 max-w-[560px] rounded-lg" /> }
        }
      }
    </div>
    <ng-template #promo let-w>
      <aside class="flex h-fit flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
                <h2 class="text-ui-h5">Promoción automática</h2>
                <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Ofrecer plazas liberadas</p><p class="text-body-xs text-text-tertiary">Por orden de lista · email con enlace</p></div>
                  <bo-toggle [value]="w.ajustes.autoPromocion" label="Ofrecer plazas liberadas" [disabled]="!canEdit()" (changed)="ajustar({ autoPromocion: $event })" /></div>
                <div class="grid grid-cols-2 gap-3">
                  <gr-field label="Plazo para aceptar" for="aj-p" hint="horas (1–168)" [error]="ajErr()['plazoHoras'] ?? null"><input grInput id="aj-p" type="number" min="1" max="168" [ngModel]="w.ajustes.plazoHoras" (change)="ajustarNum('plazoHoras', $any($event.target), 1, 168)" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Último aviso" for="aj-u"><gr-select id="aj-u" [ngModel]="w.ajustes.ultimoAviso" (ngModelChange)="ajustar({ ultimoAviso: +$event })" [disabled]="!canEdit()">@for (h of [0, 1, 2, 4, 6, 12]; track h) { <option [value]="h">{{ h ? h + ' h antes' : 'Sin aviso' }}</option> }</gr-select></gr-field>
                </div>
                <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Permitir parciales</p><p class="text-body-xs text-text-tertiary">Si pide 4 y quedan 2, se le ofrecen 2; si no, se salta al siguiente.</p></div>
                  <bo-toggle [value]="w.ajustes.permitirParcial" label="Permitir parciales" [disabled]="!canEdit()" (changed)="ajustar({ permitirParcial: $event })" /></div>
              </aside>
    </ng-template>

    <bo-drawer [(open)]="detOpen" [title]="det()?.codigo ?? ''" [badge]="det() ? estE[det()!.estado].label : ''">
      @if (det(); as d) {
        <p class="-mt-2 mb-4 text-body-s text-text-tertiary">{{ d.nombre }} {{ d.apellidos }} · {{ d.sesion }}</p>
        <dl class="grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 text-body-s">
          <dt class="text-text-tertiary">Personas</dt><dd>{{ d.personas }}{{ d.dentro ? ' · ' + d.dentro + ' dentro' : '' }}</dd>
          <dt class="text-text-tertiary">Email</dt><dd class="truncate">{{ d.email || '—' }}@if (d.emailRebotado) { <gr-badge tone="danger" class="ml-2">Rebotado</gr-badge> }</dd>
          <dt class="text-text-tertiary">Teléfono</dt><dd>{{ d.telefono || '—' }}</dd>
          <dt class="text-text-tertiary">Origen</dt><dd>{{ d.origen }}{{ d.manual ? ' · manual' : '' }}</dd>
          @if (sorteo(); as so) { <dt class="text-text-tertiary">Sorteo</dt><dd>{{ so }}</dd> }
          <dt class="text-text-tertiary">Reservada</dt><dd>{{ fechaCorta(d.createdAt) }}</dd>
          @if (d.nota) { <dt class="text-text-tertiary">Nota</dt><dd>{{ d.nota }}</dd> }
          @if (d.motivo) { <dt class="text-text-tertiary">Motivo</dt><dd>{{ d.motivo }}</dd> }
          <dt class="text-text-tertiary">QR</dt><dd class="truncate font-mono text-mono-xs">{{ d.qr }}</dd>
        </dl>
        <h3 class="mt-5 text-mono-xs text-text-tertiary">CONSENTIMIENTOS</h3>
        <ul class="mt-2 flex flex-col gap-1.5 text-body-s">
          <li class="flex items-center gap-2"><gr-icon name="circle-check" [size]="14" class="text-success" />Privacidad {{ d.consentimientos['privacidad'] || '' }}</li>
          <li class="flex items-center gap-2"><gr-icon [name]="d.novedades ? 'circle-check' : 'minus'" [size]="14" [class]="d.novedades ? 'text-success' : 'text-text-muted'" />Novedades {{ d.novedadesEstado === 'si' ? '· confirmado (doble opt-in)' : d.novedades ? '(pendiente de doble opt-in en Contactos)' : 'no' }}</li>
        </ul>
        <h3 class="mt-5 text-mono-xs text-text-tertiary">ACCESOS</h3>
        <ul class="mt-2 flex flex-col gap-1.5 text-body-s">
          @for (x of d.escaneos; track x.id) { <li class="flex items-center gap-2"><gr-badge [tone]="res[x.resultado].tone">{{ res[x.resultado].label }}</gr-badge><span class="font-mono text-mono-xs">{{ fechaCorta(x.at) }}</span>{{ x.puesto }} · {{ x.personas }} pers.</li> }
          @empty { <li class="text-text-tertiary">Sin escanear todavía.</li> }
        </ul>
      }
      @if (canEdit() && det() && det()!.estado !== 'anulada') {
        <ng-container drawerActions>
          <button grButton icon="mail" (click)="bulk('reenviar', [det()!.id])">Reenviar entrada</button>
          @if (det()!.dentro < det()!.personas) { <button grButton icon="check" (click)="checkin(det()!)">Check-in manual</button> }
          <button grIconButton type="button" icon="trash" label="Anular entrada" class="ml-auto text-error" (click)="anularUna()"></button>
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
          <gr-field label="Aforo" for="s-a" [error]="sesErr()['aforo'] ?? null"><input grInput id="s-a" type="number" min="1" max="20000" [(ngModel)]="sesEdit.aforo" /></gr-field>
          <gr-field label="Reservas desde" for="s-ra"><input grInput id="s-ra" type="datetime-local" [(ngModel)]="sesEdit.aperturaAt" /></gr-field>
          <gr-field label="Reservas hasta" for="s-rc"><input grInput id="s-rc" type="datetime-local" [(ngModel)]="sesEdit.cierreAt" /></gr-field>
          <gr-field label="Máx. por reserva" for="s-m" [error]="sesErr()['max'] ?? null"><input grInput id="s-m" type="number" min="1" max="20" [(ngModel)]="sesEdit.maxPorReserva" /></gr-field>
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

    <bo-modal-form [(open)]="manualOpen" title="Nueva entrada manual" [busy]="guardando()" (enviar)="guardarManual()">
      <gr-field label="Nombre y apellidos" for="m-n" [error]="manErr()['nombre'] ?? null"><input grInput id="m-n" name="nombre" maxlength="120" [(ngModel)]="man.nombre" /></gr-field>
      <div class="grid grid-cols-2 gap-3">
        <gr-field label="Sesión" for="m-s" [error]="manErr()['sesion'] ?? null"><gr-select id="m-s" name="sesion" [(ngModel)]="man.sesionId">@for (x of resumen()?.sesiones ?? []; track x.id) { <option [value]="x.id">{{ x.nombre }}</option> }</gr-select></gr-field>
        <gr-field label="Personas" for="m-p" [error]="manErr()['personas'] ?? null"><input grInput id="m-p" name="personas" type="number" min="1" [max]="maxManual()" [(ngModel)]="man.personas" /></gr-field>
      </div>
      <gr-field label="Email" for="m-e" [error]="manErr()['email'] ?? null"><input grInput id="m-e" name="email" type="email" placeholder="opcional · para enviar el QR" [(ngModel)]="man.email" /></gr-field>
      <ng-container modalActions><button grButton type="button" variant="ghost" (click)="manualOpen.set(false)">Cancelar</button><button grButton type="submit" variant="primary" [loading]="guardando()">{{ man.email ? 'Crear y enviar QR' : 'Crear entrada' }}</button></ng-container>
    </bo-modal-form>

    <bo-drawer [(open)]="moverOpen" [title]="'Mover ' + sel().size + ' reservas'">
      <div class="flex flex-col gap-3">
        <gr-field label="Sesión de destino" for="mv-s"><gr-select id="mv-s" [(ngModel)]="mover.sesionId"><option value="" hidden>Elige…</option>@for (x of resumen()?.sesiones ?? []; track x.id) { <option [value]="x.id">{{ x.nombre }} · quedan {{ x.libres }}</option> }</gr-select></gr-field>
        <label class="flex items-center gap-2 text-body-s"><bo-toggle [(value)]="mover.avisar" label="Avisar" />Enviar la entrada actualizada a cada titular</label>
      </div>
      <ng-container drawerActions><button grButton variant="ghost" (click)="moverOpen.set(false)">Cancelar</button><button grButton variant="primary" [disabled]="!mover.sesionId" (click)="bulk('mover')">Mover</button></ng-container>
    </bo-drawer>

    <bo-modal-form [open]="anularOpen()" (openChange)="anularOpen.set($event)" [title]="'Anular ' + sel().size + (sel().size === 1 ? ' entrada' : ' entradas')" (enviar)="anularOk() && bulk('anular')">
      <p class="text-body-s text-text-secondary">{{ sel().size === 1 ? 'La entrada pasará' : 'Las ' + sel().size + ' entradas pasarán' }} a Anulada, se liberarán {{ pl(plazasSel(), 'plaza') }}{{ anular.avisar ? (sel().size === 1 ? ' y se avisará a su titular' : ' y se avisará a sus titulares') : '' }}. Los QR dejarán de ser válidos en la puerta.</p>
      <gr-field label="Motivo" for="an-m"><input grInput id="an-m" name="motivo" maxlength="200" [(ngModel)]="anular.motivo" /></gr-field>
      <label class="flex items-center gap-2 text-body-s"><bo-toggle [(value)]="anular.avisar" label="Avisar" />{{ sel().size === 1 ? 'Avisar al titular por email' : 'Avisar a los titulares por email' }}</label>
      <gr-field label="Escribe ANULAR para confirmar" for="an-c" hint="Esta acción queda en el registro de auditoría"><input grInput id="an-c" name="confirma" autocomplete="off" [(ngModel)]="anular.confirma" /></gr-field>
      <ng-container modalActions>
        <button grButton type="button" variant="ghost" (click)="anularOpen.set(false)">Cancelar</button>
        <button grButton type="submit" variant="danger" [disabled]="!anularOk()">Anular {{ sel().size }} {{ sel().size === 1 ? 'entrada' : 'entradas' }}</button>
      </ng-container>
    </bo-modal-form>

    <ng-template #estado let-e>
      @let b = badge(e);
      <gr-badge [tone]="b.tone">{{ b.label }}</gr-badge>
    </ng-template>
    @if (menu(); as m) {
      <div class="fixed inset-0 z-40" (click)="menu.set(null)"></div>
      <bo-menu class="fixed z-50" [style.left.px]="m.x" [style.top.px]="m.y" [items]="m.items" (pick)="menu.set(null); m.fn($event)" />
    }
  `,
})
export class EntradasPage {
  private readonly api = inject(EntradasApi);
  private readonly sorteoApi = inject(SorteoApi);
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
  protected readonly diaMes = diaMes;
  protected readonly menu = signal<{ x: number; y: number; items: BoMenuItem[]; fn: (id: string) => void } | null>(null);
  protected readonly verCaducadas = signal(false);
  protected readonly caducadas = computed(() => (this.espera()?.items ?? []).filter((x) => x.estado === 'caducada').length);
  protected readonly visibles = computed(() => (this.espera()?.items ?? []).filter((x) => this.verCaducadas() || x.estado !== 'caducada'));
  protected readonly sorteo = signal('');
  protected readonly manErr = signal<Record<string, string>>({});
  protected readonly sesErr = signal<Record<string, string>>({});
  protected readonly ajErr = signal<Record<string, string>>({});
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
    return fmtNumber(v ?? 0);
  }
  protected badge(e: Entrada): { tone: GrTone; label: string } {
    return e.emailRebotado && e.estado === 'reservada' ? { tone: 'danger', label: 'Email rebotado' } : this.estE[e.estado];
  }
  /** «1,9» */
  protected dec(v: number): string {
    return (v ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  }
  /** «1 persona» / «3 personas» */
  protected pl(v: number, uno: string, varios = uno + 's'): string {
    return this.n(v) + ' ' + (v === 1 ? uno : varios);
  }
  /** «Mañana (600) y tarde (600)» */
  protected listaSes(d: DiaPabellon): string {
    const t = d.sesiones.map((x) => x.nombre + ' (' + this.n(x.aforo) + ')');
    return t.length > 1 ? t.slice(0, -1).join(', ') + ' y ' + t[t.length - 1] : t.join('');
  }
  private abrirMenu(ev: Event, items: BoMenuItem[], fn: (id: string) => void): void {
    ev.stopPropagation();
    const r = ((ev.currentTarget ?? ev.target) as HTMLElement).getBoundingClientRect();
    const alto = items.length * 44 + 16;
    this.menu.set({ x: Math.max(8, r.right - 240), y: r.bottom + 4 + alto > innerHeight ? Math.max(8, r.top - alto - 4) : r.bottom + 4, items, fn });
  }
  protected menuSesion(ev: Event, x: Sesion): void {
    this.abrirMenu(ev, [
      { id: 'editar', label: 'Editar sesión', icon: 'pencil' },
      { id: 'ver', label: 'Ver reservas', icon: 'ticket' },
      { id: 'publicar', label: x.publicada ? 'Despublicar' : 'Publicar sesión', icon: x.publicada ? 'eye' : 'globe' },
    ], (id) => (id === 'editar' ? this.abrirSesion(x) : id === 'ver' ? this.verReservas(x.id) : void this.publicar(x, !x.publicada)));
  }
  protected menuEntrada(ev: Event, e: Entrada): void {
    const items: BoMenuItem[] = [{ id: 'ver', label: 'Ver ficha', icon: 'eye' }];
    if (this.canEdit() && e.estado !== 'anulada') {
      items.push({ id: 'reenviar', label: 'Reenviar entrada', icon: 'mail' });
      if (e.dentro < e.personas) items.push({ id: 'checkin', label: 'Check-in manual', icon: 'check' });
      items.push({ id: 'anular', label: 'Anular', icon: 'trash', danger: true });
    }
    this.abrirMenu(ev, items, (id) => {
      if (id === 'ver') void this.ver(e.id);
      else if (id === 'reenviar') void this.bulk('reenviar', [e.id]);
      else if (id === 'checkin') void this.checkin(e);
      else { this.sel.set(new Set([e.id])); this.anularOpen.set(true); }
    });
  }
  protected menuEspera(ev: Event, x: EsperaItem): void {
    const items: BoMenuItem[] = x.estado === 'en_espera' ? [{ id: 'ofrecer', label: 'Ofrecer plaza', icon: 'send' }] : [];
    items.push({ id: 'quitar', label: 'Quitar de la lista', icon: 'trash', danger: true });
    this.abrirMenu(ev, items, (id) => void (id === 'ofrecer' ? this.ofrecer(x.id) : this.retirar(x.id)));
  }
  protected async checkin(e: Entrada): Promise<void> {
    try {
      const r = await this.api.escanear(this.cid(), { codigo: e.codigo, puesto: 'Backoffice', confirmar: true, forzar: true });
      if (!r.registrado) return this.toasts.error('No se pudo registrar', r.mensaje);
      this.toasts.success('Check-in registrado', e.codigo + ' · ' + this.pl(r.personas, 'persona'));
      if (this.det()?.id === e.id) void this.ver(e.id);
      await Promise.all([this.cargar(), this.cargarLista()]);
    } catch (err) {
      this.toasts.error('No se pudo registrar', errText(err));
    }
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
    this.sorteo.set('');
    this.detOpen.set(true);
    try {
      const d = await this.api.detalle(this.cid(), id);
      this.det.set(d);
      // «Sorteo» row: raffle tickets bought with the same email (hidden without access to the raffle).
      if (d.email) void this.sorteoApi.compras(this.cid(), { q: d.email }).then((c) => {
        const l = c.items.filter((x) => x.email.toLowerCase() === d.email.toLowerCase());
        if (!l.length || this.det()?.id !== d.id) return;
        const b = l.reduce((t, x) => t + x.cantidad, 0);
        this.sorteo.set(this.pl(b, 'boleto') + ' · ' + euros(l.reduce((t, x) => t + x.importe, 0)) + ' · ' + l[0].estado);
      }, () => undefined);
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
    if (this.guardando()) return;
    this.guardando.set(true);
    try {
      const r = await this.api.bulk(this.cid(), ids, accion, accion === 'anular' ? { motivo: this.anular.motivo, avisar: this.anular.avisar } : accion === 'mover' ? { sesionId: this.mover.sesionId, avisar: this.mover.avisar } : {});
      this.toasts.success({ anular: `${this.pl(r.afectadas, 'anulada')} · ${this.pl(r.personas, 'plaza liberada', 'plazas liberadas')}`, reenviar: this.pl(r.afectadas, 'entrada reenviada', 'entradas reenviadas'), mover: this.pl(r.afectadas, 'reserva movida', 'reservas movidas') }[accion]);
      this.sel.set(new Set());
      this.anularOpen.set(false);
      this.moverOpen.set(false);
      this.anular = { motivo: '', avisar: true, confirma: '' };
      await Promise.all([this.cargar(), this.cargarLista()]);
    } catch (e) {
      this.toasts.error('No se pudo', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected anularOk(): boolean {
    return !!this.anular.motivo.trim() && this.anular.confirma.trim().toUpperCase() === 'ANULAR';
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
  protected async publicar(x: Sesion, publicada = true): Promise<void> {
    if (!this.canEdit()) return this.toasts.error('Sin permiso', 'Necesitas entradas.gestionar para publicar.');
    const body: SesionIn = { nombre: x.nombre, detalle: x.detalle || undefined, inicio: x.inicio, fin: x.fin, puertas: x.puertas, aforo: x.aforo, maxPorReserva: x.maxPorReserva,
      aperturaAt: x.aperturaAt || undefined, cierreAt: x.cierreAt || undefined, publicada, listaEspera: x.listaEspera };
    try {
      this.resumen.set(await this.api.editarSesion(this.cid(), x.id, x.version, body));
      this.toasts.success(publicada ? 'Sesión publicada' : 'Sesión despublicada', publicada ? 'Ya aparece en /entradas.' : 'Ya no aparece en /entradas.');
    } catch (e) {
      this.toasts.error(publicada ? 'No se pudo publicar' : 'No se pudo despublicar', errText(e));
    }
  }
  private sesVacia() {
    return { nombre: '', detalle: '', inicio: '', fin: '', puertas: '', aforo: 600, maxPorReserva: 6, aperturaAt: '', cierreAt: '', publicada: false, listaEspera: true };
  }
  protected abrirSesion(x: Sesion | null): void {
    this.sobreventa.set('');
    this.sesErr.set({});
    this.sesEdit = x
      ? { id: x.id, version: x.version, nombre: x.nombre, detalle: x.detalle, inicio: aLocal(x.inicio), fin: aLocal(x.fin), puertas: aLocal(x.puertas), aforo: x.aforo, maxPorReserva: x.maxPorReserva,
        aperturaAt: aLocal(x.aperturaAt), cierreAt: aLocal(x.cierreAt), publicada: x.publicada, listaEspera: x.listaEspera }
      : this.sesVacia();
    this.sesOpen.set(true);
  }
  protected async guardarSesion(forzar: boolean): Promise<void> {
    const e = this.sesEdit;
    if (!e.nombre || !e.inicio || !e.fin || !e.puertas) return this.toasts.error('Completa nombre, puertas, inicio y fin');
    const err: Record<string, string> = {};
    if (!Number.isInteger(+e.aforo) || +e.aforo < 1 || +e.aforo > 20000) err['aforo'] = 'Entre 1 y 20.000 plazas';
    if (!Number.isInteger(+e.maxPorReserva) || +e.maxPorReserva < 1 || +e.maxPorReserva > 20) err['max'] = 'Entre 1 y 20 personas';
    this.sesErr.set(err);
    if (Object.keys(err).length) return;
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
    this.manErr.set({});
    this.manualOpen.set(true);
  }
  protected readonly maxManual = () => this.resumen()?.sesiones.find((x) => x.id === this.man.sesionId)?.maxPorReserva ?? 20;
  protected async guardarManual(): Promise<void> {
    const m = this.man;
    const [nombre, ...ap] = m.nombre.trim().split(/\s+/);
    const err: Record<string, string> = {};
    if (!nombre) err['nombre'] = 'Escribe el nombre';
    if (!m.sesionId) err['sesion'] = 'Elige una sesión';
    const max = this.maxManual();
    if (!Number.isInteger(+m.personas) || +m.personas < 1 || +m.personas > max) err['personas'] = 'Entre 1 y ' + max;
    if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email.trim())) err['email'] = 'Email no válido';
    this.manErr.set(err);
    if (Object.keys(err).length || this.guardando()) return;
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
  protected ajustarNum(k: 'plazoHoras' | 'aforoPabellon', el: HTMLInputElement, min: number, max: number): void {
    const v = +el.value;
    if (el.value === '' || !Number.isInteger(v) || v < min || v > max) {
      this.ajErr.set({ ...this.ajErr(), [k]: 'Entre ' + this.n(min) + ' y ' + this.n(max) });
      el.value = String(this.espera()?.ajustes[k] ?? '');
      return;
    }
    this.ajErr.set({ ...this.ajErr(), [k]: '' });
    void this.ajustar({ [k]: v });
  }
  protected async ajustar(p: Partial<Ajustes>): Promise<void> {
    const w = this.espera();
    if (!w) return;
    try {
      this.espera.set(await this.api.ajustes(this.cid(), { ...w.ajustes, ...p }));
      this.toasts.success('Ajustes guardados');
      void this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    }
  }
}
