import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GrBadge, GrButton, GrEmpty, GrIcon, GrKpi, GrPopover, GrSkeleton, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoDrawer, BoPageHeader, BoToggle, errText } from '../../shared/ui';
import { ESTADO_MSG, EmailsApi, hace, hora, type AutoItem, type Autos, type Mensaje, type PlantillaItem, type Resumen, type Salida, type WAPlantilla } from './api';
import { WhatsAppMeta } from './whatsapp-meta';

type Tab = 'plantillas' | 'whatsapp' | 'salida' | 'automatizaciones';
const FILTROS: { v: string; label: string }[] = [
  { v: '', label: 'Todos' }, { v: 'en_cola', label: 'En cola' }, { v: 'problemas', label: 'Con problemas' }, { v: 'enviado', label: 'Enviados' }, { v: 'omitido', label: 'Omitidos' }, { v: 'cancelado', label: 'Cancelados' },
];
const CANALES: { v: string; label: string }[] = [{ v: '', label: 'Todos los canales' }, { v: 'email', label: 'Email' }, { v: 'whatsapp', label: 'WhatsApp' }];

/** «Emails y avisos» (Figma page 62): templates, WhatsApp templates, outbox with retries and the SMTP state, automations. */
@Component({
  selector: 'bo-emails',
  imports: [FormsModule, RouterLink, BoPageHeader, BoDrawer, BoToggle, GrBadge, GrButton, GrEmpty, GrIcon, GrKpi, GrPopover, GrSkeleton, WhatsAppMeta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = resumen();
    @let caido = !!r && r.smtp.conocido && !r.smtp.ok;
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Emails y avisos" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Emails y avisos']">
        @if (tab() === 'whatsapp' && waOk()) {
          <ng-container actions>
            <button grButton class="max-md:hidden" [loading]="sincronizando()" (click)="sincronizar()">Sincronizar con Meta</button>
            <button grButton variant="primary" icon="plus" (click)="waMeta()?.nueva()">Nueva plantilla</button>
          </ng-container>
        }
      </bo-page-header>
      <nav class="-mt-1 flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Emails y avisos">
        @for (t of tabs; track t.v) {
          <a [routerLink]="ruta(t.v)" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-m whitespace-nowrap focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null">
            {{ t.label }}
            @if (cuenta(t.v); as c) { <span class="flex h-5 items-center rounded-xs px-1.5 text-mono-xs" [class]="tab() === t.v ? 'bg-accent/20 text-accent-text' : 'bg-bg-raised text-text-tertiary'">{{ c }}</span> }
            @if (tab() === t.v) { <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span> }
          </a>
        }
      </nav>

      @if (caido) {
        <section class="flex items-start gap-3 rounded-lg border border-accent/50 bg-accent-deep/25 p-4" role="alert">
          <gr-icon name="circle-x" [size]="20" class="mt-0.5 shrink-0 text-accent-text" />
          <div class="min-w-0 flex-1 text-body-m">
            <p class="text-label-m text-accent-text">El SMTP rechaza los envíos{{ r!.smtp.desde ? ' desde las ' + soloHora(r!.smtp.desde) : '' }}</p>
            <p class="text-text-secondary">{{ r!.smtp.error || 'Sin respuesta del servidor' }} · {{ r!.enCola }} emails en cola · los reintentos están en pausa para no bloquear la cuenta.</p>
            <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <a [routerLink]="['/', comps.current()?.slug, 'sistema']" [queryParams]="{ tab: 'integraciones' }" class="inline-flex min-h-9 items-center gap-1 text-label-m text-accent-text hover:underline">Configurar email <gr-icon name="arrow-right" [size]="14" /></a>
              <button type="button" class="inline-flex min-h-9 items-center gap-1 text-label-m text-text-secondary hover:text-text-primary disabled:opacity-60" [disabled]="probando()" (click)="probar()"><gr-icon [name]="probando() ? 'loader' : 'refresh'" [size]="14" [class.animate-spin]="probando()" />Probar conexión</button>
            </p>
          </div>
        </section>
      }

      @switch (tab()) {
        @case ('plantillas') {
          @if (r) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              <gr-kpi label="Enviados (7 días)" [value]="n(r.enviados7d)" [delta]="delta(r)" caption="vs. semana pasada" [trend]="r.serie" />
              <gr-kpi label="Entregados" [value]="r.enviados7d ? entregados(r) + ' %' : null" caption="objetivo > 98 %" [trend]="r.serie" />
              <gr-kpi label="Rebotes" [value]="n(r.rebotes7d)" [caption]="r.enviados7d ? pct(r.rebotes7d, r.enviados7d) + ' %' : '7 días'" [trend]="r.serieRebotes" />
              <gr-kpi label="En cola" [value]="n(r.enCola)" [caption]="'SMTP ' + r.ritmo + ' / min'" />
            </div>
          } @else { <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-36 rounded-lg" /> }</div> }
          @let ps = plantillas();
          @if (ps === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar las plantillas"><button grButton (click)="cargarTodo()">Reintentar</button></gr-empty> }
          @else if (ps) {
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              @for (p of ps; track p.clave) {
                <li><a [routerLink]="['/', comps.current()?.slug, 'emails', 'plantillas', p.clave]" class="flex h-full flex-col rounded-lg border bg-bg-card p-4 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [class]="p.estado === 'error' ? 'border-accent/70' : 'border-line-subtle'">
                  <span class="block h-[120px] overflow-hidden rounded-md border border-line-subtle bg-bg-deep p-3" aria-hidden="true">
                    <span class="block h-3 w-16 rounded-2xs bg-accent-deep"></span><span class="mt-3 block h-2 w-full rounded-2xs bg-bg-raised"></span><span class="mt-2 block h-2 w-2/3 rounded-2xs bg-bg-raised"></span>
                    <span class="mt-3 block size-10 rounded-xs bg-line-strong/70"></span>
                  </span>
                  <span class="mt-3 flex items-start gap-2"><span class="min-w-0 flex-1 text-label-m">{{ p.nombre }}</span>
                    <gr-badge [tone]="p.estado === 'activa' ? 'success' : p.estado === 'error' ? 'danger' : 'warning'">{{ p.estado === 'activa' ? 'Activa' : p.estado === 'error' ? 'Error' : 'Pausada' }}</gr-badge></span>
                  <span class="mt-2 text-body-s text-text-tertiary">{{ p.disparador }}</span>
                  <span class="mt-auto pt-3 text-body-s" [class]="p.estado === 'error' ? 'text-accent-text' : 'text-text-secondary'">{{ p.estado === 'error' ? p.error : p.estado === 'pausada' ? 'Pausada' + (p.enviados ? ' · enviados ' + n(p.enviados) : '') : 'Enviados ' + n(p.enviados) + ' · fallos ' + p.fallos }}{{ p.personalizada && p.estado !== 'error' ? ' · personalizada' : '' }}</span>
                </a></li>
              } @empty { <li class="col-span-full"><gr-empty icon="mail" title="Sin plantillas" /></li> }
            </ul>
          } @else { <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-64 rounded-lg" /> }</div> }
        }

        @case ('whatsapp') { <bo-whatsapp-meta [items]="wa()" (cambio)="wa.set($event)" (recargar)="cargarWA()" /> }

        @case ('salida') {
          @if (r && !caido) {
            <div class="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
              <gr-icon name="circle-check" [size]="20" class="mt-0.5 shrink-0 text-success" />
              <div class="text-body-m"><p class="text-label-m text-success">{{ !r.smtp.conocido ? 'SMTP sin usar todavía' : 'SMTP operativo' }} · {{ r.smtp.servidor }}{{ r.smtp.propio ? '' : ' (el del sistema)' }}</p>
                <p class="text-text-secondary">{{ r.smtp.ultimoEnvio ? 'Último envío ' + hace(r.smtp.ultimoEnvio) : 'Sin envíos todavía' }} · cola {{ r.enCola }} · ritmo {{ r.ritmo }}/min</p></div>
            </div>
          }
          @if (r && caido) {
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
              <gr-kpi label="En cola" [value]="n(r.enCola)" caption="acumulándose" />
              <gr-kpi label="Reintentos en pausa" [value]="n(r.reintentando)" caption="hasta corregir" />
              <gr-kpi label="Enviados hoy" [value]="n(r.enviadosHoy)" caption="antes del fallo" />
            </div>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
              <p class="flex items-center gap-2 text-label-m"><gr-icon name="pause" [size]="16" class="text-text-tertiary" /><span class="flex-1">Cola de envío en pausa</span><span class="font-mono text-mono-s text-text-secondary">{{ r.enCola }} pendientes</span></p>
              <div class="mt-3 h-2 overflow-hidden rounded-pill bg-bg-raised" role="progressbar" [attr.aria-valuenow]="progreso(r)" aria-valuemin="0" aria-valuemax="100" aria-label="Enviados hoy sobre el total del día"><div class="h-full rounded-pill bg-text-tertiary" [style.width.%]="progreso(r)"></div></div>
              <p class="mt-2 text-body-xs text-text-tertiary">Se reanudará al validar la conexión SMTP</p>
            </section>
          }
          <div class="flex flex-wrap items-center gap-2">
            @for (fx of filtros; track fx.v) {
              <button type="button" (click)="filtrar(fx.v)" [attr.aria-pressed]="estado() === fx.v" class="inline-flex h-9 items-center rounded-pill border px-3 text-label-s"
                [class]="estado() === fx.v ? 'border-accent-text bg-accent-deep/40' : 'border-line-strong text-text-secondary hover:text-text-primary'">{{ fx.label }}</button>
            }
            <select class="h-9 rounded-md border border-line-strong bg-bg-field px-2 text-body-s" aria-label="Canal" [ngModel]="canal()" (ngModelChange)="canal.set($event); pagina.set(1); cargarSalida()">
              @for (c of canales; track c.v) { <option [value]="c.v">{{ c.label }}</option> }
            </select>
            <input class="h-9 w-full rounded-md border border-line-strong bg-bg-field px-3 text-body-s sm:ml-auto sm:w-56" placeholder="Buscar destinatario" [ngModel]="q()" (ngModelChange)="q.set($event); buscar()" aria-label="Buscar destinatario" />
          </div>
          @if (sel().size) {
            <div class="flex flex-wrap items-center gap-2 rounded-md border border-line-strong bg-bg-raised px-3 py-2 text-body-s">
              <span class="flex-1">{{ sel().size }} seleccionados</span>
              <button grButton size="s" icon="refresh" (click)="bulk('reintentar')">Reintentar</button><button grButton size="s" variant="ghost" (click)="bulk('cancelar')">Cancelar envío</button>
            </div>
          }
          @let s = salida();
          @if (s === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar la bandeja"><button grButton (click)="cargarSalida()">Reintentar</button></gr-empty> }
          @else if (s) {
            <section class="rounded-lg border border-line-subtle bg-bg-card">
              <div class="overflow-x-auto">
              <table class="w-full min-w-[900px] text-left text-body-m">
                <thead class="border-b border-line-subtle text-label-xs text-text-tertiary uppercase"><tr>
                  <th class="w-12 px-4 py-3"><input type="checkbox" class="size-4 align-middle accent-[#c42b3e]" [checked]="todos(s)" (change)="toggleTodos(s)" aria-label="Seleccionar todos" /></th>
                  <th class="px-2 py-3 font-medium">Destinatario</th><th class="px-3 py-3 font-medium">Canal</th><th class="px-3 py-3 font-medium">Plantilla</th><th class="px-3 py-3 font-medium">Estado</th><th class="px-3 py-3 text-right font-medium">Intentos</th><th class="px-3 py-3 font-medium">Detalle</th><th class="w-12"></th></tr></thead>
                <tbody>
                  @for (m of s.items; track m.id) {
                    <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" [class.bg-accent-deep/15]="m.estado === 'rebotado' || m.estado === 'fallido'" (click)="ver(m)">
                      <td class="px-4 py-3" (click)="$event.stopPropagation()"><input type="checkbox" class="size-4 align-middle accent-[#c42b3e]" [checked]="sel().has(m.id)" (change)="toggle(m.id)" [attr.aria-label]="'Seleccionar ' + m.destino" /></td>
                      <td class="max-w-[220px] px-2 py-3"><p class="truncate">{{ m.destino }}</p>@if (m.prueba) { <p class="text-mono-xs text-text-muted">PRUEBA</p> }</td>
                      <td class="px-3 py-3"><gr-badge [tone]="m.canal === 'whatsapp' ? 'success' : 'info'">{{ m.canal === 'whatsapp' ? 'WhatsApp' : 'Email' }}</gr-badge></td>
                      <td class="px-3 py-3">{{ m.nombre || m.plantilla }}</td>
                      <td class="px-3 py-3"><gr-badge [tone]="est[m.estado].tone">{{ est[m.estado].label }}</gr-badge></td>
                      <td class="px-3 py-3 text-right font-mono text-mono-s">{{ m.intentos }}{{ m.estado === 'reintentando' ? ' / 5' : '' }}</td>
                      <td class="max-w-[260px] px-3 py-3 text-text-secondary"><p class="line-clamp-2">{{ m.enviadoAt ? hora(m.enviadoAt) + ' · ' : '' }}{{ m.detalle }}{{ m.proximoAt && m.estado === 'reintentando' ? ' · próximo ' + hora(m.proximoAt) : '' }}</p></td>
                      <td class="relative px-2 py-3" (click)="$event.stopPropagation()">
                        <button type="button" class="flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary" [attr.aria-label]="'Acciones de ' + m.destino" [attr.aria-expanded]="menu() === m.id" (click)="menu.set(menu() === m.id ? null : m.id)"><gr-icon name="more" [size]="16" /></button>
                        @if (menu() === m.id) {
                          <gr-popover [etiqueta]="'Acciones de ' + m.destino" (cerrar)="menu.set(null)">
                            <div class="flex flex-col md:w-auto">
                              <button type="button" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-body-m hover:bg-bg-card" (click)="menu.set(null); ver(m)"><gr-icon name="eye" [size]="16" />Ver mensaje</button>
                              @if (reintentable(m)) { <button type="button" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-body-m hover:bg-bg-card" (click)="menu.set(null); bulk('reintentar', [m.id])"><gr-icon name="refresh" [size]="16" />Reintentar ahora</button> }
                              @if (m.estado === 'en_cola' || m.estado === 'reintentando') { <button type="button" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-body-m text-accent-text hover:bg-bg-card" (click)="menu.set(null); bulk('cancelar', [m.id])"><gr-icon name="x" [size]="16" />Cancelar envío</button> }
                            </div>
                          </gr-popover>
                        }
                      </td>
                    </tr>
                  } @empty { <tr><td colspan="8" class="px-4 py-12 text-center text-text-tertiary">Nada en la bandeja con este filtro.</td></tr> }
                </tbody>
              </table>
              </div>
              <footer class="flex flex-col gap-3 border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary md:flex-row md:items-center md:justify-between">
                <span>{{ s.estados.en_cola ?? 0 }} en cola · {{ s.estados.reintentando ?? 0 }} reintentando · {{ s.estados.rebotado ?? 0 }} rebotados · {{ s.estados.fallido ?? 0 }} fallidos</span>
                @if (paginas(s).length > 1) {
                  <span class="flex items-center gap-1">
                    <button type="button" class="flex size-8 items-center justify-center rounded-sm border border-line-subtle disabled:opacity-40" [disabled]="s.pagina <= 1" (click)="ir(s.pagina - 1)" aria-label="Página anterior"><gr-icon name="chevron-left" [size]="14" /></button>
                    @for (pg of paginas(s); track $index) {
                      @if (pg === 0) { <span class="px-1">…</span> }
                      @else { <button type="button" class="flex h-8 min-w-8 items-center justify-center rounded-sm border px-2 font-mono text-mono-xs" [class]="pg === s.pagina ? 'border-accent bg-accent text-text-on-accent' : 'border-line-subtle text-text-secondary hover:text-text-primary'" [attr.aria-current]="pg === s.pagina ? 'page' : null" (click)="ir(pg)">{{ pg }}</button> }
                    }
                    <button type="button" class="flex size-8 items-center justify-center rounded-sm border border-line-subtle disabled:opacity-40" [disabled]="s.pagina * s.por >= s.total" (click)="ir(s.pagina + 1)" aria-label="Página siguiente"><gr-icon name="chevron-right" [size]="14" /></button>
                  </span>
                }
              </footer>
            </section>
          } @else { <gr-skeleton class="h-80 rounded-lg" /> }
        }

        @case ('automatizaciones') {
          @let a = autos();
          @if (a === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar las automatizaciones"><button grButton (click)="cargarTodo()">Reintentar</button></gr-empty> }
          @else if (a) {
            <section class="flex items-center gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
              <div class="min-w-0 flex-1"><h2 class="text-ui-h4">Global</h2><p class="mt-3 text-label-m">Pausar automatizaciones no esenciales durante el evento</p>
                <p class="mt-1 text-body-xs text-text-tertiary">{{ fechasEvento() }} · siguen: confirmaciones, enlace mágico y cambios de horario</p></div>
              <bo-toggle [value]="a.pausarEnEvento" label="Pausar no esenciales durante el evento" (changed)="ajustes($event, a.ritmo)" />
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card">
              <div class="overflow-x-auto">
              <table class="w-full min-w-[960px] text-left text-body-m">
                <thead class="border-b border-line-subtle text-label-xs text-text-tertiary uppercase"><tr><th class="px-4 py-3 font-medium">Automatización</th><th class="px-3 py-3 font-medium">Canales</th><th class="px-3 py-3 font-medium">Cuándo</th><th class="px-3 py-3 font-medium">Público</th><th class="px-3 py-3 font-medium">Próxima</th><th class="px-3 py-3 font-medium">Estado</th><th class="w-12"></th></tr></thead>
                <tbody>
                  @for (x of a.items; track x.clave) {
                    <tr class="border-b border-line-subtle last:border-0" [class.bg-accent-deep/15]="x.estado === 'error'">
                      <td class="px-4 py-3">{{ x.nombre }}</td>
                      <td class="px-3 py-3"><span class="flex gap-1.5">@for (c of x.canales; track c) { <gr-badge [tone]="c === 'email' ? 'info' : 'success'">{{ c === 'email' ? 'Email' : 'WA' }}</gr-badge> }</span></td>
                      <td class="px-3 py-3 font-mono text-mono-s text-text-secondary">{{ x.cuando }}</td>
                      <td class="px-3 py-3">{{ x.publico }}</td>
                      <td class="px-3 py-3 font-mono text-mono-s text-text-secondary">{{ proxima(x) }}</td>
                      <td class="px-3 py-3"><gr-badge [tone]="x.estado === 'activa' ? 'success' : x.estado === 'error' ? 'danger' : 'neutral'">{{ x.estado === 'activa' ? 'Activa' : x.estado === 'error' ? 'Error' : 'Desactivada' }}</gr-badge></td>
                      <td class="relative px-2 py-3">
                        <button type="button" class="flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary" [attr.aria-label]="'Acciones de ' + x.nombre" [attr.aria-expanded]="menu() === x.clave" (click)="menu.set(menu() === x.clave ? null : x.clave)"><gr-icon name="more" [size]="16" /></button>
                        @if (menu() === x.clave) {
                          <gr-popover [etiqueta]="'Acciones de ' + x.nombre" (cerrar)="menu.set(null)">
                            <div class="flex flex-col">
                              @if (x.esencial) { <p class="flex items-start gap-2 px-3 py-2 text-body-s text-text-tertiary"><gr-icon name="lock" [size]="16" class="mt-0.5 shrink-0" />Operativa: siempre activa (accesos, pagos, horarios).</p> }
                              @else { <button type="button" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-body-m hover:bg-bg-card" (click)="menu.set(null); auto(x.clave, !x.activa)"><gr-icon [name]="x.activa ? 'pause' : 'play'" [size]="16" />{{ x.activa ? 'Desactivar' : 'Activar' }}</button> }
                              @for (pl of x.plantillas; track pl) { <a [routerLink]="['/', comps.current()?.slug, 'emails', 'plantillas', pl]" class="flex h-11 items-center gap-2 rounded-sm px-3 text-body-m hover:bg-bg-card"><gr-icon name="pencil" [size]="16" /><span class="truncate">Editar {{ nombrePlantilla(pl) }}</span></a> }
                            </div>
                          </gr-popover>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              </div>
            </section>
          } @else { <gr-skeleton class="h-80 rounded-lg" /> }
        }
      }
    </div>

    <bo-drawer [(open)]="verOpen" [title]="msg()?.asunto || msg()?.nombre || 'Mensaje'" [badge]="msg() ? est[msg()!.estado].label : ''">
      @if (msg(); as m) {
        <dl class="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-body-s">
          <dt class="text-text-tertiary">Para</dt><dd class="truncate">{{ m.destino }}</dd>
          <dt class="text-text-tertiary">Canal</dt><dd>{{ m.canal === 'whatsapp' ? 'WhatsApp' : 'Email' }}</dd>
          <dt class="text-text-tertiary">Plantilla</dt><dd>{{ m.nombre }}</dd>
          <dt class="text-text-tertiary">Creado</dt><dd>{{ hora(m.createdAt) }}</dd>
          <dt class="text-text-tertiary">Intentos</dt><dd>{{ m.intentos }} · {{ m.detalle }}</dd>
          @if (m.proveedorId) { <dt class="text-text-tertiary">Message-ID</dt><dd class="truncate font-mono text-mono-xs">{{ m.proveedorId }}</dd> }
        </dl>
        <p class="mt-4 text-body-xs text-text-tertiary">Los enlaces personales (acceso, pago, baja) no se muestran: son de la persona.</p>
        @if (msgHtml(); as h) { <iframe title="Contenido del email" sandbox="" class="mt-2 h-[560px] w-full rounded-md border border-line-subtle bg-white" [srcdoc]="h"></iframe> }
      }
      <ng-container drawerActions>
        @if (msg() && reintentable(msg()!)) { <button grButton icon="refresh" (click)="bulk('reintentar', [msg()!.id])">Reintentar</button> }
        <button grButton variant="ghost" (click)="verOpen.set(false)">Cerrar</button>
      </ng-container>
    </bo-drawer>
  `,
})
export class EmailsPage {
  private readonly api = inject(EmailsApi);
  private readonly toasts = inject(GrToasts);
  private readonly route = inject(ActivatedRoute);
  private readonly san = inject(DomSanitizer);
  protected readonly comps = inject(Competitions);
  protected readonly est = ESTADO_MSG;
  protected readonly filtros = FILTROS;
  protected readonly canales = CANALES;
  protected readonly hora = hora;
  protected readonly hace = hace;
  protected readonly tabs: { v: Tab; label: string }[] = [
    { v: 'plantillas', label: 'Plantillas' }, { v: 'whatsapp', label: 'WhatsApp (Meta)' }, { v: 'salida', label: 'Bandeja de salida' }, { v: 'automatizaciones', label: 'Automatizaciones' },
  ];
  protected readonly tab = signal<Tab>((this.route.snapshot.data['tab'] as Tab) ?? 'plantillas');
  protected readonly resumen = signal<Resumen | null>(null);
  protected readonly plantillas = signal<PlantillaItem[] | null | undefined>(undefined);
  protected readonly wa = signal<WAPlantilla[] | null | undefined>(undefined);
  protected readonly waOk = computed(() => Array.isArray(this.wa()));
  protected readonly salida = signal<Salida | null | undefined>(undefined);
  protected readonly autos = signal<Autos | null | undefined>(undefined);
  protected readonly estado = signal('');
  protected readonly canal = signal('');
  protected readonly q = signal('');
  protected readonly pagina = signal(1);
  protected readonly sel = signal(new Set<string>());
  protected readonly menu = signal<string | null>(null);
  protected readonly verOpen = signal(false);
  protected readonly msg = signal<Mensaje | null>(null);
  protected readonly msgHtml = signal<SafeHtml | null>(null);
  protected readonly probando = signal(false);
  protected readonly sincronizando = signal(false);
  protected readonly waMeta = viewChild(WhatsAppMeta);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  private readonly fechas = computed(() => this.comps.current() as { fechaInicio?: string; fechaFin?: string } | null);
  protected readonly fechasEvento = computed(() => {
    const c = this.fechas();
    if (!c?.fechaInicio) return 'Días de competición';
    const f = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...o, timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z')).replace('.', '');
    const fin = c.fechaFin && c.fechaFin !== c.fechaInicio ? c.fechaFin : '';
    return fin ? `${f(c.fechaInicio, { day: 'numeric' })}–${f(fin, { day: 'numeric', month: 'short' })}` : f(c.fechaInicio, { day: 'numeric', month: 'short' });
  });
  private t?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => this.cargarTodo());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo === 'mensaje.estado' || e.tipo === 'smtp.estado') {
        clearTimeout(this.t);
        this.t = setTimeout(() => {
          void this.cargarResumen();
          if (this.tab() === 'salida') void this.cargarSalida();
        }, 800);
      }
      if (e.tipo === 'messaging.plantilla_guardada') void this.api.plantillas(this.cid()).then((p) => this.plantillas.set(p), () => undefined);
      if (e.tipo === 'messaging.automatizacion') void this.api.autos(this.cid()).then((a) => this.autos.set(a), () => undefined);
      if (e.tipo === 'whatsapp.plantilla_estado') void this.cargarWA();
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }
  protected ruta(t: Tab): string[] {
    return ['/', this.comps.current()?.slug ?? '', 'emails', ...(t === 'plantillas' ? [] : [t])];
  }
  protected cuenta(t: Tab): number | null {
    switch (t) {
      case 'plantillas': return this.plantillas()?.length ?? null;
      case 'whatsapp': return this.wa()?.length ?? null;
      case 'salida': return this.resumen()?.enCola || null;
      case 'automatizaciones': return this.autos()?.items.length ?? null;
    }
  }
  protected cargarTodo(): void {
    void this.cargarResumen();
    void this.api.plantillas(this.cid()).then((p) => this.plantillas.set(p), () => this.plantillas.set(null));
    void this.api.autos(this.cid()).then((a) => this.autos.set(a), () => this.autos.set(null));
    void this.cargarWA();
    if (this.tab() === 'salida') void this.cargarSalida();
  }
  protected async cargarWA(): Promise<void> {
    try {
      this.wa.set(await this.api.wa(this.cid()));
    } catch {
      this.wa.set(null);
    }
  }
  private async cargarResumen(): Promise<void> {
    try {
      this.resumen.set(await this.api.resumen(this.cid()));
    } catch {
      /* the header stays as it was */
    }
  }
  protected async cargarSalida(): Promise<void> {
    try {
      this.salida.set(await this.api.salida(this.cid(), this.estado(), this.q(), this.pagina(), this.canal()));
    } catch {
      this.salida.set(null);
    }
  }
  protected filtrar(v: string): void {
    this.estado.set(v);
    this.pagina.set(1);
    this.sel.set(new Set());
    void this.cargarSalida();
  }
  protected ir(p: number): void {
    this.pagina.set(p);
    void this.cargarSalida();
  }
  protected buscar(): void {
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      this.pagina.set(1);
      void this.cargarSalida();
    }, 300);
  }
  protected paginas(s: Salida): number[] {
    const total = Math.max(1, Math.ceil(s.total / s.por));
    const set = new Set([1, total, s.pagina - 1, s.pagina, s.pagina + 1].filter((p) => p >= 1 && p <= total));
    const ps = [...set].sort((a, b) => a - b);
    return ps.flatMap((p, i) => (i && p - ps[i - 1] > 1 ? [0, p] : [p]));
  }
  protected n(v: number): string {
    return v.toLocaleString('es-ES');
  }
  protected pct(a: number, b: number): string {
    return (Math.round((a / b) * 1000) / 10).toLocaleString('es-ES');
  }
  protected entregados(r: Resumen): string {
    return r.entregados.toLocaleString('es-ES');
  }
  protected soloHora(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  }
  protected progreso(r: Resumen): number {
    const t = r.enviadosHoy + r.enCola;
    return t ? Math.round((r.enviadosHoy / t) * 100) : 0;
  }
  protected delta(r: Resumen): string | null {
    const d = r.enviados7d - r.enviadosPrev;
    return d === 0 ? null : (d > 0 ? '+' : '') + d;
  }
  protected reintentable(m: Mensaje): boolean {
    return ['fallido', 'rebotado', 'omitido', 'cancelado', 'reintentando'].includes(m.estado);
  }
  protected nombrePlantilla(clave: string): string {
    return this.plantillas()?.find((p) => p.clave === clave)?.nombre ?? clave;
  }
  /** Next run: the reminders go out at T−7 10:00 and T−1 18:00 before the first day; the rest fire with their event. */
  protected proxima(x: AutoItem): string {
    if (!x.activa) return '—';
    const ini = this.fechas()?.fechaInicio;
    if (x.clave === 'recordatorios' && ini) {
      const d0 = new Date(ini + 'T00:00:00');
      const cands = [[7, 10], [1, 18]].map(([d, h]) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - d, h)).filter((d) => d.getTime() > Date.now());
      if (cands.length) return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(cands[0]).replace(',', '');
      return 'enviados';
    }
    if (x.clave === 'novedades') return 'cada hora';
    return 'al ocurrir';
  }
  protected todos(s: Salida): boolean {
    return s.items.length > 0 && s.items.every((m) => this.sel().has(m.id));
  }
  protected toggleTodos(s: Salida): void {
    this.sel.set(this.todos(s) ? new Set() : new Set(s.items.map((m) => m.id)));
  }
  protected toggle(id: string): void {
    const s = new Set(this.sel());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.sel.set(s);
  }
  protected async bulk(accion: 'reintentar' | 'cancelar', ids = [...this.sel()]): Promise<void> {
    try {
      const r = await this.api.bulk(this.cid(), ids, accion);
      if (r.afectados) this.toasts.success(accion === 'reintentar' ? `${r.afectados} en cola de nuevo` : `${r.afectados} cancelados`);
      else this.toasts.info('Nada que cambiar', accion === 'reintentar' ? 'Esos mensajes ya se enviaron o están en cola.' : 'Solo se cancelan los que esperan en la cola.');
      this.sel.set(new Set());
      this.verOpen.set(false);
      await Promise.all([this.cargarSalida(), this.cargarResumen()]);
    } catch (e) {
      this.toasts.error('No se pudo', errText(e));
    }
  }
  protected async ver(m: Mensaje): Promise<void> {
    this.msg.set(m);
    this.msgHtml.set(null);
    this.verOpen.set(true);
    try {
      const d = await this.api.mensaje(this.cid(), m.id);
      this.msg.set(d);
      this.msgHtml.set(d.html ? this.san.bypassSecurityTrustHtml(d.html) : null);
    } catch {
      /* details stay */
    }
  }
  protected async probar(): Promise<void> {
    this.probando.set(true);
    try {
      const r = await this.api.probarSMTP(this.cid());
      if (r.estado === 'ok') {
        this.toasts.success('Conexión SMTP correcta', 'La cola se reanuda en el próximo minuto.');
        const s = this.salida();
        const pend = s?.items.filter((m) => m.estado === 'reintentando').map((m) => m.id) ?? [];
        if (pend.length) await this.api.bulk(this.cid(), pend, 'reintentar');
      } else this.toasts.error('El SMTP sigue fallando', r.error || 'Revisa las credenciales en Sistema → Integraciones.');
    } catch (e) {
      this.toasts.error('No se pudo probar', errText(e));
    } finally {
      this.probando.set(false);
      void this.cargarResumen();
    }
  }
  protected async sincronizar(): Promise<void> {
    this.sincronizando.set(true);
    try {
      this.wa.set(await this.api.waSincronizar(this.cid()));
      this.toasts.success('Plantillas sincronizadas');
    } catch (e) {
      this.toasts.error('No se pudo sincronizar', errText(e));
    } finally {
      this.sincronizando.set(false);
    }
  }
  protected async auto(clave: string, activa: boolean): Promise<void> {
    try {
      this.autos.set(await this.api.auto(this.cid(), clave, activa));
      this.toasts.success(activa ? 'Automatización activada' : 'Automatización desactivada');
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
      this.autos.set(await this.api.autos(this.cid()));
    }
  }
  protected async ajustes(pausar: boolean, ritmo: number): Promise<void> {
    try {
      this.autos.set(await this.api.ajustes(this.cid(), pausar, ritmo));
      this.toasts.success(pausar ? 'Se pausarán las no esenciales durante el evento' : 'Las automatizaciones siguen durante el evento');
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
    }
  }
}
