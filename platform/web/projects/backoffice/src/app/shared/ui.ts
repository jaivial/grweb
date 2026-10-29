import { A11yModule } from '@angular/cdk/a11y';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injectable, computed, inject, input, model, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrBadge, GrButton, GrIcon, GrIconButton, type GrTone } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { problemOf } from '../core/api';

/** Page header with breadcrumbs, title, status badge and actions (Figma «BO / Page header»). */
@Component({
  selector: 'bo-page-header',
  imports: [GrBadge, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <nav class="flex flex-wrap items-center gap-1.5 text-body-xs text-text-tertiary" aria-label="Migas">
      @for (c of crumbs(); track $index; let last = $last) {
        <span [class.text-text-secondary]="last">{{ c }}</span>@if (!last) { <gr-icon name="chevron-right" [size]="12" /> }
      }
    </nav>
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <h1 class="text-ui-h3 md:text-[28px]">{{ title() }}</h1>
        @if (badge()) { <gr-badge [tone]="badgeTone()">{{ badge() }}</gr-badge> }
      </div>
      <div class="flex flex-wrap gap-2"><ng-content select="[actions]" /></div>
    </div>
    @if (subtitle()) { <p class="-mt-1 text-body-s text-text-tertiary">{{ subtitle() }}</p> }
  `,
})
export class BoPageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly crumbs = input<string[]>([]);
  readonly badge = input('');
  readonly badgeTone = input<GrTone>('warning');
}

export interface BoTab {
  label: string;
  path: string;
  count?: number | null;
}

/** Router tabs with optional counters (Figma «BO / Tab»). Scrolls horizontally on mobile. */
@Component({
  selector: 'bo-tabs',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block overflow-x-auto border-b border-line-subtle [scrollbar-width:none]' },
  template: `
    <nav class="flex min-w-max gap-1" aria-label="Secciones">
      @for (t of tabs(); track t.path) {
        <a [routerLink]="t.path" routerLinkActive #a="routerLinkActive" [routerLinkActiveOptions]="{ exact: false }" [attr.aria-current]="a.isActive ? 'page' : null"
          class="relative flex h-11 items-center gap-2 px-3 text-label-s whitespace-nowrap transition-colors"
          [class]="a.isActive ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
          {{ t.label }}
          @if (t.count !== undefined && t.count !== null) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs text-text-secondary">{{ t.count }}</span> }
          @if (a.isActive) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
        </a>
      }
    </nav>
  `,
})
export class BoTabs {
  readonly tabs = input.required<BoTab[]>();
}

/** Switch (Figma «BO / Toggle»), 44 px touch target. */
@Component({
  selector: 'bo-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" role="switch" [attr.aria-checked]="value()" [attr.aria-label]="label()" [disabled]="disabled()" (click)="flip()"
      class="flex h-11 w-12 items-center justify-center disabled:opacity-40">
      <span class="relative h-6 w-10 rounded-pill transition-colors" [class]="value() ? 'bg-accent' : 'bg-line-strong'">
        <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]" [style.left.px]="value() ? 18 : 2"></span>
      </span>
    </button>
  `,
})
export class BoToggle {
  readonly value = model(false);
  readonly label = input('');
  readonly disabled = input(false);
  readonly changed = output<boolean>();
  protected flip(): void {
    this.value.update((v) => !v);
    this.changed.emit(this.value());
  }
}

/** Right-side drawer (Figma «BO / Drawer»): full screen on mobile, 480 px on desktop, focus trapped, Escape closes. */
@Component({
  selector: 'bo-drawer',
  imports: [A11yModule, GrIconButton, GrBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'open() && close()' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-40 bg-black/60" (click)="close()"></div>
      <aside class="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line-strong bg-bg-card shadow-card sm:w-[480px]" role="dialog" aria-modal="true" [attr.aria-label]="title()" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
        <header class="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
          <h2 class="min-w-0 flex-1 truncate text-ui-h5">{{ title() }}</h2>
          @if (badge()) { <gr-badge tone="warning">{{ badge() }}</gr-badge> }
          <button grIconButton icon="x" label="Cerrar" (click)="close()"></button>
        </header>
        <div class="flex-1 overflow-y-auto px-5 py-5"><ng-content /></div>
        <footer class="flex flex-wrap justify-end gap-2 border-t border-line-subtle px-5 py-4"><ng-content select="[drawerActions]" /></footer>
      </aside>
    }
  `,
})
export class BoDrawer {
  readonly open = model(false);
  readonly title = input('');
  readonly badge = input('');
  close(): void {
    this.open.set(false);
  }
}

export interface ConfirmRequest {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

/** Confirmation dialog (Figma «BO / Modal»): `await confirm.ask({...})`. */
@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly current = signal<ConfirmRequest | null>(null);
  ask(r: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    return new Promise((resolve) => this.current.set({ ...r, resolve }));
  }
  answer(ok: boolean): void {
    this.current()?.resolve(ok);
    this.current.set(null);
  }
}

@Component({
  selector: 'bo-confirm-host',
  imports: [A11yModule, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (c.current(); as r) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="c.answer(false)" (keydown.escape)="c.answer(false)">
        <div class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="alertdialog" aria-modal="true" [attr.aria-label]="r.title" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <h2 class="text-ui-h5">{{ r.title }}</h2>
          <p class="mt-3 text-body-s text-text-secondary">{{ r.text }}</p>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="c.answer(false)">Cancelar</button>
            <button grButton [variant]="r.danger ? 'danger' : 'primary'" (click)="c.answer(true)">{{ r.confirm }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmHost {
  protected readonly c = inject(Confirm);
}

/** Uploads a file to /medios and returns its public URL. */
@Injectable({ providedIn: 'root' })
export class Media {
  private readonly http = inject(HttpClient);
  private readonly comps = inject(Competitions);
  async upload(file: File, alt = ''): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('alt', alt);
    const r = await firstValueFrom(this.http.post<{ url: string }>(`/api/admin/competiciones/${this.comps.current()?.id}/medios`, fd));
    return r.url;
  }
}

/** Character counter shown under text fields (Figma: «38 / 90»). */
@Component({
  selector: 'bo-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'text-mono-xs', '[class.text-text-muted]': '!over()', '[class.text-accent-text]': 'over()' },
  template: `{{ (value() ?? '').length }} / {{ max() }}`,
})
export class BoCount {
  readonly value = input<string | null | undefined>('');
  readonly max = input.required<number>();
  protected readonly over = computed(() => (this.value() ?? '').length > this.max());
}

export function errText(e: unknown, fallback = 'No se pudo guardar.'): string {
  const p = problemOf(e);
  const field = p.errors?.[0];
  return field ? `${p.detail ?? fallback} (${field.location ?? ''}: ${field.message})` : (p.detail ?? fallback);
}
