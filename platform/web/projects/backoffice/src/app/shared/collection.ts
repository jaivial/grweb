import { HttpClient } from '@angular/common/http';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrSkeleton, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { Resource } from './resource';
import { BoSchemaForm, pick, type FieldDef } from './schema-form';
import { BoDrawer, Confirm, errText } from './ui';

type Row = { id: string } & Record<string, unknown>;

export interface ColumnDef {
  key: string;
  label: string;
  kind?: 'text' | 'badge' | 'bool' | 'image' | 'mono' | 'date';
  tone?: (r: Row) => GrTone;
  value?: (r: Row) => string;
  hideMobile?: boolean;
}

export interface CollectionConfig {
  title: string;
  subtitle?: string;
  path: string;
  item: string; // «pregunta», «patrocinador»…
  columns: ColumnDef[];
  fields: FieldDef[];
  defaults?: Record<string, unknown>;
  empty: { title: string; text: string };
  reorder?: boolean;
  noCreate?: boolean;
  noDelete?: boolean;
  filterBy?: string;
  perm?: string;
}

/**
 * Generic list + edit drawer for a REST collection (Figma «Web · FAQ», «Web · patrocinadores»…):
 * filter chips, drag to reorder, table on desktop / cards on mobile, empty and error states.
 */
@Component({
  selector: 'bo-collection',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, GrButton, GrIcon, GrBadge, GrEmpty, GrSkeleton, GrAlert, BoDrawer, BoSchemaForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block rounded-lg border border-line-subtle bg-bg-card' },
  template: `
    @let c = config();
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-5 py-4">
      <div>
        <h2 class="text-ui-h5">{{ c.title }} @if (res().items(); as l) { <span class="ml-1 text-mono-s text-text-tertiary">{{ l.length }}</span> }</h2>
        @if (c.subtitle) { <p class="mt-0.5 text-body-xs text-text-tertiary">{{ c.subtitle }}</p> }
      </div>
      @if (!c.noCreate && canEdit()) { <button grButton size="s" icon="plus" (click)="edit(null)">Añadir {{ c.item }}</button> }
    </header>

    @if (c.filterBy && filters().length > 1) {
      <div class="flex flex-wrap gap-2 px-5 pt-4" role="group" aria-label="Filtrar">
        @for (f of filters(); track f.value) {
          <button type="button" (click)="filter.set(f.value)" class="inline-flex h-9 items-center gap-1.5 rounded-pill border px-3 text-label-s"
            [class]="filter() === f.value ? 'border-accent-text bg-accent-deep/30 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">
            {{ f.label }} <span class="text-mono-xs text-text-tertiary">{{ f.count }}</span>
          </button>
        }
      </div>
    }

    @if (res().error()) { <gr-alert class="m-5" tone="danger" title="Error">{{ res().error() }}</gr-alert> }
    @if (res().items() === null) {
      <div class="flex flex-col gap-2 p-5">@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-14" /> }</div>
    } @else if (visible().length === 0) {
      <gr-empty icon="layout" [title]="c.empty.title" [text]="c.empty.text">
        @if (!c.noCreate && canEdit()) { <button grButton size="s" variant="primary" (click)="edit(null)">Añadir {{ c.item }}</button> }
      </gr-empty>
    } @else {
      <ul class="flex flex-col p-2" cdkDropList [cdkDropListDisabled]="!c.reorder || !canEdit() || filter() !== ''" (cdkDropListDropped)="drop($event)">
        @for (r of visible(); track r.id) {
          <li cdkDrag class="group flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-bg-surface">
            @if (c.reorder && canEdit() && filter() === '') {
              <span cdkDragHandle class="flex size-8 cursor-grab items-center justify-center text-text-muted" aria-label="Arrastrar para ordenar"><gr-icon name="menu" [size]="16" /></span>
            }
            <button type="button" class="grid min-w-0 flex-1 items-center gap-x-4 gap-y-1 text-left md:grid-flow-col md:auto-cols-fr" (click)="edit(r)">
              @for (col of c.columns; track col.key; let first = $first) {
                <span class="min-w-0" [class.hidden]="col.hideMobile" [class.md:block]="col.hideMobile">
                  @switch (col.kind) {
                    @case ('badge') { <gr-badge [tone]="col.tone ? col.tone(r) : 'neutral'">{{ val(r, col) }}</gr-badge> }
                    @case ('bool') { <gr-badge [tone]="r[col.key] ? 'success' : 'neutral'">{{ r[col.key] ? 'Sí' : 'No' }}</gr-badge> }
                    @case ('image') { @if (val(r, col)) { <img [src]="val(r, col)" alt="" class="h-10 w-auto max-w-32 rounded-xs object-contain" loading="lazy" /> } }
                    @case ('mono') { <span class="block truncate text-mono-s text-text-secondary">{{ val(r, col) }}</span> }
                    @case ('date') { <span class="block truncate text-body-xs text-text-tertiary">{{ date(val(r, col)) }}</span> }
                    @default { <span class="block truncate" [class]="first ? 'text-label-s text-text-primary' : 'text-body-s text-text-secondary'">{{ val(r, col) }}</span> }
                  }
                </span>
              }
            </button>
            <gr-icon name="chevron-right" [size]="16" class="text-text-muted" />
          </li>
        }
      </ul>
    }

    <bo-drawer [(open)]="drawer" [title]="editing() ? 'Editar ' + c.item : 'Nuevo ' + c.item">
      @if (formError()) { <gr-alert class="mb-4" tone="danger" title="No se pudo guardar">{{ formError() }}</gr-alert> }
      <bo-schema-form [fields]="c.fields" [(value)]="draft" />
      <ng-container drawerActions>
        @if (editing() && !c.noDelete && canEdit()) { <button grButton variant="danger" class="mr-auto" (click)="remove()">Borrar</button> }
        <button grButton variant="ghost" (click)="drawer.set(false)">Cancelar</button>
        @if (canEdit()) { <button grButton variant="primary" [loading]="saving()" (click)="save()">Guardar</button> }
      </ng-container>
    </bo-drawer>
  `,
})
export class BoCollection {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  readonly config = input.required<CollectionConfig>();

  // A signal so the template follows the resource when the competition changes (zoneless, OnPush).
  protected readonly res = signal(new Resource<Row>(inject(HttpClient), ''));
  protected readonly filter = signal('');
  protected readonly drawer = signal(false);
  protected readonly editing = signal<Row | null>(null);
  protected readonly draft = signal<Record<string, unknown>>({});
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, this.config().perm ?? 'web.editar'));

  protected readonly filters = computed(() => {
    const key = this.config().filterBy;
    const items = this.res().items() ?? [];
    if (!key) return [];
    const counts = new Map<string, { label: string; count: number }>();
    // Chip labels: the column's display value, else the select option label, else the capitalised raw value.
    const col = this.config().columns.find((c) => c.key === key);
    const opt = this.config().fields.find((f) => f.clave === key)?.opciones;
    for (const r of items) {
      const v = String(r[key] ?? '');
      const label = (col?.value ? String(col.value(r)) : opt?.find((o) => o.value === v)?.label) || v.charAt(0).toUpperCase() + v.slice(1);
      counts.set(v, { label, count: (counts.get(v)?.count ?? 0) + 1 });
    }
    return [{ value: '', label: 'Todas', count: items.length }, ...[...counts].map(([value, c]) => ({ value, label: c.label, count: c.count }))];
  });
  protected readonly visible = computed(() => {
    const key = this.config().filterBy;
    const items = this.res().items() ?? [];
    return key && this.filter() ? items.filter((r) => String(r[key] ?? '') === this.filter()) : items;
  });

  constructor() {
    effect(() => {
      const cid = this.comps.current()?.id;
      const cfg = this.config();
      if (!cid) return;
      const r = new Resource<Row>(this.http, cfg.path).at(cid);
      this.res.set(r);
      void r.load();
    });
  }

  protected val(r: Row, col: ColumnDef): string {
    return col.value ? col.value(r) : String(r[col.key] ?? '');
  }
  protected date(v: string): string {
    return v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }) : '';
  }

  edit(r: Row | null): void {
    this.editing.set(r);
    this.formError.set('');
    this.draft.set(pick(r, this.config().fields, r ? {} : (this.config().defaults ?? {})));
    this.drawer.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.formError.set('');
    try {
      const r = this.editing();
      if (r) await this.res().update(r.id, this.draft());
      else await this.res().create(this.draft());
      this.drawer.set(false);
      this.toasts.success(r ? 'Cambios guardados' : `${this.config().item[0].toUpperCase()}${this.config().item.slice(1)} creado`);
    } catch (e) {
      this.formError.set(errText(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const r = this.editing();
    if (!r) return;
    const ok = await this.confirm.ask({ title: `¿Borrar este ${this.config().item}?`, text: 'Desaparecerá de la web al momento. Queda registrado en la auditoría.', confirm: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await this.res().remove(r.id);
      this.drawer.set(false);
      this.toasts.success('Borrado');
    } catch (e) {
      this.formError.set(errText(e, 'No se pudo borrar.'));
    }
  }

  protected async drop(e: CdkDragDrop<Row[]>): Promise<void> {
    const ids = (this.res().items() ?? []).map((r) => r.id);
    moveItemInArray(ids, e.previousIndex, e.currentIndex);
    try {
      await this.res().reorder(ids);
    } catch {
      this.toasts.error('No se pudo guardar el orden');
      void this.res().load();
    }
  }
}
