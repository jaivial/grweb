import { A11yModule } from '@angular/cdk/a11y';
import { CdkDrag, CdkDragHandle, CdkDropList, CdkDropListGroup, moveItemInArray, transferArrayItem, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton, GrSpinner, GrToasts, type GrIconName, type GrTone } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoDatePicker, BoSheet } from '../../shared/kit';
import { BoDrawer, BoPageHeader, BoTabBar, BoToggle, Confirm, errText, type BoTabOpcion } from '../../shared/ui';
import { tabEnUrl } from '../../shared/tab-url';
import {
  HorariosApi, cat, diaCorto, diaLargo, hora, kg, nombrePrueba, pruebaDeDia,
  type AgendaItem, type Borrador, type Config, type Diff, type Sesion, type SesionAtleta, type VersionInfo,
} from './api';

/** A drop list: a session or «sin sesión» (id null). */
interface Lista { id: string | null; atletas: SesionAtleta[] }
interface Movimiento { nombre: string; texto: string; deshacer: { id: string; atletas: string[] }[] }

const ICONOS: { v: string; label: string }[] = [
  { v: 'door', label: 'Puertas' }, { v: 'trophy', label: 'Premios' }, { v: 'gift', label: 'Sorteo' }, { v: 'clock', label: 'Hora' },
  { v: 'ticket', label: 'Entradas' }, { v: 'users', label: 'Público' }, { v: 'info', label: 'Info' }, { v: 'camera', label: 'Fotos' },
];

/** «Femenino −47 / −52 / −57 kg» → «Femenino −47/−52/−57». */
const tituloCorto = (t: string) => t.replace(/ kg$/, '').replaceAll(' / ', '/');
/** Next calendar day of «AAAA-MM-DD». */
const diaSiguiente = (f: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(f + 'T12:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * «Horarios»: no flights and one platform («tarima»). One tab per date (sábado 19 / domingo 20; «Nueva fecha» adds another
 * with the same template). Each date has its sessions by time (women / men, groups of weight classes) with their athletes in
 * lot order; OpenLifter drives the day. Drag and drop, or «Mover» on phones; filters in their own panel; no horizontal scroll.
 */
@Component({
  selector: 'bo-horarios',
  imports: [FormsModule, RouterLink, DatePipe, A11yModule, CdkDropListGroup, CdkDropList, CdkDrag, CdkDragHandle, BoPageHeader, BoDrawer, BoToggle, BoTabBar, BoDatePicker, BoSheet,
    GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton, GrSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .cdk-drag-preview { box-sizing: border-box; border-radius: 6px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.5); }
    .cdk-drag-placeholder { opacity: 0.35; }
    .cdk-drag-animating, .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
    .lista.cdk-drop-list-receiving { outline: 1px dashed var(--color-accent); outline-offset: 2px; }
  `,
  template: `
    @let b = raw();
    <div class="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-5 pb-24">
      <bo-page-header title="Horarios" [subtitle]="escritorio() ? subtitulo() : ''" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Horarios']" [badge]="estado().label" [badgeTone]="estado().tone">
        @if (b) {
          <ng-container actions>
            @if (escritorio()) { <button grButton variant="ghost" icon="history" (click)="abrirHistorial()">Historial</button> }
            <button grButton icon="eye" (click)="preview.set(true)" [disabled]="!dia()">Vista previa</button>
            @if (canEdit()) {
              <button grButton variant="primary" icon="send" (click)="abrirPublicar()" [disabled]="!b.sesiones.length || (b.publicado && !b.cambiosSinPublicar)">Publicar v{{ siguiente() }}</button>
            }
          </ng-container>
        }
      </bo-page-header>

      @if (conflictoEdicion()) {
        <gr-alert tone="warning" title="Otra persona ha cambiado los horarios">Hemos recargado el planificador con sus cambios; repite el último movimiento si hace falta.</gr-alert>
      }
      @if (otraComp(); as o) {
        <gr-alert tone="warning" title="Atleta de otra competición">{{ o }}</gr-alert>
      }

      @if (b === undefined) {
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6" aria-busy="true">
          <h2 class="text-ui-h4">Cargando el horario…</h2>
          <div class="mt-4 flex flex-col gap-2">@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-24 rounded-md" /> }</div>
        </section>
      } @else if (b === null) {
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
          <h2 class="text-ui-h4">Error al cargar</h2>
          <gr-alert tone="danger" class="mt-4" title="No se pudo cargar el horario">Comprueba la conexión. Tus cambios ya guardados no se pierden.
            <button alertAction type="button" class="mt-1 inline-flex items-center gap-1 text-label-s text-accent-text hover:underline" (click)="cargar()">Reintentar <gr-icon name="arrow-right" [size]="14" /></button>
          </gr-alert>
        </section>
      } @else {
        <!-- Dates: one tab per date (phones: selector) + «Nueva fecha» -->
        <div class="flex min-w-0 flex-col gap-2 md:flex-row md:items-end">
          <bo-tab-bar class="min-w-0 flex-1" label="Fecha" [tabs]="tabs()" [value]="dia()" (valueChange)="elegirDia($event)" />
          @if (canEdit() && escritorio()) { <button grButton variant="ghost" icon="plus" class="self-start md:self-auto" (click)="abrirNueva()">Nueva fecha</button> }
        </div>

        <!-- Toolbar: wraps, never scrolls sideways; tablet/phone: summary and actions in the «Ajustes» sheet -->
        <div class="flex flex-wrap items-center gap-2">
          @if (escritorio()) {
            @if (canEdit() && dia()) {
              @if (puedeGenerar()) { <button grButton icon="zap" (click)="generar()">Generar sesiones</button> }
              <button grButton variant="ghost" icon="plus" (click)="nuevaSesion()">Sesión</button>
            }
          } @else {
            <button grButton variant="ghost" icon="settings" aria-haspopup="dialog" (click)="ajustesOpen.set(true)">Ajustes</button>
          }
          <button grButton variant="ghost" icon="filter" [attr.aria-expanded]="filtrosOpen()" aria-controls="h-filtros" (click)="filtrosOpen.set(!filtrosOpen())">Filtros{{ nFiltros() ? ' · ' + nFiltros() : '' }}</button>
          @if (dia() && escritorio()) { <button grButton variant="ghost" icon="settings" (click)="abrirDia()">Ajustes de la fecha</button> }
        </div>

        @if (filtrosOpen()) {
          <section id="h-filtros" class="grid grid-cols-1 gap-3 rounded-lg border border-line-subtle bg-bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros">
            <gr-field label="Buscar" for="f-q"><input grInput id="f-q" type="search" placeholder="Nombre o club" [ngModel]="q()" (ngModelChange)="q.set($event)" /></gr-field>
            <gr-field label="Sexo" for="f-s"><gr-select id="f-s" [ngModel]="fSexo()" (ngModelChange)="fSexo.set($event)"><option value="">Todos</option><option value="F">Femenino</option><option value="M">Masculino</option></gr-select></gr-field>
            <gr-field label="Categoría" for="f-c"><gr-select id="f-c" [ngModel]="fCat()" (ngModelChange)="fCat.set($event)"><option value="">Todas</option>@for (c of categorias(); track c) { <option [value]="c">{{ c }}</option> }</gr-select></gr-field>
            <gr-field label="Competición" for="f-p"><gr-select id="f-p" [ngModel]="fPrueba()" (ngModelChange)="fPrueba.set($event)"><option value="">Todas</option><option value="aep2">AEP-2</option><option value="aep3">AEP-3</option><option value="-">Sin competición</option></gr-select></gr-field>
            @if (nFiltros()) {
              <p class="flex flex-wrap items-center gap-2 text-body-xs text-text-tertiary sm:col-span-2 lg:col-span-4">Con filtros no se puede arrastrar (el orden de salida es de toda la sesión): usa «Mover».
                <button type="button" class="inline-flex h-11 items-center text-label-s text-accent-text hover:underline" (click)="limpiarFiltros()">Quitar filtros</button></p>
            }
          </section>
        }

        @if (dia()) {
          <div class="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div class="flex min-w-0 flex-col gap-4" cdkDropListGroup>
              @if (b.sinSesion.length) {
                <section class="rounded-lg border border-line-strong bg-bg-surface p-3">
                  <header class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-label-m">Sin sesión</h2><p class="text-body-xs text-text-tertiary">{{ b.sinSesion.length }} {{ b.sinSesion.length === 1 ? 'atleta' : 'atletas' }} · arrástralos o usa «Mover»</p></header>
                  <ul class="lista mt-3 flex max-h-72 min-h-14 flex-col gap-1.5 overflow-y-auto" cdkDropList [cdkDropListData]="sinLista()" (cdkDropListDropped)="drop($event)" [cdkDropListDisabled]="!canEdit() || !!nFiltros()" aria-label="Atletas sin sesión">
                    @for (a of filtrar(b.sinSesion); track a.id) {
                      <li cdkDrag [cdkDragData]="a" class="flex min-h-12 items-center gap-2 rounded-md border border-line-subtle bg-bg-card px-2 py-1">
                        <span cdkDragHandle class="hidden cursor-grab text-text-muted sm:block"><gr-icon name="grip" [size]="16" /></span>
                        <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ a.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ a.sexo }} {{ cat(a.categoria) }}{{ a.prueba ? ' · ' + nombrePrueba(a.prueba) : '' }}{{ a.totalPrevisto ? ' · tot. prev. ' + kg(a.totalPrevisto) : '' }}</span></span>
                        @if (canEdit()) { <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" [attr.aria-label]="'Mover a ' + a.nombre" (click)="abrirMover(a, null)"><gr-icon name="arrow-right" [size]="16" /></button> }
                      </li>
                    }
                  </ul>
                </section>
              }

              @for (f of sesionesVisibles(); track f.id) {
                <section [id]="'sesion-' + f.id" class="rounded-lg border bg-bg-card p-3" [class]="bloquea(f) ? 'border-warning/70' : 'border-line-subtle'" [attr.aria-label]="'Sesión de las ' + hora(f.inicio)">
                  <header class="flex items-start gap-3">
                    <button type="button" class="flex min-w-0 flex-1 items-start gap-3 text-left" [attr.aria-expanded]="!plegada(f)" (click)="plegar(f)">
                      <span class="font-mono text-ui-h4 text-text-primary">{{ hora(f.inicio) }}</span>
                      <span class="min-w-0 flex-1 text-label-m">{{ tituloCorto(f.titulo) }}{{ f.prueba ? ' · ' + nombrePrueba(f.prueba) : '' }}</span>
                      <gr-icon [name]="plegada(f) ? 'chevron-down' : 'chevron-up'" [size]="18" class="mt-1 shrink-0 text-text-tertiary" />
                    </button>
                    <button grIconButton icon="pencil" [label]="'Editar la sesión de las ' + hora(f.inicio)" (click)="abrirSesion(f)"></button>
                  </header>
                  <div class="mt-1 text-body-xs text-text-tertiary"><span [class.text-accent-text]="activos(f) > b.config.maxPorSesion">{{ activos(f) }} atletas</span> · pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }} · hasta ~{{ hora(f.fin) }}</div>
                  @for (a of f.avisos.slice(0, 2); track a) { <p class="mt-2 flex items-start gap-1.5 text-body-xs text-warning"><gr-icon name="triangle-alert" [size]="12" class="mt-0.5 shrink-0" />{{ a }}</p> }
                  @if (!plegada(f)) {
                    <ol class="lista mt-3 flex min-h-14 flex-col gap-1.5" cdkDropList [cdkDropListData]="lista(f)" (cdkDropListDropped)="drop($event)" [cdkDropListDisabled]="!canEdit() || !!nFiltros()" [attr.aria-label]="'Atletas de la sesión de las ' + hora(f.inicio)">
                      @for (a of filtrar(f.atletas); track a.id) {
                        <li cdkDrag [cdkDragData]="a" [cdkDragDisabled]="a.baja" class="flex min-h-12 items-center gap-2 rounded-md border px-2 py-1" [class]="a.baja ? 'border-accent/40 bg-accent-deep/20' : 'border-line-subtle bg-bg-raised'">
                          <span cdkDragHandle class="hidden cursor-grab text-text-muted sm:block"><gr-icon name="grip" [size]="16" /></span>
                          <span class="w-6 shrink-0 text-right font-mono text-label-s text-text-tertiary">{{ a.lote }}</span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-label-s" [class.line-through]="a.baja">{{ a.nombre }}</span>
                            <span class="block truncate text-body-xs text-text-tertiary">{{ a.baja ? 'Ya no está confirmado: se quitará al publicar' : cat(a.categoria) + (a.totalPrevisto ? ' · tot. prev. ' + kg(a.totalPrevisto) : '') + (a.club ? ' · ' + a.club : '') }}</span>
                          </span>
                          @if (canEdit() && !a.baja) { <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" [attr.aria-label]="'Mover a ' + a.nombre" (click)="abrirMover(a, f)"><gr-icon name="arrow-right" [size]="16" /></button> }
                        </li>
                      } @empty {
                        <li class="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-body-xs text-text-tertiary">{{ nFiltros() ? 'Ningún atleta coincide con los filtros.' : 'Suelta aquí atletas' }}</li>
                      }
                    </ol>
                  }
                </section>
              } @empty {
                <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                  @if (nFiltros() && sesionesDia().length) {
                    <h2 class="text-ui-h4">Ningún atleta coincide con los filtros</h2>
                    <button grButton class="mt-4" (click)="limpiarFiltros()">Quitar filtros</button>
                  } @else if (b.atletas) {
                    <h2 class="text-ui-h4">Aún no hay sesiones el {{ diaLargo(dia()) }}</h2>
                    <p class="mt-1 max-w-xl text-body-xs text-text-tertiary">{{ pruebaDia() ? 'Se generan con los atletas de ' + nombrePrueba(pruebaDia()) + ': mujeres primero, por categoría y total previsto, una sesión detrás de otra en la tarima.' : puedeGenerar() ? 'Genera las sesiones o crea una vacía.' : 'Esta fecha no tiene competición propia: crea sus sesiones y mueve a ellas a los atletas.' }}</p>
                    @if (canEdit()) {
                      <div class="mt-4 flex flex-wrap gap-2">@if (puedeGenerar()) { <button grButton variant="primary" (click)="generar()">Generar sesiones</button> }<button grButton [variant]="puedeGenerar() ? 'secondary' : 'primary'" (click)="nuevaSesion()">Crear sesión vacía</button></div>
                    }
                  } @else {
                    <h2 class="text-ui-h4">Primero importa a los atletas</h2>
                    <p class="mt-1 max-w-xl text-body-xs text-text-tertiary">Las sesiones salen del acta de la AEP (categoría, sexo y total previsto).</p>
                    <a grButton variant="primary" class="mt-4" routerLink="../atletas/importar">Importar acta AEP</a>
                  }
                </section>
              }

              @if (movimiento(); as m) {
                <div class="flex flex-col gap-2 rounded-md border border-info/40 bg-info/10 p-4 sm:flex-row sm:items-center">
                  <gr-icon name="info" [size]="18" class="shrink-0 text-info" />
                  <div class="min-w-0 flex-1"><p class="text-label-s text-info">{{ m.nombre }}</p><p class="text-body-s text-text-secondary">{{ m.texto }}</p></div>
                  <button grButton variant="ghost" size="s" icon="undo" (click)="deshacer()">Deshacer</button>
                </div>
              }
            </div>

            <aside class="flex min-w-0 flex-col gap-4">
              <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
                <h2 class="text-ui-h5">Conflictos</h2>
                <p class="text-body-xs text-text-tertiary">{{ bloqueantes() ? bloqueantes() + ' a resolver antes de publicar' : 'Nada que bloquee la publicación' }}</p>
                <ul class="mt-3 flex flex-col gap-2">
                  @for (c of b.conflictos.slice(0, 8); track $index) {
                    <li class="rounded-md border p-3" [class]="c.bloquea ? 'border-accent/50 bg-accent-deep/20' : 'border-warning/40 bg-warning/5'">
                      <p class="flex items-start gap-2 text-label-s" [class]="c.bloquea ? 'text-accent-text' : 'text-warning'"><gr-icon [name]="c.bloquea ? 'circle-x' : 'triangle-alert'" [size]="14" class="mt-0.5 shrink-0" />{{ c.titulo }}</p>
                      <p class="mt-1 pl-5 text-body-xs text-text-secondary">{{ c.detalle }}</p>
                      @if (c.sesionId) { <button type="button" class="inline-flex h-11 items-center pl-5 text-label-s text-accent-text hover:underline" (click)="irA(c.sesionId)">Ver sesión →</button> }
                    </li>
                  } @empty { <li class="flex items-center gap-2 text-body-s text-success"><gr-icon name="circle-check" [size]="16" />Sin conflictos</li> }
                </ul>
              </section>
              <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
                <h2 class="text-ui-h5">Versiones</h2>
                <ul class="mt-3 flex flex-col">
                  @if (b.cambiosSinPublicar) {
                    <li class="flex items-center justify-between gap-2 border-b border-line-subtle py-2 text-body-s"><span class="text-label-s">v{{ siguiente() }} · borrador</span><span class="text-body-xs text-text-tertiary">sin publicar</span></li>
                  }
                  @for (v of versiones().slice(0, 4); track v.numero) {
                    <li class="flex items-center justify-between gap-2 border-b border-line-subtle py-2 last:border-0">
                      <span class="text-label-s" [class.text-text-tertiary]="v.estado !== 'publicada'">v{{ v.numero }} · {{ v.estado }}</span>
                      <span class="text-right text-body-xs text-text-tertiary">{{ v.at | date: 'dd/MM HH:mm' }}</span>
                    </li>
                  } @empty { <li class="text-body-s text-text-tertiary">Todavía no se ha publicado.</li> }
                </ul>
              </section>
            </aside>
          </div>
        } @else {
          <gr-empty icon="calendar" title="Aún no hay fechas" text="Añade la primera fecha de la competición con «Nueva fecha»." />
        }
      }
    </div>

    @if (generando()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
        <div class="w-full max-w-sm rounded-lg border border-line-strong bg-bg-raised p-6 text-center shadow-card" role="alertdialog" aria-modal="true" aria-label="Generando sesiones">
          <h2 class="text-left text-ui-h5">Generando sesiones…</h2>
          <gr-spinner class="mt-6" [size]="28" />
          <p class="mt-4 text-body-s text-text-secondary">Mujeres primero, por categoría y total previsto, en grupos de {{ raw()?.config?.maxPorSesion }}.</p>
        </div>
      </div>
    }

    <!-- Publish -->
    @if (pub(); as d) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" (click)="pub.set(null)">
        <div class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-xl border border-line-strong bg-bg-raised shadow-card sm:rounded-lg" role="dialog" aria-modal="true" aria-label="Publicar horarios" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <header class="flex items-center gap-3 border-b border-line-subtle px-6 py-4"><h2 class="flex-1 text-ui-h5">Publicar v{{ d.siguiente }}</h2><button grIconButton icon="x" label="Cerrar" (click)="pub.set(null)"></button></header>
          <div class="flex-1 overflow-y-auto px-6 py-5">
            @if (d.bloqueantes) { <gr-alert tone="danger" class="mb-4" [title]="'Hay ' + d.bloqueantes + ' conflictos que bloquean la publicación'">Resuélvelos en el planificador (en rojo) y vuelve a intentarlo.</gr-alert> }
            @if (d.primera) {
              <p class="text-body-s text-text-secondary">Primera publicación: <strong class="text-text-primary">{{ d.atletas }} atletas</strong> recibirán su fecha, hora y pesaje en su ficha y en su área.</p>
            } @else {
              <p class="text-body-s text-text-secondary">{{ d.cambios.length }} {{ d.cambios.length === 1 ? 'cambio' : 'cambios' }} respecto a la versión publicada (v{{ d.desde }}):</p>
              <ul class="mt-3 flex flex-col divide-y divide-line-subtle rounded-md border border-line-subtle">
                @for (c of d.cambios; track $index) {
                  <li class="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                    <span class="min-w-0 flex-1 text-label-s">{{ c.titulo }}</span>
                    <span class="font-mono text-body-xs text-text-tertiary">{{ c.antes }} → <span class="text-text-primary">{{ c.despues }}</span></span>
                  </li>
                }
              </ul>
            }
            <div class="mt-5 flex flex-col divide-y divide-line-subtle rounded-md border border-line-subtle">
              <div class="flex items-center gap-3 px-4 py-2">
                <div class="min-w-0 flex-1"><p class="text-label-s">Avisar a los {{ d.afectados }} atletas afectados</p><p class="text-body-xs text-text-tertiary">Plantilla «{{ d.primera ? 'Tu fecha y horario' : 'Cambio en tu horario' }}» · también en su área · {{ d.conEmail }} con email</p></div>
                <bo-toggle [(value)]="avisarAtletas" label="Avisar a los atletas" [disabled]="!d.afectados" />
              </div>
              <div class="flex items-center gap-3 px-4 py-2">
                <div class="min-w-0 flex-1"><p class="text-label-s">Avisar a sus {{ d.seguidores }} seguidores</p><p class="text-body-xs text-text-tertiary">Solo a quien activó avisos de ese atleta</p></div>
                <bo-toggle [(value)]="avisarSeguidores" label="Avisar a los seguidores" [disabled]="!d.seguidores" />
              </div>
            </div>
          </div>
          <footer class="flex flex-wrap justify-end gap-2 border-t border-line-subtle px-6 py-4">
            <button grButton variant="ghost" (click)="pub.set(null)">Cancelar</button>
            <button grButton variant="primary" [loading]="publicando()" [disabled]="d.bloqueantes > 0" (click)="publicar()">{{ avisarAtletas() || avisarSeguidores() ? 'Publicar y avisar' : 'Publicar sin avisar' }}</button>
          </footer>
        </div>
      </div>
    }

    <!-- New date -->
    <bo-drawer [(open)]="nuevaOpen" title="Nueva fecha">
      <div class="flex flex-col gap-4">
        <gr-field label="Fecha" for="n-f"><bo-date-picker id="n-f" tipo="date" [(ngModel)]="nuevaFecha" aria-label="Fecha nueva" [borrable]="false" /></gr-field>
        <p class="text-body-xs text-text-tertiary">Usa la misma plantilla que la última fecha: horario, puertas, pausa, info del día y agenda. Luego puedes ajustarla.</p>
      </div>
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="nuevaOpen.set(false)">Cancelar</button>
        <button grButton variant="primary" [loading]="guardando()" [disabled]="!nuevaFecha" (click)="crearFecha()">Añadir fecha</button>
      </ng-container>
    </bo-drawer>

    <!-- Session -->
    <bo-drawer [(open)]="sesionOpen" [title]="'Sesión de las ' + hora(sSel()?.inicio)">
      @if (sSel(); as f) {
        <div class="flex flex-col gap-4">
          <p class="text-body-s text-text-secondary">{{ f.titulo }} · {{ activos(f) }} atletas</p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <gr-field label="Fecha" for="s-dia"><gr-select id="s-dia" [(ngModel)]="sEdit.dia" [disabled]="!canEdit()">@for (d of raw()?.config?.dias ?? []; track d.fecha) { <option [value]="d.fecha">{{ diaLargo(d.fecha) }}</option> }</gr-select></gr-field>
            <gr-field label="Empieza" for="s-ini"><bo-date-picker id="s-ini" tipo="time" [(ngModel)]="sEdit.inicio" [borrable]="false" [disabled]="!canEdit()" aria-label="Empieza" /></gr-field>
            <gr-field label="Duración (min)" for="s-dur"><input grInput id="s-dur" type="number" inputmode="numeric" min="10" max="600" step="5" [(ngModel)]="sEdit.duracionMin" [disabled]="!canEdit()" /></gr-field>
            <span class="hidden sm:block"></span>
            <gr-field label="Pesaje desde" for="s-pi"><bo-date-picker id="s-pi" tipo="time" [(ngModel)]="sEdit.pesajeInicio" [borrable]="false" [disabled]="!canEdit()" aria-label="Pesaje desde" /></gr-field>
            <gr-field label="Pesaje hasta" for="s-pf"><bo-date-picker id="s-pf" tipo="time" [(ngModel)]="sEdit.pesajeFin" [borrable]="false" [disabled]="!canEdit()" aria-label="Pesaje hasta" /></gr-field>
          </div>
          <p class="text-body-xs text-text-tertiary">Si cambias la hora y no tocas el pesaje, el pesaje se recalcula ({{ raw()?.config?.pesajeAntesMin }} min antes, {{ raw()?.config?.pesajeDuracionMin }} min).</p>
        </div>
      }
      @if (canEdit()) {
        <ng-container drawerActions>
          <button grButton variant="danger" icon="trash" class="mr-auto" (click)="borrarSesion()">Borrar</button>
          <button grButton variant="ghost" (click)="sesionOpen.set(false)">Cancelar</button>
          <button grButton variant="primary" [loading]="guardando()" (click)="guardarSesion()">Guardar</button>
        </ng-container>
      }
    </bo-drawer>

    <!-- Date settings -->
    <bo-drawer [(open)]="diaOpen" [title]="'Ajustes · ' + diaLargo(dEditDia.fecha || dia())">
      <div class="flex flex-col gap-5">
        <section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <gr-field label="Primera sesión" for="a-ini"><bo-date-picker id="a-ini" tipo="time" [(ngModel)]="dEditDia.inicio" [borrable]="false" [disabled]="!canEdit()" aria-label="Primera sesión" /></gr-field>
          <gr-field label="Fin del día" for="a-fin"><bo-date-picker id="a-fin" tipo="time" [(ngModel)]="dEditDia.fin" [borrable]="false" [disabled]="!canEdit()" aria-label="Fin del día" /></gr-field>
          <gr-field label="Apertura de puertas" for="a-pu"><bo-date-picker id="a-pu" tipo="time" [(ngModel)]="dEditDia.puertas" [disabled]="!canEdit()" aria-label="Apertura de puertas" /></gr-field>
          <span class="hidden sm:block"></span>
          <gr-field label="Pausa desde" for="a-pi"><bo-date-picker id="a-pi" tipo="time" [(ngModel)]="dEditDia.pausaInicio" [disabled]="!canEdit()" aria-label="Pausa desde" /></gr-field>
          <gr-field label="Pausa hasta" for="a-pf"><bo-date-picker id="a-pf" tipo="time" [(ngModel)]="dEditDia.pausaFin" [disabled]="!canEdit()" aria-label="Pausa hasta" /></gr-field>
        </section>
        <gr-field label="Info del día (una por línea)" for="a-no"><textarea grInput id="a-no" rows="3" [(ngModel)]="notas" [disabled]="!canEdit()"></textarea></gr-field>
        <section>
          <h3 class="text-label-m">Agenda del día</h3>
          <p class="text-body-xs text-text-tertiary">Puertas, premios, sorteo…</p>
          <ul class="mt-3 flex flex-col gap-3">
            @for (it of agendaDia; track $index) {
              <li class="grid grid-cols-[minmax(0,1fr)_44px] gap-2 rounded-md border border-line-subtle p-2 sm:grid-cols-[120px_minmax(0,1fr)_120px_44px] sm:border-0 sm:p-0">
                <bo-date-picker tipo="time" [(ngModel)]="it.hora" aria-label="Hora" [borrable]="false" [disabled]="!canEdit()" />
                @if (canEdit()) { <button grIconButton icon="trash" label="Quitar" class="sm:order-last" (click)="agendaDia.splice($index, 1)"></button> } @else { <span></span> }
                <input grInput [(ngModel)]="it.titulo" maxlength="120" aria-label="Qué pasa" [disabled]="!canEdit()" class="col-span-2 sm:col-span-1" />
                <gr-select class="col-span-2 sm:col-span-1" [(ngModel)]="it.icono" aria-label="Icono" [disabled]="!canEdit()">@for (i of iconos; track i.v) { <option [value]="i.v">{{ i.label }}</option> }</gr-select>
              </li>
            }
          </ul>
          @if (canEdit()) { <button grButton variant="ghost" size="s" icon="plus" class="mt-2" (click)="agendaDia.push({ dia: dEditDia.fecha, hora: '19:00', titulo: '', icono: 'clock' })">Añadir momento</button> }
        </section>
        <section class="grid grid-cols-1 gap-3 border-t border-line-subtle pt-4 sm:grid-cols-2">
          <h3 class="text-label-m sm:col-span-2">Reglas para generar (todas las fechas)</h3>
          <gr-field label="Máx. atletas por sesión" for="r-x"><input grInput id="r-x" type="number" inputmode="numeric" min="2" max="30" [(ngModel)]="reglas.maxPorSesion" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Min. por atleta" for="r-m"><input grInput id="r-m" type="number" inputmode="numeric" min="3" max="20" [(ngModel)]="reglas.minPorAtleta" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Descanso entre sesiones (min)" for="r-d"><input grInput id="r-d" type="number" inputmode="numeric" min="0" max="120" step="5" [(ngModel)]="reglas.descansoMin" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Mesas de pesaje" for="r-me"><input grInput id="r-me" type="number" inputmode="numeric" min="1" max="4" [(ngModel)]="reglas.mesasPesaje" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Pesaje: min antes" for="r-pa"><input grInput id="r-pa" type="number" inputmode="numeric" min="30" max="240" step="5" [(ngModel)]="reglas.pesajeAntesMin" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Pesaje: duración (min)" for="r-pd"><input grInput id="r-pd" type="number" inputmode="numeric" min="15" max="180" step="5" [(ngModel)]="reglas.pesajeDuracionMin" [disabled]="!canEdit()" /></gr-field>
        </section>
      </div>
      @if (canEdit()) {
        <ng-container drawerActions>
          @if (tabs().length > 1) { <button grButton variant="danger" icon="trash" class="mr-auto" (click)="borrarFecha()">Quitar fecha</button> }
          <button grButton variant="ghost" (click)="diaOpen.set(false)">Cancelar</button>
          <button grButton variant="primary" [loading]="guardando()" (click)="guardarDia()">Guardar</button>
        </ng-container>
      }
    </bo-drawer>

    <!-- Move (phones / keyboard): to another position, another session or out -->
    <bo-drawer [(open)]="moverOpen" [title]="'Mover a ' + (mSel()?.a?.nombre ?? '')">
      @if (mSel(); as m) {
        <div class="flex flex-col gap-5">
          @if (m.desde) {
            <section class="flex flex-col gap-2">
              <h3 class="text-label-m">Orden de salida en su sesión</h3>
              <div class="flex flex-wrap items-end gap-2">
                <gr-field label="Lote" for="m-l" class="w-28"><input grInput id="m-l" type="number" inputmode="numeric" min="1" [max]="m.desde.atletas.length" [(ngModel)]="mLote" /></gr-field>
                <button grButton (click)="moverPosicion()">Mover al lote {{ mLote }}</button>
              </div>
            </section>
          }
          @for (g of destinos(); track g.dia) {
            <section class="flex flex-col gap-2">
              <h3 class="text-label-m first-letter:uppercase">{{ diaLargo(g.dia) }}</h3>
              <ul class="flex flex-col gap-2">
                @for (f of g.sesiones; track f.id) {
                  <li><button type="button" class="flex min-h-12 w-full items-center gap-3 rounded-md border border-line-subtle bg-bg-raised px-4 py-3 text-left hover:border-line-strong" (click)="mover(f)">
                    <span class="font-mono text-label-m text-accent-text">{{ hora(f.inicio) }}</span>
                    <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ tituloCorto(f.titulo) }}{{ f.prueba ? ' · ' + nombrePrueba(f.prueba) : '' }}</span><span class="block text-body-xs text-text-tertiary">{{ activos(f) }}/{{ raw()?.config?.maxPorSesion }} atletas · al final del orden</span></span>
                    <gr-icon name="arrow-right" [size]="16" class="shrink-0" />
                  </button></li>
                } @empty { <li class="text-body-xs text-text-tertiary">Sin sesiones de su competición este día.</li> }
              </ul>
            </section>
          }
          @if (m.desde) { <button type="button" class="min-h-12 w-full rounded-md border border-dashed border-line-strong px-4 py-3 text-left text-label-s text-text-secondary" (click)="mover(null)">Quitar de la sesión (sin sesión)</button> }
        </div>
      }
    </bo-drawer>

    <!-- Tablet/phone: summary, actions and history (bottom sheet on phones, side sheet ≥768 px) -->
    <bo-sheet title="Ajustes" [(open)]="ajustesOpen">
      <bo-tab-bar label="Ajustes" [alwaysTabs]="true" [tabs]="ajustesTabs" [(value)]="ajustesTab" />
      @switch (ajustesTab()) {
        @case ('resumen') { <p class="text-body-s text-text-secondary">{{ subtitulo() }}</p> }
        @case ('acciones') {
          <div class="flex flex-col gap-2">
            @if (canEdit()) { <button grButton variant="ghost" icon="plus" (click)="ajustesOpen.set(false); abrirNueva()">Nueva fecha</button> }
            @if (canEdit() && dia()) {
              @if (puedeGenerar()) { <button grButton icon="zap" (click)="ajustesOpen.set(false); generar()">Generar sesiones</button> }
              <button grButton variant="ghost" icon="plus" (click)="ajustesOpen.set(false); nuevaSesion()">Sesión</button>
            }
            @if (dia()) { <button grButton variant="ghost" icon="settings" (click)="ajustesOpen.set(false); abrirDia()">Ajustes de la fecha</button> }
          </div>
        }
        @case ('historial') { <button grButton variant="ghost" icon="history" (click)="ajustesOpen.set(false); abrirHistorial()">Historial</button> }
      }
    </bo-sheet>

    <bo-drawer [(open)]="historialOpen" title="Historial de versiones">
      <ul class="flex flex-col gap-2">
        @for (v of versiones(); track v.numero) {
          <li class="rounded-md border border-line-subtle p-4">
            <p class="flex items-center gap-2"><span class="text-label-m">v{{ v.numero }}</span><gr-badge [tone]="v.estado === 'publicada' ? 'success' : 'neutral'">{{ v.estado }}</gr-badge></p>
            <p class="mt-1 text-body-xs text-text-tertiary">{{ v.at | date: 'dd/MM/yyyy HH:mm' }} · {{ v.por }} · {{ v.cambios }} cambios · {{ v.avisos }} avisos a atletas · {{ v.seguidores }} a seguidores</p>
            @if (canEdit()) { <button grButton size="s" variant="ghost" icon="undo" class="mt-2" (click)="restaurar(v)">Llevar al borrador</button> }
          </li>
        } @empty { <li class="text-body-s text-text-tertiary">Todavía no se ha publicado ninguna versión.</li> }
      </ul>
      @if (canEdit() && raw()?.publicado) { <button drawerActions grButton variant="danger" (click)="despublicar()">Retirar de la web</button> }
    </bo-drawer>

    <bo-drawer [(open)]="preview" title="Vista previa · /horarios (borrador)">
      <p class="text-mono-xs text-accent-text uppercase">{{ diaLargo(dia()) }}</p>
      <ul class="mt-3 flex flex-col gap-2">
        @for (r of previewDia(); track $index) {
          @if (r.sesion; as f) {
            <li class="rounded-md border border-line-subtle bg-bg-raised p-3">
              <p class="flex items-baseline gap-3"><span class="font-mono text-ui-h5">{{ hora(f.inicio) }}</span><span class="text-label-m">{{ f.titulo }}{{ f.prueba ? ' · ' + nombrePrueba(f.prueba) : '' }}</span></p>
              <p class="text-body-xs text-text-tertiary">{{ activos(f) }} atletas · Pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}</p>
            </li>
          } @else {
            <li class="flex items-center gap-3 rounded-md border border-line-subtle px-3 py-2 text-body-s"><span class="font-mono text-accent-text">{{ r.item!.hora }}</span><gr-icon [name]="icono(r.item!.icono)" [size]="14" />{{ r.item!.titulo }}</li>
          }
        }
      </ul>
    </bo-drawer>
  `,
})
export class HorariosPage {
  private readonly api = inject(HorariosApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly comps = inject(Competitions);
  protected readonly hora = hora;
  protected readonly cat = cat;
  protected readonly kg = kg;
  protected readonly diaLargo = diaLargo;
  protected readonly nombrePrueba = nombrePrueba;
  protected readonly tituloCorto = tituloCorto;
  protected readonly iconos = ICONOS;

  protected readonly raw = signal<Borrador | null | undefined>(undefined);
  protected readonly versiones = signal<VersionInfo[]>([]);
  protected readonly dia = signal('');
  protected readonly generando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly publicando = signal(false);
  protected readonly conflictoEdicion = signal(false);
  protected readonly otraComp = signal('');
  protected readonly movimiento = signal<Movimiento | null>(null);
  protected readonly pub = signal<Diff | null>(null);
  protected readonly avisarAtletas = signal(true);
  protected readonly avisarSeguidores = signal(false);
  protected readonly diaOpen = signal(false);
  protected readonly nuevaOpen = signal(false);
  protected readonly sesionOpen = signal(false);
  protected readonly moverOpen = signal(false);
  protected readonly historialOpen = signal(false);
  protected readonly escritorio = signal(typeof matchMedia === 'undefined' || matchMedia('(min-width: 1024px)').matches);
  protected readonly ajustesOpen = signal(false);
  protected readonly ajustesTab = signal('resumen');
  protected readonly ajustesTabs: BoTabOpcion[] = [{ value: 'resumen', label: 'Resumen' }, { value: 'acciones', label: 'Acciones' }, { value: 'historial', label: 'Historial' }];
  protected readonly preview = signal(false);
  protected readonly filtrosOpen = signal(false);
  protected readonly q = signal('');
  protected readonly fSexo = signal('');
  protected readonly fCat = signal('');
  protected readonly fPrueba = signal('');
  private readonly plegadas = signal<ReadonlySet<string>>(new Set());
  protected readonly sSel = signal<Sesion | null>(null);
  protected readonly mSel = signal<{ a: SesionAtleta; desde: Sesion | null } | null>(null);
  protected mLote = 1;
  protected nuevaFecha = '';
  protected sEdit = { dia: '', inicio: '', duracionMin: 0, pesajeInicio: '', pesajeFin: '' };
  protected dEditDia = { fecha: '', inicio: '', fin: '', puertas: '', pausaInicio: '', pausaFin: '' };
  protected notas = '';
  protected agendaDia: AgendaItem[] = [];
  protected reglas = { maxPorSesion: 14, minPorAtleta: 7, descansoMin: 10, pesajeAntesMin: 120, pesajeDuracionMin: 90, mesasPesaje: 1 };
  private ultimoRev = 0;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly canEdit = computed(() => this.auth.can(this.cid(), 'horarios.publicar'));
  protected readonly siguiente = computed(() => (this.versiones().at(0)?.numero ?? this.raw()?.publicada?.numero ?? 0) + 1);
  protected readonly bloqueantes = computed(() => (this.raw()?.conflictos ?? []).filter((c) => c.bloquea).length);
  protected readonly fechas = computed(() => {
    const b = this.raw();
    if (!b) return [];
    const set = new Set(b.config.dias.map((d) => d.fecha));
    for (const s of b.sesiones) set.add(s.dia);
    return [...set].sort();
  });
  /** Competition of the selected date (AEP-2 the first date, AEP-3 the second). */
  protected readonly pruebaDia = computed(() => {
    const dias = this.raw()?.config.dias ?? [];
    return pruebaDeDia(dias.length, dias.findIndex((d) => d.fecha === this.dia()));
  });
  protected readonly tabs = computed<BoTabOpcion[]>(() => {
    const b = this.raw();
    const dias = b?.config.dias ?? [];
    return this.fechas().map((f) => {
      const d = diaCorto(f);
      const p = pruebaDeDia(dias.length, dias.findIndex((x) => x.fecha === f));
      return { value: f, label: d.charAt(0).toUpperCase() + d.slice(1) + (p ? ' · ' + nombrePrueba(p) : ''), count: (b?.sesiones ?? []).filter((s) => s.dia === f).reduce((n, s) => n + this.activos(s), 0) };
    });
  });
  private readonly fechaUrl = tabEnUrl(this.dia, () => this.fechas(), 'fecha');
  protected readonly sesionesDia = computed(() => (this.raw()?.sesiones ?? []).filter((s) => s.dia === this.dia()));
  /** With filters on, only the sessions with some match (no empty cards in the way). */
  protected readonly sesionesVisibles = computed(() => (this.nFiltros() ? this.sesionesDia().filter((s) => this.filtrar(s.atletas).length) : this.sesionesDia()));
  /** «Generar» rebuilds the date of one competition (AEP-2 / AEP-3) or a one-date event; an extra date without its own
   *  competition would rebuild the whole event, so it only gets manual sessions. */
  protected readonly puedeGenerar = computed(() => !!this.pruebaDia() || (this.raw()?.config.dias.length ?? 0) < 2);
  protected readonly categorias = computed(() => {
    const b = this.raw();
    if (!b) return [];
    const set = new Set<string>();
    for (const a of [...b.sinSesion, ...b.sesiones.flatMap((s) => s.atletas)]) if (a.categoria) set.add(a.sexo + ' ' + cat(a.categoria));
    return [...set].sort();
  });
  protected readonly nFiltros = computed(() => [this.q().trim(), this.fSexo(), this.fCat(), this.fPrueba()].filter(Boolean).length);
  protected readonly estado = computed<{ label: string; tone: GrTone }>(() => {
    const b = this.raw();
    if (!b) return { label: '', tone: 'neutral' };
    if (!b.publicado) return { label: b.sesiones.length ? 'Sin publicar' : '', tone: 'neutral' };
    return b.cambiosSinPublicar ? { label: 'Cambios sin publicar', tone: 'warning' } : { label: `Publicado · v${b.publicada?.numero}`, tone: 'success' };
  });
  protected readonly subtitulo = computed(() => {
    const b = this.raw();
    if (!b) return '';
    const n = this.fechas().length;
    const parts = [`${n} ${n === 1 ? 'fecha' : 'fechas'}`, `${b.sesiones.length} ${b.sesiones.length === 1 ? 'sesión' : 'sesiones'}`, `${b.atletas} ${b.atletas === 1 ? 'atleta' : 'atletas'}`, 'una tarima'];
    if (b.publicada) parts.push(`publicada v${b.publicada.numero}`);
    return parts.join(' · ');
  });
  /** Destinations of «Mover»: the sessions of every date that take the athlete's competition. */
  protected readonly destinos = computed(() => {
    const m = this.mSel();
    if (!m) return [];
    const ok = (s: Sesion) => s.id !== m.desde?.id && (!s.prueba || !m.a.prueba || s.prueba === m.a.prueba);
    return this.fechas().map((dia) => ({ dia, sesiones: (this.raw()?.sesiones ?? []).filter((s) => s.dia === dia && ok(s)) }));
  });
  protected readonly previewDia = computed(() => {
    const b = this.raw();
    if (!b) return [];
    const rows: { t: string; sesion?: Sesion; item?: AgendaItem }[] = [
      ...this.sesionesDia().map((s) => ({ t: hora(s.inicio), sesion: s })),
      ...b.agenda.filter((a) => a.dia === this.dia()).map((a) => ({ t: a.hora, item: a })),
    ];
    return rows.sort((x, y) => x.t.localeCompare(y.t));
  });
  private listas = new Map<string, Lista>();
  protected readonly sinLista = computed<Lista>(() => ({ id: null, atletas: this.raw()?.sinSesion ?? [] }));

  constructor() {
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo === 'horarios.borrador' || e.tipo === 'horarios.generados') {
        const rev = Number((e.datos as { rev?: number } | undefined)?.rev ?? 0);
        if (rev > this.ultimoRev && !this.guardando() && !this.generando()) {
          void this.cargar();
          if (e.actor && e.actor !== this.auth.user()?.nombre) this.toasts.info(`${e.actor} ha cambiado los horarios`, 'Hemos recargado el planificador.');
        }
      } else if (e.tipo === 'horarios.publicados' || e.tipo === 'horarios.retirados') {
        void this.cargarVersiones();
      }
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    const mq = typeof matchMedia === 'undefined' ? null : matchMedia('(min-width: 1024px)');
    const alCambiar = () => {
      this.escritorio.set(!!mq?.matches);
      if (mq?.matches) this.ajustesOpen.set(false);
    };
    mq?.addEventListener('change', alCambiar);
    inject(DestroyRef).onDestroy(() => mq?.removeEventListener('change', alCambiar));
  }

  protected async cargar(): Promise<void> {
    try {
      this.set(await this.api.get(this.cid()));
      void this.cargarVersiones();
    } catch {
      this.raw.set(null);
    }
  }
  private async cargarVersiones(): Promise<void> {
    try {
      this.versiones.set(await this.api.versiones(this.cid()));
    } catch {
      /* the side card stays as it was */
    }
  }
  private set(b: Borrador): void {
    this.ultimoRev = b.rev;
    this.listas.clear();
    this.raw.set(b);
    const f = this.fechas();
    if (!f.includes(this.dia())) this.dia.set(f[0] ?? '');
  }

  protected elegirDia(d: string): void {
    this.dia.set(d);
    this.movimiento.set(null);
    this.otraComp.set('');
  }
  protected limpiarFiltros(): void {
    this.q.set('');
    this.fSexo.set('');
    this.fCat.set('');
    this.fPrueba.set('');
  }
  protected filtrar(l: SesionAtleta[]): SesionAtleta[] {
    if (!this.nFiltros()) return l;
    const q = this.q().trim().toLowerCase();
    return l.filter((a) =>
      (!q || (a.nombre + ' ' + a.club).toLowerCase().includes(q)) &&
      (!this.fSexo() || a.sexo === this.fSexo()) &&
      (!this.fCat() || a.sexo + ' ' + cat(a.categoria) === this.fCat()) &&
      (!this.fPrueba() || (this.fPrueba() === '-' ? !a.prueba : a.prueba === this.fPrueba())));
  }
  protected plegada(s: Sesion): boolean {
    return this.plegadas().has(s.id);
  }
  protected plegar(s: Sesion): void {
    const n = new Set(this.plegadas());
    if (!n.delete(s.id)) n.add(s.id);
    this.plegadas.set(n);
  }

  /** Stable list objects (CDK compares container data by reference). */
  protected lista(s: Sesion): Lista {
    let l = this.listas.get(s.id);
    if (!l || l.atletas !== s.atletas) {
      l = { id: s.id, atletas: s.atletas };
      this.listas.set(s.id, l);
    }
    return l;
  }
  protected activos(s: Sesion): number {
    return s.atletas.filter((a) => !a.baja).length;
  }
  protected bloquea(s: Sesion): boolean {
    return (this.raw()?.conflictos ?? []).some((c) => c.bloquea && c.sesionId === s.id);
  }
  protected icono(i?: string): GrIconName {
    return (ICONOS.some((x) => x.v === i) ? i : 'clock') as GrIconName;
  }

  /** Runs a draft change; on 409 (someone else saved) reloads and says so. */
  private async run(fn: () => Promise<Borrador>, ok?: string): Promise<boolean> {
    this.guardando.set(true);
    this.conflictoEdicion.set(false);
    this.otraComp.set('');
    try {
      this.set(await fn());
      if (ok) this.toasts.success(ok);
      return true;
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 409 && e.error?.code === 'CONFLICTO_EDICION') this.conflictoEdicion.set(true);
      else if (e instanceof HttpErrorResponse && e.status === 422 && e.error?.code === 'PRUEBA_DISTINTA') this.otraComp.set(errText(e));
      else this.toasts.error('No se pudo guardar', errText(e));
      await this.cargar();
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  protected async generar(): Promise<void> {
    const p = this.pruebaDia();
    const hay = this.sesionesDia().length;
    if (!this.puedeGenerar()) return;
    const texto = p ? `Se sustituyen las sesiones de ${nombrePrueba(p)} (${diaLargo(this.dia())}); la otra competición no cambia.` : 'Se generan de nuevo las sesiones del evento.';
    if ((hay || !p) && !(await this.confirm.ask({ title: 'Generar sesiones', text: texto + ' La web no cambia hasta que publiques.', confirm: 'Generar' }))) return;
    this.generando.set(true);
    this.movimiento.set(null);
    try {
      await this.run(() => this.api.generar(this.cid(), p || undefined));
    } finally {
      this.generando.set(false);
    }
    const n = this.sesionesDia().length;
    if (n) this.toasts.success(`${n} ${n === 1 ? 'sesión generada' : 'sesiones generadas'}`, this.bloqueantes() ? `${this.bloqueantes()} conflictos por revisar.` : 'Sin conflictos.');
  }
  protected async nuevaSesion(): Promise<void> {
    await this.run(() => this.api.crearSesion(this.cid(), { dia: this.dia(), competicion: this.pruebaDia() || undefined }), 'Sesión creada');
  }

  // ---- dates ----
  protected abrirNueva(): void {
    this.nuevaFecha = diaSiguiente(this.fechas().at(-1) ?? '');
    this.nuevaOpen.set(true);
  }
  protected async crearFecha(): Promise<void> {
    const f = this.nuevaFecha;
    if (await this.run(() => this.api.nuevaFecha(this.cid(), f), 'Fecha añadida')) {
      this.nuevaOpen.set(false);
      this.dia.set(f);
    }
  }
  protected async borrarFecha(): Promise<void> {
    const n = this.sesionesDia().length;
    const dia = this.dia();
    if (!(await this.confirm.ask({ title: `Quitar el ${diaLargo(dia)}`, text: n ? `Se borran sus ${n} sesiones (sus atletas quedan sin sesión) y su agenda.` : 'Se borra la fecha y su agenda.', confirm: 'Quitar', danger: true }))) return;
    if (await this.run(() => this.api.borrarFecha(this.cid(), dia), 'Fecha quitada')) this.diaOpen.set(false);
  }

  // ---- drag and drop ----
  protected async drop(e: CdkDragDrop<Lista, Lista, SesionAtleta>): Promise<void> {
    const from = e.previousContainer.data;
    const to = e.container.data;
    if (from === to && e.previousIndex === e.currentIndex) return;
    if (from.id === null && to.id === null) return;
    const a = e.item.data;
    const antesFrom = from.atletas.map((x) => x.id);
    const antesTo = to.atletas.map((x) => x.id);
    const fromList = [...from.atletas];
    const toList = from === to ? fromList : [...to.atletas];
    if (from === to) moveItemInArray(fromList, e.previousIndex, e.currentIndex);
    else transferArrayItem(fromList, toList, e.previousIndex, e.currentIndex);
    const r = this.raw()!;
    this.raw.set({
      ...r,
      sesiones: r.sesiones.map((s) => (s.id === from.id ? { ...s, atletas: fromList } : s.id === to.id ? { ...s, atletas: toList } : s)),
      sinSesion: from.id === null ? r.sinSesion.filter((x) => x.id !== a.id) : to.id === null ? [...r.sinSesion, a] : r.sinSesion,
    });
    const sFrom = r.sesiones.find((s) => s.id === from.id) ?? null;
    const sTo = r.sesiones.find((s) => s.id === to.id) ?? null;
    const ok = await this.run(() => (to.id ? this.api.atletas(this.cid(), to.id, toList.map((x) => x.id)) : this.api.atletas(this.cid(), from.id!, fromList.map((x) => x.id))));
    if (!ok) return;
    const deshacer: Movimiento['deshacer'] = [];
    if (to.id) deshacer.push({ id: to.id, atletas: antesTo });
    if (from.id && from !== to) deshacer.push({ id: from.id, atletas: antesFrom });
    this.movimiento.set({ nombre: a.nombre, texto: this.efecto(sFrom, sTo, e.currentIndex + 1), deshacer });
  }

  /** «Pasa a la sesión de las 11:30 (lote 3); su pesaje pasa de 07:00 a 09:30. Recibirá un email al publicar.» */
  private efecto(de: Sesion | null, a: Sesion | null, lote: number): string {
    const email = this.raw()?.publicado ? ' Recibirá un email al publicar.' : '';
    if (!a) return 'Se queda sin sesión: no aparecerá en los horarios hasta que lo asignes.' + email;
    if (de?.id === a.id) return `Ahora sale en el lote ${lote}.`;
    const otroDia = de && de.dia !== a.dia ? ` del ${diaLargo(a.dia)}` : '';
    const pesaje = de && hora(de.pesajeInicio) !== hora(a.pesajeInicio) ? `; su pesaje pasa de ${hora(de.pesajeInicio)} a ${hora(a.pesajeInicio)}` : ` (pesaje ${hora(a.pesajeInicio)}–${hora(a.pesajeFin)})`;
    return `Pasa a la sesión de las ${hora(a.inicio)}${otroDia}, lote ${lote}${pesaje}.` + email;
  }

  protected async deshacer(): Promise<void> {
    const m = this.movimiento();
    if (!m) return;
    this.movimiento.set(null);
    for (const d of m.deshacer) {
      if (!(await this.run(() => this.api.atletas(this.cid(), d.id, d.atletas)))) return;
    }
    this.toasts.success('Movimiento deshecho');
  }

  protected abrirMover(a: SesionAtleta, desde: Sesion | null): void {
    this.mSel.set({ a, desde });
    this.mLote = a.lote || 1;
    this.moverOpen.set(true);
  }
  protected async mover(to: Sesion | null): Promise<void> {
    const m = this.mSel();
    if (!m) return;
    this.moverOpen.set(false);
    const from = m.desde;
    const antesTo = to?.atletas.map((x) => x.id) ?? [];
    const antesFrom = from?.atletas.map((x) => x.id) ?? [];
    const ok = to
      ? await this.run(() => this.api.atletas(this.cid(), to.id, [...antesTo, m.a.id]))
      : await this.run(() => this.api.atletas(this.cid(), from!.id, antesFrom.filter((x) => x !== m.a.id)));
    if (!ok) return;
    const deshacer: Movimiento['deshacer'] = [];
    if (to) deshacer.push({ id: to.id, atletas: antesTo });
    if (from) deshacer.push({ id: from.id, atletas: antesFrom });
    this.movimiento.set({ nombre: m.a.nombre, texto: this.efecto(from, to, antesTo.length + 1), deshacer });
    if (to) this.irA(to.id);
  }
  protected async moverPosicion(): Promise<void> {
    const m = this.mSel();
    if (!m?.desde) return;
    const antes = m.desde.atletas.map((x) => x.id);
    const lista = antes.filter((x) => x !== m.a.id);
    const pos = Math.min(Math.max(1, Math.round(+this.mLote || 1)), lista.length + 1);
    lista.splice(pos - 1, 0, m.a.id);
    this.moverOpen.set(false);
    const id = m.desde.id;
    if (await this.run(() => this.api.atletas(this.cid(), id, lista))) {
      this.movimiento.set({ nombre: m.a.nombre, texto: `Ahora sale en el lote ${pos}.`, deshacer: [{ id, atletas: antes }] });
    }
  }
  protected irA(id: string): void {
    const s = this.raw()?.sesiones.find((x) => x.id === id);
    if (!s) return;
    this.dia.set(s.dia);
    setTimeout(() => document.getElementById('sesion-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  // ---- session drawer ----
  protected abrirSesion(s: Sesion): void {
    this.sSel.set(s);
    this.sEdit = { dia: s.dia, inicio: hora(s.inicio), duracionMin: s.duracionMin, pesajeInicio: hora(s.pesajeInicio), pesajeFin: hora(s.pesajeFin) };
    this.sesionOpen.set(true);
  }
  protected async guardarSesion(): Promise<void> {
    const s = this.sSel();
    if (!s) return;
    const e = this.sEdit;
    const cambiaHora = e.inicio !== hora(s.inicio) || e.dia !== s.dia;
    const pesajeTocado = e.pesajeInicio !== hora(s.pesajeInicio) || e.pesajeFin !== hora(s.pesajeFin);
    const body = { dia: e.dia, inicio: e.inicio, duracionMin: +e.duracionMin, ...(pesajeTocado || !cambiaHora ? { pesajeInicio: e.pesajeInicio, pesajeFin: e.pesajeFin } : {}) };
    if (await this.run(() => this.api.editarSesion(this.cid(), s.id, body), 'Sesión guardada')) {
      this.sesionOpen.set(false);
      if (e.dia !== this.dia()) this.dia.set(e.dia);
    }
  }
  protected async borrarSesion(): Promise<void> {
    const s = this.sSel();
    if (!s || !(await this.confirm.ask({ title: `Borrar la sesión de las ${hora(s.inicio)}`, text: `Sus ${this.activos(s)} atletas quedarán sin sesión.`, confirm: 'Borrar', danger: true }))) return;
    if (await this.run(() => this.api.borrarSesion(this.cid(), s.id), 'Sesión borrada')) this.sesionOpen.set(false);
  }

  // ---- date settings ----
  protected abrirDia(): void {
    const b = this.raw();
    if (!b) return;
    const d = b.config.dias.find((x) => x.fecha === this.dia()) ?? { fecha: this.dia(), inicio: '09:00', fin: '21:00' };
    this.dEditDia = { fecha: d.fecha, inicio: d.inicio, fin: d.fin, puertas: d.puertas ?? '', pausaInicio: d.pausaInicio ?? '', pausaFin: d.pausaFin ?? '' };
    this.notas = (d.notas ?? []).join('\n');
    this.agendaDia = b.agenda.filter((a) => a.dia === d.fecha).map((a) => ({ ...a }));
    const c = b.config;
    this.reglas = { maxPorSesion: c.maxPorSesion, minPorAtleta: c.minPorAtleta, descansoMin: c.descansoMin, pesajeAntesMin: c.pesajeAntesMin, pesajeDuracionMin: c.pesajeDuracionMin, mesasPesaje: c.mesasPesaje };
    this.diaOpen.set(true);
  }
  protected async guardarDia(): Promise<void> {
    const b = this.raw();
    if (!b) return;
    const e = this.dEditDia;
    const dia = { fecha: e.fecha, inicio: e.inicio, fin: e.fin, puertas: e.puertas, pausaInicio: e.pausaInicio, pausaFin: e.pausaFin, notas: this.notas.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6) };
    const dias = b.config.dias.some((d) => d.fecha === e.fecha) ? b.config.dias.map((d) => (d.fecha === e.fecha ? dia : d)) : [...b.config.dias, dia];
    const r = this.reglas;
    const cfg: Config = { dias, maxPorSesion: +r.maxPorSesion, minPorAtleta: +r.minPorAtleta, descansoMin: +r.descansoMin, pesajeAntesMin: +r.pesajeAntesMin, pesajeDuracionMin: +r.pesajeDuracionMin, mesasPesaje: +r.mesasPesaje };
    if (!(await this.run(() => this.api.config(this.cid(), cfg)))) return;
    const items = [...(this.raw()?.agenda ?? []).filter((a) => a.dia !== e.fecha), ...this.agendaDia.filter((a) => a.titulo.trim()).map((a) => ({ ...a, dia: e.fecha, titulo: a.titulo.trim() }))];
    if (await this.run(() => this.api.agenda(this.cid(), items), 'Ajustes guardados')) this.diaOpen.set(false);
  }

  // ---- publish ----
  protected async abrirPublicar(): Promise<void> {
    try {
      const d = await this.api.diff(this.cid());
      this.avisarAtletas.set(d.afectados > 0);
      this.avisarSeguidores.set(false);
      this.pub.set(d);
    } catch (e) {
      this.toasts.error('No se pudo preparar la publicación', errText(e));
    }
  }
  protected async publicar(): Promise<void> {
    this.publicando.set(true);
    try {
      const r = await this.api.publicar(this.cid(), this.avisarAtletas(), this.avisarSeguidores());
      this.pub.set(null);
      this.movimiento.set(null);
      this.toasts.success(`Horarios v${r.version} publicados`, r.avisos + r.seguidores ? `${r.avisos} avisos a atletas · ${r.seguidores} a seguidores (se envían en unos minutos).` : 'Sin avisos por email.');
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo publicar', errText(e));
      if (e instanceof HttpErrorResponse && e.status === 409) {
        this.pub.set(null);
        await this.cargar();
      }
    } finally {
      this.publicando.set(false);
    }
  }
  protected async despublicar(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Retirar los horarios de la web', text: 'La web volverá a «Horarios próximamente» y las fichas de los atletas quedarán sin horario. No se avisa a nadie.', confirm: 'Retirar', danger: true }))) return;
    try {
      await this.api.despublicar(this.cid());
      this.historialOpen.set(false);
      this.toasts.success('Horarios retirados de la web');
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo retirar', errText(e));
    }
  }
  protected abrirHistorial(): void {
    void this.cargarVersiones();
    this.historialOpen.set(true);
  }
  protected async restaurar(v: VersionInfo): Promise<void> {
    if (!(await this.confirm.ask({ title: `Llevar v${v.numero} al borrador`, text: 'El borrador actual se sustituye por esa versión. La web no cambia hasta que publiques.', confirm: 'Llevar al borrador' }))) return;
    if (await this.run(() => this.api.restaurar(this.cid(), v.numero), `v${v.numero} en el borrador`)) this.historialOpen.set(false);
  }
}
