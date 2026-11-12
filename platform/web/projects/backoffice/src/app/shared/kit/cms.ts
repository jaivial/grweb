import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { GrBadge, GrIcon, GrIconButton, type GrIconName, type GrTone } from '@grcup/ui';
import { BoToggle } from '../ui';
import { BoPublishStatus } from './status';

export type BoPermiso = 'allow' | 'deny' | 'inherited' | 'locked';
const PERM: Record<BoPermiso, [GrIconName, string, string]> = {
  allow: ['check', 'bg-success/12 text-success', 'Permitido'],
  deny: ['minus', 'text-text-muted', 'Denegado'],
  inherited: ['check', 'border border-dashed border-line-subtle text-text-tertiary', 'Heredado del rol'],
  locked: ['lock', 'text-text-tertiary', 'Bloqueado · Root siempre'],
};

/** Figma 50 «BO / Permission cell»: role × permission matrix cell (identity roles). Click toggles allow/deny; locked = Root. */
@Component({
  selector: 'bo-permission-cell',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [disabled]="value() === 'locked'" (click)="flip()" [attr.aria-label]="p()[2]" [attr.aria-pressed]="value() === 'allow'"
      class="flex h-8 w-11 items-center justify-center rounded-sm transition-colors hover:bg-bg-hover focus-visible:outline-2 focus-visible:outline-accent-text disabled:cursor-not-allowed disabled:hover:bg-transparent motion-reduce:transition-none"
      [class]="p()[1]"><gr-icon [name]="p()[0]" [size]="16" /></button>
  `,
})
export class BoPermissionCell {
  readonly value = model<BoPermiso>('deny');
  readonly changed = output<BoPermiso>();
  protected readonly p = computed(() => PERM[this.value()]);
  protected flip(): void {
    this.value.set(this.value() === 'allow' ? 'deny' : 'allow');
    this.changed.emit(this.value());
  }
}

export type BoConsent = 'confirmed' | 'pending' | 'revoked' | 'expired';
const CONS: Record<BoConsent, [string, GrTone, string]> = {
  confirmed: ['Confirmado', 'success', 'text-text-tertiary'],
  pending: ['Pendiente', 'warning', 'text-warning'],
  revoked: ['Revocado', 'danger', 'text-error'],
  expired: ['Caducado', 'neutral', 'text-text-tertiary'],
};

/** Figma 50 «BO / Consent proof»: RGPD proof of one purpose (crm consentimientos): text version + hash, origin, date, IP. */
@Component({
  selector: 'bo-consent-proof',
  imports: [GrBadge, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2 rounded-md border border-line-subtle bg-bg-card p-4' },
  template: `
    <header class="mb-1 flex items-center justify-between gap-3">
      <h3 class="flex min-w-0 items-center gap-2 text-[14px] font-semibold"><gr-icon name="shield" [size]="16" class="text-text-tertiary" />{{ finalidad() }}</h3>
      <gr-badge [tone]="c()[1]">{{ c()[0] }}</gr-badge>
    </header>
    <dl class="flex flex-col gap-2">
      @for (f of filas(); track f[0]) {
        <div class="flex min-h-[25px] items-center justify-between gap-4"><dt class="shrink-0 text-[12px] text-text-tertiary">{{ f[0] }}</dt>
          <dd class="min-w-0 text-right font-mono text-[11px] font-medium tracking-[0.04em] text-text-secondary uppercase [overflow-wrap:anywhere]">{{ f[1] }}</dd></div>
      }
    </dl>
    <p class="text-[12px] leading-[17px]" [class]="c()[2]">{{ nota() }}</p>
  `,
})
export class BoConsentProof {
  readonly finalidad = input('');
  readonly estado = input<BoConsent>('confirmed');
  readonly texto = input('');
  readonly origen = input('');
  readonly fecha = input('');
  readonly ip = input('');
  readonly nota = input('');
  protected readonly c = computed(() => CONS[this.estado()]);
  protected readonly filas = computed(() => [['Texto aceptado', this.texto()], ['Origen', this.origen()], ['Fecha', this.fecha()], ['IP', this.ip()]]);
}

export type BoPlantilla = 'active' | 'draft' | 'error' | 'paused';
const PLT: Record<BoPlantilla, [string, GrTone, string]> = {
  active: ['Activa', 'success', 'text-text-secondary'],
  draft: ['Borrador', 'neutral', 'text-text-secondary'],
  error: ['Error', 'danger', 'text-error'],
  paused: ['Pausada', 'warning', 'text-text-secondary'],
};

/** Figma 50 «BO / Template card»: email template (messaging plantillas) with thumbnail, trigger and send stats. */
@Component({
  selector: 'bo-template-card',
  imports: [GrBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex flex-col gap-3 rounded-lg border bg-bg-card p-4 transition-colors hover:border-line-hover motion-reduce:transition-none " + (estado() === "error" ? "border-error/50" : "border-line-subtle")' },
  template: `
    <div class="flex h-[120px] flex-col gap-2 rounded-sm border border-line-subtle bg-bg-deep p-3" aria-hidden="true">
      <span class="h-3 w-16 rounded-2xs bg-accent-deep"></span><span class="h-2 w-[200px] max-w-full rounded-2xs bg-line-strong/70"></span>
      <span class="h-2 w-[160px] max-w-full rounded-2xs bg-line-strong/70"></span><span class="mt-1 size-10 rounded-xs bg-line-strong/70"></span>
    </div>
    <div class="flex items-center justify-between gap-2"><h3 class="min-w-0 truncate text-[14px] font-semibold">{{ nombre() }}</h3><gr-badge [tone]="p()[1]">{{ p()[0] }}</gr-badge></div>
    <p class="text-[12px] leading-[17px] text-text-tertiary">{{ disparador() }}</p>
    <p class="text-[12px] leading-[17px]" [class]="p()[2]">{{ detalle() }}</p>
  `,
})
export class BoTemplateCard {
  readonly nombre = input('');
  readonly disparador = input('');
  readonly detalle = input('');
  readonly estado = input<BoPlantilla>('active');
  protected readonly p = computed(() => PLT[this.estado()]);
}

export type BoSeccion = 'visible' | 'hidden' | 'dragging' | 'changed';

/** Figma 50 «BO / Section row»: home section (cms secciones) — drag to reorder, visibility toggle, publish state. */
@Component({
  selector: 'bo-section-row',
  imports: [BoPublishStatus, BoToggle, GrIcon, GrIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex min-h-[72px] items-center gap-3 rounded-md border px-3 py-2.5 transition-colors motion-reduce:transition-none " + (estado() === "dragging" ? "-rotate-1 border-accent bg-bg-raised shadow-[0_12px_32px_rgba(0,0,0,0.5)] motion-reduce:rotate-0" : "border-line-subtle bg-bg-card")' },
  template: `
    <gr-icon name="grip" [size]="16" class="shrink-0 cursor-grab text-text-muted" />
    <span class="hidden h-[52px] w-[88px] shrink-0 rounded-sm bg-gradient-to-br from-accent-deep to-bg-deep sm:block" [class.opacity-50]="estado() === 'hidden'" aria-hidden="true"></span>
    <span class="min-w-0 flex-1" [class.opacity-60]="estado() === 'hidden'">
      <span class="block truncate text-[14px] font-semibold">{{ nombre() }}</span>
      <span class="block truncate text-[12px] leading-[17px] text-text-tertiary">{{ detalle() }}</span>
    </span>
    <span class="hidden md:contents"><bo-publish-status [status]="estado() === 'hidden' ? 'draft' : estado() === 'changed' ? 'pending' : 'published'" /></span>
    <bo-toggle [value]="estado() !== 'hidden'" [label]="'Mostrar ' + nombre()" (changed)="visible.emit($event)" />
    <button grIconButton icon="more" [label]="'Más acciones de ' + nombre()" type="button" (click)="menu.emit($event)"></button>
  `,
})
export class BoSectionRow {
  readonly nombre = input('');
  readonly detalle = input('');
  readonly estado = input<BoSeccion>('visible');
  readonly visible = output<boolean>();
  readonly menu = output<MouseEvent>();
}
