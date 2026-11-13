import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts, type GrTone, fmtAgo } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { Realtime } from '../core/realtime';
import { webPublica } from '../core/web';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, Media, errText } from '../shared/ui';
import { BoMenu, type BoMenuItem, BoPagination } from '../shared/kit';

/** A row of the «clubs» collection (cms): directory entries and the requests from /clubs. */
interface Club {
  id: string; nombre: string; ciudad: string; provincia: string; logoUrl: string; web: string; instagram: string; etiquetas: string;
  rol: 'organizador' | 'colaborador' | 'club'; afiliadoAep: boolean | null; estado: 'publicado' | 'pendiente' | 'oculto' | 'rechazado';
  contactoEmail: string; contactoNombre: string; mensaje: string; motivoRechazo: string; revisadoAt?: string; revisadoPor: string;
  consentimientoAt?: string; abiertaAt?: string; orden: number; createdAt: string;
}
type Tab = 'solicitudes' | 'asociados' | 'rechazadas';
type Ficha = Pick<Club, 'nombre' | 'ciudad' | 'provincia' | 'logoUrl' | 'web' | 'instagram' | 'etiquetas' | 'rol'> & { aep: '' | 'si' | 'no'; visible: boolean };
const ROL: Record<Club['rol'], { l: string; tone: GrTone }> = { organizador: { l: 'Organizador', tone: 'danger' }, colaborador: { l: 'Colaborador', tone: 'info' }, club: { l: 'Club', tone: 'neutral' } };
const DIA = 86_400_000;
const POR_PAGINA = 25;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TH = 'px-4 py-3 text-left text-label-xs font-normal tracking-[0.04em] text-text-tertiary uppercase';

/** «Clubs» (Figma page 67): requests sent from /clubs (approve with role, logo and email · reject with a reason) and the clubs
 *  of the directory (order of /clubs by dragging, role, visibility, edit, add, remove). */
@Component({
  selector: 'bo-clubs',
  imports: [FormsModule, CdkDropList, CdkDrag, CdkDragHandle, BoPageHeader, BoDrawer, BoToggle, BoMenu, BoPagination, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'menu.set(null)' },
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header class="hidden md:flex" title="Clubs" subtitle="Directorio de /clubs y solicitudes de alta" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Clubs']">
        <ng-container actions>
          <a grButton [href]="web + '/clubs'" target="_blank" rel="noopener">Ver /clubs</a>
          <button grButton variant="primary" (click)="nuevo()">Añadir club</button>
        </ng-container>
      </bo-page-header>
      <nav class="hidden gap-1 border-b border-line-subtle md:flex" aria-label="Clubs">
        @for (t of tabs; track t.k) {
          <button type="button" (click)="ir(t.k)" [attr.aria-current]="tab() === t.k ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [class]="tab() === t.k ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
            {{ t.l }}<span class="flex h-5 items-center rounded-xs px-1.5 text-mono-xs" [class]="tab() === t.k ? 'bg-accent/20 text-accent-text' : 'bg-bg-raised text-text-tertiary'">{{ cuenta(t.k) }}</span>
            @if (tab() === t.k) { <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span> }
          </button>
        }
      </nav>
      <div class="flex gap-1 rounded-md border border-line-subtle bg-bg-card p-1 md:hidden" role="tablist" aria-label="Clubs">
        @for (t of tabs; track t.k) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.k" (click)="ir(t.k)" class="h-10 flex-1 truncate rounded-sm px-2 text-label-s" [class]="tab() === t.k ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'">{{ t.m }} {{ cuenta(t.k) }}</button>
        }
      </div>

      @if (l === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar los clubs" text="Comprueba la conexión y vuelve a intentarlo."><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (l === undefined) {
        <div class="hidden grid-cols-4 gap-4 md:grid">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-36 rounded-lg" /> }</div>
        <gr-skeleton class="h-72 rounded-lg" />
      } @else {
        @switch (tab()) {
          @case ('solicitudes') {
            <div class="hidden grid-cols-2 gap-4 md:grid xl:grid-cols-4">
              <gr-kpi label="Solicitudes pendientes" [value]="pendientes().length + ''" [caption]="masAntigua()" [trend]="flat" />
              <gr-kpi label="Clubs asociados" [value]="asociados().length + ''" [caption]="publicados() + ' publicados en /clubs'" [trend]="flat" />
              <gr-kpi label="Aprobadas este mes" [value]="aprobadas().mes + ''" [delta]="aprobadas().delta" [caption]="'vs. ' + aprobadas().antes" [trend]="aprobadas().trend" />
              <gr-kpi label="Tiempo de respuesta" [value]="respuesta()" caption="media" [trend]="flat" />
            </div>
            @if (!pendientes().length) { <gr-empty icon="building" title="Sin solicitudes pendientes" text="Las solicitudes llegan del formulario «Añade tu club» de /clubs." /> }
            @else {
              <section class="hidden overflow-hidden rounded-lg border border-line-subtle bg-bg-card md:block">
                <table class="w-full table-fixed">
                  <thead class="border-b border-line-subtle"><tr><th class="${TH} w-[25%]">Club</th><th class="${TH} w-[13%]">Provincia</th><th class="${TH}">Contacto</th><th class="${TH} w-[9.5%]">AEP</th><th class="${TH} w-[12%]">Recibida</th><th class="${TH} w-[14%]">Estado</th><th class="w-14"></th></tr></thead>
                  <tbody>
                    @for (c of pagina(); track c.id) {
                      <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" [class.bg-accent/6]="abierto() && sel()?.id === c.id" (click)="revisar(c)">
                        <td class="px-4 py-2.5"><span class="flex items-center gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-label-xs">{{ ini(c.nombre) }}</span><span class="min-w-0"><span class="block truncate text-label-m">{{ c.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.ciudad || '—' }}</span></span></span></td>
                        <td class="px-4 py-2.5 text-body-m">{{ c.provincia || '—' }}</td>
                        <td class="px-4 py-2.5 text-body-m break-words">{{ c.contactoNombre || '—' }}@if (c.contactoEmail) { · {{ c.contactoEmail }} }</td>
                        <td class="px-4 py-2.5"><gr-badge [tone]="aep(c).tone">{{ aep(c).l }}</gr-badge></td>
                        <td class="px-4 py-2.5 text-body-m">{{ recibida(c.createdAt) }}</td>
                        <td class="px-4 py-2.5"><gr-badge [tone]="c.abiertaAt ? 'warning' : 'info'">{{ c.abiertaAt ? 'En revisión' : 'Nueva' }}</gr-badge></td>
                        <td class="px-2 text-right"><button grIconButton icon="more" [label]="'Acciones de ' + c.nombre" (click)="menuSolicitud($event, c)"></button></td>
                      </tr>
                    }
                  </tbody>
                </table>
                <footer class="flex items-center justify-between gap-4 border-t border-line-subtle px-4 py-3"><span class="text-body-xs text-text-tertiary">{{ pendientes().length }} {{ pendientes().length === 1 ? 'solicitud' : 'solicitudes' }}</span>@if (paginas() > 1) { <bo-pagination [page]="pag()" [pages]="paginas()" (change)="pag.set($event)" /> }</footer>
              </section>
              <ul class="flex flex-col gap-4 md:hidden">
                @for (c of pendientes(); track c.id) {
                  <li class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
                    <button type="button" class="flex flex-col items-start gap-1 text-left" (click)="revisar(c)"><span class="text-[18px] leading-6 font-semibold">{{ c.nombre }}</span><span class="text-body-xs text-text-tertiary">{{ lugar(c) }}{{ c.afiliadoAep ? ' · AEP' : '' }}</span></button>
                    <gr-badge class="self-start" [tone]="c.abiertaAt ? 'warning' : 'info'">{{ c.abiertaAt ? 'En revisión' : 'Nueva' }}</gr-badge>
                    <div class="grid grid-cols-2 gap-2"><button grButton (click)="revisar(c, 'rechazar')">Rechazar</button><button grButton variant="primary" (click)="revisar(c)">Aprobar</button></div>
                  </li>
                }
              </ul>
            }
          }
          @case ('asociados') {
            @if (!asociados().length) { <gr-empty icon="building" title="Todavía no hay clubs en el directorio" text="Aprueba una solicitud o añade un club a mano."><button grButton variant="primary" (click)="nuevo()">Añadir club</button></gr-empty> }
            @else {
              <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                <div class="hidden border-b border-line-subtle md:grid md:grid-cols-[40px_minmax(0,33%)_minmax(0,1fr)_170px_96px_130px_56px]"><span></span><span class="${TH}">Club</span><span class="${TH}">Ciudad</span><span class="${TH}">Papel</span><span class="${TH}">AEP</span><span class="${TH}">En la web</span><span></span></div>
                <ul cdkDropList [cdkDropListDisabled]="ocupado()" (cdkDropListDropped)="soltar($event)" class="divide-y divide-line-subtle">
                  @for (c of asociados(); track c.id) {
                    <li cdkDrag [cdkDragData]="c" class="grid grid-cols-[32px_minmax(0,1fr)_44px] items-center bg-bg-card py-2.5 md:grid-cols-[40px_minmax(0,33%)_minmax(0,1fr)_170px_96px_130px_56px] md:py-2.5">
                      <span cdkDragHandle class="flex h-11 cursor-grab items-center justify-center text-text-muted active:cursor-grabbing" [attr.aria-label]="'Arrastrar ' + c.nombre" title="Arrastra para cambiar el orden"><gr-icon name="grip" [size]="16" /></span>
                      <span class="flex min-w-0 items-center gap-3 md:px-1">
                        <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-bg-raised">@if (c.logoUrl) { <img [src]="logo(c.logoUrl)" alt="" class="size-full object-contain p-0.5" /> } @else { <span class="text-label-xs">{{ ini(c.nombre) }}</span> }</span>
                        <span class="min-w-0"><span class="block truncate text-label-m">{{ c.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.ciudad || 'Por confirmar' }}</span>
                          <span class="mt-1.5 flex flex-wrap gap-1.5 md:hidden"><gr-badge [tone]="rol[c.rol].tone">{{ rol[c.rol].l }}</gr-badge><gr-badge [tone]="c.estado === 'publicado' ? 'success' : 'neutral'">{{ c.estado === 'publicado' ? 'Visible' : 'Oculto' }}</gr-badge></span></span>
                      </span>
                      <span class="hidden truncate px-4 text-body-m md:block">{{ lugarDirectorio(c) }}</span>
                      <span class="hidden px-4 md:block"><gr-badge [tone]="rol[c.rol].tone">{{ rol[c.rol].l }}</gr-badge></span>
                      <span class="hidden px-4 md:block"><gr-badge [tone]="aep(c).tone">{{ aep(c).l }}</gr-badge></span>
                      <span class="hidden px-4 md:block"><gr-badge [tone]="c.estado === 'publicado' ? 'success' : 'neutral'">{{ c.estado === 'publicado' ? 'Visible' : 'Oculto' }}</gr-badge></span>
                      <span class="flex justify-end pr-2"><button grIconButton icon="more" [label]="'Acciones de ' + c.nombre" [disabled]="ocupado()" (click)="menuAsociado($event, c)"></button></span>
                    </li>
                  }
                </ul>
                <p class="border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">{{ asociados().length }} {{ asociados().length === 1 ? 'club' : 'clubs' }} · arrastra para cambiar el orden de /clubs</p>
              </section>
              <button grButton variant="primary" class="md:hidden" (click)="nuevo()">Añadir club</button>
            }
          }
          @case ('rechazadas') {
            @if (!rechazadas().length) { <gr-empty icon="building" title="Sin solicitudes rechazadas" text="Las solicitudes que rechaces se quedan aquí con su motivo." /> }
            @else {
              <p class="text-body-xs text-text-tertiary">Guardan el nombre, el email y el mensaje de quien las envió: bórralas cuando ya no hagan falta.</p>
              <ul class="flex flex-col gap-3">
                @for (c of rechazadas(); track c.id) {
                  <li class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4 md:flex-row md:items-center md:gap-4">
                    <span class="min-w-0 flex-1"><span class="block text-label-m">{{ c.nombre }} <span class="text-body-xs font-normal text-text-tertiary">· {{ lugar(c) }}</span></span>
                      <span class="block text-body-s text-text-secondary">«{{ c.motivoRechazo }}»</span>
                      <span class="block text-body-xs text-text-tertiary">{{ c.revisadoPor || 'Equipo' }}{{ c.revisadoAt ? ' · ' + hace(c.revisadoAt) : '' }}</span></span>
                    <span class="grid grid-cols-2 gap-2 md:flex"><button grButton size="s" (click)="revisar(c)">Revisar de nuevo</button><button grButton size="s" variant="danger" icon="trash" [disabled]="ocupado()" (click)="borrar(c)">Borrar</button></span>
                  </li>
                }
              </ul>
            }
          }
        }
      }
    </div>

    @if (menu(); as m) {
      <div class="fixed inset-0 z-40" (click)="menu.set(null)"></div>
      <bo-menu class="fixed z-50" [style.left.px]="m.x" [style.top.px]="m.y" [items]="m.items" (pick)="menu.set(null); m.fn($event)" />
    }

    <!-- Review a request (Figma 67 «Clubs · revisar solicitud») -->
    <bo-drawer [(open)]="abierto" [title]="sel()?.nombre || 'Solicitud'" [sub]="sel() ? 'Solicitud recibida ' + cuando(sel()!.createdAt) + ' desde /clubs' : ''">
      @if (sel(); as c) {
        <div class="flex flex-col gap-5">
          <div class="-mt-2 flex flex-wrap gap-2">
            @if (c.estado === 'rechazado') { <gr-badge tone="danger">Rechazada</gr-badge> } @else { <gr-badge [tone]="c.abiertaAt ? 'warning' : 'info'">{{ c.abiertaAt ? 'En revisión' : 'Nueva' }}</gr-badge> }
            @if (c.afiliadoAep) { <gr-badge tone="success">Afiliado AEP</gr-badge> }
          </div>
          <section><h3 class="text-label-xs tracking-[0.04em] text-text-muted uppercase">Club</h3>
            <dl class="mt-1 text-body-m">
              @for (r of filasClub(c); track r[0]) { <div class="flex min-h-11 items-center justify-between gap-4 py-2"><dt class="text-text-secondary">{{ r[0] }}</dt><dd class="min-w-0 truncate text-right">@if (r[2]) { <a [href]="r[2]" target="_blank" rel="noopener" class="hover:underline">{{ r[1] }}</a> } @else { {{ r[1] }} }</dd></div> }
            </dl>
          </section>
          <section><h3 class="text-label-xs tracking-[0.04em] text-text-muted uppercase">Contacto (no se publica)</h3>
            <dl class="mt-1 text-body-m">
              <div class="flex min-h-11 items-center justify-between gap-4 py-2"><dt class="text-text-secondary">Persona</dt><dd>{{ c.contactoNombre || '—' }}</dd></div>
              <div class="flex min-h-11 items-center justify-between gap-4 py-2"><dt class="text-text-secondary">Email</dt><dd class="truncate">@if (c.contactoEmail) { <a [href]="'mailto:' + c.contactoEmail" class="hover:underline">{{ c.contactoEmail }}</a> } @else { — }</dd></div>
            </dl>
          </section>
          @if (c.mensaje) { <section><h3 class="text-label-xs tracking-[0.04em] text-text-muted uppercase">Mensaje</h3><p class="mt-2 text-body-m whitespace-pre-line">«{{ c.mensaje }}»</p></section> }
          @if (c.estado === 'rechazado' && c.motivoRechazo) { <gr-alert tone="danger" title="Rechazada">«{{ c.motivoRechazo }}» · {{ c.revisadoPor || 'Equipo' }}</gr-alert> }
          @if (modo() === 'aprobar') {
            <section class="flex flex-col gap-4"><h3 class="text-label-xs tracking-[0.04em] text-text-muted uppercase">Al aprobar</h3>
              <div class="grid gap-4 sm:grid-cols-2">
                <gr-field label="Papel en el directorio" for="ap-rol"><gr-select id="ap-rol" [(ngModel)]="ap.rol"><option value="club">Club</option><option value="colaborador">Colaborador</option><option value="organizador">Organizador</option></gr-select></gr-field>
                <gr-field label="Logo" [optional]="true">
                  <label class="flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-bg-field px-3 text-body-m hover:border-text-muted focus-within:border-accent">
                    @if (ap.logoUrl) { <img [src]="logo(ap.logoUrl)" alt="" class="size-7 rounded-xs object-contain" /> }
                    <span class="truncate">{{ subiendo() ? 'Subiendo…' : ap.logoUrl ? 'Cambiar imagen…' : 'Subir imagen…' }}</span>
                    <input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" class="sr-only" (change)="subirLogo($event, ap)" />
                  </label>
                </gr-field>
              </div>
              <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-m">Avisar por email</p><p class="text-body-xs text-text-tertiary">@if (c.contactoEmail) { Se envía «Tu club ya está en el directorio de la GR Strength Cup» a {{ c.contactoEmail }} } @else { Sin email de contacto: no se puede avisar }</p></div><bo-toggle [(value)]="ap.avisar" label="Avisar por email" [disabled]="!c.contactoEmail" /></div>
            </section>
          } @else {
            <section class="flex flex-col gap-4"><h3 class="text-label-xs tracking-[0.04em] text-text-muted uppercase">Rechazar</h3>
              <gr-field label="Motivo" for="re-motivo" hint="Se guarda; si avisas, va en el email" [error]="motivoError()"><textarea grInput id="re-motivo" rows="3" maxlength="400" [(ngModel)]="re.motivo" (ngModelChange)="motivoError.set('')" placeholder="p. ej. No hemos podido verificar el club con la web ni las redes."></textarea></gr-field>
              <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-m">Avisar por email</p><p class="text-body-xs text-text-tertiary">@if (c.contactoEmail) { Con el motivo, a {{ c.contactoEmail }} } @else { Sin email de contacto: no se puede avisar }</p></div><bo-toggle [(value)]="re.avisar" label="Avisar del rechazo por email" [disabled]="!c.contactoEmail" /></div>
            </section>
          }
          @if (error()) { <gr-alert tone="danger" title="No se pudo guardar">{{ error() }}</gr-alert> }
        </div>
      }
      <ng-container drawerActions>
        @if (modo() === 'aprobar') {
          @if (sel()?.estado === 'pendiente') { <button grButton variant="danger" (click)="modo.set('rechazar')">Rechazar…</button> }
          <button grButton variant="primary" [loading]="ocupado()" (click)="aprobar()">Aprobar y publicar</button>
        } @else {
          <button grButton variant="ghost" (click)="modo.set('aprobar'); motivoError.set('')">Volver</button>
          <button grButton variant="danger" [loading]="ocupado()" (click)="rechazar()">Rechazar solicitud</button>
        }
      </ng-container>
    </bo-drawer>

    <!-- Add or edit a club of the directory -->
    <bo-drawer [(open)]="editando" [title]="editId() ? 'Editar club' : 'Añadir club'" [sub]="editId() ? 'Los cambios se ven en /clubs al guardar' : 'Se añade al final del directorio de /clubs'">
      <div class="flex flex-col gap-4">
        <gr-field label="Nombre" for="ed-nombre" [error]="nombreError()"><input grInput id="ed-nombre" maxlength="120" [(ngModel)]="ed.nombre" (ngModelChange)="nombreError.set('')" /></gr-field>
        <div class="grid gap-4 sm:grid-cols-2">
          <gr-field label="Ciudad" for="ed-ciudad" [optional]="true" hint="Vacía: «Por confirmar»"><input grInput id="ed-ciudad" maxlength="80" [(ngModel)]="ed.ciudad" /></gr-field>
          <gr-field label="Provincia" for="ed-prov" [optional]="true"><input grInput id="ed-prov" maxlength="40" [(ngModel)]="ed.provincia" /></gr-field>
          <gr-field label="Web" for="ed-web" [optional]="true"><input grInput id="ed-web" type="url" maxlength="300" placeholder="https://" [(ngModel)]="ed.web" /></gr-field>
          <gr-field label="Instagram" for="ed-ig" [optional]="true"><input grInput id="ed-ig" type="url" maxlength="300" placeholder="https://instagram.com/…" [(ngModel)]="ed.instagram" /></gr-field>
          <gr-field label="Papel" for="ed-rol"><gr-select id="ed-rol" [(ngModel)]="ed.rol"><option value="club">Club</option><option value="colaborador">Colaborador</option><option value="organizador">Organizador</option></gr-select></gr-field>
          <gr-field label="Afiliado a la AEP" for="ed-aep"><gr-select id="ed-aep" [(ngModel)]="ed.aep"><option value="si">Sí</option><option value="no">No</option><option value="">Sin respuesta</option></gr-select></gr-field>
        </div>
        <gr-field label="Etiquetas" for="ed-tags" [optional]="true" hint="Separadas por comas (p. ej. Powerlifting, Escuela)"><input grInput id="ed-tags" maxlength="120" [(ngModel)]="ed.etiquetas" /></gr-field>
        <gr-field label="Logo" [optional]="true">
          <label class="flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-bg-field px-3 text-body-m hover:border-text-muted focus-within:border-accent">
            @if (ed.logoUrl) { <img [src]="logo(ed.logoUrl)" alt="" class="size-7 rounded-xs object-contain" /> }
            <span class="flex-1 truncate">{{ subiendo() ? 'Subiendo…' : ed.logoUrl ? 'Cambiar imagen…' : 'Subir imagen…' }}</span>
            <input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" class="sr-only" (change)="subirLogo($event, ed)" />
          </label>
        </gr-field>
        <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-m">Visible en /clubs</p><p class="text-body-xs text-text-tertiary">Oculto: sigue en la lista, pero no se publica</p></div><bo-toggle [(value)]="ed.visible" label="Visible en /clubs" /></div>
        @if (error()) { <gr-alert tone="danger" title="No se pudo guardar">{{ error() }}</gr-alert> }
      </div>
      <ng-container drawerActions>
        @if (editId()) { <button grButton variant="danger" class="mr-auto" [disabled]="ocupado()" (click)="quitar()">Quitar</button> }
        <button grButton variant="ghost" (click)="editando.set(false)">Cancelar</button>
        <button grButton variant="primary" [loading]="ocupado()" [disabled]="subiendo()" (click)="guardarFicha()">{{ editId() ? 'Guardar' : 'Añadir club' }}</button>
      </ng-container>
    </bo-drawer>
  `,
})
export class ClubsPage {
  protected readonly comps = inject(Competitions);
  private readonly http = inject(HttpClient);
  private readonly toasts = inject(GrToasts);
  private readonly media = inject(Media);
  private readonly confirm = inject(Confirm);
  protected readonly web = webPublica();
  protected readonly lista = signal<Club[] | null | undefined>(undefined);
  protected readonly tab = signal<Tab>('solicitudes');
  protected readonly sel = signal<Club | null>(null);
  protected readonly abierto = signal(false);
  protected readonly editando = signal(false);
  protected readonly editId = signal('');
  protected readonly modo = signal<'aprobar' | 'rechazar'>('aprobar');
  protected readonly ocupado = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly error = signal('');
  protected readonly motivoError = signal('');
  protected readonly nombreError = signal('');
  protected readonly pag = signal(1);
  protected readonly menu = signal<{ x: number; y: number; items: BoMenuItem[]; fn: (id: string) => void } | null>(null);
  protected ap = { rol: 'club' as Club['rol'], logoUrl: '', avisar: true };
  protected re = { motivo: '', avisar: false };
  protected ed: Ficha = this.fichaVacia();
  protected readonly tabs: { k: Tab; l: string; m: string }[] = [{ k: 'solicitudes', l: 'Solicitudes', m: 'Solicitudes' }, { k: 'asociados', l: 'Clubs asociados', m: 'Asociados' }, { k: 'rechazadas', l: 'Rechazadas', m: 'Rechazadas' }];
  protected readonly rol = ROL;
  protected readonly flat = [1, 1, 1, 1, 1, 1];
  protected readonly hace = (iso: string) => fmtAgo(iso);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly pendientes = computed(() => (this.lista() ?? []).filter((c) => c.estado === 'pendiente').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.pendientes().length / POR_PAGINA)));
  protected readonly pagina = computed(() => {
    const p = Math.min(this.pag(), this.paginas());
    return this.pendientes().slice((p - 1) * POR_PAGINA, p * POR_PAGINA);
  });
  protected readonly asociados = computed(() => (this.lista() ?? []).filter((c) => c.estado === 'publicado' || c.estado === 'oculto').sort((a, b) => a.orden - b.orden));
  protected readonly rechazadas = computed(() => (this.lista() ?? []).filter((c) => c.estado === 'rechazado').sort((a, b) => (b.revisadoAt ?? '').localeCompare(a.revisadoAt ?? '')));
  protected readonly publicados = computed(() => this.asociados().filter((c) => c.estado === 'publicado').length);
  protected readonly masAntigua = computed(() => {
    const p = this.pendientes();
    return p.length ? 'la más antigua, ' + this.recibida(p[p.length - 1].createdAt) : 'ninguna esperando';
  });
  /** Requests approved this month, the change against last month and one point per month (last 6). */
  protected readonly aprobadas = computed(() => {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    const fechas = this.asociados().filter((c) => c.revisadoAt && c.consentimientoAt).map((c) => new Date(c.revisadoAt!));
    const del = (k: number) => {
      const a = new Date(y, m - k, 1);
      return fechas.filter((f) => f.getFullYear() === a.getFullYear() && f.getMonth() === a.getMonth()).length;
    };
    const mes = del(0), dif = mes - del(1);
    return { mes, delta: dif > 0 ? '+' + dif : dif < 0 ? String(dif) : null, antes: MESES[(m + 11) % 12], trend: [5, 4, 3, 2, 1, 0].map(del) };
  });
  /** Mean time from a request to its review (requests sent from the form only). */
  protected readonly respuesta = computed(() => {
    const r = (this.lista() ?? []).filter((c) => c.revisadoAt && c.consentimientoAt).map((c) => new Date(c.revisadoAt!).getTime() - new Date(c.createdAt).getTime());
    if (!r.length) return '—';
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    return m < DIA ? `${Math.max(1, Math.round(m / 3_600_000))} h` : `${(m / DIA).toLocaleString('es-ES', { maximumFractionDigits: 1 })} días`;
  });

  constructor() {
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
    let t: ReturnType<typeof setTimeout> | undefined;
    const sub = inject(Realtime).events.subscribe((e) => {
      if (!e.tipo.startsWith('cms.club') || this.ocupado()) return;
      clearTimeout(t);
      t = setTimeout(() => void this.cargar(), 500);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(t);
      sub.unsubscribe();
    });
  }

  private get base(): string { return `/api/admin/competiciones/${this.cid()}`; }
  protected cuenta(t: Tab): number { return t === 'solicitudes' ? this.pendientes().length : t === 'asociados' ? this.asociados().length : this.rechazadas().length; }
  protected ir(t: Tab): void { this.tab.set(t); this.menu.set(null); }
  protected ini(n: string): string { return n.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
  protected logo(u: string): string { return u.startsWith('/api/') ? this.web + u : u; }
  protected aep(c: Club): { l: string; tone: GrTone } { return c.afiliadoAep ? { l: 'Sí', tone: 'success' } : c.afiliadoAep === false ? { l: 'No', tone: 'neutral' } : { l: '—', tone: 'neutral' }; }
  protected lugar(c: Club): string { return [c.ciudad, c.provincia && c.provincia !== c.ciudad ? c.provincia : ''].filter(Boolean).join(' · ') || 'Por confirmar'; }
  /** «Alcoy (Alicante)», «Valencia», «Por confirmar». */
  protected lugarDirectorio(c: Club): string {
    if (!c.ciudad) return 'Por confirmar';
    return c.provincia && !c.ciudad.toLowerCase().includes(c.provincia.toLowerCase()) ? `${c.ciudad} (${c.provincia})` : c.ciudad;
  }
  /** «hoy», «ayer», «hace 3 días». */
  protected recibida(iso: string): string {
    const d = new Date(iso), h = new Date();
    const dias = Math.round((new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DIA);
    return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
  }
  /** «hoy a las 10:42», «ayer a las 9:05», «el 8 nov. a las 11:00». */
  protected cuando(iso: string): string {
    const d = new Date(iso), r = this.recibida(iso), hora = d.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' });
    const dia = r === 'hoy' || r === 'ayer' ? r : 'el ' + d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return `${dia} a las ${hora}`;
  }
  protected filasClub(c: Club): [string, string, string][] {
    const ig = c.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
    return [
      ['Ciudad', c.ciudad ? `${c.ciudad}${c.provincia ? ' (' + c.provincia + ')' : ''}` : '—', ''],
      ['Web', c.web || '—', c.web],
      ['Instagram', c.instagram ? (ig.startsWith('@') ? ig : '@' + ig) : '—', c.instagram.startsWith('http') ? c.instagram : c.instagram ? 'https://instagram.com/' + ig.replace(/^@/, '') : ''],
      ['Afiliado a la AEP', c.afiliadoAep ? 'Sí' : c.afiliadoAep === false ? 'No' : 'Sin respuesta', ''],
    ];
  }

  async cargar(): Promise<void> {
    try {
      this.lista.set(await firstValueFrom(this.http.get<Club[]>(`${this.base}/web/clubs`)));
    } catch {
      if (this.lista() === undefined) this.lista.set(null);
      else this.toasts.error('No se pudo actualizar la lista de clubs');
    }
  }

  private abrirMenu(ev: Event, items: BoMenuItem[], fn: (id: string) => void): void {
    ev.stopPropagation();
    const r = ((ev.currentTarget ?? ev.target) as HTMLElement).getBoundingClientRect();
    const alto = items.length * 44 + 24;
    this.menu.set({ x: Math.max(8, r.right - 240), y: r.bottom + 4 + alto > innerHeight ? Math.max(8, r.top - alto - 4) : r.bottom + 4, items, fn });
  }
  protected menuSolicitud(ev: Event, c: Club): void {
    this.abrirMenu(ev, [{ id: 'revisar', label: 'Revisar y aprobar', icon: 'check' }, { id: 'rechazar', label: 'Rechazar…', icon: 'x', danger: true }], (id) => this.revisar(c, id === 'rechazar' ? 'rechazar' : 'aprobar'));
  }
  protected menuAsociado(ev: Event, c: Club): void {
    const i = this.asociados().indexOf(c), n = this.asociados().length;
    const items: BoMenuItem[] = [{ id: 'editar', label: 'Editar', icon: 'pencil' }, { id: 'ver', label: c.estado === 'publicado' ? 'Ocultar en /clubs' : 'Mostrar en /clubs', icon: 'eye' }];
    if (i > 0) items.push({ id: 'subir', label: 'Subir', icon: 'arrow-up' });
    if (i < n - 1) items.push({ id: 'bajar', label: 'Bajar', icon: 'arrow-down' });
    items.push({ id: 'quitar', label: 'Quitar del directorio', icon: 'trash', danger: true });
    this.abrirMenu(ev, items, (id) => {
      if (id === 'editar') this.editar(c);
      else if (id === 'ver') void this.guardar(c, { estado: c.estado === 'publicado' ? 'oculto' : 'publicado' });
      else if (id === 'subir' || id === 'bajar') void this.ordenar(i, id === 'subir' ? i - 1 : i + 1);
      else void this.quitar(c);
    });
  }

  protected revisar(c: Club, modo: 'aprobar' | 'rechazar' = 'aprobar'): void {
    this.sel.set(c);
    this.modo.set(modo);
    this.error.set('');
    this.motivoError.set('');
    this.ap = { rol: c.rol || 'club', logoUrl: c.logoUrl, avisar: !!c.contactoEmail };
    this.re = { motivo: c.motivoRechazo, avisar: false };
    this.abierto.set(true);
    if (c.estado === 'pendiente' && !c.abiertaAt) void this.marcarEnRevision(c);
  }

  /** First look at a request: «Nueva» → «En revisión» (for everyone, through the bus). */
  private async marcarEnRevision(c: Club): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.base}/clubs/${c.id}/abrir`, {}));
      const ahora = new Date().toISOString();
      this.lista.update((l) => l?.map((x) => (x.id === c.id ? { ...x, abiertaAt: ahora } : x)));
      this.sel.update((s) => (s?.id === c.id ? { ...s, abiertaAt: ahora } : s));
    } catch { /* it stays «Nueva»: harmless */ }
  }

  protected async subirLogo(ev: Event, dest: { logoUrl: string }): Promise<void> {
    const input = ev.target as HTMLInputElement, f = input.files?.[0];
    if (!f) return;
    this.subiendo.set(true);
    try { dest.logoUrl = await this.media.upload(f, 'Logo de ' + (this.sel()?.nombre || this.ed.nombre || 'club')); } catch (e) { this.toasts.error('No se pudo subir el logo', errText(e)); } finally { this.subiendo.set(false); input.value = ''; }
  }

  protected async aprobar(): Promise<void> {
    const c = this.sel();
    if (!c) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.post(`${this.base}/clubs/${c.id}/aprobar`, this.ap));
      this.abierto.set(false);
      this.toasts.success(`${c.nombre} ya está en /clubs`, this.ap.avisar ? `Le hemos escrito a ${c.contactoEmail}.` : 'Sin aviso por email.');
      await this.cargar();
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async rechazar(): Promise<void> {
    const c = this.sel();
    if (!c) return;
    if (this.re.motivo.trim().length < 3) { this.motivoError.set('Escribe el motivo del rechazo'); return; }
    this.ocupado.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.post(`${this.base}/clubs/${c.id}/rechazar`, { motivo: this.re.motivo.trim(), avisar: this.re.avisar }));
      this.abierto.set(false);
      this.toasts.success('Solicitud rechazada', this.re.avisar ? `Le hemos escrito a ${c.contactoEmail}.` : 'Sin aviso por email.');
      await this.cargar();
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  private fichaVacia(): Ficha {
    return { nombre: '', ciudad: '', provincia: '', logoUrl: '', web: '', instagram: '', etiquetas: '', rol: 'club', aep: '', visible: true };
  }
  protected nuevo(): void {
    this.ed = this.fichaVacia();
    this.editId.set('');
    this.error.set('');
    this.nombreError.set('');
    this.editando.set(true);
  }
  protected editar(c: Club): void {
    this.ed = { nombre: c.nombre, ciudad: c.ciudad, provincia: c.provincia, logoUrl: c.logoUrl, web: c.web, instagram: c.instagram, etiquetas: c.etiquetas, rol: c.rol, aep: c.afiliadoAep ? 'si' : c.afiliadoAep === false ? 'no' : '', visible: c.estado === 'publicado' };
    this.editId.set(c.id);
    this.error.set('');
    this.nombreError.set('');
    this.editando.set(true);
  }
  protected async guardarFicha(): Promise<void> {
    const e = this.ed;
    if (e.nombre.trim().length < 2) { this.nombreError.set('Escribe el nombre del club'); return; }
    const body = { nombre: e.nombre.trim(), ciudad: e.ciudad.trim(), provincia: e.provincia.trim(), logoUrl: e.logoUrl, web: e.web.trim(), instagram: e.instagram.trim(), etiquetas: e.etiquetas.trim(), rol: e.rol, afiliadoAep: e.aep === '' ? null : e.aep === 'si', estado: e.visible ? 'publicado' : 'oculto' };
    this.ocupado.set(true);
    this.error.set('');
    try {
      const id = this.editId();
      await firstValueFrom(id ? this.http.put(`${this.base}/web/clubs/${id}`, body) : this.http.post(`${this.base}/web/clubs`, body));
      this.editando.set(false);
      this.toasts.success(id ? 'Club guardado' : `${body.nombre} añadido al directorio`, body.estado === 'publicado' ? 'Ya se ve en /clubs.' : 'Oculto: no se ve en /clubs.');
      if (!id) this.tab.set('asociados');
      await this.cargar();
    } catch (err) {
      this.error.set(errText(err));
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Inline changes of a directory club (visibility) through the «clubs» collection. */
  protected async guardar(c: Club, cambio: Partial<Pick<Club, 'rol' | 'estado'>>): Promise<void> {
    this.ocupado.set(true);
    try {
      const body = { nombre: c.nombre, ciudad: c.ciudad, provincia: c.provincia, logoUrl: c.logoUrl, web: c.web, instagram: c.instagram, etiquetas: c.etiquetas, rol: c.rol, afiliadoAep: c.afiliadoAep, estado: c.estado, ...cambio };
      await firstValueFrom(this.http.put(`${this.base}/web/clubs/${c.id}`, body));
      if (cambio.estado) this.toasts.success(cambio.estado === 'publicado' ? `${c.nombre} se ve en /clubs` : `${c.nombre} oculto en /clubs`);
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
      await this.cargar();
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Removes a club of the directory (from the menu or the edit drawer). */
  protected async quitar(c?: Club): Promise<void> {
    const club = c ?? this.asociados().find((x) => x.id === this.editId());
    if (!club) return;
    if (!(await this.confirm.ask({ title: `¿Quitar ${club.nombre} del directorio?`, text: 'Deja de verse en /clubs y se borra de la lista. Si solo quieres que no se vea, ocúltalo.', confirm: 'Quitar', danger: true }))) return;
    if (await this.borrarClub(club, 'Club quitado del directorio')) this.editando.set(false);
  }

  /** Deletes a rejected request and the personal data it holds (contact, email, message). */
  protected async borrar(c: Club): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Borrar la solicitud de ${c.nombre}?`, text: 'Se borran el club, la persona de contacto, su email y el mensaje. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
    await this.borrarClub(c, 'Solicitud borrada');
  }

  private async borrarClub(c: Club, ok: string): Promise<boolean> {
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.http.delete(`${this.base}/web/clubs/${c.id}`));
      this.toasts.success(ok);
      await this.cargar();
      return true;
    } catch (e) {
      this.toasts.error('No se pudo borrar', errText(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  protected soltar(ev: CdkDragDrop<unknown>): void {
    if (ev.previousIndex !== ev.currentIndex) void this.ordenar(ev.previousIndex, ev.currentIndex);
  }

  /** Moves a club in the order of /clubs (drag and drop, or «Subir»/«Bajar» from the menu). */
  protected async ordenar(de: number, a: number): Promise<void> {
    const l = [...this.asociados()];
    moveItemInArray(l, de, a);
    const orden = new Map(l.map((c, i) => [c.id, i + 1]));
    this.lista.update((x) => x?.map((c) => (orden.has(c.id) ? { ...c, orden: orden.get(c.id)! } : c)));
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.http.put(`${this.base}/web/clubs/orden`, { ids: l.map((c) => c.id) }));
    } catch (e) {
      this.toasts.error('No se pudo reordenar', errText(e));
      await this.cargar();
    } finally {
      this.ocupado.set(false);
    }
  }
}
