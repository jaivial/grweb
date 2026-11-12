import { NgTemplateOutlet } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { GrIcon, type GrIconName } from '@grcup/ui';

let seq = 0;

/** Figma 48 «BO / Tooltip»: #3a3234 r8, 12 Regular; optional key hint. Shows on hover and focus of the wrapped control. */
@Component({
  selector: 'bo-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'group/tt relative inline-flex' },
  template: `
    <ng-content />
    <span role="tooltip" [id]="id" class="pointer-events-none absolute top-full left-1/2 z-40 mt-2 flex -translate-x-1/2 items-center gap-2 rounded-sm bg-bg-tooltip px-2.5 py-1.5 text-body-xs whitespace-nowrap text-text-primary opacity-0 shadow-[0_8px_24px_rgb(0_0_0/0.4)] transition-opacity group-focus-within/tt:opacity-100 group-hover/tt:opacity-100 motion-reduce:transition-none">
      {{ text() }}@if (kbd()) { <kbd class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs text-text-tertiary">{{ kbd() }}</kbd> }
    </span>
  `,
})
export class BoTooltip implements AfterViewInit {
  readonly text = input.required<string>();
  readonly kbd = input('');
  protected readonly id = `bo-tt-${++seq}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  ngAfterViewInit(): void {
    this.host.querySelector('a, button, input, select, textarea, [tabindex]')?.setAttribute('aria-describedby', this.id);
  }
}

export interface BoMenuItem {
  id: string;
  label: string;
  icon: GrIconName;
  /** Destructive: rendered last, after a separator, in red. */
  danger?: boolean;
}

/** Figma 48 «BO / Menu»: row actions / user menu (r12 raised, 36 px rows); destructive items go last, separated, in red. */
@Component({
  selector: 'bo-menu',
  imports: [GrIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-60 flex-col rounded-md border border-line-strong bg-bg-raised p-1 shadow-[0_12px_32px_rgb(0_0_0/0.5)]', role: 'menu', '(keydown)': 'key($event)' },
  template: `
    <ng-content select="[menuHeader]" />
    @for (i of safe(); track i.id) { <ng-container *ngTemplateOutlet="row; context: { $implicit: i }" /> }
    @if (danger().length) { <span class="my-1 h-px bg-line-subtle" role="separator"></span> }
    @for (i of danger(); track i.id) { <ng-container *ngTemplateOutlet="row; context: { $implicit: i }" /> }
    <ng-template #row let-i>
      <button type="button" role="menuitem" (click)="pick.emit(i.id)"
        class="flex h-11 items-center gap-2 rounded-xs px-2 text-left text-body-s hover:bg-bg-hover focus-visible:bg-bg-hover focus-visible:outline-none md:h-9"
        [class]="i.danger ? 'text-error' : 'text-text-secondary'">
        <gr-icon [name]="i.icon" [size]="16" [class]="i.danger ? 'text-error' : 'text-text-tertiary'" />{{ i.label }}
      </button>
    </ng-template>
  `,
})
export class BoMenu {
  readonly items = input.required<BoMenuItem[]>();
  readonly pick = output<string>();
  protected readonly safe = computed(() => this.items().filter((i) => !i.danger));
  protected readonly danger = computed(() => this.items().filter((i) => i.danger));
  protected key(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]')];
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length]?.focus();
  }
}

export type BoApi = 'REST' | 'SSE' | 'WEBHOOK' | 'JOB' | 'HUB';
const API: Record<BoApi, string> = {
  REST: 'text-info border-info/60',
  SSE: 'text-live border-live/60',
  WEBHOOK: 'text-[#f472b6] border-[#f472b6]/60',
  JOB: 'text-text-tertiary border-text-tertiary/60',
  HUB: 'text-[#c084fc] border-[#c084fc]/60',
};

/** Figma 48 «BO / API type»: endpoint kind in annotations, 72×22 r6 outline, mono. */
@Component({
  selector: 'bo-api-type',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex h-[22px] w-[72px] items-center justify-center rounded-xs border text-mono-xs " + cls()' },
  template: `{{ type() }}`,
})
export class BoApiType {
  readonly type = input.required<BoApi>();
  protected readonly cls = computed(() => API[this.type()]);
}

const PILL = 'inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-label-s whitespace-nowrap';
export type BoLive = 'connected' | 'reconnecting' | 'offline' | 'paused';
const LIVE: Record<BoLive, [GrIconName, string, string]> = {
  connected: ['radio', 'En directo', 'border-success/40 bg-success/12 text-success'],
  reconnecting: ['loader', 'Reconectando…', 'border-warning/40 bg-warning/12 text-warning'],
  offline: ['wifi-off', 'Sin conexión', 'border-error/40 bg-error/12 text-error'],
  paused: ['pause', 'Pausado', 'border-text-tertiary/40 bg-text-tertiary/12 text-text-tertiary'],
};

/** Figma 48 «BO / Live status»: state of the admin SSE stream (\`GET …/stream\`); \`viewers\` = live «espectadores». */
@Component({
  selector: 'bo-live-status',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"border " + cls()', role: 'status' },
  template: `<gr-icon [name]="l()[0]" [size]="14" [spin]="status() === 'reconnecting'" />{{ l()[1] }}@if (status() === 'connected' && viewers() !== null) { · {{ viewers() }} }`,
})
export class BoLiveStatus {
  readonly status = input<BoLive>('connected');
  readonly viewers = input<number | null>(null);
  protected readonly l = computed(() => LIVE[this.status()]);
  protected readonly cls = computed(() => `${PILL} ${this.l()[2]}`);
}

export type BoPublish = 'draft' | 'pending' | 'scheduled' | 'publishing' | 'published' | 'error';
const PUB: Record<BoPublish, [GrIconName, string, string]> = {
  draft: ['pencil', 'Borrador', 'bg-text-tertiary/12 text-text-tertiary'],
  pending: ['circle-alert', 'Cambios sin publicar', 'bg-warning/12 text-warning'],
  scheduled: ['clock', 'Programado', 'bg-info/12 text-info'],
  publishing: ['loader', 'Publicando…', 'bg-info/12 text-info'],
  published: ['circle-check', 'Publicado', 'bg-success/12 text-success'],
  error: ['circle-x', 'Error al publicar', 'bg-error/12 text-error'],
};

/** Figma 48 «BO / Publish status»: content publication state (pill, no border). \`when\` completes «Programado · 12 jun 10:00». */
@Component({
  selector: 'bo-publish-status',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'cls()', role: 'status' },
  template: `<gr-icon [name]="p()[0]" [size]="14" [spin]="status() === 'publishing'" />{{ p()[1] }}@if (status() === 'scheduled' && when()) { · {{ when() }} }`,
})
export class BoPublishStatus {
  readonly status = input<BoPublish>('draft');
  readonly when = input('');
  protected readonly p = computed(() => PUB[this.status()]);
  protected readonly cls = computed(() => `${PILL} ${this.p()[2]}`);
}
