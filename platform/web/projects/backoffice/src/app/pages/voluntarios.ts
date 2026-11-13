import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts, type GrTone, fmtAgo } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { Realtime } from '../core/realtime';
import { BoMenu, type BoMenuItem } from '../shared/kit';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, errText } from '../shared/ui';

/** A row of the «voluntarios» collection (cms): requests sent from /voluntarios and the team. */
interface Voluntario {
  id: string; nombre: string; email: string; telefono: string; disponibilidad: string; roles: string[]; experiencia: string; puesto: string; esMenor: boolean;
  autorizacionUrl: string; notas: string; estado: 'pendiente' | 'revision' | 'confirmado' | 'descartado'; turno: string; responsable: string; motivoRechazo: string;
  revisadoAt?: string; revisadoPor: string; createdAt: string;
}
interface Puesto { rol: string; nombre: string; objetivo: number }
type Tab = 'solicitudes' | 'equipo' | 'rechazadas';
const ROLES: Record<string, string> = { jueces: 'Jueces', cargadores: 'Cargadores', mesa: 'Mesa técnica', foto: 'Foto y vídeo', acreditaciones: 'Acreditaciones' };
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** Shifts of the event: set-up the day before, then each day's morning, afternoon or full day (the public form offers those days). */
function turnosDe(inicio?: string, fin?: string): string[] {
  if (!inicio) return ['Montaje (la víspera)', 'Mañana · 7:30–14:30', 'Tarde · 14:00–20:00', 'Todo el día'];
  const dia = (iso: string, mas = 0) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + mas); return d; };
  const out = [`Montaje (${DIAS[dia(inicio, -1).getUTCDay()].toLowerCase()})`];
  for (let d = dia(inicio), f = dia(fin || inicio), n = 0; d <= f && n < 4; d.setUTCDate(d.getUTCDate() + 1), n++) {
    const x = DIAS[d.getUTCDay()];
    out.push(`${x} mañana · 7:30–14:30`, `${x} tarde · 14:00–20:00`, x);
  }
  return out;
}

/** «Voluntarios» (Figma page 68): requests from /voluntarios (accept with role, shift and person in charge · reject with a reason),
 *  the team by role with its coverage, and the rejected requests. */
@Component({
  selector: 'bo-voluntarios',
  imports: [FormsModule, BoPageHeader, BoDrawer, BoMenu, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Voluntarios" subtitle="Solicitudes de /voluntarios y equipo del día" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Voluntarios']">
        <ng-container actions>
          <button grButton [disabled]="!equipo().length" (click)="exportar()">Exportar CSV</button>
          <button grButton variant="primary" [disabled]="!equipo().length" (click)="escribir('')">Enviar briefing</button>
        </ng-container>
      </bo-page-header>
      <nav class="hidden gap-1 border-b border-line-subtle md:flex" aria-label="Voluntarios">
        @for (t of tabs; track t.k) {
          <button type="button" (click)="tab.set(t.k)" [attr.aria-current]="tab() === t.k ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [class]="tab() === t.k ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
            {{ t.l }}@if (l) { <span class="flex h-5 items-center rounded-xs px-1.5 text-mono-xs" [class]="tab() === t.k ? 'bg-accent/20 text-accent-text' : 'bg-bg-raised text-text-tertiary'">{{ cuenta(t.k) }}</span> }
            @if (tab() === t.k) { <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span> }
          </button>
        }
      </nav>
      <div class="flex gap-1 rounded-md border border-line-subtle bg-bg-card p-1 md:hidden" role="tablist" aria-label="Voluntarios">
        @for (t of tabs; track t.k) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.k" (click)="tab.set(t.k)" class="h-10 flex-auto rounded-sm px-2 text-[13px] leading-4 font-semibold whitespace-nowrap" [class]="tab() === t.k ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'">{{ t.l }}@if (l) { {{ ' ' + cuenta(t.k) }} }</button>
        }
      </div>

      @if (l === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar los voluntarios" text="Comprueba la conexión y vuelve a intentarlo."><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (l === undefined) {
        <div class="hidden grid-cols-4 gap-4 md:grid">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-36 rounded-lg" /> }</div>
        <gr-skeleton class="h-72 rounded-lg" />
      } @else {
        @switch (tab()) {
          @case ('solicitudes') {
            <div class="hidden grid-cols-2 gap-4 md:grid xl:grid-cols-4">
              <gr-kpi label="Solicitudes nuevas" [value]="solicitudes().length + ''" [delta]="nuevasSemana() ? '+' + nuevasSemana() : null" caption="esta semana" [trend]="tendencia()" />
              <gr-kpi label="Equipo confirmado" [value]="equipo().length + ''" [caption]="'de ' + objetivoTotal() + ' puestos'" [trend]="flat" />
              @for (c of faltan(); track c.rol) { <gr-kpi [label]="c.nombre" [value]="c.n + ' / ' + c.objetivo" [caption]="c.n >= c.objetivo ? 'cubierto' : 'faltan ' + (c.objetivo - c.n)" [trend]="c.n >= c.objetivo ? flat : bajando" /> }
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <label class="relative block w-full md:max-w-[280px]"><span class="sr-only">Buscar voluntario</span><gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
                <input grInput type="search" class="pl-9" placeholder="Buscar voluntario…" [ngModel]="q()" (ngModelChange)="q.set($event)" /></label>
              <gr-select tipo="filtro" etiqueta="Rol" aria-label="Rol" [ngModel]="fRol()" (ngModelChange)="fRol.set($event)"><option value="">Todos</option>@for (r of roles; track r[0]) { <option [value]="r[0]">{{ r[1] }}</option> }</gr-select>
              <gr-select tipo="filtro" etiqueta="Disponibilidad" aria-label="Disponibilidad" [ngModel]="fDisp()" (ngModelChange)="fDisp.set($event)"><option value="">Toda</option>@for (d of disponibilidades(); track d) { <option [value]="d">{{ d }}</option> }</gr-select>
              <gr-select tipo="filtro" etiqueta="Edad" aria-label="Edad" [ngModel]="fEdad()" (ngModelChange)="fEdad.set($event)"><option value="">Todas</option><option value="adulto">Adultos</option><option value="menor">Menores</option></gr-select>
              <span class="ml-auto flex items-center gap-2">
                <span class="text-body-xs text-text-tertiary">{{ filtradas().length }} {{ filtradas().length === 1 ? 'solicitud' : 'solicitudes' }}</span>
                <button grIconButton icon="download" label="Descargar las solicitudes filtradas (CSV)" [disabled]="!filtradas().length" (click)="exportarSolicitudes()"></button>
                <gr-select aria-label="Estado" [ngModel]="fEstado()" (ngModelChange)="fEstado.set($event)"><option value="">Estado</option><option value="pendiente">Nueva</option><option value="revision">En revisión</option><option value="autorizacion">Falta autorización</option></gr-select>
              </span>
            </div>
            @if (!filtradas().length) { <gr-empty icon="heart" [title]="solicitudes().length ? 'Ninguna solicitud con esos filtros' : 'Sin solicitudes pendientes'" text="Las solicitudes llegan del formulario de /voluntarios.">@if (solicitudes().length) { <button grButton (click)="limpiar()">Quitar filtros</button> }</gr-empty> }
            @else {
              <section class="md:overflow-hidden md:rounded-lg md:border md:border-line-subtle md:bg-bg-card">
                <table class="hidden w-full table-fixed text-left md:table">
                  <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary uppercase"><tr><th class="px-4 py-3 font-normal">Voluntario</th><th class="w-[25%] px-3 py-3 font-normal">Quiere ayudar en</th><th class="w-[15%] px-3 py-3 font-normal">Disponibilidad</th><th class="w-[11%] px-3 py-3 font-normal">Recibida</th><th class="w-[20%] px-3 py-3 font-normal">Estado</th><th class="w-14"></th></tr></thead>
                  <tbody>
                    @for (v of filtradas(); track v.id) {
                      <tr class="cursor-pointer border-b border-line-subtle hover:bg-bg-raised/60" (click)="revisar(v)">
                        <td class="px-4 py-3"><span class="flex items-center gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-accent/14 text-label-xs">{{ ini(v.nombre) }}</span><span class="min-w-0"><span class="block truncate text-label-m">{{ v.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ v.email }}</span></span></span></td>
                        <td class="px-3 py-3"><span class="flex flex-wrap gap-1.5">@for (r of v.roles; track r; let i = $index) { <gr-badge [tone]="i ? 'neutral' : 'accent'">{{ rol(r) }}</gr-badge> } @empty { <span class="text-body-xs text-text-muted">Sin preferencia</span> }</span></td>
                        <td class="truncate px-3 py-3 text-body-m">{{ disp(v) }}</td>
                        <td class="px-3 py-3 text-body-m">{{ hace(v.createdAt) }}</td>
                        <td class="px-3 py-3"><gr-badge [tone]="estado(v).tone">{{ estado(v).l }}</gr-badge></td>
                        <td class="pr-2 text-right"><button grIconButton icon="more" [label]="'Acciones de ' + v.nombre" [disabled]="ocupado()" (click)="menuFila($event, v)"></button></td>
                      </tr>
                    }
                  </tbody>
                </table>
                <p class="hidden px-4 py-3 text-body-xs text-text-tertiary md:block">{{ filtradas().length }} {{ filtradas().length === 1 ? 'solicitud' : 'solicitudes' }} · llegan del formulario de /voluntarios</p>
                <ul class="flex flex-col gap-3 md:hidden">
                  @for (v of filtradas(); track v.id) {
                    <li class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5">
                      <button type="button" class="flex flex-col items-start gap-1 text-left" (click)="revisar(v)"><span class="text-[18px] leading-6 font-semibold">{{ v.nombre }}</span><span class="text-body-xs text-text-tertiary">{{ disp(v) || 'Sin disponibilidad' }} · {{ hace(v.createdAt) }}</span></button>
                      <span class="flex flex-wrap gap-1.5">@for (r of v.roles; track r; let i = $index) { <gr-badge [tone]="i ? 'neutral' : 'accent'">{{ rol(r) }}</gr-badge> }</span>
                      <gr-badge class="self-start" [tone]="estado(v).tone">{{ estado(v).l }}</gr-badge>
                      @if (v.esMenor && !v.autorizacionUrl) { <p class="text-body-xs text-warning">Falta la autorización firmada del tutor para poder aceptarle.</p> }
                      <div class="grid grid-cols-2 gap-2"><button grButton (click)="revisar(v, 'rechazar')">Rechazar</button><button grButton variant="primary" (click)="revisar(v)">Aceptar</button></div>
                    </li>
                  }
                </ul>
              </section>
            }
          }
          @case ('equipo') {
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              @for (c of cobertura(); track c.rol) {
                <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
                  <div class="flex flex-col gap-1">
                    <h2 class="text-[18px] leading-6 font-semibold">{{ c.nombre }}</h2>
                    <p class="flex items-center gap-1.5 text-body-xs text-text-tertiary">Cobertura {{ c.miembros.length }} /
                      <input type="number" min="0" max="200" class="h-6 w-12 rounded-xs border border-line-subtle bg-transparent px-1 text-body-xs text-text-tertiary hover:border-line-strong focus:border-line-strong focus:text-text-primary" [attr.aria-label]="'Personas que necesita ' + c.nombre" [value]="c.objetivo" (change)="objetivo(c.rol, $any($event.target).value)" /></p>
                  </div>
                  <gr-badge class="self-start" [tone]="c.miembros.length >= c.objetivo ? 'success' : c.miembros.length ? 'warning' : 'danger'">{{ c.miembros.length >= c.objetivo ? 'Cubierto' : c.miembros.length ? 'Faltan' : 'Sin cubrir' }}</gr-badge>
                  <ul class="flex flex-col">
                    @for (v of c.miembros; track v.id) {
                      <li><button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-sm px-1 text-left hover:bg-bg-raised" [attr.aria-label]="'Cambiar el turno o quitar a ' + v.nombre" (click)="revisar(v)">
                        <span class="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-accent/14 text-mono-xs">{{ ini(v.nombre) }}</span>
                        <span class="min-w-0 flex-1 truncate text-label-m">{{ v.nombre }}@if (v.esMenor) { <span class="ml-1 text-body-xs font-normal text-warning">menor</span> }</span>
                        <span class="truncate text-body-xs text-text-tertiary">{{ turnoCorto(v.turno) }}</span></button></li>
                    } @empty { <li class="text-body-m text-text-muted">Nadie asignado todavía</li> }
                  </ul>
                  <button grButton class="mt-auto self-start" [disabled]="!c.miembros.length" (click)="escribir(c.rol)">Escribir al rol</button>
                </section>
              }
            </div>
          }
          @case ('rechazadas') {
            @if (!rechazadas().length) { <gr-empty icon="heart" title="Sin solicitudes rechazadas" /> }
            @else {
              <p class="text-body-xs text-text-tertiary">Guardan el nombre, el email y el teléfono de quien las envió: bórralas cuando ya no hagan falta.</p>
              <ul class="flex flex-col gap-3">
                @for (v of rechazadas(); track v.id) {
                  <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-4 md:flex-row md:items-center md:gap-4">
                    <span class="min-w-0 flex-1"><span class="block text-label-s">{{ v.nombre }} <span class="text-body-xs font-normal text-text-tertiary">· {{ v.email }}</span></span>
                      @if (v.motivoRechazo) { <span class="block text-body-s text-text-secondary">«{{ v.motivoRechazo }}»</span> }
                      <span class="block text-body-xs text-text-tertiary">{{ v.revisadoPor || 'Equipo' }}{{ v.revisadoAt ? ' · ' + hace(v.revisadoAt) : '' }}</span></span>
                    <span class="flex gap-2"><button grButton size="s" (click)="revisar(v)">Revisar de nuevo</button><button grButton size="s" variant="danger" icon="trash" [disabled]="ocupado()" (click)="borrar(v)">Borrar</button></span>
                  </li>
                }
              </ul>
            }
          }
        }
      }
    </div>

    <!-- Review (Figma 68 «Voluntarios · revisar solicitud») -->
    <bo-drawer [(open)]="abierto" [title]="sel()?.nombre || 'Voluntario'" [sub]="sel() ? 'Solicitud enviada ' + hace(sel()!.createdAt) + ' desde /voluntarios' : ''">
      @if (sel(); as v) {
        <div class="flex flex-col gap-5">
          <div class="-mt-2 flex flex-wrap gap-2"><gr-badge [tone]="estado(v).tone">{{ estado(v).l }}</gr-badge><gr-badge [tone]="v.esMenor ? 'warning' : 'neutral'">{{ v.esMenor ? 'Menor' : 'Adulto' }}</gr-badge></div>
          <section><h3 class="text-label-xs text-text-muted uppercase">Contacto</h3>
            <dl class="mt-2 text-body-s">
              <div class="flex justify-between gap-4 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Email</dt><dd class="truncate"><a [href]="'mailto:' + v.email" class="text-accent-text hover:underline">{{ v.email }}</a></dd></div>
              <div class="flex justify-between gap-4 py-2"><dt class="text-text-tertiary">Teléfono</dt><dd>@if (v.telefono) { <a [href]="'tel:' + v.telefono" class="text-accent-text hover:underline">{{ v.telefono }}</a> } @else { — }</dd></div>
            </dl>
          </section>
          <section><h3 class="text-label-xs text-text-muted uppercase">Quiere ayudar en</h3>
            <p class="mt-2 flex flex-wrap gap-1">@for (r of v.roles; track r; let i = $index) { <gr-badge [tone]="i ? 'neutral' : 'accent'">{{ rol(r) }}</gr-badge> } @empty { <span class="text-body-s text-text-tertiary">Sin preferencia</span> }</p>
            <dl class="mt-2 text-body-s">
              <div class="flex justify-between gap-4 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Disponibilidad</dt><dd class="text-right">{{ disp(v) || '—' }}</dd></div>
              <div class="flex justify-between gap-4 py-2"><dt class="shrink-0 text-text-tertiary">Experiencia</dt><dd class="text-right whitespace-pre-line">{{ v.experiencia || '—' }}</dd></div>
            </dl>
          </section>
          @if (v.esMenor) {
            <section class="flex flex-col gap-3"><h3 class="text-label-xs text-text-muted uppercase">Menor de edad</h3>
              @if (!asig.autorizacionUrl) { <gr-alert tone="warning" title="Falta la autorización del tutor">No se puede aceptar hasta subir la autorización firmada.</gr-alert> }
              <div class="flex flex-wrap items-center gap-2">
                <label class="flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line-strong px-3 text-body-s text-text-secondary hover:border-text-muted md:h-10">
                  <gr-icon [name]="asig.autorizacionUrl ? 'circle-check' : 'download'" [size]="16" [class.text-success]="!!asig.autorizacionUrl" />
                  <span class="truncate">{{ subiendo() ? 'Subiendo…' : asig.autorizacionUrl ? 'Autorización subida · cambiar' : 'Subir la autorización firmada (foto o PDF)' }}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" class="sr-only" (change)="subirAutorizacion($event)" />
                </label>
                @if (asig.autorizacionUrl) { <button grButton size="s" icon="eye" (click)="verAutorizacion()">Ver</button> }
              </div>
              <p class="text-body-xs text-text-tertiary">Se guarda de forma privada: solo la ve el equipo con permiso de web.</p>
            </section>
          }
          @if (modo() === 'aceptar') {
            <section class="flex flex-col gap-4"><h3 class="text-label-xs text-text-muted uppercase">{{ v.estado === 'confirmado' ? 'Asignación' : 'Asignar' }}</h3>
              <div class="grid gap-4 sm:grid-cols-2">
                <gr-field label="Puesto" for="v-puesto"><gr-select id="v-puesto" [(ngModel)]="asig.puesto">@for (r of roles; track r[0]) { <option [value]="r[0]">{{ r[1] }}</option> }</gr-select></gr-field>
                <gr-field label="Turno" for="v-turno"><gr-select id="v-turno" [(ngModel)]="asig.turno">@if (!turnos().includes(asig.turno)) { <option [value]="asig.turno">{{ asig.turno }}</option> }@for (t of turnos(); track t) { <option [value]="t">{{ t }}</option> }</gr-select></gr-field>
                <gr-field label="Responsable" for="v-resp" class="sm:col-span-2" [optional]="true"><input grInput id="v-resp" maxlength="80" [(ngModel)]="asig.responsable" /></gr-field>
              </div>
              @if (v.estado !== 'confirmado') {
                <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Email de bienvenida</p><p class="text-body-xs text-text-tertiary">Puesto, turno, quién le coordina y la hora de llegada</p></div><bo-toggle [(value)]="asig.avisar" label="Email de bienvenida" /></div>
              }
            </section>
            <section class="flex flex-col gap-2"><h3 class="text-label-xs text-text-muted uppercase">Notas internas</h3>
              <gr-field label="Nota" for="v-notas" [optional]="true"><textarea grInput id="v-notas" rows="2" maxlength="1000" [(ngModel)]="asig.notas"></textarea></gr-field>
            </section>
          } @else {
            <section class="flex flex-col gap-4"><h3 class="text-label-xs text-text-muted uppercase">Rechazar</h3>
              <gr-field label="Motivo" for="v-motivo" hint="Se guarda; si avisas, va en el email" [error]="motivoError()"><textarea grInput id="v-motivo" rows="3" maxlength="400" [(ngModel)]="re.motivo" placeholder="p. ej. Ya tenemos cubiertos todos los puestos."></textarea></gr-field>
              <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Avisar por email</p><p class="text-body-xs text-text-tertiary">Con el motivo, a {{ v.email }}</p></div><bo-toggle [(value)]="re.avisar" label="Avisar del rechazo por email" /></div>
            </section>
          }
          @if (error()) { <gr-alert tone="danger" title="No se pudo guardar">{{ error() }}</gr-alert> }
        </div>
      }
      <ng-container drawerActions>
        @if (modo() === 'aceptar') {
          @if (sel()?.estado === 'pendiente') { <button grButton variant="ghost" [disabled]="ocupado()" (click)="cambiarEstado('revision')">Marcar en revisión</button> }
          @if (sel()?.estado === 'confirmado') { <button grButton variant="ghost" [disabled]="ocupado()" (click)="quitar()">Quitar del equipo</button> }
          @if (sel()?.estado !== 'descartado' && sel()?.estado !== 'confirmado') { <button grButton class="border-accent/60 text-accent-text" (click)="modo.set('rechazar')">Rechazar…</button> }
          <button grButton variant="primary" [loading]="ocupado()" [disabled]="!!sel()?.esMenor && !asig.autorizacionUrl" (click)="aceptar()">{{ sel()?.estado === 'confirmado' ? 'Guardar asignación' : 'Aceptar y asignar' }}</button>
        } @else {
          <button grButton variant="ghost" (click)="modo.set('aceptar')">Volver</button>
          <button grButton variant="danger" [loading]="ocupado()" (click)="rechazar()">Rechazar solicitud</button>
        }
      </ng-container>
    </bo-drawer>

    @if (menu(); as m) {
      <div class="fixed inset-0 z-40" (click)="menu.set(null)"></div>
      <bo-menu class="fixed z-50" [style.left.px]="m.x" [style.top.px]="m.y" [items]="m.items" (pick)="menu.set(null); m.fn($event)" />
    }

    <!-- «Enviar briefing» (whole team) / «Escribir al rol»: one email per confirmed volunteer -->
    <bo-drawer [(open)]="escribiendo" [title]="msg.rol ? 'Escribir a ' + rol(msg.rol) : 'Enviar briefing'" [sub]="destinatarios() + (destinatarios() === 1 ? ' persona confirmada' : ' personas confirmadas') + ' · un email a cada una'">
      <div class="flex flex-col gap-4">
        <gr-field label="Asunto" for="m-asunto" [error]="msgError() && msg.asunto.trim().length < 3 ? 'Escribe el asunto' : ''"><input grInput id="m-asunto" maxlength="120" [(ngModel)]="msg.asunto" /></gr-field>
        <gr-field label="Mensaje" for="m-mensaje" hint="Cada email añade su puesto y su turno." [error]="msgError() && msg.mensaje.trim().length < 3 ? 'Escribe el mensaje' : ''"><textarea grInput id="m-mensaje" rows="8" maxlength="4000" [(ngModel)]="msg.mensaje" placeholder="Hora de llegada, por dónde entrar, qué traer…"></textarea></gr-field>
        @if (error()) { <gr-alert tone="danger" title="No se pudo enviar">{{ error() }}</gr-alert> }
      </div>
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="escribiendo.set(false)">Cancelar</button>
        <button grButton variant="primary" icon="send" [loading]="ocupado()" (click)="enviar()">Enviar</button>
      </ng-container>
    </bo-drawer>
  `,
})
export class VoluntariosPage {
  protected readonly comps = inject(Competitions);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly lista = signal<Voluntario[] | null | undefined>(undefined);
  protected readonly puestos = signal<Puesto[]>([]);
  protected readonly tab = signal<Tab>('solicitudes');
  protected readonly sel = signal<Voluntario | null>(null);
  protected readonly abierto = signal(false);
  protected readonly modo = signal<'aceptar' | 'rechazar'>('aceptar');
  protected readonly ocupado = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly error = signal('');
  protected readonly motivoError = signal('');
  protected readonly q = signal('');
  protected readonly fRol = signal('');
  protected readonly fDisp = signal('');
  protected readonly fEdad = signal('');
  protected readonly fEstado = signal('');
  protected asig = { puesto: 'jueces', turno: 'Todo el día', responsable: '', notas: '', avisar: true, autorizacionUrl: '' };
  protected re = { motivo: '', avisar: false };
  protected readonly tabs: { k: Tab; l: string }[] = [{ k: 'solicitudes', l: 'Solicitudes' }, { k: 'equipo', l: 'Equipo' }, { k: 'rechazadas', l: 'Rechazadas' }];
  protected readonly roles = Object.entries(ROLES);
  protected readonly turnos = computed(() => turnosDe(this.comps.current()?.fechaInicio, this.comps.current()?.fechaFin));
  protected readonly menu = signal<{ x: number; y: number; items: BoMenuItem[]; fn: (id: string) => void } | null>(null);
  protected readonly escribiendo = signal(false);
  protected readonly msgError = signal(false);
  protected msg = { rol: '', asunto: '', mensaje: '' };
  protected readonly flat = [1, 1, 1, 1, 1, 1];
  protected readonly bajando = [6, 6, 5, 5, 4, 3];
  /** «Solicitudes nuevas» sparkline: requests received each of the last 6 weeks. */
  protected readonly tendencia = computed(() => {
    const ahora = Date.now(), sem = 7 * 86_400_000, out = [0, 0, 0, 0, 0, 0];
    for (const v of this.lista() ?? []) { const i = 5 - Math.floor((ahora - new Date(v.createdAt).getTime()) / sem); if (i >= 0 && i < 6) out[i]++; }
    return out;
  });
  protected readonly destinatarios = computed(() => this.equipo().filter((v) => !this.rolMsg() || v.puesto === this.rolMsg()).length);
  private readonly rolMsg = signal('');
  protected readonly hace = (iso: string) => fmtAgo(iso);
  protected readonly rol = (r: string) => ROLES[r] ?? r;
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly solicitudes = computed(() => (this.lista() ?? []).filter((v) => v.estado === 'pendiente' || v.estado === 'revision').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly equipo = computed(() => (this.lista() ?? []).filter((v) => v.estado === 'confirmado'));
  protected readonly rechazadas = computed(() => (this.lista() ?? []).filter((v) => v.estado === 'descartado').sort((a, b) => (b.revisadoAt ?? b.createdAt).localeCompare(a.revisadoAt ?? a.createdAt)));
  protected readonly nuevasSemana = computed(() => this.solicitudes().filter((v) => Date.now() - new Date(v.createdAt).getTime() < 7 * 86_400_000).length);
  protected readonly cobertura = computed(() => this.puestos().map((p) => ({ ...p, miembros: this.equipo().filter((v) => v.puesto === p.rol) })));
  protected readonly objetivoTotal = computed(() => this.puestos().reduce((a, p) => a + p.objetivo, 0));
  /** The two roles that need the most people (KPI cards). */
  protected readonly faltan = computed(() => this.cobertura().map((c) => ({ rol: c.rol, nombre: c.nombre, n: c.miembros.length, objetivo: c.objetivo }))
    .sort((a, b) => (b.objetivo - b.n) - (a.objetivo - a.n)).slice(0, 2));
  protected readonly disponibilidades = computed(() => [...new Set((this.lista() ?? []).flatMap((v) => v.disponibilidad.split(',').map((d) => d.trim()).filter(Boolean)))].sort());
  protected readonly filtradas = computed(() => {
    const q = this.q().trim().toLowerCase(), r = this.fRol(), d = this.fDisp(), e = this.fEdad(), st = this.fEstado();
    return this.solicitudes().filter((v) => (!q || `${v.nombre} ${v.email}`.toLowerCase().includes(q)) && (!r || v.roles.includes(r)) && (!d || v.disponibilidad.includes(d))
      && (!e || (e === 'menor') === v.esMenor) && (!st || (st === 'autorizacion' ? v.esMenor && !v.autorizacionUrl : v.estado === st)));
  });

  constructor() {
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
    let t: ReturnType<typeof setTimeout> | undefined;
    const sub = inject(Realtime).events.subscribe((e) => {
      if (!e.tipo.startsWith('cms.voluntario') || this.ocupado()) return;
      clearTimeout(t);
      t = setTimeout(() => void this.cargar(), 500);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(t);
      sub.unsubscribe();
    });
  }

  private get base(): string { return `/api/admin/competiciones/${this.cid()}/voluntarios`; }
  protected cuenta(t: Tab): number { return t === 'solicitudes' ? this.solicitudes().length : t === 'equipo' ? this.equipo().length : this.rechazadas().length; }
  protected ini(n: string): string { return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
  protected estado(v: Voluntario): { l: string; tone: GrTone } {
    if (v.estado === 'confirmado') return { l: `${this.rol(v.puesto)} · ${v.turno}`, tone: 'success' };
    if (v.estado === 'descartado') return { l: 'Rechazada', tone: 'neutral' };
    if (v.esMenor && !v.autorizacionUrl) return { l: 'Menor · sin autorización', tone: 'warning' };
    return v.estado === 'revision' ? { l: 'En revisión', tone: 'warning' } : { l: 'Nueva', tone: 'info' };
  }
  /** «Sábado, Montaje (viernes)» → «Sábado · Montaje (viernes)». */
  protected disp(v: Voluntario): string { return v.disponibilidad.split(',').map((d) => d.trim()).filter(Boolean).join(' · '); }
  /** «Sábado mañana · 7:30–14:30» → «Sábado mañana» (the team cards show the shift without hours). */
  protected turnoCorto(t: string): string { return t.split(' · ')[0]; }
  protected limpiar(): void { this.q.set(''); this.fRol.set(''); this.fDisp.set(''); this.fEdad.set(''); this.fEstado.set(''); }

  protected menuFila(ev: Event, v: Voluntario): void {
    ev.stopPropagation();
    const items: BoMenuItem[] = [{ id: 'revisar', label: 'Revisar y aceptar', icon: 'check' }];
    if (v.estado === 'pendiente') items.push({ id: 'revision', label: 'Marcar en revisión', icon: 'eye' });
    else items.push({ id: 'pendiente', label: 'Devolver a nuevas', icon: 'undo' });
    items.push({ id: 'rechazar', label: 'Rechazar…', icon: 'x', danger: true });
    const r = ((ev.currentTarget ?? ev.target) as HTMLElement).getBoundingClientRect();
    const alto = items.length * 44 + 24;
    this.menu.set({ x: Math.max(8, r.right - 240), y: r.bottom + 4 + alto > innerHeight ? Math.max(8, r.top - alto - 4) : r.bottom + 4, items, fn: (id) => {
      if (id === 'revision' || id === 'pendiente') { this.sel.set(v); void this.cambiarEstado(id); }
      else this.revisar(v, id === 'rechazar' ? 'rechazar' : 'aceptar');
    } });
  }

  async cargar(): Promise<void> {
    try {
      const [l, p] = await Promise.all([firstValueFrom(this.http.get<Voluntario[]>(this.base)), firstValueFrom(this.http.get<Puesto[]>(`${this.base}/puestos`))]);
      this.lista.set(l);
      this.puestos.set(p);
    } catch {
      this.lista.set(null);
    }
  }

  protected revisar(v: Voluntario, modo: 'aceptar' | 'rechazar' = 'aceptar'): void {
    this.sel.set(v);
    this.modo.set(modo);
    this.error.set('');
    this.motivoError.set('');
    const quiere = v.roles.find((r) => ROLES[r]) ?? 'jueces';
    const ts = this.turnos();
    const solo = /montaje/i.test(v.disponibilidad) && !v.disponibilidad.split(',').some((d) => !/montaje/i.test(d) && d.trim());
    const turno = v.turno || (solo ? ts[0] : ts.find((x) => v.disponibilidad.includes(x)) ?? ts[ts.length - 1]);
    this.asig = { puesto: v.puesto && ROLES[v.puesto] ? v.puesto : quiere, turno, responsable: v.responsable || this.auth.user()?.nombre || '', notas: v.notas, avisar: true, autorizacionUrl: v.autorizacionUrl };
    this.re = { motivo: v.motivoRechazo, avisar: false };
    this.abierto.set(true);
  }

  protected async subirAutorizacion(ev: Event): Promise<void> {
    const v = this.sel();
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!v || !f) return;
    this.subiendo.set(true);
    try {
      // private file in cms (not the public media library): it holds a minor's and their guardian's data
      const fd = new FormData();
      fd.append('file', f);
      await firstValueFrom(this.http.post(`${this.base}/${v.id}/autorizacion`, fd));
      this.asig.autorizacionUrl = `${this.base}/${v.id}/autorizacion`;
      this.toasts.success('Autorización subida');
      await this.cargar();
      this.sel.set(this.lista()?.find((x) => x.id === v.id) ?? v);
    } catch (e) {
      this.toasts.error('No se pudo subir la autorización', errText(e));
    } finally {
      this.subiendo.set(false);
    }
  }

  /** Opens the private authorisation (fetched with the session, shown from a blob URL). */
  protected async verAutorizacion(): Promise<void> {
    const v = this.sel();
    if (!v) return;
    const ventana = window.open('', '_blank');
    try {
      const blob = await firstValueFrom(this.http.get(`${this.base}/${v.id}/autorizacion`, { responseType: 'blob' }));
      const url = URL.createObjectURL(blob);
      if (ventana) ventana.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      ventana?.close();
      this.toasts.error('No se pudo abrir la autorización', errText(e));
    }
  }

  protected async aceptar(): Promise<void> {
    const v = this.sel();
    if (!v) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      const avisar = v.estado !== 'confirmado' && this.asig.avisar;
      await firstValueFrom(this.http.post(`${this.base}/${v.id}/aceptar`, { puesto: this.asig.puesto, turno: this.asig.turno, responsable: this.asig.responsable.trim(), notas: this.asig.notas.trim(), avisar }));
      this.abierto.set(false);
      this.toasts.success(v.estado === 'confirmado' ? 'Asignación guardada' : `${v.nombre} ya está en el equipo`, avisar ? `Le hemos escrito a ${v.email}.` : '');
      await this.cargar();
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async rechazar(): Promise<void> {
    const v = this.sel();
    if (!v) return;
    if (this.re.motivo.trim().length < 3) { this.motivoError.set('Escribe el motivo'); return; }
    this.ocupado.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.post(`${this.base}/${v.id}/rechazar`, { motivo: this.re.motivo.trim(), avisar: this.re.avisar }));
      this.abierto.set(false);
      this.toasts.success('Solicitud rechazada', this.re.avisar ? `Le hemos escrito a ${v.email}.` : '');
      await this.cargar();
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async cambiarEstado(estado: 'pendiente' | 'revision'): Promise<void> {
    const v = this.sel();
    if (!v) return;
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.http.post(`${this.base}/${v.id}/estado`, { estado }));
      this.abierto.set(false);
      this.toasts.success(v.estado === 'confirmado' ? `${v.nombre} ha salido del equipo` : estado === 'revision' ? 'Marcada en revisión' : 'Devuelta a nuevas');
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async objetivo(rol: string, valor: string): Promise<void> {
    const n = Math.max(0, Math.min(200, Math.round(+valor || 0)));
    try {
      this.puestos.set(await firstValueFrom(this.http.put<Puesto[]>(`${this.base}/puestos/${rol}`, { objetivo: n })));
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    }
  }

  /** Deletes a rejected request and its personal data. */
  protected async borrar(v: Voluntario): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Borrar la solicitud de ${v.nombre}?`, text: 'Se borran su nombre, email, teléfono y lo que escribió. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.http.delete(`${this.base}/${v.id}`));
      this.toasts.success('Solicitud borrada');
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo borrar', errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  /** «Quitar del equipo»: back to the queue «en revisión» (keeps the request and its notes). */
  protected async quitar(): Promise<void> {
    const v = this.sel();
    if (!v || !(await this.confirm.ask({ title: `¿Quitar a ${v.nombre} del equipo?`, text: 'Su solicitud vuelve a «En revisión» y deja libre su puesto. No se le avisa por email.', confirm: 'Quitar del equipo', danger: true }))) return;
    await this.cambiarEstado('revision');
  }

  protected escribir(rol: string): void {
    this.msg = { rol, asunto: rol ? `Voluntarios · ${this.rol(rol)}` : 'Briefing de voluntarios', mensaje: '' };
    this.rolMsg.set(rol);
    this.msgError.set(false);
    this.error.set('');
    this.escribiendo.set(true);
  }

  protected async enviar(): Promise<void> {
    if (this.msg.asunto.trim().length < 3 || this.msg.mensaje.trim().length < 3) { this.msgError.set(true); return; }
    this.ocupado.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(this.http.post<{ enviados: number }>(`${this.base}/escribir`, { rol: this.msg.rol, asunto: this.msg.asunto.trim(), mensaje: this.msg.mensaje.trim() }));
      this.escribiendo.set(false);
      this.toasts.success(r.enviados === 1 ? 'Email enviado a 1 persona' : `Email enviado a ${r.enviados} personas`);
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  private csv(nombre: string, filas: string[][]): void {
    const esc = (x: string) => `"${(x ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob(['\ufeff' + filas.map((f) => f.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** The team as CSV (role, shift, person in charge, contact) for the day's sheet. */
  protected exportar(): void {
    this.csv('voluntarios-equipo.csv', [['Puesto', 'Turno', 'Nombre', 'Email', 'Teléfono', 'Responsable', 'Menor'], ...this.equipo().map((v) => [this.rol(v.puesto), v.turno, v.nombre, v.email, v.telefono, v.responsable, v.esMenor ? 'sí' : 'no'])]);
  }

  /** The requests on screen (with the filters applied) as CSV. */
  protected exportarSolicitudes(): void {
    this.csv('voluntarios-solicitudes.csv', [['Nombre', 'Email', 'Teléfono', 'Quiere ayudar en', 'Disponibilidad', 'Experiencia', 'Menor', 'Estado', 'Recibida'],
      ...this.filtradas().map((v) => [v.nombre, v.email, v.telefono, v.roles.map(this.rol).join(', '), v.disponibilidad, v.experiencia, v.esMenor ? 'sí' : 'no', this.estado(v).l, v.createdAt.slice(0, 10)])]);
  }
}
