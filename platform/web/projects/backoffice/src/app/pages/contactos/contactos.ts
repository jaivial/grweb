import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { urlSort } from '../../shared/url-sort';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton, GrTelefono, GrToasts, GrSelect, telefonoValido } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { problemOf } from '../../core/api';
import { Competitions } from '../../core/competitions';
import { BO_ROW, BoCheckbox, BoEmptyState, BoPagination, BoSearch, BoSkeleton, BoSortHeader, BoTableToolbar, BoDatePicker } from '../../shared/kit';
import { BoDrawer, BoPageHeader, Confirm, errText, BoTabsMovil, BoTablaMovil } from '../../shared/ui';
import {
  ContactosApi, ESTADO_EMAIL, ESTADO_WA, FINALIDAD, TIPO_SUP, fecha, fechaLarga, iniciales,
  type AvisoEvento, type AvisosEvento, type Condicion, type ContactoItem, type Ficha, type Filtros, type Lista, type Recuento, type Segmento, type Supresion, type Supresiones,
} from './api';

type Tab = 'contactos' | 'segmentos' | 'bajas' | 'grscup-3';

const CAMPOS: { v: Condicion['campo']; label: string }[] = [
  { v: 'origen', label: 'Origen' }, { v: 'relacion', label: 'Relación' }, { v: 'etiqueta', label: 'Etiqueta' }, { v: 'creado', label: 'Alta' }, { v: 'actividad', label: 'Última actividad' },
];
const RELACIONES = [{ v: 'atleta', label: 'Atleta inscrito' }, { v: 'seguidor', label: 'Sigue a un atleta' }, { v: 'voluntario', label: 'Voluntario' }, { v: 'reserva', label: 'Lista de espera' }, { v: 'novedades', label: 'Suscrito a novedades' }];

function descargar(blob: Blob, nombre: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** «Contactos» (Figma page 61): list with KPIs and filters, segments and unsubscribes/suppressions. */
@Component({
  selector: 'bo-contactos',
  imports: [NgTemplateOutlet, BoDatePicker, BoTablaMovil, BoTabsMovil, GrSelect, FormsModule, RouterLink, BoPageHeader, BoPagination, BoTableToolbar, BoSearch, BoSkeleton, BoEmptyState, BoCheckbox, BoSortHeader, BoDrawer, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <ng-template #acciones>
        @if (tab() === 'contactos') {
            @if (canExport()) { <button grButton icon="download" [loading]="exportando()" (click)="exportar()">Exportar (RGPD)</button> }
            <a grButton variant="primary" icon="send" [routerLink]="['/', comps.current()?.slug, 'emails']" [queryParams]="{ tab: 'campanas' }">Nueva campaña</a>
        }
        @if (tab() === 'segmentos' && canSeg()) { <button grButton variant="primary" icon="plus" (click)="nuevoSeg()">Nuevo segmento</button> }
        @if (tab() === 'bajas' && canExport()) { <button grButton icon="plus" (click)="bajaOpen.set(true)">Añadir baja</button> }
        @if (tab() === 'grscup-3' && canExport()) { <button grButton variant="primary" icon="plus" (click)="abrirAviso()">Añadir contacto</button> }
      </ng-template>
      @if (embebido()) {
        <div class="flex flex-wrap items-center gap-3">
          <p class="min-w-0 flex-1 basis-72 text-body-s text-text-tertiary">Personas que han dejado su email o su teléfono (entradas, novedades, alta de atleta, voluntariado) y qué aceptan recibir. Son los destinatarios de las campañas; las bajas nunca reciben nada.</p>
          <div class="flex flex-wrap gap-2"><ng-container *ngTemplateOutlet="acciones" /></div>
        </div>
      } @else {
        <bo-page-header title="Contactos" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Contactos']">
          <ng-container actions><ng-container *ngTemplateOutlet="acciones" /></ng-container>
        </bo-page-header>
      }
      <bo-tabs-movil label="Contactos">
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Contactos">
        @for (t of tabs; track t.v) {
          <a [routerLink]="embebido() ? [] : rutaTab(t.ruta)" [queryParams]="embebido() ? { vista: t.v === 'contactos' ? null : t.v } : {}" queryParamsHandling="merge" (click)="embebido() && irVista(t.v)" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null">
            {{ t.label }}@if (l?.pestanas?.[t.v === 'bajas' ? 'supresiones' : t.v]; as cuenta) { <span class="rounded-2xs px-1.5 text-mono-xs" [class]="t.v === 'contactos' ? 'bg-accent-deep/50 text-accent-text' : 'bg-bg-raised'">{{ cuenta }}</span> }
            @if (tab() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
          </a>
        }
      </nav>
      </bo-tabs-movil>

      @switch (tab()) {
        @case ('contactos') {
          @if (l) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Contactos" [value]="n(l.kpis.contactos)" [delta]="'+' + l.kpis.nuevos7d" caption="esta semana" [trend]="acum(l.kpis.serie)" />
              <gr-kpi label="Email confirmado" [value]="n(l.kpis.email)" [delta]="l.kpis.pctEmail + ' %'" caption="doble opt-in" />
              <gr-kpi label="WhatsApp aceptado" [value]="n(l.kpis.whatsapp)" [delta]="l.kpis.pctWhatsapp + ' %'" caption="opt-in separado" />
              <gr-kpi label="Bajas y rebotes" [value]="n(l.kpis.bajas)" [caption]="l.kpis.pctBajas + ' %'" />
            </div>
          } @else { <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-32 rounded-lg" /> }</div> }

          <bo-table-toolbar noun="contactos" [total]="l?.total ?? 0" [selected]="sel().size" [loading]="l === undefined" [filtered]="filtrado()" (clear)="limpiarSel()" (reset)="filtrar({ q: '', origen: '', canal: '', estado: '', relacion: '' })">
            @if (canExport()) { <button bulk grButton variant="secondary" icon="download" [loading]="exportando()" (click)="exportar([...sel()])">Exportar selección</button> }
            @if (canExport()) { <button actions grButton variant="secondary" [loading]="exportando()" (click)="exportar()">Exportar CSV</button> }
            <bo-search filters class="w-full md:w-[280px]" placeholder="Buscar por email, teléfono o nombre" [shortcut]="false" [value]="f().q ?? ''" (valueChange)="filtrar({ q: $event })" />
            <gr-select filters tipo="filtro" aria-label="Origen" [ngModel]="f().origen ?? ''" (ngModelChange)="filtrar({ origen: $event })"><option value="">+ Origen</option>@for (o of l?.origenes ?? []; track o) { <option [value]="o">{{ o }}</option> }</gr-select>
            <gr-select filters tipo="filtro" aria-label="Canal" [ngModel]="f().canal ?? ''" (ngModelChange)="filtrar({ canal: $event })"><option value="">+ Canal</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></gr-select>
            <gr-select filters tipo="filtro" aria-label="Estado" [ngModel]="f().estado ?? ''" (ngModelChange)="filtrar({ estado: $event })"><option value="">+ Consentimiento</option><option value="confirmado">Confirmado</option><option value="pendiente">Pendiente</option><option value="no">No aceptado</option><option value="revocado">Revocado</option><option value="rebotado">Rebotado / no válido</option></gr-select>
            <gr-select filters tipo="filtro" aria-label="Relación" [ngModel]="f().relacion ?? ''" (ngModelChange)="filtrar({ relacion: $event })"><option value="">+ Relación</option>@for (r of relaciones; track r.v) { <option [value]="r.v">{{ r.label }}</option> }</gr-select>
          </bo-table-toolbar>

          @if (l === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar los contactos"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
          @else if (l) {
            <section class="hidden overflow-hidden rounded-lg border border-line-subtle bg-bg-card lg:block">
              <table class="w-full table-fixed text-left text-body-s">
                <thead class="border-b border-line-subtle text-[11px] font-semibold tracking-[0.04em] text-text-tertiary uppercase"><tr><th class="w-12 px-4 py-3"><bo-checkbox [value]="todos()" (valueChange)="selTodos()" aria="Seleccionar todos los de esta página" /></th><th boSort class="w-[30%] py-3" [sort]="sortDe('nombre')" (toggle)="ordenar('nombre')">Contacto</th><th class="px-3 py-3">Origen</th><th class="px-3 py-3">Email</th><th class="px-3 py-3">WhatsApp</th><th class="w-[22%] px-3 py-3">Relación</th><th boSort class="py-3" [sort]="sortDe('actividad')" (toggle)="ordenar('actividad')">Última actividad</th></tr></thead>
                <tbody>
                  @for (c of l.items; track c.id) {
                    <tr class="cursor-pointer last:border-0 hover:bg-bg-raised" [class]="c.emailEstado === 'rebotado' ? row.error : sel().has(c.id) ? row.selected : row.default" (click)="abrir(c)">
                      <td class="px-4 py-2.5" (click)="$event.stopPropagation()"><bo-checkbox [value]="sel().has(c.id)" (valueChange)="toggleSel(c.id)" [aria]="'Seleccionar ' + (c.nombre || c.email)" /></td>
                      <td class="px-4 py-2.5"><div class="flex items-center gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-deep/40 text-mono-xs">{{ ini(c.nombre || c.email) }}</span>
                        <div class="min-w-0"><p class="truncate text-label-s">{{ c.nombre || c.email }}</p><p class="truncate text-body-xs text-text-tertiary">{{ c.nombre ? c.email : '' }}{{ c.telefono ? (c.nombre ? ' · ' : '') + c.telefono : '' }}</p></div></div></td>
                      <td class="max-w-[10rem] truncate px-3 py-2.5 font-mono text-mono-xs normal-case text-text-secondary" [title]="c.origen">{{ c.origen }}</td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="estEmail[c.emailEstado].tone">{{ estEmail[c.emailEstado].label }}</gr-badge></td>
                      <td class="px-3 py-2.5">@if (c.whatsappEstado) { <gr-badge [tone]="estWA[c.whatsappEstado].tone">{{ estWA[c.whatsappEstado].label }}</gr-badge> } @else { <span class="text-text-muted">—</span> }</td>
                      <td class="truncate px-3 py-2.5 text-text-secondary">{{ c.relacion || '—' }}</td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ fecha(c.ultimaActividad) }}</td>
                    </tr>
                  } @empty { <tr><td colspan="7" class="p-4"><bo-empty-state class="border-0" [kind]="filtrado() ? 'no-results' : 'no-data'" [title]="filtrado() ? 'Nadie coincide con los filtros' : 'Todavía no hay contactos'" [text]="filtrado() ? 'Prueba con otro email o limpia los filtros.' : 'Se crean al reservar entradas o suscribirse a novedades.'" /></td></tr> }
                </tbody>
              </table>
            </section>
            <ul class="flex flex-col gap-2 lg:hidden">
              @for (c of l.items; track c.id) {
                <li><button type="button" class="flex w-full items-start gap-3 rounded-lg border border-line-subtle bg-bg-card p-3 text-left" (click)="abrir(c)">
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-deep/40 text-label-s">{{ ini(c.nombre || c.email) }}</span>
                  <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ c.nombre || c.email }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.email }} · {{ c.origen }}</span>
                    <span class="mt-2 flex flex-wrap gap-1.5"><gr-badge [tone]="estEmail[c.emailEstado].tone">Email · {{ estEmail[c.emailEstado].label }}</gr-badge>@if (c.whatsappEstado) { <gr-badge [tone]="estWA[c.whatsappEstado].tone">WA · {{ estWA[c.whatsappEstado].label }}</gr-badge> }</span></span>
                </button></li>
              }
            </ul>
            <div class="flex items-center justify-between text-body-xs text-text-tertiary">
              <span>Mostrando {{ (l.pagina - 1) * l.por + 1 }}–{{ (l.pagina - 1) * l.por + l.items.length }} de {{ l.total }} · teléfonos enmascarados{{ canExport() ? '' : ' (sin permiso de exportar)' }}</span>
              <bo-pagination [page]="l.pagina" [pages]="pages(l)" (change)="filtrar({ pagina: $event }, false)" />
            </div>
          } @else { <bo-skeleton /> }
        }

        @case ('segmentos') {
          @if (seg(); as e) {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <div class="flex flex-wrap items-start gap-3">
                <gr-field class="min-w-0 flex-1" label="Nombre del segmento" for="sg-n"><input grInput id="sg-n" maxlength="80" [(ngModel)]="e.nombre" /></gr-field>
                <p class="flex gap-1.5 pt-7">@if (recuento(); as r) { <gr-badge tone="info">{{ r.email }} email</gr-badge><gr-badge tone="success">{{ r.whatsapp }} WhatsApp</gr-badge> }</p>
              </div>
              <p class="mt-1 text-body-xs text-text-tertiary">Segmento dinámico: se recalcula al enviar. El consentimiento del canal y las bajas se aplican siempre.</p>
              <p class="mt-4 hidden grid-cols-[1fr_1fr_1.4fr_44px] gap-2 text-label-s text-text-secondary md:grid" aria-hidden="true"><span>Campo</span><span>Operador</span><span>Valor</span></p>
              <ul class="mt-2 flex flex-col gap-3">
                @for (c of e.condiciones; track $index) {
                  <li class="grid grid-cols-[1fr_1fr] gap-2 md:grid-cols-[1fr_1fr_1.4fr_44px]">
                    <gr-select aria-label="Campo" [(ngModel)]="c.campo" (ngModelChange)="c.valor = ''; c.operador = c.campo === 'creado' || c.campo === 'actividad' ? 'desde' : 'es'; contar()">@for (k of campos; track k.v) { <option [value]="k.v">{{ k.label }}</option> }</gr-select>
                    <gr-select aria-label="Operador" [(ngModel)]="c.operador" (ngModelChange)="contar()">
                      @if (c.campo === 'creado' || c.campo === 'actividad') { <option value="desde">desde</option><option value="hasta">hasta</option> } @else { <option value="es">es</option><option value="no_es">no es</option> }
                    </gr-select>
                    @switch (c.campo) {
                      @case ('relacion') { <gr-select aria-label="Valor" [(ngModel)]="c.valor" (ngModelChange)="contar()"><option value="" hidden>Elige…</option>@for (r of relaciones; track r.v) { <option [value]="r.v">{{ r.label }}</option> }</gr-select> }
                      @case ('creado') { <bo-date-picker tipo="date" aria-label="Valor" [(ngModel)]="c.valor" (ngModelChange)="contar()" /> }
                      @case ('actividad') { <bo-date-picker tipo="date" aria-label="Valor" [(ngModel)]="c.valor" (ngModelChange)="contar()" /> }
                      @default { <input grInput aria-label="Valor" [placeholder]="c.campo === 'origen' ? 'ig_story, ig_reel' : 'etiqueta'" [(ngModel)]="c.valor" (ngModelChange)="contar()" /> }
                    }
                    <button type="button" class="flex size-11 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Quitar condición" (click)="e.condiciones.splice($index, 1); contar()"><gr-icon name="trash" [size]="16" /></button>
                  </li>
                }
                <li class="grid grid-cols-[1fr_1fr] gap-2 opacity-70 md:grid-cols-[1fr_1fr_1.4fr_44px]" title="El consentimiento del canal se aplica siempre al enviar">
                  <input grInput aria-label="Campo" value="Consentimiento del canal" disabled /><input grInput aria-label="Operador" value="está" disabled /><input grInput aria-label="Valor" value="Aceptado (siempre)" disabled />
                  <span class="flex size-11 items-center justify-center text-text-tertiary" aria-label="No se puede quitar"><gr-icon name="lock" [size]="16" /></span>
                </li>
              </ul>
              <div class="mt-4 flex flex-wrap gap-2">
                <button grButton size="s" icon="plus" (click)="e.condiciones.push({ campo: 'origen', operador: 'es', valor: '' })">Añadir condición</button>
                <span class="flex-1"></span>
                <button grButton variant="ghost" (click)="seg.set(null)">Cancelar</button>
                <button grButton variant="primary" [loading]="guardando()" (click)="guardarSeg()">Guardar segmento</button>
              </div>
            </section>
          }
          <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
            <table boTablaMovil class="w-full min-w-[560px] text-left text-body-s">
              <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Segmento</th><th class="px-3 py-3 text-right">Email</th><th class="px-3 py-3 text-right">WhatsApp</th><th class="px-3 py-3">Último uso</th><th class="w-36 px-3 py-3"></th></tr></thead>
              <tbody>
                @for (s of segmentos() ?? []; track s.id) {
                  <tr class="border-b border-line-subtle last:border-0">
                    <td class="px-4 py-3"><p class="text-label-s">{{ s.nombre }}</p><p class="text-body-xs text-text-tertiary">{{ resumen(s.condiciones) }}</p></td>
                    <td class="px-3 py-3 text-right font-mono">{{ n(s.recuento.email) }}</td><td class="px-3 py-3 text-right font-mono">{{ n(s.recuento.whatsapp) }}</td>
                    <td class="px-3 py-3 text-text-tertiary">{{ s.ultimoUso || '—' }}</td>
                    <td class="px-3 py-3 text-right">@if (canSeg()) { <span class="flex justify-end gap-1"><button grButton size="s" variant="ghost" (click)="editarSeg(s)">Editar</button><button type="button" class="flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:text-danger" [attr.aria-label]="'Eliminar el segmento ' + s.nombre" (click)="borrarSeg(s)"><gr-icon name="trash" [size]="16" /></button></span> }</td>
                  </tr>
                } @empty { <tr><td colspan="5" class="px-4 py-10 text-center text-text-tertiary">Sin segmentos todavía.</td></tr> }
              </tbody>
            </table>
          </section>
        }

        @case ('bajas') {
          @let sp = sup();
          <div class="flex flex-wrap gap-2">
            @for (t of tiposSup; track t) {
              <button type="button" (click)="tipoSup.set(tipoSup() === t ? '' : t); cargarSup()" [attr.aria-pressed]="tipoSup() === t" class="inline-flex h-10 items-center gap-1.5 rounded-pill border px-3 text-label-s"
                [class]="tipoSup() === t ? 'border-accent-text bg-accent-deep/40' : 'border-line-strong text-text-secondary'"><gr-icon [name]="tipoSup() === t ? 'check' : 'plus'" [size]="14" />{{ tipoS[t].label }} · {{ sp?.tipos?.[t] ?? 0 }}</button>
            }
          </div>
          <gr-alert tone="info" title="Pidieron no recibir más campañas: no se les envía por ningún canal">La baja se registra desde el enlace del email, el botón «Darme de baja» del WhatsApp o a petición (RGPD). Las confirmaciones de entrada y los avisos operativos sí se siguen enviando, salvo a direcciones que rebotan.</gr-alert>
          <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
            <table boTablaMovil class="w-full min-w-[720px] text-left text-body-s">
              <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Contacto</th><th class="px-3 py-3">Canal</th><th class="px-3 py-3">Tipo</th><th class="px-3 py-3">Motivo</th><th class="px-3 py-3">Fecha</th><th class="w-16"></th></tr></thead>
              <tbody>
                @for (x of sp?.items ?? []; track x.id) {
                  <tr class="border-b border-line-subtle last:border-0">
                    <td class="px-4 py-3"><p class="text-label-s">{{ x.nombre || (x.contactoId ? 'Sin nombre' : 'Sin contacto') }}</p><p class="font-mono text-body-xs text-text-tertiary">{{ x.destino }}</p></td>
                    <td class="px-3 py-3"><gr-badge [tone]="x.canal === 'email' ? 'info' : 'success'">{{ x.canal === 'email' ? 'Email' : 'WhatsApp' }}</gr-badge></td>
                    <td class="px-3 py-3"><gr-badge [tone]="tipoS[x.tipo].tone">{{ tipoS[x.tipo].label }}</gr-badge></td>
                    <td class="px-3 py-3 text-text-secondary">{{ x.motivo }}</td>
                    <td class="px-3 py-3 font-mono text-mono-xs text-text-tertiary">{{ fecha(x.at) }}</td>
                    <td class="px-3 py-3 text-right">@if (canExport()) { <button type="button" class="flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" [attr.aria-label]="'Quitar supresión de ' + x.destino" (click)="quitarSup(x)"><gr-icon name="trash" [size]="16" /></button> }</td>
                  </tr>
                } @empty { <tr><td colspan="6" class="px-4 py-10 text-center text-text-tertiary">Sin supresiones.</td></tr> }
              </tbody>
            </table>
          </section>
          <p class="text-body-xs text-text-tertiary">{{ sp?.total ?? 0 }} contactos excluidos de las campañas · los destinos se guardan cifrados (hash) aunque se suprima el contacto.</p>
        }

        @case ('grscup-3') {
          @let av = avisos();
          <div class="flex flex-wrap items-center gap-3">
            <bo-search class="w-full md:w-[320px]" placeholder="Buscar por email o nombre" [shortcut]="false" [value]="qAviso()" (valueChange)="filtrarAviso($event)" />
            <span class="flex-1"></span>
            @if (av) { <p class="text-body-xs text-text-tertiary">{{ av.total }} {{ av.total === 1 ? 'persona avisada' : 'personas avisadas' }}</p> }
          </div>
          <p class="flex items-start gap-2 text-body-xs text-text-tertiary"><gr-icon name="info" [size]="14" class="mt-0.5" /><span>«Avísame» de GRS Cup 3: personas que dejaron su email en la home. Puedes corregir un email, añadir un contacto a mano o quitar uno.</span></p>
          @if (av === null) {
            <gr-empty icon="wifi-off" title="No hemos podido cargar los contactos avisados"><button grButton (click)="reintentarAvisos()">Reintentar</button></gr-empty>
          } @else if (av === undefined) {
            <bo-skeleton />
          } @else {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table boTablaMovil class="w-full min-w-[640px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Nombre</th><th class="px-3 py-3">Email</th><th class="px-3 py-3">Alta</th><th class="w-28 px-3 py-3"></th></tr></thead>
                <tbody>
                  @for (a of av.items; track a.id) {
                    <tr class="border-b border-line-subtle last:border-0">
                      <td class="px-4 py-3 text-label-s">{{ a.nombre || '—' }}</td>
                      <td class="px-3 py-3 font-mono text-mono-xs normal-case text-text-secondary">{{ a.email }}</td>
                      <td class="px-3 py-3 font-mono text-mono-xs text-text-tertiary">{{ fecha(a.creadoAt) }}</td>
                      <td class="px-3 py-3 text-right">
                        @if (canExport()) {
                          <span class="flex justify-end gap-1">
                            <button grButton size="s" variant="ghost" (click)="abrirAviso(a)">Editar</button>
                            <button type="button" class="flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:text-danger" [attr.aria-label]="'Quitar a ' + a.email" (click)="borrarAviso(a)"><gr-icon name="trash" [size]="16" /></button>
                          </span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="p-4"><bo-empty-state class="border-0" [kind]="qAviso() ? 'no-results' : 'no-data'" [title]="qAviso() ? 'Nadie coincide con la búsqueda' : 'Todavía no hay contactos avisados'" [text]="qAviso() ? 'Prueba con otro email o nombre, o limpia la búsqueda.' : 'Se apuntan desde el formulario «Avísame» de la home.'" /></td></tr>
                  }
                </tbody>
              </table>
            </section>
            @if (av.total > av.por) {
              <div class="flex items-center justify-between text-body-xs text-text-tertiary">
                <span>Mostrando {{ (av.pagina - 1) * av.por + 1 }}–{{ (av.pagina - 1) * av.por + av.items.length }} de {{ av.total }}</span>
                <bo-pagination [page]="av.pagina" [pages]="pages(av)" (change)="paginaAviso($event)" />
              </div>
            }
          }
        }
      }
    </div>

    <bo-drawer [(open)]="bajaOpen" title="Añadir baja">
      <div class="flex flex-col gap-4">
        <gr-field label="Canal" for="b-c"><gr-select id="b-c" [(ngModel)]="baja.canal"><option value="email">Email</option><option value="whatsapp">WhatsApp</option></gr-select></gr-field>
        <gr-field [label]="baja.canal === 'email' ? 'Email' : 'Teléfono'" for="b-d"><input grInput id="b-d" [(ngModel)]="baja.destino" [placeholder]="baja.canal === 'email' ? 'nombre@dominio.com' : '+34 600 000 000'" /></gr-field>
        <gr-field label="Motivo" for="b-m"><input grInput id="b-m" maxlength="200" [(ngModel)]="baja.motivo" placeholder="Pedida por teléfono, por email…" /></gr-field>
        <p class="text-body-xs text-text-tertiary">Dejará de recibir campañas por ese canal. Si tenía novedades por email confirmadas, se revocan.</p>
      </div>
      <ng-container drawerActions><button grButton variant="ghost" (click)="bajaOpen.set(false)">Cancelar</button><button grButton variant="primary" [loading]="guardando()" (click)="anadirBaja()">Añadir baja</button></ng-container>
    </bo-drawer>

    <bo-drawer [(open)]="avisoOpen" [title]="aviso.id ? 'Editar contacto avisado' : 'Añadir contacto avisado'">
      <div class="flex flex-col gap-4">
        <gr-field label="Email" for="av-e" [error]="avisoError()"><input grInput id="av-e" type="email" maxlength="254" [(ngModel)]="aviso.email" (ngModelChange)="avisoError.set(null)" [invalid]="!!avisoError()" [attr.aria-describedby]="avisoError() ? 'av-e-error' : null" placeholder="nombre@dominio.com" /></gr-field>
        <gr-field label="Nombre (opcional)" for="av-n"><input grInput id="av-n" maxlength="120" [(ngModel)]="aviso.nombre" /></gr-field>
        <p class="text-body-xs text-text-tertiary">Aviso de próxima competición · GRS Cup 3. Un email solo puede apuntarse una vez.</p>
      </div>
      <ng-container drawerActions><button grButton variant="ghost" (click)="avisoOpen.set(false)">Cancelar</button><button grButton variant="primary" [loading]="guardando()" (click)="guardarAviso()">Guardar</button></ng-container>
    </bo-drawer>
  `,
})
export class ContactosPage {
  private readonly api = inject(ContactosApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly comps = inject(Competitions);
  protected readonly estEmail = ESTADO_EMAIL;
  protected readonly estWA = ESTADO_WA;
  protected readonly tipoS = TIPO_SUP;
  protected readonly tiposSup: Supresion['tipo'][] = ['baja', 'email_invalido', 'whatsapp_invalido', 'rebote'];
  protected readonly campos = CAMPOS;
  protected readonly relaciones = RELACIONES;
  protected readonly fecha = fecha;
  protected readonly ini = iniciales;
  protected readonly tabs: { v: Tab; label: string; ruta: string }[] = [
    { v: 'contactos', label: 'Contactos', ruta: '' }, { v: 'grscup-3', label: 'GRS Cup 3', ruta: 'grscup-3' },
    { v: 'segmentos', label: 'Segmentos', ruta: 'segmentos' }, { v: 'bajas', label: 'Bajas y supresiones', ruta: 'bajas' },
  ];
  protected rutaTab(r: string): string[] {
    return ['/', this.comps.current()?.slug ?? '', 'contactos', ...(r ? [r] : [])];
  }
  /** Inside «Emails y avisos» (?tab=contactos): no page header and the sub-tabs live in ?vista=. */
  readonly embebido = input(false);
  protected readonly tab = signal<Tab>(this.vistaDe(this.route.snapshot.queryParamMap.get('vista') ?? this.route.snapshot.data['tab'] ?? ''));
  private vistaDe(v: string): Tab {
    return (['contactos', 'grscup-3', 'segmentos', 'bajas'].includes(v) ? v : 'contactos') as Tab;
  }
  protected irVista(v: Tab): void {
    this.tab.set(v);
    if (v === 'grscup-3') void this.cargarAvisos();
    if (v === 'segmentos') void this.cargarSeg();
    if (v === 'bajas') void this.cargarSup();
  }
  protected readonly lista = signal<Lista | null | undefined>(undefined);
  private readonly srt = urlSort(['nombre', 'actividad'] as const, 'actividad', 'desc', (c) => (c === 'actividad' ? 'desc' : 'asc'));
  protected readonly f = signal<Filtros>({ pagina: 1, q: this.route.snapshot.queryParamMap.get('q') ?? undefined, orden: this.srt.orden(), dir: this.srt.dir() });
  protected readonly row = BO_ROW;
  protected readonly filtrado = computed(() => { const f = this.f(); return !!(f.q || f.origen || f.canal || f.estado || f.relacion); });
  protected readonly segmentos = signal<Segmento[] | null>(null);
  protected readonly seg = signal<{ id?: string; version?: number; nombre: string; condiciones: Condicion[] } | null>(null);
  protected readonly recuento = signal<Recuento | null>(null);
  protected readonly sup = signal<Supresiones | null>(null);
  protected readonly tipoSup = signal<Supresion['tipo'] | ''>('');
  protected readonly guardando = signal(false);
  protected readonly exportando = signal(false);
  protected readonly bajaOpen = signal(false);
  protected baja = { canal: 'email', destino: '', motivo: '' };
  protected readonly avisos = signal<AvisosEvento | null | undefined>(undefined);
  protected readonly avisoOpen = signal(false);
  protected readonly avisoError = signal<string | null>(null);
  protected readonly qAviso = signal('');
  protected aviso = { id: '', email: '', nombre: '' };
  protected avisoPagina = 1;
  private ta?: ReturnType<typeof setTimeout>;
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly canExport = computed(() => this.auth.can(this.cid(), 'contactos.exportar'));
  protected readonly canSeg = computed(() => this.auth.can(this.cid(), 'campanas.enviar'));
  private t?: ReturnType<typeof setTimeout>;
  private tc?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => {
        void this.cargar();
        if (this.tab() === 'grscup-3') void this.cargarAvisos();
        if (this.tab() === 'segmentos') void this.cargarSeg();
        if (this.tab() === 'bajas') void this.cargarSup();
      });
    });
    // ⌘K «Ver todos» lands here with ?q=; also when already on this page.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const q = p.get('q') ?? '';
      if (q !== (this.f().q ?? '')) this.filtrar({ q });
      // Embedded in «Emails y avisos» the route is reused: ?vista= is the only source of truth, so the main
      // «Contactos» tab (which drops it) brings the view back instead of leaving GRS Cup 3 on screen.
      if (!this.embebido()) return;
      const v = this.vistaDe(p.get('vista') ?? '');
      if (v !== this.tab()) this.irVista(v);
    });
  }

  protected pages(l: { total: number; por: number }): number {
    return Math.max(1, Math.ceil(l.total / l.por));
  }
  protected n(v: number): string {
    return v.toLocaleString('es-ES');
  }
  protected acum(serie: number[]): number[] {
    let t = 0;
    return serie.map((x) => (t += x));
  }
  protected readonly sel = signal(new Set<string>());
  protected readonly todos = computed(() => {
    const ids = (this.lista()?.items ?? []).map((c) => c.id), n = ids.filter((id) => this.sel().has(id)).length;
    return n && n === ids.length ? true : n ? 'mixed' : false;
  });
  protected sortDe(c: string): 'asc' | 'desc' | null { return this.srt.sortDe(c); }
  protected ordenar(c: 'nombre' | 'actividad'): void {
    this.srt.toggle(c);
    this.filtrar({ orden: this.srt.orden(), dir: this.srt.dir() });
  }
  protected limpiarSel(): void { this.sel.set(new Set()); }
  protected toggleSel(id: string): void {
    const s = new Set(this.sel());
    if (!s.delete(id)) s.add(id);
    this.sel.set(s);
  }
  protected selTodos(): void {
    this.sel.set(this.todos() === true ? new Set() : new Set((this.lista()?.items ?? []).map((c) => c.id)));
  }
  protected async cargar(): Promise<void> {
    this.sel.set(new Set());
    try {
      this.lista.set(await this.api.lista(this.cid(), this.f()));
    } catch {
      this.lista.set(null);
    }
  }
  protected filtrar(p: Partial<Filtros>, reset = true): void {
    this.f.set({ ...this.f(), ...p, ...(reset ? { pagina: 1 } : {}) });
    clearTimeout(this.t);
    this.t = setTimeout(() => void this.cargar(), p.q !== undefined ? 250 : 0);
  }
  protected abrir(c: ContactoItem): void {
    void this.router.navigate(['/', this.comps.current()?.slug, 'contactos', c.id]);
  }
  protected async exportar(ids: string[] = []): Promise<void> {
    this.exportando.set(true);
    try {
      descargar(await this.api.exportar(this.cid(), ids.length ? { ids: ids.join(',') } : { ...this.f(), pagina: undefined }), 'contactos.csv');
      this.toasts.success('CSV exportado', 'Queda registrado en la auditoría.');
    } catch (e) {
      this.toasts.error('No se pudo exportar', errText(e));
    } finally {
      this.exportando.set(false);
    }
  }

  // ---- segments ----
  protected async cargarSeg(): Promise<void> {
    try {
      this.segmentos.set(await this.api.segmentos(this.cid()));
    } catch {
      this.segmentos.set([]);
    }
  }
  protected nuevoSeg(): void {
    this.seg.set({ nombre: '', condiciones: [{ campo: 'origen', operador: 'es', valor: '' }] });
    this.contar();
  }
  protected editarSeg(s: Segmento): void {
    this.seg.set({ id: s.id, version: s.version, nombre: s.nombre, condiciones: s.condiciones.map((c) => ({ ...c })) });
    this.recuento.set(s.recuento);
  }
  protected contar(): void {
    clearTimeout(this.tc);
    this.tc = setTimeout(async () => {
      const e = this.seg();
      if (!e) return;
      try {
        this.recuento.set(await this.api.contar(this.cid(), e.condiciones.filter((c) => c.valor)));
      } catch {
        this.recuento.set(null);
      }
    }, 300);
  }
  protected async guardarSeg(): Promise<void> {
    const e = this.seg();
    if (!e) return;
    if (!e.nombre.trim()) return this.toasts.error('Ponle un nombre al segmento');
    this.guardando.set(true);
    try {
      this.segmentos.set(await this.api.guardarSegmento(this.cid(), { ...e, condiciones: e.condiciones.filter((c) => c.valor) }));
      this.seg.set(null);
      this.toasts.success('Segmento guardado');
      void this.cargar();
    } catch (err) {
      this.toasts.error('No se pudo guardar', errText(err));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async borrarSeg(s: Segmento): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Eliminar «${s.nombre}»?`, text: 'Las campañas ya enviadas conservan su copia del segmento; los borradores que lo usen tendrán que elegir otro.', confirm: 'Eliminar', danger: true }))) return;
    try {
      this.segmentos.set(await this.api.borrarSegmento(this.cid(), s.id));
      if (this.seg()?.id === s.id) this.seg.set(null);
      this.toasts.success('Segmento eliminado');
      void this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo eliminar', errText(e));
    }
  }
  protected resumen(cs: Condicion[]): string {
    if (!cs.length) return 'Todos los contactos';
    return cs.map((c) => `${CAMPOS.find((k) => k.v === c.campo)?.label} ${c.operador.replace('_', ' ')} ${RELACIONES.find((r) => r.v === c.valor)?.label ?? c.valor}`).join(' · ');
  }

  // ---- suppressions ----
  protected async cargarSup(): Promise<void> {
    try {
      this.sup.set(await this.api.supresiones(this.cid(), this.tipoSup()));
    } catch {
      this.sup.set(null);
    }
  }
  protected async anadirBaja(): Promise<void> {
    this.guardando.set(true);
    try {
      await this.api.addSupresion(this.cid(), this.baja.canal, this.baja.destino, this.baja.motivo);
      this.bajaOpen.set(false);
      this.baja = { canal: 'email', destino: '', motivo: '' };
      this.toasts.success('Baja añadida');
      await this.cargarSup();
      void this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo añadir', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async quitarSup(x: Supresion): Promise<void> {
    const txt = x.tipo === 'baja' ? 'Podremos volver a escribirle cuando se suscriba de nuevo (la baja no se convierte en alta).' : 'Úsalo si la dirección se ha corregido: volverá a recibir emails.';
    if (!(await this.confirm.ask({ title: 'Quitar la supresión de ' + x.destino, text: txt, confirm: 'Quitar' }))) return;
    try {
      await this.api.delSupresion(this.cid(), x.id);
      await this.cargarSup();
      void this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo quitar', errText(e));
    }
  }

  // ---- GRS Cup 3 («Avísame» contacts) ----
  protected async cargarAvisos(): Promise<void> {
    try {
      const r = await this.api.avisos(this.cid(), { evento: 'grscup-3', q: this.qAviso() || undefined, pagina: this.avisoPagina });
      // Deleting the last row of a page > 1 would leave an empty page: go back to the last one with data.
      if (!r.items.length && this.avisoPagina > 1) {
        this.avisoPagina = Math.max(1, Math.ceil(r.total / r.por));
        return this.cargarAvisos();
      }
      this.avisos.set(r);
    } catch {
      this.avisos.set(null);
    }
  }
  protected reintentarAvisos(): void {
    this.avisos.set(undefined);
    void this.cargarAvisos();
  }
  protected filtrarAviso(q: string): void {
    this.qAviso.set(q);
    this.avisoPagina = 1;
    clearTimeout(this.ta);
    this.ta = setTimeout(() => void this.cargarAvisos(), 250);
  }
  protected paginaAviso(p: number): void {
    this.avisoPagina = p;
    void this.cargarAvisos();
  }
  protected abrirAviso(a?: AvisoEvento): void {
    this.aviso = a ? { id: a.id, email: a.email, nombre: a.nombre } : { id: '', email: '', nombre: '' };
    this.avisoError.set(null);
    this.avisoOpen.set(true);
  }
  protected async guardarAviso(): Promise<void> {
    const a = this.aviso;
    this.avisoError.set(null);
    if (!a.email.trim()) {
      this.avisoError.set('Escribe un email.');
      document.getElementById('av-e')?.focus();
      return;
    }
    this.guardando.set(true);
    try {
      if (a.id) await this.api.editarAviso(this.cid(), a.id, { email: a.email.trim(), nombre: a.nombre.trim() });
      else await this.api.crearAviso(this.cid(), { evento: 'grscup-3', email: a.email.trim(), nombre: a.nombre.trim() });
      this.avisoOpen.set(false);
      this.toasts.success(a.id ? 'Contacto actualizado' : 'Contacto añadido');
      await this.cargarAvisos();
    } catch (e) {
      const p = problemOf(e);
      // Duplicate or malformed email: the panel stays open and the field carries the error itself.
      if (p.code === 'AVISO_DUPLICADO' || p.code === 'EMAIL_INVALIDO') {
        this.avisoError.set(p.detail ?? 'Ese email ya está apuntado a este aviso.');
        document.getElementById('av-e')?.focus();
      } else {
        this.toasts.error(a.id ? 'No se pudo guardar' : 'No se pudo añadir', errText(e));
      }
    } finally {
      this.guardando.set(false);
    }
  }
  protected async borrarAviso(a: AvisoEvento): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Quitar a ${a.nombre || a.email}?`, text: 'Dejará de estar en la lista de avisos de GRS Cup 3 y no le escribiremos cuando abra la competición por este aviso. No afecta a sus novedades ni a sus inscripciones.', confirm: 'Quitar', danger: true }))) return;
    try {
      await this.api.borrarAviso(this.cid(), a.id);
      this.toasts.success('Contacto quitado');
      await this.cargarAvisos();
    } catch (e) {
      this.toasts.error('No se pudo quitar', errText(e));
    }
  }
}

/** Contact record (Figma 61 · «Contactos · ficha»): consents with their proof, activity, GDPR actions. */
@Component({
  selector: 'bo-contacto-ficha',
  imports: [FormsModule, RouterLink, BoPageHeader, BoDrawer, GrAlert, GrBadge, GrButton, GrField, GrIcon, GrInput, GrSkeleton, GrTelefono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = ficha();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      @if (c === undefined) { <gr-skeleton class="h-16 rounded-md" /><gr-skeleton class="h-96 rounded-lg" /> }
      @else if (c === null) { <gr-alert tone="warning" title="Este contacto no existe">Puede que se haya suprimido. <a routerLink=".." class="underline">Volver a contactos</a></gr-alert> }
      @else {
        <bo-page-header [title]="c.nombre || c.email || 'Contacto'" [subtitle]="sub(c)" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Contactos', c.nombre || c.email]" [badge]="c.anonimizado ? 'Suprimido' : ''" badgeTone="neutral">
          @if (canExport() && !c.anonimizado) {
            <ng-container actions>
              <button grButton icon="download" (click)="exportar(c)">Exportar sus datos</button>
              <button grButton (click)="abrirRect(c)">Rectificar</button>
              <button grButton variant="danger" (click)="suprimir(c)">Suprimir</button>
            </ng-container>
          }
        </bo-page-header>
        <div class="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section class="flex flex-col gap-3">
            <div><h2 class="text-ui-h5">Consentimientos</h2><p class="text-body-xs text-text-tertiary">Uno por finalidad · nunca premarcados · versión exacta del texto</p></div>
            @for (k of c.consentimientos; track k.finalidad) {
              <article class="rounded-lg border border-line-subtle bg-bg-card p-4">
                <header class="flex items-center gap-2"><gr-icon name="shield" [size]="16" class="text-text-tertiary" /><h3 class="flex-1 text-label-m">{{ fin[k.finalidad] || k.finalidad }}</h3>
                  <gr-badge [tone]="k.estado === 'confirmado' ? 'success' : k.estado === 'pendiente' ? 'warning' : 'danger'">{{ k.estado === 'confirmado' ? 'Confirmado' : k.estado === 'pendiente' ? 'Pendiente' : 'Revocado' }}</gr-badge></header>
                <dl class="mt-3 grid grid-cols-[120px_minmax(0,1fr)] gap-y-1.5 text-body-xs">
                  <dt class="text-text-tertiary">Texto aceptado</dt><dd class="truncate text-right font-mono uppercase">{{ k.version || '—' }}{{ k.hash ? ' · sha256 ' + k.hash.slice(0, 8) : '' }}</dd>
                  <dt class="text-text-tertiary">Origen</dt><dd class="truncate text-right font-mono">{{ k.origen || '—' }}</dd>
                  <dt class="text-text-tertiary">Fecha</dt><dd class="text-right font-mono">{{ fl(k.aceptadoAt) }}</dd>
                  <dt class="text-text-tertiary">IP</dt><dd class="text-right font-mono">{{ k.ip ? k.ip + ' (anonimizada)' : '—' }}</dd>
                </dl>
                <p class="mt-3 border-t border-line-subtle pt-2 text-body-xs" [class]="k.estado === 'revocado' ? 'text-accent-text' : 'text-text-tertiary'">
                  @if (k.estado === 'revocado') { Retirado {{ k.motivo ? '(' + k.motivo + ')' : '' }} · {{ f(k.revocadoAt) }} }
                  @else if (k.doiAt) { Doble opt-in confirmado {{ f(k.doiAt) }} }
                  @else if (k.estado === 'pendiente') { Esperando la confirmación por email (doble opt-in) }
                  @else { Aceptado {{ f(k.aceptadoAt) }} }
                </p>
              </article>
            } @empty { <p class="rounded-lg border border-line-subtle bg-bg-card p-6 text-body-s text-text-tertiary">Sin consentimientos registrados.</p> }
          </section>
          <aside class="flex flex-col gap-4">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
              <h2 class="text-ui-h5">Actividad</h2>
              <ul class="mt-3 flex flex-col">
                @for (a of c.actividad; track $index) {
                  <li class="flex gap-3 border-b border-line-subtle py-2.5 last:border-0">
                    <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-bg-raised text-text-tertiary"><gr-icon [name]="icono(a.tipo)" [size]="14" /></span>
                    <span class="min-w-0 flex-1"><span class="block text-label-s">{{ a.titulo }}</span><span class="block text-body-xs text-text-tertiary">{{ a.detalle }}</span></span>
                    <span class="font-mono text-mono-xs text-text-muted">{{ f(a.at) }}</span>
                  </li>
                } @empty { <li class="text-body-s text-text-tertiary">Sin actividad.</li> }
              </ul>
            </section>
            @if (c.supresiones.length) {
              <section class="rounded-lg border border-accent/40 bg-accent-deep/15 p-4">
                <h2 class="text-label-m">No se le escribe por</h2>
                <ul class="mt-2 flex flex-col gap-1.5 text-body-s">@for (x of c.supresiones; track x.id) { <li>{{ x.canal === 'email' ? 'Email' : 'WhatsApp' }} · {{ tipoS[x.tipo].label }} · <span class="text-text-tertiary">{{ x.motivo }}</span></li> }</ul>
              </section>
            }
            <section class="rounded-lg border border-info/40 bg-info/10 p-4 text-body-s">
              <p class="text-label-s text-info">WhatsApp de marketing: opt-in expreso y separado</p>
              <p class="mt-1 text-text-secondary">Solo con la casilla «Avisos por WhatsApp» marcada por la persona; la baja por WhatsApp («Darme de baja») revoca solo ese canal. Revisión de asesoría pendiente.</p>
            </section>
          </aside>
        </div>
      }
    </div>

    <bo-drawer [(open)]="rectOpen" title="Rectificar datos">
      <div class="flex flex-col gap-4">
        <gr-field label="Nombre" for="r-n"><input grInput id="r-n" maxlength="120" [(ngModel)]="rect.nombre" /></gr-field>
        <gr-field label="Email" for="r-e"><input grInput id="r-e" type="email" [(ngModel)]="rect.email" /></gr-field>
        <gr-field label="Teléfono" for="r-t" [error]="rect.telefono && !valido(rect.telefono) ? 'El número no está completo.' : null"><gr-telefono id="r-t" tam="m" [aria-label]="'Teléfono'" [invalido]="!!rect.telefono && !valido(rect.telefono)" [(ngModel)]="rect.telefono" /></gr-field>
        <gr-field label="Etiquetas (separadas por comas)" for="r-g"><input grInput id="r-g" [(ngModel)]="rect.etiquetas" /></gr-field>
        <p class="text-body-xs text-text-tertiary">Queda registrado en su actividad y en la auditoría (derecho de rectificación).</p>
      </div>
      <ng-container drawerActions><button grButton variant="ghost" (click)="rectOpen.set(false)">Cancelar</button><button grButton variant="primary" [loading]="guardando()" (click)="guardarRect()">Guardar</button></ng-container>
    </bo-drawer>
  `,
})
export class ContactoFichaPage {
  private readonly api = inject(ContactosApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly comps = inject(Competitions);
  protected readonly fin = FINALIDAD;
  protected readonly tipoS = TIPO_SUP;
  protected readonly f = fecha;
  protected readonly fl = fechaLarga;
  protected readonly ficha = signal<Ficha | null | undefined>(undefined);
  protected readonly valido = telefonoValido;
  protected readonly rectOpen = signal(false);
  protected readonly guardando = signal(false);
  protected rect = { nombre: '', email: '', telefono: '', etiquetas: '' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly canExport = computed(() => this.auth.can(this.cid(), 'contactos.exportar'));

  constructor() {
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
  }
  private async cargar(): Promise<void> {
    try {
      this.ficha.set(await this.api.ficha(this.cid(), this.route.snapshot.paramMap.get('id') ?? ''));
    } catch {
      this.ficha.set(null);
    }
  }
  protected sub(c: Ficha): string {
    return [c.email, c.telefono, 'alta ' + fecha(c.createdAt) + ' desde ' + c.origen].filter(Boolean).join(' · ');
  }
  protected icono(t: string): 'mail' | 'ticket' | 'user' | 'star' | 'shield' | 'users' | 'info' {
    return ({ email: 'mail', inscripcion: 'ticket', seguimiento: 'star', rgpd: 'shield', voluntario: 'users', novedades: 'mail', supresion: 'shield', alta: 'user' } as const)[t as 'email'] ?? 'info';
  }
  protected async exportar(c: Ficha): Promise<void> {
    try {
      descargar(await this.api.acceso(this.cid(), c.id), `contacto-${c.id.slice(0, 8)}.json`);
      this.toasts.success('Datos exportados', 'Entrégaselos por un canal seguro. Queda registrado.');
    } catch (e) {
      this.toasts.error('No se pudo exportar', errText(e));
    }
  }
  protected abrirRect(c: Ficha): void {
    this.rect = { nombre: c.nombre, email: c.email, telefono: c.telefono, etiquetas: c.etiquetas.join(', ') };
    this.rectOpen.set(true);
  }
  protected async guardarRect(): Promise<void> {
    const c = this.ficha();
    if (!c) return;
    if (this.rect.telefono && !telefonoValido(this.rect.telefono)) {
      this.toasts.error('El teléfono no está completo', 'Elige el país y escribe el número entero.');
      return;
    }
    this.guardando.set(true);
    try {
      this.ficha.set(await this.api.rectificar(this.cid(), c, { ...this.rect, etiquetas: this.rect.etiquetas.split(',').map((x) => x.trim()).filter(Boolean) }));
      this.rectOpen.set(false);
      this.toasts.success('Datos rectificados');
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async suprimir(c: Ficha): Promise<void> {
    if (!(await this.confirm.ask({ title: `Suprimir a ${c.nombre || c.email || 'este contacto'}`, text: 'Se borran sus datos, consentimientos y actividad, también sus avisos de atletas y su solicitud de voluntariado, y sus canales quedan bloqueados (solo guardamos un hash para no volver a escribirle). No se puede deshacer.', confirm: 'Suprimir', danger: true }))) return;
    try {
      const r = await this.api.suprimir(this.cid(), c.id);
      const extra = [r.seguimientos ? `${r.seguimientos} aviso(s) de atletas borrados` : '', r.voluntarios ? `${r.voluntarios} solicitud(es) de voluntariado borradas` : '', r.atleta ? 'Es atleta inscrito: su ficha se gestiona en Atletas' : ''].filter(Boolean).join(' · ');
      this.toasts.success('Contacto suprimido', extra || undefined);
      void this.router.navigate(['..'], { relativeTo: this.route });
    } catch (e) {
      this.toasts.error('No se pudo suprimir', errText(e));
    }
  }
}
