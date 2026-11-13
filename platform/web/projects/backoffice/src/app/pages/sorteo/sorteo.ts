import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, BoToggle, Confirm, Media, errText } from '../../shared/ui';
import { RifaApi, euros, eurosCorto, type RifaConfig, type RifaHistorial, type RifaItem, type RifaItemIn } from './api';

type Tab = 'items' | 'config' | 'ganadores' | 'historial';
/** «20/12/2026 21:00» (es-ES, 24 h) ⇄ ISO; native datetime-local follows the browser locale (12 h in en-US). */
const aLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const deLocal = (v: string): string | null | undefined => {
  if (!v.trim()) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  return d.getDate() === +m[1] && +m[4] < 24 && +m[5] < 60 ? d.toISOString() : undefined;
};
const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', hour12: false, timeZone: 'Europe/Madrid' }).format(new Date(iso));
const fechaSorteo = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace(/[.,]/g, '').replace(/(\d{2}:\d{2})/, 'a las $1') : '';
const vacio = (): RifaItemIn => ({ nombre: '', descripcion: '', imagenUrl: null, valorEstimadoCents: null, donante: null, unidades: 1, visible: true });

/** «Rifa» (Figma page 60 · BO · Rifa items): the in-person raffle showcase — ordered objects, cash ticket info,
 *  create/edit an object with its BunnyCDN photo and (optionally) the winning ticket of each object. */
@Component({
  selector: 'bo-sorteo',
  imports: [FormsModule, NgTemplateOutlet, CdkDropList, CdkDrag, CdkDragHandle, BoPageHeader, BoToggle, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.cdk-drag-preview{box-shadow:0 12px 32px rgb(0 0 0/.5)}.cdk-drag-animating,.cdk-drop-list-dragging .cdk-drag{transition:transform .2s ease}@media (prefers-reduced-motion:reduce){.cdk-drag-animating,.cdk-drop-list-dragging .cdk-drag{transition:none}}`,
  template: `
    @let its = items(); @let c = cfg();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      @if (editando(); as e) {
        <bo-page-header [title]="e.id ? 'Editar item' : 'Nuevo item'" [crumbs]="crumbs()"
          [subtitle]="'Rifa · ' + (e.id ? 'item ' + (posicion(e.id) + 1) + ' de ' + (its?.length ?? 0) : 'nuevo item') + ' · los cambios se publican al guardar'">
          @if (e.id && puede()) { <ng-container actions><button grButton variant="secondary" (click)="borrar()">Eliminar item</button></ng-container> }
        </bo-page-header>
      } @else {
        <bo-page-header [title]="tab() === 'ganadores' ? 'Rifa · ganadores' : tab() === 'historial' ? 'Rifa · historial' : 'Rifa · items'" [crumbs]="crumbs()"
          [badge]="tab() !== 'items' || !c ? '' : c.visible ? 'Publicada' : 'Oculta'" [badgeTone]="c?.visible ? 'warning' : 'neutral'" [subtitle]="subtitulo()">
          @if (tab() === 'items') {
            <ng-container actions>
              <a grButton variant="secondary" [href]="'/' + (comps.current()?.slug ?? '') + '/sorteo'" target="_blank" rel="noopener">Ver en la web</a>
              @if (puede()) { <button grButton variant="primary" (click)="nuevo()">Nuevo item</button> }
            </ng-container>
          }
        </bo-page-header>
      }
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Rifa">
        @for (t of tabs; track t.v) {
          @let on = editando() ? t.v === 'config' : tab() === t.v;
          <button type="button" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
            [class]="on ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="on ? 'page' : null" (click)="ir(t.v)">
            {{ t.l }}@if (t.v === 'items' && its) { <span class="flex h-5 items-center rounded-xs px-1.5 text-mono-xs" [class]="on ? 'bg-accent/20 text-accent-text' : 'bg-bg-raised'">{{ its.length }}</span> }
            @if (on) { <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span> }
          </button>
        }
      </nav>

      @if (its === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar la rifa"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (its === undefined || !c) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (editando()) { <ng-container *ngTemplateOutlet="editor" /> }
      @else if (tab() === 'ganadores') { <ng-container *ngTemplateOutlet="ganadores" /> }
      @else if (tab() === 'historial') { <ng-container *ngTemplateOutlet="historialT" /> }
      @else { <ng-container *ngTemplateOutlet="lista" /> }
    </div>

    <ng-template #fila let-it let-i="i" let-modo="modo">
      <div class="flex min-h-[72px] items-center gap-3 rounded-md border bg-bg-card/60 py-2 pr-3 pl-2 transition-colors hover:border-line-strong motion-reduce:transition-none"
        [class]="it.visible ? 'border-line-subtle' : 'border-line-subtle opacity-55'">
        @if (modo === 'l') {
          <button type="button" cdkDragHandle class="flex h-11 w-7 shrink-0 cursor-grab items-center justify-center text-text-tertiary disabled:cursor-default focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [disabled]="!puede()"
            [attr.aria-label]="'Mover ' + it.nombre + ' (flechas arriba/abajo)'" [attr.data-mover]="it.id" (keydown)="teclaMover($event, i)"><gr-icon name="grip" [size]="16" /></button>
        }
        <div class="h-[52px] w-[88px] shrink-0 overflow-hidden rounded-sm bg-gradient-to-br from-[#5a0f1d] to-[#1c1416]">
          @if (it.imagenUrl) { <img [src]="it.imagenUrl" alt="" class="h-full w-full object-cover" loading="lazy" /> }
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-label-m text-text-primary">{{ i + 1 }} · {{ it.nombre }}</p>
          <p class="truncate text-body-xs text-text-tertiary">{{ modo === 'g' ? metaGanador(it) : meta(it) }}</p>
        </div>
        @if (modo === 'g') {
          @if (!it.visible) { <span class="flex h-8 shrink-0 items-center gap-1.5 rounded-pill border border-line-subtle px-3 text-label-s text-text-tertiary"><gr-icon name="pencil" [size]="14" />—</span> }
          @else if (it.ganador) { <button type="button" class="flex h-8 shrink-0 items-center gap-1.5 rounded-pill bg-warning/14 px-3 text-label-s text-warning hover:bg-warning/24" (click)="abrirGanador(it)"><gr-icon name="circle-alert" [size]="14" />Registrado</button> }
          @else { <button type="button" class="flex h-8 shrink-0 items-center gap-1.5 rounded-pill bg-success/14 px-3 text-label-s text-success hover:bg-success/24 disabled:opacity-40" [disabled]="!puede()" [attr.aria-label]="'Registrar ganador: ' + it.nombre" (click)="abrirGanador(it)"><gr-icon name="circle-check" [size]="14" />Registrar</button> }
        } @else if (it.visible) {
          <span class="hidden h-8 shrink-0 items-center gap-1.5 rounded-pill bg-success/14 px-3 text-label-s text-success sm:flex"><gr-icon name="circle-check" [size]="14" />Visible</span>
        } @else {
          <span class="hidden h-8 shrink-0 items-center gap-1.5 rounded-pill border border-line-subtle px-3 text-label-s text-text-tertiary sm:flex"><gr-icon name="pencil" [size]="14" />Oculto</span>
        }
        <bo-toggle [value]="it.visible" [label]="'Visible en la web: ' + it.nombre" [disabled]="!puede()" (changed)="visibilidad(it, $event)" />
        <button type="button" class="flex size-9 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-raised focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [attr.aria-label]="'Editar ' + it.nombre" (click)="editar(it)"><gr-icon name="more" [size]="18" /></button>
      </div>
    </ng-template>

    <ng-template #lista>
      @let its = items() ?? []; @let c = cfg()!;
      <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_376px]">
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
          <h2 class="text-ui-h5">Items de la rifa</h2>
          <p class="mt-2 text-body-s text-text-tertiary">Arrastra ⠿ (o usa las flechas con el foco en ⠿) para cambiar el orden. Ocultar quita el item de /sorteo sin borrarlo.</p>
          @if (!its.length) {
            <gr-empty icon="gift" title="Aún no hay items" class="mt-4">@if (puede()) { <button grButton variant="primary" (click)="nuevo()">Nuevo item</button> }</gr-empty>
          } @else {
            <div class="mt-4 flex flex-col gap-4" cdkDropList [cdkDropListDisabled]="!puede()" (cdkDropListDropped)="mover($event)">
              @for (it of its; track it.id; let i = $index) {
                <div cdkDrag [cdkDragLockAxis]="'y'"><ng-container *ngTemplateOutlet="fila; context: { $implicit: it, i, modo: 'l' }" /></div>
              }
            </div>
          }
        </section>
        <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
          <div><h2 class="text-ui-h5">Rifa en efectivo</h2>
            <p class="mt-2 text-body-s text-text-tertiary">Se muestra en el hero de /sorteo. No hay venta online: sin pasarela ni compradores web.</p></div>
          <gr-field label="Precio del boleto (efectivo)" for="r-precio" [hint]="(c.precioBoletoEfectivoCents > 0 ? euros(c.precioBoletoEfectivoCents) + ' · ' : '') + 'Importe en euros, se cobra en el stand'" [error]="errPrecio()">
            <input grInput id="r-precio" type="number" min="0.01" step="0.5" [ngModel]="c.precioBoletoEfectivoCents / 100" (ngModelChange)="precio($event)" [disabled]="!puede()" /></gr-field>
          <gr-field label="Lugar de venta" for="r-lugar" hint="Dónde se compran los boletos"><input grInput id="r-lugar" [(ngModel)]="c.lugar" maxlength="160" [disabled]="!puede()" /></gr-field>
          <gr-field label="Horario de venta" for="r-horario" hint="Texto libre"><input grInput id="r-horario" [(ngModel)]="c.horario" maxlength="160" [disabled]="!puede()" /></gr-field>
          <gr-field label="Fecha del sorteo" for="r-fecha" [hint]="c.fechaSorteo ? fechaLarga(c.fechaSorteo) : 'dd/mm/aaaa hh:mm · sorteo presencial en el recinto'" [error]="errFecha()">
            <input grInput id="r-fecha" inputmode="numeric" placeholder="20/12/2026 21:00" [ngModel]="aLocal(c.fechaSorteo)" (ngModelChange)="fecha($event)" [disabled]="!puede()" /></gr-field>
          <gr-field label="Texto informativo" for="r-texto" hint="Párrafo bajo el título del hero"><textarea grInput id="r-texto" rows="2" [(ngModel)]="c.textoInfo" maxlength="600" [disabled]="!puede()"></textarea></gr-field>
          <div class="mt-2 flex items-center justify-between gap-4">
            <div><p class="text-label-m">Rifa visible en la web</p><p class="text-body-xs text-text-tertiary">Publica el escaparate en /sorteo</p></div>
            <bo-toggle [(value)]="c.visible" label="Rifa visible en la web" [disabled]="!puede()" />
          </div>
          @if (puede()) { <div><button grButton variant="primary" [loading]="guardando()" (click)="guardarConfig()">Guardar configuración</button></div> }
        </section>
      </div>
    </ng-template>
    <ng-template #editor>
      @let f = form;
      <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
          <h2 class="text-ui-h5">Datos del item</h2>
          <label class="flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border px-4 text-center transition-colors focus-within:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
            [class]="f.imagenUrl ? 'border-success/70' : 'border-dashed border-line-strong hover:border-text-tertiary'">
            <span class="flex size-10 items-center justify-center rounded-sm" [class]="f.imagenUrl ? 'bg-success/14 text-success' : 'bg-bg-raised text-text-tertiary'">
              <gr-icon [name]="subiendo() ? 'loader' : f.imagenUrl ? 'circle-check' : 'upload'" [size]="18" [class.animate-spin]="subiendo()" /></span>
            <span class="text-label-m">{{ f.imagenUrl ? (subido() || archivo(f.imagenUrl)) + ' · subida a BunnyCDN' : 'Subir foto del item' }}</span>
            <span class="text-body-xs text-text-tertiary">.jpg .png .webp · máx. 10 MB</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="subir($event)" [disabled]="!puede() || subiendo()" />
          </label>
          <gr-field label="Nombre" for="i-nombre" hint="Obligatorio · máx. 80 caracteres" [error]="errNombre()"><input grInput id="i-nombre" [(ngModel)]="f.nombre" maxlength="80" required [disabled]="!puede()" /></gr-field>
          <gr-field label="Descripción" for="i-desc" hint="Se muestra en la tarjeta del escaparate"><input grInput id="i-desc" [(ngModel)]="f.descripcion" maxlength="400" [disabled]="!puede()" /></gr-field>
          <gr-field label="Valor estimado (opcional)" for="i-valor" hint="Vacío = no se muestra">
            <input grInput id="i-valor" type="number" min="0" [ngModel]="f.valorEstimadoCents === null ? null : f.valorEstimadoCents / 100" (ngModelChange)="f.valorEstimadoCents = $event === null || $event === '' ? null : cents($event)" [disabled]="!puede()" /></gr-field>
          <gr-field label="Donante / patrocinador (opcional)" for="i-donante" hint="Vacío = no se muestra"><input grInput id="i-donante" [ngModel]="f.donante ?? ''" (ngModelChange)="f.donante = $event || null" maxlength="120" [disabled]="!puede()" /></gr-field>
          <gr-field label="Unidades" for="i-uds" hint="Nº de unidades que se rifan de este objeto"><input grInput id="i-uds" type="number" min="1" max="999" [(ngModel)]="f.unidades" [disabled]="!puede()" /></gr-field>
          <div class="mt-2 flex items-center justify-between gap-4">
            <div><p class="text-label-m">Visible en la web</p><p class="text-body-xs text-text-tertiary">Si lo desactivas, el item queda oculto en /sorteo</p></div>
            <bo-toggle [(value)]="f.visible" label="Visible en la web" [disabled]="!puede()" />
          </div>
          <div class="flex gap-3"><button grButton (click)="cerrarEditor()">Cancelar</button>
            @if (puede()) { <button grButton variant="primary" [loading]="guardando()" (click)="guardarItem()">Guardar item</button> }</div>
        </section>
        <section class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-6">
          <h2 class="text-ui-h5">Vista previa en /sorteo</h2>
          <article class="overflow-hidden rounded-md border border-line-subtle bg-bg-raised/40">
            <div class="aspect-[16/10] bg-gradient-to-br from-[#5a0f1d] to-[#1c1416]">@if (f.imagenUrl) { <img [src]="f.imagenUrl" alt="" class="h-full w-full object-cover" /> }</div>
            <div class="flex flex-col gap-2 p-5">
              <h3 class="text-ui-h5">{{ f.nombre || 'Nombre del item' }}</h3>
              @if (f.descripcion) { <p class="text-body-s text-text-secondary">{{ f.descripcion }}</p> }
              <div class="flex flex-wrap items-center gap-3"><gr-badge tone="accent">× {{ f.unidades }} {{ f.unidades === 1 ? 'unidad' : 'unidades' }}</gr-badge>
                @if (f.valorEstimadoCents !== null) { <span class="text-body-s">Valor aprox. {{ eurosCorto(f.valorEstimadoCents) }}</span> }</div>
              @if (f.donante) { <p class="text-body-s text-text-tertiary">Donado por {{ f.donante }}</p> }
            </div>
          </article>
          <p class="text-body-xs text-text-tertiary">Valor y donante se ocultan si están vacíos.</p>
        </section>
      </div>
    </ng-template>

    <ng-template #ganadores>
      @let its = items() ?? [];
      <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
          <h2 class="text-ui-h5">Ganador por item</h2>
          @if (!its.length) { <gr-empty icon="gift" title="Aún no hay items" class="mt-4" /> }
          <div class="mt-4 flex flex-col gap-4">
            @for (it of its; track it.id; let i = $index) { <ng-container *ngTemplateOutlet="fila; context: { $implicit: it, i, modo: 'g' }" /> }
          </div>
        </section>
        @if (gItem(); as g) {
          <section class="flex flex-col gap-4 rounded-lg border border-line-strong bg-bg-card p-6 shadow-[0_12px_32px_rgb(0_0_0/0.4)]" role="dialog" aria-labelledby="g-title">
            <div class="flex items-start justify-between gap-3"><h2 id="g-title" class="text-ui-h5">Registrar ganador · {{ g.nombre }}</h2>
              <button type="button" class="flex size-9 items-center justify-center rounded-sm hover:bg-bg-raised" aria-label="Cerrar" (click)="gItem.set(null)"><gr-icon name="x" [size]="18" /></button></div>
            <gr-field label="Nº de boleto" for="g-boleto"><input grInput id="g-boleto" [(ngModel)]="gf.boleto" maxlength="20" inputmode="numeric" /></gr-field>
            <div class="grid gap-4 sm:grid-cols-2">
              <gr-field label="Nombre (opcional)" for="g-nombre"><input grInput id="g-nombre" [(ngModel)]="gf.nombre" maxlength="80" /></gr-field>
              <gr-field label="Nota interna" for="g-nota"><input grInput id="g-nota" [(ngModel)]="gf.nota" maxlength="200" /></gr-field>
            </div>
            <div class="flex flex-wrap justify-end gap-3">
              @if (g.ganador) { <button grButton variant="ghost" [disabled]="guardando()" (click)="guardarGanador(true)">Quitar ganador</button> }
              <button grButton variant="ghost" (click)="gItem.set(null)">Cancelar</button>
              <button grButton variant="primary" [loading]="guardando()" [disabled]="!gf.boleto.trim()" (click)="guardarGanador()">Guardar ganador</button>
            </div>
          </section>
        }
      </div>
    </ng-template>

    <ng-template #historialT>
      @let h = historial();
      <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
        <h2 class="text-ui-h5">Historial de ganadores</h2>
        @if (h === undefined) { <gr-skeleton class="mt-4 h-40 rounded-md" /> }
        @else if (!h?.length) { <gr-empty icon="gift" title="Aún no se ha registrado ningún ganador" class="mt-4" /> }
        @else {
          <ul class="mt-4 flex flex-col divide-y divide-line-subtle">
            @for (x of h; track $index) {
              <li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <p class="min-w-0 text-label-m">{{ x.itemNombre }} · <span class="text-text-secondary">{{ x.boleto ? 'boleto nº ' + x.boleto + (x.nombre ? ' · ' + x.nombre : '') : 'ganador quitado' }}</span></p>
                <p class="text-body-xs text-text-tertiary">{{ fechaHora(x.at) }} · {{ x.actor }}</p>
              </li>
            }
          </ul>
        }
      </section>
    </ng-template>
  `,
})
export class SorteoPage {
  private readonly api = inject(RifaApi);
  private readonly auth = inject(Auth);
  private readonly media = inject(Media);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly comps = inject(Competitions);
  protected readonly eurosCorto = eurosCorto;
  protected readonly euros = euros;
  protected readonly fechaHora = fechaHora;
  protected readonly fechaLarga = fechaSorteo;
  protected readonly aLocal = aLocal;
  protected readonly tabs: { v: Tab; l: string }[] = [{ v: 'items', l: 'Items' }, { v: 'config', l: 'Configuración' }, { v: 'ganadores', l: 'Ganadores' }, { v: 'historial', l: 'Historial' }];
  protected readonly items = signal<RifaItem[] | null | undefined>(undefined);
  protected readonly cfg = signal<RifaConfig | null>(null);
  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || 'items');
  /** Item being edited (`{ id: '' }` = new). */
  protected readonly editando = signal<{ id: string } | null>(null);
  protected readonly guardando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly errNombre = signal<string | null>(null);
  protected readonly errPrecio = signal<string | null>(null);
  protected readonly errFecha = signal<string | null>(null);
  protected readonly subido = signal('');
  protected readonly historial = signal<RifaHistorial[] | null | undefined>(undefined);
  protected readonly gItem = signal<RifaItem | null>(null);
  protected form: RifaItemIn = vacio();
  protected gf = { boleto: '', nombre: '', nota: '' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'sorteo.gestionar'));
  protected readonly crumbs = computed(() => [this.comps.current()?.nombreCorto || '', 'Público', 'Rifa']);
  protected readonly subtitulo = computed(() => {
    const its = this.items(), c = this.cfg();
    if (!its || !c) return '';
    if (this.tab() === 'ganadores') return 'Opcional · el sorteo es presencial: aquí solo se registra qué boleto ganó cada item para publicarlo en /sorteo.';
    if (this.tab() === 'historial') return 'Ganadores registrados o quitados, con la fecha y quién lo hizo.';
    const vis = its.filter((x) => x.visible).length;
    return `Rifa presencial en efectivo · ${its.length} items (${vis} visibles)` + (c.fechaSorteo ? ` · sorteo ${fechaSorteo(c.fechaSorteo)}` : '') + (c.lugar ? ' en el recinto' : '');
  });
  private t: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => {
        void this.cargar();
        if (this.tab() === 'historial') void this.cargarHistorial();
      });
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (!e.tipo.startsWith('rifa.') || this.guardando()) return;
      clearTimeout(this.t);
      this.t = setTimeout(() => void this.cargar(e.tipo === 'rifa.config_actualizada'), 600);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.t);
      sub.unsubscribe();
    });
  }

  async cargar(conConfig = true): Promise<void> {
    try {
      const [its, c] = await Promise.all([this.api.items(this.cid()), conConfig || !this.cfg() ? this.api.config(this.cid()) : Promise.resolve(this.cfg()!)]);
      this.items.set(its);
      this.cfg.set({ ...c });
    } catch {
      if (!this.items()) this.items.set(null);
    }
  }
  protected ir(t: Tab): void {
    this.editando.set(null);
    this.gItem.set(null);
    this.errFecha.set(null);
    if (t === 'config') return this.editarPrimero();
    this.tab.set(t);
    if (t === 'historial') void this.cargarHistorial();
    void this.router.navigate([], { queryParams: { tab: t === 'items' ? null : t }, replaceUrl: true });
  }
  private async cargarHistorial(): Promise<void> {
    this.historial.set(undefined);
    try { this.historial.set(await this.api.historial(this.cid())); } catch (e) { this.historial.set(null); this.toasts.error(errText(e, 'No se pudo cargar el historial.')); }
  }
  protected precio(v: unknown): void {
    this.cfg()!.precioBoletoEfectivoCents = v === null || v === '' ? NaN : Math.round(Number(v) * 100);
    this.errPrecio.set(null);
  }
  protected fecha(v: string): void {
    const iso = deLocal(v);
    this.errFecha.set(iso === undefined ? 'Usa el formato dd/mm/aaaa hh:mm (24 h).' : null);
    if (iso !== undefined) this.cfg()!.fechaSorteo = iso;
  }
  protected teclaMover(ev: KeyboardEvent, i: number): void {
    const d = ev.key === 'ArrowUp' ? -1 : ev.key === 'ArrowDown' ? 1 : 0;
    const its = this.items() ?? [];
    if (!d || i + d < 0 || i + d >= its.length) return;
    ev.preventDefault();
    const id = its[i].id;
    void this.mover({ previousIndex: i, currentIndex: i + d } as CdkDragDrop<unknown>).then(() => document.querySelector<HTMLElement>(`[data-mover="${id}"]`)?.focus());
  }
  private editarPrimero(): void {
    const f = this.items()?.[0];
    if (f) this.editar(f);
    else this.nuevo();
  }
  protected posicion(id: string): number { return this.items()?.findIndex((x) => x.id === id) ?? -1; }
  protected cents(v: unknown): number { return Math.max(0, Math.round(Number(v || 0) * 100)); }
  protected archivo(url: string): string { return decodeURIComponent(url.split('/').pop() ?? url); }
  protected meta(it: RifaItem): string {
    const p = [`× ${it.unidades} ${it.unidades === 1 ? 'ud' : 'uds'}`];
    if (it.valorEstimadoCents !== null) p.push('valor aprox. ' + eurosCorto(it.valorEstimadoCents));
    if (it.donante) p.push('donado por ' + it.donante);
    if (!it.imagenUrl) p.push('sin foto');
    return p.join(' · ');
  }
  protected metaGanador(it: RifaItem): string {
    if (!it.visible) return 'Oculto · no se sortea';
    return it.ganador ? `Boleto nº ${it.ganador.boleto}` + (it.ganador.nombre ? ` · ${it.ganador.nombre}` : '') : 'Sin ganador';
  }
  protected nuevo(): void {
    this.form = vacio();
    this.subido.set('');
    this.errNombre.set(null);
    this.editando.set({ id: '' });
  }
  protected editar(it: RifaItem): void {
    const { nombre, descripcion, imagenUrl, valorEstimadoCents, donante, unidades, visible } = it;
    this.form = { nombre, descripcion, imagenUrl, valorEstimadoCents, donante, unidades, visible };
    this.subido.set('');
    this.errNombre.set(null);
    this.editando.set({ id: it.id });
  }
  protected cerrarEditor(): void { this.editando.set(null); }
  private item(id: string): RifaItem | undefined { return this.items()?.find((x) => x.id === id); }

  /** Runs a change that returns the new list; keeps the screen state on error. */
  private async cambio(fn: () => Promise<RifaItem[]>, ok?: string): Promise<boolean> {
    this.guardando.set(true);
    try {
      this.items.set(await fn());
      if (ok) this.toasts.success(ok);
      return true;
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar.'));
      void this.cargar(false);
      return false;
    } finally {
      this.guardando.set(false);
    }
  }
  protected async guardarItem(): Promise<void> {
    const f = { ...this.form, nombre: this.form.nombre.trim(), unidades: Math.max(1, Math.round(Number(this.form.unidades) || 1)) };
    if (!f.nombre) return this.errNombre.set('Pon un nombre al item.');
    this.errNombre.set(null);
    const e = this.editando();
    const it = e?.id ? this.item(e.id) : undefined;
    const ok = await this.cambio(() => (it ? this.api.editar(this.cid(), it, f) : this.api.crear(this.cid(), f)), 'Item guardado');
    if (ok) this.editando.set(null);
  }
  protected async borrar(): Promise<void> {
    const it = this.item(this.editando()?.id ?? '');
    if (!it) return;
    const ok = await this.confirm.ask({ title: '¿Eliminar el item?', text: `«${it.nombre}» desaparece de la rifa y de /sorteo. Si solo quieres esconderlo, desactiva «Visible en la web».`, confirm: 'Eliminar' });
    if (ok && (await this.cambio(() => this.api.borrar(this.cid(), it), 'Item eliminado'))) this.editando.set(null);
  }
  protected async visibilidad(it: RifaItem, visible: boolean): Promise<void> {
    const { nombre, descripcion, imagenUrl, valorEstimadoCents, donante, unidades } = it;
    await this.cambio(() => this.api.editar(this.cid(), it, { nombre, descripcion, imagenUrl, valorEstimadoCents, donante, unidades, visible }));
  }
  protected async mover(ev: CdkDragDrop<unknown>): Promise<void> {
    const its = [...(this.items() ?? [])];
    if (ev.previousIndex === ev.currentIndex) return;
    moveItemInArray(its, ev.previousIndex, ev.currentIndex);
    this.items.set(its);
    await this.cambio(() => this.api.orden(this.cid(), its.map((x) => x.id)));
  }
  protected async subir(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return void this.toasts.error('La foto pesa más de 10 MB.');
    this.subiendo.set(true);
    try { this.form.imagenUrl = await this.media.upload(file, this.form.nombre); this.subido.set(file.name); } catch (e) { this.toasts.error(errText(e, 'No se pudo subir la foto.')); } finally { this.subiendo.set(false); }
  }
  protected async guardarConfig(): Promise<void> {
    const c = this.cfg();
    if (!c) return;
    if (!(c.precioBoletoEfectivoCents > 0)) return void this.errPrecio.set('Pon un precio mayor que 0 €.');
    if (this.errFecha()) return;
    this.guardando.set(true);
    try {
      this.cfg.set(await this.api.guardarConfig(this.cid(), c));
      this.toasts.success('Configuración guardada');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar la configuración.'));
    } finally {
      this.guardando.set(false);
    }
  }
  protected abrirGanador(it: RifaItem): void {
    this.gf = { boleto: it.ganador?.boleto ?? '', nombre: it.ganador?.nombre ?? '', nota: it.ganador?.nota ?? '' };
    this.gItem.set(it);
  }
  protected async guardarGanador(quitar = false): Promise<void> {
    const it = this.gItem();
    if (!it) return;
    if (quitar && !(await this.confirm.ask({ title: '¿Quitar el ganador?', text: `«${it.nombre}» vuelve a quedar sin ganador. Queda registrado en el historial.`, confirm: 'Quitar ganador' }))) return;
    const g = quitar ? { boleto: '' } : { boleto: this.gf.boleto.trim(), nombre: this.gf.nombre.trim(), nota: this.gf.nota.trim() };
    if (await this.cambio(() => this.api.ganador(this.cid(), it.id, g), quitar ? 'Ganador quitado' : 'Ganador guardado')) {
      this.gItem.set(null);
      void this.cargarHistorial();
    }
  }
}
