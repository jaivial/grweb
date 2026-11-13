import { A11yModule } from '@angular/cdk/a11y';
import { CdkDrag, CdkDragHandle, CdkDropList, CdkDropListGroup, moveItemInArray, transferArrayItem, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSkeleton, GrSpinner, GrToasts, type GrIconName, type GrTone, GrSelect } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, errText } from '../../shared/ui';
import { SolicitudesApi } from '../atletas/solicitudes-api';
import { HorariosApi, cat, diaCorto, diaLargo, hora, kg, type AgendaItem, type Borrador, type Config, type Diff, type Flight, type FlightAtleta, type VersionInfo } from './api';

interface Lista { id: string | null; atletas: FlightAtleta[] }
interface Movimiento { nombre: string; de: string; a: string; texto: string; deshacer: { id: string; atletas: string[] }[] }
type Vista = 'dia' | 'pesajes' | 'conflictos';

const PRUEBAS = ['aep2', 'aep3'];
const nombrePrueba = (p: string) => (p ? p.toUpperCase().replace('AEP', 'AEP-') : 'Sin competición');
/** One day per competition when the event has two days (AEP-2 the first, AEP-3 the second), as in the alta. */
const diaDePrueba = (dias: { fecha: string }[], p: string) => (dias.length >= PRUEBAS.length ? (dias[PRUEBAS.indexOf(p)]?.fecha ?? '') : '');
/** «Femenino −47 / −52 / −57 kg» → «Femenino −47/−52/−57» (planner card, Figma 96:20519). */
const tituloCorto = (t: string) => t.replace(/ kg$/, '').replaceAll(' / ', '/');

const diaDePruebaCorto = (f: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')).replace(/\./g, '').replace(',', '');

const ICONOS: { v: string; label: string }[] = [
  { v: 'door', label: 'Puertas' }, { v: 'trophy', label: 'Premios' }, { v: 'gift', label: 'Sorteo' }, { v: 'clock', label: 'Hora' },
  { v: 'ticket', label: 'Entradas' }, { v: 'users', label: 'Público' }, { v: 'info', label: 'Info' }, { v: 'camera', label: 'Fotos' },
];

/** «Horarios y flights» (Figma page 56): planner with drag and drop, conflicts, weigh-ins, versions and publishing with notices. */
@Component({
  selector: 'bo-horarios',
  imports: [GrSelect, FormsModule, RouterLink, DatePipe, A11yModule, CdkDropListGroup, CdkDropList, CdkDrag, CdkDragHandle, BoPageHeader, BoDrawer, BoToggle,
    GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSkeleton, GrSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .cdk-drag-preview { box-sizing: border-box; border-radius: 6px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.5); }
    .cdk-drag-placeholder { opacity: 0.35; }
    .cdk-drag-animating, .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
    .col.cdk-drop-list-receiving { border-style: dashed; border-color: var(--color-accent); }
  `,
  template: `
    @let b = data();
    <div class="mx-auto flex max-w-[1400px] flex-col gap-5 pb-24">
      <bo-page-header title="Horarios y flights" [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Horarios y flights']" [badge]="estado().label" [badgeTone]="estado().tone">
        @if (b) {
          <ng-container actions>
          <button grButton variant="ghost" icon="history" (click)="abrirHistorial()">Historial</button>
          <button grButton icon="eye" (click)="preview.set(true)" [disabled]="!b.flights.length">Vista previa</button>
          @if (canEdit()) {
            <button grButton variant="primary" icon="send" (click)="abrirPublicar()" [disabled]="!b.flights.length || (b.publicado && !b.cambiosSinPublicar)">Publicar v{{ siguiente() }}{{ sufijo() }}</button>
          }
          </ng-container>
        }
      </bo-page-header>

      @if (pruebas().length) {
        <!-- Competition switcher (Figma 219:167365): each competition has its own day, flights and generation. -->
        <div class="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="text-body-xs text-text-tertiary" id="comp-l">Competición</span>
          <div class="flex max-w-full gap-1 overflow-x-auto rounded-md border border-line-subtle bg-bg-card p-1 [scrollbar-width:none]" role="radiogroup" aria-labelledby="comp-l">
            @for (p of pruebas(); track p.v) {
              <button type="button" role="radio" [attr.aria-checked]="prueba() === p.v" (click)="elegirPrueba(p.v)"
                class="h-9 shrink-0 rounded-sm px-3 text-label-s transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
                [class]="prueba() === p.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary hover:text-text-primary'">{{ etiquetaPrueba(p) }}</button>
            }
          </div>
          <button type="button" class="inline-flex h-11 items-center px-2 text-label-s text-text-secondary hover:text-text-primary hover:underline" (click)="abrirCompeticiones()">Gestionar competiciones</button>
          @if (sinCompeticion()) { <span class="text-body-xs text-text-tertiary">{{ sinCompeticion() }} atleta{{ sinCompeticion() === 1 ? '' : 's' }} sin competición · no entran en ningún planificador</span> }
        </div>
      }

      @if (conflictoEdicion()) {
        <gr-alert tone="warning" title="Otra persona ha cambiado los horarios">Hemos recargado el planificador con sus cambios; repite el último movimiento si hace falta.</gr-alert>
      }
      @if (otraComp(); as o) {
        <gr-alert tone="warning" title="Atleta de otra competición">{{ o.texto }}
          @if (o.atleta) { <a alertAction class="mt-1 inline-flex items-center gap-1 text-label-s text-warning hover:underline" [routerLink]="['../atletas', o.atleta]">Abrir ficha <gr-icon name="arrow-right" [size]="14" /></a> }
        </gr-alert>
      }

      @if (b === undefined) {
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6" aria-busy="true">
          <h2 class="text-ui-h4">Cargando el horario{{ pruebaSel() ? ' de ' + pruebaSel()!.label : '' }}…</h2>
          <div class="mt-4 grid gap-4 md:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-64 rounded-lg" /> }</div>
        </section>
      } @else if (b === null) {
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
          <h2 class="text-ui-h4">Error al cargar</h2>
          <gr-alert tone="danger" class="mt-4" [title]="'No se pudo cargar el horario' + (pruebaSel() ? ' de ' + pruebaSel()!.label : '')">Comprueba la conexión. Tus cambios ya guardados no se pierden.
            <button alertAction type="button" class="mt-1 inline-flex items-center gap-1 text-label-s text-accent-text hover:underline" (click)="cargar()">Reintentar <gr-icon name="arrow-right" [size]="14" /></button>
          </gr-alert>
        </section>
      } @else {
        <!-- Day / weigh-in / conflicts tabs -->
        <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Días">
          @for (d of dias(); track d.fecha) {
            <button type="button" (click)="vista.set('dia'); dia.set(d.fecha)" [attr.aria-current]="vista() === 'dia' && dia() === d.fecha ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s first-letter:uppercase"
              [class]="vista() === 'dia' && dia() === d.fecha ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
              <span class="first-letter:uppercase">{{ diaCorto(d.fecha) }}</span><span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ d.n }}</span>
              @if (vista() === 'dia' && dia() === d.fecha) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
          @for (t of otras; track t.v) {
            <button type="button" (click)="vista.set(t.v)" [attr.aria-current]="vista() === t.v ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s"
              [class]="vista() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
              {{ t.label }}
              @if (t.v === 'conflictos' && b.conflictos.length) { <span class="rounded-2xs px-1.5 text-mono-xs" [class]="bloqueantes() ? 'bg-accent-deep/60 text-accent-text' : 'bg-bg-raised'">{{ b.conflictos.length }}</span> }
              @if (vista() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
        </nav>

        @switch (vista()) {
          @case ('dia') {
            <!-- Toolbar -->
            <div class="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 xl:flex-nowrap [&>*]:shrink-0">
              @if (canEdit() && prueba()) { <button grButton icon="zap" (click)="generar()">Generar automáticamente</button> }
              @if (canEdit()) { <button grButton variant="ghost" icon="plus" (click)="nuevoFlight()">Flight</button> }
              <gr-select tipo="filtro" etiqueta="Máximo" [resaltar]="false" [ngModel]="b.config.maxPorFlight" (ngModelChange)="ajustar({ maxPorFlight: +$event })" [disabled]="!canEdit()" aria-label="Máximo por flight">
                @for (n of maximos; track n) { <option [value]="n">{{ n }} por flight</option> }
              </gr-select>
              <gr-select tipo="filtro" etiqueta="Plataformas" [resaltar]="false" [ngModel]="b.config.plataformas" (ngModelChange)="ajustar({ plataformas: +$event })" [disabled]="!canEdit()" aria-label="Plataformas">
                @for (n of [1, 2, 3, 4]; track n) { <option [value]="n">{{ n }}</option> }
              </gr-select>
              <gr-select tipo="filtro" etiqueta="Orden" [resaltar]="false" [ngModel]="b.config.orden" (ngModelChange)="ajustar({ orden: $event })" [disabled]="!canEdit()" aria-label="Orden">
                <option value="total">total previsto</option><option value="categoria">categoría y apellidos</option>
              </gr-select>
              <button type="button" class="ml-auto inline-flex h-10 items-center px-1 text-body-xs text-text-tertiary hover:text-text-primary hover:underline" (click)="abrirDia()">
                {{ diaCfg()?.pausaInicio ? 'Pausa comida ' + diaCfg()!.pausaInicio + '–' + diaCfg()!.pausaFin : 'Ajustes del día' }}
              </button>
            </div>

            <div class="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div class="flex min-w-0 flex-col gap-4">
                <div cdkDropListGroup class="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
                  @if (b.sinFlight.length) {
                    <section class="col flex w-64 shrink-0 flex-col rounded-lg border border-line-strong bg-bg-surface p-3 xl:w-48" cdkDropList [cdkDropListData]="sinFlightLista()" (cdkDropListDropped)="drop($event)" [cdkDropListDisabled]="!canEdit()" aria-label="Atletas sin flight">
                      <header><p class="text-label-m">Sin flight</p><p class="text-body-xs text-text-tertiary">{{ b.sinFlight.length }} atletas · arrástralos a un flight</p></header>
                      <ul class="mt-3 flex max-h-[520px] min-h-16 flex-col gap-1.5 overflow-y-auto">
                        @for (a of b.sinFlight; track a.id) { <li cdkDrag [cdkDragData]="a" class="group relative flex items-center gap-2 rounded-md border border-line-subtle bg-bg-card px-2 py-1.5">
                          <span cdkDragHandle class="cursor-grab text-text-muted"><gr-icon name="grip" [size]="16" /></span>
                          <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ a.nombre }}</span><span class="block text-body-xs text-text-tertiary">{{ a.sexo }} {{ cat(a.categoria) }}{{ a.totalPrevisto ? ' · tot. prev. ' + kg(a.totalPrevisto) : '' }}</span></span>
                          @if (canEdit()) { <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary md:absolute md:top-1/2 md:right-1 md:size-8 md:-translate-y-1/2 md:bg-bg-card md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" [attr.aria-label]="'Mover a ' + a.nombre" [title]="'Mover a ' + a.nombre" (click)="abrirMover(a, null)"><gr-icon name="arrow-right" [size]="16" /></button> }
                        </li> }
                      </ul>
                    </section>
                  }
                  @for (f of flightsDia(); track f.id) {
                    <section [id]="'flight-' + f.codigo" class="col flex w-64 shrink-0 xl:w-48 flex-col rounded-lg border bg-bg-card p-3 transition-colors"
                      [class]="tieneBloqueo(f) ? 'border-warning/70' : 'border-line-subtle'"
                      cdkDropList [cdkDropListData]="lista(f)" (cdkDropListDropped)="drop($event)" [cdkDropListDisabled]="!canEdit()" [attr.aria-label]="'Flight ' + f.codigo">
                      <header class="flex items-start gap-2">
                        <div class="min-w-0 flex-1">
                          <p class="flex items-baseline justify-between gap-2"><span class="text-label-m">Flight {{ f.codigo }}</span><span class="font-mono text-label-s text-accent-text">{{ hora(f.inicio) }}</span></p>
                          <p class="text-body-xs text-text-tertiary">{{ tituloCorto(f.titulo) }} · <span [class.text-accent-text]="activos(f) > b.config.maxPorFlight">{{ activos(f) }}/{{ b.config.maxPorFlight }}</span></p>
                          <p class="text-body-xs text-text-tertiary">Pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}{{ b.config.plataformas > 1 ? ' · Plat. ' + f.plataforma : '' }}</p>
                        </div>
                        <button grIconButton icon="pencil" [label]="'Editar flight ' + f.codigo" (click)="abrirFlight(f)"></button>
                      </header>
                      @for (a of f.avisos.slice(0, 1); track a) { <p class="mt-2 flex items-start gap-1.5 rounded-sm bg-warning/10 px-2 py-1.5 text-body-xs text-warning"><gr-icon name="triangle-alert" [size]="12" class="mt-0.5 shrink-0" />{{ a }}</p> }
                      @if (f.directo.estado !== 'programado' || f.directo.retrasoMin) {
                        <p class="mt-2 flex gap-1.5">
                          @if (f.directo.estado === 'en_curso') { <gr-badge tone="accent">En curso</gr-badge> } @else if (f.directo.estado === 'finalizado') { <gr-badge>Finalizado</gr-badge> }
                          @if (f.directo.retrasoMin) { <gr-badge tone="warning">+{{ f.directo.retrasoMin }} min</gr-badge> }
                        </p>
                      }
                      <ul class="mt-3 flex max-h-[520px] min-h-16 flex-col gap-1.5 overflow-y-auto">
                        @for (a of f.atletas; track a.id) {
                          <li cdkDrag [cdkDragData]="a" [cdkDragDisabled]="a.baja" class="group relative flex items-center gap-2 rounded-md border px-2 py-1.5" [class]="a.baja ? 'border-accent/40 bg-accent-deep/20' : 'border-line-subtle bg-bg-raised'">
                            <span cdkDragHandle class="cursor-grab text-text-muted"><gr-icon name="grip" [size]="16" /></span>
                            <span class="min-w-0 flex-1">
                              <span class="block truncate text-label-s" [class.line-through]="a.baja">{{ a.nombre }}</span>
                              <span class="block text-body-xs text-text-tertiary">{{ a.baja ? 'Ya no está confirmado' : cat(a.categoria) + ' · tot. prev. ' + kg(a.totalPrevisto) }}</span>
                            </span>
                            @if (canEdit() && !a.baja) { <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary md:absolute md:top-1/2 md:right-1 md:size-8 md:-translate-y-1/2 md:bg-bg-card md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" [attr.aria-label]="'Mover a ' + a.nombre" [title]="'Mover a ' + a.nombre" (click)="abrirMover(a, f)"><gr-icon name="arrow-right" [size]="16" /></button> }
                          </li>
                        } @empty { <li class="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-body-xs text-text-tertiary">Suelta aquí atletas</li> }
                      </ul>
                    </section>
                  } @empty {
                    @if (b.flights.length) {
                      <p class="rounded-lg border border-line-subtle bg-bg-card px-6 py-10 text-body-s text-text-tertiary">No hay flights este día.</p>
                    } @else {
                      <!-- Empty competition (Figma 219:167365): tabs and toolbar stay; generate or create a flight -->
                      <section class="min-w-[280px] flex-1 rounded-lg border border-line-subtle bg-bg-card p-6">
                        @if (b.atletas) {
                          <h2 class="text-ui-h4">Aún no hay flights{{ pruebaSel() ? ' en ' + pruebaSel()!.label : '' }}</h2>
                          <p class="mt-1 max-w-xl text-body-xs text-text-tertiary">
                            @if (pruebaSel()?.v) { {{ b.atletas }} atleta{{ b.atletas === 1 ? '' : 's' }} de {{ pruebaSel()!.label }} esperando flight. Se generan solo con los atletas que eligieron {{ pruebaSel()!.label }} y con las reglas y días de esta competición. }
                            @else { {{ b.atletas }} atleta{{ b.atletas === 1 ? '' : 's' }} confirmado{{ b.atletas === 1 ? '' : 's' }}. Los repartimos en flights de {{ b.config.maxPorFlight }} por sexo, categoría y total previsto. }
                          </p>
                          @if (canEdit()) {
                            <div class="mt-4 flex flex-wrap gap-2">
                              @if (prueba()) { <button grButton variant="primary" (click)="generar()">Generar automáticamente</button> }
                              <button grButton (click)="nuevoFlight()">Crear flight vacío</button>
                            </div>
                          }
                        } @else {
                          <h2 class="text-ui-h4">Primero importa a los atletas</h2>
                          <p class="mt-1 max-w-xl text-body-xs text-text-tertiary">Los flights se generan a partir del acta de la AEP (categoría, sexo y total previsto).</p>
                          <div class="mt-4 flex flex-wrap gap-2">
                            <a grButton variant="primary" routerLink="../atletas/importar">Importar acta AEP</a>
                            @if (canEdit()) { <button grButton (click)="nuevoFlight()">Crear flight vacío</button> }
                          </div>
                        }
                      </section>
                    }
                  }
                </div>

                @if (movimiento(); as m) {
                  <div class="flex flex-col gap-2 rounded-md border border-info/40 bg-info/10 p-4 md:flex-row md:items-center">
                    <gr-icon name="info" [size]="18" class="shrink-0 text-info" />
                    <div class="min-w-0 flex-1"><p class="text-label-s text-info">Al mover a {{ m.nombre }} de {{ m.de }} a {{ m.a }}</p><p class="text-body-s text-text-secondary">{{ m.texto }}</p></div>
                    <button grButton variant="ghost" size="s" icon="undo" (click)="deshacer()">Deshacer</button>
                  </div>
                }
              </div>

              <aside class="flex flex-col gap-4">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
                  <h2 class="text-ui-h5">Conflictos</h2>
                  <p class="text-body-xs text-text-tertiary">{{ bloqueantes() ? bloqueantes() + ' a resolver antes de publicar' : 'Nada que bloquee la publicación' }}</p>
                  <ul class="mt-3 flex flex-col gap-2">
                    @for (c of b.conflictos.slice(0, 5); track $index) {
                      <li class="rounded-md border p-3" [class]="c.bloquea ? 'border-accent/50 bg-accent-deep/20' : 'border-warning/40 bg-warning/5'">
                        <p class="flex items-start gap-2 text-label-s" [class]="c.bloquea ? 'text-accent-text' : 'text-warning'"><gr-icon [name]="c.bloquea ? 'circle-x' : 'triangle-alert'" [size]="14" class="mt-0.5 shrink-0" />{{ c.titulo }}</p>
                        <p class="mt-1 pl-5 text-body-xs text-text-secondary">{{ c.detalle }}</p>
                        @if (c.flight) { <button type="button" class="mt-1 pl-5 text-label-s text-accent-text hover:underline" (click)="irA(c.flight)">Ver flight {{ c.flight }} →</button> }
                      </li>
                    } @empty { <li class="flex items-center gap-2 text-body-s text-success"><gr-icon name="circle-check" [size]="16" />Sin conflictos</li> }
                    @if (b.conflictos.length > 5) { <li><button type="button" class="text-label-s text-accent-text" (click)="vista.set('conflictos')">Ver los {{ b.conflictos.length }}</button></li> }
                  </ul>
                </section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
                  <h2 class="text-ui-h5">Versiones{{ sufijo() }}</h2>
                  <ul class="mt-3 flex flex-col">
                    @if (b.cambiosSinPublicar) {
                      <li class="flex items-center justify-between gap-2 border-b border-line-subtle py-2 text-body-s"><span class="text-label-s">v{{ siguiente() }}{{ sufijo() }} · borrador</span><span class="text-body-xs text-text-tertiary">sin publicar</span></li>
                    }
                    @for (v of versiones().slice(0, 4); track v.numero) {
                      <li class="flex items-center justify-between gap-2 border-b border-line-subtle py-2 last:border-0">
                        <span class="text-label-s" [class.text-text-tertiary]="v.estado !== 'publicada'">{{ verLabel(v) }} · {{ v.estado }}</span>
                        <span class="text-right text-body-xs text-text-tertiary">{{ v.at | date: 'dd/MM HH:mm' }}{{ v.avisos + v.seguidores ? ' · ' + (v.avisos + v.seguidores) + ' avisos' : '' }}</span>
                      </li>
                    } @empty { <li class="text-body-s text-text-tertiary">Todavía no se ha publicado.</li> }
                  </ul>
                </section>
              </aside>
            </div>
          }

          @case ('pesajes') {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[640px] text-left text-body-s">
                <thead class="text-mono-xs text-text-tertiary"><tr class="border-b border-line-subtle"><th class="px-4 py-3">Flight</th><th class="px-4 py-3">Día</th><th class="px-4 py-3">Pesaje</th><th class="px-4 py-3">Sale a plataforma</th><th class="px-4 py-3">Atletas</th><th class="px-4 py-3"></th></tr></thead>
                <tbody>
                  @for (f of b.flights; track f.id) {
                    <tr class="border-b border-line-subtle last:border-0">
                      <td class="px-4 py-3 text-label-s">Flight {{ f.codigo }}<span class="block text-body-xs text-text-tertiary">{{ f.titulo }}</span></td>
                      <td class="px-4 py-3 first-letter:uppercase">{{ diaCorto(f.dia) }}</td>
                      <td class="px-4 py-3 font-mono">{{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}</td>
                      <td class="px-4 py-3 font-mono">{{ hora(f.inicio) }} · plat. {{ f.plataforma }}</td>
                      <td class="px-4 py-3">{{ activos(f) }}</td>
                      <td class="px-4 py-3">@if (pesajeSolapado(f)) { <gr-badge tone="warning">Solapa</gr-badge> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
            <p class="text-body-xs text-text-tertiary">{{ b.config.mesasPesaje }} mesa(s) de pesaje · abre {{ b.config.pesajeAntesMin }} min antes del flight y dura {{ b.config.pesajeDuracionMin }} min (reglamento IPF: 2 h antes, 1 h 30 min).</p>
          }

          @case ('conflictos') {
            <section class="flex flex-col gap-2">
              @for (c of b.conflictos; track $index) {
                <div class="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center" [class]="c.bloquea ? 'border-accent/50 bg-accent-deep/20' : 'border-line-subtle bg-bg-card'">
                  <gr-icon [name]="c.bloquea ? 'circle-x' : 'triangle-alert'" [size]="18" [class]="c.bloquea ? 'text-accent-text' : 'text-warning'" />
                  <div class="min-w-0 flex-1"><p class="text-label-m">{{ c.titulo }}</p><p class="text-body-s text-text-secondary">{{ c.detalle }}</p></div>
                  <gr-badge [tone]="c.bloquea ? 'danger' : 'warning'">{{ c.bloquea ? 'Bloquea' : 'Aviso' }}</gr-badge>
                  @if (c.flight) { <button grButton size="s" (click)="irA(c.flight)">Ver flight {{ c.flight }}</button> }
                </div>
              } @empty { <gr-empty icon="circle-check" title="Sin conflictos" text="Puedes publicar cuando quieras." /> }
            </section>
          }
        }
      }
    </div>

    <!-- Generating -->
    @if (generando()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
        <div class="w-full max-w-sm rounded-lg border border-line-strong bg-bg-raised p-6 text-center shadow-card" role="alertdialog" aria-modal="true" aria-label="Generando flights">
          <h2 class="text-left text-ui-h5">Generando flights…</h2>
          <gr-spinner class="mt-6" [size]="28" />
          <p class="mt-4 text-body-s text-text-secondary">Repartiendo {{ data()?.atletas }} atletas en flights de {{ data()?.config?.maxPorFlight }}…</p>
        </div>
      </div>
    }

    <!-- Publish -->
    @if (pub(); as d) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" (click)="pub.set(null)">
        <div class="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-xl border border-line-strong bg-bg-raised shadow-card sm:rounded-lg" role="dialog" aria-modal="true" aria-label="Publicar horarios" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <header class="flex items-center gap-3 border-b border-line-subtle px-6 py-4"><h2 class="flex-1 text-ui-h5">Publicar v{{ d.siguiente }}{{ sufijo() }}</h2><button grIconButton icon="x" label="Cerrar" (click)="pub.set(null)"></button></header>
          <div class="flex-1 overflow-y-auto px-6 py-5">
            @if (d.prueba) { <p class="mb-4 text-body-xs text-text-tertiary">Solo se publica {{ pruebaSel()?.label }}: la otra competición sigue como está publicada y nadie de ella recibe avisos.</p> }
            @if (d.bloqueantes) { <gr-alert tone="danger" class="mb-4" [title]="'Hay ' + d.bloqueantes + ' conflictos que bloquean la publicación'">Resuélvelos en el planificador (en rojo) y vuelve a intentarlo.</gr-alert> }
            @if (d.primera) {
              <p class="text-body-s text-text-secondary">Primera publicación: <strong class="text-text-primary">{{ d.atletas }} atletas</strong> recibirán su flight, plataforma y hora de pesaje en su ficha y en su área.</p>
            } @else {
              <p class="text-body-s text-text-secondary">{{ d.cambios.length }} {{ d.cambios.length === 1 ? 'cambio' : 'cambios' }} respecto a la versión publicada (v{{ d.desde }}{{ sufijo() }}):</p>
              <div class="mt-3 overflow-x-auto rounded-md border border-line-subtle">
                <table class="w-full min-w-[480px] text-left text-body-s">
                  <thead class="text-mono-xs text-text-tertiary"><tr class="border-b border-line-subtle"><th class="px-3 py-2">Atleta</th><th class="px-3 py-2">Antes</th><th class="px-3 py-2">Después</th><th class="px-3 py-2">Aviso</th></tr></thead>
                  <tbody>
                    @for (c of d.cambios; track $index) {
                      <tr class="border-b border-line-subtle last:border-0">
                        <td class="px-3 py-2 text-label-s">{{ c.titulo }}</td><td class="px-3 py-2 font-mono text-text-tertiary">{{ c.antes }}</td><td class="px-3 py-2 font-mono">{{ c.despues }}</td>
                        <td class="px-3 py-2">@if (c.tipo !== 'agenda' && avisarAtletas()) { <gr-badge tone="info">Email</gr-badge> } @else { <span class="text-text-muted">—</span> }</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            <div class="mt-5 flex flex-col divide-y divide-line-subtle rounded-md border border-line-subtle">
              <div class="flex items-center gap-3 px-4 py-2">
                <div class="min-w-0 flex-1"><p class="text-label-s">Avisar a los {{ d.afectados }} atletas afectados</p><p class="text-body-xs text-text-tertiary">Plantilla «{{ d.primera ? 'Tu horario' : 'Cambio en tu horario' }}» · también en su área · {{ d.conEmail }} con email</p></div>
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

    <!-- Flight drawer -->
    <bo-drawer [(open)]="flightOpen" [title]="'Flight ' + (fSel()?.codigo ?? '')">
      @if (fSel(); as f) {
        <div class="flex flex-col gap-4">
          <p class="text-body-s text-text-secondary">{{ f.titulo }} · {{ activos(f) }} atletas</p>
          <div class="grid grid-cols-2 gap-3">
            <gr-field label="Día" for="f-dia"><gr-select id="f-dia" [(ngModel)]="fEdit.dia" [disabled]="!canEdit()">@for (d of data()?.config?.dias ?? []; track d.fecha) { <option [value]="d.fecha">{{ diaLargo(d.fecha) }}</option> }</gr-select></gr-field>
            <gr-field label="Plataforma" for="f-pl"><gr-select id="f-pl" [ngModel]="fEdit.plataforma" (ngModelChange)="fEdit.plataforma = +$event" [disabled]="!canEdit()">@for (n of [1, 2, 3, 4]; track n) { <option [value]="n">{{ n }}</option> }</gr-select></gr-field>
            <gr-field label="Sale a plataforma" for="f-ini"><input grInput id="f-ini" type="time" step="300" [(ngModel)]="fEdit.inicio" [disabled]="!canEdit()" /></gr-field>
            <gr-field label="Duración (min)" for="f-dur"><input grInput id="f-dur" type="number" min="10" max="600" step="5" [(ngModel)]="fEdit.duracionMin" [disabled]="!canEdit()" /></gr-field>
            <gr-field label="Pesaje desde" for="f-pi"><input grInput id="f-pi" type="time" step="300" [(ngModel)]="fEdit.pesajeInicio" [disabled]="!canEdit()" /></gr-field>
            <gr-field label="Pesaje hasta" for="f-pf"><input grInput id="f-pf" type="time" step="300" [(ngModel)]="fEdit.pesajeFin" [disabled]="!canEdit()" /></gr-field>
          </div>
          <p class="text-body-xs text-text-tertiary">Si cambias la hora y no tocas el pesaje, el pesaje se recalcula ({{ data()?.config?.pesajeAntesMin }} min antes, {{ data()?.config?.pesajeDuracionMin }} min).</p>
          @if (canDirecto() && enPublicada(f)) {
            <section class="mt-2 rounded-md border border-line-subtle p-4">
              <h3 class="text-label-m">En directo</h3>
              <p class="text-body-xs text-text-tertiary">Se ve al momento en /horarios. El día del evento lo lleva la mesa de Directo.</p>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <gr-field label="Estado" for="d-e"><gr-select id="d-e" [(ngModel)]="dEdit.estado"><option value="programado">Programado</option><option value="en_curso">En curso</option><option value="finalizado">Finalizado</option></gr-select></gr-field>
                <gr-field label="Retraso (min)" for="d-r"><input grInput id="d-r" type="number" min="0" max="600" step="5" [(ngModel)]="dEdit.retrasoMin" /></gr-field>
              </div>
              <button grButton size="s" class="mt-3" [loading]="guardando()" (click)="guardarDirecto(f)">Actualizar directo</button>
            </section>
          }
        </div>
      }
      @if (canEdit()) {
        <ng-container drawerActions>
          <button grButton variant="danger" icon="trash" class="mr-auto" (click)="borrarFlight()">Borrar</button>
          <button grButton variant="ghost" (click)="flightOpen.set(false)">Cancelar</button>
          <button grButton variant="primary" [loading]="guardando()" (click)="guardarFlight()">Guardar</button>
        </ng-container>
      }
    </bo-drawer>

    <!-- Day settings drawer -->
    <bo-drawer [(open)]="diaOpen" [title]="'Ajustes · ' + diaLargo(dEditDia.fecha || dia())">
      <div class="flex flex-col gap-5">
        <section class="grid grid-cols-2 gap-3">
          <gr-field label="Primer flight" for="a-ini"><input grInput id="a-ini" type="time" [(ngModel)]="dEditDia.inicio" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Fin del día" for="a-fin"><input grInput id="a-fin" type="time" [(ngModel)]="dEditDia.fin" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Apertura de puertas" for="a-pu"><input grInput id="a-pu" type="time" [(ngModel)]="dEditDia.puertas" [disabled]="!canEdit()" /></gr-field>
          <span></span>
          <gr-field label="Pausa desde" for="a-pi"><input grInput id="a-pi" type="time" [(ngModel)]="dEditDia.pausaInicio" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Pausa hasta" for="a-pf"><input grInput id="a-pf" type="time" [(ngModel)]="dEditDia.pausaFin" [disabled]="!canEdit()" /></gr-field>
        </section>
        <gr-field label="Info del día (una por línea, se ve en /horarios)" for="a-no"><textarea grInput id="a-no" rows="3" [(ngModel)]="notas" [disabled]="!canEdit()"></textarea></gr-field>
        <section>
          <h3 class="text-label-m">Agenda del día</h3>
          <p class="text-body-xs text-text-tertiary">Momentos que salen entre los flights: puertas, premios, sorteo…</p>
          <ul class="mt-3 flex flex-col gap-2">
            @for (it of agendaDia; track $index) {
              <li class="grid grid-cols-[112px_minmax(0,1fr)_96px_44px] items-center gap-2">
                <input grInput type="time" [(ngModel)]="it.hora" aria-label="Hora" [disabled]="!canEdit()" />
                <input grInput [(ngModel)]="it.titulo" maxlength="120" aria-label="Qué pasa" [disabled]="!canEdit()" />
                <gr-select [(ngModel)]="it.icono" aria-label="Icono" [disabled]="!canEdit()">@for (i of iconos; track i.v) { <option [value]="i.v">{{ i.label }}</option> }</gr-select>
                @if (canEdit()) { <button grIconButton icon="trash" label="Quitar" (click)="agendaDia.splice($index, 1)"></button> }
              </li>
            }
          </ul>
          @if (canEdit()) { <button grButton variant="ghost" size="s" icon="plus" class="mt-2" (click)="agendaDia.push({ dia: dEditDia.fecha, hora: '19:00', titulo: '', icono: 'clock' })">Añadir momento</button> }
        </section>
        <section class="grid grid-cols-2 gap-3 border-t border-line-subtle pt-4">
          <h3 class="col-span-2 text-label-m">Reglas del planificador (todos los días)</h3>
          <gr-field label="Min. por atleta" for="r-m"><input grInput id="r-m" type="number" min="3" max="20" [(ngModel)]="reglas.minPorAtleta" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Descanso entre flights" for="r-d"><input grInput id="r-d" type="number" min="0" max="120" step="5" [(ngModel)]="reglas.descansoMin" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Pesaje: min antes" for="r-pa"><input grInput id="r-pa" type="number" min="30" max="240" step="5" [(ngModel)]="reglas.pesajeAntesMin" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Pesaje: duración" for="r-pd"><input grInput id="r-pd" type="number" min="15" max="180" step="5" [(ngModel)]="reglas.pesajeDuracionMin" [disabled]="!canEdit()" /></gr-field>
          <gr-field label="Mesas de pesaje" for="r-me"><input grInput id="r-me" type="number" min="1" max="4" [(ngModel)]="reglas.mesasPesaje" [disabled]="!canEdit()" /></gr-field>
          <label class="flex items-center gap-2 self-end text-body-s"><bo-toggle [(value)]="reglas.separarSexo" label="Separar por sexo" [disabled]="!canEdit()" />Separar por sexo</label>
        </section>
      </div>
      @if (canEdit()) {
        <ng-container drawerActions>
          <button grButton variant="ghost" (click)="diaOpen.set(false)">Cancelar</button>
          <button grButton variant="primary" [loading]="guardando()" (click)="guardarDia()">Guardar</button>
        </ng-container>
      }
    </bo-drawer>

    <!-- Move (keyboard / mobile) -->
    <bo-drawer [(open)]="moverOpen" [title]="'Mover a ' + (mSel()?.a?.nombre ?? '')">
      <ul class="flex flex-col gap-2">
        @for (f of data()?.flights ?? []; track f.id) {
          @if (f.id !== mSel()?.desde?.id) {
            @if (f.prueba === (mSel()?.a?.prueba ?? '')) {
            <li><button type="button" class="flex w-full items-center gap-3 rounded-md border border-line-subtle bg-bg-raised px-4 py-3 text-left hover:border-line-strong" (click)="mover(f)">
              <span class="min-w-0 flex-1"><span class="block text-label-m">Flight {{ f.codigo }} · {{ hora(f.inicio) }}</span><span class="block text-body-xs text-text-tertiary first-letter:uppercase">{{ diaCorto(f.dia) }} · {{ f.titulo }} · {{ activos(f) }}/{{ data()?.config?.maxPorFlight }}</span></span>
              <gr-icon name="arrow-right" [size]="16" />
            </button></li>
            }
          }
        }
        @if (mSel()?.desde) { <li><button type="button" class="w-full rounded-md border border-dashed border-line-strong px-4 py-3 text-left text-label-s text-text-secondary" (click)="mover(null)">Quitar del flight (sin flight)</button></li> }
      </ul>
    </bo-drawer>

    <!-- History -->
    <!-- Competitions of the event (Figma 219:167365 «Gestionar competiciones»): code, day and own places -->
    <bo-drawer [(open)]="compOpen" title="Gestionar competiciones">
      <div class="flex flex-col gap-5">
        @for (p of pruebas(); track p.v) {
          @if (p.v) {
            <section class="grid grid-cols-2 gap-3">
              <gr-field label="Código" [for]="'c-' + p.v"><input grInput [id]="'c-' + p.v" [value]="p.label" disabled /></gr-field>
              <gr-field label="Días" [for]="'d-' + p.v"><input grInput [id]="'d-' + p.v" [value]="p.dia ? diaLargo(p.dia) : 'Todos los días del evento'" disabled /></gr-field>
              <gr-field label="Plazas" [for]="'p-' + p.v"><input grInput [id]="'p-' + p.v" type="number" min="0" [(ngModel)]="cuposEdit[p.v]" [disabled]="!canEdit()" /></gr-field>
              <gr-field label="Cierre" [for]="'x-' + p.v"><a grButton variant="ghost" [id]="'x-' + p.v" routerLink="../atletas/inscripcion">Elección en Inscripción</a></gr-field>
            </section>
          }
        }
        <p class="text-body-xs text-text-tertiary">Los días salen de «Ajustes del día»: con dos días, AEP-2 compite el primero y AEP-3 el segundo.</p>
      </div>
      @if (canEdit()) {
        <ng-container drawerActions>
          <button grButton variant="ghost" (click)="compOpen.set(false)">Cancelar</button>
          <button grButton variant="primary" [loading]="guardando()" (click)="guardarCompeticiones()">Guardar</button>
        </ng-container>
      }
    </bo-drawer>

    <bo-drawer [(open)]="historialOpen" title="Historial de versiones">
      <ul class="flex flex-col gap-2">
        @for (v of versiones(); track v.numero) {
          <li class="rounded-md border border-line-subtle p-4">
            <p class="flex items-center gap-2"><span class="text-label-m">{{ verLabel(v) }}</span><gr-badge [tone]="v.estado === 'publicada' ? 'success' : 'neutral'">{{ v.estado }}</gr-badge></p>
            <p class="mt-1 text-body-xs text-text-tertiary">{{ v.at | date: 'dd/MM/yyyy HH:mm' }} · {{ v.por }} · {{ v.cambios }} cambios · {{ v.avisos }} avisos a atletas · {{ v.seguidores }} a seguidores</p>
            @if (canEdit()) { <button grButton size="s" variant="ghost" icon="undo" class="mt-2" (click)="restaurar(v)">Llevar al borrador</button> }
          </li>
        } @empty { <li class="text-body-s text-text-tertiary">Todavía no se ha publicado ninguna versión.</li> }
      </ul>
      @if (canEdit() && data()?.publicado) { <button drawerActions grButton variant="danger" (click)="despublicar()">Retirar de la web</button> }
    </bo-drawer>

    <!-- Preview -->
    <bo-drawer [(open)]="preview" title="Vista previa · /horarios (borrador)">
      <p class="text-mono-xs text-accent-text uppercase">{{ diaLargo(dia()) }}</p>
      <ul class="mt-3 flex flex-col gap-2">
        @for (r of previewDia(); track $index) {
          @if (r.flight; as f) {
            <li class="rounded-md border border-line-subtle bg-bg-raised p-3">
              <p class="flex items-baseline gap-3"><span class="font-mono text-ui-h5">{{ hora(f.inicio) }}</span><span class="text-label-m">Flight {{ f.codigo }} · {{ f.titulo }}</span></p>
              <p class="text-body-xs text-text-tertiary">Plataforma {{ f.plataforma }} · {{ activos(f) }} atletas · Pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}</p>
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
  protected readonly diaCorto = diaCorto;
  protected readonly diaLargo = diaLargo;
  protected readonly iconos = ICONOS;
  protected readonly maximos = [8, 10, 12, 13, 14, 15, 16, 18, 20];
  protected readonly otras: { v: Vista; label: string }[] = [{ v: 'pesajes', label: 'Pesajes' }, { v: 'conflictos', label: 'Conflictos' }];
  protected readonly tituloCorto = tituloCorto;
  private readonly solicitudes = inject(SolicitudesApi);
  /** Own places of each competition (Inscripción › cupos); without permission the selector shows the athletes. */
  protected readonly cupos = signal<Record<string, number>>({});
  protected cuposEdit: Record<string, number> = {};
  protected readonly compOpen = signal(false);
  /** 422 PRUEBA_DISTINTA: the athlete belongs to another competition (Figma 219:167365 «Atleta de otra competición»). */
  protected readonly otraComp = signal<{ texto: string; atleta: string } | null>(null);
  private moviendo = '';

  /** The whole draft as the API returns it; data() is the view of the selected competition (AEP-2 / AEP-3). */
  protected readonly raw = signal<Borrador | null | undefined>(undefined);
  protected readonly prueba = signal(PRUEBAS[0]);
  protected readonly pruebas = computed(() => {
    const b = this.raw();
    if (!b) return [];
    const n = new Map<string, number>();
    for (const a of [...b.sinFlight, ...b.flights.flatMap((f) => f.atletas)]) if (a.prueba && !a.baja) n.set(a.prueba, (n.get(a.prueba) ?? 0) + 1);
    const conFlights = new Set(b.flights.map((f) => f.prueba));
    if (!n.size && !PRUEBAS.some((p) => conFlights.has(p))) return [];
    const out = PRUEBAS.map((p) => ({ v: p, label: nombrePrueba(p), dia: diaDePrueba(b.config.dias, p), n: n.get(p) ?? 0, plazas: this.cupos()[p] as number | undefined }));
    // Flights whose athletes have no competition yet (created before AEP-2/AEP-3): still visible and editable here.
    if (conFlights.has('')) out.push({ v: '', label: nombrePrueba(''), dia: '', n: this.sinCompeticion(), plazas: undefined });
    return out;
  });
  protected readonly sinCompeticion = computed(() => {
    const b = this.raw();
    return b ? [...b.sinFlight, ...b.flights.flatMap((f) => f.atletas)].filter((a) => !a.prueba && !a.baja).length : 0;
  });
  protected readonly pruebaSel = computed(() => this.pruebas().find((p) => p.v === this.prueba()) ?? null);
  protected readonly data = computed<Borrador | null | undefined>(() => {
    const b = this.raw();
    const p = this.pruebaSel();
    if (!b || !p) return b;
    const flights = b.flights.filter((f) => f.prueba === p.v);
    const ids = new Set(flights.map((f) => f.id));
    const sinFlight = b.sinFlight.filter((a) => (a.prueba ?? '') === p.v);
    const dias = p.dia ? b.config.dias.filter((d) => d.fecha === p.dia) : b.config.dias;
    const conflictos = b.conflictos.filter((c) => (c.flightId ? ids.has(c.flightId) || (c.prueba ?? '') === p.v : c.tipo !== 'sin_flight' || sinFlight.length > 0));
    return { ...b, config: { ...b.config, dias }, flights, sinFlight, conflictos, atletas: p.n, cambiosSinPublicar: b.cambiosSinPublicar };
  });
  protected readonly versiones = signal<VersionInfo[]>([]);
  protected readonly vista = signal<Vista>('dia');
  protected readonly dia = signal('');
  protected readonly generando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly publicando = signal(false);
  protected readonly conflictoEdicion = signal(false);
  protected readonly movimiento = signal<Movimiento | null>(null);
  protected readonly pub = signal<Diff | null>(null);
  protected readonly avisarAtletas = signal(true);
  protected readonly avisarSeguidores = signal(false);
  protected readonly flightOpen = signal(false);
  protected readonly diaOpen = signal(false);
  protected readonly moverOpen = signal(false);
  protected readonly historialOpen = signal(false);
  protected readonly preview = signal(false);
  protected readonly fSel = signal<Flight | null>(null);
  protected readonly mSel = signal<{ a: FlightAtleta; desde: Flight | null } | null>(null);
  protected fEdit = { dia: '', plataforma: 1, inicio: '', duracionMin: 0, pesajeInicio: '', pesajeFin: '' };
  protected dEdit: { estado: 'programado' | 'en_curso' | 'finalizado'; retrasoMin: number } = { estado: 'programado', retrasoMin: 0 };
  protected dEditDia = { fecha: '', inicio: '', fin: '', puertas: '', pausaInicio: '', pausaFin: '' };
  protected notas = '';
  protected agendaDia: AgendaItem[] = [];
  protected reglas = { minPorAtleta: 7, descansoMin: 10, pesajeAntesMin: 120, pesajeDuracionMin: 90, mesasPesaje: 1, separarSexo: true };
  private ultimoRev = 0;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly canEdit = computed(() => this.auth.can(this.cid(), 'horarios.publicar'));
  protected readonly canDirecto = computed(() => this.canEdit() || this.auth.can(this.cid(), 'directo.operar'));
  /** Next version: of the selected competition («v1 · AEP-3»), or of the whole event in «Sin competición». */
  protected readonly siguiente = computed(() => {
    const p = this.prueba();
    if (p) return Math.max(0, ...this.versiones().filter((v) => v.prueba === p).map((v) => v.numeroPrueba)) + 1;
    return (this.versiones().at(0)?.numero ?? this.data()?.publicada?.numero ?? 0) + 1;
  });
  protected readonly sufijo = computed(() => (this.prueba() ? ' · ' + nombrePrueba(this.prueba()) : ''));
  protected verLabel(v: VersionInfo): string {
    return v.prueba ? `v${v.numeroPrueba} · ${nombrePrueba(v.prueba)}` : `v${v.numero}`;
  }
  protected readonly bloqueantes = computed(() => (this.data()?.conflictos ?? []).filter((c) => c.bloquea).length);
  protected readonly dias = computed(() => {
    const b = this.data();
    if (!b) return [];
    const set = new Map<string, number>();
    for (const d of b.config.dias) set.set(d.fecha, 0);
    for (const f of b.flights) set.set(f.dia, (set.get(f.dia) ?? 0) + 1);
    return [...set.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([fecha, n]) => ({ fecha, n }));
  });
  protected readonly flightsDia = computed(() => (this.data()?.flights ?? []).filter((f) => f.dia === this.dia()));
  protected readonly diaCfg = computed(() => this.data()?.config.dias.find((d) => d.fecha === this.dia()));
  protected readonly sinFlightLista = computed<Lista>(() => ({ id: null, atletas: this.data()?.sinFlight ?? [] }));
  protected readonly estado = computed<{ label: string; tone: GrTone }>(() => {
    const b = this.data();
    if (!b) return { label: '', tone: 'neutral' };
    if (!b.publicado) return { label: b.flights.length ? 'Sin publicar' : '', tone: 'neutral' };
    return b.cambiosSinPublicar ? { label: 'Cambios sin publicar', tone: 'warning' } : { label: `Publicado · v${b.publicada?.numero}`, tone: 'success' };
  });
  protected readonly subtitulo = computed(() => {
    const b = this.data();
    if (!b) return '';
    const n = this.flightsDia().length;
    const pl = (k: number, s: string, p: string) => `${k} ${k === 1 ? s : p}`;
    const parts = [this.pruebaSel()?.label ?? '', this.dia() ? diaLargo(this.dia()) : '', pl(b.config.plataformas, 'plataforma', 'plataformas'), `${pl(b.atletas, 'atleta', 'atletas')} en ${pl(b.flights.length, 'flight', 'flights')}${n !== b.flights.length ? ' (' + n + ' este día)' : ''}`];
    if (b.publicada) parts.push(`versión publicada v${b.publicada.numero}`);
    return parts.filter(Boolean).join(' · ');
  });
  protected readonly previewDia = computed(() => {
    const b = this.data();
    if (!b) return [];
    const rows: { t: string; flight?: Flight; item?: AgendaItem }[] = [
      ...this.flightsDia().map((f) => ({ t: hora(f.inicio), flight: f })),
      ...b.agenda.filter((a) => a.dia === this.dia()).map((a) => ({ t: a.hora, item: a })),
    ];
    return rows.sort((x, y) => x.t.localeCompare(y.t));
  });
  private listas = new Map<string, Lista>();

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
  }

  protected async cargar(): Promise<void> {
    try {
      this.set(await this.api.get(this.cid()));
      void this.cargarVersiones();
      void this.cargarCupos();
    } catch {
      this.raw.set(null);
    }
  }
  private async cargarCupos(): Promise<void> {
    try {
      const r = await this.solicitudes.cupos(this.cid());
      this.cupos.set(Object.fromEntries(r.cupos.map((c) => [c.codigo, c.plazas])));
    } catch {
      /* without atletas.editar the selector shows the athletes of each competition */
    }
  }
  private async cargarVersiones(): Promise<void> {
    try {
      this.versiones.set(await this.api.versiones(this.cid(), this.prueba()));
    } catch {
      /* the side card stays as it was */
    }
  }
  private set(b: Borrador): void {
    this.ultimoRev = b.rev;
    this.listas.clear();
    this.raw.set(b);
    if (!this.pruebas().some((p) => p.v === this.prueba())) this.prueba.set(this.pruebas()[0]?.v ?? '');
    const dias = this.dias();
    if (!dias.some((d) => d.fecha === this.dia())) this.dia.set(dias.find((d) => d.n)?.fecha ?? dias[0]?.fecha ?? '');
  }

  /** Stable list objects per flight (CDK compares container data by reference). */
  protected lista(f: Flight): Lista {
    let l = this.listas.get(f.id);
    if (!l || l.atletas !== f.atletas) {
      l = { id: f.id, atletas: f.atletas };
      this.listas.set(f.id, l);
    }
    return l;
  }
  protected activos(f: Flight): number {
    return f.atletas.filter((a) => !a.baja).length;
  }
  protected tieneBloqueo(f: Flight): boolean {
    return (this.data()?.conflictos ?? []).some((c) => c.bloquea && c.flightId === f.id);
  }
  protected pesajeSolapado(f: Flight): boolean {
    return (this.data()?.conflictos ?? []).some((c) => c.tipo === 'solape_pesaje' && c.flightId === f.id);
  }
  protected enPublicada(f: Flight): boolean {
    return !!this.data()?.publicado && f.publicado;
  }
  protected icono(i?: string): GrIconName {
    return (ICONOS.some((x) => x.v === i) ? i : 'clock') as GrIconName;
  }

  /** Runs a draft change; on 409 (someone else saved) reloads and says so. */
  private async run(fn: () => Promise<Borrador>, ok?: string): Promise<boolean> {
    this.guardando.set(true);
    this.conflictoEdicion.set(false);
    this.otraComp.set(null);
    try {
      this.set(await fn());
      if (ok) this.toasts.success(ok);
      return true;
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 409 && e.error?.code === 'CONFLICTO_EDICION') {
        this.conflictoEdicion.set(true);
        await this.cargar();
      } else if (e instanceof HttpErrorResponse && e.status === 422 && e.error?.code === 'PRUEBA_DISTINTA') {
        this.otraComp.set({ texto: errText(e), atleta: this.moviendo });
        await this.cargar();
      } else {
        this.toasts.error('No se pudo guardar', errText(e));
        await this.cargar();
      }
      return false;
    } finally {
      this.guardando.set(false);
      this.moviendo = '';
    }
  }

  protected async ajustar(p: Partial<Config>): Promise<void> {
    const b = this.data();
    if (!b) return;
    // More platforms than weigh-in tables would serialise the flights: raise the tables with them.
    const mesas = p.plataformas && p.plataformas > b.config.mesasPesaje ? p.plataformas : undefined;
    const cfg = { ...b.config, ...p, ...(mesas ? { mesasPesaje: mesas } : {}) };
    await this.run(() => this.api.config(this.cid(), cfg),
      mesas ? `Ajuste guardado · también ${mesas} mesas de pesaje (cámbialo en «Ajustes del día»). Pulsa «Generar» para aplicarlo.` : 'Ajuste guardado · pulsa «Generar» para aplicarlo a todos los flights');
  }

  protected async generar(): Promise<void> {
    const b = this.data();
    if (!b) return;
    if (b.flights.length && !(await this.confirm.ask({ title: 'Generar los flights de nuevo', text: (this.pruebaSel() ? 'Se sustituyen los flights de ' + this.pruebaSel()!.label + '; los de la otra competición no cambian' : 'Se sustituyen todos los flights del borrador') + ' (los publicados no cambian hasta que publiques).', confirm: 'Generar' }))) return;
    this.generando.set(true);
    this.movimiento.set(null);
    try {
      await this.run(() => this.api.generar(this.cid(), this.prueba() ? { competicion: this.prueba() } : {}));
    } finally {
      this.generando.set(false);
    }
    const n = this.data()?.flights.length ?? 0;
    if (n) this.toasts.success(`${n} flight${n === 1 ? '' : 's'} generado${n === 1 ? '' : 's'}`, `${this.bloqueantes() ? this.bloqueantes() + ' conflictos por revisar' : 'Sin conflictos'}.`);
  }

  protected elegirPrueba(p: string): void {
    this.prueba.set(p);
    this.movimiento.set(null);
    this.otraComp.set(null);
    void this.cargarVersiones();
    const dias = this.dias();
    if (!dias.some((d) => d.fecha === this.dia())) this.dia.set(dias.find((d) => d.n)?.fecha ?? dias[0]?.fecha ?? '');
  }
  /** «AEP-3 · dom 22 nov · 76» (places of the competition; its athletes when the places are not readable). */
  protected etiquetaPrueba(p: { v: string; label: string; dia: string; n: number; plazas?: number }): string {
    return [p.label, p.dia ? diaDePruebaCorto(p.dia) : '', p.v ? String(p.plazas ?? p.n) : String(p.n)].filter(Boolean).join(' · ');
  }

  // ---- competitions (Figma 219:167365 «Gestionar competiciones») ----
  protected abrirCompeticiones(): void {
    this.cuposEdit = { ...this.cupos() };
    this.compOpen.set(true);
  }
  protected async guardarCompeticiones(): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await this.solicitudes.guardarCupos(this.cid(), Object.fromEntries(PRUEBAS.map((p) => [p, +(this.cuposEdit[p] ?? 0)])));
      this.cupos.set(Object.fromEntries(r.cupos.map((c) => [c.codigo, c.plazas])));
      this.compOpen.set(false);
      this.toasts.success('Competiciones guardadas');
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async nuevoFlight(): Promise<void> {
    await this.run(() => this.api.crearFlight(this.cid(), { dia: this.dia() || undefined, competicion: this.prueba() || undefined }), 'Flight creado');
  }

  // ---- drag and drop ----
  protected async drop(e: CdkDragDrop<Lista, Lista, FlightAtleta>): Promise<void> {
    const from = e.previousContainer.data;
    const to = e.container.data;
    if (from === to && e.previousIndex === e.currentIndex) return;
    if (from.id === null && to.id === null) return; // «Sin flight» has no order to keep
    const a = e.item.data;
    const antesFrom = from.atletas.map((x) => x.id);
    const antesTo = to.atletas.map((x) => x.id);
    const fromList = [...from.atletas];
    const toList = from === to ? fromList : [...to.atletas];
    if (from === to) moveItemInArray(fromList, e.previousIndex, e.currentIndex);
    else transferArrayItem(fromList, toList, e.previousIndex, e.currentIndex);
    // Optimistic: show the move at once.
    const b = this.data()!;
    const flights = b.flights.map((f) => (f.id === from.id ? { ...f, atletas: fromList } : f.id === to.id ? { ...f, atletas: toList } : f));
    const r = this.raw()!;
    const sinFlight = from.id === null ? r.sinFlight.filter((x) => x.id !== a.id) : to.id === null ? [...r.sinFlight, a] : r.sinFlight;
    this.raw.set({ ...r, flights: r.flights.map((f) => flights.find((x) => x.id === f.id) ?? f), sinFlight });
    const fFrom = b.flights.find((f) => f.id === from.id) ?? null;
    const fTo = b.flights.find((f) => f.id === to.id) ?? null;
    this.moviendo = a.id;
    const ok = await this.run(() => (to.id ? this.api.atletas(this.cid(), to.id, toList.map((x) => x.id)) : this.api.atletas(this.cid(), from.id!, fromList.map((x) => x.id))));
    if (!ok || from === to) return;
    const deshacer: Movimiento['deshacer'] = [];
    if (to.id) deshacer.push({ id: to.id, atletas: antesTo });
    if (from.id) deshacer.push({ id: from.id, atletas: antesFrom });
    this.movimiento.set({ nombre: a.nombre, de: fFrom ? fFrom.codigo : 'sin flight', a: fTo ? fTo.codigo : 'sin flight', texto: this.efecto(fFrom, fTo), deshacer });
  }

  /** «Su pesaje pasa de 09:30 a 08:40 y su salida a plataforma ~45 min antes. Recibirá un email al publicar.» */
  private efecto(de: Flight | null, a: Flight | null): string {
    const email = this.data()?.publicado ? ' Recibirá un email al publicar.' : '';
    if (!a) return 'Se queda sin flight: no aparecerá en los horarios hasta que lo asignes.' + email;
    if (!de) return `Compite en el flight ${a.codigo} a las ${hora(a.inicio)} (pesaje ${hora(a.pesajeInicio)}–${hora(a.pesajeFin)}).` + email;
    const min = Math.round((new Date(a.inicio).getTime() - new Date(de.inicio).getTime()) / 60000);
    const cuando = min === 0 ? 'a la misma hora' : `~${Math.abs(min)} min ${min < 0 ? 'antes' : 'después'}`;
    const pesaje = hora(de.pesajeInicio) === hora(a.pesajeInicio) ? 'Su pesaje no cambia' : `Su pesaje pasa de ${hora(de.pesajeInicio)} a ${hora(a.pesajeInicio)}`;
    return `${pesaje} y su salida a plataforma ${cuando}${de.dia !== a.dia ? ' (otro día: ' + diaLargo(a.dia) + ')' : ''}.` + email;
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

  protected abrirMover(a: FlightAtleta, desde: Flight | null): void {
    this.mSel.set({ a, desde });
    this.moverOpen.set(true);
  }
  protected async mover(to: Flight | null): Promise<void> {
    const m = this.mSel();
    if (!m) return;
    this.moverOpen.set(false);
    const from = m.desde;
    const antesTo = to?.atletas.map((x) => x.id) ?? [];
    const antesFrom = from?.atletas.map((x) => x.id) ?? [];
    this.moviendo = m.a.id;
    const ok = to
      ? await this.run(() => this.api.atletas(this.cid(), to.id, [...antesTo, m.a.id]))
      : await this.run(() => this.api.atletas(this.cid(), from!.id, antesFrom.filter((x) => x !== m.a.id)));
    if (!ok) return;
    const deshacer: Movimiento['deshacer'] = [];
    if (to) deshacer.push({ id: to.id, atletas: antesTo });
    if (from) deshacer.push({ id: from.id, atletas: antesFrom });
    this.movimiento.set({ nombre: m.a.nombre, de: from ? from.codigo : 'sin flight', a: to ? to.codigo : 'sin flight', texto: this.efecto(from, to), deshacer });
    if (to && to.dia !== this.dia()) this.dia.set(to.dia);
  }

  protected irA(codigo: string): void {
    const f = this.data()?.flights.find((x) => x.codigo === codigo);
    if (!f) return;
    this.vista.set('dia');
    this.dia.set(f.dia);
    setTimeout(() => document.getElementById('flight-' + codigo)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 50);
  }

  // ---- flight drawer ----
  protected abrirFlight(f: Flight): void {
    this.fSel.set(f);
    this.fEdit = { dia: f.dia, plataforma: f.plataforma, inicio: hora(f.inicio), duracionMin: f.duracionMin, pesajeInicio: hora(f.pesajeInicio), pesajeFin: hora(f.pesajeFin) };
    this.dEdit = { estado: f.directo.estado, retrasoMin: f.directo.retrasoMin ?? 0 };
    this.flightOpen.set(true);
  }
  protected async guardarFlight(): Promise<void> {
    const f = this.fSel();
    if (!f) return;
    const e = this.fEdit;
    const cambiaHora = e.inicio !== hora(f.inicio) || e.dia !== f.dia;
    const pesajeTocado = e.pesajeInicio !== hora(f.pesajeInicio) || e.pesajeFin !== hora(f.pesajeFin);
    const body = { dia: e.dia, plataforma: +e.plataforma, inicio: e.inicio, duracionMin: +e.duracionMin, ...(pesajeTocado || !cambiaHora ? { pesajeInicio: e.pesajeInicio, pesajeFin: e.pesajeFin } : {}) };
    if (await this.run(() => this.api.editarFlight(this.cid(), f.id, body), `Flight ${f.codigo} guardado`)) {
      this.flightOpen.set(false);
      if (e.dia !== this.dia()) this.dia.set(e.dia);
    }
  }
  protected async borrarFlight(): Promise<void> {
    const f = this.fSel();
    if (!f || !(await this.confirm.ask({ title: `Borrar el flight ${f.codigo}`, text: `Sus ${this.activos(f)} atletas quedarán sin flight.`, confirm: 'Borrar', danger: true }))) return;
    if (await this.run(() => this.api.borrarFlight(this.cid(), f.id), `Flight ${f.codigo} borrado`)) this.flightOpen.set(false);
  }
  protected async guardarDirecto(f: Flight): Promise<void> {
    this.guardando.set(true);
    try {
      await this.api.directo(this.cid(), f.id, { estado: this.dEdit.estado, retrasoMin: +this.dEdit.retrasoMin });
      this.toasts.success('Directo actualizado', 'Ya se ve en /horarios.');
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo actualizar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  // ---- day settings ----
  protected abrirDia(): void {
    const b = this.data();
    if (!b) return;
    const d = b.config.dias.find((x) => x.fecha === this.dia()) ?? { fecha: this.dia(), inicio: '09:00', fin: '20:00' };
    this.dEditDia = { fecha: d.fecha, inicio: d.inicio, fin: d.fin, puertas: d.puertas ?? '', pausaInicio: d.pausaInicio ?? '', pausaFin: d.pausaFin ?? '' };
    this.notas = (d.notas ?? []).join('\n');
    this.agendaDia = b.agenda.filter((a) => a.dia === d.fecha).map((a) => ({ ...a }));
    const c = b.config;
    this.reglas = { minPorAtleta: c.minPorAtleta, descansoMin: c.descansoMin, pesajeAntesMin: c.pesajeAntesMin, pesajeDuracionMin: c.pesajeDuracionMin, mesasPesaje: c.mesasPesaje, separarSexo: c.separarSexo };
    this.diaOpen.set(true);
  }
  protected async guardarDia(): Promise<void> {
    const b = this.data();
    if (!b) return;
    const e = this.dEditDia;
    const dia = { fecha: e.fecha, inicio: e.inicio, fin: e.fin, puertas: e.puertas, pausaInicio: e.pausaInicio, pausaFin: e.pausaFin, notas: this.notas.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6) };
    const dias = b.config.dias.some((d) => d.fecha === e.fecha) ? b.config.dias.map((d) => (d.fecha === e.fecha ? dia : d)) : [...b.config.dias, dia];
    const r = this.reglas;
    const cfg: Config = { ...b.config, dias, minPorAtleta: +r.minPorAtleta, descansoMin: +r.descansoMin, pesajeAntesMin: +r.pesajeAntesMin, pesajeDuracionMin: +r.pesajeDuracionMin, mesasPesaje: +r.mesasPesaje, separarSexo: r.separarSexo };
    if (!(await this.run(() => this.api.config(this.cid(), cfg)))) return;
    const items = [...(this.data()?.agenda ?? []).filter((a) => a.dia !== e.fecha), ...this.agendaDia.filter((a) => a.titulo.trim()).map((a) => ({ ...a, dia: e.fecha, titulo: a.titulo.trim() }))];
    if (await this.run(() => this.api.agenda(this.cid(), items), 'Ajustes del día guardados')) this.diaOpen.set(false);
  }

  // ---- publish ----
  protected async abrirPublicar(): Promise<void> {
    try {
      const d = await this.api.diff(this.cid(), this.prueba());
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
      const r = await this.api.publicar(this.cid(), this.prueba(), this.avisarAtletas(), this.avisarSeguidores());
      this.pub.set(null);
      this.movimiento.set(null);
      const v = r.prueba ? `v${r.numeroPrueba} · ${nombrePrueba(r.prueba)}` : `v${r.version}`;
      this.toasts.success(`Horarios ${v} publicados`, r.avisos + r.seguidores ? `${r.avisos} avisos a atletas · ${r.seguidores} a seguidores (se envían en unos minutos).` : 'Sin avisos por email.');
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
    if (!(await this.confirm.ask({ title: 'Retirar los horarios de la web', text: 'La web volverá a «Horarios próximamente» y las fichas de los atletas quedarán sin flight. No se avisa a nadie.', confirm: 'Retirar', danger: true }))) return;
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
