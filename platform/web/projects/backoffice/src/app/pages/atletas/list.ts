import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { urlSort } from '../../shared/url-sort';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GrAlert, GrAvatar, GrBadge, GrButton, GrIconButton, GrEmpty, GrIcon, GrKpi, GrSkeleton, GrToasts, fmtNumber, fmtShortDate, type GrTone, GrSelect } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BO_ROW, BoCheckbox, BoEmptyState, BoSheet, BoPagination, BoSearch, BoSkeleton, BoSortHeader, BoTableToolbar, BoToggleRow } from '../../shared/kit';
import { BoPageHeader, BoToggle, errText, BoTabsMovil, BoTabs, type BoTab } from '../../shared/ui';
import { SolicitudesContador } from '../../core/solicitudes';
import { AtletasApi, HANDLING, cat, diaFecha, type ItemLista, type Lista } from './api';
import { AccionNecesariaDialogo } from './accion-necesaria';
import { PerfilExisteDialogo } from './perfil-existe';
import { tabEnUrl } from '../../shared/tab-url';
import { estadoCorto } from './padron-model';

type Pestana = 'todos' | 'confirmados' | 'reserva' | 'bajas' | 'incidencias' | 'handling';

export const ESTADO: Record<ItemLista['estado'], { label: string; tone: GrTone }> = {
  confirmado: { label: 'Confirmado', tone: 'success' },
  reserva: { label: 'Reserva', tone: 'info' },
  baja: { label: 'Baja', tone: 'neutral' },
};
const IMAGEN: Record<ItemLista['imagen'], { label: string; cls: string }> = {
  si: { label: 'Sí', cls: 'text-text-secondary' },
  pendiente: { label: 'Pendiente', cls: 'text-warning' },
  menor: { label: 'Menor', cls: 'text-info' },
  no: { label: 'No', cls: 'text-text-muted' },
};

/** «Atletas» (Figma page 55 · «Atletas · lista», «casos límite», «vacío y carga»). */
@Component({
  selector: 'bo-atletas',
  imports: [AccionNecesariaDialogo, PerfilExisteDialogo, BoTabs, BoTabsMovil, GrSelect, FormsModule, RouterLink, A11yModule, BoPageHeader, BoPagination, BoTableToolbar, BoSearch, BoSheet, BoToggleRow, BoSkeleton, BoEmptyState, BoCheckbox, BoSortHeader, BoToggle, GrAlert, GrAvatar, GrBadge, GrButton, GrIconButton, GrEmpty, GrIcon, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6">
      <bo-page-header title="Atletas" [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Atletas']">
        @if (canEdit()) { <bo-tabs pageTabs label="Atletas" [alwaysTabs]="true" [tabs]="secciones()" /> }
      </bo-page-header>

      @if (sobreaforo(); as s) {
        <gr-alert tone="warning" [title]="'Cupo superado: ' + s.confirmados + ' confirmados para ' + s.plazas + ' plazas'">Sobran {{ s.confirmados - s.plazas }}. Revisa el cupo de la AEP en Inscripción o da de baja a quien no tenga plaza.</gr-alert>
      }

      @if (error(); as e) {
        <gr-alert tone="danger" title="No se pudieron cargar los atletas">
          {{ e }} La tabla está vacía a propósito: los datos que se veían eran de otro alcance.
          <span alertAction class="mt-3 flex"><button grButton [loading]="cargando()" (click)="recargar(pagina())">Reintentar</button></span>
        </gr-alert>
      } @else if (l && l.pestanas.todos === 0 && !cargando()) {
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="flex flex-col items-center justify-center rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
            <span class="flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="sparkles" [size]="22" /></span>
            <h2 class="mt-4 text-ui-h4">Aún no hay atletas</h2>
            <p class="mt-2 max-w-sm text-body-s text-text-tertiary">La AEP envía el acta en .xlsx cuando cierra la inscripción. Impórtala y revisa los cambios antes de confirmar.</p>
            @if (canEdit()) {
              <div class="mt-5 flex flex-wrap justify-center gap-2">
                <a grButton variant="primary" routerLink="importar">Importar acta AEP</a>
                <button grButton variant="ghost" (click)="plantilla()">Formato del acta</button>
              </div>
            }
          </div>
          <div class="hidden flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5 lg:flex" aria-hidden="true">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) { <gr-skeleton class="h-8 opacity-40" /> }
          </div>
        </div>
      } @else {
        <bo-tabs-movil label="Estado">
        <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Estado">
          @for (t of tabs; track t.key) {
            <button type="button" (click)="cambiarPestana(t.key)" [attr.aria-current]="pestana() === t.key ? 'page' : null"
              class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s whitespace-nowrap" [class]="pestana() === t.key ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
              {{ t.label }}
              <span class="rounded-2xs px-1.5 text-mono-xs" [class]="t.key === 'incidencias' && (l?.pestanas?.incidencias ?? 0) > 0 ? 'bg-accent-deep/50 text-accent-text' : 'bg-bg-raised text-text-secondary'">{{ l?.pestanas?.[t.key] ?? '·' }}</span>
              @if (pestana() === t.key) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
          <span class="ml-auto flex shrink-0 items-center gap-1">
            @if (canEdit()) { <a grButton variant="ghost" size="s" icon="ticket" routerLink="inscripcion">Inscripción</a> }
            @if (canWeigh()) { <a grButton variant="ghost" size="s" icon="scale" routerLink="pesaje">Pesaje</a> }
          </span>
        </nav>
        </bo-tabs-movil>

        @if (pestana() === 'incidencias') {
          <div class="flex flex-col gap-3">
            @for (a of incidencias(); track a.id) {
              <gr-alert [tone]="a.tono" [title]="a.titulo">
                {{ a.texto }}
                <a alertAction [routerLink]="a.id" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text">{{ a.accion }} <gr-icon name="arrow-right" [size]="14" /></a>
              </gr-alert>
            } @empty {
              @if (!cargando()) { <gr-empty icon="circle-check" title="Sin incidencias" text="Menores, categorías y pesajes están en orden." /> }
            }
          </div>
        }

        @if (pestana() !== 'incidencias' || reservas().length) {
          @if (pestana() !== 'incidencias') {
            <bo-table-toolbar noun="atletas" [total]="l?.total ?? 0" [selected]="sel().size" [loading]="cargando()" [filtered]="filtrado()" (reset)="limpiar()" (clear)="limpiarSel()">
              @if (canEdit()) { <button bulk grButton variant="secondary" icon="download" [loading]="exporting()" (click)="exportar([...sel()])">Exportar selección</button> }
              @if (canEdit()) { <button bulk grButton variant="secondary" icon="send" (click)="accionIds.set([...sel()])">Pedir una acción</button> }
              @if (canEdit()) { <button bulk grButton variant="secondary" icon="mail" (click)="perfil.set({ ids: [...sel()], todos: false })">Enviar acceso al perfil</button> }
              <button filters grButton icon="filter" [attr.aria-expanded]="filtros()" aria-haspopup="dialog" (click)="filtros.set(true)">
                Filtros @if (nFiltros()) { <span class="rounded-2xs bg-accent-deep/50 px-1.5 text-mono-xs text-accent-text">{{ nFiltros() }}</span> }
              </button>
              @if (canEdit()) { <button filters grIconButton icon="more" label="Más acciones" aria-haspopup="dialog" [attr.aria-expanded]="acciones()" (click)="acciones.set(true)"></button> }
            </bo-table-toolbar>
            <bo-sheet title="Filtrar atletas" [(open)]="filtros" [filtered]="filtrado()" (reset)="limpiar()"
              [resultLabel]="cargando() ? 'Buscando…' : 'Ver ' + fmtNumber(l?.total ?? 0) + ' atletas'">
              <bo-search class="w-full" placeholder="Buscar atleta, club o licencia…" [shortcut]="false" [value]="q()" (valueChange)="buscar($event)" [loading]="cargando() && !!q()" />
              <gr-select tipo="campo" [ngModel]="sexo()" (ngModelChange)="sexo.set($event); recargar(1)" aria-label="Sexo">
                <option value="">Sexo: todos</option><option value="F">Femenino</option><option value="M">Masculino</option>
              </gr-select>
              <gr-select tipo="campo" [ngModel]="categoria()" (ngModelChange)="categoria.set($event); recargar(1)" aria-label="Categoría">
                <option value="">Categoría: todas</option>
                @for (c of l?.categorias ?? []; track c) { <option [value]="c">{{ cat(c) }}</option> }
              </gr-select>
              @if (l?.jornadas?.length) {
                <gr-select tipo="campo" [ngModel]="jornada()" (ngModelChange)="jornada.set($event); recargar(1)" aria-label="Fecha">
                  <option value="">Fecha: todas</option>
                  @for (f of l!.jornadas; track f) { <option [value]="f">{{ diaFecha(f) }}</option> }
                </gr-select>
              }
              <bo-toggle-row label="Perfil incompleto" description="Solo atletas con el perfil público sin completar" [value]="incompletos()" (changed)="incompletos.set($event); recargar(1)" />
              <gr-select tipo="campo" [ngModel]="padronFiltro()" (ngModelChange)="padronFiltro.set($event); recargar(1)" aria-label="Coincidencia con el padrón AEP">
                <option value="">Padrón AEP: cualquiera</option>
                <option value="parcial">Parcial · revisar</option>
                <option value="sin">Sin coincidencia</option>
                <option value="error">Error de la IA</option>
              </gr-select>
              <gr-select tipo="campo" [ngModel]="handling()" (ngModelChange)="handling.set($event); recargar(1)" aria-label="Handling">
                <option value="">Handling: cualquiera</option>
                <option value="solicitado">Handling solicitado (pendiente)</option>
                <option value="aprobado">Handling aprobado</option>
                <option value="rechazado">Handling rechazado</option>
              </gr-select>
            </bo-sheet>
          } @else {
            <div class="mt-2 flex items-center gap-3">
              <h2 class="min-w-0 flex-1 text-ui-h5">Reserva AEP <span class="text-body-xs text-text-tertiary">· al dar de baja a un confirmado, promociona al primero</span></h2>
              @if (canEdit()) { <button grIconButton icon="more" label="Más acciones" aria-haspopup="dialog" [attr.aria-expanded]="acciones()" (click)="acciones.set(true)"></button> }
            </div>
          }

          <section class="rounded-lg border border-line-subtle bg-bg-card" [attr.aria-busy]="cargando()">
            <div class="hidden md:block">
              <table class="w-full table-fixed text-left">
                <thead class="border-b border-line-subtle text-[11px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">
                  <tr>
                    @if (pestana() !== 'incidencias') { <th class="w-12 px-4 py-3"><bo-checkbox [value]="todos()" (valueChange)="selTodos()" aria="Seleccionar todos los de esta página" /></th> }
                    @if (pestana() === 'incidencias') { <th class="w-16 px-4 py-3 font-normal">Orden</th> }
                    @if (pestana() === 'incidencias') { <th class="px-4 py-3 font-normal">Atleta</th> } @else { <th boSort class="px-4 py-3" [sort]="sortDe('nombre')" (toggle)="ordenar('nombre')">Atleta</th> }
                    @if (pestana() === 'incidencias') { <th class="w-24 px-3 py-3 font-normal">Categoría</th> } @else { <th boSort class="w-28 py-3" [sort]="sortDe('categoria')" (toggle)="ordenar('categoria')">Categoría</th> }
                    <th class="w-28 px-3 py-3 font-normal">Competición</th>
                    <th class="w-20 px-3 py-3 font-normal">Fecha</th>
                    <th class="w-32 px-3 py-3 font-normal">Estado AEP</th>
                    @if (pestana() === 'incidencias') { <th class="w-40 px-3 py-3 font-normal">Perfil público</th> } @else { <th boSort class="w-40 py-3" [sort]="sortDe('completo')" (toggle)="ordenar('completo')">Perfil público</th> }
                    <th class="w-24 px-3 py-3 font-normal">Imagen</th>
                    <th class="w-24 px-3 py-3 font-normal">Padrón</th>
                    <th class="w-24 px-3 py-3 font-normal">Handling</th>
                    <th class="w-24 px-3 py-3 text-right font-normal">Seguidores</th>
                    <th [class]="pestana() === 'incidencias' ? 'w-36' : 'w-12'"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of filas(); track a.id) {
                    <tr class="cursor-pointer last:border-0 hover:bg-bg-raised" [class]="a.estado === 'baja' ? row.disabled : sel().has(a.id) ? row.selected : row.default" (click)="abrir(a.id)">
                      @if (pestana() !== 'incidencias') { <td class="px-4 py-3" (click)="$event.stopPropagation()"><bo-checkbox [value]="sel().has(a.id)" (valueChange)="toggleSel(a.id)" [aria]="'Seleccionar ' + a.nombreCompleto" /></td> }
                      @if (pestana() === 'incidencias') { <td class="px-4 py-3 text-mono-s">{{ a.ordenReserva }}</td> }
                      <td class="px-4 py-3">
                        <a [routerLink]="a.id" class="flex min-w-0 items-center gap-3" (click)="$event.stopPropagation()">
                          @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombreCompleto" class="size-9 shrink-0 rounded-full object-cover" loading="lazy" /> } @else { <gr-avatar [name]="a.nombreCompleto" /> }
                          <span class="min-w-0"><span class="block truncate text-label-s">{{ a.nombreCompleto }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }} · {{ a.divisionNombre }}</span></span>
                        </a>
                      </td>
                      <td class="px-3 py-3 text-mono-s">{{ a.sexo }} @if (a.categoria) { {{ cat(a.categoria) }} } @else { <span class="text-text-tertiary">Sin elegir</span> }</td>
                      <td class="px-3 py-3 text-mono-s">@if (a.prueba) { {{ prueba[a.prueba] }} } @else { <span class="text-text-tertiary">Sin elegir</span> }</td>
                      <td class="px-3 py-3 text-mono-s">{{ a.jornada ? diaFecha(a.jornada) : '–' }}</td>
                      <td class="px-3 py-3">
                        @if (sinCategoria(a) && a.estado !== 'baja') { <gr-badge tone="warning">Sin categoría</gr-badge> }
                        @else if (a.incidencias && a.estado !== 'baja') { <gr-badge tone="warning">{{ a.estado === 'reserva' ? 'Reserva' : 'Revisar' }}</gr-badge> }
                        @else { <gr-badge [tone]="estado[a.estado].tone">{{ estado[a.estado].label }}</gr-badge> }
                      </td>
                      <td class="px-3 py-3"><span class="flex items-center gap-2"><span class="h-1.5 flex-1 rounded-pill bg-bg-raised"><span class="block h-full rounded-pill" [class]="a.completo >= 70 ? 'bg-success' : 'bg-warning'" [style.width.%]="a.completo"></span></span><span class="w-10 text-right text-mono-xs text-text-secondary">{{ a.completo }} %</span></span></td>
                      <td class="px-3 py-3 text-body-s" [class]="imagen[a.imagen].cls">{{ imagen[a.imagen].label }}</td>
                      <td class="px-3 py-3">
                        @if (padron(a).tone === 'neutral') { <span class="text-text-muted" title="Sin coincidencia con el padrón AEP">–</span> }
                        @else { <gr-badge [tone]="padron(a).tone" [title]="'Padrón AEP: ' + padron(a).l">{{ padron(a).l }}</gr-badge> }
                      </td>
                      <td class="px-3 py-3">
                        @if (a.handling; as h) { <gr-badge [tone]="HANDLING[h.estado].tone" [title]="'Handling ' + HANDLING[h.estado].l"><span class="sr-only">Handling </span>SÍ</gr-badge> }
                        @else { <span class="text-text-muted">–</span> }
                      </td>
                      <td class="px-3 py-3 text-right text-mono-s">{{ a.seguidores || '–' }}</td>
                      <td class="px-2 py-3">
                        @if (pestana() === 'incidencias' && a.estado === 'reserva' && canEdit()) {
                          <button grButton size="s" (click)="$event.stopPropagation(); promocionar(a)">Promocionar</button>
                        } @else { <gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /> }
                      </td>
                    </tr>
                  } @empty {
                    @if (cargando()) { <tr><td colspan="13"><bo-skeleton class="[&>div]:rounded-none [&>div]:border-0" /></td></tr> }
                    @else { <tr><td colspan="13" class="p-4"><bo-empty-state class="border-0" [kind]="filtrado() ? 'no-results' : 'no-data'" [title]="filtrado() ? 'Ningún atleta coincide con estos filtros' : 'Todavía no hay atletas'" [text]="filtrado() ? 'Prueba con otro nombre o limpia los filtros.' : 'Importa el acta de la AEP para empezar.'" /></td></tr> }
                  }
                </tbody>
              </table>
            </div>
            <ul class="flex flex-col md:hidden">
              @for (a of filas(); track a.id) {
                <li class="border-b border-line-subtle last:border-0" [class.opacity-55]="a.estado === 'baja'">
                  <a [routerLink]="a.id" class="flex min-h-16 items-center gap-3 px-4 py-3">
                    @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombreCompleto" class="size-10 shrink-0 rounded-full object-cover" loading="lazy" /> } @else { <gr-avatar [name]="a.nombreCompleto" /> }
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-label-s">{{ a.nombreCompleto }}</span>
                      <span class="block truncate text-body-xs text-text-tertiary">{{ a.sexo }} {{ cat(a.categoria) }} · {{ a.club || 'Independiente' }}{{ a.jornada ? ' · ' + diaFecha(a.jornada) : '' }}</span>
                    </span>
                    <span class="flex shrink-0 flex-col items-end gap-1">
                      @if (a.handling; as h) { <gr-badge [tone]="HANDLING[h.estado].tone" [title]="'Handling ' + HANDLING[h.estado].l">Handling</gr-badge> }
                      @if (a.padron.estado === 'parcial' || a.padron.origen === 'error_ia') { <gr-badge [tone]="padron(a).tone" title="Padrón AEP">Padrón: {{ padron(a).l }}</gr-badge> }
                      @if (a.incidencias && a.estado !== 'baja') { <gr-badge tone="warning">Revisar</gr-badge> } @else { <gr-badge [tone]="estado[a.estado].tone">{{ estado[a.estado].label }}</gr-badge> }
                    </span>
                  </a>
                  @if (pestana() === 'incidencias' && a.estado === 'reserva' && canEdit()) {
                    <div class="px-4 pb-3"><button grButton size="s" [block]="true" (click)="promocionar(a)">Promocionar (reserva {{ a.ordenReserva }})</button></div>
                  }
                </li>
              } @empty {
                @if (cargando()) { @for (i of [1, 2, 3]; track i) { <li class="p-4"><gr-skeleton class="h-10" /></li> } }
                @else { <li class="p-8 text-center text-body-s text-text-tertiary">No hay atletas con estos filtros.</li> }
              }
            </ul>
            @if (paginas() > 1 && pestana() !== 'incidencias') {
              <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">
                <span>Mostrando {{ desde() }}–{{ hasta() }} de {{ l?.total }}</span>
                <bo-pagination [page]="pagina()" [pages]="paginas()" (change)="recargar($event)" />
              </footer>
            }
          </section>
        }

        @if (l && pestana() !== 'incidencias') {
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <gr-kpi label="Perfiles completos" [value]="fmtNumber(l.kpis.perfilesCompletos)" [delta]="l.kpis.pctCompletos + ' %'" caption="del total" />
            <gr-kpi label="Sin foto" [value]="fmtNumber(l.kpis.sinFoto)" caption="bloquean la ficha pública" />
            <gr-kpi label="Consentimiento imagen" [value]="fmtNumber(l.kpis.conImagen)" [caption]="l.kpis.imagenPendiente + ' pendientes · ' + l.kpis.menoresPendientes + ' menores'" />
            <gr-kpi label="Seguimientos" [value]="fmtNumber(l.kpis.seguimientos)" [caption]="'+' + l.kpis.seguimientosSemana + ' esta semana'" />
          </div>
        }
      }
    </div>

    <bo-sheet title="Acciones" [(open)]="acciones">
      @if (lista()?.pestanas?.todos) { <button grButton icon="download" [block]="true" [loading]="exporting()" (click)="exportar()">Exportar atletas</button> }
      <a grButton variant="primary" icon="upload" [block]="true" routerLink="importar">Importar acta AEP</a>
      @if (canEdit()) { <button grButton icon="mail" [block]="true" (click)="acciones.set(false); perfil.set({ ids: [], todos: true })">Enviar acceso al perfil a todos</button> }
    </bo-sheet>
    @if (perfil(); as p) {
      <bo-perfil-existe [ids]="p.ids" [todos]="p.todos" (cerrar)="perfil.set(null)" (enviado)="perfil.set(null); limpiarSel()" />
    }
    @if (accionIds(); as ids) {
      <bo-accion-necesaria [ids]="ids" (cerrar)="accionIds.set(null)" (enviado)="accionIds.set(null); limpiarSel()" />
    }
    @if (promo(); as p) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="promo.set(null)" (keydown.escape)="promo.set(null)">
        <div class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" [attr.aria-label]="'Promocionar a ' + p.nombreCompleto"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">Promocionar a {{ p.nombreCompleto }}</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="promo.set(null)"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">Pasará de Reserva a Confirmado y, si lo eliges, recibirá un email «Tienes plaza» con el enlace a su área. La AEP debe confirmarlo en su acta.</p>
          <div class="mt-4 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-2">
            <span><span class="block text-label-s">Avisar al atleta</span><span class="block text-body-xs text-text-tertiary">Email «Tienes plaza» + enlace a su área</span></span>
            <bo-toggle [(value)]="avisar" label="Avisar al atleta" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="promo.set(null)">Cancelar</button>
            <button grButton variant="primary" [loading]="promoBusy()" (click)="confirmarPromo(p)">{{ avisar() ? 'Promocionar y avisar' : 'Promocionar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AtletasPage {
  protected readonly comps = inject(Competitions);
  private readonly solicitudes = inject(SolicitudesContador);
  /** BIZ-183: section tabs so the «Solicitudes» page is reachable from the UI. */
  protected readonly secciones = computed<BoTab[]>(() => [
    { label: 'Atletas', path: '.', exact: true },
    { label: 'Solicitudes', path: 'solicitudes', count: this.solicitudes.pendientes() || null },
  ]);
  private readonly api = inject(AtletasApi);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(GrToasts);
  protected readonly estado = ESTADO;
  protected readonly imagen = IMAGEN;
  protected readonly cat = cat;
  protected readonly prueba: Record<string, string> = { aep2: 'AEP-2', aep3: 'AEP-3' };
  protected readonly fmtNumber = fmtNumber;
  protected sinCategoria(a: ItemLista): boolean { return a.avisos?.some((i) => i.tipo === 'categoria_invalida') ?? false; }
  protected readonly tabs: { key: Pestana; label: string }[] = [
    { key: 'todos', label: 'Todos' }, { key: 'confirmados', label: 'Confirmados' }, { key: 'reserva', label: 'Reserva' }, { key: 'bajas', label: 'Bajas' },
    { key: 'handling', label: 'Handling' }, { key: 'incidencias', label: 'Con incidencias' },
  ];
  protected readonly lista = signal<Lista | null>(null);
  protected readonly reservas = signal<ItemLista[]>([]);
  protected readonly incidenciasDe = signal<{ id: string; tono: GrTone; titulo: string; texto: string; accion: string }[]>([]);
  protected readonly cargando = signal(true);
  /** The last load failed: the table is cleared and a persistent «Reintentar» stays on screen. */
  protected readonly error = signal('');
  protected readonly exporting = signal(false);
  protected readonly pestana = signal<Pestana>(((p) => (this.tabs.some((t) => t.key === p) ? p : 'todos') as Pestana)(this.route.snapshot.queryParamMap.get('tab')));
  private readonly tabUrl = tabEnUrl(this.pestana, () => this.tabs.map((t) => t.key));
  protected readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  protected readonly sexo = signal('');
  protected readonly categoria = signal('');
  protected readonly jornada = signal('');
  protected readonly diaFecha = diaFecha;
  protected readonly incompletos = signal(false);
  /** «Handling» filter: solicitado · aprobado · rechazado · cualquiera (empty). */
  protected readonly handling = signal('');
  /** «Coincidencia AEP»: parcial (revisar) · sin · error de la IA · cualquiera (empty). */
  protected readonly padronFiltro = signal('');
  protected readonly padron = (a: ItemLista) => estadoCorto(a.padron ?? { estado: 'sin' });
  protected readonly HANDLING = HANDLING;
  protected readonly row = BO_ROW;
  protected readonly filtrado = computed(() => this.nFiltros() > 0);
  /** BIZ-194: filters live in a side/bottom sheet opened from «Filtros». */
  protected readonly filtros = signal(false);
  /** Exportar / Importar live in the «⋯» panel. */
  protected readonly acciones = signal(false);
  protected readonly nFiltros = computed(() => [this.q(), this.sexo(), this.categoria(), this.jornada(), this.incompletos(), this.handling(), this.padronFiltro()].filter(Boolean).length);
  protected limpiar(): void {
    this.q.set(''); this.sexo.set(''); this.categoria.set(''); this.jornada.set(''); this.incompletos.set(false); this.handling.set(''); this.padronFiltro.set('');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: null }, queryParamsHandling: 'merge', replaceUrl: true });
    this.recargar(1);
  }
  protected readonly pagina = signal(1);
  private readonly srt = urlSort(['nombre', 'categoria', 'completo'] as const, 'nombre', 'asc');
  protected readonly orden = this.srt.orden;
  protected readonly dir = this.srt.dir;
  protected readonly sel = signal(new Set<string>());
  protected readonly accionIds = signal<string[] | null>(null);
  /** «Enviar acceso al perfil»: the selection, or every athlete from the «Acciones» panel. */
  protected readonly perfil = signal<{ ids: string[]; todos: boolean } | null>(null);
  protected readonly todos = computed(() => {
    const ids = this.filas().map((a) => a.id), n = ids.filter((id) => this.sel().has(id)).length;
    return n && n === ids.length ? true : n ? 'mixed' : false;
  });
  protected sortDe(c: string): 'asc' | 'desc' | null { return this.srt.sortDe(c); }
  protected ordenar(c: 'nombre' | 'categoria' | 'completo'): void {
    this.srt.toggle(c);
    void this.recargar(1);
  }
  protected limpiarSel(): void { this.sel.set(new Set()); }
  protected toggleSel(id: string): void {
    const s = new Set(this.sel());
    if (!s.delete(id)) s.add(id);
    this.sel.set(s);
  }
  protected selTodos(): void {
    this.sel.set(this.todos() === true ? new Set() : new Set(this.filas().map((a) => a.id)));
  }
  protected readonly promo = signal<ItemLista | null>(null);
  protected readonly avisar = signal(true);
  protected readonly promoBusy = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private readonly por = 25;

  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'atletas.editar'));
  protected readonly canWeigh = computed(() => this.auth.can(this.comps.current()?.id, 'checkin.escanear') || this.canEdit());
  protected readonly filas = computed(() => (this.pestana() === 'incidencias' ? this.reservas() : (this.lista()?.items ?? [])));
  protected readonly incidencias = computed(() => this.incidenciasDe());
  protected readonly paginas = computed(() => Math.max(1, Math.ceil((this.lista()?.total ?? 0) / this.por)));
  protected readonly desde = computed(() => ((this.lista()?.total ?? 0) === 0 ? 0 : (this.pagina() - 1) * this.por + 1));
  protected readonly hasta = computed(() => Math.min(this.pagina() * this.por, this.lista()?.total ?? 0));
  protected readonly paginasVisibles = computed(() => {
    const n = this.paginas();
    const p = this.pagina();
    const set = new Set([1, 2, p - 1, p, p + 1, n].filter((x) => x >= 1 && x <= n));
    const out: number[] = [];
    let prev = 0;
    for (const x of [...set].sort((a, b) => a - b)) {
      if (x - prev > 1) out.push(0);
      out.push(x);
      prev = x;
    }
    return out;
  });
  protected readonly subtitulo = computed(() => {
    const l = this.lista();
    const c = this.comps.current();
    if (!l) return '';
    const plazas = (c as { inscripcion?: { plazas?: number } } | null)?.inscripcion?.plazas;
    const p = l.pruebas;
    const parts = [plazas ? `${plazas} plazas (cupo AEP)` : '', `${fmtNumber(l.pestanas.confirmados)} confirmados`];
    if (p) parts.push(`AEP-2 ${p.aep2}`, `AEP-3 ${p.aep3}`, p.sin ? `${p.sin} sin competición` : '');
    if (l.importado) parts.push(`actualizado desde el acta del ${fmtShortDate(l.importado)}`);
    return parts.filter(Boolean).join(' · ');
  });
  /** U31-R1-9: more confirmed athletes than AEP places. */
  protected readonly sobreaforo = computed(() => {
    const l = this.lista();
    const plazas = (this.comps.current() as { inscripcion?: { plazas?: number } } | null)?.inscripcion?.plazas;
    return l && plazas && l.pestanas.confirmados > plazas ? { plazas, confirmados: l.pestanas.confirmados } : null;
  });

  constructor() {
    effect(() => {
      const cid = this.comps.current()?.id;
      if (cid) untracked(() => void this.recargar(1));
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('athletes.') || (e.tipo === 'import.progreso' && e.datos?.['estado'] === 'confirmada')) void this.recargar(this.pagina(), true);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    // ⌘K «Ver todos» lands here with ?q=; also when already on this page.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const q = p.get('q') ?? '';
      if (q !== this.q()) { this.pestana.set('todos'); this.buscar(q); }
    });
  }

  protected buscar(v: string): void {
    this.q.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // U31-R1-11: keep the search in the URL so refresh/share keeps it.
      void this.router.navigate([], { relativeTo: this.route, queryParams: { q: v || null }, queryParamsHandling: 'merge', replaceUrl: true });
      void this.recargar(1);
    }, 250);
  }

  protected cambiarPestana(p: Pestana): void {
    this.pestana.set(p);
    void this.recargar(1);
  }

  async recargar(pagina: number, silencioso = false): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.pagina.set(pagina);
    if (!silencioso) this.sel.set(new Set());
    if (!silencioso) this.cargando.set(true);
    this.error.set('');
    try {
      if (this.pestana() === 'incidencias') {
        const [inc, res] = await Promise.all([
          this.api.lista(cid, { pestana: 'incidencias', por: 200 }),
          this.api.lista(cid, { pestana: 'reserva', orden: 'reserva', por: 200 }),
        ]);
        this.lista.set(inc);
        this.reservas.set(res.items);
        this.incidenciasDe.set(inc.items.flatMap((f) => f.avisos.map((i) => ({
          id: f.id,
          tono: (i.tipo === 'menor_sin_autorizacion' ? 'info' : 'warning') as GrTone,
          titulo: { menor_sin_autorizacion: `${f.nombreCompleto} es menor de edad (${f.edad} años)`, categoria_invalida: `${f.nombreCompleto}: categoría no válida`, pesaje_fuera: `Pesaje fuera de categoría · ${f.nombreCompleto}`, foto_sin_consentimiento: `${f.nombreCompleto}: foto sin consentimiento` }[i.tipo],
          texto: i.texto,
          accion: { menor_sin_autorizacion: 'Subir autorización', categoria_invalida: 'Corregir categoría', pesaje_fuera: 'Decidir', foto_sin_consentimiento: 'Revisar perfil' }[i.tipo],
        }))));
      } else {
        this.lista.set(await this.api.lista(cid, {
          pestana: this.pestana(), q: this.q(), sexo: this.sexo(), categoria: this.categoria(), jornada: this.jornada(), perfil: this.incompletos() ? 'incompleto' : '',
          handling: this.handling(), padron: this.padronFiltro(), orden: this.orden(), dir: this.dir(), pagina, por: this.por,
        }));
      }
    } catch (e) {
      // Stale data from another tab/filter is worse than no data: clear it and keep the error with «Reintentar».
      this.lista.set(null);
      this.reservas.set([]);
      this.incidenciasDe.set([]);
      this.error.set(errText(e, 'Inténtalo de nuevo.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected abrir(id: string): void {
    void this.router.navigate(['/', this.comps.current()?.slug, 'atletas', id]);
  }

  protected promocionar(a: ItemLista): void {
    this.avisar.set(true);
    this.promo.set(a);
  }

  protected async confirmarPromo(a: ItemLista): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.promoBusy.set(true);
    try {
      const r = await this.api.promocionar(cid, a.id, this.avisar());
      if (r.estado === 'reserva') this.toasts.success(`Plaza ofrecida a ${a.nombreCompleto}`, 'Se inscribió con pago: le hemos enviado el enlace para pagar (caduca en 24 h).');
      else this.toasts.success(`${a.nombreCompleto} ya está confirmado`, this.avisar() ? 'Le hemos enviado el email «Tienes plaza».' : 'Sin aviso por email.');
      this.promo.set(null);
      await this.recargar(1, true);
    } catch (e) {
      this.toasts.error('No se pudo promocionar', errText(e));
    } finally {
      this.promoBusy.set(false);
    }
  }

  protected async exportar(ids: string[] = []): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.exporting.set(true);
    try {
      // The file repeats exactly what the table shows: tab, filters, search and order (or only the selection).
      const filtros = { pestana: this.pestana(), q: this.q().trim(), sexo: this.sexo(), categoria: this.categoria(), jornada: this.jornada(),
        perfil: this.incompletos() ? 'incompleto' : '', handling: this.handling(), padron: this.padronFiltro(), orden: this.orden(), dir: this.dir() };
      await this.api.exportar(cid, ids, ids.length ? {} : filtros);
    } catch (e) {
      this.toasts.error('No se pudo exportar', errText(e));
    } finally {
      this.exporting.set(false);
    }
  }

  protected async plantilla(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (cid) await this.api.plantilla(cid).catch((e) => this.toasts.error('No se pudo descargar', errText(e)));
  }
}
